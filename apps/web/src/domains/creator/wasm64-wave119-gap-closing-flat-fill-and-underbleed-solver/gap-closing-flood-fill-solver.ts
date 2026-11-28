/**
 * Wave 119 — 웹툰 선화 틈새 자동 밀봉(Gap-Closing) 및 4-연결/8-연결 버킷 플랫 채색 솔버.
 *
 * - `closeLineartGapsDeterministically`: 단순 전역 팽창 대신 잉크 윤곽 경계 픽셀 간의
 *   실효 틈새 폭(`effectiveGapWidthPx <= maxGapWidthPx`)과 잉크 연결 지오데식 우회 거리를
 *   결합해 좁은 선화 틈(2~6px, 수평·수직·대각)만 정밀 밀봉하고 넓은 통로(예: 14px 문)는
 *   그대로 관통시키는 결정론적 4-연결 슈퍼커버 브리지 마스크를 생성한다.
 * - `runGapClosingFloodFill`: 4-연결 또는 8-연결 버킷 채색을 실행하며 잘못된 시드·범위 밖
 *   좌표·잉크 위 시드·비유한 입력을 fail-closed로 거부한다.
 * - `compareNaiveVsGapClosedFloodFill`: 동일 선화 원고에서 일반 버킷 채색(Naive)과
 *   틈새 밀봉 채색(Gap-Closed)의 경계 누출 여부와 누출 차단 픽셀 수를 실측 비교한다.
 */

export type FloodFillConnectivity = 4 | 8;

export type GapClosingFailureCode =
  | "none"
  | "rejected-invalid-field"
  | "rejected-non-finite-alpha"
  | "rejected-invalid-options"
  | "rejected-non-finite-seed"
  | "rejected-out-of-bounds"
  | "rejected-seed-on-ink";

export interface LineartAlphaField {
  readonly width: number;
  readonly height: number;
  /** 길이 `width * height`의 선화 강도 버퍼(`0..1`, 안티앨리어싱 반투명 가장자리 포함). */
  readonly inkAlpha: Float32Array;
}

export interface PixelBoundingBox {
  readonly minX: number; readonly minY: number;
  readonly maxX: number; readonly maxY: number;
}

export interface GapClosingOptions {
  /** 자동 밀봉할 최대 틈새 폭(px, `0..8`, 기본 `4`). */
  readonly maxGapWidthPx?: number;
  /** 선화 경계로 판정할 최소 잉크 알파(`0 < inkThreshold <= 1`, 기본 `0.35`). */
  readonly inkThreshold?: number;
}

export interface DetectedGapSegment {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly effectiveGapWidthPx: number;
  readonly directDistancePx: number;
  readonly bridgePixelCount: number;
  readonly orientation: "horizontal" | "vertical" | "diagonal";
}

export interface GapClosingBarrierResult {
  readonly ok: boolean;
  readonly failureCode: GapClosingFailureCode;
  readonly reasonKo: string;
  readonly width: number; readonly height: number;
  readonly maxGapWidthPx: number; readonly inkThreshold: number;
  readonly sanitizedInkAlpha: Float32Array;
  readonly inkMask: Uint8Array;
  readonly bridgeMask: Uint8Array;
  readonly combinedBarrierMask: Uint8Array;
  readonly inkPixelCount: number;
  readonly closedGapPixelCount: number;
  readonly detectedGapSegments: readonly DetectedGapSegment[];
}

export interface GapClosingFloodFillOptions extends GapClosingOptions {
  readonly seedX: number; readonly seedY: number;
  readonly connectivity?: FloodFillConnectivity;
  /** 다중 구역 채색 시 이미 계산한 밀봉 경계를 재사용한다. */
  readonly precomputedBarrier?: GapClosingBarrierResult;
}

export interface GapClosingFloodFillResult {
  readonly ok: boolean;
  readonly status: "filled" | Exclude<GapClosingFailureCode, "none">;
  readonly reasonKo: string;
  readonly width: number; readonly height: number;
  readonly seedX: number; readonly seedY: number;
  readonly connectivity: FloodFillConnectivity;
  readonly maxGapWidthPx: number; readonly inkThreshold: number;
  readonly filledMask: Uint8Array;
  readonly filledPixelCount: number;
  readonly leakedToBorder: boolean;
  readonly borderContactPixelCount: number;
  readonly bridgePixelCount: number;
  readonly touchedBridgePixelCount: number;
  readonly boundingBox: PixelBoundingBox | null;
  readonly barrier: GapClosingBarrierResult;
}

export interface CompareNaiveVsGapClosedOptions extends GapClosingOptions {
  readonly seedX: number; readonly seedY: number;
  readonly connectivity?: FloodFillConnectivity;
  /** 선택적 정답 내부 마스크(주어지면 외부 누출 픽셀을 정확히 실측한다). */
  readonly expectedInteriorMask?: Uint8Array;
}

export interface NaiveVsGapClosedComparison {
  readonly ok: boolean;
  readonly width: number; readonly height: number;
  readonly seedX: number; readonly seedY: number;
  readonly connectivity: FloodFillConnectivity;
  readonly maxGapWidthPx: number; readonly inkThreshold: number;
  readonly naive: GapClosingFloodFillResult;
  readonly gapClosed: GapClosingFloodFillResult;
  readonly naiveFilledPixelCount: number;
  readonly gapClosedFilledPixelCount: number;
  readonly naiveLeakedToBorder: boolean;
  readonly gapClosedLeakedToBorder: boolean;
  readonly naiveLeakedPixels: number;
  readonly leakedPixels: number;
  readonly preventedLeakPixelCount: number;
  readonly sealEffective: boolean;
  readonly detectedGapCount: number;
  readonly bridgePixelCount: number;
}

export const MAX_SUPPORTED_GAP_WIDTH_PX = 8;
export const DEFAULT_GAP_WIDTH_PX = 4;
export const DEFAULT_INK_THRESHOLD = 0.35;
const MAX_FIELD_DIMENSION = 4096;
const GAP_WIDTH_EPSILON = 0.12;

interface CandidateGapPair {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly aIdx: number; readonly bIdx: number;
  readonly effectiveGapWidthPx: number;
  readonly directDistancePx: number;
  readonly minDetourSteps: number;
}

interface OffsetEntry {
  readonly dx: number; readonly dy: number;
  readonly directDist: number; readonly effectiveGapWidthPx: number;
}

const NEIGHBOR_4_DX = [1, -1, 0, 0] as const;
const NEIGHBOR_4_DY = [0, 0, 1, -1] as const;
const NEIGHBOR_8_DX = [1, -1, 0, 0, 1, -1, 1, -1] as const;
const NEIGHBOR_8_DY = [0, 0, 1, -1, 1, 1, -1, -1] as const;

/** 유한 숫자를 [0, 1] 범위로 고정한다. */
export function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return value >= 1 ? 1 : value;
}

function emptyBarrierFailure(
  failureCode: Exclude<GapClosingFailureCode, "none">,
  reasonKo: string,
  width: number,
  height: number,
  maxGapWidthPx: number,
  inkThreshold: number,
): GapClosingBarrierResult {
  const safeW = Number.isInteger(width) && width > 0 ? width : 0;
  const safeH = Number.isInteger(height) && height > 0 ? height : 0;
  const emptyMask = new Uint8Array(0);
  return {
    ok: false, failureCode, reasonKo, width: safeW, height: safeH,
    maxGapWidthPx, inkThreshold, sanitizedInkAlpha: new Float32Array(0),
    inkMask: emptyMask, bridgeMask: emptyMask, combinedBarrierMask: emptyMask,
    inkPixelCount: 0, closedGapPixelCount: 0, detectedGapSegments: [],
  };
}

/** 선화 알파 버퍼와 해상도의 유효성을 fail-closed 기준으로 검사한다. */
export function validateLineartField(
  field: LineartAlphaField,
): { readonly ok: true; readonly sanitizedInkAlpha: Float32Array } | {
  readonly ok: false;
  readonly failureCode: "rejected-invalid-field" | "rejected-non-finite-alpha";
  readonly reasonKo: string;
} {
  if (
    !Number.isInteger(field.width) || !Number.isInteger(field.height) ||
    field.width < 1 || field.height < 1 ||
    field.width > MAX_FIELD_DIMENSION || field.height > MAX_FIELD_DIMENSION
  ) {
    return {
      ok: false,
      failureCode: "rejected-invalid-field",
      reasonKo: `선화 해상도(${String(field.width)}×${String(field.height)})가 허용 범위(1..${String(MAX_FIELD_DIMENSION)})를 벗어났습니다.`,
    };
  }
  const expectedLength = field.width * field.height;
  if (!(field.inkAlpha instanceof Float32Array) || field.inkAlpha.length !== expectedLength) {
    return {
      ok: false,
      failureCode: "rejected-invalid-field",
      reasonKo: `inkAlpha 버퍼 길이가 width*height(${String(expectedLength)})와 일치하지 않습니다.`,
    };
  }
  const sanitized = new Float32Array(expectedLength);
  for (let i = 0; i < expectedLength; i += 1) {
    const raw = field.inkAlpha[i];
    if (!Number.isFinite(raw)) {
      return {
        ok: false,
        failureCode: "rejected-non-finite-alpha",
        reasonKo: `inkAlpha[${String(i)}]에 유한하지 않은 값(${String(raw)})이 들어 있어 처리를 중단했습니다.`,
      };
    }
    sanitized[i] = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
  }
  return { ok: true, sanitizedInkAlpha: sanitized };
}

function buildHalfDiskOffsets(maxGapWidthPx: number): readonly OffsetEntry[] {
  const maxRadius = Math.ceil(maxGapWidthPx) + 1;
  const entries: OffsetEntry[] = [];
  for (let dy = 0; dy <= maxRadius; dy += 1) {
    const minDx = dy === 0 ? 2 : -maxRadius;
    for (let dx = minDx; dx <= maxRadius; dx += 1) {
      const directDist = Math.hypot(dx, dy);
      if (directDist < 1.5) continue;
      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      const effectiveGapWidthPx = directDist - directDist / chebyshev;
      if (effectiveGapWidthPx <= maxGapWidthPx + GAP_WIDTH_EPSILON) {
        entries.push({ dx, dy, directDist, effectiveGapWidthPx });
      }
    }
  }
  return entries;
}

/**
 * 선분 A->B 내부의 4-연결 슈퍼커버 경로(끝점 제외)를 결정론적으로 추출한다.
 * 대각선 틈새에서도 8-연결 채색 누출이 생기지 않도록 직교 코너 보강 픽셀을 포함한다.
 */
function traceSupercoverInteriorIndices(
  ax: number, ay: number, bx: number, by: number, width: number, outIndices: number[],
): void {
  outIndices.length = 0;
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = bx >= ax ? 1 : -1;
  const sy = by >= ay ? 1 : -1;
  let x = ax;
  let y = ay;

  if (dx === 0) {
    for (let step = 1; step < dy; step += 1) { y += sy; outIndices.push(y * width + x); }
    return;
  }
  if (dy === 0) {
    for (let step = 1; step < dx; step += 1) { x += sx; outIndices.push(y * width + x); }
    return;
  }

  let err = dx - dy;
  while (x !== bx || y !== by) {
    const prevX = x;
    const prevY = y;
    const e2 = err * 2;
    let movedX = false;
    let movedY = false;
    if (e2 > -dy) { err -= dy; x += sx; movedX = true; }
    if (e2 < dx) { err += dx; y += sy; movedY = true; }
    if (movedX && movedY) {
      if (!(x === bx && prevY === by)) outIndices.push(prevY * width + x);
      else if (!(prevX === ax && y === ay)) outIndices.push(y * width + prevX);
    }
    if (x !== bx || y !== by) outIndices.push(y * width + x);
  }
}

/** 선분 A->B의 중심선(Bresenham) 내부 픽셀이 전부 비잉크인지 검사한다. */
function isOpenCorridorBetween(
  ax: number, ay: number, bx: number, by: number, width: number, inkMask: Uint8Array,
): boolean {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = bx >= ax ? 1 : -1;
  const sy = by >= ay ? 1 : -1;
  let x = ax;
  let y = ay;
  let err = dx - dy;
  let interiorCount = 0;
  while (true) {
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (x === bx && y === by) break;
    interiorCount += 1;
    if (inkMask[y * width + x] === 1) return false;
  }
  return interiorCount > 0;
}

function labelInkComponents8(inkMask: Uint8Array, width: number, height: number): Int32Array {
  const size = width * height;
  const labels = new Int32Array(size);
  const queue = new Int32Array(size);
  let nextLabel = 0;

  for (let startIdx = 0; startIdx < size; startIdx += 1) {
    if (inkMask[startIdx] === 0 || labels[startIdx] !== 0) continue;
    nextLabel += 1;
    labels[startIdx] = nextLabel;
    let head = 0;
    let tail = 1;
    queue[0] = startIdx;
    while (head < tail) {
      const cur = queue[head];
      head += 1;
      const cx = cur % width;
      const cy = (cur - cx) / width;
      for (let d = 0; d < 8; d += 1) {
        const nx = cx + NEIGHBOR_8_DX[d];
        const ny = cy + NEIGHBOR_8_DY[d];
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = ny * width + nx;
        if (inkMask[nIdx] === 1 && labels[nIdx] === 0) {
          labels[nIdx] = nextLabel;
          queue[tail] = nIdx;
          tail += 1;
        }
      }
    }
  }
  return labels;
}

function isReachableWithinGeodesicLimit(
  startIdx: number, targetIdx: number, barrierMask: Uint8Array,
  width: number, height: number, maxSteps: number,
  visitStamp: Int32Array, stamp: number, queueIdx: Int32Array, queueDist: Int32Array,
): boolean {
  if (startIdx === targetIdx) return true;
  let head = 0;
  let tail = 1;
  visitStamp[startIdx] = stamp;
  queueIdx[0] = startIdx;
  queueDist[0] = 0;

  while (head < tail) {
    const cur = queueIdx[head];
    const dist = queueDist[head];
    head += 1;
    if (dist >= maxSteps) continue;
    const cx = cur % width;
    const cy = (cur - cx) / width;
    const nextDist = dist + 1;
    for (let d = 0; d < 8; d += 1) {
      const nx = cx + NEIGHBOR_8_DX[d];
      const ny = cy + NEIGHBOR_8_DY[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (barrierMask[nIdx] === 0 || visitStamp[nIdx] === stamp) continue;
      if (nIdx === targetIdx) return true;
      visitStamp[nIdx] = stamp;
      queueIdx[tail] = nIdx;
      queueDist[tail] = nextDist;
      tail += 1;
    }
  }
  return false;
}

function classifyOrientation(dx: number, dy: number): "horizontal" | "vertical" | "diagonal" {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (ady === 0 || adx >= ady * 3) return "horizontal";
  if (adx === 0 || ady >= adx * 3) return "vertical";
  return "diagonal";
}

/**
 * 선화 강도 버퍼에서 `<= maxGapWidthPx`인 좁은 틈새만 정밀 식별해 결정론적으로 밀봉한다.
 * 직각 모서리 내부는 깎지 않으며 `> maxGapWidthPx`인 넓은 통로는 차단하지 않는다.
 */
export function closeLineartGapsDeterministically(
  field: LineartAlphaField,
  options: GapClosingOptions = {},
): GapClosingBarrierResult {
  const maxGapWidthPx = options.maxGapWidthPx ?? DEFAULT_GAP_WIDTH_PX;
  const inkThreshold = options.inkThreshold ?? DEFAULT_INK_THRESHOLD;

  if (
    !Number.isFinite(maxGapWidthPx) || maxGapWidthPx < 0 || maxGapWidthPx > MAX_SUPPORTED_GAP_WIDTH_PX ||
    !Number.isFinite(inkThreshold) || inkThreshold <= 0 || inkThreshold > 1
  ) {
    return emptyBarrierFailure(
      "rejected-invalid-options",
      `틈새 밀봉 옵션이 유효 범위를 벗어났습니다(maxGapWidthPx: 0..${String(MAX_SUPPORTED_GAP_WIDTH_PX)}, inkThreshold: (0, 1]).`,
      field.width, field.height, maxGapWidthPx, inkThreshold,
    );
  }

  const fieldCheck = validateLineartField(field);
  if (!fieldCheck.ok) {
    return emptyBarrierFailure(
      fieldCheck.failureCode, fieldCheck.reasonKo, field.width, field.height, maxGapWidthPx, inkThreshold,
    );
  }

  const { width, height } = field;
  const size = width * height;
  const sanitizedInkAlpha = fieldCheck.sanitizedInkAlpha;
  const inkMask = new Uint8Array(size);
  let inkPixelCount = 0;

  for (let i = 0; i < size; i += 1) {
    if (sanitizedInkAlpha[i] >= inkThreshold) { inkMask[i] = 1; inkPixelCount += 1; }
  }

  const bridgeMask = new Uint8Array(size);
  const combinedBarrierMask = new Uint8Array(inkMask);

  if (maxGapWidthPx === 0 || inkPixelCount < 2) {
    return {
      ok: true, failureCode: "none",
      reasonKo: "틈새 밀봉 폭이 0px이거나 선화 픽셀이 없어 원본 경계를 유지했습니다.",
      width, height, maxGapWidthPx, inkThreshold, sanitizedInkAlpha,
      inkMask, bridgeMask, combinedBarrierMask, inkPixelCount,
      closedGapPixelCount: 0, detectedGapSegments: [],
    };
  }

  // 1) 4-이웃 중 비잉크 셀을 접하는 잉크 윤곽 경계 픽셀 추출
  const isBoundary = new Uint8Array(size);
  const boundaryIndices: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const rowOff = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = rowOff + x;
      if (inkMask[idx] === 0) continue;
      const touchesOpen =
        (x > 0 && inkMask[idx - 1] === 0) || (x + 1 < width && inkMask[idx + 1] === 0) ||
        (y > 0 && inkMask[idx - width] === 0) || (y + 1 < height && inkMask[idx + width] === 0);
      if (touchesOpen) { isBoundary[idx] = 1; boundaryIndices.push(idx); }
    }
  }

  // 2) 잉크 8-연결 컴포넌트 라벨링 및 지오데식 BFS 워크스페이스 준비
  const componentLabels = labelInkComponents8(inkMask, width, height);
  const visitStamp = new Int32Array(size);
  const queueIdx = new Int32Array(size);
  const queueDist = new Int32Array(size);
  let stampCounter = 0;

  const offsets = buildHalfDiskOffsets(maxGapWidthPx);
  const candidates: CandidateGapPair[] = [];

  for (let i = 0; i < boundaryIndices.length; i += 1) {
    const aIdx = boundaryIndices[i];
    const ax = aIdx % width;
    const ay = (aIdx - ax) / width;
    const compA = componentLabels[aIdx];

    for (let o = 0; o < offsets.length; o += 1) {
      const off = offsets[o];
      const bx = ax + off.dx;
      const by = ay + off.dy;
      if (bx < 0 || bx >= width || by < 0 || by >= height) continue;
      const bIdx = by * width + bx;
      if (isBoundary[bIdx] === 0) continue;
      if (!isOpenCorridorBetween(ax, ay, bx, by, width, inkMask)) continue;

      const minDetourSteps = Math.max(8, Math.ceil(off.directDist * 3.0));
      if (compA === componentLabels[bIdx]) {
        stampCounter += 1;
        if (isReachableWithinGeodesicLimit(
          aIdx, bIdx, inkMask, width, height, minDetourSteps - 1, visitStamp, stampCounter, queueIdx, queueDist,
        )) continue;
      }

      candidates.push({
        ax, ay, bx, by, aIdx, bIdx,
        effectiveGapWidthPx: Math.round(off.effectiveGapWidthPx * 1000) / 1000,
        directDistancePx: Math.round(off.directDist * 1000) / 1000,
        minDetourSteps,
      });
    }
  }

  // 3) 최단 실효 틈새 폭 순 결정론적 정렬 후 중복 없는 최소 4-연결 브리지 설치
  candidates.sort((p, q) =>
    p.effectiveGapWidthPx - q.effectiveGapWidthPx ||
    p.directDistancePx - q.directDistancePx ||
    p.ay - q.ay || p.ax - q.ax || p.by - q.by || p.bx - q.bx,
  );

  const detectedGapSegments: DetectedGapSegment[] = [];
  const tempPath: number[] = [];
  let closedGapPixelCount = 0;

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    stampCounter += 1;
    if (isReachableWithinGeodesicLimit(
      c.aIdx, c.bIdx, combinedBarrierMask, width, height, c.minDetourSteps - 1, visitStamp, stampCounter, queueIdx, queueDist,
    )) continue;

    traceSupercoverInteriorIndices(c.ax, c.ay, c.bx, c.by, width, tempPath);
    let addedForSegment = 0;
    for (let k = 0; k < tempPath.length; k += 1) {
      const pIdx = tempPath[k];
      if (inkMask[pIdx] === 0 && bridgeMask[pIdx] === 0) {
        bridgeMask[pIdx] = 1;
        combinedBarrierMask[pIdx] = 1;
        addedForSegment += 1;
        closedGapPixelCount += 1;
      }
    }
    if (addedForSegment > 0) {
      detectedGapSegments.push({
        ax: c.ax, ay: c.ay, bx: c.bx, by: c.by,
        effectiveGapWidthPx: c.effectiveGapWidthPx,
        directDistancePx: c.directDistancePx,
        bridgePixelCount: addedForSegment,
        orientation: classifyOrientation(c.bx - c.ax, c.by - c.ay),
      });
    }
  }

  return {
    ok: true, failureCode: "none",
    reasonKo: closedGapPixelCount > 0
      ? `선화 틈새 ${String(detectedGapSegments.length)}곳(브리지 ${String(closedGapPixelCount)}px)을 결정론적으로 밀봉했습니다.`
      : "지정 폭 이내의 열린 선화 틈새가 없어 원본 경계를 그대로 사용했습니다.",
    width, height, maxGapWidthPx, inkThreshold, sanitizedInkAlpha,
    inkMask, bridgeMask, combinedBarrierMask, inkPixelCount, closedGapPixelCount, detectedGapSegments,
  };
}

function rejectedFloodFill(
  status: Exclude<GapClosingFailureCode, "none">, reasonKo: string,
  barrier: GapClosingBarrierResult, seedX: number, seedY: number, connectivity: FloodFillConnectivity,
): GapClosingFloodFillResult {
  return {
    ok: false, status, reasonKo, width: barrier.width, height: barrier.height,
    seedX, seedY, connectivity, maxGapWidthPx: barrier.maxGapWidthPx, inkThreshold: barrier.inkThreshold,
    filledMask: new Uint8Array(barrier.width * barrier.height), filledPixelCount: 0,
    leakedToBorder: false, borderContactPixelCount: 0, bridgePixelCount: barrier.closedGapPixelCount,
    touchedBridgePixelCount: 0, boundingBox: null, barrier,
  };
}

/**
 * 틈새 밀봉 경계 위에서 4-연결 또는 8-연결 버킷 채색을 결정론적으로 실행한다.
 * 잘못된 시드·범위 밖 좌표·선화 위 시드는 fail-closed 상태로 빈 마스크를 반환한다.
 */
export function runGapClosingFloodFill(
  field: LineartAlphaField,
  options: GapClosingFloodFillOptions,
): GapClosingFloodFillResult {
  const connectivity: FloodFillConnectivity = options.connectivity ?? 4;
  const maxGapWidthPx = options.maxGapWidthPx ?? DEFAULT_GAP_WIDTH_PX;
  const inkThreshold = options.inkThreshold ?? DEFAULT_INK_THRESHOLD;

  const barrier =
    options.precomputedBarrier ??
    closeLineartGapsDeterministically(field, { maxGapWidthPx, inkThreshold });

  if (!barrier.ok) {
    const failureStatus = barrier.failureCode === "none" ? "rejected-invalid-field" : barrier.failureCode;
    return rejectedFloodFill(failureStatus, barrier.reasonKo, barrier, options.seedX, options.seedY, connectivity);
  }
  if (connectivity !== 4 && connectivity !== 8) {
    return rejectedFloodFill(
      "rejected-invalid-options",
      `지원하지 않는 연결성(${String(connectivity)})입니다. 4 또는 8만 허용됩니다.`,
      barrier, options.seedX, options.seedY, 4,
    );
  }
  if (!Number.isFinite(options.seedX) || !Number.isFinite(options.seedY)) {
    return rejectedFloodFill(
      "rejected-non-finite-seed",
      `시드 좌표(${String(options.seedX)}, ${String(options.seedY)})가 유한 숫자가 아닙니다.`,
      barrier, options.seedX, options.seedY, connectivity,
    );
  }

  const sx = Math.floor(options.seedX);
  const sy = Math.floor(options.seedY);
  if (sx < 0 || sx >= barrier.width || sy < 0 || sy >= barrier.height) {
    return rejectedFloodFill(
      "rejected-out-of-bounds",
      `시드 좌표(${String(sx)}, ${String(sy)})가 캔버스 범위(0..${String(barrier.width - 1)}, 0..${String(barrier.height - 1)})를 벗어났습니다.`,
      barrier, sx, sy, connectivity,
    );
  }

  const startIdx = sy * barrier.width + sx;
  if (barrier.combinedBarrierMask[startIdx] === 1) {
    return rejectedFloodFill(
      "rejected-seed-on-ink",
      `시드 좌표(${String(sx)}, ${String(sy)})가 선화 또는 틈새 밀봉 경계 위에 놓여 채색을 건너뛰었습니다.`,
      barrier, sx, sy, connectivity,
    );
  }

  const { width, height, combinedBarrierMask, bridgeMask } = barrier;
  const size = width * height;
  const filledMask = new Uint8Array(size);
  const queue = new Int32Array(size);
  const touchedBridge = new Uint8Array(size);

  let head = 0;
  let tail = 1;
  filledMask[startIdx] = 1;
  queue[0] = startIdx;

  const dxTable = connectivity === 8 ? NEIGHBOR_8_DX : NEIGHBOR_4_DX;
  const dyTable = connectivity === 8 ? NEIGHBOR_8_DY : NEIGHBOR_4_DY;
  const dirCount = dxTable.length;

  let filledPixelCount = 0;
  let borderContactPixelCount = 0;
  let touchedBridgePixelCount = 0;
  let minX = width; let minY = height;
  let maxX = -1; let maxY = -1;

  while (head < tail) {
    const cur = queue[head];
    head += 1;
    filledPixelCount += 1;
    const cx = cur % width;
    const cy = (cur - cx) / width;

    if (cx < minX) minX = cx;
    if (cx > maxX) maxX = cx;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
    if (cx === 0 || cx === width - 1 || cy === 0 || cy === height - 1) borderContactPixelCount += 1;

    for (let d = 0; d < dirCount; d += 1) {
      const nx = cx + dxTable[d];
      const ny = cy + dyTable[d];
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nIdx = ny * width + nx;
      if (combinedBarrierMask[nIdx] === 1) {
        if (bridgeMask[nIdx] === 1 && touchedBridge[nIdx] === 0) {
          touchedBridge[nIdx] = 1;
          touchedBridgePixelCount += 1;
        }
        continue;
      }
      if (filledMask[nIdx] === 0) {
        filledMask[nIdx] = 1;
        queue[tail] = nIdx;
        tail += 1;
      }
    }
  }

  const leakedToBorder = borderContactPixelCount > 0;
  return {
    ok: true, status: "filled",
    reasonKo: leakedToBorder
      ? `채색 영역(${String(filledPixelCount)}px)이 캔버스 외곽 경계 ${String(borderContactPixelCount)}px에 닿았습니다.`
      : `경계 누출 없이 내부 ${String(filledPixelCount)}px를 채색했습니다.`,
    width, height, seedX: sx, seedY: sy, connectivity,
    maxGapWidthPx: barrier.maxGapWidthPx, inkThreshold: barrier.inkThreshold,
    filledMask, filledPixelCount, leakedToBorder, borderContactPixelCount,
    bridgePixelCount: barrier.closedGapPixelCount, touchedBridgePixelCount,
    boundingBox: filledPixelCount > 0 ? { minX, minY, maxX, maxY } : null,
    barrier,
  };
}

/**
 * 동일 선화·시드에서 일반 버킷 채색(Naive)과 틈새 밀봉 채색(Gap-Closed)을 실측 비교한다.
 */
export function compareNaiveVsGapClosedFloodFill(
  field: LineartAlphaField,
  options: CompareNaiveVsGapClosedOptions,
): NaiveVsGapClosedComparison {
  const maxGapWidthPx = options.maxGapWidthPx ?? DEFAULT_GAP_WIDTH_PX;
  const inkThreshold = options.inkThreshold ?? DEFAULT_INK_THRESHOLD;
  const connectivity: FloodFillConnectivity = options.connectivity ?? 4;

  const naive = runGapClosingFloodFill(field, {
    seedX: options.seedX, seedY: options.seedY, connectivity, maxGapWidthPx: 0, inkThreshold,
  });
  const gapClosed = runGapClosingFloodFill(field, {
    seedX: options.seedX, seedY: options.seedY, connectivity, maxGapWidthPx, inkThreshold,
  });

  let leakedPixels = 0;
  let naiveLeakedPixels = 0;
  const expected = options.expectedInteriorMask;

  if (expected && expected.length === gapClosed.filledMask.length) {
    for (let i = 0; i < expected.length; i += 1) {
      if (gapClosed.filledMask[i] === 1 && expected[i] === 0) leakedPixels += 1;
      if (naive.filledMask[i] === 1 && expected[i] === 0) naiveLeakedPixels += 1;
    }
  } else {
    leakedPixels = gapClosed.leakedToBorder ? gapClosed.borderContactPixelCount : 0;
    naiveLeakedPixels = naive.leakedToBorder
      ? Math.max(naive.borderContactPixelCount, naive.filledPixelCount - gapClosed.filledPixelCount)
      : 0;
  }

  const preventedLeakPixelCount = Math.max(0, naive.filledPixelCount - gapClosed.filledPixelCount);
  const sealEffective =
    naive.ok && gapClosed.ok && naive.leakedToBorder && !gapClosed.leakedToBorder && leakedPixels === 0;

  return {
    ok: naive.ok && gapClosed.ok,
    width: gapClosed.width, height: gapClosed.height,
    seedX: gapClosed.seedX, seedY: gapClosed.seedY,
    connectivity, maxGapWidthPx: gapClosed.maxGapWidthPx, inkThreshold: gapClosed.inkThreshold,
    naive, gapClosed,
    naiveFilledPixelCount: naive.filledPixelCount,
    gapClosedFilledPixelCount: gapClosed.filledPixelCount,
    naiveLeakedToBorder: naive.leakedToBorder,
    gapClosedLeakedToBorder: gapClosed.leakedToBorder,
    naiveLeakedPixels, leakedPixels, preventedLeakPixelCount, sealEffective,
    detectedGapCount: gapClosed.barrier.detectedGapSegments.length,
    bridgePixelCount: gapClosed.bridgePixelCount,
  };
}
