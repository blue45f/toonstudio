import { BookOpen, Bookmark, BookmarkCheck, Star } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import { CoverImage } from "@/shared/components/cover-image";
import { TitlePoster } from "@/shared/components/title-poster";
import { Stars } from "@/shared/components/ui/stars";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useNextgenLabSettings } from "@/shared/hooks/use-nextgen-lab-settings";
import { useApp, useHydrated } from "@/shared/lib/store";
import { AGE_LABEL, STATUS_LABEL, TYPE_LABEL } from "@/shared/lib/taxonomy";
import { toast } from "@/shared/lib/toast-store";
import { cn, formatCount } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleDetailHero", ko, en);

function AuthorNames({ raw }: { raw: string }) {
  const names = raw
    .split(/[,/]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <>
      {names.map((name, index) => (
        <span key={`${name}-${index}`}>
          {index > 0 && ", "}
          {name === "미상" ? (
            <span>{name}</span>
          ) : (
            <Link
              href={`/author/${encodeURIComponent(name)}`}
              className="underline-offset-2 transition-colors hover:text-white hover:underline"
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
 * 장르·줄거리와 주 행동 2개(첫 화부터 읽기·서재에 담기)는 무대 오른쪽에 정합한다.
 * 표지가 없는 작품은 TitlePoster의 타이포그래픽 포스터가 같은 자리·같은 크기를
 * 차지해 구도가 무너지지 않는다 — 없는 표지를 이미지로 위장하지 않는다.
 * 아트 표면이라 테마 토큰 대신 표지 컴포넌트(TitlePoster)와 같은 고정 명암을 쓴다.
 * "자체 연재" 배지는 자사 연재 데이터가 없어(플랫폼 20종 전부 외부) 그리지 않는다.
 */
export function TitleDetailHero({
  title,
  reviewAvg,
  reviewCount,
  estimated,
  showSynopsis,
  firstEpisodeHref,
}: {
  title: Title;
  reviewAvg: number;
  reviewCount: number;
  estimated: boolean;
  showSynopsis: boolean;
  /** 회차가 없다고 확정된 작품이면 null — 읽기 행동을 숨긴다. */
  firstEpisodeHref: string | null;
}) {
  useBilingualI18nRevision();
  const hydrated = useHydrated();
  // 실험 기능: 읽기 시작 이동에 View Transition (지원 환경 + 설정 켜짐일 때만).
  const labSettings = useNextgenLabSettings();
  const current = useApp((s) => s.reads[title.id]);
  const setRead = useApp((s) => s.setRead);
  const saved = hydrated && current != null && current !== "dropped";

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

  const [coverFrom, coverTo] = title.cover;

  return (
    <section aria-label={bi("작품 소개", "About this title")} className="relative isolate mb-8 lg:mb-10">
      {/* 무대 배경 — 컨테이너를 벗어나 화면 너비로 깐다. 장르 그라디언트 위에 같은
          표지를 흐리게 겹쳐 무대감만 만들고, 주인공은 아래의 선명한 포스터다.
          표지가 없거나 로드에 실패하면 그라디언트만 남아 배경이 비지 않는다. */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(150deg, color-mix(in oklch, ${coverFrom} 88%, oklch(0.24 0.012 66)), color-mix(in oklch, ${coverTo} 82%, oklch(0.15 0.008 70)))`,
          }}
        />
        {title.coverImage ? (
          <CoverImage
            src={title.coverImage}
            alt=""
            priority
            className="absolute inset-0 size-full scale-110 object-cover object-[center_22%] opacity-60 blur-md"
          />
        ) : null}
        {/* 하단 스크림: 남색 94%에서 투명으로 — 본문 대비 4.5:1 확보 */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.09_0.025_265/0.95)_0%,oklch(0.09_0.025_265/0.82)_34%,oklch(0.09_0.025_265/0.38)_62%,oklch(0.09_0.025_265/0.06)_88%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(78deg,oklch(0.09_0.025_265/0.5)_0%,transparent_58%)]" />
      </div>

      <div className="flex flex-col gap-7 pb-8 pt-10 sm:pt-12 lg:flex-row lg:items-end lg:gap-10 lg:pb-10">
        {/* 표지 무대의 주인공 — 원본 비율 그대로 크게 세운 포스터.
            표지 없음·로드 실패·킬스위치에서는 타이포그래픽 포스터가 같은 자리를 차지한다. */}
        <div className="w-40 shrink-0 motion-safe:animate-fade-up sm:w-52 lg:w-72">
          <TitlePoster
            title={title}
            size="hero"
            priority
            titleAs="div"
            className="shadow-[0_28px_64px_-18px_oklch(0.05_0.01_70/0.85)]"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
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

        <div>
          <h1 className="max-w-3xl text-pretty text-[clamp(2rem,6vw,3.4rem)] font-bold leading-[1.08] tracking-tight text-white [word-break:keep-all]">
            {title.title}
          </h1>
          {title.altTitles && title.altTitles.length > 0 && (
            <p className="mt-2 text-sm text-white/60">{title.altTitles.join(" · ")}</p>
          )}
          <p className="mt-2.5 text-sm text-white/80">
            {bi("글", "Story")} <AuthorNames raw={title.author} />
            {title.artist && title.artist !== title.author && (
              <>
                {" · "}
                {bi("그림", "Art")} <AuthorNames raw={title.artist} />
              </>
            )}
            <span className="text-white/55"> · {title.releaseYear}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="flex items-center gap-2">
            <span className="numeral text-3xl font-bold text-white">{reviewAvg.toFixed(1)}</span>
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
          <p className="max-w-2xl text-pretty text-[0.95rem] leading-relaxed text-white/85">
            {title.synopsis}
          </p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-2.5">
          {firstEpisodeHref && (
            <Link
              href={firstEpisodeHref}
              viewTransition={labSettings.viewTransitions}
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[linear-gradient(100deg,var(--color-accent),var(--color-accent-2))] px-6 text-sm font-bold text-on-accent shadow-[0_10px_28px_-10px_oklch(0.4_0.15_295/0.7)] transition-transform duration-150 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none motion-reduce:hover:scale-100"
            >
              <BookOpen size={17} aria-hidden />
              {bi("첫 화부터 읽기", "Start from episode 1")}
            </Link>
          )}
          <button
            type="button"
            onClick={handleSaveToggle}
            aria-pressed={saved}
            className={cn(
              "inline-flex min-h-12 items-center gap-2 rounded-full border px-5 text-sm font-semibold backdrop-blur-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
              saved
                ? "border-white/50 bg-white/20 text-white"
                : "border-white/30 bg-white/10 text-white hover:bg-white/20",
            )}
          >
            {saved ? <BookmarkCheck size={17} aria-hidden /> : <Bookmark size={17} aria-hidden />}
            {saved ? bi("서재에 담김", "In your library") : bi("서재에 담기", "Save to library")}
          </button>
        </div>
        </div>
      </div>
    </section>
  );
}
