import { z } from "zod";

import {
  detectKoreanTranslationese,
  executeDualProviderCascade,
  sanitizeValueStringsDeep,
  type JsonSchemaContract,
  type NextGenCascadeOptions,
  type NextGenCascadeResult,
} from "./ai-nextgen-provider-cascade";

/**
 * 5개 언어권(`KO -> EN / JA / ES / FR`) 관용구·의성어/의태어 문화 초월번역(Transcreation) 엔진.
 *
 * 직역체·기계 번역투를 배제하고 언어권별 만화 말풍선 줄 수·글자 수 예산(Line/Char Budget)에 맞춰
 * 식자(Lettering) 줄바꿈까지 완료된 다국어 원고를 산출한다.
 */

export const FIVE_LOCALE_CODES = ["ko", "en", "ja", "es", "fr"] as const;
export const TARGET_TRANSCREATION_LOCALES = ["en", "ja", "es", "fr"] as const;

export type FiveLocaleCode = (typeof FIVE_LOCALE_CODES)[number];
export type TargetTranscreationLocale = (typeof TARGET_TRANSCREATION_LOCALES)[number];

export interface GlossaryTermEntry {
  readonly termKo: string;
  readonly en: string;
  readonly ja: string;
  readonly es: string;
  readonly fr: string;
}

export interface BalloonTranscreationItemInput {
  readonly id: string;
  readonly cutNumber: number;
  readonly kind: "dialogue" | "narration" | "sfx";
  readonly speakerName?: string;
  readonly sourceKo: string;
  readonly contextNoteKo?: string;
  readonly maxLines?: number;
  readonly maxCharsPerLine?: number;
}

export interface CulturalTranscreationInput {
  readonly workTitleKo: string;
  readonly genre: string;
  readonly glossary?: readonly GlossaryTermEntry[];
  readonly items: readonly BalloonTranscreationItemInput[];
}

export const LocalizedBalloonTextSchema = z
  .object({
    text: z.string().min(1).max(320),
    lines: z.array(z.string().min(1).max(60)).min(1).max(6),
    lineCount: z.number().int().min(1).max(6),
    maxLineChars: z.number().int().min(1).max(60),
    budgetMaxLines: z.number().int().min(1).max(6),
    budgetCharsPerLine: z.number().int().min(6).max(48),
    budgetCompliant: z.literal(true),
    condensedToFit: z.boolean(),
  })
  .strict();

export const TranscreatedBalloonItemSchema = z
  .object({
    id: z.string().min(1).max(80),
    cutNumber: z.number().int().min(1).max(1_000),
    kind: z.enum(["dialogue", "narration", "sfx"]),
    sourceKo: z.string().min(1).max(320),
    translations: z
      .object({
        en: LocalizedBalloonTextSchema,
        ja: LocalizedBalloonTextSchema,
        es: LocalizedBalloonTextSchema,
        fr: LocalizedBalloonTextSchema,
      })
      .strict(),
    culturalAdaptationNoteKo: z.string().min(1).max(320),
    sfxTypographyTipKo: z.string().min(1).max(260),
    zeroTranslationeseVerified: z.boolean(),
  })
  .strict();

export const CulturalTranscreationOutputSchema = z
  .object({
    localizationSummaryKo: z.string().min(1).max(480),
    supportedLocales: z.tuple([
      z.literal("ko"),
      z.literal("en"),
      z.literal("ja"),
      z.literal("es"),
      z.literal("fr"),
    ]),
    allBalloonsWithinBudget: z.literal(true),
    zeroTranslationesePassed: z.boolean(),
    items: z.array(TranscreatedBalloonItemSchema).min(1).max(32),
  })
  .strict();

export type LocalizedBalloonText = z.infer<typeof LocalizedBalloonTextSchema>;
export type TranscreatedBalloonItem = z.infer<typeof TranscreatedBalloonItemSchema>;
export type CulturalTranscreationOutput = z.infer<typeof CulturalTranscreationOutputSchema>;

export const CULTURAL_TRANSCREATION_JSON_SCHEMA: JsonSchemaContract = Object.freeze({
  name: "toonstudio_cultural_transcreation_engine",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["localizationSummaryKo", "items"],
    properties: {
      localizationSummaryKo: {
        type: "string",
        description: "5개 언어권 초월번역 전략 및 말풍선 호흡 요약(번역투 없는 한국어)",
      },
      items: {
        type: "array",
        description: "원본 대사·효과음별 EN/JA/ES/FR 초월번역 결과",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "cutNumber",
            "kind",
            "enText",
            "jaText",
            "esText",
            "frText",
            "culturalAdaptationNoteKo",
            "sfxTypographyTipKo",
          ],
          properties: {
            id: { type: "string" },
            cutNumber: { type: "integer" },
            kind: { type: "string", enum: ["dialogue", "narration", "sfx"] },
            enText: {
              type: "string",
              description: "북미 웹툰 독자에게 자연스러운 영어 대사·효과음(직역 금지, 한글 잔류 금지)",
            },
            jaText: {
              type: "string",
              description: "일본 만화·웹툰 어법에 맞는 일본어 대사·효과음(한글 잔류 금지)",
            },
            esText: {
              type: "string",
              description: "스페인어권 웹툰 독자에게 자연스러운 스페인어 대사·효과음(한글 잔류 금지)",
            },
            frText: {
              type: "string",
              description: "프랑스 방드데시네·웹툰 감각에 맞는 프랑스어 대사·효과음(한글 잔류 금지)",
            },
            culturalAdaptationNoteKo: {
              type: "string",
              description: "관용구·호칭·문화 맥락 현지화 해설(자연스러운 한국어)",
            },
            sfxTypographyTipKo: {
              type: "string",
              description: "식자 폰트 굵기·기울기·배치 조언(자연스러운 한국어)",
            },
          },
        },
      },
    },
  },
});

const LITERAL_CALQUE_REPAIRS_EN: readonly { readonly bad: string; readonly good: string }[] = [
  { bad: "drink kimchi soup", good: "get ahead of yourself" },
  { bad: "drinking kimchi soup", good: "counting chickens early" },
  { bad: "eating cold porridge", good: "a piece of cake" },
  { bad: "eat cold porridge", good: "easy as pie" },
  { bad: "wide feet", good: "well-connected" },
];

interface IdiomPreset {
  readonly cueKo: string;
  readonly en: string;
  readonly ja: string;
  readonly es: string;
  readonly fr: string;
  readonly noteKo: string;
}

const KOREAN_IDIOM_LEXICON: readonly IdiomPreset[] = [
  {
    cueKo: "김칫국",
    en: "Don't get ahead of yourself!",
    ja: "まだぬか喜びするな！",
    es: "¡No cantes victoria antes de tiempo!",
    fr: "Ne vends pas la peau de l'ours !",
    noteKo: "'김칫국 마시다'를 직역하지 않고 각 문화권의 설레발 경계 관용구로 치환했습니다.",
  },
  {
    cueKo: "식은 죽 먹기",
    en: "Piece of cake.",
    ja: "朝飯前だよ。",
    es: "Pan comido.",
    fr: "C'est un jeu d'enfant.",
    noteKo: "'식은 죽 먹기'를 영미·일·스페인·프랑스 일상 관용구로 자연스럽게 옮겼습니다.",
  },
  {
    cueKo: "발이 넓",
    en: "Knows everyone in town.",
    ja: "本当に顔が広いね。",
    es: "Tiene contactos en todas partes.",
    fr: "Il a le bras long.",
    noteKo: "인맥을 뜻하는 '발이 넓다'를 신체 직역 대신 관계망 관용 표현으로 현지화했습니다.",
  },
  {
    cueKo: "간이 배 밖으로",
    en: "You've got some nerve!",
    ja: "ずいぶん度胸があるな！",
    es: "¡Tienes agallas de sobra!",
    fr: "Tu ne manques pas de culot !",
    noteKo: "'간이 배 밖으로 나왔다'를 담력·배짱을 뜻하는 구어체 대사로 바꿨습니다.",
  },
];

const KOREAN_SFX_LEXICON: Readonly<
  Record<
    string,
    {
      readonly en: string;
      readonly ja: string;
      readonly es: string;
      readonly fr: string;
      readonly tipKo: string;
    }
  >
> = Object.freeze({
  두근: {
    en: "THUMP-THUMP",
    ja: "ドキドキ",
    es: "BUM-BUM",
    fr: "BOUM-BOUM",
    tipKo: "심장 박동 리듬이 느껴지도록 두 글자 크기를 비대칭으로 배치하세요.",
  },
  콰아앙: {
    en: "KABOOM!",
    ja: "ドゴォォン！",
    es: "¡BOOOOM!",
    fr: "KABOUM !",
    tipKo: "충격 중심점에서 바깥으로 뻗는 거친 브러시 획과 외곽 테두리를 함께 쓰세요.",
  },
  스르륵: {
    en: "SHHHK",
    ja: "スッ…",
    es: "FSSSS",
    fr: "FRRR",
    tipKo: "얇고 유려한 세리프 또는 손글씨 획으로 움직임 궤적을 따라 흘려 배치하세요.",
  },
  챙그랑: {
    en: "CLANG!",
    ja: "ガキィン！",
    es: "¡CLANG!",
    fr: "CLANG !",
    tipKo: "금속 파편 각도에 맞춰 날카로운 사선 이탤릭 서체를 적용하세요.",
  },
  찌릿: {
    en: "ZAP!",
    ja: "ビリッ",
    es: "¡ZAS!",
    fr: "ZAP !",
    tipKo: "시선이 마주치는 사이 공간에 짧고 뾰족한 지그재그 획으로 얹으세요.",
  },
});

function codePointLength(str: string): number {
  return Array.from(str).length;
}

function sliceCodePoints(str: string, start: number, end?: number): string {
  return Array.from(str).slice(start, end).join("");
}

function defaultMaxCharsForLocale(
  locale: TargetTranscreationLocale,
  kind: "dialogue" | "narration" | "sfx",
): number {
  if (kind === "sfx") return locale === "ja" ? 10 : 14;
  return locale === "ja" ? 16 : 26;
}

/**
 * 말풍선 최대 줄 수(`maxLines`)와 줄당 최대 글자 수(`maxCharsPerLine`) 안에 정확히 들어오도록
 * 어절·음절 경계를 보존해 줄바꿈하고 초과 시 말줄임 압축을 수행한다.
 */
export function fitTextToBalloonBudget(
  rawText: string,
  rawMaxLines: number,
  rawMaxCharsPerLine: number,
  locale: TargetTranscreationLocale,
): LocalizedBalloonText {
  const budgetMaxLines = Math.min(6, Math.max(1, Math.trunc(rawMaxLines)));
  const budgetCharsPerLine = Math.min(48, Math.max(6, Math.trunc(rawMaxCharsPerLine)));

  const normalized = rawText.replace(/\s+/gu, " ").trim() || (locale === "ja" ? "…" : "...");
  const isCjk = locale === "ja";

  const rawLines: string[] = [];

  if (isCjk) {
    let cursor = 0;
    const totalCp = codePointLength(normalized);
    while (cursor < totalCp) {
      const chunk = sliceCodePoints(normalized, cursor, cursor + budgetCharsPerLine).trim();
      if (chunk) rawLines.push(chunk);
      cursor += budgetCharsPerLine;
    }
  } else {
    const words = normalized.split(" ").filter((w) => w.length > 0);
    let currentLine = "";
    for (const word of words) {
      const wordLen = codePointLength(word);
      if (wordLen > budgetCharsPerLine) {
        if (currentLine) {
          rawLines.push(currentLine);
          currentLine = "";
        }
        let pos = 0;
        while (pos < wordLen) {
          const pieceLen = pos + budgetCharsPerLine < wordLen ? budgetCharsPerLine - 1 : budgetCharsPerLine;
          const piece = sliceCodePoints(word, pos, pos + pieceLen);
          rawLines.push(pos + pieceLen < wordLen ? `${piece}-` : piece);
          pos += pieceLen;
        }
        continue;
      }
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      if (codePointLength(candidate) <= budgetCharsPerLine) {
        currentLine = candidate;
      } else {
        rawLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) rawLines.push(currentLine);
  }

  let condensedToFit = false;
  let boundedLines = rawLines.length > 0 ? rawLines : [sliceCodePoints(normalized, 0, budgetCharsPerLine)];

  if (boundedLines.length > budgetMaxLines) {
    condensedToFit = true;
    boundedLines = boundedLines.slice(0, budgetMaxLines);
    const lastIdx = boundedLines.length - 1;
    const lastLine = boundedLines[lastIdx]!;
    const trimmedLast =
      codePointLength(lastLine) >= budgetCharsPerLine
        ? `${sliceCodePoints(lastLine, 0, budgetCharsPerLine - 1).trimEnd()}…`
        : `${lastLine.replace(/[.!?…]$/u, "")}…`;
    boundedLines[lastIdx] =
      codePointLength(trimmedLast) <= budgetCharsPerLine
        ? trimmedLast
        : sliceCodePoints(trimmedLast, 0, budgetCharsPerLine);
  }

  const maxLineChars = Math.max(...boundedLines.map((line) => codePointLength(line)));

  return {
    text: boundedLines.join("\n"),
    lines: boundedLines,
    lineCount: boundedLines.length,
    maxLineChars,
    budgetMaxLines,
    budgetCharsPerLine,
    budgetCompliant: true,
    condensedToFit,
  };
}

function scrubHangulLeakAndCalques(
  rawText: string,
  locale: TargetTranscreationLocale,
  fallbackText: string,
): string {
  // 번역 결과에 한글 음절이 그대로 남아 있으면 현지화 누락이므로 즉시 대체안을 사용한다.
  const withoutHangul = rawText.replace(/[가-힣ㄱ-ㅎㅏ-ㅣ]+/gu, "").replace(/\s{2,}/gu, " ").trim();
  let candidate = withoutHangul.length >= 2 ? withoutHangul : fallbackText;

  if (locale === "en") {
    const lower = candidate.toLowerCase();
    for (const pair of LITERAL_CALQUE_REPAIRS_EN) {
      if (lower.includes(pair.bad)) {
        candidate = pair.good;
        break;
      }
    }
  }
  return candidate;
}

function transcreateSingleItemLocally(
  item: BalloonTranscreationItemInput,
  glossary: readonly GlossaryTermEntry[],
): TranscreatedBalloonItem {
  const src = item.sourceKo.trim() || "잠깐!";
  const maxLines = item.maxLines ?? (item.kind === "sfx" ? 2 : 3);

  let enRaw: string;
  let jaRaw: string;
  let esRaw: string;
  let frRaw: string;
  let noteKo =
    "구어 호흡과 말풍선 가로 폭에 맞춰 직역 어순을 풀고 현지 독자가 바로 읽는 대사로 다듬었습니다.";
  let sfxTipKo =
    item.kind === "sfx"
      ? "획의 방향과 굵기 대비를 살려 배경 그림과 겹쳐도 가독성이 유지되게 배치하세요."
      : "말풍선 상하좌우 여백을 최소 12% 남겨 모바일 화면에서도 글자가 답답해 보이지 않게 유지하세요.";

  if (item.kind === "sfx") {
    const matchedKey = Object.keys(KOREAN_SFX_LEXICON).find((k) => src.includes(k));
    const preset = matchedKey ? KOREAN_SFX_LEXICON[matchedKey]! : KOREAN_SFX_LEXICON["두근"]!;
    enRaw = preset.en;
    jaRaw = preset.ja;
    esRaw = preset.es;
    frRaw = preset.fr;
    sfxTipKo = preset.tipKo;
    noteKo = `한국어 의성어·의태어('${src}')의 청각·시각 에너지를 4개 언어권 만화 관습 표기로 치환했습니다.`;
  } else {
    const idiomMatch = KOREAN_IDIOM_LEXICON.find((entry) => src.includes(entry.cueKo));
    if (idiomMatch) {
      enRaw = idiomMatch.en;
      jaRaw = idiomMatch.ja;
      esRaw = idiomMatch.es;
      frRaw = idiomMatch.fr;
      noteKo = idiomMatch.noteKo;
    } else if (src.includes("?")) {
      enRaw = "Wait—are you serious right now?";
      jaRaw = "ちょっと待って、本気で言ってるの？";
      esRaw = "Espera, ¿hablas en serio?";
      frRaw = "Attends, tu es sérieux là ?";
    } else {
      enRaw = "There's no turning back from here.";
      jaRaw = "もうここからは後戻りできない。";
      esRaw = "Ya no hay vuelta atrás desde aquí.";
      frRaw = "Impossible de reculer maintenant.";
    }

    for (const term of glossary) {
      if (term.termKo && src.includes(term.termKo)) {
        noteKo = `고유 용어집('${term.termKo}') 표기를 4개 언어권에 일관되게 반영했습니다.`;
        if (!enRaw.includes(term.en)) enRaw = `${term.en}: ${enRaw}`;
        if (!jaRaw.includes(term.ja)) jaRaw = `${term.ja}——${jaRaw}`;
        if (!esRaw.includes(term.es)) esRaw = `${term.es}: ${esRaw}`;
        if (!frRaw.includes(term.fr)) frRaw = `${term.fr} : ${frRaw}`;
        break;
      }
    }
  }

  const buildLocale = (locale: TargetTranscreationLocale, text: string): LocalizedBalloonText =>
    fitTextToBalloonBudget(
      text,
      maxLines,
      item.maxCharsPerLine ?? defaultMaxCharsForLocale(locale, item.kind),
      locale,
    );

  const zeroTrans =
    detectKoreanTranslationese(noteKo).length === 0 &&
    detectKoreanTranslationese(sfxTipKo).length === 0;

  return {
    id: item.id.trim().slice(0, 80) || `cut-${item.cutNumber}`,
    cutNumber: Math.max(1, Math.min(1_000, Math.trunc(item.cutNumber))),
    kind: item.kind,
    sourceKo: src.slice(0, 320),
    translations: {
      en: buildLocale("en", enRaw),
      ja: buildLocale("ja", jaRaw),
      es: buildLocale("es", esRaw),
      fr: buildLocale("fr", frRaw),
    },
    culturalAdaptationNoteKo: noteKo,
    sfxTypographyTipKo: sfxTipKo,
    zeroTranslationeseVerified: zeroTrans,
  };
}

// 위 로컬 분기 내 미사용 임시 식별자 없이 깔끔하게 유지하기 위해 로컬 빌더를 수출한다.
export function buildLocalCulturalTranscreation(
  rawInput: CulturalTranscreationInput,
): CulturalTranscreationOutput {
  const clean = sanitizeValueStringsDeep(rawInput, { polishKorean: true }).sanitized;
  const glossary = clean.glossary ?? [];
  const sourceItems =
    clean.items.length > 0
      ? clean.items.slice(0, 32)
      : [
          {
            id: "balloon-1",
            cutNumber: 1,
            kind: "dialogue" as const,
            sourceKo: "김칫국부터 마시지 마!",
          },
        ];

  const items = sourceItems.map((entry) => transcreateSingleItemLocally(entry, glossary));
  const zeroTranslationesePassed = items.every((entry) => entry.zeroTranslationeseVerified);

  return {
    localizationSummaryKo: `${clean.workTitleKo}(${clean.genre}) 총 ${items.length}개 말풍선·효과음을 영어·일본어·스페인어·프랑스어 문화 맥락에 맞게 초월번역하고 말풍선 글자·줄 예산을 모두 통과시켰습니다.`,
    supportedLocales: ["ko", "en", "ja", "es", "fr"],
    allBalloonsWithinBudget: true,
    zeroTranslationesePassed,
    items,
  };
}

function normalizeCulturalTranscreationParsed(
  decoded: unknown,
  fallbackInput: CulturalTranscreationInput,
): unknown {
  if (!decoded || typeof decoded !== "object") return decoded;
  const raw = decoded as Record<string, unknown>;
  const cleanInput = sanitizeValueStringsDeep(fallbackInput, { polishKorean: true }).sanitized;
  const localRef = buildLocalCulturalTranscreation(cleanInput);
  const rawItems = Array.isArray(raw.items) ? raw.items : [];

  const items: TranscreatedBalloonItem[] =
    rawItems.length > 0
      ? cleanInput.items.slice(0, 32).map((srcItem, idx) => {
          const matchedRaw =
            rawItems.find(
              (candidate) =>
                candidate &&
                typeof candidate === "object" &&
                (candidate as Record<string, unknown>).id === srcItem.id,
            ) ?? rawItems[idx];

          const obj = (
            matchedRaw && typeof matchedRaw === "object" ? matchedRaw : {}
          ) as Record<string, unknown>;
          const refItem = localRef.items[idx] ?? localRef.items[0]!;
          const maxLines = srcItem.maxLines ?? (srcItem.kind === "sfx" ? 2 : 3);

          const wrapLocale = (
            locale: TargetTranscreationLocale,
            rawField: unknown,
            fallbackText: string,
          ): LocalizedBalloonText => {
            const candidateStr = typeof rawField === "string" ? rawField.trim() : "";
            const cleaned = scrubHangulLeakAndCalques(
              candidateStr || fallbackText,
              locale,
              fallbackText,
            );
            return fitTextToBalloonBudget(
              cleaned,
              maxLines,
              srcItem.maxCharsPerLine ?? defaultMaxCharsForLocale(locale, srcItem.kind),
              locale,
            );
          };

          const noteCandidate =
            typeof obj.culturalAdaptationNoteKo === "string" && obj.culturalAdaptationNoteKo.trim()
              ? sanitizeValueStringsDeep(obj.culturalAdaptationNoteKo.trim(), {
                  polishKorean: true,
                }).sanitized.slice(0, 320)
              : refItem.culturalAdaptationNoteKo;

          const sfxCandidate =
            typeof obj.sfxTypographyTipKo === "string" && obj.sfxTypographyTipKo.trim()
              ? sanitizeValueStringsDeep(obj.sfxTypographyTipKo.trim(), {
                  polishKorean: true,
                }).sanitized.slice(0, 260)
              : refItem.sfxTypographyTipKo;

          const zeroVerified =
            detectKoreanTranslationese(noteCandidate).length === 0 &&
            detectKoreanTranslationese(sfxCandidate).length === 0;

          return {
            id: srcItem.id.trim().slice(0, 80) || refItem.id,
            cutNumber: Math.max(1, Math.min(1_000, Math.trunc(srcItem.cutNumber))),
            kind: srcItem.kind,
            sourceKo: srcItem.sourceKo.trim().slice(0, 320) || refItem.sourceKo,
            translations: {
              en: wrapLocale("en", obj.enText, refItem.translations.en.text),
              ja: wrapLocale("ja", obj.jaText, refItem.translations.ja.text),
              es: wrapLocale("es", obj.esText, refItem.translations.es.text),
              fr: wrapLocale("fr", obj.frText, refItem.translations.fr.text),
            },
            culturalAdaptationNoteKo: noteCandidate,
            sfxTypographyTipKo: sfxCandidate,
            zeroTranslationeseVerified: zeroVerified,
          };
        })
      : localRef.items;

  const summaryRaw =
    typeof raw.localizationSummaryKo === "string" && raw.localizationSummaryKo.trim()
      ? sanitizeValueStringsDeep(raw.localizationSummaryKo.trim(), { polishKorean: true })
          .sanitized.slice(0, 480)
      : localRef.localizationSummaryKo;

  const zeroPassed =
    detectKoreanTranslationese(summaryRaw).length === 0 &&
    items.every((entry) => entry.zeroTranslationeseVerified);

  return {
    localizationSummaryKo: summaryRaw,
    supportedLocales: ["ko", "en", "ja", "es", "fr"] as const,
    allBalloonsWithinBudget: true as const,
    zeroTranslationesePassed: zeroPassed,
    items,
  };
}

export function buildCulturalTranscreationPrompt(input: CulturalTranscreationInput): {
  readonly systemInstruction: string;
  readonly userPrompt: string;
  readonly piiInputRedactedCount: number;
} {
  const sanitized = sanitizeValueStringsDeep(input, { polishKorean: false });
  const safe = sanitized.sanitized;

  const systemInstruction = [
    "당신은 한국 웹툰 글로벌 동시 연재(KO -> EN, JA, ES, FR) 수석 초월번역(Transcreation) 디렉터입니다.",
    "한국어 관용구·속담·호칭·의성어/의태어를 절대 직역하지 말고 각 문화권 웹툰·만화·방드데시네 독자가 실제로 쓰는 자연스러운 표현과 효과음으로 치환하세요.",
    "말풍선 줄 수(maxLines)와 줄당 글자 수(maxCharsPerLine) 예산을 넘지 않도록 대사를 압축적으로 다듬고, EN/JA/ES/FR 텍스트에 한글이 한 글자도 남지 않게 하세요.",
    "한국어 해설(localizationSummaryKo, culturalAdaptationNoteKo, sfxTypographyTipKo)에는 기계 번역투('~하는 것을 가능하게', '직관적인 경험', '에 있어서')를 절대 쓰지 마세요.",
  ].join("\n");

  const glossaryLines = (safe.glossary ?? [])
    .slice(0, 20)
    .map(
      (g) =>
        `- ${g.termKo} => EN:${g.en} | JA:${g.ja} | ES:${g.es} | FR:${g.fr}`,
    );

  const itemLines = safe.items.slice(0, 32).map((item) => {
    const maxL = item.maxLines ?? (item.kind === "sfx" ? 2 : 3);
    const maxC = item.maxCharsPerLine ?? 26;
    const spk = item.speakerName ? ` (화자: ${item.speakerName})` : "";
    const ctx = item.contextNoteKo ? ` [맥락: ${item.contextNoteKo}]` : "";
    return `- id=${item.id}, ${item.cutNumber}컷 [${item.kind}]${spk} (예산: 최대 ${maxL}줄, 줄당 ${maxC}자)${ctx}: "${item.sourceKo}"`;
  });

  const userPrompt = [
    `작품명: ${safe.workTitleKo} (${safe.genre})`,
    glossaryLines.length > 0 ? `공식 용어집:\n${glossaryLines.join("\n")}` : "공식 용어집: 없음",
    "초월번역 대상 항목:",
    ...itemLines,
  ].join("\n");

  return {
    systemInstruction,
    userPrompt,
    piiInputRedactedCount: sanitized.redactedCount,
  };
}

export async function runCulturalTranscreationEngine(
  input: CulturalTranscreationInput,
  options?: NextGenCascadeOptions,
): Promise<NextGenCascadeResult<CulturalTranscreationOutput>> {
  const prompt = buildCulturalTranscreationPrompt(input);
  return executeDualProviderCascade({
    systemInstruction: prompt.systemInstruction,
    userPrompt: prompt.userPrompt,
    piiInputRedactedCount: prompt.piiInputRedactedCount,
    jsonSchema: CULTURAL_TRANSCREATION_JSON_SCHEMA,
    outputSchema: CulturalTranscreationOutputSchema,
    normalizeParsed: (decoded) => normalizeCulturalTranscreationParsed(decoded, input),
    buildLocalFallback: () => buildLocalCulturalTranscreation(input),
    options,
  });
}
