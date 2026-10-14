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
 */

import { StudioSaveStatusBar } from "./StudioSaveStatusBar";
import { StudioSaveSyncStatusCenter } from "./StudioSaveSyncStatusCenter";
import { requestStudioConnectivityRecheck } from "./offline/studio-connectivity";
import { useStudioConnectivity } from "./offline/use-studio-connectivity";
import { StudioChromePortal } from "./studio-shell/StudioDocumentChromeSlot";
import { useStudioSaveSyncView } from "./use-studio-save-sync-signals";

import type { StudioSaveSyncSignalStore } from "./studio-save-sync-signals";

export interface StudioSaveStatusChromeMountProps {
  readonly store: StudioSaveSyncSignalStore;
  /**
   * "복구 지점 만들기"/"다시 시도" — 호스트의 오토세이브 강제 플러시
   * (예: autosaveRetryNonce 증가로 effect 재실행)에 연결한다. 없으면
   * 센터의 복구 지점 버튼은 숨고 바의 다시 시도 버튼도 숨는다.
   */
  readonly onRequestSaveFlush?: () => void;
}

export function StudioSaveStatusChromeMount({
  store,
  onRequestSaveFlush,
}: StudioSaveStatusChromeMountProps) {
  const { status, journalSnapshot, leadership } = useStudioSaveSyncView(store);
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
    </StudioChromePortal>
  );
}

export default StudioSaveStatusChromeMount;
