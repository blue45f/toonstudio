import { crc32, deflateSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { studioBg3dSixPassArtifactSourceUri } from "@toonstudio/contracts/studio-bg3d-six-pass-reference";
import { sha256HexPortable } from "../studio-sha256";
import { acquireStudioRasterSourceLease, createStudioRasterSourceResidentBudget, studioRasterSourceResidentBudget,
  type StudioRasterSourceAuthority, type StudioRasterSourceLease } from "./studio-raster-source-lease";
import { acquireStudioRasterThumbnailSourceLease, studioRasterThumbnailDecodeSize,
  type StudioRasterThumbnailSourceLease } from "./studio-raster-thumbnail-source";

const defaultAuthority = vi.hoisted(() => ({ acquire: vi.fn() }));
vi.mock("../scene3d/bg3d-six-pass/studio-bg3d-six-pass-bundle-product-authority", () => ({ acquireStudioBg3dSixPassBundleProductAuthority: defaultAuthority.acquire }));
function chunk(name: string, bytes: Uint8Array): Uint8Array {
  const result = Buffer.alloc(bytes.byteLength + 12); result.writeUInt32BE(bytes.byteLength); result.write(name, 4);
  result.set(bytes, 8); result.writeUInt32BE(crc32(result.subarray(4, -4)), result.length - 4); return result;
}
function png(width: number, height: number, tag = "source"): Uint8Array {
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header),
    chunk("tEXt", Buffer.from(`role\0${tag}`)), chunk("IDAT", deflateSync(Buffer.alloc((width * 4 + 1) * height))), chunk("IEND", new Uint8Array())]);
}
const hash = (bytes: Uint8Array): `sha256:${string}` => `sha256:${sha256HexPortable(bytes)}`;
function authority(values: ReadonlyMap<string, Uint8Array>): StudioRasterSourceAuthority {
  return { kind: "opfs", get: vi.fn(async (key) => values.get(key) ?? null), put: vi.fn(), ownerRefs: vi.fn(async () => []), setOwnerRefs: vi.fn(async () => []) };
}
const owned: Array<StudioRasterSourceLease | StudioRasterThumbnailSourceLease> = [];
afterEach(() => { for (const lease of owned.splice(0)) lease.release(); vi.restoreAllMocks(); vi.unstubAllGlobals(); defaultAuthority.acquire.mockReset(); });
function browser() {
  let sequence = 0;
  const create = vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:thumbnail-${++sequence}`);
  const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  const closes: ReturnType<typeof vi.fn<() => void>>[] = [];
  const decode = vi.fn<(blob: Blob, options?: ImageBitmapOptions) => Promise<Pick<ImageBitmap, "width" | "height" | "close">>>(async (_blob, options) => {
    const close = vi.fn<() => void>(); closes.push(close); return { width: options?.resizeWidth ?? 1, height: options?.resizeHeight ?? 1, close };
  });
  vi.stubGlobal("createImageBitmap", decode);
  class Canvas {
    constructor(public width: number, public height: number) {}
    getContext() { return { drawImage: vi.fn() }; }
    async convertToBlob() { return new Blob([Uint8Array.from(png(this.width, this.height))], { type: "image/png" }); }
  }
  vi.stubGlobal("OffscreenCanvas", Canvas); return { create, revoke, decode, closes };
}
function largeSources() {
  const values = new Map<string, Uint8Array>();
  const sources = ["color", "tone", "shadow", "depth", "texture-line", "main-line"].map((role) => {
    const bytes = png(3155, 2160, role), digest = hash(bytes); values.set(digest, bytes); return studioBg3dSixPassArtifactSourceUri(digest);
  });
  return { sources, store: authority(values) };
}
describe("6패스 원본과 화면 크기 썸네일의 표시 lease", () => {
  it("새 digest URI는 기본 bundle 권위로 검증하고 authority 대기 중 취소도 즉시 끝낸다", async () => {
    browser(); const bytes = png(1, 1), store = authority(new Map([[hash(bytes), bytes]]));
    defaultAuthority.acquire.mockResolvedValueOnce(store);
    const lease = await acquireStudioRasterSourceLease(studioBg3dSixPassArtifactSourceUri(hash(bytes))); owned.push(lease);
    expect(store.get).toHaveBeenCalledWith(hash(bytes), { verify: true });
    let finish!: (value: StudioRasterSourceAuthority) => void;
    defaultAuthority.acquire.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const controller = new AbortController();
    const pending = acquireStudioRasterSourceLease(studioBg3dSixPassArtifactSourceUri(hash(bytes)), { signal: controller.signal }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(defaultAuthority.acquire).toHaveBeenCalledTimes(2)); controller.abort();
    expect(await pending).toMatchObject({ code: "aborted" }); finish(store);
  });
  it("실제 해상도에서 full Stage5+thumbnail4가 점유하면 추가 tone fulllease가 거부됨을 재현한다", async () => {
    browser(); const f = largeSources();
    for (const index of [0, 2, 3, 4, 5, 0, 2, 3, 5]) owned.push(await acquireStudioRasterSourceLease(f.sources[index], { authority: f.store }));
    await expect(acquireStudioRasterSourceLease(f.sources[1], { authority: f.store })).rejects.toMatchObject({ code: "budget-denied" });
    expect(studioRasterSourceResidentBudget.snapshot().activeReservationCount).toBe(9);
  });
  it("3155×2160 Stage6와 실제96×66 표시용 thumbnail6가 원본·256MiB 예산을 유지하며 모두 입장한다", async () => {
    const b = browser(), f = largeSources();
    for (const source of f.sources) owned.push(await acquireStudioRasterSourceLease(source, { authority: f.store, consumer: "studio-konva-image-node" }));
    const previews = await Promise.all(f.sources.map(async (source) => {
      const lease = await acquireStudioRasterThumbnailSourceLease(source, { authority: f.store, consumer: "studio-page-thumbnail", displayWidth: 96, displayHeight: 66 });
      owned.push(lease); return lease;
    }));
    expect(previews).toHaveLength(6); expect(previews.every((lease) => lease.width === 97 && lease.height === 66)).toBe(true);
    expect(previews.every((lease) => lease.sourceReceipt.width === 3155 && lease.sourceReceipt.height === 2160)).toBe(true);
    expect(studioRasterSourceResidentBudget.snapshot()).toMatchObject({ activeReservationCount: 12, maxResidentBytes: 256 * 1024 * 1024 });
    expect(studioRasterSourceResidentBudget.snapshot().reservedBytes).toBeLessThan(180 * 1024 * 1024);
    expect(b.decode).toHaveBeenCalledTimes(6); expect(b.closes.every((close) => close.mock.calls.length === 1)).toBe(true);
    for (const lease of owned.splice(0)) lease.release();
    expect(studioRasterSourceResidentBudget.snapshot().reservedBytes).toBe(0); expect(b.revoke).toHaveBeenCalledTimes(12);
  });
  it("확대한 viewport의 1200×822 thumbnail6도 종료된 임시 표면만 차감하여 모두 표시한다", async () => {
    browser(); const f = largeSources();
    for (const source of f.sources) owned.push(await acquireStudioRasterSourceLease(source, { authority: f.store }));
    for (const source of f.sources) owned.push(await acquireStudioRasterThumbnailSourceLease(source,
      { authority: f.store, displayWidth: 1200, displayHeight: 822 }));
    expect(studioRasterSourceResidentBudget.snapshot().activeReservationCount).toBe(12);
    expect(studioRasterSourceResidentBudget.snapshot().reservedBytes).toBeLessThan(210 * 1024 * 1024);
  });
  it("예약 축소는 예산을 늘리거나 해제한 lease를 다시 살릴 수 없다", () => {
    const budget = createStudioRasterSourceResidentBudget(128), reservation = budget.reserve({ consumer: "preview",
      contentHash: `sha256:${"a".repeat(64)}`, sourceBytes: 16, decodedPixels: 20, decodedRgbaBytes: 80 });
    expect(reservation?.shrinkToResidentBytes?.(32)).toBe(true);
    expect(budget.snapshot()).toMatchObject({ reservedBytes: 32, activeReservationCount: 1 });
    expect(reservation?.shrinkToResidentBytes?.(64)).toBe(false); expect(reservation?.shrinkToResidentBytes?.(-1)).toBe(false);
    reservation?.release(); expect(budget.snapshot().reservedBytes).toBe(0);
    expect(reservation?.shrinkToResidentBytes?.(16)).toBe(false);
  });
  it("취소된 대기자가 새 preview를 먼저 제출하지 않고 늦은 native bitmap도 닫는다", async () => {
    const b = browser(), bytes = png(4, 4), store = authority(new Map([[hash(bytes), bytes]])), source = studioBg3dSixPassArtifactSourceUri(hash(bytes));
    let finish!: (bitmap: Pick<ImageBitmap, "width" | "height" | "close">) => void;
    const lateClose = vi.fn<() => void>(); b.decode.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const firstController = new AbortController(), secondController = new AbortController();
    const first = acquireStudioRasterThumbnailSourceLease(source, { authority: store, displayWidth: 2, displayHeight: 2, signal: firstController.signal }).catch((error: unknown) => error);
    await vi.waitFor(() => expect(b.decode).toHaveBeenCalledOnce());
    const second = acquireStudioRasterThumbnailSourceLease(source, { authority: store, displayWidth: 2, displayHeight: 2, signal: secondController.signal }).catch((error: unknown) => error);
    secondController.abort(); expect(await second).toMatchObject({ code: "aborted" });
    const third = acquireStudioRasterThumbnailSourceLease(source, { authority: store, displayWidth: 2, displayHeight: 2 });
    firstController.abort(); expect(b.decode).toHaveBeenCalledOnce();
    finish({ width: 2, height: 2, close: lateClose });
    expect(await first).toMatchObject({ code: "aborted" }); const last = await third; owned.push(last);
    expect(lateClose).toHaveBeenCalledOnce(); expect(b.decode).toHaveBeenCalledTimes(2);
  });
  it("preview budget 거절 뒤 full 원본과 이미 받은 preview 예약을 모두 돌려준다", async () => {
    const b = browser(), bytes = png(4, 4), store = authority(new Map([[hash(bytes), bytes]])), release = vi.fn();
    const reserve = vi.fn().mockReturnValueOnce({ release }).mockReturnValueOnce(null);
    await expect(acquireStudioRasterThumbnailSourceLease(studioBg3dSixPassArtifactSourceUri(hash(bytes)),
      { authority: store, displayWidth: 2, displayHeight: 2, budget: { reserve } })).rejects.toMatchObject({ code: "budget-denied" });
    expect(release).toHaveBeenCalledOnce(); expect(b.decode).not.toHaveBeenCalled();
    expect(studioRasterSourceResidentBudget.snapshot().reservedBytes).toBe(0);
  });
  it("디코더 실패 뒤 queue·원본·예산이 정리되어 다음 preview를 정상 생성한다", async () => {
    const b = browser(), bytes = png(4, 4), store = authority(new Map([[hash(bytes), bytes]])), source = studioBg3dSixPassArtifactSourceUri(hash(bytes));
    b.decode.mockRejectedValueOnce(new Error("native decode failed"));
    await expect(acquireStudioRasterThumbnailSourceLease(source, { authority: store, displayWidth: 2, displayHeight: 2 })).rejects.toThrow("native decode failed");
    expect(studioRasterSourceResidentBudget.snapshot().reservedBytes).toBe(0);
    const next = await acquireStudioRasterThumbnailSourceLease(source, { authority: store, displayWidth: 2, displayHeight: 2 }); owned.push(next);
    expect(next).toMatchObject({ width: 2, height: 2 });
  });
  it("확대와 표시 배율은 원본 비율·필요 화소를 보존하며 고정 크기로 제한하지 않는다", () => {
    expect(studioRasterThumbnailDecodeSize({ width: 3155, height: 2160 }, { width: 192, height: 132 })).toEqual({ width: 193, height: 132 });
    expect(studioRasterThumbnailDecodeSize({ width: 3155, height: 2160 }, { width: 600, height: 411 })).toEqual({ width: 601, height: 411 });
    expect(studioRasterThumbnailDecodeSize({ width: 3155, height: 2160 }, { width: 9000, height: 9000 })).toEqual({ width: 3155, height: 2160 });
  });
});
