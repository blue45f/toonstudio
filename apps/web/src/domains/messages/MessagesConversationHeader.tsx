import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Archive, ArrowLeft, CircleSlash2, MoreHorizontal, Volume2, VolumeX } from "lucide-react";

import type { MessagingThreadSummary } from "@/platform/messaging-client";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import type { InboxTab } from "./MessagesThreadList";
import { UserAvatar } from "./MessagingUserAvatar";

interface Props {
  readonly thread: MessagingThreadSummary;
  readonly tab: InboxTab;
  readonly busy: boolean;
  readonly onToggleMute: () => void;
  readonly onToggleArchive: () => void;
  readonly onBlock: () => void;
}

const MENU_ITEM_CLASS = "flex min-h-11 cursor-pointer select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-fg outline-none data-[highlighted]:bg-raised data-[disabled]:pointer-events-none data-[disabled]:opacity-50";

export function MessagesConversationHeader({ thread, tab, busy, onToggleMute, onToggleArchive, onBlock }: Props) {
  const t = useBilingual("domains.messages.MessagesConversationHeader");
  const categories = {
    feedback: t("작품 피드백", "Work feedback"),
    collaboration: t("협업 제안", "Collaboration proposal"),
    business: t("비즈니스 문의", "Business inquiry"),
    general: t("일반 문의", "General inquiry"),
  };
  const muteLabel = thread.mutedUntil ? t("알림 켜기", "Turn on notifications") : t("8시간 알림 끄기", "Mute for 8 hours");
  const archiveLabel = thread.archivedAt ? t("보관 해제", "Unarchive conversation") : t("대화 보관", "Archive conversation");
  const MuteIcon = thread.mutedUntil ? VolumeX : Volume2;
  const iconButtonClass = buttonClass({ size: "icon", variant: "quiet", className: "size-11 shrink-0" });

  return (
    <header data-messages-conversation-header="" className="min-w-0 border-b border-line bg-card px-3 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          href={{ pathname: "/messages", query: tab === "active" ? {} : { tab } }}
          className={`${iconButtonClass} lg:hidden`}
          aria-label={t("대화 목록으로", "Back to conversations")}
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </Link>
        <UserAvatar user={thread.otherUser} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/u/${encodeURIComponent(thread.otherUser.id)}`}
            title={thread.otherUser.name}
            className="block text-sm font-semibold text-fg [overflow-wrap:anywhere] hover:underline"
          >
            {thread.otherUser.name}
          </Link>
          <p className="mt-1 text-xs text-fg-2">{categories[thread.category]}</p>
        </div>
        <div className="hidden shrink-0 items-center gap-1 sm:flex">
          <button type="button" onClick={onToggleMute} disabled={busy} className={iconButtonClass} aria-label={muteLabel} title={muteLabel}>
            <MuteIcon size={17} aria-hidden="true" />
          </button>
          <button type="button" onClick={onToggleArchive} disabled={busy} className={iconButtonClass} aria-label={archiveLabel} title={archiveLabel}>
            <Archive size={17} aria-hidden="true" />
          </button>
        </div>
        <DropdownMenu.Root modal={false}>
          <DropdownMenu.Trigger asChild>
            <button type="button" className={iconButtonClass} aria-label={t("대화 메뉴", "Conversation menu")}>
              <MoreHorizontal size={18} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              collisionPadding={12}
              loop
              aria-label={t("대화 메뉴", "Conversation menu")}
              className="z-[90] w-56 max-w-[calc(100vw-1.5rem)] rounded-xl border border-line-strong bg-card p-1 shadow-xl"
            >
              <DropdownMenu.Item onSelect={onToggleMute} disabled={busy} className={MENU_ITEM_CLASS}>
                <MuteIcon size={16} aria-hidden="true" />{muteLabel}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={onToggleArchive} disabled={busy} className={MENU_ITEM_CLASS}>
                <Archive size={16} aria-hidden="true" />{archiveLabel}
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              <DropdownMenu.Item onSelect={onBlock} disabled={thread.blocked || busy} className={`${MENU_ITEM_CLASS} text-danger data-[highlighted]:bg-danger-soft`}>
                <CircleSlash2 size={16} aria-hidden="true" />{thread.blocked ? t("차단됨", "Blocked") : t("회원 차단", "Block user")}
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
      {thread.context.label ? (
        <p className="mt-3 border-t border-line/60 pt-2 text-xs leading-5 text-fg-2 [overflow-wrap:anywhere]">
          {thread.context.href ? (
            <Link href={thread.context.href} className="font-semibold text-accent hover:underline" title={thread.context.label}>
              {thread.context.label}
            </Link>
          ) : thread.context.label}
        </p>
      ) : null}
    </header>
  );
}
