/**
 * Wasm64 Wave 23: 무서버(₩0) 한글 초성·자모 분해 + 퍼지 BM25F 다회차 원고 검색 엔진.
 *
 * - 유니코드 한글 음절(`U+AC00..U+D7A3`)을 초성·중성·종성 자모열로 즉시 분해한다.
 * - 대사(`dialogue`)·등장인물(`character`)·연출 노트(`note`)·효과음(`sfx`) 4개 필드를
 *   필드별 가중치 및 길이 정규화 계수(`b_f`)가 분리된 BM25F 모델로 색인한다.
 * - 초성 접두사·부분문자열(`ㅎㄱ` -> `황궁`), 음운 결합 규칙 기반 조사 비민감 어간 매칭,
 *   1-자모 삭제·삽입·치환·전치 오타 허용 검색을 `< 1ms` 안에 처리한다.
 */

export type ManuscriptFieldKey = "dialogue" | "character" | "note" | "sfx";

export type ManuscriptMatchKind =
  | "exact" | "stem" | "syllable-prefix"
  | "choseong-exact" | "choseong-prefix" | "choseong-substring" | "jamo-typo-1";

export interface HangulDecomposition {
  readonly normalized: string;
  readonly choseong: string;
  readonly jamo: string;
  readonly syllableCount: number;
  readonly isChoseongOnly: boolean;
}

export interface ManuscriptCutDocument {
  readonly id: string;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly dialogue?: readonly string[] | string;
  readonly character?: readonly string[] | string;
  readonly note?: readonly string[] | string;
  readonly sfx?: readonly string[] | string;
}

export interface Bm25fFieldConfig { readonly weight: number; readonly lengthNormB: number }

export interface ManuscriptBm25fConfig {
  readonly k1?: number;
  readonly fields?: Partial<Readonly<Record<ManuscriptFieldKey, Bm25fFieldConfig>>>;
  readonly maxPrefixLength?: number;
  readonly maxChoseongSubstringLength?: number;
}

export interface ManuscriptSearchQueryOptions {
  readonly limit?: number;
  readonly episodeNumbers?: readonly number[];
  readonly allowFuzzyJamoTypo?: boolean;
  readonly allowChoseongSubstring?: boolean;
}

export interface ManuscriptTermMatchDetail {
  readonly queryToken: string;
  readonly matchedVocabularyTerm: string;
  readonly matchKind: ManuscriptMatchKind;
  readonly matchedFields: readonly ManuscriptFieldKey[];
  readonly termScore: number;
}

export interface ManuscriptSearchHit {
  readonly documentId: string;
  readonly episodeNumber: number;
  readonly cutNumber: number;
  readonly score: number;
  readonly matchedFields: readonly ManuscriptFieldKey[];
  readonly matchKinds: readonly ManuscriptMatchKind[];
  readonly termMatches: readonly ManuscriptTermMatchDetail[];
  readonly previewText: string;
}

export interface ManuscriptSearchResponse {
  readonly query: string;
  readonly hits: readonly ManuscriptSearchHit[];
  readonly totalMatchedDocuments: number;
  readonly elapsedMs: number;
}

export interface ManuscriptIndexStats {
  readonly documentCount: number;
  readonly vocabularySize: number;
  readonly averageFieldLengths: Readonly<Record<ManuscriptFieldKey, number>>;
  readonly buildElapsedMs: number;
}

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const COMPAT_CONSONANT_FIRST = 0x3131;
const COMPAT_CONSONANT_LAST = 0x314e;
const COMPAT_VOWEL_FIRST = 0x314f;
const COMPAT_VOWEL_LAST = 0x3163;

const CHOSEONG_TABLE: readonly string[] = Object.freeze([
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
]);
const JUNGSEONG_TABLE: readonly string[] = Object.freeze([
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
]);
const JONGSEONG_TABLE: readonly string[] = Object.freeze([
  "", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
]);

const FIELD_KEYS: readonly ManuscriptFieldKey[] = Object.freeze(["dialogue", "character", "note", "sfx"]);

export const DEFAULT_BM25F_FIELD_CONFIGS: Readonly<Record<ManuscriptFieldKey, Bm25fFieldConfig>> = Object.freeze({
  character: { weight: 2.4, lengthNormB: 0.35 },
  dialogue: { weight: 1.85, lengthNormB: 0.72 },
  sfx: { weight: 1.45, lengthNormB: 0.4 },
  note: { weight: 1.15, lengthNormB: 0.68 },
});

const MATCH_KIND_MULTIPLIER: Readonly<Record<ManuscriptMatchKind, number>> = Object.freeze({
  exact: 1.0,
  stem: 0.96,
  "syllable-prefix": 0.84,
  "choseong-exact": 0.91,
  "choseong-prefix": 0.79,
  "choseong-substring": 0.67,
  "jamo-typo-1": 0.64,
});

type BatchimConstraint = "any" | "with-batchim" | "no-batchim" | "with-non-rieul" | "no-or-rieul";
type ParticleSpecTuple = readonly [suffix: string, batchim: BatchimConstraint, allowSingleStem: boolean];

/** 길이 내림차순 한국어 조사 테이블 (음운론적 받침 결합 조건 포함) */
const KOREAN_PARTICLE_TUPLES: readonly ParticleSpecTuple[] = Object.freeze([
  ["으로부터", "with-non-rieul", true], ["에서는", "any", true], ["에게서", "any", true],
  ["한테서", "any", true], ["로부터", "no-or-rieul", true], ["이라도", "with-batchim", false],
  ["까지는", "any", false], ["만으로", "any", false], ["으로는", "with-non-rieul", true],
  ["에서", "any", true], ["에게", "any", true], ["한테", "any", true], ["께서", "any", true],
  ["으로", "with-non-rieul", true], ["처럼", "any", true], ["만큼", "any", true],
  ["까지", "any", true], ["부터", "any", true], ["마저", "any", false], ["조차", "any", false],
  ["이나", "with-batchim", false], ["이라", "with-batchim", false], ["이랑", "with-batchim", false],
  ["하고", "any", false], ["보다", "any", false], ["에는", "any", true], ["에도", "any", true],
  ["의", "any", true], ["은", "with-batchim", true], ["는", "no-batchim", true],
  ["이", "with-batchim", true], ["가", "no-batchim", true], ["을", "with-batchim", true],
  ["를", "no-batchim", true], ["에", "any", true], ["도", "any", false], ["만", "any", false],
  ["로", "no-or-rieul", true], ["과", "with-batchim", true], ["와", "no-batchim", true],
]);

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const isHangulSyllableCode = (code: number): boolean => code >= HANGUL_BASE && code <= HANGUL_LAST;
const isWordCharCode = (code: number): boolean =>
  (code >= HANGUL_BASE && code <= HANGUL_LAST) ||
  (code >= COMPAT_CONSONANT_FIRST && code <= COMPAT_VOWEL_LAST) ||
  (code >= 0x30 && code <= 0x39) ||
  (code >= 0x41 && code <= 0x5a) ||
  (code >= 0x61 && code <= 0x7a);

/** 정규표현식을 사용하지 않는 선형(`O(n)`) 한글·영숫자 토크나이저 */
export function tokenizeManuscriptText(text: string): readonly string[] {
  const tokens: string[] = [];
  let current = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (isWordCharCode(code)) {
      current += code >= 0x41 && code <= 0x5a ? String.fromCharCode(code + 32) : text[i]!;
    } else if (current.length > 0) {
      tokens.push(current);
      current = "";
    }
  }
  if (current.length > 0) tokens.push(current);
  return tokens;
}

/** 한글 음절(`U+AC00..U+D7A3`) 및 호환 자모를 초성열과 선형 자모열로 분해한다. */
export function decomposeHangulText(input: string): HangulDecomposition {
  let normalized = "";
  let choseong = "";
  let jamo = "";
  let syllableCount = 0;
  let consonantCount = 0;
  let hasVowelOrAlnum = false;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (isHangulSyllableCode(code)) {
      const offset = code - HANGUL_BASE;
      const cho = CHOSEONG_TABLE[Math.floor(offset / 588)]!;
      const jung = JUNGSEONG_TABLE[Math.floor((offset % 588) / 28)]!;
      const jong = JONGSEONG_TABLE[offset % 28]!;
      normalized += input[i]!;
      choseong += cho;
      jamo += cho + jung + jong;
      syllableCount += 1;
    } else if (code >= COMPAT_CONSONANT_FIRST && code <= COMPAT_CONSONANT_LAST) {
      const ch = input[i]!;
      normalized += ch;
      choseong += ch;
      jamo += ch;
      consonantCount += 1;
    } else if (code >= COMPAT_VOWEL_FIRST && code <= COMPAT_VOWEL_LAST) {
      normalized += input[i]!;
      jamo += input[i]!;
      hasVowelOrAlnum = true;
    } else if (code >= 0x41 && code <= 0x5a) {
      const lower = String.fromCharCode(code + 32);
      normalized += lower;
      jamo += lower;
      hasVowelOrAlnum = true;
    } else if ((code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a)) {
      normalized += input[i]!;
      jamo += input[i]!;
      hasVowelOrAlnum = true;
    }
  }

  return {
    normalized,
    choseong,
    jamo,
    syllableCount,
    isChoseongOnly: consonantCount > 0 && syllableCount === 0 && !hasVowelOrAlnum,
  };
}

function satisfiesBatchimConstraint(lastStemCode: number, rule: BatchimConstraint): boolean {
  if (!isHangulSyllableCode(lastStemCode)) return rule === "any";
  const jong = (lastStemCode - HANGUL_BASE) % 28;
  switch (rule) {
    case "any": return true;
    case "with-batchim": return jong > 0;
    case "no-batchim": return jong === 0;
    case "with-non-rieul": return jong > 0 && jong !== 8;
    case "no-or-rieul": return jong === 0 || jong === 8;
  }
}

/** 어절 끝의 한국어 조사를 음운 결합 조건(받침 유무·ㄹ 받침 예외)에 맞춰 제거하고 원형 어간을 반환한다. */
export function stripKoreanParticle(token: string): string {
  if (token.length < 2) return token;
  for (const [suffix, batchim, allowSingle] of KOREAN_PARTICLE_TUPLES) {
    if (!token.endsWith(suffix)) continue;
    const stemLen = token.length - suffix.length;
    if (stemLen < 1 || (stemLen === 1 && !allowSingle)) continue;
    const lastStemCode = token.charCodeAt(stemLen - 1);
    if (isHangulSyllableCode(lastStemCode) && satisfiesBatchimConstraint(lastStemCode, batchim)) {
      return token.slice(0, stemLen);
    }
  }
  return token;
}

/** 두 자모열 사이의 편집 거리(삽입·삭제·치환·인접 자모 전치 포함)가 1 이하인지 판정한다. */
export function computeBoundedJamoDistance1(a: string, b: string): 0 | 1 | 2 {
  if (a === b) return 0;
  const lenA = a.length;
  const lenB = b.length;
  if (Math.abs(lenA - lenB) > 1) return 2;

  if (lenA === lenB) {
    let firstMismatch = -1;
    let mismatchCount = 0;
    for (let i = 0; i < lenA; i++) {
      if (a.charCodeAt(i) === b.charCodeAt(i)) continue;
      mismatchCount += 1;
      if (mismatchCount === 1) {
        firstMismatch = i;
      } else if (
        mismatchCount !== 2 ||
        i !== firstMismatch + 1 ||
        a.charCodeAt(firstMismatch) !== b.charCodeAt(i) ||
        a.charCodeAt(i) !== b.charCodeAt(firstMismatch)
      ) {
        return 2;
      }
    }
    return 1;
  }

  const shorter = lenA < lenB ? a : b;
  const longer = lenA < lenB ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < shorter.length && j < longer.length) {
    if (shorter.charCodeAt(i) === longer.charCodeAt(j)) {
      i += 1;
      j += 1;
    } else if (skipped) {
      return 2;
    } else {
      skipped = true;
      j += 1;
    }
  }
  return 1;
}

interface PostingEntry {
  readonly docIdx: number;
  readonly fieldTf: readonly [number, number, number, number];
}

interface VocabularyEntry {
  readonly termId: number;
  readonly term: string;
  readonly isDerivedStem: boolean;
  readonly choseong: string;
  readonly jamo: string;
  readonly postings: PostingEntry[];
  idf: number;
}

interface IndexedDocumentRecord {
  readonly doc: ManuscriptCutDocument;
  readonly fieldLengths: readonly [number, number, number, number];
  readonly previewText: string;
}

function normalizeFieldInput(value: readonly string[] | string | undefined): string {
  if (!value) return "";
  return typeof value === "string" ? value : value.join(" ");
}

function pushMapList<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  if (!list.includes(value)) list.push(value);
}

export class KoreanJamoBm25fManuscriptEngine {
  private readonly k1: number;
  private readonly fieldConfigs: Readonly<Record<ManuscriptFieldKey, Bm25fFieldConfig>>;
  private readonly maxPrefixLength: number;
  private readonly maxChoseongSubstringLength: number;

  private readonly documents: IndexedDocumentRecord[] = [];
  private readonly averageFieldLengths: Record<ManuscriptFieldKey, number>;
  private readonly vocabulary: VocabularyEntry[] = [];
  private readonly exactTermMap = new Map<string, number>();
  private readonly syllablePrefixMap = new Map<string, number[]>();
  private readonly choseongExactMap = new Map<string, number[]>();
  private readonly choseongPrefixMap = new Map<string, number[]>();
  private readonly choseongSubstringMap = new Map<string, number[]>();
  private readonly jamoExactMap = new Map<string, number[]>();
  private readonly jamoDelete1Map = new Map<string, number[]>();
  private readonly buildElapsedMs: number;

  constructor(manuscripts: readonly ManuscriptCutDocument[], config?: ManuscriptBm25fConfig) {
    const startMs = nowMs();
    this.k1 = config?.k1 ?? 1.25;
    this.fieldConfigs = {
      character: config?.fields?.character ?? DEFAULT_BM25F_FIELD_CONFIGS.character,
      dialogue: config?.fields?.dialogue ?? DEFAULT_BM25F_FIELD_CONFIGS.dialogue,
      sfx: config?.fields?.sfx ?? DEFAULT_BM25F_FIELD_CONFIGS.sfx,
      note: config?.fields?.note ?? DEFAULT_BM25F_FIELD_CONFIGS.note,
    };
    this.maxPrefixLength = Math.max(2, config?.maxPrefixLength ?? 6);
    this.maxChoseongSubstringLength = Math.max(2, config?.maxChoseongSubstringLength ?? 5);

    const fieldTotals: [number, number, number, number] = [0, 0, 0, 0];

    for (let docIdx = 0; docIdx < manuscripts.length; docIdx++) {
      const doc = manuscripts[docIdx]!;
      const rawFields: readonly [string, string, string, string] = [
        normalizeFieldInput(doc.dialogue),
        normalizeFieldInput(doc.character),
        normalizeFieldInput(doc.note),
        normalizeFieldInput(doc.sfx),
      ];
      const docLengths: [number, number, number, number] = [0, 0, 0, 0];
      const perDocTermCounts = new Map<number, [number, number, number, number]>();

      for (let fIdx = 0; fIdx < 4; fIdx++) {
        const tokens = tokenizeManuscriptText(rawFields[fIdx]!);
        docLengths[fIdx] = tokens.length;
        fieldTotals[fIdx]! += tokens.length;

        for (const surface of tokens) {
          this.incrementDocTermCount(perDocTermCounts, this.getOrRegisterVocabularyTerm(surface, false), fIdx);
          const stem = stripKoreanParticle(surface);
          if (stem !== surface && stem.length >= 1) {
            this.incrementDocTermCount(perDocTermCounts, this.getOrRegisterVocabularyTerm(stem, true), fIdx);
          }
        }
      }

      for (const [termId, counts] of perDocTermCounts) {
        this.vocabulary[termId]!.postings.push({ docIdx, fieldTf: counts });
      }

      const previewParts = [rawFields[1], rawFields[0], rawFields[3], rawFields[2]].filter((p) => p.length > 0);
      this.documents.push({ doc, fieldLengths: docLengths, previewText: previewParts.join(" · ").slice(0, 140) });
    }

    const totalDocs = Math.max(1, this.documents.length);
    this.averageFieldLengths = {
      dialogue: Math.max(1, fieldTotals[0] / totalDocs), character: Math.max(1, fieldTotals[1] / totalDocs),
      note: Math.max(1, fieldTotals[2] / totalDocs), sfx: Math.max(1, fieldTotals[3] / totalDocs),
    };
    const docCount = this.documents.length;
    for (const entry of this.vocabulary) {
      const df = entry.postings.length;
      entry.idf = Math.log(1 + (docCount - df + 0.5) / (df + 0.5));
    }
    this.buildElapsedMs = nowMs() - startMs;
  }

  getStats(): ManuscriptIndexStats {
    return {
      documentCount: this.documents.length, vocabularySize: this.vocabulary.length,
      averageFieldLengths: { ...this.averageFieldLengths }, buildElapsedMs: this.buildElapsedMs,
    };
  }

  search(query: string, options?: ManuscriptSearchQueryOptions): ManuscriptSearchResponse {
    const startMs = nowMs();
    const queryTokens = tokenizeManuscriptText(query);
    if (queryTokens.length === 0 || this.documents.length === 0) {
      return { query, hits: [], totalMatchedDocuments: 0, elapsedMs: nowMs() - startMs };
    }

    const limit = Math.max(1, options?.limit ?? 20);
    const allowFuzzy = options?.allowFuzzyJamoTypo ?? true;
    const allowChoseongSub = options?.allowChoseongSubstring ?? true;
    const episodeFilter =
      options?.episodeNumbers && options.episodeNumbers.length > 0 ? new Set(options.episodeNumbers) : null;

    const docTotalScores = new Float64Array(this.documents.length);
    const docMatchedTokenCounts = new Uint16Array(this.documents.length);
    const docDetails = new Map<number, ManuscriptTermMatchDetail[]>();
    const touchedDocs: number[] = [];

    for (const qToken of queryTokens) {
      const candidates = this.collectCandidateVocabularyTerms(qToken, allowFuzzy, allowChoseongSub);
      if (candidates.size === 0) continue;

      let anchorDf = 0;
      for (const [tId, kind] of candidates) {
        if (kind === "exact" || kind === "stem" || kind === "choseong-exact") {
          anchorDf = Math.max(anchorDf, this.vocabulary[tId]!.postings.length);
        }
      }
      const anchorIdf = anchorDf > 0 ? Math.log(1 + (this.documents.length - anchorDf + 0.5) / (anchorDf + 0.5)) : 0;
      const bestPerDoc = new Map<
        number,
        { score: number; vocabTerm: string; kind: ManuscriptMatchKind; fieldsMask: number }
      >();

      for (const [termId, matchKind] of candidates) {
        const vocab = this.vocabulary[termId]!;
        const effectiveIdf = anchorDf > vocab.postings.length ? anchorIdf : vocab.idf;
        const kindMultiplier = MATCH_KIND_MULTIPLIER[matchKind];

        for (const posting of vocab.postings) {
          const docRecord = this.documents[posting.docIdx]!;
          if (episodeFilter && !episodeFilter.has(docRecord.doc.episodeNumber)) continue;

          const { pseudoTf, fieldsMask } = this.computePseudoTf(posting.fieldTf, docRecord.fieldLengths);
          if (pseudoTf <= 0) continue;

          const bm25Term = effectiveIdf * ((pseudoTf * (this.k1 + 1)) / (pseudoTf + this.k1)) * kindMultiplier;
          const prev = bestPerDoc.get(posting.docIdx);
          if (!prev || bm25Term > prev.score) {
            bestPerDoc.set(posting.docIdx, {
              score: bm25Term,
              vocabTerm: vocab.term,
              kind: matchKind,
              fieldsMask: prev ? prev.fieldsMask | fieldsMask : fieldsMask,
            });
          } else {
            prev.fieldsMask |= fieldsMask;
          }
        }
      }

      for (const [docIdx, best] of bestPerDoc) {
        if (docMatchedTokenCounts[docIdx] === 0) touchedDocs.push(docIdx);
        docTotalScores[docIdx] = (docTotalScores[docIdx] ?? 0) + best.score;
        docMatchedTokenCounts[docIdx] = (docMatchedTokenCounts[docIdx] ?? 0) + 1;

        const fields: ManuscriptFieldKey[] = [];
        for (let f = 0; f < 4; f++) {
          if ((best.fieldsMask & (1 << f)) !== 0) fields.push(FIELD_KEYS[f]!);
        }

        let detailList = docDetails.get(docIdx);
        if (!detailList) {
          detailList = [];
          docDetails.set(docIdx, detailList);
        }
        detailList.push({
          queryToken: qToken,
          matchedVocabularyTerm: best.vocabTerm,
          matchKind: best.kind,
          matchedFields: fields,
          termScore: best.score,
        });
      }
    }

    const qCount = queryTokens.length;
    for (const docIdx of touchedDocs) {
      if (qCount > 1 && (docMatchedTokenCounts[docIdx] ?? 0) === qCount) {
        docTotalScores[docIdx] = (docTotalScores[docIdx] ?? 0) * 1.18;
      }
    }

    touchedDocs.sort((a, b) => {
      const diff = (docTotalScores[b] ?? 0) - (docTotalScores[a] ?? 0);
      if (Math.abs(diff) > 1e-9) return diff;
      const docA = this.documents[a]!.doc;
      const docB = this.documents[b]!.doc;
      return docA.episodeNumber !== docB.episodeNumber
        ? docA.episodeNumber - docB.episodeNumber
        : docA.cutNumber - docB.cutNumber;
    });

    const hits: ManuscriptSearchHit[] = touchedDocs.slice(0, limit).map((docIdx) => {
      const record = this.documents[docIdx]!;
      const details = docDetails.get(docIdx) ?? [];
      const fieldSet = new Set<ManuscriptFieldKey>();
      const kindSet = new Set<ManuscriptMatchKind>();
      for (const d of details) {
        kindSet.add(d.matchKind);
        for (const f of d.matchedFields) fieldSet.add(f);
      }
      return {
        documentId: record.doc.id,
        episodeNumber: record.doc.episodeNumber,
        cutNumber: record.doc.cutNumber,
        score: docTotalScores[docIdx] ?? 0,
        matchedFields: [...fieldSet],
        matchKinds: [...kindSet],
        termMatches: details,
        previewText: record.previewText,
      };
    });

    return { query, hits, totalMatchedDocuments: touchedDocs.length, elapsedMs: nowMs() - startMs };
  }

  private incrementDocTermCount(
    map: Map<number, [number, number, number, number]>,
    termId: number,
    fieldIdx: number,
  ): void {
    let counts = map.get(termId);
    if (!counts) {
      counts = [0, 0, 0, 0];
      map.set(termId, counts);
    }
    counts[fieldIdx] = (counts[fieldIdx] ?? 0) + 1;
  }

  private getOrRegisterVocabularyTerm(term: string, isDerivedStem: boolean): number {
    const existing = this.exactTermMap.get(term);
    if (existing !== undefined) return existing;

    const termId = this.vocabulary.length;
    const decomp = decomposeHangulText(term);
    this.vocabulary.push({
      termId,
      term,
      isDerivedStem,
      choseong: decomp.choseong,
      jamo: decomp.jamo,
      postings: [],
      idf: 0,
    });
    this.exactTermMap.set(term, termId);

    const maxPref = Math.min(term.length - 1, this.maxPrefixLength);
    for (let len = 2; len <= maxPref; len++) {
      pushMapList(this.syllablePrefixMap, term.slice(0, len), termId);
    }

    if (decomp.choseong.length > 0) {
      pushMapList(this.choseongExactMap, decomp.choseong, termId);
      const maxChoPref = Math.min(decomp.choseong.length - 1, this.maxPrefixLength);
      for (let len = 1; len <= maxChoPref; len++) {
        pushMapList(this.choseongPrefixMap, decomp.choseong.slice(0, len), termId);
      }
      for (let start = 1; start < decomp.choseong.length; start++) {
        const maxSubLen = Math.min(decomp.choseong.length - start, this.maxChoseongSubstringLength);
        for (let len = 2; len <= maxSubLen; len++) {
          pushMapList(this.choseongSubstringMap, decomp.choseong.slice(start, start + len), termId);
        }
      }
    }

    if (decomp.jamo.length >= 3) {
      pushMapList(this.jamoExactMap, decomp.jamo, termId);
      for (let delIdx = 0; delIdx < decomp.jamo.length; delIdx++) {
        pushMapList(this.jamoDelete1Map, decomp.jamo.slice(0, delIdx) + decomp.jamo.slice(delIdx + 1), termId);
      }
    }
    return termId;
  }

  private registerCandidate(
    candidates: Map<number, ManuscriptMatchKind>,
    termId: number,
    kind: ManuscriptMatchKind,
  ): void {
    const prev = candidates.get(termId);
    if (!prev || MATCH_KIND_MULTIPLIER[kind] > MATCH_KIND_MULTIPLIER[prev]) {
      candidates.set(termId, kind);
    }
  }

  private collectCandidateVocabularyTerms(
    queryToken: string,
    allowFuzzy: boolean,
    allowChoseongSub: boolean,
  ): Map<number, ManuscriptMatchKind> {
    const candidates = new Map<number, ManuscriptMatchKind>();
    const decomp = decomposeHangulText(queryToken);

    if (decomp.isChoseongOnly) {
      const cho = decomp.choseong;
      for (const id of this.choseongExactMap.get(cho) ?? []) this.registerCandidate(candidates, id, "choseong-exact");
      for (const id of this.choseongPrefixMap.get(cho) ?? []) this.registerCandidate(candidates, id, "choseong-prefix");
      if (allowChoseongSub && cho.length >= 2) {
        for (const id of this.choseongSubstringMap.get(cho) ?? []) {
          this.registerCandidate(candidates, id, "choseong-substring");
        }
      }
      return candidates;
    }

    const exactId = this.exactTermMap.get(queryToken);
    if (exactId !== undefined) {
      this.registerCandidate(candidates, exactId, this.vocabulary[exactId]!.isDerivedStem ? "stem" : "exact");
    }

    const qStem = stripKoreanParticle(queryToken);
    if (qStem !== queryToken) {
      const stemId = this.exactTermMap.get(qStem);
      if (stemId !== undefined) this.registerCandidate(candidates, stemId, "stem");
    }

    if (qStem.length >= 2 && qStem.length <= this.maxPrefixLength) {
      for (const id of this.syllablePrefixMap.get(qStem) ?? []) {
        this.registerCandidate(candidates, id, "syllable-prefix");
      }
    }

    if (allowFuzzy) {
      const targetForms = qStem !== queryToken ? [queryToken, qStem] : [queryToken];
      for (const form of targetForms) {
        const qJamo = decomposeHangulText(form).jamo;
        if (qJamo.length < 3) continue;

        for (const id of this.jamoDelete1Map.get(qJamo) ?? []) {
          if (computeBoundedJamoDistance1(qJamo, this.vocabulary[id]!.jamo) === 1) {
            this.registerCandidate(candidates, id, "jamo-typo-1");
          }
        }

        for (let delIdx = 0; delIdx < qJamo.length; delIdx++) {
          const qDel = qJamo.slice(0, delIdx) + qJamo.slice(delIdx + 1);
          for (const id of this.jamoExactMap.get(qDel) ?? []) this.registerCandidate(candidates, id, "jamo-typo-1");
          for (const id of this.jamoDelete1Map.get(qDel) ?? []) {
            if (computeBoundedJamoDistance1(qJamo, this.vocabulary[id]!.jamo) === 1) {
              this.registerCandidate(candidates, id, "jamo-typo-1");
            }
          }
        }

        for (let swapIdx = 0; swapIdx + 1 < qJamo.length; swapIdx++) {
          if (qJamo.charCodeAt(swapIdx) === qJamo.charCodeAt(swapIdx + 1)) continue;
          const swapped = qJamo.slice(0, swapIdx) + qJamo[swapIdx + 1]! + qJamo[swapIdx]! + qJamo.slice(swapIdx + 2);
          for (const id of this.jamoExactMap.get(swapped) ?? []) {
            this.registerCandidate(candidates, id, "jamo-typo-1");
          }
        }
      }
    }

    return candidates;
  }

  private computePseudoTf(
    fieldTf: readonly [number, number, number, number],
    docFieldLengths: readonly [number, number, number, number],
  ): { pseudoTf: number; fieldsMask: number } {
    let pseudoTf = 0;
    let fieldsMask = 0;
    for (let f = 0; f < 4; f++) {
      const tf = fieldTf[f]!;
      if (tf <= 0) continue;
      fieldsMask |= 1 << f;
      const key = FIELD_KEYS[f]!;
      const cfg = this.fieldConfigs[key];
      const norm = 1 - cfg.lengthNormB + cfg.lengthNormB * (docFieldLengths[f]! / this.averageFieldLengths[key]);
      pseudoTf += cfg.weight * (tf / norm);
    }
    return { pseudoTf, fieldsMask };
  }
}
