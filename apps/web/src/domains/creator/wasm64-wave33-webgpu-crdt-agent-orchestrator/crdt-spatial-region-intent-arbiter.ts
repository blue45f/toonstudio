/**
 * Wasm64 Wave 33: 실시간 공동 작업 서브컷 공간 의도 중재기 (`crdt-spatial-region-intent-arbiter`).
 *
 * - 공동 작업자의 활성 공간 의도 임대(`cutId` + `layerId` + 패딩 AABB + `toolKind` + `ttlMs` + `lamportClock` + `authorId`)를 추적한다.
 * - 스트로크 커밋 전에 동일 컷·동일 레이어에서 겹치는 쓰기 의도를 선제 감지하고,
 *   단순 열람·스포이드 도구(`read`)나 서로 다른 레이어·비중첩 영역 편집은 무충돌로 통과시킨다.
 * - 만료 시각(`expiresAtMs <= nowMs`)이 지난 정체 임대를 결정론적으로 회수하며,
 *   동시 경합 청구는 `(lamportClock, authorId)` 전순서(total order)로 모든 피어에서 동일 승자로 수렴시킨다.
 */

export const DEFAULT_SPATIAL_LEASE_TTL_MS = 2500 as const;
export const DEFAULT_STROKE_AABB_PADDING_PX = 16 as const;

export type CollaboratorMutatingToolKind =
  | "airbrush"
  | "bucket-fill"
  | "eraser"
  | "lasso-transform"
  | "lettering-edit"
  | "pen-ink";

export type CollaboratorReadOnlyToolKind =
  | "eyedropper-pick"
  | "measure-ruler"
  | "pan-view"
  | "zoom-loupe";

export type CollaboratorToolKind = CollaboratorMutatingToolKind | CollaboratorReadOnlyToolKind;

export type SpatialAccessMode = "read" | "write";

export type SpatialRelationClassification =
  | "conflicting-same-layer-write"
  | "disjoint-cut"
  | "disjoint-layer"
  | "disjoint-space"
  | "non-conflicting-read-tool"
  | "same-author-renewal";

export interface RawSpatialRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SpatialIntentAabb {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface SpatialClaimOrderKey {
  readonly lamportClock: number;
  readonly authorId: string;
}

export interface SpatialIntentClaimInput {
  readonly leaseId?: string;
  readonly authorId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly strokeRect: RawSpatialRect;
  readonly paddingPx?: number;
  readonly toolKind: CollaboratorToolKind;
  readonly ttlMs?: number;
  readonly lamportClock: number;
}

export interface SpatialIntentLease {
  readonly leaseId: string;
  readonly authorId: string;
  readonly cutId: string;
  readonly layerId: string;
  readonly paddedAabb: SpatialIntentAabb;
  readonly toolKind: CollaboratorToolKind;
  readonly accessMode: SpatialAccessMode;
  readonly lamportClock: number;
  readonly issuedAtMs: number;
  readonly ttlMs: number;
  readonly expiresAtMs: number;
}

export interface SpatialIntentArbiterState {
  readonly lamportClock: number;
  readonly activeLeases: readonly SpatialIntentLease[];
}

export interface SpatialLeaseExpiryResult {
  readonly nextState: SpatialIntentArbiterState;
  readonly expiredLeases: readonly SpatialIntentLease[];
}

export interface EvaluatedLeaseRelation {
  readonly existingLease: SpatialIntentLease;
  readonly classification: SpatialRelationClassification;
  readonly overlapAreaPx2: number;
}

export interface PreStrokeConflictInspection {
  readonly hasConflict: boolean;
  readonly candidateAccessMode: SpatialAccessMode;
  readonly candidatePaddedAabb: SpatialIntentAabb;
  readonly blockingLeases: readonly SpatialIntentLease[];
  readonly relations: readonly EvaluatedLeaseRelation[];
}

export interface SpatialClaimArbitrationResult {
  readonly granted: boolean;
  readonly lease: SpatialIntentLease;
  readonly blockingLeases: readonly SpatialIntentLease[];
  readonly preemptedLeases: readonly SpatialIntentLease[];
  readonly expiredLeases: readonly SpatialIntentLease[];
  readonly nextState: SpatialIntentArbiterState;
}

export interface RejectedSimultaneousClaim {
  readonly claim: SpatialIntentLease;
  readonly blockingLeases: readonly SpatialIntentLease[];
}

export interface SimultaneousClaimsResolution {
  readonly acceptedLeases: readonly SpatialIntentLease[];
  readonly rejectedClaims: readonly RejectedSimultaneousClaim[];
  readonly expiredLeases: readonly SpatialIntentLease[];
  readonly nextState: SpatialIntentArbiterState;
}

const READ_ONLY_TOOLS: ReadonlySet<CollaboratorToolKind> = new Set<CollaboratorToolKind>([
  "eyedropper-pick",
  "measure-ruler",
  "pan-view",
  "zoom-loupe",
]);

/**
 * 협업 도구가 캔버스 픽셀·벡터·식자 데이터를 변경하는 쓰기 도구인지 판별한다.
 */
export function isMutatingCollaboratorTool(toolKind: CollaboratorToolKind): boolean {
  return !READ_ONLY_TOOLS.has(toolKind);
}

/**
 * 도구 종류로부터 공간 접근 모드(`"read"` 또는 `"write"`)를 결정한다.
 */
export function resolveToolAccessMode(toolKind: CollaboratorToolKind): SpatialAccessMode {
  return isMutatingCollaboratorTool(toolKind) ? "write" : "read";
}

function compareStringsCodePoint(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * `(lamportClock, authorId)` 결정론적 전순서(total order)를 비교한다.
 * 음수면 `a`가 더 앞선(우선순위가 높은) 청구이며, 양수면 `b`가 더 앞선 청구다.
 */
export function compareClaimTotalOrder(a: SpatialClaimOrderKey, b: SpatialClaimOrderKey): number {
  const clockDiff = Math.floor(a.lamportClock) - Math.floor(b.lamportClock);
  if (clockDiff !== 0) return clockDiff;
  return compareStringsCodePoint(a.authorId, b.authorId);
}

/**
 * 원시 스트로크 사각형에 브러시 반경·손떨림 여유분(`paddingPx`)을 더한 정규화 AABB를 만든다.
 */
export function padSpatialIntentAabb(
  rect: RawSpatialRect,
  paddingPx: number = DEFAULT_STROKE_AABB_PADDING_PX,
): SpatialIntentAabb {
  const safePad = Math.max(0, Number.isFinite(paddingPx) ? paddingPx : 0);
  const x0 = Math.min(rect.x, rect.x + rect.width);
  const x1 = Math.max(rect.x, rect.x + rect.width);
  const y0 = Math.min(rect.y, rect.y + rect.height);
  const y1 = Math.max(rect.y, rect.y + rect.height);
  return {
    minX: x0 - safePad,
    minY: y0 - safePad,
    maxX: x1 + safePad,
    maxY: y1 + safePad,
  };
}

/**
 * 두 공간 의도 AABB의 내부 교집합 면적(`px²`)을 계산한다. 경계선만 맞닿은 경우는 `0`이다.
 */
export function computeSpatialAabbOverlapArea(a: SpatialIntentAabb, b: SpatialIntentAabb): number {
  const overlapWidth = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const overlapHeight = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return overlapWidth * overlapHeight;
}

/**
 * 두 공간 의도 AABB가 양수 면적으로 겹치는지 확인한다.
 */
export function doSpatialIntentAabbsOverlap(a: SpatialIntentAabb, b: SpatialIntentAabb): boolean {
  return computeSpatialAabbOverlapArea(a, b) > 0;
}

function canonicalSortLeases(leases: readonly SpatialIntentLease[]): SpatialIntentLease[] {
  return [...leases].sort((a, b) => {
    const order = compareClaimTotalOrder(a, b);
    if (order !== 0) return order;
    return compareStringsCodePoint(a.leaseId, b.leaseId);
  });
}

function materializeLease(claim: SpatialIntentClaimInput, nowMs: number): SpatialIntentLease {
  const safeLamport = Math.max(0, Math.floor(claim.lamportClock));
  const safeTtlMs = Math.max(1, Math.floor(claim.ttlMs ?? DEFAULT_SPATIAL_LEASE_TTL_MS));
  const paddedAabb = padSpatialIntentAabb(
    claim.strokeRect,
    claim.paddingPx ?? DEFAULT_STROKE_AABB_PADDING_PX,
  );
  const leaseId =
    claim.leaseId ??
    `${claim.cutId}:${claim.layerId}:${claim.authorId}@${String(safeLamport)}`;

  return {
    leaseId,
    authorId: claim.authorId,
    cutId: claim.cutId,
    layerId: claim.layerId,
    paddedAabb,
    toolKind: claim.toolKind,
    accessMode: resolveToolAccessMode(claim.toolKind),
    lamportClock: safeLamport,
    issuedAtMs: nowMs,
    ttlMs: safeTtlMs,
    expiresAtMs: nowMs + safeTtlMs,
  };
}

function classifyPairRelation(
  candidate: SpatialIntentLease,
  existing: SpatialIntentLease,
): EvaluatedLeaseRelation {
  if (candidate.cutId !== existing.cutId) {
    return { existingLease: existing, classification: "disjoint-cut", overlapAreaPx2: 0 };
  }
  const overlapAreaPx2 = computeSpatialAabbOverlapArea(candidate.paddedAabb, existing.paddedAabb);
  if (candidate.authorId === existing.authorId) {
    return {
      existingLease: existing,
      classification: "same-author-renewal",
      overlapAreaPx2,
    };
  }
  if (candidate.accessMode === "read" || existing.accessMode === "read") {
    return {
      existingLease: existing,
      classification: "non-conflicting-read-tool",
      overlapAreaPx2,
    };
  }
  if (candidate.layerId !== existing.layerId) {
    return {
      existingLease: existing,
      classification: "disjoint-layer",
      overlapAreaPx2,
    };
  }
  if (overlapAreaPx2 <= 0) {
    return {
      existingLease: existing,
      classification: "disjoint-space",
      overlapAreaPx2: 0,
    };
  }
  return {
    existingLease: existing,
    classification: "conflicting-same-layer-write",
    overlapAreaPx2,
  };
}

/**
 * 빈 공간 의도 중재기 상태를 생성한다.
 */
export function createSpatialIntentArbiterState(
  initialLamportClock = 0,
): SpatialIntentArbiterState {
  return {
    lamportClock: Math.max(0, Math.floor(initialLamportClock)),
    activeLeases: [],
  };
}

/**
 * 기준 시각(`nowMs`)에 만료된(`expiresAtMs <= nowMs`) 임대를 결정론적으로 회수한다.
 */
export function expireStaleSpatialLeases(
  state: SpatialIntentArbiterState,
  nowMs: number,
): SpatialLeaseExpiryResult {
  const expired: SpatialIntentLease[] = [];
  const surviving: SpatialIntentLease[] = [];
  for (const lease of state.activeLeases) {
    if (lease.expiresAtMs <= nowMs) {
      expired.push(lease);
    } else {
      surviving.push(lease);
    }
  }
  if (expired.length === 0) {
    return { nextState: state, expiredLeases: [] };
  }
  return {
    nextState: {
      lamportClock: state.lamportClock,
      activeLeases: canonicalSortLeases(surviving),
    },
    expiredLeases: canonicalSortLeases(expired),
  };
}

/**
 * 상태를 변경하지 않고 스트로크 시작 전 잠재 충돌 여부와 레이어·도구별 관계를 진단한다.
 */
export function inspectPreStrokeIntentConflict(
  state: SpatialIntentArbiterState,
  candidateClaim: SpatialIntentClaimInput,
  nowMs: number,
): PreStrokeConflictInspection {
  const { nextState: cleanedState } = expireStaleSpatialLeases(state, nowMs);
  const candidate = materializeLease(candidateClaim, nowMs);
  const relations: EvaluatedLeaseRelation[] = [];
  const blockingLeases: SpatialIntentLease[] = [];

  for (const existing of cleanedState.activeLeases) {
    const relation = classifyPairRelation(candidate, existing);
    relations.push(relation);
    if (
      relation.classification === "conflicting-same-layer-write" &&
      compareClaimTotalOrder(existing, candidate) < 0
    ) {
      blockingLeases.push(existing);
    }
  }

  return {
    hasConflict: blockingLeases.length > 0,
    candidateAccessMode: candidate.accessMode,
    candidatePaddedAabb: candidate.paddedAabb,
    blockingLeases: canonicalSortLeases(blockingLeases),
    relations,
  };
}

/**
 * 단일 공간 의도 임대 청구를 중재하고 만료 정리·동일 작가 갱신·`(lamportClock, authorId)` 선점 규칙을 적용한다.
 */
export function arbitrateSpatialIntentClaim(
  state: SpatialIntentArbiterState,
  claimInput: SpatialIntentClaimInput,
  nowMs: number,
): SpatialClaimArbitrationResult {
  const { nextState: cleanedState, expiredLeases } = expireStaleSpatialLeases(state, nowMs);
  const candidate = materializeLease(claimInput, nowMs);
  const nextLamportClock = Math.max(cleanedState.lamportClock, candidate.lamportClock) + 1;

  if (candidate.accessMode === "read") {
    const retained = cleanedState.activeLeases.filter(
      (existing) =>
        !(
          existing.authorId === candidate.authorId &&
          existing.cutId === candidate.cutId &&
          existing.layerId === candidate.layerId &&
          existing.accessMode === "read"
        ),
    );
    return {
      granted: true,
      lease: candidate,
      blockingLeases: [],
      preemptedLeases: [],
      expiredLeases,
      nextState: {
        lamportClock: nextLamportClock,
        activeLeases: canonicalSortLeases([...retained, candidate]),
      },
    };
  }

  const blockingLeases: SpatialIntentLease[] = [];
  const preemptedLeases: SpatialIntentLease[] = [];
  const keptLeases: SpatialIntentLease[] = [];

  for (const existing of cleanedState.activeLeases) {
    const relation = classifyPairRelation(candidate, existing);
    if (relation.classification === "same-author-renewal") {
      if (
        existing.layerId === candidate.layerId &&
        existing.accessMode === "write" &&
        doSpatialIntentAabbsOverlap(existing.paddedAabb, candidate.paddedAabb)
      ) {
        continue;
      }
      keptLeases.push(existing);
      continue;
    }

    if (relation.classification !== "conflicting-same-layer-write") {
      keptLeases.push(existing);
      continue;
    }

    if (compareClaimTotalOrder(existing, candidate) <= 0) {
      blockingLeases.push(existing);
      keptLeases.push(existing);
    } else {
      preemptedLeases.push(existing);
    }
  }

  if (blockingLeases.length > 0) {
    return {
      granted: false,
      lease: candidate,
      blockingLeases: canonicalSortLeases(blockingLeases),
      preemptedLeases: [],
      expiredLeases,
      nextState: {
        lamportClock: nextLamportClock,
        activeLeases: cleanedState.activeLeases,
      },
    };
  }

  return {
    granted: true,
    lease: candidate,
    blockingLeases: [],
    preemptedLeases: canonicalSortLeases(preemptedLeases),
    expiredLeases,
    nextState: {
      lamportClock: nextLamportClock,
      activeLeases: canonicalSortLeases([...keptLeases, candidate]),
    },
  };
}

/**
 * 네트워크 도착 순서가 뒤섞인 동시 청구 묶음을 `(lamportClock, authorId)` 전순서로 정렬·중재하여
 * 모든 피어에서 완전히 동일한 승인·거절 결과로 수렴시킨다.
 */
export function resolveSimultaneousSpatialClaims(
  state: SpatialIntentArbiterState,
  concurrentClaims: readonly SpatialIntentClaimInput[],
  nowMs: number,
): SimultaneousClaimsResolution {
  const { nextState: initialCleanState, expiredLeases } = expireStaleSpatialLeases(state, nowMs);

  const canonicallyOrderedClaims = [...concurrentClaims].sort((a, b) => {
    const order = compareClaimTotalOrder(a, b);
    if (order !== 0) return order;
    const cutDiff = compareStringsCodePoint(a.cutId, b.cutId);
    if (cutDiff !== 0) return cutDiff;
    const layerDiff = compareStringsCodePoint(a.layerId, b.layerId);
    if (layerDiff !== 0) return layerDiff;
    return compareStringsCodePoint(a.toolKind, b.toolKind);
  });

  let workingState = initialCleanState;
  const acceptedMap = new Map<string, SpatialIntentLease>();
  const rejectedClaims: RejectedSimultaneousClaim[] = [];

  for (const claim of canonicallyOrderedClaims) {
    const step = arbitrateSpatialIntentClaim(workingState, claim, nowMs);
    workingState = step.nextState;

    for (const preempted of step.preemptedLeases) {
      acceptedMap.delete(preempted.leaseId);
    }

    if (step.granted) {
      acceptedMap.set(step.lease.leaseId, step.lease);
    } else {
      rejectedClaims.push({
        claim: step.lease,
        blockingLeases: step.blockingLeases,
      });
    }
  }

  return {
    acceptedLeases: canonicalSortLeases([...acceptedMap.values()]),
    rejectedClaims,
    expiredLeases,
    nextState: workingState,
  };
}
