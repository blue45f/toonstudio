/**
 * CSP 원근·사다리꼴 왜곡(`editactiontransformtrapezoid` / `isopodtrapezoid` / `transformfree`) 및
 * `N×M` 래스터 메쉬 변형(`editactiontransformmesh`) 통합 한국어 인스펙터 섹션.
 *
 * `imageSrc`와 `onCommitImageSrc`가 주어지면 `applyCornerPinTransform` 및 `applyRasterMeshTransform`을
 * 오프스크린 캔버스에서 직접 실행하여 변형된 PNG Data-URL을 커밋한다.
 *
 * Clean-room implementation based on Ghidra/REA behavioral specification:
 * - evidence_id: ev_af42bc7907f5e98eacfcb3b02c9c7f14cbf6c06dd0234d34033ff0059556946b
 * - evidence_id: ev_0c6a677d38f821a7c782b943662be657510c27ee397e744fa128f63a1ca2d1fa
 */

import { Grid3X3, MoveDiagonal2, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { runStudioRasterDataUrlProcessor } from "../filter/studio-raster-dataurl-runner";

import {
  applyCornerPinTransform,
  constrainIsopodTrapezoidQuad,
  constrainTrapezoidQuad,
  createIdentityCornerPinQuad,
  validateCornerPinQuad,
} from "./studio-corner-pin-transform";
import {
  applyRasterMeshPreset,
  applyRasterMeshTransform,
  createRasterMeshLattice,
  getRasterMeshNode,
  moveRasterMeshNode,
  RASTER_MESH_GRID_MAX,
  RASTER_MESH_GRID_MIN,
  RASTER_MESH_PRESET_IDS,
  RASTER_MESH_PRESET_LABELS,
  resetRasterMeshLattice,
} from "./studio-raster-mesh-transform";

import type {
  CornerPinDistortMode,
  CornerPinKey,
  CornerPinQuad,
  TrapezoidAxis,
} from "./studio-corner-pin-transform";
import type {
  RasterMeshLattice,
  RasterMeshPresetId,
} from "./studio-raster-mesh-transform";

import { cn } from "@/shared/lib/utils";

export interface StudioAdvancedRasterTransformSectionProps {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly imageSrc?: string;
  readonly onCommitImageSrc?: (nextSrc: string) => void;
  readonly disabled?: boolean;
  readonly onApplyCornerPin?: (quad: CornerPinQuad, mode: CornerPinDistortMode) => void;
  readonly onApplyMeshTransform?: (lattice: RasterMeshLattice) => void;
  readonly className?: string;
}

const CORNER_META: readonly { readonly key: CornerPinKey; readonly label: string }[] = [
  { key: "topLeft", label: "좌상단" },
  { key: "topRight", label: "우상단" },
  { key: "bottomRight", label: "우하단" },
  { key: "bottomLeft", label: "좌하단" },
];

const DISTORT_MODES: readonly { readonly id: CornerPinDistortMode; readonly label: string }[] = [
  { id: "free", label: "자유 왜곡" },
  { id: "trapezoid", label: "사다리꼴" },
  { id: "isopod-trapezoid", label: "등변사다리꼴" },
];

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const BUTTON_BASE = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
);

function scaleQuadToNatural(
  quad: CornerPinQuad,
  uiW: number,
  uiH: number,
  natW: number,
  natH: number,
): CornerPinQuad {
  const sx = Math.max(1, natW - 1) / Math.max(1, uiW - 1);
  const sy = Math.max(1, natH - 1) / Math.max(1, uiH - 1);
  return {
    topLeft: { x: quad.topLeft.x * sx, y: quad.topLeft.y * sy },
    topRight: { x: quad.topRight.x * sx, y: quad.topRight.y * sy },
    bottomRight: { x: quad.bottomRight.x * sx, y: quad.bottomRight.y * sy },
    bottomLeft: { x: quad.bottomLeft.x * sx, y: quad.bottomLeft.y * sy },
  };
}

function scaleLatticeToNatural(
  lattice: RasterMeshLattice,
  natW: number,
  natH: number,
): RasterMeshLattice {
  const sx = Math.max(1, natW - 1) / Math.max(1, lattice.width - 1);
  const sy = Math.max(1, natH - 1) / Math.max(1, lattice.height - 1);
  return {
    width: natW,
    height: natH,
    rows: lattice.rows,
    cols: lattice.cols,
    nodes: lattice.nodes.map((node) => ({
      ...node,
      restX: node.restX * sx,
      restY: node.restY * sy,
      x: node.x * sx,
      y: node.y * sy,
    })),
  };
}

export function StudioAdvancedRasterTransformSection({
  imageWidth,
  imageHeight,
  imageSrc,
  onCommitImageSrc,
  disabled = false,
  onApplyCornerPin,
  onApplyMeshTransform,
  className,
}: StudioAdvancedRasterTransformSectionProps) {
  const safeW = Math.max(2, Math.trunc(imageWidth));
  const safeH = Math.max(2, Math.trunc(imageHeight));

  const [distortMode, setDistortMode] = useState<CornerPinDistortMode>("free");
  const [trapezoidAxis, setTrapezoidAxis] = useState<TrapezoidAxis>("horizontal");
  const [quad, setQuad] = useState<CornerPinQuad>(() =>
    createIdentityCornerPinQuad(safeW, safeH),
  );

  const [meshRows, setMeshRows] = useState<number>(4);
  const [meshCols, setMeshCols] = useState<number>(4);
  const [presetStrengthPct, setPresetStrengthPct] = useState<number>(50);
  const [selectedRow, setSelectedRow] = useState<number>(1);
  const [selectedCol, setSelectedCol] = useState<number>(1);
  const [lattice, setLattice] = useState<RasterMeshLattice>(() =>
    createRasterMeshLattice(safeW, safeH, 4, 4),
  );
  const [busy, setBusy] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const quadValidation = useMemo(() => validateCornerPinQuad(quad), [quad]);
  const controlsLocked = disabled || busy;

  const updateCornerCoordinate = (
    corner: CornerPinKey,
    coord: "x" | "y",
    rawValue: number,
  ) => {
    if (!Number.isFinite(rawValue)) return;
    const currentPt = quad[corner];
    const nextPt =
      coord === "x" ? { x: rawValue, y: currentPt.y } : { x: currentPt.x, y: rawValue };

    if (distortMode === "trapezoid") {
      setQuad(constrainTrapezoidQuad(quad, corner, nextPt, trapezoidAxis));
      return;
    }
    if (distortMode === "isopod-trapezoid") {
      setQuad(constrainIsopodTrapezoidQuad(quad, corner, nextPt, trapezoidAxis));
      return;
    }
    setQuad({ ...quad, [corner]: nextPt });
  };

  const handleResizeMeshGrid = (nextRows: number, nextCols: number) => {
    const r = Math.min(RASTER_MESH_GRID_MAX, Math.max(RASTER_MESH_GRID_MIN, nextRows));
    const c = Math.min(RASTER_MESH_GRID_MAX, Math.max(RASTER_MESH_GRID_MIN, nextCols));
    setMeshRows(r);
    setMeshCols(c);
    setSelectedRow((prev) => Math.min(prev, r - 1));
    setSelectedCol((prev) => Math.min(prev, c - 1));
    setLattice(createRasterMeshLattice(safeW, safeH, r, c));
  };

  const handleApplyPreset = (presetId: RasterMeshPresetId) => {
    const base = createRasterMeshLattice(safeW, safeH, meshRows, meshCols);
    setLattice(applyRasterMeshPreset(base, presetId, presetStrengthPct / 100));
  };

  const handleCommitCornerPin = async () => {
    onApplyCornerPin?.(quad, distortMode);
    if (!imageSrc || !onCommitImageSrc) return;
    setBusy(true);
    setStatusNote(null);
    try {
      const nextSrc = await runStudioRasterDataUrlProcessor(imageSrc, (rgba, width, height) =>
        applyCornerPinTransform(
          { data: rgba, width, height },
          scaleQuadToNatural(quad, safeW, safeH, width, height),
        ),
      );
      onCommitImageSrc(nextSrc);
      setStatusNote("원근·사다리꼴 변형을 이미지에 반영했어요.");
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "원근 변형 처리 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  };

  const handleCommitMesh = async () => {
    onApplyMeshTransform?.(lattice);
    if (!imageSrc || !onCommitImageSrc) return;
    setBusy(true);
    setStatusNote(null);
    try {
      const nextSrc = await runStudioRasterDataUrlProcessor(imageSrc, (rgba, width, height) =>
        applyRasterMeshTransform(
          { data: rgba, width, height },
          scaleLatticeToNatural(lattice, width, height),
        ),
      );
      onCommitImageSrc(nextSrc);
      setStatusNote("메쉬 변형을 이미지에 반영했어요.");
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : "메쉬 변형 처리 중 오류가 발생했어요.");
    } finally {
      setBusy(false);
    }
  };

  const activeNode =
    getRasterMeshNode(lattice, selectedRow, selectedCol) ?? lattice.nodes[0]!;

  return (
    <section
      aria-label="고급 래스터 변형 도구"
      data-studio-advanced-raster-transform="true"
      className={cn(
        "flex flex-col gap-2.5 rounded-xl border border-line bg-panel/90 p-3 text-xs text-fg [word-break:keep-all]",
        className,
      )}
    >
      {statusNote ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md border border-accent/35 bg-accent-soft/30 px-2.5 py-1.5 text-xs text-fg"
        >
          {statusNote}
        </p>
      ) : null}

      <details className="group rounded-lg border border-line/75 bg-card/45 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <MoveDiagonal2 size={15} aria-hidden />
            <span>원근·사다리꼴 변형</span>
          </span>
          <span
            data-quad-valid={quadValidation.valid ? "true" : "false"}
            className={cn(
              "rounded border px-2 py-0.5 text-xs tabular-nums",
              quadValidation.valid
                ? "border-good/35 bg-good/10 text-good"
                : "border-bad/40 bg-bad/10 text-bad",
            )}
          >
            {quadValidation.valid ? "유효한 볼록 사각형" : "교차·오목 사각형 경고"}
          </span>
        </summary>

        <div className="mt-2.5 flex flex-col gap-2.5 px-1">
          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="왜곡 방식 선택">
            {DISTORT_MODES.map((mode) => {
              const active = distortMode === mode.id;
              return (
                <button
                  key={mode.id}
                  type="button"
                  disabled={controlsLocked}
                  aria-pressed={active}
                  onClick={() => setDistortMode(mode.id)}
                  className={cn(
                    BUTTON_BASE,
                    active
                      ? "border-accent bg-accent-soft/65 text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised",
                  )}
                >
                  {mode.label}
                </button>
              );
            })}
          </div>

          {distortMode !== "free" ? (
            <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="사다리꼴 대칭 축">
              <button
                type="button"
                disabled={controlsLocked}
                aria-pressed={trapezoidAxis === "horizontal"}
                onClick={() => setTrapezoidAxis("horizontal")}
                className={cn(
                  BUTTON_BASE,
                  trapezoidAxis === "horizontal"
                    ? "border-cool/60 bg-cool/15 text-cool"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                가로 평행축
              </button>
              <button
                type="button"
                disabled={controlsLocked}
                aria-pressed={trapezoidAxis === "vertical"}
                onClick={() => setTrapezoidAxis("vertical")}
                className={cn(
                  BUTTON_BASE,
                  trapezoidAxis === "vertical"
                    ? "border-cool/60 bg-cool/15 text-cool"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                세로 평행축
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            {CORNER_META.map(({ key, label }) => {
              const pt = quad[key];
              return (
                <div
                  key={key}
                  className="flex flex-col gap-1 rounded-md border border-line/70 bg-card/70 p-2"
                >
                  <span className="text-xs font-semibold text-fg-2">{label}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-0.5 text-xs text-fg-3">
                      <span>가로</span>
                      <input
                        type="number"
                        aria-label={`${label} X`}
                        disabled={controlsLocked}
                        value={Math.round(pt.x)}
                        onChange={(e) =>
                          updateCornerCoordinate(key, "x", Number(e.target.value))
                        }
                        className="min-h-11 rounded border border-line bg-panel px-2 text-xs font-medium tabular-nums text-fg"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 text-xs text-fg-3">
                      <span>세로</span>
                      <input
                        type="number"
                        aria-label={`${label} Y`}
                        disabled={controlsLocked}
                        value={Math.round(pt.y)}
                        onChange={(e) =>
                          updateCornerCoordinate(key, "y", Number(e.target.value))
                        }
                        className="min-h-11 rounded border border-line bg-panel px-2 text-xs font-medium tabular-nums text-fg"
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => setQuad(createIdentityCornerPinQuad(safeW, safeH))}
              className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
            >
              <RotateCcw size={13} aria-hidden />
              사각형 초기화
            </button>
            <button
              type="button"
              disabled={controlsLocked || !quadValidation.valid}
              onClick={() => {
                void handleCommitCornerPin();
              }}
              className={cn(
                BUTTON_BASE,
                "flex-1 border-accent bg-accent text-on-accent hover:brightness-105",
              )}
            >
              원근 변형 적용
            </button>
          </div>
        </div>
      </details>

      <details className="group rounded-lg border border-line/75 bg-card/45 p-2">
        <summary
          className={cn(
            "flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 font-semibold text-fg hover:bg-raised/60",
            TRANSITION_CLASS,
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Grid3X3 size={15} aria-hidden />
            <span>메쉬 변형</span>
          </span>
          <span className="rounded border border-line bg-panel px-2 py-0.5 text-xs tabular-nums text-fg-2">
            {lattice.rows}×{lattice.cols} 격자
          </span>
        </summary>

        <div className="mt-2.5 flex flex-col gap-2.5 px-1">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span className="tabular-nums">가로 행 수 ({meshRows})</span>
              <input
                type="number"
                aria-label="메쉬 행 수"
                min={RASTER_MESH_GRID_MIN}
                max={RASTER_MESH_GRID_MAX}
                disabled={controlsLocked}
                value={meshRows}
                onChange={(e) => handleResizeMeshGrid(Number(e.target.value), meshCols)}
                className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-fg-2">
              <span className="tabular-nums">세로 열 수 ({meshCols})</span>
              <input
                type="number"
                aria-label="메쉬 열 수"
                min={RASTER_MESH_GRID_MIN}
                max={RASTER_MESH_GRID_MAX}
                disabled={controlsLocked}
                value={meshCols}
                onChange={(e) => handleResizeMeshGrid(meshRows, Number(e.target.value))}
                className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1 text-xs text-fg-2">
            <span className="flex justify-between tabular-nums">
              <span>프리셋 곡률 강도</span>
              <span>{presetStrengthPct}%</span>
            </span>
            <input
              type="range"
              aria-label="프리셋 곡률 강도"
              min={-100}
              max={100}
              step={5}
              disabled={controlsLocked}
              value={presetStrengthPct}
              onChange={(e) => setPresetStrengthPct(Number(e.target.value))}
              className="min-h-11 accent-accent"
            />
          </label>

          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="메쉬 변형 프리셋">
            {RASTER_MESH_PRESET_IDS.map((presetId) => (
              <button
                key={presetId}
                type="button"
                disabled={controlsLocked}
                onClick={() => handleApplyPreset(presetId)}
                className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
              >
                {RASTER_MESH_PRESET_LABELS[presetId]}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-line/70 bg-card/70 p-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-xs text-fg-2">
                <span>선택 제어점 행</span>
                <select
                  aria-label="선택 제어점 행"
                  disabled={controlsLocked}
                  value={activeNode.row}
                  onChange={(e) => setSelectedRow(Number(e.target.value))}
                  className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
                >
                  {Array.from({ length: lattice.rows }, (_, idx) => (
                    <option key={idx} value={idx}>
                      {idx + 1}행
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-fg-2">
                <span>선택 제어점 열</span>
                <select
                  aria-label="선택 제어점 열"
                  disabled={controlsLocked}
                  value={activeNode.col}
                  onChange={(e) => setSelectedCol(Number(e.target.value))}
                  className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
                >
                  {Array.from({ length: lattice.cols }, (_, idx) => (
                    <option key={idx} value={idx}>
                      {idx + 1}열
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-0.5 text-xs text-fg-3">
                <span className="tabular-nums">
                  제어점 ({activeNode.row + 1},{activeNode.col + 1}) 가로
                </span>
                <input
                  type="number"
                  aria-label="선택 제어점 X"
                  disabled={controlsLocked}
                  value={Math.round(activeNode.x)}
                  onChange={(e) =>
                    setLattice(
                      moveRasterMeshNode(
                        lattice,
                        activeNode.row,
                        activeNode.col,
                        Number(e.target.value),
                        activeNode.y,
                      ),
                    )
                  }
                  className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-xs text-fg-3">
                <span className="tabular-nums">
                  제어점 ({activeNode.row + 1},{activeNode.col + 1}) 세로
                </span>
                <input
                  type="number"
                  aria-label="선택 제어점 Y"
                  disabled={controlsLocked}
                  value={Math.round(activeNode.y)}
                  onChange={(e) =>
                    setLattice(
                      moveRasterMeshNode(
                        lattice,
                        activeNode.row,
                        activeNode.col,
                        activeNode.x,
                        Number(e.target.value),
                      ),
                    )
                  }
                  className="min-h-11 rounded border border-line bg-panel px-2 text-xs tabular-nums text-fg"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => setLattice(resetRasterMeshLattice(lattice))}
              className={cn(BUTTON_BASE, "border-line bg-card text-fg-2 hover:bg-raised")}
            >
              <RotateCcw size={13} aria-hidden />
              격자 초기화
            </button>
            <button
              type="button"
              disabled={controlsLocked}
              onClick={() => {
                void handleCommitMesh();
              }}
              className={cn(
                BUTTON_BASE,
                "flex-1 border-accent bg-accent text-on-accent hover:brightness-105",
              )}
            >
              메쉬 변형 적용
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
