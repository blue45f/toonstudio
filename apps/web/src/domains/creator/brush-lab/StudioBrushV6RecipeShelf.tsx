import { Suspense, useId, useState } from "react";
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { useT } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";

import "../studio-brush-canvas-status-i18n";
import { BRUSH_STUDIO_V6_RECIPES } from "./brush-studio-v6-engine";
import { BRUSH_STUDIO_V6_RECIPE_GROUPS, searchBrushStudioV6Recipes } from "./brush-studio-v6-recipe-search";

const LazyStudioCspFullBrushAtelierPanel = lazyRetry(
  () =>
    import("../csp-brush-atelier/StudioCspFullBrushAtelierPanel").then((module) => ({
      default: module.StudioCspFullBrushAtelierPanel,
    })),
  "StudioCspFullBrushAtelierPanel",
);

const FIELD = `min-h-11 rounded-xl border border-line bg-card px-3 text-sm text-fg ${STUDIO_FOCUS_RING}`;
interface Props { readonly selectedId: string; readonly onChoose: (id: string) => void; }

export function StudioBrushV6RecipeShelf({ selectedId, onChoose }: Props) {
  const t = useT();
  const id = useId();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("all");
  const [cspAtelierOpen, setCspAtelierOpen] = useState(false);
  const recipes = searchBrushStudioV6Recipes(query, group);
  const reset = () => { setQuery(""); setGroup("all"); };
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
      <label htmlFor={`${id}-search`} className="text-xs font-bold text-fg-2">브러시 레시피 검색
        <input id={`${id}-search`} type="search" maxLength={160} value={query}
          placeholder="이름·용도·영문 ID 검색" onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => { if (event.key === "Escape") setQuery(""); }} className={`${FIELD} mt-1.5 w-full`} />
      </label>
      <label htmlFor={`${id}-group`} className="text-xs font-bold text-fg-2">브러시 용도
        <select id={`${id}-group`} value={group} onChange={(event) => setGroup(event.currentTarget.value)} className={`${FIELD} mt-1.5 w-full`}>
          <option value="all">전체 용도</option>
          {BRUSH_STUDIO_V6_RECIPE_GROUPS.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
      </label>
    </div>
    <p role="status" aria-live="polite" className="text-xs text-fg-3">{recipes.length} / {BRUSH_STUDIO_V6_RECIPES.length}개 레시피</p>
    {!recipes.length ? <div className="rounded-xl border border-line bg-bg-2/55 p-4">
      <p className="text-sm text-fg-2">{t("studio.brushCanvasStatus.brushLab.v6SearchEmpty", "검색 결과가 없습니다. 다른 이름이나 용도로 검색해 주세요.")}</p>
      <button type="button" onClick={reset} className={`${FIELD} mt-3 font-bold`}>검색·필터 초기화</button>
    </div> : null}
    {BRUSH_STUDIO_V6_RECIPE_GROUPS.map((name) => {
      const entries = recipes.filter((recipe) => recipe.group === name);
      if (!entries.length) return null;
      return <section key={name} aria-label={`${name} 레시피`}>
        <h3 className="mb-2 text-xs font-black text-fg-2">{name} · {entries.length}</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{entries.map((recipe) =>
          <button key={recipe.id} type="button" aria-pressed={selectedId === recipe.id} onClick={() => onChoose(recipe.id)}
            className={`min-h-[108px] rounded-xl border p-3 text-left hover:border-accent/50 hover:bg-accent/10 ${selectedId === recipe.id ? "border-accent/60 bg-accent/10" : "border-line bg-bg-2/55"} ${STUDIO_FOCUS_RING}`}>
            <span className="text-sm font-black text-fg">{recipe.label}</span>
            <span className="mt-2 block text-xs leading-relaxed text-fg-3">{recipe.description}</span>
          </button>)}
        </div>
      </section>;
    })}
    <div className="border-t border-line pt-4">
      <details
        data-testid="studio-csp-full-brush-atelier-disclosure"
        className="group/csp-atelier rounded-2xl border border-line bg-panel/65"
        onToggle={(event) => setCspAtelierOpen(event.currentTarget.open)}
      >
        <summary
          className={`flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 text-sm font-bold text-fg [&::-webkit-details-marker]:hidden ${STUDIO_FOCUS_RING}`}
        >
          <span className="min-w-0 [word-break:keep-all]">
            클립스튜디오 9대 카테고리 36종 풀 브러시 아틀리에 · 최고 수준 질감 엔진
          </span>
          <span
            aria-hidden="true"
            className="shrink-0 text-xs font-semibold text-fg-3 transition-transform group-open/csp-atelier:rotate-180 motion-reduce:transition-none"
          >
            ▾
          </span>
        </summary>
        {cspAtelierOpen ? (
          <div className="border-t border-line p-3 sm:p-4">
            <Suspense
              fallback={
                <div
                  role="status"
                  className="rounded-xl border border-line bg-card px-4 py-3 text-xs text-fg-2"
                >
                  {t("studio.brushCanvasStatus.brushLab.connecting", "브러시 프로그램 연결 중")}
                </div>
              }
            >
              <LazyStudioCspFullBrushAtelierPanel />
            </Suspense>
          </div>
        ) : null}
      </details>
    </div>
  </div>;
}
