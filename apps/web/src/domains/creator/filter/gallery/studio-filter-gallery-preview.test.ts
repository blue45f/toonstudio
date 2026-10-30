/**
 * 필터 갤러리 대화상자 안 미리보기의 계획·필드·실행 순서 시험.
 *
 * - 계획은 캔버스 이미지 노드와 같은 크기(반올림, 최소 1)와 같은 상한(16M 픽셀)을 쓰고, 갤러리 작업량 상한을 넘으면 스택이
 *   빠진다고 표시한다.
 * - 필드는 캔버스 미리보기 패치와 같다(빈 스택이면 갤러리 필드를 지운다).
 * - 실행 순서는 디바운스 뒤 한 번에 하나씩 돌고, 도는 동안 들어온 요청은 마지막 것만 남겨 이어 돌린다.
 * - 같은 경로(이미지 필터 상주 세션, direct 모드)의 결과가 엔진을 직접 돌린 결과와 바이트까지 같다.
 */
import { readFileSync } from "node:fs";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioImageFilterResidentWorkerSession } from "../../studio-image-filter-worker-client";

import { applyStudioFilterGalleryStack } from "./studio-filter-gallery-engine";
import {
  STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS,
  STUDIO_FILTER_GALLERY_PREVIEW_MAX_PIXELS,
  createStudioFilterGalleryPreviewScheduler,
  planStudioFilterGalleryPreview,
  studioFilterGalleryPreviewFields,
} from "./studio-filter-gallery-preview";
import { STUDIO_FILTER_GALLERY_WORK_BUDGET } from "./studio-filter-gallery-types";

import type { StudioFilterGalleryStack } from "./studio-filter-gallery-types";

const EMPTY: StudioFilterGalleryStack = { version: 1, seed: 1, entries: [] };
const INVERT: StudioFilterGalleryStack = { version: 1, seed: 7, entries: [{ id: "color.value-invert", params: {} }] };

describe("미리보기 계획", () => {
  it("크기를 모르거나 0 이하이면 계산하지 않는다", () => {
    expect(planStudioFilterGalleryPreview({}, INVERT)).toEqual({ kind: "unsized" });
    expect(planStudioFilterGalleryPreview({ width: Number.NaN, height: 10 }, INVERT)).toEqual({ kind: "unsized" });
    expect(planStudioFilterGalleryPreview({ width: 0, height: 10 }, INVERT)).toEqual({ kind: "unsized" });
    expect(planStudioFilterGalleryPreview({ width: 10, height: -1 }, INVERT)).toEqual({ kind: "unsized" });
  });

  it("캔버스 이미지 노드처럼 반올림하고 최소 1px 로 둔다", () => {
    expect(planStudioFilterGalleryPreview({ width: 100.4, height: 0.4 }, INVERT)).toEqual({
      kind: "ready", width: 100, height: 1, stackSkipped: false,
    });
  });

  it("캔버스가 필터를 끄는 크기(16M 픽셀 초과)는 계산하지 않는다", () => {
    expect(planStudioFilterGalleryPreview({ width: 4096, height: 4096 }, INVERT).kind).toBe("ready");
    expect(planStudioFilterGalleryPreview({ width: 4097, height: 4096 }, INVERT)).toEqual({ kind: "too-large", width: 4097, height: 4096 });
  });

  it("상한이 캔버스 이미지 노드의 인터랙티브 상한과 같다", () => {
    const source = readFileSync(new URL("../../StudioKonvaImageNode.tsx", import.meta.url), "utf8");
    const match = /const IMAGE_FILTER_INTERACTIVE_MAX_PIXELS = (\d+) \* (\d+) \* (\d+);/u.exec(source);
    expect(match).not.toBeNull();
    expect(Number(match![1]) * Number(match![2]) * Number(match![3])).toBe(STUDIO_FILTER_GALLERY_PREVIEW_MAX_PIXELS);
  });

  it("갤러리 작업량 상한을 넘으면 스택이 빠진다고 표시한다", () => {
    const heavy: StudioFilterGalleryStack = {
      version: 1,
      seed: 1,
      entries: Array.from({ length: 8 }, () => ({ id: "artistic.palette-knife", params: {} })),
    };
    const side = 3000;
    const plan = planStudioFilterGalleryPreview({ width: side, height: side }, heavy);
    expect(plan.kind).toBe("ready");
    expect(plan.kind === "ready" && plan.stackSkipped).toBe(true);
    // 같은 스택도 작은 이미지에서는 적용된다.
    const small = planStudioFilterGalleryPreview({ width: 64, height: 64 }, heavy);
    expect(small.kind === "ready" && small.stackSkipped).toBe(false);
    expect(STUDIO_FILTER_GALLERY_WORK_BUDGET).toBeGreaterThan(0);
  });
});

describe("미리보기 필드", () => {
  it("요소 필드 위에 초안 스택을 얹고, 빈 스택이면 갤러리 필드를 지운다", () => {
    const image = { brightness: 0.2, filterGallery: INVERT };
    expect(studioFilterGalleryPreviewFields(image, INVERT)).toEqual({ brightness: 0.2, filterGallery: INVERT });
    const cleared = studioFilterGalleryPreviewFields(image, EMPTY);
    expect(cleared.brightness).toBe(0.2);
    expect(cleared.filterGallery).toBeUndefined();
  });
});

describe("미리보기 실행 순서", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  it("디바운스 동안 들어온 요청은 마지막 것 하나만 돈다", async () => {
    const run = vi.fn(async (request: number) => request * 10);
    const results: number[] = [];
    const busy: boolean[] = [];
    const scheduler = createStudioFilterGalleryPreviewScheduler<number, number>({
      run,
      onResult: (result) => results.push(result),
      onError: () => undefined,
      onBusyChange: (value) => busy.push(value),
    });
    scheduler.request(1);
    scheduler.request(2);
    scheduler.request(3);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]![0]).toBe(3);
    expect(results).toEqual([30]);
    expect(busy).toEqual([true, false]);
    scheduler.dispose();
  });

  it("도는 동안 들어온 요청은 마지막 것만 남겨 끝나면 이어 돌리고, 중간 결과도 알린다", async () => {
    const gates = [deferred<number>(), deferred<number>()];
    let call = 0;
    const run = vi.fn((request: number) => {
      const gate = gates[call]!;
      call += 1;
      return gate.promise.then((value) => value + request);
    });
    const seen: Array<[number, boolean]> = [];
    const scheduler = createStudioFilterGalleryPreviewScheduler<number, number>({
      run,
      onResult: (result, _request, latest) => seen.push([result, latest]),
      onError: () => undefined,
    });
    scheduler.request(1);
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS);
    expect(run).toHaveBeenCalledTimes(1);
    // 첫 계산이 도는 동안 두 번 바뀐다 — 디바운스가 끝나도 겹쳐 돌지 않는다.
    scheduler.request(2);
    scheduler.request(3);
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS * 3);
    expect(run).toHaveBeenCalledTimes(1);
    gates[0]!.resolve(100);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(2);
    expect(run.mock.calls[1]![0]).toBe(3);
    gates[1]!.resolve(200);
    await vi.advanceTimersByTimeAsync(0);
    expect(seen).toEqual([[101, false], [203, true]]);
    scheduler.dispose();
  });

  it("실패는 알리고 취소는 조용히 넘기며, 정리하면 신호를 끊고 더 알리지 않는다", async () => {
    const errors: unknown[] = [];
    const signals: AbortSignal[] = [];
    let mode: "fail" | "abort" | "hang" = "fail";
    const hang = deferred<number>();
    const scheduler = createStudioFilterGalleryPreviewScheduler<number, number>({
      run: (_request, signal) => {
        signals.push(signal);
        if (mode === "fail") return Promise.reject(new Error("boom"));
        if (mode === "abort") return Promise.reject(Object.assign(new Error("stop"), { name: "AbortError" }));
        return hang.promise;
      },
      onResult: () => { throw new Error("정리 뒤 결과를 알렸다"); },
      onError: (error) => errors.push(error),
    });
    scheduler.request(1);
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS);
    expect(errors).toHaveLength(1);
    mode = "abort";
    scheduler.request(2);
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS);
    expect(errors).toHaveLength(1);
    mode = "hang";
    scheduler.request(3);
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS);
    scheduler.dispose();
    expect(signals.at(-1)!.aborted).toBe(true);
    hang.resolve(5);
    await vi.advanceTimersByTimeAsync(0);
    scheduler.request(4);
    await vi.advanceTimersByTimeAsync(STUDIO_FILTER_GALLERY_PREVIEW_DEBOUNCE_MS);
    expect(signals).toHaveLength(3);
  });
});

describe("미리보기 계산 경로", () => {
  it("이미지 필터 상주 세션(direct)의 결과가 엔진을 직접 돌린 결과와 같다", async () => {
    const width = 24;
    const height = 16;
    const pixels = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < width * height; index += 1) {
      pixels[index * 4] = (index * 37) % 256;
      pixels[index * 4 + 1] = (index * 11) % 256;
      pixels[index * 4 + 2] = (index * 5) % 256;
      pixels[index * 4 + 3] = index % 7 === 0 ? 0 : 255;
    }
    const stack: StudioFilterGalleryStack = {
      version: 1,
      seed: 99,
      entries: [{ id: "color.value-invert", params: {} }, { id: "noise.add-noise", params: {} }],
    };
    const expected = { data: new Uint8ClampedArray(pixels), width, height };
    expect(applyStudioFilterGalleryStack(expected, stack)).toBe("applied");

    const session = createStudioImageFilterResidentWorkerSession({ executionMode: "direct" });
    try {
      const result = await session.run(
        { imageData: { data: pixels, width, height }, el: studioFilterGalleryPreviewFields({}, stack) },
        { sourceRevision: 1 },
      );
      expect(Buffer.from(result.imageData.data)).toEqual(Buffer.from(expected.data));
    } finally {
      session.dispose();
    }
  });
});
