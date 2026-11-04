import { acquireStudioRasterSourceLease, reserveStudioRasterSourceBudget, studioRasterSourceResidentBudget, StudioRasterSourceLeaseError,
  type StudioRasterSourceLeaseOptions, type StudioRasterSourceBudgetReservation, type StudioRasterSourceReceipt } from "./studio-raster-source-lease";

export interface StudioRasterThumbnailSourceLease {
  readonly kind: "thumbnail";
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly sourceReceipt: StudioRasterSourceReceipt;
  release(): void;
}
export interface StudioRasterThumbnailSourceOptions extends StudioRasterSourceLeaseOptions {
  readonly displayWidth: number;
  readonly displayHeight: number;
}

// 원본 full decode가 잠깐 필요할 수 있으므로 모든 썸네일 생성은 한 큐에서 실행한다.
let previewTail: Promise<void> = Promise.resolve();
function cancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new StudioRasterSourceLeaseError("aborted", "썸네일 표시 요청이 취소되었습니다.");
}
async function serialPreview<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  const previous = previewTail;
  let done!: () => void;
  previewTail = new Promise<void>((resolve) => { done = resolve; });
  let started = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const abort = () => { signal?.removeEventListener("abort", abort); reject(new StudioRasterSourceLeaseError("aborted", "썸네일 표시 요청이 취소되었습니다.")); };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener("abort", abort, { once: true });
      void previous.then(() => { signal?.removeEventListener("abort", abort); resolve(); });
    });
    cancelled(signal); started = true; return await run();
  } finally {
    // 취소된 대기자가 다음 요청을 기존 작업보다 먼저 실행시키지 않도록 큐 자리도 순서대로 반환한다.
    if (started) done(); else void previous.then(done);
  }
}
export function studioRasterThumbnailDecodeSize(source: { readonly width: number; readonly height: number },
  display: { readonly width: number; readonly height: number }): { readonly width: number; readonly height: number } {
  for (const value of [source.width, source.height, display.width, display.height]) {
    if (!Number.isFinite(value) || value <= 0) throw new StudioRasterSourceLeaseError("source-limit", "썸네일 표시 크기가 유효하지 않습니다.");
  }
  // 원본 비율을 유지하면서 실제 표시 양축에 필요한 화소를 확보한다. SVG cover의 crop도 유지한다.
  const scale = Math.min(1, Math.max(display.width / source.width, display.height / source.height));
  return { width: Math.max(1, Math.ceil(source.width * scale)), height: Math.max(1, Math.ceil(source.height * scale)) };
}
function canvasFor(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas; }
  throw new StudioRasterSourceLeaseError("opfs-unavailable", "썸네일 표시용 캔버스를 만들 수 없습니다.");
}
async function canvasPng(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ("convertToBlob" in canvas) return await canvas.convertToBlob({ type: "image/png" });
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob)
    : reject(new StudioRasterSourceLeaseError("invalid-png", "썸네일 PNG를 만들 수 없습니다.")), "image/png"));
}
function releaseAll(reservations: readonly StudioRasterSourceBudgetReservation[]): void {
  for (const reservation of reservations) {
    try { reservation.release(); } catch { continue; } // 하나의 사용자 budget 정리 실패가 나머지 예약을 붙잡지 않는다.
  }
}
function revoke(url: string): void {
  try { URL.revokeObjectURL(url); } catch { return; } // 이미 닫힌 realm의 URL 정리도 나머지 소유권을 해제한다.
}

/** 저장 원본을 고치지 않는 표시용 lease. sourceReceipt는 검증한 원본의 영수증이다. */
export async function acquireStudioRasterThumbnailSourceLease(source: string,
  options: StudioRasterThumbnailSourceOptions): Promise<StudioRasterThumbnailSourceLease> {
  return await serialPreview(async () => {
    // 이 lease의 full RGBA 예약은 native decoder가 원본 전체를 잠시 소유하는 경우까지 포함한다.
    const original = await acquireStudioRasterSourceLease(source, options);
    const reservations: StudioRasterSourceBudgetReservation[] = [];
    let bitmap: ImageBitmap | null = null;
    let canvas: OffscreenCanvas | HTMLCanvasElement | null = null;
    let src: string | null = null;
    try {
      cancelled(options.signal);
      if (original.kind !== "linked-3d-cas" || !original.blob || !original.receipt || typeof createImageBitmap !== "function") {
        throw new StudioRasterSourceLeaseError("invalid-source", "검증된 CAS 원본과 native 이미지 디코더가 필요합니다.");
      }
      const size = studioRasterThumbnailDecodeSize(original.receipt, { width: options.displayWidth, height: options.displayHeight });
      const rgba = size.width * size.height * 4;
      // bitmap+canvas 두 표면 및 무압축 PNG의 보수적 상한(행 필터·deflate·metadata 포함)을 먼저 예약한다.
      const pngMaximum = rgba + size.height + Math.ceil((rgba + size.height) / 16_383) * 5 + 65_536;
      const request = { consumer: options.consumer ?? "studio-raster-thumbnail", contentHash: original.receipt.contentHash,
        sourceBytes: pngMaximum, decodedPixels: size.width * size.height * 2, decodedRgbaBytes: rgba * 2 };
      const budgets = options.budget && options.budget !== studioRasterSourceResidentBudget
        ? [studioRasterSourceResidentBudget, options.budget] : [studioRasterSourceResidentBudget];
      for (const budget of budgets) {
        const reservation = await reserveStudioRasterSourceBudget(budget, request, options.signal);
        if (!reservation) throw new StudioRasterSourceLeaseError("budget-denied", "썸네일 표시 메모리 예산을 확보하지 못했습니다.");
        reservations.push(reservation); cancelled(options.signal);
      }
      bitmap = await createImageBitmap(original.blob, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: "high" });
      cancelled(options.signal);
      if (bitmap.width !== size.width || bitmap.height !== size.height) throw new StudioRasterSourceLeaseError("receipt-mismatch", "썸네일 디코더가 요청한 표시 크기를 보존하지 않았습니다.");
      canvas = canvasFor(size.width, size.height);
      const context = "convertToBlob" in canvas ? canvas.getContext("2d") : canvas.getContext("2d");
      if (!context) throw new StudioRasterSourceLeaseError("opfs-unavailable", "썸네일 표시 컨텍스트를 만들 수 없습니다.");
      context.drawImage(bitmap, 0, 0);
      const blob = await canvasPng(canvas);
      cancelled(options.signal);
      if (blob.type !== "image/png" || blob.size < 1 || blob.size > pngMaximum) throw new StudioRasterSourceLeaseError("source-limit", "썸네일 PNG가 예약한 표시 예산을 초과했습니다.");
      bitmap.close(); bitmap = null;
      canvas.width = 0; canvas.height = 0; canvas = null;
      // 생성용 두 표면의 소유권을 해제한 뒤에만 PNG+표시용 한 표면으로 원자 축소한다.
      for (const reservation of reservations) reservation.shrinkToResidentBytes?.(blob.size + rgba);
      src = URL.createObjectURL(blob);
      let released = false;
      const url = src, receipt = original.receipt;
      return Object.freeze({ kind: "thumbnail" as const, src: url, width: size.width, height: size.height, sourceReceipt: receipt,
        release() { if (released) return; released = true; revoke(url); releaseAll(reservations); } });
    } catch (error) {
      if (src) revoke(src);
      releaseAll(reservations); throw error;
    } finally {
      bitmap?.close();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      original.release();
    }
  }, options.signal);
}
