/**
 * 단계 합의 게이트 — 서버 레코드와 1차 클라이언트 모델 사이의 동기화 어댑터.
 *
 * 서버 계약(StageConsensusGateRecord)은 클라이언트 모델(StageConsensusGate)과
 * 1:1로 설계됐다. 이 어댑터는 그 사이의 변환과 다기기 병합만 맡는다:
 * - 변환: 레코드에서 동기화 메타(projectId·revision)를 떼면 모델과 같다.
 *   리드가 아직 지정되지 않은 게이트(leadReviewerId=null)는 모델이 표현할
 *   수 없으므로 변환하지 않고 미지정으로 분리한다(패널 빈 상태가 맡는다).
 * - 병합: 게이트마다 revision이 큰 쪽이 이긴다. 동률인데 내용이 다르면
 *   서버가 이기고, 그 사실을 conflict로 돌려줘 화면이 "다른 기기에서
 *   바뀐 내용으로 맞췄다"고 알릴 수 있게 한다(조용히 덮지 않는다).
 */
import type {
  StageConsensusGateRecord, StageGateBundle,
} from "@toonstudio/contracts/production-stage-gate";

import type { StageConsensusGate } from "./stage-consensus-gate-model";

export interface StageGateLocalSnapshot {
  readonly gate: StageConsensusGate;
  /** 이 게이트를 마지막으로 맞춘 서버 revision. 로컬 전용 게이트는 0. */
  readonly revision: number;
}

export interface StageGateSyncConflict {
  readonly gateId: string;
  readonly localRevision: number;
  readonly remoteRevision: number;
}

export interface StageGateMergeResult {
  readonly snapshots: readonly StageGateLocalSnapshot[];
  /** 서버에 있지만 리드가 미지정이라 모델로 변환하지 않은 게이트 ID. */
  readonly unassignedGateIds: readonly string[];
  readonly conflicts: readonly StageGateSyncConflict[];
}

/** 서버 레코드 → 클라이언트 모델. 리드 미지정이면 null. */
export function stageGateRecordToClientGate(record: StageConsensusGateRecord): StageConsensusGate | null {
  if (record.leadReviewerId === null) return null;
  return {
    id: record.id,
    episodeId: record.episodeId,
    stageId: record.stageId,
    leadReviewerId: record.leadReviewerId,
    leadReviewerName: record.leadReviewerName,
    rounds: record.rounds,
  };
}

/** 내용 동등성 판단용 지문 — 필드 순서에 흔들리지 않게 정규화해 해시한다. */
export function stageGateDigest(gate: StageConsensusGate): string {
  const canonical = JSON.stringify(gate, (_key, value: unknown) => {
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return value;
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

/**
 * 로컬 스냅샷들과 서버 번들을 병합한다.
 * - 서버에만 있는 게이트는 새로 받아들인다.
 * - 로컬에만 있는 게이트(아직 서버에 커맨드를 보내지 않은 로컬 전용)는
 *   그대로 둔다 — 서버에 없다고 지우지 않는다.
 * - 양쪽에 있으면 revision이 큰 쪽, 동률이면 서버 쪽이 이긴다.
 */
export function mergeStageGateBundle(
  local: readonly StageGateLocalSnapshot[],
  bundle: StageGateBundle,
): StageGateMergeResult {
  const conflicts: StageGateSyncConflict[] = [];
  const unassignedGateIds: string[] = [];
  const byId = new Map<string, StageGateLocalSnapshot>();
  for (const snapshot of local) byId.set(snapshot.gate.id, snapshot);
  for (const record of bundle.gates) {
    const remote = stageGateRecordToClientGate(record);
    if (!remote) {
      unassignedGateIds.push(record.id);
      continue;
    }
    const existing = byId.get(record.id);
    if (!existing || record.revision > existing.revision) {
      byId.set(record.id, { gate: remote, revision: record.revision });
      continue;
    }
    if (record.revision === existing.revision && stageGateDigest(existing.gate) !== stageGateDigest(remote)) {
      conflicts.push({ gateId: record.id, localRevision: existing.revision, remoteRevision: record.revision });
      byId.set(record.id, { gate: remote, revision: record.revision });
    }
  }
  return { snapshots: [...byId.values()], unassignedGateIds, conflicts };
}

/** 병합 결과를 1차 모델 입력(게이트 목록)으로 되돌린다. */
export function mergedStageGates(result: StageGateMergeResult): readonly StageConsensusGate[] {
  return result.snapshots.map((snapshot) => snapshot.gate);
}
