/**
 * Studio Writing Polish — 글 고도화 제안(표현 다듬기)의 순수 코어.
 *
 * 왜 맞춤법 검사(studio-dialogue-spellcheck)와 별개 층위인가
 * --------------------------------------------------------
 * 맞춤법 검사는 "틀렸는가"를 본다(오기·띄어쓰기·문장부호). 이 모듈은 틀리지
 * 않았지만 더 잘 읽히는 문장을 본다 — 겹친 표현(다시 또), 이중 피동(되어진다),
 * 장황한 연결(에 있어서·인 것으로 보인다), 문장 첫머리 군더더기, 한 문장에
 * 절이 여럿 매달린 긴 문장, 같은 문장의 되풀이. 맞춤법 규칙과 겹치는 지적
 * (공백·부호·같은 어절 반복)은 이 모듈에서 다루지 않는다 — 층위를 섞으면
 * 사용자가 어느 검사를 끌지 판단할 수 없어진다.
 *
 * 원칙:
 *  - 제안은 선택지다. 어떤 함수도 원문을 자동 확정하지 않는다. 적용은
 *    applyWritingPolishSuggestion(s) 로, 패널에서 사람이 [적용]을 눌렀을 때만.
 *  - 정밀도 우선: 의미가 바뀔 수 있는 재작성(어미 교체·역접 삽입)은 근거가
 *    문법적으로 고정되는 패턴만 쓴다. 확신이 낮은 제안은 severity "info" 로
 *    낮추고 이유에 "말투면 그대로 두세요"를 명시한다.
 *  - 문장당 제안은 최대 1개다(우선순위: 중복 문장 > 긴 문장 나누기 > 표현 축약).
 *    제안끼리 구간이 겹치지 않아 일괄 적용이 오프셋 순서만으로 안전하다.
 *  - 순수·결정적. 입력은 변형하지 않는다. Konva/DOM/네트워크 의존 없음.
 */

export type WritingPolishTargetKind = "synopsis" | "dialogue" | "general";

export type WritingPolishRuleId =
  | "redundant-pair"
  | "double-passive"
  | "verbose-phrase"
  | "nominal-ending"
  | "filler-opener"
  | "repeated-intensifier"
  | "duplicate-sentence"
  | "long-sentence-split";

export type WritingPolishSeverity = "suggestion" | "info";

export interface WritingPolishDocument {
  /** 표면이 문서를 식별하는 id (회차 시놉시스 id, 대사 item id 등). */
  readonly id: string;
  /** 패널 표시용 이름. 예: "3화 줄거리", "12페이지 대사". */
  readonly label: string;
  readonly kind: WritingPolishTargetKind;
  readonly text: string;
}

export interface WritingPolishSuggestion {
  /** 문서+규칙+원문 해시 기반 안정 id — 다른 제안을 적용해도 무시 상태가 유지된다. */
  readonly id: string;
  readonly documentId: string;
  readonly kind: WritingPolishTargetKind;
  /** 문서 안 문장 순번(0 기준). */
  readonly sentenceIndex: number;
  /** 원문 전체에서 문장이 차지하는 [start, end) — 적용·검증의 정본. */
  readonly start: number;
  readonly end: number;
  /** 원문 문장(앞뒤 공백 제거본). start/end 구간과 정확히 같다. */
  readonly original: string;
  /** 제안 문장. duplicate-sentence 에서는 빈 문자열(문장 삭제 제안). */
  readonly suggested: string;
  readonly ruleIds: readonly WritingPolishRuleId[];
  readonly severity: WritingPolishSeverity;
  /** 사용자에게 보여 줄 이유 한 줄. */
  readonly reason: string;
  /** 글자 수 변화(제안−원문). 삭제·축약이면 음수. */
  readonly charDelta: number;
}

export interface WritingPolishOptions {
  readonly disabledRules?: readonly WritingPolishRuleId[];
  /** 긴 문장으로 보는 기준(공백 제외 글자 수). kind 기본값보다 우선한다. */
  readonly longSentenceChars?: number;
  /** info 등급 제안도 포함(기본 true). */
  readonly includeInfo?: boolean;
}

export interface WritingPolishSummary {
  readonly documentCount: number;
  readonly suggestionCount: number;
  readonly byRule: Readonly<Partial<Record<WritingPolishRuleId, number>>>;
  /** 적용하면 줄어드는 총 글자 수(양수=축약량). */
  readonly totalCharsSaved: number;
}

// ── 문장 분리 ────────────────────────────────────────────────────────────────

export interface WritingSentenceSpan {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  /** 앞뒤 공백을 제거한 문장 본문. text.slice(start, end) 와 같다. */
  readonly text: string;
}

const SENTENCE_ENDERS = new Set([".", "!", "?", "…"]);

/**
 * 텍스트를 문장 단위로 나눈다. 종결 부호(. ! ? …)와 줄바꿈이 경계다.
 * 반환 span 은 본문(공백 제거) 구간만 가리켜, 구간 교체로 문장을 통째로
 * 바꿔도 주변 공백·줄바꿈이 보존된다.
 */
export function splitWritingSentences(text: string): readonly WritingSentenceSpan[] {
  const spans: WritingSentenceSpan[] = [];
  let segmentStart = 0;
  const flush = (segmentEnd: number) => {
    const raw = text.slice(segmentStart, segmentEnd);
    if (raw.trim().length === 0) return;
    const lead = raw.length - raw.trimStart().length;
    const trail = raw.length - raw.trimEnd().length;
    const start = segmentStart + lead;
    const end = segmentEnd - trail;
    spans.push(Object.freeze({ index: spans.length, start, end, text: text.slice(start, end) }));
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;
    if (ch === "\n") {
      flush(i);
      segmentStart = i + 1;
    } else if (SENTENCE_ENDERS.has(ch)) {
      // 종결 부호 뒤의 닫는 따옴표·괄호는 문장에 붙인다.
      let j = i + 1;
      while (j < text.length && ["\"", "'", "”", "’", ")", "]"].includes(text[j] as string)) j += 1;
      flush(j);
      segmentStart = j;
      i = j - 1;
    }
  }
  if (segmentStart < text.length) flush(text.length);
  return Object.freeze(spans);
}

// ── 규칙 사전 ────────────────────────────────────────────────────────────────
// 각 항목은 (매치 → 교체) 가 문법적으로 고정되는 경우만 넣는다.

interface PhraseRule {
  readonly pattern: RegExp;
  readonly replacement: string;
  readonly reason: string;
}

/** 겹친 표현 — 두 말이 같은 뜻이라 하나면 충분한 짝. */
const REDUNDANT_PAIRS: readonly PhraseRule[] = [
  { pattern: /다시\s+또/g, replacement: "다시", reason: "\"다시\"와 \"또\"는 뜻이 겹쳐요. 하나면 충분해요." },
  { pattern: /서로\s+상호/g, replacement: "서로", reason: "\"서로\"와 \"상호\"는 뜻이 겹쳐요." },
  { pattern: /상호\s+서로/g, replacement: "서로", reason: "\"상호\"와 \"서로\"는 뜻이 겹쳐요." },
  { pattern: /미리\s+사전에/g, replacement: "미리", reason: "\"미리\"와 \"사전에\"는 뜻이 겹쳐요." },
  { pattern: /사전에\s+미리/g, replacement: "미리", reason: "\"사전에\"와 \"미리\"는 뜻이 겹쳐요." },
  { pattern: /현재\s+지금/g, replacement: "지금", reason: "\"현재\"와 \"지금\"은 뜻이 겹쳐요." },
  { pattern: /가장\s+최고/g, replacement: "최고", reason: "\"가장\"과 \"최고\"는 뜻이 겹쳐요." },
  { pattern: /더욱\s+더/g, replacement: "더욱", reason: "\"더욱\"과 \"더\"는 뜻이 겹쳐요." },
  { pattern: /각각\s+각자/g, replacement: "각각", reason: "\"각각\"과 \"각자\"는 뜻이 겹쳐요." },
];

/** 이중 피동 — 피동이 두 번 겹친 형태. */
const DOUBLE_PASSIVES: readonly PhraseRule[] = [
  { pattern: /되어진다/g, replacement: "된다", reason: "\"되어진다\"는 피동이 겹쳤어요. \"된다\"로 충분해요." },
  { pattern: /되어지는/g, replacement: "되는", reason: "\"되어지는\"은 피동이 겹쳤어요. \"되는\"으로 충분해요." },
  { pattern: /되어져/g, replacement: "돼", reason: "\"되어져\"는 피동이 겹쳤어요. \"돼\"로 충분해요." },
  { pattern: /보여진다/g, replacement: "보인다", reason: "\"보여진다\"는 피동이 겹쳤어요. \"보인다\"로 충분해요." },
];

/** 장황한 연결 표현 — 짧은 형태로 바꿔도 뜻이 유지되는 것. */
const VERBOSE_PHRASES: readonly PhraseRule[] = [
  { pattern: /에 있어서/g, replacement: "에서", reason: "\"에 있어서\"는 \"에서\"로 줄일 수 있어요." },
  { pattern: /에 대하여/g, replacement: "에 대해", reason: "\"에 대하여\"는 \"에 대해\"로 줄일 수 있어요." },
  { pattern: /에 관하여/g, replacement: "에 관해", reason: "\"에 관하여\"는 \"에 관해\"로 줄일 수 있어요." },
  { pattern: /인 것으로 보인다/g, replacement: "인 듯하다", reason: "\"인 것으로 보인다\"는 \"인 듯하다\"로 줄일 수 있어요." },
  { pattern: /인 것으로 생각된다/g, replacement: "인 듯하다", reason: "\"인 것으로 생각된다\"는 \"인 듯하다\"로 줄일 수 있어요." },
  { pattern: /기 위하여/g, replacement: "기 위해", reason: "\"기 위하여\"는 \"기 위해\"로 줄일 수 있어요." },
  { pattern: /할 필요가 있다/g, replacement: "해야 한다", reason: "\"할 필요가 있다\"는 \"해야 한다\"로 줄이면 문장이 단단해져요." },
];

/** 시놉시스(문어체) 전용 — "~는 것이다" 명사형 종결을 평서형으로. 활용이 고정된 형태만. */
const NOMINAL_ENDINGS: readonly PhraseRule[] = [
  { pattern: /하는 것이다(?=[.!?…]|$)/g, replacement: "한다", reason: "\"하는 것이다\"는 \"한다\"로 끝내면 문장이 짧아져요." },
  { pattern: /되는 것이다(?=[.!?…]|$)/g, replacement: "된다", reason: "\"되는 것이다\"는 \"된다\"로 끝내면 문장이 짧아져요." },
  { pattern: /있는 것이다(?=[.!?…]|$)/g, replacement: "있다", reason: "\"있는 것이다\"는 \"있다\"로 끝내면 문장이 짧아져요." },
  { pattern: /없는 것이다(?=[.!?…]|$)/g, replacement: "없다", reason: "\"없는 것이다\"는 \"없다\"로 끝내면 문장이 짧아져요." },
  { pattern: /오는 것이다(?=[.!?…]|$)/g, replacement: "온다", reason: "\"오는 것이다\"는 \"온다\"로 끝내면 문장이 짧아져요." },
  { pattern: /가는 것이다(?=[.!?…]|$)/g, replacement: "간다", reason: "\"가는 것이다\"는 \"간다\"로 끝내면 문장이 짧아져요." },
  { pattern: /인 것이다(?=[.!?…]|$)/g, replacement: "이다", reason: "\"인 것이다\"는 \"이다\"로 끝내면 문장이 짧아져요." },
];

/** 문장 첫머리 군더더기 — 말투일 수 있어 info 등급으로만 제안한다. */
const FILLER_OPENERS: readonly PhraseRule[] = [
  { pattern: /^사실은\s+/g, replacement: "", reason: "문장을 여는 \"사실은\"은 군더더기일 수 있어요. 말투면 그대로 두세요." },
  { pattern: /^사실\s+/g, replacement: "", reason: "문장을 여는 \"사실\"은 군더더기일 수 있어요. 말투면 그대로 두세요." },
  { pattern: /^솔직히\s+말하면[,\s]+/g, replacement: "", reason: "\"솔직히 말하면\"은 군더더기일 수 있어요. 말투면 그대로 두세요." },
  { pattern: /^말하자면[,\s]+/g, replacement: "", reason: "\"말하자면\"은 군더더기일 수 있어요. 말투면 그대로 두세요." },
];

const LONG_SENTENCE_DEFAULTS: Readonly<Record<WritingPolishTargetKind, number>> = {
  synopsis: 70,
  general: 70,
  dialogue: 45,
};

// ── 내부 유틸 ────────────────────────────────────────────────────────────────

function hashText(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function countNonSpace(text: string): number {
  return text.replace(/\s/g, "").length;
}

interface TransformHit {
  readonly ruleId: WritingPolishRuleId;
  readonly reason: string;
}

function applyPhraseRules(
  sentence: string,
  rules: readonly PhraseRule[],
  ruleId: WritingPolishRuleId,
  hits: TransformHit[],
): string {
  let next = sentence;
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    if (rule.pattern.test(next)) {
      hits.push({ ruleId, reason: rule.reason });
      rule.pattern.lastIndex = 0;
      next = next.replace(rule.pattern, rule.replacement);
    }
  }
  return next;
}

/** 강조 부사가 똑같이 겹친 경우(정말 정말) — 연출일 수 있어 info. */
function applyRepeatedIntensifier(sentence: string, hits: TransformHit[]): string {
  const pattern = /(정말|너무|아주|매우|몹시)\s+\1(?=[\s.,!?…~]|$)/g;
  if (!pattern.test(sentence)) return sentence;
  hits.push({
    ruleId: "repeated-intensifier",
    reason: "같은 강조 말이 겹쳤어요. 강조 연출이면 그대로 두세요.",
  });
  pattern.lastIndex = 0;
  return sentence.replace(pattern, "$1");
}

/**
 * 긴 문장 나누기 — 절 경계가 문법적으로 고정되는 패턴에서만 제안한다.
 *  - "~지만, " → "~다. 하지만 " (어간+다 종결은 지만 앞에서 고정된다)
 *  - 과거 연결 "~었고/았고/였고/했고, " → "~었다/았다/였다/했다. "
 *  - "것이며/것이고, " → "것이다. "
 * 경계가 문장 앞쪽 1/4~뒤쪽 1/4 사각에 있으면 나누지 않는다(조각 문장 방지).
 */
function splitLongSentence(sentence: string): string | null {
  const patterns: readonly { readonly pattern: RegExp; readonly build: (stem: string) => string }[] = [
    { pattern: /([가-힣])지만,\s+/g, build: (stem) => `${stem}다. 하지만 ` },
    { pattern: /었(?:고),\s+/g, build: () => "었다. " },
    { pattern: /았(?:고),\s+/g, build: () => "았다. " },
    { pattern: /였(?:고),\s+/g, build: () => "였다. " },
    { pattern: /했(?:고),\s+/g, build: () => "했다. " },
    { pattern: /왔(?:고),\s+/g, build: () => "왔다. " },
    { pattern: /것이(?:며|고),\s+/g, build: () => "것이다. " },
  ];
  for (const { pattern, build } of patterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(sentence);
    if (!match) continue;
    const at = match.index;
    const ratio = at / Math.max(1, sentence.length);
    if (ratio < 0.25 || ratio > 0.8) continue;
    // 지만 패턴은 매치 첫 글자(어간 끝 음절)를 보존하고, 나머지는 매치 구간을 통째로 교체한다.
    const rebuilt = match[1]
      ? sentence.slice(0, at) + build(match[1]) + sentence.slice(at + match[0].length)
      : sentence.slice(0, at) + build("") + sentence.slice(at + match[0].length);
    if (rebuilt !== sentence) return rebuilt;
  }
  return null;
}

// ── 제안 도출 ────────────────────────────────────────────────────────────────

function makeSuggestion(
  doc: WritingPolishDocument,
  span: WritingSentenceSpan,
  suggested: string,
  ruleIds: readonly WritingPolishRuleId[],
  severity: WritingPolishSeverity,
  reason: string,
): WritingPolishSuggestion {
  return Object.freeze({
    id: `${doc.id}:${ruleIds.join("+")}:${hashText(span.text)}`,
    documentId: doc.id,
    kind: doc.kind,
    sentenceIndex: span.index,
    start: span.start,
    end: span.end,
    original: span.text,
    suggested,
    ruleIds: Object.freeze([...ruleIds]),
    severity,
    reason,
    charDelta: suggested.length - span.text.length,
  });
}

/** 문서 한 건(텍스트 블록 하나)의 문장 단위 제안을 도출한다. */
export function suggestWritingPolishForText(
  doc: WritingPolishDocument,
  options: WritingPolishOptions = {},
): readonly WritingPolishSuggestion[] {
  const disabled = new Set(options.disabledRules ?? []);
  const includeInfo = options.includeInfo ?? true;
  const longThreshold = options.longSentenceChars ?? LONG_SENTENCE_DEFAULTS[doc.kind];
  const sentences = splitWritingSentences(doc.text);
  const suggestions: WritingPolishSuggestion[] = [];
  const seenSentences = new Map<string, WritingSentenceSpan>();

  for (const span of sentences) {
    const sentence = span.text;

    // 1) 같은 문장 되풀이 — 뒤쪽 문장 삭제를 제안(짧은 감탄·대답은 연출이라 제외).
    if (!disabled.has("duplicate-sentence")) {
      const key = sentence.replace(/\s+/g, " ").trim();
      const first = seenSentences.get(key);
      if (first && countNonSpace(key) >= 8) {
        suggestions.push(
          makeSuggestion(
            doc,
            span,
            "",
            ["duplicate-sentence"],
            "suggestion",
            `${first.index + 1}번째 문장과 똑같은 문장이에요. 복사 실수가 아니면 호흡을 위해 빼는 걸 권해요.`,
          ),
        );
        continue;
      }
      if (!first) seenSentences.set(key, span);
    }

    // 2) 긴 문장 나누기 — 안전한 절 경계가 있을 때만.
    if (!disabled.has("long-sentence-split") && countNonSpace(sentence) > longThreshold) {
      const split = splitLongSentence(sentence);
      if (split) {
        suggestions.push(
          makeSuggestion(
            doc,
            span,
            split,
            ["long-sentence-split"],
            "suggestion",
            `한 문장이 길어요(공백 제외 ${countNonSpace(sentence)}자). 절 경계에서 나누면 읽기 쉬워요.`,
          ),
        );
        continue;
      }
    }

    // 3) 표현 축약 — 문장 안에서 고정 패턴들을 순서대로 적용해 한 제안으로 묶는다.
    const hits: TransformHit[] = [];
    let next = sentence;
    if (!disabled.has("redundant-pair")) next = applyPhraseRules(next, REDUNDANT_PAIRS, "redundant-pair", hits);
    if (!disabled.has("double-passive")) next = applyPhraseRules(next, DOUBLE_PASSIVES, "double-passive", hits);
    if (!disabled.has("verbose-phrase")) next = applyPhraseRules(next, VERBOSE_PHRASES, "verbose-phrase", hits);
    if (!disabled.has("nominal-ending") && doc.kind !== "dialogue") {
      next = applyPhraseRules(next, NOMINAL_ENDINGS, "nominal-ending", hits);
    }
    const hasMainHit = hits.length > 0;
    if (!disabled.has("repeated-intensifier")) next = applyRepeatedIntensifier(next, hits);
    if (!disabled.has("filler-opener")) {
      const before = next;
      next = applyPhraseRules(next, FILLER_OPENERS, "filler-opener", hits);
      if (next !== before && next.trim().length === 0) {
        // 군더더기만으로 이뤄진 문장은 지우지 않는다.
        next = before;
        const fillerAt = hits.findIndex((hit) => hit.ruleId === "filler-opener");
        if (fillerAt >= 0) hits.splice(fillerAt, 1);
      }
    }
    if (next === sentence || hits.length === 0) continue;
    const onlyInfo =
      !hasMainHit && hits.every((hit) => hit.ruleId === "filler-opener" || hit.ruleId === "repeated-intensifier");
    if (onlyInfo && !includeInfo) continue;
    suggestions.push(
      makeSuggestion(
        doc,
        span,
        next,
        [...new Set(hits.map((hit) => hit.ruleId))],
        onlyInfo ? "info" : "suggestion",
        [...new Set(hits.map((hit) => hit.reason))].join(" "),
      ),
    );
  }
  return Object.freeze(suggestions);
}

/** 여러 문서를 한 번에 — 표면(시놉시스+대사 목록)이 그대로 넘기는 진입점. */
export function suggestWritingPolish(
  documents: readonly WritingPolishDocument[],
  options: WritingPolishOptions = {},
): readonly WritingPolishSuggestion[] {
  return Object.freeze(documents.flatMap((doc) => suggestWritingPolishForText(doc, options)));
}

export function summarizeWritingPolish(
  documents: readonly WritingPolishDocument[],
  suggestions: readonly WritingPolishSuggestion[],
): WritingPolishSummary {
  const byRule: Partial<Record<WritingPolishRuleId, number>> = {};
  let saved = 0;
  for (const suggestion of suggestions) {
    for (const ruleId of suggestion.ruleIds) byRule[ruleId] = (byRule[ruleId] ?? 0) + 1;
    if (suggestion.charDelta < 0) saved += -suggestion.charDelta;
  }
  return Object.freeze({
    documentCount: documents.length,
    suggestionCount: suggestions.length,
    byRule: Object.freeze(byRule),
    totalCharsSaved: saved,
  });
}

// ── 적용 ─────────────────────────────────────────────────────────────────────

/** 제안이 현재 텍스트에 그대로 적용 가능한지 — 원문 구간 일치를 검증한다. */
export function isWritingPolishApplicable(text: string, suggestion: WritingPolishSuggestion): boolean {
  return text.slice(suggestion.start, suggestion.end) === suggestion.original;
}

/**
 * 제안 1개를 적용한 새 텍스트를 돌려준다. 적용할 수 없으면(원문이 그새 바뀜)
 * 입력 텍스트를 참조 그대로 돌려준다 — 호출부가 적용 실패를 감지할 수 있다.
 * 삭제 제안(suggested="")은 문장 뒤 공백/줄바꿈 한 덩어리도 함께 정리한다.
 */
export function applyWritingPolishSuggestion(text: string, suggestion: WritingPolishSuggestion): string {
  if (!isWritingPolishApplicable(text, suggestion)) return text;
  if (suggestion.suggested === "") {
    let end = suggestion.end;
    while (end < text.length && (text[end] === " " || text[end] === "\t")) end += 1;
    if (text[end] === "\n" && end + 1 < text.length) end += 1;
    return text.slice(0, suggestion.start) + text.slice(end);
  }
  return text.slice(0, suggestion.start) + suggestion.suggested + text.slice(suggestion.end);
}

/** 한 문서의 제안들을 한 번에 적용 — 뒤쪽 구간부터 적용해 오프셋이 밀리지 않게 한다. */
export function applyWritingPolishSuggestions(
  text: string,
  suggestions: readonly WritingPolishSuggestion[],
): string {
  const ordered = [...suggestions]
    .filter((suggestion) => isWritingPolishApplicable(text, suggestion))
    .sort((a, b) => b.start - a.start);
  let next = text;
  for (const suggestion of ordered) {
    next = applyWritingPolishSuggestion(next, suggestion);
  }
  return next;
}

// ── 원문/제안 비교 (패널 표시용 단어 diff) ────────────────────────────────────

export interface WritingDiffSegment {
  readonly type: "same" | "removed" | "added";
  readonly text: string;
}

/** 공백 기준 토큰 LCS diff — 비교 UI에서 뺀 말/넣은 말을 표시하는 데만 쓴다. */
export function diffWritingWords(original: string, suggested: string): readonly WritingDiffSegment[] {
  const a = original.split(/(\s+)/).filter((token) => token.length > 0);
  const b = suggested.split(/(\s+)/).filter((token) => token.length > 0);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? (dp[i + 1]?.[j + 1] ?? 0) + 1 : Math.max(dp[i + 1]?.[j] ?? 0, dp[i]?.[j + 1] ?? 0);
    }
  }
  const segments: WritingDiffSegment[] = [];
  const push = (type: WritingDiffSegment["type"], token: string) => {
    const last = segments[segments.length - 1];
    if (last && last.type === type) {
      segments[segments.length - 1] = { type, text: last.text + token };
    } else {
      segments.push({ type, text: token });
    }
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i] as string);
      i += 1;
      j += 1;
    } else if ((dp[i + 1]?.[j] ?? 0) >= (dp[i]?.[j + 1] ?? 0)) {
      push("removed", a[i] as string);
      i += 1;
    } else {
      push("added", b[j] as string);
      j += 1;
    }
  }
  while (i < a.length) push("removed", a[i++] as string);
  while (j < b.length) push("added", b[j++] as string);
  return Object.freeze(segments);
}

export const WRITING_POLISH_RULE_LABELS: Readonly<Record<WritingPolishRuleId, string>> = {
  "redundant-pair": "겹친 표현",
  "double-passive": "이중 피동",
  "verbose-phrase": "장황한 표현",
  "nominal-ending": "명사형 종결",
  "filler-opener": "첫머리 군더더기",
  "repeated-intensifier": "강조 겹침",
  "duplicate-sentence": "같은 문장 반복",
  "long-sentence-split": "긴 문장 나누기",
};
