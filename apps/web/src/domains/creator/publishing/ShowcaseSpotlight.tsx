// 쇼케이스 첫 화면 — 전용 머리말 + 주인공 작품 대형 조명.
// 주인공은 공개 작품 목록의 좋아요순 첫 작품(표지가 있으면 우선)이며, 선정 기준을 머리말에 그대로 밝힌다.
// 데이터는 갤러리 본문과 같은 공개 목록(listWorks)을 재사용하고, 비었거나 닿지 않으면 지어내지 않고 상태로 보여 준다.
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
import { pickSpotlightWork } from "./showcase-spotlight-model";
import { useShowcaseResource } from "./use-showcase-resource";

import { CoverImage } from "@/shared/components/cover-image";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { listWorks, type WorkSummary } from "@/platform/creator-client";

const TEXT_LINK = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-fg-2 underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function SpotlightSkeleton() {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
    <>
      <p className="sr-only" role="status">
        {bt("주목 작품을 불러오는 중입니다.", "Loading the spotlight work…")}
      </p>
      <div
        aria-hidden
        className="overflow-hidden rounded-3xl border border-line bg-panel/40 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]"
      >
        <span className="skeleton block aspect-[4/5] lg:aspect-auto lg:min-h-[30rem]" />
        <div className="space-y-3 p-5 sm:p-8">
          <span className="skeleton block h-4 w-36" />
          <span className="skeleton block h-10 w-3/4" />
          <span className="skeleton block h-4 w-1/3" />
          <span className="skeleton block h-4 w-full" />
          <span className="skeleton block h-4 w-2/3" />
          <span className="skeleton mt-2 block h-11 w-44 rounded-xl" />
        </div>
      </div>
    </>
  );
}

function SpotlightHeroWork({ work }: { work: WorkSummary }) {
  const bt = useBilingual("ShowcaseSpotlight");
  const { author } = work;
  return (
    <article className="relative isolate overflow-hidden rounded-3xl border border-line bg-panel/60 shadow-xl shadow-black/10 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-28 -z-10 size-80 rounded-full opacity-70 blur-3xl"
        style={{ background: "radial-gradient(circle, color-mix(in oklch, var(--color-accent) 30%, transparent), transparent 70%)" }}
      />
      <Link
        href={creatorWorkHref(work.id)}
        aria-label={formatI18nTemplate(bt("‘{title}’ 작품 보러 가기", "View the work ‘{title}’"), { title: work.title })}
        className="group relative block overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <CoverImage
          src={work.cover}
          alt={work.title}
          priority
          className="aspect-[4/5] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03] lg:aspect-auto lg:h-full lg:min-h-[30rem]"
          fallback={
            <span className="grid aspect-[4/5] w-full place-items-center bg-gradient-to-br from-accent-soft via-panel to-raised p-8 text-center lg:aspect-auto lg:h-full lg:min-h-[30rem]">
              <span>
                <span className="eyebrow text-accent">SPOTLIGHT</span>
                <span className="mt-2 block break-keep text-2xl font-black leading-snug text-fg">{work.title}</span>
                <span className="mt-2 block text-sm text-fg-2">{author.name}</span>
              </span>
            </span>
          }
        />
      </Link>

      <div className="relative flex min-w-0 flex-col justify-center p-5 sm:p-8">
        <p className="eyebrow text-accent">TODAY'S SPOTLIGHT</p>
        {work.seriesTitle ? (
          <p className="mt-3 text-sm font-semibold text-cool">
            {work.seriesTitle}
            {work.episodeNo != null
              ? ` · ${formatI18nTemplate(bt("{no}화", "Episode {no}"), { no: work.episodeNo })}`
              : ""}
          </p>
        ) : null}
        <h2 className="mt-2 break-keep text-3xl font-black tracking-tight text-fg sm:text-4xl">{work.title}</h2>
        <Link
          href={author.id ? creatorProfileHref(author.id) : SHOWCASE_HOME_PATH}
          className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <AuthorAvatar name={author.name} avatar={author.avatar} size="md" />
          <span className="font-semibold text-fg">{author.name}</span>
          <span className="text-sm text-fg-3">{bt("작가", "Creator")}</span>
        </Link>
        {work.description.trim() ? (
          <p className="mt-3 line-clamp-3 text-pretty break-keep text-base leading-7 text-fg-2">{work.description}</p>
        ) : null}
        {work.tags.length > 0 ? (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label={bt("작품 태그", "Work tags")}>
            {work.tags.slice(0, 4).map((tag) => (
              <li key={tag}>
                <Link
                  href={showcaseGalleryHref({ tag })}
                  className="inline-flex min-h-8 items-center rounded-full border border-line bg-card px-2.5 text-[0.8125rem] text-fg-2 transition-colors hover:border-accent/45 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
        <ul className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-fg-2" aria-label={bt("작품 반응", "Work reactions")}>
          <li className="inline-flex items-center gap-1.5">
            <Heart size={16} aria-hidden className="text-accent" />
            <span className="numeral font-semibold text-fg">{formatCount(work.likes)}</span>
            {bt("좋아요", "likes")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <MessageCircle size={16} aria-hidden className="text-fg-3" />
            <span className="numeral font-semibold text-fg">{formatCount(work.comments)}</span>
            {bt("댓글", "comments")}
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Eye size={16} aria-hidden className="text-fg-3" />
            <span className="numeral font-semibold text-fg">{formatCount(work.views)}</span>
            {bt("조회", "views")}
          </li>
        </ul>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Link href={creatorWorkHref(work.id)} className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5 shadow-lg shadow-accent/20" })}>
            {bt("작품 보러 가기", "View the work")}
            <ArrowRight size={16} aria-hidden />
          </Link>
          {author.id ? (
            <Link href={creatorProfileHref(author.id)} className={buttonClass({ size: "md", variant: "outline", className: "gap-1.5" })}>
              {bt("작가 프로필", "Creator profile")}
            </Link>
          ) : null}
        </div>
      </div>
    </article>
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

  return (
    <>
      <header className="mb-6">
        <p className="eyebrow text-accent">TOONSTUDIO SHOWCASE</p>
        <h1 className="mt-2 text-balance break-keep text-4xl font-black tracking-tight text-fg sm:text-5xl">
          {bt("쇼케이스", "Showcase")}
        </h1>
        <p className="mt-3 max-w-2xl text-pretty break-keep text-base leading-7 text-fg-2">
          {bt(
            "지금 가장 주목받는 작품과 작가를 조명합니다. 공개 작품 중 좋아요를 가장 많이 받은 작품이 오늘의 주인공이에요.",
            "A spotlight on the works and creators getting the most love right now — the public work with the most likes takes today's spotlight.",
          )}
        </p>
        <nav aria-label={bt("쇼케이스 바로가기", "Showcase shortcuts")} className="mt-2 flex flex-wrap gap-x-4">
          <Link href={SHOWCASE_CHALLENGES_PATH} className={TEXT_LINK}>
            <Trophy size={15} aria-hidden className="text-accent" />
            {bt("창작 챌린지", "Challenges")}
          </Link>
          <Link href={SHOWCASE_REVIEWS_PATH} className={TEXT_LINK}>
            <ShieldCheck size={15} aria-hidden className="text-accent" />
            {bt("승인본 전시", "Approved showcase")}
          </Link>
        </nav>
      </header>

      <section aria-label={bt("오늘의 주인공 작품", "Today's spotlight work")}>
        {spotlight.status === "error" ? (
          <ShowcaseUnavailableState
            title={bt("주목 작품을 잠시 불러올 수 없어요", "The spotlight is temporarily unavailable")}
            detail={spotlight.error}
            onRetry={spotlight.reload}
          />
        ) : spotlight.status !== "ready" ? (
          <SpotlightSkeleton />
        ) : hero === null ? (
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
        ) : (
          <SpotlightHeroWork work={hero} />
        )}
      </section>
    </>
  );
}
