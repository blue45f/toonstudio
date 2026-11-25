/**
 * Wave 55B — 무한 줌 레이어링 · 2.5D 공간 캔버스 & WebGPU Triple-Ring/Mega-Atlas 제어판.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 #hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 로그 스케일 7 decades(0.01× ~ 100,000×) 슬라이더, 5종 시맨틱 점프, 2.5D 시차, GPU 버퍼 전략 비교
 * - 순수 시맨틱 2단 SVG: 좌(4단 중첩 포털 · Floating-Origin vs f32 오차) / 우(3-Frame Ring · 4096×4096 Mega-Atlas)
 */

import {
  CheckCircle2, Code2, Copy, Cpu, Eye, Layers, Maximize2,
  RotateCcw, ShieldAlert, ShieldCheck, SlidersHorizontal, StepForward,
} from "lucide-react";
import { useId, type ReactElement } from "react";

import {
  MAX_ZOOM_EXP, MIN_ZOOM_EXP, SEMANTIC_ZOOM_BANDS, SEMANTIC_ZOOM_JUMP_PRESETS,
  type AtlasSlotOccupancyState,
  type InfiniteZoomSceneSnapshot, type RingSlotFenceState, type SemanticZoomBandId,
} from "./infinite-zoom-spatial-engine";

import { useInfiniteZoomController } from "./use-infinite-zoom-controller";

export interface StudioInfiniteZoomSpatialPanelProps {
  readonly initialZoomExp?: number;
  readonly initialParallaxDepth?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onSceneChange?: (scene: InfiniteZoomSceneSnapshot) => void | Promise<void>;
  readonly onExportJson?: (json: string, scene: InfiniteZoomSceneSnapshot) => void | Promise<void>;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 팔레트 (72°·158°·215°·188°·142°·25° — 270~320° 완전 배제)
const SVG_INK_STORYBOARD = "oklch(0.65 0.14 72)";
const SVG_INK_MANUSCRIPT = "oklch(0.56 0.13 158)";
const SVG_INK_VECTOR = "oklch(0.56 0.13 215)";
const SVG_INK_PORTAL = "oklch(0.55 0.12 188)";
const SVG_INK_GOOD = "oklch(0.56 0.14 142)";
const SVG_INK_ALERT = "oklch(0.57 0.21 25)";

const WORLD_OFFSET_PRESETS: readonly { readonly px: number; readonly label: string }[] = [
  { px: 65_536, label: "65k px" },
  { px: 250_000, label: "250k px" },
  { px: 1_000_000, label: "1M px" },
];

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

function bandSvgInk(bandId: SemanticZoomBandId): string {
  switch (bandId) {
    case "storyboard-overview": return SVG_INK_STORYBOARD;
    case "manuscript-parallax": return SVG_INK_MANUSCRIPT;
    case "vector-ink-screentone": return SVG_INK_VECTOR;
    case "micro-fiber-portal": return SVG_INK_PORTAL;
  }
}

function ringStateInk(state: RingSlotFenceState): string {
  switch (state) {
    case "cpu-writing": return SVG_INK_VECTOR;
    case "gpu-executing": return SVG_INK_MANUSCRIPT;
    case "fence-signaled-free": return SVG_INK_GOOD;
    case "stalled-awaiting-mapAsync": return SVG_INK_ALERT;
  }
}

function ringStateLabel(state: RingSlotFenceState, isEn: boolean): string {
  switch (state) {
    case "cpu-writing": return isEn ? "CPU Write" : "CPU 기록";
    case "gpu-executing": return isEn ? "GPU Read" : "GPU 실행";
    case "fence-signaled-free": return isEn ? "Fence Free" : "Fence 해제";
    case "stalled-awaiting-mapAsync": return isEn ? "Stalled" : "대기 스톨";
  }
}

function atlasSlotFill(state: AtlasSlotOccupancyState): { readonly ink: string; readonly opacity: number } {
  switch (state) {
    case "active-hot": return { ink: SVG_INK_VECTOR, opacity: 0.9 };
    case "cached-warm": return { ink: SVG_INK_MANUSCRIPT, opacity: 0.58 };
    case "lru-evictable": return { ink: SVG_INK_STORYBOARD, opacity: 0.45 };
    case "free": return { ink: "currentColor", opacity: 0.09 };
  }
}

function formatZoomFactor(zoom: number): string {
  if (zoom < 1) return `${zoom.toFixed(2)}×`;
  if (zoom < 100) return `${zoom.toFixed(1)}×`;
  return `${Math.round(zoom).toLocaleString("en-US")}×`;
}

function formatErrorPx(errPx: number): string {
  if (errPx === 0) return "0.000000 px";
  if (errPx < 0.001) return `${errPx.toExponential(2)} px`;
  if (errPx < 10) return `${errPx.toFixed(4)} px`;
  return `${errPx.toFixed(1)} px`;
}

function formatGainMultiplier(gain: number): string {
  if (gain >= 1_000_000) return `${(gain / 1_000_000).toFixed(2)}M×`;
  if (gain >= 1_000) return `${(gain / 1_000).toFixed(1)}k×`;
  return `${gain.toFixed(1)}×`;
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

function InfiniteZoomPortalPrecisionSvg(props: {
  readonly scene: InfiniteZoomSceneSnapshot;
  readonly isEn: boolean;
}): ReactElement {
  const { scene, isEn } = props;
  const { precision, nestedPortals, activeBand, parallaxDepth } = scene;
  const centerX = 240;
  const centerY = 122;
  const naiveBarRatio = Math.min(1, Math.log10(1 + precision.naiveF32JitterPx * 1000) / 6.5);
  const foBarRatio = Math.min(1, Math.log10(1 + precision.floatingOriginJitterPx * 1000) / 6.5);
  const barMaxW = 318;

  return (
    <svg
      data-testid="infinite-zoom-portal-svg"
      data-active-band={scene.activeBandId}
      data-zoom-exp={scene.zoomExp.toFixed(2)}
      data-parallax={parallaxDepth.toFixed(2)}
      data-subpixel-stable={precision.subPixelStable ? "true" : "false"}
      data-naive-broken={precision.naiveF32Broken ? "true" : "false"}
      viewBox="0 0 480 318"
      role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `4-tier nested infinite zoom portal at ${formatZoomFactor(scene.zoomFactor)} and Floating-Origin precision comparison`
        : `4단계 중첩 무한 줌 포털(${formatZoomFactor(scene.zoomFactor)}) 및 Floating-Origin 대 f32 지터 오차 비교 도해`}
    >
      <rect x="8" y="8" width="464" height="302" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="20" y="26" fill="currentColor" fillOpacity={0.85} fontSize="10.5" fontWeight="700">
        {isEn ? "4-TIER NESTED INFINITE ZOOM PORTAL · 2.5D PARALLAX" : "4단계 중첩 무한 줌 포털 · 2.5D 시차 레이어"}
      </text>
      <text x="460" y="26" textAnchor="end" fill={bandSvgInk(activeBand.id)} fontSize="10" fontWeight="700">
        {`${formatZoomFactor(scene.zoomFactor)} · 10^${scene.zoomExp.toFixed(2)}`}
      </text>

      <rect x="20" y="36" width="440" height="172" rx="8" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.12} />
      <line x1={centerX} y1="42" x2={centerX} y2="202" stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" />
      <line x1="28" y1={centerY} x2="452" y2={centerY} stroke="currentColor" strokeOpacity={0.12} strokeDasharray="3 3" />

      {nestedPortals.map((portal) => {
        const ink = bandSvgInk(portal.bandId);
        const w = Math.round(64 + (3 - portal.portalIndex) * 76 + portal.normalizedFrameRatio * 48);
        const h = Math.round(34 + (3 - portal.portalIndex) * 28 + portal.normalizedFrameRatio * 18);
        const x = Math.round(centerX - w / 2 + Math.max(-24, Math.min(24, portal.parallaxOffsetX * 0.45)));
        const y = Math.round(centerY - h / 2 + Math.max(-14, Math.min(14, portal.parallaxOffsetY * 0.45)));
        const isCurrent = portal.bandId === scene.activeBandId;
        const bandWeightPct = Math.round(scene.bandWeights[portal.bandId] * 100);
        return (
          <g key={portal.bandId} data-portal-band={portal.bandId} data-portal-opacity={portal.opacity.toFixed(2)}>
            <rect x={x} y={y} width={w} height={h} rx={isCurrent ? 8 : 5} fill={ink} fillOpacity={Math.max(0.06, portal.opacity * (isCurrent ? 0.22 : 0.11))} stroke={ink} strokeWidth={isCurrent ? 2.2 : 1.1} strokeOpacity={Math.max(0.28, portal.opacity)} strokeDasharray={portal.cullState === "active" ? undefined : "4 3"} />
            <text x={x + 6} y={y + 12} fill={ink} fillOpacity={Math.max(0.55, portal.opacity)} fontSize="8.2" fontWeight={isCurrent ? "700" : "600"}>
              {`P${portal.portalIndex + 1} · ${bandWeightPct}%`}
            </text>
          </g>
        );
      })}

      <circle cx={centerX} cy={centerY} r="4.5" fill={SVG_INK_GOOD} />
      <circle cx={centerX} cy={centerY} r="9" fill="none" stroke={SVG_INK_GOOD} strokeWidth="1.2" strokeOpacity={0.7} />
      <text x="30" y="200" fill="currentColor" fillOpacity={0.62} fontSize="8.2">
        {isEn
          ? `Chunk #${precision.chunkIndex} (${precision.chunkSizePx}px) · Local Δ: ${precision.cameraLocalOffsetPx.toFixed(1)}px · Parallax: ${Math.round(parallaxDepth * 100)}%`
          : `청크 #${precision.chunkIndex} (${precision.chunkSizePx}px) · 상대 오프셋: ${precision.cameraLocalOffsetPx.toFixed(1)}px · 2.5D 시차: ${Math.round(parallaxDepth * 100)}%`}
      </text>

      <text x="20" y="226" fill="currentColor" fillOpacity={0.82} fontSize="9.5" fontWeight="700">
        {isEn ? "FLOATING-ORIGIN (f64→f32) vs NAIVE f32 JITTER" : "Floating-Origin (f64→f32) vs 일반 f32 지터 오차 실측"}
      </text>
      <text x="460" y="226" textAnchor="end" fill={SVG_INK_GOOD} fontSize="9.2" fontWeight="700">
        {isEn ? `Gain ${formatGainMultiplier(precision.precisionGainMultiplier)}` : `정밀도 ${formatGainMultiplier(precision.precisionGainMultiplier)} 개선`}
      </text>

      <text x="20" y="248" fill="currentColor" fillOpacity={0.74} fontSize="8.5" fontWeight="600">{isEn ? "Naive f32" : "일반 f32"}</text>
      <rect x="92" y="238" width={barMaxW} height="14" rx="4" fill="currentColor" fillOpacity={0.07} />
      <rect x="92" y="238" width={Math.max(4, Math.round(barMaxW * naiveBarRatio))} height="14" rx="4" fill={precision.naiveF32Broken ? SVG_INK_ALERT : SVG_INK_STORYBOARD} fillOpacity={0.82} />
      <text x="460" y="248" textAnchor="end" fill={precision.naiveF32Broken ? SVG_INK_ALERT : "currentColor"} fontSize="8.3" fontWeight="700">
        {formatErrorPx(precision.naiveF32JitterPx)}
      </text>

      <text x="20" y="272" fill="currentColor" fillOpacity={0.74} fontSize="8.5" fontWeight="600">Floating-Origin</text>
      <rect x="92" y="262" width={barMaxW} height="14" rx="4" fill="currentColor" fillOpacity={0.07} />
      <rect x="92" y="262" width={Math.max(3, Math.round(barMaxW * foBarRatio))} height="14" rx="4" fill={SVG_INK_GOOD} fillOpacity={0.9} />
      <text x="460" y="272" textAnchor="end" fill={SVG_INK_GOOD} fontSize="8.3" fontWeight="700">
        {formatErrorPx(precision.floatingOriginJitterPx)}
      </text>

      <text x="20" y="298" fill="currentColor" fillOpacity={0.62} fontSize="8.2">
        {isEn
          ? `World Offset: ${precision.worldOffsetPx.toLocaleString("en-US")}px · f32 ULP: ${precision.f32WorldUlpPx.toExponential(2)}px · Sub-pixel <0.001px: ${precision.subPixelStable ? "PASS" : "FAIL"}`
          : `세계 오프셋: ${precision.worldOffsetPx.toLocaleString("en-US")}px · f32 ULP: ${precision.f32WorldUlpPx.toExponential(2)}px · 서브픽셀(<0.001px) 안정: ${precision.subPixelStable ? "유지" : "주의"}`}
      </text>
    </svg>
  );
}

function GpuRingAndMegaAtlasSvg(props: {
  readonly scene: InfiniteZoomSceneSnapshot;
  readonly isEn: boolean;
}): ReactElement {
  const { scene, isEn } = props;
  const { stagingRing, megaAtlas, alignment, strategy } = scene.gpuPlan;
  const isTriple = strategy === "triple-ring-mega-atlas";
  const cellStep = 9.5;

  return (
    <svg
      data-testid="gpu-ring-atlas-svg"
      data-gpu-strategy={strategy}
      data-ring-depth={stagingRing.ringDepth}
      data-active-slot={stagingRing.activeWriteSlot}
      data-pipeline-stalls={stagingRing.pipelineStallCount}
      data-atlas-allocated={megaAtlas.allocatedSlots}
      viewBox="0 0 480 318"
      role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `WebGPU ${stagingRing.ringDepth}-frame staging ring and 4096x4096 sparse mega-atlas bank (${megaAtlas.allocatedSlots}/${megaAtlas.totalSlots} slots)`
        : `WebGPU ${stagingRing.ringDepth}-프레임 스테이징 링 및 4096×4096 Sparse Mega-Atlas 슬롯 뱅크(${megaAtlas.allocatedSlots}/${megaAtlas.totalSlots} 슬롯)`}
    >
      <rect x="8" y="8" width="464" height="302" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="20" y="26" fill="currentColor" fillOpacity={0.85} fontSize="10.5" fontWeight="700">
        {isEn ? "WEBGPU 3-FRAME RING FENCE · 4096×4096 MEGA-ATLAS" : "WebGPU 3-Frame Ring Fence · 4096×4096 Mega-Atlas"}
      </text>
      <text x="460" y="26" textAnchor="end" fill={isTriple ? SVG_INK_GOOD : SVG_INK_ALERT} fontSize="9.5" fontWeight="700">
        {isTriple
          ? (isEn ? `Stalls: 0 · Frame #${stagingRing.frameIndex}` : `스톨 0 · 프레임 #${stagingRing.frameIndex}`)
          : (isEn ? `Stall: 1/frame (+${stagingRing.estimatedCpuWaitMs}ms)` : `매 프레임 스톨 (+${stagingRing.estimatedCpuWaitMs}ms)`)}
      </text>

      {([0, 1, 2] as const).map((slotIdx) => {
        const slot = stagingRing.slots.find((s) => s.slotIndex === slotIdx);
        const cardX = 20 + slotIdx * 148;
        const ink = slot ? ringStateInk(slot.state) : "currentColor";
        const active = Boolean(slot);
        return (
          <g key={slotIdx} data-ring-slot={slotIdx} data-ring-state={slot?.state ?? "inactive"}>
            <rect x={cardX} y="38" width="138" height="68" rx="8" fill={ink} fillOpacity={active ? 0.14 : 0.04} stroke={ink} strokeOpacity={active ? 0.85 : 0.22} strokeWidth={slot?.state === "cpu-writing" ? 2 : 1.1} strokeDasharray={active ? undefined : "3 3"} />
            <text x={cardX + 10} y="55" fill="currentColor" fillOpacity={0.88} fontSize="9.5" fontWeight="700">
              {isEn ? `Ring Slot ${slotIdx}` : `링 슬롯 ${slotIdx}`}
            </text>
            <text x={cardX + 128} y="55" textAnchor="end" fill={ink} fontSize="8.5" fontWeight="700">
              {slot ? ringStateLabel(slot.state, isEn) : (isEn ? "Unused" : "미사용")}
            </text>
            <text x={cardX + 10} y="73" fill="currentColor" fillOpacity={0.7} fontSize="8.2">
              {slot ? `Fence #${slot.fenceValue} · +${slot.uniformOffsetBytes}B` : (isEn ? "Single staging mode" : "단일 Staging 모드")}
            </text>
            <text x={cardX + 10} y="92" fill="currentColor" fillOpacity={0.62} fontSize="8">
              {slot ? `${slot.dirtyTilesQueued} ${isEn ? "tiles" : "타일"} · ${formatMiB(slot.stagingBufferBytes)}` : (isEn ? "Blocks on mapAsync" : "mapAsync 동기 대기")}
            </text>
          </g>
        );
      })}

      <text x="20" y="122" fill="currentColor" fillOpacity={0.68} fontSize="8.3">
        {isEn
          ? `256B Uniform Stride: ${alignment.uniformSlotAlignedBytes}B (raw ${alignment.uniformStructRawBytes}B) · bytesPerRow: ${alignment.tileBytesPerRowAligned}B · Valid: ${alignment.allAlignmentsValid ? "PASS" : "FAIL"}`
          : `256B Uniform 스트라이드: ${alignment.uniformSlotAlignedBytes}B(원본 ${alignment.uniformStructRawBytes}B) · bytesPerRow: ${alignment.tileBytesPerRowAligned}B · 정렬: ${alignment.allAlignmentsValid ? "충족" : "오류"}`}
      </text>

      <text x="20" y="140" fill="currentColor" fillOpacity={0.84} fontSize="9.2" fontWeight="700">
        {isEn ? "4096×4096 SPARSE MEGA-ATLAS BANK (16×16 = 256 PAGES)" : "4096×4096 Sparse Mega-Atlas 뱅크 (16×16 = 256 페이지)"}
      </text>

      <g data-testid="mega-atlas-slot-grid">
        {megaAtlas.slotStates.map((slotState, idx) => {
          const { ink, opacity } = atlasSlotFill(slotState);
          return (
            <rect key={idx} x={24 + (idx % megaAtlas.gridCols) * cellStep} y={148 + Math.floor(idx / megaAtlas.gridCols) * cellStep} width={8} height={8} rx="1.5" fill={ink} fillOpacity={opacity} />
          );
        })}
      </g>

      <g fontSize="8.8" fill="currentColor">
        <rect x="194" y="148" width="266" height="150" rx="8" fill="currentColor" fillOpacity={0.03} stroke="currentColor" strokeOpacity={0.12} />
        <text x="206" y="168" fontWeight="700" fillOpacity={0.88}>
          {isEn ? `Occupied: ${megaAtlas.allocatedSlots}/${megaAtlas.totalSlots} (${megaAtlas.occupancyPct}%)` : `점유: ${megaAtlas.allocatedSlots}/${megaAtlas.totalSlots} 슬롯 (${megaAtlas.occupancyPct}%)`}
        </text>
        <text x="206" y="186" fillOpacity={0.72}>
          {isEn ? `External Frag: ${megaAtlas.externalFragmentationPct}% · Total: ${megaAtlas.fragmentationPct}%` : `외부 단편화: ${megaAtlas.externalFragmentationPct}% · 총 단편화: ${megaAtlas.fragmentationPct}%`}
        </text>
        <text x="206" y="204" fillOpacity={0.72}>
          {isEn ? `LRU Recycled: ${megaAtlas.lruRecycledSlots} pages · Draw Calls: ${megaAtlas.drawCallsPerFrame}` : `LRU 재활용: ${megaAtlas.lruRecycledSlots}페이지 · 드로우콜: ${megaAtlas.drawCallsPerFrame}회`}
        </text>
        <text x="206" y="222" fillOpacity={0.72}>
          {isEn ? `Atlas VRAM: ${formatMiB(megaAtlas.atlasTextureBytes)} · Page Table: ${megaAtlas.indirectionTableBytes}B` : `아틀라스 VRAM: ${formatMiB(megaAtlas.atlasTextureBytes)} · 인덱스: ${megaAtlas.indirectionTableBytes}B`}
        </text>
        <rect x="206" y="240" width="9" height="9" rx="2" fill={SVG_INK_VECTOR} fillOpacity={0.9} />
        <text x="220" y="248" fontSize="8.2" fillOpacity={0.78}>{isEn ? `Hot (${megaAtlas.hotSlots})` : `활성 Hot (${megaAtlas.hotSlots})`}</text>
        <rect x="318" y="240" width="9" height="9" rx="2" fill={SVG_INK_MANUSCRIPT} fillOpacity={0.58} />
        <text x="332" y="248" fontSize="8.2" fillOpacity={0.78}>{isEn ? `Warm (${megaAtlas.warmSlots})` : `캐시 Warm (${megaAtlas.warmSlots})`}</text>
        <rect x="206" y="258" width="9" height="9" rx="2" fill={SVG_INK_STORYBOARD} fillOpacity={0.45} />
        <text x="220" y="266" fontSize="8.2" fillOpacity={0.78}>{isEn ? `LRU Pool (${megaAtlas.lruEvictableSlots})` : `LRU 후보 (${megaAtlas.lruEvictableSlots})`}</text>
        <rect x="318" y="258" width="9" height="9" rx="2" fill="currentColor" fillOpacity={0.14} />
        <text x="332" y="266" fontSize="8.2" fillOpacity={0.78}>{isEn ? `Free (${megaAtlas.freeSlots})` : `여유 Free (${megaAtlas.freeSlots})`}</text>
        <text x="206" y="287" fontSize="8.3" fontWeight="700" fill={SVG_INK_GOOD}>
          {isEn
            ? `vs Single Staging: -${scene.gpuPlan.comparison.stallEliminatedMs}ms · -${scene.gpuPlan.comparison.drawCallReductionPct}% draws`
            : `단일 Staging 대비: -${scene.gpuPlan.comparison.stallEliminatedMs}ms · 드로우콜 -${scene.gpuPlan.comparison.drawCallReductionPct}%`}
        </text>
      </g>
    </svg>
  );
}

/** 무한 줌 레이어링 · 2.5D 공간 캔버스 & WebGPU Triple-Ring/Mega-Atlas 스튜디오 제어판. */
export function StudioInfiniteZoomSpatialPanel(props: StudioInfiniteZoomSpatialPanelProps): ReactElement {
  const { locale = "ko", className } = props;

  const headingId = useId();
  const zoomSliderId = useId();
  const parallaxSliderId = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const { scene, manifestJson, wgslSource, zoomExp, parallaxDepth, worldOffsetPx, gpuStrategy,
    activePreview, setActivePreview, statusMessage, delivery, copy, busy,
    handleZoomExpChange, handleParallaxChange, handleWorldOffsetChange, handleStrategyChange,
    handleAdvanceFrame, handleReset, handleCopyJson, handleCopyWgsl } = useInfiniteZoomController(props, pick);

  const { precision, gpuPlan, activeBand, wgslValidation } = scene;

  return (
    <section aria-labelledby={headingId} data-testid="studio-infinite-zoom-spatial-panel" className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] sm:p-5 ${className ?? ""}`}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-accent bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("CPU 예제 · 7 Decades 무한 줌 · GPU 계획", "CPU Example · 7-Decade Infinite Zoom · GPU Plan")}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-good bg-good-soft px-2.5 py-0.5 text-[11px] font-semibold text-good tabular-nums">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {pick(`WGSL 소스 정적 계약 ${wgslValidation.valid ? "통과" : "오류"} · 미컴파일`, `WGSL source contract ${wgslValidation.valid ? "PASS" : "FAIL"} · uncompiled`)}
            </span>
          </div>
          <h2 id={headingId} className="text-base font-bold tracking-tight text-fg sm:text-lg">
            {pick("무한 줌 레이어링 · 2.5D 공간 캔버스 & WebGPU Triple-Ring/Mega-Atlas", "Infinite-Zoom Layering · 2.5D Spatial Canvas & WebGPU Triple-Ring/Mega-Atlas")}
          </h2>
          <p className="text-xs text-fg-2">{isEn ? activeBand.summaryEn : activeBand.summaryKo}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="advance-ring-frame-btn" disabled={busy} onClick={handleAdvanceFrame} className={BTN_OUTLINE}>
            <StepForward className="h-3.5 w-3.5" aria-hidden="true" />
            {pick(`프레임 +1 (슬롯 #${gpuPlan.stagingRing.activeWriteSlot})`, `Frame +1 (Slot #${gpuPlan.stagingRing.activeWriteSlot})`)}
          </button>
          <button type="button" data-testid="reset-infinite-zoom-btn" disabled={busy} onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>
      <p data-testid="infinite-zoom-example-scope" className="text-xs text-fg-2 [word-break:keep-all]">{pick("독립 CPU/SVG 계산 예제입니다. GPU 할당·컴파일·실행·Fence 관찰, 실제 원고 변경·영구 저장은 하지 않습니다. 정밀도는 같은 f64 점의 카메라 상대값 비교이며 WGSL 결과 실측이 아닙니다.", "Independent CPU/SVG example: no GPU allocation, compilation, submission or observed fences, artwork mutation or persistence. Precision compares camera-relative values of the same f64 points, without measuring WGSL output.")}</p>
      <div data-testid="infinite-zoom-delivery" className="text-xs text-fg-2" aria-live="polite">
        {delivery.status === "pending" ? pick("예제 수신 확인 대기", "Awaiting example recipient") : delivery.status === "failed" ? pick("예제 알림 실패", "Example notification failed") : delivery.status === "notified" ? pick("마지막 예제 수신 확인 · 실제 원고 적용 아님", "Last example acknowledged · no artwork mutation") : pick("실제 원고 미연결 · 로컬 예제", "No artwork connection · local example")}
        {delivery.status === "failed" ? <button type="button" data-testid="infinite-zoom-scene-retry" onClick={delivery.retry} className={BTN_OUTLINE}>{pick("같은 장면 알림 재시도", "Retry scene notification")}</button> : null}
      </div>
      <div data-testid="infinite-zoom-copy-state" data-copy-state={copy.state} className="text-xs text-fg-2" aria-live="polite">
        {copy.state === "pending" ? pick("복사·수신 확인 대기", "Awaiting clipboard/recipient") : copy.state === "error" ? pick("복사 또는 수신 확인 실패", "Clipboard or recipient failed") : copy.state === "copied" ? pick("클립보드 복사 확인", "Clipboard copy confirmed") : pick("복사 대기", "Ready to copy")}
        {` · UTF-8 ${copy.bytes} ${pick("바이트", "bytes")}`}
        {copy.state === "error" ? <button type="button" data-testid="infinite-zoom-copy-retry" onClick={copy.retry} className={BTN_OUTLINE}>{pick("같은 출력 복사·알림 재시도", "Retry same output")}</button> : null}
      </div>


      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div data-testid="kpi-active-zoom" className="rounded-xl border border-line bg-card p-3">
          <p className="text-[11px] font-medium text-fg-2">{pick("현재 무한 줌 · 시맨틱 대역", "Current Zoom · Semantic Band")}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-fg">{formatZoomFactor(scene.zoomFactor)}</p>
          <p className="mt-0.5 text-[11px] text-fg-2">{isEn ? activeBand.labelEn : activeBand.labelKo}</p>
        </div>
        <div data-testid="kpi-floating-origin" className="rounded-xl border border-line bg-card p-3">
          <p className="text-[11px] font-medium text-fg-2">{pick("Floating-Origin 정밀도 개선", "Floating-Origin Precision Gain")}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-good">{formatGainMultiplier(precision.precisionGainMultiplier)}</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-fg-2">
            {pick(`f64→f32 ${formatErrorPx(precision.floatingOriginJitterPx)} (f32 ${formatErrorPx(precision.naiveF32JitterPx)})`, `FO ${formatErrorPx(precision.floatingOriginJitterPx)} vs f32 ${formatErrorPx(precision.naiveF32JitterPx)}`)}
          </p>
        </div>
        <div data-testid="kpi-ring-stall" className="rounded-xl border border-line bg-card p-3">
          <p className="text-[11px] font-medium text-fg-2">{pick("Staging Ring 스톨 · 256B 정렬", "Staging Ring Stalls · 256B Align")}</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${gpuPlan.stagingRing.pipelineStallCount === 0 ? "text-good" : "text-bad"}`}>
            {gpuPlan.stagingRing.pipelineStallCount === 0
              ? pick("모형 스톨 0 · 미실측", "Model: 0 stalls · unmeasured")
              : pick(`모형 스톨 1 · 추정 +${gpuPlan.stagingRing.estimatedCpuWaitMs} ms`, `Model: 1 stall · estimated +${gpuPlan.stagingRing.estimatedCpuWaitMs} ms`)}
          </p>
          <p className="mt-0.5 text-[11px] tabular-nums text-fg-2">
            {pick(`Uniform ${gpuPlan.alignment.uniformSlotAlignedBytes}B · Row ${gpuPlan.alignment.tileBytesPerRowAligned}B`, `UBO ${gpuPlan.alignment.uniformSlotAlignedBytes}B · Row ${gpuPlan.alignment.tileBytesPerRowAligned}B`)}
          </p>
        </div>
        <div data-testid="kpi-mega-atlas" className="rounded-xl border border-line bg-card p-3">
          <p className="text-[11px] font-medium text-fg-2">{pick("4096×4096 Mega-Atlas 점유·단편화", "4096×4096 Mega-Atlas Occupancy")}</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-fg">{`${gpuPlan.megaAtlas.allocatedSlots}/${gpuPlan.megaAtlas.totalSlots} (${gpuPlan.megaAtlas.occupancyPct}%)`}</p>
          <p className="mt-0.5 text-[11px] tabular-nums text-fg-2">
            {pick(`가정 단편화 ${gpuPlan.megaAtlas.externalFragmentationPct}% · 드로우콜 ${gpuPlan.megaAtlas.drawCallsPerFrame}회`, `Ext Frag ${gpuPlan.megaAtlas.externalFragmentationPct}% · ${gpuPlan.megaAtlas.drawCallsPerFrame} draws`)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor={zoomSliderId} className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
              <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("로그 스케일 무한 줌 (0.01× ~ 100,000× · 7 Decades)", "Log-Scale Infinite Zoom (0.01× ~ 100,000× · 7 Decades)")}
            </label>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-bold tabular-nums text-accent">
              {`${formatZoomFactor(scene.zoomFactor)} (10^${scene.zoomExp.toFixed(2)})`}
            </span>
          </div>
          <input id={zoomSliderId} data-testid="infinite-zoom-slider" type="range" min={MIN_ZOOM_EXP} max={MAX_ZOOM_EXP} step={0.05} value={zoomExp} onChange={(e) => handleZoomExpChange(Number(e.target.value))} className={`w-full accent-accent ${FOCUS_RING}`} />
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={pick("5종 시맨틱 줌 점프 프리셋", "5 semantic zoom jump presets")}>
            {SEMANTIC_ZOOM_JUMP_PRESETS.map((preset) => {
              const isSelected = Math.abs(zoomExp - preset.zoomExp) <= 0.15;
              return (
                <button key={preset.id} type="button" data-testid={`semantic-jump-${preset.id}`} aria-pressed={isSelected} onClick={() => handleZoomExpChange(preset.zoomExp, `${preset.zoomLabel} ${preset.labelKo} 지점으로 시맨틱 점프했습니다.`, `Jumped to semantic preset ${preset.zoomLabel} ${preset.labelEn}.`)} className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}>
                  <span className="tabular-nums font-bold">{preset.zoomLabel}</span>
                  <span>{isEn ? preset.labelEn : preset.labelKo}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-5">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor={parallaxSliderId} className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("2.5D 시차 깊이", "2.5D Parallax Depth")}
              </label>
              <span className="text-xs font-bold tabular-nums text-fg">{`${Math.round(parallaxDepth * 100)}%`}</span>
            </div>
            <input id={parallaxSliderId} data-testid="parallax-depth-slider" type="range" min={0} max={1} step={0.05} value={parallaxDepth} onChange={(e) => handleParallaxChange(Number(e.target.value))} className={`w-full accent-accent ${FOCUS_RING}`} />
          </div>

          <div className="space-y-1.5">
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
              <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("GPU 버퍼 전략 비교", "GPU Buffer Strategy Comparison")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" data-testid="strategy-triple-ring-btn" aria-pressed={gpuStrategy === "triple-ring-mega-atlas"} onClick={() => handleStrategyChange("triple-ring-mega-atlas")} className={gpuStrategy === "triple-ring-mega-atlas" ? BTN_ACTIVE : BTN_OUTLINE}>
                {pick("Triple-Ring + Atlas", "Triple-Ring + Atlas")}
              </button>
              <button type="button" data-testid="strategy-single-staging-btn" aria-pressed={gpuStrategy === "single-staging-naive"} onClick={() => handleStrategyChange("single-staging-naive")} className={gpuStrategy === "single-staging-naive" ? BTN_ACTIVE : BTN_OUTLINE}>
                {pick("단일 Staging 비교", "Single Staging")}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-medium text-fg-2">{pick("세계 오프셋:", "World Offset:")}</span>
            {WORLD_OFFSET_PRESETS.map((preset) => (
              <button key={preset.px} type="button" data-testid={`world-offset-${preset.px}`} aria-pressed={worldOffsetPx === preset.px} onClick={() => handleWorldOffsetChange(preset.px)} className={worldOffsetPx === preset.px ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="tabular-nums">{preset.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <InfiniteZoomPortalPrecisionSvg scene={scene} isEn={isEn} />
        <GpuRingAndMegaAtlasSvg scene={scene} isEn={isEn} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div data-testid="semantic-band-weights-card" className="rounded-xl border border-line bg-card p-3.5">
          <h3 className="text-xs font-bold text-fg">{pick("4단계 시맨틱 줌 교차 페이드 가중치", "4-Band Semantic Cross-Fade Weights")}</h3>
          <div className="mt-2 space-y-2">
            {SEMANTIC_ZOOM_BANDS.map((band) => {
              const weightPct = Math.round(scene.bandWeights[band.id] * 100);
              return (
                <div key={band.id} className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className={band.id === scene.activeBandId ? "font-bold text-accent" : "text-fg-2"}>{isEn ? band.labelEn : band.labelKo}</span>
                    <span className="font-semibold tabular-nums text-fg">{`${weightPct}% · LOD ${band.lodLevel}`}</span>
                  </div>
                  <p className="text-[11px] text-fg-3">{isEn ? band.primitivesEn : band.primitivesKo}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div data-testid="parallax-layers-card" className="rounded-xl border border-line bg-card p-3.5">
          <h3 className="text-xs font-bold text-fg">{pick("2.5D 공간 시차 레이어 변위 & WGSL 정적 계약", "2.5D Parallax Displacements & WGSL Contract")}</h3>
          <div className="mt-2 space-y-1.5">
            {scene.parallaxLayers.map((layer) => (
              <div key={layer.id} className="flex items-center justify-between rounded-lg border border-line bg-raised px-2.5 py-1.5 text-[11px]">
                <span className="font-medium text-fg">{isEn ? layer.labelEn : layer.labelKo}</span>
                <span className="tabular-nums text-fg-2">{`z=${layer.depthZ.toFixed(2)} · Δ(${layer.effectiveShiftXPx.toFixed(1)}, ${layer.effectiveShiftYPx.toFixed(1)})px`}</span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {wgslValidation.checks.map((check) => (
              <span key={check.id} className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-medium ${check.passed ? "border-good bg-good-soft text-good" : "border-bad bg-bad-soft text-bad"}`}>
                {check.passed ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : <ShieldAlert className="h-3 w-3" aria-hidden="true" />}
                <span>{check.id}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      <footer className="space-y-3 border-t border-line pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" data-testid="copy-wgsl-btn" disabled={busy} onClick={handleCopyWgsl} className={BTN_SOLID}>
              <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("WGSL 셰이더 복사", "Copy WGSL Shader")}
            </button>
            <button type="button" data-testid="copy-manifest-json-btn" disabled={busy} onClick={handleCopyJson} className={BTN_OUTLINE}>
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("JSON 매니페스트 복사", "Copy JSON Manifest")}
            </button>
            <button type="button" data-testid="toggle-wgsl-preview-btn" aria-expanded={activePreview === "wgsl"} onClick={() => setActivePreview((prev) => (prev === "wgsl" ? "none" : "wgsl"))} className={activePreview === "wgsl" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("WGSL 미리보기", "Preview WGSL")}
            </button>
            <button type="button" data-testid="toggle-json-preview-btn" aria-expanded={activePreview === "json"} onClick={() => setActivePreview((prev) => (prev === "json" ? "none" : "json"))} className={activePreview === "json" ? BTN_ACTIVE : BTN_OUTLINE}>
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {pick("JSON 미리보기", "Preview JSON")}
            </button>
          </div>
          <p className="text-[11px] text-fg-3">{isEn ? scene.honestScope.measuredMathEn : scene.honestScope.measuredMathKo}</p>
        </div>

        <p role="status" aria-live="polite" data-testid="infinite-zoom-panel-status" className="min-h-4 text-xs text-fg-2">
          {statusMessage || (isEn ? scene.honestScope.runtimeBoundaryEn : scene.honestScope.runtimeBoundaryKo)}
        </p>

        {activePreview === "wgsl" && (
          <pre data-testid="wgsl-shader-preview" className="max-h-64 overflow-auto rounded-xl border border-line bg-canvas p-3 text-[11px] leading-relaxed tabular-nums text-fg">{wgslSource}</pre>
        )}
        {activePreview === "json" && (
          <pre data-testid="manifest-json-preview" className="max-h-64 overflow-auto rounded-xl border border-line bg-canvas p-3 text-[11px] leading-relaxed tabular-nums text-fg">{manifestJson}</pre>
        )}
      </footer>
    </section>
  );
}
