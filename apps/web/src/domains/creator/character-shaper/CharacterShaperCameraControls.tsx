import { Grid3X3, SlidersHorizontal, Sun } from "lucide-react";
import { useId, useState } from "react";

import { STUDIO_FOCUS_RING } from "../studio-panel-ui";
import { STUDIO_VRM_INSPECTION_VIEWS } from "../vrm/studio-vrm-inspection-framing";
import { CAMERA_PRESETS } from "../vrm/studio-vrm-poser-catalogs";

import {
  applyCameraFocalLengthToCamera,
  applyFrontLightLockToScene,
  SHAPER_CAMERA_FOCAL_PRESETS,
} from "./character-shaper-custom-quality";
import {
  DEFAULT_CHARACTER_SHAPER_GAZE_OFFSET,
  useCharacterShaperSessionSettings,
} from "./character-shaper-session-settings";
import { CHARACTER_SHAPER_CAMERA_PRESET_IDS } from "./character-shaper-ui-model";

import type { CharacterSlotKind } from "./character-shaper-contract";
import type { StudioVrmPoserHost } from "../vrm/StudioVrmPoserHost";
import type { CharacterShaperGazeMode } from "./character-shaper-session-settings";
import type { CharacterShaperViewportHudProps } from "./character-shaper-ui-contract";
import type { ShaperCameraControlStyle } from "./character-shaper-ui-model";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const GAZE_GRID_CELLS: readonly {
  readonly id: string;
  readonly labelKo: string;
  readonly yawDeg: number;
  readonly pitchDeg: number;
}[] = Object.freeze([
  { id: "nw", labelKo: "좌상", yawDeg: -18, pitchDeg: 14 },
  { id: "n", labelKo: "상", yawDeg: 0, pitchDeg: 14 },
  { id: "ne", labelKo: "우상", yawDeg: 18, pitchDeg: 14 },
  { id: "w", labelKo: "좌", yawDeg: -18, pitchDeg: 0 },
  { id: "c", labelKo: "정면", yawDeg: 0, pitchDeg: 0 },
  { id: "e", labelKo: "우", yawDeg: 18, pitchDeg: 0 },
  { id: "sw", labelKo: "좌하", yawDeg: -18, pitchDeg: -14 },
  { id: "s", labelKo: "하", yawDeg: 0, pitchDeg: -14 },
  { id: "se", labelKo: "우하", yawDeg: 18, pitchDeg: -14 },
]);

function isCharacterShaperGazeMode(value: string): value is CharacterShaperGazeMode {
  return value === "cam" || value === "fix" || value === "light" || value === "world";
}

const SLOT_CAMERA_PRESETS: Partial<Record<CharacterSlotKind, readonly string[]>> = {
  hair: ["hairFront", "hairProfile", "hairBack", "bust", "fullBody"],
  "hand-pose": ["inspectLeftHand", "inspectRightHand", "threeQuarter", "bust", "fullBody"],
};

/** 단일 44px 컴팩트 카메라 필 바 — 모바일에서는 프리셋·정면광·세부 카메라 1줄로 3D 뷰포트를 지키고, 보조 4종은 1탭으로 펼친다. */
export function CharacterShaperCameraControls({ h, compact, slot }: Pick<CharacterShaperViewportHudProps, "h" | "compact"> & {
  readonly slot?: CharacterSlotKind;
}) {
  const bt = useBilingual("CharacterShaperCameraControls");
  const extrasId = useId();
  const [focalMm, setFocalMm] = useState(50);
  const [frontLightLocked, setFrontLightLocked] = useState(false);
  const [compactExtrasOpen, setCompactExtrasOpen] = useState(false);
  const activeCameraId = typeof h.activeCameraId === "string" ? h.activeCameraId : "front";
  const cameraLocked = Boolean(h.viewportCameraInteractionLocked || h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const disabled = cameraLocked || h.status !== "ready";
  const slotPresets = slot ? SLOT_CAMERA_PRESETS[slot] : undefined;
  const presets = (slotPresets ?? CHARACTER_SHAPER_CAMERA_PRESET_IDS)
    .map((id) => CAMERA_PRESETS.find((preset) => preset.id === id) ?? null)
    .filter((preset): preset is (typeof CAMERA_PRESETS)[number] => preset !== null);
  const selectClass = cn(
    "min-h-11 shrink-0 rounded-xl border border-line/70 bg-card px-2.5 text-xs font-semibold text-fg",
    "disabled:cursor-not-allowed disabled:opacity-40",
    STUDIO_FOCUS_RING,
  );
  const inspectionViews = slotPresets
    ? [...STUDIO_VRM_INSPECTION_VIEWS, ...CAMERA_PRESETS.filter((preset) =>
        CHARACTER_SHAPER_CAMERA_PRESET_IDS.includes(preset.id) && !slotPresets.includes(preset.id))]
    : STUDIO_VRM_INSPECTION_VIEWS;
  const pickCamera = (id: string) => {
    if (id === activeCameraId) h.handleViewReset();
    else h.setActiveCameraId(id);
  };
  const cameraLabel = (preset: { id: string; label: string }) => {
    switch (preset.id) {
      case "hairFront": return bt("헤어 정면", "Hair front");
      case "hairProfile": return bt("헤어 측면", "Hair profile");
      case "hairBack": return bt("헤어 후면", "Hair back");
      case "inspectLeftHand": return bt("왼손 확대", "Left hand");
      case "inspectRightHand": return bt("오른손 확대", "Right hand");
      default: return preset.label;
    }
  };
  const handleFocalChange = (nextMm: number) => {
    setFocalMm(nextMm);
    const runtime = h.captureRef?.current as { readonly camera?: Parameters<typeof applyCameraFocalLengthToCamera>[0] } | null | undefined;
    applyCameraFocalLengthToCamera(runtime?.camera, nextMm);
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };
  const handleToggleFrontLight = () => {
    const next = !frontLightLocked;
    setFrontLightLocked(next);
    const runtime = h.captureRef?.current as {
      readonly scene?: Parameters<typeof applyFrontLightLockToScene>[0];
      readonly camera?: { readonly position?: { readonly x: number; readonly y: number; readonly z: number } };
    } | null | undefined;
    applyFrontLightLockToScene(runtime?.scene, runtime?.camera?.position, next);
    if (typeof h.invalidateViewport === "function") h.invalidateViewport();
  };
  const inspectionSelect = (
    <select
      aria-label="부위·방향 확대 검사"
      title="측면·후면과 착장 접점을 확대합니다. 드래그로 자유롭게 회전할 수 있습니다."
      disabled={disabled}
      value={inspectionViews.some((view) => view.id === activeCameraId) ? activeCameraId : ""}
      onChange={(event) => pickCamera(event.currentTarget.value)}
      className={cn(selectClass, compact ? "max-w-full md:max-w-[10.5rem]" : "max-w-[10.5rem]")}
    >
      <option value="" disabled>부위·방향 확대 검사</option>
      {inspectionViews.map((view) => <option key={view.id} value={view.id}>{view.label}</option>)}
    </select>
  );
  const primaryRow = (
    <div
      data-character-shaper-camera-pill-bar="true"
      className={cn(
        "pointer-events-auto flex min-h-11 items-center gap-1.5",
        compact
          ? "w-full min-w-0 flex-nowrap overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap"
          : "absolute left-2 top-2 z-20 max-w-[calc(100%-4rem)] flex-wrap rounded-2xl border border-line/70 bg-panel/90 px-2 py-1 shadow-sm backdrop-blur",
      )}
    >
      <div role="group" aria-label="카메라 프리셋" className="flex shrink-0 flex-nowrap items-center gap-1 md:flex-wrap">
        {presets.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-pressed={preset.id === activeCameraId}
            disabled={disabled}
            title={`카메라: ${preset.label}`}
            onClick={() => pickCamera(preset.id)}
            className={cn(
              "min-h-11 shrink-0 rounded-full px-3 text-xs font-semibold transition-colors motion-reduce:transition-none",
              STUDIO_FOCUS_RING,
              preset.id === activeCameraId ? "bg-accent text-on-accent" : "text-fg-2 hover:bg-raised hover:text-fg",
              "disabled:cursor-not-allowed disabled:opacity-40",
            )}
          >
            {cameraLabel(preset)}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="shaper-front-light-toggle"
        aria-pressed={frontLightLocked}
        aria-label="정면 조명 고정"
        title="조명을 정면에 고정해 얼굴 그림자를 깔끔하게 정리합니다."
        disabled={disabled}
        onClick={handleToggleFrontLight}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold",
          "transition-[border-color,background-color,color] duration-150 disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none",
          STUDIO_FOCUS_RING,
          frontLightLocked
            ? "border-accent bg-accent-soft text-accent"
            : "border-line/70 bg-card text-fg-2 hover:bg-raised hover:text-fg",
        )}
      >
        <Sun size={13} aria-hidden />
        <span>정면광</span>
      </button>
      {compact ? (
        <button
          type="button"
          data-testid="shaper-camera-extras-toggle"
          aria-expanded={compactExtrasOpen}
          aria-controls={extrasId}
          aria-label={compactExtrasOpen ? "세부 카메라 설정 접기" : "세부 카메라 설정 펼치기"}
          onClick={() => setCompactExtrasOpen((open) => !open)}
          className={cn(
            "inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold md:hidden",
            "transition-[border-color,background-color,color] duration-150 motion-reduce:transition-none",
            STUDIO_FOCUS_RING,
            compactExtrasOpen
              ? "border-accent bg-accent-soft text-accent"
              : "border-line/70 bg-card text-fg-2 hover:bg-raised hover:text-fg",
          )}
        >
          <SlidersHorizontal size={13} aria-hidden />
          <span>세부 카메라</span>
        </button>
      ) : null}
      {!compact ? <span aria-hidden className="hidden h-5 w-px shrink-0 bg-line/70 xl:block" /> : null}
      {!compact ? (
        <div data-character-camera-selects="true" className="flex flex-wrap items-center gap-1">
          {inspectionSelect}
          <select
            aria-label="카메라 렌즈 초점거리"
            data-testid="shaper-camera-focal-select"
            title="초점거리를 바꿉니다(24mm 광각 ~ 135mm 망원)."
            disabled={disabled}
            value={String(focalMm)}
            onChange={(event) => handleFocalChange(Number(event.currentTarget.value))}
            className={cn(selectClass, "max-w-[8.5rem]")}
          >
            {SHAPER_CAMERA_FOCAL_PRESETS.map((lens) => (
              <option key={lens.focalMm} value={String(lens.focalMm)}>
                {lens.labelKo}
              </option>
            ))}
          </select>
          <CharacterShaperCameraStyleSelect disabled={disabled} compactPill />
          <CharacterShaperGazeSelect h={h} compactPill />
        </div>
      ) : null}
    </div>
  );
  if (!compact) return primaryRow;
  return (
    <div
      data-character-shaper-camera-bar="true"
      className="relative z-20 flex min-h-11 min-w-0 shrink-0 flex-col justify-center border-b border-line bg-panel px-2 py-0.5 md:flex-row md:flex-wrap md:items-center md:gap-1.5"
    >
      {primaryRow}
      <div
        id={extrasId}
        data-character-camera-selects="true"
        data-compact-extras-open={compactExtrasOpen ? "true" : "false"}
        className={cn(
          compactExtrasOpen ? "grid grid-cols-2 gap-1.5 pt-1.5 md:flex md:flex-wrap md:items-center md:gap-1 md:pt-0" : "hidden md:flex md:flex-wrap md:items-center md:gap-1",
        )}
      >
        {inspectionSelect}
        <select
          aria-label="카메라 렌즈 초점거리"
          data-testid="shaper-camera-focal-select"
          title="초점거리를 바꿉니다(24mm 광각 ~ 135mm 망원)."
          disabled={disabled}
          value={String(focalMm)}
          onChange={(event) => handleFocalChange(Number(event.currentTarget.value))}
          className={cn(selectClass, "max-w-full md:max-w-[8.5rem]")}
        >
          {SHAPER_CAMERA_FOCAL_PRESETS.map((lens) => (
            <option key={lens.focalMm} value={String(lens.focalMm)}>
              {lens.labelKo}
            </option>
          ))}
        </select>
        <CharacterShaperCameraStyleSelect disabled={disabled} compactPill />
        <CharacterShaperGazeSelect h={h} compactPill />
      </div>
    </div>
  );
}

const SESSION_SELECT = cn(
  "min-h-11 w-full min-w-0 max-w-full rounded-xl border border-line/70 bg-panel/90 px-2 text-xs text-fg disabled:opacity-40",
  STUDIO_FOCUS_RING,
);
const COMPACT_PILL_SELECT = cn(
  "min-h-11 min-w-0 max-w-full shrink-0 rounded-xl border border-line/70 bg-card px-2.5 text-xs font-medium text-fg disabled:opacity-40 md:w-auto md:max-w-[12.5rem]",
  STUDIO_FOCUS_RING,
);

export function CharacterShaperCameraStyleSelect({
  disabled = false,
  workbench = false,
  compactPill = false,
}: {
  readonly disabled?: boolean;
  readonly workbench?: boolean;
  readonly compactPill?: boolean;
}) {
  const bt = useBilingual("CharacterShaperCameraControls");
  const settings = useCharacterShaperSessionSettings();
  return (
    <label className={cn("min-w-0 max-w-full text-[0.65rem] text-fg-3", compactPill && "shrink-0")}>
      <span className="sr-only">{bt("카메라 조작", "Camera controls")}</span>
      <select
        aria-label={workbench ? bt("3D 카메라 조작 스타일", "3D camera control style") : bt("카메라 조작 방식", "Camera control style")}
        title={bt(
          "기본: 우클릭 회전 · 중간 버튼 이동 / Blender: 중간 버튼 회전 / 3ds Max: Alt+중간 버튼 회전",
          "Default: right orbit, middle pan / Blender: middle orbit / 3ds Max: Alt+middle orbit",
        )}
        data-testid={workbench ? "workbench-camera-style-select" : "shaper-camera-style-select"}
        disabled={disabled || !settings}
        value={settings?.cameraStyle ?? "unity"}
        onChange={(event) => settings?.setCameraStyle(event.currentTarget.value as ShaperCameraControlStyle)}
        className={compactPill ? cn(COMPACT_PILL_SELECT, "w-full") : SESSION_SELECT}
      >
        <option value="unity">{bt("기본 · 우클릭 회전", "Default · right orbit")}</option>
        <option value="blender">{bt("중간 버튼 회전", "Middle-button orbit")}</option>
        <option value="max">{bt("3ds Max · Alt+중간 회전", "3ds Max · Alt+middle")}</option>
      </select>
      {!settings && !compactPill ? (
        <span className="block">{bt("셰이퍼 작업실에서만 조작 방식을 바꿀 수 있습니다.", "Control styles are available in the Shaper workspace.")}</span>
      ) : null}
    </label>
  );
}

export function CharacterShaperGazeSelect({
  h,
  workbench = false,
  compactPill = false,
}: {
  readonly h: StudioVrmPoserHost;
  readonly workbench?: boolean;
  readonly compactPill?: boolean;
}) {
  const bt = useBilingual("CharacterShaperCameraControls");
  const settings = useCharacterShaperSessionSettings();
  const [gridOpen, setGridOpen] = useState(false);
  const supported = Boolean(h.vrm?.lookAt);
  const locked = h.status !== "ready" || Boolean(h.webcamActive || h.isCapturing || h.isSharingPose || h.isThumbnailCapturing);
  const disabled = !settings || !supported || locked;
  const activeOffset = settings?.gazeOffset ?? DEFAULT_CHARACTER_SHAPER_GAZE_OFFSET;

  return (
    <div data-character-camera-gaze={compactPill ? "compact" : undefined}
      className={cn("relative min-w-0 max-w-full text-[0.65rem] text-fg-3", compactPill ? "flex shrink-0 items-center gap-1" : "space-y-1")}>
      <select
        aria-label={workbench ? bt("안구 시선 모드", "Eye gaze mode") : bt("시선 추적 모드", "Gaze tracking mode")}
        data-testid={workbench ? "workbench-eyeball-tracking-select" : "shaper-eyeball-tracking-select"}
        disabled={disabled}
        value={settings?.gazeMode ?? "cam"}
        onChange={(event) => {
          const next = event.currentTarget.value;
          if (isCharacterShaperGazeMode(next)) settings?.setGazeMode(next);
        }}
        className={compactPill ? cn(COMPACT_PILL_SELECT, "flex-1 md:flex-none") : SESSION_SELECT}
      >
        <option value="cam">{bt("시선: 카메라 응시", "Gaze: follow camera")}</option>
        <option value="fix">{bt("시선: 정면 고정 (F10)", "Gaze: fixed forward (F10)")}</option>
        <option value="light">{bt("시선: 광원 하이라이트 추종", "Gaze: follow key light")}</option>
        <option value="world">{bt("시선: 월드 3×3 그리드 고정", "Gaze: world 3×3 grid")}</option>
      </select>

      <button
        type="button"
        data-testid="shaper-gaze-grid-toggle"
        aria-expanded={gridOpen}
        aria-label={bt("3×3 시선 방향 그리드", "3×3 gaze direction grid")}
        disabled={disabled}
        onClick={() => setGridOpen((open) => !open)}
        className={cn(
          "inline-flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full border border-line/70 bg-card px-2.5 text-xs font-medium text-fg-2 hover:bg-raised disabled:opacity-40",
          gridOpen && "border-accent bg-accent-soft text-accent",
          STUDIO_FOCUS_RING,
        )}
      >
        <Grid3X3 size={14} aria-hidden />
        <span>3×3</span>
      </button>

      {gridOpen && !disabled ? (
        <div
          role="group"
          aria-label={bt("3×3 시선 방향 선택", "Select 3×3 gaze direction")}
          data-testid="shaper-gaze-3x3-grid"
          className="absolute right-0 top-full z-40 mt-1 grid w-36 grid-cols-3 gap-1 rounded-xl border border-line bg-panel p-1.5 shadow-lg"
        >
          {GAZE_GRID_CELLS.map((cell) => {
            const active =
              (settings?.gazeMode === "world" || settings?.gazeMode === "light")
              && activeOffset.yawDeg === cell.yawDeg
              && activeOffset.pitchDeg === cell.pitchDeg;
            return (
              <button
                key={cell.id}
                type="button"
                aria-pressed={active}
                aria-label={`시선 ${cell.labelKo}`}
                onClick={() => {
                  settings?.setGazeOffset({ yawDeg: cell.yawDeg, pitchDeg: cell.pitchDeg });
                  if (settings?.gazeMode !== "light") settings?.setGazeMode("world");
                }}
                className={cn(
                  "min-h-9 rounded-lg border text-[0.68rem] font-semibold transition-colors",
                  STUDIO_FOCUS_RING,
                  active
                    ? "border-accent bg-accent text-on-accent"
                    : "border-line bg-card text-fg-2 hover:bg-raised",
                )}
              >
                {cell.labelKo}
              </button>
            );
          })}
        </div>
      ) : null}

      {workbench ? (
        <button
          type="button"
          data-testid="workbench-eyeball-gaze-lock"
          disabled={disabled}
          aria-pressed={settings?.gazeMode === "cam"}
          onClick={() => settings?.setGazeMode((mode) => (mode === "cam" ? "fix" : "cam"))}
          className="min-h-11 rounded-lg border border-line px-2 disabled:opacity-40"
        >
          {settings?.gazeMode === "fix" ? bt("F10 정면 고정", "F10 fixed forward") : bt("F10 카메라 응시", "F10 follow camera")}
        </button>
      ) : null}
      {!supported ? (
        <p className={compactPill ? "sr-only" : undefined}>{bt("이 모델에 VRM LookAt이 없어 시선을 바꿀 수 없습니다.", "This model has no VRM LookAt gaze controller.")}</p>
      ) : h.webcamActive ? (
        <p className={compactPill ? "sr-only" : undefined}>{bt("웹캠 추적 중에는 웹캠이 시선을 제어합니다.", "Webcam tracking currently controls gaze.")}</p>
      ) : null}
    </div>
  );
}
