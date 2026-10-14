/**
 * Studio Pathfinder Offset — 패널 모델(순수 로직).
 *
 * `StudioPathBooleanPanel` 의 윤곽 오프셋 섹션과 호스트(벡터 편집 표면)가 공유하는
 * 순수 규약: 조인 카탈로그·반경 클램프·적용 가능 판정·six-engine 파사드 실행.
 * React 상태를 갖지 않으므로 단위 테스트와 스모크로 그대로 검증할 수 있다.
 */
import {
  StudioSixEngineFilterService,
} from "./studio-six-engine-filter-service";
import type {
  StudioPathfinderJoinStyle,
  StudioPathfinderPoint,
  StudioPathfinderPolygon,
} from "./studio-pathfinder-vector-engine";

export interface StudioPathfinderOffsetRequest {
  /** 오프셋 거리(px). 양수=바깥으로, 음수=안으로. 0은 적용 불가. */
  readonly radius: number;
  readonly join: StudioPathfinderJoinStyle;
  readonly miterLimit?: number;
}

/** 조인 칩 목록 — STUDIO_PATH_BOOLEAN_OPS 와 동일 관례(id/라벨/설명). */
export const STUDIO_PATHFINDER_JOIN_STYLES: {
  id: StudioPathfinderJoinStyle;
  label: string;
  tip: string;
}[] = [
  { id: "miter", label: "뾰족하게", tip: "코너를 예각으로 연장해 만듭니다. 너무 날카로우면 자동으로 경사로 바뀝니다." },
  { id: "bevel", label: "경사로", tip: "코너를 직선으로 잘라 잇습니다. 날카로운 도형에서 안전합니다." },
  { id: "round", label: "둥글게", tip: "코너를 원호로 잇습니다. 스티커·뱃지 윤곽에 어울립니다." },
];

export function isStudioPathfinderJoinStyle(value: string): value is StudioPathfinderJoinStyle {
  return STUDIO_PATHFINDER_JOIN_STYLES.some((entry) => entry.id === value);
}

/** 패널 슬라이더 범위 — 편집기 도형 규모 기준 ±200px, 0.5 단위. */
export const STUDIO_PATHFINDER_OFFSET_MIN = -200;
export const STUDIO_PATHFINDER_OFFSET_MAX = 200;
export const STUDIO_PATHFINDER_OFFSET_STEP = 0.5;

export function clampStudioPathfinderOffsetRadius(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const stepped = Math.round(value / STUDIO_PATHFINDER_OFFSET_STEP) * STUDIO_PATHFINDER_OFFSET_STEP;
  return Math.min(STUDIO_PATHFINDER_OFFSET_MAX, Math.max(STUDIO_PATHFINDER_OFFSET_MIN, stepped));
}

/**
 * 오프셋 적용 가능 판정 — null 이면 적용 가능.
 * 선택 검사는 호스트의 기존 게이트(도형 선택 상태)가 맡고, 여기서는 요청 자체만 본다.
 */
export function studioPathfinderOffsetUnavailableReason(
  request: StudioPathfinderOffsetRequest,
): string | null {
  if (!Number.isFinite(request.radius) || request.radius === 0) {
    return "오프셋 거리가 0이면 윤곽이 그대로예요. 거리를 정한 뒤 적용해 주세요.";
  }
  if (!isStudioPathfinderJoinStyle(request.join)) {
    return "코너 잇기 방식을 먼저 골라 주세요.";
  }
  return null;
}

/**
 * 파사드 실행 — 열린 경로 점열을 오프셋 윤곽 폴리곤으로.
 * 패널 미리보기와 호스트 적용이 같은 경로를 쓰도록 파사드를 경유한다.
 */
export function runStudioPathfinderOffset(
  points: readonly StudioPathfinderPoint[],
  request: StudioPathfinderOffsetRequest,
): StudioPathfinderPolygon {
  return StudioSixEngineFilterService.offsetVectorPath(points, request.radius, {
    join: request.join,
    ...(request.miterLimit !== undefined ? { miterLimit: request.miterLimit } : {}),
  });
}
