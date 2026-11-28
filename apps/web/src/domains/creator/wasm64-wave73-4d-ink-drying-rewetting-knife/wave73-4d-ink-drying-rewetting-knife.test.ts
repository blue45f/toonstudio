import { describe, expect, it } from "vitest";
import {
  PALETTE_KNIFE_SGRAFFITO_WGSL,
  REWETTING_BLOOM_SOLUBILITY_WGSL,
  TEMPORAL_DRYING_EVAPORATION_WGSL,
  TEMPORAL_INK_WGSL_CONTRACTS,
  TEMPORAL_MEDIA_PROFILES,
  TEMPORAL_MEDIUM_ORDER,
  advanceTemporalDryingState,
  applyCleanWaterRewetBrush,
  applyPaletteKnifeScrape,
  captureTemporalInkSnapshot,
  computeFieldPigmentMetrics,
  createTemporalInkCanvasField,
  depositTemporalInkStroke,
  packPaletteKnifeUniforms,
  packRewettingBloomUniforms,
  packTemporalDryingUniforms,
  paintUnderpaintingLayer,
  restoreTemporalInkSnapshot,
  sampleCompositedSurfaceRgba,
  scrubTemporalDryingTimeline,
  validateSingleTemporalWgslContract,
  validateTemporalInkWgslContracts,
  type SpatialTemporalStrokeEvent,
  type TemporalInkCanvasField,
} from "./index";

function assertAllBuffersFinite(field: TemporalInkCanvasField): void {
  const buffers = [
    field.wetPigment, field.fixedPigment, field.underpaintRgba, field.waterMm,
    field.cureState, field.depositedAtSec, field.lastWettedAtSec, field.heightMm,
    field.paperTooth, field.substrateAbsorption,
  ];
  for (const buf of buffers) {
    for (let i = 0; i < buf.length; i += 1) expect(Number.isFinite(buf[i])).toBe(true);
  }
}

function makeStroke(overrides: Partial<SpatialTemporalStrokeEvent> = {}): SpatialTemporalStrokeEvent {
  return {
    strokeId: overrides.strokeId ?? "stroke-1",
    timestampSec: overrides.timestampSec ?? 0,
    medium: overrides.medium ?? "transparent-watercolor",
    points: overrides.points ?? [{ x: 14, y: 24, pressure: 1 }, { x: 34, y: 24, pressure: 1 }],
    radiusPx: overrides.radiusPx ?? 8,
    pigmentRgba: overrides.pigmentRgba ?? [0.06, 0.24, 0.72, 0.85],
    waterMm: overrides.waterMm,
    heightMm: overrides.heightMm,
    initialCureState: overrides.initialCureState,
  };
}

function makeOilCanvas(width = 48, height = 32, seed = 1313, drySec = 240): TemporalInkCanvasField {
  const f = createTemporalInkCanvasField({ width, height, paperSeed: seed });
  depositTemporalInkStroke(f, makeStroke({
    strokeId: `oil-${seed}`,
    medium: "oil-impasto-alkyd",
    points: [{ x: 10, y: Math.floor(height / 2) }, { x: width - 12, y: Math.floor(height / 2) }],
    radiusPx: 8,
    pigmentRgba: [0.7, 0.35, 0.12, 1.2],
    heightMm: 1.8,
  }));
  if (drySec > 0) advanceTemporalDryingState(f, drySec);
  return f;
}

describe("Wave 73: 4D 시공간 잉크 건조·재습윤 & 팔레트 나이프 스크래핑 엔진", () => {
  it("4대 매체 물리 프로파일과 결정론적 종이 결 상태장을 초기화한다", () => {
    expect(TEMPORAL_MEDIUM_ORDER).toHaveLength(4);
    for (const id of TEMPORAL_MEDIUM_ORDER) {
      expect(TEMPORAL_MEDIA_PROFILES[id].labelKo.length).toBeGreaterThan(2);
      expect(TEMPORAL_MEDIA_PROFILES[id].summaryKo.length).toBeGreaterThan(5);
    }
    const a = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 4242 });
    const b = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 4242 });
    expect(Array.from(a.paperTooth)).toEqual(Array.from(b.paperTooth));
    expect(a.depositedAtSec[0]).toBe(-1);
    expect(a.lastWettedAtSec[0]).toBe(-1);
  });

  it("투명 수채화는 0초 -> 1800초(30분) 동안 수분이 단조 감소하고 안료가 고착되며 총 질량을 보존한다", () => {
    const field = createTemporalInkCanvasField({ width: 48, height: 48, paperSeed: 101 });
    depositTemporalInkStroke(field, makeStroke({ medium: "transparent-watercolor", waterMm: 0.55 }));
    const initialMass = computeFieldPigmentMetrics(field).totalPigmentMass;
    let prevTime = 0;
    let prevWater = computeFieldPigmentMetrics(field).totalWaterMm;
    let prevFixed = computeFieldPigmentMetrics(field).totalFixedPigmentMass;

    for (const t of [0.016, 15, 60, 300, 1800]) {
      const step = advanceTemporalDryingState(field, t - prevTime);
      prevTime = t;
      const m = computeFieldPigmentMetrics(field);
      expect(m.totalWaterMm).toBeLessThanOrEqual(prevWater + 1e-6);
      expect(m.totalFixedPigmentMass).toBeGreaterThanOrEqual(prevFixed - 1e-6);
      expect(step.massConservationErrorRatio).toBeLessThan(0.002);
      expect(Math.abs(m.totalPigmentMass - initialMass) / initialMass).toBeLessThan(0.002);
      prevWater = m.totalWaterMm;
      prevFixed = m.totalFixedPigmentMass;
    }

    const endM = computeFieldPigmentMetrics(field);
    expect(endM.totalWaterMm).toBeLessThan(0.05);
    expect(endM.totalFixedPigmentMass / endM.totalPigmentMass).toBeGreaterThan(0.98);
    expect(endM.meanCureState).toBeLessThan(0.15);
  });

  it("투명 수채화 건조 시 중심부보다 건조 경계면으로 커피링 안료 이동이 일어난다", () => {
    const field = createTemporalInkCanvasField({ width: 48, height: 48, paperSeed: 202 });
    depositTemporalInkStroke(field, makeStroke({ strokeId: "wc-pool", points: [{ x: 24, y: 24 }], radiusPx: 10, waterMm: 0.65 }));
    const cIdx = 24 * 48 + 24;
    const rIdx = 24 * 48 + 31;
    const densityAt = (idx: number): number => field.wetPigment[idx * 4 + 3] + field.fixedPigment[idx * 4 + 3];
    const beforeRatio = densityAt(rIdx) / Math.max(1e-6, densityAt(cIdx));

    advanceTemporalDryingState(field, 600);
    expect(densityAt(rIdx) / Math.max(1e-6, densityAt(cIdx))).toBeGreaterThan(beforeRatio * 1.15);
  });

  it("30분 건조된 투명 수채화 스트로크를 맑은 물로 재습윤하면 콜리플라워 블룸이 생기고 질량 오차가 2% 미만이다", () => {
    const field = createTemporalInkCanvasField({ width: 52, height: 52, paperSeed: 303 });
    depositTemporalInkStroke(field, makeStroke({
      strokeId: "wc-wide",
      points: [{ x: 12, y: 26 }, { x: 40, y: 26 }],
      radiusPx: 12,
      pigmentRgba: [0.04, 0.35, 0.8, 0.9],
      waterMm: 0.5,
    }));
    advanceTemporalDryingState(field, 1800);
    const before = computeFieldPigmentMetrics(field);
    expect(before.totalWetPigmentMass).toBeLessThan(before.totalPigmentMass * 0.02);

    const rewet = applyCleanWaterRewetBrush(field, {
      points: [{ x: 26, y: 26, pressure: 1 }],
      radiusPx: 7,
      waterAmountMm: 0.45,
      solventType: "clean-water",
      bloomStrength: 0.85,
      timestampSec: 1805,
      advectionPasses: 4,
    });
    expect(rewet.touchedCellCount).toBeGreaterThan(80);
    expect(rewet.effectiveReactivationRatio).toBeGreaterThan(0.45);
    expect(rewet.bloomMigratedMass).toBeGreaterThan(0);
    expect(rewet.peakBoundaryConcentrationRatio).toBeGreaterThan(1.05);
    expect(rewet.massConservationErrorRatio).toBeLessThan(0.02);
    expect(rewet.mediumBreakdown["transparent-watercolor"]).toBeCloseTo(rewet.dissolvedPigmentMass, 5);
  });

  it("재습윤 시 최초 도포 시각(depositedAtSec)은 유지되고 최종 습윤 시각(lastWettedAtSec)만 갱신된다", () => {
    const field = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 404 });
    depositTemporalInkStroke(field, makeStroke({ timestampSec: 12, points: [{ x: 16, y: 16 }], radiusPx: 6 }));
    advanceTemporalDryingState(field, 1800);
    const centerIdx = 16 * 32 + 16;
    expect(field.depositedAtSec[centerIdx]).toBe(12);

    applyCleanWaterRewetBrush(field, { points: [{ x: 16, y: 16 }], radiusPx: 5, timestampSec: 1850 });
    expect(field.depositedAtSec[centerIdx]).toBe(12);
    expect(field.lastWettedAtSec[centerIdx]).toBe(1850);
  });

  it("수묵화는 영구 착색 코어를 강하게 보존하고 불투명 과슈는 재습윤 시 매우 높은 리프팅률을 보인다", () => {
    const sumi = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 505 });
    const gouache = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 505 });
    depositTemporalInkStroke(sumi, makeStroke({ medium: "sumi-ink-wash", points: [{ x: 20, y: 20 }], radiusPx: 9, pigmentRgba: [0.03, 0.03, 0.04, 0.9] }));
    depositTemporalInkStroke(gouache, makeStroke({ medium: "opaque-gouache", points: [{ x: 20, y: 20 }], radiusPx: 9, pigmentRgba: [0.85, 0.3, 0.18, 0.9] }));
    advanceTemporalDryingState(sumi, 1800);
    advanceTemporalDryingState(gouache, 1800);

    const sumiRewet = applyCleanWaterRewetBrush(sumi, { points: [{ x: 20, y: 20 }], radiusPx: 6 });
    const gouacheRewet = applyCleanWaterRewetBrush(gouache, { points: [{ x: 20, y: 20 }], radiusPx: 6 });
    expect(sumiRewet.effectiveReactivationRatio).toBeLessThan(0.25);
    expect(sumiRewet.effectiveReactivationRatio).toBeGreaterThan(0.04);
    expect(gouacheRewet.effectiveReactivationRatio).toBeGreaterThan(0.6);
    expect(gouacheRewet.effectiveReactivationRatio).toBeGreaterThan(sumiRewet.effectiveReactivationRatio * 3);
    expect(sumiRewet.massConservationErrorRatio).toBeLessThan(0.02);
    expect(gouacheRewet.massConservationErrorRatio).toBeLessThan(0.02);
  });

  it("아라비아검수(gum-arabic-water)는 일반 맑은 물보다 수채화 재용해 리프팅을 소폭 증폭한다", () => {
    const wField = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 555 });
    const gField = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 555 });
    const s = makeStroke({ points: [{ x: 20, y: 20 }], radiusPx: 9 });
    depositTemporalInkStroke(wField, s);
    depositTemporalInkStroke(gField, s);
    advanceTemporalDryingState(wField, 1800);
    advanceTemporalDryingState(gField, 1800);

    const rWater = applyCleanWaterRewetBrush(wField, { points: [{ x: 20, y: 20 }], radiusPx: 6, solventType: "clean-water" });
    const rGum = applyCleanWaterRewetBrush(gField, { points: [{ x: 20, y: 20 }], radiusPx: 6, solventType: "gum-arabic-water" });
    expect(rGum.effectiveReactivationRatio).toBeGreaterThan(rWater.effectiveReactivationRatio);
    expect(rGum.massConservationErrorRatio).toBeLessThan(0.02);
  });

  it("알키드 유화 임파스토는 반경화(<0.75)에서 완전 경화(>=0.92)로 진행하며 두꺼운 능선을 보존한다", () => {
    const field = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 606 });
    depositTemporalInkStroke(field, makeStroke({ medium: "oil-impasto-alkyd", points: [{ x: 20, y: 20 }], radiusPx: 8, heightMm: 2.0 }));
    const initH = computeFieldPigmentMetrics(field).meanHeightMm;

    advanceTemporalDryingState(field, 420);
    const semi = computeFieldPigmentMetrics(field);
    expect(semi.meanCureState).toBeGreaterThan(0.3);
    expect(semi.meanCureState).toBeLessThan(0.75);

    advanceTemporalDryingState(field, 1500);
    const cured = computeFieldPigmentMetrics(field);
    expect(cured.meanCureState).toBeGreaterThanOrEqual(0.92);
    expect(cured.meanHeightMm / initH).toBeGreaterThan(0.95);
  });

  it("매체 선택성: 맑은 물은 완전 경화(cure >= 0.85) 유화를 전혀 녹이지 못한다", () => {
    const field = makeOilCanvas(40, 40, 707, 1800);
    expect(computeFieldPigmentMetrics(field).meanCureState).toBeGreaterThanOrEqual(0.85);
    const res = applyCleanWaterRewetBrush(field, { points: [{ x: 20, y: 20 }], radiusPx: 7, solventType: "clean-water" });
    expect(res.dissolvedPigmentMass).toBe(0);
    expect(res.bloomMigratedMass).toBe(0);
    expect(res.massConservationErrorRatio).toBeLessThan(0.001);
  });

  it("매체 선택성: 무취 미네랄 스피릿 용매는 반경화(cure < 0.75) 유화를 연화·재활성화하며 질량을 보존한다", () => {
    const field = makeOilCanvas(40, 40, 808, 420);
    const before = computeFieldPigmentMetrics(field);
    expect(before.meanCureState).toBeLessThan(0.75);

    const res = applyCleanWaterRewetBrush(field, { points: [{ x: 20, y: 20 }], radiusPx: 7, solventType: "odorless-mineral-spirits" });
    const after = computeFieldPigmentMetrics(field);
    expect(res.dissolvedPigmentMass).toBeGreaterThan(0);
    expect(res.softenedCureDeltaAvg).toBeGreaterThan(0.05);
    expect(after.meanCureState).toBeLessThan(before.meanCureState);
    expect(res.massConservationErrorRatio).toBeLessThan(0.02);
  });

  it("매체 선택성: 미네랄 스피릿은 완전 경화 유화(>=0.85)와 건조 수채화를 용해하지 않는다", () => {
    const curedOil = makeOilCanvas(36, 36, 811, 1800);
    expect(applyCleanWaterRewetBrush(curedOil, { points: [{ x: 18, y: 18 }], radiusPx: 6, solventType: "odorless-mineral-spirits" }).dissolvedPigmentMass).toBe(0);

    const wc = createTemporalInkCanvasField({ width: 36, height: 36, paperSeed: 812 });
    depositTemporalInkStroke(wc, makeStroke({ points: [{ x: 18, y: 18 }], radiusPx: 7 }));
    advanceTemporalDryingState(wc, 1800);
    expect(applyCleanWaterRewetBrush(wc, { points: [{ x: 18, y: 18 }], radiusPx: 6, solventType: "odorless-mineral-spirits" }).dissolvedPigmentMass).toBe(0);
  });

  it("혼합 매체 캔버스에서 맑은 물 브러시를 가로질러 문지르면 수채화 영역만 용해되고 경화 유화는 유지된다", () => {
    const field = createTemporalInkCanvasField({ width: 56, height: 32, paperSeed: 909 });
    depositTemporalInkStroke(field, makeStroke({ strokeId: "l-wc", medium: "transparent-watercolor", points: [{ x: 16, y: 16 }], radiusPx: 7 }));
    depositTemporalInkStroke(field, makeStroke({ strokeId: "r-oil", medium: "oil-impasto-alkyd", points: [{ x: 40, y: 16 }], radiusPx: 7 }));
    advanceTemporalDryingState(field, 1800);

    const sweep = applyCleanWaterRewetBrush(field, { points: [{ x: 12, y: 16 }, { x: 44, y: 16 }], radiusPx: 5 });
    expect(sweep.mediumBreakdown["transparent-watercolor"]).toBeGreaterThan(0);
    expect(sweep.mediumBreakdown["oil-impasto-alkyd"]).toBe(0);
    expect(sweep.massConservationErrorRatio).toBeLessThan(0.02);
  });

  it("팔레트 나이프는 반경화 임파스토 능선을 낮추고 앞쪽 비드를 퇴적하며 밑칠과 종이 결을 드러낸다", () => {
    const field = createTemporalInkCanvasField({ width: 60, height: 40, paperSeed: 1111 });
    paintUnderpaintingLayer(field, [0.96, 0.84, 0.15]);
    depositTemporalInkStroke(field, makeStroke({
      strokeId: "impasto-base",
      medium: "oil-impasto-alkyd",
      points: [{ x: 12, y: 20 }, { x: 44, y: 20 }],
      radiusPx: 10,
      pigmentRgba: [0.08, 0.12, 0.45, 1.4],
      heightMm: 2.2,
    }));
    advanceTemporalDryingState(field, 360);

    const beforeCenter = sampleCompositedSurfaceRgba(field, 26, 20);
    const aheadIdx = 20 * 60 + 47;
    const beforeAhead = field.wetPigment[aheadIdx * 4 + 3] + field.fixedPigment[aheadIdx * 4 + 3];

    const scrape = applyPaletteKnifeScrape(field, {
      points: [{ x: 16, y: 20, pressure: 0.9 }, { x: 45, y: 20, pressure: 0.9 }],
      bladeWidthPx: 8,
      bladeAngleRad: Math.PI / 2.4,
      pressure: 0.9,
      scrapeDepthMm: 1.8,
      sgraffitoSharpness: 0.8,
    });
    const afterCenter = sampleCompositedSurfaceRgba(field, 26, 20);
    const afterAhead = field.wetPigment[aheadIdx * 4 + 3] + field.fixedPigment[aheadIdx * 4 + 3];

    expect(scrape.scrapedCellCount).toBeGreaterThan(100);
    expect(scrape.averageHeightReductionMm).toBeGreaterThan(0.45);
    expect(scrape.peakBeadMass).toBeGreaterThan(0.5);
    expect(scrape.depositedBeadMass).toBeCloseTo(scrape.scrapedPigmentMass, 3);
    expect(afterAhead).toBeGreaterThan(beforeAhead + 0.1);
    expect(scrape.underpaintExposureRatio).toBeGreaterThan(0.4);
    expect(afterCenter.underpaintVisibility).toBeGreaterThan(beforeCenter.underpaintVisibility + 0.15);
    expect(afterCenter.rgbaLinear[0]).toBeGreaterThan(beforeCenter.rgbaLinear[0] + 0.15);
    expect(scrape.massConservationErrorRatio).toBeLessThan(0.01);
  });

  it("팔레트 나이프는 완전 경화 유화(cure >= 0.92)에서 강하게 저항해 scrapedMassRatio < 0.05를 유지한다", () => {
    const field = makeOilCanvas(52, 36, 1212, 2200);
    expect(computeFieldPigmentMetrics(field).meanCureState).toBeGreaterThanOrEqual(0.92);
    const scrape = applyPaletteKnifeScrape(field, {
      points: [{ x: 14, y: 18, pressure: 0.95 }, { x: 36, y: 18, pressure: 0.95 }],
      bladeWidthPx: 7,
      bladeAngleRad: Math.PI / 2,
      pressure: 0.95,
    });
    expect(scrape.scrapedMassRatio).toBeLessThan(0.05);
    expect(scrape.resistanceFactor).toBeGreaterThan(0.95);
    expect(scrape.massConservationErrorRatio).toBeLessThan(0.005);
  });

  it("팔레트 나이프는 세운 각도와 강한 필압이 눕힌 약한 필압보다 더 많은 물감을 긁어낸다", () => {
    const steep = applyPaletteKnifeScrape(makeOilCanvas(), {
      points: [{ x: 12, y: 16 }, { x: 32, y: 16 }],
      bladeWidthPx: 6,
      bladeAngleRad: Math.PI / 2,
      pressure: 0.9,
    });
    const shallow = applyPaletteKnifeScrape(makeOilCanvas(), {
      points: [{ x: 12, y: 16 }, { x: 32, y: 16 }],
      bladeWidthPx: 6,
      bladeAngleRad: Math.PI / 12,
      pressure: 0.35,
    });
    expect(steep.scrapedPigmentMass).toBeGreaterThan(shallow.scrapedPigmentMass * 2);
    expect(steep.averageHeightReductionMm).toBeGreaterThan(shallow.averageHeightReductionMm * 2);
  });

  it("스그라피토 날카로움(sgraffitoSharpness)이 높을수록 종이 골짜기 안료까지 더 깊게 파낸다", () => {
    const sharp = applyPaletteKnifeScrape(makeOilCanvas(44, 32, 1414, 200), {
      points: [{ x: 12, y: 16 }, { x: 28, y: 16 }],
      bladeWidthPx: 5,
      pressure: 0.8,
      sgraffitoSharpness: 1,
    });
    const dull = applyPaletteKnifeScrape(makeOilCanvas(44, 32, 1414, 200), {
      points: [{ x: 12, y: 16 }, { x: 28, y: 16 }],
      bladeWidthPx: 5,
      pressure: 0.8,
      sgraffitoSharpness: 0.05,
    });
    expect(sharp.scrapedPigmentMass).toBeGreaterThan(dull.scrapedPigmentMass);
  });

  it("타임-트래블 스크러빙 결정론: t=600s -> t=15s -> t=600s 왕복 시 비트 단위 완전 동일 상태장을 재현한다", () => {
    const origin = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 1515 });
    depositTemporalInkStroke(origin, makeStroke({ strokeId: "s-0", timestampSec: 0, points: [{ x: 12, y: 20 }, { x: 28, y: 20 }], radiusPx: 7 }));
    depositTemporalInkStroke(origin, makeStroke({ strokeId: "s-10", timestampSec: 10, medium: "oil-impasto-alkyd", points: [{ x: 20, y: 12 }, { x: 20, y: 28 }], radiusPx: 5 }));
    const logBefore = JSON.stringify(origin.strokeLog);

    const fwdA = scrubTemporalDryingTimeline(origin, 600);
    const rew15 = scrubTemporalDryingTimeline(fwdA.field, 15);
    const fwdB = scrubTemporalDryingTimeline(rew15.field, 600);

    expect(fwdA.stateHash).toBe(fwdB.stateHash);
    expect(rew15.stateHash).not.toBe(fwdA.stateHash);
    expect(Array.from(fwdA.field.wetPigment)).toEqual(Array.from(fwdB.field.wetPigment));
    expect(Array.from(fwdA.field.fixedPigment)).toEqual(Array.from(fwdB.field.fixedPigment));
    expect(Array.from(fwdA.field.waterMm)).toEqual(Array.from(fwdB.field.waterMm));
    expect(Array.from(fwdA.field.cureState)).toEqual(Array.from(fwdB.field.cureState));
    expect(Array.from(fwdA.field.heightMm)).toEqual(Array.from(fwdB.field.heightMm));
    expect(JSON.stringify(origin.strokeLog)).toBe(logBefore);
    expect(rew15.metrics.totalWaterMm).toBeGreaterThan(fwdA.metrics.totalWaterMm);
  });

  it("다중 시점 스트로크 타임라인에서 이전 시점으로 스크러빙하면 미래 스트로크가 배제된다", () => {
    const field = createTemporalInkCanvasField({ width: 40, height: 40, paperSeed: 1616 });
    depositTemporalInkStroke(field, makeStroke({ strokeId: "early", timestampSec: 0, points: [{ x: 12, y: 20 }], radiusPx: 6 }));
    depositTemporalInkStroke(field, makeStroke({ strokeId: "late", timestampSec: 300, medium: "opaque-gouache", points: [{ x: 28, y: 20 }], radiusPx: 6 }));
    const at120 = scrubTemporalDryingTimeline(field, 120);
    const at450 = scrubTemporalDryingTimeline(field, 450);
    expect(at120.appliedStrokeCount).toBe(1);
    expect(at450.appliedStrokeCount).toBe(2);
    expect(at450.metrics.totalPigmentMass).toBeGreaterThan(at120.metrics.totalPigmentMass * 1.5);
  });

  it("스냅샷 캡처·복원은 모든 버퍼와 상태 해시를 비트 단위로 보존하며 원본 변형과 격리된다", () => {
    const field = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 1717 });
    depositTemporalInkStroke(field, makeStroke({ points: [{ x: 16, y: 16 }], radiusPx: 6 }));
    advanceTemporalDryingState(field, 120);
    const snap = captureTemporalInkSnapshot(field);
    advanceTemporalDryingState(field, 900);
    expect(computeFieldPigmentMetrics(restoreTemporalInkSnapshot(snap)).stateHash).toBe(snap.stateHash);
    expect(computeFieldPigmentMetrics(field).stateHash).not.toBe(snap.stateHash);
  });

  it("3종 WebGPU WGSL 컴퓨트 셰이더 정적 계약과 @workgroup_size(8, 8, 1)을 검증한다", () => {
    const suite = validateTemporalInkWgslContracts();
    expect(suite.allValid).toBe(true);
    expect(suite.reports).toHaveLength(3);
    for (const r of suite.reports) {
      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
      expect(r.discoveredEntryPoints).toHaveLength(1);
    }
    expect(TEMPORAL_DRYING_EVAPORATION_WGSL).toContain("@workgroup_size(8, 8, 1)");
    expect(REWETTING_BLOOM_SOLUBILITY_WGSL).toContain("@workgroup_size(8, 8, 1)");
    expect(PALETTE_KNIFE_SGRAFFITO_WGSL).toContain("@workgroup_size(8, 8, 1)");
  });

  it("WGSL 계약 검증기는 손상된 셰이더(괄호 불균형·누락 진입점)를 정확히 거부한다", () => {
    const broken = validateSingleTemporalWgslContract(
      "@compute @workgroup_size(4, 4, 1) fn wrong_fn() { let a = 1.0;",
      TEMPORAL_INK_WGSL_CONTRACTS[0],
    );
    expect(broken.valid).toBe(false);
    expect(broken.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("3종 Uniform 패커는 16-byte 정렬(64B)을 보장하고 NaN/Infinity 입력을 안전하게 정규화한다", () => {
    const packedAll = [
      packTemporalDryingUniforms({ width: 64, height: 64, deltaSec: Number.NaN, evapEnvFactor: Number.POSITIVE_INFINITY, coffeeRingGain: -5 }),
      packRewettingBloomUniforms({ width: 64, height: 64, waterAmountMm: Number.NaN, bloomStrength: 42, solventMode: Number.NEGATIVE_INFINITY }),
      packPaletteKnifeUniforms({ width: 64, height: 64, startX: Number.NaN, startY: 10, endX: Number.POSITIVE_INFINITY, endY: 20, bladeWidthPx: -4, pressure: Number.NaN }),
    ];
    for (const packed of packedAll) {
      expect(packed.length).toBe(16);
      expect(packed.byteLength).toBe(64);
      expect(packed.byteLength % 16).toBe(0);
      for (let i = 0; i < packed.length; i += 1) expect(Number.isFinite(packed[i])).toBe(true);
    }
  });

  it("NaN 좌표, 0/음수 반경, 0/음수 경과 시간, 캔버스 외곽 입력에서도 NaN 오염 없이 안전하게 동작한다", () => {
    const field = createTemporalInkCanvasField({ width: 24, height: 24, paperSeed: 1919 });
    expect(depositTemporalInkStroke(field, makeStroke({ timestampSec: Number.NaN, points: [{ x: Number.NaN, y: 10 }], radiusPx: 0, pigmentRgba: [Number.NaN, 0.5, 0.5, 1] })).touchedCellCount).toBe(0);
    depositTemporalInkStroke(field, makeStroke({ medium: "oil-impasto-alkyd", points: [{ x: 12, y: 12 }], radiusPx: 5 }));
    expect(advanceTemporalDryingState(field, -10).substepsExecuted).toBe(0);
    expect(advanceTemporalDryingState(field, Number.NaN).substepsExecuted).toBe(0);
    expect(applyCleanWaterRewetBrush(field, { points: [{ x: Number.NaN, y: 12 }], radiusPx: -2 }).touchedCellCount).toBe(0);
    expect(applyPaletteKnifeScrape(field, { points: [{ x: Number.NaN, y: 12 }, { x: 999, y: -999 }], bladeWidthPx: 0, pressure: Number.NaN }).scrapedCellCount).toBe(0);
    assertAllBuffersFinite(field);
  });

  it("단일 포인트 팔레트 나이프 탭 및 소수성 미경화 유화에 대한 물 브러시 방어 동작이 일관적이다", () => {
    const field = makeOilCanvas(32, 32, 2020, 60);
    expect(applyCleanWaterRewetBrush(field, { points: [{ x: 16, y: 16 }], radiusPx: 5, solventType: "clean-water" }).dissolvedPigmentMass).toBe(0);
    const tap = applyPaletteKnifeScrape(field, { points: [{ x: 16, y: 16, pressure: 0.8 }], bladeWidthPx: 6, pressure: 0.8 });
    expect(tap.scrapedCellCount).toBeGreaterThan(0);
    expect(tap.massConservationErrorRatio).toBeLessThan(0.01);
    assertAllBuffersFinite(field);
  });

  it("온습도·기류 환경 변화에 따라 고온·저습 조건이 저온·고습 조건보다 빠르게 건조된다", () => {
    const dryF = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 2121 });
    const humidF = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 2121 });
    const s = makeStroke({ points: [{ x: 16, y: 16 }], radiusPx: 7, waterMm: 0.6 });
    depositTemporalInkStroke(dryF, s);
    depositTemporalInkStroke(humidF, s);
    advanceTemporalDryingState(dryF, 90, { ambientTempC: 34, relativeHumidity: 0.2, airflowMps: 1.5 });
    advanceTemporalDryingState(humidF, 90, { ambientTempC: 12, relativeHumidity: 0.88, airflowMps: 0 });
    expect(computeFieldPigmentMetrics(dryF).totalWaterMm).toBeLessThan(computeFieldPigmentMetrics(humidF).totalWaterMm * 0.7);
    expect(computeFieldPigmentMetrics(dryF).totalFixedPigmentMass).toBeGreaterThan(computeFieldPigmentMetrics(humidF).totalFixedPigmentMass);
  });

  it("스냅샷으로부터 직접 타임-트래블 스크러빙을 호출해도 원본 상태장 스크러빙과 비트 동일하다", () => {
    const field = createTemporalInkCanvasField({ width: 32, height: 32, paperSeed: 2222 });
    depositTemporalInkStroke(field, makeStroke({ strokeId: "snap-s1", timestampSec: 0, points: [{ x: 16, y: 16 }], radiusPx: 6 }));
    const snap = captureTemporalInkSnapshot(field);
    const fromField = scrubTemporalDryingTimeline(field, 480);
    const fromSnap = scrubTemporalDryingTimeline(snap, 480);
    expect(fromSnap.stateHash).toBe(fromField.stateHash);
    expect(fromSnap.metrics.totalPigmentMass).toBeCloseTo(fromField.metrics.totalPigmentMass, 6);
  });
});
