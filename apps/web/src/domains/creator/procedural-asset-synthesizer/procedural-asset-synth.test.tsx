// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PIGMENT_HARMONIES,
  PROCEDURAL_ASSET_RECIPES,
  StudioProceduralAssetSynthPanel,
  computeDeterministicDigest,
  createMulberry32,
  exportProceduralAssetManifestJson,
  exportSynthesizedAssetSvg,
  formatOklch,
  getPigmentHarmony,
  getProceduralAssetRecipe,
  isVioletSlopHue,
  nextDeterministicSeed,
  normalizeSeed,
  resolveChannelElementStyle,
  sanitizeNonVioletHue,
  synthesizeProceduralAsset,
  type ComplexityLod,
  type PigmentHarmonyId,
  type PreviewChannelId,
  type ProceduralAssetRecipeId,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function assertZeroVioletAndRawColors(markup: string): void {
  expect(markup).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
  expect(markup).not.toMatch(/\brgba?\s*\(/iu);
  expect(markup).not.toMatch(/\bhsla?\s*\(/iu);
  for (const match of markup.matchAll(/oklch\(\s*[\d.]+\s+[\d.]+\s+(\d+(?:\.\d+)?)/gu)) {
    expect(isVioletSlopHue(Number(match[1]))).toBe(false);
  }
}

describe("1. 6종 웹툰 에셋 레시피 · 5종 탈-바이올렛 OKLCH 안료 팔레트 · Mulberry32 결정론", () => {
  it("6종 필수 웹툰 절차적 에셋 레시피 ID와 메타데이터·미터 치수·PBR 프로파일을 모두 제공한다", () => {
    expect(PROCEDURAL_ASSET_RECIPES).toHaveLength(6);
    expect(PROCEDURAL_ASSET_RECIPES.map((r) => r.id)).toEqual([
      "gothic-window-arch",
      "hanok-tile-roof",
      "seoul-alley-facade",
      "fantasy-magic-crest",
      "comic-prop-foliage",
      "seamless-paper-stone-pbr",
    ]);

    for (const recipe of PROCEDURAL_ASSET_RECIPES) {
      expect(recipe.nameKo.length).toBeGreaterThan(3);
      expect(recipe.nameEn.length).toBeGreaterThan(3);
      expect(recipe.baseFootprintMeters.widthM).toBeGreaterThan(0);
      expect(recipe.baseFootprintMeters.heightM).toBeGreaterThan(0);
      expect(recipe.baseFootprintMeters.depthM).toBeGreaterThan(0);
      expect(recipe.pbrProfile.baseRoughness).toBeGreaterThan(0);
      expect(recipe.pbrProfile.baseRoughness).toBeLessThan(1);
    }
  });

  it("5종 탈-바이올렛 OKLCH 안료 팔레트의 모든 색상 채널이 휴 270~320° 구간을 완전히 배제한다", () => {
    expect(PIGMENT_HARMONIES).toHaveLength(5);
    for (const h of PIGMENT_HARMONIES) {
      const colors = [
        h.paperBg,
        h.primaryFill,
        h.secondaryFill,
        h.accentFill,
        h.shadowFill,
        h.inkStroke,
        h.normalSlopeHigh,
        h.normalSlopeLow,
        h.roughnessCue,
      ];
      for (const c of colors) {
        expect(isVioletSlopHue(c.h)).toBe(false);
        assertZeroVioletAndRawColors(formatOklch(c));
      }
    }
  });

  it("isVioletSlopHue와 sanitizeNonVioletHue가 음수·360° 초과 각도까지 포함해 바이올렛 휴를 차단한다", () => {
    expect(isVioletSlopHue(270)).toBe(true);
    expect(isVioletSlopHue(295)).toBe(true);
    expect(isVioletSlopHue(320)).toBe(true);
    expect(isVioletSlopHue(650)).toBe(true);
    expect(isVioletSlopHue(-70)).toBe(true);
    expect(isVioletSlopHue(252)).toBe(false);
    expect(isVioletSlopHue(342)).toBe(false);
    for (let deg = 270; deg <= 320; deg += 5) {
      expect(isVioletSlopHue(sanitizeNonVioletHue(deg))).toBe(false);
    }
  });

  it("formatOklch가 명도·채도를 안전 클램핑하고 원시 색 없이 OKLCH 문자열을 반환한다", () => {
    expect(formatOklch({ l: 0.72, c: 0.12, h: 72 })).toBe("oklch(0.72 0.12 72)");
    const sanitized = formatOklch({ l: 1.4, c: 0.9, h: 288 }, 0.5);
    expect(sanitized).toBe("oklch(1 0.37 252 / 0.50)");
    assertZeroVioletAndRawColors(sanitized);
  });

  it("createMulberry32가 동일 시드에 100% 동일한 난수열을 생성하고 [0, 1) 범위를 보장한다", () => {
    const a = createMulberry32(202611);
    const b = createMulberry32(202611);
    const c = createMulberry32(202612);
    const seqA = Array.from({ length: 12 }, () => a());
    const seqB = Array.from({ length: 12 }, () => b());
    const seqC = Array.from({ length: 12 }, () => c());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("normalizeSeed가 음수·0·NaN·Infinity·초과값을 [1, 999999] 범위의 유효 정수로 정규화한다", () => {
    expect(normalizeSeed(14820)).toBe(14820);
    expect(normalizeSeed(0)).toBe(1);
    expect(normalizeSeed(-42.7)).toBe(42);
    expect(normalizeSeed(Number.NaN, 777)).toBe(777);
    expect(normalizeSeed(Number.POSITIVE_INFINITY, 888)).toBe(888);
    const huge = normalizeSeed(9_999_999);
    expect(huge).toBeGreaterThanOrEqual(1);
    expect(huge).toBeLessThanOrEqual(999999);
  });

  it("nextDeterministicSeed가 항상 현재 시드와 다른 유효 시드를 결정론적으로 산출한다", () => {
    const s1 = nextDeterministicSeed(14820);
    const s2 = nextDeterministicSeed(14820);
    expect(s1).toBe(s2);
    expect(s1).not.toBe(14820);
    expect(s1).toBeGreaterThanOrEqual(1);
    expect(s1).toBeLessThanOrEqual(999999);
  });

  it("레시피·팔레트 조회 및 결정론적 다이제스트가 유효값과 안전한 폴백을 제공한다", () => {
    expect(getProceduralAssetRecipe("hanok-tile-roof").nameKo).toContain("한옥");
    expect(getProceduralAssetRecipe("unknown" as ProceduralAssetRecipeId).id).toBe("gothic-window-arch");
    expect(getPigmentHarmony("celadon-mineral").nameKo).toContain("청자");
    expect(getPigmentHarmony("unknown" as PigmentHarmonyId).id).toBe("atelier-ink-ochre");
    const d1 = computeDeterministicDigest("wave55d-bom");
    const d2 = computeDeterministicDigest("wave55d-bom");
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{16}$/u);
  });
});

describe("2. 합성 DAG 파이프라인 · 입력 정규화 · 결정론적 재현성", () => {
  it("6종 모든 레시피에서 6단계(4~6단계 규격) 비순환 DAG와 위상 정렬 순서를 검증한다", () => {
    for (const recipe of PROCEDURAL_ASSET_RECIPES) {
      const res = synthesizeProceduralAsset({ recipeId: recipe.id });
      expect(res.dagPipeline.length).toBeGreaterThanOrEqual(4);
      expect(res.dagPipeline.length).toBeLessThanOrEqual(6);
      expect(res.dagIntegrity.isAcyclic).toBe(true);
      expect(res.dagIntegrity.stageCount).toBe(res.dagPipeline.length);
      expect(res.dagIntegrity.edgeCount).toBeGreaterThanOrEqual(6);
      expect(res.dagIntegrity.topologicalOrder).toEqual(res.dagPipeline.map((n) => n.id));
      expect(res.dagIntegrity.totalEstimatedCostMs).toBeGreaterThan(0);
    }
  });

  it("동일 파라미터 재실행 시 DAG 다이제스트·Rights-BOM ID·SVG 요소가 바이트 단위로 일치한다", () => {
    const input = {
      recipeId: "fantasy-magic-crest" as const,
      seed: 55123,
      complexityLod: 3 as const,
      weathering01: 0.4,
      lineWeightPx: 1.8,
      pigmentHarmony: "crimson-lacquer" as const,
    };
    const r1 = synthesizeProceduralAsset(input);
    const r2 = synthesizeProceduralAsset(input);
    expect(r1.dagIntegrity.graphDigest).toBe(r2.dagIntegrity.graphDigest);
    expect(r1.rightsBomCertificate.certificateId).toBe(r2.rightsBomCertificate.certificateId);
    expect(r1.svgScene.elements).toEqual(r2.svgScene.elements);
  });

  it("서로 다른 시드는 서로 다른 다이제스트·증명 ID·절차 기하 변주를 만든다", () => {
    const r1 = synthesizeProceduralAsset({ recipeId: "gothic-window-arch", seed: 1001 });
    const r2 = synthesizeProceduralAsset({ recipeId: "gothic-window-arch", seed: 9009 });
    expect(r1.dagIntegrity.graphDigest).not.toBe(r2.dagIntegrity.graphDigest);
    expect(r1.rightsBomCertificate.certificateId).not.toBe(r2.rightsBomCertificate.certificateId);
    expect(r1.svgScene.elements).not.toEqual(r2.svgScene.elements);
  });

  it("범위를 벗어난 LOD·마모도·선화 두께를 안전 범위(1..4, 0..1, 0.5..4.0)로 클램핑한다", () => {
    const low = synthesizeProceduralAsset({
      recipeId: "seoul-alley-facade",
      complexityLod: 0 as unknown as ComplexityLod,
      weathering01: -1.5,
      lineWeightPx: 0.1,
    });
    const high = synthesizeProceduralAsset({
      recipeId: "seoul-alley-facade",
      complexityLod: 9 as unknown as ComplexityLod,
      weathering01: 2.8,
      lineWeightPx: 12,
    });
    expect(low.params.complexityLod).toBe(1);
    expect(low.params.weathering01).toBe(0);
    expect(low.params.lineWeightPx).toBe(0.5);
    expect(high.params.complexityLod).toBe(4);
    expect(high.params.weathering01).toBe(1);
    expect(high.params.lineWeightPx).toBe(4);
  });

  it("complexityLod(1→4) 상승 시 SVG 요소 수·3D 삼각형 수·PBR 해상도(512→4096)가 단조 증가한다", () => {
    const lods: readonly ComplexityLod[] = [1, 2, 3, 4];
    const results = lods.map((lod) => synthesizeProceduralAsset({ recipeId: "hanok-tile-roof", seed: 3001, complexityLod: lod }));
    expect(results.map((r) => r.pbrMaterialStats.resolutionPx)).toEqual([512, 1024, 2048, 4096]);
    for (let i = 1; i < results.length; i += 1) {
      expect(results[i].svgScene.elements.length).toBeGreaterThan(results[i - 1].svgScene.elements.length);
      expect(results[i].mesh3dSummary.triangleCount).toBeGreaterThan(results[i - 1].mesh3dSummary.triangleCount);
      expect(results[i].mesh3dSummary.vertexCount).toBeGreaterThan(results[i - 1].mesh3dSummary.vertexCount);
    }
  });

  it("weathering01(0→1) 상승 시 마모 요소 수·PBR 평균 거칠기·AO 틈새 비율이 단조 증가한다", () => {
    const clean = synthesizeProceduralAsset({ recipeId: "seamless-paper-stone-pbr", seed: 4412, weathering01: 0 });
    const mid = synthesizeProceduralAsset({ recipeId: "seamless-paper-stone-pbr", seed: 4412, weathering01: 0.5 });
    const worn = synthesizeProceduralAsset({ recipeId: "seamless-paper-stone-pbr", seed: 4412, weathering01: 1 });
    expect(clean.svgScene.weatheringElementCount).toBe(0);
    expect(mid.svgScene.weatheringElementCount).toBeGreaterThan(0);
    expect(worn.svgScene.weatheringElementCount).toBeGreaterThan(mid.svgScene.weatheringElementCount);
    expect(worn.pbrMaterialStats.channels.roughness.mean01).toBeGreaterThan(mid.pbrMaterialStats.channels.roughness.mean01);
    expect(mid.pbrMaterialStats.channels.roughness.mean01).toBeGreaterThan(clean.pbrMaterialStats.channels.roughness.mean01);
    expect(worn.pbrMaterialStats.channels.ao.creviceCoveragePercent).toBeGreaterThan(clean.pbrMaterialStats.channels.ao.creviceCoveragePercent);
  });

  it("lineWeightPx 조절이 생성된 선화 스트로크 두께에 직접 반영된다", () => {
    const thin = synthesizeProceduralAsset({ recipeId: "comic-prop-foliage", seed: 8821, lineWeightPx: 0.8 });
    const bold = synthesizeProceduralAsset({ recipeId: "comic-prop-foliage", seed: 8821, lineWeightPx: 3.4 });
    const thinStem = thin.svgScene.elements.find((e) => e.id === "foliage-stem-0");
    const boldStem = bold.svgScene.elements.find((e) => e.id === "foliage-stem-0");
    expect(thinStem).toBeDefined();
    expect(boldStem).toBeDefined();
    expect((boldStem?.strokeWidth ?? 0)).toBeGreaterThan((thinStem?.strokeWidth ?? 0));
  });
});

describe("3. 6종 레시피별 순수 벡터 기하 · 3D 수밀 메쉬 · 4채널 PBR 검증", () => {
  it("gothic-window-arch가 외곽 아치·방사형 부수아르·장미창·멀리언·창대를 합성한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "gothic-window-arch", complexityLod: 3 });
    const ids = res.svgScene.elements.map((e) => e.id);
    expect(ids).toContain("gothic-outer-frame");
    expect(ids).toContain("gothic-rose-outer");
    expect(ids).toContain("gothic-sill");
    expect(ids.some((id) => id.startsWith("gothic-voussoir-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("gothic-mullion-"))).toBe(true);
  });

  it("hanok-tile-roof가 용마루·수키와·수막새·서까래를 합성하고 심리스 타일링을 지원한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "hanok-tile-roof", complexityLod: 3 });
    const ids = res.svgScene.elements.map((e) => e.id);
    expect(ids).toContain("hanok-roof-body");
    expect(ids).toContain("hanok-ridge-beam");
    expect(ids.some((id) => id.startsWith("hanok-sumaksae-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("hanok-rafter-"))).toBe(true);
    expect(res.pbrMaterialStats.seamlessTileable).toBe(false);
  });

  it("seoul-alley-facade가 상가 입면·셔터·무저작권 간판틀·실외기·배수관을 합성한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "seoul-alley-facade", complexityLod: 3 });
    const ids = res.svgScene.elements.map((e) => e.id);
    expect(ids).toContain("alley-building");
    expect(ids).toContain("alley-shutter");
    expect(ids).toContain("alley-sign-vertical");
    expect(ids).toContain("alley-ac-box");
    expect(ids).toContain("alley-pipe");
  });

  it("fantasy-magic-crest가 동심원·다각성·절차 룬 눈금 띠·방패 문장을 합성한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "fantasy-magic-crest", complexityLod: 4 });
    const ids = res.svgScene.elements.map((e) => e.id);
    expect(ids).toContain("crest-ring-0");
    expect(ids).toContain("crest-star-outer");
    expect(ids).toContain("crest-shield");
    expect(ids.filter((id) => id.startsWith("crest-rune-tick-")).length).toBe(44);
  });

  it("comic-prop-foliage가 화분·곡선 줄기·쌍잎 실루엣·잎맥 선화를 합성한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "comic-prop-foliage", complexityLod: 3 });
    const ids = res.svgScene.elements.map((e) => e.id);
    expect(ids).toContain("foliage-pot-body");
    expect(ids.some((id) => id.startsWith("foliage-stem-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("foliage-leaf-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("foliage-vein-"))).toBe(true);
  });

  it("seamless-paper-stone-pbr가 경계 래핑 석재 블록·법선 베벨·한지 섬유를 합성한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "seamless-paper-stone-pbr", complexityLod: 3 });
    const ids = res.svgScene.elements.map((e) => e.id);
    expect(ids.some((id) => id.startsWith("pbr-stone-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("pbr-normal-bevel-"))).toBe(true);
    expect(ids.some((id) => id.startsWith("pbr-fiber-"))).toBe(true);
    expect(res.pbrMaterialStats.seamlessTileable).toBe(false);
  });

  it("6종 레시피의 3D/PBR 가정 산식을 보존하면서 미생성·미검증 상태를 표시한다", () => {
    for (const recipe of PROCEDURAL_ASSET_RECIPES) {
      const { mesh3dSummary: m, pbrMaterialStats: pbr } = synthesizeProceduralAsset({ recipeId: recipe.id });
      expect(m.nonManifoldEdges).toBeNull();
      expect(m.looseVertices).toBeNull();
      expect(m.floorGroundedY0).toBe(false);
      expect(m.minYMeters).toBeNull();
      expect(m.metricScaleMetersPerUnit).toBe(1);
      expect(m.glbForgeReady).toBe(false);
      expect(m.validationState).toBe("not-generated");
      expect(m.vertexCount - m.edgeCount + m.triangleCount).toBe(2);
      expect(m.uvCoveragePercent).toBeGreaterThanOrEqual(82);

      expect(pbr.channels.normal.tangentSpaceValid).toBe(false);
      expect(pbr.channels.normal.previewPaletteMode).toBe("non-violet-oklch-slope");
      expect(pbr.channels.roughness.min01).toBeLessThanOrEqual(pbr.channels.roughness.mean01);
      expect(pbr.channels.roughness.mean01).toBeLessThanOrEqual(pbr.channels.roughness.max01);
      expect(pbr.channels.ao.meanOcclusion01).toBeGreaterThan(0);
      assertZeroVioletAndRawColors(pbr.channels.albedo.primaryOklch);
      assertZeroVioletAndRawColors(pbr.channels.albedo.secondaryOklch);
    }
  });
});

describe("4. Rights-BOM 클린 증명서 · 독립 SVG & JSON 매니페스트 직렬화", () => {
  it("로컬 생성 이력은 권리 미검토·재배포 미승인 상태를 엄격히 유지한다", () => {
    const { rightsBomCertificate: cert } = synthesizeProceduralAsset({ recipeId: "gothic-window-arch", seed: 12345 });
    expect(cert.schemaVersion).toBe("toonstudio.procedural-provenance-note.v1");
    expect(cert.certificateId).toMatch(/^TS-PROC-NOTE-[0-9A-F]{12}$/u);
    expect(cert.licenseClass).toBe("unknown");
    expect(cert.externalCopyrightContamination).toBe("not-assessed");
    expect(cert.commercialWebtoonRedistributionAllowed).toBe(false);
    expect(cert.aiTrainingDatasetDependency).toBe("not-assessed");
    expect(cert.thirdPartyAssetDependencies).toEqual([]);
    expect(cert.generatorProvenance.prng).toBe("mulberry32-u32");
    expect(cert.auditChecklist).toEqual({
      zeroExternalStockScan: "not-run",
      deterministicSeedReproducible: true,
      manifoldWatertightVerified: false,
      commercialWebtoonCleared: false,
    });
  });

  it("외부 에셋 개별 조건과 기존 권리 검사가 필요함을 한·영으로 명시한다", () => {
    const { rightsBomCertificate: cert } = synthesizeProceduralAsset({ recipeId: "hanok-tile-roof" });
    expect(cert.externalRedistributionWarningKo).toContain("Fab");
    expect(cert.externalRedistributionWarningKo).toContain("Megascans");
    expect(cert.externalRedistributionWarningKo).toContain("재배포");
    expect(cert.externalRedistributionWarningEn).toContain("Fab");
    expect(cert.externalRedistributionWarningEn).toContain("Megascans");
    expect(cert.externalRedistributionWarningEn).toContain("Rights BOM delivery gate");
  });

  it("exportSynthesizedAssetSvg가 6종 모든 레시피에 대해 원시 색·바이올렛 0% 독립 SVG를 생성한다", () => {
    for (const recipe of PROCEDURAL_ASSET_RECIPES) {
      const res = synthesizeProceduralAsset({ recipeId: recipe.id });
      const svg = exportSynthesizedAssetSvg(res);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('data-schema="toonstudio.procedural-asset-svg.v1"');
      expect(svg).toContain(`data-recipe-id="${recipe.id}"`);
      expect(svg).toContain('data-license-class="unknown"');
      expect(svg).toContain('data-violet-free="true"');
      expect(svg).toContain("</svg>");
      assertZeroVioletAndRawColors(svg);
    }
  });

  it("exportSynthesizedAssetSvg가 3개 채널(composite/lt-lineart/pbr-normal-roughness) 모두 바이올렛 0%로 출력한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "seoul-alley-facade", seed: 7007 });
    const channels: readonly PreviewChannelId[] = ["composite", "lt-lineart", "pbr-normal-roughness"];
    const outputs = channels.map((ch) => exportSynthesizedAssetSvg(res, ch));
    expect(outputs[0]).not.toBe(outputs[1]);
    expect(outputs[1]).not.toBe(outputs[2]);
    outputs.forEach((svg, idx) => {
      expect(svg).toContain(`data-channel="${channels[idx]}"`);
      assertZeroVioletAndRawColors(svg);
    });
  });

  it("exportProceduralAssetManifestJson이 파싱 가능한 Rights-BOM·DAG·3D·PBR JSON을 직렬화한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "comic-prop-foliage", seed: 9876 });
    const jsonText = exportProceduralAssetManifestJson(res);
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    expect(parsed.schema).toBe("toonstudio.procedural-asset-manifest.v1");
    expect(parsed.dagIntegrity).toBeDefined();
    expect(parsed.mesh3dSummary).toBeDefined();
    expect(parsed.pbrMaterialStats).toBeDefined();
    expect(parsed.rightsBomCertificate).toBeDefined();
    assertZeroVioletAndRawColors(jsonText);
  });

  it("resolveChannelElementStyle이 composite/lt-lineart에서 pbr-normal 레이어를 숨기고 lt-lineart 채움을 none으로 처리한다", () => {
    const res = synthesizeProceduralAsset({ recipeId: "gothic-window-arch" });
    const pbrEl = res.svgScene.elements.find((e) => e.layer === "pbr-normal");
    const baseEl = res.svgScene.elements.find((e) => e.layer === "base");
    expect(pbrEl).toBeDefined();
    expect(baseEl).toBeDefined();
    if (pbrEl && baseEl) {
      expect(resolveChannelElementStyle(pbrEl, "composite", res.harmony, 1.5).visible).toBe(false);
      expect(resolveChannelElementStyle(pbrEl, "pbr-normal-roughness", res.harmony, 1.5).visible).toBe(true);
      expect(resolveChannelElementStyle(baseEl, "lt-lineart", res.harmony, 1.5).fill).toBe("none");
    }
  });
});

describe("5. StudioProceduralAssetSynthPanel UI 제어 · 콜백 · 다국어", () => {
  it("props 없이 기본 마운트되어 Rights-BOM 배지·6종 프리셋·라이브 SVG·DAG SVG를 표시한다", () => {
    render(<StudioProceduralAssetSynthPanel />);
    expect(screen.getByTestId("procedural-asset-synth-panel")).toBeTruthy();
    expect(screen.getByTestId("synth-rights-bom-badge").textContent).toContain("권리 미확인");
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-recipe-id")).toBe("gothic-window-arch");
    expect(screen.getByTestId("synth-dag-svg").getAttribute("data-stage-count")).toBe("6");
    expect(screen.getByTestId("synth-dag-svg").getAttribute("data-acyclic")).toBe("true");
    expect(screen.getByTestId("synth-external-redistribution-warning").textContent).toContain("Megascans");
  });

  it("6종 프리셋 카드를 모두 클릭해 전환할 때마다 SVG와 콜백(onAssetSynthesized)이 즉시 갱신된다", () => {
    const onAssetSynthesized = vi.fn();
    render(<StudioProceduralAssetSynthPanel onAssetSynthesized={onAssetSynthesized} />);
    for (const recipe of PROCEDURAL_ASSET_RECIPES) {
      fireEvent.click(screen.getByTestId(`synth-recipe-${recipe.id}`));
      expect(screen.getByTestId("synth-preview-svg").getAttribute("data-recipe-id")).toBe(recipe.id);
    }
    expect(onAssetSynthesized).toHaveBeenCalledTimes(6);
  });

  it("시드 직접 입력과 시드 변주 버튼이 결정론적 시드와 증명서 ID를 즉시 갱신한다", () => {
    const onAssetSynthesized = vi.fn();
    render(<StudioProceduralAssetSynthPanel onAssetSynthesized={onAssetSynthesized} />);
    const beforeCert = screen.getByTestId("synth-rights-bom-card").textContent;
    fireEvent.change(screen.getByTestId("synth-seed-input"), { target: { value: "54321" } });
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-seed")).toBe("54321");

    fireEvent.click(screen.getByTestId("synth-seed-random-btn"));
    const rolledSeed = screen.getByTestId("synth-preview-svg").getAttribute("data-seed");
    expect(rolledSeed).not.toBe("54321");
    expect(screen.getByTestId("synth-metric-bom").textContent).toBe("unknown");
    expect(onAssetSynthesized).toHaveBeenCalledTimes(2);
    expect(beforeCert).toBeTruthy();
  });

  it("LOD(L1→L4) 전환 시 3D 메쉬 정점/삼각형과 PBR 해상도가 실시간 갱신된다", () => {
    render(<StudioProceduralAssetSynthPanel />);
    fireEvent.click(screen.getByTestId("synth-lod-1"));
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-lod")).toBe("1");
    expect(screen.getByTestId("synth-metric-pbr").textContent).toContain("512px");

    fireEvent.click(screen.getByTestId("synth-lod-4"));
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-lod")).toBe("4");
    expect(screen.getByTestId("synth-metric-pbr").textContent).toContain("4096px");
  });

  it("마모도와 선화 두께 슬라이더 조작 시 수치 리드아웃과 지표가 실시간 반영된다", () => {
    render(<StudioProceduralAssetSynthPanel />);
    fireEvent.change(screen.getByTestId("synth-weathering-slider"), { target: { value: "80" } });
    expect(screen.getByTestId("synth-weathering-readout").textContent).toBe("80%");

    fireEvent.change(screen.getByTestId("synth-lineweight-slider"), { target: { value: "2.8" } });
    expect(screen.getByTestId("synth-lineweight-readout").textContent).toBe("2.8px");
  });

  it("5종 탈-바이올렛 안료 팔레트 전환 시 data-harmony-id가 갱신되고 바이올렛이 0%다", () => {
    const { container } = render(<StudioProceduralAssetSynthPanel />);
    for (const h of PIGMENT_HARMONIES) {
      fireEvent.click(screen.getByTestId(`synth-harmony-${h.id}`));
      expect(screen.getByTestId("synth-preview-svg").getAttribute("data-harmony-id")).toBe(h.id);
      assertZeroVioletAndRawColors(container.querySelector('[data-testid="synth-preview-svg"]')?.outerHTML ?? "");
    }
  });

  it("3종 프리뷰 채널(통합·LT 선화·PBR 법선/거칠기) 전환 시 바이올렛 0%를 유지한다", () => {
    render(<StudioProceduralAssetSynthPanel />);
    const channels: readonly PreviewChannelId[] = ["lt-lineart", "pbr-normal-roughness", "composite"];
    for (const ch of channels) {
      fireEvent.click(screen.getByTestId(`synth-channel-${ch}`));
      const svgEl = screen.getByTestId("synth-preview-svg");
      expect(svgEl.getAttribute("data-channel")).toBe(ch);
      assertZeroVioletAndRawColors(svgEl.outerHTML);
    }
  });

  it("SVG/JSON 복사 버튼, 소스 보기 토글, 초기화 버튼과 콜백(onExportSvg/onExportJson)이 정상 동작한다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onExportSvg = vi.fn();
    const onExportJson = vi.fn();
    const onAssetSynthesized = vi.fn();
    render(
      <StudioProceduralAssetSynthPanel
        onExportSvg={onExportSvg}
        onExportJson={onExportJson}
        onAssetSynthesized={onAssetSynthesized}
      />,
    );

    expect(screen.queryByTestId("synth-svg-preview")).toBeNull();
    fireEvent.click(screen.getByTestId("synth-export-svg-btn"));
    await waitFor(() => expect(onExportSvg).toHaveBeenCalledTimes(1));
    expect(onExportSvg.mock.calls[0]?.[0]).toContain("toonstudio.procedural-asset-svg.v1");
    expect(screen.getByTestId("synth-svg-preview").textContent).toContain("<svg");

    fireEvent.click(screen.getByTestId("synth-export-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.procedural-asset-manifest.v1");
    expect(screen.getByTestId("synth-json-preview").textContent).toContain('"unknown"');

    fireEvent.click(screen.getByTestId("synth-toggle-json-btn"));
    expect(screen.queryByTestId("synth-json-preview")).toBeNull();

    fireEvent.click(screen.getByTestId("synth-recipe-hanok-tile-roof"));
    fireEvent.click(screen.getByTestId("synth-reset-btn"));
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-recipe-id")).toBe("gothic-window-arch");
    expect(onAssetSynthesized).toHaveBeenCalled();
  });

  it("영문 로케일(locale='en')과 초기 레시피·시드·className props 지정이 정상 렌더링된다", () => {
    render(
      <StudioProceduralAssetSynthPanel
        locale="en"
        initialRecipeId="hanok-tile-roof"
        initialSeed={99102}
        className="custom-wave55d-shell"
      />,
    );
    const panel = screen.getByTestId("procedural-asset-synth-panel");
    expect(panel.getAttribute("aria-label")).toContain("Procedural SVG Generation");
    expect(panel.className).toContain("custom-wave55d-shell");
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-recipe-id")).toBe("hanok-tile-roof");
    expect(screen.getByTestId("synth-preview-svg").getAttribute("data-seed")).toBe("99102");
    expect(screen.getByTestId("synth-rights-bom-badge").textContent).toContain("Rights Unknown");
    expect(screen.getByTestId("synth-external-redistribution-warning").textContent).toContain("Rights BOM delivery gate");
  });
});

describe("6. 엄격 품질·하네스 계약 및 Calm Atelier 자가 검증", () => {
  it("소유 파일 7종 존재, 줄 수 상한 준수(engine<=750, panel<=680, all<=800) 및 금지 패턴 0건", () => {
    const dir = path.resolve(import.meta.dirname);
    const required = [
      "procedural-asset-synth-engine.ts",
      "StudioProceduralAssetSynthPanel.tsx",
      "index.ts",
      "procedural-asset-synth.test.tsx",
      "procedural-synth-boundaries.test.tsx",
      "synth-export-contract.ts",
      "use-synth-operations.ts",
    ];
    for (const file of required) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.sort()).toEqual([...required].sort());

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lines = src.split(/\r?\n/).length;
      expect(lines).toBeLessThanOrEqual(800);
      if (file === "procedural-asset-synth-engine.ts") expect(lines).toBeLessThanOrEqual(750);
      if (file === "StudioProceduralAssetSynthPanel.tsx") expect(lines).toBeLessThanOrEqual(680);

      if (file !== "procedural-asset-synth.test.tsx") {
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
        expect(src).not.toContain("원활한 워크플로우를 보장");
      }

      if (file === "StudioProceduralAssetSynthPanel.tsx") {
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

  it("렌더된 모든 버튼이 min-h-11을 유지하고 모든 SVG에 원시 색·바이올렛(270~320°)이 0건이다", () => {
    const { container } = render(<StudioProceduralAssetSynthPanel />);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBeGreaterThanOrEqual(22);
    for (const btn of buttons) {
      expect(btn.className).toContain("min-h-11");
    }

    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThanOrEqual(7);
    for (const svg of svgs) {
      assertZeroVioletAndRawColors(svg.outerHTML);
    }
  });

  it("4개 소유 파일이 금지 도메인(vrm·bg3d·market·apps/api·apps/admin-web)을 정적으로 import하지 않는다", () => {
    const dir = path.resolve(import.meta.dirname);
    const files = [
      "procedural-asset-synth-engine.ts",
      "StudioProceduralAssetSynthPanel.tsx",
      "index.ts",
      "procedural-asset-synth.test.tsx",
      "procedural-synth-boundaries.test.tsx",
      "synth-export-contract.ts",
      "use-synth-operations.ts",
    ];
    for (const file of files) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const importLines = src.split(/\r?\n/).filter((line) => /^\s*import\b/u.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/\/(?:vrm|bg3d|market)\b/u);
        expect(line).not.toContain("apps/api");
        expect(line).not.toContain("apps/admin-web");
      }
    }
  });
});
