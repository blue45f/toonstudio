/**
 * studio-artist-style-dna.ts
 *
 * 웹툰 작가 그림체별 모델(Style LoRA / 화풍 프로필)의 DNA 특성 추출, 멀티 화풍 블렌딩,
 * 스토리보드 전 컷 화풍 일관성 감사, 그리고 외부 BYOK 키가 없을 때도 즉시 동작하는
 * 기본 내장 화풍 프리뷰 합성 엔진.
 */

import type {
  StoryboardArtistStyleBinding,
  StoryboardDirectingResult,
} from "./studio-ai-storyboard-director";
import {
  describeStudioArtistStyleTraits,
  STUDIO_ARTIST_LINE_WEIGHT_LABELS,
  STUDIO_ARTIST_PALETTE_MOOD_LABELS,
  STUDIO_ARTIST_SHADING_MODE_LABELS,
  type StudioArtistLineWeight,
  type StudioArtistPaletteMood,
  type StudioArtistShadingMode,
} from "./studio-lora-training";

export const BUILTIN_ARTIST_STYLE_PRESETS: readonly StoryboardArtistStyleBinding[] = Object.freeze([
  {
    modelId: "preset-k-romance-fine",
    artistLabel: "K-로맨스 섬세 세필 모델",
    triggerWord: "k_romance_fine_style",
    lineWeight: "fine",
    shadingMode: "soft-gradient",
    paletteMood: "pastel",
  },
  {
    modelId: "preset-k-action-ink",
    artistLabel: "K-액션 강렬 먹선 모델",
    triggerWord: "k_action_ink_style",
    lineWeight: "bold",
    shadingMode: "cel",
    paletteMood: "vibrant",
  },
  {
    modelId: "preset-k-fantasy-cel",
    artistLabel: "K-판타지 하이엔드 셀 모델",
    triggerWord: "k_fantasy_cel_style",
    lineWeight: "balanced",
    shadingMode: "painterly",
    paletteMood: "vibrant",
  },
  {
    modelId: "preset-k-noir-thriller",
    artistLabel: "K-스릴러 느와르 해칭 모델",
    triggerWord: "k_noir_hatch_style",
    lineWeight: "brush",
    shadingMode: "hatching",
    paletteMood: "noir",
  },
]);

export interface ArtistStyleDnaPresetDescriptor {
  readonly id: string;
  readonly name: string;
  readonly promptTokens: readonly string[];
  readonly negativeTokens: readonly string[];
  readonly profile: ArtistStyleDnaProfile;
}

export function getArtistStyleDnaPreset(presetId: string): ArtistStyleDnaPresetDescriptor | undefined {
  const normalized = presetId.trim();
  if (!normalized) return undefined;
  const aliasMap: Readonly<Record<string, string>> = {
    "k-action-sharp": "preset-k-action-ink",
    "k-romance-soft": "preset-k-romance-fine",
    "k-fantasy-cel": "preset-k-fantasy-cel",
    "k-noir-thriller": "preset-k-noir-thriller",
  };
  const targetId = aliasMap[normalized] ?? normalized;
  const matched =
    BUILTIN_ARTIST_STYLE_PRESETS.find(
      (preset) => preset.modelId === targetId || preset.triggerWord === targetId,
    ) ?? BUILTIN_ARTIST_STYLE_PRESETS[0];
  if (!matched) return undefined;
  const profile = buildArtistStyleDnaProfile(matched);
  return Object.freeze({
    id: normalized,
    name: matched.artistLabel,
    promptTokens: Object.freeze(
      profile.positiveStylePrompt
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    negativeTokens: Object.freeze(
      profile.stylePreservationNegativePrompt
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ),
    profile,
  });
}


export type ArtistStrokePressureCurve =
  | "tapered-fine"
  | "uniform-clean"
  | "heavy-calligraphic"
  | "expressive-brush";

export type ArtistShadowLayering =
  | "2-tone-cel"
  | "soft-airbrush-gradient"
  | "cross-hatch-screentone"
  | "dimensional-painterly";

export interface ArtistStyleDnaProfile {
  readonly artistLabel: string;
  readonly triggerWord: string;
  readonly lineWeight: StudioArtistLineWeight;
  readonly shadingMode: StudioArtistShadingMode;
  readonly paletteMood: StudioArtistPaletteMood;
  readonly strokePressureCurve: ArtistStrokePressureCurve;
  readonly shadowLayering: ArtistShadowLayering;
  readonly colorHarmonyRule: string;
  readonly recommendedLoraScale: number;
  readonly recommendedGuidanceScale: number;
  readonly recommendedSteps: number;
  readonly positiveStylePrompt: string;
  readonly stylePreservationNegativePrompt: string;
  readonly genreCompatibility: Readonly<Record<string, number>>;
  readonly summaryKo: string;
}

const PRESSURE_CURVE_BY_LINE: Readonly<Record<StudioArtistLineWeight, ArtistStrokePressureCurve>> = {
  fine: "tapered-fine",
  balanced: "uniform-clean",
  bold: "heavy-calligraphic",
  brush: "expressive-brush",
};

const SHADOW_LAYERING_BY_SHADING: Readonly<Record<StudioArtistShadingMode, ArtistShadowLayering>> = {
  cel: "2-tone-cel",
  "soft-gradient": "soft-airbrush-gradient",
  hatching: "cross-hatch-screentone",
  painterly: "dimensional-painterly",
};

const COLOR_HARMONY_BY_MOOD: Readonly<Record<StudioArtistPaletteMood, string>> = {
  vibrant: "고채도 K-웹툰 포인트 컬러 + 피부톤 웜/쿨 명확 대비",
  pastel: "저채도 고명도 파스텔 하모니 + 역광 블룸 하이라이트",
  monochrome: "먹색 농담 5단계 + 스크린톤 밀도 대비",
  noir: "로우키 키아로스쿠로 암부 65% + 고대비 림라이트",
};

const NEGATIVE_PROMPT_BY_LINE: Readonly<Record<StudioArtistLineWeight, string>> = {
  fine: "thick muddy outlines, blotchy heavy marker strokes, roughsketch artifacts",
  balanced: "broken contours, inconsistent line thickness, blurry lineart",
  bold: "faint washed-out lines, lineless vector flat art, weak silhouette",
  brush: "rigid mechanical vector lines, uniform sterile stroke width",
};

const NEGATIVE_PROMPT_BY_MOOD: Readonly<Record<StudioArtistPaletteMood, string>> = {
  vibrant: "muddy desaturated grey wash, dull lifeless palette",
  pastel: "harsh neon oversaturation, heavy pitch-black crushed shadows",
  monochrome: "rainbow chromatic aberration, neon color bleed",
  noir: "flat bright pastel lighting, washed-out shadows",
};

/**
 * 작가 그림체 바인딩에서 선화 필압, 명암 층위, 색채 설계, 장르 적합도, 화풍 보존 네거티브 프롬프트를 포함한
 * 정밀 Artist Style DNA 프로필을 산출한다.
 */
export function buildArtistStyleDnaProfile(
  style: StoryboardArtistStyleBinding,
): ArtistStyleDnaProfile {
  const lineWeight = style.lineWeight ?? "balanced";
  const shadingMode = style.shadingMode ?? "cel";
  const paletteMood = style.paletteMood ?? "vibrant";

  const positiveStylePrompt = [
    style.triggerWord.trim(),
    `artist style (${style.artistLabel.trim()})`,
    describeStudioArtistStyleTraits({ lineWeight, shadingMode, paletteMood }),
  ]
    .filter(Boolean)
    .join(", ");

  const stylePreservationNegativePrompt = [
    NEGATIVE_PROMPT_BY_LINE[lineWeight],
    NEGATIVE_PROMPT_BY_MOOD[paletteMood],
    "style drift, inconsistent brushwork, speech bubbles, readable text, watermark",
  ].join(", ");

  const genreCompatibility: Record<string, number> = {
    판타지:
      75 +
      (paletteMood === "vibrant" ? 15 : 0) +
      (shadingMode === "painterly" || shadingMode === "cel" ? 8 : 0),
    로맨스:
      72 +
      (lineWeight === "fine" ? 18 : 0) +
      (paletteMood === "pastel" || shadingMode === "soft-gradient" ? 10 : 0),
    로판:
      74 +
      (lineWeight === "fine" ? 14 : 0) +
      (shadingMode === "soft-gradient" || shadingMode === "painterly" ? 12 : 0),
    액션:
      70 +
      (lineWeight === "bold" || lineWeight === "brush" ? 20 : 0) +
      (shadingMode === "cel" || shadingMode === "hatching" ? 10 : 0),
    스릴러:
      68 +
      (paletteMood === "noir" || paletteMood === "monochrome" ? 22 : 0) +
      (shadingMode === "hatching" ? 10 : 0),
    일상:
      76 +
      (lineWeight === "balanced" || lineWeight === "fine" ? 12 : 0) +
      (paletteMood === "pastel" || paletteMood === "vibrant" ? 10 : 0),
  };

  const recommendedLoraScale =
    lineWeight === "brush" || paletteMood === "noir" ? 0.95 : lineWeight === "fine" ? 0.85 : 0.9;
  const recommendedGuidanceScale = shadingMode === "painterly" ? 4.0 : 3.5;
  const recommendedSteps =
    shadingMode === "hatching" || shadingMode === "painterly" ? 1200 : 1000;

  return Object.freeze({
    artistLabel: style.artistLabel,
    triggerWord: style.triggerWord,
    lineWeight,
    shadingMode,
    paletteMood,
    strokePressureCurve: PRESSURE_CURVE_BY_LINE[lineWeight],
    shadowLayering: SHADOW_LAYERING_BY_SHADING[shadingMode],
    colorHarmonyRule: COLOR_HARMONY_BY_MOOD[paletteMood],
    recommendedLoraScale,
    recommendedGuidanceScale,
    recommendedSteps,
    positiveStylePrompt,
    stylePreservationNegativePrompt,
    genreCompatibility: Object.freeze(genreCompatibility),
    summaryKo: `${STUDIO_ARTIST_LINE_WEIGHT_LABELS[lineWeight]} · ${STUDIO_ARTIST_SHADING_MODE_LABELS[shadingMode]} · ${STUDIO_ARTIST_PALETTE_MOOD_LABELS[paletteMood]} (권장 가중치 ${recommendedLoraScale})`,
  });
}

export interface BlendArtistStyleOptions {
  /** 주 그림체(선화·인물 형태) 가중치 (0.1 ~ 1.2, 기본 0.75). */
  readonly primaryWeight?: number;
  /** 보조 그림체(채색·배경 무드) 가중치 (0.1 ~ 1.0, 기본 0.35). */
  readonly secondaryWeight?: number;
}

/**
 * 두 개의 작가 그림체 모델(예: 선화 작가 모델 + 채색/배경 모델)을 가중치 기반으로 블렌딩해
 * 단일 `StoryboardArtistStyleBinding`으로 합성한다.
 */
export function blendArtistStyleModels(
  primary: StoryboardArtistStyleBinding,
  secondary: StoryboardArtistStyleBinding,
  options: BlendArtistStyleOptions = {},
): StoryboardArtistStyleBinding {
  const pw = Number(Math.min(1.2, Math.max(0.1, options.primaryWeight ?? 0.75)).toFixed(2));
  const sw = Number(Math.min(1.0, Math.max(0.1, options.secondaryWeight ?? 0.35)).toFixed(2));

  const blendedTrigger = `<lora:${primary.triggerWord.trim()}:${pw}>, <lora:${secondary.triggerWord.trim()}:${sw}>`;
  return Object.freeze({
    modelId: `blend:${primary.modelId ?? primary.triggerWord}+${secondary.modelId ?? secondary.triggerWord}`,
    artistLabel: `${primary.artistLabel} × ${secondary.artistLabel} (${Math.round(pw * 100)}:${Math.round(sw * 100)})`,
    triggerWord: blendedTrigger,
    loraFileUrl: primary.loraFileUrl ?? secondary.loraFileUrl ?? null,
    lineWeight: primary.lineWeight ?? "balanced",
    shadingMode: secondary.shadingMode ?? primary.shadingMode ?? "cel",
    paletteMood: secondary.paletteMood ?? primary.paletteMood ?? "vibrant",
  });
}

export interface StoryboardStyleConsistencyAudit {
  readonly consistencyScore: number;
  readonly artistStyleBound: boolean;
  readonly triggerCoverageRatio: number;
  readonly genreMatchScore: number;
  readonly warnings: readonly string[];
  readonly cutRecommendations: readonly string[];
  readonly dnaProfile: ArtistStyleDnaProfile | null;
}

/**
 * 스토리보드 전체 컷에 작가 그림체 모델이 일관되게 적용되었는지 감사(audit)하고,
 * 화풍 흔들림(drift) 경고 및 컷별 보정 가이드를 반환한다.
 */
export function auditStoryboardStyleConsistency(
  result: StoryboardDirectingResult,
  options: { readonly genre?: string } = {},
): StoryboardStyleConsistencyAudit {
  const style = result.appliedArtistStyle ?? null;
  if (!style || result.cuts.length === 0) {
    return Object.freeze({
      consistencyScore: result.cuts.length === 0 ? 100 : 60,
      artistStyleBound: Boolean(style),
      triggerCoverageRatio: style ? 1 : 0,
      genreMatchScore: 75,
      warnings: style
        ? []
        : ["연결된 작가 그림체 모델이 없어 기본 웹툰 화풍으로만 연출되었습니다. 화풍 모델을 연결하면 컷 간 선화·채색 일관성이 높아집니다."],
      cutRecommendations: [],
      dnaProfile: style ? buildArtistStyleDnaProfile(style) : null,
    });
  }

  const dna = buildArtistStyleDnaProfile(style);
  const trigger = style.triggerWord.trim();
  const matchedCuts = result.cuts.filter((c) =>
    (c.artistStylePrompt ?? "").includes(trigger),
  ).length;
  const triggerCoverageRatio = Number((matchedCuts / result.cuts.length).toFixed(2));
  const genreKey = options.genre?.trim() || "판타지";
  const genreMatchScore = dna.genreCompatibility[genreKey] ?? 82;

  const warnings: string[] = [];
  const cutRecommendations: string[] = [];

  if (triggerCoverageRatio < 1) {
    warnings.push("일부 컷 프롬프트에 작가 그림체 트리거 워드가 누락되었습니다.");
  }

  const extremeCuts = result.cuts.filter((c) => c.shotScale === "extreme-close-up");
  if (extremeCuts.length > 0 && dna.lineWeight === "bold") {
    cutRecommendations.push(
      `굵은 외곽선(${dna.artistLabel}) 화풍에서는 익스트림 클로즈업(컷 ${extremeCuts.map((c) => c.cutNumber).join(", ")})의 눈동자·속눈썹 내부 선 두께를 한 단계 줄여야 표정이 뭉개지지 않습니다.`,
    );
  }
  if (dna.paletteMood === "noir" || dna.paletteMood === "monochrome") {
    cutRecommendations.push(
      `${STUDIO_ARTIST_PALETTE_MOOD_LABELS[dna.paletteMood]} 화풍 특성상 말풍선 테두리와 어두운 배경이 섞이지 않도록 말풍선 외곽에 밝은 여백(halo)을 확보하세요.`,
    );
  } else {
    cutRecommendations.push(
      `${dna.artistLabel} 화풍의 ${dna.colorHarmonyRule} 규칙을 전 컷 공통 컬러 스크립트로 고정하세요.`,
    );
  }

  const consistencyScore = Math.min(
    100,
    Math.round(triggerCoverageRatio * 65 + (genreMatchScore / 100) * 35),
  );

  return Object.freeze({
    consistencyScore,
    artistStyleBound: true,
    triggerCoverageRatio,
    genreMatchScore,
    warnings: Object.freeze(warnings),
    cutRecommendations: Object.freeze(cutRecommendations),
    dnaProfile: dna,
  });
}

/**
 * 외부 fal.ai BYOK 키가 없을 때도 작가의 화풍 프로필(`lineWeight`, `shadingMode`, `paletteMood`)과
 * 장면 프롬프트를 바탕으로 캔버스에 즉시 삽입 가능한 고해상도 스타일 프리뷰 SVG Data URL을 결정적으로 합성한다.
 */
export function synthesizeLocalStyleModelPreviewDataUrl(options: {
  readonly artistLabel: string;
  readonly triggerWord: string;
  readonly prompt: string;
  readonly lineWeight?: StudioArtistLineWeight;
  readonly shadingMode?: StudioArtistShadingMode;
  readonly paletteMood?: StudioArtistPaletteMood;
  readonly width?: number;
  readonly height?: number;
}): { readonly dataUrl: string; readonly width: number; readonly height: number } {
  const width = options.width ?? 832;
  const height = options.height ?? 1216;
  const mood = options.paletteMood ?? "vibrant";
  const line = options.lineWeight ?? "balanced";

  const bgGradient =
    mood === "noir"
      ? ["#0f172a", "#1e1b4b"]
      : mood === "monochrome"
        ? ["#18181b", "#52525b"]
        : mood === "pastel"
          ? ["#fdf2f8", "#e0e7ff"]
          : ["#1e1b4b", "#312e81"];
  const fgStroke = mood === "pastel" ? "#1e293b" : "#f8fafc";
  const accentStroke = mood === "noir" ? "#38bdf8" : mood === "pastel" ? "#ec4899" : "#a855f7";
  const strokeWidth = line === "bold" ? 6 : line === "brush" ? 5 : line === "fine" ? 2 : 3.5;

  const safeLabel = options.artistLabel.replace(/[<>&"']/gu, "").slice(0, 28);
  const safePrompt = options.prompt.replace(/[<>&"']/gu, "").slice(0, 44);
  const safeTrigger = options.triggerWord.replace(/[<>&"']/gu, "").slice(0, 24);

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${bgGradient[0]}"/><stop offset="100%" stop-color="${bgGradient[1]}"/></linearGradient></defs>`,
    `<rect width="${width}" height="${height}" fill="url(#bg)"/>`,
    `<line x1="60" y1="${Math.round(height * 0.68)}" x2="${width - 60}" y2="${Math.round(height * 0.42)}" stroke="${accentStroke}" stroke-width="${strokeWidth}" stroke-opacity="0.55"/>`,
    `<circle cx="${Math.round(width * 0.5)}" cy="${Math.round(height * 0.44)}" r="150" fill="none" stroke="${fgStroke}" stroke-width="${strokeWidth}"/>`,
    `<rect x="72" y="88" width="${width - 144}" height="150" rx="22" fill="none" stroke="${fgStroke}" stroke-width="2" stroke-dasharray="10 6" stroke-opacity="0.65"/>`,
    `<text x="104" y="148" fill="${fgStroke}" font-family="sans-serif" font-size="26" font-weight="bold">[${safeLabel}] (${safeTrigger})</text>`,
    `<text x="104" y="196" fill="${fgStroke}" font-family="sans-serif" font-size="22" opacity="0.88">${safePrompt}</text>`,
    `</svg>`,
  ].join("");

  const encoded =
    typeof globalThis.btoa === "function"
      ? globalThis.btoa(unescape(encodeURIComponent(svg)))
      : Buffer.from(svg, "utf8").toString("base64");

  return Object.freeze({
    dataUrl: `data:image/svg+xml;base64,${encoded}`,
    width,
    height,
  });
}
