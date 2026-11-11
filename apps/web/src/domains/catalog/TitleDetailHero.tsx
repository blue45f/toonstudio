import { ArrowUpRight, BookOpen, Bookmark, BookmarkCheck, Star } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import { isPlaceholderAuthorName } from "./local-catalog-fallback";
import { resolveExternalPlatformGuide } from "./title-episode-empty-guide";
import { ArtBackdrop } from "@/shared/components/art-backdrop";
import { TitlePoster } from "@/shared/components/title-poster";
import { Stars } from "@/shared/components/ui/stars";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useNextgenLabSettings } from "@/shared/hooks/use-nextgen-lab-settings";
import { PLATFORMS } from "@/shared/lib/platforms";
import { useApp, useHydrated } from "@/shared/lib/store";
import { AGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/shared/lib/taxonomy";
import { toast } from "@/shared/lib/toast-store";
import { cn, formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailHero", ko, en);

function AuthorNames({ raw }: { raw: string }) {
  const names = (raw ?? "")
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (names.length === 0) {
    return <span>{bi("작가 미상", "Author unknown")}</span>;
  }
  return (
    <>
      {names.map((name, index) => (
        <span key={`${name}-${index}`}>
          {index > 0 && ", "}
          {isPlaceholderAuthorName(name) ? (
            <span>{name}</span>
          ) : (
            <Link
              href={`/author/${encodeURIComponent(name)}`}
              className="rounded-sm underline-offset-2 transition-colors hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {name}
            </Link>
          )}
        </span>
      ))}
    </>
  );
}

/**
 * 작품 상세 히어로 — 표지 무대 (디자인 웨이브 14에서 구도 교체).
 *
 * 제작 개요 무대(ProductionOverviewCoverStage) 문법의 이식: 첫 화면의 주인공은
 * 표지 그 자체다. 표지 포스터를 왼쪽에 원본 비율(3:4) 그대로 크게 세우고,
 * 같은 표지를 흐릿하게 깐 배경이 무대감만 만든다. 배지·대형 제목·작가·평점·
 * 장르·줄거리와 주 행동(공식 감상·서재에 담기)은 무대 오른쪽에 정합한다.
 * 표지가 없는 작품은 TitlePoster의 타이포그래픽 포스터가 같은 자리·같은 크기를
 * 차지해 구도가 무너지지 않는다 — 없는 표지를 이미지로 위장하지 않는다.
 * 배경 무대는 ArtBackdrop(S3-17)이 책임진다: 메타데이터에 사전 계산된 표지
 * 틴트(title.cover)를 배경으로 쓰고 런타임 픽셀 샘플링은 하지 않는다.
 * 아트 표면이라 테마 토큰 대신 표지 컴포넌트(TitlePoster)와 같은 고정 명암을 쓴다.
 * "자체 연재" 배지는 자사 연재 데이터가 없어(플랫폼 20종 전부 외부) 그리지 않는다.
 */
export function TitleDetailHero({
  title,
  reviewAvg,
  reviewCount,
  estimated,
  showSynopsis,
  showAvailability = true,
  firstEpisodeHref,
}: {
  title: Title;
  reviewAvg: number;
  reviewCount: number;
  estimated: boolean;
  showSynopsis: boolean;
  showAvailability?: boolean;
  /** 확인된 공개 회차의 내부 안내 경로. 회차가 확인되지 않으면 null이다. */
  firstEpisodeHref: string | null;
}) {
  useBilingualI18nRevision();
  const hydrated = useHydrated();
  // 실험 기능: 읽기 시작 이동에 View Transition (지원 환경 + 설정 켜짐일 때만).
  const labSettings = useNextgenLabSettings();
  const current = useApp((s) => s.reads[title.id]);
  const setRead = useApp((s) => s.setRead);
  const saved = hydrated && current != null && current !== "dropped";
  const externalGuide = resolveExternalPlatformGuide(title.availability, { availabilityVisible: showAvailability });
  const official = externalGuide.primary;
  const officialPlatformName = official ? PLATFORMS[official.platformId]?.name ?? official.platformId : null;

  const handleSaveToggle = () => {
    if (current === "want") {
      setRead(title.id, null);
      toast(bi("서재에서 뺐어요", "Removed from your library"), { tone: "default" });
    } else if (current == null || current === "dropped") {
      setRead(title.id, "want");
      toast(bi("서재에 담았어요", "Saved to your library"), { tone: "success" });
    } else {
      toast(bi("이미 서재에 담겨 있어요", "Already in your library"), { tone: "default" });
    }
  };

  return (
    <section aria-label={bi("작품 소개", "About this title")} className="relative isolate mb-4 lg:mb-6">
      {/* 무대 배경 — ArtBackdrop: 사전 계산 틴트 위에 같은 표지를 흐리게 겹쳐
          무대감만 만들고, 주인공은 아래의 선명한 포스터다. */}
      <ArtBackdrop title={title} />

      <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-start gap-x-4 gap-y-3 pb-3 pt-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-x-6 sm:pt-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-x-8 lg:pb-4">
        {/* 표지 무대의 주인공 — 원본 비율 그대로 크게 세운 포스터.
            표지 없음·로드 실패·킬스위치에서는 타이포그래픽 포스터가 같은 자리를 차지한다. */}
        <div className="row-span-2 w-full motion-safe:animate-fade-up lg:row-span-6">
          <TitlePoster
            title={title}
            size="hero"
            priority
            titleAs="div"
            className="shadow-[0_28px_64px_-18px_oklch(0.05_0.01_70/0.85)]"
          />
        </div>
        <div className="contents [overflow-wrap:anywhere]">
        <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-[oklch(0.62_0.19_295)] px-2 py-0.5 text-[0.7rem] font-bold text-white">
            {TYPE_LABEL[title.type]}
          </span>
          <span className="rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
            {STATUS_LABEL[title.status]}
          </span>
          <span
            className={cn(
              "rounded-md border px-2 py-0.5 text-[0.7rem] font-semibold backdrop-blur-sm",
              title.ageRating === "19"
                ? "border-[oklch(0.7_0.19_25/0.6)] bg-[oklch(0.55_0.2_25/0.35)] text-white"
                : "border-white/25 bg-white/10 text-white",
            )}
          >
            {AGE_LABEL[title.ageRating]}
          </span>
          {title.updateDays && title.updateDays.length > 0 && (
            <span className="rounded-md border border-white/25 bg-white/10 px-2 py-0.5 text-[0.7rem] font-semibold text-white backdrop-blur-sm">
              {title.updateDays.join("·")} {bi("연재", "serial")}
            </span>
          )}
        </div>

        <div className="col-start-2 min-w-0">
          <h1 className="max-w-3xl text-pretty text-[clamp(1.375rem,3.2vw,2.5rem)] font-bold leading-[1.08] tracking-tight text-white [overflow-wrap:anywhere] [word-break:keep-all]">
            {title.title}
          </h1>
          {title.altTitles && title.altTitles.length > 0 && (
            <p className="mt-2 break-words text-sm text-white/60 [overflow-wrap:anywhere]">{title.altTitles.join(" · ")}</p>
          )}
          <p className="mt-2.5 break-words text-sm text-white/80 [overflow-wrap:anywhere]">
            {bi("글", "Story")} <AuthorNames raw={title.author} />
            {title.artist && title.artist !== title.author && !isPlaceholderAuthorName(title.artist) && (
              <>
                {" · "}
                {bi("그림", "Art")} <AuthorNames raw={title.artist} />
              </>
            )}
            <span className="text-white/55"> · {title.releaseYear}</span>
          </p>
        </div>

        <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm lg:col-span-1 lg:col-start-2">
          <span className="flex items-center gap-2">
            <span className="numeral text-xl font-bold text-white">{reviewAvg.toFixed(1)}</span>
            <span className="flex flex-col gap-0.5">
              <Stars value={reviewAvg} size="sm" />
              <span className="text-[0.7rem] text-white/65">
                {estimated
                  ? formatI18nTemplate(bi("약 {v0}개 평가 (추정)", "≈ {v0} ratings (est.)"), { v0: formatCount(reviewCount) })
                  : formatI18nTemplate(bi("{v0}개의 평가", "{v0} ratings"), { v0: formatCount(reviewCount) })}
              </span>
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-sm text-white/80">
            <Star size={14} aria-hidden className="text-white/50" />
            {bi("조회", "Views")} <span className="numeral font-semibold text-white">{formatCount(title.stats.views)}</span>
          </span>
          {title.genres.length > 0 && (
            <span className="flex flex-wrap gap-1.5">
              {title.genres.slice(0, 4).map((genre) => (
                <span
                  key={genre}
                  className="rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-xs font-medium text-white/90 backdrop-blur-sm"
                >
                  {genre}
                </span>
              ))}
            </span>
          )}
        </div>

        {showSynopsis && title.synopsis && (
          <details className="group/synopsis col-span-2 min-w-0 lg:col-span-1 lg:col-start-2">
            <summary className="min-h-11 cursor-pointer list-none text-sm text-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="mb-1 line-clamp-2 leading-relaxed group-open/synopsis:hidden">{title.synopsis}</span>
              <span className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:underline">{bi("소개 더 보기", "Read the synopsis")}</span>
            </summary>
            <p className="max-w-2xl pb-3 text-pretty text-[0.95rem] leading-relaxed text-white/85">
              {title.synopsis}
            </p>
          </details>
        )}

        <div className="col-span-2 mt-1 grid grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] gap-2.5 lg:col-span-1 lg:col-start-2 lg:flex lg:flex-wrap">
          {official && (
            <a
              data-testid="title-official-read-link"
              href={official.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={formatI18nTemplate(bi("{v0}에서 보기 (새 탭)", "Read on {v0} (new tab)"), { v0: officialPlatformName ?? "" })}
              className="inline-flex min-h-12 [min-block-size:3rem]! items-center justify-center gap-2 rounded-xl bg-accent px-5 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <BookOpen size={17} aria-hidden="true" />
              {formatI18nTemplate(bi("{v0}에서 보기", "Read on {v0}"), { v0: officialPlatformName ?? "" })}
              <ArrowUpRight size={16} aria-hidden="true" />
            </a>
          )}
          {firstEpisodeHref && (
            <Link
              href={firstEpisodeHref}
              viewTransition={labSettings.viewTransitions}
              className={cn(
                "inline-flex min-h-12 [min-block-size:3rem]! items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
                official ? "border border-white/30 bg-white/10 text-white hover:bg-white/20" : "bg-accent text-on-accent hover:bg-accent-2",
              )}
            >
              <BookOpen size={17} aria-hidden />
              {bi("회차 안내 보기", "View episode guide")}
            </Link>
          )}
          <button
            type="button"
            onClick={handleSaveToggle}
            aria-pressed={saved}
            className={cn(
              "inline-flex min-h-12 [min-block-size:3rem]! items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold backdrop-blur-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              saved
                ? "border-white/50 bg-white/20 text-white"
                : "border-white/30 bg-white/10 text-white hover:bg-white/20",
            )}
          >
            {saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}
            {saved ? bi("서재에 담김", "In your library") : bi("서재에 담기", "Save to library")}
          </button>
        </div>

        {showAvailability && (
          <p className="col-span-2 text-xs leading-relaxed text-white/75 lg:col-span-1 lg:col-start-2">
            {official
              ? bi("회차 감상은 공식 플랫폼에서 제공돼요. 새 탭으로 열립니다.", "Episodes are available on the official platform. Opens in a new tab.")
              : bi("공식 감상 링크가 아직 연결되지 않았어요. 아래 감상 플랫폼 안내를 확인해 주세요.", "An official reading link is not connected yet. Check the platform information below.")}
          </p>
        )}

        <nav
          data-testid="title-detail-section-nav"
          aria-label={bi("작품 상세 섹션 바로가기", "Jump to title section")}
          className="col-span-2 -mb-3 flex items-center gap-1 overflow-x-auto border-b border-white/25 pt-2 [scrollbar-width:thin] lg:-mb-4"
        >
          {(
            [
              { href: "#title-episodes-anchor", ko: "회차 목록", en: "Episodes" },
              { href: "#title-reviews", ko: "독자 리뷰", en: "Reviews" },
              { href: "#title-availability", ko: "감상 플랫폼·가격", en: "Where to read" },
              { href: "#metrics", ko: "완독률·지표", en: "Metrics" },
              { href: "#title-character-talk", ko: "캐릭터 대화", en: "Character talk" },
            ] as const
          ).map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-3 py-2 text-xs font-semibold text-white/90 transition-colors hover:border-white/65 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white sm:px-4 sm:text-sm"
            >
              {bi(item.ko, item.en)}
            </a>
          ))}
        </nav>
        </div>
      </div>
    </section>
  );
}
