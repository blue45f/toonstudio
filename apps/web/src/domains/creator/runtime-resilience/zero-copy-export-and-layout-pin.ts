/**
 * ArrayBuffer Transferable 기반 제로-카피 레이어 병합 워커 익스포트 오케스트레이터 및
 * 다중 모니터 디스플레이 경계 스냅·UI 패널 위치 고정 복원 모델.
 *
 * - 레이어 픽셀 버퍼를 복사 없이 `postMessage(payload, transferList)`로 소유권 이전(detach)해
 *   고해상도 원고 익스포트 시 메인 스레드 힙 스파이크를 차단한다.
 * - 다중 모니터(음수 좌표 보조 모니터·서로 다른 배율·모니터 연결 해제 포함)에서
 *   UI 패널이 화면 밖으로 이탈하지 않도록 경계 스냅·클램핑·고정 복원을 수학적으로 보장한다.
 */

export type ExportLayerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export interface TransferableLayerBuffer {
  readonly layerId: string;
  readonly width: number;
  readonly height: number;
  readonly opacity: number;
  readonly blendMode: ExportLayerBlendMode;
  readonly visible: boolean;
  readonly pixelBuffer: ArrayBuffer;
  readonly byteOffset?: number;
  readonly byteLength?: number;
}

export interface ZeroCopyExportRequest {
  readonly jobId: string;
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8" | "png-ready";
  readonly layers: readonly TransferableLayerBuffer[];
  readonly signal?: AbortSignal;
}

export interface ZeroCopyWorkerInboundLayer {
  readonly layerId: string;
  readonly opacity: number;
  readonly blendMode: ExportLayerBlendMode;
  readonly pixelBuffer: ArrayBuffer;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface ZeroCopyWorkerRequestMessage {
  readonly type: "studio:zero-copy-composite";
  readonly jobId: string;
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8" | "png-ready";
  readonly layers: readonly ZeroCopyWorkerInboundLayer[];
}

export type ZeroCopyWorkerResponseMessage =
  | {
      readonly type: "studio:zero-copy-composite:done";
      readonly jobId: string;
      readonly width: number;
      readonly height: number;
      readonly format: "rgba8" | "png-ready";
      readonly outputBuffer: ArrayBuffer;
      readonly compositedLayerCount: number;
    }
  | {
      readonly type: "studio:zero-copy-composite:error";
      readonly jobId: string;
      readonly message: string;
    };

export interface ZeroCopyWorkerPort {
  postMessage(message: ZeroCopyWorkerRequestMessage, transfer: Transferable[]): void;
  subscribe(listener: (message: ZeroCopyWorkerResponseMessage) => void): () => void;
  terminate?(): void;
}

export interface ZeroCopyExportResult {
  readonly jobId: string;
  readonly width: number;
  readonly height: number;
  readonly format: "rgba8" | "png-ready";
  readonly outputBuffer: ArrayBuffer;
  readonly compositedLayerCount: number;
  readonly transferredInputBufferCount: number;
  readonly transferredInputBytes: number;
  readonly transferredOutputBytes: number;
  readonly extraCopiedBytes: 0;
  readonly elapsedMs: number;
}

export interface ZeroCopyExportTelemetry {
  readonly completedJobs: number;
  readonly cancelledJobs: number;
  readonly failedJobs: number;
  readonly transferredInputBytes: number;
  readonly transferredOutputBytes: number;
  readonly extraCopiedBytes: 0;
}

export interface ZeroCopyExportOrchestratorOptions {
  readonly worker: ZeroCopyWorkerPort;
  readonly nowMs?: () => number;
}

function clampUnit(value: number): number {
  return !Number.isFinite(value) ? 0 : value < 0 ? 0 : value > 1 ? 1 : value;
}

function clampByte(value: number): number {
  return value <= 0 ? 0 : value >= 255 ? 255 : Math.round(value);
}

function assertPositiveDimension(value: number, label: string): number {
  const truncated = Math.trunc(value);
  if (!Number.isSafeInteger(truncated) || truncated <= 0 || truncated > 32_768) {
    throw new RangeError(`${label} 크기는 1~32768 범위의 양의 정수여야 합니다: ${String(value)}`);
  }
  return truncated;
}

/**
 * 가시 레이어에서 중복 없는 Transferable ArrayBuffer 목록과 바이트 경계를 검증·추출한다.
 */
export function prepareZeroCopyLayerTransfer(
  width: number,
  height: number,
  layers: readonly TransferableLayerBuffer[],
): {
  readonly inboundLayers: readonly ZeroCopyWorkerInboundLayer[];
  readonly transferList: Transferable[];
  readonly transferredInputBytes: number;
} {
  const safeWidth = assertPositiveDimension(width, "익스포트 너비");
  const safeHeight = assertPositiveDimension(height, "익스포트 높이");
  const expectedByteLength = safeWidth * safeHeight * 4;

  const seenBuffers = new Set<ArrayBuffer>();
  const transferList: Transferable[] = [];
  const inboundLayers: ZeroCopyWorkerInboundLayer[] = [];
  let transferredInputBytes = 0;

  for (const layer of layers) {
    if (!layer.visible || layer.opacity <= 0) continue;
    if (layer.width !== safeWidth || layer.height !== safeHeight) {
      throw new RangeError(
        `레이어(${layer.layerId}) 크기(${layer.width}x${layer.height})가 캔버스(${safeWidth}x${safeHeight})와 일치하지 않습니다.`,
      );
    }
    if (layer.pixelBuffer.byteLength === 0) {
      throw new RangeError(`레이어(${layer.layerId})의 ArrayBuffer가 이미 분리(detached)되었거나 비어 있습니다.`);
    }

    const byteOffset = Math.max(0, Math.trunc(layer.byteOffset ?? 0));
    const byteLength = Math.trunc(layer.byteLength ?? expectedByteLength);
    if (byteLength !== expectedByteLength || byteOffset + byteLength > layer.pixelBuffer.byteLength) {
      throw new RangeError(
        `레이어(${layer.layerId}) 버퍼 범위(offset=${byteOffset}, length=${byteLength})가 RGBA8 기대 바이트(${expectedByteLength})와 맞지 않습니다.`,
      );
    }

    inboundLayers.push({
      layerId: layer.layerId,
      opacity: clampUnit(layer.opacity),
      blendMode: layer.blendMode,
      pixelBuffer: layer.pixelBuffer,
      byteOffset,
      byteLength,
    });
    if (!seenBuffers.has(layer.pixelBuffer)) {
      seenBuffers.add(layer.pixelBuffer);
      transferList.push(layer.pixelBuffer);
      transferredInputBytes += layer.pixelBuffer.byteLength;
    }
  }

  return { inboundLayers, transferList, transferredInputBytes };
}

function blendChannel(backdrop: number, source: number, mode: ExportLayerBlendMode): number {
  if (mode === "multiply") return backdrop * source;
  if (mode === "screen") return 1 - (1 - backdrop) * (1 - source);
  if (mode === "overlay") {
    return backdrop < 0.5 ? 2 * backdrop * source : 1 - 2 * (1 - backdrop) * (1 - source);
  }
  return source;
}

/**
 * 워커 측에서 전달받은 RGBA8 레이어들을 단일 출력 ArrayBuffer로 제로-카피 합성한다.
 */
export function compositeRgba8LayersInPlace(
  width: number,
  height: number,
  layers: readonly ZeroCopyWorkerInboundLayer[],
): ArrayBuffer {
  const safeWidth = assertPositiveDimension(width, "합성 너비");
  const safeHeight = assertPositiveDimension(height, "합성 높이");
  const pixelCount = safeWidth * safeHeight;
  const outputBuffer = new ArrayBuffer(pixelCount * 4);
  const dst = new Uint8ClampedArray(outputBuffer);

  for (const layer of layers) {
    const layerOpacity = clampUnit(layer.opacity);
    if (layerOpacity <= 0) continue;
    const src = new Uint8ClampedArray(layer.pixelBuffer, layer.byteOffset, layer.byteLength);

    for (let p = 0; p < pixelCount; p += 1) {
      const idx = p * 4;
      const srcAlpha = ((src[idx + 3] ?? 0) / 255) * layerOpacity;
      if (srcAlpha <= 0) continue;
      const dstAlpha = (dst[idx + 3] ?? 0) / 255;
      const outAlpha = srcAlpha + dstAlpha * (1 - srcAlpha);
      if (outAlpha <= 0) continue;

      const sr = (src[idx] ?? 0) / 255;
      const sg = (src[idx + 1] ?? 0) / 255;
      const sb = (src[idx + 2] ?? 0) / 255;
      const dr = (dst[idx] ?? 0) / 255;
      const dg = (dst[idx + 1] ?? 0) / 255;
      const db = (dst[idx + 2] ?? 0) / 255;

      const br = dstAlpha > 0 ? blendChannel(dr, sr, layer.blendMode) : sr;
      const bg = dstAlpha > 0 ? blendChannel(dg, sg, layer.blendMode) : sg;
      const bb = dstAlpha > 0 ? blendChannel(db, sb, layer.blendMode) : sb;

      dst[idx] = clampByte(((srcAlpha * (1 - dstAlpha) * sr + srcAlpha * dstAlpha * br + (1 - srcAlpha) * dstAlpha * dr) / outAlpha) * 255);
      dst[idx + 1] = clampByte(((srcAlpha * (1 - dstAlpha) * sg + srcAlpha * dstAlpha * bg + (1 - srcAlpha) * dstAlpha * dg) / outAlpha) * 255);
      dst[idx + 2] = clampByte(((srcAlpha * (1 - dstAlpha) * sb + srcAlpha * dstAlpha * bb + (1 - srcAlpha) * dstAlpha * db) / outAlpha) * 255);
      dst[idx + 3] = clampByte(outAlpha * 255);
    }
  }
  return outputBuffer;
}

export interface SimulatedTransferWorkerRecord {
  readonly jobId: string;
  readonly transferListLength: number;
  readonly transferredByteTotal: number;
}

export interface SimulatedTransferWorkerPort extends ZeroCopyWorkerPort {
  getDispatchHistory(): readonly SimulatedTransferWorkerRecord[];
}

/**
 * 실제 HTML structuredClone transfer 소유권 이전(원본 ArrayBuffer detach)을 재현하는 로컬 워커 포트.
 */
export function createSimulatedTransferWorkerPort(): SimulatedTransferWorkerPort {
  const listeners = new Set<(message: ZeroCopyWorkerResponseMessage) => void>();
  const history: SimulatedTransferWorkerRecord[] = [];
  let terminated = false;

  return {
    postMessage: (message, transfer) => {
      if (terminated) return;
      let transferredByteTotal = 0;
      for (const item of transfer) {
        if (item instanceof ArrayBuffer) transferredByteTotal += item.byteLength;
      }
      history.push({ jobId: message.jobId, transferListLength: transfer.length, transferredByteTotal });

      const workerOwned = structuredClone(message, { transfer });
      queueMicrotask(() => {
        if (terminated) return;
        try {
          const outputBuffer = compositeRgba8LayersInPlace(workerOwned.width, workerOwned.height, workerOwned.layers);
          const response: ZeroCopyWorkerResponseMessage = structuredClone(
            {
              type: "studio:zero-copy-composite:done",
              jobId: workerOwned.jobId,
              width: workerOwned.width,
              height: workerOwned.height,
              format: workerOwned.format,
              outputBuffer,
              compositedLayerCount: workerOwned.layers.length,
            },
            { transfer: [outputBuffer] },
          );
          for (const listener of listeners) listener(response);
        } catch (error) {
          const response: ZeroCopyWorkerResponseMessage = {
            type: "studio:zero-copy-composite:error",
            jobId: workerOwned.jobId,
            message: error instanceof Error ? error.message : String(error),
          };
          for (const listener of listeners) listener(response);
        }
      });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    terminate: () => {
      terminated = true;
      listeners.clear();
    },
    getDispatchHistory: () => [...history],
  };
}

/**
 * 제로-카피 Transferable 워커 익스포트 오케스트레이터.
 */
export class ZeroCopyExportOrchestrator {
  private readonly worker: ZeroCopyWorkerPort;
  private readonly nowMs: () => number;
  private readonly unsubscribe: () => void;
  private readonly pendingJobs = new Map<
    string,
    {
      readonly startedAtMs: number;
      readonly transferredInputBufferCount: number;
      readonly transferredInputBytes: number;
      readonly resolve: (result: ZeroCopyExportResult) => void;
      readonly reject: (error: Error) => void;
      readonly cleanupAbort?: () => void;
    }
  >();

  private completedJobs = 0;
  private cancelledJobs = 0;
  private failedJobs = 0;
  private transferredInputBytes = 0;
  private transferredOutputBytes = 0;

  constructor(options: ZeroCopyExportOrchestratorOptions) {
    this.worker = options.worker;
    this.nowMs = options.nowMs ?? (() => performance.now());
    this.unsubscribe = this.worker.subscribe((message) => this.handleWorkerResponse(message));
  }

  private handleWorkerResponse(message: ZeroCopyWorkerResponseMessage): void {
    const job = this.pendingJobs.get(message.jobId);
    if (!job) return;
    this.pendingJobs.delete(message.jobId);
    job.cleanupAbort?.();

    if (message.type === "studio:zero-copy-composite:error") {
      this.failedJobs += 1;
      job.reject(new Error(`제로-카피 워커 익스포트 실패(${message.jobId}): ${message.message}`));
      return;
    }

    this.completedJobs += 1;
    this.transferredInputBytes += job.transferredInputBytes;
    this.transferredOutputBytes += message.outputBuffer.byteLength;

    job.resolve({
      jobId: message.jobId,
      width: message.width,
      height: message.height,
      format: message.format,
      outputBuffer: message.outputBuffer,
      compositedLayerCount: message.compositedLayerCount,
      transferredInputBufferCount: job.transferredInputBufferCount,
      transferredInputBytes: job.transferredInputBytes,
      transferredOutputBytes: message.outputBuffer.byteLength,
      extraCopiedBytes: 0,
      elapsedMs: Math.max(0, this.nowMs() - job.startedAtMs),
    });
  }

  public exportLayers(request: ZeroCopyExportRequest): Promise<ZeroCopyExportResult> {
    if (request.signal?.aborted) {
      this.cancelledJobs += 1;
      return Promise.reject(new Error(`제로-카피 익스포트 작업(${request.jobId})이 시작 전 취소되었습니다.`));
    }
    if (this.pendingJobs.has(request.jobId)) {
      return Promise.reject(new Error(`동일한 익스포트 작업 ID(${request.jobId})가 이미 실행 중입니다.`));
    }

    const prepared = prepareZeroCopyLayerTransfer(request.width, request.height, request.layers);
    const startedAtMs = this.nowMs();

    return new Promise<ZeroCopyExportResult>((resolve, reject) => {
      let cleanupAbort: (() => void) | undefined;
      if (request.signal) {
        const onAbort = (): void => {
          if (!this.pendingJobs.has(request.jobId)) return;
          this.pendingJobs.delete(request.jobId);
          this.cancelledJobs += 1;
          reject(new Error(`제로-카피 익스포트 작업(${request.jobId})이 취소되었습니다.`));
        };
        request.signal.addEventListener("abort", onAbort, { once: true });
        cleanupAbort = () => request.signal?.removeEventListener("abort", onAbort);
      }

      this.pendingJobs.set(request.jobId, {
        startedAtMs,
        transferredInputBufferCount: prepared.transferList.length,
        transferredInputBytes: prepared.transferredInputBytes,
        resolve,
        reject,
        cleanupAbort,
      });

      this.worker.postMessage(
        {
          type: "studio:zero-copy-composite",
          jobId: request.jobId,
          width: request.width,
          height: request.height,
          format: request.format,
          layers: prepared.inboundLayers,
        },
        prepared.transferList,
      );
    });
  }

  public getTelemetry(): ZeroCopyExportTelemetry {
    return {
      completedJobs: this.completedJobs,
      cancelledJobs: this.cancelledJobs,
      failedJobs: this.failedJobs,
      transferredInputBytes: this.transferredInputBytes,
      transferredOutputBytes: this.transferredOutputBytes,
      extraCopiedBytes: 0,
    };
  }

  public dispose(): void {
    this.unsubscribe();
    for (const [jobId, job] of this.pendingJobs) {
      job.cleanupAbort?.();
      this.cancelledJobs += 1;
      job.reject(new Error(`익스포트 오케스트레이터가 종료되어 작업(${jobId})이 취소되었습니다.`));
    }
    this.pendingJobs.clear();
  }
}

export function createZeroCopyExportOrchestrator(options: ZeroCopyExportOrchestratorOptions): ZeroCopyExportOrchestrator {
  return new ZeroCopyExportOrchestrator(options);
}

// ---------------------------------------------------------------------------
// 다중 모니터 디스플레이 경계 스냅 · UI 패널 위치 고정 복원 모델
// ---------------------------------------------------------------------------

export interface DisplayMonitorBounds {
  readonly displayId: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scaleFactor: number;
  readonly isPrimary: boolean;
}

export interface PinnedPanelRect {
  readonly panelId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
}

export type HorizontalEdgeSnap = "left" | "right" | "none";
export type VerticalEdgeSnap = "top" | "bottom" | "none";

export interface PanelSnapOptions {
  readonly snapThresholdPx: number;
  readonly safeMarginPx: number;
  readonly minPanelWidthPx: number;
  readonly minPanelHeightPx: number;
}

export const DEFAULT_PANEL_SNAP_OPTIONS: PanelSnapOptions = Object.freeze({
  snapThresholdPx: 16,
  safeMarginPx: 8,
  minPanelWidthPx: 200,
  minPanelHeightPx: 160,
});

export interface PanelClampResolution {
  readonly rect: PinnedPanelRect;
  readonly displayId: string;
  readonly wasClamped: boolean;
  readonly wasResized: boolean;
  readonly snappedEdges: {
    readonly horizontal: HorizontalEdgeSnap;
    readonly vertical: VerticalEdgeSnap;
  };
}

export interface PanelDisplayPinSnapshot {
  readonly panelId: string;
  readonly pinnedDisplayId: string;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly width: number;
  readonly height: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly snappedEdges: {
    readonly horizontal: HorizontalEdgeSnap;
    readonly vertical: VerticalEdgeSnap;
  };
  readonly pinnedAtMs: number;
}

export interface PanelRestoreResolution extends PanelClampResolution {
  readonly fallbackToPrimary: boolean;
  readonly matchedPinnedDisplay: boolean;
}

function clampNumber(value: number, min: number, max: number): number {
  if (max < min || !Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function sanitizeDisplays(displays: readonly DisplayMonitorBounds[]): readonly DisplayMonitorBounds[] {
  const valid = displays.filter(
    (d) =>
      Number.isFinite(d.left)
      && Number.isFinite(d.top)
      && Number.isFinite(d.width)
      && d.width > 0
      && Number.isFinite(d.height)
      && d.height > 0,
  );
  if (valid.length === 0) throw new RangeError("최소 1개 이상의 유효한 디스플레이 경계가 필요합니다.");
  return valid;
}

function computeSafeWorkArea(display: DisplayMonitorBounds, opts: PanelSnapOptions) {
  const marginX = Math.min(opts.safeMarginPx, Math.floor(display.width / 8));
  const marginY = Math.min(opts.safeMarginPx, Math.floor(display.height / 8));
  return {
    left: display.left + marginX,
    top: display.top + marginY,
    width: Math.max(1, display.width - marginX * 2),
    height: Math.max(1, display.height - marginY * 2),
  };
}

function intersectionArea(rect: PinnedPanelRect, display: DisplayMonitorBounds): number {
  const w = Math.min(rect.x + rect.width, display.left + display.width) - Math.max(rect.x, display.left);
  const h = Math.min(rect.y + rect.height, display.top + display.height) - Math.max(rect.y, display.top);
  return w > 0 && h > 0 ? w * h : 0;
}

function distanceToDisplayBounds(rect: PinnedPanelRect, display: DisplayMonitorBounds): number {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  return Math.hypot(
    cx - clampNumber(cx, display.left, display.left + display.width),
    cy - clampNumber(cy, display.top, display.top + display.height),
  );
}

/**
 * 패널과 가장 많이 겹치거나(또는 화면 밖일 때 가장 가까운) 대상 모니터를 결정한다.
 */
export function findBestDisplayForPanel(
  rect: PinnedPanelRect,
  displays: readonly DisplayMonitorBounds[],
): DisplayMonitorBounds {
  const valid = sanitizeDisplays(displays);
  let bestByOverlap: DisplayMonitorBounds | null = null;
  let maxOverlap = 0;

  for (const display of valid) {
    const area = intersectionArea(rect, display);
    if (area > maxOverlap || (area > 0 && area === maxOverlap && display.isPrimary && !bestByOverlap?.isPrimary)) {
      maxOverlap = area;
      bestByOverlap = display;
    }
  }
  if (bestByOverlap !== null) return bestByOverlap;

  let nearest = valid[0]!;
  let minDistance = distanceToDisplayBounds(rect, nearest);
  for (let i = 1; i < valid.length; i += 1) {
    const candidate = valid[i]!;
    const dist = distanceToDisplayBounds(rect, candidate);
    if (dist < minDistance || (dist === minDistance && candidate.isPrimary && !nearest.isPrimary)) {
      minDistance = dist;
      nearest = candidate;
    }
  }
  return nearest;
}

/**
 * 다중 모니터 디스플레이 안전 영역 안에서 패널 크기를 조정하고,
 * 경계 스냅(snapThresholdPx)과 엄격한 클램핑으로 화면 밖 이탈을 원천 차단한다.
 */
export function snapAndClampPanelToDisplay(
  rect: PinnedPanelRect,
  displays: readonly DisplayMonitorBounds[],
  options?: Partial<PanelSnapOptions>,
  forcedDisplay?: DisplayMonitorBounds,
): PanelClampResolution {
  const opts: PanelSnapOptions = { ...DEFAULT_PANEL_SNAP_OPTIONS, ...options };
  const target = forcedDisplay ?? findBestDisplayForPanel(rect, displays);
  const safe = computeSafeWorkArea(target, opts);

  const minWidth = Math.min(safe.width, Math.max(1, rect.minWidth ?? opts.minPanelWidthPx));
  const minHeight = Math.min(safe.height, Math.max(1, rect.minHeight ?? opts.minPanelHeightPx));
  const clampedWidth = Math.round(clampNumber(rect.width, minWidth, safe.width));
  const clampedHeight = Math.round(clampNumber(rect.height, minHeight, safe.height));
  const wasResized = clampedWidth !== Math.round(rect.width) || clampedHeight !== Math.round(rect.height);

  const maxX = safe.left + safe.width - clampedWidth;
  const maxY = safe.top + safe.height - clampedHeight;
  let nextX = clampNumber(rect.x, safe.left, maxX);
  let nextY = clampNumber(rect.y, safe.top, maxY);
  const wasClamped = Math.round(nextX) !== Math.round(rect.x) || Math.round(nextY) !== Math.round(rect.y);

  let horizontal: HorizontalEdgeSnap = "none";
  if (Math.abs(nextX - safe.left) <= opts.snapThresholdPx) {
    nextX = safe.left;
    horizontal = "left";
  } else if (Math.abs(nextX - maxX) <= opts.snapThresholdPx) {
    nextX = maxX;
    horizontal = "right";
  }

  let vertical: VerticalEdgeSnap = "none";
  if (Math.abs(nextY - safe.top) <= opts.snapThresholdPx) {
    nextY = safe.top;
    vertical = "top";
  } else if (Math.abs(nextY - maxY) <= opts.snapThresholdPx) {
    nextY = maxY;
    vertical = "bottom";
  }

  return {
    rect: {
      panelId: rect.panelId,
      x: Math.round(clampNumber(nextX, safe.left, maxX)),
      y: Math.round(clampNumber(nextY, safe.top, maxY)),
      width: clampedWidth,
      height: clampedHeight,
      ...(rect.minWidth !== undefined ? { minWidth: rect.minWidth } : {}),
      ...(rect.minHeight !== undefined ? { minHeight: rect.minHeight } : {}),
    },
    displayId: target.displayId,
    wasClamped,
    wasResized,
    snappedEdges: { horizontal, vertical },
  };
}

/**
 * 현재 패널 위치를 대상 모니터 기준 정규화 좌표(0..1) 및 경계 스냅 정보로 고정 스냅샷화한다.
 */
export function capturePanelPinSnapshot(
  rect: PinnedPanelRect,
  displays: readonly DisplayMonitorBounds[],
  pinnedAtMs = 0,
  options?: Partial<PanelSnapOptions>,
): PanelDisplayPinSnapshot {
  const opts: PanelSnapOptions = { ...DEFAULT_PANEL_SNAP_OPTIONS, ...options };
  const clamped = snapAndClampPanelToDisplay(rect, displays, opts);
  const target = sanitizeDisplays(displays).find((d) => d.displayId === clamped.displayId)!;
  const safe = computeSafeWorkArea(target, opts);
  const spanX = Math.max(0, safe.width - clamped.rect.width);
  const spanY = Math.max(0, safe.height - clamped.rect.height);

  return {
    panelId: clamped.rect.panelId,
    pinnedDisplayId: clamped.displayId,
    normalizedX: spanX > 0 ? clampUnit((clamped.rect.x - safe.left) / spanX) : 0,
    normalizedY: spanY > 0 ? clampUnit((clamped.rect.y - safe.top) / spanY) : 0,
    width: clamped.rect.width,
    height: clamped.rect.height,
    ...(clamped.rect.minWidth !== undefined ? { minWidth: clamped.rect.minWidth } : {}),
    ...(clamped.rect.minHeight !== undefined ? { minHeight: clamped.rect.minHeight } : {}),
    snappedEdges: clamped.snappedEdges,
    pinnedAtMs,
  };
}

/**
 * 고정된 패널 스냅샷을 현재 연결된 모니터 구성에 맞춰 복원한다.
 * 원래 모니터가 해제되었더라도 기본 모니터 안전 영역 내부로 자동 복귀시켜 화면 밖 이탈을 방지한다.
 */
export function restorePinnedPanelRect(
  snapshot: PanelDisplayPinSnapshot,
  displays: readonly DisplayMonitorBounds[],
  options?: Partial<PanelSnapOptions>,
): PanelRestoreResolution {
  const opts: PanelSnapOptions = { ...DEFAULT_PANEL_SNAP_OPTIONS, ...options };
  const valid = sanitizeDisplays(displays);
  const matched = valid.find((d) => d.displayId === snapshot.pinnedDisplayId) ?? null;
  const target = matched ?? valid.find((d) => d.isPrimary) ?? valid[0]!;
  const safe = computeSafeWorkArea(target, opts);

  const clampedWidth = Math.min(safe.width, Math.max(snapshot.minWidth ?? opts.minPanelWidthPx, snapshot.width));
  const clampedHeight = Math.min(safe.height, Math.max(snapshot.minHeight ?? opts.minPanelHeightPx, snapshot.height));
  const spanX = Math.max(0, safe.width - clampedWidth);
  const spanY = Math.max(0, safe.height - clampedHeight);

  const desiredX = snapshot.snappedEdges.horizontal === "left"
    ? safe.left
    : snapshot.snappedEdges.horizontal === "right"
      ? safe.left + spanX
      : safe.left + snapshot.normalizedX * spanX;
  const desiredY = snapshot.snappedEdges.vertical === "top"
    ? safe.top
    : snapshot.snappedEdges.vertical === "bottom"
      ? safe.top + spanY
      : safe.top + snapshot.normalizedY * spanY;

  const resolution = snapAndClampPanelToDisplay(
    {
      panelId: snapshot.panelId,
      x: desiredX,
      y: desiredY,
      width: snapshot.width,
      height: snapshot.height,
      ...(snapshot.minWidth !== undefined ? { minWidth: snapshot.minWidth } : {}),
      ...(snapshot.minHeight !== undefined ? { minHeight: snapshot.minHeight } : {}),
    },
    valid,
    opts,
    target,
  );

  return { ...resolution, matchedPinnedDisplay: matched !== null, fallbackToPrimary: matched === null };
}

/**
 * 워크스페이스의 여러 고정 패널 스냅샷을 현재 다중 모니터 환경에 일괄 복원한다.
 */
export function restoreMultiMonitorPanelBatch(
  snapshots: readonly PanelDisplayPinSnapshot[],
  displays: readonly DisplayMonitorBounds[],
  options?: Partial<PanelSnapOptions>,
): readonly PanelRestoreResolution[] {
  return snapshots.map((snapshot) => restorePinnedPanelRect(snapshot, displays, options));
}
