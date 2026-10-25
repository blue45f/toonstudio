/**
 * StudioGgumtoonBubbleEditorPanel.tsx
 *
 * https://www.ggumtoon.com/studio (`0-du3dytc8ifq.js` 내 `BubbleEditor`)의
 * 66종 말풍선(`[57..66, 1..56]`)·3종 효과·40종 한국어 서체(`dreamtoon_fav_fonts` 즐겨찾기)·
 * 9종 도형 클립 프레임·6방향 정렬·60단계 Undo/Redo 히스토리를 툰스튜디오 말풍선 도구함에 내장한 패널.
 */
import { Copy, Frame, Redo2, Sparkles, Star, Type, Undo2 } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import {
  buildGgumtoonBubbleTailSvgPath,
  cloneGgumtoonCanvasObjectWithOffset,
  computeGgumtoonAlignedObjectPosition,
  computeGgumtoonClipFramePolygon,
  createEmptyGgumtoonCanvasHistory,
  filterGgumtoonBubbleOrEffectTemplates,
  GGUMTOON_BUBBLE_FONTS,
  GGUMTOON_CANVAS_ALIGNMENTS,
  GGUMTOON_CLIP_FRAMES,
  GGUMTOON_DEFAULT_ITEXT_FONT,
  partitionGgumtoonFontsByFavorite,
  pushGgumtoonCanvasHistorySnapshot,
  redoGgumtoonCanvasHistory,
  toggleGgumtoonFavoriteFont,
  undoGgumtoonCanvasHistory,
  type GgumtoonBubbleTailDirection,
  type GgumtoonCanvasAlignType,
  type GgumtoonCanvasLayerObject,
  type GgumtoonClipFrameType,
} from "./ggumtoon-bubble-editor-engine";

import type { BubbleVariant } from "../studio-assets";

import { cn } from "@/shared/lib/utils";

export interface StudioGgumtoonBubbleEditorPanelProps {
  readonly onInsertBubble?: (variant: BubbleVariant) => void;
}

export function StudioGgumtoonBubbleEditorPanel({
  onInsertBubble,
}: StudioGgumtoonBubbleEditorPanelProps): ReactElement {
  const [assetCategory, setAssetCategory] = useState<"bubble" | "effect">("bubble");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<number>(1);
  const [favoriteFonts, setFavoriteFonts] = useState<readonly string[]>([
    "NanumSquare",
    "NanumGothic",
    "ChosunCentennial",
    "MoneygraphyRounded",
  ]);
  const [selectedFont, setSelectedFont] = useState<string>(GGUMTOON_DEFAULT_ITEXT_FONT);
  const [clipFrame, setClipFrame] = useState<GgumtoonClipFrameType>("none");
  const [tailDirection, setTailDirection] =
    useState<GgumtoonBubbleTailDirection>("bottom-left");
  const [activeLayer, setActiveLayer] = useState<GgumtoonCanvasLayerObject>({
    id: "gt-layer-1",
    dataType: "speech-text",
    left: 220,
    top: 430,
    width: 160,
    height: 60,
    scaleX: 1,
    scaleY: 1,
    opacity: 1,
    flipX: false,
    flipY: false,
    text: "텍스트를 입력하세요",
    fontFamily: GGUMTOON_DEFAULT_ITEXT_FONT,
    fontSize: 18,
  });

  const [historyState, setHistoryState] = useState(() =>
    createEmptyGgumtoonCanvasHistory(
      JSON.stringify({ left: 220, top: 430, font: GGUMTOON_DEFAULT_ITEXT_FONT }),
    ),
  );

  const filteredTemplates = useMemo(
    () => filterGgumtoonBubbleOrEffectTemplates(assetCategory, searchQuery),
    [assetCategory, searchQuery],
  );

  const partitionedFonts = useMemo(
    () => partitionGgumtoonFontsByFavorite(favoriteFonts),
    [favoriteFonts],
  );

  const clipPolygon = useMemo(
    () => computeGgumtoonClipFramePolygon(clipFrame),
    [clipFrame],
  );

  const tailSvgPath = useMemo(
    () =>
      buildGgumtoonBubbleTailSvgPath({
        x: 8,
        y: 6,
        w: 120,
        h: 48,
        tail: tailDirection,
      }),
    [tailDirection],
  );

  const handleAlign = (align: GgumtoonCanvasAlignType) => {
    const pos = computeGgumtoonAlignedObjectPosition({
      object: activeLayer,
      align,
    });
    const nextLayer: GgumtoonCanvasLayerObject = {
      ...activeLayer,
      left: pos.left,
      top: pos.top,
    };
    setActiveLayer(nextLayer);
    setHistoryState((prev) =>
      pushGgumtoonCanvasHistorySnapshot(
        prev,
        JSON.stringify({
          left: nextLayer.left,
          top: nextLayer.top,
          font: nextLayer.fontFamily,
        }),
      ),
    );
  };

  const handleClone = () => {
    const cloned = cloneGgumtoonCanvasObjectWithOffset(
      activeLayer,
      `gt-layer-${historyState.snapshots.length + 1}`,
    );
    setActiveLayer(cloned);
    setHistoryState((prev) =>
      pushGgumtoonCanvasHistorySnapshot(
        prev,
        JSON.stringify({
          left: cloned.left,
          top: cloned.top,
          font: cloned.fontFamily,
        }),
      ),
    );
  };

  const handleUndo = () => {
    const res = undoGgumtoonCanvasHistory(historyState);
    setHistoryState(res.state);
    if (res.snapshot) {
      const parsed = JSON.parse(res.snapshot) as {
        left: number;
        top: number;
        font?: string;
      };
      setActiveLayer((prev) => ({
        ...prev,
        left: parsed.left,
        top: parsed.top,
        fontFamily: parsed.font ?? prev.fontFamily,
      }));
    }
  };

  const handleRedo = () => {
    const res = redoGgumtoonCanvasHistory(historyState);
    setHistoryState(res.state);
    if (res.snapshot) {
      const parsed = JSON.parse(res.snapshot) as {
        left: number;
        top: number;
        font?: string;
      };
      setActiveLayer((prev) => ({
        ...prev,
        left: parsed.left,
        top: parsed.top,
        fontFamily: parsed.font ?? prev.fontFamily,
      }));
    }
  };

  return (
    <section
      aria-label="꿈툰(Ggumtoon) 66종 말풍선 및 40종 서체 식자 스튜디오"
      data-testid="ggumtoon-bubble-editor-panel"
      className="mx-2.5 mt-2.5 space-y-2.5 rounded-xl border border-accent/30 bg-card/90 p-2.5 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} className="text-accent" aria-hidden="true" />
          <h4 className="text-[0.7rem] font-bold text-fg">
            꿈툰(Ggumtoon) 말풍선 66종 · 한국어 40서체 식자 엔진
          </h4>
        </div>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.58rem] font-semibold text-accent">
          60단계 히스토리 ({historyState.currentIndex + 1}/{historyState.snapshots.length})
        </span>
      </div>

      {/* 말풍선 66종 / 효과 3종 전환 및 번호 검색 */}
      <div className="space-y-1.5 rounded-lg border border-line/60 bg-raised/70 p-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex gap-1" role="tablist" aria-label="꿈툰 말풍선 및 효과 카테고리">
            <button
              type="button"
              role="tab"
              aria-selected={assetCategory === "bubble"}
              data-testid="ggumtoon-asset-tab-bubble"
              onClick={() => setAssetCategory("bubble")}
              className={cn(
                "rounded px-2 py-1 text-[0.62rem] font-semibold transition-colors",
                assetCategory === "bubble"
                  ? "bg-accent text-fg"
                  : "bg-card text-fg-3 hover:text-fg",
              )}
            >
              말풍선 (66종)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={assetCategory === "effect"}
              data-testid="ggumtoon-asset-tab-effect"
              onClick={() => setAssetCategory("effect")}
              className={cn(
                "rounded px-2 py-1 text-[0.62rem] font-semibold transition-colors",
                assetCategory === "effect"
                  ? "bg-accent text-fg"
                  : "bg-card text-fg-3 hover:text-fg",
              )}
            >
              효과 (3종)
            </button>
          </div>
          <input
            type="search"
            aria-label="말풍선 번호 검색"
            data-testid="ggumtoon-bubble-number-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="번호 검색…"
            className="w-24 rounded border border-line bg-card px-2 py-0.5 text-[0.62rem] text-fg outline-none"
          />
        </div>

        <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto pt-1">
          {filteredTemplates.slice(0, 18).map((tpl) => (
            <button
              key={`${tpl.category}-${tpl.id}`}
              type="button"
              data-testid={`ggumtoon-tpl-${tpl.category}-${tpl.id}`}
              onClick={() => {
                setSelectedTemplateId(tpl.id);
                onInsertBubble?.(tpl.category === "effect" ? "shout" : "speech");
              }}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[0.58rem] font-medium transition-colors",
                selectedTemplateId === tpl.id
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line/60 bg-card text-fg-2 hover:bg-raised",
              )}
            >
              #{tpl.id} (원본 {tpl.assetNumber})
            </button>
          ))}
        </div>
        <p className="text-[0.58rem] text-fg-3">
          선택 에셋:{" "}
          <strong data-testid="ggumtoon-selected-tpl-src" className="text-fg-2">
            {filteredTemplates.find((t) => t.id === selectedTemplateId)?.src ??
              "/bubbles/bubble-57.png"}
          </strong>{" "}
          · 검색 결과 {filteredTemplates.length}개
        </p>
      </div>

      {/* 40종 한국어 서체 & dreamtoon_fav_fonts 즐겨찾기 */}
      <div className="space-y-1.5 rounded-lg border border-line/60 bg-raised/70 p-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[0.62rem] font-semibold text-fg">
            <Type size={11} aria-hidden="true" />
            40종 한국어 서체 ({GGUMTOON_BUBBLE_FONTS.length}종 · ★ 즐겨찾기{" "}
            {partitionedFonts.favorites.length}개)
          </span>
          <button
            type="button"
            data-testid="ggumtoon-toggle-fav-font-btn"
            onClick={() =>
              setFavoriteFonts((prev) => toggleGgumtoonFavoriteFont(prev, selectedFont))
            }
            className="inline-flex items-center gap-0.5 rounded border border-line bg-card px-1.5 py-0.5 text-[0.58rem] font-semibold text-fg-2 hover:bg-raised"
          >
            <Star size={10} aria-hidden="true" />
            {favoriteFonts.includes(selectedFont) ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기 추가"}
          </button>
        </div>

        <select
          aria-label="꿈툰 40종 한국어 서체 선택"
          data-testid="ggumtoon-font-select"
          value={selectedFont}
          onChange={(e) => {
            const nextFont = e.target.value;
            setSelectedFont(nextFont);
            setActiveLayer((prev) => ({ ...prev, fontFamily: nextFont }));
          }}
          className="w-full rounded border border-line bg-card px-2 py-1 text-[0.64rem] text-fg"
        >
          <optgroup label="★ 즐겨찾기 서체">
            {partitionedFonts.favorites.map((f) => (
              <option key={`fav-${f.family}`} value={f.family}>
                ★ {f.label} ({f.family})
              </option>
            ))}
          </optgroup>
          <optgroup label="전체 한국어 서체">
            {partitionedFonts.others.map((f) => (
              <option key={f.family} value={f.family}>
                {f.label} ({f.family})
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* 9종 도형 클립 프레임 + 꼬리 방향 + 6방향 정렬 + 60단계 Undo/Redo */}
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <div className="space-y-1 rounded-lg border border-line/60 bg-raised/70 p-2">
          <span className="inline-flex items-center gap-1 text-[0.6rem] font-semibold text-fg">
            <Frame size={11} aria-hidden="true" />
            도형 프레임 ({clipPolygon.length}꼭짓점) & 꼬리
          </span>
          <div className="flex flex-wrap gap-1">
            {GGUMTOON_CLIP_FRAMES.map((frame) => (
              <button
                key={frame.id}
                type="button"
                data-testid={`ggumtoon-clip-frame-${frame.id}`}
                onClick={() => setClipFrame(frame.id)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.56rem] font-medium",
                  clipFrame === frame.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line/60 bg-card text-fg-3",
                )}
              >
                {frame.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 pt-1">
            {(["bottom-left", "bottom-right", "none"] as const).map((dir) => (
              <button
                key={dir}
                type="button"
                data-testid={`ggumtoon-tail-${dir}`}
                onClick={() => setTailDirection(dir)}
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[0.55rem]",
                  tailDirection === dir
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line/60 bg-card text-fg-3",
                )}
              >
                꼬리:{dir}
              </button>
            ))}
          </div>
          <svg
            viewBox="0 0 140 76"
            className="h-9 w-full rounded bg-card/60"
            aria-label="말풍선 꼬리 벡터 미리보기"
          >
            <path
              data-testid="ggumtoon-tail-svg-path"
              d={tailSvgPath}
              fill="var(--color-accent-soft)"
              stroke="var(--color-accent)"
              strokeWidth="1.5"
            />
          </svg>
        </div>

        <div className="space-y-1 rounded-lg border border-line/60 bg-raised/70 p-2">
          <span className="text-[0.6rem] font-semibold text-fg">
            위치 정렬 (600px 캔버스) · 복제(+20px)
          </span>
          <div className="grid grid-cols-3 gap-1">
            {GGUMTOON_CANVAS_ALIGNMENTS.map((align) => (
              <button
                key={align.id}
                type="button"
                data-testid={`ggumtoon-align-${align.id}`}
                onClick={() => handleAlign(align.id)}
                className="rounded border border-line/60 bg-card px-1.5 py-0.5 text-[0.56rem] font-medium text-fg-2 hover:bg-raised"
              >
                {align.label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-1 pt-1">
            <button
              type="button"
              data-testid="ggumtoon-history-undo"
              disabled={!historyState.canUndo}
              onClick={handleUndo}
              className="inline-flex flex-1 items-center justify-center gap-0.5 rounded border border-line bg-card py-1 text-[0.58rem] font-semibold text-fg-2 disabled:opacity-40"
            >
              <Undo2 size={10} aria-hidden="true" />
              취소
            </button>
            <button
              type="button"
              data-testid="ggumtoon-history-redo"
              disabled={!historyState.canRedo}
              onClick={handleRedo}
              className="inline-flex flex-1 items-center justify-center gap-0.5 rounded border border-line bg-card py-1 text-[0.58rem] font-semibold text-fg-2 disabled:opacity-40"
            >
              <Redo2 size={10} aria-hidden="true" />
              다시
            </button>
            <button
              type="button"
              data-testid="ggumtoon-layer-clone"
              onClick={handleClone}
              className="inline-flex flex-1 items-center justify-center gap-0.5 rounded border border-accent/40 bg-accent-soft py-1 text-[0.58rem] font-semibold text-accent"
            >
              <Copy size={10} aria-hidden="true" />
              복제
            </button>
          </div>
          <p
            data-testid="ggumtoon-active-layer-coords"
            className="text-[0.56rem] text-fg-3"
          >
            좌표: ({activeLayer.left}, {activeLayer.top}) · 서체: {activeLayer.fontFamily}
          </p>
        </div>
      </div>
    </section>
  );
}
