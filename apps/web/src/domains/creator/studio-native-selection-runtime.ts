/**
 * 제로 의존성 네이티브 스마트 선택·윤곽선 추출 런타임 진입점.
 *
 * `@techstark/opencv-js`(14 MiB Emscripten WASM) 없이 `studio-opencv-selection.ts`의
 * 선택·플러드필·마스크 정제·윤곽선 벡터화 계약을 동일하게 수행한다.
 */

import {
  runNativeApproxPolyDP,
  runNativeFindContours,
} from "./studio-native-selection-contour-kernels";
import {
  buildEllipseKernel,
  runNativeFloodFill,
  runNativeGaussianBlur,
  runNativeGrabCut,
  runNativeMorphologyEx,
} from "./studio-native-selection-raster-kernels";
import {
  NATIVE_CV,
  NativeMat,
  NativeMatVector,
  NativePoint,
  NativeRect,
  NativeScalar,
  NativeSize,
  asNativeMat,
  type StudioNativeSelectionMat,
  type StudioNativeSelectionMatVector,
  type StudioNativeSelectionPoint,
  type StudioNativeSelectionRect,
  type StudioNativeSelectionRuntime,
  type StudioNativeSelectionSize,
} from "./studio-native-selection-types";

export type {
  StudioNativeSelectionMat,
  StudioNativeSelectionMatVector,
  StudioNativeSelectionPoint,
  StudioNativeSelectionRect,
  StudioNativeSelectionRuntime,
  StudioNativeSelectionSize,
};

export function createStudioNativeSelectionRuntime(): StudioNativeSelectionRuntime {
  let rngSeed = 0;

  return {
    CV_8UC1: NATIVE_CV.CV_8UC1,
    CV_8UC4: NATIVE_CV.CV_8UC4,
    COLOR_RGBA2RGB: NATIVE_CV.COLOR_RGBA2RGB,
    GC_FGD: NATIVE_CV.GC_FGD,
    GC_PR_FGD: NATIVE_CV.GC_PR_FGD,
    GC_INIT_WITH_RECT: NATIVE_CV.GC_INIT_WITH_RECT,
    FLOODFILL_FIXED_RANGE: NATIVE_CV.FLOODFILL_FIXED_RANGE,
    FLOODFILL_MASK_ONLY: NATIVE_CV.FLOODFILL_MASK_ONLY,
    MORPH_OPEN: NATIVE_CV.MORPH_OPEN,
    MORPH_ELLIPSE: NATIVE_CV.MORPH_ELLIPSE,
    THRESH_BINARY: NATIVE_CV.THRESH_BINARY,
    RETR_CCOMP: NATIVE_CV.RETR_CCOMP,
    CHAIN_APPROX_SIMPLE: NATIVE_CV.CHAIN_APPROX_SIMPLE,
    BORDER_CONSTANT: NATIVE_CV.BORDER_CONSTANT,

    Mat: NativeMat,
    MatVector: NativeMatVector,
    Point: NativePoint,
    Rect: NativeRect,
    Scalar: NativeScalar,
    Size: NativeSize,

    matFromArray(rows, cols, type, array) {
      const mat = new NativeMat(rows, cols, type);
      if (type === NATIVE_CV.CV_32SC2 || type === NATIVE_CV.CV_32SC4) {
        const len = Math.min(mat.data32S.length, array.length);
        for (let i = 0; i < len; i += 1) mat.data32S[i] = array[i]!;
      } else {
        const len = Math.min(mat.data.length, array.length);
        for (let i = 0; i < len; i += 1) mat.data[i] = array[i]!;
      }
      return mat;
    },

    cvtColor(src, dst, code) {
      const srcMat = asNativeMat(src, "src");
      const dstMat = asNativeMat(dst, "dst");
      if (code !== NATIVE_CV.COLOR_RGBA2RGB) {
        throw new RangeError(`Unsupported cvtColor code: ${code}`);
      }
      dstMat.allocate(srcMat.rows, srcMat.cols, NATIVE_CV.CV_8UC3);
      const pixelCount = srcMat.rows * srcMat.cols;
      const inData = srcMat.data;
      const outData = dstMat.data;
      for (let i = 0; i < pixelCount; i += 1) {
        const s = i * 4;
        const d = i * 3;
        outData[d] = inData[s]!;
        outData[d + 1] = inData[s + 1]!;
        outData[d + 2] = inData[s + 2]!;
      }
    },

    grabCut(img, mask, rect, _bgdModel, _fgdModel, iterCount) {
      runNativeGrabCut(
        asNativeMat(img, "img"),
        asNativeMat(mask, "mask"),
        rect,
        iterCount,
        rngSeed,
      );
    },

    floodFill(image, mask, seedPoint, _newVal, _rect, loDiff, upDiff, flags) {
      return runNativeFloodFill(
        asNativeMat(image, "image"),
        asNativeMat(mask, "mask"),
        seedPoint,
        loDiff,
        upDiff,
        flags,
      );
    },

    GaussianBlur(src, dst, ksize, sigmaX, sigmaY) {
      runNativeGaussianBlur(
        asNativeMat(src, "src"),
        asNativeMat(dst, "dst"),
        ksize,
        sigmaX,
        sigmaY,
      );
    },

    morphologyEx(src, dst, op, kernel, _anchor, iterations) {
      runNativeMorphologyEx(
        asNativeMat(src, "src"),
        asNativeMat(dst, "dst"),
        op,
        asNativeMat(kernel, "kernel"),
        iterations,
      );
    },

    getStructuringElement(_shape, ksize) {
      return buildEllipseKernel(ksize.width, ksize.height);
    },

    threshold(src, dst, thresh, maxval) {
      const srcMat = asNativeMat(src, "src");
      const dstMat = asNativeMat(dst, "dst");
      dstMat.allocate(srcMat.rows, srcMat.cols, NATIVE_CV.CV_8UC1);
      const inData = srcMat.data;
      const outData = dstMat.data;
      for (let i = 0; i < inData.length; i += 1) {
        outData[i] = inData[i]! > thresh ? maxval : 0;
      }
      return thresh;
    },

    findContours(image, contours, hierarchy) {
      if (!(contours instanceof NativeMatVector)) {
        throw new TypeError("contours must be a NativeMatVector instance");
      }
      runNativeFindContours(
        asNativeMat(image, "image"),
        contours,
        asNativeMat(hierarchy, "hierarchy"),
      );
    },

    approxPolyDP(curve, approxCurve, epsilon, closed) {
      runNativeApproxPolyDP(
        asNativeMat(curve, "curve"),
        asNativeMat(approxCurve, "approxCurve"),
        epsilon,
        closed,
      );
    },

    setRNGSeed(seed) {
      rngSeed = seed | 0;
    },
  };
}
