import { resolveNavigationOrder, type SiteNavigationItem } from "./site-navigation";

/** 정본 목적지에서 검색하므로 메뉴를 접거나 페이지로 나눠도 기능이 누락되지 않는다. */
export function searchSiteMenu(query: string): readonly SiteNavigationItem[] {
  const terms = query.normalize("NFKC").trim().toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  if (!terms.length) return [];
  return resolveNavigationOrder().filter((item) => {
    const text = [item.label.ko, item.label.en, item.description.ko, item.description.en, item.href]
      .join(" ").normalize("NFKC").toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
}
