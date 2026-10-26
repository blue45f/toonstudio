import { useMemo, useState } from "react";
import type { ReactElement } from "react";

import {
  COREL_PARTICLE_BRUSH_PRESETS,
  encodeCleanRoomBrushQrPayload,
  evaluateMyPaintFullDynamicsStep,
  evaluateSculptGlQuarticFalloff01,
  executeBooleanPolygonBrushClip,
  executeHarmonyProceduralBrush,
  executeKlecksBrushEngineSuite,
  fitSchneiderCubicBezierSpline,
  HARMONY_BRUSH_KINDS,
  IBIS_MEDIBANG_BRUSH_PRESETS,
  KLECKS_BRUSH_PRESETS,
  MYPAINT_BRUSH_PRESETS,
  SKELETAL_ART_BRUSH_PRESETS,
  stepCorelPainterParticleBrush,
  stepPhotoshopMixerBrushReservoir,
  traceP5BrushFlowLine,
  warpSkeletalArtBrushAlongSpine,
  type ComicRibbonStampPresetId,
  type CorelParticlePresetId,
  type HarmonyBrushKind,
  type KlecksPresetId,
  type MyPaintPresetId,
  type SkeletalArtBrushPresetId,
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
  const [selectedSkeletalId, setSelectedSkeletalId] =
    useState<SkeletalArtBrushPresetId>("katana-blade");
  const [selectedParticleId, setSelectedParticleId] =
    useState<CorelParticlePresetId>("silk-harmonic-spring");
  const [selectedKlecksId, setSelectedKlecksId] =
    useState<KlecksPresetId>("klecks-blend-watercolor");
  const [selectedMyPaintId, setSelectedMyPaintId] =
    useState<MyPaintPresetId>("mypaint-spectral-impasto");

  const activeUniversalTelemetry = useMemo(() => {
    const sampleStroke = Array.from({ length: 10 }, (_, idx) => ({
      x: 16 + idx * 14,
      y: 22 + Math.sin(idx * 0.7) * 9,
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
    const skeletalSamples = warpSkeletalArtBrushAlongSpine(selectedSkeletalId, sampleStroke, 1);
    const particleSegments = stepCorelPainterParticleBrush({
      presetId: selectedParticleId,
      points: sampleStroke,
      radiusPx: 18,
      seed: 20261026,
    });
    const sculptQuarticMid = evaluateSculptGlQuarticFalloff01(0.5);
    const schneiderFit = fitSchneiderCubicBezierSpline(sampleStroke, 2.5);
    const klecks = executeKlecksBrushEngineSuite({
      presetId: selectedKlecksId,
      points: sampleStroke,
      seed: 20261026,
    });
    const myPaintStep = evaluateMyPaintFullDynamicsStep({
      presetId: selectedMyPaintId,
      x: 78,
      y: 22,
      pressure01: 0.82,
      directionAngleDeg: 28,
      tiltAscensionDeg: 12,
    });
    const booleanUnion = executeBooleanPolygonBrushClip({
      subject: [
        { x: 165, y: 10 },
        { x: 188, y: 10 },
        { x: 188, y: 32 },
        { x: 165, y: 32 },
      ],
      clip: [
        { x: 176, y: 14 },
        { x: 202, y: 14 },
        { x: 202, y: 36 },
        { x: 176, y: 36 },
      ],
      operation: "union",
    });

    const bezierSvgPath = schneiderFit.segments
      .map((seg, i) =>
        i === 0
          ? `M ${seg.p0.x.toFixed(1)} ${seg.p0.y.toFixed(1)} C ${seg.ctrl1.x.toFixed(1)} ${seg.ctrl1.y.toFixed(1)}, ${seg.ctrl2.x.toFixed(1)} ${seg.ctrl2.y.toFixed(1)}, ${seg.p3.x.toFixed(1)} ${seg.p3.y.toFixed(1)}`
          : `C ${seg.ctrl1.x.toFixed(1)} ${seg.ctrl1.y.toFixed(1)}, ${seg.ctrl2.x.toFixed(1)} ${seg.ctrl2.y.toFixed(1)}, ${seg.p3.x.toFixed(1)} ${seg.p3.y.toFixed(1)}`,
      )
      .join(" ");
    const booleanPolygonPoints = booleanUnion.vertices
      .map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`)
      .join(" ");

    return {
      harmony,
      flowCount: flow.length,
      ribbonPreset,
      qrLength: qrPayload.length,
      mixer,
      skeletalCount: skeletalSamples.length,
      particleSegments: particleSegments.slice(0, 12),
      particleSegmentCount: particleSegments.length,
      sculptQuarticMid,
      schneiderSegmentCount: schneiderFit.segments.length,
      klecksDabCount: klecks.dabCount,
      myPaintStep,
      booleanUnionVertexCount: booleanUnion.vertices.length,
      bezierSvgPath,
      booleanPolygonPoints,
    };
  }, [
    selectedHarmonyKind,
    selectedComicRibbonId,
    selectedSkeletalId,
    selectedParticleId,
    selectedKlecksId,
    selectedMyPaintId,
  ]);

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
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-fg-2">
          {tx("벡터 골격·입자 물리 (Wave 22):")}
        </span>
        <div
          role="radiogroup"
          aria-label={tx("벡터 골격 아트 브러시 프리셋")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {SKELETAL_ART_BRUSH_PRESETS.slice(0, 4).map((preset, idx, arr) => {
            const isSelected = preset.id === selectedSkeletalId;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-studio-skeletal-brush={preset.id}
                onClick={() => setSelectedSkeletalId(preset.id)}
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
                      setSelectedSkeletalId(target.id);
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
        <div
          role="radiogroup"
          aria-label={tx("Corel 입자 물리 브러시 프리셋")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {COREL_PARTICLE_BRUSH_PRESETS.slice(0, 3).map((preset, idx, arr) => {
            const isSelected = preset.id === selectedParticleId;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-studio-particle-brush={preset.id}
                onClick={() => setSelectedParticleId(preset.id)}
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
                      setSelectedParticleId(target.id);
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
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-fg-2">
          {tx("베지어 피팅·Klecks 6종 (Wave 23):")}
        </span>
        <div
          role="radiogroup"
          aria-label={tx("Klecks 6종 및 베지어 곡선 브러시 프리셋")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {KLECKS_BRUSH_PRESETS.slice(4, 10).map((preset, idx, arr) => {
            const isSelected = preset.id === selectedKlecksId;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-studio-klecks-preset={preset.id}
                onClick={() => setSelectedKlecksId(preset.id)}
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
                      setSelectedKlecksId(target.id);
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
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold text-fg-2">
          {tx("MyPaint 46설정·38밴드 분광 (Wave 24):")}
        </span>
        <div
          role="radiogroup"
          aria-label={tx("MyPaint 46설정 및 38밴드 분광 브러시 프리셋")}
          className="flex flex-wrap items-center gap-1.5"
        >
          {MYPAINT_BRUSH_PRESETS.slice(0, 6).map((preset, idx, arr) => {
            const isSelected = preset.id === selectedMyPaintId;
            return (
              <button
                key={preset.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                data-studio-mypaint-preset={preset.id}
                onClick={() => setSelectedMyPaintId(preset.id)}
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
                      setSelectedMyPaintId(target.id);
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
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 bg-raised/40 px-2.5 py-1.5">
        <svg
          viewBox="0 0 220 44"
          className="h-9 w-52 shrink-0 rounded-lg border border-line/60 bg-canvas/80 [forced-color-adjust:none]"
          style={{ forcedColorAdjust: "none" }}
          aria-label={tx("범용 브러시 다중 레이어 실시간 스트로크 프리뷰")}
          data-studio-universal-brush-svg-preview="true"
        >
          {activeUniversalTelemetry.harmony.primitives.slice(0, 18).map((prim, idx) => (
            <line
              key={`h-${idx}`}
              x1={prim.x0}
              y1={prim.y0}
              x2={prim.x1}
              y2={prim.y1}
              stroke="currentColor"
              strokeWidth={1.1}
              strokeOpacity={Math.max(0.25, prim.alpha01)}
            />
          ))}
          {activeUniversalTelemetry.particleSegments.map((seg, idx) => (
            <line
              key={`p-${idx}`}
              x1={seg.x0}
              y1={seg.y0}
              x2={seg.x1}
              y2={seg.y1}
              className="text-cool"
              stroke="currentColor"
              strokeWidth={0.9}
              strokeOpacity={0.55}
            />
          ))}
          {activeUniversalTelemetry.bezierSvgPath ? (
            <path
              d={activeUniversalTelemetry.bezierSvgPath}
              fill="none"
              className="text-accent"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          ) : null}
          <circle
            cx={activeUniversalTelemetry.myPaintStep.primaryDabX}
            cy={activeUniversalTelemetry.myPaintStep.primaryDabY}
            r={Math.min(9, activeUniversalTelemetry.myPaintStep.radiusPx * 0.6)}
            fill={`rgb(${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[0] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[1] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[2] * 255)})`}
            fillOpacity={activeUniversalTelemetry.myPaintStep.linearizedOpaque01}
          />
          {activeUniversalTelemetry.booleanPolygonPoints ? (
            <polygon
              points={activeUniversalTelemetry.booleanPolygonPoints}
              className="text-good"
              fill="currentColor"
              fillOpacity={0.28}
              stroke="currentColor"
              strokeWidth={1}
            />
          ) : null}
        </svg>
        <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[10px] text-fg-3">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full border border-line [forced-color-adjust:none]"
            style={{
              forcedColorAdjust: "none",
              backgroundColor: `rgb(${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[0] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[1] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[2] * 255)})`,
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
            {tx("골격 리본")}: {activeUniversalTelemetry.skeletalCount}
          </span>
          <span>·</span>
          <span>
            {tx("입자 궤적")}: {activeUniversalTelemetry.particleSegmentCount}
          </span>
          <span>·</span>
          <span>
            {tx("베지어 피팅")}: {activeUniversalTelemetry.schneiderSegmentCount}
          </span>
          <span>·</span>
          <span>
            {tx("Klecks 댑")}: {activeUniversalTelemetry.klecksDabCount}
          </span>
          <span>·</span>
          <span>
            {tx("MyPaint 선형알파")}: {activeUniversalTelemetry.myPaintStep.linearizedOpaque01.toFixed(3)}
          </span>
          <span>·</span>
          <span>
            {tx("불리언 정점")}: {activeUniversalTelemetry.booleanUnionVertexCount}
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
