import { executeDesktopSyncPlan } from "./agent.js";
import { loadSyncJournal, saveSyncJournal } from "./journal.js";
import { createLocalFolderHotReloadWatcher } from "./local-folder-hot-reload-watcher.js";
import { buildDesktopSyncPlan, countSyncPlanActions } from "./planner.js";
import { scanSyncFolder } from "./scanner.js";

import type {
  DesktopSyncExecutionResult,
  DesktopSyncTransport,
} from "./agent.js";
import type {
  HotReloadDeltaEvent,
  HotReloadOfflineQueueFlushResult,
  HotReloadOfflineQueueItem,
  HotReloadWatcherMetrics,
  LinkedLayerBinding,
  LocalFolderHotReloadWatcher,
  LocalFolderHotReloadWatcherOptions,
} from "./local-folder-hot-reload-watcher.js";
import type { RemoteFileSnapshot } from "./model.js";
import type { SyncPlanAction, SyncPlanItem } from "./planner.js";
import type { ScanSyncFolderOptions } from "./scanner.js";

export interface DesktopSyncRemote extends DesktopSyncTransport {
  listRemoteFiles(signal?: AbortSignal): Promise<readonly RemoteFileSnapshot[]>;
  assertDistinctFrom?(localRoot: string): Promise<void>;
  commitMetadata?(signal?: AbortSignal): Promise<void>;
}

export interface DesktopSyncCycleOptions extends ScanSyncFolderOptions {
  readonly signal?: AbortSignal;
  readonly now?: string;
}

export interface DesktopSyncCycleResult {
  readonly plan: readonly SyncPlanItem[];
  readonly counts: Readonly<Record<SyncPlanAction, number>>;
  readonly execution: DesktopSyncExecutionResult | null;
}

export async function runDesktopSyncCycle(
  root: string,
  remote: DesktopSyncRemote,
  options: DesktopSyncCycleOptions = {},
): Promise<DesktopSyncCycleResult> {
  if (options.signal?.aborted) throw options.signal.reason;
  await remote.assertDistinctFrom?.(root);
  if (options.signal?.aborted) throw options.signal.reason;
  const [journal, localFiles, remoteFiles] = await Promise.all([
    loadSyncJournal(root),
    scanSyncFolder(root, options),
    remote.listRemoteFiles(options.signal),
  ]);
  if (options.signal?.aborted) throw options.signal.reason;
  const plan = buildDesktopSyncPlan(localFiles, remoteFiles, journal);
  const counts = countSyncPlanActions(plan);
  if (counts.conflict > 0) return { plan, counts, execution: null };
  const execution = await executeDesktopSyncPlan(
    root,
    plan,
    journal,
    remote,
    options.now ?? new Date().toISOString(),
  );
  await remote.commitMetadata?.(options.signal);
  await saveSyncJournal(root, execution.journal);
  return { plan, counts, execution };
}

export interface DesktopSyncAgent {
  trigger(): Promise<DesktopSyncCycleResult>;
  stop(): void;
}

export interface DesktopSyncAgentHotReloadOptions {
  readonly enabled?: boolean;
  readonly debounceMs?: number;
  readonly stabilityIntervalMs?: number;
  readonly requiredStableChecks?: number;
  readonly allowedExtensions?: readonly string[];
  readonly watchFs?: boolean;
  readonly persistOfflineQueue?: boolean;
  readonly initialLinkedLayers?: readonly LinkedLayerBinding[];
  readonly onDelta?: (event: HotReloadDeltaEvent) => void | Promise<void>;
  readonly onIgnoredPath?: LocalFolderHotReloadWatcherOptions["onIgnoredPath"];
  readonly onSuppressedUnchanged?: LocalFolderHotReloadWatcherOptions["onSuppressedUnchanged"];
  readonly onUnstableFile?: LocalFolderHotReloadWatcherOptions["onUnstableFile"];
}

export interface StartDesktopSyncAgentOptions extends ScanSyncFolderOptions {
  readonly intervalMs?: number;
  readonly onResult?: (result: DesktopSyncCycleResult) => void;
  readonly onError?: (error: unknown) => void;
  readonly hotReload?: DesktopSyncAgentHotReloadOptions;
}

export function startDesktopSyncAgent(
  root: string,
  remote: DesktopSyncRemote,
  options: StartDesktopSyncAgentOptions = {},
): DesktopSyncAgent {
  const intervalMs = options.intervalMs ?? 5_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
    throw new TypeError("intervalMs must be an integer of at least 1000ms");
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let current: Promise<DesktopSyncCycleResult> | null = null;
  let hotReloadWatcher: LocalFolderHotReloadWatcher | null = null;

  const schedule = (): void => {
    if (stopped || timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      void trigger().catch(() => undefined);
    }, intervalMs);
    timer.unref?.();
  };
  const trigger = (): Promise<DesktopSyncCycleResult> => {
    if (stopped) return Promise.reject(new Error("desktop sync agent is stopped"));
    if (current !== null) return current;
    current = runDesktopSyncCycle(root, remote, options)
      .then((result) => {
        options.onResult?.(result);
        return result;
      })
      .catch((error: unknown) => {
        options.onError?.(error);
        throw error;
      })
      .finally(() => {
        current = null;
        schedule();
      });
    return current;
  };

  if (options.hotReload?.enabled) {
    hotReloadWatcher = createLocalFolderHotReloadWatcher(root, {
      debounceMs: options.hotReload.debounceMs,
      stabilityIntervalMs: options.hotReload.stabilityIntervalMs,
      requiredStableChecks: options.hotReload.requiredStableChecks,
      allowedExtensions: options.hotReload.allowedExtensions,
      watchFs: options.hotReload.watchFs,
      persistOfflineQueue: options.hotReload.persistOfflineQueue,
      initialLinkedLayers: options.hotReload.initialLinkedLayers,
      maximumFileBytes: options.maximumFileBytes,
      onIgnoredPath: options.hotReload.onIgnoredPath,
      onSuppressedUnchanged: options.hotReload.onSuppressedUnchanged,
      onUnstableFile: options.hotReload.onUnstableFile,
      onError: options.onError,
      onDelta: async (event) => {
        await options.hotReload?.onDelta?.(event);
        if (!stopped) {
          await trigger();
        }
      },
    });
    void hotReloadWatcher.start().catch((error: unknown) => {
      options.onError?.(error);
    });
  }

  void trigger().catch(() => undefined);
  return {
    trigger,
    stop() {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (hotReloadWatcher !== null) {
        void hotReloadWatcher.stop().catch(() => undefined);
        hotReloadWatcher = null;
      }
    },
  };
}

export interface StartDesktopHotReloadSyncSessionOptions
  extends Omit<LocalFolderHotReloadWatcherOptions, "onDelta">,
    ScanSyncFolderOptions {
  readonly now?: () => string;
  readonly onDelta?: (event: HotReloadDeltaEvent) => void | Promise<void>;
  readonly onSyncResult?: (
    result: DesktopSyncCycleResult,
    event: HotReloadDeltaEvent,
  ) => void | Promise<void>;
}

export interface DesktopHotReloadSyncSession {
  readonly watcher: LocalFolderHotReloadWatcher;
  start(): Promise<void>;
  stop(): Promise<void>;
  setOnline(online: boolean): Promise<HotReloadOfflineQueueFlushResult | null>;
  flushOfflineQueue(): Promise<HotReloadOfflineQueueFlushResult>;
  getOfflineQueue(): readonly HotReloadOfflineQueueItem[];
  getMetrics(): HotReloadWatcherMetrics;
}

/**
 * 로컬 폴더 핫리로드 감시기와 양방향 동기화 사이클(`runDesktopSyncCycle`)을 연결한다.
 * - PSD/PNG/GLB 실제 SHA-256 변경이 안정화될 때만 동기화를 실행한다.
 * - 원격 오류·오프라인 상태에서는 델타를 오프라인 큐에 적재하고, 온라인 복귀 시 순차 재동기화한다.
 */
export function startDesktopHotReloadSyncSession(
  root: string,
  remote: DesktopSyncRemote,
  options: StartDesktopHotReloadSyncSessionOptions = {},
): DesktopHotReloadSyncSession {
  const nowFn = options.now ?? (() => new Date().toISOString());
  const watcher = createLocalFolderHotReloadWatcher(root, {
    ...options,
    now: nowFn,
    onDelta: async (event) => {
      await options.onDelta?.(event);
      const result = await runDesktopSyncCycle(root, remote, {
        includeUnknownFiles: options.includeUnknownFiles,
        maximumFileBytes: options.maximumFileBytes,
        now: nowFn(),
      });
      await options.onSyncResult?.(result, event);
    },
  });

  return {
    watcher,
    start: () => watcher.start(),
    stop: () => watcher.stop(),
    setOnline: (online) => watcher.setOnline(online),
    flushOfflineQueue: () => watcher.flushOfflineQueue(),
    getOfflineQueue: () => watcher.getOfflineQueue(),
    getMetrics: () => watcher.getMetrics(),
  };
}
