import { describe, expect, it } from "vitest";

import {
  applyRecommendedPhysicsPatch,
  auditSingleBrushNamingParity,
  computeFingerprintRmse,
  DEFAULT_DUPLICATE_RMSE_THRESHOLD,
  FINGERPRINT_HEIGHT,
  FINGERPRINT_WIDTH,
  inferExpectedMediaCategory,
  loadUnifiedBrushCatalog,
  runFullBrushCatalogAudit,
  synthesizeBrushFingerprint64x32,
  type UnifiedBrushAuditRecord,
} from "./brush-catalog-visual-dedupe-audit";
import {
  BRUSH_CATEGORY_PHYSICAL_STRATEGIES,
  BRUSH_FEATURE_KEYS,
  BRUSH_MEDIA_CATEGORY_IDS,
  computeFeatureVectorDistance,
  createInitialBristleInertiaState,
  evaluateBrushPaintLoadDryout,
  evaluateStrategySeparation,
  stepBristleDirectionInertia,
  type BrushMediaCategoryId,
} from "./brush-category-physical-strategies";

function strategyToAuditRecord(category: BrushMediaCategoryId): UnifiedBrushAuditRecord {
  const s = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[category];
  return {
    uid: `strategy:${category}`,
    id: `strategy-${category}`,
    sourceCatalog: "global-master",
    nameKo: s.labelKo,
    nameEn: s.labelEn,
    rawCategory: category,
    operation: s.operation,
    aspectRatio: s.tipAspectRatio,
    spacingRatio: 0.08,
    scatter01: s.targetFeatures.edgeRoughness * 0.25,
    taper01: s.velocityTaper01,
    features: s.targetFeatures,
  };
}

describe("12대 매체별 브러시 물리 전략 정본 및 동역학 모델", () => {
  it("12대 매체 전략이 모두 정의되고 임의 두 매체 간 특징 벡터 및 64×32 지문이 상호 변별된다", () => {
    expect(BRUSH_MEDIA_CATEGORY_IDS).toHaveLength(12);
    const separation = evaluateStrategySeparation();
    expect(separation.pairCount).toBe(66);
    expect(separation.minDistance).toBeGreaterThan(0.35);
    expect(separation.allMutuallyDistinct).toBe(true);

    for (const id of BRUSH_MEDIA_CATEGORY_IDS) {
      const strategy = BRUSH_CATEGORY_PHYSICAL_STRATEGIES[id];
      expect(strategy.id).toBe(id);
      expect(strategy.signatureMechanismsKo.length).toBeGreaterThanOrEqual(3);
      for (const key of BRUSH_FEATURE_KEYS) {
        const val = strategy.targetFeatures[key];
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    }

    const strategyFingerprints = BRUSH_MEDIA_CATEGORY_IDS.map((id) =>
      synthesizeBrushFingerprint64x32(strategyToAuditRecord(id)),
    );
    let minPairRmse = Number.POSITIVE_INFINITY;
    for (let i = 0; i < strategyFingerprints.length; i += 1) {
      for (let j = i + 1; j < strategyFingerprints.length; j += 1) {
        const rmse = computeFingerprintRmse(strategyFingerprints[i], strategyFingerprints[j]);
        if (rmse < minPairRmse) minPairRmse = rmse;
        expect(rmse).toBeGreaterThan(DEFAULT_DUPLICATE_RMSE_THRESHOLD);
      }
    }
    expect(minPairRmse).toBeGreaterThan(0.03);
  });

  it("실시간 안료·수분 갈필 고갈 모델이 단조 감소하고 거친 종이·고필압 가속 및 리필 복원을 지킨다", () => {
    const lengths = [0, 250, 700, 1400, 2600];
    const samples = lengths.map((strokeLengthPx) =>
      evaluateBrushPaintLoadDryout({
        category: "oil-impasto",
        strokeLengthPx,
        pressure01: 0.72,
        paperRoughness01: 0.75,
      }),
    );

    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i].paintRemaining01).toBeLessThan(samples[i - 1].paintRemaining01);
      expect(samples[i].moistureRemaining01).toBeLessThan(samples[i - 1].moistureRemaining01);
      expect(samples[i].drySplitFactor01).toBeGreaterThanOrEqual(samples[i - 1].drySplitFactor01);
    }

    const head = samples[0];
    const tail = samples[samples.length - 1];
    expect(head.phase).toBe("saturated");
    expect(tail.drySplitFactor01).toBeGreaterThan(0.5);
    expect(tail.activeBristleStrands).toBeLessThan(head.activeBristleStrands);
    expect(tail.toothBreakupBoost01).toBeGreaterThan(0.35);

    const smoothLow = evaluateBrushPaintLoadDryout({
      category: "watercolor",
      strokeLengthPx: 1000,
      pressure01: 0.25,
      paperRoughness01: 0.1,
    });
    const roughHigh = evaluateBrushPaintLoadDryout({
      category: "watercolor",
      strokeLengthPx: 1000,
      pressure01: 0.9,
      paperRoughness01: 0.9,
    });
    expect(roughHigh.paintRemaining01).toBeLessThan(smoothLow.paintRemaining01);
    expect(roughHigh.moistureRemaining01).toBeLessThan(smoothLow.moistureRemaining01);

    const refilledNewStroke = evaluateBrushPaintLoadDryout({
      category: "oil-impasto",
      strokeLengthPx: 2600,
      pressure01: 0.72,
      paperRoughness01: 0.75,
      refillEvent: "new-stroke",
    });
    expect(refilledNewStroke.refilled).toBe(true);
    expect(refilledNewStroke.paintRemaining01).toBe(1);
    expect(refilledNewStroke.drySplitFactor01).toBe(0);
    expect(refilledNewStroke.activeBristleStrands).toBe(48);

    const refilledColorPick = evaluateBrushPaintLoadDryout({
      category: "watercolor",
      strokeLengthPx: 2200,
      pressure01: 0.8,
      paperRoughness01: 0.8,
      refillEvent: "color-pick",
    });
    expect(refilledColorPick.refilled).toBe(true);
    expect(refilledColorPick.moistureRemaining01).toBe(1);
    expect(refilledColorPick.drySplitFactor01).toBe(0);
  });

  it("붓모 방향 관성이 급회전에서 오버슈트 없이 부드럽게 수렴하고 거친 종이 저속 손떨림을 감쇠한다", () => {
    let oilState = createInitialBristleInertiaState(0, 0, 0);
    let gpenState = createInitialBristleInertiaState(0, 0, 0);
    const oilHeadings: number[] = [];
    const gpenHeadings: number[] = [];

    // +X(0 rad)에서 +Y(PI/2 rad)로 90도 급회전 구간(초기 관성 지연 + 장기 부드러운 수렴 검증).
    for (let step = 1; step <= 45; step += 1) {
      oilState = stepBristleDirectionInertia({
        state: oilState,
        targetX: 0,
        targetY: step * 4,
        dtMs: 16,
        pressure01: 0.7,
        paperRoughness01: 0.6,
        category: "oil-impasto",
      });
      gpenState = stepBristleDirectionInertia({
        state: gpenState,
        targetX: 0,
        targetY: step * 4,
        dtMs: 16,
        pressure01: 0.7,
        paperRoughness01: 0.6,
        category: "gpen-ink",
      });
      oilHeadings.push(oilState.headingRad);
      gpenHeadings.push(gpenState.headingRad);
    }

    // 초기 급회전 구간(5프레임)에서는 즉응 G펜이 무거운 48돈모 유화보다 훨씬 빠르게 선회하고,
    // 유화는 오버슈트 없이 목표 각도(PI/2)로 단조 수렴한다.
    expect(oilHeadings[0]).toBeGreaterThan(0);
    expect(oilHeadings[0]).toBeLessThan(Math.PI / 2);
    expect(gpenHeadings[4]).toBeGreaterThan(oilHeadings[4] + 0.35);
    for (let i = 1; i < oilHeadings.length; i += 1) {
      expect(oilHeadings[i]).toBeGreaterThanOrEqual(oilHeadings[i - 1] - 1e-6);
      expect(oilHeadings[i]).toBeLessThanOrEqual(Math.PI / 2 + 1e-4);
    }
    expect(oilHeadings[19]).toBeGreaterThan(0.85);
    expect(oilHeadings[19]).toBeLessThan(1.35);
    expect(oilHeadings[oilHeadings.length - 1]).toBeGreaterThan(1.4);

    // 거친 황목지 저속 드로잉에서 ±1.6px 고주파 손떨림이 원시 입력 대비 감쇠된다.
    let roughCharcoal = createInitialBristleInertiaState(0, 0, 0);
    let rawYAbsSum = 0;
    let filteredYAbsSum = 0;
    for (let step = 1; step <= 24; step += 1) {
      const tremorY = step % 2 === 0 ? 1.6 : -1.6;
      rawYAbsSum += Math.abs(tremorY);
      roughCharcoal = stepBristleDirectionInertia({
        state: roughCharcoal,
        targetX: step * 1.2,
        targetY: tremorY,
        dtMs: 16,
        pressure01: 0.6,
        paperRoughness01: 0.92,
        category: "charcoal",
      });
      filteredYAbsSum += Math.abs(roughCharcoal.filteredY);
    }
    expect(filteredYAbsSum).toBeLessThan(rawYAbsSum * 0.45);
  });
});

describe("전 브러시 카탈로그 시각 중복 · 이름↔질감 1:1 정합성 감사 엔진", () => {
  it("실제 6대 카탈로그 100종 이상(194종)을 통합 감사해 12대 매체 분포와 100% 이름↔질감 정합성을 실측한다", () => {
    const records = loadUnifiedBrushCatalog();
    expect(records.length).toBeGreaterThan(100);
    expect(records.length).toBe(194);

    const report = runFullBrushCatalogAudit({ records });
    expect(report.totalBrushes).toBe(194);
    expect(report.alignedCount + report.mismatchCount).toBe(194);
    expect(report.namingParityRate01).toBe(1);
    expect(report.alignedCount).toBe(194);
    expect(report.mismatchCount).toBe(0);
    expect(report.mismatchedBrushes).toHaveLength(0);
    expect(report.duplicatePairCount).toBeGreaterThan(0);
    expect(report.duplicateClusters.length).toBeGreaterThan(0);
    expect(report.strategySeparation.allMutuallyDistinct).toBe(true);

    // 모든 12대 매체 카테고리에 실제 브러시가 1종 이상 매핑된다.
    for (const id of BRUSH_MEDIA_CATEGORY_IDS) {
      expect(report.categoryDistribution[id]).toBeGreaterThan(0);
    }
  });

  it("합성 이름↔질감 불일치 탐지·자동 물리 패치 100% 복구 및 시각 중복 쌍(RMSE < 0.025)을 정확히 포착한다", () => {
    const brokenPencil: UnifiedBrushAuditRecord = {
      uid: "synthetic:smooth-pencil",
      id: "smooth-pencil",
      sourceCatalog: "magma-studio",
      nameKo: "매끈 연필 테스트",
      nameEn: "Broken Smooth Pencil",
      rawCategory: "sketch",
      operation: "paint",
      aspectRatio: 0.9,
      spacingRatio: 0.08,
      scatter01: 0,
      taper01: 0.2,
      features: {
        toothContrast: 0.02,
        edgeRoughness: 0.03,
        edgeSharpness: 0.96,
        wetBleed: 0.45,
        impastoHeight: 0,
        opacityCoverage: 0.98,
        multiplyStacking: 0.1,
        smudgePickup: 0,
        liftStrength: 0,
        bristleSpread: 0.04,
      },
    };
    const duplicatePencil: UnifiedBrushAuditRecord = {
      ...brokenPencil,
      uid: "synthetic:smooth-pencil-clone",
      id: "smooth-pencil-clone",
      sourceCatalog: "universal-p5",
      nameKo: "복제 매끈 연필",
    };
    const crispAirbrush: UnifiedBrushAuditRecord = {
      ...brokenPencil,
      uid: "synthetic:sharp-airbrush",
      id: "sharp-airbrush",
      nameKo: "칼선 에어브러시 오류",
      nameEn: "Hard Broken Airbrush",
      rawCategory: "airbrush",
    };

    expect(inferExpectedMediaCategory(brokenPencil).category).toBe("pencil");
    expect(inferExpectedMediaCategory(crispAirbrush).category).toBe("airbrush");

    const syntheticRecords = [brokenPencil, duplicatePencil, crispAirbrush];
    const audit = runFullBrushCatalogAudit({
      records: syntheticRecords,
    });
    expect(audit.mismatchCount).toBe(3);
    expect(audit.duplicatePairCount).toBeGreaterThanOrEqual(1);

    // 합성 불일치 픽스처 전체가 자동 물리 보정 패치를 제공하며, 적용 시 100% 정합 상태로 복구된다.
    const byUid = new Map(syntheticRecords.map((r) => [r.uid, r]));
    for (const mismatch of audit.mismatchedBrushes) {
      expect(mismatch.recommendedPhysicsPatch).not.toBeNull();
      const original = byUid.get(mismatch.uid);
      expect(original).toBeDefined();
      if (!original || !mismatch.recommendedPhysicsPatch) continue;
      const patched = applyRecommendedPhysicsPatch(original, mismatch.recommendedPhysicsPatch);
      const patchedFp = synthesizeBrushFingerprint64x32(patched);
      expect(patchedFp.pixels.length).toBe(FINGERPRINT_WIDTH * FINGERPRINT_HEIGHT);
      const recheck = auditSingleBrushNamingParity(patched, patchedFp);
      expect(recheck.aligned).toBe(true);
    }

    const clonePair = audit.duplicatePairs.find(
      (p) =>
        (p.uidA === brokenPencil.uid && p.uidB === duplicatePencil.uid) ||
        (p.uidB === brokenPencil.uid && p.uidA === duplicatePencil.uid),
    );
    expect(clonePair).toBeDefined();
    expect(clonePair?.pairwiseRmse).toBeLessThan(DEFAULT_DUPLICATE_RMSE_THRESHOLD);
    expect(clonePair?.recommendation).toBe("merge-to-canonical");
    expect(computeFeatureVectorDistance(brokenPencil.features, duplicatePencil.features)).toBe(0);
  });
});
