import { EyeOff, Heart } from "lucide-react";
import { useState } from "react";

import { ReviewReplies } from "./review-replies";

import type { SeedReview, Title } from "@/shared/lib/types";

import { Badge } from "@/shared/components/ui/chip";
import { Stars } from "@/shared/components/ui/stars";
import { useT } from "@/shared/lib/i18n";
import { useApp, useHydrated } from "@/shared/lib/store";
import { cn, relativeDate } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const PROGRESS_TONE: Record<string, "good" | "accent" | "neutral" | "bad"> = {
  완독: "good",
  정주행중: "accent",
  "정주행 예정": "neutral",
  하차: "bad",
};

const PROGRESS_LABEL_KEY: Record<string, string> = {
  완독: "review.progress.complete",
  정주행중: "review.progress.binge",
  "정주행 예정": "review.progress.upcoming",
  하차: "review.progress.abandoned",
};

export function ReviewCard({
  review,
  title,
  showTitle,
  enableReplies = false,
  className,
}: {
  review: SeedReview;
  title?: Title;
  showTitle?: boolean;
  enableReplies?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const hydrated = useHydrated();
  const liked = useApp((s) => s.likedReviews[review.id]);
  const toggleLike = useApp((s) => s.toggleLikeReview);
  const t = useT();
  const likeCount = review.likes + (hydrated && liked ? 1 : 0);
  const hideText = review.spoiler && !revealed;
  const profileHref = review.userId ? `/u/${review.userId}` : null;

  const avatar = (
    <span
      aria-hidden="true"
      className="grid size-8 shrink-0 place-items-center rounded-full border border-line bg-raised text-xs font-semibold text-fg"
    >
      {review.author.charAt(0)}
    </span>
  );

  return (
    <article
      className={cn(
        "ink-frame flex flex-col gap-3.5 rounded-2xl border border-line bg-card/85 p-5 transition-colors duration-150 hover:bg-card motion-reduce:transition-none",
        className,
      )}
    >
      {showTitle && title ? (
        <Link
          href={`/title/${title.slug}`}
          className="inline-flex w-fit max-w-full items-center gap-2 rounded-lg border border-line/70 bg-panel/65 px-2.5 py-1 text-xs text-fg-2 transition-colors duration-150 hover:border-line-strong hover:text-fg motion-reduce:transition-none"
        >
          <span
            aria-hidden="true"
            className="size-3.5 shrink-0 rounded-sm border border-line/50"
            style={{ background: title.cover[0] || "var(--color-raised)" }}
          />
          <span className="truncate font-medium">{title.title}</span>
        </Link>
      ) : null}

      <blockquote className="relative border-l-2 border-accent/45 pl-3.5">
        <p
          aria-hidden={hideText}
          className={cn(
            "text-pretty text-[0.9375rem] leading-7 text-fg transition-[filter] duration-150 [word-break:keep-all] motion-reduce:transition-none",
            hideText && "select-none blur-[6px]",
          )}
        >
          {review.text}
        </p>
        {hideText ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            aria-label={t("review.spoilerRevealLabel")}
            className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-card/75 text-xs font-medium text-fg-2 transition-colors duration-150 hover:text-fg motion-reduce:transition-none"
          >
            <EyeOff size={14} aria-hidden="true" />
            {t("review.spoilerRevealLabel")}
          </button>
        ) : null}
      </blockquote>

      <header className="flex items-center gap-2.5 border-t border-line/70 pt-3">
        {profileHref ? (
          <Link href={profileHref} className="shrink-0 transition-opacity duration-150 hover:opacity-80 motion-reduce:transition-none">
            {avatar}
          </Link>
        ) : (
          avatar
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {profileHref ? (
              <Link
                href={profileHref}
                className="truncate text-xs font-medium text-fg transition-colors duration-150 hover:text-accent motion-reduce:transition-none"
              >
                {review.author}
              </Link>
            ) : (
              <span className="truncate text-xs font-medium text-fg">{review.author}</span>
            )}
            {review.progress ? (
              <Badge tone={PROGRESS_TONE[review.progress] ?? "neutral"}>
                {t(PROGRESS_LABEL_KEY[review.progress] ?? "review.progress.unknown")}
              </Badge>
            ) : null}
          </div>
          <span className="text-[11px] text-fg-3">{relativeDate(review.createdAt)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Stars value={review.rating} size="sm" />
          <span className="text-xs font-medium tabular-nums text-fg-2">{review.rating.toFixed(1)}</span>
        </div>
      </header>

      <footer className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map((tag) => (
            <span key={tag} className="rounded-md border border-line bg-panel/60 px-1.5 py-0.5 text-xs text-fg-3">
              {tag}
            </span>
          ))}
        </div>
        <button
          type="button"
          onClick={() => toggleLike(review.id)}
          className={cn(
            "ml-auto flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium tabular-nums transition-colors duration-150 motion-reduce:transition-none",
            hydrated && liked ? "text-accent" : "text-fg-3 hover:bg-raised hover:text-fg-2",
          )}
        >
          <Heart size={14} className={hydrated && liked ? "fill-accent" : ""} aria-hidden="true" />
          <span>{likeCount.toLocaleString("ko-KR")}</span>
        </button>
      </footer>

      {enableReplies ? <ReviewReplies reviewId={review.id} /> : null}
    </article>
  );
}
