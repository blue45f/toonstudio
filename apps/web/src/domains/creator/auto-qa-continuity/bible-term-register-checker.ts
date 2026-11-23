/**
 * 설정집(Production Bible) 고유명사·호칭·화법(반말/존댓말/하오체) 자동 대조 엔진.
 * 대사 배열에서 정본 고유명사 오타·표기 불일치(term-mismatch), 캐릭터 쌍별 호칭 오류(address-mismatch),
 * 이유 없는 반말/존댓말/하오체 혼용(register-violation)을 정밀 문자 위치와 함께 탐지하고
 * 고유명사·호칭 오류의 1클릭 일괄 정본 치환 및 치환 이력을 제공한다.
 */

export type SpeechRegister = "banmal" | "jondaetmal" | "haoche";

export const SPEECH_REGISTER_LABELS: Readonly<
  Record<SpeechRegister, { readonly ko: string; readonly en: string }>
> = {
  banmal: { ko: "반말", en: "Casual (Banmal)" },
  jondaetmal: { ko: "존댓말", en: "Polite (Jondaetmal)" },
  haoche: { ko: "하오체", en: "Formal Archaic (Haoche)" },
};

export type BibleTermCategory = "character" | "place" | "organization" | "skill" | "artifact" | "other";

export interface BibleTermEntry {
  readonly id: string;
  readonly category: BibleTermCategory;
  readonly canonTerm: string;
  /** 이전 화 표기 불일치·흔한 오타·비정본 별칭 목록 */
  readonly aliases: readonly string[];
  /** 선택적 오타 별도 배열 (aliases와 자동 합산) */
  readonly typos?: readonly string[];
  readonly noteKo?: string;
  readonly noteEn?: string;
}

export interface CharacterPairSpeechRule {
  readonly id: string;
  readonly speaker: string;
  readonly listener: string;
  readonly expectedRegister: SpeechRegister;
  readonly canonAddressTitle: string;
  /** 해당 화자→청자 관계에서 금지되는 오호칭 목록 */
  readonly forbiddenAddressTitles?: readonly string[];
  readonly noteKo?: string;
  readonly noteEn?: string;
}

export interface ProductionBibleQaRules {
  readonly bibleId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly terms: readonly BibleTermEntry[];
  readonly pairRules: readonly CharacterPairSpeechRule[];
}

export interface DialogueLineInput {
  readonly id: string;
  readonly cutNumber: number;
  readonly speaker: string;
  readonly listener: string;
  readonly text: string;
  /** 위장·회상·비꼬기 등 의도된 말투 전환 사유가 있으면 화법 위반 경고에서 면제 */
  readonly registerExceptionReason?: string | null;
}

export type BibleQaFindingKind = "term-mismatch" | "register-violation" | "address-mismatch";

export interface BibleQaFinding {
  readonly id: string;
  readonly kind: BibleQaFindingKind;
  readonly lineId: string;
  readonly cutNumber: number;
  readonly speaker: string;
  readonly listener: string;
  /** 대사 원문(line.text) 기준 0-based 시작 인덱스 */
  readonly startIndex: number;
  /** 대사 원문(line.text) 기준 종료 인덱스(exclusive) */
  readonly endIndex: number;
  readonly matchedText: string;
  readonly suggestedReplacement: string | null;
  readonly autoFixable: boolean;
  readonly expectedRegister?: SpeechRegister;
  readonly detectedRegister?: SpeechRegister;
  readonly ruleId: string;
  readonly messageKo: string;
  readonly messageEn: string;
}

export interface DialogueBibleAuditReport {
  readonly bibleId: string;
  readonly totalLines: number;
  readonly cleanLineCount: number;
  readonly findingCount: number;
  readonly termMismatchCount: number;
  readonly addressMismatchCount: number;
  readonly registerViolationCount: number;
  readonly autoFixableCount: number;
  readonly findings: readonly BibleQaFinding[];
}

export interface BibleFixHistoryEntry {
  readonly findingId: string;
  readonly kind: "term-mismatch" | "address-mismatch";
  readonly lineId: string;
  readonly cutNumber: number;
  readonly startIndex: number;
  readonly endIndex: number;
  readonly before: string;
  readonly after: string;
}

export interface BatchBibleFixResult {
  readonly lines: readonly DialogueLineInput[];
  readonly appliedFixes: readonly BibleFixHistoryEntry[];
  readonly appliedCount: number;
  readonly touchedLineCount: number;
  readonly skippedCount: number;
}

export interface DetectedRegisterSegment {
  readonly register: SpeechRegister;
  readonly matchedText: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

interface SpanRange {
  readonly start: number;
  readonly end: number;
}

interface SentenceSegment {
  readonly text: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const JONGSEONG_BIEUP = 17; // 받침 'ㅂ'

const KOREAN_SHORT_TITLE_FOLLOW_PARTICLES = new Set([
  "는", "은", "가", "이", "를", "을", "도", "만", "랑", "와", "과", "의", "야", "아", "께",
]);
const KOREAN_SHORT_TITLE_FOLLOW_TWO_CHAR = new Set(["한테", "에게", "부터", "까지", "처럼"]);
const JONDAETMAL_YO_NOUN_STOPLIST = new Set([
  "필요", "중요", "개요", "소요", "주요", "월요", "화요", "수요", "목요", "금요", "토요", "일요",
]);
const NEUTRAL_INTERJECTIONS = new Set([
  "네", "예", "잠깐", "아", "어", "음", "헉", "크악", "제길", "젠장", "쉿", "어라", "어머", "맙소사", "저기", "잠시만",
]);
const STANDALONE_BANMAL_WORDS = new Set(["응", "아니", "그래", "뭐", "왜", "가", "해", "봐", "줘", "와", "돼", "자"]);
const IMPLICIT_WRONG_ADDRESS_SUFFIXES = ["선배님", "선배", "님", "씨", "군", "양", "야", "아"] as const;

const HAOCHE_ENDING_REGEX =
  /(?:하오|이오|아니오|겠소|았소|었소|있소|없소|않소|그렇소|맞소|되오|가오|보오|주오|마오|구려|시구려|십시다|으오|오리다)$/;
const HAOCHE_SO_REGEX =
  /(?:하|보|주|가|오|되|있|없|않|알|모르|믿|듣|받|잡|먹|죽|살|맞|그렇|겠|았|었)소$/;
const JONDAETMAL_EXPLICIT_REGEX =
  /(?:습니다|습니까|세요|으세요|셔요|십시오|십니까|시죠|시지요|계세요|드리겠습니다|드립니다|군요|네요|나요|까요|게요|래요|잖아요|거든요|인데요|던데요|고요|에요|예요|어요|아요|해요|돼요|봐요|줘요|와요|가요)$/;
const BANMAL_EXPLICIT_REGEX =
  /(?:잖아|거든|는데|던데|구나|느냐|거야|이야|할게|갈게|줄게|볼게|올게|될게|먹을게|할래|갈래|줄래|볼래|올래|해라|가라|봐라|줘라|와라|마라|지마|았다|었다|했다|겠다|는다|있다|없다|맞다|한다|간다|온다|된다|본다|준다|안다|모른다|했어|갔어|왔어|봤어|줬어|됐어|있어|없어|맞아|알아|몰라|그래|했지|갔지|왔지|있지|없지|맞지|알지|몰랐지|했냐|갔냐|왔냐|있냐|없냐|맞냐|아냐|뭐냐|누구냐|어디냐|왜냐|하냐|가냐|보냐|오냐|주냐|되냐|하니|가니|보니|주니|오니|있니|없니|맞니|알았어|알았지|알았냐|미안해|고마워|괜찮아|싫어|좋아|죽어|살아|들어|먹어|잡아|열어|닫아|믿어|기다려|서둘러|조심해|부탁해|말해|생각해|기억해|약속해|그만해|시작해|도망쳐|비켜|멈춰|일어나|앉아|나가|들어와|돌아가|보여줘|알려줘|도와줘|놓아줘|안돼)$/;
const BANMAL_GENERAL_FINAL_REGEX =
  /[야어아지냐니해봐줘돼게래자네군다까워려쳐켜춰셔져텨펴혀겨녀뎌며벼여와가나]$/;

function isHangulSyllable(ch: string | undefined): boolean {
  if (!ch) return false;
  const code = ch.charCodeAt(0);
  return code >= HANGUL_SYLLABLE_START && code <= HANGUL_SYLLABLE_END;
}

function isWordBoundaryChar(ch: string | undefined): boolean {
  return ch === undefined || /[\s.,?!…~"'”’()[\]{}:;/\\-]/.test(ch);
}

function endsWithBatchimBPlus(token: string, suffix: "니다" | "니까"): boolean {
  if (!token.endsWith(suffix) || token.length <= suffix.length) return false;
  const prevChar = token[token.length - suffix.length - 1];
  if (!isHangulSyllable(prevChar)) return false;
  return (prevChar.charCodeAt(0) - HANGUL_SYLLABLE_START) % 28 === JONGSEONG_BIEUP;
}

function overlapsAny(spans: readonly SpanRange[], start: number, end: number): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

function isCoveredByCanonTerm(text: string, start: number, end: number, canonTerm: string): boolean {
  if (!canonTerm) return false;
  let searchFrom = Math.max(0, start - canonTerm.length + 1);
  while (searchFrom <= start) {
    const found = text.indexOf(canonTerm, searchFrom);
    if (found === -1 || found > start) break;
    if (found <= start && found + canonTerm.length >= end) return true;
    searchFrom = found + 1;
  }
  return false;
}

function hasValidAddressBoundaries(text: string, start: number, end: number, variant: string): boolean {
  const prev = start > 0 ? text[start - 1] : undefined;
  const next = end < text.length ? text[end] : undefined;
  if (prev !== undefined && isHangulSyllable(prev)) return false;

  if (variant.length === 1) {
    if (!isWordBoundaryChar(prev)) return false;
    if (isWordBoundaryChar(next)) return true;
    if (KOREAN_SHORT_TITLE_FOLLOW_TWO_CHAR.has(text.slice(end, end + 2))) return true;
    return next !== undefined && KOREAN_SHORT_TITLE_FOLLOW_PARTICLES.has(next);
  }
  return true;
}

function splitSentencesWithOffsets(text: string): readonly SentenceSegment[] {
  const segments: SentenceSegment[] = [];
  const regex = /[^.?!…\n]+[.?!…\n]*/g;
  let match = regex.exec(text);
  while (match !== null) {
    const raw = match[0];
    const leadingSpaces = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      const startIndex = match.index + leadingSpaces;
      segments.push({ text: trimmed, startIndex, endIndex: startIndex + trimmed.length });
    }
    match = regex.exec(text);
  }
  return segments;
}

/**
 * 단일 문장 또는 대사 문자열에서 한국어 화법(반말/존댓말/하오체)을 종결어미 휴리스틱으로 판별한다.
 */
export function classifyKoreanSentenceRegister(
  sentence: string,
  knownNounTokens?: ReadonlySet<string>,
): {
  readonly register: SpeechRegister | null;
  readonly matchedToken: string;
  readonly tokenStartOffset: number;
  readonly tokenEndOffset: number;
} {
  const strippedRight = sentence.replace(/[\s.?!…~"'”’()[\]{},]+$/g, "");
  const lastSpaceIdx = strippedRight.search(/\S+$/);
  if (strippedRight.length === 0 || lastSpaceIdx < 0) {
    return { register: null, matchedToken: "", tokenStartOffset: 0, tokenEndOffset: 0 };
  }

  const rawLastToken = strippedRight.slice(lastSpaceIdx);
  const cleanedToken = rawLastToken.replace(/^["'“‘([{]+/g, "");
  const tokenStartOffset = lastSpaceIdx + (rawLastToken.length - cleanedToken.length);
  const tokenEndOffset = tokenStartOffset + cleanedToken.length;

  if (cleanedToken.length === 0 || !/[가-힣]/.test(cleanedToken) || NEUTRAL_INTERJECTIONS.has(cleanedToken)) {
    return { register: null, matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
  }

  if (HAOCHE_ENDING_REGEX.test(cleanedToken) || (cleanedToken.length >= 2 && HAOCHE_SO_REGEX.test(cleanedToken))) {
    return { register: "haoche", matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
  }

  if (
    endsWithBatchimBPlus(cleanedToken, "니다") ||
    endsWithBatchimBPlus(cleanedToken, "니까") ||
    JONDAETMAL_EXPLICIT_REGEX.test(cleanedToken) ||
    (cleanedToken.length >= 2 && cleanedToken.endsWith("죠")) ||
    (cleanedToken.length >= 2 && cleanedToken.endsWith("요") && !JONDAETMAL_YO_NOUN_STOPLIST.has(cleanedToken))
  ) {
    return { register: "jondaetmal", matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
  }

  if (STANDALONE_BANMAL_WORDS.has(cleanedToken)) {
    return { register: "banmal", matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
  }
  if (knownNounTokens?.has(cleanedToken)) {
    return { register: null, matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
  }
  if (
    BANMAL_EXPLICIT_REGEX.test(cleanedToken) ||
    (cleanedToken.length >= 2 && BANMAL_GENERAL_FINAL_REGEX.test(cleanedToken))
  ) {
    return { register: "banmal", matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
  }

  return { register: null, matchedToken: cleanedToken, tokenStartOffset, tokenEndOffset };
}

/**
 * 대사 문자열에 포함된 모든 문장별 화법(반말/존댓말/하오체) 세그먼트를 정밀 위치와 함께 추출한다.
 */
export function detectDialogueSpeechRegisters(
  text: string,
  knownNounTokens?: ReadonlySet<string>,
): readonly DetectedRegisterSegment[] {
  const results: DetectedRegisterSegment[] = [];
  for (const seg of splitSentencesWithOffsets(text)) {
    const classified = classifyKoreanSentenceRegister(seg.text, knownNounTokens);
    if (classified.register !== null && classified.matchedToken.length > 0) {
      results.push({
        register: classified.register,
        matchedText: classified.matchedToken,
        startIndex: seg.startIndex + classified.tokenStartOffset,
        endIndex: seg.startIndex + classified.tokenEndOffset,
      });
    }
  }
  return results;
}

function collectKnownNounTokens(rules: ProductionBibleQaRules): ReadonlySet<string> {
  const set = new Set<string>();
  for (const term of rules.terms) {
    for (const part of term.canonTerm.split(/\s+/)) {
      if (part.length > 0) set.add(part);
    }
    for (const alias of [...term.aliases, ...(term.typos ?? [])]) {
      for (const part of alias.split(/\s+/)) {
        if (part.length > 0) set.add(part);
      }
    }
  }
  for (const pair of rules.pairRules) {
    set.add(pair.speaker.trim());
    set.add(pair.listener.trim());
  }
  return set;
}

function buildSortedTermVariants(
  terms: readonly BibleTermEntry[],
): readonly { readonly entry: BibleTermEntry; readonly variant: string }[] {
  const pairs: { readonly entry: BibleTermEntry; readonly variant: string }[] = [];
  const seenKey = new Set<string>();
  for (const entry of terms) {
    const canon = entry.canonTerm.trim();
    if (!canon) continue;
    for (const raw of [...entry.aliases, ...(entry.typos ?? [])]) {
      const variant = raw.trim();
      if (!variant || variant === canon) continue;
      const dedupeKey = `${entry.id}::${variant}`;
      if (seenKey.has(dedupeKey)) continue;
      seenKey.add(dedupeKey);
      pairs.push({ entry, variant });
    }
  }
  return pairs.sort((a, b) => b.variant.length - a.variant.length);
}

function findPairRule(
  pairRules: readonly CharacterPairSpeechRule[],
  speaker: string,
  listener: string,
): CharacterPairSpeechRule | null {
  const s = speaker.trim();
  const l = listener.trim();
  return pairRules.find((rule) => rule.speaker.trim() === s && rule.listener.trim() === l) ?? null;
}

function buildForbiddenAddressList(pairRule: CharacterPairSpeechRule): readonly string[] {
  const canon = pairRule.canonAddressTitle.trim();
  const items = new Set<string>();
  for (const raw of pairRule.forbiddenAddressTitles ?? []) {
    const trimmed = raw.trim();
    if (trimmed && trimmed !== canon) items.add(trimmed);
  }
  const listener = pairRule.listener.trim();
  if (listener.length >= 2) {
    for (const suffix of IMPLICIT_WRONG_ADDRESS_SUFFIXES) {
      for (const candidate of [`${listener}${suffix}`, `${listener} ${suffix}`]) {
        if (candidate !== canon && !canon.includes(candidate) && !candidate.endsWith(canon)) {
          items.add(candidate);
        }
      }
    }
  }
  return [...items].sort((a, b) => b.length - a.length);
}

/**
 * 대사 배열을 설정집(ProductionBibleQaRules)과 대조해
 * (a) 고유명사 표기 불일치, (b) 화법(반말/존댓말/하오체) 위반, (c) 호칭 오류를 정밀 위치와 함께 반환한다.
 */
export function auditDialogueAgainstBible(
  lines: readonly DialogueLineInput[],
  rules: ProductionBibleQaRules,
): DialogueBibleAuditReport {
  const sortedVariants = buildSortedTermVariants(rules.terms);
  const knownNouns = collectKnownNounTokens(rules);
  const findings: BibleQaFinding[] = [];
  let cleanLineCount = 0;
  let termMismatchCount = 0;
  let addressMismatchCount = 0;
  let registerViolationCount = 0;

  for (const line of lines) {
    const lineFindings: BibleQaFinding[] = [];
    const claimedFixSpans: SpanRange[] = [];

    for (const { entry, variant } of sortedVariants) {
      let cursor = 0;
      while (cursor < line.text.length) {
        const idx = line.text.indexOf(variant, cursor);
        if (idx === -1) break;
        const end = idx + variant.length;
        cursor = idx + 1;
        if (isCoveredByCanonTerm(line.text, idx, end, entry.canonTerm) || overlapsAny(claimedFixSpans, idx, end)) {
          continue;
        }
        claimedFixSpans.push({ start: idx, end });
        termMismatchCount += 1;
        lineFindings.push({
          id: `term:${line.id}:${idx}:${end}`,
          kind: "term-mismatch",
          lineId: line.id,
          cutNumber: line.cutNumber,
          speaker: line.speaker,
          listener: line.listener,
          startIndex: idx,
          endIndex: end,
          matchedText: variant,
          suggestedReplacement: entry.canonTerm,
          autoFixable: true,
          ruleId: entry.id,
          messageKo: `고유명사 표기 불일치: '${variant}' → 정본 '${entry.canonTerm}'`,
          messageEn: `Canon term mismatch: '${variant}' → '${entry.canonTerm}'`,
        });
      }
    }

    const pairRule = findPairRule(rules.pairRules, line.speaker, line.listener);
    if (pairRule) {
      for (const badTitle of buildForbiddenAddressList(pairRule)) {
        let cursor = 0;
        while (cursor < line.text.length) {
          const idx = line.text.indexOf(badTitle, cursor);
          if (idx === -1) break;
          const end = idx + badTitle.length;
          cursor = idx + 1;
          if (
            isCoveredByCanonTerm(line.text, idx, end, pairRule.canonAddressTitle) ||
            !hasValidAddressBoundaries(line.text, idx, end, badTitle) ||
            overlapsAny(claimedFixSpans, idx, end)
          ) {
            continue;
          }
          claimedFixSpans.push({ start: idx, end });
          addressMismatchCount += 1;
          lineFindings.push({
            id: `addr:${line.id}:${idx}:${end}`,
            kind: "address-mismatch",
            lineId: line.id,
            cutNumber: line.cutNumber,
            speaker: line.speaker,
            listener: line.listener,
            startIndex: idx,
            endIndex: end,
            matchedText: badTitle,
            suggestedReplacement: pairRule.canonAddressTitle,
            autoFixable: true,
            ruleId: pairRule.id,
            messageKo: `호칭 오류(${pairRule.speaker}→${pairRule.listener}): '${badTitle}' → 정본 호칭 '${pairRule.canonAddressTitle}'`,
            messageEn: `Address title mismatch (${pairRule.speaker}→${pairRule.listener}): '${badTitle}' → '${pairRule.canonAddressTitle}'`,
          });
        }
      }

      const hasException =
        typeof line.registerExceptionReason === "string" && line.registerExceptionReason.trim().length > 0;
      if (!hasException) {
        for (const seg of detectDialogueSpeechRegisters(line.text, knownNouns)) {
          if (seg.register === pairRule.expectedRegister) continue;
          registerViolationCount += 1;
          const expected = SPEECH_REGISTER_LABELS[pairRule.expectedRegister];
          const detected = SPEECH_REGISTER_LABELS[seg.register];
          lineFindings.push({
            id: `reg:${line.id}:${seg.startIndex}:${seg.endIndex}`,
            kind: "register-violation",
            lineId: line.id,
            cutNumber: line.cutNumber,
            speaker: line.speaker,
            listener: line.listener,
            startIndex: seg.startIndex,
            endIndex: seg.endIndex,
            matchedText: seg.matchedText,
            suggestedReplacement: null,
            autoFixable: false,
            expectedRegister: pairRule.expectedRegister,
            detectedRegister: seg.register,
            ruleId: pairRule.id,
            messageKo: `말투 위반(${pairRule.speaker}→${pairRule.listener}): '${seg.matchedText}'(${detected.ko}) — 기준 화법은 ${expected.ko}`,
            messageEn: `Register violation (${pairRule.speaker}→${pairRule.listener}): '${seg.matchedText}' (${detected.en}) — expected ${expected.en}`,
          });
        }
      }
    }

    lineFindings.sort((a, b) => a.startIndex - b.startIndex || a.endIndex - b.endIndex);
    if (lineFindings.length === 0) cleanLineCount += 1;
    else findings.push(...lineFindings);
  }

  return {
    bibleId: rules.bibleId,
    totalLines: lines.length,
    cleanLineCount,
    findingCount: findings.length,
    termMismatchCount,
    addressMismatchCount,
    registerViolationCount,
    autoFixableCount: termMismatchCount + addressMismatchCount,
    findings,
  };
}

/**
 * 탐지된 고유명사·호칭 오류를 1클릭으로 일괄 정본 치환하고 치환 이력을 반환한다.
 * 화법 위반(register-violation) 등 자동 치환 불가 항목은 대사를 훼손하지 않고 skippedCount로 집계한다.
 */
export function applyBatchBibleTermFixes(
  lines: readonly DialogueLineInput[],
  findings: readonly BibleQaFinding[],
): BatchBibleFixResult {
  const byLine = new Map<string, BibleQaFinding[]>();
  let skippedCount = 0;

  for (const finding of findings) {
    const isFixableKind = finding.kind === "term-mismatch" || finding.kind === "address-mismatch";
    if (!finding.autoFixable || !isFixableKind || finding.suggestedReplacement === null) {
      skippedCount += 1;
      continue;
    }
    const list = byLine.get(finding.lineId);
    if (list) list.push(finding);
    else byLine.set(finding.lineId, [finding]);
  }

  const appliedFixes: BibleFixHistoryEntry[] = [];
  let touchedLineCount = 0;

  const nextLines = lines.map((line) => {
    const candidates = byLine.get(line.id);
    if (!candidates || candidates.length === 0) return line;

    const ordered = [...candidates].sort((a, b) => b.startIndex - a.startIndex || b.endIndex - a.endIndex);
    let nextText = line.text;
    let lastAppliedStart = Number.POSITIVE_INFINITY;
    const lineApplied: BibleFixHistoryEntry[] = [];

    for (const finding of ordered) {
      if (
        finding.suggestedReplacement === null ||
        finding.endIndex > lastAppliedStart ||
        finding.startIndex < 0 ||
        finding.endIndex > nextText.length ||
        nextText.slice(finding.startIndex, finding.endIndex) !== finding.matchedText
      ) {
        skippedCount += 1;
        continue;
      }
      nextText = nextText.slice(0, finding.startIndex) + finding.suggestedReplacement + nextText.slice(finding.endIndex);
      lastAppliedStart = finding.startIndex;
      lineApplied.push({
        findingId: finding.id,
        kind: finding.kind as "term-mismatch" | "address-mismatch",
        lineId: line.id,
        cutNumber: line.cutNumber,
        startIndex: finding.startIndex,
        endIndex: finding.endIndex,
        before: finding.matchedText,
        after: finding.suggestedReplacement,
      });
    }

    if (lineApplied.length === 0) return line;
    touchedLineCount += 1;
    lineApplied.reverse();
    appliedFixes.push(...lineApplied);
    return { ...line, text: nextText };
  });

  return {
    lines: nextLines,
    appliedFixes,
    appliedCount: appliedFixes.length,
    touchedLineCount,
    skippedCount,
  };
}

/** 기본 시연용 설정집(Production Bible) 고유명사·화법·호칭 규칙 */
export const DEFAULT_PRODUCTION_BIBLE_RULES: ProductionBibleQaRules = {
  bibleId: "bible-arcadia-ch42",
  titleKo: "성검 아르카디아 연대기 · 공식 설정집 v4.2",
  titleEn: "Chronicles of Arcadia · Production Bible v4.2",
  terms: [
    {
      id: "term-arcadia",
      category: "place",
      canonTerm: "아르카디아",
      aliases: ["알카디아", "아르카디야"],
      noteKo: "1화 기준 제국 수도 공식 표기",
      noteEn: "Official imperial capital spelling since Ep. 1",
    },
    {
      id: "term-eterna",
      category: "artifact",
      canonTerm: "성검 에테르나",
      aliases: ["성검 에테르노", "에테르나 검"],
      noteKo: "정본 무기명 ('에테르노' 오타 주의)",
      noteEn: "Canon weapon name (avoid 'Eterno' typo)",
    },
    {
      id: "term-blue-moon",
      category: "organization",
      canonTerm: "청월 기사단",
      aliases: ["창월 기사단", "청월기사단"],
      noteKo: "띄어쓰기 포함 정본 조직명",
      noteEn: "Official knight order name with spacing",
    },
    {
      id: "term-chronicle",
      category: "artifact",
      canonTerm: "마도서 크로니클",
      aliases: ["마도서 크로니컬"],
      noteKo: "외래어 표기 통일 ('크로니클')",
      noteEn: "Unified loanword spelling ('Chronicle')",
    },
  ],
  pairRules: [
    {
      id: "pair-jinwoo-to-chaerin",
      speaker: "서진우",
      listener: "유채린",
      expectedRegister: "jondaetmal",
      canonAddressTitle: "선배님",
      forbiddenAddressTitles: ["채린아", "채린 씨", "유채린"],
      noteKo: "후배→선배 관계: 존댓말 고정",
      noteEn: "Junior to senior: polite register required",
    },
    {
      id: "pair-chaerin-to-jinwoo",
      speaker: "유채린",
      listener: "서진우",
      expectedRegister: "banmal",
      canonAddressTitle: "진우야",
      forbiddenAddressTitles: ["진우 님", "서진우 씨"],
      noteKo: "선배→후배 관계: 반말 고정",
      noteEn: "Senior to junior: casual register required",
    },
    {
      id: "pair-kael-to-jinwoo",
      speaker: "카엘 대공",
      listener: "서진우",
      expectedRegister: "haoche",
      canonAddressTitle: "그대",
      forbiddenAddressTitles: ["자네", "너"],
      noteKo: "고풍스러운 하오체 화법 유지",
      noteEn: "Maintains formal archaic Haoche register",
    },
  ],
};

/** 기본 시연용 42화 대사 초안 (오타·호칭·화법 오류와 정상 대사 혼합) */
export const DEFAULT_DIALOGUE_LINES: readonly DialogueLineInput[] = [
  {
    id: "line-cut-01",
    cutNumber: 1,
    speaker: "서진우",
    listener: "유채린",
    text: "채린아, 알카디아 중앙 광장에서 성검 에테르노를 발견했어!",
  },
  {
    id: "line-cut-02",
    cutNumber: 2,
    speaker: "유채린",
    listener: "서진우",
    text: "진우 님, 창월 기사단 쪽에 먼저 보고하세요.",
  },
  {
    id: "line-cut-03",
    cutNumber: 3,
    speaker: "서진우",
    listener: "유채린",
    text: "선배님, 아르카디아 기록실에서 마도서 크로니클을 확인했습니다.",
  },
  {
    id: "line-cut-04",
    cutNumber: 4,
    speaker: "카엘 대공",
    listener: "서진우",
    text: "그대, 청월 기사단의 맹세를 잊지 마오.",
  },
  {
    id: "line-cut-05",
    cutNumber: 5,
    speaker: "카엘 대공",
    listener: "서진우",
    text: "자네, 마도서 크로니컬은 절대 넘기면 안 돼.",
  },
];
