import { Copy, Link2 } from "lucide-react";

import type { StudioLiveInviteRole } from "./studio-live-jam-session";

interface StudioLiveInviteLinkCardProps {
  inviteRole: StudioLiveInviteRole | "editor";
  inviteLinkNotice?: string | null;
  onCopyInviteLink: () => void;
  onInviteRoleChange?: (role: StudioLiveInviteRole | "editor") => void;
}

export function StudioLiveInviteLinkCard({
  inviteRole,
  inviteLinkNotice,
  onCopyInviteLink,
  onInviteRoleChange,
}: StudioLiveInviteLinkCardProps) {
  return (
    <div className="mt-3 rounded-xl border border-line bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 size={15} strokeWidth={1.5} className="shrink-0 text-accent" aria-hidden />
          <span className="text-xs font-semibold text-fg">팀 초대 링크</span>
        </div>
        <button
          type="button"
          onClick={onCopyInviteLink}
          className="flex min-h-11 items-center gap-2 rounded-lg bg-accent px-3 text-xs font-medium text-on-accent transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none"
        >
          <Copy size={13} strokeWidth={1.5} aria-hidden />
          초대 링크 복사
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <label className="text-xs font-medium text-fg-2" htmlFor="studio-live-invite-role">
          링크로 들어온 사람의 권한
        </label>
        <select
          id="studio-live-invite-role"
          value={inviteRole}
          disabled={!onInviteRoleChange}
          onChange={(event) => {
            const next = event.target.value;
            if (next === "editor" || next === "commenter" || next === "viewer") {
              onInviteRoleChange?.(next);
            }
          }}
          className="min-h-11 rounded-lg border border-line bg-card px-3 py-2 text-xs font-medium text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:min-h-9"
        >
          <option value="editor">편집 가능</option>
          <option value="commenter">댓글만 가능</option>
          <option value="viewer">보기 전용</option>
        </select>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-3">
        고른 권한은 이 링크로 처음 들어오는 참가자에게만 적용됩니다. 링크는 현재 작품의 서버
        권한을 우회하지 않으며, 팀원으로 추가된 사용자는 로그인 뒤 서버 권한이 우선합니다.
        팀원이 열면 같은 캔버스에서 실시간 획과 커서를 안전하게 동기화합니다.
      </p>
      {inviteLinkNotice ? (
        <p aria-live="polite" className="mt-2 text-xs font-medium text-good" role="status">
          {inviteLinkNotice}
        </p>
      ) : null}
    </div>
  );
}
