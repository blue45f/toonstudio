import { describe, expect, it } from "vitest";

import {
  InMemorySyncAccessHandle,
  OpfsStreamingTileMmap,
  type SyncAccessHandleLike,
} from "./opfs-streaming-tile-mmap";

/** 실제 WebIDL 경계처럼 bigint 오프셋을 받지 않는 희소 파일 핸들이다. */
class NativeOffsetHandle implements SyncAccessHandleLike {
  readonly offsets: number[] = [];

  constructor(readonly backing = new InMemorySyncAccessHandle()) {}

  private checkOffset(options?: { readonly at?: number }): void {
    if (options?.at === undefined) return;
    if (typeof options.at !== "number") throw new TypeError("OPFS offset must be a number");
    if (!Number.isSafeInteger(options.at) || options.at < 0) throw new RangeError("Unsafe OPFS offset");
    this.offsets.push(options.at);
  }

  read(buffer: ArrayBufferView, options?: { readonly at?: number }): number {
    this.checkOffset(options);
    return this.backing.read(buffer, options);
  }

  write(buffer: ArrayBufferView, options?: { readonly at?: number }): number {
    this.checkOffset(options);
    return this.backing.write(buffer, options);
  }

  getSize(): number { return this.backing.getSize(); }
  flush(): void { this.backing.flush(); }
  truncate(size: number): void { this.backing.truncate(size); }
  close(): void { this.backing.close(); }
}

describe("OPFS 네이티브 오프셋 경계", () => {
  it.each([false, true])("4 GiB 위의 원고를 number 핸들로 저장하고 다시 읽는다 (압축=%s)", (enableCompression) => {
    const handle = new NativeOffsetHandle();
    const base = BigInt(2 ** 32) + BigInt(17);
    const coord = { layerId: 0, tileX: 0, tileY: 0 };
    const pixels = new Uint8Array(4 * 4 * 4);
    const writer = new OpfsStreamingTileMmap(handle, { tileDim: 4, dataRegionBaseOffset: base, enableCompression });
    writer.writeTile(coord, pixels);
    writer.close();

    const readerHandle = new NativeOffsetHandle(handle.backing.reopen());
    const reader = new OpfsStreamingTileMmap(readerHandle, { tileDim: 4 });
    expect(reader.getDirectoryEntry(coord)?.byteOffset).toBe(base);
    expect(reader.readTile(coord)).toEqual(pixels);
    expect(handle.offsets).toContain(Number(base));
    expect(readerHandle.offsets).toEqual(expect.arrayContaining([0, 64, Number(base)]));
  });

  it.each([BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1), BigInt(Number.MAX_SAFE_INTEGER) - BigInt(1)])(
    "안전한 정수 범위를 벗어나는 쓰기 구간 %s는 핸들 호출 전에 거부한다",
    (dataRegionBaseOffset) => {
      const handle = new NativeOffsetHandle();
      const mmap = new OpfsStreamingTileMmap(handle, { tileDim: 1, dataRegionBaseOffset });
      const coord = { layerId: 0, tileX: 0, tileY: 0 };
      const pixels = new Uint8Array([1, 2, 3, 255]);
      mmap.writeTile(coord, pixels);
      const writeOps = handle.backing.writeOps;

      expect(() => mmap.flushDirtyTiles()).toThrow(RangeError);
      expect(handle.backing.writeOps).toBe(writeOps);
      expect(mmap.readTile(coord)).toEqual(pixels);
      expect(mmap.getStats().allocatedPageCount).toBe(0);
    },
  );
});
