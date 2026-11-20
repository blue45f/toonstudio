import { describe, expect, it } from "vitest";

import {
  DEFAULT_BLEND_IF_HANDLES,
  PSD_BLNC_BINARY_BYTE_LENGTH,
  STUDIO_BLEND_IF_PRESETS,
  buildBlendIfWgslSnippet,
  compositeBlendIfRgba,
  createDefaultBlendIfConfig,
  deserializeBlendIfFromPsdBlnc,
  evaluateBlendIfMatteMap,
  evaluateBlendIfRangeAlpha,
  evaluateBlendRangeSplineAlpha,
  isIdentityBlendIfConfig,
  normalizeBlendIfHandles,
  patchBlendIfChannelHandles,
  serializeBlendIfToPsdBlnc,
} from "./studio-blend-if-compositor";

function makeSolidImage(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a = 255,
): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = a;
  }
  return { width, height, data };
}

describe("studio-blend-if-compositor", () => {
  it("항등 핸들 [0,0,255,255]은 0..255 전 구간에서 알파 1을 반환한다", () => {
    expect(evaluateBlendIfRangeAlpha(0, DEFAULT_BLEND_IF_HANDLES)).toBe(1);
    expect(evaluateBlendIfRangeAlpha(128, DEFAULT_BLEND_IF_HANDLES)).toBe(1);
    expect(evaluateBlendIfRangeAlpha(255, DEFAULT_BLEND_IF_HANDLES)).toBe(1);
    expect(isIdentityBlendIfConfig(createDefaultBlendIfConfig())).toBe(true);
  });

  it("4포인트 분할 핸들에서 smoothstep 램프와 경계 컷오프가 정확히 동작한다", () => {
    // 어둠 20..80 페더, 밝기 180..240 페더
    const handles = [20, 80, 180, 240] as const;
    expect(evaluateBlendIfRangeAlpha(10, handles)).toBe(0);
    expect(evaluateBlendIfRangeAlpha(20, handles)).toBe(0);
    expect(evaluateBlendIfRangeAlpha(50, handles)).toBeCloseTo(0.5, 5);
    expect(evaluateBlendIfRangeAlpha(80, handles)).toBe(1);
    expect(evaluateBlendIfRangeAlpha(130, handles)).toBe(1);
    expect(evaluateBlendIfRangeAlpha(180, handles)).toBe(1);
    expect(evaluateBlendIfRangeAlpha(210, handles)).toBeCloseTo(0.5, 5);
    expect(evaluateBlendIfRangeAlpha(240, handles)).toBe(0);
    expect(evaluateBlendIfRangeAlpha(255, handles)).toBe(0);
  });

  it("비단조 또는 범위 초과 핸들을 단조 0..255로 정규화한다", () => {
    expect(normalizeBlendIfHandles([-10, 120, 90, 300])).toEqual([0, 120, 120, 255]);
    expect(normalizeBlendIfHandles([200, 100, 250, 220])).toEqual([200, 200, 220, 220]);
  });

  it("선화 흰 바탕 투명화: 흰 픽셀은 투명해지고 검은 선은 그대로 유지된다", () => {
    // 2×1 소스: (0,0)=검정 선, (1,0)=흰 종이 배경
    const source = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]),
    };
    const underlying = makeSolidImage(2, 1, 40, 120, 200, 255);
    const knockout = STUDIO_BLEND_IF_PRESETS.find((p) => p.id === "knockout-white-lineart")!;

    const result = compositeBlendIfRgba(source, underlying, knockout.config);
    // 입력 버퍼는 비파괴 불변 유지
    expect(source.data[4]).toBe(255);
    expect(underlying.data[0]).toBe(40);

    // 검은 선은 보존
    expect(result.data[0]).toBe(0);
    expect(result.data[1]).toBe(0);
    expect(result.data[2]).toBe(0);
    expect(result.data[3]).toBe(255);

    // 흰 바탕은 투명화되어 아래 레이어 색(40, 120, 200)이 그대로 드러남
    expect(result.data[4]).toBe(40);
    expect(result.data[5]).toBe(120);
    expect(result.data[6]).toBe(200);
    expect(result.data[7]).toBe(255);
  });

  it("underlyingLayer 및 R/G/B 개별 채널 조건을 곱연산으로 합성한다", () => {
    const source = makeSolidImage(1, 1, 240, 20, 20, 255);
    const underlyingDark = makeSolidImage(1, 1, 30, 30, 30, 255);
    const underlyingBright = makeSolidImage(1, 1, 240, 240, 240, 255);

    let config = createDefaultBlendIfConfig();
    // 아래 레이어 밝기 160 이상에서만 소스 노출 + 소스의 R 채널 100 이상
    config = patchBlendIfChannelHandles(config, "gray", "underlyingLayer", [120, 200, 255, 255]);
    config = patchBlendIfChannelHandles(config, "r", "thisLayer", [100, 150, 255, 255]);

    const matteDark = evaluateBlendIfMatteMap(source, underlyingDark, config);
    const matteBright = evaluateBlendIfMatteMap(source, underlyingBright, config);
    expect(matteDark[0]).toBe(0);
    expect(matteBright[0]).toBe(255);
  });

  it("Affinity Blend Ranges 다중 제어점 스플라인 곡선을 부드럽게 평가한다", () => {
    const spline = [
      { input: 0, opacity: 0 },
      { input: 0.5, opacity: 1 },
      { input: 1, opacity: 0 },
    ] as const;
    expect(evaluateBlendRangeSplineAlpha(0, spline)).toBeCloseTo(0, 5);
    expect(evaluateBlendRangeSplineAlpha(127.5, spline)).toBeCloseTo(1, 5);
    expect(evaluateBlendRangeSplineAlpha(255, spline)).toBeCloseTo(0, 5);
    expect(evaluateBlendRangeSplineAlpha(63.75, spline)).toBeCloseTo(0.5, 4);
  });

  it("PSD blnc 40바이트 바이너리 및 메타데이터를 무손실 라운드트립 직렬화/역직렬화한다", () => {
    let config = createDefaultBlendIfConfig({
      enabled: true,
      blendClippingElements: false,
      blendInteriorElements: true,
    });
    config = patchBlendIfChannelHandles(config, "gray", "thisLayer", [10, 40, 200, 245]);
    config = patchBlendIfChannelHandles(config, "gray", "underlyingLayer", [15, 55, 190, 230]);
    config = patchBlendIfChannelHandles(config, "r", "thisLayer", [0, 30, 220, 255]);
    config = patchBlendIfChannelHandles(config, "b", "underlyingLayer", [25, 65, 180, 210]);

    const blnc = serializeBlendIfToPsdBlnc(config);
    expect(blnc.tag).toBe("blnc");
    expect(blnc.binary.byteLength).toBe(PSD_BLNC_BINARY_BYTE_LENGTH);
    expect(Array.from(blnc.binary.slice(0, 8))).toEqual([10, 40, 200, 245, 15, 55, 190, 230]);

    const restoredFromRecord = deserializeBlendIfFromPsdBlnc(blnc);
    expect(restoredFromRecord.channels.gray.thisLayer).toEqual([10, 40, 200, 245]);
    expect(restoredFromRecord.channels.gray.underlyingLayer).toEqual([15, 55, 190, 230]);
    expect(restoredFromRecord.channels.r.thisLayer).toEqual([0, 30, 220, 255]);
    expect(restoredFromRecord.channels.b.underlyingLayer).toEqual([25, 65, 180, 210]);
    expect(restoredFromRecord.blendClippingElements).toBe(false);
    expect(restoredFromRecord.blendInteriorElements).toBe(true);

    // 순수 바이너리 40바이트만 넘겨도 모든 채널 복원
    const restoredFromBytes = deserializeBlendIfFromPsdBlnc(blnc.binary);
    expect(restoredFromBytes.channels).toEqual(restoredFromRecord.channels);
  });

  it("크기가 다른 버퍼를 합성하려 하면 RangeError를 던지고, WGSL 스니펫을 제공한다", () => {
    const a = makeSolidImage(2, 2, 0, 0, 0);
    const b = makeSolidImage(3, 2, 0, 0, 0);
    expect(() => compositeBlendIfRgba(a, b, createDefaultBlendIfConfig())).toThrow(RangeError);
    expect(buildBlendIfWgslSnippet()).toContain("blendIfRangeAlpha");
  });
});
