import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";

/**
 * 클릭 이동 경로 표시 모델
 *
 * 클릭한 목적지 마커 + 이동 경로 폴리라인을 계산하는 순수 로직 모듈.
 * 실제 그리기(Phaser Graphics)는 캔버스가 담당하고, 미니맵은 같은 모델을
 * 목적지 마커 표시에 재사용한다.
 */

/** 목적지 마커 펄스 주기 (ms). */
export const STUDIO_MOVE_PATH_MARKER_PULSE_MS = 1200;

/** 폴리라인 최대 점 수 (긴 경로는 간소화해 그린다). */
export const STUDIO_MOVE_PATH_MAX_POINTS = 32;

/** 목적지 도착 판정 거리 (px). */
export const STUDIO_MOVE_PATH_ARRIVAL_DISTANCE = 6;

export interface StudioMovePathDisplay {
  /** 표시 자체가 필요한지. */
  readonly visible: boolean;
  /** 현재 위치 → 웨이포인트 → 목적지 폴리라인 (간소화됨). */
  readonly polyline: readonly StudioVirtualSpacePoint[];
  /** 목적지 마커 (null이면 숨김). */
  readonly marker: { readonly point: StudioVirtualSpacePoint; readonly pulse: number } | null;
  /** 현재 위치에서 목적지까지 남은 거리(px). */
  readonly remainingDistance: number;
}

/** 목적지 마커 펄스 0~1 (사인파). reducedMotion이면 0.5 고정. */
export function movePathMarkerPulse(now: number, startedAt: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0.5;
  const safeNow = Number.isFinite(now) ? now : 0;
  const safeStart = Number.isFinite(startedAt) ? startedAt : 0;
  const elapsed = Math.max(0, safeNow - safeStart);
  return 0.5 + 0.5 * Math.sin((elapsed / STUDIO_MOVE_PATH_MARKER_PULSE_MS) * Math.PI * 2);
}

/** 폴리라인 간소화: 시작·끝점을 유지하고 균등 간격으로 솎아낸다. */
export function simplifyMovePath(
  points: readonly StudioVirtualSpacePoint[],
  maxPoints: number = STUDIO_MOVE_PATH_MAX_POINTS,
): readonly StudioVirtualSpacePoint[] {
  const safeMax = Number.isFinite(maxPoints) && maxPoints >= 2 ? Math.floor(maxPoints) : 2;
  if (points.length <= safeMax) return points;
  const step = (points.length - 1) / (safeMax - 1);
  const simplified: StudioVirtualSpacePoint[] = [];
  for (let i = 0; i < safeMax; i += 1) {
    const point = points[Math.min(points.length - 1, Math.round(i * step))];
    if (point) simplified.push(point);
  }
  return Object.freeze(simplified);
}

/** 폴리라인 전체 길이(px). */
export function movePathLength(points: readonly StudioVirtualSpacePoint[]): number {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1]!;
    const current = points[i]!;
    length += Math.hypot(current.x - prev.x, current.y - prev.y);
  }
  return length;
}

function finitePoint(point: StudioVirtualSpacePoint): StudioVirtualSpacePoint {
  return {
    x: Number.isFinite(point.x) ? point.x : 0,
    y: Number.isFinite(point.y) ? point.y : 0,
  };
}

/**
 * 경로 표시 모델을 만든다.
 * - 목적지가 있고 (이동 중이거나 남은 경로가 있으면) 표시한다.
 * - 도착(목적지 반경 안 + 정지)이면 숨긴다.
 */
export function buildMovePathDisplay(input: {
  readonly current: StudioVirtualSpacePoint;
  readonly path: readonly StudioVirtualSpacePoint[];
  readonly destination: StudioVirtualSpacePoint | null;
  readonly moving: boolean;
  readonly now: number;
  readonly markerStartedAt: number;
  readonly reducedMotion: boolean;
}): StudioMovePathDisplay {
  const current = finitePoint(input.current);
  const destination = input.destination ? finitePoint(input.destination) : null;
  const path = input.path.map(finitePoint);
  if (!destination) {
    return { visible: false, polyline: [], marker: null, remainingDistance: 0 };
  }
  const arrived = Math.hypot(destination.x - current.x, destination.y - current.y) <= STUDIO_MOVE_PATH_ARRIVAL_DISTANCE
    && !input.moving;
  if (arrived) {
    return { visible: false, polyline: [], marker: null, remainingDistance: 0 };
  }
  if (!input.moving && path.length === 0) {
    return { visible: false, polyline: [], marker: null, remainingDistance: 0 };
  }
  const raw = [current, ...path];
  const last = raw[raw.length - 1]!;
  // 경로 끝이 목적지와 다르면 목적지를 이어 붙인다
  if (Math.hypot(last.x - destination.x, last.y - destination.y) > 1) raw.push(destination);
  const polyline = simplifyMovePath(raw);
  return {
    visible: true,
    polyline,
    marker: {
      point: destination,
      pulse: movePathMarkerPulse(input.now, input.markerStartedAt, input.reducedMotion),
    },
    remainingDistance: Math.round(movePathLength(polyline) * 10) / 10,
  };
}

/* ---------------------------------------------------------------------------------------------- */
/* 길 안내 점·클릭 파문·도착 페이드                                                                      */
/* ---------------------------------------------------------------------------------------------- */

/** 경로 위 안내 점 간격(px). */
export const STUDIO_ROUTE_DOT_SPACING = 18;
/** 안내 점이 목적지 쪽으로 흘러가는 속도(px/s). 흐름이 방향을 알려 준다. */
export const STUDIO_ROUTE_DOT_FLOW_SPEED = 42;
/** 한 번에 그리는 안내 점 상한. 긴 경로에서도 프레임당 그리기 호출이 일정하다. */
export const STUDIO_ROUTE_DOT_MAX = 48;
/** 플레이어 발밑에서 점이 서서히 나타나는 거리(px). 캐릭터 몸에 점이 겹쳐 지저분해지지 않는다. */
export const STUDIO_ROUTE_DOT_EMERGE_DISTANCE = 30;
/** 목적지 마커 근처에서 점을 멈추는 거리(px). */
export const STUDIO_ROUTE_DOT_MARKER_CLEARANCE = 15;
/** 클릭을 받았다는 파문이 퍼지는 시간(ms). */
export const STUDIO_ROUTE_RIPPLE_MS = 340;
/** 도착한 목적지 마커가 사라지는 시간(ms). */
export const STUDIO_ROUTE_FADE_MS = 380;

export interface StudioRouteDot {
  readonly x: number;
  readonly y: number;
  /** 0~1. 발밑에서 멀어질수록 1에 가까워진다. */
  readonly alpha: number;
}

/**
 * 폴리라인 위의 안내 점을 `spacing`px 간격으로 뽑는다. 첫 점은 `phase`px 지점에서 시작하므로
 * phase를 시간에 따라 키우면 점들이 목적지 쪽으로 흘러간다. 발밑 근처는 옅게, 마커 직전은 건너뛴다.
 */
export function sampleRouteDots(
  polyline: readonly StudioVirtualSpacePoint[],
  options: { readonly phase?: number; readonly spacing?: number; readonly maxDots?: number } = {},
): readonly StudioRouteDot[] {
  const spacing = Number.isFinite(options.spacing) && (options.spacing ?? 0) > 1 ? (options.spacing as number) : STUDIO_ROUTE_DOT_SPACING;
  const maxDots = Number.isFinite(options.maxDots) && (options.maxDots ?? 0) > 0 ? Math.floor(options.maxDots as number) : STUDIO_ROUTE_DOT_MAX;
  const rawPhase = Number.isFinite(options.phase) ? (options.phase as number) : 0;
  const phase = ((rawPhase % spacing) + spacing) % spacing;
  const total = movePathLength(polyline);
  if (polyline.length < 2 || !(total > STUDIO_ROUTE_DOT_MARKER_CLEARANCE)) return [];
  const dots: StudioRouteDot[] = [];
  let walked = 0;
  let nextAt = phase;
  for (let index = 1; index < polyline.length && dots.length < maxDots; index += 1) {
    const from = polyline[index - 1]!;
    const to = polyline[index]!;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (length <= 0) continue;
    while (nextAt <= walked + length && dots.length < maxDots) {
      const along = nextAt - walked;
      const distance = nextAt;
      if (total - distance >= STUDIO_ROUTE_DOT_MARKER_CLEARANCE) {
        const t = along / length;
        dots.push(Object.freeze({
          x: from.x + (to.x - from.x) * t,
          y: from.y + (to.y - from.y) * t,
          alpha: Math.min(1, Math.max(0, distance / STUDIO_ROUTE_DOT_EMERGE_DISTANCE)),
        }));
      }
      nextAt += spacing;
    }
    walked += length;
  }
  return Object.freeze(dots);
}

/** 안내 점의 흐름 위상(px). reducedMotion이면 흐르지 않고 제자리에 둔다. */
export function movePathDotPhase(wallNow: number, reducedMotion: boolean): number {
  if (reducedMotion || !Number.isFinite(wallNow)) return 0;
  return (wallNow / 1000) * STUDIO_ROUTE_DOT_FLOW_SPEED;
}

/**
 * 클릭 파문 진행도. 클릭 직후 0에서 시작해 `STUDIO_ROUTE_RIPPLE_MS`에 1이 된다.
 * 진행 중이 아니면(이미 끝났거나 모션 줄이기) null이라 호출 측은 아무것도 그리지 않는다.
 */
export function movePathRippleProgress(wallNow: number, startedAt: number, reducedMotion: boolean): number | null {
  if (reducedMotion || !Number.isFinite(wallNow) || !Number.isFinite(startedAt)) return null;
  const age = wallNow - startedAt;
  if (age < 0 || age >= STUDIO_ROUTE_RIPPLE_MS) return null;
  return age / STUDIO_ROUTE_RIPPLE_MS;
}

/**
 * 도착 후 마커 페이드 진행도(0 시작 → 1 끝). 끝났거나 모션 줄이기면 null이라 즉시 사라진다.
 */
export function movePathFadeProgress(wallNow: number, fadeStartedAt: number | null, reducedMotion: boolean): number | null {
  if (reducedMotion || fadeStartedAt === null || !Number.isFinite(wallNow) || !Number.isFinite(fadeStartedAt)) return null;
  const age = wallNow - fadeStartedAt;
  if (age < 0 || age >= STUDIO_ROUTE_FADE_MS) return null;
  return age / STUDIO_ROUTE_FADE_MS;
}
