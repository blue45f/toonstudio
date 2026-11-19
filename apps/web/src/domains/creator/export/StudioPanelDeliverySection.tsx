import { useEffect, useMemo, useRef, useState } from "react";

import { downloadBlob, safeExportBaseName } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { listDeliveryPanels, panelScriptText, renderPanelDelivery, type PanelDeliveryFormat, type PanelPage } from "./studio-panel-delivery";
import { StudioExportSection } from "./StudioExportSection";
import type { StudioExportMenuPackageContext } from "./StudioExportMenuPanel";
import type { WatermarkSettings } from "../studio-watermark";

interface Props {
  context: StudioExportMenuPackageContext;
  pages?: readonly PanelPage[] | null;
  title: string;
  width: number;
  watermark: WatermarkSettings;
  transparent: boolean;
  onBusyChange: (busy: boolean) => void;
}

const actions = { text: "panelText", squares: "panelSquares", sheet: "panelSheet" } as const;
const formats: PanelDeliveryFormat[] = ["text", "squares", "sheet"];

export function StudioPanelDeliverySection({ context, pages, width, title, watermark, transparent, onBusyChange }: Props) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error?: boolean } | null>(null);
  const [working, setWorking] = useState(false);
  const active = useRef<AbortController | null>(null);
  const selected = context.pageIndices.join(",");
  const scope = useMemo(() => selected ? selected.split(",").map(Number) : [], [selected]);
  const plan = useMemo(() => open && pages && scope.every(i => pages[i])
    ? listDeliveryPanels(pages, scope) : null, [open, pages, scope]);
  const hasScript = Boolean(plan?.outside.length || plan?.panels.some(panel => panel.action || panel.lines.length));
  useEffect(() => {
    setNotice(null);
    return () => { active.current?.abort(); };
  }, [pages, selected]);
  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
    onBusyChange(false);
  }, [onBusyChange]);

  const run = async (format: PanelDeliveryFormat) => {
    if (active.current || context.busy || !context.canExport || !plan?.panels.length || (format === "text" && !hasScript)) return;
    const request = new AbortController();
    active.current = request;
    const stop = () => request.abort();
    const sharedSignal = context.cancelSignal;
    sharedSignal?.addEventListener("abort", stop, { once: true });
    let owned: HTMLCanvasElement[] = [];
    setWorking(true);
    onBusyChange(true);
    try {
      if (sharedSignal?.aborted) request.abort();
      request.signal.throwIfAborted();
      const stem = safeExportBaseName(title);
      if (format === "text") {
        const script = panelScriptText(title, plan);
        downloadBlob(new Blob(["\uFEFF", script], { type: "text/plain;charset=utf-8" }), stem + "-storyboard.txt");
      } else {
        setNotice({ message: exportMenuText("panelPreparing") });
        const captured = await context.capturePages();
        owned = captured.pages;
        request.signal.throwIfAborted();
        if (captured.indices.join(",") !== selected || captured.indices.length !== owned.length) {
          throw new Error(exportMenuText("panelRangeChanged"));
        }
        const result = await renderPanelDelivery({
          format, plan, canvasWidth: width, captures: new Map(captured.indices.map((idx, i) => [idx, owned[i]])),
          watermark, transparent, signal: request.signal,
          onProgress: (done, total) => setNotice({ message: exportMenuText("panelProgress", { done, total }) }),
        });
        request.signal.throwIfAborted();
        downloadBlob(result.blob, stem + (format === "sheet" ? "-four-up." : "-panels.") + result.extension);
      }
      setNotice({ message: exportMenuText("panelSaved", { count: plan.panels.length }) });
    } catch (error) {
      if (active.current === request) setNotice(request.signal.aborted
        ? { message: exportMenuText("panelCancelled") }
        : { error: true, message: error instanceof Error ? error.message : exportMenuText("panelCanvasFailed") });
    } finally {
      for (const image of owned) image.width = image.height = 1;
      sharedSignal?.removeEventListener("abort", stop);
      if (active.current === request) {
        active.current = null;
        setWorking(false);
        onBusyChange(false);
      }
    }
  };

  return (
      <StudioExportSection id="panel-delivery" title={exportMenuText("panelTitle")} description={exportMenuText("panelHelp")} onOpenChange={setOpen}>
        <p className="mb-2 text-xs text-fg-2">
          {plan?.panels.length ? exportMenuText("panelCount", { count: plan.panels.length, range: context.rangeLabel }) : exportMenuText("panelEmpty")}
        </p>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {formats.map(format => (
            <button key={format} type="button" disabled={context.busy || working || !context.canExport || !plan?.panels.length || (format === "text" && !hasScript)}
              className="min-h-11 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-fg hover:bg-card focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              onClick={() => void run(format)}>{exportMenuText(actions[format])}</button>
          ))}
        </div>
        {plan && !hasScript && <p className="mt-2 text-xs text-fg-2">{exportMenuText("panelNoScript")}</p>}
        {working && <button className="mt-1 min-h-11 px-2 text-xs underline" type="button" onClick={() => active.current?.abort()}>{exportMenuText("panelStop")}</button>}
        {notice && <p role={notice.error ? "alert" : "status"} className="mt-2 text-xs text-fg">{notice.message}</p>}
      </StudioExportSection>
  );
}
