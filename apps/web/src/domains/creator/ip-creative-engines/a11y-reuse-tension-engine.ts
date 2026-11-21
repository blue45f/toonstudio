/**
 * Wave 17A — 무과금(₩0) 로컬 결정론적 창작·가독성·재활용·서사 텐션·분기 검증 엔진
 * 1. 다크모드·색맹·저시력 자동 가독성 검수기 (WCAG 2.1 + 선형 RGB 색각 시뮬레이션 + 자동 외곽선 교정)
 * 2. 자동 컷 재활용 뱅크 (1~100화 표정·손·소품 초고속 인덱싱 및 1초 캔버스 삽입 페이로드)
 * 3. 무스포일러 캐릭터 관계도 & 지난 화 30초 요약 + 연재 텐션 그래프 + 독자 참여형 분기 컷 검증기
 */

export interface SrgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export type ReaderBackgroundPresetId = "naver-kakao-dark" | "paper-sepia" | "day-light";

export interface ReaderBackgroundPreset {
  readonly id: ReaderBackgroundPresetId;
  readonly labelKo: string;
  readonly rgb: SrgbColor;
  readonly oklchCss: string;
  readonly isDark: boolean;
}

export type ColorVisionMode = "normal" | "protanopia" | "deuteranopia" | "tritanopia";
export type ReadabilityLayerKind = "speech-bubble" | "sfx" | "narration" | "caption";
export type AuditSeverity = "pass" | "warning" | "critical";

export interface ReadabilityLayerItem {
  readonly id: string;
  readonly labelKo: string;
  readonly kind: ReadabilityLayerKind;
  readonly foreground: SrgbColor;
  /** null이면 말풍선 배경 없이 웹툰 뷰어 배경(다크모드 등) 위에 직접 떠 있는 요소다. */
  readonly surface: SrgbColor | null;
  readonly fontSizePx: number;
  readonly strokeWidthPx: number;
  readonly hasOuterHalo: boolean;
}

export interface HaloCorrectionSpec {
  readonly recommended: boolean;
  readonly haloColorRgb: SrgbColor;
  readonly haloColorOklch: string;
  readonly strokeWidthPx: number;
  readonly outerGlowBlurPx: number;
  readonly projectedContrast: number;
  readonly cssTextShadowPreview: string;
  readonly reasonKo: string;
}

export interface ReadabilityLayerAuditResult {
  readonly item: ReadabilityLayerItem;
  readonly effectiveBackground: SrgbColor;
  readonly effectiveBackgroundOklch: string;
  readonly foregroundOklch: string;
  readonly normalContrast: number;
  readonly cvdContrasts: Readonly<Record<Exclude<ColorVisionMode, "normal">, number>>;
  readonly worstCvdMode: Exclude<ColorVisionMode, "normal">;
  readonly minCvdContrast: number;
  readonly darkModeBuried: boolean;
  readonly lowVisionPass: boolean;
  readonly severity: AuditSeverity;
  readonly haloCorrection: HaloCorrectionSpec;
}

export interface ReadabilityAuditReport {
  readonly preset: ReaderBackgroundPreset;
  readonly items: readonly ReadabilityLayerAuditResult[];
  readonly passCount: number;
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly buriedSfxCount: number;
  readonly overallScore: number;
  readonly overallGradeKo: "AA+ 최적" | "AA 양호" | "주의 필요" | "즉시 교정";
}

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function roundTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

function srgbChannelToLinear(channel: number): number {
  const normalized = clampByte(channel) / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function linearToSrgbChannel(linear: number): number {
  const clamped = clampUnit(linear);
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return clampByte(encoded * 255);
}

/**
 * sRGB 색상을 CSS OKLCH 문자열로 결정론적 변환한다(원시 HEX 문자열 미사용).
 */
export function toOklchCss(rgb: SrgbColor): string {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  const okL = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot;
  const okA = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot;
  const okB = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot;

  const chroma = Math.sqrt(okA * okA + okB * okB);
  const hueRad = Math.atan2(okB, okA);
  const hueDeg = chroma < 0.0004 ? 0 : (hueRad * (180 / Math.PI) + 360) % 360;

  return `oklch(${(Math.round(clampUnit(okL) * 1000) / 1000).toFixed(3)} ${(Math.round(chroma * 1000) / 1000).toFixed(3)} ${Math.round(hueDeg)})`;
}

export function relativeLuminance(rgb: SrgbColor): number {
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeContrastRatio(foreground: SrgbColor, background: SrgbColor): number {
  const lumA = relativeLuminance(foreground);
  const lumB = relativeLuminance(background);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return roundTwo((lighter + 0.05) / (darker + 0.05));
}

const CVD_MATRICES: Readonly<Record<Exclude<ColorVisionMode, "normal">, readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
]>> = {
  // Viénot / Machado 선형 sRGB 색각 이상 시뮬레이션 행렬
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export function simulateColorVision(rgb: SrgbColor, mode: ColorVisionMode): SrgbColor {
  if (mode === "normal") {
    return { r: clampByte(rgb.r), g: clampByte(rgb.g), b: clampByte(rgb.b) };
  }
  const r = srgbChannelToLinear(rgb.r);
  const g = srgbChannelToLinear(rgb.g);
  const b = srgbChannelToLinear(rgb.b);
  const matrix = CVD_MATRICES[mode];
  return {
    r: linearToSrgbChannel(matrix[0][0] * r + matrix[0][1] * g + matrix[0][2] * b),
    g: linearToSrgbChannel(matrix[1][0] * r + matrix[1][1] * g + matrix[1][2] * b),
    b: linearToSrgbChannel(matrix[2][0] * r + matrix[2][1] * g + matrix[2][2] * b),
  };
}

/** 네이버/카카오 야간 다크모드(sRGB 14,16,21 대응 OKLCH) 포함 뷰어 배경 프리셋 */
export const READER_BACKGROUND_PRESETS: readonly ReaderBackgroundPreset[] = [
  {
    id: "naver-kakao-dark",
    labelKo: "네이버·카카오 야간 다크모드",
    rgb: { r: 14, g: 16, b: 21 },
    oklchCss: toOklchCss({ r: 14, g: 16, b: 21 }),
    isDark: true,
  },
  {
    id: "paper-sepia",
    labelKo: "눈편한 미색 지면 모드",
    rgb: { r: 244, g: 238, b: 225 },
    oklchCss: toOklchCss({ r: 244, g: 238, b: 225 }),
    isDark: false,
  },
  {
    id: "day-light",
    labelKo: "주간 화이트 모드",
    rgb: { r: 252, g: 252, b: 253 },
    oklchCss: toOklchCss({ r: 252, g: 252, b: 253 }),
    isDark: false,
  },
];

function findBackgroundPreset(presetId: ReaderBackgroundPresetId): ReaderBackgroundPreset {
  return READER_BACKGROUND_PRESETS.find((preset) => preset.id === presetId) ?? READER_BACKGROUND_PRESETS[0];
}

function buildHaloCorrection(
  item: ReadabilityLayerItem,
  effectiveBg: SrgbColor,
  normalContrast: number,
  minCvdContrast: number,
  darkModeBuried: boolean,
  requiredContrast: number,
): HaloCorrectionSpec {
  const bgLum = relativeLuminance(effectiveBg);
  const fgLum = relativeLuminance(item.foreground);
  const needsHalo = darkModeBuried || minCvdContrast < requiredContrast || normalContrast < requiredContrast;
  const preferBrightHalo = bgLum < 0.35 || fgLum < 0.25;
  const haloColorRgb: SrgbColor = preferBrightHalo
    ? item.kind === "sfx" && item.foreground.r > 150 && item.foreground.g < 90
      ? { r: 252, g: 246, b: 224 }
      : { r: 248, g: 250, b: 252 }
    : { r: 18, g: 22, b: 30 };
  const haloColorOklch = toOklchCss(haloColorRgb);
  const contrastDeficit = Math.max(0, requiredContrast - Math.min(normalContrast, minCvdContrast));
  const strokeWidthPx = needsHalo
    ? roundTwo(Math.min(5, Math.max(2.2, item.fontSizePx * 0.085 + contrastDeficit * 0.35)))
    : Math.max(0, item.strokeWidthPx);
  const outerGlowBlurPx = needsHalo ? roundTwo(strokeWidthPx * 1.45) : 0;
  const fgAgainstHalo = computeContrastRatio(item.foreground, haloColorRgb);
  const haloAgainstBg = computeContrastRatio(haloColorRgb, effectiveBg);
  const projectedContrast = needsHalo ? roundTwo(Math.min(fgAgainstHalo, haloAgainstBg)) : normalContrast;
  const shadowPx = Math.max(1, Math.round(strokeWidthPx));
  const cssTextShadowPreview = needsHalo
    ? `0 0 ${outerGlowBlurPx}px ${haloColorOklch}, ${shadowPx}px 0 0 ${haloColorOklch}, -${shadowPx}px 0 0 ${haloColorOklch}, 0 ${shadowPx}px 0 ${haloColorOklch}, 0 -${shadowPx}px 0 ${haloColorOklch}`
    : "none";

  let reasonKo = "현재 대비와 색각 가독성이 기준을 충족해 추가 외곽선 보정이 필요 없습니다.";
  if (darkModeBuried) {
    reasonKo = "야간 다크 배경에 잉크가 매몰됩니다. 밝은 외곽선(Halo)을 둘러 컷 경계 밖에서도 즉시 읽히게 교정합니다.";
  } else if (minCvdContrast < requiredContrast) {
    reasonKo = "색각 이상 시뮬레이션에서 대비가 떨어집니다. 명도 분리 외곽선으로 색 구별 의존도를 제거합니다.";
  } else if (normalContrast < requiredContrast) {
    reasonKo = "저시력 WCAG 대비 기준에 못 미쳐 외곽선 두께와 배경 명도 분리를 강화해야 합니다.";
  }

  return {
    recommended: needsHalo,
    haloColorRgb,
    haloColorOklch,
    strokeWidthPx,
    outerGlowBlurPx,
    projectedContrast,
    cssTextShadowPreview,
    reasonKo,
  };
}

export function auditReadabilityForDarkAndCvd(
  layers: readonly ReadabilityLayerItem[],
  presetId: ReaderBackgroundPresetId = "naver-kakao-dark",
): ReadabilityAuditReport {
  const preset = findBackgroundPreset(presetId);
  const items: ReadabilityLayerAuditResult[] = layers.map((item) => {
    const effectiveBackground = item.surface ?? preset.rgb;
    const normalContrast = computeContrastRatio(item.foreground, effectiveBackground);
    const cvdModes: readonly Exclude<ColorVisionMode, "normal">[] = ["protanopia", "deuteranopia", "tritanopia"];
    const protanopia = computeContrastRatio(
      simulateColorVision(item.foreground, "protanopia"),
      simulateColorVision(effectiveBackground, "protanopia"),
    );
    const deuteranopia = computeContrastRatio(
      simulateColorVision(item.foreground, "deuteranopia"),
      simulateColorVision(effectiveBackground, "deuteranopia"),
    );
    const tritanopia = computeContrastRatio(
      simulateColorVision(item.foreground, "tritanopia"),
      simulateColorVision(effectiveBackground, "tritanopia"),
    );
    const cvdContrasts = { protanopia, deuteranopia, tritanopia } as const;
    let worstCvdMode: Exclude<ColorVisionMode, "normal"> = cvdModes[0];
    let minCvdContrast = cvdContrasts[worstCvdMode];
    for (const mode of cvdModes) {
      if (cvdContrasts[mode] < minCvdContrast) {
        worstCvdMode = mode;
        minCvdContrast = cvdContrasts[mode];
      }
    }

    const isLargeText = item.fontSizePx >= 24 || item.kind === "sfx";
    const requiredContrast = isLargeText ? 3.0 : 4.5;
    const effectiveBgIsDark = relativeLuminance(effectiveBackground) < 0.12;
    const darkModeBuried =
      effectiveBgIsDark && !item.hasOuterHalo && (normalContrast < 2.6 || (item.surface === null && normalContrast < 3.2));
    const lowVisionPass = item.fontSizePx >= 14 && normalContrast >= requiredContrast && minCvdContrast >= requiredContrast;

    let severity: AuditSeverity = "pass";
    if (darkModeBuried || normalContrast < 2.5 || minCvdContrast < 2.5) {
      severity = "critical";
    } else if (!lowVisionPass) {
      severity = "warning";
    }

    const haloCorrection = buildHaloCorrection(
      item,
      effectiveBackground,
      normalContrast,
      minCvdContrast,
      darkModeBuried,
      requiredContrast,
    );

    return {
      item,
      effectiveBackground,
      effectiveBackgroundOklch: toOklchCss(effectiveBackground),
      foregroundOklch: toOklchCss(item.foreground),
      normalContrast,
      cvdContrasts,
      worstCvdMode,
      minCvdContrast,
      darkModeBuried,
      lowVisionPass,
      severity,
      haloCorrection,
    };
  });

  const passCount = items.filter((entry) => entry.severity === "pass").length;
  const warningCount = items.filter((entry) => entry.severity === "warning").length;
  const criticalCount = items.filter((entry) => entry.severity === "critical").length;
  const buriedSfxCount = items.filter((entry) => entry.darkModeBuried).length;
  const rawScore = items.length === 0 ? 100 : Math.round(((passCount * 100 + warningCount * 58 + criticalCount * 12) / items.length));
  const overallScore = Math.max(0, Math.min(100, rawScore));
  const overallGradeKo: ReadabilityAuditReport["overallGradeKo"] =
    criticalCount > 0 ? "즉시 교정" : warningCount > 0 ? "주의 필요" : overallScore >= 95 ? "AA+ 최적" : "AA 양호";

  return {
    preset,
    items,
    passCount,
    warningCount,
    criticalCount,
    buriedSfxCount,
    overallScore,
    overallGradeKo,
  };
}

/* ---------------- 2. 자동 컷 재활용 뱅크 (1~100화 표정·손·소품 라이브러리) ---------------- */

export type ReuseAssetCategory = "expression" | "hand" | "prop";
export type ReuseAssetEmotion = "joy" | "anger" | "shock" | "sadness" | "smirk" | "calm" | "focus";

export interface CutReuseAssetItem {
  readonly id: string;
  readonly titleKo: string;
  readonly characterName: string;
  readonly category: ReuseAssetCategory;
  readonly emotion: ReuseAssetEmotion;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly tags: readonly string[];
  readonly widthPx: number;
  readonly heightPx: number;
  readonly dominantToneOklch: string;
  readonly usageCount: number;
  readonly layerPreset: "lineart-plus-flat" | "lineart-only" | "full-shaded";
}

export interface CutReuseBankIndex {
  readonly totalAssets: number;
  readonly byId: ReadonlyMap<string, CutReuseAssetItem>;
  readonly byCategory: ReadonlyMap<ReuseAssetCategory, readonly string[]>;
  readonly byEmotion: ReadonlyMap<ReuseAssetEmotion, readonly string[]>;
  readonly byCharacter: ReadonlyMap<string, readonly string[]>;
  readonly tokenIndex: ReadonlyMap<string, readonly string[]>;
  readonly characters: readonly string[];
}

export interface CutReuseSearchQuery {
  readonly keyword?: string;
  readonly category?: ReuseAssetCategory | "all";
  readonly emotion?: ReuseAssetEmotion | "all";
  readonly characterName?: string | "all";
  readonly minEpisode?: number;
  readonly maxEpisode?: number;
}

export interface CutReuseSearchHit {
  readonly asset: CutReuseAssetItem;
  readonly matchScore: number;
  readonly matchedFields: readonly string[];
}

export interface CanvasReuseInsertPayload {
  readonly payloadVersion: "toonstudio.cut-reuse.v1";
  readonly sourceAssetId: string;
  readonly targetLayerName: string;
  readonly layerPreset: CutReuseAssetItem["layerPreset"];
  readonly transform: {
    readonly x: number;
    readonly y: number;
    readonly scaleX: number;
    readonly scaleY: number;
    readonly rotationDeg: number;
    readonly flipHorizontal: boolean;
  };
  readonly preserveLineWeight: boolean;
  readonly estimatedTimeSavedMin: number;
  readonly insertLatencyBudgetMs: 1000;
  readonly rightsTag: "author-self-owned";
}

function tokenizeKoreanQuery(text: string): string[] {
  return text
    .trim()
    .toLowerCase()
    .split(/[\s,/#·_-]+/u)
    .filter((token) => token.length > 0);
}

function pushIndex(map: Map<string, string[]>, key: string, id: string): void {
  const existing = map.get(key);
  if (existing) {
    if (!existing.includes(id)) existing.push(id);
  } else {
    map.set(key, [id]);
  }
}

export function buildCutReuseBankIndex(items: readonly CutReuseAssetItem[]): CutReuseBankIndex {
  const byId = new Map<string, CutReuseAssetItem>();
  const byCategory = new Map<ReuseAssetCategory, string[]>();
  const byEmotion = new Map<ReuseAssetEmotion, string[]>();
  const byCharacter = new Map<string, string[]>();
  const tokenIndex = new Map<string, string[]>();

  for (const item of items) {
    byId.set(item.id, item);
    const catList = byCategory.get(item.category) ?? [];
    catList.push(item.id);
    byCategory.set(item.category, catList);

    const emoList = byEmotion.get(item.emotion) ?? [];
    emoList.push(item.id);
    byEmotion.set(item.emotion, emoList);

    pushIndex(byCharacter, item.characterName, item.id);

    const rawTokens = [
      ...tokenizeKoreanQuery(item.titleKo),
      ...tokenizeKoreanQuery(item.characterName),
      ...item.tags.flatMap((tag) => tokenizeKoreanQuery(tag)),
      `ep${item.episodeNumber}`,
      `${item.episodeNumber}화`,
      item.category,
      item.emotion,
    ];
    for (const token of rawTokens) {
      pushIndex(tokenIndex, token, item.id);
    }
  }

  return {
    totalAssets: items.length,
    byId,
    byCategory,
    byEmotion,
    byCharacter,
    tokenIndex,
    characters: [...byCharacter.keys()].sort((a, b) => a.localeCompare(b, "ko")),
  };
}

export function searchCutReuseBank(index: CutReuseBankIndex, query: CutReuseSearchQuery): readonly CutReuseSearchHit[] {
  const tokens = tokenizeKoreanQuery(query.keyword ?? "");
  const minEp = query.minEpisode ?? 1;
  const maxEp = query.maxEpisode ?? 100;

  let candidateIds: string[];
  if (query.category && query.category !== "all") {
    candidateIds = [...(index.byCategory.get(query.category) ?? [])];
  } else if (query.characterName && query.characterName !== "all") {
    candidateIds = [...(index.byCharacter.get(query.characterName) ?? [])];
  } else {
    candidateIds = [...index.byId.keys()];
  }

  const hits: CutReuseSearchHit[] = [];
  for (const id of candidateIds) {
    const asset = index.byId.get(id);
    if (!asset) continue;
    if (query.category && query.category !== "all" && asset.category !== query.category) continue;
    if (query.emotion && query.emotion !== "all" && asset.emotion !== query.emotion) continue;
    if (query.characterName && query.characterName !== "all" && asset.characterName !== query.characterName) continue;
    if (asset.episodeNumber < minEp || asset.episodeNumber > maxEp) continue;

    const matchedFields: string[] = [];
    let score = 20 + Math.min(25, asset.usageCount * 2) + Math.round(asset.episodeNumber * 0.15);

    if (tokens.length > 0) {
      const searchableTitle = asset.titleKo.toLowerCase();
      const searchableCharacter = asset.characterName.toLowerCase();
      const searchableTags = asset.tags.map((tag) => tag.toLowerCase());
      const epTag = `${asset.episodeNumber}화`;
      let matchedAll = true;
      for (const token of tokens) {
        let tokenHit = false;
        if (searchableTitle.includes(token)) {
          score += 35;
          tokenHit = true;
          if (!matchedFields.includes("제목")) matchedFields.push("제목");
        }
        if (searchableCharacter.includes(token)) {
          score += 30;
          tokenHit = true;
          if (!matchedFields.includes("캐릭터")) matchedFields.push("캐릭터");
        }
        if (searchableTags.some((tag) => tag.includes(token))) {
          score += 24;
          tokenHit = true;
          if (!matchedFields.includes("태그")) matchedFields.push("태그");
        }
        if (epTag.includes(token) || `ep${asset.episodeNumber}` === token) {
          score += 20;
          tokenHit = true;
          if (!matchedFields.includes("회차")) matchedFields.push("회차");
        }
        if (!tokenHit) {
          matchedAll = false;
          break;
        }
      }
      if (!matchedAll) continue;
    } else {
      matchedFields.push("필터 일치");
    }

    hits.push({ asset, matchScore: score, matchedFields });
  }

  return hits.sort((a, b) => b.matchScore - a.matchScore || b.asset.episodeNumber - a.asset.episodeNumber || a.asset.id.localeCompare(b.asset.id));
}

export function createCanvasInsertPayload(
  asset: CutReuseAssetItem,
  options: {
    readonly targetX?: number;
    readonly targetY?: number;
    readonly scale?: number;
    readonly flipHorizontal?: boolean;
  } = {},
): CanvasReuseInsertPayload {
  const scale = Math.max(0.25, Math.min(3, options.scale ?? 1));
  const flipHorizontal = options.flipHorizontal ?? false;
  const epLabel = String(asset.episodeNumber).padStart(3, "0");
  const baseSavedMin = asset.category === "expression" ? 18 : asset.category === "hand" ? 14 : 11;
  return {
    payloadVersion: "toonstudio.cut-reuse.v1",
    sourceAssetId: asset.id,
    targetLayerName: `재활용_${asset.characterName}_${asset.category}_EP${epLabel}`,
    layerPreset: asset.layerPreset,
    transform: {
      x: Math.round(options.targetX ?? 400),
      y: Math.round(options.targetY ?? 320),
      scaleX: flipHorizontal ? -scale : scale,
      scaleY: scale,
      rotationDeg: 0,
      flipHorizontal,
    },
    preserveLineWeight: true,
    estimatedTimeSavedMin: baseSavedMin,
    insertLatencyBudgetMs: 1000,
    rightsTag: "author-self-owned",
  };
}

export {
  analyzeEpisodeTensionCurve,
  buildSpoilerFreeRecap,
  validateBranchingStoryGraph,
  type BranchingChoiceEdge,
  type BranchingCutNode,
  type BranchingGraphValidationResult,
  type BranchingStoryGraph,
  type CharacterRelationshipFact,
  type CharacterRelationType,
  type EpisodeRecapBeat,
  type EpisodeTensionAnalysis,
  type EpisodeTensionCut,
  type RecapCardItem,
  type SpoilerFreeRecapResult,
  type SpoilerFreeStoryBible,
  type StoryCharacterRecord,
  type TensionCurvePoint,
} from "./story-tension-branch-engine";
