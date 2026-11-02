import { describe, expect, it, vi } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import {
  commitStudioBg3dHistoryTransition,
  resetStudioBg3dCommandHistory,
  stepStudioBg3dCommandHistory,
  type StudioBg3dHistoryCommandRefs,
} from "./studio-bg3d-history-command-adapter";
import {
  addStudioBg3dMeasurementGuide,
  createStudioBg3dMeasurementDocument,
  deleteStudioBg3dMeasurementGuide,
  serializeStudioBg3dMeasurementDocument,
  setStudioBg3dMeasurementGuideVisibility,
  setStudioBg3dMeasurementUnit,
  type StudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementGuide,
} from "./studio-bg3d-measurement";
import {
  applyStudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementCommandHost,
} from "./studio-bg3d-measurement-command";
import {
  createDefaultStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  STUDIO_BG3D_GLB_MIME,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import {
  DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS,
  readStudioBg3dSceneMeasurements,
} from "./studio-bg3d-scene-measurements";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import type { StudioBg3dCanonicalDocumentSnapshot } from "./useStudioBg3dCanonicalDocumentState";

function box(id = "box", patch: Partial<BgPrimitive> = {}): BgPrimitive {
  return { id, kind: "box", color: "#abcdef", position: [1, 2, 3], rotation: [0, 0, 0],
    scale: [2, 3, 4], ...patch };
}

function withGuide(document = DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS): StudioBg3dMeasurementDocument {
  const result = addStudioBg3dMeasurementGuide(document, { startWorld: [0, 0, 0], endWorld: [1, 2, 3] });
  if (!result.ok) throw Error(result.code);
  return result.document;
}

function fixture() {
  const source = box();
  const live: { current: StudioBg3dCanonicalDocumentSnapshot } = { current: {
    revision: 7, primitives: [source], customModels: [],
    document: { ...createDefaultStudioBg3dSceneDocument(), meta: { name: "보존할 장면", memo: "기존 메모" } },
  } };
  const initial = tryAdaptStudioBg3dRuntimeToDocument({ ...live.current, baseDocument: live.current.document,
    attachmentByStorageModelId: new Map() });
  if (!initial.ok) throw Error(initial.error.code);
  live.current = { ...live.current, document: initial.value.document };
  const session: { current: object | null } = { current: {} };
  const capture = { current: false };
  const attachments = new Map<string, StudioBg3dModelAttachment>();
  const attachmentRef = { current: attachments };
  const state = {
    open: true, modelRenderer: {} as object | null, isRestoringScene: false, isCapturing: false,
    isBatchRenderingShots: false, physicsInteractionLocked: false,
  };
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null },
  };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live.current));
  const replace = vi.fn<StudioBg3dMeasurementCommandHost["replaceCanonicalDocumentState"]>((mutation) => {
    live.current = { revision: live.current.revision + 1, primitives: live.current.primitives,
      customModels: live.current.customModels, document: mutation.document ?? live.current.document };
  });
  const commit = vi.fn<StudioBg3dMeasurementCommandHost["commitImmediateHistoryTransition"]>((primitives, customModels, document, before, options) => {
    commitStudioBg3dHistoryTransition(history, { before,
      after: createStudioBg3dHistorySnapshot({ primitives, customModels, document }), ...options });
  });
  const host: StudioBg3dMeasurementCommandHost = {
    get open() { return state.open; },
    get modelRenderer() { return state.modelRenderer; },
    get isRestoringScene() { return state.isRestoringScene; },
    get isCapturing() { return state.isCapturing; },
    get isBatchRenderingShots() { return state.isBatchRenderingShots; },
    get physicsInteractionLocked() { return state.physicsInteractionLocked; },
    physicsRuntimeSourceRef: live, modalAssetSessionRef: session, captureInFlightRef: capture,
    attachmentByStorageModelIdRef: attachmentRef,
    commitImmediateHistoryTransition: commit, replaceCanonicalDocumentState: replace,
  };
  const apply = (next: StudioBg3dMeasurementDocument, expectedCurrent = readStudioBg3dSceneMeasurements(live.current.document)) =>
    applyStudioBg3dMeasurementDocument(host, { expectedCurrent, next });
  return { host, live, source, session, capture, attachments, attachmentRef, state, history, replace, commit, apply };
}

function expectUnchanged(f: ReturnType<typeof fixture>, revision = 7) {
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.replace).not.toHaveBeenCalled();
  expect(f.history.historyIndexRef.current).toBe(0);
  expect(f.history.historyRef.current).toHaveLength(1);
  expect(f.live.current.revision).toBe(revision);
}

describe("측정 정본을 반영하는 단일 장면 명령", () => {
  it("안내선을 한 revision과 한 history로 반영하고 실제 Undo/Redo로 복원한다", () => {
    const f = fixture();
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    const primitives = f.live.current.primitives;
    const customModels = f.live.current.customModels;
    const document = f.live.current.document;
    const next = withGuide();
    expect(f.apply(next)).toEqual({ ok: true, changed: true, document: next });
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledTimes(1);
    expect(Object.keys(f.replace.mock.calls[0]?.[0] ?? {})).toEqual(["document"]);
    expect(f.live.current.revision).toBe(8);
    expect(f.live.current.primitives).toBe(primitives);
    expect(f.live.current.customModels).toBe(customModels);
    expect(f.live.current.document).toEqual({ ...document, measurements: next });
    expect(f.live.current.document.nodes).toBe(document.nodes);
    expect(f.live.current.document.camera).toBe(document.camera);
    expect(f.live.current.document.meta).toBe(document.meta);
    expect(f.history.historyIndexRef.current).toBe(1);
    expect(f.history.historyRef.current).toHaveLength(2);
    const after = createStudioBg3dHistorySnapshot(f.live.current);
    const undone = stepStudioBg3dCommandHistory(f.history, "undo");
    expect(undone?.status).toBe("applied");
    expect(undone?.state).toEqual(before);
    expect(Object.hasOwn(undone?.state.document ?? {}, "measurements")).toBe(false);
    const redone = stepStudioBg3dCommandHistory(f.history, "redo");
    expect(redone?.status).toBe("applied");
    expect(redone?.state).toEqual(after);
    expect(redone?.state.document.measurements).toEqual(next);
    expect(stepStudioBg3dCommandHistory(f.history, "redo")).toMatchObject({
      status: "empty", revision: redone?.revision, cursor: redone?.cursor,
      stateHash: redone?.stateHash, state: after,
    });
  });

  it("선택 필드가 없는 장면과 기본 cm 문서는 같은 값으로 판단해 history와 revision을 쓰지 않는다", () => {
    const f = fixture();
    const before = f.live.current;
    expect(f.apply({ ...DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS, guides: [] })).toEqual({
      ok: true, changed: false, document: DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS,
    });
    expectUnchanged(f);
    expect(f.live.current).toBe(before);
    expect(f.live.current.document.measurements).toBeUndefined();
  });

  it("추가·표시·단위·삭제 요청은 각각 같은 정본 명령으로 한 번씩 기록된다", () => {
    const f = fixture();
    const added = withGuide();
    const id = added.guides[0]?.id;
    if (!id) throw Error("안내선 생성 실패");
    expect(f.apply(added).ok).toBe(true);
    const hidden = setStudioBg3dMeasurementGuideVisibility(added, id, false);
    if (!hidden.ok) throw Error(hidden.code);
    expect(f.apply(hidden.document).ok).toBe(true);
    const unit = setStudioBg3dMeasurementUnit(hidden.document, "mm");
    if (!unit.ok) throw Error(unit.code);
    expect(f.apply(unit.document).ok).toBe(true);
    const deleted = deleteStudioBg3dMeasurementGuide(unit.document, id);
    if (!deleted.ok) throw Error(deleted.code);
    expect(f.apply(deleted.document).ok).toBe(true);
    expect(f.live.current.document.measurements).toEqual({ ...DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS, unit: "mm" });
    expect(f.commit).toHaveBeenCalledTimes(4);
    expect(f.replace).toHaveBeenCalledTimes(4);
    expect(f.history.historyIndexRef.current).toBe(4);
    expect(f.live.current.revision).toBe(11);
  });

  it("오래된 UI 문서는 다른 작업의 최신 안내선과 단위를 덮어쓰지 않는다", () => {
    const f = fixture();
    const prior = readStudioBg3dSceneMeasurements(f.live.current.document);
    f.live.current = { ...f.live.current, document: { ...f.live.current.document, measurements: withGuide() } };
    expect(f.apply(createStudioBg3dMeasurementDocument("m"), prior)).toMatchObject({ ok: false, code: "source-changed" });
    expectUnchanged(f);
    expect(f.live.current.document.measurements?.guides).toHaveLength(1);
  });

  it("호출 순간의 닫힘·복원·렌더러·캡처·일괄 렌더·물리·세션 잠금을 모두 확인한다", () => {
    const changes: readonly ((f: ReturnType<typeof fixture>) => void)[] = [
      (f) => { f.state.open = false; }, (f) => { f.state.modelRenderer = null; },
      (f) => { f.state.isRestoringScene = true; }, (f) => { f.state.isCapturing = true; },
      (f) => { f.capture.current = true; }, (f) => { f.state.isBatchRenderingShots = true; },
      (f) => { f.state.physicsInteractionLocked = true; }, (f) => { f.session.current = null; },
    ];
    for (const change of changes) {
      const f = fixture(); change(f);
      expect(f.apply(withGuide())).toMatchObject({ ok: false, code: "scene-unavailable" });
      expectUnchanged(f);
    }
  });

  it("부정확한 중첩 문서·여분 필드·중복 ID·64 KiB 초과를 저장 전 거부한다", () => {
    const guide = withGuide().guides[0];
    if (!guide) throw Error("안내선 없음");
    const oversized: StudioBg3dMeasurementDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS,
      guides: Array.from({ length: 256 }, (_, index): StudioBg3dMeasurementGuide => ({
        ...guide, id: String(index).padStart(80, "g"),
        startWorld: [0.12345678901234568, 0.2345678901234567, 0.3456789012345679],
        endWorld: [0.4567890123456789, 0.567890123456789, 0.6789012345678901],
      })),
    };
    expect(new TextEncoder().encode(JSON.stringify(oversized)).byteLength).toBeGreaterThan(64 * 1024);
    const invalid: readonly StudioBg3dMeasurementDocument[] = [
      { ...withGuide(), guides: [{ ...guide, startWorld: [Number.NaN, 0, 0] }] },
      { ...withGuide(), guides: [guide, guide] },
      { ...withGuide(), guides: [{ ...guide, lockedLengthMeters: 123 }] },
      oversized,
    ];
    for (const next of invalid) {
      const f = fixture();
      expect(f.apply(next)).toMatchObject({ ok: false, code: "measurement-invalid" });
      expectUnchanged(f);
    }
    const f = fixture();
    const extra = { ...withGuide(), runtimeHandle: "저장 금지 값" };
    expect(f.apply(extra)).toMatchObject({ ok: false, code: "measurement-invalid" });
    expectUnchanged(f);
  });

  it("document.nodes가 늦어도 최신 배열 전체를 history에 담고 형상·정본 전용 정보를 보존한다", () => {
    const f = fixture();
    const originalDocument = { ...f.live.current.document,
      nodes: f.live.current.document.nodes.map((node) => ({ ...node, castsShadow: false, receivesShadow: false })) };
    const moved = box("box", { position: [8, 2, 3] });
    const added = box("new-node");
    f.live.current = { ...f.live.current, revision: 9, primitives: [moved, added], document: originalDocument };
    resetStudioBg3dCommandHistory(f.history, createStudioBg3dHistorySnapshot(f.live.current));
    const before = createStudioBg3dHistorySnapshot(f.live.current);
    const currentPrimitives = f.live.current.primitives;
    expect(f.apply(withGuide()).ok).toBe(true);
    expect(f.live.current.primitives).toBe(currentPrimitives);
    expect(f.live.current.primitives[0]).toBe(moved);
    expect(f.live.current.document.nodes).toBe(originalDocument.nodes);
    expect(f.live.current.document.nodes).toHaveLength(1);
    expect(f.live.current.document.nodes[0]).toMatchObject({ castsShadow: false, receivesShadow: false });
    expect(f.commit.mock.calls[0]?.[3]).toEqual(before);
    const undo = stepStudioBg3dCommandHistory(f.history, "undo");
    expect(undo?.state.primitives).toEqual([moved, added]);
    expect(undo?.state.document).toEqual(originalDocument);
    const redo = stepStudioBg3dCommandHistory(f.history, "redo");
    expect(redo?.state.primitives).toEqual([moved, added]);
    expect(redo?.state.document.measurements).toEqual(withGuide());
  });

  it("미해결 모델과 무효·중복 노드 및 생략된 어댑터 진단을 허용하지 않는다", () => {
    const changes: readonly ((f: ReturnType<typeof fixture>) => void)[] = [
      (f) => { f.live.current = { ...f.live.current, customModels: [{ id: "model", modelId: "missing",
        position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }] }; },
      (f) => { f.live.current = { ...f.live.current, primitives: [box(), box()] }; },
      (f) => { f.live.current = { ...f.live.current, primitives: Array.from({ length: 129 }, (_, index) => box(`invalid-${index}`, { color: "invalid" })) }; },
    ];
    for (const change of changes) {
      const f = fixture(); change(f);
      expect(f.apply(withGuide())).toMatchObject({ ok: false, code: "document-rejected" });
      expectUnchanged(f);
    }
  });

  it("최신 모델 배열의 올바른 attachment를 검사하고 배열과 원본 문서의 attachment를 그대로 보존한다", () => {
    const f = fixture();
    const attachment: StudioBg3dModelAttachment = {
      id: "logical-model", name: "정본 모델.glb", mime: STUDIO_BG3D_GLB_MIME, byteSize: 1024,
      hash: `sha256:${"a".repeat(64)}`, source: "upload",
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
    };
    f.attachments.set("local-model", attachment);
    const model: BgCustomModelInstance = { id: "model", modelId: "local-model", position: [4, 5, 6], rotation: [0, 0, 0], scale: [1, 1, 1] };
    f.live.current = { ...f.live.current, customModels: [model] };
    const models = f.live.current.customModels;
    const storedAttachments = f.live.current.document.attachments;
    expect(f.apply(withGuide()).ok).toBe(true);
    expect(f.live.current.customModels).toBe(models);
    expect(f.live.current.customModels[0]).toBe(model);
    expect(f.live.current.document.attachments).toBe(storedAttachments);
    expect(f.commit.mock.calls[0]?.[3].customModels).toEqual([model]);
  });

  it("최신 배열까지 포함하면 320 KiB를 넘는 실제 후보를 거부한다", () => {
    const f = fixture();
    f.live.current = { ...f.live.current, document: { ...f.live.current.document,
      budgets: { ...f.live.current.document.budgets,
        complexity: { ...f.live.current.document.budgets.complexity, maxNodes: 512 } } } };
    const primitives = Array.from({ length: 500 }, (_, index) => box(`node-${index}`, {
      name: `오브젝트${"나".repeat(48)}`,
      tags: Array.from({ length: 8 }, (_, tag) => `tag-${tag}-${"t".repeat(26)}`),
    }));
    const next = withGuide();
    let fitting: BgPrimitive[] | null = null;
    let size = 0;
    // 전체 장면은 아직 유효하지만 측정 안내선 하나가 추가되면 넘는 실제 경계를 찾는다.
    let minimum = 1;
    let maximum = primitives.length;
    while (minimum <= maximum) {
      const count = Math.floor((minimum + maximum) / 2);
      const candidate = primitives.slice(0, count);
      const attempt = tryAdaptStudioBg3dRuntimeToDocument({ primitives: candidate, customModels: [],
        baseDocument: f.live.current.document, attachmentByStorageModelId: f.attachments });
      if (!attempt.ok) maximum = count - 1;
      else {
        fitting = candidate;
        size = new TextEncoder().encode(attempt.value.serialized).byteLength;
        minimum = count + 1;
      }
    }
    if (!fitting) throw Error("유효한 경계 장면 없음");
    const remaining = STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES - size;
    expect(remaining).toBeLessThan(2_000);
    // meta는 최대 4,000자여서 작은 ASCII 여백으로 경계를 정확히 맞출 수 있다.
    f.live.current = { ...f.live.current, primitives: fitting, document: { ...f.live.current.document,
      meta: { ...f.live.current.document.meta, memo: "m".repeat(Math.max(0, remaining - 30)) } } };
    const before = tryAdaptStudioBg3dRuntimeToDocument({ ...f.live.current, baseDocument: f.live.current.document,
      attachmentByStorageModelId: f.attachments });
    expect(before.ok).toBe(true);
    expect(serializeStudioBg3dMeasurementDocument(next)).not.toBeNull();
    expect(serializeStudioBg3dSceneDocument({ ...f.live.current.document, measurements: next })).not.toBeNull();
    expect(f.apply(next)).toMatchObject({ ok: false, code: "document-rejected" });
    expectUnchanged(f);
  });

  it("검증 후 source ref·snapshot·revision·session·renderer가 바뀌면 쓰지 않는다", () => {
    const mutations: readonly ((f: ReturnType<typeof fixture>) => void)[] = [
      (f) => { f.live.current = { ...f.live.current }; },
      (f) => { f.live.current = { ...f.live.current, revision: 8 }; },
      (f) => { f.session.current = {}; },
      (f) => { f.state.modelRenderer = {}; },
    ];
    for (const mutate of mutations) {
      const f = fixture();
      let reads = 0;
      const host: StudioBg3dMeasurementCommandHost = { ...f.host,
        get modelRenderer() {
          reads += 1;
          if (reads === 3) mutate(f);
          return f.state.modelRenderer;
        },
      };
      expect(applyStudioBg3dMeasurementDocument(host, { expectedCurrent: DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS, next: withGuide() }))
        .toMatchObject({ ok: false, code: "source-changed" });
      expectUnchanged(f, f.live.current.revision);
    }
    const f = fixture();
    let reads = 0;
    const host: StudioBg3dMeasurementCommandHost = { ...f.host,
      get physicsRuntimeSourceRef() { reads += 1; return reads > 1 ? { current: f.live.current } : f.live; },
    };
    expect(applyStudioBg3dMeasurementDocument(host, { expectedCurrent: DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS, next: withGuide() }))
      .toMatchObject({ ok: false, code: "source-changed" });
    expectUnchanged(f);
  });

  it("검증 중 캡처가 시작되면 최종 준비 상태 검사에서 거부한다", () => {
    const f = fixture();
    let reads = 0;
    const host: StudioBg3dMeasurementCommandHost = { ...f.host,
      get modelRenderer() {
        reads += 1;
        if (reads === 3) f.capture.current = true;
        return f.state.modelRenderer;
      },
    };
    expect(applyStudioBg3dMeasurementDocument(host, { expectedCurrent: DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS, next: withGuide() }))
      .toMatchObject({ ok: false, code: "scene-unavailable" });
    expectUnchanged(f);
  });

  it("쓰기 포트의 예외를 성공이나 검증 거절로 숨기지 않는다", () => {
    const f = fixture();
    const error = Error("history 포트 계약 위반");
    f.commit.mockImplementation(() => { throw error; });
    expect(() => f.apply(withGuide())).toThrow(error);
    expect(f.replace).not.toHaveBeenCalled();
    const g = fixture();
    g.replace.mockImplementation(() => { throw error; });
    expect(() => g.apply(withGuide())).toThrow(error);
    expect(g.commit).toHaveBeenCalledTimes(1);
  });
});
