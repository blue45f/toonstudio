import { parseSkp } from "openskp";
import { Euler, Group, Matrix4, Quaternion, Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { applyStudioBg3dSkpSourceCamera } from "./studio-bg3d-skp-camera-restore-command";
import { extractStudioBg3dSkpSceneManifest } from "./studio-bg3d-skp-scene-manifest";
import { createStudioBg3dSkpSceneSourceVffBytes } from "./studio-bg3d-skp-scene-source.test-fixture";
import { studioBg3dSkpGeometryTransform } from "./studio-bg3d-skp-scene-source";
import { inspectStudioBg3dSkpSourceSelection } from "./studio-bg3d-skp-source-read-command";
import { createStudioBg3dWorkbenchHostPorts } from "./studio-bg3d-workbench-host-ports";
import { createDefaultStudioBg3dSceneDocument, normalizeStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSkpSceneSource } from "./studio-bg3d-skp-scene-source";
import type { StudioBg3dThreeHierarchyEntity } from "./studio-bg3d-three-hierarchy";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-metadata";

function availableSource(): Extract<StudioBg3dSkpSceneSource, { readonly status: "available" }> {
  const bytes = new Uint8Array(createStudioBg3dSkpSceneSourceVffBytes());
  const manifest = extractStudioBg3dSkpSceneManifest(parseSkp(bytes.buffer));
  if (!manifest.ok) throw new Error(manifest.detail);
  return { version: 1, status: "available", manifest: manifest.value, reason: null, geometryTransform: studioBg3dSkpGeometryTransform() };
}

function fixture(source = availableSource()) {
  const root = new Group();
  root.userData.toonstudioSkpSceneSource = source;
  root.scale.setScalar(0.2);
  const model: BgCustomModelInstance = {
    id: "instance", modelId: "storage", position: [0, 0, 0], rotation: [0, 0, 0], scale: [5, 5, 5],
  };
  const view: StudioBg3dCameraSettings = { position: [8, 6, 8], target: [0, 0, 0], fovDegrees: 52, nearClip: 0.1, zoom: 2, lensShift: [0.2, -0.1] };
  let camera = view;
  const commit = vi.fn((patch: (current: StudioBg3dCameraSettings) => Partial<StudioBg3dCameraSettings>) => {
    camera = { ...camera, ...patch(camera) };
    return true;
  });
  const models = [model], primitives: BgPrimitive[] = [];
  const host = {
    open: true, modelRenderer: {}, addGeneratedParts: vi.fn(() => false as const),
    selectedIdsRef: { current: new Set([model.id]) }, selectedIds: new Set([model.id]),
    physicsRuntimeSourceRef: { current: { primitives, customModels: models } },
    modelRootCacheRef: { current: new Map([[model.modelId, { root }]]) },
    viewportApiRef: { current: { readView: () => camera } },
    cameraLensInteractionLocked: vi.fn(() => false), updateCameraLens: commit,
  };
  const page = source.manifest.pages.items.find(({ parallel }) => parallel);
  if (!page) throw new Error("평행 Page가 없습니다.");
  const scopeKey = inspectStudioBg3dSkpSourceSelection(host).scopeKey;
  if (!scopeKey) throw new Error("선택이 없습니다.");
  return { host, model, root, source, page, view, commit, request: { scopeKey, pageKey: page.key }, camera: () => camera };
}

function closeTuple(actual: readonly number[], expected: readonly number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index] ?? NaN, 10));
}

describe("실제 선택 SKP의 파서 평행 카메라 적용", () => {
  it("실제 VFF Page의 인치·Z-up을 최종 미터·Y-up으로 변환하고 캐시·인스턴스 역배율을 한 번씩만 적용한다", () => {
    const f = fixture(), before = JSON.stringify(f.source);
    const result = applyStudioBg3dSkpSourceCamera(f.host, f.request);
    expect(result).toMatchObject({ ok: true, pageName: "평행 컷" });
    expect(f.commit).toHaveBeenCalledTimes(1);
    closeTuple(f.camera().position, [0, 12.7, 0]);
    closeTuple(f.camera().target, [0.254, 0.762, -0.508]);
    expect(f.camera().orthographicHeight).toBeCloseTo(3.6576, 10);
    expect(f.camera()).toMatchObject({ projection: "orthographic", zoom: 1, lensShift: [0, 0], fovDegrees: 52, nearClip: 0.1 });
    const direction = new Vector3(...f.camera().target).sub(new Vector3(...f.camera().position)).normalize();
    expect(new Vector3(...(f.camera().up ?? [0, 1, 0])).dot(direction)).toBeCloseTo(0, 12);
    expect(JSON.stringify(f.source)).toBe(before);
    expect(f.host.selectedIdsRef.current).toEqual(new Set(["instance"]));
  });

  it("중첩 균일 변환과 캐시 루트 이동·회전을 실제 월드 좌표와 같은 순서로 적용한다", () => {
    const f = fixture();
    const parent: BgPrimitive = { id: "parent", kind: "box", color: "#777777", position: [10, 2, -3], rotation: [0, Math.PI / 2, 0], scale: [2, 2, 2] };
    f.host.physicsRuntimeSourceRef.current.primitives.push(parent);
    f.host.physicsRuntimeSourceRef.current.customModels[0] = { ...f.model, parentId: parent.id, position: [1, 0, 0] };
    f.root.position.set(0.3, 0.4, 0.5); f.root.rotation.set(0.1, 0, 0);
    const compose = (entity: StudioBg3dThreeHierarchyEntity) => new Matrix4().compose(new Vector3(...entity.position), new Quaternion().setFromEuler(new Euler(...entity.rotation)), new Vector3(...entity.scale));
    const model = f.host.physicsRuntimeSourceRef.current.customModels[0];
    if (!model) throw new Error("모델이 없습니다.");
    const matrix = compose(parent).multiply(compose(model)).multiply(new Matrix4().compose(f.root.position, f.root.quaternion, f.root.scale));
    const expected = new Vector3(0, 12.7, 0).applyMatrix4(matrix);
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request).ok).toBe(true);
    closeTuple(f.camera().position, expected.toArray());
    expect(f.camera().orthographicHeight).toBeCloseTo(7.3152, 10);
  });

  it("사용자가 선택한 m 단위와 형상만 감싼 단위 노드의 배율을 중복하지 않는다", () => {
    const source = availableSource();
    const f = fixture({ ...source, geometryTransform: studioBg3dSkpGeometryTransform("m", true) });
    const unitNode = new Group(); unitNode.name = "SKP_unit_scale"; unitNode.scale.setScalar(1 / 0.0254); f.root.add(unitNode);
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request).ok).toBe(true);
    closeTuple(f.camera().position, [0, 500, 0]);
    expect(f.camera().orthographicHeight).toBe(144);
  });

  it("실제 workbench 지연 포트도 같은 명령을 호출한다", async () => {
    const f = fixture();
    const ports = createStudioBg3dWorkbenchHostPorts(f.host);
    expect(await ports.onApplySkpSourceCamera?.(f.request)).toMatchObject({ ok: true, pageName: "평행 컷" });
    expect(f.commit).toHaveBeenCalledTimes(1);
  });

  it("원근 FOV 기준 미노출과 존재하지 않는 Page를 거부한다", () => {
    const f = fixture(), page = f.source.manifest.pages.items.find(({ parallel }) => !parallel);
    for (const pageKey of [page?.key ?? "missing", "absent"]) expect(applyStudioBg3dSkpSourceCamera(f.host, { ...f.request, pageKey })).toMatchObject({ ok: false, code: "unsupported-camera" });
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("현재 선택·캐시·원본 출처·편집 잠금이 달라지면 변경을 시작하지 않는다", () => {
    const f = fixture();
    f.host.selectedIdsRef.current = new Set(["other"]);
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "selection-changed" });
    f.host.selectedIdsRef.current = new Set(["instance"]);
    f.host.cameraLensInteractionLocked.mockReturnValue(true);
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "unavailable" });
    f.host.cameraLensInteractionLocked.mockReturnValue(false);
    delete f.root.userData.toonstudioSkpSceneSource;
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "source-unavailable" });
    f.root.userData.toonstudioSkpSceneSource = { invalid: true };
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "source-unavailable" });
    f.host.modelRootCacheRef.current.clear();
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "source-unavailable" });
    expect(f.commit).not.toHaveBeenCalled();
  });

  it.each([[5, 6, 5], [-5, 5, 5], [0, 0, 0]] as const)("표현할 수 없는 배율 %j를 임의 보정하지 않는다", (x, y, z) => {
    const f = fixture();
    f.host.physicsRuntimeSourceRef.current.customModels[0] = { ...f.model, scale: [x, y, z] };
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "unsupported-transform" });
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("전단이 생기는 중첩 변환과 순환 부모를 거부한다", () => {
    const f = fixture();
    const parent: BgPrimitive = { id: "parent", kind: "box", color: "#777777", position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 2, 1] };
    f.host.physicsRuntimeSourceRef.current.primitives.push(parent);
    f.host.physicsRuntimeSourceRef.current.customModels[0] = { ...f.model, parentId: parent.id, rotation: [0, 0, Math.PI / 4] };
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "unsupported-transform" });
    f.host.physicsRuntimeSourceRef.current.customModels[0] = { ...f.model, parentId: f.model.id };
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "unsupported-transform" });
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("벗어난 카메라 위치·높이와 평행한 up을 clamp하지 않고 거부한다", () => {
    for (const patch of [{ eye: [1e9, 0, 0] }, { orthoHeight: 0 }, { orthoHeight: 1e9 }, { target: [0, 0, 500] }, { up: [0, 0, 0] }]) {
      const f = fixture();
      f.root.userData.toonstudioSkpSceneSource = { ...f.source, manifest: { ...f.source.manifest, pages: { ...f.source.manifest.pages,
        items: f.source.manifest.pages.items.map((page) => page.key === f.page.key ? { ...page, ...patch } : page) } } };
      expect(applyStudioBg3dSkpSourceCamera(f.host, f.request).ok).toBe(false);
      expect(f.commit).not.toHaveBeenCalled();
    }
  });

  it("공식 카메라 명령의 false를 성공으로 바꾸지 않는다", () => {
    const f = fixture(); f.commit.mockReturnValue(false);
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "commit-rejected" });
    expect(f.camera()).toEqual(f.view);
  });

  it("유효한 최소 모델 배율이라도 canonical이 eye를 대체할 만큼 가까운 원본 카메라는 거부한다", () => {
    const f = fixture();
    f.host.physicsRuntimeSourceRef.current.customModels[0] = { ...f.model, scale: [0.001, 0.001, 0.001] };
    f.commit.mockImplementation((patch) => {
      const base = createDefaultStudioBg3dSceneDocument();
      const canonical = normalizeStudioBg3dSceneDocument({ ...base, camera: { ...f.view, ...patch(f.view) } });
      expect(canonical.camera.position).toEqual(patch(f.view).position);
      return true;
    });
    expect(applyStudioBg3dSkpSourceCamera(f.host, f.request)).toMatchObject({ ok: false, code: "invalid-camera" });
    expect(f.commit).not.toHaveBeenCalled();
  });

  it("실제 OrbitControls의 near 기반 최소 거리·최대 거리에서 eye가 이동될 카메라를 거부한다", () => {
    const near = fixture();
    near.host.physicsRuntimeSourceRef.current.customModels[0] = { ...near.model, scale: [0.02, 0.02, 0.02] };
    expect(applyStudioBg3dSkpSourceCamera(near.host, near.request)).toMatchObject({ ok: false, code: "invalid-camera" });
    expect(near.commit).not.toHaveBeenCalled();
    const far = fixture();
    far.root.userData.toonstudioSkpSceneSource = { ...far.source, manifest: { ...far.source.manifest, pages: { ...far.source.manifest.pages,
      items: far.source.manifest.pages.items.map((page) => page.key === far.page.key ? { ...page, eye: [0, 0, 350000], target: [0, 0, -350000], up: [0, 1, 0] } : page) } } };
    expect(applyStudioBg3dSkpSourceCamera(far.host, far.request)).toMatchObject({ ok: false, code: "invalid-camera" });
    expect(far.commit).not.toHaveBeenCalled();
  });
});
