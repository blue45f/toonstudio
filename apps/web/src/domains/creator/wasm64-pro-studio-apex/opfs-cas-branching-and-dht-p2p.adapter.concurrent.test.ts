import { describe, expect, it } from "vitest";

import {
  fnv1a64Hex,
  OpfsCasBranchTimeline,
  OpfsDirectoryCasBlobStore,
  type OpfsDirectoryHandleLike,
} from "./opfs-cas-branching-and-dht-p2p";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

/** 생성된 빈 파일과 close 전 임시 쓰기를 실제 OPFS처럼 구분한다. */
function createDirectory(options: {
  pauseFirstAt?: "write" | "close";
  failFirstAt?: "write" | "close";
} = {}) {
  const files = new Map<string, Uint8Array>();
  const started = deferred();
  const release = deferred();
  const failure = new Error("OPFS 저장 실패");
  let writers = 0;
  const boundary = async (attempt: number, stage: "write" | "close") => {
    if (attempt !== 1) return;
    if (options.pauseFirstAt === stage) { started.resolve(); await release.promise; }
    if (options.failFirstAt === stage) throw failure;
  };
  const directory: OpfsDirectoryHandleLike = {
    async getFileHandle(name, access) {
      if (!files.has(name)) {
        if (!access?.create) throw new Error("NotFoundError");
        files.set(name, new Uint8Array());
      }
      return {
        async getFile() {
          return { async arrayBuffer() { return (files.get(name) ?? new Uint8Array()).slice().buffer; } };
        },
        async createWritable() {
          const attempt = ++writers;
          let pending = new Uint8Array();
          return {
            async write(bytes) { await boundary(attempt, "write"); pending = bytes.slice(); },
            async close() { await boundary(attempt, "close"); files.set(name, pending.slice()); },
          };
        },
      };
    },
  };
  return { directory, files, started, release, failure, writerCount: () => writers };
}

const pixels = new Uint8Array([10, 20, 30, 255]);
const hash = fnv1a64Hex(pixels);

describe("OPFS CAS 동일 해시 저장 경쟁", () => {
  it("동일 해시 저장과 읽기는 close 완료를 기다리고 한 번만 저장·집계한다", async () => {
    const disk = createDirectory({ pauseFirstAt: "close" });
    const store = new OpfsDirectoryCasBlobStore(disk.directory);
    const first = store.put(hash, pixels);
    await disk.started.promise;
    let secondSettled = false;
    let readSettled = false;
    const second = store.put(hash, pixels).then((created) => { secondSettled = true; return created; });
    const reading = store.get(hash).then((bytes) => { readSettled = true; return bytes; });
    const exists = store.has(hash);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(secondSettled).toBe(false);
    expect(readSettled).toBe(false);
    expect(disk.writerCount()).toBe(1);
    expect(store.getStoredByteLength()).toBe(0);
    disk.release.resolve();

    expect(await Promise.all([first, second])).toEqual([true, false]);
    expect(await exists).toBe(true);
    expect(await reading).toEqual(pixels);
    expect(store.getBlobCount()).toBe(1);
    expect(store.getStoredByteLength()).toBe(pixels.byteLength);
  });

  it.each(["write", "close"] as const)("%s 실패를 같은 해시의 모든 저장에 전달하고 빈 파일을 덮어써 재시도한다", async (stage) => {
    const disk = createDirectory({ pauseFirstAt: stage, failFirstAt: stage });
    const store = new OpfsDirectoryCasBlobStore(disk.directory);
    const first = store.put(hash, pixels);
    await disk.started.promise;
    const attempts = Promise.allSettled([first, store.put(hash, pixels)]);
    disk.release.resolve();

    expect(await attempts).toEqual([
      { status: "rejected", reason: disk.failure },
      { status: "rejected", reason: disk.failure },
    ]);
    expect(disk.files.get(`${hash}.tile`)).toHaveLength(0);
    expect(await store.has(hash)).toBe(false);
    expect(await store.get(hash)).toBeNull();
    expect(await store.listHashes()).toEqual([]);
    const reopened = new OpfsDirectoryCasBlobStore(disk.directory);
    expect(await reopened.has(hash)).toBe(false);
    expect(await store.put(hash, pixels)).toBe(true);
    expect(await store.get(hash)).toEqual(pixels);
    expect(disk.writerCount()).toBe(2);
    expect(store.getStoredByteLength()).toBe(pixels.byteLength);
    expect(await store.put(hash, pixels)).toBe(false);
  });

  it("입력 바이트는 호출 시점에 고정하고 잘못된 내용 주소로 저장하지 않는다", async () => {
    const disk = createDirectory({ pauseFirstAt: "write" });
    const store = new OpfsDirectoryCasBlobStore(disk.directory);
    const input = pixels.slice();
    const saving = store.put(hash, input);
    input.fill(0);
    await disk.started.promise;
    disk.release.resolve();

    expect(await saving).toBe(true);
    expect(await store.get(hash)).toEqual(pixels);
    await expect(store.put(hash, input)).rejects.toThrow(/해시/u);
    expect(disk.writerCount()).toBe(1);
  });

  it("다른 해시 저장은 지연된 저장을 기다리지 않는다", async () => {
    const disk = createDirectory({ pauseFirstAt: "close" });
    const store = new OpfsDirectoryCasBlobStore(disk.directory);
    const first = store.put(hash, pixels);
    await disk.started.promise;
    const other = new Uint8Array([1, 2, 3, 255]);
    const otherHash = fnv1a64Hex(other);

    expect(await store.put(otherHash, other)).toBe(true);
    expect(await store.get(otherHash)).toEqual(other);
    expect(store.getStoredByteLength()).toBe(other.byteLength);
    disk.release.resolve();
    await first;
    expect(store.getBlobCount()).toBe(2);
    expect(store.getStoredByteLength()).toBe(pixels.byteLength + other.byteLength);
  });

  it("기존 파일을 병렬 확인해도 실제 해시를 검증하고 저장량을 한 번만 집계한다", async () => {
    const disk = createDirectory();
    disk.files.set(`${hash}.tile`, pixels.slice());
    const store = new OpfsDirectoryCasBlobStore(disk.directory);
    expect(await Promise.all([store.has(hash), store.has(hash), store.has(hash)])).toEqual([true, true, true]);
    expect(store.getBlobCount()).toBe(1);
    expect(store.getStoredByteLength()).toBe(pixels.byteLength);
    expect(await store.get(hash)).toEqual(pixels);
    expect(disk.writerCount()).toBe(0);
  });

  it("다른 브랜치가 실패 중인 동일 해시를 재사용해 빈 타일 커밋을 만들지 않는다", async () => {
    const disk = createDirectory({ pauseFirstAt: "write", failFirstAt: "write" });
    const store = new OpfsDirectoryCasBlobStore(disk.directory);
    const timeline = new OpfsCasBranchTimeline({ gridSize: 2, store });
    const initial = timeline.getHeadCommit().commitId;
    timeline.createBranch("alternate");
    const main = timeline.commitTiles([{ x: 0, y: 0, bytes: pixels }], "메인 저장");
    await disk.started.promise;
    timeline.checkoutBranch("alternate");
    const alternate = timeline.commitTiles([{ x: 1, y: 0, bytes: pixels }], "동일 타일 저장");
    const attempts = Promise.allSettled([main, alternate]);
    // 브랜치 큐가 같은 저장에 합류한 뒤 첫 쓰기를 실패시킨다.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    disk.release.resolve();

    expect((await attempts).map((attempt) => attempt.status)).toEqual(["rejected", "rejected"]);
    expect(timeline.getHeadCommit("main").commitId).toBe(initial);
    expect(timeline.getHeadCommit("alternate").commitId).toBe(initial);
    await timeline.commitTiles([{ x: 1, y: 0, bytes: pixels }], "저장 재시도");
    expect(await timeline.readTile(1, 0)).toEqual(pixels);
    expect(timeline.getHeadCommit().nonEmptyTileCount).toBe(1);
  });
});
