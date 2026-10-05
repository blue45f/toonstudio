/**
 * AnimeGANv2 style transfer on the product ONNX provider
 * (`studio-onnx-inference-provider`) — converts photos, sketches, and
 * existing cuts into an anime look entirely on the device.
 *
 * Why this model: the 2026-10-06 anime-style track measured the
 * AnimeGANv2 generator ports shipped by bryandlee/animegan2-pytorch
 * (MIT License, weights included) against the adoption bar — commercial
 * license cleared, browser-practical size/speed, lazy-loadable. The two
 * bundled weights are direct ONNX conversions of the official `.pt`
 * checkpoints, produced and verified in-repo style (strict state_dict
 * binding, PyTorch-reference parity below one 8-bit step on natural
 * inputs); see the `.LICENSE.md` files next to the assets. At ~8.7MB
 * each they download lazily on first use, per style.
 *
 * Two styles, two honest scopes:
 * - `paprika` — theatrical anime look for landscapes and general cuts.
 * - `face-paint` — trained on faces; for portrait-centred cuts.
 *
 * Honest limits (also surfaced in the panel copy): inference runs at a
 * fixed 512×512 (the provider contract accepts fixed dimensions only),
 * so results are upscaled back to native size by bilinear resampling
 * and lose fine detail. This is a real style-transfer network — not a
 * saturation/filter pass — but the cloud BYOK route still wins on
 * fidelity when a key is available.
 *
 * Tensor contract follows the upstream `face2paint` path: RGB in
 * [-1, 1], tanh RGB output in [-1, 1]. Transparent pixels are
 * composited over white first, matching the sibling model modules.
 */
import {
  createStudioOnnxInferenceProvider,
  type StudioOnnxExecutionProvider,
  type StudioOnnxInferenceProvider,
  type StudioOnnxInferenceResult,
  type StudioOnnxSessionReceipt,
  type StudioOnnxTensorValue,
} from "./studio-onnx-inference-provider";
import {
  createStudioOnnxModelRegistry,
  type StudioOnnxModelDescriptor,
  type StudioOnnxModelRegistry,
} from "./studio-onnx-model-registry";

/** The two bundled AnimeGANv2 styles. Kind names mirror upstream weights. */
export type StudioAnimeganStyleKind = "paprika" | "face-paint";

export const STUDIO_ANIMEGAN_MODEL_IDS = Object.freeze({
  "paprika": "animegan2-paprika",
  "face-paint": "animegan2-face-paint-512-v2",
} as const satisfies Record<StudioAnimeganStyleKind, string>);

export const STUDIO_ANIMEGAN_MODEL_VERSION = "1" as const;
export const STUDIO_ANIMEGAN_INPUT_SIZE = 512 as const;
export const STUDIO_ANIMEGAN_INPUT_NAME = "image" as const;
export const STUDIO_ANIMEGAN_OUTPUT_NAME = "anime" as const;

export const STUDIO_ANIMEGAN_MODEL_BYTE_LENGTHS = Object.freeze({
  "paprika": 8_702_673,
  "face-paint": 8_702_673,
} as const satisfies Record<StudioAnimeganStyleKind, number>);

export const STUDIO_ANIMEGAN_MODEL_SHA256 = Object.freeze({
  "paprika":
    "sha256:7cb5bf08d7778a8f4e25f1e654fdc24d56dc9b6cbb9c1db42e4f9d0425e7fe62",
  "face-paint":
    "sha256:54ce55c73dc974c24fa55cf1204577a6181c7e86d312a3a07f798bbbd99d4ee2",
} as const satisfies Record<StudioAnimeganStyleKind, string>);

const INPUT_PIXELS = STUDIO_ANIMEGAN_INPUT_SIZE * STUDIO_ANIMEGAN_INPUT_SIZE;

function createDescriptor(
  kind: StudioAnimeganStyleKind,
): StudioOnnxModelDescriptor {
  return Object.freeze({
    id: STUDIO_ANIMEGAN_MODEL_IDS[kind],
    version: STUDIO_ANIMEGAN_MODEL_VERSION,
    sha256: STUDIO_ANIMEGAN_MODEL_SHA256[kind],
    byteBudget: STUDIO_ANIMEGAN_MODEL_BYTE_LENGTHS[kind],
    inputs: Object.freeze([
      Object.freeze({
        name: STUDIO_ANIMEGAN_INPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([
          1, 3, STUDIO_ANIMEGAN_INPUT_SIZE, STUDIO_ANIMEGAN_INPUT_SIZE,
        ]),
      }),
    ]),
    outputs: Object.freeze([
      Object.freeze({
        name: STUDIO_ANIMEGAN_OUTPUT_NAME,
        elementType: "float32" as const,
        shape: Object.freeze([
          1, 3, STUDIO_ANIMEGAN_INPUT_SIZE, STUDIO_ANIMEGAN_INPUT_SIZE,
        ]),
      }),
    ]),
  });
}

export const STUDIO_ANIMEGAN_MODEL_DESCRIPTORS = Object.freeze({
  "paprika": createDescriptor("paprika"),
  "face-paint": createDescriptor("face-paint"),
} as const satisfies Record<StudioAnimeganStyleKind, StudioOnnxModelDescriptor>);

export function createStudioAnimeganModelRegistry(): StudioOnnxModelRegistry {
  return createStudioOnnxModelRegistry([
    STUDIO_ANIMEGAN_MODEL_DESCRIPTORS["paprika"],
    STUDIO_ANIMEGAN_MODEL_DESCRIPTORS["face-paint"],
  ]);
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

function isAbortFailure(cause: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  if (cause instanceof Error) {
    if (cause.name === "AbortError") return true;
    if (
      "code" in cause
      && (cause as { readonly code?: unknown }).code === "aborted"
    ) {
      return true;
    }
  }
  return false;
}

function compositeOverWhiteChannel(value: number, alpha: number): number {
  const a = alpha / 255;
  return value * a + 255 * (1 - a);
}

/**
 * Preprocess a 512×512 RGBA raster into the AnimeGANv2 tensor: composite
 * over white, reorder to CHW, map [0,255] to [-1,1] — exactly the
 * upstream `face2paint` normalization.
 */
export function preprocessStudioAnimeganInput(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  if (width !== STUDIO_ANIMEGAN_INPUT_SIZE || height !== STUDIO_ANIMEGAN_INPUT_SIZE) {
    throw new RangeError(
      `AnimeGANv2 입력은 ${STUDIO_ANIMEGAN_INPUT_SIZE}×${STUDIO_ANIMEGAN_INPUT_SIZE} 래스터만 허용합니다.`,
    );
  }
  if (rgba.length !== INPUT_PIXELS * 4) {
    throw new RangeError("AnimeGANv2 입력 RGBA 버퍼 길이가 이미지 크기와 일치하지 않습니다.");
  }
  const data = new Float32Array(3 * INPUT_PIXELS);
  for (let pixel = 0; pixel < INPUT_PIXELS; pixel += 1) {
    const offset = pixel * 4;
    const alpha = rgba[offset + 3]!;
    const r = compositeOverWhiteChannel(rgba[offset]!, alpha) / 255;
    const g = compositeOverWhiteChannel(rgba[offset + 1]!, alpha) / 255;
    const b = compositeOverWhiteChannel(rgba[offset + 2]!, alpha) / 255;
    data[pixel] = r * 2 - 1;
    data[INPUT_PIXELS + pixel] = g * 2 - 1;
    data[2 * INPUT_PIXELS + pixel] = b * 2 - 1;
  }
  return data;
}

function sampleBilinear(
  plane: Float32Array,
  channel: number,
  x: number,
  y: number,
): number {
  const size = STUDIO_ANIMEGAN_INPUT_SIZE;
  const clampedX = Math.min(Math.max(x, 0), size - 1);
  const clampedY = Math.min(Math.max(y, 0), size - 1);
  const x0 = Math.floor(clampedX);
  const y0 = Math.floor(clampedY);
  const x1 = Math.min(x0 + 1, size - 1);
  const y1 = Math.min(y0 + 1, size - 1);
  const fx = clampedX - x0;
  const fy = clampedY - y0;
  const base = channel * INPUT_PIXELS;
  const top = plane[base + y0 * size + x0]! * (1 - fx)
    + plane[base + y0 * size + x1]! * fx;
  const bottom = plane[base + y1 * size + x0]! * (1 - fx)
    + plane[base + y1 * size + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Render the 512×512 tanh output plane as an opaque RGBA raster at the
 * requested (native) size by bilinear resampling. Alpha is forced to
 * 255: style transfer repaints the whole frame, so source transparency
 * has no meaning in the result.
 */
export function renderStudioAnimeganRaster(input: {
  readonly animePlane: Float32Array;
  readonly width: number;
  readonly height: number;
}): Uint8ClampedArray<ArrayBuffer> {
  const { animePlane, width, height } = input;
  if (animePlane.length !== 3 * INPUT_PIXELS) {
    throw new RangeError("AnimeGANv2 출력 평면 길이가 모델 출력과 일치하지 않습니다.");
  }
  if (
    !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1
  ) {
    throw new RangeError("AnimeGANv2 출력 크기가 올바르지 않습니다.");
  }
  const out = new Uint8ClampedArray(width * height * 4);
  const size = STUDIO_ANIMEGAN_INPUT_SIZE;
  for (let y = 0; y < height; y += 1) {
    const modelY = (y + 0.5) * (size / height) - 0.5;
    for (let x = 0; x < width; x += 1) {
      const modelX = (x + 0.5) * (size / width) - 0.5;
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = sampleBilinear(animePlane, channel, modelX, modelY);
        const unit = Math.min(1, Math.max(0, (value + 1) / 2));
        out[offset + channel] = Math.round(unit * 255);
      }
      out[offset + 3] = 255;
    }
  }
  return out;
}

export interface StudioAnimeganConversion {
  /** CHW float plane, 3×512×512, tanh range [-1,1]. */
  readonly anime: Float32Array;
  readonly executionProvider: StudioOnnxExecutionProvider;
  readonly receipt: StudioOnnxSessionReceipt;
}

export interface StudioAnimeganConverter {
  convert(
    kind: StudioAnimeganStyleKind,
    image: Float32Array,
    options?: { readonly signal?: AbortSignal },
  ): Promise<StudioAnimeganConversion>;
  dispose(): Promise<void>;
}

export interface CreateStudioAnimeganConverterOptions {
  /** Injectable for tests. Defaults to the product provider factory below. */
  readonly createProvider?: (
    executionProvider: StudioOnnxExecutionProvider,
  ) => StudioOnnxInferenceProvider;
  /** Injectable for tests and for the asset module that owns the model URLs. */
  readonly loadModelBytes: (
    kind: StudioAnimeganStyleKind,
  ) => Promise<Uint8Array>;
  /** Execution routes in preference order. WebGPU first, WASM as fallback. */
  readonly executionProviders?: readonly StudioOnnxExecutionProvider[];
}

const DEFAULT_EXECUTION_PROVIDERS = Object.freeze([
  "webgpu",
  "wasm",
] as const satisfies readonly StudioOnnxExecutionProvider[]);

interface ProviderSlot {
  readonly provider: StudioOnnxInferenceProvider;
}

/**
 * Create a converter that owns one ONNX provider per execution route.
 * Mirrors the Tag2Pix colorizer contract: calls are serialized (the
 * provider epoch contract rejects stale results), model bytes are
 * cached per style kind, and a route that fails once is retired for
 * the lifetime of this converter so the next route is tried instead of
 * repeating a known-bad path.
 */
export function createStudioAnimeganConverter(
  options: CreateStudioAnimeganConverterOptions,
): StudioAnimeganConverter {
  const routes = options.executionProviders ?? DEFAULT_EXECUTION_PROVIDERS;
  const createProvider = options.createProvider ?? ((executionProvider) => (
    createStudioOnnxInferenceProvider({
      registry: createStudioAnimeganModelRegistry(),
      executionProvider,
    })
  ));
  const slots = new Map<StudioOnnxExecutionProvider, ProviderSlot>();
  const retiredRoutes = new Set<StudioOnnxExecutionProvider>();
  const modelBytesPromises = new Map<
    StudioAnimeganStyleKind,
    Promise<Uint8Array>
  >();
  let requestCounter = 0;
  let chain: Promise<void> = Promise.resolve();
  let disposed = false;

  const loadBytes = (
    kind: StudioAnimeganStyleKind,
  ): Promise<Uint8Array> => {
    let promise = modelBytesPromises.get(kind);
    if (!promise) {
      promise = options.loadModelBytes(kind).catch((cause: unknown) => {
        modelBytesPromises.delete(kind);
        throw cause;
      });
      modelBytesPromises.set(kind, promise);
    }
    return promise;
  };

  const runConvert = async (
    kind: StudioAnimeganStyleKind,
    image: Float32Array,
    signal?: AbortSignal,
  ): Promise<StudioAnimeganConversion> => {
    if (disposed) throw new Error("AnimeGANv2 변환기가 이미 해제되었습니다.");
    throwIfAborted(signal);
    if (image.length !== 3 * INPUT_PIXELS) {
      throw new RangeError("AnimeGANv2 입력 평면 길이가 모델 입력과 일치하지 않습니다.");
    }
    const bytes = await loadBytes(kind);
    throwIfAborted(signal);
    let lastFailure: unknown = null;
    for (const route of routes) {
      if (retiredRoutes.has(route)) continue;
      let slot = slots.get(route);
      if (!slot) {
        slot = { provider: createProvider(route) };
        slots.set(route, slot);
      }
      requestCounter += 1;
      const epoch = Object.freeze({
        request: requestCounter,
        stroke: 0,
        document: 0,
      });
      slot.provider.setEpoch(epoch);
      let result: StudioOnnxInferenceResult;
      try {
        result = await slot.provider.infer({
          modelId: STUDIO_ANIMEGAN_MODEL_IDS[kind],
          version: STUDIO_ANIMEGAN_MODEL_VERSION,
          source: Object.freeze({ kind: "bytes" as const, bytes }),
          epoch,
          inputs: Object.freeze([
            Object.freeze({
              name: STUDIO_ANIMEGAN_INPUT_NAME,
              elementType: "float32" as const,
              dims: Object.freeze([
                1, 3, STUDIO_ANIMEGAN_INPUT_SIZE, STUDIO_ANIMEGAN_INPUT_SIZE,
              ]),
              data: image,
            }),
          ]),
          signal,
        });
      } catch (cause) {
        if (isAbortFailure(cause, signal)) throw createAbortError();
        lastFailure = cause;
        retiredRoutes.add(route);
        slots.delete(route);
        await slot.provider.dispose().catch(() => undefined);
        continue;
      }
      throwIfAborted(signal);
      const output: StudioOnnxTensorValue | undefined =
        result.outputs[STUDIO_ANIMEGAN_OUTPUT_NAME];
      if (
        !output
        || output.elementType !== "float32"
        || !(output.data instanceof Float32Array)
        || output.data.length !== 3 * INPUT_PIXELS
      ) {
        throw new RangeError("AnimeGANv2 변환 출력이 없거나 형식이 다릅니다.");
      }
      return Object.freeze({
        anime: output.data,
        executionProvider: route,
        receipt: result.receipt,
      });
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error("기기 애니풍 변환 모델을 실행하지 못했습니다.");
  };

  return Object.freeze({
    convert(
      kind: StudioAnimeganStyleKind,
      image: Float32Array,
      convertOptions: { readonly signal?: AbortSignal } = {},
    ) {
      const run = chain.then(() => runConvert(kind, image, convertOptions.signal));
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    async dispose() {
      disposed = true;
      const live = [...slots.values()];
      slots.clear();
      await Promise.all(
        live.map((slot) => slot.provider.dispose().catch(() => undefined)),
      );
    },
  });
}
