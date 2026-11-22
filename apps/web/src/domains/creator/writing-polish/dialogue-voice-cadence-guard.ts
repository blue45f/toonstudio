/**
 * 캐릭터 말투 일관성 · 모바일 390px 말풍선 호흡 · 의성어 문화권 사전 엔진 (축 29 · #141–#145).
 *
 * 100% 온디바이스(₩0) 순수·결정론 TypeScript 엔진:
 * 1) 캐릭터별 말투 프로파일(반말/존댓말/하십시오체/하오체/고어·선호 어미·호칭 규칙·금지어) 불일치 감지기
 * 2) 모바일 390px 뷰포트 기준 과밀 말풍선 감지기(`18~36자` 최적, `>38자` 2분할 제안) +
 *    `BubbleVariant`별 차등 글자 수 임계치(#145: 일반/독백/내레이션/속삭임)
 * 3) 한국어→영어/일본어 의성어·의태어 문화권 대체 사전(`sfx-cultural-dictionary.ts` 재수출)
 */

import type { BubbleVariant } from "../studio-assets";

export {
  SFX_CULTURAL_DICTIONARY,
  extractAndTranslateSfxInText,
  lookupSfxCulturalAdaptation,
  type SfxCategory,
  type SfxCulturalEntry,
  type SfxCulturalMatch,
  type SfxInlineAdaptation,
} from "./sfx-cultural-dictionary";

export const MOBILE_VIEWPORT_WIDTH_PX = 390;

export type SpeechRegister = "banmal" | "haeyo" | "hapsyo" | "haoche" | "archaic";

export type VoiceMismatchKind =
  | "register-mismatch"
  | "ending-drift"
  | "honorific-mismatch"
  | "forbidden-word";

export interface CharacterHonorificRule {
  readonly targetName: string;
  readonly expectedAddress: string;
  readonly disallowedAddresses: readonly string[];
}

export interface CharacterVoiceProfile {
  readonly characterId: string;
  readonly name: string;
  readonly speechRegister: SpeechRegister;
  readonly preferredEndings: readonly string[];
  readonly strictPreferredEnding?: boolean;
  readonly honorificRules?: readonly CharacterHonorificRule[];
  readonly forbiddenWords: readonly string[];
  readonly allowedExceptions?: readonly string[];
}

export interface DialogueUtteranceInput {
  readonly id: string;
  readonly documentId?: string;
  readonly cutId?: string;
  readonly characterId: string;
  readonly text: string;
  readonly bubbleVariant?: BubbleVariant;
  readonly addresseeName?: string;
}

export interface CharacterVoiceMismatch {
  readonly id: string;
  readonly utteranceId: string;
  readonly documentId?: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly kind: VoiceMismatchKind;
  readonly severity: "warning" | "info";
  readonly matchedSpan: string;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly expectedSummaryKo: string;
  readonly detectedSummaryKo: string;
  readonly suggestionKo: string;
  readonly reasonKo: string;
}

export interface CharacterVoiceConsistencyReport {
  readonly totalUtterancesChecked: number;
  readonly mismatchCount: number;
  readonly consistencyScore: number;
  readonly mismatches: readonly CharacterVoiceMismatch[];
}

export type BubbleCadenceCategory = "standard" | "monologue" | "narration" | "whisper";

export interface BubbleCadenceThreshold {
  readonly category: BubbleCadenceCategory;
  readonly labelKo: string;
  readonly viewportWidthPx: number;
  readonly optimalMinChars: number;
  readonly optimalMaxChars: number;
  readonly splitOverChars: number;
  readonly charsPerLineAt390px: number;
  readonly maxRecommendedLines: number;
}

export interface BubbleTwoWaySplitProposal {
  readonly firstBubble: string;
  readonly secondBubble: string;
  readonly firstCharCount: number;
  readonly secondCharCount: number;
  readonly splitBoundaryKind: "sentence" | "clause" | "whitespace" | "midpoint";
  readonly splitReasonKo: string;
}

export interface MobileBubbleCadenceReport {
  readonly utteranceId: string;
  readonly bubbleVariant: BubbleVariant;
  readonly category: BubbleCadenceCategory;
  readonly threshold: BubbleCadenceThreshold;
  readonly visualCharCount: number;
  readonly nonSpaceCharCount: number;
  readonly estimatedLinesAt390px: number;
  readonly status: "short" | "optimal" | "dense" | "crowded-split";
  readonly needsSplit: boolean;
  readonly splitProposal: BubbleTwoWaySplitProposal | null;
  readonly guidanceKo: string;
}

export const SPEECH_REGISTER_LABELS: Readonly<Record<SpeechRegister, string>> = {
  banmal: "반말 (해체·해라체)",
  haeyo: "존댓말 (해요체)",
  hapsyo: "격식 존댓말 (하십시오체)",
  haoche: "하오체 (사극·중후함)",
  archaic: "고어·하대체 (사극)",
};

/**
 * #145 BubbleVariant별 모바일 390px 차등 글자 수 임계치 표.
 */
export const BUBBLE_CADENCE_THRESHOLDS: Readonly<
  Record<BubbleCadenceCategory, BubbleCadenceThreshold>
> = Object.freeze({
  standard: Object.freeze({
    category: "standard",
    labelKo: "일반 대사 말풍선",
    viewportWidthPx: MOBILE_VIEWPORT_WIDTH_PX,
    optimalMinChars: 18,
    optimalMaxChars: 36,
    splitOverChars: 38,
    charsPerLineAt390px: 12,
    maxRecommendedLines: 3,
  }),
  monologue: Object.freeze({
    category: "monologue",
    labelKo: "독백·속마음 말풍선",
    viewportWidthPx: MOBILE_VIEWPORT_WIDTH_PX,
    optimalMinChars: 16,
    optimalMaxChars: 44,
    splitOverChars: 48,
    charsPerLineAt390px: 14,
    maxRecommendedLines: 4,
  }),
  narration: Object.freeze({
    category: "narration",
    labelKo: "내레이션·설명 박스",
    viewportWidthPx: MOBILE_VIEWPORT_WIDTH_PX,
    optimalMinChars: 20,
    optimalMaxChars: 54,
    splitOverChars: 60,
    charsPerLineAt390px: 18,
    maxRecommendedLines: 4,
  }),
  whisper: Object.freeze({
    category: "whisper",
    labelKo: "속삭임·작은 소리 말풍선",
    viewportWidthPx: MOBILE_VIEWPORT_WIDTH_PX,
    optimalMinChars: 6,
    optimalMaxChars: 22,
    splitOverChars: 26,
    charsPerLineAt390px: 9,
    maxRecommendedLines: 3,
  }),
});

export function resolveBubbleCadenceCategory(
  variant: BubbleVariant = "speech",
): BubbleCadenceCategory {
  switch (variant) {
    case "thought":
    case "cloud-soft":
      return "monologue";
    case "box":
    case "comic-narrative":
    case "system":
    case "digital-code":
      return "narration";
    case "whisper":
    case "scared":
      return "whisper";
    case "speech":
    case "double":
    case "shout":
    case "angry":
    case "explosive":
    case "heart":
    case "phone":
    case "sparkle-magical":
    default:
      return "standard";
  }
}

export function getBubbleCadenceThreshold(
  variant: BubbleVariant = "speech",
): BubbleCadenceThreshold {
  return BUBBLE_CADENCE_THRESHOLDS[resolveBubbleCadenceCategory(variant)];
}

const NON_HAEYO_YO_NOUNS =
  /(?:필요|중요|개요|소요|가요|동요|민요|요요|수요|강요|주요|일요|월요|화요|목요|금요|토요)$/u;
const HAPSYO_END_PATTERN =
  /(?:습니다|ㅂ니다|습니까|ㅂ니까|십시오|시옵소서|옵니다|옵소서|입니다|였습니다|었습니다|았습니다|겠습니다|드립니다)$/u;
const HAEYO_END_PATTERN =
  /(?:해요|세요|예요|이에요|군요|네요|까요|을까요|ㄹ까요|나요|아요|어요|여요|죠|지요|래요|대요|거예요|건가요|인가요|신가요|잖아요|거든요|던가요|데요|을게요|ㄹ게요|게요|볼게요|할게요|요)$/u;
const HAOCHE_END_PATTERN =
  /(?:하오|겠소|었소|았소|였소|구려|시오|이오|라오|는구려|겠구려|지오|마오|소)$/u;
const ARCHAIC_END_PATTERN = /(?:느냐|거라|도다|노라|이니라|하거라|로다|렷다|지어다)$/u;
const BANMAL_END_PATTERN =
  /(?:잖아|거든|거야|할게|갈게|볼게|줄게|할래|갈래|볼래|했어|갔어|왔어|봤어|줬어|먹어|알아|몰라|맞아|아니야|뭐야|누구야|어디야|왜야|진짜야|그랬어|그럴게|할거야|있어|없어|됐어|싫어|좋아|해줘|줘|봐|와|가|해|야|어|아|지|냐|니|네|군|구나|다|란다|더라|래|대|응|아니)$/u;

function cleanSentenceTail(sentence: string): string {
  return sentence.trim().replace(/[.!?…~"'”’)\]\s]+$/gu, "");
}

function splitDialogueSentences(
  text: string,
): readonly { readonly text: string; readonly start: number; readonly end: number }[] {
  const result: { readonly text: string; readonly start: number; readonly end: number }[] = [];
  const pattern = /[^.!?\n…]+[.!?…]*/gu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0] ?? "";
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lead = raw.length - raw.trimStart().length;
    const start = (match.index ?? 0) + lead;
    result.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return result;
}

/** 한국어 대사 한 문장의 종결 말투를 로컬 분류한다. */
export function classifyKoreanSentenceRegister(sentence: string): SpeechRegister | "neutral" {
  const cleaned = cleanSentenceTail(sentence);
  if (cleaned.length === 0) return "neutral";
  if (/^(?:네|예)$/u.test(cleaned)) return "haeyo";
  if (/^(?:응|어|어어|그래|야)$/u.test(cleaned)) return "banmal";
  if (cleaned.length <= 1) return "neutral";

  if (HAPSYO_END_PATTERN.test(cleaned)) return "hapsyo";
  if (ARCHAIC_END_PATTERN.test(cleaned)) return "archaic";
  if (
    HAOCHE_END_PATTERN.test(cleaned) &&
    !/(?:미소|주소|장소|장교|청소|취소|축소|요소)$/u.test(cleaned)
  ) {
    return "haoche";
  }
  if (HAEYO_END_PATTERN.test(cleaned) && !NON_HAEYO_YO_NOUNS.test(cleaned)) return "haeyo";
  if (BANMAL_END_PATTERN.test(cleaned)) return "banmal";
  return "neutral";
}

function suggestRegisterRewrite(sentence: string, expected: SpeechRegister): string {
  const cleaned = cleanSentenceTail(sentence);
  const punct = sentence.trim().slice(cleaned.length) || ".";
  if (expected === "banmal") {
    if (cleaned.endsWith("습니다")) return `${cleaned.slice(0, -3)}어${punct}`;
    if (cleaned.endsWith("해요")) return `${cleaned.slice(0, -2)}해${punct}`;
    if (cleaned.endsWith("세요")) return `${cleaned.slice(0, -2)}어${punct}`;
    if (cleaned.endsWith("요")) return `${cleaned.slice(0, -1)}${punct}`;
    return `${cleaned} (반말 어미로 교정 권장)`;
  }
  if (expected === "haeyo") {
    if (cleaned.endsWith("습니다")) return `${cleaned.slice(0, -3)}어요${punct}`;
    if (cleaned.endsWith("해")) return `${cleaned}요${punct}`;
    if (cleaned.endsWith("어") || cleaned.endsWith("아") || cleaned.endsWith("지")) {
      return `${cleaned}요${punct}`;
    }
    if (cleaned.endsWith("야")) return `${cleaned.slice(0, -1)}예요${punct}`;
    return `${cleaned}요${punct}`;
  }
  if (expected === "hapsyo") {
    if (cleaned.endsWith("해요")) return `${cleaned.slice(0, -2)}합니다${punct}`;
    if (cleaned.endsWith("요")) return `${cleaned.slice(0, -1)}습니다${punct}`;
    return `${cleaned} (하십시오체 어미로 교정 권장)`;
  }
  if (expected === "haoche") {
    if (cleaned.endsWith("요")) return `${cleaned.slice(0, -1)}오${punct}`;
    return `${cleaned} (하오체 '~오/~소/~구려'로 교정 권장)`;
  }
  return `${cleaned} (${SPEECH_REGISTER_LABELS[expected]}로 교정 권장)`;
}

function normalizeEndingToken(ending: string): string {
  return ending.trim().replace(/^~/u, "");
}

/** 캐릭터별 말투 프로파일(반말/존댓말·어미·호칭·금지어) 불일치를 감지한다. */
export function detectCharacterVoiceMismatches(
  utterances: readonly DialogueUtteranceInput[],
  profiles: readonly CharacterVoiceProfile[],
): CharacterVoiceConsistencyReport {
  const profileById = new Map<string, CharacterVoiceProfile>();
  for (const profile of profiles) profileById.set(profile.characterId, profile);

  const mismatches: CharacterVoiceMismatch[] = [];
  let checkedCount = 0;

  for (const utterance of utterances) {
    const profile = profileById.get(utterance.characterId);
    if (!profile) continue;
    checkedCount += 1;

    const exceptions = profile.allowedExceptions ?? [];
    for (const sentence of splitDialogueSentences(utterance.text)) {
      if (exceptions.some((ex) => ex.length > 0 && sentence.text.includes(ex))) continue;
      const detected = classifyKoreanSentenceRegister(sentence.text);
      if (detected !== "neutral" && profile.speechRegister !== detected) {
        mismatches.push(
          Object.freeze({
            id: `${utterance.id}:register:${sentence.start}`,
            utteranceId: utterance.id,
            documentId: utterance.documentId,
            characterId: profile.characterId,
            characterName: profile.name,
            kind: "register-mismatch",
            severity: "warning",
            matchedSpan: sentence.text,
            startOffset: sentence.start,
            endOffset: sentence.end,
            expectedSummaryKo: SPEECH_REGISTER_LABELS[profile.speechRegister],
            detectedSummaryKo: SPEECH_REGISTER_LABELS[detected],
            suggestionKo: suggestRegisterRewrite(sentence.text, profile.speechRegister),
            reasonKo: `${profile.name} 캐릭터는 ${SPEECH_REGISTER_LABELS[profile.speechRegister]} 설정이지만 '${SPEECH_REGISTER_LABELS[detected]}' 종결이 감지됐어요.`,
          }),
        );
      } else if (profile.strictPreferredEnding && profile.preferredEndings.length > 0) {
        const tail = cleanSentenceTail(sentence.text);
        if (tail.length >= 3) {
          const matchesPreferred = profile.preferredEndings.some((ending) => {
            const cleanEnd = normalizeEndingToken(ending);
            return cleanEnd.length > 0 && tail.endsWith(cleanEnd);
          });
          if (!matchesPreferred) {
            mismatches.push(
              Object.freeze({
                id: `${utterance.id}:ending:${sentence.start}`,
                utteranceId: utterance.id,
                documentId: utterance.documentId,
                characterId: profile.characterId,
                characterName: profile.name,
                kind: "ending-drift",
                severity: "info",
                matchedSpan: sentence.text,
                startOffset: sentence.start,
                endOffset: sentence.end,
                expectedSummaryKo: `선호 어미 (${profile.preferredEndings.join(", ")})`,
                detectedSummaryKo: `기타 어미 ("${tail.slice(-3)}")`,
                suggestionKo: `${tail}${normalizeEndingToken(profile.preferredEndings[0] ?? "")}`,
                reasonKo: `${profile.name} 캐릭터의 고유 말버릇 어미(${profile.preferredEndings.join(", ")})가 빠져 있어요.`,
              }),
            );
          }
        }
      }
    }

    for (const rule of profile.honorificRules ?? []) {
      if (utterance.addresseeName && utterance.addresseeName !== rule.targetName) continue;
      for (const disallowed of rule.disallowedAddresses) {
        if (!disallowed) continue;
        let searchFrom = 0;
        while (searchFrom < utterance.text.length) {
          const idx = utterance.text.indexOf(disallowed, searchFrom);
          if (idx < 0) break;
          mismatches.push(
            Object.freeze({
              id: `${utterance.id}:honorific:${idx}:${disallowed}`,
              utteranceId: utterance.id,
              documentId: utterance.documentId,
              characterId: profile.characterId,
              characterName: profile.name,
              kind: "honorific-mismatch",
              severity: "warning",
              matchedSpan: disallowed,
              startOffset: idx,
              endOffset: idx + disallowed.length,
              expectedSummaryKo: `${rule.targetName} 호칭: "${rule.expectedAddress}"`,
              detectedSummaryKo: `금지/이탈 호칭: "${disallowed}"`,
              suggestionKo: utterance.text.replace(disallowed, rule.expectedAddress),
              reasonKo: `${profile.name}은(는) ${rule.targetName}을(를) "${rule.expectedAddress}"(으)로 부르도록 설정돼 있어요.`,
            }),
          );
          searchFrom = idx + disallowed.length;
        }
      }
    }

    for (const forbidden of profile.forbiddenWords) {
      if (!forbidden.trim() || exceptions.some((ex) => ex.includes(forbidden))) continue;
      const lowerText = utterance.text.toLowerCase();
      const lowerForbidden = forbidden.toLowerCase();
      let searchFrom = 0;
      while (searchFrom < lowerText.length) {
        const idx = lowerText.indexOf(lowerForbidden, searchFrom);
        if (idx < 0) break;
        const matched = utterance.text.slice(idx, idx + forbidden.length);
        mismatches.push(
          Object.freeze({
            id: `${utterance.id}:forbidden:${idx}:${forbidden}`,
            utteranceId: utterance.id,
            documentId: utterance.documentId,
            characterId: profile.characterId,
            characterName: profile.name,
            kind: "forbidden-word",
            severity: "warning",
            matchedSpan: matched,
            startOffset: idx,
            endOffset: idx + forbidden.length,
            expectedSummaryKo: "캐릭터 금지어 제외",
            detectedSummaryKo: `금지어 "${matched}"`,
            suggestionKo: utterance.text.replace(matched, "").replace(/\s{2,}/gu, " ").trim(),
            reasonKo: `"${matched}"은(는) ${profile.name} 캐릭터 프로파일의 금지어 목록에 등록돼 있어요.`,
          }),
        );
        searchFrom = idx + forbidden.length;
      }
    }
  }

  const penalty = mismatches.reduce(
    (sum, item) => sum + (item.severity === "warning" ? 18 : 8),
    0,
  );
  return Object.freeze({
    totalUtterancesChecked: checkedCount,
    mismatchCount: mismatches.length,
    consistencyScore:
      checkedCount === 0 ? 100 : Math.max(0, Math.round(100 - penalty / Math.max(1, checkedCount))),
    mismatches: Object.freeze(mismatches),
  });
}

/** 과밀 말풍선 2분할 제안기: 문장 → 절/쉼표 → 어절 공백 → 중앙 분할 순. */
export function proposeTwoWayBubbleSplit(
  rawText: string,
  splitOverChars: number,
): BubbleTwoWaySplitProposal {
  const normalized = rawText.trim().replace(/\s+/gu, " ");
  const len = normalized.length;
  const mid = len / 2;
  const minPos = Math.max(4, Math.floor(len * 0.25));
  const maxPos = Math.min(len - 4, Math.ceil(len * 0.75));

  const pickBestIndex = (candidates: readonly number[]): number | null => {
    const valid = candidates.filter((idx) => idx >= minPos && idx <= maxPos);
    if (valid.length === 0) return null;
    return valid.reduce((best, curr) => (Math.abs(curr - mid) < Math.abs(best - mid) ? curr : best));
  };

  const makeSplit = (
    cutAt: number,
    splitBoundaryKind: BubbleTwoWaySplitProposal["splitBoundaryKind"],
    splitReasonKo: string,
  ): BubbleTwoWaySplitProposal => {
    const first = normalized.slice(0, cutAt).trim();
    const second = normalized.slice(cutAt).trim();
    return Object.freeze({
      firstBubble: first,
      secondBubble: second,
      firstCharCount: first.length,
      secondCharCount: second.length,
      splitBoundaryKind,
      splitReasonKo,
    });
  };

  const sentenceIndices = [...normalized.matchAll(/[.!?…]\s+/gu)]
    .map((m) => (m.index ?? 0) + m[0].length);
  const sentenceSplit = pickBestIndex(sentenceIndices);
  if (sentenceSplit !== null) {
    return makeSplit(
      sentenceSplit,
      "sentence",
      `모바일 ${MOBILE_VIEWPORT_WIDTH_PX}px 가독성 기준(${splitOverChars}자 초과)에 맞춰 문장 경계에서 2개 말풍선으로 나눴어요.`,
    );
  }

  const clauseIndices = [
    ...normalized.matchAll(/(?:,|지만|는데|거든|니까|해서|하고|인데|면서)\s+/gu),
  ].map((m) => (m.index ?? 0) + m[0].length);
  const clauseSplit = pickBestIndex(clauseIndices);
  if (clauseSplit !== null) {
    return makeSplit(
      clauseSplit,
      "clause",
      `절·쉼표 호흡 경계에서 2분할해 모바일 ${MOBILE_VIEWPORT_WIDTH_PX}px 시선 피로를 줄였어요.`,
    );
  }

  const spaceIndices: number[] = [];
  for (let i = 0; i < len; i += 1) {
    if (normalized[i] === " ") spaceIndices.push(i + 1);
  }
  const spaceSplit = pickBestIndex(spaceIndices);
  if (spaceSplit !== null) {
    return makeSplit(
      spaceSplit,
      "whitespace",
      `어절 단위로 균등 2분할해 한 말풍선 길이를 ${splitOverChars}자 이내로 맞췄어요.`,
    );
  }

  return makeSplit(
    Math.round(mid),
    "midpoint",
    `공백이 없는 긴 대사를 중앙에서 2분할해 모바일 ${MOBILE_VIEWPORT_WIDTH_PX}px 말풍선 넘침을 방지했어요.`,
  );
}

/** 모바일 390px 기준 말풍선 과밀도 평가 + BubbleVariant별 차등 임계치 적용 (#145). */
export function evaluateMobileBubbleCadence(options: {
  readonly utteranceId: string;
  readonly text: string;
  readonly bubbleVariant?: BubbleVariant;
}): MobileBubbleCadenceReport {
  const bubbleVariant: BubbleVariant = options.bubbleVariant ?? "speech";
  const category = resolveBubbleCadenceCategory(bubbleVariant);
  const threshold = BUBBLE_CADENCE_THRESHOLDS[category];
  const normalized = options.text.trim().replace(/\s+/gu, " ");
  const visualCharCount = normalized.length;
  const nonSpaceCharCount = normalized.replace(/\s+/gu, "").length;
  const estimatedLinesAt390px =
    visualCharCount === 0
      ? 0
      : Math.max(1, Math.ceil(visualCharCount / threshold.charsPerLineAt390px));

  let status: MobileBubbleCadenceReport["status"] = "optimal";
  let needsSplit = false;
  let splitProposal: BubbleTwoWaySplitProposal | null = null;
  let guidanceKo = `모바일 ${MOBILE_VIEWPORT_WIDTH_PX}px 최적 호흡(${threshold.optimalMinChars}~${threshold.optimalMaxChars}자) 범위예요.`;

  if (visualCharCount > threshold.splitOverChars) {
    status = "crowded-split";
    needsSplit = true;
    splitProposal = proposeTwoWayBubbleSplit(normalized, threshold.splitOverChars);
    guidanceKo = `${threshold.labelKo} 과밀(${visualCharCount}자 > ${threshold.splitOverChars}자 · 약 ${estimatedLinesAt390px}줄). 2개 말풍선으로 분할을 권장해요.`;
  } else if (visualCharCount > threshold.optimalMaxChars) {
    status = "dense";
    guidanceKo = `${threshold.labelKo} 권장 상한(${threshold.optimalMaxChars}자)에 근접했어요(${visualCharCount}자). 어절을 조금 줄이면 호흡이 더 가벼워져요.`;
  } else if (visualCharCount < threshold.optimalMinChars) {
    status = "short";
    guidanceKo = `짧고 빠른 호흡(${visualCharCount}자)이에요. 템포가 빠른 액션·리액션 컷에 알맞아요.`;
  }

  return Object.freeze({
    utteranceId: options.utteranceId,
    bubbleVariant,
    category,
    threshold,
    visualCharCount,
    nonSpaceCharCount,
    estimatedLinesAt390px,
    status,
    needsSplit,
    splitProposal,
    guidanceKo,
  });
}

export function evaluateMobileBubbleCadenceBatch(
  utterances: readonly Pick<DialogueUtteranceInput, "id" | "text" | "bubbleVariant">[],
): readonly MobileBubbleCadenceReport[] {
  return Object.freeze(
    utterances.map((item) =>
      evaluateMobileBubbleCadence({
        utteranceId: item.id,
        text: item.text,
        bubbleVariant: item.bubbleVariant,
      }),
    ),
  );
}

export const DEFAULT_DEMO_VOICE_PROFILES: readonly CharacterVoiceProfile[] = Object.freeze([
  {
    characterId: "char-seojun",
    name: "서준 (냉철한 반말 주인공)",
    speechRegister: "banmal",
    preferredEndings: ["~어", "~지", "~야", "~다"],
    honorificRules: [
      {
        targetName: "선배",
        expectedAddress: "선배",
        disallowedAddresses: ["형님", "사장님"],
      },
    ],
    forbiddenWords: ["ㅋㅋ", "레전드", "죄송합니다"],
  },
  {
    characterId: "char-yuna",
    name: "유나 (정중한 해요체 조력자)",
    speechRegister: "haeyo",
    preferredEndings: ["~요", "~세요", "~게요"],
    honorificRules: [
      {
        targetName: "서준",
        expectedAddress: "서준 씨",
        disallowedAddresses: ["야", "너 이 녀석"],
      },
    ],
    forbiddenWords: ["짜증나", "닥쳐"],
  },
]);
