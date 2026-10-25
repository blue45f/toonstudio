/**
 * 벡터 스트로크 편집기 (T2, 선택적 UI).
 *
 * 스트로크 목록·선택, 선 굵기 일괄 조정 슬라이더(0.1x~5x),
 * 브러시 모양 교체 버튼, SVG 미리보기를 제공한다.
 * 상태 변경은 모두 부모 콜백으로 위임하고, 이 컴포넌트는 상태를 소유하지 않는다.
 */

import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";

import { cn } from "@/shared/lib/utils";

import { creatorRestStatusText } from "../creator-rest-status-i18n";

import { exportVectorLayerToSvg } from "./vector-layer-svg-export";
import {
  VECTOR_BRUSH_SHAPES,
  VECTOR_WIDTH_SCALE_MAX,
  VECTOR_WIDTH_SCALE_MIN,
  type VectorBrushShapeId,
  type VectorLayer,
} from "./vector-layer-model";

export interface VectorStrokeEditorProps {
  readonly layer: VectorLayer;
  readonly selectedStrokeId: string | null;
  readonly onSelectStroke: (strokeId: string | null) => void;
  readonly onScaleStrokeWidths: (strokeId: string, scale: number) => void;
  readonly onReplaceBrushShape: (
    strokeId: string,
    shapeId: VectorBrushShapeId
  ) => void;
}

export function VectorStrokeEditor({
  layer,
  selectedStrokeId,
  onSelectStroke,
  onScaleStrokeWidths,
  onReplaceBrushShape,
}: VectorStrokeEditorProps): React.JSX.Element {
  const selectedStroke =
    layer.strokes.find((stroke) => stroke.id === selectedStrokeId) ?? null;

  const [focusedStrokeIdx, setFocusedStrokeIdx] = useState(0);
  const strokeBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const shapeBtnRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeStrokeIdx = useMemo(() => {
    if (layer.strokes.length === 0) return 0;
    const selectedIdx = layer.strokes.findIndex((s) => s.id === selectedStrokeId);
    if (selectedIdx >= 0) return selectedIdx;
    return Math.min(focusedStrokeIdx, layer.strokes.length - 1);
  }, [layer.strokes, selectedStrokeId, focusedStrokeIdx]);

  const handleStrokeKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    const count = layer.strokes.length;
    if (count === 0) return;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowDown":
        nextIndex = (index + 1) % count;
        break;
      case "ArrowUp":
        nextIndex = (index - 1 + count) % count;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    setFocusedStrokeIdx(nextIndex);
    const nextStroke = layer.strokes[nextIndex];
    if (nextStroke) {
      onSelectStroke(nextStroke.id);
    }
    strokeBtnRefs.current[nextIndex]?.focus();
  };

  const handleShapeKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ): void => {
    if (!selectedStroke) return;
    const count = VECTOR_BRUSH_SHAPES.length;
    let nextIndex: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        nextIndex = (index + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        nextIndex = (index - 1 + count) % count;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = count - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const targetShape = VECTOR_BRUSH_SHAPES[nextIndex];
    if (targetShape) {
      onReplaceBrushShape(selectedStroke.id, targetShape.id);
    }
    shapeBtnRefs.current[nextIndex]?.focus();
  };

  const preview = useMemo(
    () =>
      exportVectorLayerToSvg(layer, {
        width: 320,
        height: 200,
        background: "#ffffff",
      }),
    [layer]
  );

  const selectedPreview = useMemo(() => {
    const target =
      layer.strokes.find((stroke) => stroke.id === selectedStrokeId) ?? null;
    if (!target) return null;
    return exportVectorLayerToSvg(
      { ...layer, strokes: [target] },
      { width: 320, height: 120, background: "#fafafa" }
    );
  }, [layer, selectedStrokeId]);

  return (
    <section
      aria-label="벡터 스트로크 편집기"
      className="flex max-w-[360px] flex-col gap-3 rounded-xl border border-line bg-card/60 p-3 text-fg"
    >
      <h2 className="m-0 text-sm font-semibold text-fg">
        벡터 스트로크 편집기
        <span className="font-normal text-fg-3">
          {" "}
          · {layer.name} ({layer.strokes.length}획)
        </span>
      </h2>

      {layer.strokes.length === 0 ? (
        <p className="m-0 text-xs text-fg-3">
          {creatorRestStatusText(
            "creatorRest.status.vectorStroke.empty",
            "스트로크가 없습니다. 먼저 벡터 레이어에 선을 그리세요."
          )}
        </p>
      ) : (
        <ul
          aria-label="스트로크 목록"
          className="m-0 flex list-none flex-col gap-1 p-0"
        >
          {layer.strokes.map((stroke, index) => {
            const selected = stroke.id === selectedStrokeId;
            return (
              <li key={stroke.id}>
                <button
                  ref={(el) => {
                    strokeBtnRefs.current[index] = el;
                  }}
                  type="button"
                  tabIndex={index === activeStrokeIdx ? 0 : -1}
                  aria-pressed={selected}
                  onClick={() => {
                    setFocusedStrokeIdx(index);
                    onSelectStroke(selected ? null : stroke.id);
                  }}
                  onKeyDown={(event) => handleStrokeKeyDown(event, index)}
                  className={cn(
                    "w-full cursor-pointer rounded-md border px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                    selected
                      ? "border-2 border-accent bg-accent/15 font-semibold text-fg"
                      : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                  )}
                >
                  획 {index + 1} · {stroke.color} · 평균{" "}
                  {(
                    stroke.widths.reduce((sum, width) => sum + width, 0) /
                    Math.max(stroke.widths.length, 1)
                  ).toFixed(1)}
                  px
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {selectedStroke ? (
        <div className="flex flex-col gap-3">
          <div>
            <label
              htmlFor="vector-stroke-width-scale"
              className="text-xs font-medium text-fg-2"
            >
              선 굵기 일괄 조정 ({VECTOR_WIDTH_SCALE_MIN}x~
              {VECTOR_WIDTH_SCALE_MAX}x)
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id="vector-stroke-width-scale"
                key={selectedStroke.id}
                type="range"
                min={VECTOR_WIDTH_SCALE_MIN}
                max={VECTOR_WIDTH_SCALE_MAX}
                step={0.1}
                defaultValue={1}
                aria-label="선택 획 굵기 배율"
                onChange={(event) =>
                  onScaleStrokeWidths(
                    selectedStroke.id,
                    Number(event.target.value)
                  )
                }
                className="flex-1 cursor-pointer accent-accent"
              />
            </div>
          </div>

          <fieldset className="m-0 rounded-md border border-line p-2">
            <legend className="px-1 text-xs font-medium text-fg-2">
              브러시 모양 교체
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              {VECTOR_BRUSH_SHAPES.map((shape, index) => {
                const active = selectedStroke.brushShapeId === shape.id;
                return (
                  <button
                    key={shape.id}
                    ref={(el) => {
                      shapeBtnRefs.current[index] = el;
                    }}
                    type="button"
                    tabIndex={active ? 0 : -1}
                    aria-pressed={active}
                    title={shape.description}
                    onClick={() =>
                      onReplaceBrushShape(selectedStroke.id, shape.id)
                    }
                    onKeyDown={(event) => handleShapeKeyDown(event, index)}
                    className={cn(
                      "cursor-pointer rounded-md border px-2.5 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                      active
                        ? "border-2 border-accent bg-accent/15 font-semibold text-fg"
                        : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg"
                    )}
                  >
                    {shape.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {selectedPreview ? (
            <figure className="m-0">
              <figcaption className="mb-1 text-xs text-fg-3">
                선택 획 미리보기
              </figcaption>
              <div
                role="img"
                aria-label="선택한 벡터 스트로크의 SVG 미리보기"
                className="overflow-hidden rounded border border-line [forced-color-adjust:none]"
                // 미리보기는 이 모듈이 생성한 SVG이므로 안전하다.
                dangerouslySetInnerHTML={{ __html: selectedPreview.svg }}
              />
            </figure>
          ) : null}
        </div>
      ) : (
        <p className="m-0 text-xs text-fg-3">
          편집할 획을 목록에서 선택하세요.
        </p>
      )}

      <figure className="m-0">
        <figcaption className="mb-1 text-xs text-fg-3">
          레이어 SVG 미리보기
        </figcaption>
        <div
          role="img"
          aria-label="벡터 레이어 전체의 SVG 미리보기"
          className="overflow-hidden rounded border border-line [forced-color-adjust:none]"
          dangerouslySetInnerHTML={{ __html: preview.svg }}
        />
      </figure>
    </section>
  );
}

