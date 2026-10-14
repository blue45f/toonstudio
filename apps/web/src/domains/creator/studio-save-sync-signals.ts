/**
 * Studio save-sync signals — 실제 오토세이브 런타임이 이미 소유한 신호를
 * 저장 상태 표시(StudioSaveStatusBar / StudioSaveSyncStatusCenter)가 읽는
 * 단일 스냅샷으로 어댑트한다.
 *
 * 왜 별도 저널을 만들지 않는가 (2026-10-13 연결 감사):
 * - 실제 내구 저널은 project-model JournalStore(SQLite/OPFS)가 소유하고,
 *   오토세이브는 StudioCuttoonEditorHost 의 effect 가 OPFS 세션/SQLite 포트로
 *   receipt 를 받으며 돈다. 여기에 인메모리 저널(useStudioSaveSyncStatus 초안)을
 *   또 굴리면 두 상태가 어긋나는 순간 표시가 거짓이 된다 — 특히 "저장됨" 거짓
 *   표시는 데이터 손실로 이어질 수 있어, 표시는 반드시 실제 receipt 에서만
 *   도출한다.
 * - 대신 이 모듈은 런타임이 이미 유지하는 권위 신호만 모은다:
 *   편집 세대(studioRevisionProjectGenerationRef — markStudioDocumentChanged
 *   게이트가 전진), 내구 세대(studioLifecycleDurableGenerationRef — receipt
 *   가 있을 때만 전진), 마지막 receipt(savedAt/authority/sequence/revision),
 *   마지막 실패, 내구 경로 가용성, 문서 리더십(leader/follower).
 *
 * 이 모듈은 순수하다: 신호를 "기록"하는 것은 런타임 연결 지점(호스트)의 몫이고,
 * 여기서는 기록 보관(subscribe/notify)과 상태 도출만 한다.
 * 구독 패턴은 studio-reliability-status-store 와 같은 관용구를 따른다.
 */

import type {
  StudioOperationJournalState,
  StudioSaveSyncStatus,
} from "./studio-operation-recovery-coordinator";

export type StudioSaveSyncDurability = "unknown" | "available" | "unavailable";
export type StudioSaveSyncLeadership = "unknown" | "leader" | "follower";

export interface StudioSaveSyncReceiptRecord {
  /** receipt.savedAt (ISO) 을 파싱한 ms. 파싱 불가 시 기록 시각으로 대체된다. */
  readonly savedAtMs: number;
  readonly authority: "opfs-journal" | "sqlite-fallback";
  readonly sequence: number | null;
  readonly revision: number | null;
  /** 이 receipt 가 내구화한 편집 세대. */
  readonly generation: number;
}

export interface StudioSaveSyncSignals {
  readonly documentId: string;
  /** markStudioDocumentChanged 게이트를 통과한 최신 편집 세대. */
  readonly editGeneration: number;
  /** receipt 로 확인된 최신 내구 세대. */
  readonly durableGeneration: number;
  readonly lastReceipt: StudioSaveSyncReceiptRecord | null;
  /** 마지막 내구 실패 시각(ms). 이후 receipt 가 오면 사실상 무효화된다. */
  readonly lastFailureAtMs: number | null;
  /** OPFS 세션 또는 SQLite 포트 중 하나라도 해결된 내구 경로가 있는가. */
  readonly durability: StudioSaveSyncDurability;
  /** follower 탭은 이 문서의 저장을 소유하지 않는다. */
  readonly leadership: StudioSaveSyncLeadership;
  readonly isOnline: boolean;
}

export const EMPTY_STUDIO_SAVE_SYNC_SIGNALS: StudioSaveSyncSignals = Object.freeze({
  documentId: "",
  editGeneration: 0,
  durableGeneration: 0,
  lastReceipt: null,
  lastFailureAtMs: null,
  durability: "unknown",
  leadership: "unknown",
  isOnline: true,
});

/**
 * 문서 단위 신호 보관소. 호스트(StudioCuttoonEditorHost)가 문서 수명 동안
 * 소유하고, 연결 지점에서 note* 를 호출한다. 모듈 레벨 싱글턴이 아닌 이유:
 * 문서 identity 회전(게스트 초안 승계·계정 전환) 때 이전 문서의 "저장됨"이
 * 새 문서로 새지 않게, 보관소는 문서와 함께 버려져야 한다.
 */
export interface StudioSaveSyncSignalStore {
  getSignals(): StudioSaveSyncSignals;
  subscribe(listener: () => void): () => void;
  /** 문서가 바뀌면 전체를 초기화한다. */
  reset(documentId: string): void;
  /** 편집 세대 전진 (markStudioDocumentChanged 성공 직후). */
  noteEditGeneration(generation: number): void;
  /**
   * 하이드레이션 베이스라인 동기화 — 호스트가 내구 세대를 편집 세대에 맞추는
   * 바로 그 지점에서만 호출한다. receipt 를 만들지 않으므로 lastReceipt 와
   * 실패 기록은 건드리지 않는다.
   */
  noteBaseline(generation: number): void;
  /**
   * receipt 없는 내구 전진 (빈 문서 tombstone clear 성공 등) — 내구 세대만
   * 올리고 receipt 는 위조하지 않는다. "저장됨" 시각은 실제 receipt 가
   * 있을 때만 갱신된다.
   */
  noteDurableGeneration(generation: number): void;
  /** 내구 receipt 수신 (오토세이브 성공 직후에만). */
  noteDurableReceipt(receipt: StudioSaveSyncReceiptRecord): void;
  /** 내구 실패 (DocumentBusy 는 실패가 아니므로 호출 측에서 제외할 것). */
  noteFailure(atMs: number): void;
  noteDurability(durability: StudioSaveSyncDurability): void;
  noteLeadership(leadership: StudioSaveSyncLeadership): void;
  noteOnline(isOnline: boolean): void;
}

export function createStudioSaveSyncSignalStore(): StudioSaveSyncSignalStore {
  let signals: StudioSaveSyncSignals = EMPTY_STUDIO_SAVE_SYNC_SIGNALS;
  const listeners = new Set<() => void>();
  const update = (patch: Partial<StudioSaveSyncSignals>): void => {
    signals = Object.freeze({ ...signals, ...patch });
    for (const listener of listeners) listener();
  };
  return {
    getSignals: () => signals,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset(documentId) {
      signals = Object.freeze({ ...EMPTY_STUDIO_SAVE_SYNC_SIGNALS, documentId });
      for (const listener of listeners) listener();
    },
    noteEditGeneration(generation) {
      if (generation <= signals.editGeneration) return;
      update({ editGeneration: generation });
    },
    noteDurableReceipt(receipt) {
      update({
        lastReceipt: receipt,
        durableGeneration: Math.max(signals.durableGeneration, receipt.generation),
        // receipt.generation 은 실제로 내구화된 편집 세대 그 자체이므로,
        // 게이트를 거치지 않은 전진(CRDT 조정 등)도 여기서 편집 세대에 반영된다.
        editGeneration: Math.max(signals.editGeneration, receipt.generation),
      });
    },
    noteBaseline(generation) {
      if (generation <= signals.durableGeneration && generation <= signals.editGeneration) return;
      update({
        editGeneration: Math.max(signals.editGeneration, generation),
        durableGeneration: Math.max(signals.durableGeneration, generation),
      });
    },
    noteDurableGeneration(generation) {
      if (generation <= signals.durableGeneration) return;
      update({ durableGeneration: generation });
    },
    noteFailure(atMs) {
      update({ lastFailureAtMs: atMs });
    },
    noteDurability(durability) {
      if (durability !== signals.durability) update({ durability });
    },
    noteLeadership(leadership) {
      if (leadership !== signals.leadership) update({ leadership });
    },
    noteOnline(isOnline) {
      if (isOnline !== signals.isOnline) update({ isOnline });
    },
  };
}

/**
 * 신호 → 표시 상태 도출. 거짓 "저장됨" 금지 원칙:
 * - receipt 가 한 번도 없으면 saved 로 보이지 않는다(pending 취급).
 * - 실패가 마지막 receipt 보다 최신이면 failed 가 이긴다.
 * - 내구 경로가 없다고 확정된 경우에만 localDurable=false. 미확정(unknown)은
 *   부팅 직후 수백 ms 구간이라 failed 로 깜빡이지 않게 durable 로 두되,
 *   receipt 가 없으므로 어차피 saved 가 아닌 pending 으로 읽힌다.
 *
 * 주의 — pendingOperationsCount 는 "체크포인트 이후 op 수"가 아니라
 * "아직 내구화되지 않은 편집 세대 수"의 근사다. 세대 하나가 여러 op 를
 * 포함할 수 있어 실제 변경 건수와 다를 수 있다. 건수를 단정하는 카피와
 * 함께 쓰지 말 것 (REPORT.md §4 참조).
 */
export function resolveSaveSyncStatusFromSignals(
  signals: StudioSaveSyncSignals,
): StudioSaveSyncStatus {
  const pending = Math.max(0, signals.editGeneration - signals.durableGeneration);
  const receipt = signals.lastReceipt;
  const failed =
    signals.lastFailureAtMs !== null &&
    (receipt === null || signals.lastFailureAtMs > receipt.savedAtMs);

  let cloudSyncStatus: "synced" | "pending" | "offline" = "synced";
  if (!signals.isOnline) cloudSyncStatus = "offline";
  else if (pending > 0) cloudSyncStatus = "pending";
  // receipt 가 없고 pending 도 없으면 "저장할 게 없는" 상태다 — 새 문서의
  // 초기 상태가 영원히 "보존 중"으로 읽히지 않게 pending 으로 올리지 않는다.
  // (하이드레이션 직후에는 호스트의 베이스라인 effect 가 내구 세대를 편집
  // 세대와 같게 맞추므로, 이 상태는 곧 실제와 일치한다.)

  const lastSavedAt = receipt?.savedAtMs ?? 0;
  const lastCheckpointAt = lastSavedAt;

  let summaryText = "모든 작업이 로컬에 안전하게 저장되었습니다.";
  if (signals.leadership === "follower") {
    summaryText = "다른 탭에서 편집 중인 문서입니다. 이 탭의 변경은 저장되지 않습니다.";
  } else if (failed) {
    summaryText = "임시저장에 실패했습니다. 작업은 메모리에 남아 있지만 내구 저장되지 않았습니다.";
  } else if (receipt === null) {
    summaryText = "아직 이 기기에 저장된 기록이 없습니다.";
  } else if (pending > 0) {
    summaryText = "최근 변경이 아직 이 기기에 내구 저장되지 않았습니다.";
  }
  if (!signals.isOnline) summaryText += " (오프라인 모드)";

  return Object.freeze({
    documentId: signals.documentId,
    localDurable: signals.durability !== "unavailable" && !failed,
    pendingOperationsCount: pending,
    lastSavedAt,
    lastCheckpointAt,
    cloudSyncStatus,
    summaryText,
  });
}

/**
 * StudioSaveSyncStatusCenter 가 요구하는 저널 형태의 "표시용 스냅샷".
 *
 * 실제 저널(project-model JournalStore)의 대체물이 아니다 — 센터의 상세
 * 다이얼로그가 읽는 필드(documentId, lastSequence, lastCheckpoint)만
 * 실제 receipt 에서 채우고, operations 는 비워 둔다. 센터의 진단 복사가
 * 이 빈 operations 를 실제 op 이력처럼 보여주지 않도록, 센터에는
 * status 를 직접 전달하는 편집(선택적 status prop)을 함께 적용한다
 * (편집본 StudioSaveSyncStatusCenter.tsx 참조). 그 경우 센터는 상태를
 * 이 저널로 재계산하지 않고, 저널은 식별자·시퀀스 표시용으로만 쓴다.
 */
export function saveSyncJournalSnapshotFromSignals(
  signals: StudioSaveSyncSignals,
): StudioOperationJournalState {
  const receipt = signals.lastReceipt;
  return Object.freeze({
    documentId: signals.documentId,
    lastSequence: signals.editGeneration,
    operations: Object.freeze([]),
    lastCheckpoint: receipt
      ? Object.freeze({
          checkpointId: `receipt-${receipt.authority}-${receipt.revision ?? receipt.sequence ?? receipt.generation}`,
          documentId: signals.documentId,
          sequence: receipt.generation,
          timestamp: receipt.savedAtMs,
          snapshotData: null,
        })
      : null,
    maxBufferedOps: 500,
  });
}
