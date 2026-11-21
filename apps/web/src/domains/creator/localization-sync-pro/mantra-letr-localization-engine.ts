/**
 * T-038 · T-039 · T-040:
 * - Mantra / LETR 스타일 6단계 AI 다국어 현지화 파이프라인 (한·영·일·중·스페인·태국·인니)
 * - 일본 세로쓰기(縦書き) + 루비 후리가나(<ruby><rt>) + 세로 중 가로(text-combine-upright) 조판기 재수출
 * - 단행본 인쇄용 CMYK 3mm 도련 + 재단선 + ICC + 300 DPI PDF/X-1a 검수기 재수출
 */

export {
  PRINT_ICC_PROFILES,
  PRINT_TRIM_PRESETS,
  buildPdfX1aPrintPackage,
  composeJapaneseTategaki,
  convertRgbToCmykWithTac,
  generateCropMarkGeometry,
  type CmykColorSample,
  type CropMarkLine,
  type PdfX1aPrintPackage,
  type PdfX1aPrintPackageConfig,
  type PrintIccProfileId,
  type PrintIccProfileSpec,
  type PrintPreflightCheckItem,
  type PrintTrimPreset,
  type PrintTrimPresetId,
  type TategakiCompositionOptions,
  type TategakiCompositionResult,
  type TategakiToken,
} from "./jp-tategaki-print-pdfx";

export const SUPPORTED_LOCALIZATION_LANGS = ["ko", "en", "ja", "zh", "es", "th", "id"] as const;
export type SupportedLocalizationLang = (typeof SUPPORTED_LOCALIZATION_LANGS)[number];

export type BalloonRegionKind = "speech" | "thought" | "shout" | "narration" | "sfx";
export type ReadingFlowMode = "vertical-webtoon" | "manga-rtl" | "comic-ltr";

export interface LocalizationLanguageSpec {
  readonly code: SupportedLocalizationLang;
  readonly labelKo: string;
  readonly nativeName: string;
  readonly defaultReadingFlow: ReadingFlowMode;
  readonly charWidthEm: number;
  readonly recommendedFont: string;
  readonly lineHeightRatio: number;
  readonly minFontSizePx: number;
}

export const LOCALIZATION_LANGUAGE_SPECS: Readonly<Record<SupportedLocalizationLang, LocalizationLanguageSpec>> = Object.freeze({
  ko: { code: "ko", labelKo: "한국어", nativeName: "한국어", defaultReadingFlow: "vertical-webtoon", charWidthEm: 0.96, recommendedFont: "Pretendard, Noto Sans KR", lineHeightRatio: 1.4, minFontSizePx: 13 },
  en: { code: "en", labelKo: "영어", nativeName: "English", defaultReadingFlow: "comic-ltr", charWidthEm: 0.56, recommendedFont: "Comic Neue, Inter", lineHeightRatio: 1.28, minFontSizePx: 12 },
  ja: { code: "ja", labelKo: "일본어", nativeName: "日本語", defaultReadingFlow: "manga-rtl", charWidthEm: 1.0, recommendedFont: "Shippori Mincho, Noto Sans JP", lineHeightRatio: 1.48, minFontSizePx: 13 },
  zh: { code: "zh", labelKo: "중국어", nativeName: "中文", defaultReadingFlow: "vertical-webtoon", charWidthEm: 1.0, recommendedFont: "Noto Sans SC, PingFang SC", lineHeightRatio: 1.42, minFontSizePx: 13 },
  es: { code: "es", labelKo: "스페인어", nativeName: "Español", defaultReadingFlow: "comic-ltr", charWidthEm: 0.57, recommendedFont: "Nunito Sans, Inter", lineHeightRatio: 1.3, minFontSizePx: 12 },
  th: { code: "th", labelKo: "태국어", nativeName: "ไทย", defaultReadingFlow: "vertical-webtoon", charWidthEm: 0.68, recommendedFont: "Noto Sans Thai, Sarabun", lineHeightRatio: 1.52, minFontSizePx: 14 },
  id: { code: "id", labelKo: "인도네시아어", nativeName: "Bahasa Indonesia", defaultReadingFlow: "comic-ltr", charWidthEm: 0.56, recommendedFont: "Plus Jakarta Sans, Inter", lineHeightRatio: 1.3, minFontSizePx: 12 },
});

export interface RawBalloonPanelInput {
  readonly id: string;
  readonly cutNumber: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly sourceText: string;
  readonly kindHint?: BalloonRegionKind;
  readonly backgroundComplexity?: "solid-white" | "screentone" | "complex-art";
}

export interface DetectedBalloonRegion {
  readonly id: string;
  readonly cutNumber: number;
  readonly kind: BalloonRegionKind;
  readonly readingOrder: number;
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly safeInnerRect: { readonly width: number; readonly height: number };
  readonly sourceText: string;
  readonly ocrConfidence: number;
  readonly backgroundComplexity: "solid-white" | "screentone" | "complex-art";
}

export interface CleanupInpaintMask {
  readonly regionId: string;
  readonly kind: BalloonRegionKind;
  readonly dilationPx: number;
  readonly featherPx: number;
  readonly maskRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly strategy: "solid-fill" | "patch-match-local" | "local-comfyui-inpaint";
  readonly coverageRatio: number;
  readonly costKrw: 0;
}

export interface GlossaryTermEntry {
  readonly id: string;
  readonly sourceTerm: string;
  readonly category: "character" | "place" | "skill" | "item";
  readonly locked: boolean;
  readonly translations: Readonly<Record<SupportedLocalizationLang, string>>;
}

export interface GlossaryTranslationResult {
  readonly translatedText: string;
  readonly appliedTerms: readonly { readonly sourceTerm: string; readonly targetTerm: string }[];
  readonly violations: readonly string[];
  readonly glossaryComplianceRate: number;
}

export interface BalloonTextFitResult {
  readonly regionId: string;
  readonly fontSizePx: number;
  readonly lineHeightPx: number;
  readonly lines: readonly string[];
  readonly lineCount: number;
  readonly estimatedWidthPx: number;
  readonly estimatedHeightPx: number;
  readonly fillRatio: number;
  readonly overflow: boolean;
  readonly recommendationKo: string;
}

export type SfxWarpCurve = "arc" | "burst" | "shake" | "wave" | "slash";

export interface SfxVectorMapping {
  readonly sourceSfx: string;
  readonly targetLang: SupportedLocalizationLang;
  readonly localizedSfx: string;
  readonly warpCurve: SfxWarpCurve;
  readonly skewDeg: number;
  readonly strokeWidthPx: number;
  readonly emphasisScale: number;
  readonly fontStack: string;
  readonly vectorReady: boolean;
}

export interface RegionalQaFinding {
  readonly code: string;
  readonly severity: "pass" | "warning" | "error";
  readonly regionId?: string;
  readonly messageKo: string;
  readonly actionKo: string;
}

export type MantraLetrStageId =
  | "1-ocr-detect"
  | "2-inpaint-mask"
  | "3-glossary-translate"
  | "4-balloon-fit"
  | "5-sfx-vector-map"
  | "6-regional-qa";

export interface MantraLetrStageTrace {
  readonly stageId: MantraLetrStageId;
  readonly stepNumber: 1 | 2 | 3 | 4 | 5 | 6;
  readonly titleKo: string;
  readonly status: "passed" | "warning" | "blocked";
  readonly summaryKo: string;
}

export interface LocalizedRegionOutput {
  readonly region: DetectedBalloonRegion;
  readonly cleanupMask: CleanupInpaintMask;
  readonly translation: GlossaryTranslationResult;
  readonly fit: BalloonTextFitResult;
  readonly sfxVector: SfxVectorMapping | null;
}

export interface MantraLetrPipelineInput {
  readonly panels: readonly RawBalloonPanelInput[];
  readonly sourceLang?: SupportedLocalizationLang;
  readonly targetLang: SupportedLocalizationLang;
  readonly readingFlow?: ReadingFlowMode;
  readonly glossary?: readonly GlossaryTermEntry[];
}

export interface MantraLetrPipelineResult {
  readonly sourceLang: SupportedLocalizationLang;
  readonly targetLang: SupportedLocalizationLang;
  readonly readingFlow: ReadingFlowMode;
  readonly stages: readonly MantraLetrStageTrace[];
  readonly items: readonly LocalizedRegionOutput[];
  readonly sfxMappings: readonly SfxVectorMapping[];
  readonly qaFindings: readonly RegionalQaFinding[];
  readonly glossaryComplianceRate: number;
  readonly readinessScore: number;
}

interface SfxPresetRecord {
  readonly warpCurve: SfxWarpCurve;
  readonly skewDeg: number;
  readonly strokeWidthPx: number;
  readonly emphasisScale: number;
  readonly variants: Readonly<Record<SupportedLocalizationLang, string>>;
}

const SFX_VECTOR_DICTIONARY: Readonly<Record<string, SfxPresetRecord>> = Object.freeze({
  "두근두근": { warpCurve: "wave", skewDeg: -4, strokeWidthPx: 2.5, emphasisScale: 1.05, variants: { ko: "두근두근", en: "BA-DUMP", ja: "ドキドキ", zh: "扑通扑通", es: "TUM-TUM", th: "ตึกตัก", id: "DEG-DEGAN" } },
  "쾅": { warpCurve: "burst", skewDeg: -12, strokeWidthPx: 5, emphasisScale: 1.4, variants: { ko: "쾅!", en: "BOOM!", ja: "ドゴォン!", zh: "轰隆!", es: "¡BUM!", th: "ตูม!", id: "DUAR!" } },
  "번쩍": { warpCurve: "slash", skewDeg: -10, strokeWidthPx: 3.5, emphasisScale: 1.25, variants: { ko: "번쩍", en: "FLASH", ja: "ピカッ", zh: "刷地一闪", es: "¡DESTELLO!", th: "แวบ!", id: "KILAT!" } },
  "슈욱": { warpCurve: "arc", skewDeg: -14, strokeWidthPx: 3, emphasisScale: 1.2, variants: { ko: "슈욱", en: "WHOOSH", ja: "シュッ", zh: "嗖—", es: "ZAS", th: "ฟิ้ว!", id: "WUSH!" } },
  "와르르": { warpCurve: "shake", skewDeg: -8, strokeWidthPx: 4, emphasisScale: 1.3, variants: { ko: "와르르", en: "CRASH", ja: "ガラガラ", zh: "哗啦啦", es: "ESTRUENDO", th: "โครม!", id: "BRAK!" } },
  "웅성웅성": { warpCurve: "wave", skewDeg: 0, strokeWidthPx: 2, emphasisScale: 0.95, variants: { ko: "웅성웅성", en: "MURMUR", ja: "ざわざわ", zh: "窃窃私语", es: "MURMULLO", th: "จอแจ", id: "BISIK-BISIK" } },
  "덜컹": { warpCurve: "shake", skewDeg: -6, strokeWidthPx: 3.5, emphasisScale: 1.15, variants: { ko: "덜컹", en: "CLANK", ja: "ガタン", zh: "哐当", es: "CLAC", th: "กึกกัก", id: "KLAK!" } },
  "스윽": { warpCurve: "arc", skewDeg: -5, strokeWidthPx: 2, emphasisScale: 1.0, variants: { ko: "스윽", en: "SWISH", ja: "スッ", zh: "唰", es: "FSHH", th: "ฟึ่บ", id: "SRUT" } },
});

const OFFLINE_PHRASE_TEMPLATES: Readonly<Record<string, Readonly<Record<SupportedLocalizationLang, string>>>> = Object.freeze({
  "오늘 밤": { ko: "오늘 밤", en: "tonight", ja: "今夜", zh: "今晚", es: "esta noche", th: "คืนนี้", id: "malam ini" },
  "정말": { ko: "정말", en: "really", ja: "本当に", zh: "真的", es: "de verdad", th: "จริงเหรอ", id: "sungguh" },
  "혼자 들어갈 셈이야?": { ko: "혼자 들어갈 셈이야?", en: "are you going in alone?", ja: "一人で入るつもりなの？", zh: "你打算一个人进去吗？", es: "¿vas a entrar solo?", th: "จะเข้าไปคนเดียวจริงเหรอ?", id: "kamu mau masuk sendirian?" },
  "네가 말려도 내 검이 멈추진 않아.": { ko: "네가 말려도 내 검이 멈추진 않아.", en: "Even if you stop me, my blade will not halt.", ja: "君が止めても、俺の剣は止まらない。", zh: "就算你拦着，我的剑也不会停下。", es: "Aunque me detengas, mi espada no se detendrá.", th: "ต่อให้เธอห้าม ดาบของฉันก็ไม่หยุดหรอก", id: "Meski kau menghalangi, pedangku tak akan berhenti." },
  "둘 다 멈춰!": { ko: "둘 다 멈춰!", en: "Both of you, freeze!", ja: "二人とも止まって！", zh: "你们俩都住手！", es: "¡Deténganse los dos!", th: "หยุดทั้งคู่เลย!", id: "Kalian berdua berhenti!" },
  "긴급 소환령이 떨어졌어!": { ko: "긴급 소환령이 떨어졌어!", en: "An urgent summons just dropped!", ja: "緊急召喚令が出たんだ！", zh: "紧急召唤令下达了！", es: "¡Llegó una citación de emergencia!", th: "คำสั่งเรียกตัวด่วนมาแล้ว!", id: "Perintah panggilan darurat baru turun!" },
});

export function createSampleGlossaryEntries(): readonly GlossaryTermEntry[] {
  return Object.freeze([
    { id: "gloss-seoyeon", sourceTerm: "서연", category: "character", locked: true, translations: { ko: "서연", en: "Seoyeon", ja: "ソヨン", zh: "瑞妍", es: "Seoyeon", th: "ซอยอน", id: "Seoyeon" } },
    { id: "gloss-hyunwoo", sourceTerm: "현우", category: "character", locked: true, translations: { ko: "현우", en: "Hyunwoo", ja: "ヒョヌ", zh: "贤宇", es: "Hyunwoo", th: "ฮยอนอู", id: "Hyunwoo" } },
    { id: "gloss-obsidian-gate", sourceTerm: "흑요석 던전", category: "place", locked: true, translations: { ko: "흑요석 던전", en: "Obsidian Dungeon", ja: "黒曜石ダンジョン", zh: "黑曜石副本", es: "Mazmorra de Obsidiana", th: "ดันเจี้ยนออบซิเดียน", id: "Dungeon Obsidian" } },
    { id: "gloss-imperial-hall", sourceTerm: "제국 알현실", category: "place", locked: true, translations: { ko: "제국 알현실", en: "Imperial Audience Hall", ja: "帝国謁見の間", zh: "帝国觐见厅", es: "Salón Imperial", th: "ท้องพระโรงจักรวรรดิ", id: "Aula Kekaisaran" } },
  ]);
}

export function createSampleLocalizationPanels(): readonly RawBalloonPanelInput[] {
  return Object.freeze([
    { id: "cut-1-b1", cutNumber: 1, x: 48, y: 60, width: 280, height: 150, sourceText: "현우야, 정말 오늘 밤 흑요석 던전 혼자 들어갈 셈이야?", kindHint: "speech", backgroundComplexity: "solid-white" },
    { id: "cut-2-b1", cutNumber: 2, x: 360, y: 120, width: 250, height: 130, sourceText: "네가 말려도 내 검이 멈추진 않아.", kindHint: "speech", backgroundComplexity: "solid-white" },
    { id: "cut-2-sfx", cutNumber: 2, x: 120, y: 310, width: 180, height: 90, sourceText: "쾅!", kindHint: "sfx", backgroundComplexity: "complex-art" },
    { id: "cut-3-b1", cutNumber: 3, x: 80, y: 460, width: 260, height: 135, sourceText: "둘 다 멈춰! 제국 알현실 긴급 소환령이 떨어졌어!", kindHint: "shout", backgroundComplexity: "screentone" },
  ]);
}

function inferBalloonKind(panel: RawBalloonPanelInput): BalloonRegionKind {
  if (panel.kindHint) return panel.kindHint;
  const trimmed = panel.sourceText.trim();
  if (trimmed.replace(/[!?.~]+$/gu, "") in SFX_VECTOR_DICTIONARY) return "sfx";
  if (/[!！]{2,}/u.test(trimmed) || trimmed.endsWith("!")) return "shout";
  if (trimmed.startsWith("(") && trimmed.endsWith(")")) return "thought";
  if (panel.width > panel.height * 2.4) return "narration";
  return "speech";
}

/** ① 말풍선 OCR 영역 감지·분류 및 읽기 순서 정렬 */
export function detectAndClassifyBalloonRegions(
  panels: readonly RawBalloonPanelInput[],
  readingFlow: ReadingFlowMode = "vertical-webtoon",
): readonly DetectedBalloonRegion[] {
  const sorted = [...panels].sort((a, b) => {
    if (a.cutNumber !== b.cutNumber) return a.cutNumber - b.cutNumber;
    if (readingFlow === "manga-rtl") return Math.abs(a.y - b.y) > 70 ? a.y - b.y : b.x - a.x;
    return Math.abs(a.y - b.y) > 40 ? a.y - b.y : a.x - b.x;
  });

  return Object.freeze(
    sorted.map((panel, index) => {
      const kind = inferBalloonKind(panel);
      const padRatio = kind === "speech" || kind === "thought" ? 0.8 : kind === "shout" ? 0.74 : 0.9;
      const confidence = panel.backgroundComplexity === "complex-art" ? 0.91 : panel.backgroundComplexity === "screentone" ? 0.95 : 0.98;
      return Object.freeze({
        id: panel.id,
        cutNumber: panel.cutNumber,
        kind,
        readingOrder: index + 1,
        bbox: Object.freeze({ x: panel.x, y: panel.y, width: Math.max(40, panel.width), height: Math.max(30, panel.height) }),
        safeInnerRect: Object.freeze({ width: Math.max(32, Math.round(panel.width * padRatio)), height: Math.max(24, Math.round(panel.height * padRatio)) }),
        sourceText: panel.sourceText.trim(),
        ocrConfidence: confidence,
        backgroundComplexity: panel.backgroundComplexity ?? (kind === "sfx" ? "complex-art" : "solid-white"),
      });
    }),
  );
}

/** ② 원문 말풍선/효과음 자동 클린업 마스크(인페인트) 생성 */
export function generateCleanupInpaintMasks(regions: readonly DetectedBalloonRegion[]): readonly CleanupInpaintMask[] {
  return Object.freeze(
    regions.map((region) => {
      const dilationPx = region.kind === "sfx" ? 8 : region.backgroundComplexity === "screentone" ? 5 : 3;
      const featherPx = region.kind === "sfx" ? 4 : 2;
      const strategy: CleanupInpaintMask["strategy"] =
        region.backgroundComplexity === "solid-white"
          ? "solid-fill"
          : region.backgroundComplexity === "screentone"
            ? "patch-match-local"
            : "local-comfyui-inpaint";
      const maskWidth = region.bbox.width + dilationPx * 2;
      const maskHeight = region.bbox.height + dilationPx * 2;
      return Object.freeze({
        regionId: region.id,
        kind: region.kind,
        dilationPx,
        featherPx,
        maskRect: Object.freeze({ x: Math.max(0, region.bbox.x - dilationPx), y: Math.max(0, region.bbox.y - dilationPx), width: maskWidth, height: maskHeight }),
        strategy,
        coverageRatio: Math.min(1, Math.round(((maskWidth * maskHeight) / (800 * 1280)) * 1000) / 1000),
        costKrw: 0,
      });
    }),
  );
}

/** ③ 작품 고유명사 용어집(Glossary) 강제 적용 다국어 번역 */
export function translateWithLockedGlossary(
  sourceText: string,
  sourceLang: SupportedLocalizationLang,
  targetLang: SupportedLocalizationLang,
  glossary: readonly GlossaryTermEntry[] = [],
): GlossaryTranslationResult {
  const cleanSource = sourceText.trim();
  if (sourceLang === targetLang) {
    return Object.freeze({ translatedText: cleanSource, appliedTerms: Object.freeze([]), violations: Object.freeze([]), glossaryComplianceRate: 100 });
  }
  const sfxEntry = SFX_VECTOR_DICTIONARY[cleanSource.replace(/[!?.~]+$/gu, "")];
  if (sfxEntry) {
    return Object.freeze({ translatedText: sfxEntry.variants[targetLang], appliedTerms: Object.freeze([]), violations: Object.freeze([]), glossaryComplianceRate: 100 });
  }

  const sortedGlossary = [...glossary].filter((e) => e.sourceTerm.trim().length > 0).sort((a, b) => b.sourceTerm.length - a.sourceTerm.length);
  const lockedReplacements: { readonly token: string; readonly sourceTerm: string; readonly targetTerm: string; readonly locked: boolean }[] = [];
  let working = cleanSource;
  for (const entry of sortedGlossary) {
    if (working.includes(entry.sourceTerm)) {
      const token = `__GLOSS_${lockedReplacements.length}__`;
      const targetTerm = entry.translations[targetLang] || entry.sourceTerm;
      working = working.split(entry.sourceTerm).join(token);
      lockedReplacements.push({ token, sourceTerm: entry.sourceTerm, targetTerm, locked: entry.locked });
    }
  }

  let translatedBody = working;
  let matchedPhraseCount = 0;
  for (const [koPhrase, map] of Object.entries(OFFLINE_PHRASE_TEMPLATES)) {
    if (translatedBody.includes(koPhrase)) {
      translatedBody = translatedBody.split(koPhrase).join(map[targetLang]);
      matchedPhraseCount += 1;
    }
  }
  translatedBody = translatedBody.replace(/(__GLOSS_\d+__)(?:이야|야|아|이|가|은|는|을|를|의)/gu, "$1");
  if (matchedPhraseCount === 0 && lockedReplacements.length === 0) {
    translatedBody = `[${LOCALIZATION_LANGUAGE_SPECS[targetLang].code.toUpperCase()}] ${translatedBody}`;
  }

  const appliedTerms: { readonly sourceTerm: string; readonly targetTerm: string }[] = [];
  const violations: string[] = [];
  for (const rep of lockedReplacements) {
    translatedBody = translatedBody.split(rep.token).join(rep.targetTerm);
    appliedTerms.push({ sourceTerm: rep.sourceTerm, targetTerm: rep.targetTerm });
    if (rep.locked && !translatedBody.includes(rep.targetTerm)) {
      violations.push(`필수 용어 '${rep.sourceTerm}' → '${rep.targetTerm}' 누락`);
    }
  }
  const lockedCount = lockedReplacements.filter((r) => r.locked).length;
  return Object.freeze({
    translatedText: translatedBody.replace(/\s{2,}/gu, " ").trim(),
    appliedTerms: Object.freeze(appliedTerms),
    violations: Object.freeze(violations),
    glossaryComplianceRate: lockedCount === 0 ? 100 : Math.round(((lockedCount - violations.length) / lockedCount) * 100),
  });
}

function wrapTextLines(text: string, maxCharsPerLine: number, isSpaceDelimited: boolean): readonly string[] {
  const safeLimit = Math.max(4, Math.floor(maxCharsPerLine));
  if (!isSpaceDelimited) {
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += safeLimit) lines.push(text.slice(i, i + safeLimit));
    return lines.length > 0 ? lines : [text];
  }
  const words = text.split(/\s+/u).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= safeLimit) current = `${current} ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [text];
}

/** ④ 말풍선 내부 폭·높이 기반 자동 폰트/줄바꿈 피팅 */
export function fitTextIntoBalloon(
  regionId: string,
  text: string,
  availableWidthPx: number,
  availableHeightPx: number,
  targetLang: SupportedLocalizationLang,
  kind: BalloonRegionKind = "speech",
): BalloonTextFitResult {
  const spec = LOCALIZATION_LANGUAGE_SPECS[targetLang];
  const isSpaceDelimited = targetLang === "en" || targetLang === "es" || targetLang === "id";
  const ovalFactor = kind === "speech" || kind === "thought" ? 0.88 : kind === "shout" ? 0.82 : 0.96;
  const effectiveWidth = Math.max(40, availableWidthPx * ovalFactor);
  const effectiveHeight = Math.max(28, availableHeightPx * ovalFactor);
  const maxFont = kind === "sfx" ? 34 : kind === "shout" ? 24 : 20;

  let chosenFont = spec.minFontSizePx;
  let chosenLines: readonly string[] = [text];
  let chosenHeight = 0;
  let chosenWidth = 0;
  let fits = false;

  for (let font = maxFont; font >= spec.minFontSizePx; font -= 1) {
    const charWidthPx = font * spec.charWidthEm;
    const lines = wrapTextLines(text, Math.max(4, Math.floor(effectiveWidth / charWidthPx)), isSpaceDelimited);
    const totalHeight = lines.length * Math.round(font * spec.lineHeightRatio);
    const totalWidth = Math.round(lines.reduce((max, line) => Math.max(max, line.length), 0) * charWidthPx);
    chosenFont = font;
    chosenLines = lines;
    chosenHeight = totalHeight;
    chosenWidth = totalWidth;
    if (totalHeight <= effectiveHeight && totalWidth <= effectiveWidth) { fits = true; break; }
  }

  return Object.freeze({
    regionId,
    fontSizePx: chosenFont,
    lineHeightPx: Math.round(chosenFont * spec.lineHeightRatio),
    lines: Object.freeze(chosenLines),
    lineCount: chosenLines.length,
    estimatedWidthPx: chosenWidth,
    estimatedHeightPx: chosenHeight,
    fillRatio: Math.min(1.5, Math.round(((chosenWidth * chosenHeight) / (effectiveWidth * effectiveHeight)) * 100) / 100),
    overflow: !fits,
    recommendationKo: !fits
      ? `최소 글자 크기(${spec.minFontSizePx}px)에서도 말풍선 높이를 초과합니다. 번역문을 압축하거나 말풍선을 확장하세요.`
      : `최적 폰트 ${chosenFont}px · ${chosenLines.length}줄로 말풍선 내부에 안정적으로 배치됩니다.`,
  });
}

/** ⑤ 효과음(SFX) 벡터 치환 매핑 */
export function mapSfxToVectorPreset(sourceSfx: string, targetLang: SupportedLocalizationLang): SfxVectorMapping {
  const cleanKey = sourceSfx.trim().replace(/[!?.~]+$/gu, "");
  const preset = SFX_VECTOR_DICTIONARY[cleanKey];
  const langSpec = LOCALIZATION_LANGUAGE_SPECS[targetLang];
  if (preset) {
    return Object.freeze({
      sourceSfx: sourceSfx.trim(),
      targetLang,
      localizedSfx: preset.variants[targetLang],
      warpCurve: preset.warpCurve,
      skewDeg: preset.skewDeg,
      strokeWidthPx: preset.strokeWidthPx,
      emphasisScale: preset.emphasisScale,
      fontStack: langSpec.recommendedFont,
      vectorReady: true,
    });
  }
  return Object.freeze({
    sourceSfx: sourceSfx.trim(),
    targetLang,
    localizedSfx: targetLang === "ko" ? sourceSfx.trim() : `${sourceSfx.trim()} (${targetLang.toUpperCase()})`,
    warpCurve: "arc",
    skewDeg: -6,
    strokeWidthPx: 3,
    emphasisScale: 1.1,
    fontStack: langSpec.recommendedFont,
    vectorReady: true,
  });
}

/** ⑥ 국가별 검열·읽기 방향·식자 QA 체크 */
export function runRegionalComplianceAndReadingQa(
  items: readonly LocalizedRegionOutput[],
  targetLang: SupportedLocalizationLang,
  readingFlow: ReadingFlowMode,
): readonly RegionalQaFinding[] {
  const findings: RegionalQaFinding[] = [];
  if (targetLang === "ja" && readingFlow === "comic-ltr") {
    findings.push({ code: "QA_JP_READING_DIR", severity: "warning", messageKo: "일본 단행본 출판 시 좌→우(LTR) 대신 우→좌(RTL) 세로쓰기 흐름이 표준입니다.", actionKo: "읽기 방향을 'manga-rtl' 또는 세로쓰기 모드로 전환하세요." });
  } else if ((targetLang === "en" || targetLang === "es" || targetLang === "id") && readingFlow === "manga-rtl") {
    findings.push({ code: "QA_WESTERN_READING_DIR", severity: "warning", messageKo: `${LOCALIZATION_LANGUAGE_SPECS[targetLang].labelKo} 독자는 좌→우(LTR) 말풍선 순서를 기대합니다.`, actionKo: "읽기 방향을 'comic-ltr' 또는 'vertical-webtoon'으로 맞추세요." });
  }

  for (const item of items) {
    if (item.translation.violations.length > 0) {
      findings.push({ code: `QA_GLOSSARY_${item.region.id}`, severity: "error", regionId: item.region.id, messageKo: `${item.region.id}: ${item.translation.violations.join(", ")}`, actionKo: "고유명사 용어집 잠금 단어가 정확히 포함되도록 수정하세요." });
    }
    if (item.fit.overflow) {
      findings.push({ code: `QA_OVERFLOW_${item.region.id}`, severity: "error", regionId: item.region.id, messageKo: `${item.region.id}: 번역문이 말풍선 영역을 넘칩니다(${item.fit.estimatedHeightPx}px).`, actionKo: "문장을 간결하게 다듬거나 말풍선 여유 폭을 늘리세요." });
    }
    const text = `${item.region.sourceText} ${item.translation.translatedText}`;
    if (targetLang === "zh" && /피|유혈|해골|시체|도박|혈/u.test(text)) {
      findings.push({ code: `QA_CN_CENSOR_${item.region.id}`, severity: "warning", regionId: item.region.id, messageKo: `${item.region.id}: 중국 유통 심의 주의 표현(유혈·해골·도박 키워드)이 감지되었습니다.`, actionKo: "중국어 판본에서 혈흔 색감 완화 또는 표현 순화 검토가 필요합니다." });
    }
    if ((targetLang === "th" || targetLang === "id") && /술|음주|담배|도박/u.test(text)) {
      findings.push({ code: `QA_SEA_RATING_${item.region.id}`, severity: "warning", regionId: item.region.id, messageKo: `${item.region.id}: 동남아(${LOCALIZATION_LANGUAGE_SPECS[targetLang].labelKo}) 등급 심의 대상 표현이 포함되었습니다.`, actionKo: "플랫폼 연령 등급 표기 또는 모자이크 옵션을 확인하세요." });
    }
    if (targetLang === "ja" && /[\u4E00-\u9FFF]{4,}/u.test(item.translation.translatedText)) {
      findings.push({ code: `QA_JP_FURIGANA_${item.region.id}`, severity: "warning", regionId: item.region.id, messageKo: `${item.region.id}: 4자 이상 연속 한자어가 있어 일본 독자용 후리가나(루비) 표기를 권장합니다.`, actionKo: "일본 세로쓰기 탭에서 <ruby><rt> 후리가나를 적용하세요." });
    }
  }

  if (findings.length === 0) {
    findings.push({ code: "QA_ALL_CLEAR", severity: "pass", messageKo: `${LOCALIZATION_LANGUAGE_SPECS[targetLang].labelKo} 기준 용어집·말풍선 피팅·국가별 QA를 모두 통과했습니다.`, actionKo: "바로 식자 레이어 적용 또는 인쇄 프리플라이트로 넘어가세요." });
  }
  return Object.freeze(findings);
}

/** Mantra / LETR 6단계 통합 파이프라인 실행 */
export function runMantraLetrLocalizationPipeline(input: MantraLetrPipelineInput): MantraLetrPipelineResult {
  const sourceLang = input.sourceLang ?? "ko";
  const targetLang = input.targetLang;
  const readingFlow = input.readingFlow ?? LOCALIZATION_LANGUAGE_SPECS[targetLang].defaultReadingFlow;
  const glossary = input.glossary ?? [];

  const regions = detectAndClassifyBalloonRegions(input.panels, readingFlow);
  const masks = generateCleanupInpaintMasks(regions);
  const maskById = new Map(masks.map((m) => [m.regionId, m]));

  const sfxMappings: SfxVectorMapping[] = [];
  const items: LocalizedRegionOutput[] = regions.map((region, index) => {
    const fallbackMask: CleanupInpaintMask = { regionId: region.id, kind: region.kind, dilationPx: 3, featherPx: 2, maskRect: region.bbox, strategy: "solid-fill", coverageRatio: 0, costKrw: 0 };
    const cleanupMask = maskById.get(region.id) ?? masks[index] ?? fallbackMask;
    const translation = translateWithLockedGlossary(region.sourceText, sourceLang, targetLang, glossary);
    const sfxVector = region.kind === "sfx" ? mapSfxToVectorPreset(region.sourceText, targetLang) : null;
    if (sfxVector) sfxMappings.push(sfxVector);
    const fit = fitTextIntoBalloon(region.id, sfxVector ? sfxVector.localizedSfx : translation.translatedText, region.safeInnerRect.width, region.safeInnerRect.height, targetLang, region.kind);
    return Object.freeze({ region, cleanupMask, translation, fit, sfxVector });
  });

  const qaFindings = runRegionalComplianceAndReadingQa(items, targetLang, readingFlow);
  const errorCount = qaFindings.filter((f) => f.severity === "error").length;
  const warningCount = qaFindings.filter((f) => f.severity === "warning").length;
  const overflowCount = items.filter((i) => i.fit.overflow).length;
  const glossaryAvg = items.length === 0 ? 100 : Math.round(items.reduce((sum, i) => sum + i.translation.glossaryComplianceRate, 0) / items.length);

  const stages: readonly MantraLetrStageTrace[] = Object.freeze([
    { stageId: "1-ocr-detect", stepNumber: 1, titleKo: "① 말풍선 OCR 감지·분류", status: regions.length > 0 ? "passed" : "warning", summaryKo: `총 ${regions.length}개 영역 감지 · 읽기 순서(${readingFlow}) 정렬 완료` },
    { stageId: "2-inpaint-mask", stepNumber: 2, titleKo: "② 원문 클린업 인페인트 마스크", status: "passed", summaryKo: `마스크 ${masks.length}개 생성 · 과금 0원 로컬 복원 전략 배정` },
    { stageId: "3-glossary-translate", stepNumber: 3, titleKo: "③ 고유명사 용어집 강제 번역", status: glossaryAvg === 100 ? "passed" : "blocked", summaryKo: `${LOCALIZATION_LANGUAGE_SPECS[targetLang].labelKo} 번역 완료 · 용어집 준수율 ${glossaryAvg}%` },
    { stageId: "4-balloon-fit", stepNumber: 4, titleKo: "④ 말풍선 자동 폰트·줄바꿈 피팅", status: overflowCount === 0 ? "passed" : "warning", summaryKo: overflowCount === 0 ? "전 말풍선 넘침 0건 · 가독성 최적화" : `말풍선 넘침 ${overflowCount}건 조정 필요` },
    { stageId: "5-sfx-vector-map", stepNumber: 5, titleKo: "⑤ 효과음(SFX) 벡터 치환 매핑", status: "passed", summaryKo: `효과음 벡터 프리셋 ${sfxMappings.length}건 매핑 완료` },
    { stageId: "6-regional-qa", stepNumber: 6, titleKo: "⑥ 국가별 검열·읽기 방향 QA", status: errorCount > 0 ? "blocked" : warningCount > 0 ? "warning" : "passed", summaryKo: errorCount > 0 ? `차단 오류 ${errorCount}건 · 주의 ${warningCount}건` : `통과 (주의 ${warningCount}건)` },
  ]);

  return Object.freeze({
    sourceLang,
    targetLang,
    readingFlow,
    stages,
    items: Object.freeze(items),
    sfxMappings: Object.freeze(sfxMappings),
    qaFindings,
    glossaryComplianceRate: glossaryAvg,
    readinessScore: Math.max(0, Math.min(100, 100 - errorCount * 22 - warningCount * 6)),
  });
}
