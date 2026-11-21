import "./discover-hub-layout.css";
import "./discover-mood-curator.css";

import { ArrowRight, Star } from "lucide-react";
import { useRef, useState, type CSSProperties, type PointerEvent } from "react";

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

/** 표지를 불러오지 못했을 때 쓰는 테마 토큰 그라데이션 + 첫 글자. 작품 데이터의 임의 색은 쓰지 않는다. */
function PosterFallback({ title, className }: { readonly title: Title; readonly className?: string }) {
  const glyph = title.title.replace(/[^가-힣A-Za-z0-9]/gu, "").charAt(0) || "T";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-full place-items-center bg-[linear-gradient(150deg,color-mix(in_oklch,var(--color-accent)_32%,var(--color-panel)),color-mix(in_oklch,var(--color-cool)_18%,var(--color-canvas)))] font-display font-semibold text-fg/70",
        className,
      )}
    >
      {glyph}
    </span>
  );
}

function Poster({
  title,
  className,
  glyphClassName,
  priority,
  zoomEnter = false,
}: {
  readonly title: Title;
  readonly className?: string;
  readonly glyphClassName?: string;
  readonly priority?: boolean;
  readonly zoomEnter?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      data-ink-enter={zoomEnter ? "zoom" : undefined}
      className={cn("ink-cover ink-sheen relative block overflow-hidden border border-line bg-panel", className)}
    >
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
  const articleRef = useRef<HTMLElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
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
  const stageCandidates = [lead, ...more.slice(0, 2)];
  const safeIndex = selectedIndex < stageCandidates.length ? selectedIndex : 0;
  const active = stageCandidates[safeIndex] ?? lead;
  const rating = active.stats.ratingAvg;
  const meta = [
    active.author,
    active.genres.slice(0, 2).join("·"),
    bt(...STATUS_LABEL[active.status]),
  ]
    .filter(Boolean)
    .join(" · ");

  const handlePointerMove = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    const node = articleRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = (event.clientX - rect.left) / rect.width - 0.5;
    const ny = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tilt-rx", `${(-ny * 2.4).toFixed(2)}deg`);
    node.style.setProperty("--tilt-ry", `${(nx * 2.8).toFixed(2)}deg`);
  };

  const handlePointerLeave = () => {
    const node = articleRef.current;
    if (!node) return;
    node.style.setProperty("--tilt-rx", "0deg");
    node.style.setProperty("--tilt-ry", "0deg");
  };

  return (
    <article
      ref={articleRef}
      aria-labelledby="discover-spotlight-title"
      data-discover-spotlight=""
      data-ink-enter="panel"
      style={{ "--ink-radius": "16px" } as CSSProperties}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      className="discover-spotlight ink-stage-tilt"
    >
      <div className="discover-spotlight-stage">
        <span aria-hidden="true" className="discover-spotlight__prism-rim" />
        <Poster
          key={active.id}
          title={active}
          priority
          zoomEnter={safeIndex === 0}
          className="discover-spotlight-art discover-spotlight-art-fade"
          glyphClassName="text-7xl"
        />
        <span aria-hidden="true" className="discover-spotlight-scrim" />
        <div className="discover-spotlight-copy">
          <div key={`copy-${active.id}`} className="ink-cascade flex w-full flex-col items-start">
            <div className="discover-spotlight-topline">
              <p className="discover-spotlight-kicker">
                <span className="font-display tabular-nums text-fg-3">
                  {String(safeIndex + 1).padStart(2, "0")}
                </span>
                <span>{bt("오늘 만날 이야기", "Today's story")}</span>
              </p>
              {rating > 0 ? (
                <span
                  className="discover-spotlight-rating tabular-nums"
                  aria-label={bt(`평균 평점 ${rating.toFixed(1)}`, `Average rating ${rating.toFixed(1)}`)}
                >
                  <Star size={13} strokeWidth={1.5} aria-hidden="true" />
                  {rating.toFixed(1)}
                </span>
              ) : null}
            </div>
            <h2 id="discover-spotlight-title">{active.title}</h2>
            <p className="discover-spotlight-meta">{meta}</p>
            {active.synopsis ? <p className="discover-spotlight-synopsis">{active.synopsis}</p> : null}
          </div>
          <div className="discover-spotlight-cta-row">
            <Link
              href={`/title/${active.slug}`}
              aria-label={bt(`${active.title} 작품 보기`, `View ${active.title}`)}
              className="discover-spotlight-action ink-arrow"
            >
              {bt("작품 보기", "View story")}
              <ArrowRight size={16} strokeWidth={1.5} aria-hidden="true" />
            </Link>
            {stageCandidates.length > 1 ? (
              <div
                role="group"
                aria-label={bt("대표 추천 전환", "Switch featured story")}
                className="discover-spotlight-switcher"
              >
                {stageCandidates.map((candidate, idx) => {
                  const current = idx === safeIndex;
                  const slotNumber = String(idx + 1).padStart(2, "0");
                  return (
                    <button
                      key={candidate.id}
                      type="button"
                      aria-pressed={current}
                      aria-label={bt(
                        `${slotNumber} 추천: ${candidate.title}`,
                        `${slotNumber} Featured: ${candidate.title}`,
                      )}
                      onClick={() => setSelectedIndex(idx)}
                      onKeyDown={(event) => {
                        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                        event.preventDefault();
                        const nextIdx =
                          (idx + (event.key === "ArrowRight" ? 1 : -1) + stageCandidates.length)
                          % stageCandidates.length;
                        setSelectedIndex(nextIdx);
                      }}
                      className="discover-spotlight-switch-btn font-display tabular-nums"
                    >
                      {slotNumber}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {more.length > 0 ? (
        <details className="discover-spotlight-more">
          <summary>
            {bt("함께 추천하는 작품", "More story picks")}
            <span aria-hidden="true">＋</span>
          </summary>
          <ul className="discover-spotlight-more-list">
            {more.map((title) => (
              <li key={title.id}>
                <Link href={`/title/${title.slug}`} className="discover-spotlight-more-link ink-frame">
                  <Poster title={title} className="aspect-[3/4] w-10 shrink-0 rounded-lg" glyphClassName="text-sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{title.title}</span>
                    <span className="block truncate text-xs text-fg-2">
                      {(Array.isArray(title.genres) ? title.genres : []).slice(0, 2).join("·")}
                    </span>
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
