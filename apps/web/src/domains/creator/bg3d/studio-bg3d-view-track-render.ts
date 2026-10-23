import { Color } from "three";

import { placeStudioBg3dViewTrack } from "./studio-bg3d-view-track-geometry";

import type { Camera, Object3D, OrthographicCamera, PerspectiveCamera } from "three";

import type { StudioBg3dViewPlacement } from "./studio-bg3d-view-track-geometry";

/** View 가 쓰는 렌더러 면. WebGL·WebGPU 렌더러가 함께 갖는 메서드만 요구한다. */
export interface StudioBg3dViewRenderer {
  autoClear: boolean;
  readonly domElement: Pick<HTMLCanvasElement, "getBoundingClientRect">;
  setViewport(x: number, y: number, width: number, height: number): void;
  setScissor(x: number, y: number, width: number, height: number): void;
  setScissorTest(enabled: boolean): void;
  getClearColor(target: Color): Color;
  getClearAlpha(): number;
  setClearColor(color: Color, alpha?: number): void;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  render(scene: Object3D, camera: Camera): void;
}

const scratchColor = new Color();

function isOrthographic(camera: Camera): camera is OrthographicCamera & { manual?: boolean } {
  return (camera as OrthographicCamera).isOrthographicCamera === true;
}

/** 트랙을 캔버스 안 어디에 그려야 하는지(캔버스 요소의 지금 사각형 기준). */
export function placeStudioBg3dViewOnRenderer(
  renderer: StudioBg3dViewRenderer,
  trackRect: DOMRect,
): StudioBg3dViewPlacement {
  return placeStudioBg3dViewTrack(renderer.domElement.getBoundingClientRect(), trackRect);
}

/** viewport·scissor 를 트랙 칸으로 맞추고 카메라 비율을 칸에 맞춘다. 돌려주는 값은 복구용 이전 autoClear 다. */
function applyViewport(renderer: StudioBg3dViewRenderer, camera: Camera, placement: StudioBg3dViewPlacement): boolean {
  const { left, bottom, width, height } = placement;
  if (isOrthographic(camera)) {
    if (!camera.manual) {
      if (camera.left !== width / -2 || camera.right !== width / 2
        || camera.top !== height / 2 || camera.bottom !== height / -2) {
        Object.assign(camera, { left: width / -2, right: width / 2, top: height / 2, bottom: height / -2 });
        camera.updateProjectionMatrix();
      }
    } else {
      camera.updateProjectionMatrix();
    }
  } else {
    const perspective = camera as PerspectiveCamera;
    const aspect = width / height;
    if (perspective.aspect !== aspect) {
      perspective.aspect = aspect;
      perspective.updateProjectionMatrix();
    }
  }
  const previousAutoClear = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setViewport(left, bottom, width, height);
  renderer.setScissor(left, bottom, width, height);
  renderer.setScissorTest(true);
  return previousAutoClear;
}

function finishViewport(renderer: StudioBg3dViewRenderer, previousAutoClear: boolean): void {
  renderer.setScissorTest(false);
  renderer.autoClear = previousAutoClear;
}

/** 트랙 칸 하나에 장면을 그린다. 호출자가 화면 밖이 아님을 이미 확인했다. */
export function drawStudioBg3dView(
  renderer: StudioBg3dViewRenderer,
  camera: Camera,
  scene: Object3D,
  placement: StudioBg3dViewPlacement,
): void {
  const previousAutoClear = applyViewport(renderer, camera, placement);
  renderer.render(scene, camera);
  finishViewport(renderer, previousAutoClear);
}

/** 트랙 칸만 지운다(숨김·해제 때 마지막 그림이 남지 않게). */
export function clearStudioBg3dView(
  renderer: StudioBg3dViewRenderer,
  camera: Camera,
  placement: StudioBg3dViewPlacement,
): void {
  const previousAutoClear = applyViewport(renderer, camera, placement);
  renderer.getClearColor(scratchColor);
  renderer.setClearColor(scratchColor, renderer.getClearAlpha());
  renderer.clear(true, true);
  finishViewport(renderer, previousAutoClear);
}
