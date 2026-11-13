import { ArrowRight, Clapperboard } from "lucide-react";
import Link from "@/shared/navigation/router-link";
import { useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import { CHAPTER_JUMPS, IR_FILM_POSTER, IR_FILM_SRC } from "./ir-pitch-data";
import { IrBriefSection } from "./IrBriefLayout";
import { productTourChapterHref } from "./product-tour-content";

export function IrBriefOverview() {
  const bi = useBilingualLocalizer("domains.marketing.IrPitchPage");
  return <IrBriefSection id="overview"><details className="rounded-2xl border border-line bg-card p-4">
    <summary className="min-h-12 cursor-pointer py-3 text-sm font-semibold text-fg">{bi("서비스 설명과 실제 제품 영상", "Service overview and product film")}</summary>
    <h2 className="mt-4 text-xl font-black text-fg">{bi("웹툰의 기획부터 연재·운영까지, 흩어진 제작 도구와 협업 과정을 브라우저 하나로 연결합니다.", "From planning through release and operations, ToonStudio connects the scattered tools and collaboration of webtoon production in one browser.")}</h2>
    <p className="mt-3 text-sm leading-7 text-fg-2">{bi("ToonStudio는 지금 toonstudio.cloud에서 베타로 공개돼 있는 웹툰 제작 OS예요. 정식 오픈을 앞두고 계속 고도화하고 있고, 이 페이지에 나오는 영상과 화면은 전부 실제 제품에서 가져왔습니다.", "ToonStudio is a webtoon production OS currently in beta at toonstudio.cloud, being improved ahead of its full launch. Every film and screen on this page comes straight from the real product.")}</p>
    <div className="my-4 flex flex-wrap gap-2"><Link href="/product-tour" className="inline-flex min-h-12 items-center rounded-xl border border-line px-3 text-sm font-semibold text-fg">{bi("8분 전체 제품 투어 보기", "Watch the full 8-minute tour")}</Link><Link href="/about" className="inline-flex min-h-12 items-center rounded-xl border border-line px-3 text-sm font-semibold text-fg">{bi("서비스 소개 보기", "About the service")}</Link></div>
    <figure className="grid gap-3">
      {/* IR 컷의 자막 버전은 전체 제품 투어에서 제공한다. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video className="aspect-video w-full rounded-2xl border border-line bg-panel object-cover" src={IR_FILM_SRC} poster={IR_FILM_POSTER} controls preload="none" playsInline aria-label={bi("ToonStudio IR 영상 (4분 48초)", "ToonStudio IR film (4 minutes 48 seconds)")} />
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-fg-2"><span className="inline-flex items-center gap-2"><Clapperboard size={15} aria-hidden />{bi("IR 컷 4:48 — 제품 투어의 실제 화면 챕터", "IR cut, 4:48 — real product tour chapters")}</span>
        {CHAPTER_JUMPS.map(chapter => <Link key={chapter.start} href={productTourChapterHref(chapter.start)} className="inline-flex min-h-12 items-center gap-1 font-semibold text-accent">{bi(chapter.ko, chapter.en)}<ArrowRight size={13} aria-hidden /></Link>)}
      </figcaption>
    </figure>
  </details></IrBriefSection>;
}
