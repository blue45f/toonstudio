import {
  Box,
  Film,
  Layers,
  Paintbrush,
  Search,
  Spline,
  UserRound,
  X,
} from "lucide-react";
import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { cn } from "@/shared/lib/utils";
import {
  STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
  type StudioExpandedEcosystemCommand,
} from "../shortcuts/studio-expanded-ecosystem-commands";
import {
  loadEcosystemModule,
  preloadEcosystemLoader,
  type StudioEcosystemLoadedModule,
} from "./studio-ecosystem-lazy-registry";
import {
  STUDIO_EXPANDED_TOOL_CATEGORIES,
  countExpandedToolsByCategory,
  filterExpandedTools,
  type StudioExpandedToolCardModel,
  type StudioExpandedToolCategoryId,
} from "./studio-expanded-tools-catalog";

export interface StudioExpandedToolsDrawerProps {
  readonly open: boolean;
  readonly initialCategory?: StudioExpandedToolCategoryId | "all";
  readonly initialQuery?: string;
  readonly commands?: readonly StudioExpandedEcosystemCommand[];
  readonly onClose?: () => void;
  readonly onLaunchTool?: (
    command: StudioExpandedEcosystemCommand,
    loadedModule: StudioEcosystemLoadedModule,
  ) => void;
  readonly className?: string;
}

interface ActiveLaunchedTool {
  readonly card: StudioExpandedToolCardModel;
  readonly loadedModule: StudioEcosystemLoadedModule;
}

const LazyStudioExpandedToolRunnerHost = lazy(() =>
  import("./StudioExpandedToolRunnerHost").then((module) => ({
    default: module.StudioExpandedToolRunnerHost,
  })),
);

function CategoryIcon({ categoryId }: { readonly categoryId: StudioExpandedToolCategoryId }) {
  switch (categoryId) {
    case "2d-painting":
      return <Paintbrush className="h-4 w-4 shrink-0" aria-hidden />;
    case "vector-layout":
      return <Spline className="h-4 w-4 shrink-0" aria-hidden />;
    case "bg3d-dcc":
      return <Box className="h-4 w-4 shrink-0" aria-hidden />;
    case "character-3d":
      return <UserRound className="h-4 w-4 shrink-0" aria-hidden />;
    case "story-planning":
      return <Layers className="h-4 w-4 shrink-0" aria-hidden />;
    case "motion-production":
      return <Film className="h-4 w-4 shrink-0" aria-hidden />;
  }
}

/**
 * Calm Chrome 3-Tier 점진 노출 규칙을 준수하는 지연 로드 전용 확장 전문 도구 서랍.
 *
 * - 기본 캔버스 시야를 가리지 않고 필요 시에만 열리는 서랍 표면으로 동작한다.
 * - 모든 도구 실행은 `loadEcosystemModule` 동적 `import()`만 호출해 초기 번들에 0바이트 영향을 준다.
 * - OKLCH 시맨틱 토큰, 44px 터치 타깃, 2px 인셋 라벤더 기준선, 키보드 탐색을 보장한다.
 */
export function StudioExpandedToolsDrawer({
  open,
  initialCategory = "2d-painting",
  initialQuery = "",
  commands = STUDIO_EXPANDED_ECOSYSTEM_COMMANDS,
  onClose,
  onLaunchTool,
  className,
}: StudioExpandedToolsDrawerProps) {
  const titleId = useId();
  const searchInputId = useId();
  const [selectedCategory, setSelectedCategory] = useState<StudioExpandedToolCategoryId | "all">(
    initialCategory,
  );
  const [query, setQuery] = useState(initialQuery);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeLaunched, setActiveLaunched] = useState<ActiveLaunchedTool | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>(
    "카테고리를 선택하거나 도구명·단축키·기존 툴 별칭으로 검색하세요.",
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const lastLaunchedCardIdRef = useRef<string | null>(null);
  const pendingFocusRestoreRef = useRef(false);
  const cardButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const handleReturnToList = useCallback(() => {
    pendingFocusRestoreRef.current = true;
    setActiveLaunched(null);
    setStatusMessage("도구 목록으로 돌아왔습니다.");
  }, []);

  useEffect(() => {
    if (!open) {
      setActiveLaunched(null);
      pendingFocusRestoreRef.current = false;
      return;
    }
    const handleGlobalKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (activeLaunched) {
        event.preventDefault();
        event.stopPropagation();
        handleReturnToList();
        return;
      }
      onClose?.();
    };
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [open, activeLaunched, handleReturnToList, onClose]);

  useEffect(() => {
    if (!open || activeLaunched !== null || !pendingFocusRestoreRef.current) return;
    pendingFocusRestoreRef.current = false;
    const targetId = lastLaunchedCardIdRef.current;
    if (!targetId) return;
    cardButtonRefs.current.get(targetId)?.focus({ preventScroll: true });
  }, [open, activeLaunched]);

  const categoryCounts = useMemo(() => countExpandedToolsByCategory(commands), [commands]);

  const filteredTools = useMemo(
    () =>
      filterExpandedTools({
        categoryId: query.trim() ? "all" : selectedCategory,
        query,
        commands,
      }),
    [commands, query, selectedCategory],
  );

  const tabOrder: readonly (StudioExpandedToolCategoryId | "all")[] = useMemo(
    () => ["all", ...STUDIO_EXPANDED_TOOL_CATEGORIES.map((c) => c.id)],
    [],
  );

  const handleTabKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      let nextIndex = -1;
      if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabOrder.length;
      else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabOrder.length) % tabOrder.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabOrder.length - 1;
      if (nextIndex < 0) return;

      event.preventDefault();
      const nextId = tabOrder[nextIndex];
      setSelectedCategory(nextId);
      setQuery("");
    },
    [tabOrder],
  );

  const handleLaunchCard = useCallback(
    async (card: StudioExpandedToolCardModel) => {
      lastLaunchedCardIdRef.current = card.command.id;
      setLoadingId(card.command.id);
      setStatusMessage(`${card.command.koreanLabel} 모듈을 지연 불러오는 중입니다...`);
      try {
        const loaded = await loadEcosystemModule(card.command.panelLoaderId);
        if (
          typeof loaded === "object" &&
          loaded !== null &&
          "kind" in loaded &&
          loaded.kind === "deferred"
        ) {
          setStatusMessage(
            card.command.unavailableReason ??
              `${card.command.koreanLabel} 기능은 준비 예정입니다.`,
          );
        } else {
          setStatusMessage(`${card.command.koreanLabel} 도구를 열었습니다.`);
        }
        setActiveLaunched({ card, loadedModule: loaded });
        onLaunchTool?.(card.command, loaded);
      } catch (caught) {
        const detail = caught instanceof Error ? caught.message : "모듈 로드에 실패했습니다.";
        setStatusMessage(`${card.command.koreanLabel} 불러오기 실패: ${detail}`);
      } finally {
        setLoadingId(null);
      }
    },
    [onLaunchTool],
  );

  if (!open) return null;

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-testid="studio-expanded-tools-drawer"
      data-studio-expanded-tools-tier="tier-3-lazy"
      data-active-tool-id={activeLaunched?.card.command.id ?? ""}
      className={cn(
        "flex h-full w-full max-w-2xl flex-col overflow-x-hidden border-l border-line bg-canvas text-fg shadow-xl [word-break:keep-all]",
        className,
      )}
    >
      {activeLaunched ? (
        <>
          <h2 id={titleId} className="sr-only">
            확장 전문 도구 — {activeLaunched.card.command.koreanLabel}
          </h2>
          <Suspense
            fallback={(
              <div
                data-testid="expanded-tool-runner-loading"
                className="flex flex-1 items-center justify-center p-6 text-xs text-fg-2"
              >
                {activeLaunched.card.command.koreanLabel} 실행 화면을 불러오는 중입니다...
              </div>
            )}
          >
            <LazyStudioExpandedToolRunnerHost
              command={activeLaunched.card.command}
              card={activeLaunched.card}
              loadedModule={activeLaunched.loadedModule}
              onBack={handleReturnToList}
              onCloseDrawer={onClose}
            />
          </Suspense>
        </>
      ) : (
        <>
          {/* 상단 헤더 */}
          <header className="flex items-center justify-between gap-3 border-b border-line bg-panel px-4 py-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id={titleId} className="text-sm font-semibold tracking-tight text-fg">
                  확장 전문 도구
                </h2>
                <span className="inline-flex items-center gap-1 rounded border border-line bg-card px-1.5 py-0.5 text-xs font-medium text-fg-2">
                  <kbd className="font-mono text-xs">F1</kbd>
                  <span aria-hidden>·</span>
                  <kbd className="font-mono text-xs">⌘K</kbd>
                </span>
              </div>
              <p className="mt-0.5 text-xs text-fg-2">
                필요할 때만 동적으로 불러오는 6대 전문 작업 도구 서랍 ({commands.length}종)
              </p>
            </div>

            <button
              type="button"
              data-testid="expanded-tools-close"
              onClick={onClose}
              aria-label="확장 전문 도구 서랍 닫기"
              className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-card text-fg-2 transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </header>

          {/* 검색 입력 (한국어 · 단축키 · 경쟁 툴 별칭 통합 필터) */}
          <div className="border-b border-line bg-panel/60 px-4 py-2.5">
            <label htmlFor={searchInputId} className="sr-only">
              도구명, 단축키, 기존 툴 별칭 검색
            </label>
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-3 h-4 w-4 text-fg-2"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                id={searchInputId}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                data-testid="expanded-tools-search-input"
                placeholder="한국어 도구명 · 단축키 · 익숙한 툴 용어 검색"
                className="min-h-11 w-full rounded-lg border border-line bg-card py-2 pl-9 pr-3 text-sm text-fg placeholder:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              />
            </div>
          </div>

          {/* 6대 카테고리 탭 + 전체 보기 (2px 인셋 라벤더 기준선) */}
          <div
            role="tablist"
            aria-label="확장 전문 도구 6대 분류"
            data-testid="expanded-tools-category-tabs"
            className="flex items-center gap-1 overflow-x-auto border-b border-line bg-panel/40 px-3"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategory === "all" && !query.trim()}
              data-testid="expanded-tools-tab-all"
              data-active-baseline={selectedCategory === "all" && !query.trim() ? "inset-lavender-2px" : "none"}
              onClick={() => {
                setSelectedCategory("all");
                setQuery("");
              }}
              onKeyDown={(event) => handleTabKeyDown(event, 0)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                selectedCategory === "all" && !query.trim()
                  ? "bg-card text-fg shadow-[inset_0_-2px_0_0_var(--studio-accent)]"
                  : "text-fg-2 hover:bg-raised/60 hover:text-fg",
              )}
            >
              <span>전체</span>
              <span className="tabular-nums text-fg-2">{commands.length}</span>
            </button>

            {STUDIO_EXPANDED_TOOL_CATEGORIES.map((category, idx) => {
              const isSelected = selectedCategory === category.id && !query.trim();
              return (
                <button
                  key={category.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`expanded-tools-tab-${category.id}`}
                  data-active-baseline={isSelected ? "inset-lavender-2px" : "none"}
                  title={`${category.labelKo} — ${category.descriptionKo}`}
                  onClick={() => {
                    setSelectedCategory(category.id);
                    setQuery("");
                  }}
                  onKeyDown={(event) => handleTabKeyDown(event, idx + 1)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                    isSelected
                      ? "bg-card text-fg shadow-[inset_0_-2px_0_0_var(--studio-accent)]"
                      : "text-fg-2 hover:bg-raised/60 hover:text-fg",
                  )}
                >
                  <CategoryIcon categoryId={category.id} />
                  <span>{category.labelKo}</span>
                  <span className="tabular-nums text-fg-2">{categoryCounts[category.id]}</span>
                </button>
              );
            })}
          </div>

          {/* 도구 카드 목록 */}
          <div
            role="region"
            aria-label="확장 도구 검색 결과"
            data-testid="expanded-tools-grid"
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-4"
          >
            {filteredTools.length === 0 ? (
              <div
                data-testid="expanded-tools-empty"
                className="rounded-xl border border-line bg-panel p-6 text-center text-sm text-fg-2"
              >
                검색어와 일치하는 도구가 없습니다. 다른 한국어 이름이나 기존 툴 별칭으로 찾아보세요.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {filteredTools.map((card) => {
                  const isBusy = loadingId === card.command.id;
                  const isPlanned = card.status === "planned";
                  return (
                    <button
                      key={card.command.id}
                      ref={(node) => {
                        if (node) cardButtonRefs.current.set(card.command.id, node);
                        else cardButtonRefs.current.delete(card.command.id);
                      }}
                      type="button"
                      data-testid={`expanded-tool-card-${card.command.id}`}
                      data-tool-category={card.categoryId}
                      data-tool-status={card.status}
                      aria-busy={isBusy}
                      title={
                        card.command.unavailableReason ??
                        `${card.command.koreanLabel} 실행 (동적 불러오기)`
                      }
                      onMouseEnter={() => preloadEcosystemLoader(card.command.panelLoaderId)}
                      onFocus={() => preloadEcosystemLoader(card.command.panelLoaderId)}
                      onClick={() => void handleLaunchCard(card)}
                      className={cn(
                        "group flex min-h-11 min-w-0 flex-col items-start justify-between gap-2 rounded-xl border border-line bg-card p-3 text-left transition-colors hover:border-accent/60 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                        isPlanned && "opacity-80",
                      )}
                    >
                      <div className="flex w-full min-w-0 items-start justify-between gap-2">
                        <span className="min-w-0 text-sm font-medium leading-snug text-fg">
                          {card.command.koreanLabel}
                        </span>
                        <span
                          className={cn(
                            "shrink-0 rounded-md border px-1.5 py-0.5 text-xs font-medium",
                            card.status === "ui-ready"
                              ? "border-accent/50 bg-accent/10 text-accent"
                              : card.status === "engine-ready"
                                ? "border-line bg-panel text-fg"
                                : "border-line bg-panel text-fg-2",
                          )}
                        >
                          {isBusy ? "불러오는 중" : card.statusBadgeKo}
                        </span>
                      </div>

                      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-1.5">
                        <span className="min-w-0 truncate text-xs text-fg-2">
                          {query.trim() && (card.matchedField === "alias" || card.matchedField === "product")
                            ? `별칭 일치 · ${card.command.competitorAliases[0]?.conceptNote ?? ""}`
                            : card.command.competitorAliases[0]?.conceptNote ?? ""}
                        </span>
                        {card.shortcutKeycaps.length > 0 ? (
                          <span
                            className="inline-flex shrink-0 items-center gap-0.5"
                            aria-label={`단축키 ${card.command.shortcut}`}
                          >
                            {card.shortcutKeycaps.map((cap) => (
                              <kbd
                                key={cap}
                                className="rounded border border-line bg-panel px-1.5 py-0.5 font-mono text-xs text-fg"
                              >
                                {cap}
                              </kbd>
                            ))}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* 하단 상태바 */}
      <footer className="flex items-center justify-between gap-2 border-t border-line bg-panel px-4 py-2 text-xs text-fg-2">
        <p role="status" aria-live="polite" data-testid="expanded-tools-status" className="min-w-0 truncate">
          {statusMessage}
        </p>
        <span className="shrink-0 tabular-nums">
          {activeLaunched ? "도구 실행 중" : `표시 ${filteredTools.length}종`}
        </span>
      </footer>
    </aside>
  );
}
