import { Check, Lock, Shield, Unlock, User, UserPlus, VolumeX, X } from "lucide-react";
import { useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type {
  VirtualSpaceHostAction,
  VirtualSpacePermissions,
  VirtualSpaceRoomControlState,
} from "../state/use-virtual-space-permissions";

export interface SpaceInlineProfilePopoverProps {
  readonly nickname: string;
  readonly onNicknameChange: (next: string) => void;
  readonly permissions: VirtualSpacePermissions;
  readonly roomControl: VirtualSpaceRoomControlState;
  readonly onHostAction: (action: VirtualSpaceHostAction) => boolean;
  readonly onOpenInvite?: () => void;
  readonly onOpenAvatarCustomize: () => void;
  readonly peers: readonly { readonly sessionId: string; readonly displayName: string }[];
}

const ROLE_LABELS: Readonly<Record<VirtualSpacePermissions["role"], readonly [string, string]>> = {
  owner: ["방장", "Owner"],
  admin: ["관리자", "Admin"],
  editor: ["팀원", "Editor"],
  "guest-voice": ["초대 게스트 (음성 가능)", "Invited guest (voice)"],
  viewer: ["관람", "Viewer"],
};

/**
 * 비차단 즉시 진입 후 공간 안에서 닉네임·아바타·초대·방장 제어를 바로 조작하는 인스페이스 프로필 팝오버.
 */
export function SpaceInlineProfilePopover({
  nickname,
  onNicknameChange,
  permissions,
  roomControl,
  onHostAction,
  onOpenInvite,
  onOpenAvatarCustomize,
  peers,
}: SpaceInlineProfilePopoverProps) {
  const bt = useBilingual("SpaceInlineProfilePopover");
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(nickname);

  const commitName = () => {
    const cleaned = draftName.trim();
    if (cleaned) onNicknameChange(cleaned);
  };

  const roleLabel = ROLE_LABELS[permissions.role];

  return (
    <div className="relative" data-space-interactive="true">
      <button
        type="button"
        data-testid="space-inline-profile-btn"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setDraftName(nickname);
          setOpen((current) => !current);
        }}
        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-panel/95 px-3 text-xs font-semibold text-fg shadow-sm backdrop-blur-md transition hover:border-accent"
      >
        <User size={15} aria-hidden />
        <span className="max-w-28 truncate">{nickname}</span>
        <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-medium text-fg-2">
          {bt(roleLabel[0], roleLabel[1])}
        </span>
      </button>

      {open ? (
        <section
          role="dialog"
          aria-label={bt("내 프로필과 공간 제어", "My profile & room controls")}
          data-testid="space-inline-profile-popover"
          className="absolute left-0 top-12 z-40 w-80 max-w-[calc(100vw-1.5rem)] space-y-3 rounded-2xl border border-line bg-panel p-4 text-xs text-fg shadow-xl"
        >
          <header className="flex items-center justify-between gap-2">
            <strong className="text-sm font-semibold">{bt("내 스튜디오 프로필", "My studio profile")}</strong>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={bt("닫기", "Close")}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-line bg-card text-fg-2 hover:text-fg"
            >
              <X size={16} aria-hidden />
            </button>
          </header>

          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              commitName();
            }}
          >
            <label htmlFor="space-inline-nickname" className="block text-xs font-medium text-fg-2">
              {bt("공개 닉네임", "Display nickname")}
            </label>
            <div className="flex gap-1.5">
              <input
                id="space-inline-nickname"
                type="text"
                maxLength={32}
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3 text-xs text-fg focus:border-accent focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-accent bg-accent px-3 text-xs font-semibold text-on-accent"
              >
                <Check size={14} aria-hidden />
                {bt("저장", "Save")}
              </button>
            </div>
          </form>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenAvatarCustomize();
              }}
              className="min-h-11 flex-1 rounded-xl border border-line bg-card px-3 text-xs font-medium text-fg hover:border-accent"
            >
              {bt("아바타·룸 꾸미기", "Avatar & room")}
            </button>
            {onOpenInvite ? (
              <button
                type="button"
                data-testid="space-inline-open-invite-btn"
                onClick={() => {
                  setOpen(false);
                  onOpenInvite();
                }}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-3 text-xs font-medium text-fg hover:border-accent"
              >
                <UserPlus size={14} aria-hidden />
                {bt("초대", "Invite")}
              </button>
            ) : null}
          </div>

          {permissions.canManageRoom ? (
            <div
              data-testid="space-host-controls"
              className="space-y-2 border-t border-line pt-3"
            >
              <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Shield size={14} aria-hidden />
                <span>{bt("방장 제어", "Host controls")}</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  aria-pressed={roomControl.roomLocked}
                  onClick={() => onHostAction({ action: "lock-room", locked: !roomControl.roomLocked })}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-2.5 text-xs font-medium text-fg hover:border-accent"
                >
                  {roomControl.roomLocked ? <Lock size={14} aria-hidden /> : <Unlock size={14} aria-hidden />}
                  {roomControl.roomLocked ? bt("입장 잠금 해제", "Unlock room") : bt("입장 잠금", "Lock room")}
                </button>
                <button
                  type="button"
                  aria-pressed={roomControl.editLocked}
                  onClick={() => onHostAction({ action: "toggle-edit-lock", locked: !roomControl.editLocked })}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-card px-2.5 text-xs font-medium text-fg hover:border-accent"
                >
                  {roomControl.editLocked ? bt("편집 잠금 해제", "Unlock edits") : bt("편집 잠금", "Lock edits")}
                </button>
              </div>
              {peers.length > 0 ? (
                <ul className="space-y-1">
                  {peers.slice(0, 5).map((peer) => {
                    const muted = roomControl.mutedPeerIds.includes(peer.sessionId);
                    return (
                      <li key={peer.sessionId} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-card px-2.5 py-1.5">
                        <span className="truncate font-medium">{peer.displayName}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => onHostAction({ action: "mute-peer", targetSessionId: peer.sessionId, muted: !muted })}
                            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line px-2 text-[11px]"
                          >
                            <VolumeX size={12} aria-hidden />
                            {muted ? bt("음소거 해제", "Unmute") : bt("음소거", "Mute")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onHostAction({ action: "kick-peer", targetSessionId: peer.sessionId })}
                            className="min-h-9 rounded-md border border-line px-2 text-[11px] text-bad"
                          >
                            {bt("내보내기", "Remove")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
