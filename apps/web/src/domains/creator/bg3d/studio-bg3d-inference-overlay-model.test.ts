import { describe, expect, it } from "vitest";

import { STUDIO_BG3D_INFERENCE_AXES, STUDIO_BG3D_INFERENCE_AXIS_STYLE } from "./studio-bg3d-inference-kinds";
import {
  EMPTY_STUDIO_BG3D_INFERENCE_OVERLAY,
  buildStudioBg3dInferenceOverlayModel,
  resolveStudioBg3dInferenceGuideStyle,
} from "./studio-bg3d-inference-overlay-model";
import {
  createStudioBg3dInferenceSessionState,
  reduceStudioBg3dInferenceSession,
} from "./studio-bg3d-inference-session";

import type { StudioBg3dInferenceSessionEvent } from "./studio-bg3d-inference-session";
import type { StudioBg3dInferenceResult } from "./studio-bg3d-inference-types";

function result(partial: Partial<StudioBg3dInferenceResult> & Pick<StudioBg3dInferenceResult, "kind" | "point">): StudioBg3dInferenceResult {
  return {
    label: partial.kind,
    detail: null,
    announcement: partial.kind,
    axis: null,
    direction: null,
    normal: null,
    sourceIds: [],
    edgeId: null,
    alignmentOrigin: null,
    relation: null,
    guides: [],
    constraint: { kind: "none" },
    projected: false,
    approximate: false,
    distancePx: 0,
    ...partial,
  };
}

function snapshotOf(...events: StudioBg3dInferenceSessionEvent[]) {
  let session = createStudioBg3dInferenceSessionState();
  for (const event of events) session = reduceStudioBg3dInferenceSession(session, event).state;
  return { session };
}

describe("오버레이 모델", () => {
  it("세션이 없거나 캡처 중이면 아무것도 그리지 않는다", () => {
    expect(buildStudioBg3dInferenceOverlayModel(snapshotOf())).toBe(EMPTY_STUDIO_BG3D_INFERENCE_OVERLAY);
    const active = snapshotOf({ type: "begin", tool: "measure" }, { type: "result", result: result({ kind: "endpoint", point: [1, 0, 0] }) });
    expect(buildStudioBg3dInferenceOverlayModel(active, true)).toBe(EMPTY_STUDIO_BG3D_INFERENCE_OVERLAY);
  });

  it("끝점 결과는 툴팁이 있는 현재 마커 하나를 만든다", () => {
    const model = buildStudioBg3dInferenceOverlayModel(
      snapshotOf({ type: "begin", tool: "measure" }, { type: "result", result: result({ kind: "endpoint", label: "끝점", point: [1, 2, 3] }) }),
    );
    expect(model.markers).toEqual([
      { id: "current", point: [1, 2, 3], kind: "endpoint", axis: null, label: "끝점", showLabel: true },
    ]);
    expect(model.guides).toEqual([]);
  });

  it("자유 위치는 마커를 그리지 않지만 호버 기준점은 항상 그린다", () => {
    const model = buildStudioBg3dInferenceOverlayModel(
      snapshotOf(
        { type: "begin", tool: "measure" },
        { type: "add-hover-reference", point: [1, 0, 0] },
        { type: "add-hover-reference", point: [2, 0, 0] },
        { type: "result", result: result({ kind: "free", point: [5, 0, 5] }) },
      ),
    );
    expect(model.markers.map((marker) => marker.label)).toEqual(["기준점 1", "기준점 2"]);
    expect(model.markers.every((marker) => marker.kind === "from-point" && !marker.showLabel)).toBe(true);
  });

  it("축 정렬 유도선은 축 색(빨강 X·초록 Y·파랑 Z)과 축마다 다른 점선 무늬를 쓴다", () => {
    const styles = STUDIO_BG3D_INFERENCE_AXES.map((axis) =>
      resolveStudioBg3dInferenceGuideStyle({ role: "axis", axis, dashed: true }),
    );
    expect(styles.map((style) => style.hex)).toEqual(["#e63946", "#2a9d8f", "#457b9d"]);
    const patterns = styles.map((style) => `${style.dashSize}/${style.gapSize}`);
    expect(new Set(patterns).size).toBe(3);
    STUDIO_BG3D_INFERENCE_AXES.forEach((axis, index) => {
      expect(styles[index]?.dashSize).toBe(STUDIO_BG3D_INFERENCE_AXIS_STYLE[axis].dash[0]);
    });
  });

  it("잠금 선은 축 선보다 위에 그려지고 불투명하다", () => {
    const lock = resolveStudioBg3dInferenceGuideStyle({ role: "lock", axis: "x", dashed: false });
    const axis = resolveStudioBg3dInferenceGuideStyle({ role: "axis", axis: "x", dashed: true });
    expect(lock.renderOrder).toBeGreaterThan(axis.renderOrder);
    expect(lock.opacity).toBe(1);
    expect(lock.dashed).toBe(false);
  });

  it("평행·수직 유도선과 기준 모서리는 같은 색 계열이고, 기준 모서리는 실선이다", () => {
    const relation = resolveStudioBg3dInferenceGuideStyle({ role: "relation", axis: null, dashed: true });
    const edge = resolveStudioBg3dInferenceGuideStyle({ role: "reference-edge", axis: null, dashed: true });
    expect(relation.hex).toBe(edge.hex);
    expect(edge.dashed).toBe(false);
    expect(edge.renderOrder).toBeGreaterThan(relation.renderOrder);
  });

  it("엔진이 준 유도선이 모델의 유도선이 된다", () => {
    const model = buildStudioBg3dInferenceOverlayModel(
      snapshotOf(
        { type: "begin", tool: "measure", referencePoint: [0, 0, 0] },
        {
          type: "result",
          result: result({
            kind: "axis",
            axis: "z",
            label: "Z축 정렬",
            point: [0, 0, 3],
            guides: [{ id: "axis:z", role: "axis", from: [0, 0, 0], to: [0, 0, 3], axis: "z", dashed: true }],
          }),
        },
      ),
    );
    expect(model.markers[0]?.label).toBe("Z축 정렬");
    expect(model.markers[0]?.axis).toBe("z");
    expect(model.guides).toHaveLength(1);
    expect(model.guides[0]).toMatchObject({ from: [0, 0, 0], to: [0, 0, 3], hex: "#457b9d", dashed: true });
  });
});
