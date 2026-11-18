import { describe, expect, it } from "vitest";

import {
  STUDIO_PERTURBATION_SHIELD_DISCLOSURE,
  applyExportPerturbationShield,
  generateBandLimitedBlueNoiseTile,
  normalizePerturbationIntensity,
} from "./studio-export-perturbation-shield";

/** 흰색 말풍선 영역과 검은 펜선/명암 경계가 공존하는 테스트 원고 버퍼 생성. */
function makeComicTestBuffer(width: number, height: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      // 왼쪽 절반(x < width/2 - 2)은 순백색 말풍선 내부 (255, 255, 255)
      if (x < width / 2) {
        buf[p] = 255;
        buf[p + 1] = 255;
        buf[p + 2] = 255;
        buf[p + 3] = 255;
      } else {
        // 오른쪽 절반은 텍스처·명암 경계가 있는 채색/스크린톤 영역
        const checker = ((x + y) % 3) * 45 + 60;
        buf[p] = checker;
        buf[p + 1] = Math.min(255, checker + 20);
        buf[p + 2] = Math.max(0, checker - 15);
        buf[p + 3] = 255;
      }
    }
  }
  return buf;
}

describe("studio-export-perturbation-shield — 대역제한 블루노이즈 섭동 및 정직한 고지", () => {
  it("시드 기반으로 100% 결정적이며 평균이 0인 대역제한 블루노이즈 타일을 생성한다", () => {
    const tileA = generateBandLimitedBlueNoiseTile("episode-12", 32);
    const tileB = generateBandLimitedBlueNoiseTile("episode-12", 32);
    const tileC = generateBandLimitedBlueNoiseTile("episode-13", 32);

    expect(tileA).toEqual(tileB);
    expect(tileA).not.toEqual(tileC);

    const mean = tileA.reduce((acc, v) => acc + v, 0) / tileA.length;
    expect(Math.abs(mean)).toBeLessThan(1e-5);
    expect(Math.max(...tileA)).toBeLessThanOrEqual(1 + 1e-6);
    expect(Math.min(...tileA)).toBeGreaterThanOrEqual(-1 - 1e-6);
  });

  it("평탄한 흰색 말풍선 내부는 무손실(255,255,255)로 보호하고 선화·채색 경계에만 섭동을 가한다", () => {
    const width = 24;
    const height = 16;
    const src = makeComicTestBuffer(width, height);

    const resLow = applyExportPerturbationShield(src, width, height, {
      intensity: 1,
      seed: 42,
    });
    const resHigh = applyExportPerturbationShield(src, width, height, {
      intensity: 4,
      seed: 42,
    });
    const resHighRepeat = applyExportPerturbationShield(src, width, height, {
      intensity: 4,
      seed: 42,
    });

    // 결정성 검증
    expect(resHigh.pixels).toEqual(resHighRepeat.pixels);
    expect(resHigh.perturbedPixelCount).toBeGreaterThan(0);
    expect(resHigh.preservedFlatWhitePixelCount).toBeGreaterThan(0);
    expect(resHigh.perturbedPixelCount).toBeGreaterThanOrEqual(resLow.perturbedPixelCount);

    // 말풍선 안쪽 순백색 픽셀(x <= 8)은 단 1 LSB도 변하지 않아야 한다.
    for (let y = 2; y < height - 2; y += 1) {
      for (let x = 2; x <= 8; x += 1) {
        const p = (y * width + x) * 4;
        expect(resHigh.pixels[p]).toBe(255);
        expect(resHigh.pixels[p + 1]).toBe(255);
        expect(resHigh.pixels[p + 2]).toBe(255);
        expect(resHigh.pixels[p + 3]).toBe(255);
      }
    }

    // 강도 클램프 검증 (1..4)
    expect(normalizePerturbationIntensity(-5)).toBe(1);
    expect(normalizePerturbationIntensity(99)).toBe(4);
  });

  it("보장된 보호가 아닌 통계적 스크래핑 억제 수단임을 한국어 고지 메타데이터로 명시한다", () => {
    const src = makeComicTestBuffer(8, 8);
    const result = applyExportPerturbationShield(src, 8, 8, { intensity: 2 });

    expect(result.disclosure).toBe(STUDIO_PERTURBATION_SHIELD_DISCLOSURE);
    expect(result.disclosure.isGuaranteedProtection).toBe(false);
    expect(result.disclosure.kind).toBe("statistical-scraping-deterrent");
    expect(result.disclosure.summaryKo).toContain("보조적 억제");
    expect(result.disclosure.summaryKo).toContain("보장된 보호 수단이 아닙니다");
    expect(result.disclosure.limitationsKo.length).toBeGreaterThanOrEqual(3);
  });
});
