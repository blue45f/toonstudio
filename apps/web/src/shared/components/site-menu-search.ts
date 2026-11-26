import { LifeBuoy, Search, Users } from "lucide-react";

import { resolveNavigationOrder, type SiteNavigationItem } from "./site-navigation";
import { CORE_SURFACE_QUICK_LINKS } from "./workspace/page-role-journey-map";

const canonicalDestinations = resolveNavigationOrder();
const canonicalHrefs = new Set(canonicalDestinations.map((item) => item.href));

/** 기존 보조 바로가기는 해당 목적 안에 보존하고 검색에서도 함께 찾을 수 있다. */
export const EXTRA_SITE_MENU_DESTINATIONS: readonly (SiteNavigationItem & { readonly groupId: string })[] =
  CORE_SURFACE_QUICK_LINKS.filter((item) => !canonicalHrefs.has(item.href)).map((item) => ({
    id: `menu-${item.href}`,
    href: item.href,
    label: { ko: item.labelKo, en: item.labelEn },
    description: { ko: item.reasonKo, en: item.reasonEn },
    icon: item.href === "/studio/support" ? LifeBuoy : item.href === "/research/materials" ? Search : Users,
    kind: "reference",
    tier: "directory",
    audience: "public",
    groupId: item.href === "/studio/support" ? "personal" : "grow",
  }));

/** 정본 목적지에서 검색하므로 메뉴를 접거나 페이지로 나눠도 기능이 누락되지 않는다. */
export function searchSiteMenu(query: string): readonly SiteNavigationItem[] {
  const terms = query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  return [...canonicalDestinations, ...EXTRA_SITE_MENU_DESTINATIONS].filter((item) => {
    const text = [item.label.ko, item.label.en, item.description.ko, item.description.en, item.href]
      .join(" ").normalize("NFKC").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
