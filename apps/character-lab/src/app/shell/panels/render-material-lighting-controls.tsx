import { useMemo } from "react";

import { useLabStore } from "../lab-store-context";

import {
  WEBTOON_GENRE_SCENE_PRESETS,
  WEBTOON_LIGHTING_SHADOW_PRESETS,
  WEBTOON_MATERIAL_SURFACE_PRESETS,
  buildGenreScenePresetCommands,
  buildLightingShadowCommands,
  buildMaterialSurfaceCommands,
  buildResetMaterialLightingCommands,
  isMaterialSurfacePresetActive,
  isLightingPresetActive,
  summarizeActiveMaterialAndShadowKo,
} from "./render-material-lighting-presets";

import type { LabCommand, ShadingProfile, Surfaces } from "../../../contracts";

interface RenderMaterialLightingControlsProps {
  readonly surfaces: Surfaces;
  readonly shading: ShadingProfile;
  readonly dispatch: (command: LabCommand) => void;
}

/** 장르·소재·조명 프리셋을 표시하고 기존 명령 생성 결과를 전달한다. */
export function RenderMaterialLightingControls({ surfaces, shading, dispatch }: RenderMaterialLightingControlsProps) {
  const store = useLabStore();
  const selected = useMemo(() => {
    const active = new Set<string>();
    for (const preset of WEBTOON_LIGHTING_SHADOW_PRESETS) {
      if (isLightingPresetActive(shading, preset)) active.add(preset.id);
    }
    for (const preset of WEBTOON_GENRE_SCENE_PRESETS) {
      if (isMaterialSurfacePresetActive(surfaces, preset) && isLightingPresetActive(shading, preset)) active.add(preset.id);
    }
    return active;
  }, [shading, surfaces]);

  function apply(commands: readonly LabCommand[]) {
    const run = () => commands.forEach(dispatch);
    if (store.withCoalesceKey) store.withCoalesceKey("render-preset", run);
    else run();
  }

  return (
    <fieldset className="cl-render-group" data-testid="render-material-lighting-suite">
      <legend>피부·의상 소재 & 툰 셰이딩·그림자 프리셋</legend>
      <p className="cl-render-hint" data-testid="render-material-shadow-summary">
        {summarizeActiveMaterialAndShadowKo(surfaces, shading)}
      </p>
      <div className="cl-render-row" role="group" aria-label="한국 웹툰 장르별 1-클릭 마스터 씬 프리셋" data-testid="render-webtoon-genre-scene-presets">
        {WEBTOON_GENRE_SCENE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            data-testid={`render-genre-preset-${preset.id}`}
            aria-pressed={selected.has(preset.id)}
            title={`[${preset.genreTagKo}] ${preset.summaryKo}`}
            onClick={() => apply(buildGenreScenePresetCommands(surfaces, shading, preset))}
          >
            {preset.labelKo}
          </button>
        ))}
      </div>
      <div className="cl-render-row" role="group" aria-label="피부·의상 표면 소재 프리셋" data-testid="render-surface-material-presets">
        {WEBTOON_MATERIAL_SURFACE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            data-testid={`render-surface-preset-${preset.id}`}
            aria-pressed={isMaterialSurfacePresetActive(surfaces, preset)}
            title={preset.summaryKo}
            onClick={() => apply(buildMaterialSurfaceCommands(surfaces, preset))}
          >
            {preset.labelKo}
          </button>
        ))}
      </div>
      <div className="cl-render-row" role="group" aria-label="툰 셰이딩·그림자 연출 프리셋" data-testid="render-toon-shadow-presets">
        {WEBTOON_LIGHTING_SHADOW_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="cl-preset-chip"
            data-testid={`render-lighting-preset-${preset.id}`}
            aria-pressed={selected.has(preset.id)}
            title={preset.summaryKo}
            onClick={() => apply(buildLightingShadowCommands(shading, preset))}
          >
            {preset.labelKo}
          </button>
        ))}
      </div>
      <div className="cl-render-row">
        <button
          type="button"
          data-testid="render-reset-material-lighting-btn"
          onClick={() => apply(buildResetMaterialLightingCommands(surfaces))}
        >
          기본 소재·조명 복원
        </button>
      </div>
    </fieldset>
  );
}
