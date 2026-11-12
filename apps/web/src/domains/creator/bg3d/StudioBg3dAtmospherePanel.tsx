import { Check, CloudRain, Sun, Sparkles } from "lucide-react";
import { useEffect, useState, useId, useMemo } from "react";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import {
  Studio3DAtmosphereEngine,
  type Studio3DAtmospherePreset,
  type WeatherPresetId,
} from "../scene-3d/studio-3d-atmosphere-weather";
import {
  DEFAULT_HEIGHT_FOG_PARAMS,
  computeCameraFollowingLightDirection,
  computeExponentialHeightFogFactor,
} from "../scene-3d/studio-3d-feature-pack-2026";

export interface StudioBg3dAtmospherePanelProps {
  readonly currentPresetId?: WeatherPresetId;
  readonly onPresetChange?: (preset: Studio3DAtmospherePreset) => void;
  readonly onSunAngleChange?: (azimuthDeg: number, elevationDeg: number) => void;
  readonly disabled?: boolean;
}

/**
 * 하늘·기상과 태양 값의 계획 미리보기다. 현재 장면 적용·저장 명령은 연결하지 않는다.
 * `currentPresetId`가 바뀌면 미리보기 선택 상태도 따라간다.
 */
export function StudioBg3dAtmospherePanel({
  currentPresetId = "golden-hour",
  onPresetChange,
  onSunAngleChange,
  disabled = false,
}: StudioBg3dAtmospherePanelProps) {
  const bt = useBilingual("StudioBg3dAtmospherePanel");
  const idPrefix = useId();
  const [selectedId, setSelectedId] = useState<WeatherPresetId>(currentPresetId);
  const [azimuth, setAzimuth] = useState(45);
  const [elevation, setElevation] = useState(30);

  // 외부에서 전달한 기준 프리셋을 미리보기 선택에 반영한다.
  useEffect(() => {
    setSelectedId(currentPresetId);
  }, [currentPresetId]);

  const presets = Studio3DAtmosphereEngine.getAllPresets();
  const activePreset = Studio3DAtmosphereEngine.getPreset(selectedId);

  const heightFogFactor = useMemo(
    () =>
      computeExponentialHeightFogFactor(
        [0, 1.2, -12],
        [0, 1.6, 5],
        {
          ...DEFAULT_HEIGHT_FOG_PARAMS,
          colorHex: activePreset.fog.colorHex,
          density: Math.max(0.02, activePreset.fog.density * 2.5),
        },
      ),
    [activePreset.fog.colorHex, activePreset.fog.density],
  );

  const cameraLightDir = useMemo(
    () =>
      computeCameraFollowingLightDirection(
        [0, 1.6, 5],
        [0, 1.4, 0],
        { azimuthDeg: azimuth - 45, elevationDeg: Math.max(10, elevation) },
      ),
    [azimuth, elevation],
  );

  const handleSelectPreset = (presetId: WeatherPresetId) => {
    setSelectedId(presetId);
    const p = Studio3DAtmosphereEngine.getPreset(presetId);
    onPresetChange?.(p);
  };

  const handleElevationChange = (newElevation: number) => {
    setElevation(newElevation);
    onSunAngleChange?.(azimuth, newElevation);
  };

  const handleAzimuthChange = (newAzimuth: number) => {
    setAzimuth(newAzimuth);
    onSunAngleChange?.(newAzimuth, elevation);
  };

  const elevationId = `${idPrefix}-elevation`;
  const azimuthId = `${idPrefix}-azimuth`;
  const titleId = `${idPrefix}-title`;

  return (
    <div
      className="flex flex-col gap-3 p-3 text-xs text-fg"
      data-testid="bg3d-atmosphere-panel"
      aria-labelledby={titleId}
    >
      <div>
        <span id={titleId} className="mb-1 block text-[0.75rem] font-bold text-fg">
          {bt("하늘·기상 설정 미리보기 (12종)", "Sky and weather preview (12 presets)")}
        </span>
        <p className="mb-2 text-[0.65rem] leading-relaxed text-fg-3">
          {bt("색상·안개·태양 값을 살펴보는 미리보기입니다. 현재 3D 장면에는 적용하거나 저장하지 않습니다.", "Preview color, fog and sun settings. These controls do not apply or save changes to the current 3D scene.")}
        </p>
        <div
          className="grid grid-cols-2 gap-1.5 sm:grid-cols-3"
          role="group"
          aria-label="3D 하늘 및 기상 분위기 프리셋"
        >
          {presets.map((p) => {
            const selected = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => handleSelectPreset(p.id)}
                title={`${p.name} — ${p.description}`}
                aria-pressed={selected}
                className={`flex min-w-0 flex-col items-stretch gap-1.5 rounded-lg border p-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45 ${
                  selected
                    ? "border-accent bg-accent/15 text-accent shadow-sm"
                    : "border-line bg-card text-fg hover:border-line-strong hover:bg-raised"
                }`}
              >
                <span
                  className="h-7 w-full rounded-md border border-line/60"
                  style={{
                    background: `linear-gradient(180deg, ${p.lighting.ambientSkyColorHex} 0%, ${p.fog.colorHex} 100%)`,
                  }}
                  aria-hidden
                />
                <span className="flex min-w-0 items-center justify-between gap-1.5">
                  <span className="flex min-w-0 items-center gap-1.5 text-[0.7rem] font-bold">
                    {p.precipitation.kind !== "none" ? (
                      <CloudRain className="h-3.5 w-3.5 shrink-0 text-accent" />
                    ) : (
                      <Sun className="h-3.5 w-3.5 shrink-0 text-warn" />
                    )}
                    <span className="truncate">{p.name}</span>
                  </span>
                  {selected ? (
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                  ) : null}
                </span>
                <span className="line-clamp-1 text-[0.65rem] text-fg-3">
                  {p.description}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Atmosphere Detail Overview */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[0.7rem] font-semibold text-fg-2">조명 & 강수 상태</span>
          <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[0.65rem] font-bold text-accent">
            {activePreset.name}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[0.68rem]">
          <div className="flex items-center gap-2">
            <span className="text-fg-3">태양광 색상:</span>
            <span
              className="inline-block h-3.5 w-3.5 rounded-full border border-line"
              style={{ backgroundColor: activePreset.lighting.sunColorHex }}
            />
            <span className="font-mono">{activePreset.lighting.sunColorHex}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-fg-3">안개 색상:</span>
            <span
              className="inline-block h-3.5 w-3.5 rounded-full border border-line"
              style={{ backgroundColor: activePreset.fog.colorHex }}
            />
            <span className="font-mono">{activePreset.fog.colorHex}</span>
          </div>
        </div>

        {activePreset.precipitation.kind !== "none" && (
          <div className="flex items-center gap-1.5 rounded-lg bg-raised/80 px-2 py-1 text-[0.65rem] text-fg-2">
            <Sparkles className="h-3 w-3 text-accent" />
            <span>
              강수 파티클: {activePreset.precipitation.kind} ({activePreset.precipitation.particleCount}개, 낙하 속도 {activePreset.precipitation.dropSpeed}m/s)
            </span>
          </div>
        )}

        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t border-line/50 pt-1.5 text-[0.64rem] text-fg-3"
          data-testid="bg3d-atmosphere-height-fog-readout"
        >
          <span>높이 기반 안개 감쇠율: {(heightFogFactor * 100).toFixed(1)}%</span>
          <span className="font-mono">
            카메라 추적광: ({cameraLightDir[0].toFixed(2)}, {cameraLightDir[1].toFixed(2)},{" "}
            {cameraLightDir[2].toFixed(2)})
          </span>
        </div>
      </div>

      {/* Sun/Moon Position Dial Sliders */}
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-card/60 p-2.5">
        <div className="flex items-center gap-1.5 text-[0.7rem] font-semibold text-fg-2">
          <Sun className="h-3.5 w-3.5 text-accent" aria-hidden />
          <span>{bt("태양 고도·방위각 미리보기", "Sun elevation and azimuth preview")}</span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor={elevationId} className="text-[0.68rem] text-fg-3">
              태양 고도 (Elevation)
            </label>
            <span className="font-mono text-[0.68rem]">{elevation}°</span>
          </div>
          <input
            id={elevationId}
            type="range"
            min={-10}
            max={90}
            step={1}
            value={elevation}
            disabled={disabled}
            onChange={(e) => handleElevationChange(Number(e.target.value))}
            className="accent-accent"
          />
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label htmlFor={azimuthId} className="text-[0.68rem] text-fg-3">
              태양 방위각 (Azimuth)
            </label>
            <span className="font-mono text-[0.68rem]">{azimuth}°</span>
          </div>
          <input
            id={azimuthId}
            type="range"
            min={0}
            max={360}
            step={5}
            value={azimuth}
            disabled={disabled}
            onChange={(e) => handleAzimuthChange(Number(e.target.value))}
            className="accent-accent"
          />
        </div>
      </div>
    </div>
  );
}
