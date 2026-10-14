/**
 * Studio Dialogue Voice — 캐릭터 말투 지문(순수 코어).
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * `studio-dialogue-spellcheck.ts`는 "글자"를 본다 — 오탈자·띄어쓰기는 캐릭터가
 * 누구든 같은 규칙으로 판정한다. 그런데 장기 연재·팀 작업에서 독자가 댓글로
 * 지적하는 단골 사고는 글자가 아니라 "인물"이다: 평소 반말인 캐릭터가 갑자기
 * 존댓말을 남발하거나, 짧게 끊어 말하던 캐릭터가 설명조 장문을 늘어놓는 것.
 * 용어집은 단어 일관성만 잡고 말투는 못 잡았다(창의 기능 보고서 L-1).
 *
 * 이 모듈이 추가하는 것:
 *  · 대사 일괄 수집(DialogueBatchItem) + 호출부가 준 화자 귀속을 입력으로,
 *    캐릭터별 말투 프로필(종결 어미 분포·평균 문장 길이(어절)·대표 표현·
 *    말투 경향)을 집계한다. 원본 대사를 복제해 저장하지 않는다 — 집계만 남는다.
 *  · 새 대사가 프로필에서 크게 벗어나면 "제안"으로만 표시한다. 자동 수정은
 *    어디에도 없다 — 이 모듈의 어떤 반환값에도 고치기 후보(fix)가 없다.
 *    대사는 연기·위장·감정 폭발처럼 "일부러 벗어나는" 것이 정상인 영역이라,
 *    제안은 무시할 수 있고 회차 단위로 예외를 지정할 수 있다.
 *
 * 정직성 규칙 (spellcheck 와 같은 규율):
 *  · 화자 귀속은 지어내지 않는다. DialogueBatchItem 에는 화자 필드가 없으므로
 *    귀속은 호출부가 명시적으로 준 맵(attributionByItemId)으로만 받는다.
 *    맵에 없는 대사는 "귀속 없음"이며, 그 비율(귀속률)이 그대로 드러난다.
 *  · 표본·귀속률이 기준에 못 미치면 프로필 자체를 만들지 않는다(null).
 *    부족한 데이터로 만든 지문은 거짓 정밀도다. 사유는 eligibility 로
 *    숫자와 함께 돌려줘서, 표면이 "왜 없는지"를 작가에게 말할 수 있게 한다.
 *  · 형태소 분석을 하지 않는다. 어미는 문장 끝 문자열의 접미 일치로만
 *    분류하므로, 분류할 수 없는 문장은 "기타"로 정직하게 비워 둔다.
 *  · 숨김 대사는 기본 제외다(화면에 없는 대사는 작품의 말투가 아니다 —
 *    spellcheck 의 기본값과 같다). 잠긴 대사는 포함한다(읽기는 잠금과 무관).
 *
 * 규칙:
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 사용자 노출 문자열은 한글.
 *  - 입력 배열/객체는 절대 변형하지 않는다.
 */

import { dialogueExcerpt, type DialogueBatchItem } from "./studio-dialogue-batch";

// ── 기준값 ────────────────────────────────────────────────────────────────

/** 프로필을 만들 최소 표본(캐릭터 대사 수) — 미만이면 지문을 생성하지 않는다. */
export const VOICE_FINGERPRINT_MIN_SAMPLES = 30;
/** 프로필을 만들 최소 화자 귀속률(0..1) — 미만이면 지문을 생성하지 않는다. */
export const VOICE_FINGERPRINT_MIN_ATTRIBUTION = 0.6;
/** 어미 분포에 "드문 어미"로 칠 비율 경계 — 이보다 낮으면 이탈 후보가 된다. */
export const VOICE_RARE_ENDING_RATIO = 0.03;

// ── 데이터 모델 ─────────────────────────────────────────────────────────────

/** 작가가 직접 정한 규칙 — 자동 집계가 절대 덮지 않는 영역. */
export interface VoiceAuthorRules {
  /** 이 표현이 나오면 무조건 제안한다(통계와 무관). */
  readonly forbiddenPhrases: readonly string[];
  /** 작가가 고정한 대표 표현 — 집계 대표 표현보다 앞에 붙는다. */
  readonly pinnedSignaturePhrases: readonly string[];
  readonly notes: string;
}

export const EMPTY_VOICE_AUTHOR_RULES: VoiceAuthorRules = Object.freeze({
  forbiddenPhrases: Object.freeze([]),
  pinnedSignaturePhrases: Object.freeze([]),
  notes: "",
});

/**
 * 화자 귀속이 붙은 대사 한 줄 — 이 모듈의 입력 단위.
 * speakerId 가 null 이면 "화자를 모르는 대사"다(귀속률의 분모에만 들어간다).
 */
export interface VoiceAttributedLine {
  readonly id: string;
  readonly text: string;
  readonly speakerId: string | null;
  /** 회차 예외 지정의 단위. 모르면 null. */
  readonly episodeId?: string | null;
  readonly pageId?: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex?: number;
}

/** 말투 경향 — 어미 접미 분류로만 정한다. 판정할 수 없으면 "unknown". */
export type VoicePolitenessLevel = "formal" | "polite" | "plain" | "casual" | "unknown";

export interface VoiceEndingStat {
  readonly ending: string;
  readonly count: number;
  /** 이 캐릭터의 전체 (분류된) 문장 중 비율 0..1. */
  readonly ratio: number;
  readonly politeness: VoicePolitenessLevel;
}

export interface VoiceSignaturePhrase {
  readonly phrase: string;
  /** 이 표현이 등장한 대사 수. */
  readonly lineCount: number;
  /** 표본 대사 중 비율 0..1. */
  readonly ratio: number;
  /** 작가가 고정한 표현이면 true(집계가 아니라 선언). */
  readonly pinned: boolean;
}

/** 캐릭터 말투 지문 — 대사 원문이 아니라 집계만 담는다. */
export interface VoiceFingerprint {
  readonly characterId: string;
  /** 이 캐릭터로 귀속된 대사 수(집계에 쓰인 표본). */
  readonly sampleLineCount: number;
  /** 귀속률을 계산한 전체 대사 수(숨김 제외 기준). */
  readonly totalLineCount: number;
  /** 전체 대사 중 화자가 확인된 비율 0..1. */
  readonly attributionRatio: number;
  /** 종결 어미 분포 — 비율 내림차순, 동률은 어미 오름차순(결정적). */
  readonly endingDistribution: readonly VoiceEndingStat[];
  /** 문장 길이 평균(어절). 문장이 하나도 분류되지 않았으면 0. */
  readonly averageSentenceLength: number;
  /** 문장 길이 표준편차(어절) — 길이 이탈 판정의 재료. */
  readonly sentenceLengthStdDev: number;
  /** 대표 표현 — 고정 표현 먼저, 그다음 집계 빈도순. */
  readonly signaturePhrases: readonly VoiceSignaturePhrase[];
  /** 가장 잦은 말투 경향. 분류된 문장이 없으면 null. */
  readonly dominantPoliteness: { readonly level: VoicePolitenessLevel; readonly ratio: number } | null;
  readonly authorRules: VoiceAuthorRules;
  /** 집계 시각(ISO). 호출부가 주지 않으면 생성 시각. */
  readonly updatedAt: string;
}

export type VoiceFingerprintBlockReason = "no-lines" | "low-attribution" | "insufficient-samples";

/** 프로필 생성 가능 여부 — 불가면 숫자와 함께 이유를 돌려준다(표면 안내용). */
export interface VoiceFingerprintEligibility {
  readonly ok: boolean;
  readonly reason: VoiceFingerprintBlockReason | null;
  readonly characterLineCount: number;
  readonly totalLineCount: number;
  readonly attributionRatio: number;
  /** 작가에게 그대로 보여 줄 수 있는 한 줄 안내. ok 면 빈 문자열. */
  readonly message: string;
}

export type VoiceDeviationKind = "ending-shift" | "length-outlier" | "forbidden-phrase";

/**
 * 말투 이탈 "제안" — spellcheck 의 finding 과 달리 fix 가 없다.
 * 고칠 문장을 제시하지 않는다: 판단과 수정은 전부 작가의 몫이다.
 */
export interface VoiceDeviation {
  /** `${lineId}:${kind}` — 무시(disposition) 키와 같다. */
  readonly id: string;
  readonly lineId: string;
  readonly characterId: string;
  readonly episodeId: string | null;
  readonly pageId: string | null;
  readonly pageIndex: number | null;
  readonly kind: VoiceDeviationKind;
  /** 근거를 숫자로 말하는 한 줄 설명 — 전부 "제안" 어조. */
  readonly detail: string;
  /** 대사 한 줄 미리보기(목록 행 식별용). */
  readonly excerpt: string;
}

export interface VoiceDeviationOptions {
  /** 무시한 제안 키(voiceDeviationKey) — 그 제안만 숨긴다. */
  readonly dismissedKeys?: ReadonlySet<string>;
  /** 통째로 무시한 대사 id. */
  readonly dismissedLineIds?: ReadonlySet<string>;
  /** 회차 단위 예외로 지정된 episodeId — 그 회차 대사는 제안하지 않는다. */
  readonly exceptedEpisodeIds?: ReadonlySet<string>;
  /** 대사 단위 예외(연기·위장 장면 등). */
  readonly exceptedLineIds?: ReadonlySet<string>;
}

/** 무시·예외 처분 — 표면이 소유하고, 저장 방식은 호스트가 정한다. */
export interface VoiceReviewDispositions {
  readonly dismissedKeys: readonly string[];
  readonly exceptedEpisodeIds: readonly string[];
}

export const EMPTY_VOICE_DISPOSITIONS: VoiceReviewDispositions = Object.freeze({
  dismissedKeys: Object.freeze([]),
  exceptedEpisodeIds: Object.freeze([]),
});

// ── 귀속 어댑터 ─────────────────────────────────────────────────────────────

type AttributionSource =
  | ReadonlyMap<string, string | null>
  | Readonly<Record<string, string | null>>
  | null
  | undefined;

function readAttribution(source: AttributionSource, id: string): string | null {
  if (!source) return null;
  if (source instanceof Map) {
    const fromMap = source.get(id);
    return typeof fromMap === "string" && fromMap.trim() ? fromMap : null;
  }
  // 여기 도달하면 Map 이 아니므로 레코드다(ReadonlyMap 은 인터페이스라
  // instanceof 좁히기가 닿지 않아, 위 분기를 거친 뒤에만 이 단언이 성립한다).
  const record = source as Readonly<Record<string, string | null>>;
  const fromRecord: string | null | undefined = record[id];
  return typeof fromRecord === "string" && fromRecord.trim() ? fromRecord : null;
}

/**
 * 일괄 수집 대사에 호출부가 준 귀속을 붙인다. 맵에 없는 대사는 speakerId null —
 * "모름"을 임의의 캐릭터로 채우는 일은 절대 하지 않는다.
 * episodeId 도 같은 방식으로만 받는다(페이지 id를 회차로 착각하지 않는다).
 */
export function voiceLinesFromDialogueItems(
  items: readonly DialogueBatchItem[],
  attributionByItemId?: AttributionSource,
  episodeIdByItemId?: AttributionSource,
  options: { includeHidden?: boolean } = {},
): VoiceAttributedLine[] {
  const includeHidden = options.includeHidden ?? false;
  const out: VoiceAttributedLine[] = [];
  for (const item of items) {
    if (item.hidden && !includeHidden) continue;
    out.push({
      id: item.id,
      text: item.text,
      speakerId: readAttribution(attributionByItemId, item.id),
      episodeId: readAttribution(episodeIdByItemId, item.id),
      pageId: item.pageId,
      pageIndex: item.pageIndex,
    });
  }
  return out;
}

// ── 문장·어미 분석 ──────────────────────────────────────────────────────────

/** 대사를 문장으로 나눈다. 종결 부호와 줄바꿈이 경계다. 빈 문장은 버린다. */
export function splitDialogueSentences(text: string): string[] {
  return (text.match(/[^.!?…\n]+[.!?…]*/g) ?? [])
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/** 어절 수 — 공백으로 나눈 토큰 수(문장 길이의 단위). */
export function countDialogueEojeol(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

/**
 * 어미 분류표 — 긴 접미부터 본다(예: "해요"를 "요"보다 먼저).
 * 형태소 분석이 아니므로 이 표에 없는 어미는 "기타(unknown)"다.
 */
const ENDING_PATTERNS: readonly { readonly ending: string; readonly politeness: VoicePolitenessLevel }[] = [
  { ending: "겠습니다", politeness: "formal" },
  { ending: "습니다", politeness: "formal" },
  { ending: "입니다", politeness: "formal" },
  { ending: "입니까", politeness: "formal" },
  { ending: "십시오", politeness: "formal" },
  { ending: "니다", politeness: "formal" },
  { ending: "이에요", politeness: "polite" },
  { ending: "해요", politeness: "polite" },
  { ending: "예요", politeness: "polite" },
  { ending: "세요", politeness: "polite" },
  { ending: "어요", politeness: "polite" },
  { ending: "아요", politeness: "polite" },
  { ending: "여요", politeness: "polite" },
  { ending: "이죠", politeness: "polite" },
  { ending: "죠", politeness: "polite" },
  { ending: "요", politeness: "polite" },
  { ending: "거야", politeness: "casual" },
  { ending: "이야", politeness: "casual" },
  { ending: "잖아", politeness: "casual" },
  { ending: "거든", politeness: "casual" },
  { ending: "인데", politeness: "casual" },
  { ending: "는데", politeness: "casual" },
  { ending: "냐", politeness: "casual" },
  { ending: "어", politeness: "casual" },
  { ending: "아", politeness: "casual" },
  { ending: "해", politeness: "casual" },
  { ending: "야", politeness: "casual" },
  { ending: "게", politeness: "casual" },
  { ending: "마", politeness: "casual" },
  { ending: "자", politeness: "casual" },
  { ending: "지", politeness: "plain" },
  { ending: "네", politeness: "plain" },
  { ending: "군", politeness: "plain" },
  { ending: "까", politeness: "plain" },
  { ending: "라", politeness: "plain" },
  { ending: "다", politeness: "plain" },
];

/** 분류할 수 없는 문장의 어미 버킷. */
export const VOICE_UNKNOWN_ENDING = "기타";

const TRAILING_NOISE = /[\s.!?…~"'"”’」』)）]+$/u;

/** 문장 하나의 종결 어미와 말투 경향을 접미 일치로만 분류한다. */
export function extractSentenceEnding(
  sentence: string,
): { ending: string; politeness: VoicePolitenessLevel } {
  const cleaned = sentence.replace(TRAILING_NOISE, "");
  for (const pattern of ENDING_PATTERNS) {
    if (cleaned.endsWith(pattern.ending)) {
      return { ending: pattern.ending, politeness: pattern.politeness };
    }
  }
  return { ending: VOICE_UNKNOWN_ENDING, politeness: "unknown" };
}

// ── 자격 판정 ───────────────────────────────────────────────────────────────

function ratioPercent(ratio: number): number {
  return Math.round(ratio * 100);
}

/**
 * 프로필 생성 자격 — 판정 순서가 곧 안내 우선순위다.
 * 대사가 아예 없으면 no-lines, 귀속이 모자라면 low-attribution,
 * 그다음 이 캐릭터의 표본 부족을 본다.
 */
export function evaluateVoiceFingerprintEligibility(input: {
  readonly totalLineCount: number;
  readonly attributedLineCount: number;
  readonly characterLineCount: number;
}): VoiceFingerprintEligibility {
  const { totalLineCount, attributedLineCount, characterLineCount } = input;
  const attributionRatio = totalLineCount > 0 ? attributedLineCount / totalLineCount : 0;
  const base = { characterLineCount, totalLineCount, attributionRatio };
  if (totalLineCount === 0) {
    return {
      ...base,
      ok: false,
      reason: "no-lines",
      message: "아직 수집된 대사가 없어 말투 지문을 만들 수 없어요.",
    };
  }
  if (attributionRatio < VOICE_FINGERPRINT_MIN_ATTRIBUTION) {
    return {
      ...base,
      ok: false,
      reason: "low-attribution",
      message: `화자가 확인된 대사가 ${ratioPercent(attributionRatio)}%예요. ${ratioPercent(VOICE_FINGERPRINT_MIN_ATTRIBUTION)}%가 넘어야 지문을 만들어요 — 귀속이 섞인 지문은 엉뚱한 대사를 의심하게 돼요.`,
    };
  }
  if (characterLineCount < VOICE_FINGERPRINT_MIN_SAMPLES) {
    return {
      ...base,
      ok: false,
      reason: "insufficient-samples",
      message: `이 캐릭터의 대사가 ${characterLineCount}개예요. ${VOICE_FINGERPRINT_MIN_SAMPLES}개가 모이면 지문이 생겨요.`,
    };
  }
  return { ...base, ok: true, reason: null, message: "" };
}

// ── 프로필 집계 ─────────────────────────────────────────────────────────────

/** 대표 표현 후보에서 제외하는 기능어 — 어절 표면만으로 거를 수 있는 최소 집합. */
const SIGNATURE_STOPWORDS: ReadonlySet<string> = new Set([
  "그리고",
  "그래서",
  "하지만",
  "그런데",
  "그러니까",
  "그냥",
  "이제",
  "지금",
  "여기",
  "거기",
  "저기",
  "이게",
  "그게",
  "저게",
]);

function signatureToken(raw: string): string {
  return raw.replace(TRAILING_NOISE, "").replace(/^["'“‘「『(（]+/u, "");
}

function collectSignaturePhrases(
  lines: readonly VoiceAttributedLine[],
  authorRules: VoiceAuthorRules,
): VoiceSignaturePhrase[] {
  const sample = lines.length;
  const lineCountByPhrase = new Map<string, number>();
  for (const line of lines) {
    const seenInLine = new Set<string>();
    for (const raw of line.text.split(/\s+/)) {
      const token = signatureToken(raw);
      if (token.length < 2 || SIGNATURE_STOPWORDS.has(token) || /^\d+$/.test(token)) continue;
      if (seenInLine.has(token)) continue;
      seenInLine.add(token);
      lineCountByPhrase.set(token, (lineCountByPhrase.get(token) ?? 0) + 1);
    }
  }
  const minLines = Math.max(3, Math.ceil(sample * 0.1));
  const counted: VoiceSignaturePhrase[] = [...lineCountByPhrase.entries()]
    .filter(([, count]) => count >= minLines)
    .map(([phrase, lineCount]) => ({
      phrase,
      lineCount,
      ratio: sample > 0 ? lineCount / sample : 0,
      pinned: false,
    }))
    .sort(
      (left, right) =>
        right.lineCount - left.lineCount || left.phrase.localeCompare(right.phrase, "ko"),
    );
  const pinnedPhrases = new Set(authorRules.pinnedSignaturePhrases.map((phrase) => phrase.trim()).filter(Boolean));
  const pinned: VoiceSignaturePhrase[] = [...pinnedPhrases].map((phrase) => ({
    phrase,
    lineCount: lineCountByPhrase.get(phrase) ?? 0,
    ratio: sample > 0 ? (lineCountByPhrase.get(phrase) ?? 0) / sample : 0,
    pinned: true,
  }));
  const rest = counted.filter((entry) => !pinnedPhrases.has(entry.phrase));
  return [...pinned, ...rest].slice(0, 8);
}

/**
 * 캐릭터 한 명의 말투 지문을 만든다. 자격 미달이면 null — 호출부는
 * evaluateVoiceFingerprintEligibility 로 사유를 따로 얻을 수 있다.
 * lines 는 전체 대사(귀속 포함)를 그대로 받는다: 귀속률은 전체 기준이고,
 * 표본은 이 캐릭터로 귀속된 대사만 센다.
 */
export function buildVoiceFingerprint(input: {
  readonly characterId: string;
  readonly lines: readonly VoiceAttributedLine[];
  readonly authorRules?: VoiceAuthorRules;
  readonly now?: string;
}): VoiceFingerprint | null {
  const authorRules = input.authorRules ?? EMPTY_VOICE_AUTHOR_RULES;
  const totalLineCount = input.lines.length;
  const attributedLineCount = input.lines.filter((line) => line.speakerId != null).length;
  const characterLines = input.lines.filter(
    (line) => line.speakerId === input.characterId && line.text.trim().length > 0,
  );
  const eligibility = evaluateVoiceFingerprintEligibility({
    totalLineCount,
    attributedLineCount,
    characterLineCount: characterLines.length,
  });
  if (!eligibility.ok) return null;

  const endingCounts = new Map<string, { count: number; politeness: VoicePolitenessLevel }>();
  const politenessCounts = new Map<VoicePolitenessLevel, number>();
  const sentenceLengths: number[] = [];
  let classifiedSentences = 0;
  for (const line of characterLines) {
    for (const sentence of splitDialogueSentences(line.text)) {
      sentenceLengths.push(countDialogueEojeol(sentence));
      const { ending, politeness } = extractSentenceEnding(sentence);
      if (ending === VOICE_UNKNOWN_ENDING) continue;
      classifiedSentences += 1;
      const prev = endingCounts.get(ending);
      endingCounts.set(ending, { count: (prev?.count ?? 0) + 1, politeness });
      politenessCounts.set(politeness, (politenessCounts.get(politeness) ?? 0) + 1);
    }
  }

  const endingDistribution: VoiceEndingStat[] = [...endingCounts.entries()]
    .map(([ending, stat]) => ({
      ending,
      count: stat.count,
      ratio: classifiedSentences > 0 ? stat.count / classifiedSentences : 0,
      politeness: stat.politeness,
    }))
    .sort((left, right) => right.ratio - left.ratio || left.ending.localeCompare(right.ending, "ko"));

  const averageSentenceLength =
    sentenceLengths.length > 0
      ? sentenceLengths.reduce((sum, value) => sum + value, 0) / sentenceLengths.length
      : 0;
  const sentenceLengthStdDev =
    sentenceLengths.length > 0
      ? Math.sqrt(
          sentenceLengths.reduce(
            (sum, value) => sum + (value - averageSentenceLength) ** 2,
            0,
          ) / sentenceLengths.length,
        )
      : 0;

  let dominantPoliteness: VoiceFingerprint["dominantPoliteness"] = null;
  if (classifiedSentences > 0) {
    for (const [level, count] of politenessCounts) {
      const ratio = count / classifiedSentences;
      if (!dominantPoliteness || ratio > dominantPoliteness.ratio) {
        dominantPoliteness = { level, ratio };
      }
    }
  }

  return {
    characterId: input.characterId,
    sampleLineCount: characterLines.length,
    totalLineCount,
    attributionRatio: eligibility.attributionRatio,
    endingDistribution,
    averageSentenceLength,
    sentenceLengthStdDev,
    signaturePhrases: collectSignaturePhrases(characterLines, authorRules),
    dominantPoliteness,
    authorRules,
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

/** 캐릭터별 지문 결과 한 장 — 지문이 없으면 eligibility 가 그 이유를 들고 있다. */
export interface VoiceCharacterProfileResult {
  readonly characterId: string;
  readonly fingerprint: VoiceFingerprint | null;
  readonly eligibility: VoiceFingerprintEligibility;
}

/** 여러 캐릭터의 지문을 한 번에 만든다(표면의 카드 목록용). */
export function buildVoiceProfiles(input: {
  readonly lines: readonly VoiceAttributedLine[];
  readonly characterIds: readonly string[];
  readonly authorRulesByCharacterId?: Readonly<Record<string, VoiceAuthorRules>>;
  readonly now?: string;
}): VoiceCharacterProfileResult[] {
  const totalLineCount = input.lines.length;
  const attributedLineCount = input.lines.filter((line) => line.speakerId != null).length;
  return input.characterIds.map((characterId) => {
    const characterLineCount = input.lines.filter(
      (line) => line.speakerId === characterId && line.text.trim().length > 0,
    ).length;
    const eligibility = evaluateVoiceFingerprintEligibility({
      totalLineCount,
      attributedLineCount,
      characterLineCount,
    });
    const fingerprint = eligibility.ok
      ? buildVoiceFingerprint({
          characterId,
          lines: input.lines,
          authorRules: input.authorRulesByCharacterId?.[characterId],
          now: input.now,
        })
      : null;
    return { characterId, fingerprint, eligibility };
  });
}

// ── 이탈 제안 ───────────────────────────────────────────────────────────────

/** 제안 키 — 무시 처분은 이 키 단위로 남는다. */
export function voiceDeviationKey(lineId: string, kind: VoiceDeviationKind): string {
  return `${lineId}:${kind}`;
}

const POLITENESS_LABEL: Record<VoicePolitenessLevel, string> = {
  formal: "격식체",
  polite: "존댓말",
  plain: "평서체",
  casual: "반말",
  unknown: "분류 없음",
};

function lineMajorityPoliteness(
  sentences: readonly string[],
): { level: VoicePolitenessLevel; endings: { ending: string; politeness: VoicePolitenessLevel }[] } {
  const endings = sentences.map((sentence) => extractSentenceEnding(sentence));
  const counts = new Map<VoicePolitenessLevel, number>();
  for (const entry of endings) {
    if (entry.ending === VOICE_UNKNOWN_ENDING) continue;
    counts.set(entry.politeness, (counts.get(entry.politeness) ?? 0) + 1);
  }
  let level: VoicePolitenessLevel = "unknown";
  let best = 0;
  for (const [candidate, count] of counts) {
    if (count > best) {
      best = count;
      level = candidate;
    }
  }
  return { level, endings };
}

/**
 * 지문에서 벗어난 대사를 "제안"으로만 찾는다. 반환값에 수정안은 없다.
 * - forbidden-phrase: 작가가 정한 금지 표현 — 통계와 무관하게 항상 제안.
 * - ending-shift: 어미의 절반 이상이 지문에 거의 없는 어미(3% 미만)이거나,
 *   지문의 주된 말투 경향(60% 이상)과 대사의 경향이 정면으로 다를 때.
 *   문장 1개짜리 짧은 대사는 경향 충돌일 때만 제안한다(오탐 방지).
 * - length-outlier: 대사 길이가 평균 문장 길이의 1.8배와 평균+2σ 중
 *   더 큰 쪽을 넘고, 평균보다 6어절 이상 길 때만 제안한다.
 * 제외: exceptedLineIds·exceptedEpisodeIds(회차 예외)·dismissed*(무시).
 */
export function findVoiceDeviations(input: {
  readonly fingerprint: VoiceFingerprint;
  readonly lines: readonly VoiceAttributedLine[];
  readonly options?: VoiceDeviationOptions;
}): VoiceDeviation[] {
  const { fingerprint, options } = input;
  const dismissedKeys = options?.dismissedKeys ?? new Set<string>();
  const dismissedLineIds = options?.dismissedLineIds ?? new Set<string>();
  const exceptedEpisodeIds = options?.exceptedEpisodeIds ?? new Set<string>();
  const exceptedLineIds = options?.exceptedLineIds ?? new Set<string>();
  const ratioByEnding = new Map(
    fingerprint.endingDistribution.map((stat) => [stat.ending, stat.ratio]),
  );
  const forbidden = fingerprint.authorRules.forbiddenPhrases
    .map((phrase) => phrase.trim())
    .filter(Boolean);

  const out: VoiceDeviation[] = [];
  const push = (line: VoiceAttributedLine, kind: VoiceDeviationKind, detail: string) => {
    const key = voiceDeviationKey(line.id, kind);
    if (dismissedKeys.has(key)) return;
    out.push({
      id: key,
      lineId: line.id,
      characterId: fingerprint.characterId,
      episodeId: line.episodeId ?? null,
      pageId: line.pageId ?? null,
      pageIndex: line.pageIndex ?? null,
      kind,
      detail,
      excerpt: dialogueExcerpt(line.text),
    });
  };

  for (const line of input.lines) {
    if (line.speakerId !== fingerprint.characterId) continue;
    if (!line.text.trim()) continue;
    if (dismissedLineIds.has(line.id) || exceptedLineIds.has(line.id)) continue;
    if (line.episodeId != null && exceptedEpisodeIds.has(line.episodeId)) continue;

    // 금지 표현 — 작가가 직접 정한 규칙이라 통계 판정보다 먼저, 항상 제안한다.
    const hitForbidden = forbidden.find((phrase) => line.text.includes(phrase));
    if (hitForbidden) {
      push(
        line,
        "forbidden-phrase",
        `작가가 이 캐릭터의 금지 표현으로 정한 "${hitForbidden}"이 들어 있어요. 의도한 장면이면 무시해도 돼요.`,
      );
    }

    const sentences = splitDialogueSentences(line.text);
    if (sentences.length > 0) {
      const { level: lineLevel, endings } = lineMajorityPoliteness(sentences);
      const known = endings.filter((entry) => entry.ending !== VOICE_UNKNOWN_ENDING);
      const rare = known.filter(
        (entry) => (ratioByEnding.get(entry.ending) ?? 0) < VOICE_RARE_ENDING_RATIO,
      );
      const dominant = fingerprint.dominantPoliteness;
      const politenessClash =
        dominant != null &&
        dominant.ratio >= VOICE_FINGERPRINT_MIN_ATTRIBUTION &&
        lineLevel !== "unknown" &&
        dominant.level !== "unknown" &&
        lineLevel !== dominant.level;
      const rareMajority = known.length > 0 && rare.length / known.length >= 0.5;
      if ((rareMajority && sentences.length >= 2) || (rareMajority && politenessClash)) {
        const rareEnding = rare[0]?.ending ?? "기타";
        const rareRatio = ratioPercent(ratioByEnding.get(rareEnding) ?? 0);
        push(
          line,
          "ending-shift",
          politenessClash && dominant
            ? `평소 ${POLITENESS_LABEL[dominant.level]} 경향(${ratioPercent(dominant.ratio)}%)인 캐릭터인데 이 대사는 ${POLITENESS_LABEL[lineLevel]} 어미가 중심이에요. 말투가 바뀐 장면인지 확인해 보세요.`
            : `이 대사의 어미 "${rareEnding}"는 평소 분포에서 ${rareRatio}%밖에 안 나와요. 캐릭터 말투가 흔들린 건 아닌지 확인해 보세요.`,
        );
      } else if (politenessClash && dominant && sentences.length >= 2) {
        push(
          line,
          "ending-shift",
          `평소 ${POLITENESS_LABEL[dominant.level]} 경향(${ratioPercent(dominant.ratio)}%)인 캐릭터인데 이 대사는 ${POLITENESS_LABEL[lineLevel]}로 말해요. 의도한 변화인지 확인해 보세요.`,
        );
      }

      // 길이 이탈 — 대사 전체 어절을 문장 평균과 비교한다.
      const lineEojeol = countDialogueEojeol(line.text);
      const lengthThreshold = Math.max(
        fingerprint.averageSentenceLength * 1.8,
        fingerprint.averageSentenceLength + 2 * fingerprint.sentenceLengthStdDev,
      );
      if (
        fingerprint.averageSentenceLength > 0 &&
        lineEojeol > lengthThreshold &&
        lineEojeol >= fingerprint.averageSentenceLength + 6
      ) {
        push(
          line,
          "length-outlier",
          `이 대사는 ${lineEojeol}어절로, 평소 문장 평균(${fingerprint.averageSentenceLength.toFixed(1)}어절)보다 훨씬 길어요. 설명조로 늘어진 건 아닌지 확인해 보세요.`,
        );
      }
    }
  }
  return out;
}

// ── 처분(무시·회차 예외) ────────────────────────────────────────────────────

/** 제안을 무시한다 — 해당 키만 처분에 쌓고, 원본은 건드리지 않는다. */
export function dismissVoiceDeviation(
  dispositions: VoiceReviewDispositions,
  key: string,
): VoiceReviewDispositions {
  if (dispositions.dismissedKeys.includes(key)) return dispositions;
  return { ...dispositions, dismissedKeys: [...dispositions.dismissedKeys, key] };
}

/** 회차 예외를 켜고 끈다 — 켜진 회차의 대사는 제안을 받지 않는다. */
export function setEpisodeVoiceException(
  dispositions: VoiceReviewDispositions,
  episodeId: string,
  excepted: boolean,
): VoiceReviewDispositions {
  const has = dispositions.exceptedEpisodeIds.includes(episodeId);
  if (excepted === has) return dispositions;
  return {
    ...dispositions,
    exceptedEpisodeIds: excepted
      ? [...dispositions.exceptedEpisodeIds, episodeId]
      : dispositions.exceptedEpisodeIds.filter((id) => id !== episodeId),
  };
}

/** 처분을 findVoiceDeviations 옵션으로 바꾼다. */
export function voiceDeviationOptionsFromDispositions(
  dispositions: VoiceReviewDispositions,
): VoiceDeviationOptions {
  return {
    dismissedKeys: new Set(dispositions.dismissedKeys),
    exceptedEpisodeIds: new Set(dispositions.exceptedEpisodeIds),
  };
}
