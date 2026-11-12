import { ArrowRight } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import { CoverImage } from "@/shared/components/cover-image";
import { coverStandardSrcSet } from "@/shared/lib/cover-proxy";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useApp, useHydrated } from "@/shared/lib/store";
import { useApiResource } from "@/platform/use-api-resource";
import Link from "@/shared/navigation/router-link";

import { orderTitlesByIds } from "./discover-home";
import { useLocalCatalogFallback } from "./local-catalog-fallback";

/** 현재 기기에 남은 방문 기록만 사용하며, 읽기 진도로 해석하지 않는다. */
export const DISCOVER_RECENT_LIMIT = 10;

export function DiscoverRecentShelf() {
  const bt = useBilingual("DiscoverRecentShelf");
  const hydrated = useHydrated();
  const recentlyViewed = useApp((state) => state.recentlyViewed);
  const ids = hydrated ? recentlyViewed.slice(0, DISCOVER_RECENT_LIMIT) : [];
  const key = ids.join(",");
  const recentPath = key ? `/api/titles?ids=${encodeURIComponent(key)}` : null;
  const apiState = useApiResource<{ readonly items?: readonly Title[] }>(
    recentPath,
    bt("최근 본 작품을 불러오지 못했습니다.", "Couldn't load recently viewed stories."),
  );
  const { data, loading, error, reload } = useLocalCatalogFallback(recentPath, apiState);
  const titles = orderTitlesByIds(ids, data?.items ?? []);
  if (ids.length === 0) return null;

  const heading = bt("최근 본 작품", "Recently viewed");
  return (
    <section className="discover-recent-shelf" aria-labelledby="discover-recent-title">
      <header className="discover-recent-heading">
        <h2 id="discover-recent-title">{heading}</h2>
        <Link href="/library">{bt("내 서재", "My library")}<ArrowRight size={15} aria-hidden="true" /></Link>
      </header>
      {error ? (
        <div role="alert" className="discover-recent-state">
          <p>{bt("최근 본 작품 정보를 불러오지 못했어요.", "Couldn't load recently viewed stories.")}</p>
          <button type="button" onClick={reload}>{bt("다시 시도", "Try again")}</button>
        </div>
      ) : null}
      {loading && titles.length === 0 && !error ? (
        <div role="status" aria-busy="true" aria-label={bt("최근 본 작품을 불러오는 중", "Loading recently viewed stories")} className="discover-recent-loading">
          <span className="skeleton" aria-hidden="true" />
          <span className="skeleton" aria-hidden="true" />
        </div>
      ) : titles.length === 0 ? (
        !error ? <p role="status" className="discover-recent-state">{bt("이전에 본 작품 정보를 찾을 수 없어요. 내 서재에서 다른 작품을 확인해 주세요.", "These previously viewed stories aren't available. Find other stories in your library.")}</p> : null
      ) : (
        <ul aria-label={heading} className="discover-recent-list">
          {titles.map((title) => {
            const fallback = <span className="discover-recent-fallback">{title.title.replace(/[^가-힣A-Za-z0-9]/gu, "").charAt(0) || "T"}</span>;
            return (
              <li key={title.id}>
                <Link href={`/title/${title.slug}`} className="discover-recent-link">
                  <span className="discover-recent-art" aria-hidden="true">
                    {title.coverImage ? (
                      <CoverImage src={title.coverImage} alt="" srcSet={coverStandardSrcSet(title.coverImage)} sizes="3.5rem" className="size-full object-cover" fallback={fallback} />
                    ) : fallback}
                  </span>
                  <span className="discover-recent-copy">
                    <strong>{title.title}</strong>
                    <span>{bt("작품으로 돌아가기", "Return to story")}<ArrowRight size={16} aria-hidden="true" /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
