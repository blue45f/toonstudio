/**
 * 스토리 바이블 교차참조 모델.
 *
 * 근거: competitor-benchmark-expansion REPORT G1 — Campfire Encyclopedia의 항목 간
 * 상호참조, World Anvil 멘션 시스템(쓰는 중 자동 링크 + 없는 항목 즉석 생성).
 * 우리 바이블(캐릭터 시트·프로덕션 바이블·약속/회수 원장)은 항목이 서로 닿지 않아
 * "이 장소가 어디서 쓰였는지"를 사람이 기억으로만 추적했다. 이 모델은 그 연결을
 * 본문 실측으로 도출한다: 등록된 이름·별칭이 다른 문서 본문에 등장하면 링크로,
 * 항목마다 백링크(언급된 문서 목록)를 만들고, 자주 나오는데 등록되지 않은 이름은
 * 미등록 후보로 모아 원클릭 시트 초안으로 잇는다.
 *
 * 순수 모델: DOM·저장소에 의존하지 않는다. 입력은 호스트가 각 바이블 표면에서
 * 어댑트한다(StudioProductionBiblePanel 배선 참조).
 */

export type StoryBibleEntityKind =
  | "character"
  | "location"
  | "prop"
  | "scene"
  | "term";

export interface StoryBibleEntity {
  readonly id: string;
  readonly kind: StoryBibleEntityKind;
  readonly name: string;
  readonly aliases: readonly string[];
}

export interface StoryBibleDocument {
  readonly id: string;
  readonly title: string;
  /** 문서 종류 표기 (예: "바이블 항목", "약속·회수", "회차 기획"). */
  readonly kindLabel: string;
  readonly body: string;
  /** 이 문서가 특정 항목의 본문이면 그 항목 id. 자기 언급 제외에 쓴다. */
  readonly ownerEntityId?: string | null;
}

export interface StoryMention {
  readonly entityId: string;
  readonly documentId: string;
  /** body 기준 문자 오프셋 (UTF-16 인덱스). */
  readonly start: number;
  readonly end: number;
  readonly matchedText: string;
  /** 이름 자체로 맞았으면 true, 별칭으로 맞았으면 false. */
  readonly viaName: boolean;
}

export interface StoryBacklink {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly count: number;
}

export interface StoryEntityLinkSummary {
  readonly entityId: string;
  readonly mentionCount: number;
  readonly backlinks: readonly StoryBacklink[];
}

export interface StoryDocumentLinkSummary {
  readonly documentId: string;
  readonly mentions: readonly StoryMention[];
}

export interface StoryUnregisteredCandidate {
  /** 조사(助詞)를 벗긴 정규화 이름. */
  readonly term: string;
  readonly count: number;
  readonly documentIds: readonly string[];
  readonly sampleDocumentId: string;
  readonly sampleStart: number;
}

export interface StoryCrosslinkIndex {
  readonly mentions: readonly StoryMention[];
  readonly entityLinks: readonly StoryEntityLinkSummary[];
  readonly documentLinks: readonly StoryDocumentLinkSummary[];
  readonly candidates: readonly StoryUnregisteredCandidate[];
}

export interface StoryCrosslinkOptions {
  /** 미등록 후보로 올릴 최소 등장 횟수. 기본 3. */
  readonly candidateMinCount?: number;
  /** 미등록 후보 최대 개수. 기본 12. */
  readonly candidateLimit?: number;
}

const DEFAULT_CANDIDATE_MIN_COUNT = 3;
const DEFAULT_CANDIDATE_LIMIT = 12;

/** 후보 집계에서 빼는 한국어 기능어·일반어 최소 집합 (고유명사 후보 오염 방지). */
const CANDIDATE_STOPWORDS: ReadonlySet<string> = new Set([
  "그리고", "하지만", "그러나", "때문", "이것", "그것", "저것", "여기", "저기",
  "누구", "무엇", "어디", "언제", "어떻게", "있다", "없다", "한다", "된다",
  "같은", "위해", "통해", "대해", "이후", "이전", "사이", "가장", "다시",
  "지금", "오늘", "내일", "어제", "장면", "회차", "캐릭터", "이야기", "사람",
  "경우", "정도", "부분", "생각", "느낌", "모습", "표정", "순간", "시간",
]);

/** 후보 이름 끝의 조사를 한 번만 벗긴다 (예: "하늘이" → "하늘"). */
const TRAILING_PARTICLES: readonly string[] = [
  "에서", "으로", "에게", "부터", "까지", "처럼", "보다", "은", "는", "이",
  "가", "을", "를", "의", "에", "도", "만", "와", "과", "로", "랑",
];

interface MatchPattern {
  readonly text: string;
  readonly entityId: string;
  readonly entityIndex: number;
  readonly viaName: boolean;
}

function normalizeEntity(raw: StoryBibleEntity): StoryBibleEntity | null {
  const name = raw.name.trim();
  if (!raw.id || !name) return null;
  const seen = new Set<string>([name]);
  const aliases: string[] = [];
  for (const alias of raw.aliases) {
    const trimmed = alias.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    aliases.push(trimmed);
  }
  return { id: raw.id, kind: raw.kind, name, aliases };
}

/**
 * 이름·별칭 패턴 목록. 매칭 우선순위는 (긴 패턴 → 이름 먼저 → 입력 순서)이며
 * 결정적이다 — 같은 입력은 항상 같은 링크를 만든다.
 * 1글자 패턴은 오탐이 많아 제외한다(이름이 1글자뿐이면 그 항목은 링크 대상에서 빠진다).
 */
function buildPatterns(entities: readonly StoryBibleEntity[]): MatchPattern[] {
  const patterns: MatchPattern[] = [];
  entities.forEach((entity, entityIndex) => {
    if (entity.name.length >= 2) {
      patterns.push({ text: entity.name, entityId: entity.id, entityIndex, viaName: true });
    }
    for (const alias of entity.aliases) {
      if (alias.length >= 2) {
        patterns.push({ text: alias, entityId: entity.id, entityIndex, viaName: false });
      }
    }
  });
  patterns.sort((a, b) =>
    b.text.length - a.text.length
    || Number(b.viaName) - Number(a.viaName)
    || a.entityIndex - b.entityIndex
    || a.text.localeCompare(b.text),
  );
  return patterns;
}

/** 한 문서에서 언급을 찾는다. 겹침은 탐욕적으로 긴 매치부터 확정한다. */
export function findStoryMentions(
  document: StoryBibleDocument,
  patterns: readonly MatchPattern[],
): StoryMention[] {
  const body = document.body;
  if (!body || patterns.length === 0) return [];
  // 자기 문서에서 자기 이름 구간은 통째로 건너뛴다 — "김하늘기" 문서 안에서
  // 앞부분 "김하늘"이 다른 항목의 언급으로 잘못 잡히는 것을 막는다.
  const ownerPatterns = document.ownerEntityId
    ? patterns.filter((pattern) => pattern.entityId === document.ownerEntityId)
    : [];
  const mentions: StoryMention[] = [];
  let index = 0;
  while (index < body.length) {
    const ownerHit = ownerPatterns.find((pattern) => body.startsWith(pattern.text, index));
    if (ownerHit) {
      index += ownerHit.text.length;
      continue;
    }
    let matched: MatchPattern | null = null;
    for (const pattern of patterns) {
      if (pattern.entityId === document.ownerEntityId) continue;
      if (body.startsWith(pattern.text, index)) {
        matched = pattern;
        break;
      }
    }
    if (matched) {
      mentions.push({
        entityId: matched.entityId,
        documentId: document.id,
        start: index,
        end: index + matched.text.length,
        matchedText: matched.text,
        viaName: matched.viaName,
      });
      index += matched.text.length;
    } else {
      index += 1;
    }
  }
  return mentions;
}

function stripTrailingParticle(token: string): string {
  for (const particle of TRAILING_PARTICLES) {
    if (token.length - particle.length >= 2 && token.endsWith(particle)) {
      return token.slice(0, token.length - particle.length);
    }
  }
  return token;
}

function collectCandidates(
  documents: readonly StoryBibleDocument[],
  entities: readonly StoryBibleEntity[],
  mentions: readonly StoryMention[],
  options: StoryCrosslinkOptions,
): StoryUnregisteredCandidate[] {
  const minCount = options.candidateMinCount ?? DEFAULT_CANDIDATE_MIN_COUNT;
  const limit = options.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
  const registered = new Set<string>();
  for (const entity of entities) {
    registered.add(entity.name);
    registered.add(stripTrailingParticle(entity.name));
    for (const alias of entity.aliases) {
      registered.add(alias);
      registered.add(stripTrailingParticle(alias));
    }
  }
  const mentionSpansByDocument = new Map<string, readonly StoryMention[]>();
  for (const mention of mentions) {
    const list = mentionSpansByDocument.get(mention.documentId) ?? [];
    mentionSpansByDocument.set(mention.documentId, [...list, mention]);
  }

  interface Accumulator {
    count: number;
    documentIds: Set<string>;
    sampleDocumentId: string;
    sampleStart: number;
  }
  const counts = new Map<string, Accumulator>();
  const tokenPattern = /[0-9A-Za-z가-힣]+/g;
  for (const document of documents) {
    const spans = mentionSpansByDocument.get(document.id) ?? [];
    const inMention = (start: number, end: number) =>
      spans.some((span) => start < span.end && end > span.start);
    for (const match of document.body.matchAll(tokenPattern)) {
      const raw = match[0];
      const start = match.index ?? 0;
      if (raw.length < 2 || inMention(start, start + raw.length)) continue;
      const term = stripTrailingParticle(raw);
      if (term.length < 2 || registered.has(term) || CANDIDATE_STOPWORDS.has(term)) continue;
      const acc = counts.get(term) ?? {
        count: 0,
        documentIds: new Set<string>(),
        sampleDocumentId: document.id,
        sampleStart: start,
      };
      acc.count += 1;
      acc.documentIds.add(document.id);
      counts.set(term, acc);
    }
  }
  return [...counts.entries()]
    .filter(([, acc]) => acc.count >= minCount)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([term, acc]) => ({
      term,
      count: acc.count,
      documentIds: [...acc.documentIds],
      sampleDocumentId: acc.sampleDocumentId,
      sampleStart: acc.sampleStart,
    }));
}

/** 바이블 전체의 교차참조 인덱스를 만든다. */
export function buildStoryCrosslinkIndex(
  rawEntities: readonly StoryBibleEntity[],
  documents: readonly StoryBibleDocument[],
  options: StoryCrosslinkOptions = {},
): StoryCrosslinkIndex {
  const entities: StoryBibleEntity[] = [];
  const seenIds = new Set<string>();
  for (const raw of rawEntities) {
    const normalized = normalizeEntity(raw);
    if (!normalized || seenIds.has(normalized.id)) continue;
    seenIds.add(normalized.id);
    entities.push(normalized);
  }
  const patterns = buildPatterns(entities);

  const mentions: StoryMention[] = [];
  const documentLinks: StoryDocumentLinkSummary[] = [];
  const backlinkAcc = new Map<string, Map<string, StoryBacklink & { count: number }>>();
  for (const entity of entities) backlinkAcc.set(entity.id, new Map());

  for (const document of documents) {
    const found = findStoryMentions(document, patterns);
    documentLinks.push({ documentId: document.id, mentions: found });
    mentions.push(...found);
    for (const mention of found) {
      const perEntity = backlinkAcc.get(mention.entityId);
      if (!perEntity) continue;
      const existing = perEntity.get(document.id);
      if (existing) {
        existing.count += 1;
      } else {
        perEntity.set(document.id, {
          documentId: document.id,
          documentTitle: document.title,
          count: 1,
        });
      }
    }
  }

  const entityLinks: StoryEntityLinkSummary[] = entities.map((entity) => {
    const backlinks = [...(backlinkAcc.get(entity.id)?.values() ?? [])]
      .sort((a, b) => b.count - a.count || a.documentTitle.localeCompare(b.documentTitle));
    return {
      entityId: entity.id,
      mentionCount: backlinks.reduce((sum, link) => sum + link.count, 0),
      backlinks,
    };
  });

  return {
    mentions,
    entityLinks,
    documentLinks,
    candidates: collectCandidates(documents, entities, mentions, options),
  };
}

/** 문서 본문을 언급 구간 기준으로 나눠 하이라이트 렌더에 쓴다. */
export interface StoryTextSegment {
  readonly text: string;
  readonly entityId: string | null;
}

export function splitDocumentByMentions(
  body: string,
  mentions: readonly StoryMention[],
): StoryTextSegment[] {
  if (mentions.length === 0) return body ? [{ text: body, entityId: null }] : [];
  const sorted = [...mentions].sort((a, b) => a.start - b.start);
  const segments: StoryTextSegment[] = [];
  let cursor = 0;
  for (const mention of sorted) {
    if (mention.start < cursor) continue;
    if (mention.start > cursor) {
      segments.push({ text: body.slice(cursor, mention.start), entityId: null });
    }
    segments.push({
      text: body.slice(mention.start, mention.end),
      entityId: mention.entityId,
    });
    cursor = mention.end;
  }
  if (cursor < body.length) {
    segments.push({ text: body.slice(cursor), entityId: null });
  }
  return segments;
}

/** 미등록 후보에서 새 항목 초안을 만든다 (호스트가 종류를 정해 저장한다). */
export function createStoryEntityDraft(
  candidate: StoryUnregisteredCandidate,
  id: string,
  kind: StoryBibleEntityKind,
): StoryBibleEntity {
  return { id, kind, name: candidate.term, aliases: [] };
}
