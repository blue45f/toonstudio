import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { AvatarSaveStatus } from "./use-studio-virtual-avatar-persistence";

export function StudioVirtualAvatarPersistenceNotice({ status, onRetry, personal }: {
  readonly status: AvatarSaveStatus;
  readonly onRetry: () => void;
  readonly personal: boolean;
}) {
  const bt = useBilingual("StudioVirtualAvatarPersistenceNotice");
  return <section className="space-panel-section sticky top-0 z-10 rounded-xl border border-line bg-card p-3" aria-label={bt("캐릭터 저장 상태", "Character save status")}>
    <p className="space-panel-note" role={status === "failed" ? "alert" : "status"}>
      {status === "failed" ? bt(
        "지금 모습은 바뀌었지만 저장을 마치지 못했어요. 다시 접속하면 이전 모습이 보일 수 있어요.",
        "Your appearance changed, but saving did not finish. Your previous character may return on your next visit.",
      ) : status === "saved" ? bt(
        "이 브라우저에 캐릭터 선택을 저장했어요.",
        "Your character choice was saved in this browser.",
      ) : bt("캐릭터를 고르면 다음 접속을 위해 이 브라우저에 기억해요.", "Choosing a character saves the choice in this browser for your next visit.")}
    </p>
    {status === "failed" ? <button type="button" className="space-pill-button" style={{ minHeight: 48 }} onClick={onRetry}>
      {bt("캐릭터 저장 다시 시도", "Retry saving character")}
    </button> : null}
    {!personal ? <p className="space-panel-note">{bt("브라우저 저장과 팀 연결·공유 상태는 별개예요.", "Browser storage is separate from your team connection and sharing state.")}</p> : null}
  </section>;
}
