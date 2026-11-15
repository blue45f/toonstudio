import { useEffect, useMemo, useRef } from "react";

import { translateBilingualValueForActiveLocale } from "@/shared/lib/i18n-bilingual-copy";

import { isEffectivelyHidden } from "../studio-layers";
import {
  renderStudioExportCompositePreviewToCanvas,
  summarizeStudioExportLayerVisibility,
  type StudioExportPreviewPageLike,
} from "./studio-export-composite-preview";

import type { WatermarkSettings } from "../studio-watermark";
import type { ExportFormat } from "./studio-export";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioExportCompositePreview", ko, en);

export interface StudioExportCompositePreviewProps {
  readonly previewId: string;
  readonly page: StudioExportPreviewPageLike;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly exportFormat: ExportFormat;
  readonly exportTransparent: boolean;
  readonly watermark: WatermarkSettings;
}

export function StudioExportCompositePreview({
  previewId,
  page,
  canvasWidth,
  canvasHeight,
  exportFormat,
  exportTransparent,
  watermark,
}: StudioExportCompositePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageCacheRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const visibility = useMemo(
    () => summarizeStudioExportLayerVisibility(page, exportFormat, exportTransparent),
    [page, exportFormat, exportTransparent],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      renderStudioExportCompositePreviewToCanvas(canvas, {
        page,
        canvasWidth,
        canvasHeight,
        exportFormat,
        exportTransparent,
        watermark,
        imageCache: imageCacheRef.current,
      });
    };

    const groups = page.groups ?? [];
    for (const el of page.elements) {
      if (isEffectivelyHidden(el, groups) || el.type !== "image" || !el.src) continue;
      if (!imageCacheRef.current.has(el.src) && typeof Image === "function") {
        const img = new Image();
        img.onload = draw;
        img.src = el.src;
        imageCacheRef.current.set(el.src, img);
      }
    }
    draw();
  }, [page, canvasWidth, canvasHeight, exportFormat, exportTransparent, watermark]);

  const bgStatusLabel = visibility.effectiveTransparent
    ? bi("투명 배경 (알파 0)", "Transparent (alpha 0)")
    : exportFormat === "jpg" && exportTransparent
      ? bi("JPG 불투명 배경 유지", "JPG opaque background")
      : page.bgGrad && page.bgGrad.length >= 2
        ? bi("지정 그라디언트 배경", "Custom gradient background")
        : `${bi("지정 배경", "Background")} ${page.bg || "#ffffff"}`;

  return (
    <figure
      id={previewId}
      data-testid="studio-export-composite-preview"
      data-effective-transparent={visibility.effectiveTransparent ? "true" : "false"}
      aria-labelledby={`${previewId}-caption`}
      className="mt-3 min-w-0 rounded-xl border border-line bg-card/70 p-2.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <figcaption id={`${previewId}-caption`} className="text-xs font-bold text-fg">
          {bi("출력 합성 미리보기", "Output composite preview")}
        </figcaption>
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-[0.65rem] font-semibold text-fg-2">
          {bgStatusLabel}
        </span>
      </div>
      <div
        data-transparent-backdrop={visibility.effectiveTransparent ? "checkerboard" : "solid"}
        style={
          visibility.effectiveTransparent
            ? {
                backgroundImage:
                  "linear-gradient(45deg, rgba(148,163,184,0.28) 25%, transparent 25%), linear-gradient(-45deg, rgba(148,163,184,0.28) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(148,163,184,0.28) 75%), linear-gradient(-45deg, transparent 75%, rgba(148,163,184,0.28) 75%)",
                backgroundSize: "14px 14px",
                backgroundPosition: "0 0, 0 7px, 7px -7px, -7px 0",
              }
            : undefined
        }
        className="mt-2 flex max-h-44 min-h-24 items-center justify-center overflow-hidden rounded-lg border border-line/80 bg-panel/60 p-1.5"
      >
        <canvas
          ref={canvasRef}
          data-testid="studio-export-preview-canvas"
          aria-label={bi("숨김 레이어와 편집 가이드를 제외한 실제 출력 미리보기", "Actual output preview excluding hidden layers and editing guides")}
          className="max-h-40 max-w-full rounded-sm object-contain shadow-xs"
        />
      </div>
      <div
        data-testid="studio-export-visibility-badges"
        className="mt-2 flex flex-wrap items-center gap-1 text-[0.66rem] text-fg-2"
      >
        <span className="rounded-md bg-raised px-1.5 py-0.5 font-medium">
          {visibility.excludedHiddenTotal > 0
            ? bi(
                `숨김 레이어 ${visibility.excludedHiddenTotal}개 제외`,
                `${visibility.excludedHiddenTotal} hidden layers excluded`,
              )
            : bi("숨김 레이어 없음", "No hidden layers")}
        </span>
        <span className="rounded-md bg-raised px-1.5 py-0.5 font-medium">
          {bi("편집 오버레이 제외", "Editing overlays excluded")}
        </span>
        <span className="rounded-md bg-raised px-1.5 py-0.5 font-medium">
          {bi(`출력 요소 ${visibility.visibleElementCount}개`, `${visibility.visibleElementCount} visible items`)}
        </span>
      </div>
    </figure>
  );
}
