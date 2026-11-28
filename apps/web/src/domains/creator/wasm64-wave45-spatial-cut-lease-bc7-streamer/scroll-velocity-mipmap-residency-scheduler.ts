/**
 * Wave 45: 세로 스크롤 속도·줌 배율·현재 작업 컷 위치 기반 밉맵(LOD 0/1/2) 타일 상주 및
 * 프레임 예산(`2ms`) 준수 LRU+거리 가중치 VRAM 퇴거 스케줄러.
 */

export const DEFAULT_SCHEDULER_FRAME_BUDGET_MS = 2 as const;
export const MEDIUM_SCROLL_VELOCITY_PX_PER_SEC = 1_200 as const;
export const FAST_SCROLL_VELOCITY_PX_PER_SEC = 3_600 as const;
export const DEFAULT_LOOKAHEAD_HORIZON_SEC = 0.45 as const;
export const DEFAULT_MAX_UPLOADS_PER_FRAME = 48 as const;

/** `0`: 원본 해상도(1:1), `1`: 절반 해상도(1/2), `2`: 4분의 1 해상도(1/4). */
export type MipmapLodLevel = 0 | 1 | 2;

export type TileUploadScheduleReason =
  | "visible-active-cut"
  | "visible-viewport"
  | "velocity-prefetch"
  | "active-cut-context";

export interface ManuscriptTileCandidate {
  readonly tileId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cutId?: string;
  /** `LOD0` 기준 예상 GPU 상주 바이트(단색 0바이트 상수 타일은 `0`). */
  readonly baseLod0VramBytes: number;
}

export interface ResidentGpuTileState {
  readonly tileId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly cutId?: string;
  readonly residentLod: MipmapLodLevel;
  readonly vramBytes: number;
  readonly lastUsedTimestampMs: number;
  readonly pinned?: boolean;
}

export interface ActiveCutVerticalBounds {
  readonly topY: number;
  readonly bottomY: number;
}

export interface ScrollResidencyScheduleInput {
  readonly viewportTopY: number;
  readonly viewportHeightPx: number;
  readonly zoom: number;
  /** 세로 스크롤 속도(`px/s`). 양수(`+`)는 아래쪽 진행, 음수(`-`)는 위쪽 진행. */
  readonly scrollVelocityPxPerSec: number;
  readonly activeCutId?: string | null;
  readonly activeCutBoundsY?: ActiveCutVerticalBounds | null;
  readonly candidates: readonly ManuscriptTileCandidate[];
  readonly residentTiles: readonly ResidentGpuTileState[];
  readonly vramBudgetBytes: number;
  readonly nowTimestampMs: number;
  readonly frameBudgetMs?: number;
  readonly maxUploadsPerFrame?: number;
  readonly clockNowMs?: () => number;
}

export interface ScheduledTileUpload {
  readonly tileId: string;
  readonly targetLod: MipmapLodLevel;
  readonly priorityScore: number;
  readonly estimatedVramBytes: number;
  readonly netDeltaVramBytes: number;
  readonly reason: TileUploadScheduleReason;
}

export interface ScheduledTileEviction {
  readonly tileId: string;
  readonly freedVramBytes: number;
  readonly evictionScore: number;
}

export interface ScrollResidencySchedulePlan {
  readonly uploads: readonly ScheduledTileUpload[];
  readonly evictions: readonly ScheduledTileEviction[];
  readonly initialResidentBytes: number;
  readonly projectedResidentBytes: number;
  readonly vramBudgetBytes: number;
  readonly lookaheadWindowTopY: number;
  readonly lookaheadWindowBottomY: number;
  readonly dominantTargetLod: MipmapLodLevel;
  readonly elapsedMs: number;
  readonly budgetTruncated: boolean;
}

/** LOD 단계에 따른 예상 VRAM 바이트를 계산한다(`LOD1` ≈ 1/4, `LOD2` ≈ 1/16). */
export function estimateMipmapVramBytes(baseLod0VramBytes: number, lod: MipmapLodLevel): number {
  if (baseLod0VramBytes <= 0) return 0;
  if (lod === 0) return Math.ceil(baseLod0VramBytes);
  if (lod === 1) return Math.max(64, Math.ceil(baseLod0VramBytes / 4));
  return Math.max(32, Math.ceil(baseLod0VramBytes / 16));
}

function intervalsOverlap(aTop: number, aBottom: number, bTop: number, bBottom: number): boolean {
  return aBottom > bTop && aTop < bBottom;
}

function verticalDistanceToInterval(tileTop: number, tileBottom: number, winTop: number, winBottom: number): number {
  if (tileBottom < winTop) return winTop - tileBottom;
  if (tileTop > winBottom) return tileTop - winBottom;
  return 0;
}

function isTileInActiveCut(
  tileTop: number,
  tileBottom: number,
  tileCutId: string | undefined,
  activeCutId: string | null | undefined,
  activeCutBoundsY: ActiveCutVerticalBounds | null | undefined,
): boolean {
  if (activeCutId && tileCutId === activeCutId) return true;
  if (activeCutBoundsY) {
    return intervalsOverlap(tileTop, tileBottom, activeCutBoundsY.topY, activeCutBoundsY.bottomY);
  }
  return false;
}

/** 스크롤 속도와 줌 배율로부터 기본 목표 LOD 단계를 결정한다. */
export function resolveDominantMipmapLod(zoom: number, absScrollVelocityPxPerSec: number): MipmapLodLevel {
  if (absScrollVelocityPxPerSec >= FAST_SCROLL_VELOCITY_PX_PER_SEC || zoom < 0.35) {
    return 2;
  }
  if (absScrollVelocityPxPerSec >= MEDIUM_SCROLL_VELOCITY_PX_PER_SEC || zoom < 0.7) {
    return 1;
  }
  return 0;
}

/**
 * 작가의 스크롤 속도·줌·활성 컷을 반영하여 프레임 예산(`2ms`) 내에
 * 상주 승격/프리페치 목록과 VRAM 예산 준수 페이지 아웃 목록을 계산한다.
 */
export function scheduleScrollMipmapResidency(
  input: ScrollResidencyScheduleInput,
): ScrollResidencySchedulePlan {
  const clock = input.clockNowMs ?? (() => performance.now());
  const startedAtMs = clock();
  const frameBudgetMs = Math.max(0.2, input.frameBudgetMs ?? DEFAULT_SCHEDULER_FRAME_BUDGET_MS);
  const maxUploads = Math.max(1, Math.trunc(input.maxUploadsPerFrame ?? DEFAULT_MAX_UPLOADS_PER_FRAME));
  const vramBudgetBytes = Math.max(0, Math.trunc(input.vramBudgetBytes));

  const safeZoom = Math.max(0.05, input.zoom);
  const visibleSpanY = Math.max(64, input.viewportHeightPx / safeZoom);
  const visibleTopY = input.viewportTopY;
  const visibleBottomY = visibleTopY + visibleSpanY;

  const absVelocity = Math.abs(input.scrollVelocityPxPerSec);
  const dominantTargetLod = resolveDominantMipmapLod(safeZoom, absVelocity);
  const baseMarginY = Math.max(256, visibleSpanY * 0.25);
  const leadDistanceY = Math.min(8_192, (absVelocity / safeZoom) * DEFAULT_LOOKAHEAD_HORIZON_SEC);

  let lookaheadWindowTopY = visibleTopY - baseMarginY;
  let lookaheadWindowBottomY = visibleBottomY + baseMarginY;
  if (input.scrollVelocityPxPerSec > 0) {
    lookaheadWindowTopY = visibleTopY - baseMarginY * 0.5;
    lookaheadWindowBottomY = visibleBottomY + baseMarginY + leadDistanceY;
  } else if (input.scrollVelocityPxPerSec < 0) {
    lookaheadWindowTopY = visibleTopY - baseMarginY - leadDistanceY;
    lookaheadWindowBottomY = visibleBottomY + baseMarginY * 0.5;
  }

  const residentById = new Map<string, ResidentGpuTileState>();
  let initialResidentBytes = 0;
  for (const resident of input.residentTiles) {
    residentById.set(resident.tileId, resident);
    initialResidentBytes += Math.max(0, resident.vramBytes);
  }

  const rawUploads: ScheduledTileUpload[] = [];
  const keepProtectedIds = new Set<string>();
  let budgetTruncated = false;

  for (let idx = 0; idx < input.candidates.length; idx += 1) {
    if ((idx & 15) === 15 && clock() - startedAtMs >= frameBudgetMs) {
      budgetTruncated = true;
      break;
    }

    const candidate = input.candidates[idx];
    if (!candidate) continue;
    const tileTop = candidate.y;
    const tileBottom = candidate.y + candidate.height;

    const inVisible = intervalsOverlap(tileTop, tileBottom, visibleTopY, visibleBottomY);
    const inLookahead = intervalsOverlap(tileTop, tileBottom, lookaheadWindowTopY, lookaheadWindowBottomY);
    const inActiveCut = isTileInActiveCut(
      tileTop,
      tileBottom,
      candidate.cutId,
      input.activeCutId,
      input.activeCutBoundsY,
    );

    const distFromViewport = verticalDistanceToInterval(tileTop, tileBottom, visibleTopY, visibleBottomY);
    if (!inVisible && !inLookahead && !(inActiveCut && distFromViewport <= visibleSpanY * 1.5)) {
      continue;
    }

    let targetLod: MipmapLodLevel;
    let reason: TileUploadScheduleReason;

    if (inVisible) {
      if (inActiveCut) {
        reason = "visible-active-cut";
        targetLod = absVelocity >= FAST_SCROLL_VELOCITY_PX_PER_SEC && safeZoom < 0.5 ? 1 : 0;
      } else {
        reason = "visible-viewport";
        targetLod = dominantTargetLod;
      }
    } else if (inActiveCut && !inLookahead) {
      reason = "active-cut-context";
      targetLod = safeZoom >= 0.75 ? 1 : 2;
    } else if (absVelocity >= FAST_SCROLL_VELOCITY_PX_PER_SEC) {
      reason = "velocity-prefetch";
      targetLod = 2;
    } else {
      reason = inActiveCut ? "active-cut-context" : "velocity-prefetch";
      targetLod = inActiveCut && safeZoom >= 0.85 && absVelocity < MEDIUM_SCROLL_VELOCITY_PX_PER_SEC
        ? 0
        : (Math.max(1, dominantTargetLod) as MipmapLodLevel);
    }

    const existing = residentById.get(candidate.tileId);
    if (existing) {
      keepProtectedIds.add(candidate.tileId);
      if (existing.residentLod <= targetLod) {
        continue;
      }
    }

    const estimatedVramBytes = estimateMipmapVramBytes(candidate.baseLod0VramBytes, targetLod);
    const netDeltaVramBytes = estimatedVramBytes - (existing ? existing.vramBytes : 0);

    const directionalAlignBonus =
      (input.scrollVelocityPxPerSec > 0 && tileTop >= visibleTopY) ||
      (input.scrollVelocityPxPerSec < 0 && tileBottom <= visibleBottomY)
        ? 90
        : 0;

    const priorityScore =
      (inVisible ? 1_000 : 400) +
      (inActiveCut ? 320 : 0) +
      directionalAlignBonus -
      (distFromViewport / 256) * 28 -
      targetLod * 15;

    rawUploads.push({
      tileId: candidate.tileId,
      targetLod,
      priorityScore: Math.round(priorityScore * 100) / 100,
      estimatedVramBytes,
      netDeltaVramBytes,
      reason,
    });
  }

  rawUploads.sort((a, b) => b.priorityScore - a.priorityScore);

  const upgradingIds = new Set<string>(rawUploads.map((u) => u.tileId));
  const evictionPool: ScheduledTileEviction[] = [];

  for (const resident of input.residentTiles) {
    if (resident.pinned || upgradingIds.has(resident.tileId)) continue;
    const tileTop = resident.y;
    const tileBottom = resident.y + resident.height;
    const inVisible = intervalsOverlap(tileTop, tileBottom, visibleTopY, visibleBottomY);
    const inLookahead = intervalsOverlap(tileTop, tileBottom, lookaheadWindowTopY, lookaheadWindowBottomY);
    const inActiveCut = isTileInActiveCut(
      tileTop,
      tileBottom,
      resident.cutId,
      input.activeCutId,
      input.activeCutBoundsY,
    );

    const distPx = verticalDistanceToInterval(tileTop, tileBottom, visibleTopY, visibleBottomY);
    const effectiveDistPx = inLookahead ? distPx * 0.45 : distPx;
    const idleMs = Math.max(0, input.nowTimestampMs - resident.lastUsedTimestampMs);

    const visibilityTier = inVisible ? 0 : keepProtectedIds.has(resident.tileId) ? 400 : 1_200;
    const activeCutShield = inActiveCut ? -360 : 0;
    const evictionScore =
      visibilityTier +
      (idleMs / 1_000) * 30 +
      (effectiveDistPx / 256) * 45 +
      activeCutShield;

    evictionPool.push({
      tileId: resident.tileId,
      freedVramBytes: Math.max(0, resident.vramBytes),
      evictionScore: Math.round(evictionScore * 100) / 100,
    });
  }

  evictionPool.sort((a, b) => b.evictionScore - a.evictionScore);

  let projectedResidentBytes = initialResidentBytes;
  let evictionCursor = 0;
  const evictions: ScheduledTileEviction[] = [];

  const evictUntilWithin = (targetLimitBytes: number): boolean => {
    while (projectedResidentBytes > targetLimitBytes && evictionCursor < evictionPool.length) {
      const victim = evictionPool[evictionCursor];
      evictionCursor += 1;
      if (!victim) continue;
      projectedResidentBytes = Math.max(0, projectedResidentBytes - victim.freedVramBytes);
      evictions.push(victim);
    }
    return projectedResidentBytes <= targetLimitBytes;
  };

  // 이미 기존 상주 메모리가 예산을 초과한 경우 가장 점수가 높은 퇴거 대상부터 즉시 정리한다.
  evictUntilWithin(vramBudgetBytes);

  const admittedUploads: ScheduledTileUpload[] = [];
  for (const upload of rawUploads) {
    if (admittedUploads.length >= maxUploads) break;
    if (clock() - startedAtMs >= frameBudgetMs) {
      budgetTruncated = true;
      break;
    }

    if (upload.netDeltaVramBytes <= 0) {
      projectedResidentBytes = Math.max(0, projectedResidentBytes + upload.netDeltaVramBytes);
      admittedUploads.push(upload);
      continue;
    }

    const maxBeforeUpload = vramBudgetBytes - upload.netDeltaVramBytes;
    if (maxBeforeUpload < 0) continue;

    if (projectedResidentBytes <= maxBeforeUpload || evictUntilWithin(maxBeforeUpload)) {
      projectedResidentBytes += upload.netDeltaVramBytes;
      admittedUploads.push(upload);
    }
  }

  const elapsedMs = Math.max(0, Math.round((clock() - startedAtMs) * 1_000) / 1_000);

  return {
    uploads: admittedUploads,
    evictions,
    initialResidentBytes,
    projectedResidentBytes,
    vramBudgetBytes,
    lookaheadWindowTopY,
    lookaheadWindowBottomY,
    dominantTargetLod,
    elapsedMs,
    budgetTruncated,
  };
}
