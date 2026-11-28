/**
 * 7개 로케일 웹툰 효과음(SFX) 시맨틱 사전 및 브러시 질감 벡터 합성기 (Wave 77).
 *
 * - 지원 로케일(7종): `ko`, `ja`, `en`, `fr`, `es`, `zh-Hant`, `th`
 * - 정통 웹툰 의성어·의태어 20종 카탈로그 + 커스텀 한국어 SFX 결정론적 자모 음차 폴백
 * - 원작 SFX의 시각 운동 에너지(아크 곡률, 기울기, 사선 전단, 필압 굵기 프로파일, 할로 두께,
 *   색상 그라데이션, 5종 브러시 질감) 보존 및 보호 말풍선 회피(`balloonOverlapAreaPx === 0`) 보장
 * - 세로쓰기(`vertical-rl`)는 `ko`/`ja`/`zh-Hant`에서만 유지, `en`/`fr`/`es`/`th`는 자동 가로 정규화
 */

import type { Point2D, Rect2D } from "./sfx-mask-and-cleanplate-inpainter";

export type SfxLocale = "ko" | "ja" | "en" | "fr" | "es" | "zh-Hant" | "th";
export const SUPPORTED_SFX_LOCALES: readonly SfxLocale[] = ["ko", "ja", "en", "fr", "es", "zh-Hant", "th"];
export const VERTICAL_WRITING_LOCALES: readonly SfxLocale[] = ["ko", "ja", "zh-Hant"];

export type SfxWritingMode = "horizontal-tb" | "vertical-rl";
export type SfxBrushTextureStyle =
  | "dry-brush-impact"
  | "tremble-horror"
  | "soft-romance-glow"
  | "speed-slash-ink"
  | "metallic-clang";
export type SfxMatchKind = "exact" | "alias" | "fuzzy-root" | "transliterated-fallback";

export interface ComicSfxLexiconEntry {
  readonly categoryId: string;
  readonly semanticLabelKo: string;
  readonly recommendedBrushStyle: SfxBrushTextureStyle;
  readonly energyIntensity: number;
  readonly koAliases: readonly string[];
  readonly translations: Readonly<Record<SfxLocale, string>>;
}

export interface LocalizedSfxLexiconResult {
  readonly sourceKoText: string;
  readonly locale: SfxLocale;
  readonly localizedText: string;
  readonly categoryId: string;
  readonly semanticLabelKo: string;
  readonly matchKind: SfxMatchKind;
  readonly recommendedBrushStyle: SfxBrushTextureStyle;
  readonly energyIntensity: number;
  readonly supportsVerticalWriting: boolean;
  readonly confidence: number;
}

export interface SfxStrokeWeightProfile {
  readonly startScale: number;
  readonly peakScale: number;
  readonly endScale: number;
}

export interface SfxColorGradientSpec {
  readonly startColor: string;
  readonly endColor: string;
  readonly angleDeg: number;
  readonly haloColor: string;
}

export interface OriginalSfxVisualEnergySpec {
  readonly sourceKoText: string;
  readonly originalBounds: Rect2D;
  readonly safeEnvelope: Rect2D;
  readonly protectedSpeechBalloons: readonly Rect2D[];
  readonly balloonClearancePx?: number;
  readonly requestedWritingMode?: SfxWritingMode;
  readonly arcCurvature?: number;
  readonly tiltAngleDeg?: number;
  readonly slantShearDeg?: number;
  readonly strokeWeightProfile?: SfxStrokeWeightProfile;
  readonly outlineHaloThicknessPx?: number;
  readonly colorGradient?: SfxColorGradientSpec;
  readonly brushStyle?: SfxBrushTextureStyle;
  readonly preferredFontSizePx?: number;
}

export interface VectorArcCurveSpec {
  readonly start: Point2D;
  readonly control: Point2D;
  readonly end: Point2D;
  readonly curvature: number;
}

export interface BrushVectorStrokePath {
  readonly pathId: string;
  readonly role:
    | "dry-brush-streak"
    | "impact-spike"
    | "tremble-aura"
    | "romance-sparkle"
    | "speed-slash"
    | "metallic-glint";
  readonly points: readonly Point2D[];
  readonly closed: boolean;
  readonly strokeWidthPx: number;
  readonly opacity: number;
}

export interface SynthesizedSfxGlyphNode {
  readonly glyphIndex: number;
  readonly character: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly fontSizePx: number;
  readonly rotationDeg: number;
  readonly slantShearDeg: number;
  readonly weightScale: number;
  readonly bounds: Rect2D;
}

export interface LocalizedSfxVectorLayer {
  readonly locale: SfxLocale;
  readonly sourceKoText: string;
  readonly localizedText: string;
  readonly categoryId: string;
  readonly matchKind: SfxMatchKind;
  readonly brushStyle: SfxBrushTextureStyle;
  readonly requestedWritingMode: SfxWritingMode;
  readonly resolvedWritingMode: SfxWritingMode;
  readonly writingModeNormalized: boolean;
  readonly tiltAngleDeg: number;
  readonly slantShearDeg: number;
  readonly strokeWeightProfile: SfxStrokeWeightProfile;
  readonly outlineHaloThicknessPx: number;
  readonly colorGradient: SfxColorGradientSpec;
  readonly arcPath: VectorArcCurveSpec;
  readonly placedBounds: Rect2D;
  readonly safeEnvelope: Rect2D;
  readonly glyphs: readonly SynthesizedSfxGlyphNode[];
  readonly brushStrokePaths: readonly BrushVectorStrokePath[];
  readonly balloonOverlapAreaPx: number;
  readonly fitsSafeEnvelope: boolean;
  readonly clippedGlyphCount: number;
}

function sfxEntry(
  categoryId: string,
  semanticLabelKo: string,
  recommendedBrushStyle: SfxBrushTextureStyle,
  energyIntensity: number,
  koAliases: readonly string[],
  translations: Readonly<Record<SfxLocale, string>>,
): ComicSfxLexiconEntry {
  return { categoryId, semanticLabelKo, recommendedBrushStyle, energyIntensity, koAliases, translations };
}

/** 7개 로케일 정통 웹툰 의성어·의태어 사전(20종). */
export const COMIC_SFX_LEXICON: readonly ComicSfxLexiconEntry[] = [
  sfxEntry("impact-explosion", "폭발·대충격", "dry-brush-impact", 1.0, ["콰과광", "쾅", "쿠과광", "콰광", "꽈광"], { ko: "콰과광", ja: "ドゴォン", en: "BOOM", fr: "BOUM", es: "¡BUM!", "zh-Hant": "轟隆隆", th: "ตูมมม!" }),
  sfxEntry("heartbeat", "심장 박동·설렘", "soft-romance-glow", 0.55, ["두근두근", "두근", "콩닥콩닥", "쿵쾅"], { ko: "두근두근", ja: "ドキドキ", en: "BA-DUMP", fr: "BA-BOUM", es: "TUC-TUC", "zh-Hant": "撲通撲通", th: "ตึกตัก" }),
  sfxEntry("swift-whoosh", "고속 질주·베기", "speed-slash-ink", 0.85, ["휙", "슈욱", "쉭", "휘익", "슈악"], { ko: "휙", ja: "シュッ", en: "WHOOSH", fr: "VROUF", es: "¡FUUUSH!", "zh-Hant": "咻", th: "ฟิ้วว" }),
  sfxEntry("bright-flash", "섬광·번쩍임", "speed-slash-ink", 0.9, ["번쩍", "파밧", "번쩍!", "파앗"], { ko: "번쩍", ja: "ピカッ", en: "FLASH", fr: "FLASH", es: "¡DESTELLO!", "zh-Hant": "唰", th: "แวบ!" }),
  sfxEntry("metallic-click", "금속 잠금·방아쇠", "metallic-clang", 0.65, ["철컥", "딸깍", "찰칵", "철커덕"], { ko: "철컥", ja: "ガチャ", en: "CLICK", fr: "CLIC", es: "¡CLIC!", "zh-Hant": "喀嚓", th: "แกร๊ก" }),
  sfxEntry("collapse-crash", "붕괴·와르르", "dry-brush-impact", 0.95, ["와르르", "우르르", "와장창", "우당탕"], { ko: "와르르", ja: "ガラガラ", en: "CRASH", fr: "CRAC", es: "¡CRAS!", "zh-Hant": "嘩啦啦", th: "โครม!" }),
  sfxEntry("quiet-slide", "미끄러짐·스르륵", "soft-romance-glow", 0.4, ["스르륵", "스륵", "스르르", "쓰윽"], { ko: "스르륵", ja: "スッ", en: "SLIDE", fr: "GLISSE", es: "SLIP", "zh-Hant": "唰拉", th: "ฟืดด" }),
  sfxEntry("electric-zap", "전격·찌릿함", "metallic-clang", 0.88, ["찌릿", "파직", "찌리릿", "지지직"], { ko: "찌릿", ja: "ビリッ", en: "ZAP", fr: "ZZZT", es: "¡ZAS!", "zh-Hant": "滋啦", th: "เปรี๊ยะ!" }),
  sfxEntry("crowd-murmur", "군중 소란·웅성임", "tremble-horror", 0.5, ["웅성웅성", "수군수군", "웅성", "술렁"], { ko: "웅성웅성", ja: "ザワザワ", en: "MURMUR", fr: "BZZZ", es: "MURMULLO", "zh-Hant": "吵吵嚷嚷", th: "ซุบซิบ" }),
  sfxEntry("water-drip", "물방울·눈물 떨어짐", "soft-romance-glow", 0.35, ["뚝", "똑", "뚝뚝", "똑똑"], { ko: "뚝", ja: "ポタッ", en: "DRIP", fr: "PLOC", es: "PLIC", "zh-Hant": "滴答", th: "ติ๋ง" }),
  sfxEntry("rattle-clatter", "덜컹거림·진동", "metallic-clang", 0.72, ["덜컹", "덜커덩", "달그락", "덜컥"], { ko: "덜컹", ja: "ガタン", en: "RATTLE", fr: "CLAC", es: "CLAC", "zh-Hant": "哐噹", th: "กึกกัก" }),
  sfxEntry("steam-hiss", "증기·압력 분출", "speed-slash-ink", 0.7, ["푸슛", "치이익", "피식", "푸쉬익"], { ko: "푸슛", ja: "プシュー", en: "HISS", fr: "PSCHITT", es: "PSSS", "zh-Hant": "嘶——", th: "ฟู่!" }),
  sfxEntry("sharp-slap", "찰싹·타격음", "dry-brush-impact", 0.9, ["찰싹", "짝", "철썩", "짝!"], { ko: "찰싹", ja: "パチン", en: "SLAP", fr: "PAF", es: "¡PLAF!", "zh-Hant": "啪", th: "เพียะ!" }),
  sfxEntry("ominous-rumble", "불길한 지진·위압감", "tremble-horror", 0.92, ["우르릉", "쿠르릉", "고고고", "우르르릉"], { ko: "우르릉", ja: "ゴゴゴ", en: "RUMBLE", fr: "GRRR", es: "RETUMBA", "zh-Hant": "隆隆隆", th: "ครืนน" }),
  sfxEntry("radiant-sparkle", "반짝임·광채", "soft-romance-glow", 0.45, ["반짝", "반짝반짝", "샤랄라", "블링"], { ko: "반짝", ja: "キラキラ", en: "SPARKLE", fr: "BRILLE", es: "BRILLO", "zh-Hant": "閃亮亮", th: "วิ้ง!" }),
  sfxEntry("heavy-rain-pour", "폭우·쏟아짐", "speed-slash-ink", 0.78, ["쏴아아", "주룩주룩", "쏴아", "후두둑"], { ko: "쏴아아", ja: "ザーッ", en: "POUR", fr: "PLUIE", es: "CHUAA", "zh-Hant": "嘩啦啦", th: "ซ่าาา" }),
  sfxEntry("heavy-thud", "묵직한 낙하·충돌", "dry-brush-impact", 0.88, ["쿵", "퍽", "탁", "둠", "쿵!"], { ko: "쿵", ja: "ドン", en: "THUD", fr: "BOUM", es: "¡PUM!", "zh-Hant": "咚", th: "ตุ้บ!" }),
  sfxEntry("weary-sigh", "한숨·안도", "soft-romance-glow", 0.3, ["하아", "후우", "한숨", "하아아"], { ko: "하아", ja: "ハァ", en: "SIGH", fr: "SOUPIR", es: "BUF", "zh-Hant": "呼", th: "เฮ้อ" }),
  sfxEntry("tremble-shiver", "공포·분노의 떨림", "tremble-horror", 0.68, ["부들부들", "바들바들", "덜덜", "부르르"], { ko: "부들부들", ja: "ブルブル", en: "TREMBLE", fr: "BRRR", es: "TEMBLOR", "zh-Hant": "發抖", th: "กึกกึก" }),
  sfxEntry("door-slam", "문 열림·거센 닫힘", "dry-brush-impact", 0.86, ["벌컥", "쾅!", "드르륵", "탁!"], { ko: "벌컥", ja: "バタン", en: "SLAM", fr: "BAM", es: "¡ZAS!", "zh-Hant": "砰", th: "ปัง!" }),
];

const CHOSEONG_ROMAN = ["G", "KK", "N", "D", "TT", "R", "M", "B", "PP", "S", "SS", "", "J", "JJ", "CH", "K", "T", "P", "H"];
const JUNGSEONG_ROMAN = ["A", "AE", "YA", "YAE", "EO", "E", "YEO", "YE", "O", "WA", "WAE", "OE", "YO", "U", "WO", "WE", "WI", "YU", "EU", "UI", "I"];
const JONGSEONG_ROMAN = ["", "K", "K", "K", "N", "N", "N", "T", "L", "K", "M", "P", "L", "L", "P", "L", "M", "P", "P", "T", "T", "NG", "T", "T", "K", "T", "P", "T"];
const CHOSEONG_KANA = [
  ["ガ", "ギ", "グ", "ゲ", "ゴ"], ["カ", "キ", "ク", "ケ", "コ"], ["ナ", "ニ", "ヌ", "ネ", "ノ"], ["ダ", "ヂ", "ヅ", "デ", "ド"],
  ["タ", "チ", "ツ", "テ", "ト"], ["ラ", "リ", "ル", "レ", "ロ"], ["マ", "ミ", "ム", "メ", "モ"], ["バ", "ビ", "ブ", "ベ", "ボ"],
  ["パ", "ピ", "プ", "ペ", "ポ"], ["サ", "シ", "ス", "セ", "ソ"], ["ザ", "ジ", "ズ", "ゼ", "ゾ"], ["ア", "イ", "ウ", "エ", "オ"],
  ["ジャ", "ジ", "ジュ", "ジェ", "ジョ"], ["チャ", "チ", "チュ", "チェ", "チョ"], ["チャ", "チ", "チュ", "チェ", "チョ"], ["カ", "キ", "ク", "ケ", "コ"],
  ["タ", "チ", "ツ", "テ", "ト"], ["パ", "ピ", "プ", "ペ", "ポ"], ["ハ", "ヒ", "フ", "ヘ", "ホ"],
];
const JUNGSEONG_VOWEL_IDX = [0, 3, 0, 3, 4, 3, 4, 3, 4, 0, 3, 3, 4, 2, 4, 3, 1, 2, 2, 1, 1];
const ZHHANT_SOUND_CHARS = ["啪", "轟", "咻", "嘎", "嗡", "咚", "唰", "嘶", "咚", "嚓", "砰", "嘩"];
const CHOSEONG_THAI = ["ก", "ก", "น", "ด", "ต", "ร", "ม", "บ", "ป", "ซ", "ซ", "อ", "จ", "จ", "ช", "ค", "ท", "พ", "ฮ"];
const JUNGSEONG_THAI = ["า", "ี", "ู", "เ", "อ"];

const normalizeSfxKey = (raw: string): string => raw.trim().replace(/\s+/gu, "").replace(/[~!?.…]+$/gu, "");

function transliterateHangulSyllable(code: number, locale: SfxLocale): string {
  const offset = code - 0xac00;
  const cho = Math.floor(offset / 588);
  const jung = Math.floor((offset % 588) / 28);
  const jong = offset % 28;
  const vIdx = JUNGSEONG_VOWEL_IDX[jung] ?? 0;
  if (locale === "ja") {
    const row = CHOSEONG_KANA[cho] ?? CHOSEONG_KANA[11];
    const base = (row ? row[vIdx] : "ア") ?? "ア";
    const coda = jong === 0 ? "" : jong === 4 || jong === 16 || jong === 21 ? "ン" : "ッ";
    return `${base}${coda}`;
  }
  if (locale === "zh-Hant") return ZHHANT_SOUND_CHARS[(cho * 3 + jung + jong) % ZHHANT_SOUND_CHARS.length] ?? "轟";
  if (locale === "th") {
    const coda = jong === 0 ? "" : jong === 21 ? "ง" : jong === 4 ? "น" : "ก";
    return `${CHOSEONG_THAI[cho] ?? "อ"}${JUNGSEONG_THAI[vIdx] ?? "า"}${coda}`;
  }
  return `${CHOSEONG_ROMAN[cho] ?? ""}${JUNGSEONG_ROMAN[jung] ?? "A"}${JONGSEONG_ROMAN[jong] ?? ""}`;
}

function transliterateCustomSfx(sourceKoText: string, locale: SfxLocale): string {
  const trimmed = sourceKoText.trim();
  if (trimmed.length === 0) return locale === "ko" ? "효과음" : "SFX";
  if (locale === "ko") return trimmed;
  const pieces: string[] = [];
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed.charAt(i);
    const code = trimmed.charCodeAt(i);
    if (code >= 0xac00 && code <= 0xd7a3) pieces.push(transliterateHangulSyllable(code, locale));
    else if (/[A-Za-z0-9!?-]/u.test(ch)) pieces.push(ch.toUpperCase());
  }
  const clean = pieces.length > 0 ? pieces.join("") : "SFX";
  return locale === "es" ? (clean.startsWith("¡") ? clean : `¡${clean.replace(/!+$/gu, "")}!`) : clean;
}

export function localeSupportsVerticalWriting(locale: SfxLocale): boolean {
  return VERTICAL_WRITING_LOCALES.includes(locale);
}

/**
 * 한국어 효과음을 7개 로케일 중 하나로 시맨틱 매핑하거나 결정론적 자모 음차 폴백으로 변환한다.
 */
export function localizeComicSfxEntry(sourceKoText: string, locale: SfxLocale): LocalizedSfxLexiconResult {
  const trimmed = sourceKoText.trim();
  const normalized = normalizeSfxKey(trimmed);
  const supportsVerticalWriting = localeSupportsVerticalWriting(locale);

  const buildHit = (entry: ComicSfxLexiconEntry, matchKind: SfxMatchKind, confidence: number): LocalizedSfxLexiconResult => ({
    sourceKoText: trimmed,
    locale,
    localizedText: entry.translations[locale],
    categoryId: entry.categoryId,
    semanticLabelKo: entry.semanticLabelKo,
    matchKind,
    recommendedBrushStyle: entry.recommendedBrushStyle,
    energyIntensity: entry.energyIntensity,
    supportsVerticalWriting,
    confidence,
  });

  for (let i = 0; i < COMIC_SFX_LEXICON.length; i += 1) {
    const entry = COMIC_SFX_LEXICON[i];
    if (entry && normalizeSfxKey(entry.translations.ko) === normalized) return buildHit(entry, "exact", 1.0);
  }
  for (let i = 0; i < COMIC_SFX_LEXICON.length; i += 1) {
    const entry = COMIC_SFX_LEXICON[i];
    if (!entry) continue;
    for (let a = 0; a < entry.koAliases.length; a += 1) {
      if (normalizeSfxKey(entry.koAliases[a] ?? "") === normalized) return buildHit(entry, "alias", 0.94);
    }
  }
  for (let i = 0; i < COMIC_SFX_LEXICON.length; i += 1) {
    const entry = COMIC_SFX_LEXICON[i];
    if (!entry) continue;
    for (let a = 0; a < entry.koAliases.length; a += 1) {
      const alias = normalizeSfxKey(entry.koAliases[a] ?? "");
      if (alias.length >= 2 && normalized.includes(alias)) return buildHit(entry, "fuzzy-root", 0.82);
    }
  }
  return {
    sourceKoText: trimmed,
    locale,
    localizedText: transliterateCustomSfx(trimmed, locale),
    categoryId: "custom-creator-sfx",
    semanticLabelKo: "창작 커스텀 효과음",
    matchKind: "transliterated-fallback",
    recommendedBrushStyle: "dry-brush-impact",
    energyIntensity: 0.75,
    supportsVerticalWriting,
    confidence: 0.65,
  };
}

function rectIntersectionArea(a: Rect2D, b: Rect2D): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 <= x0 || y1 <= y0 ? 0 : (x1 - x0) * (y1 - y0);
}

function rectContains(outer: Rect2D, inner: Rect2D, eps = 1e-4): boolean {
  return (
    inner.x >= outer.x - eps &&
    inner.y >= outer.y - eps &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}

function computeFreeRectanglesAvoidingBalloons(
  safeEnvelope: Rect2D,
  balloons: readonly Rect2D[],
  clearancePx: number,
): Rect2D[] {
  let freeRects: Rect2D[] = [safeEnvelope];
  const pad = Math.max(0, clearancePx);
  for (let b = 0; b < balloons.length; b += 1) {
    const raw = balloons[b];
    if (!raw || raw.width <= 0 || raw.height <= 0) continue;
    const obs: Rect2D = { x: raw.x - pad, y: raw.y - pad, width: raw.width + pad * 2, height: raw.height + pad * 2 };
    const next: Rect2D[] = [];
    for (let r = 0; r < freeRects.length; r += 1) {
      const rect = freeRects[r];
      if (!rect) continue;
      if (rectIntersectionArea(rect, obs) <= 0) {
        next.push(rect);
        continue;
      }
      const rx1 = rect.x + rect.width;
      const ry1 = rect.y + rect.height;
      const ox1 = obs.x + obs.width;
      const oy1 = obs.y + obs.height;
      if (obs.x > rect.x) next.push({ x: rect.x, y: rect.y, width: obs.x - rect.x, height: rect.height });
      if (ox1 < rx1) next.push({ x: ox1, y: rect.y, width: rx1 - ox1, height: rect.height });
      if (obs.y > rect.y) next.push({ x: rect.x, y: rect.y, width: rect.width, height: obs.y - rect.y });
      if (oy1 < ry1) next.push({ x: rect.x, y: oy1, width: rect.width, height: ry1 - oy1 });
    }
    const pruned: Rect2D[] = [];
    for (let i = 0; i < next.length; i += 1) {
      const cand = next[i];
      if (!cand || cand.width < 2 || cand.height < 2) continue;
      let dominated = false;
      for (let j = 0; j < next.length; j += 1) {
        if (i === j) continue;
        const other = next[j];
        if (other && rectContains(other, cand) && (!rectContains(cand, other) || j < i)) {
          dominated = true;
          break;
        }
      }
      if (!dominated) pruned.push(cand);
    }
    freeRects = pruned;
  }
  return freeRects;
}

function estimateCharAdvanceRatio(ch: string, locale: SfxLocale): number {
  const code = ch.charCodeAt(0);
  if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0xac00 && code <= 0xd7a3)) {
    return 1.02;
  }
  if (locale === "th" && ((code >= 0x0e31 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e))) return 0.22;
  if (ch === " " || ch === "-" || ch === "!" || ch === "¡" || ch === "I") return 0.52;
  return ch === "W" || ch === "M" ? 0.92 : 0.74;
}

function splitLocaleGraphemes(text: string): string[] {
  const chars: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charAt(i);
    const code = text.charCodeAt(i);
    const isThaiMark = (code >= 0x0e31 && code <= 0x0e3a) || (code >= 0x0e47 && code <= 0x0e4e);
    if (isThaiMark && chars.length > 0) chars[chars.length - 1] = `${chars[chars.length - 1] ?? ""}${ch}`;
    else chars.push(ch);
  }
  return chars.length > 0 ? chars : ["!"];
}

function quadPoint(s: Point2D, c: Point2D, e: Point2D, t: number): Point2D {
  const inv = 1 - t;
  return { x: inv * inv * s.x + 2 * inv * t * c.x + t * t * e.x, y: inv * inv * s.y + 2 * inv * t * c.y + t * t * e.y };
}

function quadTangentDeg(s: Point2D, c: Point2D, e: Point2D, t: number): number {
  const dx = 2 * (1 - t) * (c.x - s.x) + 2 * t * (e.x - c.x);
  const dy = 2 * (1 - t) * (c.y - s.y) + 2 * t * (e.y - c.y);
  return Math.hypot(dx, dy) < 1e-6 ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
}

const hash01 = (seed: number): number => {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function synthesizeBrushAccentPaths(
  brushStyle: SfxBrushTextureStyle,
  bounds: Rect2D,
  arcPath: VectorArcCurveSpec,
  tiltAngleDeg: number,
  haloPx: number,
): BrushVectorStrokePath[] {
  const paths: BrushVectorStrokePath[] = [];
  const cx = bounds.x + bounds.width * 0.5;
  const cy = bounds.y + bounds.height * 0.5;
  const rx = Math.max(4, bounds.width * 0.48);
  const ry = Math.max(4, bounds.height * 0.46);
  const rad = (tiltAngleDeg * Math.PI) / 180;
  const cosA = Math.cos(rad);
  const sinA = Math.sin(rad);
  const clampPt = (px: number, py: number): Point2D => ({
    x: Number(Math.max(bounds.x, Math.min(bounds.x + bounds.width, px)).toFixed(2)),
    y: Number(Math.max(bounds.y, Math.min(bounds.y + bounds.height, py)).toFixed(2)),
  });

  if (brushStyle === "dry-brush-impact") {
    const spikePts: Point2D[] = [];
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const sc = i % 2 === 0 ? 1.0 : 0.72 + hash01(i + 3) * 0.12;
      spikePts.push(clampPt(cx + Math.cos(a) * rx * sc, cy + Math.sin(a) * ry * sc));
    }
    paths.push({ pathId: "impact-burst-ring", role: "impact-spike", points: spikePts, closed: true, strokeWidthPx: Number(Math.max(1.2, haloPx * 0.65).toFixed(2)), opacity: 0.78 });
    for (let s = 0; s < 2; s += 1) {
      const oy = (s === 0 ? -1 : 1) * ry * 0.38;
      const streak: Point2D[] = [];
      for (let k = 0; k <= 5; k += 1) {
        const p = quadPoint(arcPath.start, arcPath.control, arcPath.end, k / 5);
        const jit = (hash01(s * 17 + k) - 0.5) * Math.min(4, ry * 0.14);
        streak.push(clampPt(p.x - sinA * (oy + jit), p.y + cosA * (oy + jit)));
      }
      paths.push({ pathId: `dry-brush-streak-${String(s)}`, role: "dry-brush-streak", points: streak, closed: false, strokeWidthPx: Number(Math.max(1, haloPx * 0.45).toFixed(2)), opacity: 0.62 });
    }
  } else if (brushStyle === "tremble-horror") {
    for (let ring = 0; ring < 2; ring += 1) {
      const pts: Point2D[] = [];
      const shrink = ring === 0 ? 0.96 : 0.84;
      for (let i = 0; i < 20; i += 1) {
        const a = (i / 20) * Math.PI * 2;
        const jit = 0.9 + hash01(ring * 41 + i * 7) * 0.14;
        pts.push(clampPt(cx + Math.cos(a) * rx * shrink * jit, cy + Math.sin(a) * ry * shrink * jit));
      }
      paths.push({ pathId: `tremble-aura-${String(ring)}`, role: "tremble-aura", points: pts, closed: true, strokeWidthPx: Number(Math.max(1, haloPx * 0.5).toFixed(2)), opacity: ring === 0 ? 0.65 : 0.4 });
    }
  } else if (brushStyle === "soft-romance-glow") {
    const anchors: readonly Point2D[] = [
      { x: cx - rx * 0.72, y: cy - ry * 0.42 },
      { x: cx + rx * 0.74, y: cy - ry * 0.35 },
      { x: cx + rx * 0.52, y: cy + ry * 0.46 },
    ];
    const starR = Math.max(2.5, Math.min(rx, ry) * 0.22);
    for (let aIdx = 0; aIdx < anchors.length; aIdx += 1) {
      const anchor = anchors[aIdx];
      if (!anchor) continue;
      const star: Point2D[] = [];
      for (let i = 0; i < 8; i += 1) {
        const ang = (i / 8) * Math.PI * 2;
        const dist = i % 2 === 0 ? starR : starR * 0.32;
        star.push(clampPt(anchor.x + Math.cos(ang) * dist, anchor.y + Math.sin(ang) * dist));
      }
      paths.push({ pathId: `romance-sparkle-${String(aIdx)}`, role: "romance-sparkle", points: star, closed: true, strokeWidthPx: 1.2, opacity: 0.72 });
    }
  } else if (brushStyle === "speed-slash-ink") {
    for (let i = -1; i <= 1; i += 1) {
      const lat = i * ry * 0.42;
      const half = rx * (i === 0 ? 0.96 : 0.78);
      paths.push({
        pathId: `speed-slash-${String(i + 1)}`,
        role: "speed-slash",
        points: [
          clampPt(cx - cosA * half - sinA * lat, cy - sinA * half + cosA * lat),
          clampPt(cx + cosA * half - sinA * lat, cy + sinA * half + cosA * lat),
        ],
        closed: false,
        strokeWidthPx: Number(Math.max(1.1, (i === 0 ? 1.8 : 1.1) * (haloPx * 0.35 + 0.6)).toFixed(2)),
        opacity: i === 0 ? 0.75 : 0.48,
      });
    }
  } else {
    for (let m = 0; m < 2; m += 1) {
      const mx = cx + (m === 0 ? -0.68 : 0.68) * rx;
      const my = cy + (m === 0 ? -0.35 : 0.35) * ry;
      const dr = Math.max(3, Math.min(rx, ry) * 0.28);
      paths.push({
        pathId: `metallic-glint-${String(m)}`,
        role: "metallic-glint",
        points: [clampPt(mx, my - dr), clampPt(mx + dr * 0.75, my), clampPt(mx, my + dr), clampPt(mx - dr * 0.75, my)],
        closed: true,
        strokeWidthPx: 1.4,
        opacity: 0.82,
      });
    }
  }
  return paths;
}

/**
 * 원작 한국어 SFX의 운동 에너지와 보호 말풍선 제약을 유지하며 다국어 벡터 효과음 레이어를 합성한다.
 */
export function synthesizeLocalizedSfxVectorLayer(
  spec: OriginalSfxVisualEnergySpec,
  locale: SfxLocale,
): LocalizedSfxVectorLayer {
  const lexicon = localizeComicSfxEntry(spec.sourceKoText, locale);
  const requestedWritingMode: SfxWritingMode = spec.requestedWritingMode ?? "horizontal-tb";
  const resolvedWritingMode: SfxWritingMode =
    requestedWritingMode === "vertical-rl" && lexicon.supportsVerticalWriting ? "vertical-rl" : "horizontal-tb";
  const writingModeNormalized = requestedWritingMode !== resolvedWritingMode;

  const brushStyle: SfxBrushTextureStyle = spec.brushStyle ?? lexicon.recommendedBrushStyle;
  const arcCurvature = Math.max(-1, Math.min(1, spec.arcCurvature ?? 0.22));
  const tiltAngleDeg = Math.max(-45, Math.min(45, spec.tiltAngleDeg ?? -8));
  const slantShearDeg = Math.max(-28, Math.min(28, spec.slantShearDeg ?? -10));
  const strokeWeightProfile: SfxStrokeWeightProfile = spec.strokeWeightProfile ?? { startScale: 0.88, peakScale: 1.18, endScale: 0.92 };
  const baseHaloPx = Math.max(0.5, Math.min(16, spec.outlineHaloThicknessPx ?? 3.5));
  const colorGradient: SfxColorGradientSpec = spec.colorGradient ?? {
    startColor: "oklch(0.62 0.22 25)",
    endColor: "oklch(0.32 0.16 18)",
    angleDeg: 90,
    haloColor: "oklch(0.99 0.01 95)",
  };
  const clearancePx = Math.max(0, spec.balloonClearancePx ?? 4);

  const graphemes = splitLocaleGraphemes(lexicon.localizedText);
  const totalUnits =
    resolvedWritingMode === "vertical-rl"
      ? Math.max(1, graphemes.length * 1.06)
      : Math.max(1, graphemes.reduce((acc, g) => acc + estimateCharAdvanceRatio(g, locale), 0) + Math.max(0, graphemes.length - 1) * 0.08);

  const prefAspect = resolvedWritingMode === "vertical-rl" ? 1.25 / (totalUnits + 0.4) : (totalUnits + 0.4) / 1.35;
  const freeWithPad = computeFreeRectanglesAvoidingBalloons(spec.safeEnvelope, spec.protectedSpeechBalloons, clearancePx);
  const freeRects = freeWithPad.length > 0 ? freeWithPad : computeFreeRectanglesAvoidingBalloons(spec.safeEnvelope, spec.protectedSpeechBalloons, 0);

  const origCx = spec.originalBounds.x + spec.originalBounds.width * 0.5;
  const origCy = spec.originalBounds.y + spec.originalBounds.height * 0.5;
  const envDiag = Math.max(1, Math.hypot(spec.safeEnvelope.width, spec.safeEnvelope.height));
  const envArea = Math.max(1, spec.safeEnvelope.width * spec.safeEnvelope.height);

  let chosenRect: Rect2D = freeRects[0] ?? spec.safeEnvelope;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < freeRects.length; i += 1) {
    const rect = freeRects[i];
    if (!rect || rect.width <= 0 || rect.height <= 0) continue;
    const distNorm = Math.hypot(rect.x + rect.width * 0.5 - origCx, rect.y + rect.height * 0.5 - origCy) / envDiag;
    const rAsp = rect.width / Math.max(1, rect.height);
    const score = ((rect.width * rect.height) / envArea) * 2.4 + Math.min(rAsp / prefAspect, prefAspect / rAsp) * 0.8 - distNorm * 0.9;
    if (score > bestScore) {
      bestScore = score;
      chosenRect = rect;
    }
  }

  const innerPad = Math.min(4, chosenRect.width * 0.05, chosenRect.height * 0.05);
  const availW = Math.max(2, chosenRect.width - innerPad * 2);
  const availH = Math.max(2, chosenRect.height - innerPad * 2);
  const tiltRad = (tiltAngleDeg * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(tiltRad));
  const absSin = Math.abs(Math.sin(tiltRad));
  const maxPeakW = Math.max(strokeWeightProfile.startScale, strokeWeightProfile.peakScale, strokeWeightProfile.endScale);
  const shearExtra = Math.abs(Math.tan((slantShearDeg * Math.PI) / 180)) * 0.35;

  const spanPri = totalUnits * Math.max(1, maxPeakW * 0.92);
  const spanSec = (1.15 + Math.abs(arcCurvature) * 0.55 + shearExtra) * maxPeakW;
  const localW = resolvedWritingMode === "vertical-rl" ? spanSec : spanPri;
  const localH = resolvedWritingMode === "vertical-rl" ? spanPri : spanSec;
  const rotUnitW = localW * absCos + localH * absSin;
  const rotUnitH = localW * absSin + localH * absCos;

  const prefFont = spec.preferredFontSizePx ?? Math.min(Math.max(12, Math.min(spec.originalBounds.width, spec.originalBounds.height) * 0.65), 72);
  const fontSizePx = Number(
    Math.max(6, Math.min(prefFont, Math.max(6, (availW - baseHaloPx * 2) / Math.max(0.5, rotUnitW)), Math.max(6, (availH - baseHaloPx * 2) / Math.max(0.5, rotUnitH)))).toFixed(2),
  );
  const haloPx = Number(Math.min(baseHaloPx, fontSizePx * 0.18).toFixed(2));

  const contentW = Math.min(availW, rotUnitW * fontSizePx + haloPx * 2);
  const contentH = Math.min(availH, rotUnitH * fontSizePx + haloPx * 2);
  const placedBounds: Rect2D = {
    x: Number(Math.max(chosenRect.x + innerPad, Math.min(chosenRect.x + chosenRect.width - innerPad - contentW, origCx - contentW * 0.5)).toFixed(2)),
    y: Number(Math.max(chosenRect.y + innerPad, Math.min(chosenRect.y + chosenRect.height - innerPad - contentH, origCy - contentH * 0.5)).toFixed(2)),
    width: Number(contentW.toFixed(2)),
    height: Number(contentH.toFixed(2)),
  };

  const cx = placedBounds.x + placedBounds.width * 0.5;
  const cy = placedBounds.y + placedBounds.height * 0.5;
  const halfW = Math.max(1, placedBounds.width * 0.5 - fontSizePx * 0.52 - haloPx);
  const halfH = Math.max(1, placedBounds.height * 0.5 - fontSizePx * 0.52 - haloPx);
  const isVert = resolvedWritingMode === "vertical-rl";
  const dirX = isVert ? -Math.sin(tiltRad) : Math.cos(tiltRad);
  const dirY = isVert ? Math.cos(tiltRad) : Math.sin(tiltRad);
  const span = Math.min(isVert ? halfH : halfW, totalUnits * fontSizePx * 0.42);
  const bend = Math.min((isVert ? halfW : halfH) * 0.65, arcCurvature * fontSizePx * 0.55);

  const arcStart: Point2D = { x: cx - dirX * span, y: cy - dirY * span };
  const arcEnd: Point2D = { x: cx + dirX * span, y: cy + dirY * span };
  const arcControl: Point2D = { x: cx + dirY * bend, y: cy - dirX * bend };
  const arcPath: VectorArcCurveSpec = {
    start: { x: Number(arcStart.x.toFixed(2)), y: Number(arcStart.y.toFixed(2)) },
    control: { x: Number(arcControl.x.toFixed(2)), y: Number(arcControl.y.toFixed(2)) },
    end: { x: Number(arcEnd.x.toFixed(2)), y: Number(arcEnd.y.toFixed(2)) },
    curvature: Number(arcCurvature.toFixed(3)),
  };

  const glyphs: SynthesizedSfxGlyphNode[] = [];
  let clippedGlyphCount = 0;
  for (let i = 0; i < graphemes.length; i += 1) {
    const ch = graphemes[i] ?? "!";
    const t = graphemes.length === 1 ? 0.5 : i / (graphemes.length - 1);
    const weightScale =
      t <= 0.5
        ? strokeWeightProfile.startScale + (strokeWeightProfile.peakScale - strokeWeightProfile.startScale) * (t * 2)
        : strokeWeightProfile.peakScale + (strokeWeightProfile.endScale - strokeWeightProfile.peakScale) * ((t - 0.5) * 2);
    const pt = quadPoint(arcStart, arcControl, arcEnd, t);
    const rot = isVert ? Number((tiltAngleDeg * 0.6).toFixed(2)) : Number((quadTangentDeg(arcStart, arcControl, arcEnd, t) * 0.55 + tiltAngleDeg * 0.45).toFixed(2));
    const gW = Math.min(placedBounds.width, Math.max(4, fontSizePx * estimateCharAdvanceRatio(ch, locale) * Math.min(1.2, weightScale)));
    const gH = Math.min(placedBounds.height, Math.max(4, fontSizePx * Math.min(1.2, weightScale)));
    const gx = Math.max(placedBounds.x + gW * 0.5, Math.min(placedBounds.x + placedBounds.width - gW * 0.5, pt.x));
    const gy = Math.max(placedBounds.y + gH * 0.5, Math.min(placedBounds.y + placedBounds.height - gH * 0.5, pt.y));
    const gBounds: Rect2D = { x: Number((gx - gW * 0.5).toFixed(2)), y: Number((gy - gH * 0.5).toFixed(2)), width: Number(gW.toFixed(2)), height: Number(gH.toFixed(2)) };
    if (!rectContains(spec.safeEnvelope, gBounds, 0.05)) clippedGlyphCount += 1;
    glyphs.push({
      glyphIndex: i,
      character: ch,
      centerX: Number(gx.toFixed(2)),
      centerY: Number(gy.toFixed(2)),
      fontSizePx: Number((fontSizePx * Math.min(1.15, Math.max(0.85, weightScale))).toFixed(2)),
      rotationDeg: rot,
      slantShearDeg: Number(slantShearDeg.toFixed(2)),
      weightScale: Number(weightScale.toFixed(3)),
      bounds: gBounds,
    });
  }

  const brushStrokePaths = synthesizeBrushAccentPaths(brushStyle, placedBounds, arcPath, tiltAngleDeg, haloPx);
  let overlapSum = 0;
  for (let b = 0; b < spec.protectedSpeechBalloons.length; b += 1) {
    const balloon = spec.protectedSpeechBalloons[b];
    if (balloon) overlapSum += rectIntersectionArea(placedBounds, balloon);
  }
  const balloonOverlapAreaPx = Number(overlapSum.toFixed(4));

  return {
    locale,
    sourceKoText: lexicon.sourceKoText,
    localizedText: lexicon.localizedText,
    categoryId: lexicon.categoryId,
    matchKind: lexicon.matchKind,
    brushStyle,
    requestedWritingMode,
    resolvedWritingMode,
    writingModeNormalized,
    tiltAngleDeg: Number(tiltAngleDeg.toFixed(2)),
    slantShearDeg: Number(slantShearDeg.toFixed(2)),
    strokeWeightProfile,
    outlineHaloThicknessPx: haloPx,
    colorGradient,
    arcPath,
    placedBounds,
    safeEnvelope: spec.safeEnvelope,
    glyphs,
    brushStrokePaths,
    balloonOverlapAreaPx,
    fitsSafeEnvelope: rectContains(spec.safeEnvelope, placedBounds, 0.05) && clippedGlyphCount === 0,
    clippedGlyphCount,
  };
}
