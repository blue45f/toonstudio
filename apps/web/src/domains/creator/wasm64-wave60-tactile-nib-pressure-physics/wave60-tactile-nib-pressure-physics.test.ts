import { describe, expect, it } from "vitest";
import {
  calibratePersonalPressureCurve,
  compensateAdaptiveNibWear,
  computeCapillaryInkTransfer,
  createInitialNibWearState,
  DEFAULT_PRESSURE_LUT_SIZE,
  evaluateCalibratedPressure,
  evaluatePaperMicroContact,
  getNibMechanicalSpec,
  getPaperSubstrateSpec,
  listNibPresetIds,
  listPaperSubstrateIds,
  lockBrokenInNibPreset,
  MAX_FRICTION_BANDPASS_HZ,
  MAX_HAPTIC_CARRIER_HZ,
  MAX_TACTILE_AUDIO_GAIN_LINEAR,
  MIN_FRICTION_BANDPASS_HZ,
  MIN_HAPTIC_CARRIER_HZ,
  MM_PER_METER,
  samplePaperFiberHeightField,
  stepNibMechanics,
  synthesizeTactileStrokeFeedback,
  type NibPresetId,
  type NibWearState,
  type PaperSubstrateId,
} from "./index";

function simulateWritingDistance(
  initial: NibWearState,
  totalMeters: number,
  segments: number,
  params: { readonly pressure: number; readonly tiltDeg: number; readonly azimuthDeg: number; readonly paperAbrasiveness?: number },
): NibWearState {
  let state = initial;
  const stepDistanceMm = (totalMeters * MM_PER_METER) / segments;
  for (let i = 0; i < segments; i += 1) {
    state = stepNibMechanics({
      wearState: state,
      pressure: params.pressure,
      tiltDeg: params.tiltDeg,
      azimuthDeg: params.azimuthDeg,
      stepDistanceMm,
      dtMs: 12,
      paperAbrasiveness: params.paperAbrasiveness ?? 1.0,
    }).nextWearState;
  }
  return state;
}

describe("Wave 60: 펜촉 탄성·슬릿 벌어짐·비대칭 편마모 및 적응형 보정 커널", () => {
  it("1. 6종 필기구 프리셋(G펜·마루펜·2B/HB 연필·붓펜·마커)의 물리 사양이 모두 유효하게 등록되어 있다", () => {
    const ids = listNibPresetIds();
    expect(ids).toEqual(["g-pen", "maru-pen", "pencil-2b", "pencil-hb", "brush-pen", "marker"]);
    for (const id of ids) {
      const spec = getNibMechanicalSpec(id);
      expect(spec.baseTipWidthMm).toBeGreaterThan(0);
      expect(spec.springStiffnessNPerMm).toBeGreaterThan(0);
      expect(spec.maxServiceWearUm).toBeGreaterThan(spec.sweetSpotWearUm);
      expect(spec.hasSplitTines).toBe(id === "g-pen" || id === "maru-pen");
      if (spec.hasSplitTines) expect(spec.maxTineSplitMm).toBeGreaterThan(0.4);
      else expect(spec.maxTineSplitMm).toBe(0);
    }
  });

  it("2. G펜 좌우 슬릿 벌어짐(tineSplitMm)은 비선형 Hill 필압 곡선(초기 예압 → 중간 급상승 → 포화)과 단조 증가를 따른다", () => {
    const freshG = createInitialNibWearState("g-pen");
    const pressures = [0, 0.08, 0.15, 0.35, 0.55, 0.75, 0.9, 1.0];
    const splits = pressures.map(
      (pressure) =>
        stepNibMechanics({ wearState: freshG, pressure, tiltDeg: 25, azimuthDeg: 45, stepDistanceMm: 0, dtMs: 60 })
          .tineSplitMm,
    );

    expect(splits[0]).toBe(0);
    for (let i = 1; i < splits.length; i += 1) {
      expect(splits[i]).toBeGreaterThan(splits[i - 1]);
    }
    const lowSlope = (splits[1] - splits[0]) / 0.08;
    const midSlope = (splits[4] - splits[3]) / 0.2;
    const highSlope = (splits[7] - splits[6]) / 0.1;
    expect(midSlope).toBeGreaterThan(lowSlope * 3);
    expect(midSlope).toBeGreaterThan(highSlope * 1.4);
  });

  it("3. 마루펜은 G펜보다 최소 선폭·최대 슬릿이 섬세하며, 비슬릿 필기구는 슬릿 벌어짐이 항상 0이다", () => {
    const gRes = stepNibMechanics({ wearState: createInitialNibWearState("g-pen"), pressure: 0.85, tiltDeg: 20, stepDistanceMm: 0, dtMs: 60 });
    const maruRes = stepNibMechanics({ wearState: createInitialNibWearState("maru-pen"), pressure: 0.85, tiltDeg: 20, stepDistanceMm: 0, dtMs: 60 });
    expect(maruRes.tineSplitMm).toBeGreaterThan(0);
    expect(maruRes.tineSplitMm).toBeLessThan(gRes.tineSplitMm);
    expect(maruRes.effectiveStrokeWidthMm).toBeLessThan(gRes.effectiveStrokeWidthMm);

    const nonSplitIds: readonly NibPresetId[] = ["pencil-2b", "pencil-hb", "brush-pen", "marker"];
    for (const nibId of nonSplitIds) {
      const res = stepNibMechanics({ wearState: createInitialNibWearState(nibId), pressure: 0.9, tiltDeg: 35, stepDistanceMm: 5 });
      expect(res.tineSplitMm).toBe(0);
      expect(res.railroadingRisk).toBe(0);
      expect(res.effectiveStrokeWidthMm).toBeGreaterThan(0);
    }
  });

  it("4. 연필 2B는 HB보다 빠르게 마모되며, 펜대를 눕힐수록 음영 접촉 폭과 면적이 확대된다", () => {
    const worn2b = simulateWritingDistance(createInitialNibWearState("pencil-2b"), 25, 50, { pressure: 0.65, tiltDeg: 40, azimuthDeg: 45 });
    const wornHb = simulateWritingDistance(createInitialNibWearState("pencil-hb"), 25, 50, { pressure: 0.65, tiltDeg: 40, azimuthDeg: 45 });
    expect(worn2b.centerTipWearUm).toBeGreaterThan(wornHb.centerTipWearUm * 1.6);
    expect(worn2b.flatSpotMm).toBeGreaterThan(wornHb.flatSpotMm);

    const upright = stepNibMechanics({ wearState: worn2b, pressure: 0.6, tiltDeg: 8, stepDistanceMm: 0 });
    const tilted = stepNibMechanics({ wearState: worn2b, pressure: 0.6, tiltDeg: 65, stepDistanceMm: 0 });
    expect(tilted.effectiveStrokeWidthMm).toBeGreaterThan(upright.effectiveStrokeWidthMm * 1.4);
    expect(tilted.contactAreaMm2).toBeGreaterThan(upright.contactAreaMm2 * 2);
  });

  it("5. 붓펜은 급격한 필압 해제 시 점탄성 복원 지연(springHysteresisLagMm)을 보이고 시간이 지나면 수렴한다", () => {
    const pressed = stepNibMechanics({ wearState: createInitialNibWearState("brush-pen"), pressure: 0.95, tiltDeg: 30, stepDistanceMm: 4, dtMs: 120 });
    const immediate = stepNibMechanics({ wearState: pressed.nextWearState, pressure: 0.1, tiltDeg: 30, stepDistanceMm: 2, dtMs: 6, previousBodySplayMm: pressed.bodySplayMm });
    const settled = stepNibMechanics({ wearState: pressed.nextWearState, pressure: 0.1, tiltDeg: 30, stepDistanceMm: 2, dtMs: 120, previousBodySplayMm: pressed.bodySplayMm });
    expect(immediate.springHysteresisLagMm).toBeGreaterThan(0.5);
    expect(immediate.bodySplayMm).toBeGreaterThan(settled.bodySplayMm * 2);
    expect(settled.springHysteresisLagMm).toBeLessThan(immediate.springHysteresisLagMm * 0.15);
  });

  it("6. 100m 기울임 필기 누적 시 G펜에 비대칭 편마모와 과도 마모가 축적되고, 적응형 자동 보정이 이를 복원한다", () => {
    const after100m = simulateWritingDistance(createInitialNibWearState("g-pen"), 100, 200, {
      pressure: 0.72,
      tiltDeg: 42,
      azimuthDeg: 30,
      paperAbrasiveness: 1.35,
    });

    expect(after100m.cumulativeDistanceMm).toBeCloseTo(100 * MM_PER_METER, 1);
    expect(after100m.rightTineWearUm).toBeGreaterThan(after100m.leftTineWearUm * 1.4);
    expect(after100m.asymmetryBias).toBeGreaterThan(0.2);
    expect(after100m.flatSpotMm).toBeGreaterThan(0.15);
    expect(after100m.overWearSeverity).toBeGreaterThan(0.45);

    const healed = compensateAdaptiveNibWear(after100m, { mode: "auto-heal" });
    expect(healed.compensationApplied).toBe(true);
    expect(Math.abs(healed.compensatedState.asymmetryBias)).toBeLessThan(Math.abs(after100m.asymmetryBias) * 0.25);
    expect(healed.compensatedState.overWearSeverity).toBeLessThan(after100m.overWearSeverity * 0.25);
    expect(healed.compensatedState.flatSpotMm).toBeLessThan(after100m.flatSpotMm);
    expect(healed.asymmetryReducedBy).toBeGreaterThan(0.25);
    expect(healed.flatSpotRecoveredMm).toBeGreaterThan(0.05);
    expect(healed.tineBalanceOffset).toBeLessThan(0);
  });

  it("7. 직립 필기(tiltDeg=0)는 대칭 마모를 만들고, 반대 방위각(30° vs 210°)은 반대 부호 편마모를 만든다", () => {
    const upright = simulateWritingDistance(createInitialNibWearState("g-pen"), 30, 60, { pressure: 0.65, tiltDeg: 0, azimuthDeg: 30 });
    expect(Math.abs(upright.asymmetryBias)).toBeLessThan(1e-6);
    expect(upright.leftTineWearUm).toBeCloseTo(upright.rightTineWearUm, 6);

    const rightTilted = simulateWritingDistance(createInitialNibWearState("g-pen"), 30, 60, { pressure: 0.65, tiltDeg: 40, azimuthDeg: 30 });
    const leftTilted = simulateWritingDistance(createInitialNibWearState("g-pen"), 30, 60, { pressure: 0.65, tiltDeg: 40, azimuthDeg: 210 });
    expect(rightTilted.asymmetryBias).toBeGreaterThan(0.18);
    expect(leftTilted.asymmetryBias).toBeLessThan(-0.18);
    expect(rightTilted.asymmetryBias).toBeCloseTo(-leftTilted.asymmetryBias, 5);
  });

  it("8. 밀어 긋기(push stroke)는 당겨 긋기(pull stroke)보다 금속 펜촉 걸림(scratchSnagFactor)이 크게 발생한다", () => {
    const freshMaru = createInitialNibWearState("maru-pen");
    const pushStroke = stepNibMechanics({ wearState: freshMaru, pressure: 0.65, tiltDeg: 38, azimuthDeg: 45, strokeDirectionDeg: 225, stepDistanceMm: 5 });
    const pullStroke = stepNibMechanics({ wearState: freshMaru, pressure: 0.65, tiltDeg: 38, azimuthDeg: 45, strokeDirectionDeg: 45, stepDistanceMm: 5 });
    expect(pushStroke.scratchSnagFactor).toBeGreaterThan(pullStroke.scratchSnagFactor * 2);
  });

  it("9. G펜이 과도 편마모 + 고필압 상태이면 레일로딩 위험도와 좌우 슬릿 비대칭 변위가 증가한다", () => {
    const fresh = createInitialNibWearState("g-pen");
    const overWorn = simulateWritingDistance(fresh, 100, 120, { pressure: 0.78, tiltDeg: 45, azimuthDeg: 20, paperAbrasiveness: 1.5 });
    const freshHighP = stepNibMechanics({ wearState: fresh, pressure: 0.92, tiltDeg: 25, azimuthDeg: 20, stepDistanceMm: 0, dtMs: 60 });
    const wornHighP = stepNibMechanics({ wearState: overWorn, pressure: 0.92, tiltDeg: 25, azimuthDeg: 20, stepDistanceMm: 0, dtMs: 60 });
    expect(wornHighP.railroadingRisk).toBeGreaterThan(freshHighP.railroadingRisk + 0.15);
    expect(wornHighP.rightTineDeflectionMm).toBeGreaterThan(wornHighP.leftTineDeflectionMm);
  });

  it("10. 작가 취향 '길들여진 펜촉' 프리셋 잠금 후 50m를 더 그려도 마모 드리프트가 0으로 고정된다", () => {
    const sweetSpot = simulateWritingDistance(createInitialNibWearState("g-pen"), 20, 40, { pressure: 0.55, tiltDeg: 30, azimuthDeg: 40 });
    const lockResult = compensateAdaptiveNibWear(sweetSpot, {
      mode: "lock-broken-in",
      presetId: "artist-sweet-gpen",
      presetLabelKo: "내 손에 길든 G펜",
    });

    expect(lockResult.lockedPreset).not.toBeNull();
    expect(lockResult.compensatedState.wearProfilePresetLocked).toBe(true);
    expect(lockResult.compensatedState.lockedSnapshotId).toBe("artist-sweet-gpen");

    let current = lockResult.compensatedState;
    for (let i = 0; i < 50; i += 1) {
      const step = stepNibMechanics({
        wearState: current,
        pressure: 0.9,
        tiltDeg: 45,
        azimuthDeg: 20,
        stepDistanceMm: 1_000,
        paperAbrasiveness: 2.0,
        lockedPreset: lockResult.lockedPreset,
      });
      expect(step.effectiveWearDeltaUm).toBe(0);
      current = step.nextWearState;
    }
    expect(current.leftTineWearUm).toBe(lockResult.compensatedState.leftTineWearUm);
    expect(current.rightTineWearUm).toBe(lockResult.compensatedState.rightTineWearUm);
    expect(current.asymmetryBias).toBe(lockResult.compensatedState.asymmetryBias);
    expect(current.cumulativeDistanceMm).toBe(lockResult.compensatedState.cumulativeDistanceMm);
  });

  it("11. factory-reset, 허용 범위 내 auto-heal 무개입, lockBrokenInNibPreset 헬퍼 동작이 정확하다", () => {
    const slightlyUsed = simulateWritingDistance(createInitialNibWearState("g-pen"), 6, 20, { pressure: 0.45, tiltDeg: 18, azimuthDeg: 45 });
    const noOpHeal = compensateAdaptiveNibWear(slightlyUsed, { mode: "auto-heal" });
    expect(noOpHeal.compensationApplied).toBe(false);
    expect(noOpHeal.compensatedState).toEqual(slightlyUsed);

    const reset = compensateAdaptiveNibWear(slightlyUsed, { mode: "factory-reset" });
    expect(reset.compensationApplied).toBe(true);
    expect(reset.compensatedState.cumulativeDistanceMm).toBe(0);
    expect(reset.compensatedState.flatSpotMm).toBe(0);

    const directPreset = lockBrokenInNibPreset(slightlyUsed, "direct-lock", "직접 잠금", 0.5);
    expect(directPreset.lockedState.wearProfilePresetLocked).toBe(true);
    expect(Math.abs(directPreset.lockedState.asymmetryBias)).toBeLessThanOrEqual(Math.abs(slightlyUsed.asymmetryBias) + 1e-9);
  });
});

describe("Wave 60: 종이 미세 3D 섬유 마찰(Coulomb-Stribeck) 및 모세관 잉크 번짐/건필 스킵 커널", () => {
  it("12. 5종 원지 3D 섬유 높이장은 결정론적이며, 단위 표면 법선과 거칠기 순서가 물리적으로 일치한다", () => {
    const papers = listPaperSubstrateIds();
    expect(papers).toEqual(["kent-smooth", "comic-manuscript", "watercolor-cold-press", "watercolor-rough", "hanji-mulberry"]);

    const meanHeightUm: Record<PaperSubstrateId, number> = {
      "kent-smooth": 0,
      "comic-manuscript": 0,
      "watercolor-cold-press": 0,
      "watercolor-rough": 0,
      "hanji-mulberry": 0,
    };

    for (const paperId of papers) {
      const a = samplePaperFiberHeightField(paperId, 12.4, 8.75, 60);
      expect(a).toEqual(samplePaperFiberHeightField(paperId, 12.4, 8.75, 60));
      expect(Math.hypot(a.surfaceNormal.x, a.surfaceNormal.y, a.surfaceNormal.z)).toBeCloseTo(1, 6);
      expect(a.surfaceNormal.z).toBeGreaterThan(0.8);

      let sum = 0;
      for (let i = 0; i < 40; i += 1) sum += samplePaperFiberHeightField(paperId, i * 0.73, i * 0.41, 60).heightUm;
      meanHeightUm[paperId] = sum / 40;
    }

    expect(meanHeightUm["kent-smooth"]).toBeLessThan(meanHeightUm["comic-manuscript"]);
    expect(meanHeightUm["comic-manuscript"]).toBeLessThan(meanHeightUm["watercolor-cold-press"]);
    expect(meanHeightUm["watercolor-cold-press"]).toBeLessThan(meanHeightUm["watercolor-rough"]);
  });

  it("13. 수채화 황목은 켄트지 대비 마찰 계수·마찰력·마찰 전력·스틱-슬립 강도가 훨씬 크다", () => {
    const common = { xMm: 15.2, yMm: 9.8, velocityXMmPerSec: 32, velocityYMmPerSec: 12, pressure: 0.6 };
    const kent = evaluatePaperMicroContact({ ...common, paperId: "kent-smooth" });
    const rough = evaluatePaperMicroContact({ ...common, paperId: "watercolor-rough" });

    expect(rough.effectiveFrictionCoefficient).toBeGreaterThan(kent.effectiveFrictionCoefficient * 2.2);
    expect(rough.frictionForceN).toBeGreaterThan(kent.frictionForceN * 2.2);
    expect(rough.frictionPowerMw).toBeGreaterThan(kent.frictionPowerMw * 2.2);
    expect(rough.stickSlipIntensity).toBeGreaterThan(kent.stickSlipIntensity * 2.5);
  });

  it("14. Coulomb-Stribeck 마찰 곡선은 정지→전이→운동 구간으로 갈수록 마찰 계수가 감소하며 상태를 전환한다", () => {
    const staticSample = evaluatePaperMicroContact({ paperId: "watercolor-cold-press", xMm: 5, yMm: 5, velocityXMmPerSec: 0.5, velocityYMmPerSec: 0, pressure: 0.55 });
    const transitionSample = evaluatePaperMicroContact({ paperId: "watercolor-cold-press", xMm: 5, yMm: 5, velocityXMmPerSec: 18, velocityYMmPerSec: 0, pressure: 0.55 });
    const kineticSample = evaluatePaperMicroContact({ paperId: "watercolor-cold-press", xMm: 5, yMm: 5, velocityXMmPerSec: 160, velocityYMmPerSec: 0, pressure: 0.55 });

    expect(staticSample.frictionRegime).toBe("static-stick");
    expect(transitionSample.frictionRegime).toBe("stribeck-transition");
    expect(kineticSample.frictionRegime).toBe("kinetic-glide");
    expect(staticSample.effectiveFrictionCoefficient).toBeGreaterThan(transitionSample.effectiveFrictionCoefficient);
    expect(transitionSample.effectiveFrictionCoefficient).toBeGreaterThan(kineticSample.effectiveFrictionCoefficient);
  });

  it("15. 고속·저필압 스트로크에서 수채화 황목은 켄트지보다 건필 튐(toothSkipRatio / dryBrushSkipFactor)이 극적으로 높다", () => {
    const kentFastLight = evaluatePaperMicroContact({ paperId: "kent-smooth", xMm: 22.1, yMm: 14.3, velocityXMmPerSec: 280, velocityYMmPerSec: 40, pressure: 0.16 });
    const roughFastLight = evaluatePaperMicroContact({ paperId: "watercolor-rough", xMm: 22.1, yMm: 14.3, velocityXMmPerSec: 280, velocityYMmPerSec: 40, pressure: 0.16 });
    const roughSlowHeavy = evaluatePaperMicroContact({ paperId: "watercolor-rough", xMm: 22.1, yMm: 14.3, velocityXMmPerSec: 14, velocityYMmPerSec: 0, pressure: 0.88 });

    expect(roughFastLight.toothSkipRatio).toBeGreaterThan(kentFastLight.toothSkipRatio * 4);
    expect(roughFastLight.toothSkipRatio).toBeGreaterThan(roughSlowHeavy.toothSkipRatio * 2.5);

    const roughInk = computeCapillaryInkTransfer({ contact: roughFastLight, pressure: 0.16, inkLoad: 0.45 });
    const kentInk = computeCapillaryInkTransfer({ contact: kentFastLight, pressure: 0.16, inkLoad: 0.45 });
    expect(roughInk.dryBrushSkipFactor).toBeGreaterThan(kentInk.dryBrushSkipFactor * 2.2);
    expect(roughInk.inkDepositionDensity).toBeLessThan(kentInk.inkDepositionDensity);
  });

  it("16. 저속·고필압 조건에서는 체류 시간과 유량이 늘어 잉크 모세관 번짐(capillaryBleedRadiusMm)이 크게 증가한다", () => {
    const slowHeavy = evaluatePaperMicroContact({ paperId: "watercolor-cold-press", xMm: 8.4, yMm: 11.2, velocityXMmPerSec: 12, velocityYMmPerSec: 0, pressure: 0.9 });
    const fastLight = evaluatePaperMicroContact({ paperId: "watercolor-cold-press", xMm: 8.4, yMm: 11.2, velocityXMmPerSec: 240, velocityYMmPerSec: 0, pressure: 0.25 });

    const slowInk = computeCapillaryInkTransfer({ contact: slowHeavy, pressure: 0.9, tineSplitMm: 0.95, strokeWidthMm: 1.1, inkLoad: 0.92 });
    const fastInk = computeCapillaryInkTransfer({ contact: fastLight, pressure: 0.25, tineSplitMm: 0.1, strokeWidthMm: 0.25, inkLoad: 0.92 });

    expect(slowInk.dwellTimeMs).toBeGreaterThan(fastInk.dwellTimeMs * 10);
    expect(slowInk.capillaryBleedRadiusMm).toBeGreaterThan(fastInk.capillaryBleedRadiusMm * 4);
    expect(slowInk.inkDepositionDensity).toBeGreaterThan(fastInk.inkDepositionDensity);
  });

  it("17. 전통 한지는 만화 원고지보다 모세관 번짐·섬유 방향 이방성이 현저히 높고, 만화 원고지는 높은 선명도를 유지한다", () => {
    const hanjiContact = evaluatePaperMicroContact({ paperId: "hanji-mulberry", xMm: 10, yMm: 10, velocityXMmPerSec: 25, velocityYMmPerSec: 0, pressure: 0.7 });
    const comicContact = evaluatePaperMicroContact({ paperId: "comic-manuscript", xMm: 10, yMm: 10, velocityXMmPerSec: 25, velocityYMmPerSec: 0, pressure: 0.7 });

    const hanjiInk = computeCapillaryInkTransfer({ contact: hanjiContact, pressure: 0.7, tineSplitMm: 0.4, inkLoad: 0.9 });
    const comicInk = computeCapillaryInkTransfer({ contact: comicContact, pressure: 0.7, tineSplitMm: 0.4, inkLoad: 0.9 });

    expect(hanjiInk.capillaryBleedRadiusMm).toBeGreaterThan(comicInk.capillaryBleedRadiusMm * 5);
    expect(hanjiInk.bleedAnisotropyRatio).toBeGreaterThan(1.7);
    expect(hanjiInk.alongFiberBleedMm).toBeGreaterThan(hanjiInk.crossFiberBleedMm * 1.5);
    expect(comicInk.edgeCrispness).toBeGreaterThan(0.85);
    expect(comicInk.edgeCrispness).toBeGreaterThan(hanjiInk.edgeCrispness);
  });

  it("18. 잉크 잔량(inkLoad) 감소는 건필 튐을 악화시키고, 수채화 매체는 황목 계곡에 강한 안료 고임(valleyPoolingIndex)을 형성한다", () => {
    let deepestX = 0;
    let deepestDepth = -1;
    for (let i = 0; i < 60; i += 1) {
      const s = samplePaperFiberHeightField("watercolor-rough", i * 0.25, 3.5, 60);
      if (s.localValleyDepthUm > deepestDepth) {
        deepestDepth = s.localValleyDepthUm;
        deepestX = i * 0.25;
      }
    }

    const valleyContact = evaluatePaperMicroContact({ paperId: "watercolor-rough", xMm: deepestX, yMm: 3.5, velocityXMmPerSec: 28, velocityYMmPerSec: 0, pressure: 0.6 });
    const wetWatercolor = computeCapillaryInkTransfer({ contact: valleyContact, pressure: 0.6, mediumKind: "watercolor", inkLoad: 0.95 });
    const starvedInk = computeCapillaryInkTransfer({ contact: valleyContact, pressure: 0.6, mediumKind: "liquid-ink", inkLoad: 0.15 });
    const dryGraphite = computeCapillaryInkTransfer({ contact: valleyContact, pressure: 0.6, mediumKind: "graphite-dry", inkLoad: 0.9 });

    expect(wetWatercolor.valleyPoolingIndex).toBeGreaterThan(0.35);
    expect(starvedInk.dryBrushSkipFactor).toBeGreaterThan(wetWatercolor.dryBrushSkipFactor + 0.25);
    expect(dryGraphite.capillaryBleedRadiusMm).toBe(0);
    expect(dryGraphite.dryingTimeSec).toBe(0);
  });
});

describe("Wave 60: 촉각 진동(Web Haptics)·프로시저럴 사각사각 필기음 공명 합성기 및 개인 필압 캘리브레이션", () => {
  it("19. 스트로크 속도가 증가할수록 촉각 반송 주파수·마찰 대역통과 중심 주파수·트랜지언트 빈도·스펙트럼 중심이 단조 상승한다", () => {
    const speeds = [10, 55, 160, 380];
    const results = speeds.map((speed) => {
      const contact = evaluatePaperMicroContact({ paperId: "comic-manuscript", xMm: 14, yMm: 12, velocityXMmPerSec: speed, velocityYMmPerSec: 0, pressure: 0.55 });
      return synthesizeTactileStrokeFeedback({ nibId: "g-pen", contact, pressure: 0.55, scratchSnagFactor: 0.25, tineSplitMm: 0.35 });
    });

    for (let i = 0; i < results.length; i += 1) {
      expect(results[i].haptics.enabled).toBe(true);
      expect(results[i].haptics.carrierFrequencyHz).toBeGreaterThanOrEqual(MIN_HAPTIC_CARRIER_HZ);
      expect(results[i].haptics.carrierFrequencyHz).toBeLessThanOrEqual(MAX_HAPTIC_CARRIER_HZ);
      expect(results[i].acoustic.bandpassCenterHz).toBeGreaterThanOrEqual(MIN_FRICTION_BANDPASS_HZ);
      expect(results[i].acoustic.bandpassCenterHz).toBeLessThanOrEqual(MAX_FRICTION_BANDPASS_HZ);
      expect(results[i].acoustic.frictionNoiseGain).toBeLessThanOrEqual(MAX_TACTILE_AUDIO_GAIN_LINEAR);
      if (i > 0) {
        expect(results[i].haptics.carrierFrequencyHz).toBeGreaterThan(results[i - 1].haptics.carrierFrequencyHz);
        expect(results[i].acoustic.bandpassCenterHz).toBeGreaterThan(results[i - 1].acoustic.bandpassCenterHz);
        expect(results[i].acoustic.grainTransientRateHz).toBeGreaterThan(results[i - 1].acoustic.grainTransientRateHz);
        expect(results[i].acoustic.spectralCentroidHz).toBeGreaterThan(results[i - 1].acoustic.spectralCentroidHz);
      }
    }
  });

  it("20. 켄트지 vs 수채화 황목 및 G펜 vs 마커 간 촉각 엔벨로프·공명 주파수·트랜지언트 특성이 명확히 구분된다", () => {
    const kentContact = evaluatePaperMicroContact({ paperId: "kent-smooth", xMm: 6, yMm: 6, velocityXMmPerSec: 120, velocityYMmPerSec: 0, pressure: 0.45 });
    const roughContact = evaluatePaperMicroContact({ paperId: "watercolor-rough", xMm: 6, yMm: 6, velocityXMmPerSec: 120, velocityYMmPerSec: 0, pressure: 0.25 });

    const gPenKent = synthesizeTactileStrokeFeedback({ nibId: "g-pen", contact: kentContact, pressure: 0.45, scratchSnagFactor: 0.15 });
    const markerKent = synthesizeTactileStrokeFeedback({ nibId: "marker", contact: kentContact, pressure: 0.45, scratchSnagFactor: 0.05 });
    const pencilRough = synthesizeTactileStrokeFeedback({ nibId: "pencil-2b", contact: roughContact, pressure: 0.25, scratchSnagFactor: 0.2 });

    expect(gPenKent.acoustic.nibResonanceHz).toBeGreaterThan(markerKent.acoustic.nibResonanceHz * 2.5);
    expect(gPenKent.acoustic.bandpassQ).toBeGreaterThan(markerKent.acoustic.bandpassQ * 1.8);
    expect(pencilRough.acoustic.grainTransientGain).toBeGreaterThan(gPenKent.acoustic.grainTransientGain * 1.5);
    expect(pencilRough.haptics.textureEnvelope).toBe("heavy-grit");
    expect(pencilRough.haptics.webVibratePatternMs.length).toBe(5);
    expect(pencilRough.haptics.webVibratePatternMs.every((ms) => Number.isInteger(ms) && ms >= 2)).toBe(true);
  });

  it("21. 음소거(audioEnabled=false)·접근성 동작 감소(prefersReducedMotion=true)·호버(pressure=0) 시 즉시 안전 차단된다", () => {
    const contact = evaluatePaperMicroContact({ paperId: "watercolor-rough", xMm: 4, yMm: 4, velocityXMmPerSec: 90, velocityYMmPerSec: 0, pressure: 0.7 });
    const muted = synthesizeTactileStrokeFeedback({ nibId: "g-pen", contact, pressure: 0.7, audioEnabled: false, prefersReducedMotion: true });

    expect(muted.acoustic.muted).toBe(true);
    expect(muted.acoustic.frictionNoiseGain).toBe(0);
    expect(muted.acoustic.nibResonanceGain).toBe(0);
    expect(muted.acoustic.grainTransientGain).toBe(0);
    expect(muted.acoustic.smoothingTimeConstantSec).toBe(0);
    expect(muted.haptics.enabled).toBe(false);
    expect(muted.haptics.amplitude).toBe(0);
    expect(muted.haptics.webVibratePatternMs).toEqual([]);
    expect(muted.haptics.textureEnvelope).toBe("silent");

    const hoverContact = evaluatePaperMicroContact({ paperId: "watercolor-rough", xMm: 4, yMm: 4, velocityXMmPerSec: 150, velocityYMmPerSec: 0, pressure: 0 });
    const hoverFeedback = synthesizeTactileStrokeFeedback({ nibId: "g-pen", contact: hoverContact, pressure: 0 });
    expect(hoverFeedback.haptics.enabled).toBe(false);
    expect(hoverFeedback.acoustic.muted).toBe(true);
    expect(hoverFeedback.normalizedFrictionEnergy).toBe(0);
  });

  it("22. 개인 손힘 캘리브레이션 S-커브는 약필압·균형·강필압 및 노이즈/역전 표본에서도 전 구간 단조 증가를 보장한다", () => {
    const datasets = [
      { id: "feather", samples: [{ rawPressure: 0.05, intendedIntensity: 0.15 }, { rawPressure: 0.25, intendedIntensity: 0.52 }, { rawPressure: 0.58, intendedIntensity: 0.92 }] },
      { id: "balanced", samples: [{ rawPressure: 0.1, intendedIntensity: 0.12 }, { rawPressure: 0.5, intendedIntensity: 0.5 }, { rawPressure: 0.9, intendedIntensity: 0.92 }] },
      { id: "heavy", samples: [{ rawPressure: 0.25, intendedIntensity: 0.12 }, { rawPressure: 0.72, intendedIntensity: 0.48 }, { rawPressure: 0.98, intendedIntensity: 0.94 }] },
      { id: "noisy-inverted", samples: [{ rawPressure: 0.8, intendedIntensity: 0.2 }, { rawPressure: 0.3, intendedIntensity: 0.85 }, { rawPressure: 0.5, intendedIntensity: 0.4 }, { rawPressure: Number.NaN, intendedIntensity: 0.5 }] },
    ];

    for (const dataset of datasets) {
      const profile = calibratePersonalPressureCurve({ profileId: dataset.id, samples: dataset.samples, sCurveContrast: 0.55 });
      expect(profile.isMonotonic).toBe(true);
      expect(profile.lut.length).toBe(DEFAULT_PRESSURE_LUT_SIZE);
      expect(profile.lut[0]).toBe(0);
      expect(profile.lut[profile.lut.length - 1]).toBe(1);

      let prev = -1;
      for (let step = 0; step <= 200; step += 1) {
        const raw = step / 200;
        const val = profile.evaluate(raw);
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
        expect(val).toBeGreaterThanOrEqual(prev);
        expect(evaluateCalibratedPressure(profile, raw)).toBeCloseTo(val, 12);
        prev = val;
      }
    }
  });

  it("23. 약필압 작가 프로파일은 동일 원시 필압(0.45)에서 강필압 작가 프로파일보다 훨씬 높은 보정 출력을 낸다", () => {
    const feather = calibratePersonalPressureCurve({
      profileId: "feather-artist",
      samples: [{ rawPressure: 0.04, intendedIntensity: 0.15 }, { rawPressure: 0.24, intendedIntensity: 0.5 }, { rawPressure: 0.62, intendedIntensity: 0.95 }],
    });
    const heavy = calibratePersonalPressureCurve({
      profileId: "heavy-artist",
      samples: [{ rawPressure: 0.22, intendedIntensity: 0.1 }, { rawPressure: 0.74, intendedIntensity: 0.5 }, { rawPressure: 0.98, intendedIntensity: 0.95 }],
    });

    expect(feather.handStrengthClass).toBe("feather-touch");
    expect(heavy.handStrengthClass).toBe("heavy-handed");
    expect(feather.evaluate(0.45)).toBeGreaterThan(0.75);
    expect(heavy.evaluate(0.45)).toBeLessThan(0.32);
    expect(feather.residualRmsError).toBeLessThan(0.12);
    expect(heavy.residualRmsError).toBeLessThan(0.12);
  });

  it("24. 빈 표본 캘리브레이션도 안전한 기본 균형 S-커브를 반환하며 단조성을 유지한다", () => {
    const fallback = calibratePersonalPressureCurve({ samples: [], lutSize: 33 });
    expect(fallback.handStrengthClass).toBe("balanced");
    expect(fallback.isMonotonic).toBe(true);
    expect(fallback.lut.length).toBe(33);
    expect(fallback.evaluate(0)).toBe(0);
    expect(fallback.evaluate(1)).toBe(1);
    expect(fallback.evaluate(0.5)).toBeGreaterThan(0.4);
    expect(fallback.evaluate(0.5)).toBeLessThan(0.6);
  });

  it("25. 통합 파이프라인(개인 필압 보정 → 펜촉 마모/슬릿 → 종이 마찰 → 모세관 잉크 → 촉각/필기음)이 일관되게 연동된다", () => {
    const curve = calibratePersonalPressureCurve({
      samples: [{ rawPressure: 0.08, intendedIntensity: 0.15 }, { rawPressure: 0.42, intendedIntensity: 0.52 }, { rawPressure: 0.85, intendedIntensity: 0.94 }],
    });
    const paperSpec = getPaperSubstrateSpec("watercolor-cold-press");
    const calibratedP = curve.evaluate(0.58);

    const nibStep = stepNibMechanics({
      wearState: createInitialNibWearState("g-pen"),
      pressure: calibratedP,
      tiltDeg: 32,
      azimuthDeg: 45,
      strokeDirectionDeg: 180,
      stepDistanceMm: 6.5,
      dtMs: 16,
      paperAbrasiveness: paperSpec.abrasivenessFactor,
    });
    const contact = evaluatePaperMicroContact({
      paperId: "watercolor-cold-press",
      xMm: 31.2,
      yMm: 18.6,
      velocityXMmPerSec: 85,
      velocityYMmPerSec: -20,
      pressure: calibratedP,
      nibContactRadiusMm: nibStep.effectiveStrokeWidthMm * 0.5,
      nibWearRoughness: nibStep.scratchSnagFactor,
    });
    const ink = computeCapillaryInkTransfer({
      contact,
      pressure: calibratedP,
      tineSplitMm: nibStep.tineSplitMm,
      strokeWidthMm: nibStep.effectiveStrokeWidthMm,
      inkLoad: 0.88,
    });
    const tactile = synthesizeTactileStrokeFeedback({
      nibId: "g-pen",
      contact,
      pressure: calibratedP,
      scratchSnagFactor: nibStep.scratchSnagFactor,
      tineSplitMm: nibStep.tineSplitMm,
      normalizedCanvasX: 0.35,
    });

    expect(nibStep.tineSplitMm).toBeGreaterThan(0.2);
    expect(contact.frictionPowerMw).toBeGreaterThan(20);
    expect(ink.inkFlowRateNlPerSec).toBeGreaterThan(15);
    expect(ink.capillaryBleedRadiusMm).toBeGreaterThan(0.05);
    expect(tactile.haptics.enabled).toBe(true);
    expect(tactile.acoustic.muted).toBe(false);
    expect(tactile.acoustic.stereoPan).toBeCloseTo(0.35, 6);
  });

  it("26. NaN·Infinity·음수 등 비정상 경계 입력에도 모든 커널이 유한하고 안전한 값을 반환한다", () => {
    const nibRes = stepNibMechanics({
      wearState: createInitialNibWearState("g-pen"),
      pressure: Number.NaN,
      tiltDeg: Number.POSITIVE_INFINITY,
      azimuthDeg: Number.NEGATIVE_INFINITY,
      stepDistanceMm: -50,
      dtMs: Number.NaN,
      paperAbrasiveness: -10,
    });
    expect(Number.isFinite(nibRes.tineSplitMm)).toBe(true);
    expect(nibRes.tineSplitMm).toBe(0);

    const contact = evaluatePaperMicroContact({
      paperId: "hanji-mulberry",
      xMm: Number.NaN,
      yMm: Number.POSITIVE_INFINITY,
      velocityXMmPerSec: Number.NaN,
      velocityYMmPerSec: Number.NEGATIVE_INFINITY,
      pressure: 1.8,
    });
    expect(Number.isFinite(contact.frictionForceN)).toBe(true);
    expect(contact.relief.surfaceNormal.z).toBeGreaterThan(0);

    const ink = computeCapillaryInkTransfer({ contact, pressure: 1.8, inkViscosityMpaS: -5, inkLoad: Number.NaN });
    expect(Number.isFinite(ink.capillaryBleedRadiusMm)).toBe(true);
    expect(Number.isFinite(ink.edgeCrispness)).toBe(true);

    const feedback = synthesizeTactileStrokeFeedback({ nibId: "g-pen", contact, pressure: 1.8, normalizedCanvasX: Number.POSITIVE_INFINITY });
    expect(Number.isFinite(feedback.haptics.amplitude)).toBe(true);
    expect(Number.isFinite(feedback.acoustic.bandpassCenterHz)).toBe(true);
  });
});
