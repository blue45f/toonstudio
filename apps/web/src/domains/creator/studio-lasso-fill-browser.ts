/** Browser orchestration for Surround (Lasso) Fill — the drag-path sibling of
 * `runStudioAdvancedFillInBrowser`. Loads pixels the same way the tap runner does
 * (shared image loader + raster-size guard), then runs the synchronous lasso engine
 * (`applyStudioLassoFill`) on the main thread: the lasso mask bounds the work to the
 * enclosed region and the engine is already deterministic and abort-aware.
 *
 * Path points arrive as normalized ratios (0..1) against the target frame, exactly
 * like the tap runner's seed ratios, so flipped/rotated frame handling stays in the
 * run adapter that owns the frame math.
 */
import {
  currentStudioAdvancedFillBrowserMaxPixels,
  formatStudioAdvancedFillRasterSizeError,
  validateStudioAdvancedFillRasterDimensions,
} from "./studio-advanced-fill-raster-safety";
import {
  encodeStudioAdvancedFillPixels,
  planStudioAdvancedFillGuard,
  type StudioAdvancedFillBrowserResult,
} from "./studio-advanced-fill-browser";
import { loadFloodFillSourceImage } from "./studio-flood-fill";
import { hexToRgb } from "./studio-filters";
import { applyStudioLassoFill, type StudioLassoFillPoint } from "./studio-lasso-fill";

import type { AdvancedFillImageDataLike, AdvancedFillRgba } from "./studio-advanced-fill";
import type { StudioAdvancedFillSettings } from "./studio-advanced-fill-settings";

export interface StudioLassoFillBrowserRequest {
  targetSrc: string;
  /** Composed line-art reference (same source the tap runner would use). Omit to use the target itself. */
  referenceSrc?: string;
  /** Normalized (0..1) drag path in target-frame space. At least 3 points; auto-closed. */
  pathRatios: readonly StudioLassoFillPoint[];
  fillColor: string;
  settings: StudioAdvancedFillSettings;
  abort?: AbortSignal;
}

function lassoAbortError(): DOMException {
  return new DOMException("채우기를 취소했습니다.", "AbortError");
}

async function loadLassoPixels(
  src: string,
  outputSize: { width: number; height: number } | undefined,
  abort?: AbortSignal,
): Promise<AdvancedFillImageDataLike> {
  if (abort?.aborted) throw lassoAbortError();
  const image = await loadFloodFillSourceImage(src, abort);
  if (abort?.aborted) throw lassoAbortError();
  const naturalWidth = image.naturalWidth || image.width;
  const naturalHeight = image.naturalHeight || image.height;
  if (!naturalWidth || !naturalHeight) throw new Error("채우기 이미지 크기를 확인할 수 없습니다.");
  const width = outputSize?.width ?? naturalWidth;
  const height = outputSize?.height ?? naturalHeight;
  let safeDimensions: { width: number; height: number };
  try {
    safeDimensions = validateStudioAdvancedFillRasterDimensions(
      width,
      height,
      currentStudioAdvancedFillBrowserMaxPixels(),
    );
  } catch (error) {
    throw new RangeError(formatStudioAdvancedFillRasterSizeError(error), { cause: error });
  }
  if (typeof document === "undefined") throw new Error("이 브라우저에서는 채우기 캔버스를 만들 수 없습니다.");
  const canvas = document.createElement("canvas");
  canvas.width = safeDimensions.width;
  canvas.height = safeDimensions.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error("채우기 픽셀을 읽을 수 없습니다.");
  }
  try {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.clearRect(0, 0, safeDimensions.width, safeDimensions.height);
    context.drawImage(image, 0, 0, safeDimensions.width, safeDimensions.height);
    if (abort?.aborted) throw lassoAbortError();
    const pixels = context.getImageData(0, 0, safeDimensions.width, safeDimensions.height);
    return { data: pixels.data, width: safeDimensions.width, height: safeDimensions.height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export async function runStudioLassoFillInBrowser(
  request: StudioLassoFillBrowserRequest,
): Promise<StudioAdvancedFillBrowserResult> {
  const target = await loadLassoPixels(request.targetSrc, undefined, request.abort);
  const reference = request.referenceSrc
    ? await loadLassoPixels(
        request.referenceSrc,
        { width: target.width, height: target.height },
        request.abort,
      )
    : undefined;
  const { r, g, b } = hexToRgb(request.fillColor);
  const fill: AdvancedFillRgba = [r, g, b, 255];
  const guard = planStudioAdvancedFillGuard(request.settings, false);
  const points: StudioLassoFillPoint[] = request.pathRatios.map((point) => ({
    x: clampRatio(point.x) * (target.width - 1),
    y: clampRatio(point.y) * (target.height - 1),
  }));
  const result = applyStudioLassoFill({
    target,
    referenceImage: reference,
    points,
    fill,
    abort: request.abort,
    options: {
      // 선화 참조가 따로 있으면 그 알파를 선으로 본다. 대상 자체가 선화인 경우도 같은 규칙이다.
      lineBoundary: "visible",
      closeGapRadius: request.settings.closeGapPx,
      areaAdjustment: request.settings.expansionPx,
      maxAreaRatio: guard.maxAreaRatio,
    },
  });
  const blockedReason = result.diagnostics.status === "leak-guarded" ? "area" as const : null;
  if (blockedReason || result.diagnostics.status !== "applied") {
    return {
      dataUrl: request.targetSrc,
      changed: false,
      blockedReason,
      diagnostics: result.diagnostics,
    };
  }
  return {
    dataUrl: await encodeStudioAdvancedFillPixels(result.imageData, request.abort),
    changed: true,
    blockedReason: null,
    diagnostics: result.diagnostics,
  };
}
