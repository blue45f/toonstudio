// 추천 작품은 실제 표지 한 장과 다음 행동으로 소개하고, 검색·목록을 큰 무대로 밀어내지 않는다.
import { ArrowRight, ChevronDown, Clapperboard, Eye, Heart, Megaphone, MessageCircle, RefreshCw, ShieldCheck, Trophy } from "lucide-react";
import type { KeyboardEvent } from "react";

import {
  SHOWCASE_CHALLENGES_PATH,
  SHOWCASE_PROMO_PATH,
  SHOWCASE_REVIEWS_PATH,
  creatorProfileHref,
  creatorWorkHref,
  showcaseGalleryHref,
} from "./showcase-links";
import { pickSpotlightWork } from "./showcase-spotlight-model";
import { useShowcaseResource } from "./use-showcase-resource";

import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { CoverImage } from "@/shared/components/cover-image";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";
import { listWorks, type WorkSummary } from "@/platform/creator-client";

const TEXT_LINK = "inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-fg-2 underline-offset-4 transition-colors hover:text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none";
const CARD_CLASS = "rounded-2xl border border-accent/30 bg-gradient-to-r from-accent-soft via-panel to-cool/10 p-3 sm:p-4";
const COVER_CLASS = "h-[5.875rem] w-[4.625rem] shrink-0 overflow-hidden rounded-xl sm:h-[6.75rem] sm:w-[7.625rem]";

export function ShowcaseHeader() {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
    <SitePageHeader
      eyebrow={bt("작품 탐색", "Showcase")}
      title={bt("마음에 드는 작품을 찾아보세요", "Find a work you'll love")}
      description={bt("공개 작품과 작가를 둘러보고, 관심 있는 작품을 열어보세요.", "Explore public works and creators, then open something you love.")}
      surface="plain"
      className="mb-5"
    />
  );
}

/** 창작 참여 목적의 바로가기는 이름 있는 참여 영역에서 다시 찾을 수 있다. */
export function ShowcaseShortcutLinks() {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
    <nav aria-label={bt("쇼케이스 바로가기", "Showcase shortcuts")} className="flex flex-wrap gap-x-4 gap-y-1">
      <Link href={SHOWCASE_CHALLENGES_PATH} className={TEXT_LINK}><Trophy size={15} aria-hidden />{bt("창작 챌린지", "Challenges")}</Link>
      <Link href={SHOWCASE_REVIEWS_PATH} className={TEXT_LINK}><ShieldCheck size={15} aria-hidden />{bt("승인본 전시", "Approved showcase")}</Link>
      <Link href={SHOWCASE_PROMO_PATH} className={TEXT_LINK}><Clapperboard size={15} aria-hidden />{bt("홍보 영상 스튜디오", "Promo video studio")}</Link>
      <Link href="/community/promote" className={TEXT_LINK}><Megaphone size={15} aria-hidden />{bt("신작·작가 홍보 게시판", "Creator promotion board")}</Link>
    </nav>
  );
}

function CoverTitleTile({ work }: { readonly work: WorkSummary }) {
  return <span className="grid size-full place-items-center bg-raised p-2 text-center text-xs font-bold text-fg"><span className="line-clamp-3 break-keep">{work.title}</span></span>;
}

function SpotlightSkeleton() {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
    <div className={CARD_CLASS} data-showcase-spotlight-state="loading">
      <p className="sr-only" role="status">{bt("주목 작품을 불러오는 중입니다.", "Loading the spotlight work…")}</p>
      <div aria-hidden className="flex items-center gap-3 sm:gap-5">
        <span className={"skeleton block " + COVER_CLASS} />
        <div className="min-w-0 flex-1 space-y-2">
          <span className="skeleton block h-4 w-2/3" />
          <span className="skeleton block h-4 w-full max-w-md" />
          <span className="skeleton block h-11 w-36 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

function closeInfoOnEscape(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "Escape") return;
  const details = event.currentTarget.closest("details");
  if (!(details instanceof HTMLDetailsElement)) return;
  event.preventDefault();
  details.open = false;
  details.querySelector("summary")?.focus();
}

function SpotlightInformation({ work }: { readonly work: WorkSummary }) {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
      <details className="group/spotlight-info" onBlur={(event) => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }} aria-label={bt("추천 작품 정보", "Spotlight work information")}>
        <summary onKeyDown={closeInfoOnEscape} className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-1 rounded-xl border border-line bg-panel px-2 text-xs font-semibold text-fg-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden">
          {bt("작품 정보", "Work info")}<ChevronDown size={14} aria-hidden className="shrink-0 transition-transform group-open/spotlight-info:rotate-180 motion-reduce:transition-none" />
        </summary>
        <div className="absolute left-3 right-3 top-full z-10 mt-2 max-h-[min(24rem,60dvh)] space-y-2 overflow-y-auto rounded-xl border border-line bg-panel p-3 text-sm text-fg-2 shadow-xl">
          <p>{bt("공개 작품의 좋아요순 목록에서 표지가 있는 작품을 우선 소개합니다.", "From public works ordered by likes, a work with a cover is featured first.")}</p>
          {work.seriesTitle ? <p>{work.seriesTitle}{work.episodeNo != null ? " · " + formatI18nTemplate(bt("{no}화", "Episode {no}"), { no: work.episodeNo }) : ""}</p> : null}
          {work.author.id ? <Link href={creatorProfileHref(work.author.id)} onKeyDown={closeInfoOnEscape} className={TEXT_LINK}>{work.author.name} · {bt("작가 프로필", "Creator profile")}</Link> : <p>{work.author.name}</p>}
          {work.tags.length > 0 ? <ul className="flex flex-wrap gap-2" aria-label={bt("작품 태그", "Work tags")}>{work.tags.slice(0, 4).map(tag => <li key={tag}><Link href={showcaseGalleryHref({ tag })} onKeyDown={closeInfoOnEscape} className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-3 text-sm text-fg-2 outline-none hover:text-accent focus-visible:ring-2 focus-visible:ring-accent">{"#" + tag}</Link></li>)}</ul> : null}
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs" aria-label={bt("작품 반응", "Work reactions")}>
            <li className="inline-flex items-center gap-1.5"><Heart size={14} aria-hidden />{formatCount(work.likes)} {bt("좋아요", "likes")}</li>
            <li className="inline-flex items-center gap-1.5"><MessageCircle size={14} aria-hidden />{formatCount(work.comments)} {bt("댓글", "comments")}</li>
            <li className="inline-flex items-center gap-1.5"><Eye size={14} aria-hidden />{formatCount(work.views)} {bt("조회", "views")}</li>
          </ul>
        </div>
      </details>
  );
}

function SpotlightWork({ work }: { readonly work: WorkSummary }) {
  const bt = useBilingual("ShowcaseSpotlight");
  return (
    <article className={"relative " + CARD_CLASS} data-showcase-spotlight-state="ready">
      <div className="grid grid-cols-[4.625rem_minmax(0,1fr)] items-center gap-x-3 sm:grid-cols-[7.625rem_minmax(0,1fr)] sm:gap-x-5">
        <Link href={creatorWorkHref(work.id)} aria-label={formatI18nTemplate(bt("‘{title}’ 작품 보러 가기", "View the work ‘{title}’"), { title: work.title })} className={COVER_CLASS + " min-[375px]:row-span-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"}>
          {work.cover.trim() ? <CoverImage src={work.cover} alt={work.title} priority className="size-full object-cover" fallback={<CoverTitleTile work={work} />} /> : <CoverTitleTile work={work} />}
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-accent">{bt("주목할 작품", "Spotlight work")}</p>
          <h2 className="mt-0.5 line-clamp-2 break-keep text-base font-bold leading-snug text-fg sm:text-xl">{work.title}</h2>
          {work.description.trim() ? <p className="mt-1 line-clamp-2 break-keep text-xs leading-5 text-fg-2 sm:text-sm">{work.description}</p> : null}
        </div>
        <div className="col-span-2 mt-2 flex flex-wrap items-center gap-2 min-[375px]:col-span-1">
          <Link href={creatorWorkHref(work.id)} className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 gap-1 px-2.5 text-xs" })}>
            {bt("작품 자세히 보기", "View work details")}<ArrowRight size={15} aria-hidden />
          </Link>
          <SpotlightInformation work={work} />
        </div>
      </div>
    </article>
  );
}

export function ShowcaseSpotlight() {
  const bt = useBilingual("ShowcaseSpotlight");
  const spotlight = useShowcaseResource<WorkSummary[]>("showcase-spotlight", (signal) => listWorks({ sort: "likes" }, signal), bt("주목 작품을 불러오지 못했습니다.", "Couldn't load the spotlight work."));
  const hero = spotlight.status === "ready" ? pickSpotlightWork(spotlight.data) : null;
  return (
    <section className="mb-5" aria-label={bt("오늘의 주인공 작품", "Today's spotlight work")}>
      {hero ? <SpotlightWork work={hero} /> : spotlight.status === "error" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-3 sm:p-4" data-slot="showcase-unavailable" data-showcase-spotlight-state="error" role="status">
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-fg">{bt("주목 작품을 잠시 불러올 수 없어요", "The spotlight is temporarily unavailable")}</p><p className="mt-1 text-xs text-fg-2">{spotlight.error}</p></div>
          <button type="button" onClick={spotlight.reload} className={buttonClass({ variant: "outline", className: "min-h-11 gap-1.5" })}><RefreshCw size={15} aria-hidden />{bt("다시 시도", "Try again")}</button>
        </div>
      ) : spotlight.status === "ready" ? (
        <div className="rounded-2xl border border-dashed border-line bg-panel p-3 sm:p-4" data-showcase-spotlight-state="empty"><p className="text-sm font-semibold text-fg">{bt("아직 조명할 작품이 없어요", "No works to spotlight yet")}</p><p className="mt-1 text-xs text-fg-2">{bt("공개된 작품이 생기면 이곳에서 소개합니다.", "Public works will be introduced here when available.")}</p></div>
      ) : <SpotlightSkeleton />}
    </section>
  );
}
