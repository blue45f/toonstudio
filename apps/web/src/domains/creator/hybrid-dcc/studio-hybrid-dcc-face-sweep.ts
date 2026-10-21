/**
 * 면 영역 쓸기(sweep) 접촉 거리: 평평한 영역을 법선 방향으로 움직일 때 처음 다른 면에 닿는 거리.
 *
 * 영역이 쓸고 지나가는 부피는 영역을 법선 축에 수직인 평면에 비춘 그림자(발자국) 위에 서 있는 기둥이다.
 * 어떤 면의 한 점이 이 기둥 안으로 들어오는 가장 이른 거리는 그 점의 그림자가 발자국 안에 들어가는지와
 * 영역 면에서 그 점까지의 높이 차로 정확히 정해진다. 그래서 면마다 삼각형으로 나눠 영역 면(볼록)의 그림자와
 * 겹치는 볼록 다각형을 잘라 내고, 그 꼭짓점들의 높이 차 가운데 가장 작은 값을 접촉 거리로 쓴다.
 * 높이는 평면 위에서 일차식이라 꼭짓점에서만 따져도 최솟값을 놓치지 않는다. 표본 광선처럼 얇은 장애물이
 * 표본 사이로 빠지는 일이 없다.
 *
 * 넓이가 0인 겹침(영역 가장자리를 스치는 이웃 면)은 접촉으로 세지 않는다. 가장자리로 이어진 이웃 면은
 * 호출하는 쪽이 따로 판정하고 여기서는 건너뛴다. 순수 함수만 둔다.
 */

export interface StudioSweepVec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface StudioSweepRegionFace {
  /** 면의 꼭짓점(법선 쪽에서 볼 때 반시계, 볼록 평면). */
  readonly points: readonly StudioSweepVec[];
  /** 면의 단위 법선. */
  readonly normal: StudioSweepVec;
}

export interface StudioSweepRegion {
  /** 영역을 움직이는 단위 축. */
  readonly normal: StudioSweepVec;
  readonly faces: readonly StudioSweepRegionFace[];
}

export interface StudioSweepObstacle {
  readonly id: number;
  readonly points: readonly StudioSweepVec[];
  readonly center: StudioSweepVec;
  readonly radius: number;
}

export interface StudioSweepOptions {
  /** 건너뛸 면 ID(영역 자신과 가장자리로 이어진 이웃). */
  readonly skip: ReadonlySet<number>;
  /** 함께 움직이는 다른 영역의 면 ID. 서로 다가가므로 접촉 거리를 절반으로 본다. */
  readonly moving: ReadonlySet<number>;
  /** 이보다 넓이가 작은 겹침은 스치는 것으로 본다. */
  readonly areaEpsilon: number;
  /** 이보다 작은 높이 차는 같은 높이로 본다. */
  readonly heightEpsilon: number;
}

/** 영역 면의 법선이 이동 축과 이루는 코사인이 이보다 작으면 그림자로 높이를 정할 수 없다. */
export const STUDIO_SWEEP_MIN_FACING = 0.02;

interface Point2 {
  readonly u: number;
  readonly v: number;
}

interface RegionFace2 {
  readonly polygon: readonly Point2[];
  readonly s0: number;
  readonly su: number;
  readonly sv: number;
  readonly minU: number;
  readonly maxU: number;
  readonly minV: number;
  readonly maxV: number;
}

function cross(a: StudioSweepVec, b: StudioSweepVec): StudioSweepVec {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dot(a: StudioSweepVec, b: StudioSweepVec): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 면 목록으로 거르기용 구를 단 장애물 목록을 만든다. */
export function createStudioSweepObstacles(
  faces: readonly { readonly id: number; readonly points: readonly StudioSweepVec[] }[],
): StudioSweepObstacle[] {
  return faces.map(({ id, points }) => {
    let x = 0;
    let y = 0;
    let z = 0;
    for (const point of points) {
      x += point.x;
      y += point.y;
      z += point.z;
    }
    const center = { x: x / points.length, y: y / points.length, z: z / points.length };
    let radius = 0;
    for (const point of points) {
      radius = Math.max(radius, Math.hypot(point.x - center.x, point.y - center.y, point.z - center.z));
    }
    return { id, points, center, radius };
  });
}

/** 볼록 다각형(반시계) `clip` 안쪽으로 `subject`를 자른다(Sutherland-Hodgman). */
function clipToConvex(subject: readonly Point2[], clip: readonly Point2[]): Point2[] {
  let output = [...subject];
  for (let index = 0; index < clip.length && output.length > 0; index += 1) {
    const a = clip[index]!;
    const b = clip[(index + 1) % clip.length]!;
    const ex = b.u - a.u;
    const ey = b.v - a.v;
    const input = output;
    output = [];
    for (let at = 0; at < input.length; at += 1) {
      const p = input[at]!;
      const q = input[(at + 1) % input.length]!;
      const sp = ex * (p.v - a.v) - ey * (p.u - a.u);
      const sq = ex * (q.v - a.v) - ey * (q.u - a.u);
      if (sp >= 0) output.push(p);
      if ((sp >= 0) !== (sq >= 0)) {
        const ratio = sp / (sp - sq);
        output.push({ u: p.u + (q.u - p.u) * ratio, v: p.v + (q.v - p.v) * ratio });
      }
    }
  }
  return output;
}

function polygonArea(polygon: readonly Point2[]): number {
  let twice = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const p = polygon[index]!;
    const q = polygon[(index + 1) % polygon.length]!;
    twice += p.u * q.v - q.u * p.v;
  }
  return Math.abs(twice) / 2;
}

/**
 * 영역을 `direction * normal` 쪽으로 쓸 때 장애물에 처음 닿는 거리. 닿는 것이 없으면 Infinity.
 * 영역 면 가운데 이동 축과 거의 수직인 면이 있으면 그림자로 높이를 정할 수 없어 0을 돌려준다.
 */
export function studioSweepFirstContact(
  region: StudioSweepRegion,
  direction: 1 | -1,
  obstacles: readonly StudioSweepObstacle[],
  options: StudioSweepOptions,
): number {
  const axis = region.normal;
  const helper = Math.abs(axis.x) < 0.6 ? { x: 1, y: 0, z: 0 } : Math.abs(axis.y) < 0.6 ? { x: 0, y: 1, z: 0 } : { x: 0, y: 0, z: 1 };
  const rawU = cross(axis, helper);
  const lengthU = Math.hypot(rawU.x, rawU.y, rawU.z);
  const axisU = { x: rawU.x / lengthU, y: rawU.y / lengthU, z: rawU.z / lengthU };
  const axisV = cross(axis, axisU);

  let ox = 0;
  let oy = 0;
  let oz = 0;
  let pointCount = 0;
  for (const face of region.faces) {
    for (const point of face.points) {
      ox += point.x;
      oy += point.y;
      oz += point.z;
      pointCount += 1;
    }
  }
  if (pointCount === 0) return Number.POSITIVE_INFINITY;
  const origin = { x: ox / pointCount, y: oy / pointCount, z: oz / pointCount };
  const local = (point: StudioSweepVec): StudioSweepVec => ({ x: point.x - origin.x, y: point.y - origin.y, z: point.z - origin.z });

  const faces: RegionFace2[] = [];
  let minU = Number.POSITIVE_INFINITY;
  let maxU = Number.NEGATIVE_INFINITY;
  let minV = Number.POSITIVE_INFINITY;
  let maxV = Number.NEGATIVE_INFINITY;
  for (const face of region.faces) {
    const facing = dot(face.normal, axis);
    if (!(facing >= STUDIO_SWEEP_MIN_FACING)) return 0;
    const polygon = face.points.map((point) => {
      const offset = local(point);
      return { u: dot(offset, axisU), v: dot(offset, axisV) };
    });
    const anchor = local(face.points[0]!);
    faces.push({
      polygon,
      s0: dot(face.normal, anchor) / facing,
      su: -dot(face.normal, axisU) / facing,
      sv: -dot(face.normal, axisV) / facing,
      minU: Math.min(...polygon.map((point) => point.u)),
      maxU: Math.max(...polygon.map((point) => point.u)),
      minV: Math.min(...polygon.map((point) => point.v)),
      maxV: Math.max(...polygon.map((point) => point.v)),
    });
    const last = faces[faces.length - 1]!;
    minU = Math.min(minU, last.minU);
    maxU = Math.max(maxU, last.maxU);
    minV = Math.min(minV, last.minV);
    maxV = Math.max(maxV, last.maxV);
  }

  let best = Number.POSITIVE_INFINITY;
  for (const obstacle of obstacles) {
    if (options.skip.has(obstacle.id)) continue;
    const centerOffset = local(obstacle.center);
    const centerU = dot(centerOffset, axisU);
    const centerV = dot(centerOffset, axisV);
    if (
      centerU + obstacle.radius < minU || centerU - obstacle.radius > maxU
      || centerV + obstacle.radius < minV || centerV - obstacle.radius > maxV
    ) {
      continue;
    }
    const projected = obstacle.points.map((point) => {
      const offset = local(point);
      return { u: dot(offset, axisU), v: dot(offset, axisV), s: dot(offset, axis) };
    });
    const moving = options.moving.has(obstacle.id);
    for (let corner = 1; corner + 1 < projected.length; corner += 1) {
      const p0 = projected[0]!;
      const p1 = projected[corner]!;
      const p2 = projected[corner + 1]!;
      const area2 = (p1.u - p0.u) * (p2.v - p0.v) - (p2.u - p0.u) * (p1.v - p0.v);
      if (!(Math.abs(area2) > 2 * options.areaEpsilon)) continue;
      const gradU = ((p1.s - p0.s) * (p2.v - p0.v) - (p2.s - p0.s) * (p1.v - p0.v)) / area2;
      const gradV = ((p2.s - p0.s) * (p1.u - p0.u) - (p1.s - p0.s) * (p2.u - p0.u)) / area2;
      const triMinU = Math.min(p0.u, p1.u, p2.u);
      const triMaxU = Math.max(p0.u, p1.u, p2.u);
      const triMinV = Math.min(p0.v, p1.v, p2.v);
      const triMaxV = Math.max(p0.v, p1.v, p2.v);
      const subject: Point2[] = [p0, p1, p2];
      for (const face of faces) {
        if (triMaxU < face.minU || triMinU > face.maxU || triMaxV < face.minV || triMinV > face.maxV) continue;
        const overlap = clipToConvex(subject, face.polygon);
        if (overlap.length < 3 || !(polygonArea(overlap) > options.areaEpsilon)) continue;
        let lowest = Number.POSITIVE_INFINITY;
        let highest = Number.NEGATIVE_INFINITY;
        for (const point of overlap) {
          const heightOfObstacle = p0.s + gradU * (point.u - p0.u) + gradV * (point.v - p0.v);
          const heightOfRegion = face.s0 + face.su * point.u + face.sv * point.v;
          const gap = direction * (heightOfObstacle - heightOfRegion);
          lowest = Math.min(lowest, gap);
          highest = Math.max(highest, gap);
        }
        // 겹침 전체가 영역 뒤쪽이면 이 방향으로는 닿지 않는다. 영역 평면을 가로지르면 lowest 가 음수라 0이다.
        if (!(highest > options.heightEpsilon)) continue;
        const contact = Math.max(0, lowest);
        best = Math.min(best, moving ? contact / 2 : contact);
        if (best === 0) return 0;
      }
    }
  }
  return best;
}
