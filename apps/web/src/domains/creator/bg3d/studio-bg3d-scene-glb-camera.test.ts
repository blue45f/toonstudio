import { BoxGeometry, Mesh, MeshStandardMaterial, OrthographicCamera, PerspectiveCamera, Scene, Vector3 } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { applyStudioBg3dViewToThreeCamera } from "./studio-bg3d-camera-application";
import { createStudioBg3dCameraUpForDutchRoll } from "./studio-bg3d-camera-orientation";
import { DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES, STUDIO_BG3D_GLB_MAX_JSON_BYTES, validateStudioBg3dGlb } from "./studio-bg3d-glb-validation";
import { createStudioBg3dSceneGlbCamera, finalizeStudioBg3dSceneGlbCamera, STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER } from "./studio-bg3d-scene-glb-camera";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSceneGlbCameraInput, StudioBg3dSceneGlbCameraPreparation } from "./studio-bg3d-scene-glb-camera";

/** Node에는 없는 FileReader만 제공한다. exporter·container·loader의 실제 코드는 그대로 실행한다. */
class ExportFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then((buffer) => { this.result = buffer; this.onloadend?.(); }, () => this.onerror?.());
  }
}
beforeEach(() => vi.stubGlobal("FileReader", ExportFileReader));
afterEach(() => vi.unstubAllGlobals());

function view(overrides: Partial<StudioBg3dCameraSettings> = {}): StudioBg3dCameraSettings {
  const basis = { position: [5, 4, 9], target: [0.5, 1, -2] } satisfies Pick<StudioBg3dCameraSettings, "position" | "target">;
  const up = createStudioBg3dCameraUpForDutchRoll(basis, 37); if (!up) throw Error("시험 카메라 roll 필요");
  return { ...basis, projection: "perspective", fovDegrees: 53, zoom: 2.5, nearClip: 0.35, up, ...overrides };
}
function prepare(input: StudioBg3dSceneGlbCameraInput): StudioBg3dSceneGlbCameraPreparation {
  const result = createStudioBg3dSceneGlbCamera(input); if (!result.ok) throw Error(result.messageKo); return result.value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function record(value: unknown): Record<string, unknown> { if (!isRecord(value)) throw Error("JSON 객체 필요"); return value; }
function first(value: unknown): unknown { if (!Array.isArray(value) || !value.length) throw Error("JSON 배열 필요"); return value[0]; }
function reference(input: StudioBg3dSceneGlbCameraInput): PerspectiveCamera | OrthographicCamera {
  const height = input.camera.orthographicHeight ?? input.orthographicFrustumAtZoomOne?.height ?? 1;
  const width = height * input.aspectRatio;
  const camera = input.camera.projection === "orthographic"
    ? new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2)
    : new PerspectiveCamera(50, input.aspectRatio);
  if (!applyStudioBg3dViewToThreeCamera(camera, null, input.camera, { width: input.aspectRatio, height: 1 })) throw Error("실제 카메라 적용 실패");
  return camera;
}
function expectProjectionAndPose(actual: PerspectiveCamera | OrthographicCamera, expected: PerspectiveCamera | OrthographicCamera) {
  actual.updateMatrixWorld(true); expected.updateMatrixWorld(true);
  actual.projectionMatrix.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.projectionMatrix.elements[index], 11));
  actual.matrixWorld.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.matrixWorld.elements[index], 11));
  expect(actual.near).toBe(expected.near); expect(actual.far).toBe(expected.far);
  expect(actual.getWorldDirection(new Vector3()).distanceTo(expected.getWorldDirection(new Vector3()))).toBeLessThan(1e-12);
  const target = new Vector3(0.5, 1, -2);
  // 극소 높이의 NDC는 미세한 pose 오차를 크게 증폭한다. 같은 화면 차이를 카메라 평면 단위로 비교한다.
  const delta = target.clone().project(actual).sub(target.clone().project(expected));
  expect(Math.hypot(delta.x / actual.projectionMatrix.elements[0], delta.y / actual.projectionMatrix.elements[5])).toBeLessThan(1e-10);
}
async function exported(prepared: StudioBg3dSceneGlbCameraPreparation, trs = false, foreignFirst = false) {
  const scene = new Scene(), geometry = new BoxGeometry(), material = new MeshStandardMaterial({ color: "#2244aa" });
  const box = new Mesh(geometry, material); box.position.set(2, 3, -4); box.userData = { untouched: { kind: "fixture" } };
  scene.userData = { originalSceneData: "보존" }; scene.add(box);
  if (foreignFirst) scene.add(new PerspectiveCamera(35, 1.3, 0.5, 300));
  scene.add(prepared.camera);
  try {
    const buffer = await new GLTFExporter().parseAsync(scene, { binary: true, trs });
    if (!(buffer instanceof ArrayBuffer)) throw Error("실제 GLB 필요"); return new Uint8Array(buffer);
  } finally { scene.remove(prepared.camera); geometry.dispose(); material.dispose(); }
}
async function loaded(bytes: Uint8Array) {
  const gltf = await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer, "");
  const camera = gltf.cameras[0];
  if (!(camera instanceof OrthographicCamera) && !(camera instanceof PerspectiveCamera)) throw Error("실제 재로드 카메라 필요");
  return camera;
}

describe("현재 장면 GLB의 실제 카메라 투영·배치", () => {
  it.each([false, true])("원근 zoom을 유효 수직 화각으로 기록하고 TRS=%s에서도 실제 loader 구도를 유지한다", async (trs) => {
    const input = { camera: view(), aspectRatio: 16 / 9 }, snapshot = structuredClone(input), prepared = prepare(input), original = reference(input);
    expectProjectionAndPose(prepared.camera, original);
    const bytes = await exported(prepared, trs), finalized = finalizeStudioBg3dSceneGlbCamera(bytes, prepared);
    expect(finalized.ok).toBe(true); if (!finalized.ok) throw Error(finalized.messageKo);
    expectProjectionAndPose(await loaded(finalized.value), original); expect(input).toEqual(snapshot);
    const definition = record(first(readStudioVrmExportGlb(finalized.value).json.cameras));
    expect(record(definition.perspective).yfov).toBeCloseTo(2 * Math.atan(Math.tan(53 * Math.PI / 360) / 2.5), 15);
    expect(prepared.camera.zoom).toBe(1);
  });

  it.each([false, true])("명시 H8/zoom2: stock ortho 배율 오류를 재현하고 TRS=%s 최종 projection을 보정한다", async (trs) => {
    const input = { camera: view({ projection: "orthographic", orthographicHeight: 8, zoom: 2 }), aspectRatio: 16 / 9 };
    const prepared = prepare(input), original = reference(input), bytes = await exported(prepared, trs);
    expectProjectionAndPose(prepared.camera, original);
    const raw = await loaded(bytes); if (!(raw instanceof OrthographicCamera)) throw Error("직교 필요");
    expect(raw.top - raw.bottom).toBe(8); // 설치 exporter는 실제 높이 4를 두 배로 내보낸다.
    const result = finalizeStudioBg3dSceneGlbCamera(bytes, prepared);
    if (!result.ok) throw Error(result.messageKo);
    const camera = await loaded(result.value); if (!(camera instanceof OrthographicCamera)) throw Error("직교 필요");
    expect(camera.top - camera.bottom).toBe(4); expectProjectionAndPose(camera, original);
    expect(record(record(first(readStudioVrmExportGlb(result.value).json.cameras)).orthographic)).toMatchObject({ xmag: 32 / 9, ymag: 2, znear: 0.35 });
  });

  it.each([{ fovDegrees: 10, zoom: 100 }, { fovDegrees: 120, zoom: 0.1 }])("원근 화각 $fovDegrees/zoom $zoom 경계도 유효 화각을 자르지 않는다", async (lens) => {
    const input = { camera: view(lens), aspectRatio: 2 }, prepared = prepare(input);
    const result = finalizeStudioBg3dSceneGlbCamera(await exported(prepared), prepared); if (!result.ok) throw Error(result.messageKo);
    expectProjectionAndPose(await loaded(result.value), reference(input));
  });

  it("legacy pixel-frustum은 실제 API 측정값을 쓰며 문서에 H를 새로 추정해 넣지 않는다", async () => {
    const input = { camera: view({ projection: "orthographic", zoom: 80 }), aspectRatio: 890 / 510,
      orthographicFrustumAtZoomOne: { width: 890, height: 510 } };
    const prepared = prepare(input), original = reference(input), bytes = await exported(prepared);
    const result = finalizeStudioBg3dSceneGlbCamera(bytes, prepared); if (!result.ok) throw Error(result.messageKo);
    const camera = await loaded(result.value); expectProjectionAndPose(camera, original);
    expect(camera instanceof OrthographicCamera && camera.top - camera.bottom).toBe(510 / 80);
    expect(Object.hasOwn(input.camera, "orthographicHeight")).toBe(false);
    expect(createStudioBg3dSceneGlbCamera({ camera: input.camera, aspectRatio: input.aspectRatio })).toMatchObject({ ok: false, code: "missing-framing" });
    expect(createStudioBg3dSceneGlbCamera({ ...input, orthographicFrustumAtZoomOne: { width: 1, height: 510 } })).toMatchObject({ ok: false, code: "missing-framing" });
  });

  it("자기 marker와 main intrinsic만 바꾸고 BIN·재질·형상·외부 extras·입력 bytes를 보존한다", async () => {
    const prepared = prepare({ camera: view({ projection: "orthographic", orthographicHeight: 8 }), aspectRatio: 2 });
    prepared.camera.userData.kept = { key: "다른 정보" };
    const bytes = await exported(prepared), snapshot = Uint8Array.from(bytes), before = readStudioVrmExportGlb(bytes);
    const result = finalizeStudioBg3dSceneGlbCamera(bytes, prepared); if (!result.ok) throw Error(result.messageKo);
    const after = readStudioVrmExportGlb(result.value), expected = structuredClone(before.json);
    record(first(expected.cameras)).orthographic = prepared.expectedGltfCamera.type === "orthographic" ? prepared.expectedGltfCamera.orthographic : {};
    if (!Array.isArray(expected.nodes)) throw Error("노드 필요");
    const node: unknown = expected.nodes.find((item: unknown) => typeof record(item).camera === "number");
    delete record(record(node).extras)[STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER];
    expect(after.json).toEqual(expected); expect(after.binary).toEqual(before.binary); expect(bytes).toEqual(snapshot);
    expect(prepared.camera.userData[STUDIO_BG3D_SCENE_GLB_CAMERA_MARKER]).toEqual({ version: 1, role: "main" });
  });

  it("다른 카메라가 먼저 있어도 marker의 main index만 보정하고 외부 camera를 그대로 둔다", async () => {
    const prepared = prepare({ camera: view({ projection: "orthographic", orthographicHeight: 8 }), aspectRatio: 2 });
    const bytes = await exported(prepared, false, true), before = readStudioVrmExportGlb(bytes);
    const result = finalizeStudioBg3dSceneGlbCamera(bytes, prepared); if (!result.ok) throw Error(result.messageKo);
    const after = readStudioVrmExportGlb(result.value);
    if (!Array.isArray(before.json.cameras) || !Array.isArray(after.json.cameras)) throw Error("카메라 배열 필요");
    expect(after.json.cameras[0]).toEqual(before.json.cameras[0]);
    expect(after.json.cameras[1]).toMatchObject(prepared.expectedGltfCamera); expect(after.binary).toEqual(before.binary);
  });

  it("최종 카메라·실제 mesh 파일이 기존 strict GLB validator를 통과한다", async () => {
    const prepared = prepare({ camera: view({ projection: "orthographic", orthographicHeight: 8 }), aspectRatio: 2 });
    const result = finalizeStudioBg3dSceneGlbCamera(await exported(prepared), prepared); if (!result.ok) throw Error(result.messageKo);
    const digest = await crypto.subtle.digest("SHA-256", result.value);
    const sha256 = `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
    expect(await validateStudioBg3dGlb(result.value, { profile: "desktop", budgets: DEFAULT_STUDIO_BG3D_GLB_BUDGET_PROFILES,
      declared: { sha256, byteSize: result.value.byteLength, mimeType: "model/gltf-binary" }, cumulative: { usedBytes: 0, maximumBytes: 100 * 1024 * 1024 } })).toMatchObject({ ok: true });
  });

  const limits = [{ height: 1e-6, zoom: 100 }, { height: 100_000, zoom: 0.1 }];
  it.each(limits)("명시 높이 경계 $height·zoom $zoom를 clamp하지 않고 왕복한다", async ({ height, zoom }) => {
    const input = { camera: view({ projection: "orthographic", orthographicHeight: height, zoom }), aspectRatio: 1 };
    const prepared = prepare(input), result = finalizeStudioBg3dSceneGlbCamera(await exported(prepared), prepared);
    if (!result.ok) throw Error(result.messageKo); expectProjectionAndPose(await loaded(result.value), reference(input));
  });

  it.each([0.01, -0.2, Number.MIN_VALUE])("비영 lensShift %s·2점 투시를 기본 카메라로 축소하지 않는다", (offset) => {
    expect(createStudioBg3dSceneGlbCamera({ camera: view({ lensShift: [0, offset] }), aspectRatio: 1 })).toMatchObject({ ok: false, code: "unsupported-projection" });
  });

  const invalidViews: readonly Partial<StudioBg3dCameraSettings>[] = [
    { zoom: 0 }, { zoom: 100.01 }, { fovDegrees: 121 }, { nearClip: 0 }, { orthographicHeight: 0 }, { position: [NaN, 0, 1] },
    { position: [10001, 0, 1] }, { position: [0.5, 1, -2] }, { up: [0, 0, 0] }, { up: [1, 1, 1] }, { lensShift: [Infinity, 0] },
  ];
  it.each(invalidViews)("잘못된 canonical camera %j를 default/clamp로 바꾸지 않는다", (change) => {
    expect(createStudioBg3dSceneGlbCamera({ camera: view(change), aspectRatio: 1 })).toMatchObject({ ok: false, code: "invalid-camera" });
  });
  it.each([0, -1, NaN, Infinity])("잘못된 viewport aspect %s를 거부한다", (aspectRatio) => {
    expect(createStudioBg3dSceneGlbCamera({ camera: view(), aspectRatio })).toMatchObject({ ok: false, code: "invalid-aspect" });
  });

  it("top view의 legacy up fallback과 원근 dormant H·zero lensShift를 실제 renderer와 동일하게 처리한다", async () => {
    const input = { camera: view({ position: [0, 12, 0], target: [0, 0, 0], up: undefined, orthographicHeight: 8, lensShift: [0, 0] }), aspectRatio: 1 };
    const prepared = prepare(input), result = finalizeStudioBg3dSceneGlbCamera(await exported(prepared), prepared);
    if (!result.ok) throw Error(result.messageKo); expectProjectionAndPose(await loaded(result.value), reference(input));
  });

  it("취소를 준비·최종화 전에 확인하며 원본 카메라와 GLB를 바꾸지 않는다", async () => {
    const controller = new AbortController(), input = { camera: view(), aspectRatio: 1 }, snapshot = structuredClone(input);
    const prepared = prepare(input), bytes = await exported(prepared), saved = Uint8Array.from(bytes); controller.abort();
    expect(createStudioBg3dSceneGlbCamera({ ...input, signal: controller.signal })).toMatchObject({ ok: false, code: "aborted" });
    expect(finalizeStudioBg3dSceneGlbCamera(bytes, prepared, controller.signal)).toMatchObject({ ok: false, code: "aborted" });
    expect(input).toEqual(snapshot); expect(bytes).toEqual(saved);
  });

  const tamperKinds = ["missing-marker", "duplicate-marker", "nested", "translation", "intrinsic", "shared-camera"];
  it.each(tamperKinds)("%s 결과는 다른 카메라를 대신 보정하지 않고 거부한다", async (kind) => {
    const prepared = prepare({ camera: view(), aspectRatio: 1 }), parsed = readStudioVrmExportGlb(await exported(prepared));
    if (!Array.isArray(parsed.json.nodes)) throw Error("노드 필요");
    const nodes: unknown[] = parsed.json.nodes;
    const node = record(nodes.find((item: unknown) => typeof record(item).camera === "number"));
    if (kind === "missing-marker") delete node.extras;
    if (kind === "duplicate-marker") nodes.push({ ...node, camera: 1 });
    if (kind === "nested") nodes.push({ children: [nodes.indexOf(node)] });
    if (kind === "translation") node.matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50, 0, 0, 1];
    if (kind === "intrinsic") record(record(first(parsed.json.cameras)).perspective).yfov = 1;
    if (kind === "shared-camera") nodes.push({ camera: node.camera });
    expect(finalizeStudioBg3dSceneGlbCamera(writeStudioVrmExportGlb({ json: parsed.json, binary: parsed.binary }), prepared)).toMatchObject({ ok: false, code: "camera-mismatch" });
  });

  it("등록되지 않은 준비 사본·변경된 zoom·깨진 GLB·과대 JSON을 거부한다", async () => {
    const prepared = prepare({ camera: view(), aspectRatio: 1 }), bytes = await exported(prepared);
    expect(finalizeStudioBg3dSceneGlbCamera(bytes, { ...prepared })).toMatchObject({ ok: false, code: "camera-mismatch" });
    expect(finalizeStudioBg3dSceneGlbCamera(new Uint8Array(8), prepared)).toMatchObject({ ok: false, code: "invalid-glb" });
    const oversized = Uint8Array.from(bytes); new DataView(oversized.buffer).setUint32(12, STUDIO_BG3D_GLB_MAX_JSON_BYTES + 4, true);
    expect(finalizeStudioBg3dSceneGlbCamera(oversized, prepared)).toMatchObject({ ok: false, code: "invalid-glb" });
    prepared.camera.zoom = 2;
    expect(finalizeStudioBg3dSceneGlbCamera(bytes, prepared)).toMatchObject({ ok: false, code: "camera-mismatch" });
  });
});
