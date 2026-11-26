import { describe, expect, it, vi } from "vitest";

import { InMemorySyncAccessHandle, OpfsStreamingTileMmap } from "./opfs-streaming-tile-mmap";

const first = { layerId: 0, tileX: 0, tileY: 0 };
const second = { layerId: 0, tileX: 1, tileY: 0 };
const red = new Uint8Array([255, 0, 0, 255]);
const blue = new Uint8Array([0, 0, 255, 255]);

describe("타일 저장 실패와 재개방 복구", () => {
  it.each(["payload", "directory"])("%s 쓰기 실패 시 원고를 보존하고 재시도한다", (failureAt) => {
    const handle = new InMemorySyncAccessHandle();
    const mmap = new OpfsStreamingTileMmap(handle, { tileDim: 1, maxResidentTiles: 1 });
    mmap.writeTile(first, red);
    const write = handle.write.bind(handle);
    const failingWrite = vi.spyOn(handle, "write").mockImplementation((buffer, options) => {
      const isDirectory = BigInt(options?.at ?? 0) === BigInt(64);
      if ((failureAt === "directory") === isDirectory) throw new DOMException("Full", "QuotaExceededError");
      return write(buffer, options);
    });
    expect(() => mmap.writeTile(second, blue)).toThrow("Full");
    expect(mmap.getStats()).toMatchObject({ residentCount: 1, allocatedPageCount: 0, evictionCount: 0 });
    expect(mmap.readTile(first)).toEqual(red);
    expect(mmap.hasTile(second)).toBe(false);
    failingWrite.mockRestore();
    mmap.writeTile(second, blue);
    mmap.close();
    const reopened = new OpfsStreamingTileMmap(handle.reopen(), { tileDim: 1 });
    expect(reopened.readTile(first)).toEqual(red);
    expect(reopened.readTile(second)).toEqual(blue);
  });

  it("부분 쓰기가 멈춰도 변경한 픽셀을 보존한다", () => {
    const handle = new InMemorySyncAccessHandle();
    const mmap = new OpfsStreamingTileMmap(handle, { tileDim: 1, maxResidentTiles: 1 });
    mmap.writeTile(first, blue);
    mmap.flushDirtyTiles();
    mmap.writeTile(first, red);
    const write = handle.write.bind(handle);
    let calls = 0;
    const failingWrite = vi.spyOn(handle, "write").mockImplementation((buffer, options) => {
      calls += 1;
      return calls === 1 ? write(new Uint8Array(buffer.buffer, buffer.byteOffset, 2), options) : 0;
    });
    expect(() => mmap.writeTile(second, blue)).toThrow("Incomplete tile mmap write");
    expect(mmap.readTile(first)).toEqual(red);
    expect(mmap.getDirectoryEntry(first)?.generation).toBe(1);
    failingWrite.mockRestore();
    mmap.close();
    const reopened = new OpfsStreamingTileMmap(handle.reopen(), { tileDim: 1 });
    expect(reopened.readTile(first)).toEqual(red);
    expect(reopened.getDirectoryEntry(first)?.generation).toBe(2);
  });

  it("재개방 시 저장된 디렉터리 용량을 복원해 원고 영역을 보호한다", () => {
    const handle = new InMemorySyncAccessHandle();
    const writer = new OpfsStreamingTileMmap(handle, { tileDim: 1, directoryCapacity: 1 });
    writer.writeTile(first, red);
    writer.close();
    const reopened = new OpfsStreamingTileMmap(handle.reopen(), { tileDim: 1 });
    expect(reopened.getHeader().directoryCapacity).toBe(1);
    reopened.writeTile(second, blue);
    expect(() => reopened.flushDirtyTiles()).toThrow("capacity (1) exceeded");
    expect(reopened.readTile(first)).toEqual(red);
    expect(reopened.readTile(second)).toEqual(blue);
    const diskReader = new OpfsStreamingTileMmap(handle.reopen(), { tileDim: 1 });
    expect(diskReader.readTile(first)).toEqual(red);
    expect(() => new OpfsStreamingTileMmap(handle.reopen(), { tileDim: 1, directoryCapacity: 2 })).toThrow("Directory capacity mismatch");
  });
});
