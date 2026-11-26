/**
 * Wasm64 Wave 22 Ultragap — 2D 레이어 소실점 바닥·꺾인 벽(Bent-Wall) 투영 그림자 생성기 &
 * 유휴 예산(`<= 2ms/idle-tick`) OPFS 타일 비트부패(Bit-Rot) 머클 스크러버·저널 자가 복구기.
 *
 * - 2D 캐릭터 알파 실루엣·발 접지 기준선·동차 좌표(`P^2`) 광원 소실점·수직 벽 모서리선을 입력받아
 *   발밑 들뜸이 없는 평면 원근 바닥 그림자와 벽면을 타고 위로 꺾여 올라가는 그림자를 투영하고,
 *   적분 영상(Summed-Area Table) 기반 거리 비례 반영(Penumbra) 블러로 접지 선명도와 원거리 부드러움을 구현한다.
 * - 유휴 예산 OPFS 머클 스크러버 및 저널 자가 복구기(`opfs-merkle-scrubber`)를 통합 재노출한다.
 */

export {
  buildOpfsTileMerkleTree,
  bytesToHex,
  computeMerkleParentHash,
  computeOpfsTileLeafHash,
  createInMemoryOpfsTileVolume,
  createOpfsIdleMerkleScrubber,
  DEFAULT_OPFS_SCRUB_IDLE_BUDGET_MS,
  HARD_MAX_IDLE_TICK_BUDGET_MS,
  sha256Digest,
  type InMemoryOpfsTileVolume,
  type OpfsCorruptionKind,
  type OpfsIdleMerkleScrubber,
  type OpfsJournalReplicaBlock,
  type OpfsScrubIncident,
  type OpfsScrubTickReport,
  type OpfsStripeParityContext,
  type OpfsTileDescriptor,
  type OpfsTileMerkleTree,
  type OpfsTileVolumePort,
} from "./opfs-merkle-scrubber";

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

/** 2D 사영 평면(`P^2`) 동차 좌표 (`w !== 0` 유한 소실점/광원, `w === 0` 평행 광선 방향). */
export interface HomogeneousPoint2D {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

/** 바닥과 수직 벽면이 만나는 모서리(Crease) 선분 및 벽면 수직 상승 방향 정의. */
export interface VerticalWallCornerLine2D {
  readonly creaseStart: Vec2;
  readonly creaseEnd: Vec2;
  /** 벽면을 따라 그림자가 타고 올라가는 2D 단위 방향 (기본값 `{ x: 0, y: -1 }`, 화면 위쪽). */
  readonly wallUpDirection?: Vec2;
}

export interface PerspectiveCastShadowInput {
  readonly width: number;
  readonly height: number;
  /** 캐릭터 레이어 알파 실루엣 (`Float32Array` `[0, 1]` 또는 `Uint8Array` `[0, 255]`, 길이 `width * height`). */
  readonly silhouetteAlpha: Float32Array | Uint8Array;
  /** 캐릭터 발이 바닥에 닿는 기준 Y 좌표 (`x` 기준 기울기가 있으면 `footBaselineSlope` 함께 지정). */
  readonly footBaselineY: number;
  readonly footBaselinePivotX?: number;
  readonly footBaselineSlope?: number;
  /** 3D 광원의 2D 동차 투영점 (`w = 1` 유한 광원, `w = 0` 평행광 방향 벡터). */
  readonly lightSourcePoint: HomogeneousPoint2D;
  /** 광원의 바닥 평면 투영 소실점 (생략 시 `horizonY` 또는 수평 투영으로 자동 산출). */
  readonly groundShadowVanishingPoint?: HomogeneousPoint2D;
  readonly horizonY?: number;
  /** 선택적 수직 벽면 바닥 모서리선 — 바닥 그림자가 이 선에 닿으면 벽면을 타고 위로 꺾인다. */
  readonly wallCorner?: VerticalWallCornerLine2D;
  readonly minPenumbraRadiusPx?: number;
  readonly penumbraSoftnessPerPx?: number;
  readonly maxPenumbraRadiusPx?: number;
  readonly baseShadowOpacity?: number;
  readonly distanceAttenuationPerPx?: number;
}

export interface ProjectedShadowRaySample {
  readonly point: Vec2;
  readonly surface: "ground" | "wall";
  readonly wallCreaseHit: Vec2 | null;
  readonly travelDistancePx: number;
}

export interface PerspectiveCastShadowResult {
  readonly width: number;
  readonly height: number;
  readonly shadowAlpha: Float32Array;
  /** 픽셀별 투영 표면 구분 (`0`: 빈 영역, `1`: 바닥 그림자, `2`: 꺾인 벽 그림자). */
  readonly surfaceMask: Uint8Array;
  readonly penumbraRadiusMapPx: Float32Array;
  readonly groundShadowPixelCount: number;
  readonly bentWallShadowPixelCount: number;
  readonly minFootContactGapPx: number;
  readonly serverCostKrw: 0;
}

function cross3(a: HomogeneousPoint2D, b: HomogeneousPoint2D): HomogeneousPoint2D {
  return {
    x: a.y * b.w - a.w * b.y,
    y: a.w * b.x - a.x * b.w,
    w: a.x * b.y - a.y * b.x,
  };
}

function resolveGroundVanishingPoint(input: PerspectiveCastShadowInput): HomogeneousPoint2D {
  if (input.groundShadowVanishingPoint) return input.groundShadowVanishingPoint;
  const light = input.lightSourcePoint;
  if (Math.abs(light.w) > 1e-8) {
    const lx = light.x / light.w;
    const ly = light.y / light.w;
    const defaultHorizonY = input.horizonY ?? (input.footBaselineY + (ly - input.footBaselineY) * 0.15);
    return { x: lx, y: defaultHorizonY, w: 1 };
  }
  return { x: light.x, y: light.y * 0.35, w: 0 };
}

function footYAtX(input: PerspectiveCastShadowInput, x: number): number {
  const slope = input.footBaselineSlope ?? 0;
  const pivotX = input.footBaselinePivotX ?? input.width * 0.5;
  return input.footBaselineY + slope * (x - pivotX);
}

/**
 * 단일 실루엣 표본점 `(sampleX, sampleY)`를 동차 사영 기하로 바닥 및 수직 벽면에 투영한다.
 * 발 접지점(`sampleY === footY`)에서는 오차 `0px`로 자기 자신에 고정되며,
 * 벽 모서리선(`wallCorner`)과 교차하면 교차점 `W0`에서 연속성을 유지한 채 수직 벽면을 타고 위로 꺾인다.
 */
export function projectSilhouetteSampleToShadow(
  sample: Vec2,
  footPoint: Vec2,
  lightPoint: HomogeneousPoint2D,
  groundVanishingPoint: HomogeneousPoint2D,
  wallCorner?: VerticalWallCornerLine2D,
): ProjectedShadowRaySample | null {
  if (footPoint.y - sample.y <= 1e-5) {
    return {
      point: { x: footPoint.x, y: footPoint.y },
      surface: "ground",
      wallCreaseHit: null,
      travelDistancePx: 0,
    };
  }

  const hSample: HomogeneousPoint2D = { x: sample.x, y: sample.y, w: 1 };
  const hFoot: HomogeneousPoint2D = { x: footPoint.x, y: footPoint.y, w: 1 };

  const groundLine = cross3(hFoot, groundVanishingPoint);
  const lightLine = cross3(lightPoint, hSample);
  const rawGroundHit = cross3(groundLine, lightLine);

  if (Math.abs(rawGroundHit.w) <= 1e-7) return null;

  const groundPt: Vec2 = {
    x: rawGroundHit.x / rawGroundHit.w,
    y: rawGroundHit.y / rawGroundHit.w,
  };
  const dxGround = groundPt.x - footPoint.x;
  const dyGround = groundPt.y - footPoint.y;
  const groundDistSq = dxGround * dxGround + dyGround * dyGround;
  const groundDist = Math.sqrt(groundDistSq);

  if (Math.abs(lightPoint.w) > 1e-8) {
    const lx = lightPoint.x / lightPoint.w;
    const ly = lightPoint.y / lightPoint.w;
    if ((sample.x - lx) * (groundPt.x - sample.x) + (sample.y - ly) * (groundPt.y - sample.y) < -1e-4) {
      return null;
    }
  }

  if (wallCorner && groundDistSq > 1e-8) {
    const creaseLine = cross3(
      { x: wallCorner.creaseStart.x, y: wallCorner.creaseStart.y, w: 1 },
      { x: wallCorner.creaseEnd.x, y: wallCorner.creaseEnd.y, w: 1 },
    );
    const creaseHitH = cross3(groundLine, creaseLine);

    if (Math.abs(creaseHitH.w) > 1e-7) {
      const creasePt: Vec2 = {
        x: creaseHitH.x / creaseHitH.w,
        y: creaseHitH.y / creaseHitH.w,
      };
      const hitParam = ((creasePt.x - footPoint.x) * dxGround + (creasePt.y - footPoint.y) * dyGround) / groundDistSq;

      if (hitParam > 1e-5 && hitParam < 1 - 1e-5) {
        const upRaw = wallCorner.wallUpDirection ?? { x: 0, y: -1 };
        const upLen = Math.max(1e-6, Math.hypot(upRaw.x, upRaw.y));
        const wallVerticalLine = cross3(
          { x: creasePt.x, y: creasePt.y, w: 1 },
          { x: upRaw.x / upLen, y: upRaw.y / upLen, w: 0 },
        );
        const wallHitH = cross3(wallVerticalLine, lightLine);

        if (Math.abs(wallHitH.w) > 1e-7) {
          const wallPt: Vec2 = { x: wallHitH.x / wallHitH.w, y: wallHitH.y / wallHitH.w };
          const floorLeg = Math.hypot(creasePt.x - footPoint.x, creasePt.y - footPoint.y);
          const wallLeg = Math.hypot(wallPt.x - creasePt.x, wallPt.y - creasePt.y);
          return {
            point: wallPt,
            surface: "wall",
            wallCreaseHit: creasePt,
            travelDistancePx: floorLeg + wallLeg,
          };
        }
      }
    }
  }

  return { point: groundPt, surface: "ground", wallCreaseHit: null, travelDistancePx: groundDist };
}

function buildSummedAreaTable(src: Float32Array, width: number, height: number): Float64Array {
  const stride = width + 1;
  const sat = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    const srcRow = y * width;
    const satRow = (y + 1) * stride;
    const prevSatRow = y * stride;
    for (let x = 0; x < width; x += 1) {
      rowSum += src[srcRow + x] ?? 0;
      sat[satRow + x + 1] = (sat[prevSatRow + x + 1] ?? 0) + rowSum;
    }
  }
  return sat;
}

function sampleSatBilinear(sat: Float64Array, width: number, height: number, fx: number, fy: number): number {
  const cx = clamp(fx, 0, width);
  const cy = clamp(fy, 0, height);
  const x0 = Math.min(width - 1, Math.max(0, Math.floor(cx)));
  const y0 = Math.min(height - 1, Math.max(0, Math.floor(cy)));
  const x1 = Math.min(width, x0 + 1);
  const y1 = Math.min(height, y0 + 1);
  const tx = cx - x0;
  const ty = cy - y0;
  const stride = width + 1;

  const v00 = sat[y0 * stride + x0] ?? 0;
  const v10 = sat[y0 * stride + x1] ?? 0;
  const v01 = sat[y1 * stride + x0] ?? 0;
  const v11 = sat[y1 * stride + x1] ?? 0;

  return (v00 + (v10 - v00) * tx) * (1 - ty) + (v01 + (v11 - v01) * tx) * ty;
}

function querySatBoxAverage(
  sat: Float64Array,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radiusPx: number,
): number {
  const r = Math.max(0.05, radiusPx);
  const left = clamp(centerX - r, 0, width);
  const right = clamp(centerX + r, 0, width);
  const top = clamp(centerY - r, 0, height);
  const bottom = clamp(centerY + r, 0, height);
  const area = Math.max(1e-4, (right - left) * (bottom - top));

  const sum = sampleSatBilinear(sat, width, height, right, bottom)
    - sampleSatBilinear(sat, width, height, left, bottom)
    - sampleSatBilinear(sat, width, height, right, top)
    + sampleSatBilinear(sat, width, height, left, top);
  return Math.max(0, sum / area);
}

/**
 * 2D 캐릭터 알파 레이어로부터 평면 원근 바닥 그림자와 수직 벽면 꺾임 그림자를 생성하고,
 * 투영 거리 비례 가변 반경 반영(Penumbra) 필터를 `O(W·H)` 적분 영상 2-패스로 렌더링한다.
 */
export function projectLayerPerspectiveCastShadow(
  input: PerspectiveCastShadowInput,
): PerspectiveCastShadowResult {
  const width = Math.max(1, Math.trunc(input.width));
  const height = Math.max(1, Math.trunc(input.height));
  const pixelCount = width * height;
  if (input.silhouetteAlpha.length < pixelCount) {
    throw new Error(`silhouetteAlpha 길이(${input.silhouetteAlpha.length})가 픽셀 수(${pixelCount})보다 작습니다.`);
  }

  const alphaScale = input.silhouetteAlpha instanceof Uint8Array ? 1 / 255 : 1;
  const groundVp = resolveGroundVanishingPoint(input);

  const minPenumbraPx = clamp(input.minPenumbraRadiusPx ?? 0.25, 0.05, 8);
  const penumbraSlope = clamp(input.penumbraSoftnessPerPx ?? 0.06, 0, 0.5);
  const maxPenumbraPx = clamp(input.maxPenumbraRadiusPx ?? 10, minPenumbraPx, 32);
  const baseOpacity = clamp(input.baseShadowOpacity ?? 0.68, 0.05, 1);
  const distAttenuation = Math.max(0, input.distanceAttenuationPerPx ?? 0.0018);

  const rawCoverage = new Float32Array(pixelCount);
  const weightedDistSum = new Float32Array(pixelCount);
  const weightSum = new Float32Array(pixelCount);
  const wallVote = new Float32Array(pixelCount);
  let minFootContactGapPx = Number.POSITIVE_INFINITY;

  const splatBilinear = (px: number, py: number, alpha: number, distPx: number, isWall: boolean): void => {
    if (px < -0.5 || px >= width - 0.5 || py < -0.5 || py >= height - 0.5) return;
    const cx = clamp(px, 0, width - 1.0001);
    const cy = clamp(py, 0, height - 1.0001);
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    const tx = cx - x0;
    const ty = cy - y0;

    const coords: readonly [number, number, number][] = [
      [x0, y0, (1 - tx) * (1 - ty)],
      [Math.min(width - 1, x0 + 1), y0, tx * (1 - ty)],
      [x0, Math.min(height - 1, y0 + 1), (1 - tx) * ty],
      [Math.min(width - 1, x0 + 1), Math.min(height - 1, y0 + 1), tx * ty],
    ];

    for (let k = 0; k < coords.length; k += 1) {
      const [ix, iy, w] = coords[k]!;
      if (w <= 1e-5) continue;
      const idx = iy * width + ix;
      const contrib = alpha * w;
      const prev = rawCoverage[idx] ?? 0;
      rawCoverage[idx] = Math.min(1, prev + contrib * (contrib > prev ? 0.65 : 0.35));
      weightedDistSum[idx] = (weightedDistSum[idx] ?? 0) + contrib * distPx;
      weightSum[idx] = (weightSum[idx] ?? 0) + contrib;
      if (isWall) wallVote[idx] = (wallVote[idx] ?? 0) + contrib;
    }
  };

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const rawA = (input.silhouetteAlpha[y * width + x] ?? 0) * alphaScale;
      if (rawA <= 1e-3) continue;

      const centerFootY = footYAtX(input, x + 0.5);
      if (y > centerFootY + 0.5) continue;

      const centerHit = projectSilhouetteSampleToShadow(
        { x: x + 0.5, y: Math.min(centerFootY, y + 0.5) },
        { x: x + 0.5, y: centerFootY },
        input.lightSourcePoint,
        groundVp,
        input.wallCorner,
      );
      if (!centerHit) continue;

      if (Math.abs(centerFootY - (y + 0.5)) <= 1.0) {
        const gap = Math.hypot(centerHit.point.x - (x + 0.5), centerHit.point.y - centerFootY);
        if (gap < minFootContactGapPx) minFootContactGapPx = gap;
      }

      const topHit = projectSilhouetteSampleToShadow(
        { x: x + 0.5, y: Math.min(centerFootY, y) },
        { x: x + 0.5, y: centerFootY },
        input.lightSourcePoint,
        groundVp,
        input.wallCorner,
      );
      const stretchSpan = topHit
        ? Math.hypot(topHit.point.x - centerHit.point.x, topHit.point.y - centerHit.point.y) * 2
        : 1;
      const subSteps = clamp(Math.ceil(Math.max(2, stretchSpan * 1.5)), 2, 10);

      for (let sv = 0; sv < subSteps; sv += 1) {
        const sy = Math.min(centerFootY, y + (sv + 0.5) / subSteps);
        for (let su = 0; su < 2; su += 1) {
          const sx = x + (su + 0.5) * 0.5;
          const localFootY = footYAtX(input, sx);
          const hit = projectSilhouetteSampleToShadow(
            { x: sx, y: Math.min(localFootY, sy) },
            { x: sx, y: localFootY },
            input.lightSourcePoint,
            groundVp,
            input.wallCorner,
          );
          if (hit) splatBilinear(hit.point.x, hit.point.y, rawA, hit.travelDistancePx, hit.surface === "wall");
        }
      }
    }
  }

  const satWeight = buildSummedAreaTable(weightSum, width, height);
  const satDistWeight = buildSummedAreaTable(weightedDistSum, width, height);
  const satWallVote = buildSummedAreaTable(wallVote, width, height);

  const penumbraRadiusMapPx = new Float32Array(pixelCount);
  const localTravelDist = new Float32Array(pixelCount);
  const probeRadius = Math.max(1.5, maxPenumbraPx + 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const nearW = querySatBoxAverage(satWeight, width, height, x + 0.5, y + 0.5, probeRadius);
      if (nearW <= 1e-6) {
        penumbraRadiusMapPx[idx] = minPenumbraPx;
        continue;
      }
      const nearWD = querySatBoxAverage(satDistWeight, width, height, x + 0.5, y + 0.5, probeRadius);
      const directW = weightSum[idx] ?? 0;
      const avgDist = directW > 1e-3 ? (weightedDistSum[idx] ?? 0) / directW : nearWD / nearW;
      localTravelDist[idx] = avgDist;
      penumbraRadiusMapPx[idx] = clamp(minPenumbraPx + penumbraSlope * avgDist, minPenumbraPx, maxPenumbraPx);
    }
  }

  const satPass1 = buildSummedAreaTable(rawCoverage, width, height);
  const pass1Out = new Float32Array(pixelCount);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const r = (penumbraRadiusMapPx[idx] ?? minPenumbraPx) * 0.7;
      pass1Out[idx] = r <= 0.35
        ? (rawCoverage[idx] ?? 0)
        : querySatBoxAverage(satPass1, width, height, x + 0.5, y + 0.5, r);
    }
  }

  const satPass2 = buildSummedAreaTable(pass1Out, width, height);
  const shadowAlpha = new Float32Array(pixelCount);
  const surfaceMask = new Uint8Array(pixelCount);
  let groundShadowPixelCount = 0;
  let bentWallShadowPixelCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const r = (penumbraRadiusMapPx[idx] ?? minPenumbraPx) * 0.7;
      const blurred = r <= 0.35
        ? (pass1Out[idx] ?? 0)
        : querySatBoxAverage(satPass2, width, height, x + 0.5, y + 0.5, r);
      const falloff = 1 / (1 + distAttenuation * (localTravelDist[idx] ?? 0));
      const finalA = clamp(blurred * baseOpacity * falloff, 0, 1);
      shadowAlpha[idx] = finalA;

      if (finalA > 0.01) {
        const wNear = querySatBoxAverage(satWeight, width, height, x + 0.5, y + 0.5, Math.max(1.5, r + 1));
        const wallNear = querySatBoxAverage(satWallVote, width, height, x + 0.5, y + 0.5, Math.max(1.5, r + 1));
        if (wNear > 1e-6 && wallNear / wNear >= 0.5) {
          surfaceMask[idx] = 2;
          bentWallShadowPixelCount += 1;
        } else {
          surfaceMask[idx] = 1;
          groundShadowPixelCount += 1;
        }
      }
    }
  }

  return {
    width,
    height,
    shadowAlpha,
    surfaceMask,
    penumbraRadiusMapPx,
    groundShadowPixelCount,
    bentWallShadowPixelCount,
    minFootContactGapPx: Number.isFinite(minFootContactGapPx) ? minFootContactGapPx : 0,
    serverCostKrw: 0,
  };
}
