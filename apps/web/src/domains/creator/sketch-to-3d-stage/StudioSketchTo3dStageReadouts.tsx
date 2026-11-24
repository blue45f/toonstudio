/**
 * Sketch-to-3D Stage Solver 역산 리드아웃 뷰 (카메라 화각/구도 · 3점 조명 레이더 · VRM 13관절 포즈).
 * Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 금지 · Web Storage 금지 · KO/EN).
 */

import { Camera, Compass, ShieldCheck, Sun, UserCheck } from "lucide-react";
import type { ReactElement } from "react";

import {
  formatAngleCategory,
  formatLightingMood,
  formatShotCategory,
  formatSignedDeg,
  SKETCH_BONE_LABELS,
} from "./sketch-to-3d-stage-format";
import {
  SKETCH_VRM_BONE_NAMES,
  type SketchTo3dStageResult,
} from "./sketch-to-3d-stage-solver";

export type PoseReadoutMode = "euler" | "quaternion";

export interface StageCameraLightingReadoutProps {
  readonly solved: SketchTo3dStageResult;
  readonly isEn: boolean;
}

export interface StagePoseReadoutProps {
  readonly solved: SketchTo3dStageResult;
  readonly poseMode: PoseReadoutMode;
  readonly onChangePoseMode: (mode: PoseReadoutMode) => void;
  readonly isEn: boolean;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const CHIP_BASE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

function polarToRadarPoint(azimuthDeg: number, radius: number): { readonly cx: number; readonly cy: number } {
  const rad = (azimuthDeg * Math.PI) / 180;
  return { cx: 80 + Math.sin(rad) * radius, cy: 80 + Math.cos(rad) * radius };
}

/** ② 카메라 렌즈 & 구도 + ③ 3점 조명 리드아웃 카드 묶음. */
export function StudioSketchCameraLightingReadouts({
  solved,
  isEn,
}: StageCameraLightingReadoutProps): ReactElement {
  const pick = (ko: string, en: string): string => (isEn ? en : ko);
  const keyRadar = polarToRadarPoint(solved.lighting.key.azimuthDeg, 56);
  const fillRadar = polarToRadarPoint(solved.lighting.fill.azimuthDeg, 46);
  const rimRadar = polarToRadarPoint(solved.lighting.rim.azimuthDeg, 54);

  return (
    <div className="space-y-4 lg:col-span-5">
      <div
        data-testid="sketch-stage-camera-card"
        className="space-y-3 rounded-lg border border-line bg-card p-3"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Camera className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("카메라 렌즈 & 구도", "Camera Lens & Framing")}
          </div>
          <span
            data-testid="sketch-stage-focal-badge"
            className="rounded-md border border-accent bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent tabular-nums"
          >
            {solved.camera.focalLengthMm}mm
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md border border-line bg-canvas p-2">
            <dt className="text-[11px] text-fg-3">{pick("추정 화각 / FOV", "Est. Focal / FOV")}</dt>
            <dd data-testid="sketch-stage-fov-value" className="mt-0.5 font-semibold text-fg tabular-nums">
              {solved.camera.estimatedFocalLengthMm.toFixed(1)}mm · {solved.camera.fovHorizontalDeg.toFixed(1)}°
            </dd>
          </div>
          <div className="rounded-md border border-line bg-canvas p-2">
            <dt className="text-[11px] text-fg-3">{pick("앙각/부감 (Pitch)", "Pitch Angle")}</dt>
            <dd data-testid="sketch-stage-pitch-value" className="mt-0.5 font-semibold text-fg tabular-nums">
              {formatSignedDeg(solved.camera.pitchDeg)} · {formatAngleCategory(solved.camera.angleCategory, isEn)}
            </dd>
          </div>
          <div className="rounded-md border border-line bg-canvas p-2">
            <dt className="text-[11px] text-fg-3">{pick("수평 회전 (Yaw / Roll)", "Yaw / Roll")}</dt>
            <dd data-testid="sketch-stage-yaw-value" className="mt-0.5 font-semibold text-fg tabular-nums">
              {formatSignedDeg(solved.camera.yawDeg)} / {formatSignedDeg(solved.camera.rollDeg)}
            </dd>
          </div>
          <div className="rounded-md border border-line bg-canvas p-2">
            <dt className="text-[11px] text-fg-3">{pick("프레이밍 거리 / 샷", "Distance / Shot")}</dt>
            <dd data-testid="sketch-stage-distance-value" className="mt-0.5 font-semibold text-fg tabular-nums">
              {solved.camera.distanceMeters.toFixed(2)}m · {formatShotCategory(solved.camera.shotCategory, isEn)}
            </dd>
          </div>
        </dl>
      </div>

      <div
        data-testid="sketch-stage-lighting-card"
        className="space-y-3 rounded-lg border border-line bg-card p-3"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line pb-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-fg">
            <Sun className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("3점 조명 (Key / Fill / Rim)", "3-Point Lighting Rig")}
          </div>
          <span
            data-testid="sketch-stage-lighting-mood"
            className="rounded-md border border-line bg-raised px-2 py-0.5 text-[11px] font-semibold text-fg-2 tabular-nums"
          >
            {formatLightingMood(solved.lighting.mood, isEn)} · {solved.lighting.contrastRatio.toFixed(1)}:1
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-center">
          <div className="flex justify-center sm:col-span-5">
            <svg
              viewBox="0 0 160 160"
              className="h-32 w-32"
              role="img"
              aria-label={pick("3점 조명 상단 방위각 배치도", "Top-Down 3-Point Lighting Compass")}
            >
              <circle cx="80" cy="80" r="64" fill="var(--color-canvas)" stroke="var(--color-line)" strokeWidth="1.2" />
              <circle cx="80" cy="80" r="34" fill="none" stroke="var(--color-line)" strokeDasharray="3 3" strokeWidth="1" />
              <line x1="80" y1="16" x2="80" y2="144" stroke="var(--color-line)" strokeWidth="1" />
              <line x1="16" y1="80" x2="144" y2="80" stroke="var(--color-line)" strokeWidth="1" />
              <line x1="80" y1="80" x2={keyRadar.cx} y2={keyRadar.cy} stroke="var(--color-accent)" strokeWidth="2.4" />
              <line x1="80" y1="80" x2={fillRadar.cx} y2={fillRadar.cy} stroke="var(--color-cool)" strokeWidth="1.8" />
              <line x1="80" y1="80" x2={rimRadar.cx} y2={rimRadar.cy} stroke="var(--color-good)" strokeWidth="1.8" />
              <circle cx={keyRadar.cx} cy={keyRadar.cy} r="6" fill="var(--color-accent)" />
              <circle cx={fillRadar.cx} cy={fillRadar.cy} r="5" fill="var(--color-cool)" />
              <circle cx={rimRadar.cx} cy={rimRadar.cy} r="5" fill="var(--color-good)" />
              <circle cx="80" cy="80" r="7" fill="var(--color-fg)" />
              <polygon points="80,148 74,157 86,157" fill="var(--color-fg-2)" />
            </svg>
          </div>

          <div className="space-y-1.5 text-xs sm:col-span-7">
            {(
              [
                { light: solved.lighting.key, label: "Key", dotClass: "bg-accent" },
                { light: solved.lighting.fill, label: "Fill", dotClass: "bg-cool" },
                { light: solved.lighting.rim, label: "Rim", dotClass: "bg-good" },
              ] as const
            ).map(({ light, label, dotClass }) => (
              <div
                key={label}
                data-testid={`sketch-stage-light-${light.role}`}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-canvas px-2.5 py-1.5 tabular-nums"
              >
                <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                  <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden="true" />
                  {label}
                </span>
                <span className="text-[11px] text-fg-2">
                  {pick("방위", "Az")} {formatSignedDeg(light.azimuthDeg)} · {pick("고도", "El")}{" "}
                  {formatSignedDeg(light.elevationDeg)} · {light.intensity.toFixed(2)} ({light.colorTempKelvin}K)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** ① 3D VRM 휴머노이드 전신 13관절 포즈 리드아웃 카드. */
export function StudioSketchPoseReadout({
  solved,
  poseMode,
  onChangePoseMode,
  isEn,
}: StagePoseReadoutProps): ReactElement {
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  return (
    <div data-testid="sketch-stage-pose-card" className="space-y-3 rounded-lg border border-line bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
        <div className="flex flex-wrap items-center gap-2">
          <UserCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <h3 className="text-xs font-semibold text-fg">
            {pick("3D VRM 휴머노이드 전신 포즈 (13 관절)", "3D VRM Humanoid Full-Body Pose (13 Bones)")}
          </h3>
          <span
            data-testid="sketch-stage-clamp-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
              solved.pose.clampEvents.length > 0
                ? "border-warn bg-warning-soft text-warn"
                : "border-good bg-good-soft text-good"
            }`}
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {solved.pose.clampEvents.length > 0
              ? pick(
                  `생체각도 클램프 ${solved.pose.clampEvents.length}건 적용`,
                  `${solved.pose.clampEvents.length} Joint Clamps Applied`,
                )
              : pick("생체각도 전 관절 정상", "All Joints Within Biomechanical Range")}
          </span>
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label={pick("회전 표시 단위", "Rotation Display Format")}>
          <button
            type="button"
            aria-pressed={poseMode === "euler"}
            data-testid="sketch-stage-mode-euler"
            onClick={() => onChangePoseMode("euler")}
            className={`${CHIP_BASE} ${
              poseMode === "euler"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-canvas text-fg-2 hover:text-fg"
            }`}
          >
            <Compass className="h-3.5 w-3.5" aria-hidden="true" />
            {pick("오일러 (deg)", "Euler (deg)")}
          </button>
          <button
            type="button"
            aria-pressed={poseMode === "quaternion"}
            data-testid="sketch-stage-mode-quaternion"
            onClick={() => onChangePoseMode("quaternion")}
            className={`${CHIP_BASE} ${
              poseMode === "quaternion"
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-canvas text-fg-2 hover:text-fg"
            }`}
          >
            {pick("쿼터니언 (xyzw)", "Quaternion (xyzw)")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SKETCH_VRM_BONE_NAMES.map((boneName) => {
          const bone = solved.pose.bones[boneName];
          const label = SKETCH_BONE_LABELS[boneName];
          return (
            <div
              key={boneName}
              data-testid={`sketch-stage-bone-${boneName}`}
              className="flex flex-col justify-between gap-1 rounded-md border border-line bg-canvas p-2 text-xs"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-semibold text-fg">{pick(label.ko, label.en)}</span>
                {bone.clamped ? (
                  <span className="rounded border border-warn bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                    {pick("클램프", "Clamped")}
                  </span>
                ) : null}
              </div>
              {poseMode === "euler" ? (
                <p className="font-mono text-[11px] text-fg-2 tabular-nums">
                  X {formatSignedDeg(bone.eulerDeg.x)} · Y {formatSignedDeg(bone.eulerDeg.y)} · Z{" "}
                  {formatSignedDeg(bone.eulerDeg.z)}
                </p>
              ) : (
                <p className="font-mono text-[11px] text-fg-2 tabular-nums">
                  ({bone.quaternion.x.toFixed(2)}, {bone.quaternion.y.toFixed(2)}, {bone.quaternion.z.toFixed(2)},{" "}
                  {bone.quaternion.w.toFixed(2)})
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
