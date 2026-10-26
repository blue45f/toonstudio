/**
 * Sumi 브러시 랩 범용 오픈소스·상용 브러시 커널 모음 (클린룸 수식 내재화).
 *
 * - Harmony 11종 절차적 근접 코드(Sketchy / Shaded / Chrome / Fur / LongFur / Web / Ribbon / Squares / Grid / Circles / Simple)
 * - p5.brush 벡터장 유선 편향(7종 벡터장) 및 다각형 수채 번짐
 * - Paint Tool SAI Ver.2 저필압 블러·고필압 착색 임계값 평가기
 * - Photopea / Photoshop Mixer Brush (Wet / Load / Mix / Flow) KM 안료 저수조 스텝
 * - Pixilart / Aseprite Pixel-Perfect L-코너 제거 및 4×4 Bayer 디더 마스크
 *
 * 외부 전역(Math.random, Date.now, performance 등)을 참조하지 않고 결정론적 Mulberry32 PRNG와
 * Kubelka-Munk(kmMixRgb) 안료 혼합만 사용한다.
 */

import { Pcg32 } from "../core/rng";
import { kmMixRgb } from "../pigment/kubelka-munk";

export type LabHarmonyBrushMode =
  | "simple"
  | "sketchy"
  | "shaded"
  | "chrome"
  | "fur"
  | "longfur"
  | "web"
  | "ribbon"
  | "squares"
  | "grid"
  | "circles";

export interface LabStrokeAnchor2D {
  readonly x: number;
  readonly y: number;
  readonly pressure01?: number;
}

export interface LabHarmonyChordSegment {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly alpha01: number;
  readonly isChordLink: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Harmony 11종 절차적 브러시 세그먼트를 결정론적 시드(`mulberry32`)로 생성한다.
 */
export function generateLabHarmonySegments(
  mode: LabHarmonyBrushMode,
  anchors: readonly LabStrokeAnchor2D[],
  seed = 20261026,
): readonly LabHarmonyChordSegment[] {
  const valid = anchors.filter((a) => Number.isFinite(a.x) && Number.isFinite(a.y));
  if (valid.length < 2) return [];

  const rng = new Pcg32(seed);
  const out: LabHarmonyChordSegment[] = [];
  const history: LabStrokeAnchor2D[] = [valid[0]];

  for (let idx = 1; idx < valid.length; idx += 1) {
    const prev = valid[idx - 1];
    const curr = valid[idx];
    const p = clamp01(curr.pressure01 ?? 0.8);
    history.push(curr);

    out.push({
      x0: Math.fround(prev.x),
      y0: Math.fround(prev.y),
      x1: Math.fround(curr.x),
      y1: Math.fround(curr.y),
      alpha01: Math.fround(clamp01((mode === "web" || mode === "simple" ? 0.5 : 0.1) * p)),
      isChordLink: false,
    });

    if (mode === "simple") continue;

    for (let h = 0; h < history.length - 1; h += 1) {
      const pt = history[h];
      const dx = pt.x - curr.x;
      const dy = pt.y - curr.y;
      const dSq = dx * dx + dy * dy;

      if (mode === "sketchy" && dSq < 4000 && rng.nextF32() > dSq / 2000) {
        out.push({
          x0: Math.fround(curr.x + dx * 0.3),
          y0: Math.fround(curr.y + dy * 0.3),
          x1: Math.fround(pt.x - dx * 0.3),
          y1: Math.fround(pt.y - dy * 0.3),
          alpha01: Math.fround(clamp01(0.05 * p)),
          isChordLink: true,
        });
      } else if (mode === "shaded" && dSq < 1000) {
        out.push({
          x0: Math.fround(curr.x),
          y0: Math.fround(curr.y),
          x1: Math.fround(pt.x),
          y1: Math.fround(pt.y),
          alpha01: Math.fround(clamp01((1 - dSq / 1000) * 0.1 * p)),
          isChordLink: true,
        });
      } else if (mode === "chrome" && dSq < 1000) {
        out.push({
          x0: Math.fround(curr.x + dx * 0.2),
          y0: Math.fround(curr.y + dy * 0.2),
          x1: Math.fround(pt.x - dx * 0.2),
          y1: Math.fround(pt.y - dy * 0.2),
          alpha01: Math.fround(clamp01(0.1 * p)),
          isChordLink: true,
        });
      } else if (mode === "fur" && dSq < 2000 && rng.nextF32() > dSq / 2000) {
        out.push({
          x0: Math.fround(curr.x + dx * 0.5),
          y0: Math.fround(curr.y + dy * 0.5),
          x1: Math.fround(curr.x - dx * 0.5),
          y1: Math.fround(curr.y - dy * 0.5),
          alpha01: Math.fround(clamp01(0.1 * p)),
          isChordLink: true,
        });
      } else if (mode === "longfur" && dSq < 4000 && rng.nextF32() > dSq / 4000) {
        const s = -rng.nextF32();
        out.push({
          x0: Math.fround(curr.x + dx * s),
          y0: Math.fround(curr.y + dy * s),
          x1: Math.fround(pt.x - dx * s + rng.nextF32() * 2),
          y1: Math.fround(pt.y - dy * s + rng.nextF32() * 2),
          alpha01: Math.fround(clamp01(0.05 * p)),
          isChordLink: true,
        });
      } else if (mode === "web" && dSq < 2500 && rng.nextF32() > 0.5) {
        out.push({
          x0: Math.fround(curr.x),
          y0: Math.fround(curr.y),
          x1: Math.fround(pt.x),
          y1: Math.fround(pt.y),
          alpha01: Math.fround(clamp01(0.1 * p)),
          isChordLink: true,
        });
      }
    }
  }

  return out;
}

/**
 * Photopea / Photoshop Mixer Brush 저수조 스텝을 Kubelka-Munk(`kmMixRgb`) 안료 공간에서 수행한다.
 */
export function stepLabKmMixerBrushReservoir(params: {
  readonly wet01: number;
  readonly load01: number;
  readonly mix01: number;
  readonly flow01: number;
  readonly canvasRgb: readonly [number, number, number];
  readonly reservoirRgb: readonly [number, number, number];
  readonly supplyRgb: readonly [number, number, number];
}): {
  readonly canvasRgb: [number, number, number];
  readonly reservoirRgb: [number, number, number];
  readonly transfer01: number;
} {
  const wet = clamp01(params.wet01);
  const load = clamp01(params.load01);
  const mix = clamp01(params.mix01);
  const flow = clamp01(params.flow01);

  const recharged = kmMixRgb(params.reservoirRgb, params.supplyRgb, load * 0.35);
  const pickupWeight = clamp01(wet * mix);
  const nextReservoir = kmMixRgb(recharged, params.canvasRgb, pickupWeight);
  const transfer01 = Math.fround(clamp01(flow * (0.35 + 0.65 * load)));
  const nextCanvas = kmMixRgb(params.canvasRgb, nextReservoir, transfer01);

  return {
    canvasRgb: nextCanvas,
    reservoirRgb: nextReservoir,
    transfer01,
  };
}

/**
 * Paint Tool SAI Ver.2 수채화 필압 임계값 평가기.
 */
export function evaluateLabSaiWatercolorPressure(
  pressure01: number,
  blurThreshold01 = 0.28,
  minDensity01 = 0.2,
  waterBlend01 = 0.75,
): {
  readonly isBlurOnlyMode: boolean;
  readonly depositAlpha01: number;
  readonly blurStrength01: number;
} {
  const p = clamp01(pressure01);
  const threshold = Math.max(0.05, Math.min(0.85, Number.isFinite(blurThreshold01) ? blurThreshold01 : 0.28));
  const minD = clamp01(minDensity01);
  const water = clamp01(waterBlend01);

  if (p <= threshold) {
    const ratio = p / threshold;
    return {
      isBlurOnlyMode: true,
      depositAlpha01: 0,
      blurStrength01: Math.fround(clamp01(water * (0.45 + 0.55 * (1 - ratio)))),
    };
  }

  const above = (p - threshold) / (1 - threshold);
  return {
    isBlurOnlyMode: false,
    depositAlpha01: Math.fround(clamp01(minD + (1 - minD) * above)),
    blurStrength01: Math.fround(clamp01(water * (1 - above * 0.65))),
  };
}

/**
 * Pixilart / Aseprite Pixel-Perfect 1px 직각 코너 제거 필터.
 */
export function filterLabPixelPerfectCells(
  cells: readonly { readonly x: number; readonly y: number }[],
): readonly { readonly x: number; readonly y: number }[] {
  if (cells.length < 3) return [...cells];
  const out: { readonly x: number; readonly y: number }[] = [cells[0]];
  let idx = 1;
  while (idx < cells.length - 1) {
    const prev = out[out.length - 1];
    const curr = cells[idx];
    const next = cells[idx + 1];
    const isLCorner =
      Math.abs(prev.x - curr.x) + Math.abs(prev.y - curr.y) === 1 &&
      Math.abs(curr.x - next.x) + Math.abs(curr.y - next.y) === 1 &&
      prev.x !== next.x &&
      prev.y !== next.y;
    if (isLCorner) {
      out.push(next);
      idx += 2;
    } else {
      out.push(curr);
      idx += 1;
    }
  }
  if (idx === cells.length - 1) {
    out.push(cells[cells.length - 1]);
  }
  return out;
}

/**
 * SculptGL / ZBrush 2.5D Pixol 브러시용 C^2 4차 다항식 폴오프: `f(d) = 3d^4 - 4d^3 + 1` ($d \in [0, 1]$).
 */
export function evaluateLabSculptGlQuarticFalloff01(normalizedDist01: number): number {
  if (!Number.isFinite(normalizedDist01) || normalizedDist01 >= 1) return 0;
  if (normalizedDist01 <= 0) return 1;
  const d = normalizedDist01;
  const d2 = d * d;
  return Math.fround(clamp01(3 * d2 * d2 - 4 * d2 * d + 1));
}

/**
 * Lazy-Brush 원형 마찰 감쇠(`1 - sqrt(1 - (1 - friction)^2)`) 및 불감대 반경 스텝.
 */
export function stepLabLazyBrushCircularFriction(params: {
  readonly brushX: number;
  readonly brushY: number;
  readonly pointerX: number;
  readonly pointerY: number;
  readonly radiusPx: number;
  readonly friction01?: number;
}): {
  readonly brushX: number;
  readonly brushY: number;
  readonly hasMoved: boolean;
} {
  const dx = params.pointerX - params.brushX;
  const dy = params.pointerY - params.brushY;
  const dist = Math.hypot(dx, dy);
  const radius = Math.max(0, params.radiusPx);
  const excess = dist - radius;
  if (Math.round(excess * 10) / 10 <= 0) {
    return {
      brushX: Math.fround(params.brushX),
      brushY: Math.fround(params.brushY),
      hasMoved: false,
    };
  }
  const f = Math.max(0, Math.min(0.98, Number.isFinite(params.friction01) ? (params.friction01 as number) : 0));
  const damp = f > 0 ? 1 - Math.sqrt(Math.max(0, 1 - Math.pow(1 - f, 2))) : 1;
  const moveAngle = Math.atan2(dy, dx) + Math.PI * 0.5;
  const stepDist = excess * damp;
  return {
    brushX: Math.fround(params.brushX + Math.sin(moveAngle) * stepDist),
    brushY: Math.fround(params.brushY - Math.cos(moveAngle) * stepDist),
    hasMoved: true,
  };
}

/**
 * Illustrator / Affinity 골격 아트 브러시 비신축 가이드(Head/Tail Non-Stretch) 템플릿 U 매핑.
 */
export function warpLabSkeletalNonStretchU01(params: {
  readonly arcPositionPx: number;
  readonly totalSpineArcPx: number;
  readonly nominalLengthPx: number;
  readonly headGuide01: number;
  readonly tailGuide01: number;
}): number {
  const total = Math.max(1e-3, params.totalSpineArcPx);
  const s = Math.max(0, Math.min(total, params.arcPositionPx));
  const headGuide = clamp01(params.headGuide01);
  const tailGuide = Math.max(headGuide + 0.05, clamp01(params.tailGuide01));
  const maxEndArc = total * 0.42;
  const headArc = Math.min(headGuide * params.nominalLengthPx, maxEndArc);
  const tailArc = Math.min((1 - tailGuide) * params.nominalLengthPx, maxEndArc);
  const midArc = Math.max(1e-3, total - headArc - tailArc);

  if (s <= headArc && headArc > 1e-3) {
    return Math.fround(clamp01((s / headArc) * headGuide));
  }
  if (s >= total - tailArc && tailArc > 1e-3) {
    const tailProgress = (s - (total - tailArc)) / tailArc;
    return Math.fround(clamp01(tailGuide + tailProgress * (1 - tailGuide)));
  }
  const midProgress = (s - headArc) / midArc;
  return Math.fround(clamp01(headGuide + clamp01(midProgress) * (tailGuide - headGuide)));
}

