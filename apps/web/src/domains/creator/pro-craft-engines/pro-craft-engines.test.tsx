// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { ProCraftEnginesPanel } from "./ProCraftEnginesPanel";
import { extract3dLightingRigFrom2dCut } from "./cut-to-3d-lighting-matcher";
import {
  generateDieCutSvgFromAlpha,
  runCmykPrintPreflight,
} from "./goods-print-cutline-preflight";
import {
  calibratePersonalStylusProfile,
  evaluatePressureCurve,
  simulateNibWearAndInkDepletion,
  type StylusCalibrationSample,
} from "./stylus-pressure-calibrator";

describe("pro-craft-engines: 2D->3D 라이팅 매칭 · 굿즈 칼선/CMYK · 개인 필압 캘리브레이션", () => {
  beforeEach(() => {
    useI18n.setState({ lang: "ko" });
  });

  it("2D 컷의 좌상단 따뜻한 광원과 우하단 차가운 그림자를 3D 3점 조명 방위각/고도각/색온도로 정확히 추정한다", () => {
    const w = 64;
    const h = 64;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const warmKey = Math.max(0, 1 - Math.hypot(x / w, y / h));
        buf[idx] = Math.round(30 + warmKey * 225);
        buf[idx + 1] = Math.round(35 + warmKey * 175);
        buf[idx + 2] = Math.round(70 + warmKey * 65);
        buf[idx + 3] = 255;
      }
    }

    const rig = extract3dLightingRigFrom2dCut(buf, w, h);
    expect(rig.keyLight.azimuthDeg).toBeLessThan(0);
    expect(rig.keyLight.elevationDeg).toBeGreaterThan(25);
    expect(rig.keyTemperatureKelvin).toBeLessThan(4600);
    expect(rig.moodId).toBe("golden-hour");
    expect(rig.shadowRampThresholds[0]).toBeLessThan(rig.shadowRampThresholds[1]);
    expect(rig.shadowRampThresholds[1]).toBeLessThan(rig.shadowRampThresholds[2]);
  });

  it("투명 캐릭터 원형 알파로부터 오프셋 확장 SVG 칼선과 키링 타공 좌표를 생성한다", () => {
    const w = 80;
    const h = 80;
    const buf = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (Math.hypot(x - 40, y - 40) <= 16) {
          const idx = (y * w + x) * 4;
          buf[idx] = 200;
          buf[idx + 1] = 80;
          buf[idx + 2] = 120;
          buf[idx + 3] = 255;
        }
      }
    }

    const res = generateDieCutSvgFromAlpha(buf, w, h, {
      offsetPx: 6,
      includeKeyringEyelet: true,
      eyeletRadiusPx: 8,
    });
    expect(res.hasOpaqueSubject).toBe(true);
    expect(res.svgPathD.startsWith("M ")).toBe(true);
    expect(res.svgPathD.endsWith(" Z")).toBe(true);
    expect(res.polygonPoints.length).toBeGreaterThanOrEqual(12);
    expect(res.boundingBox.maxX - res.boundingBox.minX).toBeGreaterThanOrEqual(40);
    expect(res.eyeletCenter).not.toBeNull();
    expect(res.eyeletCenter!.y).toBeLessThan(res.boundingBox.minY);
  });

  it("CMYK 색역 이탈 네온 픽셀, 300 DPI 해상도, 단행본 책등 두께를 정확히 판정한다", () => {
    const neonBuf = new Uint8ClampedArray(64 * 64 * 4);
    for (let i = 0; i < 64 * 64; i++) {
      neonBuf[i * 4] = 10;
      neonBuf[i * 4 + 1] = 250;
      neonBuf[i * 4 + 2] = 30;
      neonBuf[i * 4 + 3] = 255;
    }

    const report = runCmykPrintPreflight({
      rgba: neonBuf,
      pixelWidth: 1200,
      pixelHeight: 1800,
      physicalWidthMm: 148,
      physicalHeightMm: 210,
      bookPageCount: 240,
    });
    expect(report.dpiPass).toBe(false);
    expect(report.outOfGamutRisk).toBe("high");
    expect(report.bleedPixelsRequired).toBe(36);
    expect(report.spineWidthMm).toBeCloseTo(13.8, 1);
    expect(report.warningsKo.length).toBeGreaterThanOrEqual(2);
    expect(report.warningsEn.length).toBe(report.warningsKo.length);
  });

  it("가벼운 필압과 강한 필압 작가 샘플을 구분하고 손떨림 보정·펜촉 마모를 정확히 산출한다", () => {
    const lightSamples: StylusCalibrationSample[] = Array.from({ length: 24 }, (_, i) => ({
      x: i * 5,
      y: 20 + (i % 2 === 0 ? 0.2 : -0.2),
      pressure: 0.12 + (i / 24) * 0.28,
      tiltX: 18,
      tiltY: 12,
      timestampMs: i * 16,
    }));

    const heavyShakySamples: StylusCalibrationSample[] = Array.from({ length: 24 }, (_, i) => ({
      x: i * 5,
      y: 20 + (i % 2 === 0 ? 3.5 : -3.5),
      pressure: 0.62 + (i / 24) * 0.36,
      tiltX: 32,
      tiltY: 15,
      timestampMs: i * 16,
    }));

    const lightProfile = calibratePersonalStylusProfile(lightSamples);
    const heavyProfile = calibratePersonalStylusProfile(heavyShakySamples);

    expect(lightProfile.archetype).toBe("feather-light");
    expect(heavyProfile.archetype).toBe("heavy-press");
    expect(heavyProfile.recommendedOneEuro.stabilizerStrengthPct).toBeGreaterThan(
      lightProfile.recommendedOneEuro.stabilizerStrengthPct,
    );

    expect(
      evaluatePressureCurve(0.35, lightProfile.cubicBezierCurve, lightProfile.deadzoneMin),
    ).toBeGreaterThan(
      evaluatePressureCurve(0.35, heavyProfile.cubicBezierCurve, heavyProfile.deadzoneMin),
    );

    const freshNib = simulateNibWearAndInkDepletion(0, 0, "oriental-brush");
    const dryWornNib = simulateNibWearAndInkDepletion(120, 4.5, "oriental-brush");
    expect(freshNib.nibSharpness).toBe(1);
    expect(freshNib.inkLoadRemaining).toBe(1);
    expect(dryWornNib.nibSharpness).toBeLessThan(0.6);
    expect(dryWornNib.recommendedDryBrushScratch).toBeGreaterThan(0.8);
  });

  it("ProCraftEnginesPanel이 3개 탭 전환과 EN 모드 한글 0자를 만족한다", () => {
    const { container } = render(<ProCraftEnginesPanel />);
    expect(screen.getByTestId("pro-craft-lighting-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /굿즈 칼선/ }));
    expect(screen.getByTestId("pro-craft-cutline-tab")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /10초 필압/ }));
    expect(screen.getByTestId("pro-craft-stylus-tab")).toBeTruthy();

    useI18n.setState({ lang: "en" });
    const enRender = render(<ProCraftEnginesPanel />);
    expect(/[가-힣]/u.test(enRender.container.textContent ?? "")).toBe(false);
    expect(container.textContent?.length).toBeGreaterThan(20);
  });
});
