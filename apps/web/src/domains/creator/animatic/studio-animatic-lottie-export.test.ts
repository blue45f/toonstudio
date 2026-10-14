import { describe, expect, it } from "vitest";

import type { StudioAnimaticDocument } from "../studio-animatic-timeline";
import {
  buildStudioAnimaticLottie,
  lottieTangentsForEasing,
  validateLottieAnimationShape,
  type LottieKeyframe,
} from "./studio-animatic-lottie-export";

function createDocument(): StudioAnimaticDocument {
  return {
    kind: "toonstudio.webtoon-animatic",
    version: 1,
    workScope: "episode-01",
    fps: 10,
    previewMode: "cuts",
    loop: false,
    segments: [
      {
        id: "seg-1",
        pageId: "page-1",
        cutId: "cut-1",
        label: "오프닝",
        holdMs: 1_600,
        transition: { kind: "cut", durationMs: 0 },
        cameraKeyframes: [
          { at: 0, panXPercent: -10, panYPercent: 0, zoom: 1, easing: "linear" },
          { at: 1, panXPercent: 10, panYPercent: 20, zoom: 2, easing: "ease-in-out" },
        ],
        cues: [],
        sourceRect: { x: 0, y: 0, width: 500, height: 500, stripY: 0 },
      },
      {
        id: "seg-2",
        pageId: "page-2",
        cutId: "cut-2",
        label: "클로즈업",
        holdMs: 2_000,
        transition: { kind: "fade", durationMs: 500 },
        cameraKeyframes: [
          { at: 0, panXPercent: 0, panYPercent: 0, zoom: 1, easing: "linear" },
          { at: 1, panXPercent: 0, panYPercent: 0, zoom: 1, easing: "linear" },
        ],
        cues: [{ id: "cue-1", kind: "dialogue", offsetMs: 500, text: "안녕", speaker: "유나" }],
        sourceRect: { x: 0, y: 500, width: 500, height: 500, stripY: 500 },
      },
    ],
  };
}

function keyframesOf(property: { a: number; k: unknown }): LottieKeyframe[] {
  return property.k as LottieKeyframe[];
}

/** Lottie 키프레임 구간을 베지어 탄젠트로 보간하는 최소 재생 샘플러 (재생 가능성 검증용). */
function samplePropertyAt(keyframes: readonly LottieKeyframe[], frame: number): number[] {
  const first = keyframes[0]!;
  if (frame <= first.t || keyframes.length === 1) return [...first.s];
  for (let i = 0; i < keyframes.length - 1; i += 1) {
    const a = keyframes[i]!;
    const b = keyframes[i + 1]!;
    if (frame >= a.t && frame <= b.t) {
      if (a.h === 1) return [...a.s];
      const progress = b.t === a.t ? 1 : (frame - a.t) / (b.t - a.t);
      // ease-in-out(0.42,0,0.58,1)은 대칭이라 중간 지점 진행률이 0.5와 같다.
      return a.s.map((value, index) => value + ((a.e?.[index] ?? b.s[index] ?? value) - value) * progress);
    }
  }
  return [...keyframes[keyframes.length - 1]!.s];
}

describe("animatic Lottie export — composition & layers", () => {
  it("builds a playable-shaped animation with frame-accurate timing", () => {
    const result = buildStudioAnimaticLottie(createDocument());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const anim = result.animation;
    expect(anim.v).toBe("5.7.4");
    expect(anim.fr).toBe(10);
    expect(anim.ip).toBe(0);
    // (1600 + 2500)ms × 10fps
    expect(anim.op).toBe(41);
    expect(anim.w).toBe(720);
    expect(anim.h).toBe(1280);
    expect(anim.layers).toHaveLength(2);
    expect(anim.layers[0]).toMatchObject({ ty: 1, ip: 0, op: 16, nm: "오프닝" });
    expect(anim.layers[1]).toMatchObject({ ty: 1, ip: 16, op: 41 });
    expect(validateLottieAnimationShape(JSON.parse(result.json))).toEqual({ ok: true });
    expect(result.warnings.some((warning) => warning.includes("플레이스홀더"))).toBe(true);
  });

  it("returns a failure for an empty document instead of an unplayable file", () => {
    const empty = { ...createDocument(), segments: [] };
    const result = buildStudioAnimaticLottie(empty);
    expect(result.ok).toBe(false);
  });
});

describe("animatic Lottie export — camera conversion", () => {
  it("converts pan/zoom keyframes with renderer math and arrival-easing shifted to the start keyframe", () => {
    const result = buildStudioAnimaticLottie(createDocument());
    if (!result.ok) throw new Error(result.error);
    const layer = result.animation.layers[0]!;
    const positions = keyframesOf(layer.ks.p);
    expect(positions).toHaveLength(2);
    // 중심(360,640) + pan% × 크기/100
    expect(positions[0]!.s).toEqual([288, 640, 0]);
    expect(positions[0]!.e).toEqual([432, 896, 0]);
    // 도착 키프레임의 ease-in-out이 시작 키프레임 탄젠트로 앞당겨진다.
    expect(positions[0]!.o).toEqual({ x: [0.42], y: [0] });
    expect(positions[0]!.i).toEqual({ x: [0.58], y: [1] });
    const scales = keyframesOf(layer.ks.s);
    expect(scales[0]!.s).toEqual([100, 100, 100]);
    expect(scales[0]!.e).toEqual([200, 200, 100]);
    // 중간 프레임 재생 샘플: 대칭 이징이라 위치가 양끝의 중간이다.
    expect(samplePropertyAt(positions, 8)).toEqual([360, 768, 0]);
  });

  it("keeps static camera values as static properties", () => {
    const result = buildStudioAnimaticLottie(createDocument());
    if (!result.ok) throw new Error(result.error);
    const layer = result.animation.layers[1]!;
    expect(layer.ks.p).toEqual({ a: 0, k: [360, 640, 0] });
    expect(layer.ks.s).toEqual({ a: 0, k: [100, 100, 100] });
  });

  it("converts a fade transition into opacity keyframes and cues into markers", () => {
    const result = buildStudioAnimaticLottie(createDocument());
    if (!result.ok) throw new Error(result.error);
    const layer = result.animation.layers[1]!;
    const opacity = keyframesOf(layer.ks.o);
    expect(opacity[0]).toMatchObject({ t: 16, s: [0] });
    expect(opacity[1]).toMatchObject({ t: 21, s: [100] });
    expect(result.animation.markers).toEqual([{ tm: 21, cm: "유나: 안녕", dr: 0 }]);
  });

  it("supports extended opacity + hold keyframes from the keyframe-editing model", () => {
    const doc = createDocument();
    const extended = {
      ...doc.segments[0]!,
      cameraKeyframes: [
        { at: 0, panXPercent: 0, panYPercent: 0, zoom: 1, easing: "linear", opacity: 0.5 },
        { at: 1, panXPercent: 0, panYPercent: 0, zoom: 1, easing: "hold", opacity: 1 },
      ],
    } as unknown as StudioAnimaticDocument["segments"][number];
    const result = buildStudioAnimaticLottie({ ...doc, segments: [extended, doc.segments[1]!] });
    if (!result.ok) throw new Error(result.error);
    const opacity = keyframesOf(result.animation.layers[0]!.ks.o);
    expect(opacity[0]).toMatchObject({ t: 0, s: [50], h: 1 });
    expect(opacity[1]).toMatchObject({ t: 16, s: [100] });
  });
});

describe("animatic Lottie export — image bindings & easing table", () => {
  it("emits image layers + assets and applies the sourceRect fit to scale", () => {
    const result = buildStudioAnimaticLottie(createDocument(), {
      images: [
        {
          segmentId: "seg-1",
          assetId: "img-1",
          width: 1_000,
          height: 1_000,
          fileName: "page-1.png",
          documentWidth: 1_000,
          documentHeight: 1_000,
        },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.animation.assets).toEqual([{ id: "img-1", w: 1_000, h: 1_000, u: "", p: "page-1.png" }]);
    const layer = result.animation.layers[0]!;
    expect(layer).toMatchObject({ ty: 2, refId: "img-1" });
    // sourceRect 500×500px → fit = min(720/500, 1280/500) = 1.44
    const scales = keyframesOf(layer.ks.s);
    expect(scales[0]!.s).toEqual([144, 144, 100]);
    expect(validateLottieAnimationShape(result.animation)).toEqual({ ok: true });
  });

  it("maps every supported easing to documented tangents", () => {
    expect(lottieTangentsForEasing("linear")).toEqual({ o: { x: [0], y: [0] }, i: { x: [1], y: [1] } });
    expect(lottieTangentsForEasing("ease-in-out")).toEqual({ o: { x: [0.42], y: [0] }, i: { x: [0.58], y: [1] } });
    expect(lottieTangentsForEasing("ease-in")).toEqual({ o: { x: [0.42], y: [0] }, i: { x: [1], y: [1] } });
    expect(lottieTangentsForEasing("ease-out")).toEqual({ o: { x: [0], y: [0] }, i: { x: [0.58], y: [1] } });
    expect(lottieTangentsForEasing("hold")).toBeNull();
    expect(lottieTangentsForEasing("bounce")).toBeNull();
  });

  it("rejects structurally broken animations in the shape validator", () => {
    expect(validateLottieAnimationShape({ v: "5.7.4", fr: 10, ip: 0, op: 0, w: 720, h: 1280, layers: [] }).ok).toBe(false);
    expect(validateLottieAnimationShape(null).ok).toBe(false);
  });
});
