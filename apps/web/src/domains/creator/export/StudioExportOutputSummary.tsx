import type { Ref } from "react";

import type { WatermarkSettings } from "../studio-watermark";
import { exportFormatLabel, type ExportFormat } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { studioExportAppearanceSummary } from "./studio-export-summary";

interface StudioExportOutputSummaryProps {
  readonly format: ExportFormat;
  readonly width: number;
  readonly height: number;
  readonly transparent: boolean;
  readonly watermark: WatermarkSettings;
  readonly busy: boolean;
  readonly summaryId: string;
  readonly summaryRef: Ref<HTMLElement>;
  readonly onEditAppearance: () => void;
}

/** 접힌 설정도 다운로드 직전에 확인하며, 서명 문구와 별도 보호 옵션을 혼동하지 않는다. */
export function StudioExportOutputSummary({
  format, width, height, transparent, watermark, busy, summaryId, summaryRef, onEditAppearance,
}: StudioExportOutputSummaryProps) {
  const appearance = studioExportAppearanceSummary(format, transparent, watermark);
  const background = appearance.background === "unsupported" ? exportMenuText("backgroundOpaque")
    : appearance.background === "transparent" ? exportMenuText("backgroundTransparent")
      : exportMenuText("backgroundPreserved");
  const signature = appearance.signature === "off" ? exportMenuText("signatureOff")
    : appearance.signature === "empty" ? exportMenuText("signatureEmpty")
      : appearance.signature === "invalid" ? exportMenuText("signatureInvalid")
        : appearance.signature === "invisible" ? exportMenuText("signatureInvisible")
        : exportMenuText("signatureOn");
  return (
    <section id={summaryId} ref={summaryRef} tabIndex={-1} data-studio-export-output-summary="true"
      aria-labelledby={`${summaryId}-title`}
      className="mt-3 min-w-0 rounded-xl border border-line bg-panel/40 p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <h3 id={`${summaryId}-title`} className="text-xs font-bold text-fg">{exportMenuText("outputSummary")}</h3>
      <dl id={`${summaryId}-values`} aria-live="polite" aria-atomic="true" className="mt-2 grid min-w-0 gap-2 text-xs text-fg-2">
        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
          <dt>{exportMenuText("outputImage")}</dt>
          <dd className="m-0 min-w-0 break-words font-semibold tabular-nums text-fg">{exportFormatLabel(format)} · {width} × {height} px</dd>
        </div>
        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
          <dt>{exportMenuText("outputBackground")}</dt><dd className="m-0 min-w-0 break-words text-fg">{background}</dd>
        </div>
        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1">
          <dt>{exportMenuText("outputSignature")}</dt><dd className="m-0 min-w-0 break-words text-fg">{signature}</dd>
        </div>
      </dl>
      {appearance.background === "unsupported" && transparent ? (
        <p className="mt-2 text-xs leading-5 text-fg-2">{exportMenuText("jpgTransparentHint")}</p>
      ) : null}
      <button type="button" onClick={onEditAppearance} disabled={busy}
        className="mt-1 inline-flex min-h-11 max-w-full items-center rounded-lg px-1 text-left text-xs font-semibold text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50">
        {exportMenuText(appearance.signature === "empty" ? "enterSignature" : "editAppearance")}
      </button>
    </section>
  );
}
