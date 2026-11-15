/**
 * studio-perspective-3d-camera-sync.ts
 *
 * Pure 3D pinhole camera -> 2D Perspective Ruler vanishing-point & eye-level horizon bridge.
 * Zero Three.js / WebGL dependencies so the 2D Studio eager bundle stays 100% lightweight.
 *
 * Clean-room reference: Clip Studio Paint Perspective Rulers public manual
 * (1/2/3-point vanishing points, eye-level horizon lock, camera FOV/yaw/pitch coupling,
 * and at-a-glance snap state).
 */

export type StudioPerspectiveCameraMode = "1p" | "2p" | "3p";

export interface StudioPerspective3dCameraSpec {
  readonly mode: StudioPerspectiveCameraMode;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly fovDeg: number;
  readonly canvasWidth: number;
  readonly canvasHeight: number;
}

export interface StudioSyncedPerspectiveRig {
  readonly mode: StudioPerspectiveCameraMode;
  readonly eyeLevelY: number;
  readonly lockHorizon: boolean;
  readonly points: readonly {
    readonly axis: "z-forward" | "x-right" | "y-vertical";
    readonly x: number;
    readonly y: number;
  }[];
}

export interface StudioPerspectiveCameraPreset {
  readonly id: string;
  readonly label: string;
  readonly mode: StudioPerspectiveCameraMode;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly fovDeg: number;
}

export const STUDIO_PERSPECTIVE_3D_CAMERA_PRESETS: readonly StudioPerspectiveCameraPreset[] =
  Object.freeze([
    {
      id: "corridor-1p",
      label: "1점 복도 정면",
      mode: "1p",
      yawDeg: 0,
      pitchDeg: 0,
      fovDeg: 50,
    },
    {
      id: "street-2p",
      label: "2점 거리 표준",
      mode: "2p",
      yawDeg: 32,
      pitchDeg: -4,
      fovDeg: 54,
    },
    {
      id: "low-angle-3p",
      label: "3점 로우앵글",
      mode: "3p",
      yawDeg: 28,
      pitchDeg: 22,
      fovDeg: 62,
    },
    {
      id: "birds-eye-3p",
      label: "3점 하이앵글",
      mode: "3p",
      yawDeg: -30,
      pitchDeg: -26,
      fovDeg: 60,
    },
  ]);

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Projects canonical world axes from a 3D camera orientation (`yawDeg`, `pitchDeg`, `fovDeg`)
 * onto 2D document coordinates (`[0..canvasWidth]`, `[0..canvasHeight]`, allowing off-canvas VPs).
 */
export function computePerspectiveRigFrom3dCamera(
  spec: StudioPerspective3dCameraSpec,
): StudioSyncedPerspectiveRig {
  const width = Math.max(64, Number.isFinite(spec.canvasWidth) ? spec.canvasWidth : 800);
  const height = Math.max(64, Number.isFinite(spec.canvasHeight) ? spec.canvasHeight : 1200);
  const fovDeg = Math.max(20, Math.min(110, Number.isFinite(spec.fovDeg) ? spec.fovDeg : 54));
  const yawDeg = Math.max(-75, Math.min(75, Number.isFinite(spec.yawDeg) ? spec.yawDeg : 0));
  const pitchDeg = Math.max(-65, Math.min(65, Number.isFinite(spec.pitchDeg) ? spec.pitchDeg : 0));

  const cx = width * 0.5;
  const cy = height * 0.5;
  const focalPx = cy / Math.tan((fovDeg * Math.PI) / 360);

  const yawRad = (yawDeg * Math.PI) / 180;
  const pitchRad = (pitchDeg * Math.PI) / 180;

  // Positive pitchDeg = looking UP (camera tilted upward -> horizon moves DOWN on screen, y increases)
  const eyeLevelY = round1(cy + focalPx * Math.tan(pitchRad));

  if (spec.mode === "1p") {
    const vpZ = round1(cx + focalPx * Math.tan(yawRad));
    return {
      mode: "1p",
      eyeLevelY,
      lockHorizon: true,
      points: [{ axis: "z-forward", x: vpZ, y: eyeLevelY }],
    };
  }

  // Ensure non-degenerate 2-point horizontal separation when yaw is near 0° or ±90°
  const effectiveYawDeg =
    Math.abs(yawDeg) < 8 ? (yawDeg < 0 ? -28 : 28) : Math.min(82, Math.max(-82, yawDeg));
  const effYawRad = (effectiveYawDeg * Math.PI) / 180;

  // Forward Z-axis VP and orthogonal X-axis VP lie on the horizon line:
  // x_z = cx + f / cos(pitch) * tan(yaw), x_x = cx - f / cos(pitch) * cot(yaw)
  const cosPitch = Math.max(0.25, Math.cos(pitchRad));
  const horizFocal = focalPx / cosPitch;
  const tanYaw = Math.tan(effYawRad);
  const vpZx = round1(cx + horizFocal * tanYaw);
  const vpXx = round1(cx - horizFocal / tanYaw);

  const orderedHoriz =
    vpXx <= vpZx
      ? [
          { axis: "x-right" as const, x: vpXx, y: eyeLevelY },
          { axis: "z-forward" as const, x: vpZx, y: eyeLevelY },
        ]
      : [
          { axis: "z-forward" as const, x: vpZx, y: eyeLevelY },
          { axis: "x-right" as const, x: vpXx, y: eyeLevelY },
        ];

  if (spec.mode === "2p") {
    return {
      mode: "2p",
      eyeLevelY,
      lockHorizon: true,
      points: orderedHoriz,
    };
  }

  // 3-point vertical vanishing point (zenith when looking up pitch > 0, nadir when looking down pitch < 0)
  const effectivePitchDeg = Math.abs(pitchDeg) < 8 ? 20 : pitchDeg;
  const effPitchRad = (effectivePitchDeg * Math.PI) / 180;
  const verticalVpY = round1(cy - focalPx / Math.tan(effPitchRad));

  return {
    mode: "3p",
    eyeLevelY,
    lockHorizon: false,
    points: [
      ...orderedHoriz,
      { axis: "y-vertical", x: round1(cx), y: verticalVpY },
    ],
  };
}

export interface StudioPerspectiveSnapStatusSummary {
  readonly snapEngaged: boolean;
  readonly badgeLabel: string;
  readonly detailText: string;
}

export function describePerspectiveSnapStatus(input: {
  readonly active: boolean;
  readonly vanishingPointCount: number;
  readonly lockHorizon?: boolean;
}): StudioPerspectiveSnapStatusSummary {
  const count = Math.max(0, Math.floor(input.vanishingPointCount));
  if (!input.active) {
    return {
      snapEngaged: false,
      badgeLabel: "원근 스냅 꺼짐",
      detailText: "펜·직선이 자유 방향으로 그려집니다.",
    };
  }
  if (count === 0) {
    return {
      snapEngaged: false,
      badgeLabel: "원근자 켜짐 · 소실점 대기",
      detailText: "소실점을 추가하거나 3D 카메라 프리셋을 적용하면 즉시 스냅됩니다.",
    };
  }
  const horizonNote = input.lockHorizon ? " · 수평선 고정" : "";
  return {
    snapEngaged: true,
    badgeLabel: `원근 스냅 작동 중 (${count}점)`,
    detailText: `펜·직선 획이 ${count}개 소실점 방사선에 자동 정렬됩니다${horizonNote}.`,
  };
}
