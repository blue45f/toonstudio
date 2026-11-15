/**
 * studio-frame-cut-production.ts
 *
 * Pure cut/frame production helpers for Webtoon authoring (컷 제작):
 * - Gutter presets (`0 · 12 · 24 · 40 · 60px`)
 * - Standard webtoon cut alignment (`left` / `center` / `right` / `full-width`)
 * - Cut-outside drawing restriction (`noClip: false` enforcement across contained strokes/layers)
 * - Liang-Barsky segment clipping of freehand polylines to a rectangular cut frame
 */

import { containingPanel } from "../studio-element-geometry";
import type { El, FrameEl } from "../studio-element-model";

export const STUDIO_CUT_GUTTER_PRESETS_PX = Object.freeze([0, 12, 24, 40, 60] as const);

export type StudioWebtoonCutAlignMode = "left" | "center" | "right" | "full-width";

export interface CutContainedClipSummary {
  readonly totalInside: number;
  readonly clippedCount: number;
  readonly overflowCount: number;
  readonly allRestrictedInsideCut: boolean;
}

export function planWebtoonCutQuickAlign(
  frame: Pick<FrameEl, "x" | "y" | "width" | "height">,
  mode: StudioWebtoonCutAlignMode,
  canvasWidth = 800,
  sideMarginPx = 40,
): Partial<FrameEl> {
  const safeCanvasWidth = Math.max(120, Number.isFinite(canvasWidth) ? canvasWidth : 800);
  const safeMargin = Math.max(0, Math.min(safeCanvasWidth * 0.25, sideMarginPx));
  const width = Math.max(24, frame.width);

  switch (mode) {
    case "left":
      return { x: Math.round(safeMargin) };
    case "center":
      return { x: Math.round((safeCanvasWidth - width) * 0.5) };
    case "right":
      return { x: Math.round(safeCanvasWidth - safeMargin - width) };
    case "full-width": {
      const targetWidth = Math.max(48, Math.round(safeCanvasWidth - safeMargin * 2));
      return { x: Math.round(safeMargin), width: targetWidth };
    }
  }
}

export function summarizeCutContainedClipState(
  frame: FrameEl,
  elements: readonly El[],
): CutContainedClipSummary {
  let totalInside = 0;
  let clippedCount = 0;
  let overflowCount = 0;

  for (const el of elements) {
    if (el.id === frame.id || el.type === "frame") continue;
    const owner = containingPanel(el, elements);
    if (owner?.id !== frame.id) continue;
    totalInside += 1;
    const rawNoClip = (el as El & { noClip?: boolean }).noClip === true;
    if (rawNoClip) {
      overflowCount += 1;
    } else {
      clippedCount += 1;
    }
  }

  return {
    totalInside,
    clippedCount,
    overflowCount,
    allRestrictedInsideCut: overflowCount === 0,
  };
}

export function planCutOutsideDrawRestrictionPatches(
  frame: FrameEl,
  elements: readonly El[],
  restrictOutsideCut: boolean,
): readonly { readonly id: string; readonly patch: Partial<El> }[] {
  const patches: { readonly id: string; readonly patch: Partial<El> }[] = [];
  const nextNoClip = !restrictOutsideCut;

  for (const el of elements) {
    if (el.id === frame.id || el.type === "frame") continue;
    const owner = containingPanel(el, elements);
    if (owner?.id !== frame.id) continue;
    const currentNoClip = (el as El & { noClip?: boolean }).noClip === true;
    if (currentNoClip !== nextNoClip) {
      patches.push({
        id: el.id,
        patch: { noClip: nextNoClip } as Partial<El>,
      });
    }
  }

  return patches;
}

/**
 * Liang-Barsky 2D segment clipping against an axis-aligned cut frame box.
 * Returns clipped polyline pieces strictly inside `[x, y, x+width, y+height]`.
 */
export function clipStrokePolylineToFrameBox(
  points: readonly number[],
  frame: Pick<FrameEl, "x" | "y" | "width" | "height">,
): readonly number[][] {
  if (points.length < 4 || points.length % 2 !== 0) return [];
  const xMin = frame.x;
  const yMin = frame.y;
  const xMax = frame.x + Math.max(1, frame.width);
  const yMax = frame.y + Math.max(1, frame.height);

  const pieces: number[][] = [];
  let activePiece: number[] | null = null;

  for (let i = 0; i <= points.length - 4; i += 2) {
    const x0 = points[i]!;
    const y0 = points[i + 1]!;
    const x1 = points[i + 2]!;
    const y1 = points[i + 3]!;
    const dx = x1 - x0;
    const dy = y1 - y0;

    let t0 = 0;
    let t1 = 1;
    const checks: readonly [number, number][] = [
      [-dx, x0 - xMin],
      [dx, xMax - x0],
      [-dy, y0 - yMin],
      [dy, yMax - y0],
    ];
    let accept = true;
    for (const [p, q] of checks) {
      if (Math.abs(p) < 1e-9) {
        if (q < 0) {
          accept = false;
          break;
        }
      } else {
        const r = q / p;
        if (p < 0) {
          if (r > t1) {
            accept = false;
            break;
          }
          if (r > t0) t0 = r;
        } else {
          if (r < t0) {
            accept = false;
            break;
          }
          if (r < t1) t1 = r;
        }
      }
    }

    if (!accept || t0 > t1) {
      if (activePiece && activePiece.length >= 4) pieces.push(activePiece);
      activePiece = null;
      continue;
    }

    const sx = Math.round((x0 + t0 * dx) * 100) / 100;
    const sy = Math.round((y0 + t0 * dy) * 100) / 100;
    const ex = Math.round((x0 + t1 * dx) * 100) / 100;
    const ey = Math.round((y0 + t1 * dy) * 100) / 100;

    if (!activePiece || t0 > 1e-6) {
      if (activePiece && activePiece.length >= 4) pieces.push(activePiece);
      activePiece = [sx, sy, ex, ey];
    } else {
      activePiece.push(ex, ey);
    }

    if (t1 < 1 - 1e-6) {
      if (activePiece.length >= 4) pieces.push(activePiece);
      activePiece = null;
    }
  }

  if (activePiece && activePiece.length >= 4) {
    pieces.push(activePiece);
  }
  return pieces;
}
