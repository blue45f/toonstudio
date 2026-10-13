import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioVirtualSpaceEngineMessageProps {
  readonly failure: boolean;
  readonly ready: boolean;
  /** 로딩 진행률(0~100). 로더가 아직 알리지 않았으면 null이라 막대를 그리지 않는다. */
  readonly loadProgress: number | null;
  /** 연결이 느려 안내를 보일 때. */
  readonly slowLoad: boolean;
  readonly onRetry: () => void;
}

/**
 * 월드를 여는 동안(또는 열지 못했을 때) 캔버스 위에 보이는 안내 카드 (캔버스에서 분리).
 * 준비되면 아무것도 그리지 않는다. 번역 키가 바뀌지 않도록 범위 이름은 캔버스의 것을 그대로 쓴다.
 */
export function StudioVirtualSpaceEngineMessage({ failure, ready, loadProgress, slowLoad, onRetry }: StudioVirtualSpaceEngineMessageProps) {
  const bt = useBilingual("StudioVirtualSpacePhaserCanvas");
  if (failure) {
    return (
      <div className="studio-vspace-engine-message" role="alert">
        <div className="studio-vspace-engine-card">
          <p>{bt("공간을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", "The studio could not load. Check the connection and retry.")}</p>
          <button type="button" onClick={onRetry}>{bt("다시 시도", "Retry")}</button>
        </div>
      </div>
    );
  }
  if (ready) return null;
  return (
    <div className="studio-vspace-engine-message" role="status" aria-busy="true">
      <div className="studio-vspace-engine-card">
        <p>{bt("스튜디오 불러오는 중…", "Loading studio…")}</p>
        {loadProgress !== null ? <progress className="studio-vspace-engine-progress" max={100} value={loadProgress} aria-hidden="true" /> : null}
        {slowLoad ? <p className="studio-vspace-engine-slow">{bt("연결이 느려 조금 더 걸리고 있어요.", "The connection is slow, so this is taking a little longer.")}</p> : null}
      </div>
    </div>
  );
}
