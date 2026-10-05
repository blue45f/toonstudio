import { BookOpen, Bookmark, BookmarkCheck, Star } from "lucide-react";

import type { Title } from "@/shared/lib/types";

import { CoverImage } from "@/shared/components/cover-image";
import { Stars } from "@/shared/components/ui/stars";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
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
 * 작품 상세 히어로 — 표지 아트를 전폭으로 깔고 그 위에 작품 메타와 주 행동을 모은다.
 *
 * 시안(s2/title-slug)의 구성: 아트 배경 + 하단 스크림, 배지·대형 제목·작가·평점·
 * 장르·줄거리, 주 행동 2개(첫 화부터 읽기·서재에 담기). 본문에 있던 제목·평점·
 * 줄거리 블록은 여기로 옮겨 중복을 없앴다.
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
  const glyph = title.title.replace(/[^가-힣A-Za-z0-9]/g, "").charAt(0) || "W";

  return (
    <section aria-label={bi("작품 소개", "About this title")} className="relative isolate mb-8 lg:mb-10">
      {/* 전폭 아트 배경 — 컨테이너를 벗어나 화면 너비로 깐다 */}
      <div aria-hidden className="absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden">
        {title.coverImage ? (
          <CoverImage
            src={title.coverImage}
            alt=""
            priority
            className="absolute inset-0 size-full object-cover object-[center_22%]"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(150deg, color-mix(in oklch, ${coverFrom} 88%, oklch(0.24 0.012 66)), color-mix(in oklch, ${coverTo} 82%, oklch(0.15 0.008 70)))`,
            }}
          >
            <span className="absolute -right-4 top-0 select-none font-display text-[16rem] font-bold leading-none text-[oklch(0.96_0.01_85/0.13)] mix-blend-overlay lg:text-[22rem]">
              {glyph}
            </span>
          </div>
        )}
        {/* 하단 스크림: 남색 94%에서 투명으로 — 본문 대비 4.5:1 확보 */}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,oklch(0.09_0.025_265/0.95)_0%,oklch(0.09_0.025_265/0.82)_34%,oklch(0.09_0.025_265/0.38)_62%,oklch(0.09_0.025_265/0.06)_88%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(78deg,oklch(0.09_0.025_265/0.5)_0%,transparent_58%)]" />
      </div>

      <div className="flex min-h-[26rem] flex-col justify-end gap-4 pb-7 pt-28 sm:min-h-[28rem] lg:min-h-[30rem] lg:pb-9">
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
    </section>
  );
}
