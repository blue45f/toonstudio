/**
 * 포인터 좌표 → 추론 커서(레이 + 투영 + 표면 교점) 변환 어댑터.
 *
 * three.js의 카메라·레이캐스터만 쓰고 WebGL·DOM에는 의존하지 않아, 합성 카메라·메시로 단위 테스트할 수
 * 있다. 순수 추론 엔진(`studio-bg3d-inference-engine.ts`)은 이 모듈이 만든 커서만 받는다.
 */

import * as THREE from "three";

import { readStudioBg3dWorldSurfaceHit } from "./studio-bg3d-camera-application";

import type {
  StudioBg3dInferenceCursor,
  StudioBg3dInferenceProjection,
  StudioBg3dInferenceSurfaceHit,
} from "./studio-bg3d-inference-types";

/**
 * 배치 포인터 컨트롤러(`StudioBg3dPlacementPointerController`)가 정의한 "레이캐스트 무시" 표식 키와
 * 같은 값이다. 미리보기·핸들·격자처럼 추론의 면 판정에서 빠져야 하는 객체가 이미 이 키를 쓴다.
 * (값 일치는 테스트가 지킨다.)
 */
export const STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY = "studioBg3dPlacementRaycastIgnore";
const ENTITY_ID_KEY = "studioBg3dEntityId";

export interface StudioBg3dInferenceViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioBg3dInferenceRayScratch {
  readonly raycaster: THREE.Raycaster;
  readonly ndc: THREE.Vector2;
  readonly roots: THREE.Object3D[];
  readonly hits: THREE.Intersection[];
}

export function createStudioBg3dInferenceRayScratch(): StudioBg3dInferenceRayScratch {
  return { raycaster: new THREE.Raycaster(), ndc: new THREE.Vector2(), roots: [], hits: [] };
}

export function readStudioBg3dInferenceNdc(
  rect: StudioBg3dInferenceViewportRect,
  clientX: number,
  clientY: number,
  target: THREE.Vector2,
): THREE.Vector2 | null {
  const { left, top, width, height } = rect;
  if (![clientX, clientY, left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  if (clientX < left || clientX > left + width || clientY < top || clientY > top + height) return null;
  return target.set(((clientX - left) / width) * 2 - 1, -((clientY - top) / height) * 2 + 1);
}

/**
 * 카메라의 화면 1px에 해당하는 월드 크기 모델. 원근은 깊이에 비례(`2·tan(fov/2)/높이`), 직교는 일정하다.
 * 줌(`camera.zoom`)을 반영한다. 렌즈 시프트는 크기에 영향이 없다.
 */
export function resolveStudioBg3dInferenceProjection(
  camera: THREE.Camera,
  viewportHeightPx: number,
): StudioBg3dInferenceProjection | null {
  if (!Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) return null;
  const perspective = camera as THREE.PerspectiveCamera;
  if (perspective.isPerspectiveCamera) {
    const zoom = perspective.zoom > 0 ? perspective.zoom : 1;
    const halfFov = (perspective.fov * Math.PI) / 360;
    const radiansPerPixel = (2 * Math.tan(halfFov)) / zoom / viewportHeightPx;
    return Number.isFinite(radiansPerPixel) && radiansPerPixel > 0
      ? { type: "perspective", radiansPerPixel }
      : null;
  }
  const orthographic = camera as THREE.OrthographicCamera;
  if (orthographic.isOrthographicCamera) {
    const zoom = orthographic.zoom > 0 ? orthographic.zoom : 1;
    const worldPerPixel = (orthographic.top - orthographic.bottom) / zoom / viewportHeightPx;
    return Number.isFinite(worldPerPixel) && worldPerPixel > 0
      ? { type: "orthographic", worldPerPixel }
      : null;
  }
  return null;
}

function isVisibleChain(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current.userData[STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY] === true) return false;
    current = current.parent;
  }
  return true;
}

function findEntityId(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const id: unknown = current.userData[ENTITY_ID_KEY];
    if (typeof id === "string" && id.length > 0) return id;
    current = current.parent;
  }
  return null;
}

export interface BuildStudioBg3dInferenceRayCursorInput {
  readonly camera: THREE.Camera;
  readonly rect: StudioBg3dInferenceViewportRect;
  readonly clientX: number;
  readonly clientY: number;
  /** 장면 객체 루트(id → 그룹). 보이는 루트만 래이캐스트한다. */
  readonly roots: ReadonlyMap<string, THREE.Object3D> | null;
  /** 바닥 평면 높이. null이면 바닥을 쓰지 않는다. */
  readonly groundY: number | null;
  readonly sourceLabel?: (sourceId: string) => string | null;
  readonly scratch?: StudioBg3dInferenceRayScratch;
}

export interface StudioBg3dInferenceRayCursorResult {
  readonly cursor: StudioBg3dInferenceCursor;
  readonly hitSourceId: string | null;
}

/**
 * 포인터 화면 좌표로 추론 레이 커서를 만든다. 실패(뷰포트 밖·비정상 카메라)하면 null.
 * 첫 표면 교점은 추론 엔진이 "면 위" 후보와 가림 판정에 쓴다.
 */
export function buildStudioBg3dInferenceRayCursor(
  input: BuildStudioBg3dInferenceRayCursorInput,
): StudioBg3dInferenceRayCursorResult | null {
  const scratch = input.scratch ?? createStudioBg3dInferenceRayScratch();
  const ndc = readStudioBg3dInferenceNdc(input.rect, input.clientX, input.clientY, scratch.ndc);
  if (!ndc) return null;
  const projection = resolveStudioBg3dInferenceProjection(input.camera, input.rect.height);
  if (!projection) return null;
  const { camera } = input;
  if (!camera.matrixWorld.elements.every(Number.isFinite) || !camera.projectionMatrix.elements.every(Number.isFinite)) {
    return null;
  }
  try {
    scratch.raycaster.setFromCamera(ndc, camera);
  } catch {
    return null;
  }
  const ray = scratch.raycaster.ray;
  const origin = ray.origin.toArray() as [number, number, number];
  const direction = ray.direction.toArray() as [number, number, number];
  if (![...origin, ...direction].every(Number.isFinite)) return null;

  let surfaceHit: StudioBg3dInferenceSurfaceHit | null = null;
  let hitSourceId: string | null = null;
  scratch.roots.length = 0;
  scratch.hits.length = 0;
  try {
    if (input.roots) {
      for (const object of input.roots.values()) {
        if (object?.isObject3D && isVisibleChain(object)) scratch.roots.push(object);
      }
    }
    if (scratch.roots.length > 0) {
      scratch.raycaster.intersectObjects(scratch.roots, true, scratch.hits);
      for (const hit of scratch.hits) {
        if (!(hit.object as THREE.Mesh).isMesh || !isVisibleChain(hit.object)) continue;
        const world = readStudioBg3dWorldSurfaceHit(hit);
        if (!world) continue;
        hitSourceId = findEntityId(hit.object);
        surfaceHit = {
          point: world.point,
          normal: world.normal,
          sourceId: hitSourceId,
          label: hitSourceId ? input.sourceLabel?.(hitSourceId) ?? null : null,
        };
        break;
      }
    }
  } catch {
    surfaceHit = null;
    hitSourceId = null;
  } finally {
    scratch.roots.length = 0;
    scratch.hits.length = 0;
  }

  return {
    cursor: {
      kind: "ray",
      origin,
      direction,
      projection,
      ...(surfaceHit ? { surfaceHit } : {}),
      ...(input.groundY === null ? {} : { groundY: input.groundY }),
    },
    hitSourceId,
  };
}
