/**
 * 뷰포트 궤도 카메라 조작(순수): 프레이밍 대상 크기 기반 거리·팬 한계, 휠 줌 배율, 화면 고정 팬, 키보드 오비트.
 *
 * 결함 F-01(2026-10-23 실측, M2 Max·Chrome 156): Babylon 기본 휠(`wheelPrecision` 3 + 관성 0.9)은 한 칸(deltaY 100)에 반경이 수 m 바뀌어
 * 얼굴 프레이밍에서 입 속(고정 하한 0.15 m가 머리 안)까지 들어가거나 점이 됐고, 우클릭 팬은 관성 누적으로 300 px 드래그에 캐릭터가 화면 밖으로 나갔다.
 * 여기서는 한 칸 = 반경 ×(1 ± 12 %)로 고정하고(관성 없음, 트랙패드의 작은 델타는 비례), 하한·상한을 대상 크기에서 정하며,
 * 팬은 "끈 만큼 화면이 따라온다"(타깃 깊이에서 1 px = 1 px)로 계산하고 타깃을 캐릭터 경계 상자(조금 넓힌) 안으로 묶는다 —
 * 화면 중심이 늘 캐릭터 위에 있으므로 어느 거리·각도에서도 캐릭터가 화면 밖으로 나가지 않는다.
 */
import { clamp, degToRad } from "../shared/math";

import { DEFAULT_VERTICAL_FOV, FALLBACK_BOUNDS, resolveFraming } from "./camera-framing";

import type { WorldBounds } from "./camera-framing";
import type { CameraFraming, Vec3 } from "../contracts";

export interface OrbitLimits {
  /** 카메라–타깃 최소 거리(m). 프레이밍 대상(얼굴이면 머리) 안으로 들어가지 않는다. */
  readonly lowerRadius: number;
  /** 최대 거리(m). 전신 프레이밍 거리의 2.5배(캐릭터가 점이 되지 않는다). */
  readonly upperRadius: number;
  /** 팬으로 타깃을 옮길 수 있는 범위: 캐릭터 경계 상자를 키의 `ORBIT_PAN_MARGIN_RATIO`만큼 넓힌 것(화면 중심이 캐릭터를 벗어나지 않는다). */
  readonly panBounds: WorldBounds;
}

/**
 * 하한: 키 대비 비율. 키 1.65 m면 머리 중심에서 0.25 m(코끝에서 약 0.15 m) — 가장 가까이 당겨도 눈~턱이 화면을 채우는 얼굴 클로즈업이다
 * (브라우저 확인 2026-10-23: 0.11이면 입술만 보이는 거리까지 들어갔다).
 */
export const ORBIT_LOWER_HEIGHT_RATIO = 0.15;
/** 하한: 프레이밍 거리 대비 비율(전신에서 몸통 안으로 파고들지 않게) */
export const ORBIT_LOWER_FRAMING_RATIO = 0.25;
/** 상한: 전신 프레이밍 거리 대비 배수 */
export const ORBIT_UPPER_FULL_BODY_RATIO = 2.5;
/** 팬 범위 여유: 키 대비 비율(경계 상자 밖으로 이만큼까지) */
export const ORBIT_PAN_MARGIN_RATIO = 0.05;

/**
 * 프레이밍·캐릭터 bbox에서 궤도 한계를 정한다. 프레이밍이 정한 반경은 항상 [하한, 상한] 안에 있다(캡처 카메라도 같은 한계를 써도 결과가 바뀌지 않는다).
 */
export function resolveOrbitLimits(framing: CameraFraming, bounds: WorldBounds = FALLBACK_BOUNDS, fov = DEFAULT_VERTICAL_FOV, aspect = 1): OrbitLimits {
  const height = Math.max(1e-3, bounds.max[1] - bounds.min[1]);
  const framed = resolveFraming(framing, bounds, fov, aspect).radius;
  const fullBody = resolveFraming({ ...framing, mode: "full-body", distanceScale: 1 }, bounds, fov, aspect).radius;
  const lowerRadius = Math.min(framed, Math.max(height * ORBIT_LOWER_HEIGHT_RATIO, framed * ORBIT_LOWER_FRAMING_RATIO));
  const upperRadius = Math.max(framed, fullBody * ORBIT_UPPER_FULL_BODY_RATIO);
  const margin = height * ORBIT_PAN_MARGIN_RATIO;
  const panBounds: WorldBounds = {
    min: [bounds.min[0] - margin, bounds.min[1] - margin, bounds.min[2] - margin],
    max: [bounds.max[0] + margin, bounds.max[1] + margin, bounds.max[2] + margin],
  };
  return { lowerRadius, upperRadius, panBounds };
}

/** 휠 한 칸(deltaY 100 px)의 줌 비율: 반경 ×1.12(밖) 또는 ÷1.12(안) */
export const WHEEL_ZOOM_PER_NOTCH = 0.12;
/** 한 이벤트가 움직일 수 있는 최대 칸 수(관성 스크롤 폭주·deltaMode 페이지 방어) */
export const WHEEL_MAX_NOTCHES_PER_EVENT = 3;
const PIXELS_PER_NOTCH = 100;
/** WheelEvent.deltaMode: 0 픽셀, 1 줄(Firefox 마우스 휠, 한 칸 ≈ 3줄), 2 페이지 */
const LINE_PIXELS = PIXELS_PER_NOTCH / 3;
const PAGE_PIXELS = PIXELS_PER_NOTCH * WHEEL_MAX_NOTCHES_PER_EVENT;

/** 휠 이벤트 한 번 뒤 반경. deltaY > 0(아래로 굴림)이면 멀어진다. 결과는 [하한, 상한]으로 묶는다. */
export function wheelZoomRadius(radius: number, deltaY: number, deltaMode: number, limits: Pick<OrbitLimits, "lowerRadius" | "upperRadius">): number {
  if (!Number.isFinite(radius) || radius <= 0) return limits.lowerRadius;
  const pixels = deltaMode === 1 ? deltaY * LINE_PIXELS : deltaMode === 2 ? deltaY * PAGE_PIXELS : deltaY;
  const notches = clamp(Number.isFinite(pixels) ? pixels / PIXELS_PER_NOTCH : 0, -WHEEL_MAX_NOTCHES_PER_EVENT, WHEEL_MAX_NOTCHES_PER_EVENT);
  const next = radius * Math.pow(1 + WHEEL_ZOOM_PER_NOTCH, notches);
  return clamp(next, limits.lowerRadius, limits.upperRadius);
}

/**
 * 화면 고정 팬: 포인터가 (dx, dy) px 움직이면 타깃 깊이의 점이 같은 px만큼 따라오도록 타깃을 옮길 거리(월드 m)를 돌려준다.
 * right·up은 카메라의 화면 오른쪽·위 방향 성분이다(끌면 장면이 손을 따라오므로 타깃은 반대로 움직인다).
 */
export function screenPanOffset(dxPx: number, dyPx: number, radius: number, fovY: number, viewportHeightPx: number): { readonly right: number; readonly up: number } {
  if (!(viewportHeightPx > 0) || !(radius > 0)) return { right: 0, up: 0 };
  const metersPerPixel = (2 * radius * Math.tan(fovY / 2)) / viewportHeightPx;
  return { right: -dxPx * metersPerPixel, up: dyPx * metersPerPixel };
}

/** 타깃을 팬 범위(경계 상자) 안으로 묶는다(축마다 자른다). */
export function clampPanTarget(target: Vec3, bounds: WorldBounds): Vec3 {
  return [clamp(target[0], bounds.min[0], bounds.max[0]), clamp(target[1], bounds.min[1], bounds.max[1]), clamp(target[2], bounds.min[2], bounds.max[2])];
}

/** 키보드 오비트 한 단계(방향키 1회): 5° */
export const KEYBOARD_ORBIT_STEP_RAD = degToRad(5);

export type KeyboardOrbitAction =
  | { readonly kind: "orbit"; readonly alpha: number; readonly beta: number }
  | { readonly kind: "zoom"; readonly notches: number }
  | { readonly kind: "reset" };

/**
 * 캔버스에 포커스가 있을 때의 키 매핑(H-03): ←/→ 좌우 회전, ↑/↓ 위아래 회전, +/= 확대, -/_ 축소, 0·Home 시점 초기화.
 * 방향은 Babylon 기본 키보드 입력과 같다(← alpha 감소, ↑ beta 감소). 수정 키(Ctrl·Meta·Alt)가 눌린 조합은 브라우저·OS 단축키에 양보한다(null).
 * Shift는 3배 단계.
 */
export function keyboardOrbitAction(key: string, modifiers: { readonly ctrl?: boolean; readonly meta?: boolean; readonly alt?: boolean; readonly shift?: boolean } = {}): KeyboardOrbitAction | null {
  if (modifiers.ctrl || modifiers.meta || modifiers.alt) return null;
  const step = KEYBOARD_ORBIT_STEP_RAD * (modifiers.shift ? 3 : 1);
  switch (key) {
    case "ArrowLeft":
      return { kind: "orbit", alpha: -step, beta: 0 };
    case "ArrowRight":
      return { kind: "orbit", alpha: step, beta: 0 };
    case "ArrowUp":
      return { kind: "orbit", alpha: 0, beta: -step };
    case "ArrowDown":
      return { kind: "orbit", alpha: 0, beta: step };
    case "+":
    case "=":
      return { kind: "zoom", notches: -1 };
    case "-":
    case "_":
      return { kind: "zoom", notches: 1 };
    case "0":
    case "Home":
      return { kind: "reset" };
    default:
      return null;
  }
}
