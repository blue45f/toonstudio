import { ArrowRight, Clapperboard } from "lucide-react";
import Link from "@/shared/navigation/router-link";
import { useI18n } from "@/shared/lib/i18n";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { CHAPTER_JUMPS, IR_FILM_POSTER, IR_FILM_SRC } from "./ir-pitch-data";
import { IrBriefSection } from "./IrBriefLayout";
import { IrVerifiedSnapshotStrip } from "./IrQaAndLicenseSection";
import { formatProductTourDuration, PRODUCT_TOUR, productTourChapterHref } from "./product-tour-content";

export function IrBriefOverview() {
  const bi = useBilingualLocalizer("domains.marketing.IrPitchPage");
  const activeLang: "ko" | "en" = useI18n((state) => state.lang) === "ko" ? "ko" : "en";
  const tourDuration = bi(formatProductTourDuration(PRODUCT_TOUR.duration, "ko"), formatProductTourDuration(PRODUCT_TOUR.duration, "en", "long"));
  return (
    <IrBriefSection id="overview">
      <div className="grid gap-4">
        <IrVerifiedSnapshotStrip surface="site" lang={activeLang} />
        <details className="rounded-2xl border border-line bg-card p-4">
          <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-fg">{bi("서비스 설명과 실제 제품 영상", "Service overview and product film")}</summary>
          <h2 className="mt-4 text-xl font-bold text-fg">{bi("웹툰의 기획부터 연재·운영까지, 흩어진 제작 도구와 협업 과정을 브라우저 하나로 연결합니다.", "From planning through release and operations, ToonStudio connects the scattered tools and collaboration of webtoon production in one browser.")}</h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">{bi("ToonStudio는 toonstudio.cloud에서 베타로 공개돼 있는 웹툰 제작 OS예요. 제품 투어는 제작 당시의 화면 캡처와 별도로 표시한 개념 도해로 제작 흐름을 소개합니다.", "ToonStudio is a webtoon production OS in beta at toonstudio.cloud. The product tour introduces its workflow using captures from production time and clearly marked concept illustrations.")}</p>
          <div className="my-4 flex flex-wrap gap-2">
            <Link href="/product-tour" className="inline-flex min-h-12 items-center rounded-xl border border-line px-3 text-sm font-semibold text-fg">{bi("전체 제품 투어 보기", "Watch the full product tour")} ({tourDuration})</Link>
            <Link href="/about" className="inline-flex min-h-12 items-center rounded-xl border border-line px-3 text-sm font-semibold text-fg">{bi("서비스 소개 보기", "About the service")}</Link>
            <Link href="/business-plan" className="inline-flex min-h-12 items-center rounded-xl border border-accent/50 bg-accent-soft px-3 text-sm font-bold text-accent">{bi("PSST 사업계획서 보기", "Read PSST business plan")}</Link>
          </div>
          <figure className="grid gap-3">
            {/* IR 컷의 자막 버전은 전체 제품 투어에서 제공한다. */}
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video className="aspect-video w-full rounded-2xl border border-line bg-panel object-cover" src={IR_FILM_SRC} poster={IR_FILM_POSTER} controls preload="none" playsInline aria-label={bi("ToonStudio IR 영상 (4분 48초)", "ToonStudio IR film (4 minutes 48 seconds)")} />
            <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2">
              <span className="inline-flex items-center gap-2"><Clapperboard size={15} aria-hidden />{bi("IR 컷 4:48 — 제품 투어의 실제 화면 챕터", "IR cut, 4:48 — real product tour chapters")}</span>
              {CHAPTER_JUMPS.map(chapter => <Link key={chapter.start} href={productTourChapterHref(chapter.start)} className="inline-flex min-h-12 items-center gap-1 font-semibold text-accent">{bi(chapter.ko, chapter.en)}<ArrowRight size={13} aria-hidden /></Link>)}
            </figcaption>
          </figure>
        </details>
      </div>
    </IrBriefSection>
  );
}
