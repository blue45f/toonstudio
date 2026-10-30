import { describe, expect, it, vi } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { createStudioBg3dGeneratedPartsCommand } from "./studio-bg3d-generated-parts-command";
import {
  commitStudioBg3dHistoryTransition,
  resetStudioBg3dCommandHistory,
  stepStudioBg3dCommandHistory,
  type StudioBg3dHistoryCommandRefs,
} from "./studio-bg3d-history-command-adapter";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment, StudioBg3dTexturePaint, StudioBg3dTexturePaintPoint } from "./studio-bg3d-scene-document-types";
import { adaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

type Ports = Parameters<typeof createStudioBg3dGeneratedPartsCommand>[0];

function box(id: string, patch: Partial<BgPrimitive> = {}): BgPrimitive {
  return { id, name: id, kind: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff", ...patch };
}

/** 제품과 같은 history adapter를 사용한다. debounce나 가짜 undo 함수는 실행하지 않는다. */
function fixture(primitives: readonly BgPrimitive[] = [], customModels: readonly BgCustomModelInstance[] = []) {
  let live: ReturnType<Ports["readRuntime"]> = { primitives, customModels, document: createDefaultStudioBg3dSceneDocument() };
  const history: StudioBg3dHistoryCommandRefs = {
    historyRef: { current: [] }, historyIndexRef: { current: -1 }, historyCommandTimelineRef: { current: null },
  };
  resetStudioBg3dCommandHistory(history, createStudioBg3dHistorySnapshot(live));
  const calls = {
    replace: vi.fn<Ports["replace"]>((mutation) => { live = { ...live, primitives: [...mutation.primitives] }; }),
    select: vi.fn<Ports["select"]>(),
    canAdmit: vi.fn<Ports["canAdmitSceneNodes"]>((count) => count + live.primitives.length + live.customModels.length <= live.document.budgets.complexity.maxNodes),
    rejected: vi.fn<() => void>(),
    commitHistory: vi.fn<Ports["commitHistory"]>((nextPrimitives, nextModels, document, before, options) => {
      commitStudioBg3dHistoryTransition(history, {
        before, after: createStudioBg3dHistorySnapshot({ primitives: nextPrimitives, customModels: nextModels, document }),
        commandId: options.commandId, label: options.label, source: options.source,
      });
    }),
  };
  const command = createStudioBg3dGeneratedPartsCommand({
    readRuntime: () => live, readView: () => live.document.camera,
    canAdmitSceneNodes: calls.canAdmit, replace: calls.replace, select: calls.select,
    commitHistory: calls.commitHistory, onPersistenceRejected: calls.rejected,
    readAttachments: () => new Map<string, StudioBg3dModelAttachment>(),
  });
  return { command, calls, history, read: () => live };
}

describe("공식 도형 묶음 추가 명령의 선택·저장·history 경계", () => {
  it("debounce가 오기 전 두 요청도 각각 한 번씩 Undo/Redo한다", () => {
    const { command, calls, history, read } = fixture();
    const first = [box("first-a"), box("first-b")];
    const second = [box("second-a")];
    expect(command(() => first, { immediateHistory: true, selectAll: true, labelKo: "첫 번째 배열" })).toEqual(first);
    const firstState = createStudioBg3dHistorySnapshot(read());
    expect(command(() => second, { immediateHistory: true, selectAll: true, labelKo: "두 번째 배열" })).toEqual(second);
    const secondState = createStudioBg3dHistorySnapshot(read());
    expect(calls.commitHistory).toHaveBeenCalledTimes(2);
    expect(calls.replace).toHaveBeenCalledTimes(2);
    expect(calls.commitHistory.mock.calls.map((args) => args[4].label)).toEqual(["첫 번째 배열", "두 번째 배열"]);
    expect(stepStudioBg3dCommandHistory(history, "undo")?.state).toEqual(firstState);
    expect(stepStudioBg3dCommandHistory(history, "undo")?.state.primitives).toEqual([]);
    expect(stepStudioBg3dCommandHistory(history, "undo")?.status).toBe("empty");
    expect(stepStudioBg3dCommandHistory(history, "redo")?.state).toEqual(firstState);
    expect(stepStudioBg3dCommandHistory(history, "redo")?.state).toEqual(secondState);
  });

  it("기존 기본 호출은 첫 도형 선택과 지연 history 경로를 유지한다", () => {
    const { command, calls, history, read } = fixture([box("existing")]);
    const build = vi.fn(() => [box("a"), box("b")]);
    expect(command(build)).toMatchObject([{ id: "a" }, { id: "b" }]);
    expect(build).toHaveBeenCalledWith(1, read().document.camera);
    expect(calls.select).toHaveBeenCalledExactlyOnceWith(new Set(["a"]));
    expect(calls.commitHistory).not.toHaveBeenCalled();
    expect(read().primitives.map(({ id }) => id)).toEqual(["existing", "a", "b"]);
    expect(history.historyRef.current).toHaveLength(1);
  });

  it("전체 선택은 자식이 입력에서 먼저 와도 부모를 드라이버 앞에 둔다", () => {
    const { command, calls } = fixture();
    expect(command(() => [box("child", { parentId: "parent" }), box("parent")], { selectAll: true, immediateHistory: true })).not.toBe(false);
    const selected = calls.select.mock.calls[0]?.[0];
    expect(selected ? [...selected] : []).toEqual(["parent", "child"]);
  });

  it("빈 묶음과 노드 예산 거부는 history·문서·선택을 바꾸지 않는다", () => {
    const { command, calls, history, read } = fixture([box("existing")]);
    const original = createStudioBg3dHistorySnapshot(read());
    expect(command(() => [], { immediateHistory: true })).toBe(false);
    expect(calls.canAdmit).not.toHaveBeenCalled();
    calls.canAdmit.mockReturnValue(false);
    expect(command(() => [box("rejected")], { immediateHistory: true, selectAll: true })).toBe(false);
    expect(calls.replace).not.toHaveBeenCalled();
    expect(calls.select).not.toHaveBeenCalled();
    expect(calls.commitHistory).not.toHaveBeenCalled();
    expect(createStudioBg3dHistorySnapshot(read())).toEqual(original);
    expect(history.historyRef.current).toHaveLength(1);
  });

  it("최종 노드 ID를 적용한 페인트 후보가 문서 바이트 예산을 넘으면 history를 기록하지 않는다", () => {
    const points: StudioBg3dTexturePaintPoint[] = Array.from({ length: 512 }, (_, index) => [(index * 7 + 1) / 4096, (index * 5 + 1) / 4096]);
    const texturePaint: StudioBg3dTexturePaint = { version: 1,
      strokes: Array.from({ length: 16 }, () => ({ color: "#123456", size: 0.04, opacity: 1, points })) };
    const source = box("painted", { texturePaint });
    const { command, calls, read, history } = fixture([source]);
    const original = adaptStudioBg3dRuntimeToDocument({ primitives: [source], customModels: [], attachmentByStorageModelId: new Map(), baseDocument: read().document });
    expect(new TextEncoder().encode(original.serialized).byteLength).toBeLessThan(320 * 1024);
    expect(command(() => [box(`bg3d-${"a".repeat(36)}`, { texturePaint })], { immediateHistory: true, selectAll: true })).toBe(false);
    expect(calls.rejected).toHaveBeenCalledOnce();
    expect(calls.commitHistory).not.toHaveBeenCalled();
    expect(calls.replace).not.toHaveBeenCalled();
    expect(calls.select).not.toHaveBeenCalled();
    expect(read().primitives).toEqual([source]);
    expect(history.historyRef.current).toHaveLength(1);
  });

  it("저장 adapter가 누락 모델을 버리는 후보도 성공으로 처리하지 않는다", () => {
    const models: BgCustomModelInstance[] = [{ id: "model", modelId: "unbound-storage", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }];
    const { command, calls, read } = fixture([], models);
    expect(command(() => [box("new")], { immediateHistory: true })).toBe(false);
    expect(calls.rejected).toHaveBeenCalledOnce();
    expect(calls.commitHistory).not.toHaveBeenCalled();
    expect(calls.replace).not.toHaveBeenCalled();
    expect(read().customModels).toEqual(models);
  });
});
