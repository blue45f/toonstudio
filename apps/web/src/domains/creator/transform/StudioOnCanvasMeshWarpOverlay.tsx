/**
 * 메인 캔버스 직접 조작 메쉬(2×2~8×8)·코너핀(4점) 변형 오버레이.
 *
 * 인스펙터 미니 프리뷰 대신 실제 캔버스 좌표계 위에서 격자 제어점과 원근 모서리 핸들을
 * 포인터 드래그 및 키보드 방향키로 직접 조작하고, 복수 레이어 동시 변형을 확정한다.
 * `React.lazy` 동적 임포트에 맞춘 독립 UI 모듈이다.
 */

import { Check, Grid3X3, Layers, MoveDiagonal2, RotateCcw, X } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import {
  constrainIsopodTrapezoidQuad,
  constrainTrapezoidQuad,
  validateCornerPinQuad,
  type CornerPinDistortMode,
  type CornerPinKey,
  type CornerPinQuad,
  type TrapezoidAxis,
} from "./studio-corner-pin-transform";
import {
  applyRasterMeshPreset,
  moveRasterMeshNode,
  RASTER_MESH_PRESET_IDS,
  RASTER_MESH_PRESET_LABELS,
  resetRasterMeshLattice,
  type RasterMeshLattice,
  type RasterMeshPresetId,
} from "./studio-raster-mesh-transform";

import { cn } from "@/shared/lib/utils";

import type { KeyboardEvent, PointerEvent, ReactElement } from "react";

export type OnCanvasWarpOverlayMode = "mesh" | "corner-pin";

export interface OnCanvasWarpViewportFrame {
  readonly leftPx: number;
  readonly topPx: number;
  readonly widthPx: number;
  readonly heightPx: number;
  /** 문서(자연 픽셀) → 화면(px) 배율. */
  readonly zoomScale: number;
}

export interface StudioOnCanvasMeshWarpOverlayProps {
  readonly mode: OnCanvasWarpOverlayMode;
  readonly frame: OnCanvasWarpViewportFrame;
  /** 동시에 변형할 대상 레이어 개수(1 이상). */
  readonly targetLayerCount?: number;
  readonly lattice?: RasterMeshLattice;
  readonly onLatticeChange?: (nextLattice: RasterMeshLattice) => void;
  readonly cornerQuad?: CornerPinQuad;
  readonly cornerDistortMode?: CornerPinDistortMode;
  readonly trapezoidAxis?: TrapezoidAxis;
  readonly onCornerQuadChange?: (nextQuad: CornerPinQuad) => void;
  readonly onReset?: () => void;
  readonly onApply?: () => void;
  readonly onCancel?: () => void;
  readonly busy?: boolean;
  readonly className?: string;
}

type ActiveHandle =
  | { readonly kind: "mesh"; readonly row: number; readonly col: number }
  | { readonly kind: "corner"; readonly key: CornerPinKey };

const CORNER_KEYS: readonly { readonly key: CornerPinKey; readonly label: string }[] = [
  { key: "topLeft", label: "좌상단 모서리" },
  { key: "topRight", label: "우상단 모서리" },
  { key: "bottomRight", label: "우하단 모서리" },
  { key: "bottomLeft", label: "좌하단 모서리" },
];

const TRANSITION_CLASS =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none";

const TOOLBAR_BUTTON_CLASS = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold [word-break:keep-all] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLASS,
);

function clampViewportScale(scale: number): number {
  return Number.isFinite(scale) && scale > 0.01 ? scale : 1;
}

export function StudioOnCanvasMeshWarpOverlay({
  mode,
  frame,
  targetLayerCount = 1,
  lattice,
  onLatticeChange,
  cornerQuad,
  cornerDistortMode = "free",
  trapezoidAxis = "horizontal",
  onCornerQuadChange,
  onReset,
  onApply,
  onCancel,
  busy = false,
  className,
}: StudioOnCanvasMeshWarpOverlayProps): ReactElement {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [activeHandle, setActiveHandle] = useState<ActiveHandle | null>(null);
  const [dragging, setDragging] = useState(false);

  const scale = clampViewportScale(frame.zoomScale);
  const quadValidation = useMemo(
    () => (cornerQuad ? validateCornerPinQuad(cornerQuad) : null),
    [cornerQuad],
  );
  const canApply = !busy && (mode !== "corner-pin" || (quadValidation?.valid ?? true));

  const updateCornerPoint = useCallback(
    (key: CornerPinKey, nextX: number, nextY: number) => {
      if (!cornerQuad || !onCornerQuadChange) return;
      const point = { x: Math.round(nextX * 10) / 10, y: Math.round(nextY * 10) / 10 };
      if (cornerDistortMode === "trapezoid") {
        onCornerQuadChange(constrainTrapezoidQuad(cornerQuad, key, point, trapezoidAxis));
        return;
      }
      if (cornerDistortMode === "isopod-trapezoid") {
        onCornerQuadChange(constrainIsopodTrapezoidQuad(cornerQuad, key, point, trapezoidAxis));
        return;
      }
      onCornerQuadChange({ ...cornerQuad, [key]: point });
    },
    [cornerDistortMode, cornerQuad, onCornerQuadChange, trapezoidAxis],
  );

  const clientToDocPoint = useCallback(
    (clientX: number, clientY: number): { readonly x: number; readonly y: number } => {
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale,
      };
    },
    [scale],
  );

  const handlePointerDown = useCallback(
    (handle: ActiveHandle, event: PointerEvent<HTMLButtonElement>) => {
      if (busy) return;
      event.stopPropagation();
      setActiveHandle(handle);
      setDragging(true);
      if (typeof event.currentTarget.setPointerCapture === "function") {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // 합성 이벤트 환경에서는 포인터 캡처를 생략한다.
        }
      }
    },
    [busy],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLButtonElement>) => {
      if (!dragging || !activeHandle || busy) return;
      const pt = clientToDocPoint(event.clientX, event.clientY);
      if (activeHandle.kind === "mesh" && lattice && onLatticeChange) {
        onLatticeChange(moveRasterMeshNode(lattice, activeHandle.row, activeHandle.col, pt.x, pt.y));
      } else if (activeHandle.kind === "corner") {
        updateCornerPoint(activeHandle.key, pt.x, pt.y);
      }
    },
    [activeHandle, busy, clientToDocPoint, dragging, lattice, onLatticeChange, updateCornerPoint],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    setDragging(false);
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // 포인터 캡처가 없는 합성 이벤트 무시.
      }
    }
  }, []);

  const handleHandleKeyDown = useCallback(
    (handle: ActiveHandle, event: KeyboardEvent<HTMLButtonElement>) => {
      if (busy) return;
      const step = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (event.key === "ArrowLeft") dx = -step;
      else if (event.key === "ArrowRight") dx = step;
      else if (event.key === "ArrowUp") dy = -step;
      else if (event.key === "ArrowDown") dy = step;
      else if (event.key === "Escape") {
        event.preventDefault();
        onCancel?.();
        return;
      } else {
        return;
      }
      event.preventDefault();
      setActiveHandle(handle);
      if (handle.kind === "mesh" && lattice && onLatticeChange) {
        const node = lattice.nodes[handle.row * lattice.cols + handle.col];
        if (!node) return;
        onLatticeChange(
          moveRasterMeshNode(lattice, handle.row, handle.col, node.x + dx, node.y + dy),
        );
      } else if (handle.kind === "corner" && cornerQuad) {
        const pt = cornerQuad[handle.key];
        updateCornerPoint(handle.key, pt.x + dx, pt.y + dy);
      }
    },
    [busy, cornerQuad, lattice, onCancel, onLatticeChange, updateCornerPoint],
  );

  const handlePresetClick = useCallback(
    (preset: RasterMeshPresetId) => {
      if (!lattice || !onLatticeChange || busy) return;
      onLatticeChange(applyRasterMeshPreset(lattice, preset, 0.5));
    },
    [busy, lattice, onLatticeChange],
  );

  const handleResetClick = useCallback(() => {
    if (busy) return;
    if (mode === "mesh" && lattice && onLatticeChange) {
      onLatticeChange(resetRasterMeshLattice(lattice));
    }
    onReset?.();
  }, [busy, lattice, mode, onLatticeChange, onReset]);

  const meshLines = useMemo(() => {
    if (mode !== "mesh" || !lattice) return [] as readonly { readonly id: string; readonly d: string }[];
    const lines: { readonly id: string; readonly d: string }[] = [];
    for (let r = 0; r < lattice.rows; r += 1) {
      const segs: string[] = [];
      for (let c = 0; c < lattice.cols; c += 1) {
        const node = lattice.nodes[r * lattice.cols + c];
        if (!node) continue;
        segs.push(`${c === 0 ? "M" : "L"} ${(node.x * scale).toFixed(1)} ${(node.y * scale).toFixed(1)}`);
      }
      lines.push({ id: `row-${r}`, d: segs.join(" ") });
    }
    for (let c = 0; c < lattice.cols; c += 1) {
      const segs: string[] = [];
      for (let r = 0; r < lattice.rows; r += 1) {
        const node = lattice.nodes[r * lattice.cols + c];
        if (!node) continue;
        segs.push(`${r === 0 ? "M" : "L"} ${(node.x * scale).toFixed(1)} ${(node.y * scale).toFixed(1)}`);
      }
      lines.push({ id: `col-${c}`, d: segs.join(" ") });
    }
    return lines;
  }, [lattice, mode, scale]);

  const quadPolygonPoints = useMemo(() => {
    if (mode !== "corner-pin" || !cornerQuad) return "";
    return CORNER_KEYS.map(({ key }) => {
      const pt = cornerQuad[key];
      return `${(pt.x * scale).toFixed(1)},${(pt.y * scale).toFixed(1)}`;
    }).join(" ");
  }, [cornerQuad, mode, scale]);

  const safeLayerCount = Math.max(1, Math.trunc(targetLayerCount));

  return (
    <div
      data-testid="studio-on-canvas-mesh-warp-overlay"
      role="region"
      aria-label={mode === "mesh" ? "캔버스 메쉬 변형 오버레이" : "캔버스 원근 변형 오버레이"}
      className={cn(
        "pointer-events-none fixed inset-0 z-30 select-none [word-break:keep-all]",
        className,
      )}
    >
      {/* 상단 컨텍스트 액션 바 */}
      <div className="pointer-events-auto mx-auto mt-3 flex w-fit flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel/95 p-2 shadow-sm">
        <span className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg">
          {mode === "mesh" ? (
            <Grid3X3 size={15} className="text-accent" aria-hidden />
          ) : (
            <MoveDiagonal2 size={15} className="text-accent" aria-hidden />
          )}
          <span>{mode === "mesh" ? "캔버스 메쉬 변형" : "캔버스 원근 변형"}</span>
        </span>

        <span
          data-testid="warp-target-layer-badge"
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-xs font-medium text-fg-2 tabular-nums"
        >
          <Layers size={14} aria-hidden />
          <span>{safeLayerCount > 1 ? `레이어 ${safeLayerCount}개 동시 변형` : "단일 레이어 변형"}</span>
        </span>

        {mode === "mesh" && lattice ? (
          <div className="flex items-center gap-1" role="group" aria-label="메쉬 프리셋 빠른 적용">
            {RASTER_MESH_PRESET_IDS.map((presetId) => (
              <button
                key={presetId}
                type="button"
                disabled={busy}
                onClick={() => handlePresetClick(presetId)}
                className={cn(
                  TOOLBAR_BUTTON_CLASS,
                  "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {RASTER_MESH_PRESET_LABELS[presetId]}
              </button>
            ))}
          </div>
        ) : null}

        {mode === "corner-pin" && quadValidation && !quadValidation.valid ? (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex min-h-11 items-center rounded-lg border border-bad/40 bg-bad/10 px-2.5 text-xs font-semibold text-bad"
          >
            교차 또는 오목 사각형 경고
          </span>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={handleResetClick}
          className={cn(TOOLBAR_BUTTON_CLASS, "border-line bg-card text-fg-2 hover:bg-raised")}
        >
          <RotateCcw size={14} aria-hidden />
          <span>초기화</span>
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          className={cn(TOOLBAR_BUTTON_CLASS, "border-line bg-card text-fg-2 hover:bg-raised")}
        >
          <X size={14} aria-hidden />
          <span>취소</span>
        </button>

        <button
          type="button"
          disabled={!canApply}
          onClick={onApply}
          className={cn(
            TOOLBAR_BUTTON_CLASS,
            "border-accent bg-accent text-on-accent hover:opacity-95",
          )}
        >
          <Check size={14} aria-hidden />
          <span>변형 적용</span>
        </button>
      </div>

      {/* 문서 프레임 기준 SVG 와이어프레임 + 44px 터치 핸들 */}
      <div
        ref={overlayRef}
        style={{
          left: `${frame.leftPx}px`,
          top: `${frame.topPx}px`,
          width: `${Math.max(1, frame.widthPx)}px`,
          height: `${Math.max(1, frame.heightPx)}px`,
        }}
        className="pointer-events-none absolute"
      >
        <svg
          width={Math.max(1, frame.widthPx)}
          height={Math.max(1, frame.heightPx)}
          className="overflow-visible"
          aria-hidden="true"
        >
          {mode === "mesh"
            ? meshLines.map((line) => (
                <path
                  key={line.id}
                  d={line.d}
                  className="fill-none stroke-accent/80"
                  strokeWidth={1.5}
                />
              ))
            : null}

          {mode === "corner-pin" && quadPolygonPoints ? (
            <polygon
              points={quadPolygonPoints}
              className={cn(
                "fill-accent-soft/15",
                quadValidation?.valid === false ? "stroke-bad" : "stroke-accent",
              )}
              strokeWidth={1.75}
            />
          ) : null}
        </svg>

        {mode === "mesh" && lattice
          ? lattice.nodes.map((node) => {
              const isSelected =
                activeHandle?.kind === "mesh" &&
                activeHandle.row === node.row &&
                activeHandle.col === node.col;
              const moved =
                Math.abs(node.x - node.restX) > 0.05 || Math.abs(node.y - node.restY) > 0.05;
              return (
                <button
                  key={`mesh-${node.row}-${node.col}`}
                  type="button"
                  disabled={busy}
                  aria-label={`메쉬 제어점 ${node.row + 1}행 ${node.col + 1}열 (${Math.round(node.x)}, ${Math.round(node.y)})`}
                  data-mesh-handle={`${node.row}-${node.col}`}
                  data-moved={moved ? "true" : "false"}
                  style={{
                    left: `${node.x * scale}px`,
                    top: `${node.y * scale}px`,
                  }}
                  onPointerDown={(e) =>
                    handlePointerDown({ kind: "mesh", row: node.row, col: node.col }, e)
                  }
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onKeyDown={(e) =>
                    handleHandleKeyDown({ kind: "mesh", row: node.row, col: node.col }, e)
                  }
                  className={cn(
                    "pointer-events-auto absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing",
                    TRANSITION_CLASS,
                  )}
                >
                  <span
                    className={cn(
                      "block h-3.5 w-3.5 rounded-full border-2 shadow-xs",
                      isSelected
                        ? "scale-110 border-on-accent bg-accent"
                        : moved
                          ? "border-card bg-warn"
                          : "border-accent bg-card",
                    )}
                  />
                </button>
              );
            })
          : null}

        {mode === "corner-pin" && cornerQuad
          ? CORNER_KEYS.map(({ key, label }) => {
              const pt = cornerQuad[key];
              const isSelected = activeHandle?.kind === "corner" && activeHandle.key === key;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={busy}
                  aria-label={`${label} 핸들 (${Math.round(pt.x)}, ${Math.round(pt.y)})`}
                  data-corner-handle={key}
                  style={{
                    left: `${pt.x * scale}px`,
                    top: `${pt.y * scale}px`,
                  }}
                  onPointerDown={(e) => handlePointerDown({ kind: "corner", key }, e)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onKeyDown={(e) => handleHandleKeyDown({ kind: "corner", key }, e)}
                  className={cn(
                    "pointer-events-auto absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-accent active:cursor-grabbing",
                    TRANSITION_CLASS,
                  )}
                >
                  <span
                    className={cn(
                      "block h-4 w-4 rounded-sm border-2 shadow-xs",
                      isSelected
                        ? "border-on-accent bg-accent"
                        : quadValidation?.valid === false
                          ? "border-card bg-bad"
                          : "border-accent bg-card",
                    )}
                  />
                </button>
              );
            })
          : null}
      </div>
    </div>
  );
}

export default StudioOnCanvasMeshWarpOverlay;
