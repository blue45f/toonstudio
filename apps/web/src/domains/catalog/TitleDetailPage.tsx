import {
  formatI18nTemplate,
  translateCurrentStaticSourceText,
} from "@/shared/lib/i18n-bilingual-copy";
import { SITE_URL } from "@toonstudio/core/business";
import { Bookmark, Eye, Heart, Layers, MapPin, MessageSquareText, PenLine, Star } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";

import { TitleDetailBreadcrumb } from "./TitleDetailBreadcrumb";
import { TitleDetailHero } from "./TitleDetailHero";
import { TitleEpisodeSection } from "./TitleEpisodeSection";
import { TitleNotFound } from "./TitleNotFound";
import { resolveTitleEpisodes } from "./title-episodes";
import { TitleEarlyAccessNotice } from "@/domains/monetization/public/title-early-access";
import { AuthorNoticeSection } from "@/domains/author-notices/public/author-notices";


import type { SeedReview, Title } from "@/shared/lib/types";

import { AdaptationGraph } from "@/shared/components/adaptation-graph";
import { AvailabilityRouter } from "@/shared/components/availability";
import { CollectionAdd } from "@/shared/components/collection-add";
import { FanCafePanel } from "@/shared/components/fan-cafe-panel";
import { PriceCompare } from "@/shared/components/price-compare";
import { AvailabilityHistoryPanel } from "@/domains/engagement/AvailabilityHistoryPanel";
import { PersonalContentPreferenceNotice } from "@/domains/engagement/PersonalContentPreferenceNotice";
import { ReadStateSelector } from "@/shared/components/read-state";
import { ReviewCard } from "@/shared/components/review-card";
import { ReviewForm } from "@/shared/components/review-form";
import { ScoreBreakdown } from "@/shared/components/score-breakdown";
import { PageEntrance } from "@/shared/components/page-entrance/PageEntrance";
import { Rail, Section, Container } from "@/shared/components/section";
import { ShareButton } from "@/shared/components/share-button";
import { SubscribeButton } from "@/shared/components/subscribe-button";
import { NewsletterSubscribeButton } from "@/domains/newsletter/public/newsletter-subscribe-button";
import { TitleCard } from "@/shared/components/title-card";
import { TitleExternal } from "@/shared/components/title-external";
import { TitleFanWorks } from "@/shared/components/title-fan-works";
import { TitleOst } from "@/shared/components/title-ost";
import { Badge } from "@/shared/components/ui/chip";
import { DistributionBars, GenreSpectrum, MeterBar } from "@/shared/components/ui/spectrum-bar";
import { Stars } from "@/shared/components/ui/stars";
import { statsAreEstimated } from "@/shared/lib/estimate";
import { useApp } from "@/shared/lib/store";
import { mergedUniverse } from "@/shared/lib/title-universe";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { ErrorState } from "@/shared/components/feedback/error-state";
import { useAppConfig } from "@/platform/environment/use-app-config";
import {
  useDocumentTitle,
  useJsonLd,
  useMetaDescription,
  useMetaRobots,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import { useApiResource } from "@/platform/use-api-resource";
import { NOINDEX_PRIVATE_ROBOTS } from "@/shared/lib/seo-route-policy";


interface TitleDetailResponse {
  title: Title;
  reviews: SeedReview[];
  reviewsStatus?: "available" | "unavailable";
  similar: Title[];
  byAuthor?: Title[];
  original: Title;
  adaptations: Title[];
  hasFamily: boolean;
  reviewAvg: number;
  reviewCount: number;
  generatedAt: string;
  source: string;
}

export function TitleDetailPage() {
  const { slug } = useParams();
  const { data, loading, error, notFound, reload } = useApiResource<TitleDetailResponse>(
    slug ? `/api/titles/${encodeURIComponent(slug)}` : null,
    "작품 상세 데이터를 불러오지 못했습니다."
  );
  useDocumentTitle(data?.title?.title);
  // 시놉시스 원문은 저작권 리스크가 있어 관리자 킬스위치로 끌 수 있다(끄면 문단 자체를 숨김).
  const { showSynopsis } = useAppConfig();

  const t = data?.title;
  const metaDesc = t
    ? [
        [t.author, ...(t.genres ?? []).slice(0, 2)].filter(Boolean).join(" · "),
        (t.synopsis ?? "").replace(/\s+/g, " ").trim(),
      ]
        .filter(Boolean)
        .join(" — ")
    : null;
  useMetaDescription(metaDesc);

  const canonicalPath = t?.slug
    ? `/title/${encodeURIComponent(t.slug)}`
    : slug
      ? `/title/${encodeURIComponent(slug)}`
      : "/explore";
  const canonicalUrl = `${SITE_URL}${canonicalPath}`;
  const shareDescription = metaDesc || "웹툰과 웹소설 작품 정보, 작가, 장르와 감상 경로를 확인해 보세요.";
  usePageSocialMeta({
    canonicalPath,
    title: t?.title ?? "작품 정보",
    description: shareDescription,
    type: "article",
    image: t?.coverImage,
    imageAlt: t ? `${t.title} 표지` : "작품 표지",
  });
  useMetaRobots(
    notFound || t?.ageRating === "19" ? NOINDEX_PRIVATE_ROBOTS : null,
  );
  useJsonLd(t ? {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": t.type === "webtoon" ? "ComicSeries" : "CreativeWorkSeries",
        "@id": `${canonicalUrl}#work`,
        url: canonicalUrl,
        name: t.title,
        alternateName: t.altTitles,
        description: shareDescription,
        image: t.coverImage,
        creator: {
          "@type": "Person",
          name: t.author,
          url: `${SITE_URL}/author/${encodeURIComponent(t.author)}`,
        },
        contributor: t.artist ? { "@type": "Person", name: t.artist } : undefined,
        genre: t.genres,
        keywords: t.tags.join(", "),
        contentRating: t.ageRating,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "탐색", item: `${SITE_URL}/explore` },
          { "@type": "ListItem", position: 2, name: t.title, item: canonicalUrl },
        ],
      },
    ],
  } : null);

  const addRecentlyViewed = useApp((s) => s.addRecentlyViewed);
  const viewedId = data?.title?.id;
  useEffect(() => {
    if (viewedId) addRecentlyViewed(viewedId);
  }, [viewedId, addRecentlyViewed]);

  if (loading) {
    return (
      <PageEntrance variant="pop">
      <Container size="wide" className="relative py-8 lg:py-10">
        <TitleDetailBreadcrumb />
        {/* 로딩 골격도 무대 구도(포스터 + 카피 열)를 따라 첫 화면이 흔들리지 않게 한다. */}
        <div className="flex flex-col gap-7 lg:flex-row lg:gap-10">
          <div className="skeleton aspect-[3/4] w-40 shrink-0 rounded-2xl sm:w-52 lg:w-72" />
          <div className="flex-1 space-y-5">
            <div className="skeleton h-8 w-40" />
            <div className="skeleton h-12 w-3/4" />
            <div className="skeleton h-5 w-64" />
            <div className="skeleton h-28 rounded-2xl" />
            <div className="skeleton h-24 rounded-2xl" />
          </div>
        </div>
      </Container>
      </PageEntrance>
    );
  }

  if ((notFound || !data) && !error) return <TitleNotFound slug={slug} />;

  if (error || !data) {
    return (
      <PageEntrance variant="pop">
      <Container size="wide" className="py-10">
        <TitleDetailBreadcrumb />
        <ErrorState title={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "작품 상세를 불러오지 못했습니다.")} message={error} onRetry={reload} />
      </Container>
      </PageEntrance>
    );
  }

  const { title, reviews, similar, original, adaptations, hasFamily } = data;
  const reviewsAvailable = data.reviewsStatus !== "unavailable";
  const byAuthor = data.byAuthor ?? [];
  // 영상화(드라마·영화·애니·OTT)는 통합 유니버스 데이터에서 조회(원작+현재작 합산).
  // 웹툰화 패밀리가 없어도(독립 작품) 영상화가 있으면 그래프를 노출한다.
  const externalMedia = mergedUniverse(title, original).adaptations;
  const hasExternalMedia = externalMedia.length > 0;
  const reviewCount = data.reviewCount || title.stats.ratingCount;
  const reviewAvg = data.reviewCount > 0 ? data.reviewAvg : title.stats.ratingAvg;
  const estimated = statsAreEstimated(title);
  const fmtStat = (value: number) => (estimated ? `≈${formatCount(value)}` : formatCount(value));
  const stats = [
    { icon: Eye, label: "조회", value: fmtStat(title.stats.views) },
    { icon: Heart, label: "좋아요", value: fmtStat(title.stats.likes) },
    { icon: Bookmark, label: "관심", value: fmtStat(title.stats.bookmarks) },
    { icon: Star, label: "평가", value: fmtStat(reviewCount) },
  ];
  // 회차는 API 상세 응답 루트의 episodes 로 온다(스냅샷 수집 작품만). 없으면 undefined → 빈 상태.
  const episodes = resolveTitleEpisodes(data);
  const firstEpisodeHref =
    !episodes && title.totalEpisodes === 0
      ? null
      : `/title/${encodeURIComponent(title.slug)}/read/1`;

  return (
    <PageEntrance variant="pop">
    <Container size="wide" className="relative py-8 lg:py-10">
      <TitleDetailBreadcrumb title={title.title} />
      <TitleDetailHero
        title={title}
        reviewAvg={reviewAvg}
        reviewCount={reviewCount}
        estimated={estimated}
        showSynopsis={showSynopsis}
        firstEpisodeHref={firstEpisodeHref}
      />

      <div className="grid gap-8 lg:grid-cols-[19rem_1fr]">
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[var(--site-header-sticky-offset,5rem)] lg:self-start">
          {/* 표지 포스터는 히어로 무대의 주인공이라 여기서는 중복해 그리지 않는다 (웨이브 14). */}
          <ReadStateSelector titleId={title.id} />
          <CollectionAdd titleId={title.id} />
          {title.status === "ongoing" && title.updateDays && title.updateDays.length > 0 && (
            <SubscribeButton titleId={title.id} days={title.updateDays} />
          )}
          <NewsletterSubscribeButton authorName={title.author} />
          <ShareButton
            title={title.title}
            slug={title.slug}
            description={metaDesc ?? undefined}
            imageUrl={title.coverImage}
            className="self-start"
          />
          {/* 수익화: 서포터 얼리 액세스 안내 (monetization/paywall) */}
          <TitleEarlyAccessNotice titleId={title.id} />
          <AvailabilityHistoryPanel title={title} />
        </aside>

        <div className="flex flex-col gap-6">
          {title.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {title.tags.map((tag) => (
                <Link
                  key={tag}
                  href={formatI18nTemplate(translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "en", "/explore?tags={v0}"), { v0: String(encodeURIComponent(tag)) })}
                  className="inline-flex items-center rounded-full border border-line bg-raised/50 px-2.5 py-1 text-xs text-fg-2 transition-colors hover:border-accent/50 hover:bg-accent-soft/40 hover:text-accent pointer-coarse:px-3 pointer-coarse:py-1.5"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}

          <PersonalContentPreferenceNotice title={title} />

          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
            {stats.map((item) => (
              <div key={item.label} className="flex flex-col gap-1 bg-card p-4">
                <dt className="flex items-center gap-1.5 text-xs text-fg-3">
                  <item.icon size={13} /> {item.label}
                </dt>
                <dd className="numeral text-xl text-fg">{item.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="mt-10 grid gap-6 sm:mt-14 lg:grid-cols-[1fr_20rem] lg:items-start">
        <TitleEpisodeSection title={title} episodes={episodes} />
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-line bg-panel/50 p-4">
            <div className="mb-3 flex items-center gap-2">
              <MapPin size={15} className="text-accent" />
              <p className="text-sm font-semibold text-fg">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "어디서 볼 수 있나요")}</p>
            </div>
            <AvailabilityRouter availability={title.availability} />
            <p className="mt-3 text-xs leading-relaxed text-fg-3">
              {translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "플랫폼을 가로질러 가격(무료·기다무·유료)을 비교합니다. 가장 저렴한 진입점을 위로 정렬했어요.")}</p>
          </div>
          <PriceCompare availability={title.availability} />
          <section aria-labelledby="title-metrics-summary" className="rounded-2xl border border-line bg-card p-5">
            <h3 id="title-metrics-summary" className="text-sm font-semibold text-fg">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "지표 요약")}</h3>
            <dl className="mt-3.5 flex flex-col gap-2.5 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-3">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "평점")}</dt>
                <dd className="numeral font-semibold text-fg">
                  {reviewAvg.toFixed(1)}
                  <span className="ml-1.5 text-xs font-normal text-fg-3">
                    {formatI18nTemplate(translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "{v0}개의 평가"), { v0: String(formatCount(reviewCount)) })}
                  </span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-3">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "완독률")}</dt>
                <dd className="numeral font-semibold text-fg">{Math.round(title.stats.completionRate)}%</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-3">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "몰입 지수")}</dt>
                <dd className="numeral font-semibold text-fg">{Math.round(title.stats.bingeIndex)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-3">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "관심")}</dt>
                <dd className="numeral font-semibold text-fg">{fmtStat(title.stats.bookmarks)}</dd>
              </div>
            </dl>
            <a
              href="#metrics"
              className="mt-4 inline-flex min-h-10 items-center text-xs font-semibold text-accent transition-colors hover:text-accent-2"
            >
              {translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "지표 자세히 보기")}
            </a>
          </section>
        </div>
      </div>

      <AuthorNoticeSection authorName={title.author} workTitle={title.title} className="mt-10 sm:mt-14" />

      <section id="metrics" className="mt-10 scroll-mt-24 sm:mt-14">
        <h2 className="eyebrow mb-1 text-accent">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "METRICS · 지표")}</h2>
        <p className="mb-4 text-xs text-fg-2">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "완독률·몰입·분포는 수집값과 추정값을 함께 사용합니다.")}</p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-line bg-card p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "평점 분포")}</h3>
            <DistributionBars dist={title.stats.ratingDist} />
          </div>
          <div className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5">
            <h3 className="text-sm font-semibold text-fg">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "정주행 지표")}</h3>
            <MeterBar label={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "완독률")} value={Math.round(title.stats.completionRate)} suffix="%" />
            <MeterBar label={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "몰입 지수")} value={Math.round(title.stats.bingeIndex)} color="var(--color-cool)" />
            <MeterBar label={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "트렌드 점수")} value={Math.round(title.stats.trendingScore)} color="var(--color-good)" />
            <div className="mt-1">
              <p className="mb-1.5 text-xs text-fg-3">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "장르 스펙트럼")}</p>
              <GenreSpectrum genres={title.genres} height={6} />
            </div>
          </div>
        </div>
      </section>

      <ScoreBreakdown title={title} className="mt-10 sm:mt-14" />

      {(hasFamily || hasExternalMedia) && (
        <Section
          className="mt-10 sm:mt-14"
          eyebrow="ADAPTATION"
          title={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "같은 이야기, 다른 형태")}
          desc={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "원작·웹툰부터 드라마·영화·애니메이션까지, 하나의 우주로 연결했습니다.")}
        >
          <div className="rounded-2xl border border-line bg-card p-5">
            <div className="mb-4 flex items-center gap-2 text-fg-3">
              <Layers size={15} />
              <span className="eyebrow">{original.title} {translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "유니버스")}</span>
            </div>
            <AdaptationGraph
              original={original}
              adaptations={adaptations}
              externalMedia={externalMedia}
              currentId={title.id}
            />
          </div>
        </Section>
      )}

      <TitleOst title={title} original={original} />

      <TitleExternal title={title} />

      <Section
        className="mt-10 sm:mt-14"
        eyebrow="COMMUNITY"
        title={formatI18nTemplate(translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "{v0} 팬카페"), { v0: String(title.title) })}
        desc={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "작품 해석, 정주행 메모, 팬아트 아이디어를 독자들과 나눕니다.")}
      >
        <FanCafePanel scope="title" targetId={title.id} targetLabel={title.title} />
      </Section>

      <TitleFanWorks titleId={title.id} />

      <Section
        className="mt-10 sm:mt-14"
        eyebrow="CHARACTER TALK"
        title={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "등장인물과 직접 대화해요")}
        desc={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "작가가 승인한 설정 그대로 캐릭터와 이야기하는 캐릭터 토크예요. 작가가 챗을 연 작품이면 바로 대화를 시작할 수 있어요.")}
      >
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-5">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <MessageSquareText size={20} aria-hidden />
          </span>
          <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg-2">
            {formatI18nTemplate(translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "「{v0}」의 캐릭터에게 궁금한 걸 직접 물어보세요."), { v0: String(title.title) })}
          </p>
          <Link
            href={`/character-chat?work=${encodeURIComponent(title.slug ?? slug ?? "")}`}
            className="inline-flex min-h-11 items-center rounded-lg bg-accent px-4 text-xs font-bold text-on-accent hover:bg-accent/90"
          >
            {translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "캐릭터와 대화하기")}
          </Link>
        </div>
      </Section>

      <Section
        className="mt-10 sm:mt-14"
        eyebrow="REVIEWS"
        title={
          <span className="flex items-baseline gap-3">
            {translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "리뷰")}
            {reviewsAvailable ? (
              <span className="numeral text-lg text-fg-3">{reviews.length}</span>
            ) : (
              <Badge tone="warn">현재 확인 불가</Badge>
            )}
            {reviewsAvailable && reviews.length > 0 && (
              <span className="flex items-center gap-1.5 text-sm font-normal text-fg-3">
                <Stars value={reviewAvg} size="sm" /> {reviewAvg.toFixed(1)}
              </span>
            )}
          </span>
        }
      >
        {!reviewsAvailable ? (
          <div role="status" className="rounded-2xl border border-warn/35 bg-warn/10 p-6 text-sm text-fg-2">
            <p className="font-semibold text-fg">리뷰 기능을 일시적으로 사용할 수 없습니다.</p>
            <p className="mt-1 leading-relaxed">리뷰 목록이 비어 있다는 뜻은 아닙니다. 작품 정보와 다른 탐색 기능은 계속 사용할 수 있습니다.</p>
            <Link href="/status" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-accent hover:text-accent-2">
              서비스 상태 확인
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr] lg:items-start">
            <div className="lg:sticky lg:top-[var(--site-header-sticky-offset,5rem)]">
              <ReviewForm titleId={title.id} />
            </div>
            <div className="flex flex-col gap-3">
              {reviews.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line bg-card/50 p-10 text-center">
                <span className="grid size-12 place-items-center rounded-2xl bg-raised text-fg-3">
                  <MessageSquareText size={22} aria-hidden="true" />
                </span>
                <div>
                  <p className="font-semibold text-fg">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "아직 리뷰가 없어요.")}</p>
                  <p className="mt-1 text-sm text-fg-3">{translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "첫 리뷰를 남기면 취향 분석에도 반영됩니다.")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => document.getElementById("review-text")?.focus()}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 py-1.5 text-xs font-medium text-fg-2 transition-colors hover:bg-raised"
                >
                  <PenLine size={14} aria-hidden="true" />
                  {translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "첫 리뷰 남기기")}
                </button>
              </div>
            ) : (
              reviews.map((review) => <ReviewCard key={review.id} review={review} enableReplies />)
              )}
            </div>
          </div>
        )}
      </Section>

      {byAuthor.length > 0 && (
        <Section
          className="mt-10 sm:mt-14"
          eyebrow="BY THIS AUTHOR"
          title={formatI18nTemplate(translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "{v0}의 다른 작품"), { v0: String(title.author) })}
          desc={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "같은 작가가 그린·쓴 다른 작품")}
        >
          <Rail>
            {byAuthor.map((item) => (
              <TitleCard key={item.id} title={item} />
            ))}
          </Rail>
        </Section>
      )}

      {similar.length > 0 && (
        <Section
          className="mt-10 sm:mt-14"
          eyebrow="SIMILAR"
          title={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "이 작품과 비슷한")}
          desc={translateCurrentStaticSourceText("domains.catalog.TitleDetailPage", "ko", "장르·태그·어댑테이션 관계로 찾은 추천")}
        >
          <Rail>
            {similar.map((item) => (
              <TitleCard key={item.id} title={item} />
            ))}
          </Rail>
        </Section>
      )}
    </Container>
    </PageEntrance>
  );
}
