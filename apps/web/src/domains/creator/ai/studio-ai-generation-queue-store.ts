import {
  canApplyStudioAiJob,
  createStudioAiJob,
  studioAiJobUserState,
  transitionStudioAiJob,
  type StudioAiApplicationMode,
  type StudioAiCostClass,
  type StudioAiJob,
  type StudioAiJobApplication,
  type StudioAiJobPreview,
  type StudioAiPrivacyClass,
  type StudioAiSkillId,
} from "../studio-ai-job";
import { hydrateStudioPreference } from "../studio-cuttoon-editor/runtime/studio-preference-hydration";

import {
  MAX_STORED_AI_QUEUE_JOBS,
  parsePersistedQueuePayload,
  STUDIO_AI_QUEUE_SKILL_META,
  synthesizeNonDestructiveDraftArtifact,
  type PersistedQueuePayload,
  type StudioAiQueueArtifact,
  type StudioAiQueueRunOutput,
} from "./studio-ai-generation-queue-artifacts";

export {
  STUDIO_AI_QUEUE_SKILL_META,
  synthesizeNonDestructiveDraftArtifact,
  type StudioAiQueueArtifact,
  type StudioAiQueueRunOutput,
};

export interface StudioAiQueueSnapshot {
  readonly schemaVersion: 1;
  readonly documentId: string;
  readonly jobs: readonly StudioAiJob[];
  readonly artifacts: Readonly<Record<string, StudioAiQueueArtifact>>;
  readonly hydrated: boolean;
  readonly storageError: string | null;
}

export interface CreateStudioAiQueueJobInput {
  readonly id?: string;
  readonly skill: StudioAiSkillId;
  readonly prompt: string;
  readonly providerId?: string;
  readonly privacy?: StudioAiPrivacyClass;
  readonly cost?: StudioAiCostClass;
  readonly estimatedCredits?: number;
  readonly inputSnapshotId?: string;
  readonly selectionId?: string;
  readonly references?: readonly string[];
  readonly seed?: number;
  readonly now?: () => string;
}

export interface StudioAiQueueApplyResult {
  readonly ok: boolean;
  readonly job?: StudioAiJob;
  readonly error?: string;
}

export type StudioAiQueueApplyExecutor = (input: {
  readonly job: StudioAiJob;
  readonly artifact: StudioAiQueueArtifact | null;
  readonly mode: StudioAiApplicationMode;
}) =>
  | Promise<StudioAiJobApplication | null>
  | StudioAiJobApplication
  | null;

export type StudioAiQueueJobRunner = (input: {
  readonly job: StudioAiJob;
  readonly signal: AbortSignal;
  readonly reportProgress: (value: number) => void;
}) => Promise<StudioAiQueueRunOutput>;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

const STORAGE_KEY_PREFIX = "toonstudio.ai-generation-queue.v1:";

function defaultNow(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function resolveDefaultStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== "undefined" && "localStorage" in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export interface StudioAiGenerationQueueStore {
  readonly documentId: string;
  subscribe(listener: () => void): () => void;
  getSnapshot(): StudioAiQueueSnapshot;
  hydrate(): Promise<boolean>;
  createDraft(input: CreateStudioAiQueueJobInput): StudioAiJob;
  requestConfirmation(jobId: string): StudioAiJob;
  submitForConfirmation(input: CreateStudioAiQueueJobInput): StudioAiJob;
  confirm(jobId: string, accepted: boolean): StudioAiJob;
  start(jobId: string): StudioAiJob;
  reportProgress(jobId: string, value: number): StudioAiJob;
  deliverPreview(
    jobId: string,
    preview: StudioAiJobPreview,
    artifact: StudioAiQueueArtifact,
  ): StudioAiJob;
  approve(jobId: string): StudioAiJob;
  apply(
    jobId: string,
    mode: StudioAiApplicationMode,
    executor: StudioAiQueueApplyExecutor,
  ): Promise<StudioAiQueueApplyResult>;
  fail(jobId: string, code: string, message: string): StudioAiJob;
  retry(jobId: string): StudioAiJob;
  cancel(jobId: string, reason?: string): StudioAiJob;
  removeJob(jobId: string): void;
  clearSettled(): void;
  executeQueuedJob(
    jobId: string,
    options?: {
      readonly runner?: StudioAiQueueJobRunner;
      readonly stepDelayMs?: number;
    },
  ): Promise<StudioAiJob>;
}

export function createStudioAiGenerationQueueStore(options: {
  readonly documentId: string;
  readonly storage?: StorageLike | null;
  readonly now?: () => string;
}): StudioAiGenerationQueueStore {
  const documentId = options.documentId.trim() || "default-document";
  const storageKey = `${STORAGE_KEY_PREFIX}${documentId}`;
  const storage = options.storage !== undefined ? options.storage : resolveDefaultStorage();
  const now = options.now ?? defaultNow;

  const listeners = new Set<() => void>();
  const activeControllers = new Map<string, AbortController>();
  let editRevision = 0;
  let lastWrittenRaw: string | null = null;
  let hasRestoredStoredQueue = false;

  let snapshot: StudioAiQueueSnapshot = Object.freeze({
    schemaVersion: 1,
    documentId,
    jobs: Object.freeze([]),
    artifacts: Object.freeze({}),
    hydrated: false,
    storageError: null,
  });

  const emit = () => {
    for (const listener of listeners) listener();
  };

  const readStoredQueue = (raw: string | null): PersistedQueuePayload => {
    if (raw !== null) {
      const envelope: unknown = JSON.parse(raw);
      if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)
        || !("schemaVersion" in envelope) || envelope.schemaVersion !== 1
        || ("documentId" in envelope && envelope.documentId !== documentId)
        || !("jobs" in envelope) || !Array.isArray(envelope.jobs)
        || !("artifacts" in envelope) || !envelope.artifacts || typeof envelope.artifacts !== "object" || Array.isArray(envelope.artifacts)) {
        throw new Error("복원할 수 없는 다른 문서 또는 미지원 대기열 기록입니다.");
      }
      const restored = parsePersistedQueuePayload(raw, now);
      if (restored.jobs.length !== Math.min(envelope.jobs.length, MAX_STORED_AI_QUEUE_JOBS)) {
        throw new Error("손상된 작업이 있는 대기열 원본을 보존합니다.");
      }
      return restored;
    }
    return parsePersistedQueuePayload(null, now);
  };

  const persistCurrent = (): boolean => {
    if (!storage) return true;
    const raw = storage.getItem(storageKey);
    readStoredQueue(raw);
    // 복원 전에 만든 초안으로 이전 대기열을 덮지 않고 hydrate에서 두 사본을 합친다.
    if (!hasRestoredStoredQueue && raw !== null && raw !== lastWrittenRaw) return false;
    const payload: PersistedQueuePayload & { readonly documentId: string } = {
      schemaVersion: 1,
      documentId,
      jobs: snapshot.jobs.slice(0, MAX_STORED_AI_QUEUE_JOBS),
      artifacts: snapshot.artifacts,
    };
    const serialized = JSON.stringify(payload);
    storage.setItem(storageKey, serialized);
    if (storage.getItem(storageKey) !== serialized) throw new Error("대기열 저장 결과를 확인하지 못했습니다.");
    lastWrittenRaw = serialized;
    return true;
  };

  const commitState = (
    nextJobs: readonly StudioAiJob[],
    nextArtifacts: Readonly<Record<string, StudioAiQueueArtifact>> = snapshot.artifacts,
    extra: { readonly hydrated?: boolean; readonly storageError?: string | null } = {},
    skipPersist = false,
  ) => {
    const jobs = nextJobs.slice(0, MAX_STORED_AI_QUEUE_JOBS);
    const retainedIds = new Set(jobs.map((job) => job.id));
    snapshot = Object.freeze({
      schemaVersion: 1,
      documentId,
      jobs: Object.freeze(jobs),
      artifacts: Object.freeze(Object.fromEntries(Object.entries(nextArtifacts).filter(([id]) => retainedIds.has(id)))),
      hydrated: extra.hydrated ?? snapshot.hydrated,
      storageError: extra.storageError !== undefined ? extra.storageError : snapshot.storageError,
    });
    if (!skipPersist && storage) {
      try {
        if (persistCurrent() && snapshot.storageError !== null) {
          snapshot = Object.freeze({ ...snapshot, storageError: null });
        }
      } catch {
        snapshot = Object.freeze({
          ...snapshot,
          storageError: "대기열 상태를 기기에 저장하지 못했습니다. 현재 화면에서는 계속 작업할 수 있습니다.",
        });
      }
    }
    emit();
  };

  const findJobOrThrow = (jobId: string): StudioAiJob => {
    const found = snapshot.jobs.find((job) => job.id === jobId);
    if (!found) throw new Error(`AI 작업을 찾을 수 없습니다: ${jobId}`);
    return found;
  };

  const replaceJob = (
    updated: StudioAiJob,
    artifactUpdate?: { readonly jobId: string; readonly artifact?: StudioAiQueueArtifact | null },
  ): StudioAiJob => {
    editRevision += 1;
    const nextJobs = snapshot.jobs.map((job) => (job.id === updated.id ? updated : job));
    const nextArtifacts = { ...snapshot.artifacts };
    if (artifactUpdate) {
      if (artifactUpdate.artifact) nextArtifacts[artifactUpdate.jobId] = artifactUpdate.artifact;
      else delete nextArtifacts[artifactUpdate.jobId];
    }
    commitState(nextJobs, nextArtifacts);
    return updated;
  };

  const store: StudioAiGenerationQueueStore = {
    documentId,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      return snapshot;
    },

    async hydrate() {
      const revisionAtStart = hasRestoredStoredQueue ? editRevision : 0;
      const [settled] = await Promise.allSettled([
        Promise.resolve().then(() =>
          storage ? readStoredQueue(storage.getItem(storageKey)) : { schemaVersion: 1 as const, jobs: [], artifacts: {} },
        ),
      ]);
      if (settled?.status !== "fulfilled") {
        commitState(snapshot.jobs, snapshot.artifacts,
          { hydrated: true, storageError: "저장된 대기열을 복원하지 못해 현재 초안을 메모리에 보존했습니다." }, true);
        return false;
      }
      hasRestoredStoredQueue = true;
      if (editRevision !== revisionAtStart) {
        const currentIds = new Set(snapshot.jobs.map((job) => job.id));
        commitState(
          [...snapshot.jobs, ...settled.value.jobs.filter((job) => !currentIds.has(job.id))],
          { ...settled.value.artifacts, ...snapshot.artifacts },
          { hydrated: true },
          true,
        );
      }
      const ok = await hydrateStudioPreference(
        settled!,
        editRevision === revisionAtStart,
        (saved) => {
          commitState(saved.jobs, saved.artifacts, { hydrated: true, storageError: null }, true);
        },
        async () => { persistCurrent(); },
      );
      if (!ok) {
        commitState(
          snapshot.jobs,
          snapshot.artifacts,
          { hydrated: true, storageError: "저장된 대기열을 복원하지 못해 새 대기열로 시작했습니다." },
          true,
        );
      } else if (!snapshot.hydrated || snapshot.storageError !== null) {
        commitState(snapshot.jobs, snapshot.artifacts, { hydrated: true, storageError: null }, true);
      }
      return ok;
    },

    createDraft(input) {
      const meta = STUDIO_AI_QUEUE_SKILL_META[input.skill];
      const privacy: StudioAiPrivacyClass = input.privacy ?? "local";
      const cost: StudioAiCostClass =
        input.cost ?? (privacy === "local" ? "free" : meta.defaultCredits > 0 ? "metered" : "free");
      const estimatedCredits =
        input.estimatedCredits ?? (privacy === "local" ? 0 : meta.defaultCredits);
      const id = input.id ?? createId("ai-job");
      const job = createStudioAiJob({
        id,
        skill: input.skill,
        providerId: input.providerId ?? (privacy === "local" ? "local-atelier-draft" : "toonstudio-cloud"),
        privacy,
        cost,
        estimatedCredits,
        request: {
          prompt: input.prompt.trim(),
          inputSnapshotId: input.inputSnapshotId ?? `snap-${documentId}-${id}`,
          ...(input.selectionId ? { selectionId: input.selectionId } : {}),
          references: input.references ?? [],
          ...(input.seed !== undefined ? { seed: input.seed } : {}),
        },
        at: (input.now ?? now)(),
      });
      editRevision += 1;
      commitState([job, ...snapshot.jobs], snapshot.artifacts);
      return job;
    },

    requestConfirmation(jobId) {
      return replaceJob(transitionStudioAiJob(findJobOrThrow(jobId), { type: "request-confirmation", at: now() }));
    },

    submitForConfirmation(input) {
      return store.requestConfirmation(store.createDraft(input).id);
    },

    confirm(jobId, accepted) {
      return replaceJob(transitionStudioAiJob(findJobOrThrow(jobId), { type: "confirm", accepted, at: now() }));
    },

    start(jobId) {
      return replaceJob(transitionStudioAiJob(findJobOrThrow(jobId), { type: "start", at: now() }));
    },

    reportProgress(jobId, value) {
      const current = findJobOrThrow(jobId);
      const clamped = Math.max(current.progress, Math.min(1, value));
      return replaceJob(transitionStudioAiJob(current, { type: "progress", value: Number(clamped.toFixed(3)), at: now() }));
    },

    deliverPreview(jobId, preview, artifact) {
      return replaceJob(
        transitionStudioAiJob(findJobOrThrow(jobId), { type: "preview", preview, at: now() }),
        { jobId, artifact },
      );
    },

    approve(jobId) {
      return replaceJob(transitionStudioAiJob(findJobOrThrow(jobId), { type: "approve", at: now() }));
    },

    async apply(jobId, mode, executor) {
      const current = findJobOrThrow(jobId);
      if (!canApplyStudioAiJob(current)) {
        return { ok: false, error: "미리보기를 승인한 작업만 문서에 비파괴 적용할 수 있습니다." };
      }
      if (mode === "selection" && !current.request.selectionId) {
        return { ok: false, error: "선택 영역 정보가 없어 새 사본 레이어로만 적용할 수 있습니다." };
      }
      try {
        const artifact = snapshot.artifacts[jobId] ?? null;
        const application = await executor({ job: current, artifact, mode });
        if (!application || application.createdObjectIds.length === 0) {
          return { ok: false, error: "문서에 비파괴 초안 레이어를 삽입하지 못했습니다. 잠금 상태를 확인해 주세요." };
        }
        const applied = transitionStudioAiJob(current, { type: "apply", at: now(), application });
        replaceJob(applied);
        return { ok: true, job: applied };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "초안 레이어를 적용하는 중 문제가 발생했습니다." };
      }
    },

    fail(jobId, code, message) {
      return replaceJob(transitionStudioAiJob(findJobOrThrow(jobId), { type: "fail", code, message, at: now() }));
    },

    retry(jobId) {
      return replaceJob(
        transitionStudioAiJob(findJobOrThrow(jobId), { type: "retry", at: now() }),
        { jobId, artifact: null },
      );
    },

    cancel(jobId, reason) {
      const controller = activeControllers.get(jobId);
      if (controller) {
        controller.abort();
        activeControllers.delete(jobId);
      }
      const current = findJobOrThrow(jobId);
      if (current.status === "cancelled" || current.status === "applied") return current;
      return replaceJob(
        transitionStudioAiJob(current, { type: "cancel", at: now(), ...(reason ? { reason } : {}) }),
      );
    },

    removeJob(jobId) {
      const controller = activeControllers.get(jobId);
      if (controller) {
        controller.abort();
        activeControllers.delete(jobId);
      }
      editRevision += 1;
      const nextArtifacts = { ...snapshot.artifacts };
      delete nextArtifacts[jobId];
      commitState(snapshot.jobs.filter((job) => job.id !== jobId), nextArtifacts);
    },

    clearSettled() {
      editRevision += 1;
      const keep = snapshot.jobs.filter((job) => job.status !== "applied" && job.status !== "cancelled");
      const keepIds = new Set(keep.map((job) => job.id));
      const nextArtifacts: Record<string, StudioAiQueueArtifact> = {};
      for (const [id, artifact] of Object.entries(snapshot.artifacts)) {
        if (keepIds.has(id)) nextArtifacts[id] = artifact;
      }
      commitState(keep, nextArtifacts);
    },

    async executeQueuedJob(jobId, runOptions = {}) {
      const initial = findJobOrThrow(jobId);
      const running = initial.status === "queued" ? store.start(jobId) : initial;
      if (running.status !== "running") return running;

      const controller = new AbortController();
      activeControllers.set(jobId, controller);
      const stepDelayMs = runOptions.stepDelayMs ?? 0;

      const defaultRunner: StudioAiQueueJobRunner = async ({ job, signal, reportProgress }) => {
        for (const checkpoint of [0.28, 0.68, 0.92]) {
          if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
          reportProgress(checkpoint);
          if (stepDelayMs > 0) {
            await new Promise<void>((resolve, reject) => {
              const timer = globalThis.setTimeout(resolve, stepDelayMs);
              signal.addEventListener("abort", () => { globalThis.clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
            });
          }
        }
        return synthesizeNonDestructiveDraftArtifact(job);
      };

      try {
        const output = await (runOptions.runner ?? defaultRunner)({
          job: running,
          signal: controller.signal,
          reportProgress: (value) => {
            const latest = snapshot.jobs.find((item) => item.id === jobId);
            if (latest && latest.status === "running") store.reportProgress(jobId, value);
          },
        });
        if (controller.signal.aborted) return findJobOrThrow(jobId);
        const latest = snapshot.jobs.find((item) => item.id === jobId);
        if (!latest || latest.status !== "running") return latest ?? running;
        return store.deliverPreview(jobId, output.preview, output.artifact);
      } catch (error) {
        const latest = snapshot.jobs.find((item) => item.id === jobId);
        if (!latest || latest.status !== "running") return latest ?? running;
        if (controller.signal.aborted) return store.cancel(jobId, "user-cancelled");
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "초안을 생성하지 못했습니다. 설정을 확인한 뒤 다시 생성해 주세요.";
        return store.fail(jobId, "GENERATION_FAILED", message);
      } finally {
        if (activeControllers.get(jobId) === controller) activeControllers.delete(jobId);
      }
    },
  };

  return store;
}

const storesByDocumentId = new Map<string, StudioAiGenerationQueueStore>();

export function getStudioAiGenerationQueueStore(documentId: string): StudioAiGenerationQueueStore {
  const key = documentId.trim() || "default-document";
  const existing = storesByDocumentId.get(key);
  if (existing) return existing;
  const created = createStudioAiGenerationQueueStore({ documentId: key });
  storesByDocumentId.set(key, created);
  return created;
}

export function resetStudioAiGenerationQueueStoresForTest(): void {
  storesByDocumentId.clear();
}

export { canApplyStudioAiJob, studioAiJobUserState };
