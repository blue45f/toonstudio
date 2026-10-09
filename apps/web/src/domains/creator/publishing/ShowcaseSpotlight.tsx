// 쇼케이스 첫 화면 — 실제 작품 표지가 주인공인 전폭 무대.
// 무대 배경은 공개 작품들의 실제 표지 모자이크이고, 그 위에 페이지 머리말과 오늘의 주인공
// 정보를 스크림으로 얹는다(카피가 표지 아트에 종속되는 구도). 무대 아래에는 표지 레일이
// 붙어 있어 첫 화면의 표지 그리드가 본문 갤러리로 이어진다.
// 주인공은 공개 작품 목록의 좋아요순 첫 작품(표지가 있으면 우선)이며, 선정 기준을 머리말에
// 그대로 밝힌다. 데이터는 갤러리 본문과 같은 공개 목록(listWorks)을 재사용하고, 표지가 없는
// 작품은 지어내지 않고 제목 타이포 타일로 정직하게 보여 준다.
import { ArrowRight, Eye, Heart, MessageCircle, ShieldCheck, Sparkles, Trophy } from "lucide-react";

import { AuthorAvatar } from "../creator-community-ui";
import {
  SHOWCASE_CHALLENGES_PATH,
  SHOWCASE_HOME_PATH,
  SHOWCASE_REVIEWS_PATH,
  creatorProfileHref,
  creatorWorkHref,
  showcaseGalleryHref,
} from "./showcase-links";
import { ShowcaseEmptyState, ShowcaseUnavailableState } from "./ShowcaseStates";
import { pickSpotlightWork, pickStageWorks } from "./showcase-spotlight-model";
import { useShowcaseResource } from "./use-showcase-resource";

import { CoverImage } from "@/shared/components/cover-image";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { listWorks, type WorkSummary } from "@/platform/creator-client";

const TEXT_LINK = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-fg-2 underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const STAGE_TEXT_LINK = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-white/85 underline-offset-4 transition-colors hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

/** 표지가 없거나 로드에 실패한 작품의 자리 — 없는 표지를 있는 것처럼 꾸미지 않는 타이포 타일. */
function CoverTitleTile({ title, authorName, className }: { title: string; authorName: string; className?: string }) {
  return (
    <span className={`grid size-full place-items-center bg-gradient-to-br from-accent-soft via-panel to-raised p-3 text-center ${className ?? ""}`}>
      <span className="min-w-0">
        <span className="block break-keep text-sm font-black leading-snug text-fg">{title}</span>
        <span className="mt-1 block truncate text-xs text-fg-2">{authorName}</span>
      </span>
    </span>
  );
}

function ShowcaseHeader({ onStage }: { onStage?: boolean }) {
  const bt = useBilingual("ShowcaseSpotlight");
  const titleClass = onStage ? "text-white" : "text-fg";
  const bodyClass = onStage ? "text-white/85" : "text-fg-2";
  return (
    <header className={onStage ? "motion-safe:animate-fade-up" : undefined}>
      <p className={`eyebrow ${onStage ? "text-white/85" : "text-accent"}`}>TOONSTUDIO SHOWCASE</p>
      <h1 className={`mt-2 text-balance break-keep text-4xl font-black tracking-tight sm:text-5xl ${titleClass}`}>
        {bt("쇼케이스", "Showcase")}
      </h1>
      <p className={`mt-3 max-w-2xl text-pretty break-keep text-base leading-7 ${bodyClass}`}>
        {bt(
          "지금 가장 주목받는 작품과 작가를 조명합니다. 공개 작품 중 좋아요를 가장 많이 받은 작품이 오늘의 주인공이에요.",
          "A spotlight on the works and creators getting the most love right now — the public work with the most likes takes today's spotlight.",
        )}
      </p>
      <nav aria-label={bt("쇼케이스 바로가기", "Showcase shortcuts")} className="mt-2 flex flex-wrap gap-x-4">
        <Link href={SHOWCASE_CHALLENGES_PATH} className={onStage ? STAGE_TEXT_LINK : TEXT_LINK}>
          <Trophy size={15} aria-hidden className={onStage ? "text-white" : "text-accent"} />
          {bt("창작 챌린지", "Challenges")}
        </Link>
        <Link href={SHOWCASE_REVIEWS_PATH} className={onStage ? STAGE_TEXT_LINK : TEXT_LINK}>
          <ShieldCheck size={15} aria-hidden className={onStage ? "text-white" : "text-accent"} />
          {bt("승인본 전시", "Approved showcase")}
        </Link>
      </nav>
    </header>
  );
}

function SpotlightSkeleton() {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
    <>
      <p className="sr-only" role="status">
        {bt("주목 작품을 불러오는 중입니다.", "Loading the spotlight work…")}
      </p>
      <div aria-hidden className="overflow-hidden rounded-3xl border border-line bg-panel/40">
        <div className="flex min-h-[32rem] flex-col justify-between p-6 sm:p-10">
          <div className="space-y-3">
            <span className="skeleton block h-4 w-36" />
            <span className="skeleton block h-12 w-56" />
            <span className="skeleton block h-4 w-2/3" />
          </div>
          <div className="space-y-3">
            <span className="skeleton block h-4 w-32" />
            <span className="skeleton block h-10 w-1/2" />
            <span className="skeleton block h-4 w-1/3" />
            <span className="skeleton mt-2 block h-11 w-44 rounded-xl" />
          </div>
        </div>
        <div className="flex gap-3 border-t border-line p-4 sm:p-5">
          {[0, 1, 2, 3, 4].map((index) => (
            <span key={index} className="skeleton block aspect-[3/4] w-24 shrink-0 rounded-lg sm:w-28" />
          ))}
        </div>
      </div>
    </>
  );
}

/** 무대 배경 모자이크 한 칸 — 표지가 있는 작품만 그리고, 없는 작품은 그리지 않는다(빈 src로 두면 브라우저가 페이지를 다시 받으려 한다). */
function StageCoverCell({ work }: { work: WorkSummary }) {
  if (work.cover.trim().length === 0) {
    return (
      <span className="relative block overflow-hidden">
        <CoverTitleTile title={work.title} authorName={work.author.name} />
      </span>
    );
  }
  return (
    <span className="relative block overflow-hidden">
      <CoverImage
        src={work.cover}
        alt=""
        className="absolute inset-0 size-full object-cover"
        fallback={<CoverTitleTile title={work.title} authorName={work.author.name} />}
      />
    </span>
  );
}

/** 무대 배경 모자이크 — 장식 전용. 칸(12개)이 모자라면 같은 표지를 반복해 채우고, 정본 목록은 아래 레일과 본문 갤러리다. */
function StageCoverMosaic({ works }: { works: readonly WorkSummary[] }) {
  const cells: WorkSummary[] = [];
  if (works.length > 0) {
    for (let i = 0; cells.length < 12; i += 1) {
      const work = works[i % works.length];
      if (!work) break;
      cells.push(work);
    }
  }
  return (
    <div aria-hidden className="absolute inset-0 grid grid-cols-4 md:grid-cols-6">
      {cells.map((work, index) => (
        <StageCoverCell key={`${work.id}-${index}`} work={work} />
      ))}
    </div>
  );
}

function SpotlightHeroInfo({ work }: { work: WorkSummary }) {
  const bt = useBilingual("ShowcaseSpotlight");
  const { author } = work;
  return (
    <div className="motion-safe:animate-fade-up flex flex-wrap items-end gap-5 sm:gap-7" style={{ animationDelay: "120ms" }}>
      <Link
        href={creatorWorkHref(work.id)}
        aria-label={formatI18nTemplate(bt("‘{title}’ 작품 보러 가기", "View the work ‘{title}’"), { title: work.title })}
        className="group relative hidden w-32 shrink-0 overflow-hidden rounded-xl shadow-2xl shadow-black/50 ring-1 ring-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white md:block lg:w-36"
      >
        {work.cover.trim().length > 0 ? (
          <CoverImage
            src={work.cover}
            alt={work.title}
            priority
            className="aspect-[3/4] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.04]"
            fallback={<CoverTitleTile title={work.title} authorName={author.name} className="aspect-[3/4]" />}
          />
        ) : (
          <CoverTitleTile title={work.title} authorName={author.name} className="aspect-[3/4]" />
        )}
      </Link>

      <div className="min-w-0 max-w-2xl flex-1 text-white">
        <p className="eyebrow text-white/85">TODAY'S SPOTLIGHT</p>
        {work.seriesTitle ? (
          <p className="mt-3 text-sm font-semibold text-white/75">
            {work.seriesTitle}
            {work.episodeNo != null
              ? ` · ${formatI18nTemplate(bt("{no}화", "Episode {no}"), { no: work.episodeNo })}`
              : ""}
          </p>
        ) : null}
        <h2 className="mt-2 break-keep text-4xl font-black tracking-tight sm:text-5xl">{work.title}</h2>
        <Link
          href={author.id ? creatorProfileHref(author.id) : SHOWCASE_HOME_PATH}
          className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <AuthorAvatar name={author.name} avatar={author.avatar} size="md" />
          <span className="font-semibold">{author.name}</span>
          <span className="text-sm text-white/70">{bt("작가", "Creator")}</span>
        </Link>
        {work.description.trim() ? (
          <p className="mt-3 line-clamp-2 text-pretty break-keep text-base leading-7 text-white/85">{work.description}</p>
        ) : null}
        {work.tags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={bt("작품 태그", "Work tags")}>
            {work.tags.slice(0, 4).map((tag) => (
              <li key={tag}>
                <Link
                  href={showcaseGalleryHref({ tag })}
                  className="inline-flex min-h-8 items-center rounded-full border border-white/30 bg-white/10 px-2.5 text-[0.8125rem] text-white backdrop-blur-sm transition-colors hover:border-white/60 hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85" aria-label={bt("작품 반응", "Work reactions")}>
          <li className="inline-flex items-center gap-1.5">
            <Heart size={16} aria-hidden className="text-white" />
            <span className="numeral font-semibold text-white">{formatCount(work.likes)}</span>
            {bt("좋아요", "likes")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <MessageCircle size={16} aria-hidden className="text-white/70" />
            <span className="numeral font-semibold text-white">{formatCount(work.comments)}</span>
            {bt("댓글", "comments")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Eye size={16} aria-hidden className="text-white/70" />
            <span className="numeral font-semibold text-white">{formatCount(work.views)}</span>
            {bt("조회", "views")}
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link href={creatorWorkHref(work.id)} className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-black/40" })}>
            {bt("작품 보러 가기", "View the work")}
            <ArrowRight size={16} aria-hidden />
          </Link>
          {author.id ? (
            <Link
              href={creatorProfileHref(author.id)}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-white/35 bg-black/35 px-4 py-2 text-sm font-bold text-white backdrop-blur-sm transition-colors hover:bg-black/55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {bt("작가 프로필", "Creator profile")}
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** 무대 아래에 붙는 표지 레일 — 첫 화면의 표지 그리드를 본문 갤러리까지 잇는 띠. */
function SpotlightCoverRail({ works, heroId }: { works: readonly WorkSummary[]; heroId: string }) {
  const bt = useBilingual("ShowcaseSpotlight");
  if (works.length === 0) return null;
  return (
    <nav aria-label={bt("표지로 바로 고르기", "Pick a work by its cover")} className="relative border-t border-white/10 bg-black/50 backdrop-blur-sm">
      <div className="flex items-baseline gap-3 px-5 pt-3 sm:px-6">
        <h3 className="text-sm font-bold text-white">{bt("표지로 바로 고르기", "Pick by cover")}</h3>
        <p className="text-xs text-white/60">{bt("표지를 누르면 작품 페이지로 이동해요.", "Tap a cover to open the work.")}</p>
      </div>
      <ul className="flex gap-3 overflow-x-auto px-5 pb-4 pt-3 sm:gap-4 sm:px-6">
        {works.map((work) => (
          <li key={work.id} className="shrink-0">
            <Link
              href={creatorWorkHref(work.id)}
              className="group block w-20 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:w-24"
              aria-label={formatI18nTemplate(bt("‘{title}’ 작품 보러 가기", "View the work ‘{title}’"), { title: work.title })}
            >
              <span className="relative block overflow-hidden rounded-lg ring-1 ring-white/20 transition group-hover:ring-2 group-hover:ring-accent">
                {work.cover.trim().length > 0 ? (
                  <CoverImage
                    src={work.cover}
                    alt=""
                    className="aspect-[3/4] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.05]"
                    fallback={<CoverTitleTile title={work.title} authorName={work.author.name} className="aspect-[3/4]" />}
                  />
                ) : (
                  <CoverTitleTile title={work.title} authorName={work.author.name} className="aspect-[3/4]" />
                )}
                {work.id === heroId ? (
                  <span className="absolute left-1.5 top-1.5 rounded-full bg-accent px-2 py-0.5 text-[0.65rem] font-bold text-on-accent shadow">
                    {bt("오늘의 주인공", "Spotlight")}
                  </span>
                ) : null}
              </span>
              <span className="mt-2 block truncate text-xs font-semibold text-white/90">{work.title}</span>
              <span className="block truncate text-[0.7rem] text-white/55">{work.author.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SpotlightStage({ hero, works }: { hero: WorkSummary; works: readonly WorkSummary[] }) {
  const bt = useBilingual("ShowcaseSpotlight");
  const stageWorks = pickStageWorks(works, 12);
  return (
    <section
      aria-label={bt("오늘의 주인공 작품", "Today's spotlight work")}
      className="overflow-hidden rounded-3xl border border-line bg-[#0d1020] shadow-xl shadow-black/25"
    >
      <div className="relative isolate flex min-h-[34rem] flex-col overflow-hidden sm:min-h-[36rem]">
        <StageCoverMosaic works={stageWorks} />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/30" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />
        <div className="relative p-6 pb-0 sm:p-8 sm:pb-0 lg:p-10 lg:pb-0">
          <ShowcaseHeader onStage />
        </div>
        <article className="relative mt-auto p-6 pt-8 sm:p-8 sm:pt-10 lg:p-10 lg:pt-10">
          <SpotlightHeroInfo work={hero} />
        </article>
      </div>
      <SpotlightCoverRail works={stageWorks} heroId={hero.id} />
    </section>
  );
}

export function ShowcaseSpotlight() {
  const bt = useBilingual("ShowcaseSpotlight");
  const spotlight = useShowcaseResource<WorkSummary[]>(
    "showcase-spotlight",
    (signal) => listWorks({ sort: "likes" }, signal),
    bt("주목 작품을 불러오지 못했습니다.", "Couldn't load the spotlight work."),
  );
  const hero = spotlight.status === "ready" ? pickSpotlightWork(spotlight.data) : null;

  if (spotlight.status === "ready" && hero !== null) {
    return <SpotlightStage hero={hero} works={spotlight.data} />;
  }

  return (
    <>
      <div className="mb-6">
        <ShowcaseHeader />
      </div>
      <section aria-label={bt("오늘의 주인공 작품", "Today's spotlight work")}>
        {spotlight.status === "error" ? (
          <ShowcaseUnavailableState
            title={bt("주목 작품을 잠시 불러올 수 없어요", "The spotlight is temporarily unavailable")}
            detail={spotlight.error}
            onRetry={spotlight.reload}
          />
        ) : spotlight.status !== "ready" ? (
          <SpotlightSkeleton />
        ) : (
          <ShowcaseEmptyState
            icon={Sparkles}
            title={bt("아직 조명할 작품이 없어요", "No works to spotlight yet")}
            description={bt(
              "공개된 작품이 쌓이면 가장 주목받는 작품부터 이곳에서 소개합니다.",
              "Once public works arrive, the most-loved ones will be introduced here first.",
            )}
            action={
              <Link href="/studio/publish" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/20" })}>
                {bt("내 작품 공개하기", "Publish your work")}
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
