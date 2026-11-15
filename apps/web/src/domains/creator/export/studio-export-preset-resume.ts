import { canvasToBlob, downloadBlob, exportMimeType, exportQuality } from "./studio-export";
import {
  drawWatermarkOnSlice,
  planSliceDrawOps,
  presetSliceFileName,
  type PresetExportResult,
  type PresetSliceExportOptions,
  type PresetSlicePlan,
  type PresetVipsPreparedPages,
} from "./studio-export-presets";
import { renderStudioPresetTiledRegion } from "./studio-preset-tiled-raster";
import type { StudioVipsRaster } from "./studio-vips-export";

/**
 * 분할 저장 도중 일부 조각이 이미 다운로드된 뒤 후속 조각에서 실패했을 때,
 * 이미 성공한 조각 인덱스를 보존해 다음 재시도에서 중복 다운로드를 막는다.
 */
export class PresetSlicePartialExportError extends Error {
  readonly completedSliceIndices: readonly number[];
  readonly failedSliceIndex: number;
  readonly totalSliceCount: number;
  override readonly cause?: unknown;

  constructor(input: {
    message: string;
    completedSliceIndices: readonly number[];
    failedSliceIndex: number;
    totalSliceCount: number;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "PresetSlicePartialExportError";
    this.completedSliceIndices = Object.freeze([...new Set(input.completedSliceIndices)].sort((a, b) => a - b));
    this.failedSliceIndex = input.failedSliceIndex;
    this.totalSliceCount = input.totalSliceCount;
    this.cause = input.cause;
  }
}

/**
 * 규격 분할 저장 중 사용자 취소(또는 작업공간 복귀)로 중단되었을 때,
 * 이미 저장된 조각 인덱스와 총 조각 수를 함께 전달해 미완성 산출물과 성공본이 혼동되지 않게 한다.
 */
export class PresetSliceExportCancelledError extends Error {
  readonly completedSliceIndices: readonly number[];
  readonly totalSliceCount: number;
  readonly cancelled = true as const;

  constructor(input: {
    message?: string;
    completedSliceIndices: readonly number[];
    totalSliceCount: number;
  }) {
    super(input.message ?? "규격 분할 내보내기를 취소했어요.");
    this.name = "AbortError";
    this.completedSliceIndices = Object.freeze([...new Set(input.completedSliceIndices)].sort((a, b) => a - b));
    this.totalSliceCount = input.totalSliceCount;
  }
}

/**
 * 다운로드 사이 최소 간격(ms).
 *
 * 왜 0 이 아닌가 — 브라우저에는 "저장이 끝났다"는 신호가 페이지 쪽에 없다.
 * a[download] + object URL 조합은 이벤트를 돌려주지 않고, downloadBlob 은 click 직후
 * revokeObjectURL 까지 한다. 그래서 완료 신호를 기다리는 코드로 바꿀 수가 없고,
 * 짧은 간격 안에 click 을 연달아 때리면 WebKit 계열에서 뒤 파일이 조용히 사라진다.
 * 남길 수 있는 건 "간격 보장"뿐이므로 값은 유지하되, 아래 루프가 이 간격을
 * **마감시각**으로 다뤄 다음 슬라이스의 합성·인코딩 시간이 간격에 함께 계산되게 했다.
 * 인코딩이 이 값보다 오래 걸리는 큰 페이지에서는 추가 정지가 0 이 된다.
 */
const DEFAULT_SLICE_DOWNLOAD_INTERVAL_MS = 250;

function defaultMonotonicNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function defaultCreateSliceCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function defaultCreateResampledSurface(raster: StudioVipsRaster): HTMLCanvasElement | null {
  if (typeof document === "undefined" || typeof ImageData === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = raster.width;
  canvas.height = raster.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const pixels = new Uint8ClampedArray(raster.rgba);
  ctx.putImageData(new ImageData(pixels, raster.width, raster.height), 0, 0);
  return canvas;
}

function throwIfSliceExportAborted(
  signal: AbortSignal | undefined,
  completedSet: ReadonlySet<number>,
  totalSliceCount: number,
): void {
  if (signal?.aborted) {
    throw new PresetSliceExportCancelledError({
      completedSliceIndices: [...completedSet],
      totalSliceCount,
    });
  }
}

function abortableSleep(
  sleep: (ms: number) => Promise<void>,
  ms: number,
  signal?: AbortSignal,
): Promise<void> {
  if (!signal) return sleep(ms);
  if (signal.aborted) {
    return Promise.reject(new DOMException("규격 분할 내보내기를 취소했어요.", "AbortError"));
  }
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      reject(new DOMException("규격 분할 내보내기를 취소했어요.", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    sleep(ms).then(
      () => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        resolve();
      },
      (err) => {
        if (settled) return;
        settled = true;
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

export async function executePresetSlicesLoop(
  plan: PresetSlicePlan,
  prepared: PresetVipsPreparedPages,
  options: PresetSliceExportOptions,
): Promise<PresetExportResult> {
  const { preset, title, watermark, onProgress, signal } = options;
  const createCanvas = options.createCanvas ?? defaultCreateSliceCanvas;
  const download = options.download ?? downloadBlob;
  const delayMs = options.delayMs ?? DEFAULT_SLICE_DOWNLOAD_INTERVAL_MS;
  const now = options.now ?? defaultMonotonicNow;
  const sleep = options.sleep ?? defaultSleep;
  const mime = exportMimeType(plan.format);
  const quality = exportQuality(plan.format);

  const completedSet = new Set<number>(
    [...(options.skipSliceIndices ?? [])].filter(
      (idx) => Number.isInteger(idx) && idx >= 0 && idx < plan.slices.length,
    ),
  );
  let oversized = 0;
  let newlySavedFiles = 0;
  // 다음 다운로드를 시작해도 되는 가장 이른 시각. 다운로드 뒤에 고정으로 쉬는 대신
  // 마감시각을 잡아 두면, 다음 슬라이스의 합성·인코딩에 흘러간 시간이 그대로 간격에
  // 차감된다 — 다운로드 사이 최소 간격(delayMs)은 그대로 지켜지고 누적 정지만 사라진다.
  let nextDownloadAt = Number.NEGATIVE_INFINITY;

  for (const slice of plan.slices) {
    throwIfSliceExportAborted(signal, completedSet, plan.slices.length);
    if (completedSet.has(slice.index)) {
      onProgress?.(slice.index + 1, plan.slices.length);
      continue;
    }

    let canvas: HTMLCanvasElement | null = null;
    try {
      canvas = createCanvas(plan.targetWidth, slice.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("슬라이스 캔버스를 만들지 못했어요. 다시 시도해주세요.");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, plan.targetWidth, slice.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      for (const op of planSliceDrawOps(slice, prepared.layouts)) {
        const page = prepared.drawPages[op.pageIndex];
        const tiled = prepared.tiledPages.get(op.pageIndex);
        const layout = prepared.layouts[op.pageIndex];
        if (tiled && layout) {
          const outputY = Math.max(0, slice.y - layout.y);
          await renderStudioPresetTiledRegion(
            tiled,
            plan.targetWidth,
            layout.height,
            {
              x: 0,
              y: outputY,
              width: plan.targetWidth,
              height: op.destHeight,
            },
            (tile, rgba) => {
              const surface = (options.createResampledPage ?? defaultCreateResampledSurface)({
                width: tile.width,
                height: tile.height,
                rgba: new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength),
              });
              if (!surface) throw new Error("리샘플한 타일을 합성 표면으로 만들지 못했어요.");
              try {
                ctx.drawImage(
                  surface,
                  0,
                  0,
                  tile.width,
                  tile.height,
                  tile.x,
                  op.destY + tile.y - outputY,
                  tile.width,
                  tile.height,
                );
              } finally {
                surface.width = 1;
                surface.height = 1;
              }
            },
          );
        } else if (page && !("kind" in page)) {
          ctx.drawImage(
            page,
            0,
            op.srcY,
            page.width,
            op.srcHeight,
            0,
            op.destY,
            plan.targetWidth,
            op.destHeight,
          );
        }
      }
      if (watermark) drawWatermarkOnSlice(canvas, watermark);
      throwIfSliceExportAborted(signal, completedSet, plan.slices.length);
      const blob = await canvasToBlob(canvas, mime, quality);
      throwIfSliceExportAborted(signal, completedSet, plan.slices.length);
      if (preset.maxFileBytes !== undefined && blob.size > preset.maxFileBytes) oversized += 1;
      // 아직 간격이 안 찼을 때만, 모자란 만큼만 쉰다(첫 장은 항상 즉시 저장).
      const waitMs = nextDownloadAt - now();
      if (waitMs > 0) await abortableSleep(sleep, waitMs, signal);
      throwIfSliceExportAborted(signal, completedSet, plan.slices.length);
      download(
        blob,
        presetSliceFileName(title, preset.id, plan.format, {
          index: slice.index,
          total: plan.slices.length,
        }),
      );
      completedSet.add(slice.index);
      newlySavedFiles += 1;
      options.onSliceSaved?.(slice.index);
      nextDownloadAt = now() + delayMs;
      onProgress?.(slice.index + 1, plan.slices.length);
    } catch (error) {
      if (error instanceof PresetSliceExportCancelledError) {
        throw error;
      }
      if (
        signal?.aborted ||
        (error instanceof DOMException && error.name === "AbortError") ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        throw new PresetSliceExportCancelledError({
          completedSliceIndices: [...completedSet],
          totalSliceCount: plan.slices.length,
        });
      }
      if (completedSet.size > 0) {
        const baseMessage =
          error instanceof Error ? error.message : "규격 분할 저장 중 일부 항목이 실패했어요.";
        throw new PresetSlicePartialExportError({
          message: baseMessage,
          completedSliceIndices: [...completedSet],
          failedSliceIndex: slice.index,
          totalSliceCount: plan.slices.length,
          cause: error,
        });
      }
      throw error;
    } finally {
      // 기본 표면은 이 실행이 소유한다. 주입한 표면의 수명은 호출자가 관리한다.
      if (canvas && !options.createCanvas) {
        canvas.width = 1;
        canvas.height = 1;
      }
    }
  }

  return {
    files: options.skipSliceIndices ? newlySavedFiles : plan.slices.length,
    oversized,
    format: plan.format,
    targetWidth: plan.targetWidth,
    // pristine 계약: 라우팅이 없으면 결과 shape 도 기존 그대로(키 부재).
    ...(prepared.vipsRoutedPages > 0 ? { vipsRoutedPages: prepared.vipsRoutedPages } : {}),
    ...(prepared.tiledPages.size > 0 ? { tiledPages: prepared.tiledPages.size } : {}),
  };
}
