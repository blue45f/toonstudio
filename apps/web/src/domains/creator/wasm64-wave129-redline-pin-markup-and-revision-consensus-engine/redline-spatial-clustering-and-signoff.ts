/**
 * Wave 129 — 레드라인 핀 정규화, 공간 중복·상충 핀 군집 감지기, 수정 라운드 차분 & PD 출고 승인 게이트.
 *
 * - 동일 컷(`cutId`) 내 유클리드 거리 `<= clusterRadiusNorm`(기본 0.06) 근접 핀을 연결 요소로 군집화한다.
 * - 서로 다른 작성자가 다른 담당 역할 또는 다른 카테고리로 겹쳐 꽂은 경우 `potentialConflict: true`로 표기한다.
 * - `blocker` 심각도 핀 중 `verified-closed` 미달 건이 1건이라도 있으면 옵션과 무관하게 출고를 차단한다.
 */

import {
  REDLINE_CATEGORY_LABELS_KO,
  STUDIO_COLLABORATOR_ROLES,
  STUDIO_ROLE_LABELS_KO,
  type EpisodeRevisionSignOffResult,
  type EpisodeSignOffBlockingCode,
  type EpisodeSignOffDecision,
  type EpisodeSignOffOptions,
  type RedlineClusterDetectionOptions,
  type RedlineOverlapDetectionResult,
  type RedlinePinCategory,
  type RedlinePinCluster,
  type RedlinePinItem,
  type RedlinePinSeverity,
  type RedlinePinStatus,
  type RevisionRoundDiffOptions,
  type RevisionRoundDiffResult,
  type RoleRemainingDetail,
  type StudioCollaboratorRole,
} from "./redline-markup-types";
import { computeRedlineLedgerSha256Hex } from "./redline-sha256-and-canonical";

export const DEFAULT_CLUSTER_RADIUS_NORM = 0.06;
export const MIN_CLUSTER_RADIUS_NORM = 0.001;
export const MAX_CLUSTER_RADIUS_NORM = 1.0;

const CLUSTER_EPSILON = 1e-9;

const STATUS_PROGRESS_RANK: Readonly<Record<RedlinePinStatus, number>> = {
  open: 0,
  reopened: 0,
  "in-progress": 1,
  "resolved-pending-verify": 2,
  "verified-closed": 3,
};

function roundCoord(value: number): number {
  const rounded = Math.round(value * 1000000) / 1000000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 정규화 좌표(0..1)를 유한 실수로 안전하게 보정한다(`NaN`/`Infinity`는 0으로 수렴).
 */
export function clampNormalizedCoord(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return roundCoord(value);
}

export function sanitizeRoundNumber(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function sanitizeReopenCount(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * 레드라인 핀 입력을 불변·정규화된 형태로 보정한다.
 */
export function normalizeRedlinePin(pin: RedlinePinItem): RedlinePinItem {
  return {
    pinId: pin.pinId.trim(),
    cutId: pin.cutId.trim(),
    normX: clampNormalizedCoord(pin.normX),
    normY: clampNormalizedCoord(pin.normY),
    category: pin.category,
    severity: pin.severity,
    authorId: pin.authorId.trim(),
    authorRole: pin.authorRole,
    assigneeRole: pin.assigneeRole,
    noteKo: pin.noteKo.trim(),
    roundNumber: sanitizeRoundNumber(pin.roundNumber),
    status: pin.status,
    reopenCount: sanitizeReopenCount(pin.reopenCount),
    ...(pin.claimedByActorId?.trim() ? { claimedByActorId: pin.claimedByActorId.trim() } : {}),
    ...(pin.resolvedByActorId?.trim() ? { resolvedByActorId: pin.resolvedByActorId.trim() } : {}),
    ...(pin.resolvedByRole ? { resolvedByRole: pin.resolvedByRole } : {}),
    ...(pin.verifiedByActorId?.trim() ? { verifiedByActorId: pin.verifiedByActorId.trim() } : {}),
    ...(pin.verifiedByRole ? { verifiedByRole: pin.verifiedByRole } : {}),
    ...(pin.lastReopenReasonKo?.trim()
      ? { lastReopenReasonKo: pin.lastReopenReasonKo.trim() }
      : {}),
    ...(pin.history && pin.history.length > 0 ? { history: [...pin.history] } : {}),
  };
}

/**
 * 레드라인 핀 목록 전체를 정규화한다.
 */
export function normalizeRedlinePins(pins: readonly RedlinePinItem[]): RedlinePinItem[] {
  return pins.map(normalizeRedlinePin);
}

function resolveClusterRadiusNorm(rawRadius: number | undefined): number {
  if (typeof rawRadius !== "number" || !Number.isFinite(rawRadius)) {
    return DEFAULT_CLUSTER_RADIUS_NORM;
  }
  return Math.max(MIN_CLUSTER_RADIUS_NORM, Math.min(MAX_CLUSTER_RADIUS_NORM, rawRadius));
}

function hasConflictingPinPair(clusterPins: readonly RedlinePinItem[]): boolean {
  for (let i = 0; i < clusterPins.length; i += 1) {
    const a = clusterPins[i];
    if (!a) continue;
    for (let j = i + 1; j < clusterPins.length; j += 1) {
      const b = clusterPins[j];
      if (!b) continue;
      if (
        a.authorId !== b.authorId &&
        (a.assigneeRole !== b.assigneeRole || a.category !== b.category)
      ) {
        return true;
      }
    }
  }
  return false;
}

function buildClusterSummaryKo(
  potentialConflict: boolean,
  pinCount: number,
  authorCount: number,
  roles: readonly StudioCollaboratorRole[],
  categories: readonly RedlinePinCategory[],
): string {
  const roleNames = roles.map((r) => STUDIO_ROLE_LABELS_KO[r]).join("·");
  const catNames = categories.map((c) => REDLINE_CATEGORY_LABELS_KO[c]).join("·");
  if (potentialConflict) {
    return `검수자 ${authorCount}명이 동일 좌표 반경에 서로 다른 영역(${catNames} / ${roleNames}) 핀 ${pinCount}건을 겹쳐 남겨 PD 조율이 필요합니다.`;
  }
  return `동일 좌표 반경에 핀 ${pinCount}건(${catNames})이 몰려 있어 통합 확인을 권장합니다.`;
}

function summarizeClusterMembers(
  cutId: string,
  memberPins: readonly RedlinePinItem[],
): Omit<RedlinePinCluster, "clusterId"> {
  let sumX = 0;
  let sumY = 0;
  for (let m = 0; m < memberPins.length; m += 1) {
    const p = memberPins[m];
    if (!p) continue;
    sumX += p.normX;
    sumY += p.normY;
  }
  const centroidNormX = roundCoord(sumX / memberPins.length);
  const centroidNormY = roundCoord(sumY / memberPins.length);

  let boundingRadiusNorm = 0;
  for (let m = 0; m < memberPins.length; m += 1) {
    const p = memberPins[m];
    if (!p) continue;
    const fromCenter = Math.hypot(p.normX - centroidNormX, p.normY - centroidNormY);
    if (fromCenter > boundingRadiusNorm) boundingRadiusNorm = fromCenter;
  }

  let minPairwise = Number.POSITIVE_INFINITY;
  let maxPairwise = 0;
  for (let i = 0; i < memberPins.length; i += 1) {
    const a = memberPins[i];
    if (!a) continue;
    for (let j = i + 1; j < memberPins.length; j += 1) {
      const b = memberPins[j];
      if (!b) continue;
      const d = Math.hypot(a.normX - b.normX, a.normY - b.normY);
      if (d < minPairwise) minPairwise = d;
      if (d > maxPairwise) maxPairwise = d;
    }
  }
  if (!Number.isFinite(minPairwise)) minPairwise = 0;

  const authorSet = new Set<string>();
  const roleSet = new Set<StudioCollaboratorRole>();
  const categorySet = new Set<RedlinePinCategory>();
  const pinIds: string[] = [];
  let hasActivePin = false;

  for (let m = 0; m < memberPins.length; m += 1) {
    const p = memberPins[m];
    if (!p) continue;
    pinIds.push(p.pinId);
    authorSet.add(p.authorId);
    roleSet.add(p.assigneeRole);
    categorySet.add(p.category);
    if (p.status !== "verified-closed") hasActivePin = true;
  }

  const distinctAuthorIds = [...authorSet].sort();
  const distinctAssigneeRoles = STUDIO_COLLABORATOR_ROLES.filter((r) => roleSet.has(r));
  const distinctCategories = [...categorySet].sort();
  const potentialConflict = hasConflictingPinPair(memberPins);

  return {
    cutId,
    pinIds,
    pinCount: memberPins.length,
    centroidNormX,
    centroidNormY,
    boundingRadiusNorm: roundCoord(boundingRadiusNorm),
    minPairwiseDistanceNorm: roundCoord(minPairwise),
    maxPairwiseDistanceNorm: roundCoord(maxPairwise),
    distinctAuthorIds,
    distinctAssigneeRoles,
    distinctCategories,
    hasActivePin,
    potentialConflict,
    conflictSummaryKo: buildClusterSummaryKo(
      potentialConflict,
      memberPins.length,
      distinctAuthorIds.length,
      distinctAssigneeRoles,
      distinctCategories,
    ),
  };
}

/**
 * 동일 컷(`cutId`) 내 유클리드 거리 `<= clusterRadiusNorm`(기본 0.06) 이내에 몰린 핀을
 * 연결 요소 기반으로 군집화하고, 서로 다른 작성자의 역할/카테고리 상충을 탐지한다.
 */
export function detectOverlappingRedlinePins(
  pins: readonly RedlinePinItem[],
  options?: RedlineClusterDetectionOptions,
): RedlineOverlapDetectionResult {
  const clusterRadiusNorm = resolveClusterRadiusNorm(options?.clusterRadiusNorm);
  const activeOnly = options?.activeOnly === true;

  const normalized = normalizeRedlinePins(pins).filter((pin) =>
    activeOnly ? pin.status !== "verified-closed" : true,
  );

  const byCut = new Map<string, RedlinePinItem[]>();
  for (let i = 0; i < normalized.length; i += 1) {
    const pin = normalized[i];
    if (!pin) continue;
    const bucket = byCut.get(pin.cutId);
    if (bucket) bucket.push(pin);
    else byCut.set(pin.cutId, [pin]);
  }

  const sortedCutIds = [...byCut.keys()].sort();
  const clusters: RedlinePinCluster[] = [];
  const overlappingPinIdSet = new Set<string>();
  const conflictPinIdSet = new Set<string>();

  for (let c = 0; c < sortedCutIds.length; c += 1) {
    const cutId = sortedCutIds[c];
    if (cutId === undefined) continue;
    const cutPins = [...(byCut.get(cutId) ?? [])].sort((a, b) => a.pinId.localeCompare(b.pinId));
    const n = cutPins.length;
    if (n < 2) continue;

    const visited = new Uint8Array(n);
    const rawCutClusters: Omit<RedlinePinCluster, "clusterId">[] = [];

    for (let start = 0; start < n; start += 1) {
      if (visited[start] === 1) continue;
      const queue: number[] = [start];
      visited[start] = 1;
      const memberIndices: number[] = [];

      while (queue.length > 0) {
        const currentIdx = queue.shift();
        if (currentIdx === undefined) continue;
        memberIndices.push(currentIdx);
        const currentPin = cutPins[currentIdx];
        if (!currentPin) continue;

        for (let other = 0; other < n; other += 1) {
          if (visited[other] === 1) continue;
          const otherPin = cutPins[other];
          if (!otherPin) continue;
          const dist = Math.hypot(
            currentPin.normX - otherPin.normX,
            currentPin.normY - otherPin.normY,
          );
          if (dist <= clusterRadiusNorm + CLUSTER_EPSILON) {
            visited[other] = 1;
            queue.push(other);
          }
        }
      }

      if (memberIndices.length < 2) continue;
      const memberPins: RedlinePinItem[] = [];
      for (let m = 0; m < memberIndices.length; m += 1) {
        const idx = memberIndices[m];
        const member = idx === undefined ? undefined : cutPins[idx];
        if (member) memberPins.push(member);
      }
      memberPins.sort((a, b) => a.pinId.localeCompare(b.pinId));
      rawCutClusters.push(summarizeClusterMembers(cutId, memberPins));
    }

    rawCutClusters.sort((a, b) => {
      if (a.centroidNormY !== b.centroidNormY) return a.centroidNormY - b.centroidNormY;
      if (a.centroidNormX !== b.centroidNormX) return a.centroidNormX - b.centroidNormX;
      return (a.pinIds[0] ?? "").localeCompare(b.pinIds[0] ?? "");
    });

    for (let idx = 0; idx < rawCutClusters.length; idx += 1) {
      const raw = rawCutClusters[idx];
      if (!raw) continue;
      const cluster: RedlinePinCluster = { clusterId: `cluster-${cutId}-${idx + 1}`, ...raw };
      clusters.push(cluster);
      for (let p = 0; p < cluster.pinIds.length; p += 1) {
        const pid = cluster.pinIds[p];
        if (!pid) continue;
        overlappingPinIdSet.add(pid);
        if (cluster.potentialConflict) conflictPinIdSet.add(pid);
      }
    }
  }

  let conflictClusterCount = 0;
  for (let i = 0; i < clusters.length; i += 1) {
    if (clusters[i]?.potentialConflict) conflictClusterCount += 1;
  }

  return {
    clusterRadiusNorm,
    evaluatedPinCount: normalized.length,
    clusters,
    overlappingPinIds: [...overlappingPinIdSet].sort(),
    conflictClusterCount,
    potentialConflictPinIds: [...conflictPinIdSet].sort(),
  };
}

/**
 * 역할별 미완료(non-`verified-closed`) 잔여 작업량과 심각도·상태별 세부를 산출한다.
 */
export function computeRemainingWorkloadByRole(pins: readonly RedlinePinItem[]): {
  readonly remainingByRole: Readonly<Record<StudioCollaboratorRole, number>>;
  readonly remainingDetailByRole: Readonly<Record<StudioCollaboratorRole, RoleRemainingDetail>>;
} {
  const counts: Record<StudioCollaboratorRole, number> = {
    "pd-editor": 0,
    "art-director": 0,
    "lead-artist": 0,
    inker: 0,
    colorist: 0,
    typesetter: 0,
    "bg3d-artist": 0,
  };

  interface MutableRoleDetail {
    role: StudioCollaboratorRole;
    labelKo: string;
    total: number;
    blocker: number;
    major: number;
    polish: number;
    open: number;
    inProgress: number;
    pendingVerify: number;
    reopened: number;
    pinIds: string[];
  }

  const details = {} as Record<StudioCollaboratorRole, MutableRoleDetail>;
  for (let i = 0; i < STUDIO_COLLABORATOR_ROLES.length; i += 1) {
    const role = STUDIO_COLLABORATOR_ROLES[i];
    if (!role) continue;
    details[role] = {
      role,
      labelKo: STUDIO_ROLE_LABELS_KO[role],
      total: 0,
      blocker: 0,
      major: 0,
      polish: 0,
      open: 0,
      inProgress: 0,
      pendingVerify: 0,
      reopened: 0,
      pinIds: [],
    };
  }

  const normalized = normalizeRedlinePins(pins);
  for (let i = 0; i < normalized.length; i += 1) {
    const pin = normalized[i];
    if (!pin || pin.status === "verified-closed") continue;
    const role = pin.assigneeRole;
    counts[role] += 1;
    const bucket = details[role];
    bucket.total += 1;
    bucket.pinIds.push(pin.pinId);
    if (pin.severity === "blocker") bucket.blocker += 1;
    else if (pin.severity === "major") bucket.major += 1;
    else bucket.polish += 1;

    if (pin.status === "open") bucket.open += 1;
    else if (pin.status === "in-progress") bucket.inProgress += 1;
    else if (pin.status === "resolved-pending-verify") bucket.pendingVerify += 1;
    else if (pin.status === "reopened") bucket.reopened += 1;
  }

  for (let i = 0; i < STUDIO_COLLABORATOR_ROLES.length; i += 1) {
    const role = STUDIO_COLLABORATOR_ROLES[i];
    if (role) details[role].pinIds.sort();
  }

  return { remainingByRole: counts, remainingDetailByRole: details };
}

function indexPinsById(pins: readonly RedlinePinItem[]): Map<string, RedlinePinItem> {
  const map = new Map<string, RedlinePinItem>();
  for (let i = 0; i < pins.length; i += 1) {
    const pin = pins[i];
    if (pin) map.set(pin.pinId, pin);
  }
  return map;
}

function inferMaxRound(pins: readonly RedlinePinItem[], fallback: number): number {
  let maxRound = 0;
  for (let i = 0; i < pins.length; i += 1) {
    const pin = pins[i];
    if (pin && pin.roundNumber > maxRound) maxRound = pin.roundNumber;
  }
  return maxRound > 0 ? maxRound : fallback;
}

/**
 * 수정 라운드 A→B 간 신규 발생, 검수 완료, 회귀 재수정, 진척 및 역할별 잔여 작업량을 산출한다.
 */
export function diffRevisionRounds(
  roundAPins: readonly RedlinePinItem[],
  roundBPins: readonly RedlinePinItem[],
  options?: RevisionRoundDiffOptions,
): RevisionRoundDiffResult {
  const normA = normalizeRedlinePins(roundAPins);
  const normB = normalizeRedlinePins(roundBPins);
  const mapA = indexPinsById(normA);
  const mapB = indexPinsById(normB);

  const fromRoundNumber =
    typeof options?.fromRoundNumber === "number" && Number.isFinite(options.fromRoundNumber)
      ? sanitizeRoundNumber(options.fromRoundNumber)
      : inferMaxRound(normA, 1);
  const toRoundNumber =
    typeof options?.toRoundNumber === "number" && Number.isFinite(options.toRoundNumber)
      ? sanitizeRoundNumber(options.toRoundNumber)
      : inferMaxRound(normB, fromRoundNumber + 1);

  const addedPinIds: string[] = [];
  const removedPinIds: string[] = [];
  const closedPinIds: string[] = [];
  const reopenedPinIds: string[] = [];
  const progressedPinIds: string[] = [];
  const unchangedPinIds: string[] = [];

  for (const [pinId, pinB] of mapB.entries()) {
    const pinA = mapA.get(pinId);
    if (!pinA) {
      addedPinIds.push(pinId);
      if (pinB.status === "verified-closed") closedPinIds.push(pinId);
      continue;
    }

    if (pinB.status === "verified-closed") {
      if (pinA.status !== "verified-closed") closedPinIds.push(pinId);
      else unchangedPinIds.push(pinId);
      continue;
    }

    const reopenCountIncreased = (pinB.reopenCount ?? 0) > (pinA.reopenCount ?? 0);
    const transitionedToReopened = pinA.status !== "reopened" && pinB.status === "reopened";
    const regressedFromClosed = pinA.status === "verified-closed";

    if (transitionedToReopened || regressedFromClosed || reopenCountIncreased) {
      reopenedPinIds.push(pinId);
      continue;
    }

    if (STATUS_PROGRESS_RANK[pinB.status] > STATUS_PROGRESS_RANK[pinA.status]) {
      progressedPinIds.push(pinId);
    } else {
      unchangedPinIds.push(pinId);
    }
  }

  for (const pinId of mapA.keys()) {
    if (!mapB.has(pinId)) removedPinIds.push(pinId);
  }

  addedPinIds.sort();
  removedPinIds.sort();
  closedPinIds.sort();
  reopenedPinIds.sort();
  progressedPinIds.sort();
  unchangedPinIds.sort();

  const dedupedA = [...mapA.values()];
  const dedupedB = [...mapB.values()];

  let roundARemainingCount = 0;
  for (let i = 0; i < dedupedA.length; i += 1) {
    if (dedupedA[i]?.status !== "verified-closed") roundARemainingCount += 1;
  }

  let roundBRemainingCount = 0;
  let roundBClosedCount = 0;
  for (let i = 0; i < dedupedB.length; i += 1) {
    if (dedupedB[i]?.status === "verified-closed") roundBClosedCount += 1;
    else roundBRemainingCount += 1;
  }

  const closureRateRatio =
    dedupedB.length === 0 ? 1 : roundCoord(roundBClosedCount / dedupedB.length);
  const { remainingByRole, remainingDetailByRole } = computeRemainingWorkloadByRole(dedupedB);

  return {
    fromRoundNumber,
    toRoundNumber,
    addedPinIds,
    removedPinIds,
    closedPinIds,
    reopenedPinIds,
    progressedPinIds,
    unchangedPinIds,
    remainingByRole,
    remainingDetailByRole,
    roundATotalCount: dedupedA.length,
    roundBTotalCount: dedupedB.length,
    roundARemainingCount,
    roundBRemainingCount,
    netRemainingDelta: roundBRemainingCount - roundARemainingCount,
    closureRateRatio,
    roundALedgerSha256Hex: computeRedlineLedgerSha256Hex(dedupedA),
    roundBLedgerSha256Hex: computeRedlineLedgerSha256Hex(dedupedB),
  };
}

/**
 * 회차 전체 레드라인 핀을 집계해 PD 출고 승인 게이트 판정(`episodeSignOffReady`)을 내린다.
 * `blocker` 심각도 미완료 건이 1건이라도 남아 있으면 옵션과 무관하게 무조건 출고를 차단한다.
 */
export function evaluateEpisodeRevisionSignOff(
  pins: readonly RedlinePinItem[],
  options?: EpisodeSignOffOptions,
): EpisodeRevisionSignOffResult {
  const normalized = normalizeRedlinePins(pins);
  const episodeId = options?.episodeId?.trim() || "EP-01";
  const episodeTitleKo = options?.episodeTitleKo?.trim() || "웹툰 회차 검수";
  const roundNumber =
    typeof options?.roundNumber === "number" && Number.isFinite(options.roundNumber)
      ? sanitizeRoundNumber(options.roundNumber)
      : inferMaxRound(normalized, 1);

  const allowUnresolvedPolish = options?.allowUnresolvedPolish === true;
  const allowUnresolvedMajor = options?.allowUnresolvedMajor === true;
  const blockOnPotentialConflicts = options?.blockOnPotentialConflicts === true;

  const totalBySeverity: Record<RedlinePinSeverity, number> = { blocker: 0, major: 0, polish: 0 };
  const unresolvedBySeverity: Record<RedlinePinSeverity, number> = {
    blocker: 0,
    major: 0,
    polish: 0,
  };
  const countsByStatus: Record<RedlinePinStatus, number> = {
    open: 0,
    "in-progress": 0,
    "resolved-pending-verify": 0,
    "verified-closed": 0,
    reopened: 0,
  };

  const unresolvedBlockerPinIds: string[] = [];
  const unresolvedMajorPinIds: string[] = [];
  const unresolvedPolishPinIds: string[] = [];

  for (let i = 0; i < normalized.length; i += 1) {
    const pin = normalized[i];
    if (!pin) continue;
    totalBySeverity[pin.severity] += 1;
    countsByStatus[pin.status] += 1;
    if (pin.status !== "verified-closed") {
      unresolvedBySeverity[pin.severity] += 1;
      if (pin.severity === "blocker") unresolvedBlockerPinIds.push(pin.pinId);
      else if (pin.severity === "major") unresolvedMajorPinIds.push(pin.pinId);
      else unresolvedPolishPinIds.push(pin.pinId);
    }
  }

  unresolvedBlockerPinIds.sort();
  unresolvedMajorPinIds.sort();
  unresolvedPolishPinIds.sort();

  const overlapReport = detectOverlappingRedlinePins(normalized, {
    clusterRadiusNorm: options?.clusterRadiusNorm,
    activeOnly: false,
  });

  let activeConflictClusterCount = 0;
  for (let i = 0; i < overlapReport.clusters.length; i += 1) {
    const cluster = overlapReport.clusters[i];
    if (cluster && cluster.potentialConflict && cluster.hasActivePin) {
      activeConflictClusterCount += 1;
    }
  }

  const blockingCodes: EpisodeSignOffBlockingCode[] = [];
  const blockingReasonsKo: string[] = [];
  const advisoryNotesKo: string[] = [];

  // 불변식: blocker 미완료는 예외 없이 출고 차단
  if (unresolvedBlockerPinIds.length > 0) {
    blockingCodes.push("UNRESOLVED_BLOCKER_PINS");
    blockingReasonsKo.push(
      `출고 차단(BLOCKER) 핀 ${unresolvedBlockerPinIds.length}건(${unresolvedBlockerPinIds.join(", ")})이 아직 검수 완료(verified-closed)되지 않았습니다.`,
    );
  }

  if (unresolvedMajorPinIds.length > 0) {
    if (!allowUnresolvedMajor) {
      blockingCodes.push("UNRESOLVED_MAJOR_PINS");
      blockingReasonsKo.push(
        `주요 수정(MAJOR) 핀 ${unresolvedMajorPinIds.length}건(${unresolvedMajorPinIds.join(", ")})의 수정·교차 검수가 남아 있습니다.`,
      );
    } else {
      advisoryNotesKo.push(
        `주요 수정(MAJOR) 핀 ${unresolvedMajorPinIds.length}건이 PD 예외 승인으로 이월되었습니다.`,
      );
    }
  }

  if (activeConflictClusterCount > 0) {
    if (blockOnPotentialConflicts) {
      blockingCodes.push("UNRESOLVED_PIN_CONFLICT");
      blockingReasonsKo.push(
        `서로 다른 검수자의 지시가 겹친 활성 상충 군집 ${activeConflictClusterCount}건의 합의 조율이 완료되지 않았습니다.`,
      );
    } else {
      advisoryNotesKo.push(
        `활성 상충 핀 군집 ${activeConflictClusterCount}건이 감지되었습니다. 담당자 간 지시 충돌 여부를 확인하세요.`,
      );
    }
  }

  const deferredPolishPinIds: string[] = [];
  if (unresolvedPolishPinIds.length > 0) {
    if (allowUnresolvedPolish) {
      deferredPolishPinIds.push(...unresolvedPolishPinIds);
      advisoryNotesKo.push(
        `마감 보완(POLISH) 핀 ${unresolvedPolishPinIds.length}건(${unresolvedPolishPinIds.join(", ")})을 조건부 이월 항목으로 기록했습니다.`,
      );
    } else {
      blockingCodes.push("UNRESOLVED_POLISH_PINS");
      blockingReasonsKo.push(
        `마감 보완(POLISH) 핀 ${unresolvedPolishPinIds.length}건이 남아 있습니다. 마감 일정상 이월 출고가 필요하면 조건부 통과 옵션을 활성화하세요.`,
      );
    }
  }

  let episodeSignOffReady = false;
  let signOffDecision: EpisodeSignOffDecision = "blocked";
  if (blockingCodes.length === 0) {
    episodeSignOffReady = true;
    signOffDecision =
      deferredPolishPinIds.length > 0 ? "conditional-pass-with-polish" : "approved";
  }

  const closedPinCount = countsByStatus["verified-closed"];
  const totalPinCount = normalized.length;
  const remainingPinCount = totalPinCount - closedPinCount;
  const completionRatio = totalPinCount === 0 ? 1 : roundCoord(closedPinCount / totalPinCount);
  const { remainingByRole, remainingDetailByRole } = computeRemainingWorkloadByRole(normalized);

  return {
    episodeId,
    episodeTitleKo,
    roundNumber,
    episodeSignOffReady,
    signOffDecision,
    blockingCodes,
    blockingReasonsKo,
    advisoryNotesKo,
    totalPinCount,
    closedPinCount,
    remainingPinCount,
    completionRatio,
    unresolvedBySeverity,
    totalBySeverity,
    countsByStatus,
    remainingByRole,
    remainingDetailByRole,
    unresolvedBlockerPinIds,
    unresolvedMajorPinIds,
    unresolvedPolishPinIds,
    deferredPolishPinIds,
    overlapReport,
    activeConflictClusterCount,
    ledgerSha256Hex: computeRedlineLedgerSha256Hex(normalized),
  };
}
