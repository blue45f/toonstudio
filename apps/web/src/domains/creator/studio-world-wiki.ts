/**
 * 세계관 위키 공개 모델 — 바이블 항목별 공개 범위 + 스포일러 회차 경계 (F-1).
 *
 * 왜 별도 층인가 (현재 상태 실측, 2026-10-14 main):
 * - 스토리 바이블·프로덕션 바이블·캐릭터 바이블 어디에도 "독자에게 공개해도 되는가"와
 *   "몇 화부터 공개해도 스포일러가 아닌가"를 적는 필드가 없다. 작품 상세(TitleDetailPage)에도
 *   설정 공개 표면이 없다. 팬 위키 수요를 공식 데이터로 흡수하려면 이 층이 먼저 필요하다.
 * - 그래서 공개 설정은 바이블 스키마를 건드리지 않는 사이드카로 둔다. 캐릭터 프로필과
 *   세계관 로어가 바이블 옆에 optional 로 붙은 것과 같은 패턴이라, 기존 저장본·연속성
 *   엔진·스키마(strict)는 그대로 유효하다.
 *
 * 안전 원칙 (판정: 경계 회차 이후 설정이 공개 뷰에 나타나지 않음):
 * - 기본값은 비공개다. 설정 행이 없는 항목은 공개 뷰에 절대 나타나지 않는다(fail-closed).
 * - 공개로 지정해도 revealEpisode(설정이 처음 밝혀지는 회차)가 공개 경계
 *   spoilerThroughEpisode 보다 크면 공개 뷰에서 통째로 빠진다. 이름·별칭·요약·상세는
 *   물론, 다른 공개 항목의 "관련 항목" 링크에서도 걷어낸다 — 숨긴 항목의 이름이
 *   링크 칩으로 새는 것까지 막는 게 이 모델의 핵심 보장이다.
 * - 공개 뷰 산출물에는 숨긴 항목의 어떤 문자열도 들어가지 않는다. 숨김은 개수(숫자)로만
 *   보고한다.
 */
import type { StudioCharacterBible } from "./studio-character-bible";
import type {
  StudioProductionBible,
  StudioProductionBibleEntryKind,
} from "./studio-production-bible";
import type { StudioStoryBible } from "./studio-story-bible";

export const STUDIO_WIKI_VISIBILITIES = ["private", "public"] as const;
export type StudioWikiVisibility = (typeof STUDIO_WIKI_VISIBILITIES)[number];

/** 위키가 묶는 원본 종류 — 바이블 3종의 항목 종류를 한 공간으로 편다. */
export const STUDIO_WIKI_SOURCE_KINDS = [
  "character",
  "scene",
  "location",
  "prop",
  "fact",
] as const;
export type StudioWikiSourceKind = (typeof STUDIO_WIKI_SOURCE_KINDS)[number];

export const STUDIO_WIKI_KIND_LABELS: Readonly<
  Record<StudioWikiSourceKind, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  character: Object.freeze({ ko: "캐릭터", en: "Characters" }),
  scene: Object.freeze({ ko: "장면", en: "Scenes" }),
  location: Object.freeze({ ko: "장소", en: "Places" }),
  prop: Object.freeze({ ko: "소품", en: "Items" }),
  fact: Object.freeze({ ko: "설정·사실", en: "Facts" }),
});

const SOURCE_KIND_SET = new Set<string>(STUDIO_WIKI_SOURCE_KINDS);
const VISIBILITY_SET = new Set<string>(STUDIO_WIKI_VISIBILITIES);

/** 바이블 원본을 위키가 읽는 통합 모양으로 편 항목. 원본 스키마는 건드리지 않는다. */
export interface StudioWikiSourceEntry {
  readonly id: string;
  readonly kind: StudioWikiSourceKind;
  readonly name: string;
  readonly aliases: readonly string[];
  /** 한 줄 요약 — 공개 카드의 첫 문장. */
  readonly summary: string;
  /** 상세 설명 — 공개 본문. */
  readonly details: string;
  /** 명시 연결(원본 id). 공개 뷰에서는 공개된 상대만 남는다. */
  readonly relatedIds: readonly string[];
}

/** 항목별 공개 설정 — 작가가 명시로만 만든다. */
export interface StudioWikiEntrySetting {
  readonly sourceId: string;
  readonly visibility: StudioWikiVisibility;
  /**
   * 이 설정이 작품에서 처음 밝혀지는 회차(1부터). null이면 회차와 무관한 기본 설정이라
   * 경계 검사를 받지 않는다. 경계보다 크면 스포일러로 판정해 공개 뷰에서 제외한다.
   */
  readonly revealEpisode: number | null;
}

export interface StudioWikiSettings {
  readonly projectId: string;
  /** 공개 경계 — 이 회차까지 밝혀진 설정만 공개한다. 0이면 회차 무관 항목만 공개된다. */
  readonly spoilerThroughEpisode: number;
  readonly entries: readonly StudioWikiEntrySetting[];
}

/** 공개 뷰 항목 — 숨긴 항목의 문자열이 섞일 수 없는, 이미 정제된 모양. */
export interface StudioPublicWikiEntry {
  readonly id: string;
  readonly kind: StudioWikiSourceKind;
  readonly name: string;
  readonly aliases: readonly string[];
  readonly summary: string;
  readonly details: string;
  readonly revealEpisode: number | null;
  /** 공개된 관련 항목만 남긴 링크. 대상이 숨겨졌으면 여기에도 없다. */
  readonly related: readonly {
    readonly id: string;
    readonly name: string;
    readonly kind: StudioWikiSourceKind;
  }[];
}

export interface StudioPublicWikiSection {
  readonly kind: StudioWikiSourceKind;
  readonly label: string;
  readonly entries: readonly StudioPublicWikiEntry[];
}

export interface StudioPublicWiki {
  readonly projectId: string;
  readonly spoilerThroughEpisode: number;
  readonly sections: readonly StudioPublicWikiSection[];
  readonly entries: readonly StudioPublicWikiEntry[];
  readonly publicCount: number;
  /** 공개로 지정했지만 경계 뒤라 숨긴 수 — 개수만 보고한다(이름은 보고하지 않는다). */
  readonly spoilerHiddenCount: number;
  /** 비공개로 지정해 숨긴 수. */
  readonly privateHiddenCount: number;
  /** 공개 설정 자체가 없어 기본 비공개로 숨긴 수. */
  readonly unconfiguredHiddenCount: number;
}

export interface StudioWikiSettingsIssue {
  readonly code:
    | "boundary-invalid"
    | "setting-duplicate"
    | "setting-unknown-source"
    | "reveal-invalid"
    | "source-duplicate"
    | "source-kind-unknown";
  readonly sourceId: string | null;
  readonly message: string;
}

function cleanEpisode(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const episode = Math.trunc(value);
  return episode >= 1 ? episode : null;
}

/** 경계 정규화 — 0 이상의 정수. 잘못된 값은 0(가장 보수적)으로 접는다. */
export function normalizeWikiBoundary(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}

export function emptyWikiSettings(projectId: string): StudioWikiSettings {
  return Object.freeze({
    projectId,
    spoilerThroughEpisode: 0,
    entries: Object.freeze([]),
  });
}

export function normalizeWikiEntrySetting(
  value: unknown,
): StudioWikiEntrySetting | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.sourceId !== "string" || !record.sourceId.trim()) return null;
  if (
    typeof record.visibility !== "string"
    || !VISIBILITY_SET.has(record.visibility)
  ) {
    return null;
  }
  return Object.freeze({
    sourceId: record.sourceId,
    visibility: record.visibility as StudioWikiVisibility,
    revealEpisode:
      record.revealEpisode === null ? null : cleanEpisode(record.revealEpisode),
  });
}

/** 설정을 넣는다 — 같은 sourceId가 있으면 교체, 없으면 끝에 붙인다. */
export function upsertWikiEntrySetting(
  settings: StudioWikiSettings,
  setting: StudioWikiEntrySetting,
): StudioWikiSettings {
  const exists = settings.entries.some((entry) => entry.sourceId === setting.sourceId);
  const entries = exists
    ? settings.entries.map((entry) => (entry.sourceId === setting.sourceId ? setting : entry))
    : [...settings.entries, setting];
  return Object.freeze({ ...settings, entries: Object.freeze(entries) });
}

export function setWikiEntryVisibility(
  settings: StudioWikiSettings,
  sourceId: string,
  visibility: StudioWikiVisibility,
): StudioWikiSettings {
  const current = settings.entries.find((entry) => entry.sourceId === sourceId);
  return upsertWikiEntrySetting(settings, {
    sourceId,
    visibility,
    revealEpisode: current?.revealEpisode ?? null,
  });
}

export function setWikiEntryRevealEpisode(
  settings: StudioWikiSettings,
  sourceId: string,
  revealEpisode: number | null,
): StudioWikiSettings {
  const current = settings.entries.find((entry) => entry.sourceId === sourceId);
  return upsertWikiEntrySetting(settings, {
    sourceId,
    visibility: current?.visibility ?? "private",
    revealEpisode: revealEpisode === null ? null : cleanEpisode(revealEpisode),
  });
}

export function setWikiSpoilerBoundary(
  settings: StudioWikiSettings,
  spoilerThroughEpisode: number,
): StudioWikiSettings {
  return Object.freeze({
    ...settings,
    spoilerThroughEpisode: normalizeWikiBoundary(spoilerThroughEpisode),
  });
}

/** 한 항목의 공개 여부 — 이 판정이 공개 뷰 생성의 유일한 관문이다. */
export function isWikiEntryPublic(
  setting: StudioWikiEntrySetting | undefined,
  spoilerThroughEpisode: number,
): boolean {
  if (!setting || setting.visibility !== "public") return false;
  if (setting.revealEpisode === null) return true;
  return setting.revealEpisode <= normalizeWikiBoundary(spoilerThroughEpisode);
}

/** 프로덕션 바이블(장면·장소·소품) → 위키 원본. 설명 첫 문장을 요약으로 쓴다. */
export function wikiSourcesFromProductionBible(
  bible: StudioProductionBible,
): readonly StudioWikiSourceEntry[] {
  return Object.freeze(
    bible.entries.map((entry) => {
      const details = entry.description.trim();
      const summary = details.split(/(?<=[.!?。])\s+/u)[0]?.slice(0, 160) ?? "";
      const relatedIds = [
        ...new Set([
          ...entry.linkedLocationIds,
          ...entry.linkedPropIds,
          ...entry.linkedCharacterIds,
        ]),
      ].filter((id) => id !== entry.id);
      return Object.freeze({
        id: entry.id,
        kind: entry.kind as StudioProductionBibleEntryKind,
        name: entry.name,
        aliases: Object.freeze([...entry.aliases]),
        summary: summary === details ? "" : summary,
        details,
        relatedIds: Object.freeze(relatedIds),
      });
    }),
  );
}

/** 캐릭터 바이블 → 위키 원본. 역할이 요약, 외형·의상·말투·목표가 상세가 된다. */
export function wikiSourcesFromCharacterBible(
  bible: StudioCharacterBible,
): readonly StudioWikiSourceEntry[] {
  return Object.freeze(
    bible.characters.map((character) =>
      Object.freeze({
        id: character.id,
        kind: "character" as const,
        name: character.name,
        aliases: Object.freeze([] as string[]),
        summary: character.role.trim(),
        details: [
          character.appearance,
          character.costume,
          character.voice,
          character.goal,
        ]
          .map((part) => part.trim())
          .filter(Boolean)
          .join("\n"),
        relatedIds: Object.freeze([] as string[]),
      }),
    ),
  );
}

/** 스토리 바이블(연속성) → 위키 원본. 캐릭터·장소·사실까지 한 공간으로 편다. */
export function wikiSourcesFromStoryBible(
  bible: StudioStoryBible,
): readonly StudioWikiSourceEntry[] {
  const characters: StudioWikiSourceEntry[] = bible.characters.map((character) =>
    Object.freeze({
      id: character.id,
      kind: "character" as const,
      name: character.name,
      aliases: Object.freeze([...character.aliases]),
      summary: "",
      details: "",
      relatedIds: Object.freeze([] as string[]),
    }),
  );
  const locations: StudioWikiSourceEntry[] = bible.locations.map((location) =>
    Object.freeze({
      id: location.id,
      kind: "location" as const,
      name: location.name,
      aliases: Object.freeze([] as string[]),
      summary: "",
      details: "",
      relatedIds: Object.freeze([] as string[]),
    }),
  );
  const facts: StudioWikiSourceEntry[] = bible.facts.map((fact) =>
    Object.freeze({
      id: fact.id,
      kind: "fact" as const,
      name: fact.label,
      aliases: Object.freeze([] as string[]),
      summary: "",
      details: "",
      relatedIds: Object.freeze(
        [
          ...fact.characterIds,
          ...(fact.locationId ? [fact.locationId] : []),
        ].filter((id) => id !== fact.id),
      ),
    }),
  );
  return Object.freeze([...characters, ...locations, ...facts]);
}

/**
 * 공개 뷰를 만든다. 숨긴 항목은 산출물 어디에도 문자열로 남지 않는다:
 * 목록·섹션·관련 링크 어디에도 넣지 않고, 개수만 센다.
 */
export function buildPublicWiki(
  sources: readonly StudioWikiSourceEntry[],
  settings: StudioWikiSettings,
): StudioPublicWiki {
  const boundary = normalizeWikiBoundary(settings.spoilerThroughEpisode);
  const settingBySourceId = new Map<string, StudioWikiEntrySetting>();
  for (const setting of settings.entries) {
    if (!settingBySourceId.has(setting.sourceId)) {
      settingBySourceId.set(setting.sourceId, setting);
    }
  }

  const uniqueSources: StudioWikiSourceEntry[] = [];
  const seenSourceIds = new Set<string>();
  for (const source of sources) {
    if (seenSourceIds.has(source.id)) continue;
    seenSourceIds.add(source.id);
    uniqueSources.push(source);
  }

  let spoilerHiddenCount = 0;
  let privateHiddenCount = 0;
  let unconfiguredHiddenCount = 0;
  const publicSources: StudioWikiSourceEntry[] = [];
  for (const source of uniqueSources) {
    const setting = settingBySourceId.get(source.id);
    if (!setting) {
      unconfiguredHiddenCount += 1;
      continue;
    }
    if (setting.visibility !== "public") {
      privateHiddenCount += 1;
      continue;
    }
    if (setting.revealEpisode !== null && setting.revealEpisode > boundary) {
      spoilerHiddenCount += 1;
      continue;
    }
    publicSources.push(source);
  }

  const publicById = new Map(publicSources.map((source) => [source.id, source]));
  const entries: StudioPublicWikiEntry[] = publicSources.map((source) => {
    const setting = settingBySourceId.get(source.id);
    const related = source.relatedIds
      .filter((id) => id !== source.id && publicById.has(id))
      .map((id) => {
        const target = publicById.get(id) as StudioWikiSourceEntry;
        return Object.freeze({ id: target.id, name: target.name, kind: target.kind });
      });
    return Object.freeze({
      id: source.id,
      kind: source.kind,
      name: source.name,
      aliases: Object.freeze([...source.aliases]),
      summary: source.summary,
      details: source.details,
      revealEpisode: setting?.revealEpisode ?? null,
      related: Object.freeze(related),
    });
  });

  const sorted = [...entries].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, "ko");
    return byName !== 0 ? byName : left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });

  const sections: StudioPublicWikiSection[] = [];
  for (const kind of STUDIO_WIKI_SOURCE_KINDS) {
    const kindEntries = sorted.filter((entry) => entry.kind === kind);
    if (kindEntries.length === 0) continue;
    sections.push(
      Object.freeze({
        kind,
        label: STUDIO_WIKI_KIND_LABELS[kind].ko,
        entries: Object.freeze(kindEntries),
      }),
    );
  }

  return Object.freeze({
    projectId: settings.projectId,
    spoilerThroughEpisode: boundary,
    sections: Object.freeze(sections),
    entries: Object.freeze(sorted),
    publicCount: sorted.length,
    spoilerHiddenCount,
    privateHiddenCount,
    unconfiguredHiddenCount,
  });
}

export function validateWikiSettings(
  settings: StudioWikiSettings,
  sources?: readonly StudioWikiSourceEntry[],
): readonly StudioWikiSettingsIssue[] {
  const issues: StudioWikiSettingsIssue[] = [];
  if (
    typeof settings.spoilerThroughEpisode !== "number"
    || !Number.isInteger(settings.spoilerThroughEpisode)
    || settings.spoilerThroughEpisode < 0
  ) {
    issues.push({
      code: "boundary-invalid",
      sourceId: null,
      message: "공개 경계 회차는 0 이상의 정수여야 해요.",
    });
  }
  const seenSettings = new Set<string>();
  for (const setting of settings.entries) {
    if (seenSettings.has(setting.sourceId)) {
      issues.push({
        code: "setting-duplicate",
        sourceId: setting.sourceId,
        message: "같은 항목의 공개 설정이 두 번 들어 있어요.",
      });
    }
    seenSettings.add(setting.sourceId);
    if (
      setting.revealEpisode !== null
      && (!Number.isInteger(setting.revealEpisode) || setting.revealEpisode < 1)
    ) {
      issues.push({
        code: "reveal-invalid",
        sourceId: setting.sourceId,
        message: "처음 밝혀지는 회차는 1 이상의 정수이거나 비워 두어야 해요.",
      });
    }
  }
  if (sources) {
    const sourceIds = new Set<string>();
    for (const source of sources) {
      if (sourceIds.has(source.id)) {
        issues.push({
          code: "source-duplicate",
          sourceId: source.id,
          message: "원본 항목 ID가 겹쳐요. 먼저 들어온 항목만 위키가 봅니다.",
        });
      }
      sourceIds.add(source.id);
      if (!SOURCE_KIND_SET.has(source.kind)) {
        issues.push({
          code: "source-kind-unknown",
          sourceId: source.id,
          message: "알 수 없는 항목 종류예요.",
        });
      }
    }
    for (const setting of settings.entries) {
      if (!sourceIds.has(setting.sourceId)) {
        issues.push({
          code: "setting-unknown-source",
          sourceId: setting.sourceId,
          message: "공개 설정이 가리키는 원본 항목이 없어요.",
        });
      }
    }
  }
  return Object.freeze(issues);
}
