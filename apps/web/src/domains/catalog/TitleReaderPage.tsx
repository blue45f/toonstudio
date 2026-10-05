import {
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ListOrdered,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { Title } from "@/shared/lib/types";

import { getReaderProgress, isResumable, setReaderProgress } from "./reader-progress";
import { resolveTitleEpisodes, resolveTotalEpisodes } from "./title-episodes";
import { TitleNotFound } from "./TitleNotFound";

import { CoverImage } from "@/shared/components/cover-image";
import { ErrorState } from "@/shared/components/feedback/error-state";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { spectrumGradient } from "@/shared/lib/genre-color";
import { PLATFORMS } from "@/shared/lib/platforms";
import { STATUS_LABEL } from "@/shared/lib/taxonomy";
import { cn } from "@/shared/lib/utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import Link from "@/shared/navigation/router-link";
import { useApiResource } from "@/platform/use-api-resource";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleReaderPage", ko, en);

interface ReaderTitleResponse {
  title: Title;
}

const CHROME_HIDE_DELAY_MS = 2600;

function scrollableHeight(): number {
  return Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
}

function ReaderShell({
  title,
  episode,
  total,
  platformLink,
}: {
  title: Title;
  episode: number;
  total: number | undefined;
  platformLink: { name: string; url: string } | null;
}) {
  useBilingualI18nRevision();
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const ratioRef = useRef(0);
  const [ratio, setRatio] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [savedOnce, setSavedOnce] = useState(false);
  const [initialProgress] = useState(() => getReaderProgress(title.slug));
  const [resumeDismissed, setResumeDismissed] = useState(false);

  const detailPath = `/title/${encodeURIComponent(title.slug)}`;
  const hasPrev = episode > 1;
  const hasNext = total == null || episode < total;
  const showResume =
    !resumeDismissed &&
    initialProgress?.episode === episode &&
    isResumable(initialProgress);
  const progressKnown = savedOnce || initialProgress != null;

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setChromeVisible(false), CHROME_HIDE_DELAY_MS);
  }, []);

  const pokeChrome = useCallback(() => {
    setChromeVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  // 진입: 크롬 자동 숨김 예약 + 루트 포커스(Esc 등 키보드 동선)
  useEffect(() => {
    scheduleHide();
    rootRef.current?.focus({ preventScroll: true });
    return () => {
      if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
    };
  }, [scheduleHide]);

  // 스크롤 진도 측정 + 읽던 위치 저장(디바운스). 아래로 스크롤하면 크롬이 숨고,
  // 위로 스크롤하거나 끝에 닿으면 다시 보인다.
  useEffect(() => {
    let raf = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY;
        const next = Math.min(1, Math.max(0, y / scrollableHeight()));
        ratioRef.current = next;
        setRatio(next);
        if (next >= 0.985) {
          setChromeVisible(true);
          if (hideTimerRef.current != null) window.clearTimeout(hideTimerRef.current);
        } else if (y > lastY + 4) {
          setChromeVisible(false);
        } else if (y < lastY - 4) {
          setChromeVisible(true);
          scheduleHide();
        }
        lastY = y;
        if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          setReaderProgress(title.slug, episode, ratioRef.current);
          setSavedOnce(true);
        }, 500);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
      if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
      setReaderProgress(title.slug, episode, ratioRef.current);
    };
  }, [title.slug, episode, scheduleHide]);

  // Esc는 작품 상세로, 그 외 키 입력은 크롬을 다시 보여준다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        navigate(detailPath);
        return;
      }
      pokeChrome();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, detailPath, pokeChrome]);

  const handleContentPointerDown = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("a,button,input,select,textarea,[role='button']")) {
      pokeChrome();
      return;
    }
    setChromeVisible((visible) => {
      if (!visible) scheduleHide();
      return !visible;
    });
  };

  const handleResume = () => {
    if (!initialProgress) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top: initialProgress.ratio * scrollableHeight(),
      behavior: reduceMotion ? "auto" : "smooth",
    });
    setResumeDismissed(true);
  };

  const chromeClass = cn(
    "transition-opacity duration-300 motion-reduce:transition-none",
    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
  );
  const percent = Math.round(ratio * 100);
  const [coverFrom, coverTo] = title.cover;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className="min-h-[100dvh] bg-reader-canvas text-white outline-none"
    >
      {/* 최상단 진도 바 — 크롬이 숨겨져도 항상 보인다 */}
      <div
        role="progressbar"
        aria-label={bi("읽기 진도", "Reading progress")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="fixed inset-x-0 top-0 z-50 h-[2px] bg-white/10"
      >
        <div
          className="h-full transition-[width] duration-150 motion-reduce:transition-none"
          style={{ width: `${percent}%`, background: spectrumGradient(title.genres) }}
        />
      </div>

      {/* 상단 바 */}
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[oklch(0.095_0.018_265/0.88)] backdrop-blur-md",
          chromeClass,
        )}
      >
        <div className="mx-auto flex h-14 w-full max-w-[720px] items-center gap-2 px-3 sm:px-4">
          <Link
            href={detailPath}
            aria-label={bi("작품 상세로 나가기", "Back to title details")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <X size={20} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{title.title}</p>
            <p className="truncate text-xs leading-tight text-white/60">
              {formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode) })}
              {total != null &&
                formatI18nTemplate(bi(" · 총 {v0}화", " · of {v0}"), { v0: String(total) })}
            </p>
          </div>
          {progressKnown && (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-white/65">
              <span className="size-1.5 rounded-full bg-[oklch(0.8_0.14_155)]" aria-hidden />
              <Check size={13} aria-hidden />
              {bi("읽던 위치 저장됨", "Position saved")}
            </span>
          )}
        </div>
      </header>

      <div onPointerDown={handleContentPointerDown} className="mx-auto w-full max-w-[720px] px-4 pb-36 pt-[4.5rem]">
        {/* 회차 시작 카드 — 회차 제목·날짜는 계약에 없어 작품 실데이터만 표기한다 */}
        <section aria-label={bi("회차 정보", "Episode info")} className="flex gap-4 rounded-2xl border border-white/10 bg-reader-panel p-4 sm:p-5">
          <span className="relative block aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg sm:w-[4.5rem]">
            {title.coverImage ? (
              <CoverImage src={title.coverImage} alt="" className="absolute inset-0 size-full object-cover" />
            ) : (
              <span
                aria-hidden
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(150deg, color-mix(in oklch, ${coverFrom} 85%, oklch(0.24 0.012 66)), color-mix(in oklch, ${coverTo} 80%, oklch(0.15 0.008 70)))`,
                }}
              />
            )}
          </span>
          <div className="flex min-w-0 flex-col justify-center gap-1">
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">
              {formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode) })}
            </h1>
            <p className="truncate text-sm text-white/75">{title.title}</p>
            <p className="text-xs text-white/55">
              {title.author}
              {" · "}
              {STATUS_LABEL[title.status]}
              {title.updateDays && title.updateDays.length > 0 &&
                ` · ${title.updateDays.join("·")} ${bi("연재", "serial")}`}
            </p>
          </div>
        </section>

        {showResume && initialProgress && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-white/15 bg-reader-panel px-4 py-3">
            <p className="min-w-0 flex-1 text-sm text-white/85">
              {formatI18nTemplate(bi("이전에 {v0}%까지 읽었어요", "You left off at {v0}%"), {
                v0: String(Math.round(initialProgress.ratio * 100)),
              })}
            </p>
            <button
              type="button"
              onClick={handleResume}
              className="inline-flex min-h-10 items-center rounded-full bg-white px-4 text-xs font-bold text-[oklch(0.16_0.02_265)] transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {bi("이어서 보기", "Resume")}
            </button>
            <button
              type="button"
              onClick={() => setResumeDismissed(true)}
              className="inline-flex min-h-10 items-center rounded-full px-3 text-xs font-medium text-white/65 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {bi("처음부터", "From the top")}
            </button>
          </div>
        )}

        {/* 컷 컬럼 — 컷 데이터 계약이 없어 정직한 빈 상태로 둔다. 가짜 컷을 그리지 않는다. */}
        <section
          aria-label={bi("회차 내용", "Episode content")}
          className="mt-4 rounded-2xl border border-dashed border-white/15 bg-reader-panel/50 px-6 py-14 text-center"
        >
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/8 text-white/60">
            <ImageOff size={22} aria-hidden />
          </span>
          <h2 className="mt-4 font-semibold text-white">
            {bi("이 회차의 컷은 아직 준비되지 않았어요", "Panels for this episode aren't ready yet")}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/65">
            {bi(
              "이 작품은 외부 플랫폼에서 연재되어 회차 컷이 이 사이트로 제공되지 않아요. 컷 데이터가 연결되면 이 자리에 세로 스크롤로 표시됩니다.",
              "This title is serialized on an external platform, so its panels aren't delivered to this site. Once panel data is connected, episodes will appear here as a vertical scroll.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            {platformLink && (
              <a
                href={platformLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[linear-gradient(100deg,var(--color-accent),var(--color-accent-2))] px-5 text-sm font-bold text-on-accent transition-transform duration-150 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none motion-reduce:hover:scale-100"
              >
                {formatI18nTemplate(bi("{v0}에서 읽기", "Read on {v0}"), { v0: platformLink.name })}
                <ArrowUpRight size={15} aria-hidden />
              </a>
            )}
            <Link
              href={detailPath}
              className="inline-flex min-h-11 items-center rounded-full border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {bi("작품 상세로", "Title details")}
            </Link>
          </div>
        </section>

        {/* 끝 카드 — 다음 화 동선 */}
        {hasNext ? (
          <Link
            href={`/title/${encodeURIComponent(title.slug)}/read/${episode + 1}`}
            className="group mt-4 flex items-center justify-between gap-4 rounded-2xl border border-white/12 bg-reader-panel p-5 transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <span>
              <span className="block text-xs font-medium text-white/55">{bi("다음 화", "Next episode")}</span>
              <span className="mt-1 block text-lg font-bold">
                {formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode + 1) })}
              </span>
            </span>
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 text-white transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transition-none">
              <ChevronRight size={19} aria-hidden />
            </span>
          </Link>
        ) : (
          <div className="mt-4 rounded-2xl border border-white/12 bg-reader-panel p-5 text-center">
            <p className="font-semibold text-white">{bi("지금까지 공개된 마지막 회차예요", "This is the latest available episode")}</p>
            <Link
              href={detailPath}
              className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              {bi("작품 상세로 돌아가기", "Back to title details")}
            </Link>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-white/45">
          {bi("화면을 탭하면 메뉴가 사라져요 — Esc로 나가기", "Tap the screen to hide the menus — Esc to exit")}
        </p>
      </div>

      {/* 하단 바 */}
      <footer
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[oklch(0.095_0.018_265/0.88)] backdrop-blur-md",
          chromeClass,
        )}
      >
        <div className="mx-auto flex h-16 w-full max-w-[720px] items-center gap-1.5 px-3 sm:gap-2 sm:px-4">
          <Link
            href={`${detailPath}#episodes`}
            aria-label={bi("회차 목록", "Episode list")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ListOrdered size={19} aria-hidden />
          </Link>
          {hasPrev ? (
            <Link
              href={`/title/${encodeURIComponent(title.slug)}/read/${episode - 1}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronLeft size={17} aria-hidden />
              <span className="hidden min-[420px]:inline">{bi("이전 화", "Prev")}</span>
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/30"
            >
              <ChevronLeft size={17} aria-hidden />
              <span className="hidden min-[420px]:inline">{bi("이전 화", "Prev")}</span>
            </span>
          )}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
            <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full transition-[width] duration-150 motion-reduce:transition-none"
                style={{ width: `${percent}%`, background: spectrumGradient(title.genres) }}
              />
            </div>
            <span className="numeral shrink-0 text-xs font-medium text-white/70">{percent}%</span>
          </div>
          {hasNext ? (
            <Link
              href={`/title/${encodeURIComponent(title.slug)}/read/${episode + 1}`}
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="hidden min-[420px]:inline">{bi("다음 화", "Next")}</span>
              <ChevronRight size={17} aria-hidden />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/30"
            >
              <span className="hidden min-[420px]:inline">{bi("다음 화", "Next")}</span>
              <ChevronRight size={17} aria-hidden />
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}

function ReaderMessageShell({
  children,
  detailPath,
}: {
  children: React.ReactNode;
  detailPath: string | null;
}) {
  useBilingualI18nRevision();
  return (
    <div className="grid min-h-[100dvh] place-items-center bg-reader-canvas px-4 py-16 text-white">
      <div className="w-full max-w-md">
        {children}
        {detailPath && (
          <Link
            href={detailPath}
            className="mt-5 inline-flex min-h-11 items-center rounded-full border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {bi("작품 상세로", "Title details")}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * 웹툰 뷰어 — `/title/:slug/read/:episode`.
 *
 * 2026-10-05 실측으로 회차 컷·회차별 메타데이터 계약이 없어, 이 페이지는 시안의
 * 리더 셸(진도 바·자동 숨김 크롬·회차 이동·끝 카드·읽던 위치 저장/복원)을 완성하고
 * 컷 자리는 정직한 빈 상태로 둔다. 작품 자체가 없는 경우와 회차 번호가 잘못된
 * 경우를 구분해 안내한다.
 */
export function TitleReaderPage() {
  useBilingualI18nRevision();
  const { slug, episode: episodeParam } = useParams();
  const { data, loading, error, notFound, reload } = useApiResource<ReaderTitleResponse>(
    slug ? `/api/titles/${encodeURIComponent(slug)}` : null,
    "작품 정보를 불러오지 못했습니다.",
  );
  const title = data?.title;
  const episodeNumber =
    episodeParam != null && /^\d+$/u.test(episodeParam) ? Number(episodeParam) : Number.NaN;
  const episodeValid = Number.isInteger(episodeNumber) && episodeNumber >= 1;
  useDocumentTitle(
    title && episodeValid
      ? `${title.title} ${episodeNumber}화`
      : title?.title,
  );

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-reader-canvas px-4 py-[4.5rem]" role="status" aria-label={bi("불러오는 중", "Loading")}>
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          <div className="h-28 animate-pulse rounded-2xl bg-white/8 motion-reduce:animate-none" />
          <div className="h-[50dvh] animate-pulse rounded-2xl bg-white/6 motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  if ((notFound || !data) && !error) return <TitleNotFound slug={slug} />;

  if (error || !data || !title) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-reader-canvas px-4 py-16">
        <div className="w-full max-w-md">
          <ErrorState
            title={bi("작품을 불러오지 못했습니다", "Couldn't load this title")}
            message={error}
            onRetry={reload}
          />
        </div>
      </div>
    );
  }

  const detailPath = `/title/${encodeURIComponent(title.slug)}`;
  const episodes = resolveTitleEpisodes(data);
  const total = resolveTotalEpisodes(title, episodes);
  const currentEpisode = episodes?.find((item) => item.number === episodeNumber);

  if (!episodeValid || (total != null && episodeNumber > total)) {
    return (
      <ReaderMessageShell detailPath={detailPath}>
        <h1 className="text-xl font-bold">{bi("없는 회차예요", "This episode doesn't exist")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          {total != null
            ? formatI18nTemplate(
                bi("이 작품은 총 {v0}화까지 공개되어 있어요.", "This title has {v0} episodes available."),
                { v0: String(total) },
              )
            : bi(
                "회차 번호가 올바르지 않아요. 작품 상세의 회차 안내에서 다시 들어와 주세요.",
                "That episode number isn't valid. Please come back through the title page.",
              )}
        </p>
        {total != null && (
          <Link
            href={`/title/${encodeURIComponent(title.slug)}/read/${total}`}
            className="mt-5 inline-flex min-h-11 items-center rounded-full bg-white px-5 text-sm font-bold text-[oklch(0.16_0.02_265)] transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {formatI18nTemplate(bi("마지막 화({v0}화)로", "Go to the latest (ep. {v0})"), {
              v0: String(total),
            })}
          </Link>
        )}
      </ReaderMessageShell>
    );
  }

  if (currentEpisode?.status === "scheduled") {
    return (
      <ReaderMessageShell detailPath={detailPath}>
        <h1 className="text-xl font-bold">
          {formatI18nTemplate(bi("{v0}화는 아직 공개 전이에요", "Episode {v0} isn't out yet"), {
            v0: String(episodeNumber),
          })}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          {bi(
            "공개 예정인 회차예요. 공개되면 이 주소에서 바로 읽을 수 있어요.",
            "This episode is scheduled. It will be readable at this address once it's out.",
          )}
        </p>
      </ReaderMessageShell>
    );
  }

  const platformLink = (() => {
    for (const item of title.availability) {
      if (item.url) return { name: PLATFORMS[item.platformId].name, url: item.url };
    }
    return null;
  })();

  return (
    <ReaderShell
      key={`${title.slug}:${episodeNumber}`}
      title={title}
      episode={episodeNumber}
      total={total}
      platformLink={platformLink}
    />
  );
}
