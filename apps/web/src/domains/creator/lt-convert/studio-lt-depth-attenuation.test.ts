import { describe, expect, it } from "vitest";

import {
  LT_DEPTH_ATTENUATION_PRESETS,
  LT_DEPTH_PRESET_LIST,
  LT_DEPTH_STANDARD_WIDTHS_PX,
  LT_SIX_PASS_ORDER,
  buildLtSixPassLayerGroup,
  computeDepthAttenuatedLineWidthPx,
  convertStudioLtImage,
  convertStudioLtSixPass,
  evaluateSixPassParallaxOffset,
  separateAlphaCutoutMaskPass,
  type StudioLtConvertOptions,
} from "./studio-lt-convert";
import { createStudioLtSixPassLayerPayloads } from "./studio-lt-convert-layer";

if (typeof globalThis.ImageData === "undefined") {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = TestImageData as unknown as typeof ImageData;
}

const BASE_LT_OPTIONS: StudioLtConvertOptions = {
  toneDensity: 4,
  lineThickness: 2,
  lineThreshold: 0.12,
  edgeThinning: true,
};

describe("축 07 · Z-Depth 깊이 감쇠 LT 선화 커널(1.8/1.1/0.5px) & 2종 프리셋 (#031–#032)", () => {
  it("인물 집중·건축 강조 2종 프리셋이 근경 1.8px · 중경 1.1px · 원경 0.5px 앵커와 단조 감쇠를 만족한다", () => {
    expect(LT_DEPTH_PRESET_LIST.map((p) => p.labelKo)).toEqual(["인물 집중", "건축 강조"]);

    for (const preset of LT_DEPTH_PRESET_LIST) {
      expect(computeDepthAttenuatedLineWidthPx(0, preset.id)).toBe(LT_DEPTH_STANDARD_WIDTHS_PX.nearPx);
      expect(computeDepthAttenuatedLineWidthPx(0.5, preset.id)).toBe(LT_DEPTH_STANDARD_WIDTHS_PX.midPx);
      expect(computeDepthAttenuatedLineWidthPx(1, preset.id)).toBe(LT_DEPTH_STANDARD_WIDTHS_PX.farPx);

      const samples = [0, 0.2, 0.4, 0.5, 0.7, 0.85, 1].map((z) =>
        computeDepthAttenuatedLineWidthPx(z, preset.id),
      );
      for (let i = 1; i < samples.length; i += 1) {
        expect(samples[i]!).toBeLessThan(samples[i - 1]!);
      }
    }

    // 인물 집중은 근경(z=0.25) 굵기를 더 오래 유지하고 원경(z=0.75)은 더 빠르게 얇힌다
    expect(computeDepthAttenuatedLineWidthPx(0.25, "character-focus")).toBeGreaterThan(
      computeDepthAttenuatedLineWidthPx(0.25, "architecture-emphasis"),
    );
    expect(computeDepthAttenuatedLineWidthPx(0.75, "architecture-emphasis")).toBeGreaterThan(
      computeDepthAttenuatedLineWidthPx(0.75, "character-focus"),
    );
    // 건축 강조는 더 예민한 노멀 크리즈 임계각을 사용한다
    expect(LT_DEPTH_ATTENUATION_PRESETS["architecture-emphasis"].normalCreaseThresholdDeg).toBeLessThan(
      LT_DEPTH_ATTENUATION_PRESETS["character-focus"].normalCreaseThresholdDeg,
    );
  });

  it("3개 깊이 대역(근경 z=0 / 중경 z=0.5 / 원경 z=1)의 동일 수직 경계에서 실제 선화 잉크 질량이 1.8 > 1.1 > 0.5px 순으로 감쇠한다", () => {
    const width = 48;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const depth = new Float32Array(width * height);

    // 좌측(0..15): 근경 z=0.0, 중앙(16..31): 중경 z=0.5, 우측(32..47): 원경 z=1.0
    // 각 대역 중앙에 동일한 흑→백 수직 경계선 배치
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const o = idx * 4;
        const band = x < 16 ? 0 : x < 32 ? 1 : 2;
        const localX = x - band * 16;
        const luma = localX < 8 ? 20 : 240;
        rgba[o] = luma;
        rgba[o + 1] = luma;
        rgba[o + 2] = luma;
        rgba[o + 3] = 255;
        depth[idx] = band === 0 ? 0.0 : band === 1 ? 0.5 : 1.0;
      }
    }

    const source = new ImageData(rgba, width, height);
    const result = convertStudioLtImage(source, {
      ...BASE_LT_OPTIONS,
      enableDepthAttenuation: true,
      depthPreset: "character-focus",
      depthBuffer: depth,
    });

    const sumBandInk = (xStart: number, xEnd: number): number => {
      let mass = 0;
      for (let y = 4; y < height - 4; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          mass += (result.lineLayer.data[(y * width + x) * 4 + 3] ?? 0) / 255;
        }
      }
      return mass / (height - 8);
    };

    const nearWidth = sumBandInk(2, 14);
    const midWidth = sumBandInk(18, 30);
    const farWidth = sumBandInk(34, 46);

    expect(nearWidth).toBeGreaterThan(midWidth);
    expect(midWidth).toBeGreaterThan(farWidth);
    expect(result.depthAttenuationReport?.targetWidthsPx).toEqual({ near: 1.8, mid: 1.1, far: 0.5 });
    expect(result.depthAttenuationReport?.meanEffectiveWidthPxByBand.foreground).toBeGreaterThan(
      result.depthAttenuationReport?.meanEffectiveWidthPxByBand.midground ?? 0,
    );
    expect(result.depthAttenuationReport?.meanEffectiveWidthPxByBand.midground).toBeGreaterThan(
      result.depthAttenuationReport?.meanEffectiveWidthPxByBand.background ?? 0,
    );
  });
});

describe("축 07 · 6패스(선화·음영·원색·깊이·노멀·마스크) 자동 그룹화 & 시차 바인딩 (#033–#034)", () => {
  it("convertStudioLtSixPass가 6패스 ImageData와 자동 그룹·시차 바인딩 계약을 일괄 생성한다", () => {
    const width = 16;
    const height = 16;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const depth = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const o = i * 4;
        rgba[o] = x < 8 ? 40 : 220;
        rgba[o + 1] = 120;
        rgba[o + 2] = 180;
        rgba[o + 3] = 255;
        depth[i] = x / (width - 1);
      }
    }

    const sixPass = convertStudioLtSixPass(new ImageData(rgba, width, height), {
      ...BASE_LT_OPTIONS,
      depthPreset: "architecture-emphasis",
      depthBuffer: depth,
    });

    expect(sixPass.sixPassGroup.passes).toHaveLength(6);
    expect(sixPass.sixPassGroup.passes.map((p) => p.passId)).toEqual(LT_SIX_PASS_ORDER);
    expect(sixPass.albedoLayer.width).toBe(width);
    expect(sixPass.depthLayer.width).toBe(width);
    expect(sixPass.normalLayer.width).toBe(width);
    expect(sixPass.maskLayer.width).toBe(width);

    const payloadsBundle = createStudioLtSixPassLayerPayloads(sixPass);
    expect(payloadsBundle.payloads).toHaveLength(6);
    expect(new Set(payloadsBundle.payloads.map((p) => p.groupId)).size).toBe(1);
  });

  it("시차(Parallax) 바인딩이 동일 대역 6개 패스를 0px 오차로 동기화하고 근경 > 중경 > 원경 시차를 유지한다", () => {
    const group = buildLtSixPassLayerGroup({
      presetId: "character-focus",
      width: 1080,
      height: 1920,
      alphaCutoutSeparated: true,
    });

    const evalOffset = evaluateSixPassParallaxOffset(group.parallaxContract, {
      panXPx: 20,
      panYPx: -10,
      scrollDeltaPx: 5,
    });

    const fg = evalOffset.byBand.foreground;
    const mg = evalOffset.byBand.midground;
    const bg = evalOffset.byBand.background;

    expect(fg.offsetXPx).toBeGreaterThan(mg.offsetXPx);
    expect(mg.offsetXPx).toBeGreaterThan(bg.offsetXPx);
    expect(fg.referenceLineWidthPx).toBe(1.8);
    expect(mg.referenceLineWidthPx).toBe(1.1);
    expect(bg.referenceLineWidthPx).toBe(0.5);

    // 같은 깊이 대역의 6개 패스(선화·음영·원색·깊이·노멀·마스크)가 정확히 동일한 오프셋을 공유
    for (const passId of LT_SIX_PASS_ORDER) {
      expect(fg.passOffsets[passId]).toEqual({ x: fg.offsetXPx, y: fg.offsetYPx });
      expect(mg.passOffsets[passId]).toEqual({ x: mg.offsetXPx, y: mg.offsetYPx });
      expect(bg.passOffsets[passId]).toEqual({ x: bg.offsetXPx, y: bg.offsetYPx });
    }
  });
});

describe("축 07 · 알파 컷아웃(Alpha-Test) 유리/철망 노멀 패스 선화 깨짐 방지 마스크 분리 (#035)", () => {
  it("유리/철망 컷아웃 영역의 노멀 버퍼 노이즈 엣지를 차단하고 분리된 알파 임계치 마스크로 깔끔한 윤곽선을 추출한다", () => {
    const width = 20;
    const height = 20;
    const pixels = width * height;
    const rgba = new Uint8ClampedArray(pixels * 4);
    const normal = new Uint8Array(pixels * 4);
    const materialMask = new Uint8Array(pixels);

    // 철망/유리 프레임 시뮬레이션:
    // 전체를 알파 컷아웃 머티리얼로 지정, 4px 간격의 십자 철망 줄기만 불투명(alpha=255), 구멍은 투명(alpha=20 < 128)
    // 동시에 노멀 버퍼에는 배경 투과 노이즈(인접 픽셀마다 90° 뒤집히는 노멀 깨짐)를 주입!
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x;
        const o = i * 4;
        const isWireStrand = x % 5 === 0 || y % 5 === 0;
        materialMask[i] = 1;
        rgba[o] = 60;
        rgba[o + 1] = 70;
        rgba[o + 2] = 80;
        rgba[o + 3] = isWireStrand ? 255 : 20;

        // 노멀 버퍼에 인접 픽셀마다 교차하는 극심한 노이즈 주입
        const flip = (x + y) % 2 === 0;
        normal[o] = flip ? 255 : 0;
        normal[o + 1] = flip ? 128 : 255;
        normal[o + 2] = 128;
        normal[o + 3] = 255;
      }
    }

    const separated = separateAlphaCutoutMaskPass(rgba, width, height, {
      alphaThreshold: 0.5,
      materialMask,
      normalBuffer: normal,
      normalAngleThresholdDeg: 30,
    });

    // 노멀 패스의 깨진 가짜 엣지가 대량 억제되어야 한다
    expect(separated.suppressedNormalArtifactCount).toBeGreaterThan(50);
    // 알파 임계치(0.5) 기준 고체 철망과 투명 구멍이 정확히 분리된다
    expect(separated.cutoutSolidPixelCount).toBeGreaterThan(0);
    expect(separated.cutoutTransparentPixelCount).toBeGreaterThan(0);
    expect(separated.cutoutContourEdgeCount).toBeGreaterThan(0);

    // convertStudioLtImage 실파이프라인 통합 검증: 분리 활성 vs 비활성 비교
    const source = new ImageData(rgba, width, height);
    const unprotected = convertStudioLtImage(source, {
      ...BASE_LT_OPTIONS,
      enableDepthAttenuation: true,
      normalBuffer: normal,
      separateAlphaCutoutMask: false,
    });
    const protectedResult = convertStudioLtImage(source, {
      ...BASE_LT_OPTIONS,
      enableDepthAttenuation: true,
      normalBuffer: normal,
      separateAlphaCutoutMask: true,
      alphaCutoutThreshold: 0.5,
      alphaCutoutMaterialMask: materialMask,
    });

    // 보호 적용 시: 투명 구멍 내부(철망에서 2px 이상 떨어진 구멍 중심)에 깨진 노멀 선화가 0건이어야 한다
    let unprotectedVoidNoise = 0;
    let protectedVoidNoise = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const isDeepHole = x % 5 === 2 && y % 5 === 2;
        if (!isDeepHole) continue;
        const aOffset = (y * width + x) * 4 + 3;
        if ((unprotected.lineLayer.data[aOffset] ?? 0) > 0) unprotectedVoidNoise += 1;
        if ((protectedResult.lineLayer.data[aOffset] ?? 0) > 0) protectedVoidNoise += 1;
      }
    }

    expect(unprotectedVoidNoise).toBeGreaterThan(0);
    expect(protectedVoidNoise).toBe(0);
    expect(protectedResult.alphaCutoutMaskLayer).toBeDefined();
    expect(protectedResult.depthAttenuationReport?.alphaCutoutSeparated).toBe(true);
    expect(protectedResult.depthAttenuationReport?.suppressedNormalArtifactCount).toBeGreaterThan(50);
  });
});
