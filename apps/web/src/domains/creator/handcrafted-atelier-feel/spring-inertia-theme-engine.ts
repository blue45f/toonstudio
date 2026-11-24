/**
 * 물리 관성 RK4 스프링 시뮬레이터 · 프로젝트 성격별 절차적 OKLCH 스튜디오 테마 엔진 (Wave 40A).
 *
 * 1) 실제 종이·목재·금속 화구의 질량·강성·감쇠를 4차 룬게-쿠타(RK4) 적분으로 계산하며,
 *    reducedMotion=true 시 0ms 즉시 정착을 보장한다.
 * 2) 작품 장르·팔레트 성격에 따라 스튜디오 크롬용 OKLCH 시맨틱 토큰을 절차적으로 합성하고,
 *    OKLCH→OKLab→선형 sRGB 상대 휘도 기반 WCAG 2.1 AA(4.5:1 이상) 대비를 수학적으로 강제 검증한다.
 */

export type TactileMaterialId = "paper" | "wood" | "metal";
export type SpringDampingRegime = "underdamped" | "critically-damped" | "overdamped";

export interface TactileHapticProfile {
  readonly patternMs: readonly number[];
  readonly intensity: number;
  readonly textureGrain: "fibrous-soft" | "warm-resonant" | "crisp-detent";
}

export interface TactileAcousticProfile {
  readonly fundamentalHz: number;
  readonly overtoneRatio: number;
  readonly decayMs: number;
  readonly timbreKind: "cotton-rustle" | "walnut-knock" | "brass-detent";
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export interface TactileMaterialSignature {
  readonly id: TactileMaterialId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly instrumentKo: string;
  readonly instrumentEn: string;
  readonly defaultMassKg: number;
  readonly defaultStiffnessNm: number;
  readonly defaultDampingNsm: number;
  readonly haptic: TactileHapticProfile;
  readonly acoustic: TactileAcousticProfile;
}

export interface TactileSpringConfig {
  readonly material: TactileMaterialId;
  readonly from?: number;
  readonly to?: number;
  readonly initialVelocity?: number;
  readonly reducedMotion?: boolean;
  readonly mass?: number;
  readonly stiffness?: number;
  readonly damping?: number;
  readonly dtMs?: number;
  readonly maxDurationMs?: number;
  readonly restEpsilon?: number;
}

export interface TactileSpringFrame {
  readonly timeMs: number;
  readonly value: number;
  readonly velocity: number;
  readonly acceleration: number;
}

export interface TactileSpringSimulationResult {
  readonly material: TactileMaterialId;
  readonly materialSignature: TactileMaterialSignature;
  readonly reducedMotion: boolean;
  readonly settledImmediately: boolean;
  readonly massKg: number;
  readonly stiffnessNm: number;
  readonly dampingNsm: number;
  readonly dampingRatio: number;
  readonly naturalFrequencyHz: number;
  readonly regime: SpringDampingRegime;
  readonly settleTimeMs: number;
  readonly peakOvershootRatio: number;
  readonly frames: readonly TactileSpringFrame[];
  readonly cssLinearEasing: string;
  readonly cssTransitionFallback: string;
}

export const TACTILE_MATERIAL_IDS: readonly TactileMaterialId[] = ["paper", "wood", "metal"] as const;

export const TACTILE_MATERIAL_SIGNATURES: Readonly<Record<TactileMaterialId, TactileMaterialSignature>> = {
  paper: {
    id: "paper", labelKo: "종이 (코튼 원고지)", labelEn: "Cotton Paper",
    instrumentKo: "300g 코튼 원고지 · 얇은 트레이싱 시트", instrumentEn: "300gsm Cotton Sheet · Tracing Overlay",
    defaultMassKg: 0.55, defaultStiffnessNm: 185, defaultDampingNsm: 19.6,
    haptic: { patternMs: [8, 14, 6], intensity: 0.34, textureGrain: "fibrous-soft" },
    acoustic: {
      fundamentalHz: 520, overtoneRatio: 2.35, decayMs: 68, timbreKind: "cotton-rustle",
      descriptionKo: "종이 장이 사각이며 부드럽게 내려앉는 고감쇠 마찰음",
      descriptionEn: "Soft fibrous rustle settling swiftly with minimal rebound",
    },
  },
  wood: {
    id: "wood", labelKo: "목재 (호두나무 화구함)", labelEn: "Walnut Wood",
    instrumentKo: "호두나무 팔레트 서랍 · 목각 제도판", instrumentEn: "Walnut Palette Drawer · Drafting Board",
    defaultMassKg: 1.25, defaultStiffnessNm: 265, defaultDampingNsm: 20.5,
    haptic: { patternMs: [14, 22, 10], intensity: 0.62, textureGrain: "warm-resonant" },
    acoustic: {
      fundamentalHz: 315, overtoneRatio: 1.68, decayMs: 112, timbreKind: "walnut-knock",
      descriptionKo: "화구함 서랍이 묵직하게 맞물리는 따뜻한 중저역 나무 울림",
      descriptionEn: "Warm mid-low walnut resonance with gentle organic rebound",
    },
  },
  metal: {
    id: "metal", labelKo: "금속 (황동 컴퍼스)", labelEn: "Brushed Brass",
    instrumentKo: "황동 디바이더 · 스틸 자석 클립", instrumentEn: "Brass Divider · Precision Magnetic Detent",
    defaultMassKg: 1.8, defaultStiffnessNm: 490, defaultDampingNsm: 31.5,
    haptic: { patternMs: [6, 8, 12], intensity: 0.86, textureGrain: "crisp-detent" },
    acoustic: {
      fundamentalHz: 1460, overtoneRatio: 2.74, decayMs: 92, timbreKind: "brass-detent",
      descriptionKo: "정밀 황동 다이얼이 찰칵 고정되는 선명한 금속 디텐트 음",
      descriptionEn: "Crisp high-Q metallic detent click with taut elastic snap",
    },
  },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function buildCssLinearEasing(frames: readonly TactileSpringFrame[], from: number, to: number): string {
  const span = to - from;
  if (frames.length <= 1 || Math.abs(span) < 1e-6) return "linear(0, 1)";
  const sampleCount = Math.min(16, frames.length);
  const stops: string[] = [];
  for (let i = 0; i < sampleCount; i += 1) {
    const idx = Math.round((i / Math.max(1, sampleCount - 1)) * (frames.length - 1));
    const frame = frames[idx];
    if (frame) stops.push(String(round3((frame.value - from) / span)));
  }
  return `linear(${stops.join(", ")})`;
}

/**
 * 실제 화구(종이·목재·금속)의 물리적 질량·강성·감쇠를 RK4 적분으로 시뮬레이션한다.
 * reducedMotion=true 일 때는 접근성 원칙에 따라 0ms 즉시 최종값으로 정착한다.
 */
export function simulateTactileSpring(config: TactileSpringConfig): TactileSpringSimulationResult {
  const signature = TACTILE_MATERIAL_SIGNATURES[config.material];
  const from = typeof config.from === "number" && Number.isFinite(config.from) ? config.from : 0;
  const to = typeof config.to === "number" && Number.isFinite(config.to) ? config.to : 1;
  const initialVelocity =
    typeof config.initialVelocity === "number" && Number.isFinite(config.initialVelocity)
      ? config.initialVelocity
      : 0;
  const reducedMotion = config.reducedMotion === true;

  const massKg = clamp(config.mass ?? signature.defaultMassKg, 0.05, 50);
  const stiffnessNm = clamp(config.stiffness ?? signature.defaultStiffnessNm, 10, 5000);
  const dampingNsm = clamp(config.damping ?? signature.defaultDampingNsm, 0.5, 500);
  const dtMs = clamp(config.dtMs ?? 8, 1, 16.67);
  const maxDurationMs = clamp(config.maxDurationMs ?? 2400, 100, 10000);
  const restEpsilon = clamp(config.restEpsilon ?? 0.001, 0.0001, 0.05);

  const criticalDamping = 2 * Math.sqrt(stiffnessNm * massKg);
  const dampingRatio = round4(dampingNsm / Math.max(1e-6, criticalDamping));
  const naturalFrequencyHz = round3(Math.sqrt(stiffnessNm / massKg) / (2 * Math.PI));
  const regime: SpringDampingRegime =
    dampingRatio < 0.96 ? "underdamped" : dampingRatio <= 1.04 ? "critically-damped" : "overdamped";

  if (reducedMotion) {
    return {
      material: config.material, materialSignature: signature,
      reducedMotion: true, settledImmediately: true,
      massKg: round3(massKg), stiffnessNm: round3(stiffnessNm), dampingNsm: round3(dampingNsm),
      dampingRatio, naturalFrequencyHz, regime,
      settleTimeMs: 0, peakOvershootRatio: 0,
      frames: [{ timeMs: 0, value: round4(to), velocity: 0, acceleration: 0 }],
      cssLinearEasing: "linear(1, 1)", cssTransitionFallback: "none",
    };
  }

  const dtSec = dtMs / 1000;
  const maxSteps = Math.ceil(maxDurationMs / dtMs);
  const accel = (pos: number, vel: number): number => (-stiffnessNm * (pos - to) - dampingNsm * vel) / massKg;

  let x = from;
  let v = initialVelocity;
  let stableStreak = 0;
  let settleTimeMs = maxDurationMs;

  const span = to - from;
  const direction = span >= 0 ? 1 : -1;
  const absSpan = Math.abs(span);
  let maxOvershoot = 0;

  const frames: TactileSpringFrame[] = [
    { timeMs: 0, value: round4(x), velocity: round4(v), acceleration: round4(accel(x, v)) },
  ];

  for (let step = 1; step <= maxSteps; step += 1) {
    const k1x = v;
    const k1v = accel(x, v);
    const k2x = v + 0.5 * dtSec * k1v;
    const k2v = accel(x + 0.5 * dtSec * k1x, v + 0.5 * dtSec * k1v);
    const k3x = v + 0.5 * dtSec * k2v;
    const k3v = accel(x + 0.5 * dtSec * k2x, v + 0.5 * dtSec * k2v);
    const k4x = v + dtSec * k3v;
    const k4v = accel(x + dtSec * k3x, v + dtSec * k3v);

    x += (dtSec / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (dtSec / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);

    const timeMs = round3(step * dtMs);
    if (absSpan > 1e-6) {
      const overshoot = (x - to) * direction;
      if (overshoot > maxOvershoot) maxOvershoot = overshoot;
    }

    const withinRest = Math.abs(x - to) <= restEpsilon && Math.abs(v) <= restEpsilon * 12;
    stableStreak = withinRest ? stableStreak + 1 : 0;

    if (stableStreak >= 2) {
      settleTimeMs = timeMs;
      frames.push({ timeMs, value: round4(to), velocity: 0, acceleration: 0 });
      break;
    }
    frames.push({ timeMs, value: round4(x), velocity: round4(v), acceleration: round4(accel(x, v)) });
  }

  const peakOvershootRatio = absSpan > 1e-6 ? round4(maxOvershoot / absSpan) : 0;
  const cssLinearEasing = buildCssLinearEasing(frames, from, to);

  return {
    material: config.material, materialSignature: signature,
    reducedMotion: false, settledImmediately: false,
    massKg: round3(massKg), stiffnessNm: round3(stiffnessNm), dampingNsm: round3(dampingNsm),
    dampingRatio, naturalFrequencyHz, regime,
    settleTimeMs: Math.round(settleTimeMs), peakOvershootRatio, frames, cssLinearEasing,
    cssTransitionFallback: `transform ${Math.round(settleTimeMs)}ms ${cssLinearEasing}`,
  };
}

// ============================================================================
// 절차적 OKLCH 시맨틱 스튜디오 테마 생성기 및 WCAG 2.1 AA 대비 검증기
// ============================================================================

export type ProceduralThemeMoodId =
  | "romance-pastel"
  | "noir-ink"
  | "fantasy-parchment"
  | "scifi-slate"
  | "slice-warm-linen";

export type SemanticThemeTokenName =
  | "canvas" | "panel" | "card" | "raised"
  | "line" | "lineStrong" | "fg" | "fg2" | "fg3"
  | "accent" | "accentSoft" | "onAccent";

export interface OklchColorToken {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
  readonly inSrgbGamut: boolean;
  readonly relativeLuminance: number;
  readonly css: string;
}

export interface ThemeContrastCheck {
  readonly pairId: string;
  readonly foregroundToken: SemanticThemeTokenName;
  readonly backgroundToken: SemanticThemeTokenName;
  readonly ratio: number;
  readonly requiredRatio: number;
  readonly passed: boolean;
}

export interface ProceduralThemeContrastAudit {
  readonly wcagAaPassed: boolean;
  readonly minTextContrastRatio: number;
  readonly minBorderContrastRatio: number;
  readonly checks: readonly ThemeContrastCheck[];
}

export interface ProceduralThemeSynthesisOptions {
  readonly paletteSeedHue?: number;
  readonly chromaScale?: number;
}

export interface ProceduralThemePresetMeta {
  readonly id: ProceduralThemeMoodId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly polarity: "light" | "dark";
  readonly atmosphereKo: string;
  readonly atmosphereEn: string;
  readonly recommendedMaterial: TactileMaterialId;
  readonly baseHue: number;
  readonly accentHue: number;
  readonly surfaceChroma: number;
  readonly accentChroma: number;
}

export interface ProceduralStudioTheme {
  readonly moodId: ProceduralThemeMoodId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly polarity: "light" | "dark";
  readonly atmosphereKo: string;
  readonly atmosphereEn: string;
  readonly recommendedMaterial: TactileMaterialId;
  readonly tokens: Readonly<Record<SemanticThemeTokenName, OklchColorToken>>;
  readonly cssVariables: Readonly<Record<string, string>>;
  readonly contrastAudit: ProceduralThemeContrastAudit;
  readonly artworkIsolationNoticeKo: string;
  readonly artworkIsolationNoticeEn: string;
}

export const PROCEDURAL_THEME_MOOD_IDS: readonly ProceduralThemeMoodId[] = [
  "romance-pastel", "noir-ink", "fantasy-parchment", "scifi-slate", "slice-warm-linen",
] as const;

export const PROCEDURAL_THEME_PRESETS: Readonly<Record<ProceduralThemeMoodId, ProceduralThemePresetMeta>> = {
  "romance-pastel": {
    id: "romance-pastel", labelKo: "로맨스 파스텔", labelEn: "Romance Pastel", polarity: "light",
    atmosphereKo: "꽃잎 아이보리 지면과 차분한 로즈베리 행동 신호로 감성 작화에 어울리는 밝은 작업실",
    atmosphereEn: "Soft petal-ivory drafting surfaces with poised rose-berry interactive accents",
    recommendedMaterial: "paper", baseHue: 14, accentHue: 352, surfaceChroma: 0.014, accentChroma: 0.145,
  },
  "noir-ink": {
    id: "noir-ink", labelKo: "느와르 잉크", labelEn: "Noir Ink", polarity: "dark",
    atmosphereKo: "깊은 송연 먹빛 표면과 은은한 달빛 앰버 강조로 야간 집중도를 높이는 암실 작업실",
    atmosphereEn: "Deep soot-ink studio surfaces paired with restrained moonlight-amber focus accents",
    recommendedMaterial: "wood", baseHue: 255, accentHue: 74, surfaceChroma: 0.011, accentChroma: 0.135,
  },
  "fantasy-parchment": {
    id: "fantasy-parchment", labelKo: "판타지 양피지", labelEn: "Fantasy Parchment", polarity: "light",
    atmosphereKo: "오래된 양피지의 따뜻한 황토 결감과 에메랄드 청동 잉크가 어우러진 고서 아틀리에",
    atmosphereEn: "Warm antique vellum tone balanced by archival verdigris-emerald ink accents",
    recommendedMaterial: "wood", baseHue: 82, accentHue: 176, surfaceChroma: 0.02, accentChroma: 0.11,
  },
  "scifi-slate": {
    id: "scifi-slate", labelKo: "SF 슬레이트", labelEn: "Sci-Fi Slate", polarity: "dark",
    atmosphereKo: "무광 슬레이트 금속 표면과 정밀 시안 계측선으로 메카·배경 작화를 돕는 제도실",
    atmosphereEn: "Matte brushed-slate chrome surfaces with crisp precision-cyan telemetry accents",
    recommendedMaterial: "metal", baseHue: 238, accentHue: 214, surfaceChroma: 0.016, accentChroma: 0.125,
  },
  "slice-warm-linen": {
    id: "slice-warm-linen", labelKo: "일상 웜 리넨", labelEn: "Warm Linen Slice", polarity: "light",
    atmosphereKo: "오후 햇살이 드는 생지 리넨 천과 테라코타 포인트로 눈의 피로를 줄이는 일상 화실",
    atmosphereEn: "Sunlit unbleached linen neutrals with terracotta craft accents for long sessions",
    recommendedMaterial: "paper", baseHue: 76, accentHue: 40, surfaceChroma: 0.015, accentChroma: 0.135,
  },
};

function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Björn Ottosson OKLCH → 선형 sRGB 변환(순수 수치 연산). */
function oklchToLinearSrgb(l: number, c: number, hDeg: number): {
  readonly r: number; readonly g: number; readonly b: number; readonly inGamut: boolean;
} {
  const hRad = (normalizeHue(hDeg) * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const lp = l + 0.3963377774 * a + 0.2158037573 * b;
  const mp = l - 0.1055613458 * a - 0.0638541728 * b;
  const sp = l - 0.0894841775 * a - 1.291485548 * b;
  const lc = lp * lp * lp;
  const mc = mp * mp * mp;
  const sc = sp * sp * sp;

  const rLin = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const gLin = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bLin = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;
  const eps = 0.0005;
  const inGamut =
    rLin >= -eps && rLin <= 1 + eps &&
    gLin >= -eps && gLin <= 1 + eps &&
    bLin >= -eps && bLin <= 1 + eps;

  return { r: clamp(rLin, 0, 1), g: clamp(gLin, 0, 1), b: clamp(bLin, 0, 1), inGamut };
}

/** WCAG 2.1 상대 휘도 계산(0..1). */
export function computeOklchRelativeLuminance(l: number, c: number, h: number): number {
  const { r, g, b } = oklchToLinearSrgb(clamp(l, 0, 1), Math.max(0, c), h);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 두 OKLCH 색상 간 WCAG 2.1 명암비(1.0..21.0) 계산. */
export function computeOklchContrastRatio(
  colorA: { readonly l: number; readonly c: number; readonly h: number },
  colorB: { readonly l: number; readonly c: number; readonly h: number },
): number {
  const lumA = computeOklchRelativeLuminance(colorA.l, colorA.c, colorA.h);
  const lumB = computeOklchRelativeLuminance(colorB.l, colorB.c, colorB.h);
  return round3((Math.max(lumA, lumB) + 0.05) / (Math.min(lumA, lumB) + 0.05));
}

function buildInGamutOklchToken(l: number, c: number, h: number, alpha = 1): OklchColorToken {
  const safeL = clamp(l, 0, 1);
  const safeH = round3(normalizeHue(h));
  let safeC = Math.max(0, c);
  let probe = oklchToLinearSrgb(safeL, safeC, safeH);

  if (!probe.inGamut && safeC > 0) {
    let low = 0;
    let high = safeC;
    for (let iter = 0; iter < 14; iter += 1) {
      const mid = (low + high) * 0.5;
      if (oklchToLinearSrgb(safeL, mid, safeH).inGamut) low = mid;
      else high = mid;
    }
    safeC = low;
    probe = oklchToLinearSrgb(safeL, safeC, safeH);
  }

  const finalL = round4(safeL);
  const finalC = round4(safeC);
  const finalAlpha = round3(clamp(alpha, 0, 1));
  const lum = round4(0.2126 * probe.r + 0.7152 * probe.g + 0.0722 * probe.b);
  const css =
    finalAlpha < 1
      ? `oklch(${finalL} ${finalC} ${safeH} / ${finalAlpha})`
      : `oklch(${finalL} ${finalC} ${safeH})`;

  return { l: finalL, c: finalC, h: safeH, alpha: finalAlpha, inSrgbGamut: probe.inGamut, relativeLuminance: lum, css };
}

function ensureContrastAgainstSurfaces(
  initialL: number,
  initialC: number,
  hue: number,
  surfaces: readonly OklchColorToken[],
  minRatio: number,
  preferDarker: boolean,
): OklchColorToken {
  let candidate = buildInGamutOklchToken(initialL, initialC, hue);
  const minCurrent = (): number =>
    surfaces.reduce((lowest, bg) => Math.min(lowest, computeOklchContrastRatio(candidate, bg)), 21);

  if (minCurrent() >= minRatio) return candidate;

  const step = preferDarker ? -0.012 : 0.012;
  let nextL = initialL;
  let nextC = initialC;

  for (let i = 0; i < 85; i += 1) {
    nextL = clamp(nextL + step, 0.04, 0.99);
    if (nextL < 0.22 || nextL > 0.88) nextC = Math.min(nextC, 0.09);
    candidate = buildInGamutOklchToken(nextL, nextC, hue);
    if (minCurrent() >= minRatio) return candidate;
  }
  return buildInGamutOklchToken(preferDarker ? 0.08 : 0.985, 0.004, hue);
}

/**
 * 프로젝트 장르·팔레트 성격에 맞는 절차적 OKLCH 스튜디오 시맨틱 테마를 생성하고
 * 모든 텍스트·악센트·경계 쌍의 WCAG 2.1 AA(4.5:1 / UI 3.0:1) 대비를 검증한다.
 */
export function synthesizeProceduralStudioTheme(
  moodId: ProceduralThemeMoodId,
  options?: ProceduralThemeSynthesisOptions,
): ProceduralStudioTheme {
  const preset = PROCEDURAL_THEME_PRESETS[moodId];
  const isLight = preset.polarity === "light";
  const hasSeedHue = options?.paletteSeedHue !== undefined && Number.isFinite(options.paletteSeedHue);
  const hueShift = hasSeedHue ? normalizeHue(options.paletteSeedHue ?? preset.baseHue) : preset.baseHue;
  const accentHue = hasSeedHue ? normalizeHue(hueShift + (preset.accentHue - preset.baseHue)) : preset.accentHue;
  const chromaScale = clamp(options?.chromaScale ?? 1, 0.4, 1.5);

  const sChroma = clamp(preset.surfaceChroma * chromaScale, 0.005, 0.032);
  const aChroma = clamp(preset.accentChroma * chromaScale, 0.06, 0.2);

  const canvas = buildInGamutOklchToken(isLight ? 0.962 : 0.155, sChroma, hueShift);
  const panel = buildInGamutOklchToken(isLight ? 0.938 : 0.185, sChroma * 1.05, hueShift);
  const card = buildInGamutOklchToken(isLight ? 0.978 : 0.21, sChroma * 0.9, hueShift);
  const raised = buildInGamutOklchToken(isLight ? 0.908 : 0.248, sChroma * 1.15, hueShift);
  const surfaces = [canvas, panel, card, raised] as const;

  const line = buildInGamutOklchToken(isLight ? 0.78 : 0.315, sChroma * 1.1, hueShift);
  const lineStrong = ensureContrastAgainstSurfaces(isLight ? 0.48 : 0.62, sChroma * 1.25, hueShift, [raised], 3.05, isLight);
  const fg = ensureContrastAgainstSurfaces(isLight ? 0.2 : 0.955, sChroma * 0.85, hueShift, surfaces, 7.0, isLight);
  const fg2 = ensureContrastAgainstSurfaces(isLight ? 0.34 : 0.79, sChroma * 0.95, hueShift, surfaces, 5.0, isLight);
  const fg3 = ensureContrastAgainstSurfaces(isLight ? 0.44 : 0.7, sChroma * 0.9, hueShift, surfaces, 4.55, isLight);
  const accent = ensureContrastAgainstSurfaces(isLight ? 0.43 : 0.76, aChroma, accentHue, surfaces, 4.55, isLight);
  const accentSoft = buildInGamutOklchToken(accent.l, accent.c, accent.h, isLight ? 0.14 : 0.18);

  const lightOnAcc = computeOklchContrastRatio({ l: 0.98, c: 0.004, h: accentHue }, accent);
  const darkOnAcc = computeOklchContrastRatio({ l: 0.14, c: 0.012, h: accentHue }, accent);
  const preferDarkOnAcc = darkOnAcc >= lightOnAcc;
  const onAccent = ensureContrastAgainstSurfaces(preferDarkOnAcc ? 0.14 : 0.98, 0.008, accentHue, [accent], 4.6, preferDarkOnAcc);

  const tokens: Readonly<Record<SemanticThemeTokenName, OklchColorToken>> = {
    canvas, panel, card, raised, line, lineStrong, fg, fg2, fg3, accent, accentSoft, onAccent,
  };

  const checks: ThemeContrastCheck[] = [];
  for (const fgName of ["fg", "fg2", "fg3", "accent"] as const) {
    for (const bgName of ["canvas", "panel", "card", "raised"] as const) {
      const ratio = computeOklchContrastRatio(tokens[fgName], tokens[bgName]);
      checks.push({ pairId: `${fgName}-on-${bgName}`, foregroundToken: fgName, backgroundToken: bgName, ratio, requiredRatio: 4.5, passed: ratio >= 4.5 });
    }
  }
  const onAccentRatio = computeOklchContrastRatio(tokens.onAccent, tokens.accent);
  checks.push({ pairId: "onAccent-on-accent", foregroundToken: "onAccent", backgroundToken: "accent", ratio: onAccentRatio, requiredRatio: 4.5, passed: onAccentRatio >= 4.5 });

  const borderRatio = computeOklchContrastRatio(tokens.lineStrong, tokens.raised);
  checks.push({ pairId: "lineStrong-on-raised", foregroundToken: "lineStrong", backgroundToken: "raised", ratio: borderRatio, requiredRatio: 3.0, passed: borderRatio >= 3.0 });

  const textChecks = checks.filter((item) => item.requiredRatio >= 4.5);
  const minTextContrastRatio = textChecks.reduce((min, item) => Math.min(min, item.ratio), 21);
  const wcagAaPassed = checks.every((item) => item.passed);

  const cssVariables: Readonly<Record<string, string>> = {
    "--color-canvas": canvas.css, "--color-panel": panel.css, "--color-card": card.css, "--color-raised": raised.css,
    "--color-line": line.css, "--color-line-strong": lineStrong.css, "--color-fg": fg.css, "--color-fg-2": fg2.css,
    "--color-fg-3": fg3.css, "--color-accent": accent.css, "--color-accent-soft": accentSoft.css, "--color-on-accent": onAccent.css,
  };

  return {
    moodId, labelKo: preset.labelKo, labelEn: preset.labelEn, polarity: preset.polarity,
    atmosphereKo: preset.atmosphereKo, atmosphereEn: preset.atmosphereEn,
    recommendedMaterial: preset.recommendedMaterial, tokens, cssVariables,
    contrastAudit: { wcagAaPassed, minTextContrastRatio: round3(minTextContrastRatio), minBorderContrastRatio: round3(borderRatio), checks },
    artworkIsolationNoticeKo: "절차적 테마 토큰은 스튜디오 UI 크롬에만 적용되며 원고 캔버스 픽셀·브러시 색상·출고 결과물에는 일절 개입하지 않습니다.",
    artworkIsolationNoticeEn: "Procedural theme tokens style studio chrome only and never alter manuscript canvas pixels, brush pigments, or exports.",
  };
}
