/**
 * See-Through 가려진 레이어 구멍 복원을 위한 다중스케일 가우시안 피라미드 + 등위선 이방성 디퓨전 +
 * 방향성 패치 합성 인페인팅 커널 및 RGBA 영상 유사도 측정기.
 */

export interface RgbaImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface SeeThroughInpaintOptions {
  readonly pyramidScales?: number;
  readonly diffusionIterations?: number;
  readonly patchRadius?: number;
  readonly structureStrength?: number;
}

export interface InpaintedRegionResult {
  readonly image: RgbaImageBuffer;
  readonly holePixelCount: number;
  readonly restoredPixelCount: number;
  readonly remainingHolePixels: number;
  readonly restorationRate: number;
  readonly scalesUsed: number;
}

export interface ImageSimilarityMetrics {
  readonly mae: number;
  readonly rmse: number;
  readonly psnrDb: number;
  readonly maxChannelDiff: number;
}

export function assertValidRgbaImage(image: RgbaImageBuffer): void {
  if (!Number.isInteger(image.width) || image.width <= 0) {
    throw new Error(`유효하지 않은 이미지 width입니다: ${image.width}`);
  }
  if (!Number.isInteger(image.height) || image.height <= 0) {
    throw new Error(`유효하지 않은 이미지 height입니다: ${image.height}`);
  }
  const expectedLength = image.width * image.height * 4;
  if (image.data.length !== expectedLength) {
    throw new Error(`RGBA 버퍼 길이(${image.data.length})가 width*height*4(${expectedLength})와 다릅니다.`);
  }
}

export function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}

export function computeRgbLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function computeRgbDistance(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

export function computeSobelMagnitude(image: RgbaImageBuffer): Float32Array {
  const { width, height, data } = image;
  const count = width * height;
  const luma = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    luma[i] = computeRgbLuminance(data[p], data[p + 1], data[p + 2]);
  }
  const mag = new Float32Array(count);
  for (let y = 0; y < height; y += 1) {
    const ym1 = Math.max(0, y - 1);
    const yp1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x += 1) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(width - 1, x + 1);
      const tl = luma[ym1 * width + xm1];
      const tc = luma[ym1 * width + x];
      const tr = luma[ym1 * width + xp1];
      const ml = luma[y * width + xm1];
      const mr = luma[y * width + xp1];
      const bl = luma[yp1 * width + xm1];
      const bc = luma[yp1 * width + x];
      const br = luma[yp1 * width + xp1];
      const dx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const dy = -tl - 2 * tc - tr + bl + 2 * bc + br;
      mag[y * width + x] = Math.sqrt(dx * dx + dy * dy);
    }
  }
  return mag;
}

function downsampleForPyramid(
  rgb: Float32Array,
  valid: Float32Array,
  width: number,
  height: number,
): { width: number; height: number; rgb: Float32Array; valid: Float32Array } {
  const nextW = Math.max(1, Math.ceil(width / 2));
  const nextH = Math.max(1, Math.ceil(height / 2));
  const nextRgb = new Float32Array(nextW * nextH * 3);
  const nextValid = new Float32Array(nextW * nextH);

  for (let ny = 0; ny < nextH; ny += 1) {
    for (let nx = 0; nx < nextW; nx += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let weightSum = 0;
      for (let oy = 0; oy < 2; oy += 1) {
        const sy = ny * 2 + oy;
        if (sy >= height) continue;
        for (let ox = 0; ox < 2; ox += 1) {
          const sx = nx * 2 + ox;
          if (sx >= width) continue;
          const sIdx = sy * width + sx;
          const w = valid[sIdx];
          if (w > 0) {
            sumR += rgb[sIdx * 3] * w;
            sumG += rgb[sIdx * 3 + 1] * w;
            sumB += rgb[sIdx * 3 + 2] * w;
            weightSum += w;
          }
        }
      }
      const dIdx = ny * nextW + nx;
      if (weightSum > 0) {
        nextRgb[dIdx * 3] = sumR / weightSum;
        nextRgb[dIdx * 3 + 1] = sumG / weightSum;
        nextRgb[dIdx * 3 + 2] = sumB / weightSum;
        nextValid[dIdx] = 1;
      }
    }
  }
  return { width: nextW, height: nextH, rgb: nextRgb, valid: nextValid };
}

function upsampleToTarget(
  coarseRgb: Float32Array,
  coarseW: number,
  coarseH: number,
  targetRgb: Float32Array,
  targetValid: Float32Array,
  targetW: number,
  targetH: number,
): void {
  for (let y = 0; y < targetH; y += 1) {
    const fy = coarseH === 1 ? 0 : ((y + 0.5) * coarseH) / targetH - 0.5;
    const y0 = Math.max(0, Math.min(coarseH - 1, Math.floor(fy)));
    const y1 = Math.max(0, Math.min(coarseH - 1, y0 + 1));
    const ty = Math.max(0, Math.min(1, fy - y0));

    for (let x = 0; x < targetW; x += 1) {
      const idx = y * targetW + x;
      if (targetValid[idx] > 0.5) continue;

      const fx = coarseW === 1 ? 0 : ((x + 0.5) * coarseW) / targetW - 0.5;
      const x0 = Math.max(0, Math.min(coarseW - 1, Math.floor(fx)));
      const x1 = Math.max(0, Math.min(coarseW - 1, x0 + 1));
      const tx = Math.max(0, Math.min(1, fx - x0));

      const i00 = (y0 * coarseW + x0) * 3;
      const i10 = (y0 * coarseW + x1) * 3;
      const i01 = (y1 * coarseW + x0) * 3;
      const i11 = (y1 * coarseW + x1) * 3;
      for (let c = 0; c < 3; c += 1) {
        const top = coarseRgb[i00 + c] * (1 - tx) + coarseRgb[i10 + c] * tx;
        const bot = coarseRgb[i01 + c] * (1 - tx) + coarseRgb[i11 + c] * tx;
        targetRgb[idx * 3 + c] = top * (1 - ty) + bot * ty;
      }
    }
  }
}

function runStructureAwareDiffusionAtScale(
  rgb: Float32Array,
  knownMask: Float32Array,
  width: number,
  height: number,
  iterations: number,
  structureStrength: number,
  seededFromCoarserScale: boolean,
): void {
  const count = width * height;
  const filled = new Uint8Array(count);
  let meanR = 0;
  let meanG = 0;
  let meanB = 0;
  let knownCount = 0;

  for (let i = 0; i < count; i += 1) {
    if (knownMask[i] > 0.5) {
      filled[i] = 1;
      meanR += rgb[i * 3];
      meanG += rgb[i * 3 + 1];
      meanB += rgb[i * 3 + 2];
      knownCount += 1;
    }
  }
  if (knownCount === 0) return;
  meanR /= knownCount;
  meanG /= knownCount;
  meanB /= knownCount;

  // 기지 영역의 X/Y 편차 비율로 이방성 확산 방향 가중치를 산출해 수평 지평선·수직 구조를 보존한다.
  let sumGradX = 0;
  let sumGradY = 0;
  let gradPairs = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (knownMask[idx] <= 0.5) continue;
      if (x + 1 < width && knownMask[idx + 1] > 0.5) {
        sumGradX += computeRgbDistance(
          rgb[idx * 3], rgb[idx * 3 + 1], rgb[idx * 3 + 2],
          rgb[(idx + 1) * 3], rgb[(idx + 1) * 3 + 1], rgb[(idx + 1) * 3 + 2],
        );
        gradPairs += 1;
      }
      if (y + 1 < height && knownMask[idx + width] > 0.5) {
        sumGradY += computeRgbDistance(
          rgb[idx * 3], rgb[idx * 3 + 1], rgb[idx * 3 + 2],
          rgb[(idx + width) * 3], rgb[(idx + width) * 3 + 1], rgb[(idx + width) * 3 + 2],
        );
        gradPairs += 1;
      }
    }
  }
  const avgGx = gradPairs > 0 ? sumGradX / gradPairs : 1;
  const avgGy = gradPairs > 0 ? sumGradY / gradPairs : 1;
  const eps = 0.5;
  const weightX = 1 + (structureStrength * (avgGy + eps)) / (avgGx + avgGy + 2 * eps);
  const weightY = 1 + (structureStrength * (avgGx + eps)) / (avgGx + avgGy + 2 * eps);

  if (!seededFromCoarserScale) {
    let remaining = count - knownCount;
    const nextFilled = new Uint8Array(filled);
    for (let sweep = 0; remaining > 0 && sweep < width + height; sweep += 1) {
      let progressed = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          if (filled[idx] === 1) continue;
          let accR = 0;
          let accG = 0;
          let accB = 0;
          let wSum = 0;
          if (x > 0 && filled[idx - 1] === 1) {
            accR += rgb[(idx - 1) * 3] * weightX;
            accG += rgb[(idx - 1) * 3 + 1] * weightX;
            accB += rgb[(idx - 1) * 3 + 2] * weightX;
            wSum += weightX;
          }
          if (x + 1 < width && filled[idx + 1] === 1) {
            accR += rgb[(idx + 1) * 3] * weightX;
            accG += rgb[(idx + 1) * 3 + 1] * weightX;
            accB += rgb[(idx + 1) * 3 + 2] * weightX;
            wSum += weightX;
          }
          if (y > 0 && filled[idx - width] === 1) {
            accR += rgb[(idx - width) * 3] * weightY;
            accG += rgb[(idx - width) * 3 + 1] * weightY;
            accB += rgb[(idx - width) * 3 + 2] * weightY;
            wSum += weightY;
          }
          if (y + 1 < height && filled[idx + width] === 1) {
            accR += rgb[(idx + width) * 3] * weightY;
            accG += rgb[(idx + width) * 3 + 1] * weightY;
            accB += rgb[(idx + width) * 3 + 2] * weightY;
            wSum += weightY;
          }
          if (wSum > 0) {
            rgb[idx * 3] = accR / wSum;
            rgb[idx * 3 + 1] = accG / wSum;
            rgb[idx * 3 + 2] = accB / wSum;
            nextFilled[idx] = 1;
            progressed += 1;
          }
        }
      }
      if (progressed === 0) break;
      filled.set(nextFilled);
      remaining -= progressed;
    }
    for (let i = 0; i < count; i += 1) {
      if (filled[i] === 0) {
        rgb[i * 3] = meanR;
        rgb[i * 3 + 1] = meanG;
        rgb[i * 3 + 2] = meanB;
      }
    }
  }

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        if (knownMask[idx] > 0.5) continue;
        let accR = 0;
        let accG = 0;
        let accB = 0;
        let wSum = 0;
        if (x > 0) {
          accR += rgb[(idx - 1) * 3] * weightX;
          accG += rgb[(idx - 1) * 3 + 1] * weightX;
          accB += rgb[(idx - 1) * 3 + 2] * weightX;
          wSum += weightX;
        }
        if (x + 1 < width) {
          accR += rgb[(idx + 1) * 3] * weightX;
          accG += rgb[(idx + 1) * 3 + 1] * weightX;
          accB += rgb[(idx + 1) * 3 + 2] * weightX;
          wSum += weightX;
        }
        if (y > 0) {
          accR += rgb[(idx - width) * 3] * weightY;
          accG += rgb[(idx - width) * 3 + 1] * weightY;
          accB += rgb[(idx - width) * 3 + 2] * weightY;
          wSum += weightY;
        }
        if (y + 1 < height) {
          accR += rgb[(idx + width) * 3] * weightY;
          accG += rgb[(idx + width) * 3 + 1] * weightY;
          accB += rgb[(idx + width) * 3 + 2] * weightY;
          wSum += weightY;
        }
        if (wSum > 0) {
          rgb[idx * 3] = accR / wSum;
          rgb[idx * 3 + 1] = accG / wSum;
          rgb[idx * 3 + 2] = accB / wSum;
        }
      }
    }
  }
}

function refineWithDirectionalPatchSynthesis(
  rgb: Float32Array,
  holeMask: Uint8Array,
  width: number,
  height: number,
  patchRadius: number,
): void {
  if (patchRadius <= 0) return;
  const blend = Math.min(0.85, 0.55 + patchRadius * 0.1);
  const refined = new Float32Array(rgb);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (holeMask[idx] === 0) continue;

      let leftX = -1;
      for (let lx = x - 1; lx >= 0; lx -= 1) {
        if (holeMask[y * width + lx] === 0) { leftX = lx; break; }
      }
      let rightX = -1;
      for (let rx = x + 1; rx < width; rx += 1) {
        if (holeMask[y * width + rx] === 0) { rightX = rx; break; }
      }
      if (leftX >= 0 && rightX >= 0) {
        const lIdx = (y * width + leftX) * 3;
        const rIdx = (y * width + rightX) * 3;
        if (computeRgbDistance(rgb[lIdx], rgb[lIdx + 1], rgb[lIdx + 2], rgb[rIdx], rgb[rIdx + 1], rgb[rIdx + 2]) < 18) {
          const t = (x - leftX) / (rightX - leftX);
          for (let c = 0; c < 3; c += 1) {
            const lineInterp = rgb[lIdx + c] * (1 - t) + rgb[rIdx + c] * t;
            refined[idx * 3 + c] = refined[idx * 3 + c] * (1 - blend) + lineInterp * blend;
          }
          continue;
        }
      }

      let topY = -1;
      for (let ty = y - 1; ty >= 0; ty -= 1) {
        if (holeMask[ty * width + x] === 0) { topY = ty; break; }
      }
      let botY = -1;
      for (let by = y + 1; by < height; by += 1) {
        if (holeMask[by * width + x] === 0) { botY = by; break; }
      }
      if (topY >= 0 && botY >= 0) {
        const tIdx = (topY * width + x) * 3;
        const bIdx = (botY * width + x) * 3;
        if (computeRgbDistance(rgb[tIdx], rgb[tIdx + 1], rgb[tIdx + 2], rgb[bIdx], rgb[bIdx + 1], rgb[bIdx + 2]) < 18) {
          const t = (y - topY) / (botY - topY);
          for (let c = 0; c < 3; c += 1) {
            const colInterp = rgb[tIdx + c] * (1 - t) + rgb[bIdx + c] * t;
            refined[idx * 3 + c] = refined[idx * 3 + c] * (1 - blend) + colInterp * blend;
          }
        }
      }
    }
  }
  rgb.set(refined);
}

/**
 * 가려진 레이어 구멍(`holeMask[i] !== 0`)을 다중스케일 피라미드 + 구조-인식 이방성 디퓨전 +
 * 방향성 패치 합성으로 100% 복원한다.
 */
export function inpaintOccludedLayerRegion(
  image: RgbaImageBuffer,
  holeMask: Uint8Array,
  options: SeeThroughInpaintOptions = {},
): InpaintedRegionResult {
  assertValidRgbaImage(image);
  const { width, height, data } = image;
  const count = width * height;
  if (holeMask.length !== count) {
    throw new Error(`holeMask 길이(${holeMask.length})가 픽셀 수(${count})와 다릅니다.`);
  }

  const requestedScales = Math.max(1, Math.min(5, options.pyramidScales ?? 3));
  const iterations = Math.max(4, Math.min(80, options.diffusionIterations ?? 24));
  const patchRadius = Math.max(0, Math.min(4, options.patchRadius ?? 2));
  const structureStrength = Math.max(0, Math.min(4, options.structureStrength ?? 2.2));

  let holePixelCount = 0;
  const baseRgb = new Float32Array(count * 3);
  const baseValid = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const p = i * 4;
    if (holeMask[i] !== 0) holePixelCount += 1;
    if (holeMask[i] === 0 && data[p + 3] > 0) {
      baseRgb[i * 3] = data[p];
      baseRgb[i * 3 + 1] = data[p + 1];
      baseRgb[i * 3 + 2] = data[p + 2];
      baseValid[i] = 1;
    }
  }

  const outData = new Uint8ClampedArray(data);
  if (holePixelCount === 0) {
    return {
      image: { width, height, data: outData },
      holePixelCount: 0,
      restoredPixelCount: 0,
      remainingHolePixels: 0,
      restorationRate: 1,
      scalesUsed: 1,
    };
  }

  const pyramid: Array<{ width: number; height: number; rgb: Float32Array; valid: Float32Array }> = [
    { width, height, rgb: baseRgb, valid: baseValid },
  ];
  for (let s = 1; s < requestedScales; s += 1) {
    const prev = pyramid[pyramid.length - 1];
    if (prev.width <= 4 || prev.height <= 4) break;
    pyramid.push(downsampleForPyramid(prev.rgb, prev.valid, prev.width, prev.height));
  }

  for (let level = pyramid.length - 1; level >= 0; level -= 1) {
    const cur = pyramid[level];
    const seededFromCoarserScale = level < pyramid.length - 1;
    if (seededFromCoarserScale) {
      const coarser = pyramid[level + 1];
      upsampleToTarget(coarser.rgb, coarser.width, coarser.height, cur.rgb, cur.valid, cur.width, cur.height);
    }
    const levelIterations = level === 0 ? iterations : Math.max(12, Math.round(iterations * 1.25));
    runStructureAwareDiffusionAtScale(
      cur.rgb,
      cur.valid,
      cur.width,
      cur.height,
      levelIterations,
      structureStrength,
      seededFromCoarserScale,
    );
  }

  refineWithDirectionalPatchSynthesis(baseRgb, holeMask, width, height, patchRadius);

  let restoredPixelCount = 0;
  for (let i = 0; i < count; i += 1) {
    if (holeMask[i] !== 0) {
      const p = i * 4;
      outData[p] = clampByte(baseRgb[i * 3]);
      outData[p + 1] = clampByte(baseRgb[i * 3 + 1]);
      outData[p + 2] = clampByte(baseRgb[i * 3 + 2]);
      outData[p + 3] = 255;
      restoredPixelCount += 1;
    }
  }

  return {
    image: { width, height, data: outData },
    holePixelCount,
    restoredPixelCount,
    remainingHolePixels: holePixelCount - restoredPixelCount,
    restorationRate: holePixelCount > 0 ? restoredPixelCount / holePixelCount : 1,
    scalesUsed: pyramid.length,
  };
}

/**
 * 두 RGBA 이미지 사이의 MAE·RMSE·PSNR(dB) 유사도를 계산한다.
 */
export function computeImageSimilarityMetrics(
  reference: RgbaImageBuffer,
  candidate: RgbaImageBuffer,
): ImageSimilarityMetrics {
  assertValidRgbaImage(reference);
  assertValidRgbaImage(candidate);
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error("유사도 비교 대상 이미지의 크기가 일치하지 않습니다.");
  }
  const pixelCount = reference.width * reference.height;
  let sumAbs = 0;
  let sumSq = 0;
  let maxDiff = 0;
  const totalChannels = pixelCount * 3;

  for (let i = 0; i < pixelCount; i += 1) {
    const p = i * 4;
    for (let c = 0; c < 3; c += 1) {
      const diff = Math.abs(reference.data[p + c] - candidate.data[p + c]);
      sumAbs += diff;
      sumSq += diff * diff;
      if (diff > maxDiff) maxDiff = diff;
    }
  }
  const mse = totalChannels > 0 ? sumSq / totalChannels : 0;
  return {
    mae: totalChannels > 0 ? sumAbs / totalChannels : 0,
    rmse: Math.sqrt(mse),
    psnrDb: mse === 0 ? 100 : 10 * Math.log10((255 * 255) / mse),
    maxChannelDiff: maxDiff,
  };
}
