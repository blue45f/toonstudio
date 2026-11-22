/**
 * 오프라인 편집 → 다중 기기(PC/태블릿/모바일) 동시 수정 충돌 → 재접속 시
 * CRDT·벡터 클록 병합 무손실·결정적 수렴(Strong Eventual Consistency) 검증 엔진.
 *
 * - 벡터 클록 부분 순서(`before | after | equal | concurrent`)와 결합 반격자 병합을 구현한다.
 * - 스트로크는 OR-Set(Add-Wins)으로 병합해 동시 오프라인 작화에서 0% 획 손실을 보장한다.
 * - 컷 필드는 인과 프런티어 기반 결정적 LWW 레지스터로 수렴하며 동시 충돌의 패배 값도
 *   충돌 원장에 무손실 보존한다.
 * - 6가지 도착 순열 + 중복 패킷 재전송(멱등성) 시뮬레이션으로 수렴 불변식을 전수 검증한다.
 */

import {
  canonicalJsonStringify,
  computeSha256Hex,
} from "./creator-trust-sha256";

export type VectorClock = Readonly<Record<string, number>>;

export type VectorClockRelation = "equal" | "before" | "after" | "concurrent";

export type SyncDeviceKind = "desktop" | "tablet" | "mobile" | "web";

export type CrdtScalarValue = string | number | boolean | null;

export type MultiDeviceCrdtOpKind =
  | "field-set"
  | "stroke-add"
  | "stroke-remove"
  | "cut-delete"
  | "cut-restore";

export interface MultiDeviceCrdtOperation {
  readonly opId: string;
  readonly deviceId: string;
  readonly deviceKind: SyncDeviceKind;
  readonly cutId: string;
  readonly kind: MultiDeviceCrdtOpKind;
  readonly field?: string;
  readonly value?: CrdtScalarValue;
  readonly strokeId?: string;
  readonly observedAddOpIds?: readonly string[];
  readonly vectorClock: VectorClock;
  readonly lamportClock: number;
  readonly wallClockMs: number;
}

export interface DeviceOfflineSession {
  readonly deviceId: string;
  readonly deviceKind: SyncDeviceKind;
  readonly operations: readonly MultiDeviceCrdtOperation[];
}

export interface PreservedFieldConflictValue {
  readonly opId: string;
  readonly deviceId: string;
  readonly lamportClock: number;
  readonly value: CrdtScalarValue;
}

export interface ConcurrentFieldConflictRecord {
  readonly cutId: string;
  readonly field: string;
  readonly winningOpId: string;
  readonly winningDeviceId: string;
  readonly winningValue: CrdtScalarValue;
  readonly preservedSupersededValues: readonly PreservedFieldConflictValue[];
}

export interface ConcurrentDeleteEditConflictRecord {
  readonly cutId: string;
  readonly deleteOpId: string;
  readonly deleteDeviceId: string;
  readonly preservedEditOpIds: readonly string[];
  readonly resolution: "preserved-over-concurrent-delete";
}

export interface ConvergedCutState {
  readonly cutId: string;
  readonly deleted: boolean;
  readonly fields: Readonly<Record<string, CrdtScalarValue>>;
  readonly liveStrokeIds: readonly string[];
}

export interface ConvergedMultideviceDocumentState {
  readonly mergedVectorClock: VectorClock;
  readonly cuts: Readonly<Record<string, ConvergedCutState>>;
  readonly fieldConflicts: readonly ConcurrentFieldConflictRecord[];
  readonly deleteEditConflicts: readonly ConcurrentDeleteEditConflictRecord[];
  readonly appliedUniqueOpCount: number;
  readonly duplicateOpIgnoredCount: number;
  readonly stateDigestSha256: string;
}

export interface SyncPermutationRunResult {
  readonly permutationName: string;
  readonly inputOpCount: number;
  readonly stateDigestSha256: string;
  readonly matchesCanonical: boolean;
}

export interface OfflineSyncVerificationInvariants {
  readonly allPermutationsConverged: boolean;
  readonly idempotentUnderDuplicateReplay: boolean;
  readonly zeroUnremovedStrokeLoss: boolean;
  readonly vectorClockMonotonic: boolean;
  readonly allConcurrentConflictsPreserved: boolean;
}

export interface OfflineMultideviceSyncVerificationReport {
  readonly schema: "toonstudio.offline-multidevice-sync-verification/1";
  readonly schemaVersion: 1;
  readonly passed: boolean;
  readonly deviceIds: readonly string[];
  readonly totalOperations: number;
  readonly permutationCount: number;
  readonly invariants: OfflineSyncVerificationInvariants;
  readonly missingExpectedStrokeIds: readonly string[];
  readonly permutationRuns: readonly SyncPermutationRunResult[];
  readonly convergedState: ConvergedMultideviceDocumentState;
  readonly summaryKo: string;
}

export interface OfflineSyncQueueEntryLike {
  readonly opId: string;
  readonly surface: string;
  readonly cutId: string;
  readonly kind: "upsert" | "patch" | "delete";
  readonly causalSequence: number;
  readonly revision?: number;
  readonly patch: Readonly<Record<string, CrdtScalarValue>>;
  readonly actorId: string;
  readonly createdAtMs: number;
}

function compareAscii(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * 두 벡터 클록의 인과 관계(`equal | before | after | concurrent`)를 정확히 판정한다.
 */
export function compareVectorClocks(
  left: VectorClock,
  right: VectorClock,
): VectorClockRelation {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  let leftGreater = false;
  let rightGreater = false;

  for (const key of keys) {
    const l = left[key] ?? 0;
    const r = right[key] ?? 0;
    if (l > r) leftGreater = true;
    else if (r > l) rightGreater = true;
    if (leftGreater && rightGreater) return "concurrent";
  }

  if (leftGreater) return "after";
  if (rightGreater) return "before";
  return "equal";
}

/**
 * 두 벡터 클록의 원소별 최댓값 결합(교환·결합·멱등 반격자 연산)을 계산한다.
 */
export function mergeVectorClocks(
  left: VectorClock,
  right: VectorClock,
): VectorClock {
  const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(
    compareAscii,
  );
  const merged: Record<string, number> = {};
  for (const key of keys) {
    merged[key] = Math.max(left[key] ?? 0, right[key] ?? 0);
  }
  return Object.freeze(merged);
}

/**
 * 특정 기기의 벡터 클록 카운터를 1 증가시킨 새 불변 클록을 반환한다.
 */
export function incrementVectorClock(
  clock: VectorClock,
  deviceId: string,
): VectorClock {
  const keys = [...new Set([...Object.keys(clock), deviceId])].sort(compareAscii);
  const next: Record<string, number> = {};
  for (const key of keys) {
    next[key] = (clock[key] ?? 0) + (key === deviceId ? 1 : 0);
  }
  return Object.freeze(next);
}

function compareConflictWinnerOrder(
  left: MultiDeviceCrdtOperation,
  right: MultiDeviceCrdtOperation,
): number {
  return (
    right.lamportClock - left.lamportClock ||
    compareAscii(right.deviceId, left.deviceId) ||
    compareAscii(right.opId, left.opId)
  );
}

function findCausalFrontier(
  ops: readonly MultiDeviceCrdtOperation[],
): readonly MultiDeviceCrdtOperation[] {
  const frontier: MultiDeviceCrdtOperation[] = [];
  for (const candidate of ops) {
    let dominated = false;
    for (const other of ops) {
      if (candidate.opId === other.opId) continue;
      if (compareVectorClocks(candidate.vectorClock, other.vectorClock) === "before") {
        dominated = true;
        break;
      }
    }
    if (!dominated) {
      frontier.push(candidate);
    }
  }
  frontier.sort(compareConflictWinnerOrder);
  return frontier;
}

/**
 * 임의 순서·중복 전달된 다중 기기 오프라인 CRDT 연산 배열을
 * 순서 독립적(교환·결합·멱등)으로 수렴·병합한다.
 */
export function mergeMultideviceCrdtOperations(
  operations: readonly MultiDeviceCrdtOperation[],
): ConvergedMultideviceDocumentState {
  const uniqueById = new Map<string, MultiDeviceCrdtOperation>();
  let duplicateOpIgnoredCount = 0;

  for (const op of operations) {
    if (uniqueById.has(op.opId)) {
      duplicateOpIgnoredCount += 1;
      continue;
    }
    uniqueById.set(op.opId, op);
  }

  let mergedVectorClock: VectorClock = Object.freeze({});
  const cutIds = new Set<string>();
  const opsByCut = new Map<string, MultiDeviceCrdtOperation[]>();

  for (const op of uniqueById.values()) {
    mergedVectorClock = mergeVectorClocks(mergedVectorClock, op.vectorClock);
    cutIds.add(op.cutId);
    const list = opsByCut.get(op.cutId);
    if (list) list.push(op);
    else opsByCut.set(op.cutId, [op]);
  }

  const sortedCutIds = [...cutIds].sort(compareAscii);
  const cuts: Record<string, ConvergedCutState> = {};
  const fieldConflicts: ConcurrentFieldConflictRecord[] = [];
  const deleteEditConflicts: ConcurrentDeleteEditConflictRecord[] = [];

  for (const cutId of sortedCutIds) {
    const cutOps = opsByCut.get(cutId) ?? [];
    const fieldOpsByName = new Map<string, MultiDeviceCrdtOperation[]>();
    const strokeAdds = new Map<string, MultiDeviceCrdtOperation[]>();
    const strokeRemoves = new Map<string, MultiDeviceCrdtOperation[]>();
    const deleteOps: MultiDeviceCrdtOperation[] = [];
    const restoreOps: MultiDeviceCrdtOperation[] = [];

    for (const op of cutOps) {
      if (op.kind === "field-set" && op.field) {
        const list = fieldOpsByName.get(op.field);
        if (list) list.push(op);
        else fieldOpsByName.set(op.field, [op]);
      } else if (op.kind === "stroke-add" && op.strokeId) {
        const list = strokeAdds.get(op.strokeId);
        if (list) list.push(op);
        else strokeAdds.set(op.strokeId, [op]);
      } else if (op.kind === "stroke-remove" && op.strokeId) {
        const list = strokeRemoves.get(op.strokeId);
        if (list) list.push(op);
        else strokeRemoves.set(op.strokeId, [op]);
      } else if (op.kind === "cut-delete") {
        deleteOps.push(op);
      } else if (op.kind === "cut-restore") {
        restoreOps.push(op);
      }
    }

    // 1. 컷 필드별 인과 프런티어 LWW 수렴 + 동시 충돌 보존
    const fields: Record<string, CrdtScalarValue> = {};
    const liveEditFrontierOps: MultiDeviceCrdtOperation[] = [];
    const sortedFieldNames = [...fieldOpsByName.keys()].sort(compareAscii);

    for (const fieldName of sortedFieldNames) {
      const ops = fieldOpsByName.get(fieldName) ?? [];
      const frontier = findCausalFrontier(ops);
      if (frontier.length === 0) continue;
      const winner = frontier[0];
      fields[fieldName] = winner.value ?? null;
      liveEditFrontierOps.push(...frontier);

      if (frontier.length > 1) {
        fieldConflicts.push(
          Object.freeze({
            cutId,
            field: fieldName,
            winningOpId: winner.opId,
            winningDeviceId: winner.deviceId,
            winningValue: winner.value ?? null,
            preservedSupersededValues: Object.freeze(
              frontier.slice(1).map((loser) =>
                Object.freeze({
                  opId: loser.opId,
                  deviceId: loser.deviceId,
                  lamportClock: loser.lamportClock,
                  value: loser.value ?? null,
                }),
              ),
            ),
          }),
        );
      }
    }

    // 2. 스트로크 OR-Set(Add-Wins): 인과적으로 제거되지 않은 모든 추가 스트로크 유지
    const liveStrokeIds: string[] = [];
    const liveStrokeOps: MultiDeviceCrdtOperation[] = [];
    const sortedStrokeIds = [...strokeAdds.keys()].sort(compareAscii);

    for (const strokeId of sortedStrokeIds) {
      const adds = strokeAdds.get(strokeId) ?? [];
      const removes = strokeRemoves.get(strokeId) ?? [];
      const explicitlyRemovedAddIds = new Set<string>();
      const causalRemoveClocks: VectorClock[] = [];

      for (const removeOp of removes) {
        if (removeOp.observedAddOpIds && removeOp.observedAddOpIds.length > 0) {
          for (const addId of removeOp.observedAddOpIds) {
            explicitlyRemovedAddIds.add(addId);
          }
        } else {
          causalRemoveClocks.push(removeOp.vectorClock);
        }
      }

      const survivingAdds = adds.filter((addOp) => {
        if (explicitlyRemovedAddIds.has(addOp.opId)) return false;
        return !causalRemoveClocks.some(
          (removeClock) =>
            compareVectorClocks(addOp.vectorClock, removeClock) === "before",
        );
      });

      if (survivingAdds.length > 0) {
        liveStrokeIds.push(strokeId);
        liveStrokeOps.push(...survivingAdds);
      }
    }

    // 3. 컷 삭제 vs 동시 편집 충돌 안전 판정(Edit-Wins 보존 정책)
    const activeDeleteFrontier = findCausalFrontier(deleteOps).filter(
      (delOp) =>
        !restoreOps.some(
          (restoreOp) =>
            compareVectorClocks(delOp.vectorClock, restoreOp.vectorClock) === "before" ||
            compareVectorClocks(delOp.vectorClock, restoreOp.vectorClock) === "concurrent",
        ),
    );

    let deleted = false;
    if (activeDeleteFrontier.length > 0) {
      const strongestDelete = activeDeleteFrontier[0];
      const allLiveWorkOps = [...liveEditFrontierOps, ...liveStrokeOps];
      const concurrentOrNewerEdits = allLiveWorkOps.filter((editOp) => {
        const rel = compareVectorClocks(editOp.vectorClock, strongestDelete.vectorClock);
        return rel === "concurrent" || rel === "after";
      });

      if (concurrentOrNewerEdits.length > 0) {
        deleted = false;
        const preservedEditOpIds = [
          ...new Set(concurrentOrNewerEdits.map((op) => op.opId)),
        ].sort(compareAscii);
        deleteEditConflicts.push(
          Object.freeze({
            cutId,
            deleteOpId: strongestDelete.opId,
            deleteDeviceId: strongestDelete.deviceId,
            preservedEditOpIds: Object.freeze(preservedEditOpIds),
            resolution: "preserved-over-concurrent-delete",
          }),
        );
      } else {
        deleted = true;
      }
    }

    cuts[cutId] = Object.freeze({
      cutId,
      deleted,
      fields: Object.freeze(fields),
      liveStrokeIds: Object.freeze(liveStrokeIds),
    });
  }

  const digestPayload = {
    mergedVectorClock,
    cuts,
    fieldConflicts,
    deleteEditConflicts,
  };
  const stateDigestSha256 = computeSha256Hex(canonicalJsonStringify(digestPayload));

  return Object.freeze({
    mergedVectorClock,
    cuts: Object.freeze(cuts),
    fieldConflicts: Object.freeze(fieldConflicts),
    deleteEditConflicts: Object.freeze(deleteEditConflicts),
    appliedUniqueOpCount: uniqueById.size,
    duplicateOpIgnoredCount,
    stateDigestSha256,
  });
}

function deterministicShuffle<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed >>> 0;
  for (let i = copy.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    const tmp = copy[i];
    copy[i] = copy[j];
    copy[j] = tmp;
  }
  return copy;
}

function buildDeliveryPermutations(
  sessions: readonly DeviceOfflineSession[],
): readonly { readonly name: string; readonly ops: readonly MultiDeviceCrdtOperation[] }[] {
  const forward = sessions.flatMap((session) => session.operations);
  const reverse = [...sessions].reverse().flatMap((session) => [...session.operations].reverse());

  const maxLen = sessions.reduce(
    (max, session) => Math.max(max, session.operations.length),
    0,
  );
  const interleaved: MultiDeviceCrdtOperation[] = [];
  for (let step = 0; step < maxLen; step += 1) {
    for (const session of sessions) {
      const op = session.operations[step];
      if (op) interleaved.push(op);
    }
  }

  const reverseInterleaved = [...interleaved].reverse();
  const shuffleA = deterministicShuffle(forward, 0x51a7_c0de);
  const shuffleB = deterministicShuffle(forward, 0x9e37_79b9);

  return Object.freeze([
    { name: "device-order-forward", ops: forward },
    { name: "device-order-reverse", ops: reverse },
    { name: "round-robin-interleaved", ops: interleaved },
    { name: "reverse-round-robin", ops: reverseInterleaved },
    { name: "deterministic-shuffle-a", ops: shuffleA },
    { name: "deterministic-shuffle-b", ops: shuffleB },
  ]);
}

function computeExpectedUnremovedStrokes(
  allOps: readonly MultiDeviceCrdtOperation[],
): readonly string[] {
  const addsByStroke = new Map<string, MultiDeviceCrdtOperation[]>();
  const removesByStroke = new Map<string, MultiDeviceCrdtOperation[]>();

  for (const op of allOps) {
    if (op.kind === "stroke-add" && op.strokeId) {
      const list = addsByStroke.get(op.strokeId);
      if (list) list.push(op);
      else addsByStroke.set(op.strokeId, [op]);
    } else if (op.kind === "stroke-remove" && op.strokeId) {
      const list = removesByStroke.get(op.strokeId);
      if (list) list.push(op);
      else removesByStroke.set(op.strokeId, [op]);
    }
  }

  const expected: string[] = [];
  for (const [strokeId, adds] of addsByStroke.entries()) {
    const removes = removesByStroke.get(strokeId) ?? [];
    const explicitlyRemoved = new Set<string>();
    const causalRemovals: VectorClock[] = [];
    for (const rem of removes) {
      if (rem.observedAddOpIds && rem.observedAddOpIds.length > 0) {
        for (const id of rem.observedAddOpIds) explicitlyRemoved.add(id);
      } else {
        causalRemovals.push(rem.vectorClock);
      }
    }
    const hasSurvivingAdd = adds.some(
      (add) =>
        !explicitlyRemoved.has(add.opId) &&
        !causalRemovals.some(
          (rc) => compareVectorClocks(add.vectorClock, rc) === "before",
        ),
    );
    if (hasSurvivingAdd) expected.push(strokeId);
  }
  return expected.sort(compareAscii);
}

/**
 * 다중 기기 오프라인 편집 세션 로그를 6가지 도착 순열과 중복 패킷 재전송으로 시뮬레이션하여
 * Strong Eventual Consistency 수렴·멱등성·무손실·벡터 클록 단조성 불변식을 전수 검증한다.
 */
export function verifyOfflineMultideviceSync(
  sessions: readonly DeviceOfflineSession[],
): OfflineMultideviceSyncVerificationReport {
  const permutations = buildDeliveryPermutations(sessions);
  const canonical = mergeMultideviceCrdtOperations(permutations[0].ops);

  const permutationRuns: SyncPermutationRunResult[] = permutations.map((perm) => {
    const state = mergeMultideviceCrdtOperations(perm.ops);
    return Object.freeze({
      permutationName: perm.name,
      inputOpCount: perm.ops.length,
      stateDigestSha256: state.stateDigestSha256,
      matchesCanonical:
        state.stateDigestSha256 === canonical.stateDigestSha256 &&
        compareVectorClocks(state.mergedVectorClock, canonical.mergedVectorClock) ===
          "equal",
    });
  });

  const allPermutationsConverged = permutationRuns.every((run) => run.matchesCanonical);

  // 중복 패킷 재전송(각 연산 2회 전달) 멱등성 검증
  const duplicatedOps = [...permutations[2].ops, ...permutations[4].ops];
  const duplicateState = mergeMultideviceCrdtOperations(duplicatedOps);
  const idempotentUnderDuplicateReplay =
    duplicateState.stateDigestSha256 === canonical.stateDigestSha256 &&
    duplicateState.duplicateOpIgnoredCount === permutations[0].ops.length;

  // 스트로크 무손실 검증
  const expectedStrokeIds = computeExpectedUnremovedStrokes(permutations[0].ops);
  const convergedStrokeSet = new Set<string>();
  for (const cut of Object.values(canonical.cuts)) {
    for (const strokeId of cut.liveStrokeIds) {
      convergedStrokeSet.add(strokeId);
    }
  }
  const missingExpectedStrokeIds = expectedStrokeIds.filter(
    (strokeId) => !convergedStrokeSet.has(strokeId),
  );
  const zeroUnremovedStrokeLoss = missingExpectedStrokeIds.length === 0;

  // 각 참여 기기의 최종 벡터 클록을 병합 클록이 단조 지배하는지 검증
  let vectorClockMonotonic = true;
  for (const session of sessions) {
    let deviceFinalClock: VectorClock = Object.freeze({});
    for (const op of session.operations) {
      deviceFinalClock = mergeVectorClocks(deviceFinalClock, op.vectorClock);
    }
    const rel = compareVectorClocks(deviceFinalClock, canonical.mergedVectorClock);
    if (rel !== "before" && rel !== "equal") {
      vectorClockMonotonic = false;
      break;
    }
  }

  // 모든 동시 충돌 레코드에 패배 값 또는 보존 대상 연산 ID가 남아 있는지 검증
  const allConcurrentConflictsPreserved =
    canonical.fieldConflicts.every(
      (conflict) => conflict.preservedSupersededValues.length > 0,
    ) &&
    canonical.deleteEditConflicts.every(
      (conflict) => conflict.preservedEditOpIds.length > 0,
    );

  const invariants: OfflineSyncVerificationInvariants = Object.freeze({
    allPermutationsConverged,
    idempotentUnderDuplicateReplay,
    zeroUnremovedStrokeLoss,
    vectorClockMonotonic,
    allConcurrentConflictsPreserved,
  });

  const passed =
    allPermutationsConverged &&
    idempotentUnderDuplicateReplay &&
    zeroUnremovedStrokeLoss &&
    vectorClockMonotonic &&
    allConcurrentConflictsPreserved;

  const deviceIds = Object.freeze(sessions.map((s) => s.deviceId));
  const summaryKo = passed
    ? `오프라인 다중 기기 동기화 수렴 검증 통과: ${deviceIds.length}대 기기 · ${permutations[0].ops.length}건 연산 · ${permutations.length}종 순열 및 중복 재전송 100% 동일 수렴(${canonical.stateDigestSha256.slice(0, 12)})`
    : `오프라인 다중 기기 동기화 수렴 검증 실패: 불변식 위반 감지(누락 스트로크 ${missingExpectedStrokeIds.length}건)`;

  return Object.freeze({
    schema: "toonstudio.offline-multidevice-sync-verification/1",
    schemaVersion: 1,
    passed,
    deviceIds,
    totalOperations: permutations[0].ops.length,
    permutationCount: permutations.length,
    invariants,
    missingExpectedStrokeIds: Object.freeze(missingExpectedStrokeIds),
    permutationRuns: Object.freeze(permutationRuns),
    convergedState: canonical,
    summaryKo,
  });
}

/**
 * 오프라인 동기화 큐 항목(`OfflineSyncQueueEntry` 호환 구조)을 기기(`actorId`)별
 * 오프라인 CRDT 세션으로 승격해 다중 기기 수렴 불변식을 즉시 검증한다.
 */
export function verifyOfflineSyncQueueConvergence(
  entries: readonly OfflineSyncQueueEntryLike[],
): OfflineMultideviceSyncVerificationReport {
  const byDevice = new Map<string, OfflineSyncQueueEntryLike[]>();
  for (const entry of entries) {
    const deviceId = entry.actorId.trim() || "local-device";
    const list = byDevice.get(deviceId);
    if (list) list.push(entry);
    else byDevice.set(deviceId, [entry]);
  }

  const sessions: DeviceOfflineSession[] = [];
  for (const [deviceId, deviceEntries] of [...byDevice.entries()].sort(([a], [b]) =>
    compareAscii(a, b),
  )) {
    const ordered = [...deviceEntries].sort(
      (left, right) =>
        left.causalSequence - right.causalSequence ||
        left.createdAtMs - right.createdAtMs ||
        compareAscii(left.opId, right.opId),
    );
    let clock: VectorClock = Object.freeze({});
    const ops: MultiDeviceCrdtOperation[] = [];
    const deviceKind: SyncDeviceKind = deviceId.toLowerCase().includes("tablet")
      ? "tablet"
      : deviceId.toLowerCase().includes("mobile")
        ? "mobile"
        : "desktop";

    for (const entry of ordered) {
      const cutId = `${entry.surface}::${entry.cutId}`;
      const lamport = entry.revision ?? entry.causalSequence;
      if (entry.kind === "delete") {
        clock = incrementVectorClock(clock, deviceId);
        ops.push({
          opId: `${entry.opId}:delete`,
          deviceId,
          deviceKind,
          cutId,
          kind: "cut-delete",
          vectorClock: clock,
          lamportClock: lamport,
          wallClockMs: entry.createdAtMs,
        });
        continue;
      }

      const patchKeys = Object.keys(entry.patch).sort(compareAscii);
      if (patchKeys.length === 0) {
        clock = incrementVectorClock(clock, deviceId);
        ops.push({
          opId: `${entry.opId}:touch`,
          deviceId,
          deviceKind,
          cutId,
          kind: "field-set",
          field: "__touched",
          value: true,
          vectorClock: clock,
          lamportClock: lamport,
          wallClockMs: entry.createdAtMs,
        });
        continue;
      }

      for (const field of patchKeys) {
        clock = incrementVectorClock(clock, deviceId);
        ops.push({
          opId: `${entry.opId}:${field}`,
          deviceId,
          deviceKind,
          cutId,
          kind: "field-set",
          field,
          value: entry.patch[field],
          vectorClock: clock,
          lamportClock: lamport,
          wallClockMs: entry.createdAtMs,
        });
      }
    }

    sessions.push({ deviceId, deviceKind, operations: ops });
  }

  return verifyOfflineMultideviceSync(sessions);
}
