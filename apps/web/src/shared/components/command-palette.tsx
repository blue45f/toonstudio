import { apiFetch } from "@/platform/api";
import * as Dialog from "@radix-ui/react-dialog";
import { playSfx } from "@toonstudio/core/fx";
import { Command } from "cmdk";
import {
  Search,
  CornerDownLeft,
  X,
  Clock,
  ExternalLink,
  Tag,
  BookOpen,
  GraduationCap,
  Store,
} from "lucide-react";
import { useEffect, useState, useRef, useMemo } from "react";

import {
  PALETTE_COMMANDS,
  PALETTE_MODE_TABS,
  palettePagesForLocale,
  PALETTE_STUDIO_TOOLS,
  TRENDING_TAGS,
} from "./command-palette-data";
import { CommandPalettePreview } from "./command-palette-preview";
import { matchesCommandSearch } from "./command-palette-search";
import type { UnifiedSearchSection } from "./unified-search";
import { LoadingState } from "./LoadingState";
import { MiniPoster } from "./rank-row";
import { RatingInline } from "./ui/stars";

import type {
  CommandContext,
  PaletteMode,
  PaletteSelectedItem,
} from "./command-palette-types";
import type { Title } from "@/shared/lib/types";

import { statsAreEstimated } from "@/shared/lib/estimate";
import { genreTextColor } from "@/shared/lib/genre-color";
import { useI18n, useT } from "@/shared/lib/i18n";
import { useApp } from "@/shared/lib/store";
import { TYPE_LABEL } from "@/shared/lib/taxonomy";
import { toast } from "@/shared/lib/toast-store";
import { cn } from "@/shared/lib/utils";
import { useRouter } from "@/shared/navigation/navigation";
import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import {
  fetchSearchResponse,
  isSearchAbortError,
} from "@/platform/search-client";

type PaletteCommandItem = (typeof PALETTE_COMMANDS)[number];
type PaletteStudioToolItem = (typeof PALETTE_STUDIO_TOOLS)[number];
type PalettePageItem = ReturnType<typeof palettePagesForLocale>[number];

/** 퍼지 보강 결과 — 정확 필터에 못 든 항목을 오타 허용으로 뒤에 붙인다. */
interface FuzzyPaletteExtras {
  readonly commands: readonly PaletteCommandItem[];
  readonly tools: readonly PaletteStudioToolItem[];
  readonly pages: readonly PalettePageItem[];
}

const EMPTY_FUZZY_EXTRAS: FuzzyPaletteExtras = { commands: [], tools: [], pages: [] };

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<PaletteMode>("all");
  const debouncedQ = useDebouncedValue(q, 140);
  const [results, setResults] = useState<Title[]>([]);
  const [localSections, setLocalSections] = useState<readonly UnifiedSearchSection[]>([]);
  const [fuzzyExtras, setFuzzyExtras] = useState<FuzzyPaletteExtras>(EMPTY_FUZZY_EXTRAS);
  const [recentTitles, setRecentTitles] = useState<Title[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeValue, setActiveValue] = useState<string>("");

  const recentlyViewed = useApp((s) => s.recentlyViewed);
  const recentSearches = useApp((s) => s.recentSearches);
  const addRecentSearch = useApp((s) => s.addRecentSearch);
  const removeRecentSearch = useApp((s) => s.removeRecentSearch);
  const clearRecentSearches = useApp((s) => s.clearRecentSearches);

  const recentKey = recentlyViewed.slice(0, 6).join(",");
  const router = useRouter();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const pages = useMemo(() => palettePagesForLocale(language), [language]);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const trimmedQ = q.trim();
  const debouncedTrimmedQ = debouncedQ.trim();

  // Strip prefix characters like >, @, /, #, ? if present at start for inner searching
  let effectiveQuery = trimmedQ;
  let activePrefix = "";
  if (trimmedQ.startsWith(">")) {
    activePrefix = ">";
    effectiveQuery = trimmedQ.slice(1).trim();
  } else if (trimmedQ.startsWith("@")) {
    activePrefix = "@";
    effectiveQuery = trimmedQ.slice(1).trim();
  } else if (trimmedQ.startsWith("/")) {
    activePrefix = "/";
    effectiveQuery = trimmedQ.slice(1).trim();
  } else if (trimmedQ.startsWith("#")) {
    activePrefix = "#";
    effectiveQuery = trimmedQ.slice(1).trim();
  } else if (trimmedQ.startsWith("?")) {
    activePrefix = "?";
    effectiveQuery = trimmedQ.slice(1).trim();
  }

  const searchSettling = Boolean(effectiveQuery) && effectiveQuery !== debouncedTrimmedQ;
  const isSearching = Boolean(effectiveQuery) && (searchSettling || searchLoading);

  // Sound effects and body overflow management on open/close
  useEffect(() => {
    if (open) {
      playSfx("open");
    } else {
      playSfx("close");
    }
    document.body.style.overflow = open ? "hidden" : "";
    const id = open
      ? undefined
      : setTimeout(() => {
          setQ("");
          setMode("all");
          setActiveValue("");
        }, 0);
    return () => {
      document.body.style.overflow = "";
      if (id) clearTimeout(id);
    };
  }, [open]);

  // Derive active mode synchronously from prefix if present, else fallback to state
  const activeMode: PaletteMode =
    trimmedQ.startsWith(">")
      ? "commands"
      : trimmedQ.startsWith("@")
      ? "titles"
      : trimmedQ.startsWith("/")
      ? "studio"
      : trimmedQ.startsWith("?")
      ? "shortcuts"
      : mode;

  // Fetch search results when in 'all' or 'titles' mode and query exists
  useEffect(() => {
    if (!open || !debouncedTrimmedQ || (activeMode !== "all" && activeMode !== "titles")) {
      setSearchLoading(false);
      return;
    }
    let alive = true;
    const controller = new AbortController();
    setSearchLoading(true);

    const queryToSearch = debouncedTrimmedQ.replace(/^[>@/#?]/, "").trim();
    if (!queryToSearch) {
      setSearchLoading(false);
      setResults([]);
      return;
    }

    fetchSearchResponse(`sort=relevance&page=1&pageSize=8&q=${encodeURIComponent(queryToSearch)}`, controller.signal)
      .then((data) => {
        if (alive) setResults(data.items.slice(0, 8));
      })
      .catch((error: unknown) => {
        if (isSearchAbortError(error)) return;
        if (alive) setResults([]);
      })
      .finally(() => {
        if (alive) setSearchLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [debouncedTrimmedQ, open, activeMode]);

  // 통합 검색 집계층: 전체 모드에서는 강좌·도움말(매뉴얼)·소재(로컬 색인) 섹션도 함께 찾는다.
  // 프로바이더는 강좌·매뉴얼·사이트맵 데이터를 끌어오므로 셸 청크에 넣지 않고
  // 검색어가 있을 때만 동적 import로 읽는다. 작품은 위 서버 검색, 페이지는 아래
  // filteredPages가 이미 맡고 있어 여기서는 세 유형만 채운다.
  useEffect(() => {
    if (!open || !debouncedTrimmedQ || activeMode !== "all") {
      setLocalSections([]);
      return;
    }
    const queryToSearch = debouncedTrimmedQ.replace(/^[>@/#?]/, "").trim();
    if (!queryToSearch) {
      setLocalSections([]);
      return;
    }
    let alive = true;
    void import("./unified-search-providers")
      .then((providers) => {
        if (alive) setLocalSections(providers.searchUnifiedLocal(queryToSearch).sections);
      })
      .catch(() => {
        if (alive) setLocalSections([]);
      });
    return () => {
      alive = false;
    };
  }, [debouncedTrimmedQ, open, activeMode]);

  const unifiedCourseItems = localSections.find((section) => section.kind === "courses")?.items ?? [];
  const unifiedHelpItems = localSections.find((section) => section.kind === "help")?.items ?? [];
  const unifiedAssetItems = localSections.find((section) => section.kind === "assets")?.items ?? [];
  const unifiedAssetsMoreHref = localSections.find((section) => section.kind === "assets")?.moreHref;

  // 퍼지 보강(fuse.js): 동기 정확 필터(matchesCommandSearch)는 그대로 두고,
  // 거기 못 든 명령·도구·페이지를 오타 허용으로 랭킹해 뒤에 붙인다.
  // fuse.js는 진입(셸) 청크에 넣지 않으므로, 프로바이더와 같은 패턴으로
  // 검색어가 있을 때만 동적 import 한다 — 모듈은 검색 표면 전용 청크로
  // 분리되고, 첫 검색 키 입력에서만 로드된다.
  useEffect(() => {
    if (!open || !debouncedTrimmedQ) {
      setFuzzyExtras(EMPTY_FUZZY_EXTRAS);
      return;
    }
    const queryToSearch = debouncedTrimmedQ.replace(/^[>@/#?]/, "").trim();
    if (!queryToSearch) {
      setFuzzyExtras(EMPTY_FUZZY_EXTRAS);
      return;
    }
    let alive = true;
    void import("@/shared/lib/fuzzy-search")
      .then((fuzzy) => {
        if (!alive) return;
        const rankExtras = <T,>(
          pool: readonly T[],
          enabled: boolean,
          matches: (item: T) => boolean,
          textsOf: (item: T) => readonly string[],
        ): readonly T[] =>
          enabled
            ? fuzzy
                .fuzzyRankByTexts(pool.filter((item) => !matches(item)), queryToSearch, textsOf, { limit: 6 })
                .map((ranked) => ranked.item)
            : [];
        setFuzzyExtras({
          commands: rankExtras(
            PALETTE_COMMANDS,
            activeMode === "all" || activeMode === "commands",
            (cmd) => matchesCommandSearch(cmd.title, queryToSearch, cmd.keywords, cmd.subtitle),
            (cmd) => [cmd.title, cmd.subtitle ?? "", ...(cmd.keywords ?? [])],
          ),
          tools: rankExtras(
            PALETTE_STUDIO_TOOLS,
            activeMode === "all" || activeMode === "studio",
            (tool) => matchesCommandSearch(tool.name, queryToSearch, tool.keywords, tool.tip),
            (tool) => [tool.name, tool.tip ?? "", ...(tool.keywords ?? [])],
          ),
          pages: rankExtras(
            pages,
            activeMode === "all" || activeMode === "pages",
            (page) => matchesCommandSearch(page.title, queryToSearch, page.keywords, page.subtitle),
            (page) => [page.title, page.subtitle ?? "", ...(page.keywords ?? [])],
          ),
        });
      })
      .catch(() => {
        if (alive) setFuzzyExtras(EMPTY_FUZZY_EXTRAS);
      });
    return () => {
      alive = false;
    };
  }, [debouncedTrimmedQ, open, activeMode, pages]);

  // Load recently viewed titles when palette is open and query is empty
  useEffect(() => {
    if (!open || effectiveQuery || !recentKey) {
      return;
    }
    let alive = true;
    const controller = new AbortController();
    apiFetch(`/api/titles?ids=${encodeURIComponent(recentKey)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : { items: [] }))
      .then((data: { items?: Title[] }) => {
        if (!alive) return;
        const byId = new Map((data.items ?? []).map((item) => [item.id, item]));
        setRecentTitles(
          recentKey
            .split(",")
            .map((id) => byId.get(id))
            .filter((item): item is Title => Boolean(item))
        );
      })
      .catch(() => {
        if (alive) setRecentTitles([]);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [open, recentKey, effectiveQuery]);

  // Command Context builder
  const createContext = (): CommandContext => ({
    router,
    closePalette: () => {
      playSfx("close");
      onOpenChange(false);
    },
    showToast: (msg, opts) => toast(msg, opts),
    playSfx: (name) => playSfx(name),
    currentPath: typeof window !== "undefined" ? window.location.pathname : "/",
  });

  const go = (href: string, searchRecordQuery?: string) => {
    if (searchRecordQuery?.trim()) {
      addRecentSearch(searchRecordQuery.trim());
    }
    playSfx("close");
    onOpenChange(false);
    router.push(href);
  };

  const executeCommand = (cmdId: string) => {
    const command = PALETTE_COMMANDS.find((c) => c.id === cmdId);
    if (!command) return;
    command.action(createContext());
  };

  const executeStudioTool = (toolId: string) => {
    const tool = PALETTE_STUDIO_TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

    // 단축키가 없는 도구(작업실 표면)는 자기 라우트로 간다. 키 이벤트를 흉내 내면
    // 아무 일도 일어나지 않으면서 "선택됨" 토스트만 뜬다.
    if (tool.actionPath) {
      go(tool.actionPath);
      return;
    }

    const currentPath = typeof window !== "undefined" ? window.location.pathname : "";
    if (currentPath.startsWith("/studio")) {
      // Dispatch key event to Studio canvas
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: tool.shortcutKey.toLowerCase(),
          bubbles: true,
        })
      );
      toast(`스튜디오 도구 '${tool.name}' 선택됨 (${tool.shortcutKey})`, { tone: "info" });
      playSfx("tick");
      onOpenChange(false);
    } else {
      go(`/studio?tool=${tool.shortcutKey.toLowerCase()}`);
    }
  };

  // Switch tabs
  const handleSelectTab = (tabId: PaletteMode) => {
    playSfx("pop");
    setMode(tabId);
    inputRef.current?.focus();
  };

  // Tab keeps its native focus-navigation contract. Arrow keys move within the category tablist.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !q && mode !== "all") {
      setMode("all");
    }
  };

  const handleModeTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    tabId: PaletteMode,
  ) => {
    const keys = PALETTE_MODE_TABS.map((tab) => tab.id);
    const currentIndex = keys.indexOf(tabId);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % keys.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + keys.length) % keys.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = keys.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = keys[nextIndex]!;
    handleSelectTab(next);
    window.requestAnimationFrame(() => {
      document.getElementById(`command-palette-mode-${next}`)?.focus();
    });
  };

  // Filter commands, studio tools, and pages based on effective query and active mode
  const filteredCommands = PALETTE_COMMANDS.filter((cmd) => {
    if (activeMode !== "all" && activeMode !== "commands") return false;
    return matchesCommandSearch(cmd.title, effectiveQuery, cmd.keywords, cmd.subtitle);
  });

  const filteredStudioTools = PALETTE_STUDIO_TOOLS.filter((tool) => {
    if (activeMode !== "all" && activeMode !== "studio") return false;
    return matchesCommandSearch(tool.name, effectiveQuery, tool.keywords, tool.tip);
  });

  const filteredPages = pages.filter((page) => {
    if (activeMode !== "all" && activeMode !== "pages") return false;
    return matchesCommandSearch(page.title, effectiveQuery, page.keywords, page.subtitle);
  });

  // 표시 목록 — 정확 결과가 먼저, 퍼지 보강은 그 뒤(점수순). 보강은 디바운스된
  // 질의 기준이라 입력 중(effectiveQuery와 어긋난 동안)에는 붙이지 않는다.
  const fuzzySettled = effectiveQuery.length > 0 && effectiveQuery === debouncedTrimmedQ.replace(/^[>@/#?]/, "").trim();
  const visibleCommands = fuzzySettled ? [...filteredCommands, ...fuzzyExtras.commands] : filteredCommands;
  const visibleStudioTools = fuzzySettled ? [...filteredStudioTools, ...fuzzyExtras.tools] : filteredStudioTools;
  const visiblePages = fuzzySettled ? [...filteredPages, ...fuzzyExtras.pages] : filteredPages;

  // Determine currently selected item for the Live Inspector preview
  let selectedItem: PaletteSelectedItem = null;
  if (activeValue.startsWith("title-")) {
    const titleId = activeValue.replace("title-", "");
    const found = results.find((r) => r.id === titleId) || recentTitles.find((r) => r.id === titleId);
    if (found) selectedItem = { type: "title", title: found };
  } else if (activeValue.startsWith("cmd-")) {
    const found = PALETTE_COMMANDS.find((c) => c.id === activeValue);
    if (found) selectedItem = { type: "command", command: found };
  } else if (activeValue.startsWith("tool-")) {
    const found = PALETTE_STUDIO_TOOLS.find((t) => t.id === activeValue);
    if (found) selectedItem = { type: "studio-tool", tool: found };
  } else if (activeValue.startsWith("page-")) {
    const found = pages.find((p) => p.id === activeValue);
    if (found) selectedItem = { type: "page", page: found };
  } else if (activeValue.startsWith("recent-query-")) {
    const query = activeValue.replace("recent-query-", "");
    selectedItem = { type: "recent-query", query };
  }

  // Fallback selected item when nothing is active yet
  if (!selectedItem) {
    if (results.length > 0) {
      selectedItem = { type: "title", title: results[0]! };
    } else if (!effectiveQuery && recentTitles.length > 0) {
      selectedItem = { type: "title", title: recentTitles[0]! };
    } else if (visibleCommands.length > 0) {
      selectedItem = { type: "command", command: visibleCommands[0]! };
    } else if (visiblePages.length > 0) {
      selectedItem = { type: "page", page: visiblePages[0]! };
    }
  }

  const handleExecuteSelected = () => {
    if (!selectedItem) return;
    if (selectedItem.type === "title") {
      go(`/title/${selectedItem.title.slug}`, q);
    } else if (selectedItem.type === "command") {
      selectedItem.command.action(createContext());
    } else if (selectedItem.type === "studio-tool") {
      executeStudioTool(selectedItem.tool.id);
    } else if (selectedItem.type === "page") {
      go(selectedItem.page.href);
    } else if (selectedItem.type === "recent-query") {
      setQ(selectedItem.query);
      setMode("titles");
    }
  };

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => {
      if (!next) playSfx("close");
      onOpenChange(next);
    }}>
    <Dialog.Portal>
    <Dialog.Content
      data-slot="dialog-positioner"
      ref={dialogRef}
      aria-label={t("command.palette.label")}
      aria-describedby={undefined}
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        // 검색 진입점은 여러 곳이므로 실제로 열기 전 초점을 기억한다.
        const previousFocus = document.activeElement;
        returnFocusRef.current = previousFocus instanceof HTMLElement ? previousFocus : null;
        inputRef.current?.focus({ preventScroll: true });
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        // 명령 실행으로 다른 창에 이미 이동한 초점은 가로채지 않는다.
        const currentFocus = document.activeElement;
        if (returnFocusRef.current?.isConnected &&
          (currentFocus === document.body || dialogRef.current?.contains(currentFocus))) {
          returnFocusRef.current.focus({ preventScroll: true });
        }
      }}
      onEscapeKeyDown={(event) => {
        if (event.isComposing || event.keyCode === 229) event.preventDefault();
      }}
      className="fixed inset-0 z-[100] flex items-start justify-center px-4 pt-[8vh] sm:pt-[10vh]"
    >
      <Dialog.Title data-slot="dialog-title" className="sr-only">{t("command.palette.label")}</Dialog.Title>
      {/* Backdrop */}
      <button
        data-slot="dialog-overlay"
        type="button"
        aria-label={t("common.close")}
        onClick={() => {
          playSfx("close");
          onOpenChange(false);
        }}
        className="absolute inset-0 bg-[oklch(0.12_0.012_70/0.75)] backdrop-blur-md transition-opacity"
        style={{ animation: "fade-up 0.18s ease-out" }}
      />

      {/* Palette Container */}
      <Command
        data-slot="dialog-content"
        data-dialog-layout="command"
        shouldFilter={false}
        loop
        value={activeValue}
        onValueChange={setActiveValue}
        label={t("command.palette.label")}
        onKeyDown={handleKeyDown}
        className="pf-popup-open relative flex w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-[oklch(0.1_0.02_70/0.65)] ring-1 ring-[oklch(0.95_0.01_85/0.08)]"
        style={{ animation: "fade-up 0.22s var(--ease-out-expo)" }}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-accent shrink-0" />

          {/* Mode prefix pill if active */}
          {activePrefix && (
            <span className="flex items-center gap-1 rounded border border-accent/40 bg-accent-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-accent">
              {activePrefix}
              <span className="text-[10px] font-normal">
                {activeMode === "commands"
                  ? "명령"
                  : activeMode === "titles"
                  ? "작품"
                  : activeMode === "studio"
                  ? "도구"
                  : "태그"}
              </span>
            </span>
          )}

          <Command.Input
            data-slot="input"
            data-variant="command"
            ref={inputRef}
            value={q}
            onValueChange={(value) => {
              setQ(value);
              setResults([]);
              if (!value.trim()) setSearchLoading(false);
            }}
            placeholder="작품 제목, 작가, 기능 명령, 스튜디오 도구 검색..."
            className="h-14 flex-1 bg-transparent text-[0.95rem] text-fg outline-none placeholder:text-fg-3"
          />

          {q && (
            <button
              type="button"
              onClick={() => {
                setQ("");
                setResults([]);
                inputRef.current?.focus();
              }}
              aria-label="검색어 지우기"
              className="flex size-10 items-center justify-center rounded-xl text-fg-3 transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              title="검색어 지우기"
            >
              <X size={15} />
            </button>
          )}

          <kbd className="hidden rounded-md border border-line bg-card px-2 py-0.5 font-mono text-[0.65rem] font-medium text-fg-3 sm:block">
            ESC
          </kbd>
        </div>

        {/* Category Tabs */}
        <div data-slot="tabs-list" data-variant="command" role="tablist" aria-label="검색 범위" className="flex items-center gap-1.5 overflow-x-auto border-b border-line/70 bg-card/40 px-4 py-2 text-xs scrollbar-none">
          {PALETTE_MODE_TABS.map((tab) => {
            const isActive = activeMode === tab.id;
            return (
              <button
                key={tab.id}
                id={`command-palette-mode-${tab.id}`}
                data-slot="tabs-trigger"
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => handleSelectTab(tab.id)}
                onKeyDown={(event) => handleModeTabKeyDown(event, tab.id)}
                className={cn(
                  "flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  isActive
                    ? "bg-raised text-accent shadow-sm ring-1 ring-accent/30 font-semibold"
                    : "text-fg-3 hover:bg-card hover:text-fg"
                )}
              >
                <span>{tab.label}</span>
                {tab.prefix && (
                  <span className="font-mono text-[10px] opacity-60">
                    {tab.prefix}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Two-Pane Body */}
        <div className="flex h-[56vh] max-h-[520px] min-h-[380px] divide-x divide-line">
          {/* Left: Command List */}
          <Command.List className="flex-1 overflow-y-auto overscroll-contain p-2 scrollbar-thin">
            {/* Loading Indicator — DESIGN.md 스켈레톤 원칙(스피너 금지) */}
            {effectiveQuery && isSearching && (
              <LoadingState
                label={t("common.loading.search")}
                className="px-4 py-12"
              />
            )}

            {/* Empty Search Result */}
            {effectiveQuery &&
              !isSearching &&
              results.length === 0 &&
              visibleCommands.length === 0 &&
              visibleStudioTools.length === 0 &&
              visiblePages.length === 0 && (
                <div className="px-4 py-12 text-center text-sm text-fg-3">
                  <p>
                    {t("common.notFoundWithQuery").replace(
                      "{query}",
                      `'${effectiveQuery}'`
                    )}
                  </p>
                  <p className="mt-1 text-xs text-fg-3">
                    다른 키워드나 접두사(<code>&gt;</code> 명령어, <code>/</code> 도구)를 시도해보세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => go(`/search?q=${encodeURIComponent(effectiveQuery)}`)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent-soft px-3 py-1.5 text-xs font-semibold text-accent hover:bg-accent hover:text-on-accent pointer-coarse:min-h-11"
                  >
                    <span>통합 검색 결과 열기</span>
                    <ExternalLink size={12} />
                  </button>
                </div>
              )}

            {/* Empty Query: Trending Tags */}
            {!effectiveQuery && mode === "all" && (
              <div className="px-3 py-2">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-fg-3">
                  <Tag size={12} className="text-accent" />
                  <span>인기 탐색 태그</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TRENDING_TAGS.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => {
                        playSfx("tick");
                        setQ(item.tag);
                        setMode("titles");
                      }}
                      className="rounded-md border border-line bg-card px-2 py-0.5 text-xs text-fg-2 transition-all hover:border-accent hover:text-accent"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty Query: Recent Searches */}
            {!effectiveQuery && recentSearches.length > 0 && (activeMode === "all" || activeMode === "titles") && (
              <Command.Group
                forceMount
                heading={
                  <div className="flex items-center justify-between px-2 py-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                      최근 검색어
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        clearRecentSearches();
                        playSfx("tick");
                      }}
                      className="text-[10px] text-fg-3 hover:text-bad"
                    >
                      전체 삭제
                    </button>
                  </div>
                }
              >
                {recentSearches.slice(0, 5).map((searchQuery) => (
                  <Command.Item
                    forceMount
                    key={`search-${searchQuery}`}
                    value={`recent-query-${searchQuery}`}
                    onSelect={() => {
                      setQ(searchQuery);
                      setMode("titles");
                      playSfx("tick");
                    }}
                    className="group flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-xs transition-colors data-[selected=true]:bg-raised"
                  >
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-fg-3" />
                      <span className="text-fg">{searchQuery}</span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentSearch(searchQuery);
                        playSfx("tick");
                      }}
                      className="opacity-0 transition-opacity group-hover:opacity-100 hover:text-bad"
                      title="검색어 삭제"
                    >
                      <X size={13} />
                    </button>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Empty Query: Recent Viewed Titles */}
            {!effectiveQuery && recentTitles.length > 0 && (activeMode === "all" || activeMode === "titles") && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    최근 본 작품
                  </div>
                }
              >
                {recentTitles.map((item) => (
                  <Command.Item
                    forceMount
                    key={`recent-${item.id}`}
                    value={`title-${item.id}`}
                    onSelect={() => go(`/title/${item.slug}`, item.title)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors data-[selected=true]:bg-raised"
                  >
                    <MiniPoster title={item} className="w-8 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">
                        {item.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-fg-3">
                        <span style={{ color: genreTextColor(item.genres[0] ?? "", 0.8) }}>
                          {TYPE_LABEL[item.type]}
                        </span>
                        · {item.author}
                      </span>
                    </div>
                    <RatingInline
                      value={item.stats.ratingAvg}
                      estimated={statsAreEstimated(item)}
                      size="xs"
                    />
                    <CornerDownLeft
                      size={13}
                      className="text-fg-3 opacity-0 group-data-[selected=true]:opacity-100"
                    />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Commands Section */}
            {visibleCommands.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    시스템 및 명령어
                  </div>
                }
              >
                {visibleCommands.map((cmd) => {
                  const Icon = cmd.icon;
                  const state = cmd.getState?.();
                  return (
                    <Command.Item
                      forceMount
                      key={cmd.id}
                      value={cmd.id}
                      onSelect={() => executeCommand(cmd.id)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
                    >
                      <div className="flex size-7 items-center justify-center rounded-lg border border-line bg-card text-accent">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-fg">{cmd.title}</span>
                          {state && (
                            <span className="rounded bg-panel px-1.5 py-0.5 text-[10px] text-fg-3">
                              {state.label}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-xs text-fg-3">{cmd.subtitle}</p>
                      </div>
                      {cmd.shortcut && (
                        <div className="hidden items-center gap-1 sm:flex">
                          {cmd.shortcut.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-fg-3"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      )}
                      <CornerDownLeft
                        size={13}
                        className="text-fg-3 opacity-0 data-[selected=true]:opacity-100"
                      />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Studio Tools Section */}
            {visibleStudioTools.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    스튜디오 도구
                  </div>
                }
              >
                {visibleStudioTools.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Command.Item
                      forceMount
                      key={tool.id}
                      value={tool.id}
                      onSelect={() => executeStudioTool(tool.id)}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
                    >
                      <div className="flex size-7 items-center justify-center rounded-lg border border-line bg-card text-accent">
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-fg">{tool.name}</span>
                        <p className="truncate text-xs text-fg-3">{tool.tip}</p>
                      </div>
                      {tool.shortcutKey ? (
                        <kbd className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] font-semibold text-accent">
                          {tool.shortcutKey}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}

            {/* Search Results (Titles) */}
            {results.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    작품 검색 결과 ({results.length})
                  </div>
                }
              >
                {results.map((item) => (
                  <Command.Item
                    forceMount
                    key={`search-res-${item.id}`}
                    value={`title-${item.id}`}
                    onSelect={() => go(`/title/${item.slug}`, item.title)}
                    className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 transition-colors data-[selected=true]:bg-raised"
                  >
                    <MiniPoster title={item} className="w-8 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-fg">
                        {item.title}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-fg-3">
                        <span style={{ color: genreTextColor(item.genres[0] ?? "", 0.8) }}>
                          {TYPE_LABEL[item.type]}
                        </span>
                        · {item.author}
                      </span>
                    </div>
                    <RatingInline
                      value={item.stats.ratingAvg}
                      estimated={statsAreEstimated(item)}
                      size="xs"
                    />
                    <CornerDownLeft
                      size={13}
                      className="text-fg-3 opacity-0 data-[selected=true]:opacity-100"
                    />
                  </Command.Item>
                ))}

                <Command.Item
                  forceMount
                  value="__all-search"
                  onSelect={() => go(`/search?q=${encodeURIComponent(effectiveQuery)}`, effectiveQuery)}
                  className="mt-1 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-accent transition-colors data-[selected=true]:bg-accent-soft"
                >
                  <span>'{effectiveQuery}' 전체 검색 페이지 열기</span>
                  <ExternalLink size={12} />
                </Command.Item>
              </Command.Group>
            )}

            {/* Unified Search: Courses Section (통합 검색 집계층) */}
            {unifiedCourseItems.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    강좌 ({unifiedCourseItems.length})
                  </div>
                }
              >
                {unifiedCourseItems.map((item) => (
                  <Command.Item
                    forceMount
                    key={`course-${item.id}`}
                    value={`course-${item.id}`}
                    onSelect={() => go(item.href, effectiveQuery)}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
                  >
                    <GraduationCap size={16} className="text-fg-3 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-fg">{item.title}</span>
                      {item.description ? (
                        <span className="ml-2 text-xs text-fg-3">{item.description}</span>
                      ) : null}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Unified Search: Help & Manual Section (통합 검색 집계층) */}
            {unifiedHelpItems.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    도움말·매뉴얼 ({unifiedHelpItems.length})
                  </div>
                }
              >
                {unifiedHelpItems.map((item) => (
                  <Command.Item
                    forceMount
                    key={`helpdoc-${item.id}`}
                    value={`helpdoc-${item.id}`}
                    onSelect={() => go(item.href, effectiveQuery)}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
                  >
                    <BookOpen size={16} className="text-fg-3 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-fg">{item.title}</span>
                      {item.description ? (
                        <span className="ml-2 text-xs text-fg-3">{item.description}</span>
                      ) : null}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Unified Search: Assets Section (A6 — 경량 로컬 색인 항목) */}
            {unifiedAssetItems.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    소재 ({unifiedAssetItems.length})
                  </div>
                }
              >
                {unifiedAssetItems.map((item) => (
                  <Command.Item
                    forceMount
                    key={`asset-${item.id}`}
                    value={`asset-${item.id}`}
                    onSelect={() => go(item.href, effectiveQuery)}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
                  >
                    <Store size={16} className="text-fg-3 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-fg">{item.title}</span>
                      {item.description ? (
                        <span className="ml-2 text-xs text-fg-3">{item.description}</span>
                      ) : null}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Unified Search: Assets Link (전용 표면 서버 검색으로 이어가기) */}
            {unifiedAssetsMoreHref && effectiveQuery && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    소재
                  </div>
                }
              >
                <Command.Item
                  forceMount
                  value="__assets-search"
                  onSelect={() => go(unifiedAssetsMoreHref, effectiveQuery)}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-semibold text-accent transition-colors data-[selected=true]:bg-accent-soft"
                >
                  <Store size={16} className="shrink-0" />
                  <span>소재 마켓에서 '{effectiveQuery}' 찾기</span>
                  <ExternalLink size={12} className="ml-auto" />
                </Command.Item>
              </Command.Group>
            )}

            {/* Pages Section */}
            {visiblePages.length > 0 && (
              <Command.Group
                forceMount
                heading={
                  <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-fg-3">
                    페이지 바로가기
                  </div>
                }
              >
                {visiblePages.map((page) => {
                  const Icon = page.icon;
                  return (
                    <Command.Item
                      forceMount
                      key={page.id}
                      value={page.id}
                      onSelect={() => go(page.href)}
                      className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-fg transition-colors data-[selected=true]:bg-raised"
                    >
                      <Icon size={16} className="text-fg-3 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-fg">{page.title}</span>
                        <span className="ml-2 text-xs text-fg-3">
                          {page.trail ? (
                            <span className="font-medium text-fg-2">{page.trail} › </span>
                          ) : null}
                          {page.subtitle}
                        </span>
                      </div>
                      {page.shortcut && (
                        <div className="hidden items-center gap-1 sm:flex">
                          {page.shortcut.map((k) => (
                            <kbd
                              key={k}
                              className="rounded border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-fg-3"
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      )}
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>

          {/* Right: Live Inspector Preview (Hidden on small mobile screens) */}
          <div className="hidden w-[360px] shrink-0 bg-card/25 md:block">
            <CommandPalettePreview
              selectedItem={selectedItem}
              onExecute={handleExecuteSelected}
            />
          </div>
        </div>

        {/* Footer Navigation Bar */}
        <div className="flex items-center justify-between border-t border-line bg-panel/80 px-4 py-2 text-[11px] text-fg-3">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[10px] text-fg-2">
                ←→
              </kbd>
              <span>분류 전환</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[9px] text-fg-2">
                &gt;
              </kbd>
              <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[9px] text-fg-2">
                /
              </kbd>
              <span>접두사 필터</span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[9px] text-fg-2">
                ↑↓
              </kbd>
              <span>이동</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[9px] text-fg-2">
                ↵
              </kbd>
              <span>실행</span>
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-line bg-card px-1 py-0.5 font-mono text-[9px] text-fg-2">
                Esc
              </kbd>
              <span>닫기</span>
            </span>
          </div>
        </div>
      </Command>
    </Dialog.Content>
    </Dialog.Portal>
    </Dialog.Root>
  );
}
