/**
 * Wave 66B — AtelierInk Ultra 극한 브러시 질감 & ToonSilicon CPU ISA 매트릭스 제어판.
 *
 * - 듀얼팁 4종 결합 · 더티 브러시 픽업/희석 · 모세관 섬유 번짐 · 강모 갈라짐 & 임파스토 광택 슬라이더
 * - 순수 시맨틱 OKLCH/currentColor 초근접 브러시 질감 비교 SVG (좌: 단일 원형 vs 우: 듀얼팁·더티픽업·섬유번짐·갈필 확대 단면)
 * - CPU 아키텍처 6종 ISA 파이프라인 스위처 + 브라우저 WASM Relaxed-SIMD vs 네이티브 FFI 경계 배지 + 64B 캐시라인 SoA 도해
 * - WGSL 듀얼팁 컴퓨트 셰이더 접기(<details>) + JSON 복사/내보내기 (오류 alert · 언마운트 가드)
 * - Calm Atelier 시맨틱 토큰 엄수(원시 색·바이올렛 265~325°·광범위 트랜지션·장식 아이콘·스토리지·기본 빈 객체 props 0건).
 */

import {
  AlertTriangle, Brush, Check, Code2, Copy, Cpu,
  Droplets, Layers, RotateCcw, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  CPU_ISA_PROFILES, DUAL_TIP_MODE_META, PAPER_FIBER_PROFILES,
  buildDualTipBrushWgsl, compareStandardVsUltraBrush, evaluateUltraBrushOptics,
  exportAtelierIsaBrushJson, formatOklch, resolveCpuIsaDispatchPlan, validateDualTipBrushWgsl,
  type AtelierIsaBrushExportPayload, type CpuIsaDispatchPlan, type CpuIsaProfileId,
  type DualTipBlendMode, type ExecutionBoundary, type PaperFiberProfileId,
  type SoaCacheLineLayoutReport, type UltraBrushOpticsInput, type UltraBrushOpticsReport,
} from "./atelier-isa-brush-engine";

export interface StudioAtelierIsaBrushUltraPanelProps {
  readonly initialDualTipMode?: DualTipBlendMode;
  readonly initialPaperFiberId?: PaperFiberProfileId;
  readonly initialProfileId?: CpuIsaProfileId;
  readonly initialExecutionBoundary?: ExecutionBoundary;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onOpticsChange?: (report: UltraBrushOpticsReport) => void;
  readonly onProfileChange?: (plan: CpuIsaDispatchPlan) => void;
  readonly onExportJson?: (json: string, payload: AtelierIsaBrushExportPayload) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

// 비바이올렛 OKLCH 시맨틱 SVG 팔레트 (모든 휴 265~325° 외 대역)
const SVG_STD_PAPER = "oklch(0.95 0.005 92)";
const SVG_INK_DARK = "oklch(0.28 0.015 232)";
const SVG_SPECULAR_GLINT = "oklch(0.98 0.014 86)";
const SVG_WATER_BLEED = "oklch(0.64 0.105 204 / 0.34)";
const SVG_SOA_LANE_A = "oklch(0.56 0.135 224)";
const SVG_SOA_LANE_B = "oklch(0.58 0.135 162)";
const SVG_SOA_LANE_C = "oklch(0.62 0.14 42)";
const SVG_AOS_WASTE = "oklch(0.76 0.025 84 / 0.55)";

const DUAL_TIP_MODE_LIST: readonly DualTipBlendMode[] = ["multiply", "subtract", "height-clip", "color-dodge"];
const STD_DOT_INDICES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SOA_LANES: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7];

function roundSvg(val: number): number { return Math.round(val * 10) / 10; }

function buildDefaultInput(dualTipMode: DualTipBlendMode | undefined, paperFiberId: PaperFiberProfileId | undefined): UltraBrushOpticsInput {
  return {
    dualTipMode: dualTipMode && DUAL_TIP_MODE_LIST.includes(dualTipMode) ? dualTipMode : "height-clip",
    paperFiberId: paperFiberId && PAPER_FIBER_PROFILES.some((p) => p.id === paperFiberId) ? paperFiberId : "hanji-mulberry",
    pickupPct: 52, dilutionPct: 26, capillaryBleedPct: 58, strokeSpeedPxPerSec: 1260,
    tiltDeg: 40, dryingProgress: 0.3, impastoDepthMm: 1.2, bristleCount: 20,
    secondaryContrast: 0.74, secondaryGrainScale: 1.35, secondaryRotationJitterDeg: 137.5,
  };
}

function resolveInitialProfileId(candidate: CpuIsaProfileId | undefined): CpuIsaProfileId {
  if (candidate && CPU_ISA_PROFILES.some((p) => p.id === candidate)) return candidate;
  return "x86-intel-amx-avx512";
}

function OpticsSlider(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly readout: string;
  readonly hint: string; readonly min: number; readonly max: number; readonly step: number;
  readonly value: number; readonly onChange: (value: number) => void;
}): ReactElement {
  return (
    <div className="space-y-0.5">
      <label htmlFor={props.id} className="flex items-center justify-between gap-2 text-xs font-medium text-fg-2 [word-break:keep-all]">
        <span>{props.label}</span>
        <span data-testid={`${props.testId}-readout`} className="font-mono font-bold text-fg tabular-nums">{props.readout}</span>
      </label>
      <input
        id={props.id} data-testid={props.testId} type="range"
        min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
      <p className="text-[11px] text-fg-3 [word-break:keep-all]">{props.hint}</p>
    </div>
  );
}

/** 초근접 브러시 질감 좌우 정밀 비교 SVG (순수 OKLCH + currentColor). */
function UltraBrushCloseupSvg(props: { readonly report: UltraBrushOpticsReport; readonly isEn: boolean }): ReactElement {
  const { report, isEn } = props;
  const colW = 362;
  const leftX = 12;
  const rightX = 386;
  const pad = 14;
  const innerW = colW - pad * 2;
  const topY = 42;
  const topH = 128;
  const midY = topY + 66;
  const secY = 186;
  const secH = 132;
  const secBaseY = secY + 108;

  const paperFill = formatOklch(report.paperSpec.paperOklch);
  const valleyFill = formatOklch(report.paperSpec.valleyOklch);
  const brushSolid = formatOklch(report.dirtyPickup.brushPigmentOklch, 0.92);
  const underSolid = formatOklch(report.dirtyPickup.canvasUnderColorOklch, 0.84);
  const backrunStroke = formatOklch(
    { l: Math.max(0.14, report.dirtyPickup.finalMixedOklch.l - 0.14), c: report.dirtyPickup.finalMixedOklch.c, h: report.dirtyPickup.finalMixedOklch.h },
    Math.min(0.88, 0.22 + (report.capillaryBleed.edgePigmentConcentration - 1) * 0.9),
  );

  const dualSamples = report.dualTip.samples;
  const rCrossX = rightX + pad;
  const grainPathPoints = dualSamples.map((s, idx) =>
    `${roundSvg(rCrossX + (idx / Math.max(1, dualSamples.length - 1)) * innerW)},${roundSvg(secBaseY - s.secondaryGrain * 56)}`,
  );
  const paperCrossPath = `M ${rCrossX} ${secBaseY} L ${grainPathPoints.join(" L ")} L ${rCrossX + innerW} ${secBaseY} Z`;
  const sheenOpacity = roundSvg(Math.min(0.95, 0.14 + report.bristleForking.valleySpecularSheen * 0.72));

  return (
    <svg
      data-testid="ultra-brush-closeup-svg"
      data-dual-tip-mode={report.dualTip.mode}
      data-fork-clusters={report.bristleForking.forkClusterCount}
      data-pickup-pct={report.dirtyPickup.pickupPct}
      viewBox="0 0 760 330" role="img"
      aria-label={isEn
        ? "Close-up brush optics comparison: single circular stamp versus AtelierInk Ultra dual-tip, dirty pickup, capillary bleed, and bristle forking"
        : "단일 원형 스탬프 브러시와 AtelierInk Ultra 듀얼팁·더티픽업·섬유번짐·강모갈라짐 초근접 확대 단면 비교 도해"}
      className="h-auto w-full rounded-xl border border-line bg-card text-fg"
    >
      {/* 좌측: 일반 단일 원형 스탬프 */}
      <g data-testid="svg-standard-brush-col">
        <rect x={leftX} y={10} width={colW} height={310} rx={12} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={1.2} />
        <text x={leftX + pad} y={30} fontSize={11} fontWeight={700} fill="currentColor">
          {isEn ? "Standard · Single Circular Stamp" : "일반 단일 원형 스탬프 브러시"}
        </text>
        <text x={leftX + colW - pad} y={30} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.65}>
          {isEn ? "Repeat 86% · Pickup 0%" : "패턴 반복 86% · 픽업 0%"}
        </text>
        <rect x={leftX + pad} y={topY} width={innerW} height={topH} rx={8} fill={SVG_STD_PAPER} stroke={valleyFill} strokeWidth={1} />
        <rect x={leftX + pad + 18} y={topY + 26} width={118} height={74} rx={6} fill={underSolid} fillOpacity={0.5} />
        <text x={leftX + pad + 8} y={topY + 14} fontSize={9} fontWeight={600} fill={SVG_INK_DARK} fillOpacity={0.75}>
          {isEn ? "TOP · Repeating Stamps & Flat Overpaint" : "평면 확대 · 반복 원형 도장 & 바닥색 무시 덮어칠"}
        </text>
        {STD_DOT_INDICES.map((step) => {
          const t = step / (STD_DOT_INDICES.length - 1);
          return <circle key={step} cx={roundSvg(leftX + pad + 32 + t * (innerW - 64))} cy={roundSvg(midY + Math.sin(t * Math.PI * 1.4) * 12)} r={14} fill={brushSolid} fillOpacity={0.78} />;
        })}
        <rect x={leftX + pad} y={secY} width={innerW} height={secH} rx={8} fill={SVG_STD_PAPER} stroke={valleyFill} strokeWidth={1} />
        <text x={leftX + pad + 8} y={secY + 15} fontSize={9} fontWeight={600} fill={SVG_INK_DARK} fillOpacity={0.75}>
          {isEn ? "CROSS-SECTION · Flat Uniform Layer (No Fork / No Sheen)" : "확대 단면 · 평면 단일 층 (종이 결·갈필·광택 0)"}
        </text>
        <rect x={leftX + pad + 12} y={secBaseY - 22} width={innerW - 24} height={22} rx={2} fill={valleyFill} fillOpacity={0.55} />
        <rect x={leftX + pad + 12} y={secBaseY - 38} width={innerW - 24} height={16} rx={2} fill={brushSolid} fillOpacity={0.74} />
        <text x={leftX + pad + 12} y={secY + secH - 8} fontSize={9} fill={SVG_INK_DARK} fillOpacity={0.72}>
          {isEn ? "Zero dual-tip modulation · Fixed matte alpha" : "듀얼팁 변조 없음 · 모세관 번짐 및 광택 전이 없음"}
        </text>
      </g>

      <line x1={380} y1={16} x2={380} y2={316} stroke="currentColor" strokeOpacity={0.22} strokeDasharray="4 4" />

      {/* 우측: AtelierInk Ultra 듀얼팁 · 더티픽업 · 섬유번짐 · 강모갈라짐 */}
      <g data-testid="svg-ultra-brush-col">
        <rect x={rightX} y={10} width={colW} height={310} rx={12} fill="none" stroke="currentColor" strokeOpacity={0.34} strokeWidth={1.4} />
        <text x={rightX + pad} y={30} fontSize={11} fontWeight={700} fill="currentColor">
          {`AtelierInk Ultra · ${DUAL_TIP_MODE_META[report.dualTip.mode].labelEn}`}
        </text>
        <text x={rightX + colW - pad} y={30} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.8}>
          {isEn ? `Repeat ${Math.round(report.dualTip.patternRepeatRate * 100)}% · ${report.bristleForking.forkClusterCount}-Fork` : `반복 ${Math.round(report.dualTip.patternRepeatRate * 100)}% · ${report.bristleForking.forkClusterCount}갈래 갈필`}
        </text>
        <rect x={rightX + pad} y={topY} width={innerW} height={topH} rx={8} fill={paperFill} stroke={valleyFill} strokeWidth={1} />
        <rect x={rightX + pad + 18} y={topY + 26} width={118} height={74} rx={6} fill={underSolid} fillOpacity={0.55} />
        <text x={rightX + pad + 8} y={topY + 14} fontSize={9} fontWeight={600} fill={SVG_INK_DARK} fillOpacity={0.8}>
          {isEn ? "TOP · Dirty Pickup Trail · Fiber Bleed · Dynamic Forking" : "평면 확대 · 더티 픽업 그라데이션 · 이방성 번짐 · 강모 갈라짐"}
        </text>

        {report.capillaryBleed.backrunRingWidthPx > 0.2 ? (
          <g data-testid="svg-capillary-bleed-layer">
            <ellipse
              cx={roundSvg(rightX + pad + innerW * 0.5)} cy={midY}
              rx={roundSvg(124 + report.capillaryBleed.parallelBleedMm * 14)}
              ry={roundSvg(24 + report.capillaryBleed.perpendicularBleedMm * 12)}
              fill={SVG_WATER_BLEED} stroke={backrunStroke}
              strokeWidth={roundSvg(Math.min(4.5, 0.8 + report.capillaryBleed.backrunRingWidthPx * 0.55))}
              strokeDasharray={report.capillaryBleed.fiberAnisotropy > 0.55 ? "9 3 4 2" : undefined}
            />
          </g>
        ) : null}

        <g data-testid="svg-dirty-pickup-fork-layer">
          {report.bristleForking.forkClusters.map((cluster) => {
            const yBase = midY + cluster.lateralOffsetNorm * (12 + report.input.tiltDeg * 0.18);
            return report.dirtyPickup.trailSamples.map((step, idx) => {
              const nextStep = report.dirtyPickup.trailSamples[idx + 1];
              if (!nextStep || step.t > cluster.tailReachRatio) return null;
              return (
                <line
                  key={`${cluster.clusterIndex}-${idx}`}
                  x1={roundSvg(rightX + pad + 26 + step.t * (innerW - 52))}
                  y1={roundSvg(yBase + Math.sin(step.t * Math.PI * 1.4) * 10)}
                  x2={roundSvg(rightX + pad + 26 + Math.min(cluster.tailReachRatio, nextStep.t) * (innerW - 52))}
                  y2={roundSvg(yBase + Math.sin(nextStep.t * Math.PI * 1.4) * 10)}
                  stroke={formatOklch(step.blendedOklch, step.effectiveOpacity)}
                  strokeWidth={roundSvg(Math.max(2.4, (22 / report.bristleForking.forkClusterCount) * (1 - step.t * 0.22)))}
                  strokeLinecap="round"
                />
              );
            });
          })}
        </g>

        <path
          data-testid="svg-ultra-specular-glint"
          d={`M ${rightX + pad + 32} ${midY - 6} C ${rightX + pad + 118} ${midY - 22}, ${rightX + pad + 214} ${midY + 12}, ${rightX + pad + innerW - 34} ${midY - 8}`}
          fill="none" stroke={SVG_SPECULAR_GLINT} strokeWidth={roundSvg(1.2 + report.bristleForking.impastoDepthMm * 1.1)}
          strokeLinecap="round" strokeOpacity={sheenOpacity}
        />

        <rect x={rightX + pad} y={secY} width={innerW} height={secH} rx={8} fill={paperFill} stroke={valleyFill} strokeWidth={1} />
        <text x={rightX + pad + 8} y={secY + 15} fontSize={9} fontWeight={600} fill={SVG_INK_DARK} fillOpacity={0.8}>
          {isEn ? "CROSS-SECTION · Dual-Tip Modulation + Wet→Dry Impasto Sheen" : "확대 단면 · 듀얼팁 결 결합 + 임파스토 골짜기 광택 전이"}
        </text>
        <path d={paperCrossPath} fill={valleyFill} fillOpacity={0.72} stroke={SVG_INK_DARK} strokeOpacity={0.32} strokeWidth={1} />
        {dualSamples.map((s, idx) => {
          if (s.modulated <= 0.14) return null;
          const x = roundSvg(rCrossX + (idx / Math.max(1, dualSamples.length - 1)) * innerW);
          const groundY = roundSvg(secBaseY - s.secondaryGrain * 56);
          const ridgeH = roundSvg(4 + s.modulated * (8 + report.bristleForking.impastoDepthMm * 4.5));
          return (
            <g key={idx}>
              <rect x={roundSvg(x - 6)} y={roundSvg(groundY - ridgeH)} width={12} height={ridgeH} rx={2.5} fill={formatOklch(report.dirtyPickup.finalMixedOklch, Math.max(0.35, s.modulated))} />
              {report.bristleForking.valleySpecularSheen > 0.22 ? (
                <line x1={roundSvg(x - 4)} y1={roundSvg(groundY - ridgeH + 1.5)} x2={roundSvg(x + 3.5)} y2={roundSvg(groundY - ridgeH + 1.5)} stroke={SVG_SPECULAR_GLINT} strokeWidth={1.3} strokeOpacity={sheenOpacity} />
              ) : null}
            </g>
          );
        })}
        <text x={rCrossX + 8} y={secY + secH - 8} fontSize={9} fill={SVG_INK_DARK} fillOpacity={0.8}>
          {isEn ? `Coverage ${Math.round(report.dualTip.effectiveCoverage * 100)}% · Anisotropy ${report.capillaryBleed.anisotropyRatio}:1 · R ${report.bristleForking.surfaceRoughness.toFixed(2)}` : `피복률 ${Math.round(report.dualTip.effectiveCoverage * 100)}% · 이방성 ${report.capillaryBleed.anisotropyRatio}:1 · 거칠기 ${report.bristleForking.surfaceRoughness.toFixed(2)}`}
        </text>
      </g>
    </svg>
  );
}

/** 64B 캐시라인 정렬 SoA 메모리 레이아웃 도해 SVG (순수 OKLCH + currentColor). */
function SoaCacheLineSvg(props: { readonly soaLayout: SoaCacheLineLayoutReport; readonly isEn: boolean }): ReactElement {
  const { soaLayout, isEn } = props;
  return (
    <svg
      data-testid="soa-cacheline-svg" data-aligned-64b={String(soaLayout.allAlignedTo64B)}
      viewBox="0 0 760 150" role="img"
      aria-label={isEn ? "64-byte cache-line aligned SoA memory layout versus interleaved AoS" : "64B 캐시라인 정렬 SoA 메모리 레이아웃과 기존 AoS 산재 구조 비교 도해"}
      className="h-auto w-full rounded-xl border border-line bg-card text-fg"
    >
      <text x={16} y={22} fontSize={10} fontWeight={700} fill="currentColor" fillOpacity={0.75}>
        {isEn ? "Legacy AoS (Interleaved · Gather Overhead)" : "기존 AoS · 속성 혼재 (벡터 레인 산재 · 캐시라인 낭비)"}
      </text>
      {SOA_LANES.map((idx) => {
        const bx = 16 + idx * 91;
        return (
          <g key={`aos-${idx}`}>
            <rect x={bx} y={30} width={22} height={22} rx={3} fill={SVG_SOA_LANE_A} />
            <rect x={bx + 23} y={30} width={64} height={22} rx={3} fill={SVG_AOS_WASTE} />
            <text x={bx + 11} y={44} textAnchor="middle" fontSize={8} fontWeight={700} fill={SVG_SPECULAR_GLINT}>{`x${idx}`}</text>
            <text x={bx + 55} y={44} textAnchor="middle" fontSize={8} fill={SVG_INK_DARK}>y/load/k</text>
          </g>
        );
      })}
      <text x={16} y={76} fontSize={10} fontWeight={700} fill="currentColor">
        {isEn
          ? `ToonSilicon 64B Cache-Line SoA (${soaLayout.f32LanesPerCacheLine} × f32 / 64B Line · ${soaLayout.totalCacheLines} Lines · 0 False Sharing)`
          : `ToonSilicon 64B 캐시라인 정렬 SoA (라인당 ${soaLayout.f32LanesPerCacheLine}×f32 연속 적재 · 총 ${soaLayout.totalCacheLines}라인 · 거짓 공유 0)`}
      </text>
      <rect x={16} y={84} width={236} height={44} rx={6} fill={SVG_SOA_LANE_A} fillOpacity={0.9} />
      <text x={134} y={102} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={SVG_SPECULAR_GLINT}>km16_spectral_bands[0..15]</text>
      <text x={134} y={118} textAnchor="middle" fontSize={8.5} fill={SVG_SPECULAR_GLINT} fillOpacity={0.9}>64B (1 Cache Line · 1×ZMM / 4×SIMD128)</text>
      <rect x={262} y={84} width={236} height={44} rx={6} fill={SVG_SOA_LANE_B} fillOpacity={0.9} />
      <text x={380} y={102} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={SVG_SPECULAR_GLINT}>bristle_pos_x[0..23] + pad[8]</text>
      <text x={380} y={118} textAnchor="middle" fontSize={8.5} fill={SVG_SPECULAR_GLINT} fillOpacity={0.9}>128B (2 Cache Lines · Branchless 32-lane)</text>
      <rect x={508} y={84} width={236} height={44} rx={6} fill={SVG_SOA_LANE_C} fillOpacity={0.9} />
      <text x={626} y={102} textAnchor="middle" fontSize={9.5} fontWeight={700} fill={SVG_SPECULAR_GLINT}>SAB Tile Slot + 64B Guard</text>
      <text x={626} y={118} textAnchor="middle" fontSize={8.5} fill={SVG_SPECULAR_GLINT} fillOpacity={0.9}>Atomics.waitAsync · 64B Aligned Stride</text>
    </svg>
  );
}

/** AtelierInk Ultra 브러시 질감 + ToonSilicon CPU ISA 제어판 (모든 props 선택적, 기본 빈 객체 props 미사용). */
export function StudioAtelierIsaBrushUltraPanel(props: StudioAtelierIsaBrushUltraPanelProps): ReactElement {
  const uid = useId();
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [brushInput, setBrushInput] = useState<UltraBrushOpticsInput>(() =>
    buildDefaultInput(props.initialDualTipMode, props.initialPaperFiberId),
  );
  const [profileId, setProfileId] = useState<CpuIsaProfileId>(() => resolveInitialProfileId(props.initialProfileId));
  const [boundary, setBoundary] = useState<ExecutionBoundary>(
    props.initialExecutionBoundary === "native-ffi-bridge" ? "native-ffi-bridge" : "browser-web-standard",
  );
  const [copyState, setCopyState] = useState<
    | { readonly status: "idle" }
    | { readonly status: "pending"; readonly kind: "json" | "wgsl" }
    | { readonly status: "copied"; readonly kind: "json" | "wgsl" }
    | { readonly status: "error"; readonly kind: "json" | "wgsl" }
  >({ status: "idle" });

  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const onExportRef = useRef(props.onExportJson);
  useEffect(() => { onExportRef.current = props.onExportJson; }, [props.onExportJson]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const report = useMemo(() => evaluateUltraBrushOptics(brushInput), [brushInput]);
  const comparison = useMemo(() => compareStandardVsUltraBrush(report), [report]);
  const dispatchPlan = useMemo(
    () => resolveCpuIsaDispatchPlan({ profileId, executionBoundary: boundary, bristleCount: report.input.bristleCount }),
    [profileId, boundary, report.input.bristleCount],
  );
  const wgslSource = useMemo(() => buildDualTipBrushWgsl(report.input), [report.input]);
  const wgslValidation = useMemo(() => validateDualTipBrushWgsl(wgslSource), [wgslSource]);
  const exportBundle = useMemo(
    () => exportAtelierIsaBrushJson({ brushInput: report.input, profileId, executionBoundary: boundary }),
    [report.input, profileId, boundary],
  );

  function updateBrush<K extends keyof UltraBrushOpticsInput>(key: K, value: UltraBrushOpticsInput[K]): void {
    const nextInput: UltraBrushOpticsInput = { ...brushInput, [key]: value };
    setBrushInput(nextInput);
    setCopyState({ status: "idle" });
    props.onOpticsChange?.(evaluateUltraBrushOptics(nextInput));
  }

  function handleSelectProfile(nextId: CpuIsaProfileId): void {
    const nextBoundary: ExecutionBoundary = nextId === "browser-portable-wasm-relaxed" ? "browser-web-standard" : boundary;
    setProfileId(nextId);
    setBoundary(nextBoundary);
    setCopyState({ status: "idle" });
    props.onProfileChange?.(resolveCpuIsaDispatchPlan({ profileId: nextId, executionBoundary: nextBoundary, bristleCount: report.input.bristleCount }));
  }

  function handleSelectBoundary(nextBoundary: ExecutionBoundary): void {
    const effectiveProfile: CpuIsaProfileId =
      nextBoundary === "native-ffi-bridge" && profileId === "browser-portable-wasm-relaxed" ? "x86-intel-amx-avx512" : profileId;
    setProfileId(effectiveProfile);
    setBoundary(nextBoundary);
    setCopyState({ status: "idle" });
    props.onProfileChange?.(resolveCpuIsaDispatchPlan({ profileId: effectiveProfile, executionBoundary: nextBoundary, bristleCount: report.input.bristleCount }));
  }

  function handleReset(): void {
    const defaults = buildDefaultInput(props.initialDualTipMode, props.initialPaperFiberId);
    setBrushInput(defaults);
    setCopyState({ status: "idle" });
    props.onOpticsChange?.(evaluateUltraBrushOptics(defaults));
  }

  async function handleCopy(kind: "json" | "wgsl"): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setCopyState({ status: "pending", kind });
    const snapshot = exportBundle;
    try {
      const writeText = globalThis.navigator?.clipboard?.writeText;
      if (typeof writeText !== "function") throw new Error("clipboard unavailable");
      await writeText.call(globalThis.navigator.clipboard, kind === "json" ? snapshot.json : snapshot.wgsl);
      if (!mountedRef.current) return;
      if (kind === "json" && onExportRef.current) await onExportRef.current(snapshot.json, snapshot.payload);
      if (mountedRef.current) setCopyState({ status: "copied", kind });
    } catch {
      if (mountedRef.current) setCopyState({ status: "error", kind });
    } finally {
      inFlightRef.current = false;
    }
  }

  const rootClassName = `space-y-5 rounded-2xl border border-line bg-card p-5 text-fg ${props.className ?? ""}`.trim();

  return (
    <section
      data-testid="studio-atelier-isa-brush-ultra-panel"
      aria-label={pick("AtelierInk Ultra 브러시 질감 및 ToonSilicon CPU ISA 제어판", "AtelierInk Ultra Brush & ToonSilicon CPU ISA Panel")}
      className={rootClassName}
    >
      {/* 헤더 + 빠른 동작 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-semibold text-accent [word-break:keep-all]">
            <Brush className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            AtelierInk Ultra · ToonSilicon · ToonCore
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("극한 브러시 질감 물리 · 최신 CPU 명령어 세트(ISA) 매트릭스", "Ultra Brush Optics & Modern CPU ISA Dispatch Matrix")}
          </h2>
          <p className="max-w-3xl text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "듀얼 팁 비반복 결합·더티 브러시 안료 픽업·모세관 섬유 번짐·동적 강모 갈라짐과 브라우저 WASM Relaxed-SIMD(AVX-512/NEON 로어링)·네이티브 AMX/SME/SVE2 경계를 통합 설계한다.",
              "Unifies dual-tip grain modulation, dirty canvas pigment pickup, anisotropic capillary bleed, and dynamic bristle forking with WASM Relaxed-SIMD browser execution and native AMX/SME/SVE2 FFI boundaries.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="reset-ultra-brush-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("기본값 복원", "Reset")}
          </button>
          <button type="button" data-testid="copy-ultra-json-btn" onClick={() => { void handleCopy("json"); }} disabled={copyState.status === "pending"} className={BTN_SOLID}>
            {copyState.status === "copied" && copyState.kind === "json" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {copyState.status === "copied" && copyState.kind === "json" ? pick("JSON 복사됨", "JSON Copied") : copyState.status === "error" && copyState.kind === "json" ? pick("JSON 다시 복사", "Retry JSON") : pick("JSON 복사", "Copy JSON")}
          </button>
        </div>
      </div>

      {copyState.status === "error" ? (
        <div role="alert" data-testid="ultra-copy-error-alert" className="flex items-center gap-2 rounded-lg border border-warn bg-raised px-3 py-2 text-xs text-warn [word-break:keep-all]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{pick("클립보드 복사 또는 내보내기 콜백 실행에 실패했습니다. 다시 눌러 재시도하세요.", "Clipboard copy or export callback failed. Press again to retry.")}</span>
        </div>
      ) : null}

      {/* 1. 듀얼팁 4종 결합 모드 + 종이 섬유 + 물리 슬라이더 */}
      <div className="space-y-4 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("듀얼 팁 광학 결합 · 더티 픽업 · 모세관 번짐 · 강모 갈라짐", "Dual-Tip Blending · Dirty Pickup · Capillary Bleed · Bristle Forking")}
          </h3>
          <span data-testid="fork-status-pill" className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-2 tabular-nums">
            <Droplets className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick(`${report.bristleForking.forkClusterCount}갈래 갈필 · 거칠기 ${report.bristleForking.surfaceRoughness.toFixed(2)}`, `${report.bristleForking.forkClusterCount}-Way Fork · R ${report.bristleForking.surfaceRoughness.toFixed(2)}`)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {DUAL_TIP_MODE_LIST.map((mode) => {
            const active = report.dualTip.mode === mode;
            const meta = DUAL_TIP_MODE_META[mode];
            return (
              <button key={mode} type="button" data-testid={`dual-tip-mode-${mode}`} aria-pressed={active} onClick={() => updateBrush("dualTipMode", mode)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                {isEn ? meta.labelEn : meta.labelKo}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {PAPER_FIBER_PROFILES.map((paper) => {
            const active = report.paperSpec.id === paper.id;
            return (
              <button key={paper.id} type="button" data-testid={`paper-fiber-${paper.id}`} aria-pressed={active} onClick={() => updateBrush("paperFiberId", paper.id)} className={active ? BTN_ACTIVE : BTN_OUTLINE}>
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-line" style={{ backgroundColor: formatOklch(paper.paperOklch) }} aria-hidden="true" />
                {isEn ? paper.nameEn : paper.nameKo}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <OpticsSlider id={`${uid}-pickup`} testId="slider-dirty-pickup" label={pick("더티 브러시 안료 픽업", "Dirty Brush Pickup")} readout={`${report.dirtyPickup.pickupPct}%`} hint={pick("바닥 캔버스 안료를 붓모에 실시간 묻혀 자연스럽게 끌어옵니다", "Loads underlying canvas pigment onto bristles for smooth oil/gouache blends")} min={0} max={100} step={2} value={report.dirtyPickup.pickupPct} onChange={(v) => updateBrush("pickupPct", v)} />
          <OpticsSlider id={`${uid}-dilution`} testId="slider-dilution" label={pick("물감 희석률 (Dilution)", "Pigment Dilution")} readout={`${report.dirtyPickup.dilutionPct}%`} hint={pick("높을수록 투명 글레이징 농도와 수채 번짐 유동성이 커집니다", "Higher dilution lowers opacity and boosts watercolor wash mobility")} min={0} max={100} step={2} value={report.dirtyPickup.dilutionPct} onChange={(v) => updateBrush("dilutionPct", v)} />
          <OpticsSlider id={`${uid}-bleed`} testId="slider-capillary-bleed" label={pick("모세관 종이 섬유 번짐", "Capillary Fiber Bleed")} readout={`${report.capillaryBleed.capillaryBleedPct}% · ${report.capillaryBleed.anisotropyRatio}:1`} hint={pick("한지·코튼지 섬유 결 방향을 따라 스며들고 백런 안료 링을 만듭니다", "Feathers along directional paper fibers and pools pigment at wet rims")} min={0} max={100} step={2} value={report.capillaryBleed.capillaryBleedPct} onChange={(v) => updateBrush("capillaryBleedPct", v)} />
          <OpticsSlider id={`${uid}-speed`} testId="slider-stroke-speed" label={pick("강모 갈라짐 속도 (Forking)", "Stroke Speed (Bristle Forking)")} readout={`${report.input.strokeSpeedPxPerSec} px/s`} hint={pick("임계 속도·기울기 초과 시 붓모가 2~4갈래 갈필로 자연 분기합니다", "Splits bristles into 2–4 dry-brush forks past speed/tilt threshold")} min={120} max={2400} step={40} value={report.input.strokeSpeedPxPerSec} onChange={(v) => updateBrush("strokeSpeedPxPerSec", v)} />
          <OpticsSlider id={`${uid}-tilt`} testId="slider-stylus-tilt" label={pick("스타일러스 기울기", "Stylus Tilt")} readout={`${report.input.tiltDeg}°`} hint={pick("기울기가 클수록 갈필 분기와 종이 산봉우리 접촉이 강화됩니다", "Greater tilt amplifies bristle splay and peak-tooth catching")} min={0} max={75} step={1} value={report.input.tiltDeg} onChange={(v) => updateBrush("tiltDeg", v)} />
          <OpticsSlider id={`${uid}-drying`} testId="slider-drying-impasto" label={pick("건조 진행도 (젖은 광택→매트)", "Drying Progress (Gloss→Matte)")} readout={`${Math.round(report.input.dryingProgress * 100)}% · ${report.bristleForking.impastoDepthMm.toFixed(1)}mm`} hint={pick("젖은 임파스토 골짜기 광택(R 0.14)에서 건조 매트(R 0.80)로 전이", "Transitions wet impasto valley sheen (0.14) into dry matte finish (0.80)")} min={0} max={1} step={0.05} value={report.input.dryingProgress} onChange={(v) => updateBrush("dryingProgress", v)} />
        </div>
      </div>

      {/* 2. 초근접 브러시 질감 비교 SVG + 5축 광학 비교기 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("초근접 브러시 질감 확대 비교 (순수 OKLCH 시맨틱 SVG)", "Close-Up Brush Optics Comparison (Pure OKLCH SVG)")}
          </h3>
          <span data-testid="ultra-comparison-summary" className="font-mono text-xs font-bold text-good tabular-nums">
            {pick(`실물 화구 광학 ${comparison.standardOverall}점 → ${comparison.ultraOverall}점 (+${comparison.overallDelta}pt)`, `Optical Score ${comparison.standardOverall} → ${comparison.ultraOverall} (+${comparison.overallDelta}pt)`)}
          </span>
        </div>
        <UltraBrushCloseupSvg report={report} isEn={isEn} />

        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-5">
          {comparison.axes.map((axis) => (
            <div key={axis.id} data-testid={`comparison-axis-${axis.id}`} className="space-y-1 rounded-lg border border-line bg-card p-2.5">
              <div className="text-[11px] font-semibold text-fg [word-break:keep-all]">{isEn ? axis.labelEn : axis.labelKo}</div>
              <div className="font-mono text-xs text-fg-2 tabular-nums">
                {`${axis.standardScore} → `}<strong className="text-good">{axis.ultraScore}</strong>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                <div className="h-full rounded-full bg-accent" style={{ width: `${axis.ultraScore}%` }} />
              </div>
              <p className="text-[10px] text-fg-3 [word-break:keep-all]">{isEn ? axis.summaryEn : axis.summaryKo}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 3. ToonSilicon CPU 아키텍처별 ISA 파이프라인 스위처 + 64B SoA 도해 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("ToonSilicon 최신 CPU 명령어 세트(ISA) 풀파워 매트릭스", "ToonSilicon Modern CPU ISA Full-Power Matrix")}
          </h3>
          <span
            data-testid="execution-boundary-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold [word-break:keep-all] ${
              dispatchPlan.activeBoundary === "browser-web-standard" ? "border-good bg-card text-good" : "border-warn bg-card text-warn"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {dispatchPlan.activeBoundary === "browser-web-standard"
              ? pick("브라우저 즉시 실행 · WASM Relaxed-SIMD", "Browser Ready · WASM Relaxed-SIMD")
              : pick("네이티브 FFI 브리지 확장 경계 (AMX/SME/SVE2/AVX-512)", "Native FFI Bridge Boundary (AMX/SME/SVE2/AVX-512)")}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="boundary-browser-btn" aria-pressed={dispatchPlan.activeBoundary === "browser-web-standard"} onClick={() => handleSelectBoundary("browser-web-standard")} className={dispatchPlan.activeBoundary === "browser-web-standard" ? BTN_ACTIVE : BTN_OUTLINE}>
            {pick("브라우저 웹 표준 (WASM Relaxed-SIMD · WASM64 · SAB)", "Browser Web Standard (WASM Relaxed-SIMD · WASM64 · SAB)")}
          </button>
          <button type="button" data-testid="boundary-native-btn" aria-pressed={dispatchPlan.activeBoundary === "native-ffi-bridge"} onClick={() => handleSelectBoundary("native-ffi-bridge")} className={dispatchPlan.activeBoundary === "native-ffi-bridge" ? BTN_ACTIVE : BTN_OUTLINE}>
            {pick("네이티브 FFI 브리지 (데스크톱/모바일 확장 경계)", "Native FFI Bridge (Desktop/Mobile Boundary)")}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          {CPU_ISA_PROFILES.map((prof) => {
            const selected = prof.id === dispatchPlan.profile.id;
            return (
              <button
                key={prof.id} type="button" data-testid={`isa-profile-${prof.id}`} aria-pressed={selected}
                onClick={() => handleSelectProfile(prof.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${selected ? "border-accent bg-accent-soft" : "border-line bg-card hover:border-line-strong"}`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="text-xs font-bold text-fg [word-break:keep-all]">{isEn ? prof.labelEn : prof.labelKo}</span>
                  <span className="font-mono text-[10px] text-accent tabular-nums">{prof.archFamily}</span>
                </div>
                <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? prof.siliconScopeEn : prof.siliconScopeKo}</p>
                <span className="font-mono text-[10px] text-fg-3 tabular-nums">{`WASM ${prof.browserVectorBits}b → Native ${prof.nativeVectorBits}b`}</span>
              </button>
            );
          })}
        </div>

        <div data-testid="isa-dispatch-detail" className="grid grid-cols-1 gap-2 rounded-lg border border-line bg-card p-3 text-xs md:grid-cols-2">
          <div className="space-y-1">
            <span className="font-semibold text-good [word-break:keep-all]">{pick("현재 브라우저 즉시 동작 경로 (JIT 자동 로어링)", "Browser Immediate Path (Auto JIT Lowering)")}</span>
            <p className="font-mono text-[11px] text-fg-2">{dispatchPlan.profile.browserWasmPath}</p>
            <p className="text-[11px] text-fg-3 [word-break:keep-all]">{dispatchPlan.profile.browserJitLowering}</p>
          </div>
          <div className="space-y-1">
            <span className="font-semibold text-warn [word-break:keep-all]">{pick("네이티브 FFI 브리지 전용 확장 ISA", "Native FFI Bridge Extension ISA")}</span>
            <p className="font-mono text-[11px] text-fg-2">{dispatchPlan.profile.nativeFfiIsaSet.join(" · ")}</p>
            <p className="text-[11px] text-fg-3 [word-break:keep-all]">{dispatchPlan.profile.matrixExtension}</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-line bg-raised text-[11px] text-fg-2">
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("ToonStudio 연산 커널", "ToonStudio Kernel")}</th>
                <th className="px-3 py-2 font-semibold [word-break:keep-all]">{pick("활성 ISA 명령어 시퀀스", "Active ISA Instructions")}</th>
                <th className="px-3 py-2 font-semibold tabular-nums">{pick("벡터 폭", "Lanes")}</th>
                <th className="px-3 py-2 font-semibold tabular-nums">64B SoA</th>
              </tr>
            </thead>
            <tbody>
              {dispatchPlan.kernelDispatches.map((k) => (
                <tr key={k.kernelId} data-testid={`kernel-row-${k.kernelId}`} className="border-b border-line/60 last:border-b-0">
                  <td className="px-3 py-2 align-top">
                    <div className="font-semibold text-fg [word-break:keep-all]">{isEn ? k.nameEn : k.nameKo}</div>
                    <div className="text-[10px] text-fg-3 [word-break:keep-all]">{isEn ? k.domainStageEn : k.domainStageKo}</div>
                  </td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-accent">{k.activeInstructions.join(" · ")}</td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-fg-2 tabular-nums">{`${k.vectorLaneWidthF32}×f32 / ${k.vectorLaneWidthI8}×i8`}</td>
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-fg-2 tabular-nums">{`${k.soaAlignedBytes}B (${k.soaCacheLines}L)`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-fg [word-break:keep-all]">
              <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("64B 캐시라인 정렬 SoA(Structure of Arrays) 메모리 레이아웃", "64B Cache-Line Aligned SoA Memory Layout")}
            </span>
            <span className="font-mono text-[11px] text-good tabular-nums">
              {`${dispatchPlan.soaLayout.totalBytes}B · ${dispatchPlan.soaLayout.totalCacheLines} lines · 64B ${dispatchPlan.soaLayout.allAlignedTo64B ? "PASS" : "CHECK"}`}
            </span>
          </div>
          <SoaCacheLineSvg soaLayout={dispatchPlan.soaLayout} isEn={isEn} />
        </div>
      </div>

      {/* 4. WGSL 듀얼팁 컴퓨트 셰이더 접기(<details>) + 정직성 안내 */}
      <details data-testid="wgsl-shader-details" className="rounded-xl border border-line bg-raised p-4">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-xs font-semibold text-fg [word-break:keep-all]">
          <span className="inline-flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("WGSL 듀얼팁 · 더티픽업 컴퓨트 셰이더 펼치기", "Expand WGSL Dual-Tip & Dirty Pickup Compute Shader")}
          </span>
          <span data-testid="wgsl-static-badge" className="font-mono text-[11px] text-good tabular-nums">
            {`Static ${wgslValidation.valid ? "PASS" : "FAIL"} · Uniform ${wgslValidation.uniformStructBytes}B · Fork ${wgslValidation.forkStructBytes}B`}
          </span>
        </summary>
        <div className="mt-3 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-fg-2 tabular-nums">
              {`entry: ${wgslValidation.entryPoint} · @workgroup_size(${wgslValidation.workgroupSize.join(", ")}) · bindings: ${wgslValidation.bindingCount}`}
            </span>
            <button type="button" data-testid="copy-ultra-wgsl-btn" onClick={() => { void handleCopy("wgsl"); }} disabled={copyState.status === "pending"} className={BTN_OUTLINE}>
              {copyState.status === "copied" && copyState.kind === "wgsl" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
              {copyState.status === "copied" && copyState.kind === "wgsl" ? pick("WGSL 복사됨", "WGSL Copied") : pick("WGSL 복사", "Copy WGSL")}
            </button>
          </div>
          <pre data-testid="wgsl-shader-code" className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2">
            {wgslSource}
          </pre>
        </div>
      </details>

      <p data-testid="ultra-honesty-notice" className="text-[11px] text-fg-3 [word-break:keep-all]">
        {isEn ? dispatchPlan.honestyNoteEn : dispatchPlan.honestyNoteKo}
      </p>
    </section>
  );
}
