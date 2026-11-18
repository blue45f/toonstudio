/**
 * Studio Raster / Freeform / Contour Gradient Section
 *
 * CSP 래스터 그라데이션(`일반` / `그라데이션 지우개` / `만화 망점`), 자유형 그라데이션,
 * 등고선 채우기(`Contour fill`) 전용 한국어 프로그레시브 디스클로저 UI 섹션.
 *
 * 역공학 근거(REA Ghidra clean-room 재구현):
 * - evidence_id: `ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`
 * - evidence_id: `ev_9e97a121e10ceaa075c9f4fb0b21c7bf2bd090aa4a639830aa6f070bec16e30f`
 */
import { useMemo, useState } from "react";

import { StudioSliderRow, StudioToggleChip } from "../studio-panel-ui";
import {
  evaluateContourTransferCurve,
  renderContourFill,
  renderFreeformGradient,
} from "./studio-freeform-contour-fill";
import {
  DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE,
  renderStudioRasterGradient,
} from "./studio-raster-gradient";

import type {
  RasterGradientOutputMode,
  RasterGradientRepeatMode,
  RasterGradientShape,
  StudioRasterFreeformGradientUiState,
} from "./studio-raster-gradient";
import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export type { StudioRasterFreeformGradientUiState };

export interface StudioRasterFreeformGradientSectionProps {
  readonly value?: StudioRasterFreeformGradientUiState;
  readonly onChange?: (next: StudioRasterFreeformGradientUiState) => void;
}

const OUTPUT_MODE_ITEMS: readonly {
  readonly id: RasterGradientOutputMode;
  readonly label: string;
  readonly tip: string;
}[] = [
  { id: "normal", label: "일반", tip: "선택 영역 안에 부드러운 디더링 래스터 그라데이션을 합성합니다." },
  { id: "erase", label: "그라데이션 지우개", tip: "원본 RGB 색상은 유지하고 불투명도만 점진적으로 지웁니다." },
  { id: "manga-halftone", label: "만화 망점", tip: "농도를 회전된 스크린톤 망점 크기로 변환해 찍습니다." },
];

const SHAPE_ITEMS: readonly {
  readonly id: RasterGradientShape;
  readonly label: string;
}[] = [
  { id: "linear", label: "선형" },
  { id: "radial", label: "방사" },
  { id: "elliptical", label: "타원" },
];

const REPEAT_ITEMS: readonly {
  readonly id: RasterGradientRepeatMode;
  readonly label: string;
}[] = [
  { id: "clamp", label: "고정" },
  { id: "repeat", label: "반복" },
  { id: "reflect", label: "대칭 반복" },
];

const CONTOUR_CURVE_ITEMS: readonly {
  readonly id: StudioRasterFreeformGradientUiState["contourCurve"];
  readonly label: string;
}[] = [
  { id: "linear", label: "선형" },
  { id: "smoothstep", label: "부드러운 곡선" },
  { id: "ease-in", label: "완만한 시작" },
  { id: "ease-out", label: "완만한 끝" },
];

const HIT_BUTTON_CLASS =
  "inline-flex min-h-11 items-center justify-center rounded-lg border px-2.5 py-1.5 text-xs font-semibold [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface PreviewSwatchCell {
  readonly x: number;
  readonly y: number;
  readonly fill: string;
}

function buildDeterministicPreview(state: StudioRasterFreeformGradientUiState): {
  readonly rasterCells: readonly PreviewSwatchCell[];
  readonly contourCells: readonly PreviewSwatchCell[];
  readonly affectedRasterPixels: number;
} {
  const w = 48;
  const h = 20;
  const basePlate = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    basePlate[i * 4] = 244;
    basePlate[i * 4 + 1] = 240;
    basePlate[i * 4 + 2] = 232;
    basePlate[i * 4 + 3] = 255;
  }

  const rasterRes = renderStudioRasterGradient({
    target: { data: basePlate, width: w, height: h },
    start: state.shape === "linear" ? { x: 4, y: 10 } : { x: 24, y: 10 },
    end: state.shape === "linear" ? { x: 44, y: 10 } : { x: 42, y: 10 },
    shape: state.shape,
    repeatMode: state.repeatMode,
    outputMode: state.outputMode,
    dither: state.dither,
    halftoneLpi: state.halftoneLpi,
    halftoneDpi: 300,
    halftoneAngleDeg: state.halftoneAngleDeg,
    stops: [
      { offset: 0, color: [32, 74, 168, 255] },
      { offset: 1, color: [236, 148, 64, 32] },
    ],
  });

  const boundaryA = new Uint8Array(w * h);
  const boundaryB = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    boundaryA[y * w + 0] = 255;
    boundaryB[y * w + (w - 1)] = 255;
  }
  const contourBase = renderContourFill({
    width: w,
    height: h,
    boundaryAMask: boundaryA,
    boundaryBMask: boundaryB,
    colorA: [42, 92, 180, 255],
    colorB: [228, 122, 76, 255],
    transferCurve: state.contourCurve,
  });
  const freeformOverlay = renderFreeformGradient({
    width: w,
    height: h,
    target: contourBase.imageData,
    method: state.freeformMethod,
    harmonicIterations: 12,
    seeds: [
      { kind: "point", x: 8, y: 10, color: [42, 92, 180, 140] },
      { kind: "point", x: 40, y: 10, color: [228, 122, 76, 140] },
    ],
  });

  const sampleGrid = (rgba: Uint8ClampedArray): PreviewSwatchCell[] => {
    const cells: PreviewSwatchCell[] = [];
    for (let cy = 0; cy < 4; cy++) {
      for (let cx = 0; cx < 12; cx++) {
        const px = cx * 4 + 2;
        const py = cy * 5 + 2;
        const off = (py * w + px) * 4;
        const a = (rgba[off + 3]! / 255).toFixed(2);
        cells.push({
          x: cx * 4,
          y: cy * 5,
          fill: `rgba(${rgba[off]},${rgba[off + 1]},${rgba[off + 2]},${a})`,
        });
      }
    }
    return cells;
  };

  return {
    rasterCells: sampleGrid(rasterRes.imageData.data),
    contourCells: sampleGrid(freeformOverlay.imageData.data),
    affectedRasterPixels: rasterRes.affectedPixelCount,
  };
}

export function StudioRasterFreeformGradientSection({
  value,
  onChange,
}: StudioRasterFreeformGradientSectionProps): ReactElement {
  const [internalState, setInternalState] = useState<StudioRasterFreeformGradientUiState>(
    DEFAULT_STUDIO_RASTER_FREEFORM_UI_STATE,
  );
  const current = value ?? internalState;

  const update = (patch: Partial<StudioRasterFreeformGradientUiState>): void => {
    const next: StudioRasterFreeformGradientUiState = { ...current, ...patch };
    if (value === undefined) {
      setInternalState(next);
    }
    onChange?.(next);
  };

  const preview = useMemo(() => buildDeterministicPreview(current), [current]);

  return (
    <div className="space-y-2 border-t border-line/50 pt-2.5 [word-break:keep-all]">
      <details className="rounded-xl border border-line bg-card/55 p-2.5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span>래스터 · 만화 망점 · 등고선 채우기</span>
          <span className="tabular-nums text-[0.72rem] text-fg-3">
            {OUTPUT_MODE_ITEMS.find((item) => item.id === current.outputMode)?.label}
          </span>
        </summary>

        <div className="space-y-2.5 pt-2">
          {/* 실시간 결정적 48×20 픽셀 엔진 미리보기 */}
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-line/70 bg-canvas/80 p-2">
            <div>
              <p className="mb-1 flex items-center justify-between text-xs text-fg-3">
                <span>래스터 결과</span>
                <span className="tabular-nums">{preview.affectedRasterPixels}px</span>
              </p>
              <svg
                viewBox="0 0 48 20"
                role="img"
                aria-label="래스터 그라데이션 픽셀 미리보기"
                className="h-7 w-full rounded border border-line/60"
              >
                {preview.rasterCells.map((cell, i) => (
                  <rect key={i} x={cell.x} y={cell.y} width={4} height={5} fill={cell.fill} />
                ))}
              </svg>
            </div>
            <div>
              <p className="mb-1 flex items-center justify-between text-xs text-fg-3">
                <span>자유형·등고선</span>
                <span className="tabular-nums">
                  {Math.round(evaluateContourTransferCurve(0.5, current.contourCurve) * 100)}%
                </span>
              </p>
              <svg
                viewBox="0 0 48 20"
                role="img"
                aria-label="자유형 및 등고선 채우기 픽셀 미리보기"
                className="h-7 w-full rounded border border-line/60"
              >
                {preview.contourCells.map((cell, i) => (
                  <rect key={i} x={cell.x} y={cell.y} width={4} height={5} fill={cell.fill} />
                ))}
              </svg>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-[0.72rem] font-semibold text-fg-3">래스터 출력 방식</p>
            <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="래스터 그라데이션 출력 방식">
              {OUTPUT_MODE_ITEMS.map((mode) => {
                const active = current.outputMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    title={mode.tip}
                    aria-pressed={active}
                    onClick={() => update({ outputMode: mode.id })}
                    className={cn(
                      HIT_BUTTON_CLASS,
                      active
                        ? "border-accent bg-accent-soft/60 text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    {mode.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span>전개 형태</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="전개 형태">
              {SHAPE_ITEMS.map((shape) => (
                <StudioToggleChip
                  key={shape.id}
                  active={current.shape === shape.id}
                  onClick={() => update({ shape: shape.id })}
                >
                  {shape.label}
                </StudioToggleChip>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fg-2">
            <span>끝단 반복</span>
            <div className="flex flex-wrap gap-1" role="group" aria-label="끝단 반복">
              {REPEAT_ITEMS.map((rep) => (
                <StudioToggleChip
                  key={rep.id}
                  active={current.repeatMode === rep.id}
                  onClick={() => update({ repeatMode: rep.id })}
                >
                  {rep.label}
                </StudioToggleChip>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
            <span>계단 현상 완화 (미세 분산)</span>
            <StudioToggleChip
              active={current.dither}
              onClick={() => update({ dither: !current.dither })}
              title="8비트 밴딩 현상을 줄이기 위해 4×4 Bayer 순서 디더링을 적용합니다."
            >
              {current.dither ? "미세 분산 켜짐" : "미세 분산 꺼짐"}
            </StudioToggleChip>
          </div>

          {current.outputMode === "manga-halftone" && (
            <div className="space-y-2 rounded-lg border border-line/70 bg-card/80 p-2">
              <StudioSliderRow
                label="망점 선수"
                min={20}
                max={100}
                step={5}
                value={current.halftoneLpi}
                onChange={(halftoneLpi) => update({ halftoneLpi })}
                readout={`${current.halftoneLpi}선`}
              />
              <StudioSliderRow
                label="망점 각도"
                min={0}
                max={90}
                step={15}
                value={current.halftoneAngleDeg}
                onChange={(halftoneAngleDeg) => update({ halftoneAngleDeg })}
                readout={`${current.halftoneAngleDeg}°`}
              />
            </div>
          )}

          <details className="rounded-lg border border-line/70 bg-card/70 px-2.5 py-1.5">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-semibold text-fg-2 transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              <span>자유형 그라데이션 · 등고선 채우기</span>
              <span className="tabular-nums text-[0.72rem] text-fg-3">
                {current.freeformMethod === "harmonic" ? "조화 보간" : "역거리 가중"}
              </span>
            </summary>

            <div className="space-y-2 pt-1.5 pb-1">
              <div className="space-y-1">
                <p className="text-[0.72rem] font-semibold text-fg-3">자유형 그라데이션 보간법</p>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="자유형 그라데이션 보간법">
                  <button
                    type="button"
                    aria-pressed={current.freeformMethod === "shepard"}
                    onClick={() => update({ freeformMethod: "shepard" })}
                    className={cn(
                      HIT_BUTTON_CLASS,
                      current.freeformMethod === "shepard"
                        ? "border-accent bg-accent-soft/60 text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    역거리 가중
                  </button>
                  <button
                    type="button"
                    aria-pressed={current.freeformMethod === "harmonic"}
                    onClick={() => update({ freeformMethod: "harmonic" })}
                    className={cn(
                      HIT_BUTTON_CLASS,
                      current.freeformMethod === "harmonic"
                        ? "border-accent bg-accent-soft/60 text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                    )}
                  >
                    조화 보간
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-[0.72rem] font-semibold text-fg-3">등고선 채우기 전이 곡선</p>
                <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="등고선 채우기 전이 곡선">
                  {CONTOUR_CURVE_ITEMS.map((curve) => {
                    const active = current.contourCurve === curve.id;
                    return (
                      <button
                        key={curve.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => update({ contourCurve: curve.id })}
                        className={cn(
                          HIT_BUTTON_CLASS,
                          active
                            ? "border-accent bg-accent-soft/60 text-fg"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                        )}
                      >
                        {curve.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}
