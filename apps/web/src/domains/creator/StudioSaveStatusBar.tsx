/**
 * StudioSaveStatusBar — 에디터 상단(문서 제목 옆) 상시 저장 상태 표시 (초안)
 *
 * 배경 (벤치마크 신규 P0, 2026-10-13):
 * - Canva의 "All changes saved"처럼 저장 상태는 상시 보여야 표준이다.
 * - 레포에는 이미 완성된 `StudioSaveSyncStatusCenter`(필 + 상세 다이얼로그)와
 *   순수 로직 `resolveSaveSyncStatus`가 있으나, 둘 다 실제 화면 어디에도
 *   렌더링되지 않는다(테스트만 import). 이 컴포넌트는 그 로직을 재사용해
 *   "메뉴바에 항상 보이는 한 줄"을 맡고, 상세는 기존 센터가 맡는다.
 *
 * 배치: 에디터 메뉴바의 문서 제목 오른쪽. `StudioChromePortal`로
 * `#studio-document-chrome-slot`에 넣는 것을 권장한다 (연결 지점은 AUDIT.md).
 *
 * 상태 문구 규칙:
 * - 저장됨은 시각과 함께 보여준다 ("저장됨 · 오후 3:12") — 막연한 안심 금지.
 * - 오프라인은 실패가 아니라 "이 기기에 저장됨"으로 구분한다.
 * - 실패(localDurable=false)는 문구 + 다시 시도 버튼으로 행동까지 제시한다.
 * - 상태는 아이콘 모양 + 문구로 전달한다. 색만으로 구분하지 않는다.
 *
 * 장애·오프라인 복구 UX (누락 신규 G2, 2026-10-14):
 * - 연결 모듈(studio-connectivity)의 4모드를 studio-save-recovery-ux 모델로
 *   합쳐, 서버 장애(server-unavailable)·재확인 중(reconnecting)도 한 줄에
 *   드러낸다. 연결 문제가 있으면 "연결 다시 확인" 버튼으로 즉시 재검사
 *   동선을 열고, 연결 상실·복구 전이도 라이브 영역이 알린다.
 *
 * 접근성:
 * - 시각적 표시는 aria-hidden으로 두고, 별도 role="status" 라이브 영역이
 *   "저장됨으로 전이"와 "실패 발생"만 조용히 알린다. 저장 중 전이는 알리지
 *   않아 스크린리더가 작업 중 계속 떠들지 않는다.
 */

import { CheckCircle2, CloudOff, LoaderCircle, RotateCcw, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

// 이 앱의 확립된 이중언어 패턴(NotFoundPage·RouteFallback과 동일):
// 컴포넌트 이름으로 네임스페이스를 두고 한·영 문구를 나란히 적는다.
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
}

/** Render the always-visible one-line save state for the editor menubar. */
export function StudioSaveStatusBar({
  status,
  onRetrySave,
  readOnlyTab = false,
  connectivity = null,
  onRecheckConnection,
}: StudioSaveStatusBarProps) {
  useBilingualI18nRevision();
  const view = resolveSaveRecoveryView(status, connectivity, { readOnlyTab });
  const state: SaveRecoveryKind = view.kind;
  const [announcement, setAnnouncement] = useState("");
  const announcementState = useRef<SaveRecoveryAnnouncementState>(
    initialSaveRecoveryAnnouncementState(state),
  );

  // 전이만 알린다: saving→saved (완료), *→failed (위험), 연결 상실·복구.
  // 복구는 다단계 전이(오프라인→재확인→동기화 중→저장됨) 전체를 기억하는
  // 상태 기계로 판정한다 — 마지막 한 쌍만 보면 "복구 확인"이 "일반 저장
  // 완료"로 뭉개진다 (studio-save-recovery-ux의 C6 상태 기계).
  useEffect(() => {
    const advanced = advanceSaveRecoveryAnnouncement(announcementState.current, state);
    announcementState.current = advanced.state;
    const kind = advanced.announcement;
    if (kind === "saved") {
      setAnnouncement(bi("모든 변경이 저장됐습니다.", "All changes saved."));
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
      setAnnouncement(bi(
        "연결이 복구됐고 모든 변경이 저장됐습니다.",
        "Connection restored and all changes saved.",
      ));
    }
  }, [state]);

  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (state !== "saved" || status.lastSavedAt <= 0) return;
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [state, status.lastSavedAt]);
  const recency = resolveSavedRecency(status.lastSavedAt, nowMs);

  const label =
    state === "readonly"
      ? bi("다른 탭에서 편집 중", "Editing in another tab")
      : state === "failed"
        ? bi("저장 확인 필요", "Couldn't confirm save")
        : state === "offline"
          ? bi("오프라인 · 이 기기에 저장됨", "Offline · Saved on this device")
          : state === "server-unavailable"
            ? bi("서버 연결 안 됨 · 이 기기에 저장됨", "Server unreachable · Saved on this device")
            : state === "reconnecting"
              ? bi("연결 다시 확인 중…", "Reconnecting…")
              : state === "saving"
                ? bi("저장 중…", "Saving…")
                : status.lastSavedAt <= 0
                  ? bi("저장됨", "Saved")
                  : recency.kind === "just-now"
                    ? `${bi("저장됨", "Saved")} · ${bi("방금", "Just now")}`
                    : recency.kind === "minutes-ago"
                      ? bi("저장됨 · {minutes}분 전", "Saved · {minutes} min ago").replace(
                          "{minutes}",
                          String(recency.minutes),
                        )
                      : `${bi("저장됨", "Saved")} · ${formatSavedTime(status.lastSavedAt)}`;

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

  return (
    <div className="flex items-center gap-2" data-studio-save-status-bar data-save-state={state}>
      <span className={`flex min-h-8 items-center gap-1.5 text-[0.75rem] font-medium ${tone}`} aria-hidden="true">
        <Icon className={`size-3.5 ${state === "saving" || state === "reconnecting" ? "animate-spin" : ""}`} aria-hidden="true" />
        <span>{label}</span>
      </span>
      {state === "failed" && onRetrySave ? (
        <button
          type="button"
          onClick={onRetrySave}
          className="flex min-h-8 items-center gap-1 rounded-full border border-line bg-card px-2.5 text-[0.75rem] font-semibold text-fg hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
        >
          <RotateCcw className="size-3.5" aria-hidden="true" />
          {bi("다시 시도", "Retry")}
        </button>
      ) : null}
      {view.canRecheckConnection && onRecheckConnection ? (
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
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

export default StudioSaveStatusBar;
