/**
 * 절차적 만화 효과선(집중선·스피드선·유선·폭발선) 생성기 및
 * 다점 투시·대칭·분할 0ms 자석 스냅 통합 작업 패널.
 */
import { Magnet, RefreshCw, Sparkles, Wand2 } from "lucide-react";
import { useState } from "react";

import { StudioRulersSnapTab } from "./StudioRulersSnapTab";
import {
  PROCEDURAL_EFFECT_LINE_PRESETS,
  generateProceduralEffectLines,
  proceduralEffectToStudioElementPatch,
  type EffectTaperMode,
  type ProceduralEffectLineConfig,
  type ProceduralEffectLineKind,
  type RectCutFrame,
} from "./studio-procedural-effect-lines";
import { StudioSliderRow, studioSegmentChipClass } from "../studio-panel-ui";

import type { El, FocusLinesEl, FrameEl, SpeedLinesEl } from "../studio-element-model";
import type { ReactElement } from "react";

export type MangaRulersProTab = "effect-lines" | "rulers-snap";

export interface StudioMangaRulersEffectLinesPanelProps {
  readonly defaultTab?: MangaRulersProTab;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly disabled?: boolean;
  readonly selectedElement?: FocusLinesEl | SpeedLinesEl | FrameEl | null;
  readonly onApplyElementPatch?: (patch: Partial<El>) => void;
}

const PREVIEW_W = 360;
const PREVIEW_H = 240;
const DEFAULT_CLIP_FRAME: RectCutFrame = { kind: "rect", x: 12, y: 12, width: PREVIEW_W - 24, height: PREVIEW_H - 24 };

const EFFECT_KIND_OPTIONS: readonly { readonly id: ProceduralEffectLineKind; readonly label: string }[] = [
  { id: "concentration", label: "집중선" },
  { id: "speed", label: "스피드선" },
  { id: "flow", label: "유선" },
  { id: "burst", label: "폭발선" },
];

const TAPER_MODE_OPTIONS: readonly { readonly id: EffectTaperMode; readonly label: string }[] = [
  { id: "inward", label: "안쪽 뾰족" },
  { id: "both", label: "양끝 뾰족" },
  { id: "outward", label: "바깥 뾰족" },
  { id: "none", label: "균일 굵기" },
];

function buildEffectConfig(state: {
  readonly kind: ProceduralEffectLineKind;
  readonly seed: number;
  readonly lineCount: number;
  readonly baseWidth: number;
  readonly unevenSpacing: number;
  readonly taperMode: EffectTaperMode;
  readonly speedAngleDeg: number;
  readonly dashEnabled: boolean;
  readonly flowBend: number;
  readonly spikeCount: number;
  readonly clipToCut: boolean;
}): ProceduralEffectLineConfig {
  const clipFrame = state.clipToCut ? DEFAULT_CLIP_FRAME : null;
  if (state.kind === "concentration") {
    return {
      kind: "concentration",
      seed: state.seed,
      center: { x: PREVIEW_W / 2, y: PREVIEW_H / 2 },
      innerRadiusX: 52,
      innerRadiusY: 40,
      ellipseRotationDeg: -6,
      outerRadius: 210,
      lineCount: state.lineCount,
      baseWidth: state.baseWidth,
      widthJitter: 0.4,
      angleJitterDeg: 2.2,
      innerRadiusJitter: 0.22,
      lengthJitter: 0.14,
      unevenSpacing: state.unevenSpacing,
      clusterCount: 5,
      taperMode: state.taperMode,
      clipFrame,
    };
  }
  if (state.kind === "speed") {
    return {
      kind: "speed",
      seed: state.seed,
      center: { x: PREVIEW_W / 2, y: PREVIEW_H / 2 },
      angleDeg: state.speedAngleDeg,
      spanWidth: 210,
      length: 340,
      lineCount: state.lineCount,
      minWidth: Math.max(0.5, state.baseWidth * 0.45),
      maxWidth: Math.max(1.2, state.baseWidth * 1.45),
      unevenSpacing: state.unevenSpacing,
      positionJitter: 34,
      lengthJitter: 0.24,
      taperMode: state.taperMode,
      dashEnabled: state.dashEnabled,
      dashLength: 58,
      gapLength: 24,
      dashJitter: 0.28,
      clipFrame,
    };
  }
  if (state.kind === "flow") {
    return {
      kind: "flow",
      seed: state.seed,
      curve: [
        { x: 20, y: PREVIEW_H - 36 },
        { x: 112, y: PREVIEW_H * 0.5 - state.flowBend },
        { x: 248, y: PREVIEW_H * 0.5 + state.flowBend },
        { x: PREVIEW_W - 20, y: 40 },
      ],
      lineCount: Math.max(6, Math.round(state.lineCount * 0.55)),
      bandWidth: 74,
      minWidth: Math.max(0.5, state.baseWidth * 0.4),
      maxWidth: Math.max(1.2, state.baseWidth * 1.3),
      samplesPerLine: 20,
      unevenSpacing: state.unevenSpacing,
      offsetJitter: 0.22,
      trimJitter: 0.14,
      taperMode: state.taperMode,
      dashEnabled: state.dashEnabled,
      dashLength: 54,
      gapLength: 22,
      clipFrame,
    };
  }
  return {
    kind: "burst",
    seed: state.seed,
    center: { x: PREVIEW_W / 2, y: PREVIEW_H / 2 },
    innerRadiusX: 44,
    innerRadiusY: 36,
    outerRadius: 185,
    spikeCount: state.spikeCount,
    spikeJitter: 0.3,
    rotationDeg: 10,
    burstStyle: "star-plus-rays",
    baseWidth: state.baseWidth,
    secondaryRayCount: Math.max(12, Math.round(state.lineCount * 0.6)),
    clipFrame,
  };
}

export function StudioMangaRulersEffectLinesPanel({
  defaultTab = "effect-lines",
  canvasWidth = PREVIEW_W,
  canvasHeight = PREVIEW_H,
  disabled = false,
  selectedElement = null,
  onApplyElementPatch,
}: StudioMangaRulersEffectLinesPanelProps): ReactElement {
  const [activeTab, setActiveTab] = useState<MangaRulersProTab>(defaultTab);
  const [effectKind, setEffectKind] = useState<ProceduralEffectLineKind>(
    selectedElement?.type === "speedLines" ? "speed" : "concentration",
  );
  const [seed, setSeed] = useState<number>(20261122);
  const [lineCount, setLineCount] = useState<number>(48);
  const [baseWidth, setBaseWidth] = useState<number>(2.6);
  const [unevenSpacing, setUnevenSpacing] = useState<number>(0.42);
  const [taperMode, setTaperMode] = useState<EffectTaperMode>("inward");
  const [speedAngleDeg, setSpeedAngleDeg] = useState<number>(-18);
  const [dashEnabled, setDashEnabled] = useState<boolean>(false);
  const [flowBend, setFlowBend] = useState<number>(84);
  const [spikeCount, setSpikeCount] = useState<number>(18);
  const [clipToCut, setClipToCut] = useState<boolean>(true);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const effectConfig = buildEffectConfig({
    kind: effectKind,
    seed,
    lineCount,
    baseWidth,
    unevenSpacing,
    taperMode,
    speedAngleDeg,
    dashEnabled,
    flowBend,
    spikeCount,
    clipToCut,
  });
  const effectResult = generateProceduralEffectLines(effectConfig);

  const applyPreset = (presetId: string): void => {
    const preset = PROCEDURAL_EFFECT_LINE_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    const cfg = preset.config;
    setEffectKind(cfg.kind);
    setSeed(cfg.seed);
    setClipToCut(Boolean(cfg.clipFrame));
    if (cfg.kind === "concentration") {
      setLineCount(cfg.lineCount);
      setBaseWidth(cfg.baseWidth);
      setUnevenSpacing(cfg.unevenSpacing ?? 0.4);
      setTaperMode(cfg.taperMode ?? "inward");
    } else if (cfg.kind === "speed") {
      setLineCount(cfg.lineCount);
      setBaseWidth((cfg.minWidth + cfg.maxWidth) * 0.5);
      setUnevenSpacing(cfg.unevenSpacing ?? 0.35);
      setSpeedAngleDeg(cfg.angleDeg);
      setDashEnabled(Boolean(cfg.dashEnabled));
      setTaperMode(cfg.taperMode ?? "both");
    } else if (cfg.kind === "flow") {
      setLineCount(Math.round(cfg.lineCount / 0.55));
      setBaseWidth((cfg.minWidth + cfg.maxWidth) * 0.5);
      setUnevenSpacing(cfg.unevenSpacing ?? 0.3);
      setDashEnabled(Boolean(cfg.dashEnabled));
      setTaperMode(cfg.taperMode ?? "both");
    } else {
      setSpikeCount(cfg.spikeCount);
      setBaseWidth(cfg.baseWidth ?? 3);
    }
  };

  const canPatchSelected =
    Boolean(onApplyElementPatch) &&
    (selectedElement?.type === "focusLines" || selectedElement?.type === "speedLines");

  const handleApplyToElement = (): void => {
    if (!onApplyElementPatch || !selectedElement) return;
    if (selectedElement.type === "focusLines" || selectedElement.type === "speedLines") {
      onApplyElementPatch(proceduralEffectToStudioElementPatch(effectConfig, selectedElement.type));
    }
  };

  return (
    <div data-studio-rulers-effect-pro="true" className="space-y-2.5 pt-2 text-xs text-fg [word-break:keep-all]">
      <div role="tablist" aria-label="효과선 및 투시 대칭 스냅 모드" className="grid grid-cols-2 gap-1">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "effect-lines"}
          className={`${studioSegmentChipClass(activeTab === "effect-lines")} min-h-9 justify-center pointer-coarse:min-h-11`}
          onClick={() => setActiveTab("effect-lines")}
        >
          <Wand2 size={12} aria-hidden />
          절차적 효과선
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "rulers-snap"}
          className={`${studioSegmentChipClass(activeTab === "rulers-snap")} min-h-9 justify-center pointer-coarse:min-h-11`}
          onClick={() => setActiveTab("rulers-snap")}
        >
          <Magnet size={12} aria-hidden />
          투시·대칭·분할 스냅
        </button>
      </div>

      {activeTab === "effect-lines" ? (
        <div className="space-y-2">
          <div className="grid grid-cols-4 gap-1" role="group" aria-label="효과선 종류">
            {EFFECT_KIND_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                disabled={disabled}
                aria-pressed={effectKind === option.id}
                onClick={() => {
                  setEffectKind(option.id);
                  setActivePresetId(null);
                }}
                className={`${studioSegmentChipClass(effectKind === option.id)} min-h-9 justify-center px-1 text-[0.66rem] pointer-coarse:min-h-11`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-1" aria-label="절차적 효과선 프리셋">
            {PROCEDURAL_EFFECT_LINE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                disabled={disabled}
                title={preset.description}
                aria-pressed={activePresetId === preset.id}
                onClick={() => applyPreset(preset.id)}
                className={`${studioSegmentChipClass(activePresetId === preset.id)} min-h-9 truncate px-2 text-[0.65rem] pointer-coarse:min-h-11`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-1.5 rounded-md border border-line/60 bg-card/50 p-2">
            <StudioSliderRow
              label={effectKind === "burst" ? "스파이크 수" : "효과선 밀도"}
              min={effectKind === "burst" ? 6 : 8}
              max={effectKind === "burst" ? 48 : 120}
              step={1}
              value={effectKind === "burst" ? spikeCount : lineCount}
              disabled={disabled}
              onChange={(next) => (effectKind === "burst" ? setSpikeCount(next) : setLineCount(next))}
              formatReadout={(val) => `${Math.round(val)}개`}
            />
            <StudioSliderRow
              label="선 굵기"
              min={0.6}
              max={8}
              step={0.2}
              value={baseWidth}
              disabled={disabled}
              onChange={setBaseWidth}
              formatReadout={(val) => `${val.toFixed(1)}px`}
            />
            {effectKind !== "burst" ? (
              <StudioSliderRow
                label="불균일 간격"
                min={0}
                max={1}
                step={0.05}
                value={unevenSpacing}
                disabled={disabled}
                onChange={setUnevenSpacing}
                formatReadout={(val) => `${Math.round(val * 100)}%`}
              />
            ) : null}
            {effectKind === "speed" ? (
              <StudioSliderRow
                label="진행 각도"
                min={-180}
                max={180}
                step={1}
                value={speedAngleDeg}
                disabled={disabled}
                onChange={setSpeedAngleDeg}
                formatReadout={(val) => `${Math.round(val)}°`}
              />
            ) : null}
            {effectKind === "flow" ? (
              <StudioSliderRow
                label="곡선 휨"
                min={-100}
                max={100}
                step={2}
                value={flowBend}
                disabled={disabled}
                onChange={setFlowBend}
                formatReadout={(val) => `${Math.round(val)}px`}
              />
            ) : null}
          </div>

          {effectKind !== "burst" ? (
            <div className="grid grid-cols-4 gap-1" role="group" aria-label="테이퍼 방식">
              {TAPER_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  aria-pressed={taperMode === opt.id}
                  onClick={() => setTaperMode(opt.id)}
                  className={`${studioSegmentChipClass(taperMode === opt.id)} min-h-8 justify-center px-1 text-[0.62rem] pointer-coarse:min-h-11`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              aria-pressed={clipToCut}
              onClick={() => setClipToCut((prev) => !prev)}
              className={`${studioSegmentChipClass(clipToCut)} min-h-9 px-2 text-[0.65rem] pointer-coarse:min-h-11`}
            >
              컷 프레임 클리핑 {clipToCut ? "켜짐" : "꺼짐"}
            </button>
            {(effectKind === "speed" || effectKind === "flow") ? (
              <button
                type="button"
                disabled={disabled}
                aria-pressed={dashEnabled}
                onClick={() => setDashEnabled((prev) => !prev)}
                className={`${studioSegmentChipClass(dashEnabled)} min-h-9 px-2 text-[0.65rem] pointer-coarse:min-h-11`}
              >
                파선 {dashEnabled ? "켜짐" : "꺼짐"}
              </button>
            ) : null}
            <button
              type="button"
              disabled={disabled}
              onClick={() => setSeed((prev) => ((prev * 1664525 + 1013904223) >>> 0) % 999999 + 1)}
              className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line bg-card px-2 text-[0.65rem] font-semibold text-fg-2 transition-[background-color,border-color,color] duration-150 hover:bg-raised disabled:opacity-45 motion-reduce:transition-none pointer-coarse:min-h-11"
            >
              <RefreshCw size={11} aria-hidden />
              시드 #{seed}
            </button>
          </div>

          <svg
            viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`}
            role="img"
            aria-label="절차적 효과선 벡터 미리보기"
            className="w-full rounded-md border border-line bg-canvas text-fg"
          >
            {clipToCut ? (
              <rect
                x={DEFAULT_CLIP_FRAME.x}
                y={DEFAULT_CLIP_FRAME.y}
                width={DEFAULT_CLIP_FRAME.width}
                height={DEFAULT_CLIP_FRAME.height}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.28}
                strokeDasharray="4 3"
              />
            ) : null}
            <path d={effectResult.combinedSvgPath} fill="currentColor" fillOpacity={0.92} />
          </svg>

          <div className="flex items-center justify-between gap-2 text-[0.64rem] tabular-nums text-fg-3">
            <span>
              스트립 {effectResult.stats.stripCount}개 · 정점 {effectResult.stats.vertexCount}개
            </span>
            <span>클리핑 {effectResult.stats.clippedStripCount}개</span>
          </div>

          {canPatchSelected ? (
            <button
              type="button"
              disabled={disabled}
              onClick={handleApplyToElement}
              className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-accent/50 bg-accent/12 px-2.5 text-xs font-semibold text-accent transition-[background-color,border-color] duration-150 hover:bg-accent/20 disabled:opacity-45 motion-reduce:transition-none pointer-coarse:min-h-11"
            >
              <Sparkles size={13} aria-hidden />
              선택 효과선에 설정 반영
            </button>
          ) : null}
        </div>
      ) : (
        <StudioRulersSnapTab canvasWidth={canvasWidth} canvasHeight={canvasHeight} disabled={disabled} />
      )}
    </div>
  );
}
