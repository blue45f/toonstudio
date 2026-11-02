import { describe, expect, it, vi } from "vitest";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import {
  instantiateBg3dTemplateDocument, listBg3dTemplatesV12, saveBg3dTemplateV12,
  type Bg3dTemplateLibraryDraft, type Bg3dTemplateLibraryEntry,
} from "./bg3d-template-library";
import { createStudioBg3dHistorySnapshot, studioBg3dHistoryDocumentAtView } from "./studio-bg3d-editor-derivations";
import { attachStudioBg3dEditorPlacementHost } from "./studio-bg3d-editor-placement-host";
import { attachStudioBg3dEditorSceneOpsHost } from "./studio-bg3d-editor-scene-ops-host";
import { resetStudioBg3dCommandHistory, stepStudioBg3dCommandHistory, type StudioBg3dHistoryCommandRefs } from "./studio-bg3d-history-command-adapter";
import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";
import { createStudioBg3dMeasurementDocument, type StudioBg3dMeasurementGuide } from "./studio-bg3d-measurement";
import { assertStudioBg3dModelAttachmentAdmission } from "./studio-bg3d-model-placement-admission";
import { isStudioBg3dPhysicsTransientPhase } from "./studio-bg3d-physics-ui";
import {
  createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  type StudioBg3dModelAttachment, type StudioBg3dSceneDocument,
  type StudioBg3dTexturePaint,
} from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";
import type { StudioBg3dCanonicalDocumentMutation, StudioBg3dCanonicalDocumentSnapshot } from "./useStudioBg3dCanonicalDocumentState";

vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));

function guide(id: string): StudioBg3dMeasurementGuide {
  return { id, kind: "distance", startWorld: [0, -0.0005, 0], endWorld: [2, -0.0005, 0], lockedLengthMeters: 2, visible: true };
}

function documentWithGuides(guides: readonly StudioBg3dMeasurementGuide[]): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({ ...createDefaultStudioBg3dSceneDocument(),
    measurements: { ...createStudioBg3dMeasurementDocument("mm"), guides } });
}

function paint(color: string): StudioBg3dTexturePaint {
  return { version: 1, strokes: [{ color, size: 0.04, opacity: 1, points: [[0.25, 0.5], [0.75, 0.5]] }] };
}

function paintedDocument(id: string, color: string): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({ ...documentWithGuides([guide(`${id}-guide`)]), nodes: [{
    id, name: "보존할 도형", kind: "primitive", primitiveKind: "box", color: "#abcdef",
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, parentId: null,
    visible: true, locked: false, castsShadow: false, receivesShadow: false, texturePaint: paint(color),
  }] });
}

interface Lease { readonly signal: AbortSignal; isCurrent(): boolean; throwIfRevoked(): void }
interface Host extends Record<string, unknown> {
  handleSaveSceneAsTemplate?: () => Promise<boolean>;
  applyUserTemplate?: (entry: Bg3dTemplateLibraryEntry) => Promise<void>;
  commitImmediateHistoryTransition?: (
    primitives: readonly BgPrimitive[], models: readonly BgCustomModelInstance[],
    document: StudioBg3dSceneDocument,
    before?: ReturnType<typeof createStudioBg3dHistorySnapshot>,
    options?: { readonly commandId?: string; readonly label?: string; readonly source?: "menu" },
  ) => void;
}

function fixture(initial = createDefaultStudioBg3dSceneDocument()) {
  let stored: string | null = null;
  const authority: StudioBg3dLibrariesAuthority = {
    readManifest: async () => stored,
    readBlob: async () => { throw new Error("측정 템플릿은 바이너리를 읽지 않습니다."); },
    async mutate(_slot, _refs, operation) {
      const result = await operation({ now: 1_000, currentRaw: stored,
        putBlob: async () => { throw new Error("측정 템플릿은 바이너리를 쓰지 않습니다."); },
        getBlob: async () => { throw new Error("측정 템플릿은 바이너리를 읽지 않습니다."); } });
      result.assertCurrent?.(); stored = result.nextRaw; return result.result;
    },
  };
  const initialRuntime = hydrateStudioBg3dDocumentToRuntime({ document: initial, storageModelIdByAttachmentId: new Map() });
  const live: { current: StudioBg3dCanonicalDocumentSnapshot } = {
    current: { revision: 0, primitives: initialRuntime.primitives, customModels: initialRuntime.customModels, document: initial },
  };
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null },
  };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live.current));
  const attachments = new Map<string, StudioBg3dModelAttachment>();
  const reverse = new Map<string, string>();
  const replacement = vi.fn((mutation: StudioBg3dCanonicalDocumentMutation) => {
    live.current = { revision: live.current.revision + 1,
      primitives: [...(mutation.primitives ?? live.current.primitives)],
      customModels: [...(mutation.customModels ?? live.current.customModels)],
      document: mutation.document ? normalizeStudioBg3dSceneDocument(mutation.document) : live.current.document };
    return live.current;
  });
  let beforeCommit: (() => void) | undefined;
  const coordinator = {
    async runSceneMutation<T>(_session: unknown, prepare: (lease: Lease) => Promise<T>, commit: (prepared: T) => void) {
      const prepared = await prepare({ signal: new AbortController().signal, isCurrent: () => true, throwIfRevoked: () => undefined });
      beforeCommit?.(); commit(prepared); return { status: "committed" };
    },
    commitIfCurrent(_session: unknown, commit: () => void) { commit(); return true; },
  };
  const save = vi.fn((draft: Bg3dTemplateLibraryDraft) => saveBg3dTemplateV12(draft, { authority }));
  const error = vi.fn<(message: string | null) => void>();
  const captureInFlightRef = { current: false };
  const h: Host = {
    ...history, open: true, modelRenderer: {}, isRestoringScene: false, isUploadingModel: false,
    isCapturing: false, isBatchRenderingShots: false, isSavingTemplate: false, physicsInteractionLocked: false,
    applyingTemplateId: null, physicsPhaseRef: { current: "idle" }, isStudioBg3dPhysicsTransientPhase,
    primitives: initialRuntime.primitives, customModels: initialRuntime.customModels, sceneBaseDocument: initial, physicsRuntimeSourceRef: live,
    selectedIds: new Set<string>(), templateLibrary: [], captureInFlightRef,
    viewportApiRef: { current: null }, viewportHostRef: { current: null }, modalAssetSessionRef: { current: {} },
    attachmentByStorageModelIdRef: { current: attachments }, storageModelIdByAttachmentIdRef: { current: reverse },
    modelRootCacheRef: { current: new Map() }, modelLoadPendingRef: { current: new Map() },
    isModalAssetSessionCurrent: () => true, isMaterialBackendCurrent: () => true,
    studioBg3dModalOperationCoordinator: coordinator,
    useRef: <T>(value: T) => ({ current: value }), createStudioBg3dHistorySnapshot, studioBg3dHistoryDocumentAtView,
    saveBg3dTemplate: save, instantiateBg3dTemplateDocument, hydrateStudioBg3dDocumentToRuntime,
    resolveDeviceQuality: () => ({}), assertStudioBg3dModelAttachmentAdmission,
    calculateStudioBg3dPlacedModelBytes: () => 0,
    STUDIO_BG3D_SCENE_DOCUMENT_MAX_ATTACHMENTS, STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
    replaceCanonicalDocumentState: replacement,
    setError: error, setSelectedIds: vi.fn(), setRefTick: vi.fn(), setApplyingTemplateId: vi.fn(),
    setIsSavingTemplate: vi.fn(), setTemplateLibrary: vi.fn(), setTemplateLibraryStatus: vi.fn(),
    setTemplateLibraryNotice: vi.fn(), setCanUndo: vi.fn(), setCanRedo: vi.fn(),
    StudioBg3dThreeOperationError: class extends Error {}, StudioBg3dStaleModalOperationError: class extends Error {},
  };
  attachStudioBg3dEditorSceneOpsHost(h);
  const immediate = h.commitImmediateHistoryTransition;
  if (!immediate) throw new Error("실제 즉시 이력 액션이 필요합니다.");
  const commit = vi.fn(immediate);
  h.commitImmediateHistoryTransition = commit;
  attachStudioBg3dEditorPlacementHost(h);
  return { h, live, history, authority, attachments, reverse, replacement, commit, save, error, captureInFlightRef,
    beforeCommit: (callback: () => void) => { beforeCommit = callback; } };
}

function entry(document: StudioBg3dSceneDocument): Bg3dTemplateLibraryEntry {
  return { id: "measurement-template", name: "측정 템플릿", createdAt: 1_000, commercialUse: true, document };
}

describe("측정 템플릿의 실제 저장·적용 호스트 연결", () => {
  it("도형 없이 바닥 점으로 만든 가이드를 실제 V12 manifest에 저장하고 읽어 적용한다", async () => {
    const source = documentWithGuides([guide("floor-pick")]);
    const f = fixture(source);
    const save = f.h.handleSaveSceneAsTemplate;
    if (!save) throw new Error("실제 저장 액션이 필요합니다.");
    expect(await save()).toBe(true);
    expect(f.save).toHaveBeenCalledOnce();
    const reopened = await listBg3dTemplatesV12({ authority: f.authority });
    expect(reopened).toHaveLength(1);
    expect(reopened[0]?.document.measurements).toEqual(source.measurements);
    const destination = fixture();
    const apply = destination.h.applyUserTemplate;
    if (!apply || !reopened[0]) throw new Error("재개방한 템플릿과 실제 적용 액션이 필요합니다.");
    await apply(reopened[0]);
    expect(destination.live.current.document.measurements).toEqual(source.measurements);
    expect(destination.live.current.primitives).toEqual([]);
    expect(destination.commit).toHaveBeenCalledOnce();
    expect(destination.replacement).toHaveBeenCalledOnce();
    expect(stepStudioBg3dCommandHistory(destination.history, "undo")?.state.document.measurements).toBeUndefined();
    expect(stepStudioBg3dCommandHistory(destination.history, "redo")?.state.document.measurements).toEqual(source.measurements);
  });

  it("도형과 가이드를 기존 가이드 장면에 한 번의 이력·정본 변경으로 반영한다", async () => {
    const f = fixture(documentWithGuides([guide("same-id")]));
    const template = documentWithGuides([guide("same-id")]);
    const document = normalizeStudioBg3dSceneDocument({ ...template, nodes: [{
      id: "template-box", name: "상자", kind: "primitive", primitiveKind: "box", color: "#abcdef",
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] }, parentId: null,
      visible: true, locked: false, castsShadow: true, receivesShadow: true,
    }] });
    await f.h.applyUserTemplate?.(entry(document));
    expect(f.live.current.primitives).toHaveLength(1);
    expect(f.live.current.document.measurements?.guides).toHaveLength(2);
    expect(f.live.current.document.measurements?.guides[0]?.id).toBe("same-id");
    expect(f.live.current.document.measurements?.guides[1]?.id).not.toBe("same-id");
    expect(f.commit).toHaveBeenCalledOnce(); expect(f.replacement).toHaveBeenCalledOnce();
    const undone = stepStudioBg3dCommandHistory(f.history, "undo")?.state;
    expect(undone?.primitives).toEqual([]);
    expect(undone?.document.measurements?.guides).toHaveLength(1);
    const redone = stepStudioBg3dCommandHistory(f.history, "redo")?.state;
    expect(redone?.primitives).toHaveLength(1);
    expect(redone?.document.measurements?.guides).toHaveLength(2);
  });

  it("최신 장면의 가이드 합산 한도를 넘으면 첨부맵·이력·장면을 모두 보존한다", async () => {
    const initial = documentWithGuides([guide("initial")]);
    const f = fixture(initial);
    f.beforeCommit(() => {
      f.live.current = { ...f.live.current, document: documentWithGuides(
        Array.from({ length: 256 }, (_, index) => guide(`current-${index}`)),
      ) };
    });
    const attachmentsBefore = [...f.attachments];
    const reverseBefore = [...f.reverse];
    const clearAttachments = vi.spyOn(f.attachments, "clear");
    const clearReverse = vi.spyOn(f.reverse, "clear");
    await f.h.applyUserTemplate?.(entry(documentWithGuides([guide("new")])));
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replacement).not.toHaveBeenCalled();
    expect(clearAttachments).not.toHaveBeenCalled(); expect(clearReverse).not.toHaveBeenCalled();
    expect([...f.attachments]).toEqual(attachmentsBefore); expect([...f.reverse]).toEqual(reverseBefore);
    expect(f.live.current.document.measurements?.guides).toHaveLength(256);
    expect(f.history.historyCommandTimelineRef.current?.canUndo).toBe(false);
    expect(f.error).toHaveBeenLastCalledWith(expect.any(String));
  });

  it("기존·신규 도형의 그림자 설정과 획을 저장·적용·Undo/Redo에서 보존한다", async () => {
    const source = fixture(paintedDocument("source", "#0000ff"));
    const latest: BgPrimitive = { ...source.live.current.primitives[0], id: "source", kind: "box", color: "#abcdef",
      position: [7, 8, 9], rotation: [0, 0, 0], scale: [2, 3, 4], texturePaint: paint("#00ff00") };
    source.live.current = { ...source.live.current, primitives: [latest] };
    expect(await source.h.handleSaveSceneAsTemplate?.()).toBe(true);
    const [reopened] = await listBg3dTemplatesV12({ authority: source.authority });
    if (!reopened) throw new Error("그림자 설정과 획을 재개방한 템플릿이 필요합니다.");
    expect(reopened.document.nodes[0]).toMatchObject({ castsShadow: false, receivesShadow: false,
      texturePaint: paint("#00ff00"), transform: { position: [7, 8, 9], scale: [2, 3, 4] } });
    const destination = fixture(paintedDocument("existing", "#ff0000"));
    await destination.h.applyUserTemplate?.(reopened);
    const existing = destination.live.current.document.nodes.find((node) => node.id === "existing");
    const added = destination.live.current.document.nodes.find((node) => node.id !== "existing");
    expect(existing).toMatchObject({ castsShadow: false, receivesShadow: false, texturePaint: paint("#ff0000") });
    expect(added).toMatchObject({ castsShadow: false, receivesShadow: false, texturePaint: paint("#00ff00"),
      transform: { position: [7, 8, 9], scale: [2, 3, 4] } });
    expect(destination.commit).toHaveBeenCalledOnce(); expect(destination.replacement).toHaveBeenCalledOnce();
    const undone = stepStudioBg3dCommandHistory(destination.history, "undo")?.state;
    expect(undone?.document.nodes).toHaveLength(1);
    expect(undone?.document.nodes[0]).toEqual(existing);
    const redone = stepStudioBg3dCommandHistory(destination.history, "redo")?.state;
    expect(redone?.document.nodes).toEqual(destination.live.current.document.nodes);
    expect(redone?.primitives.find((primitive) => primitive.id === added?.id)?.texturePaint).toEqual(paint("#00ff00"));
  });

  it("비동기 준비 중 캡처가 시작되면 첨부맵·이력·장면을 바꾸지 않는다", async () => {
    const f = fixture(paintedDocument("existing", "#ff0000"));
    const before = f.live.current;
    const clearAttachments = vi.spyOn(f.attachments, "clear");
    const clearReverse = vi.spyOn(f.reverse, "clear");
    f.beforeCommit(() => { f.captureInFlightRef.current = true; });
    await f.h.applyUserTemplate?.(entry(documentWithGuides([guide("new-guide")])));
    expect(f.live.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.replacement).not.toHaveBeenCalled();
    expect(clearAttachments).not.toHaveBeenCalled(); expect(clearReverse).not.toHaveBeenCalled();
    expect(f.history.historyCommandTimelineRef.current?.canUndo).toBe(false);
  });
});
