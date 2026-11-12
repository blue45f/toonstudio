import "./discover-hub-layout.css";

import { ArrowRight, Star } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import { CoverImage } from "@/shared/components/cover-image";
import { coverStandardSrcSet } from "@/shared/lib/cover-proxy";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

import { pickDiscoverSpotlight, type DiscoverHomeSnapshot } from "./discover-home";

type SerialStatus = Title["status"];

const STATUS_LABEL: Record<SerialStatus, readonly [string, string]> = {
  ongoing: ["연재중", "Ongoing"],
  completed: ["완결", "Completed"],
  hiatus: ["휴재", "On hiatus"],
};

/** 표지를 불러오지 못했을 때 쓰는 스타라이트 토큰 그라데이션 + 첫 글자. 작품 데이터의 임의 색은 쓰지 않는다. */
function PosterFallback({ title, className }: { readonly title: Title; readonly className?: string }) {
  const glyph = title.title.replace(/[^가-힣A-Za-z0-9]/gu, "").charAt(0) || "T";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-full place-items-center bg-[linear-gradient(150deg,color-mix(in_oklch,var(--color-accent)_42%,var(--color-panel)),color-mix(in_oklch,var(--color-cool)_28%,var(--color-canvas)))] font-display font-bold text-fg/70",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

function Poster({ title, className, glyphClassName, priority }: {
  readonly title: Title;
  readonly className?: string;
  readonly glyphClassName?: string;
  readonly priority?: boolean;
}) {
  return (
    <span aria-hidden="true" className={cn("relative block overflow-hidden border border-line bg-panel", className)}>
      {title.coverImage ? (
        <CoverImage
          src={title.coverImage}
          alt=""
          priority={priority}
          srcSet={coverStandardSrcSet(title.coverImage)}
          sizes={priority ? "(max-width: 639px) 70vw, (max-width: 1023px) 45vw, 42rem" : "3rem"}
          className="absolute inset-0 size-full object-cover"
          fallback={<PosterFallback title={title} className={glyphClassName} />}
        />
      ) : (
        <PosterFallback title={title} className={glyphClassName} />
      )}
    </span>
  );
}

export interface DiscoverSpotlightProps {
  readonly snapshot: DiscoverHomeSnapshot | null;
  readonly loading: boolean;
}

/** 실제 대표작 이미지를 먼저 보여 주며, 회차를 추정하지 않고 작품 상세로 연결한다. */
export function DiscoverSpotlight({ snapshot, loading }: DiscoverSpotlightProps) {
  const bt = useBilingual("DiscoverSpotlight");
  const pick = snapshot ? pickDiscoverSpotlight(snapshot) : null;

  if (!pick) {
    if (!loading) return null;
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={bt("대표 작품을 불러오는 중", "Loading the featured story")}
        className="discover-spotlight-loading"
      >
        <div className="discover-spotlight-loading-art skeleton" aria-hidden="true" />
        <div className="discover-spotlight-loading-copy" aria-hidden="true">
          <span data-slot="skeleton" className="skeleton block h-4 w-24 rounded" />
          <span data-slot="skeleton" className="skeleton mt-3 block h-8 w-4/5 rounded" />
          <span data-slot="skeleton" className="skeleton mt-3 block h-4 w-3/5 rounded" />
        </div>
      </div>
    );
  }

  const { lead, more } = pick;
  const rating = lead.stats.ratingAvg;
  const meta = [lead.author, lead.genres.slice(0, 2).join("·"), bt(...STATUS_LABEL[lead.status])].filter(Boolean).join(" · ");

  return (
    <article
      aria-labelledby="discover-spotlight-title"
      data-discover-spotlight=""
      className="discover-spotlight"
    >
      <div className="discover-spotlight-stage">
        <Poster title={lead} priority className="discover-spotlight-art" glyphClassName="text-7xl" />
        <span aria-hidden="true" className="discover-spotlight-scrim" />
        <div className="discover-spotlight-copy">
          <div className="discover-spotlight-topline">
            <p className="discover-spotlight-kicker">{bt("오늘 만날 이야기", "Today's story")}</p>
            {rating > 0 ? (
              <span className="discover-spotlight-rating" aria-label={bt(`평균 평점 ${rating.toFixed(1)}`, `Average rating ${rating.toFixed(1)}`)}>
                <Star size={13} aria-hidden="true" />{rating.toFixed(1)}
              </span>
            ) : null}
          </div>
          <h2 id="discover-spotlight-title">{lead.title}</h2>
          <p className="discover-spotlight-meta">{meta}</p>
          {lead.synopsis ? <p className="discover-spotlight-synopsis">{lead.synopsis}</p> : null}
          <Link
            href={`/title/${lead.slug}`}
            aria-label={bt(`${lead.title} 작품 보기`, `View ${lead.title}`)}
            className="discover-spotlight-action"
          >
            {bt("작품 보기", "View story")}<ArrowRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
      {more.length > 0 ? (
        <details className="discover-spotlight-more">
          <summary>{bt("함께 추천하는 작품", "More story picks")}<span aria-hidden="true">＋</span></summary>
          <ul className="discover-spotlight-more-list">
            {more.map((title) => (
              <li key={title.id}>
                <Link href={`/title/${title.slug}`} className="discover-spotlight-more-link">
                  <Poster title={title} className="aspect-[3/4] w-10 shrink-0 rounded-lg" glyphClassName="text-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-fg">{title.title}</span>
                    <span className="block truncate text-xs text-fg-2">{(Array.isArray(title.genres) ? title.genres : []).slice(0, 2).join("·")}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
