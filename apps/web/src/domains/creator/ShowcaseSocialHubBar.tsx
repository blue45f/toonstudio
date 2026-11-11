import { Film, Images, MessageCircle, MessagesSquare, Users } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const SOCIAL_TABS = [
  { id: "gallery", href: "/showcase", icon: Images, ko: "작품 갤러리", en: "Works Gallery", current: true },
  { id: "community", href: "/community", icon: MessagesSquare, ko: "팬카페 · 깊은 리뷰", en: "Pencafe & Reviews", current: false },
  { id: "timelapses", href: "/community/timelapses", icon: Film, ko: "작화 타임랩스", en: "Drawing Timelapses", current: false },
  { id: "collaborate", href: "/collaborate", icon: Users, ko: "팀원 구인 · 의뢰", en: "Team Recruiting", current: false },
] as const;

export function ShowcaseSocialHubBar() {
  const bt = useBilingual("ShowcaseSocialHubBar");

  return (
    <nav
      aria-label={bt("창작 소셜 4탭 허브", "Creator social 4-tab hub")}
      data-testid="showcase-social-hub-bar"
      className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card/80 p-1.5"
    >
      <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {SOCIAL_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <li key={tab.id} className="shrink-0">
              <Link
                href={tab.href}
                aria-current={tab.current ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors",
                  tab.current
                    ? "bg-accent text-on-accent"
                    : "text-fg-2 hover:bg-panel hover:text-fg",
                )}
              >
                <Icon size={14} aria-hidden="true" />
                {bt(tab.ko, tab.en)}
              </Link>
            </li>
          );
        })}
      </ul>
      <Link
        href="/character-chat"
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-accent/40 bg-accent-soft px-3 text-xs font-bold text-accent transition-colors hover:border-accent"
      >
        <MessageCircle size={14} aria-hidden="true" />
        {bt("세계관 캐릭터 토크", "Canon Character Talk")}
      </Link>
    </nav>
  );
}
