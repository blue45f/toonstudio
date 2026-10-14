/**
 * 프로젝트 story 뷰(view=world)에 장착되는 세계관 설정(로어)의 저장소.
 *
 * 기획 저장소(studio-planning-store.ts)와 같은 방식이다: 프로젝트별 localStorage 키,
 * 파서로 검증한 스냅샷, 업데이트 이벤트. 시놉시스 저장소가 따로 필요했던 것과 같은
 * 이유로, 세계관 설정도 워크스페이스 문서가 아니라 이 전용 저장소가 정본이다
 * (스튜디오 프로젝트와 production aggregate 는 id 공간·수명주기가 다르다).
 *
 * 빈 프로젝트는 예시를 자동으로 심지 않는다 — 예시는 사용자가 "예시로 시작하기"를
 * 눌렀을 때만 들어간다. ensure 는 빈 상태를 돌려줄 뿐이다.
 */
import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";
import {
  STUDIO_LORE_ENTRY_KINDS,
  STUDIO_LORE_ENTRY_STATUSES,
  normalizeLoreEntryVersion,
  withLoreEntryDefaults,
  type StudioLoreEntry,
  type StudioLoreEntryKind,
  type StudioWorldLore,
} from "./studio-world-lore";

export const STUDIO_WORLD_LORE_UPDATED_EVENT =
  "toonspectrum:studio:world-lore-updated";

export interface StudioWorldLoreState extends StudioWorldLore {
  readonly schemaVersion: 1;
}

export interface StudioWorldLoreEventTarget {
  dispatchEvent(event: Event): boolean;
}

function storageKey(projectId: string): string {
  return `toonstudio:world-lore:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio project id is required.");
  }
  return normalized;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isLoreEntryLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string"
    && value.id.length > 0
    && typeof value.kind === "string"
    && (STUDIO_LORE_ENTRY_KINDS as readonly string[]).includes(value.kind)
    && typeof value.name === "string"
    && isStringArray(value.aliases)
    && typeof value.summary === "string"
    && typeof value.details === "string"
    && typeof value.eraLabel === "string"
    && (value.timelineOrder === null
      || (typeof value.timelineOrder === "number" && Number.isFinite(value.timelineOrder)))
    && isStringArray(value.relatedEntryIds)
    && isStringArray(value.characterIds)
    && (value.origin === "authored" || value.origin === "example")
    // 상태·버전·범위는 상태 3분류 레인에서 추가됐다. 없는 저장본(기존 v1)은
    // 거부하지 않고 기본값(확정·v1·전 범위)으로 정규화해 읽는다(아래 parse).
    // 값이 있으면 형식은 엄격히 본다.
    && (value.status === undefined
      || (typeof value.status === "string"
        && (STUDIO_LORE_ENTRY_STATUSES as readonly string[]).includes(value.status)))
    && (value.version === undefined
      || (typeof value.version === "number" && Number.isFinite(value.version)))
    && (value.appliesToWorkIds === undefined || isStringArray(value.appliesToWorkIds))
    && (value.appliesToSeasonLabels === undefined
      || isStringArray(value.appliesToSeasonLabels))
  );
}

/** 저장본 항목을 런타임 모양으로 정규화한다 — 누락된 상태·버전·범위에 기본값을 채운다. */
function normalizeStoredEntry(value: unknown): StudioLoreEntry {
  const record = value as Record<string, unknown>;
  return withLoreEntryDefaults({
    id: record.id as string,
    kind: record.kind as StudioLoreEntryKind,
    name: record.name as string,
    aliases: record.aliases as readonly string[],
    summary: record.summary as string,
    details: record.details as string,
    eraLabel: record.eraLabel as string,
    timelineOrder: record.timelineOrder as number | null,
    relatedEntryIds: record.relatedEntryIds as readonly string[],
    characterIds: record.characterIds as readonly string[],
    origin: record.origin as StudioLoreEntry["origin"],
    status: record.status as StudioLoreEntry["status"] | undefined,
    version: normalizeLoreEntryVersion(record.version),
    appliesToWorkIds: (record.appliesToWorkIds as readonly string[] | undefined) ?? [],
    appliesToSeasonLabels:
      (record.appliesToSeasonLabels as readonly string[] | undefined) ?? [],
  });
}

export function parseStudioWorldLore(
  value: unknown,
  expectedProjectId?: string,
): StudioWorldLoreState | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !value.projectId.trim()
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || !Array.isArray(value.entries)
    || !value.entries.every(isLoreEntryLike)
  ) {
    return null;
  }
  const cloned = plainClone(value) as unknown as {
    schemaVersion: 1;
    projectId: string;
    entries: unknown[];
  };
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: cloned.projectId,
    entries: Object.freeze(cloned.entries.map(normalizeStoredEntry)),
  });
}

export function readStudioWorldLore(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioWorldLoreState | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioWorldLore(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioWorldLore(
  storage: StudioProjectDiagnosticSourceStorage,
  lore: StudioWorldLore,
  target?: StudioWorldLoreEventTarget,
): StudioWorldLoreState {
  const state: StudioWorldLoreState = { schemaVersion: 1, ...lore };
  const parsed = parseStudioWorldLore(state, lore.projectId);
  if (!parsed) throw new Error("A structurally valid world lore state is required.");
  storage.setItem(storageKey(lore.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(new CustomEvent(STUDIO_WORLD_LORE_UPDATED_EVENT, { detail: parsed }));
  return parsed;
}

/** 저장된 세계관을 돌려주고, 없으면 빈 상태를 만든다(예시는 심지 않는다). */
export function ensureStudioWorldLore(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): StudioWorldLoreState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioWorldLore(storage, normalizedProjectId);
  if (current) return current;
  return writeStudioWorldLore(storage, { projectId: normalizedProjectId, entries: [] });
}

/** 항목 목록 전체를 저장한다 — 허브의 모든 편집(추가·수정·삭제·예시 정리)이 지나는 단일 경로. */
export function saveStudioWorldLoreEntries(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  entries: readonly StudioLoreEntry[],
  target?: StudioWorldLoreEventTarget,
): StudioWorldLoreState {
  const normalizedProjectId = requireProjectId(projectId);
  return writeStudioWorldLore(
    storage,
    { projectId: normalizedProjectId, entries },
    target,
  );
}

export function studioWorldLoreStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}

export type { StudioLoreEntryKind };
