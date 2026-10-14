/**
 * 세계관 위키 공개 설정의 저장소 — 세계관 로어 저장소와 같은 방식이다:
 * 프로젝트(바이블 저장 키)별 localStorage 키, 엄격 파서, 업데이트 이벤트.
 *
 * 공개 설정은 바이블 본체와 수명주기가 다르므로 바이블 문서에 섞지 않고 이 전용
 * 저장소가 정본이다. 서버 게시(작품 상세 API로 내보내기)는 별도 계약이 필요해
 * 이 저장소의 범위 밖이며, 그 전까지 공개 뷰는 이 설정에서 로컬로 생성된다.
 */
import {
  emptyWikiSettings,
  normalizeWikiBoundary,
  normalizeWikiEntrySetting,
  type StudioWikiSettings,
} from "./studio-world-wiki";

export const STUDIO_WORLD_WIKI_UPDATED_EVENT =
  "toonspectrum:studio:world-wiki-updated";

export interface StudioWorldWikiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StudioWorldWikiEventTarget {
  dispatchEvent(event: Event): boolean;
}

export interface StudioWorldWikiState extends StudioWikiSettings {
  readonly schemaVersion: 1;
}

function storageKey(projectId: string): string {
  return `toonstudio:world-wiki:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireProjectId(projectId: string): string {
  const normalized = projectId.trim();
  if (!normalized) throw new Error("A valid Studio project id is required.");
  return normalized;
}

export function parseStudioWorldWikiSettings(
  value: unknown,
  expectedProjectId?: string,
): StudioWorldWikiState | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !value.projectId.trim()
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || !Array.isArray(value.entries)
  ) {
    return null;
  }
  const entries = [];
  const seen = new Set<string>();
  for (const candidate of value.entries) {
    const setting = normalizeWikiEntrySetting(candidate);
    if (!setting || seen.has(setting.sourceId)) return null;
    seen.add(setting.sourceId);
    entries.push(setting);
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: value.projectId,
    spoilerThroughEpisode: normalizeWikiBoundary(value.spoilerThroughEpisode),
    entries: Object.freeze(entries),
  });
}

export function readStudioWorldWikiSettings(
  storage: StudioWorldWikiStorage,
  projectId: string,
): StudioWorldWikiState | null {
  if (!projectId.trim()) return null;
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    return parseStudioWorldWikiSettings(JSON.parse(raw) as unknown, projectId);
  } catch {
    return null;
  }
}

export function writeStudioWorldWikiSettings(
  storage: StudioWorldWikiStorage,
  settings: StudioWikiSettings,
  target?: StudioWorldWikiEventTarget,
): StudioWorldWikiState {
  const state: StudioWorldWikiState = {
    schemaVersion: 1,
    projectId: settings.projectId,
    spoilerThroughEpisode: normalizeWikiBoundary(settings.spoilerThroughEpisode),
    entries: settings.entries
      .map((entry) => normalizeWikiEntrySetting(entry))
      .filter((entry) => entry !== null),
  };
  const parsed = parseStudioWorldWikiSettings(state, settings.projectId);
  if (!parsed) throw new Error("A structurally valid world wiki settings state is required.");
  storage.setItem(storageKey(settings.projectId), JSON.stringify(parsed));
  target?.dispatchEvent(
    new CustomEvent(STUDIO_WORLD_WIKI_UPDATED_EVENT, { detail: parsed }),
  );
  return parsed;
}

/** 저장된 설정을 돌려주고, 없으면 전부 비공개인 빈 설정을 만든다(자동 공개는 없다). */
export function ensureStudioWorldWikiSettings(
  storage: StudioWorldWikiStorage,
  projectId: string,
): StudioWorldWikiState {
  const normalizedProjectId = requireProjectId(projectId);
  const current = readStudioWorldWikiSettings(storage, normalizedProjectId);
  if (current) return current;
  return writeStudioWorldWikiSettings(storage, emptyWikiSettings(normalizedProjectId));
}

export function studioWorldWikiStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}
