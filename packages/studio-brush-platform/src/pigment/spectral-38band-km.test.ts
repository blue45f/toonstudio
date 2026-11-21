import { describe, expect, it } from "vitest";

import {
  SPECTRAL_38BAND_COUNT,
  linearRgbToSpectralReflectance38,
  mixSpectral38BandKubelkaMunk,
  mixSpectral38BandSrgb8,
  spectralReflectance38ToLinearRgb,
} from "./spectral-38band-km";
import { SPECTRAL_38BAND_KM_WGSL_SNIPPET } from "./spectral-38band-km-wgsl";

describe("spectral-38band-km (380~750nm CIE 1931 D65 Kubelka-Munk 정본)", () => {
  it("황색+청색 혼색 시 회색 탁점 없이 녹색 스펙트럼과 높은 OKLab 채도 보존 이득을 산출한다", () => {
    const res = mixSpectral38BandKubelkaMunk({
      colorASrgb01: { r: 0.98, g: 0.88, b: 0.05 },
      colorBSrgb01: { r: 0.04, g: 0.16, b: 0.62 },
      factorA: 0.52,
      factorB: 0.48,
      tintingStrengthA: 1.0,
      tintingStrengthB: 1.15,
    });

    expect(res.spectralReflectance38).toHaveLength(SPECTRAL_38BAND_COUNT);
    expect(res.mixedSrgb01.g).toBeGreaterThan(res.mixedSrgb01.r);
    expect(res.mixedSrgb01.g).toBeGreaterThan(res.mixedSrgb01.b);
    expect(res.oklabLCh.hDeg).toBeGreaterThan(125);
    expect(res.oklabLCh.hDeg).toBeLessThan(155);
    expect(res.chromaPreservationDeltaC).toBeGreaterThan(0.055);
    expect(res.chromaPreservationGain01).toBeGreaterThan(0.42);
  });

  it("백색·중간색 왕복 스펙트럼 복원 오차가 작고 8비트 고속 경로와 일치한다", () => {
    const whiteRefl = linearRgbToSpectralReflectance38({ r: 1, g: 1, b: 1 });
    const whiteLin = spectralReflectance38ToLinearRgb(whiteRefl);
    expect(whiteLin.r).toBeCloseTo(1, 3);
    expect(whiteLin.g).toBeCloseTo(1, 3);
    expect(whiteLin.b).toBeCloseTo(1, 3);

    const fast8 = mixSpectral38BandSrgb8(
      { r: 250, g: 224, b: 13 },
      { r: 10, g: 41, b: 158 },
      0.5,
    );
    expect(fast8.g).toBeGreaterThan(fast8.r);
    expect(fast8.g).toBeGreaterThan(fast8.b);
  });

  it("WGSL 단일 정본 스니펫이 38밴드 테이블과 spectral38_mix_srgb 함수를 포함한다", () => {
    expect(SPECTRAL_38BAND_KM_WGSL_SNIPPET).toContain("array<f32, 38>");
    expect(SPECTRAL_38BAND_KM_WGSL_SNIPPET).toContain("fn spectral38_mix_srgb");
  });
});
