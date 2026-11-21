import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import {
  PRO_EX_ACTIVE_CHIP_STYLE,
  PRO_EX_PRIMARY_CTA_STYLE,
  PRO_EX_SUBVIEW_SCENES,
  PRO_EX_TACTILE_BTN,
  buildProExSampleSceneBuffer,
  buildProExSampleTonalGrid,
  makeProExTimelapseStrokeFrame,
} from "./studio-csp-pro-ex-demo-fixtures";
import {
  CSP_DRAWING_FIGURE_PRESETS,
  computeCspDrawingFigureLightingVector,
  createCspTimelapseSession,
  extractCspSubViewReferencePalette,
  renderCspQuickMaskOverlay,
  rgbBytesToOklch,
  type CspDrawingFigurePresetId,
  type CspTimelapseTargetDurationSec,
} from "./studio-csp-pro-ex-extensions";

export interface StudioCspProExSecondaryViewsProps {
  readonly activeTool: "subview-palette" | "quick-mask" | "timelapse" | "drawing-figure";
  readonly onExecuteProExTool?: (toolId: string, summaryKo: string) => void;
}

/**
 * 서브뷰 팔레트 추출 · 퀵 마스크 · 타임랩스 녹화 · 3D 데생 인형 프리셋 인터랙티브 뷰.
 */
export function StudioCspProExSecondaryViews({
  activeTool,
  onExecuteProExTool,
}: StudioCspProExSecondaryViewsProps): ReactElement {
  const [sceneIdx, setSceneIdx] = useState<number>(0);
  const [pickedSwatchIdx, setPickedSwatchIdx] = useState<number>(0);
  const [quickMaskOpacityPct, setQuickMaskOpacityPct] = useState<number>(50);
  const [quickMaskInvert, setQuickMaskInvert] = useState<boolean>(false);
  const [timelapseSession] = useState(() => {
    const session = createCspTimelapseSession({ maxRingCapacity: 12 });
    session.recordFrame(makeProExTimelapseStrokeFrame(1), 16, 16, {
      strokeCount: 1,
      timestampMs: 1000,
    });
    session.recordFrame(makeProExTimelapseStrokeFrame(2), 16, 16, {
      strokeCount: 2,
      timestampMs: 2500,
    });
    session.recordFrame(makeProExTimelapseStrokeFrame(3), 16, 16, {
      strokeCount: 3,
      timestampMs: 4200,
    });
    return session;
  });
  const [timelapseTick, setTimelapseTick] = useState<number>(3);
  const [timelapseDuration, setTimelapseDuration] = useState<CspTimelapseTargetDurationSec>(15);
  const [figureId, setFigureId] = useState<CspDrawingFigurePresetId>("webtoon-hero-8head");

  const subViewEvaluation = useMemo(() => {
    const scene = PRO_EX_SUBVIEW_SCENES[sceneIdx] ?? PRO_EX_SUBVIEW_SCENES[0];
    const buf = buildProExSampleSceneBuffer(scene ? scene.paletteStops : [], 24, 24);
    const palette = extractCspSubViewReferencePalette(buf, 24, 24, { maxColors: 8 });
    const picked = palette.swatches[pickedSwatchIdx] ?? palette.swatches[0] ?? null;
    return { scene, palette, picked };
  }, [sceneIdx, pickedSwatchIdx]);

  const quickMaskEvaluation = useMemo(() => {
    const base = buildProExSampleTonalGrid(16, 16);
    const mask = new Uint8Array(16 * 16);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        if (Math.hypot(x - 7.5, y - 7.5) <= 5.2) mask[y * 16 + x] = 255;
      }
    }
    const res = renderCspQuickMaskOverlay({
      baseRgba: base,
      maskAlpha: mask,
      width: 16,
      height: 16,
      opacity01: quickMaskOpacityPct / 100,
      invertOverlay: quickMaskInvert,
    });
    const cIdx = (8 * 16 + 8) * 4;
    const oIdx = (1 * 16 + 1) * 4;
    return {
      res,
      maskedSampleOklch: rgbBytesToOklch(
        res.rgba[cIdx] ?? 0,
        res.rgba[cIdx + 1] ?? 0,
        res.rgba[cIdx + 2] ?? 0,
      ).css,
      openSampleOklch: rgbBytesToOklch(
        res.rgba[oIdx] ?? 0,
        res.rgba[oIdx + 1] ?? 0,
        res.rgba[oIdx + 2] ?? 0,
      ).css,
    };
  }, [quickMaskOpacityPct, quickMaskInvert]);

  const timelapsePlan = useMemo(() => {
    void timelapseTick;
    return timelapseSession.buildExportPlan(timelapseDuration, 30);
  }, [timelapseSession, timelapseDuration, timelapseTick]);

  const figureEvaluation = useMemo(() => {
    const preset =
      CSP_DRAWING_FIGURE_PRESETS.find((p) => p.id === figureId) ?? CSP_DRAWING_FIGURE_PRESETS[0];
    const lighting = preset ? computeCspDrawingFigureLightingVector(preset) : null;
    return { preset, lighting };
  }, [figureId]);

  const handleCaptureTimelapse = (): void => {
    const nextStep = timelapseTick + 1;
    timelapseSession.recordFrame(makeProExTimelapseStrokeFrame(nextStep), 16, 16, {
      strokeCount: nextStep,
      timestampMs: nextStep * 1800,
    });
    setTimelapseTick(nextStep);
  };

  if (activeTool === "subview-palette") {
    return (
      <div data-testid="csp-pro-ex-view-subview-palette" className="space-y-2.5 rounded-lg bg-panel p-2.5">
        <div className="flex flex-wrap gap-1.5">
          {PRO_EX_SUBVIEW_SCENES.map((scene, idx) => (
            <button
              key={scene.id}
              type="button"
              data-testid={`csp-pro-ex-subview-scene-${scene.id}`}
              aria-pressed={sceneIdx === idx}
              onClick={() => {
                setSceneIdx(idx);
                setPickedSwatchIdx(0);
              }}
              className={`${PRO_EX_TACTILE_BTN} border ${STUDIO_FOCUS_RING} ${
                sceneIdx === idx
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              참고 이미지: {scene.labelKo}
            </button>
          ))}
        </div>

        <div
          data-testid="csp-pro-ex-subview-swatches"
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-4"
        >
          {subViewEvaluation.palette.swatches.map((swatch, idx) => (
            <button
              key={`${swatch.oklchCss}-${idx}`}
              type="button"
              aria-pressed={pickedSwatchIdx === idx}
              aria-label={`대표색 ${idx + 1} 비중 ${Math.round(swatch.ratio01 * 100)}%`}
              onClick={() => setPickedSwatchIdx(idx)}
              className={`${PRO_EX_TACTILE_BTN} flex items-center gap-2 border text-left ${STUDIO_FOCUS_RING} ${
                pickedSwatchIdx === idx
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              <span
                aria-hidden="true"
                className="size-6 shrink-0 rounded-md border border-line"
                style={{ backgroundColor: swatch.oklchCss }}
              />
              <span className="min-w-0 leading-tight tabular-nums">
                <span className="block font-semibold text-fg">
                  {Math.round(swatch.ratio01 * 100)}%
                </span>
                <span className="block truncate text-[0.68rem] text-fg-3">
                  L{swatch.oklch.l.toFixed(2)} H{Math.round(swatch.oklch.h)}°
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div data-testid="csp-pro-ex-subview-readout" className="text-fg-2 tabular-nums">
            추출 대표색 {subViewEvaluation.palette.swatches.length}색 · 분석 픽셀{" "}
            {subViewEvaluation.palette.sampledPixelCount}px
            {subViewEvaluation.picked
              ? ` · 선택 색 R${subViewEvaluation.picked.r} G${subViewEvaluation.picked.g} B${subViewEvaluation.picked.b}`
              : ""}
          </div>
          <button
            type="button"
            data-testid="csp-pro-ex-apply-subview"
            onClick={() =>
              onExecuteProExTool?.(
                `pro-ex:subview-palette:${subViewEvaluation.scene?.id ?? "scene"}`,
                `서브뷰 대표색 ${subViewEvaluation.palette.swatches.length}색 팔레트`,
              )
            }
            style={PRO_EX_PRIMARY_CTA_STYLE}
            className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
          >
            대표색 스와치 등록
          </button>
        </div>
      </div>
    );
  }

  if (activeTool === "quick-mask") {
    return (
      <div data-testid="csp-pro-ex-view-quick-mask" className="space-y-2.5 rounded-lg bg-panel p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {([35, 50, 70] as const).map((pct) => (
            <button
              key={pct}
              type="button"
              aria-pressed={quickMaskOpacityPct === pct}
              onClick={() => setQuickMaskOpacityPct(pct)}
              className={`${PRO_EX_TACTILE_BTN} border tabular-nums ${STUDIO_FOCUS_RING} ${
                quickMaskOpacityPct === pct
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              마스크 농도 {pct}%
            </button>
          ))}
          <button
            type="button"
            data-testid="csp-pro-ex-quick-mask-invert"
            aria-pressed={quickMaskInvert}
            onClick={() => setQuickMaskInvert((v) => !v)}
            className={`${PRO_EX_TACTILE_BTN} border ${STUDIO_FOCUS_RING} ${
              quickMaskInvert
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:bg-raised"
            }`}
          >
            바깥 영역 표시: {quickMaskInvert ? "켜짐" : "꺼짐"}
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-7 rounded-md border border-line"
              style={{ backgroundColor: quickMaskEvaluation.maskedSampleOklch }}
            />
            <span
              aria-hidden="true"
              className="size-7 rounded-md border border-line"
              style={{ backgroundColor: quickMaskEvaluation.openSampleOklch }}
            />
            <div data-testid="csp-pro-ex-quick-mask-readout" className="font-semibold tabular-nums">
              마스크 영역 {quickMaskEvaluation.res.maskedPixelCount}px (
              {Math.round(quickMaskEvaluation.res.coverageRatio01 * 100)}%)
            </div>
          </div>
          <button
            type="button"
            data-testid="csp-pro-ex-apply-quick-mask"
            onClick={() =>
              onExecuteProExTool?.(
                `pro-ex:quick-mask:${quickMaskOpacityPct}`,
                `퀵 마스크(${quickMaskOpacityPct}%)`,
              )
            }
            style={PRO_EX_PRIMARY_CTA_STYLE}
            className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
          >
            퀵 마스크 전환 적용
          </button>
        </div>
      </div>
    );
  }

  if (activeTool === "timelapse") {
    return (
      <div data-testid="csp-pro-ex-view-timelapse" className="space-y-2.5 rounded-lg bg-panel p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="csp-pro-ex-timelapse-capture"
            onClick={handleCaptureTimelapse}
            className={`${PRO_EX_TACTILE_BTN} border border-accent bg-accent-soft text-accent ${STUDIO_FOCUS_RING}`}
          >
            + 스냅샷 프레임 추가
          </button>
          {([15, 30, 60] as const).map((sec) => (
            <button
              key={sec}
              type="button"
              aria-pressed={timelapseDuration === sec}
              onClick={() => setTimelapseDuration(sec)}
              className={`${PRO_EX_TACTILE_BTN} border tabular-nums ${STUDIO_FOCUS_RING} ${
                timelapseDuration === sec
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              목표 길이 {sec}초
            </button>
          ))}
          <button
            type="button"
            data-testid="csp-pro-ex-timelapse-clear"
            onClick={() => {
              timelapseSession.clear();
              setTimelapseTick(0);
            }}
            className={`${PRO_EX_TACTILE_BTN} border border-line bg-card text-fg-2 hover:bg-raised ${STUDIO_FOCUS_RING}`}
          >
            초기화
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div data-testid="csp-pro-ex-timelapse-readout" className="font-semibold tabular-nums">
            저장 프레임 {timelapsePlan.recordedFrameCount}/{timelapseSession.maxRingCapacity} · 누적{" "}
            {timelapsePlan.totalCapturedEver}컷 · 출력 {timelapsePlan.targetFrameCount}컷 · 배속{" "}
            {timelapsePlan.effectiveSpeedMultiplier}배
          </div>
          <button
            type="button"
            data-testid="csp-pro-ex-apply-timelapse"
            onClick={() =>
              onExecuteProExTool?.(
                `pro-ex:timelapse:${timelapseDuration}s`,
                `타임랩스 ${timelapseDuration}초 내보내기(${timelapsePlan.targetFrameCount}컷)`,
              )
            }
            style={PRO_EX_PRIMARY_CTA_STYLE}
            className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
          >
            타임랩스 내보내기 준비
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="csp-pro-ex-view-drawing-figure" className="space-y-2.5 rounded-lg bg-panel p-2.5">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
        {CSP_DRAWING_FIGURE_PRESETS.map((preset) => {
          const isSelected = preset.id === figureId;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`csp-pro-ex-figure-${preset.id}`}
              aria-pressed={isSelected}
              onClick={() => setFigureId(preset.id)}
              style={isSelected ? PRO_EX_ACTIVE_CHIP_STYLE : undefined}
              className={`${PRO_EX_TACTILE_BTN} flex items-center justify-between gap-2 border text-left ${STUDIO_FOCUS_RING} ${
                isSelected
                  ? "border-accent bg-accent-soft text-fg"
                  : "border-line bg-card text-fg-2 hover:bg-raised"
              }`}
            >
              <span className="min-w-0">
                <span className="block font-semibold text-fg">{preset.labelKo}</span>
                <span className="block text-[0.68rem] text-fg-3 tabular-nums">
                  {preset.heightCm}cm · {preset.headToBodyRatio}등신 · {preset.genreTagKo}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1" aria-hidden="true">
                <span
                  className="size-4 rounded-full border border-line"
                  style={{ backgroundColor: preset.keyLightOklchCss }}
                />
                <span
                  className="size-4 rounded-full border border-line"
                  style={{ backgroundColor: preset.shadowToneOklchCss }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {figureEvaluation.preset && figureEvaluation.lighting && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div data-testid="csp-pro-ex-figure-readout" className="text-fg-2 tabular-nums">
            머리 크기 {figureEvaluation.lighting.headHeightCm}cm · 렌즈{" "}
            {figureEvaluation.preset.cameraFocalLengthMm}mm (
            {figureEvaluation.lighting.perspectiveStrengthKo}) · 주광원 방향 (
            {figureEvaluation.lighting.keyLightDir.join(", ")}) · 림라이트{" "}
            {Math.round(figureEvaluation.preset.rimLightIntensity01 * 100)}%
          </div>
          <button
            type="button"
            data-testid="csp-pro-ex-apply-drawing-figure"
            onClick={() =>
              onExecuteProExTool?.(
                `pro-ex:drawing-figure:${figureEvaluation.preset?.id ?? figureId}`,
                `3D 데생 인형 '${figureEvaluation.preset?.labelKo ?? figureId}'`,
              )
            }
            style={PRO_EX_PRIMARY_CTA_STYLE}
            className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
          >
            3D 데생 인형 배치
          </button>
        </div>
      )}
    </div>
  );
}
