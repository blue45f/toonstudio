/**
 * Studio 3D 데생 인형 v5 — 4분할 사면도(All-Sides Quad View) 렌더링·사분면 포인터 픽킹 & 만화 원근(Lens FOV) 헬퍼.
 *
 * 단일 WebGL 캔버스 위에서 상시 루프 없이 온디맨드(invalidate)로 4개 뷰포트(주 투시 · 정면 · 측면 · 탑뷰)를
 * 동시에 그리며, 4분할 활성 상태에서도 사용자가 어느 사분면을 클릭·드래그하든 해당 사분면의 정확한 카메라와
 * 로컬 NDC로 광선을 쏴 관절 회전·IK 드래그를 조작할 수 있게 한다.
 */

import * as THREE from "three";

import { fitStudioMannequinCameraToBounds } from "./studio-mannequin-camera-framing";
import type { StudioMannequinVec3 } from "./studio-mannequin-model";

export const STUDIO_MANNEQUIN_FOV_MIN_DEG = 15;
export const STUDIO_MANNEQUIN_FOV_MAX_DEG = 85;
export const STUDIO_MANNEQUIN_FOV_DEFAULT_DEG = 35;

export interface StudioMannequinLensPreset {
  readonly id: "telephoto" | "standard" | "wideAction" | "mangaExtreme";
  readonly label: string;
  readonly fovDeg: number;
  readonly desc: string;
}

export const STUDIO_MANNEQUIN_LENS_PRESETS: readonly StudioMannequinLensPreset[] = Object.freeze([
  { id: "telephoto", label: "망원 18°", fovDeg: 18, desc: "왜곡 없는 프로필·스탠딩 일러스트용 망원 압축" },
  { id: "standard", label: "표준 35°", fovDeg: 35, desc: "자연스러운 인체 비례의 기본 데생 화각" },
  { id: "wideAction", label: "광각 58°", fovDeg: 58, desc: "역동적인 원근감과 공간감을 살리는 액션 컷 화각" },
  { id: "mangaExtreme", label: "초광각 78°", fovDeg: 78, desc: "주먹·발차기 단축 과장(만화 퍼스펙티브) 연출용" },
]);

export function clampStudioMannequinFovDeg(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return STUDIO_MANNEQUIN_FOV_DEFAULT_DEG;
  }
  return Math.min(STUDIO_MANNEQUIN_FOV_MAX_DEG, Math.max(STUDIO_MANNEQUIN_FOV_MIN_DEG, value));
}

export type StudioMannequinQuadSlot = "main" | "front" | "side" | "top";

export interface StudioMannequinQuadViewportRect {
  readonly slot: StudioMannequinQuadSlot;
  readonly labelKo: string;
  /** WebGL 좌하단 원점 기준 X(px). */
  readonly x: number;
  /** WebGL 좌하단 원점 기준 Y(px). */
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 논리 뷰포트 크기(`width`, `height`)를 2×2 4분할 사면도 영역(WebGL 좌하단 원점 기준)으로 분할한다.
 * 좌상단=주 카메라(투시/직교), 우상단=정면 직교, 좌하단=측면 직교, 우하단=탑뷰 직교.
 */
export function computeStudioMannequinQuadViewRects(
  width: number,
  height: number,
): readonly [
  StudioMannequinQuadViewportRect,
  StudioMannequinQuadViewportRect,
  StudioMannequinQuadViewportRect,
  StudioMannequinQuadViewportRect,
] {
  const safeW = Math.max(2, Math.floor(width));
  const safeH = Math.max(2, Math.floor(height));
  const leftW = Math.floor(safeW / 2);
  const rightW = safeW - leftW;
  const bottomH = Math.floor(safeH / 2);
  const topH = safeH - bottomH;

  return [
    { slot: "main", labelKo: "주 뷰(투시)", x: 0, y: bottomH, width: leftW, height: topH },
    { slot: "front", labelKo: "정면(직교)", x: leftW, y: bottomH, width: rightW, height: topH },
    { slot: "side", labelKo: "측면(직교)", x: 0, y: 0, width: leftW, height: bottomH },
    { slot: "top", labelKo: "탑뷰(직교)", x: leftW, y: 0, width: rightW, height: bottomH },
  ];
}

export interface StudioMannequinQuadPointerHit {
  readonly slot: StudioMannequinQuadSlot;
  readonly ndcX: number;
  readonly ndcY: number;
  readonly paneWidth: number;
  readonly paneHeight: number;
}

export interface StudioMannequinQuadPointerInput {
  readonly clientX: number;
  readonly clientY: number;
  readonly rectLeft: number;
  readonly rectTop: number;
  readonly rectWidth: number;
  readonly rectHeight: number;
}

/**
 * CSS 클라이언트 좌표(`{ clientX, clientY, rectLeft, rectTop, rectWidth, rectHeight }`) 또는
 * 캔버스 로컬 좌표(`localX, localY, rectWidth, rectHeight`)로부터
 * 4분할 사면도 중 어느 사분면을 가리키는지와 해당 사분면 내부의 정규화 장치 좌표(`[-1, 1]`)를 순수 계산한다.
 */
export function resolveStudioMannequinQuadPointerNdc(
  input: StudioMannequinQuadPointerInput,
): StudioMannequinQuadPointerHit;
export function resolveStudioMannequinQuadPointerNdc(
  localX: number,
  localY: number,
  rectWidth: number,
  rectHeight: number,
): StudioMannequinQuadPointerHit;
export function resolveStudioMannequinQuadPointerNdc(
  inputOrLocalX: StudioMannequinQuadPointerInput | number,
  localYArg?: number,
  rectWidthArg?: number,
  rectHeightArg?: number,
): StudioMannequinQuadPointerHit {
  const normalized: StudioMannequinQuadPointerInput =
    typeof inputOrLocalX === "number"
      ? {
          clientX: inputOrLocalX,
          clientY: localYArg ?? 0,
          rectLeft: 0,
          rectTop: 0,
          rectWidth: rectWidthArg ?? 2,
          rectHeight: rectHeightArg ?? 2,
        }
      : inputOrLocalX;

  const safeW = Math.max(2, Number.isFinite(normalized.rectWidth) ? normalized.rectWidth : 2);
  const safeH = Math.max(2, Number.isFinite(normalized.rectHeight) ? normalized.rectHeight : 2);
  const rawX = (normalized.clientX ?? 0) - (normalized.rectLeft ?? 0);
  const rawY = (normalized.clientY ?? 0) - (normalized.rectTop ?? 0);
  const localX = Math.min(safeW, Math.max(0, Number.isFinite(rawX) ? rawX : 0));
  // CSS Y는 상단=0, WebGL Y는 하단=0 이므로 반전해 사분면 rect와 대조한다.
  const glY = Math.min(safeH, Math.max(0, safeH - (Number.isFinite(rawY) ? rawY : 0)));
  const rects = computeStudioMannequinQuadViewRects(safeW, safeH);

  const matched =
    rects.find(
      (r) =>
        localX >= r.x &&
        localX <= r.x + r.width &&
        glY >= r.y &&
        glY <= r.y + r.height,
    ) ?? rects[0];

  const paneW = Math.max(1, matched.width);
  const paneH = Math.max(1, matched.height);
  const ndcX = ((localX - matched.x) / paneW) * 2 - 1;
  const ndcY = ((glY - matched.y) / paneH) * 2 - 1;

  return {
    slot: matched.slot,
    ndcX: Math.min(1, Math.max(-1, ndcX)),
    ndcY: Math.min(1, Math.max(-1, ndcY)),
    paneWidth: paneW,
    paneHeight: paneH,
  };
}

export interface StudioMannequinQuadOrthoRig {
  renderQuadView(input: {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene: THREE.Scene;
    readonly mainCamera: THREE.Camera;
    readonly bounds: THREE.Box3;
    readonly viewWidth: number;
    readonly viewHeight: number;
  }): void;
  cameraForSlot(
    slot: StudioMannequinQuadSlot,
    mainCamera: THREE.Camera,
    bounds: THREE.Box3,
    paneWidth: number,
    paneHeight: number,
  ): THREE.Camera;
}

const ORTHO_DIRECTIONS: Readonly<Record<"front" | "side" | "top", StudioMannequinVec3>> = Object.freeze({
  front: [0, 0.06, 1],
  side: [1, 0.06, 0],
  top: [0, 1, 0.02],
});

export function createStudioMannequinQuadOrthoRig(): StudioMannequinQuadOrthoRig {
  const orthoFront = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 60);
  const orthoSide = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 60);
  const orthoTop = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 60);

  function syncOrthoSlot(
    cam: THREE.OrthographicCamera,
    bounds: THREE.Box3,
    direction: StudioMannequinVec3,
    aspect: number,
  ): void {
    if (bounds.isEmpty()) return;
    const fovRef = 32;
    const frame = fitStudioMannequinCameraToBounds({
      bounds: {
        min: [bounds.min.x, bounds.min.y, bounds.min.z],
        max: [bounds.max.x, bounds.max.y, bounds.max.z],
      },
      viewDirection: direction,
      fovDeg: fovRef,
      aspect: Math.max(0.25, aspect),
      minDistance: 0.6,
    });
    const target = new THREE.Vector3(frame.target[0], frame.target[1], frame.target[2]);
    cam.position.set(frame.position[0], frame.position[1], frame.position[2]);
    cam.lookAt(target);
    const dist = cam.position.distanceTo(target);
    const halfH = Math.max(0.2, dist * Math.tan(THREE.MathUtils.degToRad(fovRef / 2)));
    const halfW = halfH * Math.max(0.25, aspect);
    cam.left = -halfW;
    cam.right = halfW;
    cam.top = halfH;
    cam.bottom = -halfH;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
  }

  function resolveOrthoCamera(slot: "front" | "side" | "top"): THREE.OrthographicCamera {
    return slot === "front" ? orthoFront : slot === "side" ? orthoSide : orthoTop;
  }

  return {
    cameraForSlot(slot, mainCamera, bounds, paneWidth, paneHeight) {
      if (slot === "main") return mainCamera;
      const cam = resolveOrthoCamera(slot);
      syncOrthoSlot(cam, bounds, ORTHO_DIRECTIONS[slot], paneWidth / Math.max(1, paneHeight));
      return cam;
    },
    renderQuadView({ renderer, scene, mainCamera, bounds, viewWidth, viewHeight }) {
      const rects = computeStudioMannequinQuadViewRects(viewWidth, viewHeight);
      const prevAutoClear = renderer.autoClear;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewWidth, viewHeight);
      renderer.clear(true, true, true);

      renderer.autoClear = false;
      renderer.setScissorTest(true);

      // 주 뷰포트도 4분할 사각형 종횡비에 맞춰 투영 행렬을 일시 보정해 찌그러짐(aspect distortion)을 막는다.
      const persp = (mainCamera as THREE.PerspectiveCamera).isPerspectiveCamera
        ? (mainCamera as THREE.PerspectiveCamera)
        : null;
      const savedAspect = persp ? persp.aspect : 1;

      for (const rect of rects) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
        renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
        renderer.clearDepth();

        if (rect.slot === "main") {
          if (persp) {
            persp.aspect = rect.width / Math.max(1, rect.height);
            persp.updateProjectionMatrix();
          }
          renderer.render(scene, mainCamera);
          if (persp) {
            persp.aspect = savedAspect;
            persp.updateProjectionMatrix();
          }
        } else if (!bounds.isEmpty()) {
          const cam = resolveOrthoCamera(rect.slot);
          syncOrthoSlot(cam, bounds, ORTHO_DIRECTIONS[rect.slot], rect.width / Math.max(1, rect.height));
          renderer.render(scene, cam);
        }
      }

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewWidth, viewHeight);
      renderer.autoClear = prevAutoClear;
    },
  };
}
