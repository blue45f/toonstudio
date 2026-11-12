/**
 * Studio 3D 데생 인형 v4 — 4분할 사면도(All-Sides Quad View) & 만화 원근(Lens FOV) 헬퍼.
 *
 * 클립스튜디오 EX 전용 '사면도(All Sides View)'를 넘어 단일 WebGL 캔버스 위에서
 * 상시 루프 없이 온디맨드(invalidate)로 4개 뷰포트(주 투시 · 정면 · 측면 · 탑뷰)를 동시에 그리고,
 * 웹툰 연출용 렌즈 화각(망원 18° 인물화 ~ 초광각 80° 액션 단축 과장)을 결정적으로 계산한다.
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

export interface StudioMannequinQuadViewportRect {
  readonly slot: "main" | "front" | "side" | "top";
  readonly labelKo: string;
  readonly x: number;
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

export interface StudioMannequinQuadOrthoRig {
  renderQuadView(input: {
    readonly renderer: THREE.WebGLRenderer;
    readonly scene: THREE.Scene;
    readonly mainCamera: THREE.Camera;
    readonly bounds: THREE.Box3;
    readonly viewWidth: number;
    readonly viewHeight: number;
  }): void;
}

const ORTHO_DIRECTIONS: Readonly<Record<"front" | "side" | "top", StudioMannequinVec3>> = Object.freeze({
  front: [0, 0.06, 1],
  side: [1, 0.06, 0],
  top: [0, 1, 0.02],
});

/**
 * 4분할 사면도 보조 직교 카메라 3기(정면·측면·탑뷰)를 재사용하며 단일 캔버스에 4분할 렌더링을 수행한다.
 */
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
  }

  return {
    renderQuadView({ renderer, scene, mainCamera, bounds, viewWidth, viewHeight }) {
      const rects = computeStudioMannequinQuadViewRects(viewWidth, viewHeight);
      const prevAutoClear = renderer.autoClear;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewWidth, viewHeight);
      renderer.clear(true, true, true);

      renderer.autoClear = false;
      renderer.setScissorTest(true);

      for (const rect of rects) {
        if (rect.width <= 0 || rect.height <= 0) continue;
        renderer.setViewport(rect.x, rect.y, rect.width, rect.height);
        renderer.setScissor(rect.x, rect.y, rect.width, rect.height);
        renderer.clearDepth();

        if (rect.slot === "main") {
          renderer.render(scene, mainCamera);
        } else if (!bounds.isEmpty()) {
          const aspect = rect.width / Math.max(1, rect.height);
          const cam =
            rect.slot === "front"
              ? orthoFront
              : rect.slot === "side"
                ? orthoSide
                : orthoTop;
          syncOrthoSlot(cam, bounds, ORTHO_DIRECTIONS[rect.slot], aspect);
          renderer.render(scene, cam);
        }
      }

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewWidth, viewHeight);
      renderer.autoClear = prevAutoClear;
    },
  };
}
