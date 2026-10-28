// @vitest-environment jsdom
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { mapStudioHybridDccRayFaceIndex } from "./studio-hybrid-dcc-component-selection";
import { createStudioHybridDccGeometryResource } from "./studio-hybrid-dcc-geometry-resource";
import { workspaceAddActiveModifier } from "./studio-hybrid-dcc-modifier-workspace";
import { createStudioHybridDccUvCheckerTexture } from "./studio-hybrid-dcc-uv-checker-texture";
import { createStudioHybridDccUvSelection, deriveStudioHybridDccUvEditorModel, workspaceTransformUvIslands, workspaceUnwrapUvActive } from "./studio-hybrid-dcc-uv-edit";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceComponentSelectionSource, type StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "./StudioHybridDccViewportCore";

function setup() { return workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("uv-render"), "cube")); }
function asset(workspace: StudioHybridDccWorkspace, forceSource = true) {
  const snapshot = deriveStudioHybridDccViewportSnapshot(workspace, "object", forceSource);
  expect(snapshot.errors).toEqual([]);
  const item = snapshot.assets[0];
  if (!item) throw new Error("UV 표시 자산이 없습니다.");
  return item;
}
function hit(workspace: StudioHybridDccWorkspace) {
  const item = asset(workspace);
  const resource = createStudioHybridDccGeometryResource(item);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  try {
    const object = new THREE.Mesh(resource.geometry, material);
    object.updateMatrixWorld();
    const ray = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
    const result = ray.intersectObject(object)[0];
    const source = workspaceComponentSelectionSource(workspace);
    if (!result?.uv || result.faceIndex === undefined || result.faceIndex === null || !source) throw new Error("실제 UV Raycaster hit가 없습니다.");
    const mapped = mapStudioHybridDccRayFaceIndex(source, result.faceIndex);
    if (!mapped.ok) throw new Error("UV 표시 삼각형을 원본 면에 연결하지 못했습니다.");
    return { uv: result.uv.clone(), faceId: mapped.value.faceId, positions: Array.from(resource.geometry.getAttribute("position").array), normals: Array.from(resource.geometry.getAttribute("normal").array) };
  } finally { material.dispose(); resource.dispose(); }
}

describe("정본 UV와 실제 화면 geometry 연결", () => {
  it("원본 fan 순서의 UV를 BufferAttribute와 Raycaster에 전달한다", () => {
    const workspace = setup();
    const projection = asset(workspace);
    expect(projection.cornerUvs).toHaveLength(12 * 3 * 2);
    const first = hit(workspace);
    const island = deriveStudioHybridDccUvEditorModel(workspace)?.islands.find(({ faceIds }) => faceIds.includes(first.faceId));
    if (!island) throw new Error("선택한 면의 UV 아일랜드가 없습니다.");
    expect(first.uv.x).toBeCloseTo((island.bounds.minU + island.bounds.maxU) / 2, 6);
    expect(first.uv.y).toBeCloseTo((island.bounds.minV + island.bounds.maxV) / 2, 6);
  });

  it("UV만 옮긴 미리보기는 3D 위치·법선을 유지하고 실제 hit UV와 render hash를 바꾼다", () => {
    const workspace = setup();
    const before = hit(workspace);
    const model = deriveStudioHybridDccUvEditorModel(workspace);
    const island = model?.islands.find(({ faceIds }) => faceIds.includes(before.faceId));
    if (!island) throw new Error("이동할 UV 아일랜드가 없습니다.");
    const preview = workspaceTransformUvIslands(workspace, createStudioHybridDccUvSelection(workspace, [island.id]), { kind: "translate", value: { x: 0.25, y: 0.15 } }).workspace;
    const after = hit(preview);
    expect(after.positions).toEqual(before.positions);
    expect(after.normals).toEqual(before.normals);
    expect(after.faceId).toBe(before.faceId);
    expect(after.uv.x).toBeCloseTo(before.uv.x + 0.25, 6);
    expect(after.uv.y).toBeCloseTo(before.uv.y + 0.15, 6);
    expect(asset(preview).renderHash).not.toBe(asset(workspace).renderHash);
    expect(hit(workspace).uv).toEqual(before.uv);
  });

  it("UV 편집의 source cage에 평가된 Array 위치를 섞지 않는다", async () => {
    const workspace = await workspaceAddActiveModifier(setup(), "array");
    const evaluated = asset(workspace, false);
    const cage = asset(workspace);
    expect(evaluated.renderSource).toBe("modifier-cache");
    expect(evaluated.cornerUvs).toBeUndefined();
    expect(cage.renderSource).toBe("authority-edit-cage");
    expect(cage.triangleCount).toBe(12);
    expect(cage.cornerUvs).toHaveLength(72);
    expect(evaluated.triangleCount).toBe(36);
  });

  it("체크무늬는 UV 범위 밖도 반복하며 외부 이미지 요청을 만들지 않는다", () => {
    const texture = createStudioHybridDccUvCheckerTexture();
    try {
      expect(texture).toBeInstanceOf(THREE.DataTexture);
      expect(texture.wrapS).toBe(THREE.RepeatWrapping);
      expect(texture.wrapT).toBe(THREE.RepeatWrapping);
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(texture.image.width).toBe(64);
      expect(texture.image.height).toBe(64);
    } finally { texture.dispose(); }
  });
});
