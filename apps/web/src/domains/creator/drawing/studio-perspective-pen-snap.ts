/**
 * studio-perspective-pen-snap.ts — 원근 가이드 펜 입력 스냅 (본 배선)
 *
 * StudioRulersPanel 이 내보내는 원근 가이드 상태(켜짐/스냅/가이드)를
 * 실제 펜 입력 파이프라인에 꽂는 순수 어댑터. 호스트(캔버스 입력 처리부)는
 * 스트로크마다 세션을 하나 열고, 샘플마다 snapPerspectivePenPoint 를 부른다.
 *
 * 파이프라인 순서 (studio-rulers.ts 머리말과 동일):
 *   원시 포인터 → StrokeStabilizer.push() → 이 모듈의 스냅 → 대칭 복제
 * 스태빌라이저보다 먼저 스냅하면 가이드에 붙은 선이 다시 흔들리고,
 * 대칭 복제보다 뒤에 스냅하면 짝 선이 가이드에서 어긋난다.
 *
 * 동작:
 * - 가이드가 꺼져 있거나(enabled=false) 스냅이 꺼져 있거나 가이드가
 *   없으면 세션 자체가 null 이고, 배치 헬퍼는 입력 배열을 그대로(동일
 *   참조) 돌려준다 — 끄면 기존 동작과 완전히 동일하다.
 * - 세션이 열리면 첫 이동(기본 4px 이상)에서 스트로크 시작점 기준
 *   방향이 가장 가까운 소실점을 골라 그 소실점을 확정하고, 이후 샘플은
 *   "시작점–소실점 직선" 위로 투영한다. creator 원근자
 *   (resolvePerspectiveRay)와 studio-rulers 퍼스펙티브 자
 *   (snapStudioPerspectivePoint)가 이미 쓰는 확정 방식과 같다.
 * - 확정 전 샘플과, 시작점과 겹치는 소실점뿐인 경우는 스냅하지 않는다.
 */

import {
  perspectiveVanishingPoints,
  projectPointToLine,
  type GuideLine,
  type GuidePoint,
  type PerspectiveGuide,
} from "./studio-perspective-guide";

export interface PerspectivePenSnapConfig {
  /** 원근 가이드 토글. false면 스냅 없음. */
  readonly enabled: boolean;
  /** 가이드 표시와 별개인 그리기 스냅 토글. 기본 true. */
  readonly snapEnabled?: boolean;
  readonly guide: PerspectiveGuide | null;
  /** 방향 확정 전 최소 이동(px, 캔버스 좌표). 기본 4. */
  readonly minLockDistancePx?: number;
}

export interface PerspectivePenSnapSession {
  readonly start: GuidePoint;
  readonly vanishingPoints: readonly GuidePoint[];
  readonly minLockDistancePx: number;
  /** 확정된 소실점. null이면 아직 방향 미확정. */
  readonly lockedVanishingPoint: GuidePoint | null;
  /** 확정된 소실점의 패밀리(left/right/vertical). 미확정이면 null. */
  readonly lockedFamily: GuideLine["family"] | null;
}

export interface PerspectivePenSnapResult {
  /** 다음 샘플에 넘길 세션. 비활성 세션(null)을 넣었으면 null 그대로. */
  readonly session: PerspectivePenSnapSession | null;
  readonly point: GuidePoint;
  readonly snapped: boolean;
  readonly family: GuideLine["family"] | null;
}

const FAMILIES: readonly GuideLine["family"][] = [
  "left",
  "right",
  "vertical",
] as const;

/** 가이드가 스냅 가능한 상태인지(켜짐 + 스냅 켜짐 + 소실점 1개 이상). */
export function isPerspectivePenSnapActive(
  config: PerspectivePenSnapConfig,
): boolean {
  if (!config.enabled || config.snapEnabled === false) return false;
  if (!config.guide) return false;
  return perspectiveVanishingPoints(config.guide).length > 0;
}

/**
 * 스트로크 시작점에서 세션을 연다. 스냅이 비활성이면 null —
 * 호출부는 null 세션을 그대로 들고 다니며 snapPerspectivePenPoint 에
 * 넘기면 입력이 그대로 돌아온다(분기 없이 항상 호출 가능).
 */
export function createPerspectivePenSnapSession(
  config: PerspectivePenSnapConfig,
  start: GuidePoint,
): PerspectivePenSnapSession | null {
  if (!isPerspectivePenSnapActive(config) || !config.guide) return null;
  if (!Number.isFinite(start.x) || !Number.isFinite(start.y)) return null;
  return {
    start,
    vanishingPoints: perspectiveVanishingPoints(config.guide),
    minLockDistancePx:
      config.minLockDistancePx !== undefined &&
      Number.isFinite(config.minLockDistancePx) &&
      config.minLockDistancePx > 0
        ? config.minLockDistancePx
        : 4,
    lockedVanishingPoint: null,
    lockedFamily: null,
  };
}

function wrapPi(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a <= -Math.PI) a += 2 * Math.PI;
  return a;
}

function projectOntoVpLine(
  session: PerspectivePenSnapSession,
  vp: GuidePoint,
  family: GuideLine["family"],
  sample: GuidePoint,
): PerspectivePenSnapResult {
  const locked: PerspectivePenSnapSession = {
    ...session,
    lockedVanishingPoint: vp,
    lockedFamily: family,
  };
  const { projected } = projectPointToLine(sample, {
    from: session.start,
    to: vp,
    family,
  });
  return { session: locked, point: projected, snapped: true, family };
}

/**
 * 샘플 1개를 스냅한다. session이 null이면 입력을 그대로 돌려준다.
 * 확정 전에는 이동 방향과 가장 잘 맞는 소실점을 고른다(직선은 양방향이라
 * 각도 차는 π 기준으로 접는다 — creator 원근자·자 스냅과 같은 판정).
 */
export function snapPerspectivePenPoint(
  session: PerspectivePenSnapSession | null,
  sample: GuidePoint,
): PerspectivePenSnapResult {
  const identity: PerspectivePenSnapResult = {
    session,
    point: sample,
    snapped: false,
    family: session?.lockedFamily ?? null,
  };
  if (!session) return identity;
  if (!Number.isFinite(sample.x) || !Number.isFinite(sample.y)) return identity;

  if (session.lockedVanishingPoint && session.lockedFamily) {
    return projectOntoVpLine(
      session,
      session.lockedVanishingPoint,
      session.lockedFamily,
      sample,
    );
  }

  const moved = Math.hypot(
    sample.x - session.start.x,
    sample.y - session.start.y,
  );
  if (moved < session.minLockDistancePx) return identity;

  const moveAngle = Math.atan2(
    sample.y - session.start.y,
    sample.x - session.start.x,
  );
  let bestIndex = -1;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let i = 0; i < session.vanishingPoints.length; i += 1) {
    const vp = session.vanishingPoints[i];
    // 시작점과 겹치는 소실점은 방향이 정의되지 않는다.
    if (Math.hypot(vp.x - session.start.x, vp.y - session.start.y) < 1e-9) {
      continue;
    }
    const rayAngle = Math.atan2(
      session.start.y - vp.y,
      session.start.x - vp.x,
    );
    // 직선은 양방향: 반대 방향(π 차이)도 같은 직선으로 본다.
    const diff = Math.abs(wrapPi(rayAngle - moveAngle));
    const score = Math.min(diff, Math.PI - diff);
    if (score < bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return identity;
  return projectOntoVpLine(
    session,
    session.vanishingPoints[bestIndex],
    FAMILIES[bestIndex] ?? "left",
    sample,
  );
}

/**
 * 완성된 스트로크 점 배열에 한 번에 적용하는 배치 헬퍼.
 * 비활성이면 입력 배열을 동일 참조로 돌려준다(기존 동작과 동일 보장).
 * 첫 점이 스트로크 시작점이다.
 */
export function snapStrokePointsToPerspectiveGuide(
  points: readonly GuidePoint[],
  config: PerspectivePenSnapConfig,
): readonly GuidePoint[] {
  if (points.length === 0) return points;
  const session = createPerspectivePenSnapSession(config, points[0]);
  if (!session) return points;
  let current: PerspectivePenSnapSession | null = session;
  return points.map((point) => {
    const result = snapPerspectivePenPoint(current, point);
    current = result.session;
    return result.point;
  });
}
