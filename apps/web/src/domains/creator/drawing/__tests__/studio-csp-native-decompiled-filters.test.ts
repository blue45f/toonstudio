import { describe, expect, it } from "vitest";

import { CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY } from "../studio-csp-benchmark-scorecard";
import {
  applyCspDustFilter,
  applyCspPerlinNoiseFilter,
  applyCspPiLensDistortionFilter,
  applyCspPolarCoordinatesFilter,
  applyCspSimpleWaveFilter,
  applyCspSpiralFilter,
  applyCspTppAddNoiseFilter,
  applyCspTppNormalMapFilter,
  applyCspTppRotationBlurFilter,
  applyCspTpReduceNoiseFilter,
  computeCspTppPixelBrightness,
  CSP_TG_MATERIAL_PLUGIN_ARCHITECTURE,
  evaluateCspTppNormalNoise3D,
  solveCspEllipticEquationParamTAndMinorAxis,
} from "../studio-csp-native-decompiled-filters";

function createTestRampRgba(width: number, height: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      out[idx] = Math.round((x / Math.max(1, width - 1)) * 255);
      out[idx + 1] = Math.round((y / Math.max(1, height - 1)) * 255);
      out[idx + 2] = 128;
      out[idx + 3] = 255;
    }
  }
  return out;
}

describe("studio-csp-native-decompiled-filters (REA 역컴파일 Mach-O 네이티브 필터 플러그인 11종)", () => {
  it("TPPNormalMap.bundle: GetPixelBrightness(0x1978) 및 3x3 Scharr 법선 맵(0x1670)을 정확히 계산한다", () => {
    expect(computeCspTppPixelBrightness(0.2, 0.8, 0.4, 1.0)).toBeCloseTo(0.5, 5);
    expect(computeCspTppPixelBrightness(0.2, 0.8, 0.4, 0.5)).toBeCloseTo(0.25, 5);

    const src = createTestRampRgba(8, 8);
    const openglMap = applyCspTppNormalMapFilter(src, 8, 8, {
      strength: 0.25,
      yDirectionType: "opengl-y-plus",
    });
    const directxMap = applyCspTppNormalMapFilter(src, 8, 8, {
      strength: 0.25,
      yDirectionType: "directx-y-minus",
    });

    const centerIdx = (4 * 8 + 4) * 4;
    // 우측/하단으로 갈수록 밝아지므로 Scharr(-3,-10,-3 / +3,+10,+3) 결과 Gx < 0, OpenGL Gy < 0, DirectX Gy > 0
    expect(openglMap[centerIdx]!).toBeLessThan(128);
    expect(openglMap[centerIdx + 1]!).toBeLessThan(128);
    expect(directxMap[centerIdx + 1]!).toBeGreaterThan(128);
    expect(openglMap[centerIdx + 2]!).toBeGreaterThan(0);
    expect(openglMap[centerIdx + 3]).toBe(255);
  });

  it("TPPRotationBlur.bundle: SolveEllipticEquationParamTAndMinorAxis(0x19f4) 및 타원 궤적 회전 블러를 수행한다", () => {
    const solved = solveCspEllipticEquationParamTAndMinorAxis(20, 0, 0.5, 0);
    expect(solved.majorAxisPx).toBeCloseTo(20, 4);
    expect(solved.minorAxisPx).toBeCloseTo(10, 4);
    expect(solved.paramTRad).toBeCloseTo(0, 4);

    const src = createTestRampRgba(12, 12);
    const blurred = applyCspTppRotationBlurFilter(src, 12, 12, {
      amountDeg: 35,
      direction: "both",
      aspect: 0.65,
      tiltDeg: 25,
      sampleCount: 9,
    });
    expect(blurred).toHaveLength(src.length);
    // 회전 블러가 적용되어 외곽 픽셀이 혼합됨
    const edgeIdx = (2 * 12 + 9) * 4;
    expect(blurred[edgeIdx + 3]).toBe(255);
  });

  it("LensDistortion.bundle: PILensDistortionFilter 편평도(oblateness) 및 반경 제한 왜곡을 수행한다", () => {
    const src = createTestRampRgba(12, 12);
    const barrel = applyCspPiLensDistortionFilter(src, 12, 12, {
      distortion: 55,
      rangeType: "full",
      radius01: 1.0,
      oblateness: 0.3,
    });
    const pincushion = applyCspPiLensDistortionFilter(src, 12, 12, {
      distortion: -55,
      rangeType: "radius",
      radius01: 0.8,
      oblateness: -0.25,
    });

    const sampleIdx = (3 * 12 + 3) * 4;
    expect(barrel[sampleIdx]).not.toBe(pincushion[sampleIdx]);
  });

  it("TPReduceNoiseFilter.bundle & TPPAddNoise.bundle: 가우시안 노이즈 추가 및 타일 컨볼루션 노이즈 감소를 수행한다", () => {
    const n0 = evaluateCspTppNormalNoise3D(4, 7, 0, 99);
    const n1 = evaluateCspTppNormalNoise3D(4, 7, 0, 99);
    expect(n0).toBeCloseTo(n1, 8);

    const clean = new Uint8ClampedArray(10 * 10 * 4).fill(140);
    const noisy = applyCspTppAddNoiseFilter(clean, 10, 10, {
      amount01: 0.35,
      colorMode: "color",
      seed: 123,
    });
    const denoised = applyCspTpReduceNoiseFilter(noisy, 10, 10, {
      strength01: 0.85,
      preserveDetail01: 0.5,
      tileSizePx: 4,
    });

    let noisyVariance = 0;
    let denoisedVariance = 0;
    for (let i = 0; i < 100; i += 1) {
      const idx = i * 4;
      noisyVariance += (noisy[idx]! - 140) ** 2;
      denoisedVariance += (denoised[idx]! - 140) ** 2;
    }
    expect(noisyVariance).toBeGreaterThan(100);
    expect(denoisedVariance).toBeLessThan(noisyVariance);
  });

  it("SimpleWave, Spiral, Dust, PolarCd, PerlinNoise 네이티브 필터군과 TGMaterialPlugIn 메타데이터를 검증한다", () => {
    const src = createTestRampRgba(10, 10);
    const wave = applyCspSimpleWaveFilter(src, 10, 10, {
      amplitudeX: 2,
      amplitudeY: 1.5,
      wavelengthX: 6,
      wavelengthY: 6,
    });
    const spiral = applyCspSpiralFilter(src, 10, 10, { twirlTurns: 1.2 });
    const polar = applyCspPolarCoordinatesFilter(src, 10, 10, { mode: "rect-to-polar" });
    const perlin = applyCspPerlinNoiseFilter(src, 10, 10, {
      scalePx: 5,
      octaves: 3,
      persistence: 0.5,
      blendOpacity01: 0.8,
    });

    // 어두운 먼지 점(speckle) 1픽셀 삽입 후 Dust 필터로 제거
    const dusty = new Uint8ClampedArray(10 * 10 * 4).fill(200);
    const speckIdx = (5 * 10 + 5) * 4;
    dusty[speckIdx] = 10;
    dusty[speckIdx + 1] = 10;
    dusty[speckIdx + 2] = 10;
    const cleaned = applyCspDustFilter(dusty, 10, 10, {
      radiusPx: 1,
      mode: "remove-dark-dust",
      threshold01: 0.1,
    });

    expect(cleaned[speckIdx]).toBe(200);
    expect(wave).toHaveLength(src.length);
    expect(spiral).toHaveLength(src.length);
    expect(polar).toHaveLength(src.length);
    expect(perlin).toHaveLength(src.length);
    expect(CSP_TG_MATERIAL_PLUGIN_ARCHITECTURE.exportedSymbolCount).toBe(7770);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.tgMaterialPlugInExportedSymbolCount).toBe(7770);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.decompiledNativeFilterBundleCount).toBe(11);
  });
});
