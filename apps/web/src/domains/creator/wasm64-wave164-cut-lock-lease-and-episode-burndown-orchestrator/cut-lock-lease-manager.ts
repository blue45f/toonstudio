/**
 * Wasm64 Wave 164 컷-공정 리스(Cut-Lock Lease) 상태 머신 & 충돌 제로 델타 병합기:
 * - 동일 `(cutId, stage)` 상호 배제 + 타 공정/타 컷 병렬 작업 허용
 * - 단조 증가 펜싱 토큰(`fencingToken`: 1, 2, 3, ...)으로 만료 뒤 좀비 덮어쓰기 원천 차단
 * - 어시스턴트별 동시 작업 상한(`maxConcurrentLeases`) WIP 제한
 * - 독립 패치의 입력 순서와 무관한 결정론적 병합 상태 및 SHA-256 해시 산출
 */

import { canonicalJsonStringify, sha256StudioOpsHex } from "./cut-lock-burndown-report";
import {
  STUDIO_STAGE_LABELS_KO,
  makeCutStageSlotKey,
  type AcquireCutStageLeaseRequest,
  type AcquireCutStageLeaseResult,
  type AssistantCapacityProfile,
  type CreateCutLockLeaseStateOptions,
  type CutLockLeaseAuditEntry,
  type CutLockLeaseState,
  type CutStageLeaseRecord,
  type CutStagePatch,
  type CutStagePatchDecision,
  type CutStagePatchMergeResult,
  type LeaseRejectionReason,
  type MergeCutStagePatchesOptions,
  type MergedCutStageSlotState,
  type ReclaimExpiredLeasesResult,
  type ReleaseCutStageLeaseRequest,
  type ReleaseCutStageLeaseResult,
  type RenewCutStageLeaseRequest,
  type RenewCutStageLeaseResult,
  type StagePatchMergeOutcome,
} from "./cut-lock-burndown-types";

const DEFAULT_LEASE_TTL_MS = 30 * 60 * 1000;

function hasOwn(obj: Readonly<Record<string, unknown>>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function round6(value: number): number {
  return Number.isFinite(value) ? Math.round(value * 1_000_000) / 1_000_000 : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > 1 ? 1 : value;
}

function appendAudit(
  state: CutLockLeaseState,
  entry: Omit<CutLockLeaseAuditEntry, "seq">,
): { readonly auditLog: readonly CutLockLeaseAuditEntry[]; readonly nextEventSeq: number } {
  return {
    auditLog: [...state.auditLog, { seq: state.nextEventSeq, ...entry }],
    nextEventSeq: state.nextEventSeq + 1,
  };
}

function countActiveLeasesForAssistant(
  state: CutLockLeaseState,
  assistantId: string,
  nowMs: number,
): number {
  let count = 0;
  const keys = Object.keys(state.activeLeases);
  for (let i = 0; i < keys.length; i += 1) {
    const lease = state.activeLeases[keys[i]];
    if (lease.holderId === assistantId && lease.expiresAtMs > nowMs) {
      count += 1;
    }
  }
  return count;
}

function rejectAcquire(
  state: CutLockLeaseState,
  req: AcquireCutStageLeaseRequest,
  reason: LeaseRejectionReason,
  existingToken: number,
): AcquireCutStageLeaseResult {
  const audit = appendAudit(state, {
    timestampMs: req.nowMs,
    kind: "rejected",
    cutId: req.cutId,
    stage: req.stage,
    assistantId: req.assistantId,
    fencingToken: existingToken,
    reason,
  });
  return {
    ok: false,
    state: { ...state, auditLog: audit.auditLog, nextEventSeq: audit.nextEventSeq },
    lease: null,
    reason,
    reclaimedPreviousLease: null,
  };
}

/**
 * 스튜디오 회차별 컷-락 리스 상태 머신을 초기화한다.
 */
export function createCutLockLeaseState(
  options: CreateCutLockLeaseStateOptions,
): CutLockLeaseState {
  const assistantsMap: Record<string, AssistantCapacityProfile> = {};
  const sorted = [...options.assistants].sort((a, b) =>
    a.assistantId.localeCompare(b.assistantId),
  );
  for (let i = 0; i < sorted.length; i += 1) {
    const p = sorted[i];
    assistantsMap[p.assistantId] = {
      assistantId: p.assistantId,
      nameKo: p.nameKo,
      skills: [...p.skills],
      maxConcurrentLeases: Math.max(1, Math.floor(p.maxConcurrentLeases)),
      velocityHoursPerDay: Math.max(0.25, p.velocityHoursPerDay),
      availabilityRatio: p.availabilityRatio,
    };
  }
  const ttl =
    options.defaultLeaseTtlMs !== undefined &&
    Number.isFinite(options.defaultLeaseTtlMs) &&
    options.defaultLeaseTtlMs > 0
      ? Math.floor(options.defaultLeaseTtlMs)
      : DEFAULT_LEASE_TTL_MS;

  return {
    episodeId: options.episodeId,
    nextFencingToken: 1,
    nextEventSeq: 1,
    defaultLeaseTtlMs: ttl,
    enforceSkillMatch: options.enforceSkillMatch ?? true,
    assistants: assistantsMap,
    activeLeases: {},
    highestGrantedTokenBySlot: {},
    auditLog: [],
  };
}

/**
 * 특정 `(cutId, stage)` 슬롯에 대해 배타적 컷-락 리스를 획득한다.
 * 동일 컷의 서로 다른 공정이나 다른 컷은 동시에 병렬 리스를 획득할 수 있다.
 */
export function acquireCutStageLease(
  state: CutLockLeaseState,
  req: AcquireCutStageLeaseRequest,
): AcquireCutStageLeaseResult {
  const durationMs = req.leaseDurationMs ?? state.defaultLeaseTtlMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return rejectAcquire(state, req, "invalid-duration", 0);
  }
  if (!hasOwn(state.assistants, req.assistantId)) {
    return rejectAcquire(state, req, "assistant-not-registered", 0);
  }
  const assistant = state.assistants[req.assistantId];
  if (state.enforceSkillMatch && !assistant.skills.includes(req.stage)) {
    return rejectAcquire(state, req, "assistant-lacks-stage-skill", 0);
  }

  const slotKey = makeCutStageSlotKey(req.cutId, req.stage);
  const existing = hasOwn(state.activeLeases, slotKey) ? state.activeLeases[slotKey] : null;
  let working = state;
  let reclaimedPreviousLease: CutStageLeaseRecord | null = null;

  if (existing !== null) {
    if (existing.expiresAtMs > req.nowMs) {
      const reason: LeaseRejectionReason =
        existing.holderId === req.assistantId
          ? "already-held-by-self"
          : "already-locked-by-other";
      return rejectAcquire(state, req, reason, existing.fencingToken);
    }
    const afterReclaim: Record<string, CutStageLeaseRecord> = { ...working.activeLeases };
    delete afterReclaim[slotKey];
    const reclaimAudit = appendAudit(working, {
      timestampMs: req.nowMs,
      kind: "reclaimed-expired",
      cutId: existing.cutId,
      stage: existing.stage,
      assistantId: existing.holderId,
      fencingToken: existing.fencingToken,
      leaseId: existing.leaseId,
    });
    working = {
      ...working,
      activeLeases: afterReclaim,
      auditLog: reclaimAudit.auditLog,
      nextEventSeq: reclaimAudit.nextEventSeq,
    };
    reclaimedPreviousLease = existing;
  }

  if (countActiveLeasesForAssistant(working, req.assistantId, req.nowMs) >= assistant.maxConcurrentLeases) {
    return rejectAcquire(working, req, "wip-limit-reached", 0);
  }

  const token = working.nextFencingToken;
  const ttlFloor = Math.floor(durationMs);
  const lease: CutStageLeaseRecord = {
    leaseId: `lease-${working.episodeId}-${req.cutId}-${req.stage}-t${token}`,
    cutId: req.cutId,
    stage: req.stage,
    holderId: req.assistantId,
    fencingToken: token,
    acquiredAtMs: req.nowMs,
    renewedAtMs: req.nowMs,
    expiresAtMs: req.nowMs + ttlFloor,
    leaseDurationMs: ttlFloor,
  };
  const acquireAudit = appendAudit(working, {
    timestampMs: req.nowMs,
    kind: "acquired",
    cutId: req.cutId,
    stage: req.stage,
    assistantId: req.assistantId,
    fencingToken: token,
    leaseId: lease.leaseId,
  });

  return {
    ok: true,
    state: {
      ...working,
      nextFencingToken: token + 1,
      activeLeases: { ...working.activeLeases, [slotKey]: lease },
      highestGrantedTokenBySlot: {
        ...working.highestGrantedTokenBySlot,
        [slotKey]: Math.max(working.highestGrantedTokenBySlot[slotKey] ?? 0, token),
      },
      auditLog: acquireAudit.auditLog,
      nextEventSeq: acquireAudit.nextEventSeq,
    },
    lease,
    reason: null,
    reclaimedPreviousLease,
  };
}

/**
 * 보유 중인 유효 리스의 만료 시각을 연장한다. 만료되었거나 구버전 토큰이면 갱신을 거부한다.
 */
export function renewCutStageLease(
  state: CutLockLeaseState,
  req: RenewCutStageLeaseRequest,
): RenewCutStageLeaseResult {
  const durationMs = req.extendDurationMs ?? state.defaultLeaseTtlMs;
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { ok: false, state, lease: null, reason: "invalid-duration" };
  }
  const slotKey = makeCutStageSlotKey(req.cutId, req.stage);
  if (!hasOwn(state.activeLeases, slotKey)) {
    const highest = state.highestGrantedTokenBySlot[slotKey] ?? 0;
    const reason: LeaseRejectionReason =
      highest > 0 && req.fencingToken < highest ? "stale-fencing-token" : "lease-not-found";
    return { ok: false, state, lease: null, reason };
  }

  const existing = state.activeLeases[slotKey];
  if (req.fencingToken !== existing.fencingToken) {
    const reason: LeaseRejectionReason =
      req.fencingToken < existing.fencingToken ? "stale-fencing-token" : "not-lease-holder";
    return { ok: false, state, lease: null, reason };
  }
  if (existing.holderId !== req.assistantId) {
    return { ok: false, state, lease: null, reason: "not-lease-holder" };
  }
  if (req.nowMs >= existing.expiresAtMs) {
    return { ok: false, state, lease: null, reason: "lease-expired" };
  }

  const ttlFloor = Math.floor(durationMs);
  const renewed: CutStageLeaseRecord = {
    ...existing,
    renewedAtMs: req.nowMs,
    expiresAtMs: req.nowMs + ttlFloor,
    leaseDurationMs: ttlFloor,
  };
  const audit = appendAudit(state, {
    timestampMs: req.nowMs,
    kind: "renewed",
    cutId: req.cutId,
    stage: req.stage,
    assistantId: req.assistantId,
    fencingToken: renewed.fencingToken,
    leaseId: renewed.leaseId,
  });

  return {
    ok: true,
    state: {
      ...state,
      activeLeases: { ...state.activeLeases, [slotKey]: renewed },
      auditLog: audit.auditLog,
      nextEventSeq: audit.nextEventSeq,
    },
    lease: renewed,
    reason: null,
  };
}

/**
 * 작업 완료·중단 시 보유자가 리스를 명시적으로 반납한다.
 */
export function releaseCutStageLease(
  state: CutLockLeaseState,
  req: ReleaseCutStageLeaseRequest,
): ReleaseCutStageLeaseResult {
  const slotKey = makeCutStageSlotKey(req.cutId, req.stage);
  if (!hasOwn(state.activeLeases, slotKey)) {
    const highest = state.highestGrantedTokenBySlot[slotKey] ?? 0;
    const reason: LeaseRejectionReason =
      highest > 0 && req.fencingToken < highest ? "stale-fencing-token" : "lease-not-found";
    return { ok: false, state, releasedLease: null, reason };
  }

  const existing = state.activeLeases[slotKey];
  if (req.fencingToken !== existing.fencingToken) {
    const reason: LeaseRejectionReason =
      req.fencingToken < existing.fencingToken ? "stale-fencing-token" : "not-lease-holder";
    return { ok: false, state, releasedLease: null, reason };
  }
  if (existing.holderId !== req.assistantId) {
    return { ok: false, state, releasedLease: null, reason: "not-lease-holder" };
  }

  const nextActive: Record<string, CutStageLeaseRecord> = { ...state.activeLeases };
  delete nextActive[slotKey];
  const audit = appendAudit(state, {
    timestampMs: req.nowMs,
    kind: "released",
    cutId: req.cutId,
    stage: req.stage,
    assistantId: req.assistantId,
    fencingToken: existing.fencingToken,
    leaseId: existing.leaseId,
  });

  return {
    ok: true,
    state: {
      ...state,
      activeLeases: nextActive,
      auditLog: audit.auditLog,
      nextEventSeq: audit.nextEventSeq,
    },
    releasedLease: existing,
    reason: null,
  };
}

/**
 * 기준 시각(`nowMs >= expiresAtMs`) 기준으로 만료된 모든 컷-락 리스를 결정론적으로 회수한다.
 * 슬롯별 최고 발급 펜싱 토큰 기록은 유지해 만료 뒤 좀비 패치를 계속 차단한다.
 */
export function reclaimExpiredLeases(
  state: CutLockLeaseState,
  nowMs: number,
): ReclaimExpiredLeasesResult {
  const sortedKeys = Object.keys(state.activeLeases).sort();
  const nextActive: Record<string, CutStageLeaseRecord> = {};
  const reclaimed: CutStageLeaseRecord[] = [];
  const addedAudit: CutLockLeaseAuditEntry[] = [];
  let nextSeq = state.nextEventSeq;

  for (let i = 0; i < sortedKeys.length; i += 1) {
    const slotKey = sortedKeys[i];
    const lease = state.activeLeases[slotKey];
    if (nowMs >= lease.expiresAtMs) {
      reclaimed.push(lease);
      addedAudit.push({
        seq: nextSeq,
        timestampMs: nowMs,
        kind: "reclaimed-expired",
        cutId: lease.cutId,
        stage: lease.stage,
        assistantId: lease.holderId,
        fencingToken: lease.fencingToken,
        leaseId: lease.leaseId,
      });
      nextSeq += 1;
    } else {
      nextActive[slotKey] = lease;
    }
  }

  if (reclaimed.length === 0) {
    return { state, reclaimedLeases: [], reclaimedCount: 0 };
  }
  return {
    state: {
      ...state,
      activeLeases: nextActive,
      auditLog: [...state.auditLog, ...addedAudit],
      nextEventSeq: nextSeq,
    },
    reclaimedLeases: reclaimed,
    reclaimedCount: reclaimed.length,
  };
}

function wasTokenReclaimedAsExpired(
  state: CutLockLeaseState,
  patch: CutStagePatch,
): boolean {
  for (let i = state.auditLog.length - 1; i >= 0; i -= 1) {
    const entry = state.auditLog[i];
    if (
      entry.cutId === patch.cutId &&
      entry.stage === patch.stage &&
      entry.fencingToken === patch.fencingToken &&
      entry.assistantId === patch.authorId
    ) {
      return entry.kind === "reclaimed-expired";
    }
  }
  return false;
}

function makeDecision(
  patch: CutStagePatch,
  outcome: StagePatchMergeOutcome,
  expectedFencingToken: number | null,
  reasonKo: string,
): CutStagePatchDecision {
  return {
    patchId: patch.patchId,
    cutId: patch.cutId,
    stage: patch.stage,
    authorId: patch.authorId,
    fencingToken: patch.fencingToken,
    outcome,
    expectedFencingToken,
    reasonKo,
  };
}

function validatePatch(
  state: CutLockLeaseState,
  patch: CutStagePatch,
  nowMs: number,
): CutStagePatchDecision {
  const slotKey = makeCutStageSlotKey(patch.cutId, patch.stage);
  const stageKo = STUDIO_STAGE_LABELS_KO[patch.stage];
  const active = hasOwn(state.activeLeases, slotKey) ? state.activeLeases[slotKey] : null;
  const highest = state.highestGrantedTokenBySlot[slotKey] ?? 0;

  if (active !== null) {
    if (patch.fencingToken < active.fencingToken) {
      return makeDecision(
        patch,
        "rejected-stale-fencing-token",
        active.fencingToken,
        `${patch.cutId}(${stageKo}) 패치가 구버전 펜싱 토큰(T${patch.fencingToken} < 현재 T${active.fencingToken})으로 제출되어 덮어쓰기를 차단함`,
      );
    }
    if (patch.fencingToken !== active.fencingToken || patch.authorId !== active.holderId) {
      return makeDecision(
        patch,
        "rejected-unowned-lease",
        active.fencingToken,
        `${patch.cutId}(${stageKo}) 리스 소유자(${active.holderId})와 제출자(${patch.authorId}) 또는 토큰이 일치하지 않음`,
      );
    }
    if (nowMs >= active.expiresAtMs) {
      return makeDecision(
        patch,
        "rejected-lease-expired",
        active.fencingToken,
        `${patch.cutId}(${stageKo}) 리스(T${active.fencingToken})가 만료되어 패치를 보류함`,
      );
    }
    return makeDecision(
      patch,
      "merged-clean",
      active.fencingToken,
      `${patch.cutId}(${stageKo}) 리스 T${active.fencingToken} 검증 통과 — 충돌 없이 병합 완료`,
    );
  }

  if (highest > 0 && patch.fencingToken < highest) {
    return makeDecision(
      patch,
      "rejected-stale-fencing-token",
      highest,
      `${patch.cutId}(${stageKo}) 슬롯의 최신 토큰(T${highest})보다 오래된 구토큰(T${patch.fencingToken}) 패치를 차단함`,
    );
  }
  if (highest > 0 && patch.fencingToken === highest && wasTokenReclaimedAsExpired(state, patch)) {
    return makeDecision(
      patch,
      "rejected-lease-expired",
      null,
      `${patch.cutId}(${stageKo}) 리스(T${patch.fencingToken})가 만료 회수된 뒤 도착한 패치를 거부함`,
    );
  }
  return makeDecision(
    patch,
    "rejected-unowned-lease",
    null,
    `${patch.cutId}(${stageKo}) 슬롯에 유효한 활성 리스가 없어 패치를 거부함`,
  );
}

function compareCanonicalPatches(a: CutStagePatch, b: CutStagePatch): number {
  const slotA = makeCutStageSlotKey(a.cutId, a.stage);
  const slotB = makeCutStageSlotKey(b.cutId, b.stage);
  if (slotA !== slotB) return slotA.localeCompare(slotB);
  if (a.fencingToken !== b.fencingToken) return a.fencingToken - b.fencingToken;
  if (a.baseRevision !== b.baseRevision) return a.baseRevision - b.baseRevision;
  if (a.submittedAtMs !== b.submittedAtMs) return a.submittedAtMs - b.submittedAtMs;
  return a.patchId.localeCompare(b.patchId);
}

interface MutableSlotAccumulator {
  readonly cutId: string;
  readonly stage: CutStagePatch["stage"];
  revision: number;
  lastFencingToken: number;
  lastAuthorId: string;
  accumulatedProgressHours: number;
  completedRatio: number;
  readonly appliedPatchIds: string[];
  readonly layerDigests: Record<string, string>;
}

/**
 * 활성 리스 소유권과 정확한 펜싱 토큰을 검증한 뒤,
 * 독립 패치를 입력 순서와 무관한 정규 순서로 병합해 동일한 상태와 SHA-256 해시를 산출한다.
 */
export function mergeCutStagePatches(
  state: CutLockLeaseState,
  patches: readonly CutStagePatch[],
  options: MergeCutStagePatchesOptions,
): CutStagePatchMergeResult {
  const decisions: CutStagePatchDecision[] = [];
  const accepted: CutStagePatch[] = [];
  let staleTokenRejectionCount = 0;
  let unownedRejectionCount = 0;
  let expiredRejectionCount = 0;

  for (let i = 0; i < patches.length; i += 1) {
    const patch = patches[i];
    const decision = validatePatch(state, patch, options.nowMs);
    decisions.push(decision);
    if (decision.outcome === "merged-clean") accepted.push(patch);
    else if (decision.outcome === "rejected-stale-fencing-token") staleTokenRejectionCount += 1;
    else if (decision.outcome === "rejected-unowned-lease") unownedRejectionCount += 1;
    else expiredRejectionCount += 1;
  }

  const bySlot: Record<string, MutableSlotAccumulator> = {};
  if (options.initialMergedSlots) {
    const initialKeys = Object.keys(options.initialMergedSlots).sort();
    for (let i = 0; i < initialKeys.length; i += 1) {
      const k = initialKeys[i];
      const existing = options.initialMergedSlots[k];
      bySlot[k] = {
        cutId: existing.cutId,
        stage: existing.stage,
        revision: existing.revision,
        lastFencingToken: existing.lastFencingToken,
        lastAuthorId: existing.lastAuthorId,
        accumulatedProgressHours: existing.accumulatedProgressHours,
        completedRatio: existing.completedRatio,
        appliedPatchIds: [...existing.appliedPatchIds],
        layerDigests: { ...existing.layerDigests },
      };
    }
  }

  const canonical = [...accepted].sort(compareCanonicalPatches);
  for (let i = 0; i < canonical.length; i += 1) {
    const p = canonical[i];
    const slotKey = makeCutStageSlotKey(p.cutId, p.stage);
    const deltaHours = Math.max(0, Number.isFinite(p.progressDeltaHours) ? p.progressDeltaHours : 0);
    if (!hasOwn(bySlot, slotKey)) {
      bySlot[slotKey] = {
        cutId: p.cutId,
        stage: p.stage,
        revision: 0,
        lastFencingToken: 0,
        lastAuthorId: p.authorId,
        accumulatedProgressHours: 0,
        completedRatio: 0,
        appliedPatchIds: [],
        layerDigests: {},
      };
    }
    const slot = bySlot[slotKey];
    slot.revision += 1;
    slot.lastFencingToken = Math.max(slot.lastFencingToken, p.fencingToken);
    slot.lastAuthorId = p.authorId;
    slot.accumulatedProgressHours = round6(slot.accumulatedProgressHours + deltaHours);
    if (p.completedRatio !== undefined) {
      slot.completedRatio = Math.max(slot.completedRatio, clamp01(p.completedRatio));
    }
    slot.appliedPatchIds.push(p.patchId);
    slot.layerDigests[p.layerPath] = p.payloadDigestHex;
  }

  const sortedSlotKeys = Object.keys(bySlot).sort();
  const mergedSlots: Record<string, MergedCutStageSlotState> = {};
  for (let i = 0; i < sortedSlotKeys.length; i += 1) {
    const slotKey = sortedSlotKeys[i];
    const slot = bySlot[slotKey];
    const sortedLayerDigests: Record<string, string> = {};
    const layerPaths = Object.keys(slot.layerDigests).sort();
    for (let j = 0; j < layerPaths.length; j += 1) {
      sortedLayerDigests[layerPaths[j]] = slot.layerDigests[layerPaths[j]];
    }
    const core = {
      cutId: slot.cutId,
      stage: slot.stage,
      revision: slot.revision,
      lastFencingToken: slot.lastFencingToken,
      lastAuthorId: slot.lastAuthorId,
      accumulatedProgressHours: round6(slot.accumulatedProgressHours),
      completedRatio: round6(slot.completedRatio),
      appliedPatchIds: [...slot.appliedPatchIds],
      layerDigests: sortedLayerDigests,
    };
    mergedSlots[slotKey] = {
      ...core,
      slotDigestHex: sha256StudioOpsHex(canonicalJsonStringify(core)),
    };
  }

  return {
    mergedSlots,
    decisions,
    mergedCleanCount: accepted.length,
    rejectedCount: staleTokenRejectionCount + unownedRejectionCount + expiredRejectionCount,
    staleTokenRejectionCount,
    unownedRejectionCount,
    expiredRejectionCount,
    mergeStateSha256Hex: sha256StudioOpsHex(canonicalJsonStringify(mergedSlots)),
  };
}
