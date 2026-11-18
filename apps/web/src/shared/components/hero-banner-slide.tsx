import { ArrowRight } from "lucide-react";

import { AvailabilityDots } from "./availability";
import { TitlePoster } from "./title-poster";
import { GenreChip } from "./ui/chip";
import { RatingInline } from "./ui/stars";

import type { Title } from "@/shared/lib/types";

import { proxiedCoverSrc } from "@/shared/lib/cover-proxy";
import { statsAreEstimated } from "@/shared/lib/estimate";
import { formatCount } from "@/shared/lib/format";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export const HERO_BANNER_AUTOPLAY_MS = 5500;

export function HeroBannerSlide({ title }: { title: Title }) {
  // 19+ 작품은 흐릿한 배경 표지 레이어도 노출하지 않는다(hero-banner-static와 동일 가드).
  const isRestricted = title.ageRating === "19";
  const openLabel = translateBilingualValueForActiveLocale("hero-banner-slide", "작품 보기", "View story");
  const viewsSuffix = translateBilingualValueForActiveLocale("hero-banner-slide", "조회", "views");
  const artPrefix = translateBilingualValueForActiveLocale("hero-banner-slide", "그림", "Art");

  return (
    <Link href={`/title/${title.slug}`} className="group/slide relative block">
      <div className="absolute inset-0 overflow-hidden" aria-hidden>
        {title.coverImage && !isRestricted ? (
          <img
            src={proxiedCoverSrc(title.coverImage)}
            alt=""
            loading="lazy"
            className="size-full scale-105 object-cover opacity-[0.12] blur-xl"
          />
        ) : null}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, var(--color-card) 18%, color-mix(in oklch, var(--color-card) 88%, transparent) 62%, color-mix(in oklch, var(--color-card) 72%, transparent))",
          }}
        />
      </div>

      <div className="relative grid grid-cols-[4.5rem_1fr] items-center gap-4 p-4 sm:grid-cols-[11rem_1fr] sm:gap-6 sm:p-6">
        <div className="ink-cover ink-sheen overflow-hidden rounded-xl border border-line">
          <TitlePoster title={title} size="lg" priority unframed titleAs="div" />
        </div>

        <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
          <div className="flex flex-wrap gap-1.5">
            {title.genres.slice(0, 2).map((genre) => (
              <GenreChip key={genre} genre={genre} size="sm" />
            ))}
          </div>
          <div className="text-pretty text-lg font-semibold leading-tight text-fg [word-break:keep-all] sm:text-2xl lg:text-[1.75rem]">
            {title.title}
          </div>
          <p className="truncate text-xs text-fg-2">
            {title.author}
            {title.artist && title.artist !== title.author ? ` · ${artPrefix} ${title.artist}` : ""}
          </p>
          <RatingInline
            value={title.stats.ratingAvg}
            count={title.stats.ratingCount}
            estimated={statsAreEstimated(title)}
            size="sm"
          />
          <p className="line-clamp-1 max-w-prose text-[0.8125rem] leading-relaxed text-fg-2 sm:line-clamp-2 sm:text-sm">
            {title.editorNote ?? title.synopsis}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
            <AvailabilityDots availability={title.availability} max={4} />
            <span className="numeral text-xs tabular-nums text-fg-2">
              {statsAreEstimated(title) && <span aria-hidden>≈</span>}
              {formatCount(title.stats.views)} {viewsSuffix}
            </span>
            <span className="ink-arrow ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-on-accent transition-colors duration-150 group-hover/slide:bg-accent-2 motion-reduce:transition-none">
              {openLabel}
              <ArrowRight size={14} strokeWidth={1.5} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
