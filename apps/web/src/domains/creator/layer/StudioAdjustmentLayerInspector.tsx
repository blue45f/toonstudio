/**
 * StudioAdjustmentLayerInspector.tsx
 *
 * 톤 커브 · 레벨 · 색조/채도 · OKLab 그라데이션 맵 1급 스택형 비파괴 조정 레이어 UI.
 * - 동적 `import()`(`React.lazy`)에 적합하게 독립 모듈로 설계(초기 정적 번들 비유입).
 * - `studio-adjustment-layer.ts`, `drawing/studio-gradient-map.ts`,
 *   `export/studio-psd-adjustment-export.ts` 계약을 직접 연결한다.
 */
import {
  ArrowDown,
  ArrowUp,
  CornerDownRight,
  Download,
  Eye,
  EyeOff,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import {
  STUDIO_ALL_GRADIENT_MAP_PRESETS,
  type StudioGradientInterpolationSpace,
  type StudioGradientStop,
} from "../drawing/studio-gradient-map";
import {
  encodeGradientStopsForPsdParameter,
  serializeAdjustmentStackToPsdDescriptors,
  type StudioPsdAdjustmentStackExportBundle,
} from "../export/studio-psd-adjustment-export";
import type { StudioAdjustmentKind } from "../filter/studio-adjustment-effect-graph";
import {
  ADJUSTMENT_LAYER_BLEND_MODES,
  STUDIO_ADJUSTMENT_KIND_LABELS,
  defaultAdjustmentLayerName,
  type StudioAdjustmentLayerSpec,
} from "./studio-adjustment-layer";

import type { ReactElement } from "react";

import { cn } from "@/shared/lib/utils";

export type PrimaryAdjustmentLayerKind = "curves" | "levels" | "hsl" | "gradient-map";

export interface StudioAdjustmentLayerInspectorProps {
  readonly layers: readonly StudioAdjustmentLayerSpec[];
  readonly selectedLayerId?: string | null;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onSelectLayer?: (layerId: string) => void;
  readonly onAddLayer: (layer: StudioAdjustmentLayerSpec) => void;
  readonly onUpdateLayer: (layerId: string, next: StudioAdjustmentLayerSpec) => void;
  readonly onRemoveLayer: (layerId: string) => void;
  readonly onMoveLayer?: (layerId: string, direction: "up" | "down") => void;
  readonly onExportPsdDescriptors?: (bundle: StudioPsdAdjustmentStackExportBundle) => void;
}

type ToneChannelKey = "rgb" | "red" | "green" | "blue";

const PRIMARY_KINDS: readonly { readonly kind: PrimaryAdjustmentLayerKind; readonly shortLabel: string }[] = [
  { kind: "curves", shortLabel: "톤 커브" },
  { kind: "levels", shortLabel: "레벨" },
  { kind: "hsl", shortLabel: "색조/채도" },
  { kind: "gradient-map", shortLabel: "그라데이션 맵" },
];

const TONE_CHANNELS: readonly { readonly key: ToneChannelKey; readonly label: string }[] = [
  { key: "rgb", label: "RGB" },
  { key: "red", label: "빨강" },
  { key: "green", label: "초록" },
  { key: "blue", label: "파랑" },
];

const CURVE_PRESETS: readonly { readonly id: string; readonly label: string; readonly points: readonly number[] }[] = [
  { id: "linear", label: "직선", points: [0, 0, 128, 128, 255, 255] },
  { id: "s-contrast", label: "S-커브 대비", points: [0, 0, 64, 48, 192, 210, 255, 255] },
  { id: "matte-fade", label: "필름 페이드", points: [0, 22, 128, 134, 255, 240] },
  { id: "backlight-lift", label: "역광 리프트", points: [0, 8, 96, 126, 255, 255] },
];

const BTN =
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 motion-reduce:transition-none motion-reduce:transform-none enabled:active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45";

function readNum(params: StudioAdjustmentLayerSpec["parameters"], key: string, fallback: number): number {
  const v = params[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function readCurvePoints(params: StudioAdjustmentLayerSpec["parameters"], channel: ToneChannelKey): readonly number[] {
  const raw = params[`${channel}Points`];
  return Array.isArray(raw) && raw.length >= 4 ? raw : [0, 0, 128, 128, 255, 255];
}

function createInitialParametersForKind(kind: PrimaryAdjustmentLayerKind): StudioAdjustmentLayerSpec["parameters"] {
  if (kind === "curves") return { rgbPoints: [0, 0, 128, 128, 255, 255] };
  if (kind === "levels") {
    return { rgbShadowInput: 0, rgbMidtoneInput: 1, rgbHighlightInput: 255, rgbShadowOutput: 0, rgbHighlightOutput: 255 };
  }
  if (kind === "hsl") return { hue: 0, saturation: 0, lightness: 0 };
  const sunset = STUDIO_ALL_GRADIENT_MAP_PRESETS[0]!;
  return {
    stops: encodeGradientStopsForPsdParameter(sunset.stops),
    interpolationSpace: "oklab",
    presetId: sunset.id,
    reverse: false,
    dither: true,
  };
}

function srgbToLinear(byte: number): number {
  const u = Math.min(255, Math.max(0, byte)) / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}

function rgbBytesToOklchCss(rgb: readonly [number, number, number]): string {
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = Math.min(1, Math.max(0, 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s));
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bCh = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(a, bCh);
  const H = ((Math.atan2(bCh, a) * 180) / Math.PI + 360) % 360;
  return `oklch(${(L * 100).toFixed(1)}% ${C.toFixed(4)} ${H.toFixed(1)})`;
}

function buildOklchGradientCss(stops: readonly StudioGradientStop[], reverse: boolean): string {
  const ordered = [...stops].sort((a, b) => a.position - b.position);
  const items = ordered.map((stop) => {
    const pos = reverse ? 1 - stop.position : stop.position;
    return `${rgbBytesToOklchCss(stop.color)} ${(pos * 100).toFixed(1)}%`;
  });
  if (reverse) items.reverse();
  return `linear-gradient(90deg, ${items.join(", ")})`;
}

function buildCurveSvgPolyline(flatPoints: readonly number[]): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < flatPoints.length; i += 2) {
    pts.push(`${((flatPoints[i]! / 255) * 200).toFixed(1)},${(100 - (flatPoints[i + 1]! / 255) * 100).toFixed(1)}`);
  }
  return pts.join(" ");
}

function resolveAdjustmentLabel(kind: StudioAdjustmentKind): string {
  return STUDIO_ADJUSTMENT_KIND_LABELS[kind] ?? kind;
}

interface SliderRowProps {
  readonly label: string;
  readonly ariaLabel: string;
  readonly valueText: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly disabled: boolean;
  readonly onChange: (next: number) => void;
}

function AdjustmentSliderRow({
  label,
  ariaLabel,
  valueText,
  value,
  min,
  max,
  step = 1,
  disabled,
  onChange,
}: SliderRowProps): ReactElement {
  return (
    <label className="flex flex-col gap-1 rounded-lg border border-line/70 bg-raised px-2.5 py-1.5">
      <div className="flex justify-between text-xs">
        <span className="text-fg-2">{label}</span>
        <span className="font-semibold tabular-nums text-fg">{valueText}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full accent-accent"
      />
    </label>
  );
}

interface ChannelTabsProps {
  readonly ariaLabel: string;
  readonly value: ToneChannelKey;
  readonly disabled: boolean;
  readonly onSelect: (ch: ToneChannelKey) => void;
}

function ToneChannelTabs({ ariaLabel, value, disabled, onSelect }: ChannelTabsProps): ReactElement {
  return (
    <div role="tablist" aria-label={ariaLabel} className="grid grid-cols-4 gap-1 rounded-xl border border-line bg-raised p-1">
      {TONE_CHANNELS.map((ch) => (
        <button
          key={ch.key}
          type="button"
          role="tab"
          aria-selected={value === ch.key}
          disabled={disabled}
          onClick={() => onSelect(ch.key)}
          className={cn(
            BTN,
            "px-1.5",
            value === ch.key
              ? "border-accent bg-accent text-on-accent"
              : "border-transparent bg-transparent text-fg-2 hover:bg-card hover:text-fg",
          )}
        >
          {ch.label}
        </button>
      ))}
    </div>
  );
}

export function StudioAdjustmentLayerInspector({
  layers,
  selectedLayerId = null,
  disabled = false,
  className,
  onSelectLayer,
  onAddLayer,
  onUpdateLayer,
  onRemoveLayer,
  onMoveLayer,
  onExportPsdDescriptors,
}: StudioAdjustmentLayerInspectorProps): ReactElement {
  const [toneChannel, setToneChannel] = useState<ToneChannelKey>("rgb");
  const [nextIndex, setNextIndex] = useState(1);

  const activeLayer = layers.find((layer) => layer.id === selectedLayerId) ?? layers[layers.length - 1] ?? null;
  const psdBundle = serializeAdjustmentStackToPsdDescriptors(layers);

  const handleCreateLayer = (kind: PrimaryAdjustmentLayerKind): void => {
    const id = `adj-${kind}-${nextIndex}`;
    setNextIndex((prev) => prev + 1);
    onAddLayer({
      id,
      name: defaultAdjustmentLayerName(kind),
      adjustment: kind,
      parameters: createInitialParametersForKind(kind),
      enabled: true,
      opacity: 1,
      blendMode: "source-over",
      clipToBelow: false,
    });
    onSelectLayer?.(id);
  };

  const patchActive = (patch: Partial<StudioAdjustmentLayerSpec>): void => {
    if (activeLayer) onUpdateLayer(activeLayer.id, { ...activeLayer, ...patch });
  };

  const patchActiveParams = (
    updates: Readonly<Record<string, number | string | boolean | readonly number[]>>,
  ): void => {
    if (activeLayer) {
      onUpdateLayer(activeLayer.id, { ...activeLayer, parameters: { ...activeLayer.parameters, ...updates } });
    }
  };

  const renderActiveEditor = (layer: StudioAdjustmentLayerSpec): ReactElement | null => {
    if (layer.adjustment === "curves") {
      const flat = readCurvePoints(layer.parameters, toneChannel);
      const midIdx = Math.floor(flat.length / 4) * 2;
      const midIn = flat[midIdx] ?? 128;
      const midOut = flat[midIdx + 1] ?? 128;
      const shadowOut = flat[1] ?? 0;
      const highlightOut = flat[flat.length - 1] ?? 255;
      const setTriplet = (sOut: number, mOut: number, hOut: number): void =>
        patchActiveParams({ [`${toneChannel}Points`]: [0, sOut, midIn, mOut, 255, hOut] });

      return (
        <div className="space-y-2">
          <ToneChannelTabs ariaLabel="톤 커브 채널" value={toneChannel} disabled={disabled} onSelect={setToneChannel} />
          <svg viewBox="0 0 200 100" aria-hidden="true" className="h-24 w-full rounded-lg border border-line bg-raised">
            <line x1="0" y1="100" x2="200" y2="0" className="stroke-line" strokeDasharray="3 3" strokeWidth="1" />
            <polyline fill="none" points={buildCurveSvgPolyline(flat)} className="stroke-accent" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="톤 커브 프리셋">
            {CURVE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                onClick={() => patchActiveParams({ [`${toneChannel}Points`]: [...preset.points] })}
                className={cn(BTN, "border-line bg-raised text-fg-2 hover:border-accent hover:text-fg")}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <AdjustmentSliderRow label="암부 출력" ariaLabel="톤 커브 암부 출력" valueText={String(shadowOut)} value={shadowOut} min={0} max={255} disabled={disabled} onChange={(v) => setTriplet(v, midOut, highlightOut)} />
          <AdjustmentSliderRow label="중간톤 출력" ariaLabel="톤 커브 중간톤 출력" valueText={String(midOut)} value={midOut} min={0} max={255} disabled={disabled} onChange={(v) => setTriplet(shadowOut, v, highlightOut)} />
          <AdjustmentSliderRow label="명부 출력" ariaLabel="톤 커브 명부 출력" valueText={String(highlightOut)} value={highlightOut} min={0} max={255} disabled={disabled} onChange={(v) => setTriplet(shadowOut, midOut, v)} />
        </div>
      );
    }

    if (layer.adjustment === "levels") {
      const shadowIn = readNum(layer.parameters, `${toneChannel}ShadowInput`, 0);
      const gamma = readNum(layer.parameters, `${toneChannel}MidtoneInput`, 1);
      const highlightIn = readNum(layer.parameters, `${toneChannel}HighlightInput`, 255);
      const shadowOut = readNum(layer.parameters, `${toneChannel}ShadowOutput`, 0);
      const highlightOut = readNum(layer.parameters, `${toneChannel}HighlightOutput`, 255);
      return (
        <div className="space-y-2">
          <ToneChannelTabs ariaLabel="레벨 채널" value={toneChannel} disabled={disabled} onSelect={setToneChannel} />
          <AdjustmentSliderRow label="입력 어둠점" ariaLabel="레벨 입력 어둠점" valueText={String(shadowIn)} value={shadowIn} min={0} max={Math.max(0, highlightIn - 1)} disabled={disabled} onChange={(v) => patchActiveParams({ [`${toneChannel}ShadowInput`]: v })} />
          <AdjustmentSliderRow label="중간톤 감마" ariaLabel="레벨 중간톤 감마" valueText={gamma.toFixed(2)} value={gamma} min={0.1} max={4} step={0.05} disabled={disabled} onChange={(v) => patchActiveParams({ [`${toneChannel}MidtoneInput`]: v })} />
          <AdjustmentSliderRow label="입력 밝기점" ariaLabel="레벨 입력 밝기점" valueText={String(highlightIn)} value={highlightIn} min={Math.min(255, shadowIn + 1)} max={255} disabled={disabled} onChange={(v) => patchActiveParams({ [`${toneChannel}HighlightInput`]: v })} />
          <div className="grid grid-cols-2 gap-1.5">
            <AdjustmentSliderRow label="출력 하한" ariaLabel="레벨 출력 하한" valueText={String(shadowOut)} value={shadowOut} min={0} max={255} disabled={disabled} onChange={(v) => patchActiveParams({ [`${toneChannel}ShadowOutput`]: v })} />
            <AdjustmentSliderRow label="출력 상한" ariaLabel="레벨 출력 상한" valueText={String(highlightOut)} value={highlightOut} min={0} max={255} disabled={disabled} onChange={(v) => patchActiveParams({ [`${toneChannel}HighlightOutput`]: v })} />
          </div>
        </div>
      );
    }

    if (layer.adjustment === "hsl") {
      const hue = readNum(layer.parameters, "hue", 0);
      const saturation = readNum(layer.parameters, "saturation", 0);
      const lightness = readNum(layer.parameters, "lightness", 0);
      return (
        <div className="space-y-2">
          <AdjustmentSliderRow label="색조" ariaLabel="색조 이동" valueText={`${hue}°`} value={hue} min={-180} max={180} disabled={disabled} onChange={(v) => patchActiveParams({ hue: v })} />
          <AdjustmentSliderRow label="채도" ariaLabel="채도 조절" valueText={String(saturation)} value={saturation} min={-100} max={100} disabled={disabled} onChange={(v) => patchActiveParams({ saturation: v })} />
          <AdjustmentSliderRow label="명도" ariaLabel="명도 조절" valueText={String(lightness)} value={lightness} min={-100} max={100} disabled={disabled} onChange={(v) => patchActiveParams({ lightness: v })} />
        </div>
      );
    }

    if (layer.adjustment === "gradient-map") {
      const space: StudioGradientInterpolationSpace = layer.parameters.interpolationSpace === "srgb" ? "srgb" : "oklab";
      const reverse = layer.parameters.reverse === true;
      const dither = layer.parameters.dither !== false;
      const presetId = typeof layer.parameters.presetId === "string" ? layer.parameters.presetId : "sunset";
      const activePreset = STUDIO_ALL_GRADIENT_MAP_PRESETS.find((p) => p.id === presetId) ?? STUDIO_ALL_GRADIENT_MAP_PRESETS[0]!;
      return (
        <div className="space-y-2">
          <div aria-label="그라데이션 맵 미리보기" className="h-7 w-full rounded-lg border border-line [forced-color-adjust:none]" style={{ backgroundImage: buildOklchGradientCss(activePreset.stops, reverse) }} />
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="색공간 보간 모드">
            {(["oklab", "srgb"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={space === mode}
                disabled={disabled}
                onClick={() => patchActiveParams({ interpolationSpace: mode })}
                className={cn(BTN, space === mode ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:text-fg")}
              >
                {mode === "oklab" ? "OKLab 지각 균일" : "sRGB 선형"}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="그라데이션 맵 프리셋">
            {STUDIO_ALL_GRADIENT_MAP_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                aria-pressed={activePreset.id === preset.id}
                disabled={disabled}
                onClick={() => patchActiveParams({ presetId: preset.id, stops: encodeGradientStopsForPsdParameter(preset.stops) })}
                className={cn(BTN, "justify-start px-2.5 text-left", activePreset.id === preset.id ? "border-accent bg-accent text-on-accent" : "border-line bg-raised text-fg-2 hover:border-accent hover:text-fg")}
              >
                {preset.labelKo}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised px-2.5 text-xs text-fg-2">
              <span>순서 반전</span>
              <input type="checkbox" checked={reverse} disabled={disabled} onChange={(e) => patchActiveParams({ reverse: e.target.checked })} className="size-4 accent-accent" />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised px-2.5 text-xs text-fg-2">
              <span>디더링</span>
              <input type="checkbox" checked={dither} disabled={disabled} onChange={(e) => patchActiveParams({ dither: e.target.checked })} className="size-4 accent-accent" />
            </label>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <section
      aria-label="비파괴 조정 레이어 스택"
      data-testid="studio-adjustment-layer-inspector"
      className={cn("space-y-3 rounded-2xl border border-line bg-panel p-3 text-fg [word-break:keep-all]", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Layers className="size-4 shrink-0 text-accent" aria-hidden="true" />
            <h3 className="text-sm font-bold text-fg">비파괴 조정 레이어</h3>
          </div>
          <p className="mt-0.5 text-xs text-fg-2">원본 픽셀을 건드리지 않고 색감과 명암을 쌓아 올립니다.</p>
        </div>
        <span className="shrink-0 rounded-md border border-line bg-raised px-2 py-1 text-xs font-semibold tabular-nums text-fg-2">
          {layers.length}개
        </span>
      </div>

      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="새 조정 레이어 추가">
        {PRIMARY_KINDS.map((item) => (
          <button
            key={item.kind}
            type="button"
            disabled={disabled}
            onClick={() => handleCreateLayer(item.kind)}
            className={cn(BTN, "justify-start border-line bg-card text-fg hover:border-accent hover:bg-raised")}
          >
            <Plus className="size-3.5 shrink-0 text-accent" aria-hidden="true" />
            <span>{item.shortLabel} 추가</span>
          </button>
        ))}
      </div>

      {layers.length === 0 ? (
        <p className="rounded-xl border border-line bg-card px-3 py-4 text-center text-xs text-fg-2">
          위 버튼으로 톤 커브·레벨·색조/채도·OKLab 그라데이션 맵 레이어를 추가하세요.
        </p>
      ) : (
        <ul aria-label="조정 레이어 목록" className="space-y-1.5">
          {[...layers].reverse().map((layer, revIdx) => {
            const stackIdx = layers.length - 1 - revIdx;
            const selected = activeLayer?.id === layer.id;
            return (
              <li key={layer.id} className={cn("flex items-center gap-1.5 rounded-xl border p-1.5", selected ? "border-accent bg-card" : "border-line bg-raised")}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${layer.name} ${layer.enabled ? "숨기기" : "보이기"}`}
                  aria-pressed={layer.enabled}
                  onClick={() => onUpdateLayer(layer.id, { ...layer, enabled: !layer.enabled })}
                  className={cn(BTN, "min-w-11 border-transparent bg-transparent px-0 text-fg-2 hover:text-fg")}
                >
                  {layer.enabled ? <Eye className="size-4" aria-hidden="true" /> : <EyeOff className="size-4" aria-hidden="true" />}
                </button>

                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onSelectLayer?.(layer.id)}
                  className="flex min-h-11 min-w-0 flex-1 flex-col items-start justify-center rounded-lg px-1.5 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="flex items-center gap-1 truncate text-xs font-semibold text-fg">
                    {layer.clipToBelow ? <CornerDownRight className="size-3.5 shrink-0 text-accent" aria-hidden="true" /> : null}
                    <span className="truncate">{layer.name}</span>
                  </span>
                  <span className="text-[0.6875rem] tabular-nums text-fg-2">
                    {resolveAdjustmentLabel(layer.adjustment)} · {Math.round(layer.opacity * 100)}%
                  </span>
                </button>

                {onMoveLayer ? (
                  <div className="flex items-center gap-0.5">
                    <button type="button" disabled={disabled || stackIdx >= layers.length - 1} aria-label={`${layer.name} 위로 이동`} onClick={() => onMoveLayer(layer.id, "up")} className={cn(BTN, "min-w-11 border-transparent bg-transparent px-0 text-fg-2 hover:text-fg")}>
                      <ArrowUp className="size-3.5" aria-hidden="true" />
                    </button>
                    <button type="button" disabled={disabled || stackIdx <= 0} aria-label={`${layer.name} 아래로 이동`} onClick={() => onMoveLayer(layer.id, "down")} className={cn(BTN, "min-w-11 border-transparent bg-transparent px-0 text-fg-2 hover:text-fg")}>
                      <ArrowDown className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                ) : null}

                <button type="button" disabled={disabled} aria-label={`${layer.name} 삭제`} onClick={() => onRemoveLayer(layer.id)} className={cn(BTN, "min-w-11 border-transparent bg-transparent px-0 text-fg-2 hover:text-fg")}>
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {activeLayer ? (
        <div className="space-y-3 rounded-xl border border-line bg-card p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-fg">{activeLayer.name} 설정</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                const kind = activeLayer.adjustment;
                if (kind === "curves" || kind === "levels" || kind === "hsl" || kind === "gradient-map") {
                  patchActive({ parameters: createInitialParametersForKind(kind) });
                }
              }}
              className={cn(BTN, "border-line bg-raised text-fg-2 hover:text-fg")}
            >
              <RotateCcw className="size-3.5" aria-hidden="true" />
              초기화
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-1 rounded-lg border border-line/70 bg-raised px-2 py-1.5">
              <span className="text-[0.6875rem] text-fg-2">합성 모드</span>
              <select
                disabled={disabled}
                aria-label="조정 레이어 합성 모드"
                value={activeLayer.blendMode}
                onChange={(e) => patchActive({ blendMode: e.target.value })}
                className="min-h-8 rounded bg-card px-1.5 text-xs text-fg"
              >
                {ADJUSTMENT_LAYER_BLEND_MODES.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </label>
            <AdjustmentSliderRow
              label="불투명도"
              ariaLabel="조정 레이어 불투명도"
              valueText={`${Math.round(activeLayer.opacity * 100)}%`}
              value={Math.round(activeLayer.opacity * 100)}
              min={0}
              max={100}
              disabled={disabled}
              onChange={(v) => patchActive({ opacity: v / 100 })}
            />
          </div>

          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-lg border border-line/70 bg-raised px-2.5 text-xs text-fg-2">
            <span>바로 아래 레이어에만 클리핑</span>
            <input type="checkbox" checked={activeLayer.clipToBelow} disabled={disabled} onChange={(e) => patchActive({ clipToBelow: e.target.checked })} className="size-4 accent-accent" />
          </label>

          {renderActiveEditor(activeLayer)}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-card px-2.5 py-2">
        <p role="status" aria-live="polite" className="text-[0.6875rem] tabular-nums text-fg-2">
          PSD 비파괴 유지 {psdBundle.stats.exportedCount}/{psdBundle.stats.total}
          {psdBundle.stats.oklabResampledCount > 0 ? ` · OKLab 보정 ${psdBundle.stats.oklabResampledCount}` : ""}
        </p>
        {onExportPsdDescriptors ? (
          <button
            type="button"
            disabled={disabled || layers.length === 0}
            onClick={() => onExportPsdDescriptors(psdBundle)}
            className={cn(BTN, "border-accent bg-accent text-on-accent")}
          >
            <Download className="size-3.5" aria-hidden="true" />
            PSD 직렬화
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default StudioAdjustmentLayerInspector;
