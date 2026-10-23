import { ArrowRight, Cpu, Library, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

import Link from "@/shared/navigation/router-link";

import {
  BRUSH_QUALITY_CATALOG,
  brushQualityCatalogGroups,
} from "./brush-studio-v5-quality-catalog";
import { BRUSH_STUDIO_V6_RECIPES } from "./brush-studio-v6-engine";
import { resolveProductBrushV6RecipeId } from "./brush-studio-version-integration";

const INTERNALIZED_ENGINE_BADGES = [
  {
    title: "2차계 G펜·마루펜 닙 물리",
    detail: "필압·속도에 따른 펜촉 갈라짐과 날카로운 끝 테이퍼",
  },
  {
    title: "Kubelka-Munk 분광 안료 혼색",
    detail: "파란색+노란색이 회색이 아닌 자연스러운 녹색으로 섞이는 감산 혼색",
  },
  {
    title: "Krita·Libmypaint 다이내믹",
    detail: "기울기·속도·슬로 트래킹 및 캔버스 하부 안료 스머지 반응",
  },
  {
    title: "캘리그라피 리본 & 모서리 보존",
    detail: "급격한 방향 전환에서도 뭉개지지 않는 선화·리본 외곽선",
  },
] as const;

function editorHref(
  baseHref: string,
  productBrushId: string,
  recipeId: string,
): string {
  const separator = baseHref.includes("?") ? "&" : "?";
  const params = new URLSearchParams({
    applyRecipe: "1",
    productBrush: productBrushId,
    recipe: recipeId,
  });
  params.sort();
  return `${baseHref}${separator}${params.toString()}`;
}

function pickerHref(productBrushId: string): string {
  return `/studio/assets/brushes?selected=${encodeURIComponent(productBrushId)}`;
}

/** Shows the single curated product catalogue shared by the picker and Brush Editor. */
export function StudioBrushProductCataloguePanel({
  baseHref,
}: {
  readonly baseHref: string;
}) {
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("all");
  const groups = useMemo(() => brushQualityCatalogGroups(), []);
  const recipeNames = useMemo(
    () =>
      new Map(
        BRUSH_STUDIO_V6_RECIPES.map((recipe) => [recipe.id, recipe.label]),
      ),
    [],
  );
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ko-KR");
    return BRUSH_QUALITY_CATALOG.filter((entry) => {
      if (selectedGroup === "essential" && !entry.quick) return false;
      if (
        selectedGroup !== "all" &&
        selectedGroup !== "essential" &&
        entry.group !== selectedGroup
      ) {
        return false;
      }
      if (!normalized) return true;
      return `${entry.name} ${entry.id} ${entry.group} ${entry.signature} ${entry.engine}`
        .toLocaleLowerCase("ko-KR")
        .includes(normalized);
    });
  }, [query, selectedGroup]);

  return (
    <section className="rounded-3xl border border-line bg-card/35 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
            <Library size={15} aria-hidden="true" /> STARTING BRUSHES
          </p>
          <h2 className="mt-1 text-sm font-black text-fg">시작 브러시 48종</h2>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-fg-3">
            실제 렌더 결과·손맛·재질이 구분되는 대표만 남겼습니다. 비슷한 구현 변형과 이전
            설계명은 별도 브러시로 노출하지 않으며, 브러시 선택과 전체 편집이 같은 목록·엔진 설명·특성 정보를
            사용합니다.
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-line bg-card px-4 py-2 text-sm font-bold text-fg hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
        >
          {open ? "시작 브러시 숨기기" : "48종 보기"}
        </button>
      </div>

      <div
        data-testid="brush-catalogue-engine-summary"
        className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="내재화 브러시 엔진 핵심 기술"
      >
        {INTERNALIZED_ENGINE_BADGES.map((item) => (
          <div
            key={item.title}
            className="rounded-2xl border border-line bg-panel/45 px-3 py-2.5"
          >
            <p className="flex items-center gap-1.5 text-xs font-extrabold text-fg">
              <Cpu size={13} className="shrink-0 text-accent" aria-hidden="true" />
              {item.title}
            </p>
            <p className="mt-1 text-[0.68rem] leading-4 text-fg-3">{item.detail}</p>
          </div>
        ))}
      </div>

      {open ? (
        <div className="mt-5">
          <div
            role="group"
            aria-label="브러시 용도별 빠른 필터"
            className="mb-3 flex flex-wrap gap-1.5"
          >
            <button
              type="button"
              aria-pressed={selectedGroup === "all"}
              onClick={() => setSelectedGroup("all")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                selectedGroup === "all"
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised"
              }`}
            >
              전체 ({BRUSH_QUALITY_CATALOG.length})
            </button>
            <button
              type="button"
              aria-pressed={selectedGroup === "essential"}
              onClick={() => setSelectedGroup("essential")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                selectedGroup === "essential"
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised"
              }`}
            >
              <Sparkles size={12} aria-hidden="true" />
              입문자 필수 추천 ({BRUSH_QUALITY_CATALOG.filter((b) => b.quick).length})
            </button>
            {groups.map((group) => (
              <button
                key={group}
                type="button"
                aria-pressed={selectedGroup === group}
                onClick={() => setSelectedGroup(group)}
                className={`inline-flex min-h-9 items-center rounded-full border px-3 py-1 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
                  selectedGroup === group
                    ? "border-accent/60 bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised"
                }`}
              >
                {group}
              </button>
            ))}
          </div>

          <label className="relative block max-w-xl">
            <span className="sr-only">제품 브러시 검색</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-3"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="이름·재질·엔진·그룹 검색"
              className="min-h-11 w-full rounded-xl border border-line bg-panel pl-10 pr-3 text-sm text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            />
          </label>
          <p className="mt-2 text-xs text-fg-3">
            {filtered.length} / {BRUSH_QUALITY_CATALOG.length}종
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((entry) => {
              const recipeId = resolveProductBrushV6RecipeId(entry);
              const href = recipeId
                ? editorHref(baseHref, entry.id, recipeId)
                : pickerHref(entry.id);
              return (
                <Link
                  key={entry.id}
                  href={href}
                  data-studio-brush-product-target={entry.id}
                  className="group rounded-2xl border border-line bg-panel/55 p-3.5 transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span>
                      <strong className="block text-sm text-fg">{entry.name}</strong>
                      <span className="mt-1 block text-[0.68rem] font-semibold text-accent">
                        {entry.group}
                      </span>
                    </span>
                    <span className="rounded-full border border-line px-2 py-1 text-[0.62rem] font-bold text-fg-3">
                      {entry.quick ? "기본" : "전문"}
                    </span>
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-fg-3">
                    {entry.signature}
                  </span>
                  <span className="mt-2 block rounded-lg border border-line bg-card/70 px-2.5 py-1.5 text-[0.68rem] font-semibold text-fg-2">
                    {entry.engine}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                    {recipeId
                      ? `${recipeNames.get(recipeId) ?? recipeId} 기반으로 시작`
                      : "브러시 선택에서 사용하기"}
                    <ArrowRight
                      size={13}
                      className="transition-transform group-hover:translate-x-1"
                      aria-hidden="true"
                    />
                  </span>
                </Link>
              );
            })}
          </div>
          {filtered.length === 0 ? (
            <p
              className="mt-4 rounded-xl border border-line bg-panel/55 px-3 py-5 text-center text-sm text-fg-3"
              role="status"
            >
              일치하는 제품 브러시가 없습니다.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
