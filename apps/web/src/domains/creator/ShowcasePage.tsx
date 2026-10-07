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
      <ShowcaseSpotlight />

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
