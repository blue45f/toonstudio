// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXTERNAL_ASSET_PRESETS,
  STORY_GENRE_PRESETS,
  STYLE_SPECTRUM_PRESETS,
  StudioStyleSpectrumGuardianPanel,
  THREE_D_SOURCE_PRESETS,
  applyStyleSpectrum,
  applyStyleUnificationCorrection,
  auditExternalAssetStyleDrift,
  computeCrossMediaTransferPlan,
  createConfigFromStylePreset,
  createStyleGuardianSession,
  exportStyleGuardianJson,
  formatOklch,
  getExternalAssetPreset,
  getStoryGenreMeta,
  getStyleSpectrumPreset,
  getThreeDSourcePreset,
  isVioletSlopHue,
  kelvinToSafeOklch,
  previewStyleSpectrum,
  proposeStyleSpectrumTop3,
  revertStyleGuardianSession,
  sanitizeNonVioletHue,
  shiftHueSafe,
  tweakStyleGuardianConfig,
} from "./index";

afterEach(cleanup);

describe("1. 6대 대표 화풍 스펙트럼 프리셋 & 탈-바이올렛 OKLCH 물리", () => {
  it("6대 대표 화풍 프리셋이 요구된 ID와 핵심 물리 파라미터(선 굵기·2~6단·LPI·OKLCH 채도·색온도 이동·브러시 레시피)를 모두 포함한다", () => {
    expect(STYLE_SPECTRUM_PRESETS).toHaveLength(6);
    expect(STYLE_SPECTRUM_PRESETS.map((p) => p.id)).toEqual([
      "k-webtoon-cel",
      "watercolor-editorial",
      "monochrome-noir",
      "ink-wash-oriental",
      "painterly-impasto",
      "retro-print-risograph",
    ]);

    for (const preset of STYLE_SPECTRUM_PRESETS) {
      expect(preset.lineWidthRangePx.min).toBeGreaterThan(0);
      expect(preset.lineWidthRangePx.max).toBeGreaterThan(preset.lineWidthRangePx.min);
      expect(preset.lineWidthRangePx.defaultPx).toBeGreaterThanOrEqual(preset.lineWidthRangePx.min);
      expect(preset.lineWidthRangePx.defaultPx).toBeLessThanOrEqual(preset.lineWidthRangePx.max);
      expect(preset.shadingSteps).toBeGreaterThanOrEqual(2);
      expect(preset.shadingSteps).toBeLessThanOrEqual(6);
      expect(preset.screentoneLpi).toBeGreaterThanOrEqual(0);
      expect(preset.maxChromaOklch).toBeGreaterThan(0);
      expect(preset.maxChromaOklch).toBeLessThanOrEqual(0.25);
      expect(preset.brushRecipe.lineBrushKo.length).toBeGreaterThan(3);
      expect(preset.brushRecipe.fillBrushKo.length).toBeGreaterThan(3);
      expect(preset.brushRecipe.textureOverlayKo.length).toBeGreaterThan(3);
      expect(preset.paletteSwatches).toHaveLength(4);
    }
  });

  it("흑백 느와르와 리소그래프 판화는 고유 스크린톤 LPI를, 나머지 화풍은 종이/안료 결을 구분한다", () => {
    const noir = getStyleSpectrumPreset("monochrome-noir");
    const riso = getStyleSpectrumPreset("retro-print-risograph");
    const cel = getStyleSpectrumPreset("k-webtoon-cel");
    const impasto = getStyleSpectrumPreset("painterly-impasto");

    expect(noir.screentoneLpi).toBe(65);
    expect(noir.shadingSteps).toBe(2);
    expect(noir.maxChromaOklch).toBeLessThanOrEqual(0.03);
    expect(riso.screentoneLpi).toBe(45);
    expect(cel.shadingSteps).toBe(3);
    expect(impasto.shadingSteps).toBe(6);
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 바이올렛 구간(270~320°)을 완전히 배제한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(252)).toBe(false);
    expect(isVioletSlopHue(342)).toBe(false);
    expect(isVioletSlopHue(44)).toBe(false);

    for (let deg = 270; deg <= 320; deg += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(deg))).toBe(false);
    }
  });

  it("shiftHueSafe는 어떤 그림자 색온도 이동을 적용해도 270~320°로 진입하지 않는다", () => {
    for (let base = 0; base < 360; base += 15) {
      for (const shift of [-40, -20, 0, 20, 40]) {
        const shifted = shiftHueSafe(base, shift);
        expect(isVioletSlopHue(shifted)).toBe(false);
      }
    }
  });

  it("formatOklch와 kelvinToSafeOklch가 raw hex/rgb/hsl 없이 비-바이올렛 OKLCH 문자열만 생성한다", () => {
    const solid = formatOklch({ l: 0.72, c: 0.14, h: 44 });
    const clampedViolet = formatOklch({ l: 0.65, c: 0.18, h: 288 }, 0.45);
    expect(solid).toBe("oklch(0.72 0.14 44)");
    expect(clampedViolet).toMatch(/^oklch\(\d\.\d{2} \d\.\d{2} 252 \/ 0\.45\)$/u);
    expect(solid).not.toMatch(/#|rgb|hsl/iu);

    for (let k = 2400; k <= 9000; k += 400) {
      expect(isVioletSlopHue(kelvinToSafeOklch(k).h)).toBe(false);
    }
  });

  it("6대 화풍 프리셋의 모든 팔레트 스와치와 그림자 이동 색이 바이올렛 0%다", () => {
    for (const preset of STYLE_SPECTRUM_PRESETS) {
      for (const swatch of preset.paletteSwatches) {
        expect(isVioletSlopHue(swatch.h)).toBe(false);
        expect(isVioletSlopHue(shiftHueSafe(swatch.h, preset.shadowHueShiftDeg))).toBe(false);
      }
    }
  });
});

describe("2. 원고/콘티 분석 기반 화풍 Top-3 추천 (proposeStyleSpectrumTop3)", () => {
  it("로맨스 장르 + 투명 수채·노을 고백 분위기는 watercolor-editorial을 1순위로 제안한다", () => {
    const bundle = proposeStyleSpectrumTop3({
      genre: "romance",
      moodPrompt: "노을빛 창가에서 건네는 조용한 고백, 투명한 수채 감성과 따뜻한 여운...",
    });
    expect(bundle.proposals[0].styleId).toBe("watercolor-editorial");
    expect(bundle.proposals[0].reasonKo).toContain("로맨스");
  });

  it("액션 장르 + 고속 추격·타격감!! 분위기는 k-webtoon-cel을 1순위로 제안한다", () => {
    const bundle = proposeStyleSpectrumTop3({
      genre: "action",
      moodPrompt: "도심 옥상 전투와 빠른 타격감!! 선명하고 깔끔한 연재 속도감",
    });
    expect(bundle.proposals[0].styleId).toBe("k-webtoon-cel");
    expect(bundle.detectedSignals.some((s) => s.includes("강조감탄"))).toBe(true);
  });

  it("스릴러 장르 + 흑백·범죄·그림자 추격 분위기는 monochrome-noir를 1순위로 제안한다", () => {
    const bundle = proposeStyleSpectrumTop3({
      genre: "thriller",
      moodPrompt: "비 내리는 골목 어둠 속 범죄 추격... 흑백 느와르 그림자와 긴장감",
    });
    expect(bundle.proposals[0].styleId).toBe("monochrome-noir");
    expect(bundle.proposals[0].reasonKo).toContain("65 LPI");
  });

  it("사극 장르 + 한복·궁궐·갈필 먹선 분위기는 ink-wash-oriental을 1순위로 제안한다", () => {
    const bundle = proposeStyleSpectrumTop3({
      genre: "historical",
      moodPrompt: "안개 낀 궁궐 마당을 가르는 검객의 한복 자락, 동양 먹선과 여백",
    });
    expect(bundle.proposals[0].styleId).toBe("ink-wash-oriental");
  });

  it("일상 장르 + 복고·인쇄·다이어리~ 분위기는 retro-print-risograph를 1순위로 제안한다", () => {
    const bundle = proposeStyleSpectrumTop3({
      genre: "slice-of-life",
      moodPrompt: "동네 카페 다이어리와 청춘 일상~ 복고 판화 인쇄 질감과 유쾌한 개성",
    });
    expect(bundle.proposals[0].styleId).toBe("retro-print-risograph");
    expect(bundle.detectedSignals.some((s) => s.includes("물결"))).toBe(true);
  });

  it("판타지 장르 + 중세 성채·마법·유화 붓터치 분위기는 painterly-impasto를 1순위로 제안한다", () => {
    const bundle = proposeStyleSpectrumTop3({
      genre: "fantasy",
      moodPrompt: "고대 성채 유적 위로 깨어나는 마법 서사, 중후한 반실사 유화 붓터치",
    });
    expect(bundle.proposals[0].styleId).toBe("painterly-impasto");
  });

  it("항상 중복 없는 Top-3를 점수 내림차순·작가 승인 필수·완전 결정론적으로 반환한다", () => {
    const input = { genre: "action" as const, moodPrompt: "옥상 추격과 비명!!" };
    const a = proposeStyleSpectrumTop3(input);
    const b = proposeStyleSpectrumTop3(input);
    expect(a).toEqual(b);
    expect(a.proposals).toHaveLength(3);
    expect(a.proposals.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(new Set(a.proposals.map((p) => p.styleId)).size).toBe(3);
    expect(a.proposals[0].matchScore).toBeGreaterThanOrEqual(a.proposals[1].matchScore);
    expect(a.proposals[1].matchScore).toBeGreaterThanOrEqual(a.proposals[2].matchScore);
    for (const p of a.proposals) {
      expect(p.requiresAuthorApproval).toBe(true);
    }
  });
});

describe("3. 3D→2D 안료/셀 변환기 (computeCrossMediaTransferPlan)", () => {
  it("4종 3D PBR 소스 × 6대 화풍(24조합) 전체에서 바이올렛 휴 0%와 안전한 셰이더 유니폼을 생성한다", () => {
    for (const src of THREE_D_SOURCE_PRESETS) {
      for (const preset of STYLE_SPECTRUM_PRESETS) {
        const plan = computeCrossMediaTransferPlan(src, preset.id);
        expect(isVioletSlopHue(plan.pigmentPalette.highlightOklch.h)).toBe(false);
        expect(isVioletSlopHue(plan.pigmentPalette.midtoneOklch.h)).toBe(false);
        expect(isVioletSlopHue(plan.pigmentPalette.shadowOklch.h)).toBe(false);
        expect(isVioletSlopHue(plan.pigmentPalette.lineInkOklch.h)).toBe(false);
        expect(plan.celBands).toBe(preset.shadingSteps);
        expect(plan.celRampStops).toHaveLength(preset.shadingSteps - 1);
        expect(plan.afterSeamRiskScore).toBeLessThan(plan.beforeSeamRiskScore);
      }
    }
  });

  it("셀 램프 스톱(celRampStops)은 [0, 1] 범위에서 엄격히 오름차순이다", () => {
    const plan = computeCrossMediaTransferPlan(getThreeDSourcePreset("pbr-stone-palace"), "painterly-impasto");
    expect(plan.celBands).toBe(6);
    expect(plan.celRampStops).toHaveLength(5);
    for (let i = 0; i < plan.celRampStops.length; i += 1) {
      const curr = plan.celRampStops[i] ?? 0;
      expect(curr).toBeGreaterThan(0);
      expect(curr).toBeLessThan(1);
      if (i > 0) {
        expect(curr).toBeGreaterThan(plan.celRampStops[i - 1] ?? 0);
      }
    }
  });

  it("고광택 유리·금속 PBR 소스는 메탈릭 반사를 2D 화풍에 맞게 대폭 억제한다", () => {
    const glass = getThreeDSourcePreset("pbr-glass-cafe");
    const celPlan = computeCrossMediaTransferPlan(glass, "k-webtoon-cel");
    const wcPlan = computeCrossMediaTransferPlan(glass, "watercolor-editorial");
    expect(celPlan.specularConversion.metallicClamp).toBeLessThan(glass.metallic * 0.5);
    expect(wcPlan.specularConversion.metallicClamp).toBeLessThanOrEqual(0.18);
    expect(celPlan.specularConversion.mode).toBe("crisp-cel-flake");
    expect(wcPlan.specularConversion.mode).toBe("watercolor-bloom");
  });

  it("고노멀 석조 궁궐 PBR은 LT 노멀 임계값을 높여 잔선 노이즈를 억제한다", () => {
    const stone = getThreeDSourcePreset("pbr-stone-palace");
    const wood = getThreeDSourcePreset("pbr-wooden-prop");
    const stonePlan = computeCrossMediaTransferPlan(stone, "ink-wash-oriental");
    const woodPlan = computeCrossMediaTransferPlan(wood, "ink-wash-oriental");
    expect(stonePlan.ltExtraction.normalEdgeThreshold).toBeGreaterThan(woodPlan.ltExtraction.normalEdgeThreshold);
    expect(stonePlan.ltExtraction.creaseAngleDeg).toBeGreaterThan(woodPlan.ltExtraction.creaseAngleDeg);
  });

  it("변환된 2D 안료 채도는 선택한 화풍의 maxChromaOklch 상한을 절대 초과하지 않는다", () => {
    const highChromaSource = {
      ...getThreeDSourcePreset("pbr-glass-cafe"),
      baseChroma: 0.31,
    };
    for (const preset of STYLE_SPECTRUM_PRESETS) {
      const plan = computeCrossMediaTransferPlan(highChromaSource, preset.id);
      expect(plan.pigmentPalette.clampedChroma).toBeLessThanOrEqual(preset.maxChromaOklch);
      expect(plan.pigmentPalette.midtoneOklch.c).toBeLessThanOrEqual(preset.maxChromaOklch);
      expect(plan.pigmentPalette.shadowOklch.c).toBeLessThanOrEqual(preset.maxChromaOklch);
    }
  });

  it("shaderUniforms에 OKLCH 색상 문자열과 LT/셀 파라미터가 포함되어 원시 hex/rgb가 0건이다", () => {
    const plan = computeCrossMediaTransferPlan(getThreeDSourcePreset("pbr-wet-alley"), "monochrome-noir");
    expect(plan.shaderUniforms.uCelBands).toBe(2);
    expect(plan.shaderUniforms.uScreentoneLpi).toBe(65);
    for (const val of Object.values(plan.shaderUniforms)) {
      if (typeof val === "string") {
        expect(val).toMatch(/^oklch\(/u);
        expect(val).not.toMatch(/#|rgb|hsl/iu);
      }
    }
  });
});

describe("4. 화풍 편향 방지 가디언 (auditExternalAssetStyleDrift)", () => {
  it("기준 화풍과 유사한 어시스턴트 선화 컷은 이질감 25점 미만 harmonized 등급을 반환한다", () => {
    const audit = auditExternalAssetStyleDrift("k-webtoon-cel", getExternalAssetPreset("assist-ink-cut"));
    expect(audit.driftScore).toBeLessThan(25);
    expect(audit.severity).toBe("harmonized");
    expect(audit.violetSlopDetected).toBe(false);
  });

  it("실사 포토배싱 거리 배경은 높은 이질감(>= 55점)과 선화 리샘플·채도 매칭 보정 파라미터를 산출한다", () => {
    const audit = auditExternalAssetStyleDrift("k-webtoon-cel", getExternalAssetPreset("photo-bashed-street"));
    expect(audit.driftScore).toBeGreaterThanOrEqual(55);
    expect(audit.severity).toBe("high-drift");
    expect(audit.unificationCorrection.lineResampleScale).toBeGreaterThan(2);
    expect(audit.unificationCorrection.chromaMatchGain).toBeLessThan(1);
    expect(audit.unificationCorrection.projectedDriftScore).toBeLessThan(audit.driftScore);
    expect(audit.warningsKo.length).toBeGreaterThanOrEqual(2);
  });

  it("무보정 3D 스케치업 교실을 수채 화풍에 넣으면 얇은 선화와 부족한 종이 그레인 보정(+delta)을 제안한다", () => {
    const audit = auditExternalAssetStyleDrift("watercolor-editorial", getExternalAssetPreset("raw-3d-sketchup-room"));
    expect(audit.driftScore).toBeGreaterThanOrEqual(40);
    expect(audit.unificationCorrection.paperGrainOverlayDelta).toBeGreaterThan(0.2);
    expect(audit.warningsKo.some((w) => w.includes("노이즈 밀도"))).toBe(true);
  });

  it("292° 바이올렛 편향을 가진 외부 AI 소품을 감지(violetSlopDetected=true)하고 안전 휴로 치환한다", () => {
    const audit = auditExternalAssetStyleDrift("k-webtoon-cel", getExternalAssetPreset("ai-glossy-prop"));
    expect(audit.violetSlopDetected).toBe(true);
    expect(isVioletSlopHue(audit.unificationCorrection.safeRemappedHueDeg)).toBe(false);
    expect(audit.warningsKo.some((w) => w.includes("바이올렛"))).toBe(true);
    expect(audit.unificationCorrection.actionsKo.some((a) => a.includes("안전 안료"))).toBe(true);
  });

  it("흑백 느와르 기준에서 고채도 외부 에셋은 강한 채도 게인 축소와 높은 드리프트 점수를 기록한다", () => {
    const audit = auditExternalAssetStyleDrift("monochrome-noir", getExternalAssetPreset("photo-bashed-street"));
    expect(audit.driftScore).toBeGreaterThanOrEqual(65);
    expect(audit.unificationCorrection.chromaMatchGain).toBeLessThanOrEqual(0.2);
  });

  it("극단적인 입력값(NaN·음수·초과값)도 [0, 100] 범위의 유한한 드리프트 점수로 클램프한다", () => {
    const audit = auditExternalAssetStyleDrift("k-webtoon-cel", {
      labelKo: "극단 테스트 에셋",
      labelEn: "Extreme Test Asset",
      lineWidthPx: -3,
      chromaOklch: 9.9,
      contrastRatio: 99,
      noiseDensity: 4,
      dominantHueDeg: 295,
    });
    expect(Number.isFinite(audit.driftScore)).toBe(true);
    expect(audit.driftScore).toBeGreaterThanOrEqual(0);
    expect(audit.driftScore).toBeLessThanOrEqual(100);
    expect(audit.unificationCorrection.projectedDriftScore).toBeLessThanOrEqual(15);
  });
});

describe("5. 비파괴 상태 머신 & 화풍 DNA JSON 내보내기", () => {
  it("createStyleGuardianSession 초기 상태는 idle·canRevert=false이며 원본 기준을 보존한다", () => {
    const session = createStyleGuardianSession("watercolor-editorial");
    expect(session.status).toBe("idle");
    expect(session.canRevert).toBe(false);
    expect(session.baselineConfig.styleId).toBe("watercolor-editorial");
    expect(session.currentConfig).toEqual(session.baselineConfig);
    expect(session.history).toHaveLength(0);
  });

  it("previewStyleSpectrum은 baseline과 currentConfig를 변경하지 않고 미리보기를 토글한다", () => {
    const s0 = createStyleGuardianSession("k-webtoon-cel");
    const s1 = previewStyleSpectrum(s0, "ink-wash-oriental");
    expect(s1.status).toBe("previewing");
    expect(s1.previewStyleId).toBe("ink-wash-oriental");
    expect(s1.previewConfig?.styleId).toBe("ink-wash-oriental");
    expect(s1.currentConfig).toEqual(s0.baselineConfig);
    expect(s1.canRevert).toBe(false);

    const s2 = previewStyleSpectrum(s1, "ink-wash-oriental");
    expect(s2.status).toBe("idle");
    expect(s2.previewConfig).toBeNull();
  });

  it("applyStyleSpectrum 후 revertStyleGuardianSession 시 원본 baselineConfig로 100% 복원된다", () => {
    const s0 = createStyleGuardianSession("k-webtoon-cel");
    const s1 = applyStyleSpectrum(s0, "retro-print-risograph");
    expect(s1.status).toBe("applied");
    expect(s1.canRevert).toBe(true);
    expect(s1.currentConfig.styleId).toBe("retro-print-risograph");
    expect(s1.baselineConfig.styleId).toBe("k-webtoon-cel");

    const s2 = revertStyleGuardianSession(s1);
    expect(s2.status).toBe("reverted");
    expect(s2.canRevert).toBe(false);
    expect(s2.currentConfig).toEqual(s0.baselineConfig);
    expect(s2.history.map((h) => h.action)).toEqual(["apply-style", "revert"]);
  });

  it("applyStyleUnificationCorrection이 외부 에셋 통일 플래그를 기록하고 원클릭 원복을 지원한다", () => {
    const s0 = createStyleGuardianSession("k-webtoon-cel");
    const audit = auditExternalAssetStyleDrift(s0.currentConfig, getExternalAssetPreset("ai-glossy-prop"));
    const sUnified = applyStyleUnificationCorrection(s0, audit);
    expect(sUnified.status).toBe("applied");
    expect(sUnified.canRevert).toBe(true);
    expect(sUnified.currentConfig.unificationApplied).toBe(true);
    expect(sUnified.currentConfig.unificationSourceAssetId).toBe("ai-glossy-prop");

    const sReverted = revertStyleGuardianSession(sUnified);
    expect(sReverted.currentConfig.unificationApplied).toBe(false);
    expect(sReverted.currentConfig).toEqual(s0.baselineConfig);
  });

  it("현재 화풍과 다른 감사값이 전달돼도 현재 화풍 기준으로 보정한다", () => {
    const initial = createStyleGuardianSession("k-webtoon-cel");
    const artwork = getExternalAssetPreset("ai-glossy-prop");
    const stale = auditExternalAssetStyleDrift(initial.currentConfig, artwork);
    const current = applyStyleSpectrum(initial, "monochrome-noir");
    const currentAudit = auditExternalAssetStyleDrift(current.currentConfig, artwork);
    expect(applyStyleUnificationCorrection(current, stale)).toEqual(
      applyStyleUnificationCorrection(current, currentAudit),
    );
  });

  it("tweakStyleGuardianConfig가 선 굵기·셀 밴드·채도·그레인·그림자 색온도 이동을 안전 범위로 클램프한다", () => {
    const s0 = createStyleGuardianSession("k-webtoon-cel");
    const sTweak = tweakStyleGuardianConfig(s0, {
      lineWidthPx: 12.5,
      shadingSteps: 9,
      maxChromaOklch: 0.9,
      paperGrainStrength: 1.8,
      shadowHueShiftDeg: -95,
    });
    expect(sTweak.status).toBe("tweaked");
    expect(sTweak.isTweaked).toBe(true);
    expect(sTweak.canRevert).toBe(true);
    expect(sTweak.currentConfig.lineWidthPx).toBe(4.2);
    expect(sTweak.currentConfig.shadingSteps).toBe(6);
    expect(sTweak.currentConfig.maxChromaOklch).toBe(0.26);
    expect(sTweak.currentConfig.paperGrainStrength).toBe(1);
    expect(sTweak.currentConfig.shadowHueShiftDeg).toBe(-40);
  });

  it("exportStyleGuardianJson이 완전 결정론적인 화풍 DNA v1 JSON을 직렬화한다", () => {
    const session = applyStyleSpectrum(createStyleGuardianSession("k-webtoon-cel"), "ink-wash-oriental");
    const proposals = proposeStyleSpectrumTop3({ genre: "historical", moodPrompt: "궁궐 먹선 여백" });
    const transfer = computeCrossMediaTransferPlan(getThreeDSourcePreset("pbr-stone-palace"), session.currentConfig);
    const drift = auditExternalAssetStyleDrift(session.currentConfig, getExternalAssetPreset("photo-bashed-street"));

    const jsonA = exportStyleGuardianJson(session, proposals, transfer, drift);
    const jsonB = exportStyleGuardianJson(session, proposals, transfer, drift);
    expect(jsonA).toBe(jsonB);

    const parsed = JSON.parse(jsonA) as {
      schema: string;
      violetSlopPct: number;
      requiresAuthorApproval: boolean;
      styleDna: { id: string; paletteOklch: string[] };
      proposalTop3: { rank: number; styleId: string }[];
      crossMediaTransfer: { celBands: number };
      driftGuardian: { driftScore: number; projectedDriftScore: number };
    };
    expect(parsed.schema).toBe("toonstudio.style-spectrum-guardian.v1");
    expect(parsed.violetSlopPct).toBe(0);
    expect(parsed.requiresAuthorApproval).toBe(true);
    expect(parsed.styleDna.id).toBe("ink-wash-oriental");
    expect(parsed.styleDna.paletteOklch).toHaveLength(4);
    expect(parsed.proposalTop3).toHaveLength(3);
    expect(parsed.crossMediaTransfer.celBands).toBe(4);
    expect(parsed.driftGuardian.projectedDriftScore).toBeLessThan(parsed.driftGuardian.driftScore);
  });

  it("조회 헬퍼들이 유효한 기본 메타를 반환하고 createConfigFromStylePreset이 프리셋과 일치한다", () => {
    expect(getStoryGenreMeta("fantasy").labelKo).toBe("판타지");
    const cfg = createConfigFromStylePreset("retro-print-risograph");
    expect(cfg.screentoneLpi).toBe(45);
    expect(cfg.lineWidthPx).toBe(1.9);
  });
});

describe("6. StudioStyleSpectrumGuardianPanel UI · 인터랙션 · 접근성 검증", () => {
  it("props 없이 렌더되며 작가 승인 배지·6대 장르·6대 화풍 카드·Top-3 제안·SVG 전후 도해가 표시된다", () => {
    render(<StudioStyleSpectrumGuardianPanel />);
    expect(screen.getByTestId("studio-style-spectrum-guardian-panel")).toBeTruthy();
    expect(screen.getByTestId("style-guardian-approval-badge").textContent).toContain("작가 승인 후 적용");
    expect(screen.getByTestId("style-guardian-status-badge").textContent).toContain("원본 기준 유지 중");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-violet-free")).toBe("true");

    for (const genre of STORY_GENRE_PRESETS) {
      expect(screen.getByTestId(`style-genre-btn-${genre.id}`)).toBeTruthy();
    }
    for (const preset of STYLE_SPECTRUM_PRESETS) {
      expect(screen.getByTestId(`style-preset-card-${preset.id}`)).toBeTruthy();
    }
    for (const asset of EXTERNAL_ASSET_PRESETS) {
      expect(screen.getByTestId(`style-external-asset-${asset.assetId}`)).toBeTruthy();
    }
    expect(screen.getByTestId("style-top3-card-1")).toBeTruthy();
    expect(screen.getByTestId("style-top3-card-2")).toBeTruthy();
    expect(screen.getByTestId("style-top3-card-3")).toBeTruthy();
    expect((screen.getByTestId("style-guardian-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("장르 버튼 전환과 대사 분위기 입력 시 Top-3 추천 화풍이 즉시 갱신된다", () => {
    render(<StudioStyleSpectrumGuardianPanel />);
    fireEvent.click(screen.getByTestId("style-genre-btn-thriller"));
    expect(screen.getByTestId("style-top3-card-1").getAttribute("data-style-id")).toBe("monochrome-noir");

    fireEvent.click(screen.getByTestId("style-genre-btn-historical"));
    expect(screen.getByTestId("style-top3-card-1").getAttribute("data-style-id")).toBe("ink-wash-oriental");

    fireEvent.change(screen.getByTestId("style-mood-prompt-input"), {
      target: { value: "중세 성채 유적 마법 서사 반실사 유화 붓터치" },
    });
    expect(screen.getByTestId("style-detected-signals").textContent).toContain("유화");
  });

  it("6대 화풍 카드 미리보기(onApply 미호출) → 화풍 적용(onApply 호출) → 원클릭 되돌리기(onRevert 호출)가 동작한다", () => {
    const onApply = vi.fn();
    const onRevert = vi.fn();
    render(<StudioStyleSpectrumGuardianPanel onApply={onApply} onRevert={onRevert} />);

    fireEvent.click(screen.getByTestId("style-preset-preview-monochrome-noir"));
    expect(screen.getByTestId("style-guardian-status-badge").textContent).toContain("미리보기");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-style-id")).toBe("monochrome-noir");
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("style-preset-apply-monochrome-noir"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("style-guardian-status-badge").textContent).toContain("비파괴 적용됨");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-screentone-lpi")).toBe("65");
    expect((screen.getByTestId("style-guardian-revert-btn") as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByTestId("style-guardian-revert-btn"));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("style-guardian-status-badge").textContent).toContain("원본 되돌림");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-style-id")).toBe("k-webtoon-cel");
    expect((screen.getByTestId("style-guardian-revert-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("3D PBR 소스 프리셋 전환 시 3D→2D 변환 요약과 이음새 위험 지표가 갱신된다", () => {
    render(<StudioStyleSpectrumGuardianPanel />);
    fireEvent.click(screen.getByTestId("style-3d-source-pbr-stone-palace"));
    expect(screen.getByTestId("style-3d-source-pbr-stone-palace").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("style-transfer-summary").textContent).toContain("3D 석조 궁궐");
    expect(screen.getByTestId("style-seam-risk-delta").textContent).toContain("→");
  });

  it("외부 에셋 전환 및 원클릭 화풍 통일 적용 시 이질감 점수가 내려가고 되돌리기가 활성화된다", () => {
    const onApply = vi.fn();
    render(<StudioStyleSpectrumGuardianPanel onApply={onApply} />);
    fireEvent.click(screen.getByTestId("style-external-asset-ai-glossy-prop"));
    const svg = screen.getByTestId("style-transfer-compare-svg");
    const driftBefore = Number(svg.getAttribute("data-drift-before"));
    expect(driftBefore).toBeGreaterThanOrEqual(55);

    fireEvent.click(screen.getByTestId("style-unify-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    const driftAfter = Number(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-drift-after"));
    expect(driftAfter).toBeLessThan(driftBefore);
    expect(screen.getByTestId("style-drift-severity-badge").getAttribute("data-severity")).toBe("harmonized");
  });

  it("선 굵기·셀 밴드·채도 보정 슬라이더 조작 시 수치와 SVG 속성이 실시간 반영된다", () => {
    render(<StudioStyleSpectrumGuardianPanel />);
    fireEvent.change(screen.getByTestId("style-slider-line-width"), { target: { value: "2.8" } });
    expect(screen.getByTestId("style-slider-line-width-readout").textContent).toBe("2.8px");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-line-width-px")).toBe("2.8");

    fireEvent.change(screen.getByTestId("style-slider-shading-steps"), { target: { value: "5" } });
    expect(screen.getByTestId("style-slider-shading-steps-readout").textContent).toBe("5단");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-shading-steps")).toBe("5");
    expect(screen.getByTestId("style-transfer-cel-bands").textContent).toBe("5단");

    fireEvent.change(screen.getByTestId("style-slider-max-chroma"), { target: { value: "0.12" } });
    expect(screen.getByTestId("style-slider-max-chroma-readout").textContent).toBe("0.12");
    expect(screen.getByTestId("style-guardian-status-badge").textContent).toContain("슬라이더 미세 보정됨");
  });

  it("클립보드가 쓰기를 거부하면 수동 복사할 JSON과 실패 안내를 표시한다", async () => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    try {
      render(<StudioStyleSpectrumGuardianPanel locale="en" />);
      fireEvent.click(screen.getByTestId("style-guardian-export-json-btn"));
      expect(screen.getByTestId("style-json-preview")).toBeTruthy();
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Copy the JSON manually"));
      expect(writeText).toHaveBeenCalledTimes(1);
    } finally {
      if (previous) Object.defineProperty(navigator, "clipboard", previous);
      else Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("화풍 DNA JSON 복사·토글·초기화 및 영문 로케일 렌더가 정상 동작한다", () => {
    const onExportJson = vi.fn();
    render(<StudioStyleSpectrumGuardianPanel locale="en" initialStyleId="watercolor-editorial" onExportJson={onExportJson} />);
    expect(screen.getByTestId("style-guardian-approval-badge").textContent).toContain("Author Approval Required");
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-style-id")).toBe("watercolor-editorial");
    expect(screen.queryByTestId("style-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("style-guardian-export-json-btn"));
    expect(onExportJson).toHaveBeenCalledTimes(1);
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.style-spectrum-guardian.v1");
    expect(screen.getByTestId("style-json-preview").textContent).toContain('"styleDna"');

    fireEvent.click(screen.getByTestId("style-toggle-json-btn"));
    expect(screen.queryByTestId("style-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("style-preset-apply-monochrome-noir"));
    fireEvent.click(screen.getByTestId("style-guardian-reset-btn"));
    expect(screen.getByTestId("style-transfer-compare-svg").getAttribute("data-style-id")).toBe("watercolor-editorial");
  });
});

describe("7. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("4개 소유 파일 존재, 전 파일 800줄 이하 및 금지 패턴(원시 색·transition-all·= {}·스토리지·private Map store·BigInt·Sparkles) 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "style-spectrum-guardian-engine.ts",
      "StudioStyleSpectrumGuardianPanel.tsx",
      "index.ts",
      "style-spectrum-guardian.test.tsx",
    ];
    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles).toHaveLength(4);
    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      expect(src.split(/\r?\n/).length).toBeLessThanOrEqual(800);

      if (file !== "style-spectrum-guardian.test.tsx") {
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

      if (file === "StudioStyleSpectrumGuardianPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
        expect(src).toContain("motion-reduce:transition-none");
        expect(src).toContain("작가 승인 후 적용");
      }
    }
  });

  it("렌더된 모든 버튼이 min-h-11을 유지하고 SVG 속성에 raw hex/rgb/hsl 및 바이올렛 휴(270~320°)가 0건이다", () => {
    const { container } = render(<StudioStyleSpectrumGuardianPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(25);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(1);
    for (const svg of svgs) {
      const html = svg.outerHTML;
      expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(html).not.toMatch(/\brgba?\s*\(/iu);
      expect(html).not.toMatch(/\bhsla?\s*\(/iu);
      const oklchMatches = html.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu);
      for (const m of oklchMatches) {
        const hue = Number(m[1]);
        expect(isVioletSlopHue(hue)).toBe(false);
      }
    }
  });
});
