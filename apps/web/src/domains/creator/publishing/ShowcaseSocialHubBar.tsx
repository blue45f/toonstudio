import { Film, Images, MessageCircle, MessagesSquare, Sparkles, Users } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const SOCIAL_TABS = [
  { id: "gallery", href: "/showcase", icon: Images, ko: "작품 갤러리", en: "Works Gallery", current: true },
  { id: "community", href: "/community", icon: MessagesSquare, ko: "팬카페 · 깊은 리뷰", en: "Pencafe & Reviews", current: false },
  { id: "timelapses", href: "/community/timelapses", icon: Film, ko: "작화 타임랩스", en: "Drawing Timelapses", current: false },
  { id: "collaborate", href: "/collaborate", icon: Users, ko: "팀원 구인 · 의뢰", en: "Team Recruiting", current: false },
] as const;

/**
 * 시안 I (Creator Social Hub) — 갤러리·팬카페·작화 타임랩스·팀 구인 4탭 통합 바 + 세계관 캐릭터 토크 브리지.
 */
export function ShowcaseSocialHubBar() {
  const bt = useBilingual("ShowcaseSocialHubBar");

  return (
    <nav
      aria-label={bt("창작 소셜 4탭 허브", "Creator social 4-tab hub")}
      data-testid="showcase-social-hub-bar"
      className="mb-5 overflow-hidden rounded-2xl border border-line-strong/75 bg-[linear-gradient(155deg,color-mix(in_oklch,var(--color-accent)_9%,var(--color-panel)),var(--color-card))] shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/65 px-3.5 py-2">
        <span className="inline-flex items-center gap-1.5 font-display text-[11px] font-extrabold uppercase tracking-[0.08em] text-accent">
          <Sparkles size={13} aria-hidden="true" />
          <span>{bt("CREATOR SOCIAL SALON · 갤러리 · 타임랩스 · 협업", "CREATOR SOCIAL SALON · GALLERY · TIMELAPSE · TEAM")}</span>
        </span>
        <span className="text-[11px] font-semibold text-fg-2">
          {bt("완성 아트워크 감상부터 분업 스튜디오 매칭까지 한 화면에서 전환", "Switch from finished artwork to studio team matching in one click")}
        </span>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 p-2">
        <ul className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto snap-x [scrollbar-width:none]">
          {SOCIAL_TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <li key={tab.id} className="shrink-0 snap-start">
                <Link
                  href={tab.href}
                  aria-current={tab.current ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors",
                    tab.current
                      ? "bg-accent text-on-accent shadow-xs"
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
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-accent/45 bg-accent-soft px-3.5 text-xs font-bold text-accent transition-colors hover:border-accent hover:bg-accent hover:text-on-accent"
        >
          <MessageCircle size={14} aria-hidden="true" />
          {bt("세계관 캐릭터 토크", "Canon Character Talk")}
        </Link>
      </div>
    </nav>
  );
}
