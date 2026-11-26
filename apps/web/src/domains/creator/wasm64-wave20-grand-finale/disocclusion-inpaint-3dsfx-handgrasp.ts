/**
 * Wasm64 Wave 20 Grand Finale — 다중 평면 패럴랙스 가림 해제 인페인팅 · 3D 투시 돌출 효과음 메쉬 · 15-DOF 손 파지 IK 솔버.
 *
 * 1. 다중 평면 패럴랙스 가림 해제 고속 전진(Fast-Marching) 복원 솔버:
 *    카메라 시차 이동 때 전경 캐릭터 뒤쪽에서 드러나는 빈 구멍(Disocclusion Hole)을
 *    Telea 식 에이코날(Eikonal) 경계 전진과 등조도선(Isophote) 접선 외삽으로 메운다.
 *    전경 깊이 샘플을 원천 배제하고 배경 깊이 표본만 참조해 전경 윤곽 번짐(Halo)과 빈 틈을 모두 없앤다.
 * 2. 3D 투시 돌출·베벨 한글 효과음 메쉬 빌더 (`perspective-sfx-3d-mesh` 재공개)
 * 3. 해부학 15-DOF 손 파지 및 표면 접촉 IK 솔버 (`hand-grasp-contact-ik` 재공개)
 */

export {
  buildPerspectiveSfx3dMesh,
  createPresetKoreanSfxContours,
  verifyWatertightTwoManifold,
  type ManifoldVerificationReport,
  type Point2D,
  type Sfx3dExtrudedMesh,
  type Sfx3dExtrudeInput,
  type SfxGlyphContour2D,
  type SfxMeshFaceRole,
  type Vec3,
} from "./perspective-sfx-3d-mesh";

export {
  DISTAL_TENDON_COUPLING_RATIO,
  evaluatePrimitiveSdf,
  HAND_TOTAL_ACTUATED_DOF,
  solveAnatomicalHandGraspIk,
  type DigitSolvedKinematics,
  type GraspTargetPrimitive,
  type HandDigitName,
  type HandGraspSolveInput,
  type HandGraspSolveResult,
} from "./hand-grasp-contact-ik";

export interface ParallaxDisocclusionOptions {
  /** 배경으로 인정할 최소 정규화 깊이(0=근경 전경, 1=원경 배경, 기본값 0.5) */
  readonly backgroundMinDepth?: number;
  /** 에이코날 주변 표본 탐색 반경(px, 기본값 3) */
  readonly marchRadiusPx?: number;
  /** 등조도선 접선 방향 가중치 강도(기본값 2.4) */
  readonly isophoteStrength?: number;
  /** 색상 기울기 1차 테일러 외삽 계수(기본값 0.6) */
  readonly gradientExtrapScale?: number;
}

export interface ParallaxDisocclusionInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly depth: Float32Array;
  readonly holeMask: Uint8Array;
  readonly cameraShiftPx?: { readonly dx: number; readonly dy: number };
  readonly options?: ParallaxDisocclusionOptions;
}

export interface ParallaxDisocclusionResult {
  readonly width: number;
  readonly height: number;
  readonly inpaintedRgba: Uint8ClampedArray;
  readonly inpaintedDepth: Float32Array;
  readonly filledHolePixelCount: number;
  readonly remainingHoleCount: number;
  readonly rejectedForegroundSampleCount: number;
  readonly fallbackSeededCount: number;
  readonly maxArrivalDistancePx: number;
  readonly serverCostKrw: 0;
}

export interface ParallaxProjectionInput {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array | Uint8ClampedArray;
  readonly depth: Float32Array;
  readonly cameraShiftPx: { readonly dx: number; readonly dy: number };
  readonly backgroundMinDepth?: number;
}

export interface ParallaxProjectionFrame {
  readonly width: number;
  readonly height: number;
  readonly warpedRgba: Uint8ClampedArray;
  readonly warpedDepth: Float32Array;
  readonly holeMask: Uint8Array;
  readonly holePixelCount: number;
}

const FMM_KNOWN = 0;
const FMM_BAND = 1;
const FMM_INSIDE = 2;
const INF_TIME = 1e12;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 인덱스 추적형 최소 힙(에이코날 도달 시간 정렬용). */
class IndexedMinHeap {
  private readonly heap: Int32Array;
  private readonly pos: Int32Array;
  private readonly keys: Float64Array;
  private length = 0;

  constructor(capacity: number, keys: Float64Array) {
    this.heap = new Int32Array(capacity);
    this.pos = new Int32Array(capacity).fill(-1);
    this.keys = keys;
  }

  get size(): number {
    return this.length;
  }

  pushOrDecrease(pixelIdx: number): void {
    const existing = this.pos[pixelIdx]!;
    if (existing >= 0) {
      this.siftUp(existing);
      return;
    }
    const at = this.length++;
    this.heap[at] = pixelIdx;
    this.pos[pixelIdx] = at;
    this.siftUp(at);
  }

  popMin(): number {
    const top = this.heap[0]!;
    this.pos[top] = -1;
    this.length--;
    if (this.length > 0) {
      const moved = this.heap[this.length]!;
      this.heap[0] = moved;
      this.pos[moved] = 0;
      this.siftDown(0);
    }
    return top;
  }

  private less(aIdx: number, bIdx: number): boolean {
    const ka = this.keys[aIdx]!;
    const kb = this.keys[bIdx]!;
    return ka !== kb ? ka < kb : aIdx < bIdx;
  }

  private swap(i: number, j: number): void {
    const vi = this.heap[i]!;
    const vj = this.heap[j]!;
    this.heap[i] = vj;
    this.heap[j] = vi;
    this.pos[vj] = i;
    this.pos[vi] = j;
  }

  private siftUp(idx: number): void {
    let cur = idx;
    while (cur > 0) {
      const parent = (cur - 1) >> 1;
      if (!this.less(this.heap[cur]!, this.heap[parent]!)) break;
      this.swap(cur, parent);
      cur = parent;
    }
  }

  private siftDown(idx: number): void {
    let cur = idx;
    while (true) {
      const left = cur * 2 + 1;
      const right = left + 1;
      let smallest = cur;
      if (left < this.length && this.less(this.heap[left]!, this.heap[smallest]!)) smallest = left;
      if (right < this.length && this.less(this.heap[right]!, this.heap[smallest]!)) smallest = right;
      if (smallest === cur) break;
      this.swap(cur, smallest);
      cur = smallest;
    }
  }
}

/** 다중 평면 깊이 버퍼와 카메라 시차 이동으로부터 전경 이동 뒤 드러나는 가림 해제 마스크를 계산한다. */
export function projectParallaxWithDisocclusionMask(
  input: ParallaxProjectionInput,
): ParallaxProjectionFrame {
  const { width, height, rgba, depth, cameraShiftPx } = input;
  const total = width * height;
  const warpedRgba = new Uint8ClampedArray(total * 4);
  const warpedDepth = new Float32Array(total).fill(2);
  const covered = new Uint8Array(total);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = y * width + x;
      const d = clamp(depth[srcIdx] ?? 1, 0, 1);
      const disparity = 1 - d;
      const dstX = Math.round(x + cameraShiftPx.dx * disparity);
      const dstY = Math.round(y + cameraShiftPx.dy * disparity);
      if (dstX < 0 || dstX >= width || dstY < 0 || dstY >= height) continue;
      const dstIdx = dstY * width + dstX;
      if (covered[dstIdx] === 0 || d < warpedDepth[dstIdx]! - 1e-5) {
        covered[dstIdx] = 1;
        warpedDepth[dstIdx] = d;
        const sOff = srcIdx * 4;
        const dOff = dstIdx * 4;
        warpedRgba[dOff] = rgba[sOff]!;
        warpedRgba[dOff + 1] = rgba[sOff + 1]!;
        warpedRgba[dOff + 2] = rgba[sOff + 2]!;
        warpedRgba[dOff + 3] = rgba[sOff + 3]!;
      }
    }
  }

  const holeMask = new Uint8Array(total);
  let holePixelCount = 0;
  for (let i = 0; i < total; i++) {
    if (covered[i] === 0) {
      holeMask[i] = 1;
      warpedDepth[i] = 1;
      holePixelCount++;
    }
  }
  return { width, height, warpedRgba, warpedDepth, holeMask, holePixelCount };
}

function solveEikonalStep(
  x: number,
  y: number,
  width: number,
  height: number,
  state: Uint8Array,
  eligible: Uint8Array,
  arrival: Float64Array,
): number {
  let tx = INF_TIME;
  if (x > 0) {
    const l = y * width + (x - 1);
    if (state[l] === FMM_KNOWN && eligible[l] === 1 && arrival[l]! < tx) tx = arrival[l]!;
  }
  if (x + 1 < width) {
    const r = y * width + (x + 1);
    if (state[r] === FMM_KNOWN && eligible[r] === 1 && arrival[r]! < tx) tx = arrival[r]!;
  }
  let ty = INF_TIME;
  if (y > 0) {
    const u = (y - 1) * width + x;
    if (state[u] === FMM_KNOWN && eligible[u] === 1 && arrival[u]! < ty) ty = arrival[u]!;
  }
  if (y + 1 < height) {
    const d = (y + 1) * width + x;
    if (state[d] === FMM_KNOWN && eligible[d] === 1 && arrival[d]! < ty) ty = arrival[d]!;
  }
  const minT = Math.min(tx, ty);
  if (minT >= INF_TIME) return INF_TIME;
  const diff = Math.abs(tx - ty);
  return diff < 1 ? 0.5 * (tx + ty + Math.sqrt(Math.max(0, 2 - diff * diff))) : minT + 1;
}

function pixelLuma(rgba: Uint8ClampedArray, idx: number): number {
  const o = idx * 4;
  return (0.2126 * rgba[o]! + 0.7152 * rgba[o + 1]! + 0.0722 * rgba[o + 2]!) / 255;
}

/** 다중 평면 패럴랙스 가림 해제 영역을 배경 전용 에이코날 경계 전진과 등조도선 접선 외삽으로 복원한다. */
export function inpaintParallaxDisocclusion(
  input: ParallaxDisocclusionInput,
): ParallaxDisocclusionResult {
  const { width, height, rgba, depth, holeMask, options } = input;
  if (width <= 0 || height <= 0) {
    throw new RangeError("캔버스 가로·세로 크기는 1 이상이어야 합니다.");
  }
  const total = width * height;
  if (rgba.length < total * 4 || depth.length < total || holeMask.length < total) {
    throw new RangeError("입력 RGBA·깊이·마스크 버퍼 길이가 해상도와 일치하지 않습니다.");
  }

  const bgMinDepth = clamp(options?.backgroundMinDepth ?? 0.5, 0, 1);
  const radius = Math.max(1, Math.min(8, Math.round(options?.marchRadiusPx ?? 3)));
  const isoStrength = Math.max(0, options?.isophoteStrength ?? 2.4);
  const gradScale = clamp(options?.gradientExtrapScale ?? 0.6, 0, 1);

  const outRgba = new Uint8ClampedArray(total * 4);
  outRgba.set(rgba.subarray(0, total * 4));
  const outDepth = new Float32Array(total);
  outDepth.set(depth.subarray(0, total));

  const state = new Uint8Array(total);
  const bgEligible = new Uint8Array(total);
  const arrival = new Float64Array(total).fill(INF_TIME);
  let totalHoles = 0;

  for (let i = 0; i < total; i++) {
    if (holeMask[i]! > 0) {
      state[i] = FMM_INSIDE;
      totalHoles++;
    } else {
      state[i] = FMM_KNOWN;
      arrival[i] = 0;
      if (outDepth[i]! >= bgMinDepth) bgEligible[i] = 1;
    }
  }

  if (totalHoles === 0) {
    return {
      width,
      height,
      inpaintedRgba: outRgba,
      inpaintedDepth: outDepth,
      filledHolePixelCount: 0,
      remainingHoleCount: 0,
      rejectedForegroundSampleCount: 0,
      fallbackSeededCount: 0,
      maxArrivalDistancePx: 0,
      serverCostKrw: 0,
    };
  }

  const heap = new IndexedMinHeap(total, arrival);
  const dirs = [-1, 0, 1, 0, 0, -1, 0, 1];

  const seedBandFromEligibleNeighbors = (allowForegroundFallback: boolean): number => {
    let seeded = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (state[idx] !== FMM_INSIDE) continue;
        let hasValidKnown = false;
        for (let k = 0; k < 8; k += 2) {
          const nx = x + dirs[k]!;
          const ny = y + dirs[k + 1]!;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nIdx = ny * width + nx;
          if (state[nIdx] === FMM_KNOWN) {
            if (allowForegroundFallback) bgEligible[nIdx] = 1;
            if (bgEligible[nIdx] === 1) hasValidKnown = true;
          }
        }
        if (hasValidKnown) {
          state[idx] = FMM_BAND;
          arrival[idx] = solveEikonalStep(x, y, width, height, state, bgEligible, arrival);
          heap.pushOrDecrease(idx);
          seeded++;
        }
      }
    }
    return seeded;
  };

  seedBandFromEligibleNeighbors(false);

  let filledCount = 0;
  let rejectedFgSamples = 0;
  let fallbackSeededCount = 0;
  let maxArrivalDistancePx = 0;

  const runMarchLoop = (): void => {
    while (heap.size > 0) {
      const idx = heap.popMin();
      if (state[idx] === FMM_KNOWN) continue;
      const px = idx % width;
      const py = (idx - px) / width;

      const tLeft = px > 0 && arrival[idx - 1]! < INF_TIME ? arrival[idx - 1]! : arrival[idx]!;
      const tRight = px + 1 < width && arrival[idx + 1]! < INF_TIME ? arrival[idx + 1]! : arrival[idx]!;
      const tUp = py > 0 && arrival[idx - width]! < INF_TIME ? arrival[idx - width]! : arrival[idx]!;
      const tDown = py + 1 < height && arrival[idx + width]! < INF_TIME ? arrival[idx + width]! : arrival[idx]!;
      let nTx = (tRight - tLeft) * 0.5;
      let nTy = (tDown - tUp) * 0.5;
      const nLen = Math.hypot(nTx, nTy);
      if (nLen > 1e-6) {
        nTx /= nLen;
        nTy /= nLen;
      } else {
        nTx = 1;
        nTy = 0;
      }

      let sumW = 0, sumR = 0, sumG = 0, sumB = 0, sumD = 0;
      let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        const qy = py + dy;
        if (qy < 0 || qy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx === 0 && dy === 0) continue;
          const distSq = dx * dx + dy * dy;
          if (distSq > radius * radius) continue;
          const qx = px + dx;
          if (qx < 0 || qx >= width) continue;
          const qIdx = qy * width + qx;
          if (state[qIdx] !== FMM_KNOWN) continue;
          if (bgEligible[qIdx] === 0) {
            rejectedFgSamples++;
            continue;
          }

          const dist = Math.sqrt(distSq);
          const rx = -dx;
          const ry = -dy;
          const dirW = Math.max(1e-4, Math.abs(rx * nTx + ry * nTy) / dist);
          const dstW = 1 / distSq;
          const levW = 1 / (1 + Math.abs(arrival[idx]! - arrival[qIdx]!));

          const qL = qx > 0 && state[qIdx - 1] === FMM_KNOWN && bgEligible[qIdx - 1] === 1 ? qIdx - 1 : qIdx;
          const qR = qx + 1 < width && state[qIdx + 1] === FMM_KNOWN && bgEligible[qIdx + 1] === 1 ? qIdx + 1 : qIdx;
          const qU = qy > 0 && state[qIdx - width] === FMM_KNOWN && bgEligible[qIdx - width] === 1 ? qIdx - width : qIdx;
          const qD = qy + 1 < height && state[qIdx + width] === FMM_KNOWN && bgEligible[qIdx + width] === 1 ? qIdx + width : qIdx;
          const spanX = qR === qL ? 1 : qR - qL;
          const spanY = qD === qU ? 1 : (qD - qU) / width;

          const ix = qR === qL ? 0 : (pixelLuma(outRgba, qR) - pixelLuma(outRgba, qL)) / spanX;
          const iy = qD === qU ? 0 : (pixelLuma(outRgba, qD) - pixelLuma(outRgba, qU)) / spanY;
          const tauX = -iy;
          const tauY = ix;
          const tauMag = Math.hypot(tauX, tauY);
          const isoAlign = tauMag > 1e-4 ? Math.abs(rx * tauX + ry * tauY) / (dist * tauMag) : 0;
          const w = dirW * dstW * levW * (1 + isoStrength * isoAlign);

          const qo = qIdx * 4;
          const cr = outRgba[qo]!;
          const cg = outRgba[qo + 1]!;
          const cb = outRgba[qo + 2]!;
          if (cr < minR) minR = cr;
          if (cr > maxR) maxR = cr;
          if (cg < minG) minG = cg;
          if (cg > maxG) maxG = cg;
          if (cb < minB) minB = cb;
          if (cb > maxB) maxB = cb;

          const grX = qR === qL ? 0 : (outRgba[qR * 4]! - outRgba[qL * 4]!) / spanX;
          const grY = qD === qU ? 0 : (outRgba[qD * 4]! - outRgba[qU * 4]!) / spanY;
          const ggX = qR === qL ? 0 : (outRgba[qR * 4 + 1]! - outRgba[qL * 4 + 1]!) / spanX;
          const ggY = qD === qU ? 0 : (outRgba[qD * 4 + 1]! - outRgba[qU * 4 + 1]!) / spanY;
          const gbX = qR === qL ? 0 : (outRgba[qR * 4 + 2]! - outRgba[qL * 4 + 2]!) / spanX;
          const gbY = qD === qU ? 0 : (outRgba[qD * 4 + 2]! - outRgba[qU * 4 + 2]!) / spanY;

          sumW += w;
          sumR += w * (cr + gradScale * (grX * rx + grY * ry));
          sumG += w * (cg + gradScale * (ggX * rx + ggY * ry));
          sumB += w * (cb + gradScale * (gbX * rx + gbY * ry));
          sumD += w * outDepth[qIdx]!;
        }
      }

      const po = idx * 4;
      if (sumW > 0) {
        outRgba[po] = Math.round(clamp(sumR / sumW, minR, maxR));
        outRgba[po + 1] = Math.round(clamp(sumG / sumW, minG, maxG));
        outRgba[po + 2] = Math.round(clamp(sumB / sumW, minB, maxB));
        outRgba[po + 3] = 255;
        outDepth[idx] = Math.max(bgMinDepth, sumD / sumW);
      } else {
        outRgba[po + 3] = 255;
        outDepth[idx] = Math.max(bgMinDepth, outDepth[idx]!);
      }

      state[idx] = FMM_KNOWN;
      bgEligible[idx] = 1;
      filledCount++;
      if (arrival[idx]! < INF_TIME && arrival[idx]! > maxArrivalDistancePx) {
        maxArrivalDistancePx = arrival[idx]!;
      }

      for (let k = 0; k < 8; k += 2) {
        const nx = px + dirs[k]!;
        const ny = py + dirs[k + 1]!;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (state[nIdx] === FMM_KNOWN) continue;
        const nextT = solveEikonalStep(nx, ny, width, height, state, bgEligible, arrival);
        if (state[nIdx] === FMM_INSIDE) {
          state[nIdx] = FMM_BAND;
          arrival[nIdx] = nextT;
          heap.pushOrDecrease(nIdx);
        } else if (nextT < arrival[nIdx]!) {
          arrival[nIdx] = nextT;
          heap.pushOrDecrease(nIdx);
        }
      }
    }
  };

  runMarchLoop();
  if (filledCount < totalHoles) {
    fallbackSeededCount = seedBandFromEligibleNeighbors(true);
    runMarchLoop();
  }

  let remainingHoleCount = 0;
  for (let i = 0; i < total; i++) {
    if (state[i] !== FMM_KNOWN) remainingHoleCount++;
  }

  return {
    width,
    height,
    inpaintedRgba: outRgba,
    inpaintedDepth: outDepth,
    filledHolePixelCount: filledCount,
    remainingHoleCount,
    rejectedForegroundSampleCount: rejectedFgSamples,
    fallbackSeededCount,
    maxArrivalDistancePx,
    serverCostKrw: 0,
  };
}
