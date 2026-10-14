/**
 * 사실 색인(콩코던스) 역추출 — 게시된 회차 본문·대사에서 인물·장소·사건·설정을
 * 역추출해 설정집(스토리 바이블 + 세계관 로어)과 대조한다.
 *
 * 근거 (ASOIAF 웨스테로스 콩코던스 — Miami 대학 기사, Elio García의 사례):
 * 방대한 연재 세계관은 작가의 기억만으로 지킬 수 없어, 출간된 본문 전체에서
 * 고유명사·사실을 색인으로 뽑아 두고 설정 대조를 전담하는 "제3의 확인자"가
 * 따로 맡는다. 이 모듈이 그 구조를 제품 규칙으로 옮긴 것이다.
 *
 * 원칙:
 * - 역추출은 결정적 표면 일치만 한다. 바이블·로어에 등록된 이름·별칭이 본문에
 *   실제로 등장한 자리만 언급(mention)으로 기록하고, 뜻을 지어내지 않는다.
 *   등록되지 않은 이름 후보는 인용 표지(「」·『』·"")로 묶인 문자열에서만 뽑는다
 *   — 형태소 추측으로 "정해진 적 없는 것"을 만들지 않기 위해서다.
 * - 대조 분류는 셋뿐이다: used(정해졌고 쓰임) / unregistered(본문에 나왔는데
 *   정해진 적 없음) / forgotten(정해졌는데 게시 본문에 한 번도 안 나옴).
 *   격리·폐기된 로어 항목은 정본이 아니므로 등록 용어로 세지 않는다.
 * - 일관성 체크는 제3 확인자 역할로 분리한다. 언급이 실린 회차의 작가는
 *   그 항목을 스스로 확인할 수 없다(recordFactCheck가 거부한다) — 추출한
 *   사람과 확인하는 사람을 나누는 콩코던스 전담자 구조다.
 * - 오류 수정 원칙: 신규 원고 쪽을 고친다. 원고 수정(FactFixRecord)의 대상은
 *   타입 수준에서 "manuscript" 하나로 고정돼 있고, 설정을 고쳐야 할 때는
 *   이 경로를 쓸 수 없다. 설정 변경은 reviseLoreEntryWithHistory 전용 경로로만
 *   하며, 변경 전·후 값과 버전을 수정 이력에 반드시 남긴다(조용한 설정 변경 금지).
 * - 이 모듈은 판정·기록만 한다. 본문·설정 저장은 호스트 몫이다.
 */
import type { StudioStoryBible } from "../studio-story-bible";
import {
  isLoreEntryRetired,
  upsertLoreEntry,
  type StudioLoreEntryKind,
  type StudioLoreEntryStatus,
  type StudioWorldLore,
} from "./studio-world-lore";

export type FactTermKind = "character" | "place" | "event" | "setting";

export const FACT_TERM_KIND_LABELS: Readonly<
  Record<FactTermKind, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  character: Object.freeze({ ko: "인물", en: "Character" }),
  place: Object.freeze({ ko: "장소", en: "Place" }),
  event: Object.freeze({ ko: "사건", en: "Event" }),
  setting: Object.freeze({ ko: "설정", en: "Setting" }),
});

/** 대조 분류 — 화면 배지의 단일 출처. */
export type FactConcordanceClassification = "used" | "unregistered" | "forgotten";

export const FACT_CLASSIFICATION_LABELS: Readonly<
  Record<
    FactConcordanceClassification,
    { readonly ko: string; readonly en: string; readonly hintKo: string }
  >
> = Object.freeze({
  used: Object.freeze({
    ko: "정해졌고 쓰임",
    en: "Defined & used",
    hintKo: "설정집에 있고 게시된 회차에도 등장해요.",
  }),
  unregistered: Object.freeze({
    ko: "정해진 적 없음",
    en: "Never defined",
    hintKo: "게시된 회차에 나왔는데 설정집에 없어요. 설정으로 등록하거나 원고에서 정리해 주세요.",
  }),
  forgotten: Object.freeze({
    ko: "정해졌는데 잊은 것",
    en: "Defined but forgotten",
    hintKo: "설정집에는 있는데 게시된 회차에 한 번도 나오지 않았어요. 잊힌 설정인지, 아직 등장 전인지 확인해 주세요.",
  }),
});

/** 색인의 용어 1건 — 바이블·로어에서 어댑터가 만든다. */
export interface FactTerm {
  readonly id: string;
  readonly kind: FactTermKind;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly source: "bible-character" | "bible-location" | "bible-fact" | "lore";
  /** 로어 출처일 때만 — 상태·버전을 대조 표시에 함께 보인다. */
  readonly loreStatus: StudioLoreEntryStatus | null;
  readonly loreVersion: number | null;
}

export function factTermsFromBible(bible: StudioStoryBible): readonly FactTerm[] {
  const terms: FactTerm[] = [];
  for (const character of bible.characters) {
    terms.push(
      Object.freeze({
        id: character.id,
        kind: "character",
        name: character.name,
        aliases: Object.freeze([...character.aliases]),
        source: "bible-character",
        loreStatus: null,
        loreVersion: null,
      }),
    );
  }
  for (const location of bible.locations) {
    terms.push(
      Object.freeze({
        id: location.id,
        kind: "place",
        name: location.name,
        aliases: Object.freeze([]),
        source: "bible-location",
        loreStatus: null,
        loreVersion: null,
      }),
    );
  }
  for (const fact of bible.facts) {
    terms.push(
      Object.freeze({
        id: fact.id,
        kind: "setting",
        name: fact.label,
        aliases: Object.freeze([]),
        source: "bible-fact",
        loreStatus: null,
        loreVersion: null,
      }),
    );
  }
  return Object.freeze(terms);
}

const LORE_KIND_TO_FACT_KIND: Readonly<Record<StudioLoreEntryKind, FactTermKind>> =
  Object.freeze({
    place: "place",
    event: "event",
    faction: "setting",
    species: "setting",
    artifact: "setting",
    rule: "setting",
  });

/** 격리·폐기 항목은 정본이 아니므로 등록 용어에서 제외한다(Legends 이름 재사용과 같은 규율). */
export function factTermsFromLore(lore: StudioWorldLore): readonly FactTerm[] {
  return Object.freeze(
    lore.entries
      .filter((entry) => !isLoreEntryRetired(entry))
      .map((entry) =>
        Object.freeze({
          id: entry.id,
          kind: LORE_KIND_TO_FACT_KIND[entry.kind],
          name: entry.name,
          aliases: Object.freeze([...entry.aliases]),
          source: "lore" as const,
          loreStatus: entry.status,
          loreVersion: entry.version,
        }),
      ),
  );
}

/** 게시된 회차 본문의 한 조각 — 지문(narration) 또는 대사(dialogue). */
export interface PublishedFactSegment {
  readonly id: string;
  readonly kind: "narration" | "dialogue";
  /** 대사의 화자 캐릭터 id. 모르면 null — 화자를 지어내지 않는다. */
  readonly speakerId: string | null;
  readonly text: string;
}

export interface PublishedFactEpisode {
  readonly id: string;
  readonly label: string;
  /** 회차 순서 — 작을수록 먼저 게시됐다. */
  readonly order: number;
  /** 이 회차 원고의 작성자 id — 제3 확인자 분리 판정에 쓴다. */
  readonly authorId: string;
  readonly segments: readonly PublishedFactSegment[];
}

export interface FactMention {
  readonly id: string;
  /** 본문에 실제로 등장한 표면 문자열. */
  readonly surface: string;
  /** 등록 용어 id. 미등록 후보면 null. */
  readonly termId: string | null;
  readonly episodeId: string;
  readonly segmentId: string;
  readonly segmentKind: PublishedFactSegment["kind"];
  readonly speakerId: string | null;
  readonly offset: number;
  /** 언급 앞뒤를 자른 발췌 — 확인자가 맥락을 읽는 단위. */
  readonly excerpt: string;
}

export interface FactConcordanceEntry {
  /** 등록 용어는 termId, 미등록 후보는 `unregistered:<정규화 이름>`. */
  readonly key: string;
  readonly termId: string | null;
  readonly displayName: string;
  readonly kind: FactTermKind | null;
  readonly classification: FactConcordanceClassification;
  readonly mentions: readonly FactMention[];
  readonly firstEpisodeId: string | null;
  readonly lastEpisodeId: string | null;
  readonly episodeCount: number;
  readonly loreStatus: StudioLoreEntryStatus | null;
  readonly loreVersion: number | null;
}

export interface FactConcordanceDigest {
  readonly totalEntries: number;
  readonly usedCount: number;
  readonly unregisteredCount: number;
  readonly forgottenCount: number;
  readonly mentionCount: number;
  readonly unregisteredNames: readonly string[];
  readonly forgottenNames: readonly string[];
}

export interface FactConcordance {
  readonly entries: readonly FactConcordanceEntry[];
  readonly mentions: readonly FactMention[];
  readonly digest: FactConcordanceDigest;
}

function normalizeSurface(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function excerptAround(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - 18);
  const end = Math.min(text.length, offset + length + 18);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end)}${suffix}`;
}

const CANDIDATE_PATTERN = /「([^」]{1,40})」|『([^』]{1,40})』|"([^"]{1,40})"/g;

/**
 * 색인을 만든다 — 순수 함수. 회차는 order 오름차순으로 정렬해 판정하고,
 * 같은 자리에서 겹치는 표면은 긴 쪽이 이긴다(별칭보다 본명이 먼저 잡히지 않게).
 */
export function buildFactConcordance(
  episodes: readonly PublishedFactEpisode[],
  terms: readonly FactTerm[],
): FactConcordance {
  const surfaces: { surface: string; normalized: string; term: FactTerm }[] = [];
  for (const term of terms) {
    for (const surface of [term.name, ...term.aliases]) {
      const trimmed = surface.trim();
      if (trimmed.length < 2) continue;
      surfaces.push({ surface: trimmed, normalized: normalizeSurface(trimmed), term });
    }
  }
  surfaces.sort((a, b) => b.surface.length - a.surface.length);
  const knownNormalized = new Set(surfaces.map((item) => item.normalized));

  const orderedEpisodes = [...episodes].sort((a, b) => a.order - b.order);
  const mentions: FactMention[] = [];
  const pushMention = (
    episode: PublishedFactEpisode,
    segment: PublishedFactSegment,
    surface: string,
    termId: string | null,
    offset: number,
  ) => {
    mentions.push(
      Object.freeze({
        id: `${episode.id}:${segment.id}:${offset}:${surface}`,
        surface,
        termId,
        episodeId: episode.id,
        segmentId: segment.id,
        segmentKind: segment.kind,
        speakerId: segment.speakerId,
        offset,
        excerpt: excerptAround(segment.text, offset, surface.length),
      }),
    );
  };

  for (const episode of orderedEpisodes) {
    for (const segment of episode.segments) {
      const text = segment.text;
      const claimed: [number, number][] = [];
      const overlaps = (start: number, end: number) =>
        claimed.some(([s, e]) => start < e && end > s);
      for (const { surface, term } of surfaces) {
        let from = 0;
        for (;;) {
          const at = text.indexOf(surface, from);
          if (at < 0) break;
          if (!overlaps(at, at + surface.length)) {
            claimed.push([at, at + surface.length]);
            pushMention(episode, segment, surface, term.id, at);
          }
          from = at + surface.length;
        }
      }
      // 미등록 후보 — 인용 표지로 묶인 문자열만. 등록 표면과 겹치면 후보가 아니다.
      for (const match of text.matchAll(CANDIDATE_PATTERN)) {
        const inner = (match[1] ?? match[2] ?? match[3] ?? "").trim();
        if (inner.length < 2) continue;
        if (knownNormalized.has(normalizeSurface(inner))) continue;
        const at = match.index + match[0].indexOf(inner);
        if (overlaps(at, at + inner.length)) continue;
        claimed.push([at, at + inner.length]);
        pushMention(episode, segment, inner, null, at);
      }
    }
  }
  mentions.sort((a, b) =>
    a.episodeId === b.episodeId
      ? a.segmentId === b.segmentId
        ? a.offset - b.offset
        : a.segmentId.localeCompare(b.segmentId)
      : a.episodeId.localeCompare(b.episodeId),
  );

  const episodeOrderById = new Map(orderedEpisodes.map((ep) => [ep.id, ep.order]));
  const mentionsByTerm = new Map<string, FactMention[]>();
  const mentionsByCandidate = new Map<string, FactMention[]>();
  for (const mention of mentions) {
    const bucket = mention.termId ? mentionsByTerm : mentionsByCandidate;
    const key = mention.termId ?? normalizeSurface(mention.surface);
    const list = bucket.get(key) ?? [];
    list.push(mention);
    bucket.set(key, list);
  }
  const byEpisodeOrder = (list: readonly FactMention[]) =>
    [...list].sort(
      (a, b) =>
        (episodeOrderById.get(a.episodeId) ?? 0) - (episodeOrderById.get(b.episodeId) ?? 0)
        || a.offset - b.offset,
    );

  const entries: FactConcordanceEntry[] = [];
  for (const term of terms) {
    const list = byEpisodeOrder(mentionsByTerm.get(term.id) ?? []);
    entries.push(
      Object.freeze({
        key: term.id,
        termId: term.id,
        displayName: term.name,
        kind: term.kind,
        classification: list.length > 0 ? "used" : "forgotten",
        mentions: Object.freeze(list),
        firstEpisodeId: list[0]?.episodeId ?? null,
        lastEpisodeId: list[list.length - 1]?.episodeId ?? null,
        episodeCount: new Set(list.map((m) => m.episodeId)).size,
        loreStatus: term.loreStatus,
        loreVersion: term.loreVersion,
      }),
    );
  }
  for (const [normalized, list] of [...mentionsByCandidate.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const sorted = byEpisodeOrder(list);
    entries.push(
      Object.freeze({
        key: `unregistered:${normalized}`,
        termId: null,
        displayName: sorted[0]!.surface,
        kind: null,
        classification: "unregistered",
        mentions: Object.freeze(sorted),
        firstEpisodeId: sorted[0]?.episodeId ?? null,
        lastEpisodeId: sorted[sorted.length - 1]?.episodeId ?? null,
        episodeCount: new Set(sorted.map((m) => m.episodeId)).size,
        loreStatus: null,
        loreVersion: null,
      }),
    );
  }

  const digest: FactConcordanceDigest = Object.freeze({
    totalEntries: entries.length,
    usedCount: entries.filter((e) => e.classification === "used").length,
    unregisteredCount: entries.filter((e) => e.classification === "unregistered").length,
    forgottenCount: entries.filter((e) => e.classification === "forgotten").length,
    mentionCount: mentions.length,
    unregisteredNames: Object.freeze(
      entries.filter((e) => e.classification === "unregistered").map((e) => e.displayName),
    ),
    forgottenNames: Object.freeze(
      entries.filter((e) => e.classification === "forgotten").map((e) => e.displayName),
    ),
  });
  return Object.freeze({
    entries: Object.freeze(entries),
    mentions: Object.freeze(mentions),
    digest,
  });
}

/* ------------------------------------------------------------------ */
/* 제3 확인자 — 추출·작성과 분리된 일관성 체크 기록                     */
/* ------------------------------------------------------------------ */

export type FactCheckVerdict = "ok" | "mismatch" | "needs-definition";

export const FACT_CHECK_VERDICT_LABELS: Readonly<Record<FactCheckVerdict, string>> =
  Object.freeze({
    ok: "본문과 설정이 맞아요",
    mismatch: "본문과 설정이 달라요 — 원고 쪽을 고쳐 주세요",
    "needs-definition": "설정 등록이 필요해요",
  });

export interface FactCheckRecord {
  readonly id: string;
  readonly entryKey: string;
  /** 확인자 id — 언급이 실린 회차의 작성자일 수 없다. */
  readonly checkerId: string;
  readonly verdict: FactCheckVerdict;
  readonly note: string;
  readonly checkedAt: string;
}

/**
 * 제3 확인자 판정 가능 여부. 확인자가 비었거나, 그 항목의 언급이 실린 회차 중
 * 하나라도 확인자 본인이 쓴 회차면 자기 확인이라 거부한다.
 */
export function factCheckRejectionReason(
  concordance: FactConcordance,
  episodes: readonly PublishedFactEpisode[],
  entryKey: string,
  checkerId: string,
): string | null {
  if (!checkerId.trim()) return "확인자가 지정되지 않았어요.";
  const entry = concordance.entries.find((candidate) => candidate.key === entryKey);
  if (!entry) return "색인에 없는 항목이에요.";
  const authorIds = new Set(
    episodes
      .filter((episode) =>
        entry.mentions.some((mention) => mention.episodeId === episode.id),
      )
      .map((episode) => episode.authorId),
  );
  if (authorIds.has(checkerId)) {
    return "이 항목이 실린 회차를 쓴 사람은 스스로 확인할 수 없어요. 다른 확인자가 맡아 주세요.";
  }
  return null;
}

export function recordFactCheck(
  records: readonly FactCheckRecord[],
  concordance: FactConcordance,
  episodes: readonly PublishedFactEpisode[],
  input: {
    readonly id: string;
    readonly entryKey: string;
    readonly checkerId: string;
    readonly verdict: FactCheckVerdict;
    readonly note: string;
    readonly checkedAt: string;
  },
): { readonly records: readonly FactCheckRecord[]; readonly error: string | null } {
  const error = factCheckRejectionReason(
    concordance,
    episodes,
    input.entryKey,
    input.checkerId,
  );
  if (error) return { records, error };
  const record: FactCheckRecord = Object.freeze({ ...input, note: input.note.trim() });
  return { records: Object.freeze([...records, record]), error: null };
}

/* ------------------------------------------------------------------ */
/* 수정 원칙 — 원고 쪽 수정 + 설정 수정 이력                            */
/* ------------------------------------------------------------------ */

/** 원고 수정 기록. 대상은 타입 수준에서 원고 하나로만 고정돼 있다. */
export interface FactFixRecord {
  readonly id: string;
  readonly entryKey: string;
  readonly target: "manuscript";
  readonly episodeId: string;
  readonly segmentId: string;
  readonly before: string;
  readonly after: string;
  readonly reason: string;
  readonly actorId: string;
  readonly at: string;
}

export function proposeManuscriptFix(
  records: readonly FactFixRecord[],
  input: Omit<FactFixRecord, "target"> & { readonly target?: string },
): { readonly records: readonly FactFixRecord[]; readonly error: string | null } {
  if (input.target !== undefined && input.target !== "manuscript") {
    return {
      records,
      error:
        "오류 수정은 신규 원고 쪽을 고치는 것이 원칙이에요. 설정을 바꾸려면 설정 수정 이력 경로를 써 주세요.",
    };
  }
  if (!input.after.trim() || input.after.trim() === input.before.trim()) {
    return { records, error: "고친 원고 내용이 비어 있거나 전과 같아요." };
  }
  const record: FactFixRecord = Object.freeze({
    ...input,
    target: "manuscript",
    after: input.after.trim(),
    reason: input.reason.trim(),
  });
  return { records: Object.freeze([...records, record]), error: null };
}

/** 설정 수정 이력 1건 — 필드 단위로 전·후 값과 버전을 남긴다. */
export interface LoreRevisionRecord {
  readonly id: string;
  readonly entryId: string;
  readonly entryName: string;
  readonly field: "summary" | "details";
  readonly before: string;
  readonly after: string;
  readonly beforeVersion: number;
  readonly afterVersion: number;
  readonly reason: string;
  readonly actorId: string;
  readonly at: string;
}

/**
 * 설정을 고치는 유일한 경로. 버전을 1 올리고, 바뀐 필드마다 이력 레코드를
 * append한다. 바뀐 내용이 없으면 원본 그대로 돌려주고 이력도 남기지 않는다.
 */
export function reviseLoreEntryWithHistory(
  lore: StudioWorldLore,
  history: readonly LoreRevisionRecord[],
  input: {
    readonly entryId: string;
    readonly summary?: string;
    readonly details?: string;
    readonly reason: string;
    readonly actorId: string;
    readonly at: string;
    readonly idPrefix: string;
  },
): {
  readonly lore: StudioWorldLore;
  readonly history: readonly LoreRevisionRecord[];
  readonly revisions: readonly LoreRevisionRecord[];
  readonly error: string | null;
} {
  const target = lore.entries.find((entry) => entry.id === input.entryId);
  if (!target) return { lore, history, revisions: Object.freeze([]), error: "설정 항목을 찾지 못했어요." };
  if (!input.reason.trim()) {
    return { lore, history, revisions: Object.freeze([]), error: "설정을 왜 고치는지 이유를 남겨 주세요." };
  }
  const nextVersion = target.version + 1;
  const revisions: LoreRevisionRecord[] = [];
  const changed: { summary?: string; details?: string } = {};
  for (const field of ["summary", "details"] as const) {
    const after = input[field];
    if (after === undefined || after.trim() === target[field]) continue;
    changed[field] = after.trim();
    revisions.push(
      Object.freeze({
        id: `${input.idPrefix}:${field}`,
        entryId: target.id,
        entryName: target.name,
        field,
        before: target[field],
        after: after.trim(),
        beforeVersion: target.version,
        afterVersion: nextVersion,
        reason: input.reason.trim(),
        actorId: input.actorId,
        at: input.at,
      }),
    );
  }
  if (revisions.length === 0) {
    return { lore, history, revisions: Object.freeze([]), error: "바뀐 설정 내용이 없어요." };
  }
  const nextLore = upsertLoreEntry(
    lore,
    Object.freeze({ ...target, ...changed, version: nextVersion }),
  );
  return {
    lore: nextLore,
    history: Object.freeze([...history, ...revisions]),
    revisions: Object.freeze(revisions),
    error: null,
  };
}

/* ------------------------------------------------------------------ */
/* 부수 데이터 저장 — 확인·수정·이력 (색인 자체는 본문에서 다시 도출)     */
/* ------------------------------------------------------------------ */

export interface FactConcordanceSideData {
  readonly checks: readonly FactCheckRecord[];
  readonly fixes: readonly FactFixRecord[];
  readonly loreRevisions: readonly LoreRevisionRecord[];
}

export const EMPTY_FACT_CONCORDANCE_SIDE_DATA: FactConcordanceSideData = Object.freeze({
  checks: Object.freeze([]),
  fixes: Object.freeze([]),
  loreRevisions: Object.freeze([]),
});

export function factConcordanceStorageKey(projectId: string): string {
  return `toonstudio:fact-concordance:v1:${projectId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

export function parseFactConcordanceSideData(raw: string | null): FactConcordanceSideData {
  if (!raw) return EMPTY_FACT_CONCORDANCE_SIDE_DATA;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_FACT_CONCORDANCE_SIDE_DATA;
  }
  if (!isRecord(parsed)) return EMPTY_FACT_CONCORDANCE_SIDE_DATA;
  const checks: FactCheckRecord[] = [];
  if (Array.isArray(parsed.checks)) {
    for (const item of parsed.checks) {
      if (!isRecord(item)) continue;
      const id = stringField(item, "id");
      const entryKey = stringField(item, "entryKey");
      const checkerId = stringField(item, "checkerId");
      const verdict = stringField(item, "verdict");
      const note = stringField(item, "note");
      const checkedAt = stringField(item, "checkedAt");
      if (!id || !entryKey || !checkerId || note === null || !checkedAt) continue;
      if (verdict !== "ok" && verdict !== "mismatch" && verdict !== "needs-definition") continue;
      checks.push(Object.freeze({ id, entryKey, checkerId, verdict, note, checkedAt }));
    }
  }
  const fixes: FactFixRecord[] = [];
  if (Array.isArray(parsed.fixes)) {
    for (const item of parsed.fixes) {
      if (!isRecord(item)) continue;
      const id = stringField(item, "id");
      const entryKey = stringField(item, "entryKey");
      const episodeId = stringField(item, "episodeId");
      const segmentId = stringField(item, "segmentId");
      const before = stringField(item, "before");
      const after = stringField(item, "after");
      const reason = stringField(item, "reason");
      const actorId = stringField(item, "actorId");
      const at = stringField(item, "at");
      if (!id || !entryKey || !episodeId || !segmentId || before === null || !after || !actorId || !at) continue;
      fixes.push(
        Object.freeze({
          id, entryKey, target: "manuscript" as const,
          episodeId, segmentId, before, after, reason: reason ?? "", actorId, at,
        }),
      );
    }
  }
  const loreRevisions: LoreRevisionRecord[] = [];
  if (Array.isArray(parsed.loreRevisions)) {
    for (const item of parsed.loreRevisions) {
      if (!isRecord(item)) continue;
      const id = stringField(item, "id");
      const entryId = stringField(item, "entryId");
      const entryName = stringField(item, "entryName");
      const field = stringField(item, "field");
      const before = stringField(item, "before");
      const after = stringField(item, "after");
      const reason = stringField(item, "reason");
      const actorId = stringField(item, "actorId");
      const at = stringField(item, "at");
      const beforeVersion = item.beforeVersion;
      const afterVersion = item.afterVersion;
      if (!id || !entryId || !entryName || before === null || !after || !actorId || !at) continue;
      if (field !== "summary" && field !== "details") continue;
      if (typeof beforeVersion !== "number" || typeof afterVersion !== "number") continue;
      loreRevisions.push(
        Object.freeze({
          id, entryId, entryName, field, before, after,
          beforeVersion, afterVersion, reason: reason ?? "", actorId, at,
        }),
      );
    }
  }
  return Object.freeze({
    checks: Object.freeze(checks),
    fixes: Object.freeze(fixes),
    loreRevisions: Object.freeze(loreRevisions),
  });
}

export function loadFactConcordanceSideData(projectId: string): FactConcordanceSideData {
  try {
    return parseFactConcordanceSideData(
      globalThis.localStorage?.getItem(factConcordanceStorageKey(projectId)) ?? null,
    );
  } catch {
    return EMPTY_FACT_CONCORDANCE_SIDE_DATA;
  }
}

export function saveFactConcordanceSideData(
  projectId: string,
  data: FactConcordanceSideData,
): void {
  try {
    globalThis.localStorage?.setItem(
      factConcordanceStorageKey(projectId),
      JSON.stringify(data),
    );
    globalThis.dispatchEvent?.(
      new CustomEvent("toonstudio:fact-concordance-updated", {
        detail: { projectId },
      }),
    );
  } catch {
    // 저장 실패는 색인 도출을 막지 않는다 — 확인·수정 기록만 세션에 남는다.
  }
}
