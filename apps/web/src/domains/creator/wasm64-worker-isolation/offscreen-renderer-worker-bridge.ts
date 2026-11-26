/**
 * OffscreenCanvas 워커 렌더러 격리 브리지 (`OffscreenRendererWorkerBridge`).
 *
 * - `transferControlToOffscreen` 지원 여부를 탐지해 캔버스 소유권을 전용 렌더 워커로 이관하고,
 *   미지원 환경에서는 메인 스레드 `desynchronized: true` 2D 컨텍스트로 안전하게 폴백한다.
 * - 120~240Hz 스타일러스 coalesced 포인터 샘플을 `Float32Array` 전송 버퍼(6 floats / 24B)로
 *   배치 전송하며, 프레임 드랍 텔레메트리와 멱등 `dispose()` 정리를 보장한다.
 */

export const POINTER_POINT_STRIDE_FLOATS = 6;
export const POINTER_POINT_STRIDE_BYTES = POINTER_POINT_STRIDE_FLOATS * Float32Array.BYTES_PER_ELEMENT;
export const DEFAULT_TARGET_FPS = 120;
export const DEFAULT_MAX_BATCH_POINTS = 256;

export type OffscreenRendererMode = "unattached" | "offscreen-worker" | "main-thread-desynchronized";

export interface OffscreenRendererCapability {
  readonly hasOffscreenCanvas: boolean;
  readonly hasTransferControl: boolean;
  readonly hasWorker: boolean;
  readonly recommendedMode: "offscreen-worker" | "main-thread-desynchronized";
}

export interface OffscreenCanvasLike { readonly width: number; readonly height: number }
export interface WorkerMessageEventLike { readonly data: unknown }

export interface Canvas2DContextLike {
  lineWidth?: number; lineCap?: string;
  beginPath?(): void; moveTo?(x: number, y: number): void; lineTo?(x: number, y: number): void; stroke?(): void;
}

export interface TransferableCanvasLike {
  width: number; height: number;
  transferControlToOffscreen?: () => OffscreenCanvasLike;
  getContext?: (contextId: "2d", options?: { readonly desynchronized?: boolean; readonly alpha?: boolean }) => Canvas2DContextLike | null;
}

export interface OffscreenWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener?(type: string, listener: (event: WorkerMessageEventLike) => void): void;
  removeEventListener?(type: string, listener: (event: WorkerMessageEventLike) => void): void;
}

export interface CoalescedStylusPoint {
  readonly x: number; readonly y: number; readonly pressure?: number;
  readonly tiltX?: number; readonly tiltY?: number; readonly timestampMs?: number;
}

export interface PointerEventCoalescableLike {
  readonly x?: number; readonly y?: number; readonly clientX?: number; readonly clientY?: number;
  readonly pressure?: number; readonly tiltX?: number; readonly tiltY?: number; readonly timeStamp?: number;
  getCoalescedEvents?(): readonly PointerEventCoalescableLike[];
}

export type OffscreenWorkerInboundMessage =
  | { readonly type: "init"; readonly canvas: OffscreenCanvasLike; readonly width: number; readonly height: number; readonly dpr: number; readonly targetFps: number }
  | { readonly type: "resize"; readonly width: number; readonly height: number; readonly dpr: number }
  | { readonly type: "pointer-batch"; readonly sequence: number; readonly strokeId: number; readonly brushWidth: number; readonly pointCount: number; readonly strideFloats: number; readonly pointsBuffer: ArrayBuffer }
  | { readonly type: "dispose" };

export type OffscreenWorkerOutboundMessage =
  | { readonly type: "frame-telemetry"; readonly sequence: number; readonly frameDurationMs: number; readonly droppedFrames?: number }
  | { readonly type: "error"; readonly message: string };

export interface DispatchedPointerBatch {
  readonly mode: "offscreen-worker" | "main-thread-desynchronized";
  readonly sequence: number; readonly strokeId: number; readonly brushWidth: number;
  readonly pointCount: number; readonly byteLength: number; readonly points: Float32Array;
}

export interface OffscreenRendererTelemetry {
  readonly mode: OffscreenRendererMode; readonly isDisposed: boolean;
  readonly targetFps: number; readonly frameBudgetMs: number;
  readonly pendingPointCount: number; readonly submittedBatches: number;
  readonly submittedPoints: number; readonly transferredBytes: number;
  readonly completedFrames: number; readonly droppedFrames: number;
  readonly frameDropRatio: number; readonly avgFrameTimeMs: number;
  readonly maxFrameTimeMs: number; readonly lastWorkerSequence: number;
  readonly pendingAcks: number; readonly desynchronizedFallbackActive: boolean;
}

export interface AttachCanvasOptions { readonly dpr?: number; readonly strokeId?: number; readonly brushWidth?: number }

export interface OffscreenRendererWorkerBridgeOptions {
  readonly worker?: OffscreenWorkerLike;
  readonly workerFactory?: () => OffscreenWorkerLike;
  readonly targetFps?: number; readonly maxBatchPoints?: number; readonly frameDropToleranceMs?: number;
  readonly forceFallback?: boolean; readonly terminateWorkerOnDispose?: boolean; readonly drawFallbackPreview?: boolean;
  readonly onFallbackBatch?: (batch: DispatchedPointerBatch, ctx: Canvas2DContextLike | null) => void;
  readonly onTelemetryUpdate?: (telemetry: OffscreenRendererTelemetry) => void;
  readonly onWorkerError?: (error: unknown) => void;
  readonly scheduleFrame?: (callback: () => void) => number;
  readonly cancelFrame?: (handle: number) => void;
}

const TRANSFERRED_CANVASES = new WeakSet<object>();
const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
const clampUnit = (v: number): number => (!Number.isFinite(v) ? 0.5 : v < 0 ? 0 : v > 1 ? 1 : v);

function isOutboundMessage(data: unknown): data is OffscreenWorkerOutboundMessage {
  if (typeof data !== "object" || data === null) return false;
  const r = data as Record<string, unknown>;
  if (r.type === "frame-telemetry") return typeof r.sequence === "number" && typeof r.frameDurationMs === "number";
  return r.type === "error" && typeof r.message === "string";
}

export function detectOffscreenRendererCapability(
  canvas?: TransferableCanvasLike | null,
): OffscreenRendererCapability {
  const hasOffscreenCanvas = typeof OffscreenCanvas !== "undefined";
  const hasWorker = typeof Worker !== "undefined";
  const hasTransferControl = canvas
    ? typeof canvas.transferControlToOffscreen === "function"
    : typeof HTMLCanvasElement !== "undefined" &&
      typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function";
  return {
    hasOffscreenCanvas, hasTransferControl, hasWorker,
    recommendedMode:
      hasOffscreenCanvas && hasWorker && hasTransferControl ? "offscreen-worker" : "main-thread-desynchronized",
  };
}

export class OffscreenRendererWorkerBridge {
  private readonly opts: OffscreenRendererWorkerBridgeOptions;
  private readonly targetFps: number;
  private readonly frameBudgetMs: number;
  private readonly maxBatchPoints: number;
  private readonly frameDropToleranceMs: number;
  private readonly scheduleFrameFn: (cb: () => void) => number;
  private readonly cancelFrameFn: (handle: number) => void;
  private worker: OffscreenWorkerLike | null;
  private fallbackContext: Canvas2DContextLike | null = null;
  private mode: OffscreenRendererMode = "unattached";
  private disposed = false;
  private stagingBuffer: Float32Array;
  private pendingPointCount = 0;
  private scheduledFlushHandle: number | null = null;
  private activeStrokeId = 1;
  private activeBrushWidth = 6;
  private readonly counters = {
    seq: 0, batches: 0, points: 0, bytes: 0, frames: 0,
    dropped: 0, totalFrameMs: 0, maxFrameMs: 0, lastSeq: 0, pendingAcks: 0,
  };

  private readonly onMessage = (event: WorkerMessageEventLike): void => {
    if (this.disposed || !isOutboundMessage(event.data)) return;
    if (event.data.type === "frame-telemetry") {
      this.recordFrameMetrics(event.data.frameDurationMs, event.data.sequence, event.data.droppedFrames);
    } else {
      this.opts.onWorkerError?.(new Error(event.data.message));
    }
  };
  private readonly onError = (event: WorkerMessageEventLike): void => {
    this.opts.onWorkerError?.(event.data ?? event);
  };

  constructor(options: OffscreenRendererWorkerBridgeOptions = {}) {
    const fps = options.targetFps ?? DEFAULT_TARGET_FPS;
    const maxBatch = options.maxBatchPoints ?? DEFAULT_MAX_BATCH_POINTS;
    if (!Number.isFinite(fps) || fps <= 0) throw new RangeError(`Invalid targetFps: ${fps}`);
    if (!Number.isSafeInteger(maxBatch) || maxBatch <= 0) throw new RangeError(`Invalid maxBatchPoints: ${maxBatch}`);
    this.opts = options;
    this.targetFps = fps;
    this.frameBudgetMs = 1000 / fps;
    this.maxBatchPoints = maxBatch;
    this.frameDropToleranceMs = Math.max(0, options.frameDropToleranceMs ?? 0);
    this.worker = options.worker ?? null;
    this.scheduleFrameFn = options.scheduleFrame ?? ((cb) =>
      typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => cb()) : (setTimeout(cb, 0) as unknown as number));
    this.cancelFrameFn = options.cancelFrame ?? ((id) =>
      (typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(id) : clearTimeout(id)));
    this.stagingBuffer = new Float32Array(maxBatch * POINTER_POINT_STRIDE_FLOATS);
  }

  attachCanvas(canvas: TransferableCanvasLike, options: AttachCanvasOptions = {}): OffscreenRendererMode {
    if (this.disposed) throw new Error("Cannot attach canvas to a disposed bridge");
    if (this.mode !== "unattached") throw new Error(`Canvas already attached (${this.mode})`);
    const dpr = Number.isFinite(options.dpr) && (options.dpr ?? 1) > 0 ? (options.dpr ?? 1) : 1;
    if (options.strokeId !== undefined) this.activeStrokeId = options.strokeId;
    if (options.brushWidth !== undefined) this.activeBrushWidth = options.brushWidth;

    const canTransfer =
      !this.opts.forceFallback &&
      typeof canvas.transferControlToOffscreen === "function" &&
      !TRANSFERRED_CANVASES.has(canvas) &&
      (this.worker !== null || this.opts.workerFactory !== undefined);
    if (canTransfer && canvas.transferControlToOffscreen) {
      const worker = this.worker ?? this.opts.workerFactory?.() ?? null;
      if (worker) {
        const offscreen = canvas.transferControlToOffscreen();
        TRANSFERRED_CANVASES.add(canvas);
        this.worker = worker;
        worker.addEventListener?.("message", this.onMessage);
        worker.addEventListener?.("error", this.onError);
        const initMsg: OffscreenWorkerInboundMessage = {
          type: "init", canvas: offscreen, width: canvas.width, height: canvas.height, dpr, targetFps: this.targetFps,
        };
        worker.postMessage(initMsg, [offscreen as unknown as Transferable]);
        this.mode = "offscreen-worker";
        return this.mode;
      }
    }
    this.fallbackContext = canvas.getContext?.("2d", { desynchronized: true, alpha: true }) ?? null;
    this.mode = "main-thread-desynchronized";
    return this.mode;
  }

  resize(width: number, height: number, dpr = 1): void {
    if (this.disposed || this.mode !== "offscreen-worker" || !this.worker) return;
    this.worker.postMessage({ type: "resize", width, height, dpr } satisfies OffscreenWorkerInboundMessage);
  }

  enqueuePointerPoint(point: CoalescedStylusPoint, strokeId?: number, brushWidth?: number): boolean {
    if (this.disposed || this.mode === "unattached" || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      return false;
    }
    if (strokeId !== undefined) this.activeStrokeId = strokeId;
    if (brushWidth !== undefined) this.activeBrushWidth = brushWidth;
    const base = this.pendingPointCount * POINTER_POINT_STRIDE_FLOATS;
    this.stagingBuffer[base] = point.x;
    this.stagingBuffer[base + 1] = point.y;
    this.stagingBuffer[base + 2] = clampUnit(point.pressure ?? 0.5);
    this.stagingBuffer[base + 3] = Number.isFinite(point.tiltX) ? (point.tiltX ?? 0) : 0;
    this.stagingBuffer[base + 4] = Number.isFinite(point.tiltY) ? (point.tiltY ?? 0) : 0;
    this.stagingBuffer[base + 5] = Number.isFinite(point.timestampMs) ? (point.timestampMs ?? 0) : nowMs();
    this.pendingPointCount += 1;
    if (this.pendingPointCount >= this.maxBatchPoints) this.flushPointerBatch();
    return true;
  }

  enqueueCoalescedEvents(
    input: PointerEventCoalescableLike | readonly CoalescedStylusPoint[],
    strokeId?: number,
    brushWidth?: number,
  ): number {
    if (this.disposed || this.mode === "unattached") return 0;
    let accepted = 0;
    if (Array.isArray(input)) {
      for (const pt of input) if (this.enqueuePointerPoint(pt, strokeId, brushWidth)) accepted += 1;
      return accepted;
    }
    const ev = input as PointerEventCoalescableLike;
    const raw = ev.getCoalescedEvents?.();
    for (const item of raw && raw.length > 0 ? raw : [ev]) {
      const x = item.x ?? item.clientX;
      const y = item.y ?? item.clientY;
      if (x === undefined || y === undefined) continue;
      if (this.enqueuePointerPoint({ x, y, pressure: item.pressure, tiltX: item.tiltX, tiltY: item.tiltY, timestampMs: item.timeStamp }, strokeId, brushWidth)) {
        accepted += 1;
      }
    }
    return accepted;
  }

  scheduleFlush(): void {
    if (this.disposed || this.mode === "unattached" || this.scheduledFlushHandle !== null) return;
    this.scheduledFlushHandle = this.scheduleFrameFn(() => {
      this.scheduledFlushHandle = null;
      this.flushPointerBatch();
    });
  }

  flushPointerBatch(strokeId?: number, brushWidth?: number): DispatchedPointerBatch | null {
    if (this.scheduledFlushHandle !== null) {
      this.cancelFrameFn(this.scheduledFlushHandle);
      this.scheduledFlushHandle = null;
    }
    if (this.disposed || this.mode === "unattached" || this.pendingPointCount === 0) return null;

    const pointCount = this.pendingPointCount;
    const packed = new Float32Array(pointCount * POINTER_POINT_STRIDE_FLOATS);
    packed.set(this.stagingBuffer.subarray(0, packed.length));
    this.pendingPointCount = 0;

    const byteLength = packed.byteLength;
    const sequence = ++this.counters.seq;
    const resolvedStrokeId = strokeId ?? this.activeStrokeId;
    const resolvedBrushWidth = brushWidth ?? this.activeBrushWidth;
    this.counters.batches += 1;
    this.counters.points += pointCount;
    this.counters.bytes += byteLength;

    const batch: DispatchedPointerBatch = {
      mode: this.mode, sequence, strokeId: resolvedStrokeId, brushWidth: resolvedBrushWidth, pointCount, byteLength, points: packed,
    };
    if (this.mode === "offscreen-worker" && this.worker) {
      this.counters.pendingAcks += 1;
      const msg: OffscreenWorkerInboundMessage = {
        type: "pointer-batch", sequence, strokeId: resolvedStrokeId, brushWidth: resolvedBrushWidth,
        pointCount, strideFloats: POINTER_POINT_STRIDE_FLOATS, pointsBuffer: packed.buffer,
      };
      this.worker.postMessage(msg, [packed.buffer]);
      return batch;
    }

    const startedAt = nowMs();
    if (this.opts.drawFallbackPreview !== false && this.fallbackContext) {
      this.drawFallbackPolyline(this.fallbackContext, packed, pointCount, resolvedBrushWidth);
    }
    this.opts.onFallbackBatch?.(batch, this.fallbackContext);
    this.recordFrameMetrics(Math.max(0, nowMs() - startedAt), sequence);
    return batch;
  }

  recordFrameMetrics(frameDurationMs: number, sequence?: number, explicitDropped?: number): void {
    if (!Number.isFinite(frameDurationMs) || frameDurationMs < 0) return;
    const c = this.counters;
    c.frames += 1;
    c.totalFrameMs += frameDurationMs;
    if (frameDurationMs > c.maxFrameMs) c.maxFrameMs = frameDurationMs;
    c.dropped += explicitDropped !== undefined
      ? Math.max(0, Math.trunc(explicitDropped))
      : frameDurationMs > this.frameBudgetMs + this.frameDropToleranceMs ? 1 : 0;
    if (sequence !== undefined && sequence > c.lastSeq) c.lastSeq = sequence;
    if (c.pendingAcks > 0) c.pendingAcks -= 1;
    this.opts.onTelemetryUpdate?.(this.getTelemetry());
  }

  getMode(): OffscreenRendererMode { return this.mode; }
  getFallbackContext(): Canvas2DContextLike | null { return this.fallbackContext; }

  getTelemetry(): OffscreenRendererTelemetry {
    const c = this.counters;
    return {
      mode: this.mode, isDisposed: this.disposed, targetFps: this.targetFps, frameBudgetMs: this.frameBudgetMs,
      pendingPointCount: this.pendingPointCount, submittedBatches: c.batches, submittedPoints: c.points,
      transferredBytes: c.bytes, completedFrames: c.frames, droppedFrames: c.dropped,
      frameDropRatio: c.frames > 0 ? c.dropped / c.frames : 0,
      avgFrameTimeMs: c.frames > 0 ? c.totalFrameMs / c.frames : 0, maxFrameTimeMs: c.maxFrameMs,
      lastWorkerSequence: c.lastSeq, pendingAcks: c.pendingAcks,
      desynchronizedFallbackActive: this.mode === "main-thread-desynchronized",
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.scheduledFlushHandle !== null) {
      this.cancelFrameFn(this.scheduledFlushHandle);
      this.scheduledFlushHandle = null;
    }
    this.pendingPointCount = 0;
    this.stagingBuffer = new Float32Array(0);
    if (this.worker) {
      this.worker.removeEventListener?.("message", this.onMessage);
      this.worker.removeEventListener?.("error", this.onError);
      if (this.mode === "offscreen-worker") {
        try { this.worker.postMessage({ type: "dispose" } satisfies OffscreenWorkerInboundMessage); } catch { /* 종료 경합 무시 */ }
      }
      if (this.opts.terminateWorkerOnDispose !== false) this.worker.terminate();
      this.worker = null;
    }
    this.fallbackContext = null;
    this.counters.pendingAcks = 0;
  }

  private drawFallbackPolyline(ctx: Canvas2DContextLike, pts: Float32Array, count: number, width: number): void {
    if (count === 0 || !ctx.beginPath || !ctx.moveTo || !ctx.stroke) return;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0] ?? 0, pts[1] ?? 0);
    for (let i = 1; i < count; i += 1) {
      const base = i * POINTER_POINT_STRIDE_FLOATS;
      ctx.lineTo?.(pts[base] ?? 0, pts[base + 1] ?? 0);
    }
    ctx.stroke();
  }
}
