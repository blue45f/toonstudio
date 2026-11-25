// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DIRTY_RECT_TILE_PX,
  FRAME_BUDGET_120HZ_MS,
  FRAME_BUDGET_60HZ_MS,
  IMPASTO_LIGHT_AZIMUTH_DEG,
  IMPASTO_LIGHT_ELEVATION_DEG,
  MAX_BRISTLE_FILAMENTS,
  MIN_BRISTLE_FILAMENTS,
  PAPER_GRAIN_PRESETS,
  PAPER_GRAIN_TILE_SIZE,
  StudioTactileBrushTexturePanel,
  TACTILE_BRUSH_PRESETS,
  WET_EDGE_MAX_PCT,
  WET_EDGE_MIN_PCT,
  applyTactileBrushPreview,
  createTactileBrushSession,
  evaluateFrameBudgetPlan,
  evaluateTactileStampMetrics,
  exportTactileBrushRecipeJson,
  formatOklch,
  generatePaperGrainTileLut,
  getActiveTactileConfig,
  isVioletSlopHue,
  previewTactileBrushPatch,
  revertTactileBrushSession,
  samplePaperCrossSection,
  samplePaperGrainLut,
  sanitizeNonVioletHue,
  selectTactileBrushPreset,
  type PaperGrainId,
} from "./index";

afterEach(cleanup);

describe("1. 4종 절차적 종이 요철 64×64 하이트맵·법선 타일 LUT", () => {
  it("4종 종이 모두 64×64 Float32Array와 48KiB 메모리·정규화 범위·단위 법선을 생성한다", () => {
    const ids: readonly PaperGrainId[] = ["hanji", "kent", "cold-press", "linen-canvas"];
    expect(PAPER_GRAIN_PRESETS).toHaveLength(4);
    for (const id of ids) {
      const lut = generatePaperGrainTileLut(id);
      expect(lut.size).toBe(PAPER_GRAIN_TILE_SIZE);
      expect(lut.height).toBeInstanceOf(Float32Array);
      expect(lut.height).toHaveLength(4096);
      expect(lut.normalX).toHaveLength(4096);
      expect(lut.normalY).toHaveLength(4096);
      expect(lut.memoryBytes).toBe(4096 * 4 * 3);
      for (let i = 0; i < 4096; i += 64) {
        const h = lut.height[i] ?? -1;
        const nx = lut.normalX[i] ?? 2;
        const ny = lut.normalY[i] ?? 2;
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(1);
        expect(nx * nx + ny * ny).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("동일 종이 ID 반복 생성 시 비트 단위로 완전 결정론적이다", () => {
    const a = generatePaperGrainTileLut("cold-press");
    const b = generatePaperGrainTileLut("cold-press");
    expect(a.peakMean).toBe(b.peakMean);
    expect(a.peakStdDev).toBe(b.peakStdDev);
    expect(Array.from(a.height)).toEqual(Array.from(b.height));
    expect(Array.from(a.normalX)).toEqual(Array.from(b.normalX));
  });

  it("켄트지 미세 세목은 수채 황목 깊은 골보다 요철 편차와 깊은 골 비율이 낮다", () => {
    const kent = generatePaperGrainTileLut("kent");
    const coldPress = generatePaperGrainTileLut("cold-press");
    expect(kent.peakStdDev).toBeLessThan(coldPress.peakStdDev);
    expect(kent.valleyRatio).toBeLessThan(coldPress.valleyRatio);
    expect(coldPress.valleyRatio).toBeGreaterThan(0.18);
  });

  it("한지 장섬유 LUT는 뚜렷한 방향성 이방성을 유지한다", () => {
    const hanji = generatePaperGrainTileLut("hanji");
    expect(hanji.anisotropyRatio).toBeGreaterThan(1.3);
  });

  it("리넨 캔버스 LUT는 8px 날실·씨실 직조 주기를 일관되게 반영한다", () => {
    const linen = generatePaperGrainTileLut("linen-canvas");
    const p0 = samplePaperGrainLut(linen, 4, 4);
    const p1 = samplePaperGrainLut(linen, 20, 4);
    expect(Math.abs(p0.height - p1.height)).toBeLessThan(0.22);
    expect(linen.peakStdDev).toBeGreaterThan(0.14);
  });

  it("samplePaperGrainLut은 64px 주기 경계와 음수 좌표를 O(1) 래핑으로 정확히 조회한다", () => {
    const lut = generatePaperGrainTileLut("hanji");
    const base = samplePaperGrainLut(lut, 13, 27);
    const wrappedPos = samplePaperGrainLut(lut, 13 + 64 * 3, 27 + 64 * 2);
    const wrappedNeg = samplePaperGrainLut(lut, 13 - 64, 27 - 64 * 4);
    expect(wrappedPos).toEqual(base);
    expect(wrappedNeg).toEqual(base);
    expect(base.nx * base.nx + base.ny * base.ny + base.nz * base.nz).toBeCloseTo(1, 3);
  });

  it("samplePaperCrossSection은 지정 개수의 정규화 단면 포인트를 반환한다", () => {
    const lut = generatePaperGrainTileLut("cold-press");
    const pts = samplePaperCrossSection(lut, 20, 28);
    expect(pts).toHaveLength(28);
    expect(pts[0]?.u).toBe(0);
    expect(pts[pts.length - 1]?.u).toBe(1);
  });
});

describe("2. 하이트맵 종이 요철 투과 (Paper-Tooth Modulation)", () => {
  it("필압이 낮으면 봉우리만 스치고, 필압이 높으면 골짜기까지 안료가 스며든다", () => {
    const lut = generatePaperGrainTileLut("cold-press");
    const light = evaluateTactileStampMetrics({
      brushId: "charcoal-tooth",
      paperId: "cold-press",
      pressure: 0.18,
      lut,
    });
    const heavy = evaluateTactileStampMetrics({
      brushId: "charcoal-tooth",
      paperId: "cold-press",
      pressure: 0.96,
      lut,
    });
    expect(light.paperTooth.contactThreshold).toBeGreaterThan(heavy.paperTooth.contactThreshold);
    expect(light.paperTooth.peakCoverageRatio).toBeLessThan(heavy.paperTooth.peakCoverageRatio);
    expect(light.paperTooth.valleyPenetrationRatio).toBeLessThan(heavy.paperTooth.valleyPenetrationRatio);
  });

  it("paperToothStrength가 0이면 임계값이 0이 되어 전 영역에 안료가 균일 밀착한다", () => {
    const flat = evaluateTactileStampMetrics({
      brushId: "gpen-ink",
      paperId: "cold-press",
      controls: { paperToothStrength: 0 },
      pressure: 0.3,
    });
    expect(flat.paperTooth.contactThreshold).toBe(0);
    expect(flat.paperTooth.peakCoverageRatio).toBe(1);
    expect(flat.paperTooth.grainContrast).toBe(0);
  });

  it("동일 저필압에서 수채 황목이 켄트지보다 높은 요철 대비를 만든다", () => {
    const cold = evaluateTactileStampMetrics({
      brushId: "charcoal-tooth",
      paperId: "cold-press",
      pressure: 0.35,
    });
    const kent = evaluateTactileStampMetrics({
      brushId: "charcoal-tooth",
      paperId: "kent",
      pressure: 0.35,
    });
    expect(cold.paperTooth.grainContrast).toBeGreaterThan(kent.paperTooth.grainContrast);
  });

  it("목탄·4B 연필 프리셋은 저필압에서 평면 브러시 대비 높은 질감 풍부도를 기록한다", () => {
    const res = evaluateTactileStampMetrics({
      brushId: "charcoal-tooth",
      paperId: "cold-press",
    });
    expect(res.tactileRichnessScore).toBeGreaterThan(res.flatBaselineRichness + 20);
  });
});

describe("3. 멀티-필라멘트 분기 브리슬 (3~16가닥 갈필)", () => {
  it("모든 극한 파라미터 조합에서 raw/active 필라멘트 수가 3~16 범위로 보장된다", () => {
    const combos = [
      { brushId: "gpen-ink" as const, velocityPxPerSec: 0, tiltDeg: 0, inkLoad: 1, split: 0 },
      { brushId: "dry-sumi" as const, velocityPxPerSec: 3200, tiltDeg: 75, inkLoad: 0.05, split: 1 },
      { brushId: "impasto-oil" as const, velocityPxPerSec: 1800, tiltDeg: 60, inkLoad: 0.2, split: 1 },
    ];
    for (const c of combos) {
      const m = evaluateTactileStampMetrics({
        brushId: c.brushId,
        paperId: "hanji",
        velocityPxPerSec: c.velocityPxPerSec,
        tiltDeg: c.tiltDeg,
        inkLoad: c.inkLoad,
        controls: { dryBristleSplit: c.split },
      });
      expect(m.splitBristle.rawFilamentCount).toBeGreaterThanOrEqual(MIN_BRISTLE_FILAMENTS);
      expect(m.splitBristle.rawFilamentCount).toBeLessThanOrEqual(MAX_BRISTLE_FILAMENTS);
      expect(m.splitBristle.activeFilamentCount).toBeGreaterThanOrEqual(MIN_BRISTLE_FILAMENTS);
      expect(m.splitBristle.activeFilamentCount).toBeLessThanOrEqual(MAX_BRISTLE_FILAMENTS);
    }
  });

  it("갈필 먹붓에서 속도 증가와 잉크 감소가 건조도와 원본 갈필 가닥 수를 증가시킨다", () => {
    const slowWet = evaluateTactileStampMetrics({
      brushId: "dry-sumi",
      paperId: "hanji",
      velocityPxPerSec: 180,
      inkLoad: 0.92,
      performanceGuardEnabled: false,
    });
    const fastDry = evaluateTactileStampMetrics({
      brushId: "dry-sumi",
      paperId: "hanji",
      velocityPxPerSec: 1700,
      inkLoad: 0.14,
      performanceGuardEnabled: false,
    });
    expect(fastDry.splitBristle.drynessFactor).toBeGreaterThan(slowWet.splitBristle.drynessFactor);
    expect(fastDry.splitBristle.rawFilamentCount).toBeGreaterThan(slowWet.splitBristle.rawFilamentCount);
  });

  it("G펜 잉크는 낮은 건조도와 최소 범위 모발 수를 유지한다", () => {
    const gpen = evaluateTactileStampMetrics({ brushId: "gpen-ink", paperId: "kent" });
    expect(gpen.splitBristle.rawFilamentCount).toBeLessThanOrEqual(5);
    expect(gpen.splitBristle.drynessFactor).toBeLessThan(0.35);
  });

  it("생성된 filaments 배열 길이가 activeFilamentCount와 일치하고 좌우 오프셋이 [-1, 1] 내 분포한다", () => {
    const res = evaluateTactileStampMetrics({
      brushId: "dry-sumi",
      paperId: "hanji",
      velocityPxPerSec: 400,
    });
    expect(res.splitBristle.filaments).toHaveLength(res.splitBristle.activeFilamentCount);
    for (const f of res.splitBristle.filaments) {
      expect(f.lateralOffsetNorm).toBeGreaterThanOrEqual(-1);
      expect(f.lateralOffsetNorm).toBeLessThanOrEqual(1);
      expect(f.opacityWeight).toBeGreaterThan(0);
    }
  });

  it("붓 기울기가 클수록 브리슬 퍼짐 비율(splaySpreadRatio)이 넓어진다", () => {
    const upright = evaluateTactileStampMetrics({ brushId: "dry-sumi", paperId: "hanji", tiltDeg: 6 });
    const tilted = evaluateTactileStampMetrics({ brushId: "dry-sumi", paperId: "hanji", tiltDeg: 68 });
    expect(tilted.splitBristle.splaySpreadRatio).toBeGreaterThan(upright.splitBristle.splaySpreadRatio);
  });
});

describe("4. 모세관 습윤 에지 (Wet-Edge Pigment Pooling 18~34%)", () => {
  it("습윤 에지 활성 상태의 모든 브러시·종이 조합에서 안료 농축률이 18~34% 범위다", () => {
    for (const brush of TACTILE_BRUSH_PRESETS) {
      for (const paper of PAPER_GRAIN_PRESETS) {
        const res = evaluateTactileStampMetrics({
          brushId: brush.id,
          paperId: paper.id,
          controls: { wetEdgePooling: Math.max(0.1, brush.defaultControls.wetEdgePooling) },
        });
        expect(res.wetEdge.enabled).toBe(true);
        expect(res.wetEdge.ringConcentrationPct).toBeGreaterThanOrEqual(WET_EDGE_MIN_PCT);
        expect(res.wetEdge.ringConcentrationPct).toBeLessThanOrEqual(WET_EDGE_MAX_PCT);
      }
    }
  });

  it("wetEdgePooling이 0이면 습윤 에지가 비활성화되고 농축률·링 폭이 0이다", () => {
    const charcoal = evaluateTactileStampMetrics({
      brushId: "charcoal-tooth",
      paperId: "cold-press",
      controls: { wetEdgePooling: 0 },
    });
    expect(charcoal.wetEdge.enabled).toBe(false);
    expect(charcoal.wetEdge.ringConcentrationPct).toBe(0);
    expect(charcoal.wetEdge.ringWidthPx).toBe(0);
  });

  it("고흡수 종이(한지·수채 황목)가 저흡수 켄트지보다 높은 습윤 농축과 중앙 백런을 만든다", () => {
    const onColdPress = evaluateTactileStampMetrics({ brushId: "wet-watercolor", paperId: "cold-press" });
    const onKent = evaluateTactileStampMetrics({ brushId: "wet-watercolor", paperId: "kent" });
    expect(onColdPress.wetEdge.ringConcentrationPct).toBeGreaterThan(onKent.wetEdge.ringConcentrationPct);
    expect(onColdPress.wetEdge.centerBackrunLightening).toBeGreaterThan(onKent.wetEdge.centerBackrunLightening);
  });

  it("습윤 수채 둥근붓 프리셋이 가장 강한 모세관 에지 링 농축을 기록한다", () => {
    const water = evaluateTactileStampMetrics({ brushId: "wet-watercolor", paperId: "cold-press" });
    const gpen = evaluateTactileStampMetrics({ brushId: "gpen-ink", paperId: "kent" });
    expect(water.wetEdge.ringConcentrationPct).toBeGreaterThan(gpen.wetEdge.ringConcentrationPct);
    expect(water.wetEdge.ringWidthPx).toBeGreaterThan(gpen.wetEdge.ringWidthPx);
  });
});

describe("5. 방향성 임파스토 노멀 릴리프 (45° Lambert + Blinn Specular)", () => {
  it("가상 45° 아틀리에 조명 기준으로 임파스토 유화붓의 조명면 내적·광택·물감 두께를 계산한다", () => {
    const oil = evaluateTactileStampMetrics({ brushId: "impasto-oil", paperId: "linen-canvas" });
    expect(oil.impasto.lightElevationDeg).toBe(IMPASTO_LIGHT_ELEVATION_DEG);
    expect(oil.impasto.lightAzimuthDeg).toBe(IMPASTO_LIGHT_AZIMUTH_DEG);
    expect(oil.impasto.ridgeThicknessMm).toBeGreaterThan(1.3);
    expect(oil.impasto.lambertLitDot).toBeGreaterThan(oil.impasto.lambertShadowDot);
    expect(oil.impasto.blinnSpecular).toBeGreaterThan(0.2);
  });

  it("impastoRelief 강도를 높이면 물감 두께·Blinn 광택·입체 대비가 단조 증가한다", () => {
    const low = evaluateTactileStampMetrics({
      brushId: "impasto-oil",
      paperId: "linen-canvas",
      controls: { impastoRelief: 0.1 },
    });
    const high = evaluateTactileStampMetrics({
      brushId: "impasto-oil",
      paperId: "linen-canvas",
      controls: { impastoRelief: 0.96 },
    });
    expect(high.impasto.ridgeThicknessMm).toBeGreaterThan(low.impasto.ridgeThicknessMm);
    expect(high.impasto.blinnSpecular).toBeGreaterThan(low.impasto.blinnSpecular);
    expect(high.impasto.reliefDepthContrast).toBeGreaterThan(low.impasto.reliefDepthContrast);
  });

  it("붓 진행 각도에 따라 임파스토 하이라이트 오프셋 벡터가 회전한다", () => {
    const deg0 = evaluateTactileStampMetrics({ brushId: "impasto-oil", paperId: "linen-canvas", strokeAngleDeg: 0 });
    const deg90 = evaluateTactileStampMetrics({ brushId: "impasto-oil", paperId: "linen-canvas", strokeAngleDeg: 90 });
    expect(deg0.impasto.highlightOffsetPx).not.toEqual(deg90.impasto.highlightOffsetPx);
  });

  it("임파스토 유화붓은 수채붓 대비 월등히 두터운 물감 릴리프와 광택을 가진다", () => {
    const oil = evaluateTactileStampMetrics({ brushId: "impasto-oil", paperId: "linen-canvas" });
    const water = evaluateTactileStampMetrics({ brushId: "wet-watercolor", paperId: "cold-press" });
    expect(oil.impasto.ridgeThicknessMm).toBeGreaterThan(water.impasto.ridgeThicknessMm * 4);
    expect(oil.impasto.blinnSpecular).toBeGreaterThan(water.impasto.blinnSpecular);
  });
});

describe("6. 120Hz(8.33ms) / 60Hz(16.67ms) 결정론적 성능 예산 가드", () => {
  it("5종 기본 아티스트 프리셋 모두 120Hz 가드 활성 시 8.33ms 예산을 준수하고 비용 모델 출처를 명시한다", () => {
    expect(TACTILE_BRUSH_PRESETS).toHaveLength(5);
    for (const preset of TACTILE_BRUSH_PRESETS) {
      const m = evaluateTactileStampMetrics({
        brushId: preset.id,
        paperId: preset.recommendedPaperId,
        targetRefreshHz: 120,
        performanceGuardEnabled: true,
      });
      expect(m.frameBudget.budgetMs).toBe(FRAME_BUDGET_120HZ_MS);
      expect(m.frameBudget.withinBudget).toBe(true);
      expect(m.frameBudget.estimatedFrameMs).toBeLessThanOrEqual(FRAME_BUDGET_120HZ_MS);
      expect(m.frameBudget.costModelSource).toBe("deterministic-analytical-model");
    }
  });

  it("고속 플릭 시 120Hz 자동 가드가 LOD를 상향하고 적응형 간격 확대·서브 필라멘트 축소로 예산을 지킨다", () => {
    const calm = evaluateFrameBudgetPlan({
      targetRefreshHz: 120,
      guardEnabled: true,
      velocityPxPerSec: 280,
      radiusPx: 28,
      baseSpacingRatio: 0.11,
      rawFilamentCount: 15,
      controls: { paperToothStrength: 0.85, dryBristleSplit: 0.9, wetEdgePooling: 0.7, impastoRelief: 0.8 },
    });
    const flick = evaluateFrameBudgetPlan({
      targetRefreshHz: 120,
      guardEnabled: true,
      velocityPxPerSec: 2500,
      radiusPx: 28,
      baseSpacingRatio: 0.11,
      rawFilamentCount: 15,
      controls: { paperToothStrength: 0.85, dryBristleSplit: 0.9, wetEdgePooling: 0.7, impastoRelief: 0.8 },
    });
    expect(flick.lodTier).toBeGreaterThan(calm.lodTier);
    expect(flick.adaptiveSpacingRatio).toBeGreaterThan(calm.adaptiveSpacingRatio);
    expect(flick.filamentSubStampsPerStamp).toBeLessThan(calm.filamentSubStampsPerStamp);
    expect(flick.withinBudget).toBe(true);
  });

  it("극한 부하에서 가드를 끄면 120Hz 8.33ms를 초과하지만 가드를 켜면 예산 안으로 복구된다", () => {
    const baseInput = {
      targetRefreshHz: 120 as const,
      velocityPxPerSec: 2800,
      radiusPx: 38,
      baseSpacingRatio: 0.08,
      rawFilamentCount: 16,
      controls: { paperToothStrength: 1, dryBristleSplit: 1, wetEdgePooling: 1, impastoRelief: 1 },
      tiltDeg: 55,
    };
    const unguarded = evaluateFrameBudgetPlan({ ...baseInput, guardEnabled: false });
    const guarded = evaluateFrameBudgetPlan({ ...baseInput, guardEnabled: true });
    expect(unguarded.withinBudget).toBe(false);
    expect(unguarded.estimatedFrameMs).toBeGreaterThan(FRAME_BUDGET_120HZ_MS);
    expect(guarded.withinBudget).toBe(true);
    expect(guarded.estimatedFrameMs).toBeLessThanOrEqual(FRAME_BUDGET_120HZ_MS);
  });

  it("60Hz 예산은 16.67ms이며 256px Dirty-Rect 타일과 단계별 비용 합계가 정확히 일치한다", () => {
    const plan = evaluateFrameBudgetPlan({
      targetRefreshHz: 60,
      guardEnabled: true,
      velocityPxPerSec: 900,
      radiusPx: 24,
      baseSpacingRatio: 0.12,
      rawFilamentCount: 10,
      controls: { paperToothStrength: 0.7, dryBristleSplit: 0.6, wetEdgePooling: 0.5, impastoRelief: 0.4 },
    });
    expect(plan.budgetMs).toBe(FRAME_BUDGET_60HZ_MS);
    expect(plan.tileSizePx).toBe(DIRTY_RECT_TILE_PX);
    const sum =
      plan.stageBreakdownMs.lutLookupMs +
      plan.stageBreakdownMs.bristleCompositeMs +
      plan.stageBreakdownMs.wetEdgeShaderMs +
      plan.stageBreakdownMs.impastoNormalMs +
      plan.stageBreakdownMs.dirtyTileFlushMs;
    expect(plan.estimatedFrameMs).toBeCloseTo(sum, 1);
  });

  it("성능 가드 활성 시 아틀라스 캐시 히트율이 비활성 대비 높게 유지된다", () => {
    const input = {
      targetRefreshHz: 120 as const,
      velocityPxPerSec: 1200,
      radiusPx: 24,
      baseSpacingRatio: 0.12,
      rawFilamentCount: 12,
      controls: { paperToothStrength: 0.8, dryBristleSplit: 0.8, wetEdgePooling: 0.4, impastoRelief: 0.5 },
    };
    const on = evaluateFrameBudgetPlan({ ...input, guardEnabled: true });
    const off = evaluateFrameBudgetPlan({ ...input, guardEnabled: false });
    expect(on.atlasCacheHitRate).toBeGreaterThan(off.atlasCacheHitRate);
  });
});

describe("7. 비파괴 미리보기·적용·원복 상태 머신 및 레시피 JSON", () => {
  it("초기 세션은 clean 상태이며 preview 패치 시 committed는 변경되지 않는다", () => {
    const s0 = createTactileBrushSession("dry-sumi", "hanji");
    expect(s0.status).toBe("clean");
    expect(s0.canApply).toBe(false);
    expect(s0.canRevert).toBe(false);

    const s1 = previewTactileBrushPatch(s0, { controls: { impastoRelief: 0.88 } });
    expect(s1.status).toBe("previewing");
    expect(s1.canApply).toBe(true);
    expect(s1.canRevert).toBe(true);
    expect(s1.committed.controls.impastoRelief).toBe(s0.committed.controls.impastoRelief);
    expect(getActiveTactileConfig(s1).controls.impastoRelief).toBe(0.88);
  });

  it("프리셋 전환 후 적용하면 committed가 갱신되고, 되돌리기로 직전 커밋이 원복된다", () => {
    const s0 = createTactileBrushSession("dry-sumi", "hanji");
    const s1 = selectTactileBrushPreset(s0, "impasto-oil");
    expect(getActiveTactileConfig(s1).brushId).toBe("impasto-oil");
    expect(getActiveTactileConfig(s1).paperId).toBe("linen-canvas");

    const s2 = applyTactileBrushPreview(s1);
    expect(s2.status).toBe("applied");
    expect(s2.appliedCount).toBe(1);
    expect(s2.committed.brushId).toBe("impasto-oil");
    expect(s2.canApply).toBe(false);
    expect(s2.canRevert).toBe(true);

    const s3 = revertTactileBrushSession(s2);
    expect(s3.status).toBe("reverted");
    expect(s3.committed.brushId).toBe("dry-sumi");
    expect(s3.committed.paperId).toBe("hanji");
    expect(s3.canRevert).toBe(false);
  });

  it("미리보기 중에 되돌리기를 호출하면 committed는 유지되고 preview만 폐기된다", () => {
    const s0 = createTactileBrushSession("gpen-ink", "kent");
    const s1 = previewTactileBrushPatch(s0, { paperId: "cold-press" });
    const s2 = revertTactileBrushSession(s1);
    expect(s2.preview).toBeNull();
    expect(s2.committed.paperId).toBe("kent");
    expect(s2.status).toBe("reverted");
  });

  it("exportTactileBrushRecipeJson이 셰이더 유니폼·LUT 메타·비용 모델·탈-바이올렛 OKLCH를 직렬화한다", () => {
    const s0 = createTactileBrushSession("wet-watercolor", "cold-press");
    const json = exportTactileBrushRecipeJson(s0);
    const parsed = JSON.parse(json) as {
      schema: string;
      violetFreeOklch: boolean;
      paperLut: { tileSize: number; memoryBytes: number };
      shaderUniforms: { uDirtyRectTilePx: number; uWetEdgeConcentrationPct: number };
      frameBudgetModel: { costModelSource: string; budgetMs: number };
    };
    expect(parsed.schema).toBe("toonstudio.tactile-brush-recipe.v1");
    expect(parsed.violetFreeOklch).toBe(true);
    expect(parsed.paperLut.tileSize).toBe(64);
    expect(parsed.paperLut.memoryBytes).toBe(49152);
    expect(parsed.shaderUniforms.uDirtyRectTilePx).toBe(256);
    expect(parsed.shaderUniforms.uWetEdgeConcentrationPct).toBeGreaterThanOrEqual(18);
    expect(parsed.frameBudgetModel.costModelSource).toBe("deterministic-analytical-model");
    expect(parsed.frameBudgetModel.budgetMs).toBe(8.33);
    expect(isVioletSlopHue(285)).toBe(true);
    expect(isVioletSlopHue(sanitizeNonVioletHue(285))).toBe(false);
    expect(formatOklch({ l: 0.5, c: 0.12, h: 290 })).not.toContain("290");
  });
});

describe("8. 라이브 비교 스튜디오 UI 패널 및 엄격 하네스 계약", () => {
  it("기본 props 없이 렌더되며 5종 브러시·4종 종이 전환이 SVG 비교 프리뷰에 즉시 반영된다", () => {
    render(<StudioTactileBrushTexturePanel />);
    const svg = screen.getByTestId("tactile-comparison-svg");
    expect(svg.getAttribute("data-brush-id")).toBe("dry-sumi");
    expect(svg.getAttribute("data-paper-id")).toBe("hanji");

    fireEvent.click(screen.getByTestId("tactile-brush-preset-impasto-oil"));
    expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-brush-id")).toBe("impasto-oil");
    expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-paper-id")).toBe("linen-canvas");
    expect(screen.getByTestId("tactile-session-status-badge").textContent).toContain("미리보기");

    fireEvent.click(screen.getByTestId("tactile-paper-preset-cold-press"));
    expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-paper-id")).toBe("cold-press");
  });

  it("4대 질감 슬라이더와 필압·속도 슬라이더 조작이 실시간 수치와 SVG 속성에 반영된다", () => {
    render(<StudioTactileBrushTexturePanel initialBrushId="wet-watercolor" />);
    fireEvent.change(screen.getByTestId("tactile-slider-paper-tooth"), { target: { value: "0.9" } });
    expect(screen.getByTestId("tactile-slider-paper-tooth-readout").textContent).toBe("90%");

    fireEvent.change(screen.getByTestId("tactile-slider-impasto"), { target: { value: "0.8" } });
    expect(screen.getByTestId("tactile-slider-impasto-readout").textContent).toBe("80%");

    fireEvent.change(screen.getByTestId("tactile-slider-wet-edge"), { target: { value: "0" } });
    expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-wet-ring-pct")).toBe("0");

    fireEvent.change(screen.getByTestId("tactile-slider-velocity"), { target: { value: "2400" } });
    expect(screen.getByTestId("tactile-slider-velocity-readout").textContent).toBe("2400 px/s");
    expect(screen.getByTestId("tactile-lod-readout").textContent).toBe("LOD 3");
  });

  it("120Hz/60Hz 전환과 성능 가드 토글이 프레임 예산 게이지와 비용 모델 고지를 갱신한다", () => {
    render(<StudioTactileBrushTexturePanel />);
    expect(screen.getByTestId("tactile-frame-ms-readout").textContent).toContain("8.33ms");
    expect(screen.getByTestId("tactile-cost-model-note").textContent).toContain("결정론적 비용 모델");

    fireEvent.click(screen.getByTestId("tactile-hz-60-btn"));
    expect(screen.getByTestId("tactile-frame-ms-readout").textContent).toContain("16.67ms");

    fireEvent.click(screen.getByTestId("tactile-guard-toggle-btn"));
    expect(screen.getByTestId("tactile-guard-toggle-btn").getAttribute("aria-pressed")).toBe("false");
  });

  it("비파괴 적용·되돌리기·레시피 JSON 복사·토글 및 영문 로케일 렌더가 정상 동작한다", () => {
    const onApply = vi.fn();
    const onExportJson = vi.fn();
    render(
      <StudioTactileBrushTexturePanel
        locale="en"
        initialBrushId="gpen-ink"
        onApply={onApply}
        onExportJson={onExportJson}
      />,
    );
    expect((screen.getByTestId("tactile-apply-btn") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTestId("tactile-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("tactile-brush-preset-wet-watercolor"));
    expect((screen.getByTestId("tactile-apply-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("tactile-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tactile-session-status-badge").textContent).toContain("Applied");

    fireEvent.click(screen.getByTestId("tactile-revert-btn"));
    expect(screen.getByTestId("tactile-comparison-svg").getAttribute("data-brush-id")).toBe("gpen-ink");

    fireEvent.click(screen.getByTestId("tactile-copy-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("tactile-json-preview").textContent).toContain("toonstudio.tactile-brush-recipe.v1");

    fireEvent.click(screen.getByTestId("tactile-toggle-json-btn"));
    expect(screen.queryByTestId("tactile-json-preview")).toBeNull();
  });

  it("모듈 파일 존재, 800줄 이하, 원시 색·transition-all·= {}·스토리지·private Map store·BigInt·Sparkles·번역투 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const expected = [
      "tactile-brush-texture-engine.ts",
      "StudioTactileBrushTexturePanel.tsx",
      "index.ts",
      "tactile-brush-texture.test.tsx",
      "tactile-brush-boundaries.test.tsx",
      "tactile-brush-input-contract.ts",
      "tactile-brush-recipe.ts",
      "use-tactile-brush-delivery.ts",
    ];
    for (const file of expected) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const files = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(files).toHaveLength(8);
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "tactile-brush-texture.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
        expect(src).not.toContain("가능하게 합니다");
        expect(src).not.toContain("직관적인 경험을 제공");
      }

      if (file === "StudioTactileBrushTexturePanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 SVG DOM에 원시 색 및 바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioTactileBrushTexturePanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(14);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svg = screen.getByTestId("tactile-comparison-svg");
    const html = svg.outerHTML;
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(html).not.toMatch(/\brgba?\s*\(/iu);
    expect(html).not.toMatch(/\bhsla?\s*\(/iu);
    for (const match of html.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
      expect(isVioletSlopHue(Number(match[1]))).toBe(false);
    }
  });
});
