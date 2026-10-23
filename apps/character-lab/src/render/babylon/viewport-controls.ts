/**
 * 뷰포트 카메라 입력(브라우저, F-01·H-03). Babylon ArcRotateCamera의 좌클릭 드래그 회전과 두 손가락 핀치 줌(자연 핀치)은 그대로 쓰고,
 * 휠 줌·팬·키보드·더블클릭은 `render/viewport-orbit.ts` 규칙으로 직접 처리한다(관성 없음, 대상 크기 기반 한계).
 *  - 휠: 한 칸 = 반경 ±12 %, 카메라 `lowerRadiusLimit`~`upperRadiusLimit`(프레이밍마다 scene-builder가 대상 크기로 정한다).
 *  - 팬: 우클릭·Ctrl+좌클릭 드래그, 두 손가락 터치 드래그. 화면 고정(끈 만큼 따라옴), 타깃은 캐릭터 경계 상자(프레이밍 때 `setPanBounds`) 안.
 *    Babylon 기본 팬(관성 0.9 누적 — 300 px에 캐릭터가 화면 밖으로)은 `panningSensibility = 0`으로 끈다.
 *  - 키보드(캔버스 포커스): 방향키 회전, +/- 줌, 0·Home 시점 초기화. Babylon 기본 키보드 입력은 떼어 두 번 처리되지 않게 한다.
 *  - 더블클릭: 시점 초기화(현재 프레이밍을 다시 적용).
 * 장면이 해제되면 리스너도 해제한다.
 */
import { v3Cross, v3Length, v3Normalize } from "../../shared/math";
import { clampPanTarget, keyboardOrbitAction, screenPanOffset, wheelZoomRadius } from "../viewport-orbit";

import { fromVector3, toVector3 } from "./convert";

import type { Vec3 } from "../../contracts";
import type { WorldBounds } from "../camera-framing";
import type { OrbitLimits } from "../viewport-orbit";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";

/** 카메라별 팬 범위(프레이밍이 정한다). 없으면 팬을 묶지 않는다. */
const panBoundsByCamera = new WeakMap<ArcRotateCamera, WorldBounds>();

/** 카메라의 팬 범위를 정한다(scene-builder `applyFraming`이 캐릭터 경계 상자로 부른다). */
export function setPanBounds(camera: ArcRotateCamera, bounds: WorldBounds): void {
  panBoundsByCamera.set(camera, bounds);
}

/** 카메라에 걸린 현재 거리 한계(프레이밍 전이면 넉넉한 기본값) */
function radiusLimits(camera: ArcRotateCamera): Pick<OrbitLimits, "lowerRadius" | "upperRadius"> {
  const lower = camera.lowerRadiusLimit ?? camera.minZ * 2;
  const upper = camera.upperRadiusLimit ?? camera.maxZ * 0.5;
  return { lowerRadius: Math.max(1e-3, lower), upperRadius: Math.max(lower, upper) };
}

/** 카메라 화면 오른쪽·위 단위 벡터(월드). 엔진 `viewportCamera()`와 같은 기저(우수 좌표, world up = +Y). */
function screenAxes(camera: ArcRotateCamera): { readonly right: Vec3; readonly up: Vec3 } {
  const sinBeta = Math.sin(camera.beta);
  const forward = v3Normalize([-Math.cos(camera.alpha) * sinBeta, -Math.cos(camera.beta), -Math.sin(camera.alpha) * sinBeta]);
  const crossUp = v3Cross(forward, [0, 1, 0]);
  const right: Vec3 = v3Length(crossUp) < 1e-6 ? [1, 0, 0] : v3Normalize(crossUp);
  return { right, up: v3Cross(right, forward) };
}

/** 타깃을 화면 고정 팬만큼 옮긴다(카메라는 같은 구면 좌표로 따라간다). 타깃은 팬 범위(캐릭터 경계 상자) 밖으로 나가지 않는다. */
export function panCameraByPixels(camera: ArcRotateCamera, dxPx: number, dyPx: number, viewportHeightPx: number): void {
  const offset = screenPanOffset(dxPx, dyPx, camera.radius, camera.fov, viewportHeightPx);
  if (offset.right === 0 && offset.up === 0) return;
  const { right, up } = screenAxes(camera);
  const target = fromVector3(camera.target);
  const moved: Vec3 = [target[0] + right[0] * offset.right + up[0] * offset.up, target[1] + right[1] * offset.right + up[1] * offset.up, target[2] + right[2] * offset.right + up[2] * offset.up];
  const bounds = panBoundsByCamera.get(camera);
  const clamped = bounds ? clampPanTarget(moved, bounds) : moved;
  // 타깃 벡터를 제자리에서 바꾼다(setTarget은 카메라 위치를 고정하고 각도를 다시 계산하므로 팬이 아니라 회전이 된다).
  camera.target.copyFrom(toVector3(clamped));
}

/** 휠 한 번(deltaY·deltaMode)만큼 거리를 바꾼다. */
export function zoomCameraByWheel(camera: ArcRotateCamera, deltaY: number, deltaMode: number): void {
  camera.radius = wheelZoomRadius(camera.radius, deltaY, deltaMode, radiusLimits(camera));
}

interface ActivePointer {
  x: number;
  y: number;
  readonly touch: boolean;
}

/**
 * 캔버스에 카메라 입력을 붙인다. 반환 함수로 해제한다. `resetView`는 현재 프레이밍을 다시 적용한다(엔진 `setCamera(현재 프레이밍)`).
 */
export function attachViewportControls(camera: ArcRotateCamera, canvas: HTMLCanvasElement, resetView: () => void): () => void {
  camera.attachControl(canvas, true);
  camera.inputs.removeByType("ArcRotateCameraMouseWheelInput");
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");
  camera.panningSensibility = 0;
  camera.useNaturalPinchZoom = true;

  const pointers = new Map<number, ActivePointer>();
  /** 마우스 팬 중인 포인터(우클릭·Ctrl+좌클릭) */
  let mousePan: number | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    const touch = event.pointerType === "touch";
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, touch });
    if (!touch && (event.button === 2 || (event.button === 0 && event.ctrlKey))) {
      mousePan = event.pointerId;
      if (typeof canvas.setPointerCapture === "function") canvas.setPointerCapture(event.pointerId);
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    const active = pointers.get(event.pointerId);
    if (!active) return;
    const dx = event.clientX - active.x;
    const dy = event.clientY - active.y;
    active.x = event.clientX;
    active.y = event.clientY;
    const height = canvas.clientHeight;
    if (mousePan === event.pointerId) {
      panCameraByPixels(camera, dx, dy, height);
      return;
    }
    // 두 손가락 터치: 무게중심 이동량(= 움직인 손가락 이동의 절반)만큼 팬한다. 거리 변화(핀치 줌)는 Babylon이 처리한다.
    const touches = [...pointers.values()].filter((pointer) => pointer.touch);
    if (active.touch && touches.length === 2) panCameraByPixels(camera, dx / 2, dy / 2, height);
  };
  const onPointerEnd = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    if (mousePan === event.pointerId) {
      mousePan = null;
      if (typeof canvas.hasPointerCapture === "function" && canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    }
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    zoomCameraByWheel(camera, event.deltaY, event.deltaMode);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const action = keyboardOrbitAction(event.key, { ctrl: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey });
    if (!action) return;
    event.preventDefault();
    if (action.kind === "reset") {
      resetView();
      return;
    }
    if (action.kind === "zoom") {
      zoomCameraByWheel(camera, action.notches * 100, 0);
      return;
    }
    camera.alpha += action.alpha;
    const lowerBeta = camera.lowerBetaLimit ?? 0.01;
    const upperBeta = camera.upperBetaLimit ?? Math.PI - 0.01;
    camera.beta = Math.min(upperBeta, Math.max(lowerBeta, camera.beta + action.beta));
  };
  const onContextMenu = (event: Event): void => event.preventDefault();
  const onDoubleClick = (): void => resetView();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerEnd);
  canvas.addEventListener("pointercancel", onPointerEnd);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("keydown", onKeyDown);
  canvas.addEventListener("contextmenu", onContextMenu);
  canvas.addEventListener("dblclick", onDoubleClick);

  let attached = true;
  const detach = (): void => {
    if (!attached) return;
    attached = false;
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerEnd);
    canvas.removeEventListener("pointercancel", onPointerEnd);
    canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("keydown", onKeyDown);
    canvas.removeEventListener("contextmenu", onContextMenu);
    canvas.removeEventListener("dblclick", onDoubleClick);
    pointers.clear();
  };
  camera.getScene().onDisposeObservable.addOnce(detach);
  return detach;
}

