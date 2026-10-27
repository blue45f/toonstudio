// 쇼케이스(/showcase) — 전용 첫 화면(ShowcaseSpotlight) → 전체 작품 갤러리 → 발행 안내.
// 만들기 갤러리 본체(CreateGalleryPage)는 건드리지 않고, 갤러리 본문은 공유 컴포넌트
// (GalleryToolbar·GalleryTabPanel)를 그대로 재사용한다. 보기 조건은 주소 검색 문자열이 단일 출처라
// 새로고침·공유 링크·스포트라이트의 태그 링크에서도 같은 화면이 열린다.
import { Send } from "lucide-react";
import { useSearchParams } from "react-router-dom";

import { GalleryToolbar } from "./publishing/GalleryControls";
import { GalleryTabPanel } from "./publishing/GalleryTabPanels";
import { parseGalleryView, patchSearchParams } from "./publishing/gallery-query";
import { ShowcaseSpotlight } from "./publishing/ShowcaseSpotlight";

import { Container } from "@/shared/components/section";
import { CreativeJourneyLinks } from "@/shared/components/public-creative";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";
import { SiteContextualSubNav } from "@/shared/components/site-contextual-subnav";
import { NanoBananaSurfaceSpotlight } from "@/shared/components/site-experience/NanoBananaSurfaceSpotlight";
import { SHOWCASE_COLLABORATION_TRACKS } from "@/shared/navigation/webtoon-platform-router-ux-model";

const SHOWCASE_TRACK_IMAGES: Readonly<Record<string, string>> = {
  "portfolio-curation": "/assets/site-experience/nano-banana-site-v1/cards/nb-showcase-premiere-640.webp",
  "team-recruiting": "/assets/site-experience/nano-banana-site-v1/cards/nb-community-plaza-640.webp",
  "contest-pitch": "/assets/site-experience/nano-banana-site-v1/cards/nb-planning-storylab-640.webp",
};

export function ShowcasePage() {
  const bt = useBilingual("ShowcasePage");
  const [searchParams, setSearchParams] = useSearchParams();
  const view = parseGalleryView(searchParams);

  const patchView = (patch: Readonly<Record<string, string | null>>) => {
    setSearchParams(patchSearchParams(searchParams, patch), { replace: true });
  };
  const clearAllFilters = () => patchView({ tag: null, content: null, provenance: null, portfolio: null });

  return (
    <Container size="wide" className="py-6 sm:py-10">
      <SiteContextualSubNav pathnameOverride="/showcase" className="mb-5" />
      <ShowcaseSpotlight />
      <NanoBananaSurfaceSpotlight cardId="nb-showcase-premiere" compact className="mt-6" />

      <section
        aria-label={bt("크리에이터 쇼케이스 · 협업 · 공모 트랙", "Creator showcase, collaboration & contest tracks")}
        data-testid="showcase-rea-collaboration-tracks"
        className="mt-8 rounded-2xl border border-line bg-panel/60 p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
              PORTFOLIO · RECRUITING · CONTEST
            </p>
            <h2 className="text-sm font-bold text-fg">
              {bt("아트워크 전시 · 분업 팀 매칭 · 신작 피칭 통합 허브", "Creator Portfolio, Team Matching & Pitch Hub")}
            </h2>
          </div>
          <span className="rounded-full border border-line bg-canvas px-2.5 py-0.5 text-[11px] font-semibold text-fg-3">
            {bt("공정별 포트폴리오 · 팀 매칭 · 공모전 연결", "Stage Portfolio · Team Match · Contest")}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {SHOWCASE_COLLABORATION_TRACKS.map((track) => (
            <div
              key={track.id}
              className="flex flex-col justify-between rounded-xl border border-line/80 bg-canvas/80 p-3.5 transition-colors hover:border-accent/50"
            >
              <div>
                <span
                  aria-hidden="true"
                  className="mb-3 block h-24 w-full rounded-lg border border-line/60 bg-cover bg-center"
                  style={{ backgroundImage: `url(${SHOWCASE_TRACK_IMAGES[track.id] ?? "/assets/site-experience/nano-banana-site-v1/cards/nb-showcase-premiere-640.webp"})` }}
                />
                <span className="inline-block rounded-md bg-accent/15 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                  {track.badge}
                </span>
                <h3 className="mt-2 text-sm font-bold text-fg">{track.label}</h3>
                <p className="mt-1 text-xs leading-relaxed text-fg-2">{track.description}</p>
              </div>
              <div className="mt-3 pt-2 border-t border-line/50">
                <Link
                  href={track.route}
                  className="inline-flex items-center gap-1 text-xs font-bold text-accent hover:underline"
                >
                  {track.ctaLabel} →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="showcase-browse-title" className="mt-12">
        <div className="mb-4">
          <p className="eyebrow text-accent">FULL GALLERY</p>
          <h2 id="showcase-browse-title" className="mt-1 text-xl font-black tracking-tight text-fg sm:text-2xl">
            {bt("전체 작품 둘러보기", "Browse all works")}
          </h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">
            {bt(
              "공개된 모든 창작물을 탭·정렬·태그로 좁혀 볼 수 있어요. 추천 컬렉션은 전체 작품 탭의 맨 위에 모여 있습니다.",
              "Narrow down every public work by tab, sort, and tag. Curated collections gather at the top of the All works tab.",
            )}
          </p>
        </div>
        <GalleryToolbar view={view} onPatch={patchView} />
        <GalleryTabPanel view={view} onResetFilters={clearAllFilters} />
      </section>

      <section
        aria-labelledby="showcase-publish-cta"
        className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel/40 p-4 sm:p-5"
      >
        <div className="min-w-0">
          <h2 id="showcase-publish-cta" className="text-base font-bold text-fg">{bt("내 작품도 이곳에 소개해 보세요", "Feature your own work here")}</h2>
          <p className="mt-1 text-sm leading-6 text-fg-2">{bt("발행할 때 공개 범위를 ‘전체 공개’로 고르면 갤러리에 올라가요.", "Choose “Public” when you publish and your work appears here.")}</p>
        </div>
        <Link href="/studio/publish" className={buttonClass({ size: "md", variant: "solid", className: "gap-1.5" })}>
          <Send size={15} aria-hidden />
          {bt("발행하러 가기", "Go to publishing")}
        </Link>
      </section>
      <CreativeJourneyLinks compact />
    </Container>
  );
}
