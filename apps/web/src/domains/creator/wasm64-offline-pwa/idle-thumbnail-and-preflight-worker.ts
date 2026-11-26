/**
 * 비차단 유휴 슬라이스(`maxSliceMs = 4.0`) 기반 백그라운드 컷 썸네일 및 내보내기 프리플라이트 워커.
 *
 * - 유휴 슬라이스마다 RGBA8 이중선형 박스 다운샘플링(예: `800×1200 → 160×240`), FNV-1a 콘텐츠 해시 중복 제거,
 *   Rights BOM·색 프로파일·해상도·네이버/카카오 세로 폭(`>= 800px`) 프리플라이트 검증을 점진적으로 수행한다.
 * - 결과를 `(pageId, revisionHash)` 바운드 LRU 캐시에 메모이제이션해 내보내기 클릭 시 0ms 웜 캐시 히트를
 *   제공하고, 페이지 편집·무효화 시 즉시 이전 리비전을 폐기한다.
 */

export const DEFAULT_IDLE_MAX_SLICE_MS = 4.0;
export const DEFAULT_THUMBNAIL_WIDTH = 160;
export const DEFAULT_THUMBNAIL_HEIGHT = 240;
export const DEFAULT_PRECOMPUTE_CACHE_ENTRIES = 64;
export const DEFAULT_THUMBNAIL_ROWS_PER_CHUNK = 16;
export const MIN_WEBTOON_STRIP_WIDTH_PX = 800;
export const MAX_RECOMMENDED_SLICE_HEIGHT_PX = 20000;

export type ExportPlatformTarget = "naver-webtoon" | "kakao-webtoon" | "global-scroll" | "print-cmyk" | "custom";
export type ColorProfileName = "srgb" | "display-p3" | "adobe-rgb" | "cmyk" | "unknown";
export type RightsLicenseTier = "cc0" | "commercial-cleared" | "editorial-only" | "personal-only" | "unlicensed" | "expired";
export type RightsBomAssetKind = "brush" | "font" | "3d-bg" | "vrm" | "texture" | "audio" | "other";
export type IdleJobPriority = "high" | "normal" | "low";
export type CutPrecomputeCancelReason = "aborted" | "superseded" | "invalidated" | "disposed";
export type PreflightIssueCode =
  | "RIGHTS_UNLICENSED_COMMERCIAL" | "RIGHTS_ATTRIBUTION_MISSING" | "COLOR_PROFILE_MISMATCH"
  | "RESOLUTION_DPI_TOO_LOW" | "RESOLUTION_DIMENSION_MISMATCH" | "BUFFER_DIMENSION_MISMATCH"
  | "STRIP_WIDTH_TOO_NARROW" | "STRIP_HEIGHT_NEEDS_SLICING";

export interface RightsBomAssetItem {
  readonly assetId: string; readonly name: string; readonly kind: RightsBomAssetKind; readonly licenseTier: RightsLicenseTier;
  readonly commercialAllowed?: boolean; readonly expiresAtMs?: number;
  readonly attributionRequired?: boolean; readonly attributionProvided?: boolean;
}
export interface PreflightIssue {
  readonly code: PreflightIssueCode; readonly severity: "error" | "warning";
  readonly message: string; readonly assetId?: string; readonly expected?: string; readonly actual?: string;
}
export interface ExportPreflightInput {
  readonly width: number; readonly height: number; readonly dpi: number;
  readonly colorProfile: ColorProfileName; readonly exportTarget: ExportPlatformTarget;
  readonly commercialUse?: boolean; readonly rightsBom?: readonly RightsBomAssetItem[];
  readonly expectedColorProfile?: ColorProfileName; readonly strictColorProfile?: boolean;
  readonly minDpi?: number; readonly minStripWidthPx?: number;
  readonly requiredWidth?: number; readonly requiredHeight?: number;
  readonly rgbaByteLength?: number; readonly nowEpochMs?: number;
}
export interface ExportPreflightReport {
  readonly ok: boolean; readonly canExport: boolean; readonly exportTarget: ExportPlatformTarget;
  readonly errorCount: number; readonly warningCount: number;
  readonly unlicensedAssetIds: readonly string[]; readonly issues: readonly PreflightIssue[];
}
export interface DownsampledThumbnail {
  readonly width: number; readonly height: number; readonly sourceWidth: number; readonly sourceHeight: number;
  readonly rgba: Uint8ClampedArray; readonly contentHash: string; readonly deduplicated: boolean;
}
export interface CutPrecomputeJob extends Omit<ExportPreflightInput, "rgbaByteLength"> {
  readonly pageId: string; readonly revisionHash: string; readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly thumbnailWidth?: number; readonly thumbnailHeight?: number;
  readonly priority?: IdleJobPriority; readonly signal?: AbortSignal;
}
export interface CutPrecomputeResult {
  readonly pageId: string; readonly revisionHash: string; readonly contentHash: string;
  readonly thumbnail: DownsampledThumbnail; readonly preflight: ExportPreflightReport;
  readonly computedAtMs: number; readonly computeMs: number; readonly slicesUsed: number; readonly cacheHit: boolean;
}
export type CutPrecomputeOutcome =
  | { readonly status: "completed"; readonly result: CutPrecomputeResult }
  | { readonly status: "cancelled"; readonly pageId: string; readonly revisionHash: string; readonly reason: CutPrecomputeCancelReason };
export interface IdleSliceYieldContext {
  readonly sliceIndex: number; readonly sliceDurationMs: number; readonly maxSliceMs: number; readonly pendingJobs: number;
}
export interface IdlePrecomputeTelemetry {
  readonly warmCacheHits: number; readonly cacheMisses: number; readonly cacheSize: number;
  readonly maxCacheEntries: number; readonly lruEvictions: number;
  readonly thumbnailContentDedupHits: number; readonly thumbnailDedupCacheSize: number;
  readonly invalidations: number; readonly jobsCompleted: number; readonly jobsCancelled: number;
  readonly sliceCount: number; readonly yieldCount: number;
  readonly maxSliceMs: number; readonly peakSliceMs: number; readonly totalComputeMs: number;
}
export interface IdleThumbnailAndPreflightSchedulerOptions {
  readonly maxSliceMs?: number; readonly maxCacheEntries?: number; readonly maxThumbnailDedupEntries?: number;
  readonly defaultThumbnailWidth?: number; readonly defaultThumbnailHeight?: number; readonly rowsPerChunk?: number;
  readonly signal?: AbortSignal; readonly now?: () => number;
  readonly yieldToIdle?: (ctx: IdleSliceYieldContext) => Promise<void>;
}

const PRIORITY_RANK: Readonly<Record<IdleJobPriority, number>> = { high: 0, normal: 1, low: 2 };
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32비트 FNV-1a 바이트 해시 및 해상도 포함 8자리 16진 콘텐츠 해시 유틸. */
export function computeFnv1a32(data: Uint8Array | Uint8ClampedArray, seed = FNV_OFFSET): number {
  let hash = seed >>> 0;
  for (let i = 0; i < data.length; i += 1) hash = Math.imul(hash ^ (data[i] ?? 0), FNV_PRIME) >>> 0;
  return hash >>> 0;
}
export function computeRgbaContentHash(rgba: Uint8Array | Uint8ClampedArray, width: number, height: number): string {
  let seed = FNV_OFFSET; const header = `${width}x${height}:`;
  for (let i = 0; i < header.length; i += 1) seed = Math.imul(seed ^ header.charCodeAt(i), FNV_PRIME) >>> 0;
  return computeFnv1a32(rgba, seed).toString(16).padStart(8, "0");
}

/** 프리멀티플라이드 RGBA8 이중선형 박스 리샘플링을 행 범위(`[rowStart, rowEnd)`)에 수행한다. */
export function downsampleRgba8RowRange(
  src: Uint8Array | Uint8ClampedArray, srcW: number, srcH: number,
  dst: Uint8ClampedArray, dstW: number, dstH: number, rowStart: number, rowEnd: number,
): void {
  const scaleX = srcW / dstW; const scaleY = srcH / dstH;
  const halfX = Math.max(0.5, scaleX * 0.5); const halfY = Math.max(0.5, scaleY * 0.5);
  const endY = Math.min(dstH, rowEnd);
  for (let dy = Math.max(0, rowStart); dy < endY; dy += 1) {
    const cy = (dy + 0.5) * scaleY; const y0 = cy - halfY; const y1 = cy + halfY;
    const sy0 = Math.max(0, Math.floor(y0)); const sy1 = Math.min(srcH - 1, Math.ceil(y1) - 1);
    const rowOff = dy * dstW * 4;
    for (let dx = 0; dx < dstW; dx += 1) {
      const cx = (dx + 0.5) * scaleX; const x0 = cx - halfX; const x1 = cx + halfX;
      const sx0 = Math.max(0, Math.floor(x0)); const sx1 = Math.min(srcW - 1, Math.ceil(x1) - 1);
      let rS = 0; let gS = 0; let bS = 0; let aS = 0; let wS = 0;
      for (let sy = sy0; sy <= sy1; sy += 1) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
        if (wy <= 0) continue;
        const sRow = sy * srcW * 4;
        for (let sx = sx0; sx <= sx1; sx += 1) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          if (wx <= 0) continue;
          const w = wx * wy; const idx = sRow + sx * 4; const pa = (src[idx + 3] ?? 0) * w;
          rS += (src[idx] ?? 0) * pa; gS += (src[idx + 1] ?? 0) * pa; bS += (src[idx + 2] ?? 0) * pa; aS += pa; wS += w;
        }
      }
      const o = rowOff + dx * 4;
      dst[o + 3] = wS > 0 ? Math.round(aS / wS) : 0;
      if (aS > 0) { dst[o] = Math.round(rS / aS); dst[o + 1] = Math.round(gS / aS); dst[o + 2] = Math.round(bS / aS); }
      else { dst[o] = 0; dst[o + 1] = 0; dst[o + 2] = 0; }
    }
  }
}

/** RGBA8 버퍼를 지정 크기로 이중선형 박스 다운샘플링한다. */
export function downsampleRgba8BilinearBox(src: Uint8Array | Uint8ClampedArray, srcW: number, srcH: number, dstW: number, dstH: number): Uint8ClampedArray {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) throw new RangeError("원본 및 대상 크기는 양수여야 합니다.");
  if (src.length < srcW * srcH * 4) throw new RangeError(`RGBA8 버퍼 길이(${src.length})가 ${srcW}x${srcH}x4보다 작습니다.`);
  const dst = new Uint8ClampedArray(dstW * dstH * 4);
  downsampleRgba8RowRange(src, srcW, srcH, dst, dstW, dstH, 0, dstH);
  return dst;
}

/** Rights BOM 라이선스, 색 프로파일, 해상도·DPI, 네이버/카카오 세로 폭(`>= 800px`)을 검증한다. */
export function validateCutExportPreflight(input: ExportPreflightInput): ExportPreflightReport {
  const issues: PreflightIssue[] = [];
  const unlicensedAssetIds: string[] = [];
  const commercialUse = input.commercialUse ?? true;
  const nowEpochMs = input.nowEpochMs ?? Date.now();
  const isWebScroll = input.exportTarget === "naver-webtoon" || input.exportTarget === "kakao-webtoon" || input.exportTarget === "global-scroll";
  if (!Number.isFinite(input.width) || !Number.isFinite(input.height) || input.width <= 0 || input.height <= 0)
    issues.push({ code: "RESOLUTION_DIMENSION_MISMATCH", severity: "error", message: `유효하지 않은 캔버스 크기입니다(${input.width}×${input.height}).` });
  const expectedBytes = Math.max(0, Math.floor(input.width) * Math.floor(input.height) * 4);
  if (input.rgbaByteLength !== undefined && input.rgbaByteLength !== expectedBytes)
    issues.push({ code: "BUFFER_DIMENSION_MISMATCH", severity: "error", expected: `${expectedBytes}B`, actual: `${input.rgbaByteLength}B`, message: `픽셀 버퍼 크기가 선언 해상도(${input.width}×${input.height})와 다릅니다.` });
  const minStripWidth = input.minStripWidthPx ?? (isWebScroll ? MIN_WEBTOON_STRIP_WIDTH_PX : 0);
  if (minStripWidth > 0 && input.width < minStripWidth)
    issues.push({ code: "STRIP_WIDTH_TOO_NARROW", severity: "error", expected: `>= ${minStripWidth}px`, actual: `${input.width}px`, message: `${input.exportTarget} 세로 스크롤 최소 폭(${minStripWidth}px) 미만입니다(${input.width}px).` });
  if (isWebScroll && input.height > MAX_RECOMMENDED_SLICE_HEIGHT_PX)
    issues.push({ code: "STRIP_HEIGHT_NEEDS_SLICING", severity: "warning", expected: `<= ${MAX_RECOMMENDED_SLICE_HEIGHT_PX}px`, actual: `${input.height}px`, message: `단일 컷 세로 길이(${input.height}px)가 권장 슬라이스 상한을 초과합니다.` });
  if ((input.requiredWidth !== undefined && input.width !== input.requiredWidth) || (input.requiredHeight !== undefined && input.height !== input.requiredHeight))
    issues.push({ code: "RESOLUTION_DIMENSION_MISMATCH", severity: "error", expected: `${input.requiredWidth ?? input.width}×${input.requiredHeight ?? input.height}`, actual: `${input.width}×${input.height}`, message: "지정된 내보내기 해상도와 일치하지 않습니다." });
  const minDpi = input.minDpi ?? (input.exportTarget === "print-cmyk" ? 300 : 72);
  if (!Number.isFinite(input.dpi) || input.dpi < minDpi)
    issues.push({ code: "RESOLUTION_DPI_TOO_LOW", severity: "error", expected: `>= ${minDpi} DPI`, actual: `${input.dpi} DPI`, message: `해상도(${input.dpi} DPI)가 최소 기준(${minDpi} DPI) 미만입니다.` });
  const expectedProfile = input.expectedColorProfile ?? (input.exportTarget === "print-cmyk" ? "cmyk" : isWebScroll ? "srgb" : undefined);
  if (expectedProfile && input.colorProfile !== expectedProfile) {
    const severe = input.strictColorProfile !== false || input.colorProfile === "unknown"
      || (isWebScroll && input.colorProfile === "cmyk") || (input.exportTarget === "print-cmyk" && input.colorProfile !== "cmyk");
    issues.push({ code: "COLOR_PROFILE_MISMATCH", severity: severe ? "error" : "warning", expected: expectedProfile, actual: input.colorProfile, message: `색 프로파일(${input.colorProfile})이 권장 프로파일(${expectedProfile})과 다릅니다.` });
  }
  for (const item of input.rightsBom ?? []) {
    const expired = item.expiresAtMs !== undefined && item.expiresAtMs <= nowEpochMs;
    const allowed = !expired && (item.commercialAllowed ?? (item.licenseTier === "cc0" || item.licenseTier === "commercial-cleared"));
    if (commercialUse && !allowed) {
      unlicensedAssetIds.push(item.assetId);
      issues.push({ code: "RIGHTS_UNLICENSED_COMMERCIAL", severity: "error", assetId: item.assetId, expected: "commercial-cleared", actual: expired ? "expired" : item.licenseTier, message: `상업적 권한이 없는 에셋입니다: ${item.name} (${item.assetId}).` });
    }
    if (item.attributionRequired && !item.attributionProvided)
      issues.push({ code: "RIGHTS_ATTRIBUTION_MISSING", severity: "warning", assetId: item.assetId, message: `저작자 표기가 누락되었습니다: ${item.name} (${item.assetId}).` });
  }
  const errorCount = issues.filter((i) => i.severity === "error").length;
  return { ok: errorCount === 0, canExport: errorCount === 0, exportTarget: input.exportTarget, errorCount, warningCount: issues.length - errorCount, unlicensedAssetIds, issues };
}

function defaultYieldToIdle(): Promise<void> {
  const g = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  return typeof g.requestIdleCallback === "function"
    ? new Promise((r) => { g.requestIdleCallback?.(() => r(), { timeout: 16 }); })
    : new Promise((r) => { setTimeout(r, 0); });
}

interface InternalTask {
  readonly key: string; readonly job: CutPrecomputeJob; readonly dstW: number; readonly dstH: number;
  priority: IdleJobPriority; readonly seq: number; stage: "hash" | "thumbnail" | "preflight";
  nextRow: number; contentHash: string; dstRgba: Uint8ClampedArray | null; deduplicatedThumb: boolean;
  slicesUsed: number; lastSliceIndex: number; workMs: number; cancelledReason: CutPrecomputeCancelReason | null;
  readonly promise: Promise<CutPrecomputeOutcome>; readonly resolve: (o: CutPrecomputeOutcome) => void;
}
const makeCacheKey = (pageId: string, revisionHash: string): string => `${pageId}\0${revisionHash}`;

export class IdleThumbnailAndPreflightScheduler {
  readonly maxSliceMs: number;
  readonly maxCacheEntries: number;
  private readonly cfg: { maxDedup: number; thumbW: number; thumbH: number; rowsPerChunk: number };
  private readonly now: () => number;
  private readonly yieldToIdle: (ctx: IdleSliceYieldContext) => Promise<void>;
  private readonly globalSignal?: AbortSignal;
  private readonly resultLru = new Map<string, CutPrecomputeResult>();
  private readonly thumbDedupLru = new Map<string, Uint8ClampedArray>();
  private readonly queue: InternalTask[] = [];
  private readonly activeByKey = new Map<string, InternalTask>();
  private seqCounter = 0; private sliceCounter = 0; private pumping = false; private microtaskScheduled = false; private disposed = false;
  private readonly stats = {
    warmCacheHits: 0, cacheMisses: 0, lruEvictions: 0, thumbnailContentDedupHits: 0,
    invalidations: 0, jobsCompleted: 0, jobsCancelled: 0, yieldCount: 0, peakSliceMs: 0, totalComputeMs: 0,
  };

  constructor(options: IdleThumbnailAndPreflightSchedulerOptions = {}) {
    const maxSliceMs = options.maxSliceMs ?? DEFAULT_IDLE_MAX_SLICE_MS;
    const maxCacheEntries = options.maxCacheEntries ?? DEFAULT_PRECOMPUTE_CACHE_ENTRIES;
    if (!Number.isFinite(maxSliceMs) || maxSliceMs <= 0) throw new RangeError(`maxSliceMs는 양수여야 합니다: ${maxSliceMs}`);
    if (!Number.isSafeInteger(maxCacheEntries) || maxCacheEntries <= 0) throw new RangeError(`maxCacheEntries는 양의 정수여야 합니다: ${maxCacheEntries}`);
    this.maxSliceMs = maxSliceMs; this.maxCacheEntries = maxCacheEntries;
    this.cfg = { maxDedup: options.maxThumbnailDedupEntries ?? DEFAULT_PRECOMPUTE_CACHE_ENTRIES, thumbW: options.defaultThumbnailWidth ?? DEFAULT_THUMBNAIL_WIDTH, thumbH: options.defaultThumbnailHeight ?? DEFAULT_THUMBNAIL_HEIGHT, rowsPerChunk: Math.max(1, options.rowsPerChunk ?? DEFAULT_THUMBNAIL_ROWS_PER_CHUNK) };
    this.now = options.now ?? (() => performance.now());
    this.yieldToIdle = options.yieldToIdle ?? defaultYieldToIdle;
    this.globalSignal = options.signal;
    this.globalSignal?.addEventListener("abort", () => { this.cancelAll("aborted"); }, { once: true });
  }

  /** `(pageId, revisionHash)` 웜 캐시를 0ms 동기로 조회한다. */
  getWarmResult(pageId: string, revisionHash: string): CutPrecomputeResult | null {
    const key = makeCacheKey(pageId, revisionHash);
    const hit = this.resultLru.get(key);
    if (!hit) return null;
    this.resultLru.delete(key); this.resultLru.set(key, hit); this.stats.warmCacheHits += 1;
    return { ...hit, cacheHit: true, computeMs: 0, slicesUsed: 0 };
  }

  /** 유휴 슬라이스 큐에 컷 썸네일·프리플라이트 사전 계산을 예약한다. */
  schedulePage(job: CutPrecomputeJob): Promise<CutPrecomputeOutcome> {
    if (this.disposed) return Promise.resolve({ status: "cancelled", pageId: job.pageId, revisionHash: job.revisionHash, reason: "disposed" });
    const warm = this.getWarmResult(job.pageId, job.revisionHash);
    if (warm) return Promise.resolve({ status: "completed", result: warm });
    if (this.globalSignal?.aborted || job.signal?.aborted) { this.stats.jobsCancelled += 1; return Promise.resolve({ status: "cancelled", pageId: job.pageId, revisionHash: job.revisionHash, reason: "aborted" }); }
    const key = makeCacheKey(job.pageId, job.revisionHash);
    const existing = this.activeByKey.get(key);
    if (existing) {
      const nextPrio = job.priority ?? "normal";
      if (PRIORITY_RANK[nextPrio] < PRIORITY_RANK[existing.priority]) { existing.priority = nextPrio; this.sortQueue(); }
      return existing.promise;
    }
    this.evictPageEntries(job.pageId, key, "superseded");
    this.stats.cacheMisses += 1;
    let resolveOutcome!: (o: CutPrecomputeOutcome) => void;
    const promise = new Promise<CutPrecomputeOutcome>((resolve) => { resolveOutcome = resolve; });
    const task: InternalTask = {
      key, job, dstW: job.thumbnailWidth ?? this.cfg.thumbW, dstH: job.thumbnailHeight ?? this.cfg.thumbH,
      priority: job.priority ?? "normal", seq: (this.seqCounter += 1), stage: "hash", nextRow: 0,
      contentHash: "", dstRgba: null, deduplicatedThumb: false, slicesUsed: 0, lastSliceIndex: -1,
      workMs: 0, cancelledReason: null, promise, resolve: resolveOutcome,
    };
    job.signal?.addEventListener("abort", () => { this.cancelTask(task, "aborted"); }, { once: true });
    this.activeByKey.set(key, task); this.queue.push(task); this.sortQueue(); this.schedulePumpMicrotask();
    return promise;
  }

  /** 내보내기 클릭 시 0ms 웜 캐시 히트를 반환하거나, 미스 시 `high` 우선순위로 즉시 계산한다. */
  getOrComputeForExport(job: CutPrecomputeJob): Promise<CutPrecomputeOutcome> { return this.schedulePage({ ...job, priority: "high" }); }
  invalidatePage(pageId: string): number { return this.evictPageEntries(pageId, null, "invalidated"); }
  clearCache(): void { this.resultLru.clear(); this.thumbDedupLru.clear(); }
  cancelAll(reason: CutPrecomputeCancelReason = "aborted"): void { for (const t of Array.from(this.activeByKey.values())) this.cancelTask(t, reason); this.queue.length = 0; }
  dispose(): void { this.disposed = true; this.cancelAll("disposed"); this.clearCache(); }
  getTelemetry(): IdlePrecomputeTelemetry {
    return { ...this.stats, cacheSize: this.resultLru.size, maxCacheEntries: this.maxCacheEntries, thumbnailDedupCacheSize: this.thumbDedupLru.size, sliceCount: this.sliceCounter, maxSliceMs: this.maxSliceMs };
  }

  private schedulePumpMicrotask(): void {
    if (this.pumping || this.microtaskScheduled || this.disposed) return;
    this.microtaskScheduled = true;
    queueMicrotask(() => { this.microtaskScheduled = false; if (!this.pumping && this.queue.length > 0 && !this.disposed) { this.pumping = true; void this.runPump(); } });
  }

  private async runPump(): Promise<void> {
    try {
      while (this.queue.length > 0 && !this.disposed) {
        this.sliceCounter += 1; const sliceStart = this.now(); let didWork = false;
        while (this.queue.length > 0 && !this.disposed) {
          const task = this.queue[0];
          if (!task) break;
          if (task.cancelledReason) { this.queue.shift(); continue; }
          if (this.globalSignal?.aborted || task.job.signal?.aborted) { this.cancelTask(task, "aborted"); continue; }
          if (didWork && this.now() - sliceStart >= this.maxSliceMs) break;
          this.stepTask(task); didWork = true;
          if (this.now() - sliceStart >= this.maxSliceMs) break;
        }
        const sliceDurationMs = Math.max(0, this.now() - sliceStart);
        if (sliceDurationMs > this.stats.peakSliceMs) this.stats.peakSliceMs = sliceDurationMs;
        if (this.queue.length > 0 && !this.disposed) {
          this.stats.yieldCount += 1;
          await this.yieldToIdle({ sliceIndex: this.sliceCounter, sliceDurationMs, maxSliceMs: this.maxSliceMs, pendingJobs: this.queue.length });
        }
      }
    } finally { this.pumping = false; if (this.queue.length > 0 && !this.disposed) this.schedulePumpMicrotask(); }
  }

  private stepTask(task: InternalTask): void {
    const stepStart = this.now(); const { job } = task;
    if (task.lastSliceIndex !== this.sliceCounter) { task.lastSliceIndex = this.sliceCounter; task.slicesUsed += 1; }
    if (task.stage === "hash") {
      task.contentHash = computeRgbaContentHash(job.rgba, job.width, job.height);
      const dedupKey = `${task.contentHash}:${task.dstW}x${task.dstH}`;
      const cached = this.thumbDedupLru.get(dedupKey);
      if (cached) { this.thumbDedupLru.delete(dedupKey); this.thumbDedupLru.set(dedupKey, cached); task.dstRgba = cached; task.deduplicatedThumb = true; this.stats.thumbnailContentDedupHits += 1; task.stage = "preflight"; }
      else { task.dstRgba = new Uint8ClampedArray(task.dstW * task.dstH * 4); task.stage = "thumbnail"; }
    } else if (task.stage === "thumbnail") {
      const endRow = Math.min(task.dstH, task.nextRow + this.cfg.rowsPerChunk);
      if (task.dstRgba && job.width > 0 && job.height > 0 && job.rgba.length >= job.width * job.height * 4)
        downsampleRgba8RowRange(job.rgba, job.width, job.height, task.dstRgba, task.dstW, task.dstH, task.nextRow, endRow);
      task.nextRow = endRow;
      if (task.nextRow >= task.dstH) { if (task.dstRgba) this.setBoundedMap(this.thumbDedupLru, `${task.contentHash}:${task.dstW}x${task.dstH}`, task.dstRgba, this.cfg.maxDedup, false); task.stage = "preflight"; }
    } else {
      const preflight = validateCutExportPreflight({ ...job, rgbaByteLength: job.rgba.byteLength });
      const stepMs = Math.max(0, this.now() - stepStart); task.workMs += stepMs; this.stats.totalComputeMs += stepMs;
      const result: CutPrecomputeResult = {
        pageId: job.pageId, revisionHash: job.revisionHash, contentHash: task.contentHash,
        thumbnail: { width: task.dstW, height: task.dstH, sourceWidth: job.width, sourceHeight: job.height, rgba: task.dstRgba ?? new Uint8ClampedArray(task.dstW * task.dstH * 4), contentHash: task.contentHash, deduplicated: task.deduplicatedThumb },
        preflight, computedAtMs: this.now(), computeMs: task.workMs, slicesUsed: task.slicesUsed, cacheHit: false,
      };
      this.removeActiveTask(task); this.setBoundedMap(this.resultLru, task.key, result, this.maxCacheEntries, true);
      this.stats.jobsCompleted += 1; task.resolve({ status: "completed", result }); return;
    }
    const stepMs = Math.max(0, this.now() - stepStart); task.workMs += stepMs; this.stats.totalComputeMs += stepMs;
  }

  private evictPageEntries(pageId: string, keepKey: string | null, reason: CutPrecomputeCancelReason): number {
    let removed = 0; const prefix = `${pageId}\0`;
    for (const k of Array.from(this.resultLru.keys())) { if (k.startsWith(prefix) && k !== keepKey) { this.resultLru.delete(k); removed += 1; } }
    for (const t of Array.from(this.activeByKey.values())) { if (t.job.pageId === pageId && t.key !== keepKey) { this.cancelTask(t, reason); removed += 1; } }
    if (removed > 0) this.stats.invalidations += 1;
    return removed;
  }
  private cancelTask(task: InternalTask, reason: CutPrecomputeCancelReason): void {
    if (task.cancelledReason) return;
    task.cancelledReason = reason; this.removeActiveTask(task); this.stats.jobsCancelled += 1;
    task.resolve({ status: "cancelled", pageId: task.job.pageId, revisionHash: task.job.revisionHash, reason });
  }
  private removeActiveTask(task: InternalTask): void { this.activeByKey.delete(task.key); const i = this.queue.indexOf(task); if (i >= 0) this.queue.splice(i, 1); }
  private setBoundedMap<V>(map: Map<string, V>, key: string, value: V, limit: number, trackEviction: boolean): void {
    if (map.has(key)) map.delete(key);
    else if (map.size >= limit) { const oldest = map.keys().next().value; if (oldest !== undefined) { map.delete(oldest); if (trackEviction) this.stats.lruEvictions += 1; } }
    map.set(key, value);
  }
  private sortQueue(): void { this.queue.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.seq - b.seq); }
}
