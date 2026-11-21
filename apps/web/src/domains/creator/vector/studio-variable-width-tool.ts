/**
 * Studio Variable Width Tool — Illustrator식 비대칭 가변 선폭(`Shift+W`) · 8종 웹툰 폭 프로필 ·
 * `Expand Appearance` 닫힌 윤곽 폴리곤 변환 엔진.
 *
 * 기존 `WidthSampleV3` (`{ t, width, opacity? }`)와 100% 하위호환되는 비대칭 폭 샘플
 * (`leftWidthPx?`, `rightWidthPx?`, `easing?`)을 기반으로 단조 큐빅 에르미트 보간,
 * 온캔버스 대칭/비대칭(`Alt`) 드래그, 8종 웹툰 프로필, 닫힌 윤곽 전개를 제공한다.
 */

import { studioPathSignedArea } from "../studio-path-boolean";

import type { DrawEl } from "../studio-element-model";

export interface SpineVec2 { readonly x: number; readonly y: number; }
export type WidthSampleEasing = "smooth" | "linear";
export interface CompatibleWidthSampleV3 { readonly t: number; readonly width: number; readonly opacity?: number; }

export interface AsymmetricWidthSample extends CompatibleWidthSampleV3 {
  readonly id: string;
  readonly leftWidthPx?: number;
  readonly rightWidthPx?: number;
  readonly easing?: WidthSampleEasing;
}

export interface NormalizedWidthSample {
  readonly id: string;
  readonly t: number;
  readonly leftWidthPx: number;
  readonly rightWidthPx: number;
  readonly width: number;
  readonly opacity: number;
  readonly easing: WidthSampleEasing;
}

export interface EvaluatedWidthAtT {
  readonly t: number;
  readonly leftWidthPx: number;
  readonly rightWidthPx: number;
  readonly totalWidthPx: number;
  readonly opacity: number;
}

export type WebtoonWidthPresetId =
  | "g-pen-taper"
  | "brush-calligraphy"
  | "focus-line"
  | "blade-asymmetric"
  | "double-needle"
  | "ribbon-flare"
  | "hair-strand"
  | "highlight-rim";

export interface VariableWidthProfilePreset {
  readonly id: WebtoonWidthPresetId | string;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly builtin: boolean;
  readonly samples: readonly AsymmetricWidthSample[];
}

export interface SpineProjectionHit {
  readonly t: number;
  readonly point: SpineVec2;
  readonly tangent: SpineVec2;
  readonly leftNormal: SpineVec2;
  readonly signedOffsetPx: number;
  readonly distancePx: number;
}

export interface WidthHandleVisual {
  readonly sampleId: string;
  readonly t: number;
  readonly center: SpineVec2;
  readonly tangent: SpineVec2;
  readonly leftNormal: SpineVec2;
  readonly leftHandle: SpineVec2;
  readonly rightHandle: SpineVec2;
  readonly leftWidthPx: number;
  readonly rightWidthPx: number;
  readonly asymmetric: boolean;
}

export interface ExpandAppearanceOptions {
  readonly sampleStepPx?: number;
  readonly minSubdivisions?: number;
  readonly capStyle?: "round" | "butt" | "pointed";
  readonly capSegments?: number;
  readonly miterLimit?: number;
}

export interface ExpandedWidthOutline {
  readonly outerRing: readonly SpineVec2[];
  readonly leftEdge: readonly SpineVec2[];
  readonly rightEdge: readonly SpineVec2[];
  readonly flatPoints: readonly number[];
  readonly bounds: { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
  readonly area: number;
  readonly foldedCornersResolved: number;
}

function presetSample(id: string, t: number, left: number, right: number, easing: WidthSampleEasing = "smooth"): AsymmetricWidthSample {
  return { id, t, width: Math.round((left + right) * 1000) / 1000, leftWidthPx: left, rightWidthPx: right, easing };
}

export const WEBTOON_WIDTH_PROFILE_PRESETS: readonly VariableWidthProfilePreset[] = Object.freeze([
  {
    id: "g-pen-taper", labelKo: "G펜 테이퍼",
    descriptionKo: "진입·이탈이 날카롭고 중앙 필압이 탄력 있게 부풀어 오르는 정통 만화 주선 프로필.", builtin: true,
    samples: [presetSample("gp-0", 0, 0.07, 0.07), presetSample("gp-1", 0.25, 0.46, 0.46), presetSample("gp-2", 0.62, 0.5, 0.5), presetSample("gp-3", 1, 0.05, 0.05)],
  },
  {
    id: "brush-calligraphy", labelKo: "붓펜 캘리",
    descriptionKo: "초반 먹 뭉침과 우측으로 흐르는 비대칭 붓털 끝맺음을 재현합니다.", builtin: true,
    samples: [presetSample("bc-0", 0, 0.3, 0.22), presetSample("bc-1", 0.16, 0.72, 0.52), presetSample("bc-2", 0.55, 0.32, 0.46), presetSample("bc-3", 0.85, 0.12, 0.24), presetSample("bc-4", 1, 0.02, 0.04)],
  },
  {
    id: "focus-line", labelKo: "만화 집중선",
    descriptionKo: "바늘처럼 뾰족한 초점 끝에서 외곽 기저부로 직선적으로 벌어지는 집중선 프로필.", builtin: true,
    samples: [presetSample("fl-0", 0, 0.01, 0.01, "linear"), presetSample("fl-1", 0.72, 0.34, 0.34, "linear"), presetSample("fl-2", 1, 0.675, 0.675, "linear")],
  },
  {
    id: "blade-asymmetric", labelKo: "칼날 비대칭",
    descriptionKo: "등날은 직선으로 곧게 유지하고 반대편 날면만 예리하게 부풀리는 검격·액션 프로필.", builtin: true,
    samples: [presetSample("ba-0", 0, 0.04, 0.04), presetSample("ba-1", 0.35, 0.16, 0.96), presetSample("ba-2", 0.78, 0.14, 0.7), presetSample("ba-3", 1, 0.02, 0.02, "linear")],
  },
  {
    id: "double-needle", labelKo: "양끝 뾰족 효과선",
    descriptionKo: "중앙이 두껍고 양쪽 끝이 날카롭게 빠지는 스피드선·광채 효과선 프로필.", builtin: true,
    samples: [presetSample("dn-0", 0, 0.02, 0.02), presetSample("dn-1", 0.5, 0.59, 0.59), presetSample("dn-2", 1, 0.02, 0.02)],
  },
  {
    id: "ribbon-flare", labelKo: "리본 플레어",
    descriptionKo: "허리는 가늘고 양 끝단이 넓게 퍼지는 장식·옷깃·리본 연출 프로필.", builtin: true,
    samples: [presetSample("rf-0", 0, 0.58, 0.58), presetSample("rf-1", 0.5, 0.17, 0.17), presetSample("rf-2", 1, 0.58, 0.58)],
  },
  {
    id: "hair-strand", labelKo: "머리카락 가닥",
    descriptionKo: "모근 볼륨을 살리면서 끝단 한쪽으로 가볍게 휘날리는 비대칭 모발 프로필.", builtin: true,
    samples: [presetSample("hs-0", 0, 0.56, 0.56), presetSample("hs-1", 0.4, 0.52, 0.34), presetSample("hs-2", 0.82, 0.22, 0.08), presetSample("hs-3", 1, 0.02, 0.02)],
  },
  {
    id: "highlight-rim", labelKo: "하이라이트 림",
    descriptionKo: "광원 방향 한쪽에만 볼록한 초승달 림라이트를 형성하는 단면 비대칭 프로필.", builtin: true,
    samples: [presetSample("hr-0", 0, 0.03, 0.03), presetSample("hr-1", 0.32, 0.9, 0.08), presetSample("hr-2", 0.68, 0.84, 0.08), presetSample("hr-3", 1, 0.03, 0.03)],
  },
]);

const MIN_HALF_WIDTH = 0.01;
const MIN_T_STEP = 1e-4;
const EPS = 1e-7;
const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

export function normalizeAsymmetricWidthSample(sample: AsymmetricWidthSample, fallbackId: string): NormalizedWidthSample {
  const safeT = Number.isFinite(sample.t) ? clamp(sample.t, 0, 1) : 0;
  const safeTotal = Number.isFinite(sample.width) ? Math.max(MIN_HALF_WIDTH * 2, sample.width) : 2;
  const hasLeft = typeof sample.leftWidthPx === "number" && Number.isFinite(sample.leftWidthPx);
  const hasRight = typeof sample.rightWidthPx === "number" && Number.isFinite(sample.rightWidthPx);

  let left: number, right: number;
  if (hasLeft && hasRight) {
    left = Math.max(MIN_HALF_WIDTH, sample.leftWidthPx!);
    right = Math.max(MIN_HALF_WIDTH, sample.rightWidthPx!);
  } else if (hasLeft) {
    left = Math.max(MIN_HALF_WIDTH, sample.leftWidthPx!);
    right = Math.max(MIN_HALF_WIDTH, safeTotal - left);
  } else if (hasRight) {
    right = Math.max(MIN_HALF_WIDTH, sample.rightWidthPx!);
    left = Math.max(MIN_HALF_WIDTH, safeTotal - right);
  } else {
    left = safeTotal / 2;
    right = safeTotal / 2;
  }
  const opacity = typeof sample.opacity === "number" && Number.isFinite(sample.opacity) ? clamp(sample.opacity, 0, 1) : 1;
  return { id: sample.id || fallbackId, t: safeT, leftWidthPx: left, rightWidthPx: right, width: left + right, opacity, easing: sample.easing ?? "smooth" };
}

export function normalizeWidthProfile(samples: readonly AsymmetricWidthSample[], defaultWidthPx = 4): readonly NormalizedWidthSample[] {
  const half = Math.max(MIN_HALF_WIDTH, defaultWidthPx / 2);
  if (samples.length === 0) {
    return [
      { id: "w-start", t: 0, leftWidthPx: half, rightWidthPx: half, width: half * 2, opacity: 1, easing: "smooth" },
      { id: "w-end", t: 1, leftWidthPx: half, rightWidthPx: half, width: half * 2, opacity: 1, easing: "smooth" },
    ];
  }
  const sorted = samples.map((s, idx) => normalizeAsymmetricWidthSample(s, `w-${idx}`)).sort((a, b) => a.t - b.t);
  const deduped: NormalizedWidthSample[] = [];
  for (const s of sorted) {
    if (deduped.length > 0 && Math.abs(s.t - deduped[deduped.length - 1]!.t) < MIN_T_STEP) deduped[deduped.length - 1] = s;
    else deduped.push(s);
  }
  const first = deduped[0]!;
  if (first.t > MIN_T_STEP) deduped.unshift({ ...first, id: `${first.id}-start`, t: 0 });
  else deduped[0] = { ...first, t: 0 };
  const last = deduped[deduped.length - 1]!;
  if (last.t < 1 - MIN_T_STEP) deduped.push({ ...last, id: `${last.id}-end`, t: 1 });
  else deduped[deduped.length - 1] = { ...last, t: 1 };
  return deduped;
}

/** Fritsch-Carlson 단조 큐빅 에르미트 기울기 계산(오버슈트·음수 반폭 방지). */
function computeMonotoneHermiteSlopes(ts: readonly number[], ys: readonly number[]): readonly number[] {
  const n = ts.length;
  if (n <= 1) return [0];
  const secants: number[] = [];
  for (let i = 0; i < n - 1; i += 1) secants.push((ys[i + 1]! - ys[i]!) / Math.max(MIN_T_STEP, ts[i + 1]! - ts[i]!));
  const m = new Array<number>(n).fill(0);
  m[0] = secants[0]!;
  m[n - 1] = secants[n - 2]!;
  for (let i = 1; i < n - 1; i += 1) {
    const dPrev = secants[i - 1]!, dNext = secants[i]!;
    if (dPrev * dNext <= 0) m[i] = 0;
    else {
      const w1 = 2 * (ts[i + 1]! - ts[i]!) + (ts[i]! - ts[i - 1]!);
      const w2 = ts[i + 1]! - ts[i]! + 2 * (ts[i]! - ts[i - 1]!);
      m[i] = (w1 + w2) / (w1 / dPrev + w2 / dNext);
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    const dk = secants[i]!;
    if (Math.abs(dk) < EPS) { m[i] = 0; m[i + 1] = 0; continue; }
    const alpha = m[i]! / dk, beta = m[i + 1]! / dk, norm = Math.hypot(alpha, beta);
    if (norm > 3) { const s = 3 / norm; m[i] = s * alpha * dk; m[i + 1] = s * beta * dk; }
  }
  return m;
}

function evalHermiteSpan(t: number, t0: number, t1: number, y0: number, y1: number, m0: number, m1: number, easing: WidthSampleEasing): number {
  const h = Math.max(MIN_T_STEP, t1 - t0), u = clamp((t - t0) / h, 0, 1);
  if (easing === "linear") return y0 + (y1 - y0) * u;
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * y0 + (u3 - 2 * u2 + u) * h * m0 + (-2 * u3 + 3 * u2) * y1 + (u3 - u2) * h * m1;
}

export function evaluateVariableWidthAtT(rawProfile: readonly AsymmetricWidthSample[], t: number): EvaluatedWidthAtT {
  const profile = normalizeWidthProfile(rawProfile);
  const clampedT = clamp(Number.isFinite(t) ? t : 0, 0, 1);
  const ts = profile.map((s) => s.t);
  const leftSlopes = computeMonotoneHermiteSlopes(ts, profile.map((s) => s.leftWidthPx));
  const rightSlopes = computeMonotoneHermiteSlopes(ts, profile.map((s) => s.rightWidthPx));

  let idx = 0;
  for (let i = 0; i < profile.length - 1; i += 1) {
    if (clampedT >= profile[i]!.t && clampedT <= profile[i + 1]!.t) { idx = i; break; }
  }
  const s0 = profile[idx]!, s1 = profile[idx + 1] ?? s0;
  const easing: WidthSampleEasing = s0.easing === "linear" || s1.easing === "linear" ? "linear" : "smooth";
  const leftWidthPx = Math.max(MIN_HALF_WIDTH, evalHermiteSpan(clampedT, s0.t, s1.t, s0.leftWidthPx, s1.leftWidthPx, leftSlopes[idx]!, leftSlopes[idx + 1] ?? 0, easing));
  const rightWidthPx = Math.max(MIN_HALF_WIDTH, evalHermiteSpan(clampedT, s0.t, s1.t, s0.rightWidthPx, s1.rightWidthPx, rightSlopes[idx]!, rightSlopes[idx + 1] ?? 0, easing));
  const frac = (clampedT - s0.t) / Math.max(MIN_T_STEP, s1.t - s0.t);
  return {
    t: clampedT,
    leftWidthPx: round3(leftWidthPx),
    rightWidthPx: round3(rightWidthPx),
    totalWidthPx: round3(leftWidthPx + rightWidthPx),
    opacity: round3(clamp(s0.opacity + (s1.opacity - s0.opacity) * frac, 0, 1)),
  };
}

function buildSpineArcTable(spine: readonly SpineVec2[]): { readonly cumulative: readonly number[]; readonly totalLength: number } {
  const cumulative: number[] = [0];
  let total = 0;
  for (let i = 1; i < spine.length; i += 1) {
    total += Math.hypot(spine[i]!.x - spine[i - 1]!.x, spine[i]!.y - spine[i - 1]!.y);
    cumulative.push(total);
  }
  return { cumulative, totalLength: total };
}

export function sampleSpineFrameAtT(spine: readonly SpineVec2[], t: number): { readonly point: SpineVec2; readonly tangent: SpineVec2; readonly leftNormal: SpineVec2 } {
  if (spine.length < 2) return { point: spine[0] ?? { x: 0, y: 0 }, tangent: { x: 1, y: 0 }, leftNormal: { x: 0, y: 1 } };
  const table = buildSpineArcTable(spine);
  if (table.totalLength < EPS) return { point: spine[0]!, tangent: { x: 1, y: 0 }, leftNormal: { x: 0, y: 1 } };
  const targetLen = clamp(t, 0, 1) * table.totalLength;
  let segIdx = 0;
  for (let i = 0; i < table.cumulative.length - 1; i += 1) {
    segIdx = i;
    if (targetLen <= table.cumulative[i + 1]! + EPS) break;
  }
  const a = spine[segIdx]!, b = spine[segIdx + 1] ?? a;
  const segLen = Math.max(EPS, table.cumulative[segIdx + 1]! - table.cumulative[segIdx]!);
  const localU = clamp((targetLen - table.cumulative[segIdx]!) / segLen, 0, 1);
  const dx = b.x - a.x, dy = b.y - a.y, dLen = Math.max(EPS, Math.hypot(dx, dy));
  const tangent = { x: dx / dLen, y: dy / dLen };
  return { point: { x: a.x + dx * localU, y: a.y + dy * localU }, tangent, leftNormal: { x: -tangent.y, y: tangent.x } };
}

export function projectPointOntoSpine(spine: readonly SpineVec2[], cursor: SpineVec2): SpineProjectionHit {
  const table = buildSpineArcTable(spine);
  if (spine.length < 2 || table.totalLength < EPS) {
    const o = spine[0] ?? { x: 0, y: 0 };
    return { t: 0, point: o, tangent: { x: 1, y: 0 }, leftNormal: { x: 0, y: 1 }, signedOffsetPx: cursor.y - o.y, distancePx: Math.hypot(cursor.x - o.x, cursor.y - o.y) };
  }
  let bestDist = Infinity, bestT = 0, bestPoint = spine[0]!, bestTangent = { x: 1, y: 0 }, bestNormal = { x: 0, y: 1 }, bestSigned = 0;
  for (let i = 0; i < spine.length - 1; i += 1) {
    const a = spine[i]!, b = spine[i + 1]!, dx = b.x - a.x, dy = b.y - a.y, lenSq = dx * dx + dy * dy;
    if (lenSq < EPS * EPS) continue;
    const u = clamp(((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / lenSq, 0, 1);
    const px = a.x + dx * u, py = a.y + dy * u, d = Math.hypot(cursor.x - px, cursor.y - py);
    if (d < bestDist) {
      const len = Math.sqrt(lenSq), tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
      bestDist = d;
      bestT = (table.cumulative[i]! + len * u) / table.totalLength;
      bestPoint = { x: px, y: py };
      bestTangent = { x: tx, y: ty };
      bestNormal = { x: nx, y: ny };
      bestSigned = (cursor.x - px) * nx + (cursor.y - py) * ny;
    }
  }
  return { t: round3(bestT), point: bestPoint, tangent: bestTangent, leftNormal: bestNormal, signedOffsetPx: round3(bestSigned), distancePx: round3(bestDist) };
}

export function computeWidthHandles(spine: readonly SpineVec2[], rawProfile: readonly AsymmetricWidthSample[]): readonly WidthHandleVisual[] {
  return normalizeWidthProfile(rawProfile).map((sample) => {
    const frame = sampleSpineFrameAtT(spine, sample.t);
    return {
      sampleId: sample.id, t: sample.t, center: frame.point, tangent: frame.tangent, leftNormal: frame.leftNormal,
      leftHandle: { x: round3(frame.point.x + frame.leftNormal.x * sample.leftWidthPx), y: round3(frame.point.y + frame.leftNormal.y * sample.leftWidthPx) },
      rightHandle: { x: round3(frame.point.x - frame.leftNormal.x * sample.rightWidthPx), y: round3(frame.point.y - frame.leftNormal.y * sample.rightWidthPx) },
      leftWidthPx: sample.leftWidthPx, rightWidthPx: sample.rightWidthPx, asymmetric: Math.abs(sample.leftWidthPx - sample.rightWidthPx) > 0.05,
    };
  });
}

export function upsertWidthSampleAtT(
  rawProfile: readonly AsymmetricWidthSample[],
  t: number,
  leftWidthPx: number,
  rightWidthPx: number,
  options?: { readonly id?: string; readonly easing?: WidthSampleEasing; readonly mergeToleranceT?: number },
): readonly AsymmetricWidthSample[] {
  const profile = [...normalizeWidthProfile(rawProfile)];
  const safeT = clamp(t, 0, 1), safeLeft = Math.max(MIN_HALF_WIDTH, leftWidthPx), safeRight = Math.max(MIN_HALF_WIDTH, rightWidthPx);
  const existingIdx = profile.findIndex((s) => Math.abs(s.t - safeT) <= (options?.mergeToleranceT ?? 0.015));
  if (existingIdx >= 0) {
    const prev = profile[existingIdx]!;
    profile[existingIdx] = { ...prev, leftWidthPx: round3(safeLeft), rightWidthPx: round3(safeRight), width: round3(safeLeft + safeRight), easing: options?.easing ?? prev.easing };
    return profile;
  }
  return [...profile, { id: options?.id ?? `w-t-${Math.round(safeT * 10000)}`, t: round3(safeT), leftWidthPx: round3(safeLeft), rightWidthPx: round3(safeRight), width: round3(safeLeft + safeRight), opacity: 1, easing: options?.easing ?? "smooth" }].sort((a, b) => a.t - b.t);
}

/** 온캔버스 폭 핸들 드래그(`symmetric=true`: 대칭 / `symmetric=false`: `Alt` 비대칭 조절). */
export function dragWidthHandle(
  spine: readonly SpineVec2[],
  rawProfile: readonly AsymmetricWidthSample[],
  params: { readonly sampleId?: string; readonly t?: number; readonly cursor: SpineVec2; readonly side?: "left" | "right"; readonly symmetric: boolean; readonly minHalfWidthPx?: number; readonly maxHalfWidthPx?: number },
): { readonly profile: readonly AsymmetricWidthSample[]; readonly activeSampleId: string; readonly evaluated: EvaluatedWidthAtT } {
  const profile = [...normalizeWidthProfile(rawProfile)];
  const minHalf = Math.max(MIN_HALF_WIDTH, params.minHalfWidthPx ?? 0.25);
  const maxHalf = Math.max(minHalf, params.maxHalfWidthPx ?? 500);

  const targetIdx = params.sampleId ? profile.findIndex((s) => s.id === params.sampleId) : -1;
  let targetT = targetIdx >= 0 ? profile[targetIdx]!.t : params.t;
  let inferredSide = params.side;
  if (targetT === undefined) {
    const hit = projectPointOntoSpine(spine, params.cursor);
    targetT = hit.t;
    inferredSide ??= hit.signedOffsetPx >= 0 ? "left" : "right";
  }

  const frame = sampleSpineFrameAtT(spine, targetT);
  const signedDist = (params.cursor.x - frame.point.x) * frame.leftNormal.x + (params.cursor.y - frame.point.y) * frame.leftNormal.y;
  const side: "left" | "right" = inferredSide ?? (signedDist >= 0 ? "left" : "right");
  const draggedHalf = clamp(Math.abs(signedDist), minHalf, maxHalf);
  const current = evaluateVariableWidthAtT(profile, targetT);
  const nextLeft = params.symmetric ? draggedHalf : side === "left" ? draggedHalf : current.leftWidthPx;
  const nextRight = params.symmetric ? draggedHalf : side === "right" ? draggedHalf : current.rightWidthPx;

  if (targetIdx >= 0) {
    const prev = profile[targetIdx]!;
    profile[targetIdx] = { ...prev, leftWidthPx: round3(nextLeft), rightWidthPx: round3(nextRight), width: round3(nextLeft + nextRight) };
    return { profile, activeSampleId: prev.id, evaluated: evaluateVariableWidthAtT(profile, targetT) };
  }
  const activeSampleId = params.sampleId ?? `w-t-${Math.round(targetT * 10000)}`;
  const nextProfile = upsertWidthSampleAtT(profile, targetT, nextLeft, nextRight, { id: activeSampleId });
  return { profile: nextProfile, activeSampleId, evaluated: evaluateVariableWidthAtT(nextProfile, targetT) };
}

export function slideWidthSampleAlongSpine(rawProfile: readonly AsymmetricWidthSample[], sampleId: string, nextT: number): readonly AsymmetricWidthSample[] {
  const profile = [...normalizeWidthProfile(rawProfile)];
  const idx = profile.findIndex((s) => s.id === sampleId);
  if (idx <= 0 || idx >= profile.length - 1) return profile;
  const minT = profile[idx - 1]!.t + 0.005, maxT = profile[idx + 1]!.t - 0.005;
  if (minT >= maxT) return profile;
  profile[idx] = { ...profile[idx]!, t: round3(clamp(nextT, minT, maxT)) };
  return profile;
}

export function deleteWidthSample(rawProfile: readonly AsymmetricWidthSample[], sampleId: string): readonly AsymmetricWidthSample[] {
  const profile = normalizeWidthProfile(rawProfile);
  const idx = profile.findIndex((s) => s.id === sampleId);
  if (profile.length <= 2 || idx <= 0 || idx >= profile.length - 1) return profile;
  return profile.filter((s) => s.id !== sampleId);
}

export function applyWidthProfilePreset(presetOrId: WebtoonWidthPresetId | VariableWidthProfilePreset, baseWidthPx: number): readonly AsymmetricWidthSample[] {
  const preset = typeof presetOrId === "string" ? WEBTOON_WIDTH_PROFILE_PRESETS.find((p) => p.id === presetOrId) : presetOrId;
  const safeBase = Math.max(0.2, Number.isFinite(baseWidthPx) ? baseWidthPx : 4);
  if (!preset) return normalizeWidthProfile([], safeBase);
  return preset.samples.map((s) => {
    const norm = normalizeAsymmetricWidthSample(s, s.id);
    const left = round3(Math.max(MIN_HALF_WIDTH, norm.leftWidthPx * safeBase));
    const right = round3(Math.max(MIN_HALF_WIDTH, norm.rightWidthPx * safeBase));
    return { id: norm.id, t: norm.t, leftWidthPx: left, rightWidthPx: right, width: round3(left + right), opacity: norm.opacity, easing: norm.easing };
  });
}

export function createCustomWidthProfilePreset(id: string, labelKo: string, rawProfile: readonly AsymmetricWidthSample[], descriptionKo = "사용자 지정 비대칭 가변 선폭 프로필"): VariableWidthProfilePreset {
  const profile = normalizeWidthProfile(rawProfile);
  const peak = Math.max(0.1, ...profile.map((s) => s.width));
  return {
    id, labelKo, descriptionKo, builtin: false,
    samples: profile.map((s, idx) => presetSample(`${id}-${idx}`, s.t, round3(s.leftWidthPx / peak), round3(s.rightWidthPx / peak), s.easing)),
  };
}

function segmentIntersection2D(a: SpineVec2, b: SpineVec2, c: SpineVec2, d: SpineVec2): SpineVec2 | null {
  const r1x = b.x - a.x, r1y = b.y - a.y, r2x = d.x - c.x, r2y = d.y - c.y, denom = r1x * r2y - r1y * r2x;
  if (Math.abs(denom) < EPS) return null;
  const qpx = c.x - a.x, qpy = c.y - a.y;
  const t = (qpx * r2y - qpy * r2x) / denom, u = (qpx * r1y - qpy * r1x) / denom;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999 ? { x: a.x + r1x * t, y: a.y + r1y * t } : null;
}

function cleanRibbonSideSelfIntersections(edge: readonly SpineVec2[]): { readonly cleaned: readonly SpineVec2[]; readonly resolvedCount: number } {
  if (edge.length < 4) return { cleaned: edge, resolvedCount: 0 };
  const pts = [...edge];
  let resolvedCount = 0, i = 0;
  while (i < pts.length - 3) {
    let found = false;
    for (let j = i + 2; j <= Math.min(pts.length - 2, i + 8); j += 1) {
      const hit = segmentIntersection2D(pts[i]!, pts[i + 1]!, pts[j]!, pts[j + 1]!);
      if (hit) { pts.splice(i + 1, j - i, { x: round3(hit.x), y: round3(hit.y) }); resolvedCount += 1; found = true; break; }
    }
    if (!found) i += 1;
  }
  return { cleaned: pts, resolvedCount };
}

function buildRoundCapArc(center: SpineVec2, fromPt: SpineVec2, toPt: SpineVec2, segments: number): SpineVec2[] {
  const rA = Math.hypot(fromPt.x - center.x, fromPt.y - center.y), rB = Math.hypot(toPt.x - center.x, toPt.y - center.y);
  if (rA < 0.1 && rB < 0.1) return [];
  const a0 = Math.atan2(fromPt.y - center.y, fromPt.x - center.x), a1 = Math.atan2(toPt.y - center.y, toPt.x - center.x);
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const arc: SpineVec2[] = [], count = Math.max(2, segments);
  for (let i = 1; i < count; i += 1) {
    const frac = i / count, ang = a0 + delta * frac, r = rA + (rB - rA) * frac;
    arc.push({ x: round3(center.x + Math.cos(ang) * r), y: round3(center.y + Math.sin(ang) * r) });
  }
  return arc;
}

/** 가변 선폭 스트로크를 `Expand Appearance` 닫힌 채움 윤곽 폴리곤으로 변환한다. */
export function expandVariableWidthStrokeToOutline(
  spine: readonly SpineVec2[],
  rawProfile: readonly AsymmetricWidthSample[],
  options: ExpandAppearanceOptions = {},
): ExpandedWidthOutline {
  const table = buildSpineArcTable(spine);
  const profile = normalizeWidthProfile(rawProfile);
  if (spine.length < 2 || table.totalLength < EPS) {
    return { outerRing: [], leftEdge: [], rightEdge: [], flatPoints: [], bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, area: 0, foldedCornersResolved: 0 };
  }
  const stepCount = Math.min(2048, Math.max(Math.max(8, options.minSubdivisions ?? 24), Math.ceil(table.totalLength / Math.max(1, options.sampleStepPx ?? 4))));
  const capStyle = options.capStyle ?? "round", capSegments = Math.max(2, options.capSegments ?? 6), miterLimit = Math.max(1, options.miterLimit ?? 4);

  const sampleTsSet = new Set<number>();
  for (let i = 0; i <= stepCount; i += 1) sampleTsSet.add(i / stepCount);
  for (const s of profile) sampleTsSet.add(s.t);
  const sampleTs = [...sampleTsSet].sort((a, b) => a - b);

  const rawLeft: SpineVec2[] = [], rawRight: SpineVec2[] = [], centers: SpineVec2[] = [], tangents: SpineVec2[] = [];
  for (let i = 0; i < sampleTs.length; i += 1) {
    const t = sampleTs[i]!;
    const frame = sampleSpineFrameAtT(spine, t);
    const prevF = i > 0 ? sampleSpineFrameAtT(spine, sampleTs[i - 1]!) : frame;
    const nextF = i + 1 < sampleTs.length ? sampleSpineFrameAtT(spine, sampleTs[i + 1]!) : frame;
    let nx = prevF.leftNormal.x + nextF.leftNormal.x, ny = prevF.leftNormal.y + nextF.leftNormal.y, miterScale = 1;
    const nLen = Math.hypot(nx, ny);
    if (nLen > EPS) { nx /= nLen; ny /= nLen; miterScale = Math.min(miterLimit, 1 / Math.max(0.2, nx * frame.leftNormal.x + ny * frame.leftNormal.y)); }
    else { nx = frame.leftNormal.x; ny = frame.leftNormal.y; }
    const w = evaluateVariableWidthAtT(profile, t);
    centers.push(frame.point); tangents.push(frame.tangent);
    rawLeft.push({ x: round3(frame.point.x + nx * w.leftWidthPx * miterScale), y: round3(frame.point.y + ny * w.leftWidthPx * miterScale) });
    rawRight.push({ x: round3(frame.point.x - nx * w.rightWidthPx * miterScale), y: round3(frame.point.y - ny * w.rightWidthPx * miterScale) });
  }

  const leftClean = cleanRibbonSideSelfIntersections(rawLeft), rightClean = cleanRibbonSideSelfIntersections(rawRight);
  const leftEdge = leftClean.cleaned, rightEdge = rightClean.cleaned;
  const endCenter = centers[centers.length - 1]!, startCenter = centers[0]!;
  const endCap: SpineVec2[] = [], startCap: SpineVec2[] = [];
  if (capStyle === "round") {
    endCap.push(...buildRoundCapArc(endCenter, leftEdge[leftEdge.length - 1]!, rightEdge[rightEdge.length - 1]!, capSegments));
    startCap.push(...buildRoundCapArc(startCenter, rightEdge[0]!, leftEdge[0]!, capSegments));
  } else if (capStyle === "pointed") {
    const endW = evaluateVariableWidthAtT(profile, 1).totalWidthPx * 0.5, startW = evaluateVariableWidthAtT(profile, 0).totalWidthPx * 0.5;
    endCap.push({ x: round3(endCenter.x + tangents[tangents.length - 1]!.x * endW), y: round3(endCenter.y + tangents[tangents.length - 1]!.y * endW) });
    startCap.push({ x: round3(startCenter.x - tangents[0]!.x * startW), y: round3(startCenter.y - tangents[0]!.y * startW) });
  }

  const outerRing: SpineVec2[] = [...leftEdge, ...endCap, ...[...rightEdge].reverse(), ...startCap];
  const flatPoints: number[] = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of outerRing) {
    flatPoints.push(pt.x, pt.y);
    if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y; if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
  }
  if (outerRing[0]) flatPoints.push(outerRing[0].x, outerRing[0].y);
  return {
    outerRing, leftEdge, rightEdge, flatPoints,
    bounds: Number.isFinite(minX) ? { minX, minY, maxX, maxY } : { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    area: round3(Math.abs(studioPathSignedArea(flatPoints.slice(0, -2)))),
    foldedCornersResolved: leftClean.resolvedCount + rightClean.resolvedCount,
  };
}

export function widthProfileFromV3Samples(samples: readonly CompatibleWidthSampleV3[]): readonly AsymmetricWidthSample[] {
  return normalizeWidthProfile(samples.map((s, idx) => ({ id: `v3-${idx}`, t: s.t, width: s.width, ...(s.opacity !== undefined ? { opacity: s.opacity } : {}) })));
}

export function widthProfileToV3Samples(rawProfile: readonly AsymmetricWidthSample[]): readonly CompatibleWidthSampleV3[] {
  return normalizeWidthProfile(rawProfile).map((s) => ({ t: s.t, width: round3(s.leftWidthPx + s.rightWidthPx), ...(s.opacity < 1 ? { opacity: s.opacity } : {}) }));
}

export function expandedOutlineToDrawElSeed(outline: ExpandedWidthOutline, base: Pick<DrawEl, "stroke" | "opacity">): Omit<DrawEl, "id"> {
  return { type: "draw", kind: "freehand", mode: "pen", points: [...outline.flatPoints], stroke: base.stroke, strokeWidth: 0, fill: base.stroke, ...(base.opacity !== undefined ? { opacity: base.opacity } : {}), sampleSpacing: 3 };
}
