import { PackageCheck, PackagePlus, Store, type LucideIcon } from "lucide-react";

import {
  SELLER_CENTER_TABS,
  type SellerCenterTabId,
} from "../models/market-seller-center";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const TAB_ICONS: Readonly<Record<SellerCenterTabId, LucideIcon>> = {
  center: Store,
  register: PackagePlus,
  packages: PackageCheck,
};

/**
 * 판매자 센터 탭 — 센터(/market/seller)·등록 마법사(/market/publish)·
 * 패키지 관리(/market/manage) 세 표면 상단에 같은 자리로 두는 공용 탭이다.
 * 탭 href는 기존 URL 그대로의 딥링크이며, 활성 탭만 현재 표면을 뜻한다.
 */
export function MarketSellerCenterTabs({
  active,
}: {
  readonly active: SellerCenterTabId;
}) {
  const bt = useBilingual("MarketSellerCenterTabs");

  return (
    <nav aria-label={bt("판매자 센터 탭", "Seller center tabs")} className="mt-6">
      <ul className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {SELLER_CENTER_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = tab.id === active;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                title={bt(...tab.description)}
                className={cn(
                  "inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-sm font-bold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                  isActive
                    ? "bg-accent text-on-accent"
                    : "bg-raised/60 text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {bt(...tab.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
