// @vitest-environment jsdom

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import {
  CUSTOM_LAB_TIP_CATALOG,
  REAL_MEDIA_TIP_IDS,
  STUDIO_PAPER_TEXTURE_IDS,
  StudioBrushCustomLabPanel,
  TSBRUSH_FORMAT_ID,
  TSBRUSH_SCHEMA_VERSION,
  buildCanonicalTsBrushPayloadJson,
  computeCustomBrushFingerprintSha256,
  computeSha256Hex,
  createDefaultCustomBrushRecipe,
  createRecipeFromCatalogBrush,
  exportCustomBrushToTsBrushJson,
  filterCustomLabCatalogBrushes,
  getCustomLabCatalogBrushes,
  getCustomLabCatalogSummary,
  importCustomBrushFromTsBrushJson,
  renderCustomBrushStrokePreview,
  rgbToCssOklch,
  type CustomBrushRecipe,
} from "./index";

function computeRgbaRmse(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i < len; i += 1) {
    const d = ((a[i] ?? 0) - (b[i] ?? 0)) / 255;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / len);
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  useI18n.setState({ lang: "ko" });
});

describe("Brush Custom Lab Engine — 194종 카탈로그 · 8종 128×128 팁 · 5종 용지 · 갈필 · 16파장 KM · .tsbrush.json SHA-256", () => {
  it("194종 통합 브러시 카탈로그와 8종 팁·5종 용지·16파장 KM 요약을 정확히 로드하고 검색·변환한다", () => {
    const catalog = getCustomLabCatalogBrushes();
    const summary = getCustomLabCatalogSummary();

    expect(catalog).toHaveLength(194);
    expect(summary.totalBrushes).toBe(194);
    expect(summary.tipCount).toBe(8);
    expect(summary.paperCount).toBe(5);
    expect(summary.kmWavelengthBands).toBe(16);
    expect(CUSTOM_LAB_TIP_CATALOG).toHaveLength(8);

    const watercolorMatches = filterCustomLabCatalogBrushes({ query: "watercolor" });
    expect(watercolorMatches.length).toBeGreaterThan(0);

    const first = catalog[0]!;
    const recipe = createRecipeFromCatalogBrush(first);
    expect(recipe.baseCatalogUid).toBe(first.uid);
    expect(REAL_MEDIA_TIP_IDS).toContain(recipe.tipId);
    expect(STUDIO_PAPER_TEXTURE_IDS).toContain(recipe.paperTextureId);
    expect(recipe.radiusPx).toBeGreaterThanOrEqual(4);
    expect(recipe.radiusPx).toBeLessThanOrEqual(28);
  });

  it("8종 실물 128×128 팁과 5종 용지 조합이 서로 구별되는 실시간 RGBA 스트로크 버퍼를 렌더한다", () => {
    const base = createDefaultCustomBrushRecipe();
    const tipBuffers = REAL_MEDIA_TIP_IDS.map((tipId) =>
      renderCustomBrushStrokePreview({ ...base, tipId, dryOutRate01: 0.4, kmMixStrength01: 0.7 }, { width: 160, height: 64 }),
    );

    expect(tipBuffers).toHaveLength(8);
    for (const preview of tipBuffers) {
      expect(preview.rgba).toBeInstanceOf(Uint8ClampedArray);
      expect(preview.rgba.length).toBe(160 * 64 * 4);
      expect(preview.dabCount).toBeGreaterThanOrEqual(12);
      expect(preview.activePixels).toBeGreaterThan(200);
      expect(preview.coverageRatio01).toBeGreaterThan(0.02);
    }

    // 서로 다른 화구 팁 간 RGBA 출력 차이가 명확히 존재해야 한다.
    expect(computeRgbaRmse(tipBuffers[0]!.rgba, tipBuffers[6]!.rgba)).toBeGreaterThan(0.015);
    expect(computeRgbaRmse(tipBuffers[4]!.rgba, tipBuffers[5]!.rgba)).toBeGreaterThan(0.01);

    // 5종 용지 전환 시 종이 결/마찰/배경 톤 차이가 RGBA에 반영된다.
    const bristol = renderCustomBrushStrokePreview(
      { ...base, tipId: "graphite-pencil-6b", paperTextureId: "smooth-bristol", paperGrainStrength01: 0.9 },
      { width: 160, height: 64 },
    );
    const roughCotton = renderCustomBrushStrokePreview(
      { ...base, tipId: "graphite-pencil-6b", paperTextureId: "rough-cotton", paperGrainStrength01: 0.9 },
      { width: 160, height: 64 },
    );
    const linen = renderCustomBrushStrokePreview(
      { ...base, tipId: "hog-bristle-oil", paperTextureId: "linen-canvas", paperGrainStrength01: 0.85 },
      { width: 160, height: 64 },
    );
    expect(roughCotton.paperProfile.toothDepth01).toBeGreaterThan(bristol.paperProfile.toothDepth01);
    expect(roughCotton.paperResistance.dragForce01).toBeGreaterThan(bristol.paperResistance.dragForce01);
    expect(computeRgbaRmse(bristol.rgba, roughCotton.rgba)).toBeGreaterThan(0.01);
    expect(computeRgbaRmse(bristol.rgba, linen.rgba)).toBeGreaterThan(0.015);
  });

  it("갈필(dry-out) 파라미터와 16파장 Kubelka-Munk 광학 혼색(파랑×노랑→초록)이 실제 RGBA 픽셀에 반영된다", () => {
    const base = createDefaultCustomBrushRecipe();

    // 1) 갈필 비교: dryOutRate01 = 0 vs 0.95
    const wetInfinite = renderCustomBrushStrokePreview(
      { ...base, tipId: "hog-bristle-oil", mediaCategory: "oil-impasto", paperTextureId: "rough-cotton", dryOutRate01: 0 },
      { width: 180, height: 64 },
    );
    const heavyDryout = renderCustomBrushStrokePreview(
      { ...base, tipId: "hog-bristle-oil", mediaCategory: "oil-impasto", paperTextureId: "rough-cotton", dryOutRate01: 0.95 },
      { width: 180, height: 64 },
    );
    expect(heavyDryout.dryoutEnd.paintRemaining01).toBeLessThan(heavyDryout.dryoutStart.paintRemaining01);
    expect(heavyDryout.dryoutEnd.paintRemaining01).toBeLessThan(wetInfinite.dryoutEnd.paintRemaining01);
    expect(heavyDryout.dryoutEnd.drySplitFactor01).toBeGreaterThan(wetInfinite.dryoutEnd.drySplitFactor01);
    expect(computeRgbaRmse(wetInfinite.rgba, heavyDryout.rgba)).toBeGreaterThan(0.01);

    // 2) 16파장 Kubelka-Munk 혼색: 울트라마린 블루 + 카드뮴 옐로 교차 영역에서 초록 우세(G > R, G > B)
    const blueOverYellowBase: CustomBrushRecipe = {
      ...base,
      tipId: "sable-watercolor",
      mediaCategory: "watercolor",
      paperTextureId: "cold-press-watercolor",
      radiusPx: 18,
      flow01: 0.55,
      opacity01: 0.72,
      dryOutRate01: 0.15,
      primaryColor: { r: 16, g: 69, b: 216 },
      underlayerColor: { r: 248, g: 214, b: 18 },
    };
    const srgbOnly = renderCustomBrushStrokePreview({ ...blueOverYellowBase, kmMixStrength01: 0 }, { width: 200, height: 72 });
    const kmOptical = renderCustomBrushStrokePreview({ ...blueOverYellowBase, kmMixStrength01: 1 }, { width: 200, height: 72 });

    expect(kmOptical.kmMixSummary.color.g).toBeGreaterThan(kmOptical.kmMixSummary.color.r);
    expect(kmOptical.kmMixSummary.color.g).toBeGreaterThan(kmOptical.kmMixSummary.color.b);
    expect(kmOptical.kmMixSummary.kmGreenDominance).toBeGreaterThanOrEqual(15);
    expect(kmOptical.kmMixSummary.kmSaturation).toBeGreaterThan(kmOptical.kmMixSummary.lerpSaturation * 1.5);
    const kmOverlapGreenDom =
      kmOptical.overlapSampleRgb.g - Math.max(kmOptical.overlapSampleRgb.r, kmOptical.overlapSampleRgb.b);
    const srgbOverlapGreenDom =
      srgbOnly.overlapSampleRgb.g - Math.max(srgbOnly.overlapSampleRgb.r, srgbOnly.overlapSampleRgb.b);
    expect(kmOverlapGreenDom).toBeGreaterThan(srgbOverlapGreenDom + 15);
    expect(kmOptical.overlapSampleRgb.g).toBeGreaterThan(kmOptical.overlapSampleRgb.r);
    expect(kmOptical.overlapSampleRgb.g).toBeGreaterThan(kmOptical.overlapSampleRgb.b);
    expect(computeRgbaRmse(srgbOnly.rgba, kmOptical.rgba)).toBeGreaterThan(0.01);
  });

  it("FIPS 180-4 SHA-256이 Node crypto와 비트 단위로 일치하며 결정론적 .tsbrush.json 내보내기·불러오기·변조 차단을 보장한다", () => {
    // 1) NIST / Node crypto SHA-256 비트 동등성
    for (const sample of ["", "abc", "toonstudio-brush-custom-lab-한글-🚀", "a".repeat(1000)]) {
      const expected = createHash("sha256").update(sample, "utf8").digest("hex");
      expect(computeSha256Hex(sample)).toBe(expected);
    }

    // 2) 결정론적 .tsbrush.json 직렬화 및 왕복 복원
    const recipe = createDefaultCustomBrushRecipe();
    const exportedA = exportCustomBrushToTsBrushJson(recipe);
    const exportedB = exportCustomBrushToTsBrushJson({ ...recipe });

    expect(exportedA.fileName.endsWith(".tsbrush.json")).toBe(true);
    expect(exportedA.document.format).toBe(TSBRUSH_FORMAT_ID);
    expect(exportedA.document.schemaVersion).toBe(TSBRUSH_SCHEMA_VERSION);
    expect(exportedA.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(exportedA.fingerprintSha256).toBe(exportedB.fingerprintSha256);
    expect(exportedA.json).toBe(exportedB.json);
    expect(exportedA.fingerprintSha256).toBe(
      createHash("sha256").update(buildCanonicalTsBrushPayloadJson(recipe), "utf8").digest("hex"),
    );

    const imported = importCustomBrushFromTsBrushJson(exportedA.json);
    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.fingerprintSha256).toBe(exportedA.fingerprintSha256);
      expect(imported.recipe).toEqual(exportedA.document.recipe);
    }

    // 3) 파라미터 1개 변조 시 SHA-256 불일치 차단
    const tamperedDoc = JSON.parse(exportedA.json) as {
      recipe: { radiusPx: number };
      fingerprintSha256: string;
    };
    tamperedDoc.recipe.radiusPx = Math.min(28, tamperedDoc.recipe.radiusPx + 2);
    const tamperedResult = importCustomBrushFromTsBrushJson(JSON.stringify(tamperedDoc));
    expect(tamperedResult.ok).toBe(false);
    if (!tamperedResult.ok) {
      expect(tamperedResult.errorCode).toBe("FINGERPRINT_MISMATCH");
      expect(tamperedResult.expectedFingerprint).toBe(exportedA.fingerprintSha256);
      expect(tamperedResult.actualFingerprint).not.toBe(exportedA.fingerprintSha256);
    }

    // 4) 깨진 JSON · 잘못된 스키마 · 잘못된 팁 ID 차단
    expect(importCustomBrushFromTsBrushJson("{broken").ok).toBe(false);
    expect(importCustomBrushFromTsBrushJson(JSON.stringify({ format: "other", schemaVersion: 1 })).ok).toBe(false);
    const invalidTipDoc = JSON.parse(exportedA.json) as { recipe: { tipId: string } };
    invalidTipDoc.recipe.tipId = "nonexistent-tip";
    const invalidTipResult = importCustomBrushFromTsBrushJson(JSON.stringify(invalidTipDoc));
    expect(invalidTipResult.ok).toBe(false);
    if (!invalidTipResult.ok) expect(invalidTipResult.errorCode).toBe("INVALID_RECIPE");

    // 5) OKLCH 변환기(원시 hex/rgb 없이 UI 스와치 생성)
    expect(rgbToCssOklch({ r: 16, g: 69, b: 216 })).toMatch(/^oklch\(\d+\.\d{3} \d+\.\d{3} \d+\.\d\)$/u);
  });
});

describe("StudioBrushCustomLabPanel — props 없는 단독 렌더 · 상호작용 · Calm Atelier 위생 계약", () => {
  it("props 없이 단독 렌더되며 실시간 팁/용지/슬라이더 변경, KO/EN 전환, .tsbrush.json 내보내기·변조 탐지·복원을 수행한다", () => {
    const { rerender } = render(<StudioBrushCustomLabPanel />);

    const rootSection = document.querySelector<HTMLElement>('[data-studio-brush-custom-lab="true"]')!;
    expect(rootSection).toBeTruthy();
    expect(screen.getByTestId("brush-custom-lab-preview-canvas")).toBeTruthy();
    expect(screen.getByTestId("lab-catalog-count").textContent).toContain("194");

    const initialSha = rootSection.getAttribute("data-tsbrush-sha256")!;
    expect(initialSha).toMatch(/^[0-9a-f]{64}$/u);

    // 8종 팁 중 48돈모 유화붓으로 전환 → SHA-256 즉시 갱신
    const oilTipBtn = document.querySelector<HTMLButtonElement>('[data-lab-tip-id="hog-bristle-oil"]')!;
    fireEvent.click(oilTipBtn);
    expect(oilTipBtn.getAttribute("aria-pressed")).toBe("true");
    const afterTipSha = rootSection.getAttribute("data-tsbrush-sha256")!;
    expect(afterTipSha).not.toBe(initialSha);

    // 5종 용지 중 황목 코튼 300g 선택
    const cottonBtn = document.querySelector<HTMLButtonElement>('[data-lab-paper-id="rough-cotton"]')!;
    fireEvent.click(cottonBtn);
    expect(cottonBtn.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("lab-paper-metric").textContent).toContain("88%");

    // 갈필·KM 슬라이더 조작 → SHA-256 및 계측 반영
    fireEvent.change(screen.getByTestId("slider-dryout"), { target: { value: "0.9" } });
    fireEvent.change(screen.getByTestId("slider-km-mix"), { target: { value: "0.96" } });
    const tunedSha = rootSection.getAttribute("data-tsbrush-sha256")!;
    expect(tunedSha).not.toBe(afterTipSha);

    // .tsbrush.json 내보내기 클릭 → textarea에 결정론적 JSON 기록 + 성공 배너
    fireEvent.click(screen.getByTestId("tsbrush-export-btn"));
    const textarea = screen.getByTestId("tsbrush-json-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toContain(TSBRUSH_FORMAT_ID);
    expect(textarea.value).toContain(tunedSha);
    expect(screen.getByTestId("tsbrush-io-status").getAttribute("role")).toBe("status");

    // 본문 변조 후 검증 불러오기 → SHA-256 불일치 경고(alert)
    const tampered = textarea.value.replace('"dryOutRate01": 0.9', '"dryOutRate01": 0.1');
    fireEvent.change(textarea, { target: { value: tampered } });
    fireEvent.click(screen.getByTestId("tsbrush-import-btn"));
    expect(screen.getByTestId("tsbrush-io-status").getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("tsbrush-io-status").textContent).toContain("SHA-256");

    // 정상 .tsbrush.json 재입력 후 복원 성공
    const validPreset = exportCustomBrushToTsBrushJson({
      ...createDefaultCustomBrushRecipe(),
      tipId: "gpen-nib-elastic",
      paperTextureId: "manga-kent",
      dryOutRate01: 0.2,
    });
    fireEvent.change(textarea, { target: { value: validPreset.json } });
    fireEvent.click(screen.getByTestId("tsbrush-import-btn"));
    expect(screen.getByTestId("tsbrush-io-status").getAttribute("role")).toBe("status");
    expect(rootSection.getAttribute("data-tsbrush-sha256")).toBe(
      computeCustomBrushFingerprintSha256(validPreset.document.recipe),
    );
    expect(document.querySelector('[data-lab-tip-id="gpen-nib-elastic"]')?.getAttribute("aria-pressed")).toBe("true");

    // 영문 로케일 전환
    useI18n.setState({ lang: "en" });
    rerender(<StudioBrushCustomLabPanel />);
    expect(screen.getByRole("region", { name: "Custom Brush Lab" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export .tsbrush.json" })).toBeTruthy();
  });

  it("Calm Atelier 토큰·KV 금지·800줄 이하·44px 터치 타깃·word-break:keep-all·tabular-nums 정적 위생 계약을 충족한다", () => {
    const root = process.cwd();
    const engineSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/brush-custom-lab/brush-custom-lab-engine.ts"),
      "utf8",
    );
    const panelSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/brush-custom-lab/StudioBrushCustomLabPanel.tsx"),
      "utf8",
    );
    const indexSrc = readFileSync(
      resolve(root, "apps/web/src/domains/creator/brush-custom-lab/index.ts"),
      "utf8",
    );

    for (const [name, src] of [
      ["brush-custom-lab-engine.ts", engineSrc],
      ["StudioBrushCustomLabPanel.tsx", panelSrc],
      ["index.ts", indexSrc],
    ] as const) {
      expect(src.split("\n").length, `${name} <= 800줄`).toBeLessThanOrEqual(800);
      expect(src, `${name} localStorage/sessionStorage/indexedDB 금지`).not.toMatch(
        /\b(?:localStorage|sessionStorage|indexedDB)\b/u,
      );
      expect(src.match(/#[0-9a-fA-F]{3,8}\b/gu), `${name} 원시 hex 금지`).toBeNull();
      expect(src.match(/\brgba?\s*\(/gu), `${name} 원시 rgb/rgba 금지`).toBeNull();
      expect(src.match(/\bhsla?\s*\(/gu), `${name} 원시 hsl/hsla 금지`).toBeNull();
    }

    expect(panelSrc).not.toContain("transition-all");
    expect(panelSrc).not.toMatch(/<Sparkles\b/u);
    expect(panelSrc).not.toMatch(/\bfont-black\b|text-\[(?:9px|10px|0\.6rem|0\.625rem)\]/u);
    expect(panelSrc).toContain("[word-break:keep-all]");
    expect(panelSrc).toContain("tabular-nums");
    expect(panelSrc).toContain("min-h-11");
  });
});
