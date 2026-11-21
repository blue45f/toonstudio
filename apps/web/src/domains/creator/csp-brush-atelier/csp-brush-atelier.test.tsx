// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushV6RecipeShelf } from "../brush-lab/StudioBrushV6RecipeShelf";
import { StudioCspFullBrushAtelierPanel } from "./StudioCspFullBrushAtelierPanel";
import {
  CSP_ALL_36_BRUSH_CATALOG,
  CSP_BRUSH_CATEGORIES,
  CSP_BRUSH_CATEGORY_IDS,
  type CspBrushId,
  filterCspBrushes,
  getCspBrushById,
} from "./csp-all-categories-brush-catalog";
import {
  renderCspBrushStrokePreviewStrip,
  runCspStroke10kBudgetCheck,
  samplePaperSubstrateHeight,
  synthesizeCspBrushPhysicalStamp,
} from "./csp-procedural-texture-synthesizer";

afterEach(cleanup);

const REQUIRED_36_BRUSH_IDS: readonly CspBrushId[] = [
  "csp-g-pen",
  "csp-real-g-pen",
  "csp-mapping-pen",
  "csp-turnip-pen",
  "csp-textured-pen",
  "csp-darker-pencil",
  "csp-lighter-pencil",
  "csp-real-pencil",
  "csp-design-pencil",
  "csp-wax-crayon",
  "csp-oil-pastel",
  "csp-chalk",
  "csp-charcoal",
  "csp-transparent-wc",
  "csp-opaque-wc",
  "csp-dense-wc",
  "csp-watery-brush",
  "csp-oil-paint",
  "csp-gouache",
  "csp-palette-knife",
  "csp-flat-oil-blender",
  "csp-dry-sumi",
  "csp-wet-sumi",
  "csp-rough-wash",
  "csp-calligraphy-fude",
  "csp-soft-airbrush",
  "csp-hard-airbrush",
  "csp-tone-scraping",
  "csp-rofan-lace-frill",
  "csp-sakura-petals",
  "csp-sparkle-starlight",
  "csp-chain-foliage",
  "csp-kneaded-eraser",
  "csp-vector-intersect-eraser",
  "csp-fingertip-smudge",
  "csp-painterly-blender",
];

function requireBrush(id: CspBrushId) {
  const found = getCspBrushById(id);
  if (!found) throw new Error(`Missing brush: ${id}`);
  return found;
}

describe("1. 클립스튜디오 9대 카테고리 × 36종 카탈로그 정본 무결성", () => {
  it("정확히 9대 카테고리 × 36종 브러시가 중복 없이 카테고리 정원과 일치한다", () => {
    expect(CSP_BRUSH_CATEGORY_IDS).toHaveLength(9);
    expect(CSP_BRUSH_CATEGORIES).toHaveLength(9);
    expect(CSP_ALL_36_BRUSH_CATALOG).toHaveLength(36);

    const uniqueIds = new Set(CSP_ALL_36_BRUSH_CATALOG.map((brush) => brush.id));
    expect(uniqueIds.size).toBe(36);

    for (const category of CSP_BRUSH_CATEGORIES) {
      const members = CSP_ALL_36_BRUSH_CATALOG.filter((brush) => brush.category === category.id);
      expect(members).toHaveLength(category.expectedCount);
    }
  });

  it("지시된 36개 공식 브러시 ID가 100% 누락 없이 등록되어 있다", () => {
    const catalogIds = new Set(CSP_ALL_36_BRUSH_CATALOG.map((brush) => brush.id));
    for (const id of REQUIRED_36_BRUSH_IDS) {
      expect(catalogIds.has(id)).toBe(true);
    }
  });

  it("전 36종 브러시의 필압 범위·간격·경도·OKLCH 색 토큰(원시 HEX 0건)이 유효하다", () => {
    for (const brush of CSP_ALL_36_BRUSH_CATALOG) {
      expect(brush.pressureSizeRange[0]).toBeLessThanOrEqual(brush.pressureSizeRange[1]);
      expect(brush.pressureOpacityRange[0]).toBeLessThanOrEqual(brush.pressureOpacityRange[1]);
      expect(brush.spacingRatio).toBeGreaterThan(0.04);
      expect(brush.spacingRatio).toBeLessThanOrEqual(0.5);
      expect(brush.hardness01).toBeGreaterThanOrEqual(0);
      expect(brush.hardness01).toBeLessThanOrEqual(1);
      expect(brush.previewInkOklch).toMatch(/^oklch\(/);
      expect(brush.previewInkOklch).not.toMatch(/#[0-9a-fA-F]{3,8}/);
      expect(brush.nameKo.trim().length).toBeGreaterThan(0);
    }
  });

  it("getCspBrushById는 유효 ID를 조회하고 미등록 ID에는 undefined를 반환한다", () => {
    expect(getCspBrushById("csp-wax-crayon")?.nameKo).toBe("왁스 크레용");
    expect(getCspBrushById("csp-vector-intersect-eraser")?.operationMode).toBe("vector-erase");
    expect(getCspBrushById("non-existent-brush")).toBeUndefined();
  });

  it("filterCspBrushes는 카테고리·한글·영문 ID·전각 정규화 검색을 정확히 처리한다", () => {
    expect(filterCspBrushes("pen", "")).toHaveLength(5);
    expect(filterCspBrushes("airbrush", "")).toHaveLength(3);
    expect(filterCspBrushes("all", "로판 레이스").map((b) => b.id)).toEqual([
      "csp-rofan-lace-frill",
    ]);
    expect(filterCspBrushes("all", "  ＰＡＬＥＴＴＥ  knife ").map((b) => b.id)).toEqual([
      "csp-palette-knife",
    ]);
    expect(filterCspBrushes("watercolor", "왁스")).toEqual([]);
  });

  it("6종 종이·바탕 높이장은 결정론적이며 황목·한지·캔버스가 무결 대비 뚜렷한 요철을 보인다", () => {
    const grains = [
      "cold-press-rough",
      "cold-press-medium",
      "hanji-fiber",
      "canvas-weave",
    ] as const;

    for (const grain of grains) {
      const a = samplePaperSubstrateHeight(grain, 12.5, 21.3, 0x25d0);
      const b = samplePaperSubstrateHeight(grain, 12.5, 21.3, 0x25d0);
      expect(a).toBe(b);

      let min = 1;
      let max = 0;
      for (let i = 0; i < 40; i += 1) {
        const h = samplePaperSubstrateHeight(grain, i * 1.9, i * 1.3, 0x25d0);
        if (h < min) min = h;
        if (h > max) max = h;
      }
      expect(max - min).toBeGreaterThan(0.35);
    }
    expect(samplePaperSubstrateHeight("none", 12.5, 21.3, 0x25d0)).toBe(1);
  });
});

describe("2. 9대 카테고리별 실측 물리 픽셀 질감 합성 검증", () => {
  it("전 36종 브러시 스탬프 합성이 NaN 없이 활성 픽셀과 유효 RGBA/Float32를 생성한다", () => {
    for (const brush of CSP_ALL_36_BRUSH_CATALOG) {
      const result = synthesizeCspBrushPhysicalStamp({ brush, size: 48, pressure01: 0.7 });
      expect(result.alpha).toHaveLength(48 * 48);
      expect(result.rgba).toHaveLength(48 * 48 * 4);
      expect(result.heightMap).toHaveLength(48 * 48);
      expect(result.metrics.activePixelCount).toBeGreaterThan(60);
      expect(Number.isFinite(result.metrics.entropyBits)).toBe(true);
      expect(Number.isFinite(result.metrics.meanAlpha)).toBe(true);
      expect(result.metrics.meanAlpha).toBeGreaterThan(0.12);
    }
  });

  it("[펜] G펜은 선명한 고밀도 코어를 갖고, 리얼 G펜·질감 펜은 종이 결에 의한 더 높은 질감 엔트로피를 보인다", () => {
    const gPen = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-g-pen"),
      pressure01: 0.65,
    });
    const realGPen = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-real-g-pen"),
      pressure01: 0.45,
    });
    const texturedPen = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-textured-pen"),
      pressure01: 0.45,
    });

    expect(gPen.metrics.meanAlpha).toBeGreaterThan(0.75);
    expect(gPen.metrics.paperValleySkipRatio).toBeLessThan(0.05);
    expect(realGPen.metrics.entropyBits).toBeGreaterThan(gPen.metrics.entropyBits);
    expect(texturedPen.metrics.entropyBits).toBeGreaterThan(gPen.metrics.entropyBits);
  });

  it("[펜] 둥근펜(마루펜)은 순무펜보다 극세 코어 활성 면적이 좁고 정밀하다", () => {
    const mappingPen = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-mapping-pen"),
      pressure01: 0.6,
    });
    const turnipPen = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-turnip-pen"),
      pressure01: 0.6,
    });
    expect(mappingPen.metrics.activePixelCount).toBeLessThan(turnipPen.metrics.activePixelCount);
  });

  it("[연필] 진한 연필은 연한 연필보다 밀도가 높고, 디자인 연필은 틸트 증가 시 활성 면적이 확장된다", () => {
    const darker = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-darker-pencil"),
      pressure01: 0.65,
    });
    const lighter = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-lighter-pencil"),
      pressure01: 0.65,
    });
    expect(darker.metrics.meanAlpha).toBeGreaterThan(lighter.metrics.meanAlpha);

    const designUpright = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-design-pencil"),
      pressure01: 0.65,
      tilt01: 0.05,
    });
    const designTilted = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-design-pencil"),
      pressure01: 0.65,
      tilt01: 0.9,
    });
    expect(designTilted.metrics.activePixelCount).toBeGreaterThan(
      designUpright.metrics.activePixelCount,
    );
  });

  it("[연필] 리얼 연필은 저필압에서 황목 종이 골 스킵률이 고필압보다 크게 높다", () => {
    const lowP = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-real-pencil"),
      pressure01: 0.25,
    });
    const highP = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-real-pencil"),
      pressure01: 0.92,
    });
    expect(lowP.metrics.paperValleySkipRatio).toBeGreaterThan(highP.metrics.paperValleySkipRatio);
    expect(lowP.metrics.entropyBits).toBeGreaterThan(2.0);
  });

  it("[파스텔·크레용] 왁스 크레용은 저필압 산/골 씹힘(골 스킵) > 고필압 소성 채움과 외곽 부스러기 산란을 만든다", () => {
    const lowP = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-wax-crayon"),
      pressure01: 0.24,
    });
    const highP = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-wax-crayon"),
      pressure01: 0.94,
    });
    expect(lowP.metrics.paperValleySkipRatio).toBeGreaterThan(0.25);
    expect(lowP.metrics.paperValleySkipRatio).toBeGreaterThan(highP.metrics.paperValleySkipRatio);
    expect(lowP.metrics.scatterClusterCount).toBeGreaterThanOrEqual(10);
    expect(lowP.metrics.entropyBits).toBeGreaterThan(2.4);
  });

  it("[파스텔·크레용] 오일 파스텔은 높은 임파스토 부조를 갖고, 분필·목탄은 높은 분말 엔트로피를 유지한다", () => {
    const oilPastel = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-oil-pastel"),
      pressure01: 0.72,
    });
    const chalk = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-chalk"),
      pressure01: 0.55,
    });
    const charcoal = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-charcoal"),
      pressure01: 0.55,
    });
    expect(oilPastel.metrics.impastoReliefPeak).toBeGreaterThan(0.22);
    expect(chalk.metrics.entropyBits).toBeGreaterThan(2.2);
    expect(chalk.metrics.scatterClusterCount).toBeGreaterThanOrEqual(10);
    expect(charcoal.metrics.entropyBits).toBeGreaterThan(2.2);
  });

  it("[수채] 투명 수채·진한 수채·물 많은 붓은 모두 모세관 가장자리 엣지 다크닝(> 1.05x)을 실측 증명한다", () => {
    const transparent = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-transparent-wc"),
      pressure01: 0.62,
    });
    const dense = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-dense-wc"),
      pressure01: 0.62,
    });
    const watery = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-watery-brush"),
      pressure01: 0.62,
    });
    expect(transparent.metrics.edgeDarkeningRatio).toBeGreaterThan(1.08);
    expect(dense.metrics.edgeDarkeningRatio).toBeGreaterThan(1.05);
    expect(watery.metrics.edgeDarkeningRatio).toBeGreaterThan(1.18);
  });

  it("[수채] 불투명 수채는 투명 수채보다 높은 피복력을 갖고 물 많은 붓이 가장 강한 백런 엣지를 보인다", () => {
    const opaque = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-opaque-wc"),
      pressure01: 0.72,
    });
    const transparent = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-transparent-wc"),
      pressure01: 0.72,
    });
    const watery = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-watery-brush"),
      pressure01: 0.72,
    });
    expect(opaque.metrics.meanAlpha).toBeGreaterThan(transparent.metrics.meanAlpha);
    expect(watery.metrics.edgeDarkeningRatio).toBeGreaterThan(opaque.metrics.edgeDarkeningRatio);
  });

  it("[유화·두꺼운 채색] 유화 평붓과 팔레트 나이프는 강한 브리슬 비등방성과 임파스토 하이라이트 리지를 만든다", () => {
    const oil = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-oil-paint"),
      pressure01: 0.75,
      directionRadians: 0,
    });
    const knife = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-palette-knife"),
      pressure01: 0.75,
      directionRadians: 0,
    });
    expect(oil.metrics.bristleAnisotropyIndex).toBeGreaterThan(1.45);
    expect(oil.metrics.impastoReliefPeak).toBeGreaterThan(0.35);
    expect(knife.metrics.bristleAnisotropyIndex).toBeGreaterThan(1.35);
    expect(knife.metrics.impastoReliefPeak).toBeGreaterThan(0.45);
  });

  it("[유화·두꺼운 채색] 과슈는 높은 매트 피복을 유지하고 유화 혼색 평붓은 브리슬 결을 남긴다", () => {
    const gouache = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-gouache"),
      pressure01: 0.75,
    });
    const flatBlender = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-flat-oil-blender"),
      pressure01: 0.72,
    });
    expect(gouache.metrics.meanAlpha).toBeGreaterThan(0.55);
    expect(flatBlender.metrics.bristleAnisotropyIndex).toBeGreaterThan(1.35);
  });

  it("[먹·동양화 붓] 갈필 먹붓은 한지 비백 스트릭으로 높은 비등방성(>1.5x)을, 번짐 먹붓은 부드러운 농담 번짐을 만든다", () => {
    const drySumi = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-dry-sumi"),
      pressure01: 0.48,
      directionRadians: 0,
    });
    const wetSumi = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-wet-sumi"),
      pressure01: 0.62,
      directionRadians: 0,
    });
    const fude = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-calligraphy-fude"),
      pressure01: 0.78,
      directionRadians: 0,
    });
    expect(drySumi.metrics.bristleAnisotropyIndex).toBeGreaterThan(1.55);
    expect(drySumi.metrics.alphaStdDev).toBeGreaterThan(0.24);
    expect(wetSumi.metrics.bristleAnisotropyIndex).toBeLessThan(
      drySumi.metrics.bristleAnisotropyIndex,
    );
    expect(fude.metrics.meanAlpha).toBeGreaterThan(drySumi.metrics.meanAlpha);
  });

  it("[에어브러시] 부드러운 에어브러시는 중심->외곽 연속 감쇠(<0.55x)를, 톤 깎기는 다수 미세 스크래치 산포를 만든다", () => {
    const softAir = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-soft-airbrush"),
      pressure01: 0.72,
    });
    const hardAir = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-hard-airbrush"),
      pressure01: 0.72,
    });
    const toneScrape = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-tone-scraping"),
      pressure01: 0.72,
    });
    expect(softAir.metrics.edgeDarkeningRatio).toBeLessThan(0.55);
    expect(hardAir.metrics.meanAlpha).toBeGreaterThan(softAir.metrics.meanAlpha);
    expect(toneScrape.metrics.scatterClusterCount).toBeGreaterThan(40);
  });

  it("[데코레이션 & 지우개·혼색] 패턴 4종은 서로 구별되는 픽셀 구조를 만들고, 지우개/블렌더 4종은 고유 모드를 유지한다", () => {
    const lace = synthesizeCspBrushPhysicalStamp({ brush: requireBrush("csp-rofan-lace-frill") });
    const petals = synthesizeCspBrushPhysicalStamp({ brush: requireBrush("csp-sakura-petals") });
    const sparkle = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-sparkle-starlight"),
    });
    const chain = synthesizeCspBrushPhysicalStamp({ brush: requireBrush("csp-chain-foliage") });

    let laceVsPetalsDiff = 0;
    let sparkleVsChainDiff = 0;
    for (let i = 0; i < lace.alpha.length; i += 1) {
      laceVsPetalsDiff += Math.abs(lace.alpha[i]! - petals.alpha[i]!);
      sparkleVsChainDiff += Math.abs(sparkle.alpha[i]! - chain.alpha[i]!);
    }
    expect(laceVsPetalsDiff).toBeGreaterThan(220);
    expect(sparkleVsChainDiff).toBeGreaterThan(220);
    expect(petals.metrics.scatterClusterCount).toBeGreaterThan(20);
    expect(sparkle.metrics.scatterClusterCount).toBeGreaterThan(20);

    const kneaded = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-kneaded-eraser"),
      pressure01: 0.55,
    });
    const vectorEraser = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-vector-intersect-eraser"),
      pressure01: 0.85,
    });
    const smudge = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-fingertip-smudge"),
      pressure01: 0.7,
    });
    const painterly = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-painterly-blender"),
      pressure01: 0.72,
    });
    expect(vectorEraser.metrics.meanAlpha).toBeGreaterThan(kneaded.metrics.meanAlpha);
    expect(smudge.metrics.activePixelCount).toBeGreaterThan(500);
    expect(painterly.metrics.bristleAnisotropyIndex).toBeGreaterThan(1.35);
  });
});

describe("3. 제로-할당 버퍼 · 실시간 스트로크 프리뷰 · 10,000점 O(1) 무지연 불변식", () => {
  it("재사용 타깃 버퍼를 넘기면 추가 할당 없이 동일 TypedArray 인스턴스를 재사용한다", () => {
    const size = 48;
    const alphaBuf = new Float32Array(size * size);
    const rgbaBuf = new Uint8ClampedArray(size * size * 4);
    const heightBuf = new Float32Array(size * size);

    const res = synthesizeCspBrushPhysicalStamp({
      brush: requireBrush("csp-oil-paint"),
      size,
      pressure01: 0.7,
      reusableAlpha: alphaBuf,
      reusableRgba: rgbaBuf,
      reusableHeight: heightBuf,
    });

    expect(res.metrics.reusedBuffers).toBe(true);
    expect(res.alpha).toBe(alphaBuf);
    expect(res.rgba).toBe(rgbaBuf);
    expect(res.heightMap).toBe(heightBuf);
  });

  it("renderCspBrushStrokePreviewStrip이 전 9대 카테고리 대표 브러시(채색·지우개·블렌더)의 픽셀을 렌더링한다", () => {
    const samples: readonly CspBrushId[] = [
      "csp-g-pen",
      "csp-real-pencil",
      "csp-wax-crayon",
      "csp-transparent-wc",
      "csp-oil-paint",
      "csp-dry-sumi",
      "csp-soft-airbrush",
      "csp-rofan-lace-frill",
      "csp-vector-intersect-eraser",
    ];
    for (const id of samples) {
      const strip = renderCspBrushStrokePreviewStrip({
        brush: requireBrush(id),
        width: 180,
        height: 56,
        pressure01: 0.72,
      });
      expect(strip.rgba).toHaveLength(180 * 56 * 4);
      expect(strip.stampedDabs).toBeGreaterThanOrEqual(9);
      expect(strip.nonEmptyPixels).toBeGreaterThan(300);
    }
  });

  it("전 9대 카테고리 대표 브러시가 10,000점 연속 획 O(1) 무지연 예산을 통과한다", () => {
    const samples: readonly CspBrushId[] = [
      "csp-g-pen",
      "csp-real-pencil",
      "csp-wax-crayon",
      "csp-watery-brush",
      "csp-oil-paint",
      "csp-dry-sumi",
      "csp-soft-airbrush",
      "csp-sakura-petals",
      "csp-painterly-blender",
    ];
    for (const id of samples) {
      const report = runCspStroke10kBudgetCheck(id, 10_000);
      expect(report.processedPoints).toBe(10_000);
      expect(report.emittedDabs).toBeGreaterThan(500);
      expect(report.nanOutputCount).toBe(0);
      expect(report.droppedStrokeCount).toBe(0);
      expect(report.peakRetainedBytes).toBeLessThanOrEqual(4096);
      expect(report.within60FpsBudget).toBe(true);
    }
  });

  it("10,000점 연속 획 중 NaN 좌표와 0필압 입력이 유입되어도 안전 정화되고 끊김·NaN 출력이 0건이다", () => {
    const report = runCspStroke10kBudgetCheck("csp-wax-crayon", 10_000);
    expect(report.sanitizedInputs).toBeGreaterThanOrEqual(3);
    expect(report.nanOutputCount).toBe(0);
    expect(report.droppedStrokeCount).toBe(0);
    expect(report.avgStepMs).toBeLessThan(0.5);
  });

  it("36종 전 브러시가 고속 연속 획 예산 검증에서 단 1건의 오류·누락 없이 통과한다", () => {
    for (const brush of CSP_ALL_36_BRUSH_CATALOG) {
      const report = runCspStroke10kBudgetCheck(brush, 2000);
      expect(report.processedPoints).toBe(2000);
      expect(report.emittedDabs).toBeGreaterThan(50);
      expect(report.nanOutputCount).toBe(0);
      expect(report.droppedStrokeCount).toBe(0);
      expect(report.within60FpsBudget).toBe(true);
    }
  });
});

describe("4. UI 카테고리 필터 · 브러시 선택 · 프리뷰 조절기 · 지연 마운트 및 CSS 게이트", () => {
  it("초기 렌더링 시 9대 카테고리 필터와 36종 브러시 카드가 모두 노출된다", () => {
    render(<StudioCspFullBrushAtelierPanel />);
    expect(screen.getByTestId("studio-csp-full-brush-atelier-panel")).toBeTruthy();
    expect(screen.getByTestId("csp-visible-count-status").textContent).toContain("36 / 36종");

    for (const category of CSP_BRUSH_CATEGORIES) {
      expect(screen.getByTestId(`csp-category-btn-${category.id}`)).toBeTruthy();
    }
    expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(36);
  });

  it("9대 카테고리 필터 버튼 클릭 시 각 카테고리 정원(5/4/4/4/4/4/3/4/4)대로 필터링되고 전체로 복원된다", () => {
    render(<StudioCspFullBrushAtelierPanel />);
    for (const category of CSP_BRUSH_CATEGORIES) {
      fireEvent.click(screen.getByTestId(`csp-category-btn-${category.id}`));
      expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(
        category.expectedCount,
      );
      expect(
        screen.getByTestId(`csp-category-btn-${category.id}`).getAttribute("aria-pressed"),
      ).toBe("true");
    }

    fireEvent.click(screen.getByTestId("csp-category-btn-all"));
    expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(36);
  });

  it("검색어 입력·Escape 초기화·빈 상태 복원이 정확히 동작한다", () => {
    render(<StudioCspFullBrushAtelierPanel />);
    const input = screen.getByTestId("csp-brush-search-input");

    fireEvent.change(input, { target: { value: "갈필" } });
    expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(2);
    expect(screen.getByTestId("csp-brush-card-csp-dry-sumi")).toBeTruthy();

    fireEvent.change(input, { target: { value: "갈필 먹붓" } });
    expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(1);
    expect(screen.getByTestId("csp-brush-card-csp-dry-sumi")).toBeTruthy();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(36);

    fireEvent.change(input, { target: { value: "없는브러시999" } });
    expect(screen.getByTestId("csp-brush-empty-state")).toBeTruthy();

    fireEvent.click(screen.getByTestId("csp-filter-reset-btn"));
    expect(screen.getByTestId("csp-brush-grid").querySelectorAll("button")).toHaveLength(36);
  });

  it("브러시 카드 선택 시 인스펙터와 실측 물리 지표(수채 엣지 다크닝·유화 임파스토)가 즉시 갱신된다", () => {
    render(<StudioCspFullBrushAtelierPanel />);

    fireEvent.click(screen.getByTestId("csp-brush-card-csp-watery-brush"));
    expect(screen.getByTestId("csp-inspector-brush-name").textContent).toBe("물 많은 붓");
    expect(
      screen.getByTestId("csp-live-stroke-preview").getAttribute("data-brush-id"),
    ).toBe("csp-watery-brush");
    const wcEdge = Number(
      screen.getByTestId("csp-metric-edge-darkening").textContent?.replace("×", ""),
    );
    expect(wcEdge).toBeGreaterThan(1.1);

    fireEvent.click(screen.getByTestId("csp-brush-card-csp-oil-paint"));
    expect(screen.getByTestId("csp-inspector-brush-name").textContent).toBe("유화 평붓");
    const oilAniso = Number(
      screen.getByTestId("csp-metric-anisotropy").textContent?.replace("×", ""),
    );
    expect(oilAniso).toBeGreaterThan(1.4);
  });

  it("필압·종이 요철·혼색·틸트 슬라이더 조작 시 왁스 크레용 물리 수치가 실시간 반응하고 복원 버튼이 되돌린다", () => {
    render(<StudioCspFullBrushAtelierPanel initialBrushId="csp-wax-crayon" />);

    const pressureSlider = screen.getByTestId("csp-slider-pressure");
    fireEvent.change(pressureSlider, { target: { value: "20" } });
    const lowPressureSkip = Number(
      screen.getByTestId("csp-metric-valley-skip").textContent?.replace("%", ""),
    );

    fireEvent.change(pressureSlider, { target: { value: "98" } });
    const highPressureSkip = Number(
      screen.getByTestId("csp-metric-valley-skip").textContent?.replace("%", ""),
    );
    expect(lowPressureSkip).toBeGreaterThan(highPressureSkip);

    fireEvent.change(screen.getByTestId("csp-slider-paper-tooth"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("csp-slider-color-mix"), { target: { value: "85" } });
    fireEvent.change(screen.getByTestId("csp-slider-tilt"), { target: { value: "75" } });

    fireEvent.click(screen.getByTestId("csp-reset-tuning-btn"));
    expect((pressureSlider as HTMLInputElement).value).toBe("68");
  });

  it("작업 적용 콜백과 10,000점 O(1) 무지연 검증 버튼이 즉시 실행되어 결과를 표시한다", () => {
    const onApply = vi.fn();
    render(<StudioCspFullBrushAtelierPanel initialBrushId="csp-g-pen" onApplyBrush={onApply} />);

    fireEvent.click(screen.getByTestId("csp-apply-brush-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0]?.[0]?.id).toBe("csp-g-pen");
    expect(screen.getByTestId("csp-apply-brush-btn").textContent).toContain("적용됨");

    fireEvent.click(screen.getByTestId("csp-run-10k-soak-btn"));
    const soakText = screen.getByTestId("csp-soak-result-box").textContent ?? "";
    expect(soakText).toContain("10,000점 O(1) 무지연 통과");
    expect(soakText).toContain("누락 0건");
  });

  it("StudioBrushV6RecipeShelf 접이식 패널은 기본 닫힘이며 열 때 lazyRetry로 마운트되고, CSS 게이트를 준수한다", async () => {
    render(<StudioBrushV6RecipeShelf selectedId="clean-ink" onChoose={vi.fn()} />);

    const disclosure = screen.getByTestId(
      "studio-csp-full-brush-atelier-disclosure",
    ) as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);
    expect(screen.queryByTestId("studio-csp-full-brush-atelier-panel")).toBeNull();

    disclosure.open = true;
    fireEvent(disclosure, new Event("toggle"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-csp-full-brush-atelier-panel")).toBeTruthy();
    });

    const css = readFileSync(
      resolve(
        process.cwd(),
        "apps/web/src/domains/creator/csp-brush-atelier/csp-brush-atelier.css",
      ),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toContain("transition-all");
    expect(css).toContain("oklch(");
    expect(css).toContain("min-height: 2.75rem");
    expect(css).toContain("prefers-reduced-motion");
  });
});
