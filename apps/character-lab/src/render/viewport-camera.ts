/**
 * 뷰포트 카메라 보고 포트(순수 타입). 계약 CharacterEngine 밖의 구조적 포트로, ViewportPane이 관절 핸들 드래그의
 * 시선 축(화면 평면 회전)을 계산할 때 쓴다. 엔진이 포트를 제공하지 않으면 null이며 패널은 핸들을 표시만 하고
 * 드래그를 비활성화한다(무음 추정 금지).
 */
import type { Vec3 } from "../contracts";

export interface ViewportCameraInfo {
  /** 카메라 월드 위치 */
  readonly position: Vec3;
  /** 카메라 → 타깃 단위 벡터 */
  readonly forward: Vec3;
  /** 화면 오른쪽 단위 벡터(월드) */
  readonly right: Vec3;
  /** 화면 위쪽 단위 벡터(월드) */
  readonly up: Vec3;
  /** 세로 시야각(rad) */
  readonly fovY: number;
  /** 현재 렌더 크기(픽셀) */
  readonly width: number;
  readonly height: number;
}

export interface ViewportCameraSource {
  viewportCamera(): ViewportCameraInfo;
}

export function hasViewportCamera(value: unknown): value is ViewportCameraSource {
  return typeof value === "object" && value !== null && typeof (value as { viewportCamera?: unknown }).viewportCamera === "function";
}

/** 엔진에서 카메라 정보를 읽는다. 포트가 없으면 null. */
export function readViewportCamera(engine: unknown): ViewportCameraInfo | null {
  if (!hasViewportCamera(engine)) return null;
  return engine.viewportCamera();
}

/** 자유 회전까지 포함해 현재 시선을 프레이밍의 yaw·pitch(도)로 되돌린다. */
export function viewportFramingAngles(camera: ViewportCameraInfo) {
  const [x, y, z] = camera.forward;
  const degrees = (radians: number) => Math.round(radians * (180 / Math.PI) * 1e6) / 1e6 || 0;
  return {
    yawDeg: degrees(Math.atan2(x, -z)),
    pitchDeg: degrees(Math.atan2(-y, Math.hypot(x, z))),
  };
}
