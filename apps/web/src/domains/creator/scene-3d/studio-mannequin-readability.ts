/**
 * Studio 3D 데생 인형 — 가독성 계약: 윤곽선 전 스타일 옵션 + 관절 가동범위 아크.
 *
 * 근거: mannequin 보고서 §3(a)-4 — "inverted hull을 목조/클레이에도 옵션으로 켜고,
 * 선택 관절의 회전축 링·가동범위 아크 표시를 추가하면 '어디까지 꺾이는지'가 보여
 * 과회전이 줄어든다."
 *
 * 이 모듈은 순수 데이터 계약만 담당한다(WebGL/Three 비의존 — 단위 테스트 가능).
 * 실제 렌더링(inverted hull 가시성·아크 라인)은 studio-mannequin-scene.ts가
 * 이 계약을 읽어 수행한다.
 *
 * - 윤곽선: 기존에는 "shaded(셀)" 스타일에서만 inverted hull이 켜졌다. 모드를
 *   auto(기존 동작 유지)/on(전 스타일)/off(전부 끔)로 분리해 사용자가 고른다.
 *   단, landmark·eye 역할은 스타일/모드와 무관하게 윤곽선을 그리지 않는다
 *   (시선 가이드까지 굵은 외곽으로 덮으면 얼굴 가독성이 깨진다 — 기존 규칙 유지).
 * - 가동범위 아크: 관절 리밋 표(getStudioMannequinJointLimit)가 단일 진실 원천.
 *   아크는 가장 넓은 회전축(주축) 하나를 골라 그 축의 [min, max] 구간을
 *   관절 로컬 평면 위 단위 원호 점열로 만든다. 현재 각도 마커와 한계 근접
 *   상태(within/near/at)도 함께 돌려 씬이 색으로 경고할 수 있게 한다.
 */

import {
  getStudioMannequinJointLimit,
  isStudioMannequinJointId,
  type StudioMannequinJointId,
  type StudioMannequinMaterialStyle,
  type StudioMannequinPrimitiveMaterialRole,
  type StudioMannequinVec3,
} from "./studio-mannequin-model";

// ── 윤곽선 모드 ─────────────────────────────────────────────────────────────

export type StudioMannequinOutlineMode = "auto" | "on" | "off";

export const STUDIO_MANNEQUIN_OUTLINE_MODE_DEFAULT: StudioMannequinOutlineMode = "auto";

export const STUDIO_MANNEQUIN_OUTLINE_MODES: readonly {
  id: StudioMannequinOutlineMode;
  label: string;
  desc: string;
}[] = Object.freeze([
  { id: "auto", label: "자동", desc: "셀 셰이딩 스타일에서만 윤곽선을 켭니다(기존 동작)." },
  { id: "on", label: "항상 켜기", desc: "모든 재질 스타일에서 실루엣 윤곽선을 켭니다." },
  { id: "off", label: "끄기", desc: "어떤 스타일에서도 윤곽선을 그리지 않습니다." },
]);

/** 알 수 없는 입력은 기본값(auto)으로 fail-closed 한다. */
export function resolveStudioMannequinOutlineMode(
  value: unknown,
): StudioMannequinOutlineMode {
  return value === "on" || value === "off" || value === "auto"
    ? value
    : STUDIO_MANNEQUIN_OUTLINE_MODE_DEFAULT;
}

/**
 * inverted hull 윤곽선을 그릴지 결정한다.
 * - off: 항상 false. on: 스타일 무관 true. auto: 기존 규칙(shaded만 true).
 * - landmark·eye 역할은 모든 경우 false(기존 규칙).
 */
export function resolveStudioMannequinOutlineVisible(input: {
  readonly mode: unknown;
  readonly style: StudioMannequinMaterialStyle;
  readonly role: StudioMannequinPrimitiveMaterialRole;
}): boolean {
  if (input.role === "landmark" || input.role === "eye") return false;
  const mode = resolveStudioMannequinOutlineMode(input.mode);
  if (mode === "off") return false;
  if (mode === "on") return true;
  return input.style === "shaded";
}

// ── 가동범위 아크 ───────────────────────────────────────────────────────────

export type StudioMannequinRangeArcAxis = "x" | "y" | "z";

const AXES: readonly StudioMannequinRangeArcAxis[] = ["x", "y", "z"];

/** 아크 점 개수(양 끝 포함). 결정적 렌더링을 위해 고정한다. */
export const STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS = 24;

/** 한계까지 남은 구간이 전체의 이 비율 이하면 "근접"으로 경고한다. */
export const STUDIO_MANNEQUIN_RANGE_NEAR_LIMIT_RATIO = 0.1;

export type StudioMannequinRangeLimitState = "within" | "near-limit" | "at-limit";

export interface StudioMannequinJointRangeArc {
  readonly jointId: StudioMannequinJointId;
  /** 가동 구간이 가장 넓은 축(동률이면 x→y→z 순으로 결정). */
  readonly axis: StudioMannequinRangeArcAxis;
  readonly axisIndex: 0 | 1 | 2;
  readonly minRad: number;
  readonly maxRad: number;
  /** 현재 각도(rad, 구간으로 클램프됨). 회전을 넘기지 않으면 null. */
  readonly currentRad: number | null;
  /** 구간 내 현재 위치 비율 0(최소)~1(최대). currentRad가 null이면 null. */
  readonly currentRatio: number | null;
  readonly limitState: StudioMannequinRangeLimitState | null;
  /** 단위 원호 점열(관절 로컬 좌표, 회전축에 수직인 평면 위). */
  readonly points: readonly StudioMannequinVec3[];
  /** 현재 각도 위치의 단위 점(마커용). currentRad가 null이면 null. */
  readonly currentPoint: StudioMannequinVec3 | null;
}

function axisIndexOf(axis: StudioMannequinRangeArcAxis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}

/** 회전축에 수직인 평면 위에서 각도(rad)에 대응하는 단위 점을 만든다. */
export function studioMannequinRangeArcPoint(
  axis: StudioMannequinRangeArcAxis,
  angleRad: number,
): StudioMannequinVec3 {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  // 축 회전이 시작 벡터를 회전시키는 방향과 같은 규약:
  // x축: +Y를 +Z 쪽으로, y축: +Z를 +X 쪽으로, z축: +X를 +Y 쪽으로.
  if (axis === "x") return [0, cos, sin];
  if (axis === "y") return [sin, 0, cos];
  return [cos, sin, 0];
}

/** 관절의 주 회전축(가동 구간이 가장 넓은 축)을 고른다. */
export function resolveStudioMannequinRangeArcAxis(
  jointId: unknown,
): StudioMannequinRangeArcAxis {
  const limit = getStudioMannequinJointLimit(jointId);
  let best: StudioMannequinRangeArcAxis = "x";
  let bestSpan = limit.x[1] - limit.x[0];
  for (const axis of AXES) {
    const span = limit[axis][1] - limit[axis][0];
    if (span > bestSpan) {
      best = axis;
      bestSpan = span;
    }
  }
  return best;
}

function resolveLimitState(
  currentRad: number,
  minRad: number,
  maxRad: number,
): StudioMannequinRangeLimitState {
  const span = maxRad - minRad;
  if (!(span > 0)) return "at-limit";
  const nearest = Math.min(currentRad - minRad, maxRad - currentRad);
  if (nearest <= 0) return "at-limit";
  return nearest / span <= STUDIO_MANNEQUIN_RANGE_NEAR_LIMIT_RATIO
    ? "near-limit"
    : "within";
}

/**
 * 선택 관절의 가동범위 아크 스펙을 만든다. 유효하지 않은 관절이면 null.
 * currentRotation을 넘기면 현재 각도 마커·비율·한계 상태까지 채운다
 * (비유한 축 값은 0으로 취급 — 포즈 정규화와 같은 fail-closed 방향).
 */
export function buildStudioMannequinJointRangeArc(input: {
  readonly jointId: unknown;
  readonly currentRotation?: StudioMannequinVec3 | null;
}): StudioMannequinJointRangeArc | null {
  if (!isStudioMannequinJointId(input.jointId)) return null;
  const jointId = input.jointId;
  const limit = getStudioMannequinJointLimit(jointId);
  const axis = resolveStudioMannequinRangeArcAxis(jointId);
  const axisIndex = axisIndexOf(axis);
  const [minRad, maxRad] = limit[axis];

  const points: StudioMannequinVec3[] = [];
  for (let step = 0; step <= STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS; step += 1) {
    const angle = minRad + ((maxRad - minRad) * step) / STUDIO_MANNEQUIN_RANGE_ARC_SEGMENTS;
    points.push(studioMannequinRangeArcPoint(axis, angle));
  }

  let currentRad: number | null = null;
  let currentRatio: number | null = null;
  let limitState: StudioMannequinRangeLimitState | null = null;
  let currentPoint: StudioMannequinVec3 | null = null;
  if (input.currentRotation) {
    const raw = input.currentRotation[axisIndex];
    const safe = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    currentRad = Math.min(maxRad, Math.max(minRad, safe));
    const span = maxRad - minRad;
    currentRatio = span > 0 ? (currentRad - minRad) / span : 0;
    limitState = resolveLimitState(currentRad, minRad, maxRad);
    currentPoint = studioMannequinRangeArcPoint(axis, currentRad);
  }

  return {
    jointId,
    axis,
    axisIndex,
    minRad,
    maxRad,
    currentRad,
    currentRatio,
    limitState,
    points,
    currentPoint,
  };
}
