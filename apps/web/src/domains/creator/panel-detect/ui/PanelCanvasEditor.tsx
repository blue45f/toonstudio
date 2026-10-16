"use no memo";
// 문구가 전역 언어를 읽는 bi() 로 만들어져서, 언어를 바꾸면 열려 있는 화면도 바로 다시 그려야 한다.
// React Compiler 가 상수 인자의 bi() 결과를 캐시하면 이전 언어가 남으므로 이 파일은 메모이제이션에서 뺀다(panel-import-bi.ts 참고).

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

import {
  clampSplitPosition,
  clientToImagePoint,
  displayScale,
  isDrawableRect,
  keyboardStep,
  percentRectStyle,
  rectFromPoints,
  type ImagePoint,
  type ImageSize,
} from "../panel-canvas-geometry";
import { moveRect, resizeRectEdge, type EditablePanel, type PanelEdge } from "../panel-detect-edit";
import type { PanelEditTool } from "../panel-editor-state";

import { bi, confidenceLabel } from "./panel-import-copy";
import { PANEL_FOCUS_RING } from "./panel-import-styles";

import type { IgnoredFragment, PanelRect, UndetectableRegion } from "../panel-detect-types";

export interface PanelCanvasEditorProps {
  readonly imageUrl: string;
  readonly image: ImageSize;
  readonly panels: readonly EditablePanel[];
  readonly selectedId: string | null;
  readonly tool: PanelEditTool;
  readonly undetectable: readonly UndetectableRegion[];
  readonly ignored: readonly IgnoredFragment[];
  /** 표시 배율(1 = 가로 맞춤). 1보다 크면 가로 스크롤로 정밀하게 다룬다. */
  readonly zoom: number;
  readonly onSelect: (id: string | null) => void;
  /** 끌기가 끝났거나 키보드로 크기를 바꿨을 때. 한 번에 한 번만 불러 되돌리기 기록이 하나만 쌓이게 한다. */
  readonly onSetRect: (id: string, rect: PanelRect) => void;
  readonly onMoveBy: (id: string, dx: number, dy: number) => void;
  readonly onDraw: (rect: PanelRect) => void;
  readonly onSplit: (id: string, orientation: "horizontal" | "vertical", position: number) => void;
  readonly onDelete: (id: string) => void;
  readonly onAdopt: (rect: PanelRect) => void;
}

type Drag =
  | { readonly kind: "move"; readonly id: string; readonly origin: ImagePoint; readonly start: PanelRect; readonly current: PanelRect }
  | { readonly kind: "edge"; readonly id: string; readonly edge: PanelEdge; readonly grab: number; readonly start: PanelRect; readonly current: PanelRect }
  | { readonly kind: "draw"; readonly origin: ImagePoint; readonly current: PanelRect };

const EDGES: readonly PanelEdge[] = ["left", "right", "top", "bottom"];

/**
 * 이미지 위에 겹쳐 놓는 상자는 위치가 곧 값이다. 작업 화면 틀 안의 단추에 일괄로 걸린 마우스를 올렸을 때 1px 떠오르는 효과
 * (workspace-visual-v3.css 의 `.workspace-task-route-content :where(button, [role="button"]):not(:disabled):hover
 * { transform: translateY(-1px) }`)가 상자를 이미지에서 어긋나 보이게 하므로, 인라인으로 막는다(인라인은 그 규칙보다 앞선다).
 */
const OVERLAY_STILL = { transform: "none" } as const;

/** 자동으로 나눌 수 없는 영역의 빗금. 색은 테마의 경고 토큰에서 얻으므로 라이트·다크·고대비를 그대로 따른다. */
const UNDETECTABLE_HATCH =
  "repeating-linear-gradient(135deg, transparent 0 8px, color-mix(in oklch, var(--color-warn) 30%, transparent) 8px 10px)";

const EDGE_CLASS: Readonly<Record<PanelEdge, string>> = {
  left: "-left-2.5 top-0 h-full w-5 cursor-ew-resize",
  right: "-right-2.5 top-0 h-full w-5 cursor-ew-resize",
  top: "-top-2.5 left-0 h-5 w-full cursor-ns-resize",
  bottom: "-bottom-2.5 left-0 h-5 w-full cursor-ns-resize",
};

const EDGE_LINE_CLASS: Readonly<Record<PanelEdge, string>> = {
  left: "left-1/2 top-0 h-full w-1 -translate-x-1/2",
  right: "left-1/2 top-0 h-full w-1 -translate-x-1/2",
  top: "left-0 top-1/2 h-1 w-full -translate-y-1/2",
  bottom: "left-0 top-1/2 h-1 w-full -translate-y-1/2",
};

function panelToneClass(panel: EditablePanel): string {
  if (panel.origin === "user") return "border-dashed border-accent bg-accent/10";
  const confidence = panel.confidence ?? 0;
  if (confidence >= 0.75) return "border-good bg-good/10";
  if (confidence >= 0.5) return "border-warn bg-warn/10";
  return "border-bad bg-bad/10";
}

function levelOf(panel: EditablePanel): "high" | "medium" | "low" {
  const confidence = panel.confidence ?? 0;
  return confidence >= 0.75 ? "high" : confidence >= 0.5 ? "medium" : "low";
}

function panelLabel(panel: EditablePanel, order: number): string {
  const where = bi(
    `위치 x ${panel.x}, y ${panel.y}, 크기 ${panel.width}×${panel.height} 픽셀`,
    `at x ${panel.x}, y ${panel.y}, size ${panel.width}×${panel.height} px`,
  );
  const quality = panel.origin === "user" ? bi("직접 만든 컷", "added by you") : confidenceLabel(levelOf(panel));
  return bi(`컷 ${order}, ${quality}, ${where}`, `Panel ${order}, ${quality}, ${where}`);
}

/**
 * 원고 이미지 위에 컷 후보를 겹쳐 보여 주고, 끌기·방향키로 고치는 편집 캔버스.
 * 이미지 픽셀 좌표를 상자 대비 퍼센트로 놓아 표시 크기와 무관하게 맞는다. 마우스·터치(끌기)와 키보드(방향키)를 모두 지원한다.
 */
export function PanelCanvasEditor(props: PanelCanvasEditorProps): ReactElement {
  const { imageUrl, image, panels, selectedId, tool, undetectable, ignored, zoom } = props;
  const helpId = useId().replace(/:/gu, "");
  const rootRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<ImagePoint | null>(null);

  const boundsOf = () => rootRef.current?.getBoundingClientRect() ?? null;
  const pointOf = (event: { readonly clientX: number; readonly clientY: number }): ImagePoint | null => {
    const bounds = boundsOf();
    return bounds ? clientToImagePoint({ x: event.clientX, y: event.clientY }, bounds, image) : null;
  };
  const capture = (event: PointerEvent): void => {
    rootRef.current?.setPointerCapture?.(event.pointerId);
  };

  const startMove = (event: PointerEvent, panel: EditablePanel): void => {
    if (tool !== "select" || event.button !== 0) return;
    props.onSelect(panel.id);
    const origin = pointOf(event);
    if (!origin) return;
    capture(event);
    setDrag({ kind: "move", id: panel.id, origin, start: panel, current: panel });
  };

  const startEdge = (event: PointerEvent, panel: EditablePanel, edge: PanelEdge): void => {
    if (event.button !== 0) return;
    event.stopPropagation();
    const origin = pointOf(event);
    if (!origin) return;
    capture(event);
    // 손잡이는 변 둘레로 넓게 잡혀 있어 변에서 벗어난 곳을 누를 수 있다. 누른 자리와 변의 거리를 기억해 두었다가 빼서,
    // 끌기 시작 때 변이 포인터 밑으로 튀지 않고 끈 만큼만 움직이게 한다.
    const edgeAt = edge === "left" ? panel.x : edge === "right" ? panel.x + panel.width : edge === "top" ? panel.y : panel.y + panel.height;
    const grab = (edge === "left" || edge === "right" ? origin.x : origin.y) - edgeAt;
    setDrag({ kind: "edge", id: panel.id, edge, grab, start: panel, current: panel });
  };

  const startDraw = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    if (tool === "draw") {
      const origin = pointOf(event);
      if (!origin) return;
      capture(event);
      setDrag({ kind: "draw", origin, current: { x: Math.round(origin.x), y: Math.round(origin.y), width: 0, height: 0 } });
    } else if (tool === "select" && event.target === event.currentTarget) {
      props.onSelect(null);
    }
  };

  const onMove = (event: PointerEvent<HTMLDivElement>): void => {
    const point = pointOf(event);
    if (!point) return;
    if (!drag) {
      if (tool === "split-horizontal" || tool === "split-vertical") setHover(point);
      return;
    }
    if (drag.kind === "move") {
      setDrag({ ...drag, current: moveRect(drag.start, point.x - drag.origin.x, point.y - drag.origin.y, image.width, image.height) });
    } else if (drag.kind === "edge") {
      const position = (drag.edge === "left" || drag.edge === "right" ? point.x : point.y) - drag.grab;
      setDrag({ ...drag, current: resizeRectEdge(drag.start, drag.edge, position, image.width, image.height) });
    } else {
      setDrag({ ...drag, current: rectFromPoints(drag.origin, point) });
    }
  };

  const finish = (): void => {
    const finished = drag;
    setDrag(null);
    if (!finished) return;
    if (finished.kind === "draw") {
      if (isDrawableRect(finished.current)) props.onDraw(finished.current);
      return;
    }
    const { start, current } = finished;
    if (start.x !== current.x || start.y !== current.y || start.width !== current.width || start.height !== current.height) {
      props.onSetRect(finished.id, current);
    }
  };

  const splitAt = (point: ImagePoint | null): void => {
    if (!point || (tool !== "split-horizontal" && tool !== "split-vertical")) return;
    const target = [...panels].reverse().find((panel) => point.x >= panel.x && point.x < panel.x + panel.width && point.y >= panel.y && point.y < panel.y + panel.height);
    if (!target) return;
    const orientation = tool === "split-horizontal" ? "horizontal" : "vertical";
    props.onSplit(target.id, orientation, clampSplitPosition(target, orientation, orientation === "horizontal" ? point.y : point.x));
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>, panel: EditablePanel): void => {
    const bounds = boundsOf();
    const step = keyboardStep(event, bounds ? displayScale(bounds, image) : 0);
    const arrows: Readonly<Record<string, readonly [number, number]>> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = arrows[event.key];
    if (delta) {
      event.preventDefault();
      props.onSelect(panel.id);
      if (event.altKey) {
        // Alt+방향키: 오른쪽·아래 변을 옮겨 크기를 바꾼다.
        const horizontal = delta[0] !== 0;
        props.onSetRect(panel.id, resizeRectEdge(panel, horizontal ? "right" : "bottom", horizontal ? panel.x + panel.width + delta[0] : panel.y + panel.height + delta[1], image.width, image.height));
      } else {
        props.onMoveBy(panel.id, delta[0], delta[1]);
      }
    } else if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      props.onDelete(panel.id);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      props.onSelect(panel.id);
    } else if (event.key === "Escape") {
      props.onSelect(null);
    }
  };

  const shown = (panel: EditablePanel): PanelRect => (drag && drag.kind !== "draw" && drag.id === panel.id ? drag.current : panel);
  const splitting = tool === "split-horizontal" || tool === "split-vertical";
  const hasFocusableChild = panels.length > 0 || ignored.length > 0 || undetectable.length > 0;
  const guideTarget = splitting && hover
    ? [...panels].reverse().find((panel) => hover.x >= panel.x && hover.x < panel.x + panel.width && hover.y >= panel.y && hover.y < panel.y + panel.height)
    : undefined;

  return (
    <div
      className={cn("max-h-[78dvh] overflow-auto rounded-xl border border-line bg-canvas", !hasFocusableChild && PANEL_FOCUS_RING)}
      data-panel-canvas-scroller="true"
      // 안쪽에 포커스를 받는 컷·조각이 하나도 없을 때만 스크롤 영역 자체가 포커스를 받아야 키보드로 이미지를 훑어볼 수 있다(WCAG 2.1.1).
      // 컷이 있으면 컷이 포커스를 받으므로 이 영역은 포커스 순서에 끼어들지 않는다.
      role={hasFocusableChild ? undefined : "region"}
      tabIndex={hasFocusableChild ? undefined : 0}
      aria-label={hasFocusableChild ? undefined : bi("컷 편집 영역 (방향키로 스크롤)", "Panel editing area (scroll with the arrow keys)")}
    >
      <p id={helpId} className="sr-only">
        {bi(
          "컷을 선택한 뒤 방향키로 옮기고, Shift+방향키는 1픽셀, Alt+방향키는 크기, Delete 는 삭제, Esc 는 선택 해제입니다.",
          "Select a panel, then use the arrow keys to move it. Shift+arrows move 1 pixel, Alt+arrows resize, Delete removes it and Esc clears the selection.",
        )}
      </p>
      <div
        ref={rootRef}
        role="group"
        aria-label={bi("컷 편집 캔버스", "Panel editing canvas")}
        className={cn("relative select-none", tool === "draw" && "cursor-crosshair", splitting && "cursor-copy")}
        style={{ width: `${zoom * 100}%`, aspectRatio: `${image.width} / ${image.height}`, touchAction: tool === "draw" ? "none" : undefined }}
        onPointerDown={startDraw}
        onPointerMove={onMove}
        onPointerUp={finish}
        onPointerCancel={() => setDrag(null)}
        onPointerLeave={() => setHover(null)}
      >
        <img
          src={imageUrl}
          alt={bi("가져온 원고 이미지", "Imported manuscript image")}
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill"
        />

        {ignored.map((fragment, index) => (
          <button
            key={fragment.id}
            type="button"
            style={{ ...percentRectStyle(fragment, image), ...OVERLAY_STILL }}
            onClick={() => props.onAdopt(fragment)}
            aria-label={bi(`제외된 조각 ${index + 1} (${fragment.width}×${fragment.height}). 눌러 컷으로 쓰기`, `Left-out fragment ${index + 1} (${fragment.width}×${fragment.height}). Press to use it as a panel`)}
            className={cn("absolute border-2 border-dotted border-fg-3 bg-fg-3/10 hover:bg-fg-3/25", PANEL_FOCUS_RING, tool !== "select" && "pointer-events-none")}
          />
        ))}
        {undetectable.map((region, index) => (
          <button
            key={region.id}
            type="button"
            style={{ ...percentRectStyle(region, image), ...OVERLAY_STILL, backgroundImage: UNDETECTABLE_HATCH }}
            onClick={() => props.onAdopt(region)}
            aria-label={bi(`자동으로 나눌 수 없는 영역 ${index + 1} (${region.width}×${region.height}). 눌러 한 컷으로 쓰기`, `Region ${index + 1} could not be split automatically (${region.width}×${region.height}). Press to use it as one panel`)}
            className={cn("absolute border-2 border-warn", PANEL_FOCUS_RING, tool !== "select" && "pointer-events-none")}
          >
            <span className="absolute left-0 top-0 max-w-full truncate rounded-br-md bg-canvas/85 px-1.5 py-0.5 text-[0.65rem] font-bold text-warn">
              {bi("검출 불가", "Not detectable")}
            </span>
          </button>
        ))}

        {panels.map((panel, index) => {
          const rect = shown(panel);
          const selected = panel.id === selectedId;
          return (
            <div
              key={panel.id}
              role="button"
              tabIndex={0}
              aria-pressed={selected}
              aria-label={panelLabel(panel, index + 1)}
              aria-describedby={helpId}
              data-panel-id={panel.id}
              data-selected={selected ? "true" : undefined}
              // 선택한 컷 위에서는 손가락 끌기가 화면 스크롤이 되지 않고 컷 이동이 되게 한다(고르지 않은 컷은 그대로 스크롤된다).
              style={{ ...percentRectStyle(rect, image), ...OVERLAY_STILL, touchAction: selected && tool === "select" ? "none" : undefined }}
              onPointerDown={(event) => startMove(event, panel)}
              onKeyDown={(event) => onKey(event, panel)}
              onFocus={() => { if (!selected && tool === "select") props.onSelect(panel.id); }}
              className={cn(
                "absolute border-2",
                panelToneClass(panel),
                PANEL_FOCUS_RING,
                selected ? "z-20 border-[3px] shadow-[0_0_0_2px_var(--color-canvas)]" : "z-10",
                tool === "select" ? "cursor-move" : "pointer-events-none",
              )}
            >
              <span className="absolute left-0 top-0 grid min-h-6 min-w-6 place-items-center rounded-br-md bg-canvas/85 px-1.5 text-xs font-black text-fg">
                {index + 1}
              </span>
              {selected && tool === "select"
                ? EDGES.map((edge) => (
                  <div
                    key={edge}
                    aria-hidden="true"
                    data-edge={edge}
                    onPointerDown={(event) => startEdge(event, panel, edge)}
                    style={{ touchAction: "none" }}
                    className={cn("absolute z-30", EDGE_CLASS[edge])}
                  >
                    <span className={cn("absolute rounded-full bg-accent", EDGE_LINE_CLASS[edge])} />
                  </div>
                ))
                : null}
            </div>
          );
        })}

        {splitting ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => splitAt(pointOf(event))}
            aria-label={bi("나눌 컷 위를 눌러 분할선 놓기", "Press on a panel to place the dividing line")}
            style={OVERLAY_STILL}
            className="absolute inset-0 z-40 cursor-copy"
          />
        ) : null}
        {guideTarget && hover ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 bg-accent"
            style={tool === "split-horizontal"
              ? { ...percentRectStyle({ x: guideTarget.x, y: clampSplitPosition(guideTarget, "horizontal", hover.y), width: guideTarget.width, height: 0 }, image), height: 2 }
              : { ...percentRectStyle({ x: clampSplitPosition(guideTarget, "vertical", hover.x), y: guideTarget.y, width: 0, height: guideTarget.height }, image), width: 2 }}
          />
        ) : null}
        {drag?.kind === "draw" && drag.current.width > 0 && drag.current.height > 0 ? (
          <div aria-hidden="true" className="pointer-events-none absolute z-30 border-2 border-dashed border-accent bg-accent/15" style={percentRectStyle(drag.current, image)} />
        ) : null}
      </div>
    </div>
  );
}
