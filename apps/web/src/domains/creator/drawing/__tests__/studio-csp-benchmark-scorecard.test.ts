import { describe, expect, it } from "vitest";

import {
  CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY,
  evaluateStudioCspBenchmarkScorecard,
  measureLivePigmentEngineBenchmark,
  measureMagmaAndKlekiEngineBenchmark,
  resolveStudioDeviceFormFactor,
} from "../studio-csp-benchmark-scorecard";
import { measureProcreateSilicaEngineBenchmark } from "../studio-procreate-silica-codecs";
import { measureUniversalBrushTaxonomyEngineBenchmark } from "../studio-universal-brush-taxonomy-engine";

describe("studio-csp-benchmark-scorecard (클립스튜디오 대비 2배 우위 검증)", () => {
  it("뷰포트 폭과 포인터 특성에 따라 데스크톱·태블릿·모바일(compact) 폼팩터를 판별한다", () => {
    expect(resolveStudioDeviceFormFactor(1440, false)).toBe("desktop");
    expect(resolveStudioDeviceFormFactor(1024, false)).toBe("tablet");
    expect(resolveStudioDeviceFormFactor(1366, true)).toBe("tablet");
    expect(resolveStudioDeviceFormFactor(390, true)).toBe("compact");
  });

  it("실시간 잠재 안료 혼합 벤치마크가 선형 평균 대비 2배 이상의 녹색 채도 보존과 캐시 히트율 및 6-DoF 배럴 롤 대비를 기록한다", () => {
    const pigment = measureLivePigmentEngineBenchmark();
    expect(pigment.greenChromaGainOverLinear).toBeGreaterThanOrEqual(2.0);
    expect(pigment.cacheHitRateAfterWarmup).toBeGreaterThan(0.7);
    expect(pigment.impastoSpecularContrastRatio).toBeGreaterThanOrEqual(2.15);
    expect(pigment.glazeOpticalDepthSteps).toBeGreaterThanOrEqual(5);
    expect(pigment.stylusTiltBroadeningRatio).toBeGreaterThan(1.4);
    expect(pigment.barrelRollCalligraphicContrast).toBeGreaterThanOrEqual(3.5);
  });

  it("데스크톱·태블릿·모바일 모든 기기 프로파일과 5대 경쟁사(CSP/Procreate/Rebelle 7/PaintStorm/Krita) 대비 2.0배 이상을 달성한다", () => {
    for (const deviceFormFactor of ["desktop", "tablet", "compact"] as const) {
      const scorecard = evaluateStudioCspBenchmarkScorecard({
        deviceFormFactor,
        strokeWidthPx: 24,
        brushOpacity: 0.9,
        stabilizerLevel: 4,
        wetMixEnabled: true,
        grainDepth: 0.72,
        bristleCount: 32,
        colorMixingMode: "latent-pigment",
      });

      expect(scorecard.performanceRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.qualityRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.featureRatio).toBeGreaterThanOrEqual(2.4);
      expect(scorecard.compositeRatio).toBeGreaterThanOrEqual(2.0);
      expect(scorecard.meetsTwoXTarget).toBe(true);
      expect(scorecard.internalizedEngines).toHaveLength(5);
      expect(scorecard.competitorComparisons).toHaveLength(5);
      for (const comp of scorecard.competitorComparisons) {
        expect(comp.exceedsTarget).toBe(true);
        expect(comp.superiorityRatio).toBeGreaterThanOrEqual(2.0);
      }
      expect(
        scorecard.performanceMetrics.some(
          (metric) => metric.id === "realtime-sync-delta-compression",
        ),
      ).toBe(true);
      expect(
        scorecard.qualityMetrics.some(
          (metric) => metric.id === "dip-pen-railroad-clumping-chromatography",
        ),
      ).toBe(true);
      expect(
        scorecard.qualityMetrics.some(
          (metric) => metric.id === "screentone-sdf-oklab-gradient-fidelity",
        ),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some((metric) => metric.id === "stylus-tilt-dual-brush-engine"),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some(
          (metric) => metric.id === "expressive-brush-personality-diversity",
        ),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some(
          (metric) => metric.id === "vector-ruler-fisheye-timelapse-suite",
        ),
      ).toBe(true);
      expect(
        scorecard.featureMetrics.some(
          (metric) => metric.id === "magma-kleki-anisotropic-reservoir-csl-suite",
        ),
      ).toBe(true);
      expect(scorecard.webCompetitorComparisons).toHaveLength(4);
      for (const webComp of scorecard.webCompetitorComparisons) {
        expect(webComp.exceedsTarget).toBe(true);
        expect(webComp.superiorityRatio).toBeGreaterThanOrEqual(2.0);
      }
    }

    const magmaKlekiBench = measureMagmaAndKlekiEngineBenchmark();
    expect(magmaKlekiBench.magmaPresetCount).toBe(19);
    expect(magmaKlekiBench.vineTiltExpansionRatio).toBeGreaterThan(2.0);
    expect(magmaKlekiBench.wireHeaderCompressionRatio).toBeGreaterThan(15);
    expect(magmaKlekiBench.klekiSketchyWebLinkRatio).toBeGreaterThan(0);

    const procreateBench = measureProcreateSilicaEngineBenchmark();
    expect(procreateBench.procreateBrushSetCount).toBe(18);
    expect(procreateBench.procreatePresetCount).toBeGreaterThanOrEqual(24);
    expect(procreateBench.vineCharcoalTiltExpansionRatio).toBeGreaterThan(1.8);
    expect(procreateBench.hoverAltitudeFootprintRatio).toBeGreaterThan(1.1);

    const universalBench = measureUniversalBrushTaxonomyEngineBenchmark();
    expect(universalBench.reaEvidenceTargetCount).toBe(14);
    expect(universalBench.wave22ReaEvidenceTargetCount).toBe(4);
    expect(universalBench.wave23ReaSemanticTargetCount).toBe(4);
    expect(universalBench.harmonyBrushKindCount).toBe(11);
    expect(universalBench.p5BrushPresetCount).toBe(11);
    expect(universalBench.p5BrushVectorFieldCount).toBe(7);
    expect(universalBench.sketchpadBrushKindCount).toBe(18);
    expect(universalBench.ibisMediBangPresetCount).toBe(19);
    expect(universalBench.skeletalArtBrushPresetCount).toBe(8);
    expect(universalBench.fiveTilePatternPresetCount).toBe(8);
    expect(universalBench.corelParticlePresetCount).toBe(9);
    expect(universalBench.klecksPresetCount).toBe(10);
    expect(universalBench.schneiderFittedSegmentCount).toBeGreaterThanOrEqual(2);
    expect(universalBench.pomaxOffsetCuspCount).toBeGreaterThan(0);
    expect(universalBench.wickClosedGapCount).toBe(1);
    expect(universalBench.qrCodecRoundtripVerified).toBe(true);
  });

  it("REA로 역공학 검증된 Clip Studio Paint 5.1.5 아키텍처 기준선 요약을 제공한다", () => {
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.appVersion).toBe("5.1.5");
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.editImageToolNodeCount).toBe(255);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.editImageToolVariantColumnCount).toBe(507);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.brushShapePresetCount).toBe(14);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.mixPaletteToolCount).toBe(3);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.mixColorSetSwatchCount).toBe(13);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.modifyKeyRuleCount).toBe(84);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.toneDotShapeCount).toBe(22);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.rulerEngineCount).toBe(7);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.dessinDollV2BoneCount).toBe(56);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.handSetupCornerPoseCount).toBe(6);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.tgCxsPlugInExportedSymbolCount).toBe(7765);
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.filterPluginBundles).toContain(
      "FlowBasedAbstraction.bundle",
    );
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.filterPluginBundles).toContain(
      "PencilArtFilter.bundle",
    );
    expect(CSP_REA_VERIFIED_ARCHITECTURE_SUMMARY.filterPluginBundles).toContain(
      "TPPChromaticAberration.bundle",
    );
  });
});



