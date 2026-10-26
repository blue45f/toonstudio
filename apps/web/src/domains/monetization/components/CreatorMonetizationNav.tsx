/**
 * CreatorMonetizationNav.tsx
 *
 * 창작자 수익·멤버십·선공개·구독 멤버십을 하나의 로컬 내비게이션(LNB)으로 묶는다.
 * 테스트 환경에서 MemoryRouter 없이 렌더링되는 페이지 테스트와도 호환되도록
 * 현재 경로(`current`)를 명시적으로 받고 표준 앵커 링크를 사용한다.
 */
import { CalendarClock, ChartColumn, Coins, Crown, HeartHandshake, Store, TrendingUp } from "lucide-react";

import { getLang } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

export type CreatorMonetizationRoute =
  | "/creator/revenue"
  | "/creator/membership"
  | "/creator/early-access"
  | "/memberships";

interface NavItem {
  readonly href: string;
  readonly ko: string;
  readonly en: string;
  readonly icon: typeof ChartColumn;
  readonly primary?: boolean;
}

const PRIMARY_ITEMS: readonly NavItem[] = [
  {
    href: "/creator/revenue",
    ko: "수익·정산 대시보드",
    en: "Revenue & Payouts",
    icon: ChartColumn,
    primary: true,
  },
  {
    href: "/creator/membership",
    ko: "창작자 멤버십 설정",
    en: "Membership Tiers",
    icon: Crown,
    primary: true,
  },
  {
    href: "/creator/early-access",
    ko: "유료 미리보기 설정",
    en: "Early Access",
    icon: CalendarClock,
    primary: true,
  },
  {
    href: "/memberships",
    ko: "내 구독 멤버십",
    en: "My Subscriptions",
    icon: HeartHandshake,
    primary: true,
  },
];

const SECONDARY_ITEMS: readonly NavItem[] = [
  {
    href: "/market/seller",
    ko: "마켓 판매자 센터",
    en: "Market Seller Center",
    icon: Store,
  },
  {
    href: "/asset-points",
    ko: "포인트 지갑",
    en: "Points Wallet",
    icon: Coins,
  },
  {
    href: "/studio/growth",
    ko: "그로스 랩",
    en: "Growth Lab",
    icon: TrendingUp,
  },
];

export interface CreatorMonetizationNavProps {
  readonly current: CreatorMonetizationRoute;
  readonly className?: string;
}

export function CreatorMonetizationNav({ current, className }: CreatorMonetizationNavProps) {
  const isEn = typeof getLang === "function" && getLang() === "en";
  const label = (item: NavItem) => (isEn ? item.en : item.ko);

  return (
    <nav
      aria-label={isEn ? "Creator monetization and membership navigation" : "창작자 수익·멤버십 내비게이션"}
      className={cn(
        "mb-6 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-panel/60 p-2",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {PRIMARY_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.href === current;
          return (
            <a
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
                active
                  ? "bg-accent text-white shadow-sm"
                  : "text-fg-2 hover:bg-card hover:text-fg",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{label(item)}</span>
            </a>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-1 border-t border-line/60 pt-1.5 sm:border-t-0 sm:pt-0">
        {SECONDARY_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-fg-3 transition-colors hover:bg-card hover:text-fg"
            >
              <Icon className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
              <span>{label(item)}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
