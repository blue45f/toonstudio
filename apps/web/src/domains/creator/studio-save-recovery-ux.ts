/**
 * Save recovery UX view model — 장애·오프라인 복구 UX (누락 신규 G2).
 *
 * 왜 이 모델이 필요한가 (2026-10-14 실측):
 * - 저장 표시는 실제 오토세이브 신호(studio-save-sync-signals)에서 도출되고,
 *   연결 상태는 별도 모듈(offline/studio-connectivity)이 4모드
 *   (online / reconnecting / server-unavailable / offline)로 소유한다.
 *   그런데 저장 표면(StudioSaveStatusBar · StudioSaveSyncStatusCenter)은
 *   연결 모듈을 전혀 읽지 않아, 브라우저는 온라인인데 서버만 죽은
 *   "server-unavailable"와 "reconnecting"이 사용자에게 닿지 않았다 —
 *   서버 장애 중에도 화면은 "저장됨"으로 읽힐 수 있었다.
 * - 이 모델은 두 신호를 하나의 표시 상태로 합치는 순수 함수다. 우선순위는
 *   "가장 위험하고 행동이 필요한 상태가 이긴다":
 *   readonly(다른 탭 편집) > failed(로컬 내구 실패) > offline(연결 끊김)
 *   > reconnecting(재확인 중) > server-unavailable(서버 도달 불가)
 *   > saving > saved.
 * - 거짓 안심 금지: 서버에 닿지 못하면 saved 로 보이지 않는다. 단 로컬
 *   내구가 살아 있으면 실패(failed)가 아니라 "이 기기에 저장됨" 계열로
 *   구분한다 — 오프라인·서버 장애는 데이터 손실이 아니다.
 */

import type { StudioConnectivitySnapshot } from "./offline/studio-connectivity";
import type { StudioSaveSyncStatus } from "./studio-operation-recovery-coordinator";

export type SaveRecoveryKind =
  | "readonly"
  | "failed"
  | "offline"
  | "reconnecting"
  | "server-unavailable"
  | "saving"
  | "saved";

export interface SaveRecoveryView {
  readonly kind: SaveRecoveryKind;
  /** 연결 문제(오프라인 또는 서버 도달 불가) — 재확인 동선을 열 조건. */
  readonly connectionProblem: boolean;
  /** 로컬 내구 실패 — 저장 재시도 동선을 열 조건. */
  readonly canRetrySave: boolean;
  /** 연결 재확인을 지금 실행할 수 있는가 (확인 중이면 중복 실행 금지). */
  readonly canRecheckConnection: boolean;
  /** 서버 연결 확인이 진행 중인가. */
  readonly checkingConnection: boolean;
}

export interface SaveRecoveryOptions {
  /** follower 탭 — 이 탭의 변경은 저장되지 않는다. */
  readonly readOnlyTab?: boolean;
}

/**
 * 저장 상태 + 연결 스냅샷 → 복구 UX 표시 상태.
 * connectivity 가 null 이면(연결 모듈을 붙이지 않은 표면) 기존 저장 상태
 * 만으로 도출한다 — 구 동작과 같은 종류 집합(saved/saving/offline/failed/
 * readonly)만 나온다.
 */
export function resolveSaveRecoveryView(
  status: StudioSaveSyncStatus,
  connectivity: StudioConnectivitySnapshot | null,
  options: SaveRecoveryOptions = {},
): SaveRecoveryView {
  const checkingConnection = connectivity?.checking ?? false;
  const connectionProblem =
    connectivity !== null
      ? connectivity.mode === "offline" || connectivity.mode === "server-unavailable"
      : status.cloudSyncStatus === "offline";
  const canRecheckConnection = connectionProblem && !checkingConnection;

  if (options.readOnlyTab) {
    return Object.freeze({
      kind: "readonly",
      connectionProblem,
      canRetrySave: false,
      canRecheckConnection,
      checkingConnection,
    });
  }
  if (!status.localDurable) {
    return Object.freeze({
      kind: "failed",
      connectionProblem,
      canRetrySave: true,
      canRecheckConnection,
      checkingConnection,
    });
  }
  if (connectivity !== null) {
    if (connectivity.mode === "offline") {
      return Object.freeze({
        kind: "offline",
        connectionProblem: true,
        canRetrySave: false,
        canRecheckConnection: true,
        checkingConnection,
      });
    }
    if (connectivity.mode === "reconnecting") {
      return Object.freeze({
        kind: "reconnecting",
        connectionProblem: false,
        canRetrySave: false,
        canRecheckConnection: false,
        checkingConnection: true,
      });
    }
    if (connectivity.mode === "server-unavailable") {
      return Object.freeze({
        kind: "server-unavailable",
        connectionProblem: true,
        canRetrySave: false,
        canRecheckConnection: !checkingConnection,
        checkingConnection,
      });
    }
  } else if (status.cloudSyncStatus === "offline") {
    return Object.freeze({
      kind: "offline",
      connectionProblem: true,
      canRetrySave: false,
      canRecheckConnection: false,
      checkingConnection,
    });
  }
  if (status.pendingOperationsCount > 0) {
    return Object.freeze({
      kind: "saving",
      connectionProblem,
      canRetrySave: false,
      canRecheckConnection,
      checkingConnection,
    });
  }
  return Object.freeze({
    kind: "saved",
    connectionProblem,
    canRetrySave: false,
    canRecheckConnection,
    checkingConnection,
  });
}

export type SaveRecoveryAnnouncement =
  | "none"
  | "saved"
  | "failed"
  | "connection-lost"
  | "recovered";

/**
 * 라이브 영역 알림 판정. 전이만 알리는 기존 규칙(저장 중 침묵)을 유지하며
 * 연결 상실·복구를 추가한다:
 * - failed 진입 → "failed" (위험, 즉시 알림)
 * - offline / server-unavailable 진입 → "connection-lost"
 * - 연결 문제였다가 saved 로 복귀 → "recovered" (일반 저장 완료와 구분)
 * - saving → saved → "saved"
 * 그 외 전이(저장 중 진입, readonly 등)는 침묵한다.
 */
export function saveRecoveryAnnouncement(
  previous: SaveRecoveryKind,
  next: SaveRecoveryKind,
): SaveRecoveryAnnouncement {
  if (previous === next) return "none";
  if (next === "failed") return "failed";
  if (next === "offline" || next === "server-unavailable") return "connection-lost";
  if (next === "saved") {
    return previous === "offline" ||
      previous === "server-unavailable" ||
      previous === "reconnecting"
      ? "recovered"
      : "saved";
  }
  return "none";
}
