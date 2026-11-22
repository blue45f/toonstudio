import type { StudioOilDeviceRect } from "../brush/studio-oil-readback-plan";

/** 작은 첫 접촉은 타일당 64KiB만 읽고, 같은 스냅샷의 타일은 다시 읽지 않는다. */
export const STUDIO_LIVE_OIL_SNAPSHOT_TILE_SIZE = 128;

type OilPixels = Pick<ImageData, "data" | "width" | "height">;
type OilTile = OilPixels & { readonly x: number; readonly y: number };

/** 타일과 출력의 서로 다른 행 간격을 유지하며 기존 8비트 혼색식을 그대로 적용한다. */
function contributeRectangle(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  sourceOffset: number,
  targetOffset: number,
  width: number,
  height: number,
  sourceWidth: number,
  targetWidth: number,
): void {
  for (let row = 0; row < height; row += 1) {
    let source = sourceOffset + row * sourceWidth * 4;
    let target = targetOffset + row * targetWidth * 4;
    for (let column = 0; column < width; column += 1, source += 4, target += 4) {
      const a = before[source + 3]! / 255;
      const b = after[target + 3]! / 255;
      if (before[source] === after[target] && before[source + 1] === after[target + 1]
        && before[source + 2] === after[target + 2] && a === b) {
        after.fill(0, target, target + 4);
        continue;
      }
      // 알파가 254→254여도 바뀐 RGB를 표현할 수 있는 최소 알파를 보존한다.
      let alpha = a === 1 ? 1 : Math.max(0, Math.min(1, (b - a) / (1 - a)));
      for (let channel = 0; channel < 3; channel += 1) {
        const previous = before[source + channel]! / 255 * a;
        const next = after[target + channel]! / 255 * b;
        if (next < previous) alpha = Math.max(alpha, 1 - next / previous);
        else if (next > previous) alpha = Math.max(alpha, (next - previous) / (1 - previous));
      }
      if (alpha === 0) {
        after.fill(0, target, target + 4);
        continue;
      }
      for (let channel = 0; channel < 3; channel += 1) {
        after[target + channel] = (after[target + channel]! * b
          - before[source + channel]! * a * (1 - alpha)) / alpha;
      }
      after[target + 3] = alpha * 255;
    }
  }
}

/** 기존 전체/잘린 버퍼 호출자의 혼색 결과와 행 간격 계약을 유지한다. */
export function studioOilSourceOverContribution(
  before: Uint8ClampedArray,
  after: Uint8ClampedArray,
  region?: { readonly x: number; readonly y: number; readonly width: number; readonly sourceWidth: number },
): void {
  if (after.length === 0) return;
  const width = region?.width ?? after.length / 4;
  contributeRectangle(before, after,
    region ? (region.y * region.sourceWidth + region.x) * 4 : 0,
    0, width, after.length / (width * 4), region?.sourceWidth ?? width, width);
}

/** 고정된 한 snapshot만 읽는다. eviction 없이 보유하므로 누적 픽셀 읽기가 전체 면적을 넘지 않는다. */
export class StudioLiveOilSnapshotTiles {
  private readonly tiles = new Map<number, OilTile>();
  private readonly columns: number;

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly read: (rect: StudioOilDeviceRect) => OilPixels,
  ) {
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
      throw new Error("유화 바닥 스냅샷 크기가 올바르지 않습니다.");
    }
    this.columns = Math.ceil(width / STUDIO_LIVE_OIL_SNAPSHOT_TILE_SIZE);
  }

  contribute(after: OilPixels, rect: StudioOilDeviceRect): void {
    const { x, y, width, height } = rect;
    if (![x, y, width, height].every(Number.isSafeInteger) || x < 0 || y < 0
      || width <= 0 || height <= 0 || x + width > this.width || y + height > this.height
      || after.width !== width || after.height !== height || after.data.length !== width * height * 4) {
      throw new Error("유화 바닥 혼색 영역과 출력 픽셀이 일치하지 않습니다.");
    }
    const size = STUDIO_LIVE_OIL_SNAPSHOT_TILE_SIZE;
    for (let tileY = Math.floor(y / size); tileY <= Math.floor((y + height - 1) / size); tileY += 1) {
      for (let tileX = Math.floor(x / size); tileX <= Math.floor((x + width - 1) / size); tileX += 1) {
        const tile = this.readTile(tileX, tileY);
        const left = Math.max(x, tile.x);
        const top = Math.max(y, tile.y);
        const overlapWidth = Math.min(x + width, tile.x + tile.width) - left;
        const overlapHeight = Math.min(y + height, tile.y + tile.height) - top;
        // ROI 전체 before 사본이나 행별 subarray를 만들지 않고 캐시와 after를 직접 혼색한다.
        contributeRectangle(tile.data, after.data,
          ((top - tile.y) * tile.width + left - tile.x) * 4,
          ((top - y) * width + left - x) * 4,
          overlapWidth, overlapHeight, tile.width, width);
      }
    }
  }

  private readTile(tileX: number, tileY: number): OilTile {
    const key = tileY * this.columns + tileX;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const size = STUDIO_LIVE_OIL_SNAPSHOT_TILE_SIZE;
    const x = tileX * size;
    const y = tileY * size;
    const width = Math.min(size, this.width - x);
    const height = Math.min(size, this.height - y);
    const pixels = this.read({ x, y, width, height });
    if (pixels.width !== width || pixels.height !== height || pixels.data.length !== width * height * 4) {
      throw new Error("유화 바닥 타일을 완전하게 읽지 못했습니다.");
    }
    const tile = { x, y, width, height, data: pixels.data };
    this.tiles.set(key, tile);
    return tile;
  }
}
