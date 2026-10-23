/**
 * Studio 3D 데생 인형 — 경계 상자 기반 카메라 자동 프레이밍(순수 계층).
 *
 * 예전 프레이밍은 "키의 절반을 바라보고 키에 비례해 물러나는" 고정 비율이었다. 3등신 SD 처럼
 * 머리가 몸의 1/3 인 체형이나 쪼그린·무릎 포즈, 2인 구도처럼 실제 부피가 키와 다른 장면에서는
 * 발이 화면 밖으로 잘렸다. 여기서는 그려진 인형(들)의 월드 경계 상자 8개 꼭짓점을 카메라
 * 축에 투영해, 모든 꼭짓점이 세로·가로 화각 안에 여유를 두고 들어오는 최소 거리를 구한다.
 * Three.js 없이 결정적으로 계산하므로 단위 테스트가 가능하다.
 */

import type { StudioMannequinVec3 } from "./studio-mannequin-model";

export interface StudioMannequinBounds {
  readonly min: StudioMannequinVec3;
  readonly max: StudioMannequinVec3;
}

export interface StudioMannequinBoundsFrameInput {
  readonly bounds: StudioMannequinBounds;
  /** 타깃에서 카메라 쪽을 향하는 방향(정규화 불필요). */
  readonly viewDirection: StudioMannequinVec3;
  /** 세로 화각(도). */
  readonly fovDeg: number;
  /** 가로/세로 비. */
  readonly aspect: number;
  /** 화면 가장자리 여유 비율(1 = 꽉 참). 기본 1.14. */
  readonly margin?: number;
  /** 최소 카메라 거리(m). 기본 0.6. */
  readonly minDistance?: number;
}

export interface StudioMannequinBoundsFrame {
  readonly target: StudioMannequinVec3;
  readonly position: StudioMannequinVec3;
  readonly distance: number;
}

function normalize(v: StudioMannequinVec3): StudioMannequinVec3 {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (!Number.isFinite(length) || length < 1e-9) return [0, 0, 1];
  return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a: StudioMannequinVec3, b: StudioMannequinVec3): StudioMannequinVec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: StudioMannequinVec3, b: StudioMannequinVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 경계 상자가 화각 안에 들어오는 원근 카메라 위치(타깃 = 상자 중심). */
export function fitStudioMannequinCameraToBounds(
  input: StudioMannequinBoundsFrameInput,
): StudioMannequinBoundsFrame {
  const { min, max } = input.bounds;
  const target: StudioMannequinVec3 = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const w = normalize(input.viewDirection);
  // 거의 수직(탑뷰)이면 세계 +Z 를 화면 위로 삼아 축이 퇴화하지 않게 한다.
  const worldUp: StudioMannequinVec3 = Math.abs(w[1]) > 0.98 ? [0, 0, -1] : [0, 1, 0];
  const right = normalize(cross(worldUp, w));
  const up = cross(w, right);
  const fov = Math.min(170, Math.max(5, Number.isFinite(input.fovDeg) ? input.fovDeg : 35));
  const tanV = Math.tan(((fov / 2) * Math.PI) / 180);
  const aspect = Number.isFinite(input.aspect) && input.aspect > 0 ? input.aspect : 1;
  const tanH = tanV * aspect;
  const margin = Math.max(1, input.margin ?? 1.14);
  let distance = input.minDistance ?? 0.6;
  for (const x of [min[0], max[0]]) {
    for (const y of [min[1], max[1]]) {
      for (const z of [min[2], max[2]]) {
        const p: StudioMannequinVec3 = [x - target[0], y - target[1], z - target[2]];
        const depth = dot(p, w);
        distance = Math.max(
          distance,
          depth + (Math.abs(dot(p, up)) * margin) / tanV,
          depth + (Math.abs(dot(p, right)) * margin) / tanH,
        );
      }
    }
  }
  return {
    target,
    position: [target[0] + w[0] * distance, target[1] + w[1] * distance, target[2] + w[2] * distance],
    distance,
  };
}
