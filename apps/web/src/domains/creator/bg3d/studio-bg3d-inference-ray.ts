/**
 * 월드 레이와 상자·평면 조각의 교차 판정 — 순수 모듈.
 *
 * 상자는 로컬 슬랩 테스트(평행육면체의 역행렬 사용), 평면은 평면 교점 + 로컬 범위 검사로 처리한다.
 * 정점을 순회하지 않으므로 포인터 이동 경로에서 안전하게 쓸 수 있다.
 */

import {
  addScaled,
  intersectLineWithPlane,
  normalize,
  scale,
  sub,
  vec3,
  dot,
  cross,
} from "./studio-bg3d-inference-math";

import type { StudioBg3dInferenceVec3 } from "./studio-bg3d-inference-math";
import type { StudioBg3dInferenceVolumeFeature } from "./studio-bg3d-inference-sources";

type V3 = StudioBg3dInferenceVec3;

export interface StudioBg3dInferenceRayVolumeHit {
  readonly t: number;
  readonly point: V3;
  /** 레이를 향하는 바깥쪽 단위 법선. */
  readonly normal: V3;
}

function applyInverse(
  inverse: NonNullable<StudioBg3dInferenceVolumeFeature["inverse"]>,
  vector: V3,
): V3 {
  return vec3(
    inverse[0] * vector[0] + inverse[1] * vector[1] + inverse[2] * vector[2],
    inverse[3] * vector[0] + inverse[4] * vector[1] + inverse[5] * vector[2],
    inverse[6] * vector[0] + inverse[7] * vector[1] + inverse[8] * vector[2],
  );
}

/**
 * 레이(origin + t·direction, t ≥ 0)가 상자/평면 조각에 처음 닿는 점. 닿지 않으면 null.
 * 레이 시작점이 상자 안쪽이면 null이다(안쪽 면을 "면 위"로 잡지 않는다).
 */
export function intersectStudioBg3dInferenceRayVolume(
  origin: V3,
  direction: V3,
  volume: StudioBg3dInferenceVolumeFeature,
): StudioBg3dInferenceRayVolumeHit | null {
  const [e1, e2, e3] = volume.axes;
  if (volume.shape === "box") {
    const inverse = volume.inverse;
    if (!inverse) return null;
    const localOrigin = applyInverse(inverse, sub(origin, volume.center));
    const localDirection = applyInverse(inverse, direction);
    let tNear = -Infinity;
    let tFar = Infinity;
    let nearAxis = -1;
    let nearSign = 1;
    for (let axis = 0; axis < 3; axis += 1) {
      const o = localOrigin[axis] ?? 0;
      const d = localDirection[axis] ?? 0;
      if (Math.abs(d) < 1e-12) {
        if (Math.abs(o) > 1) return null;
        continue;
      }
      let t0 = (-1 - o) / d;
      let t1 = (1 - o) / d;
      let sign = -1;
      if (t0 > t1) {
        [t0, t1] = [t1, t0];
        sign = 1;
      }
      if (t0 > tNear) {
        tNear = t0;
        nearAxis = axis;
        nearSign = sign;
      }
      if (t1 < tFar) tFar = t1;
      if (tNear > tFar) return null;
    }
    if (tFar < 0 || nearAxis < 0 || tNear < 0) return null;
    const faceAxes = [e1, e2, e3];
    const first = faceAxes[(nearAxis + 1) % 3];
    const second = faceAxes[(nearAxis + 2) % 3];
    const reference = faceAxes[nearAxis];
    if (!first || !second || !reference) return null;
    const normal = normalize(cross(first, second));
    if (!normal) return null;
    const outward = dot(normal, reference) * nearSign >= 0 ? normal : scale(normal, -1);
    return { t: tNear, point: addScaled(origin, direction, tNear), normal: outward };
  }
  const normal = normalize(cross(e1, e2));
  if (!normal) return null;
  const plane = intersectLineWithPlane(origin, direction, volume.center, normal);
  if (!plane || plane.t < 0) return null;
  const relative = sub(plane.point, volume.center);
  const lengthE1 = dot(e1, e1);
  const lengthE2 = dot(e2, e2);
  if (lengthE1 < 1e-18 || lengthE2 < 1e-18) return null;
  const u = dot(relative, e1) / lengthE1;
  const v = dot(relative, e2) / lengthE2;
  if (Math.abs(u) > 1 + 1e-9 || Math.abs(v) > 1 + 1e-9) return null;
  return {
    t: plane.t,
    point: plane.point,
    normal: dot(direction, normal) > 0 ? scale(normal, -1) : normal,
  };
}
