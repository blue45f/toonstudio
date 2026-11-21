/**
 * Clip Studio Paint 5.1.5 전수 필터·색조 보정·레이어 변환 통합 실행 디스패처 (46종).
 *
 * Wave 2 (`StudioFilterDialog` / `F1` 커맨드 팔레트) 지연 로딩(`import()`) 전용
 * 어댑터(`getCspReaFilterDialogAdapter`)를 제공하며, 초기 진입 그래프(`check:studio-eager-graph`)에
 * 전혀 포함되지 않는다.
 */

import {
  applyCspGaussBlurFilter,
  applyCspGeometricDistortionFishEyeFilter,
  applyCspMosaicFilter,
  applyCspMotionBlurFilter,
  applyCspPinchFilter,
  applyCspRadialBlurFilter,
  applyCspSharpAndBlurMoreFilter,
  applyCspTppChromaticAberrationFilter,
  applyCspUnSharpMaskFilter,
} from "../../drawing/studio-csp-complete-filter-liquify-suite";
import {
  applyCspDustFilter,
  applyCspPerlinNoiseFilter,
  applyCspPiLensDistortionFilter,
  applyCspPolarCoordinatesFilter,
  applyCspSimpleWaveFilter,
  applyCspSpiralFilter,
  applyCspTpReduceNoiseFilter,
  applyCspTppAddNoiseFilter,
  applyCspTppNormalMapFilter,
  applyCspTppRotationBlurFilter,
} from "../../drawing/studio-csp-native-decompiled-filters";
import {
  applyCspFlowBasedAbstractionFilter,
  applyCspGeometricDistortionPanoramaFilter,
  applyCspLineWidthFilter,
  applyCspPencilArtFilter,
  applyCspSmoothingFilter,
  applyCspSphereFilter,
  applyCspTppFilmCameraStyleFilter,
  applyCspWaveformFilter,
  applyCspZigzagFilter,
} from "../../drawing/studio-csp-remaining-plugin-filters";
import {
  applyCspColorTransferFilter,
  type CspColorTransferPresetId,
} from "../../drawing/studio-csp-unified-runtime-hub";
import {
  accelerateCspFilterWithWasm64,
  isCspFilterWasm64Acceleratable,
} from "../../kernel/wasm64-live-canvas-bridge";

import {
  applyCspCustomReferenceColorMatch,
  applyCspLtLineAndToneExtract,
  convertCspRasterToVectorStrokes,
} from "./csp-rea-extract-vectorize";
import {
  CSP_REA_ALL_FILTER_SPECS,
  type CspReaFilterCategory,
  type CspReaFilterDescriptor,
  type CspReaFilterId,
  type CspReaFilterParamMap,
  type CspReaFilterParameterSpec,
  type CspReaImageDataLike,
} from "./csp-rea-filter-descriptors";
import {
  applyCspBinarizationFilter,
  applyCspBorderEffectFilter,
  applyCspBrightnessContrastFilter,
  applyCspBrightnessToOpacityFilter,
  applyCspChangeLineColorToDrawingFilter,
  applyCspColorBalanceFilter,
  applyCspGradientMapFilter,
  applyCspHsvTonalFilter,
  applyCspLevelCorrectionFilter,
  applyCspPosterizeFilter,
  applyCspReverseGradientFilter,
  applyCspToneCurveFilter,
} from "./csp-rea-tonal-corrections";

export {
  CSP_REA_ALL_FILTER_SPECS,
  type CspReaFilterCategory,
  type CspReaFilterDescriptor,
  type CspReaFilterId,
  type CspReaFilterParamMap,
  type CspReaFilterParameterSpec,
  type CspReaImageDataLike,
};

const num = (params: CspReaFilterParamMap | undefined, key: string, fallback: number): number => {
  const val = params?.[key];
  return typeof val === "number" && Number.isFinite(val) ? val : fallback;
};

const bool = (params: CspReaFilterParamMap | undefined, key: string, fallback: boolean): boolean => {
  const val = params?.[key];
  return typeof val === "boolean" ? val : fallback;
};

const str = (params: CspReaFilterParamMap | undefined, key: string, fallback: string): string => {
  const val = params?.[key];
  return typeof val === "string" && val.length > 0 ? val : fallback;
};

/**
 * 46종 CSP 필터·색조 보정·레이어 변환 전체에 대해 파라미터를 실시간 반영한 RGBA 픽셀 변환을 수행한다.
 */
export function executeCspReaFilter(
  filterId: CspReaFilterId,
  src: Uint8ClampedArray,
  width: number,
  height: number,
  params?: CspReaFilterParamMap,
): Uint8ClampedArray {
  if (params?.disableWasm64 !== true && isCspFilterWasm64Acceleratable(filterId)) {
    const accelerated = accelerateCspFilterWithWasm64(filterId, src, width, height, params);
    if (accelerated) return accelerated.data;
  }

  const raw = new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
  const cx = width * 0.5;
  const cy = height * 0.5;
  const toClamped = (buf: Uint8Array | Uint8ClampedArray): Uint8ClampedArray =>
    buf instanceof Uint8ClampedArray ? buf : new Uint8ClampedArray(buf);

  switch (filterId) {
    case "gauss-blur":
      return toClamped(applyCspGaussBlurFilter(raw, width, height, { radiusPx: num(params, "radiusPx", 3) }));
    case "motion-blur":
      return toClamped(
        applyCspMotionBlurFilter(raw, width, height, {
          distancePx: num(params, "distancePx", 8),
          angleDeg: num(params, "angleDeg", 0),
          direction: str(params, "direction", "both") as "both" | "forward" | "backward",
        }),
      );
    case "radial-blur":
      return toClamped(
        applyCspRadialBlurFilter(raw, width, height, {
          centerX: num(params, "centerX", cx),
          centerY: num(params, "centerY", cy),
          strengthPx: num(params, "strengthPx", 10),
          direction: str(params, "direction", "outward") as "both" | "outward" | "inward",
        }),
      );
    case "rotation-blur":
      return applyCspTppRotationBlurFilter(src, width, height, {
        amountDeg: num(params, "amountDeg", 12),
        direction: str(params, "direction", "both") as "both" | "clockwise" | "counter-clockwise",
        aspect: num(params, "aspect", 1),
        tiltDeg: num(params, "tiltDeg", 0),
      });
    case "blur-soft":
      return toClamped(applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "blur" }));
    case "blur-more":
      return toClamped(applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "blur-more" }));
    case "smoothing":
      return applyCspSmoothingFilter(src, width, height);

    case "fisheye":
      return toClamped(
        applyCspGeometricDistortionFishEyeFilter(raw, width, height, {
          distortion: num(params, "distortion", 50),
          centerX: num(params, "centerX", cx),
          centerY: num(params, "centerY", cy),
          radiusScale: num(params, "radiusScale", 1),
        }),
      );
    case "panorama":
      return applyCspGeometricDistortionPanoramaFilter(src, width, height, {
        mode: str(params, "mode", "equirectangular-to-perspective") as
          | "equirectangular-to-perspective"
          | "perspective-to-equirectangular",
        fovScale: num(params, "fovScale", 1),
      });
    case "lens-distortion":
      return applyCspPiLensDistortionFilter(src, width, height, {
        distortion: num(params, "distortion", -35),
        rangeType: str(params, "rangeType", "full") as "full" | "radius",
        radius01: num(params, "radius01", 1),
        oblateness: num(params, "oblateness", 0),
      });
    case "pinch":
      return toClamped(
        applyCspPinchFilter(raw, width, height, {
          centerX: num(params, "centerX", cx),
          centerY: num(params, "centerY", cy),
          strength: num(params, "strength", 45),
          radiusScale: num(params, "radiusScale", 1),
        }),
      );
    case "sphere":
      return applyCspSphereFilter(src, width, height, {
        strength: num(params, "strength", 60),
        cylindricalMode: bool(params, "cylindricalMode", false),
      });
    case "spiral":
      return applyCspSpiralFilter(src, width, height, {
        twirlTurns: num(params, "twirlTurns", 0.5),
      });
    case "simple-wave":
      return applyCspSimpleWaveFilter(src, width, height, {
        amplitudeX: num(params, "amplitudeX", 4),
        amplitudeY: num(params, "amplitudeY", num(params, "amplitudeX", 4)),
        wavelengthX: num(params, "wavelengthX", 16),
        wavelengthY: num(params, "wavelengthY", num(params, "wavelengthX", 16)),
      });
    case "waveform":
      return applyCspWaveformFilter(src, width, height, {
        shape: str(params, "shape", "triangle") as "circle" | "triangle" | "square",
        wavelengthPx: num(params, "wavelengthPx", 12),
        amplitudeX: num(params, "amplitudeX", 4),
        amplitudeY: num(params, "amplitudeY", num(params, "amplitudeX", 4)),
      });
    case "zigzag":
      return applyCspZigzagFilter(src, width, height, {
        angleDeg: num(params, "angleDeg", 45),
        ridges: num(params, "ridges", 4),
      });
    case "polar-coordinates":
      return applyCspPolarCoordinatesFilter(src, width, height, {
        mode: str(params, "mode", "rect-to-polar") as "rect-to-polar" | "polar-to-rect",
      });

    case "sharp":
      return toClamped(applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "sharp" }));
    case "sharp-strong":
      return toClamped(applyCspSharpAndBlurMoreFilter(raw, width, height, { mode: "sharp-strong" }));
    case "unsharp-mask":
      return toClamped(
        applyCspUnSharpMaskFilter(raw, width, height, {
          radiusPx: num(params, "radiusPx", 2),
          amountPercent: num(params, "amountPercent", 120),
          threshold: num(params, "threshold", 2),
        }),
      );

    case "flow-based-abstraction":
      return applyCspFlowBasedAbstractionFilter(src, width, height, {
        numberOfGradations: num(params, "numberOfGradations", 6),
        lineOpacity01: num(params, "lineOpacity01", 0.85),
      });
    case "pencil-art":
      return applyCspPencilArtFilter(src, width, height, {
        showOutline: bool(params, "showOutline", true),
        showHatchingBackground: bool(params, "showHatchingBackground", true),
        grayscaleOutput: bool(params, "grayscaleOutput", true),
      });
    case "mosaic":
      return toClamped(applyCspMosaicFilter(raw, width, height, { tileSizePx: num(params, "tileSizePx", 6) }));
    case "film-camera-style":
      return applyCspTppFilmCameraStyleFilter(src, width, height, {
        chromaticAberrationPx: num(params, "chromaticAberrationPx", 1.5),
        vintageSepiaEnabled: bool(params, "vintageSepiaEnabled", true),
        lightLeakMode: str(params, "lightLeakMode", "corner") as "none" | "left" | "right" | "corner",
      });
    case "chromatic-aberration":
      return toClamped(
        applyCspTppChromaticAberrationFilter(raw, width, height, {
          mode: str(params, "mode", "radial") as "radial" | "lateral",
          intensity: num(params, "intensity", 35),
          angleDeg: num(params, "angleDeg", 0),
        }),
      );
    case "normal-map":
      return applyCspTppNormalMapFilter(src, width, height, {
        strength: num(params, "strength", 2.5),
        yDirectionType: str(params, "yDirectionType", "opengl-y-plus") as
          | "opengl-y-plus"
          | "directx-y-minus",
      });
    case "line-width":
      return applyCspLineWidthFilter(src, width, height, {
        mode: str(params, "mode", "thicken") as "thin" | "thicken",
        radiusPx: num(params, "radiusPx", 1),
        remainOnePixelCore: bool(params, "remainOnePixelCore", true),
      });
    case "border-effect":
      return applyCspBorderEffectFilter(src, width, height, {
        mode: str(params, "mode", "edge") as "edge" | "watercolor-edge",
        thicknessPx: num(params, "thicknessPx", 2),
        borderR: num(params, "borderR", 255),
        borderG: num(params, "borderG", 255),
        borderB: num(params, "borderB", 255),
        opacity01: num(params, "opacity01", 1),
      });

    case "perlin-noise":
      return applyCspPerlinNoiseFilter(src, width, height, {
        scalePx: num(params, "scalePx", 24),
        octaves: num(params, "octaves", 4),
        persistence: num(params, "persistence", 0.5),
        seed: num(params, "seed", 7),
        blendOpacity01: num(params, "blendOpacity01", 0.85),
      });
    case "add-noise":
      return applyCspTppAddNoiseFilter(src, width, height, {
        amount01: num(params, "amount01", 0.18),
        colorMode: str(params, "colorMode", "monochrome") as "monochrome" | "color",
        seed: num(params, "seed", 42),
      });
    case "reduce-noise":
      return applyCspTpReduceNoiseFilter(src, width, height, {
        strength01: num(params, "strength01", 0.6),
        preserveDetail01: num(params, "preserveDetail01", 0.5),
      });
    case "remove-dust":
      return applyCspDustFilter(src, width, height, {
        radiusPx: num(params, "radiusPx", 1),
        mode: str(params, "mode", "median") as "median" | "remove-dark-dust" | "remove-bright-scratches",
        threshold01: num(params, "threshold01", 0.08),
      });

    case "brightness-contrast":
      return applyCspBrightnessContrastFilter(src, width, height, {
        brightness: num(params, "brightness", 10),
        contrast: num(params, "contrast", 15),
        legacyMode: bool(params, "legacyMode", false),
      });
    case "hsv-tonal":
      return applyCspHsvTonalFilter(src, width, height, {
        hueDeg: num(params, "hueDeg", 0),
        saturation: num(params, "saturation", 15),
        luminosity: num(params, "luminosity", 0),
      });
    case "posterize":
      return applyCspPosterizeFilter(src, width, height, {
        levels: num(params, "levels", 6),
      });
    case "reverse-gradient":
      return applyCspReverseGradientFilter(src, width, height);
    case "level-correction":
      return applyCspLevelCorrectionFilter(src, width, height, {
        rgb: {
          inputBlack: num(params, "inputBlack", 10),
          gamma: num(params, "gamma", 1.0),
          inputWhite: num(params, "inputWhite", 245),
          outputBlack: num(params, "outputBlack", 0),
          outputWhite: num(params, "outputWhite", 255),
        },
      });
    case "tone-curve": {
      const midLift = num(params, "midtoneLift", 18);
      const shadowLift = num(params, "shadowLift", -8);
      return applyCspToneCurveFilter(src, width, height, {
        master: [
          { x: 0, y: 0 },
          { x: 64, y: Math.max(0, Math.min(255, 64 + shadowLift)) },
          { x: 128, y: Math.max(0, Math.min(255, 128 + midLift)) },
          { x: 255, y: 255 },
        ],
      });
    }
    case "color-balance": {
      const triplet = {
        cyanRed: num(params, "cyanRed", 15),
        magentaGreen: num(params, "magentaGreen", 0),
        yellowBlue: num(params, "yellowBlue", -12),
      };
      return applyCspColorBalanceFilter(src, width, height, {
        midtones: triplet,
        preserveLuminosity: bool(params, "preserveLuminosity", true),
      });
    }
    case "binarization":
      return applyCspBinarizationFilter(src, width, height, {
        threshold: num(params, "threshold", 128),
        preserveAlpha: bool(params, "preserveAlpha", true),
      });
    case "gradient-map":
      return applyCspGradientMapFilter(src, width, height, {
        stops: Array.isArray(params?.stops)
          ? (params.stops as readonly { position01: number; r: number; g: number; b: number }[])
          : [
              { position01: 0, r: 22, g: 18, b: 46 },
              { position01: 0.5, r: 172, g: 88, b: 84 },
              { position01: 1, r: 248, g: 234, b: 204 },
            ],
        mixRate01: num(params, "mixRate01", 1),
        reverse: bool(params, "reverse", false),
      });
    case "color-transfer": {
      if (params?.referenceRgba instanceof Uint8ClampedArray || params?.referenceRgba instanceof Uint8Array) {
        return applyCspCustomReferenceColorMatch(src, width, height, {
          referenceRgba: params.referenceRgba,
          referenceWidth: num(params, "referenceWidth", width),
          referenceHeight: num(params, "referenceHeight", height),
          strength01: num(params, "strength", 0.85),
          preserveLuminance: bool(params, "preserveLuminance", false),
        });
      }
      return applyCspColorTransferFilter(src, width, height, {
        presetId: str(params, "presetId", "01_sunrise") as CspColorTransferPresetId,
        strength: num(params, "strength", 0.85),
        preserveLuminance: bool(params, "preserveLuminance", false),
      });
    }

    case "brightness-to-opacity":
      return applyCspBrightnessToOpacityFilter(src, width, height);
    case "change-line-color":
      return applyCspChangeLineColorToDrawingFilter(src, width, height, {
        r: num(params, "r", 44),
        g: num(params, "g", 76),
        b: num(params, "b", 168),
      });
    case "lt-line-extract":
      return applyCspLtLineAndToneExtract(src, width, height, {
        edgeSensitivity: num(params, "edgeSensitivity", 60),
        lineWidthPx: num(params, "lineWidthPx", 1),
        toneLevels: num(params, "toneLevels", 4),
      }).combinedRgba;
    case "raster-to-vector":
      return convertCspRasterToVectorStrokes(src, width, height, {
        inkLuminanceThreshold: num(params, "inkLuminanceThreshold", 160),
        simplifyTolerancePx: num(params, "simplifyTolerancePx", 1),
      }).previewRgba;
  }
}

export function applyCspReaFilterToImageData(
  filterId: CspReaFilterId,
  image: CspReaImageDataLike,
  params?: CspReaFilterParamMap,
): void {
  const result = executeCspReaFilter(filterId, image.data, image.width, image.height, params);
  image.data.set(result.subarray(0, image.data.length));
}

/**
 * Wave 2 (`StudioFilterDialog.tsx` · `F1` 커맨드 팔레트) 지연 연동용 공식 어댑터.
 */
export function getCspReaFilterDialogAdapter() {
  return {
    version: "csp-5.1.5-rea-v1" as const,
    totalFilterCount: CSP_REA_ALL_FILTER_SPECS.length,
    descriptors: CSP_REA_ALL_FILTER_SPECS,
    executeRgba: executeCspReaFilter,
    applyInPlace: applyCspReaFilterToImageData,
    isWasm64Accelerated: isCspFilterWasm64Acceleratable,
    executeRgbaAccelerated: accelerateCspFilterWithWasm64,
  };
}
