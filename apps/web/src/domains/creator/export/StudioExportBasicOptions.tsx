import { Copy, Download, Loader2 } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";

import { cx } from "@/shared/lib/cx";
import { EXPORT_FORMATS, EXPORT_SCALES, canCopyImageToClipboard, exportFormatLabel } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { StudioExportOutputSummary } from "./StudioExportOutputSummary";
import { StudioExportAppearanceOptions } from "./StudioExportAppearanceOptions";
import type { StudioExportMenuPanelProps } from "./StudioExportMenuPanel";

type StudioExportBasicOptionsProps = Pick<StudioExportMenuPanelProps,
  "canvasWidth" | "canvasHeight" | "exportScale" | "exportFormat" | "exportTransparent" |
  "watermark" | "isExporting" | "setExportScale" | "setExportFormat" | "setExportTransparent" |
  "setExportPresetId" | "setWatermark" | "onCopyToClipboard" | "onDownloadCurrentPage"
> & { busy: boolean; children?: ReactNode };

export function StudioExportBasicOptions({
  canvasWidth, canvasHeight, exportScale, exportFormat, exportTransparent, watermark,
  isExporting, busy, setExportScale, setExportFormat, setExportTransparent,
  setExportPresetId, setWatermark, onCopyToClipboard, onDownloadCurrentPage, children,
}: StudioExportBasicOptionsProps) {
  const instanceId = useId();
  const summaryId = `${instanceId}-output`;
  const formatHelpId = `${instanceId}-format-help`;
  const busyHelpId = `${instanceId}-busy-help`;
  const transparencyHelpId = `${instanceId}-transparency-help`;
  const signatureHelpId = `${instanceId}-signature-help`;
  const appearanceRef = useRef<HTMLDetailsElement>(null);
  const transparencyRef = useRef<HTMLInputElement>(null);
  const signatureToggleRef = useRef<HTMLInputElement>(null);
  const signatureInputRef = useRef<HTMLInputElement>(null);
  const opacityRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const downloadRef = useRef<HTMLButtonElement>(null);
  const locked = busy || isExporting;
  const formatHelp = exportMenuText(exportFormat === "png" ? "pngHelp" : exportFormat === "jpg" ? "jpgHelp" : "webpHelp");

  const editAppearance = () => {
    if (locked) return;
    if (appearanceRef.current) appearanceRef.current.open = true;
    if (watermark.enabled && watermark.text.trim().length === 0) signatureInputRef.current?.focus();
    else if (watermark.enabled && (!Number.isFinite(watermark.opacity) || watermark.opacity <= 0)) opacityRef.current?.focus();
    else if (exportFormat === "jpg") signatureToggleRef.current?.focus();
    else transparencyRef.current?.focus();
  };
  const returnToDownload = () => {
    const button = downloadRef.current;
    if (button && !button.disabled) button.focus();
    else summaryRef.current?.focus();
  };

  return (
    <section data-studio-export-basic="true" aria-labelledby={`${instanceId}-title`} className="min-w-0">
      <h2 id={`${instanceId}-title`} className="text-sm font-bold text-fg">{exportMenuText("title")}</h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-2">{exportMenuText("help")}</p>
      {locked ? <p id={busyHelpId} aria-live="polite" className="mt-2 text-xs leading-5 text-fg-2">{exportMenuText("settingsBusy")}</p> : null}
      <fieldset className="mt-3 min-w-0" disabled={locked} aria-describedby={locked ? busyHelpId : formatHelpId}>
        <legend className="mb-1 text-xs font-semibold text-fg-2">{exportMenuText("format")}</legend>
        <div className="grid min-w-0 grid-cols-3 gap-1.5">
          {EXPORT_FORMATS.map((format) => (
            <button key={format} type="button" disabled={locked}
              onClick={() => { if (!locked) setExportFormat(format); }}
              aria-pressed={exportFormat === format}
              className={cx(
                "min-h-11 min-w-11 rounded-lg border px-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
                exportFormat === format ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
              )}>{exportFormatLabel(format)}</button>
          ))}
        </div>
        <p id={formatHelpId} className="mt-2 break-words text-xs leading-5 text-fg-2">{formatHelp}</p>
      </fieldset>
      <fieldset className="mt-2.5 min-w-0" disabled={locked} aria-describedby={locked ? busyHelpId : undefined}>
        <legend className="mb-1 text-xs font-semibold text-fg-2">{exportMenuText("scale")}</legend>
        <div className="grid min-w-0 grid-cols-3 gap-1.5">
          {EXPORT_SCALES.map((scale) => (
            <button key={scale} type="button" disabled={locked}
              onClick={() => { if (!locked) { setExportScale(scale); setExportPresetId(null); } }}
              aria-pressed={exportScale === scale}
              className={cx(
                "min-h-11 min-w-11 rounded-lg border px-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50",
                exportScale === scale ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
              )}>{scale}×</button>
          ))}
        </div>
      </fieldset>
      <StudioExportOutputSummary format={exportFormat} width={Math.round(canvasWidth * exportScale)} height={Math.round(canvasHeight * exportScale)}
        transparent={exportTransparent} watermark={watermark} busy={locked} summaryId={summaryId} summaryRef={summaryRef} onEditAppearance={editAppearance} />
      {onDownloadCurrentPage ? (
        <button ref={downloadRef} type="button" onClick={() => { if (!locked) onDownloadCurrentPage(); }}
          disabled={locked} aria-busy={isExporting || undefined} aria-describedby={locked ? busyHelpId : `${summaryId}-values`}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45">
          {isExporting ? <Loader2 size={15} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Download size={15} aria-hidden />}
          {isExporting ? exportMenuText("currentBusy") : exportMenuText("currentDownload", { format: exportFormatLabel(exportFormat) })}
        </button>
      ) : null}
      {/* 취소·진행 동작을 잠그지 않도록 여러 페이지 내보내기는 disabled fieldset 밖에 둔다. */}
      {children}
      <StudioExportAppearanceOptions {...{ exportFormat, exportTransparent, watermark, locked, busyHelpId,
        transparencyHelpId, signatureHelpId, appearanceRef, transparencyRef, signatureToggleRef,
        signatureInputRef, opacityRef, setExportTransparent, setWatermark, returnToDownload }} />
      {canCopyImageToClipboard() ? (
        <>
          <button type="button" onClick={() => { if (!locked) onCopyToClipboard(); }} disabled={locked}
            aria-describedby={`${instanceId}-clipboard-help`}
            className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
            <Copy size={14} aria-hidden />{exportMenuText("clipboard")}
          </button>
          <p id={`${instanceId}-clipboard-help`} className="mt-1 text-xs leading-5 text-fg-2">{exportMenuText("clipboardPngHelp")}</p>
        </>
      ) : null}
    </section>
  );
}
