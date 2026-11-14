import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

export interface StudioVirtualSpaceBootRecoveryCardProps {
  readonly failureReason?: string | null;
  readonly onRetry: () => void;
  readonly workspaceHref?: string;
}

/**
 * 가상 스튜디오 스테이지(2D/3D/Phaser) 입장 실패·타임아웃 복구 카드.
 * 무한 로딩으로 멈추지 않고 구체적인 실패 이유, 다시 시도, 작업공간 복귀 동선을 함께 제공한다.
 */
export function StudioVirtualSpaceBootRecoveryCard({
  failureReason,
  onRetry,
  workspaceHref = "/studio",
}: StudioVirtualSpaceBootRecoveryCardProps) {
  const bt = useBilingual("StudioVirtualSpaceBootRecoveryCard");
  const resolvedReason = failureReason?.trim()
    ? failureReason.trim()
    : bt(
        "네트워크 지연 또는 그래픽 초기화 오류로 공간 준비가 중단되었습니다.",
        "Space initialization stopped due to a network delay or graphics setup error.",
      );

  return (
    <div
      className="studio-vspace-engine-message"
      role="alert"
      data-vspace-boot-recovery="true"
      data-space-interactive="true"
      style={{ zIndex: 30 }}
    >
      <div className="studio-vspace-engine-card">
        <p className="font-bold">
          {bt(
            "공간을 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.",
            "The studio could not load. Check the connection and retry.",
          )}
        </p>
        <p className="mt-1.5 text-xs opacity-85" data-vspace-failure-reason="true">
          {bt(`실패 이유: ${resolvedReason}`, `Reason: ${resolvedReason}`)}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRetry}
            data-vspace-boot-retry="true"
            className="rounded-xl bg-accent px-3.5 py-1.5 text-xs font-bold text-on-accent hover:bg-accent/90"
          >
            {bt("다시 시도", "Retry")}
          </button>
          <a
            href={workspaceHref}
            data-vspace-return-workspace="true"
            className="rounded-xl border border-current/25 px-3.5 py-1.5 text-xs font-semibold hover:bg-raised/40"
          >
            {bt("작업공간 돌아가기", "Back to workspace")}
          </a>
        </div>
      </div>
    </div>
  );
}
