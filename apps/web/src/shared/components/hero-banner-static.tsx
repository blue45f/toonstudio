import { restStatusText } from "../rest-status-i18n";
import { ArrowRight } from "lucide-react";

import { HeroBannerBadge } from "./hero-banner-badge";

import type { Title } from "@/shared/lib/types";

import { proxiedCoverSrc } from "@/shared/lib/cover-proxy";
import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

export function HeroBannerStatic({
  items,
  onActivate,
}: {
  items: Title[];
  onActivate?: () => void;
}) {
  const first = items[0];
  if (!first) return null;

  const isRestricted = first.ageRating === "19";
  const [coverFrom, coverTo] = first.cover;
  const glyph = first.title.replace(/[^가-힣A-Za-z0-9]/g, "").charAt(0) || "W";
  const typeBadge = isRestricted
    ? "19+"
    : first.type === "webnovel"
      ? translateBilingualValueForActiveLocale("hero-banner-static", "웹소설", "Web novel")
      : translateBilingualValueForActiveLocale("hero-banner-static", "웹툰", "Webtoon");
  const openLabel = translateBilingualValueForActiveLocale("hero-banner-static", "작품 보기", "View story");
  const groupLabel = translateBilingualValueForActiveLocale("hero-banner-static", "이 주의 추천 작품", "Featured stories");

  return (
    <div
      className="group relative"
      role="group"
      aria-label={groupLabel}
      onPointerEnter={onActivate}
      onFocusCapture={onActivate}
    >
      <HeroBannerBadge />

      <div className="overflow-hidden rounded-2xl border border-line bg-card">
        <Link href={`/title/${first.slug}`} className="group/slide relative block">
          <div className="absolute inset-0 overflow-hidden" aria-hidden>
            {first.coverImage && !isRestricted ? (
              <img
                src={proxiedCoverSrc(first.coverImage)}
                alt=""
                loading="eager"
                fetchPriority="high"
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
            <div
              className="ink-cover ink-sheen relative aspect-[3/4] overflow-hidden rounded-xl border border-line"
              style={{
                background: `linear-gradient(145deg, color-mix(in oklch, ${coverFrom} 88%, var(--color-panel)), color-mix(in oklch, ${coverTo} 82%, var(--color-canvas)))`,
              }}
            >
              {first.coverImage && !isRestricted ? (
                <img
                  src={proxiedCoverSrc(first.coverImage)}
                  alt={`${first.title} 표지`}
                  loading="eager"
                  fetchPriority="high"
                  className="absolute inset-0 size-full object-cover"
                />
              ) : (
                <div
                  className="absolute -right-3 top-1 select-none font-display text-[7.4rem] font-semibold leading-none text-fg/15 mix-blend-overlay"
                  aria-hidden
                >
                  {glyph}
                </div>
              )}
              <div className="absolute inset-0 bg-[linear-gradient(to_top,color-mix(in_oklch,var(--color-canvas)_88%,transparent),transparent_52%)]" />
              <div className="absolute left-0 top-0 flex items-center gap-1.5 p-3">
                <span className="rounded-md border border-line bg-canvas/75 px-1.5 py-0.5 text-xs font-medium text-fg backdrop-blur-sm [-webkit-backdrop-filter:blur(4px)]">
                  {typeBadge}
                </span>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="line-clamp-3 text-lg font-semibold leading-tight text-fg [word-break:keep-all]">
                  {first.title}
                </div>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-2 sm:gap-3">
              <div className="flex flex-wrap gap-1.5">
                {first.genres.slice(0, 2).map((genre) => (
                  <span
                    key={genre}
                    className="rounded-md border border-line bg-panel px-2 py-0.5 text-xs font-medium text-fg-2"
                  >
                    {genre}
                  </span>
                ))}
              </div>
              <div className="text-pretty text-lg font-semibold leading-tight text-fg [word-break:keep-all] sm:text-2xl lg:text-[1.75rem]">
                {first.title}
              </div>
              <p className="truncate text-xs text-fg-2">
                {first.author}
                {first.artist && first.artist !== first.author ? ` · 그림 ${first.artist}` : ""}
              </p>
              <p className="line-clamp-1 max-w-prose text-[0.8125rem] leading-relaxed text-fg-2 sm:line-clamp-2 sm:text-sm">
                {first.editorNote ?? first.synopsis}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="rounded-md border border-line bg-panel px-2.5 py-1 text-xs font-medium tabular-nums text-fg-2">
                  {first.availability.length > 0 ? `${first.availability.length}개 플랫폼` : restStatusText("rest.status.hero.platformChecking", "플랫폼 확인 중")}
                </span>
                <span className="ink-arrow ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-medium text-on-accent transition-colors duration-150 group-hover/slide:bg-accent-2 motion-reduce:transition-none">
                  {openLabel}
                  <ArrowRight size={14} strokeWidth={1.5} />
                </span>
              </div>
            </div>
          </div>
        </Link>
      </div>

      {items.length > 1 && (
        <div className="relative mt-3 flex items-center justify-center gap-1.5" aria-hidden="true">
          {items.slice(0, 6).map((title, index) => (
            <span
              key={title.id}
              className={index === 0 ? "h-1.5 w-5 rounded-full bg-accent" : "size-1.5 rounded-full bg-line"}
            />
          ))}
        </div>
      )}
    </div>
  );
}
