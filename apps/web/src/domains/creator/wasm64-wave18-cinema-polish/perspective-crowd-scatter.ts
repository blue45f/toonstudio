/**
 * 지평선 원근 지면 위 브리드슨(Bridson) `O(N)` 격자 가속 포아송 디스크 배경 군중·실루엣 배치기.
 *
 * - 깊이 `z`에 반비례하는 원근 키 축소와 대기 원근 탈채도(Aerial Desaturation)를 자동 적용한다.
 * - 외부 서버 호출 0회(₩0), 브라우저 전역 스토리지(KV) 및 정규식 무사용.
 */

export interface CrowdPoint2D {
  readonly x: number;
  readonly y: number;
}

export type CrowdPolygon2D = readonly CrowdPoint2D[];

export interface PerspectiveCrowdOptions {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly horizonY: number;
  readonly vanishingX?: number;
  readonly cameraHeightM?: number;
  readonly focalLengthPx?: number;
  readonly worldHalfWidthM: number;
  readonly nearDepthM: number;
  readonly farDepthM: number;
  readonly minSpacingM: number;
  readonly maxExtras?: number;
  readonly maxCandidatesPerSample?: number;
  readonly meanActorHeightM?: number;
  readonly heightVariationM?: number;
  readonly baseSilhouetteRgb?: readonly [number, number, number];
  readonly hazeRgb?: readonly [number, number, number];
  readonly aerialExtinctionPerMeter?: number;
  readonly seed?: number;
}

export interface CrowdExtraInstance {
  readonly extraIndex: number;
  readonly worldX: number;
  readonly worldZ: number;
  readonly footX: number;
  readonly footY: number;
  readonly heightPx: number;
  readonly widthPx: number;
  readonly saturationScale: number;
  readonly aerialMix: number;
  readonly rgbaColor: readonly [number, number, number, number];
  readonly silhouettePolygon: CrowdPolygon2D;
}

export interface PerspectiveCrowdResult {
  readonly extras: readonly CrowdExtraInstance[];
  readonly gridCellSizeM: number;
  readonly minObservedWorldSpacingM: number;
}

function clamp(value: number, minValue: number, maxValue: number): number {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

function clampByte(value: number): number {
  const rounded = Math.round(value);
  if (rounded <= 0) return 0;
  if (rounded >= 255) return 255;
  return rounded;
}

function createSeededRng(seed: number): () => number {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function buildHumanSilhouettePolygon(
  footX: number,
  footY: number,
  widthPx: number,
  heightPx: number,
): CrowdPolygon2D {
  const halfW = widthPx * 0.5;
  const headRadius = widthPx * 0.24;
  const shoulderY = footY - heightPx * 0.78;
  const neckY = footY - heightPx * 0.83;
  const crownY = footY - heightPx;
  const hipY = footY - heightPx * 0.42;

  return [
    { x: footX - halfW * 0.52, y: footY },
    { x: footX - halfW * 0.68, y: hipY },
    { x: footX - halfW, y: shoulderY },
    { x: footX - headRadius * 0.65, y: neckY },
    { x: footX - headRadius, y: crownY + headRadius },
    { x: footX, y: crownY },
    { x: footX + headRadius, y: crownY + headRadius },
    { x: footX + headRadius * 0.65, y: neckY },
    { x: footX + halfW, y: shoulderY },
    { x: footX + halfW * 0.68, y: hipY },
    { x: footX + halfW * 0.52, y: footY },
  ];
}

/**
 * 지평선 원근 지면 위에서 `O(N)` 격자 가속 브리드슨(Bridson) 포아송 디스크 샘플링으로
 * 서로 겹치지 않는 배경 엑스트라를 배치하고 깊이 `z`에 따라 키 축소와 대기 원근 탈채도를 자동 계산한다.
 */
export function scatterPerspectiveCrowdSilhouettes(
  options: PerspectiveCrowdOptions,
): PerspectiveCrowdResult {
  if (
    !(
      options.worldHalfWidthM > 0 &&
      options.nearDepthM > 0 &&
      options.farDepthM > options.nearDepthM
    )
  ) {
    throw new RangeError(
      "원근 군중 지면 범위(nearDepthM < farDepthM, worldHalfWidthM > 0)가 올바르지 않습니다.",
    );
  }
  if (!(options.minSpacingM > 0)) {
    throw new RangeError("최소 인물 간격(minSpacingM)은 0보다 커야 합니다.");
  }

  const worldWidthM = options.worldHalfWidthM * 2;
  const worldDepthM = options.farDepthM - options.nearDepthM;
  const minDist = options.minSpacingM;
  const minDistSq = minDist * minDist;
  const cellSize = minDist / Math.SQRT2;
  const gridCols = Math.max(1, Math.ceil(worldWidthM / cellSize));
  const gridRows = Math.max(1, Math.ceil(worldDepthM / cellSize));
  const grid = new Int32Array(gridCols * gridRows).fill(-1);

  const maxExtras = Math.max(1, Math.floor(options.maxExtras ?? 256));
  const kCandidates = Math.max(8, Math.floor(options.maxCandidatesPerSample ?? 30));
  const rng = createSeededRng(options.seed ?? 18018);

  const sampleX: number[] = [];
  const sampleZ: number[] = [];
  const active: number[] = [];

  const insertSample = (wx: number, wz: number): void => {
    const idx = sampleX.length;
    sampleX.push(wx);
    sampleZ.push(wz);
    active.push(idx);
    const col = clamp(Math.floor((wx + options.worldHalfWidthM) / cellSize), 0, gridCols - 1);
    const row = clamp(Math.floor((wz - options.nearDepthM) / cellSize), 0, gridRows - 1);
    grid[row * gridCols + col] = idx;
  };

  const isFarEnough = (wx: number, wz: number): boolean => {
    const col = clamp(Math.floor((wx + options.worldHalfWidthM) / cellSize), 0, gridCols - 1);
    const row = clamp(Math.floor((wz - options.nearDepthM) / cellSize), 0, gridRows - 1);
    const rMin = Math.max(0, row - 2);
    const rMax = Math.min(gridRows - 1, row + 2);
    const cMin = Math.max(0, col - 2);
    const cMax = Math.min(gridCols - 1, col + 2);
    for (let r = rMin; r <= rMax; r += 1) {
      const rowOffset = r * gridCols;
      for (let c = cMin; c <= cMax; c += 1) {
        const existingIdx = grid[rowOffset + c]!;
        if (existingIdx < 0) continue;
        const dx = wx - sampleX[existingIdx]!;
        const dz = wz - sampleZ[existingIdx]!;
        if (dx * dx + dz * dz < minDistSq) {
          return false;
        }
      }
    }
    return true;
  };

  insertSample((rng() - 0.5) * worldWidthM, options.nearDepthM + rng() * worldDepthM);

  while (active.length > 0 && sampleX.length < maxExtras) {
    const pickPos = Math.floor(rng() * active.length);
    const baseIdx = active[pickPos]!;
    const bx = sampleX[baseIdx]!;
    const bz = sampleZ[baseIdx]!;
    let accepted = false;

    for (let attempt = 0; attempt < kCandidates; attempt += 1) {
      const theta = rng() * Math.PI * 2;
      const radius = minDist * (1 + rng());
      const cx = bx + Math.cos(theta) * radius;
      const cz = bz + Math.sin(theta) * radius;
      if (
        cx < -options.worldHalfWidthM ||
        cx > options.worldHalfWidthM ||
        cz < options.nearDepthM ||
        cz > options.farDepthM
      ) {
        continue;
      }
      if (isFarEnough(cx, cz)) {
        insertSample(cx, cz);
        accepted = true;
        if (sampleX.length >= maxExtras) break;
      }
    }

    if (!accepted) {
      active[pickPos] = active[active.length - 1]!;
      active.pop();
    }
  }

  let minObservedSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < sampleX.length; i += 1) {
    for (let j = i + 1; j < sampleX.length; j += 1) {
      const dx = sampleX[i]! - sampleX[j]!;
      const dz = sampleZ[i]! - sampleZ[j]!;
      const dSq = dx * dx + dz * dz;
      if (dSq < minObservedSq) minObservedSq = dSq;
    }
  }

  // 원경에서 근경 순서(화가 알고리즘)로 깊이 정렬한다.
  const order = Array.from({ length: sampleX.length }, (_, i) => i).sort(
    (a, b) => sampleZ[b]! - sampleZ[a]!,
  );

  const vanishingX = options.vanishingX ?? options.canvasWidth * 0.5;
  const cameraHeightM = options.cameraHeightM ?? 1.62;
  const focalLengthPx = options.focalLengthPx ?? options.canvasHeight * 0.92;
  const meanHeightM = options.meanActorHeightM ?? 1.7;
  const heightVarM = Math.max(0, options.heightVariationM ?? 0.08);
  const baseRgb = options.baseSilhouetteRgb ?? [46, 58, 84];
  const hazeRgb = options.hazeRgb ?? [198, 208, 222];
  const extinction = Math.max(0, options.aerialExtinctionPerMeter ?? 0.045);

  const extras: CrowdExtraInstance[] = [];
  for (let outIdx = 0; outIdx < order.length; outIdx += 1) {
    const sIdx = order[outIdx]!;
    const wx = sampleX[sIdx]!;
    const wz = sampleZ[sIdx]!;
    const projScale = focalLengthPx / wz;
    const footX = vanishingX + wx * projScale;
    const footY = options.horizonY + cameraHeightM * projScale;

    const actorHeightM = meanHeightM + (rng() - 0.5) * 2 * heightVarM;
    const heightPx = actorHeightM * projScale;
    const widthPx = heightPx * 0.29;

    const aerialMix = clamp(1 - Math.exp(-extinction * (wz - options.nearDepthM)), 0, 0.92);
    const saturationScale = clamp(1 - aerialMix * 0.88, 0.08, 1);

    const luma = 0.2126 * baseRgb[0] + 0.7152 * baseRgb[1] + 0.0722 * baseRgb[2];
    const desatR = luma + (baseRgb[0] - luma) * saturationScale;
    const desatG = luma + (baseRgb[1] - luma) * saturationScale;
    const desatB = luma + (baseRgb[2] - luma) * saturationScale;

    const finalR = clampByte(desatR * (1 - aerialMix) + hazeRgb[0] * aerialMix);
    const finalG = clampByte(desatG * (1 - aerialMix) + hazeRgb[1] * aerialMix);
    const finalB = clampByte(desatB * (1 - aerialMix) + hazeRgb[2] * aerialMix);
    const finalA = clampByte(255 * (1 - aerialMix * 0.25));

    extras.push({
      extraIndex: outIdx,
      worldX: wx,
      worldZ: wz,
      footX,
      footY,
      heightPx,
      widthPx,
      saturationScale,
      aerialMix,
      rgbaColor: [finalR, finalG, finalB, finalA],
      silhouettePolygon: buildHumanSilhouettePolygon(footX, footY, widthPx, heightPx),
    });
  }

  return {
    extras,
    gridCellSizeM: cellSize,
    minObservedWorldSpacingM: Number.isFinite(minObservedSq) ? Math.sqrt(minObservedSq) : 0,
  };
}
