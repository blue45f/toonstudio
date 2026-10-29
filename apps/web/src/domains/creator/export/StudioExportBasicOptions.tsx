import { Copy, Download, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "@/shared/lib/cx";
import { WATERMARK_POSITIONS, type WatermarkSettings } from "../studio-watermark";
import { frozenStatusText } from "../studio-frozen-status-i18n";
import { EXPORT_FORMATS, EXPORT_SCALES, canCopyImageToClipboard, exportFormatLabel } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { StudioExportSection } from "./StudioExportSection";
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
  return (
    <section aria-labelledby="studio-export-basic-title">
      <h2 id="studio-export-basic-title" className="text-sm font-bold text-fg">{exportMenuText("title")}</h2>
      <p className="mt-1 text-xs leading-relaxed text-fg-2">{exportMenuText("help")}</p>
      <fieldset className="mt-3">
        <legend className="mb-1 text-xs font-semibold text-fg-2">{exportMenuText("format")}</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() => setExportFormat(format)}
              aria-pressed={exportFormat === format}
              className={cx(
                "min-h-11 rounded-lg border px-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                exportFormat === format ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              {exportFormatLabel(format)}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mt-2.5">
        <legend className="mb-1 text-xs font-semibold text-fg-2">{exportMenuText("scale")}</legend>
        <div className="flex items-center gap-1.5">
          {EXPORT_SCALES.map((scale) => (
            <button
              key={scale}
              type="button"
              onClick={() => { setExportScale(scale); setExportPresetId(null); }}
              aria-pressed={exportScale === scale}
              className={cx(
                "min-h-11 min-w-11 rounded-lg border px-2.5 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                exportScale === scale ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              {scale}×
            </button>
          ))}
          <span className="ml-auto text-right text-[0.68rem] tabular-nums text-fg-2" aria-live="polite">
            {Math.round(canvasWidth * exportScale)} × {Math.round(canvasHeight * exportScale)} px
          </span>
        </div>
      </fieldset>
      {onDownloadCurrentPage ? (
        <button
          type="button"
          onClick={onDownloadCurrentPage}
          disabled={busy}
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 text-xs font-bold text-on-accent shadow-sm transition hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isExporting ? <Loader2 size={15} aria-hidden className="animate-spin motion-reduce:animate-none" /> : <Download size={15} aria-hidden />}
          {isExporting ? exportMenuText("currentBusy") : exportMenuText("currentDownload", { format: exportFormatLabel(exportFormat) })}
        </button>
      ) : null}
      {children}
      <StudioExportSection id="appearance" title={exportMenuText("appearance")} description={exportMenuText("appearanceHelp")}>
        <label
          className={cx("flex min-h-11 items-center gap-2 text-xs", exportFormat === "jpg" ? "cursor-not-allowed text-fg-3 opacity-50" : "cursor-pointer text-fg-2")}
          title={exportFormat === "jpg" ? frozenStatusText("studio.frozenStatus.export.jpgNoTransparency", "JPG는 투명도를 지원하지 않아요") : exportMenuText("transparentHelp")}
        >
          <input type="checkbox" checked={exportTransparent && exportFormat !== "jpg"} disabled={exportFormat === "jpg"} onChange={(event) => setExportTransparent(event.target.checked)} className="size-4 accent-accent" />
          {exportMenuText("transparent")}
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-fg-2">
          <input type="checkbox" checked={watermark.enabled} onChange={(event) => setWatermark({ ...watermark, enabled: event.target.checked })} className="size-4 accent-accent" />
          {exportMenuText("watermark")}
        </label>
        {watermark.enabled ? (
          <div className="mt-1.5 space-y-1.5">
            <input type="text" value={watermark.text} onChange={(event) => setWatermark({ ...watermark, text: event.target.value })} placeholder="© 작가명 / @아이디" maxLength={60} aria-label={exportMenuText("watermarkText")} className="min-h-11 w-full rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent" />
            <div className="flex items-center gap-2">
              <select
                value={watermark.position}
                onChange={(event) => setWatermark({ ...watermark, position: event.target.value as WatermarkSettings["position"] })}
                aria-label={exportMenuText("watermarkPosition")}
                className="min-h-11 flex-1 rounded-lg border border-line bg-card px-2 text-xs text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {WATERMARK_POSITIONS.map((position) => <option key={position.id} value={position.id}>{position.label}</option>)}
              </select>
              <input type="range" min={0.15} max={1} step={0.05} value={watermark.opacity} onChange={(event) => setWatermark({ ...watermark, opacity: Number(event.target.value) })} aria-label={exportMenuText("watermarkOpacity")} className="h-11 w-20 accent-accent" />
            </div>
          </div>
        ) : null}
      </StudioExportSection>
      {canCopyImageToClipboard() ? (
        <button type="button" onClick={onCopyToClipboard} disabled={busy} title={exportMenuText("clipboardHelp")} className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50">
          <Copy size={14} aria-hidden />{exportMenuText("clipboard")}
        </button>
      ) : null}
    </section>
  );
}
