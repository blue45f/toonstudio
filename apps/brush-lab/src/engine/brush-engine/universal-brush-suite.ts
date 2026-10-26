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

/**
 * Philip J. Schneider (`Graphics Gems` / `fit-curve`) $2 \times 2$ Cramer 최소자승 3차 베지어 제어점 피팅.
 */
export function fitLabSchneiderCubicBezier(
  points: readonly LabStrokeAnchor2D[],
): {
  readonly p0: { readonly x: number; readonly y: number };
  readonly ctrl1: { readonly x: number; readonly y: number };
  readonly ctrl2: { readonly x: number; readonly y: number };
  readonly p3: { readonly x: number; readonly y: number };
} | null {
  const valid = points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (valid.length < 2) return null;

  const first = valid[0];
  const last = valid[valid.length - 1];
  const second = valid[1];
  const penult = valid[valid.length - 2];

  const norm = (dx: number, dy: number): readonly [number, number] => {
    const len = Math.hypot(dx, dy);
    return len > 1e-6 ? [dx / len, dy / len] : [1, 0];
  };
  const [ltX, ltY] = norm(second.x - first.x, second.y - first.y);
  const [rtX, rtY] = norm(penult.x - last.x, penult.y - last.y);

  const u: number[] = [0];
  for (let i = 1; i < valid.length; i += 1) {
    u.push(u[i - 1] + Math.hypot(valid[i].x - valid[i - 1].x, valid[i].y - valid[i - 1].y));
  }
  const totalLen = u[u.length - 1];
  for (let i = 0; i < u.length; i += 1) {
    u[i] = totalLen > 1e-6 ? u[i] / totalLen : i / Math.max(1, valid.length - 1);
  }

  let c00 = 0;
  let c01 = 0;
  let c11 = 0;
  let x0 = 0;
  let x1 = 0;

  for (let i = 0; i < valid.length; i += 1) {
    const ui = u[i];
    const mt = 1 - ui;
    const b1 = 3 * ui * mt * mt;
    const b2 = 3 * ui * ui * mt;
    const a0x = ltX * b1;
    const a0y = ltY * b1;
    const a1x = rtX * b2;
    const a1y = rtY * b2;

    c00 += a0x * a0x + a0y * a0y;
    c01 += a0x * a1x + a0y * a1y;
    c11 += a1x * a1x + a1y * a1y;

    const w0 = mt * mt * (1 + 2 * ui);
    const w3 = ui * ui * (3 - 2 * ui);
    const tx = valid[i].x - (first.x * w0 + last.x * w3);
    const ty = valid[i].y - (first.y * w0 + last.y * w3);

    x0 += a0x * tx + a0y * ty;
    x1 += a1x * tx + a1y * ty;
  }

  const det = c00 * c11 - c01 * c01;
  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  const eps = 1e-6 * chord;
  let alphaL = Math.abs(det) > 1e-9 ? (x0 * c11 - x1 * c01) / det : 0;
  let alphaR = Math.abs(det) > 1e-9 ? (c00 * x1 - c01 * x0) / det : 0;
  if (alphaL < eps || alphaR < eps) {
    alphaL = chord / 3;
    alphaR = chord / 3;
  }

  return {
    p0: { x: Math.fround(first.x), y: Math.fround(first.y) },
    ctrl1: { x: Math.fround(first.x + ltX * alphaL), y: Math.fround(first.y + ltY * alphaL) },
    ctrl2: { x: Math.fround(last.x + rtX * alphaR), y: Math.fround(last.y + rtY * alphaR) },
    p3: { x: Math.fround(last.x), y: Math.fround(last.y) },
  };
}

/**
 * Klecks (`bitbof/klecks`) BlendBrush 적응형 스페이싱·샤프니스·KM 물감 혼합 및 SmudgeBrush 스캔라인 순서.
 */
export function evaluateLabKlecksBlendAndSmudgeStep(params: {
  readonly sizePx: number;
  readonly opacity01: number;
  readonly blending01: number;
  readonly prevY: number;
  readonly currY: number;
  readonly brushRgb: readonly [number, number, number];
  readonly canvasRgb: readonly [number, number, number];
}): {
  readonly adaptiveSpacingPx: number;
  readonly radialSharpness01: number;
  readonly mixedRgb: [number, number, number];
  readonly smudgeScanlineOrder: "bottom-to-top" | "top-to-bottom";
} {
  const size = Math.max(0.5, Number.isFinite(params.sizePx) ? params.sizePx : 12);
  const opacity = clamp01(params.opacity01);
  const blending = clamp01(params.blending01);
  const t = clamp01((size - 2.7) / (12 - 2.7));
  const adaptiveSpacingPx = Math.fround(size + ((size * 2) / 9 - size) * t);
  const radialSharpness01 = Math.fround(opacity * opacity * 0.8);
  const mixedRgb = kmMixRgb(params.brushRgb, params.canvasRgb, clamp01(0.45 * blending));
  const smudgeScanlineOrder = params.prevY < params.currY ? "bottom-to-top" : "top-to-bottom";

  return {
    adaptiveSpacingPx,
    radialSharpness01,
    mixedRgb,
    smudgeScanlineOrder,
  };
}

/**
 * Wick Editor Croquis 필압 매핑: $p_{\text{croquis}} = 0.14 + 0.86p$.
 */
export function evaluateLabWickCroquisPressure01(rawPressure01: number): number {
  return Math.fround(0.14 + 0.86 * clamp01(rawPressure01));
}

/**
 * libmypaint `opaque_linearize` 다중 댑 광학 선형화 및 `posterize` / `posterize_num` 이산 색상 양자화.
 */
export function evaluateLabMyPaintOpaqueLinearizeAndPosterize(params: {
  readonly baseOpaque01: number;
  readonly opaqueLinearize01: number;
  readonly dabsPerRadius: number;
  readonly rgb01: readonly [number, number, number];
  readonly posterize01: number;
  readonly posterizeNum: number;
}): {
  readonly linearizedAlphaPerDab01: number;
  readonly quantizedRgb01: [number, number, number];
} {
  const baseOpaque = clamp01(params.baseOpaque01);
  const linearize = clamp01(params.opaqueLinearize01);
  const dabsPerDiameter = Math.max(1, (Number.isFinite(params.dabsPerRadius) ? params.dabsPerRadius : 2) * 2);
  let alphaPerDab = baseOpaque;
  if (linearize > 0 && baseOpaque < 0.999) {
    const linearized = 1 - Math.pow(1 - baseOpaque, 1 / dabsPerDiameter);
    alphaPerDab = clamp01(baseOpaque * (1 - linearize) + linearized * linearize);
  }
  const post = clamp01(params.posterize01);
  const levels = Math.max(2, Math.round(Math.max(0.01, Math.min(1.28, params.posterizeNum)) * 100));
  const quantize = (c: number) => {
    const clamped = clamp01(c);
    const q = Math.floor(clamped * levels) / levels;
    return Math.fround(clamp01(clamped * (1 - post) + q * post));
  };
  return {
    linearizedAlphaPerDab01: Math.fround(alphaPerDab),
    quantizedRgb01: [
      quantize(params.rgb01[0]),
      quantize(params.rgb01[1]),
      quantize(params.rgb01[2]),
    ],
  };
}

/**
 * spectral.js CIE 휘도($Y$) 및 착색력($\text{tintingStrength}^2$) 가중 Kubelka-Munk 혼합.
 */
export function mixLabLuminanceWeightedKubelkaMunk(params: {
  readonly rgbA: readonly [number, number, number];
  readonly factorA: number;
  readonly tintingStrengthA?: number;
  readonly rgbB: readonly [number, number, number];
  readonly factorB: number;
  readonly tintingStrengthB?: number;
}): [number, number, number] {
  const lum = (rgb: readonly [number, number, number]) =>
    Math.max(1e-4, 0.2126 * clamp01(rgb[0]) + 0.7152 * clamp01(rgb[1]) + 0.0722 * clamp01(rgb[2]));
  const fA = Math.max(0, Number.isFinite(params.factorA) ? params.factorA : 0.5);
  const fB = Math.max(0, Number.isFinite(params.factorB) ? params.factorB : 0.5);
  const tA = Math.max(0.01, Number.isFinite(params.tintingStrengthA) ? params.tintingStrengthA! : 1);
  const tB = Math.max(0.01, Number.isFinite(params.tintingStrengthB) ? params.tintingStrengthB! : 1);
  const cA = fA * fA * tA * tA * lum(params.rgbA);
  const cB = fB * fB * tB * tB * lum(params.rgbB);
  const ratioB = cA + cB > 0 ? clamp01(cB / (cA + cB)) : 0.5;
  return kmMixRgb(params.rgbA, params.rgbB, ratioB);
}

/**
 * `perfect-freehand` 속도 기반 가상 필압(`sp * 0.275`) 및 박화(thinning) 반경·테이퍼 계산기.
 */
export function evaluateLabPerfectFreehandSimulatedPressureAndRadius(params: {
  readonly prevPressure01: number;
  readonly distancePx: number;
  readonly sizePx: number;
  readonly thinning: number;
  readonly runningLengthPx?: number;
  readonly totalLengthPx?: number;
  readonly taperStartPx?: number;
  readonly taperEndPx?: number;
}): {
  readonly simulatedPressure01: number;
  readonly radiusPx: number;
} {
  const size = Math.max(1, Number.isFinite(params.sizePx) ? params.sizePx : 16);
  const prevP = clamp01(params.prevPressure01);
  const sp = Math.min(1, Math.max(0, params.distancePx) / size);
  const rp = Math.min(1, 1 - sp);
  const simulatedPressure01 = Math.fround(
    Math.min(1, prevP + (rp - prevP) * (sp * 0.275)),
  );
  const baseRadius =
    size * clamp01(0.5 - params.thinning * (0.5 - simulatedPressure01));
  const runLen = params.runningLengthPx ?? size;
  const totLen = params.totalLengthPx ?? size * 4;
  const ts =
    params.taperStartPx && params.taperStartPx > 0
      ? (() => {
          const t = clamp01(runLen / params.taperStartPx);
          return t * (2 - t);
        })()
      : 1;
  const te =
    params.taperEndPx && params.taperEndPx > 0
      ? (() => {
          const t = clamp01((totLen - runLen) / params.taperEndPx) - 1;
          return t * t * t + 1;
        })()
      : 1;
  return {
    simulatedPressure01,
    radiusPx: Math.fround(Math.max(0.01, baseRadius * Math.min(ts, te))),
  };
}

/**
 * `rough.js` Park-Miller Lehmer LCG (`Math.imul(48271, seed) & 0x7fffffff`) 및 길이 감쇠 이중선 오프셋.
 */
export function generateLabRoughLehmerDoubleStroke(params: {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly roughness?: number;
  readonly bowing?: number;
  readonly seed?: number;
}): {
  readonly dampingFactor: number;
  readonly bowOffset: { readonly x: number; readonly y: number };
  readonly firstPassMidpoint: { readonly x: number; readonly y: number };
  readonly secondPassMidpoint: { readonly x: number; readonly y: number };
} {
  let seed = Math.abs(Math.trunc(params.seed ?? 20261026)) % 2147483647;
  if (seed === 0) seed = 48271;
  const nextRand = (): number => {
    seed = (Math.imul(48271, seed) & 0x7fffffff) >>> 0;
    return seed / 2147483648;
  };
  const dx = params.x2 - params.x1;
  const dy = params.y2 - params.y1;
  const len = Math.hypot(dx, dy);
  const dampingFactor = Math.fround(
    len < 200 ? 1 : len > 500 ? 0.4 : -0.0016668 * len + 1.233334,
  );
  const roughness = params.roughness ?? 1.2;
  const bowing = params.bowing ?? 1.0;
  const maxOff = 2.0;
  const bowX = Math.fround((bowing * maxOff * (params.y2 - params.y1)) / 200);
  const bowY = Math.fround((bowing * maxOff * (params.x1 - params.x2)) / 200);
  const off = () => (nextRand() * 2 - 1) * maxOff * roughness * dampingFactor;
  const mx = (params.x1 + params.x2) * 0.5;
  const my = (params.y1 + params.y2) * 0.5;
  return {
    dampingFactor,
    bowOffset: { x: bowX, y: bowY },
    firstPassMidpoint: {
      x: Math.fround(mx + bowX + off()),
      y: Math.fround(my + bowY + off()),
    },
    secondPassMidpoint: {
      x: Math.fround(mx + bowX * 0.5 + off() * 0.5),
      y: Math.fround(my + bowY * 0.5 + off() * 0.5),
    },
  };
}

/**
 * `evanw/glfx.js` 양방향 지수 가중 디노이즈(`pow(1 - abs(dot(diff, 0.25)), exponent)`) 및 CMYK 4스크린 하프톤 계산기.
 */
export function evaluateLabGlfxColorHalftoneAndDenoise(params: {
  readonly centerRgb01: readonly [number, number, number];
  readonly sampleRgb01: readonly [number, number, number];
  readonly denoiseExponent: number;
  readonly dxPx: number;
  readonly dyPx: number;
  readonly halftoneAngleRad: number;
  readonly halftoneSizePx: number;
}): {
  readonly bilateralWeight01: number;
  readonly halftoneCmyk01: readonly [number, number, number, number];
} {
  const [cr, cg, cb] = [
    clamp01(params.centerRgb01[0]),
    clamp01(params.centerRgb01[1]),
    clamp01(params.centerRgb01[2]),
  ];
  const [sr, sg, sb] = [
    clamp01(params.sampleRgb01[0]),
    clamp01(params.sampleRgb01[1]),
    clamp01(params.sampleRgb01[2]),
  ];
  const dotDiff = (sr - cr) * 0.25 + (sg - cg) * 0.25 + (sb - cb) * 0.25;
  const bilateralWeight01 = Math.fround(
    Math.pow(Math.max(0, 1 - Math.abs(dotDiff)), Math.max(0.5, params.denoiseExponent)),
  );
  const cmyR = 1 - cr;
  const cmyG = 1 - cg;
  const cmyB = 1 - cb;
  const k = Math.min(cmyR, cmyG, cmyB);
  const denom = Math.max(1e-5, 1 - k);
  const c = (cmyR - k) / denom;
  const m = (cmyG - k) / denom;
  const y = (cmyB - k) / denom;
  const scale = Math.PI / Math.max(1, params.halftoneSizePx);
  const pat = (off: number): number => {
    const a = params.halftoneAngleRad + off;
    const sinA = Math.sin(a);
    const cosA = Math.cos(a);
    const px = (cosA * params.dxPx - sinA * params.dyPx) * scale;
    const py = (sinA * params.dxPx + cosA * params.dyPx) * scale;
    return Math.sin(px) * Math.sin(py) * 4;
  };
  return {
    bilateralWeight01,
    halftoneCmyk01: [
      Math.fround(clamp01(c * 10 - 3 + pat(0.26179))),
      Math.fround(clamp01(m * 10 - 3 + pat(1.30899))),
      Math.fround(clamp01(y * 10 - 3 + pat(0))),
      Math.fround(clamp01(k * 10 - 5 + pat(0.78539))),
    ],
  };
}

export function evaluateLabKlecksDistortAndToAlpha(params: {
  readonly x: number; readonly y: number; readonly stepSizePx: number;
  readonly scaleX: number; readonly scaleY: number; readonly strengthX: number; readonly strengthY: number;
  readonly phaseX: number; readonly phaseY: number;
  readonly rgba01: readonly [number, number, number, number]; readonly isInverted: boolean;
}): { readonly warpedX: number; readonly warpedY: number; readonly extractedAlpha01: number } {
  const step = Math.max(1, params.stepSizePx);
  const qx = step > 1 ? Math.floor(params.x / step) * step : params.x;
  const qy = step > 1 ? Math.floor(params.y / step) * step : params.y;
  const wx = Math.sin((qx / Math.max(1e-3, params.scaleX) + params.phaseX) * Math.PI * 2) * params.strengthX;
  const wy = Math.sin((qy / Math.max(1e-3, params.scaleY) + params.phaseY) * Math.PI * 2) * params.strengthY;
  const lum = (clamp01(params.rgba01[0]) + clamp01(params.rgba01[1]) + clamp01(params.rgba01[2])) / 3;
  const rawAlpha = params.isInverted ? 1 - lum : lum;
  return {
    warpedX: Math.fround(qx + wx),
    warpedY: Math.fround(qy + wy),
    extractedAlpha01: Math.fround(Math.min(clamp01(params.rgba01[3]), clamp01(rawAlpha))),
  };
}

export function evaluateKlecksPrecisionSliderMapping(params: {
  readonly slider01: number; readonly min: number; readonly max: number;
  readonly exponent?: number; readonly perpendicularDistancePx?: number; readonly isFineMode?: boolean;
}): { readonly falloffFactor: number; readonly mappedValue: number; readonly roundtripSlider01: number; readonly decimalPlaces: number } {
  const s01 = clamp01(params.slider01);
  const exp = Math.max(0.25, params.exponent ?? 1.6);
  const dPerp = Math.abs(params.perpendicularDistancePx ?? 0);
  const fineMul = params.isFineMode ? 2 : 1;
  const distFactor = Math.min(10, 1 + Math.floor(dPerp / 50) ** 2);
  const falloffFactor = 1 / (distFactor * fineMul);
  const span = Math.max(1e-6, params.max - params.min);
  const mappedValue = params.min + s01 ** exp * span;
  const roundtripSlider01 = clamp01(((mappedValue - params.min) / span) ** (1 / exp));
  const decimalPlaces = Math.abs(mappedValue) < 10 ? 1 : 0;
  return { falloffFactor, mappedValue, roundtripSlider01, decimalPlaces };
}

export function evaluateLabHolisticHomographyAndToneCurve(params: {
  readonly rgb01: readonly [number, number, number];
  readonly hueShiftMinus1To1: number; readonly saturationMinus1To1: number;
  readonly midtoneBoost01: number; readonly baseChannel01: number;
}): { readonly rotatedRgb01: readonly [number, number, number]; readonly curveMidpoint255: number; readonly softLightBlended01: number } {
  const angle = Math.max(-1, Math.min(1, params.hueShiftMinus1To1)) * Math.PI;
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const sqrt3 = Math.sqrt(3);
  const wx = (2 * cosA + 1) / 3;
  const wy = (-sqrt3 * sinA - cosA + 1) / 3;
  const wz = (sqrt3 * sinA - cosA + 1) / 3;
  const [r, g, b] = params.rgb01;
  let hr = r * wx + g * wy + b * wz;
  let hg = r * wz + g * wx + b * wy;
  let hb = r * wy + g * wz + b * wx;
  const avg = (hr + hg + hb) / 3;
  const sat = Math.max(-1, Math.min(1, params.saturationMinus1To1));
  const satMul = sat > 0 ? 1 - 1 / (1.001 - sat) : -sat;
  hr = clamp01(hr + (avg - hr) * satMul);
  hg = clamp01(hg + (avg - hg) * satMul);
  hb = clamp01(hb + (avg - hb) * satMul);
  const curveMidpoint255 = Math.round(clamp01(0.5 + (params.midtoneBoost01 - 0.5) * 0.75) * 255);
  const cb = clamp01(params.baseChannel01);
  const cs = hr;
  const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
  const softLightBlended01 = clamp01(
    cs <= 0.5 ? cb - (1 - 2 * cs) * cb * (1 - cb) : cb + (2 * cs - 1) * (d - cb),
  );
  return { rotatedRgb01: [hr, hg, hb], curveMidpoint255, softLightBlended01 };
}

/**
 * Wave 29 Unfragmented 699-File REA (`ev_4742ae24c0e0894803c2af285fca4288a072af5f0190032d85296b732f9d8fa54072011407`):
 * Bernstein 4th-degree basis FFD lattice warp + `glfx.js` Vibrance saturation-adaptive boost.
 */
export function evaluateLabBernsteinFfdAndVibrance(params: {
  readonly u01: number;
  readonly v01: number;
  readonly centerDeltaX: number;
  readonly centerDeltaY: number;
  readonly rgb01: readonly [number, number, number];
  readonly vibranceMinus1To1: number;
}): {
  readonly bernsteinCenterWeight01: number;
  readonly warpedDeltaX: number;
  readonly warpedDeltaY: number;
  readonly vibranceRgb01: readonly [number, number, number];
} {
  const u = clamp01(params.u01);
  const v = clamp01(params.v01);
  const b24u = 6 * u * u * (1 - u) * (1 - u);
  const b24v = 6 * v * v * (1 - v) * (1 - v);
  const bernsteinCenterWeight01 = Math.round(b24u * b24v * 10000) / 10000;
  const [r, g, b] = params.rgb01;
  const avg = (r + g + b) / 3;
  const mx = Math.max(r, g, b);
  const amt = (mx - avg) * (-params.vibranceMinus1To1 * 3);
  return {
    bernsteinCenterWeight01,
    warpedDeltaX: Math.round(params.centerDeltaX * bernsteinCenterWeight01 * 1000) / 1000,
    warpedDeltaY: Math.round(params.centerDeltaY * bernsteinCenterWeight01 * 1000) / 1000,
    vibranceRgb01: [
      clamp01(r + (mx - r) * amt),
      clamp01(g + (mx - g) * amt),
      clamp01(b + (mx - b) * amt),
    ],
  };
}

/** Wave 30 Grand Monolithic 755-File REA (`ev_982d49cba6a55578fec43ba3a6e0b6384950de96491ca43cf0149f03b1c884fd`): Konva Kaleidoscope + Emboss. */
export function evaluateLabKonvaKaleidoscopeAndEmboss(params: {
  readonly width: number;
  readonly thetaIndex: number;
  readonly power: number;
  readonly sobelX: number;
  readonly sobelY: number;
  readonly directionRad: number;
  readonly strength01: number;
}): { readonly mirroredThetaIndex: number; readonly reliefGray255: number } {
  const w = Math.max(8, Math.floor(params.width));
  const sectionSize = Math.max(8, Math.ceil(w / Math.pow(2, Math.max(1, Math.min(8, params.power)))));
  const local = ((params.thetaIndex % (sectionSize * 2)) + sectionSize * 2) % (sectionSize * 2);
  const mirroredThetaIndex = local >= sectionSize ? sectionSize * 2 - local - 1 : local;
  const response = Math.cos(params.directionRad) * params.sobelX - Math.sin(params.directionRad) * params.sobelY;
  const reliefGray255 = Math.min(255, Math.max(0, Math.round(128 + response * (128 / 1020) * (clamp01(params.strength01) * 10))));
  return { mirroredThetaIndex, reliefGray255 };
}


