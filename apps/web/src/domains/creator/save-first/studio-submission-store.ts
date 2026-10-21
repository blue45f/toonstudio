export const STUDIO_SUBMISSION_STORAGE_KEY = "toonstudio.submissions.v1";
export const STUDIO_SUBMISSION_UPDATED_EVENT = "toonstudio:submission-updated";

export type StudioSubmissionStatus =
  | "preparing"
  | "package-ready"
  | "uploaded-externally"
  | "under-review"
  | "published"
  | "rejected"
  | "withdrawn";

export interface StudioSubmission {
  readonly id: string;
  readonly projectId: string;
  readonly platform: string;
  readonly presetId: string;
  readonly presetVersion: string;
  readonly sourceRevision: number;
  readonly status: StudioSubmissionStatus;
  readonly packageName: string | null;
  readonly externalUrl: string | null;
  readonly notes: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StudioSubmissionState {
  readonly schemaVersion: 1;
  readonly submissions: readonly StudioSubmission[];
  readonly updatedAt: string;
}

export interface StudioSubmissionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function normalize(value: unknown): StudioSubmission | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || typeof entry.projectId !== "string") return null;
  if (!validTimestamp(entry.createdAt) || !validTimestamp(entry.updatedAt)) return null;
  const statuses = new Set<StudioSubmissionStatus>([
    "preparing", "package-ready", "uploaded-externally", "under-review",
    "published", "rejected", "withdrawn",
  ]);
  if (!statuses.has(entry.status as StudioSubmissionStatus)) return null;
  return Object.freeze({
    id: entry.id,
    projectId: entry.projectId,
    platform: typeof entry.platform === "string" ? entry.platform.slice(0, 120) : "external",
    presetId: typeof entry.presetId === "string" ? entry.presetId.slice(0, 120) : "custom",
    presetVersion: typeof entry.presetVersion === "string" ? entry.presetVersion.slice(0, 40) : "1",
    sourceRevision: Number.isSafeInteger(entry.sourceRevision) ? Number(entry.sourceRevision) : 0,
    status: entry.status as StudioSubmissionStatus,
    packageName: typeof entry.packageName === "string" ? entry.packageName.slice(0, 240) : null,
    externalUrl: typeof entry.externalUrl === "string" ? entry.externalUrl.slice(0, 2_000) : null,
    notes: typeof entry.notes === "string" ? entry.notes.slice(0, 2_000) : "",
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  });
}

export function readStudioSubmissions(storage: StudioSubmissionStorage): StudioSubmissionState {
  const empty = (): StudioSubmissionState => Object.freeze({
    schemaVersion: 1,
    submissions: Object.freeze([]),
    updatedAt: new Date(0).toISOString(),
  });
  const raw = storage.getItem(STUDIO_SUBMISSION_STORAGE_KEY);
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return empty();
    const state = parsed as Record<string, unknown>;
    if (state.schemaVersion !== 1 || !Array.isArray(state.submissions)) return empty();
    return Object.freeze({
      schemaVersion: 1,
      submissions: Object.freeze(state.submissions.map(normalize).filter((entry): entry is StudioSubmission => entry !== null)),
      updatedAt: validTimestamp(state.updatedAt) ? state.updatedAt : new Date(0).toISOString(),
    });
  } catch {
    return empty();
  }
}

function writeStudioSubmissions(
  storage: StudioSubmissionStorage,
  state: StudioSubmissionState,
  target?: EventTarget,
): StudioSubmissionState {
  storage.setItem(STUDIO_SUBMISSION_STORAGE_KEY, JSON.stringify(state));
  target?.dispatchEvent(new CustomEvent(STUDIO_SUBMISSION_UPDATED_EVENT, { detail: state }));
  return state;
}

function generatedId(projectId: string, platform: string, now: string): string {
  let hash = 2_166_136_261;
  const value = `${projectId}\u0000${platform}\u0000${now}`;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `submission-${(hash >>> 0).toString(36)}`;
}

export function createStudioSubmission(
  storage: StudioSubmissionStorage,
  input: {
    readonly projectId: string;
    readonly platform: string;
    readonly presetId: string;
    readonly presetVersion: string;
    readonly sourceRevision: number;
    readonly packageName?: string | null;
    readonly notes?: string;
  },
  options: { readonly now?: string; readonly target?: EventTarget } = {},
): StudioSubmission {
  const now = options.now ?? new Date().toISOString();
  const current = readStudioSubmissions(storage);
  const submission = Object.freeze({
    id: generatedId(input.projectId, input.platform, now),
    projectId: input.projectId,
    platform: input.platform.trim().slice(0, 120) || "external",
    presetId: input.presetId.trim().slice(0, 120) || "custom",
    presetVersion: input.presetVersion.trim().slice(0, 40) || "1",
    sourceRevision: Math.max(0, Math.trunc(input.sourceRevision)),
    status: "package-ready" as const,
    packageName: input.packageName?.trim().slice(0, 240) || null,
    externalUrl: null,
    notes: input.notes?.trim().slice(0, 2_000) || "",
    createdAt: now,
    updatedAt: now,
  });
  writeStudioSubmissions(storage, Object.freeze({
    schemaVersion: 1,
    submissions: Object.freeze([...current.submissions, submission]),
    updatedAt: now,
  }), options.target);
  return submission;
}

export function updateStudioSubmission(
  storage: StudioSubmissionStorage,
  id: string,
  patch: {
    readonly status?: StudioSubmissionStatus;
    readonly externalUrl?: string | null;
    readonly notes?: string;
  },
  options: { readonly now?: string; readonly target?: EventTarget } = {},
): StudioSubmission {
  const now = options.now ?? new Date().toISOString();
  const current = readStudioSubmissions(storage);
  let updated: StudioSubmission | null = null;
  const submissions = current.submissions.map((submission) => {
    if (submission.id !== id) return submission;
    updated = Object.freeze({
      ...submission,
      status: patch.status ?? submission.status,
      externalUrl: patch.externalUrl === undefined
        ? submission.externalUrl
        : patch.externalUrl?.trim().slice(0, 2_000) || null,
      notes: patch.notes === undefined ? submission.notes : patch.notes.trim().slice(0, 2_000),
      updatedAt: now,
    });
    return updated;
  });
  if (!updated) throw new Error("Submission not found.");
  writeStudioSubmissions(storage, Object.freeze({
    schemaVersion: 1,
    submissions: Object.freeze(submissions),
    updatedAt: now,
  }), options.target);
  return updated;
}

export function studioSubmissionsForProject(
  storage: StudioSubmissionStorage,
  projectId: string,
): readonly StudioSubmission[] {
  return readStudioSubmissions(storage).submissions.filter((submission) => submission.projectId === projectId);
}

/**
 * 프로젝트 패키지 가져오기 전용 복원 (C5 왕복 무결성, 2026-10-22).
 *
 * 패키지의 distribution/submissions.json 원본 항목들을 새 프로젝트에 붙여
 * 되살린다. 패키지 가져오기가 제출 기록을 요구만 하고 버리던 간극의 해소다.
 * - 원본 projectId가 sourceProjectId와 다른 항목은 다른 프로젝트의 기록이라
 *   복원하지 않는다(남의 기록을 새 프로젝트에 붙이지 않음).
 * - 깨진 항목(normalize 탈락)은 건너뛴다 — 패키지 전체를 거부할 사유는
 *   아니고, 살아 있는 기록만 되살리는 것이 백업 복원의 목적에 맞다.
 * - id는 원본을 유지하되, 이미 저장소에 같은 id가 있으면(같은 패키지 재가져오기
 *   등) 새 프로젝트 id를 붙여 재발급한다 — id로 찾는 갱신이 엉뚱한 기록을
 *   건드리지 않게 하기 위해서다.
 * - createdAt·updatedAt·상태·메모 등 내용은 원본 그대로 보존한다.
 */
export function restoreStudioSubmissionsForImportedProject(
  storage: StudioSubmissionStorage,
  input: {
    readonly sourceProjectId: string;
    readonly importedProjectId: string;
    readonly entries: readonly unknown[];
  },
  options: { readonly now?: string; readonly target?: EventTarget } = {},
): readonly StudioSubmission[] {
  const current = readStudioSubmissions(storage);
  const usedIds = new Set(current.submissions.map((submission) => submission.id));
  const restored: StudioSubmission[] = [];
  for (const entry of input.entries) {
    const normalized = normalize(entry);
    if (!normalized || normalized.projectId !== input.sourceProjectId) continue;
    let id = normalized.id;
    if (usedIds.has(id)) {
      id = `${normalized.id}--${input.importedProjectId}`.slice(0, 200);
      if (usedIds.has(id)) continue;
    }
    usedIds.add(id);
    restored.push(Object.freeze({ ...normalized, id, projectId: input.importedProjectId }));
  }
  if (restored.length === 0) return Object.freeze([]);
  const now = options.now ?? new Date().toISOString();
  writeStudioSubmissions(storage, Object.freeze({
    schemaVersion: 1,
    submissions: Object.freeze([...current.submissions, ...restored]),
    updatedAt: now,
  }), options.target);
  return Object.freeze(restored);
}
