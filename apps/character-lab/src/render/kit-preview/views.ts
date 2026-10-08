/**
 * 카메라 뷰 표와 카메라 계산(순수). 전신·얼굴·상반신 뷰는 앱 뷰포트와 같은 `resolveFraming`(camera-framing.ts)을 엔진의
 * `setCamera(CameraFraming)`로 쓰고, 손·발 근접 뷰는 본의 월드 위치를 중심으로 ArcRotate 파라미터를 직접 계산한다
 * (엔진의 `CameraFraming`은 몸 중심 높이만 지원해서 손·발에 맞출 수 없다).
 *
 * 좌표: 우수 좌표계·Y-up, 캐릭터 정면 +Z, 캐릭터 왼쪽 +X. `alpha = π/2`가 정면 카메라, yaw가 음수면 카메라가 +X(캐릭터 왼쪽)로 돈다.
 */
import { clamp, degToRad } from "../../shared/math";
import { DEFAULT_VERTICAL_FOV } from "../camera-framing";

import type { CameraFraming, HumanoidBoneName, Vec3 } from "../../contracts";
import type { WorldBounds } from "../camera-framing";
import type { KitPreviewViewId } from "./cli-args";

/** 본 앵커 근접 뷰의 정의 */
export interface AnchorSpec {
  /** 중심 = 이 본들의 월드 위치 평균 */
  readonly bones: readonly HumanoidBoneName[];
  /** 본이 없을 때: feet = 바운딩 박스 바닥 중앙 근처, none = 뷰를 건너뛴다 */
  readonly fallback: "feet-bounds" | "none";
  /** 화면 높이에 담을 월드 길이(m) */
  readonly spanM: number;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  /** 중심에 더하는 월드 오프셋(m) */
  readonly offset: Vec3;
}

export interface ViewSpec {
  readonly id: KitPreviewViewId;
  readonly labelKo: string;
  /** 엔진 프레이밍(전신·상반신·얼굴). 앵커 뷰는 null */
  readonly framing: CameraFraming | null;
  readonly anchor: AnchorSpec | null;
}

function framing(mode: CameraFraming["mode"], yawDeg: number, pitchDeg: number): CameraFraming {
  return { mode, yawDeg, pitchDeg, distanceScale: 1 };
}

export const VIEW_SPECS: Readonly<Record<KitPreviewViewId, ViewSpec>> = {
  front: { id: "front", labelKo: "정면 전신", framing: framing("full-body", 0, 0), anchor: null },
  q3: { id: "q3", labelKo: "3/4 전신(왼쪽 35°, 위 8°)", framing: framing("full-body", -35, 8), anchor: null },
  side: { id: "side", labelKo: "측면 전신(캐릭터 왼쪽)", framing: framing("full-body", -90, 0), anchor: null },
  back: { id: "back", labelKo: "후면 전신", framing: framing("full-body", 180, 0), anchor: null },
  face: { id: "face", labelKo: "얼굴 정면", framing: framing("face", 0, 0), anchor: null },
  "face-q3": { id: "face-q3", labelKo: "얼굴 3/4(왼쪽 30°)", framing: framing("face", -30, 4), anchor: null },
  bust: { id: "bust", labelKo: "상반신", framing: framing("bust", 0, 0), anchor: null },
  hands: { id: "hands", labelKo: "왼손 등쪽(위에서)", framing: null, anchor: { bones: ["leftHand"], fallback: "none", spanM: 0.34, yawDeg: -15, pitchDeg: 38, offset: [0.03, 0, 0] } },
  "hands-palm": { id: "hands-palm", labelKo: "왼손 손바닥쪽(아래에서)", framing: null, anchor: { bones: ["leftHand"], fallback: "none", spanM: 0.34, yawDeg: -15, pitchDeg: -42, offset: [0.03, 0, 0] } },
  feet: { id: "feet", labelKo: "두 발(앞·위에서)", framing: null, anchor: { bones: ["leftFoot", "rightFoot"], fallback: "feet-bounds", spanM: 0.62, yawDeg: -25, pitchDeg: 24, offset: [0, -0.04, 0.08] } },
};

/** 뷰의 엔진 프레이밍(포즈 배율을 거리에 곱한다). 앵커 뷰면 null. */
export function framingForView(id: KitPreviewViewId, framingScale = 1): CameraFraming | null {
  const spec = VIEW_SPECS[id].framing;
  return spec ? { ...spec, distanceScale: spec.distanceScale * framingScale } : null;
}

export interface AnchorCamera {
  readonly target: Vec3;
  readonly radius: number;
  readonly alpha: number;
  readonly beta: number;
  readonly fov: number;
}

function average(points: readonly Vec3[]): Vec3 {
  const sum = points.reduce<Vec3>((acc, point) => [acc[0] + point[0], acc[1] + point[1], acc[2] + point[2]], [0, 0, 0]);
  return [sum[0] / points.length, sum[1] / points.length, sum[2] / points.length];
}

/**
 * 앵커 뷰의 카메라. `points`는 앵커 본들의 월드 위치(없으면 빈 배열), `bounds`는 캐릭터 월드 박스(폴백용).
 * 앵커를 구할 수 없으면 null(호출자가 뷰를 건너뛰고 경고한다).
 */
export function resolveAnchorCamera(spec: AnchorSpec, points: readonly Vec3[], bounds: WorldBounds | null, framingScale = 1, fov = DEFAULT_VERTICAL_FOV): AnchorCamera | null {
  let center: Vec3 | null = points.length > 0 ? average(points) : null;
  if (!center && spec.fallback === "feet-bounds" && bounds) center = [(bounds.min[0] + bounds.max[0]) / 2, bounds.min[1] + 0.07, (bounds.min[2] + bounds.max[2]) / 2];
  if (!center) return null;
  const radius = (spec.spanM * framingScale) / 2 / Math.tan(fov / 2);
  return {
    target: [center[0] + spec.offset[0], center[1] + spec.offset[1], center[2] + spec.offset[2]],
    radius,
    alpha: Math.PI / 2 + degToRad(clamp(spec.yawDeg, -720, 720)),
    beta: clamp(Math.PI / 2 - degToRad(clamp(spec.pitchDeg, -89, 89)), 0.05, Math.PI - 0.05),
    fov,
  };
}
