/**
 * Studio Pathfinder — Vector Path Offsetting & Boolean Engine (실구현 v3).
 *
 * 실제 구현 범위 (정직한 명세 — 2026-10-13 교체, 2026-10-14 조인 추가):
 *  - Vector path offsetting (stroke outline expansion): 구현됨. 코너 조인
 *    (miter/bevel/round) 옵션을 지원한다 — 바깥 코너는 선택한 조인으로,
 *    안쪽 코너는 두 오프셋 직선의 교점(예각)으로 잇는다. miter 가
 *    miterLimit(기본 4, SVG 규약)을 넘으면 bevel 로 자동 폴백한다.
 *    기본 조인은 miter 다(구버전의 "다음 구간 법선 단일점" 절단은 폐기).
 *  - Boolean path operations (union/intersect/difference/exclusion): **실구현.**
 *    두 단순 폴리곤(자기교차 없는 단일 링)의 모든 변 교차를 분할해 평면
 *    아레인지먼트를 만들고, 반쪽변(half-edge)의 좌측 포함 여부로 결과를
 *    분류한 뒤 경계 반쪽변을 이어 붙이는 방식이다. 외부 라이브러리에 의존하지
 *    않는 자체 구현이며(알고리즘 접근은 Martinez 류 sweep/arrangement 계열의
 *    고전적 구성을 따르되 코드는 이 레포에서 새로 작성), 결과는 구멍을 가진
 *    영역까지 표현하는 다중 영역(Region) 모델로 돌려준다.
 *  - 곡선은 다루지 않는다 — 입력은 직선 변 폴리곤이다. 곡선 도형은 호출자가
 *    먼저 폴리곤으로 근사한다(예: studio-path-boolean 의 studioShapeToPolygon).
 *
 * 결과 모델:
 *  - `StudioPathfinderBooleanResult.regions`: 영역 목록. 각 영역은 외곽 링 1개와
 *    구멍 링 0개 이상으로 이뤄진다. 외곽 링은 부호 있는 면적이 양수(원시 좌표에
 *    대한 shoelace 부호), 구멍 링은 음수가 되도록 정규화된다. 화면 좌표계(y-down)
 *    에서는 양의 면적 링이 시계 방향으로 보이지만, 부호 규약 자체는 좌표 수학으로만
 *    정의되며 렌더러는 부호가 아니라 outer/hole 역할로 판단해야 한다.
 *  - 빈 결과는 regions 가 빈 배열이다(교차 없음, 완전히 빼짐 등).
 *
 * 한계:
 *  - 입력 폴리곤이 자기교차하면(단순 폴리곤이 아니면) 결과를 보장하지 않는다.
 *  - 교차 탐색이 변 쌍 전수 비교(O(n·m))라 정점이 수천 개 단위인 입력에서는
 *    느려질 수 있다. 편집기 도형 규모(수백 개 이하)를 전제로 한다.
 *  - 세 변 이상이 한 점에서 정확히 만나는 동시 교차는 부동소수점 오차 범위에서
 *    병합되며, 그 범위 밖의 병적 배치는 수치 잔부스러기(미세 링)를 만들 수 있다.
 *    면적이 수치 하한 미만인 링은 결과에서 버려진다.
 */

export const STUDIO_PATHFINDER_VECTOR_ENGINE_VERSION = "studio-pathfinder-vector-engine-v3" as const;

export type StudioPathfinderBooleanMode = "union" | "intersect" | "difference" | "exclusion";

/** 오프셋 코너 조인 방식 — SVG stroke-linejoin 과 같은 어휘를 쓴다. */
export type StudioPathfinderJoinStyle = "miter" | "bevel" | "round";

export interface StudioPathfinderOffsetOptions {
  /** 바깥 코너 조인. 기본 "miter". */
  readonly join?: StudioPathfinderJoinStyle;
  /** miter 길이/|반경| 이 이 값을 넘으면 bevel 로 폴백. 기본 4, 하한 1. */
  readonly miterLimit?: number;
  /** round 아크의 최대 간격 각(라디안). 기본 π/12(15°), 상한 π/2. */
  readonly roundStepAngle?: number;
}

export interface StudioPathfinderPoint {
  readonly x: number;
  readonly y: number;
}

export interface StudioPathfinderPolygon {
  readonly points: readonly StudioPathfinderPoint[];
}

/** 불리언 결과 영역 1개 — 외곽 링(양의 면적)과 그 안의 구멍 링들(음의 면적). */
export interface StudioPathfinderRegion {
  readonly outer: StudioPathfinderPolygon;
  readonly holes: readonly StudioPathfinderPolygon[];
}

export interface StudioPathfinderBooleanResult {
  readonly regions: readonly StudioPathfinderRegion[];
}

// ---------------------------------------------------------------------------
// 기본 기하 유틸 (이 모듈 내부 전용)
// ---------------------------------------------------------------------------

interface MutablePoint {
  x: number;
  y: number;
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** 닫힌 링의 부호 있는 면적(shoelace). 마지막 점이 첫 점을 반복하지 않는 전제. */
function ringSignedArea(points: readonly MutablePoint[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

/** 짝·홀 규칙 점 포함 검사 — 점이 링 경계 위에 있지 않을 때만 신뢰할 수 있다. */
function pointInRing(point: MutablePoint, ring: readonly MutablePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const pi = ring[i]!;
    const pj = ring[j]!;
    if (
      (pi.y > point.y) !== (pj.y > point.y)
      && point.x < ((pj.x - pi.x) * (point.y - pi.y)) / (pj.y - pi.y) + pi.x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

// ---------------------------------------------------------------------------
// 입력 정규화
// ---------------------------------------------------------------------------

interface NormalizedRing {
  readonly points: MutablePoint[];
  readonly signedArea: number;
}

/**
 * 링을 정규화한다: 유한하지 않은 좌표는 조용히 버리지 않고 예외로 알린다
 * (좌표 하나가 오염된 도형을 축소해 돌려주면 사용자가 알아채지 못한다).
 * 연속 중복점·닫힘 중복을 제거하고, 정점 3개 미만이거나 면적이 수치 하한
 * 이하면 "빈 영역"으로 취급해 null 을 돌려준다.
 */
function normalizeRing(
  polygon: StudioPathfinderPolygon,
  label: string,
  areaEps: number,
): NormalizedRing | null {
  const distinct: MutablePoint[] = [];
  for (const point of polygon.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      throw new Error(
        `StudioPathfinder: ${label}에 유한하지 않은 좌표가 있어 불리언 연산을 중단했어요.`,
      );
    }
    const last = distinct[distinct.length - 1];
    if (!last || last.x !== point.x || last.y !== point.y) {
      distinct.push({ x: point.x, y: point.y });
    }
  }
  if (
    distinct.length > 1
    && distinct[0]!.x === distinct[distinct.length - 1]!.x
    && distinct[0]!.y === distinct[distinct.length - 1]!.y
  ) {
    distinct.pop();
  }
  if (distinct.length < 3) return null;
  const signedArea = ringSignedArea(distinct);
  if (Math.abs(signedArea) <= areaEps) return null;
  // 감기 방향을 양의 면적으로 통일한다 — 이후 단계는 "링 순회 방향의 왼쪽이
  // 내부"라는 규약 하나로 동작한다. 입력 감기 방향은 결과에 영향을 주지 않는다.
  if (signedArea < 0) distinct.reverse();
  return { points: distinct, signedArea: Math.abs(signedArea) };
}

function ringToRegion(ring: NormalizedRing): StudioPathfinderRegion {
  const points = ring.signedArea > 0 ? ring.points : ring.points.slice().reverse();
  return { outer: { points }, holes: [] };
}

// ---------------------------------------------------------------------------
// 변 분할 — 두 링의 모든 교차점에서 변을 쪼갠다
// ---------------------------------------------------------------------------

interface RawSegment {
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly poly: 0 | 1;
}

interface SplitPoint {
  t: number;
  x: number;
  y: number;
}

/** 끝점 스냅 허용치(매개변수 t 기준). 이 범위 안의 교차는 기존 정점으로 본다. */
const SNAP_T = 1e-9;

/**
 * 두 변의 교차를 구해 각 변의 분할점 목록에 넣는다.
 * 교차 좌표는 한 번만 계산해 양쪽이 같은 값을 쓰게 하고, 끝점에 스냅될 때는
 * 기존 정점 좌표를 그대로 재사용해 T자 접합이 정확히 맞물리게 한다.
 * 평행(공선 포함)인 쌍은 공선 겹침 구간 안쪽에 있는 상대 끝점만 분할점으로 넣는다.
 */
function collectIntersections(
  segP: RawSegment,
  segQ: RawSegment,
  splitsP: SplitPoint[],
  splitsQ: SplitPoint[],
): void {
  const rx = segP.bx - segP.ax;
  const ry = segP.by - segP.ay;
  const sx = segQ.bx - segQ.ax;
  const sy = segQ.by - segQ.ay;
  const qpx = segQ.ax - segP.ax;
  const qpy = segQ.ay - segP.ay;
  const rLen = Math.hypot(rx, ry);
  const sLen = Math.hypot(sx, sy);
  if (rLen === 0 || sLen === 0) return;
  const rxs = cross(rx, ry, sx, sy);

  if (Math.abs(rxs) > 1e-12 * rLen * sLen) {
    const t = cross(qpx, qpy, sx, sy) / rxs;
    const u = cross(qpx, qpy, rx, ry) / rxs;
    if (t < -SNAP_T || t > 1 + SNAP_T || u < -SNAP_T || u > 1 + SNAP_T) return;
    const tc = Math.min(1, Math.max(0, t));
    const uc = Math.min(1, Math.max(0, u));
    let x: number;
    let y: number;
    if (tc === 0) {
      x = segP.ax;
      y = segP.ay;
    } else if (tc === 1) {
      x = segP.bx;
      y = segP.by;
    } else if (uc === 0) {
      x = segQ.ax;
      y = segQ.ay;
    } else if (uc === 1) {
      x = segQ.bx;
      y = segQ.by;
    } else {
      x = segP.ax + tc * rx;
      y = segP.ay + tc * ry;
    }
    splitsP.push({ t: tc, x, y });
    splitsQ.push({ t: uc, x, y });
    return;
  }

  // 평행: 공선이 아니면 교차 없음.
  const qpLen = Math.hypot(qpx, qpy);
  if (qpLen > 0 && Math.abs(cross(qpx, qpy, rx, ry)) > 1e-12 * qpLen * rLen) return;
  // 공선: 상대 변의 끝점 중 이 변의 안쪽에 있는 점을 분할점으로 넣는다(양방향).
  const rr = rx * rx + ry * ry;
  const ss = sx * sx + sy * sy;
  const tA = ((segQ.ax - segP.ax) * rx + (segQ.ay - segP.ay) * ry) / rr;
  const tB = ((segQ.bx - segP.ax) * rx + (segQ.by - segP.ay) * ry) / rr;
  if (tA > SNAP_T && tA < 1 - SNAP_T) splitsP.push({ t: tA, x: segQ.ax, y: segQ.ay });
  if (tB > SNAP_T && tB < 1 - SNAP_T) splitsP.push({ t: tB, x: segQ.bx, y: segQ.by });
  const uA = ((segP.ax - segQ.ax) * sx + (segP.ay - segQ.ay) * sy) / ss;
  const uB = ((segP.bx - segQ.ax) * sx + (segP.by - segQ.ay) * sy) / ss;
  if (uA > SNAP_T && uA < 1 - SNAP_T) splitsQ.push({ t: uA, x: segP.ax, y: segP.ay });
  if (uB > SNAP_T && uB < 1 - SNAP_T) splitsQ.push({ t: uB, x: segP.bx, y: segP.by });
}

// ---------------------------------------------------------------------------
// 점 레지스트리 — 부동소수점 오차 범위 안의 점들을 하나의 정점으로 병합
// ---------------------------------------------------------------------------

class PointRegistry {
  private readonly canonical: MutablePoint[] = [];

  private readonly indexByKey = new Map<string, number>();

  public constructor(private readonly eps: number) {}

  public add(x: number, y: number): number {
    // 양자화 셀 키 + 이웃 셀까지 확인해 셀 경계에서 갈라지는 것을 막는다.
    const cx = Math.round(x / this.eps);
    const cy = Math.round(y / this.eps);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const found = this.indexByKey.get(`${cx + dx}:${cy + dy}`);
        if (found !== undefined) {
          const p = this.canonical[found]!;
          if (Math.abs(p.x - x) <= this.eps && Math.abs(p.y - y) <= this.eps) return found;
        }
      }
    }
    const index = this.canonical.length;
    this.canonical.push({ x, y });
    this.indexByKey.set(`${cx}:${cy}`, index);
    return index;
  }

  public point(index: number): MutablePoint {
    return this.canonical[index]!;
  }

  public get size(): number {
    return this.canonical.length;
  }
}

// ---------------------------------------------------------------------------
// 아레인지먼트 — 원자 변·반쪽변 분류·경계 스티칭
// ---------------------------------------------------------------------------

interface AtomicEdge {
  readonly from: number;
  readonly to: number;
  readonly poly: 0 | 1;
}

interface UndirectedEdge {
  readonly lo: number;
  readonly hi: number;
  /** A 링의 순회 방향: 1 = lo→hi, -1 = hi→lo, 0 = 없음, 2 = 양방향(퇴화) */
  aDir: number;
  bDir: number;
}

interface BoundaryHalf {
  readonly from: number;
  readonly to: number;
  readonly angle: number;
  used: boolean;
}

function applyBooleanMode(mode: StudioPathfinderBooleanMode, inA: boolean, inB: boolean): boolean {
  switch (mode) {
    case "union":
      return inA || inB;
    case "intersect":
      return inA && inB;
    case "difference":
      return inA && !inB;
    case "exclusion":
      return inA !== inB;
  }
}

/** 링 시작점을 사전식으로 가장 작은 정점으로 회전시켜 출력을 결정적으로 만든다. */
function rotateRingToCanonicalStart(points: MutablePoint[]): MutablePoint[] {
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i]!;
    const s = points[start]!;
    if (p.x < s.x || (p.x === s.x && p.y < s.y)) start = i;
  }
  return start === 0 ? points : [...points.slice(start), ...points.slice(0, start)];
}

function computeBoolean(
  ringA: NormalizedRing,
  ringB: NormalizedRing,
  mode: StudioPathfinderBooleanMode,
): StudioPathfinderBooleanResult {
  const allPoints = [...ringA.points, ...ringB.points];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of allPoints) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const diag = Math.max(Math.hypot(maxX - minX, maxY - minY), 1);
  const pointEps = diag * 1e-9;
  const ringAreaEps = diag * diag * 1e-13;

  // 1) 변 목록과 교차 분할점을 모은다.
  const segments: RawSegment[] = [];
  const buildSegments = (ring: NormalizedRing, poly: 0 | 1): number => {
    const start = segments.length;
    for (let i = 0; i < ring.points.length; i += 1) {
      const p = ring.points[i]!;
      const q = ring.points[(i + 1) % ring.points.length]!;
      segments.push({ ax: p.x, ay: p.y, bx: q.x, by: q.y, poly });
    }
    return start;
  };
  const aSegStart = buildSegments(ringA, 0);
  const bSegStart = buildSegments(ringB, 1);
  const splits: SplitPoint[][] = segments.map(() => []);
  for (let i = aSegStart; i < bSegStart; i += 1) {
    for (let j = bSegStart; j < segments.length; j += 1) {
      collectIntersections(segments[i]!, segments[j]!, splits[i]!, splits[j]!);
    }
  }

  // 2) 정점을 등록하고 원자 변으로 쪼갠다.
  const registry = new PointRegistry(pointEps);
  const atomics: AtomicEdge[] = [];
  for (let s = 0; s < segments.length; s += 1) {
    const seg = segments[s]!;
    const chain: { t: number; index: number }[] = [
      { t: 0, index: registry.add(seg.ax, seg.ay) },
    ];
    const sorted = splits[s]!.slice().sort((a, b) => a.t - b.t);
    for (const split of sorted) {
      chain.push({ t: split.t, index: registry.add(split.x, split.y) });
    }
    chain.push({ t: 1, index: registry.add(seg.bx, seg.by) });
    for (let k = 0; k + 1 < chain.length; k += 1) {
      const from = chain[k]!.index;
      const to = chain[k + 1]!.index;
      if (from !== to) atomics.push({ from, to, poly: seg.poly });
    }
  }

  // 3) 무방향 변 단위로 두 링의 순회 방향을 기록한다.
  const undirected = new Map<string, UndirectedEdge>();
  for (const atomic of atomics) {
    const lo = Math.min(atomic.from, atomic.to);
    const hi = Math.max(atomic.from, atomic.to);
    const key = `${lo}:${hi}`;
    let entry = undirected.get(key);
    if (!entry) {
      entry = { lo, hi, aDir: 0, bDir: 0 };
      undirected.set(key, entry);
    }
    const dir = atomic.from === lo ? 1 : -1;
    if (atomic.poly === 0) {
      entry.aDir = entry.aDir === 0 || entry.aDir === dir ? dir : 2;
    } else {
      entry.bDir = entry.bDir === 0 || entry.bDir === dir ? dir : 2;
    }
  }

  // 4) 반쪽변마다 "결과 영역이 왼쪽에 있는가"를 분류하고 경계 반쪽변만 남긴다.
  const halves: BoundaryHalf[] = [];
  const insideByCoverage = (
    coverage: number,
    halfDir: number,
    midpointInside: boolean,
  ): boolean => {
    if (coverage === 2) return true;
    if (coverage === 0) return midpointInside;
    return coverage === halfDir;
  };
  for (const entry of undirected.values()) {
    const loPoint = registry.point(entry.lo);
    const hiPoint = registry.point(entry.hi);
    const midpoint = { x: (loPoint.x + hiPoint.x) / 2, y: (loPoint.y + hiPoint.y) / 2 };
    // 이 변을 덮지 않는 링에 대해서는 양쪽 포함 여부가 같고, 변의 중점은 그 링의
    // 경계 위에 있을 수 없으므로(교차는 전부 분할됐다) 점 포함 검사로 판정한다.
    const midInA = entry.aDir === 0 ? pointInRing(midpoint, ringA.points) : false;
    const midInB = entry.bDir === 0 ? pointInRing(midpoint, ringB.points) : false;
    const leftOf = (halfDir: number): boolean => applyBooleanMode(
      mode,
      insideByCoverage(entry.aDir, halfDir, midInA),
      insideByCoverage(entry.bDir, halfDir, midInB),
    );
    const forward = leftOf(1); // lo→hi 방향의 왼쪽
    const backward = leftOf(-1); // hi→lo 방향의 왼쪽
    if (forward && !backward) {
      halves.push({
        from: entry.lo,
        to: entry.hi,
        angle: Math.atan2(hiPoint.y - loPoint.y, hiPoint.x - loPoint.x),
        used: false,
      });
    } else if (backward && !forward) {
      halves.push({
        from: entry.hi,
        to: entry.lo,
        angle: Math.atan2(loPoint.y - hiPoint.y, loPoint.x - hiPoint.x),
        used: false,
      });
    }
  }

  // 5) 경계 반쪽변을 링으로 이어 붙인다. 정점에서는 들어온 방향의 쌍둥이 반쪽변을
  //    반시계 순서로 거슬러 가장 먼저 만나는 경계 반쪽변을 다음으로 고른다 —
  //    결과 영역을 항상 왼쪽에 두는 표준 face 순회 규칙이다.
  const outgoing = new Map<number, BoundaryHalf[]>();
  for (const half of halves) {
    const list = outgoing.get(half.from);
    if (list) list.push(half);
    else outgoing.set(half.from, [half]);
  }
  const rings: MutablePoint[][] = [];
  const TAU = Math.PI * 2;
  for (const start of halves) {
    if (start.used) continue;
    const ringIndices: number[] = [start.from];
    let current = start;
    let closed = false;
    for (let guard = 0; guard <= halves.length; guard += 1) {
      current.used = true;
      ringIndices.push(current.to);
      if (current.to === start.from) {
        closed = true;
        break;
      }
      const candidates = outgoing.get(current.to) ?? [];
      const currentPoint = registry.point(current.to);
      const fromPoint = registry.point(current.from);
      const twinAngle = Math.atan2(fromPoint.y - currentPoint.y, fromPoint.x - currentPoint.x);
      let next: BoundaryHalf | null = null;
      let nextDelta = Infinity;
      for (const candidate of candidates) {
        if (candidate.used && candidate !== start) continue;
        let delta = (twinAngle - candidate.angle) % TAU;
        if (delta < 0) delta += TAU;
        if (delta === 0) continue; // 쌍둥이 자신(되돌아가기)은 마지막 수단으로만
        if (delta < nextDelta) {
          nextDelta = delta;
          next = candidate;
        }
      }
      if (!next) {
        // 남은 후보가 쌍둥이뿐인 퇴화(폭 0 갈라짐) — 그대로 되돌아가 닫는다.
        next = candidates.find((candidate) => !candidate.used || candidate === start) ?? null;
      }
      if (!next) break;
      current = next;
    }
    if (!closed) continue;
    ringIndices.pop(); // 닫힘 중복(시작점 반복) 제거
    if (ringIndices.length < 3) continue;
    const points = ringIndices.map((index) => {
      const p = registry.point(index);
      return { x: p.x, y: p.y };
    });
    rings.push(points);
  }

  // 6) 면적 부호로 외곽/구멍을 나누고 구멍을 가장 작은 포함 외곽에 붙인다.
  interface ClassifiedRing {
    points: MutablePoint[];
    area: number;
  }
  const outers: ClassifiedRing[] = [];
  const holes: ClassifiedRing[] = [];
  for (const points of rings) {
    const area = ringSignedArea(points);
    if (Math.abs(area) <= ringAreaEps) continue;
    if (area > 0) outers.push({ points, area });
    else holes.push({ points, area });
  }
  outers.sort((a, b) => b.area - a.area);
  const regions: { outer: ClassifiedRing; holes: ClassifiedRing[] }[] = outers.map((outer) => ({
    outer,
    holes: [],
  }));
  for (const hole of holes) {
    let best: { outer: ClassifiedRing; holes: ClassifiedRing[] } | null = null;
    for (const region of regions) {
      if (pointInRing(hole.points[0]!, region.outer.points)) {
        if (!best || region.outer.area < best.outer.area) best = region;
      }
    }
    if (best) {
      best.holes.push(hole);
    } else {
      // 포함 외곽을 찾지 못한 구멍(접선 접촉 등 수치 경계) — 버리지 않고
      // 방향을 뒤집어 독립 영역으로 승격해 기하를 보존한다.
      const promoted: ClassifiedRing = {
        points: hole.points.slice().reverse(),
        area: -hole.area,
      };
      regions.push({ outer: promoted, holes: [] });
    }
  }
  regions.sort((a, b) => b.outer.area - a.outer.area);
  return {
    regions: regions.map((region) => ({
      outer: { points: rotateRingToCanonicalStart(region.outer.points) },
      holes: region.holes
        .slice()
        .sort((a, b) => a.area - b.area)
        .map((hole) => ({ points: rotateRingToCanonicalStart(hole.points) })),
    })),
  };
}

// ---------------------------------------------------------------------------
// 공개 엔진
// ---------------------------------------------------------------------------

interface UnitSegment {
  readonly dx: number;
  readonly dy: number;
  readonly nx: number;
  readonly ny: number;
}

/**
 * 꺾인 정점에서 한쪽(부호 있는 반경 sr) 오프셋 윤곽점들을 만든다.
 * - 직진(공선): 오프셋점 1개.
 * - 안쪽 코너(cross 와 sr 의 부호가 같음): 두 오프셋 직선의 교점 1개 — 안쪽은
 *   조인 방식과 무관하게 예각으로 만나는 것이 기하적으로 올바르다.
 * - 바깥 코너: join 방식대로 miter(교점, miterLimit 초과 시 bevel 폴백) /
 *   bevel(양쪽 오프셋점 직결) / round(정점 중심·반경 |sr| 원호 보간).
 * - 정반대 방향 전환(U턴): round 면 반원, 아니면 양쪽 오프셋점(bevel 상당).
 */
function offsetJoinPoints(
  vertex: StudioPathfinderPoint,
  prev: UnitSegment,
  next: UnitSegment,
  signedRadius: number,
  join: StudioPathfinderJoinStyle,
  miterLimit: number,
  roundStepAngle: number,
): StudioPathfinderPoint[] {
  const off1 = {
    x: vertex.x + prev.nx * signedRadius,
    y: vertex.y + prev.ny * signedRadius,
  };
  const off2 = {
    x: vertex.x + next.nx * signedRadius,
    y: vertex.y + next.ny * signedRadius,
  };
  const crossZ = prev.dx * next.dy - prev.dy * next.dx;
  const dot = prev.dx * next.dx + prev.dy * next.dy;
  const absRadius = Math.abs(signedRadius);
  if (Math.abs(crossZ) < 1e-12) {
    if (dot > 0 || absRadius === 0) return [off1];
    // U턴: 되돌아가는 코너는 원호(반원) 또는 bevel 로 잇는다.
    if (join !== "round") return [off1, off2];
    const steps = Math.max(2, Math.ceil(Math.PI / roundStepAngle));
    const a1 = Math.atan2(off1.y - vertex.y, off1.x - vertex.x);
    const sweep = crossZ >= 0 ? Math.PI : -Math.PI;
    const points: StudioPathfinderPoint[] = [];
    for (let k = 0; k <= steps; k += 1) {
      const a = a1 + (sweep * k) / steps;
      points.push({ x: vertex.x + absRadius * Math.cos(a), y: vertex.y + absRadius * Math.sin(a) });
    }
    return points;
  }
  // 두 오프셋 직선의 교점: off1 + t·prevDir, t = sr·(dot−1)/cross.
  const t = (signedRadius * (dot - 1)) / crossZ;
  const intersection = { x: off1.x + t * prev.dx, y: off1.y + t * prev.dy };
  const isOuter = crossZ * signedRadius < 0;
  if (!isOuter) return [intersection];
  if (join === "bevel") return [off1, off2];
  if (join === "miter") {
    const miterLength = Math.hypot(intersection.x - vertex.x, intersection.y - vertex.y);
    return miterLength <= miterLimit * absRadius ? [intersection] : [off1, off2];
  }
  // round: 오프셋 방향 벡터가 prev→next 로 도는 각(부호 있는 회전각)만큼 원호 보간.
  const turnAngle = Math.atan2(crossZ, dot);
  const steps = Math.max(1, Math.ceil(Math.abs(turnAngle) / roundStepAngle));
  const a1 = Math.atan2(off1.y - vertex.y, off1.x - vertex.x);
  const points: StudioPathfinderPoint[] = [];
  for (let k = 0; k <= steps; k += 1) {
    const a = a1 + (turnAngle * k) / steps;
    points.push({ x: vertex.x + absRadius * Math.cos(a), y: vertex.y + absRadius * Math.sin(a) });
  }
  return points;
}

export class StudioPathfinderVectorEngine {
  /**
   * Expands a sequence of 2D points into an offset outline polygon (stroke expanding).
   * options.join 으로 코너 조인(miter/bevel/round)을 고를 수 있다(기본 miter).
   */
  public static offsetPathOutline(
    points: readonly StudioPathfinderPoint[],
    radius: number,
    options: StudioPathfinderOffsetOptions = {}
  ): StudioPathfinderPolygon {
    // 유한하지 않은 반경은 0으로 접는다 — NaN이 좌표 전체로 번지는 것을 막는다.
    const safeRadius = Number.isFinite(radius) ? radius : 0;
    const join: StudioPathfinderJoinStyle =
      options.join === "bevel" || options.join === "round" ? options.join : "miter";
    const miterLimit =
      Number.isFinite(options.miterLimit) && options.miterLimit! >= 1 ? options.miterLimit! : 4;
    const roundStepAngle =
      Number.isFinite(options.roundStepAngle) && options.roundStepAngle! > 0
        ? Math.min(options.roundStepAngle!, Math.PI / 2)
        : Math.PI / 12;
    // 연속 중복점을 먼저 접는다. 중복점이 끝에 있으면 기존 루프는 마지막 구간의
    // 끝점 오프셋을 만들지 못했고, 전부 같은 점이면 빈 폴리곤이 됐다.
    const distinct: StudioPathfinderPoint[] = [];
    for (const point of points) {
      const last = distinct[distinct.length - 1];
      if (!last || last.x !== point.x || last.y !== point.y) distinct.push(point);
    }
    if (distinct.length === 0) return { points: [] };
    if (distinct.length === 1) {
      const p = distinct[0]!;
      const circlePoints: StudioPathfinderPoint[] = [];
      const numSteps = 12;
      for (let i = 0; i < numSteps; i++) {
        const a = (i * 2 * Math.PI) / numSteps;
        circlePoints.push({ x: p.x + safeRadius * Math.cos(a), y: p.y + safeRadius * Math.sin(a) });
      }
      return { points: circlePoints };
    }

    const segments: UnitSegment[] = [];
    for (let i = 0; i < distinct.length - 1; i++) {
      const p0 = distinct[i]!;
      const p1 = distinct[i + 1]!;
      const dx = p1.x - p0.x;
      const dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy);
      if (len === 0) continue;
      const ux = dx / len;
      const uy = dy / len;
      segments.push({ dx: ux, dy: uy, nx: -uy, ny: ux });
    }
    if (segments.length === 0) return { points: [] };

    const buildSide = (sideSign: 1 | -1): StudioPathfinderPoint[] => {
      const sr = safeRadius * sideSign;
      const first = segments[0]!;
      const lastSeg = segments[segments.length - 1]!;
      const side: StudioPathfinderPoint[] = [
        { x: distinct[0]!.x + first.nx * sr, y: distinct[0]!.y + first.ny * sr },
      ];
      for (let i = 1; i < distinct.length - 1; i++) {
        side.push(
          ...offsetJoinPoints(
            distinct[i]!,
            segments[i - 1]!,
            segments[i]!,
            sr,
            join,
            miterLimit,
            roundStepAngle,
          ),
        );
      }
      const end = distinct[distinct.length - 1]!;
      side.push({ x: end.x + lastSeg.nx * sr, y: end.y + lastSeg.ny * sr });
      return side;
    };

    const leftSide = buildSide(1);
    const rightSide = buildSide(-1);
    return {
      points: [...leftSide, ...rightSide.reverse()],
    };
  }

  /**
   * 두 단순 폴리곤의 불리언 연산. 결과는 다중 영역 모델로 돌려준다.
   * 한쪽이 빈 영역(정점 3개 미만·면적 0)이면 집합 연산의 항등원 규칙으로 처리한다.
   * 좌표에 유한하지 않은 값이 있으면 예외를 던진다(호출자가 사용자에게 알릴 것).
   */
  public static booleanOperation(
    polyA: StudioPathfinderPolygon,
    polyB: StudioPathfinderPolygon,
    mode: StudioPathfinderBooleanMode
  ): StudioPathfinderBooleanResult {
    // 면적 하한은 두 입력의 규모로 정한다(정규화 단계에서 퇴화 링을 거른다).
    let scale = 1;
    for (const poly of [polyA, polyB]) {
      for (const point of poly.points) {
        scale = Math.max(scale, Math.abs(point.x), Math.abs(point.y));
      }
    }
    const areaEps = scale * scale * 1e-13;
    const ringA = normalizeRing(polyA, "첫 번째 도형", areaEps);
    const ringB = normalizeRing(polyB, "두 번째 도형", areaEps);

    if (!ringA && !ringB) return { regions: [] };
    if (!ringA) {
      // A가 비어 있으면: union/exclusion 은 B, intersect/difference 는 빈 결과.
      return mode === "union" || mode === "exclusion"
        ? { regions: [ringToRegion(ringB!)] }
        : { regions: [] };
    }
    if (!ringB) {
      // B가 비어 있으면: intersect 만 빈 결과, 나머지는 A.
      return mode === "intersect" ? { regions: [] } : { regions: [ringToRegion(ringA)] };
    }
    return computeBoolean(ringA, ringB, mode);
  }

  /** 실제 합집합 — 겹침·포함·분리·공유변을 모두 기하적으로 처리한다. */
  public static booleanUnion(
    polyA: StudioPathfinderPolygon,
    polyB: StudioPathfinderPolygon
  ): StudioPathfinderBooleanResult {
    return StudioPathfinderVectorEngine.booleanOperation(polyA, polyB, "union");
  }

  /** 실제 교집합 — 겹치는 면만 남긴다. 닿기만 하면(면적 0) 빈 결과다. */
  public static booleanIntersect(
    polyA: StudioPathfinderPolygon,
    polyB: StudioPathfinderPolygon
  ): StudioPathfinderBooleanResult {
    return StudioPathfinderVectorEngine.booleanOperation(polyA, polyB, "intersect");
  }

  /** 실제 차집합 — A에서 B와 겹치는 면을 오려낸다(구멍이 생길 수 있다). */
  public static booleanDifference(
    polyA: StudioPathfinderPolygon,
    polyB: StudioPathfinderPolygon
  ): StudioPathfinderBooleanResult {
    return StudioPathfinderVectorEngine.booleanOperation(polyA, polyB, "difference");
  }

  /** 실제 배타합(XOR) — 겹치는 면만 뚫어내고 나머지를 남긴다. */
  public static booleanExclusion(
    polyA: StudioPathfinderPolygon,
    polyB: StudioPathfinderPolygon
  ): StudioPathfinderBooleanResult {
    return StudioPathfinderVectorEngine.booleanOperation(polyA, polyB, "exclusion");
  }

  /** 결과 전체의 순면적(외곽 면적 합 − 구멍 면적 합). */
  public static booleanResultArea(result: StudioPathfinderBooleanResult): number {
    let total = 0;
    for (const region of result.regions) {
      total += Math.abs(ringSignedArea(region.outer.points));
      for (const hole of region.holes) {
        total -= Math.abs(ringSignedArea(hole.points));
      }
    }
    return total;
  }
}
