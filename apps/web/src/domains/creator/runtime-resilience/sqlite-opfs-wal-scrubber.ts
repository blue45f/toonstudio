/**
 * SQLite WASM + OPFS 원고 페이지별 SHA-256 백그라운드 무결성 스크럽,
 * WAL 체크포인트 스케줄러, 전원 차단·손상 페이지 자동 롤백 복구기.
 *
 * - 브라우저 KV 계층을 전혀 호출하지 않고 SQLite WASM / OPFS 포트 계약으로만 동작한다.
 * - 순수 TypeScript FIPS 180-4 SHA-256과 WebCrypto SHA-256을 함께 지원해
 *   워커·오프라인·비보안 컨텍스트에서도 결정적 무결성 검증을 보장한다.
 */

export type SqliteWalCheckpointMode = "PASSIVE" | "FULL" | "RESTART" | "TRUNCATE";
export type PageCorruptionReason = "checksum-mismatch" | "missing-page" | "truncated-page" | "wal-unclean-shutdown";
export type IntegrityScrubStatus = "healthy" | "corrupted" | "recovered" | "unrecoverable";
export type WalScheduleActionKind = "none" | "passive-checkpoint" | "truncate-checkpoint" | "scrub-and-recover";

export interface SqliteWalStatus {
  readonly pendingFrames: number;
  readonly walBytes: number;
  readonly checkpointGeneration: number;
  readonly uncleanShutdownDetected: boolean;
}

export interface WalCheckpointExecResult {
  readonly mode: SqliteWalCheckpointMode;
  readonly checkpointedFrames: number;
  readonly remainingFrames: number;
  readonly walBytesAfter: number;
  readonly checkpointGeneration: number;
}

export interface ManuscriptPageDigestEntry {
  readonly pageId: string;
  readonly sha256: string;
  readonly byteLength: number;
  readonly capturedAtMs: number;
}

export interface ManuscriptCheckpointRecord {
  readonly checkpointId: string;
  readonly generation: number;
  readonly reason: string;
  readonly capturedAtMs: number;
  readonly manifestSha256: string;
  readonly pages: readonly ManuscriptPageDigestEntry[];
  readonly pageBlobs: Readonly<Record<string, Uint8Array>>;
}

export interface SqliteOpfsManuscriptPort {
  listPageIds(): Promise<readonly string[]> | readonly string[];
  readPageBytes(pageId: string): Promise<Uint8Array | null> | Uint8Array | null;
  writePageBytes(pageId: string, bytes: Uint8Array): Promise<void> | void;
  deletePageBytes?(pageId: string): Promise<void> | void;
  readWalStatus(): Promise<SqliteWalStatus> | SqliteWalStatus;
  executeWalCheckpoint(mode: SqliteWalCheckpointMode): Promise<WalCheckpointExecResult> | WalCheckpointExecResult;
  saveCheckpointSnapshot(snapshot: ManuscriptCheckpointRecord): Promise<void> | void;
  listCheckpointSnapshots(): Promise<readonly ManuscriptCheckpointRecord[]> | readonly ManuscriptCheckpointRecord[];
  deleteCheckpointSnapshot?(checkpointId: string): Promise<void> | void;
}

export interface CorruptedPageFinding {
  readonly pageId: string;
  readonly reason: PageCorruptionReason;
  readonly expectedSha256: string | null;
  readonly actualSha256: string | null;
  readonly expectedByteLength: number | null;
  readonly actualByteLength: number | null;
}

export interface RollbackRecoveryReceipt {
  readonly restoredCheckpointId: string;
  readonly restoredGeneration: number;
  readonly skippedCorruptCheckpointIds: readonly string[];
  readonly restoredPageIds: readonly string[];
  readonly verifiedAfterRestore: boolean;
  readonly walCheckpointAfterRestore: WalCheckpointExecResult;
  readonly recoveredAtMs: number;
}

export interface IntegrityScrubReport {
  readonly status: IntegrityScrubStatus;
  readonly checkedPageCount: number;
  readonly baselineCheckpointId: string | null;
  readonly findings: readonly CorruptedPageFinding[];
  readonly walStatus: SqliteWalStatus;
  readonly recovery: RollbackRecoveryReceipt | null;
  readonly durationMs: number;
}

export interface WalCheckpointSchedulePolicy {
  readonly maxWalFrames: number;
  readonly maxWalBytes: number;
  readonly emergencyWalBytes: number;
  readonly checkpointIntervalMs: number;
  readonly scrubIntervalMs: number;
  readonly maxRetainedCheckpoints: number;
}

export const DEFAULT_WAL_CHECKPOINT_POLICY: WalCheckpointSchedulePolicy = Object.freeze({
  maxWalFrames: 256,
  maxWalBytes: 4 * 1024 * 1024,
  emergencyWalBytes: 16 * 1024 * 1024,
  checkpointIntervalMs: 60_000,
  scrubIntervalMs: 180_000,
  maxRetainedCheckpoints: 8,
});

export interface WalScheduleDecision {
  readonly action: WalScheduleActionKind;
  readonly reason: string;
  readonly deferredForActiveDrawing: boolean;
}

export interface WalSchedulerTickResult {
  readonly decision: WalScheduleDecision;
  readonly checkpoint: ManuscriptCheckpointRecord | null;
  readonly scrubReport: IntegrityScrubReport | null;
  readonly walExecResult: WalCheckpointExecResult | null;
}

export interface SqliteOpfsWalScrubberOptions {
  readonly port: SqliteOpfsManuscriptPort;
  readonly policy?: Partial<WalCheckpointSchedulePolicy>;
  readonly nowMs?: () => number;
}

export interface ScrubIntegrityOptions {
  readonly autoRollback?: boolean;
  readonly maxPagesPerPass?: number;
}

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_INIT: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/**
 * 순수 TypeScript FIPS 180-4 SHA-256 해시 계산기(동기, 외부 의존성 0).
 */
export function sha256HexSync(data: Uint8Array): string {
  const paddedLength = (((data.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(data);
  padded[data.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor((data.length * 8) / 0x100000000) >>> 0, false);
  view.setUint32(paddedLength - 4, (data.length * 8) >>> 0, false);

  const h = Uint32Array.from(SHA256_INIT);
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + SHA256_K[i]! + w[i]!) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  return Array.from(h, (word) => word.toString(16).padStart(8, "0")).join("");
}

/**
 * WebCrypto SubtleCrypto가 있으면 하드웨어 가속 SHA-256을 사용하고,
 * 미지원 환경에서는 순수 TypeScript SHA-256으로 자동 폴백한다.
 */
export async function computePageSha256Hex(data: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return sha256HexSync(data);
  try {
    const owned = new Uint8Array(data.byteLength);
    owned.set(data);
    const digest = new Uint8Array(await subtle.digest("SHA-256", owned));
    let hex = "";
    for (let i = 0; i < digest.length; i += 1) hex += (digest[i] ?? 0).toString(16).padStart(2, "0");
    return hex;
  } catch {
    return sha256HexSync(data);
  }
}

function computeManifestSha256(pages: readonly ManuscriptPageDigestEntry[]): string {
  const canonical = [...pages]
    .sort((a, b) => a.pageId.localeCompare(b.pageId))
    .map((entry) => `${entry.pageId}:${entry.byteLength}:${entry.sha256}`)
    .join("\n");
  return sha256HexSync(new TextEncoder().encode(canonical));
}

function cloneBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

/**
 * 체크포인트 스냅샷 자체의 매니페스트 및 모든 페이지 블롭 SHA-256 무결성을 검증한다.
 */
export async function verifyCheckpointSnapshotIntegrity(checkpoint: ManuscriptCheckpointRecord): Promise<boolean> {
  if (computeManifestSha256(checkpoint.pages) !== checkpoint.manifestSha256) return false;
  for (const entry of checkpoint.pages) {
    const blob = checkpoint.pageBlobs[entry.pageId];
    if (!blob || blob.byteLength !== entry.byteLength) return false;
    if ((await computePageSha256Hex(blob)) !== entry.sha256) return false;
  }
  return true;
}

/**
 * WAL 체크포인트 및 무결성 스크럽 실행 시점을 결정하는 순수 정책 함수.
 */
export function evaluateWalScheduleDecision(input: {
  readonly nowMs: number;
  readonly lastCheckpointAtMs: number;
  readonly lastScrubAtMs: number;
  readonly walStatus: SqliteWalStatus;
  readonly isActivelyDrawing: boolean;
  readonly policy?: WalCheckpointSchedulePolicy;
}): WalScheduleDecision {
  const policy = input.policy ?? DEFAULT_WAL_CHECKPOINT_POLICY;

  if (input.walStatus.uncleanShutdownDetected) {
    return {
      action: "scrub-and-recover",
      reason: "비정상 전원 차단 WAL 흔적이 감지되어 즉시 무결성 스크럽 및 복구를 실행합니다.",
      deferredForActiveDrawing: false,
    };
  }
  if (input.walStatus.walBytes >= policy.emergencyWalBytes) {
    return {
      action: "truncate-checkpoint",
      reason: "WAL 크기가 긴급 상한에 도달해 즉시 TRUNCATE 체크포인트를 수행합니다.",
      deferredForActiveDrawing: false,
    };
  }

  const walLimitReached =
    input.walStatus.pendingFrames >= policy.maxWalFrames || input.walStatus.walBytes >= policy.maxWalBytes;
  const intervalElapsed =
    input.walStatus.pendingFrames > 0 && input.nowMs - input.lastCheckpointAtMs >= policy.checkpointIntervalMs;

  if (walLimitReached || intervalElapsed) {
    return input.isActivelyDrawing
      ? {
          action: "passive-checkpoint",
          reason: "작화 중 프레임 드롭을 피하기 위해 비차단 PASSIVE WAL 체크포인트를 수행합니다.",
          deferredForActiveDrawing: true,
        }
      : {
          action: "truncate-checkpoint",
          reason: "유휴 구간에서 WAL 프레임을 정리하고 검증된 체크포인트를 기록합니다.",
          deferredForActiveDrawing: false,
        };
  }

  if (input.nowMs - input.lastScrubAtMs >= policy.scrubIntervalMs && !input.isActivelyDrawing) {
    return {
      action: "scrub-and-recover",
      reason: "주기적 백그라운드 원고 페이지 SHA-256 무결성 스크럽을 실행합니다.",
      deferredForActiveDrawing: false,
    };
  }

  return {
    action: "none",
    reason: "WAL 크기와 스크럽 주기가 정상 예산 범위 안에 있습니다.",
    deferredForActiveDrawing: false,
  };
}

/**
 * SQLite WASM + OPFS 원고 페이지 SHA-256 스크럽·체크포인트·자동 롤백 복구 오케스트레이터.
 */
export class SqliteOpfsWalScrubber {
  private readonly port: SqliteOpfsManuscriptPort;
  private readonly policy: WalCheckpointSchedulePolicy;
  private readonly nowMs: () => number;

  private lastCheckpointAtMs = 0;
  private lastScrubAtMs = 0;
  private checkpointCounter = 0;
  private totalCheckpoints = 0;
  private totalScrubs = 0;
  private totalRollbacks = 0;
  private deferredWhileDrawingCount = 0;
  private scrubCursor = 0;

  constructor(options: SqliteOpfsWalScrubberOptions) {
    this.port = options.port;
    this.policy = { ...DEFAULT_WAL_CHECKPOINT_POLICY, ...options.policy };
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  /**
   * WAL 체크포인트를 실행하고 모든 원고 페이지의 SHA-256 다이제스트와 불변 스냅샷을 저장한다.
   */
  public async captureVerifiedCheckpoint(
    reason: string,
    mode: SqliteWalCheckpointMode = "TRUNCATE",
  ): Promise<ManuscriptCheckpointRecord> {
    const capturedAtMs = this.nowMs();
    const walResult = await this.port.executeWalCheckpoint(mode);
    const pageIds = [...(await this.port.listPageIds())].sort();

    const pages: ManuscriptPageDigestEntry[] = [];
    const pageBlobs: Record<string, Uint8Array> = {};
    for (const pageId of pageIds) {
      const bytes = await this.port.readPageBytes(pageId);
      if (bytes === null) continue;
      const cloned = cloneBytes(bytes);
      pages.push({ pageId, sha256: await computePageSha256Hex(cloned), byteLength: cloned.byteLength, capturedAtMs });
      pageBlobs[pageId] = cloned;
    }

    this.checkpointCounter += 1;
    const checkpoint: ManuscriptCheckpointRecord = {
      checkpointId: `ckpt-${walResult.checkpointGeneration}-${this.checkpointCounter}`,
      generation: walResult.checkpointGeneration,
      reason,
      capturedAtMs,
      manifestSha256: computeManifestSha256(pages),
      pages,
      pageBlobs,
    };

    await this.port.saveCheckpointSnapshot(checkpoint);
    await this.pruneExcessCheckpoints();
    this.lastCheckpointAtMs = capturedAtMs;
    this.totalCheckpoints += 1;
    return checkpoint;
  }

  private async pruneExcessCheckpoints(): Promise<void> {
    if (!this.port.deleteCheckpointSnapshot) return;
    const snapshots = [...(await this.port.listCheckpointSnapshots())].sort(
      (a, b) => b.capturedAtMs - a.capturedAtMs || b.generation - a.generation,
    );
    for (let i = Math.max(1, this.policy.maxRetainedCheckpoints); i < snapshots.length; i += 1) {
      const stale = snapshots[i];
      if (stale) await this.port.deleteCheckpointSnapshot(stale.checkpointId);
    }
  }

  private async selectLatestVerifiedCheckpoint(): Promise<{
    readonly checkpoint: ManuscriptCheckpointRecord | null;
    readonly skippedIds: readonly string[];
  }> {
    const snapshots = [...(await this.port.listCheckpointSnapshots())].sort(
      (a, b) => b.capturedAtMs - a.capturedAtMs || b.generation - a.generation,
    );
    const skippedIds: string[] = [];
    for (const candidate of snapshots) {
      if (await verifyCheckpointSnapshotIntegrity(candidate)) return { checkpoint: candidate, skippedIds };
      skippedIds.push(candidate.checkpointId);
    }
    return { checkpoint: null, skippedIds };
  }

  /**
   * 원고 페이지별 SHA-256 무결성과 비정상 종료 WAL 상태를 검사하고,
   * 손상이 탐지되면 검증된 직전 정상 체크포인트로 자동 롤백 복구한다.
   */
  public async scrubIntegrity(options?: ScrubIntegrityOptions): Promise<IntegrityScrubReport> {
    const startedAtMs = this.nowMs();
    const autoRollback = options?.autoRollback ?? true;
    const walStatus = await this.port.readWalStatus();
    const { checkpoint: baseline } = await this.selectLatestVerifiedCheckpoint();

    const findings: CorruptedPageFinding[] = [];
    let checkedPageCount = 0;

    if (walStatus.uncleanShutdownDetected) {
      findings.push({
        pageId: "__wal__",
        reason: "wal-unclean-shutdown",
        expectedSha256: baseline?.manifestSha256 ?? null,
        actualSha256: null,
        expectedByteLength: null,
        actualByteLength: walStatus.walBytes,
      });
    }

    if (baseline !== null) {
      const expectedPages = baseline.pages;
      const limit = options?.maxPagesPerPass && options.maxPagesPerPass > 0
        ? Math.min(options.maxPagesPerPass, expectedPages.length)
        : expectedPages.length;

      for (let i = 0; i < limit; i += 1) {
        const expected = expectedPages[(this.scrubCursor + i) % expectedPages.length]!;
        const actualBytes = await this.port.readPageBytes(expected.pageId);
        checkedPageCount += 1;

        if (actualBytes === null) {
          findings.push({
            pageId: expected.pageId,
            reason: "missing-page",
            expectedSha256: expected.sha256,
            actualSha256: null,
            expectedByteLength: expected.byteLength,
            actualByteLength: null,
          });
          continue;
        }
        const actualSha = await computePageSha256Hex(actualBytes);
        if (expected.byteLength > 0 && actualBytes.byteLength === 0) {
          findings.push({
            pageId: expected.pageId,
            reason: "truncated-page",
            expectedSha256: expected.sha256,
            actualSha256: actualSha,
            expectedByteLength: expected.byteLength,
            actualByteLength: 0,
          });
        } else if (actualSha !== expected.sha256 || actualBytes.byteLength !== expected.byteLength) {
          findings.push({
            pageId: expected.pageId,
            reason: "checksum-mismatch",
            expectedSha256: expected.sha256,
            actualSha256: actualSha,
            expectedByteLength: expected.byteLength,
            actualByteLength: actualBytes.byteLength,
          });
        }
      }
      if (expectedPages.length > 0) this.scrubCursor = (this.scrubCursor + limit) % expectedPages.length;
    }

    this.lastScrubAtMs = this.nowMs();
    this.totalScrubs += 1;

    if (findings.length === 0) {
      return {
        status: "healthy",
        checkedPageCount,
        baselineCheckpointId: baseline?.checkpointId ?? null,
        findings,
        walStatus,
        recovery: null,
        durationMs: Math.max(0, this.nowMs() - startedAtMs),
      };
    }

    if (!autoRollback) {
      return {
        status: "corrupted",
        checkedPageCount,
        baselineCheckpointId: baseline?.checkpointId ?? null,
        findings,
        walStatus,
        recovery: null,
        durationMs: Math.max(0, this.nowMs() - startedAtMs),
      };
    }

    const recovery = await this.rollbackToLastHealthyCheckpoint();
    return {
      status: recovery !== null && recovery.verifiedAfterRestore ? "recovered" : "unrecoverable",
      checkedPageCount,
      baselineCheckpointId: baseline?.checkpointId ?? null,
      findings,
      walStatus: await this.port.readWalStatus(),
      recovery,
      durationMs: Math.max(0, this.nowMs() - startedAtMs),
    };
  }

  /**
   * 보유한 체크포인트 중 가장 최신이면서 자체 SHA-256이 완전한 스냅샷으로 원고를 롤백 복구한다.
   */
  public async rollbackToLastHealthyCheckpoint(): Promise<RollbackRecoveryReceipt | null> {
    const { checkpoint, skippedIds } = await this.selectLatestVerifiedCheckpoint();
    if (checkpoint === null) return null;

    const restoredPageIds: string[] = [];
    for (const entry of checkpoint.pages) {
      const blob = checkpoint.pageBlobs[entry.pageId];
      if (!blob) return null;
      await this.port.writePageBytes(entry.pageId, cloneBytes(blob));
      restoredPageIds.push(entry.pageId);
    }

    const walAfter = await this.port.executeWalCheckpoint("TRUNCATE");
    let verifiedAfterRestore = true;
    for (const entry of checkpoint.pages) {
      const readBack = await this.port.readPageBytes(entry.pageId);
      if (
        readBack === null
        || readBack.byteLength !== entry.byteLength
        || (await computePageSha256Hex(readBack)) !== entry.sha256
      ) {
        verifiedAfterRestore = false;
        break;
      }
    }
    if (verifiedAfterRestore) this.totalRollbacks += 1;

    return {
      restoredCheckpointId: checkpoint.checkpointId,
      restoredGeneration: checkpoint.generation,
      skippedCorruptCheckpointIds: skippedIds,
      restoredPageIds,
      verifiedAfterRestore,
      walCheckpointAfterRestore: walAfter,
      recoveredAtMs: this.nowMs(),
    };
  }

  /**
   * 스케줄러 1틱을 평가·실행한다(작화 중 PASSIVE, 유휴 시 TRUNCATE/스크럽, 전원 차단 시 즉시 복구).
   */
  public async tick(isActivelyDrawing: boolean): Promise<WalSchedulerTickResult> {
    const now = this.nowMs();
    const decision = evaluateWalScheduleDecision({
      nowMs: now,
      lastCheckpointAtMs: this.lastCheckpointAtMs,
      lastScrubAtMs: this.lastScrubAtMs,
      walStatus: await this.port.readWalStatus(),
      isActivelyDrawing,
      policy: this.policy,
    });
    if (decision.deferredForActiveDrawing) this.deferredWhileDrawingCount += 1;

    if (decision.action === "none") {
      return { decision, checkpoint: null, scrubReport: null, walExecResult: null };
    }
    if (decision.action === "passive-checkpoint") {
      const walExecResult = await this.port.executeWalCheckpoint("PASSIVE");
      this.lastCheckpointAtMs = now;
      this.totalCheckpoints += 1;
      return { decision, checkpoint: null, scrubReport: null, walExecResult };
    }
    if (decision.action === "truncate-checkpoint") {
      return { decision, checkpoint: await this.captureVerifiedCheckpoint(decision.reason, "TRUNCATE"), scrubReport: null, walExecResult: null };
    }
    return { decision, checkpoint: null, scrubReport: await this.scrubIntegrity({ autoRollback: true }), walExecResult: null };
  }

  public getTelemetry() {
    return {
      totalCheckpoints: this.totalCheckpoints,
      totalScrubs: this.totalScrubs,
      totalRollbacks: this.totalRollbacks,
      deferredWhileDrawingCount: this.deferredWhileDrawingCount,
      lastCheckpointAtMs: this.lastCheckpointAtMs,
      lastScrubAtMs: this.lastScrubAtMs,
    };
  }
}

export interface InMemorySqliteOpfsPort extends SqliteOpfsManuscriptPort {
  recordWalMutation(pageId: string, bytes: Uint8Array, addedFrames?: number): void;
  simulatePageBitFlip(pageId: string, byteIndex?: number): void;
  simulatePageTruncation(pageId: string): void;
  simulatePowerLossUncleanWal(extraWalBytes?: number): void;
  corruptCheckpointSnapshot(checkpointId: string, pageId: string): void;
}

/**
 * 단위 테스트·로컬 시뮬레이션용 SQLite WASM + OPFS 원고 포트 인메모리 구현체.
 */
export function createInMemorySqliteOpfsPort(
  initialPages?: Readonly<Record<string, Uint8Array>>,
): InMemorySqliteOpfsPort {
  const pages = new Map<string, Uint8Array>();
  if (initialPages) {
    for (const [pageId, bytes] of Object.entries(initialPages)) pages.set(pageId, cloneBytes(bytes));
  }
  const checkpoints = new Map<string, ManuscriptCheckpointRecord>();
  let pendingFrames = 0;
  let walBytes = 0;
  let checkpointGeneration = 0;
  let uncleanShutdownDetected = false;

  return {
    listPageIds: () => [...pages.keys()].sort(),
    readPageBytes: (pageId) => {
      const found = pages.get(pageId);
      return found ? cloneBytes(found) : null;
    },
    writePageBytes: (pageId, bytes) => {
      pages.set(pageId, cloneBytes(bytes));
    },
    deletePageBytes: (pageId) => {
      pages.delete(pageId);
    },
    readWalStatus: () => ({ pendingFrames, walBytes, checkpointGeneration, uncleanShutdownDetected }),
    executeWalCheckpoint: (mode) => {
      const framesBefore = pendingFrames;
      checkpointGeneration += 1;
      if (mode === "PASSIVE") {
        const flushed = Math.ceil(pendingFrames * 0.75);
        pendingFrames = Math.max(0, pendingFrames - flushed);
        walBytes = Math.round(walBytes * 0.25);
        return { mode, checkpointedFrames: flushed, remainingFrames: pendingFrames, walBytesAfter: walBytes, checkpointGeneration };
      }
      pendingFrames = 0;
      walBytes = 0;
      uncleanShutdownDetected = false;
      return { mode, checkpointedFrames: framesBefore, remainingFrames: 0, walBytesAfter: 0, checkpointGeneration };
    },
    saveCheckpointSnapshot: (snapshot) => {
      const clonedBlobs: Record<string, Uint8Array> = {};
      for (const [pageId, blob] of Object.entries(snapshot.pageBlobs)) clonedBlobs[pageId] = cloneBytes(blob);
      checkpoints.set(snapshot.checkpointId, { ...snapshot, pages: [...snapshot.pages], pageBlobs: clonedBlobs });
    },
    listCheckpointSnapshots: () => [...checkpoints.values()],
    deleteCheckpointSnapshot: (checkpointId) => {
      checkpoints.delete(checkpointId);
    },
    recordWalMutation: (pageId, bytes, addedFrames = 1) => {
      pages.set(pageId, cloneBytes(bytes));
      pendingFrames += Math.max(1, Math.trunc(addedFrames));
      walBytes += bytes.byteLength + 32;
    },
    simulatePageBitFlip: (pageId, byteIndex = 0) => {
      const current = pages.get(pageId);
      if (!current || current.byteLength === 0) return;
      const idx = Math.min(current.byteLength - 1, Math.max(0, byteIndex));
      const mutated = cloneBytes(current);
      mutated[idx] = (mutated[idx] ?? 0) ^ 0xff;
      pages.set(pageId, mutated);
    },
    simulatePageTruncation: (pageId) => {
      if (pages.has(pageId)) pages.set(pageId, new Uint8Array(0));
    },
    simulatePowerLossUncleanWal: (extraWalBytes = 4096) => {
      uncleanShutdownDetected = true;
      pendingFrames += 12;
      walBytes += extraWalBytes;
    },
    corruptCheckpointSnapshot: (checkpointId, pageId) => {
      const existing = checkpoints.get(checkpointId);
      const targetBlob = existing?.pageBlobs[pageId];
      if (!existing || !targetBlob || targetBlob.byteLength === 0) return;
      const mutated = cloneBytes(targetBlob);
      mutated[0] = (mutated[0] ?? 0) ^ 0x5a;
      checkpoints.set(checkpointId, { ...existing, pageBlobs: { ...existing.pageBlobs, [pageId]: mutated } });
    },
  };
}

export function createSqliteOpfsWalScrubber(options: SqliteOpfsWalScrubberOptions): SqliteOpfsWalScrubber {
  return new SqliteOpfsWalScrubber(options);
}
