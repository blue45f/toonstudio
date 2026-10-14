/**
 * 작품 세계관 설정 항목(로어) 모델 — 장소를 넘어 세계 전체를 구조화하는 층.
 *
 * 왜 별도 층인가 (현재 상태 실측, 2026-10-14):
 * - 스토리 바이블(StudioStoryBible)은 연속성 검사용이다. 장소는 id·이름뿐이고
 *   세력·종족·아이템·규칙·연표 사건 같은 "설정 항목" 자체가 없다.
 * - storyworld 랩은 분석용 프로젝트 모델(사실 술어·인과)이라, 작가가 기획 화면에서
 *   "이 세계는 어떤 곳인가"를 적어 두는 백과형 표면이 아니다.
 * - 그래서 설정 항목은 바이블 옆에 붙는 별도 컬렉션으로 둔다. 캐릭터 프로필
 *   (studio-character-profile.ts)이 바이블에 optional 로 붙은 것과 같은 패턴이다.
 *   바이블·연속성 엔진은 이 파일을 몰라도 되고, 기존 저장본도 그대로 유효하다.
 *
 * 원칙:
 * - 항목은 종류(kind)를 가진다: 장소·세력/조직·종족/생물·아이템/기술·규칙/법칙·연표 사건.
 * - 연결은 명시 필드로만 만든다(relatedEntryIds·characterIds). 이름이 비슷하다는
 *   이유로 자동 연결하지 않는다 — 공유 유니버스 레지스트리의 원칙과 같다.
 * - 연표 사건은 eraLabel(작가 말로 적는 시기 표기)과 timelineOrder(정렬 키)를
 *   함께 둔다. 날짜 체계는 작품마다 달라 숫자 날짜를 강제하지 않는다.
 * - origin="example" 인 항목은 빈 상태에서 "예시로 시작하기"로 들어간 견본이다.
 *   실제 설정과 섞어 세지 않도록 항상 구분해 표시하고, 한 번에 지울 수 있게 한다.
 *
 * 상태·버전·범위 (lore-entry-status-tristate-quarantine 레인에서 처음부터 포함):
 * - status 는 인식 상태 3분류(confirmed 확정 / speculative 추측 / intentional-gap
 *   의도적 빈칸)에 격리 상태 2종(deprecated 폐기 / quarantined 격리·레전드 분리)을
 *   더한 5값이다. 근거: Halo 스토리 바이블 — 추측은 추측이라고 명시하고, 발견한
 *   빈칸은 일부러 채우지 않는다(빈칸이 새 이야기가 된다). 루카스필름 홀로크론 —
 *   규모가 임계점을 넘자 EU 를 Legends 로 재분류했듯, 틀린 설정은 삭제가 아니라
 *   격리해 분리 보관하고, 필요하면 다시 확정으로 되돌릴 수 있어야 한다.
 * - 빈칸(intentional-gap)은 오류가 아니다. 이름만 세워 두고 내용은 비워 둘 수
 *   있으며, 검증은 빈칸의 내용 부재를 문제로 보고하지 않는다.
 * - version 은 항목 단위 정수 버전(1부터). 상태 전이 때마다 1씩 오른다 — 어느
 *   버전의 설정과 충돌했는지를 판정·기록할 수 있게 하기 위해서다.
 * - appliesToWorkIds / appliesToSeasonLabels 는 적용 범위다. 빈 배열은
 *   "전 작품·전 시즌"을 뜻한다. 범위가 겹치지 않는 확정 설정끼리는 충돌하지
 *   않는다(시즌 2 전용 설정이 시즌 1 설정을 막지 않는다).
 * - 격리·폐기 항목은 정본 이름 공간을 점유하지 않는다. 같은 이름으로 새 확정
 *   설정을 세울 수 있고(Legends 재사용), 활성 항목이 격리 항목을 가리키면
 *   검증이 경고로만 알린다.
 * - 등록 순서는 선점(claim) 순서다: entries 배열에서 먼저 들어간 항목이 그
 *   이름의 선점자다. 충돌 판정(studio-lore-consistency-gate)은 이 순서를 쓴다.
 */
import type { StudioStoryBible } from "../studio-story-bible";

export const STUDIO_LORE_ENTRY_KINDS = [
  "place",
  "faction",
  "species",
  "artifact",
  "rule",
  "event",
] as const;

export type StudioLoreEntryKind = (typeof STUDIO_LORE_ENTRY_KINDS)[number];

/** 종류별 표시 이름 — 화면 문구의 단일 출처. */
export const STUDIO_LORE_KIND_LABELS: Readonly<
  Record<StudioLoreEntryKind, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  place: Object.freeze({ ko: "장소", en: "Place" }),
  faction: Object.freeze({ ko: "세력·조직", en: "Faction" }),
  species: Object.freeze({ ko: "종족·생물", en: "Species" }),
  artifact: Object.freeze({ ko: "아이템·기술", en: "Item & craft" }),
  rule: Object.freeze({ ko: "규칙·법칙", en: "Rule" }),
  event: Object.freeze({ ko: "연표 사건", en: "Event" }),
});

export type StudioLoreEntryOrigin = "authored" | "example";

/** 설정 항목 상태 — 인식 3분류 + 격리 2종. 위 파일 머리말의 근거를 볼 것. */
export const STUDIO_LORE_ENTRY_STATUSES = [
  "confirmed",
  "speculative",
  "intentional-gap",
  "deprecated",
  "quarantined",
] as const;

export type StudioLoreEntryStatus = (typeof STUDIO_LORE_ENTRY_STATUSES)[number];

/** 상태별 표시 이름·설명 — 화면 문구와 판정 메시지의 단일 출처. */
export const STUDIO_LORE_STATUS_LABELS: Readonly<
  Record<
    StudioLoreEntryStatus,
    { readonly ko: string; readonly en: string; readonly hintKo: string }
  >
> = Object.freeze({
  confirmed: Object.freeze({
    ko: "확정",
    en: "Confirmed",
    hintKo: "정본 설정이에요. 다른 설정이 이와 충돌하면 등록이 막혀요.",
  }),
  speculative: Object.freeze({
    ko: "추측",
    en: "Speculative",
    hintKo: "아직 추측 단계예요. 충돌해도 통과하지만, 확정 여부를 정하라는 안내가 떠요.",
  }),
  "intentional-gap": Object.freeze({
    ko: "의도적 빈칸",
    en: "Intentional gap",
    hintKo: "일부러 비워 둔 자리예요. 비어 있는 것 자체가 설정이고, 새 이야기가 여기서 나올 수 있어요.",
  }),
  deprecated: Object.freeze({
    ko: "폐기",
    en: "Deprecated",
    hintKo: "더 이상 쓰지 않기로 한 설정이에요. 이름은 새 설정이 다시 쓸 수 있어요.",
  }),
  quarantined: Object.freeze({
    ko: "격리(레전드)",
    en: "Quarantined (Legends)",
    hintKo: "본편 정본에서 분리해 따로 보관 중인 설정이에요. 필요하면 확정으로 되돌릴 수 있어요.",
  }),
});

/** 상태 묶음 — 판정 분기가 쓰는 분류. */
export type StudioLoreStatusGroup = "canon" | "tentative" | "gap" | "retired";

export function loreEntryStatusGroup(status: StudioLoreEntryStatus): StudioLoreStatusGroup {
  switch (status) {
    case "confirmed":
      return "canon";
    case "speculative":
      return "tentative";
    case "intentional-gap":
      return "gap";
    case "deprecated":
    case "quarantined":
      return "retired";
  }
}

/** 격리·폐기 상태인가 — 정본 이름 공간을 점유하지 않고 기본 목록에서 분리된다. */
export function isLoreEntryRetired(entry: Pick<StudioLoreEntry, "status">): boolean {
  return loreEntryStatusGroup(entry.status) === "retired";
}

/** 활성 설정인가 — 일관성 체크의 정본 후보가 되는 상태(confirmed·speculative·gap). */
export function isLoreEntryActive(entry: Pick<StudioLoreEntry, "status">): boolean {
  return !isLoreEntryRetired(entry);
}

/** 항목 버전 정규화 — 1 이상의 정수. 잘못된 값은 1로 접는다. */
export function normalizeLoreEntryVersion(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.trunc(value));
}

/** 적용 범위 표기 — 화면의 버전·범위 줄이 쓰는 한 줄 문자열. */
export function formatLoreEntryScope(entry: StudioLoreEntry): string {
  const works =
    entry.appliesToWorkIds.length > 0 ? entry.appliesToWorkIds.join(", ") : "전 작품";
  const seasons =
    entry.appliesToSeasonLabels.length > 0
      ? entry.appliesToSeasonLabels.join(", ")
      : "전 시즌";
  return `${works} · ${seasons}`;
}

/** "상태 vN · 범위" 표기 — 목록·상세에서 버전과 격리를 한눈에 보이게 한다. */
export function formatLoreEntryStatusLine(entry: StudioLoreEntry): string {
  return `${STUDIO_LORE_STATUS_LABELS[entry.status].ko} v${entry.version} · ${formatLoreEntryScope(entry)}`;
}

/**
 * 적용 범위 판정 — 항목이 주어진 작품·시즌에 적용되는가.
 * 항목의 범위가 비어 있으면 그 차원은 전 범위다. 질의가 차원을 생략하면
 * (workId/seasonLabel 미지정) 그 차원은 제한하지 않는 것으로 본다.
 */
export function loreEntryAppliesTo(
  entry: StudioLoreEntry,
  scope: { readonly workId?: string | null; readonly seasonLabel?: string | null },
): boolean {
  const workId = scope.workId?.trim() ?? "";
  const seasonLabel = scope.seasonLabel?.trim() ?? "";
  if (
    workId
    && entry.appliesToWorkIds.length > 0
    && !entry.appliesToWorkIds.includes(workId)
  ) {
    return false;
  }
  if (
    seasonLabel
    && entry.appliesToSeasonLabels.length > 0
    && !entry.appliesToSeasonLabels.includes(seasonLabel)
  ) {
    return false;
  }
  return true;
}

/** 두 항목의 적용 범위가 겹칠 수 있는가 — 차원별 집합이 비었으면 전 범위라 겹친다. */
export function loreEntryScopesOverlap(
  a: Pick<StudioLoreEntry, "appliesToWorkIds" | "appliesToSeasonLabels">,
  b: Pick<StudioLoreEntry, "appliesToWorkIds" | "appliesToSeasonLabels">,
): boolean {
  const overlaps = (x: readonly string[], y: readonly string[]) =>
    x.length === 0 || y.length === 0 || x.some((value) => y.includes(value));
  return (
    overlaps(a.appliesToWorkIds, b.appliesToWorkIds)
    && overlaps(a.appliesToSeasonLabels, b.appliesToSeasonLabels)
  );
}

export interface StudioLoreEntry {
  readonly id: string;
  readonly kind: StudioLoreEntryKind;
  /** 정본 이름 — 고유명사 사전의 표제어가 된다. */
  readonly name: string;
  /** 별칭·줄임말·옛 이름. 표기 일관성 검사가 흔들림 판정에 쓴다. */
  readonly aliases: readonly string[];
  /** 한 줄 요약 — 목록과 참조 패널에서 보이는 짧은 설명. */
  readonly summary: string;
  /** 상세 설정 — 자유 서술. */
  readonly details: string;
  /** 연표 표기 (주로 event) — "대침수 12년 뒤"처럼 작가가 적는 시기 말. */
  readonly eraLabel: string;
  /** 연표 정렬 키 (주로 event) — 작을수록 먼저. null이면 정렬 뒤쪽. */
  readonly timelineOrder: number | null;
  /** 다른 설정 항목과의 연결 (명시 지정만). */
  readonly relatedEntryIds: readonly string[];
  /** 바이블 캐릭터와의 연결 (명시 지정만). */
  readonly characterIds: readonly string[];
  readonly origin: StudioLoreEntryOrigin;
  /** 인식·격리 상태. 기존 저장본에 없으면 confirmed 로 읽는다(스토어 정규화). */
  readonly status: StudioLoreEntryStatus;
  /** 항목 버전(1부터 정수). 상태 전이 때마다 오른다. */
  readonly version: number;
  /** 적용 작품 id 목록. 빈 배열 = 전 작품. */
  readonly appliesToWorkIds: readonly string[];
  /** 적용 시즌 표기 목록(작가가 적는 말 그대로). 빈 배열 = 전 시즌. */
  readonly appliesToSeasonLabels: readonly string[];
}

/** 상태·버전·범위를 뺀 항목 초안 — 신규 등록 경로가 기본값을 채울 때 쓴다. */
export type StudioLoreEntryDraft = Omit<
  StudioLoreEntry,
  "status" | "version" | "appliesToWorkIds" | "appliesToSeasonLabels"
> &
  Partial<
    Pick<
      StudioLoreEntry,
      "status" | "version" | "appliesToWorkIds" | "appliesToSeasonLabels"
    >
  >;

/** 초안·기존 저장본처럼 필드가 빠진 항목에 기본값을 채운다(확정·v1·전 범위). */
export function withLoreEntryDefaults(draft: StudioLoreEntryDraft): StudioLoreEntry {
  return Object.freeze({
    ...draft,
    status: draft.status ?? "confirmed",
    version: normalizeLoreEntryVersion(draft.version ?? 1),
    appliesToWorkIds: Object.freeze([...(draft.appliesToWorkIds ?? [])]),
    appliesToSeasonLabels: Object.freeze([...(draft.appliesToSeasonLabels ?? [])]),
  });
}

export interface StudioWorldLore {
  readonly projectId: string;
  readonly entries: readonly StudioLoreEntry[];
}

export function emptyWorldLore(projectId: string): StudioWorldLore {
  return Object.freeze({ projectId, entries: Object.freeze([]) });
}

/** 새 항목 id — 종류 접두 + 기존 최대 번호 + 1. 결정적이라 테스트가 고정할 수 있다. */
export function nextLoreEntryId(lore: StudioWorldLore, kind: StudioLoreEntryKind): string {
  const prefix = `lore-${kind}-`;
  let max = 0;
  for (const entry of lore.entries) {
    if (!entry.id.startsWith(prefix)) continue;
    const n = Number(entry.id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

/** 항목을 넣는다 — 같은 id가 있으면 교체, 없으면 끝에 붙인다. 자기 참조·중복 연결은 정리한다. */
export function upsertLoreEntry(lore: StudioWorldLore, entry: StudioLoreEntry): StudioWorldLore {
  const cleaned: StudioLoreEntry = Object.freeze({
    ...entry,
    aliases: Object.freeze([...new Set(entry.aliases.map((a) => a.trim()).filter(Boolean))]),
    relatedEntryIds: Object.freeze(
      [...new Set(entry.relatedEntryIds)].filter((id) => id !== entry.id),
    ),
    characterIds: Object.freeze([...new Set(entry.characterIds)]),
    version: normalizeLoreEntryVersion(entry.version),
    appliesToWorkIds: Object.freeze(
      [...new Set(entry.appliesToWorkIds.map((v) => v.trim()).filter(Boolean))],
    ),
    appliesToSeasonLabels: Object.freeze(
      [...new Set(entry.appliesToSeasonLabels.map((v) => v.trim()).filter(Boolean))],
    ),
  });
  const exists = lore.entries.some((candidate) => candidate.id === entry.id);
  const entries = exists
    ? lore.entries.map((candidate) => (candidate.id === entry.id ? cleaned : candidate))
    : [...lore.entries, cleaned];
  return Object.freeze({ projectId: lore.projectId, entries: Object.freeze(entries) });
}

/** 항목을 지우고, 다른 항목의 연결에서도 그 id를 걷어낸다(고아 참조 방지). */
export function removeLoreEntry(lore: StudioWorldLore, entryId: string): StudioWorldLore {
  const entries = lore.entries
    .filter((entry) => entry.id !== entryId)
    .map((entry) =>
      entry.relatedEntryIds.includes(entryId)
        ? Object.freeze({
            ...entry,
            relatedEntryIds: Object.freeze(
              entry.relatedEntryIds.filter((id) => id !== entryId),
            ),
          })
        : entry,
    );
  return Object.freeze({ projectId: lore.projectId, entries: Object.freeze(entries) });
}

/** 예시로 들어간 항목만 걷어낸다 — 작가가 직접 쓴 항목은 건드리지 않는다. */
export function removeLoreExamples(lore: StudioWorldLore): StudioWorldLore {
  const exampleIds = new Set(
    lore.entries.filter((entry) => entry.origin === "example").map((entry) => entry.id),
  );
  if (exampleIds.size === 0) return lore;
  let next = lore;
  for (const id of exampleIds) next = removeLoreEntry(next, id);
  return next;
}

export function loreEntriesByStatus(
  lore: StudioWorldLore,
  status: StudioLoreEntryStatus,
): readonly StudioLoreEntry[] {
  return Object.freeze(lore.entries.filter((entry) => entry.status === status));
}

/** 활성 항목만 — 기본 목록·연표·이름 사전이 보는 집합. */
export function activeLoreEntries(lore: StudioWorldLore): readonly StudioLoreEntry[] {
  return Object.freeze(lore.entries.filter((entry) => isLoreEntryActive(entry)));
}

/** 격리·폐기 항목만 — "격리(레전드)" 분리 보관함이 보는 집합. */
export function retiredLoreEntries(lore: StudioWorldLore): readonly StudioLoreEntry[] {
  return Object.freeze(lore.entries.filter((entry) => isLoreEntryRetired(entry)));
}

export function loreStatusCounts(
  lore: StudioWorldLore,
): Readonly<Record<StudioLoreEntryStatus, number>> {
  const counts: Record<StudioLoreEntryStatus, number> = {
    confirmed: 0,
    speculative: 0,
    "intentional-gap": 0,
    deprecated: 0,
    quarantined: 0,
  };
  for (const entry of lore.entries) counts[entry.status] += 1;
  return Object.freeze(counts);
}

/**
 * 상태 전이 — 같은 상태면 원본 그대로. 전이하면 version이 1 오른다.
 * 격리(quarantined/deprecated)로 보내는 것도, 격리에서 확정으로 되돌리는
 * 것(레전드 → 정본 복귀)도 이 한 경로를 지난다. 내용은 건드리지 않는다.
 */
export function transitionLoreEntryStatus(
  lore: StudioWorldLore,
  entryId: string,
  nextStatus: StudioLoreEntryStatus,
): StudioWorldLore {
  const target = lore.entries.find((entry) => entry.id === entryId);
  if (!target || target.status === nextStatus) return lore;
  const entries = lore.entries.map((entry) =>
    entry.id === entryId
      ? Object.freeze({
          ...entry,
          status: nextStatus,
          version: normalizeLoreEntryVersion(entry.version) + 1,
        })
      : entry,
  );
  return Object.freeze({ projectId: lore.projectId, entries: Object.freeze(entries) });
}

/** 버전을 명시로 올린다(내용 개정 표기용) — 낮추는 지정은 현재 값으로 접는다. */
export function reviseLoreEntryVersion(
  lore: StudioWorldLore,
  entryId: string,
  version: number,
): StudioWorldLore {
  const target = lore.entries.find((entry) => entry.id === entryId);
  if (!target) return lore;
  const nextVersion = Math.max(
    normalizeLoreEntryVersion(target.version),
    normalizeLoreEntryVersion(version),
  );
  if (nextVersion === target.version) return lore;
  const entries = lore.entries.map((entry) =>
    entry.id === entryId ? Object.freeze({ ...entry, version: nextVersion }) : entry,
  );
  return Object.freeze({ projectId: lore.projectId, entries: Object.freeze(entries) });
}

export function loreEntriesByKind(
  lore: StudioWorldLore,
  kind: StudioLoreEntryKind,
): readonly StudioLoreEntry[] {
  return Object.freeze(lore.entries.filter((entry) => entry.kind === kind));
}

export function loreKindCounts(
  lore: StudioWorldLore,
): Readonly<Record<StudioLoreEntryKind, number>> {
  const counts: Record<StudioLoreEntryKind, number> = {
    place: 0,
    faction: 0,
    species: 0,
    artifact: 0,
    rule: 0,
    event: 0,
  };
  for (const entry of lore.entries) counts[entry.kind] += 1;
  return Object.freeze(counts);
}

/** 연표 — 사건 항목을 정렬 키 순서로. 키가 없는 사건은 뒤에 이름순으로 둔다. */
export function loreTimeline(lore: StudioWorldLore): readonly StudioLoreEntry[] {
  const events = lore.entries.filter(
    (entry) => entry.kind === "event" && isLoreEntryActive(entry),
  );
  return Object.freeze(
    [...events].sort((a, b) => {
      const ao = a.timelineOrder;
      const bo = b.timelineOrder;
      if (ao !== null && bo !== null && ao !== bo) return ao - bo;
      if (ao !== null && bo === null) return -1;
      if (ao === null && bo !== null) return 1;
      return a.name.localeCompare(b.name);
    }),
  );
}

/** 항목 하나가 연결된 상대 항목들 (저장 순서 유지). */
export function loreRelatedEntries(
  lore: StudioWorldLore,
  entry: StudioLoreEntry,
): readonly StudioLoreEntry[] {
  const byId = new Map(lore.entries.map((candidate) => [candidate.id, candidate]));
  return Object.freeze(
    entry.relatedEntryIds
      .map((id) => byId.get(id))
      .filter((candidate): candidate is StudioLoreEntry => candidate !== undefined),
  );
}

/** 이름·별칭·요약·상세에서 찾는 단순 검색 — 허브가 수백 개로 커져도 목록을 좁힐 수 있게. */
export function searchLoreEntries(
  lore: StudioWorldLore,
  query: string,
): readonly StudioLoreEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return lore.entries;
  return Object.freeze(
    lore.entries.filter((entry) =>
      [entry.name, ...entry.aliases, entry.summary, entry.details]
        .join("\n")
        .toLocaleLowerCase()
        .includes(needle),
    ),
  );
}

export interface StudioWorldLoreIssue {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly affectedIds: readonly string[];
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/**
 * 설정 검증 — 바이블 검증(validateStudioStoryBible)과 같은 모양의 이슈를 낸다.
 * 이름 충돌은 여기서도 보고한다: 고유명사 사전(studio-lore-name-check)이 같은
 * 충돌을 검사 시점에도 쓰기 때문이다. 사전의 정본은 이 모델의 name 이다.
 */
export function validateWorldLore(
  bible: StudioStoryBible | null,
  lore: StudioWorldLore,
): readonly StudioWorldLoreIssue[] {
  const issues: StudioWorldLoreIssue[] = [];
  const entryIds = new Set(lore.entries.map((entry) => entry.id));
  const characterIds = new Set((bible?.characters ?? []).map((character) => character.id));

  // 표면형(이름·별칭) 점유표 — 항목끼리, 그리고 캐릭터 이름·별칭과 겹치면 충돌.
  const surfaces = new Map<string, string>(); // normalized surface -> owner label
  const claim = (surface: string, owner: string, ownerId: string) => {
    const key = normalizeName(surface);
    if (!key) return;
    const existing = surfaces.get(key);
    if (existing && existing !== owner) {
      issues.push({
        code: "lore-name-collision",
        severity: "error",
        message: `The name "${surface}" is used by both ${existing} and ${owner}.`,
        affectedIds: [ownerId],
      });
    } else {
      surfaces.set(key, owner);
    }
  };
  for (const character of bible?.characters ?? []) {
    claim(character.name, `character "${character.name}"`, character.id);
    for (const alias of character.aliases) claim(alias, `character "${character.name}"`, character.id);
  }
  // 격리·폐기 항목은 이름 공간을 점유하지 않는다 — 선점자 집합에서 빼 두어,
  // 활성 항목과의 이름 겹침을 충돌로 세지 않는다(Legends 이름 재사용 허용).

  const seenIds = new Set<string>();
  for (const entry of lore.entries) {
    if (!entry.id.trim() || seenIds.has(entry.id)) {
      issues.push({
        code: "lore-id",
        severity: "error",
        message: "Lore entry ids must be present and unique.",
        affectedIds: [entry.id],
      });
    }
    seenIds.add(entry.id);
    if (!entry.name.trim()) {
      issues.push({
        code: "lore-name-empty",
        severity: "error",
        message: "A lore entry needs a name.",
        affectedIds: [entry.id],
      });
    }
    if (!Number.isInteger(entry.version) || entry.version < 1) {
      issues.push({
        code: "lore-version-invalid",
        severity: "error",
        message: "A lore entry version must be a positive integer.",
        affectedIds: [entry.id],
      });
    }
    if (isLoreEntryActive(entry)) {
      claim(entry.name, `${entry.kind} "${entry.name}"`, entry.id);
      for (const alias of entry.aliases) claim(alias, `${entry.kind} "${entry.name}"`, entry.id);
    }

    const danglingEntries = entry.relatedEntryIds.filter((id) => !entryIds.has(id));
    if (danglingEntries.length > 0) {
      issues.push({
        code: "lore-relation-reference",
        severity: "error",
        message: "A lore entry links to an unknown lore entry.",
        affectedIds: danglingEntries,
      });
    }
    if (bible) {
      const danglingCharacters = entry.characterIds.filter((id) => !characterIds.has(id));
      if (danglingCharacters.length > 0) {
        issues.push({
          code: "lore-character-reference",
          severity: "error",
          message: "A lore entry links to an unknown character.",
          affectedIds: danglingCharacters,
        });
      }
    }
    if (isLoreEntryActive(entry)) {
      const retiredLinks = entry.relatedEntryIds.filter((id) => {
        const linked = lore.entries.find((candidate) => candidate.id === id);
        return linked !== undefined && isLoreEntryRetired(linked);
      });
      if (retiredLinks.length > 0) {
        issues.push({
          code: "lore-retired-link",
          severity: "warning",
          message:
            "An active lore entry links to a deprecated or quarantined entry. Review whether the link should follow the retired entry.",
          affectedIds: retiredLinks,
        });
      }
    }
    if (
      entry.kind === "event"
      && isLoreEntryActive(entry)
      && entry.timelineOrder === null
      && !entry.eraLabel.trim()
    ) {
      issues.push({
        code: "lore-event-undated",
        severity: "warning",
        message: "A timeline event has neither an era label nor an order — it will sink to the end of the timeline.",
        affectedIds: [entry.id],
      });
    }
  }
  return Object.freeze(issues);
}

/**
 * 빈 상태에서 시작할 수 있는 예시 설정 묶음 — 서로 연결된 작은 세계 하나.
 * 전부 origin="example" 이라 작가가 자기 설정을 쓰기 시작하면 한 번에 지울 수 있다.
 * id는 고정 문자열이라 재적용해도 중복이 생기지 않는다(upsert 경로 사용).
 */
export function createWorldLoreExamples(projectId: string): StudioWorldLore {
  const entry = (
    partial: Omit<StudioLoreEntry, "origin" | "aliases" | "summary" | "details" | "eraLabel" | "timelineOrder" | "relatedEntryIds" | "characterIds" | "status" | "version" | "appliesToWorkIds" | "appliesToSeasonLabels"> &
      Partial<StudioLoreEntry>,
  ): StudioLoreEntry =>
    Object.freeze({
      aliases: Object.freeze([]),
      summary: "",
      details: "",
      eraLabel: "",
      timelineOrder: null,
      relatedEntryIds: Object.freeze([]),
      characterIds: Object.freeze([]),
      status: "confirmed" as const,
      version: 1,
      appliesToWorkIds: Object.freeze([]),
      appliesToSeasonLabels: Object.freeze([]),
      ...partial,
      origin: "example" as const,
    });

  const entries: readonly StudioLoreEntry[] = Object.freeze([
    entry({
      id: "example-event-flood",
      kind: "event",
      name: "대침수",
      summary: "옛 도시가 물에 잠긴 사건. 이 세계의 모든 이야기가 여기서 갈린다.",
      eraLabel: "0년",
      timelineOrder: 0,
      relatedEntryIds: Object.freeze(["example-place-library"]),
    }),
    entry({
      id: "example-event-guild",
      kind: "event",
      name: "등불지기 길드 결성",
      summary: "잠긴 도서관에서 책을 건져 올리는 사람들이 처음으로 모였다.",
      eraLabel: "대침수 12년 뒤",
      timelineOrder: 1,
      relatedEntryIds: Object.freeze(["example-faction-guild", "example-place-library"]),
    }),
    entry({
      id: "example-place-library",
      kind: "place",
      name: "침수된 옛 도서관",
      aliases: Object.freeze(["옛 도서관", "물밑 서고"]),
      summary: "간조 때만 꼭대기 층이 드러나는, 세계에서 가장 큰 서고.",
      details: "물에 닿은 책은 기억을 잃는다는 규칙 때문에, 책을 건질 때는 반드시 장갑과 등불이 필요하다.",
      relatedEntryIds: Object.freeze(["example-faction-guild", "example-rule-memory"]),
    }),
    entry({
      id: "example-faction-guild",
      kind: "faction",
      name: "등불지기 길드",
      summary: "잠긴 서고에서 책과 기록을 건져 올리는 잠수부들의 조직.",
      details: "새내기 등불지기는 첫 잠수에서 자기 이름이 적힌 책 한 권을 반드시 건져 와야 한다.",
      relatedEntryIds: Object.freeze(["example-place-library", "example-species-diver"]),
    }),
    entry({
      id: "example-species-diver",
      kind: "species",
      name: "심해인",
      summary: "깊은 물에서 숨을 참는 대신 기억을 태워 버티는 사람들.",
      relatedEntryIds: Object.freeze(["example-rule-memory"]),
    }),
    entry({
      id: "example-artifact-lamp",
      kind: "artifact",
      name: "꺼지지 않는 등불",
      summary: "물속에서도 꺼지지 않는 길드의 상징. 잃어버리면 길드원 자격을 잃는다.",
      relatedEntryIds: Object.freeze(["example-faction-guild"]),
    }),
    entry({
      id: "example-place-sunken-floor",
      kind: "place",
      name: "도서관 아래 잠긴 층",
      summary: "아직 아무도 내려가 본 적 없는 층. 무엇이 있는지는 일부러 정하지 않았다.",
      status: "intentional-gap",
      relatedEntryIds: Object.freeze(["example-place-library"]),
    }),
    entry({
      id: "example-rule-memory",
      kind: "rule",
      name: "물에 닿은 기억은 사라진다",
      summary: "이 세계의 절대 규칙. 물에 젖은 사람·사물·기록은 닿은 만큼의 기억을 잃는다.",
      details: "예외는 아직 확인되지 않았다. 이 규칙을 어기는 장면을 쓰려면 먼저 예외 설정을 항목으로 세워 두는 게 안전하다.",
      status: "speculative",
      relatedEntryIds: Object.freeze(["example-place-library", "example-species-diver"]),
    }),
  ]);

  return Object.freeze({ projectId, entries });
}
