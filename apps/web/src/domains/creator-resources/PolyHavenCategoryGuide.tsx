/**
 * PolyHavenCategoryGuide.tsx
 *
 * Poly Haven 페이지(/research/3d-assets) 전용 검색 전 구성 — 시안 S4-03.
 * HDRI·텍스처·3D 모델 카테고리 행(대표 타일 4장씩)을 종류별 실제 검색으로만
 * 만든다. S4-02 큐레이션과 같은 위장 방지 계약을 카테고리 단위로 적용한다:
 * 검색 실패·미설정이거나, 종류가 확인된 실자료가 4장에 못 미치면 그 행은
 * 만들지 않는다. 세 행 모두 만들 수 없으면 정직한 빈 상태 구성이 대신한다.
 * 종류 판별은 polyhaven-resource.ts의 분류기(서버 설명 메타 복원)가 맡고,
 * 종류 검색 응답에 섞인 다른 종류 자료는 분류기로 걸러 행의 순도를 지킨다.
 */
import { useEffect, useState } from "react";

import { ResourcePreSearchFallback } from "./ResourceSearchPage";
import { resourceUsageLabel } from "./resource-usage";
import {
  POLYHAVEN_CATEGORIES,
  POLYHAVEN_CATEGORY_TILE_COUNT,
  POLYHAVEN_KIND_LABELS,
  polyHavenKindOf,
  type PolyHavenCategory,
  type PolyHavenKind,
} from "./polyhaven-resource";

import { TypographicCover } from "@/shared/components/typographic-cover";

import type { CreatorResource } from "@/shared/lib/creator-resources";
import { RESOURCE_LABELS, parseSearchResult } from "@/shared/lib/creator-resources";
import { apiFetch, apiPath } from "@/platform/api";

type CategoryState =
  | { phase: "loading" }
  | { phase: "ready"; items: CreatorResource[] }
  | { phase: "unavailable" };

const LOADING_STATES: Record<PolyHavenKind, CategoryState> = {
  hdri: { phase: "loading" },
  texture: { phase: "loading" },
  model: { phase: "loading" },
};

/**
 * 카테고리 3종의 대표 자료를 종류별 검색으로 한 번씩 확인한다. 응답 검증
 * (제공처 일치·상태 ready/partial·이미지 보유)은 공통 큐레이션과 같은 기준이다.
 */
function usePolyHavenCategories(): Record<PolyHavenKind, CategoryState> {
  const [states, setStates] = useState<Record<PolyHavenKind, CategoryState>>(LOADING_STATES);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort("timeout"), 30000);
    let disposed = false;
    for (const category of POLYHAVEN_CATEGORIES) {
      const search = new URLSearchParams({ provider: "polyhaven", q: category.query, page: "1" });
      void apiFetch(apiPath(`/api/creator-resources/search?${search}`), { signal: controller.signal, headers: { Accept: "application/json" } })
        .then(async (response) => {
          if (!response.ok) throw new Error("category_unavailable");
          const parsed = parseSearchResult(await response.json());
          if (!parsed || parsed.provider !== "polyhaven" || (parsed.status !== "ready" && parsed.status !== "partial")) throw new Error("category_unavailable");
          const items = parsed.items
            .filter((item) => item.imageUrl && polyHavenKindOf(item) === category.kind)
            .slice(0, POLYHAVEN_CATEGORY_TILE_COUNT);
          if (!disposed) {
            setStates((previous) => ({
              ...previous,
              [category.kind]: items.length >= POLYHAVEN_CATEGORY_TILE_COUNT
                ? { phase: "ready", items }
                : { phase: "unavailable" },
            }));
          }
        })
        .catch(() => {
          if (!disposed) setStates((previous) => ({ ...previous, [category.kind]: { phase: "unavailable" } }));
        });
    }
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, []);
  return states;
}

function CategoryTile({ item, category, onRunSearch }: { item: CreatorResource; category: PolyHavenCategory; onRunSearch: (q: string) => void }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(item.imageUrl) && !imageFailed;
  return (
    <button type="button" onClick={() => onRunSearch(category.query)} aria-label={`${item.title} — '${category.query}' 검색 결과 보기`}
      className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-line bg-panel text-left transition hover:border-accent/50">
      <span className={`relative block w-full overflow-hidden bg-raised ${category.kind === "hdri" ? "aspect-[2/1]" : "aspect-[4/3]"}`}>
        {showImage ? <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
          : <TypographicCover title={item.title} seed={item.id} className="absolute inset-0" />}
        <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{POLYHAVEN_KIND_LABELS[category.kind]}</span>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end gap-1.5 bg-gradient-to-t from-black/55 via-black/25 to-transparent p-3 pt-8">
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">{RESOURCE_LABELS.polyhaven}</span>
          <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-sm">{resourceUsageLabel(item)}</span>
        </span>
      </span>
      <span className="flex flex-1 flex-col gap-1 p-4">
        <span className="break-words text-sm font-bold leading-5">{item.title}</span>
        <span className="break-words text-xs text-fg-2">{item.creator || "저작자·기관 원문 확인"}{item.dateLabel ? ` · ${item.dateLabel}` : ""}</span>
      </span>
    </button>
  );
}

function CategoryRowSkeleton({ category }: { category: PolyHavenCategory }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-hidden="true">
      {Array.from({ length: POLYHAVEN_CATEGORY_TILE_COUNT }, (_, index) => (
        <div key={index} className="overflow-hidden rounded-2xl border border-line bg-panel">
          <div className={`w-full animate-pulse bg-raised [motion-reduce:animate-none] ${category.kind === "hdri" ? "aspect-[2/1]" : "aspect-[4/3]"}`} />
          <div className="space-y-2 p-4">
            <div className="h-4 w-3/4 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-raised [motion-reduce:animate-none]" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function PolyHavenCategoryGuide({ onRunSearch }: { onRunSearch: (q: string) => void }) {
  const states = usePolyHavenCategories();
  const settled = POLYHAVEN_CATEGORIES.every((category) => states[category.kind].phase !== "loading");
  const readyCount = POLYHAVEN_CATEGORIES.filter((category) => states[category.kind].phase === "ready").length;
  if (settled && readyCount === 0) {
    return <ResourcePreSearchFallback provider="polyhaven" onRunSearch={onRunSearch} apiNote={false} />;
  }
  return (
    <div className="space-y-6 py-2 text-left">
      <div>
        <h3 className="text-base font-bold">검색 전에 둘러보기</h3>
        <p className="mt-1 text-sm leading-6 text-fg-2">종류별로 많이 내려받은 실제 자료입니다. 타일을 누르면 같은 종류 검색을 바로 실행합니다.</p>
      </div>
      {POLYHAVEN_CATEGORIES.map((category) => {
        const state = states[category.kind];
        if (state.phase === "unavailable") return null;
        return (
          <section key={category.kind} aria-label={`${POLYHAVEN_KIND_LABELS[category.kind]} 대표 자료`}>
            <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h4 className="text-sm font-bold">{POLYHAVEN_KIND_LABELS[category.kind]}</h4>
              <p className="text-xs text-fg-2">{category.blurb}</p>
            </div>
            {state.phase === "loading"
              ? <CategoryRowSkeleton category={category} />
              : (
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                  {state.items.map((item) => <CategoryTile key={item.id} item={item} category={category} onRunSearch={onRunSearch} />)}
                </div>
              )}
          </section>
        );
      })}
    </div>
  );
}
