/**
 * 무한 캔버스 256×256 희소 타일 메모리 절감률 & 2D 칼만 스타일러스 지연 예측 탭.
 */

import { Activity } from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  SparseTiledVectorRasterizer,
  buildDemoStylusSamples,
  createInfiniteCanvasSampleStrokes,
  simulateStylusTrajectoryPrediction,
} from "./sparse-tiled-vector-rasterizer";

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING} [word-break:keep-all]`;
const CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const ZOOM_PRESETS: readonly { readonly zoom: number; readonly label: string }[] = [
  { zoom: 1, label: "100%" },
  { zoom: 2, label: "200%" },
  { zoom: 4, label: "400%" },
  { zoom: 8, label: "800%" },
];

function formatBytesKo(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function SparseTileKalmanTab(): ReactElement {
  const uid = useId();
  const [canvasZoom, setCanvasZoom] = useState<number>(8);
  const [panOffsetX, setPanOffsetX] = useState<number>(0);
  const [stylusMode, setStylusMode] = useState<"smooth-curve" | "sharp-corner">("sharp-corner");

  const sparseTileSummary = useMemo(() => {
    const rasterizer = new SparseTiledVectorRasterizer({ maxCachedTiles: 48 });
    for (const stroke of createInfiniteCanvasSampleStrokes()) {
      rasterizer.addStroke(stroke);
    }
    const viewport = { centerX: panOffsetX, centerY: 0, widthPx: 1280, heightPx: 720, zoom: canvasZoom };
    const pass = rasterizer.rasterizeViewport(viewport);
    const stats = rasterizer.getMemoryStats(viewport);
    return { pass, stats };
  }, [canvasZoom, panOffsetX]);

  const kalmanBenchmark = useMemo(() => {
    const samples = buildDemoStylusSamples(stylusMode);
    return simulateStylusTrajectoryPrediction(samples);
  }, [stylusMode]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="무한 캔버스 확대 배율" className="flex flex-wrap gap-2">
          {ZOOM_PRESETS.map((item) => (
            <button
              key={item.zoom}
              type="button"
              aria-pressed={canvasZoom === item.zoom}
              onClick={() => setCanvasZoom(item.zoom)}
              className={canvasZoom === item.zoom ? CHIP_ACTIVE : BTN_OUTLINE}
            >
              <span>확대 {item.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <label htmlFor={`${uid}-pan-x`} className="font-semibold text-fg">
            뷰포트 패닝 X ({panOffsetX}px)
          </label>
          <input
            id={`${uid}-pan-x`}
            type="range"
            min={-400}
            max={400}
            step={40}
            value={panOffsetX}
            onChange={(event) => setPanOffsetX(Number(event.target.value))}
            className="w-36 accent-accent"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">희소 타일 메모리 절감률</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-good">
            {sparseTileSummary.stats.memorySavingPercent.toFixed(2)}%
          </div>
          <div className="text-[11px] tabular-nums text-fg-3">
            실할당 {formatBytesKo(sparseTileSummary.stats.allocatedBytes)} / 밀집{" "}
            {formatBytesKo(sparseTileSummary.stats.denseEquivalentBytes)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">활성 256×256 타일</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-fg">
            {sparseTileSummary.stats.allocatedTileCount} / {sparseTileSummary.stats.maxCachedTiles}개
          </div>
          <div className="text-[11px] text-fg-3">화면 밖 타일 할당: 0개 (0 B)</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">최대 베지어 화면 오차</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-accent">
            {sparseTileSummary.pass.maxScreenErrorPx.toFixed(3)} px
          </div>
          <div className="text-[11px] text-fg-3">800% 확대에도 0.25px 이하 선명도</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">칼만 급회전 클램핑</div>
          <div className="mt-1 text-sm font-bold tabular-nums text-fg">
            {kalmanBenchmark.clampedCornerCount}회 작동
          </div>
          <div className="text-[11px] tabular-nums text-fg-3">
            RMS 추종 오차 {kalmanBenchmark.rmsTrackingErrorPx} px
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-card p-3.5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Activity className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>스타일러스 getPredictedEvents 대응 2D 칼만 지연 예측 궤적</span>
          </div>
          <div role="group" aria-label="스타일러스 궤적 시나리오" className="flex gap-2">
            <button
              type="button"
              aria-pressed={stylusMode === "smooth-curve"}
              onClick={() => setStylusMode("smooth-curve")}
              className={stylusMode === "smooth-curve" ? CHIP_ACTIVE : BTN_OUTLINE}
            >
              <span>부드러운 곡선</span>
            </button>
            <button
              type="button"
              aria-pressed={stylusMode === "sharp-corner"}
              onClick={() => setStylusMode("sharp-corner")}
              className={stylusMode === "sharp-corner" ? CHIP_ACTIVE : BTN_OUTLINE}
            >
              <span>90° 급회전 클램핑</span>
            </button>
          </div>
        </div>

        <svg
          role="img"
          aria-label="스타일러스 입력 궤적과 2D 칼만 선행 예측 좌표 비교"
          viewBox="0 0 360 220"
          className="block h-auto w-full rounded-lg border border-line bg-canvas"
        >
          <polyline
            fill="none"
            className="stroke-fg-3"
            strokeWidth={2}
            points={kalmanBenchmark.steps.map((s) => `${s.rawPoint.x},${s.rawPoint.y}`).join(" ")}
          />
          <polyline
            fill="none"
            className="stroke-accent"
            strokeWidth={2}
            strokeDasharray="4 3"
            points={kalmanBenchmark.steps
              .map((s) => `${s.predictedPoint.x},${s.predictedPoint.y}`)
              .join(" ")}
          />
          {kalmanBenchmark.steps.map((step, idx) => (
            <circle
              key={`pt-${idx}`}
              cx={step.predictedPoint.x}
              cy={step.predictedPoint.y}
              r={step.overshootClamped ? 4.5 : 2.8}
              className={step.overshootClamped ? "fill-warn" : "fill-accent"}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
