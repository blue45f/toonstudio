// 방 만들기 부품 시험이 같이 쓰는 기하 판정 — 요(y축) 회전만 하는 상자(룸 빌더 파츠 규약)끼리의 겹침과 월드 경계.
// 접촉(면이 맞닿음)은 겹침이 아니다: 모든 분리축에서 침투 깊이가 허용치(0.01mm)를 넘을 때만 겹침으로 본다.

import type { StudioBg3dRoomPart } from "./studio-bg3d-room-builder";

export interface StudioBg3dTestBox {
  readonly name: string;
  readonly center: readonly [number, number, number];
  readonly half: readonly [number, number, number];
  readonly yaw: number;
}

const OVERLAP_TOLERANCE = 1e-5;

export function testBoxOf(part: Pick<StudioBg3dRoomPart, "name" | "position" | "scale" | "rotation">): StudioBg3dTestBox {
  return {
    name: part.name,
    center: [part.position[0], part.position[1], part.position[2]],
    half: [part.scale[0] / 2, part.scale[1] / 2, part.scale[2] / 2],
    yaw: part.rotation[1],
  };
}

/** 상자의 로컬 X·Z 축(월드 XZ 평면 단위 벡터). three 의 요 회전과 같은 방향이다. */
function axes(box: StudioBg3dTestBox): readonly [readonly [number, number], readonly [number, number]] {
  const cos = Math.cos(box.yaw);
  const sin = Math.sin(box.yaw);
  return [[cos, -sin], [sin, cos]];
}

function radiusOn(box: StudioBg3dTestBox, axis: readonly [number, number]): number {
  const [ax, az] = axes(box);
  return box.half[0] * Math.abs(ax[0] * axis[0] + ax[1] * axis[1]) + box.half[2] * Math.abs(az[0] * axis[0] + az[1] * axis[1]);
}

/** 두 상자의 최소 침투 깊이(m). 0 이하면 떨어져 있거나 맞닿아 있다. */
export function testBoxPenetration(a: StudioBg3dTestBox, b: StudioBg3dTestBox): number {
  const penetrationY = a.half[1] + b.half[1] - Math.abs(a.center[1] - b.center[1]);
  let minimum = penetrationY;
  const dx = b.center[0] - a.center[0];
  const dz = b.center[2] - a.center[2];
  for (const axis of [...axes(a), ...axes(b)]) {
    const distance = Math.abs(dx * axis[0] + dz * axis[1]);
    minimum = Math.min(minimum, radiusOn(a, axis) + radiusOn(b, axis) - distance);
  }
  return minimum;
}

export function testBoxesOverlap(a: StudioBg3dTestBox, b: StudioBg3dTestBox): boolean {
  return testBoxPenetration(a, b) > OVERLAP_TOLERANCE;
}

export interface StudioBg3dTestBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** 월드 축 정렬 경계(요 회전을 반영한다). */
export function testBoxBounds(box: StudioBg3dTestBox): StudioBg3dTestBounds {
  const rx = radiusOn(box, [1, 0]);
  const rz = radiusOn(box, [0, 1]);
  return {
    min: [box.center[0] - rx, box.center[1] - box.half[1], box.center[2] - rz],
    max: [box.center[0] + rx, box.center[1] + box.half[1], box.center[2] + rz],
  };
}

export function testBoundsInside(inner: StudioBg3dTestBounds, outer: StudioBg3dTestBounds, tolerance = 0.001): boolean {
  return [0, 1, 2].every((axis) =>
    inner.min[axis]! >= outer.min[axis]! - tolerance && inner.max[axis]! <= outer.max[axis]! + tolerance);
}

/** 서로 겹치는 쌍의 이름 목록(실패 메시지용). */
export function overlappingPairs(
  left: readonly StudioBg3dTestBox[],
  right: readonly StudioBg3dTestBox[],
  sameList = false,
): string[] {
  const pairs: string[] = [];
  left.forEach((a, i) => {
    right.forEach((b, j) => {
      if (sameList && j <= i) return;
      if (testBoxesOverlap(a, b)) pairs.push(`${a.name} ↔ ${b.name} (${testBoxPenetration(a, b).toFixed(4)}m)`);
    });
  });
  return pairs;
}
