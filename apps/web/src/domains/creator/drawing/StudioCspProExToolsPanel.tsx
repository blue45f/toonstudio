import { useMemo, useState, type ReactElement } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";

import { StudioCspProExSecondaryViews } from "./StudioCspProExSecondaryViews";
import {
  PRO_EX_ACTIVE_CHIP_STYLE,
  PRO_EX_COLORIZE_HINT_THEMES,
  PRO_EX_PRIMARY_CTA_STYLE,
  PRO_EX_SAMPLE_VECTOR_STROKES,
  PRO_EX_TACTILE_BTN,
  PRO_EX_TOOL_CATALOG,
  buildProExSampleLineArt,
  buildProExSampleTonalGrid,
  type CspProExToolId,
} from "./studio-csp-pro-ex-demo-fixtures";
import {
  CSP_WEBTOON_GRADIENT_MAPS,
  applyCspColorizeHintAutoFill,
  applyCspWebtoonGradientMap,
  eraseCspVectorStrokes,
  pinchCspVectorStroke,
  rgbBytesToOklch,
  simplifyCspVectorStroke,
  type CspVectorEraserMode,
  type CspWebtoonGradientMapId,
} from "./studio-csp-pro-ex-extensions";

export type { CspProExToolId };

export interface StudioCspProExToolsPanelProps {
  readonly initialTool?: CspProExToolId;
  readonly onExecuteProExTool?: (toolId: string, summaryKo: string) => void;
}

const SPECTRUM_ACCENT_BAR_STYLE = {
  backgroundImage:
    "linear-gradient(90deg, color-mix(in oklch, var(--color-accent) 85%, transparent), color-mix(in oklch, var(--color-info, var(--color-accent)) 78%, transparent), color-mix(in oklch, var(--color-success, var(--color-accent)) 75%, transparent))",
} as const;

/**
 * 직관적이고 컬러풀한 프로·자동 도구 패널.
 * 벡터 교차 지우개, 힌트 자동 채색, 8종 웹툰 그라데이션 맵, 서브뷰 팔레트 추출,
 * 퀵 마스크, 타임랩스 녹화, 3D 데생 인형 프리셋을 원클릭 실시간 결과와 함께 제공한다.
 */
export function StudioCspProExToolsPanel({
  initialTool = "vector-eraser",
  onExecuteProExTool,
}: StudioCspProExToolsPanelProps): ReactElement {
  const [activeTool, setActiveTool] = useState<CspProExToolId>(initialTool);
  const [eraserMode, setEraserMode] = useState<CspVectorEraserMode>("intersection");
  const [applySimplify, setApplySimplify] = useState<boolean>(false);
  const [applyPinch, setApplyPinch] = useState<boolean>(false);
  const [colorizeThemeIdx, setColorizeThemeIdx] = useState<number>(0);
  const [gradientId, setGradientId] = useState<CspWebtoonGradientMapId>("sunset");
  const [gradientReverse, setGradientReverse] = useState<boolean>(false);
  const [gradientMixPercent, setGradientMixPercent] = useState<number>(100);

  const vectorEvaluation = useMemo(() => {
    const baseStrokes = PRO_EX_SAMPLE_VECTOR_STROKES.map((stroke) => {
      let pts = stroke.points;
      if (applySimplify) pts = simplifyCspVectorStroke(pts, 1.5);
      if (applyPinch && stroke.id === "main-horiz") {
        pts = pinchCspVectorStroke(pts, { x: 50, y: 50 }, { dx: 0, dy: -16 }, 34, {
          strength01: 0.9,
          pinEndpoints: true,
        });
      }
      return { id: stroke.id, points: pts };
    });
    const eraseResult = eraseCspVectorStrokes(
      baseStrokes,
      { x: 50, y: 50, radiusPx: 11 },
      eraserMode,
    );
    const beforePts = PRO_EX_SAMPLE_VECTOR_STROKES.reduce((sum, s) => sum + s.points.length, 0);
    const afterPts = baseStrokes.reduce((sum, s) => sum + s.points.length, 0);
    return { eraseResult, beforePts, afterPts };
  }, [eraserMode, applySimplify, applyPinch]);

  const colorizeEvaluation = useMemo(() => {
    const theme = PRO_EX_COLORIZE_HINT_THEMES[colorizeThemeIdx] ?? PRO_EX_COLORIZE_HINT_THEMES[0];
    const lineArt = buildProExSampleLineArt(16, 16);
    const res = applyCspColorizeHintAutoFill({
      lineArtRgba: lineArt,
      width: 16,
      height: 16,
      hints: theme ? theme.hints : [],
    });
    const previewCells: string[] = [];
    for (let y = 2; y < 14; y += 3) {
      for (let x = 2; x < 14; x += 2) {
        const idx = (y * 16 + x) * 4;
        previewCells.push(
          rgbBytesToOklch(res.rgba[idx] ?? 0, res.rgba[idx + 1] ?? 0, res.rgba[idx + 2] ?? 0).css,
        );
      }
    }
    return { theme, res, previewCells };
  }, [colorizeThemeIdx]);

  const gradientEvaluation = useMemo(() => {
    const preset =
      CSP_WEBTOON_GRADIENT_MAPS.find((p) => p.id === gradientId) ?? CSP_WEBTOON_GRADIENT_MAPS[0];
    const src = buildProExSampleTonalGrid(16, 16);
    const out = applyCspWebtoonGradientMap(src, 16, 16, gradientId, {
      mixRate01: gradientMixPercent / 100,
      reverse: gradientReverse,
    });
    let changedPixels = 0;
    for (let i = 0; i < src.length; i += 4) {
      if (src[i] !== out[i] || src[i + 1] !== out[i + 1] || src[i + 2] !== out[i + 2]) {
        changedPixels += 1;
      }
    }
    const sampleSwatches: string[] = [];
    for (const xPos of [1, 4, 8, 12, 15]) {
      const idx = (8 * 16 + xPos) * 4;
      sampleSwatches.push(
        rgbBytesToOklch(out[idx] ?? 0, out[idx + 1] ?? 0, out[idx + 2] ?? 0).css,
      );
    }
    return { preset, changedPixels, sampleSwatches };
  }, [gradientId, gradientMixPercent, gradientReverse]);

  return (
    <div
      data-testid="csp-pro-ex-tools-panel"
      className="overflow-hidden rounded-xl border border-line bg-card/70 text-xs text-fg [word-break:keep-all]"
    >
      <div aria-hidden="true" className="h-0.5 w-full" style={SPECTRUM_ACCENT_BAR_STYLE} />
      <div className="space-y-3 p-2.5">
        <div role="group" aria-label="프로·자동 도구 선택" className="flex flex-wrap gap-1.5">
          {PRO_EX_TOOL_CATALOG.map((tool) => {
            const isActive = activeTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                data-testid={`csp-pro-ex-tool-btn-${tool.id}`}
                aria-pressed={isActive}
                onClick={() => setActiveTool(tool.id)}
                style={isActive ? PRO_EX_ACTIVE_CHIP_STYLE : undefined}
                className={`${PRO_EX_TACTILE_BTN} inline-flex items-center gap-1.5 border ${STUDIO_FOCUS_RING} ${
                  isActive
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: tool.accentOklch }}
                />
                <span>{tool.labelKo}</span>
              </button>
            );
          })}
        </div>

        {activeTool === "vector-eraser" && (
          <div data-testid="csp-pro-ex-view-vector-eraser" className="space-y-2.5 rounded-lg bg-panel p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  ["intersection", "교차점까지 지우기"],
                  ["touch", "닿은 부분만 지우기"],
                  ["whole", "선 전체 지우기"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  data-testid={`csp-pro-ex-vector-mode-${mode}`}
                  aria-pressed={eraserMode === mode}
                  onClick={() => setEraserMode(mode)}
                  className={`${PRO_EX_TACTILE_BTN} border ${STUDIO_FOCUS_RING} ${
                    eraserMode === mode
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                data-testid="csp-pro-ex-vector-simplify-toggle"
                aria-pressed={applySimplify}
                onClick={() => setApplySimplify((v) => !v)}
                className={`${PRO_EX_TACTILE_BTN} border ${STUDIO_FOCUS_RING} ${
                  applySimplify
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                선 단순화 {applySimplify ? "켜짐" : "꺼짐"}
              </button>
              <button
                type="button"
                data-testid="csp-pro-ex-vector-pinch-toggle"
                aria-pressed={applyPinch}
                onClick={() => setApplyPinch((v) => !v)}
                className={`${PRO_EX_TACTILE_BTN} border ${STUDIO_FOCUS_RING} ${
                  applyPinch
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised"
                }`}
              >
                제어점 당기기 {applyPinch ? "켜짐" : "꺼짐"}
              </button>
            </div>

            <div className="grid grid-cols-1 items-center gap-2.5 sm:grid-cols-[7.5rem_1fr]">
              <svg
                viewBox="0 0 100 100"
                role="img"
                aria-label="벡터 교차 지우개 실시간 미리보기"
                className="h-24 w-28 rounded-lg border border-line bg-card p-1"
              >
                <circle
                  cx="50"
                  cy="50"
                  r="11"
                  fill="var(--color-accent)"
                  fillOpacity="0.18"
                  stroke="var(--color-accent)"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
                {vectorEvaluation.eraseResult.strokes.map((stroke) => (
                  <polyline
                    key={stroke.id}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={stroke.points.map((pt) => `${pt.x},${pt.y}`).join(" ")}
                  />
                ))}
              </svg>
              <div className="space-y-1.5">
                <div data-testid="csp-pro-ex-vector-readout" className="font-semibold tabular-nums">
                  입력 선 3개 → 남은 선 {vectorEvaluation.eraseResult.strokes.length}개 · 교차 절단{" "}
                  {vectorEvaluation.eraseResult.intersectionCutCount}건 · 삭제 구간{" "}
                  {vectorEvaluation.eraseResult.erasedSegmentCount}개
                </div>
                <div className="text-fg-2 tabular-nums">
                  제어점 정리: {vectorEvaluation.beforePts}개 → {vectorEvaluation.afterPts}개
                </div>
                <button
                  type="button"
                  data-testid="csp-pro-ex-apply-vector-eraser"
                  onClick={() =>
                    onExecuteProExTool?.(
                      `pro-ex:vector-eraser:${eraserMode}`,
                      `벡터 지우개(${eraserMode === "intersection" ? "교차점까지" : eraserMode === "touch" ? "닿은 부분" : "선 전체"})`,
                    )
                  }
                  style={PRO_EX_PRIMARY_CTA_STYLE}
                  className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
                >
                  벡터 편집 바로 적용
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTool === "colorize-hint" && (
          <div data-testid="csp-pro-ex-view-colorize-hint" className="space-y-2.5 rounded-lg bg-panel p-2.5">
            <div className="flex flex-wrap gap-1.5">
              {PRO_EX_COLORIZE_HINT_THEMES.map((theme, idx) => (
                <button
                  key={theme.id}
                  type="button"
                  data-testid={`csp-pro-ex-colorize-theme-${theme.id}`}
                  aria-pressed={colorizeThemeIdx === idx}
                  onClick={() => setColorizeThemeIdx(idx)}
                  className={`${PRO_EX_TACTILE_BTN} inline-flex items-center gap-1.5 border ${STUDIO_FOCUS_RING} ${
                    colorizeThemeIdx === idx
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-card text-fg-2 hover:bg-raised"
                  }`}
                >
                  {theme.hints.map((h) => (
                    <span
                      key={`${theme.id}-${h.x}-${h.y}`}
                      aria-hidden="true"
                      className="size-3 rounded-full border border-line"
                      style={{ backgroundColor: rgbBytesToOklch(h.r, h.g, h.b).css }}
                    />
                  ))}
                  <span>{theme.labelKo}</span>
                </button>
              ))}
            </div>

            <div
              aria-label="힌트 자동 채색 실시간 픽셀 결과"
              className="grid grid-cols-6 gap-1 rounded-lg border border-line bg-card p-1.5"
            >
              {colorizeEvaluation.previewCells.map((oklchCss, idx) => (
                <div
                  key={`cell-${idx}`}
                  className="h-4 rounded-sm"
                  style={{ backgroundColor: oklchCss }}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div data-testid="csp-pro-ex-colorize-readout" className="font-semibold tabular-nums">
                자동 채색 {colorizeEvaluation.res.filledPixelCount}px · 선화 경계{" "}
                {colorizeEvaluation.res.detectedLinePixelCount}px · 힌트{" "}
                {colorizeEvaluation.res.appliedHintCount}개
              </div>
              <button
                type="button"
                data-testid="csp-pro-ex-apply-colorize"
                onClick={() =>
                  onExecuteProExTool?.(
                    `pro-ex:colorize:${colorizeEvaluation.theme?.id ?? "default"}`,
                    `힌트 자동 채색(${colorizeEvaluation.theme?.labelKo ?? "기본"})`,
                  )
                }
                style={PRO_EX_PRIMARY_CTA_STYLE}
                className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
              >
                힌트 자동 채색 적용
              </button>
            </div>
          </div>
        )}

        {activeTool === "gradient-map" && (
          <div data-testid="csp-pro-ex-view-gradient-map" className="space-y-2.5 rounded-lg bg-panel p-2.5">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {CSP_WEBTOON_GRADIENT_MAPS.map((preset) => {
                const isSelected = preset.id === gradientId;
                const gradientCss = `linear-gradient(90deg, ${preset.previewOklchStops.join(", ")})`;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    data-testid={`csp-pro-ex-gradient-${preset.id}`}
                    aria-pressed={isSelected}
                    onClick={() => setGradientId(preset.id)}
                    style={isSelected ? PRO_EX_ACTIVE_CHIP_STYLE : undefined}
                    className={`${PRO_EX_TACTILE_BTN} flex flex-col items-stretch justify-center gap-1 border text-left ${STUDIO_FOCUS_RING} ${
                      isSelected
                        ? "border-accent bg-accent-soft text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="block h-3 w-full rounded-sm border border-line/60"
                      style={{ backgroundImage: gradientCss }}
                    />
                    <span className="flex items-center justify-between gap-1 text-[0.7rem]">
                      <span className="font-semibold text-fg">{preset.labelKo}</span>
                      <span className="text-fg-3">{preset.moodTagKo}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  data-testid="csp-pro-ex-gradient-reverse"
                  aria-pressed={gradientReverse}
                  onClick={() => setGradientReverse((v) => !v)}
                  className={`${PRO_EX_TACTILE_BTN} border border-line bg-card text-fg-2 hover:bg-raised ${STUDIO_FOCUS_RING}`}
                >
                  방향 반전: {gradientReverse ? "켜짐" : "꺼짐"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setGradientMixPercent((prev) => (prev === 100 ? 50 : prev === 50 ? 85 : 100))
                  }
                  className={`${PRO_EX_TACTILE_BTN} border border-line bg-card text-fg-2 tabular-nums hover:bg-raised ${STUDIO_FOCUS_RING}`}
                >
                  적용 강도: {gradientMixPercent}%
                </button>
                <div className="flex items-center gap-1" aria-label="변환 결과 대표 5색">
                  {gradientEvaluation.sampleSwatches.map((oklchCss, idx) => (
                    <span
                      key={`g-sw-${idx}`}
                      className="size-5 rounded-md border border-line"
                      style={{ backgroundColor: oklchCss }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                data-testid="csp-pro-ex-apply-gradient-map"
                onClick={() =>
                  onExecuteProExTool?.(
                    `pro-ex:gradient-map:${gradientId}`,
                    `그라데이션 맵 '${gradientEvaluation.preset?.labelKo ?? gradientId}'`,
                  )
                }
                style={PRO_EX_PRIMARY_CTA_STYLE}
                className={`${PRO_EX_TACTILE_BTN} px-4 hover:brightness-105 ${STUDIO_FOCUS_RING}`}
              >
                이 그라데이션 맵 적용
              </button>
            </div>
            <div data-testid="csp-pro-ex-gradient-readout" className="text-fg-2 tabular-nums">
              선택 프리셋: {gradientEvaluation.preset?.labelKo} · 변환 픽셀{" "}
              {gradientEvaluation.changedPixels}/256
            </div>
          </div>
        )}

        {(activeTool === "subview-palette" ||
          activeTool === "quick-mask" ||
          activeTool === "timelapse" ||
          activeTool === "drawing-figure") && (
          <StudioCspProExSecondaryViews
            activeTool={activeTool}
            onExecuteProExTool={onExecuteProExTool}
          />
        )}
      </div>
    </div>
  );
}
