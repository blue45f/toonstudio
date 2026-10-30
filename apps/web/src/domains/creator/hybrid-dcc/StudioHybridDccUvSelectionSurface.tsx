import { useId, useMemo, useRef, useState } from "react";

import { formatI18nTemplate, useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import { studioUvClientPoint, studioUvHitTest, studioUvPolygonPath, studioUvViewBox } from "./studio-hybrid-dcc-uv-editor-session";

import type { StudioHybridDccUvEditorState } from "./useStudioHybridDccUvEditor";

const BUTTON = "min-h-11 min-w-11 rounded-lg border border-line bg-card px-3 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-40";
const PAGE_SIZE = 32;

/** 경로는 합쳐 DOM 수를 제한하고, 겹치거나 접힌 코너는 페이지 목록으로도 각각 선택한다. */
export function StudioHybridDccUvSelectionSurface({ model }: { readonly model: StudioHybridDccUvEditorState }) {
  const bt = useBilingual("StudioHybridDccUvEditor");
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ readonly pointerId: number; readonly u: number; readonly v: number; readonly offsetU: number; readonly offsetV: number } | null>(null);
  const [page, setPage] = useState(0);
  const [view, setView] = useState(() => studioUvViewBox(model.sourceModel?.corners ?? []));
  const display = model.displayModel;
  const source = model.sourceModel;
  const selectedIslands = useMemo(() => new Set(model.islandIds), [model.islandIds]);
  const paths = useMemo(() => display ? {
    all: studioUvPolygonPath(display), selected: studioUvPolygonPath(display, selectedIslands),
  } : { all: "", selected: "" }, [display, selectedIslands]);
  if (!source || !display) return null;
  const count = model.selectionMode === "island" ? display.islands.length : display.corners.length;
  const maxPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
  const currentPage = Math.min(page, maxPage);
  const radius = view.size * 0.008;
  const marks = (selected: boolean) => display.corners.filter(({ halfEdgeId }) => !selected || model.selectedCorners.has(halfEdgeId))
    .map(({ u, v }) => `M${u - radius} ${-v - radius}h${2 * radius}v${2 * radius}h${-2 * radius}Z`).join("");
  const point = (x: number, y: number) => svgRef.current ? studioUvClientPoint(view, svgRef.current.getBoundingClientRect(), x, y) : null;
  const release = (pointerId: number) => {
    drag.current = null;
    if (svgRef.current?.hasPointerCapture?.(pointerId)) svgRef.current.releasePointerCapture(pointerId);
  };
  return <div className="min-w-0 space-y-2" data-studio-hybrid-dcc-uv-selection="true">
    <div className="flex flex-wrap gap-2">
      <fieldset disabled={model.locked} className="flex flex-wrap gap-1">
        <legend className="sr-only">{bt("UV 선택 방식", "UV selection mode")}</legend>
        {(["island", "corner"] as const).map((mode) => <button key={mode} type="button" aria-pressed={model.selectionMode === mode} className={`${BUTTON} ${model.selectionMode === mode ? "border-accent/70 bg-accent-soft text-accent" : ""}`} onClick={() => { model.setSelectionMode(mode); setPage(0); }}>{mode === "island" ? bt("아일랜드", "Islands") : bt("코너", "Corners")}</button>)}
      </fieldset>
      <button type="button" className={BUTTON} onClick={() => setView(studioUvViewBox(display.corners))}>{bt("전체 UV 맞춤", "Fit all UVs")}</button>
    </div>
    <p id={`${id}-hint`} className="text-xs leading-relaxed text-fg-2">{bt("화면이나 목록에서 선택하세요. Shift로 선택을 더하거나 빼고, 선택한 UV를 끌면 이동을 미리봅니다. U는 오른쪽, V는 위쪽입니다.", "Select in the view or list. Shift adds or removes a selection; drag selected UVs to preview a move. U points right and V points up.")}</p>
    <svg ref={svgRef} role="img" aria-label={bt("UV 아일랜드와 코너 편집 화면", "UV island and corner editing view")} aria-describedby={`${id}-hint`}
      viewBox={`${view.x} ${view.y} ${view.size} ${view.size}`} preserveAspectRatio="xMidYMid meet"
      className={`aspect-square w-full touch-none rounded-lg border border-line bg-canvas text-fg-3 ${model.locked ? "opacity-60" : "cursor-crosshair"}`}
      data-studio-hybrid-dcc-uv-surface="true" data-uv-hash={display.uvHash} data-source-hash={source.sourceHash}
      onPointerDown={(event) => {
        if (model.locked || event.button !== 0) return;
        const uv = point(event.clientX, event.clientY); const svg = svgRef.current;
        if (!uv || !svg) return;
        const size = Math.min(svg.getBoundingClientRect().width, svg.getBoundingClientRect().height);
        const hit = studioUvHitTest(display, model.selectionMode, uv.u, uv.v, view.size * 12 / size);
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        if (hit === null) { if (!additive) model.clearSelection(); return; }
        const alreadySelected = model.selectionMode === "island" ? model.islandIds.includes(hit) : model.selectedCorners.has(hit);
        if (!alreadySelected || additive) model.select(hit, additive);
        else {
          const moving = model.dirty && model.kind === "translate";
          drag.current = { pointerId: event.pointerId, u: uv.u, v: uv.v, offsetU: moving ? Number(model.fields.u) || 0 : 0, offsetV: moving ? Number(model.fields.v) || 0 : 0 };
          event.currentTarget.setPointerCapture?.(event.pointerId); event.preventDefault();
        }
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId || model.locked) return;
        const uv = point(event.clientX, event.clientY);
        if (uv) model.dragTranslate(start.offsetU + uv.u - start.u, start.offsetV + uv.v - start.v);
      }}
      onPointerUp={(event) => release(event.pointerId)} onPointerCancel={(event) => { release(event.pointerId); model.cancel(); }} onLostPointerCapture={() => { drag.current = null; }}>
      <defs><pattern id={`${id}-checker`} width="0.125" height="0.125" patternUnits="userSpaceOnUse"><rect width="0.125" height="0.125" fill="currentColor" fillOpacity="0.04" /><path d="M0 0h.0625v.0625H0ZM.0625 .0625h.0625v.0625H.0625Z" fill="currentColor" fillOpacity="0.14" /></pattern></defs>
      <rect x="0" y="-1" width="1" height="1" fill={`url(#${id}-checker)`} stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={paths.all} fill="currentColor" fillOpacity="0.06" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={paths.selected} className="text-accent" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
      {model.selectionMode === "corner" ? <path d={marks(false)} fill="currentColor" fillOpacity="0.7" /> : null}
      <path d={marks(true)} className="text-accent" fill="currentColor" />
    </svg>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={BUTTON} disabled={model.locked} onClick={model.selectAll}>{bt("UV 전체 선택", "Select all UVs")}</button>
      <button type="button" className={BUTTON} disabled={model.locked || !model.selectedCount} onClick={model.clearSelection}>{bt("UV 선택 해제", "Clear UV selection")}</button>
    </div>
    <details className="rounded-lg border border-line bg-canvas/30 p-2" open={model.selectionMode === "island"}>
      <summary className="cursor-pointer text-xs text-fg-2">{model.selectionMode === "island" ? bt("UV 아일랜드 목록", "UV island list") : bt("UV 코너 목록 · 겹친 코너 개별 선택", "UV corner list · select overlapping corners separately")}</summary>
      <fieldset disabled={model.locked} className="mt-2 grid max-h-48 grid-cols-1 gap-1 overflow-y-auto sm:grid-cols-2">
        <legend className="sr-only">{bt("UV 목록에서 선택", "Select UVs from the list")}</legend>
        {model.selectionMode === "island" ? display.islands.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((island) => <label key={island.id} className="flex min-h-11 min-w-0 items-center gap-2 rounded px-2 text-xs text-fg-2"><input type="checkbox" checked={selectedIslands.has(island.id)} onChange={() => model.select(island.id, true)} /><span>{formatI18nTemplate(bt("아일랜드 {id} · 면 {count}개", "Island {id} · {count} faces"), { id: island.id + 1, count: island.faceIds.length })}</span></label>)
          : display.corners.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE).map((corner) => <label key={corner.halfEdgeId} className="flex min-h-11 min-w-0 items-center gap-2 rounded px-2 text-xs text-fg-2"><input type="checkbox" checked={model.cornerIds.includes(corner.halfEdgeId)} onChange={() => model.select(corner.halfEdgeId, true)} /><span className="min-w-0 break-words tabular-nums">{formatI18nTemplate(bt("코너 {id} · U {u} V {v}", "Corner {id} · U {u} V {v}"), { id: corner.halfEdgeId + 1, u: Number(corner.u.toPrecision(5)), v: Number(corner.v.toPrecision(5)) })}</span></label>)}
      </fieldset>
      {maxPage > 0 ? <div className="mt-2 flex items-center gap-2"><button type="button" className={BUTTON} disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>{bt("이전", "Previous")}</button><span className="text-xs text-fg-2">{currentPage + 1} / {maxPage + 1}</span><button type="button" className={BUTTON} disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}>{bt("다음", "Next")}</button></div> : null}
    </details>
  </div>;
}
