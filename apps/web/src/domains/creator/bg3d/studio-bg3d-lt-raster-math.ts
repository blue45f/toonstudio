/**
 * LT 래스터 단계가 함께 쓰는 작은 수치 도구. DOM·캔버스 없이 타입 배열만 다룬다.
 * `studio-bg3d-lt-render.ts` 와 선 반응 계산 모듈(`studio-bg3d-lt-line-response.ts`)이 순환 import 없이
 * 같은 정의를 쓰도록 분리했다.
 */

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function byteAt(
  rgba: Uint8Array | Uint8ClampedArray,
  pixelIndex: number,
  channel: number
): number {
  return rgba[pixelIndex * 4 + channel] ?? 0;
}

export function clampedIndex(x: number, y: number, width: number, height: number): number {
  return Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x));
}

/** Separable clamped-edge box blur with one image-sized allocation. */
export function boxBlur(
  field: Float32Array,
  width: number,
  height: number,
  radius: number
): Float32Array {
  if (radius < 1) return field;
  const output = new Float32Array(field.length);
  const span = radius * 2 + 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += field[row + Math.min(width - 1, Math.max(0, offset))];
    }
    for (let x = 0; x < width; x += 1) {
      output[row + x] = sum / span;
      const removeX = Math.min(width - 1, Math.max(0, x - radius));
      const addX = Math.min(width - 1, Math.max(0, x + radius + 1));
      sum += field[row + addX] - field[row + removeX];
    }
  }

  const column = new Float32Array(height);
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      sum += output[Math.min(height - 1, Math.max(0, offset)) * width + x];
    }
    for (let y = 0; y < height; y += 1) {
      column[y] = sum / span;
      const removeY = Math.min(height - 1, Math.max(0, y - radius));
      const addY = Math.min(height - 1, Math.max(0, y + radius + 1));
      sum += output[addY * width + x] - output[removeY * width + x];
    }
    for (let y = 0; y < height; y += 1) output[y * width + x] = column[y];
  }
  return output;
}

/** Hermite smoothstep of `(value - threshold) / softness`, clamped to [0, 1]. */
export function smoothResponse(value: number, threshold: number, softness: number): number {
  const normalized = clamp01((value - threshold) / Math.max(0.000_001, softness));
  return normalized * normalized * (3 - 2 * normalized);
}
