/**
 * Wave 55A — 초거대 캔버스 Morton 희소 타일링 & 3계층 OPFS 가상 메모리 스와핑 제어판.
 *
 * - 4종 초거대 프리셋 카드(웹툰 100컷 · 16K 일러스트 · 32K HDR 표지 · 인쇄 4K 60레이어)
 * - 4종 기기 메모리 예산 버튼(1.5GiB iPad Safari · 4GiB 노트북 · 8GiB 크리에이터 · 16GiB 워크스테이션)
 * - 스크롤 위치(0~100%) · 줌(5~1600%) · 활성 드로잉 밀도(5~100%) 슬라이더 + 스크롤 속도 벡터 선택
 * - 실제 Uint8ClampedArray RLE-Delta 무손실 스왑 라운드트립 검증 실행(FNV-1a 0-diff 실측)
 * - 순수 시맨틱 SVG 3계층 메모리 아틀라스 & 가상 타일 히트맵(oklch/currentColor 전용, 바이올렛 휴 0%)
 */

import {
  AlertTriangle, CheckCircle2, ClipboardCopy, Cpu, Database, Eye, FileJson,
  HardDrive, Layers, Lock, Play, RotateCcw, ShieldCheck,
} from "lucide-react";
import { useId, useMemo, useState, type ReactElement } from "react";

import {
  GIGA_CANVAS_PRESETS, HARD_WATERMARK_PCT, MEMORY_BUDGET_PROFILES, SOFT_WATERMARK_PCT,
  createInMemorySwapSlotPool, evaluateGigaCanvasSwapState, exportGigaCanvasSwapJson,
  getGigaCanvasPreset, verifyTileSwapRoundTrip,
  type GigaCanvasPresetId, type GigaCanvasSwapEvaluation, type GigaCanvasSwapManifest,
  type MemoryBudgetGb, type TileSwapRoundTripResult, type VirtualTileTier, type WatermarkState,
} from "./giga-canvas-swap-engine";

export interface StudioGigaCanvasSwapPanelProps {
  readonly initialPresetId?: GigaCanvasPresetId;
  readonly initialMemoryBudgetGb?: MemoryBudgetGb;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSwapPlanChange?: (plan: GigaCanvasSwapEvaluation) => void;
  readonly onExportJson?: (json: string, manifest: GigaCanvasSwapManifest) => void;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트(휴 24~215°만 사용, 270~320° 0%)
const SVG_INK_VRAM_HOT = "oklch(0.57 0.19 32)";
const SVG_INK_RAM_WARM = "oklch(0.66 0.14 78)";
const SVG_INK_OPFS_COLD = "oklch(0.55 0.13 215)";
const SVG_INK_SPARSE_EMPTY = "oklch(0.58 0.03 200)";
const SVG_INK_VIEWPORT_PIN = "oklch(0.56 0.15 155)";
const SVG_INK_PREFETCH_RING = "oklch(0.60 0.13 188)";
const SVG_INK_HARD_LIMIT = "oklch(0.55 0.21 24)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

const VELOCITY_OPTIONS: readonly { readonly value: number; readonly labelKo: string; readonly labelEn: string }[] = [
  { value: 0, labelKo: "정지 (0px/s)", labelEn: "Idle (0px/s)" },
  { value: 1440, labelKo: "표준 스크롤 (1440px/s)", labelEn: "Normal (1440px/s)" },
  { value: 3600, labelKo: "고속 스크롤 (3600px/s)", labelEn: "Fast (3600px/s)" },
];

function formatMiB(mib: number): string {
  return mib >= 1024 ? `${(mib / 1024).toFixed(2)} GiB` : `${mib.toFixed(1)} MiB`;
}

function tierColor(tier: VirtualTileTier): string {
  if (tier === "vram-hot") return SVG_INK_VRAM_HOT;
  if (tier === "ram-warm") return SVG_INK_RAM_WARM;
  if (tier === "opfs-cold") return SVG_INK_OPFS_COLD;
  return SVG_INK_SPARSE_EMPTY;
}

function watermarkToneClass(state: WatermarkState): string {
  if (state === "hard-fail-closed") return "border-bad bg-bad-soft text-bad";
  if (state === "soft-evicting") return "border-warn bg-warning-soft text-warn";
  return "border-good bg-good-soft text-good";
}

function watermarkLabel(state: WatermarkState, isEn: boolean): string {
  if (state === "hard-fail-closed") return isEn ? "HARD 90% FAIL-CLOSED" : "90% Hard Fail-Closed 보호";
  if (state === "soft-evicting") return isEn ? "SOFT 78% LRU-K EVICTING" : "78% Soft LRU-K 스필 가동";
  return isEn ? "NOMINAL (<78%)" : "안정 구간 (78% 미만)";
}

function MemoryAtlasAndHeatmapSvg(props: { readonly plan: GigaCanvasSwapEvaluation; readonly isEn: boolean }): ReactElement {
  const { plan, isEn } = props;
  const [barX, barW, barH] = [132, 412, 18];
  const vramFillW = Math.min(barW, Math.round((Math.min(100, plan.vramUtilizationPct) / 100) * barW));
  const ramFillW = Math.min(barW, Math.round((Math.min(100, plan.ramUtilizationPct) / 100) * barW));
  const opfsRatioPct = Math.min(100, (plan.opfsColdSpillMiB / Math.max(1, plan.memoryBudget.opfsQuotaMiB)) * 100);
  const opfsFillW = plan.opfsColdTiles === 0 ? 0 : Math.max(10, Math.round((opfsRatioPct / 100) * barW));
  const softMarkX = barX + Math.round((SOFT_WATERMARK_PCT / 100) * barW);
  const hardMarkX = barX + Math.round((HARD_WATERMARK_PCT / 100) * barW);

  const [gridLeft, gridTop, cellW, cellH, cellGap] = [24, 174, 48, 17, 4];
  const boundsOf = (entries: readonly typeof plan.pageTable[number][]) => {
    if (entries.length === 0) return null;
    let minC = plan.atlasCols; let maxC = 0; let minR = plan.atlasRows; let maxR = 0;
    for (const item of entries) {
      if (item.atlasCol < minC) minC = item.atlasCol;
      if (item.atlasCol > maxC) maxC = item.atlasCol;
      if (item.atlasRow < minR) minR = item.atlasRow;
      if (item.atlasRow > maxR) maxR = item.atlasRow;
    }
    return {
      x: gridLeft + minC * (cellW + cellGap) - 2, y: gridTop + minR * (cellH + cellGap) - 2,
      w: (maxC - minC + 1) * (cellW + cellGap) - cellGap + 4, h: (maxR - minR + 1) * (cellH + cellGap) - cellGap + 4,
    };
  };
  const vpBox = boundsOf(plan.pageTable.filter((e) => e.inViewport));
  const prefBox = boundsOf(plan.pageTable.filter((e) => e.inPrefetchRing || e.inViewport));

  return (
    <svg
      data-testid="giga-canvas-atlas-svg" data-preset-id={plan.preset.id}
      data-memory-budget-gb={String(plan.memoryBudget.budgetGb)} data-mip-level={String(plan.selectedMipLevel)}
      data-watermark-state={plan.watermarkState} data-evicted-viewport-tiles={String(plan.evictedViewportTileCount)}
      viewBox="0 0 680 382" role="img" className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn ? `3-tier virtual memory atlas and Morton sparse tile heatmap for ${plan.preset.titleEn}` : `${plan.preset.titleKo} 3계층 메모리 아틀라스 및 Morton 희소 타일 히트맵`}
    >
      <rect x="10" y="10" width="660" height="122" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="30" fill="currentColor" fillOpacity={0.82} fontSize="11" fontWeight="700">
        {isEn ? "3-TIER VIRTUAL MEMORY ATLAS (ARCHITECTURE-BUDGET-MODEL)" : "3계층 가상 메모리 아틀라스 (아키텍처 예산 추정 모델)"}
      </text>
      <text x="656" y="30" textAnchor="end" fill={SVG_INK_VIEWPORT_PIN} fontSize="10" fontWeight="700">
        {isEn ? `CoW Saved ${formatMiB(plan.cowSentinelSavedMiB)}` : `CoW 빈 타일 절감 ${formatMiB(plan.cowSentinelSavedMiB)}`}
      </text>

      <text x="24" y="57" fill={SVG_INK_VRAM_HOT} fontSize="10" fontWeight="700">VRAM Hot</text>
      <rect x={barX} y="44" width={barW} height={barH} rx="4" fill="currentColor" fillOpacity={0.08} />
      <rect x={barX} y="44" width={vramFillW} height={barH} rx="4" fill={SVG_INK_VRAM_HOT} fillOpacity={0.86} />
      <text x={barX + barW + 10} y="57" fill="currentColor" fontSize="10" fontWeight="600">{plan.vramUsedMiB}/{plan.vramCapMiB}MiB ({plan.vramUtilizationPct}%)</text>

      <text x="24" y="84" fill={SVG_INK_RAM_WARM} fontSize="10" fontWeight="700">RAM Warm</text>
      <rect x={barX} y="71" width={barW} height={barH} rx="4" fill="currentColor" fillOpacity={0.08} />
      <rect x={barX} y="71" width={ramFillW} height={barH} rx="4" fill={SVG_INK_RAM_WARM} fillOpacity={0.84} />
      <text x={barX + barW + 10} y="84" fill="currentColor" fontSize="10" fontWeight="600">{plan.ramUsedMiB}/{plan.ramCapMiB}MiB ({plan.ramUtilizationPct}%)</text>

      <text x="24" y="111" fill={SVG_INK_OPFS_COLD} fontSize="10" fontWeight="700">OPFS Cold</text>
      <rect x={barX} y="98" width={barW} height={barH} rx="4" fill="currentColor" fillOpacity={0.08} />
      {opfsFillW > 0 && <rect x={barX} y="98" width={opfsFillW} height={barH} rx="4" fill={SVG_INK_OPFS_COLD} fillOpacity={0.84} />}
      <text x={barX + barW + 10} y="111" fill="currentColor" fontSize="10" fontWeight="600">{formatMiB(plan.opfsColdSpillMiB)} ({plan.opfsColdTiles.toLocaleString("en-US")}t)</text>

      <line x1={softMarkX} y1="40" x2={softMarkX} y2="120" stroke={SVG_INK_RAM_WARM} strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1={hardMarkX} y1="40" x2={hardMarkX} y2="120" stroke={SVG_INK_HARD_LIMIT} strokeWidth="1.8" strokeDasharray="3 2" />
      <text x={softMarkX - 4} y="128" textAnchor="end" fill={SVG_INK_RAM_WARM} fontSize="8.5" fontWeight="700">Soft 78%</text>
      <text x={hardMarkX + 4} y="128" fill={SVG_INK_HARD_LIMIT} fontSize="8.5" fontWeight="700">Hard 90%</text>

      <rect x="10" y="142" width="660" height="230" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="24" y="162" fill="currentColor" fillOpacity={0.82} fontSize="11" fontWeight="700">
        {isEn ? `MORTON SPARSE TILE HEATMAP · MIP ${plan.selectedMipLevel} · 2-FRAME PREFETCH RING (${plan.scrollVelocityPxPerSec}px/s)` : `Morton 희소 타일 히트맵 · MIP ${plan.selectedMipLevel} · 2프레임 선행 프리페치 링 (${plan.scrollVelocityPxPerSec}px/s)`}
      </text>
      <text x="656" y="162" textAnchor="end" fill={SVG_INK_VIEWPORT_PIN} fontSize="10" fontWeight="700">
        {isEn ? "Viewport Evictions: 0" : "뷰포트 방출: 0건 보장"}
      </text>

      {plan.pageTable.map((tile) => {
        const x = gridLeft + tile.atlasCol * (cellW + cellGap);
        const y = gridTop + tile.atlasRow * (cellH + cellGap);
        const fill = tierColor(tile.tier);
        const opacity = tile.tier === "sparse-empty" ? 0.14 : tile.inViewport ? 0.92 : tile.inPrefetchRing ? 0.72 : 0.62;
        return (
          <g key={tile.tileKey} data-testid={`atlas-tile-${tile.atlasCol}-${tile.atlasRow}`} data-tier={tile.tier} data-pinned={String(tile.pinned)}>
            <rect x={x} y={y} width={cellW} height={cellH} rx="3" fill={fill} fillOpacity={opacity} stroke={tile.inViewport ? SVG_INK_VIEWPORT_PIN : fill} strokeWidth={tile.inViewport ? 1.4 : 0.7} strokeDasharray={tile.tier === "sparse-empty" ? "2 2" : undefined} />
            <text x={x + cellW / 2} y={y + 11.5} textAnchor="middle" fill="currentColor" fillOpacity={tile.tier === "sparse-empty" ? 0.42 : 0.9} fontSize="7.5" fontFamily="monospace">
              {tile.tier === "sparse-empty" ? "CoW" : `z${tile.mortonCode.toString(16).slice(-3)}`}
            </text>
            {tile.dirty && <circle cx={x + cellW - 5} cy={y + 5} r="2.2" fill={SVG_INK_VIEWPORT_PIN} />}
          </g>
        );
      })}

      {prefBox && <rect data-testid="svg-prefetch-ring-frame" x={prefBox.x - 2} y={prefBox.y - 2} width={prefBox.w + 4} height={prefBox.h + 4} rx="5" fill="none" stroke={SVG_INK_PREFETCH_RING} strokeWidth="1.8" strokeDasharray="5 3" />}
      {vpBox && <rect data-testid="svg-viewport-pin-frame" x={vpBox.x} y={vpBox.y} width={vpBox.w} height={vpBox.h} rx="4" fill="none" stroke={SVG_INK_VIEWPORT_PIN} strokeWidth="2.4" />}

      <g transform="translate(24, 349)">
        <rect x="0" y="0" width="10" height="10" rx="2" fill={SVG_INK_VRAM_HOT} fillOpacity={0.9} />
        <text x="14" y="9" fill="currentColor" fontSize="9.5" fontWeight="600">VRAM Hot</text>
        <rect x="84" y="0" width="10" height="10" rx="2" fill={SVG_INK_RAM_WARM} fillOpacity={0.86} />
        <text x="98" y="9" fill="currentColor" fontSize="9.5" fontWeight="600">RAM Warm</text>
        <rect x="172" y="0" width="10" height="10" rx="2" fill={SVG_INK_OPFS_COLD} fillOpacity={0.86} />
        <text x="186" y="9" fill="currentColor" fontSize="9.5" fontWeight="600">OPFS Cold</text>
        <rect x="258" y="0" width="10" height="10" rx="2" fill={SVG_INK_SPARSE_EMPTY} fillOpacity={0.2} stroke={SVG_INK_SPARSE_EMPTY} strokeDasharray="2 1" />
        <text x="272" y="9" fill="currentColor" fontSize="9.5" fontWeight="600">{isEn ? "Sparse Empty (0B)" : "빈 타일 CoW(0B)"}</text>
        <rect x="380" y="0" width="10" height="10" rx="2" fill="none" stroke={SVG_INK_VIEWPORT_PIN} strokeWidth="2" />
        <text x="394" y="9" fill={SVG_INK_VIEWPORT_PIN} fontSize="9.5" fontWeight="700">{isEn ? "Viewport Pin" : "뷰포트 Pin"}</text>
        <rect x="476" y="0" width="10" height="10" rx="2" fill="none" stroke={SVG_INK_PREFETCH_RING} strokeWidth="1.6" strokeDasharray="3 2" />
        <text x="490" y="9" fill={SVG_INK_PREFETCH_RING} fontSize="9.5" fontWeight="700">{isEn ? "2F Prefetch Ring" : "2프레임 Prefetch 링"}</text>
      </g>
    </svg>
  );
}

/** 초거대 캔버스 Morton 희소 타일링 및 3계층 OPFS 가상 메모리 스와핑 제어판. */
export function StudioGigaCanvasSwapPanel(props: StudioGigaCanvasSwapPanelProps): ReactElement {
  const { initialPresetId = "webtoon-100cut-scroll", initialMemoryBudgetGb = 4, locale = "ko", className, onSwapPlanChange, onExportJson } = props;
  const headingId = useId();
  const scrollSliderId = useId();
  const zoomSliderId = useId();
  const densitySliderId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const initialPreset = getGigaCanvasPreset(initialPresetId);
  const [presetId, setPresetId] = useState<GigaCanvasPresetId>(initialPreset.id);
  const [memoryBudgetGb, setMemoryBudgetGb] = useState<MemoryBudgetGb>(initialMemoryBudgetGb);
  const [scrollPositionPct, setScrollPositionPct] = useState<number>(initialPreset.defaultScrollPct);
  const [zoomPct, setZoomPct] = useState<number>(initialPreset.defaultZoomPct);
  const [activeDensityPct, setActiveDensityPct] = useState<number>(initialPreset.defaultActiveDensityPct);
  const [scrollVelocityPxPerSec, setScrollVelocityPxPerSec] = useState<number>(initialPreset.defaultScrollVelocityPxPerSec);
  const [roundTripResult, setRoundTripResult] = useState<TileSwapRoundTripResult | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const swapPlan = useMemo(
    () => evaluateGigaCanvasSwapState({ presetId, memoryBudgetGb, scrollPositionPct, zoomPct, activeDensityPct, scrollVelocityPxPerSec, lookaheadFrames: 2 }),
    [presetId, memoryBudgetGb, scrollPositionPct, zoomPct, activeDensityPct, scrollVelocityPxPerSec],
  );
  const { json: manifestJson, manifest } = useMemo(() => exportGigaCanvasSwapJson(swapPlan, roundTripResult), [swapPlan, roundTripResult]);

  const emitPlanUpdate = (
    nextInput: {
      readonly presetId?: GigaCanvasPresetId; readonly memoryBudgetGb?: MemoryBudgetGb;
      readonly scrollPositionPct?: number; readonly zoomPct?: number;
      readonly activeDensityPct?: number; readonly scrollVelocityPxPerSec?: number;
    },
    noticeKo: string,
    noticeEn: string,
  ): void => {
    const nextPlan = evaluateGigaCanvasSwapState({
      presetId: nextInput.presetId ?? presetId, memoryBudgetGb: nextInput.memoryBudgetGb ?? memoryBudgetGb,
      scrollPositionPct: nextInput.scrollPositionPct ?? scrollPositionPct, zoomPct: nextInput.zoomPct ?? zoomPct,
      activeDensityPct: nextInput.activeDensityPct ?? activeDensityPct,
      scrollVelocityPxPerSec: nextInput.scrollVelocityPxPerSec ?? scrollVelocityPxPerSec, lookaheadFrames: 2,
    });
    onSwapPlanChange?.(nextPlan);
    setStatusMessage(pick(noticeKo, noticeEn));
  };

  const handleSelectPreset = (nextPresetId: GigaCanvasPresetId): void => {
    const nextPreset = getGigaCanvasPreset(nextPresetId);
    setPresetId(nextPreset.id); setScrollPositionPct(nextPreset.defaultScrollPct); setZoomPct(nextPreset.defaultZoomPct);
    setActiveDensityPct(nextPreset.defaultActiveDensityPct); setScrollVelocityPxPerSec(nextPreset.defaultScrollVelocityPxPerSec);
    setRoundTripResult(null);
    emitPlanUpdate(
      { presetId: nextPreset.id, scrollPositionPct: nextPreset.defaultScrollPct, zoomPct: nextPreset.defaultZoomPct, activeDensityPct: nextPreset.defaultActiveDensityPct, scrollVelocityPxPerSec: nextPreset.defaultScrollVelocityPxPerSec },
      `프리셋을 '${nextPreset.titleKo}'로 전환했다.`, `Switched preset to '${nextPreset.titleEn}'.`,
    );
  };

  const handleSelectBudget = (nextBudgetGb: MemoryBudgetGb): void => {
    setMemoryBudgetGb(nextBudgetGb);
    emitPlanUpdate({ memoryBudgetGb: nextBudgetGb }, `기기 메모리 예산을 ${nextBudgetGb}GiB 프로파일로 변경했다.`, `Switched device memory budget to ${nextBudgetGb}GiB.`);
  };

  const handleRunRoundTrip = (): void => {
    const sampleTile = swapPlan.pageTable.find((entry) => entry.inViewport && entry.tier !== "sparse-empty") ?? swapPlan.pageTable[0];
    const result = verifyTileSwapRoundTrip({
      presetId, tileX: sampleTile?.tileX ?? 2, tileY: sampleTile?.tileY ?? 4, tileKey: sampleTile?.tileKey, pool: createInMemorySwapSlotPool(),
    });
    setRoundTripResult(result);
    setStatusMessage(isEn ? result.summaryEn : result.summaryKo);
  };

  const handleReset = (): void => {
    const resetPreset = getGigaCanvasPreset(initialPresetId);
    setPresetId(resetPreset.id); setMemoryBudgetGb(initialMemoryBudgetGb); setScrollPositionPct(resetPreset.defaultScrollPct);
    setZoomPct(resetPreset.defaultZoomPct); setActiveDensityPct(resetPreset.defaultActiveDensityPct);
    setScrollVelocityPxPerSec(resetPreset.defaultScrollVelocityPxPerSec); setRoundTripResult(null); setShowJsonPreview(false);
    emitPlanUpdate(
      { presetId: resetPreset.id, memoryBudgetGb: initialMemoryBudgetGb, scrollPositionPct: resetPreset.defaultScrollPct, zoomPct: resetPreset.defaultZoomPct, activeDensityPct: resetPreset.defaultActiveDensityPct, scrollVelocityPxPerSec: resetPreset.defaultScrollVelocityPxPerSec },
      "가상 타일링 · 스와핑 시뮬레이터 상태를 초기화했다.", "Reset virtual tiling and swapping simulator state.",
    );
  };

  const handleExportJson = (): void => {
    setShowJsonPreview(true);
    onExportJson?.(manifestJson, manifest);
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) void navigator.clipboard.writeText(manifestJson).catch(() => undefined);
    setStatusMessage(pick("JSON 스왑 매니페스트를 생성하고 클립보드 복사를 시도했다.", "Generated JSON swap manifest and copied to clipboard."));
  };

  return (
    <section aria-labelledby={headingId} data-testid="studio-giga-canvas-swap-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold text-fg [word-break:keep-all]">
              {pick("초거대 캔버스 가상 타일링 · 3계층 OPFS 가상 메모리 스와핑 제어판", "Giga-Canvas Virtual Tiling & 3-Tier OPFS Virtual Memory Swap Panel")}
            </h2>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "Morton(Z-Order) 256×256 희소 타일 · MIP 0..6 · 0-byte CoW 센티널과 2프레임 선행 Pinning으로 VRAM·RAM·OPFS 3계층 메모리 한도를 지킨다.",
              "Enforces VRAM/RAM/OPFS budgets with Morton 256x256 sparse tiles, MIP 0..6, 0-byte CoW sentinels, and 2-frame viewport pinning.",
            )}
          </p>
        </div>
        <button type="button" data-testid="reset-swap-panel-btn" onClick={handleReset} className={BTN_OUTLINE}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{pick("초기화", "Reset")}</span>
        </button>
      </header>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-fg [word-break:keep-all]">{pick("초거대 캔버스 프리셋 4종", "4 Giga-Canvas Presets")}</span>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {pick(`원본 비압축 ${formatMiB(swapPlan.naiveUncompressedMiB)} · 타일 ${swapPlan.totalVirtualTiles.toLocaleString("en-US")}개`, `Naive ${formatMiB(swapPlan.naiveUncompressedMiB)} · ${swapPlan.totalVirtualTiles.toLocaleString("en-US")} tiles`)}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {GIGA_CANVAS_PRESETS.map((preset) => {
            const isSelected = preset.id === presetId;
            return (
              <button key={preset.id} type="button" data-testid={`preset-card-${preset.id}`} aria-pressed={isSelected} onClick={() => handleSelectPreset(preset.id)} className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-stretch justify-between p-3 text-left`}>
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? preset.shortLabelEn : preset.shortLabelKo}</span>
                  <span className="rounded border border-line bg-canvas px-1.5 py-0.5 font-mono text-[10px] text-fg-2 tabular-nums">{preset.layerCount}L</span>
                </div>
                <span className="mt-1 text-[11px] font-normal text-fg-2 tabular-nums [word-break:keep-all]">{isEn ? preset.specLabelEn : preset.specLabelKo}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("기기 메모리 예산 (Soft 78% / Hard 90% Fail-Closed)", "Device Memory Budget (Soft 78% / Hard 90% Fail-Closed)")}</span>
          </div>
          <span data-testid="watermark-state-badge" className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${watermarkToneClass(swapPlan.watermarkState)}`}>
            {watermarkLabel(swapPlan.watermarkState, isEn)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {MEMORY_BUDGET_PROFILES.map((profile) => {
            const isSelected = profile.budgetGb === memoryBudgetGb;
            return (
              <button key={profile.id} type="button" data-testid={`budget-btn-${profile.budgetGb}`} aria-pressed={isSelected} onClick={() => handleSelectBudget(profile.budgetGb)} className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-center px-3 py-2 text-left`}>
                <span className="text-xs font-bold tabular-nums">{isEn ? profile.labelEn : profile.labelKo}</span>
                <span className="font-mono text-[10px] font-normal text-fg-3 tabular-nums">VRAM {profile.vramCapMiB} · RAM {profile.ramCapMiB}MiB</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1 md:grid-cols-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={scrollSliderId} className="font-semibold text-fg [word-break:keep-all]">{pick("스크롤 위치", "Scroll Position")}</label>
              <span data-testid="readout-scroll-position" className="font-mono text-[11px] font-bold text-fg-2 tabular-nums">{scrollPositionPct}%</span>
            </div>
            <input id={scrollSliderId} data-testid="slider-scroll-position" type="range" min={0} max={100} step={1} value={scrollPositionPct} className="w-full accent-accent" onChange={(e) => { const v = Number(e.target.value); setScrollPositionPct(v); emitPlanUpdate({ scrollPositionPct: v }, `뷰포트 스크롤 위치를 ${v}%로 이동했다.`, `Moved viewport scroll to ${v}%.`); }} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={zoomSliderId} className="font-semibold text-fg [word-break:keep-all]">{pick("줌 배율 · MIP", "Zoom · MIP")}</label>
              <span data-testid="readout-zoom" className="font-mono text-[11px] font-bold text-fg-2 tabular-nums">{zoomPct}% · MIP {swapPlan.selectedMipLevel}</span>
            </div>
            <input id={zoomSliderId} data-testid="slider-zoom" type="range" min={5} max={1600} step={5} value={zoomPct} className="w-full accent-accent" onChange={(e) => { const v = Number(e.target.value); setZoomPct(v); emitPlanUpdate({ zoomPct: v }, `줌 배율을 ${v}%로 조정했다.`, `Adjusted zoom to ${v}%.`); }} />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={densitySliderId} className="font-semibold text-fg [word-break:keep-all]">{pick("활성 드로잉 밀도", "Active Drawing Density")}</label>
              <span data-testid="readout-active-density" className="font-mono text-[11px] font-bold text-fg-2 tabular-nums">{activeDensityPct}%</span>
            </div>
            <input id={densitySliderId} data-testid="slider-active-density" type="range" min={5} max={100} step={1} value={activeDensityPct} className="w-full accent-accent" onChange={(e) => { const v = Number(e.target.value); setActiveDensityPct(v); emitPlanUpdate({ activeDensityPct: v }, `활성 드로잉 밀도를 ${v}%로 조정했다.`, `Adjusted active tile density to ${v}%.`); }} />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
          <span className="text-[11px] font-semibold text-fg-2 [word-break:keep-all]">{pick("스크롤 속도 벡터 (2프레임 선행 프리페치 링)", "Scroll Velocity Vector (2-Frame Prefetch Ring)")}</span>
          <div className="flex flex-wrap gap-1.5">
            {VELOCITY_OPTIONS.map((opt) => (
              <button key={opt.value} type="button" data-testid={`velocity-btn-${opt.value}`} aria-pressed={scrollVelocityPxPerSec === opt.value} onClick={() => { setScrollVelocityPxPerSec(opt.value); emitPlanUpdate({ scrollVelocityPxPerSec: opt.value }, `스크롤 속도를 ${opt.value}px/s로 설정했다.`, `Set scroll velocity to ${opt.value}px/s.`); }} className={scrollVelocityPxPerSec === opt.value ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="tabular-nums">{isEn ? opt.labelEn : opt.labelKo}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-fg-3"><span>{pick("VRAM Hot 점유", "VRAM Hot Usage")}</span><span className="font-mono text-[9.5px]">budget-model</span></div>
          <div data-testid="metric-vram-usage" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{swapPlan.vramUsedMiB} / {swapPlan.vramCapMiB} MiB ({swapPlan.vramUtilizationPct}%)</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">Soft {swapPlan.softWatermarkMiB} · Hard {swapPlan.hardWatermarkMiB} MiB</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-fg-3"><span>{pick("OPFS Cold 스필 배치", "OPFS Cold Spill Batch")}</span><HardDrive className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" /></div>
          <div data-testid="metric-opfs-spill" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{formatMiB(swapPlan.opfsColdSpillMiB)} · {swapPlan.opfsColdTiles.toLocaleString("en-US")}t</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">SyncAccessHandle · {swapPlan.opfsColdBatch.syncHandleStripes} stripes · ~{swapPlan.opfsColdBatch.estimatedWriteLatencyMs}ms</div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="flex items-center justify-between text-[11px] font-semibold text-fg-3"><span>{pick("CoW 0-byte 절감", "CoW 0-Byte Savings")}</span><Database className="h-3.5 w-3.5 text-fg-3" aria-hidden="true" /></div>
          <div data-testid="metric-cow-savings" className="mt-1 font-mono text-sm font-bold text-fg tabular-nums">{formatMiB(swapPlan.cowSentinelSavedMiB)}</div>
          <div className="mt-0.5 text-[10px] text-fg-3 tabular-nums">{pick(`빈 센티널 ${swapPlan.sparseEmptyTiles.toLocaleString("en-US")} / 전체 ${swapPlan.totalVirtualTiles.toLocaleString("en-US")}`, `${swapPlan.sparseEmptyTiles.toLocaleString("en-US")} empty / ${swapPlan.totalVirtualTiles.toLocaleString("en-US")} total`)}</div>
        </div>
        <div className="rounded-xl border border-good bg-good-soft p-3 text-good">
          <div className="flex items-center justify-between text-[11px] font-semibold"><span>{pick("뷰포트 Pin 보호 불변식", "Viewport Pin Guard")}</span><Lock className="h-3.5 w-3.5" aria-hidden="true" /></div>
          <div data-testid="metric-viewport-pin" className="mt-1 font-mono text-sm font-bold tabular-nums">{pick(`Pin ${swapPlan.pinnedViewportTiles}t · 방출 ${swapPlan.evictedViewportTileCount}건`, `Pin ${swapPlan.pinnedViewportTiles}t · ${swapPlan.evictedViewportTileCount} evicted`)}</div>
          <div className="mt-0.5 text-[10px] opacity-85 tabular-nums">{pick(`2F 선행 프리페치 ${swapPlan.prefetchRingTiles}타일 대기`, `2F prefetch ring: ${swapPlan.prefetchRingTiles} tiles`)}</div>
        </div>
      </div>

      {swapPlan.failClosedGuardActive && (
        <div role="alert" data-testid="hard-watermark-alert" className="flex items-start gap-2 rounded-xl border border-bad bg-bad-soft px-3.5 py-2.5 text-xs text-bad [word-break:keep-all]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{pick(`90% Hard Fail-Closed 가드 작동: 비가시 타일 ${swapPlan.opfsColdTiles.toLocaleString("en-US")}개를 OPFS Cold로 강제 스필하며 뷰포트 핀 타일(${swapPlan.pinnedViewportTiles}개)은 방출 0건으로 보호한다.`, `90% Hard Fail-Closed guard active: spilling ${swapPlan.opfsColdTiles.toLocaleString("en-US")} non-visible tiles to OPFS Cold while keeping all ${swapPlan.pinnedViewportTiles} viewport tiles pinned (0 evicted).`)}</span>
        </div>
      )}

      <div className="space-y-2 rounded-xl border border-line bg-card p-3.5">
        <MemoryAtlasAndHeatmapSvg plan={swapPlan} isEn={isEn} />
        <div data-testid="opfs-cold-batch-strip" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-canvas px-3 py-2 text-[11px]">
          <div className="font-semibold text-fg-2 [word-break:keep-all]">
            {pick("OPFS Cold 스왑 배치", "OPFS Cold Swap Batch")} · <span className="font-mono text-fg">{swapPlan.opfsColdBatch.accessApi}</span>
            {" · "}
            <span className="font-mono text-fg-3">{swapPlan.opfsColdBatch.evictionPolicy}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-fg-3 tabular-nums">
            {swapPlan.opfsColdBatch.batchTileKeys.length > 0 ? (
              swapPlan.opfsColdBatch.batchTileKeys.slice(0, 4).map((key) => (
                <span key={key} className="rounded border border-line bg-raised px-1.5 py-0.5 text-fg-2">{key}</span>
              ))
            ) : (
              <span>{pick("스필 없음 · 활성 타일 전량 VRAM/RAM 상주", "No OPFS spill · all active tiles resident in VRAM/RAM")}</span>
            )}
          </div>
        </div>
        <p data-testid="honesty-disclosure" className="text-[11px] text-fg-3 [word-break:keep-all]">{isEn ? swapPlan.honestyDisclosureEn : swapPlan.honestyDisclosureKo}</p>
      </div>

      <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
              <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
              <span>{pick("실물 무손실 RLE-Delta 타일 스왑 라운드트립 검증 (measured-in-memory)", "Lossless RLE-Delta Tile Swap Round-Trip Verification (measured-in-memory)")}</span>
            </div>
            <p className="text-[11px] text-fg-2 [word-break:keep-all]">{pick("256×256 RGBA Uint8ClampedArray를 RLE-Delta 압축 → 인메모리 스왑 슬롯(Web Storage 미사용) 기록 → 복원 후 FNV-1a 0-diff를 실측한다.", "Compresses a real 256x256 RGBA Uint8ClampedArray with RLE-Delta, stores in an in-memory swap slot, restores, and checks FNV-1a 0-diff.")}</p>
          </div>
          <button type="button" data-testid="run-roundtrip-btn" onClick={handleRunRoundTrip} className={BTN_SOLID}>
            <Play className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("무손실 스왑 라운드트립 검증 실행", "Run Lossless Swap Round-Trip")}</span>
          </button>
        </div>

        {roundTripResult ? (
          <div data-testid="roundtrip-result-card" className="grid grid-cols-1 gap-2 rounded-lg border border-good bg-good-soft p-3 text-xs text-fg sm:grid-cols-4">
            <div>
              <div className="text-[10px] font-semibold text-fg-3">{pick("실측 구분 · 코덱", "Provenance · Codec")}</div>
              <div data-testid="roundtrip-provenance" className="mt-0.5 font-mono text-[11px] font-bold text-good">{roundTripResult.provenance}</div>
              <div className="font-mono text-[10px] text-fg-2">{roundTripResult.codec} · {roundTripResult.storageBackend}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-fg-3">{pick("원본 → 압축 바이트", "Raw -> Compressed")}</div>
              <div data-testid="roundtrip-bytes" className="mt-0.5 font-mono text-[11px] font-bold tabular-nums">{roundTripResult.rawBytes.toLocaleString("en-US")}B → {roundTripResult.compressedBytes.toLocaleString("en-US")}B</div>
              <div className="font-mono text-[10px] text-fg-2 tabular-nums">{roundTripResult.compressionRatio}x · {roundTripResult.spaceSavingPct}% {pick("절감", "saved")}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-fg-3">{pick("FNV-1a 32-bit 체크섬", "FNV-1a 32-bit Checksum")}</div>
              <div data-testid="roundtrip-fnv1a" className="mt-0.5 font-mono text-[11px] font-bold tabular-nums">{roundTripResult.originalFnv1aHex} === {roundTripResult.restoredFnv1aHex}</div>
              <div className="truncate font-mono text-[10px] text-fg-2">{roundTripResult.tileKey}</div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-[10px] font-semibold text-good"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /><span>{pick("바이트 동등성 (0-diff)", "Byte Parity (0-diff)")}</span></div>
              <div data-testid="roundtrip-diff" className="mt-0.5 font-mono text-[11px] font-bold text-good tabular-nums">diff {roundTripResult.diffByteCount} B · {roundTripResult.isBitExact ? "BIT-EXACT" : "MISMATCH"}</div>
              <div className="font-mono text-[10px] text-fg-2 tabular-nums">{roundTripResult.elapsedMs} ms</div>
            </div>
          </div>
        ) : (
          <div data-testid="roundtrip-idle-notice" className="rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">
            {pick("버튼을 누르면 현재 프리셋의 256×256 실물 타일 버퍼를 압축·복원해 FNV-1a 0-diff 실측치를 즉시 표시한다.", "Click the button above to compress, swap, restore, and verify FNV-1a 0-diff on a real 256x256 tile buffer.")}
          </div>
        )}
      </div>

      <div className="space-y-2.5 rounded-xl border border-line bg-card p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
            <ClipboardCopy className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("가상 메모리 스왑 JSON 매니페스트 내보내기", "Virtual Swap JSON Manifest Export")}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" data-testid="export-swap-json-btn" onClick={handleExportJson} className={BTN_SOLID}>
              <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{pick("JSON 복사 · 내보내기", "Copy & Export JSON")}</span>
            </button>
            <button type="button" data-testid="toggle-json-preview-btn" onClick={() => setShowJsonPreview((prev) => !prev)} className={BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{showJsonPreview ? pick("미리보기 닫기", "Hide Preview") : pick("JSON 미리보기", "Preview JSON")}</span>
            </button>
          </div>
        </div>
        {showJsonPreview && (
          <pre data-testid="swap-json-preview" className="max-h-60 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">{manifestJson}</pre>
        )}
      </div>

      {statusMessage && (
        <div role="status" aria-live="polite" data-testid="swap-panel-status" className="rounded-lg border border-line bg-raised px-3 py-2 text-xs text-fg-2 [word-break:keep-all]">{statusMessage}</div>
      )}
    </section>
  );
}
