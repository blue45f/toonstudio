import { catalogStatusText } from "./catalog-status-i18n";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  ListOrdered,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import type { Title } from "@/shared/lib/types";

import { resolveTitleEpisodes, resolveTotalEpisodes } from "./title-episodes";
import { TitleNotFound } from "./TitleNotFound";
import { TitleReaderReaBridgeCard } from "./TitleReaderReaBridgeCard";

import { CoverImage } from "@/shared/components/cover-image";
import { coverStandardSrcSet } from "@/shared/lib/cover-proxy";
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
}: {
  title: Title;
  episode: number;
  total: number | undefined;
  platformLink: { name: string; url: string } | null;
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
  const hasPrev = episode > 1;
  const hasNext = total == null || episode < total;

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
      const target = event.target as HTMLElement | null;
      if (target?.closest("input,textarea,select,[contenteditable='true']")) return;
      if (event.key === "[" && hasPrev) {
        event.preventDefault();
        navigate(`/title/${encodeURIComponent(title.slug)}/read/${episode - 1}`);
        return;
      }
      if (event.key === "]" && hasNext) {
        event.preventDefault();
        navigate(`/title/${encodeURIComponent(title.slug)}/read/${episode + 1}`);
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
  }, [navigate, detailPath, pokeChrome, toggleChrome, settingsOpen, episodeDrawerOpen, hasPrev, hasNext, title.slug, episode]);

  const handleContentPointerDown = (event: React.PointerEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("a,button,summary,input,select,textarea,[role='button']")) {
      pokeChrome();
      return;
    }
    toggleChrome();
  };

  const chromeClass = cn(
    "transition-opacity duration-300 motion-reduce:transition-none",
    chromeVisible ? "opacity-100" : "pointer-events-none opacity-0",
  );
  const [coverFrom, coverTo] = title.cover;
  const episodeTotalForDrawer = Math.min(total ?? Math.max(episode + 3, 6), 24);
  const quickEpisodes = Array.from({ length: episodeTotalForDrawer }, (_, i) => i + 1);
  const chipClass = (active: boolean) =>
    cn(
      "min-h-11 [min-block-size:2.75rem]! [min-inline-size:2.75rem]! rounded-full border px-2.5 font-semibold transition-colors",
      active ? "border-white bg-white text-[oklch(0.16_0.02_265)]" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/15",
    );

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      data-reader-theme={comfort.theme}
      data-reader-width={comfort.width}
      className={cn("min-h-[100dvh] outline-none transition-colors duration-200 motion-reduce:transition-none", THEME_CLASSES[comfort.theme])}
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
          <button
            ref={settingsToggleRef}
            type="button"
            onClick={() => { setSettingsOpen((prev) => !prev); setEpisodeDrawerOpen(false); pokeChrome(); }}
            aria-expanded={settingsOpen}
            aria-label={bi("보기 설정", "Reader settings")}
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-full border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
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
          </section>
        )}
      </header>

      <div onPointerDown={handleContentPointerDown} className={cn("mx-auto w-full px-4 pb-36 pt-[4.5rem] max-md:pb-[calc(9rem+var(--site-float-base))]", WIDTH_CLASSES[comfort.width])}>
        {/* 회차 시작 카드 — 회차 제목·날짜는 계약에 없어 작품 실데이터만 표기한다 */}
        <section aria-label={bi("회차 정보", "Episode info")} className="flex gap-4 rounded-2xl border border-white/10 bg-reader-panel p-4 sm:p-5">
          <span className="relative block aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg sm:w-[4.5rem]">
            {title.coverImage ? (
              <CoverImage
                src={title.coverImage}
                alt=""
                srcSet={coverStandardSrcSet(title.coverImage)}
                sizes="(max-width: 639px) 4rem, 4.5rem"
                className="absolute inset-0 size-full object-cover"
              />
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
          <p className="mt-3 text-xs leading-relaxed text-white/65">
            {bi("컷이 제공되지 않아 읽기 진도를 기록하지 않아요.", "Reading progress is not recorded because panels are not provided.")}
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

        <TitleReaderReaBridgeCard title={title} episode={episode} />

        <p className="mt-6 text-center text-xs text-white/45">
          {bi(
            "화면을 탭하면 메뉴가 사라져요 — Esc로 나가기 · [ / ] 이전·다음 화 · M 메뉴 토글",
            "Tap the screen to hide menus — Esc to exit · [ / ] prev/next ep · M toggle menu",
          )}
        </p>
      </div>

      {/* 하단 바 */}
      <footer
        ref={footerRef}
        inert={!chromeVisible}
        aria-hidden={!chromeVisible}
        className={cn(
          "fixed inset-x-0 bottom-0 max-md:bottom-[var(--site-float-base)] z-40 border-t border-white/10 bg-[oklch(0.095_0.018_265/0.88)] backdrop-blur-md",
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
              <Link href={`${detailPath}#episodes`} className="inline-flex min-h-11 items-center font-semibold text-white/85 underline-offset-4 hover:underline">
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
                      "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border px-3 text-xs font-semibold transition-colors",
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
        <div className={cn("mx-auto flex h-16 w-full items-center gap-1.5 px-3 sm:gap-2 sm:px-4", WIDTH_CLASSES[comfort.width])}>
          <Link
            href={`${detailPath}#episodes`}
            aria-label={bi("회차 목록", "Episode list")}
            className="grid size-11 shrink-0 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <ListOrdered size={19} aria-hidden />
          </Link>
          <button
            ref={episodeToggleRef}
            type="button"
            onClick={() => { setEpisodeDrawerOpen((prev) => !prev); setSettingsOpen(false); pokeChrome(); }}
            aria-expanded={episodeDrawerOpen}
            aria-label={bi("회차 빠른 이동", "Quick episode jump")}
            className={cn(
              "inline-flex min-h-11 [min-block-size:2.75rem]! shrink-0 items-center rounded-full border px-2.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white",
              episodeDrawerOpen ? "border-white bg-white text-[oklch(0.16_0.02_265)]" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/15",
            )}
          >
            {bi("회차 선택", "Episodes")}
          </button>
          {hasPrev ? (
            <Link
              href={`/title/${encodeURIComponent(title.slug)}/read/${episode - 1}`}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ChevronLeft size={17} aria-hidden />
              <span className="hidden min-[420px]:inline">{bi("이전 화", "Prev")}</span>
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/30"
            >
              <ChevronLeft size={17} aria-hidden />
              <span className="hidden min-[420px]:inline">{bi("이전 화", "Prev")}</span>
            </span>
          )}
          <span aria-hidden className="min-w-0 flex-1" />
          {hasNext ? (
            <Link
              href={`/title/${encodeURIComponent(title.slug)}/read/${episode + 1}`}
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <span className="hidden min-[420px]:inline">{bi("다음 화", "Next")}</span>
              <ChevronRight size={17} aria-hidden />
            </Link>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-full px-2.5 text-sm font-medium text-white/30"
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
 * 외부 감상 안내 셸(메뉴·회차 이동·보기 설정)을 제공하고
 * 컷 자리는 정직한 빈 상태로 둔다. 작품 자체가 없는 경우와 회차 번호가 잘못된
 * 경우를 구분해 안내한다.
 */
export function TitleReaderPage() {
  useBilingualI18nRevision();
  const { slug, episode: episodeParam } = useParams();
  const { data, loading, error, notFound, reload } = useApiResource<ReaderTitleResponse>(
    slug ? `/api/titles/${encodeURIComponent(slug)}` : null,
    catalogStatusText("catalog.status.titleReader.loadFailed", "작품 정보를 불러오지 못했습니다."),
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
            className="[&>button]:[min-block-size:2.75rem]!"
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
