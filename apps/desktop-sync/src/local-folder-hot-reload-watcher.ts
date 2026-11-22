import { randomUUID } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { lstat, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";

import {
  DEFAULT_HOT_RELOAD_DEBOUNCE_MS,
  DEFAULT_HOT_RELOAD_MAX_STABILITY_ATTEMPTS,
  DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS,
  DEFAULT_HOT_RELOAD_STABILITY_INTERVAL_MS,
  HotReloadOfflineQueue,
  hasNodeErrorCode,
  inspectHotReloadPathFilter,
  isOsMetadataSegment,
  normalizeHotReloadExtensions,
  resolveLinkedLayerReplacement,
  toPosixRelativePath,
  type HotReloadAssetRecord,
  type HotReloadDeltaEvent,
  type HotReloadDeltaKind,
  type HotReloadOfflineQueueFlushResult,
  type HotReloadOfflineQueueItem,
  type HotReloadPathRejectReason,
  type HotReloadWatcherMetrics,
  type LinkedLayerBinding,
  type LinkedLayerReplacementResult,
} from "./local-folder-hot-reload-policy.js";
import {
  assertNoSymlinkEscape,
  isReservedSyncPath,
  normalizeRelativeSyncPath,
  resolveSyncPath,
} from "./path-policy.js";
import { sha256File } from "./scanner.js";

export {
  DEFAULT_HOT_RELOAD_DEBOUNCE_MS,
  DEFAULT_HOT_RELOAD_EXTENSIONS,
  DEFAULT_HOT_RELOAD_MAX_STABILITY_ATTEMPTS,
  DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS,
  DEFAULT_HOT_RELOAD_STABILITY_INTERVAL_MS,
  HotReloadOfflineQueue,
  buildConflictBranchSidecarPath,
  hotReloadOfflineQueuePath,
  inspectHotReloadPathFilter,
  isAllowedHotReloadFilePath,
  normalizeHotReloadExtensions,
  resolveLinkedLayerReplacement,
  type HotReloadAssetRecord,
  type HotReloadDeltaEvent,
  type HotReloadDeltaKind,
  type HotReloadOfflineQueueFlushResult,
  type HotReloadOfflineQueueItem,
  type HotReloadPathFilterResult,
  type HotReloadPathRejectReason,
  type HotReloadWatcherMetrics,
  type LinkedLayerBinding,
  type LinkedLayerConflictReason,
  type LinkedLayerReplacementOutcome,
  type LinkedLayerReplacementResult,
  type LinkedLayerVersionBranch,
} from "./local-folder-hot-reload-policy.js";

export interface HotReloadStabilityOptions {
  readonly stabilityIntervalMs?: number;
  readonly requiredStableChecks?: number;
  readonly maxStabilityAttempts?: number;
  readonly allowEmptyFiles?: boolean;
  readonly maximumFileBytes?: number;
  readonly signal?: AbortSignal;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export type HotReloadStabilityResult =
  | {
    readonly status: "stable";
    readonly absolutePath: string;
    readonly size: number;
    readonly modifiedAtMs: number;
    readonly sha256: string;
    readonly checksPerformed: number;
  }
  | {
    readonly status: "missing";
    readonly absolutePath: string;
  }
  | {
    readonly status: "unstable" | "rejected";
    readonly absolutePath: string;
    readonly reason: string;
  };

export interface LocalFolderHotReloadWatcherOptions {
  readonly allowedExtensions?: readonly string[];
  readonly debounceMs?: number;
  readonly stabilityIntervalMs?: number;
  readonly requiredStableChecks?: number;
  readonly maxStabilityAttempts?: number;
  readonly allowEmptyFiles?: boolean;
  readonly maximumFileBytes?: number;
  readonly watchFs?: boolean;
  readonly initialOnline?: boolean;
  readonly persistOfflineQueue?: boolean;
  readonly initialLinkedLayers?: readonly LinkedLayerBinding[];
  readonly now?: () => string;
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly onDelta?: (event: HotReloadDeltaEvent) => void | Promise<void>;
  readonly onSuppressedUnchanged?: (relativePath: string, sha256: string) => void;
  readonly onIgnoredPath?: (relativePath: string, reason: HotReloadPathRejectReason) => void;
  readonly onUnstableFile?: (relativePath: string, reason: string) => void;
  readonly onError?: (error: unknown) => void;
}

export interface LocalFolderHotReloadWatcher {
  start(): Promise<void>;
  stop(): Promise<void>;
  notifyPath(rawRelativePath: string): void;
  scanNow(): Promise<readonly HotReloadDeltaEvent[]>;
  waitForIdle(): Promise<void>;
  setOnline(online: boolean): Promise<HotReloadOfflineQueueFlushResult | null>;
  isOnline(): boolean;
  flushOfflineQueue(): Promise<HotReloadOfflineQueueFlushResult>;
  getOfflineQueue(): readonly HotReloadOfflineQueueItem[];
  registerLinkedLayer(binding: LinkedLayerBinding): void;
  unregisterLinkedLayer(layerId: string): void;
  getLinkedLayer(layerId: string): LinkedLayerBinding | undefined;
  getTrackedAssets(): ReadonlyMap<string, HotReloadAssetRecord>;
  getMetrics(): HotReloadWatcherMetrics;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolvePromise, rejectPromise) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      rejectPromise(signal?.reason ?? new Error("hot-reload sleep aborted"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolvePromise();
    }, ms);
    timer.unref?.();
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * 2회 연속 `mtime`/`size` 안정화 검증 후 SHA-256을 계산하고,
 * 해시 읽기 도중 파일이 변하지 않았는지 재확인해 Atomic Rename 불완전 바이트를 차단한다.
 */
export async function waitForStableHotReloadFile(
  root: string,
  relativePath: string,
  options: HotReloadStabilityOptions = {},
): Promise<HotReloadStabilityResult> {
  const stabilityIntervalMs = options.stabilityIntervalMs ?? DEFAULT_HOT_RELOAD_STABILITY_INTERVAL_MS;
  const requiredStableChecks = options.requiredStableChecks ?? DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS;
  const maxStabilityAttempts = options.maxStabilityAttempts ?? DEFAULT_HOT_RELOAD_MAX_STABILITY_ATTEMPTS;
  const allowEmptyFiles = options.allowEmptyFiles ?? false;
  const maximumFileBytes = options.maximumFileBytes ?? Number.MAX_SAFE_INTEGER;
  const sleepFn = options.sleep ?? defaultSleep;

  if (!Number.isSafeInteger(requiredStableChecks) || requiredStableChecks < 1) {
    throw new TypeError("requiredStableChecks must be a positive safe integer");
  }
  if (!Number.isSafeInteger(maxStabilityAttempts) || maxStabilityAttempts < requiredStableChecks) {
    throw new TypeError("maxStabilityAttempts must be >= requiredStableChecks");
  }

  let absolutePath: string;
  try {
    absolutePath = resolveSyncPath(root, relativePath);
  } catch (error) {
    return {
      status: "rejected",
      absolutePath: join(root, relativePath),
      reason: error instanceof Error ? error.message : "invalid-path",
    };
  }

  const readSnapshot = async (): Promise<
    | { readonly kind: "ok"; readonly size: number; readonly modifiedAtMs: number }
    | { readonly kind: "missing" }
    | { readonly kind: "rejected"; readonly reason: string }
  > => {
    try {
      const metadata = await lstat(absolutePath);
      if (metadata.isSymbolicLink()) return { kind: "rejected", reason: "symlink-rejected" };
      if (!metadata.isFile()) return { kind: "rejected", reason: "not-regular-file" };
      await assertNoSymlinkEscape(root, absolutePath);
      if (metadata.size > maximumFileBytes) return { kind: "rejected", reason: "file-too-large" };
      return {
        kind: "ok",
        size: metadata.size,
        modifiedAtMs: Math.trunc(metadata.mtimeMs),
      };
    } catch (error) {
      if (hasNodeErrorCode(error, "ENOENT")) return { kind: "missing" };
      return {
        kind: "rejected",
        reason: error instanceof Error ? error.message : "stat-failed",
      };
    }
  };

  let previous: { readonly size: number; readonly modifiedAtMs: number } | null = null;
  let consecutiveStable = 0;

  for (let attempt = 0; attempt <= maxStabilityAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      return { status: "unstable", absolutePath, reason: "aborted" };
    }
    const sample = await readSnapshot();
    if (sample.kind === "missing") return { status: "missing", absolutePath };
    if (sample.kind === "rejected") return { status: "rejected", absolutePath, reason: sample.reason };

    const validSize = allowEmptyFiles || sample.size > 0;
    if (
      validSize
      && previous !== null
      && previous.size === sample.size
      && previous.modifiedAtMs === sample.modifiedAtMs
    ) {
      consecutiveStable += 1;
    } else {
      consecutiveStable = 0;
    }
    previous = { size: sample.size, modifiedAtMs: sample.modifiedAtMs };

    if (validSize && consecutiveStable >= requiredStableChecks) {
      let sha256: string;
      try {
        sha256 = await sha256File(absolutePath);
      } catch (error) {
        if (hasNodeErrorCode(error, "ENOENT")) return { status: "missing", absolutePath };
        consecutiveStable = 0;
        previous = null;
        if (attempt < maxStabilityAttempts) await sleepFn(stabilityIntervalMs, options.signal);
        continue;
      }

      const confirm = await readSnapshot();
      if (confirm.kind === "missing") return { status: "missing", absolutePath };
      if (confirm.kind === "rejected") return { status: "rejected", absolutePath, reason: confirm.reason };
      if (confirm.size === sample.size && confirm.modifiedAtMs === sample.modifiedAtMs) {
        return {
          status: "stable",
          absolutePath,
          size: confirm.size,
          modifiedAtMs: confirm.modifiedAtMs,
          sha256,
          checksPerformed: consecutiveStable,
        };
      }
      previous = { size: confirm.size, modifiedAtMs: confirm.modifiedAtMs };
      consecutiveStable = 0;
    }

    if (attempt < maxStabilityAttempts) {
      await sleepFn(stabilityIntervalMs, options.signal);
    }
  }

  return {
    status: "unstable",
    absolutePath,
    reason: previous !== null && previous.size === 0 && !allowEmptyFiles
      ? "zero-byte-incomplete-write"
      : "size-or-mtime-still-changing",
  };
}

/**
 * PSD/PNG/GLB 로컬 폴더 핫리로드 감시기:
 * - 300ms 디바운스 + macOS/Windows 임시 파일 차단 + 2회 연속 mtime/size 안정화 검증
 * - SHA-256 실제 바이트 변경 시에만 델타 통지
 * - 링크 레이어 안전 교체 및 충돌 시 버전 분기
 * - 오프라인 큐 적재·영속화 및 재연결 시 재동기화
 */
export function createLocalFolderHotReloadWatcher(
  root: string,
  options: LocalFolderHotReloadWatcherOptions = {},
): LocalFolderHotReloadWatcher {
  const allowedExtensions = normalizeHotReloadExtensions(options.allowedExtensions);
  const debounceMs = options.debounceMs ?? DEFAULT_HOT_RELOAD_DEBOUNCE_MS;
  const stabilityIntervalMs = options.stabilityIntervalMs ?? DEFAULT_HOT_RELOAD_STABILITY_INTERVAL_MS;
  const requiredStableChecks = options.requiredStableChecks ?? DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS;
  const maxStabilityAttempts = options.maxStabilityAttempts ?? DEFAULT_HOT_RELOAD_MAX_STABILITY_ATTEMPTS;
  const allowEmptyFiles = options.allowEmptyFiles ?? false;
  const maximumFileBytes = options.maximumFileBytes ?? Number.MAX_SAFE_INTEGER;
  const shouldWatchFs = options.watchFs ?? true;
  const persistOfflineQueue = options.persistOfflineQueue ?? true;
  const nowFn = options.now ?? (() => new Date().toISOString());
  const sleepFn = options.sleep ?? defaultSleep;

  if (!Number.isSafeInteger(debounceMs) || debounceMs < 0) {
    throw new TypeError("debounceMs must be a non-negative safe integer");
  }

  const trackedAssets = new Map<string, HotReloadAssetRecord>();
  const linkedLayers = new Map<string, LinkedLayerBinding>();
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const activeProbes = new Map<string, Promise<HotReloadDeltaEvent | null>>();
  const offlineQueue = new HotReloadOfflineQueue();

  for (const binding of options.initialLinkedLayers ?? []) {
    linkedLayers.set(binding.layerId, {
      ...binding,
      relativePath: toPosixRelativePath(binding.relativePath),
    });
  }

  let online = options.initialOnline ?? true;
  let running = false;
  let watcher: FSWatcher | null = null;
  let abortController: AbortController | null = null;

  let emittedDeltas = 0;
  let suppressedUnchanged = 0;
  let ignoredPaths = 0;
  let unstableAborted = 0;
  let branchedConflicts = 0;
  let queuedOffline = 0;
  let flushedOffline = 0;

  const persistQueueIfEnabled = async (): Promise<void> => {
    if (!persistOfflineQueue) return;
    await offlineQueue.saveToDisk(root, nowFn());
  };

  const applyLinkedLayerUpdates = (
    delta: Pick<HotReloadDeltaEvent, "kind" | "relativePath" | "sha256" | "previousSha256" | "detectedAt">,
  ): readonly LinkedLayerReplacementResult[] => {
    const results: LinkedLayerReplacementResult[] = [];
    for (const [layerId, binding] of linkedLayers.entries()) {
      if (binding.relativePath !== delta.relativePath) continue;
      const result = resolveLinkedLayerReplacement(binding, delta);
      results.push(result);
      if (result.outcome === "replaced") {
        linkedLayers.set(layerId, {
          ...binding,
          version: result.nextVersion,
          syncedSourceSha256: result.nextSyncedSourceSha256,
        });
      } else if (result.outcome === "branched") {
        branchedConflicts += 1;
      }
    }
    return results;
  };

  const deliverOrQueueDelta = async (event: HotReloadDeltaEvent): Promise<void> => {
    if (!online) {
      offlineQueue.enqueue(event, nowFn());
      queuedOffline += 1;
      await persistQueueIfEnabled();
      return;
    }
    try {
      await options.onDelta?.(event);
      emittedDeltas += 1;
    } catch (error) {
      offlineQueue.enqueue(event, nowFn());
      queuedOffline += 1;
      await persistQueueIfEnabled();
      options.onError?.(error);
    }
  };

  const processPath = async (
    normalizedPath: string,
    extension: string,
  ): Promise<HotReloadDeltaEvent | null> => {
    const stability = await waitForStableHotReloadFile(root, normalizedPath, {
      stabilityIntervalMs,
      requiredStableChecks,
      maxStabilityAttempts,
      allowEmptyFiles,
      maximumFileBytes,
      signal: abortController?.signal,
      sleep: sleepFn,
    });

    const previous = trackedAssets.get(normalizedPath) ?? null;

    if (stability.status === "missing") {
      if (!previous) return null;
      trackedAssets.delete(normalizedPath);
      const baseDelta = {
        kind: "deleted" as const,
        relativePath: normalizedPath,
        sha256: null,
        previousSha256: previous.sha256,
        detectedAt: nowFn(),
      };
      const event: HotReloadDeltaEvent = {
        eventId: randomUUID(),
        ...baseDelta,
        absolutePath: stability.absolutePath,
        extension: previous.extension,
        size: 0,
        modifiedAtMs: 0,
        stabilityChecks: 0,
        linkedLayerResults: applyLinkedLayerUpdates(baseDelta),
      };
      await deliverOrQueueDelta(event);
      return event;
    }

    if (stability.status !== "stable") {
      unstableAborted += 1;
      options.onUnstableFile?.(normalizedPath, stability.reason);
      return null;
    }

    if (previous !== null && previous.sha256 === stability.sha256) {
      trackedAssets.set(normalizedPath, {
        ...previous,
        size: stability.size,
        modifiedAtMs: stability.modifiedAtMs,
      });
      suppressedUnchanged += 1;
      options.onSuppressedUnchanged?.(normalizedPath, stability.sha256);
      return null;
    }

    trackedAssets.set(normalizedPath, {
      relativePath: normalizedPath,
      extension,
      sha256: stability.sha256,
      size: stability.size,
      modifiedAtMs: stability.modifiedAtMs,
      revision: (previous?.revision ?? 0) + 1,
    });

    const kind: HotReloadDeltaKind = previous === null ? "created" : "updated";
    const baseDelta = {
      kind,
      relativePath: normalizedPath,
      sha256: stability.sha256,
      previousSha256: previous?.sha256 ?? null,
      detectedAt: nowFn(),
    };
    const event: HotReloadDeltaEvent = {
      eventId: randomUUID(),
      ...baseDelta,
      absolutePath: stability.absolutePath,
      extension,
      size: stability.size,
      modifiedAtMs: stability.modifiedAtMs,
      stabilityChecks: stability.checksPerformed,
      linkedLayerResults: applyLinkedLayerUpdates(baseDelta),
    };
    await deliverOrQueueDelta(event);
    return event;
  };

  const enqueueProbe = (normalizedPath: string, extension: string): void => {
    const previousProbe = activeProbes.get(normalizedPath) ?? Promise.resolve(null);
    const nextProbe = previousProbe
      .catch(() => null)
      .then(() => processPath(normalizedPath, extension))
      .catch((error: unknown) => {
        options.onError?.(error);
        return null;
      });
    activeProbes.set(normalizedPath, nextProbe);
    void nextProbe.finally(() => {
      if (activeProbes.get(normalizedPath) === nextProbe) {
        activeProbes.delete(normalizedPath);
      }
    });
  };

  const notifyPath = (rawRelativePath: string): void => {
    const filtered = inspectHotReloadPathFilter(rawRelativePath, allowedExtensions);
    if (!filtered.allowed) {
      ignoredPaths += 1;
      options.onIgnoredPath?.(filtered.normalizedPath || rawRelativePath, filtered.reason);
      return;
    }
    const existingTimer = debounceTimers.get(filtered.normalizedPath);
    if (existingTimer !== undefined) clearTimeout(existingTimer);
    const timer = setTimeout(() => {
      debounceTimers.delete(filtered.normalizedPath);
      enqueueProbe(filtered.normalizedPath, filtered.extension);
    }, debounceMs);
    timer.unref?.();
    debounceTimers.set(filtered.normalizedPath, timer);
  };

  const collectAllowedRelativePaths = async (): Promise<readonly string[]> => {
    const found: string[] = [];
    const visit = async (directory: string): Promise<void> => {
      const entries = await readdir(directory, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const absolutePath = join(directory, entry.name);
        const lexicalRelative = relative(root, absolutePath).split(sep).join("/");
        if (isReservedSyncPath(lexicalRelative) || entry.isSymbolicLink()) continue;
        if (entry.isDirectory()) {
          if (!isOsMetadataSegment(entry.name)) await visit(absolutePath);
          continue;
        }
        if (!entry.isFile()) continue;
        const normalized = normalizeRelativeSyncPath(root, absolutePath);
        if (!normalized) continue;
        const filtered = inspectHotReloadPathFilter(normalized, allowedExtensions);
        if (filtered.allowed) found.push(filtered.normalizedPath);
      }
    };
    await visit(root);
    return found;
  };

  const hydrateBaseline = async (): Promise<void> => {
    for (const relativePath of await collectAllowedRelativePaths()) {
      const absolutePath = resolveSyncPath(root, relativePath);
      const metadata = await lstat(absolutePath);
      if (!metadata.isFile() || metadata.isSymbolicLink()) continue;
      if (metadata.size > maximumFileBytes || (!allowEmptyFiles && metadata.size === 0)) continue;
      trackedAssets.set(relativePath, {
        relativePath,
        extension: extname(relativePath).toLowerCase(),
        sha256: await sha256File(absolutePath),
        size: metadata.size,
        modifiedAtMs: Math.trunc(metadata.mtimeMs),
        revision: 1,
      });
    }
  };

  const flushOfflineQueue = async (): Promise<HotReloadOfflineQueueFlushResult> => {
    const snapshot = offlineQueue.list();
    if (!online || snapshot.length === 0) {
      return { attempted: 0, flushed: 0, remaining: offlineQueue.size, failedPaths: [] };
    }
    let attempted = 0;
    let flushed = 0;
    const failedPaths: string[] = [];

    for (const item of snapshot) {
      attempted += 1;
      try {
        await options.onDelta?.(item.delta);
        offlineQueue.remove(item.delta.relativePath);
        flushed += 1;
        flushedOffline += 1;
        emittedDeltas += 1;
      } catch (error) {
        offlineQueue.markFailed(item.delta.relativePath, error);
        failedPaths.push(item.delta.relativePath);
        options.onError?.(error);
      }
    }
    await persistQueueIfEnabled();
    return { attempted, flushed, remaining: offlineQueue.size, failedPaths };
  };

  return {
    async start(): Promise<void> {
      if (running) return;
      running = true;
      abortController = new AbortController();
      if (persistOfflineQueue) await offlineQueue.loadFromDisk(root);
      await hydrateBaseline();
      if (shouldWatchFs) {
        watcher = watch(root, { recursive: true }, (_eventType, fileName) => {
          if (!running || !fileName) return;
          const rawName = typeof fileName === "string"
            ? fileName
            : Buffer.from(fileName).toString("utf8");
          notifyPath(rawName);
        });
        watcher.on("error", (error) => options.onError?.(error));
      }
      if (online && offlineQueue.size > 0) await flushOfflineQueue();
    },

    async stop(): Promise<void> {
      running = false;
      abortController?.abort();
      abortController = null;
      for (const timer of debounceTimers.values()) clearTimeout(timer);
      debounceTimers.clear();
      if (watcher !== null) {
        watcher.close();
        watcher = null;
      }
      await Promise.allSettled([...activeProbes.values()]);
    },

    notifyPath,

    async scanNow(): Promise<readonly HotReloadDeltaEvent[]> {
      const currentPaths = new Set(await collectAllowedRelativePaths());
      const candidates = new Set<string>([...trackedAssets.keys(), ...currentPaths]);
      const emitted: HotReloadDeltaEvent[] = [];
      for (const candidatePath of [...candidates].sort()) {
        const filtered = inspectHotReloadPathFilter(candidatePath, allowedExtensions);
        if (!filtered.allowed) continue;
        const event = await processPath(filtered.normalizedPath, filtered.extension);
        if (event !== null) emitted.push(event);
      }
      return emitted;
    },

    async waitForIdle(): Promise<void> {
      while (debounceTimers.size > 0 || activeProbes.size > 0) {
        if (debounceTimers.size > 0) {
          await defaultSleep(Math.max(10, Math.min(debounceMs, 50)));
        }
        if (activeProbes.size > 0) {
          await Promise.allSettled([...activeProbes.values()]);
        }
      }
    },

    async setOnline(nextOnline: boolean): Promise<HotReloadOfflineQueueFlushResult | null> {
      online = nextOnline;
      return online ? flushOfflineQueue() : null;
    },

    isOnline: () => online,
    flushOfflineQueue,
    getOfflineQueue: () => offlineQueue.list(),

    registerLinkedLayer(binding: LinkedLayerBinding): void {
      linkedLayers.set(binding.layerId, {
        ...binding,
        relativePath: toPosixRelativePath(binding.relativePath),
      });
    },

    unregisterLinkedLayer(layerId: string): void {
      linkedLayers.delete(layerId);
    },

    getLinkedLayer: (layerId: string) => linkedLayers.get(layerId),
    getTrackedAssets: () => new Map(trackedAssets),
    getMetrics: () => ({
      emittedDeltas,
      suppressedUnchanged,
      ignoredPaths,
      unstableAborted,
      branchedConflicts,
      queuedOffline,
      flushedOffline,
    }),
  };
}
