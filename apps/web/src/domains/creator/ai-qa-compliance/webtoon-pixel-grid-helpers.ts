/**
 * 웹툰 픽셀 아티팩트 헌터용 2D 래스터 마스크 · 연결 요소 · 색상 샘플링 유틸리티
 * (외부 의존성 0 · 브라우저/Node 동일 결정론 동작)
 */

const NEIGHBOR_4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function computeExteriorMask(
  width: number,
  height: number,
  lineArtMask: Uint8Array,
): Uint8Array {
  const total = width * height;
  const exterior = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const enqueueIfPassable = (x: number, y: number): void => {
    const idx = y * width + x;
    if (exterior[idx] === 1 || lineArtMask[idx] === 1) return;
    exterior[idx] = 1;
    queue[tail] = idx;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfPassable(x, 0);
    enqueueIfPassable(x, height - 1);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfPassable(0, y);
    enqueueIfPassable(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head];
    head += 1;
    const cx = idx % width;
    const cy = Math.floor(idx / width);
    for (const [dx, dy] of NEIGHBOR_4) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      enqueueIfPassable(nx, ny);
    }
  }
  return exterior;
}

export function isNearWhiteOrEmpty(
  rgba: Uint8ClampedArray,
  idx: number,
  alphaThreshold: number,
  whiteThreshold: number,
): boolean {
  const off = idx * 4;
  if (rgba[off + 3] < alphaThreshold) return true;
  return (
    rgba[off] >= whiteThreshold &&
    rgba[off + 1] >= whiteThreshold &&
    rgba[off + 2] >= whiteThreshold
  );
}

export function touchesLineArtWithinDistance(
  indices: readonly number[],
  width: number,
  height: number,
  lineArtMask: Uint8Array,
  radius: number,
): boolean {
  for (const idx of indices) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (lineArtMask[ny * width + nx] === 1) return true;
      }
    }
  }
  return false;
}

export function sampleSurroundingInteriorColor(
  indices: readonly number[],
  width: number,
  height: number,
  lineArtMask: Uint8Array,
  rgba: Uint8ClampedArray,
  alphaThreshold: number,
  whiteThreshold: number,
): readonly [number, number, number, number] {
  const memberSet = new Set(indices);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let samples = 0;

  for (const idx of indices) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    for (const [dx, dy] of NEIGHBOR_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (memberSet.has(nIdx) || lineArtMask[nIdx] === 1) continue;
      if (!isNearWhiteOrEmpty(rgba, nIdx, alphaThreshold, whiteThreshold)) {
        const off = nIdx * 4;
        rSum += rgba[off];
        gSum += rgba[off + 1];
        bSum += rgba[off + 2];
        samples += 1;
      }
    }
  }
  if (samples === 0) return [214, 178, 152, 255];
  return [Math.round(rSum / samples), Math.round(gSum / samples), Math.round(bSum / samples), 255];
}

export function collectConnectedComponents(
  flagMask: Uint8Array,
  width: number,
  height: number,
): readonly (readonly number[])[] {
  const total = width * height;
  const visited = new Uint8Array(total);
  const clusters: number[][] = [];
  const queue = new Int32Array(total);

  for (let i = 0; i < total; i += 1) {
    if (flagMask[i] === 0 || visited[i] === 1) continue;
    visited[i] = 1;
    let head = 0;
    let tail = 0;
    queue[tail] = i;
    tail += 1;
    const members: number[] = [];

    while (head < tail) {
      const cur = queue[head];
      head += 1;
      members.push(cur);
      const cx = cur % width;
      const cy = Math.floor(cur / width);
      for (const [dx, dy] of NEIGHBOR_4) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (flagMask[nIdx] === 1 && visited[nIdx] === 0) {
          visited[nIdx] = 1;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }
    clusters.push(members);
  }
  return clusters;
}

export function summarizeClusterGeometry(indices: readonly number[], width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;
  for (const idx of indices) {
    const x = idx % width;
    const y = Math.floor(idx / width);
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    sumX += x;
    sumY += y;
  }
  const pinX = Math.round(sumX / indices.length);
  const pinY = Math.round(sumY / indices.length);
  return {
    pinX,
    pinY,
    pinXNorm: Number(((pinX + 0.5) / Math.max(1, width)).toFixed(3)),
    pinYNorm: Number(((pinY + 0.5) / Math.max(1, height)).toFixed(3)),
    bounds: { minX, minY, maxX, maxY },
  };
}
