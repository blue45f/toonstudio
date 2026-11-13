import { catalogStatusText } from "./catalog-status-i18n";
import { AreaChart } from "./insights-components/area-chart";
import { BarList } from "./insights-components/bar-list";
import { CompareSplit } from "./insights-components/compare-split";
import { Donut } from "./insights-components/donut";
import { Panel } from "./insights-components/panel";
import { TagCloud } from "./insights-components/tag-cloud";

import { ArrowRight } from "lucide-react";

import type { getInsightsData } from "@/shared/lib/server/insights";

import { SiteDisclosure } from "@/domains/legal/public/site-disclosure";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { CountUp } from "@/shared/components/count-up";
import { Container } from "@/shared/components/section";
import { SectionArt } from "@/shared/components/section-art";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { Badge } from "@/shared/components/ui/chip";
import { DistributionBars, GenreSpectrum, MeterBar } from "@/shared/components/ui/spectrum-bar";
import { genreColor } from "@/shared/lib/genre-color";
import { TYPE_LABEL } from "@/shared/lib/taxonomy";
import { formatCount, formatFull } from "@/shared/lib/utils";
import { ErrorState } from "@/shared/components/feedback/error-state";
import Link from "@/shared/navigation/router-link";
import { useApiResource } from "@/platform/use-api-resource";


type InsightsData = Awaited<ReturnType<typeof getInsightsData>>;

/** 패널 하단의 다음 행동 CTA — "이 지표로 작품 찾기" 딥링크. */
function PanelAction({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-11 items-center gap-1.5 rounded-full border border-line bg-panel/70 px-3.5 py-1.5 text-xs font-semibold text-accent transition-colors hover:border-accent/50 hover:bg-accent-soft"
    >
      {label}
      <ArrowRight
        size={13}
        aria-hidden="true"
        className="transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}

function InsightsPageHeading() {
  return (
    <header className="mb-4 max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        이야기의 지형을 읽다
      </h1>
      <p className="mt-1 text-sm leading-relaxed text-fg-2">
        수록작 전체를 가로질러 장르·플랫폼·평점·가격·어댑테이션을 집계했습니다.
      </p>
    </header>
  );
}

export function InsightsPage() {
  const b = useBilingual("domains.catalog.InsightsPage");
  const { data, loading, error, reload } = useApiResource<InsightsData>(
    "/api/insights",
    catalogStatusText("catalog.status.insights.loadFailed", "인사이트 데이터를 불러오지 못했습니다.")
  );

  if (loading) {
    return (
      <Container size="wide" className="py-6">
        <InsightsPageHeading />
        <div className="skeleton h-40 rounded-2xl" />
      </Container>
    );
  }

  if (error || !data) {
    return (
      <Container size="wide" className="py-6">
        <InsightsPageHeading />
        <ErrorState title={catalogStatusText("catalog.status.insights.loadFailed", "인사이트 데이터를 불러오지 못했습니다.")} message={error} onRetry={reload} />
      </Container>
    );
  }

  if (data.total === 0) {
    return (
      <Container size="wide" className="py-6">
        <InsightsPageHeading />
        <section className="rounded-xl border border-dashed border-line bg-panel p-4" aria-live="polite">
          <h2 className="font-bold text-fg">{b("아직 집계할 작품이 없어요", "No works to summarize yet")}</h2>
          <p className="mt-1 text-sm text-fg-2">{b("작품이 수록되면 장르·평점·플랫폼 통계를 확인할 수 있어요.", "Genre, rating and platform statistics will appear when works are available.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={reload} className="min-h-11 rounded-lg border border-line px-3 text-sm font-semibold text-fg focus-visible:outline-2 focus-visible:outline-accent">{b("집계 다시 불러오기", "Reload statistics")}</button>
            <Link href="/discover" className="inline-flex min-h-11 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-on-accent focus-visible:outline-2 focus-visible:outline-accent">{b("작품 탐색", "Discover works")}</Link>
          </div>
        </section>
      </Container>
    );
  }

  const {
    total,
    genreRows,
    topGenre,
    bestRatedGenre,
    wt,
    wn,
    platformRows,
    topPlatform,
    platformTotal,
    yearPoints,
    peakYear,
    distTotal,
    distSum,
    weightedAvg,
    fourPlusPct,
    pricingTotal,
    pricingSegments,
    freeShare,
    webnovelsCount,
    adaptedNovelsCount,
    adaptPct,
    tags,
    trendingTop,
    completionTop,
  } = data;

  // 각 패널의 "이 지표로 작품 찾기" 딥링크 목적지.
  const betterType = wn.rating >= wt.rating ? "webnovel" : "webtoon";
  const topTag = [...tags].sort((a, b) => b.count - a.count)[0]?.tag;

  return (
    <div>
      <section className="border-b border-line">
        <Container size="wide" className="py-6">
          <SiteContextualSubNav pathnameOverride="/insights" className="mb-3" />
          <header>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">이야기의 지형을 읽다</h1>
            <p className="mt-1 text-xs leading-relaxed text-fg-3">{b("장르·평점·플랫폼은 수집 실데이터, 트렌드·완독률·몰입 지수는 추정값(≈)입니다.", "Genres, ratings and platforms use collected data; trends, completion and immersion are estimates (≈).")}</p>
          </header>
          <dl className="mt-7 flex flex-wrap items-center gap-x-8 gap-y-3">
            {[
              { value: total, label: "수록 작품" },
              { value: genreRows.length, label: "활성 장르" },
              { value: platformTotal, label: "연재 플랫폼" },
              { value: distSum, display: formatFull(distSum), label: "집계 평가 수" },
            ].map((item) => (
              <div key={item.label} className="flex items-baseline gap-2">
                <dt className="order-2 text-xs text-fg-3">{item.label}</dt>
                <dd className="order-1 numeral text-2xl text-fg tabular-nums">
                  {"display" in item && item.display ? (
                    item.display
                  ) : (
                    <CountUp value={item.value} separator />
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container size="wide" className="py-5 sm:py-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Panel
            className="lg:col-span-3 lg:row-span-2"
            eyebrow="GENRE LANDSCAPE"
            title="장르 분포 & 평균 평점"
            aside={<Badge tone="neutral">{genreRows.length}개 장르</Badge>}
            insight={
              <>
                <span className="text-fg-2">{topGenre.genre}</span>가 {topGenre.count}작으로 가장 두텁고,
                평점은 <span className="text-fg-2">{bestRatedGenre.genre}</span>(
                {bestRatedGenre.rating.toFixed(2)})가 가장 높습니다.
              </>
            }
            action={
              <PanelAction
                href={`/explore?genre=${encodeURIComponent(topGenre.genre)}`}
                label={`${topGenre.genre} 작품 탐색하기`}
              />
            }
          >
            <BarList
              max={topGenre.count}
              valueFormat={(value) => `${value}`}
              items={genreRows.map((row) => ({
                label: row.genre,
                value: row.count,
                color: genreColor(row.genre, 0.7),
                dot: true,
                meta: `★ ${row.rating.toFixed(2)}`,
              }))}
            />
          </Panel>

          <Panel
            className="lg:col-span-3"
            eyebrow="FORMAT FACE-OFF"
            title="웹툰 vs 웹소설"
            insight={
              <>
                평균 평점은 <span className="text-fg-2">{wn.rating >= wt.rating ? "웹소설" : "웹툰"}</span>
                이 근소하게 앞서고, 누적 조회는 웹소설이 압도합니다.
              </>
            }
            action={
              <PanelAction
                href={`/explore?types=${betterType}`}
                label={`${TYPE_LABEL[betterType]} 작품 보기`}
              />
            }
          >
            <CompareSplit
              aName={TYPE_LABEL.webtoon}
              bName={TYPE_LABEL.webnovel}
              aColor="var(--color-cool)"
              bColor="var(--color-accent)"
              aCount={wt.count}
              bCount={wn.count}
              metrics={[
                { label: "평균 평점", a: wt.rating.toFixed(2), b: wn.rating.toFixed(2), aRaw: wt.rating, bRaw: wn.rating },
                { label: "평균 조회", a: formatCount(wt.views), b: formatCount(wn.views), aRaw: wt.views, bRaw: wn.views },
                { label: "몰입 지수", a: wt.binge.toFixed(0), b: wn.binge.toFixed(0), aRaw: wt.binge, bRaw: wn.binge },
              ]}
            />
          </Panel>

          <Panel
            className="lg:col-span-3"
            eyebrow="ADAPTATION INDEX"
            title="원작 → 웹툰 파이프라인"
            insight={
              <>
                웹소설 {webnovelsCount}작 중 {adaptedNovelsCount}작이 웹툰으로 재탄생했습니다. 원작 추적이
                곧 차기 화제작 예측입니다.
              </>
            }
            action={
              <PanelAction href="/explore?adaptedOnly=true" label="웹툰화된 원작 찾기" />
            }
          >
            <div className="flex items-end gap-3">
              <span className="numeral text-[3.4rem] leading-none text-accent">
                <CountUp value={Math.round(adaptPct)} />
              </span>
              <span className="numeral mb-1.5 text-xl text-fg-3">%</span>
              <span className="mb-2 text-sm text-fg-3">웹툰화 비율</span>
            </div>
            <MeterBar
              className="mt-4"
              value={adaptedNovelsCount}
              max={webnovelsCount}
              label="웹툰화된 웹소설"
              suffix={` / ${webnovelsCount}`}
            />
          </Panel>

          <Panel
            className="lg:col-span-2"
            eyebrow="PLATFORM MAP"
            title="플랫폼 지형도"
            insight={
              <>
                <span className="text-fg-2">{topPlatform.p.name}</span>이 {topPlatform.count}작으로 최다
                수록. 한 작품이 여러 플랫폼에 걸쳐 있습니다.
              </>
            }
            action={
              <PanelAction
                href={`/explore?platforms=${encodeURIComponent(topPlatform.id)}`}
                label={`${topPlatform.p.name} 작품 보기`}
              />
            }
          >
            <BarList
              max={topPlatform.count}
              items={platformRows.map((row) => ({
                label: row.p.short,
                value: row.count,
                color: row.p.color,
                dot: true,
              }))}
            />
          </Panel>

          <Panel
            className="lg:col-span-2"
            eyebrow="RELEASE TREND"
            title="연도별 신작 추이"
            insight={
              <>
                {peakYear.label}년 {peakYear.value}작으로 정점. 수록작 분포가 시장 팽창기의 흔적을
                보여줍니다.
              </>
            }
            action={<PanelAction href="/explore?sort=newest" label="최신작 탐색하기" />}
          >
            <AreaChart
              points={yearPoints}
              color="var(--color-accent)"
              label={`연도별 신작 추이: ${peakYear.label}년 ${peakYear.value}작으로 정점`}
            />
          </Panel>

          <Panel
            className="lg:col-span-2"
            eyebrow="RATING SPREAD"
            title="전체 평점 분포"
            aside={
              <div className="text-right">
                <div className="numeral text-2xl text-accent tabular-nums">{weightedAvg.toFixed(2)}</div>
                <div className="text-xs text-fg-3">가중 평균</div>
              </div>
            }
            insight={
              <>
                {formatFull(distSum)}건의 평가 중 4점 이상이 {fourPlusPct.toFixed(0)}%. 큐레이션된 인덱스답게
                분포가 상단에 쏠려 있습니다.
              </>
            }
            action={<PanelAction href="/ranking?axis=rating" label="평점 랭킹 보기" />}
          >
            <DistributionBars dist={distTotal} />
          </Panel>

          <Panel
            className="lg:col-span-3"
            eyebrow="PRICING MODEL"
            title="가격 모델 분포"
            insight={
              <>
                연재 채널 {pricingTotal}곳 중 무료·기다무 진입로가 {freeShare.toFixed(0)}%. 시작 비용을
                낮출 경로가 절반 이상 열려 있습니다.
              </>
            }
            action={
              <PanelAction href="/explore?pricing=free,wait-free" label="무료·기다무 작품 찾기" />
            }
          >
            <Donut
              segments={pricingSegments}
              center={
                <>
                  <span className="numeral text-2xl text-fg tabular-nums">{pricingTotal}</span>
                  <span className="text-xs text-fg-3">연재 채널</span>
                </>
              }
            />
          </Panel>

          <Panel className="lg:col-span-3" eyebrow="TAG CLOUD" title="독자 코드 TOP" insight="태그는 검색과 추천의 공통 언어로 사용됩니다."
            action={
              topTag ? (
                <PanelAction
                  href={`/explore?tag=${encodeURIComponent(topTag)}`}
                  label={`#${topTag} 작품 찾기`}
                />
              ) : undefined
            }
          >
            <TagCloud tags={tags.slice(0, 28)} />
          </Panel>

          <Panel className="lg:col-span-3" eyebrow="TRENDING" title="급상승 신호 상위작" aside={<Badge tone="neutral">추정</Badge>} insight="랭킹의 급상승 축과 함께 읽으면 현재 시장의 온도를 빠르게 볼 수 있습니다."
            action={<PanelAction href="/ranking?axis=trending" label="급상승 랭킹 보기" />}
          >
            <BarList
              max={trendingTop[0]?.stats.trendingScore ?? 1}
              items={trendingTop.map((title) => ({
                label: title.title,
                value: Math.round(title.stats.trendingScore),
                color: genreColor(title.genres[0], 0.7),
                dot: true,
                meta: title.genres[0],
              }))}
            />
          </Panel>

          <Panel className="lg:col-span-3" eyebrow="BINGE" title="완독률 상위작" aside={<Badge tone="neutral">추정</Badge>} insight="정주행 만족도가 높은 작품은 장기 추천에서 더 높은 가중치를 받습니다."
            action={<PanelAction href="/ranking?axis=binge" label="몰입작 랭킹 보기" />}
          >
            <BarList
              max={completionTop[0]?.stats.completionRate ?? 1}
              valueFormat={(value) => `${value}%`}
              items={completionTop.map((title) => ({
                label: title.title,
                value: Math.round(title.stats.completionRate),
                color: genreColor(title.genres[0], 0.7),
                dot: true,
                meta: title.genres[0],
              }))}
            />
          </Panel>
        </div>
        <SiteDisclosure title={b("데이터 안내 · 장르 스펙트럼", "Data guide and genre spectrum")} className="mt-5">
          <p className="text-sm leading-relaxed text-fg-2">{b("수록작 전체의 장르·플랫폼·평점·가격·어댑테이션을 집계한 독자용 대시보드입니다.", "A reader dashboard summarizing catalog genres, platforms, ratings, pricing and adaptations.")}</p>
          <SectionArt image="explore" className="mt-4 hidden aspect-[16/10] max-w-sm rounded-xl border border-line object-cover lg:block" />
          <div className="mt-7 max-w-xl">
            <GenreSpectrum
              genres={genreRows.map((row) => row.genre)}
              height={10}
              interactive
              label={`수록작 장르 스펙트럼 (${genreRows.length}개 장르)`}
            />
            <p className="mt-2 text-xs text-fg-3">
              바 위에 커서를 올리면 그 지점의 장르가 표시됩니다.
            </p>
          </div>
        </SiteDisclosure>
      </Container>
    </div>
  );
}
