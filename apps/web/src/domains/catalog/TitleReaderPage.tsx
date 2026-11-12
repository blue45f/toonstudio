import { catalogStatusText } from "./catalog-status-i18n";
import {
  ChevronLeft,
  ChevronRight,
  ListOrdered,
  SlidersHorizontal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { Title } from "@/shared/lib/types";

import { resolveTitleEpisodes, resolveTotalEpisodes } from "./title-episodes";
import { TitleNotFound } from "./TitleNotFound";
import { TitleReaderImmersiveCreationBar } from "./TitleReaderImmersiveCreationBar";
import { TitleReaderReaBridgeCard } from "./TitleReaderReaBridgeCard";
import { ReaderPlatformNotice } from "./ReaderPlatformNotice";
import { resolveExternalPlatformGuide } from "./title-episode-empty-guide";
import { useLocalCatalogFallback } from "./local-catalog-fallback";

import { useNextgenLabSettings } from "@/shared/hooks/use-nextgen-lab-settings";
import { useScreenWakeLock } from "@/shared/hooks/use-screen-wake-lock";
import { ErrorState } from "@/shared/components/feedback/error-state";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { PLATFORMS } from "@/shared/lib/platforms";
import { STATUS_LABEL } from "@/shared/lib/taxonomy";
import { cn } from "@/shared/lib/utils";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import Link from "@/shared/navigation/router-link";
import { useApiResource } from "@/platform/use-api-resource";
import { useAppConfig } from "@/platform/environment/use-app-config";

const bi = (ko: string, en: string) =>
  translateBilingualValueForActiveLocale("TitleReaderPage", ko, en);

interface ReaderTitleResponse {
  title: Title;
}

type ReaderTheme = "dark" | "oled" | "sepia" | "paper";
type ReaderWidth = "narrow" | "standard" | "wide";
type AutoScrollSpeed = 1 | 1.5 | 2;
interface ReaderComfortPrefs { theme: ReaderTheme; width: ReaderWidth; speed: AutoScrollSpeed }

const COMFORT_STORAGE_KEY = "toonstudio.reader-comfort.v1";
const DEFAULT_COMFORT: ReaderComfortPrefs = { theme: "dark", width: "standard", speed: 1 };

function loadComfortPrefs(): ReaderComfortPrefs {
  try {
    const raw = window.localStorage.getItem(COMFORT_STORAGE_KEY);
    if (!raw) return DEFAULT_COMFORT;
    const p = JSON.parse(raw) as Partial<ReaderComfortPrefs>;
    const theme: ReaderTheme = p.theme === "oled" || p.theme === "sepia" || p.theme === "paper" ? p.theme : "dark";
    const width: ReaderWidth = p.width === "narrow" || p.width === "wide" ? p.width : "standard";
    const speed: AutoScrollSpeed = p.speed === 1.5 || p.speed === 2 ? p.speed : 1;
    return { theme, width, speed };
  } catch {
    return DEFAULT_COMFORT;
  }
}

function saveComfortPrefs(prefs: ReaderComfortPrefs): void {
  try { window.localStorage.setItem(COMFORT_STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

const THEME_CLASSES: Record<ReaderTheme, string> = {
  dark: "bg-reader-canvas text-white",
  oled: "bg-black text-white",
  sepia: "bg-[#1c1813] text-[#f5ebd6]",
  paper: "bg-[#23252b] text-[#f1f3f5]",
};
const WIDTH_CLASSES: Record<ReaderWidth, string> = {
  narrow: "max-w-[580px]",
  standard: "max-w-[720px]",
  wide: "max-w-[900px]",
};

function ReaderShell({
  title,
  episode,
  total,
  platformLink,
  publishedEpisodes,
}: {
  title: Title;
  episode: number;
  total: number | undefined;
  platformLink: { name: string; href: string } | null;
  publishedEpisodes: readonly number[];
}) {
  useBilingualI18nRevision();
  const navigate = useNavigate();
  // 실험 기능: 읽는 동안 화면 꺼짐 방지 — 지원 환경에서, 설정이 켜져 있을 때만 붙잡는다.
  const labSettings = useNextgenLabSettings();
  useScreenWakeLock(labSettings.readerWakeLock);
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const settingsToggleRef = useRef<HTMLButtonElement>(null);
  const episodeToggleRef = useRef<HTMLButtonElement>(null);
  const hiddenChromeFocusRef = useRef<HTMLElement | null>(null);
  const pendingPanelFocusRef = useRef<HTMLElement | null>(null);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [comfort, setComfort] = useState<ReaderComfortPrefs>(() => loadComfortPrefs());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [episodeDrawerOpen, setEpisodeDrawerOpen] = useState(false);

  const detailPath = `/title/${encodeURIComponent(title.slug)}`;
  const previousEpisode = publishedEpisodes.filter((number) => number < episode).at(-1);
  const nextEpisode = publishedEpisodes.find((number) => number > episode);
  const hasPrev = previousEpisode != null;
  const hasNext = nextEpisode != null;
  const currentEpisodeConfirmed = publishedEpisodes.includes(episode);

  const updateComfort = useCallback((patch: Partial<ReaderComfortPrefs>) => {
    setComfort((prev) => {
      const next = { ...prev, ...patch };
      saveComfortPrefs(next);
      return next;
    });
  }, []);

  const pokeChrome = useCallback(() => setChromeVisible(true), []);

  const toggleChrome = useCallback(() => {
    if (chromeVisible) {
      const active = document.activeElement;
      const insideChrome = active instanceof HTMLElement
        && (headerRef.current?.contains(active) || footerRef.current?.contains(active));
      hiddenChromeFocusRef.current = insideChrome ? active : null;
      if (insideChrome) rootRef.current?.focus({ preventScroll: true });
    }
    setChromeVisible(!chromeVisible);
  }, [chromeVisible]);

  // inert를 해제한 DOM 반영 뒤에만 숨기기 전 조작부 또는 닫힌 패널의 토글로 복귀한다.
  useEffect(() => {
    if (!chromeVisible) return;
    const pending = pendingPanelFocusRef.current;
    const target = pending ?? hiddenChromeFocusRef.current;
    const shouldRestore = pending != null || document.activeElement === rootRef.current;
    pendingPanelFocusRef.current = null;
    hiddenChromeFocusRef.current = null;
    if (shouldRestore && target?.isConnected) target.focus({ preventScroll: true });
  }, [chromeVisible, settingsOpen, episodeDrawerOpen]);

  // 원고가 없는 안내에서는 메뉴를 타이머로 숨기지 않는다.
  useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, []);

  // 이 화면은 외부 감상 안내이며 원고 컷 계약이 없다. 안내문 스크롤이나
  // 종료를 독서 진도로 저장하지 않고, 기존 읽기 기록도 덮어쓰지 않는다.

  // Esc는 열린 패널부터 닫고, 패널이 없을 때 상세로 이동한다. M은 메뉴와 초점을 함께 전환한다.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (settingsOpen || episodeDrawerOpen) {
          pendingPanelFocusRef.current = settingsOpen ? settingsToggleRef.current : episodeToggleRef.current;
          hiddenChromeFocusRef.current = null;
          setSettingsOpen(false);
          setEpisodeDrawerOpen(false);
          pokeChrome();
          return;
        }
        navigate(detailPath);
        return;
      }
      const target = event.target;
      if (target instanceof Element && target.closest("input,textarea,select,[contenteditable='true']")) return;
      if (event.key === "[" && hasPrev) {
        event.preventDefault();
        navigate(`/title/${encodeURIComponent(title.slug)}/read/${previousEpisode}`);
        return;
      }
      if (event.key === "]" && hasNext) {
        event.preventDefault();
        navigate(`/title/${encodeURIComponent(title.slug)}/read/${nextEpisode}`);
        return;
      }
      if (event.key === "m" || event.key === "M") {
        event.preventDefault();
        toggleChrome();
        return;
      }
      pokeChrome();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, detailPath, pokeChrome, toggleChrome, settingsOpen, episodeDrawerOpen, hasPrev, hasNext, title.slug, previousEpisode, nextEpisode]);

  const handleContentPointerDown = (event: React.PointerEvent) => {
    const target = event.target;
    if (target instanceof Element && target.closest("a,button,summary,input,select,textarea,[role='button']")) {
      pokeChrome();
      return;
    }
    toggleChrome();
  };

  const chromeClass = cn(
    "transition-opacity duration-300 motion-reduce:transition-none",
    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
  );
  const episodeWindowStart = Math.max(0, publishedEpisodes.indexOf(episode) - 12);
  const quickEpisodes = publishedEpisodes.slice(episodeWindowStart, episodeWindowStart + 24);
  const chipClass = (active: boolean) =>
    cn(
      "min-h-12 [min-block-size:3rem]! [min-inline-size:3rem]! rounded-full border px-2.5 font-semibold transition-colors",
      active ? "border-white bg-white text-[oklch(0.16_0.02_265)]" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/15",
    );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-reader-theme={comfort.theme}
      data-reader-width={comfort.width}
      className={cn("reader-reference-root min-h-[100dvh] outline-none transition-colors duration-200 motion-reduce:transition-none", THEME_CLASSES[comfort.theme])}
    >
      {/* 상단 바 */}
      <header
        ref={headerRef}
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
        className={cn(
          "fixed inset-x-0 top-0 z-40 border-b border-white/10 bg-[oklch(0.095_0.018_265/0.88)] backdrop-blur-md",
          chromeClass,
        )}
      >
        <div className={cn("mx-auto flex h-14 w-full items-center gap-2 px-3 sm:px-4", WIDTH_CLASSES[comfort.width])}>
          <Link
            href={detailPath}
            aria-label={bi("작품 상세로 나가기", "Back to title details")}
            className="grid size-12 shrink-0 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ChevronLeft size={20} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-tight">{title.title}</p>
            <p className="truncate text-xs leading-tight text-white/60">
              {currentEpisodeConfirmed
                ? formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode) })
                : bi("공식 감상 안내", "Official reading guide")}
              {currentEpisodeConfirmed && total != null &&
                formatI18nTemplate(bi(" · 총 {v0}화", " · of {v0}"), { v0: String(total) })}
            </p>
          </div>
          <button
            ref={settingsToggleRef}
            type="button"
            onClick={() => { setSettingsOpen((prev) => !prev); setEpisodeDrawerOpen(false); pokeChrome(); }}
            aria-expanded={settingsOpen}
            aria-label={bi("보기 설정", "Reader settings")}
            className={cn(
              "grid size-12 shrink-0 place-items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
              settingsOpen ? "border-white bg-white text-[oklch(0.16_0.02_265)]" : "border-white/15 bg-white/5 text-white/85 hover:bg-white/15",
            )}
          >
            <SlidersHorizontal size={16} aria-hidden />
          </button>
        </div>

        {/* 보기 설정 패널 — 원고가 없으므로 자동 스크롤은 제공하지 않는다. */}
        {settingsOpen && (
          <section
            aria-label={bi("뷰어 환경 설정", "Reader comfort settings")}
            className={cn("mx-auto border-t border-white/10 px-4 py-3 text-xs", WIDTH_CLASSES[comfort.width])}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bi("배경 톤", "Background tone")}>
                <span className="mr-1 font-semibold text-white/70">{bi("배경 톤", "Tone")}</span>
                {([
                  { id: "dark", label: bi("다크 기본", "Dark") },
                  { id: "oled", label: bi("순수 블랙", "OLED Black") },
                  { id: "sepia", label: bi("세피아", "Sepia") },
                  { id: "paper", label: bi("소프트 종이", "Soft Paper") },
                ] as const).map((item) => (
                  <button key={item.id} type="button" aria-pressed={comfort.theme === item.id} onClick={() => updateComfort({ theme: item.id })} className={chipClass(comfort.theme === item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={bi("원고 폭", "Canvas width")}>
                <span className="mr-1 font-semibold text-white/70">{bi("원고 폭", "Width")}</span>
                {([
                  { id: "narrow", label: bi("좁게 580px", "Narrow") },
                  { id: "standard", label: bi("표준 720px", "Standard") },
                  { id: "wide", label: bi("넓게 900px", "Wide") },
                ] as const).map((item) => (
                  <button key={item.id} type="button" aria-pressed={comfort.width === item.id} onClick={() => updateComfort({ width: item.id })} className={chipClass(comfort.width === item.id)}>
                    {item.label}
                  </button>
                ))}
              </div>

            </div>
            <p className="mt-3 leading-6 text-white/70">{bi("화면을 탭하면 메뉴가 사라져요 — Esc로 나가기 · M 메뉴 토글", "Tap the screen to hide menus — Esc to exit · M toggle menu")}</p>
          </section>
        )}
      </header>

      <div onPointerDown={handleContentPointerDown} className={cn("reader-reference-body mx-auto w-full px-4 pb-[calc(9rem+max(0px,var(--service-status-overlay-clearance,0px)))] max-md:pb-[calc(9rem+max(var(--site-float-base),var(--service-status-overlay-clearance,0px)))]", WIDTH_CLASSES[comfort.width])}>
        <ReaderPlatformNotice title={title} platformLink={platformLink} detailPath={detailPath}>
          {/* 회차 제목·날짜는 계약에 없어 작품 실데이터만 간결하게 표시한다. */}
          <section aria-label={bi("회차 정보", "Episode info")} className="reader-episode-context">
            <p className="reader-episode-context-number">
              <strong>{currentEpisodeConfirmed
                ? formatI18nTemplate(bi("{v0}화", "Episode {v0}"), { v0: String(episode) })
                : bi("공식 감상 안내", "Official reading guide")}</strong>
            </p>
            <p className="reader-episode-context-title">{title.title}</p>
            <p className="reader-episode-context-meta">{title.author}{" · "}{STATUS_LABEL[title.status]}
              {title.updateDays && title.updateDays.length > 0 && ` · ${title.updateDays.join("·")} ${bi("연재", "serial")}`}
            </p>
          </section>
        </ReaderPlatformNotice>

        {publishedEpisodes.includes(episode) && !hasNext && <p className="mb-4 text-center text-sm text-white/75">{bi("확인된 공개 회차 중 마지막 회차예요", "This is the latest confirmed published episode")}</p>}

        <TitleReaderReaBridgeCard title={title} episode={episode} />
        <TitleReaderImmersiveCreationBar />

      </div>

      {/* 하단 바 */}
      <footer
        ref={footerRef}
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
        className={cn(
          "fixed inset-x-0 bottom-[max(0px,var(--service-status-overlay-clearance,0px))] max-md:bottom-[max(var(--site-float-base),var(--service-status-overlay-clearance,0px))] z-40 border-t border-white/10 bg-[oklch(0.095_0.018_265/0.88)] backdrop-blur-md",
          chromeClass,
        )}
      >
        {episodeDrawerOpen && (
          <section
            aria-label={bi("회차 빠른 이동 목록", "Quick episode drawer")}
            className={cn("mx-auto border-b border-white/10 px-4 py-3", WIDTH_CLASSES[comfort.width])}
          >
            <div className="mb-2 flex items-center justify-between text-xs text-white/70">
              <span className="font-semibold">{bi("회차 빠른 이동", "Quick episode jump")}</span>
              <Link href={`${detailPath}#episodes`} className="inline-flex min-h-12 items-center font-semibold text-white/85 underline-offset-4 hover:underline">
                {bi("전체 회차 상세 보기", "Full episode list")}
              </Link>
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {quickEpisodes.map((epNum) => {
                const isCurrent = epNum === episode;
                return (
                  <Link
                    key={epNum}
                    href={`/title/${encodeURIComponent(title.slug)}/read/${epNum}`}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors",
                      isCurrent
                        ? "border-white bg-white text-[oklch(0.16_0.02_265)]"
                        : "border-white/15 bg-white/5 text-white/80 hover:bg-white/15",
                    )}
                  >
                    {formatI18nTemplate(bi("{v0}화", "Ep.{v0}"), { v0: String(epNum) })}
                  </Link>
                );
              })}
            </div>
          </section>
        )}
        <div className={cn("reader-navigation-controls mx-auto flex min-h-16 w-full items-center gap-1.5 px-3 sm:gap-2 sm:px-4", WIDTH_CLASSES[comfort.width])}>
          <Link
            href={`${detailPath}#episodes`}
            aria-label={bi("회차 목록", "Episode list")}
            className="grid size-12 shrink-0 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ListOrdered size={19} aria-hidden />
          </Link>
          {quickEpisodes.length > 0 && <button
            ref={episodeToggleRef}
            type="button"
            onClick={() => { setEpisodeDrawerOpen((prev) => !prev); setSettingsOpen(false); pokeChrome(); }}
            aria-expanded={episodeDrawerOpen}
            aria-label={bi("회차 빠른 이동", "Quick episode jump")}
            className={cn(
              "inline-flex min-h-12 [min-block-size:3rem]! shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
              episodeDrawerOpen ? "border-white bg-white text-[oklch(0.16_0.02_265)]" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/15",
            )}
          >
            {bi("회차 선택", "Episodes")}
          </button>}
          {hasPrev ? (
            <Link
              href={`/title/${encodeURIComponent(title.slug)}/read/${previousEpisode}`}
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronLeft size={17} aria-hidden />
              <span className="reader-episode-action-label">{bi("이전 화", "Prev")}</span>
            </Link>
          ) : quickEpisodes.length > 0 ? (
            <span
              aria-disabled="true"
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/30"
            >
              <ChevronLeft size={17} aria-hidden />
              <span className="reader-episode-action-label">{bi("이전 화", "Prev")}</span>
            </span>
          ) : null}
          <span aria-hidden className="min-w-0 flex-1" />
          {hasNext ? (
            <Link
              href={`/title/${encodeURIComponent(title.slug)}/read/${nextEpisode}`}
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="reader-episode-action-label">{bi("다음 화", "Next")}</span>
              <ChevronRight size={17} aria-hidden />
            </Link>
          ) : quickEpisodes.length > 0 ? (
            <span
              aria-disabled="true"
              className="inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/30"
            >
              <span className="reader-episode-action-label">{bi("다음 화", "Next")}</span>
              <ChevronRight size={17} aria-hidden />
            </span>
          ) : null}
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
    <div className="reader-reference-root grid min-h-[100dvh] place-items-center bg-reader-canvas px-4 py-16 text-white">
      <div className="w-full max-w-md">
        {children}
        {detailPath && (
          <Link
            href={detailPath}
            className="mt-5 inline-flex min-h-12 items-center rounded-full border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
 * 외부 감상 안내 셸(메뉴·회차 이동·보기 설정)을 제공하고
 * 컷 자리는 정직한 빈 상태로 둔다. 작품 자체가 없는 경우와 회차 번호가 잘못된
 * 경우를 구분해 안내한다.
 */
export function TitleReaderPage() {
  useBilingualI18nRevision();
  const { showAvailability } = useAppConfig();
  const { slug, episode: episodeParam } = useParams();
  const requestedDetailPath = slug ? `/title/${encodeURIComponent(slug)}` : null;
  const titleApiUrl = slug ? `/api/titles/${encodeURIComponent(slug)}` : null;
  const resource = useApiResource<ReaderTitleResponse>(
    titleApiUrl,
    catalogStatusText("catalog.status.titleReader.loadFailed", "작품 정보를 불러오지 못했습니다."),
  );
  const { data, loading, error, notFound, reload } = useLocalCatalogFallback(titleApiUrl, resource);
  const title = data?.title;
  const episodeNumber =
    episodeParam != null && /^\d+$/u.test(episodeParam) ? Number(episodeParam) : Number.NaN;
  const episodeValid = Number.isInteger(episodeNumber) && episodeNumber >= 1;
  const episodes = resolveTitleEpisodes(data);
  const currentEpisode = episodes?.find((item) => item.number === episodeNumber);
  useDocumentTitle(
    title && episodeValid
      ? currentEpisode ? `${title.title} ${episodeNumber}화` : `${title.title} · ${bi("공식 감상 안내", "Official reading guide")}`
      : title?.title,
  );

  if (loading) {
    return (
      <ReaderMessageShell detailPath={requestedDetailPath}>
        <div className="flex w-full flex-col gap-4" role="status" aria-label={bi("불러오는 중", "Loading")}>
          <div className="h-28 animate-pulse rounded-2xl bg-white/8 motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-2xl bg-white/6 motion-reduce:animate-none" />
        </div>
      </ReaderMessageShell>
    );
  }

  if ((notFound || !data) && !error) return <TitleNotFound slug={slug} />;

  if (error || !data || !title) {
    return (
      <ReaderMessageShell detailPath={requestedDetailPath}>
        <ErrorState
          className="[&>button]:[min-block-size:3rem]!"
          title={bi("작품을 불러오지 못했습니다", "Couldn't load this title")}
          message={error}
          onRetry={reload}
        />
      </ReaderMessageShell>
    );
  }

  const detailPath = `/title/${encodeURIComponent(title.slug)}`;
  const publishedEpisodes = [...new Set((episodes ?? []).filter((episode) => episode.status !== "scheduled").map((episode) => episode.number))];
  const latestPublishedEpisode = publishedEpisodes.at(-1);
  const total = resolveTotalEpisodes(title, episodes);

  if (!episodeValid || (total != null && episodeNumber > total)) {
    return (
      <ReaderMessageShell detailPath={detailPath}>
        <h1 className="text-xl font-bold">{bi("없는 회차예요", "This episode doesn't exist")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">
          {total != null
            ? formatI18nTemplate(
                bi("이 작품의 회차 정보는 {v0}화까지 연결돼 있어요.", "Episode information is connected up to episode {v0}."),
                { v0: String(total) },
              )
            : bi(
                "회차 번호가 올바르지 않아요. 작품 상세의 회차 안내에서 다시 들어와 주세요.",
                "That episode number isn't valid. Please come back through the title page.",
              )}
        </p>
        {latestPublishedEpisode != null && (
          <Link
            href={`/title/${encodeURIComponent(title.slug)}/read/${latestPublishedEpisode}`}
            className="mt-5 inline-flex min-h-12 items-center rounded-full bg-white px-5 text-sm font-bold text-[oklch(0.16_0.02_265)] transition-colors hover:bg-white/85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {formatI18nTemplate(bi("마지막 화({v0}화)로", "Go to the latest (ep. {v0})"), {
              v0: String(latestPublishedEpisode),
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
            "공개 예정인 회차예요. 공개 여부와 감상 경로는 공식 플랫폼에서 확인해 주세요.",
            "This episode is scheduled. Check its release and reading options on the official platform.",
          )}
        </p>
      </ReaderMessageShell>
    );
  }

  const platformLink = (() => {
    const primary = resolveExternalPlatformGuide(title.availability, { availabilityVisible: showAvailability }).primary;
    return primary ? { name: PLATFORMS[primary.platformId]?.name ?? primary.platformId, href: primary.href } : null;
  })();

  return (
    <ReaderShell
      key={`${title.slug}:${episodeNumber}`}
      title={title}
      episode={episodeNumber}
      total={total}
      platformLink={platformLink}
      publishedEpisodes={publishedEpisodes}
    />
  );
}
