/**
 * 초보자도 한눈에 다루는 쉬운 한국어 포토샵 프로 랩 워크벤치.
 * 5개 분할 탭(레이어 효과 · 색감 보정실 · 잡티·배경 지우기 · 스마트 필터 · 채널·일괄 작업)을 제공하며
 * StudioImageAdjustmentsPanel에서 React.lazy로 지연 마운트된다.
 */

import { Layers, Palette, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { runStudioRasterDataUrlProcessor } from "../filter/studio-raster-dataurl-runner";
import {
  applyCameraRawRgba,
  CAMERA_RAW_HSL_BAND_LIST,
  CAMERA_RAW_PRESETS,
  DEFAULT_CAMERA_RAW_SETTINGS,
  DEFAULT_PRO_CHANNEL_MIXER,
  separateColorChannels,
  WEBTOON_BATCH_ACTION_PRESETS,
} from "./photoshop-camera-raw-channels";
import {
  createDefaultLayerFxStack,
  DEFAULT_BLEND_IF_RANGE,
  PHOTOSHOP_FX_SWATCH_PALETTE,
  PHOTOSHOP_LAYER_FX_PRESETS,
  renderPhotoshopLayerFx,
  syncLayerFxGlobalLight,
} from "./photoshop-layer-fx-compositor";
import { createSmartObjectDocument, toStudioSmartFilterStack } from "./photoshop-smart-object-stack";
import {
  PhotoshopChannelBatchTabPanel,
  PhotoshopRangeRow,
  PhotoshopRetouchTabPanel,
  PhotoshopSmartFilterTabPanel,
  PhotoshopToggleChip,
} from "./PhotoshopProSecondaryTabs";

import type { El, ImageEl } from "../studio-element-model";
import type {
  ActionRecorderState,
  CameraRawHslBandId,
  CameraRawSettings,
  ChannelColorSpace,
  PresetLutId,
  ProChannelMixerConfig,
} from "./photoshop-camera-raw-channels";
import type { PhotoshopLayerFxStack } from "./photoshop-layer-fx-compositor";
import type { RgbaImageBuffer, RgbColor } from "./photoshop-pixel-math";
import type { ColorRangeMode } from "./photoshop-retouch-frequency";
import type { PhotoshopSmartObjectDocument } from "./photoshop-smart-object-stack";

import { cn } from "@/shared/lib/utils";

export interface PhotoshopProStudioWorkbenchProps {
  readonly selected: ImageEl;
  readonly onPatch: (patch: Partial<El>) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

type WorkbenchTabId = "layer-fx" | "color-lab" | "retouch" | "smart-filter" | "channel-batch";

const TRANSITION_CLS = "transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none";
const BTN_BASE = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold [word-break:keep-all] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLS,
);
const BTN_SECONDARY = cn(BTN_BASE, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg");
const BTN_PRIMARY = cn(BTN_BASE, "border-accent bg-accent text-on-accent hover:brightness-105");

const WORKBENCH_TABS: readonly { readonly id: WorkbenchTabId; readonly label: string }[] = [
  { id: "layer-fx", label: "레이어 효과" },
  { id: "color-lab", label: "색감 보정실" },
  { id: "retouch", label: "잡티·배경 지우기" },
  { id: "smart-filter", label: "스마트 필터" },
  { id: "channel-batch", label: "채널·일괄 작업" },
];

const LUT_PRESET_OPTIONS: readonly { readonly value: PresetLutId; readonly label: string }[] = [
  { value: "none", label: "원본 색감 유지" },
  { value: "webtoon-vivid", label: "웹툰 선명 색감" },
  { value: "warm-sunset", label: "따뜻한 오후 노을" },
  { value: "cool-noir", label: "차분한 밤 분위기" },
  { value: "pastel-romance", label: "포근한 파스텔" },
  { value: "vintage-film", label: "빈티지 필름 감성" },
];

function createPlaceholderSource(): RgbaImageBuffer {
  const data = new Uint8ClampedArray(16 * 16 * 4);
  for (let i = 0; i < 16 * 16; i += 1) {
    data[i * 4] = 160; data[i * 4 + 1] = 152; data[i * 4 + 2] = 176; data[i * 4 + 3] = 255;
  }
  return { width: 16, height: 16, data };
}

export function PhotoshopProStudioWorkbench({
  selected,
  onPatch,
  disabled = false,
  className,
}: PhotoshopProStudioWorkbenchProps) {
  const tabBaseId = useId();
  const lutSelectId = useId();
  const hslSelectId = useId();
  const [activeTab, setActiveTab] = useState<WorkbenchTabId>("layer-fx");
  const [busy, setBusy] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  // 탭 1: 레이어 효과
  const [fxStack, setFxStack] = useState<PhotoshopLayerFxStack>(() => createDefaultLayerFxStack());
  const [selectedSwatchId, setSelectedSwatchId] = useState<string>("ink");

  // 탭 2: 색감 보정실
  const [rawSettings, setRawSettings] = useState<CameraRawSettings>(() => DEFAULT_CAMERA_RAW_SETTINGS);
  const [activeHslBand, setActiveHslBand] = useState<CameraRawHslBandId>("red");

  // 탭 3: 잡티·배경 지우기
  const [retouchMode, setRetouchMode] = useState<"spot-heal" | "content-fill" | "skin-freq" | "color-pick" | "shape-mask">("spot-heal");
  const [retouchRadius, setRetouchRadius] = useState(12);
  const [retouchCenterPctX, setRetouchCenterPctX] = useState(50);
  const [retouchCenterPctY, setRetouchCenterPctY] = useState(50);
  const [freqSmoothRadius, setFreqSmoothRadius] = useState(3);
  const [freqTexturePct, setFreqTexturePct] = useState(100);
  const [colorRangeMode, setColorRangeMode] = useState<ColorRangeMode>("highlights");
  const [colorRangeFuzz, setColorRangeFuzz] = useState(55);
  const [maskShape, setMaskShape] = useState<"oval" | "rounded-rect" | "diamond">("oval");
  const [maskFeather, setMaskFeather] = useState(2);
  const [maskInvert, setMaskInvert] = useState(false);
  const [cloneShiftX, setCloneShiftX] = useState(16);
  const [refineShiftPx, setRefineShiftPx] = useState(0);

  // 탭 4: 스마트 필터
  const [smartDoc, setSmartDoc] = useState<PhotoshopSmartObjectDocument>(() =>
    createSmartObjectDocument({
      id: `smart-${selected.id}`, label: "현재 이미지 원본",
      source: createPlaceholderSource(), initialStack: selected.smartFilters,
    }),
  );

  // 탭 5: 채널·일괄 작업
  const [channelSpace, setChannelSpace] = useState<ChannelColorSpace>("rgb");
  const [channelMixer, setChannelMixer] = useState<ProChannelMixerConfig>(() => DEFAULT_PRO_CHANNEL_MIXER);
  const [recorder, setRecorder] = useState<ActionRecorderState>(() => ({ recording: false, steps: [] }));
  const [selectedBatchPresetId, setSelectedBatchPresetId] = useState<string>(WEBTOON_BATCH_ACTION_PRESETS[0]!.id);

  const controlsLocked = disabled || busy;
  const activeFxColor: RgbColor = useMemo(
    () => PHOTOSHOP_FX_SWATCH_PALETTE.find((s) => s.id === selectedSwatchId)?.color ?? { r: 22, g: 24, b: 34 },
    [selectedSwatchId],
  );
  const activeChannelPreview = useMemo(
    () => separateColorChannels(createPlaceholderSource(), channelSpace).channels,
    [channelSpace],
  );

  const activeFxCount = [
    fxStack.dropShadow.enabled, fxStack.innerShadow.enabled, fxStack.outerGlow.enabled,
    fxStack.innerGlow.enabled, fxStack.bevelEmboss.enabled, fxStack.satin.enabled,
    fxStack.colorOverlay.enabled, fxStack.gradientOverlay.enabled,
    fxStack.patternOverlay.enabled, fxStack.stroke.enabled, fxStack.blendIf.enabled,
  ].filter(Boolean).length;

  const runLiveRaster = async (label: string, process: (buffer: RgbaImageBuffer) => RgbaImageBuffer) => {
    if (!selected.src) {
      setStatusNote("적용할 이미지가 선택되지 않았어요.");
      return;
    }
    setBusy(true);
    setStatusNote(null);
    try {
      const nextSrc = await runStudioRasterDataUrlProcessor(selected.src, (rgba, width, height) =>
        process({ data: rgba, width, height }),
      );
      onPatch({ src: nextSrc } as Partial<El>);
      setStatusNote(`${label} 결과를 이미지에 반영했어요.`);
    } catch (err) {
      setStatusNote(err instanceof Error ? err.message : `${label} 처리 중 오류가 발생했어요.`);
    } finally {
      setBusy(false);
    }
  };

  const syncSmartStackToElement = (nextDoc: PhotoshopSmartObjectDocument, note?: string) => {
    setSmartDoc(nextDoc);
    onPatch({ smartFilters: toStudioSmartFilterStack(nextDoc) } as Partial<El>);
    if (note) setStatusNote(note);
  };

  const applySwatchToActiveFx = (color: RgbColor, swatchId: string) => {
    setSelectedSwatchId(swatchId);
    setFxStack((prev) => ({
      ...prev,
      dropShadow: { ...prev.dropShadow, color },
      outerGlow: { ...prev.outerGlow, color },
      stroke: { ...prev.stroke, color },
      colorOverlay: { ...prev.colorOverlay, color },
    }));
  };

  return (
    <section
      aria-label="포토샵 프로 랩"
      data-photoshop-pro-workbench="true"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-line bg-panel/95 p-3 text-xs text-fg [word-break:keep-all]",
        className,
      )}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-fg">포토샵 프로 랩</h3>
          <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
            전문 보정 기능을 쉬운 말로 모았어요. 먼저 프리셋을 고른 뒤 필요한 슬라이더만 다듬어 보세요.
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-line bg-card px-2 py-1 text-[0.65rem] font-semibold tabular-nums text-fg-2">
          활성 효과 {activeFxCount}개
        </span>
      </header>

      {statusNote ? (
        <p role="status" aria-label="작업 상태 안내" aria-live="polite" className="rounded-lg border border-accent/40 bg-accent-soft/35 px-2.5 py-2 text-xs text-fg">
          {statusNote}
        </p>
      ) : null}

      <div role="tablist" aria-label="포토샵 프로 작업 영역" className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {WORKBENCH_TABS.map((tab) => {
          const isSelected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${tabBaseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={isSelected}
              aria-controls={`${tabBaseId}-panel-${tab.id}`}
              disabled={controlsLocked}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                BTN_BASE, "px-2 text-[0.72rem]",
                isSelected ? "border-accent bg-accent-soft/75 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 탭 1: 레이어 효과 */}
      {activeTab === "layer-fx" ? (
        <div role="tabpanel" id={`${tabBaseId}-panel-layer-fx`} aria-labelledby={`${tabBaseId}-tab-layer-fx`} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="레이어 효과 추천 조합">
            {PHOTOSHOP_LAYER_FX_PRESETS.map((preset) => (
              <button key={preset.id} type="button" disabled={controlsLocked} title={preset.description}
                onClick={() => { setFxStack(preset.stack); setStatusNote(`‘${preset.label}’ 구성을 불러왔어요.`); }}
                className={BTN_SECONDARY}>
                <Sparkles size={13} aria-hidden />
                {preset.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="주요 레이어 효과 켜기">
            <PhotoshopToggleChip label="바깥 그림자" checked={fxStack.dropShadow.enabled} disabled={controlsLocked}
              onToggle={() => setFxStack((p) => ({ ...p, dropShadow: { ...p.dropShadow, enabled: !p.dropShadow.enabled } }))} />
            <PhotoshopToggleChip label="외곽선 테두리" checked={fxStack.stroke.enabled} disabled={controlsLocked}
              onToggle={() => setFxStack((p) => ({ ...p, stroke: { ...p.stroke, enabled: !p.stroke.enabled } }))} />
            <PhotoshopToggleChip label="바깥 빛 번짐" checked={fxStack.outerGlow.enabled} disabled={controlsLocked}
              onToggle={() => setFxStack((p) => ({ ...p, outerGlow: { ...p.outerGlow, enabled: !p.outerGlow.enabled } }))} />
            <PhotoshopToggleChip label="입체 볼록 효과" checked={fxStack.bevelEmboss.enabled} disabled={controlsLocked}
              onToggle={() => setFxStack((p) => ({ ...p, bevelEmboss: { ...p.bevelEmboss, enabled: !p.bevelEmboss.enabled } }))} />
            <PhotoshopToggleChip label="색상 덮어쓰기" checked={fxStack.colorOverlay.enabled} disabled={controlsLocked}
              onToggle={() => setFxStack((p) => ({ ...p, colorOverlay: { ...p.colorOverlay, enabled: !p.colorOverlay.enabled } }))} />
            <PhotoshopToggleChip label="밝기 조건 합성" checked={fxStack.blendIf.enabled} disabled={controlsLocked}
              onToggle={() => setFxStack((p) => ({
                ...p,
                blendIf: {
                  ...p.blendIf, enabled: !p.blendIf.enabled,
                  thisGray: p.blendIf.thisGray ?? { blackMin: 30, blackMax: 100, whiteMin: 255, whiteMax: 255 },
                },
              }))} />
          </div>

          <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="효과 대표 색상">
            {PHOTOSHOP_FX_SWATCH_PALETTE.map((swatch) => (
              <button key={swatch.id} type="button" disabled={controlsLocked} aria-pressed={selectedSwatchId === swatch.id}
                onClick={() => applySwatchToActiveFx(swatch.color, swatch.id)}
                className={cn(
                  BTN_BASE, "px-2 text-[0.68rem]",
                  selectedSwatchId === swatch.id ? "border-accent bg-accent-soft/65 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
                )}>
                {swatch.label}
              </button>
            ))}
          </div>

          <PhotoshopRangeRow label="외곽선 두께" value={fxStack.stroke.sizePx} min={1} max={16} suffix="px" disabled={controlsLocked}
            onChange={(sizePx) => setFxStack((p) => ({ ...p, stroke: { ...p.stroke, sizePx } }))} />
          <PhotoshopRangeRow label="그림자 거리" value={fxStack.dropShadow.distancePx} min={0} max={24} suffix="px" disabled={controlsLocked}
            onChange={(distancePx) => setFxStack((p) => ({ ...p, dropShadow: { ...p.dropShadow, distancePx } }))} />

          <details className="rounded-lg border border-line/75 bg-card/45 p-2">
            <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between rounded px-2 font-semibold text-fg hover:bg-raised/60", TRANSITION_CLS)}>
              <span>세부 효과 · 광원 각도 · 밝기 조건 조절</span>
              <span className="tabular-nums text-fg-3">{fxStack.globalLightAngleDeg}°</span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 px-1">
              <div className="grid grid-cols-2 gap-1.5">
                <PhotoshopToggleChip label="안쪽 그림자" checked={fxStack.innerShadow.enabled} disabled={controlsLocked}
                  onToggle={() => setFxStack((p) => ({ ...p, innerShadow: { ...p.innerShadow, enabled: !p.innerShadow.enabled } }))} />
                <PhotoshopToggleChip label="안쪽 빛 번짐" checked={fxStack.innerGlow.enabled} disabled={controlsLocked}
                  onToggle={() => setFxStack((p) => ({ ...p, innerGlow: { ...p.innerGlow, enabled: !p.innerGlow.enabled } }))} />
                <PhotoshopToggleChip label="실크 광택" checked={fxStack.satin.enabled} disabled={controlsLocked}
                  onToggle={() => setFxStack((p) => ({ ...p, satin: { ...p.satin, enabled: !p.satin.enabled } }))} />
                <PhotoshopToggleChip label="그라데이션 덮기" checked={fxStack.gradientOverlay.enabled} disabled={controlsLocked}
                  onToggle={() => setFxStack((p) => ({ ...p, gradientOverlay: { ...p.gradientOverlay, enabled: !p.gradientOverlay.enabled } }))} />
                <PhotoshopToggleChip label="무늬 패턴 덮기" checked={fxStack.patternOverlay.enabled} disabled={controlsLocked}
                  onToggle={() => setFxStack((p) => ({ ...p, patternOverlay: { ...p.patternOverlay, enabled: !p.patternOverlay.enabled } }))} />
              </div>
              <PhotoshopRangeRow label="전체 빛 각도" value={fxStack.globalLightAngleDeg} min={0} max={360} suffix="°" disabled={controlsLocked}
                onChange={(deg) => setFxStack((p) => syncLayerFxGlobalLight(p, deg))} />
              <PhotoshopRangeRow label="채우기 불투명도" value={Math.round(fxStack.fillOpacity * 100)} min={0} max={100} suffix="%" disabled={controlsLocked}
                onChange={(pct) => setFxStack((p) => ({ ...p, fillOpacity: pct / 100 }))} />
              <PhotoshopRangeRow label="어두운 부분 투명 시작" value={fxStack.blendIf.thisGray?.blackMin ?? 0} min={0} max={200} disabled={controlsLocked}
                onChange={(blackMin) => setFxStack((p) => {
                  const base = p.blendIf.thisGray ?? DEFAULT_BLEND_IF_RANGE;
                  return { ...p, blendIf: { ...p.blendIf, enabled: true, thisGray: { ...base, blackMin, blackMax: Math.max(blackMin + 30, base.blackMax) } } };
                })} />
            </div>
          </details>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={controlsLocked}
              onClick={() => { setFxStack(createDefaultLayerFxStack()); setStatusNote("레이어 효과를 초기화했어요."); }}
              className={BTN_SECONDARY}>
              <RotateCcw size={13} aria-hidden />
              초기화
            </button>
            <button type="button" disabled={controlsLocked}
              onClick={() => void runLiveRaster("레이어 효과", (buf) => renderPhotoshopLayerFx(buf, fxStack))}
              className={BTN_PRIMARY}>
              <Layers size={13} aria-hidden />
              레이어 효과 적용
            </button>
          </div>
        </div>
      ) : null}

      {/* 탭 2: 색감 보정실 */}
      {activeTab === "color-lab" ? (
        <div role="tabpanel" id={`${tabBaseId}-panel-color-lab`} aria-labelledby={`${tabBaseId}-tab-color-lab`} className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="분위기 색감 프리셋">
            {CAMERA_RAW_PRESETS.map((preset) => (
              <button key={preset.id} type="button" disabled={controlsLocked} title={preset.description}
                onClick={() => { setRawSettings({ ...DEFAULT_CAMERA_RAW_SETTINGS, ...preset.patch }); setStatusNote(`‘${preset.label}’ 보정값을 불러왔어요.`); }}
                className={BTN_SECONDARY}>
                <Palette size={13} aria-hidden />
                {preset.label}
              </button>
            ))}
          </div>

          <PhotoshopRangeRow label="색온도 (차가움↔따뜻함)" value={rawSettings.temperature} min={-100} max={100} disabled={controlsLocked}
            onChange={(temperature) => setRawSettings((p) => ({ ...p, temperature }))} />
          <PhotoshopRangeRow label="전체 밝기 (노출)" value={rawSettings.exposure} min={-2} max={2} step={0.1} disabled={controlsLocked}
            onChange={(exposure) => setRawSettings((p) => ({ ...p, exposure }))} />
          <PhotoshopRangeRow label="명암 대비" value={rawSettings.contrast} min={-100} max={100} disabled={controlsLocked}
            onChange={(contrast) => setRawSettings((p) => ({ ...p, contrast }))} />
          <PhotoshopRangeRow label="어두운 곳 살리기" value={rawSettings.shadows} min={-100} max={100} disabled={controlsLocked}
            onChange={(shadows) => setRawSettings((p) => ({ ...p, shadows }))} />
          <PhotoshopRangeRow label="색감 생기 (활기)" value={rawSettings.vibrance} min={-100} max={100} disabled={controlsLocked}
            onChange={(vibrance) => setRawSettings((p) => ({ ...p, vibrance }))} />

          <div className="flex flex-col gap-1">
            <label htmlFor={lutSelectId} className="text-xs font-medium text-fg-2">분위기 색감표</label>
            <select id={lutSelectId} disabled={controlsLocked} value={rawSettings.lutPresetId}
              onChange={(e) => setRawSettings((p) => ({ ...p, lutPresetId: e.target.value as PresetLutId }))}
              className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg">
              {LUT_PRESET_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>

          <details className="rounded-lg border border-line/75 bg-card/45 p-2">
            <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between rounded px-2 font-semibold text-fg hover:bg-raised/60", TRANSITION_CLS)}>
              <span>세부 톤 · 8가지 색별 조절 · 필름 입자</span>
              <span className="tabular-nums text-fg-3">명료도 {rawSettings.clarity}</span>
            </summary>
            <div className="mt-2 flex flex-col gap-2 px-1">
              <PhotoshopRangeRow label="밝은 곳 누르기" value={rawSettings.highlights} min={-100} max={100} disabled={controlsLocked}
                onChange={(highlights) => setRawSettings((p) => ({ ...p, highlights }))} />
              <PhotoshopRangeRow label="색 치우침 (초록↔자주)" value={rawSettings.tint} min={-100} max={100} disabled={controlsLocked}
                onChange={(tint) => setRawSettings((p) => ({ ...p, tint }))} />
              <PhotoshopRangeRow label="질감 또렷함 (명료도)" value={rawSettings.clarity} min={-100} max={100} disabled={controlsLocked}
                onChange={(clarity) => setRawSettings((p) => ({ ...p, clarity }))} />
              <PhotoshopRangeRow label="뿌연 안개 걷기" value={rawSettings.dehaze} min={-100} max={100} disabled={controlsLocked}
                onChange={(dehaze) => setRawSettings((p) => ({ ...p, dehaze }))} />
              <PhotoshopRangeRow label="주변부 어둡게 (비네팅)" value={rawSettings.vignette} min={-100} max={100} disabled={controlsLocked}
                onChange={(vignette) => setRawSettings((p) => ({ ...p, vignette }))} />
              <PhotoshopRangeRow label="필름 입자 감성" value={rawSettings.grainAmount} min={0} max={100} suffix="%" disabled={controlsLocked}
                onChange={(grainAmount) => setRawSettings((p) => ({ ...p, grainAmount }))} />

              <div className="flex flex-col gap-1 border-t border-line/60 pt-2">
                <label htmlFor={hslSelectId} className="text-xs font-medium text-fg-2">특정 색만 따로 조절</label>
                <select id={hslSelectId} disabled={controlsLocked} value={activeHslBand}
                  onChange={(e) => setActiveHslBand(e.target.value as CameraRawHslBandId)}
                  className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg">
                  {CAMERA_RAW_HSL_BAND_LIST.map((band) => <option key={band.id} value={band.id}>{band.label} 계열</option>)}
                </select>
                <PhotoshopRangeRow label="선택 색 채도" value={rawSettings.hsl[activeHslBand].saturation} min={-100} max={100} disabled={controlsLocked}
                  onChange={(saturation) => setRawSettings((p) => ({
                    ...p, hsl: { ...p.hsl, [activeHslBand]: { ...p.hsl[activeHslBand], saturation } },
                  }))} />
                <PhotoshopRangeRow label="선택 색 밝기" value={rawSettings.hsl[activeHslBand].luminance} min={-100} max={100} disabled={controlsLocked}
                  onChange={(luminance) => setRawSettings((p) => ({
                    ...p, hsl: { ...p.hsl, [activeHslBand]: { ...p.hsl[activeHslBand], luminance } },
                  }))} />
              </div>
            </div>
          </details>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={controlsLocked}
              onClick={() => { setRawSettings(DEFAULT_CAMERA_RAW_SETTINGS); setStatusNote("색감 보정값을 초기화했어요."); }}
              className={BTN_SECONDARY}>
              <RotateCcw size={13} aria-hidden />
              초기화
            </button>
            <button type="button" disabled={controlsLocked}
              onClick={() => void runLiveRaster("색감 보정", (buf) => applyCameraRawRgba(buf, rawSettings))}
              className={BTN_PRIMARY}>
              <SlidersHorizontal size={13} aria-hidden />
              색감 보정 적용
            </button>
          </div>
        </div>
      ) : null}

      {/* 탭 3, 4, 5 */}
      {activeTab === "retouch" ? (
        <PhotoshopRetouchTabPanel
          panelId={`${tabBaseId}-panel-retouch`} labelledBy={`${tabBaseId}-tab-retouch`}
          controlsLocked={controlsLocked} activeFxColor={activeFxColor}
          retouchMode={retouchMode} setRetouchMode={setRetouchMode}
          retouchRadius={retouchRadius} setRetouchRadius={setRetouchRadius}
          retouchCenterPctX={retouchCenterPctX} setRetouchCenterPctX={setRetouchCenterPctX}
          retouchCenterPctY={retouchCenterPctY} setRetouchCenterPctY={setRetouchCenterPctY}
          freqSmoothRadius={freqSmoothRadius} setFreqSmoothRadius={setFreqSmoothRadius}
          freqTexturePct={freqTexturePct} setFreqTexturePct={setFreqTexturePct}
          colorRangeMode={colorRangeMode} setColorRangeMode={setColorRangeMode}
          colorRangeFuzz={colorRangeFuzz} setColorRangeFuzz={setColorRangeFuzz}
          maskShape={maskShape} setMaskShape={setMaskShape}
          maskFeather={maskFeather} setMaskFeather={setMaskFeather}
          maskInvert={maskInvert} setMaskInvert={setMaskInvert}
          cloneShiftX={cloneShiftX} setCloneShiftX={setCloneShiftX}
          refineShiftPx={refineShiftPx} setRefineShiftPx={setRefineShiftPx}
          runLiveRaster={runLiveRaster}
        />
      ) : null}

      {activeTab === "smart-filter" ? (
        <PhotoshopSmartFilterTabPanel
          panelId={`${tabBaseId}-panel-smart-filter`} labelledBy={`${tabBaseId}-tab-smart-filter`}
          tabBaseId={tabBaseId} controlsLocked={controlsLocked}
          smartDoc={smartDoc} setSmartDoc={setSmartDoc}
          syncSmartStackToElement={syncSmartStackToElement} runLiveRaster={runLiveRaster}
        />
      ) : null}

      {activeTab === "channel-batch" ? (
        <PhotoshopChannelBatchTabPanel
          panelId={`${tabBaseId}-panel-channel-batch`} labelledBy={`${tabBaseId}-tab-channel-batch`}
          controlsLocked={controlsLocked}
          channelSpace={channelSpace} setChannelSpace={setChannelSpace}
          channelMixer={channelMixer} setChannelMixer={setChannelMixer}
          activeChannelPreview={activeChannelPreview}
          selectedBatchPresetId={selectedBatchPresetId} setSelectedBatchPresetId={setSelectedBatchPresetId}
          recorder={recorder} setRecorder={setRecorder}
          rawSettings={rawSettings} setStatusNote={setStatusNote} runLiveRaster={runLiveRaster}
        />
      ) : null}
    </section>
  );
}

export default PhotoshopProStudioWorkbench;
