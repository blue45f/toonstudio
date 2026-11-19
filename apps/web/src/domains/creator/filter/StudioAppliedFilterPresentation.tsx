import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { imageFilterCacheKey } from "../render/studio-konva-filter-fields";
import { ApplyContext, WatchContext, type StudioAppliedFilterIntent, type WatchedFilter } from "./studio-applied-filter-context";
import type { El, ImageEl } from "../studio-element-model";

export function StudioAppliedFilterPresentation({ scope, selected, children }: {
  scope: string; selected: El | undefined; children: ReactNode;
}) {
  const bt = useBilingual("studio.drawingClarity");
  const [intent, setIntent] = useState<StudioAppliedFilterIntent | null>(null);
  const [pending, setPending] = useState<{ intent: StudioAppliedFilterIntent } | null>(null);
  const apply = useCallback((image: ImageEl) => setIntent({
    scope, elementId: image.id, src: image.src, program: imageFilterCacheKey(image), mask: image.filterMaskSrc,
  }), [scope]);
  const current = intent?.scope === scope && selected?.type === "image" && selected.id === intent.elementId
    && selected.src === intent.src && selected.filterMaskSrc === intent.mask && imageFilterCacheKey(selected) === intent.program
    ? intent : null;
  const watching = useMemo<WatchedFilter | null>(() => current && ({
    intent: current,
    start() {
      const lease = { intent: current };
      setPending(lease);
      return () => setPending(previous => previous === lease ? null : previous);
    },
  }), [current]);
  return <ApplyContext.Provider value={apply}><WatchContext.Provider value={watching}>
    {children}
    {pending && pending.intent === current ? (
      <div className="studio-drawing-filter-progress pointer-events-none" data-studio-filter-rendering="true">
        <span role="status">{bt("캔버스에 필터를 반영하는 중…", "Rendering the filter on the canvas…")}</span>
        <span role="progressbar" aria-label={bt("필터 렌더링", "Filter rendering")} aria-busy="true"
          className="inline-block size-4 shrink-0 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
      </div>
    ) : null}
  </WatchContext.Provider></ApplyContext.Provider>;
}
