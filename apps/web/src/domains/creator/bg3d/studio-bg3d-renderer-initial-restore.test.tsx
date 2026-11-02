// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { encodeBg3dSceneWithModelsHash } from "../studio-background-3d-model";
import { normalizeStudioBg3dSceneDocument, DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { createSceneGlbFixture, deferredSceneGlb, disposeSceneGlbFixtures } from "./studio-bg3d-scene-glb.test-fixture";
import { useStudioBg3dEditorRestoreEffects } from "./useStudioBg3dEditorRestoreEffects";
import { commitStudioBg3dMeasurementEditorDocument, type StudioBg3dMeasurementEditorHost } from "./studio-bg3d-measurement-editor-host";
import { setStudioBg3dMeasurementUnit } from "./studio-bg3d-measurement";
import { readStudioBg3dSceneMeasurements } from "./studio-bg3d-scene-measurements";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { Bg3dModelHashResolution } from "./bg3d-model-library";
import type { StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dModelRootCacheEntry } from "./studio-bg3d-model-runtime-admission";
import type { StudioBg3dPrimitiveEditRuntime } from "./studio-bg3d-primitive-edit-source";
import type { StudioBg3dModelAttachment, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dMeasurementCommandHost } from "./studio-bg3d-measurement-command";
import type { StudioBg3dCanonicalDocumentMutation } from "./useStudioBg3dCanonicalDocumentState";

const ports = vi.hoisted(() => ({ wait: vi.fn<() => Promise<void>>(),
  resolve: vi.fn<typeof import("./bg3d-model-library")["resolveBg3dModelHashV12"]>(),
  admit: vi.fn<typeof import("./studio-bg3d-model-runtime-admission")["admitAndCacheStudioBg3dModel"]>(), parse: vi.fn() }));
vi.mock("./studio-bg3d-editor-runtime-bindings", async () => {
  const react = await import("react"), document = await import("./studio-bg3d-scene-document"), derivations = await import("./studio-bg3d-editor-derivations");
  const runtime = await import("./studio-bg3d-scene-runtime"), admission = await import("./studio-bg3d-model-runtime-admission"), model = await import("../studio-background-3d-model");
  const removal = await import("./studio-bg3d-scene-removal");
  return { ...react, DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT: document.DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    canonicalSceneDocument: derivations.canonicalSceneDocument, createStudioBg3dHistorySnapshot: derivations.createStudioBg3dHistorySnapshot,
    studioBg3dHistoryDocumentAtView: derivations.studioBg3dHistoryDocumentAtView,
    hydrateStudioBg3dDocumentToRuntime: runtime.hydrateStudioBg3dDocumentToRuntime,
    resolveBg3dModelHash: ports.resolve, admitAndCacheModel: ports.admit,
    attachmentMatchesRecord: admission.attachmentMatchesRecord, bindModelAttachment: admission.bindModelAttachment,
    disposeModelCache: admission.disposeStudioBg3dModelCache, readGenericWorkflowMapsFromAttachments: admission.readGenericWorkflowMapsFromAttachments,
    planStudioBg3dDeletedAttachmentReconciliation: removal.planStudioBg3dDeletedAttachmentReconciliation,
    parseBg3dSceneWithModelsFromDataUrl: (value: string | undefined) => { ports.parse(value); return model.parseBg3dSceneWithModelsFromDataUrl(value); },
    studioBg3dModalOperationCoordinator: { waitForSceneMutationLane: ports.wait }, resolveDeviceQuality: () => ({}),
  };
});
function historyRefs(): StudioBg3dHistoryCommandRefs {
  return { historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null } };
}
interface RestoreProps { readonly renderer: object; readonly session: object; readonly initialScene?: StudioBg3dSceneDocument; readonly initialDataUrl?: string }

/** 실제 hook·canonical parser·hydrate·binding·history를 쓰고 저장/renderer admission만 대기시킨다. */
function useRestoreFixture(props: RestoreProps) {
  const [primitives, setPrimitives] = useState<BgPrimitive[]>([]), [customModels, setCustomModels] = useState<BgCustomModelInstance[]>([]);
  const [base, setSceneBaseDocument] = useState(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null);
  const [canUndo, setCanUndo] = useState(false), [, setCanRedo] = useState(false), [, setSelectedIds] = useState(new Set<string>()), [, setRefTick] = useState(0);
  const history = useRef(historyRefs()).current, session = useRef(props.session); session.current = props.session;
  const cache = useRef(new Map<string, StudioBg3dModelRootCacheEntry>()), pending = useRef(new Map<string, unknown>());
  const attachments = useRef(new Map<string, StudioBg3dModelAttachment>()), storageIds = useRef(new Map<string, string>());
  const restoreAbort = useRef<AbortController | null>(null), cameraPending = useRef<unknown>(null), viewport = useRef({ applyView: () => true, readView: () => base.camera });
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({ primitives, customModels, baseDocument: base, attachmentByStorageModelId: attachments.current });
  const document = adapted.ok ? adapted.value.document : base;
  const live = useRef<StudioBg3dPrimitiveEditRuntime>({ primitives, customModels, document }); live.current = { primitives, customModels, document };
  const host = useRef<Record<string, unknown>>({ physicsGenerationRef: { current: 0 }, physicsAbortRef: { current: null }, physicsAnimationFrameRef: { current: null },
    physicsSessionRef: { current: null }, latestPhysicsSamplesRef: { current: [] }, physicsPhaseRef: { current: "idle" },
    setPhysicsPhase: vi.fn(), setPhysicsProgress: vi.fn(), setPhysicsCurrentSeconds: vi.fn(), setPhysicsError: vi.fn(), setFailedCloneIds: vi.fn(), setReadyCloneIds: vi.fn(),
    setGenericModelSourceFormats: vi.fn(), setGenericModelClassifications: vi.fn(), viewportHostRef: { current: null },
    captureInFlightRef: { current: false }, cameraLensGestureBeforeViewRef: { current: null } });
  Object.assign(host.current, { open: true, modelRenderer: props.renderer, initialScene: props.initialScene, initialDataUrl: props.initialDataUrl,
    modalAssetSessionRef: session, sceneRestoreAbortRef: restoreAbort, isModalAssetSessionCurrent: (candidate: object) => candidate === session.current,
    ...history, modelRootCacheRef: cache, modelLoadPendingRef: pending, attachmentByStorageModelIdRef: attachments, storageModelIdByAttachmentIdRef: storageIds,
    physicsRuntimeSourceRef: live, pendingInitialCameraRef: cameraPending, viewportApiRef: viewport,
    primitives, customModels, sceneBaseDocument: document, isRestoringScene: busy, isBatchRenderingShots: false,
    setPrimitives, setCustomModels, setSceneBaseDocument, setIsRestoringScene: setBusy, setSceneRecoveryError: setError, setError: vi.fn(),
    setSelectedIds, setCanUndo, setCanRedo, setRefTick });
  useStudioBg3dEditorRestoreEffects(host.current);
  return { primitives, customModels, document, base, busy, error, canUndo, history, restoreAbort, attachments,
    editX(x: number) {
      setPrimitives((current) => current.map((primitive, index) => index === 0 ? { ...primitive, position: [x, primitive.position[1], primitive.position[2]] } : primitive));
      setSceneBaseDocument(normalizeStudioBg3dSceneDocument({ ...document,
        nodes: document.nodes.map((node, index) => index === 0 ? { ...node, transform: { ...node.transform, position: [x, node.transform.position[1], node.transform.position[2]] } } : node) }));
    } };
}
async function flush() { await act(async () => { for (let index = 0; index < 12; index += 1) await Promise.resolve(); }); }
async function fourNodeFixture() {
  const f = await createSceneGlbFixture();
  f.runtime.current = { ...f.runtime.current, primitives: [f.primitive, { ...f.primitive, id: "second-box", position: [3, 0.5, 0] }, { ...f.primitive, id: "third-box", position: [-2, 0.5, 0] }] }; f.refresh();
  if (!f.entry || !f.record) throw Error("실제 검증 모델 필요");
  const entry = f.entry, record = f.record;
  ports.resolve.mockResolvedValue({ record, deletionReceipt: null });
  ports.admit.mockImplementation(async (args) => {
    if (!args.isActive() || args.signal?.aborted) throw Error("오래된 renderer 요청");
    const cloned = { ...entry, root: entry.root.clone(true), dispose: vi.fn() }; args.cache.set(record.id, cloned); return cloned;
  });
  return { ...f, record, entry, initialScene: f.runtime.current.document };
}
beforeEach(() => {
  // Node WebCrypto가 만든 foreign ArrayBuffer를 DOM realm의 복사본으로 돌려준다. 실제 SHA 계산은 유지한다.
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  vi.spyOn(crypto.subtle, "digest").mockImplementation(async (algorithm, data) => {
    const value = await digest(algorithm, data), copy = new ArrayBuffer(value.byteLength); new Uint8Array(copy).set(new Uint8Array(value)); return copy;
  });
  ports.wait.mockReset().mockResolvedValue(undefined); ports.resolve.mockReset(); ports.admit.mockReset(); ports.parse.mockClear();
});
afterEach(() => { cleanup(); disposeSceneGlbFixtures(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("실제 restore hook의 초기 renderer 교체", () => {
  it("renderer 재생성 완료 뒤 자기 복원 잠금을 해제해 실제 측정 단위 명령을 커밋한다", async () => {
    const f = await fourNodeFixture(), session = {}, firstRenderer = {}, nextRenderer = {};
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: firstRenderer, session, initialScene: f.initialScene } });
    await flush();
    const lane = deferredSceneGlb<void>();
    ports.wait.mockReturnValueOnce(lane.promise);
    view.rerender({ renderer: nextRenderer, session, initialScene: f.initialScene });
    await flush();
    expect(view.result.current.busy).toBe(true);
    expect(view.result.current.restoreAbort.current).toBeInstanceOf(AbortController);
    await act(async () => { lane.resolve(); await lane.promise; });
    await flush();
    expect(view.result.current.busy).toBe(false);
    expect(view.result.current.restoreAbort.current).toBeNull();

    // 실제 복원 결과와 controller ref를 실제 측정 command/codec에 연결한다.
    const restored = view.result.current;
    const live = { current: { primitives: restored.primitives, customModels: restored.customModels, document: restored.document, revision: 0 } };
    const commit = vi.fn<StudioBg3dMeasurementCommandHost["commitImmediateHistoryTransition"]>();
    const replace = vi.fn((mutation: StudioBg3dCanonicalDocumentMutation) => {
      live.current = { ...live.current, document: mutation.document ?? live.current.document, revision: live.current.revision + 1 };
      return live.current;
    });
    const host: StudioBg3dMeasurementEditorHost = {
      open: true, modelRenderer: nextRenderer, isRestoringScene: restored.busy,
      isCapturing: false, isBatchRenderingShots: false, physicsInteractionLocked: false,
      sceneRestoreAbortRef: restored.restoreAbort, captureInFlightRef: { current: false },
      modalAssetSessionRef: { current: session }, physicsRuntimeSourceRef: live,
      attachmentByStorageModelIdRef: restored.attachments,
      commitImmediateHistoryTransition: commit, replaceCanonicalDocumentState: replace,
    };
    const current = readStudioBg3dSceneMeasurements(live.current.document);
    const next = setStudioBg3dMeasurementUnit(current, "mm");
    if (!next.ok) throw Error("측정 단위 변경 입력이 필요합니다.");
    expect(commitStudioBg3dMeasurementEditorDocument(host, next.document, current))
      .toMatchObject({ ok: true, changed: true, document: { unit: "mm" } });
    expect(commit).toHaveBeenCalledOnce();expect(replace).toHaveBeenCalledOnce();
    expect(readStudioBg3dSceneMeasurements(live.current.document).unit).toBe("mm");
  });

  it("늦게 끝난 이전 renderer 재생성은 새 renderer의 복원 controller와 잠금을 해제하지 않는다", async () => {
    const f = await fourNodeFixture(), session = {};
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: {}, session, initialScene: f.initialScene } });
    await flush();
    const previous = deferredSceneGlb<void>(), latest = deferredSceneGlb<void>();
    ports.wait.mockReturnValueOnce(previous.promise).mockReturnValueOnce(latest.promise);
    view.rerender({ renderer: {}, session, initialScene: f.initialScene });
    await flush();
    const previousController = view.result.current.restoreAbort.current;
    expect(previousController).toBeInstanceOf(AbortController);
    view.rerender({ renderer: {}, session, initialScene: f.initialScene });
    await flush();
    const latestController = view.result.current.restoreAbort.current;
    expect(latestController).toBeInstanceOf(AbortController);
    expect(latestController).not.toBe(previousController);
    await act(async () => { previous.resolve(); await previous.promise; });
    await flush();
    expect(view.result.current.restoreAbort.current).toBe(latestController);
    expect(latestController?.signal.aborted).toBe(false);
    expect(view.result.current.busy).toBe(true);
    await act(async () => { latest.resolve(); await latest.promise; });
    await flush();
    expect(view.result.current.restoreAbort.current).toBeNull();
    expect(view.result.current.busy).toBe(false);
  });

  it("pending 원본 4node를 새 renderer에서 다시 hydrate하고 늦은 이전 요청은 완료를 발행하지 않는다", async () => {
    const f = await fourNodeFixture(), old = deferredSceneGlb<Bg3dModelHashResolution>(), session = {}, gpu = {}, webgl = {};
    ports.resolve.mockReturnValueOnce(old.promise); vi.useFakeTimers();
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: gpu, session, initialScene: f.initialScene } }); await flush();
    expect(ports.resolve).toHaveBeenCalledOnce(); expect(view.result.current.busy).toBe(true); expect(view.result.current.primitives).toHaveLength(0);
    view.rerender({ renderer: webgl, session, initialScene: f.initialScene }); await flush();
    expect(view.result.current.busy).toBe(false); expect(view.result.current.error).toBeNull();
    expect(view.result.current.primitives).toHaveLength(3); expect(view.result.current.customModels).toHaveLength(1); expect(view.result.current.document.nodes).toHaveLength(4);
    expect(ports.admit.mock.calls.map(([args]) => args.renderer)).toEqual([webgl]);
    act(() => view.result.current.editX(7)); act(() => vi.advanceTimersByTime(450));
    const history = structuredClone(view.result.current.history.historyRef.current), index = view.result.current.history.historyIndexRef.current;
    await act(async () => { old.resolve({ record: f.record, deletionReceipt: null }); await old.promise; }); await flush();
    expect(view.result.current.primitives[0].position[0]).toBe(7); expect(view.result.current.error).toBeNull();
    view.rerender({ renderer: {}, session, initialScene: f.initialScene }); await flush();
    expect(view.result.current.primitives[0].position[0]).toBe(7); expect(view.result.current.customModels).toHaveLength(1);
    expect(view.result.current.history.historyRef.current).toEqual(history); expect(view.result.current.history.historyIndexRef.current).toBe(index);
    expect(view.result.current.canUndo).toBe(true);
  });

  it("실패한 canonical 복원은 완료가 아니며 다음 renderer에서 원래 모델을 다시 읽는다", async () => {
    const f = await fourNodeFixture(), session = {};
    ports.resolve.mockResolvedValueOnce({ record: null, deletionReceipt: null }); vi.useFakeTimers();
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: {}, session, initialScene: f.initialScene } }); await flush();
    expect(view.result.current.error).toBeTypeOf("string"); expect(view.result.current.customModels).toHaveLength(0);
    view.rerender({ renderer: {}, session, initialScene: f.initialScene }); await flush();
    expect(view.result.current.error).toBeNull(); expect(view.result.current.primitives).toHaveLength(3); expect(view.result.current.customModels).toHaveLength(1);
    expect(ports.resolve).toHaveBeenCalledTimes(2);
  });

  it("마지막 이전 조회가 reject해도 삭제 reconciliation이 새 renderer의 편집 문서를 덮지 않는다", async () => {
    const f = await fourNodeFixture(), session = {}, attachment = f.initialScene.attachments[0];
    if (!attachment) throw Error("원본 첨부 필요");
    const hash: `sha256:${string}` = `sha256:${"a".repeat(64)}`;
    const deleted: StudioBg3dModelAttachment = { ...attachment, id: "already-deleted-attachment", hash };
    const deletion: Bg3dModelHashResolution = { record: null, deletionReceipt: { id: hash, contentHash: hash, storageModelId: "deleted-storage", deletedAt: 1 } };
    const initialScene = normalizeStudioBg3dSceneDocument({ ...f.initialScene, attachments: [deleted, attachment] });
    let rejectOld: (reason: Error) => void = () => undefined;
    const old = new Promise<Bg3dModelHashResolution>((_resolve, reject) => { rejectOld = reject; });
    ports.resolve.mockImplementation(async (hash) => hash === deleted.hash ? deletion : { record: f.record, deletionReceipt: null });
    ports.resolve.mockResolvedValueOnce(deletion).mockReturnValueOnce(old); vi.useFakeTimers();
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: {}, session, initialScene } }); await flush();
    expect(ports.resolve).toHaveBeenCalledTimes(2); expect(view.result.current.busy).toBe(true);
    view.rerender({ renderer: {}, session, initialScene }); await flush();
    expect(view.result.current.error).toBeNull(); expect(view.result.current.document.nodes).toHaveLength(4);
    act(() => view.result.current.editX(11));
    const base = view.result.current.base, history = structuredClone(view.result.current.history.historyRef.current);
    await act(async () => { rejectOld(Error("이전 renderer의 마지막 조회 실패")); }); await flush();
    expect(view.result.current.base).toBe(base); expect(view.result.current.primitives[0].position[0]).toBe(11);
    expect(view.result.current.error).toBeNull(); expect(view.result.current.history.historyRef.current).toEqual(history);
  });

  it("canonical 복원과 완료 후 renderer 재생성 모두 로컬 출처를 명시한다", async () => {
    const f = await fourNodeFixture(), session = {};
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: {}, session, initialScene: f.initialScene } }); await flush();
    expect(view.result.current.error).toBeNull(); expect(view.result.current.customModels).toHaveLength(1);
    expect(ports.resolve).toHaveBeenLastCalledWith(f.record.contentHash, expect.objectContaining({ source: "local-library", signal: expect.any(AbortSignal) }));
    ports.resolve.mockClear();
    view.rerender({ renderer: {}, session, initialScene: f.initialScene }); await flush();
    expect(ports.resolve).toHaveBeenCalledOnce();
    expect(ports.resolve).toHaveBeenLastCalledWith(f.record.contentHash, expect.objectContaining({ source: "local-library", signal: expect.any(AbortSignal) }));
    expect(view.result.current.error).toBeNull(); expect(view.result.current.customModels).toHaveLength(1);
  });

  it("로컬 원본의 권리가 첨부와 다르면 렌더링과 업데이트를 계속 차단한다", async () => {
    const f = await fourNodeFixture(), session = {}, attachment = f.initialScene.attachments[0];
    if (!attachment) throw Error("모델 첨부가 필요합니다.");
    const initialScene = normalizeStudioBg3dSceneDocument({ ...f.initialScene, attachments: [{ ...attachment,
      rights: { ...attachment.rights, commercialUse: !attachment.rights.commercialUse } }] });
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: {}, session, initialScene } }); await flush();
    expect(view.result.current.error).toBeTypeOf("string"); expect(view.result.current.customModels).toHaveLength(0);
    expect(ports.admit).not.toHaveBeenCalled();
  });

  it("legacy pending도 원래 payload를 다시 읽고 완료 뒤 remount는 로컬 편집을 유지한다", async () => {
    const f = await createSceneGlbFixture(false), lane = deferredSceneGlb<void>(), session = {};
    const primitives = Array.from({ length: 4 }, (_, index): BgPrimitive => ({ ...f.primitive, id: `legacy-${index}`, position: [index, 0.5, 0] }));
    const initialDataUrl = `data:image/png;base64,AA==#${encodeBg3dSceneWithModelsHash(primitives, [])}`;
    ports.wait.mockReturnValueOnce(lane.promise); vi.useFakeTimers();
    const view = renderHook(useRestoreFixture, { initialProps: { renderer: {}, session, initialDataUrl } }); await flush();
    expect(view.result.current.busy).toBe(true); expect(ports.parse).not.toHaveBeenCalled();
    view.rerender({ renderer: {}, session, initialDataUrl }); await flush();
    expect(view.result.current.primitives).toHaveLength(4); expect(view.result.current.busy).toBe(false); expect(ports.parse).toHaveBeenCalledOnce();
    act(() => view.result.current.editX(9));
    await act(async () => { lane.resolve(); await lane.promise; }); await flush();
    view.rerender({ renderer: {}, session, initialDataUrl }); await flush();
    expect(view.result.current.primitives[0].position[0]).toBe(9); expect(ports.parse).toHaveBeenCalledOnce();
  });
});
