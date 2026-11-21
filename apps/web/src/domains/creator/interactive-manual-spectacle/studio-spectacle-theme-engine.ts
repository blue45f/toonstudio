/**
 * 세련된 Anti-Slop OKLCH 프리즘 연출 · 4대 웹툰 장르 아틀리에 무드 테마 ·
 * 러프 콘티 ↔ 3D·풀컬러 비포/애프터 드래그 커튼 · 1.5초 성취 스튜디오 맥박 엔진.
 */

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

export type AtelierGenreThemeId =
  | "rofan-cream-gold"
  | "hunter-slate-cyan"
  | "academy-mint-coral"
  | "murim-hanji-ink";

export interface AtelierThemeContrastAudit {
  readonly primaryTextRatio: number;
  readonly secondaryTextRatio: number;
  readonly accentOnSurfaceRatio: number;
  readonly accentButtonTextRatio: number;
  readonly passesWcagAa: boolean;
}

export interface AtelierGenreTheme {
  readonly id: AtelierGenreThemeId;
  readonly name: string;
  readonly genreTag: string;
  readonly moodDescription: string;
  readonly polarity: "light" | "dark";
  readonly tokens: {
    readonly bg: OklchColor;
    readonly surface: OklchColor;
    readonly card: OklchColor;
    readonly inkPrimary: OklchColor;
    readonly inkSecondary: OklchColor;
    readonly accent: OklchColor;
    readonly accentInk: OklchColor;
    readonly border: OklchColor;
    readonly prismStart: OklchColor;
    readonly prismMid: OklchColor;
    readonly prismEnd: OklchColor;
  };
  readonly contrast: AtelierThemeContrastAudit;
}

export interface BeforeAfterCurtainState {
  readonly positionPercent: number;
  readonly roughPercent: number;
  readonly polishedPercent: number;
  readonly activeStageLabel: string;
  readonly stageSummary: string;
  readonly theme: AtelierGenreTheme;
}

export interface AchievementPulseSpec {
  readonly mode: "idle" | "prism-pulse" | "static-badge";
  readonly durationMs: number;
  readonly reducedMotionSafe: boolean;
  readonly prismRings: number;
  readonly sparkleNodes: number;
  readonly prismGradientCss: string;
  readonly ariaLiveMessage: string;
}

function clampUnit(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function formatOklch(color: OklchColor): string {
  const l = Math.round(clampUnit(color.l, 0, 1, 0.5) * 1000) / 1000;
  const c = Math.round(clampUnit(color.c, 0, 0.4, 0) * 1000) / 1000;
  const h = Math.round((((color.h % 360) + 360) % 360) * 10) / 10;
  return `oklch(${l} ${c} ${h})`;
}

/** Björn Ottosson OKLab → Linear sRGB → WCAG 2.1 상대 휘도 기반 정밀 대비비 계산 */
export function computeOklchContrastRatio(
  foreground: OklchColor,
  background: OklchColor,
): number {
  const toRelativeLuminance = (color: OklchColor): number => {
    const rad = (color.h * Math.PI) / 180;
    const a = color.c * Math.cos(rad);
    const b = color.c * Math.sin(rad);
    const lRoot = color.l + 0.3963377774 * a + 0.2158037573 * b;
    const mRoot = color.l - 0.1055613458 * a - 0.0638541728 * b;
    const sRoot = color.l - 0.0894841775 * a - 1.291485548 * b;
    const l = lRoot * lRoot * lRoot;
    const m = mRoot * mRoot * mRoot;
    const s = sRoot * sRoot * sRoot;
    const r = clampUnit(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, 0, 1, 0);
    const g = clampUnit(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, 0, 1, 0);
    const bl = clampUnit(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s, 0, 1, 0);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };

  const lum1 = toRelativeLuminance(foreground);
  const lum2 = toRelativeLuminance(background);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100;
}

function buildAuditedTheme(spec: Omit<AtelierGenreTheme, "contrast">): AtelierGenreTheme {
  const primaryTextRatio = Math.min(
    computeOklchContrastRatio(spec.tokens.inkPrimary, spec.tokens.bg),
    computeOklchContrastRatio(spec.tokens.inkPrimary, spec.tokens.card),
  );
  const secondaryTextRatio = Math.min(
    computeOklchContrastRatio(spec.tokens.inkSecondary, spec.tokens.bg),
    computeOklchContrastRatio(spec.tokens.inkSecondary, spec.tokens.card),
  );
  const accentOnSurfaceRatio = Math.min(
    computeOklchContrastRatio(spec.tokens.accent, spec.tokens.bg),
    computeOklchContrastRatio(spec.tokens.accent, spec.tokens.card),
  );
  const accentButtonTextRatio = computeOklchContrastRatio(
    spec.tokens.accentInk,
    spec.tokens.accent,
  );
  const passesWcagAa =
    primaryTextRatio >= 4.5 &&
    secondaryTextRatio >= 4.5 &&
    accentOnSurfaceRatio >= 4.5 &&
    accentButtonTextRatio >= 4.5;

  return {
    ...spec,
    contrast: {
      primaryTextRatio,
      secondaryTextRatio,
      accentOnSurfaceRatio,
      accentButtonTextRatio,
      passesWcagAa,
    },
  };
}

export const ATELIER_GENRE_THEMES: readonly AtelierGenreTheme[] = [
  buildAuditedTheme({
    id: "rofan-cream-gold",
    name: "로판 크림·골드",
    genreTag: "로맨스판타지",
    moodDescription: "양피지 크림 바탕에 앤티크 골드 광택을 얹은 귀족 서재 무드",
    polarity: "light",
    tokens: {
      bg: { l: 0.975, c: 0.014, h: 86 },
      surface: { l: 0.955, c: 0.018, h: 84 },
      card: { l: 0.992, c: 0.008, h: 86 },
      inkPrimary: { l: 0.22, c: 0.03, h: 56 },
      inkSecondary: { l: 0.42, c: 0.032, h: 62 },
      accent: { l: 0.48, c: 0.13, h: 72 },
      accentInk: { l: 0.985, c: 0.008, h: 88 },
      border: { l: 0.85, c: 0.032, h: 80 },
      prismStart: { l: 0.72, c: 0.125, h: 78 },
      prismMid: { l: 0.68, c: 0.115, h: 28 },
      prismEnd: { l: 0.66, c: 0.095, h: 145 },
    },
  }),
  buildAuditedTheme({
    id: "hunter-slate-cyan",
    name: "헌터 딥슬레이트·시안",
    genreTag: "헌터·액션",
    moodDescription: "야간 작전실 딥슬레이트와 예리한 빙청 시안 하이라이트 무드",
    polarity: "dark",
    tokens: {
      bg: { l: 0.18, c: 0.022, h: 242 },
      surface: { l: 0.205, c: 0.024, h: 240 },
      card: { l: 0.23, c: 0.024, h: 240 },
      inkPrimary: { l: 0.955, c: 0.012, h: 215 },
      inkSecondary: { l: 0.79, c: 0.025, h: 220 },
      accent: { l: 0.78, c: 0.125, h: 206 },
      accentInk: { l: 0.16, c: 0.024, h: 240 },
      border: { l: 0.36, c: 0.032, h: 236 },
      prismStart: { l: 0.78, c: 0.125, h: 206 },
      prismMid: { l: 0.74, c: 0.11, h: 168 },
      prismEnd: { l: 0.76, c: 0.11, h: 84 },
    },
  }),
  buildAuditedTheme({
    id: "academy-mint-coral",
    name: "학원 민트·코랄",
    genreTag: "학원·청춘",
    moodDescription: "맑은 페이퍼 민트와 생기 있는 코랄 포인트의 청량한 아틀리에",
    polarity: "light",
    tokens: {
      bg: { l: 0.974, c: 0.015, h: 168 },
      surface: { l: 0.952, c: 0.02, h: 166 },
      card: { l: 0.992, c: 0.008, h: 168 },
      inkPrimary: { l: 0.22, c: 0.032, h: 184 },
      inkSecondary: { l: 0.41, c: 0.032, h: 180 },
      accent: { l: 0.51, c: 0.175, h: 24 },
      accentInk: { l: 0.99, c: 0.006, h: 30 },
      border: { l: 0.84, c: 0.032, h: 170 },
      prismStart: { l: 0.68, c: 0.12, h: 168 },
      prismMid: { l: 0.66, c: 0.15, h: 24 },
      prismEnd: { l: 0.72, c: 0.12, h: 88 },
    },
  }),
  buildAuditedTheme({
    id: "murim-hanji-ink",
    name: "무협 한지·먹빛",
    genreTag: "무협·동양풍",
    moodDescription: "결이 살아 있는 한지 바탕에 깊은 먹빛과 인주 주홍을 더한 서화실",
    polarity: "light",
    tokens: {
      bg: { l: 0.962, c: 0.013, h: 88 },
      surface: { l: 0.938, c: 0.016, h: 86 },
      card: { l: 0.985, c: 0.008, h: 88 },
      inkPrimary: { l: 0.19, c: 0.014, h: 75 },
      inkSecondary: { l: 0.4, c: 0.018, h: 76 },
      accent: { l: 0.48, c: 0.17, h: 27 },
      accentInk: { l: 0.985, c: 0.008, h: 85 },
      border: { l: 0.82, c: 0.022, h: 84 },
      prismStart: { l: 0.56, c: 0.15, h: 27 },
      prismMid: { l: 0.64, c: 0.095, h: 82 },
      prismEnd: { l: 0.48, c: 0.06, h: 155 },
    },
  }),
];

export function clampCurtainPosition(percent: number): number {
  if (!Number.isFinite(percent)) return 50;
  return Math.round(Math.min(100, Math.max(0, percent)) * 10) / 10;
}

export class StudioSpectacleThemeEngine {
  listThemes(): readonly AtelierGenreTheme[] {
    return ATELIER_GENRE_THEMES;
  }

  getTheme(themeId: AtelierGenreThemeId): AtelierGenreTheme {
    return ATELIER_GENRE_THEMES.find((theme) => theme.id === themeId) ?? ATELIER_GENRE_THEMES[0]!;
  }

  buildCurtainComparison(
    positionPercent: number,
    themeId: AtelierGenreThemeId,
  ): BeforeAfterCurtainState {
    const clamped = clampCurtainPosition(positionPercent);
    const theme = this.getTheme(themeId);
    let activeStageLabel = "콘티 ↔ 3D·풀컬러 실시간 비교";
    let stageSummary =
      "왼쪽 러프 콘티의 동선과 오른쪽 3D 투시·풀컬러 림라이트를 한 화면에서 대조합니다.";

    if (clamped <= 25) {
      activeStageLabel = "3D·풀컬러 최종 마감 중심 보기";
      stageSummary =
        "3D 배경 선화 추출, 장르 무드 조명, 최종 풀컬러 마감 완성도를 집중 확인합니다.";
    } else if (clamped >= 75) {
      activeStageLabel = "러프 콘티·투시 가이드 중심 보기";
      stageSummary =
        "연필 콘티 구도와 소실점 보조선이 컷 연출 리듬을 어떻게 잡는지 확인합니다.";
    }

    return {
      positionPercent: clamped,
      roughPercent: clamped,
      polishedPercent: Math.round((100 - clamped) * 10) / 10,
      activeStageLabel,
      stageSummary,
      theme,
    };
  }

  resolveAchievementPulse(params: {
    readonly triggered: boolean;
    readonly prefersReducedMotion: boolean;
    readonly themeId: AtelierGenreThemeId;
  }): AchievementPulseSpec {
    const theme = this.getTheme(params.themeId);
    const prismGradientCss = `linear-gradient(120deg, ${formatOklch(theme.tokens.prismStart)}, ${formatOklch(theme.tokens.prismMid)}, ${formatOklch(theme.tokens.prismEnd)})`;

    if (!params.triggered) {
      return {
        mode: "idle",
        durationMs: 0,
        reducedMotionSafe: true,
        prismRings: 0,
        sparkleNodes: 0,
        prismGradientCss,
        ariaLiveMessage: "",
      };
    }

    if (params.prefersReducedMotion) {
      return {
        mode: "static-badge",
        durationMs: 0,
        reducedMotionSafe: true,
        prismRings: 0,
        sparkleNodes: 0,
        prismGradientCss,
        ariaLiveMessage:
          "3분 실습 완주! 모션 감쇠 환경에 맞춰 정적 고대비 완료 배지로 표시했습니다.",
      };
    }

    return {
      mode: "prism-pulse",
      durationMs: 1500,
      reducedMotionSafe: false,
      prismRings: 3,
      sparkleNodes: 8,
      prismGradientCss,
      ariaLiveMessage:
        "3분 실습 완주! 1.5초 OKLCH 프리즘 스튜디오 맥박과 완료 배지가 활성화되었습니다.",
    };
  }

  toCssVariables(themeId: AtelierGenreThemeId): Readonly<Record<string, string>> {
    const { tokens } = this.getTheme(themeId);
    return {
      "--ims-bg": formatOklch(tokens.bg),
      "--ims-surface": formatOklch(tokens.surface),
      "--ims-card": formatOklch(tokens.card),
      "--ims-ink": formatOklch(tokens.inkPrimary),
      "--ims-ink-2": formatOklch(tokens.inkSecondary),
      "--ims-accent": formatOklch(tokens.accent),
      "--ims-accent-ink": formatOklch(tokens.accentInk),
      "--ims-border": formatOklch(tokens.border),
      "--ims-prism-start": formatOklch(tokens.prismStart),
      "--ims-prism-mid": formatOklch(tokens.prismMid),
      "--ims-prism-end": formatOklch(tokens.prismEnd),
    };
  }
}
