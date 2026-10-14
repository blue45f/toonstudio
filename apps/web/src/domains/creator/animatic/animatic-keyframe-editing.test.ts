import { describe, expect, it } from "vitest";

import {
  addStudioAnimaticCameraKeyframe,
  createStudioAnimaticFromPages,
  moveStudioAnimaticCameraKeyframe,
  patchStudioAnimaticCameraKeyframe,
  planStudioAnimaticPreview,
  removeStudioAnimaticCameraKeyframe,
  sampleStudioAnimaticPreview,
  setStudioAnimaticCameraEndpoint,
  validateStudioAnimaticDocument,
  type StudioAnimaticDocument,
} from "../studio-animatic-timeline";
import { cameraKeyframesToTracks, sampleCameraTracksAt } from "./animatic-keyframe-model";

function createDocument(): StudioAnimaticDocument {
  const created = createStudioAnimaticFromPages([{ id: "page-1", name: "오프닝", canvasH: 1200 }], { workScope: "episode-1" });
  if (!created.ok) throw new Error(created.error);
  return created.document;
}

describe("animatic camera keyframe editing", () => {
  it("adds a mid keyframe with interpolated values so the motion does not jump", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { panXPercent: 40, zoom: 2, opacity: 0.5 });
    document = addStudioAnimaticCameraKeyframe(document, segmentId);
    const keyframes = document.segments[0]!.cameraKeyframes;
    expect(keyframes).toHaveLength(3);
    expect(keyframes[1]!.at).toBeCloseTo(0.5);
    // ease-in-out 중간값: pan 20, zoom 1.5, opacity 0.75 근처
    expect(keyframes[1]!.panXPercent).toBeCloseTo(20, 0);
    expect(keyframes[1]!.zoom).toBeCloseTo(1.5, 1);
    expect(keyframes[1]!.opacity).toBeCloseTo(0.75, 1);
    expect(validateStudioAnimaticDocument(document).ok).toBe(true);
  });

  it("moves and patches a keyframe, and refuses moves onto another keyframe", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = addStudioAnimaticCameraKeyframe(document, segmentId, 0.5);
    document = moveStudioAnimaticCameraKeyframe(document, segmentId, 0.5, 0.25);
    document = patchStudioAnimaticCameraKeyframe(document, segmentId, 0.25, { zoom: 3, opacity: 0.2, easing: "hold" });
    const keyframes = document.segments[0]!.cameraKeyframes;
    expect(keyframes.map((kf) => kf.at)).toEqual([0, 0.25, 1]);
    expect(keyframes[1]).toMatchObject({ zoom: 3, opacity: 0.2, easing: "hold" });
    expect(moveStudioAnimaticCameraKeyframe(document, segmentId, 0.25, 1)).toBe(document);
  });

  it("keeps at least the start and end keyframes when removing", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = addStudioAnimaticCameraKeyframe(document, segmentId, 0.5);
    document = removeStudioAnimaticCameraKeyframe(document, segmentId, 0.5);
    expect(document.segments[0]!.cameraKeyframes).toHaveLength(2);
    expect(removeStudioAnimaticCameraKeyframe(document, segmentId, 0)).toBe(document);
  });

  it("applies easing and opacity in the preview sample (shared by WebM export)", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { panXPercent: 100, opacity: 0, easing: "ease-in" });
    const planned = planStudioAnimaticPreview(document, false);
    if (!planned.ok) throw new Error(planned.error);
    const mid = sampleStudioAnimaticPreview(document, planned.plan, planned.plan.totalDurationMs / 2, false)!;
    // ease-in은 중간 지점에서 선형(50)보다 뒤처진다
    expect(mid.camera.panXPercent).toBeLessThan(50);
    expect(mid.camera.opacity).toBeGreaterThan(0.5);
    const end = sampleStudioAnimaticPreview(document, planned.plan, planned.plan.totalDurationMs - 1, false)!;
    expect(end.camera.opacity).toBeCloseTo(0, 1);
  });

  it("hold easing keeps the start value until the next keyframe", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { zoom: 3, easing: "hold" });
    const planned = planStudioAnimaticPreview(document, false);
    if (!planned.ok) throw new Error(planned.error);
    const mid = sampleStudioAnimaticPreview(document, planned.plan, planned.plan.totalDurationMs / 2, false)!;
    expect(mid.camera.zoom).toBe(1);
  });

  it("model tracks sample the same values as the timeline sampler", () => {
    let document = createDocument();
    const segmentId = document.segments[0]!.id;
    document = setStudioAnimaticCameraEndpoint(document, segmentId, "end", { panXPercent: 40, zoom: 2, opacity: 0.5, easing: "ease-in-out" });
    const tracks = cameraKeyframesToTracks(document.segments[0]!.cameraKeyframes);
    const viaModel = sampleCameraTracksAt(tracks, 0.5);
    expect(viaModel.panXPercent).toBeCloseTo(20, 0);
    expect(viaModel.zoom).toBeCloseTo(1.5, 1);
    expect(viaModel.opacity).toBeCloseTo(0.75, 1);
  });

  it("reads legacy documents without opacity as fully opaque", () => {
    const document = createDocument();
    const legacy = JSON.parse(JSON.stringify(document)) as { segments: { cameraKeyframes: Record<string, unknown>[] }[] };
    for (const kf of legacy.segments[0]!.cameraKeyframes) delete kf.opacity;
    const validated = validateStudioAnimaticDocument(legacy);
    expect(validated.ok).toBe(true);
    if (validated.ok) expect(validated.document.segments[0]!.cameraKeyframes[0]!.opacity).toBe(1);
  });
});
