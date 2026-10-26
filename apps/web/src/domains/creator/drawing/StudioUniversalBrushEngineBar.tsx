import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import {
  encodeCleanRoomBrushQrPayload,
  executeHarmonyProceduralBrush,
  HARMONY_BRUSH_KINDS,
  IBIS_MEDIBANG_BRUSH_PRESETS,
  stepPhotoshopMixerBrushReservoir,
  traceP5BrushFlowLine,
  type ComicRibbonStampPresetId,
  type HarmonyBrushKind,
} from "./studio-universal-brush-taxonomy-engine";

export interface StudioUniversalBrushEngineBarProps {
  readonly tx: (source: string) => string;
}

export function StudioUniversalBrushEngineBar({
  tx,
}: StudioUniversalBrushEngineBarProps): ReactElement {
  const [selectedHarmonyKind, setSelectedHarmonyKind] =
    useState<HarmonyBrushKind>("sketchy");
  const [selectedComicRibbonId, setSelectedComicRibbonId] =
    useState<ComicRibbonStampPresetId>("ribbon-petal-chain");

  const activeUniversalTelemetry = useMemo(() => {
    const sampleStroke = Array.from({ length: 10 }, (_, idx) => ({
      x: 16 + idx * 8,
      y: 24 + Math.sin(idx * 0.7) * 7,
      pressure01: 0.82,
    }));
    const harmony = executeHarmonyProceduralBrush(selectedHarmonyKind, sampleStroke, {
      seed: 20261026,
    });
    const flow = traceP5BrushFlowLine({
      presetId: "charcoal",
      fieldKind: "waves",
      startX: 20,
      startY: 20,
      lengthPx: 72,
      baseAngleDeg: 18,
    });
    const ribbonPreset =
      IBIS_MEDIBANG_BRUSH_PRESETS.find((item) => item.id === selectedComicRibbonId) ??
      IBIS_MEDIBANG_BRUSH_PRESETS[0]!;
    const qrPayload = encodeCleanRoomBrushQrPayload({
      presetId: ribbonPreset.id,
      baseDiameterPx: 24,
      opacity01: 0.9,
      spacingRatio: ribbonPreset.spacingRatio,
    });
    const mixer = stepPhotoshopMixerBrushReservoir(
      { wet01: 0.75, load01: 0.65, mix01: 0.7, flow01: 0.88 },
      [0.95, 0.82, 0.18],
      [0.18, 0.45, 0.92],
      [0.18, 0.45, 0.92],
    );
    return {
      harmony,
      flowCount: flow.length,
      ribbonPreset,
      qrLength: qrPayload.length,
      mixer,
    };
  }, [selectedHarmonyKind, selectedComicRibbonId]);

  return (
    <div
      className="mt-3 rounded-2xl border border-line bg-card/60 px-3.5 py-2.5"
      data-studio-universal-brush-bar="true"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-accent">
          {tx("범용 브러시 엔진 (Harmony 11 · 웹툰 리본):")}
        </span>
        <div
          role="radiogroup"
          aria-label={tx("Harmony 절차적 브러시 모드")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {HARMONY_BRUSH_KINDS.map((kind, idx) => {
            const isSelected = kind === selectedHarmonyKind;
            return (
              <button
                key={kind}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-studio-harmony-kind={kind}
                onClick={() => setSelectedHarmonyKind(kind)}
                onKeyDown={(e) => {
                  let nextIdx = -1;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    nextIdx = (idx + 1) % HARMONY_BRUSH_KINDS.length;
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    nextIdx =
                      (idx - 1 + HARMONY_BRUSH_KINDS.length) %
                      HARMONY_BRUSH_KINDS.length;
                  } else if (e.key === "Home") {
                    nextIdx = 0;
                  } else if (e.key === "End") {
                    nextIdx = HARMONY_BRUSH_KINDS.length - 1;
                  }
                  if (nextIdx >= 0) {
                    e.preventDefault();
                    const target = HARMONY_BRUSH_KINDS[nextIdx];
                    if (target) {
                      setSelectedHarmonyKind(target);
                      const container = e.currentTarget.parentElement;
                      const buttons =
                        container?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                      buttons?.[nextIdx]?.focus();
                    }
                  }
                }}
                className={
                  isSelected
                    ? "rounded-full border border-accent bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold text-fg"
                    : "rounded-full border border-line bg-raised/70 px-2.5 py-0.5 text-[11px] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
                }
              >
                {kind}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-fg-2">
          {tx("웹툰 리본·멀티스탬프:")}
        </span>
        <div
          role="radiogroup"
          aria-label={tx("웹툰 리본 및 스탬프 브러시 프리셋")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {IBIS_MEDIBANG_BRUSH_PRESETS.slice(11, 17).map((preset, idx, arr) => {
            const isSelected = preset.id === selectedComicRibbonId;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-studio-comic-ribbon={preset.id}
                onClick={() => setSelectedComicRibbonId(preset.id)}
                onKeyDown={(e) => {
                  let nextIdx = -1;
                  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                    nextIdx = (idx + 1) % arr.length;
                  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                    nextIdx = (idx - 1 + arr.length) % arr.length;
                  } else if (e.key === "Home") {
                    nextIdx = 0;
                  } else if (e.key === "End") {
                    nextIdx = arr.length - 1;
                  }
                  if (nextIdx >= 0) {
                    e.preventDefault();
                    const target = arr[nextIdx];
                    if (target) {
                      setSelectedComicRibbonId(target.id);
                      const container = e.currentTarget.parentElement;
                      const buttons =
                        container?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
                      buttons?.[nextIdx]?.focus();
                    }
                  }
                }}
                className={
                  isSelected
                    ? "rounded-full border border-accent bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold text-fg"
                    : "rounded-full border border-line bg-raised/70 px-2.5 py-0.5 text-[11px] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
                }
              >
                {tx(preset.labelKo)}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-2">
        <span>
          {tx(activeUniversalTelemetry.ribbonPreset.labelKo)} ({activeUniversalTelemetry.ribbonPreset.sourceApp})
        </span>
        <span className="inline-flex items-center gap-2 font-mono text-[10px] text-fg-3">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full border border-line [forced-color-adjust:none]"
            style={{
              forcedColorAdjust: "none",
              backgroundColor: `rgb(${Math.round(activeUniversalTelemetry.mixer.canvasRgb01[0] * 255)}, ${Math.round(activeUniversalTelemetry.mixer.canvasRgb01[1] * 255)}, ${Math.round(activeUniversalTelemetry.mixer.canvasRgb01[2] * 255)})`,
            }}
          />
          <span>
            {tx("세그먼트")}: {activeUniversalTelemetry.harmony.primitiveCount}
          </span>
          <span>·</span>
          <span>
            {tx("코드 링크")}: {activeUniversalTelemetry.harmony.chordLinkCount}
          </span>
          <span>·</span>
          <span>
            {tx("노즐 주기")}: {activeUniversalTelemetry.ribbonPreset.nozzleCycleCount}
          </span>
          <span>·</span>
          <span>
            {tx("QR 바이트")}: {activeUniversalTelemetry.qrLength}B
          </span>
        </span>
      </div>
    </div>
  );
}
