/**
 * Wave 42B — 한국 웹툰 액션·판타지·로맨스 프로시저럴 벡터 이펙트 랩 패널.
 *
 * - 6종 웹툰 벡터 FX 프리셋 즉시 전환 + 실시간 SVG 벡터 프리뷰
 * - 밀도 · 소실점(X/Y) · 인물 안전 반경 · 방향 각도 · 이펙트 강도 실시간 제어
 * - 인물 얼굴 안전 영역(`characterMask`) 침범 0px 실시간 감사 배지 + 순수 SVG 내보내기 미리보기
 * - Calm Atelier 시맨틱 토큰 전용(원시 hex/rgb/hsl 0건 · Web Storage 0건 · `props = {}` 미사용)
 */

import {
  Code2, Compass, Copy, Crosshair, Download, Eye, EyeOff,
  Flower2, Layers, Orbit, RefreshCw, RotateCcw, ShieldCheck,
  SlidersHorizontal, Wind, Zap,
} from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactElement } from "react";

import {
  ACTION_FX_PRESETS,
  DEFAULT_ACTION_FX_CANVAS,
  DEFAULT_CHARACTER_MASK_RADIUS,
  exportActionFxSvg,
  generateActionFxLayer,
  getActionFxPresetSpec,
  type ActionFxCategory,
  type ActionFxLayerResult,
  type ActionFxPresetId,
  type ActionFxVectorPrimitive,
} from "./action-fx-vector-engine";

export interface StudioActionFxLabPanelProps {
  readonly initialPreset?: ActionFxPresetId;
  readonly initialSeed?: number;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onLayerChange?: (layer: ActionFxLayerResult) => void;
  readonly onExportSvg?: (svg: string, presetId: ActionFxPresetId) => void;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_SOLID = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

const VP_QUICK_ANCHORS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly x: number;
  readonly y: number;
}[] = [
  { id: "center", labelKo: "정중앙", labelEn: "Center", x: 0.5, y: 0.44 },
  { id: "upper-left", labelKo: "좌상단 돌진", labelEn: "Top-Left", x: 0.28, y: 0.26 },
  { id: "upper-right", labelKo: "우상단 역광", labelEn: "Top-Right", x: 0.74, y: 0.28 },
  { id: "low-angle", labelKo: "하단 앙각", labelEn: "Low Angle", x: 0.5, y: 0.72 },
];

function renderPresetIcon(presetId: ActionFxPresetId): ReactElement {
  const cls = "h-4 w-4 shrink-0";
  switch (presetId) {
    case "radial-focus-lines": return <Crosshair className={cls} aria-hidden="true" />;
    case "parallel-speed-lines": return <Wind className={cls} aria-hidden="true" />;
    case "impact-shockwave": return <Zap className={cls} aria-hidden="true" />;
    case "arcane-magic-circle": return <Compass className={cls} aria-hidden="true" />;
    case "motion-afterimage-ghost": return <Orbit className={cls} aria-hidden="true" />;
    case "romance-petal-frame": return <Flower2 className={cls} aria-hidden="true" />;
  }
}

function categoryBadgeLabel(category: ActionFxCategory, isEn: boolean): string {
  if (category === "fantasy") return isEn ? "Fantasy" : "판타지";
  if (category === "romance") return isEn ? "Romance" : "로맨스";
  return isEn ? "Action" : "액션";
}

function categoryToneClass(category: ActionFxCategory): string {
  if (category === "fantasy") return "border-cool bg-info-soft text-cool";
  if (category === "romance") return "border-warn bg-warning-soft text-warn";
  return "border-accent bg-accent-soft text-accent";
}

function formatPointsForSvg(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((pt) => `${pt.x},${pt.y}`).join(" ");
}

function renderSvgPrimitive(primitive: ActionFxVectorPrimitive): ReactElement {
  if (primitive.kind === "polygon") {
    return (
      <polygon
        key={primitive.id}
        data-role={primitive.role}
        points={formatPointsForSvg(primitive.points)}
        fill={primitive.fill}
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        strokeLinejoin="round"
        opacity={primitive.opacity}
      />
    );
  }
  if (primitive.kind === "polyline") {
    return (
      <polyline
        key={primitive.id}
        data-role={primitive.role}
        points={formatPointsForSvg(primitive.points)}
        fill="none"
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={primitive.dashArray}
        opacity={primitive.opacity}
      />
    );
  }
  if (primitive.kind === "circle") {
    return (
      <circle
        key={primitive.id}
        data-role={primitive.role}
        cx={primitive.cx}
        cy={primitive.cy}
        r={primitive.r}
        fill={primitive.fill}
        stroke={primitive.stroke}
        strokeWidth={primitive.strokeWidth}
        strokeDasharray={primitive.dashArray}
        opacity={primitive.opacity}
      />
    );
  }
  return (
    <ellipse
      key={primitive.id}
      data-role={primitive.role}
      cx={primitive.cx}
      cy={primitive.cy}
      rx={primitive.rx}
      ry={primitive.ry}
      fill={primitive.fill}
      stroke={primitive.stroke}
      strokeWidth={primitive.strokeWidth}
      transform={primitive.rotationDeg !== 0 ? `rotate(${primitive.rotationDeg} ${primitive.cx} ${primitive.cy})` : undefined}
      opacity={primitive.opacity}
    />
  );
}

interface FxRangeControlProps {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly valueText: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly disabled?: boolean;
  readonly onChange: (next: number) => void;
}

function FxRangeControl(props: FxRangeControlProps): ReactElement {
  const { id, testId, label, valueText, value, min, max, step, disabled = false, onChange } = props;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-semibold text-fg-2 [word-break:keep-all]">
          {label}
        </label>
        <span className="font-bold text-fg tabular-nums">{valueText}</span>
      </div>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-45 ${FOCUS_RING}`}
      />
    </div>
  );
}

interface FxMetricCardProps {
  readonly label: string;
  readonly value: string;
  readonly testId: string;
  readonly toneClass?: string;
}

function FxMetricCard(props: FxMetricCardProps): ReactElement {
  const { label, value, testId, toneClass = "text-fg" } = props;
  return (
    <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
      <div className="text-[11px] font-medium text-fg-3 [word-break:keep-all]">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-sm font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

/** 한국 웹툰 6종 프로시저럴 벡터 이펙트 랩 패널. 단독 `<StudioActionFxLabPanel />` 렌더링을 지원한다. */
export function StudioActionFxLabPanel(props: StudioActionFxLabPanelProps): ReactElement {
  const {
    initialPreset = "radial-focus-lines",
    initialSeed = 4201,
    locale = "ko",
    className,
    onLayerChange,
    onExportSvg,
  } = props;

  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const initialSpec = getActionFxPresetSpec(initialPreset);

  const [presetId, setPresetId] = useState<ActionFxPresetId>(initialSpec.id);
  const [seed, setSeed] = useState<number>(initialSeed);
  const [density, setDensity] = useState<number>(initialSpec.defaultDensity);
  const [vanishingPointX, setVanishingPointX] = useState<number>(0.5);
  const [vanishingPointY, setVanishingPointY] = useState<number>(0.44);
  const [angleDeg, setAngleDeg] = useState<number>(initialSpec.defaultAngleDeg);
  const [intensity, setIntensity] = useState<number>(initialSpec.defaultIntensity);
  const [maskRadius, setMaskRadius] = useState<number>(DEFAULT_CHARACTER_MASK_RADIUS);
  const [maskEnabled, setMaskEnabled] = useState<boolean>(true);
  const [showSafeGuide, setShowSafeGuide] = useState<boolean>(true);
  const [showVanishingGuide, setShowVanishingGuide] = useState<boolean>(true);
  const [showSvgCode, setShowSvgCode] = useState<boolean>(true);
  const [includeGuidesInExport, setIncludeGuidesInExport] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  const layer = useMemo<ActionFxLayerResult>(
    () =>
      generateActionFxLayer({
        preset: presetId,
        width: DEFAULT_ACTION_FX_CANVAS.width,
        height: DEFAULT_ACTION_FX_CANVAS.height,
        seed,
        density,
        vanishingPointX,
        vanishingPointY,
        angleDeg,
        intensity,
        characterMask: {
          cx: DEFAULT_ACTION_FX_CANVAS.width * 0.5,
          cy: DEFAULT_ACTION_FX_CANVAS.height * 0.45,
          radius: maskRadius,
          enabled: maskEnabled,
        },
      }),
    [presetId, seed, density, vanishingPointX, vanishingPointY, angleDeg, intensity, maskRadius, maskEnabled],
  );

  const exportedSvg = useMemo<string>(
    () =>
      exportActionFxSvg(layer, {
        includeBackdrop: false,
        includeSafeMaskGuide: includeGuidesInExport,
        includeVanishingGuide: includeGuidesInExport,
      }),
    [layer, includeGuidesInExport],
  );

  useEffect(() => {
    onLayerChange?.(layer);
  }, [layer, onLayerChange]);

  const handleSelectPreset = (nextId: ActionFxPresetId): void => {
    const spec = getActionFxPresetSpec(nextId);
    setPresetId(spec.id);
    setAngleDeg(spec.defaultAngleDeg);
    setIntensity(spec.defaultIntensity);
    setStatusMessage(pick(`${spec.labelKo} 프리셋으로 전환했습니다.`, `Switched to ${spec.labelEn}.`));
  };

  const handleRefreshSeed = (): void => {
    setSeed((prev) => ((prev * 1664525 + 1013904223) >>> 0) % 899999 + 100000);
    setStatusMessage(pick("결정론적 시드를 갱신했습니다.", "Generated a new deterministic seed."));
  };

  const handleReset = (): void => {
    const spec = getActionFxPresetSpec(presetId);
    setSeed(initialSeed);
    setDensity(spec.defaultDensity);
    setVanishingPointX(0.5);
    setVanishingPointY(0.44);
    setAngleDeg(spec.defaultAngleDeg);
    setIntensity(spec.defaultIntensity);
    setMaskRadius(DEFAULT_CHARACTER_MASK_RADIUS);
    setMaskEnabled(true);
    setStatusMessage(pick("현재 프리셋 파라미터를 기본값으로 복원했습니다.", "Restored preset parameters to defaults."));
  };

  const handleCopySvg = (): void => {
    onExportSvg?.(exportedSvg, presetId);
    if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      void navigator.clipboard.writeText(exportedSvg).catch(() => undefined);
    }
    setStatusMessage(
      pick(
        `${layer.preset.labelKo} SVG(${exportedSvg.length.toLocaleString("ko-KR")}B)를 복사했습니다.`,
        `Copied ${layer.preset.labelEn} SVG (${exportedSvg.length.toLocaleString("en-US")} B).`,
      ),
    );
  };

  const handleDownloadSvg = (): void => {
    onExportSvg?.(exportedSvg, presetId);
    if (typeof document !== "undefined" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      const blob = new Blob([exportedSvg], { type: "image/svg+xml;charset=utf-8" });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `toonstudio-${presetId}-seed-${seed}.svg`;
      anchor.click();
      URL.revokeObjectURL(href);
    }
    setStatusMessage(
      pick(
        `toonstudio-${presetId}-seed-${seed}.svg 파일을 내보냈습니다.`,
        `Exported toonstudio-${presetId}-seed-${seed}.svg.`,
      ),
    );
  };

  const { characterMask, vanishingPointPx } = layer.resolvedOptions;
  const auditTone = layer.maskAudit.safeZoneGuaranteed
    ? "border-good bg-good-soft text-good"
    : "border-bad bg-bad-soft text-bad";

  return (
    <section
      aria-label={pick("웹툰 액션·판타지·로맨스 프로시저럴 벡터 FX 랩", "Webtoon Procedural Vector FX Lab")}
      data-testid="studio-action-fx-lab-panel"
      className={`flex flex-col gap-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] sm:p-5 ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3.5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-fg">
              {pick("웹툰 프로시저럴 벡터 이펙트 랩", "Webtoon Procedural Vector FX Lab")}
            </h2>
            <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${categoryToneClass(layer.preset.category)}`}>
              {categoryBadgeLabel(layer.preset.category, isEn)}
            </span>
          </div>
          <p className="text-xs text-fg-2">
            {pick(layer.preset.descriptionKo, layer.preset.descriptionEn)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="fx-mask-audit-badge"
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold tabular-nums ${auditTone}`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            {layer.maskAudit.maskEnabled
              ? pick(
                  `얼굴 침범 ${layer.maskAudit.maxIntrusionPx}px · 안전 통과`,
                  `Face Intrusion ${layer.maskAudit.maxIntrusionPx}px · Safe`,
                )
              : pick("얼굴 마스킹 해제", "Face Mask Off")}
          </span>
          <button type="button" data-testid="fx-randomize-seed-btn" onClick={handleRefreshSeed} className={BTN_OUTLINE}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("시드 변경", "New Seed")}
          </button>
          <button type="button" data-testid="fx-reset-btn" onClick={handleReset} className={BTN_OUTLINE}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("초기화", "Reset")}
          </button>
        </div>
      </header>

      <div role="group" aria-label={pick("6종 웹툰 벡터 FX 프리셋", "6 Webtoon Vector FX Presets")} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ACTION_FX_PRESETS.map((preset) => {
          const active = preset.id === presetId;
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`fx-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => handleSelectPreset(preset.id)}
              className={`${active ? BTN_ACTIVE : BTN_OUTLINE} flex-col items-start justify-start px-3.5 py-2.5 text-left`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-bold">
                  {renderPresetIcon(preset.id)}
                  {pick(preset.labelKo, preset.labelEn)}
                </span>
                <span className="rounded-md border border-line bg-panel px-1.5 py-0.5 text-[10px] font-semibold text-fg-2">
                  {categoryBadgeLabel(preset.category, isEn)}
                </span>
              </span>
              <span className="text-[11px] font-normal text-fg-2">
                {pick(preset.useCaseKo, preset.useCaseEn)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-3 rounded-xl border border-line bg-card p-3.5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-fg">
              {pick("실시간 4:5 웹툰 컷 SVG 벡터 프리뷰", "Live 4:5 Webtoon Cut SVG Preview")}
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                data-testid="fx-guide-safe-toggle"
                aria-pressed={showSafeGuide}
                onClick={() => setShowSafeGuide((prev) => !prev)}
                className={showSafeGuide ? BTN_ACTIVE : BTN_OUTLINE}
              >
                {showSafeGuide ? <Eye className="h-3.5 w-3.5" aria-hidden="true" /> : <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
                {pick("얼굴 안전선", "Safe Guide")}
              </button>
              <button
                type="button"
                data-testid="fx-guide-vp-toggle"
                aria-pressed={showVanishingGuide}
                onClick={() => setShowVanishingGuide((prev) => !prev)}
                className={showVanishingGuide ? BTN_ACTIVE : BTN_OUTLINE}
              >
                <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("소실점 십자", "Vanishing")}
              </button>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[440px] overflow-hidden rounded-xl border border-line-strong bg-canvas">
            <svg
              data-testid="action-fx-preview-svg"
              data-preset={layer.preset.id}
              data-primitive-count={layer.metrics.primitiveCount}
              viewBox={layer.viewBox}
              role="img"
              aria-label={pick(`${layer.preset.labelKo} 실시간 벡터 프리뷰`, `${layer.preset.labelEn} live vector preview`)}
              className="block aspect-[4/5] w-full"
            >
              <g data-layer="fx-primitives">{layer.primitives.map((primitive) => renderSvgPrimitive(primitive))}</g>

              {showSafeGuide && characterMask.enabled && characterMask.radius > 0 ? (
                <g data-testid="fx-safe-mask-guide">
                  <circle
                    cx={characterMask.cx}
                    cy={characterMask.cy}
                    r={characterMask.radius}
                    fill="var(--color-good-soft)"
                    stroke="var(--color-good)"
                    strokeWidth={2.4}
                    strokeDasharray="10 6"
                  />
                  <ellipse
                    cx={characterMask.cx}
                    cy={characterMask.cy - characterMask.radius * 0.14}
                    rx={characterMask.radius * 0.34}
                    ry={characterMask.radius * 0.42}
                    fill="var(--color-panel)"
                    stroke="var(--color-line-strong)"
                    strokeWidth={2}
                    opacity={0.78}
                  />
                  <path
                    d={`M ${characterMask.cx - characterMask.radius * 0.56} ${characterMask.cy + characterMask.radius * 0.68} Q ${characterMask.cx} ${characterMask.cy + characterMask.radius * 0.24} ${characterMask.cx + characterMask.radius * 0.56} ${characterMask.cy + characterMask.radius * 0.68}`}
                    fill="none"
                    stroke="var(--color-line-strong)"
                    strokeWidth={2}
                    opacity={0.72}
                  />
                </g>
              ) : null}

              {showVanishingGuide ? (
                <g data-testid="fx-vanishing-guide" stroke="var(--color-accent)" strokeWidth={2.2}>
                  <line x1={vanishingPointPx.x - 16} y1={vanishingPointPx.y} x2={vanishingPointPx.x + 16} y2={vanishingPointPx.y} />
                  <line x1={vanishingPointPx.x} y1={vanishingPointPx.y - 16} x2={vanishingPointPx.x} y2={vanishingPointPx.y + 16} />
                  <circle cx={vanishingPointPx.x} cy={vanishingPointPx.y} r={5} fill="none" />
                </g>
              ) : null}
            </svg>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FxMetricCard label={pick("벡터 요소", "Primitives")} value={`${layer.metrics.primitiveCount}`} testId="fx-primitive-count-readout" />
            <FxMetricCard
              label={pick("최소 이격 거리", "Min Clearance")}
              value={layer.maskAudit.maskEnabled ? `${layer.maskAudit.minClearancePx.toFixed(1)}px` : "—"}
              testId="fx-clearance-readout"
              toneClass="text-good"
            />
            <FxMetricCard
              label={pick("SVG 크기", "SVG Size")}
              value={`${(exportedSvg.length / 1024).toFixed(1)} KB`}
              testId="fx-svg-size-readout"
            />
            <FxMetricCard label={pick("결정 시드", "Seed")} value={`#${seed}`} testId="fx-seed-readout" />
          </div>
        </div>

        <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-card p-4 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="h-4 w-4 text-accent" aria-hidden="true" />
              <h3 className="text-xs font-bold text-fg">{pick("파라미터 정밀 제어", "Parametric Controls")}</h3>
            </div>
            <button
              type="button"
              data-testid="fx-mask-toggle-btn"
              aria-pressed={maskEnabled}
              onClick={() => setMaskEnabled((prev) => !prev)}
              className={maskEnabled ? BTN_ACTIVE : BTN_OUTLINE}
            >
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              {maskEnabled ? pick("얼굴 마스킹 켜짐", "Mask On") : pick("얼굴 마스킹 꺼짐", "Mask Off")}
            </button>
          </div>

          <div className="space-y-3">
            <FxRangeControl
              id={`${uid}-density`}
              testId="fx-density-slider"
              label={pick("이펙트 밀도", "Effect Density")}
              valueText={`${Math.round(density * 100)}%`}
              value={density}
              min={0.2}
              max={2.0}
              step={0.1}
              onChange={setDensity}
            />
            <FxRangeControl
              id={`${uid}-vp-x`}
              testId="fx-vp-x-slider"
              label={pick("소실점 · 중심 X 오프셋", "Vanishing Point X")}
              valueText={`${Math.round(vanishingPointX * 100)}% (${Math.round(vanishingPointPx.x)}px)`}
              value={Math.round(vanishingPointX * 100)}
              min={10}
              max={90}
              step={1}
              onChange={(pct) => setVanishingPointX(pct / 100)}
            />
            <FxRangeControl
              id={`${uid}-vp-y`}
              testId="fx-vp-y-slider"
              label={pick("소실점 · 중심 Y 오프셋", "Vanishing Point Y")}
              valueText={`${Math.round(vanishingPointY * 100)}% (${Math.round(vanishingPointPx.y)}px)`}
              value={Math.round(vanishingPointY * 100)}
              min={10}
              max={90}
              step={1}
              onChange={(pct) => setVanishingPointY(pct / 100)}
            />
            <FxRangeControl
              id={`${uid}-mask-radius`}
              testId="fx-mask-radius-slider"
              label={pick("인물 얼굴 안전 반경", "Character Face Safe Radius")}
              valueText={`${maskRadius}px`}
              value={maskRadius}
              min={0}
              max={240}
              step={5}
              disabled={!maskEnabled}
              onChange={setMaskRadius}
            />
            <FxRangeControl
              id={`${uid}-angle`}
              testId="fx-angle-slider"
              label={pick("방향 각도 · 회전", "Direction / Rotation Angle")}
              valueText={`${angleDeg}°`}
              value={angleDeg}
              min={-180}
              max={180}
              step={5}
              onChange={setAngleDeg}
            />
            <FxRangeControl
              id={`${uid}-intensity`}
              testId="fx-intensity-slider"
              label={pick("이펙트 강도 · 테이퍼 스케일", "Effect Energy / Taper Scale")}
              valueText={`${intensity.toFixed(2)}x`}
              value={intensity}
              min={0.4}
              max={1.8}
              step={0.05}
              onChange={setIntensity}
            />
          </div>

          <div className="space-y-1.5 border-t border-line pt-3">
            <div className="text-[11px] font-semibold text-fg-3">
              {pick("빠른 소실점 구도 앵커", "Quick Composition Anchors")}
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {VP_QUICK_ANCHORS.map((anchor) => {
                const isSelected =
                  Math.abs(vanishingPointX - anchor.x) < 0.02 && Math.abs(vanishingPointY - anchor.y) < 0.02;
                return (
                  <button
                    key={anchor.id}
                    type="button"
                    data-testid={`fx-anchor-${anchor.id}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setVanishingPointX(anchor.x);
                      setVanishingPointY(anchor.y);
                    }}
                    className={isSelected ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {pick(anchor.labelKo, anchor.labelEn)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2.5 border-t border-line pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-fg">
                <Code2 className="h-4 w-4 text-accent" aria-hidden="true" />
                {pick("순수 SVG 내보내기", "Pure SVG Export")}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  data-testid="fx-export-guides-toggle"
                  aria-pressed={includeGuidesInExport}
                  onClick={() => setIncludeGuidesInExport((prev) => !prev)}
                  className={includeGuidesInExport ? BTN_ACTIVE : BTN_OUTLINE}
                >
                  {pick("가이드 포함", "With Guides")}
                </button>
                <button
                  type="button"
                  data-testid="fx-toggle-svg-preview-btn"
                  aria-expanded={showSvgCode}
                  onClick={() => setShowSvgCode((prev) => !prev)}
                  className={BTN_OUTLINE}
                >
                  {showSvgCode ? pick("코드 접기", "Hide Code") : pick("코드 펼치기", "Show Code")}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button type="button" data-testid="fx-copy-svg-btn" onClick={handleCopySvg} className={BTN_SOLID}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("SVG 코드 복사", "Copy SVG")}
              </button>
              <button type="button" data-testid="fx-download-svg-btn" onClick={handleDownloadSvg} className={BTN_OUTLINE}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                {pick("SVG 파일 저장", "Save SVG")}
              </button>
            </div>

            {showSvgCode ? (
              <pre
                data-testid="fx-svg-code-preview"
                className="max-h-40 overflow-auto rounded-lg border border-line bg-canvas p-2.5 font-mono text-[11px] leading-relaxed text-fg-2 tabular-nums"
              >
                {exportedSvg}
              </pre>
            ) : null}
          </div>
        </div>
      </div>

      {statusMessage ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="fx-status-banner"
          className="rounded-lg border border-line bg-raised px-3.5 py-2 text-xs font-medium text-fg-2"
        >
          {statusMessage}
        </div>
      ) : null}
    </section>
  );
}
