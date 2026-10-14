/**
 * 바이블 용도 분리 모델 — 세계관 문서를 처음부터 용도별로 나눈다.
 *
 * 왜 분리인가 (현재 상태 실측, 2026-10-14, main 기준):
 * - studio-story-bible.ts(StudioStoryBible)는 characters·locations·facts만 가진
 *   연속성 검사용 구조다. 피치 문장도, 시즌 아크도 들어갈 자리가 없다.
 * - studio-character-bible.ts / studio-production-bible.ts는 캐릭터·장면/장소/소품
 *   명부일 뿐, "이 작품을 소개하는 문서"와 "시즌을 개발하는 문서"가 한 덩어리로
 *   섞이면 읽는 사람(외부 소개 대상·작가실·검수자)마다 필요 없는 정보를 함께 본다.
 * - 근거: Macdonald, "Tablets of Stone: TV series bibles", Journal of
 *   Screenwriting 9(1) 2018 — 시리즈 바이블은 단일 문서가 아니라 목적이 다른
 *   문서들의 묶음이며, 피치 바이블(판매·소개)과 제작 바이블(연재 운영)은
 *   독자·갱신 주기·담는 정보가 다르다. LA Film School "The Series Bible" —
 *   피치용에는 로그라인·시놉시스·톤이, 시즌 개발용에는 캐릭터 아크와
 *   회차 구성이 표준 구성 요소로 들어간다.
 *
 * 분리한 3용도:
 * 1. pitch — 피치·소개용. 로그라인·시놉시스·훅·톤·대상 독자. 외부에 보여 주는
 *    문서라 스포일러성 시즌 전개는 담지 않는다(담으면 검증이 경고한다).
 * 2. season-arc — 시즌·연재 아크 개발용. 보드형(회차×비트 보드) + 요약이 표준
 *    산출물이다. 캐릭터별 "원하는 것(want)/필요한 것(need)", 전 회차 스레드
 *    목록, 회차별 비트 목록을 필수 구성으로 둔다.
 * 3. continuity-db — 설정 일관성 검수용 DB. 사실(fact) 레코드 목록으로만
 *    이루어지며 서술 문장을 담지 않는다. studio-story-bible의 facts와 같은
 *    모양이라 연속성 엔진으로 그대로 투영할 수 있다.
 *
 * 버전·시즌 표기 강제:
 * - 모든 문서는 BibleDocumentStamp { documentVersion(정수 ≥1), seasonLabel
 *   (비어 있지 않은 문자열) } 를 반드시 가진다. 스탬프가 없거나 잘못된 문서는
 *   검증에서 error이며, 템플릿 생성·버전 올리기·레거시 분리 같은 모든 생성
 *   경로는 유효한 스탬프 없이는 문서를 만들지 않는다(생성 함수가 throw).
 * - 표기는 formatBibleDocumentStampLine 한 곳에서만 만든다: "v2 · 시즌 1 작성".
 *   화면·내보내기는 이 표기를 그대로 써야 한다.
 * - 내용을 고치면 bumpBibleDocumentVersion 으로 버전을 올리는 것이 규칙이다.
 *   스탬프 없이 저장되는 경로는 두지 않는다.
 *
 * 이 파일은 순수 모델이다(zod·스토리지 의존 없음 — studio-story-bible.ts와
 * 같은 층). 저장 배선은 호스트가 기존 바이블 저장 경로 옆에 이 컬렉션을
 * optional 로 붙이는 방식으로 한다(기존 저장본은 문서 컬렉션이 없어도 유효).
 */
import type { StudioStoryBible, StudioStoryFact } from "./studio-story-bible";

export const STUDIO_BIBLE_DOCUMENT_PURPOSES = [
  "pitch",
  "season-arc",
  "continuity-db",
] as const;

export type StudioBibleDocumentPurpose =
  (typeof STUDIO_BIBLE_DOCUMENT_PURPOSES)[number];

/** 용도별 표시 이름·설명 — 화면 문구의 단일 출처. */
export const STUDIO_BIBLE_PURPOSE_LABELS: Readonly<
  Record<
    StudioBibleDocumentPurpose,
    { readonly ko: string; readonly en: string; readonly hintKo: string }
  >
> = Object.freeze({
  pitch: Object.freeze({
    ko: "피치·소개용",
    en: "Pitch",
    hintKo: "처음 보는 사람에게 작품을 소개하는 문서예요. 로그라인·줄거리·매력 포인트만 담고, 시즌 결말 같은 스포일러는 넣지 않아요.",
  }),
  "season-arc": Object.freeze({
    ko: "시즌 아크 개발용",
    en: "Season arc",
    hintKo: "시즌 전체를 개발하는 작가실 문서예요. 캐릭터별 원하는 것/필요한 것, 전 회차 스레드, 회차별 비트가 표준 산출물이에요.",
  }),
  "continuity-db": Object.freeze({
    ko: "설정 검수용 DB",
    en: "Continuity DB",
    hintKo: "설정이 서로 어긋나지 않는지 검수하는 사실 목록이에요. 문장이 아니라 한 줄 사실로만 적어요.",
  }),
});

/** 모든 바이블 문서가 반드시 달아야 하는 버전·작성 시즌 표기. */
export interface BibleDocumentStamp {
  /** 문서 버전. 1 이상의 정수. 내용을 고칠 때마다 1씩 올린다. */
  readonly documentVersion: number;
  /** 작성 시즌 표기. 예: "시즌 1", "파일럿". 비어 있을 수 없다. */
  readonly seasonLabel: string;
}

export function isValidBibleDocumentStamp(value: unknown): value is BibleDocumentStamp {
  if (typeof value !== "object" || value === null) return false;
  const stamp = value as { documentVersion?: unknown; seasonLabel?: unknown };
  return (
    typeof stamp.documentVersion === "number"
    && Number.isSafeInteger(stamp.documentVersion)
    && stamp.documentVersion >= 1
    && typeof stamp.seasonLabel === "string"
    && stamp.seasonLabel.trim().length > 0
  );
}

/** 스탬프를 만들거나 정규화한다. 유효하지 않으면 throw — 표기 없는 문서는 만들 수 없다. */
export function createBibleDocumentStamp(input: {
  readonly documentVersion?: number;
  readonly seasonLabel: string;
}): BibleDocumentStamp {
  const stamp: BibleDocumentStamp = Object.freeze({
    documentVersion: input.documentVersion ?? 1,
    seasonLabel: typeof input.seasonLabel === "string" ? input.seasonLabel.trim() : "",
  });
  if (!isValidBibleDocumentStamp(stamp)) {
    throw new Error("바이블 문서에는 버전(1 이상 정수)과 작성 시즌 표기가 반드시 필요해요.");
  }
  return stamp;
}

/** 표기 한 줄 — 화면·내보내기 공용 단일 출처. 예: "v2 · 시즌 1 작성". */
export function formatBibleDocumentStampLine(stamp: BibleDocumentStamp): string {
  return `v${stamp.documentVersion} · ${stamp.seasonLabel.trim()} 작성`;
}

/** 피치·소개용 문서. 외부 독자가 대상이라 시즌 전개·결말을 담지 않는다. */
export interface StudioPitchBibleDocument {
  readonly purpose: "pitch";
  readonly id: string;
  readonly title: string;
  readonly stamp: BibleDocumentStamp;
  readonly logline: string;
  readonly synopsis: string;
  readonly hookPoints: readonly string[];
  readonly toneKeywords: readonly string[];
  readonly targetAudience: string;
  readonly comparableNotes: string;
}

/** 시즌 아크 캐릭터 표준 산출물 — 원하는 것(want)과 필요한 것(need)은 한 쌍이다. */
export interface StudioSeasonArcCharacter {
  readonly characterId: string;
  readonly characterName: string;
  /** 겉으로 드러나는 목표 — 캐릭터가 스스로 원한다고 말하는 것. */
  readonly want: string;
  /** 실제로 채워져야 하는 것 — 캐릭터가 자각하지 못할 수 있다. */
  readonly need: string;
  readonly arcSummary: string;
}

export type StudioSeasonArcThreadStatus = "open" | "advanced" | "resolved";

export const STUDIO_SEASON_ARC_THREAD_STATUSES: readonly StudioSeasonArcThreadStatus[] =
  Object.freeze(["open", "advanced", "resolved"]);

/** 전 회차 스레드 목록의 한 줄 — 시즌을 관통하는 이야기 줄기. */
export interface StudioSeasonArcThread {
  readonly id: string;
  readonly title: string;
  readonly status: StudioSeasonArcThreadStatus;
  /** 처음 등장하는 회차 표기. 예: "1화". */
  readonly introducedEpisodeLabel: string;
  readonly summary: string;
}

/** 회차별 비트 목록의 한 회차. */
export interface StudioSeasonArcEpisodeBeats {
  readonly id: string;
  /** 회차 표기. 예: "1화". */
  readonly episodeLabel: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly beats: readonly string[];
  readonly threadIds: readonly string[];
}

/** 시즌·연재 아크 개발용 문서 — 보드형 데이터 + 요약을 함께 가진다. */
export interface StudioSeasonArcBibleDocument {
  readonly purpose: "season-arc";
  readonly id: string;
  readonly title: string;
  readonly stamp: BibleDocumentStamp;
  /** 시즌 요약 — 보드를 읽기 전에 시즌 전체 그림을 한 번에 보는 문단. */
  readonly seasonSummary: string;
  readonly characterArcs: readonly StudioSeasonArcCharacter[];
  readonly threads: readonly StudioSeasonArcThread[];
  readonly episodeBeats: readonly StudioSeasonArcEpisodeBeats[];
}

/** 검수용 DB의 사실 한 줄. studio-story-bible의 StudioStoryFact와 같은 모양. */
export interface StudioContinuityDbFact {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly characterIds: readonly string[];
  readonly locationId: string | null;
}

/** 설정 일관성 검수용 DB 문서 — 사실 레코드만 담는다. */
export interface StudioContinuityDbBibleDocument {
  readonly purpose: "continuity-db";
  readonly id: string;
  readonly title: string;
  readonly stamp: BibleDocumentStamp;
  readonly facts: readonly StudioContinuityDbFact[];
}

export type StudioBibleDocument =
  | StudioPitchBibleDocument
  | StudioSeasonArcBibleDocument
  | StudioContinuityDbBibleDocument;

export interface StudioBibleDocumentSet {
  readonly projectId: string;
  readonly documents: readonly StudioBibleDocument[];
}

export type StudioBibleDocumentIssueSeverity = "error" | "warning";

export interface StudioBibleDocumentIssue {
  readonly code: string;
  readonly severity: StudioBibleDocumentIssueSeverity;
  readonly documentId: string | null;
  readonly messageKo: string;
}

function issue(
  code: string,
  severity: StudioBibleDocumentIssueSeverity,
  documentId: string | null,
  messageKo: string,
): StudioBibleDocumentIssue {
  return Object.freeze({ code, severity, documentId, messageKo });
}

function cleanList(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = typeof value === "string" ? value.trim() : "";
    if (!item || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* 템플릿 — 유형별 표준 빈 문서. 스탬프가 없으면 만들 수 없다.          */
/* ------------------------------------------------------------------ */

export function createPitchBibleTemplate(input: {
  readonly id: string;
  readonly title: string;
  readonly stamp: BibleDocumentStamp;
}): StudioPitchBibleDocument {
  const stamp = createBibleDocumentStamp(input.stamp);
  return Object.freeze({
    purpose: "pitch" as const,
    id: input.id,
    title: input.title,
    stamp,
    logline: "",
    synopsis: "",
    hookPoints: Object.freeze([]),
    toneKeywords: Object.freeze([]),
    targetAudience: "",
    comparableNotes: "",
  });
}

export function createSeasonArcBibleTemplate(input: {
  readonly id: string;
  readonly title: string;
  readonly stamp: BibleDocumentStamp;
  readonly characters?: readonly { readonly id: string; readonly name: string }[];
}): StudioSeasonArcBibleDocument {
  const stamp = createBibleDocumentStamp(input.stamp);
  return Object.freeze({
    purpose: "season-arc" as const,
    id: input.id,
    title: input.title,
    stamp,
    seasonSummary: "",
    characterArcs: Object.freeze(
      (input.characters ?? []).map((character) =>
        Object.freeze({
          characterId: character.id,
          characterName: character.name,
          want: "",
          need: "",
          arcSummary: "",
        }),
      ),
    ),
    threads: Object.freeze([]),
    episodeBeats: Object.freeze([]),
  });
}

export function createContinuityDbBibleTemplate(input: {
  readonly id: string;
  readonly title: string;
  readonly stamp: BibleDocumentStamp;
  readonly facts?: readonly StudioStoryFact[];
}): StudioContinuityDbBibleDocument {
  const stamp = createBibleDocumentStamp(input.stamp);
  return Object.freeze({
    purpose: "continuity-db" as const,
    id: input.id,
    title: input.title,
    stamp,
    facts: Object.freeze(
      (input.facts ?? []).map((fact) =>
        Object.freeze({
          id: fact.id,
          label: fact.label,
          detail: "",
          characterIds: Object.freeze([...fact.characterIds]),
          locationId: fact.locationId,
        }),
      ),
    ),
  });
}

/** 내용 수정 시 버전 올리기 — 스탬프는 그대로 두고 버전만 +1 한 새 문서를 돌려준다. */
export function bumpBibleDocumentVersion<T extends StudioBibleDocument>(document: T): T {
  const stamp = createBibleDocumentStamp({
    documentVersion: document.stamp.documentVersion + 1,
    seasonLabel: document.stamp.seasonLabel,
  });
  return { ...document, stamp };
}

/** 작성 시즌을 바꿔 새 시즌 문서를 시작할 때 — 버전은 1로 되돌린다. */
export function restampBibleDocumentForSeason<T extends StudioBibleDocument>(
  document: T,
  seasonLabel: string,
): T {
  const stamp = createBibleDocumentStamp({ documentVersion: 1, seasonLabel });
  return { ...document, stamp };
}

/* ------------------------------------------------------------------ */
/* 검증 — 유형 분리·스탬프 강제·유형별 필수 산출물                       */
/* ------------------------------------------------------------------ */

export function validateBibleDocument(document: StudioBibleDocument): readonly StudioBibleDocumentIssue[] {
  const issues: StudioBibleDocumentIssue[] = [];
  if (!document.id?.trim()) {
    issues.push(issue("document-id-required", "error", null, "문서 ID가 필요해요."));
  }
  if (!document.title?.trim()) {
    issues.push(issue("document-title-required", "error", document.id || null, "문서 제목이 비어 있어요."));
  }
  if (!isValidBibleDocumentStamp(document.stamp)) {
    issues.push(
      issue(
        "document-stamp-required",
        "error",
        document.id || null,
        "모든 바이블 문서에는 버전과 작성 시즌 표기가 반드시 있어야 해요.",
      ),
    );
  }

  if (document.purpose === "pitch") {
    if (!document.logline.trim()) {
      issues.push(issue("pitch-logline-missing", "warning", document.id, "피치 문서에는 한 줄 로그라인이 필요해요."));
    }
    if (!document.synopsis.trim()) {
      issues.push(issue("pitch-synopsis-missing", "warning", document.id, "피치 문서에는 줄거리 소개가 필요해요."));
    }
    if (document.hookPoints.length === 0) {
      issues.push(issue("pitch-hooks-missing", "warning", document.id, "피치 문서에는 매력 포인트를 하나 이상 적어 주세요."));
    }
  }

  if (document.purpose === "season-arc") {
    for (const arc of document.characterArcs) {
      if (!arc.want.trim() || !arc.need.trim()) {
        issues.push(
          issue(
            "season-arc-want-need-required",
            "error",
            document.id,
            `캐릭터 "${arc.characterName || arc.characterId}"의 원하는 것/필요한 것을 모두 적어야 해요. 둘은 한 쌍이 표준 산출물이에요.`,
          ),
        );
      }
    }
    const threadIds = new Set(document.threads.map((thread) => thread.id));
    for (const thread of document.threads) {
      if (!thread.title.trim()) {
        issues.push(issue("season-arc-thread-title-required", "error", document.id, "스레드에는 제목이 필요해요."));
      }
      if (!thread.introducedEpisodeLabel.trim()) {
        issues.push(
          issue("season-arc-thread-introduced-missing", "warning", document.id, `스레드 "${thread.title}"이 처음 등장하는 회차를 적어 주세요.`),
        );
      }
    }
    for (const episode of document.episodeBeats) {
      if (episode.beats.length === 0) {
        issues.push(
          issue("season-arc-episode-beats-missing", "warning", document.id, `${episode.episodeLabel || "회차"}의 비트 목록이 비어 있어요.`),
        );
      }
      for (const threadId of episode.threadIds) {
        if (!threadIds.has(threadId)) {
          issues.push(
            issue("season-arc-episode-thread-unknown", "error", document.id, `${episode.episodeLabel}가 없는 스레드 "${threadId}"를 참조해요.`),
          );
        }
      }
    }
    if (document.episodeBeats.length > 0 && !document.seasonSummary.trim()) {
      issues.push(issue("season-arc-summary-missing", "warning", document.id, "회차 비트가 있으면 시즌 요약도 함께 적어 주세요(보드형+요약이 한 쌍이에요)."));
    }
  }

  if (document.purpose === "continuity-db") {
    const factIds = new Set<string>();
    for (const fact of document.facts) {
      if (!fact.id.trim() || !fact.label.trim()) {
        issues.push(issue("continuity-fact-required", "error", document.id, "검수용 사실에는 ID와 한 줄 사실이 필요해요."));
      }
      if (factIds.has(fact.id)) {
        issues.push(issue("continuity-fact-duplicate", "error", document.id, `사실 ID "${fact.id}"가 겹쳐요.`));
      }
      factIds.add(fact.id);
    }
  }

  return Object.freeze(issues);
}

export function validateBibleDocumentSet(
  set: StudioBibleDocumentSet,
): readonly StudioBibleDocumentIssue[] {
  const issues: StudioBibleDocumentIssue[] = [];
  if (!set.projectId.trim()) {
    issues.push(issue("project-id-required", "error", null, "프로젝트 ID가 필요해요."));
  }
  const ids = new Set<string>();
  for (const document of set.documents) {
    if (ids.has(document.id)) {
      issues.push(issue("document-id-duplicate", "error", document.id, `문서 ID "${document.id}"가 겹쳐요.`));
    }
    ids.add(document.id);
    issues.push(...validateBibleDocument(document));
  }
  return Object.freeze(issues);
}

/** 검수용 DB를 스토리 바이블과 대조 — 모르는 캐릭터·장소 참조를 잡는다. */
export function validateContinuityDbAgainstStoryBible(
  document: StudioContinuityDbBibleDocument,
  bible: StudioStoryBible,
): readonly StudioBibleDocumentIssue[] {
  const issues: StudioBibleDocumentIssue[] = [];
  const characterIds = new Set(bible.characters.map((character) => character.id));
  const locationIds = new Set(bible.locations.map((location) => location.id));
  for (const fact of document.facts) {
    for (const characterId of fact.characterIds) {
      if (!characterIds.has(characterId)) {
        issues.push(
          issue("continuity-fact-character-unknown", "error", document.id, `사실 "${fact.label}"이 모르는 캐릭터 "${characterId}"를 참조해요.`),
        );
      }
    }
    if (fact.locationId && !locationIds.has(fact.locationId)) {
      issues.push(
        issue("continuity-fact-location-unknown", "error", document.id, `사실 "${fact.label}"이 모르는 장소 "${fact.locationId}"를 참조해요.`),
      );
    }
  }
  return Object.freeze(issues);
}

/** 검수용 DB → 스토리 바이블 사실 투영. 연속성 엔진 입력으로 그대로 쓴다. */
export function projectContinuityDbFacts(
  document: StudioContinuityDbBibleDocument,
): readonly StudioStoryFact[] {
  return Object.freeze(
    document.facts.map((fact) =>
      Object.freeze({
        id: fact.id,
        label: fact.label,
        characterIds: Object.freeze([...fact.characterIds]),
        locationId: fact.locationId,
      }),
    ),
  );
}

/* ------------------------------------------------------------------ */
/* 조회·보드·요약                                                       */
/* ------------------------------------------------------------------ */

export function bibleDocumentsByPurpose(
  set: StudioBibleDocumentSet,
  purpose: StudioBibleDocumentPurpose,
): readonly StudioBibleDocument[] {
  return Object.freeze(set.documents.filter((document) => document.purpose === purpose));
}

export function bibleDocumentPurposeCounts(
  set: StudioBibleDocumentSet,
): Readonly<Record<StudioBibleDocumentPurpose, number>> {
  const counts: Record<StudioBibleDocumentPurpose, number> = {
    pitch: 0,
    "season-arc": 0,
    "continuity-db": 0,
  };
  for (const document of set.documents) counts[document.purpose] += 1;
  return Object.freeze(counts);
}

export interface StudioSeasonArcSummary {
  readonly seasonLabel: string;
  readonly stampLine: string;
  readonly characterCount: number;
  readonly charactersMissingWantOrNeed: number;
  readonly threadCount: number;
  readonly openThreadCount: number;
  readonly episodeCount: number;
  readonly beatCount: number;
  readonly lines: readonly string[];
}

/** 시즌 아크 요약 산출물 — 보드와 한 쌍으로 나가는 표준 요약. */
export function summarizeSeasonArcDocument(
  document: StudioSeasonArcBibleDocument,
): StudioSeasonArcSummary {
  const beatCount = document.episodeBeats.reduce((sum, episode) => sum + episode.beats.length, 0);
  const openThreadCount = document.threads.filter((thread) => thread.status !== "resolved").length;
  const missing = document.characterArcs.filter((arc) => !arc.want.trim() || !arc.need.trim()).length;
  const lines = [
    `${document.title} (${formatBibleDocumentStampLine(document.stamp)})`,
    document.seasonSummary.trim() || "시즌 요약이 아직 없어요.",
    `캐릭터 아크 ${document.characterArcs.length}명 · 스레드 ${document.threads.length}개(미해결 ${openThreadCount}개) · 회차 ${document.episodeBeats.length}개 · 비트 ${beatCount}개`,
    ...document.characterArcs.map(
      (arc) => `- ${arc.characterName}: 원하는 것 — ${arc.want || "(미작성)"} / 필요한 것 — ${arc.need || "(미작성)"}`,
    ),
  ];
  return Object.freeze({
    seasonLabel: document.stamp.seasonLabel,
    stampLine: formatBibleDocumentStampLine(document.stamp),
    characterCount: document.characterArcs.length,
    charactersMissingWantOrNeed: missing,
    threadCount: document.threads.length,
    openThreadCount,
    episodeCount: document.episodeBeats.length,
    beatCount,
    lines: Object.freeze(lines),
  });
}

export interface StudioSeasonArcBoardColumn {
  readonly episodeId: string;
  readonly episodeLabel: string;
  readonly episodeNumber: number;
  readonly title: string;
  readonly beats: readonly string[];
  readonly threadTitles: readonly string[];
}

/** 보드형 산출물 — 회차 열 × 비트 행으로 보는 시즌 보드 모델. */
export function buildSeasonArcBoard(
  document: StudioSeasonArcBibleDocument,
): readonly StudioSeasonArcBoardColumn[] {
  const threadById = new Map(document.threads.map((thread) => [thread.id, thread]));
  const columns = [...document.episodeBeats]
    .sort((a, b) => a.episodeNumber - b.episodeNumber || a.episodeLabel.localeCompare(b.episodeLabel))
    .map((episode) =>
      Object.freeze({
        episodeId: episode.id,
        episodeLabel: episode.episodeLabel,
        episodeNumber: episode.episodeNumber,
        title: episode.title,
        beats: Object.freeze([...episode.beats]),
        threadTitles: Object.freeze(
          episode.threadIds.map((id) => threadById.get(id)?.title ?? id),
        ),
      }),
    );
  return Object.freeze(columns);
}

/* ------------------------------------------------------------------ */
/* 레거시 분리 — 한 덩어리 세계관 문서를 3용도로 처음부터 나눈다.        */
/* ------------------------------------------------------------------ */

export interface LegacyBibleBlob {
  readonly title: string;
  readonly synopsis?: string;
  readonly logline?: string;
  readonly characters?: readonly { readonly id: string; readonly name: string; readonly goal?: string }[];
  readonly facts?: readonly StudioStoryFact[];
}

/**
 * 기존 단일 세계관 문서를 3용도 문서 묶음으로 분리한다.
 * - 소개 문장(로그라인·시놉시스)은 피치용으로만 간다.
 * - 캐릭터 목표(goal)는 시즌 아크의 "원하는 것" 초안으로만 가고, "필요한 것"은
 *   비워 둔다 — 검증이 error로 채우라고 알리는 것이 표준 흐름이다.
 * - 사실은 검수용 DB로만 간다.
 * 스탬프가 유효하지 않으면 분리 자체를 하지 않는다(throw).
 */
export function splitLegacyBibleBlob(
  blob: LegacyBibleBlob,
  input: {
    readonly projectId: string;
    readonly stamp: BibleDocumentStamp;
    readonly idPrefix?: string;
  },
): StudioBibleDocumentSet {
  const stamp = createBibleDocumentStamp(input.stamp);
  const prefix = (input.idPrefix ?? "bible").trim() || "bible";
  const characters = blob.characters ?? [];

  const pitch = createPitchBibleTemplate({
    id: `${prefix}-pitch`,
    title: `${blob.title} 소개`,
    stamp,
  });
  const pitchDocument: StudioPitchBibleDocument = Object.freeze({
    ...pitch,
    logline: (blob.logline ?? "").trim(),
    synopsis: (blob.synopsis ?? "").trim(),
    hookPoints: Object.freeze(cleanList([])),
  });

  const seasonArcBase = createSeasonArcBibleTemplate({
    id: `${prefix}-season-arc`,
    title: `${blob.title} 시즌 아크`,
    stamp,
    characters,
  });
  const seasonArcDocument: StudioSeasonArcBibleDocument = Object.freeze({
    ...seasonArcBase,
    characterArcs: Object.freeze(
      seasonArcBase.characterArcs.map((arc) => {
        const source = characters.find((character) => character.id === arc.characterId);
        return Object.freeze({ ...arc, want: (source?.goal ?? "").trim() });
      }),
    ),
  });

  const continuityDb = createContinuityDbBibleTemplate({
    id: `${prefix}-continuity-db`,
    title: `${blob.title} 설정 검수 DB`,
    stamp,
    facts: blob.facts ?? [],
  });

  return Object.freeze({
    projectId: input.projectId,
    documents: Object.freeze([pitchDocument, seasonArcDocument, continuityDb]),
  });
}
