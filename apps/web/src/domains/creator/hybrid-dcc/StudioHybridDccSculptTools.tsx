import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS } from "./studio-hybrid-dcc-tool-catalog";

import type { StudioHybridDccSculptStrokeModel } from "./useStudioHybridDccSculptStroke";

const BRUSHES = ["grab", "smooth", "inflate", "clay", "crease", "flatten", "scrape", "snakeHook"] as const;
const BUTTON = "min-h-11 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 sm:pointer-fine:min-h-9";

/** 드래그 중 임시 메시와 확정·취소 상태를 원본 편집 이력과 구분해 안내한다. */
export function StudioHybridDccSculptTools({ model, busy }: {
  readonly model: StudioHybridDccSculptStrokeModel;
  readonly busy: boolean;
}) {
  const bt = useBilingual("StudioHybridDccSculptTools");
  return <div className="mt-3 space-y-2" data-studio-hybrid-dcc-sculpt-phase={model.phase}>
    <div role="radiogroup" aria-label={bt("조형 브러시 종류", "Sculpt brush type")}
      className="flex flex-wrap gap-1.5 rounded-xl border border-line/70 bg-canvas/35 p-2">
      {BRUSHES.map((kind) => <button key={kind} type="button" role="radio" aria-checked={model.kind === kind}
        disabled={busy} onClick={() => model.setKind(kind)}
        className={cn(BUTTON, model.kind === kind ? "border-accent bg-accent-soft text-accent" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}>
        {bt(STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[kind][0], STUDIO_HYBRID_DCC_SCULPT_BRUSH_LABELS[kind][1])}
      </button>)}
      <button type="button" aria-pressed={model.carve} disabled={busy} onClick={() => model.setCarve((current) => !current)}
        className={cn(BUTTON, model.carve ? "border-warn bg-warn/10 text-warn" : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg")}>
        {model.carve ? bt("깎기 켜짐", "Carve on") : bt("깎기 꺼짐", "Carve off")}
      </button>
    </div>
    <p className="text-xs text-fg-2">{bt("원본 메시에서 조형합니다. 드래그 한 번을 되돌리기 한 번으로 복원하며 Esc로 취소합니다.", "Sculpt the source mesh. One undo restores a drag; Esc cancels it.")}</p>
    {model.engaged ? <button type="button" onClick={model.cancel} className={cn(BUTTON, "border-line bg-card text-fg-2 hover:bg-raised")}>
      {bt("조형 취소", "Cancel sculpting")}
    </button> : null}
    {model.notice ? <p role="status" className="text-xs text-fg-2">{model.notice}</p> : null}
    {model.error ? <p role="alert" className="text-xs text-warn">{model.error}</p> : null}
  </div>;
}
