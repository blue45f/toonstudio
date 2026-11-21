/**
 * 포토샵 프로 랩 3·4·5번 탭(잡티·배경 지우기 / 스마트 필터 / 채널·일괄 작업)과 공용 접근성 입력 컨트롤.
 */

import { ArrowDown, ArrowUp, Copy, Eraser, Eye, EyeOff, Play, Plus, Trash2 } from "lucide-react";
import { useId } from "react";

import {
  applyProChannelMixer,
  createActionRecorder,
  finalizeActionSequence,
  recordActionStep,
  replayActionSequence,
  WEBTOON_BATCH_ACTION_PRESETS,
} from "./photoshop-camera-raw-channels";
import {
  applyCloneStamp,
  applyContentAwareFill,
  applySpotHealingBrush,
  applyVectorMaskToRgba,
  createPresetVectorMaskPath,
  rasterizeVectorMask,
  recombineFrequencies,
  refineSelectionMask,
  renderQuickMaskOverlay,
  selectColorRange,
  separateFrequencies,
} from "./photoshop-retouch-frequency";
import {
  addSmartFilter,
  createSmartObjectDocument,
  duplicateSmartFilter,
  evaluateSmartObjectStack,
  PHOTOSHOP_SMART_FILTER_RECIPES,
  removeSmartFilter,
  reorderSmartFilter,
  SMART_FILTER_MAX_ENTRIES,
  toStudioSmartFilterStack,
  updateSmartFilterBlending,
  updateSmartFilterMaskOptions,
} from "./photoshop-smart-object-stack";

import type { StudioAdjustmentEngineId } from "../studio-adjustment-stack";
import type {
  ActionRecorderState,
  CameraRawSettings,
  ChannelColorSpace,
  ProChannelMixerConfig,
  SeparatedChannelPlane,
} from "./photoshop-camera-raw-channels";
import type { RgbaImageBuffer, RgbColor } from "./photoshop-pixel-math";
import type { ColorRangeMode } from "./photoshop-retouch-frequency";
import type { PhotoshopSmartObjectDocument, SmartFilterBlendMode } from "./photoshop-smart-object-stack";

import { cn } from "@/shared/lib/utils";

const TRANSITION_CLS = "transition-[background-color,border-color,color] duration-150 motion-reduce:transition-none";
const BTN_BASE = cn(
  "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold [word-break:keep-all] disabled:cursor-not-allowed disabled:opacity-45",
  TRANSITION_CLS,
);
const BTN_SECONDARY = cn(BTN_BASE, "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg");
const BTN_PRIMARY = cn(BTN_BASE, "border-accent bg-accent text-on-accent hover:brightness-105");

const QUICK_SMART_FILTER_ENGINES: readonly {
  readonly engine: StudioAdjustmentEngineId;
  readonly label: string;
  readonly params: Readonly<Record<string, number | string | boolean>>;
}[] = [
  { engine: "gaussian-blur", label: "부드러운 흐림", params: { radius: 3 } },
  { engine: "unsharp-mask", label: "선명하게 다듬기", params: { amount: 0.9, radius: 2, threshold: 4 } },
  { engine: "high-pass", label: "질감·윤곽 강조", params: { radius: 2 } },
  { engine: "brightness-contrast", label: "밝기·대비 보정", params: { brightness: 0.08, contrast: 14 } },
  { engine: "shadow-highlight", label: "어두운 곳 살리기", params: { shadows: 26, highlights: 12 } },
  { engine: "sepia", label: "따뜻한 회상 톤", params: {} },
];

const BLEND_MODE_OPTIONS: readonly { readonly value: SmartFilterBlendMode; readonly label: string }[] = [
  { value: "normal", label: "기본 합성" },
  { value: "multiply", label: "어둡게 곱하기" },
  { value: "screen", label: "밝게 겹치기" },
  { value: "overlay", label: "대비 강조" },
  { value: "soft-light", label: "부드러운 빛" },
  { value: "luminosity", label: "밝기만 반영" },
  { value: "color", label: "색감만 반영" },
];

const COLOR_RANGE_OPTIONS: readonly { readonly value: ColorRangeMode; readonly label: string }[] = [
  { value: "highlights", label: "밝은 부분만" },
  { value: "midtones", label: "중간 톤만" },
  { value: "shadows", label: "어두운 부분만" },
  { value: "reds", label: "붉은 계열만" },
  { value: "greens", label: "초록 계열만" },
  { value: "blues", label: "파란 계열만" },
];

export function PhotoshopRangeRow({
  label, value, min, max, step = 1, suffix = "", disabled, onChange,
}: {
  readonly label: string; readonly value: number; readonly min: number; readonly max: number;
  readonly step?: number; readonly suffix?: string; readonly disabled?: boolean;
  readonly onChange: (next: number) => void;
}) {
  const id = useId();
  const formatted = Number.isInteger(step) ? String(Math.round(value)) : value.toFixed(2).replace(/\.?0+$/, "");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 text-xs text-fg-2">
        <label htmlFor={id} className="font-medium [word-break:keep-all]">{label}</label>
        <output htmlFor={id} className="tabular-nums text-fg-3">{formatted}{suffix}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="min-h-11 w-full cursor-pointer accent-accent"
      />
    </div>
  );
}

export function PhotoshopToggleChip({
  label, checked, disabled, onToggle,
}: {
  readonly label: string; readonly checked: boolean; readonly disabled?: boolean; readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      onClick={onToggle}
      className={cn(
        BTN_BASE,
        checked ? "border-accent bg-accent-soft/65 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
      )}
    >
      {label}
    </button>
  );
}

export function PhotoshopRetouchTabPanel({
  panelId, labelledBy, controlsLocked, activeFxColor,
  retouchMode, setRetouchMode,
  retouchRadius, setRetouchRadius,
  retouchCenterPctX, setRetouchCenterPctX,
  retouchCenterPctY, setRetouchCenterPctY,
  freqSmoothRadius, setFreqSmoothRadius,
  freqTexturePct, setFreqTexturePct,
  colorRangeMode, setColorRangeMode,
  colorRangeFuzz, setColorRangeFuzz,
  maskShape, setMaskShape,
  maskFeather, setMaskFeather,
  maskInvert, setMaskInvert,
  cloneShiftX, setCloneShiftX,
  refineShiftPx, setRefineShiftPx,
  runLiveRaster,
}: {
  readonly panelId: string; readonly labelledBy: string; readonly controlsLocked: boolean;
  readonly activeFxColor: RgbColor;
  readonly retouchMode: "spot-heal" | "content-fill" | "skin-freq" | "color-pick" | "shape-mask";
  readonly setRetouchMode: (v: "spot-heal" | "content-fill" | "skin-freq" | "color-pick" | "shape-mask") => void;
  readonly retouchRadius: number; readonly setRetouchRadius: (v: number) => void;
  readonly retouchCenterPctX: number; readonly setRetouchCenterPctX: (v: number) => void;
  readonly retouchCenterPctY: number; readonly setRetouchCenterPctY: (v: number) => void;
  readonly freqSmoothRadius: number; readonly setFreqSmoothRadius: (v: number) => void;
  readonly freqTexturePct: number; readonly setFreqTexturePct: (v: number) => void;
  readonly colorRangeMode: ColorRangeMode; readonly setColorRangeMode: (v: ColorRangeMode) => void;
  readonly colorRangeFuzz: number; readonly setColorRangeFuzz: (v: number) => void;
  readonly maskShape: "oval" | "rounded-rect" | "diamond"; readonly setMaskShape: (v: "oval" | "rounded-rect" | "diamond") => void;
  readonly maskFeather: number; readonly setMaskFeather: (v: number) => void;
  readonly maskInvert: boolean; readonly setMaskInvert: (v: boolean) => void;
  readonly cloneShiftX: number; readonly setCloneShiftX: (v: number) => void;
  readonly refineShiftPx: number; readonly setRefineShiftPx: (v: number) => void;
  readonly runLiveRaster: (label: string, process: (buf: RgbaImageBuffer) => RgbaImageBuffer) => Promise<void>;
}) {
  const colorRangeSelectId = useId();
  const shapeSelectId = useId();

  return (
    <div role="tabpanel" id={panelId} aria-labelledby={labelledBy} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="지우기·선택 작업 선택">
        {([
          ["spot-heal", "잡티 톡 지우기"],
          ["content-fill", "배경 흔적 자동 메우기"],
          ["skin-freq", "피부결·색감 따로 다듬기"],
          ["color-pick", "비슷한 색만 골라내기"],
          ["shape-mask", "모양 틀로 자르기"],
        ] as const).map(([id, label]) => (
          <PhotoshopToggleChip key={id} label={label} checked={retouchMode === id} disabled={controlsLocked} onToggle={() => setRetouchMode(id)} />
        ))}
      </div>

      {retouchMode === "spot-heal" || retouchMode === "content-fill" ? (
        <>
          <PhotoshopRangeRow label="영역 크기" value={retouchRadius} min={4} max={48} suffix="px" disabled={controlsLocked} onChange={setRetouchRadius} />
          <PhotoshopRangeRow label="가로 위치" value={retouchCenterPctX} min={10} max={90} suffix="%" disabled={controlsLocked} onChange={setRetouchCenterPctX} />
          <PhotoshopRangeRow label="세로 위치" value={retouchCenterPctY} min={10} max={90} suffix="%" disabled={controlsLocked} onChange={setRetouchCenterPctY} />
        </>
      ) : null}

      {retouchMode === "skin-freq" ? (
        <>
          <PhotoshopRangeRow label="색감 부드러움 반경" value={freqSmoothRadius} min={1} max={10} suffix="px" disabled={controlsLocked} onChange={setFreqSmoothRadius} />
          <PhotoshopRangeRow label="선·질감 유지 강도" value={freqTexturePct} min={0} max={150} suffix="%" disabled={controlsLocked} onChange={setFreqTexturePct} />
        </>
      ) : null}

      {retouchMode === "color-pick" ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={colorRangeSelectId} className="text-xs font-medium text-fg-2">골라낼 색상 범위</label>
            <select id={colorRangeSelectId} disabled={controlsLocked} value={colorRangeMode}
              onChange={(e) => setColorRangeMode(e.target.value as ColorRangeMode)}
              className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg">
              {COLOR_RANGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <PhotoshopRangeRow label="비슷한 색 허용 범위" value={colorRangeFuzz} min={10} max={180} disabled={controlsLocked} onChange={setColorRangeFuzz} />
        </>
      ) : null}

      {retouchMode === "shape-mask" ? (
        <>
          <div className="flex flex-col gap-1">
            <label htmlFor={shapeSelectId} className="text-xs font-medium text-fg-2">자르기 모양 틀</label>
            <select id={shapeSelectId} disabled={controlsLocked} value={maskShape}
              onChange={(e) => setMaskShape(e.target.value as "oval" | "rounded-rect" | "diamond")}
              className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg">
              <option value="oval">부드러운 타원</option>
              <option value="rounded-rect">둥근 카드 모양</option>
              <option value="diamond">마름모 모양</option>
            </select>
          </div>
          <PhotoshopRangeRow label="가장자리 부드러움" value={maskFeather} min={0} max={12} suffix="px" disabled={controlsLocked} onChange={setMaskFeather} />
          <PhotoshopToggleChip label="안쪽·바깥 반전하기" checked={maskInvert} disabled={controlsLocked} onToggle={() => setMaskInvert(!maskInvert)} />
        </>
      ) : null}

      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between rounded px-2 font-semibold text-fg hover:bg-raised/60", TRANSITION_CLS)}>
          <span>도장 복제 · 선택 경계 다듬기 설정</span>
          <span className="tabular-nums text-fg-3">간격 {cloneShiftX}px</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 px-1">
          <PhotoshopRangeRow label="복제 도장 가로 간격" value={cloneShiftX} min={-48} max={48} suffix="px" disabled={controlsLocked} onChange={setCloneShiftX} />
          <PhotoshopRangeRow label="선택 경계 넓히기/줄이기" value={refineShiftPx} min={-4} max={4} suffix="px" disabled={controlsLocked} onChange={setRefineShiftPx} />
          <button type="button" disabled={controlsLocked}
            onClick={() => void runLiveRaster("도장 복제", (buf) => {
              const cx = Math.round((buf.width * retouchCenterPctX) / 100);
              const cy = Math.round((buf.height * retouchCenterPctY) / 100);
              return applyCloneStamp(buf, {
                sourceX: Math.max(0, Math.min(buf.width - 1, cx + cloneShiftX)),
                sourceY: cy, destinationPoints: [{ x: cx, y: cy }], radiusPx: retouchRadius,
              });
            })}
            className={BTN_SECONDARY}>
            도장 복제 한 번 찍기
          </button>
        </div>
      </details>

      <button type="button" disabled={controlsLocked}
        onClick={() => void runLiveRaster("잡티·배경 정리", (buf) => {
          const cx = Math.round((buf.width * retouchCenterPctX) / 100);
          const cy = Math.round((buf.height * retouchCenterPctY) / 100);
          if (retouchMode === "spot-heal") return applySpotHealingBrush(buf, cx, cy, retouchRadius);
          if (retouchMode === "content-fill") {
            const mask = new Uint8Array(buf.width * buf.height);
            for (let y = 0; y < buf.height; y += 1) {
              for (let x = 0; x < buf.width; x += 1) {
                if (Math.hypot(x - cx, y - cy) <= retouchRadius) mask[y * buf.width + x] = 255;
              }
            }
            return applyContentAwareFill(buf, mask);
          }
          if (retouchMode === "skin-freq") {
            const sep = separateFrequencies(buf, freqSmoothRadius);
            return recombineFrequencies(sep, { textureStrength: freqTexturePct / 100, lowSmoothRadiusPx: freqSmoothRadius });
          }
          if (retouchMode === "color-pick") {
            const sel = selectColorRange(buf, { mode: colorRangeMode, sampleColor: activeFxColor, fuzziness: colorRangeFuzz });
            const refined = refineSelectionMask(sel.mask, buf.width, buf.height, { shiftEdgePx: refineShiftPx, featherPx: 1 });
            return renderQuickMaskOverlay(buf, refined, { maskIndicates: "selected" });
          }
          const path = createPresetVectorMaskPath(maskShape, buf.width, buf.height);
          const mask = rasterizeVectorMask([path], buf.width, buf.height, { featherPx: maskFeather, inverted: maskInvert });
          return applyVectorMaskToRgba(buf, mask);
        })}
        className={BTN_PRIMARY}>
        <Eraser size={13} aria-hidden />
        현재 보정 실행
      </button>
    </div>
  );
}

export function PhotoshopSmartFilterTabPanel({
  panelId, labelledBy, tabBaseId, controlsLocked, smartDoc, setSmartDoc, syncSmartStackToElement, runLiveRaster,
}: {
  readonly panelId: string; readonly labelledBy: string; readonly tabBaseId: string;
  readonly controlsLocked: boolean; readonly smartDoc: PhotoshopSmartObjectDocument;
  readonly setSmartDoc: (updater: (d: PhotoshopSmartObjectDocument) => PhotoshopSmartObjectDocument) => void;
  readonly syncSmartStackToElement: (nextDoc: PhotoshopSmartObjectDocument, note?: string) => void;
  readonly runLiveRaster: (label: string, process: (buf: RgbaImageBuffer) => RgbaImageBuffer) => Promise<void>;
}) {
  return (
    <div role="tabpanel" id={panelId} aria-labelledby={labelledBy} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-1 gap-1.5" role="group" aria-label="스마트 필터 추천 조합">
        {PHOTOSHOP_SMART_FILTER_RECIPES.map((recipe) => (
          <button key={recipe.id} type="button" disabled={controlsLocked} title={recipe.description}
            onClick={() => {
              let next = createSmartObjectDocument({
                id: smartDoc.id, label: smartDoc.label,
                source: { width: smartDoc.sourceWidth, height: smartDoc.sourceHeight, data: smartDoc.sourcePixels },
              });
              for (const item of recipe.entries) next = addSmartFilter(next, item);
              syncSmartStackToElement(next, `‘${recipe.label}’ 필터 묶음을 저장했어요.`);
            }}
            className={cn(BTN_SECONDARY, "justify-between px-3")}>
            <span>{recipe.label}</span>
            <span className="tabular-nums text-[0.65rem] text-fg-3">{recipe.entries.length}단계</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="개별 스마트 필터 추가">
        {QUICK_SMART_FILTER_ENGINES.map((item) => (
          <button key={item.engine} type="button" disabled={controlsLocked || smartDoc.filters.length >= SMART_FILTER_MAX_ENTRIES}
            onClick={() => syncSmartStackToElement(addSmartFilter(smartDoc, item), `‘${item.label}’ 필터를 추가했어요.`)}
            className={BTN_SECONDARY}>
            <Plus size={13} aria-hidden />
            {item.label}
          </button>
        ))}
      </div>

      {smartDoc.filters.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line bg-card/40 px-3 py-3 text-center text-xs text-fg-3">
          아직 추가된 필터가 없어요. 위 버튼을 눌러 원본을 건드리지 않고 효과를 쌓아 보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2" aria-label="쌓인 스마트 필터 순서">
          {smartDoc.filters.map((entry, idx) => (
            <li key={entry.id} className="flex flex-col gap-2 rounded-lg border border-line bg-card/65 p-2">
              <div className="flex items-center justify-between gap-1">
                <span className="truncate font-semibold text-fg">
                  <span className="mr-1 tabular-nums text-fg-3">{idx + 1}.</span>
                  {entry.label}
                </span>
                <div className="flex items-center gap-1">
                  <button type="button" aria-label={`${entry.label} 위로 이동`} disabled={controlsLocked || idx === 0}
                    onClick={() => syncSmartStackToElement(reorderSmartFilter(smartDoc, idx, idx - 1))}
                    className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40">
                    <ArrowUp size={13} aria-hidden />
                  </button>
                  <button type="button" aria-label={`${entry.label} 아래로 이동`} disabled={controlsLocked || idx === smartDoc.filters.length - 1}
                    onClick={() => syncSmartStackToElement(reorderSmartFilter(smartDoc, idx, idx + 1))}
                    className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line bg-panel text-fg-2 hover:bg-raised disabled:opacity-40">
                    <ArrowDown size={13} aria-hidden />
                  </button>
                  <button type="button" aria-label={entry.enabled ? `${entry.label} 숨기기` : `${entry.label} 켜기`} aria-pressed={entry.enabled} disabled={controlsLocked}
                    onClick={() => syncSmartStackToElement(updateSmartFilterBlending(smartDoc, entry.id, { enabled: !entry.enabled }))}
                    className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line bg-panel text-fg-2 hover:bg-raised">
                    {entry.enabled ? <Eye size={13} aria-hidden /> : <EyeOff size={13} aria-hidden />}
                  </button>
                  <button type="button" aria-label={`${entry.label} 복제`} disabled={controlsLocked}
                    onClick={() => syncSmartStackToElement(duplicateSmartFilter(smartDoc, entry.id))}
                    className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line bg-panel text-fg-2 hover:bg-raised">
                    <Copy size={13} aria-hidden />
                  </button>
                  <button type="button" aria-label={`${entry.label} 삭제`} disabled={controlsLocked}
                    onClick={() => syncSmartStackToElement(removeSmartFilter(smartDoc, entry.id))}
                    className="grid min-h-11 min-w-11 place-items-center rounded-md border border-line bg-panel text-fg-2 hover:bg-raised">
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <PhotoshopRangeRow label="적용 세기" value={Math.round(entry.opacity * 100)} min={0} max={100} suffix="%" disabled={controlsLocked}
                  onChange={(pct) => syncSmartStackToElement(updateSmartFilterBlending(smartDoc, entry.id, { opacity: pct / 100 }))} />
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${tabBaseId}-bm-${entry.id}`} className="text-xs font-medium text-fg-2">합성 방식</label>
                  <select id={`${tabBaseId}-bm-${entry.id}`} disabled={controlsLocked} value={entry.blendMode}
                    onChange={(e) => syncSmartStackToElement(updateSmartFilterBlending(smartDoc, entry.id, { blendMode: e.target.value as SmartFilterBlendMode }))}
                    className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg">
                    {BLEND_MODE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between rounded px-2 font-semibold text-fg hover:bg-raised/60", TRANSITION_CLS)}>
          <span>필터 마스크 설정</span>
          <span className="tabular-nums text-fg-3">경계 {smartDoc.filterMask.featherPx}px</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 px-1">
          <div className="grid grid-cols-2 gap-1.5">
            <PhotoshopToggleChip label="필터 마스크 사용" checked={smartDoc.filterMask.enabled} disabled={controlsLocked}
              onToggle={() => setSmartDoc((d) => updateSmartFilterMaskOptions(d, { enabled: !d.filterMask.enabled }))} />
            <PhotoshopToggleChip label="적용 영역 반전" checked={smartDoc.filterMask.inverted} disabled={controlsLocked}
              onToggle={() => setSmartDoc((d) => updateSmartFilterMaskOptions(d, { inverted: !d.filterMask.inverted }))} />
          </div>
          <PhotoshopRangeRow label="마스크 경계 부드러움" value={smartDoc.filterMask.featherPx} min={0} max={16} suffix="px" disabled={controlsLocked}
            onChange={(featherPx) => setSmartDoc((d) => updateSmartFilterMaskOptions(d, { featherPx }))} />
        </div>
      </details>

      <button type="button" disabled={controlsLocked || smartDoc.filters.length === 0}
        onClick={() => void runLiveRaster("스마트 필터 합치기", (buf) => {
          const liveDoc = createSmartObjectDocument({
            id: smartDoc.id, label: smartDoc.label, source: buf, initialStack: toStudioSmartFilterStack(smartDoc),
          });
          return evaluateSmartObjectStack(updateSmartFilterMaskOptions(liveDoc, {
            enabled: smartDoc.filterMask.enabled, inverted: smartDoc.filterMask.inverted, featherPx: smartDoc.filterMask.featherPx,
          }));
        })}
        className={BTN_PRIMARY}>
        스마트 필터 결과 이미지에 적용
      </button>
    </div>
  );
}

export function PhotoshopChannelBatchTabPanel({
  panelId, labelledBy, controlsLocked,
  channelSpace, setChannelSpace, channelMixer, setChannelMixer, activeChannelPreview,
  selectedBatchPresetId, setSelectedBatchPresetId,
  recorder, setRecorder, rawSettings, setStatusNote, runLiveRaster,
}: {
  readonly panelId: string; readonly labelledBy: string; readonly controlsLocked: boolean;
  readonly channelSpace: ChannelColorSpace; readonly setChannelSpace: (v: ChannelColorSpace) => void;
  readonly channelMixer: ProChannelMixerConfig;
  readonly setChannelMixer: (updater: (p: ProChannelMixerConfig) => ProChannelMixerConfig) => void;
  readonly activeChannelPreview: readonly SeparatedChannelPlane[];
  readonly selectedBatchPresetId: string; readonly setSelectedBatchPresetId: (v: string) => void;
  readonly recorder: ActionRecorderState;
  readonly setRecorder: (next: ActionRecorderState | ((prev: ActionRecorderState) => ActionRecorderState)) => void;
  readonly rawSettings: CameraRawSettings;
  readonly setStatusNote: (note: string | null) => void;
  readonly runLiveRaster: (label: string, process: (buf: RgbaImageBuffer) => RgbaImageBuffer) => Promise<void>;
}) {
  const channelSelectId = useId();
  return (
    <div role="tabpanel" id={panelId} aria-labelledby={labelledBy} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor={channelSelectId} className="text-xs font-medium text-fg-2">색상 채널 보기 방식</label>
        <select id={channelSelectId} disabled={controlsLocked} value={channelSpace}
          onChange={(e) => {
            const next = e.target.value as ChannelColorSpace;
            setChannelSpace(next);
            setChannelMixer((prev) => ({ ...prev, colorSpace: next }));
          }}
          className="min-h-11 rounded-lg border border-line bg-canvas px-2 text-xs text-fg">
          <option value="rgb">화면 빛의 3원색 (빨강·초록·파랑)</option>
          <option value="cmyk">인쇄 4색 잉크 (청록·자주·노랑·먹색)</option>
          <option value="lab">밝기와 색감 분리 방식</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-1.5" aria-label="채널별 평균 농도">
        {activeChannelPreview.map((ch) => (
          <div key={ch.id} className="rounded-lg border border-line bg-card/70 px-2 py-1.5 text-center">
            <p className="text-[0.65rem] font-semibold text-fg-2">{ch.label}</p>
            <p className="mt-0.5 text-xs font-bold tabular-nums text-fg">{Math.round(ch.mean01 * 100)}%</p>
          </div>
        ))}
      </div>

      <PhotoshopToggleChip label="고대비 흑백으로 전환" checked={channelMixer.monochrome} disabled={controlsLocked}
        onToggle={() => setChannelMixer((p) => ({ ...p, monochrome: !p.monochrome, rgbRed: !p.monochrome ? [0.35, 0.5, 0.15, 0] : [1, 0, 0, 0] }))} />

      <button type="button" disabled={controlsLocked}
        onClick={() => void runLiveRaster("채널 균형 보정", (buf) => applyProChannelMixer(buf, channelMixer))}
        className={BTN_SECONDARY}>
        현재 채널 균형 적용
      </button>

      <div className="flex flex-col gap-2 border-t border-line/70 pt-2">
        <p className="font-semibold text-fg">웹툰 회차 일괄 후보정 프리셋</p>
        <div className="grid grid-cols-1 gap-1.5" role="group" aria-label="웹툰 회차 일괄 보정 프리셋">
          {WEBTOON_BATCH_ACTION_PRESETS.map((seq) => (
            <button key={seq.id} type="button" disabled={controlsLocked} aria-pressed={selectedBatchPresetId === seq.id} title={seq.description}
              onClick={() => setSelectedBatchPresetId(seq.id)}
              className={cn(
                BTN_BASE, "justify-between px-3",
                selectedBatchPresetId === seq.id ? "border-accent bg-accent-soft/65 text-fg" : "border-line bg-card text-fg-2 hover:bg-raised",
              )}>
              <span>{seq.name}</span>
              <span className="tabular-nums text-[0.65rem] text-fg-3">{seq.steps.length}단계</span>
            </button>
          ))}
        </div>
        <button type="button" disabled={controlsLocked}
          onClick={() => {
            const preset = WEBTOON_BATCH_ACTION_PRESETS.find((s) => s.id === selectedBatchPresetId) ?? WEBTOON_BATCH_ACTION_PRESETS[0]!;
            void runLiveRaster(preset.name, (buf) => replayActionSequence(buf, preset).output);
          }}
          className={BTN_PRIMARY}>
          <Play size={13} aria-hidden />
          선택한 회차 일괄 보정 실행
        </button>
      </div>

      <details className="rounded-lg border border-line/75 bg-card/45 p-2">
        <summary className={cn("flex min-h-11 cursor-pointer list-none items-center justify-between rounded px-2 font-semibold text-fg hover:bg-raised/60", TRANSITION_CLS)}>
          <span>나만의 작업 순서 녹화 · 재생</span>
          <span className="tabular-nums text-fg-3">기록 {recorder.steps.length}단계</span>
        </summary>
        <div className="mt-2 flex flex-col gap-2 px-1">
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" disabled={controlsLocked}
              onClick={() => { setRecorder(createActionRecorder()); setStatusNote("작업 순서 녹화를 시작했어요."); }}
              className={BTN_SECONDARY}>
              녹화 시작
            </button>
            <button type="button" disabled={controlsLocked || !recorder.recording}
              onClick={() => {
                setRecorder((r) => recordActionStep(r, {
                  id: `rec-${r.steps.length + 1}`,
                  label: `색감 보정 단계 ${r.steps.length + 1}`,
                  enabled: true, kind: "camera-raw", settings: { ...rawSettings },
                }));
                setStatusNote("현재 색감 보정 설정을 작업 순서에 기록했어요.");
              }}
              className={BTN_SECONDARY}>
              현재 보정 기록
            </button>
          </div>
          <button type="button" disabled={controlsLocked || recorder.steps.length === 0}
            onClick={() => {
              const seq = finalizeActionSequence(recorder, {
                id: "custom-recorded-seq", name: "내가 녹화한 보정 순서",
                description: "기록한 보정 단계를 순서대로 다시 실행합니다.",
              });
              void runLiveRaster(seq.name, (buf) => replayActionSequence(buf, seq).output);
            }}
            className={BTN_PRIMARY}>
            녹화한 순서 한 번에 실행 ({recorder.steps.length}단계)
          </button>
        </div>
      </details>
    </div>
  );
}
