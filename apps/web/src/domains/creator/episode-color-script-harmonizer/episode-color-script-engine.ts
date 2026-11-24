/**
 * AI-Free 60컷 로컬 OKLCH 컬러 스크립트 & 무드 아크 하모나이저 코어 엔진.
 *
 * - 외부 AI/네트워크 없이 12~60컷 OKLCH 감정 컬러 리본 생성, ΔE_OKLCH 급변 탐지,
 *   Fritsch-Carlson 단조 큐빅 에르미트 스플라인 보간, 3D 조명 색온도(Kelvin) + 1D/3D LUT
 *   그레이딩 파라미터 생성 및 `<canvas>` 시맨틱 리본 렌더러를 제공한다.
 * - 원시 hex/rgb/hsl 리터럴 0건: 모든 UI 크롬은 `getComputedStyle(canvas)` 시맨틱 토큰으로,
 *   모든 컷 색상은 CSS Color 4 `oklch(...)` 문자열로만 표현한다.
 */

import type {
  ColorDiscontinuityAlert,
  ColorJumpAxis,
  ColorJumpSeverity,
  ColorScriptAuditThresholds,
  CutColorScriptNode,
  CutColorTransitionMetric,
  CutLightingAndLutGrade,
  EpisodeColorScriptAudit,
  EpisodeColorScriptBundle,
  Lut3dCornerSample,
  NarrativeColorTemplate,
  NarrativeColorTemplateId,
  OklchCoord,
  StoryActKind,
} from "./types";

export const MIN_EPISODE_CUT_COUNT = 12;
export const MAX_EPISODE_CUT_COUNT = 60;
export const DEFAULT_EPISODE_CUT_COUNT = 60;

export const DEFAULT_COLOR_AUDIT_THRESHOLDS: ColorScriptAuditThresholds = {
  noticeDeltaE: 10.5,
  jarringDeltaE: 17.0,
  maxDeltaL: 0.16,
  maxDeltaC: 0.075,
  maxDeltaHueDeg: 42,
};

export const STORY_ACT_LABELS_KO: Readonly<Record<StoryActKind, string>> = {
  "act1-setup": "1막 도입",
  "act2-conflict": "2막 갈등",
  "act3-climax": "3막 절정",
  "act4-resolution": "4막 해소",
};

export const NARRATIVE_COLOR_TEMPLATES: readonly NarrativeColorTemplate[] = [
  {
    id: "daily-dusk-night-dawn",
    nameKo: "일상→황혼 갈등→심야 각성→새벽 해소",
    subtitleKo: "따뜻한 아침 일상에서 노을 갈등과 깊은 남색 각성을 지나 청명한 새벽으로 이어지는 정석 4막 아크",
    defaultCutCount: 60,
    anchors: [
      { progress: 0.0, act: "act1-setup", labelKo: "아침 일상", primary: { l: 0.84, c: 0.055, h: 86 }, shadow: { l: 0.42, c: 0.04, h: 242 }, accent: { l: 0.72, c: 0.13, h: 68 }, emotionIntensity: 0.25 },
      { progress: 0.34, act: "act2-conflict", labelKo: "황혼 갈등", primary: { l: 0.62, c: 0.165, h: 40 }, shadow: { l: 0.28, c: 0.085, h: 350 }, accent: { l: 0.75, c: 0.19, h: 52 }, emotionIntensity: 0.68 },
      { progress: 0.68, act: "act3-climax", labelKo: "심야 각성", primary: { l: 0.27, c: 0.125, h: 264 }, shadow: { l: 0.14, c: 0.06, h: 272 }, accent: { l: 0.74, c: 0.21, h: 215 }, emotionIntensity: 0.96 },
      { progress: 1.0, act: "act4-resolution", labelKo: "새벽 해소", primary: { l: 0.81, c: 0.075, h: 214 }, shadow: { l: 0.46, c: 0.05, h: 248 }, accent: { l: 0.82, c: 0.12, h: 26 }, emotionIntensity: 0.38 },
    ],
  },
  {
    id: "romance-pastel-4act",
    nameKo: "로맨스 파스텔 4막",
    subtitleKo: "벚꽃 피치 설렘에서 라일락 망설임, 황금 노을 고백, 아이보리 여운으로 이어지는 부드러운 파스텔 리본",
    defaultCutCount: 60,
    anchors: [
      { progress: 0.0, act: "act1-setup", labelKo: "봄빛 첫인사", primary: { l: 0.87, c: 0.07, h: 28 }, shadow: { l: 0.54, c: 0.045, h: 342 }, accent: { l: 0.74, c: 0.14, h: 12 }, emotionIntensity: 0.32 },
      { progress: 0.35, act: "act2-conflict", labelKo: "라일락 엇갈림", primary: { l: 0.75, c: 0.085, h: 304 }, shadow: { l: 0.42, c: 0.06, h: 282 }, accent: { l: 0.78, c: 0.13, h: 336 }, emotionIntensity: 0.58 },
      { progress: 0.7, act: "act3-climax", labelKo: "노을 고백", primary: { l: 0.73, c: 0.145, h: 48 }, shadow: { l: 0.39, c: 0.08, h: 16 }, accent: { l: 0.82, c: 0.17, h: 62 }, emotionIntensity: 0.9 },
      { progress: 1.0, act: "act4-resolution", labelKo: "아이보리 여운", primary: { l: 0.9, c: 0.045, h: 74 }, shadow: { l: 0.58, c: 0.035, h: 45 }, accent: { l: 0.78, c: 0.11, h: 24 }, emotionIntensity: 0.4 },
    ],
  },
  {
    id: "action-noir-climax",
    nameKo: "액션 누아르 클라이맥스",
    subtitleKo: "저채도 빗길 슬레이트에서 강철빛 잠입, 적열 폭발 클라이맥스, 잔연 차콜로 닫히는 고대비 아크",
    defaultCutCount: 60,
    anchors: [
      { progress: 0.0, act: "act1-setup", labelKo: "빗길 슬레이트", primary: { l: 0.44, c: 0.038, h: 236 }, shadow: { l: 0.19, c: 0.025, h: 245 }, accent: { l: 0.68, c: 0.11, h: 205 }, emotionIntensity: 0.42 },
      { progress: 0.36, act: "act2-conflict", labelKo: "강철 대치", primary: { l: 0.34, c: 0.062, h: 224 }, shadow: { l: 0.15, c: 0.035, h: 238 }, accent: { l: 0.66, c: 0.16, h: 42 }, emotionIntensity: 0.72 },
      { progress: 0.72, act: "act3-climax", labelKo: "적열 폭발", primary: { l: 0.46, c: 0.195, h: 26 }, shadow: { l: 0.17, c: 0.095, h: 16 }, accent: { l: 0.82, c: 0.19, h: 66 }, emotionIntensity: 0.98 },
      { progress: 1.0, act: "act4-resolution", labelKo: "차콜 잔연", primary: { l: 0.38, c: 0.03, h: 252 }, shadow: { l: 0.16, c: 0.02, h: 260 }, accent: { l: 0.7, c: 0.08, h: 48 }, emotionIntensity: 0.46 },
    ],
  },
  {
    id: "mystery-cool-suspense",
    nameKo: "미스터리 한색 서스펜스",
    subtitleKo: "안개 청록에서 차가운 단서 추적, 심연 보라 진실 폭로, 창백한 은빛 결말로 흐르는 한색 팔레트",
    defaultCutCount: 60,
    anchors: [
      { progress: 0.0, act: "act1-setup", labelKo: "안개 청록", primary: { l: 0.64, c: 0.052, h: 196 }, shadow: { l: 0.3, c: 0.04, h: 210 }, accent: { l: 0.76, c: 0.11, h: 174 }, emotionIntensity: 0.35 },
      { progress: 0.35, act: "act2-conflict", labelKo: "단서 추적", primary: { l: 0.47, c: 0.078, h: 220 }, shadow: { l: 0.21, c: 0.05, h: 236 }, accent: { l: 0.72, c: 0.14, h: 192 }, emotionIntensity: 0.66 },
      { progress: 0.72, act: "act3-climax", labelKo: "심연 진실", primary: { l: 0.26, c: 0.13, h: 288 }, shadow: { l: 0.12, c: 0.075, h: 296 }, accent: { l: 0.73, c: 0.18, h: 325 }, emotionIntensity: 0.94 },
      { progress: 1.0, act: "act4-resolution", labelKo: "은빛 여명", primary: { l: 0.74, c: 0.032, h: 232 }, shadow: { l: 0.4, c: 0.03, h: 244 }, accent: { l: 0.8, c: 0.08, h: 198 }, emotionIntensity: 0.34 },
    ],
  },
];

const DEG_TO_RAD = Math.PI / 180;

export function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** 임의의 색상각(Hue)을 [0, 360) 범위로 정규화한다. */
export function normalizeHueDeg(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const mod = hue % 360;
  return mod < 0 ? mod + 360 : mod === 0 ? 0 : mod;
}

/** 두 색상각 사이의 최단 부호 있는 원형 차이(-180, 180]를 반환한다. */
export function shortestSignedHueDeltaDeg(fromHue: number, toHue: number): number {
  const diff = normalizeHueDeg(toHue) - normalizeHueDeg(fromHue);
  if (diff > 180) return diff - 360;
  if (diff <= -180) return diff + 360;
  return diff;
}

/** 두 색상각 사이의 최단 절대 각도 차이([0, 180])를 반환한다. */
export function shortestHueDeltaDeg(aHue: number, bHue: number): number {
  return Math.abs(shortestSignedHueDeltaDeg(aHue, bHue));
}

/** OKLCH 좌표를 CSS Color Level 4 `oklch(L C H)` 문자열로 직렬화한다. */
export function formatOklchCss(coord: OklchCoord): string {
  const l = clamp01(coord.l).toFixed(3);
  const c = clamp(coord.c, 0, 0.37).toFixed(3);
  const h = normalizeHueDeg(coord.h).toFixed(1);
  return `oklch(${l} ${c} ${h})`;
}

/** OKLCH를 직교 Oklab (L, a, b) 좌표로 변환한다. */
export function oklchToOklab(coord: OklchCoord): { readonly l: number; readonly a: number; readonly b: number } {
  const l = clamp01(coord.l);
  const c = clamp(coord.c, 0, 0.37);
  const rad = normalizeHueDeg(coord.h) * DEG_TO_RAD;
  return { l, a: c * Math.cos(rad), b: c * Math.sin(rad) };
}

/**
 * 두 OKLCH 색상 간의 지각 색차(`ΔE_OKLCH`, Oklab 유클리드 거리 × 100 스케일)와
 * 명도·채도·색상각 성분 차이를 계산한다.
 */
export function computeDeltaEOklch(
  a: OklchCoord,
  b: OklchCoord,
): { readonly deltaE: number; readonly deltaL: number; readonly deltaC: number; readonly deltaHueDeg: number } {
  const labA = oklchToOklab(a);
  const labB = oklchToOklab(b);
  const dL = labB.l - labA.l;
  const dA = labB.a - labA.a;
  const dB = labB.b - labA.b;
  const deltaE = Math.hypot(dL, dA, dB) * 100;
  return {
    deltaE: round2(deltaE),
    deltaL: round3(Math.abs(dL)),
    deltaC: round3(Math.abs(clamp(b.c, 0, 0.37) - clamp(a.c, 0, 0.37))),
    deltaHueDeg: round2(shortestHueDeltaDeg(a.h, b.h)),
  };
}

/**
 * Fritsch-Carlson 단조 큐빅 에르미트 스플라인(Monotonic Cubic Hermite Spline) 평가기.
 * 단조 구간에서 오버슈트(링잉) 없이 부드러운 C1 연속 곡선을 보장한다.
 */
export function evaluateMonotonicCubicSpline(
  xs: readonly number[],
  ys: readonly number[],
  x: number,
): number {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return 0;
  if (n === 1) return ys[0] ?? 0;

  const firstX = xs[0] ?? 0;
  const lastX = xs[n - 1] ?? 1;
  if (x <= firstX) return ys[0] ?? 0;
  if (x >= lastX) return ys[n - 1] ?? 0;

  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = Math.max(1e-9, (xs[i + 1] ?? 0) - (xs[i] ?? 0));
    slopes.push(((ys[i + 1] ?? 0) - (ys[i] ?? 0)) / dx);
  }

  const tangents: number[] = new Array<number>(n).fill(0);
  tangents[0] = slopes[0] ?? 0;
  tangents[n - 1] = slopes[n - 2] ?? 0;

  for (let i = 1; i < n - 1; i += 1) {
    const dPrev = slopes[i - 1] ?? 0;
    const dNext = slopes[i] ?? 0;
    tangents[i] = dPrev * dNext <= 0 ? 0 : (dPrev + dNext) / 2;
  }

  // Fritsch-Carlson 단조 제약 보정
  for (let i = 0; i < n - 1; i += 1) {
    const dk = slopes[i] ?? 0;
    if (Math.abs(dk) < 1e-9) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = (tangents[i] ?? 0) / dk;
    const beta = (tangents[i + 1] ?? 0) / dk;
    const radius = Math.hypot(alpha, beta);
    if (radius > 3) {
      const tau = 3 / radius;
      tangents[i] = tau * alpha * dk;
      tangents[i + 1] = tau * beta * dk;
    }
  }

  let seg = n - 2;
  for (let i = 0; i < n - 1; i += 1) {
    if (x >= (xs[i] ?? 0) && x <= (xs[i + 1] ?? 1)) {
      seg = i;
      break;
    }
  }

  const x0 = xs[seg] ?? 0;
  const x1 = xs[seg + 1] ?? 1;
  const h = Math.max(1e-9, x1 - x0);
  const t = clamp01((x - x0) / h);
  const t2 = t * t;
  const t3 = t2 * t;

  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  return (
    h00 * (ys[seg] ?? 0) +
    h10 * h * (tangents[seg] ?? 0) +
    h01 * (ys[seg + 1] ?? 0) +
    h11 * h * (tangents[seg + 1] ?? 0)
  );
}

/** 원형 Hue 배열을 최단 호(shortest-arc)로 언랩해 단조 스플라인 보간 후 [0, 360)으로 되감는다. */
export function evaluateCircularHueSpline(
  xs: readonly number[],
  huesDeg: readonly number[],
  x: number,
): number {
  if (huesDeg.length === 0) return 0;
  const unwrapped: number[] = [normalizeHueDeg(huesDeg[0] ?? 0)];
  for (let i = 1; i < huesDeg.length; i += 1) {
    const prev = unwrapped[i - 1] ?? 0;
    const delta = shortestSignedHueDeltaDeg(prev, huesDeg[i] ?? 0);
    unwrapped.push(prev + delta);
  }
  return round2(normalizeHueDeg(evaluateMonotonicCubicSpline(xs, unwrapped, x)));
}

function interpolateOklchAnchors(
  xs: readonly number[],
  coords: readonly OklchCoord[],
  progress: number,
): OklchCoord {
  const ls = coords.map((c) => clamp01(c.l));
  const cs = coords.map((c) => clamp(c.c, 0, 0.37));
  const hs = coords.map((c) => normalizeHueDeg(c.h));
  return {
    l: round3(clamp01(evaluateMonotonicCubicSpline(xs, ls, progress))),
    c: round3(clamp(evaluateMonotonicCubicSpline(xs, cs, progress), 0, 0.37)),
    h: evaluateCircularHueSpline(xs, hs, progress),
  };
}

/** 템플릿 ID로 내장 서사 컬러 템플릿을 안전하게 조회한다. */
export function findNarrativeColorTemplateById(
  templateId: NarrativeColorTemplateId | string | undefined,
): NarrativeColorTemplate {
  const matched = NARRATIVE_COLOR_TEMPLATES.find((t) => t.id === templateId);
  if (matched) return matched;
  const fallback = NARRATIVE_COLOR_TEMPLATES[0];
  if (!fallback) throw new Error("내장 서사 컬러 템플릿이 비어 있습니다.");
  return fallback;
}

function resolveActAtProgress(progress: number): StoryActKind {
  if (progress < 0.25) return "act1-setup";
  if (progress < 0.56) return "act2-conflict";
  if (progress < 0.84) return "act3-climax";
  return "act4-resolution";
}

/**
 * 12~60컷 에피소드 OKLCH 컬러 스크립트 리본을 생성한다.
 * `injectDraftSpikes: true`를 지정하면 초안 단계의 명도·색상·채도 급변 컷을 사실적으로 삽입한다.
 */
export function generateEpisodeColorScript(
  templateId: NarrativeColorTemplateId,
  cutCount: number = DEFAULT_EPISODE_CUT_COUNT,
  options: { readonly injectDraftSpikes?: boolean } = {},
): readonly CutColorScriptNode[] {
  const template = findNarrativeColorTemplateById(templateId);
  const safeCount = Math.round(clamp(cutCount, MIN_EPISODE_CUT_COUNT, MAX_EPISODE_CUT_COUNT));
  const xs = template.anchors.map((a) => a.progress);
  const primaries = template.anchors.map((a) => a.primary);
  const shadows = template.anchors.map((a) => a.shadow);
  const accents = template.anchors.map((a) => a.accent);
  const intensities = template.anchors.map((a) => a.emotionIntensity);

  const anchorCutIndices = new Set<number>(
    template.anchors.map((a) => Math.round(a.progress * (safeCount - 1))),
  );

  const nodes: CutColorScriptNode[] = [];
  for (let i = 0; i < safeCount; i += 1) {
    const progress = safeCount <= 1 ? 0 : i / (safeCount - 1);
    const act = resolveActAtProgress(progress);
    const matchedAnchor = template.anchors.find(
      (a) => Math.round(a.progress * (safeCount - 1)) === i,
    );

    nodes.push({
      cutNumber: i + 1,
      act,
      labelKo: matchedAnchor ? matchedAnchor.labelKo : `${STORY_ACT_LABELS_KO[act]} #${i + 1}`,
      primary: interpolateOklchAnchors(xs, primaries, progress),
      shadow: interpolateOklchAnchors(xs, shadows, progress),
      accent: interpolateOklchAnchors(xs, accents, progress),
      emotionIntensity: round2(clamp01(evaluateMonotonicCubicSpline(xs, intensities, progress))),
      isAnchorCut: anchorCutIndices.has(i),
    });
  }

  if (!options.injectDraftSpikes) {
    return nodes;
  }

  // 초안 작업 중 흔히 발생하는 3곳의 명도/색상/채도 급변 컷을 결정적으로 주입한다.
  const spike1 = Math.max(2, Math.round(safeCount * 0.22));
  const spike2 = Math.max(spike1 + 2, Math.round(safeCount * 0.52));
  const spike3 = Math.max(spike2 + 2, Math.round(safeCount * 0.8));

  return nodes.map((node, index) => {
    if (index === spike1 && !node.isAnchorCut) {
      return {
        ...node,
        labelKo: `${node.labelKo} (명도 급변 초안)`,
        primary: { l: round3(clamp01(node.primary.l > 0.55 ? node.primary.l - 0.34 : node.primary.l + 0.34)), c: node.primary.c, h: node.primary.h },
      };
    }
    if (index === spike2 && !node.isAnchorCut) {
      return {
        ...node,
        labelKo: `${node.labelKo} (색상 이탈 초안)`,
        primary: { l: node.primary.l, c: round3(clamp(node.primary.c + 0.11, 0.08, 0.28)), h: round2(normalizeHueDeg(node.primary.h + 132)) },
      };
    }
    if (index === spike3 && !node.isAnchorCut) {
      return {
        ...node,
        labelKo: `${node.labelKo} (채도 튐 초안)`,
        primary: { l: round3(clamp01(node.primary.l + 0.2)), c: round3(clamp(node.primary.c + 0.14, 0.12, 0.3)), h: round2(normalizeHueDeg(node.primary.h - 76)) },
      };
    }
    return node;
  });
}

function classifyDominantAxis(
  deltaL: number,
  deltaC: number,
  deltaHueDeg: number,
  thresholds: ColorScriptAuditThresholds,
): ColorJumpAxis {
  const lRatio = deltaL / thresholds.maxDeltaL;
  const cRatio = deltaC / thresholds.maxDeltaC;
  const hRatio = deltaHueDeg / thresholds.maxDeltaHueDeg;
  const maxRatio = Math.max(lRatio, cRatio, hRatio);
  if (maxRatio < 0.75) return "composite";
  if (lRatio >= cRatio && lRatio >= hRatio) return "luminance";
  if (cRatio >= lRatio && cRatio >= hRatio) return "chroma";
  return "hue";
}

/** 12~60컷 컬러 스크립트 전 구간에서 인접 컷 `ΔE_OKLCH` 급변 불연속성을 감사한다. */
export function auditEpisodeColorScript(
  cuts: readonly CutColorScriptNode[],
  thresholds?: ColorScriptAuditThresholds,
): EpisodeColorScriptAudit {
  // 짧은 에피소드(12~35컷)는 4막 전환당 컷 수가 적으므로 컷 수 밀도에 비례해 허용 전이 폭을 자연 보정한다.
  const paceScale =
    thresholds !== undefined || cuts.length >= 36
      ? 1
      : clamp(Math.sqrt(36 / Math.max(12, cuts.length)), 1, 1.65);
  const base = thresholds ?? DEFAULT_COLOR_AUDIT_THRESHOLDS;
  const effective: ColorScriptAuditThresholds = {
    noticeDeltaE: round2(base.noticeDeltaE * paceScale),
    jarringDeltaE: round2(base.jarringDeltaE * paceScale),
    maxDeltaL: round3(base.maxDeltaL * paceScale),
    maxDeltaC: round3(base.maxDeltaC * paceScale),
    maxDeltaHueDeg: round2(base.maxDeltaHueDeg * paceScale),
  };

  const perCutTransitions: CutColorTransitionMetric[] = [];
  const discontinuityAlerts: ColorDiscontinuityAlert[] = [];

  for (let i = 1; i < cuts.length; i += 1) {
    const prev = cuts[i - 1];
    const curr = cuts[i];
    if (!prev || !curr) continue;

    const diff = computeDeltaEOklch(prev.primary, curr.primary);
    const dominantAxis = classifyDominantAxis(diff.deltaL, diff.deltaC, diff.deltaHueDeg, effective);

    let severity: ColorJumpSeverity = "smooth";
    if (!curr.intentionalFlashCut && !prev.intentionalFlashCut) {
      if (
        diff.deltaE >= effective.jarringDeltaE ||
        diff.deltaL >= effective.maxDeltaL * 1.25 ||
        diff.deltaC >= effective.maxDeltaC * 1.35 ||
        (diff.deltaHueDeg >= effective.maxDeltaHueDeg * 1.35 && Math.max(prev.primary.c, curr.primary.c) >= 0.05)
      ) {
        severity = "jarring";
      } else if (
        diff.deltaE >= effective.noticeDeltaE ||
        diff.deltaL >= effective.maxDeltaL ||
        diff.deltaC >= effective.maxDeltaC ||
        (diff.deltaHueDeg >= effective.maxDeltaHueDeg && Math.max(prev.primary.c, curr.primary.c) >= 0.05)
      ) {
        severity = "notice";
      }
    }

    perCutTransitions.push({
      fromCut: prev.cutNumber,
      toCut: curr.cutNumber,
      deltaEOklch: diff.deltaE,
      deltaL: diff.deltaL,
      deltaC: diff.deltaC,
      deltaHueDeg: diff.deltaHueDeg,
      dominantAxis,
      severity,
    });

    if (severity !== "smooth") {
      const axisLabelKo =
        dominantAxis === "luminance"
          ? `명도 급변(ΔL ${diff.deltaL.toFixed(2)})`
          : dominantAxis === "chroma"
            ? `채도 급변(ΔC ${diff.deltaC.toFixed(2)})`
            : dominantAxis === "hue"
              ? `색상각 이탈(ΔH ${diff.deltaHueDeg.toFixed(0)}°)`
              : "복합 색차 급변";
      discontinuityAlerts.push({
        id: `jump-${prev.cutNumber}-${curr.cutNumber}`,
        fromCut: prev.cutNumber,
        toCut: curr.cutNumber,
        deltaEOklch: diff.deltaE,
        deltaL: diff.deltaL,
        deltaC: diff.deltaC,
        deltaHueDeg: diff.deltaHueDeg,
        dominantAxis,
        severity,
        messageKo: `컷 ${prev.cutNumber}→${curr.cutNumber}: ΔE_OKLCH ${diff.deltaE.toFixed(1)} · ${axisLabelKo}`,
      });
    }
  }

  const averageDeltaE =
    perCutTransitions.length > 0
      ? round2(perCutTransitions.reduce((s, t) => s + t.deltaEOklch, 0) / perCutTransitions.length)
      : 0;
  const maxDeltaE =
    perCutTransitions.length > 0 ? round2(Math.max(...perCutTransitions.map((t) => t.deltaEOklch))) : 0;
  const jarringCount = discontinuityAlerts.filter((a) => a.severity === "jarring").length;
  const noticeCount = discontinuityAlerts.filter((a) => a.severity === "notice").length;
  const arcSmoothnessScore = Math.round(
    clamp(100 - jarringCount * 16 - noticeCount * 6 - Math.max(0, maxDeltaE / paceScale - 9) * 0.9, 0, 100),
  );

  return {
    cutCount: cuts.length,
    averageDeltaE,
    maxDeltaE,
    arcSmoothnessScore,
    discontinuityAlerts,
    jarringCount,
    noticeCount,
    perCutTransitions,
  };
}

function blendOklch(a: OklchCoord, b: OklchCoord, alpha: number): OklchCoord {
  const t = clamp01(alpha);
  const deltaH = shortestSignedHueDeltaDeg(a.h, b.h);
  return {
    l: round3(clamp01(a.l + (b.l - a.l) * t)),
    c: round3(clamp(a.c + (b.c - a.c) * t, 0, 0.37)),
    h: round2(normalizeHueDeg(a.h + deltaH * t)),
  };
}

/**
 * 1클릭 단조 스플라인 무드 아크 조화기.
 * 막 전환 앵커 컷을 기준점으로 삼아 Fritsch-Carlson 단조 큐빅 스플라인으로 전 구간 OKLCH를
 * 부드럽게 블렌딩해 급변 불연속성(jarring)을 제거한다.
 */
export function harmonizeEpisodeColorScript(
  cuts: readonly CutColorScriptNode[],
  options: { readonly strength?: number } = {},
): readonly CutColorScriptNode[] {
  if (cuts.length <= 2) return cuts;
  const strength = clamp01(options.strength ?? 1.0);
  const n = cuts.length;

  const anchorIndices: number[] = [];
  cuts.forEach((cut, idx) => {
    if (idx === 0 || idx === n - 1 || cut.isAnchorCut) {
      anchorIndices.push(idx);
    }
  });
  // 앵커가 부족하면 4분위 지점을 자동 기준점으로 채택
  if (anchorIndices.length < 3) {
    anchorIndices.splice(0, anchorIndices.length, 0, Math.round((n - 1) * 0.35), Math.round((n - 1) * 0.7), n - 1);
  }

  const uniqueAnchors = [...new Set(anchorIndices)]
    .sort((a, b) => a - b)
    .filter((idx) => cuts[idx] !== undefined);
  const xs = uniqueAnchors.map((idx) => idx / (n - 1));
  const anchorNodes = uniqueAnchors.flatMap((idx) => {
    const node = cuts[idx];
    return node ? [node] : [];
  });
  const primaryAnchors = anchorNodes.map((node) => node.primary);
  const shadowAnchors = anchorNodes.map((node) => node.shadow);
  const accentAnchors = anchorNodes.map((node) => node.accent);

  return cuts.map((cut, idx) => {
    if (cut.intentionalFlashCut) return cut;
    const progress = idx / (n - 1);
    const targetPrimary = interpolateOklchAnchors(xs, primaryAnchors, progress);
    const targetShadow = interpolateOklchAnchors(xs, shadowAnchors, progress);
    const targetAccent = interpolateOklchAnchors(xs, accentAnchors, progress);
    return {
      ...cut,
      labelKo: cut.labelKo.replace(/\s*\([^)]*초안\)$/u, ""),
      primary: blendOklch(cut.primary, targetPrimary, strength),
      shadow: blendOklch(cut.shadow, targetShadow, strength),
      accent: blendOklch(cut.accent, targetAccent, strength),
    };
  });
}

function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** OKLCH 컷 색상을 3D 조명 색온도(Kelvin) + 1D/3D LUT 그레이딩 파라미터로 변환한다. */
export function computeCutLightingAndLutGrade(cut: CutColorScriptNode): CutLightingAndLutGrade {
  const { l, c, h } = cut.primary;
  // 따뜻한 45°(앰버·노을)일수록 낮은 Kelvin, 차가운 225°~270°(한색·심야)일수록 높은 Kelvin
  const warmth = Math.cos(((h - 45) * Math.PI) / 180) * clamp(c / 0.18, 0.15, 1);
  const keyLightKelvin = roundToStep(clamp(5600 - warmth * 2800 + (0.55 - l) * 900, 2400, 9400), 50);

  const shadowWarmth = Math.cos(((cut.shadow.h - 45) * Math.PI) / 180) * clamp(cut.shadow.c / 0.14, 0.15, 1);
  const fillLightKelvin = roundToStep(clamp(6200 - shadowWarmth * 2200, 2800, 10000), 50);

  const exposureEv = round2(clamp((l - 0.56) * 2.4, -1.6, 1.4));
  const contrastPivot = round3(clamp(0.42 + cut.emotionIntensity * 0.14, 0.36, 0.62));
  const saturationGain = round2(clamp(0.78 + c * 2.6, 0.65, 1.48));

  const labShadow = oklchToOklab(cut.shadow);
  const labPrimary = oklchToOklab(cut.primary);
  const labAccent = oklchToOklab(cut.accent);

  const shadowLift: readonly [number, number, number] = [
    round3(clamp(-0.04 + labShadow.a * 0.28, -0.15, 0.15)),
    round3(clamp(-0.04 - labShadow.a * 0.12 + labShadow.b * 0.08, -0.15, 0.15)),
    round3(clamp(-0.04 - labShadow.b * 0.28, -0.15, 0.15)),
  ];
  const midtoneGamma: readonly [number, number, number] = [
    round3(clamp(1 + labPrimary.a * 0.45, 0.78, 1.24)),
    round3(clamp(1 - labPrimary.a * 0.18 + labPrimary.b * 0.12, 0.82, 1.18)),
    round3(clamp(1 - labPrimary.b * 0.45, 0.78, 1.24)),
  ];
  const highlightGain: readonly [number, number, number] = [
    round3(clamp(1 + labAccent.a * 0.36 + exposureEv * 0.06, 0.75, 1.32)),
    round3(clamp(1 + labAccent.b * 0.14 + exposureEv * 0.06, 0.75, 1.3)),
    round3(clamp(1 - labAccent.b * 0.34 + exposureEv * 0.06, 0.75, 1.32)),
  ];

  // 16포인트 단조 1D 톤 커브
  const gammaScalar = clamp(1.0 - exposureEv * 0.14, 0.72, 1.38);
  const lut1dCurve16: number[] = [];
  for (let i = 0; i < 16; i += 1) {
    const x = i / 15;
    const curved = clamp01(Math.pow(x, gammaScalar));
    const prevVal = lut1dCurve16[i - 1] ?? 0;
    lut1dCurve16.push(round3(Math.max(prevVal, curved)));
  }

  const corners: readonly (readonly [number, number, number])[] = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1],
    [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  const lut3dCornerSamples: Lut3dCornerSample[] = corners.map(([r, g, b]) => ({
    input: [r, g, b],
    output: [
      round3(clamp01(Math.pow(clamp01(r * highlightGain[0] + shadowLift[0]), 1 / midtoneGamma[0]))),
      round3(clamp01(Math.pow(clamp01(g * highlightGain[1] + shadowLift[1]), 1 / midtoneGamma[1]))),
      round3(clamp01(Math.pow(clamp01(b * highlightGain[2] + shadowLift[2]), 1 / midtoneGamma[2]))),
    ],
  }));

  return {
    cutNumber: cut.cutNumber,
    keyLightKelvin,
    fillLightKelvin,
    exposureEv,
    contrastPivot,
    saturationGain,
    shadowLift,
    midtoneGamma,
    highlightGain,
    lut1dCurve16,
    lut3dCubeSize: 17,
    lut3dCornerSamples,
  };
}

/** 전체 에피소드 컬러 스크립트 + 감사 + 3D 조명/LUT 번들을 조립한다. */
export function buildEpisodeColorScriptBundle(
  templateId: NarrativeColorTemplateId,
  cuts: readonly CutColorScriptNode[],
): EpisodeColorScriptBundle {
  const template = findNarrativeColorTemplateById(templateId);
  return {
    schemaVersion: "toonstudio.color-script.v1",
    templateId: template.id,
    templateNameKo: template.nameKo,
    cuts,
    audit: auditEpisodeColorScript(cuts),
    lightingGrades: cuts.map((cut) => computeCutLightingAndLutGrade(cut)),
  };
}

/** 번들을 결정적 JSON 문자열로 직렬화한다. */
export function serializeEpisodeColorScriptBundle(bundle: EpisodeColorScriptBundle): string {
  return JSON.stringify(bundle, null, 2);
}

interface RibbonChromePalette {
  readonly bg: string;
  readonly fg: string;
  readonly fgMuted: string;
  readonly line: string;
  readonly accent: string;
  readonly warn: string;
  readonly bad: string;
}

function resolveRibbonChromePalette(canvas: HTMLCanvasElement): RibbonChromePalette {
  const rootStyle = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const elStyle = getComputedStyle(canvas);
  const fallbackFg = elStyle.color.trim() || "CanvasText";
  const fallbackBg = elStyle.backgroundColor.trim() || "Canvas";

  const pick = (token: string, fallback: string): string => {
    const vEl = elStyle.getPropertyValue(token).trim();
    if (vEl.length > 0) return vEl;
    const vRoot = rootStyle?.getPropertyValue(token).trim() ?? "";
    return vRoot.length > 0 ? vRoot : fallback;
  };

  const fg = pick("--color-fg", fallbackFg);
  const accent = pick("--color-accent", fg);
  return {
    bg: pick("--color-canvas", fallbackBg),
    fg,
    fgMuted: pick("--color-fg-2", fg),
    line: pick("--color-line", fg),
    accent,
    warn: pick("--color-warn", accent),
    bad: pick("--color-bad", accent),
  };
}

/**
 * 12~60컷 OKLCH 컬러 스크립트 리본을 `<canvas>`에 렌더링한다.
 * UI 크롬 색상은 `getComputedStyle(canvas)`로, 컷 스워치는 CSS `oklch(...)`로만 그린다.
 */
export function renderEpisodeColorRibbonCanvas(
  canvas: HTMLCanvasElement,
  cuts: readonly CutColorScriptNode[],
  audit: EpisodeColorScriptAudit,
  selectedCutNumber: number,
): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx || cuts.length === 0) return false;

  const palette = resolveRibbonChromePalette(canvas);
  const width = canvas.width || 640;
  const height = canvas.height || 180;
  const padX = 12;
  const padTop = 24;
  const ribbonHeight = Math.max(84, height - 56);
  const innerW = Math.max(100, width - padX * 2);
  const cutW = innerW / cuts.length;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, width, height);

  // 각 컷의 Primary(상단 58%) · Shadow(중단 24%) · Accent(하단 18%) 밴드
  cuts.forEach((cut, idx) => {
    const x = padX + idx * cutW;
    const w = Math.ceil(cutW) + 0.5;
    const hPrimary = ribbonHeight * 0.58;
    const hShadow = ribbonHeight * 0.24;
    const hAccent = ribbonHeight - hPrimary - hShadow;

    ctx.fillStyle = formatOklchCss(cut.primary);
    ctx.fillRect(x, padTop, w, hPrimary);

    ctx.fillStyle = formatOklchCss(cut.shadow);
    ctx.fillRect(x, padTop + hPrimary, w, hShadow);

    ctx.fillStyle = formatOklchCss(cut.accent);
    ctx.fillRect(x, padTop + hPrimary + hShadow, w, hAccent);
  });

  // 명도(L) 무드 아크 곡선 오버레이
  ctx.save();
  ctx.strokeStyle = palette.fg;
  ctx.lineWidth = 2;
  ctx.beginPath();
  cuts.forEach((cut, idx) => {
    const cx = padX + (idx + 0.5) * cutW;
    const cy = padTop + (1 - clamp01(cut.primary.l)) * (ribbonHeight * 0.54) + 4;
    if (idx === 0) ctx.moveTo(cx, cy);
    else ctx.lineTo(cx, cy);
  });
  ctx.stroke();
  ctx.restore();

  // 불연속성 급변 마커
  for (const alert of audit.discontinuityAlerts) {
    const x = padX + (alert.toCut - 1) * cutW;
    ctx.fillStyle = alert.severity === "jarring" ? palette.bad : palette.warn;
    ctx.fillRect(x - 1.5, padTop - 8, 3, ribbonHeight + 12);
  }

  // 선택된 컷 하이라이트 프레임
  const selectedIdx = clamp(selectedCutNumber - 1, 0, cuts.length - 1);
  const selX = padX + selectedIdx * cutW;
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 2.5;
  ctx.strokeRect(selX, padTop - 2, Math.max(4, cutW), ribbonHeight + 4);

  // 하단 컷 번호 눈금
  ctx.fillStyle = palette.fgMuted;
  ctx.font = "600 11px sans-serif";
  const tickStep = cuts.length <= 16 ? 2 : cuts.length <= 36 ? 6 : 10;
  for (let cutNo = 1; cutNo <= cuts.length; cutNo += tickStep) {
    const tx = padX + (cutNo - 0.5) * cutW;
    ctx.fillText(`#${cutNo}`, Math.min(width - 28, Math.max(padX, tx - 8)), height - 10);
  }

  return true;
}
