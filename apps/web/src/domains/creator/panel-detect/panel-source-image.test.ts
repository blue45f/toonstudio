import { afterEach, describe, expect, it, vi } from "vitest";

import { FixtureImage, WHITE } from "./panel-detect-fixtures";
import { fakeCanvasWorld, fakePngFile, fixtureDrawable, noYield } from "./panel-detect-test-doubles";
import {
  PANEL_IMPORT_LIMITS,
  PanelSourceError,
  inspectPanelSourceHeader,
  loadPanelSourceImage,
  panelImportPixelLimit,
  readPanelSourceEnvironment,
} from "./panel-source-image";

const DESKTOP = { coarsePointer: false, deviceMemoryGb: undefined } as const;

function sampleImage(width: number, height: number): FixtureImage {
  const image = new FixtureImage(width, height, WHITE);
  image.art(2, 2, width - 4, height - 4, { border: 1, balloon: false });
  return image;
}

async function sourceFor(width: number, height: number, overrides: { decodeWidth?: number; decodeHeight?: number } = {}) {
  const image = sampleImage(overrides.decodeWidth ?? width, overrides.decodeHeight ?? height);
  const drawable = fixtureDrawable(image);
  const world = fakeCanvasWorld({ decode: () => Promise.resolve(drawable) });
  const file = fakePngFile("scan-01.png", width, height, 40);
  return { drawable, world, file, image };
}

describe("원고 이미지 로더 — 헤더 검사", () => {
  it("PNG 헤더에서 가로세로와 형식을 읽고, 선언한 형식과 다르면 거절한다", async () => {
    const file = fakePngFile("a.png", 640, 960, 10);
    const header = inspectPanelSourceHeader(await file.arrayBuffer(), "image/png");
    expect(header).toEqual({ width: 640, height: 960, mimeType: "image/png" });
    expect(() => inspectPanelSourceHeader(new ArrayBuffer(64), "image/png")).toThrow(PanelSourceError);
    expect(() => inspectPanelSourceHeader(new ArrayBuffer(64), "")).toThrowError(expect.objectContaining({ code: "unsupported-format" }));
    expect(() => inspectPanelSourceHeader(new ArrayBuffer(33), "image/jpeg")).toThrow(PanelSourceError);
    const png = await fakePngFile("a.png", 10, 10).arrayBuffer();
    expect(() => inspectPanelSourceHeader(png, "image/jpeg")).toThrowError(expect.objectContaining({ code: "unsupported-format" }));
  });

  it("기기에 따라 디코딩 픽셀 한도를 달리 잡는다", () => {
    expect(panelImportPixelLimit(DESKTOP)).toBe(PANEL_IMPORT_LIMITS.desktopPixels);
    expect(panelImportPixelLimit({ coarsePointer: false, deviceMemoryGb: 8 })).toBe(PANEL_IMPORT_LIMITS.desktopPixels);
    expect(panelImportPixelLimit({ coarsePointer: false, deviceMemoryGb: 6 })).toBe(PANEL_IMPORT_LIMITS.midPixels);
    expect(panelImportPixelLimit({ coarsePointer: false, deviceMemoryGb: 4 })).toBe(PANEL_IMPORT_LIMITS.mobilePixels);
    expect(panelImportPixelLimit({ coarsePointer: true, deviceMemoryGb: 16 })).toBe(PANEL_IMPORT_LIMITS.mobilePixels);
  });
});

describe("원고 이미지 로더 — 기기 환경 읽기", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("터치 기기 여부와 메모리(GB)를 읽는다", () => {
    vi.stubGlobal("navigator", { deviceMemory: 4 });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(readPanelSourceEnvironment()).toEqual({ coarsePointer: true, deviceMemoryGb: 4 });
  });

  it("메모리를 알려 주지 않거나 숫자가 아니면 모르는 값으로 둔다", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal("navigator", {});
    expect(readPanelSourceEnvironment()).toEqual({ coarsePointer: false, deviceMemoryGb: undefined });
    vi.stubGlobal("navigator", { deviceMemory: "8" });
    expect(readPanelSourceEnvironment().deviceMemoryGb).toBeUndefined();
  });

  it("matchMedia 가 없는 환경에서도 데스크톱으로 읽는다", () => {
    vi.stubGlobal("navigator", { deviceMemory: 16 });
    vi.stubGlobal("matchMedia", undefined);
    expect(readPanelSourceEnvironment()).toEqual({ coarsePointer: false, deviceMemoryGb: 16 });
    expect(panelImportPixelLimit(readPanelSourceEnvironment())).toBe(PANEL_IMPORT_LIMITS.desktopPixels);
  });
});

describe("원고 이미지 로더 — 읽기", () => {
  it("디코딩해 원본 영수증(이름·크기·가로세로·SHA-256)을 돌려주고 파일 바이트는 밖으로 보내지 않는다", async () => {
    const { world, file } = await sourceFor(40, 60);
    const source = await loadPanelSourceImage(file, { deps: world.deps, environment: DESKTOP, yieldNow: noYield });
    expect(source.width).toBe(40);
    expect(source.height).toBe(60);
    expect(source.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(source.receipt()).toEqual({
      fileName: "scan-01.png",
      mimeType: "image/png",
      sizeBytes: file.size,
      width: 40,
      height: 60,
      sha256: source.sha256,
    });
    const again = await loadPanelSourceImage(fakePngFile("scan-01.png", 40, 60, 40), { deps: world.deps, environment: DESKTOP, yieldNow: noYield });
    expect(again.sha256).toBe(source.sha256);
    const other = await loadPanelSourceImage(fakePngFile("scan-01.png", 40, 60, 41), { deps: world.deps, environment: DESKTOP, yieldNow: noYield });
    expect(other.sha256).not.toBe(source.sha256);
  });

  it("RGBA 는 띠 단위로 읽고 이미지 전체를 빠짐없이 이어 붙인다", async () => {
    const { drawable, world, file, image } = await sourceFor(100, 130);
    const source = await loadPanelSourceImage(file, { deps: world.deps, environment: DESKTOP, yieldNow: noYield });
    const raster = await source.readRaster();
    expect(raster.width).toBe(100);
    expect(raster.height).toBe(130);
    expect(Array.from(raster.data)).toEqual(Array.from(image.data));
    // 한 번에 읽는 행 수는 bandPixels/폭 이하이고, 모든 행이 한 번씩만 읽힌다.
    const covered = drawable.reads.reduce((sum, [, rows]) => sum + rows, 0);
    expect(covered).toBe(130);
  });

  it("큰 이미지는 여러 띠로 나눠 읽고 띠 사이마다 양보한다", async () => {
    const tall = new FixtureImage(1000, 12_000, WHITE);
    const drawable = fixtureDrawable(tall);
    const world = fakeCanvasWorld({ decode: () => Promise.resolve(drawable) });
    let yields = 0;
    const source = await loadPanelSourceImage(fakePngFile("tall.png", 1000, 12_000, 8), {
      deps: world.deps,
      environment: DESKTOP,
      yieldNow: () => { yields += 1; return Promise.resolve(); },
    });
    const raster = await source.readRaster();
    expect(raster.data.length).toBe(1000 * 12_000 * 4);
    expect(drawable.reads.length).toBeGreaterThan(1);
    expect(yields).toBe(drawable.reads.length);
    for (const [, rows] of drawable.reads) expect(rows * 1000).toBeLessThanOrEqual(PANEL_IMPORT_LIMITS.bandPixels);
  });

  it("읽는 중 취소하면 cancelled 로 끝나고 더 읽지 않는다", async () => {
    const tall = new FixtureImage(1000, 12_000, WHITE);
    const drawable = fixtureDrawable(tall);
    const world = fakeCanvasWorld({ decode: () => Promise.resolve(drawable) });
    const controller = new AbortController();
    const source = await loadPanelSourceImage(fakePngFile("tall.png", 1000, 12_000, 8), {
      deps: world.deps,
      environment: DESKTOP,
      yieldNow: () => { controller.abort(); return Promise.resolve(); },
    });
    await expect(source.readRaster(controller.signal)).rejects.toMatchObject({ code: "cancelled" });
    expect(drawable.reads).toHaveLength(1);
  });

  it("dispose 하면 디코딩된 이미지를 닫고 이후 읽기를 거절한다", async () => {
    const { drawable, world, file } = await sourceFor(20, 20);
    const source = await loadPanelSourceImage(file, { deps: world.deps, environment: DESKTOP, yieldNow: noYield });
    source.dispose();
    source.dispose();
    expect(drawable.closed).toBe(true);
    await expect(source.readRaster()).rejects.toBeInstanceOf(PanelSourceError);
  });
});

describe("원고 이미지 로더 — 거절", () => {
  it("빈 파일·너무 큰 파일·지원하지 않는 형식은 디코딩하기 전에 거절한다", async () => {
    const world = fakeCanvasWorld();
    const run = (file: File) => loadPanelSourceImage(file, { deps: world.deps, environment: DESKTOP, yieldNow: noYield });
    await expect(run(new File([], "empty.png", { type: "image/png" }))).rejects.toMatchObject({ code: "empty" });
    await expect(run(new File([new Uint8Array(64)], "x.png", { type: "image/png" }))).rejects.toMatchObject({ code: "unsupported-format" });
    const big = fakePngFile("big.png", 100, 100, 0);
    Object.defineProperty(big, "size", { value: PANEL_IMPORT_LIMITS.maxFileBytes + 1 });
    await expect(run(big)).rejects.toMatchObject({ code: "file-too-large" });
  });

  it("헤더가 알리는 픽셀 수가 기기 한도를 넘으면 디코딩하지 않고 한도와 함께 거절한다", async () => {
    let decoded = 0;
    const world = fakeCanvasWorld({ decode: () => { decoded += 1; return Promise.reject(new Error("호출되면 안 돼요")); } });
    const file = fakePngFile("huge.png", 10_000, 6_000, 4);
    await expect(loadPanelSourceImage(file, {
      deps: world.deps,
      environment: { coarsePointer: true, deviceMemoryGb: 2 },
      yieldNow: noYield,
    })).rejects.toMatchObject({ code: "too-many-pixels", detail: { megapixels: 16, pixels: 60_000_000 } });
    expect(decoded).toBe(0);
  });

  it("디코딩 실패와 헤더·실제 크기 불일치는 decode-failed 로 끝나고 열린 이미지를 닫는다", async () => {
    const failing = fakeCanvasWorld({ decode: () => Promise.reject(new Error("깨진 파일")) });
    await expect(loadPanelSourceImage(fakePngFile("a.png", 30, 30, 4), { deps: failing.deps, environment: DESKTOP, yieldNow: noYield }))
      .rejects.toMatchObject({ code: "decode-failed" });
    const mismatch = await sourceFor(30, 30, { decodeWidth: 31, decodeHeight: 30 });
    await expect(loadPanelSourceImage(mismatch.file, { deps: mismatch.world.deps, environment: DESKTOP, yieldNow: noYield }))
      .rejects.toMatchObject({ code: "decode-failed" });
    expect(mismatch.drawable.closed).toBe(true);
  });

  it("EXIF 방향 때문에 가로세로가 맞바뀌어 풀리는 사진은 같은 이미지로 받고 회전한 크기를 쓴다", async () => {
    const rotated = await sourceFor(30, 20, { decodeWidth: 20, decodeHeight: 30 });
    const source = await loadPanelSourceImage(rotated.file, { deps: rotated.world.deps, environment: DESKTOP, yieldNow: noYield });
    expect({ width: source.width, height: source.height }).toEqual({ width: 20, height: 30 });
    expect(source.receipt()).toMatchObject({ width: 20, height: 30, fileName: "scan-01.png" });
    const raster = await source.readRaster();
    expect({ width: raster.width, height: raster.height }).toEqual({ width: 20, height: 30 });
    expect(rotated.drawable.closed).toBe(false);
    source.dispose();
    // 픽셀 수가 달라지는 불일치는 여전히 거절한다.
    const forged = await sourceFor(30, 20, { decodeWidth: 20, decodeHeight: 31 });
    await expect(loadPanelSourceImage(forged.file, { deps: forged.world.deps, environment: DESKTOP, yieldNow: noYield }))
      .rejects.toMatchObject({ code: "decode-failed" });
    expect(forged.drawable.closed).toBe(true);
  });

  it("이미 취소된 신호는 아무것도 읽지 않는다", async () => {
    const controller = new AbortController();
    controller.abort();
    const world = fakeCanvasWorld({ decode: () => Promise.reject(new Error("호출되면 안 돼요")) });
    await expect(loadPanelSourceImage(fakePngFile("a.png", 10, 10), {
      deps: world.deps,
      environment: DESKTOP,
      signal: controller.signal,
      yieldNow: noYield,
    })).rejects.toMatchObject({ code: "cancelled" });
  });
});
