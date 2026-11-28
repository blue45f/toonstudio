/**
 * Wave 151 — 다국어(한/일/영) 세로·가로 네온 간판 종횡비 피팅 및
 * 건물 경계·주인공 보호 박스(Keep-Out Box) 무충돌 배치기.
 */

import {
  clampFinite,
  createDeterministicRng,
  DEPTH_BAND_DEFAULT_DISTANCES_M,
  formatOklchCss,
  getCityscapeMoodPreset,
  rectInsideBounds,
  rectOverlaps,
  type CityscapeDepthBand,
  type CityscapeNightMoodId,
  type KeepOutBox2D,
  type NeonSignboardCandidate,
  type NeonSignboardPlacementResult,
  type PlacedNeonSignboard,
  type Rect2D,
  type SignboardOrientation,
  type SignboardScript,
  type SkippedNeonSignboard,
} from "./cityscape-night-types";
import { applyAtmosphericDepthAttenuation } from "./night-color-harmony-and-atmosphere";

export interface NeonSignboardPlacementInput {
  readonly buildingId: string;
  readonly moodId: CityscapeNightMoodId;
  readonly facadeRect: Rect2D;
  readonly depthBand?: CityscapeDepthBand;
  readonly distanceMeters?: number;
  readonly candidates: readonly NeonSignboardCandidate[];
  readonly keepOutBoxes?: readonly KeepOutBox2D[];
  readonly minGapPx?: number;
  readonly facadePaddingPx?: number;
  readonly seed?: string | number;
}

interface SignSlotCandidate {
  readonly rect: Rect2D;
  readonly fontSize: number;
  readonly charCount: number;
  readonly score: number;
}

interface SignSlotSearchOutcome {
  readonly slot: SignSlotCandidate | null;
  readonly sawKeepOutConflict: boolean;
  readonly fitsBoundsAtAnyScale: boolean;
}

export function detectSignboardScript(text: string): SignboardScript {
  const hasKo = /[\uac00-\ud7a3\u3131-\u318e]/u.test(text);
  const hasJa = /[\u3040-\u30ff\u4e00-\u9faf]/u.test(text);
  const hasEn = /[A-Za-z]/u.test(text);
  const count = (hasKo ? 1 : 0) + (hasJa ? 1 : 0) + (hasEn ? 1 : 0);
  if (count > 1) return "mixed";
  if (hasKo) return "ko";
  if (hasJa) return "ja";
  return "en";
}

function measureSignboardDimensions(
  text: string,
  script: SignboardScript,
  orientation: SignboardOrientation,
  fontSizePx: number,
): { readonly width: number; readonly height: number; readonly characterCount: number } {
  const trimmed = text.trim();
  const chars = Array.from(trimmed.length > 0 ? trimmed : "NEON");
  const count = chars.length;
  const glyphWidthRatio = script === "en" ? 0.66 : script === "mixed" ? 0.84 : 0.98;
  const padX = Math.max(6, fontSizePx * 0.45);
  const padY = Math.max(6, fontSizePx * 0.42);

  if (orientation === "vertical") {
    const width = Math.max(16, fontSizePx * 1.48 + padX * 1.2);
    const height = Math.max(width * 1.35, count * fontSizePx * 1.12 + padY * 2);
    return {
      width: Math.round(width * 100) / 100,
      height: Math.round(height * 100) / 100,
      characterCount: count,
    };
  }

  const height = Math.max(16, fontSizePx * 1.52 + padY * 1.2);
  const width = Math.max(height * 1.35, count * fontSizePx * glyphWidthRatio + padX * 2);
  return {
    width: Math.round(width * 100) / 100,
    height: Math.round(height * 100) / 100,
    characterCount: count,
  };
}

function toKeepOutRect(box: KeepOutBox2D): Rect2D {
  const pad = clampFinite(box.paddingPx ?? 4, 0, 64, 4);
  return {
    x: box.x - pad,
    y: box.y - pad,
    width: Math.max(0, box.width) + pad * 2,
    height: Math.max(0, box.height) + pad * 2,
  };
}

function findBestSignSlot(
  cand: NeonSignboardCandidate,
  script: SignboardScript,
  orientation: SignboardOrientation,
  innerBounds: Rect2D,
  keepOutRects: readonly Rect2D[],
  placedSigns: readonly PlacedNeonSignboard[],
  minGapPx: number,
  rng: () => number,
): SignSlotSearchOutcome {
  const baseFontSize = clampFinite(cand.fontSizePx ?? 12.5, 7, 28, 12.5);
  const scaleTiers = [1.0, 0.86, 0.74, 0.62];
  let sawKeepOutConflict = false;
  let fitsBoundsAtAnyScale = false;

  for (const scale of scaleTiers) {
    const fontSize = Math.round(clampFinite(baseFontSize * scale, 6.5, 28, 10) * 100) / 100;
    const dims = measureSignboardDimensions(cand.text, script, orientation, fontSize);
    if (dims.width > innerBounds.width || dims.height > innerBounds.height) {
      continue;
    }
    fitsBoundsAtAnyScale = true;

    const availW = innerBounds.width - dims.width;
    const availH = innerBounds.height - dims.height;
    const cols = 7;
    const rows = 7;
    let best: SignSlotCandidate | null = null;

    for (let ry = 0; ry < rows; ry += 1) {
      for (let rx = 0; rx < cols; rx += 1) {
        const fracX = cols > 1 ? rx / (cols - 1) : 0.5;
        const fracY = rows > 1 ? ry / (rows - 1) : 0.5;
        const rect: Rect2D = {
          x: Math.round((innerBounds.x + availW * fracX) * 100) / 100,
          y: Math.round((innerBounds.y + availH * fracY) * 100) / 100,
          width: dims.width,
          height: dims.height,
        };

        if (!rectInsideBounds(rect, innerBounds)) continue;
        if (keepOutRects.some((ko) => rectOverlaps(rect, ko, 0))) {
          sawKeepOutConflict = true;
          continue;
        }
        if (placedSigns.some((other) => rectOverlaps(rect, other.rect, minGapPx))) {
          continue;
        }

        let score = scale * 40 + (rng() - 0.5) * 0.5;
        if (cand.preferredZone === "edge-left") score += (1 - fracX) * 24;
        else if (cand.preferredZone === "edge-right") score += fracX * 24;
        else if (cand.preferredZone === "lower") score += fracY * 22;
        else if (cand.preferredZone === "upper") score += (1 - fracY) * 22;
        else if (cand.preferredZone === "mid") score += (1 - Math.abs(fracY - 0.5) * 2) * 18;
        else if (orientation === "vertical") score += Math.abs(fracX - 0.5) * 20;
        else score += (0.55 * fracY + (1 - Math.abs(fracX - 0.5)) * 0.45) * 16;

        if (best === null || score > best.score) {
          best = { rect, fontSize, charCount: dims.characterCount, score };
        }
      }
    }
    if (best !== null) {
      return { slot: best, sawKeepOutConflict, fitsBoundsAtAnyScale };
    }
  }

  return { slot: null, sawKeepOutConflict, fitsBoundsAtAnyScale };
}

/**
 * 한/일/영 세로·가로 네온 간판을 글자 수에 맞춘 종횡비로 피팅하고
 * 상호 무충돌(`signOverlapCount === 0`), 건물 경계 준수, 주인공 보호 박스 무침범(`keepOutViolationCount === 0`)으로 배치한다.
 */
export function placeFacadeNeonSignboards(
  input: NeonSignboardPlacementInput,
): NeonSignboardPlacementResult {
  const preset = getCityscapeMoodPreset(input.moodId);
  const depthBand: CityscapeDepthBand = input.depthBand ?? "foreground";
  const distanceMeters = clampFinite(
    input.distanceMeters ?? DEPTH_BAND_DEFAULT_DISTANCES_M[depthBand],
    8,
    500,
    DEPTH_BAND_DEFAULT_DISTANCES_M[depthBand],
  );
  const minGapPx = clampFinite(input.minGapPx ?? 8, 2, 48, 8);
  const padPx = clampFinite(input.facadePaddingPx ?? 6, 0, 40, 6);
  const rng = createDeterministicRng(`${input.seed ?? "wave151-signs"}:${input.buildingId}:${input.moodId}`);

  const innerBounds: Rect2D = {
    x: input.facadeRect.x + padPx,
    y: input.facadeRect.y + padPx,
    width: Math.max(0, input.facadeRect.width - padPx * 2),
    height: Math.max(0, input.facadeRect.height - padPx * 2),
  };
  const keepOutRects = (input.keepOutBoxes ?? []).map(toKeepOutRect);

  const sortedCandidates = input.candidates.slice().sort((a, b) => {
    const prioDiff = (b.priority ?? 50) - (a.priority ?? 50);
    return prioDiff !== 0 ? prioDiff : a.id.localeCompare(b.id);
  });

  const placedSigns: PlacedNeonSignboard[] = [];
  const skippedSigns: SkippedNeonSignboard[] = [];

  for (let idx = 0; idx < sortedCandidates.length; idx += 1) {
    const cand = sortedCandidates[idx];
    if (!cand) continue;
    const script = cand.script ?? detectSignboardScript(cand.text);
    const orientation: SignboardOrientation =
      cand.preferredOrientation ?? (script === "en" ? "horizontal" : "vertical");

    const outcome = findBestSignSlot(
      cand,
      script,
      orientation,
      innerBounds,
      keepOutRects,
      placedSigns,
      minGapPx,
      rng,
    );

    if (outcome.slot === null) {
      skippedSigns.push({
        id: cand.id,
        text: cand.text,
        reason: !outcome.fitsBoundsAtAnyScale
          ? "exceeds-facade-bounds"
          : outcome.sawKeepOutConflict
            ? "keep-out-blocked"
            : "no-collision-free-slot",
      });
      continue;
    }

    const paletteColor =
      cand.accentColorOklch ??
      preset.neonPaletteOklch[idx % preset.neonPaletteOklch.length] ?? { l: 0.72, c: 0.16, h: 210 };
    const finalColor = applyAtmosphericDepthAttenuation(
      paletteColor,
      preset.hazeOklch,
      distanceMeters,
      preset.atmosphericExtinctionBeta,
    );
    const { rect, fontSize, charCount } = outcome.slot;

    placedSigns.push({
      id: cand.id,
      buildingId: input.buildingId,
      text: cand.text,
      script,
      orientation,
      rect,
      aspectRatio: Math.round((rect.width / rect.height) * 1000) / 1000,
      fontSizePx: fontSize,
      characterCount: charCount,
      priority: cand.priority ?? 50,
      accentColorOklch: finalColor,
      accentColorCss: formatOklchCss(finalColor),
      glowRadiusPx: Math.round(clampFinite(preset.neonBloomStrength * 14, 3, 22, 10) * 100) / 100,
    });
  }

  let signOverlapCount = 0;
  for (let i = 0; i < placedSigns.length; i += 1) {
    const a = placedSigns[i];
    if (!a) continue;
    for (let j = i + 1; j < placedSigns.length; j += 1) {
      const b = placedSigns[j];
      if (b && rectOverlaps(a.rect, b.rect, 0)) signOverlapCount += 1;
    }
  }

  let keepOutViolationCount = 0;
  let outOfBoundsCount = 0;
  for (const sign of placedSigns) {
    if (keepOutRects.some((ko) => rectOverlaps(sign.rect, ko, 0))) keepOutViolationCount += 1;
    if (!rectInsideBounds(sign.rect, input.facadeRect)) outOfBoundsCount += 1;
  }

  return {
    buildingId: input.buildingId,
    moodId: input.moodId,
    placedSigns,
    skippedSigns,
    signOverlapCount,
    keepOutViolationCount,
    outOfBoundsCount,
  };
}
