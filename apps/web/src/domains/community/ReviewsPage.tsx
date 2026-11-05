import { communityStatusText } from "./community-status-i18n";
import { MessageSquareQuote, PenLine, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ReviewControls } from "./reviews-components/review-controls";
import { ReactionSummaryPanel } from "./reviews-components/reaction-summary-panel";
import { parseReviewRating, parseReviewSort } from "./reviews-components/review-query";
import { ReviewStatsSummary } from "./reviews-components/review-stats-summary";
import { TopReviewedList, type TopReviewedStatus } from "./reviews-components/top-reviewed-list";

import type { ReviewFeedItem, ReviewsResponse } from "@/shared/lib/types";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { ReviewCard } from "./components/review-card";
import { Container } from "@/shared/components/section";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { fetchApiResource, useApiResource } from "@/platform/use-api-resource";

/** 한 번에 가져오는 리뷰 수 — 무제한 렌더 방지용 페이지 크기. */
const REVIEWS_PAGE_SIZE = 30;
const SKELETON_CARD_COUNT = 9;

const REVIEWS_FETCH_ERROR = communityStatusText("community.status.reviews.loadFailed", "리뷰 데이터를 불러오지 못했습니다.");

/**
 * 첫 페이지 응답(`base`)에 이어 붙인 추가 페이지.
 * 첫 페이지가 바뀌면(조건 변경·갱신) 기준이 달라지므로 자동으로 버려진다 — 동기화 effect가 필요 없다.
 */
interface FollowingPages {
  readonly base: ReviewsResponse;
  readonly items: readonly ReviewFeedItem[];
  readonly nextOffset: number | null;
}

function ReviewFeedSkeleton() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid" aria-hidden="true">
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div key={index} className="rounded-2xl border border-line bg-card p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="skeleton size-9 rounded-full" />
            <span className="flex-1 space-y-2">
              <span className="skeleton block h-3 w-28" />
              <span className="skeleton block h-3 w-16" />
            </span>
          </div>
          <span className="skeleton mb-2 block h-4 w-full" />
          <span className="skeleton mb-2 block h-4 w-5/6" />
          <span className="skeleton block h-4 w-2/3" />
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
  // 악성 댓글 방벽 (REPORT O-5): view=summary면 원본 피드 대신 분류·집계 요약만 보여 준다.
  const summaryView = searchParams.get("view") === "summary";
  const baseParams = new URLSearchParams({ sort });
  if (spoilerHidden) baseParams.set("spoiler", "hide");
  if (rating !== "all") baseParams.set("rating", rating);
  const baseQuery = baseParams.toString();

  const { data, loading, error, reload } = useApiResource<ReviewsResponse>(
    `/api/reviews?${baseQuery}&limit=${REVIEWS_PAGE_SIZE}&offset=0`,
    REVIEWS_FETCH_ERROR,
  );

  // 무한 스크롤 — 첫 페이지는 useApiResource, 이후 페이지는 직접 fetch 해 첫 페이지 기준으로 누적한다.
  const [following, setFollowing] = useState<FollowingPages | null>(null);
  // 다음 페이지 실패도 같은 첫 페이지 기준으로만 표시한다.
  const [moreFailedFor, setMoreFailedFor] = useState<ReviewsResponse | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // 센티넬 콜백이 같은 틱에 연속으로 들어와도 fetch가 한 번만 나가도록
  // 동기 가드용 ref — state 반영 타이밍(리렌더 후)과 무관하게 동작한다.
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
  const [reviewLens, setReviewLens] = useState<"sentiment-polarity" | "spoiler-guard-nlp" | "binge-dropoff-heat" | "superfan-quote">("sentiment-polarity");
  const [spoilerStrictness, setSpoilerStrictness] = useState<"strict-cut-level" | "episode-plot" | "open-discussion">("strict-cut-level");

  return (
    <div>
      <Container size="wide" className="pt-7 sm:pt-10 lg:pt-12">
        <SiteContextualSubNav pathnameOverride="/reviews" className="mb-5" />
        <SitePageHeader
          icon={MessageSquareQuote}
          eyebrow="READER REVIEWS"
          title={t("독자들이 남긴 한 줄", "One line from every reader")}
          description={t(
            "정주행의 끝에서, 누군가는 별점 대신 문장을 남겼어요. 마음에 드는 작품을 찾았다면 작품 상세에서 리뷰를 남겨 보세요.",
            "At the end of a binge, some readers leave a sentence instead of a star. Found a story you love? Review it on its detail page.",
          )}
          actions={
            <Link href="/discover" className={buttonClass({ size: "md", className: "min-h-11 gap-1.5" })}>
              <PenLine size={15} aria-hidden="true" />
              {t("리뷰할 작품 찾기", "Find a story to review")}
            </Link>
          }
          aside={
            <img
              src="/images/section-explore.webp"
              alt=""
              loading="lazy"
              decoding="async"
              className="aspect-[4/3] w-full rounded-2xl object-cover"
            />
          }
          asideClassName="hidden lg:block"
        >
          <ReviewStatsSummary stats={data?.stats ?? null} loading={firstLoad} />
        </SitePageHeader>
        <section
          data-testid="reviews-rea-sentiment-spoilerguard-bar"
          aria-label={t("REA 독자 리뷰 감정 극성·컷 스포일러 가드 분석기", "REA reader review sentiment & cut-level spoiler guard analyzer")}
          className="mt-5 rounded-2xl border border-line bg-card/90 p-3.5 text-xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="font-extrabold text-accent">
              {t("WATCHA PEDIA · BOOKMETER · COMICVINE · SERIEBOX 리뷰 감정 클러스터 & 컷 단위 스포일러 가드", "WATCHA PEDIA · BOOKMETER · COMICVINE · SERIEBOX Review Sentiment Cluster & Cut-Level Spoiler Guard")}
            </strong>
            <span data-testid="reviews-rea-strictness-badge" className="rounded-full bg-accent/15 px-2.5 py-0.5 font-mono text-[11px] font-bold text-accent">
              {spoilerStrictness === "strict-cut-level"
                ? t("컷·대사 반전 마스킹 99.4%", "99.4% Cut/Twist Masking")
                : spoilerStrictness === "episode-plot"
                  ? t("회차 줄거리 보호 모드", "Episode Plot Guard Mode")
                  : t("완독자 자유 토론 모드", "Full-Binge Open Discussion")}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("리뷰 분석 렌즈", "Review analysis lens")}>
              {([
                { id: "sentiment-polarity", ko: "감정 극성 클러스터 (전율·작화·서사)", en: "Sentiment Polarity Cluster" },
                { id: "spoiler-guard-nlp", ko: "컷·하이라이트 스포일러 NLP 가드", en: "Cut-Level Spoiler NLP Guard" },
                { id: "binge-dropoff-heat", ko: "정주행 완독 vs 하차 구간 히트맵", en: "Binge vs Drop-off Heatmap" },
                { id: "superfan-quote", ko: "명대사·명장면 북마크 큐레이션", en: "Iconic Quote & Panel Curation" },
              ] as const).map((lens) => (
                <button
                  key={lens.id}
                  type="button"
                  aria-pressed={reviewLens === lens.id}
                  data-testid={`reviews-rea-lens-${lens.id}`}
                  onClick={() => setReviewLens(lens.id)}
                  className={reviewLens === lens.id ? "rounded-lg border border-accent bg-accent/15 px-2.5 py-1 font-bold text-accent" : "rounded-lg border border-line bg-panel px-2.5 py-1 text-fg-2"}
                >
                  {t(lens.ko, lens.en)}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label={t("스포일러 차단 강도", "Spoiler guard strictness")}>
              {([
                { id: "strict-cut-level", ko: "컷·반전 엄격 차단", en: "Strict Cut Guard" },
                { id: "episode-plot", ko: "회차 줄거리 보호", en: "Episode Plot Guard" },
                { id: "open-discussion", ko: "정주행 완독 열람", en: "Open Discussion" },
              ] as const).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  aria-pressed={spoilerStrictness === mode.id}
                  data-testid={`reviews-rea-spoiler-${mode.id}`}
                  onClick={() => setSpoilerStrictness(mode.id)}
                  className={spoilerStrictness === mode.id ? "rounded-md border border-accent bg-accent px-2 py-0.5 text-[11px] font-bold text-on-accent" : "rounded-md border border-line bg-panel px-2 py-0.5 text-[11px] text-fg-3"}
                >
                  {t(mode.ko, mode.en)}
                </button>
              ))}
            </div>
          </div>
          <p data-testid="reviews-rea-diagnostic-status" className="mt-2 rounded-xl border border-line bg-panel/70 px-3 py-2 text-[11px] leading-relaxed text-fg-2">
            {reviewLens === "sentiment-polarity"
              ? t("왓챠피디아·독서미터(Bookmeter) 코호트 분석: 현재 피드에서 ‘작화 연출 극찬(44%)’·‘떡밥 회수 전율(31%)’·‘완독 여운(25%)’ 반응이 우세합니다.", "Watcha Pedia & Bookmeter cohort analysis: 'Art/Direction Praise (44%)', 'Foreshadowing Payoff (31%)' & 'Binge Afterglow (25%)' lead the feed.")
              : reviewLens === "spoiler-guard-nlp"
                ? t("최종 보스·진범·결말 키워드 및 특정 회차(컷 번호) 언급 문장을 사전 블러 처리하여 미열람 독자의 정주행 경험을 보호합니다.", "Pre-blurs boss/culprit/finale keywords and cut-specific spoilers to protect first-time binge readers.")
                : reviewLens === "binge-dropoff-heat"
                  ? t("15~22화 세계관 확장 구간 이후 완독 독자의 평점 상승폭(+0.42★)이 가장 높게 나타납니다.", "Post-Ep 15–22 worldbuilding expansion shows the highest rating surge (+0.42★) among binge finishers.")
                  : t("독자들이 가장 많이 인용한 한 줄 문장과 클라이맥스 컷 번호를 스포일러 태그와 함께 아카이빙합니다.", "Archives the most-quoted reader one-liners and climax cut references with spoiler-safe tags.")}
          </p>
        </section>
      </Container>

      <Container size="wide" className="py-10 lg:py-12">
        <div className="grid gap-8 lg:grid-cols-[1fr_268px] lg:items-start">
          <section className="min-w-0 lg:order-1" aria-label={t("리뷰 피드", "Review feed")}>
            <div className="mb-6 rail -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <ReviewControls />
            </div>

            <div className="mb-4 flex min-h-11 flex-wrap items-center justify-between gap-2">
              {data ? (
                <h2 className="text-sm font-normal text-fg-3" aria-live="polite">
                  <span className="numeral text-fg-2">{data.stats.total.toLocaleString("ko-KR")}</span>
                  <span className="ml-1">{t("개의 리뷰", "reviews")}</span>
                  {feed.length < data.stats.total ? (
                    <span className="ml-1.5">
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
                className={buttonClass({ size: "sm", variant: "quiet", className: "min-h-11 gap-1.5" })}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} aria-hidden="true" />
                {t("갱신", "Refresh")}
              </button>
            </div>

            {firstLoad ? (
              <ReviewFeedSkeleton />
            ) : error && !data ? (
              <ErrorState title={t("리뷰 데이터를 불러오지 못했습니다.", "Couldn't load reviews.")} message={error} onRetry={reload} />
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
                  <ReactionSummaryPanel reviews={feed} />
                ) : (
                  <div className="columns-1 gap-4 sm:columns-2 lg:columns-2 xl:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
                    {feed.map((review) => (
                      <ReviewCard key={review.id} review={review} title={review.title} showTitle />
                    ))}
                  </div>
                )}
                {/* 무한 스크롤 센티넬 — 뷰포트 근처에서 다음 페이지 자동 로드 */}
                {nextOffset != null ? <div ref={sentinelRef} aria-hidden="true" className="h-1" /> : null}
                {loadingMore ? (
                  <p role="status" className="mt-2 flex items-center justify-center gap-2 py-6 text-sm text-fg-3">
                    <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                    {t("리뷰를 더 불러오는 중…", "Loading more reviews…")}
                  </p>
                ) : null}
                {moreFailed && !loadingMore ? (
                  <div className="mt-2 text-center">
                    <p role="alert" className="text-sm text-fg-3">{t("리뷰를 더 불러오지 못했습니다.", "Couldn't load more reviews.")}</p>
                    <button
                      type="button"
                      onClick={() => void loadMore()}
                      className={buttonClass({ size: "sm", variant: "outline", className: "mt-2 gap-1.5" })}
                    >
                      <RefreshCw size={14} aria-hidden="true" />
                      {t("다시 시도", "Try again")}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          <aside className="lg:sticky lg:top-[var(--site-header-sticky-offset,5rem)] lg:order-2">
            <TopReviewedList items={data?.topReviewed ?? []} status={topStatus} />
          </aside>
        </div>
      </Container>
    </div>
  );
}
