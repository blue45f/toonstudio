/**
 * StudioSaveStatusBar — 에디터 상단(문서 제목 옆) 상시 저장 상태 표시
 *
 * 상태 문구 규칙:
 * - 실제 receipt는 OPFS/SQLite의 기기 저장만 확인한다. 온라인 여부로 서버 저장을 약속하지 않는다.
 * - 저장됨은 범위와 시각을 함께 보여준다 ("이 기기에 저장됨 · 오후 3:12").
 * - 오프라인은 실패와 구분하고, 아직 저장 중이거나 receipt가 없으면 완료라고 말하지 않는다.
 * - 실패(localDurable=false)는 문구 + 다시 시도 버튼으로 행동까지 제시한다.
 * - 상태는 아이콘 모양 + 문구로 전달한다. 색만으로 구분하지 않는다.
 *
 * 접근성:
 * - 시각적 표시는 aria-hidden으로 두고, 별도 role="status" 라이브 영역이
 *   "저장됨으로 전이"와 "실패 발생"만 조용히 알린다. 저장 중 전이는 알리지
 *   않아 스크린리더가 작업 중 계속 떠들지 않는다.
 */

import { CheckCircle2, CloudOff, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useServiceStatusSlot } from "@/shared/lib/modal-status-slot";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  advanceSaveRecoveryAnnouncement,
  initialSaveRecoveryAnnouncementState,
  resolveSaveRecoveryView,
  type SaveRecoveryAnnouncementState,
  type SaveRecoveryKind,
} from "./studio-save-recovery-ux";

import { resolveSavedRecency } from "./studio-save-recency";
import type { StudioConnectivitySnapshot } from "./offline/studio-connectivity";
import type { StudioSaveSyncStatus } from "./studio-operation-recovery-coordinator";

const bi = (ko: string, en: string): string =>
  translateBilingualValueForActiveLocale("StudioSaveStatusBar", ko, en);

function formatSavedTime(lastSavedAt: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(lastSavedAt));
  } catch {
    return "";
  }
}

export interface StudioSaveStatusBarProps {
  readonly status: StudioSaveSyncStatus;
  /** 저장 실패 시 복구 지점 만들기를 다시 시도하는 콜백. 없으면 버튼을 숨긴다. */
  readonly onRetrySave?: () => void;
  /**
   * follower 탭 (문서 리더십이 다른 탭에 있음). 이 탭의 변경은 저장되지
   * 않으므로 저장 상태와 무관하게 이 사실이 먼저 읽혀야 한다.
   */
  readonly readOnlyTab?: boolean;
  /**
   * 연결 모듈의 스냅샷. 있으면 서버 장애·재확인 중 상태까지 합쳐 표시한다
   * (studio-save-recovery-ux 모델). 없으면 저장 상태만으로 도출한다.
   */
  readonly connectivity?: StudioConnectivitySnapshot | null;
  /** 연결 문제 시 즉시 재검사를 실행하는 콜백. 없으면 재확인 버튼을 숨긴다. */
  readonly onRecheckConnection?: () => void;
  /**
   * 바로 옆에 `StudioSaveSyncStatusCenter` 알약 버튼이 함께 마운트된 경우,
   * 동일한 "이 기기에 저장됨" 문구가 나란히 중복 노출되지 않도록 시각 텍스트만 접고
   * 스크린리더 라이브 알림·읽기 전용 경고·인라인 복구 버튼은 그대로 유지한다.
   */
  readonly companionCenterMounted?: boolean;
  /** 간단한 그리기는 상태 센터 한 곳에 요약하고 전이 알림·실패 재시도는 유지한다. */
  readonly presentation?: "default" | "drawing";
}

/** Render the always-visible one-line save state for the editor menubar. */
export function StudioSaveStatusBar({
  status,
  onRetrySave,
  readOnlyTab = false,
  connectivity = null,
  onRecheckConnection,
  companionCenterMounted = false,
  presentation = "default",
}: StudioSaveStatusBarProps) {
  useBilingualI18nRevision();
  const serviceSlot = useServiceStatusSlot();
  const view = resolveSaveRecoveryView(status, connectivity, { readOnlyTab });
  const state: SaveRecoveryKind = view.kind;
  const hasLocalReceipt = status.lastSavedAt > 0;
  const [announcement, setAnnouncement] = useState("");
  const announcementState = useRef<SaveRecoveryAnnouncementState>(
    initialSaveRecoveryAnnouncementState(state),
  );

  useEffect(() => {
    const advanced = advanceSaveRecoveryAnnouncement(announcementState.current, state);
    announcementState.current = advanced.state;
    const kind = advanced.announcement;
    if (kind === "saved") {
      setAnnouncement(hasLocalReceipt
        ? bi("모든 변경이 이 기기에 저장됐습니다.", "All changes saved on this device.")
        : bi("아직 이 기기에 저장된 기록이 없습니다.", "No save has been recorded on this device yet."));
    } else if (kind === "failed") {
      setAnnouncement(bi(
        "저장이 확인되지 않았습니다. 화면을 닫기 전에 다시 시도해 주세요.",
        "Save could not be confirmed. Please retry before closing this page.",
      ));
    } else if (kind === "connection-lost") {
      setAnnouncement(bi(
        "연결이 끊겼습니다. 작업은 이 기기에 계속 저장됩니다.",
        "Connection lost. Your work keeps saving on this device.",
      ));
    } else if (kind === "recovered") {
      setAnnouncement(hasLocalReceipt
        ? bi(
          "연결이 복구됐고 모든 변경이 이 기기에 저장됐습니다.",
          "Connection restored and all changes saved on this device.",
        )
        : bi(
          "연결이 복구됐습니다. 아직 이 기기에 저장된 기록이 없습니다.",
          "Connection restored. No save has been recorded on this device yet.",
        ));
    }
  }, [state, hasLocalReceipt]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (state !== "saved" || status.lastSavedAt <= 0) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [state, status.lastSavedAt]);
  const recency = resolveSavedRecency(status.lastSavedAt, nowMs);
  const savedLabel = hasLocalReceipt
    ? bi("이 기기에 저장됨", "Saved on this device")
    : bi("아직 저장 기록 없음", "No save recorded yet");
  const localLabel = status.pendingOperationsCount > 0
    ? bi("이 기기에 저장 중…", "Saving on this device…")
    : savedLabel;

  const label =
    state === "readonly"
      ? bi("다른 탭에서 편집 중", "Editing in another tab")
      : state === "failed"
        ? bi("저장 확인 필요", "Couldn't confirm save")
        : state === "offline"
          ? `${bi("오프라인", "Offline")} · ${localLabel}`
          : state === "server-unavailable"
            ? `${bi("서버 연결 안 됨", "Server unreachable")} · ${localLabel}`
            : state === "reconnecting"
              ? bi("연결 다시 확인 중…", "Reconnecting…")
              : state === "saving"
                ? localLabel
                : !hasLocalReceipt
                  ? savedLabel
                  : recency.kind === "just-now"
                    ? `${savedLabel} · ${bi("방금", "Just now")}`
                    : recency.kind === "minutes-ago"
                      ? bi("이 기기에 저장됨 · {minutes}분 전", "Saved on this device · {minutes} min ago").replace(
                          "{minutes}",
                          String(recency.minutes),
                        )
                      : `${savedLabel} · ${formatSavedTime(status.lastSavedAt)}`;

  const Icon =
    state === "readonly"
      ? CloudOff
      : state === "failed"
        ? TriangleAlert
        : state === "offline" || state === "server-unavailable"
          ? CloudOff
          : state === "saving" || state === "reconnecting"
            ? LoaderCircle
            : CheckCircle2;

  const tone =
    state === "failed"
      ? "text-danger"
      : state === "offline" || state === "readonly" || state === "server-unavailable"
        ? "text-warning"
        : "text-fg-2";

  const liveRegion = <span role="status" aria-live="polite" className="sr-only">{announcement}</span>;
  const liveTarget = presentation === "drawing" && serviceSlot?.kind === "modal" ? serviceSlot.element : null;
  const showVisualText = presentation !== "drawing" && (!companionCenterMounted || state === "readonly");

  return (
    <div className={presentation === "drawing" ? "contents" : "flex items-center gap-2"} data-studio-save-status-bar data-save-state={state}>
      {showVisualText ? (
        <span className={`flex min-h-8 items-center gap-1.5 text-[0.75rem] font-medium tabular-nums ${tone}`} aria-hidden="true">
          <Icon className={`size-3.5 ${state === "saving" || state === "reconnecting" ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
          <span>{label}</span>
        </span>
      ) : null}
      {state === "failed" && onRetrySave ? (
        <button
          type="button"
          onClick={onRetrySave}
          data-studio-inline-save-retry="true"
          className="flex min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 text-[0.75rem] font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {bi("다시 시도", "Retry")}
        </button>
      ) : null}
      {presentation !== "drawing" && view.canRecheckConnection && onRecheckConnection ? (
        <button
          type="button"
          onClick={onRecheckConnection}
          className="flex min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 text-[0.75rem] font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {bi("연결 다시 확인", "Check connection")}
        </button>
      ) : null}
      {/* 라이브 영역: 전이 시에만 내용이 바뀐다. */}
      {liveTarget ? createPortal(liveRegion, liveTarget) : liveRegion}
    </div>
  );
}

export default StudioSaveStatusBar;
