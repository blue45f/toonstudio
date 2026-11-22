import { Lightbulb, LightbulbOff, Moon, Sun } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import {
  STUDIO_MINIMAP_DEFAULT_LANDMARKS,
  computeVirtualSpaceDaylightAtHour,
  createVirtualSpaceMinimapCameraState,
  jumpMinimapCameraToLandmark,
  resolveVirtualSpaceLiveChoreography,
  type StudioLiveWorkState,
  type StudioMinimapLandmarkId,
} from "./atmosphere";
import {
  STUDIO_DAY_NIGHT_CYCLE_MS,
  studioDayNightName,
} from "./studio-virtual-space-day-night-cycle";
import {
  studioDayNightLightingPhaseAt,
  studioLightingPresetForDayNightPhase,
} from "./studio-virtual-space-day-night-lighting";
import {
  STUDIO_LIGHT_FIXTURE_KINDS,
  studioDayPhaseLabel,
  type StudioAmbientLight,
  type StudioDayPhase,
  type StudioLightFixture,
} from "./studio-virtual-space-lighting";
import {
  STUDIO_LIGHTING_PRESET_KEYS,
  STUDIO_LIGHTING_PRESETS,
  type StudioLightingPresetKey,
} from "./studio-virtual-space-lighting-presets";

/**
 * 조명 패널
 *
 * - 현재 시간대·주변광 표시 (날씨 연동)
 * - 조명 기구 켜기/끄기·밝기 조절
 * - 시간대 수동 오버라이드 (프리뷰용)
 * - 주야 사이클 시간대 프리셋 자동 적용 토글·현재 시간대 프리셋 추천 표시
 */
export function StudioVirtualSpaceLightingPanel({
  fixtures,
  ambient,
  hour,
  hourOverride,
  onToggleFixture,
  onDimmerChange,
  onHourOverride,
  onClearHourOverride,
  onApplyPreset,
  cycleEnabled,
  cycleAutoLighting,
  onCycleAutoLightingChange,
  cycleTimeOfDay,
  cycleSpeedMs,
  onToggleCycle,
  onCycleScrub,
  onCycleSpeedChange,
  liveWorkState,
  activeMinimapLandmarkId,
  onSelectMinimapLandmark,
  reducedMotion,
}: {
  readonly fixtures: readonly StudioLightFixture[];
  readonly ambient: StudioAmbientLight;
  /** 실제 시간 (0-23). */
  readonly hour: number;
  /** 수동 오버라이드 시간 (null이면 실제 시간). */
  readonly hourOverride: number | null;
  readonly onToggleFixture: (id: string) => void;
  readonly onDimmerChange: (id: string, dimmer: number) => void;
  readonly onHourOverride: (hour: number) => void;
  readonly onClearHourOverride: () => void;
  /** 프리셋 버튼 섹션 (없으면 숨긴다). */
  readonly onApplyPreset?: (key: StudioLightingPresetKey) => void;
  /** 주야 사이클 토글 (제공되면 패널에 사이클 섹션이 나타난다). */
  readonly cycleEnabled?: boolean;
  /** 사이클 시간대 프리셋 자동 적용 on/off (최소 토글). */
  readonly cycleAutoLighting?: boolean;
  readonly onCycleAutoLightingChange?: (enabled: boolean) => void;
  /** 현재 가상 시각 (0~1 하루 분율). */
  readonly cycleTimeOfDay?: number;
  /** 한 바퀴 주기 (ms). 기본 24시간. */
  readonly cycleSpeedMs?: number;
  readonly onToggleCycle?: () => void;
  readonly onCycleScrub?: (timeOfDay: number) => void;
  readonly onCycleSpeedChange?: (cycleMs: number) => void;
  /** 실시간 작업 상태 연동 모션 미리보기(전달 시 표시). */
  readonly liveWorkState?: StudioLiveWorkState;
  /** 현재 선택된 미니맵 원클릭 거점 ID. */
  readonly activeMinimapLandmarkId?: StudioMinimapLandmarkId | null;
  /** 미니맵 거점 원클릭 이동 콜백(전달 시 거점 이동 버튼 표시). */
  readonly onSelectMinimapLandmark?: (
    landmarkId: StudioMinimapLandmarkId,
    target: { readonly x: number; readonly y: number },
  ) => void;
  /** 모션 줄이기 설정(미니맵 즉시 점프 계산에 반영). */
  readonly reducedMotion?: boolean;
}) {
  const bt = useBilingual("StudioVirtualSpaceLightingPanel");
  const phaseLabel = studioDayPhaseLabel(ambient.phase);
  const isDay = ambient.level >= 0.7;
  const cycleSpeed = cycleSpeedMs ?? STUDIO_DAY_NIGHT_CYCLE_MS;
  const cycleName = cycleTimeOfDay !== undefined ? studioDayNightName(cycleTimeOfDay) : null;
  const recommendedPresetKey = cycleEnabled === true && cycleTimeOfDay !== undefined
    ? studioLightingPresetForDayNightPhase(studioDayNightLightingPhaseAt(cycleTimeOfDay))
    : null;
  const cycleMinutes = cycleTimeOfDay !== undefined ? Math.round(cycleTimeOfDay * 24 * 60) % 1440 : 0;
  const effectiveHour = cycleEnabled === true && cycleTimeOfDay !== undefined
    ? cycleTimeOfDay * 24
    : (hourOverride ?? hour);
  const daylight = computeVirtualSpaceDaylightAtHour(effectiveHour);
  const liveChoreography = liveWorkState ? resolveVirtualSpaceLiveChoreography(liveWorkState) : null;
  const handleLandmarkJump = (landmarkId: StudioMinimapLandmarkId) => {
    if (!onSelectMinimapLandmark) return;
    const baseCamera = createVirtualSpaceMinimapCameraState({
      landmarkId: activeMinimapLandmarkId ?? null,
    });
    const jumped = jumpMinimapCameraToLandmark(baseCamera, landmarkId, {
      reducedMotion: reducedMotion === true,
    });
    onSelectMinimapLandmark(landmarkId, { x: jumped.targetX, y: jumped.targetY });
  };

  const phaseOptions: readonly StudioDayPhase[] = [
    "dawn", "morning", "noon", "afternoon", "sunset", "night", "midnight",
  ];
  const phaseHour: Record<StudioDayPhase, number> = {
    dawn: 6, morning: 9, noon: 12, afternoon: 16, sunset: 19, night: 21, midnight: 2,
  };

  return (
    <section className="studio-vspace-lighting-panel" aria-label={bt("조명", "Lighting")}>
      <header className="studio-vspace-lighting-header">
        <h2>{bt("조명", "Lighting")}</h2>
        <p className="studio-vspace-lighting-phase" aria-live="polite">
          {isDay ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          <span>{bt(phaseLabel.ko, phaseLabel.en)}</span>
          <span className="studio-vspace-lighting-level">
            {bt("밝기", "Brightness")} {Math.round(ambient.level * 100)}%
          </span>
        </p>
      </header>

      <div
        className="studio-vspace-lighting-atmosphere"
        data-daylight-period={daylight.period}
        data-daylight-kelvin={daylight.kelvin}
      >
        <span>
          {bt(daylight.labelKo, daylight.labelEn)} · {daylight.kelvin}K
        </span>
        <span>
          {bt(
            `창문 빛줄기 ${Math.round(daylight.godRay.opacity * 100)}% · 접지 그림자 ${Math.round(daylight.contactShadow.angleDeg)}° (${daylight.contactShadow.lengthMultiplier.toFixed(2)}x)`,
            `Window rays ${Math.round(daylight.godRay.opacity * 100)}% · Contact shadow ${Math.round(daylight.contactShadow.angleDeg)}° (${daylight.contactShadow.lengthMultiplier.toFixed(2)}x)`,
          )}
        </span>
      </div>

      {liveChoreography && (
        <div className="studio-vspace-lighting-live-status" role="status" aria-live="polite">
          <span aria-hidden>{liveChoreography.bubbleIcon}</span>
          <span>
            {bt(
              `${liveChoreography.actionLabelKo} · ${liveChoreography.bubbleKo}`,
              `${liveChoreography.actionLabelEn} · ${liveChoreography.bubbleEn}`,
            )}
          </span>
        </div>
      )}

      {onSelectMinimapLandmark && (
        <div
          className="studio-vspace-lighting-time"
          role="group"
          aria-label={bt("구역 바로 이동", "Quick zone jump")}
        >
          <span>{bt("구역 바로 이동", "Quick zone jump")}</span>
          <div className="studio-vspace-lighting-phases">
            {STUDIO_MINIMAP_DEFAULT_LANDMARKS.map((landmark) => {
              const selected = activeMinimapLandmarkId === landmark.id;
              return (
                <button
                  key={landmark.id}
                  type="button"
                  className="studio-vspace-lighting-phase-button"
                  data-selected={selected}
                  aria-pressed={selected}
                  onClick={() => handleLandmarkJump(landmark.id)}
                >
                  {bt(landmark.labelKo, landmark.labelEn)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="studio-vspace-lighting-time" role="group" aria-label={bt("시간대 미리보기", "Time preview")}>
        <span>{bt("시간대", "Time of day")}</span>
        <div className="studio-vspace-lighting-phases">
          {phaseOptions.map((phase) => {
            const label = studioDayPhaseLabel(phase);
            const selected = ambient.phase === phase;
            return (
              <button
                key={phase}
                type="button"
                className="studio-vspace-lighting-phase-button"
                data-selected={selected}
                aria-pressed={selected}
                onClick={() => onHourOverride(phaseHour[phase])}
              >
                {bt(label.ko, label.en)}
              </button>
            );
          })}
        </div>
        {hourOverride !== null && (
          <button type="button" onClick={onClearHourOverride}>
            {bt(`실제 시간으로 (${hour}시)`, `Back to real time (${hour}:00)`)}
          </button>
        )}
      </div>

      {onApplyPreset && (
        <div className="studio-vspace-lighting-presets" role="group" aria-label={bt("조명 프리셋", "Lighting presets")}>
          <span>{bt("분위기 프리셋", "Mood presets")}</span>
          <div className="studio-vspace-lighting-preset-buttons">
            {STUDIO_LIGHTING_PRESET_KEYS.map((key) => {
              const preset = STUDIO_LIGHTING_PRESETS[key];
              const recommended = recommendedPresetKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  data-recommended={recommended}
                  title={bt(preset.descriptionKo, preset.descriptionEn)}
                  onClick={() => onApplyPreset(key)}
                >
                  {bt(preset.labelKo, preset.labelEn)}
                  {recommended ? <span className="studio-vspace-lighting-preset-badge">{bt("지금 시간대", "Now")}</span> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {onToggleCycle && (
        <div className="studio-vspace-lighting-cycle" role="group" aria-label={bt("주야 사이클", "Day/night cycle")}>
          <span>{bt("주야 사이클", "Day/night cycle")}</span>
          <button type="button" className="studio-vspace-lighting-cycle-toggle" aria-pressed={cycleEnabled === true}
            onClick={onToggleCycle}>
            {cycleEnabled ? bt("끄기", "Turn off") : bt("켜기", "Turn on")}
          </button>
          {onCycleAutoLightingChange && (
            <button type="button" className="studio-vspace-lighting-cycle-auto" aria-pressed={cycleAutoLighting === true}
              disabled={cycleEnabled !== true}
              onClick={() => onCycleAutoLightingChange(cycleAutoLighting !== true)}>
              {bt("자동 조명", "Auto lighting")}
            </button>
          )}
          {cycleEnabled && cycleName ? (
            <>
              <span className="studio-vspace-lighting-cycle-now" aria-live="polite">
                {bt(cycleName.ko, cycleName.en)} {String(Math.floor(cycleMinutes / 60)).padStart(2, "0")}:{String(cycleMinutes % 60).padStart(2, "0")}
              </span>
              <label className="studio-vspace-lighting-cycle-scrub">
                <span>{bt("가상 시각", "Virtual time")}</span>
                <input type="range" min={0} max={1439} value={cycleMinutes}
                  onChange={(event) => onCycleScrub?.(Number(event.target.value) / 1440)}
                  aria-label={bt("가상 시각", "Virtual time")} />
              </label>
              <label className="studio-vspace-lighting-cycle-speed">
                <span>{bt("사이클 속도", "Cycle speed")}</span>
                <select value={cycleSpeed} onChange={(event) => onCycleSpeedChange?.(Number(event.target.value))}
                  aria-label={bt("사이클 속도", "Cycle speed")}>
                  <option value={STUDIO_DAY_NIGHT_CYCLE_MS}>{bt("24시간", "24 hours")}</option>
                  <option value={3600000}>{bt("1시간", "1 hour")}</option>
                  <option value={600000}>{bt("10분", "10 minutes")}</option>
                </select>
              </label>
            </>
          ) : null}
        </div>
      )}

      <ul className="studio-vspace-lighting-fixtures">
        {fixtures.map((fixture) => {
          const meta = STUDIO_LIGHT_FIXTURE_KINDS.find((kind) => kind.kind === fixture.kind);
          return (
            <li key={fixture.id} className="studio-vspace-lighting-fixture" data-on={fixture.on}>
              <button
                type="button"
                className="studio-vspace-lighting-toggle"
                aria-pressed={fixture.on}
                aria-label={bt(
                  `${meta?.labelKo ?? fixture.kind} ${fixture.on ? "끄기" : "켜기"}`,
                  `Turn ${fixture.on ? "off" : "on"} ${meta?.labelEn ?? fixture.kind}`,
                )}
                onClick={() => onToggleFixture(fixture.id)}
              >
                {fixture.on ? <Lightbulb size={18} aria-hidden /> : <LightbulbOff size={18} aria-hidden />}
                <span aria-hidden>{meta?.icon}</span>
                <span>{bt(meta?.labelKo ?? fixture.kind, meta?.labelEn ?? fixture.kind)}</span>
              </button>
              <label className="studio-vspace-lighting-dimmer">
                <span>{bt("밝기", "Dimmer")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(fixture.dimmer * 100)}
                  disabled={!fixture.on}
                  aria-label={bt(`${meta?.labelKo ?? fixture.kind} 밝기`, `${meta?.labelEn ?? fixture.kind} brightness`)}
                  onChange={(event) => onDimmerChange(fixture.id, Number(event.target.value) / 100)}
                />
              </label>
            </li>
          );
        })}
      </ul>
      {fixtures.length === 0 && (
        <p className="studio-vspace-lighting-empty">
          {bt("배치된 조명이 없습니다. 데코레이션 에디터에서 조명을 추가하세요.", "No lights placed. Add lights from the decoration editor.")}
        </p>
      )}
    </section>
  );
}
