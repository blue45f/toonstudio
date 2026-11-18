/** 소재·조명·장르 프리셋 조작을 렌더 패널의 한 섹션으로 묶는다. */
import {
  WEBTOON_GENRE_SCENE_PRESETS,
  WEBTOON_LIGHTING_SHADOW_PRESETS,
  WEBTOON_MATERIAL_SURFACE_PRESETS,
  buildGenreScenePresetCommands,
  buildLightingShadowCommands,
  buildMaterialSurfaceCommands,
  buildResetMaterialLightingCommands,
  isMaterialSurfacePresetActive,
  summarizeActiveMaterialAndShadowKo,
} from "./render-material-lighting-presets";

import type { LabCommand, ShadingProfile, Surfaces } from "../../../contracts";

interface RenderMaterialLightingControlsProps {
  readonly surfaces: Surfaces;
  readonly shading: ShadingProfile;
  readonly dispatch: (command: LabCommand) => void;
}

export function RenderMaterialLightingControls({ surfaces, shading, dispatch }: RenderMaterialLightingControlsProps) {
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
            title={`[${preset.genreTagKo}] ${preset.summaryKo}`}
            onClick={() => {
              for (const command of buildGenreScenePresetCommands(surfaces, shading, preset)) dispatch(command);
            }}
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
            onClick={() => {
              for (const command of buildMaterialSurfaceCommands(surfaces, preset)) dispatch(command);
            }}
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
            title={preset.summaryKo}
            onClick={() => {
              for (const command of buildLightingShadowCommands(shading, preset)) dispatch(command);
            }}
          >
            {preset.labelKo}
          </button>
        ))}
      </div>
      <div className="cl-render-row">
        <button
          type="button"
          data-testid="render-reset-material-lighting-btn"
          onClick={() => {
            for (const command of buildResetMaterialLightingCommands(surfaces)) dispatch(command);
          }}
        >
          기본 소재·조명 복원
        </button>
      </div>
    </fieldset>
  );
}
