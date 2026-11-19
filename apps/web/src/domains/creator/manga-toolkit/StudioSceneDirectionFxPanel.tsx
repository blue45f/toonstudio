import { Layers, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import {
  SCENE_FX_PRESETS,
  createDefaultSceneFxConfig,
  renderSceneDirectionFx,
  type SceneDirectionFxConfig,
  type SceneFxBlendMode,
  type SceneFxPresetId,
  type SceneFxRenderArtifact,
} from "./scene-direction-fx";

export interface StudioSceneDirectionFxPanelProps {
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly onApplyFxLayer?: (artifact: SceneFxRenderArtifact) => void;
}

const BLEND_MODES: readonly SceneFxBlendMode[] = ["normal", "screen", "multiply", "overlay", "add"];

export function StudioSceneDirectionFxPanel({
  canvasWidth = 800,
  canvasHeight = 1280,
  onApplyFxLayer,
}: StudioSceneDirectionFxPanelProps) {
  const [config, setConfig] = useState<SceneDirectionFxConfig>(() =>
    createDefaultSceneFxConfig("impact-frame-burst", canvasWidth, canvasHeight),
  );
  const [appliedNotice, setAppliedNotice] = useState<string | null>(null);

  const artifact = useMemo(() => renderSceneDirectionFx(config), [config]);

  const handleSelectPreset = (presetId: SceneFxPresetId) => {
    setConfig(createDefaultSceneFxConfig(presetId, canvasWidth, canvasHeight));
    setAppliedNotice(null);
  };

  const handleApply = () => {
    onApplyFxLayer?.(artifact);
    setAppliedNotice(`${artifact.layerMetadata.layerName} 레이어를 컷에 적용했습니다.`);
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-4 rounded-xl border border-line bg-panel p-4 text-fg [overflow-wrap:break-word] [word-break:keep-all] sm:p-5"
      aria-label="장면 연출 및 특수 효과 패널"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SlidersHorizontal className="size-4 shrink-0 text-fg-2" strokeWidth={1.5} aria-hidden="true" />
          <h3 className="text-sm font-medium leading-[1.4] tracking-[-0.01em] text-fg">
            장면 연출 · 특수 효과 (VFX)
          </h3>
        </div>
        <button
          type="button"
          onClick={() => handleSelectPreset(config.presetId)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line px-3 text-xs leading-[1.4] text-fg-2 transition-colors duration-150 hover:bg-raised sm:min-h-9"
        >
          <RotateCcw className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          초기화
        </button>
      </header>

      {/* 모바일에서는 가로 스냅 레일로 스크롤 공간을 절약하고, 데스크톱에서는 3열 그리드로 펼친다. */}
      <div
        className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:grid sm:grid-cols-3 sm:overflow-visible sm:pb-0"
        role="listbox"
        aria-label="특수 효과 프리셋"
      >
        {SCENE_FX_PRESETS.map((preset) => {
          const selected = preset.id === config.presetId;
          return (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => handleSelectPreset(preset.id)}
              className={`min-h-11 shrink-0 snap-start rounded-lg border px-3 py-2 text-left text-xs leading-[1.4] transition-colors duration-150 sm:min-h-9 ${
                selected
                  ? "border-accent bg-accent-soft font-medium text-accent"
                  : "border-line bg-card text-fg-2 hover:border-accent/45 hover:text-fg"
              }`}
            >
              <span className="block whitespace-nowrap sm:truncate">{preset.nameKo}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_224px]">
        <div className="order-2 flex min-w-0 flex-col gap-3 md:order-1">
          <label className="flex flex-col gap-1.5 text-xs leading-[1.4] text-fg-2">
            <span className="tabular-nums">강도 ({config.intensity}%)</span>
            <input
              type="range"
              min={0}
              max={100}
              value={config.intensity}
              onChange={(e) => setConfig((prev) => ({ ...prev, intensity: Number(e.target.value) }))}
              className="h-11 w-full accent-accent sm:h-6"
            />
          </label>
          <details className="rounded-lg border border-line bg-card px-3 py-2" open>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-xs font-medium text-fg-2 sm:min-h-8 [&::-webkit-details-marker]:hidden">
              <span>상세 효과 조절 (밀도 · 색상 · 블렌드)</span>
              <span className="tabular-nums text-fg-3">{config.blendMode}</span>
            </summary>
            <div className="mt-2 flex flex-col gap-3 border-t border-line pt-3">
              <label className="flex flex-col gap-1.5 text-xs leading-[1.4] text-fg-2">
                <span className="tabular-nums">밀도 ({config.density}%)</span>
                <input
                  type="range"
                  min={1}
                  max={100}
                  value={config.density}
                  onChange={(e) => setConfig((prev) => ({ ...prev, density: Number(e.target.value) }))}
                  className="h-11 w-full accent-accent sm:h-6"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex min-h-11 items-center justify-between rounded-lg border border-line bg-panel px-3 text-xs text-fg-2 sm:min-h-9">
                  <span>주 색상</span>
                  <input
                    type="color"
                    value={config.primaryColor}
                    onChange={(e) => setConfig((prev) => ({ ...prev, primaryColor: e.target.value }))}
                  />
                </label>
                <label className="flex min-h-11 items-center justify-between rounded-lg border border-line bg-panel px-3 text-xs text-fg-2 sm:min-h-9">
                  <span>보조 색상</span>
                  <input
                    type="color"
                    value={config.secondaryColor}
                    onChange={(e) => setConfig((prev) => ({ ...prev, secondaryColor: e.target.value }))}
                  />
                </label>
              </div>
              <label className="flex items-center justify-between gap-2 text-xs text-fg-2">
                <span>블렌드 모드</span>
                <select
                  value={config.blendMode}
                  onChange={(e) =>
                    setConfig((prev) => ({ ...prev, blendMode: e.target.value as SceneFxBlendMode }))
                  }
                  className="min-h-11 rounded-lg border border-line bg-panel px-3 text-xs text-fg sm:min-h-9"
                >
                  {BLEND_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </details>
        </div>

        <div className="order-1 flex flex-col items-center justify-center rounded-lg border border-line bg-canvas p-2.5 md:order-2">
          <div
            className="h-44 w-full overflow-hidden rounded-md bg-neutral-900/85"
            aria-label="특수 효과 실시간 미리보기"
            dangerouslySetInnerHTML={{ __html: artifact.svgMarkup }}
          />
          <p className="mt-2 text-xs tabular-nums text-fg-3">
            요소 {artifact.elementCount}개 · 키프레임 {artifact.scrollKeyframes.length}단
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-[1.45] text-fg-3" role="status">
          {appliedNotice ?? `레이어명: ${artifact.layerMetadata.layerName}`}
        </p>
        <button
          type="button"
          onClick={handleApply}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-medium text-on-accent transition-opacity duration-150 hover:opacity-90 sm:min-h-9 sm:w-auto"
        >
          <Layers className="size-3.5 shrink-0" strokeWidth={1.5} aria-hidden="true" />
          컷 레이어로 적용
        </button>
      </div>
    </section>
  );
}
