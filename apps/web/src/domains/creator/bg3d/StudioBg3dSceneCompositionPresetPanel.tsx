import { Camera, Check } from "lucide-react";
import { useId, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_BG3D_CONTROL_BUTTON,
  studioBg3dClassNames as cx,
} from "./studio-bg3d-editor-ui";
import { getStudioBg3dGenreScenePackBundleLink } from "./studio-bg3d-genre-scene-pack-links";
import { getStudioBg3dHdriLightingPreset } from "./studio-bg3d-hdri-lighting-presets";
import {
  STUDIO_BG3D_SCENE_GENRES,
  applyStudioBg3dSceneCompositionPreset,
  listStudioBg3dSceneCompositionPresets,
  resolveStudioBg3dSceneCompositionPreset,
  type StudioBg3dSceneCompositionApplyResult,
  type StudioBg3dSceneCompositionPreset,
  type StudioBg3dSceneGenreId,
} from "./studio-bg3d-scene-composition-presets";

import type {
  StudioBg3dCameraSettings,
  StudioBg3dLightingSettings,
} from "./studio-bg3d-scene-document";

export interface StudioBg3dSceneCompositionPresetPanelProps {
  readonly camera: StudioBg3dCameraSettings;
  readonly lighting: StudioBg3dLightingSettings;
  readonly exposure: number;
  readonly disabled?: boolean;
  /**
   * 씬팩 선택 1회로 계산된 카메라+조명+노출(+날씨·태양 시각 연동 값)을 호스트가
   * 씬 문서와 히스토리에 한 번에 반영한다. 부분 적용 콜백은 받지 않는다.
   */
  readonly onApplyScenePack: (result: StudioBg3dSceneCompositionApplyResult) => void;
}

/** 위에서 본 카메라 위치 다이어그램: 가운데 점이 피사체, 바깥 점이 카메라(방위각 위치). */
function CameraAngleThumbnail({
  preset,
  selected,
}: {
  readonly preset: StudioBg3dSceneCompositionPreset;
  readonly selected: boolean;
}) {
  const azimuth = (preset.thumbnail.azimuthDeg * Math.PI) / 180;
  const radius = 26;
  const cameraX = 40 + Math.sin(azimuth) * radius;
  const cameraY = 34 + Math.cos(azimuth) * radius;
  const lightingPreset = getStudioBg3dHdriLightingPreset(preset.lightingPresetId);
  const swatch = lightingPreset?.swatch;
  return (
    <span
      className="relative block h-16 w-full overflow-hidden rounded-md border border-line/60"
      style={
        swatch
          ? { background: `linear-gradient(160deg, ${swatch[0]} 0%, ${swatch[2]} 100%)` }
          : undefined
      }
      aria-hidden
    >
      <svg viewBox="0 0 80 68" className="h-full w-full">
        <circle cx={40} cy={34} r={radius} fill="none" stroke="currentColor" strokeOpacity={0.25} />
        <line
          x1={40}
          y1={34}
          x2={cameraX}
          y2={cameraY}
          stroke="currentColor"
          strokeOpacity={0.5}
          strokeDasharray="3 3"
        />
        <circle cx={40} cy={34} r={4} fill="currentColor" fillOpacity={0.85} />
        <circle
          cx={cameraX}
          cy={cameraY}
          r={5}
          fill={selected ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth={1.5}
        />
      </svg>
      <span className="absolute bottom-1 left-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white">
        {preset.thumbnail.framingLabelKo} · {preset.camera.fovDegrees}°
      </span>
      <span className="absolute right-1 top-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-white">
        {preset.thumbnail.elevationDeg}°
      </span>
    </span>
  );
}

/**
 * 배경 카메라 구도 프리셋 + 장르 씬팩 패널.
 * 장르 칩으로 거른 뒤 카드(카메라 앵글 썸네일)를 한 번 누르면 카메라와 조명이 함께 적용된다.
 */
export function StudioBg3dSceneCompositionPresetPanel({
  camera,
  lighting,
  exposure,
  disabled = false,
  onApplyScenePack,
}: StudioBg3dSceneCompositionPresetPanelProps) {
  const id = useId().replaceAll(":", "");
  const copy = useBilingual("bg3d-scene-composition-presets");
  const [genreId, setGenreId] = useState<StudioBg3dSceneGenreId | null>(null);
  const activePreset = resolveStudioBg3dSceneCompositionPreset({ camera, lighting, exposure });
  const presets = listStudioBg3dSceneCompositionPresets(genreId);

  const apply = (preset: StudioBg3dSceneCompositionPreset) => {
    const result = applyStudioBg3dSceneCompositionPreset(
      { camera, lighting, exposure },
      preset.id,
    );
    if (result) onApplyScenePack(result);
  };

  return (
    <section
      data-testid="bg3d-scene-composition-presets"
      aria-labelledby={`${id}-title`}
      className="mt-4 rounded-lg border border-line bg-card/45 px-3 pb-3 pt-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Camera size={13} aria-hidden />
            {copy("장르 씬팩 · 카메라 구도 프리셋", "Genre scene packs · Camera framing presets")}
          </h3>
          <p className="mt-0.5 text-[0.625rem] leading-relaxed text-fg-3">
            {copy(
              "씬 카드를 고르면 카메라 앵글과 어울리는 조명·노출이 함께 적용됩니다.",
              "Pick a scene card to apply its camera angle together with matching lighting and exposure.",
            )}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-panel px-2 py-1 text-[0.5625rem] font-semibold text-fg-3">
          {copy("카메라+조명", "Camera + light")}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={copy("장르", "Genre")}>
        <button
          type="button"
          aria-pressed={genreId === null}
          disabled={disabled}
          onClick={() => setGenreId(null)}
          className={cx(
            "rounded-full border border-line bg-panel px-2 py-1 text-[0.625rem] font-semibold text-fg-2",
            genreId === null && "border-accent/60 bg-accent-soft text-accent",
          )}
        >
          {copy("전체", "All")}
        </button>
        {STUDIO_BG3D_SCENE_GENRES.map((genre) => (
          <button
            key={genre.id}
            type="button"
            aria-pressed={genreId === genre.id}
            disabled={disabled}
            onClick={() => setGenreId(genre.id)}
            className={cx(
              "rounded-full border border-line bg-panel px-2 py-1 text-[0.625rem] font-semibold text-fg-2",
              genreId === genre.id && "border-accent/60 bg-accent-soft text-accent",
            )}
          >
            {copy(genre.labelKo, genre.labelEn)}
          </button>
        ))}
      </div>

      <div className="mt-2 grid min-w-0 grid-cols-2 gap-1.5" role="group" aria-labelledby={`${id}-title`}>
        {presets.map((preset) => {
          const selected = preset.id === activePreset?.id;
          const lightingPreset = getStudioBg3dHdriLightingPreset(preset.lightingPresetId);
          const bundleLink = getStudioBg3dGenreScenePackBundleLink(preset.id);
          return (
            <button
              key={preset.id}
              type="button"
              aria-label={copy(
                `${preset.labelKo} 씬팩 적용 (카메라+조명)`,
                `Apply ${preset.labelEn} scene pack (camera + lighting)`,
              )}
              aria-pressed={selected}
              title={copy(preset.tooltipKo, preset.tooltipEn)}
              disabled={disabled}
              data-testid={`bg3d-scene-composition-preset-${preset.id}`}
              className={cx(
                STUDIO_BG3D_CONTROL_BUTTON,
                "relative min-w-0 flex-col items-stretch gap-1.5 border-line bg-panel px-2.5 pb-2 pt-2 text-left text-fg-2 hover:bg-raised hover:text-fg",
                selected && "border-accent/60 bg-accent-soft text-accent",
              )}
              onClick={() => apply(preset)}
            >
              <CameraAngleThumbnail preset={preset} selected={selected} />
              <span className="flex min-w-0 items-center justify-between gap-1.5">
                <span className="truncate text-xs font-bold">
                  {copy(preset.labelKo, preset.labelEn)}
                </span>
                {selected ? <Check size={12} className="shrink-0" aria-hidden /> : null}
              </span>
              <span className="line-clamp-2 min-h-7 text-[0.625rem] leading-snug text-fg-3">
                {copy(preset.descriptionKo, preset.descriptionEn)}
              </span>
              <span className="flex flex-wrap items-center gap-1">
                {lightingPreset ? (
                  <span className="w-fit rounded-full border border-line bg-card px-1.5 py-0.5 text-[0.5625rem] font-semibold text-fg-3">
                    {copy(
                      `조명: ${lightingPreset.labelKo}`,
                      `Lighting: ${lightingPreset.labelEn}`,
                    )}
                  </span>
                ) : null}
                {bundleLink ? (
                  <span
                    data-testid={`bg3d-scene-pack-bundle-link-${preset.id}`}
                    title={bundleLink.packs.map((pack) => pack.packTitle).join(" · ")}
                    className="w-fit rounded-full border border-accent/35 bg-accent/10 px-1.5 py-0.5 text-[0.5625rem] font-semibold text-accent"
                  >
                    {copy(
                      `번들 팩 ${bundleLink.packs.length}종 · 에셋 ${bundleLink.totalPlaceable}개`,
                      `${bundleLink.packs.length} bundle packs · ${bundleLink.totalPlaceable} assets`,
                    )}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[0.625rem] leading-relaxed text-fg-3">
        {copy(
          "적용 후 카메라나 조명을 직접 바꾸면 '사용자 설정'으로 표시됩니다. 환경 이미지: Poly Haven (CC0)",
          "Editing the camera or lighting afterwards marks the setup as custom. Environment images: Poly Haven (CC0)",
        )}
      </p>
    </section>
  );
}
