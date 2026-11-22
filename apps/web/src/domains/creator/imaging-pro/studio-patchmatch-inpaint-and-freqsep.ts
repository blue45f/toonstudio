/**
 * Photoshop 식 PatchMatch ₩0 로컬 콘텐츠 인식 채우기(Content-Aware Fill) &
 * 분리형 가우시안 주파수 분리·무손실 재합성 통합 엔진
 * (100% 클린룸 논문·수학 원리 자체 구현, ₩0 브라우저 로컬).
 */

import {
  buildTargetPatchMask,
  buildValidSourcePatches,
  clampPatchInt,
  computePatchSsd,
  createPatchMatchPrng,
  diffuseHoleInward,
  downsampleMask2x,
  downsampleRgba2x,
  normalizeBinaryMask,
  voteHolePixelsFromNnf,
} from "./studio-patchmatch-pyramid-ops";
import {
  applySeparableGaussianBlurFloat32,
  buildSeparableGaussianKernel,
  recombineImageFrequencies,
  separateImageFrequencies,
  type CleanroomFrequencySeparation,
  type FrequencyRecombineOptions,
  type FrequencySeparationOptions,
  type PatchMatchImageDataLike,
} from "./studio-separable-frequency-separation";

export {
  applySeparableGaussianBlurFloat32,
  buildSeparableGaussianKernel,
  recombineImageFrequencies,
  separateImageFrequencies,
  type CleanroomFrequencySeparation,
  type FrequencyRecombineOptions,
  type FrequencySeparationOptions,
  type PatchMatchImageDataLike,
};

export interface CleanroomPatchMatchOptions {
  /** 패치 반경(px, 1..4, 기본 2 = 5×5 패치). */
  readonly patchRadius?: number;
  /** 피라미드 레벨당 교대 전파+랜덤 탐색 반복 횟수(1..12, 기본 5). */
  readonly iterations?: number;
  /** 피라미드 레벨당 EM(NNF 탐색→패치 투표) 라운드 수(1..4, 기본 2). */
  readonly emRounds?: number;
  /** 코어스-투-파인 가우시안 피라미드 단계 수(1..5, 기본 3). */
  readonly pyramidLevels?: number;
  /** Barnes et al. 랜덤 탐색 창 감쇠 비율 α (0.25..0.75, 기본 0.5). */
  readonly searchWindowRatio?: number;
  /** 샘플링에서 제외할 마스크(>0 픽셀은 소스 패치에서 배제). */
  readonly excludeMask?: Uint8Array | Uint8ClampedArray;
  /** 결정적 난수 시드 (Math.random 미사용). */
  readonly seed?: number;
}

export interface CleanroomPatchMatchStats {
  readonly width: number;
  readonly height: number;
  readonly patchRadius: number;
  readonly pyramidLevelsExecuted: number;
  readonly iterationsPerLevel: number;
  readonly holePixelCount: number;
  readonly validSourcePatchCount: number;
  readonly meanFinalPatchDistance: number;
  readonly fallbackUsed: boolean;
}

export interface CleanroomPatchMatchResult {
  readonly imageData: PatchMatchImageDataLike;
  /** 최종 레벨 NNF 소스 X 좌표 (마스크 외부는 자기 자신 x). */
  readonly nnfSourceX: Int32Array;
  /** 최종 레벨 NNF 소스 Y 좌표 (마스크 외부는 자기 자신 y). */
  readonly nnfSourceY: Int32Array;
  /** 최종 레벨 패치 SSD 거리. */
  readonly nnfDistance: Float32Array;
  readonly stats: CleanroomPatchMatchStats;
}

interface PyramidLevel {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly hole: Uint8Array;
  readonly exclude: Uint8Array;
}

function clampFloat(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Barnes et al. (SIGGRAPH 2009) PatchMatch 기반 ₩0 로컬 콘텐츠 인식 채우기를 실행한다.
 * 원본 `source`는 변경하지 않으며, 마스크 바깥 픽셀은 원본과 비트 단위로 동일하게 보존된다.
 */
export function runCleanroomPatchMatchInpaint(
  source: PatchMatchImageDataLike,
  mask: Uint8Array | Uint8ClampedArray,
  options?: CleanroomPatchMatchOptions,
): CleanroomPatchMatchResult {
  const { width, height, data } = source;
  const total = width * height;
  const patchRadius = clampPatchInt(Math.round(options?.patchRadius ?? 2), 1, 4);
  const iterations = clampPatchInt(Math.round(options?.iterations ?? 5), 1, 12);
  const emRounds = clampPatchInt(Math.round(options?.emRounds ?? 2), 1, 4);
  const requestedLevels = clampPatchInt(Math.round(options?.pyramidLevels ?? 3), 1, 5);
  const alpha = clampFloat(options?.searchWindowRatio ?? 0.5, 0.25, 0.75);
  const rand = createPatchMatchPrng(options?.seed ?? 20261122);

  const rootHole = normalizeBinaryMask(mask, total);
  const rootExclude = normalizeBinaryMask(options?.excludeMask, total);
  const outRgba = new Uint8ClampedArray(data);

  let holePixelCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (rootHole[i] === 1) holePixelCount += 1;
  }

  const finalNnfX = new Int32Array(total);
  const finalNnfY = new Int32Array(total);
  const finalNnfDist = new Float32Array(total);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = y * width + x;
      finalNnfX[p] = x;
      finalNnfY[p] = y;
    }
  }

  if (total === 0 || holePixelCount === 0 || holePixelCount === total) {
    return {
      imageData: { width, height, data: outRgba },
      nnfSourceX: finalNnfX,
      nnfSourceY: finalNnfY,
      nnfDistance: finalNnfDist,
      stats: {
        width,
        height,
        patchRadius,
        pyramidLevelsExecuted: 0,
        iterationsPerLevel: iterations,
        holePixelCount,
        validSourcePatchCount: 0,
        meanFinalPatchDistance: 0,
        fallbackUsed: false,
      },
    };
  }

  const minDim = patchRadius * 2 + 4;
  const levels: PyramidLevel[] = [
    { width, height, rgba: new Uint8ClampedArray(data), hole: rootHole, exclude: rootExclude },
  ];
  while (levels.length < requestedLevels) {
    const prev = levels[levels.length - 1]!;
    if (Math.floor(prev.width / 2) < minDim || Math.floor(prev.height / 2) < minDim) break;
    const down = downsampleRgba2x(prev.rgba, prev.width, prev.height);
    const downHole = downsampleMask2x(prev.hole, prev.width, prev.height, down.width, down.height);
    const downExclude = downsampleMask2x(prev.exclude, prev.width, prev.height, down.width, down.height);
    levels.push({ width: down.width, height: down.height, rgba: down.rgba, hole: downHole, exclude: downExclude });
  }

  let prevNnfX: Int32Array | null = null;
  let prevNnfY: Int32Array | null = null;
  let prevW = 0;
  let prevH = 0;
  let prevRgba: Uint8ClampedArray | null = null;
  let fallbackUsed = false;
  let lastValidPatchCount = 0;
  let lastMeanDist = 0;

  for (let lvlIdx = levels.length - 1; lvlIdx >= 0; lvlIdx -= 1) {
    const lvl = levels[lvlIdx]!;
    const lw = lvl.width;
    const lh = lvl.height;
    const lTotal = lw * lh;
    const { validMask, validIndices } = buildValidSourcePatches(lvl.hole, lvl.exclude, lw, lh, patchRadius);
    lastValidPatchCount = validIndices.length;

    if (prevRgba && prevW > 0 && prevH > 0) {
      for (let y = 0; y < lh; y += 1) {
        const sy = Math.min(prevH - 1, Math.floor((y * prevH) / lh));
        for (let x = 0; x < lw; x += 1) {
          const p = y * lw + x;
          if (lvl.hole[p] !== 1) continue;
          const sx = Math.min(prevW - 1, Math.floor((x * prevW) / lw));
          const sOff = (sy * prevW + sx) * 4;
          const dOff = p * 4;
          lvl.rgba[dOff] = prevRgba[sOff]!;
          lvl.rgba[dOff + 1] = prevRgba[sOff + 1]!;
          lvl.rgba[dOff + 2] = prevRgba[sOff + 2]!;
          lvl.rgba[dOff + 3] = prevRgba[sOff + 3]!;
        }
      }
    } else {
      diffuseHoleInward(lvl.rgba, lvl.hole, lvl.exclude, lw, lh);
    }

    if (validIndices.length === 0) {
      fallbackUsed = true;
      diffuseHoleInward(lvl.rgba, lvl.hole, lvl.exclude, lw, lh);
      prevRgba = lvl.rgba;
      prevW = lw;
      prevH = lh;
      prevNnfX = null;
      prevNnfY = null;
      continue;
    }

    const targetPatchMask = buildTargetPatchMask(lvl.hole, lw, lh, patchRadius);
    const nnfX = new Int32Array(lTotal);
    const nnfY = new Int32Array(lTotal);
    const nnfDist = new Float32Array(lTotal);

    const pickRandomValid = (): readonly [number, number] => {
      const idx = validIndices[Math.floor(rand() * validIndices.length)]!;
      const sx = idx % lw;
      return [sx, (idx - sx) / lw];
    };

    for (let y = 0; y < lh; y += 1) {
      for (let x = 0; x < lw; x += 1) {
        const p = y * lw + x;
        if (targetPatchMask[p] !== 1) {
          nnfX[p] = x;
          nnfY[p] = y;
          nnfDist[p] = 0;
          continue;
        }
        let sx = -1;
        let sy = -1;
        if (prevNnfX && prevNnfY && prevW > 0 && prevH > 0) {
          const cx = Math.min(prevW - 1, Math.floor((x * prevW) / lw));
          const cy = Math.min(prevH - 1, Math.floor((y * prevH) / lh));
          const cp = cy * prevW + cx;
          const upX = clampPatchInt(Math.round((prevNnfX[cp]! * lw) / prevW), patchRadius, lw - 1 - patchRadius);
          const upY = clampPatchInt(Math.round((prevNnfY[cp]! * lh) / prevH), patchRadius, lh - 1 - patchRadius);
          if (validMask[upY * lw + upX] === 1) {
            sx = upX;
            sy = upY;
          }
        }
        if (sx < 0) {
          [sx, sy] = pickRandomValid();
        }
        nnfX[p] = sx;
        nnfY[p] = sy;
      }
    }

    const maxSearchR = Math.max(lw, lh);

    for (let round = 0; round < emRounds; round += 1) {
      const holeWeight = round === 0 && lvlIdx === levels.length - 1 ? 0.35 : 0.85;
      for (let y = patchRadius; y < lh - patchRadius; y += 1) {
        for (let x = patchRadius; x < lw - patchRadius; x += 1) {
          const p = y * lw + x;
          if (targetPatchMask[p] !== 1) continue;
          nnfDist[p] = computePatchSsd(
            lvl.rgba, lvl.hole, lw, x, y, nnfX[p]!, nnfY[p]!, patchRadius, holeWeight,
          );
        }
      }

      const tryCandidate = (p: number, tx: number, ty: number, candX: number, candY: number): void => {
        if (candX < patchRadius || candY < patchRadius || candX >= lw - patchRadius || candY >= lh - patchRadius) {
          return;
        }
        if (validMask[candY * lw + candX] !== 1) return;
        const d = computePatchSsd(lvl.rgba, lvl.hole, lw, tx, ty, candX, candY, patchRadius, holeWeight);
        if (d < nnfDist[p]!) {
          nnfX[p] = candX;
          nnfY[p] = candY;
          nnfDist[p] = d;
        }
      };

      for (let iter = 0; iter < iterations; iter += 1) {
        const forward = iter % 2 === 0;
        const yStart = forward ? patchRadius : lh - 1 - patchRadius;
        const yEnd = forward ? lh - patchRadius : patchRadius - 1;
        const yStep = forward ? 1 : -1;
        const xStart = forward ? patchRadius : lw - 1 - patchRadius;
        const xEnd = forward ? lw - patchRadius : patchRadius - 1;
        const xStep = forward ? 1 : -1;

        for (let y = yStart; y !== yEnd; y += yStep) {
          for (let x = xStart; x !== xEnd; x += xStep) {
            const p = y * lw + x;
            if (targetPatchMask[p] !== 1) continue;

            const nx = x - xStep;
            if (nx >= patchRadius && nx < lw - patchRadius) {
              const np = y * lw + nx;
              if (targetPatchMask[np] === 1) {
                tryCandidate(p, x, y, nnfX[np]! + xStep, nnfY[np]!);
              }
            }
            const ny = y - yStep;
            if (ny >= patchRadius && ny < lh - patchRadius) {
              const np = ny * lw + x;
              if (targetPatchMask[np] === 1) {
                tryCandidate(p, x, y, nnfX[np]!, nnfY[np]! + yStep);
              }
            }

            let radius = maxSearchR;
            const bx = nnfX[p]!;
            const by = nnfY[p]!;
            while (radius >= 1) {
              const rx = clampPatchInt(Math.round(bx + (rand() * 2 - 1) * radius), patchRadius, lw - 1 - patchRadius);
              const ry = clampPatchInt(Math.round(by + (rand() * 2 - 1) * radius), patchRadius, lh - 1 - patchRadius);
              tryCandidate(p, x, y, rx, ry);
              radius = Math.floor(radius * alpha);
            }
            const [gx, gy] = pickRandomValid();
            tryCandidate(p, x, y, gx, gy);
          }
        }
      }

      voteHolePixelsFromNnf(
        lvl.rgba, lvl.hole, targetPatchMask, nnfX, nnfY, nnfDist, lw, lh, patchRadius,
      );
    }

    if (lvlIdx === 0) {
      let distSum = 0;
      let distCnt = 0;
      for (let p = 0; p < total; p += 1) {
        finalNnfX[p] = nnfX[p]!;
        finalNnfY[p] = nnfY[p]!;
        finalNnfDist[p] = nnfDist[p]!;
        if (targetPatchMask[p] === 1) {
          distSum += nnfDist[p]!;
          distCnt += 1;
        }
      }
      lastMeanDist = distCnt > 0 ? distSum / distCnt : 0;
    }

    prevRgba = lvl.rgba;
    prevW = lw;
    prevH = lh;
    prevNnfX = nnfX;
    prevNnfY = nnfY;
  }

  const finest = levels[0]!.rgba;
  for (let p = 0; p < total; p += 1) {
    if (rootHole[p] !== 1) continue;
    const off = p * 4;
    outRgba[off] = finest[off]!;
    outRgba[off + 1] = finest[off + 1]!;
    outRgba[off + 2] = finest[off + 2]!;
    outRgba[off + 3] = finest[off + 3]!;
  }

  return {
    imageData: { width, height, data: outRgba },
    nnfSourceX: finalNnfX,
    nnfSourceY: finalNnfY,
    nnfDistance: finalNnfDist,
    stats: {
      width,
      height,
      patchRadius,
      pyramidLevelsExecuted: levels.length,
      iterationsPerLevel: iterations,
      holePixelCount,
      validSourcePatchCount: lastValidPatchCount,
      meanFinalPatchDistance: lastMeanDist,
      fallbackUsed,
    },
  };
}
