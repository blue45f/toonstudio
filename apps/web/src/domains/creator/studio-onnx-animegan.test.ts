import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import type {
  StudioOnnxInferenceProvider,
  StudioOnnxInferenceResult,
  StudioOnnxSessionReceipt,
} from "./studio-onnx-inference-provider";
import {
  findStudioOnnxModelDescriptor,
} from "./studio-onnx-model-registry";
import { sha256HexPortable } from "./studio-sha256";
import {
  STUDIO_ANIMEGAN_INPUT_SIZE,
  STUDIO_ANIMEGAN_MODEL_BYTE_LENGTHS,
  STUDIO_ANIMEGAN_MODEL_DESCRIPTORS,
  STUDIO_ANIMEGAN_MODEL_IDS,
  STUDIO_ANIMEGAN_MODEL_SHA256,
  STUDIO_ANIMEGAN_MODEL_VERSION,
  STUDIO_ANIMEGAN_OUTPUT_NAME,
  createStudioAnimeganConverter,
  createStudioAnimeganModelRegistry,
  preprocessStudioAnimeganInput,
  renderStudioAnimeganRaster,
  type StudioAnimeganStyleKind,
} from "./studio-onnx-animegan";

// 실모델 추론은 단위 테스트에서 제외한다 — 여기서 검증하는 것은 계약이다:
// 디스크립터·자산 다이제스트 고정, 전/후처리 순수 함수, 프로바이더 폴백.
// 실제 변환 동등성은 변환 시점에 PyTorch 참조 출력과 대조해 기록했다
// (assets/*.LICENSE.md와 impl-anime-style.md 참조).

const PIXELS = STUDIO_ANIMEGAN_INPUT_SIZE * STUDIO_ANIMEGAN_INPUT_SIZE;

const MODEL_PATHS: Record<StudioAnimeganStyleKind, string> = {
  "paprika": "apps/web/src/domains/creator/assets/animegan2-paprika.onnx",
  "face-paint":
    "apps/web/src/domains/creator/assets/animegan2-face-paint-512-v2.onnx",
};

const KINDS: readonly StudioAnimeganStyleKind[] = ["paprika", "face-paint"];

function fakeReceipt(
  kind: StudioAnimeganStyleKind,
  executionProvider: "webgpu" | "wasm",
): StudioOnnxSessionReceipt {
  return Object.freeze({
    providerId: "onnxruntime-web",
    runtimeVersion: "1.27.0",
    model: Object.freeze({
      id: STUDIO_ANIMEGAN_MODEL_IDS[kind],
      version: STUDIO_ANIMEGAN_MODEL_VERSION,
      sha256: STUDIO_ANIMEGAN_MODEL_SHA256[kind],
      byteLength: STUDIO_ANIMEGAN_MODEL_BYTE_LENGTHS[kind],
    }),
    selectedExecutionProvider: executionProvider,
    attemptedExecutionProviders: Object.freeze([executionProvider]) as
      readonly ["webgpu" | "wasm"],
    activeExecutionProvider: executionProvider,
    attemptCount: 1,
    failureIsolation: "fail-closed",
  });
}

function fakeProvider(
  kind: StudioAnimeganStyleKind,
  executionProvider: "webgpu" | "wasm",
  failure?: Error,
) {
  const provider = {
    setEpoch: vi.fn(),
    loadModel: vi.fn(),
    infer: vi.fn(async (request: {
      readonly epoch: StudioOnnxInferenceResult["epoch"];
    }): Promise<StudioOnnxInferenceResult> => {
      if (failure) throw failure;
      const anime = new Float32Array(3 * PIXELS).fill(0.5);
      return Object.freeze({
        epoch: request.epoch,
        receipt: fakeReceipt(kind, executionProvider),
        outputs: Object.freeze({
          [STUDIO_ANIMEGAN_OUTPUT_NAME]: Object.freeze({
            name: STUDIO_ANIMEGAN_OUTPUT_NAME,
            elementType: "float32" as const,
            dims: Object.freeze([1, 3, STUDIO_ANIMEGAN_INPUT_SIZE, STUDIO_ANIMEGAN_INPUT_SIZE]),
            data: anime,
          }),
        }),
      });
    }),
    disposeModel: vi.fn(async () => false),
    dispose: vi.fn(async () => undefined),
  };
  return provider as unknown as StudioOnnxInferenceProvider & typeof provider;
}

describe("STUDIO_ANIMEGAN_MODEL_DESCRIPTORS", () => {
  it.each(KINDS)(
    "registers the %s model cleanly and pins the bundled asset digest",
    (kind) => {
      const registry = createStudioAnimeganModelRegistry();
      const found = findStudioOnnxModelDescriptor(
        registry,
        STUDIO_ANIMEGAN_MODEL_IDS[kind],
        STUDIO_ANIMEGAN_MODEL_VERSION,
      );
      expect(found).toEqual(STUDIO_ANIMEGAN_MODEL_DESCRIPTORS[kind]);
      const bytes = readFileSync(MODEL_PATHS[kind]);
      expect(bytes.byteLength).toBe(STUDIO_ANIMEGAN_MODEL_BYTE_LENGTHS[kind]);
      expect(`sha256:${sha256HexPortable(new Uint8Array(bytes))}`).toBe(
        STUDIO_ANIMEGAN_MODEL_SHA256[kind],
      );
    },
  );

  it("uses fixed 512×512 float32 image/anime tensors for both styles", () => {
    for (const kind of KINDS) {
      const descriptor = STUDIO_ANIMEGAN_MODEL_DESCRIPTORS[kind];
      expect(descriptor.inputs).toHaveLength(1);
      expect(descriptor.inputs[0]?.name).toBe("image");
      expect(descriptor.inputs[0]?.shape).toEqual([1, 3, 512, 512]);
      expect(descriptor.outputs).toHaveLength(1);
      expect(descriptor.outputs[0]?.name).toBe("anime");
      expect(descriptor.outputs[0]?.shape).toEqual([1, 3, 512, 512]);
    }
  });
});

describe("preprocessStudioAnimeganInput", () => {
  it("maps white to +1 and black to -1 in CHW order", () => {
    const rgba = new Uint8ClampedArray(PIXELS * 4).fill(255);
    const tensor = preprocessStudioAnimeganInput(
      rgba,
      STUDIO_ANIMEGAN_INPUT_SIZE,
      STUDIO_ANIMEGAN_INPUT_SIZE,
    );
    expect(tensor.length).toBe(3 * PIXELS);
    expect(tensor[0]).toBeCloseTo(1);
    rgba.fill(0);
    for (let pixel = 0; pixel < PIXELS; pixel += 1) {
      rgba[pixel * 4 + 3] = 255;
    }
    const dark = preprocessStudioAnimeganInput(
      rgba,
      STUDIO_ANIMEGAN_INPUT_SIZE,
      STUDIO_ANIMEGAN_INPUT_SIZE,
    );
    expect(dark[0]).toBeCloseTo(-1);
  });

  it("composites transparent pixels over white before normalizing", () => {
    const rgba = new Uint8ClampedArray(PIXELS * 4); // all zero = transparent black
    const tensor = preprocessStudioAnimeganInput(
      rgba,
      STUDIO_ANIMEGAN_INPUT_SIZE,
      STUDIO_ANIMEGAN_INPUT_SIZE,
    );
    expect(tensor[0]).toBeCloseTo(1);
    expect(tensor[PIXELS]).toBeCloseTo(1);
    expect(tensor[2 * PIXELS]).toBeCloseTo(1);
  });

  it("rejects non-512 rasters and mismatched buffers", () => {
    expect(() => preprocessStudioAnimeganInput(new Uint8ClampedArray(4), 1, 1))
      .toThrow(RangeError);
    expect(() => preprocessStudioAnimeganInput(
      new Uint8ClampedArray(8),
      STUDIO_ANIMEGAN_INPUT_SIZE,
      STUDIO_ANIMEGAN_INPUT_SIZE,
    )).toThrow(RangeError);
  });
});

describe("renderStudioAnimeganRaster", () => {
  it("maps the tanh plane to 8-bit RGB with opaque alpha", () => {
    const plane = new Float32Array(3 * PIXELS).fill(0);
    plane[0] = -1; // pixel 0의 R
    plane[PIXELS] = 1; // pixel 0의 G (CHW 배치)
    const out = renderStudioAnimeganRaster({
      animePlane: plane,
      width: STUDIO_ANIMEGAN_INPUT_SIZE,
      height: STUDIO_ANIMEGAN_INPUT_SIZE,
    });
    expect(out.length).toBe(PIXELS * 4);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(255);
    expect(out[2]).toBe(128);
    expect(out[3]).toBe(255);
  });

  it("resamples to the requested native size", () => {
    const plane = new Float32Array(3 * PIXELS).fill(1);
    const out = renderStudioAnimeganRaster({
      animePlane: plane,
      width: 4,
      height: 2,
    });
    expect(out.length).toBe(4 * 2 * 4);
    expect(out[0]).toBe(255);
    expect(out[3]).toBe(255);
  });

  it("rejects wrongly sized planes", () => {
    expect(() => renderStudioAnimeganRaster({
      animePlane: new Float32Array(4),
      width: 1,
      height: 1,
    })).toThrow(RangeError);
  });
});

describe("createStudioAnimeganConverter", () => {
  const image = new Float32Array(3 * PIXELS);

  it("falls back to WASM when the WebGPU route fails", async () => {
    const webgpu = fakeProvider("paprika", "webgpu", new Error("webgpu unavailable"));
    const wasm = fakeProvider("paprika", "wasm");
    const loadModelBytes = vi.fn(async () => new Uint8Array([1, 2, 3]));
    const converter = createStudioAnimeganConverter({
      loadModelBytes,
      createProvider: (route) => (route === "webgpu" ? webgpu : wasm),
    });
    const result = await converter.convert("paprika", image);
    expect(result.executionProvider).toBe("wasm");
    expect(result.anime.length).toBe(3 * PIXELS);
    expect(webgpu.dispose).toHaveBeenCalled();
    expect(loadModelBytes).toHaveBeenCalledWith("paprika");
  });

  it("routes each style kind to its own registered model id", async () => {
    const wasm = fakeProvider("face-paint", "wasm");
    const converter = createStudioAnimeganConverter({
      loadModelBytes: async () => new Uint8Array([1]),
      createProvider: () => wasm,
    });
    await converter.convert("face-paint", image);
    const request = wasm.infer.mock.calls[0]?.[0] as unknown as {
      readonly modelId: string;
    };
    expect(request.modelId).toBe(STUDIO_ANIMEGAN_MODEL_IDS["face-paint"]);
  });

  it("rejects wrongly sized inputs before touching the provider", async () => {
    const wasm = fakeProvider("paprika", "wasm");
    const converter = createStudioAnimeganConverter({
      loadModelBytes: async () => new Uint8Array([1]),
      createProvider: () => wasm,
    });
    await expect(converter.convert("paprika", new Float32Array(4))).rejects
      .toThrow(RangeError);
    expect(wasm.infer).not.toHaveBeenCalled();
  });
});
