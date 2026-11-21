import { ChevronDown, Droplets, Layers, PenTool } from "lucide-react";

import {
  MANGA_NIB_PERSONALITY_PROFILES,
  type MangaNibPersonalityId,
} from "@toonstudio/studio-brush-platform/natural-media";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { STUDIO_SPECTRAL_WGM_COLOR_MIX_PROGRAM_ID } from "../studio-spectral-wgm-mix-v1";

import type { NormalizedStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import { updateStudioBrushDynamicsColorDynamics } from "./studio-brush-dynamics-editor";
import {
  studioBrushEngineProgramSetWithOil,
  studioOilProgramSetForBrush,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";
import type { StudioBrushUnifiedMediaPhysics } from "./studio-brush-studio-constants";
import { RangeRow, ToggleRow } from "./StudioBrushSettingRows";

import { cn } from "@/shared/lib/utils";

const NIB_PERSONALITY_IDS: readonly MangaNibPersonalityId[] = [
  "g-pen",
  "maru-pen",
  "kabura-pen",
  "school-pen",
  "fude-brush-pen",
] as const;

export interface StudioBrushUnifiedMediaControlsProps {
  readonly brushId: string;
  readonly settings: NormalizedStudioBrushDynamicsSettings;
  readonly onSettingsChange: (next: NormalizedStudioBrushDynamicsSettings) => void;
  readonly enginePrograms?: StudioBrushEngineProgramSet | null;
  readonly onEngineProgramsChange?: (next: StudioBrushEngineProgramSet | null) => void;
  readonly mediaPhysics: StudioBrushUnifiedMediaPhysics;
  readonly onMediaPhysicsChange: (patch: Partial<StudioBrushUnifiedMediaPhysics>) => void;
  readonly defaultOpen?: boolean;
}

/**
 * 코어·자연매체 브러시까지 전 241종 브러시에서 일관되게 편집할 수 있는
 * 접기/펼치기형 통합 물성 패널 (임파스토 깊이 · 38밴드 KM 습식 혼색 · 딥펜 레일로딩).
 */
export function StudioBrushUnifiedMediaControls({
  brushId,
  settings,
  onSettingsChange,
  enginePrograms,
  onEngineProgramsChange,
  mediaPhysics,
  onMediaPhysicsChange,
  defaultOpen = false,
}: StudioBrushUnifiedMediaControlsProps) {
  const spectralWetActive =
    settings.colorDynamics.pigmentMixProgramId === STUDIO_SPECTRAL_WGM_COLOR_MIX_PROGRAM_ID
    || mediaPhysics.wetMixStrength > 0;
  const oilPrograms = enginePrograms?.oil ?? studioOilProgramSetForBrush(brushId);
  const activeCount =
    (mediaPhysics.impastoDepth > 0 || oilPrograms.impastoRelief ? 1 : 0)
    + (spectralWetActive ? 1 : 0)
    + (mediaPhysics.railroadEnabled ? 1 : 0);

  const selectedNib = MANGA_NIB_PERSONALITY_PROFILES[mediaPhysics.nibPersonality];

  const handleToggleImpastoRelief = (enabled: boolean) => {
    onMediaPhysicsChange({ impastoDepth: enabled ? Math.max(0.45, mediaPhysics.impastoDepth) : 0 });
    if (onEngineProgramsChange) {
      onEngineProgramsChange(
        studioBrushEngineProgramSetWithOil(enginePrograms, {
          ...oilPrograms,
          impastoRelief: enabled,
        }),
      );
    }
  };

  const handleImpastoDepthChange = (impastoDepth: number) => {
    onMediaPhysicsChange({ impastoDepth });
    if (onEngineProgramsChange) {
      onEngineProgramsChange(
        studioBrushEngineProgramSetWithOil(enginePrograms, {
          ...oilPrograms,
          impastoRelief: impastoDepth > 0,
        }),
      );
    }
  };

  const handleToggleSpectralWetMix = (enabled: boolean) => {
    const nextMix = enabled ? Math.max(0.45, mediaPhysics.wetMixStrength) : 0;
    onMediaPhysicsChange({ wetMixStrength: nextMix });
    onSettingsChange(
      updateStudioBrushDynamicsColorDynamics(settings, {
        foregroundBackgroundMix: nextMix,
        pigmentMixProgramId: enabled ? STUDIO_SPECTRAL_WGM_COLOR_MIX_PROGRAM_ID : null,
      }),
    );
  };

  const handleWetMixStrengthChange = (wetMixStrength: number) => {
    onMediaPhysicsChange({ wetMixStrength });
    onSettingsChange(
      updateStudioBrushDynamicsColorDynamics(settings, {
        foregroundBackgroundMix: wetMixStrength,
        pigmentMixProgramId: wetMixStrength > 0 ? STUDIO_SPECTRAL_WGM_COLOR_MIX_PROGRAM_ID : null,
      }),
    );
  };

  return (
    <details
      open={defaultOpen}
      data-studio-brush-unified-media="true"
      className="group rounded-xl border border-line bg-card/45"
    >
      <summary
        className={cn(
          "flex min-h-12 cursor-pointer list-none items-center justify-between gap-2.5 px-3 py-2 text-xs font-bold text-fg select-none [&::-webkit-details-marker]:hidden",
          STUDIO_FOCUS_RING,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Layers size={15} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-xs font-bold text-fg">
              자연매체 물성 (임파스토 · 38밴드 혼색 · 레일로딩)
            </span>
            <span className="block truncate text-xs font-normal text-fg-3">
              코어·입자 구분 없이 전 브러시에 두께·습식 혼색·딥펜 갈라짐 적용
            </span>
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full border border-line bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-fg-2">
            {activeCount > 0 ? `${activeCount}개 활성` : "기본"}
          </span>
          <ChevronDown
            size={15}
            className="text-fg-3 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </span>
      </summary>

      <div className="space-y-3 border-t border-line p-3">
        {/* 1. 임파스토 깊이 & 유화 릴리프 */}
        <div className="space-y-2 rounded-xl border border-line/70 bg-panel/60 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Layers size={14} className="text-accent" aria-hidden />
            임파스토 물감 두께
          </p>
          <ToggleRow
            label="임파스토 릴리프 사용"
            description="쌓인 물감 능선에 광원 하이라이트와 그림자를 표현합니다"
            checked={oilPrograms.impastoRelief || mediaPhysics.impastoDepth > 0}
            onChange={handleToggleImpastoRelief}
          />
          <RangeRow
            label="임파스토 깊이"
            value={mediaPhysics.impastoDepth}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(mediaPhysics.impastoDepth * 100)}%`}
            hint="높을수록 붓자국 능선이 두껍고 입체적으로 살아납니다"
            onChange={handleImpastoDepthChange}
          />
        </div>

        {/* 2. 38밴드 KM 습식 혼색 */}
        <div className="space-y-2 rounded-xl border border-line/70 bg-panel/60 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <Droplets size={14} className="text-accent" aria-hidden />
            38밴드 KM 습식 안료 혼색
          </p>
          <ToggleRow
            label="스펙트럼 감산 혼색 사용"
            description="청·황 혼합 시 탁한 회색 대신 선명한 녹색 안료 반응을 유지합니다"
            checked={spectralWetActive}
            onChange={handleToggleSpectralWetMix}
          />
          <RangeRow
            label="38밴드 KM 습식 혼색 강도"
            value={mediaPhysics.wetMixStrength}
            min={0}
            max={1}
            step={0.05}
            display={`${Math.round(mediaPhysics.wetMixStrength * 100)}%`}
            hint="전경색과 캔버스·보조색이 젖은 상태로 섞이는 비율"
            onChange={handleWetMixStrengthChange}
          />
        </div>

        {/* 3. 딥펜 과압 레일로딩 */}
        <div className="space-y-2 rounded-xl border border-line/70 bg-panel/60 p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-bold text-fg">
            <PenTool size={14} className="text-accent" aria-hidden />
            딥펜 과압 레일로딩 (잉크 갈라짐)
          </p>
          <ToggleRow
            label="딥펜 레일로딩 사용"
            description="강한 필압으로 닙이 벌어질 때 중앙 잉크 막이 갈라지는 물리 표현"
            checked={mediaPhysics.railroadEnabled}
            onChange={(railroadEnabled) => onMediaPhysicsChange({ railroadEnabled })}
          />
          {mediaPhysics.railroadEnabled ? (
            <>
              <div
                role="radiogroup"
                aria-label="딥펜 닙 물리 성향"
                className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
              >
                {NIB_PERSONALITY_IDS.map((id) => {
                  const profile = MANGA_NIB_PERSONALITY_PROFILES[id];
                  const active = mediaPhysics.nibPersonality === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        onMediaPhysicsChange({
                          nibPersonality: id,
                          railroadThreshold: profile.railroadThresholdRatio,
                        })
                      }
                      className={cn(
                        "min-h-11 rounded-lg border px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                        STUDIO_FOCUS_RING,
                        active
                          ? "border-accent bg-accent-soft text-fg"
                          : "border-line bg-card text-fg-2 hover:bg-raised",
                      )}
                    >
                      {profile.labelKo}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs leading-relaxed text-fg-3">{selectedNib.characterSummaryKo}</p>
              <RangeRow
                label="레일로딩 갈라짐 임계 필압"
                value={mediaPhysics.railroadThreshold}
                min={0.2}
                max={0.98}
                step={0.02}
                display={`${Math.round(mediaPhysics.railroadThreshold * 100)}%`}
                hint="이 필압 이상으로 누르면 두 갈래 잉크 선이 분리됩니다"
                onChange={(railroadThreshold) => onMediaPhysicsChange({ railroadThreshold })}
              />
            </>
          ) : null}
        </div>
      </div>
    </details>
  );
}
