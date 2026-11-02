import type { RefObject } from "react";

import { cx } from "@/shared/lib/cx";
import { WATERMARK_POSITIONS, type WatermarkSettings } from "../studio-watermark";
import type { ExportFormat } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { StudioExportSection } from "./StudioExportSection";

const POSITION_LABELS = {
  br: "positionBottomRight", bl: "positionBottomLeft", tr: "positionTopRight", tl: "positionTopLeft", center: "positionCenter",
} as const;

interface StudioExportAppearanceOptionsProps {
  exportFormat: ExportFormat;
  exportTransparent: boolean;
  watermark: WatermarkSettings;
  locked: boolean;
  busyHelpId: string;
  transparencyHelpId: string;
  signatureHelpId: string;
  appearanceRef: RefObject<HTMLDetailsElement | null>;
  transparencyRef: RefObject<HTMLInputElement | null>;
  signatureToggleRef: RefObject<HTMLInputElement | null>;
  signatureInputRef: RefObject<HTMLInputElement | null>;
  opacityRef: RefObject<HTMLInputElement | null>;
  setExportTransparent: (value: boolean) => void;
  setWatermark: (value: WatermarkSettings) => void;
  returnToDownload: () => void;
}

// 초점 이동 참조는 부모에 유지하고 설정 표시와 입력만 분리한다.
export function StudioExportAppearanceOptions({
  exportFormat, exportTransparent, watermark, locked, busyHelpId, transparencyHelpId,
  signatureHelpId, appearanceRef, transparencyRef, signatureToggleRef, signatureInputRef,
  opacityRef, setExportTransparent, setWatermark, returnToDownload,
}: StudioExportAppearanceOptionsProps) {
  return (
      <StudioExportSection id="appearance" detailsRef={appearanceRef} title={exportMenuText("appearance")} description={exportMenuText("appearanceHelp")}>
        <fieldset disabled={locked} className="min-w-0" aria-describedby={locked ? busyHelpId : undefined}>
          <legend className="sr-only">{exportMenuText("appearance")}</legend>
          <label className={cx("flex min-h-11 items-center gap-2 text-xs", exportFormat === "jpg" || locked ? "cursor-not-allowed text-fg-2" : "cursor-pointer text-fg-2")}>
            <input ref={transparencyRef} type="checkbox" checked={exportTransparent && exportFormat !== "jpg"} disabled={locked || exportFormat === "jpg"}
              aria-describedby={transparencyHelpId} onChange={(event) => { if (!locked) setExportTransparent(event.target.checked); }} className="size-4 shrink-0 accent-accent" />
            {exportMenuText("transparent")}
          </label>
          <p id={transparencyHelpId} className="mb-2 text-xs leading-5 text-fg-2">{exportMenuText(exportFormat === "jpg" ? "jpgTransparentHint" : "transparentHelp")}</p>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs font-semibold text-fg-2">
            <input ref={signatureToggleRef} type="checkbox" checked={watermark.enabled} disabled={locked}
              onChange={(event) => { if (!locked) setWatermark({ ...watermark, enabled: event.target.checked }); }} className="size-4 shrink-0 accent-accent" />
            {exportMenuText("watermark")}
          </label>
          {watermark.enabled ? (
            <div className="mt-1.5 min-w-0 space-y-1.5">
              <input ref={signatureInputRef} type="text" value={watermark.text} disabled={locked}
                onChange={(event) => { if (!locked) setWatermark({ ...watermark, text: event.target.value }); }} placeholder="© 작가명 / @아이디" maxLength={60}
                aria-label={exportMenuText("watermarkText")} aria-describedby={signatureHelpId}
                className="min-h-11 w-full min-w-0 rounded-lg border border-line bg-card px-2 text-base text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:text-xs" />
              <p id={signatureHelpId} className="text-xs leading-5 text-fg-2">{exportMenuText("signatureTextHelp")}</p>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <select value={watermark.position} disabled={locked}
                  onChange={(event) => { if (!locked) setWatermark({ ...watermark, position: event.target.value as WatermarkSettings["position"] }); }}
                  aria-label={exportMenuText("watermarkPosition")}
                  className="min-h-11 min-w-0 flex-1 rounded-lg border border-line bg-card px-2 text-base text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent sm:text-xs">
                  {WATERMARK_POSITIONS.map((position) => <option key={position.id} value={position.id}>{exportMenuText(POSITION_LABELS[position.id])}</option>)}
                </select>
                <input ref={opacityRef} type="range" min={0.15} max={1} step={0.05} value={watermark.opacity} disabled={locked}
                  onChange={(event) => { if (!locked) setWatermark({ ...watermark, opacity: Number(event.target.value) }); }}
                  aria-label={exportMenuText("watermarkOpacity")} className="h-11 w-20 shrink-0 accent-accent" />
              </div>
            </div>
          ) : null}
        </fieldset>
        <button type="button" onClick={returnToDownload}
          className="mt-2 min-h-11 max-w-full rounded-lg px-1 text-left text-xs font-semibold text-accent underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          {exportMenuText("returnToDownload")}
        </button>
      </StudioExportSection>
  );
}
