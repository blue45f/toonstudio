/**
 * Barnes et al. PatchMatch 피라미드 다운샘플링·경계 내부 확산·유효 패치 마스크·
 * 가중 패치 투표(Weighted Patch Voting) 보조 커널.
 */

const GAUSS_5 = [1, 4, 6, 4, 1] as const;

export function clampPatchInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clampPatchByte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

/** 결정적 Mulberry32 PRNG (Math.random 미사용). */
export function createPatchMatchPrng(seed: number): () => number {
  let state = (Math.trunc(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeBinaryMask(
  raw: Uint8Array | Uint8ClampedArray | undefined,
  total: number,
): Uint8Array {
  const out = new Uint8Array(total);
  if (!raw) return out;
  const len = Math.min(total, raw.length);
  for (let i = 0; i < len; i += 1) {
    if ((raw[i] ?? 0) > 0) out[i] = 1;
  }
  return out;
}

export function downsampleRgba2x(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): { readonly width: number; readonly height: number; readonly rgba: Uint8ClampedArray } {
  const nw = Math.max(1, Math.floor(width / 2));
  const nh = Math.max(1, Math.floor(height / 2));
  const horiz = new Float32Array(nw * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let nx = 0; nx < nw; nx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -2; k <= 2; k += 1) {
        const sx = clampPatchInt(nx * 2 + k, 0, width - 1);
        const off = (y * width + sx) * 4;
        const w = GAUSS_5[k + 2]!;
        r += rgba[off]! * w;
        g += rgba[off + 1]! * w;
        b += rgba[off + 2]! * w;
        a += rgba[off + 3]! * w;
      }
      const dst = (y * nw + nx) * 4;
      horiz[dst] = r / 16;
      horiz[dst + 1] = g / 16;
      horiz[dst + 2] = b / 16;
      horiz[dst + 3] = a / 16;
    }
  }

  const out = new Uint8ClampedArray(nw * nh * 4);
  for (let ny = 0; ny < nh; ny += 1) {
    for (let nx = 0; nx < nw; nx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let k = -2; k <= 2; k += 1) {
        const sy = clampPatchInt(ny * 2 + k, 0, height - 1);
        const off = (sy * nw + nx) * 4;
        const w = GAUSS_5[k + 2]!;
        r += horiz[off]! * w;
        g += horiz[off + 1]! * w;
        b += horiz[off + 2]! * w;
        a += horiz[off + 3]! * w;
      }
      const dst = (ny * nw + nx) * 4;
      out[dst] = clampPatchByte(r / 16);
      out[dst + 1] = clampPatchByte(g / 16);
      out[dst + 2] = clampPatchByte(b / 16);
      out[dst + 3] = clampPatchByte(a / 16);
    }
  }
  return { width: nw, height: nh, rgba: out };
}

export function downsampleMask2x(
  mask: Uint8Array,
  w: number,
  h: number,
  nw: number,
  nh: number,
): Uint8Array {
  const out = new Uint8Array(nw * nh);
  for (let ny = 0; ny < nh; ny += 1) {
    const y0 = ny * 2;
    const y1 = Math.min(h - 1, y0 + 1);
    for (let nx = 0; nx < nw; nx += 1) {
      const x0 = nx * 2;
      const x1 = Math.min(w - 1, x0 + 1);
      const hit = mask[y0 * w + x0]! | mask[y0 * w + x1]! | mask[y1 * w + x0]! | mask[y1 * w + x1]!;
      out[ny * nw + nx] = hit > 0 ? 1 : 0;
    }
  }
  return out;
}

/** 구멍 외곽 유효 픽셀에서 안쪽으로 확산해 코어스 레벨 초기 색을 채운다. */
export function diffuseHoleInward(
  rgba: Uint8ClampedArray,
  hole: Uint8Array,
  exclude: Uint8Array,
  width: number,
  height: number,
): void {
  const total = width * height;
  const known = new Uint8Array(total);
  let remaining = 0;
  let hasKnown = false;
  for (let i = 0; i < total; i += 1) {
    if (hole[i] === 0 && exclude[i] === 0) {
      known[i] = 1;
      hasKnown = true;
    } else if (hole[i] === 1) {
      remaining += 1;
    }
  }
  if (remaining === total) return;
  if (!hasKnown) {
    for (let i = 0; i < total; i += 1) {
      if (hole[i] === 0) known[i] = 1;
    }
  }

  const frontier: number[] = [];
  let guard = Math.max(width, height) + 4;
  while (remaining > 0 && guard > 0) {
    guard -= 1;
    frontier.length = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const p = y * width + x;
        if (known[p] === 1 || hole[p] === 0) continue;
        if (
          (x > 0 && known[p - 1] === 1) ||
          (x + 1 < width && known[p + 1] === 1) ||
          (y > 0 && known[p - width] === 1) ||
          (y + 1 < height && known[p + width] === 1)
        ) {
          frontier.push(p);
        }
      }
    }
    if (frontier.length === 0) break;

    for (let i = 0; i < frontier.length; i += 1) {
      const p = frontier[i]!;
      const x = p % width;
      const y = (p - x) / width;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let cnt = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const np = ny * width + nx;
          if (known[np] === 0) continue;
          const off = np * 4;
          r += rgba[off]!;
          g += rgba[off + 1]!;
          b += rgba[off + 2]!;
          a += rgba[off + 3]!;
          cnt += 1;
        }
      }
      if (cnt > 0) {
        const off = p * 4;
        rgba[off] = clampPatchByte(r / cnt);
        rgba[off + 1] = clampPatchByte(g / cnt);
        rgba[off + 2] = clampPatchByte(b / cnt);
        rgba[off + 3] = clampPatchByte(a / cnt);
      }
    }
    for (let i = 0; i < frontier.length; i += 1) {
      known[frontier[i]!] = 1;
      remaining -= 1;
    }
  }
}

/** 패치 전체가 마스크/제외 영역 바깥에 놓인 유효 소스 패치 맵과 인덱스 목록을 구축한다. */
export function buildValidSourcePatches(
  hole: Uint8Array,
  exclude: Uint8Array,
  width: number,
  height: number,
  patchRadius: number,
): { readonly validMask: Uint8Array; readonly validIndices: Int32Array } {
  const validMask = new Uint8Array(width * height);
  const indices: number[] = [];

  for (let y = patchRadius; y < height - patchRadius; y += 1) {
    for (let x = patchRadius; x < width - patchRadius; x += 1) {
      let ok = true;
      for (let dy = -patchRadius; dy <= patchRadius && ok; dy += 1) {
        const row = (y + dy) * width;
        for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
          const np = row + (x + dx);
          if (hole[np] === 1 || exclude[np] === 1) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        const p = y * width + x;
        validMask[p] = 1;
        indices.push(p);
      }
    }
  }
  return { validMask, validIndices: Int32Array.from(indices) };
}

/** 구멍과 겹치는 패치 중심을 활성 탐색 대상으로 표시한다. */
export function buildTargetPatchMask(
  hole: Uint8Array,
  width: number,
  height: number,
  patchRadius: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = patchRadius; y < height - patchRadius; y += 1) {
    for (let x = patchRadius; x < width - patchRadius; x += 1) {
      let touchesHole = false;
      for (let dy = -patchRadius; dy <= patchRadius && !touchesHole; dy += 1) {
        const row = (y + dy) * width;
        for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
          if (hole[row + (x + dx)] === 1) {
            touchesHole = true;
            break;
          }
        }
      }
      if (touchesHole) out[y * width + x] = 1;
    }
  }
  return out;
}

/** 두 `(2r+1)×(2r+1)` 패치 간 정규화 RGB SSD 거리를 계산한다. */
export function computePatchSsd(
  rgba: Uint8ClampedArray,
  hole: Uint8Array,
  width: number,
  tx: number,
  ty: number,
  sx: number,
  sy: number,
  patchRadius: number,
  holeWeight: number,
): number {
  let sum = 0;
  let weightSum = 0;
  for (let dy = -patchRadius; dy <= patchRadius; dy += 1) {
    const tRow = (ty + dy) * width;
    const sRow = (sy + dy) * width;
    for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
      const tp = tRow + (tx + dx);
      const sp = sRow + (sx + dx);
      const w = hole[tp] === 1 ? holeWeight : 1;
      const tOff = tp * 4;
      const sOff = sp * 4;
      const dr = rgba[tOff]! - rgba[sOff]!;
      const dg = rgba[tOff + 1]! - rgba[sOff + 1]!;
      const db = rgba[tOff + 2]! - rgba[sOff + 2]!;
      sum += (dr * dr + dg * dg + db * db) * w;
      weightSum += w;
    }
  }
  return weightSum > 1e-6 ? sum / weightSum : sum;
}

/** 다중 중첩 패치의 지수 가중 투표로 구멍 픽셀 색을 재합성한다. */
export function voteHolePixelsFromNnf(
  rgba: Uint8ClampedArray,
  hole: Uint8Array,
  targetPatchMask: Uint8Array,
  nnfX: Int32Array,
  nnfY: Int32Array,
  nnfDist: Float32Array,
  width: number,
  height: number,
  patchRadius: number,
): void {
  const total = width * height;
  const accR = new Float32Array(total);
  const accG = new Float32Array(total);
  const accB = new Float32Array(total);
  const accA = new Float32Array(total);
  const accW = new Float32Array(total);

  let distSum = 0;
  let distCount = 0;
  for (let p = 0; p < total; p += 1) {
    if (targetPatchMask[p] === 1 && Number.isFinite(nnfDist[p]!)) {
      distSum += nnfDist[p]!;
      distCount += 1;
    }
  }
  const meanDist = distCount > 0 ? distSum / distCount : 1;
  const invTwoSigmaSq = 1 / Math.max(16, meanDist * 1.25);

  for (let ty = patchRadius; ty < height - patchRadius; ty += 1) {
    for (let tx = patchRadius; tx < width - patchRadius; tx += 1) {
      const tp = ty * width + tx;
      if (targetPatchMask[tp] !== 1) continue;
      const sx = nnfX[tp]!;
      const sy = nnfY[tp]!;
      if (sx < patchRadius || sy < patchRadius || sx >= width - patchRadius || sy >= height - patchRadius) {
        continue;
      }
      const w = Math.exp(-nnfDist[tp]! * invTwoSigmaSq) + 1e-5;
      for (let dy = -patchRadius; dy <= patchRadius; dy += 1) {
        const dstRow = (ty + dy) * width;
        const srcRow = (sy + dy) * width;
        for (let dx = -patchRadius; dx <= patchRadius; dx += 1) {
          const dp = dstRow + (tx + dx);
          if (hole[dp] !== 1) continue;
          const sOff = (srcRow + (sx + dx)) * 4;
          accR[dp] = accR[dp]! + rgba[sOff]! * w;
          accG[dp] = accG[dp]! + rgba[sOff + 1]! * w;
          accB[dp] = accB[dp]! + rgba[sOff + 2]! * w;
          accA[dp] = accA[dp]! + rgba[sOff + 3]! * w;
          accW[dp] = accW[dp]! + w;
        }
      }
    }
  }

  for (let p = 0; p < total; p += 1) {
    if (hole[p] !== 1) continue;
    const w = accW[p]!;
    if (w <= 0) continue;
    const off = p * 4;
    rgba[off] = clampPatchByte(accR[p]! / w);
    rgba[off + 1] = clampPatchByte(accG[p]! / w);
    rgba[off + 2] = clampPatchByte(accB[p]! / w);
    rgba[off + 3] = clampPatchByte(accA[p]! / w);
  }
}
