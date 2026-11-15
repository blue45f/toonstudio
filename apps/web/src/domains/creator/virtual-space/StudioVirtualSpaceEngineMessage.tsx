import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { StudioVirtualSpaceBootRecoveryCard } from "./StudioVirtualSpaceBootRecoveryCard";
import { StudioVirtualSpaceIllustratedStageHud } from "./StudioVirtualSpaceIllustratedStageHud";

export interface StudioVirtualSpaceEngineMessageProps {
  readonly failure: boolean;
  readonly ready: boolean;
  /** 구체적인 입장 실패 사유(타임아웃·그래픽 컨텍스트·네트워크 오류 등). */
  readonly failureReason?: string | null;
  /** 로딩 진행률(0~100). 로더가 아직 알리지 않았으면 null이라 막대를 그리지 않는다. */
  readonly loadProgress: number | null;
  /** 연결이 느려 안내를 보일 때. */
  readonly slowLoad: boolean;
  readonly onRetry: () => void;
  readonly workspaceHref?: string;
}

/**
 * 월드를 여는 동안(또는 열지 못했을 때) 캔버스 위에 보이는 안내 카드 및 2D 일러스트 HUD.
 * 준비되면 로딩 카드는 숨기고 상단/하단 2.5D 일러스트 스튜디오 워크벤치 도크만 유지한다.
 */
export function StudioVirtualSpaceEngineMessage({
  failure,
  ready,
  failureReason,
  loadProgress,
  slowLoad,
  onRetry,
  workspaceHref = "/studio",
}: StudioVirtualSpaceEngineMessageProps) {
  const bt = useBilingual("StudioVirtualSpacePhaserCanvas");
  if (failure) {
    return (
      <StudioVirtualSpaceBootRecoveryCard
        failureReason={failureReason}
        onRetry={onRetry}
        workspaceHref={workspaceHref}
      />
    );
  }
  return (
    <>
      <StudioVirtualSpaceIllustratedStageHud />
      {ready ? null : (
        <div className="studio-vspace-engine-message" role="status" aria-busy="true">
          <div className="studio-vspace-engine-card">
            <p>{bt("스튜디오 불러오는 중…", "Loading studio…")}</p>
            {loadProgress !== null ? <progress className="studio-vspace-engine-progress" max={100} value={loadProgress} aria-hidden="true" /> : null}
            {slowLoad ? (
              <div className="mt-2 flex flex-col items-center gap-2">
                <p className="studio-vspace-engine-slow">{bt("연결이 느려 조금 더 걸리고 있어요.", "The connection is slow, so this is taking a little longer.")}</p>
                <a href={workspaceHref} className="text-xs underline opacity-85" data-vspace-return-workspace="true">
                  {bt("작업공간 돌아가기", "Back to workspace")}
                </a>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
