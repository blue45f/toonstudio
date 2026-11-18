import { applyAdvancedFillPostExpansion } from "./fill/studio-advanced-fill-expansion";
import { fillLeftoverGaps } from "./fill/studio-fill-leftover";
import { softenStudioAdvancedFillEdges, type AdvancedFillResult } from "./studio-advanced-fill";
import { applyAlphaLockToRasterPixels } from "./studio-alpha-lock";

import type {
  FillExpandKernelShape,
  FillExpandType,
  FillRgbTuple,
} from "./fill/studio-advanced-fill-expansion";
import type { StudioAdvancedFillWorkerRunRequest } from "./studio-advanced-fill-worker-protocol";

/**
 * 워커 내부에서 선택적으로 실행할 CSP 고급 확장(최암부 능선 정지·좁은 틈새 스며들기·미채색 틈새 메우기) 후처리 옵션.
 * 근거: ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 */
export interface StudioAdvancedFillCspWorkerPostprocessOptions {
  readonly expandPx?: number;
  readonly expandType?: FillExpandType;
  readonly kernelShape?: FillExpandKernelShape;
  readonly soakIntoNarrowArea?: boolean;
  readonly sliverRadiusPx?: number;
  readonly useNotStartColor?: boolean;
  readonly notStartColor?: FillRgbTuple;
  readonly notStartColorTolerance?: number;
  readonly fillLeftoverMaxAreaPx?: number;
}

/** Applies expensive edge and Alpha Lock passes inside the same worker as the flood scan. */
export function postprocessStudioAdvancedFillWorkerResult(
  request: StudioAdvancedFillWorkerRunRequest,
  result: AdvancedFillResult,
  cspOptions?: StudioAdvancedFillCspWorkerPostprocessOptions,
): AdvancedFillResult {
  if (result.diagnostics.status !== "applied") return result;

  let workingResult = result;
  if (cspOptions) {
    const expanded = applyAdvancedFillPostExpansion({
      mask: workingResult.mask,
      target: request.target,
      fill: request.fill,
      referenceImage: request.referenceImage,
      seed: request.seeds[0],
      expandPx: cspOptions.expandPx,
      expandType: cspOptions.expandType,
      kernelShape: cspOptions.kernelShape,
      soakIntoNarrowArea: cspOptions.soakIntoNarrowArea,
      sliverRadiusPx: cspOptions.sliverRadiusPx,
      useNotStartColor: cspOptions.useNotStartColor,
      notStartColor: cspOptions.notStartColor,
      notStartColorTolerance: cspOptions.notStartColorTolerance,
    });
    let nextData = expanded.imageData.data;
    const nextMask = expanded.mask;
    let paintedCount = expanded.paintedPixelCount;
    if (cspOptions.fillLeftoverMaxAreaPx !== undefined && cspOptions.fillLeftoverMaxAreaPx > 0) {
      const leftover = fillLeftoverGaps({
        target: { data: nextData, width: request.target.width, height: request.target.height },
        referenceLineImage: request.referenceImage,
        maxGapAreaPx: cspOptions.fillLeftoverMaxAreaPx,
      });
      nextData = leftover.imageData.data;
      paintedCount += leftover.filledPixelCount;
    }
    workingResult = {
      ...workingResult,
      mask: nextMask,
      imageData: {
        data: nextData,
        width: request.target.width,
        height: request.target.height,
      },
      diagnostics: {
        ...workingResult.diagnostics,
        status: paintedCount === 0 ? "noop" : "applied",
        paintedPixelCount: paintedCount,
      },
    };
    if (workingResult.diagnostics.status !== "applied") return workingResult;
  }

  if (request.softenEdges) {
    softenStudioAdvancedFillEdges(
      workingResult.imageData.data,
      request.target.data,
      workingResult.mask,
      request.target.width,
      request.target.height,
      request.fill,
    );
  }
  if (!request.enforceAlphaLock) return workingResult;

  const lockSource = request.alphaLockSource ?? request.target;
  if (
    lockSource.width !== request.target.width ||
    lockSource.height !== request.target.height
  ) {
    throw new RangeError("알파 락 원본과 채우기 대상의 픽셀 크기가 다릅니다.");
  }
  const locked = applyAlphaLockToRasterPixels(
    lockSource.data,
    request.target.data,
    workingResult.imageData.data,
  );
  const areaRatio = locked.changedPixelCount / (workingResult.diagnostics.width * workingResult.diagnostics.height);
  return {
    ...workingResult,
    imageData: {
      data: locked.data,
      width: workingResult.imageData.width,
      height: workingResult.imageData.height,
    },
    diagnostics: {
      ...workingResult.diagnostics,
      status: locked.changedPixelCount === 0 ? "noop" : "applied",
      paintedPixelCount: locked.changedPixelCount,
      final: {
        ...workingResult.diagnostics.final,
        pixelCount: locked.changedPixelCount,
        areaRatio,
      },
    },
  };
}
