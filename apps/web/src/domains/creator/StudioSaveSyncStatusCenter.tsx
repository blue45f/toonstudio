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
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { registerEditorStatusSlot, registerModalStatusSlot } from "@/shared/lib/modal-status-slot";
import { STUDIO_MENUBAR_STATUS_SLOT_REFS } from "./studio-shell/studio-menubar-status-slot";

import { resolveSaveRecoveryView } from "./studio-save-recovery-ux";
import {
  formatRecoveryDiagnostics,
  resolveSaveSyncStatus,
  type StudioOperationJournalState,
  type StudioSaveSyncStatus,
} from "./studio-operation-recovery-coordinator";
import { useStudioCopyFeedback } from "./use-studio-copy-feedback";

import type { StudioConnectivitySnapshot } from "./offline/studio-connectivity";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("StudioSaveSyncStatusCenter", ko, en);

export interface StudioSaveSyncStatusCenterProps {
  readonly journal: StudioOperationJournalState;
  readonly presentation?: "default" | "drawing";
  readonly readOnlyTab?: boolean;
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
    return bi("서버에 연결할 수 없어요. 서버 저장은 확인되지 않았어요.", "The server is unreachable. A server save has not been confirmed.");
  }
  if (connectivity?.mode === "reconnecting") {
    return bi("서버 연결을 다시 확인하고 있어요. 서버 저장은 아직 확인되지 않았어요.", "Checking the server connection. A server save has not been confirmed yet.");
  }
  if (connectivity?.mode === "offline" || status === "offline") {
    return bi("오프라인 상태예요. 서버 저장은 확인되지 않았어요.", "You are offline. A server save has not been confirmed.");
  }
  // synced는 로컬 편집 세대와 온라인 여부에서 나온 값이며 서버 receipt가 아니다.
  return bi("이 화면에서는 서버 저장 여부를 확인할 수 없어요.", "This view cannot confirm whether your work is saved on the server.");
}

export function StudioSaveSyncStatusCenter({
  journal,
  presentation = "default",
  readOnlyTab = false,
  isOnline = true,
  isOpfsActive = true,
  onForceCheckpoint,
  statusOverride,
  connectivity = null,
  onRetrySave,
  onRecheckConnection,
}: StudioSaveSyncStatusCenterProps) {
  useBilingualI18nRevision();
  const [open, setOpen] = useState(false);
  const drawing = presentation === "drawing";
  const dialogRef = useRef<HTMLDialogElement>(null), closeRequested = useRef(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const noticeSummaryId = useId();
  const [noticeElement, setNoticeElement] = useState<HTMLDivElement | null>(null);
  const [noticeSummary, setNoticeSummary] = useState<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const peakPendingRef = useRef(0);
  const diagnosticsCopy = useStudioCopyFeedback(2000);
  const diagnosticsCopyStatus = diagnosticsCopy.statusFor("save-sync-diagnostics");

  const status = statusOverride ?? resolveSaveSyncStatus(journal, isOnline, isOpfsActive);
  const hasLocalReceipt = statusOverride ? status.lastSavedAt > 0 : journal.lastCheckpoint !== null;
  if (status.pendingOperationsCount > 0) {
    peakPendingRef.current = Math.max(peakPendingRef.current, status.pendingOperationsCount);
  } else {
    peakPendingRef.current = 0;
  }
  const peakPendingCount = Math.max(peakPendingRef.current, status.pendingOperationsCount);
  const drainedPendingCount = Math.max(0, peakPendingCount - status.pendingOperationsCount);

  useEffect(() => noticeElement && noticeSummary
    ? registerEditorStatusSlot(noticeElement, noticeSummary)
    : undefined, [noticeElement, noticeSummary]);

  const closeAndRestoreFocus = useCallback(() => {
    if (drawing && closeRequested.current) return;
    closeRequested.current = true;
    const node = dialogRef.current;
    if (node?.open) { if (typeof node.close === "function") node.close(); else node.removeAttribute("open"); }
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }, [drawing]);
  useEffect(() => {
    const node = dialogRef.current;
    if (!drawing || !node) return;
    if (open) {
      closeRequested.current = false; node.returnValue = "";
      if (!node.open) { if (typeof node.showModal === "function") { node.showModal(); node.setAttribute("aria-modal", "true"); } else { node.setAttribute("open", ""); node.setAttribute("aria-modal", "false"); } }
      closeButtonRef.current?.focus({ preventScroll: true });
    } else if (node.open) { if (typeof node.close === "function") node.close(); else node.removeAttribute("open"); }
  }, [drawing, open]);
  useEffect(() => drawing && open && noticeElement ? registerModalStatusSlot(noticeElement) : undefined, [drawing, open, noticeElement]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation();
      closeAndRestoreFocus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && (containerRef.current?.contains(target) || dialogRef.current?.contains(target))) return;
      setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open, closeAndRestoreFocus]);

  const view = resolveSaveRecoveryView(status, connectivity);
  // 필 라벨은 복구 모델(view.kind)을 정본으로 삼는다 (C6, 2026-10-22):
  // 연결 모듈이 offline인데 저장 신호의 cloudSyncStatus가 아직 synced인
  // 구간에서 예전 분기는 "저장됨"으로 떨어지는 거짓 안심이 있었다 — 바와
  // 같은 판정을 쓰도록 offline 분기를 view.kind 기준으로 옮겼다.
  const localSaveLabel = status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
    ? bi("이 기기에 저장 중", "Saving on this device")
    : hasLocalReceipt
      ? bi("이 기기에 저장됨", "Saved on this device")
      : bi("아직 저장 기록 없음", "No save recorded yet");
  const saveLabel = !status.localDurable
    ? "저장 확인 필요"
    : view.kind === "server-unavailable"
      ? `${bi("서버 연결 안 됨", "Server unreachable")} · ${localSaveLabel}`
      : view.kind === "reconnecting"
        ? r3c07StatusText("studio.panelStatus.r3c07.saveSync.reconnecting", "연결 다시 확인 중")
        : view.kind === "offline" || status.cloudSyncStatus === "offline"
          ? `${bi("오프라인", "Offline")} · ${localSaveLabel}`
          : localSaveLabel;

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

  const recordedCandidate = status.lastSavedAt > 0 && Number.isFinite(status.lastSavedAt) ? new Date(status.lastSavedAt) : null;
  const recorded = recordedCandidate && Number.isFinite(recordedCandidate.getTime()) ? recordedCandidate : null;
  const recordedTime = recorded ? new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }).format(recorded) : "";
  const drawingState = readOnlyTab ? "readonly" : !status.localDurable ? "failed"
    : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending" ? "pending" : recorded ? "saved" : "empty";
  const drawingLabel = drawingState === "readonly" ? bi("다른 탭이 기기 저장 담당", "Another tab saves on this device")
    : drawingState === "failed" ? bi("저장 확인 필요", "Check the save")
      : drawingState === "pending" ? bi("이 기기에 저장 중", "Saving on this device")
        : drawingState === "saved" ? bi("이 기기", "This device") : bi("아직 저장 전", "Not saved yet");
  const drawingName = `${drawingLabel}${drawingState === "saved" ? ` · ${recordedTime}` : ""}`;
  const SummaryIcon = drawing ? drawingState === "failed" ? TriangleAlert : drawingState === "pending" ? Clock : drawingState === "saved" ? CheckCircle2 : CloudOff : StatusIcon;
  const deviceInfo = (
            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                <HardDrive className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg">이 기기</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {!status.localDurable
                      ? "이 기기에 복구 가능한 작업을 남기지 못하고 있어요. 이 화면을 닫기 전에 프로젝트를 내보내 주세요."
                      : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
                        ? bi("최근 변경을 이 기기에 저장하고 있어요. 저장 완료를 확인한 뒤 화면을 닫아 주세요.", "Saving recent changes on this device. Wait for saving to finish before closing this page.")
                        : hasLocalReceipt
                          ? bi("최근 작업이 이 기기에 저장됐어요.", "Your recent work is saved on this device.")
                          : bi("아직 이 기기에 저장된 기록이 없어요.", "No save has been recorded on this device yet.")}
                  </p>
                  {drawing && recorded ? <p className="mt-2 text-xs text-fg-3">{bi("마지막 기기 저장", "Last saved on this device")} · <time dateTime={recorded.toISOString()}>{recordedTime}</time></p> : null}
                  {status.pendingOperationsCount > 0 ? (
                    <progress
                      aria-label={bi("이 기기 저장 대기열 진행률", "Local save queue progress")}
                      className="mt-2 block h-1.5 w-full overflow-hidden rounded-full accent-accent"
                      max={peakPendingCount}
                      value={drainedPendingCount}
                    />
                  ) : null}
                </div>
              </div>
            </section>
  );
  const serverInfo = (
            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                {status.cloudSyncStatus === "offline" ? (
                  <CloudOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                ) : (
                  <Cloud className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-fg">서버</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {cloudStatusCopy(status.cloudSyncStatus, connectivity)}
                  </p>
                </div>
              </div>
            </section>
  );
  const recoveryInfo = (
            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">복구</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {hasLocalReceipt && status.lastCheckpointAt > 0
                      ? `마지막 복구 지점은 ${new Date(status.lastCheckpointAt).toLocaleTimeString()}에 만들어졌어요.`
                      : r3c07StatusText("studio.panelStatus.r3c07.saveSync.checkpointsEmpty", "아직 만들어진 복구 지점이 없어요. 아래에서 지금 만들 수 있어요.")}
                  </p>
                </div>
              </div>
            </section>
  );
  const detailsBody = <>
          <div data-studio-drawing-save-header={drawing ? "true" : undefined} className={drawing ? "studio-drawing-dialog-header" : "flex items-center justify-between border-b border-line/50 pb-2"}>
            <div>
              <p className="font-semibold text-fg">{drawing ? bi("저장과 복구", "Save and recovery") : "저장 상태"}</p>
              <p className="mt-0.5 text-[0.72rem] text-fg-3">
                내 작업이 어디까지 안전하게 보관됐는지 확인해요.
              </p>
            </div>
            <button
              type="button"
              onClick={closeAndRestoreFocus}
              ref={closeButtonRef}
              aria-label="저장 상태 닫기"
              className="grid min-h-8 min-w-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div data-studio-drawing-save-content={drawing ? "true" : undefined} className={drawing ? "studio-drawing-dialog-content" : undefined}>
          <div className="mt-3 space-y-2 text-[0.75rem]">{deviceInfo}{!drawing ? <>{serverInfo}{recoveryInfo}</> : null}</div>

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

          {drawing ? <>
            <div ref={STUDIO_MENUBAR_STATUS_SLOT_REFS.save} data-studio-clarity-mobile-save-slot="true" data-studio-drawing-save-details="true" className="studio-drawing-draft-save-section" />
            <details className="mt-4 border-t border-line pt-2"><summary className="cursor-pointer py-3 text-sm font-semibold">{bi("연결·복구 기록 보기", "Connection and recovery records")}</summary>{serverInfo}{recoveryInfo}</details>
          </> : null}
          <div ref={setNoticeElement} data-studio-connection-notice-details="true" />

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
                <span>{status.localDurable ? bi("기기 저장", "Device storage") : bi("메모리 전용", "Memory only")}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>최근 작업 번호</span>
                <span className="font-mono">#{journal.lastSequence}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>복구 지점 이후 변경</span>
                <span className="tabular-nums">{status.pendingOperationsCount}개</span>
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
  </>;
  const details = drawing && typeof document !== "undefined" ? createPortal(
    <dialog ref={dialogRef} hidden={!open} data-studio-shortcut-boundary="true" className="studio-drawing-dialog" aria-label={bi("저장과 복구", "Save and recovery")}
      data-studio-drawing-save-dialog="true" onCancel={(event) => { event.preventDefault(); closeAndRestoreFocus(); }} onClose={(event) => { if (event.currentTarget.open) return; if (event.currentTarget.returnValue === "next-task") { closeRequested.current = true; setOpen(false); } else closeAndRestoreFocus(); }}>
      {detailsBody}
    </dialog>, document.body,
  ) : <div hidden={!open} role="dialog" aria-label="저장 상태 상세"
    className="absolute right-0 top-full z-50 mt-1.5 max-h-[calc(100dvh-4rem)] w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-xl border border-line bg-card p-3.5 text-fg shadow-xl">
      {detailsBody}
    </div>;
  return (
    <div ref={containerRef} data-studio-save-sync-status-center className={drawing ? "studio-drawing-save-center" : "relative inline-block text-xs"}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`저장 상태 열기: ${drawing ? drawingName : saveLabel}`}
        data-studio-drawing-save-summary={drawing ? "true" : undefined}
        data-studio-local-save-state={drawing ? drawingState : undefined}
        aria-describedby={noticeSummaryId}
        className={drawing ? "studio-drawing-save-summary" : "flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.75rem] font-medium tabular-nums text-fg shadow-sm backdrop-blur transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"}
      >
        <SummaryIcon
          className={`size-3.5 ${drawing && drawingState === "saved" ? "text-success" : statusTone} ${view.kind === "reconnecting" ? "animate-spin motion-reduce:animate-none" : ""}`}
          aria-hidden
        />
        <span className="min-w-0 text-left">
          {drawing ? <span data-studio-clarity-receipt="true">{drawingLabel}{drawingState === "saved" && recorded ? <> · <time dateTime={recorded.toISOString()}>{recordedTime}</time></> : null}</span> : <span>{saveLabel}</span>}
          <span ref={setNoticeSummary} id={noticeSummaryId} className="flex flex-wrap items-center gap-x-2" data-studio-connection-notice-summary="true" data-studio-drawing-save-summary={drawing ? "true" : undefined} />
        </span>
      </button>
      {details}
    </div>
  );
}
