import { ShieldCheck } from "lucide-react";
import type { Ref } from "react";

import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

import type { WatermarkSettings } from "../studio-watermark";
import { exportFormatLabel, type ExportFormat } from "./studio-export";
import { exportMenuText } from "./studio-export-menu-i18n";
import { studioExportAppearanceSummary } from "./studio-export-summary";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioExportOutputSummary", ko, en);

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
  const needsWebtoonSlice = width > 1_600 || height > 20_000;
  const preflightLabel = needsWebtoonSlice
    ? bi("고해상도 원본 · 연재처 투고 시 자동 슬라이스 권장", "High-res master · auto-slice advised for platform upload")
    : bi("웹툰 규격 적합 · Rights BOM 출처 자동 점검", "Webtoon spec ready · Rights BOM auto-checked");

  return (
    <section
      id={summaryId}
      ref={summaryRef}
      tabIndex={-1}
      data-studio-export-output-summary="true"
      aria-labelledby={`${summaryId}-title`}
      className="relative mt-3 min-w-0 overflow-hidden rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/8 via-panel/85 to-card p-3.5 shadow-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-accent via-cool to-good" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${summaryId}-title`} className="text-xs font-extrabold text-fg">
          {exportMenuText("outputSummary")}
        </h3>
        <span className="inline-flex items-center gap-1 rounded-full border border-good/35 bg-good/10 px-2 py-0.5 font-display text-[10px] font-bold tracking-wider text-good">
          <ShieldCheck size={11} aria-hidden="true" />
          <span>PREFLIGHT · BOM</span>
        </span>
      </div>
      <dl id={`${summaryId}-values`} aria-live="polite" aria-atomic="true" className="mt-2.5 grid min-w-0 gap-2 text-xs text-fg-2">
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
        <div className="flex min-w-0 flex-wrap justify-between gap-x-3 gap-y-1 border-t border-line/65 pt-2" data-studio-export-preflight="true">
          <dt>{bi("출고 프리플라이트", "Export preflight")}</dt>
          <dd className={`m-0 min-w-0 break-words font-semibold ${needsWebtoonSlice ? "text-fg-2" : "text-good"}`}>{preflightLabel}</dd>
        </div>
      </dl>
      {appearance.background === "unsupported" && transparent ? (
        <p className="mt-2 text-xs leading-5 text-fg-2">{exportMenuText("jpgTransparentHint")}</p>
      ) : null}
      <button
        type="button"
        onClick={onEditAppearance}
        disabled={busy}
        className="mt-2 inline-flex min-h-11 max-w-full items-center rounded-full border border-accent/35 bg-accent-soft px-3 text-left text-xs font-bold text-accent transition-colors hover:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exportMenuText(appearance.signature === "empty" ? "enterSignature" : "editAppearance")}
      </button>
    </section>
  );
}
