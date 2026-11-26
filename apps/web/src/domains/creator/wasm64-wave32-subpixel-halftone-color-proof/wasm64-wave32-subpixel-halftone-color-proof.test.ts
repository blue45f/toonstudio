import { describe, expect, it } from "vitest";

import {
  PAPER_DOT_GAIN_PROFILES,
  STANDARD_CMYK_AM_ANGLES_DEG,
  compensateDotGainForPlate,
  halftonePlateRotatedAm,
  halftonePlateStuckiSerpentine,
  mitchellNetravaliWeight,
  predictPrintedToneYuleNielsen,
  resolveCrispLineArtSubpixels,
  resolveSafeSubpixelLayout,
} from "./index";

describe("wasm64-wave32-subpixel-halftone-color-proof", () => {
  it("Yule-Nielsen 도트 게인 예측과 역보정이 0..1 전역에서 단조 증가하며 1e-6 이내로 왕복 일치한다", () => {
    for (const profile of Object.values(PAPER_DOT_GAIN_PROFILES)) {
      expect(predictPrintedToneYuleNielsen(0, profile)).toBe(0);
      expect(predictPrintedToneYuleNielsen(1, profile)).toBe(1);
      expect(predictPrintedToneYuleNielsen(0.5, profile)).toBeGreaterThan(0.58);

      let prevPlate = -1;
      for (const desired of [0, 0.12, 0.25, 0.5, 0.75, 0.9, 1]) {
        const plate = compensateDotGainForPlate(desired, profile);
        expect(plate).toBeGreaterThan(prevPlate);
        prevPlate = plate;
        const roundtrip = predictPrintedToneYuleNielsen(plate, profile);
        expect(Math.abs(roundtrip - desired)).toBeLessThan(1e-6);
      }
    }
  });

  it("서펜타인 Stucki 확률적 FM 망점이 평균 농도를 정밀 보존하고 인쇄 용지 도트 게인을 선제 감산한다", () => {
    const width = 64;
    const height = 64;
    const plane = new Float32Array(width * height).fill(0.42);

    const rawFm = halftonePlateStuckiSerpentine(plane, width, height);
    expect(Math.abs(rawFm.actualMeanCoverage - 0.42)).toBeLessThan(0.015);
    expect(rawFm.directionalBiasScore).toBeLessThan(0.08);

    const compensatedFm = halftonePlateStuckiSerpentine(
      plane,
      width,
      height,
      PAPER_DOT_GAIN_PROFILES["uncoated-comic-80g"],
    );
    expect(compensatedFm.actualMeanCoverage).toBeLessThan(rawFm.actualMeanCoverage - 0.12);
    const printedVisual = predictPrintedToneYuleNielsen(
      compensatedFm.actualMeanCoverage,
      PAPER_DOT_GAIN_PROFILES["uncoated-comic-80g"],
    );
    expect(Math.abs(printedVisual - 0.42)).toBeLessThan(0.025);
  });

  it("표준 CMYK AM 스크린 각도(15/75/0/45°) 분리 판면을 안정적으로 생성한다", () => {
    const width = 48;
    const height = 48;
    const gradient = new Float32Array(width * height);
    for (let i = 0; i < gradient.length; i += 1) {
      gradient[i] = i / (gradient.length - 1);
    }

    const blackPlate = halftonePlateRotatedAm(
      gradient,
      width,
      height,
      STANDARD_CMYK_AM_ANGLES_DEG.black,
      6,
    );
    expect(Math.abs(blackPlate.actualMeanCoverage - 0.5)).toBeLessThan(0.05);
  });

  it("OLED 펜타일 및 회전 태블릿에서는 무채색 선화의 색번짐(chromaFringingRms)을 엄격히 0으로 억제한다", () => {
    expect(
      resolveSafeSubpixelLayout({
        devicePixelRatio: 3,
        isTouchPrimary: true,
        orientationAngleDeg: 0,
      }),
    ).toBe("oled-diamond-pentile");
    expect(
      resolveSafeSubpixelLayout({
        devicePixelRatio: 2,
        isTouchPrimary: false,
        orientationAngleDeg: 90,
      }),
    ).toBe("rotated-tablet-dynamic");
    expect(
      resolveSafeSubpixelLayout({
        devicePixelRatio: 1,
        isTouchPrimary: false,
        orientationAngleDeg: 0,
        panelHint: "lcd-rgb",
      }),
    ).toBe("rgb-horizontal-stripe");

    const width = 24;
    const height = 16;
    const coverage3x = new Float32Array(width * 3 * height);
    for (let y = 0; y < height; y += 1) {
      const strokeSubX = 20 + (y % 5);
      coverage3x[y * width * 3 + strokeSubX] = 1;
      coverage3x[y * width * 3 + strokeSubX + 1] = 0.85;
    }

    const pentile = resolveCrispLineArtSubpixels(coverage3x, width, height, "oled-diamond-pentile");
    expect(pentile.chromaFringingRms).toBe(0);

    const desktopRgb = resolveCrispLineArtSubpixels(coverage3x, width, height, "rgb-horizontal-stripe");
    expect(desktopRgb.chromaFringingRms).toBeGreaterThan(0);
    expect(mitchellNetravaliWeight(0)).toBeCloseTo(8 / 9, 5);
    expect(mitchellNetravaliWeight(2.1)).toBe(0);
  });
});
