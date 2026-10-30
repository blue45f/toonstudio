import { Matrix4, OrthographicCamera, PerspectiveCamera, Quaternion, Vector3 } from "three";

import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { isStudioBg3dCameraNearClip, isStudioBg3dCameraUpVectorValid, isStudioBg3dOrthographicHeight,
  resolveStudioBg3dCameraDistanceLimits, resolveStudioBg3dCameraNearClip, resolveStudioBg3dCameraUpVector } from "./studio-bg3d-camera-orientation";
import { STUDIO_BG3D_GLB_MAX_BYTES, STUDIO_BG3D_GLB_MAX_JSON_BYTES } from "./studio-bg3d-glb-validation";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

export const STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER = "toonstudioSceneExportCamera";
export type StudioBg3dSceneGlbCameraErrorCode = "invalid-camera" | "invalid-aspect" | "missing-framing"
  | "unsupported-projection" | "invalid-glb" | "camera-mismatch" | "aborted";
export type StudioBg3dSceneGlbCameraResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: StudioBg3dSceneGlbCameraErrorCode; readonly messageKo: string };
export type StudioBg3dSceneGltfCamera = {
  readonly type: "perspective";
  readonly perspective: { readonly aspectRatio: number; readonly yfov: number; readonly znear: number; readonly zfar: number };
} | {
  readonly type: "orthographic";
  readonly orthographic: { readonly xmag: number; readonly ymag: number; readonly znear: number; readonly zfar: number };
};
export interface StudioBg3dSceneGlbCameraInput {
  readonly camera: StudioBg3dCameraSettings;
  readonly aspectRatio: number;
  /** H가 없는 legacy 카메라만 요구한다. 현재 viewport API가 읽은 zoom 전 실제 절두체다. */
  readonly orthographicFrustumAtZoomOne?: { readonly width: number; readonly height: number };
  readonly signal?: AbortSignal;
}
export interface StudioBg3dSceneGlbCameraPreparation {
  readonly camera: PerspectiveCamera | OrthographicCamera;
  readonly expectedGltfCamera: StudioBg3dSceneGltfCamera;
  readonly expectedWorldMatrix: readonly number[];
}

const preparedCameras = new WeakMap<StudioBg3dSceneGlbCameraPreparation, StudioBg3dSceneGlbCameraPreparation>();
const MESSAGES: Readonly<Record<StudioBg3dSceneGlbCameraErrorCode, string>> = {
  "invalid-camera": "현재 카메라의 위치·방향·화각·배율을 손실 없이 내보낼 수 없습니다.",
  "invalid-aspect": "카메라를 내보낼 실제 뷰포트 비율을 확인할 수 없습니다.",
  "missing-framing": "기존 직교 카메라의 실제 절두체를 읽지 못해 높이를 추측하지 않았습니다.",
  "unsupported-projection": "렌즈 이동·2점 투시 카메라는 glTF 기본 카메라로 같은 구도를 보존할 수 없습니다.",
  "invalid-glb": "카메라를 기록할 완전한 GLB를 읽지 못했습니다.",
  "camera-mismatch": "내보낸 카메라의 식별·투영·배치가 준비한 현재 카메라와 다릅니다.",
  aborted: "현재 장면의 카메라 내보내기를 취소했습니다.",
};
class CameraFailure extends Error {
  constructor(readonly code: StudioBg3dSceneGlbCameraErrorCode) { super(MESSAGES[code]); }
}
function fail(code: StudioBg3dSceneGlbCameraErrorCode): never { throw new CameraFailure(code); }
function result<T>(work: () => T): StudioBg3dSceneGlbCameraResult<T> {
  try { return { ok: true, value: work() }; }
  catch (error) { const code = error instanceof CameraFailure ? error.code : "invalid-glb"; return { ok: false, code, messageKo: MESSAGES[code] }; }
}
function active(signal?: AbortSignal): void { if (signal?.aborted) fail("aborted"); }
function numberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}
function numbers(value: unknown, count: number): value is number[] {
  return Array.isArray(value) && value.length === count && Array.from({ length: count }, (_, index) => index)
    .every((index) => Object.hasOwn(value, index) && typeof value[index] === "number" && Number.isFinite(value[index]));
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function close(a: number, b: number): boolean { return Number.isFinite(a) && Math.abs(a - b) <= 128 * Number.EPSILON * Math.max(1, Math.abs(a), Math.abs(b)); }
function sameMatrix(actual: readonly number[], expected: readonly number[]): boolean {
  return actual.length === 16 && expected.length === 16 && actual.every((value, index) => close(value, expected[index]));
}
function validateView(view: StudioBg3dCameraSettings): void {
  if (!record(view) || !numbers(view.position, 3) || !numbers(view.target, 3)
    || [...view.position, ...view.target].some((value) => Math.abs(value) > 10_000)
    || new Vector3(...view.position).distanceTo(new Vector3(...view.target)) < 0.01
    || !numberIn(view.fovDegrees, 10, 120) || !numberIn(view.zoom ?? 1, 0.1, 100)
    || (view.projection !== undefined && view.projection !== "perspective" && view.projection !== "orthographic")
    || (view.nearClip !== undefined && !isStudioBg3dCameraNearClip(view.nearClip))
    || (view.orthographicHeight !== undefined && !isStudioBg3dOrthographicHeight(view.orthographicHeight))
    || (view.up !== undefined && (!numbers(view.up, 3) || !isStudioBg3dCameraUpVectorValid(view.up, view)))) fail("invalid-camera");
  if (view.lensShift !== undefined) {
    if (!numbers(view.lensShift, 2) || view.lensShift.some((value) => Math.abs(value) > 2)) fail("invalid-camera");
    if (view.lensShift.some((value) => value !== 0)) fail("unsupported-projection");
  }
}

/** glTF §3.10.3의 대칭 투영만 준비한다. 원본/live 카메라와 문서는 변경하지 않는다. */
export function createStudioBg3dSceneGlbCamera(input: StudioBg3dSceneGlbCameraInput): StudioBg3dSceneGlbCameraResult<StudioBg3dSceneGlbCameraPreparation> {
  return result(() => {
    active(input.signal); validateView(input.camera);
    if (!numberIn(input.aspectRatio, Number.MIN_VALUE, Number.MAX_VALUE)) fail("invalid-aspect");
    const view = input.camera, zoom = view.zoom ?? 1, aspect = input.aspectRatio;
    const near = resolveStudioBg3dCameraNearClip(view.nearClip), far = resolveStudioBg3dCameraDistanceLimits(view.position, view.target).farClip;
    let camera: PerspectiveCamera | OrthographicCamera, expectedGltfCamera: StudioBg3dSceneGltfCamera;
    if (view.projection === "orthographic") {
      let height = view.orthographicHeight;
      if (height === undefined) {
        const framing = input.orthographicFrustumAtZoomOne;
        if (!framing || !numberIn(framing.height, Number.MIN_VALUE, Number.MAX_VALUE)
          || !numberIn(framing.width, Number.MIN_VALUE, Number.MAX_VALUE) || !close(framing.width / framing.height, aspect)) fail("missing-framing");
        height = framing.height;
      }
      const ymag = height / (2 * zoom), xmag = ymag * aspect;
      if (![xmag, ymag].every((value) => numberIn(value, Number.MIN_VALUE, Number.MAX_VALUE))) fail("invalid-camera");
      camera = new OrthographicCamera(-xmag, xmag, ymag, -ymag, near, far);
      expectedGltfCamera = Object.freeze({ type: "orthographic", orthographic: Object.freeze({ xmag, ymag, znear: near, zfar: far }) });
    } else {
      const yfov = 2 * Math.atan(Math.tan(view.fovDegrees * Math.PI / 360) / zoom);
      if (!numberIn(yfov, Number.MIN_VALUE, Math.PI) || !Number.isFinite(Math.tan(yfov / 2) * aspect)) fail("invalid-camera");
      camera = new PerspectiveCamera(yfov * 180 / Math.PI, aspect, near, far);
      expectedGltfCamera = Object.freeze({ type: "perspective", perspective: Object.freeze({ aspectRatio: aspect, yfov, znear: near, zfar: far }) });
    }
    camera.name = "ToonStudio Scene Camera";
    camera.userData = { [STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER]: { version: 1, role: "main" } };
    camera.position.set(...view.position);
    camera.up.set(...resolveStudioBg3dCameraUpVector(view));
    camera.lookAt(new Vector3(...view.target)); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    if (![...camera.projectionMatrix.elements, ...camera.matrixWorld.elements].every(Number.isFinite)) fail("invalid-camera");
    active(input.signal);
    const prepared = Object.freeze({ camera, expectedGltfCamera, expectedWorldMatrix: Object.freeze(camera.matrixWorld.toArray()) });
    preparedCameras.set(prepared, prepared); return prepared;
  });
}

function nodeMatrix(node: Record<string, unknown>): Matrix4 {
  if (node.matrix !== undefined) {
    if (!numbers(node.matrix, 16) || node.translation !== undefined || node.rotation !== undefined || node.scale !== undefined) fail("camera-mismatch");
    return new Matrix4().fromArray(node.matrix);
  }
  const translation = node.translation ?? [0, 0, 0], rotation = node.rotation ?? [0, 0, 0, 1], scale = node.scale ?? [1, 1, 1];
  if (!numbers(translation, 3) || !numbers(rotation, 4) || !numbers(scale, 3)) fail("camera-mismatch");
  return new Matrix4().compose(new Vector3(...translation), new Quaternion(...rotation), new Vector3(...scale));
}
function sameFields(actual: Record<string, unknown>, expected: object, magnitude = 1): boolean {
  return Object.entries(expected).every(([key, value]) => typeof value === "number" && typeof actual[key] === "number" && close(actual[key], value * magnitude));
}
function cameraNode(json: Record<string, unknown>, expected: StudioBg3dSceneGlbCameraPreparation): { readonly node: Record<string, unknown>; readonly definition: Record<string, unknown> } {
  if (!Array.isArray(json.nodes) || !Array.isArray(json.cameras) || !Array.isArray(json.scenes)) fail("camera-mismatch");
  const marked = json.nodes.flatMap((node: unknown, index: number) => {
    if (!record(node) || !record(node.extras) || !Object.hasOwn(node.extras, STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER)) return [];
    const marker = node.extras[STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER];
    if (!record(marker) || marker.version !== 1 || marker.role !== "main" || Object.keys(marker).length !== 2) fail("camera-mismatch");
    return [{ node, index }];
  });
  if (marked.length !== 1) fail("camera-mismatch");
  const { node, index } = marked[0], sceneIndex = json.scene ?? 0;
  if (typeof sceneIndex !== "number" || !Number.isSafeInteger(sceneIndex)) fail("camera-mismatch");
  const scene: unknown = json.scenes[sceneIndex];
  if (!record(scene) || !Array.isArray(scene.nodes) || scene.nodes.filter((id: unknown) => id === index).length !== 1
    || json.nodes.some((item: unknown) => record(item) && Array.isArray(item.children) && item.children.includes(index))
    || !sameMatrix(nodeMatrix(node).elements, expected.expectedWorldMatrix)
    || typeof node.camera !== "number" || !Number.isSafeInteger(node.camera) || node.camera < 0
    || json.nodes.filter((item: unknown) => record(item) && item.camera === node.camera).length !== 1) fail("camera-mismatch");
  const definition: unknown = json.cameras[node.camera];
  if (!record(definition) || definition.type !== expected.expectedGltfCamera.type) fail("camera-mismatch");
  return { node, definition };
}

/**
 * 설치 Three 0.186.1 exporter의 processCamera는 ortho magnification을 두 배로 쓰고 zoom을 읽지 않는다.
 * glTF §3.10.3.4의 xmag/ymag는 반폭/반높이다. 독립 camera는 zoom을 미리 투영에 반영하고,
 * 여기서는 식별된 main 카메라의 해당 수치만 보정한다. 자신의 임시 marker만 제거한다.
 * https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#orthographic-projection
 */
export function finalizeStudioBg3dSceneGlbCamera(glb: Uint8Array, prepared: StudioBg3dSceneGlbCameraPreparation,
  signal?: AbortSignal): StudioBg3dSceneGlbCameraResult<Uint8Array<ArrayBuffer>> {
  return result(() => {
    active(signal);
    const expected = preparedCameras.get(prepared);
    if (!expected || prepared.camera.zoom !== 1) fail("camera-mismatch");
    if (!(glb instanceof Uint8Array) || glb.byteLength < 20 || glb.byteLength > STUDIO_BG3D_GLB_MAX_BYTES) fail("invalid-glb");
    if (new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(12, true) > STUDIO_BG3D_GLB_MAX_JSON_BYTES) fail("invalid-glb");
    const parsed = readStudioVrmExportGlb(Uint8Array.from(glb)), { node, definition } = cameraNode(parsed.json, expected);
    const core = expected.expectedGltfCamera;
    if (core.type === "orthographic") {
      const actual = definition.orthographic;
      if (!record(actual) || definition.perspective !== undefined || !sameFields(actual, { znear: core.orthographic.znear, zfar: core.orthographic.zfar })
        || !sameFields(actual, { xmag: core.orthographic.xmag, ymag: core.orthographic.ymag }, 2)) fail("camera-mismatch");
      definition.orthographic = { ...actual, ...core.orthographic };
    } else {
      if (!record(definition.perspective) || definition.orthographic !== undefined || !sameFields(definition.perspective, core.perspective)) fail("camera-mismatch");
    }
    const extras = node.extras;
    if (!record(extras)) fail("camera-mismatch");
    delete extras[STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER];
    if (Object.keys(extras).length === 0) delete node.extras;
    active(signal);
    return writeStudioVrmExportGlb({ json: parsed.json, binary: parsed.binary });
  });
}
