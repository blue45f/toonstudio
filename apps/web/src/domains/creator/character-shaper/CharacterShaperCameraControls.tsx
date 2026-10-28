
import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { STUDIO_VRM_INSPECTION_VIEWS } from "../vrm/studio-vrm-inspection-framing";
import { CAMERA_PRESETS } from "../vrm/studio-vrm-poser-catalogs";

import { CHARACTER_SHAPER_CAMERA_PRESET_IDS } from "./character-shaper-ui-model";

import { useCharacterShaperSessionSettings } from "./character-shaper-session-settings";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { ShaperCameraControlStyle } from "./character-shaper-ui-model";
import type { CharacterShaperViewportHudProps } from "./character-shaper-ui-contract";

import { cn } from "@/shared/lib/utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

/** Mobile reserves real layout space; desktop retains the floating camera controls. */
export function CharacterShaperCameraControls({ h, compact }: Pick<CharacterShaperViewportHudProps, "h" | "compact">) {
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
      <div data-character-camera-selects="true" className={cn("pointer-events-auto flex flex-wrap gap-1", compact ? "min-w-0 w-full" : "absolute left-2 top-16 max-w-[calc(100%-5rem)]")}>
        <select aria-label="부위·방향 확대 검사"
          title="측면·후면과 착장 접점을 확대합니다. 드래그로 자유롭게 회전할 수 있습니다."
          disabled={disabled}
          value={STUDIO_VRM_INSPECTION_VIEWS.some((view) => view.id === activeCameraId) ? activeCameraId : ""}
          onChange={(event) => { if (event.target.value) h.setActiveCameraId(event.target.value); }}
          className={cn(selectClass, compact && "min-w-0 flex-1")}>
          <option value="" disabled>부위·방향 확대 검사</option>
          {STUDIO_VRM_INSPECTION_VIEWS.map((view) => <option key={view.id} value={view.id}>{view.label}</option>)}
        </select>
        <CharacterShaperCameraStyleSelect disabled={disabled} />
        <CharacterShaperGazeSelect h={h} />
      </div>
    </>
  );
  return compact ? (
    <div data-character-shaper-camera-bar="true" className="relative z-20 flex min-w-0 shrink-0 flex-col gap-1 border-b border-line bg-panel p-2">
      {controls}
    </div>
  ) : controls;
}

const SESSION_SELECT = cn("min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line/70 bg-panel/90 px-2 text-xs text-fg disabled:opacity-40", STUDIO_FOCUS_RING);

export function CharacterShaperCameraStyleSelect({ disabled = false, workbench = false }: { readonly disabled?: boolean; readonly workbench?: boolean }) {
  const bt = useBilingual("CharacterShaperCameraControls");
  const settings = useCharacterShaperSessionSettings();
  return <label className="min-w-0 max-w-full text-[0.65rem] text-fg-3">
    <span className="sr-only">{bt("카메라 조작", "Camera controls")}</span>
    <select aria-label={workbench ? bt("3D 카메라 조작 스타일", "3D camera control style") : bt("카메라 조작 방식", "Camera control style")}
      data-testid={workbench ? "workbench-camera-style-select" : "shaper-camera-style-select"}
      disabled={disabled || !settings} value={settings?.cameraStyle ?? "unity"}
      onChange={(event) => settings?.setCameraStyle(event.currentTarget.value as ShaperCameraControlStyle)} className={SESSION_SELECT}>
      <option value="unity">{bt("기본 · 우클릭 회전 / 중간 버튼 이동", "Default · right orbit / middle pan")}</option>
      <option value="blender">{bt("Blender · 중간 버튼 회전", "Blender · middle orbit")}</option>
      <option value="max">{bt("3ds Max · Alt+중간 버튼 회전", "3ds Max · Alt+middle orbit")}</option>
    </select>
    {!settings ? <span className="block">{bt("셰이퍼 작업실에서만 조작 방식을 바꿀 수 있습니다.", "Control styles are available in the Shaper workspace.")}</span> : null}
  </label>;
}

export function CharacterShaperGazeSelect({ h, workbench = false }: { readonly h: StudioVrmPoserHost; readonly workbench?: boolean }) {
  const bt = useBilingual("CharacterShaperCameraControls");
  const settings = useCharacterShaperSessionSettings();
  const supported = Boolean(h.vrm?.lookAt);
  const locked = h.status !== "ready" || Boolean(h.webcamActive || h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const disabled = !settings || !supported || locked;
  return <div className="min-w-0 max-w-full space-y-1 text-[0.65rem] text-fg-3">
    <select aria-label={workbench ? bt("안구 시선 모드", "Eye gaze mode") : bt("시선 추적 모드", "Gaze tracking mode")}
      data-testid={workbench ? "workbench-eyeball-tracking-select" : "shaper-eyeball-tracking-select"}
      disabled={disabled} value={settings?.gazeMode ?? "cam"}
      onChange={(event) => { if (event.currentTarget.value === "cam" || event.currentTarget.value === "fix") settings?.setGazeMode(event.currentTarget.value); }} className={SESSION_SELECT}>
      <option value="cam">{bt("시선: 카메라 응시", "Gaze: follow camera")}</option>
      <option value="fix">{bt("시선: 정면 고정 (F10)", "Gaze: fixed forward (F10)")}</option>
      <option value="light" disabled>{bt("광원 추종 · 미지원", "Follow light · unavailable")}</option>
      <option value="world" disabled>{bt("월드 하이라이트 · 미지원", "World highlight · unavailable")}</option>
    </select>
    {workbench ? <button type="button" data-testid="workbench-eyeball-gaze-lock" disabled={disabled}
      aria-pressed={settings?.gazeMode === "cam"} onClick={() => settings?.setGazeMode((mode) => mode === "cam" ? "fix" : "cam")}
      className="min-h-11 rounded-lg border border-line px-2 disabled:opacity-40">{settings?.gazeMode === "fix" ? bt("F10 정면 고정", "F10 fixed forward") : bt("F10 카메라 응시", "F10 follow camera")}</button> : null}
    {!supported ? <p>{bt("이 모델에 VRM LookAt이 없어 시선을 바꿀 수 없습니다.", "This model has no VRM LookAt gaze controller.")}</p>
      : h.webcamActive ? <p>{bt("웹캠 추적 중에는 웹캠이 시선을 제어합니다.", "Webcam tracking currently controls gaze.")}</p> : null}
    <p className="sr-only">{bt("광원·월드 하이라이트 보정은 현재 렌더러에서 지원하지 않습니다.", "Light/world highlight calibration is unavailable in the current renderer.")}</p>
  </div>;
}
