/**
 * StudioSaveStatusChromeMount — 저장 상태 바+센터를 에디터 메뉴바의
 * 문서 크롬 슬롯(#studio-document-chrome-slot)에 상시 마운트한다.
 */

import { createPortal } from "react-dom";

import { StudioFirstPublishSuggestion } from "./StudioFirstPublishSuggestion";
import { StudioSaveStatusBar } from "./StudioSaveStatusBar";
import { StudioSaveSyncStatusCenter } from "./StudioSaveSyncStatusCenter";
import { requestStudioConnectivityRecheck } from "./offline/studio-connectivity";
import { useStudioConnectivity } from "./offline/use-studio-connectivity";
import { useStudioChromePortalTarget } from "./studio-shell/use-studio-chrome-portal-target";
import {
  useStudioSaveSyncSignals,
  useStudioSaveSyncView,
} from "./use-studio-save-sync-signals";

import type { StudioSaveSyncSignalStore } from "./studio-save-sync-signals";

export interface StudioFirstPublishSuggestionMount {
  /** 1회성 기억의 단위(문서·회차 식별자). */
  readonly scope: string;
  /** 현재 회차 컷 수. 호스트가 모르면 0 — 첫 저장 조건만으로 발동한다. */
  readonly cutCount?: number;
  /** 이미 게시된 문서면 제안하지 않는다. */
  readonly alreadyPublished?: boolean;
  /** "게시 준비 확인하기" — 게시 사전검사/게시 센터를 여는 호스트 콜백. */
  readonly onCheckPublishReady: () => void;
}

export interface StudioSaveStatusChromeMountProps {
  readonly store: StudioSaveSyncSignalStore;
  /**
   * "복구 지점 만들기"/"다시 시도" — 호스트의 오토세이브 강제 플러시
   * (예: autosaveRetryNonce 증가로 effect 재실행)에 연결한다. 없으면
   * 센터의 복구 지점 버튼은 숨고 바의 다시 시도 버튼도 숨는다.
   */
  readonly onRequestSaveFlush?: () => void;
  /** 첫 저장 → 게시 제안 동선. 없으면 제안을 렌더하지 않는다. */
  readonly publishSuggestion?: StudioFirstPublishSuggestionMount;
}

export function StudioSaveStatusChromeMount({
  store,
  onRequestSaveFlush,
  publishSuggestion,
}: StudioSaveStatusChromeMountProps) {
  const { status, journalSnapshot, leadership } = useStudioSaveSyncView(store);
  const signals = useStudioSaveSyncSignals(store);
  const connectivity = useStudioConnectivity();
  const slot = useStudioChromePortalTarget("studio-document-chrome-slot");
  const menubar = slot?.closest<HTMLElement>('[data-studio-app-menubar="true"]') ?? null;
  const presentation = menubar?.dataset.studioDrawingClarityHeader === "true" ? "drawing" : "default";
  const suggestion = publishSuggestion ? (
    <StudioFirstPublishSuggestion
      firstSaveCompleted={signals.lastReceipt !== null}
      cutCount={publishSuggestion.cutCount ?? 0}
      alreadyPublished={publishSuggestion.alreadyPublished ?? false}
      scope={publishSuggestion.scope}
      onCheckPublishReady={publishSuggestion.onCheckPublishReady}
    />
  ) : null;
  const bar = (
    <div
      className={presentation === "drawing" ? "contents" : "flex items-center gap-1.5"}
      data-studio-save-status-chrome-mount="true"
      data-studio-save-presentation={presentation}
    >
      <StudioSaveStatusBar
        status={status}
        readOnlyTab={leadership === "follower"}
        onRetrySave={onRequestSaveFlush}
        connectivity={connectivity}
        onRecheckConnection={requestStudioConnectivityRecheck}
        companionCenterMounted
        presentation={presentation}
      />
      <StudioSaveSyncStatusCenter
        journal={journalSnapshot}
        statusOverride={status}
        onForceCheckpoint={onRequestSaveFlush}
        connectivity={connectivity}
        onRetrySave={onRequestSaveFlush}
        onRecheckConnection={requestStudioConnectivityRecheck}
        presentation={presentation}
        readOnlyTab={leadership === "follower"}
      />
    </div>
  );
  return (
    <>
      {slot ? createPortal(bar, slot) : bar}
      {suggestion && menubar
        ? createPortal(
          <div
            data-studio-first-publish-suggestion-anchor="true"
            className="pointer-events-none absolute left-0 top-full z-10 mt-2 flex max-w-[calc(100vw-0.75rem)] justify-start lg:left-auto lg:right-3 lg:justify-end print:hidden"
          >
            {suggestion}
          </div>,
          menubar,
        )
        : null}
      {suggestion && !menubar ? <div className="mt-2 flex justify-end">{suggestion}</div> : null}
    </>
  );
}

export default StudioSaveStatusChromeMount;
