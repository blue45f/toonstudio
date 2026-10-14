import { describe, expect, it } from "vitest";

import {
  createStudioAnimaticFromPages,
  exportStudioAnimaticDocument,
  importStudioAnimaticDocument,
  patchStudioAnimaticCameraKeyframe,
  planStudioAnimaticPreview,
  sampleStudioAnimaticPreview,
  setStudioAnimaticCameraEndpoint,
  STUDIO_ANIMATIC_EASING_CURVE_POINTS,
  validateStudioAnimaticDocument,
  type StudioAnimaticDocument,
} from "../studio-animatic-timeline";
import { cameraKeyframesToTracks, sampleCameraTracksAt } from "./animatic-keyframe-model";
import {
  EASING_PRESETS,
  easingCurveSamples,
  interpolateSegment,
  normalizeBezierPoints,
  sampleEasing,
  segmentEasingForCameraKeyframe,
  validateEasing,
  type SegmentEasing,
} from "./keyframe-curve-model";

function createDocument(): StudioAnimaticDocument {
  const created = createStudioAnimaticFromPages([{ id: "page-1", name: "오프닝", canvasH: 1200 }], { workScope: "episode-1" });
  if (!created.ok) throw new Error(created.error);
  return created.document;
}

describe("keyframe curve model (canonical presets)", () => {
  it("keeps the draft preset control points as the single source of truth", () => {
    expect(EASING_PRESETS.easeIn).toEqual({ kind: "bezier", points: [0.42, 0, 1, 1] });
    expect(EASING_PRESETS.easeOut).toEqual({ kind: "bezier", points: [0, 0, 0.58, 1] });
    expect(EASING_PRESETS.easeInOut).toEqual({ kind: "bezier", points: [0.42, 0, 0.58, 1] });
    expect(EASING_PRESETS.easeInBack).toEqual({ kind: "bezier", points: [0.36, 0, 0.66, -0.56] });
    expect(EASING_PRESETS.easeOutBack).toEqual({ kind: "bezier", points: [0.34, 1.56, 0.64, 1] });
    expect(EASING_PRESETS.hold).toEqual({ kind: "step", at: 1 });
    // 타임라인 로컬 표가 정본과 같은 값인지 고정한다.
    expect(STUDIO_ANIMATIC_EASING_CURVE_POINTS["ease-in"]).toEqual([0.42, 0, 1, 1]);
    expect(STUDIO_ANIMATIC_EASING_CURVE_POINTS["ease-out"]).toEqual([0, 0, 0.58, 1]);
    expect(STUDIO_ANIMATIC_EASING_CURVE_POINTS["ease-in-out"]).toEqual([0.42, 0, 0.58, 1]);
    expect(STUDIO_ANIMATIC_EASING_CURVE_POINTS["ease-in-back"]).toEqual([0.36, 0, 0.66, -0.56]);
    expect(STUDIO_ANIMATIC_EASING_CURVE_POINTS["ease-out-back"]).toEqual([0.34, 1.56, 0.64, 1]);
  });

  it("samples endpoints exactly and overshoots for back easings", () => {
    for (const preset of Object.values(EASING_PRESETS) as SegmentEasing[]) {
      expect(sampleEasing(preset, 0)).toBe(0);
      expect(sampleEasing(preset, 1)).toBe(1);
    }
    expect(sampleEasing(EASING_PRESETS.easeInBack!, 0.5)).toBeLessThan(0);
    expect(sampleEasing(EASING_PRESETS.easeOutBack!, 0.8)).toBeGreaterThan(1);
    expect(sampleEasing(EASING_PRESETS.hold!, 0.99)).toBe(0);
    expect(interpolateSegment(0, 100, { kind: "linear" }, 0.25)).toBe(25);
  });

  it("normalizes control points and reports invalid easings", () => {
    expect(normalizeBezierPoints([0.2, 1.8, 0.1, -0.9])).toEqual([0.2, 1.5, 0.2, -0.5]);
    expect(validateEasing({ kind: "bezier", points: [0.8, 0, 0.2, 1] }).map((issue) => issue.code)).toEqual(["x-not-monotonic"]);
    expect(validateEasing({ kind: "bezier", points: [1.2, 0, 0.2, 1] }).map((issue) => issue.code)).toEqual(["x-out-of-range"]);
    expect(validateEasing(EASING_PRESETS.easeInOut!)).toEqual([]);
    const samples = easingCurveSamples(EASING_PRESETS.easeInOut!, 16);
    expect(samples).toHaveLength(17);
    expect(samples[0]).toEqual({ x: 0, y: 0 });
    expect(samples[16]).toEqual({ x: 1, y: 1 });
  });
});

describe("animatic custom curve wiring", () => {
  it("stores a drawn curve as custom easing with normalized points", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = patchStudioAnimaticCameraKeyframe(document, segmentId, 1, { curve: [0.2, 1.8, 0.1, 0.5] });
    const end = document.segments[0]!.cameraKeyframes[1]!;
    expect(end.easing).toBe("custom");
    expect(end.curve).toEqual([0.2, 1.5, 0.2, 0.5]);
    expect(validateStudioAnimaticDocument(document).ok).toBe(true);
    // 프리셋으로 바꾸면 곡선은 지워진다.
    document = patchStudioAnimaticCameraKeyframe(document, segmentId, 1, { easing: "ease-out" });
    const reset = document.segments[0]!.cameraKeyframes[1]!;
    expect(reset.easing).toBe("ease-out");
    expect(reset.curve).toBeUndefined();
  });

  it("preview motion follows the drawn curve, not a preset", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    const curve = [0.8, 0, 0.9, 0.3] as const;
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { panXPercent: 100 });
    document = patchStudioAnimaticCameraKeyframe(document, segmentId, 1, { curve: [...curve] });
    const planned = planStudioAnimaticPreview(document, false);
    if (!planned.ok) throw new Error(planned.error);
    const mid = sampleStudioAnimaticPreview(document, planned.plan, planned.plan.totalDurationMs / 2, false)!;
    // 강하게 뒤로 쏠린 곡선이라 중간 지점 pan은 선형(50)보다 훨씬 작다.
    expect(mid.camera.panXPercent).toBeLessThan(25);
    expect(mid.camera.panXPercent).toBeGreaterThan(0);
    // 모델 트랙 샘플은 같은 곡선을 직접 샘플링한 값과 일치한다 (미리보기 = 샘플 곡선).
    const tracks = cameraKeyframesToTracks(document.segments[0]!.cameraKeyframes);
    const expected = 100 * sampleEasing(segmentEasingForCameraKeyframe("custom", curve), 0.5);
    expect(sampleCameraTracksAt(tracks, 0.5).panXPercent).toBeCloseTo(expected, 0);
  });

  it("back presets overshoot in the model tracks used by the lane preview", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { panXPercent: 100, easing: "ease-out-back" });
    const tracks = cameraKeyframesToTracks(document.segments[0]!.cameraKeyframes);
    expect(sampleCameraTracksAt(tracks, 0.8).panXPercent).toBeGreaterThan(100);
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { panXPercent: 100, easing: "ease-in-back" });
    const backTracks = cameraKeyframesToTracks(document.segments[0]!.cameraKeyframes);
    expect(sampleCameraTracksAt(backTracks, 0.5).panXPercent).toBeLessThan(0);
  });

  it("keeps curve control points across export/import round-trip", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = patchStudioAnimaticCameraKeyframe(document, segmentId, 1, { curve: [0.15, 1.3, 0.7, -0.2] });
    const exported = exportStudioAnimaticDocument(document);
    if (!exported.ok) throw new Error(exported.error);
    const imported = importStudioAnimaticDocument(exported.json);
    if (!imported.ok) throw new Error(imported.error);
    expect(imported.document.segments[0]!.cameraKeyframes[1]).toMatchObject({
      easing: "custom",
      curve: [0.15, 1.3, 0.7, -0.2],
    });
  });

  it("degrades a custom easing without curve points to ease-in-out on load", () => {
    const document = createDocument();
    const broken = JSON.parse(JSON.stringify(document)) as { segments: { cameraKeyframes: Record<string, unknown>[] }[] };
    broken.segments[0]!.cameraKeyframes[1]!.easing = "custom";
    const validated = validateStudioAnimaticDocument(broken);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.document.segments[0]!.cameraKeyframes[1]!.easing).toBe("ease-in-out");
      expect(validated.document.segments[0]!.cameraKeyframes[1]!.curve).toBeUndefined();
    }
  });
});
