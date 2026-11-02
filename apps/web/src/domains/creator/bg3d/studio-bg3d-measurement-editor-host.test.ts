// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
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
  type StudioBg3dMeasurementDocument,
} from "./studio-bg3d-measurement";
import type {
  StudioBg3dMeasurementCommandHost,
  StudioBg3dMeasurementCommandResult,
} from "./studio-bg3d-measurement-command";
import {
  commitStudioBg3dMeasurementEditorDocument,
  type StudioBg3dMeasurementEditorHost,
} from "./studio-bg3d-measurement-editor-host";
import type { StudioBg3dPhysicsPhase } from "./studio-bg3d-physics-ui";
import { createDefaultStudioBg3dSceneDocument, STUDIO_BG3D_GLB_MIME } from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment } from "./studio-bg3d-scene-document-types";
import { readStudioBg3dSceneMeasurements } from "./studio-bg3d-scene-measurements";
import { useStudioBg3dCanonicalDocumentState } from "./useStudioBg3dCanonicalDocumentState";

type MutableEditorHost = {
  -readonly [Key in keyof StudioBg3dMeasurementEditorHost]: StudioBg3dMeasurementEditorHost[Key];
};

/** 실제 adapter가 모델 원본 연결을 읽는 순간 다른 편집 작업이 시작되는 경계를 만든다. */
class MeasurementAttachmentMap extends Map<string, StudioBg3dModelAttachment> {
  afterRead: (() => void) | null = null;

  override get(key: string): StudioBg3dModelAttachment | undefined {
    const value = super.get(key);
    const callback = this.afterRead;
    this.afterRead = null;
    callback?.();
    return value;
  }
}

function box(id = "box"): BgPrimitive {
  return { id, name: "현재 도형", kind: "box", color: "#abcdef", position: [1, 2, 3],
    rotation: [0, 0, 0], scale: [2, 3, 4] };
}

function withGuide(document: StudioBg3dMeasurementDocument): StudioBg3dMeasurementDocument {
  const added = addStudioBg3dMeasurementGuide(document, { startWorld: [0, 0, 0], endWorld: [2, 0, 0] });
  if (!added.ok) throw new Error(added.code);
  return added.document;
}

function fixture(id = "box") {
  const initialDocument = { ...createDefaultStudioBg3dSceneDocument(), meta: { name: `장면 ${id}` } };
  const view = renderHook(() => useStudioBg3dCanonicalDocumentState({ initialDocument }));
  act(() => { view.result.current.setPrimitives([box(id)]); });
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null },
  };
  const resetHistory = () => resetStudioBg3dCommandHistory(history,
    createStudioBg3dHistorySnapshot(view.result.current.liveSceneRef.current));
  resetHistory();
  const session: { current: object | null } = { current: { id } };
  const capture = { current: false };
  const phase: { current: StudioBg3dPhysicsPhase } = { current: "idle" };
  const restore: { current: AbortController | null } = { current: null };
  const attachments = new MeasurementAttachmentMap();
  const replace = vi.fn<StudioBg3dMeasurementCommandHost["replaceCanonicalDocumentState"]>((mutation) =>
    view.result.current.replaceCanonicalDocumentState(mutation));
  const commit = vi.fn<StudioBg3dMeasurementCommandHost["commitImmediateHistoryTransition"]>((primitives, customModels, document, before, options) => {
    commitStudioBg3dHistoryTransition(history, { before,
      after: createStudioBg3dHistorySnapshot({ primitives, customModels, document }), ...options });
  });
  const host: MutableEditorHost = {
    open: true, modelRenderer: {}, isRestoringScene: false, isCapturing: false,
    isBatchRenderingShots: false, physicsInteractionLocked: false,
    physicsRuntimeSourceRef: view.result.current.liveSceneRef,
    modalAssetSessionRef: session, captureInFlightRef: capture,
    physicsPhaseRef: phase, sceneRestoreAbortRef: restore,
    attachmentByStorageModelIdRef: { current: attachments },
    replaceCanonicalDocumentState: replace, commitImmediateHistoryTransition: commit,
  };
  const currentMeasurement = () => readStudioBg3dSceneMeasurements(view.result.current.sceneBaseDocument);
  // 실제 measure-host와 같이 가변 host 자체를 참조하는 오래 살아 있는 UI 콜백이다.
  const onDocumentChange = (next: StudioBg3dMeasurementDocument, expectedCurrent: StudioBg3dMeasurementDocument) =>
    commitStudioBg3dMeasurementEditorDocument(host, next, expectedCurrent);
  const invoke = (
    next: StudioBg3dMeasurementDocument,
    expectedCurrent = currentMeasurement(),
    callback = onDocumentChange,
  ): StudioBg3dMeasurementCommandResult => {
    const response: { value?: StudioBg3dMeasurementCommandResult } = {};
    act(() => { response.value = callback(next, expectedCurrent); });
    if (!response.value) throw new Error("측정 명령 결과가 필요합니다.");
    return response.value;
  };
  return { view, host, history, session, capture, phase, restore, attachments,
    replace, commit, currentMeasurement, onDocumentChange, invoke, resetHistory };
}

function prepareModel(f: ReturnType<typeof fixture>): void {
  f.attachments.set("local-model", {
    id: "scene-model", name: "검사할 모델.glb", mime: STUDIO_BG3D_GLB_MIME, byteSize: 1024,
    hash: `sha256:${"b".repeat(64)}`, source: "upload",
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
  });
  act(() => {
    f.view.result.current.setCustomModels([{ id: "model", modelId: "local-model",
      position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }]);
  });
  f.resetHistory();
}

afterEach(cleanup);

describe("측정 패널과 최신 정본을 잇는 가변 편집기 브리지", () => {
  it("승인된 변경을 실제 hook의 한 revision과 한 history에 반영하고 Undo/Redo로 재표시한다", () => {
    const f = fixture();
    const before = f.view.result.current.liveSceneRef.current;
    const expectedCurrent = f.currentMeasurement();
    const next = withGuide(expectedCurrent);
    expect(f.invoke(next, expectedCurrent)).toEqual({ ok: true, changed: true, document: next });
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledTimes(1);
    expect(f.view.result.current.canonicalRevision).toBe(before.revision + 1);
    expect(f.view.result.current.liveSceneRef.current.primitives).toBe(before.primitives);
    expect(f.view.result.current.liveSceneRef.current.customModels).toBe(before.customModels);
    expect(Object.keys(f.replace.mock.calls[0]?.[0] ?? {})).toEqual(["document"]);
    expect(f.currentMeasurement()).toEqual(next);
    expect(f.history.historyIndexRef.current).toBe(1);
    expect(f.history.historyRef.current).toHaveLength(2);

    const undo = stepStudioBg3dCommandHistory(f.history, "undo");
    if (!undo) throw new Error("측정 변경을 되돌릴 수 있어야 합니다.");
    act(() => { f.view.result.current.replaceCanonicalDocumentState(undo.state); });
    expect(f.currentMeasurement()).toEqual(expectedCurrent);
    expect(f.view.result.current.primitives).toEqual(before.primitives);
    const redo = stepStudioBg3dCommandHistory(f.history, "redo");
    if (!redo) throw new Error("측정 변경을 다시 적용할 수 있어야 합니다.");
    act(() => { f.view.result.current.replaceCanonicalDocumentState(redo.state); });
    expect(f.currentMeasurement()).toEqual(next);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledTimes(1);
  });

  it("반영 후 같은 값을 다시 승인받아도 revision과 history를 중복으로 만들지 않는다", () => {
    const f = fixture();
    const next = withGuide(f.currentMeasurement());
    expect(f.invoke(next).ok).toBe(true);
    const committed = f.view.result.current.liveSceneRef.current;
    expect(f.invoke({ ...next, guides: [...next.guides] })).toEqual({ ok: true, changed: false, document: next });
    expect(f.view.result.current.liveSceneRef.current).toBe(committed);
    expect(f.history.historyRef.current).toHaveLength(2);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledTimes(1);
  });

  it("패널이 받은 expectedCurrent를 그대로 검사해 다른 작업의 새 문서를 덮어쓰지 않는다", () => {
    const f = fixture();
    const renderedMeasurement = f.currentMeasurement();
    const staleCallback = f.onDocumentChange;
    const latest = withGuide(createStudioBg3dMeasurementDocument("mm"));
    act(() => {
      f.view.result.current.replaceCanonicalDocumentState({ document: {
        ...f.view.result.current.liveSceneRef.current.document, measurements: latest,
      } });
    });
    f.resetHistory();
    const before = f.view.result.current.liveSceneRef.current;
    expect(f.invoke(withGuide(renderedMeasurement), renderedMeasurement, staleCallback))
      .toMatchObject({ ok: false, code: "source-changed" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.currentMeasurement()).toEqual(latest);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.history.historyRef.current).toHaveLength(1);

    // 같은 UI 콜백도 새 렌더에서 받은 문서를 사용하면 현재 상태 위에 반영한다.
    expect(f.invoke(withGuide(latest), latest, staleCallback).ok).toBe(true);
    expect(f.currentMeasurement().guides).toHaveLength(2);
    expect(f.currentMeasurement().unit).toBe("mm");
    expect(f.history.historyIndexRef.current).toBe(1);
  });

  it("기존 UI 콜백은 새 렌더로 교체된 장면·세션·참조·함수와 this를 사용한다", () => {
    const first = fixture("old-box"), latest = fixture("new-box");
    const callback = first.onDocumentChange;
    const oldScene = first.view.result.current.liveSceneRef.current;
    first.capture.current = true;
    first.phase.current = "running";
    first.restore.current = new AbortController();
    first.session.current = null;

    const attachment: StudioBg3dModelAttachment = {
      id: "scene-model", name: "새 모델.glb", mime: STUDIO_BG3D_GLB_MIME, byteSize: 1024,
      hash: `sha256:${"a".repeat(64)}`, source: "upload",
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
    };
    latest.attachments.set("new-local-model", attachment);
    act(() => {
      latest.view.result.current.setCustomModels([{ id: "new-model", modelId: "new-local-model",
        position: [4, 5, 6], rotation: [0, 0, 0], scale: [1, 1, 1] }]);
    });
    latest.resetHistory();
    const nextReplace = vi.fn<StudioBg3dMeasurementCommandHost["replaceCanonicalDocumentState"]>(function (this: MutableEditorHost, mutation) {
      expect(this).toBe(first.host);
      return latest.replace(mutation);
    });
    const nextCommit = vi.fn<StudioBg3dMeasurementCommandHost["commitImmediateHistoryTransition"]>(function (this: MutableEditorHost, ...args) {
      expect(this).toBe(first.host);
      latest.commit(...args);
    });
    Object.assign(first.host, latest.host, {
      replaceCanonicalDocumentState: nextReplace, commitImmediateHistoryTransition: nextCommit,
    });
    const expectedCurrent = latest.currentMeasurement();
    const next = withGuide(expectedCurrent);
    expect(first.invoke(next, expectedCurrent, callback)).toEqual({ ok: true, changed: true, document: next });
    expect(first.view.result.current.liveSceneRef.current).toBe(oldScene);
    expect(first.commit).not.toHaveBeenCalled();
    expect(first.replace).not.toHaveBeenCalled();
    expect(nextCommit).toHaveBeenCalledTimes(1);
    expect(nextReplace).toHaveBeenCalledTimes(1);
    expect(latest.currentMeasurement()).toEqual(next);
    expect(latest.view.result.current.customModels[0]?.id).toBe("new-model");
    expect(latest.history.historyIndexRef.current).toBe(1);
    expect(first.history.historyIndexRef.current).toBe(0);
  });

  it.each(["capture", "capture-ref", "restore", "restore-ref"] as const)
  ("렌더 값이 준비 상태여도 최신 %s 잠금을 확인하고 해제 뒤 한 번만 반영한다", (lock) => {
    const f = fixture();
    const callback = f.onDocumentChange;
    const before = f.view.result.current.liveSceneRef.current;
    const expectedCurrent = f.currentMeasurement();
    const next = withGuide(expectedCurrent);
    if (lock === "capture") f.capture.current = true;
    if (lock === "capture-ref") f.host.captureInFlightRef = { current: true };
    if (lock === "restore") f.restore.current = new AbortController();
    if (lock === "restore-ref") f.host.sceneRestoreAbortRef = { current: new AbortController() };
    expect(f.host.isCapturing).toBe(false);
    expect(f.host.isRestoringScene).toBe(false);
    expect(f.invoke(next, expectedCurrent, callback)).toMatchObject({ ok: false, code: "scene-unavailable" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    f.capture.current = false;
    f.host.captureInFlightRef = { current: false };
    f.restore.current = null;
    f.host.sceneRestoreAbortRef = { current: null };
    expect(f.invoke(next, expectedCurrent, callback).ok).toBe(true);
    expect(f.commit).toHaveBeenCalledTimes(1);
    expect(f.replace).toHaveBeenCalledTimes(1);
    expect(f.history.historyRef.current).toHaveLength(2);
  });

  it("복원 AbortController를 취소해도 참조 정리가 끝나기 전에는 측정을 쓰지 않는다", () => {
    const f = fixture();
    const controller = new AbortController();
    f.restore.current = controller;
    controller.abort();
    const before = f.view.result.current.liveSceneRef.current;
    expect(f.invoke(withGuide(f.currentMeasurement()))).toMatchObject({ ok: false, code: "scene-unavailable" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
  });

  it.each(["loading", "running", "paused", "complete", "baking"] satisfies StudioBg3dPhysicsPhase[])
  ("물리 렌더 잠금이 아직 false여도 최신 %s ref 동안 안내선을 쓰지 않는다", (phase) => {
    const f = fixture();
    const expectedCurrent = f.currentMeasurement();
    const before = f.view.result.current.liveSceneRef.current;
    f.phase.current = phase;
    expect(f.host.physicsInteractionLocked).toBe(false);
    expect(f.invoke(withGuide(expectedCurrent), expectedCurrent)).toMatchObject({ ok: false, code: "scene-unavailable" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    f.host.physicsPhaseRef = { current: "idle" };
    expect(f.invoke(withGuide(expectedCurrent), expectedCurrent).ok).toBe(true);
    expect(f.history.historyIndexRef.current).toBe(1);
  });

  it.each(["capture", "restore", "physics"] as const)
  ("검증 중 시작된 %s 작업도 최신 ref로 확인해 최종 반영을 거부한다", (lock) => {
    const f = fixture();
    prepareModel(f);
    const before = f.view.result.current.liveSceneRef.current;
    f.attachments.afterRead = () => {
      if (lock === "capture") f.host.captureInFlightRef = { current: true };
      if (lock === "restore") f.host.sceneRestoreAbortRef = { current: new AbortController() };
      if (lock === "physics") f.host.physicsPhaseRef = { current: "running" };
    };
    expect(f.invoke(withGuide(f.currentMeasurement()))).toMatchObject({ ok: false, code: "scene-unavailable" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
  });

  it("검증 중 새 세션 ref가 연결되면 이전 장면 명령을 새 세션으로 보내지 않는다", () => {
    const f = fixture();
    prepareModel(f);
    const before = f.view.result.current.liveSceneRef.current;
    f.attachments.afterRead = () => { f.host.modalAssetSessionRef = { current: { epoch: 2 } }; };
    expect(f.invoke(withGuide(f.currentMeasurement()))).toMatchObject({ ok: false, code: "source-changed" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.history.historyRef.current).toHaveLength(1);
  });

  it.each(["physicsRuntimeSourceRef", "attachmentByStorageModelIdRef", "captureInFlightRef", "modalAssetSessionRef",
    "commitImmediateHistoryTransition", "replaceCanonicalDocumentState"] satisfies (keyof StudioBg3dMeasurementEditorHost)[])
  ("production 브리지의 필수 %s가 빠지면 장면이나 history에 쓰지 않는다", (port) => {
    const f = fixture();
    const incomplete: StudioBg3dMeasurementEditorHost = { ...f.host, [port]: undefined };
    const before = f.view.result.current.liveSceneRef.current;
    expect(commitStudioBg3dMeasurementEditorDocument(incomplete, withGuide(f.currentMeasurement()), f.currentMeasurement()))
      .toMatchObject({ ok: false, code: "scene-unavailable" });
    expect(f.view.result.current.liveSceneRef.current).toBe(before);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.replace).not.toHaveBeenCalled();
    expect(f.history.historyRef.current).toHaveLength(1);
  });

  it("장면 전환으로 최신 세션이 사라지거나 편집기가 닫힌 경우 기존 콜백도 거부한다", () => {
    for (const close of [
      (f: ReturnType<typeof fixture>) => { f.host.modalAssetSessionRef = { current: null }; },
      (f: ReturnType<typeof fixture>) => { f.host.open = false; },
      (f: ReturnType<typeof fixture>) => { f.host.modelRenderer = null; },
    ]) {
      const f = fixture();
      const callback = f.onDocumentChange;
      const before = f.view.result.current.liveSceneRef.current;
      const expectedCurrent = f.currentMeasurement();
      close(f);
      expect(f.invoke(withGuide(expectedCurrent), expectedCurrent, callback)).toMatchObject({ ok: false, code: "scene-unavailable" });
      expect(f.view.result.current.liveSceneRef.current).toBe(before);
      expect(f.commit).not.toHaveBeenCalled();
      expect(f.replace).not.toHaveBeenCalled();
    }
  });
});
