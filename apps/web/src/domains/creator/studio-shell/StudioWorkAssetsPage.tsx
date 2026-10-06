import { RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { StudioUnifiedAssetPreviewSurface } from "../StudioUnifiedAssetPreviewSurface";
import { STUDIO_RASTER_ASSETS } from "../render/studio-raster-assets";
import { listAssets, type StudioAsset } from "../studio-asset-library";
import { BG_SCENES } from "../studio-bg-scenes";
import { BG_SCENES_EXTRA } from "../studio-bg-scenes-extra";
import {
  STUDIO_GENERATED_BG_SCENES,
  decorateStudioGenerated2dAsset,
} from "../studio-generated-2d-catalog";
import { readStudioProjectLibrary } from "../studio-project-library-reader";
import { SCENE_TEMPLATES } from "../studio-scene-templates";
import {
  STUDIO_UNIFIED_ASSET_CATEGORY_LABELS,
  buildStudioUnifiedAssetCatalog,
  countStudioUnifiedAssets,
  searchStudioUnifiedAssets,
  type StudioUnifiedAssetCategory,
} from "../studio-unified-asset-catalog";
import { resolveStudioUnifiedAssetRichPreview } from "../studio-unified-asset-preview";

import { Container } from "@/shared/components/section";
import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { useBilingual, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const ASSET_CATEGORIES = ["all", "scene", "element", "3d", "mine"] as const satisfies readonly StudioUnifiedAssetCategory[];

const EMPTY_LOCAL_ASSETS: readonly StudioAsset[] = Object.freeze([]);

type LibraryLoadState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly assets: readonly StudioAsset[] }
  | { readonly status: "error" };

const PRIMARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-on-accent " +
  "transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";
const SECONDARY_ACTION_CLASS =
  "inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold text-fg-2 " +
  "transition-colors hover:bg-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70";

/**
 * 작품 스코프 에셋 화면. 플레이스홀더 안내를 대체하는 실제 타일 그리드로, 편집기 에셋
 * 워크스페이스와 같은 통합 카탈로그(번들 소재 + 내 에셋 라이브러리)를 이 작품의 편집기
 * 동선에 연결한다. 작품 문서가 참조 중인 에셋 목록은 서버·로컬 어디에도 열람 API가 없어
 * "사용 중"으로 꾸미지 않고, 작품에서 사용할 에셋을 고르는 화면으로 정직하게 둔다.
 */
export function StudioWorkAssetsPage({
  editorHref,
  remixSourceWorkId,
  workId,
}: {
  readonly editorHref: string;
  readonly remixSourceWorkId: string | null;
  readonly workId: string | null;
}) {
  useBilingualI18nRevision();
  const bt = useBilingual("StudioWorkAssetsPage");
  const [libraryState, setLibraryState] = useState<LibraryLoadState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const [category, setCategory] = useState<StudioUnifiedAssetCategory>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLibraryState({ status: "loading" });
    listAssets()
      .then((assets) => {
        if (!cancelled) setLibraryState({ status: "ready", assets });
      })
      .catch(() => {
        if (!cancelled) setLibraryState({ status: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  const workLabel = useMemo(() => {
    const identity = workId ?? remixSourceWorkId;
    if (!identity) return bt("작품", "Work");
    const title = ((): string | null => {
      try {
        return readStudioProjectLibrary(window.localStorage).projects
          .find((project) => project.id === identity && project.status !== "trashed")
          ?.title ?? null;
      } catch {
        return null;
      }
    })();
    if (remixSourceWorkId) {
      return title
        ? bt(`${title} 리믹스`, `${title} remix`)
        : bt(`리믹스 ${remixSourceWorkId}`, `Remix ${remixSourceWorkId}`);
    }
    return title ?? bt(`작품 ${identity}`, `Work ${identity}`);
  }, [bt, remixSourceWorkId, workId]);

  useDocumentTitle(bt(`${workLabel} 에셋`, `${workLabel} assets`));

  const localAssets = useMemo(
    () => (libraryState.status === "ready" ? libraryState.assets : EMPTY_LOCAL_ASSETS),
    [libraryState],
  );
  const catalog = useMemo(
    () =>
      buildStudioUnifiedAssetCatalog({
        rasterAssets: STUDIO_RASTER_ASSETS,
        backgrounds: [
          ...STUDIO_GENERATED_BG_SCENES,
          ...BG_SCENES,
          ...BG_SCENES_EXTRA,
        ],
        sceneTemplates: [...SCENE_TEMPLATES],
        localAssets,
      }).map(decorateStudioGenerated2dAsset),
    [localAssets],
  );
  const counts = useMemo(() => countStudioUnifiedAssets(catalog), [catalog]);
  const visibleItems = useMemo(
    () => searchStudioUnifiedAssets(catalog, { category, query, limit: 240 }),
    [catalog, category, query],
  );
  const previewById = useMemo(
    () => new Map(visibleItems.map((item) => [
      item.id,
      resolveStudioUnifiedAssetRichPreview(item),
    ] as const)),
    [visibleItems],
  );

  const mineEmpty = category === "mine" && localAssets.length === 0 && !query.trim();

  return (
    <div data-route-ready="studio-work-assets" className="bg-bg text-fg">
      <Container size="wide" className="py-7 sm:py-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[0.65rem] font-black uppercase tracking-[0.16em] text-accent">
              {bt("작품 에셋", "Work assets")}
            </p>
            <h1 className="mt-1 truncate text-2xl font-black tracking-tight sm:text-3xl" title={workLabel}>
              {workLabel}
            </h1>
            <p className="mt-2 text-sm leading-6 text-fg-2">
              {bt(
                "이 작품에서 사용할 에셋을 골라 편집기에서 원고에 삽입합니다. 타일을 열면 이 작품의 편집기로 이동합니다.",
                "Pick assets to use in this work and insert them into the manuscript from the editor. Opening a tile takes you to this work's editor.",
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={editorHref} data-studio-route-exit="editor" className={PRIMARY_ACTION_CLASS}>
              {bt("이어서 그리기", "Continue drawing")}
            </Link>
            <Link href="/studio/assets" className={SECONDARY_ACTION_CLASS}>
              {bt("에셋 허브에서 가져오기", "Get from asset hub")}
            </Link>
            <Link href="/showcase" data-studio-route-exit="site" className={SECONDARY_ACTION_CLASS}>
              {bt("창작 게시판으로", "To creator board")}
            </Link>
          </div>
        </header>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-line bg-card p-1" role="group" aria-label={bt("에셋 분류", "Asset categories")}>
            {ASSET_CATEGORIES.map((candidate) => {
              const active = candidate === category;
              return (
                <button
                  key={candidate}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(candidate)}
                  className={cn(
                    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70",
                    active ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
                  )}
                >
                  {STUDIO_UNIFIED_ASSET_CATEGORY_LABELS[candidate]}
                  <span className={cn("text-[0.65rem] font-black", active ? "text-on-accent/80" : "text-fg-3")}>
                    {counts[candidate]}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="relative min-w-52 flex-1 sm:max-w-xs">
            <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3" />
            <span className="sr-only">{bt("에셋 검색", "Search assets")}</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={bt("에셋 이름·키워드 검색", "Search by name or keyword")}
              className="min-h-11 w-full rounded-xl border border-line bg-card pl-9 pr-3 text-sm text-fg placeholder:text-fg-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            />
          </label>
        </div>

        {libraryState.status === "loading" ? (
          <div className="mt-6" aria-busy="true">
            <p role="status" className="text-sm text-fg-2">
              {bt("에셋을 불러오는 중…", "Loading assets…")}
            </p>
            <ul aria-hidden="true" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <li key={index} className="overflow-hidden rounded-2xl border border-line bg-card">
                  <div className="aspect-[16/10] animate-pulse bg-raised" />
                  <div className="space-y-2 p-3">
                    <div className="h-3 w-2/3 animate-pulse rounded bg-raised" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-raised" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {libraryState.status === "error" ? (
          <section className="mt-6 rounded-3xl border border-line bg-card p-6 text-center sm:p-10" aria-labelledby="studio-work-assets-error-title">
            <h2 id="studio-work-assets-error-title" className="text-lg font-black text-fg">
              {bt("내 에셋을 불러오지 못했습니다", "Could not load your assets")}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">
              {bt(
                "기기 저장소에서 에셋 라이브러리를 읽지 못했습니다. 저장된 에셋이 지워진 것은 아니니 다시 시도해 주세요.",
                "The asset library could not be read from device storage. Your saved assets are not deleted — please try again.",
              )}
            </p>
            <button
              type="button"
              onClick={() => setReloadToken((token) => token + 1)}
              className={cn(PRIMARY_ACTION_CLASS, "mt-5")}
            >
              <RotateCcw size={15} aria-hidden="true" className="mr-1.5" />
              {bt("다시 시도", "Try again")}
            </button>
          </section>
        ) : null}

        {libraryState.status === "ready" && visibleItems.length > 0 ? (
          <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label={bt("에셋 목록", "Asset list")}>
            {visibleItems.map((item) => {
              const preview = previewById.get(item.id);
              return (
              <li key={item.id}>
                <Link
                  href={editorHref}
                  aria-label={`${item.title} — ${item.useLabel}`}
                  className="group block overflow-hidden rounded-2xl border border-line bg-card transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <div className="relative aspect-[16/10] overflow-hidden bg-raised">
                    {preview ? (
                      <StudioUnifiedAssetPreviewSurface preview={preview} mode="thumbnail" />
                    ) : null}
                    {item.badges.length > 0 ? (
                      <span className="absolute left-2 top-2 flex gap-1">
                        {item.badges.slice(0, 2).map((badge) => (
                          <span key={badge} className="rounded-full bg-bg/80 px-2 py-0.5 text-[0.65rem] font-black text-fg backdrop-blur">
                            {badge}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-bold text-fg" title={item.title}>
                      {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-fg-3">
                      {item.categoryLabel} · {item.useLabel}
                    </p>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        ) : null}

        {libraryState.status === "ready" && visibleItems.length === 0 ? (
          <section className="mt-6 rounded-3xl border border-line bg-card p-6 text-center sm:p-10" aria-labelledby="studio-work-assets-empty-title">
            <h2 id="studio-work-assets-empty-title" className="text-lg font-black text-fg">
              {mineEmpty
                ? bt("아직 저장한 에셋이 없습니다", "No saved assets yet")
                : bt("조건에 맞는 에셋이 없습니다", "No assets match")}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-fg-2">
              {mineEmpty
                ? bt(
                    "편집기에서 이미지를 저장하거나 에셋 허브에서 소재를 가져오면 이 작품에서 바로 사용할 수 있습니다.",
                    "Save an image from the editor or bring materials from the asset hub to use them in this work right away.",
                  )
                : bt(
                    "검색어나 분류를 바꾸면 다른 에셋을 볼 수 있습니다.",
                    "Change the search term or category to see other assets.",
                  )}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {mineEmpty ? (
                <Link href="/studio/assets" className={PRIMARY_ACTION_CLASS}>
                  {bt("에셋 허브 열기", "Open asset hub")}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCategory("all");
                    setQuery("");
                  }}
                  className={PRIMARY_ACTION_CLASS}
                >
                  {bt("필터 초기화", "Reset filters")}
                </button>
              )}
              <Link href={editorHref} className={SECONDARY_ACTION_CLASS}>
                {bt("작품 편집기 열기", "Open work editor")}
              </Link>
            </div>
          </section>
        ) : null}
      </Container>
    </div>
  );
}
