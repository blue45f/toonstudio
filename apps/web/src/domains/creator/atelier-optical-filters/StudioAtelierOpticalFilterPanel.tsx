/**
 * Wave 62A — AtelierFilter 프로 광학 필터 · 톤 그레이딩 · 전/후 스플릿 커튼 스튜디오 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건, 바이올렛 휴 270~320° 0%)
 * - 6대 프로 광학·웹툰 필터 프리셋 선택 + 비파괴 필터 스택 토글/순서 변경
 * - 실시간 전·후 스플릿 커튼(0~100% 슬라이더 & 순수 시맨틱 SVG 광학 비교 뷰포트)
 * - `@compute @workgroup_size(8, 8, 1)` WGSL 컴퓨트 셰이더 접기(`<details>`) + JSON 복사
 */

import {
  Aperture, ArrowDown, ArrowUp, Check, Code2, Contrast, Copy,
  Eye, Focus, Layers, RotateCcw, ShieldCheck, SlidersHorizontal,
  SplitSquareHorizontal, Sun,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { Switch } from "@/shared/components/ui/switch";

import {
  APERTURE_BLADE_OPTIONS, ATELIER_FILTER_PRESETS, FILTER_GRID_COLS, FILTER_GRID_ROWS,
  LUT_LATTICE_OPTIONS, SCREENTONE_ANGLE_OPTIONS, createDefaultFilterStack,
  evaluateOpticalFilterPipeline, exportAtelierFilterChainJson, getAtelierFilterPreset,
  type ApertureBladeCount, type AtelierFilterId, type AtelierFilterStackItem,
  type AtelierOpticalFilterEvaluation, type LutLatticeSize, type ScreentoneAngleDeg,
} from "./atelier-optical-filter-engine";

export interface StudioAtelierOpticalFilterPanelProps {
  readonly initialPresetId?: AtelierFilterId;
  readonly initialSplitCurtainPercent?: number;
  readonly initialApertureBlades?: ApertureBladeCount;
  readonly initialScreenAngleDeg?: ScreentoneAngleDeg;
  readonly initialLutSize?: LutLatticeSize;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPipelineChange?: (evaluation: AtelierOpticalFilterEvaluation) => void;
  readonly onExportJson?: (json: string, evaluation: AtelierOpticalFilterEvaluation) => void | Promise<void>;
}

// 탈-바이올렛 OKLCH 시맨틱 SVG 잉크(58°·202°·156°·78°·34° — 270~320° 완전 배제)
const INK_AMBER = "oklch(0.78 0.16 58)";
const INK_CYAN = "oklch(0.74 0.14 202)";
const INK_EMERALD = "oklch(0.72 0.16 156)";
const INK_GOLD = "oklch(0.86 0.14 78)";
const INK_CORAL = "oklch(0.70 0.17 34)";

const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-45 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;
const BTN_ICON = `${BTN_BASE} min-w-11 border border-line bg-canvas px-2 text-fg hover:border-line-strong hover:bg-raised`;

function buildPolygonPoints(cx: number, cy: number, radius: number, blades: ApertureBladeCount): string {
  return Array.from({ length: blades }, (_, idx) => {
    const angle = (idx / blades) * Math.PI * 2 - Math.PI / 2;
    const x = Math.round((cx + Math.cos(angle) * radius) * 10) / 10;
    const y = Math.round((cy + Math.sin(angle) * radius) * 10) / 10;
    return `${x},${y}`;
  }).join(" ");
}

function RangeSlider(props: {
  readonly id: string; readonly testId: string; readonly label: string; readonly valueText: string;
  readonly min: number; readonly max: number; readonly step: number; readonly value: number;
  readonly onChange: (next: number) => void;
}): ReactElement {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <label htmlFor={props.id} className="font-semibold text-fg-2 [word-break:keep-all]">{props.label}</label>
        <span className="font-mono font-bold text-fg tabular-nums">{props.valueText}</span>
      </div>
      <input
        id={props.id} data-testid={props.testId} type="range"
        min={props.min} max={props.max} step={props.step} value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className={`h-11 min-h-11 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

function AtelierSplitCurtainSvg(props: {
  readonly evaluation: AtelierOpticalFilterEvaluation;
  readonly isEn: boolean;
}): ReactElement {
  const { evaluation, isEn } = props;
  const { config, cells, comparison, splitCurtain, enabledFilterIds } = evaluation;
  const clipPrefix = useId();
  const legacyClipId = `${clipPrefix}-legacy`;
  const atelierClipId = `${clipPrefix}-atelier`;

  const bx = 20; const by = 42; const bw = 440; const bh = 224;
  const cw = bw / FILTER_GRID_COLS; const ch = bh / FILTER_GRID_ROWS;
  const splitX = Math.round((bx + (splitCurtain.percent / 100) * bw) * 10) / 10;
  const faceCx = bx + bw * 0.5; const faceCy = by + bh * 0.52;
  const safeR = Math.round(config.centerSafeRadius * bh * 0.52);
  const lanternAX = bx + bw * 0.18; const lanternAY = by + bh * 0.24;
  const lanternBX = bx + bw * 0.83; const lanternBY = by + bh * 0.28;
  const bokehR = Math.round(11 + (config.apertureRadiusPx / 24) * 15);
  const hasBokeh = enabledFilterIds.includes("optical-aperture-bokeh");
  const hasHalation = enabledFilterIds.includes("paper-aware-halation-glow");
  const hasScreentone = enabledFilterIds.includes("moire-free-halftone-screentone");
  const hasPrism = enabledFilterIds.includes("chromatic-prism-dispersion");
  const hasAcutance = enabledFilterIds.includes("ink-edge-acutance-unsharp");

  const bokehPolyA = buildPolygonPoints(lanternAX, lanternAY, bokehR, config.apertureBlades);
  const bokehPolyB = buildPolygonPoints(lanternBX, lanternBY, bokehR * 0.9, config.apertureBlades);
  const toneAngleRad = (config.screenAngleDeg * Math.PI) / 180;
  const halftoneDots = Array.from({ length: 18 }, (_, i) => {
    const col = i % 6; const row = Math.floor(i / 6);
    const ox = (col - 2.5) * 14; const oy = (row - 1) * 14;
    const rx = ox * Math.cos(toneAngleRad) - oy * Math.sin(toneAngleRad);
    const ry = ox * Math.sin(toneAngleRad) + oy * Math.cos(toneAngleRad);
    return { idx: i, x: Math.round((bx + bw * 0.78 + rx) * 10) / 10, y: Math.round((by + bh * 0.72 + ry) * 10) / 10 };
  });

  return (
    <svg
      data-testid="atelier-filter-split-svg"
      data-preset={evaluation.activePreset.id}
      data-split-percent={splitCurtain.percent}
      data-aperture-blades={config.apertureBlades}
      data-screen-angle={config.screenAngleDeg}
      data-lut-size={config.lutSize}
      data-active-stages={enabledFilterIds.join(",")}
      viewBox="0 0 480 300" role="img"
      className="w-full rounded-xl border border-line-strong bg-canvas text-fg"
      aria-label={isEn
        ? `AtelierFilter before and after optical split comparison at ${splitCurtain.percent}%: legacy 8-bit gamma versus AtelierFilter 16-bit linear light (${comparison.highlightRetentionAtelierPercent}% highlight retention, ${comparison.moireInterferenceAtelierPercent}% Moire)`
        : `AtelierFilter 전후 광학 스플릿 커튼 비교 뷰포트(${splitCurtain.percent}%): 좌측 기존 8-bit 감마 대비 우측 AtelierFilter 16-bit 선형광(하이라이트 보존 ${comparison.highlightRetentionAtelierPercent}%, 390px 모아레 ${comparison.moireInterferenceAtelierPercent}%)`}
    >
      <defs>
        <clipPath id={legacyClipId}><rect x={bx} y={by} width={Math.max(0, splitX - bx)} height={bh} /></clipPath>
        <clipPath id={atelierClipId}><rect x={splitX} y={by} width={Math.max(0, bx + bw - splitX)} height={bh} /></clipPath>
      </defs>

      <rect x="8" y="8" width="464" height="284" rx="10" fill="none" stroke="currentColor" strokeOpacity={0.14} />
      <text x="20" y="25" fill="currentColor" fillOpacity={0.86} fontSize="10.5" fontWeight="700">
        {isEn ? "LEFT: LEGACY 8-BIT GAMMA" : "좌측: 기존 8-bit 감마 필터"}
      </text>
      <text x="460" y="25" textAnchor="end" fill={INK_CYAN} fontSize="10.5" fontWeight="700">
        {isEn ? `RIGHT: ATELIERFILTER 16-BIT LINEAR (${config.apertureBlades}-BLADE)` : `우측: AtelierFilter 16-bit 선형광 (${config.apertureBlades}날)`}
      </text>
      <text x="20" y="37" fill="currentColor" fillOpacity={0.62} fontSize="8.6">
        {isEn
          ? `HDR Highlight ${comparison.highlightRetentionLegacyPercent}% -> ${comparison.highlightRetentionAtelierPercent}% · 390px Moire ${comparison.moireInterferenceLegacyPercent}% -> ${comparison.moireInterferenceAtelierPercent}%`
          : `하이라이트 보존 ${comparison.highlightRetentionLegacyPercent}% → ${comparison.highlightRetentionAtelierPercent}% · 390px 모아레 ${comparison.moireInterferenceLegacyPercent}% → ${comparison.moireInterferenceAtelierPercent}%`}
      </text>

      {/* 좌측: 기존 8-bit 단순 감마 필터 */}
      <g clipPath={`url(#${legacyClipId})`} data-testid="split-legacy-layer">
        {cells.map((cell) => (
          <rect
            key={`l-${cell.col}-${cell.row}`}
            x={Math.round((bx + cell.col * cw) * 10) / 10} y={Math.round((by + cell.row * ch) * 10) / 10}
            width={Math.ceil(cw + 0.5)} height={Math.ceil(ch + 0.5)}
            fill={cell.legacyOklch} fillOpacity={0.9}
          />
        ))}
        {/* 8-bit 감마 클리핑 탁한 원형 블러 및 주기적 모아레 간섭 줄무늬 */}
        <circle cx={lanternAX} cy={lanternAY} r={bokehR} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeOpacity={0.32} strokeDasharray="2 2" />
        <circle cx={lanternBX} cy={lanternBY} r={bokehR * 0.9} fill="currentColor" fillOpacity={0.18} stroke="currentColor" strokeOpacity={0.32} strokeDasharray="2 2" />
        {hasScreentone && Array.from({ length: 8 }, (_, idx) => (
          <line key={`m-${idx}`} x1={bx + 12 + idx * 24} y1={by + 115} x2={bx + 28 + idx * 24} y2={by + bh - 8} stroke={INK_CORAL} strokeOpacity={0.38} strokeWidth="2.5" />
        ))}
        <ellipse cx={faceCx} cy={faceCy} rx={44} ry={58} fill="none" stroke="currentColor" strokeOpacity={0.35} strokeWidth="2.4" strokeDasharray="3 3" />
      </g>

      {/* 우측: AtelierFilter 16-bit 선형광 광학 엔진 */}
      <g clipPath={`url(#${atelierClipId})`} data-testid="split-atelier-layer">
        {cells.map((cell) => (
          <rect
            key={`a-${cell.col}-${cell.row}`}
            x={Math.round((bx + cell.col * cw) * 10) / 10} y={Math.round((by + cell.row * ch) * 10) / 10}
            width={Math.ceil(cw + 0.5)} height={Math.ceil(ch + 0.5)}
            fill={cell.atelierOklch} fillOpacity={0.95}
          />
        ))}
        {hasBokeh && (
          <g data-testid="svg-bokeh-polygons">
            <polygon points={bokehPolyA} fill={INK_GOLD} fillOpacity={0.28} stroke={INK_GOLD} strokeWidth={1.2 + config.sphericalAberration * 1.4} />
            <polygon points={bokehPolyB} fill={INK_AMBER} fillOpacity={0.26} stroke={INK_GOLD} strokeWidth={1.2 + config.sphericalAberration * 1.4} />
          </g>
        )}
        {hasHalation && (
          <g data-testid="svg-halation-rings">
            <circle cx={lanternAX} cy={lanternAY} r={bokehR + 10 + config.paperReliefStrength * 8} fill="none" stroke={INK_AMBER} strokeOpacity={0.56} strokeWidth="1.6" strokeDasharray="5 3" />
            <circle cx={lanternBX} cy={lanternBY} r={bokehR + 9 + config.paperReliefStrength * 8} fill="none" stroke={INK_AMBER} strokeOpacity={0.56} strokeWidth="1.6" strokeDasharray="5 3" />
          </g>
        )}
        {hasScreentone && (
          <g data-testid="svg-blue-noise-screentone">
            {halftoneDots.map((dot) => (
              <circle key={`d-${dot.idx}`} cx={dot.x} cy={dot.y} r={2.2} fill={INK_EMERALD} fillOpacity={0.82} />
            ))}
          </g>
        )}
        {hasPrism && (
          <g data-testid="svg-prism-dispersion">
            <circle cx={faceCx} cy={faceCy} r={safeR} fill="none" stroke={INK_EMERALD} strokeOpacity={0.75} strokeWidth="1.3" strokeDasharray="4 3" />
            <line x1={bx + bw - 34} y1={by + 20} x2={bx + bw - 14} y2={by + 12} stroke={INK_CORAL} strokeWidth="2" />
            <line x1={bx + bw - 34} y1={by + 24} x2={bx + bw - 12} y2={by + 18} stroke={INK_CYAN} strokeWidth="2" />
          </g>
        )}
        <ellipse cx={faceCx} cy={faceCy} rx={44} ry={58} fill="none" stroke={hasAcutance ? INK_GOLD : INK_CYAN} strokeOpacity={0.85} strokeWidth={hasAcutance ? "2.0" : "1.4"} />
      </g>

      {/* 외곽 프레임 & 스플릿 커튼 분할선 */}
      <rect x={bx} y={by} width={bw} height={bh} rx="6" fill="none" stroke="currentColor" strokeOpacity={0.28} />
      <line data-testid="split-curtain-divider" x1={splitX} y1={by} x2={splitX} y2={by + bh} stroke={INK_GOLD} strokeWidth="2" />
      <rect x={Math.min(bx + bw - 48, Math.max(bx + 2, splitX - 23))} y={by + bh / 2 - 11} width="46" height="22" rx="11" fill={INK_GOLD} />
      <text x={Math.min(bx + bw - 25, Math.max(bx + 25, splitX))} y={by + bh / 2 + 3.5} textAnchor="middle" fill="currentColor" className="text-on-accent" fontSize="9.5" fontWeight="800">
        {`${splitCurtain.percent}%`}
      </text>

      <g fontSize="8.5" fill="currentColor" fillOpacity={0.8}>
        <circle cx="26" cy="281" r="3.5" fill={INK_GOLD} />
        <text x="34" y="284">{isEn ? `${config.apertureBlades}-Blade Bokeh` : `${config.apertureBlades}날 보케 링`}</text>
        <circle cx="136" cy="281" r="3.5" fill={INK_AMBER} />
        <text x="144" y="284">{isEn ? "Paper Halation" : "종이 요철 할레이션"}</text>
        <circle cx="252" cy="281" r="3.5" fill={INK_EMERALD} />
        <text x="260" y="284">{isEn ? `${config.screenAngleDeg}° 0% Moire` : `${config.screenAngleDeg}° 무모아레·얼굴 보호`}</text>
        <circle cx="386" cy="281" r="3.5" fill={INK_CYAN} />
        <text x="394" y="284">{isEn ? `${config.lutSize}³ 3D LUT` : `${config.lutSize}³ 테트라 LUT`}</text>
      </g>
    </svg>
  );
}

/** AtelierFilter 프로 광학 필터 · 톤 그레이딩 · 전/후 스플릿 커튼 스튜디오 패널. */
export function StudioAtelierOpticalFilterPanel(props: StudioAtelierOpticalFilterPanelProps): ReactElement {
  const initialPresetId: AtelierFilterId = props.initialPresetId ?? "optical-aperture-bokeh";
  const initialSplit = props.initialSplitCurtainPercent ?? 50;
  const initialBlades: ApertureBladeCount = props.initialApertureBlades ?? 8;
  const initialScreenAngle: ScreentoneAngleDeg = props.initialScreenAngleDeg ?? 45;
  const initialLutSize: LutLatticeSize = props.initialLutSize ?? 33;
  const isEn = (props.locale ?? "ko") === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const headingId = useId();
  const fieldPrefix = useId();

  const [presetId, setPresetId] = useState<AtelierFilterId>(initialPresetId);
  const [stack, setStack] = useState<readonly AtelierFilterStackItem[]>(() => createDefaultFilterStack(initialPresetId));
  const [intensity, setIntensity] = useState<number>(() => getAtelierFilterPreset(initialPresetId).defaultIntensity);
  const [apertureBlades, setApertureBlades] = useState<ApertureBladeCount>(initialBlades);
  const [sphericalAberration, setSphericalAberration] = useState<number>(0.65);
  const [focusDepth, setFocusDepth] = useState<number>(0.25);
  const [paperReliefStrength, setPaperReliefStrength] = useState<number>(0.72);
  const [screenAngleDeg, setScreenAngleDeg] = useState<ScreentoneAngleDeg>(initialScreenAngle);
  const [blueNoiseJitter, setBlueNoiseJitter] = useState<number>(0.85);
  const [lutSize, setLutSize] = useState<LutLatticeSize>(initialLutSize);
  const [toneAngleDeg, setToneAngleDeg] = useState<number>(14);
  const [skinToneProtection, setSkinToneProtection] = useState<number>(0.9);
  const [centerSafeRadius, setCenterSafeRadius] = useState<number>(0.42);
  const [splitCurtainPercent, setSplitCurtainPercent] = useState<number>(initialSplit);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [copiedTarget, setCopiedTarget] = useState<"none" | "json" | "wgsl">("none");
  const [copyPending, setCopyPending] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [manualCopy, setManualCopy] = useState<{ readonly target: "json" | "wgsl"; readonly text: string } | null>(null);
  const copyInFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const buildEval = (overrides?: Partial<{
    presetId: AtelierFilterId; stack: readonly AtelierFilterStackItem[]; intensity: number;
    apertureBlades: ApertureBladeCount; sphericalAberration: number; focusDepth: number;
    paperReliefStrength: number; screenAngleDeg: ScreentoneAngleDeg; blueNoiseJitter: number;
    lutSize: LutLatticeSize; toneAngleDeg: number; skinToneProtection: number; centerSafeRadius: number; splitCurtainPercent: number;
  }>): AtelierOpticalFilterEvaluation => evaluateOpticalFilterPipeline({
    presetId: overrides?.presetId ?? presetId,
    stack: overrides?.stack ?? stack,
    intensity: overrides?.intensity ?? intensity,
    apertureBlades: overrides?.apertureBlades ?? apertureBlades,
    sphericalAberration: overrides?.sphericalAberration ?? sphericalAberration,
    focusDepth: overrides?.focusDepth ?? focusDepth,
    paperReliefStrength: overrides?.paperReliefStrength ?? paperReliefStrength,
    screenAngleDeg: overrides?.screenAngleDeg ?? screenAngleDeg,
    blueNoiseJitter: overrides?.blueNoiseJitter ?? blueNoiseJitter,
    lutSize: overrides?.lutSize ?? lutSize,
    toneAngleDeg: overrides?.toneAngleDeg ?? toneAngleDeg,
    skinToneProtection: overrides?.skinToneProtection ?? skinToneProtection,
    centerSafeRadius: overrides?.centerSafeRadius ?? centerSafeRadius,
    splitCurtainPercent: overrides?.splitCurtainPercent ?? splitCurtainPercent,
  });

  const evaluation = useMemo(() => evaluateOpticalFilterPipeline({
    presetId, stack, intensity, apertureBlades, sphericalAberration, focusDepth,
    paperReliefStrength, screenAngleDeg, blueNoiseJitter, lutSize, toneAngleDeg,
    skinToneProtection, centerSafeRadius, splitCurtainPercent,
  }), [
    presetId, stack, intensity, apertureBlades, sphericalAberration, focusDepth,
    paperReliefStrength, screenAngleDeg, blueNoiseJitter, lutSize, toneAngleDeg,
    skinToneProtection, centerSafeRadius, splitCurtainPercent,
  ]);
  const currentEvaluation = useRef(evaluation);
  useEffect(() => { currentEvaluation.current = evaluation; }, [evaluation]);

  const notifyPipeline = (nextEval: AtelierOpticalFilterEvaluation, koMsg: string, enMsg: string): void => {
    setCopiedTarget("none"); setCopyError(""); setManualCopy(null);
    setStatusMessage(pick(koMsg, enMsg));
    props.onPipelineChange?.(nextEval);
  };

  const handleSelectPreset = (nextId: AtelierFilterId): void => {
    const preset = getAtelierFilterPreset(nextId);
    const nextStack = createDefaultFilterStack(nextId);
    setPresetId(nextId);
    setStack(nextStack);
    setIntensity(preset.defaultIntensity);
    notifyPipeline(
      buildEval({ presetId: nextId, stack: nextStack, intensity: preset.defaultIntensity }),
      `${preset.titleKo} 프리셋과 추천 비파괴 필터 스택을 적용했습니다.`,
      `Applied ${preset.titleEn} preset and its non-destructive filter stack.`,
    );
  };

  const handleToggleStage = (targetId: AtelierFilterId, enabled: boolean): void => {
    const nextStack = stack.map((item) => (item.id === targetId ? { ...item, enabled } : item));
    const preset = getAtelierFilterPreset(targetId);
    setStack(nextStack);
    notifyPipeline(
      buildEval({ stack: nextStack }),
      `${preset.titleKo} 단계를 ${enabled ? "활성화" : "비활성화"}했습니다.`,
      `${enabled ? "Enabled" : "Disabled"} ${preset.titleEn} stage.`,
    );
  };

  const handleMoveStage = (index: number, delta: -1 | 1): void => {
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= stack.length) return;
    const nextStack = [...stack];
    const [moved] = nextStack.splice(index, 1);
    nextStack.splice(targetIndex, 0, moved);
    const preset = getAtelierFilterPreset(moved.id);
    setStack(nextStack);
    notifyPipeline(
      buildEval({ stack: nextStack }),
      `${preset.titleKo} 실행 순서를 ${targetIndex + 1}번으로 이동했습니다.`,
      `Moved ${preset.titleEn} to execution slot ${targetIndex + 1}.`,
    );
  };

  const handleReset = (): void => {
    const defaultStack = createDefaultFilterStack(initialPresetId);
    const defaultIntensity = getAtelierFilterPreset(initialPresetId).defaultIntensity;
    setPresetId(initialPresetId); setStack(defaultStack); setIntensity(defaultIntensity);
    setApertureBlades(initialBlades); setSphericalAberration(0.65); setFocusDepth(0.25);
    setPaperReliefStrength(0.72); setScreenAngleDeg(initialScreenAngle); setBlueNoiseJitter(0.85);
    setLutSize(initialLutSize); setToneAngleDeg(14); setSkinToneProtection(0.9); setCenterSafeRadius(0.42);
    setSplitCurtainPercent(initialSplit); setCopiedTarget("none");
    notifyPipeline(
      buildEval({
        presetId: initialPresetId, stack: defaultStack, intensity: defaultIntensity,
        apertureBlades: initialBlades, sphericalAberration: 0.65, focusDepth: 0.25,
        paperReliefStrength: 0.72, screenAngleDeg: initialScreenAngle, blueNoiseJitter: 0.85,
        lutSize: initialLutSize, toneAngleDeg: 14, skinToneProtection: 0.9, centerSafeRadius: 0.42, splitCurtainPercent: initialSplit,
      }),
      "AtelierFilter 기본 광학 설정과 비파괴 스택을 복원했습니다.",
      "Restored default AtelierFilter optical settings and non-destructive stack.",
    );
  };

  const handleCopyPayload = async (target: "json" | "wgsl"): Promise<void> => {
    if (copyInFlight.current) return;
    copyInFlight.current = true;
    setCopyPending(true); setCopiedTarget("none"); setCopyError(""); setManualCopy(null);
    const snapshot = evaluation;
    const text = target === "json" ? exportAtelierFilterChainJson(snapshot) : snapshot.wgslShader.source;
    try {
      // 사용자 이벤트 안에서 먼저 복사를 시작하고 콜백의 ACK는 별도로 기다린다.
      let clipboardResult: Promise<boolean>;
      try {
        const writeText = globalThis.navigator?.clipboard?.writeText;
        clipboardResult = typeof writeText === "function"
          ? Promise.resolve(writeText.call(globalThis.navigator.clipboard, text)).then(() => true, () => false)
          : Promise.resolve(false);
      } catch { clipboardResult = Promise.resolve(false); }
      const exportResult = target === "json" && props.onExportJson
        ? Promise.resolve().then(() => props.onExportJson?.(text, snapshot)).then(() => true, () => false)
        : Promise.resolve(true);
      const [copied, delivered] = await Promise.all([clipboardResult, exportResult]);
      if (!mounted.current) return;
      if (currentEvaluation.current !== snapshot) {
        setStatusMessage(pick("이전 구성의 복사 요청이 끝났습니다. 현재 구성을 다시 복사해 주세요.", "The previous configuration request finished. Copy the current configuration again."));
        return;
      }
      setCopiedTarget(copied ? target : "none");
      if (!copied) setManualCopy({ target, text });
      const failures = [
        ...(!copied ? [pick("복사 실패: 아래 요청 당시 소스를 직접 선택하거나 다시 시도해 주세요.", "Copy failed: select the requested source below or retry.")] : []),
        ...(!delivered ? [pick("JSON 전달 실패: 내보내기 콜백을 다시 시도해 주세요.", "JSON delivery failed: retry the export callback.")] : []),
      ];
      setCopyError(failures.join(" "));
      setStatusMessage(copied
        ? pick(`${target.toUpperCase()} 소스를 클립보드에 복사했습니다.`, `Copied ${target.toUpperCase()} source to the clipboard.`)
        : pick(`${target.toUpperCase()} 복사를 완료하지 못했습니다.`, `${target.toUpperCase()} copy did not complete.`));
    } finally {
      copyInFlight.current = false;
      if (mounted.current) setCopyPending(false);
    }
  };

  const { comparison, splitCurtain, wgslShader } = evaluation;

  return (
    <section
      aria-labelledby={headingId}
      data-testid="studio-atelier-optical-filter-panel"
      data-copied-target={copiedTarget}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${props.className ?? ""}`}
    >
      {/* 헤더 */}
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Aperture className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 id={headingId} className="text-sm font-bold tracking-tight text-fg [word-break:keep-all]">
              {pick("AtelierFilter · 16-bit 선형광 광학 필터 & WGSL 스튜디오", "AtelierFilter · 16-bit Linear-Light Optical Filter & WGSL Studio")}
            </h2>
            <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] font-semibold text-fg-2">
              PrismLight · AtelierInk
            </span>
          </div>
          <p className="text-xs text-fg-2 [word-break:keep-all]">
            {pick(evaluation.honestScopeKo, evaluation.honestScopeEn)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="copy-filter-json-btn" onClick={() => void handleCopyPayload("json")} disabled={copyPending} aria-busy={copyPending} className={BTN_SOLID}>
            {copiedTarget === "json" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            <span>{pick("필터 체인 JSON 복사", "Copy Chain JSON")}</span>
          </button>
          <button type="button" data-testid="reset-optical-filter-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{pick("초기값 복원", "Reset")}</span>
          </button>
        </div>
      </header>

      {/* 6대 프로 광학·웹툰 필터 프리셋 */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={pick("6대 광학 필터 프리셋", "Six optical filter presets")}>
        {ATELIER_FILTER_PRESETS.map((preset) => {
          const active = preset.id === presetId;
          return (
            <button
              key={preset.id} type="button" data-testid={`filter-preset-${preset.id}`} aria-pressed={active}
              onClick={() => handleSelectPreset(preset.id)}
              className={`flex min-h-11 cursor-pointer flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none [word-break:keep-all] ${FOCUS_RING} ${active ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"}`}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <span className="text-xs font-bold">{pick(preset.titleKo, preset.titleEn)}</span>
                <span className="rounded bg-canvas px-1.5 py-0.5 font-mono text-[10px] font-semibold text-fg-2">{preset.badge}</span>
              </div>
              <span className="text-[11px] leading-snug text-fg-2">{pick(preset.summaryKo, preset.summaryEn)}</span>
            </button>
          );
        })}
      </div>

      {/* 실시간 전·후 스플릿 커튼 뷰포트 + 정량 비교 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className="space-y-3 rounded-xl border border-line bg-card p-3 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
              <SplitSquareHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("실시간 전·후 스플릿 커튼 광학 비교", "Interactive Before / After Optical Split Curtain")}
            </span>
            <span data-testid="split-curtain-readout" className="font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
              {pick(`기존 8-bit ${splitCurtain.percent}% · AtelierFilter ${splitCurtain.revealedAtelierAreaPercent}%`, `Legacy ${splitCurtain.percent}% · AtelierFilter ${splitCurtain.revealedAtelierAreaPercent}%`)}
            </span>
          </div>

          <AtelierSplitCurtainSvg evaluation={evaluation} isEn={isEn} />

          <div className="space-y-2 border-t border-line pt-2.5">
            <RangeSlider
              id={`${fieldPrefix}-split`} testId="split-curtain-slider"
              label={pick("전·후 스플릿 커튼 위치 (0% 전체 AtelierFilter ↔ 100% 기존 8-bit)", "Split Curtain Position (0% Full AtelierFilter ↔ 100% Legacy 8-bit)")}
              valueText={`${splitCurtainPercent}%`} min={0} max={100} step={1} value={splitCurtainPercent}
              onChange={(v) => {
                setSplitCurtainPercent(v);
                notifyPipeline(buildEval({ splitCurtainPercent: v }), `스플릿 커튼을 ${v}%로 이동했습니다.`, `Moved split curtain to ${v}%.`);
              }}
            />
            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("커튼 빠른 이동", "Quick curtain presets")}>
              {[
                { val: 0, ko: "0% AtelierFilter 전체", en: "0% Full AtelierFilter" },
                { val: 50, ko: "50% 반반 비교", en: "50% Half Split" },
                { val: 100, ko: "100% 기존 8-bit", en: "100% Legacy 8-bit" },
              ].map((opt) => (
                <button
                  key={opt.val} type="button" data-testid={`split-quick-${opt.val}`}
                  aria-pressed={splitCurtainPercent === opt.val}
                  onClick={() => {
                    setSplitCurtainPercent(opt.val);
                    notifyPipeline(buildEval({ splitCurtainPercent: opt.val }), `스플릿 커튼을 ${opt.val}%로 맞췄습니다.`, `Set split curtain to ${opt.val}%.`);
                  }}
                  className={`${splitCurtainPercent === opt.val ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}
                >
                  {pick(opt.ko, opt.en)}
                </button>
              ))}
            </div>
          </div>

          {/* 4대 정량 비교 지표 (중첩 카드 금지: 평면 구분선 스트립) */}
          <div className="grid grid-cols-2 gap-2 border-t border-line pt-2.5 sm:grid-cols-4" data-testid="comparison-metrics-strip">
            <div className="rounded-lg bg-canvas px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-fg-3"><Sun className="h-3 w-3 text-accent" aria-hidden="true" />{pick("16-bit 하이라이트", "16-bit Highlights")}</div>
              <div className="mt-0.5 font-mono text-xs font-bold text-good tabular-nums">{`${comparison.highlightRetentionLegacyPercent}% → ${comparison.highlightRetentionAtelierPercent}%`}</div>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-fg-3"><Contrast className="h-3 w-3 text-cool" aria-hidden="true" />{pick("390px 모바일 모아레", "390px Moiré")}</div>
              <div className="mt-0.5 font-mono text-xs font-bold text-good tabular-nums">{`${comparison.moireInterferenceLegacyPercent}% → ${comparison.moireInterferenceAtelierPercent}%`}</div>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-fg-3"><Focus className="h-3 w-3 text-accent" aria-hidden="true" />{pick("인물 중앙 선명도", "Face Center Lock")}</div>
              <div className="mt-0.5 font-mono text-xs font-bold text-fg tabular-nums">{`${comparison.faceCenterSharpnessPercent}% · ${comparison.peripheryDispersionPx}px`}</div>
            </div>
            <div className="rounded-lg bg-canvas px-2.5 py-2">
              <div className="flex items-center gap-1 text-[10px] font-semibold text-fg-3"><ShieldCheck className="h-3 w-3 text-good" aria-hidden="true" />{pick("Halo · 피부톤 ΔH", "Halo · Skin ΔH")}</div>
              <div className="mt-0.5 font-mono text-xs font-bold text-fg tabular-nums">{`Halo ${comparison.acutanceHaloOvershootAtelier} · ${comparison.skinToneHueDriftDeg}°`}</div>
            </div>
          </div>
        </div>

        {/* 우측: 비파괴 필터 스택 토글/순서 + 핵심 광학 파라미터 */}
        <div className="space-y-3 lg:col-span-5">
          <div className="space-y-2 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("비파괴 필터 스택 · 실행 순서", "Non-Destructive Stack & Order")}
              </span>
              <span data-testid="active-stage-count" className="font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
                {pick(`${wgslShader.activeStageCount}/6 활성`, `${wgslShader.activeStageCount}/6 active`)}
              </span>
            </div>
            <ol className="divide-y divide-line" data-testid="non-destructive-filter-stack">
              {stack.map((item, idx) => {
                const preset = getAtelierFilterPreset(item.id);
                const label = pick(preset.titleKo, preset.titleEn);
                return (
                  <li key={item.id} data-testid={`stack-row-${item.id}`} data-stack-index={idx} className="flex items-center justify-between gap-2 py-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-fg-3 tabular-nums">{String(idx + 1).padStart(2, "0")}</span>
                      <Switch
                        checked={item.enabled}
                        onCheckedChange={(checked) => handleToggleStage(item.id, checked)}
                        data-testid={`stack-toggle-${item.id}`}
                        aria-label={pick(`${preset.titleKo} 필터 토글`, `Toggle ${preset.titleEn}`)}
                      />
                      <span className={`truncate text-xs font-semibold ${item.enabled ? "text-fg" : "text-fg-3"}`}>{label}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button" data-testid={`stack-up-${item.id}`} disabled={idx === 0}
                        title={idx === 0 ? pick("이미 최상단 실행 순서입니다", "Already at first stage") : pick("위로 이동", "Move up")}
                        aria-label={pick(`${preset.titleKo} 위로 이동`, `Move ${preset.titleEn} up`)}
                        onClick={() => handleMoveStage(idx, -1)} className={BTN_ICON}
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button" data-testid={`stack-down-${item.id}`} disabled={idx === stack.length - 1}
                        title={idx === stack.length - 1 ? pick("이미 최하단 실행 순서입니다", "Already at last stage") : pick("아래로 이동", "Move down")}
                        aria-label={pick(`${preset.titleKo} 아래로 이동`, `Move ${preset.titleEn} down`)}
                        onClick={() => handleMoveStage(idx, 1)} className={BTN_ICON}
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="space-y-2.5 rounded-xl border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2 text-xs font-bold text-fg">
              <span className="inline-flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                {pick("광학 · 조리개 · 깊이 · 스크린톤 · 톤 각도", "Optical · Aperture · Depth · Screentone · Tone")}
              </span>
              <span className="font-mono text-[11px] text-fg-3 tabular-nums">{`${comparison.lutVerticesCount.toLocaleString("en-US")} pts`}</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={pick("조리개 날 수", "Aperture blade count")}>
              {APERTURE_BLADE_OPTIONS.map((blades) => (
                <button
                  key={blades} type="button" data-testid={`aperture-blades-${blades}`} aria-pressed={apertureBlades === blades}
                  onClick={() => {
                    setApertureBlades(blades);
                    notifyPipeline(buildEval({ apertureBlades: blades }), `조리개를 ${blades}날 다각형으로 전환했습니다.`, `Switched aperture to ${blades} blades.`);
                  }}
                  className={`${apertureBlades === blades ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}
                >
                  {isEn ? `${blades}-Blade` : `${blades}날 조리개`}
                </button>
              ))}
              {SCREENTONE_ANGLE_OPTIONS.map((deg) => (
                <button
                  key={deg} type="button" data-testid={`screen-angle-${deg}`} aria-pressed={screenAngleDeg === deg}
                  onClick={() => {
                    setScreenAngleDeg(deg);
                    notifyPipeline(buildEval({ screenAngleDeg: deg }), `스크린톤 로제트 각도를 ${deg}°로 맞췄습니다.`, `Set screentone rosette angle to ${deg}°.`);
                  }}
                  className={`${screenAngleDeg === deg ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}
                >
                  {`${deg}°`}
                </button>
              ))}
              {LUT_LATTICE_OPTIONS.map((sz) => (
                <button
                  key={sz} type="button" data-testid={`lut-size-${sz}`} aria-pressed={lutSize === sz}
                  onClick={() => {
                    setLutSize(sz);
                    notifyPipeline(buildEval({ lutSize: sz }), `3D 테트라헤드랄 LUT를 ${sz}³ 격자로 변경했습니다.`, `Switched 3D tetrahedral LUT to ${sz}³ lattice.`);
                  }}
                  className={`${lutSize === sz ? BTN_ACTIVE : BTN_OUTLINE} tabular-nums`}
                >
                  {`${sz}³ LUT`}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2">
              <RangeSlider id={`${fieldPrefix}-intensity`} testId="slider-filter-intensity" label={pick("필터 종합 강도", "Master Intensity")} valueText={`${Math.round(intensity * 100)}%`} min={0} max={1} step={0.02} value={intensity} onChange={(v) => { setIntensity(v); notifyPipeline(buildEval({ intensity: v }), `필터 강도를 ${Math.round(v * 100)}%로 조정했습니다.`, `Set filter intensity to ${Math.round(v * 100)}%.`); }} />
              <RangeSlider id={`${fieldPrefix}-depth`} testId="slider-focus-depth" label={pick("깊이 포커스 플레인", "Focus Depth Plane")} valueText={focusDepth.toFixed(2)} min={0} max={1} step={0.05} value={focusDepth} onChange={(v) => { setFocusDepth(v); notifyPipeline(buildEval({ focusDepth: v }), `초점 깊이를 ${v.toFixed(2)}로 조정했습니다.`, `Set focus depth to ${v.toFixed(2)}.`); }} />
              <RangeSlider id={`${fieldPrefix}-aberration`} testId="slider-spherical-aberration" label={pick("조리개 구면수차 링", "Spherical Aberration")} valueText={`${Math.round(sphericalAberration * 100)}%`} min={0} max={1} step={0.05} value={sphericalAberration} onChange={(v) => { setSphericalAberration(v); notifyPipeline(buildEval({ sphericalAberration: v }), `구면수차 링을 ${Math.round(v * 100)}%로 조정했습니다.`, `Set spherical aberration to ${Math.round(v * 100)}%.`); }} />
              <RangeSlider id={`${fieldPrefix}-tone`} testId="slider-tone-angle" label={pick("OKLCH 톤 각도", "OKLCH Tone Angle")} valueText={`${toneAngleDeg > 0 ? "+" : ""}${toneAngleDeg}°`} min={-45} max={45} step={1} value={toneAngleDeg} onChange={(v) => { setToneAngleDeg(v); notifyPipeline(buildEval({ toneAngleDeg: v }), `OKLCH 톤 각도를 ${v}°로 변경했습니다.`, `Set OKLCH tone angle to ${v}°.`); }} />
              <RangeSlider id={`${fieldPrefix}-paper`} testId="slider-paper-relief" label={pick("종이 요철 할레이션", "Paper Relief Glow")} valueText={`${Math.round(paperReliefStrength * 100)}%`} min={0} max={1} step={0.05} value={paperReliefStrength} onChange={(v) => { setPaperReliefStrength(v); notifyPipeline(buildEval({ paperReliefStrength: v }), `종이 요철 감응을 ${Math.round(v * 100)}%로 설정했습니다.`, `Set paper relief sensitivity to ${Math.round(v * 100)}%.`); }} />
              <RangeSlider id={`${fieldPrefix}-noise`} testId="slider-blue-noise" label={pick("블루노이즈 무모아레", "Blue-Noise Anti-Moiré")} valueText={`${Math.round(blueNoiseJitter * 100)}%`} min={0} max={1} step={0.05} value={blueNoiseJitter} onChange={(v) => { setBlueNoiseJitter(v); notifyPipeline(buildEval({ blueNoiseJitter: v }), `블루노이즈 디더링을 ${Math.round(v * 100)}%로 설정했습니다.`, `Set blue-noise jitter to ${Math.round(v * 100)}%.`); }} />
              <RangeSlider id={`${fieldPrefix}-skin`} testId="slider-skin-protection" label={pick("피부톤 보호 벡터스코프", "Skin-Tone Protection")} valueText={`${Math.round(skinToneProtection * 100)}%`} min={0} max={1} step={0.05} value={skinToneProtection} onChange={(v) => { setSkinToneProtection(v); notifyPipeline(buildEval({ skinToneProtection: v }), `피부톤 보호를 ${Math.round(v * 100)}%로 조정했습니다.`, `Set skin-tone protection to ${Math.round(v * 100)}%.`); }} />
              <RangeSlider id={`${fieldPrefix}-safe`} testId="slider-center-safe" label={pick("얼굴 중앙 분산 보호 반경", "Face Center Safe Radius")} valueText={centerSafeRadius.toFixed(2)} min={0.2} max={0.65} step={0.05} value={centerSafeRadius} onChange={(v) => { setCenterSafeRadius(v); notifyPipeline(buildEval({ centerSafeRadius: v }), `얼굴 중앙 보호 반경을 ${v.toFixed(2)}로 조정했습니다.`, `Set face center safe radius to ${v.toFixed(2)}.`); }} />
            </div>
          </div>
        </div>
      </div>

      {/* WGSL 컴퓨트 셰이더 접기(<details>) + 라이브 상태 안내 */}
      <details data-testid="wgsl-shader-details" className="rounded-xl border border-line bg-card p-3">
        <summary className={`flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-xs font-bold text-fg ${FOCUS_RING}`}>
          <span className="inline-flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("WGSL 컴퓨트 셰이더 코드 보기 (@compute @workgroup_size(8, 8, 1))", "Inspect WGSL Compute Shader (@compute @workgroup_size(8, 8, 1))")}
          </span>
          <span className="font-mono text-[11px] font-semibold text-fg-2 tabular-nums">
            {`mask 0x${wgslShader.stageBitmask.toString(16).padStart(2, "0")} · ${wgslShader.bindingCount} bindings · ${wgslShader.storageFormat} · ${wgslShader.lineCount}L`}
          </span>
        </summary>
        <div className="mt-2.5 space-y-2 border-t border-line pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-fg-2">
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-cool" aria-hidden="true" />
              {pick("현재 비파괴 필터 스택 순서·조리개 날 수·LUT 격자·커튼 비율이 실시간 반영된 WGSL 소스입니다.", "WGSL source dynamically reflects active filter order, aperture blades, LUT lattice, and curtain ratio.")}
            </span>
            <button type="button" data-testid="copy-wgsl-btn" onClick={() => void handleCopyPayload("wgsl")} disabled={copyPending} aria-busy={copyPending} className={BTN_OUTLINE}>
              {copiedTarget === "wgsl" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
              <span>{pick("WGSL 코드 복사", "Copy WGSL")}</span>
            </button>
          </div>
          <pre data-testid="wgsl-shader-code" className="max-h-72 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg">
            <code>{wgslShader.source}</code>
          </pre>
        </div>
      </details>

      {copyError ? <p role="alert" className="text-xs text-fg-2">{copyError}</p> : null}
      {manualCopy ? (
        <div className="space-y-2">
          <p className="text-xs text-fg-2">{pick(`요청 당시 ${manualCopy.target.toUpperCase()} · 직접 복사`, `Requested ${manualCopy.target.toUpperCase()} · Manual Copy`)}</p>
          <pre data-testid="filter-manual-copy-preview" className="max-h-56 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg">{manualCopy.text}</pre>
        </div>
      ) : null}
      <div data-testid="atelier-filter-status" aria-live="polite" className="text-xs font-medium text-fg-2 [word-break:keep-all]">
        {statusMessage || pick(evaluation.activePreset.opticalMechanismKo, evaluation.activePreset.opticalMechanismEn)}
      </div>
    </section>
  );
}
