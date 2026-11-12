import { lazy, Suspense, useEffect, type RefObject } from "react";
import { createPortal } from "react-dom";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { CANVAS_W } from "../studio-assets";
import type { StudioCuttoonEditorViewSession } from "./StudioCuttoonEditorViewSession";

const ExportPanel = lazy(() => import("../export/StudioExportMenuPanel").then((module) => ({ default: module.StudioExportMenuPanel })));

/** 기존 출력 패널에 기존 원고 캡처·내보내기 명령을 그대로 전달한다. */
export function StudioDrawingClarityExport({ session: s, triggerRef }: {
  readonly session: StudioCuttoonEditorViewSession;
  readonly triggerRef: RefObject<HTMLElement | null>;
}) {
  const bt = useBilingual("studio.drawingClarity"), handlers = s.studioMenubarContentHandlers;
  const { setExportMenuOpen } = s;
  useEffect(() => {
    const restore = () => (triggerRef.current ?? document.querySelector<HTMLElement>("[data-studio-clarity-export-trigger]"))?.focus({ preventScroll: true });
    const close = () => { setExportMenuOpen(false); restore(); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-studio-export-menu-panel],[data-studio-clarity-export-trigger]")) return;
      setExportMenuOpen(false);
    };
    const focus = () => {
      const first = document.querySelector<HTMLElement>("[data-studio-export-menu-panel] button,[data-studio-export-menu-panel] input,[data-studio-export-menu-panel] select");
      if (!first) return false;
      first.focus({ preventScroll: true }); return true;
    };
    const observer = focus() ? null : new MutationObserver(() => { if (focus()) observer?.disconnect(); });
    observer?.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("keydown", escape); document.addEventListener("pointerdown", outside);
    return () => { observer?.disconnect(); document.removeEventListener("keydown", escape); document.removeEventListener("pointerdown", outside); };
  }, [setExportMenuOpen, triggerRef]);
  return createPortal(<div role="dialog" aria-modal="false" aria-label={bt("출력 설정", "Export settings")}><Suspense fallback={<div role="status" className="fixed right-3 top-20 z-[100] rounded-xl border border-line bg-panel p-4 text-sm text-fg">{bt("출력 설정을 여는 중…", "Opening export settings…")}</div>}>
    <ExportPanel canvasWidth={CANVAS_W} canvasHeight={s.canvasH} exportScale={s.exportScale}
      exportFormat={s.exportFormat} exportTransparent={s.exportTransparent} exportPresetId={s.exportPresetId}
      watermark={s.watermark} isExporting={s.isExporting} exportTitle={s.title}
      pageCount={s.studioMenubarPageLabels.length} pageLabels={s.studioMenubarPageLabels} dialoguePages={s.pages} sourceWorkId={s.workId}
      capturePagesForPreset={handlers.handleCapturePagesForPreset} capturePagesForIndices={handlers.handleCapturePagesForIndices}
      exportPresetSlicesFromDocument={handlers.handleExportPresetSlices} exportCurrentPageToInkMl={handlers.exportCurrentPageToInkMl}
      exportCurrentPageToWillV1={handlers.exportCurrentPageToWillV1} exportCurrentPageToSvg={handlers.exportCurrentPageToSvg}
      exportCurrentPageToVectorPdf={handlers.exportCurrentPageToVectorPdf} exportCurrentPageToPsd={handlers.exportCurrentPageToPsd}
      exportCurrentPageToRasterInterchange={handlers.exportCurrentPageToRasterInterchange}
      setExportScale={s.setExportScale} setExportFormat={s.setExportFormat} setExportTransparent={s.setExportTransparent}
      setExportPresetId={s.setExportPresetId} setWatermark={handlers.setWatermark}
      onCopyToClipboard={handlers.handleCopyToClipboard} onDownloadCurrentPage={handlers.handleDownload}
      renderPrimaryExport={() => <button type="button" className="studio-drawing-clarity-button w-full" onClick={() => {
        setExportMenuOpen(false); (triggerRef.current ?? document.querySelector<HTMLElement>("[data-studio-clarity-export-trigger]"))?.focus({ preventScroll: true });
      }}>{bt("출력 설정 닫기", "Close export settings")}</button>} />
  </Suspense></div>, document.body);
}
