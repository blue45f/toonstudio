/**
 * 연재 세계관 고유명사·용어·시대착오 일관성 검사기 (Aho-Corasick + Levenshtein <= 1).
 *
 * - 외부 서버 호출 0회(₩0), 로컬 메모리 상에서 즉시 완결 동작한다.
 * - 트라이 실패 링크 기반 Aho-Corasick 오토마타와 편집 거리(`Levenshtein <= 1`) 조사 분리 스캐너로
 *   다회차 대본·말풍선의 인물·문파·지명 오탈자, 시대착오 금칙어, 로마자·번역 표기 흔들림을 잡아내고
 *   한국어 받침 유무·ㄹ 받침에 맞춘 조사 호응 자동 교정안을 제안한다.
 */

export type WorldEraSetting =
  | "murim-historical"
  | "medieval-fantasy"
  | "modern-urban"
  | "sci-fi-future";

export type LoreEntityCategory =
  | "character"
  | "clan"
  | "place"
  | "artifact"
  | "skill"
  | "terminology";

export type LoreIssueKind =
  | "misspelled-proper-noun"
  | "fuzzy-typo-proper-noun"
  | "forbidden-anachronism"
  | "inconsistent-romanization";

export interface LoreCanonicalEntry {
  readonly entryId: string;
  readonly category: LoreEntityCategory;
  readonly canonicalKo: string;
  readonly canonicalRomanization?: string;
  readonly knownMisspellings?: readonly string[];
  readonly nonCanonicalTranslations?: readonly string[];
}

export interface ForbiddenAnachronismRule {
  readonly term: string;
  readonly forbiddenInEras: readonly WorldEraSetting[];
  readonly suggestedReplacementKo: string;
  readonly reasonKo: string;
}

export interface LoreEpisodeInput {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly text: string;
}

export interface LoreLinterOptions {
  readonly worldEra: WorldEraSetting;
  readonly entries: readonly LoreCanonicalEntry[];
  readonly anachronismRules?: readonly ForbiddenAnachronismRule[];
  readonly minFuzzyCharLength?: number;
  readonly allowlistedWords?: readonly string[];
}

export interface LoreLintFinding {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly issueKind: LoreIssueKind;
  readonly category: LoreEntityCategory | "anachronism";
  readonly matchedSurface: string;
  readonly canonicalBaseTerm: string;
  readonly suggestedReplacement: string;
  readonly editDistance: number;
  readonly startOffset: number;
  readonly endOffset: number;
  readonly line: number;
  readonly column: number;
  readonly messageKo: string;
}

export interface AutoFixedEpisodeResult {
  readonly episodeId: string;
  readonly episodeNumber: number;
  readonly fixedText: string;
  readonly appliedFixCount: number;
}

export interface LoreConsistencyReport {
  readonly worldEra: WorldEraSetting;
  readonly episodeCount: number;
  readonly automatonStateCount: number;
  readonly findings: readonly LoreLintFinding[];
  readonly crossEpisodeDriftTerms: readonly string[];
  readonly autoFixedEpisodes: readonly AutoFixedEpisodeResult[];
  readonly serverCostKrw: 0;
}

export const DEFAULT_ERA_ANACHRONISM_RULES: readonly ForbiddenAnachronismRule[] = Object.freeze([
  {
    term: "스마트폰",
    forbiddenInEras: ["murim-historical", "medieval-fantasy"],
    suggestedReplacementKo: "전음부",
    reasonKo: "전통 무협·중세 판타지 세계관에 현대 전자기기 명칭이 혼입되었습니다.",
  },
  {
    term: "엘리베이터",
    forbiddenInEras: ["murim-historical", "medieval-fantasy"],
    suggestedReplacementKo: "도르래 승강대",
    reasonKo: "전통 시대 배경 대사에 현대식 외래어 시설명이 쓰였습니다.",
  },
  {
    term: "오케이",
    forbiddenInEras: ["murim-historical", "medieval-fantasy"],
    suggestedReplacementKo: "좋소",
    reasonKo: "시대극 어조를 깨뜨리는 현대 영어 감탄사입니다.",
  },
  {
    term: "컨디션",
    forbiddenInEras: ["murim-historical", "medieval-fantasy"],
    suggestedReplacementKo: "기혈 상태",
    reasonKo: "전통 세계관에서는 몸 상태·기혈 흐름 등 고유 어휘로 바꾸는 편이 자연스럽습니다.",
  },
  {
    term: "낭자",
    forbiddenInEras: ["sci-fi-future"],
    suggestedReplacementKo: "대원",
    reasonKo: "미래 SF 배경에서 고어 호칭이 의도치 않게 섞였습니다.",
  },
]);

const KOREAN_JOSA_SUFFIXES: readonly string[] = Object.freeze([
  "에서부터",
  "으로부터",
  "에게서",
  "한테서",
  "에서는",
  "으로는",
  "이라서",
  "에서",
  "에게",
  "한테",
  "으로",
  "부터",
  "까지",
  "조차",
  "마저",
  "이나",
  "라도",
  "처럼",
  "만큼",
  "이다",
  "이라",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "의",
  "에",
  "로",
  "와",
  "과",
  "도",
  "만",
  "야",
  "아",
]);

interface AutomatonPatternRule {
  readonly pattern: string;
  readonly kind: "canonical-guard" | LoreIssueKind;
  readonly category: LoreEntityCategory | "anachronism";
  readonly canonicalBase: string;
  readonly messageKo: string;
}

interface TrieNode {
  readonly next: Map<number, number>;
  fail: number;
  readonly outputs: number[];
}

function isHangulSyllable(code: number): boolean {
  return code >= 0xac00 && code <= 0xd7a3;
}

function isAsciiAlphaNumeric(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122)
  );
}

function isWordChar(code: number): boolean {
  return isHangulSyllable(code) || isAsciiAlphaNumeric(code);
}

/**
 * 한국어 체언 마지막 음절의 받침 유무(및 ㄹ 받침)에 맞춰 뒤따르는 조사를 자연스럽게 교정한다.
 */
export function harmonizeKoreanJosa(stem: string, josa: string): string {
  if (josa.length === 0 || stem.length === 0) return josa;
  const lastCode = stem.charCodeAt(stem.length - 1);
  if (!isHangulSyllable(lastCode)) return josa;

  const jongseong = (lastCode - 0xac00) % 28;
  const hasBatchim = jongseong !== 0;
  const isRieulBatchim = jongseong === 8;

  if (josa === "은" || josa === "는") return hasBatchim ? "은" : "는";
  if (josa === "이" || josa === "가") return hasBatchim ? "이" : "가";
  if (josa === "을" || josa === "를") return hasBatchim ? "을" : "를";
  if (josa === "과" || josa === "와") return hasBatchim ? "과" : "와";
  if (josa === "아" || josa === "야") return hasBatchim ? "아" : "야";
  if (josa === "이라" || josa === "라") return hasBatchim ? "이라" : "라";
  if (josa === "으로" || josa === "로") {
    return !hasBatchim || isRieulBatchim ? "로" : "으로";
  }
  if (josa === "으로는" || josa === "로는") {
    return !hasBatchim || isRieulBatchim ? "로는" : "으로는";
  }
  return josa;
}

/**
 * 두 문자열의 Levenshtein 편집 거리가 1 이하인지 `O(|a|)` 단일 패스로 판정한다(`0`, `1`, 또는 `2` 이상).
 */
export function boundedLevenshteinAtMostOne(a: string, b: string): 0 | 1 | 2 {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return 2;

  if (lenA === lenB) {
    let mismatches = 0;
    for (let i = 0; i < lenA; i += 1) {
      if (a.charCodeAt(i) !== b.charCodeAt(i)) {
        mismatches += 1;
        if (mismatches > 1) return 2;
      }
    }
    return 1;
  }

  const shorter = lenA < lenB ? a : b;
  const longer = lenA < lenB ? b : a;
  let si = 0;
  let li = 0;
  let edits = 0;
  while (si < shorter.length && li < longer.length) {
    if (shorter.charCodeAt(si) === longer.charCodeAt(li)) {
      si += 1;
      li += 1;
    } else {
      edits += 1;
      if (edits > 1) return 2;
      li += 1;
    }
  }
  return 1;
}

function splitHangulStemAndJosa(word: string): { readonly stem: string; readonly josa: string } {
  for (const suffix of KOREAN_JOSA_SUFFIXES) {
    if (word.length >= suffix.length + 2 && word.endsWith(suffix)) {
      const stem = word.slice(0, word.length - suffix.length);
      if (isHangulSyllable(stem.charCodeAt(stem.length - 1))) {
        return { stem, josa: suffix };
      }
    }
  }
  return { stem: word, josa: "" };
}

function extractTrailingJosaAt(
  text: string,
  afterPos: number,
): { readonly josa: string; readonly endPos: number } | null {
  if (afterPos >= text.length) return { josa: "", endPos: afterPos };
  const nextCode = text.charCodeAt(afterPos);
  if (!isWordChar(nextCode)) return { josa: "", endPos: afterPos };
  let wordEnd = afterPos;
  while (wordEnd < text.length && isHangulSyllable(text.charCodeAt(wordEnd))) {
    wordEnd += 1;
  }
  if (wordEnd < text.length && isWordChar(text.charCodeAt(wordEnd))) return null;
  const trailing = text.slice(afterPos, wordEnd);
  return KOREAN_JOSA_SUFFIXES.includes(trailing) ? { josa: trailing, endPos: wordEnd } : null;
}

class LoreAhoCorasickAutomaton {
  readonly nodes: TrieNode[] = [{ next: new Map(), fail: 0, outputs: [] }];
  readonly rules: AutomatonPatternRule[] = [];

  addRule(rule: AutomatonPatternRule): void {
    if (rule.pattern.length === 0) return;
    const ruleIdx = this.rules.length;
    this.rules.push(rule);
    let cur = 0;
    for (let i = 0; i < rule.pattern.length; i += 1) {
      const ch = rule.pattern.charCodeAt(i);
      const existing = this.nodes[cur]!.next.get(ch);
      if (existing !== undefined) {
        cur = existing;
      } else {
        const nextIdx = this.nodes.length;
        this.nodes.push({ next: new Map(), fail: 0, outputs: [] });
        this.nodes[cur]!.next.set(ch, nextIdx);
        cur = nextIdx;
      }
    }
    this.nodes[cur]!.outputs.push(ruleIdx);
  }

  compile(): void {
    const queue: number[] = [];
    for (const childIdx of this.nodes[0]!.next.values()) {
      this.nodes[childIdx]!.fail = 0;
      queue.push(childIdx);
    }

    let head = 0;
    while (head < queue.length) {
      const state = queue[head]!;
      head += 1;
      const node = this.nodes[state]!;
      for (const [ch, target] of node.next.entries()) {
        let fallback = node.fail;
        while (fallback !== 0 && !this.nodes[fallback]!.next.has(ch)) {
          fallback = this.nodes[fallback]!.fail;
        }
        const failTarget = this.nodes[fallback]!.next.get(ch) ?? 0;
        this.nodes[target]!.fail = failTarget === target ? 0 : failTarget;
        const inherited = this.nodes[this.nodes[target]!.fail]!.outputs;
        if (inherited.length > 0) this.nodes[target]!.outputs.push(...inherited);
        queue.push(target);
      }
    }
  }
}

function buildLineOffsetTable(text: string): readonly number[] {
  const starts: number[] = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return starts;
}

function offsetToLineColumn(
  lineStarts: readonly number[],
  offset: number,
): { readonly line: number; readonly column: number } {
  let lo = 0;
  let hi = lineStarts.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((lineStarts[mid] ?? 0) <= offset) lo = mid + 1;
    else hi = mid - 1;
  }
  const lineIdx = Math.max(0, hi);
  return { line: lineIdx + 1, column: offset - (lineStarts[lineIdx] ?? 0) + 1 };
}

/**
 * 다회차 원고 대사를 Aho-Corasick 오토마타와 편집 거리(`Levenshtein <= 1`) 조사 분석기로 스캔해
 * 고유명사 오탈자·시대착오 어휘·번역/로마자 불일치를 검출하고 자동 교정본을 생성한다.
 */
export function lintSeriesLoreConsistency(
  episodes: readonly LoreEpisodeInput[],
  options: LoreLinterOptions,
): LoreConsistencyReport {
  const automaton = new LoreAhoCorasickAutomaton();
  const minFuzzyLen = Math.max(2, Math.floor(options.minFuzzyCharLength ?? 3));
  const anachronismRules = options.anachronismRules ?? DEFAULT_ERA_ANACHRONISM_RULES;
  const canonicalSet = new Set<string>(options.allowlistedWords ?? []);

  for (const entry of options.entries) {
    canonicalSet.add(entry.canonicalKo);
    automaton.addRule({
      pattern: entry.canonicalKo,
      kind: "canonical-guard",
      category: entry.category,
      canonicalBase: entry.canonicalKo,
      messageKo: "",
    });

    if (entry.canonicalRomanization) {
      canonicalSet.add(entry.canonicalRomanization);
      automaton.addRule({
        pattern: entry.canonicalRomanization,
        kind: "canonical-guard",
        category: entry.category,
        canonicalBase: entry.canonicalRomanization,
        messageKo: "",
      });
    }

    for (const wrong of entry.knownMisspellings ?? []) {
      automaton.addRule({
        pattern: wrong,
        kind: "misspelled-proper-noun",
        category: entry.category,
        canonicalBase: entry.canonicalKo,
        messageKo: `등록된 고유명사 오표기 '${wrong}' -> 정본 '${entry.canonicalKo}' 표기로 통일하세요.`,
      });
    }

    for (const nonCanon of entry.nonCanonicalTranslations ?? []) {
      const targetRoman = entry.canonicalRomanization ?? entry.canonicalKo;
      automaton.addRule({
        pattern: nonCanon,
        kind: "inconsistent-romanization",
        category: entry.category,
        canonicalBase: targetRoman,
        messageKo: `로마자·번역 표기 흔들림 '${nonCanon}' -> 정본 '${targetRoman}' 표기로 맞추세요.`,
      });
    }
  }

  for (const rule of anachronismRules) {
    if (rule.forbiddenInEras.includes(options.worldEra)) {
      automaton.addRule({
        pattern: rule.term,
        kind: "forbidden-anachronism",
        category: "anachronism",
        canonicalBase: rule.suggestedReplacementKo,
        messageKo: `${rule.reasonKo} ('${rule.term}' -> '${rule.suggestedReplacementKo}')`,
      });
    }
  }

  automaton.compile();

  const findings: LoreLintFinding[] = [];
  const autoFixedEpisodes: AutoFixedEpisodeResult[] = [];
  const baseTermEpisodes = new Map<string, Set<string>>();

  const recordTermSurface = (canonicalBase: string, surface: string): void => {
    let seen = baseTermEpisodes.get(canonicalBase);
    if (!seen) {
      seen = new Set<string>();
      baseTermEpisodes.set(canonicalBase, seen);
    }
    seen.add(surface);
  };

  for (const ep of episodes) {
    const text = ep.text;
    const lineStarts = buildLineOffsetTable(text);
    const rawCandidates: {
      readonly startOffset: number;
      readonly endOffset: number;
      readonly rule: AutomatonPatternRule;
      readonly josa: string;
    }[] = [];

    let state = 0;
    for (let i = 0; i < text.length; i += 1) {
      const ch = text.charCodeAt(i);
      while (state !== 0 && !automaton.nodes[state]!.next.has(ch)) {
        state = automaton.nodes[state]!.fail;
      }
      state = automaton.nodes[state]!.next.get(ch) ?? 0;
      const outs = automaton.nodes[state]!.outputs;
      if (outs.length === 0) continue;

      for (const ruleIdx of outs) {
        const rule = automaton.rules[ruleIdx]!;
        const patStart = i - rule.pattern.length + 1;
        const patEnd = i + 1;
        if (patStart > 0 && isWordChar(text.charCodeAt(patStart - 1))) continue;

        if (isAsciiAlphaNumeric(rule.pattern.charCodeAt(0))) {
          if (patEnd < text.length && isAsciiAlphaNumeric(text.charCodeAt(patEnd))) continue;
          rawCandidates.push({ startOffset: patStart, endOffset: patEnd, rule, josa: "" });
        } else {
          const josaCheck = extractTrailingJosaAt(text, patEnd);
          if (!josaCheck) continue;
          rawCandidates.push({
            startOffset: patStart,
            endOffset: josaCheck.endPos,
            rule,
            josa: josaCheck.josa,
          });
        }
      }
    }

    rawCandidates.sort((a, b) => {
      if (a.startOffset !== b.startOffset) return a.startOffset - b.startOffset;
      const lenDiff = b.endOffset - b.startOffset - (a.endOffset - a.startOffset);
      if (lenDiff !== 0) return lenDiff;
      return a.rule.kind === "canonical-guard" ? -1 : 1;
    });

    const occupiedSpans: { readonly start: number; readonly end: number }[] = [];
    const epFindings: LoreLintFinding[] = [];
    let cursor = 0;

    for (const cand of rawCandidates) {
      if (cand.startOffset < cursor) continue;
      cursor = cand.endOffset;
      occupiedSpans.push({ start: cand.startOffset, end: cand.endOffset });

      const baseStem = text.slice(cand.startOffset, cand.endOffset - cand.josa.length);
      recordTermSurface(cand.rule.canonicalBase, baseStem);
      if (cand.rule.kind === "canonical-guard") continue;

      const harmonizedJosa = harmonizeKoreanJosa(cand.rule.canonicalBase, cand.josa);
      const suggestedReplacement = `${cand.rule.canonicalBase}${harmonizedJosa}`;
      const pos = offsetToLineColumn(lineStarts, cand.startOffset);

      epFindings.push({
        episodeId: ep.episodeId,
        episodeNumber: ep.episodeNumber,
        issueKind: cand.rule.kind,
        category: cand.rule.category,
        matchedSurface: text.slice(cand.startOffset, cand.endOffset),
        canonicalBaseTerm: cand.rule.canonicalBase,
        suggestedReplacement,
        editDistance: boundedLevenshteinAtMostOne(baseStem, cand.rule.canonicalBase) === 1 ? 1 : 0,
        startOffset: cand.startOffset,
        endOffset: cand.endOffset,
        line: pos.line,
        column: pos.column,
        messageKo: cand.rule.messageKo,
      });
    }

    const isCovered = (s: number, e: number): boolean =>
      occupiedSpans.some((span) => s < span.end && e > span.start);

    let tokStart = -1;
    for (let i = 0; i <= text.length; i += 1) {
      const inWord = i < text.length && isWordChar(text.charCodeAt(i));
      if (inWord && tokStart < 0) {
        tokStart = i;
      } else if (!inWord && tokStart >= 0) {
        const tokEnd = i;
        const rawToken = text.slice(tokStart, tokEnd);
        if (!isCovered(tokStart, tokEnd) && !canonicalSet.has(rawToken)) {
          const { stem, josa } = splitHangulStemAndJosa(rawToken);
          if (stem.length >= minFuzzyLen && !canonicalSet.has(stem)) {
            for (const entry of options.entries) {
              if (entry.canonicalKo.length < minFuzzyLen) continue;
              if (boundedLevenshteinAtMostOne(stem, entry.canonicalKo) === 1) {
                const pos = offsetToLineColumn(lineStarts, tokStart);
                const suggested = `${entry.canonicalKo}${harmonizeKoreanJosa(entry.canonicalKo, josa)}`;
                recordTermSurface(entry.canonicalKo, stem);
                epFindings.push({
                  episodeId: ep.episodeId,
                  episodeNumber: ep.episodeNumber,
                  issueKind: "fuzzy-typo-proper-noun",
                  category: entry.category,
                  matchedSurface: rawToken,
                  canonicalBaseTerm: entry.canonicalKo,
                  suggestedReplacement: suggested,
                  editDistance: 1,
                  startOffset: tokStart,
                  endOffset: tokEnd,
                  line: pos.line,
                  column: pos.column,
                  messageKo: `고유명사 근접 오탈자 의심 '${rawToken}' (편집 거리 1) -> '${suggested}' 교정을 권장합니다.`,
                });
                break;
              }
            }
          }
        }
        tokStart = -1;
      }
    }

    epFindings.sort((a, b) => a.startOffset - b.startOffset);
    findings.push(...epFindings);

    let fixedText = "";
    let lastIdx = 0;
    for (const f of epFindings) {
      if (f.startOffset < lastIdx) continue;
      fixedText += text.slice(lastIdx, f.startOffset) + f.suggestedReplacement;
      lastIdx = f.endOffset;
    }
    fixedText += text.slice(lastIdx);

    autoFixedEpisodes.push({
      episodeId: ep.episodeId,
      episodeNumber: ep.episodeNumber,
      fixedText,
      appliedFixCount: epFindings.length,
    });
  }

  const crossEpisodeDriftTerms: string[] = [];
  for (const [baseTerm, surfaceSet] of baseTermEpisodes.entries()) {
    if (surfaceSet.size > 1) crossEpisodeDriftTerms.push(baseTerm);
  }

  return {
    worldEra: options.worldEra,
    episodeCount: episodes.length,
    automatonStateCount: automaton.nodes.length,
    findings,
    crossEpisodeDriftTerms,
    autoFixedEpisodes,
    serverCostKrw: 0,
  };
}
