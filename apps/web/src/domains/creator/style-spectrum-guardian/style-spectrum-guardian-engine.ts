/**
 * Wave 50A — 화풍 스펙트럼 어드바이저 · 3D→2D 안료/셀 변환 & 화풍 고정 AI 가디언 순수 결정론적 엔진.
 *
 * - 6대 대표 화풍 스펙트럼 프리셋(`STYLE_SPECTRUM_PRESETS`): 선 굵기·음영 단계(2~6단)·스크린톤 LPI·OKLCH 채도 상한·그림자 색온도 이동·브러시 레시피
 * - 원고/콘티 장르 + 대사 분위기 분석 기반 비파괴 화풍 Top-3 추천(`proposeStyleSpectrumTop3`)
 * - 3D 배경·소품 PBR 셰이더(메탈릭·러프니스·노멀·색온도) → 2D 셀 밴드·LT 선화·안료 팔레트 변환(`computeCrossMediaTransferPlan`)
 * - 외부 에셋·배경 화풍 이질감 점수(0~100) 진단 및 원클릭 통일 보정 파라미터 산출(`auditExternalAssetStyleDrift`)
 * - 비파괴 미리보기·적용·미세 조정·원복 상태 머신 + 화풍 DNA JSON 내보내기(`exportStyleGuardianJson`), 바이올렛 휴(270~320°) 0% 보장
 */

export type StyleSpectrumId =
  | "k-webtoon-cel" | "watercolor-editorial" | "monochrome-noir"
  | "ink-wash-oriental" | "painterly-impasto" | "retro-print-risograph";
export type StoryGenreId = "romance" | "action" | "thriller" | "historical" | "slice-of-life" | "fantasy";
export type ThreeDSourceMaterialPresetId = "pbr-glass-cafe" | "pbr-stone-palace" | "pbr-wet-alley" | "pbr-wooden-prop";
export type ExternalAssetPresetId = "photo-bashed-street" | "raw-3d-sketchup-room" | "ai-glossy-prop" | "assist-ink-cut";
export type SpecularTransferMode =
  | "crisp-cel-flake" | "watercolor-bloom" | "screentone-cut" | "ink-drybrush" | "impasto-dab" | "riso-overprint";
export type StyleDriftSeverity = "harmonized" | "notice" | "high-drift";
export type StyleGuardianSessionStatus = "idle" | "previewing" | "applied" | "tweaked" | "reverted";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface LineWidthRangePx { readonly min: number; readonly max: number; readonly defaultPx: number; }
export interface BrushTextureRecipe {
  readonly lineBrushKo: string; readonly lineBrushEn: string;
  readonly fillBrushKo: string; readonly fillBrushEn: string;
  readonly textureOverlayKo: string; readonly textureOverlayEn: string;
  readonly paperGrainStrength: number;
}
export interface StyleSpectrumPreset {
  readonly id: StyleSpectrumId; readonly nameKo: string; readonly nameEn: string;
  readonly taglineKo: string; readonly taglineEn: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly lineWidthRangePx: LineWidthRangePx; readonly shadingSteps: 2 | 3 | 4 | 5 | 6;
  readonly screentoneLpi: number; readonly maxChromaOklch: number; readonly shadowHueShiftDeg: number;
  readonly shadowTempNoteKo: string; readonly shadowTempNoteEn: string;
  readonly specularMode: SpecularTransferMode; readonly targetContrastRatio: number; readonly targetNoiseDensity: number;
  readonly brushRecipe: BrushTextureRecipe;
  readonly paletteSwatches: readonly [OklchColor, OklchColor, OklchColor, OklchColor];
  readonly genreAffinity: Readonly<Record<StoryGenreId, number>>;
  readonly moodKeywords: readonly string[];
}
export interface StoryGenreMeta {
  readonly id: StoryGenreId; readonly labelKo: string; readonly labelEn: string;
  readonly defaultMoodPromptKo: string; readonly defaultMoodPromptEn: string;
  readonly topAffinities: readonly StyleSpectrumId[];
}
export interface StyleProposalInput { readonly genre: StoryGenreId; readonly moodPrompt: string; }
export interface StyleSpectrumProposal {
  readonly id: string; readonly rank: 1 | 2 | 3; readonly styleId: StyleSpectrumId;
  readonly preset: StyleSpectrumPreset; readonly matchScore: number; readonly confidence: number;
  readonly reasonKo: string; readonly reasonEn: string; readonly matchedSignals: readonly string[];
  readonly requiresAuthorApproval: true;
}
export interface StyleSpectrumProposalBundle {
  readonly genre: StoryGenreId; readonly moodPrompt: string; readonly detectedSignals: readonly string[];
  readonly proposals: readonly [StyleSpectrumProposal, StyleSpectrumProposal, StyleSpectrumProposal];
}
export interface ThreeDSourcePbrInput {
  readonly id?: ThreeDSourceMaterialPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly metallic: number; readonly roughness: number; readonly normalStrength: number;
  readonly colorTempKelvin: number; readonly baseChroma: number;
}
export interface ThreeDSourcePbrPreset extends ThreeDSourcePbrInput {
  readonly id: ThreeDSourceMaterialPresetId; readonly categoryKo: string; readonly categoryEn: string;
}
export interface StyleTuningConfig {
  readonly styleId: StyleSpectrumId; readonly lineWidthPx: number; readonly shadingSteps: number;
  readonly screentoneLpi: number; readonly maxChromaOklch: number; readonly shadowHueShiftDeg: number;
  readonly paperGrainStrength: number; readonly targetContrastRatio: number;
  readonly unificationApplied: boolean; readonly unificationSourceAssetId: string | null;
}
export interface StyleTuningTweakPatch {
  readonly lineWidthPx?: number; readonly shadingSteps?: number; readonly maxChromaOklch?: number;
  readonly paperGrainStrength?: number; readonly shadowHueShiftDeg?: number;
}
export interface LtExtractionParams {
  readonly normalEdgeThreshold: number; readonly depthEdgeThreshold: number;
  readonly creaseAngleDeg: number; readonly outputLineWidthPx: number; readonly inkOklch: OklchColor;
}
export interface SpecularConversionParams {
  readonly mode: SpecularTransferMode; readonly highlightThreshold: number;
  readonly metallicClamp: number; readonly roughnessRemap: number;
  readonly modeLabelKo: string; readonly modeLabelEn: string;
}
export interface TransferPigmentPalette {
  readonly highlightOklch: OklchColor; readonly midtoneOklch: OklchColor;
  readonly shadowOklch: OklchColor; readonly lineInkOklch: OklchColor;
  readonly clampedChroma: number; readonly shadowHueShiftDeg: number;
}
export interface CrossMediaTransferPlan {
  readonly source: ThreeDSourcePbrInput; readonly targetStyleId: StyleSpectrumId;
  readonly celBands: number; readonly celRampStops: readonly number[];
  readonly ltExtraction: LtExtractionParams; readonly specularConversion: SpecularConversionParams;
  readonly pigmentPalette: TransferPigmentPalette; readonly screentoneLpi: number; readonly paperGrainOverlay: number;
  readonly beforeSeamRiskScore: number; readonly afterSeamRiskScore: number;
  readonly shaderUniforms: Readonly<Record<string, number | string>>;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface ExternalAssetStyleMetrics {
  readonly assetId?: ExternalAssetPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly lineWidthPx: number; readonly chromaOklch: number; readonly contrastRatio: number;
  readonly noiseDensity: number; readonly dominantHueDeg: number;
}
export interface ExternalAssetStylePreset extends ExternalAssetStyleMetrics {
  readonly assetId: ExternalAssetPresetId; readonly sourceKindKo: string; readonly sourceKindEn: string;
}
export interface StyleUnificationCorrection {
  readonly lineResampleScale: number; readonly targetLineWidthPx: number;
  readonly chromaMatchGain: number; readonly targetChromaOklch: number;
  readonly contrastRemapGain: number; readonly targetContrastRatio: number;
  readonly paperGrainOverlayDelta: number; readonly targetNoiseDensity: number;
  readonly safeRemappedHueDeg: number; readonly projectedDriftScore: number;
  readonly actionsKo: readonly string[]; readonly actionsEn: readonly string[];
}
export interface ExternalAssetDriftAudit {
  readonly asset: ExternalAssetStyleMetrics; readonly targetStyleId: StyleSpectrumId;
  readonly driftScore: number; readonly severity: StyleDriftSeverity;
  readonly lineWidthDeltaPx: number; readonly chromaDelta: number;
  readonly contrastDelta: number; readonly noiseDelta: number; readonly violetSlopDetected: boolean;
  readonly unificationCorrection: StyleUnificationCorrection;
  readonly warningsKo: readonly string[]; readonly warningsEn: readonly string[];
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface StyleGuardianHistoryEntry {
  readonly step: number; readonly action: "apply-style" | "apply-unification" | "tweak" | "revert";
  readonly styleId: StyleSpectrumId; readonly labelKo: string;
}
export interface StyleGuardianSession {
  readonly baselineConfig: StyleTuningConfig; readonly currentConfig: StyleTuningConfig;
  readonly previewStyleId: StyleSpectrumId | null; readonly previewConfig: StyleTuningConfig | null;
  readonly appliedStyleId: StyleSpectrumId | null; readonly status: StyleGuardianSessionStatus;
  readonly isTweaked: boolean; readonly canRevert: boolean;
  readonly history: readonly StyleGuardianHistoryEntry[];
}

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;

function round2(n: number): number { return Math.round(n * 100) / 100; }
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function clamp(n: number, min: number, max: number): number { return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function clamp01(n: number): number { return round2(clamp(n, 0, 1)); }
function normalizeHue(deg: number): number { return Number.isFinite(deg) ? Math.round(((deg % 360) + 360) % 360) : 44; }

/** 270~320도 바이올렛 편향 구간 여부를 판별한다. */
export function isVioletSlopHue(hueDeg: number): boolean {
  const h = normalizeHue(hueDeg);
  return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE;
}

/** 바이올렛 구간(270~320°)으로 진입한 휴를 코발트(252°) 또는 연지(342°)로 교정한다. */
export function sanitizeNonVioletHue(hueDeg: number): number {
  const h = normalizeHue(hueDeg);
  return h >= VIOLET_SLOP_MIN_HUE && h <= VIOLET_SLOP_MAX_HUE ? (h < 295 ? 252 : 342) : h;
}

/** 기준 휴에 그림자 색온도 이동을 적용하면서 바이올렛 구간 진입을 차단한다. */
export function shiftHueSafe(baseHueDeg: number, shiftDeg: number): number {
  return sanitizeNonVioletHue(normalizeHue(baseHueDeg + (Number.isFinite(shiftDeg) ? shiftDeg : 0)));
}

/** OKLCH 색상을 CSS·SVG 표준 문자열로 직렬화한다. */
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = clamp01(color.l);
  const c = round2(clamp(color.c, 0, 0.32));
  const h = sanitizeNonVioletHue(color.h);
  if (typeof alpha === "number" && Number.isFinite(alpha)) {
    return `oklch(${l.toFixed(2)} ${c.toFixed(2)} ${h} / ${clamp01(alpha).toFixed(2)})`;
  }
  return `oklch(${l.toFixed(2)} ${c.toFixed(2)} ${h})`;
}

/** 3D 씬 색온도(2400K~9000K)를 탈-바이올렛 OKLCH 안료 기조색으로 환산한다. */
export function kelvinToSafeOklch(kelvin: number, maxChroma = 0.16): OklchColor {
  const k = clamp(kelvin, 2400, 9000);
  const cap = clamp(maxChroma, 0.01, 0.28);
  if (k < 3800) {
    const t = (k - 2400) / 1400;
    return { l: round2(0.74 + t * 0.06), c: round2(Math.min(cap, 0.15 - t * 0.03)), h: sanitizeNonVioletHue(42 + t * 24) };
  }
  if (k <= 5600) {
    const t = (k - 3800) / 1800;
    return { l: round2(0.8 + t * 0.05), c: round2(Math.min(cap, 0.09 - t * 0.04)), h: sanitizeNonVioletHue(74 + t * 28) };
  }
  const t = (k - 5600) / 3400;
  return { l: round2(0.79 - t * 0.09), c: round2(Math.min(cap, 0.07 + t * 0.07)), h: sanitizeNonVioletHue(214 + t * 32) };
}

const DEFAULT_STYLE_PRESET: StyleSpectrumPreset = {
  id: "k-webtoon-cel", nameKo: "K-웹툰 깔끔 셀 채색", nameEn: "K-Webtoon Crisp Cel",
  taglineKo: "명쾌한 G펜 외곽선 · 3단 셀 명암", taglineEn: "Clean G-Pen lineart & 3-band cel shading",
  summaryKo: "스크롤 가독성과 주간 연재 속도를 모두 챙기는 표준 K-웹툰 셀 채색 화풍입니다.",
  summaryEn: "Clean serial webtoon cel look built for crisp mobile scroll readability and speed.",
  lineWidthRangePx: { min: 1.1, max: 2.4, defaultPx: 1.6 }, shadingSteps: 3, screentoneLpi: 0,
  maxChromaOklch: 0.19, shadowHueShiftDeg: -18,
  shadowTempNoteKo: "난색 광원 대비 청회 한색 이동(-18°)", shadowTempNoteEn: "Cool cerulean shift (-18°) against warm key",
  specularMode: "crisp-cel-flake", targetContrastRatio: 4.4, targetNoiseDensity: 0.08,
  brushRecipe: {
    lineBrushKo: "탄성 G펜 (1.6px · 필압 끝빼기)", lineBrushEn: "Elastic G-Pen (1.6px tapered)",
    fillBrushKo: "하드 라운드 셀 채우기 + 소프트 그라데이션", fillBrushEn: "Hard Cel Fill + Soft Airbrush Gradient",
    textureOverlayKo: "미세 스튜디오 필름 그레인 8%", textureOverlayEn: "Subtle Studio Film Grain 8%", paperGrainStrength: 0.08,
  },
  paletteSwatches: [{ l: 0.97, c: 0.01, h: 92 }, { l: 0.74, c: 0.16, h: 44 }, { l: 0.46, c: 0.11, h: 238 }, { l: 0.2, c: 0.02, h: 245 }],
  genreAffinity: { romance: 0.88, action: 0.96, thriller: 0.68, historical: 0.64, "slice-of-life": 0.82, fantasy: 0.86 },
  moodKeywords: ["깔끔", "연재", "타격", "속도", "명쾌", "화려", "주간", "전투", "스피드", "선명", "crisp", "action", "cel", "clean"],
};

export const STYLE_SPECTRUM_PRESETS: readonly StyleSpectrumPreset[] = [
  DEFAULT_STYLE_PRESET,
  {
    id: "watercolor-editorial", nameKo: "투명 수채 에디토리얼", nameEn: "Watercolor Editorial",
    taglineKo: "세피아 세선 · 4단 투명 번짐", taglineEn: "Fine sepia ink & 4-band transparent wash",
    summaryKo: "종이결 위로 맑은 수채 안료가 스미는 감성 드라마·로맨스 지향 화풍입니다.",
    summaryEn: "Translucent watercolor wash over cold-press paper tailored for lyrical romance and drama.",
    lineWidthRangePx: { min: 0.7, max: 1.8, defaultPx: 1.1 }, shadingSteps: 4, screentoneLpi: 0,
    maxChromaOklch: 0.13, shadowHueShiftDeg: -22,
    shadowTempNoteKo: "담청록·울트라마린 투명 그림자(-22°)", shadowTempNoteEn: "Translucent ultramarine shadow cooling (-22°)",
    specularMode: "watercolor-bloom", targetContrastRatio: 3.3, targetNoiseDensity: 0.34,
    brushRecipe: {
      lineBrushKo: "세피아 만년필 세선 (1.1px · 미약 번짐)", lineBrushEn: "Sepia Fountain Nib (1.1px soft bleed)",
      fillBrushKo: "투명 평붓 수채 워시 + 물자국 엣지", fillBrushEn: "Transparent Flat Wash + Wet Edge Bloom",
      textureOverlayKo: "콜드프레스 300g 수채지 34%", textureOverlayEn: "Cold-Press 300g Paper Grain 34%", paperGrainStrength: 0.34,
    },
    paletteSwatches: [{ l: 0.96, c: 0.015, h: 84 }, { l: 0.72, c: 0.11, h: 172 }, { l: 0.5, c: 0.09, h: 228 }, { l: 0.32, c: 0.04, h: 52 }],
    genreAffinity: { romance: 0.97, action: 0.42, thriller: 0.48, historical: 0.76, "slice-of-life": 0.92, fantasy: 0.78 },
    moodKeywords: ["수채", "투명", "감성", "여운", "잔잔", "따뜻", "노을", "고백", "봄빛", "설렘", "서정", "watercolor", "soft", "warm", "lyrical"],
  },
  {
    id: "monochrome-noir", nameKo: "흑백 스크린톤 느와르", nameEn: "Monochrome Screentone Noir",
    taglineKo: "강렬한 먹 베타 · 65 LPI 망점", taglineEn: "Bold black fills & 65 LPI halftone screentone",
    summaryKo: "채도를 극한까지 덜어내고 2단 고대비 먹과 65 LPI 스크린톤으로 압박감을 세우는 느와르 화풍입니다.",
    summaryEn: "High-contrast 2-step ink and 65 LPI halftone screentones engineered for tense noir storytelling.",
    lineWidthRangePx: { min: 1.4, max: 3.8, defaultPx: 2.4 }, shadingSteps: 2, screentoneLpi: 65,
    maxChromaOklch: 0.02, shadowHueShiftDeg: 0,
    shadowTempNoteKo: "무채색 청먹 기준 유지(0° · 채도 0.02 상한)", shadowTempNoteEn: "Achromatic blue-black ink lock (0°, chroma <= 0.02)",
    specularMode: "screentone-cut", targetContrastRatio: 7.4, targetNoiseDensity: 0.42,
    brushRecipe: {
      lineBrushKo: "거친 마루펜 + 먹붓 베타 (2.4px)", lineBrushEn: "Gritty Maru Pen + Solid Ink Brush (2.4px)",
      fillBrushKo: "65 LPI 45° 도트 스크린톤 깎기", fillBrushEn: "65 LPI 45° Dot Screentone Scrape",
      textureOverlayKo: "코믹 원고지 도트 망점 42%", textureOverlayEn: "Comic Manuscript Halftone Overlay 42%", paperGrainStrength: 0.42,
    },
    paletteSwatches: [{ l: 0.95, c: 0.005, h: 95 }, { l: 0.56, c: 0.01, h: 235 }, { l: 0.22, c: 0.012, h: 240 }, { l: 0.14, c: 0.008, h: 240 }],
    genreAffinity: { romance: 0.32, action: 0.84, thriller: 0.98, historical: 0.62, "slice-of-life": 0.36, fantasy: 0.52 },
    moodKeywords: ["흑백", "느와르", "범죄", "추격", "그림자", "어둠", "비명", "긴장", "공포", "스릴", "망점", "noir", "shadow", "dark", "crime"],
  },
  {
    id: "ink-wash-oriental", nameKo: "동양화 먹선·담채", nameEn: "Oriental Ink-Wash",
    taglineKo: "강약 갈필 먹선 · 한지 여백 담채", taglineEn: "Dynamic dry-brush ink & mineral wash on hanji",
    summaryKo: "필압에 따라 갈라지는 먹선과 송록·황토 담채, 한지 여백으로 기품을 살리는 사극·무협 화풍입니다.",
    summaryEn: "Expressive calligraphic ink strokes paired with restrained mineral washes on textured hanji.",
    lineWidthRangePx: { min: 0.8, max: 4.2, defaultPx: 2.1 }, shadingSteps: 4, screentoneLpi: 0,
    maxChromaOklch: 0.11, shadowHueShiftDeg: -14,
    shadowTempNoteKo: "송연묵·청묵 방향 묵조 이동(-14°)", shadowTempNoteEn: "Pine-soot blue-ink shadow shift (-14°)",
    specularMode: "ink-drybrush", targetContrastRatio: 5.1, targetNoiseDensity: 0.46,
    brushRecipe: {
      lineBrushKo: "겸호필 갈필 먹붓 (0.8~4.2px 강약)", lineBrushEn: "Calligraphy Dry-Ink Brush (0.8-4.2px)",
      fillBrushKo: "삼묵법 농담 번짐 + 석채 담채", fillBrushEn: "Three-Tone Ink Bleed + Mineral Tint",
      textureOverlayKo: "순지 한지 섬유질 46%", textureOverlayEn: "Mulberry Hanji Fiber Texture 46%", paperGrainStrength: 0.46,
    },
    paletteSwatches: [{ l: 0.94, c: 0.022, h: 86 }, { l: 0.62, c: 0.09, h: 158 }, { l: 0.36, c: 0.05, h: 218 }, { l: 0.17, c: 0.015, h: 72 }],
    genreAffinity: { romance: 0.62, action: 0.78, thriller: 0.66, historical: 0.99, "slice-of-life": 0.48, fantasy: 0.84 },
    moodKeywords: ["사극", "한복", "궁궐", "먹선", "검객", "무협", "동양", "여백", "산수", "운무", "수묵", "ink", "hanji", "oriental", "sword"],
  },
  {
    id: "painterly-impasto", nameKo: "반실사 유화 붓터치", nameEn: "Painterly Impasto",
    taglineKo: "선화 융합 · 6단 중후한 안료 터치", taglineEn: "Blended line edges & 6-step rich impasto brushwork",
    summaryKo: "외곽선을 안료에 녹이고 6단 빛·그림자 계조와 붓결을 쌓아 올리는 하이판타지·서사 화풍입니다.",
    summaryEn: "Semi-realistic 6-band painterly rendering with tactile oil brushwork for grand fantasy narratives.",
    lineWidthRangePx: { min: 0.5, max: 1.6, defaultPx: 0.9 }, shadingSteps: 6, screentoneLpi: 0,
    maxChromaOklch: 0.17, shadowHueShiftDeg: -26,
    shadowTempNoteKo: "황토·버밀리온 광원 대비 프러시안 한색 그림자(-26°)", shadowTempNoteEn: "Prussian cool shadow shift (-26°) vs warm ochre key",
    specularMode: "impasto-dab", targetContrastRatio: 5.8, targetNoiseDensity: 0.3,
    brushRecipe: {
      lineBrushKo: "번트 엄버 소프트 색선 (0.9px)", lineBrushEn: "Burnt Umber Soft Colored Line (0.9px)",
      fillBrushKo: "임파스토 팔레트 나이프 + 평붓 블렌더", fillBrushEn: "Impasto Palette Knife + Bristle Blender",
      textureOverlayKo: "아마포 리넨 캔버스 직조 30%", textureOverlayEn: "Woven Linen Canvas Grain 30%", paperGrainStrength: 0.3,
    },
    paletteSwatches: [{ l: 0.91, c: 0.025, h: 78 }, { l: 0.65, c: 0.15, h: 38 }, { l: 0.34, c: 0.1, h: 234 }, { l: 0.24, c: 0.04, h: 42 }],
    genreAffinity: { romance: 0.72, action: 0.82, thriller: 0.74, historical: 0.85, "slice-of-life": 0.38, fantasy: 0.98 },
    moodKeywords: ["유화", "판타지", "중세", "성채", "마법", "웅장", "서사", "반실사", "유적", "용", "붓터치", "oil", "impasto", "epic", "fantasy"],
  },
  {
    id: "retro-print-risograph", nameKo: "리소그래프 출판 판화", nameEn: "Retro Risograph Print",
    taglineKo: "2도 별색 겹침 · 45 LPI 갱지 망점", taglineEn: "Two-spot overprint & 45 LPI newsprint grain",
    summaryKo: "주홍·청남 별색 잉크 어긋남과 45 LPI 판화 망점으로 독립 출판 감각을 살리는 일상·개성 화풍입니다.",
    summaryEn: "Tactile vermilion and indigo overprint with 45 LPI risograph texture for indie and slice-of-life comics.",
    lineWidthRangePx: { min: 1.2, max: 2.8, defaultPx: 1.9 }, shadingSteps: 3, screentoneLpi: 45,
    maxChromaOklch: 0.21, shadowHueShiftDeg: 24,
    shadowTempNoteKo: "주홍 하이라이트 → 청남 별색 오버프린트(+24° 보정)", shadowTempNoteEn: "Spot vermilion to indigo overprint offset (+24°)",
    specularMode: "riso-overprint", targetContrastRatio: 4.8, targetNoiseDensity: 0.54,
    brushRecipe: {
      lineBrushKo: "인디고 연필·목판 잉크선 (1.9px)", lineBrushEn: "Indigo Pencil-Woodblock Ink (1.9px)",
      fillBrushKo: "45 LPI 리소 별색 2도 오버프린트", fillBrushEn: "45 LPI 2-Spot Risograph Overprint",
      textureOverlayKo: "미색 갱지 잉크 번짐·판화 노이즈 54%", textureOverlayEn: "Cream Newsprint Ink Grain 54%", paperGrainStrength: 0.54,
    },
    paletteSwatches: [{ l: 0.95, c: 0.028, h: 88 }, { l: 0.64, c: 0.19, h: 26 }, { l: 0.44, c: 0.14, h: 216 }, { l: 0.22, c: 0.07, h: 224 }],
    genreAffinity: { romance: 0.74, action: 0.54, thriller: 0.58, historical: 0.46, "slice-of-life": 0.98, fantasy: 0.6 },
    moodKeywords: ["복고", "레트로", "인쇄", "판화", "청춘", "일상", "카페", "다이어리", "유쾌", "개성", "독립출판", "retro", "riso", "print", "indie"],
  },
];

const DEFAULT_GENRE_META: StoryGenreMeta = {
  id: "romance", labelKo: "로맨스", labelEn: "Romance",
  defaultMoodPromptKo: "노을빛 창가에서 건네는 조용한 고백, 투명한 수채 감성과 따뜻한 여운",
  defaultMoodPromptEn: "Quiet sunset confession by the window with warm translucent watercolor mood",
  topAffinities: ["watercolor-editorial", "k-webtoon-cel", "retro-print-risograph"],
};

export const STORY_GENRE_PRESETS: readonly StoryGenreMeta[] = [
  DEFAULT_GENRE_META,
  { id: "action", labelKo: "액션", labelEn: "Action", defaultMoodPromptKo: "도심 옥상 고속 추격과 타격감!! 선명한 외곽선과 빠른 스크롤 속도감", defaultMoodPromptEn: "High-speed rooftop brawl!! Crisp lineart and kinetic cel impact", topAffinities: ["k-webtoon-cel", "monochrome-noir", "painterly-impasto"] },
  { id: "thriller", labelKo: "스릴러", labelEn: "Thriller", defaultMoodPromptKo: "비 내리는 골목 그림자 속 발소리... 흑백 느와르 대비와 숨 막히는 긴장감", defaultMoodPromptEn: "Footsteps in a rain-slick dark alley... stark noir shadow and crime tension", topAffinities: ["monochrome-noir", "painterly-impasto", "k-webtoon-cel"] },
  { id: "historical", labelKo: "사극", labelEn: "Historical", defaultMoodPromptKo: "안개 낀 궁궐 마당을 가르는 검객의 한복 자락, 갈필 먹선과 한지 여백", defaultMoodPromptEn: "Swordsman in misty palace courtyard, expressive dry-brush ink on hanji", topAffinities: ["ink-wash-oriental", "painterly-impasto", "watercolor-editorial"] },
  { id: "slice-of-life", labelKo: "일상", labelEn: "Slice of Life", defaultMoodPromptKo: "동네 카페 다이어리와 소소한 청춘 이야기~ 복고 인쇄 질감과 유쾌한 개성", defaultMoodPromptEn: "Neighborhood cafe diary and witty daily moments~ indie retro print charm", topAffinities: ["retro-print-risograph", "watercolor-editorial", "k-webtoon-cel"] },
  { id: "fantasy", labelKo: "판타지", labelEn: "Fantasy", defaultMoodPromptKo: "고대 성채 유적 위로 깨어나는 마법 서사, 중후한 반실사 유화 붓터치와 웅장한 빛", defaultMoodPromptEn: "Ancient citadel ruins awakening in epic painterly oil brushwork and grand light", topAffinities: ["painterly-impasto", "k-webtoon-cel", "ink-wash-oriental"] },
];

const DEFAULT_THREE_D_PRESET: ThreeDSourcePbrPreset = {
  id: "pbr-glass-cafe", labelKo: "3D 유리·금속 카페 배경", labelEn: "3D Glass & Metal Cafe",
  categoryKo: "현대 실내 · 고광택 PBR", categoryEn: "Modern Interior · Glossy PBR",
  metallic: 0.72, roughness: 0.18, normalStrength: 0.85, colorTempKelvin: 5600, baseChroma: 0.16,
};

export const THREE_D_SOURCE_PRESETS: readonly ThreeDSourcePbrPreset[] = [
  DEFAULT_THREE_D_PRESET,
  { id: "pbr-stone-palace", labelKo: "3D 석조 궁궐·고건축", labelEn: "3D Stone Palace Architecture", categoryKo: "사극·판타지 · 고디테일 노멀", categoryEn: "Historical/Fantasy · High Normal", metallic: 0.12, roughness: 0.78, normalStrength: 1.35, colorTempKelvin: 4200, baseChroma: 0.11 },
  { id: "pbr-wet-alley", labelKo: "3D 비 젖은 뒷골목", labelEn: "3D Rain-Slick Alley", categoryKo: "스릴러·야경 · 습윤 반사", categoryEn: "Thriller Night · Wet Specular", metallic: 0.35, roughness: 0.24, normalStrength: 1.15, colorTempKelvin: 7200, baseChroma: 0.14 },
  { id: "pbr-wooden-prop", labelKo: "3D 원목 가구·소품", labelEn: "3D Timber Furniture Prop", categoryKo: "일상·로맨스 · 매트 원목", categoryEn: "Slice-of-Life · Matte Wood", metallic: 0.08, roughness: 0.62, normalStrength: 0.92, colorTempKelvin: 3600, baseChroma: 0.14 },
];

const DEFAULT_EXTERNAL_ASSET_PRESET: ExternalAssetStylePreset = {
  assetId: "photo-bashed-street", labelKo: "실사 포토배싱 거리 배경", labelEn: "Photobashed Street Backdrop",
  sourceKindKo: "외부 사진 보정 배경", sourceKindEn: "External Photo Backdrop",
  lineWidthPx: 0.4, chromaOklch: 0.25, contrastRatio: 8.2, noiseDensity: 0.64, dominantHueDeg: 212,
};

export const EXTERNAL_ASSET_PRESETS: readonly ExternalAssetStylePreset[] = [
  DEFAULT_EXTERNAL_ASSET_PRESET,
  { assetId: "raw-3d-sketchup-room", labelKo: "무보정 3D 스케치업 교실", labelEn: "Raw 3D SketchUp Classroom", sourceKindKo: "기본 3D 렌더링 배경", sourceKindEn: "Unstyled 3D Render", lineWidthPx: 0.5, chromaOklch: 0.22, contrastRatio: 2.1, noiseDensity: 0.03, dominantHueDeg: 68 },
  { assetId: "ai-glossy-prop", labelKo: "외부 AI 고채도 소품", labelEn: "External AI Glossy Prop", sourceKindKo: "타 스타일 생성 에셋(보라 편향 포함)", sourceKindEn: "Mismatched AI Prop (Violet Drift)", lineWidthPx: 0.75, chromaOklch: 0.29, contrastRatio: 7.4, noiseDensity: 0.48, dominantHueDeg: 292 },
  { assetId: "assist-ink-cut", labelKo: "어시스턴트 선화 배경 컷", labelEn: "Assistant Inked Cut", sourceKindKo: "동일 작품 보조 작화", sourceKindEn: "In-House Assistant Cut", lineWidthPx: 1.7, chromaOklch: 0.16, contrastRatio: 4.5, noiseDensity: 0.12, dominantHueDeg: 46 },
];

const SPECULAR_MODE_LABELS: Readonly<Record<SpecularTransferMode, { readonly ko: string; readonly en: string }>> = {
  "crisp-cel-flake": { ko: "하드 엣지 셀 하이라이트 컷", en: "Crisp Cel Highlight Cut" },
  "watercolor-bloom": { ko: "종이 여백 남김 + 수채 번짐", en: "Paper-Reserve Watercolor Bloom" },
  "screentone-cut": { ko: "화이트 스크래치 + 65 LPI 망점 분리", en: "White Scrape + 65 LPI Cut" },
  "ink-drybrush": { ko: "비백(갈필) 하이라이트 변환", en: "Dry-Brush Negative Space" },
  "impasto-dab": { ko: "유화 나이프 붓터치 점찍기", en: "Impasto Knife Highlight Dab" },
  "riso-overprint": { ko: "별색 판 어긋남 하이라이트", en: "Offset Spot-Ink Highlight" },
};

export function getStyleSpectrumPreset(id: StyleSpectrumId): StyleSpectrumPreset {
  return STYLE_SPECTRUM_PRESETS.find((item) => item.id === id) ?? DEFAULT_STYLE_PRESET;
}
export function getStoryGenreMeta(id: StoryGenreId): StoryGenreMeta {
  return STORY_GENRE_PRESETS.find((item) => item.id === id) ?? DEFAULT_GENRE_META;
}
export function getThreeDSourcePreset(id: ThreeDSourceMaterialPresetId): ThreeDSourcePbrPreset {
  return THREE_D_SOURCE_PRESETS.find((item) => item.id === id) ?? DEFAULT_THREE_D_PRESET;
}
export function getExternalAssetPreset(id: ExternalAssetPresetId): ExternalAssetStylePreset {
  return EXTERNAL_ASSET_PRESETS.find((item) => item.assetId === id) ?? DEFAULT_EXTERNAL_ASSET_PRESET;
}

/** 화풍 프리셋으로부터 기본 튜닝 설정 객체를 생성한다. */
export function createConfigFromStylePreset(id: StyleSpectrumId): StyleTuningConfig {
  const preset = getStyleSpectrumPreset(id);
  return {
    styleId: preset.id, lineWidthPx: preset.lineWidthRangePx.defaultPx, shadingSteps: preset.shadingSteps,
    screentoneLpi: preset.screentoneLpi, maxChromaOklch: preset.maxChromaOklch,
    shadowHueShiftDeg: preset.shadowHueShiftDeg, paperGrainStrength: preset.brushRecipe.paperGrainStrength,
    targetContrastRatio: preset.targetContrastRatio, unificationApplied: false, unificationSourceAssetId: null,
  };
}

function resolveTuningConfig(configOrStyleId: StyleTuningConfig | StyleSpectrumId): StyleTuningConfig {
  if (typeof configOrStyleId === "string") return createConfigFromStylePreset(configOrStyleId);

  const defaults = createConfigFromStylePreset(configOrStyleId.styleId);
  const finiteOr = (value: number, fallback: number): number => Number.isFinite(value) ? value : fallback;
  return {
    ...configOrStyleId,
    styleId: defaults.styleId,
    lineWidthPx: finiteOr(configOrStyleId.lineWidthPx, defaults.lineWidthPx),
    shadingSteps: finiteOr(configOrStyleId.shadingSteps, defaults.shadingSteps),
    screentoneLpi: finiteOr(configOrStyleId.screentoneLpi, defaults.screentoneLpi),
    maxChromaOklch: finiteOr(configOrStyleId.maxChromaOklch, defaults.maxChromaOklch),
    shadowHueShiftDeg: finiteOr(configOrStyleId.shadowHueShiftDeg, defaults.shadowHueShiftDeg),
    paperGrainStrength: finiteOr(configOrStyleId.paperGrainStrength, defaults.paperGrainStrength),
    targetContrastRatio: finiteOr(configOrStyleId.targetContrastRatio, defaults.targetContrastRatio),
  };
}

/** 원고 장르와 대사/콘티 분위기를 분석해 가장 어울리는 화풍 Top-3와 이유를 비파괴 제안한다. */
export function proposeStyleSpectrumTop3(input: StyleProposalInput): StyleSpectrumProposalBundle {
  const genreMeta = getStoryGenreMeta(input.genre);
  const moodPrompt = input.moodPrompt.trim();
  const lower = moodPrompt.toLowerCase();
  const globalSignals: string[] = [`장르:${genreMeta.labelKo}`];
  const hasExclaimBurst = /!{2,}/u.test(moodPrompt);
  const hasEllipsis = /(?:\.{2,}|…)/u.test(moodPrompt);
  const hasTilde = moodPrompt.includes("~");

  if (hasExclaimBurst) globalSignals.push("호흡:강조감탄(!!)");
  if (hasEllipsis) globalSignals.push("호흡:여운·말줄임(...)");
  if (hasTilde) globalSignals.push("호흡:경쾌한 물결(~)");

  const scored = STYLE_SPECTRUM_PRESETS.map((preset) => {
    let score = preset.genreAffinity[genreMeta.id] * 68;
    const matchedSignals: string[] = [];
    const boostIdx = genreMeta.topAffinities.indexOf(preset.id);
    if (boostIdx === 0) score += 9;
    else if (boostIdx === 1) score += 5;
    else if (boostIdx === 2) score += 2;

    for (const kw of preset.moodKeywords) {
      if (lower.includes(kw)) {
        score += kw.length >= 3 ? 11.5 : 8.5;
        if (matchedSignals.length < 4) matchedSignals.push(kw);
        if (globalSignals.length < 7 && !globalSignals.includes(`분위기:${kw}`)) globalSignals.push(`분위기:${kw}`);
      }
    }
    if (hasExclaimBurst && (preset.id === "k-webtoon-cel" || preset.id === "monochrome-noir")) score += 5;
    if (hasEllipsis && (preset.id === "watercolor-editorial" || preset.id === "ink-wash-oriental" || preset.id === "monochrome-noir")) score += 4.5;
    if (hasTilde && (preset.id === "retro-print-risograph" || preset.id === "watercolor-editorial")) score += 4.5;
    return { preset, rawScore: score, matchedSignals };
  }).sort((a, b) => b.rawScore - a.rawScore);

  const top3Raw = scored.slice(0, 3);
  const maxRaw = Math.max(top3Raw[0]?.rawScore ?? 1, 75);

  const buildProposal = (item: (typeof top3Raw)[number] | undefined, rank: 1 | 2 | 3): StyleSpectrumProposal => {
    const { preset, rawScore, matchedSignals } = item ?? { preset: DEFAULT_STYLE_PRESET, rawScore: 68, matchedSignals: [] };
    const matchScore = Math.round(clamp((rawScore / maxRaw) * 96 - (rank - 1) * 3, 52, 99));
    const sigKo = matchedSignals.length > 0 ? `키워드(${matchedSignals.slice(0, 3).join("·")})와 ` : "";
    const sigEn = matchedSignals.length > 0 ? `signals (${matchedSignals.slice(0, 3).join(", ")}) and ` : "";
    const toneKo = preset.screentoneLpi > 0 ? `${preset.screentoneLpi} LPI 스크린톤·${preset.shadingSteps}단 명암` : `${preset.shadingSteps}단 음영·선 ${preset.lineWidthRangePx.defaultPx.toFixed(1)}px`;
    const toneEn = preset.screentoneLpi > 0 ? `${preset.screentoneLpi} LPI halftone & ${preset.shadingSteps}-band ink` : `${preset.shadingSteps}-band shading & ${preset.lineWidthRangePx.defaultPx.toFixed(1)}px line`;

    return {
      id: `style-proposal-${rank}-${genreMeta.id}-${preset.id}`, rank, styleId: preset.id, preset,
      matchScore, confidence: clamp01(matchScore / 100), matchedSignals, requiresAuthorApproval: true,
      reasonKo: `${genreMeta.labelKo} 원고의 ${sigKo}호흡에 맞춰 ${toneKo}, OKLCH 채도 상한 ${preset.maxChromaOklch.toFixed(2)}로 컷 밀도를 정돈합니다.`,
      reasonEn: `Fits ${genreMeta.labelEn} scenes via ${sigEn}${toneEn} with an OKLCH chroma ceiling of ${preset.maxChromaOklch.toFixed(2)}.`,
    };
  };

  return {
    genre: genreMeta.id, moodPrompt, detectedSignals: globalSignals,
    proposals: [buildProposal(top3Raw[0], 1), buildProposal(top3Raw[1], 2), buildProposal(top3Raw[2], 3)],
  };
}

/** 3D 배경·소품 PBR 셰이더 파라미터를 현재 2D 웹툰 화풍의 셀 밴드·LT 선화·안료 팔레트로 변환한다. */
export function computeCrossMediaTransferPlan(
  sourceInput: ThreeDSourcePbrInput,
  configOrStyleId: StyleTuningConfig | StyleSpectrumId,
): CrossMediaTransferPlan {
  const config = resolveTuningConfig(configOrStyleId);
  const preset = getStyleSpectrumPreset(config.styleId);
  const metallic = clamp01(sourceInput.metallic);
  const roughness = clamp01(sourceInput.roughness);
  const normalStrength = round2(clamp(sourceInput.normalStrength, 0.1, 2.0));
  const colorTempKelvin = Math.round(clamp(sourceInput.colorTempKelvin, 2400, 9000));
  const baseChroma = round2(clamp(sourceInput.baseChroma, 0, 0.32));
  const normalizedSource: ThreeDSourcePbrInput = { ...sourceInput, metallic, roughness, normalStrength, colorTempKelvin, baseChroma };

  const celBands = Math.round(clamp(config.shadingSteps, 2, 6));
  const celRampStops = Array.from({ length: celBands - 1 }, (_, i) =>
    round2(clamp((i + 1) / celBands + (roughness - 0.5) * 0.08, 0.08, 0.94)),
  );
  const normalEdgeThreshold = round3(clamp(0.18 + normalStrength * 0.16 + (preset.id === "painterly-impasto" ? 0.14 : 0), 0.14, 0.72));
  const depthEdgeThreshold = round3(clamp(0.012 + (1 - roughness) * 0.01 + (preset.id === "monochrome-noir" ? -0.004 : 0), 0.006, 0.045));
  const creaseAngleDeg = Math.round(clamp(28 + normalStrength * 14 - (preset.id === "monochrome-noir" ? 8 : 0), 18, 65));
  const outputLineWidthPx = round2(clamp(config.lineWidthPx, preset.lineWidthRangePx.min * 0.8, preset.lineWidthRangePx.max * 1.2));

  const metallicClamp = round2(preset.id === "k-webtoon-cel" || preset.id === "monochrome-noir" ? Math.min(0.28, metallic * 0.35) : Math.min(0.18, metallic * 0.22));
  const highlightThreshold = round2(clamp(0.86 - metallic * 0.16 + roughness * 0.1, 0.58, 0.95));
  const roughnessRemap = round2(clamp(roughness * 0.65 + 0.3, 0.32, 0.96));

  const clampedChroma = round2(Math.min(baseChroma, config.maxChromaOklch));
  const tempBase = kelvinToSafeOklch(colorTempKelvin, config.maxChromaOklch);
  const blendedHue = sanitizeNonVioletHue(
    preset.id === "monochrome-noir" ? preset.paletteSwatches[2].h : Math.round(tempBase.h * 0.55 + preset.paletteSwatches[1].h * 0.45),
  );

  const highlightOklch: OklchColor = { l: round2(clamp(0.86 + (1 - roughness) * 0.07, 0.82, 0.95)), c: round2(Math.min(clampedChroma * 0.55, config.maxChromaOklch)), h: blendedHue };
  const midtoneOklch: OklchColor = { l: round2(clamp(0.66 - metallic * 0.06, 0.48, 0.78)), c: clampedChroma, h: blendedHue };
  const shadowOklch: OklchColor = { l: round2(clamp(0.38 - (preset.targetContrastRatio - 4) * 0.03, 0.18, 0.52)), c: round2(Math.min(clampedChroma * 0.85, config.maxChromaOklch)), h: shiftHueSafe(blendedHue, config.shadowHueShiftDeg) };
  const lineInkOklch: OklchColor = { l: preset.paletteSwatches[3].l, c: round2(Math.min(preset.paletteSwatches[3].c, config.maxChromaOklch)), h: sanitizeNonVioletHue(preset.paletteSwatches[3].h) };

  const beforeSeamRiskScore = Math.round(clamp(26 + metallic * 34 + (1 - roughness) * 20 + Math.max(0, baseChroma - config.maxChromaOklch) * 140 + Math.abs(normalStrength - 0.85) * 18, 24, 96));
  const afterSeamRiskScore = Math.round(clamp(beforeSeamRiskScore * 0.22 - (config.unificationApplied ? 4 : 0), 5, Math.max(8, beforeSeamRiskScore - 18)));
  const modeLabel = SPECULAR_MODE_LABELS[preset.specularMode];

  const shaderUniforms: Readonly<Record<string, number | string>> = {
    uCelBands: celBands, uNormalEdgeThreshold: normalEdgeThreshold, uDepthEdgeThreshold: depthEdgeThreshold,
    uCreaseAngleDeg: creaseAngleDeg, uLineWidthPx: outputLineWidthPx, uMetallicClamp: metallicClamp,
    uRoughnessRemap: roughnessRemap, uHighlightThreshold: highlightThreshold, uMaxChromaOklch: config.maxChromaOklch,
    uShadowHueShiftDeg: config.shadowHueShiftDeg, uScreentoneLpi: config.screentoneLpi, uPaperGrainOverlay: config.paperGrainStrength,
    uHighlightColor: formatOklch(highlightOklch), uMidtoneColor: formatOklch(midtoneOklch),
    uShadowColor: formatOklch(shadowOklch), uLineInkColor: formatOklch(lineInkOklch),
  };

  return {
    source: normalizedSource, targetStyleId: config.styleId, celBands, celRampStops,
    ltExtraction: { normalEdgeThreshold, depthEdgeThreshold, creaseAngleDeg, outputLineWidthPx, inkOklch: lineInkOklch },
    specularConversion: { mode: preset.specularMode, highlightThreshold, metallicClamp, roughnessRemap, modeLabelKo: modeLabel.ko, modeLabelEn: modeLabel.en },
    pigmentPalette: { highlightOklch, midtoneOklch, shadowOklch, lineInkOklch, clampedChroma, shadowHueShiftDeg: config.shadowHueShiftDeg },
    screentoneLpi: config.screentoneLpi, paperGrainOverlay: config.paperGrainStrength,
    beforeSeamRiskScore, afterSeamRiskScore, shaderUniforms,
    summaryKo: `${normalizedSource.labelKo}의 금속 반사(${Math.round(metallic * 100)}%)를 ${Math.round(metallicClamp * 100)}% 이하로 눌러 ${celBands}단 셀과 ${outputLineWidthPx.toFixed(1)}px LT 선화(임계값 ${normalEdgeThreshold.toFixed(2)})로 변환합니다.`,
    summaryEn: `Clamps metallic reflection (${Math.round(metallic * 100)}% → ${Math.round(metallicClamp * 100)}%) into ${celBands}-band cel shading and ${outputLineWidthPx.toFixed(1)}px LT ink lines (threshold ${normalEdgeThreshold.toFixed(2)}).`,
  };
}

/** 외부 에셋·배경과 작가 기준 화풍을 대조해 이질감 점수(0~100)와 원클릭 통일 보정 파라미터를 산출한다. */
export function auditExternalAssetStyleDrift(
  targetConfigOrStyleId: StyleTuningConfig | StyleSpectrumId,
  assetInput: ExternalAssetStyleMetrics,
): ExternalAssetDriftAudit {
  const config = resolveTuningConfig(targetConfigOrStyleId);
  const preset = getStyleSpectrumPreset(config.styleId);
  const lineWidthPx = round2(clamp(assetInput.lineWidthPx, 0.2, 6.0));
  const chromaOklch = round2(clamp(assetInput.chromaOklch, 0, 0.35));
  const contrastRatio = round2(clamp(assetInput.contrastRatio, 1.0, 12.0));
  const noiseDensity = clamp01(assetInput.noiseDensity);
  const dominantHueDeg = normalizeHue(assetInput.dominantHueDeg);
  const violetSlopDetected = isVioletSlopHue(dominantHueDeg);
  const normalizedAsset: ExternalAssetStyleMetrics = { ...assetInput, lineWidthPx, chromaOklch, contrastRatio, noiseDensity, dominantHueDeg };

  const targetLine = config.lineWidthPx;
  const targetChroma = Math.min(config.maxChromaOklch, preset.paletteSwatches[1].c + 0.02);
  const targetContrast = config.targetContrastRatio;
  const targetNoise = config.paperGrainStrength;

  const lineWidthDeltaPx = round2(lineWidthPx - targetLine);
  const chromaDelta = round2(chromaOklch - config.maxChromaOklch);
  const contrastDelta = round2(contrastRatio - targetContrast);
  const noiseDelta = round2(noiseDensity - targetNoise);

  const linePenalty = Math.min(34, (Math.abs(lineWidthDeltaPx) / Math.max(0.6, targetLine)) * 30);
  const chromaPenalty = chromaDelta > 0 ? Math.min(30, chromaDelta * 260) : Math.min(14, Math.abs(chromaOklch - targetChroma) * 75);
  const contrastPenalty = Math.min(22, Math.abs(contrastDelta) * 5.2);
  const noisePenalty = Math.min(18, Math.abs(noiseDelta) * 32);
  const driftScore = Math.round(clamp(linePenalty + chromaPenalty + contrastPenalty + noisePenalty + (violetSlopDetected ? 16 : 0), 0, 100));
  const severity: StyleDriftSeverity = driftScore < 25 ? "harmonized" : driftScore < 55 ? "notice" : "high-drift";

  const lineResampleScale = round2(clamp(targetLine / Math.max(0.25, lineWidthPx), 0.35, 4.5));
  const chromaMatchGain = round2(clamp(targetChroma / Math.max(0.02, chromaOklch), 0.1, 1.5));
  const contrastRemapGain = round2(clamp(targetContrast / Math.max(1.0, contrastRatio), 0.4, 1.8));
  const paperGrainOverlayDelta = round2(clamp(targetNoise - noiseDensity, -1, 1));
  const safeRemappedHueDeg = sanitizeNonVioletHue(dominantHueDeg);
  const projectedDriftScore = Math.round(clamp(driftScore * 0.14, 2, Math.min(15, driftScore)));

  const warningsKo: string[] = [];
  const warningsEn: string[] = [];
  const actionsKo: string[] = [];
  const actionsEn: string[] = [];

  if (Math.abs(lineWidthDeltaPx) >= 0.35) {
    warningsKo.push(`선 굵기 편차(${lineWidthPx.toFixed(2)}px vs 기준 ${targetLine.toFixed(2)}px)로 배경과 인물이 분리되어 보입니다.`);
    warningsEn.push(`Line weight mismatch (${lineWidthPx.toFixed(2)}px vs ${targetLine.toFixed(2)}px target) separates backdrop from characters.`);
    actionsKo.push(`선화 리샘플 ${lineResampleScale.toFixed(2)}배로 ${targetLine.toFixed(1)}px 맞춤`);
    actionsEn.push(`Resample line weight ${lineResampleScale.toFixed(2)}x to ${targetLine.toFixed(1)}px`);
  }
  if (chromaDelta > 0.015) {
    warningsKo.push(`외부 에셋 채도(${chromaOklch.toFixed(2)})가 화풍 상한(${config.maxChromaOklch.toFixed(2)})을 초과해 색이 튑니다.`);
    warningsEn.push(`Asset chroma (${chromaOklch.toFixed(2)}) exceeds the style ceiling (${config.maxChromaOklch.toFixed(2)}).`);
    actionsKo.push(`채도 게인 ${Math.round(chromaMatchGain * 100)}% 적용 (상한 ${config.maxChromaOklch.toFixed(2)} 클램프)`);
    actionsEn.push(`Scale chroma to ${Math.round(chromaMatchGain * 100)}% (clamp <= ${config.maxChromaOklch.toFixed(2)})`);
  }
  if (Math.abs(contrastDelta) >= 1.3) {
    warningsKo.push(`명암 대비(${contrastRatio.toFixed(1)}:1 vs 기준 ${targetContrast.toFixed(1)}:1)가 어긋나 톤 계조가 이질적입니다.`);
    warningsEn.push(`Contrast ratio (${contrastRatio.toFixed(1)}:1 vs ${targetContrast.toFixed(1)}:1 target) breaks tonal continuity.`);
    actionsKo.push(`명암 톤 커브 ${Math.round(contrastRemapGain * 100)}% 보정`);
    actionsEn.push(`Remap tonal contrast by ${Math.round(contrastRemapGain * 100)}%`);
  }
  if (Math.abs(noiseDelta) >= 0.14) {
    const sign = paperGrainOverlayDelta >= 0 ? "+" : "";
    warningsKo.push(`표면 노이즈 밀도(${Math.round(noiseDensity * 100)}% vs 기준 ${Math.round(targetNoise * 100)}%) 차이로 질감 이질감이 발생합니다.`);
    warningsEn.push(`Surface noise (${Math.round(noiseDensity * 100)}% vs ${Math.round(targetNoise * 100)}% target) reveals mismatched texture.`);
    actionsKo.push(`종이 그레인 오버레이 ${sign}${Math.round(paperGrainOverlayDelta * 100)}%p 맞춤`);
    actionsEn.push(`Adjust paper grain overlay by ${sign}${Math.round(paperGrainOverlayDelta * 100)}pp`);
  }
  if (violetSlopDetected) {
    warningsKo.push(`외부 에셋 주조 휴(${dominantHueDeg}°)가 바이올렛 편향 구간(270~320°)에 들어 있어 자동 치환이 필요합니다.`);
    warningsEn.push(`Asset hue (${dominantHueDeg}°) falls inside the violet-slop range (270-320°) and requires safe remapping.`);
    actionsKo.push(`바이올렛 편향 휴 ${dominantHueDeg}° → 안전 안료 ${safeRemappedHueDeg}° 치환`);
    actionsEn.push(`Remap violet hue ${dominantHueDeg}° → safe pigment ${safeRemappedHueDeg}°`);
  }
  if (actionsKo.length === 0) {
    actionsKo.push("기준 화풍 범위 안쪽입니다. 미세 그레인 톤 정리만으로 바로 합칠 수 있습니다.");
    actionsEn.push("Already aligned with baseline style; light grain matching keeps cuts cohesive.");
  }

  return {
    asset: normalizedAsset, targetStyleId: config.styleId, driftScore, severity,
    lineWidthDeltaPx, chromaDelta, contrastDelta, noiseDelta, violetSlopDetected,
    unificationCorrection: {
      lineResampleScale, targetLineWidthPx: targetLine, chromaMatchGain, targetChromaOklch: round2(targetChroma),
      contrastRemapGain, targetContrastRatio: targetContrast, paperGrainOverlayDelta, targetNoiseDensity: targetNoise,
      safeRemappedHueDeg, projectedDriftScore, actionsKo, actionsEn,
    },
    warningsKo, warningsEn,
    summaryKo: severity === "harmonized"
      ? `이질감 ${driftScore}점(안정) · ${preset.nameKo} 기준과 자연스럽게 어울립니다.`
      : `이질감 ${driftScore}점(${severity === "notice" ? "주의" : "높음"}) · 원클릭 화풍 통일 보정으로 ${projectedDriftScore}점까지 낮출 수 있습니다.`,
    summaryEn: severity === "harmonized"
      ? `Drift ${driftScore}/100 (Harmonized) — blends smoothly with ${preset.nameEn}.`
      : `Drift ${driftScore}/100 (${severity === "notice" ? "Notice" : "High Drift"}) — 1-click unification lowers drift to ${projectedDriftScore}/100.`,
  };
}

/** 비파괴 화풍 가디언 초기 세션을 생성한다. */
export function createStyleGuardianSession(initialStyleId: StyleSpectrumId = "k-webtoon-cel"): StyleGuardianSession {
  const baselineConfig = createConfigFromStylePreset(initialStyleId);
  return {
    baselineConfig, currentConfig: baselineConfig, previewStyleId: null, previewConfig: null,
    appliedStyleId: null, status: "idle", isTweaked: false, canRevert: false, history: [],
  };
}

/** 원본 컷 설정을 건드리지 않고 화풍 미리보기를 토글한다. */
export function previewStyleSpectrum(session: StyleGuardianSession, styleId: StyleSpectrumId | null): StyleGuardianSession {
  if (styleId === null || session.previewStyleId === styleId) {
    const lastAction = session.history[session.history.length - 1]?.action;
    const nextStatus: StyleGuardianSessionStatus = session.canRevert
      ? (session.isTweaked ? "tweaked" : "applied")
      : (lastAction === "revert" ? "reverted" : "idle");
    return { ...session, previewStyleId: null, previewConfig: null, status: nextStatus };
  }
  return { ...session, previewStyleId: styleId, previewConfig: createConfigFromStylePreset(styleId), status: "previewing" };
}

/** 작가 승인으로 선택한 화풍 스펙트럼을 비파괴 적용한다. */
export function applyStyleSpectrum(session: StyleGuardianSession, styleId: StyleSpectrumId, reasonLabelKo?: string): StyleGuardianSession {
  const preset = getStyleSpectrumPreset(styleId);
  return {
    ...session, currentConfig: createConfigFromStylePreset(styleId), previewStyleId: null, previewConfig: null,
    appliedStyleId: preset.id, status: "applied", isTweaked: false, canRevert: true,
    history: [...session.history, { step: session.history.length + 1, action: "apply-style", styleId: preset.id, labelKo: reasonLabelKo ?? `${preset.nameKo} 비파괴 적용` }],
  };
}

/** 외부 에셋 이질감 감사 결과를 바탕으로 원클릭 화풍 통일 보정을 비파괴 적용한다. */
export function applyStyleUnificationCorrection(session: StyleGuardianSession, previousAudit: ExternalAssetDriftAudit): StyleGuardianSession {
  const base = resolveTuningConfig(session.previewConfig ?? session.currentConfig);
  const audit = auditExternalAssetStyleDrift(base, previousAudit.asset);
  const preset = getStyleSpectrumPreset(base.styleId);
  const nextConfig: StyleTuningConfig = {
    ...base,
    lineWidthPx: round2(clamp(audit.unificationCorrection.targetLineWidthPx, 0.5, 4.2)),
    maxChromaOklch: round2(clamp(Math.min(base.maxChromaOklch, audit.unificationCorrection.targetChromaOklch + 0.02), 0.01, 0.26)),
    paperGrainStrength: clamp01(audit.unificationCorrection.targetNoiseDensity),
    targetContrastRatio: round2(clamp(audit.unificationCorrection.targetContrastRatio, 2.0, 9.0)),
    unificationApplied: true, unificationSourceAssetId: audit.asset.assetId ?? audit.asset.labelKo,
  };
  return {
    ...session, currentConfig: nextConfig, previewStyleId: null, previewConfig: null,
    appliedStyleId: preset.id, status: "applied", isTweaked: false, canRevert: true,
    history: [...session.history, { step: session.history.length + 1, action: "apply-unification", styleId: preset.id, labelKo: `${audit.asset.labelKo} 원클릭 화풍 통일 (${audit.driftScore}→${audit.unificationCorrection.projectedDriftScore}점)` }],
  };
}

/** 선 굵기·셀 밴드·채도 상한·종이 그레인·그림자 색온도 이동을 비파괴 미세 조정한다. */
export function tweakStyleGuardianConfig(session: StyleGuardianSession, patch: StyleTuningTweakPatch): StyleGuardianSession {
  const base = session.previewConfig ?? session.currentConfig;
  const nextConfig: StyleTuningConfig = {
    ...base,
    lineWidthPx: patch.lineWidthPx !== undefined ? round2(clamp(patch.lineWidthPx, 0.5, 4.2)) : base.lineWidthPx,
    shadingSteps: patch.shadingSteps !== undefined ? Math.round(clamp(patch.shadingSteps, 2, 6)) : base.shadingSteps,
    maxChromaOklch: patch.maxChromaOklch !== undefined ? round2(clamp(patch.maxChromaOklch, 0.01, 0.26)) : base.maxChromaOklch,
    paperGrainStrength: patch.paperGrainStrength !== undefined ? clamp01(patch.paperGrainStrength) : base.paperGrainStrength,
    shadowHueShiftDeg: patch.shadowHueShiftDeg !== undefined ? Math.round(clamp(patch.shadowHueShiftDeg, -40, 40)) : base.shadowHueShiftDeg,
  };
  return {
    ...session, currentConfig: nextConfig, previewStyleId: null, previewConfig: null,
    appliedStyleId: nextConfig.styleId, status: "tweaked", isTweaked: true, canRevert: true,
    history: [...session.history, { step: session.history.length + 1, action: "tweak", styleId: nextConfig.styleId, labelKo: `화풍 미세 보정 (선 ${nextConfig.lineWidthPx.toFixed(1)}px · ${nextConfig.shadingSteps}단 · 채도 ${nextConfig.maxChromaOklch.toFixed(2)})` }],
  };
}

/** 모든 화풍 적용·통일 보정·슬라이더 조정을 초기 원본 설정으로 100% 복원한다. */
export function revertStyleGuardianSession(session: StyleGuardianSession): StyleGuardianSession {
  return {
    ...session, currentConfig: session.baselineConfig, previewStyleId: null, previewConfig: null,
    appliedStyleId: null, status: "reverted", isTweaked: false, canRevert: false,
    history: [...session.history, { step: session.history.length + 1, action: "revert", styleId: session.baselineConfig.styleId, labelKo: "원본 화풍 기준으로 복원" }],
  };
}

/** 현재 화풍 DNA·Top-3 제안·3D→2D 셰이더 매핑·드리프트 감사 결과를 결정론적 JSON으로 내보낸다. */
export function exportStyleGuardianJson(
  session: StyleGuardianSession,
  proposalBundle: StyleSpectrumProposalBundle,
  transferPlan: CrossMediaTransferPlan,
  driftAudit: ExternalAssetDriftAudit,
): string {
  const activeConfig = resolveTuningConfig(session.previewConfig ?? session.currentConfig);
  const preset = getStyleSpectrumPreset(activeConfig.styleId);
  return JSON.stringify({
    schema: "toonstudio.style-spectrum-guardian.v1",
    scope: "example-session",
    violetSlopPct: 0,
    requiresAuthorApproval: true,
    sessionState: {
      status: session.status, canRevert: session.canRevert, isTweaked: session.isTweaked,
      baselineStyleId: session.baselineConfig.styleId, activeStyleId: activeConfig.styleId,
      unificationApplied: activeConfig.unificationApplied, historyCount: session.history.length,
    },
    styleDna: {
      id: preset.id, nameKo: preset.nameKo, nameEn: preset.nameEn,
      lineWidthPx: activeConfig.lineWidthPx, lineWidthRangePx: preset.lineWidthRangePx,
      shadingSteps: activeConfig.shadingSteps, screentoneLpi: activeConfig.screentoneLpi,
      maxChromaOklch: activeConfig.maxChromaOklch, shadowHueShiftDeg: activeConfig.shadowHueShiftDeg,
      paperGrainStrength: activeConfig.paperGrainStrength, brushRecipe: preset.brushRecipe,
      paletteOklch: preset.paletteSwatches.map((swatch) => formatOklch(swatch)),
    },
    proposalTop3: proposalBundle.proposals.map((item) => ({ rank: item.rank, styleId: item.styleId, matchScore: item.matchScore, reasonKo: item.reasonKo })),
    crossMediaTransfer: {
      sourceLabelKo: transferPlan.source.labelKo, celBands: transferPlan.celBands, celRampStops: transferPlan.celRampStops,
      ltExtraction: { ...transferPlan.ltExtraction, inkOklchCss: formatOklch(transferPlan.ltExtraction.inkOklch) },
      specularConversion: transferPlan.specularConversion,
      beforeSeamRiskScore: transferPlan.beforeSeamRiskScore, afterSeamRiskScore: transferPlan.afterSeamRiskScore,
      shaderUniforms: transferPlan.shaderUniforms,
    },
    driftGuardian: {
      assetLabelKo: driftAudit.asset.labelKo, driftScore: driftAudit.driftScore, severity: driftAudit.severity,
      violetSlopDetected: driftAudit.violetSlopDetected, projectedDriftScore: driftAudit.unificationCorrection.projectedDriftScore,
      unificationCorrection: driftAudit.unificationCorrection,
    },
  }, null, 2);
}
