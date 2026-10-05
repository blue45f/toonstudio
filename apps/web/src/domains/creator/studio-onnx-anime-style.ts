/**
 * On-device anime style transfer service — the engine behind the
 * "기기에서 애니풍 변환" action in the image tools.
 *
 * Pipeline: decode the source raster, shrink it to the model's fixed
 * 512×512 input, run AnimeGANv2 through the product ONNX provider,
 * then render the converted plane back at native resolution
 * (`renderStudioAnimeganRaster`). This module is only loaded through
 * a dynamic import from the anime style panel, keeping the ONNX
 * runtime and the ~8.7MB per-style models out of the Studio startup
 * graph. Failures propagate to the panel, which keeps the cloud route
 * and the original image untouched.
 */
import {
  STUDIO_BG_REMOVE_MAX_DECODED_AXIS,
  STUDIO_BG_REMOVE_MAX_DECODED_PIXELS,
} from "./studio-bg-remove";
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
} from "./studio-onnx-inference-provider";
import {
  STUDIO_ANIMEGAN_INPUT_SIZE,
  createStudioAnimeganConverter,
  createStudioAnimeganModelRegistry,
  preprocessStudioAnimeganInput,
  renderStudioAnimeganRaster,
  type StudioAnimeganConverter,
  type StudioAnimeganStyleKind,
} from "./studio-onnx-animegan";
import {
  loadStudioAnimeganModelBytes,
  loadStudioOnnxForegroundRuntime,
} from "./studio-onnx-runtime-assets";

export interface StudioOnnxAnimeImage {
  readonly image: HTMLImageElement;
  readonly width: number;
  readonly height: number;
}

export type StudioOnnxAnimeImageLoader = (
  src: string,
  signal?: AbortSignal,
) => Promise<StudioOnnxAnimeImage>;

export interface CreateStudioOnnxAnimeStyleServiceOptions {
  readonly loadImage?: StudioOnnxAnimeImageLoader;
  readonly converter?: StudioAnimeganConverter;
}

export interface ConvertToAnimeStyleOnDeviceOptions {
  /** Which bundled AnimeGANv2 style to apply. */
  readonly kind: StudioAnimeganStyleKind;
  readonly signal?: AbortSignal;
}

export interface StudioOnnxAnimeStyleResult {
  readonly dataUrl: string;
  readonly executionProvider: StudioOnnxExecutionProvider;
}

function createAbortError(): Error {
  if (typeof DOMException === "function") {
    return new DOMException("변환을 취소했습니다.", "AbortError");
  }
  const error = new Error("변환을 취소했습니다.");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

function assertDecodedDimensions(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width > STUDIO_BG_REMOVE_MAX_DECODED_AXIS
    || height > STUDIO_BG_REMOVE_MAX_DECODED_AXIS
    || width * height > STUDIO_BG_REMOVE_MAX_DECODED_PIXELS
  ) {
    throw new RangeError("디코드된 이미지 크기가 안전 한도를 초과합니다.");
  }
}

function loadImageElement(
  src: string,
  signal?: AbortSignal,
): Promise<StudioOnnxAnimeImage> {
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    let settled = false;
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener("abort", onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      image.src = "";
      reject(createAbortError());
    };
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      try {
        assertDecodedDimensions(width, height);
      } catch (cause) {
        reject(cause);
        return;
      }
      resolve(Object.freeze({ image, width, height }));
    };
    image.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("이미지를 불러오지 못했습니다."));
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
    image.src = src;
  });
}

function readRaster(
  image: HTMLImageElement,
  width: number,
  height: number,
): Uint8ClampedArray {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("캔버스를 만들 수 없습니다.");
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}

function createDefaultConverter(): StudioAnimeganConverter {
  return createStudioAnimeganConverter({
    loadModelBytes: loadStudioAnimeganModelBytes,
    createProvider: (executionProvider) => (
      createStudioOnnxInferenceProvider({
        registry: createStudioAnimeganModelRegistry(),
        executionProvider,
        loadRuntime: loadStudioOnnxForegroundRuntime,
      })
    ),
  });
}

export interface StudioOnnxAnimeStyleService {
  convertToAnimeStyleOnDevice(
    src: string,
    options: ConvertToAnimeStyleOnDeviceOptions,
  ): Promise<StudioOnnxAnimeStyleResult>;
}

export function createStudioOnnxAnimeStyleService(
  options: CreateStudioOnnxAnimeStyleServiceOptions = {},
): StudioOnnxAnimeStyleService {
  const imageLoader = options.loadImage ?? loadImageElement;
  let converter = options.converter ?? null;
  const getConverter = (): StudioAnimeganConverter => {
    converter ??= createDefaultConverter();
    return converter;
  };

  return Object.freeze({
    async convertToAnimeStyleOnDevice(
      src: string,
      convertOptions: ConvertToAnimeStyleOnDeviceOptions,
    ): Promise<StudioOnnxAnimeStyleResult> {
      if (typeof src !== "string" || src.length === 0) {
        throw new TypeError("이미지 주소가 비어 있습니다.");
      }
      const { kind, signal } = convertOptions;
      throwIfAborted(signal);
      const loaded = await imageLoader(src, signal);
      throwIfAborted(signal);
      const modelRgba = readRaster(
        loaded.image,
        STUDIO_ANIMEGAN_INPUT_SIZE,
        STUDIO_ANIMEGAN_INPUT_SIZE,
      );
      const tensor = preprocessStudioAnimeganInput(
        modelRgba,
        STUDIO_ANIMEGAN_INPUT_SIZE,
        STUDIO_ANIMEGAN_INPUT_SIZE,
      );
      const conversion = await getConverter().convert(kind, tensor, { signal });
      throwIfAborted(signal);
      const rendered = renderStudioAnimeganRaster({
        animePlane: conversion.anime,
        width: loaded.width,
        height: loaded.height,
      });
      throwIfAborted(signal);
      const canvas = document.createElement("canvas");
      canvas.width = loaded.width;
      canvas.height = loaded.height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("캔버스를 만들 수 없습니다.");
      const imageData = new ImageData(rendered, loaded.width, loaded.height);
      context.putImageData(imageData, 0, 0);
      throwIfAborted(signal);
      return Object.freeze({
        dataUrl: canvas.toDataURL("image/png"),
        executionProvider: conversion.executionProvider,
      });
    },
  });
}

const defaultService = createStudioOnnxAnimeStyleService();

export function convertToAnimeStyleOnDevice(
  src: string,
  options: ConvertToAnimeStyleOnDeviceOptions,
): Promise<StudioOnnxAnimeStyleResult> {
  return defaultService.convertToAnimeStyleOnDevice(src, options);
}
