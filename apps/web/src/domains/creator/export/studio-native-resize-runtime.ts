import { resizeStudioRgbaLanczos3 } from "./studio-native-lanczos";

/** 기존 내보내기 호출 계약만 보존하는 자체 구현. libvips API 전체의 대체물이 아니다. */
class NativeRaster {
  constructor(
    private pixels: Uint8Array | null,
    readonly width: number,
    readonly height: number,
  ) {}

  private data(): Uint8Array {
    if (this.pixels === null) throw new Error("Native raster was already released.");
    return this.pixels;
  }

  resize(scale: number, options: { vscale?: number } = {}): NativeRaster {
    const width = Math.max(1, Math.round(this.width * scale));
    const height = Math.max(1, Math.round(this.height * (options.vscale ?? scale)));
    return new NativeRaster(resizeStudioRgbaLanczos3(this.data(), this.width, this.height, width, height), width, height);
  }

  writeToMemory(): Uint8Array {
    return this.data();
  }

  delete(): void {
    this.pixels = null;
  }
}

export default function createNativeResizeRuntime() {
  return Promise.resolve({
    Image: {
      newFromMemory(data: Uint8Array, width: number, height: number, bands: number, format: string): NativeRaster {
        if (bands !== 4 || format !== "uchar") throw new TypeError("Native export runtime accepts RGBA8 only.");
        return new NativeRaster(data, width, height);
      },
    },
    concurrency(threads: number): void {
      if (threads !== 1) throw new RangeError("Native export runtime is deterministic and single-threaded.");
    },
  });
}
