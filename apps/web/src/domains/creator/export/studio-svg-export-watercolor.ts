/**
 * SVG 내보내기 — 수채(watercolor-dabs) 획. `studio-svg-export-freehand-media.ts`에서 떼어 냈다(크기 래칫).
 *
 * 내보내기는 정의상 정착 상태다. 그래서 Canvas 커밋과 같은 시드·같은 플래너·같은 재질 해석을 거친다.
 * - 젖은 종이 레인(`wetPaperBakeProgramId` 핀): Canvas가 시분할로 굽는 것과 같은 create → advance(1)·N →
 *   finish 순서를 동기로 돌려 Beer–Lambert 래스터를 무손실 PNG `<image>`로 싣는다. 바이트는 Canvas 래스터와 같다.
 *   같은 스레드의 호스트 캐시에 결과가 있으면 다시 쓴다(내보내기 Worker 는 매번 새 모듈이라 캐시가 비어 있다).
 *   내보내기 한 번의 굽기 작업량 한도를 넘는 획, 굽기가 다루지 않는 색(반투명·거의 흰 안료), 그리고
 *   `wetPaperBake: "base-wash"`(렌더 경로의 집계·미리보기)는 굽지 않고 베이스 워시를 낸다. 한도를 넘은 획은 근사로 알린다.
 * - 그 밖의 레인: 기존 출력 그대로(인과 v2 = 웻 리본 캐리어, 레거시 = 원 dab).
 */

import { zlibSync } from "fflate";

import {
  applyStudioBrushAliasWatercolorMaterial,
  mapStudioBrushAliasPressureSamples,
  resolveStudioBrushAliasWatercolorPlanSettings,
  type StudioBrushAliasWatercolorDab,
} from "../brush/studio-brush-alias-profile";
import { encodeStudioBrushTipAlphaMapBase64 } from "../brush/studio-brush-tip-stamp";
import {
  planWatercolorBrushDabs,
  watercolorBrushSeedFromKey,
} from "../brush/studio-watercolor-brush";
import {
  planStudioWetRibbonCarrier,
  studioWetRibbonCarrierBatchPathData,
} from "../brush/studio-wet-ribbon-carrier";
import { resolveStudioWetPaperBakeProgramIdForBrush } from "../brush/wet-paper/studio-watercolor-settled-surface";
import {
  compositeStudioWetPaperRaster,
  parseStudioWetPaperPigmentColor,
} from "../brush/wet-paper/studio-wet-paper-composite";
import {
  peekStudioWetPaperBakeResult,
  rememberStudioWetPaperBakeResult,
} from "../brush/wet-paper/studio-wet-paper-host";
import { normalizeStudioWetPaperBakeSettings } from "../brush/wet-paper/studio-wet-paper-programs";
import {
  advanceWetPaperSolve,
  createWetPaperSolve,
  finishWetPaperSolve,
} from "../brush/wet-paper/studio-wet-paper-solver";
import { processFreehandPoints } from "../studio-brush";
import {
  DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
  planCausalWatercolorBrushDabs,
} from "../studio-causal-watercolor-brush";

import { addSkip } from "./studio-svg-export-defs";
import { StudioSvgTextureBudgetError } from "./studio-svg-export-fidelity";
import { escapeXml, fmt, fmtDabOpacity } from "./studio-svg-export-geometry";
import {
  joinSvgPngBytes,
  nextId,
  STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET,
  svgPngChunk,
} from "./studio-svg-export-png";

import type { StudioBrushEngineProgramSet } from "../brush/studio-brush-engine-program-set";
import type { StudioWetPaperRaster } from "../brush/wet-paper/studio-wet-paper-composite";
import type { ExportCtx, SvgDrawElLike } from "./studio-svg-export-types";

/** 젖은 종이 래스터 → RGBA8 PNG(필터 0, zlib 6 — 순수 JS라 플랫폼과 무관하게 바이트 결정적). */
function encodeWetPaperRasterPng(raster: StudioWetPaperRaster): Uint8Array | null {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, raster.width, false);
  view.setUint32(4, raster.height, false);
  header.set([8, 6, 0, 0, 0], 8);
  const rowBytes = raster.width * 4;
  const scanlines = new Uint8Array((rowBytes + 1) * raster.height);
  for (let row = 0; row < raster.height; row += 1) {
    scanlines[row * (rowBytes + 1)] = 0;
    scanlines.set(raster.rgba.subarray(row * rowBytes, (row + 1) * rowBytes), row * (rowBytes + 1) + 1);
  }
  const headerChunk = svgPngChunk("IHDR", header);
  const dataChunk = svgPngChunk("IDAT", zlibSync(scanlines, { level: 6 }));
  const endChunk = svgPngChunk("IEND", new Uint8Array());
  if (!headerChunk || !dataChunk || !endChunk) return null;
  return joinSvgPngBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    headerChunk,
    dataChunk,
    endChunk,
  ]);
}

/**
 * 내보내기 한 번에 젖은 종이 굽기에 쓸 수 있는 작업량(격자 셀 × 스텝). 넘는 획은 굽지 않고 베이스 워시로 내보내고
 * 근사로 알린다. 문서만으로 정해지는 결정적 한도라 같은 문서는 같은 SVG 를 낸다. 실측 0.13~0.7µs/셀·스텝(획 하나
 * 0.4~1.1M)이라 이 한도는 개발 기기에서 최악 약 7초로, 느린 기기에서도 내보내기 Worker 시간 한도(30초) 안이다.
 */
export const STUDIO_SVG_WET_PAPER_BAKE_CELL_STEP_BUDGET = 10_000_000;

/**
 * 젖은 종이 정착 베이크 한 획. 프로그램이 없거나(다른 레인), 유한 dab이 없거나, 색을 굽기로 다룰 수 없거나,
 * 내보내기 작업량 한도를 넘었거나, 굽지 않는 내보내기면 null(호출자가 베이스 워시를 낸다 — Canvas가 래스터 없이
 * 베이스 워시를 그리는 조건과 같다).
 */
function serializeWetPaperBake(
  ctx: ExportCtx,
  el: SvgDrawElLike,
  dabs: readonly StudioBrushAliasWatercolorDab[],
  brush: string,
  runtimeEnginePrograms: StudioBrushEngineProgramSet | null,
  seed: number,
  stroke: string,
  strokeOpacity: number,
): string | null {
  if (ctx.wetPaperBake === "base-wash") return null;
  const programId = resolveStudioWetPaperBakeProgramIdForBrush(brush, runtimeEnginePrograms);
  if (!programId) return null;
  const settings = normalizeStudioWetPaperBakeSettings({ seed, phase: "settled", programId });
  if (!settings) return null;
  // 굽기가 다루지 않는 색은 풀기 전에 걸러 작업량을 쓰지 않는다.
  if (!parseStudioWetPaperPigmentColor(stroke)) return null;
  let result = peekStudioWetPaperBakeResult(dabs, settings);
  if (result === undefined) {
    const solve = createWetPaperSolve(dabs, settings);
    if (solve) {
      const work = solve.state.grid.cells * solve.steps;
      if ((ctx.wetPaperCellSteps ?? 0) + work > STUDIO_SVG_WET_PAPER_BAKE_CELL_STEP_BUDGET) {
        addSkip(ctx, el, "approximated", { code: "wetPaperBakeBudget" });
        return null;
      }
      ctx.wetPaperCellSteps = (ctx.wetPaperCellSteps ?? 0) + work;
      advanceWetPaperSolve(solve, solve.steps);
    }
    result = solve ? finishWetPaperSolve(solve) : null;
    rememberStudioWetPaperBakeResult(dabs, settings, result);
  }
  if (!result) return null;
  const raster = compositeStudioWetPaperRaster(result, stroke);
  if (!raster) return null;
  const png = encodeWetPaperRasterPng(raster);
  if (!png) return null;
  const markup =
    `<g data-brush-engine="wet-paper-bake-v1" data-wet-paper-program="${programId}" `
    + `data-pigment-color="${escapeXml(stroke)}" opacity="${fmtDabOpacity(strokeOpacity)}">`
    + `<image x="${fmt(raster.originXPx)}" y="${fmt(raster.originYPx)}" `
    + `width="${fmt(raster.width * raster.pixelPx)}" height="${fmt(raster.height * raster.pixelPx)}" `
    + `preserveAspectRatio="none" href="data:image/png;base64,${encodeStudioBrushTipAlphaMapBase64(png)}"/></g>`;
  // 내장 래스터는 브러시 텍스처와 같은 직렬화 예산을 쓴다(넘으면 텍스처와 같은 오류로 멈춘다).
  const nextBytes = ctx.brushTextureSerializedUtf16Bytes + markup.length * 2;
  if (!Number.isSafeInteger(nextBytes) || nextBytes > STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET) {
    throw new StudioSvgTextureBudgetError(STUDIO_SVG_BRUSH_TEXTURE_SERIALIZED_UTF16_BYTE_BUDGET);
  }
  ctx.brushTextureSerializedUtf16Bytes = nextBytes;
  return markup;
}

export function serializeStudioSvgWatercolorStroke(
  ctx: ExportCtx,
  el: SvgDrawElLike,
  points: number[],
  stroke: string,
  strokeWidth: number,
  strokeOpacity: number,
  brush: string,
  renderSampleDistance: number,
  runtimeEnginePrograms: StudioBrushEngineProgramSet | null,
): string {
  const watercolorSettings = resolveStudioBrushAliasWatercolorPlanSettings(
    brush,
    strokeWidth
  ) ?? { baseWidth: strokeWidth, spacing: Math.max(0.25, strokeWidth * 0.34) };
  const watercolorSeed = watercolorBrushSeedFromKey(el.id);
  const watercolorPressures = mapStudioBrushAliasPressureSamples(
    brush,
    el.pressures,
    Math.floor(points.length / 2),
    0.55
  );
  if (el.watercolorPipeline === "causal-walker-v2") {
    const plannedDabs = planCausalWatercolorBrushDabs({
        points,
        pressures: watercolorPressures,
        baseWidth: watercolorSettings.baseWidth,
        spacing: watercolorSettings.spacing,
        seed: watercolorSeed,
        maxDabs: DEFAULT_STUDIO_CAUSAL_WATERCOLOR_MAX_DABS,
      }, true);
    // Export is settled by definition — the opt-in living-ink bake runs here exactly as it does
    // on the settled Canvas commit (same seed, same planner), keeping the two surfaces agreeing.
    const dabs = applyStudioBrushAliasWatercolorMaterial(
      brush,
      plannedDabs,
      watercolorSeed,
      "settled",
      runtimeEnginePrograms,
    );
    const wetPaper = serializeWetPaperBake(
      ctx, el, dabs, brush, runtimeEnginePrograms, watercolorSeed, stroke, strokeOpacity,
    );
    if (wetPaper) return wetPaper;
    const wetRibbonPlan = planStudioWetRibbonCarrier(dabs, {
      seed: watercolorSeed,
    });
    if (wetRibbonPlan.batches.length === 0) return "";
    const ribbonPaths = wetRibbonPlan.batches.map((batch) => (
      `<path d="${studioWetRibbonCarrierBatchPathData(batch)}" fill="${escapeXml(stroke)}" opacity="${fmtDabOpacity(batch.opacity * strokeOpacity)}"/>`
    )).join("");
    return `<g data-brush-engine="wet-ribbon-carrier-v2">${ribbonPaths}</g>`;
  }

  // Persisted watercolor without the causal marker is intentionally byte-compatible with the
  // fitted legacy circle plan. Only new v2 strokes may use the directional ribbon carrier.
  const plannedDabs = planWatercolorBrushDabs({
    points: processFreehandPoints(points, renderSampleDistance),
    pressures: watercolorPressures,
    baseWidth: watercolorSettings.baseWidth,
    spacing: watercolorSettings.spacing,
    seed: watercolorSeed,
    maxDabs: 512,
  });
  const dabs = applyStudioBrushAliasWatercolorMaterial(
    brush,
    plannedDabs,
    watercolorSeed,
    "settled",
    runtimeEnginePrograms,
  );
  if (dabs.length === 0) return "";
  const wetPaper = serializeWetPaperBake(
    ctx, el, dabs, brush, runtimeEnginePrograms, watercolorSeed, stroke, strokeOpacity,
  );
  if (wetPaper) return wetPaper;
  const diffuseId = nextId(ctx, "sw");
  ctx.defs.push(
    `<radialGradient id="${diffuseId}" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="${escapeXml(stroke)}"/><stop offset="45%" stop-color="${escapeXml(stroke)}"/><stop offset="100%" stop-color="${escapeXml(stroke)}" stop-opacity="0"/></radialGradient>`
  );
  const circles = dabs.map((dab) => (
    `<circle cx="${fmt(dab.x)}" cy="${fmt(dab.y)}" r="${fmt(dab.radius)}" fill="${dab.role === "diffuse" ? `url(#${diffuseId})` : escapeXml(stroke)}" opacity="${fmtDabOpacity(dab.opacity * strokeOpacity)}"/>`
  )).join("");
  return `<g>${circles}</g>`;
}
