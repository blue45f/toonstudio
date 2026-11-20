import { getAuthUserId } from "@/domains/auth/public/session/auth-session-state";
import type { StudioProjectDiagnosticSource } from "./studio-project-diagnostics";

import { EMPTY_STORY_BIBLE_NARRATIVE } from "./planning/studio-character-profile";

export const STUDIO_PROJECT_DIAGNOSTIC_SOURCE_UPDATED_EVENT =
  "toonspectrum:studio:project-diagnostic-source-updated";
export const STUDIO_PROJECT_DIAGNOSTICS_FAILED_EVENT =
  "toonspectrum:studio:project-diagnostics-failed";

export interface StudioProjectDiagnosticSourceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function storageKey(projectId: string): string {
  return `toonstudio:project-diagnostic-source:v1:${encodeURIComponent(projectId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function parseStudioProjectDiagnosticSource(
  value: unknown,
  expectedProjectId?: string,
): StudioProjectDiagnosticSource | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1
    || typeof value.projectId !== "string"
    || !value.projectId.trim()
    || (expectedProjectId !== undefined && value.projectId !== expectedProjectId)
    || typeof value.capturedAt !== "string"
    || !Number.isFinite(Date.parse(value.capturedAt))
    || !isRecord(value.story)
    || !isRecord(value.story.bible)
    || !Array.isArray(value.story.states)
    || !Array.isArray(value.story.transitions)
    || !Array.isArray(value.productionTasks)
    || !Array.isArray(value.assets)
    || !isRecord(value.reviewSession)
    || !Array.isArray(value.localization)
    || !Array.isArray(value.exportPreflights)
  ) {
    return null;
  }
  const cloned = plainClone(value) as unknown as StudioProjectDiagnosticSource;
  // 구 포맷(서술 묶음이 없는 저장본)은 빈 묶음으로 폴백해, 읽는 쪽이 항상 같은 모양을 보게 한다.
  if (
    !isRecord(value.story.narrative)
    || !Array.isArray(value.story.narrative.profiles)
    || !Array.isArray(value.story.narrative.relations)
  ) {
    return Object.freeze({
      ...cloned,
      story: Object.freeze({ ...cloned.story, narrative: EMPTY_STORY_BIBLE_NARRATIVE }),
    });
  }
  return Object.freeze(cloned);
}

function readStoredRecord(storage: StudioProjectDiagnosticSourceStorage, projectId: string) {
  const raw = storage.getItem(storageKey(projectId));
  if (raw === null) return null;
  try {
    const record: unknown = JSON.parse(raw);
    return isRecord(record) && record.schemaVersion === 1 && record.projectId === projectId ? record : null;
  } catch {
    return null;
  }
}

export function readStudioProjectDiagnosticSource(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
  exportOwner = getAuthUserId(),
): StudioProjectDiagnosticSource | null {
  if (!projectId.trim()) return null;
  const record = readStoredRecord(storage, projectId);
  if (!record) return null;
  const { accountExportPreflights, ...project } = record;
  if (exportOwner !== null) {
    project.exportPreflights = isRecord(accountExportPreflights) && Object.hasOwn(accountExportPreflights, exportOwner)
      ? accountExportPreflights[exportOwner] : [];
  }
  return parseStudioProjectDiagnosticSource(project, projectId);
}

export function writeStudioProjectDiagnosticSource(
  storage: StudioProjectDiagnosticSourceStorage,
  source: StudioProjectDiagnosticSource,
  exportOwner = getAuthUserId(),
  preserveExistingPreflights = false,
): void {
  const parsed = parseStudioProjectDiagnosticSource(source, source.projectId);
  if (!parsed) throw new Error("A structurally valid project diagnostic source is required.");
  const prior = readStoredRecord(storage, source.projectId);
  const accounts = isRecord(prior?.accountExportPreflights) ? prior.accountExportPreflights : {};
  const guest = Array.isArray(prior?.exportPreflights) ? prior.exportPreflights : [];
  // 프로젝트의 다른 항목을 복구하더라도 정상적인 사용자별 출고 점검은 보존한다.
  const currentAccounts = exportOwner === null || preserveExistingPreflights
    ? accounts : { ...accounts, [exportOwner]: parsed.exportPreflights };
  const next = {
    ...parsed,
    exportPreflights: exportOwner === null && !preserveExistingPreflights ? parsed.exportPreflights : guest,
    ...(Object.keys(currentAccounts).length ? { accountExportPreflights: currentAccounts } : {}),
  };
  storage.setItem(storageKey(source.projectId), JSON.stringify(next));
}

export function removeStudioProjectDiagnosticSource(
  storage: StudioProjectDiagnosticSourceStorage,
  projectId: string,
): void {
  if (!projectId.trim()) return;
  storage.removeItem(storageKey(projectId));
}

export function studioProjectDiagnosticSourceStorageKey(projectId: string): string {
  if (!projectId.trim()) throw new Error("Project id is required.");
  return storageKey(projectId);
}
