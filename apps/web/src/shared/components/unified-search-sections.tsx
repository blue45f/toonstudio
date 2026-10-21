import { ArrowRight, BookOpen, Compass, GraduationCap, Store, type LucideIcon } from "lucide-react";
import { useMemo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

import {
  UNIFIED_SEARCH_SECTION_LABELS,
  unifiedSectionOf,
  type UnifiedSearchSectionKind,
} from "./unified-search";
import { searchUnifiedLocal } from "./unified-search-providers";

const SECTION_ICONS: Record<Exclude<UnifiedSearchSectionKind, "works">, LucideIcon> = {
  assets: Store,
  courses: GraduationCap,
  help: BookOpen,
  pages: Compass,
};

/**
 * /search의 통합 검색 패널 — 작품 결과(탐색기) 아래에 소재·강좌·도움말
 * (매뉴얼)·페이지 섹션을 같은 검색어로 이어 붙인다.
 * 작품만 찾던 /search에서 헤더 검색과 같은 유형별 도달성을 맞추기 위한 표면이며,
 * 실제 매칭은 전부 unified-search-providers(기존 검색 모듈 재사용)가 한다.
 * 소재는 경량 로컬 색인(A6)이 실제 항목으로 답한다 — 색인에 항목이 없을
 * 때만 아래쪽에 전용 표면 링크가 남는다.
 */
export function UnifiedSearchSections({ query }: { readonly query: string }) {
  const bt = useBilingual("UnifiedSearchSections");
  const trimmed = query.trim();
  const result = useMemo(() => (trimmed ? searchUnifiedLocal(trimmed) : null), [trimmed]);

  if (!result) return null;
  const itemSections = result.sections.filter((section) => section.items.length > 0);
  const assets = unifiedSectionOf(result, "assets");
  // 소재 링크는 색인이 답하지 못했을 때의 폴백이다 — 항목이 있으면 섹션이 본문이다.
  const assetsLinkOnly = assets && assets.items.length === 0 ? assets : undefined;
  if (itemSections.length === 0 && !assetsLinkOnly?.moreHref) return null;

  return (
    <section
      aria-label={bt("다른 유형의 검색 결과", "Results in other types")}
      className="mt-10 border-t border-line pt-8"
    >
      <h2 className="text-base font-bold text-fg">{bt("다른 유형에서도 찾기", "Also in other types")}</h2>
      <p className="mt-1 text-xs text-fg-3">
        {bt(
          "작품이 아니면 강좌·매뉴얼·페이지·소재에도 같은 검색어가 닿아요.",
          "The same query also reaches courses, manual articles, pages and assets.",
        )}
      </p>

      <div className="mt-5 grid gap-6 md:grid-cols-3">
        {itemSections.map((section) => {
          const Icon = SECTION_ICONS[section.kind as Exclude<UnifiedSearchSectionKind, "works">];
          const label = UNIFIED_SEARCH_SECTION_LABELS[section.kind];
          return (
            <div key={section.kind}>
              <h3 className="flex items-center gap-2 text-sm font-bold text-fg">
                <Icon size={16} className="text-accent" aria-hidden="true" />
                {bt(...label)}
                <span className="text-xs font-medium text-fg-3">{section.total}</span>
              </h3>
              <ul className="mt-3 space-y-2">
                {section.items.map((item) => (
                  <li key={`${section.kind}:${item.id}`}>
                    <Link
                      href={item.href}
                      className="block rounded-xl border border-line bg-card/60 px-3.5 py-3 transition-colors hover:border-accent/50"
                    >
                      <span className="block truncate text-sm font-semibold text-fg">{item.title}</span>
                      {item.description ? (
                        <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-fg-3">{item.description}</span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
              {section.moreHref && section.total > section.items.length ? (
                <Link
                  href={section.moreHref}
                  className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-xs font-bold text-accent"
                >
                  {bt(...label)} {bt("전체 보기", "view all")}
                  <ArrowRight size={13} aria-hidden="true" />
                </Link>
              ) : null}
            </div>
          );
        })}
      </div>

      {assetsLinkOnly?.moreHref ? (
        <Link
          href={assetsLinkOnly.moreHref}
          className="mt-6 flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-line px-4 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-accent"
        >
          <Store size={16} className="text-accent" aria-hidden="true" />
          {bt("소재 마켓에서", "In the asset market")} ‘{trimmed}’ {bt("찾기", "search")}
          <ArrowRight size={14} aria-hidden="true" className="ml-auto" />
        </Link>
      ) : null}
    </section>
  );
}
