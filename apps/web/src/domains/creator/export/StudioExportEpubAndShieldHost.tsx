/**
 * 고정 레이아웃 EPUB 3.0 내보내기, 1비트 망점/중철 밀림 인쇄 연동, 통계적 스크래핑 억제 보조 필터 호스트.
 */
import { ShieldAlert } from "lucide-react";
import { useState, type Dispatch, type ReactElement, type SetStateAction } from "react";

import { StudioEpubAndPrintAdvancedSection } from "./StudioEpubAndPrintAdvancedSection";
import { buildFixedLayoutEpubArchive, type EpubFixedLayoutPageInput } from "./studio-epub-fixed-layout";
import { canvasToBlob, downloadBlob } from "./studio-export";
import {
  normalizePerturbationIntensity,
  readStudioExportPerturbationShieldDraft,
  STUDIO_PERTURBATION_SHIELD_DISCLOSURE,
  writeStudioExportPerturbationShieldDraft,
  type PerturbationIntensityLevel,
} from "./studio-export-perturbation-shield";
import {
  DEFAULT_STUDIO_EPUB_AND_PRINT_ADVANCED_STATE,
  type StudioEpubAndPrintAdvancedState,
  type StudioPdfPrintSpecState,
} from "./studio-export-print-spec";

import { cx } from "@/shared/lib/cx";

export interface StudioExportEpubAndShieldHostProps {
  readonly title: string;
  readonly pageCount: number;
  readonly disabled?: boolean;
  readonly capturePages: () => Promise<HTMLCanvasElement[]>;
  readonly setPdfPrintSpec: Dispatch<SetStateAction<StudioPdfPrintSpecState>>;
}

export function StudioExportEpubAndShieldHost({
  title,
  pageCount,
  disabled = false,
  capturePages,
  setPdfPrintSpec,
}: StudioExportEpubAndShieldHostProps): ReactElement {
  const [advState, setAdvState] = useState<StudioEpubAndPrintAdvancedState>(
    DEFAULT_STUDIO_EPUB_AND_PRINT_ADVANCED_STATE,
  );
  const [shieldEnabled, setShieldEnabled] = useState<boolean>(
    () => readStudioExportPerturbationShieldDraft()?.enabled ?? false,
  );
  const [shieldIntensity, setShieldIntensity] = useState<PerturbationIntensityLevel>(
    () => readStudioExportPerturbationShieldDraft()?.intensity ?? 2,
  );
  const [epubBusy, setEpubBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ readonly tone: "good" | "warn"; readonly text: string } | null>(null);

  const syncShieldDraft = (enabled: boolean, intensity: PerturbationIntensityLevel): void => {
    writeStudioExportPerturbationShieldDraft({
      enabled,
      intensity,
      seed: title.trim() || "toonstudio-export",
    });
  };

  const handlePatchAdv = (patch: Partial<StudioEpubAndPrintAdvancedState>): void => {
    setAdvState((prev) => {
      const next = { ...prev, ...patch };
      setPdfPrintSpec((pdfPrev) => {
        const nextColorMode = next.monochromeEnabled
          ? next.monochromeMode
          : pdfPrev.colorMode === "monochrome-1bit" || pdfPrev.colorMode === "grayscale"
            ? "rgb"
            : pdfPrev.colorMode;
        const nextImposition =
          patch.saddleCreepEnabled !== undefined
            ? next.saddleCreepEnabled
              ? "booklet"
              : "none"
            : next.saddleCreepEnabled
              ? "booklet"
              : pdfPrev.imposition;
        const anyPrintFeatureActive =
          next.monochromeEnabled || next.saddleCreepEnabled || next.runningStampEnabled;
        return {
          ...pdfPrev,
          enabled: anyPrintFeatureActive ? true : pdfPrev.enabled,
          colorMode: nextColorMode,
          halftoneLpi: next.halftoneLpi,
          halftoneDpi: next.halftoneDpi,
          halftoneAngleDeg: next.halftoneAngleDeg,
          halftoneSpotShape: next.halftoneSpotShape,
          solidInkThreshold: next.solidInkThreshold,
          runningStampEnabled: next.runningStampEnabled,
          bindingDirection: next.epubProgressionDirection,
          imposition: nextImposition,
          creepMm: next.saddleCreepEnabled ? next.maxCreepMm : 0,
        };
      });
      return next;
    });
  };

  const runEpubExport = async (): Promise<void> => {
    if (epubBusy || disabled) return;
    setEpubBusy(true);
    setStatusMessage(null);
    try {
      const canvases = await capturePages();
      if (canvases.length === 0) {
        setStatusMessage({ tone: "warn", text: "내보낼 페이지 캡처가 비어 있어요." });
        return;
      }
      const pages: EpubFixedLayoutPageInput[] = [];
      for (let i = 0; i < canvases.length; i += 1) {
        const rawCanvas = canvases[i]!;
        if (shieldEnabled) {
          writeStudioExportPerturbationShieldDraft({
            enabled: true,
            intensity: shieldIntensity,
            seed: `${title || "epub"}-p${i + 1}`,
          });
        }
        const blob = await canvasToBlob(rawCanvas, "image/png");
        const bytes = new Uint8Array(await blob.arrayBuffer());
        pages.push({
          id: `page-${i + 1}`,
          title: `${i + 1}쪽`,
          imageBytes: bytes,
          mediaType: "image/png",
          width: Math.max(1, rawCanvas.width),
          height: Math.max(1, rawCanvas.height),
        });
      }
      if (shieldEnabled) {
        syncShieldDraft(true, shieldIntensity);
      }
      const archive = buildFixedLayoutEpubArchive({
        title: title.trim() || "무제 단행본",
        pageProgressionDirection: advState.epubProgressionDirection,
        renditionSpread: advState.epubSpread,
        kdpComicCompatible: advState.kdpComicCompatible,
        pages,
      });
      const safeFile = (title.trim() || "toonstudio-book").replace(/[\\/:*?"<>|]+/gu, "-");
      const copied = new Uint8Array(archive.epubBytes.byteLength);
      copied.set(archive.epubBytes);
      downloadBlob(new Blob([copied], { type: archive.mimeType }), `${safeFile}.epub`);
      setStatusMessage({ tone: "good", text: `EPUB 3.0 전자책(${archive.pageCount}쪽)을 저장했어요.` });
    } catch (err) {
      setStatusMessage({
        tone: "warn",
        text: err instanceof Error ? err.message : "EPUB 내보내기에 실패했어요.",
      });
    } finally {
      setEpubBusy(false);
    }
  };

  return (
    <div className="mt-2.5 space-y-2 [word-break:keep-all]">
      <details className="rounded-xl border border-line bg-card/45 p-2">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-1 text-xs font-semibold text-fg-2 transition-[background-color,color] duration-150 motion-reduce:transition-none">
          <span>전자책 EPUB 3.0 · 망점 인쇄 · 스크래핑 억제</span>
          <span className="tabular-nums text-xs text-fg-3">
            {advState.epubProgressionDirection === "rtl" ? "우철" : "좌철"}
            {shieldEnabled ? ` · 보호 ${shieldIntensity}단계` : ""}
          </span>
        </summary>
        <div className="space-y-2.5 pt-2">
          <StudioEpubAndPrintAdvancedSection
            value={advState}
            pageCount={pageCount}
            busy={epubBusy || disabled}
            onChange={handlePatchAdv}
            onExportEpub={() => void runEpubExport()}
          />
          <div className="rounded-xl border border-line/80 bg-panel/60 p-2.5 text-xs">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 font-semibold text-fg">
              <span className="inline-flex items-center gap-1.5">
                <ShieldAlert size={13} className="text-accent" aria-hidden />
                {STUDIO_PERTURBATION_SHIELD_DISCLOSURE.titleKo}
              </span>
              <input
                type="checkbox"
                checked={shieldEnabled}
                onChange={(e) => {
                  const nextEnabled = e.target.checked;
                  setShieldEnabled(nextEnabled);
                  syncShieldDraft(nextEnabled, shieldIntensity);
                }}
                className="size-4 accent-accent"
              />
            </label>
            {shieldEnabled ? (
              <div className="mt-2 space-y-1.5 border-t border-line/60 pt-2">
                <label className="flex min-h-11 items-center justify-between gap-2 text-xs text-fg-2">
                  <span>섭동 강도 (말풍선 흰 여백 자동 보존)</span>
                  <span className="flex min-h-11 items-center gap-1.5">
                    <input
                      type="range"
                      min={1}
                      max={4}
                      step={1}
                      value={shieldIntensity}
                      onChange={(e) => {
                        const nextIntensity = normalizePerturbationIntensity(Number(e.target.value));
                        setShieldIntensity(nextIntensity);
                        syncShieldDraft(shieldEnabled, nextIntensity);
                      }}
                      className="min-h-11 w-24 cursor-pointer accent-accent"
                    />
                    <span className="w-10 text-right tabular-nums">{shieldIntensity}단계</span>
                  </span>
                </label>
                <p className="text-xs leading-relaxed text-fg-3">
                  {STUDIO_PERTURBATION_SHIELD_DISCLOSURE.summaryKo}
                </p>
              </div>
            ) : null}
          </div>
          {statusMessage ? (
            <p
              role="status"
              className={cx(
                "rounded-md px-2 py-1.5 text-xs leading-snug",
                statusMessage.tone === "good" ? "bg-good/10 text-good" : "bg-warn/10 text-warn",
              )}
            >
              {statusMessage.text}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}
