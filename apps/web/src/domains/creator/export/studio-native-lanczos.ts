/**
 * ToonStudio 자체 RGBA8 축소기. 외부 이미지 라이브러리 코드를 사용하지 않는다.
 * 3-lobe windowed sinc, 픽셀 중심 좌표, 축소율에 따른 low-pass 폭을 사용한다.
 * 수평 결과는 세로 필터가 참조하는 행만 보관해 전체 float 이미지 할당을 피한다.
 */
export const STUDIO_NATIVE_RESIZE_ROW_CACHE_BYTES = 32 * 1024 * 1024;

export interface StudioNativeResizeOptions {
  /** cache 비활성화·작은 예산 회귀 검증용. 최대값은 32MiB다. */
  readonly rowCacheBytes?: number;
  readonly onScratchUsage?: (usage: { cachedRowsBytes: number; accumulatorBytes: number; currentRowBytes: number }) => void;
}

interface AxisSample {
  readonly first: number;
  readonly weights: Float64Array;
}

function sinc(value: number): number {
  if (Math.abs(value) < 1e-12) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function makeAxisSamples(sourceSize: number, targetSize: number): AxisSample[] {
  if (sourceSize === targetSize) {
    return Array.from({ length: targetSize }, (_, first) => ({
      first,
      weights: new Float64Array([1]),
    }));
  }
  const scale = sourceSize / targetSize;
  const radius = 3 * scale;
  return Array.from({ length: targetSize }, (_, destination) => {
    const centre = (destination + 0.5) * scale - 0.5;
    const first = Math.max(0, Math.ceil(centre - radius));
    const last = Math.min(sourceSize - 1, Math.floor(centre + radius));
    const weights = new Float64Array(last - first + 1);
    let sum = 0;
    for (let source = first; source <= last; source += 1) {
      const distance = (source - centre) / scale;
      const weight = sinc(distance) * sinc(distance / 3);
      weights[source - first] = weight;
      sum += weight;
    }
    // 이미지 밖의 표본은 제외하고 가중치를 정규화해 가장자리 상수색을 보존한다.
    for (let tap = 0; tap < weights.length; tap += 1) weights[tap] /= sum;
    return { first, weights };
  });
}

function assertRaster(
  rgba: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
): void {
  if (!(rgba instanceof Uint8Array)) throw new TypeError("rgba must be RGBA8 Uint8Array.");
  for (const value of [width, height, targetWidth, targetHeight]) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError("Raster dimensions must be positive safe integers.");
  }
  const bytes = width * height * 4;
  if (!Number.isSafeInteger(bytes) || rgba.length !== bytes) throw new RangeError("RGBA8 source byte length does not match dimensions.");
  if (targetWidth > width || targetHeight > height) throw new RangeError("Lanczos export accepts downscale targets only.");
}

function horizontalRow(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceRow: number,
  samples: readonly AxisSample[],
): Float32Array {
  const row = new Float32Array(samples.length * 4);
  for (let x = 0; x < samples.length; x += 1) {
    const sample = samples[x];
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    for (let tap = 0; tap < sample.weights.length; tap += 1) {
      const weight = sample.weights[tap];
      const offset = (sourceRow * sourceWidth + sample.first + tap) * 4;
      const coverage = rgba[offset + 3] / 255;
      const coveredWeight = weight * coverage;
      red += rgba[offset] * coveredWeight;
      green += rgba[offset + 1] * coveredWeight;
      blue += rgba[offset + 2] * coveredWeight;
      alpha += coveredWeight;
    }
    row[x * 4] = red;
    row[x * 4 + 1] = green;
    row[x * 4 + 2] = blue;
    row[x * 4 + 3] = alpha;
  }
  return row;
}

function byte(value: number): number {
  return Math.round(Math.max(0, Math.min(255, value)));
}

function integerShrinkFactor(size: number, target: number): number {
  // 최종 sinc 단계에 적어도 2배의 샘플 여유를 남기는 정수 box prefilter.
  // 정확히 나누어지는 축만 먼저 줄여 마지막 부분 블록의 좌표 드리프트를 피한다.
  let factor = Math.max(1, Math.floor(size / target / 2));
  while (size % factor !== 0) factor -= 1;
  return factor;
}

function boxPrefilter(rgba: Uint8Array, width: number, height: number, xfactor: number, yfactor: number): Uint8Array {
  const targetWidth = width / xfactor;
  const targetHeight = height / yfactor;
  const output = new Uint8Array(targetWidth * targetHeight * 4);
  const area = xfactor * yfactor;
  for (let y = 0; y < targetHeight; y += 1) {
    for (let x = 0; x < targetWidth; x += 1) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let dy = 0; dy < yfactor; dy += 1) {
        for (let dx = 0; dx < xfactor; dx += 1) {
          const offset = ((y * yfactor + dy) * width + x * xfactor + dx) * 4;
          const coverage = rgba[offset + 3];
          red += rgba[offset] * coverage;
          green += rgba[offset + 1] * coverage;
          blue += rgba[offset + 2] * coverage;
          alpha += coverage;
        }
      }
      const outputOffset = (y * targetWidth + x) * 4;
      if (alpha > 0) {
        output[outputOffset] = byte(red / alpha);
        output[outputOffset + 1] = byte(green / alpha);
        output[outputOffset + 2] = byte(blue / alpha);
      }
      output[outputOffset + 3] = byte(alpha / area);
    }
  }
  return output;
}

/** 직선 알파 RGBA8 입력을 프리멀티플라이해 필터링하고 정확한 요청 크기로 반환한다. */
export function resizeStudioRgbaLanczos3(
  rgba: Uint8Array,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  options: StudioNativeResizeOptions = {},
): Uint8Array {
  assertRaster(rgba, width, height, targetWidth, targetHeight);
  if (width === targetWidth && height === targetHeight) return new Uint8Array(rgba);
  const xfactor = integerShrinkFactor(width, targetWidth);
  const yfactor = integerShrinkFactor(height, targetHeight);
  if (xfactor > 1 || yfactor > 1) {
    rgba = boxPrefilter(rgba, width, height, xfactor, yfactor);
    width /= xfactor;
    height /= yfactor;
  }
  const horizontal = makeAxisSamples(width, targetWidth);
  const vertical = makeAxisSamples(height, targetHeight);
  const cacheBudget = options.rowCacheBytes ?? STUDIO_NATIVE_RESIZE_ROW_CACHE_BYTES;
  if (!Number.isSafeInteger(cacheBudget) || cacheBudget < 0 || cacheBudget > STUDIO_NATIVE_RESIZE_ROW_CACHE_BYTES) {
    throw new RangeError("Horizontal row cache budget must be between 0 and 32MiB.");
  }
  const rows = new Map<number, Float32Array>();
  let cachedRowsBytes = 0;
  const output = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y += 1) {
    const sample = vertical[y];
    for (const [index, row] of rows) {
      if (index < sample.first) {
        rows.delete(index);
        cachedRowsBytes -= row.byteLength;
      }
    }
    // 세로 support가 원본 전체 높이인 비등방 축소도 한 출력 행으로 누적한다.
    // 수직 tap을 바깥 루프로 옮겨 모든 수평 행을 동시에 붙잡지 않는다.
    const sums = new Float64Array(targetWidth * 4);
    for (let tap = 0; tap < sample.weights.length; tap += 1) {
      const rowIndex = sample.first + tap;
      let row = rows.get(rowIndex);
      if (!row) {
        row = horizontalRow(rgba, width, rowIndex, horizontal);
        if (row.byteLength <= cacheBudget) {
          while (cachedRowsBytes + row.byteLength > cacheBudget) {
            const oldest = rows.entries().next().value;
            if (!oldest) break;
            rows.delete(oldest[0]);
            cachedRowsBytes -= oldest[1].byteLength;
          }
          rows.set(rowIndex, row);
          cachedRowsBytes += row.byteLength;
        }
      }
      const weight = sample.weights[tap];
      for (let column = 0; column < sums.length; column += 1) sums[column] += row[column] * weight;
      options.onScratchUsage?.({ cachedRowsBytes, accumulatorBytes: sums.byteLength, currentRowBytes: row.byteLength });
    }
    for (let x = 0; x < targetWidth; x += 1) {
      const column = x * 4;
      const red = sums[column];
      const green = sums[column + 1];
      const blue = sums[column + 2];
      const alpha = sums[column + 3];
      const offset = (y * targetWidth + x) * 4;
      // 음의 sinc lobe는 alpha를 범위 밖으로 밀 수 있다. 완전 투명은 RGB도 0으로 고정한다.
      const alphaByte = byte(alpha * 255);
      if (alphaByte > 0 && alpha > 0) {
        output[offset] = byte(red / alpha);
        output[offset + 1] = byte(green / alpha);
        output[offset + 2] = byte(blue / alpha);
      }
      output[offset + 3] = alphaByte;
    }
  }
  return output;
}
