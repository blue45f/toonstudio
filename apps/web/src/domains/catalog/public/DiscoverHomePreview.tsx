import "./discover-home-preview.css";

import { ArrowRight, ChevronDown } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { useApiResource } from "@/platform/use-api-resource";
import { CoverImage } from "@/shared/components/cover-image";
import { coverStandardSrcSet } from "@/shared/lib/cover-proxy";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import type { Title } from "@/shared/lib/types";
import Link from "@/shared/navigation/router-link";

import {
  DISCOVER_HOME_SNAPSHOT_URL,
  DISCOVER_HUB_HREF,
  buildDiscoverShelves,
  pickDiscoverSpotlight,
  type DiscoverHomeSnapshot,
} from "../discover-home";

const LazyDiscoverWeekdayRail = lazy(() => import("../DiscoverWeekdayRail").then(
  ({ DiscoverWeekdayRail }) => ({ default: DiscoverWeekdayRail }),
));

const cardLimit = 3;
const coverSizes = "(max-width: 744px) calc(50vw - 24px), min(calc(33vw - 25px), 27rem)";

function HomeStoryCard({ title }: { readonly title: Title }) {
  const glyph = title.title.replace(/[^가-힣A-Za-z0-9]/gu, "").charAt(0) || "T";
  const restricted = title.ageRating === "19";
  const fallback = <span className="discover-home-cover-fallback">{restricted ? "19+" : glyph}</span>;
  return (
    <li>
      <Link
        href={`/title/${encodeURIComponent(title.slug)}`}
        data-route-return-focus={`catalog-title:${title.id}`}
        className="discover-home-story"
      >
        <span className="discover-home-cover" aria-hidden={!restricted}>
          {title.coverImage && !restricted ? (
            <CoverImage
              src={title.coverImage}
              alt=""
              sizes={coverSizes}
              srcSet={coverStandardSrcSet(title.coverImage)}
              fallback={fallback}
              className="discover-home-cover-image"
            />
          ) : fallback}
        </span>
        <span className="discover-home-story-copy">
          <strong>{title.title}</strong>
          {title.author ? <small>{title.author}</small> : null}
        </span>
      </Link>
    </li>
  );
}

/** 홈에서 탐색·작품으로 한 번에 들어가고 요일 연재는 필요한 때 펼칩니다. */
export function DiscoverHomePreview() {
  const bt = useBilingual("DiscoverHomePreview");
  const [weekdayOpen, setWeekdayOpen] = useState(false);
  const home = useApiResource<DiscoverHomeSnapshot>(
    DISCOVER_HOME_SNAPSHOT_URL,
    bt("추천 작품을 불러오지 못했습니다.", "Couldn't load story picks."),
  );
  const snapshot = home.data;
  const spotlight = snapshot ? pickDiscoverSpotlight(snapshot) : null;
  const weekday = snapshot ? buildDiscoverShelves(snapshot).find((shelf) => shelf.id === "weekday") : undefined;
  const titles: Title[] = [];
  for (const title of [...(spotlight ? [spotlight.lead, ...spotlight.more] : []), ...(weekday?.titles ?? [])]) {
    if (titles.length >= cardLimit) break;
    if (!title.slug?.trim() || titles.some((item) => item.id === title.id || item.slug === title.slug)) continue;
    titles.push(title);
  }
  if (!home.loading && titles.length === 0) return null;

  const previewTitle = bt("읽을 이야기 미리보기", "Stories to read");
  const viewAllLabel = bt("전체 보기", "View all");
  const loadingLabel = bt("추천 작품을 불러오는 중", "Loading story picks");

  return (
    <section aria-labelledby="discover-home-preview-title" className="discover-home-preview">
      <div className="discover-home-heading" data-section-heading="">
        <h2 id="discover-home-preview-title" data-section-title="">
          {previewTitle}
        </h2>
        <Link
          href={DISCOVER_HUB_HREF}
          data-section-action=""
          className="discover-home-more ink-arrow"
          aria-label={`${previewTitle} ${viewAllLabel}`}
        >
          {viewAllLabel}
          <ArrowRight size={15} strokeWidth={1.6} aria-hidden="true" />
        </Link>
      </div>
      {titles.length ? (
        <ul className="discover-home-stories" data-count={titles.length}>
          {titles.map((title) => <HomeStoryCard key={title.id} title={title} />)}
        </ul>
      ) : (
        <div className="discover-home-stories" role="status" aria-busy="true" aria-label={loadingLabel}>
          {[0, 1, 2].map((index) => (
            <span key={index} className="discover-home-story-loading skeleton" aria-hidden="true" />
          ))}
        </div>
      )}
      {weekday && snapshot ? (
        <details className="discover-home-weekday" onToggle={(event) => {
          if (event.target === event.currentTarget) setWeekdayOpen(event.currentTarget.open);
        }}>
          <summary>
            {bt("요일 연재 보기", "Show weekday series")}
            <ChevronDown size={15} aria-hidden="true" />
          </summary>
          {weekdayOpen ? (
            <Suspense fallback={<p role="status">{loadingLabel}</p>}>
              <LazyDiscoverWeekdayRail snapshot={snapshot} loading={false} actionLabel={viewAllLabel} />
            </Suspense>
          ) : null}
        </details>
      ) : null}
    </section>
  );
}
