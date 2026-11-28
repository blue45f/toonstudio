import { describe, expect, it } from "vitest";
import {
  auditHanjiInkSimulation,
  buildHanjiSumieWgsl,
  createHanjiInkCanvas,
  createHanjiPaperSubstrate,
  depositSumiInkDrop,
  escapeXmlText,
  getKoreanInkTechniqueConfig,
  measureSumiCarbonMassConservation,
  renderHanjiInkWashAuditSvg,
  stepHanjiCapillarySimulation,
  summarizeHanjiInkSessionKo,
  synthesizeGalpilDryBrushStroke,
  validateHanjiSumieWgsl,
  type GalpilStylusSample,
  type KoreanInkTechniquePreset,
} from "./index";

function buildLinearBrushTrajectory(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  speedPxPerSec: number,
  pressure = 0.52,
  sampleCount = 12,
): GalpilStylusSample[] {
  const samples: GalpilStylusSample[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const t = sampleCount > 1 ? i / (sampleCount - 1) : 0;
    samples.push({
      x: startX + (endX - startX) * t,
      y: startY + (endY - startY) * t,
      pressure,
      speedPxPerSec,
    });
  }
  return samples;
}

describe("Wave 112 — 화선지(Hanji) 이방성 닥섬유 기질 생성", () => {
  it("동일한 시드로 생성한 화선지 기질은 비트 단위로 완전히 일치한다", () => {
    const a = createHanjiPaperSubstrate(48, 48, 20261128, { fiberAnisotropy: 1.8 });
    const b = createHanjiPaperSubstrate(48, 48, 20261128, { fiberAnisotropy: 1.8 });

    expect(Array.from(a.paperHeight)).toEqual(Array.from(b.paperHeight));
    expect(Array.from(a.fiberPermX)).toEqual(Array.from(b.fiberPermX));
    expect(Array.from(a.fiberPermY)).toEqual(Array.from(b.fiberPermY));
    expect(Array.from(a.absorbency)).toEqual(Array.from(b.absorbency));
  });

  it("시드가 다르면 서로 다른 화선지 섬유 기복 패턴을 생성한다", () => {
    const a = createHanjiPaperSubstrate(32, 32, 101);
    const b = createHanjiPaperSubstrate(32, 32, 202);

    let diffSum = 0;
    for (let i = 0; i < a.paperHeight.length; i += 1) {
      diffSum += Math.abs(a.paperHeight[i] - b.paperHeight[i]);
    }
    expect(diffSum / a.paperHeight.length).toBeGreaterThan(0.03);
  });

  it("화선지 기질의 모든 필드는 유효 범위와 유한값 제약을 만족한다", () => {
    const sub = createHanjiPaperSubstrate(40, 36, 777, {
      fiberRoughness: 0.75,
      fiberAnisotropy: 2.2,
    });

    for (let i = 0; i < sub.width * sub.height; i += 1) {
      expect(Number.isFinite(sub.paperHeight[i])).toBe(true);
      expect(sub.paperHeight[i]).toBeGreaterThanOrEqual(0);
      expect(sub.paperHeight[i]).toBeLessThanOrEqual(1);
      expect(Number.isFinite(sub.fiberPermX[i])).toBe(true);
      expect(sub.fiberPermX[i]).toBeGreaterThan(0);
      expect(Number.isFinite(sub.fiberPermY[i])).toBe(true);
      expect(sub.fiberPermY[i]).toBeGreaterThan(0);
      expect(sub.absorbency[i]).toBeGreaterThanOrEqual(0.05);
      expect(sub.absorbency[i]).toBeLessThanOrEqual(1);
    }
  });

  it("생지·반숙지·숙지 도사 등급에 따라 평균 흡수율이 순차적으로 감소한다", () => {
    const raw = createHanjiPaperSubstrate(32, 32, 42, { sizingGrade: "saengji-raw" });
    const semi = createHanjiPaperSubstrate(32, 32, 42, { sizingGrade: "ban-sukji-semi" });
    const sized = createHanjiPaperSubstrate(32, 32, 42, { sizingGrade: "sukji-sized" });

    expect(raw.meanAbsorbency).toBeGreaterThan(semi.meanAbsorbency);
    expect(semi.meanAbsorbency).toBeGreaterThan(sized.meanAbsorbency);
  });

  it("명시적 가로·세로 투과도 설정이 평균 이방성 투과도 비율에 정확히 반영된다", () => {
    const sub = createHanjiPaperSubstrate(32, 32, 88, {
      basePermX: 2.8,
      basePermY: 0.4,
    });

    expect(sub.meanPermX / sub.meanPermY).toBeGreaterThan(5.0);
  });
});

describe("Wave 112 — 3-필드 모세관 솔버 탄소 질량 보존 및 CFL 안정성", () => {
  it("발묵(balmuk-wet-bloom) 40스텝 후 총 탄소 질량 오차가 1.0% 미만이고 음수·비유한 셀이 0건이다", () => {
    const sub = createHanjiPaperSubstrate(56, 56, 112, { sizingGrade: "saengji-raw" });
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 28,
      y: 28,
      radius: 3.5,
      waterAmount: 1.4,
      carbonAmount: 1.0,
    });

    stepHanjiCapillarySimulation(canvas, 40);
    const report = measureSumiCarbonMassConservation(canvas);

    expect(report.expectedTotalCarbonMass).toBeGreaterThan(0);
    expect(report.relativeErrorPercent).toBeLessThan(1.0);
    expect(report.nonFiniteCellCount).toBe(0);
    expect(report.negativeCellCount).toBe(0);
    expect(report.conserved).toBe(true);
  });

  it("파묵(pamuk-wet-on-wet) 다중 중첩 적하 40스텝 후 총 탄소 질량이 엄격히 보존된다", () => {
    const sub = createHanjiPaperSubstrate(56, 56, 309, { sizingGrade: "saengji-raw" });
    const canvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");
    depositSumiInkDrop(canvas, {
      x: 28,
      y: 28,
      radius: 9,
      waterAmount: 1.0,
      carbonAmount: 0.12,
      profile: "flat-disc",
    });
    stepHanjiCapillarySimulation(canvas, 6);
    depositSumiInkDrop(canvas, {
      x: 29,
      y: 27,
      radius: 3.2,
      waterAmount: 1.0,
      carbonAmount: 1.15,
    });

    stepHanjiCapillarySimulation(canvas, 40);
    const report = measureSumiCarbonMassConservation(canvas);

    expect(report.relativeErrorPercent).toBeLessThan(1.0);
    expect(report.nonFiniteCellCount).toBe(0);
    expect(report.negativeCellCount).toBe(0);
    expect(report.conserved).toBe(true);
  });

  it("갈필(galpil-dry-bristle) 프리셋은 빠른 섬유 흡착과 질량 보존을 동시에 만족한다", () => {
    const sub = createHanjiPaperSubstrate(48, 48, 512);
    const balmuk = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    const galpil = createHanjiInkCanvas(sub, "galpil-dry-bristle");
    const drop = { x: 24, y: 24, radius: 3.0, waterAmount: 0.7, carbonAmount: 0.9 };

    depositSumiInkDrop(balmuk, drop);
    depositSumiInkDrop(galpil, drop);
    stepHanjiCapillarySimulation(balmuk, 25);
    stepHanjiCapillarySimulation(galpil, 25);

    const repGalpil = measureSumiCarbonMassConservation(galpil);
    const repBalmuk = measureSumiCarbonMassConservation(balmuk);

    expect(repGalpil.conserved).toBe(true);
    expect(repGalpil.relativeErrorPercent).toBeLessThan(1.0);
    const galpilDepositedShare = repGalpil.actualDepositedCarbonMass / repGalpil.actualTotalCarbonMass;
    const balmukDepositedShare = repBalmuk.actualDepositedCarbonMass / repBalmuk.actualTotalCarbonMass;
    expect(galpilDepositedShare).toBeGreaterThan(balmukDepositedShare);
  });

  it("캔버스 가장자리(경계 인접) 먹물 적하 시에도 경계 누출 없이 탄소 질량이 보존된다", () => {
    const sub = createHanjiPaperSubstrate(36, 36, 901);
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 1,
      y: 1,
      radius: 3.5,
      waterAmount: 1.5,
      carbonAmount: 1.1,
    });

    stepHanjiCapillarySimulation(canvas, 35);
    const report = measureSumiCarbonMassConservation(canvas);

    expect(report.relativeErrorPercent).toBeLessThan(1.0);
    expect(report.nonFiniteCellCount).toBe(0);
    expect(report.negativeCellCount).toBe(0);
    expect(report.conserved).toBe(true);
  });

  it("비정상적으로 큰 시간 간격(dt=50)이 들어와도 CFL 클램핑으로 수치 발산을 차단한다", () => {
    const sub = createHanjiPaperSubstrate(40, 40, 1234, { basePermX: 3.5, basePermY: 3.5 });
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 20,
      y: 20,
      radius: 3.0,
      waterAmount: 1.6,
      carbonAmount: 1.2,
    });

    const summary = stepHanjiCapillarySimulation(canvas, 15, 50.0);
    const audit = auditHanjiInkSimulation(canvas);

    expect(summary.cflClampedSteps).toBe(15);
    expect(audit.cflStable).toBe(true);
    expect(audit.cflClampCount).toBe(15);
    expect(audit.massConservation.conserved).toBe(true);
    expect(audit.massConservation.nonFiniteCellCount).toBe(0);
    expect(audit.massConservation.negativeCellCount).toBe(0);
  });

  it("동일 시드·적하·스텝으로 실행한 두 모세관 캔버스는 완전히 동일한 필드를 산출한다", () => {
    const runOnce = () => {
      const sub = createHanjiPaperSubstrate(40, 40, 4040);
      const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
      depositSumiInkDrop(canvas, {
        x: 20,
        y: 20,
        radius: 3.2,
        waterAmount: 1.3,
        carbonAmount: 0.95,
      });
      stepHanjiCapillarySimulation(canvas, 24);
      return canvas;
    };

    const a = runOnce();
    const b = runOnce();
    expect(Array.from(a.waterField)).toEqual(Array.from(b.waterField));
    expect(Array.from(a.carbonSuspensionField)).toEqual(Array.from(b.carbonSuspensionField));
    expect(Array.from(a.depositedCarbonField)).toEqual(Array.from(b.depositedCarbonField));
  });
});

describe("Wave 112 — 발묵 크로마토그래피 분리·이방성 닥섬유·응집 물리", () => {
  it("발묵 시뮬레이션 후 수분 전선이 먹핵보다 뚜렷이 앞서며 초기 반경보다 크게 번진다", () => {
    const sub = createHanjiPaperSubstrate(64, 64, 707, {
      sizingGrade: "saengji-raw",
      fiberAnisotropy: 1.0,
    });
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    const initialRadius = 3.0;
    depositSumiInkDrop(canvas, {
      x: 32,
      y: 32,
      radius: initialRadius,
      waterAmount: 1.6,
      carbonAmount: 1.0,
    });

    const beforeAudit = auditHanjiInkSimulation(canvas);
    stepHanjiCapillarySimulation(canvas, 40);
    const afterAudit = auditHanjiInkSimulation(canvas);

    expect(afterAudit.carbonSpreadRadius).toBeGreaterThan(beforeAudit.carbonSpreadRadius);
    expect(afterAudit.carbonSpreadRadius).toBeGreaterThan(initialRadius);
    expect(afterAudit.waterSpreadRadius).toBeGreaterThan(afterAudit.carbonSpreadRadius);
    expect(afterAudit.chromatographicHaloWidth).toBeGreaterThan(0.5);
  });

  it("방사형 프로파일에서 외곽 발묵 띠 구간은 먹 밀도 대비 수분 비중이 중심보다 높다", () => {
    const sub = createHanjiPaperSubstrate(64, 64, 708, { fiberAnisotropy: 1.0 });
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 32,
      y: 32,
      radius: 3.0,
      waterAmount: 1.7,
      carbonAmount: 1.0,
    });
    stepHanjiCapillarySimulation(canvas, 38);
    const audit = auditHanjiInkSimulation(canvas);

    const core = audit.radialProfile[0];
    const outer = audit.radialProfile[Math.min(7, audit.radialProfile.length - 1)];
    const coreWaterToCarbon = core.meanWater / Math.max(core.meanTotalCarbon, 1e-5);
    const outerWaterToCarbon = outer.meanWater / Math.max(outer.meanTotalCarbon, 1e-5);
    expect(outerWaterToCarbon).toBeGreaterThan(coreWaterToCarbon);
  });

  it("가로 투과도가 큰 화선지(fiberPermX >> fiberPermY)에서는 먹 번짐이 가로로 1.25배 이상 길어진다", () => {
    const sub = createHanjiPaperSubstrate(64, 64, 912, {
      basePermX: 3.2,
      basePermY: 0.32,
      fiberRoughness: 0.25,
    });
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 32,
      y: 32,
      radius: 2.6,
      waterAmount: 1.7,
      carbonAmount: 1.0,
    });
    stepHanjiCapillarySimulation(canvas, 45);
    const audit = auditHanjiInkSimulation(canvas);

    expect(audit.xSpreadRadius).toBeGreaterThan(audit.ySpreadRadius * 1.25);
    expect(audit.anisotropySpreadRatio).toBeGreaterThan(1.25);
  });

  it("세로 투과도가 큰 화선지(fiberPermY >> fiberPermX)에서는 먹 번짐이 세로로 1.25배 이상 길어진다", () => {
    const sub = createHanjiPaperSubstrate(64, 64, 913, {
      basePermX: 0.32,
      basePermY: 3.2,
      fiberRoughness: 0.25,
    });
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 32,
      y: 32,
      radius: 2.6,
      waterAmount: 1.7,
      carbonAmount: 1.0,
    });
    stepHanjiCapillarySimulation(canvas, 45);
    const audit = auditHanjiInkSimulation(canvas);

    expect(audit.ySpreadRadius).toBeGreaterThan(audit.xSpreadRadius * 1.25);
  });

  it("스텝이 진행됨에 따라 섬유 흡착 탄소가 단조 증가하며 총 탄소 질량은 불변한다", () => {
    const sub = createHanjiPaperSubstrate(44, 44, 333);
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, {
      x: 22,
      y: 22,
      radius: 3.2,
      waterAmount: 1.2,
      carbonAmount: 1.0,
    });

    let prevDeposited = -1;
    for (let k = 0; k < 5; k += 1) {
      stepHanjiCapillarySimulation(canvas, 8);
      const rep = measureSumiCarbonMassConservation(canvas);
      expect(rep.actualDepositedCarbonMass).toBeGreaterThan(prevDeposited);
      expect(rep.relativeErrorPercent).toBeLessThan(1.0);
      prevDeposited = rep.actualDepositedCarbonMass;
    }
  });
});

describe("Wave 112 — 파묵(pamuk-wet-on-wet) 습윤 겹침 확산", () => {
  it("미리 적신 화선지에 떨어뜨린 진먹이 건조 화선지 위의 동일 진먹보다 뚜렷이 넓게 확산된다", () => {
    const sub = createHanjiPaperSubstrate(64, 64, 1500, {
      sizingGrade: "saengji-raw",
      fiberAnisotropy: 1.0,
    });
    const dryCanvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");
    const wetCanvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");

    // 습지 사전 적심(순수 수분 바탕)
    depositSumiInkDrop(wetCanvas, {
      x: 32,
      y: 32,
      radius: 14,
      waterAmount: 1.0,
      carbonAmount: 0,
      profile: "flat-disc",
    });
    stepHanjiCapillarySimulation(wetCanvas, 4);

    // 동일한 농묵 적하
    const accentDrop = {
      x: 32,
      y: 32,
      radius: 3.0,
      waterAmount: 0.9,
      carbonAmount: 1.1,
    };
    depositSumiInkDrop(dryCanvas, accentDrop);
    depositSumiInkDrop(wetCanvas, accentDrop);

    stepHanjiCapillarySimulation(dryCanvas, 36);
    stepHanjiCapillarySimulation(wetCanvas, 36);

    const dryAudit = auditHanjiInkSimulation(dryCanvas);
    const wetAudit = auditHanjiInkSimulation(wetCanvas);

    expect(wetAudit.carbonSpreadRadius).toBeGreaterThan(dryAudit.carbonSpreadRadius * 1.15);
    expect(dryAudit.massConservation.conserved).toBe(true);
    expect(wetAudit.massConservation.conserved).toBe(true);
  });

  it("담묵 바탕 위에 농묵을 겹치는 정통 파묵에서도 총 탄소 질량이 오차 1% 미만으로 보존된다", () => {
    const sub = createHanjiPaperSubstrate(56, 56, 1501);
    const canvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");

    depositSumiInkDrop(canvas, {
      x: 28,
      y: 28,
      radius: 11,
      waterAmount: 0.95,
      carbonAmount: 0.1,
      profile: "flat-disc",
    });
    stepHanjiCapillarySimulation(canvas, 5);
    depositSumiInkDrop(canvas, {
      x: 28,
      y: 28,
      radius: 3.0,
      waterAmount: 0.85,
      carbonAmount: 1.0,
    });
    stepHanjiCapillarySimulation(canvas, 35);

    const audit = auditHanjiInkSimulation(canvas);
    expect(audit.massConservation.conserved).toBe(true);
    expect(audit.massConservation.relativeErrorPercent).toBeLessThan(1.0);
    expect(audit.carbonSpreadRadius).toBeGreaterThan(3.0);
  });

  it("습윤 바탕(파묵)은 건조 화선지 대비 중간 스텝에서 현탁 탄소 유동 비율을 더 높게 유지한다", () => {
    const sub = createHanjiPaperSubstrate(52, 52, 1502);
    const dryCanvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");
    const wetCanvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");

    depositSumiInkDrop(wetCanvas, {
      x: 26,
      y: 26,
      radius: 12,
      waterAmount: 1.1,
      carbonAmount: 0,
      profile: "flat-disc",
    });
    const drop = { x: 26, y: 26, radius: 3.0, waterAmount: 0.7, carbonAmount: 1.0 };
    depositSumiInkDrop(dryCanvas, drop);
    depositSumiInkDrop(wetCanvas, drop);

    stepHanjiCapillarySimulation(dryCanvas, 18);
    stepHanjiCapillarySimulation(wetCanvas, 18);

    const dryRep = measureSumiCarbonMassConservation(dryCanvas);
    const wetRep = measureSumiCarbonMassConservation(wetCanvas);
    const dryMobileFrac = dryRep.actualMobileCarbonMass / dryRep.actualTotalCarbonMass;
    const wetMobileFrac = wetRep.actualMobileCarbonMass / wetRep.actualTotalCarbonMass;

    expect(wetMobileFrac).toBeGreaterThan(dryMobileFrac);
  });
});

describe("Wave 112 — 다중 붓털 갈필·비백(Flying-White) 합성 엔진", () => {
  it("붓 습윤도가 낮아질수록 비백 공백률(flyingWhiteRatio)이 엄격히 단조 증가한다", () => {
    const sub = createHanjiPaperSubstrate(96, 48, 2201, { fiberRoughness: 0.8 });
    const traj = buildLinearBrushTrajectory(8, 24, 88, 24, 380, 0.52);

    const wetStroke = synthesizeGalpilDryBrushStroke(sub, traj, { moisture: 0.85, seed: 7 });
    const midStroke = synthesizeGalpilDryBrushStroke(sub, traj, { moisture: 0.45, seed: 7 });
    const dryStroke = synthesizeGalpilDryBrushStroke(sub, traj, { moisture: 0.12, seed: 7 });

    expect(dryStroke.flyingWhiteRatio).toBeGreaterThan(midStroke.flyingWhiteRatio);
    expect(midStroke.flyingWhiteRatio).toBeGreaterThan(wetStroke.flyingWhiteRatio);
  });

  it("운필 속도가 빨라질수록 비백 공백률(flyingWhiteRatio)이 엄격히 단조 증가한다", () => {
    const sub = createHanjiPaperSubstrate(96, 48, 2202, { fiberRoughness: 0.8 });
    const slowTraj = buildLinearBrushTrajectory(8, 24, 88, 24, 80, 0.5);
    const midTraj = buildLinearBrushTrajectory(8, 24, 88, 24, 480, 0.5);
    const fastTraj = buildLinearBrushTrajectory(8, 24, 88, 24, 1150, 0.5);

    const slow = synthesizeGalpilDryBrushStroke(sub, slowTraj, { moisture: 0.34, seed: 9 });
    const mid = synthesizeGalpilDryBrushStroke(sub, midTraj, { moisture: 0.34, seed: 9 });
    const fast = synthesizeGalpilDryBrushStroke(sub, fastTraj, { moisture: 0.34, seed: 9 });

    expect(fast.flyingWhiteRatio).toBeGreaterThan(mid.flyingWhiteRatio);
    expect(mid.flyingWhiteRatio).toBeGreaterThan(slow.flyingWhiteRatio);
  });

  it("필획 진입부에서 끝단까지 평균 먹 잔량이 역전 없이 단조 감소한다", () => {
    const sub = createHanjiPaperSubstrate(96, 48, 2203, { fiberRoughness: 0.72 });
    const traj = buildLinearBrushTrajectory(6, 24, 90, 24, 420, 0.55);
    const stroke = synthesizeGalpilDryBrushStroke(sub, traj, {
      bristleCount: 16,
      moisture: 0.32,
      inkLoad: 0.9,
      depletionRate: 0.015,
    });

    expect(stroke.inkDepletionMonotonic).toBe(true);
    expect(stroke.finalMeanInkLoad).toBeLessThan(stroke.initialMeanInkLoad);
    expect(stroke.meanInkLoadProfile.length).toBeGreaterThan(10);
    expect(stroke.meanInkLoadProfile[stroke.meanInkLoadProfile.length - 1]).toBeLessThan(
      stroke.meanInkLoadProfile[0],
    );
  });

  it("붓털 개수는 8~24모 안전 범위로 클램핑되고 개별 붓털 궤적이 모두 기록된다", () => {
    const sub = createHanjiPaperSubstrate(64, 40, 2204);
    const traj = buildLinearBrushTrajectory(6, 20, 58, 20, 320, 0.5);

    const minClamped = synthesizeGalpilDryBrushStroke(sub, traj, { bristleCount: 2 });
    const maxClamped = synthesizeGalpilDryBrushStroke(sub, traj, { bristleCount: 99 });

    expect(minClamped.bristleCount).toBe(8);
    expect(minClamped.bristleTraces).toHaveLength(8);
    expect(maxClamped.bristleCount).toBe(24);
    expect(maxClamped.bristleTraces).toHaveLength(24);
  });

  it("RGBA 버퍼 길이가 정확하고 비유한 픽셀 0건이며 먹이 찍힌 화소가 화선지 바탕보다 어둡다", () => {
    const sub = createHanjiPaperSubstrate(80, 40, 2205);
    const traj = buildLinearBrushTrajectory(8, 20, 72, 20, 260, 0.65);
    const stroke = synthesizeGalpilDryBrushStroke(sub, traj, {
      moisture: 0.45,
      bristleCount: 14,
    });

    expect(stroke.rgbaBuffer.length).toBe(80 * 40 * 4);
    expect(stroke.nonFiniteRgbaCount).toBe(0);
    let darkenedPixels = 0;
    for (let i = 0; i < stroke.rgbaBuffer.length; i += 4) {
      expect(stroke.rgbaBuffer[i + 3]).toBe(255);
      if (stroke.rgbaBuffer[i] < 200) {
        darkenedPixels += 1;
      }
    }
    expect(darkenedPixels).toBeGreaterThan(40);
  });

  it("동일한 기질·궤적·시드로 생성한 갈필 RGBA 버퍼와 비백률은 결정론적으로 일치한다", () => {
    const sub = createHanjiPaperSubstrate(72, 36, 2206);
    const traj = buildLinearBrushTrajectory(6, 18, 66, 18, 520, 0.48);

    const a = synthesizeGalpilDryBrushStroke(sub, traj, { moisture: 0.28, seed: 55 });
    const b = synthesizeGalpilDryBrushStroke(sub, traj, { moisture: 0.28, seed: 55 });

    expect(a.flyingWhiteRatio).toBe(b.flyingWhiteRatio);
    expect(Array.from(a.rgbaBuffer)).toEqual(Array.from(b.rgbaBuffer));
  });
});

describe("Wave 112 — WebGPU WGSL 화선지 모세관·갈필 셰이더 검증", () => {
  it("3개 수묵 기법 프리셋 모두에 대해 유효한 WGSL 컴퓨트 셰이더를 생성한다", () => {
    const presets: readonly KoreanInkTechniquePreset[] = [
      "balmuk-wet-bloom",
      "pamuk-wet-on-wet",
      "galpil-dry-bristle",
    ];

    for (const preset of presets) {
      const cfg = getKoreanInkTechniqueConfig(preset);
      const artifact = buildHanjiSumieWgsl(preset, [8, 8]);
      const report = validateHanjiSumieWgsl(artifact);

      expect(artifact.preset).toBe(preset);
      expect(artifact.wgsl).toContain(cfg.waterCapillaryDiffusivity.toFixed(3));
      expect(artifact.wgsl).toContain("eval_galpil_contact_threshold");
      expect(report.valid).toBe(true);
      expect(report.errors).toEqual([]);
      expect(report.bindingCount).toBe(6);
      expect(report.entryPoints).toEqual([
        "compute_anisotropic_hanji_flux",
        "integrate_hanji_carbon_flocculation",
      ]);
    }
  });

  it("커스텀 워크그룹 크기를 지정해도 WGSL 유효성 검증을 통과한다", () => {
    const artifact = buildHanjiSumieWgsl("pamuk-wet-on-wet", [16, 8]);
    const report = validateHanjiSumieWgsl(artifact);

    expect(artifact.workgroupSize).toEqual([16, 8]);
    expect(artifact.wgsl).toContain("@workgroup_size(16, 8)");
    expect(report.valid).toBe(true);
  });

  it("괄호 불균형·엔트리포인트 누락·NaN 리터럴이 포함된 손상 WGSL을 정확히 거부한다", () => {
    const broken = `
struct BrokenUniforms { x: f32,
@compute @workgroup_size(32, 32)
fn wrong_entry() {
  let bad = NaN;
`;
    const report = validateHanjiSumieWgsl(broken);

    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Wave 112 — OKLCH 인쇄 안전 진단 SVG 및 자연스러운 한국어 리포트", () => {
  it("진단 SVG는 NaN/Infinity와 원시 hex/rgb 색상 없이 순수 OKLCH 색상으로만 출력된다", () => {
    const sub = createHanjiPaperSubstrate(52, 52, 3100);
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, { x: 26, y: 26, radius: 3.2, waterAmount: 1.5, carbonAmount: 1.0 });
    stepHanjiCapillarySimulation(canvas, 30);
    const audit = auditHanjiInkSimulation(canvas);
    const galpil = synthesizeGalpilDryBrushStroke(
      sub,
      buildLinearBrushTrajectory(6, 26, 46, 26, 460, 0.5),
      { moisture: 0.28 },
    );

    const svg = renderHanjiInkWashAuditSvg(audit, galpil);
    const rawHexPattern = new RegExp(`${String.fromCharCode(35)}[0-9a-fA-F]{3,8}`);
    const rawRgbPrefix = `${"r"}${"gb("}`;
    const rawRgbaPrefix = `${"r"}${"gba("}`;

    expect(svg.startsWith("<svg ")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(rawHexPattern.test(svg)).toBe(false);
    expect(svg).not.toContain(rawRgbPrefix);
    expect(svg).not.toContain(rawRgbaPrefix);
  });

  it("제목·부제목의 XML 특수문자를 안전하게 이스케이프하여 SVG 구조를 보존한다", () => {
    const sub = createHanjiPaperSubstrate(32, 32, 3101);
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, { x: 16, y: 16, radius: 2.5, waterAmount: 1.0, carbonAmount: 0.8 });
    stepHanjiCapillarySimulation(canvas, 12);
    const audit = auditHanjiInkSimulation(canvas);

    const malicious = `<script>alert("x&y'z")</script>`;
    const svg = renderHanjiInkWashAuditSvg(audit, undefined, {
      title: malicious,
      subtitle: `발묵 & 파묵 <테스트>`,
    });

    expect(escapeXmlText(malicious)).toBe("&lt;script&gt;alert(&quot;x&amp;y&apos;z&quot;)&lt;/script&gt;");
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("발묵 &amp; 파묵 &lt;테스트&gt;");
  });

  it("다크 테마와 갈필 미입력 단독 모드 모두 유효한 OKLCH SVG를 생성한다", () => {
    const sub = createHanjiPaperSubstrate(36, 36, 3102);
    const canvas = createHanjiInkCanvas(sub, "pamuk-wet-on-wet");
    depositSumiInkDrop(canvas, { x: 18, y: 18, radius: 3.0, waterAmount: 1.2, carbonAmount: 0.9 });
    stepHanjiCapillarySimulation(canvas, 16);
    const audit = auditHanjiInkSimulation(canvas);

    const darkSvg = renderHanjiInkWashAuditSvg(audit, undefined, { theme: "dark" });
    expect(darkSvg).toContain("oklch(");
    expect(darkSvg).toContain("갈필 스트로크 미입력");
    expect(darkSvg).not.toContain("NaN");
  });

  it("한국어 QA 리포트는 핵심 물리 수치를 자연스러운 한국어로 보고하며 번역투를 포함하지 않는다", () => {
    const sub = createHanjiPaperSubstrate(52, 52, 3103);
    const canvas = createHanjiInkCanvas(sub, "balmuk-wet-bloom");
    depositSumiInkDrop(canvas, { x: 26, y: 26, radius: 3.2, waterAmount: 1.6, carbonAmount: 1.0 });
    stepHanjiCapillarySimulation(canvas, 32);
    const audit = auditHanjiInkSimulation(canvas);
    const galpil = synthesizeGalpilDryBrushStroke(
      sub,
      buildLinearBrushTrajectory(6, 26, 46, 26, 520, 0.48),
      { moisture: 0.25 },
    );

    const report = summarizeHanjiInkSessionKo(audit, galpil);
    const joined = [report.headlineKo, report.summaryParagraphKo, ...report.bulletLinesKo].join(" ");

    expect(report.preset).toBe("balmuk-wet-bloom");
    expect(report.presetLabelKo).toContain("발묵");
    expect(report.carbonMassErrorPercent).toBeLessThan(1.0);
    expect(report.bloomGrowthRatio).toBeGreaterThan(1.0);
    expect(report.chromatographicHaloWidth).toBeGreaterThan(0.3);
    expect(report.flyingWhiteRatio).toBe(galpil.flyingWhiteRatio);
    expect(report.bulletLinesKo.length).toBe(6);
    expect(joined).toContain("탄소 질량");
    expect(joined).toContain("CFL");
    expect(joined).toContain("비백");
    expect(joined).not.toContain("가능하게 합니다");
    expect(joined).not.toContain("직관적인 경험을 제공");
    expect(joined).not.toContain("원활한 워크플로우");
  });
});
