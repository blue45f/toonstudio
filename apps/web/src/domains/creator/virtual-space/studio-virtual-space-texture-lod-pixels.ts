/**
 * 텍스처 LOD의 픽셀 파이프라인(순수 함수, Phaser·DOM 의존 없음).
 *
 * 프리멀티플라이드 RGBA8 이미지를 Lanczos3(2:1)로 반감하고, 칸(프레임)마다 따로 줄여 한 장의 LOD 이미지로 모은다.
 * 메인 스레드와 Web Worker가 같은 코드를 쓴다(작업이 수십 ms 걸리는 큰 시트는 워커에서 돌린다).
 */

/** 프리멀티플라이드 RGBA8 이미지(행 우선). */
export interface StudioRgbaImage {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
}

/** 한 칸(프레임)의 원본 픽셀 영역. */
export interface StudioLodCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 직선 알파 RGBA를 프리멀티플라이드로 바꾼다(필터링은 프리멀티플라이드에서 해야 가장자리가 어둡게 번지지 않는다). */
export function studioPremultiplyRgba(data: ArrayLike<number>, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let index = 0; index < out.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha === 0) continue;
    if (alpha === 255) {
      out[index] = data[index]; out[index + 1] = data[index + 1]; out[index + 2] = data[index + 2]; out[index + 3] = 255;
      continue;
    }
    out[index] = (data[index] * alpha + 127) / 255 | 0;
    out[index + 1] = (data[index + 1] * alpha + 127) / 255 | 0;
    out[index + 2] = (data[index + 2] * alpha + 127) / 255 | 0;
    out[index + 3] = alpha;
  }
  return out;
}

const WEIGHT_SHIFT = 14;
const HALF_TAPS = 6;

/** 2:1 Lanczos3(a=3) 대칭 가중치. 출력 화소 중심에서 ±0.5, ±1.5 … ±5.5 원본 화소의 가중치이고, 합은 정확히 1<<14다. */
export const STUDIO_LANCZOS_HALF_WEIGHTS: Int32Array = (() => {
  const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
  const lanczos = (x: number) => (Math.abs(x) < 3 ? sinc(x) * sinc(x / 3) : 0);
  const raw = Array.from({ length: HALF_TAPS }, (_, index) => lanczos((index + 0.5) / 2));
  const total = raw.reduce((sum, value) => sum + value, 0) * 2;
  const weights = Int32Array.from(raw, (value) => Math.round((value / total) * (1 << WEIGHT_SHIFT)));
  let sum = 0;
  for (const weight of weights) sum += weight * 2;
  weights[0] += ((1 << WEIGHT_SHIFT) - sum) / 2;
  return weights;
})();

const clampByte = (value: number): number => (value < 0 ? 0 : value > 255 ? 255 : value);

/**
 * 프리멀티플라이드 RGBA 이미지를 가로·세로 절반으로 줄인다(Lanczos3, 가장자리는 바깥으로 복제).
 * 가로 패스와 세로 패스 사이에서 한 번 양보한다(시간 예산을 나눠 쓰는 호출자용). 홀수 크기는 올림한다.
 */
export function* studioHalveRgbaStages(image: StudioRgbaImage): Generator<void, StudioRgbaImage> {
  const { data, width, height } = image;
  const outWidth = (width + 1) >> 1;
  const outHeight = (height + 1) >> 1;
  const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0, a5 = 0] = STUDIO_LANCZOS_HALF_WEIGHTS;
  const round = 1 << (WEIGHT_SHIFT - 1);
  const horizontal = new Uint8Array(outWidth * height * 4);
  const last = width - 1;
  for (let y = 0; y < height; y += 1) {
    const row = y * width * 4;
    for (let x = 0; x < outWidth; x += 1) {
      const center = 2 * x;
      const m0 = row + center * 4, p0 = row + Math.min(last, center + 1) * 4;
      const m1 = row + Math.max(0, center - 1) * 4, p1 = row + Math.min(last, center + 2) * 4;
      const m2 = row + Math.max(0, center - 2) * 4, p2 = row + Math.min(last, center + 3) * 4;
      const m3 = row + Math.max(0, center - 3) * 4, p3 = row + Math.min(last, center + 4) * 4;
      const m4 = row + Math.max(0, center - 4) * 4, p4 = row + Math.min(last, center + 5) * 4;
      const m5 = row + Math.max(0, center - 5) * 4, p5 = row + Math.min(last, center + 6) * 4;
      const target = (y * outWidth + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const sum = a0 * (data[m0 + channel] + data[p0 + channel]) + a1 * (data[m1 + channel] + data[p1 + channel])
          + a2 * (data[m2 + channel] + data[p2 + channel]) + a3 * (data[m3 + channel] + data[p3 + channel])
          + a4 * (data[m4 + channel] + data[p4 + channel]) + a5 * (data[m5 + channel] + data[p5 + channel]);
        horizontal[target + channel] = clampByte((sum + round) >> WEIGHT_SHIFT);
      }
    }
  }
  yield;
  const out = new Uint8Array(outWidth * outHeight * 4);
  const stride = outWidth * 4;
  const lastRow = height - 1;
  for (let y = 0; y < outHeight; y += 1) {
    const center = 2 * y;
    const m0 = center * stride, p0 = Math.min(lastRow, center + 1) * stride;
    const m1 = Math.max(0, center - 1) * stride, p1 = Math.min(lastRow, center + 2) * stride;
    const m2 = Math.max(0, center - 2) * stride, p2 = Math.min(lastRow, center + 3) * stride;
    const m3 = Math.max(0, center - 3) * stride, p3 = Math.min(lastRow, center + 4) * stride;
    const m4 = Math.max(0, center - 4) * stride, p4 = Math.min(lastRow, center + 5) * stride;
    const m5 = Math.max(0, center - 5) * stride, p5 = Math.min(lastRow, center + 6) * stride;
    const base = y * stride;
    for (let offset = 0; offset < stride; offset += 1) {
      const sum = a0 * (horizontal[m0 + offset] + horizontal[p0 + offset]) + a1 * (horizontal[m1 + offset] + horizontal[p1 + offset])
        + a2 * (horizontal[m2 + offset] + horizontal[p2 + offset]) + a3 * (horizontal[m3 + offset] + horizontal[p3 + offset])
        + a4 * (horizontal[m4 + offset] + horizontal[p4 + offset]) + a5 * (horizontal[m5 + offset] + horizontal[p5 + offset]);
      out[base + offset] = clampByte((sum + round) >> WEIGHT_SHIFT);
    }
  }
  // 프리멀티플라이드 제약: 필터의 음수 엽이 알파를 넘겨 색이 알파보다 커지면 가장자리에 밝은 테가 생긴다.
  for (let index = 0; index < out.length; index += 4) {
    const alpha = out[index + 3];
    if (out[index] > alpha) out[index] = alpha;
    if (out[index + 1] > alpha) out[index + 1] = alpha;
    if (out[index + 2] > alpha) out[index + 2] = alpha;
  }
  return { data: out, width: outWidth, height: outHeight };
}

function runToEnd<T>(stages: Generator<void, T>): T {
  for (;;) {
    const step = stages.next();
    if (step.done) return step.value;
  }
}

/** 동기 반감(테스트·작은 이미지용). */
export function studioHalveRgba(image: StudioRgbaImage): StudioRgbaImage {
  return runToEnd(studioHalveRgbaStages(image));
}

/**
 * 칸을 level 단계 반감의 블록 격자(2^level 배수)에 맞춰 꺼낸다. 칸 가장자리 밖은 이웃 칸이 아니라 칸 자신의 가장자리 픽셀을 복제해 채우므로,
 * 반감한 사본의 화소 j는 원본 [j·2^level, (j+1)·2^level)에 정확히 대응해 UV가 어긋나지 않고 이웃 칸의 그림도 섞이지 않는다.
 */
function extractAlignedCell(image: StudioRgbaImage, cell: StudioLodCell, scale: number): { readonly image: StudioRgbaImage; readonly originX: number; readonly originY: number } | null {
  const x0 = Math.max(0, Math.floor(cell.x)), y0 = Math.max(0, Math.floor(cell.y));
  const x1 = Math.min(image.width, Math.ceil(cell.x + cell.width)), y1 = Math.min(image.height, Math.ceil(cell.y + cell.height));
  if (x1 <= x0 || y1 <= y0) return null;
  const ax0 = Math.floor(x0 / scale) * scale, ay0 = Math.floor(y0 / scale) * scale;
  const ax1 = Math.ceil(x1 / scale) * scale, ay1 = Math.ceil(y1 / scale) * scale;
  const width = ax1 - ax0, height = ay1 - ay0;
  const data = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = Math.min(y1 - 1, Math.max(y0, ay0 + row));
    for (let column = 0; column < width; column += 1) {
      const sourceColumn = Math.min(x1 - 1, Math.max(x0, ax0 + column));
      const from = (sourceRow * image.width + sourceColumn) * 4;
      data.set(image.data.subarray(from, from + 4), (row * width + column) * 4);
    }
  }
  return { image: { data, width, height }, originX: ax0 / scale, originY: ay0 / scale };
}

/** 칸 사각형이 이 정도(px)까지 겹치는 것은 허용한다. 아이템마다 알파 외곽으로 딱 잘라 만든 시트는 이웃 칸의 사각형이 몇 픽셀 걸치지만 그림은 겹치지 않는다. */
export const STUDIO_LOD_CELL_OVERLAP_TOLERANCE = 8;

/** 칸 영역이 서로 tolerance 픽셀을 넘게 겹치면(예: 겹쳐 잘라 쓰는 아틀라스) 칸별 독립 축소가 성립하지 않는다. */
export function studioLodCellsOverlap(cells: readonly StudioLodCell[], tolerance = STUDIO_LOD_CELL_OVERLAP_TOLERANCE): boolean {
  for (let first = 0; first < cells.length; first += 1) {
    const a = cells[first];
    if (!a) continue;
    for (let second = first + 1; second < cells.length; second += 1) {
      const b = cells[second];
      if (!b) continue;
      const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (overlapX > tolerance && overlapY > tolerance) return true;
    }
  }
  return false;
}

/**
 * 칸마다 따로 level번 반감해 하나의 LOD 이미지로 모은다. 칸 경계 밖 픽셀은 읽지 않으므로(가장자리 복제) 이웃 칸의 그림이 번지지 않는다.
 * 칸은 반감 블록 격자에 맞춰 놓여 사본 화소 j가 원본 [j·2^level, (j+1)·2^level)에 대응하므로 UV(0~1)가 그대로 맞는다.
 * 블록 하나에 두 칸이 걸치는 경계 화소는 알파가 더 큰 쪽이 가진다(그림이 경계에서 끊기는 것보다 1화소 번지는 편이 덜 거슬린다).
 */
export function* studioLodImageStages(base: StudioRgbaImage, cells: readonly StudioLodCell[], level: number): Generator<void, StudioRgbaImage> {
  const scale = 2 ** level;
  const width = Math.max(1, Math.ceil(base.width / scale));
  const height = Math.max(1, Math.ceil(base.height / scale));
  const out = new Uint8Array(width * height * 4);
  for (const cell of cells) {
    const aligned = extractAlignedCell(base, cell, scale);
    if (!aligned) continue;
    let part = aligned.image;
    for (let step = 0; step < level; step += 1) part = yield* studioHalveRgbaStages(part);
    for (let row = 0; row < part.height; row += 1) {
      const y = aligned.originY + row;
      if (y >= height) break;
      for (let column = 0; column < part.width; column += 1) {
        const x = aligned.originX + column;
        if (x >= width) break;
        const from = (row * part.width + column) * 4, to = (y * width + x) * 4;
        if (part.data[from + 3] <= out[to + 3] && out[to + 3] > 0) continue;
        out[to] = part.data[from]; out[to + 1] = part.data[from + 1]; out[to + 2] = part.data[from + 2]; out[to + 3] = part.data[from + 3];
      }
    }
    yield;
  }
  return { data: out, width, height };
}
