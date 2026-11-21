/**
 * CSP EX 온캔버스 스마트폰 시야 마스크 오버레이 ("표시 영역(웹툰)").
 *
 * 작화 중 세로 웹툰 캔버스 위에서 독자가 스마트폰 한 화면으로 보게 되는 실제
 * 시야 창(9:16 / 9:19.5 / 9:20)을 반투명 마스크로 실시간 표시한다.
 * - 마스크 영역은 pointer-events-none 으로 드로잉/선택을 전혀 방해하지 않는다.
 * - 상단/우측 소형 컨트롤 바에서만 화면비 전환, 농도 조절, 켜기/끄기를 처리한다.
 * - 단일 컷 높이가 현재 시야 높이의 1.4배를 넘으면 즉시 긴 컷 경고 배지를 표시한다.
 */
import { AlertTriangle, Eye, EyeOff, Smartphone } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";

import { safeAreaMargin } from "../studio-webtoon-guides";
import { STUDIO_SCROLL_RHYTHM_OVERSIZED_PANEL_SCREENS } from "../studio-scroll-rhythm";

import { cn } from "@/shared/lib/utils";

export type WebtoonViewAreaAspectRatio = "9:16" | "9:19.5" | "9:20";

export interface WebtoonViewAreaPanelLike {
  readonly id: string;
  readonly y: number;
  readonly height: number;
}

export interface StudioWebtoonViewAreaOverlayProps {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  /** 캔버스 좌표계 기준 현재 스크롤 Y 위치(px). */
  readonly scrollTop: number;
  /** 캔버스 표시 배율(기본 1). */
  readonly scale?: number;
  readonly visible?: boolean;
  readonly aspectRatio?: WebtoonViewAreaAspectRatio;
  /** 마스크 어둡기 농도(0.2..0.85, 기본 0.56). */
  readonly maskOpacity?: number;
  /** 좌우 6% 안전영역 세로 안내선 표시 여부(기본 true). */
  readonly showSafeMargins?: boolean;
  /** 1.4 화면 초과 긴 컷 표시용 선택 컷 목록. */
  readonly panels?: readonly WebtoonViewAreaPanelLike[];
  readonly className?: string;
  readonly onChangeAspectRatio?: (ratio: WebtoonViewAreaAspectRatio) => void;
  readonly onToggleVisible?: (nextVisible: boolean) => void;
  readonly onChangeMaskOpacity?: (nextOpacity: number) => void;
}

interface AspectPreset {
  readonly id: WebtoonViewAreaAspectRatio;
  readonly label: string;
  readonly widthUnit: number;
  readonly heightUnit: number;
  readonly deviceHint: string;
}

const ASPECT_PRESETS: readonly AspectPreset[] = Object.freeze([
  { id: "9:16", label: "9:16", widthUnit: 9, heightUnit: 16, deviceHint: "표준" },
  { id: "9:19.5", label: "9:19.5", widthUnit: 9, heightUnit: 19.5, deviceHint: "와이드" },
  { id: "9:20", label: "9:20", widthUnit: 9, heightUnit: 20, deviceHint: "롱스크린" },
]);

const INTERACTIVE_TRANSITION =
  "transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none";

const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function presetForRatio(ratio: WebtoonViewAreaAspectRatio): AspectPreset {
  return ASPECT_PRESETS.find((preset) => preset.id === ratio) ?? ASPECT_PRESETS[0]!;
}

export function StudioWebtoonViewAreaOverlay({
  canvasWidth,
  canvasHeight,
  scrollTop,
  scale = 1,
  visible,
  aspectRatio,
  maskOpacity,
  showSafeMargins = true,
  panels = [],
  className,
  onChangeAspectRatio,
  onToggleVisible,
  onChangeMaskOpacity,
}: StudioWebtoonViewAreaOverlayProps): ReactElement {
  const [internalVisible, setInternalVisible] = useState(true);
  const [internalRatio, setInternalRatio] =
    useState<WebtoonViewAreaAspectRatio>("9:19.5");
  const [internalOpacity, setInternalOpacity] = useState(0.56);

  const isVisible = visible ?? internalVisible;
  const currentRatio = aspectRatio ?? internalRatio;
  const currentOpacity = clamp(maskOpacity ?? internalOpacity, 0.2, 0.85);
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const safeCanvasW = Math.max(1, Number.isFinite(canvasWidth) ? canvasWidth : 720);
  const safeCanvasH = Math.max(1, Number.isFinite(canvasHeight) ? canvasHeight : 1_280);
  const preset = presetForRatio(currentRatio);

  const geometry = useMemo(() => {
    const viewHeightCanvasPx = Math.round(
      safeCanvasW * (preset.heightUnit / preset.widthUnit),
    );
    const maxWindowTop = Math.max(0, safeCanvasH - viewHeightCanvasPx);
    const clampedTop = clamp(
      Number.isFinite(scrollTop) ? scrollTop : 0,
      0,
      maxWindowTop,
    );
    const windowHeight = Math.min(safeCanvasH, viewHeightCanvasPx);
    const windowBottom = Math.min(safeCanvasH, clampedTop + windowHeight);
    const bottomVeilHeight = Math.max(0, safeCanvasH - windowBottom);
    const currentScreenIndex =
      viewHeightCanvasPx > 0 ? clampedTop / viewHeightCanvasPx + 1 : 1;
    const totalScreens =
      viewHeightCanvasPx > 0 ? safeCanvasH / viewHeightCanvasPx : 1;

    return {
      viewHeightCanvasPx,
      windowTop: clampedTop,
      windowHeight,
      windowBottom,
      bottomVeilHeight,
      currentScreenIndex,
      totalScreens,
    };
  }, [preset.heightUnit, preset.widthUnit, safeCanvasH, safeCanvasW, scrollTop]);

  const safeMargin = useMemo(() => safeAreaMargin(safeCanvasW), [safeCanvasW]);

  const oversizedPanels = useMemo(
    () =>
      panels.filter(
        (panel) =>
          Number.isFinite(panel.height) &&
          panel.height > 0 &&
          panel.height / geometry.viewHeightCanvasPx >
            STUDIO_SCROLL_RHYTHM_OVERSIZED_PANEL_SCREENS,
      ),
    [geometry.viewHeightCanvasPx, panels],
  );

  const handleSelectRatio = (next: WebtoonViewAreaAspectRatio) => {
    if (onChangeAspectRatio) {
      onChangeAspectRatio(next);
    } else {
      setInternalRatio(next);
    }
  };

  const handleToggle = () => {
    const next = !isVisible;
    if (onToggleVisible) {
      onToggleVisible(next);
    } else {
      setInternalVisible(next);
    }
  };

  const handleOpacityChange = (next: number) => {
    const clamped = clamp(next, 0.2, 0.85);
    if (onChangeMaskOpacity) {
      onChangeMaskOpacity(clamped);
    } else {
      setInternalOpacity(clamped);
    }
  };

  const maskFill = `oklch(0.10 0.01 70 / ${currentOpacity.toFixed(2)})`;

  return (
    <div
      data-webtoon-view-area-overlay="true"
      data-aspect-ratio={currentRatio}
      data-mask-visible={isVisible ? "true" : "false"}
      className={cn(
        "pointer-events-none relative select-none [word-break:keep-all]",
        className,
      )}
      style={{
        width: safeCanvasW * safeScale,
        height: safeCanvasH * safeScale,
      }}
    >
      {/* 상단·하단 반투명 시야 마스크 + 현재 스마트폰 표시 창 프레임 */}
      {isVisible ? (
        <div
          aria-hidden="true"
          data-view-area-mask-layer="true"
          className="pointer-events-none absolute inset-0"
        >
          {/* 위쪽 가림막 */}
          <div
            data-view-area-veil="top"
            className="absolute inset-x-0 top-0"
            style={{
              height: geometry.windowTop * safeScale,
              backgroundColor: maskFill,
            }}
          />

          {/* 현재 스마트폰 시야 창 */}
          <div
            data-view-area-window="true"
            data-window-top={geometry.windowTop}
            data-window-height={geometry.windowHeight}
            className="absolute inset-x-0 border-y-2 border-accent"
            style={{
              top: geometry.windowTop * safeScale,
              height: geometry.windowHeight * safeScale,
            }}
          >
            {showSafeMargins ? (
              <>
                <div
                  data-view-area-safe-margin="left"
                  className="absolute inset-y-0 border-r border-dashed border-accent/60"
                  style={{ left: safeMargin.left * safeScale }}
                />
                <div
                  data-view-area-safe-margin="right"
                  className="absolute inset-y-0 border-l border-dashed border-accent/60"
                  style={{ right: safeMargin.right * safeScale }}
                />
              </>
            ) : null}

            <div className="absolute left-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-accent/50 bg-panel/90 px-2 py-0.5 text-[11px] font-bold tabular-nums text-fg shadow-sm">
              <Smartphone size={12} aria-hidden className="text-accent" />
              <span>
                {preset.label} · {geometry.currentScreenIndex.toFixed(1)} /{" "}
                {geometry.totalScreens.toFixed(1)}화면
              </span>
            </div>
          </div>

          {/* 아래쪽 가림막 */}
          <div
            data-view-area-veil="bottom"
            className="absolute inset-x-0 bottom-0"
            style={{
              height: geometry.bottomVeilHeight * safeScale,
              backgroundColor: maskFill,
            }}
          />

          {/* 1.4화면 초과 긴 컷 마커 */}
          {oversizedPanels.map((panel) => {
            const screens = panel.height / geometry.viewHeightCanvasPx;
            return (
              <div
                key={panel.id}
                data-oversized-panel-id={panel.id}
                className="absolute inset-x-1 rounded-md border border-dashed border-warn bg-warn/10"
                style={{
                  top: clamp(panel.y, 0, safeCanvasH) * safeScale,
                  height: Math.min(panel.height, safeCanvasH) * safeScale,
                }}
              >
                <span className="absolute right-2 top-1 inline-flex items-center gap-1 rounded-md border border-warn/50 bg-panel/95 px-2 py-0.5 text-[11px] font-bold tabular-nums text-warn">
                  <AlertTriangle size={12} aria-hidden />
                  긴 컷 {screens.toFixed(1)}화면
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* 플로팅 컨트롤 바 (pointer-events-auto, 44px 터치 타깃) */}
      <div
        role="toolbar"
        aria-label="웹툰 스마트폰 시야 마스크 제어"
        className="pointer-events-auto sticky top-2 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-1.5 rounded-2xl border border-line bg-panel/95 p-1.5 text-fg shadow-lg backdrop-blur-md"
      >
        <button
          type="button"
          aria-pressed={isVisible}
          onClick={handleToggle}
          className={cn(
            "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold",
            INTERACTIVE_TRANSITION,
            FOCUS_RING,
            isVisible
              ? "border-accent bg-accent text-on-accent"
              : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          {isVisible ? <Eye size={14} aria-hidden /> : <EyeOff size={14} aria-hidden />}
          <span>{isVisible ? "시야 마스크 켜짐" : "시야 마스크 꺼짐"}</span>
        </button>

        <div role="group" aria-label="스마트폰 화면비 선택" className="inline-flex gap-1">
          {ASPECT_PRESETS.map((item) => {
            const active = currentRatio === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectRatio(item.id)}
                className={cn(
                  "min-h-11 rounded-lg border px-2.5 text-xs font-bold tabular-nums",
                  INTERACTIVE_TRANSITION,
                  FOCUS_RING,
                  active
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        <label className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 text-xs text-fg-2">
          <span>농도</span>
          <input
            type="range"
            min={20}
            max={85}
            value={Math.round(currentOpacity * 100)}
            aria-label="시야 마스크 농도"
            onChange={(event) => handleOpacityChange(Number(event.target.value) / 100)}
            className="h-6 w-20 accent-accent"
          />
          <span className="w-8 text-right font-semibold tabular-nums text-fg">
            {Math.round(currentOpacity * 100)}%
          </span>
        </label>

        <span
          aria-live="polite"
          className="rounded-lg border border-line bg-card px-2.5 py-2 text-xs font-semibold tabular-nums text-fg-2"
        >
          Y {Math.round(geometry.windowTop)}–{Math.round(geometry.windowBottom)}px · 1화면{" "}
          {geometry.viewHeightCanvasPx}px
        </span>

        {oversizedPanels.length > 0 ? (
          <span className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-warn/50 bg-warn/15 px-2.5 text-xs font-bold tabular-nums text-warn">
            <AlertTriangle size={13} aria-hidden />
            긴 컷 {oversizedPanels.length}건
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default StudioWebtoonViewAreaOverlay;
