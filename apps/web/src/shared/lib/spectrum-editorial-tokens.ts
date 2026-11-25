/**
 * 스펙트럼 에디토리얼(Spectrum Editorial) 디자인 시스템 정본 토큰 및 자가 감사 유틸리티.
 *
 * - 85 / 10 / 5 Chromatic Discipline: 85% 따뜻한 무채색 갤러리 표면 · 10% 5대 도메인 안료 · 5% 정밀 디테일
 * - Zero-Violet Slop: 바이올렛·퍼플 휴 대역(270~320deg)과 원시 hex/rgb/hsl 리터럴을 원천 차단한다.
 * - 기존 9개 디자인 테마(starlight · dark · light · graphite 등) 계약과 충돌하지 않는 순수 확장 레이어다.
 */

export const SPECTRUM_DOMAIN_IDS = ["draw", "3d", "character", "market", "collab"] as const;
export type SpectrumDomainId = (typeof SPECTRUM_DOMAIN_IDS)[number];

export const SPECTRUM_PALETTE_IDS = ["editorial-vivid", "editorial-paper"] as const;
export type SpectrumPaletteId = (typeof SPECTRUM_PALETTE_IDS)[number];

export const SPECTRUM_CHROMATIC_DISCIPLINE = {
  neutralSurfaceRatio: 0.85,
  domainPigmentRatio: 0.1,
  editorialDetailRatio: 0.05,
} as const;

export const VIOLET_SLOP_HUE_RANGE = { min: 270, max: 320 } as const;
export const WCAG_AA_TEXT_MIN_CONTRAST = 4.5;
export const WCAG_AA_BOUNDARY_MIN_CONTRAST = 3;

export interface OklchColor {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

export interface SpectrumPigmentVariant {
  readonly ink: string;
  readonly soft: string;
  readonly border: string;
  readonly onPigment: string;
}

export interface SpectrumDomainPigment {
  readonly id: SpectrumDomainId;
  readonly cssVar: `--spectrum-pigment-${SpectrumDomainId}`;
  readonly hue: number;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly roleKo: string;
  readonly vivid: SpectrumPigmentVariant;
  readonly paper: SpectrumPigmentVariant;
}

export interface SpectrumPaletteSpec {
  readonly id: SpectrumPaletteId;
  readonly mode: "dark" | "light";
  readonly labelKo: string;
  readonly labelEn: string;
  readonly surfaces: { readonly canvas: string; readonly panel: string; readonly card: string; readonly raised: string };
  readonly lines: { readonly subtle: string; readonly strong: string };
  readonly ink: {
    readonly fg: string; readonly fg2: string; readonly fg3: string;
    readonly accent: string; readonly accent2: string; readonly accentSoft: string; readonly onAccent: string;
  };
  readonly semantic: { readonly cool: string; readonly good: string; readonly warn: string; readonly bad: string };
}

export interface VioletSlopViolation {
  readonly token: string; readonly value: string; readonly hue: number; readonly chroma: number; readonly reason: string;
}

export interface ZeroVioletAuditReport {
  readonly ok: boolean;
  readonly inspectedCount: number;
  readonly violetViolations: readonly VioletSlopViolation[];
  readonly rawColorViolations: readonly string[];
}

export interface SpectrumContrastViolation {
  readonly pair: string; readonly ratio: number; readonly required: number;
}

export interface SpectrumPaletteContrastReport {
  readonly paletteId: SpectrumPaletteId;
  readonly ok: boolean;
  readonly minTextRatio: number;
  readonly minBoundaryRatio: number;
  readonly checkedPairs: number;
  readonly violations: readonly SpectrumContrastViolation[];
}

function definePigment(
  id: SpectrumDomainId, hue: number, nameKo: string, nameEn: string, roleKo: string,
  vividLC: readonly [number, number], paperLC: readonly [number, number],
): SpectrumDomainPigment {
  const v = `oklch(${vividLC[0]} ${vividLC[1]} ${hue}`;
  const p = `oklch(${paperLC[0]} ${paperLC[1]} ${hue}`;
  return {
    id, cssVar: `--spectrum-pigment-${id}`, hue, nameKo, nameEn, roleKo,
    vivid: { ink: `${v})`, soft: `${v} / 0.14)`, border: `${v} / 0.38)`, onPigment: "oklch(0.145 0.005 65)" },
    paper: { ink: `${p})`, soft: `${p} / 0.12)`, border: `${p} / 0.34)`, onPigment: "oklch(0.988 0.004 85)" },
  };
}

export const SPECTRUM_DOMAIN_PIGMENTS: Readonly<Record<SpectrumDomainId, SpectrumDomainPigment>> = {
  draw: definePigment("draw", 28, "버밀리온 인주", "Vermilion Seal", "2D 드로잉 · 펜 · 브러시 · 작화", [0.715, 0.165], [0.495, 0.175]),
  "3d": definePigment("3d", 245, "코발트 울트라마린", "Cobalt Ultramarine", "3D 배경 · 스테이지 · 공간 · 카메라", [0.74, 0.135], [0.465, 0.115]),
  character: definePigment("character", 72, "마리골드 앰버", "Marigold Amber", "캐릭터 · 셰이퍼 · 포즈 · 표정", [0.79, 0.158], [0.475, 0.098]),
  market: definePigment("market", 158, "비리디안 에메랄드", "Viridian Emerald", "소재 마켓 · 라이선스 · 수익 · 정산", [0.765, 0.155], [0.46, 0.106]),
  collab: definePigment("collab", 198, "세룰리안 티얼", "Cerulean Teal", "협업 · 프로덕션 · 리뷰 · 스토리보드", [0.78, 0.125], [0.465, 0.078]),
};

export const SPECTRUM_EDITORIAL_PALETTES: Readonly<Record<SpectrumPaletteId, SpectrumPaletteSpec>> = {
  "editorial-vivid": {
    id: "editorial-vivid",
    mode: "dark",
    labelKo: "에디토리얼 비비드 (흑단 갤러리)",
    labelEn: "Editorial Vivid (Ebony Gallery)",
    surfaces: {
      canvas: "oklch(0.145 0.005 65)",
      panel: "oklch(0.175 0.006 66)",
      card: "oklch(0.205 0.006 67)",
      raised: "oklch(0.245 0.007 68)",
    },
    lines: { subtle: "oklch(0.325 0.008 68)", strong: "oklch(0.555 0.01 68)" },
    ink: {
      fg: "oklch(0.962 0.006 82)",
      fg2: "oklch(0.79 0.009 76)",
      fg3: "oklch(0.685 0.01 72)",
      accent: SPECTRUM_DOMAIN_PIGMENTS.draw.vivid.ink,
      accent2: SPECTRUM_DOMAIN_PIGMENTS.character.vivid.ink,
      accentSoft: SPECTRUM_DOMAIN_PIGMENTS.draw.vivid.soft,
      onAccent: "oklch(0.145 0.005 65)",
    },
    semantic: {
      cool: SPECTRUM_DOMAIN_PIGMENTS["3d"].vivid.ink,
      good: SPECTRUM_DOMAIN_PIGMENTS.market.vivid.ink,
      warn: SPECTRUM_DOMAIN_PIGMENTS.character.vivid.ink,
      bad: "oklch(0.705 0.17 22)",
    },
  },
  "editorial-paper": {
    id: "editorial-paper",
    mode: "light",
    labelKo: "에디토리얼 페이퍼 (한지 아카이브)",
    labelEn: "Editorial Paper (Hanji Archive)",
    surfaces: {
      canvas: "oklch(0.98 0.006 85)",
      panel: "oklch(0.962 0.007 84)",
      card: "oklch(0.994 0.004 85)",
      raised: "oklch(0.935 0.009 82)",
    },
    lines: { subtle: "oklch(0.865 0.01 80)", strong: "oklch(0.575 0.012 75)" },
    ink: {
      fg: "oklch(0.185 0.01 65)",
      fg2: "oklch(0.365 0.012 68)",
      fg3: "oklch(0.465 0.012 70)",
      accent: SPECTRUM_DOMAIN_PIGMENTS.draw.paper.ink,
      accent2: SPECTRUM_DOMAIN_PIGMENTS["3d"].paper.ink,
      accentSoft: SPECTRUM_DOMAIN_PIGMENTS.draw.paper.soft,
      onAccent: "oklch(0.988 0.004 85)",
    },
    semantic: {
      cool: SPECTRUM_DOMAIN_PIGMENTS["3d"].paper.ink,
      good: SPECTRUM_DOMAIN_PIGMENTS.market.paper.ink,
      warn: SPECTRUM_DOMAIN_PIGMENTS.character.paper.ink,
      bad: "oklch(0.48 0.175 22)",
    },
  },
};

const OKLCH_SINGLE_RE =
  /^oklch\(\s*(-?\d+(?:\.\d+)?)(%)?\s+(-?\d+(?:\.\d+)?)(%)?\s+(-?\d+(?:\.\d+)?)(?:deg)?(?:\s*\/\s*(\d+(?:\.\d+)?)(%)?)?\s*\)$/iu;
const OKLCH_INLINE_RE = /oklch\([^)]*\)/giu;
const RAW_COLOR_LITERAL_RE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\([^)]*\)/giu;
const CSS_DECLARATION_RE = /(--[\w-]+)\s*:\s*([^;{}]+);/gu;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const encodeSrgb = (v: number): number => {
  const c = clamp01(v);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
};
const decodeSrgb = (v: number): number => {
  const c = clamp01(v);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearLuminance = (rgb: readonly [number, number, number]): number =>
  0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];

export function normalizeHueDegrees(hue: number): number {
  const normalized = hue % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function parseOklchColor(input: string): OklchColor | null {
  const match = OKLCH_SINGLE_RE.exec(input.trim());
  if (!match) return null;
  const l = Number.parseFloat(match[1] ?? "NaN") * (match[2] ? 0.01 : 1);
  const c = Number.parseFloat(match[3] ?? "NaN") * (match[4] ? 0.004 : 1);
  const rawHue = Number.parseFloat(match[5] ?? "NaN");
  const alpha = match[6] === undefined ? 1 : Number.parseFloat(match[6]) * (match[7] ? 0.01 : 1);
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(rawHue) || !Number.isFinite(alpha)) return null;
  if (l < 0 || l > 1 || c < 0 || c > 0.45 || alpha < 0 || alpha > 1) return null;
  return { l, c, h: normalizeHueDegrees(rawHue), alpha };
}

/** Björn Ottosson OKLab 행렬로 OKLCH를 linear sRGB(0..1)로 변환한다. */
export function oklchToLinearSrgb(color: OklchColor): readonly [number, number, number] {
  const radians = (color.h * Math.PI) / 180;
  const a = color.c * Math.cos(radians);
  const b = color.c * Math.sin(radians);
  const l = (color.l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (color.l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (color.l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    clamp01(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp01(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp01(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function oklchRelativeLuminance(color: string | OklchColor): number {
  const parsed = typeof color === "string" ? parseOklchColor(color) : color;
  if (!parsed) throw new Error(`유효하지 않은 OKLCH 색상입니다: ${String(color)}`);
  if (parsed.alpha < 1) throw new Error(`반투명 OKLCH 색상은 합성 후 휘도를 계산해야 합니다: ${String(color)}`);
  return linearLuminance(oklchToLinearSrgb(parsed));
}

export function compositeOklchOver(foreground: string, background: string): readonly [number, number, number] {
  const fg = parseOklchColor(foreground);
  const bg = parseOklchColor(background);
  if (!fg || !bg) throw new Error(`OKLCH 합성 입력 오류: ${foreground} over ${background}`);
  if (bg.alpha < 1) throw new Error(`배경 색상은 불투명해야 합니다: ${background}`);
  const fgLin = oklchToLinearSrgb(fg);
  const bgLin = oklchToLinearSrgb(bg);
  if (fg.alpha >= 1) return fgLin;
  const mix = (i: 0 | 1 | 2): number => decodeSrgb(fg.alpha * encodeSrgb(fgLin[i]) + (1 - fg.alpha) * encodeSrgb(bgLin[i]));
  return [mix(0), mix(1), mix(2)];
}

export function oklchContrastRatio(foreground: string, background: string): number {
  const fg = parseOklchColor(foreground);
  const bg = parseOklchColor(background);
  if (!fg || !bg) throw new Error(`OKLCH 대비 계산 입력 오류: ${foreground} / ${background}`);
  if (bg.alpha < 1) throw new Error(`배경 색상은 불투명해야 합니다: ${background}`);
  const fgLum = fg.alpha < 1 ? linearLuminance(compositeOklchOver(foreground, background)) : linearLuminance(oklchToLinearSrgb(fg));
  const bgLum = linearLuminance(oklchToLinearSrgb(bg));
  return (Math.max(fgLum, bgLum) + 0.05) / (Math.min(fgLum, bgLum) + 0.05);
}

export function meetsWcagContrast(foreground: string, background: string, minRatio: number = WCAG_AA_TEXT_MIN_CONTRAST): boolean {
  return oklchContrastRatio(foreground, background) >= minRatio;
}

/** 바이올렛·퍼플 AI 슬롭 휴 대역(270~320deg) 여부를 판정한다. 순수 무채색(chroma === 0)은 제외한다. */
export function isVioletSlopHue(hue: number, chroma = 0.1): boolean {
  if (!Number.isFinite(hue) || !Number.isFinite(chroma) || chroma <= 0) return false;
  const normalized = normalizeHueDegrees(hue);
  return normalized >= VIOLET_SLOP_HUE_RANGE.min && normalized <= VIOLET_SLOP_HUE_RANGE.max;
}

/** CSS 소스 문자열이나 토큰 맵에서 바이올렛 휴 대역(270~320deg) 및 원시 hex/rgb/hsl 리터럴을 감사한다. */
export function auditZeroVioletSlop(sourceOrTokens: string | Readonly<Record<string, string>>): ZeroVioletAuditReport {
  const entries: Array<[string, string]> = [];
  const rawColorViolations: string[] = [];

  if (typeof sourceOrTokens === "string") {
    const stripped = sourceOrTokens.replace(/\/\*[\s\S]*?\*\//gu, "");
    for (const match of stripped.matchAll(RAW_COLOR_LITERAL_RE)) rawColorViolations.push(match[0]);
    const declMatches = [...stripped.matchAll(CSS_DECLARATION_RE)];
    if (declMatches.length > 0) {
      for (const match of declMatches) {
        const token = match[1] ?? "css-token";
        for (const oklchMatch of (match[2] ?? "").matchAll(OKLCH_INLINE_RE)) entries.push([token, oklchMatch[0]]);
      }
    } else {
      let index = 0;
      for (const oklchMatch of stripped.matchAll(OKLCH_INLINE_RE)) {
        entries.push([`inline#${index}`, oklchMatch[0]]);
        index += 1;
      }
    }
  } else {
    for (const [token, value] of Object.entries(sourceOrTokens)) {
      for (const rawMatch of value.matchAll(RAW_COLOR_LITERAL_RE)) rawColorViolations.push(`${token}: ${rawMatch[0]}`);
      for (const oklchMatch of value.matchAll(OKLCH_INLINE_RE)) entries.push([token, oklchMatch[0]]);
    }
  }

  const violetViolations: VioletSlopViolation[] = [];
  for (const [token, literal] of entries) {
    const parsed = parseOklchColor(literal);
    if (!parsed || !isVioletSlopHue(parsed.h, parsed.c)) continue;
    violetViolations.push({
      token,
      value: literal,
      hue: parsed.h,
      chroma: parsed.c,
      reason: `바이올렛 금지 대역(${VIOLET_SLOP_HUE_RANGE.min}~${VIOLET_SLOP_HUE_RANGE.max}deg) 감지: hue ${parsed.h}deg`,
    });
  }

  return { ok: violetViolations.length === 0 && rawColorViolations.length === 0, inspectedCount: entries.length, violetViolations, rawColorViolations };
}

export function auditSpectrumPaletteContrast(paletteId: SpectrumPaletteId): SpectrumPaletteContrastReport {
  const palette = SPECTRUM_EDITORIAL_PALETTES[paletteId];
  const variantKey = palette.mode === "dark" ? "vivid" : "paper";
  const violations: SpectrumContrastViolation[] = [];
  let minTextRatio = Number.POSITIVE_INFINITY;
  let minBoundaryRatio = Number.POSITIVE_INFINITY;
  let checkedPairs = 0;

  const recordText = (pair: string, ratio: number): void => {
    checkedPairs += 1;
    if (ratio < minTextRatio) minTextRatio = ratio;
    if (ratio < WCAG_AA_TEXT_MIN_CONTRAST) violations.push({ pair, ratio, required: WCAG_AA_TEXT_MIN_CONTRAST });
  };

  for (const [surfaceName, surfaceColor] of Object.entries(palette.surfaces)) {
    const inks: ReadonlyArray<readonly [string, string]> = [
      ["fg", palette.ink.fg], ["fg2", palette.ink.fg2], ["fg3", palette.ink.fg3],
      ["accent", palette.ink.accent], ["accent2", palette.ink.accent2],
      ["cool", palette.semantic.cool], ["good", palette.semantic.good], ["warn", palette.semantic.warn], ["bad", palette.semantic.bad],
    ];
    for (const [inkName, inkColor] of inks) recordText(`${inkName}/${surfaceName}`, oklchContrastRatio(inkColor, surfaceColor));

    for (const domainId of SPECTRUM_DOMAIN_IDS) {
      const variant = SPECTRUM_DOMAIN_PIGMENTS[domainId][variantKey];
      recordText(`pigment-${domainId}/${surfaceName}`, oklchContrastRatio(variant.ink, surfaceColor));
      const tintedLum = linearLuminance(compositeOklchOver(variant.soft, surfaceColor));
      const inkLum = oklchRelativeLuminance(variant.ink);
      recordText(`pigment-${domainId}/${surfaceName}+soft`, (Math.max(inkLum, tintedLum) + 0.05) / (Math.min(inkLum, tintedLum) + 0.05));
    }

    const boundaryRatio = oklchContrastRatio(palette.lines.strong, surfaceColor);
    checkedPairs += 1;
    if (boundaryRatio < minBoundaryRatio) minBoundaryRatio = boundaryRatio;
    if (boundaryRatio < WCAG_AA_BOUNDARY_MIN_CONTRAST) {
      violations.push({ pair: `line-strong/${surfaceName}`, ratio: boundaryRatio, required: WCAG_AA_BOUNDARY_MIN_CONTRAST });
    }
  }

  recordText("onAccent/accent", oklchContrastRatio(palette.ink.onAccent, palette.ink.accent));
  recordText("onAccent/accent2", oklchContrastRatio(palette.ink.onAccent, palette.ink.accent2));
  for (const domainId of SPECTRUM_DOMAIN_IDS) {
    const variant = SPECTRUM_DOMAIN_PIGMENTS[domainId][variantKey];
    recordText(`onPigment/pigment-${domainId}`, oklchContrastRatio(variant.onPigment, variant.ink));
  }

  return { paletteId, ok: violations.length === 0, minTextRatio, minBoundaryRatio, checkedPairs, violations };
}

export const getSpectrumDomainPigment = (domain: SpectrumDomainId): SpectrumDomainPigment => SPECTRUM_DOMAIN_PIGMENTS[domain];
export const getSpectrumPaletteSpec = (paletteId: SpectrumPaletteId): SpectrumPaletteSpec => SPECTRUM_EDITORIAL_PALETTES[paletteId];

export function buildSpectrumHairlineGradient(paletteId: SpectrumPaletteId = "editorial-vivid"): string {
  const variantKey = SPECTRUM_EDITORIAL_PALETTES[paletteId].mode === "dark" ? "vivid" : "paper";
  const ordered: readonly SpectrumDomainId[] = ["draw", "character", "market", "collab", "3d"];
  const stops = ordered.map((domainId, i) => `${SPECTRUM_DOMAIN_PIGMENTS[domainId][variantKey].ink} ${Math.round((i / (ordered.length - 1)) * 100)}%`);
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

export function resolveSpectrumDomainCssVars(
  domain: SpectrumDomainId,
  paletteId: SpectrumPaletteId = "editorial-vivid",
): Readonly<Record<string, string>> {
  const variant = SPECTRUM_DOMAIN_PIGMENTS[domain][SPECTRUM_EDITORIAL_PALETTES[paletteId].mode === "dark" ? "vivid" : "paper"];
  return {
    "--spectrum-domain-pigment": variant.ink,
    "--spectrum-domain-pigment-soft": variant.soft,
    "--spectrum-domain-pigment-border": variant.border,
    "--spectrum-domain-pigment-on": variant.onPigment,
  };
}
