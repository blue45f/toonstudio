// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushPhysicsProPanel } from "./StudioBrushPhysicsProPanel";
import {
  auditBrushTextureQuality,
  renderBrushPhysicsLiveSwatch,
} from "./brush-texture-quality-oracle";
import {
  DIRTY_TILE_SIZE,
  DirtyTileCompositor256,
  applyCrossMediaInteraction,
  applyImpastoReliefLighting,
  depositImpastoBristleRidge,
  simulateCapillarySoakAndWetEdge,
} from "./wet-soak-impasto-wax-resist";
import {
  PAPER_PRESETS,
  PAPER_PRESET_LIST,
  PAPER_TILE_SIZE,
  blueNoiseOffset2D,
  clearWorldPaperHeightfieldCache,
  evaluateDualBrushTripleMultiply,
  evaluatePressureCurve,
  evaluateTiltGrazingShading,
  getWorldPaperHeightfieldTile,
  sampleWorldPaperHeightfield,
  stampDualBrushDabRgba,
} from "./world-paper-heightfield";

afterEach(cleanup);

function makeSolidCanvas(width: number, height: number, rgb: readonly [number, number, number]): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = rgb[0];
    buf[i + 1] = rgb[1];
    buf[i + 2] = rgb[2];
    buf[i + 3] = 255;
  }
  return buf;
}

describe("월드 좌표 2층 심리스 종이 높이장 · 블루노이즈 · 기울기 음영 · 듀얼 3중 합성", () => {
  it("5종 종이 프리셋의 256×256 타일 LUT가 캐싱되며 경계가 심리스하게 이어지고 대비 서열이 유지된다", () => {
    clearWorldPaperHeightfieldCache();

    const tileA = getWorldPaperHeightfieldTile("cold-press", 1337);
    const tileB = getWorldPaperHeightfieldTile("cold-press", 1337);
    expect(tileA).toBe(tileB);
    expect(tileA.size).toBe(PAPER_TILE_SIZE);
    expect(tileA.height.length).toBe(PAPER_TILE_SIZE * PAPER_TILE_SIZE);

    for (const preset of PAPER_PRESET_LIST) {
      const tile = getWorldPaperHeightfieldTile(preset.id, 1337);
      expect(tile.stdDev).toBeGreaterThan(0.06);

      // 심리스 주기 래핑 검증: x=0 ↔ x=256, y=0 ↔ y=256 오차 0
      for (const coord of [0, 37, 128, 219]) {
        const s0 = sampleWorldPaperHeightfield(0, coord, preset.id, { seed: 1337 });
        const sWrapX = sampleWorldPaperHeightfield(PAPER_TILE_SIZE, coord, preset.id, { seed: 1337 });
        expect(Math.abs(s0.height - sWrapX.height)).toBeLessThan(1e-6);

        const t0 = sampleWorldPaperHeightfield(coord, 0, preset.id, { seed: 1337 });
        const tWrapY = sampleWorldPaperHeightfield(coord, PAPER_TILE_SIZE, preset.id, { seed: 1337 });
        expect(Math.abs(t0.height - tWrapY.height)).toBeLessThan(1e-6);
        expect(s0.valleyMask + s0.peakMask).toBeCloseTo(1, 5);
      }
    }

    const kentStd = getWorldPaperHeightfieldTile("kent", 1337).stdDev;
    const roughStd = getWorldPaperHeightfieldTile("rough-cotton", 1337).stdDev;
    expect(roughStd).toBeGreaterThan(kentStd * 1.4);
  });

  it("R2 블루노이즈 지터는 연속 인덱스에서 중복 격자 없이 균일 분산된다", () => {
    const offsets = Array.from({ length: 64 }, (_, i) => blueNoiseOffset2D(i, 2026, 2.0));
    const uniquePairs = new Set(offsets.map((o) => `${o.dx.toFixed(4)},${o.dy.toFixed(4)}`));
    expect(uniquePairs.size).toBe(64);

    let minX = 99;
    let maxX = -99;
    let minY = 99;
    let maxY = -99;
    for (const o of offsets) {
      expect(Math.abs(o.dx)).toBeLessThanOrEqual(1.0 + 1e-6);
      expect(Math.abs(o.dy)).toBeLessThanOrEqual(1.0 + 1e-6);
      if (o.dx < minX) minX = o.dx;
      if (o.dx > maxX) maxX = o.dx;
      if (o.dy < minY) minY = o.dy;
      if (o.dy > maxY) maxY = o.dy;
    }
    expect(maxX - minX).toBeGreaterThan(1.7);
    expect(maxY - minY).toBeGreaterThan(1.7);
  });

  it("기울기 음영(tiltDeg > 28°)은 접촉 타원을 넓히고 종이 봉우리만 선택적으로 긁는다", () => {
    const uprightPeak = evaluateTiltGrazingShading({ tiltDeg: 12, pressure: 0.55, paperHeight: 0.88 });
    const uprightValley = evaluateTiltGrazingShading({ tiltDeg: 12, pressure: 0.55, paperHeight: 0.16 });
    expect(uprightPeak.isGrazing).toBe(false);
    expect(uprightPeak.ellipseAspect).toBeCloseTo(1, 3);

    const grazingPeak = evaluateTiltGrazingShading({ tiltDeg: 64, pressure: 0.55, paperHeight: 0.88 });
    const grazingValley = evaluateTiltGrazingShading({ tiltDeg: 64, pressure: 0.55, paperHeight: 0.16 });
    expect(grazingPeak.isGrazing).toBe(true);
    expect(grazingPeak.ellipseAspect).toBeGreaterThan(2.3);
    expect(grazingPeak.peakCatch).toBeGreaterThan(0.85);
    expect(grazingValley.peakCatch).toBeLessThan(0.25);
    expect(grazingPeak.peakCatch - grazingValley.peakCatch).toBeGreaterThan(
      uprightPeak.peakCatch - uprightValley.peakCatch,
    );
  });

  it("듀얼 브러시 3중 합성은 고정 결(fixed-world)과 붓 굴림(rolling-tip)을 명확히 분리하고 필압 커브 3종을 반영한다", () => {
    // 3종 필압 커브 단조 분리 검증
    const pLight = evaluatePressureCurve(0.45, "light");
    const pStd = evaluatePressureCurve(0.45, "standard");
    const pHeavy = evaluatePressureCurve(0.45, "heavy");
    expect(pLight).toBeGreaterThan(pStd);
    expect(pStd).toBeGreaterThan(pHeavy);

    // fixed-world: dabIndex·스트로크 진행 거리가 달라져도 동일 월드 좌표의 secondaryTextureMask 불변
    const fixedA = evaluateDualBrushTripleMultiply({
      worldX: 42.5,
      worldY: 28.5,
      dabX: 40,
      dabY: 28,
      dabRadiusPx: 12,
      dabIndex: 0,
      strokeDistancePx: 0,
      strokeAngleRad: 0,
      pressure: 0.65,
      paperPreset: "sketchbook-tooth",
      dualMode: "fixed-world",
    });
    const fixedB = evaluateDualBrushTripleMultiply({
      worldX: 42.5,
      worldY: 28.5,
      dabX: 40,
      dabY: 28,
      dabRadiusPx: 12,
      dabIndex: 9,
      strokeDistancePx: 54,
      strokeAngleRad: 0.9,
      pressure: 0.65,
      paperPreset: "sketchbook-tooth",
      dualMode: "fixed-world",
    });
    expect(fixedA.secondaryTextureMask).toBeCloseTo(fixedB.secondaryTextureMask, 6);

    // rolling-tip: 스트로크 진행에 따라 보조 질감 마스크가 동적으로 회전·굴림 변화
    const rollA = evaluateDualBrushTripleMultiply({
      worldX: 42.5,
      worldY: 28.5,
      dabX: 40,
      dabY: 28,
      dabRadiusPx: 12,
      dabIndex: 0,
      strokeDistancePx: 0,
      strokeAngleRad: 0,
      pressure: 0.65,
      paperPreset: "sketchbook-tooth",
      dualMode: "rolling-tip",
    });
    const rollB = evaluateDualBrushTripleMultiply({
      worldX: 42.5,
      worldY: 28.5,
      dabX: 40,
      dabY: 28,
      dabRadiusPx: 12,
      dabIndex: 9,
      strokeDistancePx: 54,
      strokeAngleRad: 0.9,
      pressure: 0.65,
      paperPreset: "sketchbook-tooth",
      dualMode: "rolling-tip",
    });
    expect(Math.abs(rollA.secondaryTextureMask - rollB.secondaryTextureMask)).toBeGreaterThan(0.01);

    // 실제 RGBA 스트로크 버퍼 비교에서 두 모드 픽셀 결과가 분명히 달라진다
    const w = 64;
    const h = 40;
    const bufFixed = makeSolidCanvas(w, h, PAPER_PRESETS["sketchbook-tooth"].basePaperRgb);
    const bufRoll = makeSolidCanvas(w, h, PAPER_PRESETS["sketchbook-tooth"].basePaperRgb);
    for (let i = 0; i < 8; i += 1) {
      const common = {
        dabX: 14 + i * 5,
        dabY: 20,
        dabRadiusPx: 9,
        dabIndex: i,
        strokeDistancePx: i * 5,
        strokeAngleRad: 0.2,
        pressure: 0.7,
        paperPreset: "sketchbook-tooth" as const,
        pigmentRgb: [32, 34, 40] as const,
        jitterAmplitudePx: 0,
        seed: 901,
      };
      stampDualBrushDabRgba(bufFixed, w, h, { ...common, dualMode: "fixed-world" });
      stampDualBrushDabRgba(bufRoll, w, h, { ...common, dualMode: "rolling-tip" });
    }
    let diffSum = 0;
    for (let i = 0; i < bufFixed.length; i += 4) {
      diffSum += Math.abs((bufFixed[i] ?? 0) - (bufRoll[i] ?? 0));
    }
    expect(diffSum / (w * h)).toBeGreaterThan(0.5);
  });
});

describe("수채 스며들기·웨트 엣지 · 2.5D 임파스토 조명 · 이종 매체 상호작용 · 256×256 더티 타일", () => {
  it("수채 모세관 스며들기와 웨트 엣지 시뮬레이션은 원본을 보존하며 경계 안료를 농축한다", () => {
    const w = 56;
    const h = 56;
    const paperRgb = PAPER_PRESETS["cold-press"].basePaperRgb;
    const wash = makeSolidCanvas(w, h, paperRgb);
    const wetness = new Float32Array(w * h);

    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (Math.hypot(x - 28, y - 28) <= 15) {
          const idx = y * w + x;
          wetness[idx] = 0.92;
          const off = idx * 4;
          wash[off] = 104;
          wash[off + 1] = 156;
          wash[off + 2] = 206;
        }
      }
    }
    const snapshot = new Uint8ClampedArray(wash);

    const withWetEdge = simulateCapillarySoakAndWetEdge(wash, w, h, {
      paperPreset: "cold-press",
      wetnessMap: wetness,
      soakStrength: 0.7,
      wetEdgeStrength: 0.85,
      granulationStrength: 0.5,
      iterations: 3,
    });
    const noWetEdge = simulateCapillarySoakAndWetEdge(wash, w, h, {
      paperPreset: "cold-press",
      wetnessMap: wetness,
      soakStrength: 0.7,
      wetEdgeStrength: 0,
      granulationStrength: 0.2,
      iterations: 3,
    });

    expect(wash).toEqual(snapshot);
    expect(withWetEdge.diffusedPixelCount).toBeGreaterThan(20);
    expect(withWetEdge.wetEdgePixelCount).toBeGreaterThan(40);
    expect(withWetEdge.wetEdgeRingRatio).toBeGreaterThan(1.05);
    expect(withWetEdge.wetEdgeRingRatio).toBeGreaterThan(noWetEdge.wetEdgeRingRatio);
  });

  it("2.5D 임파스토 Sobel 광원 셰이딩은 붓모 고랑의 하이라이트와 그림자를 방향성 있게 합성한다", () => {
    const w = 52;
    const h = 44;
    const canvas = makeSolidCanvas(w, h, PAPER_PRESETS["linen-canvas"].basePaperRgb);
    const heightField = new Float32Array(w * h);

    depositImpastoBristleRidge(canvas, heightField, w, h, {
      x0: 10,
      y0: 22,
      x1: 42,
      y1: 22,
      radiusPx: 9,
      pigmentRgb: [188, 72, 54],
      thickness: 1.05,
      bristleCount: 7,
    });

    const litTopLeft = applyImpastoReliefLighting(canvas, heightField, w, h, {
      lightAzimuthDeg: 270,
      lightElevationDeg: 35,
      reliefDepth: 1.1,
      specularStrength: 0.8,
      shadowStrength: 0.82,
    });
    const litBottomRight = applyImpastoReliefLighting(canvas, heightField, w, h, {
      lightAzimuthDeg: 90,
      lightElevationDeg: 35,
      reliefDepth: 1.1,
      specularStrength: 0.8,
      shadowStrength: 0.82,
    });

    expect(litTopLeft.highlightPixelCount).toBeGreaterThan(30);
    expect(litTopLeft.shadowPixelCount).toBeGreaterThan(30);
    expect(litTopLeft.maxLuminanceBoost).toBeGreaterThan(10);
    expect(litTopLeft.maxShadowDrop).toBeGreaterThan(10);

    // 높이 0인 좌상단 빈 캔버스 코너 픽셀은 변경 없음
    expect(litTopLeft.rgba[0]).toBe(canvas[0]);
    expect(litTopLeft.rgba[1]).toBe(canvas[1]);
    expect(litTopLeft.rgba[2]).toBe(canvas[2]);

    // 180도 반대 광원 회전 시 위쪽 둑(y=14)의 밝기가 반전된다
    const upperIdx = (14 * w + 26) * 4;
    expect(litTopLeft.rgba[upperIdx]).not.toBe(litBottomRight.rgba[upperIdx]);
  });

  it("크레파스 위 수채 왁스 레지스트 발수, 떡지우개 봉우리 우선 리프트, 찰필 골짜기 문지르기가 실제 픽셀로 동작한다", () => {
    const w = 64;
    const h = 48;
    const paperRgb = PAPER_PRESETS["rough-cotton"].basePaperRgb;

    // 1) 왁스 레지스트
    const waxCanvas = makeSolidCanvas(w, h, paperRgb);
    const waxMask = new Float32Array(w * h);
    for (let i = 0; i < 6; i += 1) {
      stampDualBrushDabRgba(
        waxCanvas,
        w,
        h,
        {
          dabX: 20 + i * 4.5,
          dabY: 24,
          dabRadiusPx: 9,
          dabIndex: i,
          strokeDistancePx: i * 4.5,
          pressure: 0.92,
          paperPreset: "rough-cotton",
          paperToothStrength: 0.4,
          dualMode: "fixed-world",
          flow: 0.95,
          pigmentRgb: [226, 184, 60],
        },
        { waxMask, waxDepositRate: 1.0 },
      );
    }
    const waxRes = applyCrossMediaInteraction({
      mode: "wax-resist",
      baseRgba: waxCanvas,
      width: w,
      height: h,
      paperPreset: "rough-cotton",
      waxMask,
      watercolorColor: [30, 96, 174],
      watercolorCoverage: 0.78,
      resistStrength: 0.95,
    });
    expect(waxRes.waxResistRejectionRatio).toBeGreaterThan(0.65);
    expect(waxRes.waxProtectedPixels).toBeGreaterThan(80);
    expect(waxRes.openValleyPaintedPixels).toBeGreaterThan(200);

    // 2) 연필 흑연 바탕 생성 후 떡지우개 & 찰필 비교 (기울기 사선 터치로 봉우리에 흑연, 골짜기에 여백 형성)
    const graphiteCanvas = makeSolidCanvas(w, h, paperRgb);
    for (let i = 0; i < 9; i += 1) {
      stampDualBrushDabRgba(graphiteCanvas, w, h, {
        dabX: 12 + i * 5.0,
        dabY: 24,
        dabRadiusPx: 14,
        dabIndex: i,
        strokeDistancePx: i * 5.0,
        pressure: 0.58,
        tiltDeg: 60,
        paperPreset: "rough-cotton",
        paperToothStrength: 0.96,
        dualMode: "fixed-world",
        secondaryContrast: 0.3,
        flow: 0.58,
        pigmentRgb: [36, 38, 44],
      });
    }
    const centerMask = new Float32Array(w * h);
    for (let y = 14; y <= 34; y += 1) {
      for (let x = 14; x <= 50; x += 1) {
        centerMask[y * w + x] = 0.9;
      }
    }

    const kneaded = applyCrossMediaInteraction({
      mode: "kneaded-eraser",
      baseRgba: graphiteCanvas,
      width: w,
      height: h,
      paperPreset: "rough-cotton",
      toolMask: centerMask,
      strength: 0.82,
    });
    expect(kneaded.peakLiftDelta).toBeGreaterThan(kneaded.valleyLiftDelta);
    expect(kneaded.peakLiftDelta).toBeGreaterThan(15);

    const stump = applyCrossMediaInteraction({
      mode: "blending-stump",
      baseRgba: graphiteCanvas,
      width: w,
      height: h,
      paperPreset: "rough-cotton",
      toolMask: centerMask,
      strength: 0.82,
      smudgeRadiusPx: 3,
    });
    expect(stump.valleyFillDelta).toBeGreaterThan(5);
    expect(stump.toothVarianceAfter).toBeLessThan(stump.toothVarianceBefore);
  });

  it("DirtyTileCompositor256은 변경된 256×256 타일만 증분 합성하고 p95 <= 4.0ms를 유지한다", () => {
    const compositor = new DirtyTileCompositor256(1024, 1024);
    expect(DIRTY_TILE_SIZE).toBe(256);
    expect(compositor.totalTiles).toBe(16);

    compositor.paintBrushDab("sketch", {
      dabX: 80,
      dabY: 90,
      dabRadiusPx: 16,
      dabIndex: 0,
      strokeDistancePx: 0,
      pressure: 0.8,
      paperPreset: "cold-press",
      dualMode: "fixed-world",
      pigmentRgb: [36, 38, 44],
    });
    const firstFlush = compositor.flushDirtyTiles();
    expect(firstFlush.flushedTileCount).toBe(1);
    expect(firstFlush.skippedTileCount).toBe(15);

    // 더티 타일이 없을 때 재호출하면 0타일 스킵
    const idleFlush = compositor.flushDirtyTiles();
    expect(idleFlush.flushedTileCount).toBe(0);
    expect(idleFlush.skippedTileCount).toBe(16);

    // (0, 0) 타일에는 잉크가 합성되고, 건드리지 않은 (3, 3) 타일은 순수 종이 배경을 유지
    const tile00 = compositor.getTileRgba(0, 0);
    const tile33 = compositor.getTileRgba(3, 3);
    const centerOff = (90 * DIRTY_TILE_SIZE + 80) * 4;
    expect(tile00[centerOff] ?? 255).toBeLessThan(tile33[centerOff] ?? 0);
    expect(compositor.getMetrics().p95TileMs).toBeLessThanOrEqual(4.0);
  });
});

describe("질감 정량 자동 오라클 & StudioBrushPhysicsProPanel UI · 토큰 위생 검증", () => {
  it("auditBrushTextureQuality 오라클은 6대 전 항목(종이 대비·격자 <0.35·필압 분리·웨트 엣지 >1.05·왁스 발수 >0.65·p95 <=4ms)을 합격한다", () => {
    const report = auditBrushTextureQuality({
      paperPreset: "cold-press",
      dualMode: "rolling-tip",
      pressureCurve: "standard",
      soakStrength: 0.68,
      wetEdgeStrength: 0.82,
      impastoLightAzimuthDeg: 315,
      tiltDeg: 54,
    });

    expect(report.passed).toBe(true);
    expect(report.score).toBe(100);
    expect(report.checks).toHaveLength(6);
    expect(report.checks.every((check) => check.passed)).toBe(true);

    expect(report.paperToothContrastIndex).toBeGreaterThanOrEqual(0.08);
    expect(report.paperPresetContrasts["rough-cotton"]).toBeGreaterThan(report.paperPresetContrasts.kent);
    expect(report.gridPeriodicityScore).toBeLessThan(0.35);
    expect(report.baselineLatticePeriodicityScore).toBeGreaterThan(0.5);
    expect(report.gridPeriodicityScore).toBeLessThan(report.baselineLatticePeriodicityScore);
    expect(report.pressureToneBands.low).toBeLessThan(report.pressureToneBands.mid);
    expect(report.pressureToneBands.mid).toBeLessThan(report.pressureToneBands.high);
    expect(report.pressureToneSeparation).toBeGreaterThanOrEqual(0.08);
    expect(report.wetEdgeRingRatio).toBeGreaterThan(1.05);
    expect(report.waxResistRejectionRatio).toBeGreaterThan(0.65);
    expect(report.dirtyTileBrushCount).toBe(12);
    expect(report.p95TileMs).toBeLessThanOrEqual(4.0);
    expect(report.impastoLumaRange).toBeGreaterThan(15);

    // 라이브 스와치 픽셀 버퍼도 정상 렌더
    const swatch = renderBrushPhysicsLiveSwatch({
      paperPreset: "rough-cotton",
      dualMode: "fixed-world",
      pressureCurve: "heavy",
      soakStrength: 0.72,
      wetEdgeStrength: 0.8,
      impastoLightAzimuthDeg: 225,
      tiltDeg: 60,
      interactionMode: "wax-resist",
    });
    expect(swatch.rgba.length).toBe(240 * 132 * 4);
    expect(swatch.wetEdgeRingRatio).toBeGreaterThan(1.05);
  });

  it("StudioBrushPhysicsProPanel은 props 없이 기본 렌더되며 KO/EN 전환 및 모든 컨트롤·오라클 재측정이 동작한다", () => {
    const onConfigChange = vi.fn();
    const onAuditComplete = vi.fn();

    render(
      <StudioBrushPhysicsProPanel
        locale="ko"
        onConfigChange={onConfigChange}
        onAuditComplete={onAuditComplete}
      />,
    );

    expect(screen.getByTestId("brush-physics-swatch-canvas")).toBeTruthy();
    expect(screen.getByTestId("oracle-overall-badge").textContent).toContain("전 항목 합격");

    fireEvent.click(screen.getByRole("button", { name: /황목 코튼지/i }));
    expect(screen.getByTestId("active-paper-badge").textContent).toContain("황목 코튼지");
    expect(onConfigChange).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /종이 고정/i }));
    fireEvent.click(screen.getByRole("button", { name: /가볍게/i }));
    fireEvent.click(screen.getByRole("button", { name: /떡지우개/i }));
    fireEvent.change(screen.getByLabelText(/수채 모세관 스며들기/i), { target: { value: "0.8" } });
    expect(screen.getByTestId("soak-strength-value").textContent).toBe("80%");

    fireEvent.click(screen.getByRole("button", { name: /품질 오라클 재측정/i }));
    expect(onAuditComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status").textContent).toContain("오라클 재측정 완료");

    // EN 로케일 및 무인자(optional props) 렌더 확인
    cleanup();
    render(<StudioBrushPhysicsProPanel locale="en" />);
    expect(screen.getByText(/Physical Brush Texture Engine Pro/i)).toBeTruthy();
    expect(screen.getByTestId("oracle-overall-badge").textContent).toContain("ALL PASS");

    cleanup();
    render(<StudioBrushPhysicsProPanel />);
    expect(screen.getByTestId("oracle-overall-badge")).toBeTruthy();
  });

  it("소유 폴더 5파일은 배럴 index.ts 금지 · 줄수 상한 · 원시 hex/rgb/hsl 0건 · transition-all 0건 계약을 지킨다", () => {
    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/brush-physics-pro");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);
    expect(existsSync(resolve(dir, "index.tsx"))).toBe(false);

    const fileCaps: readonly { readonly name: string; readonly maxLines: number; readonly checkColorHygiene: boolean }[] = [
      { name: "world-paper-heightfield.ts", maxLines: 700, checkColorHygiene: true },
      { name: "wet-soak-impasto-wax-resist.ts", maxLines: 750, checkColorHygiene: true },
      { name: "brush-texture-quality-oracle.ts", maxLines: 650, checkColorHygiene: true },
      { name: "StudioBrushPhysicsProPanel.tsx", maxLines: 480, checkColorHygiene: true },
      { name: "brush-physics-pro.test.tsx", maxLines: 780, checkColorHygiene: false },
    ];

    for (const entry of fileCaps) {
      const source = readFileSync(resolve(dir, entry.name), "utf8");
      const lines = source.split("\n").length;
      expect(lines).toBeLessThanOrEqual(entry.maxLines);

      if (entry.checkColorHygiene) {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
      }
    }

    const panelSource = readFileSync(resolve(dir, "StudioBrushPhysicsProPanel.tsx"), "utf8");
    expect(panelSource).not.toContain("transition-all");
    expect(panelSource).toContain("[word-break:keep-all]");
    expect(panelSource).toContain("tabular-nums");
  });
});
