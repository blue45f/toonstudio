/**
 * 스케치 → 소재 추천 표면 (STT 흡수).
 *
 * 패드에 모양을 그으면 스트로크 특징(닫힘·모서리·대칭·반경)을 읽어
 * 통합 소재 카탈로그에서 닮은 소재를 이유와 함께 추천한다.
 * 텍스트 검색어로는 표현하기 어려운 "머릿속 모양"을 그어서 찾는 동선이다.
 *
 * 상태는 전부 처리한다: 그리기 전 안내, 너무 짧은 획 안내, 추천 목록,
 * 닮은 소재가 없을 때의 안내 + 모양 이름 텍스트 검색 전환 버튼.
 * 데이터는 전부 props이며, 그리기 상태만 내부에 둔다.
 */
import { r3c07StatusText } from "./studio-panel-status-i18n-r3c07";
import { Eraser, PencilLine, Search, Shapes, Sparkles } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { svgToDataUrl } from "./studio-characters";
import {
  buildStudioSketchSearchGuidance,
  describeStudioSketchFeatures,
  recommendStudioAssetsForSketch,
  studioSketchStrokePath,
  type StudioSketchPoint,
  type StudioSketchStroke,
} from "./studio-sketch-asset-recommend";
import type { StudioUnifiedAssetItem } from "./studio-unified-asset-catalog";

export interface StudioSketchAssetRecommendPanelProps {
  readonly items: readonly StudioUnifiedAssetItem[];
  readonly onUseItem: (
    item: StudioUnifiedAssetItem,
  ) => boolean | void | Promise<boolean | void>;
  /** 빈 결과 안내에서 모양 이름으로 텍스트 검색을 이어갈 때 호출된다. */
  readonly onTextSearch?: (query: string) => void;
}

const PAD_WIDTH = 300;
const PAD_HEIGHT = 200;
const CONTROL =
  "min-h-11 rounded-lg border border-line bg-card px-3 text-xs font-semibold text-fg-2 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50";

function previewSource(item: StudioUnifiedAssetItem): string | undefined {
  if (item.preview.kind === "image") return item.preview.src;
  if (item.preview.kind === "svg") return svgToDataUrl(item.preview.svg);
  return undefined;
}

export function StudioSketchAssetRecommendPanel({
  items,
  onUseItem,
  onTextSearch,
}: StudioSketchAssetRecommendPanelProps) {
  const [strokes, setStrokes] = useState<readonly StudioSketchStroke[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const result = useMemo(
    () => recommendStudioAssetsForSketch({ strokes, catalog: items }),
    [strokes, items],
  );
  const guidance = useMemo(
    () => buildStudioSketchSearchGuidance(result),
    [result],
  );
  const summary = describeStudioSketchFeatures(result.features);

  function toPadPoint(event: React.PointerEvent): StudioSketchPoint | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * PAD_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * PAD_HEIGHT,
    };
  }

  function handlePointerDown(event: React.PointerEvent): void {
    const point = toPadPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;
    setNotice(null);
    setStrokes((prev) => [...prev, { points: [point] }]);
  }

  function handlePointerMove(event: React.PointerEvent): void {
    if (!drawingRef.current) return;
    const point = toPadPoint(event);
    if (!point) return;
    setStrokes((prev) => {
      const last = prev[prev.length - 1];
      if (!last) return prev;
      return [...prev.slice(0, -1), { points: [...last.points, point] }];
    });
  }

  function endStroke(): void {
    drawingRef.current = false;
  }

  async function handleUseItem(item: StudioUnifiedAssetItem): Promise<void> {
    if (pendingId !== null) return;
    setPendingId(item.id);
    setNotice(null);
    try {
      const used = await onUseItem(item);
      setNotice(
        used === false
          ? r3c07StatusText("studio.panelStatus.r3c07.sketchRecommend.assetUnavailable", "현재 캔버스에서는 이 소재를 사용할 수 없습니다.")
          : item.useMode === "open"
            ? `${item.title} 제작 도구를 열었습니다.`
            : `${item.title}을(를) 배치했습니다.`,
      );
    } catch (cause: unknown) {
      setNotice(cause instanceof Error ? cause.message : r3c07StatusText("studio.panelStatus.r3c07.sketchRecommend.useFailed", "소재를 사용하지 못했습니다."));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section aria-label="스케치로 소재 찾기" className="space-y-3">
      <header className="space-y-1">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-fg">
          <PencilLine size={16} aria-hidden="true" />
          스케치로 소재 찾기
        </h3>
        <p className="text-xs leading-relaxed text-fg-3">
          그리고 싶은 모양을 그어 보세요. 닮은 소재를 바로 추천해 드립니다.
        </p>
      </header>

      <div className="overflow-hidden rounded-xl border border-line bg-raised">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${PAD_WIDTH} ${PAD_HEIGHT}`}
          role="application"
          aria-label="스케치 패드: 마우스나 손가락으로 모양을 그리세요"
          className="block aspect-[3/2] w-full touch-none cursor-crosshair"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        >
          <rect width={PAD_WIDTH} height={PAD_HEIGHT} fill="transparent" />
          {strokes.map((stroke, index) => (
            <path
              key={index}
              d={studioSketchStrokePath(stroke.points)}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-fg-2"
            />
          ))}
          {strokes.length === 0 && (
            <text
              x={PAD_WIDTH / 2}
              y={PAD_HEIGHT / 2}
              textAnchor="middle"
              className="fill-current text-fg-3"
              fontSize={12}
            >
              여기에 모양을 그어 보세요
            </text>
          )}
        </svg>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p role="status" aria-live="polite" className="text-xs text-fg-3">
          {summary
            ? summary
            : result.status === "too-small"
              ? "획이 너무 짧아요."
              : "그린 모양을 읽어 추천합니다."}
        </p>
        <button
          type="button"
          className={CONTROL}
          disabled={strokes.length === 0}
          onClick={() => {
            setStrokes([]);
            setNotice(null);
          }}
        >
          <span className="inline-flex items-center gap-1">
            <Eraser size={14} aria-hidden="true" />
            지우기
          </span>
        </button>
      </div>

      {result.status === "ok" ? (
        <div className="space-y-2">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Sparkles size={14} aria-hidden="true" />
            {guidance.headline}
            <span className="font-normal text-fg-3">
              {result.recommendations.length}개
            </span>
          </h4>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {result.recommendations.map((recommendation) => {
              const item = recommendation.item;
              const src = previewSource(item);
              return (
                <article
                  key={item.id}
                  className="min-w-0 rounded-xl border border-line bg-card p-2"
                >
                  <div className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg bg-raised">
                    {src ? (
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="size-full object-contain"
                      />
                    ) : (
                      <Shapes size={20} aria-hidden="true" className="text-fg-3" />
                    )}
                  </div>
                  <h5 className="mt-2 line-clamp-2 text-xs font-bold text-fg">
                    {item.title}
                  </h5>
                  <p className="my-1 line-clamp-2 text-[0.65rem] text-fg-3">
                    닮은 정도 {Math.round(recommendation.score * 100)}% ·{" "}
                    {recommendation.reasons[0]}
                  </p>
                  <button
                    type="button"
                    className={`${CONTROL} mt-1 w-full`}
                    disabled={pendingId !== null}
                    aria-label={`${item.title} ${item.useLabel}`}
                    onClick={() => void handleUseItem(item)}
                  >
                    {pendingId === item.id ? r3c07StatusText("studio.panelStatus.r3c07.sketchRecommend.processing", "처리 중…") : item.useLabel}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <div
          role="note"
          className="space-y-2 rounded-xl border border-dashed border-line bg-card p-3"
        >
          <h4 className="text-xs font-bold text-fg">{guidance.headline}</h4>
          <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-fg-3">
            {guidance.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          {guidance.fallbackQuery && onTextSearch && (
            <button
              type="button"
              className={CONTROL}
              onClick={() => onTextSearch(guidance.fallbackQuery!)}
            >
              <span className="inline-flex items-center gap-1">
                <Search size={14} aria-hidden="true" />
                “{guidance.fallbackQuery}” 텍스트로 검색하기
              </span>
            </button>
          )}
        </div>
      )}

      {notice && (
        <p role="status" aria-live="polite" className="text-xs text-fg-3">
          {notice}
        </p>
      )}
    </section>
  );
}
