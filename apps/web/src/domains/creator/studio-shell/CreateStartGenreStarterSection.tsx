import { ArrowRight } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import Link from "@/shared/navigation/router-link";

const GENRE_QUICK_STARTERS = [
  {
    id: "romance",
    imageUrl: "/brand/studio-canvas-previews/romance.webp",
    badgeKo: "800×1280 세로형 · 줄거리부터",
    badgeEn: "800×1280 Vertical · Story first",
    titleKo: "로맨스 스크롤 웹툰",
    titleEn: "Romance Scroll Webtoon",
    descKo: "감성 대사와 세로 스크롤 여백이 준비된 첫 화 원고로 시작해요.",
    descEn: "Start Episode 1 with vertical scroll spacing tuned for emotional dialogue.",
    ctaKo: "로맨스 프리셋 열기",
    ctaEn: "Open romance preset",
    href: `/studio/new?format=vertical-webtoon&lane=idea&start=idea&title=${encodeURIComponent("설레는 첫 만남 1화")}`,
  },
  {
    id: "action",
    imageUrl: "/brand/studio-canvas-previews/action.webp",
    badgeKo: "박진감 연출 · 콘티부터",
    badgeEn: "Dynamic Cuts · Boards first",
    titleKo: "판타지·액션 연재",
    titleEn: "Fantasy & Action Series",
    descKo: "긴 호흡의 연출 컷과 콘티 구성을 먼저 잡고 바로 편집기로 들어가요.",
    descEn: "Jump straight into dynamic tall-panel storyboards.",
    ctaKo: "액션 프리셋 열기",
    ctaEn: "Open action preset",
    href: `/studio/new?format=vertical-webtoon&lane=storyboard&start=storyboard&title=${encodeURIComponent("각성의 순간 1화")}`,
  },
  {
    id: "daily",
    imageUrl: "/brand/studio-canvas-previews/daily.webp",
    badgeKo: "1080×1080 정사각 · 4컷 카드",
    badgeEn: "1080×1080 Square · 4-Card",
    titleKo: "일상·공감 4컷툰",
    titleEn: "4-Panel Daily Toon",
    descKo: "인스타그램·SNS에서 넘겨 보기 좋은 4장 카드 규격으로 가볍게 그려요.",
    descEn: "Draw a swipe-friendly 4-panel social comic strip right away.",
    ctaKo: "4컷툰 프리셋 열기",
    ctaEn: "Open 4-panel preset",
    href: `/studio/new?format=cuttoon&template=cuttoon-square-4&lane=storyboard&start=storyboard&title=${encodeURIComponent("오늘의 일상 4컷")}`,
  },
  {
    id: "mystery",
    imageUrl: "/brand/studio-canvas-previews/fantasy.webp",
    badgeKo: "출판·단편 · 페이지 만화",
    badgeEn: "Print & Short · Page Comic",
    titleKo: "미스터리·단편 만화",
    titleEn: "Mystery & Short Comic",
    descKo: "공모전이나 단행본에 맞춘 페이지 단위 원고와 세계관 노트로 시작해요.",
    descEn: "Begin with print-ready comic pages and worldbuilding notes.",
    ctaKo: "단편 프리셋 열기",
    ctaEn: "Open page preset",
    href: `/studio/new?format=page-comic&lane=idea&start=idea&title=${encodeURIComponent("자정의 도서관 제1장")}`,
  },
] as const;

export function CreateStartGenreStarterSection() {
  const bt = useBilingual("CreateStartGenreStarterSection");

  return (
    <section
      aria-label={bt("초보자도 쉬운 1초 장르 스타터", "1-second visual genre starters")}
      data-testid="create-start-genre-starters"
      className="mt-6 rounded-3xl border border-line bg-card p-4 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
            {bt("원클릭 장르 프리셋", "1-CLICK GENRE PRESETS")}
          </p>
          <h2 className="mt-1 text-lg font-black text-fg sm:text-xl">
            {bt("초보자도 쉬운 1초 장르 스타터", "Start in 1 second with a genre preset")}
          </h2>
        </div>
        <p className="text-xs text-fg-3">
          {bt(
            "분위기 카드를 누르면 캔버스 크기와 첫 작업 단계가 자동으로 세팅돼요",
            "Tap any card to prefill canvas dimensions and your starting stage",
          )}
        </p>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {GENRE_QUICK_STARTERS.map((starter) => (
          <Link
            key={starter.id}
            href={starter.href}
            data-testid={`genre-starter-${starter.id}`}
            style={{ minHeight: "44px" }}
            className="group flex min-h-11 scroll-my-24 flex-col overflow-hidden rounded-2xl border border-line bg-panel/45 transition-all hover:-translate-y-0.5 hover:border-accent/50 hover:bg-raised hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transform-none"
          >
            <span className="relative block h-32 w-full overflow-hidden bg-canvas">
              <img
                src={starter.imageUrl}
                alt=""
                aria-hidden="true"
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035] motion-reduce:transform-none"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent"
              />
              <span className="absolute bottom-2.5 left-3 rounded-full border border-line bg-card px-2.5 py-0.5 text-[10px] font-bold text-fg">
                {bt(starter.badgeKo, starter.badgeEn)}
              </span>
            </span>
            <span className="flex flex-1 flex-col justify-between p-4">
              <span>
                <strong className="block text-base font-black text-fg">
                  {bt(starter.titleKo, starter.titleEn)}
                </strong>
                <span className="mt-1.5 block text-xs leading-5 text-fg-2">
                  {bt(starter.descKo, starter.descEn)}
                </span>
              </span>
              <span className="mt-3 inline-flex items-center gap-1 text-xs font-extrabold text-accent">
                {bt(starter.ctaKo, starter.ctaEn)}
                <ArrowRight
                  size={14}
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
