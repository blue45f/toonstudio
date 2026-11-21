/**
 * Clip Studio Paint 5.1.5 선택 영역 마스크(`selectexpand`, `selectreduce`, `selectblur`,
 * `selectcolor`, `editclearoutofselectarea`) 및 틈새 닫기·영역 확장 참조 채우기 엔진.
 */

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function clampByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

export function expandCspSelectionMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
  cornerType: "round" | "square" = "round",
): Uint8Array {
  const r = clamp(Math.round(radiusPx), 1, 32);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let maxV = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -r; dx <= r; dx += 1) {
          if (cornerType === "round" && dx * dx + dy * dy > r * r) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const v = mask[ny * width + nx] ?? 0;
          if (v > maxV) maxV = v;
        }
      }
      out[y * width + x] = maxV;
    }
  }
  return out;
}

export function shrinkCspSelectionMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
  cornerType: "round" | "square" = "round",
): Uint8Array {
  const r = clamp(Math.round(radiusPx), 1, 32);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let minV = 255;
      for (let dy = -r; dy <= r; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          minV = 0;
          continue;
        }
        for (let dx = -r; dx <= r; dx += 1) {
          if (cornerType === "round" && dx * dx + dy * dy > r * r) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            minV = 0;
            continue;
          }
          const v = mask[ny * width + nx] ?? 0;
          if (v < minV) minV = v;
        }
      }
      out[y * width + x] = minV;
    }
  }
  return out;
}

export function borderCspSelectionMask(
  mask: Uint8Array,
  width: number,
  height: number,
  borderWidthPx: number,
): Uint8Array {
  const half = Math.max(1, Math.round(borderWidthPx * 0.5));
  const dilated = expandCspSelectionMask(mask, width, height, half, "round");
  const eroded = shrinkCspSelectionMask(mask, width, height, half, "round");
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i += 1) {
    out[i] = Math.max(0, dilated[i]! - eroded[i]!);
  }
  return out;
}

export function featherCspSelectionMask(
  mask: Uint8Array,
  width: number,
  height: number,
  radiusPx: number,
): Uint8Array {
  const r = clamp(Math.round(radiusPx), 1, 16);
  const temp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let cnt = 0;
      for (let dx = -r; dx <= r; dx += 1) {
        const nx = clamp(x + dx, 0, width - 1);
        sum += mask[y * width + nx] ?? 0;
        cnt += 1;
      }
      temp[y * width + x] = clampByte(sum / cnt);
    }
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let cnt = 0;
      for (let dy = -r; dy <= r; dy += 1) {
        const ny = clamp(y + dy, 0, height - 1);
        sum += temp[ny * width + x] ?? 0;
        cnt += 1;
      }
      out[y * width + x] = clampByte(sum / cnt);
    }
  }
  return out;
}

export function selectCspColorGamut(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  targetRgb: readonly [number, number, number],
  tolerance: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const tol = clamp(tolerance, 0, 255);
  for (let i = 0; i < width * height; i += 1) {
    const idx = i * 4;
    if ((rgba[idx + 3] ?? 0) === 0) continue;
    const d = Math.max(
      Math.abs((rgba[idx] ?? 0) - targetRgb[0]),
      Math.abs((rgba[idx + 1] ?? 0) - targetRgb[1]),
      Math.abs((rgba[idx + 2] ?? 0) - targetRgb[2]),
    );
    if (d <= tol) mask[i] = 255;
  }
  return mask;
}

export function eraseOutsideCspSelection(
  rgba: Uint8ClampedArray,
  selectionMask: Uint8Array,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba);
  for (let i = 0; i < selectionMask.length; i += 1) {
    const m = (selectionMask[i] ?? 0) / 255;
    out[i * 4 + 3] = clampByte((out[i * 4 + 3] ?? 0) * m);
  }
  return out;
}

/**
 * 참조 레이어 + 틈새 닫기(`FillCloseGap`) + 영역 확대(`FillExpandLength`) 스마트 채우기.
 */
export function floodFillCspWithCloseGapAndExpand(params: {
  readonly targetRgba: Uint8ClampedArray;
  readonly referenceLineRgba?: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  readonly seedX: number;
  readonly seedY: number;
  readonly fillColor: readonly [number, number, number, number];
  readonly colorMargin?: number;
  readonly closeGapPx?: number;
  readonly expandPx?: number;
}): {
  readonly rgba: Uint8ClampedArray;
  readonly filledMask: Uint8Array;
  readonly filledPixelCount: number;
} {
  const { width, height } = params;
  const pixelCount = width * height;
  const out = new Uint8ClampedArray(params.targetRgba);
  const filledMask = new Uint8Array(pixelCount);
  const sx = clamp(Math.round(params.seedX), 0, width - 1);
  const sy = clamp(Math.round(params.seedY), 0, height - 1);
  const margin = clamp(params.colorMargin ?? 24, 0, 255);
  const closeGap = clamp(Math.round(params.closeGapPx ?? 0), 0, 12);
  const expandPx = clamp(Math.round(params.expandPx ?? 0), 0, 8);

  let barrier = new Uint8Array(pixelCount);
  if (params.referenceLineRgba) {
    for (let i = 0; i < pixelCount; i += 1) {
      const idx = i * 4;
      const a = params.referenceLineRgba[idx + 3] ?? 0;
      const lum =
        0.299 * (params.referenceLineRgba[idx] ?? 255) +
        0.587 * (params.referenceLineRgba[idx + 1] ?? 255) +
        0.114 * (params.referenceLineRgba[idx + 2] ?? 255);
      if (a > 64 && lum < 160) barrier[i] = 255;
    }
    if (closeGap > 0) {
      const dilated = expandCspSelectionMask(barrier, width, height, closeGap, "round");
      barrier = shrinkCspSelectionMask(dilated, width, height, Math.max(1, closeGap - 1), "round");
    }
  }

  const seedIdx = sy * width + sx;
  if (barrier[seedIdx] === 255) {
    return { rgba: out, filledMask, filledPixelCount: 0 };
  }

  const sr = params.targetRgba[seedIdx * 4] ?? 0;
  const sg = params.targetRgba[seedIdx * 4 + 1] ?? 0;
  const sb = params.targetRgba[seedIdx * 4 + 2] ?? 0;
  const sa = params.targetRgba[seedIdx * 4 + 3] ?? 0;

  const visited = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let head = 0;
  let tail = 0;
  queue[tail++] = seedIdx;
  visited[seedIdx] = 1;

  while (head < tail) {
    const curr = queue[head++]!;
    filledMask[curr] = 255;
    const cx = curr % width;
    const cy = Math.floor(curr / width);
    const neighbors = [
      cx > 0 ? curr - 1 : -1,
      cx + 1 < width ? curr + 1 : -1,
      cy > 0 ? curr - width : -1,
      cy + 1 < height ? curr + width : -1,
    ];
    for (const next of neighbors) {
      if (next < 0 || visited[next] === 1 || barrier[next] === 255) continue;
      const nIdx = next * 4;
      const diff = Math.max(
        Math.abs((params.targetRgba[nIdx] ?? 0) - sr),
        Math.abs((params.targetRgba[nIdx + 1] ?? 0) - sg),
        Math.abs((params.targetRgba[nIdx + 2] ?? 0) - sb),
        Math.abs((params.targetRgba[nIdx + 3] ?? 0) - sa),
      );
      if (diff <= margin) {
        visited[next] = 1;
        queue[tail++] = next;
      }
    }
  }

  const finalMask =
    expandPx > 0 ? expandCspSelectionMask(filledMask, width, height, expandPx, "round") : filledMask;
  let filledPixelCount = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    if (finalMask[i] === 0) continue;
    filledPixelCount += 1;
    const idx = i * 4;
    out[idx] = params.fillColor[0];
    out[idx + 1] = params.fillColor[1];
    out[idx + 2] = params.fillColor[2];
    out[idx + 3] = params.fillColor[3];
  }
  return { rgba: out, filledMask: finalMask, filledPixelCount };
}
