// 쇼케이스(/showcase) — 검색·보기 조건 → 전체 작품 → 추천·창작 참여 안내.
// 만들기 갤러리 본체(CreateGalleryPage)는 건드리지 않고, 갤러리 본문은 공유 컴포넌트
// (GalleryToolbar·GalleryTabPanel)를 그대로 재사용한다.
import { ArrowRight, ChevronDown, Send } from "lucide-react";
import { Suspense, useEffect, useRef, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";

import "./showcase/showcase-page.css";
import { GalleryToolbar } from "./publishing/GalleryControls";
import { GalleryTabPanel } from "./publishing/GalleryTabPanels";
import { parseGalleryView, patchSearchParams } from "./publishing/gallery-query";
import { ShowcaseSocialHubBar } from "./publishing/ShowcaseSocialHubBar";
import { ShowcaseHeader, ShowcaseShortcutLinks, ShowcaseSpotlight } from "./publishing/ShowcaseSpotlight";

import { CreativeJourneyLinks } from "@/shared/components/public-creative";
import { Container } from "@/shared/components/section";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { SiteArtSurfaceSpotlight } from "@/shared/components/site-experience/SiteArtSurfaceSpotlight";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import Link from "@/shared/navigation/router-link";
import { SHOWCASE_COLLABORATION_TRACKS } from "@/shared/navigation/webtoon-platform-router-ux-model";

const LazyCreatorSerializationPaceBoard = lazyRetry(
  () =>
    import("./fresh-ideas/CreatorSerializationPaceBoard").then((module) => ({
      default: module.CreatorSerializationPaceBoard,
    })),
  "CreatorSerializationPaceBoard",
);

const SHOWCASE_TRACK_IMAGES: Readonly<Record<string, string>> = {
  "portfolio-curation": "/assets/site-experience/site-art-v1/cards/nb-showcase-premiere-640.webp",
  "team-recruiting": "/assets/site-experience/site-art-v1/cards/nb-community-plaza-640.webp",
  "contest-pitch": "/assets/site-experience/site-art-v1/cards/nb-planning-storylab-640.webp",
};

/** 입력 중인 초안은 네이티브 입력에 두고, 제출한 검색 조건만 주소와 동기화한다. */
function ShowcaseSearchForm({ searchText, searchable, onFind }: {
  readonly searchText: string;
  readonly searchable: boolean;
  readonly onFind: (value: string | null) => void;
}) {
  const bt = useBilingual("ShowcasePage");
  const inputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const submittedRef = useRef<string | null>(null);
  useEffect(() => {
    if (submittedRef.current === searchText) {
      submittedRef.current = null;
      return;
    }
    submittedRef.current = null;
    if (inputRef.current) inputRef.current.value = searchText;
  }, [searchText]);

  return (
    <form
      role="search"
      aria-label={bt("불러온 작품에서 찾기", "Find in loaded works")}
      className="mb-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!searchable || composingRef.current) return;
        const value = new FormData(event.currentTarget).get("q");
        const next = typeof value === "string" ? value.trim().slice(0, 200) : "";
        if (inputRef.current) inputRef.current.value = next;
        submittedRef.current = next;
        onFind(next || null);
      }}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="search"
          name="q"
          maxLength={200}
          defaultValue={searchText}
          disabled={!searchable}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)) {
              event.preventDefault();
            }
          }}
          aria-label={bt("불러온 작품에서 제목·작가 찾기", "Find a title or creator in loaded works")}
          aria-describedby="showcase-search-scope"
          placeholder={bt("불러온 작품에서 제목·작가 찾기", "Find a title or creator in loaded works")}
          className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm text-fg outline-none placeholder:text-fg-3 focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!searchable}
          className={buttonClass({ variant: "solid", className: "min-h-11 shrink-0 whitespace-nowrap rounded-lg px-4 font-medium" })}
        >
          {bt("찾기", "Find")}
        </button>
        {searchText && searchable ? (
          <button
            type="button"
            onClick={() => onFind(null)}
            className={buttonClass({ variant: "ghost", className: "min-h-11 shrink-0 whitespace-nowrap rounded-lg font-medium" })}
          >
            {bt("검색 지우기", "Clear search")}
          </button>
        ) : null}
      </div>
      <p id="showcase-search-scope" className="mt-1.5 text-xs leading-5 text-fg-3">
        {searchable
          ? bt("불러온 목록의 제목·작가만 찾습니다", "Search titles and creators in the loaded list only")
          : bt(
              "이 보기에서는 제목·작가 찾기를 제공하지 않습니다. 검색어는 전체 작품·북마크로 돌아오면 유지됩니다.",
              "Title and creator search is unavailable in this view. Your term remains when you return to All works or Bookmarks.",
            )}
      </p>
    </form>
  );
}

export function ShowcasePage() {
  const bt = useBilingual("ShowcasePage");
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseGalleryView(searchParams);
  const searchText = (searchParams.get("q") ?? "").trim().slice(0, 200);
  const searchable = view.tab === "works" || view.tab === "saved";
  const galleryQuery = searchParams.toString();
  const galleryAnchor = `${galleryQuery ? `?${galleryQuery}` : ""}#showcase-browse-title`;

  const patchView = (patch: Readonly<Record<string, string | null>>) => {
    setSearchParams(patchSearchParams(searchParams, patch), { replace: true });
  };
  const clearAllFilters = () => patchView({ tag: null, content: null, provenance: null, portfolio: null });

  return (
    <Container size="wide" className="showcase-surface py-6 sm:py-10">
      <SiteContextualSubNav pathnameOverride="/showcase" className="mb-4" />
      <ShowcaseHeader />

      <section aria-labelledby="showcase-browse-title" className="mt-5">
        <ShowcaseSearchForm searchText={searchText} searchable={searchable} onFind={(q) => patchView({ q })} />
        <GalleryToolbar view={view} onPatch={patchView} compactFilters />
        <div className="mb-5 mt-5">
          <h2
            id="showcase-browse-title"
            data-ink="line"
            className="inline-block pb-0.5 text-xl font-semibold tracking-tight text-fg [word-break:keep-all] sm:text-2xl"
          >
            {bt("전체 작품 둘러보기", "Browse all works")}
          </h2>
        </div>
        <div key={`${view.tab}-${view.query.sort}-${view.query.contentType}`} className="ink-cascade">
          <GalleryTabPanel
            view={view}
            onResetFilters={clearAllFilters}
            searchText={searchText}
            onClearSearch={() => patchView({ q: null })}
            featuredCollapsed
          />
        </div>
        {view.tab === "works" && !searchText ? (
          <details className="group/showcase-spotlight mt-5 rounded-xl border border-line bg-panel/45">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3.5 text-sm font-medium text-fg-2 outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
              {bt("추천 작품 한 편 보기", "See a spotlight work")}
              <ChevronDown size={16} aria-hidden className="transition-transform duration-150 group-open/showcase-spotlight:rotate-180 motion-reduce:transition-none" />
            </summary>
            <div className="border-t border-line p-3.5">
              <ShowcaseSpotlight />
            </div>
          </details>
        ) : null}
      </section>

      <details
        className="group/showcase-participation mt-8 rounded-2xl border border-line bg-panel/40"
        aria-label={bt("내 작품 소개·협업 참여", "Share your work and collaborate")}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-fg-2 outline-none transition-colors duration-150 hover:text-fg focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
          {bt("내 작품 소개·협업 참여", "Share your work and collaborate")}
          <ChevronDown className="size-4 shrink-0 text-fg-3 transition-transform duration-150 group-open/showcase-participation:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="space-y-6 border-t border-line p-4 sm:p-5">
          <ShowcaseShortcutLinks />
          <ShowcaseSocialHubBar />
          <section
            aria-label={bt("크리에이터 쇼케이스 · 협업 · 공모 트랙", "Creator showcase, collaboration & contest tracks")}
            data-testid="showcase-rea-collaboration-tracks"
            className="space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-accent">
                  {bt("작품 소개 · 팀 모집 · 공모", "Portfolio, recruiting & contests")}
                </p>
                <h2 className="mt-0.5 text-sm font-semibold text-fg">
                  {bt("작품 소개와 협업 시작하기", "Share work and start collaborating")}
                </h2>
              </div>
              <span className="rounded-md border border-line bg-canvas px-2.5 py-0.5 text-xs text-fg-3">
                {bt("공정별 포트폴리오 · 팀 매칭 · 공모전 연결", "Stage Portfolio · Team Match · Contest")}
              </span>
            </div>
            <div
              className="grid gap-3 md:grid-cols-3"
              data-ink-stagger="panel"
              style={{ "--ink-radius": "12px" } as CSSProperties}
            >
              {SHOWCASE_COLLABORATION_TRACKS.map((track) => (
                <div
                  key={track.id}
                  className="ink-frame flex flex-col justify-between rounded-xl border border-line bg-card/85 p-3.5 transition-colors duration-150 hover:bg-card motion-reduce:transition-none"
                >
                  <div>
                    <div className="ink-cover ink-sheen mb-3 aspect-[16/9] w-full overflow-hidden rounded-lg border border-line/60 bg-raised">
                      <img
                        src={SHOWCASE_TRACK_IMAGES[track.id] ?? "/assets/site-experience/site-art-v1/cards/nb-showcase-premiere-640.webp"}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <span className="inline-block rounded-md border border-accent/35 bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                      {track.badge}
                    </span>
                    <h3 className="mt-2 text-sm font-semibold text-fg [word-break:keep-all]">{track.label}</h3>
                    <p className="mt-1 text-xs leading-relaxed text-fg-2">{track.description}</p>
                  </div>
                  <div className="mt-3 border-t border-line/60 pt-2">
                    <Link
                      href={track.id === "portfolio-curation" ? galleryAnchor : track.route}
                      className="ink-arrow inline-flex min-h-11 items-center gap-1 rounded-lg px-1 text-xs font-medium text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {track.ctaLabel}
                      <ArrowRight size={13} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section
            aria-labelledby="showcase-publish-cta"
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card/75 p-4 sm:p-5"
          >
            <div className="min-w-0">
              <h2 id="showcase-publish-cta" className="text-base font-semibold text-fg">
                {bt("내 작품도 이곳에 소개해 보세요", "Feature your own work here")}
              </h2>
              <p className="mt-1 text-sm leading-6 text-fg-2">
                {bt("발행할 때 공개 범위를 ‘전체 공개’로 고르면 갤러리에 올라갑니다.", "Choose “Public” when you publish and your work appears here.")}
              </p>
            </div>
            <Link href="/studio/publish" className={buttonClass({ size: "lg", variant: "solid", className: "min-h-11 h-11 gap-1.5 rounded-lg px-4 text-sm font-medium" })}>
              <Send size={15} aria-hidden />
              {bt("발행하러 가기", "Go to publishing")}
            </Link>
          </section>
          <Suspense fallback={null}>
            <LazyCreatorSerializationPaceBoard />
          </Suspense>
          <SiteArtSurfaceSpotlight cardId="nb-showcase-premiere" compact />
          <CreativeJourneyLinks compact />
        </div>
      </details>
    </Container>
  );
}
