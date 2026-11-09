import { BookOpen, ChevronDown, ChevronRight, Compass, GraduationCap, Store } from "lucide-react";

import { unifiedAssetsMoreHref, unifiedCoursesMoreHref, unifiedHelpMoreHref } from "@/shared/components/unified-search";
import { UnifiedSearchSections } from "@/shared/components/unified-search-sections";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/** 작품 결과 뒤에서 전용 검색으로 바로 이동하고 세부 통합 결과는 선택해 펼친다. */
export function SearchOtherTypes({ query }: { readonly query: string }) {
  const bt = useBilingual("SearchOtherTypes");
  const trimmed = query.trim();
  const destinations = [
    { label: bt("강좌", "Courses"), icon: GraduationCap, href: unifiedCoursesMoreHref(trimmed) },
    { label: bt("매뉴얼", "Manual"), icon: BookOpen, href: unifiedHelpMoreHref() },
    { label: bt("페이지", "Pages"), icon: Compass, href: `/sitemap?menu=${encodeURIComponent(trimmed)}` },
    { label: bt("소재", "Assets"), icon: Store, href: unifiedAssetsMoreHref(trimmed) },
  ];
  return (
    <section className="search-other-types" aria-label={bt("다른 유형에서도 찾기", "Also in other types")}>
      <h2 className="text-sm font-bold text-fg">{bt("다른 유형에서도 찾기", "Also in other types")}</h2>
      <nav className="search-other-types-links" aria-label={bt("유형별 검색 바로가기", "Search by content type")}>
        {destinations.map(({ label, icon: Icon, href }) => (
          <Link key={href} href={href} className="search-other-types-link">
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
            <ChevronRight size={14} aria-hidden="true" />
          </Link>
        ))}
      </nav>
      {trimmed ? (
        <details className="search-page-tools search-other-types-details" data-testid="search-other-types-details">
          <summary className="search-page-tools-summary">
            <span>{bt("같은 검색어의 통합 결과 펼치기", "Expand results for the same query")}</span>
            <ChevronDown size={18} aria-hidden="true" className="search-page-tools-chevron" />
          </summary>
          <div className="search-other-types-results">
            <UnifiedSearchSections query={query} />
          </div>
        </details>
      ) : null}
    </section>
  );
}
