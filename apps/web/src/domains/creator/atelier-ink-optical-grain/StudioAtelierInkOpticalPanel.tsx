/**
 * Wave 61A — AtelierInk 브러시 시각 질감 대혁신 제어판 (ToonCore · SpectrumCompute).
 *
 * - 6종 시그니처 화구 프리셋 카드 + 6축 실시간 질감 슬라이더(필압·기울기·습윤/건조·종이 거칠기·8~24모·임파스토)
 * - 순수 시맨틱 SVG 좌우 정밀 비교 캔버스(좌: 구형 원형 스탬프·평면 알파 vs 우: AtelierInk 연속 리본·이중 종이결·24모 갈필·45° 광택 단면)
 * - 4대 결함 해결 대조표 + 5축 시각 사실성 점수 + SpectrumCompute WGSL 16B 정적 계약 배지 + JSON/WGSL 복사·미리보기
 * - Calm Atelier 토큰 엄수(원시 색·바이올렛 270~320°·광범위 트랜지션·스토리지·BigInt·기본 빈 객체 props·장식 아이콘 0건)
 */

import {
  AlertTriangle, Brush, Check, Code2, Copy, Cpu,
  Droplets, Layers, RotateCcw, ShieldCheck, SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  ATELIER_INK_OPTICAL_WGSL, ATELIER_INK_SIGNATURE_PRESETS,
  DRY_SURFACE_ROUGHNESS, MAX_BRISTLE_COUNT, MIN_BRISTLE_COUNT, WET_SURFACE_ROUGHNESS,
  evaluateBrushVisualRealism, exportAtelierInkSpecJson, formatOklch, getAtelierInkPreset,
  validateAtelierInkWgsl,
  type AtelierInkExportSpec, type AtelierInkPresetId, type AtelierInkSignaturePreset,
  type AtelierInkStrokeControls, type BrushVisualRealismReport,
} from "./atelier-ink-optical-engine";

export interface StudioAtelierInkOpticalPanelProps {
  readonly initialPresetId?: AtelierInkPresetId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onPresetChange?: (preset: AtelierInkSignaturePreset, report: BrushVisualRealismReport) => void;
  readonly onExportJson?: (json: string, spec: AtelierInkExportSpec) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 [word-break:keep-all] ${FOCUS_RING}`;
const BTN_SOLID = `${BTN_BASE} bg-accent px-3.5 py-2 text-on-accent hover:bg-accent-2`;
const BTN_OUTLINE = `${BTN_BASE} border border-line bg-card px-3 py-2 text-fg hover:border-line-strong hover:bg-raised`;
const BTN_ACTIVE = `${BTN_BASE} border border-accent bg-accent-soft px-3 py-2 text-accent`;

// 비바이올렛 OKLCH 시맨틱 SVG 상수(종이 92°, 골짜기 84°, 45° 광선 76°, 수막 206°, 먹선 236°, 광택 88°, 임계선 34°)
const SVG_LEGACY_BG = "oklch(0.95 0.004 94)";
const SVG_AXIS_INK = "oklch(0.28 0.015 236)";
const SVG_LIGHT_RAY = "oklch(0.74 0.145 76)";
const SVG_SPECULAR = "oklch(0.98 0.018 88)";
const SVG_WATER_HALO = "oklch(0.66 0.095 206 / 0.32)";
const SVG_CLIP_LINE = "oklch(0.56 0.15 34)";
const LEGACY_BEAD_STEPS: readonly number[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

function roundSvg(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveInitialPresetId(candidate: AtelierInkPresetId | undefined): AtelierInkPresetId {
  if (candidate && ATELIER_INK_SIGNATURE_PRESETS.some((item) => item.id === candidate)) return candidate;
  return "hanji-sumi-bristle";
}

function TactileSlider(props: {
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

function AtelierInkComparisonSvg(props: {
  readonly preset: AtelierInkSignaturePreset;
  readonly report: BrushVisualRealismReport;
  readonly isEn: boolean;
}): ReactElement {
  const { preset, report, isEn } = props;
  const colW = 362;
  const leftX = 12;
  const rightX = 386;
  const pad = 14;
  const innerW = colW - pad * 2;
  const topY = 44;
  const topH = 122;
  const midY = topY + 62;
  const crossTopY = 186;
  const crossH = 136;
  const crossBaseY = crossTopY + 114;

  const paperSurf = formatOklch(preset.paperProfile.paperOklch);
  const paperValley = formatOklch(preset.paperProfile.valleyOklch);
  const pigmentSolid = formatOklch(preset.pigmentOklch, 0.92);
  const pigmentMixed = formatOklch(report.spectralMix.mixedOklch, 0.94);
  const legacyMud = formatOklch(report.spectralMix.legacyMuddyOklch, 0.72);
  const impastoShadow = formatOklch({ l: Math.max(0.1, preset.pigmentOklch.l - 0.14), c: preset.pigmentOklch.c * 0.88, h: preset.pigmentOklch.h }, Math.min(0.85, 0.25 + report.wetDryOptical.impastoShadowDepth * 0.65));
  const rimDark = formatOklch({ l: Math.max(0.12, preset.pigmentOklch.l - 0.16), c: Math.min(0.24, preset.pigmentOklch.c + 0.03), h: preset.pigmentOklch.h }, Math.min(0.92, (report.wetDryOptical.capillaryEdgeDarkening - 1) * 0.78));

  const samples = report.paperGrain.crossSectionSamples;
  const rCrossX = rightX + pad;
  const polyPoints = samples.map((s, idx) => {
    const x = roundSvg(rCrossX + (idx / Math.max(1, samples.length - 1)) * innerW);
    const y = roundSvg(crossBaseY - s.combinedHeight * 64);
    return `${x},${y}`;
  });
  const substratePath = `M ${rCrossX} ${crossBaseY} L ${polyPoints.join(" L ")} L ${rCrossX + innerW} ${crossBaseY} Z`;
  const clipLineY = roundSvg(crossBaseY - report.paperGrain.clipThreshold * 64);
  const impastoRisePx = roundSvg(report.wetDryOptical.impastoThicknessMm * 7.5);
  const specularOpacity = roundSvg(Math.min(0.95, 0.16 + report.wetDryOptical.wetGlossIntensity * 0.62 + report.wetDryOptical.impastoHighlightGain * 0.28));

  return (
    <svg
      data-testid="atelier-ink-comparison-svg"
      data-preset-id={preset.id}
      data-bristle-count={report.bristleDepletion.bristleCount}
      data-roughness={report.wetDryOptical.surfaceRoughness.toFixed(2)}
      viewBox="0 0 760 338"
      role="img"
      aria-label={isEn
        ? `Legacy circular stamp versus AtelierInk optical brush grain comparison for ${preset.nameEn}`
        : `${preset.nameKo} 기준 구형 원형 스탬프와 AtelierInk 광학 질감 단면 비교 도해`}
      className="h-auto w-full rounded-xl border border-line bg-card text-fg"
    >
      {/* 좌측: 기존 구형 원형 스탬프 · 평면 알파 */}
      <g data-testid="svg-legacy-column">
        <rect x={leftX} y={10} width={colW} height={318} rx={12} fill="none" stroke="currentColor" strokeOpacity={0.18} strokeWidth={1.2} />
        <text x={leftX + pad} y={31} fontSize={11} fontWeight={700} fill="currentColor">
          {isEn ? "Legacy · Circular Stamp & Flat Alpha" : "기존 구형 · 원형 스탬프 & 평면 알파"}
        </text>
        <text x={leftX + colW - pad} y={31} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.68}>
          {`Beading ${report.ribbon.legacyBeadingIndex.toFixed(2)} · 1모`}
        </text>

        <rect x={leftX + pad} y={topY} width={innerW} height={topH} rx={8} fill={SVG_LEGACY_BG} stroke={paperValley} strokeWidth={1} />
        <text x={leftX + pad + 8} y={topY + 14} fontSize={9} fontWeight={600} fill={SVG_AXIS_INK} fillOpacity={0.74}>
          {isEn ? "TOP VIEW · Scalloped Beads & Muddy sRGB Mix" : "평면 획 · 원형 도장 끊김 & 탁한 sRGB 혼색"}
        </text>
        {LEGACY_BEAD_STEPS.map((step) => {
          const t = step / (LEGACY_BEAD_STEPS.length - 1);
          const cx = roundSvg(leftX + pad + 26 + t * (innerW - 52));
          const cy = roundSvg(midY + Math.sin(t * Math.PI * 1.6) * 14);
          return <circle key={step} cx={cx} cy={cy} r={roundSvg(14 - t * 3.5)} fill={legacyMud} fillOpacity={0.56} />;
        })}
        <rect x={leftX + pad + 10} y={topY + topH - 22} width={86} height={14} rx={4} fill={legacyMud} />
        <text x={leftX + pad + 102} y={topY + topH - 12} fontSize={9} fill={SVG_AXIS_INK} fillOpacity={0.78}>
          {isEn ? `sRGB chroma ${Math.round(report.spectralMix.legacySrgbChromaRetention * 100)}%` : `sRGB 채도 ${Math.round(report.spectralMix.legacySrgbChromaRetention * 100)}% (탁화)`}
        </text>

        {/* 하단: 구형 평면 알파 단면(종이 골짜기 무시 · 법선 0) */}
        <rect x={leftX + pad} y={crossTopY} width={innerW} height={crossH} rx={8} fill={SVG_LEGACY_BG} stroke={paperValley} strokeWidth={1} />
        <text x={leftX + pad + 8} y={crossTopY + 15} fontSize={9} fontWeight={600} fill={SVG_AXIS_INK} fillOpacity={0.74}>
          {isEn ? "CROSS-SECTION · Flat Alpha Slab (No Valley Void / No Relief)" : "확대 단면 · 평면 알파 오버레이 (공극·입체 법선 0)"}
        </text>
        <rect x={leftX + pad + 10} y={crossBaseY - 22} width={innerW - 20} height={22} rx={2} fill={paperValley} fillOpacity={0.5} />
        <rect x={leftX + pad + 10} y={crossBaseY - 38} width={innerW - 20} height={16} rx={2} fill={legacyMud} fillOpacity={0.65} />
        <text x={leftX + pad + 12} y={crossTopY + crossH - 8} fontSize={9} fill={SVG_AXIS_INK} fillOpacity={0.72}>
          {isEn ? "Uniform alpha ignores paper valleys · roughness fixed" : "종이 산/골 무시한 균일 알파 · 광택 변화 없음"}
        </text>
      </g>

      <line x1={380} y1={18} x2={380} y2={322} stroke="currentColor" strokeOpacity={0.22} strokeDasharray="4 4" />

      {/* 우측: AtelierInk 무단절 리본 · 이중 종이결 · 24모 갈필 · 45° 광택 단면 */}
      <g data-testid="svg-atelier-ink-column">
        <rect x={rightX} y={10} width={colW} height={318} rx={12} fill="none" stroke="currentColor" strokeOpacity={0.34} strokeWidth={1.4} />
        <text x={rightX + pad} y={31} fontSize={11} fontWeight={700} fill="currentColor">
          {isEn ? `AtelierInk · ${preset.nameEn}` : `AtelierInk · ${preset.nameKo}`}
        </text>
        <text x={rightX + colW - pad} y={31} textAnchor="end" fontSize={10} fill="currentColor" fillOpacity={0.78}>
          {`Beading ${report.ribbon.beadingIndex.toFixed(3)} · ${report.bristleDepletion.bristleCount}모`}
        </text>

        <rect x={rightX + pad} y={topY} width={innerW} height={topH} rx={8} fill={paperSurf} stroke={paperValley} strokeWidth={1} />
        <text x={rightX + pad + 8} y={topY + 14} fontSize={9} fontWeight={600} fill={SVG_AXIS_INK} fillOpacity={0.78}>
          {isEn ? "TOP VIEW · Continuous SDF Ribbon · Bristle Split · Wet Rim" : "평면 획 · 연속 리본 SDF · 8~24모 갈필 · 백런 림"}
        </text>

        {/* 수채화 모세관 백런 림 */}
        {report.wetDryOptical.capillaryBackrunRimWidthPx > 0.25 ? (
          <g data-testid="svg-capillary-backrun">
            <ellipse
              cx={roundSvg(rightX + pad + innerW * 0.48)} cy={midY + 2}
              rx={roundSvg(124 + report.wetDryOptical.capillaryBackrunRimWidthPx * 3.2)}
              ry={roundSvg(22 + report.wetDryOptical.capillaryBackrunRimWidthPx * 1.8)}
              fill={SVG_WATER_HALO}
            />
            <path
              d={`M ${rightX + pad + 24} ${midY + 4} C ${rightX + pad + 112} ${midY - 22}, ${rightX + pad + 214} ${midY + 24}, ${rightX + pad + innerW - 24} ${midY - 2}`}
              fill="none" stroke={rimDark} strokeWidth={roundSvg(28 + report.wetDryOptical.capillaryBackrunRimWidthPx * 1.4)}
              strokeLinecap="round"
            />
          </g>
        ) : null}

        {/* 45° 임파스토 그림자 능선 */}
        {report.wetDryOptical.impastoThicknessMm > 0.15 ? (
          <path
            d={`M ${rightX + pad + 27} ${midY + 7} C ${rightX + pad + 115} ${midY - 17}, ${rightX + pad + 217} ${midY + 27}, ${rightX + pad + innerW - 21} ${midY + 2}`}
            fill="none" stroke={impastoShadow} strokeWidth={roundSvg(18 + report.wetDryOptical.impastoThicknessMm * 4.2)} strokeLinecap="round"
          />
        ) : null}

        {/* 연속 캡슐 리본 + 8~24모 개별 붓털 안료 고갈 가닥 */}
        <g data-testid="svg-bristle-filaments">
          {report.bristleDepletion.filaments.map((fil) => {
            const spread = 12 + report.input.tiltDeg * 0.14;
            const yOff = fil.lateralOffsetNorm * spread;
            const endX = roundSvg(rightX + pad + 24 + (innerW - 48) * (fil.isDrySplitAtTail ? 0.56 + fil.tailLoad * 1.2 : 1));
            const startX = rightX + pad + 24;
            const strokeW = roundSvg(Math.max(1.1, fil.radiusWeight * (2.6 - report.bristleDepletion.bristleCount * 0.045)));
            return (
              <path
                key={fil.index}
                d={`M ${startX} ${roundSvg(midY + 4 + yOff * 0.72)} C ${roundSvg(startX + 86)} ${roundSvg(midY - 20 + yOff)}, ${roundSvg(startX + 186)} ${roundSvg(midY + 22 + yOff * 1.08)}, ${endX} ${roundSvg(midY - 2 + yOff * 1.24)}`}
                fill="none"
                stroke={fil.index % 3 === 0 ? pigmentMixed : pigmentSolid}
                strokeWidth={strokeW}
                strokeLinecap="round"
                strokeOpacity={roundSvg(Math.max(0.24, fil.samples[2]))}
                strokeDasharray={fil.isDrySplitAtTail ? "14 4 6 5" : undefined}
              />
            );
          })}
        </g>

        {/* 45° 습윤 광택 & 임파스토 하이라이트 */}
        <path
          data-testid="svg-specular-glint"
          d={`M ${rightX + pad + 30} ${midY - 1} C ${rightX + pad + 114} ${midY - 25}, ${rightX + pad + 206} ${midY + 14}, ${rightX + pad + innerW - 36} ${midY - 7}`}
          fill="none" stroke={SVG_SPECULAR} strokeWidth={roundSvg(1.4 + report.wetDryOptical.impastoHighlightGain * 2.4)}
          strokeLinecap="round" strokeOpacity={specularOpacity}
        />
        <rect x={rightX + pad + 10} y={topY + topH - 22} width={86} height={14} rx={4} fill={pigmentMixed} />
        <text x={rightX + pad + 102} y={topY + topH - 12} fontSize={9} fill={SVG_AXIS_INK} fillOpacity={0.82}>
          {isEn ? `Optical K/S ${Math.round(report.spectralMix.opticalChromaRetention * 100)}% · R ${report.wetDryOptical.surfaceRoughness.toFixed(2)}` : `광학 K/S 채도 ${Math.round(report.spectralMix.opticalChromaRetention * 100)}% · 거칠기 ${report.wetDryOptical.surfaceRoughness.toFixed(2)}`}
        </text>

        {/* 하단: 이중 주파수 종이 산/골 확대 단면 + 임계 클리핑 + 45° 광선 */}
        <rect x={rightX + pad} y={crossTopY} width={innerW} height={crossH} rx={8} fill={paperSurf} stroke={paperValley} strokeWidth={1} />
        <text x={rightX + pad + 8} y={crossTopY + 15} fontSize={9} fontWeight={600} fill={SVG_AXIS_INK} fillOpacity={0.78}>
          {isEn ? "CROSS-SECTION · Dual-Freq Peaks/Valleys + 45° Sobel Gloss" : "확대 단면 · 이중 종이 산/골 클리핑 + 45° 광택 하이라이트"}
        </text>
        <path data-testid="svg-paper-heightfield" d={substratePath} fill={paperValley} fillOpacity={0.76} stroke={SVG_AXIS_INK} strokeOpacity={0.35} strokeWidth={1} />
        <line x1={rCrossX} y1={clipLineY} x2={rCrossX + innerW} y2={clipLineY} stroke={SVG_CLIP_LINE} strokeWidth={1.1} strokeDasharray="4 3" />

        {/* 종이 산봉우리에만 안료 부착 (골짜기 백색 공극 유지) */}
        <g data-testid="svg-peak-pigment-caps">
          {samples.map((s, idx) => {
            if (!s.pigmentHit) return null;
            const x = roundSvg(rCrossX + (idx / Math.max(1, samples.length - 1)) * innerW);
            const y = roundSvg(crossBaseY - s.combinedHeight * 64);
            const capH = roundSvg(4 + impastoRisePx * 0.45);
            return (
              <g key={idx}>
                <rect x={roundSvg(x - 4.5)} y={roundSvg(y - capH)} width={9} height={capH} rx={2.5} fill={pigmentSolid} />
                {report.wetDryOptical.wetGlossIntensity > 0.25 || report.wetDryOptical.impastoThicknessMm > 0.4 ? (
                  <line x1={roundSvg(x - 3)} y1={roundSvg(y - capH + 1.2)} x2={roundSvg(x + 2.5)} y2={roundSvg(y - capH + 1.2)} stroke={SVG_SPECULAR} strokeWidth={1.3} strokeOpacity={specularOpacity} />
                ) : null}
              </g>
            );
          })}
        </g>

        {/* 45° 입사 광선 표식 */}
        <line x1={rCrossX + innerW - 56} y1={crossTopY + 22} x2={rCrossX + innerW - 22} y2={crossTopY + 56} stroke={SVG_LIGHT_RAY} strokeWidth={1.8} />
        <circle cx={rCrossX + innerW - 22} cy={crossTopY + 56} r={3} fill={SVG_LIGHT_RAY} />
        <text x={rCrossX + innerW - 60} y={crossTopY + 32} textAnchor="end" fontSize={9} fontWeight={600} fill={SVG_AXIS_INK}>
          45° Sobel
        </text>
        <text x={rCrossX + 8} y={crossTopY + crossH - 8} fontSize={9} fill={SVG_AXIS_INK} fillOpacity={0.78}>
          {isEn
            ? `Threshold ${Math.round(report.paperGrain.clipThreshold * 100)}% · Valley voids ${Math.round(report.paperGrain.valleyVoidRatio * 100)}% · Impasto ${report.wetDryOptical.impastoThicknessMm.toFixed(1)}mm`
            : `임계 ${Math.round(report.paperGrain.clipThreshold * 100)}% · 골짜기 공극 ${Math.round(report.paperGrain.valleyVoidRatio * 100)}% · 임파스토 ${report.wetDryOptical.impastoThicknessMm.toFixed(1)}mm`}
        </text>
      </g>
    </svg>
  );
}

/** AtelierInk 브러시 시각 질감 대혁신 제어판(모든 props 선택적, 기본 빈 객체 props 미사용). */
export function StudioAtelierInkOpticalPanel(props: StudioAtelierInkOpticalPanelProps): ReactElement {
  const uid = useId();
  const isEn = props.locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [presetId, setPresetId] = useState<AtelierInkPresetId>(() => resolveInitialPresetId(props.initialPresetId));
  const [controls, setControls] = useState<AtelierInkStrokeControls>(() => getAtelierInkPreset(resolveInitialPresetId(props.initialPresetId)).defaults);
  const [previewMode, setPreviewMode] = useState<"hidden" | "json" | "wgsl">("hidden");
  const [copyState, setCopyState] = useState<
    { readonly status: "idle" }
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

  const activePreset = useMemo(() => getAtelierInkPreset(presetId), [presetId]);
  const report = useMemo(() => evaluateBrushVisualRealism(presetId, controls), [presetId, controls]);
  const wgslValidation = useMemo(() => validateAtelierInkWgsl(ATELIER_INK_OPTICAL_WGSL), []);
  const exportBundle = useMemo(() => exportAtelierInkSpecJson({ presetId, controls }), [presetId, controls]);

  function handleSelectPreset(nextId: AtelierInkPresetId): void {
    const nextPreset = getAtelierInkPreset(nextId);
    const nextControls: AtelierInkStrokeControls = { ...nextPreset.defaults };
    const nextReport = evaluateBrushVisualRealism(nextId, nextControls);
    setPresetId(nextId);
    setControls(nextControls);
    setCopyState({ status: "idle" });
    props.onPresetChange?.(nextPreset, nextReport);
  }

  function handleUpdateControl<K extends keyof AtelierInkStrokeControls>(key: K, value: AtelierInkStrokeControls[K]): void {
    setControls((prev) => ({ ...prev, [key]: value }));
    setCopyState({ status: "idle" });
  }

  function handleResetDefaults(): void {
    setControls({ ...activePreset.defaults });
    setCopyState({ status: "idle" });
  }

  async function handleCopyPayload(kind: "json" | "wgsl"): Promise<void> {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setCopyState({ status: "pending", kind });
    const snapshot = exportBundle;
    const text = kind === "json" ? snapshot.json : snapshot.wgsl;
    try {
      const writeText = globalThis.navigator?.clipboard?.writeText;
      if (typeof writeText !== "function") throw new Error("clipboard unavailable");
      await writeText.call(globalThis.navigator.clipboard, text);
      if (!mountedRef.current) return;
      if (kind === "json" && onExportRef.current) {
        await onExportRef.current(snapshot.json, snapshot.spec);
      }
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
      data-testid="studio-atelier-ink-optical-panel"
      aria-label={pick("AtelierInk 브러시 시각 질감 대혁신 제어판", "AtelierInk Optical Brush Grain Studio Panel")}
      className={rootClassName}
    >
      {/* 헤더 + 빠른 동작 */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11px] font-semibold text-accent [word-break:keep-all]">
            <Brush className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("AtelierInk · ToonCore · SpectrumCompute 광학 질감 엔진", "AtelierInk · ToonCore · SpectrumCompute Optical Grain Engine")}
          </div>
          <h2 className="text-base font-bold tracking-tight text-fg [word-break:keep-all]">
            {pick("실물 화구 브러시 시각 질감 대혁신", "AtelierInk Optical Brush Texture Studio")}
          </h2>
          <p className="max-w-3xl text-xs text-fg-2 [word-break:keep-all]">
            {pick(
              "원형 도장 끊김·평면 종이결·탁한 sRGB 혼색·플랫 채색 4대 한계를 연속 리본 SDF, 이중 주파수 높이장, 분광 K/S·24모 갈필, 습윤→건조 45° Sobel 광택으로 해결한다.",
              "Replaces circular stamp beading, flat paper overlays, muddy sRGB mixing, and flat shading with continuous SDF ribbons, dual-frequency grain clipping, K/S bristle depletion, and 45° wet→dry optics.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" data-testid="reset-atelier-ink-btn" onClick={handleResetDefaults} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {pick("프리셋 기본값", "Reset Preset")}
          </button>
          <button
            type="button" data-testid="copy-atelier-ink-wgsl-btn"
            onClick={() => { void handleCopyPayload("wgsl"); }}
            disabled={copyState.status === "pending"}
            className={BTN_OUTLINE}
          >
            {copyState.status === "copied" && copyState.kind === "wgsl" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {copyState.status === "copied" && copyState.kind === "wgsl" ? pick("WGSL 복사됨", "WGSL Copied") : pick("WGSL 복사", "Copy WGSL")}
          </button>
          <button
            type="button" data-testid="export-atelier-ink-json-btn"
            onClick={() => { void handleCopyPayload("json"); }}
            disabled={copyState.status === "pending"}
            className={BTN_SOLID}
          >
            {copyState.status === "copied" && copyState.kind === "json" ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
            {copyState.status === "copied" && copyState.kind === "json"
              ? pick("JSON 복사됨", "JSON Copied")
              : copyState.status === "error" && copyState.kind === "json"
                ? pick("JSON 다시 복사", "Retry JSON Copy")
                : pick("JSON 내보내기", "Export JSON")}
          </button>
        </div>
      </div>

      {copyState.status === "error" ? (
        <div role="alert" data-testid="copy-error-alert" className="flex items-center gap-2 rounded-lg border border-warn bg-raised px-3 py-2 text-xs text-warn [word-break:keep-all]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {pick(
              "클립보드 복사 또는 내보내기 전달에 실패했습니다. 버튼을 눌러 다시 시도해 주세요.",
              "Clipboard copy or export callback failed. Press the button again to retry.",
            )}
          </span>
        </div>
      ) : null}

      {/* 6종 아틀리에 시그니처 화구 프리셋 카드 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("6종 아틀리에 시그니처 화구", "Six AtelierInk Signature Brushes")}
          </h3>
          <span className="font-mono text-[11px] text-fg-3 tabular-nums">
            {`${isEn ? activePreset.paperProfile.nameEn : activePreset.paperProfile.nameKo} · ${activePreset.nibSharpnessDpi} DPI`}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {ATELIER_INK_SIGNATURE_PRESETS.map((preset) => {
            const isSelected = preset.id === presetId;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`preset-card-${preset.id}`}
                aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset.id)}
                className={`flex min-h-11 cursor-pointer flex-col items-start gap-1.5 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none ${FOCUS_RING} ${
                  isSelected ? "border-accent bg-accent-soft" : "border-line bg-raised hover:border-line-strong"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg [word-break:keep-all]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: formatOklch(preset.pigmentOklch) }} aria-hidden="true" />
                    {isEn ? preset.nameEn : preset.nameKo}
                  </span>
                  <span className="font-mono text-[10px] text-fg-3 tabular-nums">
                    {`${preset.defaults.bristleCount}${pick("모", "b")}`}
                  </span>
                </div>
                <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? preset.taglineEn : preset.taglineKo}</p>
                <span className="font-mono text-[10px] text-accent [word-break:keep-all]">
                  {isEn ? preset.mediumCategoryEn : preset.mediumCategoryKo}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6축 실시간 촉각·광학 파라미터 슬라이더 */}
      <div className="space-y-3 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("실시간 화구 물리 · 광학 파라미터", "Live Tactile & Optical Controls")}
          </h3>
          <span data-testid="roughness-transition-pill" className="inline-flex items-center gap-1 font-mono text-[11px] text-fg-2 tabular-nums">
            <Droplets className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick(
              `거칠기 ${report.wetDryOptical.surfaceRoughness.toFixed(2)} (${WET_SURFACE_ROUGHNESS}→${DRY_SURFACE_ROUGHNESS})`,
              `Roughness ${report.wetDryOptical.surfaceRoughness.toFixed(2)} (${WET_SURFACE_ROUGHNESS}→${DRY_SURFACE_ROUGHNESS})`,
            )}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <TactileSlider
            id={`${uid}-pressure`} testId="slider-pressure"
            label={pick("필압 (Pressure)", "Pressure")} readout={`${Math.round(report.input.pressure * 100)}%`}
            hint={pick("높을수록 종이 골짜기 깊숙이 안료가 스며 공극이 줄어듭니다", "Higher pressure drives pigment deeper into paper valleys")}
            min={0.05} max={1} step={0.05} value={report.input.pressure}
            onChange={(v) => handleUpdateControl("pressure", v)}
          />
          <TactileSlider
            id={`${uid}-tilt`} testId="slider-tilt"
            label={pick("기울기 (Tilt)", "Stylus Tilt")} readout={`${report.input.tiltDeg}°`}
            hint={pick("눕힐수록 산봉우리 접촉이 도드라지고 붓털 폭이 넓어집니다", "Higher tilt emphasizes peak tooth clipping and bristle splay")}
            min={0} max={75} step={1} value={report.input.tiltDeg}
            onChange={(v) => handleUpdateControl("tiltDeg", v)}
          />
          <TactileSlider
            id={`${uid}-drying`} testId="slider-drying"
            label={pick("건조 진행도 (습윤→건조)", "Drying Progress (Wet→Dry)")}
            readout={`${Math.round(report.input.dryingProgress * 100)}% · R ${report.wetDryOptical.surfaceRoughness.toFixed(2)}`}
            hint={pick("0% 습윤 광택(0.14)에서 100% 건조 매트(0.78)로 실시간 전이", "Transitions roughness from 0.14 wet sheen to 0.78 dry matte")}
            min={0} max={1} step={0.05} value={report.input.dryingProgress}
            onChange={(v) => handleUpdateControl("dryingProgress", v)}
          />
          <TactileSlider
            id={`${uid}-roughness`} testId="slider-paper-roughness"
            label={pick("종이 거칠기 (이중 주파수)", "Paper Roughness (Dual-Freq)")} readout={`${Math.round(report.input.paperRoughness * 100)}%`}
            hint={pick("거시 섬유와 미세 요철 높이 진폭을 동시에 조절합니다", "Scales macro fiber and micro tooth heightfield amplitude")}
            min={0.05} max={1} step={0.05} value={report.input.paperRoughness}
            onChange={(v) => handleUpdateControl("paperRoughness", v)}
          />
          <TactileSlider
            id={`${uid}-bristles`} testId="slider-bristle-count"
            label={pick("붓털 수 (8~24모)", "Bristle Filaments (8–24)")} readout={pick(`${report.input.bristleCount}모`, `${report.input.bristleCount} bristles`)}
            hint={pick("개별 붓털 안료 고갈 곡선과 획 후반부 갈필 갈라짐 밀도", "Controls individual filament depletion and dry-brush tail splits")}
            min={MIN_BRISTLE_COUNT} max={MAX_BRISTLE_COUNT} step={1} value={report.input.bristleCount}
            onChange={(v) => handleUpdateControl("bristleCount", v)}
          />
          <TactileSlider
            id={`${uid}-impasto`} testId="slider-impasto-thickness"
            label={pick("임파스토 두께 (45° Sobel)", "Impasto Thickness (45° Sobel)")} readout={`${report.input.impastoThicknessMm.toFixed(1)} mm`}
            hint={pick("물감 능선 높이와 45° Sobel 법선 하이라이트 대비를 높입니다", "Increases ridge thickness and 45° Sobel normal specular relief")}
            min={0} max={2.4} step={0.1} value={report.input.impastoThicknessMm}
            onChange={(v) => handleUpdateControl("impastoThicknessMm", v)}
          />
        </div>
      </div>

      {/* 순수 시맨틱 SVG 좌우 정밀 비교 캔버스 */}
      <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("좌우 정밀 시각 질감 비교 (순수 OKLCH 시맨틱 SVG)", "Side-by-Side Precision Visual Grain Comparison (Pure OKLCH SVG)")}
          </h3>
          <span data-testid="realism-score-badge" className="font-mono text-xs font-bold text-good tabular-nums">
            {pick(
              `사실성 ${report.legacyOverallScore}점 → ${report.atelierInkOverallScore}점 (+${report.realismGainPoints}pt)`,
              `Realism ${report.legacyOverallScore} → ${report.atelierInkOverallScore} (+${report.realismGainPoints}pt)`,
            )}
          </span>
        </div>
        <AtelierInkComparisonSvg preset={activePreset} report={report} isEn={isEn} />
      </div>

      {/* 4대 결함 해결 진단 + 5축 사실성 점수 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <ShieldCheck className="h-3.5 w-3.5 text-good" aria-hidden="true" />
            {pick("기존 브러시 4대 결함 정량 해결 진단", "Four Root-Cause Visual Flaws Resolved")}
          </h3>
          <div className="space-y-2">
            {report.fourRootCauses.map((item) => (
              <div key={item.id} data-testid={`root-cause-${item.id}`} className="border-t border-line/60 pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-fg [word-break:keep-all]">{`${item.id}. ${isEn ? item.flawEn : item.flawKo}`}</span>
                  <span className="font-mono text-[11px] font-bold text-good tabular-nums">
                    {item.resolved ? pick("해결", "Resolved") : pick("점검", "Check")}
                  </span>
                </div>
                <p className="text-[11px] text-fg-2 [word-break:keep-all]">{isEn ? item.solutionEn : item.solutionKo}</p>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-fg-3 tabular-nums">
                  <span>{`${pick("구형", "Legacy")}: ${item.legacyMetric}`}</span>
                  <span className="text-accent">{`AtelierInk: ${item.atelierInkMetric}`}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2.5 rounded-xl border border-line bg-raised p-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-fg [word-break:keep-all]">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("5축 시각 사실성 점수 · SpectrumCompute WGSL 계약", "5-Axis Visual Realism & SpectrumCompute WGSL Contract")}
          </h3>
          <div className="space-y-2.5">
            {report.axes.map((axis) => (
              <div key={axis.id} data-testid={`realism-axis-${axis.id}`} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-fg [word-break:keep-all]">{isEn ? axis.labelEn : axis.labelKo}</span>
                  <span className="font-mono text-[11px] text-fg-2 tabular-nums">
                    {`${axis.legacyScore} → `}
                    <strong className="text-good">{axis.atelierInkScore}</strong>
                    {` (+${axis.delta})`}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${axis.atelierInkScore}%` }} />
                </div>
                <p className="text-[10px] text-fg-3 [word-break:keep-all]">{isEn ? axis.summaryEn : axis.summaryKo}</p>
              </div>
            ))}
          </div>
          <div data-testid="wgsl-contract-summary" className="border-t border-line/60 pt-2 font-mono text-[10px] text-fg-2 tabular-nums">
            {pick(
              `WGSL 정적 검증 ${wgslValidation.valid ? "통과" : "실패"} · Uniform ${wgslValidation.uniformStructBytes}B / Bristle ${wgslValidation.bristleStructBytes}B (16B 정렬) · 예약어 충돌 ${wgslValidation.reservedKeywordHits.length}건`,
              `WGSL static contract ${wgslValidation.valid ? "PASS" : "FAIL"} · Uniform ${wgslValidation.uniformStructBytes}B / Bristle ${wgslValidation.bristleStructBytes}B (16B aligned) · ${wgslValidation.reservedKeywordHits.length} reserved hits`,
            )}
          </div>
        </div>
      </div>

      {/* WGSL / JSON 미리보기 토글 및 정직성 안내 */}
      <div className="space-y-2 rounded-xl border border-line bg-raised p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold text-fg [word-break:keep-all]">
            {pick("ToonCore JSON 스펙 · SpectrumCompute WGSL 셰이더 미리보기", "ToonCore JSON Spec & SpectrumCompute WGSL Preview")}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button" data-testid="toggle-json-preview-btn"
              onClick={() => setPreviewMode((prev) => (prev === "json" ? "hidden" : "json"))}
              className={previewMode === "json" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Code2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {previewMode === "json" ? pick("JSON 닫기", "Hide JSON") : pick("JSON 보기", "View JSON")}
            </button>
            <button
              type="button" data-testid="toggle-wgsl-preview-btn"
              onClick={() => setPreviewMode((prev) => (prev === "wgsl" ? "hidden" : "wgsl"))}
              className={previewMode === "wgsl" ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {previewMode === "wgsl" ? pick("WGSL 닫기", "Hide WGSL") : pick("WGSL 보기", "View WGSL")}
            </button>
          </div>
        </div>
        <p data-testid="atelier-ink-honesty-note" className="text-[11px] text-fg-3 [word-break:keep-all]">
          {isEn ? exportBundle.spec.honestyNoteEn : exportBundle.spec.honestyNoteKo}
        </p>
        {previewMode !== "hidden" ? (
          <pre
            data-testid="atelier-ink-code-preview"
            data-preview-mode={previewMode}
            className="max-h-64 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] text-fg-2"
          >
            {previewMode === "json" ? exportBundle.json : exportBundle.wgsl}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
