/**
 * 초고해상도(4K/5K/8K) · 비정수 DPR(125%/150%/175%) 엣지 픽셀 정렬 & VRAM 타일 예산기.
 *
 * - 비정수 배율에서도 1 물리 픽셀 헤어라인과 타일 경계를 정수 물리 픽셀에 스냅해 서브픽셀 번짐을 제거한다.
 * - 4K/5K/8K 디스플레이와 모바일 저메모리(256 MiB 이하) 환경에서 백킹 DPR과 프리페치 링을 적응적으로 제한해
 *   지정된 VRAM 상한(`vramBudgetMiB`)을 절대 초과하지 않도록 보장한다.
 * - 팬·줌 속도 벡터를 분석해 진행 방향 1-링/2-링 타일 프리페치 좌표와 LRU 퇴거 우선순위를 산출한다.
 */

export type UhdDisplayTier =
  | "fhd-standard"
  | "fractional-hidpi"
  | "uhd-4k"
  | "uhd-5k"
  | "uhd-8k"
  | "mobile-constrained";

export interface UhdEdgeRenderPlanInput {
  /** 뷰포트 너비 (CSS px) */
  readonly viewportCssWidth: number;
  /** 뷰포트 높이 (CSS px) */
  readonly viewportCssHeight: number;
  /** 디스플레이 장치 픽셀 비율 (1.0 ~ 3.0+, 비정수 1.25/1.5/1.75 포함) */
  readonly devicePixelRatio: number;
  /** 현재 캔버스 줌 배율 (1.0 = 100%) */
  readonly zoom: number;
  /** 수평 팬 속도 (CSS px/s, 양수는 뷰포트가 +X 방향으로 이동) */
  readonly panVelocityX: number;
  /** 수직 팬 속도 (CSS px/s, 양수는 뷰포트가 +Y 방향으로 이동) */
  readonly panVelocityY: number;
  /** 선택: 줌 변화 속도 (초당 배율 변화, 음수는 줌 아웃) */
  readonly zoomVelocity?: number;
  /** 허용 VRAM 상한 (MiB, 기본 512) */
  readonly vramBudgetMiB?: number;
  /** 타일 한 변 크기 (물리 px, 기본 256) */
  readonly tileSizePx?: number;
  /** 픽셀당 바이트 수 (RGBA16F=8, RGBA8=4, 기본 8) */
  readonly bytesPerPixel?: 4 | 8;
  /** 스왑체인 버퍼 수 (기본 2: 더블 버퍼링) */
  readonly swapchainBuffers?: number;
  /** 뷰포트 원점 X (CSS px, 기본 0) */
  readonly viewportOriginX?: number;
  /** 뷰포트 원점 Y (CSS px, 기본 0) */
  readonly viewportOriginY?: number;
}

export interface PhysicalPixelSnapMatrix {
  /** CSS -> 물리 픽셀 X 스케일 */
  readonly a: number;
  readonly b: number;
  readonly c: number;
  /** CSS -> 물리 픽셀 Y 스케일 */
  readonly d: number;
  /** 비정수 DPR 위상 보정 X (물리 px) */
  readonly tx: number;
  /** 비정수 DPR 위상 보정 Y (물리 px) */
  readonly ty: number;
  readonly cssToPhysicalScale: number;
  readonly physicalToCssScale: number;
  readonly hairlineStrokeWidthCss: number;
  readonly isFractionalDpr: boolean;
}

export interface TileRectBounds {
  readonly minTileX: number;
  readonly maxTileX: number;
  readonly minTileY: number;
  readonly maxTileY: number;
  readonly columns: number;
  readonly rows: number;
  readonly totalTiles: number;
}

export interface PrefetchTileCandidate {
  readonly key: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly ring: 1 | 2;
  /** 팬 속도 벡터와의 코사인 유사도 (-1 ~ +1, 진행 방향일수록 +1) */
  readonly directionalAlignment: number;
  /** 프리페치 우선순위 (높을수록 먼저 업로드) */
  readonly prefetchPriority: number;
  /** LRU 퇴거 우선순위 (높을수록 먼저 회수) */
  readonly evictionPriority: number;
}

export interface ResidentTileEntry {
  readonly key: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly lastUsedFrame: number;
  readonly pinned?: boolean;
}

export interface UhdTileMemoryBreakdown {
  readonly vramBudgetMiB: number;
  readonly swapchainMiB: number;
  readonly singleTileMiB: number;
  readonly visibleTileCount: number;
  readonly visibleTilesMiB: number;
  readonly prefetchTileCount: number;
  readonly prefetchTilesMiB: number;
  readonly totalEstimatedVramMiB: number;
  readonly headroomMiB: number;
  readonly maxResidentTiles: number;
  readonly withinBudget: boolean;
}

export interface UhdEdgeRenderPlan {
  readonly displayTier: UhdDisplayTier;
  readonly requestedDpr: number;
  readonly effectiveBackingDpr: number;
  readonly dprClamped: boolean;
  readonly clampReason: "none" | "vram-budget" | "mobile-memory-guard";
  readonly backingWidthPx: number;
  readonly backingHeightPx: number;
  readonly tileSizePx: number;
  readonly zoom: number;
  readonly hairlineStrokeWidthCss: number;
  readonly snapMatrix: PhysicalPixelSnapMatrix;
  readonly visibleBounds: TileRectBounds;
  readonly activePrefetchRings: 0 | 1 | 2;
  readonly panSpeedCssPerSec: number;
  readonly panDirectionX: number;
  readonly panDirectionY: number;
  readonly prefetchTiles: readonly PrefetchTileCandidate[];
  readonly evictionQueue: readonly PrefetchTileCandidate[];
  readonly memory: UhdTileMemoryBreakdown;
}

export interface SnappedCssRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly physicalX: number;
  readonly physicalY: number;
  readonly physicalWidth: number;
  readonly physicalHeight: number;
}

const BYTES_PER_MIB = 1024 * 1024;
const MIN_DPR_BOUND = 0.25;
const MAX_DPR_BOUND = 4.0;
const FAST_PAN_THRESHOLD_PX_PER_SEC = 280;
const MIN_PAN_SPEED_EPSILON = 1e-3;
const RING2_DIRECTIONAL_CONE_COS = 0.15;

function sanitizePositive(value: number | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeFinite(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return value;
}

/** 유효 DPR을 안전 범위로 정규화한다. */
export function normalizeDevicePixelRatio(dpr: number): number {
  return sanitizePositive(dpr, 1, MIN_DPR_BOUND, MAX_DPR_BOUND);
}

/** 비정수 DPR 포함 임의 배율에서 정확히 1 물리 픽셀에 해당하는 CSS 선 두께를 계산한다. */
export function hairlineStrokeWidthCss(devicePixelRatio: number): number {
  const safeDpr = normalizeDevicePixelRatio(devicePixelRatio);
  return 1 / safeDpr;
}

/** CSS 좌표를 가장 가까운 정수 물리 픽셀 경계로 스냅해 CSS 좌표로 반환한다. */
export function snapEdgeToPhysicalPixel(cssCoord: number, devicePixelRatio: number): number {
  const safeDpr = normalizeDevicePixelRatio(devicePixelRatio);
  const safeCoord = sanitizeFinite(cssCoord, 0);
  return Math.round(safeCoord * safeDpr) / safeDpr;
}

/**
 * 1px 홀수 물리 선 두께(헤어라인 등)의 중심 좌표를 `k + 0.5` 물리 픽셀에 맞춰
 * 양쪽 가장자리가 정확히 정수 물리 픽셀에 떨어지도록 정렬한다.
 */
export function snapStrokeCenterToPhysicalPixel(
  cssCoord: number,
  devicePixelRatio: number,
  strokePhysicalPx = 1,
): number {
  const safeDpr = normalizeDevicePixelRatio(devicePixelRatio);
  const safeCoord = sanitizeFinite(cssCoord, 0);
  const roundedStroke = Math.max(1, Math.round(sanitizePositive(strokePhysicalPx, 1, 1, 64)));
  if (roundedStroke % 2 === 1) {
    return (Math.floor(safeCoord * safeDpr) + 0.5) / safeDpr;
  }
  return Math.round(safeCoord * safeDpr) / safeDpr;
}

/** 주어진 CSS 좌표가 정수 물리 픽셀 경계에서 벗어난 서브픽셀 오차(물리 px 단위)를 측정한다. */
export function measurePhysicalPixelSnapError(cssCoord: number, devicePixelRatio: number): number {
  const safeDpr = normalizeDevicePixelRatio(devicePixelRatio);
  const scaled = sanitizeFinite(cssCoord, 0) * safeDpr;
  return Math.abs(scaled - Math.round(scaled));
}

/** 사각형의 네 경계를 물리 픽셀에 개별 정렬해 인접 타일 간 1px 틈새·겹침을 제거한다. */
export function snapRectToPhysicalPixels(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  devicePixelRatio: number,
): SnappedCssRect {
  const safeDpr = normalizeDevicePixelRatio(devicePixelRatio);
  const leftPx = Math.round(sanitizeFinite(rect.x, 0) * safeDpr);
  const topPx = Math.round(sanitizeFinite(rect.y, 0) * safeDpr);
  const rightPx = Math.max(leftPx, Math.round((sanitizeFinite(rect.x, 0) + Math.max(0, sanitizeFinite(rect.width, 0))) * safeDpr));
  const bottomPx = Math.max(topPx, Math.round((sanitizeFinite(rect.y, 0) + Math.max(0, sanitizeFinite(rect.height, 0))) * safeDpr));
  const physicalWidth = rightPx - leftPx;
  const physicalHeight = bottomPx - topPx;
  return {
    x: leftPx / safeDpr,
    y: topPx / safeDpr,
    width: physicalWidth / safeDpr,
    height: physicalHeight / safeDpr,
    physicalX: leftPx,
    physicalY: topPx,
    physicalWidth,
    physicalHeight,
  };
}

/** 비정수 DPR 환경에서 원점 위상 오차를 보정하는 2D 물리 픽셀 스냅 행렬을 생성한다. */
export function buildPhysicalPixelSnapMatrix(
  devicePixelRatio: number,
  viewportOriginX = 0,
  viewportOriginY = 0,
): PhysicalPixelSnapMatrix {
  const safeDpr = normalizeDevicePixelRatio(devicePixelRatio);
  const safeOriginX = sanitizeFinite(viewportOriginX, 0);
  const safeOriginY = sanitizeFinite(viewportOriginY, 0);
  const rawPhaseX = safeOriginX * safeDpr;
  const rawPhaseY = safeOriginY * safeDpr;
  const tx = Math.round(rawPhaseX) - rawPhaseX;
  const ty = Math.round(rawPhaseY) - rawPhaseY;
  const isFractionalDpr = Math.abs(safeDpr - Math.round(safeDpr)) > 1e-6;

  return {
    a: safeDpr,
    b: 0,
    c: 0,
    d: safeDpr,
    tx,
    ty,
    cssToPhysicalScale: safeDpr,
    physicalToCssScale: 1 / safeDpr,
    hairlineStrokeWidthCss: 1 / safeDpr,
    isFractionalDpr,
  };
}

function computeVisibleTileBounds(
  viewportCssWidth: number,
  viewportCssHeight: number,
  originX: number,
  originY: number,
  dpr: number,
  tileSizePx: number,
): TileRectBounds {
  const physMinX = Math.floor(originX * dpr);
  const physMinY = Math.floor(originY * dpr);
  const backingWidthPx = Math.max(1, Math.round(viewportCssWidth * dpr));
  const backingHeightPx = Math.max(1, Math.round(viewportCssHeight * dpr));
  const physMaxX = physMinX + backingWidthPx;
  const physMaxY = physMinY + backingHeightPx;

  const minTileX = Math.floor(physMinX / tileSizePx);
  const maxTileX = Math.floor((physMaxX - 1) / tileSizePx);
  const minTileY = Math.floor(physMinY / tileSizePx);
  const maxTileY = Math.floor((physMaxY - 1) / tileSizePx);

  const columns = Math.max(1, maxTileX - minTileX + 1);
  const rows = Math.max(1, maxTileY - minTileY + 1);

  return {
    minTileX,
    maxTileX,
    minTileY,
    maxTileY,
    columns,
    rows,
    totalTiles: columns * rows,
  };
}

interface CoreMemoryFootprint {
  readonly backingWidthPx: number;
  readonly backingHeightPx: number;
  readonly swapchainMiB: number;
  readonly visibleBounds: TileRectBounds;
  readonly visibleTilesMiB: number;
  readonly baseRequiredMiB: number;
}

function evaluateCoreFootprint(
  viewportCssWidth: number,
  viewportCssHeight: number,
  originX: number,
  originY: number,
  dpr: number,
  tileSizePx: number,
  bytesPerPixel: number,
  swapchainBuffers: number,
  singleTileMiB: number,
): CoreMemoryFootprint {
  const backingWidthPx = Math.max(1, Math.round(viewportCssWidth * dpr));
  const backingHeightPx = Math.max(1, Math.round(viewportCssHeight * dpr));
  const swapchainMiB = (backingWidthPx * backingHeightPx * bytesPerPixel * swapchainBuffers) / BYTES_PER_MIB;
  const visibleBounds = computeVisibleTileBounds(
    viewportCssWidth,
    viewportCssHeight,
    originX,
    originY,
    dpr,
    tileSizePx,
  );
  const visibleTilesMiB = visibleBounds.totalTiles * singleTileMiB;
  return {
    backingWidthPx,
    backingHeightPx,
    swapchainMiB,
    visibleBounds,
    visibleTilesMiB,
    baseRequiredMiB: swapchainMiB + visibleTilesMiB,
  };
}

function solveBudgetSafeDpr(
  requestedDpr: number,
  viewportCssWidth: number,
  viewportCssHeight: number,
  originX: number,
  originY: number,
  tileSizePx: number,
  bytesPerPixel: number,
  swapchainBuffers: number,
  singleTileMiB: number,
  vramBudgetMiB: number,
): { readonly effectiveDpr: number; readonly footprint: CoreMemoryFootprint; readonly clamped: boolean } {
  const fullFootprint = evaluateCoreFootprint(
    viewportCssWidth,
    viewportCssHeight,
    originX,
    originY,
    requestedDpr,
    tileSizePx,
    bytesPerPixel,
    swapchainBuffers,
    singleTileMiB,
  );

  if (fullFootprint.baseRequiredMiB <= vramBudgetMiB) {
    return { effectiveDpr: requestedDpr, footprint: fullFootprint, clamped: false };
  }

  let low = 0.1;
  let high = requestedDpr;
  let bestDpr = low;
  let bestFootprint = evaluateCoreFootprint(
    viewportCssWidth,
    viewportCssHeight,
    originX,
    originY,
    low,
    tileSizePx,
    bytesPerPixel,
    swapchainBuffers,
    singleTileMiB,
  );

  for (let i = 0; i < 24; i += 1) {
    const mid = (low + high) * 0.5;
    const candidate = evaluateCoreFootprint(
      viewportCssWidth,
      viewportCssHeight,
      originX,
      originY,
      mid,
      tileSizePx,
      bytesPerPixel,
      swapchainBuffers,
      singleTileMiB,
    );
    if (candidate.baseRequiredMiB <= vramBudgetMiB) {
      bestDpr = mid;
      bestFootprint = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }

  // 0.05 단위 선명 스텝으로 내림 정렬(가능한 경우 분수 스냅 깔끔화)
  const quantized = Math.floor(bestDpr * 20) / 20;
  if (quantized >= 0.25) {
    const qFootprint = evaluateCoreFootprint(
      viewportCssWidth,
      viewportCssHeight,
      originX,
      originY,
      quantized,
      tileSizePx,
      bytesPerPixel,
      swapchainBuffers,
      singleTileMiB,
    );
    if (qFootprint.baseRequiredMiB <= vramBudgetMiB) {
      return { effectiveDpr: quantized, footprint: qFootprint, clamped: true };
    }
  }

  return {
    effectiveDpr: Number(bestDpr.toFixed(4)),
    footprint: bestFootprint,
    clamped: true,
  };
}

function classifyDisplayTier(
  requestedBackingWidth: number,
  requestedBackingHeight: number,
  requestedDpr: number,
  vramBudgetMiB: number,
  dprClamped: boolean,
): UhdDisplayTier {
  if (vramBudgetMiB <= 256 && dprClamped) {
    return "mobile-constrained";
  }
  const requestedPixels = requestedBackingWidth * requestedBackingHeight;
  if (requestedPixels >= 25_000_000) return "uhd-8k";
  if (requestedPixels >= 12_000_000) return "uhd-5k";
  if (requestedPixels >= 7_000_000) return "uhd-4k";
  if (Math.abs(requestedDpr - Math.round(requestedDpr)) > 1e-6) return "fractional-hidpi";
  if (vramBudgetMiB <= 256) return "mobile-constrained";
  return "fhd-standard";
}

function buildPrefetchCandidates(
  bounds: TileRectBounds,
  desiredRings: 0 | 1 | 2,
  dirX: number,
  dirY: number,
  hasMotion: boolean,
  isZoomingOut: boolean,
): PrefetchTileCandidate[] {
  if (desiredRings === 0) return [];

  const centerX = (bounds.minTileX + bounds.maxTileX) * 0.5;
  const centerY = (bounds.minTileY + bounds.maxTileY) * 0.5;
  const candidates: PrefetchTileCandidate[] = [];

  for (let ring = 1; ring <= desiredRings; ring += 1) {
    const r = ring as 1 | 2;
    const minX = bounds.minTileX - r;
    const maxX = bounds.maxTileX + r;
    const minY = bounds.minTileY - r;
    const maxY = bounds.maxTileY + r;

    for (let ty = minY; ty <= maxY; ty += 1) {
      for (let tx = minX; tx <= maxX; tx += 1) {
        const isRingBorder = tx === minX || tx === maxX || ty === minY || ty === maxY;
        if (!isRingBorder) continue;

        const dx = tx - centerX;
        const dy = ty - centerY;
        const dist = Math.hypot(dx, dy);
        const ux = dist > 1e-6 ? dx / dist : 0;
        const uy = dist > 1e-6 ? dy / dist : 0;
        const directionalAlignment = hasMotion ? ux * dirX + uy * dirY : 0;

        // 2-링은 이동 방향 전방 콘(또는 줌아웃 시 전방위)으로 집중해 VRAM 낭비 방지
        if (r === 2 && hasMotion && !isZoomingOut && directionalAlignment < RING2_DIRECTIONAL_CONE_COS) {
          continue;
        }

        const crossMag = hasMotion ? Math.abs(ux * dirY - uy * dirX) : 0;
        const ringBase = r === 1 ? 100 : 60;
        const prefetchPriority = Number((ringBase + directionalAlignment * 45 + (1 - crossMag) * 5).toFixed(4));
        const evictionPriority = Number((r * 50 - directionalAlignment * 45).toFixed(4));

        candidates.push({
          key: `${tx}:${ty}`,
          tileX: tx,
          tileY: ty,
          ring: r,
          directionalAlignment: Number(directionalAlignment.toFixed(4)),
          prefetchPriority,
          evictionPriority,
        });
      }
    }
  }

  candidates.sort((left, right) => {
    if (right.prefetchPriority !== left.prefetchPriority) {
      return right.prefetchPriority - left.prefetchPriority;
    }
    if (left.tileY !== right.tileY) return left.tileY - right.tileY;
    return left.tileX - right.tileX;
  });

  return candidates;
}

/**
 * 4K/5K/8K · 비정수 DPR 환경의 물리 픽셀 스냅 행렬, 적응형 백킹 DPR,
 * VRAM 상한 준수 타일 메모리 및 속도 기반 프리페치/LRU 퇴거 계획을 계산한다.
 */
export function computeUhdEdgeRenderPlan(input: UhdEdgeRenderPlanInput): UhdEdgeRenderPlan {
  const viewportCssWidth = sanitizePositive(input.viewportCssWidth, 1920, 1, 32768);
  const viewportCssHeight = sanitizePositive(input.viewportCssHeight, 1080, 1, 32768);
  const requestedDpr = normalizeDevicePixelRatio(input.devicePixelRatio);
  const zoom = sanitizePositive(input.zoom, 1, 0.05, 64);
  const panVelocityX = sanitizeFinite(input.panVelocityX, 0);
  const panVelocityY = sanitizeFinite(input.panVelocityY, 0);
  const zoomVelocity = sanitizeFinite(input.zoomVelocity, 0);
  const vramBudgetMiB = sanitizePositive(input.vramBudgetMiB, 512, 16, 32768);
  const tileSizePx = Math.round(sanitizePositive(input.tileSizePx, 256, 64, 1024));
  const bytesPerPixel: 4 | 8 = input.bytesPerPixel === 4 ? 4 : 8;
  const swapchainBuffers = Math.round(sanitizePositive(input.swapchainBuffers, 2, 1, 4));
  const originX = sanitizeFinite(input.viewportOriginX, 0);
  const originY = sanitizeFinite(input.viewportOriginY, 0);

  const singleTileMiB = (tileSizePx * tileSizePx * bytesPerPixel) / BYTES_PER_MIB;

  const { effectiveDpr, footprint, clamped } = solveBudgetSafeDpr(
    requestedDpr,
    viewportCssWidth,
    viewportCssHeight,
    originX,
    originY,
    tileSizePx,
    bytesPerPixel,
    swapchainBuffers,
    singleTileMiB,
    vramBudgetMiB,
  );

  const panSpeedCssPerSec = Math.hypot(panVelocityX, panVelocityY);
  const hasMotion = panSpeedCssPerSec > MIN_PAN_SPEED_EPSILON;
  const panDirectionX = hasMotion ? panVelocityX / panSpeedCssPerSec : 0;
  const panDirectionY = hasMotion ? panVelocityY / panSpeedCssPerSec : 0;
  const isZoomingOut = zoomVelocity < -0.1;

  const desiredRings: 0 | 1 | 2 =
    panSpeedCssPerSec >= FAST_PAN_THRESHOLD_PX_PER_SEC || isZoomingOut ? 2 : 1;

  const remainingForPrefetchMiB = Math.max(0, vramBudgetMiB - footprint.baseRequiredMiB);
  const maxPrefetchTileSlots = Math.floor(remainingForPrefetchMiB / singleTileMiB);

  const allCandidates =
    maxPrefetchTileSlots > 0
      ? buildPrefetchCandidates(
          footprint.visibleBounds,
          desiredRings,
          panDirectionX,
          panDirectionY,
          hasMotion,
          isZoomingOut,
        )
      : [];

  const prefetchTiles = allCandidates.slice(0, maxPrefetchTileSlots);
  const evictionQueue = [...prefetchTiles].sort((left, right) => {
    if (right.evictionPriority !== left.evictionPriority) {
      return right.evictionPriority - left.evictionPriority;
    }
    if (left.tileY !== right.tileY) return left.tileY - right.tileY;
    return left.tileX - right.tileX;
  });

  const activePrefetchRings: 0 | 1 | 2 = prefetchTiles.some((tile) => tile.ring === 2)
    ? 2
    : prefetchTiles.length > 0
      ? 1
      : 0;

  const prefetchTilesMiB = prefetchTiles.length * singleTileMiB;
  const totalEstimatedVramMiB = footprint.swapchainMiB + footprint.visibleTilesMiB + prefetchTilesMiB;
  const maxResidentTiles = Math.max(0, Math.floor((vramBudgetMiB - footprint.swapchainMiB) / singleTileMiB));

  const requestedBackingWidth = Math.max(1, Math.round(viewportCssWidth * requestedDpr));
  const requestedBackingHeight = Math.max(1, Math.round(viewportCssHeight * requestedDpr));
  const displayTier = classifyDisplayTier(
    requestedBackingWidth,
    requestedBackingHeight,
    requestedDpr,
    vramBudgetMiB,
    clamped,
  );

  const clampReason: UhdEdgeRenderPlan["clampReason"] = !clamped
    ? "none"
    : vramBudgetMiB <= 256
      ? "mobile-memory-guard"
      : "vram-budget";

  const snapMatrix = buildPhysicalPixelSnapMatrix(effectiveDpr, originX, originY);

  return {
    displayTier,
    requestedDpr,
    effectiveBackingDpr: effectiveDpr,
    dprClamped: clamped,
    clampReason,
    backingWidthPx: footprint.backingWidthPx,
    backingHeightPx: footprint.backingHeightPx,
    tileSizePx,
    zoom,
    hairlineStrokeWidthCss: snapMatrix.hairlineStrokeWidthCss,
    snapMatrix,
    visibleBounds: footprint.visibleBounds,
    activePrefetchRings,
    panSpeedCssPerSec: Number(panSpeedCssPerSec.toFixed(3)),
    panDirectionX: Number(panDirectionX.toFixed(4)),
    panDirectionY: Number(panDirectionY.toFixed(4)),
    prefetchTiles,
    evictionQueue,
    memory: {
      vramBudgetMiB,
      swapchainMiB: Number(footprint.swapchainMiB.toFixed(4)),
      singleTileMiB: Number(singleTileMiB.toFixed(4)),
      visibleTileCount: footprint.visibleBounds.totalTiles,
      visibleTilesMiB: Number(footprint.visibleTilesMiB.toFixed(4)),
      prefetchTileCount: prefetchTiles.length,
      prefetchTilesMiB: Number(prefetchTilesMiB.toFixed(4)),
      totalEstimatedVramMiB: Number(totalEstimatedVramMiB.toFixed(4)),
      headroomMiB: Number(Math.max(0, vramBudgetMiB - totalEstimatedVramMiB).toFixed(4)),
      maxResidentTiles,
      withinBudget: totalEstimatedVramMiB <= vramBudgetMiB + 1e-6,
    },
  };
}

/**
 * 상주 타일 목록에서 현재 뷰포트 보호 타일과 pinned 타일을 제외하고
 * 진행 반대 방향 + 오래된 프레임(LRU) 순서로 회수 대상 타일을 정렬한다.
 */
export function rankResidentTilesForEviction(
  residentTiles: readonly ResidentTileEntry[],
  plan: UhdEdgeRenderPlan,
): readonly ResidentTileEntry[] {
  const { visibleBounds, panDirectionX, panDirectionY, panSpeedCssPerSec } = plan;
  const hasMotion = panSpeedCssPerSec > MIN_PAN_SPEED_EPSILON;
  const centerX = (visibleBounds.minTileX + visibleBounds.maxTileX) * 0.5;
  const centerY = (visibleBounds.minTileY + visibleBounds.maxTileY) * 0.5;

  const evictable = residentTiles.filter((tile) => {
    if (tile.pinned) return false;
    const isVisible =
      tile.tileX >= visibleBounds.minTileX &&
      tile.tileX <= visibleBounds.maxTileX &&
      tile.tileY >= visibleBounds.minTileY &&
      tile.tileY <= visibleBounds.maxTileY;
    return !isVisible;
  });

  const scoreTile = (tile: ResidentTileEntry): number => {
    const dx = tile.tileX - centerX;
    const dy = tile.tileY - centerY;
    const dist = Math.hypot(dx, dy);
    const alignment = hasMotion && dist > 1e-6 ? (dx / dist) * panDirectionX + (dy / dist) * panDirectionY : 0;
    const ringDist = Math.max(
      Math.max(visibleBounds.minTileX - tile.tileX, tile.tileX - visibleBounds.maxTileX, 0),
      Math.max(visibleBounds.minTileY - tile.tileY, tile.tileY - visibleBounds.maxTileY, 0),
    );
    // 진행 반대 방향(-alignment)이고 멀수록 점수 상승 → 먼저 퇴거
    return ringDist * 50 - alignment * 45;
  };

  return [...evictable].sort((left, right) => {
    const scoreDiff = scoreTile(right) - scoreTile(left);
    if (Math.abs(scoreDiff) > 1e-6) return scoreDiff;
    if (left.lastUsedFrame !== right.lastUsedFrame) return left.lastUsedFrame - right.lastUsedFrame;
    return left.key.localeCompare(right.key);
  });
}
