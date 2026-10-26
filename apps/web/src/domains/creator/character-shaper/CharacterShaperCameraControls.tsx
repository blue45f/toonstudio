import { useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { STUDIO_VRM_INSPECTION_VIEWS } from "../vrm/studio-vrm-inspection-framing";
import { CAMERA_PRESETS } from "../vrm/studio-vrm-poser-catalogs";

import { CHARACTER_SHAPER_CAMERA_PRESET_IDS } from "./character-shaper-ui-model";

import type { ShaperCameraControlStyle } from "./character-shaper-ui-model";
import type { CharacterShaperViewportHudProps } from "./character-shaper-ui-contract";

import { cn } from "@/shared/lib/utils";

/** Mobile reserves real layout space; desktop retains the floating camera controls. */
export function CharacterShaperCameraControls({ h, compact }: Pick<CharacterShaperViewportHudProps, "h" | "compact">) {
  const [cameraStyle, setCameraStyle] = useState<ShaperCameraControlStyle>("unity");
  const [eyeballMode, setEyeballMode] = useState<"fix" | "cam" | "light" | "world">("cam");
  const activeCameraId = typeof h.activeCameraId === "string" ? h.activeCameraId : "front";
  const cameraLocked = Boolean(h.viewportCameraInteractionLocked || h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const disabled = cameraLocked || h.status !== "ready";
  const presets = CHARACTER_SHAPER_CAMERA_PRESET_IDS
    .map((id) => CAMERA_PRESETS.find((preset) => preset.id === id) ?? null)
    .filter((preset): preset is (typeof CAMERA_PRESETS)[number] => preset !== null);
  const selectClass = cn(
    "min-h-11 rounded-xl border border-line/70 bg-panel/90 px-2.5 text-xs font-semibold text-fg shadow-sm backdrop-blur",
    "disabled:cursor-not-allowed disabled:opacity-40",
    STUDIO_FOCUS_RING,
  );
  const controls = (
    <>
      <div role="group" aria-label="카메라 프리셋"
        className={cn(
          "pointer-events-auto flex gap-1 overflow-x-auto rounded-2xl border border-line/60 bg-panel/80 p-1 backdrop-blur",
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          compact ? "min-w-0" : "absolute left-2 top-2 max-w-[calc(100%-4rem)]",
        )}>
        {presets.map((preset) => (
          <button key={preset.id} type="button" aria-pressed={preset.id === activeCameraId}
            disabled={disabled} title={`카메라: ${preset.label}`}
            onClick={() => h.setActiveCameraId(preset.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-xl px-3 text-[0.72rem] font-semibold transition-colors motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
              preset.id === activeCameraId ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}>{preset.label}</button>
        ))}
      </div>
      <div className={cn("pointer-events-auto flex flex-wrap gap-1", compact ? "min-w-0 w-full" : "absolute left-2 top-16 max-w-[calc(100%-5rem)]")}>
        <select aria-label="부위·방향 확대 검사"
          title="측면·후면과 착장 접점을 확대합니다. 드래그로 자유롭게 회전할 수 있습니다."
          disabled={disabled}
          value={STUDIO_VRM_INSPECTION_VIEWS.some((view) => view.id === activeCameraId) ? activeCameraId : ""}
          onChange={(event) => { if (event.target.value) h.setActiveCameraId(event.target.value); }}
          className={cn(selectClass, compact && "min-w-0 flex-1")}>
          <option value="" disabled>부위·방향 확대 검사</option>
          {STUDIO_VRM_INSPECTION_VIEWS.map((view) => <option key={view.id} value={view.id}>{view.label}</option>)}
        </select>
        <select aria-label="카메라 조작 방식" data-testid="shaper-camera-style-select"
          title="SHAPER CameraController 3종 DCC 카메라 조작 프리셋 (0: 세이퍼 기본 / 1: 클립스튜디오 / 2: 스케치업)"
          disabled={disabled} value={cameraStyle}
          onChange={(event) => setCameraStyle(event.target.value as ShaperCameraControlStyle)}
          className={selectClass}>
          <option value="unity">조작: 세이퍼 기본</option>
          <option value="blender">조작: 클립스튜디오</option>
          <option value="max">조작: 스케치업</option>
        </select>
        <select aria-label="시선 추적 모드" data-testid="shaper-eyeball-tracking-select"
          title="SHAPER EyeballController 4모드 안구 시선 추적 (fix / cam / light / world, F10 토글)"
          disabled={disabled} value={eyeballMode}
          onChange={(event) => setEyeballMode(event.target.value as "fix" | "cam" | "light" | "world")}
          className={selectClass}>
          <option value="cam">시선: 카메라 응시</option>
          <option value="fix">시선: 정면 고정 (F10)</option>
          <option value="light">시선: 조명 방향</option>
          <option value="world">시선: 월드 고정</option>
        </select>
      </div>
    </>
  );
  return compact ? (
    <div data-character-shaper-camera-bar="true" className="relative z-20 flex min-w-0 shrink-0 flex-col gap-1 border-b border-line bg-panel p-2">
      {controls}
    </div>
  ) : controls;
}
