interface PaintedTileBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** 레이어 타일의 누적 paint 영역을 보존한다. flush 뒤에도 이전 잉크 범위를 줄이지 않는다. */
export class DirtyTilePaintedCoverage {
  private readonly bounds = new WeakMap<Uint8ClampedArray, PaintedTileBounds>();

  record(tile: Uint8ClampedArray, minX: number, minY: number, maxX: number, maxY: number): void {
    const previous = this.bounds.get(tile);
    if (previous) {
      previous.minX = Math.min(previous.minX, minX);
      previous.minY = Math.min(previous.minY, minY);
      previous.maxX = Math.max(previous.maxX, maxX);
      previous.maxY = Math.max(previous.maxY, maxY);
    } else {
      this.bounds.set(tile, { minX, minY, maxX, maxY });
    }
  }

  /** 종이 배경 복사 후 누적 영역만 기존 순서·부동소수 계산·정수 버림으로 합성한다. */
  composite(src: Uint8ClampedArray, dst: Uint8ClampedArray, tileSize: number, layerOpacity: number, isMultiply: boolean): void {
    const bounds = this.bounds.get(src);
    if (!bounds) return;
    for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
      const end = (y * tileSize + bounds.maxX) * 4;
      for (let i = (y * tileSize + bounds.minX) * 4; i <= end; i += 4) {
        const rawA = src[i + 3] ?? 0;
        if (rawA === 0) continue;
        const a = (rawA / 255) * layerOpacity;
        const invA = 1 - a;
        const dR = dst[i] ?? 255;
        const dG = dst[i + 1] ?? 255;
        const dB = dst[i + 2] ?? 255;
        const sR = src[i] ?? 0;
        const sG = src[i + 1] ?? 0;
        const sB = src[i + 2] ?? 0;
        dst[i] = (dR * invA + (isMultiply ? (dR * sR) / 255 : sR) * a) | 0;
        dst[i + 1] = (dG * invA + (isMultiply ? (dG * sG) / 255 : sG) * a) | 0;
        dst[i + 2] = (dB * invA + (isMultiply ? (dB * sB) / 255 : sB) * a) | 0;
      }
    }
  }
}
