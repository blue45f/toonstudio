/**
 * 글로벌 현지화 문화적 뉘앙스 용어집 치환 & 말풍선 길이 확장률/세로쓰기 리플로우 검증 엔진 (₩0 로컬).
 *
 * 지원 언어: 한국어(ko) · 영어(en) · 일본어(ja) · 스페인어(es)
 * - 호칭(선배/형/오빠/언니/누나/선생님 등)·존댓말/반말 레지스터·의성어(SFX) 문화적 뉘앙스 치환
 * - 실측 시각 문자폭 기반 확장률 산출, 가로쓰기 단어 단위 줄바꿈 및 일본어 세로쓰기(vertical-rl) 단수·타테추요코 검증
 */

export type LocalizationLocale = "ko" | "en" | "ja" | "es";

export type SpeechRegisterLevel = "casual" | "polite" | "formal" | "intimate" | "hostile";

export type NuanceTermCategory = "honorific" | "sfx" | "register-phrase";

export type WritingDirectionMode = "horizontal-tb" | "vertical-rl";

export interface CulturalNuanceGlossaryEntry {
  readonly id: string;
  readonly sourceKo: string;
  readonly category: NuanceTermCategory;
  readonly translations: Readonly<Record<LocalizationLocale, string>>;
  readonly registerVariants?: Partial<Readonly<Record<SpeechRegisterLevel, Partial<Readonly<Record<LocalizationLocale, string>>>>>>;
  readonly culturalNoteKo: string;
}

export interface AppliedNuanceSubstitution {
  readonly entryId: string;
  readonly category: NuanceTermCategory;
  readonly original: string;
  readonly replacement: string;
  readonly culturalNoteKo: string;
}

export interface NuanceLocalizationOptions {
  readonly targetLocale: LocalizationLocale;
  readonly register?: SpeechRegisterLevel;
  readonly listenerName?: string;
  readonly preserveMangaHonorificsInEnglish?: boolean;
  readonly customGlossary?: readonly CulturalNuanceGlossaryEntry[];
}

export interface NuanceLocalizationResult {
  readonly sourceText: string;
  readonly localizedText: string;
  readonly targetLocale: LocalizationLocale;
  readonly detectedSourceRegister: SpeechRegisterLevel;
  readonly appliedRegister: SpeechRegisterLevel;
  readonly targetRegisterHint: string;
  readonly substitutions: readonly AppliedNuanceSubstitution[];
}

export interface BubbleGeometrySpec {
  readonly widthPx: number;
  readonly heightPx: number;
  readonly paddingPx?: number;
  readonly fontSizePx: number;
  readonly lineHeightRatio?: number;
  readonly writingMode?: WritingDirectionMode;
  readonly minReadableFontSizePx?: number;
}

export type BubbleReflowStatus =
  | "fits"
  | "tighten-font"
  | "expand-bubble"
  | "overflow-block";

export interface BubbleReflowVerification {
  readonly targetLocale: LocalizationLocale;
  readonly writingMode: WritingDirectionMode;
  readonly sourceVisualUnits: number;
  readonly localizedVisualUnits: number;
  readonly actualExpansionRatio: number;
  readonly expectedBaselineExpansionRatio: number;
  readonly linesOrColumns: readonly string[];
  readonly lineOrColumnCount: number;
  readonly maxCapacityLinesOrColumns: number;
  readonly tateChuYokoTokens: readonly string[];
  readonly status: BubbleReflowStatus;
  readonly recommendedFontSizePx: number;
  readonly recommendedWidthPx: number;
  readonly recommendedHeightPx: number;
  readonly advisoryKo: string;
}

export interface EpisodeBubbleInput {
  readonly bubbleId: string;
  readonly speaker: string;
  readonly listenerName?: string;
  readonly sourceKoText: string;
  readonly isSfx?: boolean;
  readonly register?: SpeechRegisterLevel;
  readonly geometry: BubbleGeometrySpec;
}

export interface LocalizedEpisodeBubbleReport {
  readonly bubbleId: string;
  readonly speaker: string;
  readonly localization: NuanceLocalizationResult;
  readonly reflow: BubbleReflowVerification;
}

export interface EpisodeLocalizationReport {
  readonly targetLocale: LocalizationLocale;
  readonly totalBubbles: number;
  readonly meanExpansionRatio: number;
  readonly overflowCount: number;
  readonly tightenFontCount: number;
  readonly expandBubbleCount: number;
  readonly bubbles: readonly LocalizedEpisodeBubbleReport[];
}

export const LOCALE_EXPANSION_BASELINES: Readonly<Record<LocalizationLocale, number>> = {
  ko: 1.0,
  ja: 1.12,
  en: 1.48,
  es: 1.65,
};

export const DEFAULT_NUANCE_GLOSSARY: readonly CulturalNuanceGlossaryEntry[] = [
  {
    id: "hon-sunbae",
    sourceKo: "선배",
    category: "honorific",
    translations: { ko: "선배", en: "Senior", ja: "先輩", es: "sénior" },
    registerVariants: {
      casual: { en: "{name}", ja: "先輩", es: "compañero" },
      intimate: { en: "{name}", ja: "先輩", es: "{name}" },
      formal: { en: "Senior", ja: "先輩", es: "superior" },
    },
    culturalNoteKo: "영어·스페인어권에서는 친밀도에 따라 이름 직접 호칭 또는 Senior/compañero로 치환합니다.",
  },
  {
    id: "hon-oppa",
    sourceKo: "오빠",
    category: "honorific",
    translations: { ko: "오빠", en: "{name}", ja: "お兄ちゃん", es: "{name}" },
    registerVariants: {
      intimate: { en: "{name}", ja: "お兄ちゃん", es: "cariño" },
      casual: { en: "bro", ja: "兄貴", es: "hermano" },
    },
    culturalNoteKo: "혈연/연인 관계에 따라 이름 호칭 또는 친근한 호칭으로 자연스럽게 전환합니다.",
  },
  {
    id: "hon-hyung",
    sourceKo: "형",
    category: "honorific",
    translations: { ko: "형", en: "bro", ja: "兄貴", es: "hermano" },
    registerVariants: {
      formal: { en: "{name}", ja: "兄さん", es: "{name}" },
      hostile: { en: "{name}", ja: "あんた", es: "tú" },
    },
    culturalNoteKo: "남성 간 호칭으로, 영어권 직역('older brother') 대신 관계별 자연어 호칭을 사용합니다.",
  },
  {
    id: "hon-eonni",
    sourceKo: "언니",
    category: "honorific",
    translations: { ko: "언니", en: "sis", ja: "お姉ちゃん", es: "hermana" },
    registerVariants: {
      formal: { en: "{name}", ja: "姉さん", es: "{name}" },
    },
    culturalNoteKo: "여성 간 친밀 호칭으로 문맥에 따라 이름 또는 sis/姉さん으로 치환합니다.",
  },
  {
    id: "hon-nuna",
    sourceKo: "누나",
    category: "honorific",
    translations: { ko: "누나", en: "{name}", ja: "姉さん", es: "{name}" },
    culturalNoteKo: "남동생→연상 여성 호칭으로 서구권에서는 이름 호칭이 자연스럽습니다.",
  },
  {
    id: "hon-seonsaengnim",
    sourceKo: "선생님",
    category: "honorific",
    translations: { ko: "선생님", en: "Professor", ja: "先生", es: "profesor" },
    registerVariants: {
      casual: { en: "Teach", ja: "先生", es: "profe" },
    },
    culturalNoteKo: "학교·전문직 호칭으로 공손도에 맞춰 Professor/profe 등으로 매핑합니다.",
  },
  {
    id: "hon-maknae",
    sourceKo: "막내",
    category: "honorific",
    translations: { ko: "막내", en: "rookie", ja: "末っ子", es: "el menor" },
    culturalNoteKo: "팀 내 최연소 구성원을 문화권별 자연어로 옮깁니다.",
  },
  {
    id: "hon-ajeossi",
    sourceKo: "아저씨",
    category: "honorific",
    translations: { ko: "아저씨", en: "mister", ja: "おじさん", es: "señor" },
    registerVariants: {
      formal: { en: "sir", ja: "旦那さん", es: "caballero" },
    },
    culturalNoteKo: "성인 남성 호칭을 공손도(mister vs sir / señor)에 맞춰 조절합니다.",
  },
  {
    id: "sfx-dugeun",
    sourceKo: "두근두근",
    category: "sfx",
    translations: { ko: "두근두근", en: "BA-DUMP", ja: "ドキドキ", es: "TUM-TUM" },
    culturalNoteKo: "심장 박동 의성어를 각 언어 만화 표준 SFX로 변환합니다.",
  },
  {
    id: "sfx-kwang",
    sourceKo: "쾅",
    category: "sfx",
    translations: { ko: "쾅", en: "BOOM", ja: "ドォン", es: "¡BUM!" },
    culturalNoteKo: "강한 충돌·폭발 효과음을 언어별 대문자/감탄부호 규약에 맞춥니다.",
  },
  {
    id: "sfx-chalkak",
    sourceKo: "찰칵",
    category: "sfx",
    translations: { ko: "찰칵", en: "CLICK", ja: "カシャッ", es: "CLIC" },
    culturalNoteKo: "셔터·잠금쇠 금속 작동음입니다.",
  },
  {
    id: "sfx-hwiing",
    sourceKo: "휘잉",
    category: "sfx",
    translations: { ko: "휘잉", en: "WHOOSH", ja: "ヒュゥ", es: "FUUU" },
    culturalNoteKo: "바람·빠른 움직임의 공기 가름 의성어입니다.",
  },
  {
    id: "sfx-deoldeol",
    sourceKo: "덜덜",
    category: "sfx",
    translations: { ko: "덜덜", en: "SHIVER", ja: "ガタガタ", es: "TEMBLOR" },
    culturalNoteKo: "추위·공포로 떠는 의태어입니다.",
  },
  {
    id: "sfx-baseurak",
    sourceKo: "바스락",
    category: "sfx",
    translations: { ko: "바스락", en: "RUSTLE", ja: "カサッ", es: "CRUJIDO" },
    culturalNoteKo: "낙엽·종이가 스치는 미세 효과음입니다.",
  },
  {
    id: "sfx-beonjjeok",
    sourceKo: "번쩍",
    category: "sfx",
    translations: { ko: "번쩍", en: "FLASH", ja: "ピカッ", es: "¡DESTELLO!" },
    culturalNoteKo: "강렬한 섬광·각성 시각 효과음입니다.",
  },
  {
    id: "sfx-eureureong",
    sourceKo: "으르렁",
    category: "sfx",
    translations: { ko: "으르렁", en: "GRRR", ja: "グルル", es: "¡GRRR!" },
    culturalNoteKo: "위협적인 낮은 울음·분노 의성어입니다.",
  },
  {
    id: "reg-thank-you-formal",
    sourceKo: "감사합니다",
    category: "register-phrase",
    translations: { ko: "감사합니다", en: "Thank you very much", ja: "ありがとうございます", es: "Muchas gracias" },
    culturalNoteKo: "하십시오체 감사 표현을 대상 언어 격식체로 맞춥니다.",
  },
  {
    id: "reg-sorry-polite",
    sourceKo: "죄송해요",
    category: "register-phrase",
    translations: { ko: "죄송해요", en: "I am really sorry", ja: "すみません", es: "Lo siento mucho" },
    registerVariants: {
      formal: { en: "Please accept my apologies", ja: "申し訳ございません", es: "Le pido disculpas" },
    },
    culturalNoteKo: "사과 표현의 공손도(해요체 vs 격식체)를 유지합니다.",
  },
  {
    id: "reg-wait-casual",
    sourceKo: "잠깐만",
    category: "register-phrase",
    translations: { ko: "잠깐만", en: "Hold on a second", ja: "ちょっと待って", es: "Espera un segundo" },
    registerVariants: {
      polite: { en: "Please wait a moment", ja: "少し待ってください", es: "Espere un momento, por favor" },
      formal: { en: "Kindly hold on a moment", ja: "少々お待ちください", es: "Por favor, aguarde un momento" },
    },
    culturalNoteKo: "반말/존댓말 경계에 따라 스페인어 tú/usted 및 일본어 待って/お待ちください를 분기합니다.",
  },
];

const FORMAL_KO_REGEX = /(?:습니다|습니까|십시오|이옵니다|겠습니까)[.!?…]*$/u;
const BIEUP_NIDA_REGEX = /([가-힣])(?:니다|니까)[.!?…]*$/u;
const POLITE_KO_REGEX = /(?:해요|예요|이에요|세요|군요|네요|죠|가요|나요|요)[.!?…]*$/u;
const HOSTILE_KO_REGEX = /(?:꺼져|닥쳐|네놈|죽여|감히|제길)/u;

function hasBieupFormalEnding(text: string): boolean {
  const match = text.match(BIEUP_NIDA_REGEX);
  const syllable = match?.[1];
  if (!syllable) return false;
  const code = syllable.charCodeAt(0);
  // 한글 완성형 종성 ㅂ(인덱스 17) + 니다/니까 (예: 합니다, 입니다, 갑니다, 봅니다)
  return code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 17;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 한국어 원문에서 화자의 종결 어미·어휘 기반 존댓말/반말 레지스터를 결정적으로 판별한다.
 */
export function detectKoreanSpeechRegister(text: string): SpeechRegisterLevel {
  const trimmed = text.trim();
  if (HOSTILE_KO_REGEX.test(trimmed)) return "hostile";
  if (FORMAL_KO_REGEX.test(trimmed) || hasBieupFormalEnding(trimmed)) return "formal";
  if (POLITE_KO_REGEX.test(trimmed)) return "polite";
  return "casual";
}

function buildTargetRegisterHint(locale: LocalizationLocale, register: SpeechRegisterLevel): string {
  if (locale === "ja") {
    if (register === "formal") return "敬語(でございます・お願いいたします)";
    if (register === "polite") return "丁寧語(です・ます)";
    if (register === "hostile") return "荒い口調(てめえ・〜だろ)";
    return "タメ口(だ・よ)";
  }
  if (locale === "es") {
    if (register === "formal" || register === "polite") return "usted (격식·존대 2인칭)";
    if (register === "hostile") return "tú 직설·단호 어조";
    return "tú (친근·비격식 2인칭)";
  }
  if (locale === "en") {
    if (register === "formal") return "Formal English (sir/madam, full modals)";
    if (register === "polite") return "Polite conversational English";
    if (register === "hostile") return "Sharp/abrupt confrontation register";
    return "Casual contractions & direct address";
  }
  return register === "formal" ? "하십시오체" : register === "polite" ? "해요체" : "해라/반말체";
}

function resolveReplacementText(
  entry: CulturalNuanceGlossaryEntry,
  options: NuanceLocalizationOptions,
  appliedRegister: SpeechRegisterLevel,
): string {
  if (
    options.targetLocale === "en"
    && options.preserveMangaHonorificsInEnglish === true
    && entry.sourceKo === "선배"
  ) {
    return "Senpai";
  }

  const variantTemplate = entry.registerVariants?.[appliedRegister]?.[options.targetLocale];
  const rawTemplate = variantTemplate ?? entry.translations[options.targetLocale];
  if (rawTemplate.includes("{name}")) {
    const fallbackName = options.listenerName?.trim() || entry.translations[options.targetLocale].replace("{name}", "").trim() || "friend";
    return rawTemplate.replace(/\{name\}/gu, fallbackName);
  }
  return rawTemplate;
}

/**
 * 한·영·일·스페인어 문화적 뉘앙스 용어집 치환을 수행한다(긴 키워드 우선 치환으로 부분 겹침 방지).
 */
export function localizeScriptNuances(
  sourceText: string,
  options: NuanceLocalizationOptions,
): NuanceLocalizationResult {
  const detectedSourceRegister = detectKoreanSpeechRegister(sourceText);
  const appliedRegister = options.register ?? detectedSourceRegister;

  const mergedBySource = new Map<string, CulturalNuanceGlossaryEntry>();
  for (const entry of DEFAULT_NUANCE_GLOSSARY) {
    mergedBySource.set(entry.sourceKo, entry);
  }
  for (const custom of options.customGlossary ?? []) {
    mergedBySource.set(custom.sourceKo, custom);
  }

  const orderedEntries = [...mergedBySource.values()].sort(
    (a, b) => b.sourceKo.length - a.sourceKo.length || a.id.localeCompare(b.id),
  );

  let localizedText = sourceText;
  const substitutions: AppliedNuanceSubstitution[] = [];

  for (const entry of orderedEntries) {
    if (!localizedText.includes(entry.sourceKo)) continue;
    const replacement = resolveReplacementText(entry, options, appliedRegister);
    if (replacement === entry.sourceKo && options.targetLocale === "ko") continue;

    localizedText = localizedText.split(entry.sourceKo).join(replacement);
    substitutions.push({
      entryId: entry.id,
      category: entry.category,
      original: entry.sourceKo,
      replacement,
      culturalNoteKo: entry.culturalNoteKo,
    });
  }

  return {
    sourceText,
    localizedText,
    targetLocale: options.targetLocale,
    detectedSourceRegister,
    appliedRegister,
    targetRegisterHint: buildTargetRegisterHint(options.targetLocale, appliedRegister),
    substitutions,
  };
}

function charVisualWidthEm(char: string): number {
  const code = char.codePointAt(0) ?? 32;
  // CJK(한글·히라가나·가타카나·한자·전각 기호)는 1.0em, 공백은 0.34em, 라틴·스페인어 문자는 평균 0.56em
  if (
    (code >= 0x1100 && code <= 0x11ff)
    || (code >= 0x3000 && code <= 0x9fff)
    || (code >= 0xac00 && code <= 0xd7af)
    || (code >= 0xff01 && code <= 0xff60)
  ) {
    return 1.0;
  }
  if (char === " " || char === "\t") return 0.34;
  if (/[ilI1!.,:;'"¡¿]/u.test(char)) return 0.36;
  if (/[MW@#%&]/u.test(char)) return 0.84;
  return 0.56;
}

/**
 * 문자열의 시각적 전각 환산 폭(em 단위)을 측정한다.
 */
export function measureVisualTextUnits(text: string): number {
  let sum = 0;
  for (const ch of text) {
    if (ch === "\n" || ch === "\r") continue;
    sum += charVisualWidthEm(ch);
  }
  return roundTo2(sum);
}

function wrapHorizontalLines(text: string, maxUnitsPerLine: number): string[] {
  const budget = Math.max(2, maxUnitsPerLine);
  const paragraphs = text.replace(/\r\n?/gu, "\n").split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // 라틴/공백 기반 어절은 단어 경계로 줄바꿈, CJK 연속 문자열은 글자 단위로 줄바꿈한다.
    const tokens = trimmed.match(/[^\s]+|\s+/gu) ?? [trimmed];
    let currentLine = "";
    let currentUnits = 0;

    for (const token of tokens) {
      if (/^\s+$/u.test(token)) {
        if (currentLine.length > 0 && currentUnits + 0.34 <= budget) {
          currentLine += " ";
          currentUnits += 0.34;
        }
        continue;
      }

      const tokenUnits = measureVisualTextUnits(token);
      if (currentLine.length > 0 && currentUnits + tokenUnits > budget) {
        lines.push(currentLine.trimEnd());
        currentLine = "";
        currentUnits = 0;
      }

      if (tokenUnits <= budget) {
        currentLine += token;
        currentUnits += tokenUnits;
      } else {
        for (const ch of token) {
          const w = charVisualWidthEm(ch);
          if (currentLine.length > 0 && currentUnits + w > budget) {
            lines.push(currentLine.trimEnd());
            currentLine = ch;
            currentUnits = w;
          } else {
            currentLine += ch;
            currentUnits += w;
          }
        }
      }
    }

    if (currentLine.trim().length > 0) {
      lines.push(currentLine.trimEnd());
    }
  }

  return lines.length > 0 ? lines : [""];
}

function extractTateChuYokoTokens(text: string): string[] {
  // 세로쓰기(vertical-rl)에서 2자리 숫자 또는 !! / ?! 조합을 가로 합자(縦中横) 후보로 추출한다.
  const matches = text.match(/(?:\b\d{2}\b|[!?]{2})/gu);
  return matches ? [...new Set(matches)] : [];
}

function wrapVerticalColumns(text: string, maxCharsPerColumn: number): {
  readonly columns: readonly string[];
  readonly tateChuYokoTokens: readonly string[];
} {
  const budget = Math.max(2, Math.floor(maxCharsPerColumn));
  const tateChuYokoTokens = extractTateChuYokoTokens(text);
  const paragraphs = text.replace(/\r\n?/gu, "\n").split("\n");
  const columns: string[] = [];

  for (const paragraph of paragraphs) {
    const compact = paragraph.trim();
    if (!compact) continue;
    // 縦中横 2글자 토큰은 세로 1칸으로 취급한다.
    const units = compact.match(/(?:\d{2}|[!?]{2}|.)/gu) ?? [];
    for (let i = 0; i < units.length; i += budget) {
      columns.push(units.slice(i, i + budget).join(""));
    }
  }

  return {
    columns: columns.length > 0 ? columns : [""],
    tateChuYokoTokens,
  };
}

/**
 * 번역된 텍스트의 확장률 및 가로/세로쓰기 말풍선 리플로우 적합성을 검증한다.
 */
export function verifyBubbleLocalizationReflow(
  sourceKoText: string,
  localizedText: string,
  targetLocale: LocalizationLocale,
  geometry: BubbleGeometrySpec,
): BubbleReflowVerification {
  const paddingPx = Math.max(8, geometry.paddingPx ?? 16);
  const fontSizePx = clamp(geometry.fontSizePx, 10, 64);
  const lineHeightRatio = clamp(geometry.lineHeightRatio ?? 1.4, 1.1, 2.0);
  const minReadableFontSizePx = clamp(geometry.minReadableFontSizePx ?? 11, 10, fontSizePx);
  const writingMode: WritingDirectionMode = geometry.writingMode
    ?? (targetLocale === "ja" ? "vertical-rl" : "horizontal-tb");

  const innerWidthPx = Math.max(40, geometry.widthPx - paddingPx * 2);
  const innerHeightPx = Math.max(36, geometry.heightPx - paddingPx * 2);

  const sourceVisualUnits = Math.max(0.5, measureVisualTextUnits(sourceKoText));
  const localizedVisualUnits = measureVisualTextUnits(localizedText);
  const actualExpansionRatio = roundTo2(localizedVisualUnits / sourceVisualUnits);
  const expectedBaselineExpansionRatio = LOCALE_EXPANSION_BASELINES[targetLocale];

  const evaluateAtFontSize = (candidateFontPx: number) => {
    const stridePx = candidateFontPx * lineHeightRatio;
    if (writingMode === "vertical-rl") {
      const charsPerCol = Math.max(2, Math.floor(innerHeightPx / (candidateFontPx * 1.06)));
      const wrapped = wrapVerticalColumns(localizedText, charsPerCol);
      const maxCols = Math.max(1, Math.floor(innerWidthPx / stridePx));
      return {
        linesOrColumns: wrapped.columns,
        count: wrapped.columns.length,
        capacity: maxCols,
        tateChuYokoTokens: wrapped.tateChuYokoTokens,
      };
    }
    const unitsPerLine = Math.max(2, innerWidthPx / candidateFontPx);
    const wrappedLines = wrapHorizontalLines(localizedText, unitsPerLine);
    const maxLines = Math.max(1, Math.floor(innerHeightPx / stridePx));
    return {
      linesOrColumns: wrappedLines,
      count: wrappedLines.length,
      capacity: maxLines,
      tateChuYokoTokens: [] as readonly string[],
    };
  };

  const initial = evaluateAtFontSize(fontSizePx);
  let status: BubbleReflowStatus = "fits";
  let recommendedFontSizePx = fontSizePx;
  let recommendedWidthPx = geometry.widthPx;
  let recommendedHeightPx = geometry.heightPx;
  let advisoryKo = `${targetLocale.toUpperCase()} 리플로우 적합 (${initial.count}/${initial.capacity}${writingMode === "vertical-rl" ? "단" : "줄"}).`;

  if (initial.count > initial.capacity) {
    let fittedFont: number | null = null;
    for (let f = Math.floor(fontSizePx) - 1; f >= minReadableFontSizePx; f -= 1) {
      const probe = evaluateAtFontSize(f);
      if (probe.count <= probe.capacity) {
        fittedFont = f;
        break;
      }
    }

    if (fittedFont !== null) {
      status = "tighten-font";
      recommendedFontSizePx = fittedFont;
      advisoryKo = `텍스트가 ${initial.count - initial.capacity}${writingMode === "vertical-rl" ? "단" : "줄"} 넘쳐 폰트를 ${fontSizePx}px → ${fittedFont}px로 미세 축소하면 말풍선 크기 변경 없이 수용됩니다.`;
    } else {
      const overflowRatio = initial.count / Math.max(1, initial.capacity);
      status = overflowRatio >= 1.7 ? "overflow-block" : "expand-bubble";
      recommendedFontSizePx = minReadableFontSizePx;
      if (writingMode === "vertical-rl") {
        recommendedWidthPx = Math.ceil(initial.count * fontSizePx * lineHeightRatio + paddingPx * 2);
      } else {
        recommendedHeightPx = Math.ceil(initial.count * fontSizePx * lineHeightRatio + paddingPx * 2);
      }
      advisoryKo = status === "overflow-block"
        ? `심각한 말풍선 오버플로(확장률 ${actualExpansionRatio}×): 최소 가독성(${minReadableFontSizePx}px)에서도 넘치므로 말풍선 확장(${recommendedWidthPx}×${recommendedHeightPx}px) 또는 대사 축약이 필수입니다.`
        : `확장률 ${actualExpansionRatio}×로 말풍선을 ${recommendedWidthPx}×${recommendedHeightPx}px로 확장하는 것을 권장합니다.`;
    }
  }

  return {
    targetLocale,
    writingMode,
    sourceVisualUnits,
    localizedVisualUnits,
    actualExpansionRatio,
    expectedBaselineExpansionRatio,
    linesOrColumns: initial.linesOrColumns,
    lineOrColumnCount: initial.count,
    maxCapacityLinesOrColumns: initial.capacity,
    tateChuYokoTokens: initial.tateChuYokoTokens,
    status,
    recommendedFontSizePx,
    recommendedWidthPx,
    recommendedHeightPx,
    advisoryKo,
  };
}

/**
 * 회차 전체 말풍선 목록을 대상 언어로 뉘앙스 치환 + 리플로우 일괄 검증한다.
 */
export function planEpisodeLocalization(
  bubbles: readonly EpisodeBubbleInput[],
  options: NuanceLocalizationOptions,
): EpisodeLocalizationReport {
  const reports: LocalizedEpisodeBubbleReport[] = [];

  for (const bubble of bubbles) {
    const localization = localizeScriptNuances(bubble.sourceKoText, {
      ...options,
      register: bubble.register ?? options.register,
      listenerName: bubble.listenerName ?? options.listenerName,
    });
    const reflow = verifyBubbleLocalizationReflow(
      bubble.sourceKoText,
      localization.localizedText,
      options.targetLocale,
      bubble.geometry,
    );
    reports.push({
      bubbleId: bubble.bubbleId,
      speaker: bubble.speaker,
      localization,
      reflow,
    });
  }

  const totalBubbles = reports.length;
  const meanExpansionRatio = totalBubbles > 0
    ? roundTo2(reports.reduce((sum, item) => sum + item.reflow.actualExpansionRatio, 0) / totalBubbles)
    : 1;

  return {
    targetLocale: options.targetLocale,
    totalBubbles,
    meanExpansionRatio,
    overflowCount: reports.filter((item) => item.reflow.status === "overflow-block").length,
    tightenFontCount: reports.filter((item) => item.reflow.status === "tighten-font").length,
    expandBubbleCount: reports.filter((item) => item.reflow.status === "expand-bubble").length,
    bubbles: reports,
  };
}
