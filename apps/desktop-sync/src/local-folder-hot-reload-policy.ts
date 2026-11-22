import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";

import { isReservedSyncPath } from "./path-policy.js";

export const DEFAULT_HOT_RELOAD_DEBOUNCE_MS = 300;
export const DEFAULT_HOT_RELOAD_STABILITY_INTERVAL_MS = 100;
export const DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS = 2;
export const DEFAULT_HOT_RELOAD_MAX_STABILITY_ATTEMPTS = 12;

/** 기본 핫리로드 감시 대상 확장자 화이트리스트 (PSD · PNG · GLB). */
export const DEFAULT_HOT_RELOAD_EXTENSIONS = Object.freeze([
  ".psd",
  ".png",
  ".glb",
] as const);

const HOT_RELOAD_QUEUE_DIRECTORY = ".toonstudio";
const HOT_RELOAD_QUEUE_FILE = "hot-reload-queue.json";
const HOT_RELOAD_QUEUE_SCHEMA = 1 as const;

const OS_METADATA_EXACT_NAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".localized",
  ".spotlight-v100",
  ".trashes",
  ".fseventsd",
  ".temporaryitems",
  "icon\r",
]);

const TEMPORARY_EXTENSIONS = new Set([
  ".tmp",
  ".temp",
  ".part",
  ".partial",
  ".crdownload",
  ".download",
  ".swp",
  ".swo",
  ".swn",
  ".bak",
  ".orig",
  ".lock",
  ".lck",
  ".blend1",
  ".blend2",
]);

export type HotReloadPathRejectReason =
  | "empty-path"
  | "reserved"
  | "os-metadata"
  | "temporary-file"
  | "disallowed-extension";

export type HotReloadPathFilterResult =
  | {
    readonly allowed: true;
    readonly normalizedPath: string;
    readonly extension: string;
  }
  | {
    readonly allowed: false;
    readonly normalizedPath: string;
    readonly reason: HotReloadPathRejectReason;
  };

export type HotReloadDeltaKind = "created" | "updated" | "deleted";

export interface HotReloadAssetRecord {
  readonly relativePath: string;
  readonly extension: string;
  readonly sha256: string;
  readonly size: number;
  readonly modifiedAtMs: number;
  readonly revision: number;
}

export interface LinkedLayerBinding {
  readonly layerId: string;
  readonly layerName: string;
  readonly relativePath: string;
  /** 캔버스 링크 레이어가 마지막으로 반영한 소스 파일 SHA-256 */
  readonly syncedSourceSha256: string | null;
  /** 캔버스 내부에서 링크 레이어를 직접 수정한 경우 true */
  readonly hasLocalCanvasEdits: boolean;
  /** 현재 링크 레이어 버전 (1 이상 정수) */
  readonly version: number;
}

export type LinkedLayerConflictReason = "local-canvas-edits" | "base-hash-diverged";

export interface LinkedLayerVersionBranch {
  readonly branchId: string;
  readonly branchLabel: string;
  readonly layerId: string;
  readonly baseVersion: number;
  readonly nextVersion: number;
  readonly baseSha256: string | null;
  readonly incomingSha256: string;
  readonly sidecarRelativePath: string;
  readonly conflictReason: LinkedLayerConflictReason;
  readonly createdAt: string;
}

export type LinkedLayerReplacementOutcome =
  | "replaced"
  | "branched"
  | "unchanged"
  | "detached-missing";

export interface LinkedLayerReplacementResult {
  readonly outcome: LinkedLayerReplacementOutcome;
  readonly layerId: string;
  readonly relativePath: string;
  readonly previousVersion: number;
  readonly nextVersion: number;
  readonly nextSyncedSourceSha256: string | null;
  readonly branch: LinkedLayerVersionBranch | null;
  readonly reason: string;
}

export interface HotReloadDeltaEvent {
  readonly eventId: string;
  readonly kind: HotReloadDeltaKind;
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly extension: string;
  readonly sha256: string | null;
  readonly previousSha256: string | null;
  readonly size: number;
  readonly modifiedAtMs: number;
  readonly detectedAt: string;
  readonly stabilityChecks: number;
  readonly linkedLayerResults: readonly LinkedLayerReplacementResult[];
}

export interface HotReloadOfflineQueueItem {
  readonly delta: HotReloadDeltaEvent;
  readonly queuedAt: string;
  readonly retryCount: number;
  readonly lastError: string | null;
}

export interface HotReloadOfflineQueueFlushResult {
  readonly attempted: number;
  readonly flushed: number;
  readonly remaining: number;
  readonly failedPaths: readonly string[];
}

export interface HotReloadWatcherMetrics {
  readonly emittedDeltas: number;
  readonly suppressedUnchanged: number;
  readonly ignoredPaths: number;
  readonly unstableAborted: number;
  readonly branchedConflicts: number;
  readonly queuedOffline: number;
  readonly flushedOffline: number;
}

export function toPosixRelativePath(value: string): string {
  return value
    .replace(/\\/gu, "/")
    .replace(/^\/+/u, "")
    .replace(/\/+/gu, "/")
    .trim();
}

export function hasNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { readonly code?: unknown }).code === code
  );
}

/** 확장자 화이트리스트를 소문자 점(`.`) 접두 형태로 정규화한다. */
export function normalizeHotReloadExtensions(
  extensions: readonly string[] = DEFAULT_HOT_RELOAD_EXTENSIONS,
): ReadonlySet<string> {
  const normalized = new Set<string>();
  for (const raw of extensions) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;
    normalized.add(trimmed.startsWith(".") ? trimmed : `.${trimmed}`);
  }
  if (normalized.size === 0) {
    throw new TypeError("allowedExtensions must contain at least one file extension");
  }
  return normalized;
}

export function isOsMetadataSegment(segment: string): boolean {
  const lower = segment.toLowerCase();
  if (OS_METADATA_EXACT_NAMES.has(lower)) return true;
  return segment.startsWith("._");
}

function isTemporaryFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.startsWith(".~") || lower.startsWith("~$")) return true;
  if (lower.startsWith(".sb-") || lower.startsWith("#") || lower.startsWith(".#")) return true;
  if (lower.endsWith("~") || lower.endsWith("#")) return true;
  if (lower.includes(".~tmp") || lower.includes(".tmp.") || lower.includes(".download.")) {
    return true;
  }
  // Photoshop / atomic-rename 스타일 숨김 파일(`.filename.psd.1234`) 차단
  if (fileName.startsWith(".")) return true;
  return TEMPORARY_EXTENSIONS.has(extname(lower));
}

/**
 * macOS/Windows 임시 저장 파일(`.DS_Store`, `._*`, `.~tmp`, `~$*`, Atomic Rename 임시 파일)과
 * 비허용 확장자를 차단한다.
 */
export function inspectHotReloadPathFilter(
  rawRelativePath: string,
  allowedExtensions: ReadonlySet<string> = normalizeHotReloadExtensions(),
): HotReloadPathFilterResult {
  const normalizedPath = toPosixRelativePath(rawRelativePath);
  if (!normalizedPath || normalizedPath === ".") {
    return { allowed: false, normalizedPath, reason: "empty-path" };
  }
  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return { allowed: false, normalizedPath, reason: "empty-path" };
  }
  if (
    isReservedSyncPath(normalizedPath)
    || segments.some((segment) => segment === "." || segment === "..")
  ) {
    return { allowed: false, normalizedPath, reason: "reserved" };
  }
  if (segments.some((segment) => isOsMetadataSegment(segment))) {
    return { allowed: false, normalizedPath, reason: "os-metadata" };
  }
  const fileName = segments[segments.length - 1] ?? "";
  if (isTemporaryFileName(fileName)) {
    return { allowed: false, normalizedPath, reason: "temporary-file" };
  }
  const extension = extname(fileName).toLowerCase();
  if (!extension || !allowedExtensions.has(extension)) {
    return { allowed: false, normalizedPath, reason: "disallowed-extension" };
  }
  return { allowed: true, normalizedPath, extension };
}

export function isAllowedHotReloadFilePath(
  rawRelativePath: string,
  allowedExtensions: ReadonlySet<string> = normalizeHotReloadExtensions(),
): boolean {
  return inspectHotReloadPathFilter(rawRelativePath, allowedExtensions).allowed;
}

/** 충돌 시 외부 변경 버전을 안전하게 보관하기 위한 결정론 사이드카 경로를 만든다. */
export function buildConflictBranchSidecarPath(
  relativePath: string,
  nextVersion: number,
  sha256: string,
): string {
  const normalized = toPosixRelativePath(relativePath);
  const ext = extname(normalized);
  const stem = ext ? normalized.slice(0, -ext.length) : normalized;
  return `${stem}.v${nextVersion}-${sha256.slice(0, 8)}${ext}`;
}

/**
 * 링크 레이어 안전 교체 정책:
 * - 캔버스 내부 편집이 없고 기준 해시가 맞으면 제자리 안전 교체(`replaced`)
 * - 캔버스 내부 편집이 있거나 기준 해시가 어긋나면 기존 레이어를 보존하고 버전 분기(`branched`)
 * - 원본 파일이 삭제되면 캔버스 레이어를 지우지 않고 연결 해제 상태(`detached-missing`)로 유지
 */
export function resolveLinkedLayerReplacement(
  binding: LinkedLayerBinding,
  delta: Pick<HotReloadDeltaEvent, "kind" | "relativePath" | "sha256" | "previousSha256" | "detectedAt">,
): LinkedLayerReplacementResult {
  if (delta.kind === "deleted" || delta.sha256 === null) {
    return {
      outcome: "detached-missing",
      layerId: binding.layerId,
      relativePath: binding.relativePath,
      previousVersion: binding.version,
      nextVersion: binding.version,
      nextSyncedSourceSha256: binding.syncedSourceSha256,
      branch: null,
      reason: "원본 링크 파일이 삭제되어 캔버스 캐시 레이어를 보존한 채 연결을 해제했습니다.",
    };
  }

  if (binding.syncedSourceSha256 !== null && binding.syncedSourceSha256 === delta.sha256) {
    return {
      outcome: "unchanged",
      layerId: binding.layerId,
      relativePath: binding.relativePath,
      previousVersion: binding.version,
      nextVersion: binding.version,
      nextSyncedSourceSha256: binding.syncedSourceSha256,
      branch: null,
      reason: "동일한 SHA-256 해시이므로 링크 레이어를 교체하지 않았습니다.",
    };
  }

  const baseDiverged =
    binding.syncedSourceSha256 !== null
    && delta.previousSha256 !== null
    && binding.syncedSourceSha256 !== delta.previousSha256;

  if (binding.hasLocalCanvasEdits || baseDiverged) {
    const conflictReason: LinkedLayerConflictReason = binding.hasLocalCanvasEdits
      ? "local-canvas-edits"
      : "base-hash-diverged";
    const nextVersion = binding.version + 1;
    const branch: LinkedLayerVersionBranch = {
      branchId: `${binding.layerId}-v${nextVersion}-${delta.sha256.slice(0, 8)}`,
      branchLabel: `${binding.layerName} (외부 변경 v${nextVersion})`,
      layerId: binding.layerId,
      baseVersion: binding.version,
      nextVersion,
      baseSha256: binding.syncedSourceSha256,
      incomingSha256: delta.sha256,
      sidecarRelativePath: buildConflictBranchSidecarPath(
        binding.relativePath,
        nextVersion,
        delta.sha256,
      ),
      conflictReason,
      createdAt: delta.detectedAt,
    };
    return {
      outcome: "branched",
      layerId: binding.layerId,
      relativePath: binding.relativePath,
      previousVersion: binding.version,
      nextVersion: binding.version,
      nextSyncedSourceSha256: binding.syncedSourceSha256,
      branch,
      reason: conflictReason === "local-canvas-edits"
        ? "캔버스 내부 편집본과 충돌해 원본 레이어를 유지하고 새 버전 분기를 생성했습니다."
        : "기준 파일 해시가 달라 기존 레이어를 보존하고 새 버전 분기를 생성했습니다.",
    };
  }

  return {
    outcome: "replaced",
    layerId: binding.layerId,
    relativePath: binding.relativePath,
    previousVersion: binding.version,
    nextVersion: binding.version + 1,
    nextSyncedSourceSha256: delta.sha256,
    branch: null,
    reason: "충돌 없이 링크 레이어를 최신 파일 버전으로 안전 교체했습니다.",
  };
}

interface PersistedOfflineQueueDocument {
  readonly schemaVersion: typeof HOT_RELOAD_QUEUE_SCHEMA;
  readonly updatedAt: string;
  readonly items: readonly HotReloadOfflineQueueItem[];
}

export function hotReloadOfflineQueuePath(root: string): string {
  return join(root, HOT_RELOAD_QUEUE_DIRECTORY, HOT_RELOAD_QUEUE_FILE);
}

function isQueueItem(value: unknown): value is HotReloadOfflineQueueItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const delta = record.delta;
  if (typeof delta !== "object" || delta === null || Array.isArray(delta)) return false;
  const deltaRecord = delta as Record<string, unknown>;
  return (
    typeof record.queuedAt === "string"
    && typeof record.retryCount === "number"
    && (record.lastError === null || typeof record.lastError === "string")
    && typeof deltaRecord.relativePath === "string"
    && typeof deltaRecord.kind === "string"
    && typeof deltaRecord.eventId === "string"
  );
}

/** 오프라인 상태에서 발생한 SHA-256 델타를 경로 단위로 병합·보존하고 재연결 시 순차 재동기화한다. */
export class HotReloadOfflineQueue {
  readonly #items = new Map<string, HotReloadOfflineQueueItem>();

  get size(): number {
    return this.#items.size;
  }

  list(): readonly HotReloadOfflineQueueItem[] {
    return [...this.#items.values()];
  }

  clear(): void {
    this.#items.clear();
  }

  remove(relativePath: string): boolean {
    return this.#items.delete(relativePath);
  }

  enqueue(delta: HotReloadDeltaEvent, queuedAt = delta.detectedAt): void {
    const existing = this.#items.get(delta.relativePath);
    if (!existing) {
      this.#items.set(delta.relativePath, {
        delta,
        queuedAt,
        retryCount: 0,
        lastError: null,
      });
      return;
    }

    const previousKind = existing.delta.kind;
    const originalPreviousSha = existing.delta.previousSha256;

    if (previousKind === "created" && delta.kind === "deleted") {
      this.#items.delete(delta.relativePath);
      return;
    }

    if (
      previousKind === "deleted"
      && delta.kind === "created"
      && originalPreviousSha !== null
      && delta.sha256 === originalPreviousSha
    ) {
      this.#items.delete(delta.relativePath);
      return;
    }

    const mergedKind: HotReloadDeltaKind =
      previousKind === "created" && delta.kind === "updated"
        ? "created"
        : previousKind === "deleted" && delta.kind === "created"
          ? "updated"
          : delta.kind;

    this.#items.set(delta.relativePath, {
      delta: {
        ...delta,
        kind: mergedKind,
        previousSha256: originalPreviousSha,
      },
      queuedAt: existing.queuedAt,
      retryCount: existing.retryCount,
      lastError: existing.lastError,
    });
  }

  markFailed(relativePath: string, error: unknown): void {
    const existing = this.#items.get(relativePath);
    if (!existing) return;
    this.#items.set(relativePath, {
      ...existing,
      retryCount: existing.retryCount + 1,
      lastError: error instanceof Error ? error.message : String(error),
    });
  }

  async saveToDisk(root: string, now = new Date().toISOString()): Promise<void> {
    const path = hotReloadOfflineQueuePath(root);
    const directory = dirname(path);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporaryPath = join(directory, `${HOT_RELOAD_QUEUE_FILE}.${randomUUID()}.tmp`);
    const payload: PersistedOfflineQueueDocument = {
      schemaVersion: HOT_RELOAD_QUEUE_SCHEMA,
      updatedAt: now,
      items: this.list(),
    };
    await writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, path);
  }

  async loadFromDisk(root: string): Promise<number> {
    const path = hotReloadOfflineQueuePath(root);
    try {
      const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
      if (raw.schemaVersion !== HOT_RELOAD_QUEUE_SCHEMA || !Array.isArray(raw.items)) {
        return 0;
      }
      this.#items.clear();
      let loaded = 0;
      for (const candidate of raw.items) {
        if (!isQueueItem(candidate)) continue;
        this.#items.set(candidate.delta.relativePath, candidate);
        loaded += 1;
      }
      return loaded;
    } catch (error) {
      if (hasNodeErrorCode(error, "ENOENT")) return 0;
      throw error;
    }
  }
}
