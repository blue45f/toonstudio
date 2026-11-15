/**
 * Studio Perspective Panel — 원근자(소실점 스냅) 인스펙터:
 * - 한눈에 확인 가능한 원근 스냅 작동 상태 배지 + on/off 토글
 * - 소실점 목록(좌표 입력 + 삭제) + 추가 버튼
 * - 독립 눈높이(수평선) 잠금 및 정렬
 * - 3D 카메라 구도(Yaw/Pitch/FOV·1/2/3점 프리셋) → 2D 소실점·수평선 동기화
 */
import { Camera, Magnet, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";

import {
  computePerspectiveRigFrom3dCamera,
  describePerspectiveSnapStatus,
  STUDIO_PERSPECTIVE_3D_CAMERA_PRESETS,
  type StudioPerspectiveCameraMode,
  type StudioSyncedPerspectiveRig,
} from "./drawing/studio-perspective-3d-camera-sync";
import { StudioCoordinateInput, StudioToggleChip } from "./studio-panel-ui";
import {
  canAddVanishingPoint,
  defaultPerspectiveEyeLevelY,
  MAX_VANISHING_POINTS,
  type VanishingPoint,
} from "./studio-perspective-guide";

import { cn } from "@/shared/lib/utils";

function VpCoordInput({
  value,
  onPreview,
  onCommit,
  label,
  ariaLabel,
  disabled,
}: {
  value: number;
  onPreview?: (next: number) => void;
  onCommit: (next: number) => void;
  label: string;
  ariaLabel: string;
  disabled?: boolean;
}): ReactElement {
  return (
    <StudioCoordinateInput
      value={value}
      onPreview={onPreview}
      onCommit={onCommit}
      label={label}
      ariaLabel={ariaLabel}
      disabled={disabled}
    />
  );
}

type MoveVanishingPoint = (id: string, x: number, y: number) => void;

type StudioPerspectivePanelBaseProps = {
  active: boolean;
  points: VanishingPoint[];
  /** Independent horizon line (document px). null = not authored yet. */
  eyeLevelY?: number | null;
  /** Pin vanishing-point y to eyeLevelY while dragging/editing. */
  lockHorizon?: boolean;
  /** Canvas width used for 3D camera projection. */
  canvasWidth?: number;
  /** Canvas height used to seed default eye level & 3D camera projection. */
  canvasHeight?: number;
  onToggleActive: () => void;
  onAddPoint: () => void;
  onRemovePoint: (id: string) => void;
  onToggleLockHorizon?: (next: boolean) => void;
  onCommitEyeLevelY?: (next: number) => void;
  onPreviewEyeLevelY?: (next: number) => void;
  onAlignToEyeLevel?: () => void;
  onSyncFrom3dCamera?: (rig: StudioSyncedPerspectiveRig) => void;
  disabled?: boolean;
  disabledReason?: string;
  /** Optional transient canvas preview. It must not append undo/CRDT history. */
  onPreviewPoint?: MoveVanishingPoint;
};

type StudioPerspectivePanelCommitProps =
  | {
      /** Final document/history commit after Enter or blur. */
      onCommitPoint: MoveVanishingPoint;
      /** @deprecated Use onCommitPoint. Retained for incremental StudioPage migration. */
      onMovePoint?: MoveVanishingPoint;
    }
  | {
      onCommitPoint?: undefined;
      /** Legacy final commit callback. It is no longer called on every keystroke. */
      onMovePoint: MoveVanishingPoint;
    };

export type StudioPerspectivePanelProps = StudioPerspectivePanelBaseProps &
  StudioPerspectivePanelCommitProps;

export function StudioPerspectivePanel({
  active,
  points,
  eyeLevelY = null,
  lockHorizon = false,
  canvasWidth = 800,
  canvasHeight = 1200,
  onToggleActive,
  onAddPoint,
  onRemovePoint,
  onToggleLockHorizon,
  onCommitEyeLevelY,
  onPreviewEyeLevelY,
  onAlignToEyeLevel,
  onSyncFrom3dCamera,
  disabled = false,
  disabledReason,
  onPreviewPoint,
  onCommitPoint,
  onMovePoint,
}: StudioPerspectivePanelProps): ReactElement {
  const canAdd = canAddVanishingPoint(points);
  const commitPoint = onCommitPoint ?? onMovePoint;
  const resolvedEyeLevelY = eyeLevelY ?? defaultPerspectiveEyeLevelY(canvasHeight);

  const [cameraMode, setCameraMode] = useState<StudioPerspectiveCameraMode>("2p");
  const [cameraYawDeg, setCameraYawDeg] = useState<number>(32);
  const [cameraPitchDeg, setCameraPitchDeg] = useState<number>(-4);
  const [cameraFovDeg, setCameraFovDeg] = useState<number>(54);

  const pendingRigRef = useRef<StudioSyncedPerspectiveRig | null>(null);

  useEffect(() => {
    const pending = pendingRigRef.current;
    if (!pending) return;
    if (points.length === pending.points.length) {
      pendingRigRef.current = null;
      pending.points.forEach((target, idx) => {
        const vp = points[idx];
        if (vp && (vp.x !== target.x || vp.y !== target.y)) {
          commitPoint(vp.id, target.x, target.y);
        }
      });
    }
  }, [points, commitPoint]);

  const snapStatus = describePerspectiveSnapStatus({
    active,
    vanishingPointCount: points.length,
    lockHorizon,
  });

  const apply3dCameraRig = (rig: StudioSyncedPerspectiveRig) => {
    if (onSyncFrom3dCamera) {
      onSyncFrom3dCamera(rig);
      return;
    }
    if (!active) {
      onToggleActive();
    }
    onToggleLockHorizon?.(rig.lockHorizon);
    onCommitEyeLevelY?.(rig.eyeLevelY);

    if (points.length === rig.points.length) {
      rig.points.forEach((target, idx) => {
        const vp = points[idx];
        if (vp) commitPoint(vp.id, target.x, target.y);
      });
      return;
    }

    pendingRigRef.current = rig;
    if (points.length < rig.points.length) {
      const missing = Math.min(
        MAX_VANISHING_POINTS - points.length,
        rig.points.length - points.length,
      );
      for (let i = 0; i < missing; i += 1) {
        onAddPoint();
      }
    } else {
      const extra = points.slice(rig.points.length);
      for (const vp of extra) {
        onRemovePoint(vp.id);
      }
    }
  };

  const handleSyncCurrentCamera = () => {
    const rig = computePerspectiveRigFrom3dCamera({
      mode: cameraMode,
      yawDeg: cameraYawDeg,
      pitchDeg: cameraPitchDeg,
      fovDeg: cameraFovDeg,
      canvasWidth,
      canvasHeight,
    });
    apply3dCameraRig(rig);
  };

  const handleApplyCameraPreset = (presetId: string) => {
    const preset = STUDIO_PERSPECTIVE_3D_CAMERA_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    setCameraMode(preset.mode);
    setCameraYawDeg(preset.yawDeg);
    setCameraPitchDeg(preset.pitchDeg);
    setCameraFovDeg(preset.fovDeg);
    const rig = computePerspectiveRigFrom3dCamera({
      mode: preset.mode,
      yawDeg: preset.yawDeg,
      pitchDeg: preset.pitchDeg,
      fovDeg: preset.fovDeg,
      canvasWidth,
      canvasHeight,
    });
    apply3dCameraRig(rig);
  };

  return (
    <div className="pt-2.5 border-t border-line/35 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-fg-3">원근자 (Perspective)</p>
        <StudioToggleChip
          active={active}
          disabled={disabled}
          onClick={onToggleActive}
          aria-label={`원근자 ${active ? "끄기" : "켜기"}`}
          title={
            disabledReason ??
            "소실점을 향해 선이 자동으로 정렬됩니다. (펜·직선 도구에 적용)"
          }
        >
          {active ? "켜짐" : "꺼짐"}
        </StudioToggleChip>
      </div>

      {/* At-a-glance Snap Status Banner */}
      <div
        data-studio-perspective-snap-status="true"
        data-snap-engaged={snapStatus.snapEngaged ? "true" : "false"}
        className={cn(
          "flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-[0.68rem]",
          snapStatus.snapEngaged
            ? "border-accent/45 bg-accent/10 text-accent"
            : active
              ? "border-warn/40 bg-warn/10 text-warn"
              : "border-line/60 bg-card/50 text-fg-3",
        )}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1 font-semibold">
            <Magnet className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{snapStatus.badgeLabel}</span>
          </div>
          <p className="mt-0.5 text-[0.64rem] leading-snug opacity-85">
            {snapStatus.detailText}
          </p>
        </div>
      </div>

      {active && (
        <div className="space-y-2 pl-1.5 border-l border-line/50 ml-1 py-1 animate-fade-in">
          {points.length === 0 ? (
            <p className="text-[0.7rem] leading-relaxed text-fg-3">
              소실점을 추가하면 그 방향으로 선이 스냅돼요.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {points.map((vp, index) => (
                <li key={vp.id} className="flex items-center gap-1.5">
                  <span className="w-14 shrink-0 text-[0.68rem] font-semibold text-fg-3">
                    소실점 {index + 1}
                  </span>
                  <VpCoordInput
                    label="X"
                    ariaLabel={`소실점 ${index + 1} X`}
                    value={vp.x}
                    disabled={disabled}
                    onPreview={
                      onPreviewPoint ? (next) => onPreviewPoint(vp.id, next, vp.y) : undefined
                    }
                    onCommit={(next) => commitPoint(vp.id, next, vp.y)}
                  />
                  <VpCoordInput
                    label="Y"
                    ariaLabel={`소실점 ${index + 1} Y`}
                    value={vp.y}
                    disabled={disabled || lockHorizon}
                    onPreview={
                      !lockHorizon && onPreviewPoint
                        ? (next) => onPreviewPoint(vp.id, vp.x, next)
                        : undefined
                    }
                    onCommit={(next) => commitPoint(vp.id, vp.x, next)}
                  />
                  <button
                    type="button"
                    aria-label={`소실점 ${index + 1} 삭제`}
                    title={disabledReason ?? "이 소실점 삭제"}
                    disabled={disabled}
                    onClick={() => onRemovePoint(vp.id)}
                    className="grid size-6 shrink-0 place-items-center rounded border border-line text-fg-3 transition-colors hover:bg-raised hover:text-fg disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:size-11"
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={onAddPoint}
            disabled={disabled || !canAdd}
            title={
              disabledReason ??
              (canAdd
                ? "소실점 추가"
                : `소실점은 최대 ${MAX_VANISHING_POINTS}개까지 추가할 수 있어요.`)
            }
            className={cn(
              "flex w-full items-center justify-center gap-1 rounded border border-line bg-card py-1 text-[0.68rem] font-semibold text-fg-2 transition-colors pointer-coarse:min-h-11",
              canAdd && !disabled
                ? "hover:bg-raised cursor-pointer"
                : "cursor-not-allowed opacity-45",
            )}
          >
            <Plus className="size-3" aria-hidden />
            소실점 추가
          </button>

          <div className="space-y-1.5 rounded border border-line/50 bg-card/40 p-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[0.68rem] font-semibold text-fg-3">눈높이 (수평선)</span>
              {onToggleLockHorizon && (
                <StudioToggleChip
                  active={lockHorizon}
                  disabled={disabled}
                  onClick={() => onToggleLockHorizon(!lockHorizon)}
                  aria-label={`눈높이 잠금 ${lockHorizon ? "끄기" : "켜기"}`}
                  title={disabledReason ?? "켜면 소실점 세로 위치가 눈높이에 고정됩니다."}
                >
                  {lockHorizon ? "잠금" : "자유"}
                </StudioToggleChip>
              )}
            </div>
            {onCommitEyeLevelY && (
              <div className="flex items-center gap-1.5">
                <VpCoordInput
                  label="Y"
                  ariaLabel="눈높이 Y"
                  value={resolvedEyeLevelY}
                  disabled={disabled}
                  onPreview={onPreviewEyeLevelY}
                  onCommit={onCommitEyeLevelY}
                />
                {onAlignToEyeLevel && (
                  <button
                    type="button"
                    disabled={disabled || points.length === 0}
                    onClick={onAlignToEyeLevel}
                    title={disabledReason ?? "모든 소실점을 눈높이로 맞춥니다."}
                    className="shrink-0 rounded border border-line px-1.5 py-1 text-[0.65rem] font-semibold text-fg-2 transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-45 pointer-coarse:min-h-11"
                  >
                    맞추기
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 3D Camera -> Vanishing Points & Horizon Sync */}
          <div
            data-studio-perspective-3d-camera-sync="true"
            className="space-y-1.5 rounded border border-line/60 bg-card/60 p-2"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center gap-1 text-[0.68rem] font-semibold text-fg-2">
                <Camera className="size-3 text-accent" aria-hidden />
                3D 카메라 구도 연동
              </span>
              <div className="inline-flex rounded border border-line/60 bg-panel p-0.5">
                {(["1p", "2p", "3p"] as const).map((modeId) => (
                  <button
                    key={modeId}
                    type="button"
                    disabled={disabled}
                    aria-pressed={cameraMode === modeId}
                    onClick={() => setCameraMode(modeId)}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[0.62rem] font-semibold transition-colors",
                      cameraMode === modeId
                        ? "bg-accent text-on-accent"
                        : "text-fg-3 hover:text-fg",
                    )}
                  >
                    {modeId.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1">
              {STUDIO_PERSPECTIVE_3D_CAMERA_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleApplyCameraPreset(preset.id)}
                  className="truncate rounded border border-line bg-panel px-1.5 py-1 text-[0.64rem] font-medium text-fg-2 transition-colors hover:border-accent/40 hover:text-fg disabled:opacity-45"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-1 text-[0.64rem] text-fg-3">
              <label className="flex flex-col gap-0.5">
                <span>회전 {cameraYawDeg}°</span>
                <input
                  type="range"
                  aria-label="3D 카메라 좌우 회전"
                  min={-65}
                  max={65}
                  step={1}
                  disabled={disabled}
                  value={cameraYawDeg}
                  onChange={(e) => setCameraYawDeg(Number(e.currentTarget.value))}
                  className="w-full accent-accent"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span>앵글 {cameraPitchDeg}°</span>
                <input
                  type="range"
                  aria-label="3D 카메라 상하 앵글"
                  min={-50}
                  max={50}
                  step={1}
                  disabled={disabled}
                  value={cameraPitchDeg}
                  onChange={(e) => setCameraPitchDeg(Number(e.currentTarget.value))}
                  className="w-full accent-accent"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span>화각 {cameraFovDeg}°</span>
                <input
                  type="range"
                  aria-label="3D 카메라 화각"
                  min={28}
                  max={90}
                  step={1}
                  disabled={disabled}
                  value={cameraFovDeg}
                  onChange={(e) => setCameraFovDeg(Number(e.currentTarget.value))}
                  className="w-full accent-accent"
                />
              </label>
            </div>

            <button
              type="button"
              disabled={disabled}
              onClick={handleSyncCurrentCamera}
              className="flex w-full items-center justify-center gap-1 rounded border border-accent/40 bg-accent/12 py-1 text-[0.66rem] font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
            >
              3D 카메라 → 소실점 동기화
            </button>
          </div>

          <p className="flex items-start gap-1 text-[0.68rem] leading-relaxed text-fg-3">
            <Sparkles className="mt-0.5 shrink-0 size-3 text-accent" aria-hidden />
            소실점 1~3개 + 독립 눈높이로 1·2·3점 원근 수평선을 맞춥니다. 잠그면 VP가 수평선 위에 유지됩니다.
          </p>
        </div>
      )}
    </div>
  );
}
