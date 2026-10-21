/**
 * StudioSaveStatusChromeMount — 저장 상태 바+센터를 에디터 메뉴바의
 * 문서 크롬 슬롯(#studio-document-chrome-slot)에 상시 마운트한다.
 *
 * 이 슬롯에는 StudioDocumentWindowHub(작업공간 바)도 포털로 들어간다 —
 * 두 포털은 같은 슬롯의 형제 자식으로 공존하고, 순서는 마운트 순서대로다.
 * 슬롯이 없는 표면(임베드 등)에서는 StudioChromePortal 이 인라인으로
 * 떨어지므로, 호스트는 이 마운트를 메뉴바가 실제로 있는 문서 표면에만
 * 렌더해야 한다.
 *
 * 상태는 실제 오토세이브 런타임 신호(studio-save-sync-signals 어댑터)에서만
 * 온다. 이 컴포넌트는 상태를 만들지 않는다.
 *
 * 장애·오프라인 복구 UX (누락 신규 G2, 2026-10-14): 연결 모듈의 스냅샷을
 * 함께 실어 서버 장애·재확인 중도 저장 표면에 닿게 하고, "연결 다시 확인"은
 * 연결 모듈의 수동 재검사(requestStudioConnectivityRecheck)에 연결한다.
 *
 * 첫 저장 → 게시 제안 (A5, 2026-10-22): 첫 게시 제안 카드
 * (StudioFirstPublishSuggestion)는 이 마운트 아래에 붙는 것이 설계였으나
 * 소비처가 없어 동선이 끊겨 있었다. 이제 이 마운트가 같은 신호 스토어의
 * lastReceipt로 "첫 저장이 실제로 완료됐는가"를 판정해 제안을 함께
 * 렌더한다. 제안 표시 여부의 세부 계약(1회성 등)은 제안 모듈이
 * 소유하고(게시 완료 문서 제외 포함), 이 마운트는 신호와 게시 준비 콜백을 잇기만 한다.
 * publishSuggestion을 넘기지 않으면 제안은 뜨지 않는다(기존 표면 무변경).
 */

import { StudioFirstPublishSuggestion } from "./StudioFirstPublishSuggestion";
import { StudioSaveStatusBar } from "./StudioSaveStatusBar";
import { StudioSaveSyncStatusCenter } from "./StudioSaveSyncStatusCenter";
import { requestStudioConnectivityRecheck } from "./offline/studio-connectivity";
import { useStudioConnectivity } from "./offline/use-studio-connectivity";
import { StudioChromePortal } from "./studio-shell/StudioDocumentChromeSlot";
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
  return (
    <StudioChromePortal targetId="studio-document-chrome-slot">
      <div
        className="flex items-center gap-1.5"
        data-studio-save-status-chrome-mount="true"
      >
        <StudioSaveStatusBar
          status={status}
          readOnlyTab={leadership === "follower"}
          onRetrySave={onRequestSaveFlush}
          connectivity={connectivity}
          onRecheckConnection={requestStudioConnectivityRecheck}
        />
        <StudioSaveSyncStatusCenter
          journal={journalSnapshot}
          statusOverride={status}
          onForceCheckpoint={onRequestSaveFlush}
          connectivity={connectivity}
          onRetrySave={onRequestSaveFlush}
          onRecheckConnection={requestStudioConnectivityRecheck}
        />
      </div>
      {publishSuggestion ? (
        <div className="mt-2 flex justify-end">
          <StudioFirstPublishSuggestion
            firstSaveCompleted={signals.lastReceipt !== null}
            cutCount={publishSuggestion.cutCount ?? 0}
            alreadyPublished={publishSuggestion.alreadyPublished ?? false}
            scope={publishSuggestion.scope}
            onCheckPublishReady={publishSuggestion.onCheckPublishReady}
          />
        </div>
      ) : null}
    </StudioChromePortal>
  );
}

export default StudioSaveStatusChromeMount;
