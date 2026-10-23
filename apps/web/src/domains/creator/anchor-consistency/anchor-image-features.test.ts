import { describe, expect, it } from "vitest";

import { parseAnchorImageFeatures } from "./anchor-consistency-worker-protocol";
import { ANCHOR_FEATURES_VERSION, ANCHOR_LOW_CONTRAST_STD_L, extractAnchorFeatures } from "./anchor-image-features";
import { AnchorFeatureError } from "./anchor-raster";
import { figureRaster, noiseRaster, renderSynthetic } from "./anchor-synthetic-raster";

/** 던져진 AnchorFeatureError 의 코드. 던지지 않았으면 null, 다른 오류면 "other". */
function errorCodeOf(action: () => unknown): string | null {
  try {
    action();
    return null;
  } catch (error) {
    return error instanceof AnchorFeatureError ? error.code : "other";
  }
}

describe("이미지 특징 추출", () => {
  it("배경이 한 색인 그림은 background 모드로 피사체를 분리한다", () => {
    const features = extractAnchorFeatures(figureRaster());
    expect(features.version).toBe(ANCHOR_FEATURES_VERSION);
    expect(features.subject.mode).toBe("background");
    expect(features.subject.backgroundHex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(features.subject.coverage).toBeGreaterThan(0.1);
    expect(features.subject.coverage).toBeLessThan(0.8);
    expect(features.silhouette).not.toBeNull();
    expect(features.structure.region).toBe("subject");
    expect(features.palette.length).toBeGreaterThanOrEqual(3);
    expect(features.lowContrast).toBe(false);
  });

  it("투명 배경 그림은 alpha 모드로 분리하고 배경색은 기록하지 않는다", () => {
    const features = extractAnchorFeatures(figureRaster({ background: null }));
    expect(features.subject.mode).toBe("alpha");
    expect(features.subject.backgroundHex).toBeNull();
    expect(features.silhouette).not.toBeNull();
  });

  it("피사체와 배경을 가를 수 없는 이미지는 whole-image 이고 실루엣을 만들지 않는다", () => {
    const features = extractAnchorFeatures(noiseRaster(64, 64, 11));
    expect(features.subject.mode).toBe("whole-image");
    expect(features.silhouette).toBeNull();
    expect(features.structure.region).toBe("image");
  });

  it("거의 단색인 이미지는 낮은 대비로 표시한다", () => {
    const flat = renderSynthetic({ width: 48, height: 48, background: [120, 120, 120], shapes: [] });
    const features = extractAnchorFeatures(flat);
    expect(features.color.stdL).toBeLessThan(ANCHOR_LOW_CONTRAST_STD_L);
    expect(features.lowContrast).toBe(true);
  });

  it("같은 입력은 항상 같은 특징을 만든다", () => {
    const raster = figureRaster({ noise: { amount: 6, seed: 3 } });
    expect(extractAnchorFeatures(raster)).toEqual(extractAnchorFeatures(raster));
  });

  it("입력 래스터의 픽셀을 바꾸지 않는다", () => {
    const raster = figureRaster({ noise: { amount: 6, seed: 3 } });
    const before = Uint8ClampedArray.from(raster.data);
    extractAnchorFeatures(raster);
    expect(Array.from(raster.data)).toEqual(Array.from(before));
  });

  it("큰 이미지는 긴 변 256px 로 줄여 분석하고, 같은 그림이면 작은 쪽과 비슷한 특징을 낸다", () => {
    const big = figureRaster({ width: 768, height: 1152 });
    const small = figureRaster({ width: 128, height: 192 });
    const bigFeatures = extractAnchorFeatures(big);
    expect(Math.max(bigFeatures.width, bigFeatures.height)).toBe(256);
    expect(bigFeatures.width).toBe(171);
    expect(bigFeatures.height).toBe(256);
    const smallFeatures = extractAnchorFeatures(small);
    expect(smallFeatures.width).toBe(128);
    expect(Math.abs((bigFeatures.silhouette?.aspect ?? 0) - (smallFeatures.silhouette?.aspect ?? 0))).toBeLessThan(0.05);
    expect(Math.abs(bigFeatures.color.meanL - smallFeatures.color.meanL)).toBeLessThan(2);
  });

  it("maxEdge 를 더 작게 줘도 동작한다", () => {
    const features = extractAnchorFeatures(figureRaster({ width: 256, height: 384 }), { maxEdge: 64 });
    expect(Math.max(features.width, features.height)).toBe(64);
  });

  it("작업 도중 취소되면 cancelled 로 멈춘다", () => {
    let calls = 0;
    const code = errorCodeOf(() => extractAnchorFeatures(figureRaster(), { isCancelled: () => (calls += 1) > 2 }));
    expect(code).toBe("cancelled");
    expect(calls).toBeGreaterThan(2);
  });

  it("시작 전에 이미 취소됐으면 바로 멈춘다", () => {
    expect(errorCodeOf(() => extractAnchorFeatures(figureRaster(), { isCancelled: () => true }))).toBe("cancelled");
  });

  it("너무 작은 이미지와 잘못된 래스터는 코드가 있는 오류로 끝난다", () => {
    const tiny = renderSynthetic({ width: 8, height: 8, background: [10, 10, 10], shapes: [] });
    expect(errorCodeOf(() => extractAnchorFeatures(tiny))).toBe("raster-too-small");
    expect(errorCodeOf(() => extractAnchorFeatures({ width: 32, height: 32, data: new Uint8ClampedArray(10) }))).toBe("invalid-raster");
  });

  it("특징은 JSON 으로 오가도 검증을 통과하고 값이 같다(Worker 전송 모양)", () => {
    const features = extractAnchorFeatures(figureRaster({ noise: { amount: 4, seed: 9 } }));
    const roundTripped = parseAnchorImageFeatures(JSON.parse(JSON.stringify(features)) as unknown);
    expect(roundTripped).toEqual(features);
  });

  it("특징 객체는 얼려 있어 밖에서 바꿀 수 없다", () => {
    const features = extractAnchorFeatures(figureRaster());
    expect(Object.isFrozen(features)).toBe(true);
    expect(Object.isFrozen(features.subject)).toBe(true);
  });
});
