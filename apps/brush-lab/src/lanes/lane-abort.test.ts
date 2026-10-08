import { describe, expect, it } from "vitest";

import { fakeEnv } from "../bench/testing/synthetic-images";
import { InvalidStateError } from "../engine/core/errors";
import { fnv1a64 } from "../engine/core/hash";
import { ENTRY_POINTS, TABLE_OFFSETS } from "../engine/gpu/layout";
import { createMockAdapter, createMockGpuApi } from "../engine/gpu/testing/mock-gpu-device";
import { presetById } from "../engine/presets/catalog";
import { splitFrames } from "../engine/raster/reference-renderer";
import { lineStroke, zigzagStroke } from "../engine/testing/synthetic-strokes";
import { createMockWebgl2, createMockWebgl2Canvas } from "../engine/webgl2/testing/mock-webgl2";
import { wetTotals } from "../engine/wet/state";

import { createCanvas2dLane } from "./canvas2d-lane";
import { createCpuReferenceLane } from "./cpu-reference-lane";
import { createHybridLane } from "./hybrid-lane";
import { createPlatformBaselineLane, defaultCalibration } from "./platform-baseline-lane";
import { reservedDescriptor } from "./reserved-lane";
import { createWasmCpuLane } from "./wasm-cpu-lane";
import { createWebgl2InstancedLane } from "./webgl2-instanced-lane";
import { createWebgpuComputeLane } from "./webgpu-compute-lane";
import { createWebgpuInstancedLane } from "./webgpu-instanced-lane";

import type { Canvas2dContextLike } from "./canvas2d-lane";
import type { BrushEngineLane, LaneEnvironment } from "./lane";
import type { LabImage, RawSample } from "../engine/core/types";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * `abortStroke` 레인 계약. 기준은 픽셀 해시다:
 * [획1 endStroke → H1] → [획2 begin+addSamples → abortStroke → readback 해시 == H1] → [획3 완료 → 획2 없이 획3만 그린 결과와 같은 해시].
 * GPU 계열은 실제 픽셀을 Node에서 볼 수 없으므로(브라우저 미검증) 모의 장치로 "획 영역 비움·상태 리셋·불필요한 디스패치 없음"을 고정한다.
 */

const SIZE = 96;

function hashOf(image: LabImage): string {
  return fnv1a64(new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength));
}

const INIT = { width: SIZE, height: SIZE, dpr: 1, tileSize: 16, seed: 1 } as const;

/** 프레임 단위로 나눈 표본을 레인에 넣는다. `stopAfterFrames`를 주면 그 프레임까지만 넣고 멈춘다. 넣은 dab(또는 표본) 수를 돌려준다. */
function feed(lane: BrushEngineLane, samples: readonly RawSample[], stopAfterFrames?: number): number {
  let fed = 0;
  let frames = 0;
  for (const frame of splitFrames(samples)) {
    if (stopAfterFrames !== undefined && frames >= stopAfterFrames) break;
    fed += lane.addSamples(frame).dabCount;
    frames += 1;
  }
  return fed;
}

async function drawFull(lane: BrushEngineLane, program: BrushProgram, samples: readonly RawSample[], seed: number): Promise<void> {
  lane.beginStroke(program, seed);
  feed(lane, samples);
  await lane.endStroke();
}

const STROKE_1 = lineStroke(8, 20, SIZE - 8, 24, 0.7, { durationMs: 300 });
const STROKE_2 = lineStroke(10, 60, SIZE - 10, 40, 0.8, { durationMs: 300 });
const STROKE_3 = lineStroke(12, 80, SIZE - 12, 80, 0.6, { durationMs: 300 });

interface LaneCase {
  name: string;
  create: () => BrushEngineLane;
  env: () => LaneEnvironment;
  /** 이 레인이 픽셀 해시로 보존을 증명할 프리셋. */
  presetId: string;
}

// ---- 캔버스 픽셀을 실제로 계산하는 기능형 모의 2D 컨텍스트 -------------------------------------------------------------------------
// 호출 기록만 하는 모의(canvas2d-lane.test.ts)와 달리 stamp 위치·알파를 캔버스 버퍼에 누적하고 drawImage로 합성해
// "획 캔버스를 비웠는가"를 해시로 확인할 수 있다. 브라우저 픽셀과는 무관하다(브라우저 미검증).

interface FunctionalCanvas {
  width: number;
  height: number;
  alpha: Float32Array;
  getContext: (id: string) => Canvas2dContextLike;
}

function functionalCanvasEnv(): LaneEnvironment {
  const make = (width: number, height: number): FunctionalCanvas => {
    const alpha = new Float32Array(width * height);
    let tx = 0;
    let ty = 0;
    const ctx: Canvas2dContextLike = {
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      fillStyle: "",
      save: () => undefined,
      restore: () => undefined,
      setTransform: (_a, _b, _c, _d, e, f) => {
        tx = e;
        ty = f;
      },
      beginPath: () => undefined,
      arc: () => undefined,
      fill: () => {
        const x = Math.round(tx);
        const y = Math.round(ty);
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = y * width + x;
        const a = alpha[i] ?? 0;
        alpha[i] = ctx.globalCompositeOperation === "destination-out" ? a * (1 - ctx.globalAlpha) : a + ctx.globalAlpha * (1 - a);
      },
      createRadialGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
      clearRect: () => alpha.fill(0),
      drawImage: (image) => {
        const src = image as unknown as FunctionalCanvas;
        for (let i = 0; i < alpha.length; i += 1) {
          const s = (src.alpha[i] ?? 0) * ctx.globalAlpha;
          alpha[i] = (alpha[i] ?? 0) * (1 - s) + s;
        }
      },
      getImageData: (_x, _y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 0; i < w * h; i += 1) data[i * 4 + 3] = Math.round((alpha[i] ?? 0) * 255);
        return { width: w, height: h, data, colorSpace: "srgb" } as unknown as ImageData;
      },
    };
    return { width, height, alpha, getContext: () => ctx };
  };
  const env = fakeEnv();
  env.createCanvas = (w, h) => make(w, h) as unknown as HTMLCanvasElement;
  return env;
}

const CPU_LIKE_CASES: LaneCase[] = [
  { name: "cpu-reference", create: createCpuReferenceLane, env: fakeEnv, presetId: "ink-g-pen" },
  { name: "wasm-cpu", create: createWasmCpuLane, env: fakeEnv, presetId: "ink-g-pen" },
  { name: "platform-baseline", create: () => createPlatformBaselineLane(), env: fakeEnv, presetId: "ink-g-pen" },
  { name: "canvas2d(기능형 모의 2D 컨텍스트)", create: createCanvas2dLane, env: functionalCanvasEnv, presetId: "ink-g-pen" },
];

describe.each(CPU_LIKE_CASES)("abortStroke 픽셀 해시 보존: $name", ({ create, env, presetId }) => {
  const program = presetById(presetId);

  it("[획1 → H1] [획2 begin+addSamples → abort → readback == H1] [획3 == 획2 없이 획3만]", async () => {
    const lane = create();
    await lane.init(env(), INIT);
    await drawFull(lane, program, STROKE_1, 1);
    const h1 = hashOf(await lane.readback());
    const linear1 = await lane.readbackLinear();

    lane.beginStroke(program, 2);
    const fed = feed(lane, STROKE_2, 10);
    expect(fed).toBeGreaterThan(0);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(true);
    expect(receipt.discardedDabs).toBeGreaterThan(0);
    expect(hashOf(await lane.readback())).toBe(h1);
    expect(await lane.readbackLinear()).toEqual(linear1);

    await drawFull(lane, program, STROKE_3, 3);
    const h3 = hashOf(await lane.readback());

    const reference = create();
    await reference.init(env(), INIT);
    await drawFull(reference, program, STROKE_1, 1);
    await drawFull(reference, program, STROKE_3, 3);
    expect(h3).toBe(hashOf(await reference.readback()));
    // 획 2는 문서에 한 픽셀도 남기지 않았고, 통계도 완료된 획만 센다.
    expect(h3).not.toBe(h1);
    expect(lane.stats().strokes).toBe(2);
    lane.dispose();
    reference.dispose();
  }, 60_000);

  it("획 밖에서는 no-op이고 멱등이다(init 전·endStroke 뒤·abort 뒤)", async () => {
    const lane = create();
    const noop = { discardedDabs: 0, documentPreserved: true };
    expect(lane.abortStroke()).toEqual(noop);
    await lane.init(env(), INIT);
    expect(lane.abortStroke()).toEqual(noop);
    await drawFull(lane, program, STROKE_1, 1);
    const h1 = hashOf(await lane.readback());
    expect(lane.abortStroke()).toEqual(noop);
    lane.beginStroke(program, 2);
    feed(lane, STROKE_2, 10);
    expect(lane.abortStroke().documentPreserved).toBe(true);
    expect(lane.abortStroke()).toEqual(noop);
    expect(hashOf(await lane.readback())).toBe(h1);
    lane.dispose();
  });

  it("abort 뒤 레인은 idle이다: addSamples·endStroke는 InvalidStateError, beginStroke는 다시 받는다", async () => {
    const lane = create();
    await lane.init(env(), INIT);
    lane.beginStroke(program, 1);
    feed(lane, STROKE_1, 8);
    lane.abortStroke();
    expect(() => lane.addSamples(STROKE_1.slice(0, 3))).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    await drawFull(lane, program, STROKE_2, 2);
    expect(lane.stats().strokes).toBe(1);
    lane.dispose();
  }, 60_000);

  it("dispose된 레인의 abortStroke는 InvalidStateError다(조용히 성공하지 않는다)", async () => {
    const lane = create();
    await lane.init(env(), INIT);
    lane.dispose();
    expect(() => lane.abortStroke()).toThrow(InvalidStateError);
  });
});

describe("canvas2d: 획 캔버스 비우기", () => {
  it("abort가 획 캔버스(clearRect)를 비우므로 문서 캔버스는 drawImage 없이 그대로다", async () => {
    const calls: string[] = [];
    const base = functionalCanvasEnv();
    const env: LaneEnvironment = {
      ...base,
      createCanvas: (w, h) => {
        const canvas = base.createCanvas?.(w, h) as unknown as { getContext: (id: string) => Canvas2dContextLike };
        const ctx = canvas.getContext("2d");
        const wrapped: Canvas2dContextLike = Object.assign(Object.create(ctx) as Canvas2dContextLike, {
          clearRect: (x: number, y: number, cw: number, ch: number) => {
            calls.push("clearRect");
            ctx.clearRect(x, y, cw, ch);
          },
          drawImage: (image: CanvasImageSource, dx: number, dy: number) => {
            calls.push("drawImage");
            ctx.drawImage(image, dx, dy);
          },
        });
        return Object.assign(canvas, { getContext: () => wrapped }) as unknown as HTMLCanvasElement;
      },
    };
    const lane = createCanvas2dLane();
    await lane.init(env, INIT);
    lane.beginStroke(presetById("ink-g-pen"), 1);
    feed(lane, STROKE_1, 10);
    lane.abortStroke();
    expect(calls).toEqual(["clearRect"]);
    lane.dispose();
  });
});

describe("platform-baseline: endStroke가 실패해도 다음 beginStroke를 막지 않는다", () => {
  it("마감(서비스 모델링) 도중 던져도 획 상태를 초기화하고 문서는 그대로다", async () => {
    // 교정 객체의 pressureCurve 접근이 던지게 해 endStroke의 모델링 단계에서 실패를 만든다.
    const calibration = defaultCalibration();
    let broken = false;
    const flaky = new Proxy(calibration, {
      get(target, key, receiver) {
        if (broken && key === "pressureCurve") throw new Error("교정 읽기 실패");
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const lane = createPlatformBaselineLane({ calibration: flaky });
    await lane.init(fakeEnv(), INIT);
    await drawFull(lane, presetById("ink-g-pen"), STROKE_1, 1);
    const h1 = hashOf(await lane.readback());
    lane.beginStroke(presetById("ink-g-pen"), 2);
    feed(lane, STROKE_2);
    broken = true;
    await expect(lane.endStroke()).rejects.toThrow("교정 읽기 실패");
    broken = false;
    // 이전 구현은 여기서 '이전 획이 endStroke되지 않았다'로 영구히 막혔다.
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(hashOf(await lane.readback())).toBe(h1);
    await drawFull(lane, presetById("ink-g-pen"), STROKE_3, 3);
    expect(lane.stats().strokes).toBe(2);
    lane.dispose();
  });
});

describe("예약 레인", () => {
  it("abortStroke는 InvalidStateError가 아니라 no-op이다(beginStroke가 항상 거부돼 진행 중인 획이 있을 수 없다)", () => {
    const lane = reservedDescriptor("wasm-gpu-hybrid", "예약", "candidate", "테스트").create();
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(() => lane.beginStroke(presetById("pencil-hb"), 1)).toThrow(InvalidStateError);
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    lane.dispose();
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
  });
});

// ---- 습식·임파스토: CPU 참조·WASM은 타일 스냅샷으로 복원한다 -----------------------------------------------------------------------

type SurfaceLane = BrushEngineLane & { currentSurface(): { wet: Parameters<typeof wetTotals>[0] | null } | null };

describe.each([
  { name: "cpu-reference", create: (): SurfaceLane => createCpuReferenceLane() as SurfaceLane, presets: ["watercolor-wet", "sumi-ink-wet", "gouache", "oil-impasto"] },
  { name: "wasm-cpu", create: (): SurfaceLane => createWasmCpuLane() as SurfaceLane, presets: ["watercolor-wet", "oil-impasto"] },
])("abortStroke 습식·임파스토 복원: $name", ({ create, presets }) => {
  const first = zigzagStroke(SIZE, { durationMs: 240 });
  const second = lineStroke(10, 30, SIZE - 10, 66, 0.8, { durationMs: 300 });
  const third = lineStroke(14, 70, SIZE - 14, 20, 0.7, { durationMs: 300 });

  it.each(presets)("%s: abort 뒤 해시·습식 층 질량이 beginStroke 직전과 같고 다음 획이 기준과 같다", async (id) => {
    const program = presetById(id);
    const lane = create();
    await lane.init(fakeEnv(), INIT);
    await drawFull(lane, program, first, 1);
    const wet = lane.currentSurface()?.wet;
    expect(wet).toBeTruthy();
    const beforeHash = hashOf(await lane.readback());
    const beforeLinear = await lane.readbackLinear();
    const beforeTotals = wetTotals(wet!);

    lane.beginStroke(program, 2);
    feed(lane, second, 7);
    expect(wetTotals(lane.currentSurface()!.wet!)).not.toEqual(beforeTotals);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(true);
    expect(receipt.discardedDabs).toBeGreaterThan(0);
    expect(hashOf(await lane.readback())).toBe(beforeHash);
    expect(await lane.readbackLinear()).toEqual(beforeLinear);
    expect(wetTotals(lane.currentSurface()!.wet!)).toEqual(beforeTotals);

    await drawFull(lane, program, third, 3);
    const reference = create();
    await reference.init(fakeEnv(), INIT);
    await drawFull(reference, program, first, 1);
    await drawFull(reference, program, third, 3);
    expect(hashOf(await lane.readback())).toBe(hashOf(await reference.readback()));
    expect(wetTotals(lane.currentSurface()!.wet!)).toEqual(wetTotals(reference.currentSurface()!.wet!));
    lane.dispose();
    reference.dispose();
  }, 60_000);
});

// ---- GPU 계열(모의 장치) --------------------------------------------------------------------------------------------------------

function gpuEnv(api: GPU): LaneEnvironment {
  let t = 0;
  return { gpu: api, clock: { now: () => (t += 1) } };
}

const GPU_INIT = { width: 96, height: 64, dpr: 1, tileSize: 16, seed: 3 } as const;
const GPU_STROKE = zigzagStroke(64, { durationMs: 120 });

describe.each([
  { name: "webgpu-compute", create: createWebgpuComputeLane, binning: true },
  { name: "wasm-gpu-hybrid", create: createHybridLane, binning: false },
])("abortStroke GPU 계약: $name", ({ create, binning }) => {
  async function setup(program = "ink-g-pen") {
    const { adapter, gpu } = createMockAdapter({ info: { vendor: "mock", description: "SwiftShader" }, features: ["timestamp-query"] });
    const lane = create();
    const env = gpuEnv(createMockGpuApi(adapter));
    await lane.init(env, GPU_INIT);
    return { lane, gpu, program: presetById(program) };
  }

  const count = (gpu: { dispatches: { entryPoint: string }[] }, entry: string): number => gpu.dispatches.filter((d) => d.entryPoint === entry).length;

  it("프레임을 내기 전에 abort하면 GPU 제출·디스패치가 0이고 플래그만 되돌린다", async () => {
    const { lane, gpu, program } = await setup();
    const submits = gpu.submits;
    const dispatches = gpu.dispatches.length;
    lane.beginStroke(program, 1);
    const receipt = lane.abortStroke();
    expect(receipt).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(gpu.submits).toBe(submits);
    expect(gpu.dispatches.length).toBe(dispatches);
    // 같은 레인이 곧바로 다음 획을 받는다.
    lane.beginStroke(program, 2);
    feed(lane, GPU_STROKE);
    await lane.endStroke();
    expect(count(gpu, ENTRY_POINTS.bakeStroke)).toBe(1);
    lane.dispose();
  });

  it("프레임을 낸 뒤 abort하면 획 풀을 비우고 표를 리셋하고 composite_all 1회(제출 1회)만 낸다 — bake_stroke는 없다", async () => {
    const { lane, gpu, program } = await setup();
    lane.beginStroke(program, 1);
    const fed = feed(lane, GPU_STROKE, 5);
    expect(fed).toBeGreaterThan(0);
    const submits = gpu.submits;
    const dispatches = gpu.dispatches.length;
    const clears = gpu.clears.length;
    const tableWrites = gpu.writes.filter((w) => w.target === "sumi-table").length;

    const receipt = lane.abortStroke();
    expect(receipt).toEqual({ discardedDabs: fed, documentPreserved: true });
    expect(gpu.submits).toBe(submits + 1);
    expect(gpu.dispatches.slice(dispatches).map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.compositeAll]);
    // 획 풀 clear + 표의 획 영역 리셋(주소 0부터 strokeResetBytes) + 슬롯 표 리셋.
    expect(gpu.clears.slice(clears).map((c) => c.target)).toEqual(["sumi-stroke-pool"]);
    const newTableWrites = gpu.writes.filter((w) => w.target === "sumi-table").slice(tableWrites);
    expect(newTableWrites.some((w) => w.offset === 0 && w.size === TABLE_OFFSETS.strokeResetBytes)).toBe(true);
    expect(newTableWrites.some((w) => w.offset === TABLE_OFFSETS.slots)).toBe(true);
    // 문서에 합성하지 않았다.
    expect(count(gpu, ENTRY_POINTS.bakeStroke)).toBe(0);
    if (!binning) expect(gpu.dispatches.some((d) => d.entryPoint === ENTRY_POINTS.binCount || d.entryPoint === ENTRY_POINTS.scatter)).toBe(false);

    // 멱등: 두 번째 abort는 GPU 작업이 없다.
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(gpu.submits).toBe(submits + 1);
    expect(gpu.dispatches.length).toBe(dispatches + 1);

    // 다음 획이 정상 완료되고 bake_stroke는 그 획의 1회뿐이다.
    lane.beginStroke(program, 2);
    feed(lane, GPU_STROKE);
    await lane.endStroke();
    expect(count(gpu, ENTRY_POINTS.bakeStroke)).toBe(1);
    expect(lane.stats().strokes).toBe(1);
    lane.dispose();
  });

  it("abort 뒤 endStroke·addSamples는 InvalidStateError다", async () => {
    const { lane, program } = await setup();
    lane.beginStroke(program, 1);
    feed(lane, GPU_STROKE, 3);
    lane.abortStroke();
    expect(() => lane.addSamples(GPU_STROKE.slice(0, 2))).toThrow(InvalidStateError);
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    lane.dispose();
  });

  it("획 밖(init 전·endStroke 뒤)은 no-op, dispose 뒤는 InvalidStateError", async () => {
    const lane = create();
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    const { lane: ready, gpu, program } = await setup();
    ready.beginStroke(program, 1);
    feed(ready, GPU_STROKE);
    await ready.endStroke();
    const submits = gpu.submits;
    expect(ready.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(gpu.submits).toBe(submits);
    ready.dispose();
    expect(() => ready.abortStroke()).toThrow(InvalidStateError);
  });

  it("습식 획이 프레임을 냈다면 정직하게 documentPreserved:false와 한글 사유를 돌려주고, 획 영역은 정리해 레인이 다음 획을 받는다", async () => {
    const { lane, gpu, program } = await setup("watercolor-wet");
    lane.beginStroke(program, 1);
    const fed = feed(lane, GPU_STROKE, 5);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(false);
    expect(receipt.discardedDabs).toBe(fed);
    expect(receipt.reasonKo).toContain("습식");
    expect(receipt.reasonKo).toContain("되돌릴 수 없다");
    expect(count(gpu, ENTRY_POINTS.bakeStroke)).toBe(0);
    // 상태는 idle: 세션이 교체하기 전에도 레인이 InvalidStateError로 영구히 막히지 않는다.
    lane.beginStroke(presetById("ink-g-pen"), 2);
    lane.dispose();
  });

  it("습식 획이라도 프레임을 내기 전에 abort하면 문서가 그대로여서 보존이고, 이전 습식 획의 상수를 다시 올린다", async () => {
    const { lane, gpu } = await setup();
    const water = presetById("watercolor-wet");
    lane.beginStroke(water, 1);
    feed(lane, GPU_STROKE);
    await lane.endStroke();
    const kernelWrites = (): number => gpu.writes.filter((w) => w.target === "sumi-wet-kernel").length;
    const before = kernelWrites();
    const submits = gpu.submits;
    lane.beginStroke(presetById("sumi-ink-wet"), 2); // 같은 수채 층 → 플래튼 없음, 새 습식 상수 업로드
    expect(kernelWrites()).toBe(before + 1);
    const receipt = lane.abortStroke();
    expect(receipt).toEqual({ discardedDabs: 0, documentPreserved: true });
    // 이전 습식 획(수채)의 상수로 되돌려 올린다(flattenWet이 마지막 습식 획의 상수를 전제하기 때문).
    expect(kernelWrites()).toBe(before + 2);
    expect(gpu.submits).toBe(submits);
    lane.dispose();
  });

  it("다른 매체 습식 층을 먼저 굽는 획(수채 → 건식)을 즉시 abort하면 굽기는 되돌릴 수 없지만 내용은 보존이라는 단서를 단다", async () => {
    const { lane, gpu } = await setup();
    lane.beginStroke(presetById("watercolor-wet"), 1);
    feed(lane, GPU_STROKE);
    await lane.endStroke();
    lane.beginStroke(presetById("ink-g-pen"), 2);
    expect(count(gpu, ENTRY_POINTS.bakeWet)).toBe(1);
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(true);
    expect(receipt.reasonKo).toContain("구워졌다");
    expect(count(gpu, ENTRY_POINTS.bakeWet)).toBe(1);
    lane.dispose();
  });

  it("장치가 손실되면 문서(GPU 메모리)도 잃었으므로 documentPreserved:false이고 GPU 호출을 하지 않는다", async () => {
    const { lane, gpu, program } = await setup();
    lane.beginStroke(program, 1);
    const fed = feed(lane, GPU_STROKE, 4);
    gpu.loseDevice("unknown", "lost");
    await Promise.resolve();
    await Promise.resolve();
    const submits = gpu.submits;
    const receipt = lane.abortStroke();
    expect(receipt).toMatchObject({ discardedDabs: fed, documentPreserved: false });
    expect(receipt.reasonKo).toContain("장치");
    expect(gpu.submits).toBe(submits);
    lane.dispose();
  });
});

describe("abortStroke GPU 계약: webgpu-instanced", () => {
  async function setup() {
    const { adapter, gpu } = createMockAdapter({ info: { vendor: "mock", description: "SwiftShader" }, features: ["timestamp-query"] });
    const lane = createWebgpuInstancedLane();
    await lane.init(gpuEnv(createMockGpuApi(adapter)), GPU_INIT);
    return { lane, gpu, program: presetById("ink-g-pen") };
  }

  it("프레임을 내기 전에 abort하면 제출·렌더 패스가 0이다", async () => {
    const { lane, gpu, program } = await setup();
    const submits = gpu.submits;
    const passes = gpu.renderPasses;
    lane.beginStroke(program, 1);
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(gpu.submits).toBe(submits);
    expect(gpu.renderPasses).toBe(passes);
    lane.dispose();
  });

  it("프레임을 낸 뒤 abort하면 획 타깃 clear + encode(draw 1회) 제출 1회만 내고 bake는 없다", async () => {
    const { lane, gpu, program } = await setup();
    lane.beginStroke(program, 1);
    const fed = feed(lane, GPU_STROKE, 5);
    expect(fed).toBeGreaterThan(0);
    const submits = gpu.submits;
    const passes = gpu.renderPasses;
    const draws = gpu.draws.length;
    const receipt = lane.abortStroke();
    expect(receipt).toEqual({ discardedDabs: fed, documentPreserved: true });
    expect(gpu.submits).toBe(submits + 1);
    expect(gpu.renderPasses).toBe(passes + 2);
    const newDraws = gpu.draws.slice(draws);
    expect(newDraws.map((d) => d.entryPoint)).toEqual([ENTRY_POINTS.instancedEncodeFs]);
    expect(newDraws.some((d) => d.entryPoint === ENTRY_POINTS.instancedBakeFs)).toBe(false);
    // 멱등.
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(gpu.submits).toBe(submits + 1);
    // 다음 획은 정상이고 bake는 그 획의 1회뿐이다.
    lane.beginStroke(program, 2);
    feed(lane, GPU_STROKE);
    await lane.endStroke();
    await expect(lane.endStroke()).rejects.toBeInstanceOf(InvalidStateError);
    lane.dispose();
  });

  it("미지원 프로그램(not-implemented)이 beginStroke에서 거부된 뒤의 abort는 no-op이고 레인은 계속 쓸 수 있다", async () => {
    const { lane, gpu } = await setup();
    expect(() => lane.beginStroke(presetById("watercolor-wet"), 1)).toThrow();
    const submits = gpu.submits;
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(gpu.submits).toBe(submits);
    lane.beginStroke(presetById("pencil-hb"), 1);
    lane.dispose();
  });

  it("장치 손실이면 documentPreserved:false", async () => {
    const { lane, gpu, program } = await setup();
    lane.beginStroke(program, 1);
    feed(lane, GPU_STROKE, 3);
    gpu.loseDevice("unknown", "lost");
    await Promise.resolve();
    await Promise.resolve();
    const receipt = lane.abortStroke();
    expect(receipt.documentPreserved).toBe(false);
    expect(receipt.reasonKo).toContain("장치");
    lane.dispose();
  });

  it("획 밖·init 전은 no-op, dispose 뒤는 InvalidStateError", async () => {
    expect(createWebgpuInstancedLane().abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    const { lane } = await setup();
    lane.dispose();
    expect(() => lane.abortStroke()).toThrow(InvalidStateError);
  });
});

describe("abortStroke GPU 계약: webgl2-instanced", () => {
  function envWith(mock: ReturnType<typeof createMockWebgl2>): LaneEnvironment {
    let t = 0;
    return { clock: { now: () => (t += 1) }, createCanvas: (w, h) => createMockWebgl2Canvas(mock, w, h) };
  }

  it("프레임을 내기 전에는 draw가 0이고, 낸 뒤에는 encode draw 1회로 표시를 되돌린다 — bake는 없다", async () => {
    const mock = createMockWebgl2();
    const lane = createWebgl2InstancedLane();
    await lane.init(envWith(mock), { ...INIT, width: 64, height: 64 });
    const program = presetById("ink-g-pen");

    const drawsStart = mock.drawArrays.length;
    lane.beginStroke(program, 1);
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(mock.drawArrays.length).toBe(drawsStart);
    expect(mock.drawArraysInstanced.length).toBe(0);

    lane.beginStroke(program, 2);
    const frames = splitFrames(lineStroke(4, 4, 60, 60, 0.6, { durationMs: 100 }));
    let fed = 0;
    for (const frame of frames.slice(0, 5)) fed += lane.addSamples(frame).dabCount;
    expect(fed).toBeGreaterThan(0);
    const instanced = mock.drawArraysInstanced.length;
    const blits = mock.drawArrays.length;
    const receipt = lane.abortStroke();
    expect(receipt).toEqual({ discardedDabs: fed, documentPreserved: true });
    // 획 draw는 더 없고 encode blit 1회만(present 캔버스 없음).
    expect(mock.drawArraysInstanced.length).toBe(instanced);
    expect(mock.drawArrays.length).toBe(blits + 1);
    // 멱등.
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    expect(mock.drawArrays.length).toBe(blits + 1);
    // 다음 획 정상: endStroke의 꼬리 프레임 encode 1회 + bake 1회 + 최종 encode 1회.
    lane.beginStroke(program, 3);
    for (const frame of frames) lane.addSamples(frame);
    const before = mock.drawArrays.length;
    await lane.endStroke();
    expect(mock.drawArrays.length - before).toBe(3);
    expect(lane.stats().strokes).toBe(1);
    lane.dispose();
  });

  it("미지원 프로그램 거부 뒤·획 밖·init 전은 no-op, dispose 뒤는 InvalidStateError", async () => {
    expect(createWebgl2InstancedLane().abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    const mock = createMockWebgl2();
    const lane = createWebgl2InstancedLane();
    await lane.init(envWith(mock), { ...INIT, width: 32, height: 32 });
    expect(() => lane.beginStroke(presetById("smudge-blend"), 1)).toThrow();
    expect(lane.abortStroke()).toEqual({ discardedDabs: 0, documentPreserved: true });
    lane.dispose();
    expect(() => lane.abortStroke()).toThrow(InvalidStateError);
  });
});
