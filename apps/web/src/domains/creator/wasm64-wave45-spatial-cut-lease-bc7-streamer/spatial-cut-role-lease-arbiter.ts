/**
 * Wave 45: 세로 스크롤 웹툰 회차의 컷×공정 2차원 공간 임대(Spatial Cut×Role Lease) 중재기 및
 * 컷 경계 타일 픽셀 델타 무충돌 병합기.
 *
 * - 동일 컷 안에서 선화·밑색·명암·배경·식자 담당자가 서로를 차단하지 않고 동시에 편집할 수 있다.
 * - 연결 끊김으로 남는 좀비 잠금을 막기 위해 TTL 만료 임대를 요청 시점마다 자동 회수한다.
 * - 동일 컷·동일 공정 동시 경합은 하이브리드 논리 시계(HLC) 전순서로 결정론적 우선권을 판정하며,
 *   컷 경계가 걸친 공유 타일은 픽셀 단위 델타와 공정 레이어 순서·HLC로 무충돌 합성한다.
 */

export const MANUSCRIPT_ROLES = ["lineart", "flat", "shade", "bg", "lettering"] as const;
export type ManuscriptRole = (typeof MANUSCRIPT_ROLES)[number];

/** 웹툰 스튜디오 표준 공정 한글 명칭. */
export const MANUSCRIPT_ROLE_LABELS_KO: Readonly<Record<ManuscriptRole, string>> = {
  lineart: "선화",
  flat: "밑색",
  shade: "명암",
  bg: "배경",
  lettering: "식자",
};

/** 아래에서 위로 쌓이는 표준 공정 합성 순서(배경 → 밑색 → 명암 → 선화 → 식자). */
export const MANUSCRIPT_ROLE_COMPOSITE_ORDER: readonly ManuscriptRole[] = ["bg", "flat", "shade", "lineart", "lettering"];

export const DEFAULT_CUT_ROLE_LEASE_TTL_MS = 15_000 as const;
export const MIN_CUT_ROLE_LEASE_TTL_MS = 1_000 as const;
export const MAX_CUT_ROLE_LEASE_TTL_MS = 120_000 as const;
export const DEFAULT_CONTENTION_WINDOW_MS = 500 as const;

export interface HybridLogicalClock {
  readonly wallTimeMs: number;
  readonly logicalCounter: number;
  readonly nodeId: string;
}

export interface SpatialCutRoleLease {
  readonly leaseKey: string;
  readonly cutId: string;
  readonly role: ManuscriptRole;
  readonly authorId: string;
  readonly acquiredHlc: HybridLogicalClock;
  readonly acquiredAtMs: number;
  readonly expiresAtMs: number;
  readonly ttlMs: number;
}

export interface SpatialCutRoleArbiterState {
  readonly leasesByKey: Readonly<Record<string, SpatialCutRoleLease>>;
}

export interface CutRoleLeaseRequest {
  readonly cutId: string;
  readonly role: ManuscriptRole;
  readonly authorId: string;
  readonly hlc: HybridLogicalClock;
  readonly nowWallTimeMs: number;
  readonly ttlMs?: number;
  readonly contentionWindowMs?: number;
}

export type CutRoleLeaseDecisionStatus = "granted" | "renewed" | "preempted-by-hlc" | "rejected-active-lease";

export interface CutRoleLeaseDecision {
  readonly ok: boolean;
  readonly status: CutRoleLeaseDecisionStatus;
  readonly lease: SpatialCutRoleLease | null;
  readonly blockingLease: SpatialCutRoleLease | null;
  readonly preemptedLease: SpatialCutRoleLease | null;
  readonly expiredLeases: readonly SpatialCutRoleLease[];
  readonly coexistingRolesInCut: readonly ManuscriptRole[];
  readonly reasonKo: string;
  readonly nextState: SpatialCutRoleArbiterState;
}

export interface SimultaneousCutRoleBatchResult {
  readonly decisions: readonly CutRoleLeaseDecision[];
  readonly grantedLeases: readonly SpatialCutRoleLease[];
  readonly rejectedRequests: readonly CutRoleLeaseRequest[];
  readonly expiredLeases: readonly SpatialCutRoleLease[];
  readonly nextState: SpatialCutRoleArbiterState;
}

export interface BoundaryTileSubrectDelta {
  readonly patchId: string;
  readonly cutId: string;
  readonly role: ManuscriptRole;
  readonly authorId: string;
  readonly hlc: HybridLogicalClock;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly afterRgba: Uint8Array;
  readonly beforeRgba?: Uint8Array;
}

export interface BoundaryTileDeltaMergeOptions {
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly baseRgba: Uint8Array;
  readonly deltas: readonly BoundaryTileSubrectDelta[];
}

export interface BoundaryTileDeltaMergeResult {
  readonly mergedRgba: Uint8Array;
  readonly modifiedPixelCount: number;
  readonly disjointMergedPixelCount: number;
  readonly sameRoleConflictPixelCount: number;
  readonly crossRoleCompositedPixelCount: number;
}

function clampTtlMs(ttlMs: number | undefined): number {
  const raw = Number.isFinite(ttlMs) ? Math.trunc(ttlMs ?? DEFAULT_CUT_ROLE_LEASE_TTL_MS) : DEFAULT_CUT_ROLE_LEASE_TTL_MS;
  return Math.min(MAX_CUT_ROLE_LEASE_TTL_MS, Math.max(MIN_CUT_ROLE_LEASE_TTL_MS, raw));
}

export function buildCutRoleLeaseKey(cutId: string, role: ManuscriptRole): string {
  return `${cutId}::${role}`;
}

export function createCutRoleLeaseArbiterState(): SpatialCutRoleArbiterState {
  return { leasesByKey: {} };
}

/** 물리 시계 역전이나 동시 이벤트에서도 단조 증가 전순서를 보장하는 HLC 전진 함수. */
export function advanceHlc(
  local: HybridLogicalClock,
  nowWallTimeMs: number,
  remote?: HybridLogicalClock,
): HybridLogicalClock {
  const safeNow = Math.max(0, Math.trunc(nowWallTimeMs));
  const localWall = Math.max(0, Math.trunc(local.wallTimeMs));
  const remoteWall = remote ? Math.max(0, Math.trunc(remote.wallTimeMs)) : -1;
  const nextWall = Math.max(localWall, remoteWall, safeNow);

  let nextCounter = 0;
  if (remote && nextWall === localWall && nextWall === remoteWall) {
    nextCounter = Math.max(local.logicalCounter, remote.logicalCounter) + 1;
  } else if (nextWall === localWall) {
    nextCounter = local.logicalCounter + 1;
  } else if (remote && nextWall === remoteWall) {
    nextCounter = remote.logicalCounter + 1;
  }
  return { wallTimeMs: nextWall, logicalCounter: nextCounter, nodeId: local.nodeId };
}

/** 로케일에 영향받지 않는 결정론적 HLC 전순서 비교기(`-1 | 0 | 1`). */
export function compareHlc(a: HybridLogicalClock, b: HybridLogicalClock): number {
  if (a.wallTimeMs !== b.wallTimeMs) return a.wallTimeMs < b.wallTimeMs ? -1 : 1;
  if (a.logicalCounter !== b.logicalCounter) return a.logicalCounter < b.logicalCounter ? -1 : 1;
  if (a.nodeId === b.nodeId) return 0;
  return a.nodeId < b.nodeId ? -1 : 1;
}

/** 만료 시각(`expiresAtMs <= nowWallTimeMs`)이 지난 좀비 임대를 일괄 회수한다. */
export function expireStaleCutRoleLeases(
  state: SpatialCutRoleArbiterState,
  nowWallTimeMs: number,
): { readonly state: SpatialCutRoleArbiterState; readonly expiredLeases: readonly SpatialCutRoleLease[] } {
  const expiredLeases: SpatialCutRoleLease[] = [];
  const remaining: Record<string, SpatialCutRoleLease> = {};
  for (const [key, lease] of Object.entries(state.leasesByKey)) {
    if (nowWallTimeMs >= lease.expiresAtMs) expiredLeases.push(lease);
    else remaining[key] = lease;
  }
  return expiredLeases.length === 0 ? { state, expiredLeases } : { state: { leasesByKey: remaining }, expiredLeases };
}

/** 같은 컷 안에서 현재 다른 공정으로 동시에 작업 중인 활성 공정 목록을 조회한다. */
export function listCoexistingRolesInCut(
  state: SpatialCutRoleArbiterState,
  cutId: string,
  excludeRole?: ManuscriptRole,
): readonly ManuscriptRole[] {
  return MANUSCRIPT_ROLES.filter(
    (role) => role !== excludeRole && Boolean(state.leasesByKey[buildCutRoleLeaseKey(cutId, role)]),
  );
}

/** 컷×공정 2차원 공간 임대 요청을 중재한다. */
export function acquireCutRoleLease(
  state: SpatialCutRoleArbiterState,
  request: CutRoleLeaseRequest,
): CutRoleLeaseDecision {
  const swept = expireStaleCutRoleLeases(state, request.nowWallTimeMs);
  const activeState = swept.state;
  const ttlMs = clampTtlMs(request.ttlMs);
  const leaseKey = buildCutRoleLeaseKey(request.cutId, request.role);
  const existing = activeState.leasesByKey[leaseKey] ?? null;
  const coexistingRolesInCut = listCoexistingRolesInCut(activeState, request.cutId, request.role);
  const roleLabel = MANUSCRIPT_ROLE_LABELS_KO[request.role];

  const makeLease = (hlcValue: HybridLogicalClock, acquiredAtMs: number): SpatialCutRoleLease => ({
    leaseKey,
    cutId: request.cutId,
    role: request.role,
    authorId: request.authorId,
    acquiredHlc: hlcValue,
    acquiredAtMs,
    expiresAtMs: request.nowWallTimeMs + ttlMs,
    ttlMs,
  });

  const respond = (
    ok: boolean,
    status: CutRoleLeaseDecisionStatus,
    lease: SpatialCutRoleLease | null,
    reasonKo: string,
    extras: { blockingLease?: SpatialCutRoleLease | null; preemptedLease?: SpatialCutRoleLease | null } = {},
  ): CutRoleLeaseDecision => ({
    ok,
    status,
    lease,
    blockingLease: extras.blockingLease ?? null,
    preemptedLease: extras.preemptedLease ?? null,
    expiredLeases: swept.expiredLeases,
    coexistingRolesInCut,
    reasonKo,
    nextState: lease ? { leasesByKey: { ...activeState.leasesByKey, [leaseKey]: lease } } : activeState,
  });

  if (!existing) {
    const reasonKo = coexistingRolesInCut.length > 0
      ? `${request.cutId} ${roleLabel} 공정을 다른 공정과 비차단 동시 편집으로 임대했습니다.`
      : `${request.cutId} ${roleLabel} 공정 편집 임대를 승인했습니다.`;
    return respond(true, "granted", makeLease(request.hlc, request.nowWallTimeMs), reasonKo);
  }

  if (existing.authorId === request.authorId) {
    const renewedHlc = compareHlc(request.hlc, existing.acquiredHlc) > 0 ? request.hlc : existing.acquiredHlc;
    return respond(
      true,
      "renewed",
      makeLease(renewedHlc, existing.acquiredAtMs),
      `${request.cutId} ${roleLabel} 공정 임대 만료 시각을 연장했습니다.`,
    );
  }

  const contentionWindowMs = Math.max(0, request.contentionWindowMs ?? DEFAULT_CONTENTION_WINDOW_MS);
  if (
    Math.abs(request.hlc.wallTimeMs - existing.acquiredHlc.wallTimeMs) <= contentionWindowMs &&
    compareHlc(request.hlc, existing.acquiredHlc) < 0
  ) {
    return respond(
      true,
      "preempted-by-hlc",
      makeLease(request.hlc, request.nowWallTimeMs),
      `${request.cutId} ${roleLabel} 동시 경합에서 앞선 HLC 의도가 우선권을 획득했습니다.`,
      { preemptedLease: existing },
    );
  }

  return respond(
    false,
    "rejected-active-lease",
    null,
    `${request.cutId} ${roleLabel} 공정은 현재 ${existing.authorId} 담당자가 작업 중입니다.`,
    { blockingLease: existing },
  );
}

/** 본인이 보유한 컷×공정 임대를 명시적으로 반납한다. */
export function releaseCutRoleLease(
  state: SpatialCutRoleArbiterState,
  params: { readonly cutId: string; readonly role: ManuscriptRole; readonly authorId: string },
): { readonly released: boolean; readonly nextState: SpatialCutRoleArbiterState } {
  const key = buildCutRoleLeaseKey(params.cutId, params.role);
  const existing = state.leasesByKey[key];
  if (!existing || existing.authorId !== params.authorId) return { released: false, nextState: state };
  const nextMap: Record<string, SpatialCutRoleLease> = {};
  for (const [entryKey, lease] of Object.entries(state.leasesByKey)) {
    if (entryKey !== key) nextMap[entryKey] = lease;
  }
  return { released: true, nextState: { leasesByKey: nextMap } };
}

/** 네트워크 버스트로 동시에 도착한 임대 요청 묶음을 패킷 순서와 무관하게 HLC 전순서로 중재한다. */
export function resolveSimultaneousCutRoleClaims(
  state: SpatialCutRoleArbiterState,
  claims: readonly CutRoleLeaseRequest[],
  nowWallTimeMs: number,
): SimultaneousCutRoleBatchResult {
  const swept = expireStaleCutRoleLeases(state, nowWallTimeMs);
  const orderedClaims = [...claims].sort((a, b) => compareHlc(a.hlc, b.hlc));
  let cursorState = swept.state;
  const decisions: CutRoleLeaseDecision[] = [];
  const grantedLeases: SpatialCutRoleLease[] = [];
  const rejectedRequests: CutRoleLeaseRequest[] = [];

  for (const claim of orderedClaims) {
    const decision = acquireCutRoleLease(cursorState, { ...claim, nowWallTimeMs });
    cursorState = decision.nextState;
    decisions.push(decision);
    if (decision.ok && decision.lease) grantedLeases.push(decision.lease);
    else rejectedRequests.push(claim);
  }
  return { decisions, grantedLeases, rejectedRequests, expiredLeases: swept.expiredLeases, nextState: cursorState };
}

function blendSourceOverPixel(
  dst: readonly [number, number, number, number],
  src: readonly [number, number, number, number],
): readonly [number, number, number, number] {
  if (src[3] <= 0) return dst;
  if (src[3] >= 255 || dst[3] <= 0) return src;
  const sa = src[3] / 255;
  const da = dst[3] / 255;
  const outA = sa + da * (1 - sa);
  if (outA <= 1e-6) return [0, 0, 0, 0];
  return [
    Math.round((src[0] * sa + dst[0] * da * (1 - sa)) / outA),
    Math.round((src[1] * sa + dst[1] * da * (1 - sa)) / outA),
    Math.round((src[2] * sa + dst[2] * da * (1 - sa)) / outA),
    Math.round(outA * 255),
  ];
}

/** 컷 경계에 걸친 공유 타일의 서브영역 픽셀 델타들을 무충돌 병합한다. */
export function mergeBoundaryTilePixelDeltas(
  options: BoundaryTileDeltaMergeOptions,
): BoundaryTileDeltaMergeResult {
  const { tileWidth, tileHeight, baseRgba, deltas } = options;
  if (baseRgba.length !== tileWidth * tileHeight * 4) {
    throw new RangeError(`타일 기본 버퍼 길이(${baseRgba.length})가 타일 크기와 일치하지 않습니다.`);
  }
  const mergedRgba = new Uint8Array(baseRgba);
  if (deltas.length === 0) {
    return {
      mergedRgba,
      modifiedPixelCount: 0,
      disjointMergedPixelCount: 0,
      sameRoleConflictPixelCount: 0,
      crossRoleCompositedPixelCount: 0,
    };
  }

  interface RoleWinnerEdit {
    hlc: HybridLogicalClock;
    rgba: readonly [number, number, number, number];
    conflicts: number;
  }
  const perPixelRoleEdits = new Map<number, Map<ManuscriptRole, RoleWinnerEdit>>();

  for (const delta of deltas) {
    const expectedBytes = delta.width * delta.height * 4;
    if (delta.afterRgba.length !== expectedBytes || (delta.beforeRgba && delta.beforeRgba.length !== expectedBytes)) {
      throw new RangeError(`델타 패치(${delta.patchId}) 버퍼 길이가 영역 크기와 일치하지 않습니다.`);
    }
    for (let ly = 0; ly < delta.height; ly += 1) {
      const py = delta.y + ly;
      if (py < 0 || py >= tileHeight) continue;
      for (let lx = 0; lx < delta.width; lx += 1) {
        const px = delta.x + lx;
        if (px < 0 || px >= tileWidth) continue;
        const pOff = (ly * delta.width + lx) * 4;
        const pixelIndex = py * tileWidth + px;
        const tOff = pixelIndex * 4;
        const refSrc = delta.beforeRgba ?? baseRgba;
        const rOff = delta.beforeRgba ? pOff : tOff;
        const nR = delta.afterRgba[pOff] ?? 0;
        const nG = delta.afterRgba[pOff + 1] ?? 0;
        const nB = delta.afterRgba[pOff + 2] ?? 0;
        const nA = delta.afterRgba[pOff + 3] ?? 0;
        if (
          nR === (refSrc[rOff] ?? 0) &&
          nG === (refSrc[rOff + 1] ?? 0) &&
          nB === (refSrc[rOff + 2] ?? 0) &&
          nA === (refSrc[rOff + 3] ?? 0)
        ) {
          continue;
        }
        let roleMap = perPixelRoleEdits.get(pixelIndex);
        if (!roleMap) {
          roleMap = new Map<ManuscriptRole, RoleWinnerEdit>();
          perPixelRoleEdits.set(pixelIndex, roleMap);
        }
        const prev = roleMap.get(delta.role);
        if (!prev) {
          roleMap.set(delta.role, { hlc: delta.hlc, rgba: [nR, nG, nB, nA], conflicts: 0 });
        } else if (compareHlc(delta.hlc, prev.hlc) > 0) {
          roleMap.set(delta.role, { hlc: delta.hlc, rgba: [nR, nG, nB, nA], conflicts: prev.conflicts + 1 });
        } else {
          prev.conflicts += 1;
        }
      }
    }
  }

  let modifiedPixelCount = 0;
  let disjointMergedPixelCount = 0;
  let sameRoleConflictPixelCount = 0;
  let crossRoleCompositedPixelCount = 0;

  for (const [pixelIndex, roleMap] of perPixelRoleEdits.entries()) {
    modifiedPixelCount += 1;
    const offset = pixelIndex * 4;
    let hadConflict = false;
    for (const edit of roleMap.values()) {
      if (edit.conflicts > 0) hadConflict = true;
    }
    if (hadConflict) sameRoleConflictPixelCount += 1;

    if (roleMap.size === 1) {
      const single = roleMap.values().next().value;
      if (single) {
        mergedRgba[offset] = single.rgba[0];
        mergedRgba[offset + 1] = single.rgba[1];
        mergedRgba[offset + 2] = single.rgba[2];
        mergedRgba[offset + 3] = single.rgba[3];
      }
      if (!hadConflict) disjointMergedPixelCount += 1;
      continue;
    }

    crossRoleCompositedPixelCount += 1;
    let acc: readonly [number, number, number, number] = [
      baseRgba[offset] ?? 0,
      baseRgba[offset + 1] ?? 0,
      baseRgba[offset + 2] ?? 0,
      baseRgba[offset + 3] ?? 0,
    ];
    for (const role of MANUSCRIPT_ROLE_COMPOSITE_ORDER) {
      const edit = roleMap.get(role);
      if (edit) acc = blendSourceOverPixel(acc, edit.rgba);
    }
    mergedRgba[offset] = acc[0];
    mergedRgba[offset + 1] = acc[1];
    mergedRgba[offset + 2] = acc[2];
    mergedRgba[offset + 3] = acc[3];
  }

  return {
    mergedRgba,
    modifiedPixelCount,
    disjointMergedPixelCount,
    sameRoleConflictPixelCount,
    crossRoleCompositedPixelCount,
  };
}
