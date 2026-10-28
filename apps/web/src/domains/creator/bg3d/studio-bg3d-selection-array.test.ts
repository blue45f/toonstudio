import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import type { StudioBg3dTexturePaint, StudioBg3dTexturePaintPoint } from "./studio-bg3d-scene-document-types";
import {
  createStudioBg3dSelectionArrayFromHost,
  inspectStudioBg3dSelectionArrayHost,
  type StudioBg3dSelectionArrayRequest,
} from "./studio-bg3d-selection-array";
import { calculateStudioBg3dThreeWorldMatrix } from "./studio-bg3d-three-hierarchy";
import type { StudioBg3dAddGeneratedParts } from "./studio-bg3d-workbench-insertion";

const CAMERA = { position: [4, 3, 6], target: [0, 0, 0], fovDegrees: 45 } as const;
const LINEAR: StudioBg3dSelectionArrayRequest = { mode: "linear", token: "*2", delta: [2, 0, 0] };

function box(id: string, patch: Partial<BgPrimitive> = {}): BgPrimitive {
  return { id, name: id, kind: "box", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#ffffff", ...patch };
}

function fixture(primitives: readonly BgPrimitive[]) {
  const customModels: BgCustomModelInstance[] = [];
  const live = { primitives: [...primitives], customModels, document: createDefaultStudioBg3dSceneDocument() };
  const host = {
    open: true, modelRenderer: {}, isRestoringScene: false, isCapturing: false,
    selectedIds: new Set(primitives.map(({ id }) => id)),
    physicsRuntimeSourceRef: { current: live },
    setSelectedIds: vi.fn<(ids: Set<string>) => void>(),
    addGeneratedParts: vi.fn<StudioBg3dAddGeneratedParts>((build) => {
      const added = build(live.primitives.length, CAMERA);
      live.primitives = [...live.primitives, ...added];
      return added;
    }),
  };
  host.setSelectedIds.mockImplementation((ids) => { host.selectedIds = ids; });
  return { host, live, execute: createStudioBg3dSelectionArrayFromHost(host) };
}

function matrix(primitive: BgPrimitive): Matrix4 {
  return new Matrix4().compose(new Vector3(...primitive.position),
    new Quaternion().setFromEuler(new Euler(...primitive.rotation, "XYZ")), new Vector3(...primitive.scale));
}

function expectMatrixClose(actual: Matrix4 | null, expected: Matrix4): void {
  expect(actual).not.toBeNull();
  if (!actual) throw new Error("월드 변환을 계산하지 못했습니다.");
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index] ?? Number.NaN, 7));
}

describe("선택한 실제 도형 반복 배치", () => {
  it("다중 선택을 음수 간격으로 복제하고 종류·치수·원본을 보존하며 사본 전체를 선택한다", () => {
    const source = [box("a", { kind: "cylinder", scale: [0.5, 2, 0.8], tags: ["가구"] }), box("b", { position: [1, 3, 0] })];
    const original = structuredClone(source);
    const { host, live, execute } = fixture(source);
    expect(execute({ mode: "linear", token: "3x", delta: [-2, 0, 0] })).toEqual({
      ok: true, addedNodeCount: 6, copyCount: 3, selectedNodeCount: 2, normalizedToken: "*3",
    });
    expect(host.addGeneratedParts).toHaveBeenCalledTimes(1);
    expect(host.addGeneratedParts.mock.calls[0]?.[1]).toEqual({ labelKo: "선택 도형 반복 배치", selectAll: true, immediateHistory: true });
    const added = live.primitives.slice(2);
    expect(added.map(({ position }) => position[0])).toEqual([-2, -1, -4, -3, -6, -5]);
    expect(added.filter(({ name }) => name === "a").every((item) => item.kind === "cylinder" && JSON.stringify(item.scale) === JSON.stringify([0.5, 2, 0.8]))).toBe(true);
    expect(new Set(live.primitives.map(({ id }) => id)).size).toBe(8);
    expect(host.selectedIds).toEqual(new Set(added.map(({ id }) => id)));
    expect(source).toEqual(original);
    expect(added[0]?.tags).not.toBe(source[0]?.tags);
  });

  it("/N은 원본을 제외하고 전체 거리를 N등분한 위치에 끝점까지 N개 배치한다", () => {
    const { live, execute } = fixture([box("a")]);
    expect(execute({ mode: "linear", token: "/3", delta: [6, 0, 0] }).ok).toBe(true);
    expect(live.primitives.map(({ position }) => position[0])).toEqual([0, 2, 4, 6]);
  });

  it("명령을 만든 뒤 바뀐 선택과 최신 도형 좌표를 실행 시 읽는다", () => {
    const { host, live, execute } = fixture([box("a"), box("b")]);
    host.selectedIds = new Set(["b"]);
    live.primitives = [box("a"), box("b", { position: [10, 1, 2] })];
    expect(execute({ mode: "linear", token: "*1", delta: [3, 0, 0] }).ok).toBe(true);
    expect(live.primitives[2]).toMatchObject({ name: "b", position: [13, 1, 2] });
  });

  const axes: readonly ("x" | "y" | "z")[] = ["x", "y", "z"];
  it.each(axes)("기울어진 도형을 월드 %s축 quaternion 순서로 회전하고 사용자 피벗을 유지한다", (axis) => {
    const source = box("tilted", { position: [4, 5, 6], rotation: [0.3, 0.7, -0.4], scale: [1.2, 2, 0.6] });
    const { live, execute } = fixture([source]);
    const pivot: [number, number, number] = [1, 2, -3];
    expect(execute({ mode: "radial", token: "*1", axis, angleDegrees: -70, pivot }).ok).toBe(true);
    const direction = axis === "x" ? new Vector3(1, 0, 0) : axis === "y" ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
    const delta = new Quaternion().setFromAxisAngle(direction, -70 * Math.PI / 180);
    const expectedPosition = new Vector3(...source.position).sub(new Vector3(...pivot)).applyQuaternion(delta).add(new Vector3(...pivot));
    const expectedQuaternion = new Quaternion().setFromEuler(new Euler(...source.rotation, "XYZ")).premultiply(delta);
    const expected = new Matrix4().compose(expectedPosition, expectedQuaternion, new Vector3(...source.scale));
    const added = live.primitives[1];
    if (!added) throw new Error("회전 사본이 없습니다.");
    expectMatrixClose(matrix(added), expected);
    expect(source.position).toEqual([4, 5, 6]);
  });

  it.each(axes)("위치 ±10000 경계에서 월드 %s축 90° 회전의 반올림 오차만 보정한다", (axis) => {
    const { live, execute } = fixture([box("edge-position", { position: [10_000, 10_000, 10_000] })]);
    expect(execute({ mode: "radial", token: "*1", axis, angleDegrees: 90, pivot: [0, 0, 0] }).ok).toBe(true);
    const copy = live.primitives[1];
    if (!copy) throw new Error("위치 경계의 사본이 없습니다.");
    expect(copy.position.every((value) => Math.abs(value) <= 10_000)).toBe(true);
    expect(copy.position.every((value) => Math.abs(Math.abs(value) - 10_000) < 1e-8)).toBe(true);
  });

  it("부모·자식 선택은 자식의 local 변환을 유지해 월드 델타를 한 번만 적용한다", () => {
    const parent = box("parent", { position: [1, 2, 3], rotation: [0.1, 0.5, 0.2], scale: [2, 3, 4] });
    const child = box("child", { parentId: "parent", linkedSourceId: "parent", position: [1, 2, -1], rotation: [0.3, 0.4, 0.5] });
    // 자식이 입력에서 먼저 와도 새 선택의 드라이버는 부모여야 한다.
    const { live, host, execute } = fixture([child, parent]);
    expect(execute({ mode: "radial", token: "*2", axis: "y", angleDegrees: 60, pivot: [0, 0, 0] }).ok).toBe(true);
    const added = live.primitives.slice(2);
    for (let copyIndex = 0; copyIndex < 2; copyIndex += 1) {
      const copiedChild = added[copyIndex * 2];
      const copiedParent = added[copyIndex * 2 + 1];
      if (!copiedChild || !copiedParent) throw new Error("계층 사본이 없습니다.");
      expect(copiedChild.parentId).toBe(copiedParent.id);
      expect(copiedChild.linkedSourceId).toBe(copiedParent.id);
      expect(copiedChild.position).toEqual(child.position);
      expect(copiedChild.rotation).toEqual(child.rotation);
      const worldDelta = new Matrix4().makeRotationY((copyIndex + 1) * Math.PI / 3);
      expectMatrixClose(calculateStudioBg3dThreeWorldMatrix(added, copiedChild.id), worldDelta.multiply(matrix(parent)).multiply(matrix(child)));
    }
    expect([...host.selectedIds].slice(0, 2)).toEqual([added[1]?.id, added[3]?.id]);
  });

  it("선택 밖의 균일 크기 부모에서 분리할 때 원래 월드 위치·방향·크기를 보존한다", () => {
    const parent = box("parent", { position: [4, 3, 2], rotation: [0.2, 0.7, 0.1], scale: [2, 2, 2] });
    const child = box("child", { parentId: "parent", linkedSourceId: "parent", position: [1, 2, 3], rotation: [0.4, 0.1, 0.2] });
    const { live, host, execute } = fixture([parent, child]);
    host.selectedIds = new Set(["child"]);
    expect(execute({ mode: "linear", token: "*1", delta: [3, -2, 1] }).ok).toBe(true);
    const copied = live.primitives[2];
    if (!copied) throw new Error("자식 사본이 없습니다.");
    expect(copied.parentId).toBeNull();
    expect(copied.linkedSourceId).toBeUndefined();
    expectMatrixClose(matrix(copied), new Matrix4().makeTranslation(3, -2, 1).multiply(matrix(parent)).multiply(matrix(child)));
  });

  it("선택 밖의 비균일 부모가 만든 shear는 일부 복제 없이 거부한다", () => {
    const { host, live, execute } = fixture([box("parent", { scale: [2, 3, 4] }), box("child", { parentId: "parent", rotation: [0.2, 0.4, 0.6] })]);
    host.selectedIds = new Set(["child"]);
    expect(execute(LINEAR)).toMatchObject({ ok: false, code: "unsupported-transform" });
    expect(live.primitives).toHaveLength(2);
    expect(host.addGeneratedParts).not.toHaveBeenCalled();
  });

  it("허용 크기 경계의 회전도 부동소수점 오차 때문에 거부하거나 치수를 바꾸지 않는다", () => {
    const source = box("edge-scale", { rotation: [0.3, 0.7, -0.4], scale: [1000, 0.001, 1] });
    const { live, execute } = fixture([source]);
    expect(execute({ mode: "radial", token: "*1", axis: "y", angleDegrees: 45, pivot: [0, 0, 0] }).ok).toBe(true);
    const copy = live.primitives[1];
    if (!copy) throw new Error("경계 크기의 사본이 없습니다.");
    expect(copy.scale[0]).toBeCloseTo(1000, 8);
    expect(copy.scale[1]).toBeCloseTo(0.001, 12);
    expect(copy.scale[0]).toBeLessThanOrEqual(1000);
    expect(copy.scale[1]).toBeGreaterThanOrEqual(0.001);
  });

  it("혼합 외부 모델과 누락 ID는 선택의 유효한 부분도 복제하지 않는다", () => {
    const { host, live, execute } = fixture([box("a")]);
    live.customModels.push({ id: "model", modelId: "stored", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    for (const id of ["model", "missing"]) {
      host.selectedIds = new Set(["a", id]);
      expect(inspectStudioBg3dSelectionArrayHost(host).blockedReason).not.toBeNull();
      expect(execute(LINEAR)).toMatchObject({ ok: false, code: "invalid-selection" });
    }
    expect(host.addGeneratedParts).not.toHaveBeenCalled();
  });

  it("숨김·숨긴 부모·태그·잠긴 부모를 inspector와 실행 경로 모두에서 차단한다", () => {
    const { host, live, execute } = fixture([box("parent"), box("child", { parentId: "parent" })]);
    host.selectedIds = new Set(["child"]);
    const blockedParents = [box("parent", { visible: false }), box("parent", { locked: true }), box("parent", { tags: ["감춤"] })];
    live.document = { ...live.document, meta: { hiddenTags: ["감춤"] } };
    for (const parent of blockedParents) {
      live.primitives[0] = parent;
      expect(inspectStudioBg3dSelectionArrayHost(host).blockedReason).not.toBeNull();
      expect(execute(LINEAR)).toMatchObject({ ok: false, code: "selection-unavailable" });
    }
    live.primitives = [box("parent"), box("child", { visible: false })];
    expect(execute(LINEAR)).toMatchObject({ ok: false, code: "selection-unavailable" });
    expect(host.addGeneratedParts).not.toHaveBeenCalled();
  });

  it("순환·없는 부모와 음수·0 크기를 원본이나 사본의 정규화로 감추지 않는다", () => {
    const variants: readonly BgPrimitive[][] = [
      [box("a", { parentId: "missing" })],
      [box("a", { parentId: "b" }), box("b", { parentId: "a" })],
      [box("a", { scale: [-1, 1, 1] })],
      [box("a", { scale: [1, 0, 1] })],
    ];
    for (const source of variants) {
      const { host, execute } = fixture(source);
      expect(execute(LINEAR).ok).toBe(false);
      expect(host.addGeneratedParts).not.toHaveBeenCalled();
    }
  });

  it("0·비유한 수·반올림 중복·360° 끝점·범위 초과를 커밋 전 거부한다", () => {
    const { host, live, execute } = fixture([box("a", { position: [9999, 0, 0] })]);
    const requests: readonly StudioBg3dSelectionArrayRequest[] = [
      { mode: "linear", token: "*1", delta: [0, 0, 0] },
      { mode: "linear", token: "*1", delta: [Number.NaN, 0, 0] },
      { mode: "linear", token: "*1", delta: [Number.POSITIVE_INFINITY, 0, 0] },
      { mode: "linear", token: "*1", delta: [0.00000001, 0, 0] },
      { mode: "linear", token: "*1", delta: [2, 0, 0] },
      { mode: "linear", token: "*999", delta: [1, 0, 0] },
      { mode: "radial", token: "*1", axis: "y", angleDegrees: 0, pivot: [0, 0, 0] },
      { mode: "radial", token: "*1", axis: "y", angleDegrees: Number.NaN, pivot: [0, 0, 0] },
      { mode: "radial", token: "*1", axis: "y", angleDegrees: 45, pivot: [0, Number.NaN, 0] },
      { mode: "radial", token: "*4", axis: "y", angleDegrees: 90, pivot: [0, 0, 0] },
      { mode: "radial", token: "/4", axis: "y", angleDegrees: 360, pivot: [0, 0, 0] },
    ];
    for (const request of requests) expect(execute(request).ok).toBe(false);
    expect(live.primitives).toHaveLength(1);
    expect(host.addGeneratedParts).not.toHaveBeenCalled();
  });

  it("최신 노드 예산·런타임 잠금·공식 admission 거부가 원본과 선택을 보존한다", () => {
    const { host, live, execute } = fixture([box("a"), box("b")]);
    live.document = { ...live.document, budgets: { ...live.document.budgets, complexity: { ...live.document.budgets.complexity, maxNodes: 3 } } };
    expect(inspectStudioBg3dSelectionArrayHost(host).availableNodeCount).toBe(1);
    expect(execute(LINEAR)).toMatchObject({ ok: false, code: "node-budget-exceeded" });
    live.document = createDefaultStudioBg3dSceneDocument();
    host.isCapturing = true;
    expect(execute(LINEAR)).toMatchObject({ ok: false, code: "selection-unavailable" });
    host.isCapturing = false;
    host.addGeneratedParts.mockReturnValueOnce(false);
    expect(execute(LINEAR)).toMatchObject({ ok: false, code: "admission-rejected" });
    expect(live.primitives).toHaveLength(2);
    expect(host.selectedIds).toEqual(new Set(["a", "b"]));
    expect(host.setSelectedIds).not.toHaveBeenCalled();
  });

  it("원본 하나는 저장 가능한 대용량 페인트도 사본 때문에 320KiB를 넘으면 선택·장면을 보존한다", () => {
    const points: StudioBg3dTexturePaintPoint[] = Array.from({ length: 512 }, (_, index) => [
      (index * 7 + 1) / 4096, (index * 5 + 1) / 4096,
    ]);
    const texturePaint: StudioBg3dTexturePaint = { version: 1,
      strokes: Array.from({ length: 16 }, () => ({ color: "#123456", size: 0.04, opacity: 1, points })) };
    const source = box("painted", { texturePaint });
    const { host, live, execute } = fixture([source]);
    const existing = adaptStudioBg3dRuntimeToDocument({ primitives: [source], customModels: [],
      attachmentByStorageModelId: new Map(), baseDocument: live.document });
    expect(new TextEncoder().encode(existing.serialized).byteLength).toBeLessThan(320 * 1024);
    expect(new TextEncoder().encode(existing.serialized).byteLength).toBeGreaterThan(160 * 1024);
    expect(execute({ mode: "linear", token: "*1", delta: [2, 0, 0] }))
      .toMatchObject({ ok: false, code: "document-budget-exceeded" });
    expect(host.addGeneratedParts).not.toHaveBeenCalled();
    expect(host.setSelectedIds).not.toHaveBeenCalled();
    expect(live.primitives).toEqual([source]);
  });

  it("기존 외부 모델의 저장 연결 누락을 adapter의 drop으로 감춰 예산을 계산하지 않는다", () => {
    const { host, live, execute } = fixture([box("a")]);
    live.customModels.push({ id: "unselected-model", modelId: "missing-storage", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    expect(inspectStudioBg3dSelectionArrayHost(host).blockedReason).toBeNull();
    expect(execute({ mode: "linear", token: "*1", delta: [2, 0, 0] }))
      .toMatchObject({ ok: false, code: "document-budget-exceeded" });
    expect(host.addGeneratedParts).not.toHaveBeenCalled();
    expect(live.primitives).toHaveLength(1);
    expect(live.customModels).toHaveLength(1);
  });
});
