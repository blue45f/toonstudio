/**
 * Studio save status: plain-language safety first, implementation diagnostics on demand.
 *
 * 장애·오프라인 복구 UX (누락 신규 G2, 2026-10-14):
 * - 연결 스냅샷이 있으면 서버 장애·재확인 중을 필과 서버 섹션에 드러내고
 *   (studio-save-recovery-ux 모델), 다이얼로그 안에서 저장 재시도와
 *   연결 재확인을 바로 실행할 수 있게 한다 — 상태만 보여주고 동선이
 *   없던 기존 구조의 해소.
 * - 복구 지점이 한 번도 만들어진 적 없으면(lastCheckpointAt=0) 1970년
 *   시각을 보여주지 않고 "아직 없음"으로 표시한다.
 */

import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { r4CreatorStatusText } from "./r4-cat1-status-i18n";
import {
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  Database,
  HardDrive,
  RefreshCw,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";

import { resolveSaveRecoveryView } from "./studio-save-recovery-ux";
import {
  formatRecoveryDiagnostics,
  resolveSaveSyncStatus,
  type StudioOperationJournalState,
  type StudioSaveSyncStatus,
} from "./studio-operation-recovery-coordinator";
import { useStudioCopyFeedback } from "./use-studio-copy-feedback";

import type { StudioConnectivitySnapshot } from "./offline/studio-connectivity";

export interface StudioSaveSyncStatusCenterProps {
  readonly journal: StudioOperationJournalState;
  readonly isOnline?: boolean;
  readonly isOpfsActive?: boolean;
  readonly onForceCheckpoint?: () => void;
  /**
   * 실제 오토세이브 런타임 신호에서 도출한 상태를 직접 전달한다
   * (studio-save-sync-signals 의 어댑터). 있으면 journal 로 상태를 재계산하지
   * 않는다 — journal 은 식별자·시퀀스·진단 표시용으로만 쓰인다. 실제 내구
   * 저널은 project-model JournalStore 가 소유하므로, 이 컴포넌트의 인메모리
   * 저널 모델로 실물 상태를 재계산하면 이중 상태가 된다.
   */
  readonly statusOverride?: StudioSaveSyncStatus;
  /**
   * 연결 모듈의 스냅샷. 있으면 서버 장애·재확인 중 상태를 필·서버 섹션에
   * 반영한다 (studio-save-recovery-ux 모델). 없으면 기존 저장 상태만 쓴다.
   */
  readonly connectivity?: StudioConnectivitySnapshot | null;
  /** 로컬 내구 실패 시 저장을 다시 시도하는 콜백. 없으면 재시도 버튼을 숨긴다. */
  readonly onRetrySave?: () => void;
  /** 연결 문제 시 즉시 재검사를 실행하는 콜백. 없으면 재확인 버튼을 숨긴다. */
  readonly onRecheckConnection?: () => void;
}

function cloudStatusCopy(
  status: "synced" | "pending" | "offline",
  connectivity: StudioConnectivitySnapshot | null,
): string {
  if (connectivity?.mode === "server-unavailable") {
    return r3c07StatusText("studio.panelStatus.r3c07.saveSync.serverUnavailable", "서버에 연결할 수 없어요. 작업은 이 기기에 보관 중이고, 연결이 돌아오면 자동으로 동기화해요.");
  }
  if (connectivity?.mode === "reconnecting") {
    return "서버 연결을 다시 확인하고 있어요.";
  }
  if (status === "synced") return "최신 상태로 저장됐어요.";
  if (status === "pending") return "최근 변경을 이 기기에 보관했고 서버 동기화를 기다리고 있어요.";
  return "인터넷이 연결되면 서버와 다시 동기화할 수 있어요.";
}

export function StudioSaveSyncStatusCenter({
  journal,
  isOnline = true,
  isOpfsActive = true,
  onForceCheckpoint,
  statusOverride,
  connectivity = null,
  onRetrySave,
  onRecheckConnection,
}: StudioSaveSyncStatusCenterProps) {
  const [open, setOpen] = useState(false);
  const diagnosticsCopy = useStudioCopyFeedback(2000);
  const diagnosticsCopyStatus = diagnosticsCopy.statusFor("save-sync-diagnostics");

  const status = statusOverride ?? resolveSaveSyncStatus(journal, isOnline, isOpfsActive);
  const view = resolveSaveRecoveryView(status, connectivity);
  // 필 라벨은 복구 모델(view.kind)을 정본으로 삼는다 (C6, 2026-10-22):
  // 연결 모듈이 offline인데 저장 신호의 cloudSyncStatus가 아직 synced인
  // 구간에서 예전 분기는 "저장됨"으로 떨어지는 거짓 안심이 있었다 — 바와
  // 같은 판정을 쓰도록 offline 분기를 view.kind 기준으로 옮겼다.
  const saveLabel = !status.localDurable
    ? "저장 확인 필요"
    : view.kind === "server-unavailable"
      ? "서버 연결 안 됨 · 이 기기에 보관 중"
      : view.kind === "reconnecting"
        ? r3c07StatusText("studio.panelStatus.r3c07.saveSync.reconnecting", "연결 다시 확인 중")
        : view.kind === "offline" || status.cloudSyncStatus === "offline"
          ? "오프라인 · 이 기기에 보관 중"
          : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
            ? `${status.pendingOperationsCount}개 변경 보존 중`
            : "저장됨";

  const handleCopyDiagnostics = () => {
    const report = formatRecoveryDiagnostics(journal, status);
    diagnosticsCopy.copy("save-sync-diagnostics", report);
  };

  const StatusIcon = !status.localDurable
    ? TriangleAlert
    : view.kind === "offline" || status.cloudSyncStatus === "offline" || view.kind === "server-unavailable"
      ? CloudOff
      : view.kind === "reconnecting"
        ? RefreshCw
        : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
          ? Clock
          : CheckCircle2;

  const statusTone = !status.localDurable
    ? "text-danger"
    : view.kind === "offline" || status.cloudSyncStatus === "offline" || view.kind === "server-unavailable"
      ? "text-warning"
      : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
        ? "text-accent"
        : "text-success";

  return (
    <div data-studio-save-sync-status-center className="relative inline-block text-xs">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`저장 상태 열기: ${saveLabel}`}
        className="flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.75rem] font-medium text-fg shadow-sm backdrop-blur transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
      >
        <StatusIcon
          className={`size-3.5 ${statusTone} ${view.kind === "reconnecting" ? "animate-spin" : ""}`}
          aria-hidden
        />
        <span>{saveLabel}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="저장 상태 상세"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-line bg-card p-3.5 text-fg shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-line/50 pb-2">
            <div>
              <p className="font-semibold text-fg">저장 상태</p>
              <p className="mt-0.5 text-[0.72rem] text-fg-3">
                내 작업이 어디까지 안전하게 보관됐는지 확인해요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="저장 상태 닫기"
              className="grid min-h-8 min-w-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-[0.75rem]">
            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                <HardDrive className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">이 기기</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {status.localDurable
                      ? "최근 작업을 이 기기에 안전하게 보관하고 있어요."
                      : "이 기기에 복구 가능한 작업을 남기지 못하고 있어요. 이 화면을 닫기 전에 프로젝트를 내보내 주세요."}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                {status.cloudSyncStatus === "offline" ? (
                  <CloudOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                ) : (
                  <Cloud className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                )}
                <div>
                  <p className="font-semibold text-fg">서버</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {cloudStatusCopy(status.cloudSyncStatus, connectivity)}
                    {status.pendingOperationsCount > 0
                      ? ` 서버에 아직 반영되지 않은 변경 ${status.pendingOperationsCount}개가 있어요.`
                      : ""}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">복구</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {status.lastCheckpointAt > 0
                      ? `마지막 복구 지점은 ${new Date(status.lastCheckpointAt).toLocaleTimeString()}에 만들어졌어요.`
                      : r3c07StatusText("studio.panelStatus.r3c07.saveSync.checkpointsEmpty", "아직 만들어진 복구 지점이 없어요. 아래에서 지금 만들 수 있어요.")}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line/50 pt-3">
            {view.canRetrySave && onRetrySave ? (
              <button
                type="button"
                onClick={onRetrySave}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-danger/40 bg-raised px-2.5 text-[0.72rem] font-semibold text-danger hover:bg-danger/10 pointer-coarse:min-h-11"
              >
                <RotateCcw className="size-3.5" aria-hidden />
                <span>{r4CreatorStatusText("r4cat1.creator.saveSync.retryNow", "지금 다시 시도")}</span>
              </button>
            ) : null}
            {view.canRecheckConnection && onRecheckConnection ? (
              <button
                type="button"
                onClick={onRecheckConnection}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-[0.72rem] font-semibold text-fg-2 hover:bg-accent-soft hover:text-accent pointer-coarse:min-h-11"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                <span>연결 다시 확인</span>
              </button>
            ) : null}
            {onForceCheckpoint ? (
              <button
                type="button"
                onClick={onForceCheckpoint}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-[0.72rem] font-semibold text-fg-2 hover:bg-accent-soft hover:text-accent pointer-coarse:min-h-11"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                <span>복구 지점 만들기</span>
              </button>
            ) : null}
          </div>

          <details className="mt-3 rounded-lg border border-line bg-panel/35">
            <summary className="cursor-pointer px-2.5 py-2 text-[0.72rem] font-semibold text-fg-2">
              고급 진단 보기
            </summary>
            <div className="space-y-2 border-t border-line/60 px-2.5 py-2 text-[0.68rem] text-fg-3">
              <p className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <Database className="size-3.5" aria-hidden />
                  로컬 저장 방식
                </span>
                <span>{status.localDurable ? "OPFS" : "메모리 전용"}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>최근 작업 번호</span>
                <span className="font-mono">#{journal.lastSequence}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>복구 지점 이후 변경</span>
                <span>{status.pendingOperationsCount}개</span>
              </p>
              <button
                type="button"
                onClick={handleCopyDiagnostics}
                className="mt-1 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 font-semibold text-fg-2 hover:bg-raised pointer-coarse:min-h-11"
              >
                <Copy className="size-3.5" aria-hidden />
                <span aria-live="polite">
                  {diagnosticsCopyStatus === "copied"
                    ? "진단 정보를 복사했어요"
                    : diagnosticsCopyStatus === "failed"
                      ? r3c07StatusText("studio.panelStatus.r3c07.saveSync.diagnosticsCopyFailed", "진단 정보를 복사하지 못했어요")
                      : "진단 정보 복사"}
                </span>
              </button>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
