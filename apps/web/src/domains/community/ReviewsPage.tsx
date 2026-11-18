import { communityStatusText } from "./community-status-i18n";
import { ChevronDown, MessageSquareQuote, PenLine, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ReviewCard } from "./components/review-card";
import { ReactionSummaryPanel } from "./reviews-components/reaction-summary-panel";
import { ReviewControls } from "./reviews-components/review-controls";
import { parseReviewRating, parseReviewSort } from "./reviews-components/review-query";
import { ReviewStatsSummary } from "./reviews-components/review-stats-summary";
import { TopReviewedList, type TopReviewedStatus } from "./reviews-components/top-reviewed-list";

import type { ReviewFeedItem, ReviewsResponse } from "@/shared/lib/types";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { fetchApiResource, useApiResource } from "@/platform/use-api-resource";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

/** 한 번에 가져오는 리뷰 수 — 무제한 렌더 방지용 페이지 크기. */
const REVIEWS_PAGE_SIZE = 30;
const SKELETON_CARD_COUNT = 9;

const REVIEWS_FETCH_ERROR = communityStatusText("community.status.reviews.loadFailed", "리뷰 데이터를 불러오지 못했습니다.");

interface FollowingPages {
  readonly base: ReviewsResponse;
  readonly items: readonly ReviewFeedItem[];
  readonly nextOffset: number | null;
}

function ReviewFeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid" aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-card/75 p-5">
          <span className="skeleton mb-3 block h-4 w-28 rounded-md" />
          <span className="skeleton mb-2 block h-4 w-full" />
          <span className="skeleton mb-3 block h-4 w-5/6" />
          <div className="flex items-center gap-2.5 border-t border-line/60 pt-3">
            <span className="skeleton size-8 rounded-full" />
            <span className="skeleton block h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewsPage() {
  const [searchParams] = useSearchParams();
  const t = useBilingual("domains.community.ReviewsPage");
  const sort = parseReviewSort(searchParams.get("sort"));
  const rating = parseReviewRating(searchParams.get("rating"));
  const spoilerHidden = searchParams.get("spoiler") === "hide";
  const summaryView = searchParams.get("view") === "summary";
  const baseParams = new URLSearchParams({ sort });
  if (spoilerHidden) baseParams.set("spoiler", "hide");
  if (rating !== "all") baseParams.set("rating", rating);
  const baseQuery = baseParams.toString();

  const { data, loading, error, reload } = useApiResource<ReviewsResponse>(
    `/api/reviews?${baseQuery}&limit=${REVIEWS_PAGE_SIZE}&offset=0`,
    REVIEWS_FETCH_ERROR,
  );

  const [following, setFollowing] = useState<FollowingPages | null>(null);
  const [moreFailedFor, setMoreFailedFor] = useState<ReviewsResponse | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);

  const current = data && following?.base === data ? following : null;
  const feed = useMemo<readonly ReviewFeedItem[]>(
    () => (data ? (current ? [...data.feed, ...current.items] : data.feed) : []),
    [current, data],
  );
  const nextOffset = current ? current.nextOffset : data?.nextOffset ?? null;
  const moreFailed = data !== null && moreFailedFor === data;

  const loadMore = useCallback(async () => {
    if (!data || nextOffset == null || loadingMoreRef.current) return;
    const base = data;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setMoreFailedFor(null);
    try {
      const page = await fetchApiResource<ReviewsResponse>(
        `/api/reviews?${baseQuery}&limit=${REVIEWS_PAGE_SIZE}&offset=${nextOffset}`,
        REVIEWS_FETCH_ERROR,
      );
      setFollowing((previous) => ({
        base,
        items: [...(previous?.base === base ? previous.items : []), ...page.feed],
        nextOffset: page.nextOffset,
      }));
    } catch {
      setMoreFailedFor(base);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [baseQuery, data, nextOffset]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || nextOffset == null) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "600px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, nextOffset]);

  const firstLoad = loading && !data;
  const topStatus: TopReviewedStatus = data ? "ready" : error ? "unavailable" : "loading";
  const [reviewLens, setReviewLens] = useState<
    "sentiment-polarity" | "spoiler-guard-nlp" | "binge-dropoff-heat" | "superfan-quote"
  >("sentiment-polarity");
  const [spoilerStrictness, setSpoilerStrictness] = useState<
    "strict-cut-level" | "episode-plot" | "open-discussion"
  >("strict-cut-level");

  return (
    <div>
      <Container size="wide" className="pt-6 sm:pt-8 lg:pt-10">
        <SiteContextualSubNav pathnameOverride="/reviews" className="mb-5" />
        <SitePageHeader
          surface="plain"
          icon={MessageSquareQuote}
          eyebrow={t("독자 리뷰", "Reader reviews")}
          title={t("독자들이 남긴 한 줄", "One line from every reader")}
          description={t(
            "정주행의 끝에서 누군가는 별점 대신 문장을 남겼습니다. 마음에 드는 작품을 찾았다면 작품 상세에서 감상을 남겨 보세요.",
            "At the end of a binge, some readers leave a sentence instead of a star. Found a story you love? Leave a note on its detail page.",
          )}
          actions={
            <Link
              href="/discover"
              className={buttonClass({ variant: "solid", size: "md", className: "min-h-11 gap-1.5 rounded-lg px-4 text-sm font-medium" })}
            >
              <PenLine size={15} aria-hidden="true" />
              {t("리뷰할 작품 찾기", "Find a story to review")}
            </Link>
          }
        >
          <ReviewStatsSummary stats={data?.stats ?? null} loading={firstLoad} />
        </SitePageHeader>
      </Container>

      <Container size="wide" className="py-8 lg:py-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_276px] lg:items-start">
          <section className="min-w-0 lg:order-1" aria-label={t("리뷰 피드", "Review feed")}>
            <div className="rail -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ReviewControls />
            </div>

            <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
              {data ? (
                <h2 className="text-sm font-normal text-fg-3" aria-live="polite">
                  <span className="font-medium tabular-nums text-fg-2">{data.stats.total.toLocaleString("ko-KR")}</span>
                  <span className="ml-1">{t("개의 리뷰", "reviews")}</span>
                  {feed.length < data.stats.total ? (
                    <span className="ml-1.5 tabular-nums">
                      · {formatI18nTemplate(t("{v0}개 표시", "showing {v0}"), { v0: feed.length.toLocaleString("ko-KR") })}
                    </span>
                  ) : null}
                </h2>
              ) : firstLoad ? (
                <p role="status" className="flex items-center gap-2 text-sm text-fg-3">
                  <span className="skeleton inline-block h-4 w-24" aria-hidden="true" />
                  <span className="sr-only">{t("리뷰를 불러오는 중", "Loading reviews")}</span>
                </p>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={reload}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-xs font-medium text-fg-2 transition-colors duration-150 hover:bg-raised hover:text-fg motion-reduce:transition-none"
              >
                <RefreshCw size={14} className={loading ? "animate-spin motion-reduce:animate-none" : ""} aria-hidden="true" />
                {t("갱신", "Refresh")}
              </button>
            </div>

            {firstLoad ? (
              <ReviewFeedSkeleton />
            ) : error && !data ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-panel/50 px-4 py-4 sm:px-5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-fg">{t("리뷰 데이터를 불러오지 못했습니다.", "Couldn't load reviews.")}</p>
                  <p className="mt-1 text-xs leading-relaxed text-fg-2">{error}</p>
                </div>
                <button
                  type="button"
                  onClick={reload}
                  className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-line bg-raised px-3.5 text-xs font-medium text-fg transition-colors duration-150 hover:border-accent/50 motion-reduce:transition-none"
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  {t("재시도", "Retry")}
                </button>
              </div>
            ) : feed.length === 0 ? (
              <ActionableEmptyState
                art="generic"
                icon={PenLine}
                title={t("아직 등록된 리뷰가 없습니다", "No reviews have been posted yet")}
                description={t(
                  "첫 리뷰를 남겨 보세요. 별점 대신 짧은 문장으로 작품의 첫인상을 남기면 바로 이 피드에 반영됩니다.",
                  "Be the first to leave a review. A short sentence about your first impression shows up right here in the feed.",
                )}
                primary={{ href: "/discover", label: t("작품 찾고 첫 리뷰 남기기", "Find a title and write the first review") }}
              />
            ) : (
              <>
                {summaryView ? (
                  <div key="summary" className="ink-cascade">
                    <ReactionSummaryPanel reviews={feed} />
                  </div>
                ) : (
                  <div
                    key={`${sort}-${rating}-${String(spoilerHidden)}`}
                    className="ink-cascade columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid"
                  >
                    {feed.map((review) => (
                      <ReviewCard key={review.id} review={review} title={review.title} showTitle />
                    ))}
                  </div>
                )}
                {nextOffset != null ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
                {loadingMore ? (
                  <p role="status" className="mt-2 flex items-center justify-center gap-2 py-6 text-sm text-fg-3">
                    <RefreshCw size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {t("리뷰를 더 불러오는 중…", "Loading more reviews…")}
                  </p>
                ) : null}
                {moreFailed && !loadingMore ? (
                  <div className="mt-2 text-center">
                    <p role="alert" className="text-sm text-fg-3">{t("리뷰를 더 불러오지 못했습니다.", "Couldn't load more reviews.")}</p>
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      className={buttonClass({ size: "sm", variant: "outline", className: "mt-2 min-h-11 gap-1.5 rounded-lg" })}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      {t("다시 시도", "Try again")}
                    </button>
                  </div>
                ) : null}
              </>
            )}

            <details className="group/review-lens mt-8 border-t border-line pt-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-fg-3 transition-colors duration-150 hover:text-fg [&::-webkit-details-marker]:hidden">
                <span>{t("독자 감정 분포 · 스포일러 보호 설정", "Sentiment lens & spoiler guard")}</span>
                <ChevronDown size={14} aria-hidden="true" className="shrink-0 transition-transform duration-150 group-open/review-lens:rotate-180 motion-reduce:transition-none" />
              </summary>
              <section
                data-testid="reviews-rea-sentiment-spoilerguard-bar"
                aria-label={t("독자 리뷰 감정 분포 및 스포일러 보호 설정", "Reader review sentiment & cut-level spoiler guard")}
                className="mt-2 rounded-xl border border-line bg-panel/45 p-4 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="font-semibold text-fg">
                    {t("감정 분포 렌즈 · 컷 단위 스포일러 보호", "Sentiment lens & cut-level spoiler guard")}
                  </strong>
                  <span data-testid="reviews-rea-strictness-badge" className="rounded-md bg-raised px-2 py-0.5 font-mono text-[11px] tabular-nums text-fg-2">
                    {spoilerStrictness === "strict-cut-level"
                      ? t("컷·대사 반전 가림", "Cut & twist guard")
                      : spoilerStrictness === "episode-plot"
                        ? t("회차 줄거리 보호", "Episode plot guard")
                        : t("완독자 자유 토론", "Open discussion")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("리뷰 분석 렌즈", "Review analysis lens")}>
                    {([
                      { id: "sentiment-polarity", ko: "감정 분포 (전율·작화·서사)", en: "Sentiment cluster" },
                      { id: "spoiler-guard-nlp", ko: "컷·하이라이트 스포일러 가림", en: "Cut-level spoiler guard" },
                      { id: "binge-dropoff-heat", ko: "정주행 완독 구간", en: "Binge retention" },
                      { id: "superfan-quote", ko: "명대사·명장면 인용", en: "Highlighted quotes" },
                    ] as const).map((lens) => (
                      <button
                        key={lens.id}
                        type="button"
                        aria-pressed={reviewLens === lens.id}
                        data-testid={`reviews-rea-lens-${lens.id}`}
                        onClick={() => setReviewLens(lens.id)}
                        className={
                          reviewLens === lens.id
                            ? "min-h-11 rounded-lg border border-accent/55 bg-accent-soft px-3 text-xs font-medium text-accent"
                            : "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-medium text-fg-2 hover:text-fg"
                        }
                      >
                        {t(lens.ko, lens.en)}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1" role="group" aria-label={t("스포일러 차단 강도", "Spoiler guard strictness")}>
                    {([
                      { id: "strict-cut-level", ko: "컷·반전 엄격 차단", en: "Strict cut guard" },
                      { id: "episode-plot", ko: "회차 줄거리 보호", en: "Episode plot guard" },
                      { id: "open-discussion", ko: "정주행 완독 열람", en: "Open discussion" },
                    ] as const).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        aria-pressed={spoilerStrictness === mode.id}
                        data-testid={`reviews-rea-spoiler-${mode.id}`}
                        onClick={() => setSpoilerStrictness(mode.id)}
                        className={
                          spoilerStrictness === mode.id
                            ? "min-h-11 rounded-lg bg-raised px-2.5 text-xs font-semibold text-fg"
                            : "min-h-11 rounded-lg border border-line bg-card px-2.5 text-xs text-fg-3 hover:text-fg-2"
                        }
                      >
                        {t(mode.ko, mode.en)}
                      </button>
                    ))}
                  </div>
                </div>
                <p data-testid="reviews-rea-diagnostic-status" className="mt-3 rounded-lg border border-line bg-canvas/55 px-3 py-2 text-xs leading-relaxed text-fg-2">
                  {reviewLens === "sentiment-polarity"
                    ? t("현재 피드에서는 작화·연출 호평, 복선 회수 반응, 완독 여운 문장이 고르게 모여 있습니다.", "Praise for direction, foreshadowing payoffs, and post-binge reflections lead the current feed.")
                    : reviewLens === "spoiler-guard-nlp"
                      ? t("결말 키워드와 특정 회차·컷 언급 문장을 사전 가림 처리해 첫 정주행 독자의 열람 경험을 보호합니다.", "Pre-masks finale keywords and specific cut references to protect first-time binge readers.")
                      : reviewLens === "binge-dropoff-heat"
                        ? t("세계관 확장 구간 이후 완독 독자의 평점과 공감 반응이 뚜렷하게 높아집니다.", "Ratings and likes rise steadily among readers who finish the worldbuilding arc.")
                        : t("독자들이 자주 인용한 한 줄 감상과 주요 장면을 스포일러 표시와 함께 모아 봅니다.", "Collects frequently quoted reader lines and key scene notes with spoiler-safe tags.")}
                </p>
              </section>
            </details>
          </section>

          <aside className="lg:sticky lg:top-[var(--site-header-sticky-offset,5rem)] lg:order-2">
            <TopReviewedList items={data?.topReviewed ?? []} status={topStatus} />
          </aside>
        </div>
      </Container>
    </div>
  );
}
