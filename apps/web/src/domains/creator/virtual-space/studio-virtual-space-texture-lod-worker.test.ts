import { describe, expect, it, vi } from "vitest";

import {
  STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION,
  isStudioTextureLodWorkerRequest,
  isStudioTextureLodWorkerResponse,
  studioTextureLodWorkerRespond,
  type StudioTextureLodWorkerRequest,
  type StudioTextureLodWorkerResponse,
} from "./studio-virtual-space-texture-lod-worker-protocol";
import {
  StudioTextureLodWorkerClient,
  type StudioTextureLodWorkerLike,
} from "./studio-virtual-space-texture-lod-worker-client";
import { StudioTextureLodRuntime, type StudioLodRenderer, type StudioLodScene, type StudioLodTexture, type StudioLodWrapper } from "./studio-virtual-space-texture-lod";

function solidBuffer(width: number, height: number, rgba: readonly [number, number, number, number]): ArrayBuffer {
  const data = new Uint8Array(width * height * 4);
  for (let index = 0; index < data.length; index += 4) data.set(rgba, index);
  return data.buffer;
}

const validRequest = (overrides: Partial<StudioTextureLodWorkerRequest> = {}): StudioTextureLodWorkerRequest => ({
  version: STUDIO_TEXTURE_LOD_WORKER_PROTOCOL_VERSION, requestId: 7, level: 1, width: 16, height: 16,
  cells: [{ x: 0, y: 0, width: 16, height: 16 }], source: { kind: "pixels", data: solidBuffer(16, 16, [100, 50, 25, 255]) }, ...overrides,
});

describe("텍스처 LOD 워커 프로토콜", () => {
  it("올바른 요청만 통과시키고 비정상 크기·단계·칸·버퍼는 거른다", () => {
    expect(isStudioTextureLodWorkerRequest(validRequest())).toBe(true);
    expect(isStudioTextureLodWorkerRequest(null)).toBe(false);
    expect(isStudioTextureLodWorkerRequest({ ...validRequest(), version: 2 })).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ requestId: 0 }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ level: 0 }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ level: 4 }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ width: 0 }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ width: 9_000, height: 2, source: { kind: "pixels", data: new ArrayBuffer(9_000 * 2 * 4) } }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ source: { kind: "pixels", data: new ArrayBuffer(10) } }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ source: { kind: "bitmap", bitmap: {} as ImageBitmap } }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ cells: [] }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ cells: [{ x: 8, y: 0, width: 16, height: 16 }] }))).toBe(false);
    expect(isStudioTextureLodWorkerRequest(validRequest({ cells: [{ x: 0.5, y: 0, width: 4, height: 4 }] }))).toBe(false);
  });

  it("요청을 계산해 프리멀티플라이드 LOD 이미지를 돌려준다", () => {
    const response = studioTextureLodWorkerRespond(validRequest());
    expect(isStudioTextureLodWorkerResponse(response)).toBe(true);
    if (response.kind !== "result") throw new Error("결과여야 한다");
    expect([response.requestId, response.width, response.height]).toEqual([7, 8, 8]);
    const pixels = new Uint8Array(response.data);
    expect(pixels.length).toBe(8 * 8 * 4);
    expect([...pixels.slice(0, 4)]).toEqual([100, 50, 25, 255]);
  });

  it("응답 모양도 검사한다", () => {
    expect(isStudioTextureLodWorkerResponse({ version: 1, kind: "error", requestId: 1, message: "x" })).toBe(true);
    expect(isStudioTextureLodWorkerResponse({ version: 1, kind: "result", requestId: 1, width: 2, height: 2, data: new ArrayBuffer(4) })).toBe(false);
    expect(isStudioTextureLodWorkerResponse({ version: 9, kind: "error", requestId: 1, message: "x" })).toBe(false);
  });
});

class FakeWorker implements StudioTextureLodWorkerLike {
  readonly posted: StudioTextureLodWorkerRequest[] = [];
  readonly transfers: Transferable[][] = [];
  readonly terminate = vi.fn();
  private readonly messageListeners = new Set<(event: { readonly data: unknown }) => void>();
  private readonly errorListeners = new Set<(event: unknown) => void>();
  postMessage(message: StudioTextureLodWorkerRequest, transfer: Transferable[]): void { this.posted.push(message); this.transfers.push(transfer); }
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void;
  addEventListener(type: string, listener: (event: never) => void): void {
    if (type === "message") this.messageListeners.add(listener as (event: { readonly data: unknown }) => void);
    else this.errorListeners.add(listener as (event: unknown) => void);
  }
  reply(response: StudioTextureLodWorkerResponse | unknown): void { for (const listener of this.messageListeners) listener({ data: response }); }
  fail(): void { for (const listener of this.errorListeners) listener(new Error("worker crashed")); }
  /** 마지막 요청을 계산해 답한다(워커가 하는 일). */
  answerLast(): void { const request = this.posted.at(-1); if (request) this.reply(studioTextureLodWorkerRespond(request)); }
}

describe("StudioTextureLodWorkerClient", () => {
  it("요청을 보낼 때 버퍼를 전송하고, 답이 오면 결과를 가져가게 한다", () => {
    const fake = new FakeWorker();
    const client = new StudioTextureLodWorkerClient(() => fake);
    const data = solidBuffer(16, 16, [10, 20, 30, 255]);
    const ticket = client.submit({ level: 1, width: 16, height: 16, cells: [{ x: 0, y: 0, width: 16, height: 16 }], source: { kind: "pixels", data } });
    expect(ticket).not.toBeNull();
    expect(fake.transfers[0]).toEqual([data]);
    expect(client.take(ticket ?? 0)).toEqual({ status: "pending" });
    fake.answerLast();
    const taken = client.take(ticket ?? 0);
    expect(taken.status).toBe("done");
    if (taken.status === "done") expect([taken.image.width, taken.image.height]).toEqual([8, 8]);
    expect(client.take(ticket ?? 0)).toEqual({ status: "failed" }); // 한 번 가져가면 사라진다
  });

  it("워커가 없거나 오류를 내면 사용 불가로 돌아서고 기다리던 요청은 실패로 돌린다", () => {
    expect(new StudioTextureLodWorkerClient(() => null).submit({ level: 1, width: 1, height: 1, cells: [], source: { kind: "pixels", data: new ArrayBuffer(4) } })).toBeNull();
    const fake = new FakeWorker();
    const client = new StudioTextureLodWorkerClient(() => fake);
    const ticket = client.submit({ level: 1, width: 16, height: 16, cells: [{ x: 0, y: 0, width: 16, height: 16 }], source: { kind: "pixels", data: solidBuffer(16, 16, [1, 2, 3, 255]) } }) ?? 0;
    fake.fail();
    expect(client.available).toBe(false);
    expect(fake.terminate).toHaveBeenCalled();
    expect(client.take(ticket)).toEqual({ status: "failed" });
    expect(client.submit({ level: 1, width: 1, height: 1, cells: [], source: { kind: "pixels", data: new ArrayBuffer(4) } })).toBeNull();
  });

  it("워커가 OffscreenCanvas를 못 쓴다고 답하면 비트맵 방식만 끄고 워커는 계속 쓴다", () => {
    const fake = new FakeWorker();
    const client = new StudioTextureLodWorkerClient(() => fake);
    const bitmap = { width: 16, height: 16, close: vi.fn() } as unknown as ImageBitmap;
    const ticket = client.submit({ level: 1, width: 16, height: 16, cells: [{ x: 0, y: 0, width: 16, height: 16 }], source: { kind: "bitmap", bitmap } }) ?? 0;
    expect(fake.transfers[0]).toEqual([bitmap]);
    expect(client.bitmapAvailable).toBe(true);
    fake.reply({ version: 1, kind: "error", requestId: ticket, message: "offscreen-unavailable" });
    expect(client.bitmapAvailable).toBe(false);
    expect(client.available).toBe(true);
    expect(client.take(ticket)).toEqual({ status: "failed" });
  });

  it("엉뚱한 응답은 워커를 믿지 않고, 답이 너무 늦으면 실패로 본다", () => {
    const fake = new FakeWorker();
    let clock = 0;
    const client = new StudioTextureLodWorkerClient(() => fake, () => clock, 1_000);
    const ticket = client.submit({ level: 1, width: 16, height: 16, cells: [{ x: 0, y: 0, width: 16, height: 16 }], source: { kind: "pixels", data: solidBuffer(16, 16, [1, 2, 3, 255]) } }) ?? 0;
    clock = 1_500;
    expect(client.take(ticket)).toEqual({ status: "failed" });
    expect(client.available).toBe(false);
    const second = new FakeWorker();
    const other = new StudioTextureLodWorkerClient(() => second);
    other.submit({ level: 1, width: 16, height: 16, cells: [{ x: 0, y: 0, width: 16, height: 16 }], source: { kind: "pixels", data: solidBuffer(16, 16, [1, 2, 3, 255]) } });
    second.reply({ nonsense: true });
    expect(other.available).toBe(false);
  });
});

interface Wrapper extends StudioLodWrapper { readonly id: string }

function runtimeHarness() {
  const base: Wrapper = { id: "base", flipY: false, wrapS: 33071, wrapT: 33071, minFilter: 9729, magFilter: 9729, format: 6408 };
  const created: Array<{ width: number; height: number; pma: boolean }> = [];
  const renderer: StudioLodRenderer = {
    type: 2, gl: {},
    createTexture2D(_a, _b, _c, _d, _e, _f, _pixels, width, height, pma) { created.push({ width, height, pma }); return { ...base, id: `copy-${created.length}` }; },
    deleteTexture() {},
  };
  const source = { width: 160, height: 160, image: { tag: "img" }, scaleMode: 0, isCanvas: false, isVideo: false, isRenderTexture: false, isGLTexture: false, compressionAlgorithm: null, glTexture: base };
  const frame = { name: "__BASE", cutX: 0, cutY: 0, cutWidth: 160, cutHeight: 160, source };
  const texture: StudioLodTexture = { key: "hero", frames: { __BASE: frame }, source: [source] };
  const objects: unknown[] = [{ type: "Sprite", visible: true, alpha: 1, scaleX: 0.4, scaleY: 0.4, texture: { key: "hero" }, frame: { name: "__BASE" } }];
  const listeners = new Map<string, Set<(key: string) => void>>();
  let exists = true;
  const scene: StudioLodScene = {
    children: { list: objects }, cameras: { main: { zoom: 1 } },
    textures: {
      exists: () => exists, get: () => texture,
      on: (event, listener) => { (listeners.get(event) ?? listeners.set(event, new Set()).get(event))?.add(listener); },
      off: (event, listener) => { listeners.get(event)?.delete(listener); },
    },
    game: { renderer },
  };
  const readPixels = () => ({ data: new Uint8ClampedArray(160 * 160 * 4).fill(200), width: 160, height: 160 });
  return { scene, frame, source, created, remove: () => { exists = false; listeners.get("removetexture")?.forEach((listener) => listener("hero")); }, readPixels };
}

describe("StudioTextureLodRuntime(워커 경로)", () => {
  it("큰 계산은 워커에 맡기고, 결과가 오면 다음 업데이트에서 사본을 올린다(그 사이 메인 스레드는 계산하지 않는다)", () => {
    const h = runtimeHarness();
    const fake = new FakeWorker();
    const lod = new StudioTextureLodRuntime({ scene: h.scene, enabled: true, now: () => 0, readPixels: h.readPixels, workerFactory: () => fake, createBitmap: () => null });
    lod.update(0);
    expect(fake.posted).toHaveLength(1);
    expect([fake.posted[0]?.level, fake.posted[0]?.width, fake.posted[0]?.height]).toEqual([1, 160, 160]);
    expect(h.created).toHaveLength(0);
    lod.update(1);
    expect(h.created).toHaveLength(0); // 아직 계산 중
    fake.answerLast();
    lod.update(2);
    expect(h.created).toEqual([{ width: 80, height: 80, pma: false }]);
    expect(h.frame.source).not.toBe(h.source);
  });

  it("워커가 실패하면 같은 작업을 메인 스레드에서 다시 계산해 끝낸다", () => {
    const h = runtimeHarness();
    const fake = new FakeWorker();
    const lod = new StudioTextureLodRuntime({ scene: h.scene, enabled: true, now: () => 0, readPixels: h.readPixels, workerFactory: () => fake, createBitmap: () => null });
    lod.update(0);
    fake.fail();
    lod.update(1);
    expect(h.created).toEqual([{ width: 80, height: 80, pma: false }]);
  });

  it("작업 중에 텍스처가 지워지면 늦게 온 결과를 버린다", () => {
    const h = runtimeHarness();
    const fake = new FakeWorker();
    const lod = new StudioTextureLodRuntime({ scene: h.scene, enabled: true, now: () => 0, readPixels: h.readPixels, workerFactory: () => fake, createBitmap: () => null });
    lod.update(0);
    h.remove();
    fake.answerLast();
    lod.update(1);
    expect(h.created).toHaveLength(0);
    expect(lod.entries()).toEqual([]);
  });

  it("워커가 비트맵을 직접 읽을 수 있으면 메인 스레드는 픽셀을 읽지 않고 비트맵만 넘긴다", async () => {
    const h = runtimeHarness();
    const fake = new FakeWorker();
    const readPixels = vi.fn(h.readPixels);
    const bitmap = { width: 160, height: 160, close: vi.fn() } as unknown as ImageBitmap;
    const lod = new StudioTextureLodRuntime({ scene: h.scene, enabled: true, now: () => 0, readPixels, workerFactory: () => fake, createBitmap: () => Promise.resolve(bitmap) });
    lod.update(0);
    expect(fake.posted).toHaveLength(0); // 비트맵이 만들어지길 기다린다
    await Promise.resolve();
    lod.update(1);
    expect(fake.posted).toHaveLength(1);
    expect(fake.posted[0]?.source.kind).toBe("bitmap");
    expect(fake.transfers[0]).toEqual([bitmap]);
    expect(readPixels).not.toHaveBeenCalled();
    fake.reply(studioTextureLodWorkerRespond(fake.posted[0] as StudioTextureLodWorkerRequest, () => new Uint8ClampedArray(160 * 160 * 4).fill(180)));
    lod.update(2);
    expect(h.created).toEqual([{ width: 80, height: 80, pma: false }]);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it("워커에 OffscreenCanvas가 없다고 답하면 그 작업은 메인 스레드에서 끝낸다", async () => {
    const h = runtimeHarness();
    const fake = new FakeWorker();
    const bitmap = { width: 160, height: 160, close: vi.fn() } as unknown as ImageBitmap;
    const createBitmap = vi.fn(() => Promise.resolve(bitmap));
    const lod = new StudioTextureLodRuntime({ scene: h.scene, enabled: true, now: () => 0, readPixels: h.readPixels, workerFactory: () => fake, createBitmap });
    lod.update(0);
    await Promise.resolve();
    lod.update(1);
    fake.reply(studioTextureLodWorkerRespond(fake.posted[0] as StudioTextureLodWorkerRequest, () => null));
    lod.update(2);
    expect(h.created).toEqual([{ width: 80, height: 80, pma: false }]); // 메인 스레드 계산으로 끝났다
    expect(createBitmap).toHaveBeenCalledTimes(1);
  });
});
