// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoQaPixelScannerPanel } from "./AutoQaPixelScannerPanel";
import {
  autoSealPinholesAndTrimBleed,
  createDemoCutPixelBuffers,
  scanPinholeAndColorBleed,
} from "./pinhole-bleed-scanner";
import {
  applySimulatedFixAtRedlinePin,
  computeShortestAngleDiffDeg,
  createDemoRedlineReverifyFixture,
  diagnose2d3dVisualCohesion,
  reverifyRedlinePinsByPixelDiff,
  type RedlinePinTarget,
} from "./redline-pixel-reverify-and-cohesion";

afterEach(cleanup);

function paintRect(
  rgba: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const off = (y * width + x) * 4;
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = a;
    }
  }
}

function drawClosedBoxLineart(
  lineartRgba: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  paintRect(lineartRgba, width, x0, y0, x1, y0 + 1, 18, 18, 22, 255);
  paintRect(lineartRgba, width, x0, y1 - 1, x1, y1, 18, 18, 22, 255);
  paintRect(lineartRgba, width, x0, y0, x0 + 1, y1, 18, 18, 22, 255);
  paintRect(lineartRgba, width, x1 - 1, y0, x1, y1, 18, 18, 22, 255);
}

describe("미채색 구멍·선화 삐져나옴 스캐너 및 Auto-Seal/Auto-Trim (pinhole-bleed-scanner)", () => {
  it("선화 폐곡선 내부의 투명·순백색(L>0.97) 1~23px 구멍만 검출하고 >=24px 흰 영역은 유지하며 Auto-Seal 후 0건으로 해소한다", () => {
    const width = 64;
    const height = 64;
    const lineart = new Uint8ClampedArray(width * height * 4);
    const flat = new Uint8ClampedArray(width * height * 4);

    // 폐곡선 선화 (10..52, 10..52)
    drawClosedBoxLineart(lineart, width, 10, 10, 52, 52);
    // 내부 밑색 (청록색 48, 128, 168)
    paintRect(flat, width, 12, 12, 50, 50, 48, 128, 168, 255);

    // 구멍 #1: 알파 0 투명 구멍 (2×2 = 4px)
    paintRect(flat, width, 18, 18, 19, 19, 0, 0, 0, 0);
    // 구멍 #2: 순백색(L > 0.97) 구멍 (3×2 = 6px)
    paintRect(flat, width, 34, 20, 36, 21, 252, 252, 252, 255);
    // 정상 흰색 영역: 6×5 = 30px (>= 24px → 미채색 구멍 오탐 금지)
    paintRect(flat, width, 24, 36, 29, 40, 255, 255, 255, 255);

    const beforeFlatCopy = new Uint8ClampedArray(flat);
    const scanBefore = scanPinholeAndColorBleed(lineart, flat, width, height);

    expect(scanBefore.pinholes).toHaveLength(2);
    expect(scanBefore.colorBleeds).toHaveLength(0);
    expect(scanBefore.totalPinholePixels).toBe(10);
    expect(scanBefore.redlinePins).toHaveLength(2);
    expect(scanBefore.pinholes.map((item) => item.reason).sort()).toEqual(["pure-white", "transparent"]);
    expect(scanBefore.redlinePins[0]?.xPx).toBeGreaterThanOrEqual(18);
    expect(scanBefore.redlinePins[0]?.radiusPx).toBeGreaterThanOrEqual(2);

    const sealed = autoSealPinholesAndTrimBleed(lineart, flat, width, height, scanBefore);

    // 원본 버퍼 불변 확인
    expect(flat).toEqual(beforeFlatCopy);
    expect(sealed.sealedPinholeCount).toBe(2);
    expect(sealed.sealedPixelCount).toBe(10);
    expect(sealed.modifiedPixelCount).toBe(10);
    expect(sealed.unresolvedPinholeCount).toBe(0);

    // 봉합된 구멍 픽셀이 주변 다수결 밑색(48, 128, 168, 255)으로 채워졌는지 확인
    const sealedHoleOffset = (18 * width + 18) * 4;
    expect([
      sealed.rgba[sealedHoleOffset],
      sealed.rgba[sealedHoleOffset + 1],
      sealed.rgba[sealedHoleOffset + 2],
      sealed.rgba[sealedHoleOffset + 3],
    ]).toEqual([48, 128, 168, 255]);

    // 30px 정상 흰 영역은 손대지 않아야 함
    const whitePatchOffset = (38 * width + 26) * 4;
    expect([
      sealed.rgba[whitePatchOffset],
      sealed.rgba[whitePatchOffset + 1],
      sealed.rgba[whitePatchOffset + 2],
      sealed.rgba[whitePatchOffset + 3],
    ]).toEqual([255, 255, 255, 255]);

    // 재스캔 시 구멍 0건 해소
    const scanAfter = scanPinholeAndColorBleed(lineart, sealed.rgba, width, height);
    expect(scanAfter.pinholes).toHaveLength(0);
    expect(scanAfter.totalDefectCount).toBe(0);
  });

  it("선화 바깥 1~8px 삐져나옴 클러스터만 검출·알파 0으로 트리밍하고, 9px 이상 독립 외부 배경은 유지한다", () => {
    const width = 64;
    const height = 64;
    const lineart = new Uint8ClampedArray(width * height * 4);
    const flat = new Uint8ClampedArray(width * height * 4);

    drawClosedBoxLineart(lineart, width, 16, 16, 44, 44);
    paintRect(flat, width, 18, 18, 42, 42, 180, 96, 74, 255);

    // 삐져나옴 #1: 우측 선화 바깥으로 3px 돌출 (45..47, 24..26 → 9px)
    paintRect(flat, width, 45, 24, 47, 26, 180, 96, 74, 255);
    // 삐져나옴 #2: 좌측 선화 바깥으로 6px 돌출 (10..15, 30..31 → 12px)
    paintRect(flat, width, 10, 30, 15, 31, 180, 96, 74, 255);
    // 의도된 독립 배경 블록: 선화에서 12px 이상 떨어진 외부 영역 (56..62, 50..60)
    paintRect(flat, width, 56, 50, 62, 60, 110, 140, 190, 255);

    const scanBefore = scanPinholeAndColorBleed(lineart, flat, width, height);
    expect(scanBefore.pinholes).toHaveLength(0);
    expect(scanBefore.colorBleeds).toHaveLength(2);
    expect(scanBefore.totalBleedPixels).toBe(21);
    expect(scanBefore.colorBleeds.every((item) => item.protrusionPx >= 1 && item.protrusionPx <= 8)).toBe(true);

    const trimmed = autoSealPinholesAndTrimBleed(lineart, flat, width, height, scanBefore);
    expect(trimmed.trimmedBleedCount).toBe(2);
    expect(trimmed.trimmedPixelCount).toBe(21);

    // 삐져나온 픽셀 알파 0 확인
    expect(trimmed.rgba[(25 * width + 46) * 4 + 3]).toBe(0);
    expect(trimmed.rgba[(30 * width + 11) * 4 + 3]).toBe(0);
    // 먼 독립 외부 배경 블록은 보존
    expect(trimmed.rgba[(54 * width + 58) * 4 + 3]).toBe(255);

    const scanAfter = scanPinholeAndColorBleed(lineart, trimmed.rgba, width, height);
    expect(scanAfter.colorBleeds).toHaveLength(0);
    expect(scanAfter.totalDefectCount).toBe(0);
  });

  it("데모 컷 버퍼는 초기 구멍 3건·삐져나옴 2건을 검출하고 1클릭 보정 후 0건으로 완전히 정리된다", () => {
    const demo = createDemoCutPixelBuffers();
    const before = scanPinholeAndColorBleed(demo.lineartRgba, demo.flatRgba, demo.width, demo.height);

    expect(before.pinholes).toHaveLength(3);
    expect(before.colorBleeds).toHaveLength(2);
    expect(before.totalDefectCount).toBe(5);
    expect(before.redlinePins).toHaveLength(5);

    const fixed = autoSealPinholesAndTrimBleed(demo.lineartRgba, demo.flatRgba, demo.width, demo.height, before);
    expect(fixed.sealedPinholeCount).toBe(3);
    expect(fixed.trimmedBleedCount).toBe(2);
    expect(fixed.modifiedPixelCount).toBe(before.totalPinholePixels + before.totalBleedPixels);

    const after = scanPinholeAndColorBleed(demo.lineartRgba, fixed.rgba, demo.width, demo.height);
    expect(after.pinholes).toHaveLength(0);
    expect(after.colorBleeds).toHaveLength(0);
    expect(after.totalDefectCount).toBe(0);

    // 자동 생성된 붉은펜 핀 페이로드를 2차 픽셀 재검수 엔진에 바로 전달하면 전부 verified-fixed 판정을 받는다
    const reverify = reverifyRedlinePinsByPixelDiff(
      demo.flatRgba,
      fixed.rgba,
      demo.width,
      demo.height,
      before.redlinePins,
    );
    expect(reverify.summary.verifiedFixedCount).toBe(5);
    expect(reverify.summary.missedUnchangedCount).toBe(0);
    expect(reverify.summary.readyForApproval).toBe(true);
  });
});

describe("붉은펜 픽셀 자동 재검수 & 2D↔3D 이질감 진단 (redline-pixel-reverify-and-cohesion)", () => {
  it("수정된 핀(verified-fixed)·부분 수정 핀(partial-change)·미수정 핀(missed-unchanged)을 정확히 분류하고 누락 핀을 최상단 정렬한다", () => {
    const fixture = createDemoRedlineReverifyFixture();
    const report = reverifyRedlinePinsByPixelDiff(
      fixture.beforeRgba,
      fixture.afterRgba,
      fixture.width,
      fixture.height,
      fixture.pins,
    );

    expect(report.summary.totalPins).toBe(4);
    expect(report.summary.verifiedFixedCount).toBe(2);
    expect(report.summary.partialChangeCount).toBe(1);
    expect(report.summary.missedUnchangedCount).toBe(1);
    expect(report.summary.readyForApproval).toBe(false);
    expect(report.summary.missedPinIds).toEqual(["pd-pin-04"]);

    const byId = new Map(report.results.map((item) => [item.id, item]));
    expect(byId.get("pd-pin-01")?.verdict).toBe("verified-fixed");
    expect(byId.get("pd-pin-02")?.verdict).toBe("verified-fixed");
    expect(byId.get("pd-pin-03")?.verdict).toBe("partial-change");
    expect(byId.get("pd-pin-04")?.verdict).toBe("missed-unchanged");
    expect(byId.get("pd-pin-04")?.changedPixelCount).toBe(0);
    expect(byId.get("pd-pin-04")?.changedRatio).toBe(0);

    // 누락 핀이 우선순위 목록의 최상단에 배치되는지 확인
    expect(report.prioritizedResults[0]?.id).toBe("pd-pin-04");
    expect(report.prioritizedResults[0]?.verdict).toBe("missed-unchanged");
    expect(report.prioritizedResults[1]?.verdict).toBe("partial-change");

    // 누락 핀 + 부분 수정 핀에 수정 반영 시 모든 핀이 verified-fixed로 전환
    const pin3 = fixture.pins[2] as RedlinePinTarget;
    const pin4 = fixture.pins[3] as RedlinePinTarget;
    const afterPin4 = applySimulatedFixAtRedlinePin(fixture.afterRgba, fixture.width, fixture.height, pin4);
    const afterAllFixed = applySimulatedFixAtRedlinePin(afterPin4, fixture.width, fixture.height, pin3);

    const finalReport = reverifyRedlinePinsByPixelDiff(
      fixture.beforeRgba,
      afterAllFixed,
      fixture.width,
      fixture.height,
      fixture.pins,
    );
    expect(finalReport.summary.verifiedFixedCount).toBe(4);
    expect(finalReport.summary.missedUnchangedCount).toBe(0);
    expect(finalReport.summary.readyForApproval).toBe(true);
  });

  it("2D↔3D 이질감 점수는 광원각·외곽선 두께·OKLCH 채도 편차가 커질수록 엄격하게 단조 감소하며 추천값 적용 시 크게 상승한다", () => {
    const base2d = { lightAngleDeg: 40, outlinePx: 2.2, oklchChroma: 0.14 };

    // 완전 일치 = 100점, 경고 0건
    const perfect = diagnose2d3dVisualCohesion(base2d, {
      sunAngleDeg: 40,
      linePx: 2.2,
      oklchChroma: 0.14,
    });
    expect(perfect.cohesionScore).toBe(100);
    expect(perfect.warnings).toHaveLength(0);
    expect(perfect.grade).toBe("harmonious");

    // 각도 360도 래핑 최단거리 검증
    expect(computeShortestAngleDiffDeg(355, 5)).toBe(10);

    // 1) 태양각 편차 단조 감소: 0° > 20° > 45° > 90° > 135° > 180°
    const angleDeltas = [0, 20, 45, 90, 135, 180];
    const angleScores = angleDeltas.map(
      (delta) =>
        diagnose2d3dVisualCohesion(base2d, {
          sunAngleDeg: base2d.lightAngleDeg + delta,
          linePx: base2d.outlinePx,
          oklchChroma: base2d.oklchChroma,
        }).cohesionScore,
    );
    for (let i = 1; i < angleScores.length; i += 1) {
      expect(angleScores[i] ?? 0).toBeLessThan(angleScores[i - 1] ?? 101);
    }

    // 2) 외곽선 두께 편차 단조 감소: 0px > 0.5px > 1.5px > 3.0px
    const outlineDeltas = [0, 0.5, 1.5, 3.0];
    const outlineScores = outlineDeltas.map(
      (delta) =>
        diagnose2d3dVisualCohesion(base2d, {
          sunAngleDeg: base2d.lightAngleDeg,
          linePx: base2d.outlinePx + delta,
          oklchChroma: base2d.oklchChroma,
        }).cohesionScore,
    );
    for (let i = 1; i < outlineScores.length; i += 1) {
      expect(outlineScores[i] ?? 0).toBeLessThan(outlineScores[i - 1] ?? 101);
    }

    // 3) OKLCH 채도 편차 단조 감소: 0.00 > 0.04 > 0.10 > 0.20
    const chromaDeltas = [0, 0.04, 0.1, 0.2];
    const chromaScores = chromaDeltas.map(
      (delta) =>
        diagnose2d3dVisualCohesion(base2d, {
          sunAngleDeg: base2d.lightAngleDeg,
          linePx: base2d.outlinePx,
          oklchChroma: base2d.oklchChroma + delta,
        }).cohesionScore,
    );
    for (let i = 1; i < chromaScores.length; i += 1) {
      expect(chromaScores[i] ?? 0).toBeLessThan(chromaScores[i - 1] ?? 101);
    }

    // 큰 이질감 상태에서 추천 조명 프리셋·선폭·채도 적용 시 점수가 대폭 상승하고 경고가 0건이 된다
    const clashing = diagnose2d3dVisualCohesion(base2d, {
      sunAngleDeg: 215,
      linePx: 0.4,
      oklchChroma: 0.29,
    });
    expect(clashing.cohesionScore).toBeLessThan(40);
    expect(clashing.warnings).toHaveLength(3);
    expect(clashing.recommendedLightingPreset.targetSunAngleDeg).toBe(40);
    expect(clashing.recommendedOutlinePx).toBe(1.9);

    const calibrated = diagnose2d3dVisualCohesion(base2d, {
      sunAngleDeg: clashing.recommendedLightingPreset.targetSunAngleDeg,
      linePx: clashing.recommendedOutlinePx,
      oklchChroma: clashing.recommendedBgChroma,
    });
    expect(calibrated.cohesionScore).toBeGreaterThanOrEqual(85);
    expect(calibrated.warnings).toHaveLength(0);
  });
});

describe("AutoQaPixelScannerPanel UI · 3개 서브탭 · Calm Atelier 위생 계약", () => {
  it("props 없이 기본 마운트되고 탭 1에서 1클릭 Auto-Seal/Auto-Trim으로 결함 0건 해소 및 초기화가 동작한다", () => {
    const onApplySealedCut = vi.fn();
    render(<AutoQaPixelScannerPanel onApplySealedCut={onApplySealedCut} locale="ko" />);

    expect(screen.getByTestId("pinhole-count").textContent).toBe("3");
    expect(screen.getByTestId("bleed-count").textContent).toBe("2");

    fireEvent.click(screen.getByRole("button", { name: /1클릭 Auto-Seal/i }));

    expect(onApplySealedCut).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("pinhole-count").textContent).toBe("0");
    expect(screen.getByTestId("bleed-count").textContent).toBe("0");
    expect(screen.getByTestId("modified-pixel-count").textContent).not.toBe("0px");

    fireEvent.click(screen.getByRole("button", { name: /데모 컷 초기화/i }));
    expect(screen.getByTestId("pinhole-count").textContent).toBe("3");
    expect(screen.getByTestId("bleed-count").textContent).toBe("2");
  });

  it("탭 2(붉은펜 자동 재검수)에서 누락 핀을 최상단 경고로 표시하고 수정 반영 시뮬레이션으로 해소할 수 있다", () => {
    render(<AutoQaPixelScannerPanel locale="ko" />);

    fireEvent.click(screen.getByRole("tab", { name: /붉은펜 자동 재검수/i }));

    expect(screen.getByRole("alert").textContent).toContain("수정 누락 핀 1건 발견");

    const list = screen.getByTestId("redline-reverify-list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]?.getAttribute("data-verdict")).toBe("missed-unchanged");
    expect(rows[0]?.textContent).toContain("귀걸이 금속 반사광 누락 보완");

    // 최상단 누락 핀 수정 반영 시뮬레이션 클릭
    const firstSimulateBtn = within(rows[0] as HTMLElement).getByRole("button", {
      name: /수정 반영 시뮬레이션/i,
    });
    fireEvent.click(firstSimulateBtn);

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("누락된 붉은펜 핀이 없습니다");
  });

  it("탭 3(2D↔3D 이질감 진단)에서 슬라이더 조작 시 조화 점수가 실시간 반영되고 1클릭 추천 보정이 동작한다", () => {
    render(<AutoQaPixelScannerPanel locale="en" />);

    fireEvent.click(screen.getByRole("tab", { name: /2D↔3D Visual Cohesion/i }));

    const initialScore = Number(screen.getByTestId("cohesion-score").textContent);
    expect(initialScore).toBeLessThan(50);

    // 3D 태양각을 2D 광원각(45°)에 가깝게 조절하면 점수가 상승해야 함
    const sunSlider = screen.getByLabelText(/3D Sun Angle/i);
    fireEvent.change(sunSlider, { target: { value: "45" } });
    const afterSunAlign = Number(screen.getByTestId("cohesion-score").textContent);
    expect(afterSunAlign).toBeGreaterThan(initialScore);

    // 1클릭 추천 보정 적용 시 조화 양호(>=85) 도달
    fireEvent.click(screen.getByRole("button", { name: /Apply Recommended Fix/i }));
    const calibratedScore = Number(screen.getByTestId("cohesion-score").textContent);
    expect(calibratedScore).toBeGreaterThanOrEqual(85);
  });

  it("선화가 없는 빈 캔버스와 1px 미세 노이즈 핀을 안전하게 처리한다", () => {
    const emptyLineart = new Uint8ClampedArray(16 * 16 * 4);
    const emptyFlat = new Uint8ClampedArray(16 * 16 * 4);
    const scanEmpty = scanPinholeAndColorBleed(emptyLineart, emptyFlat, 16, 16);
    expect(scanEmpty.totalDefectCount).toBe(0);
    expect(scanEmpty.pinholes).toHaveLength(0);

    // 반경 12px(≈441px) 안에서 1px 노이즈만 변한 경우 missed-unchanged로 판정
    const before = new Uint8ClampedArray(32 * 32 * 4);
    before.fill(200);
    const after = new Uint8ClampedArray(before);
    const noiseOff = (16 * 32 + 16) * 4;
    after[noiseOff] = 20;
    const report = reverifyRedlinePinsByPixelDiff(before, after, 32, 32, [
      { id: "noise-pin", xPx: 16, yPx: 16, radiusPx: 12, label: "1px 먼지 노이즈" },
    ]);
    expect(report.results[0]?.changedPixelCount).toBe(1);
    expect(report.results[0]?.verdict).toBe("missed-unchanged");
  });

  it("AutoQaPixelScannerPanel.tsx는 원시 hex/rgb/hsl 0건 · transition-all 0건 · 500줄 이하 · keep-all · tabular-nums 계약을 지킨다", () => {
    render(<AutoQaPixelScannerPanel />);
    expect(screen.getByRole("tablist")).toBeTruthy();

    const panelPath = resolve(process.cwd(), "apps/web/src/domains/creator/auto-qa-pixel-engine/AutoQaPixelScannerPanel.tsx");
    const source = readFileSync(panelPath, "utf8");
    const lineCount = source.split("\n").length;

    expect(lineCount).toBeLessThanOrEqual(500);
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\brgba?\s*\(/i);
    expect(source).not.toMatch(/\bhsla?\s*\(/i);
    expect(source).not.toContain("transition-all");
    expect(source).toContain("[word-break:keep-all]");
    expect(source).toContain("tabular-nums");
  });
});
