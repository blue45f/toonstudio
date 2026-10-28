import * as THREE from "three";

import { deriveStudioHybridDccMaterialGroups } from "./materials/studio-hybrid-dcc-toon-projection";

export interface StudioHybridDccGeometryResource {
  readonly materialSlots?: readonly number[];
  readonly geometry: THREE.BufferGeometry;
  readonly edges: THREE.EdgesGeometry;
  readonly edgeDetail: "silhouette" | "bounds";
  dispose(): void;
}

export interface StudioHybridDccGeometryResourceInput {
  readonly triangleMaterialSlots?: Float64Array;
  readonly positions: Float32Array;
  readonly indices: Uint32Array;
  readonly normalMode: "flat" | "smooth" | "split";
  readonly cornerNormals?: Float32Array;
  /** 원본 삼각형 순서의 각 코너 UV. 정점 공유를 해제해도 면 선택 순서는 보존한다. */
  readonly cornerUvs?: Float32Array;
}

/** UV 경계에서 위치를 분리해도 smooth 법선은 원본 정점의 이웃 면으로 계산한다. */
export function createStudioHybridDccGeometryResource(
  asset: StudioHybridDccGeometryResourceInput,
  maxDetailedEdgeTriangles = 120_000,
): StudioHybridDccGeometryResource {
  const materialGroups = asset.triangleMaterialSlots === undefined ? undefined
    : deriveStudioHybridDccMaterialGroups(asset.triangleMaterialSlots, asset.indices.length);
  if (asset.cornerUvs && (asset.cornerUvs.length !== asset.indices.length * 2
    || asset.cornerUvs.some((value) => !Number.isFinite(value)))) {
    throw new Error("화면용 UV 코너와 삼각형 개수가 맞지 않거나 좌표가 유한하지 않습니다.");
  }
  if (asset.normalMode === "split" || asset.cornerNormals !== undefined) {
    const normals = asset.cornerNormals;
    if (asset.normalMode === "flat") throw new Error("flat 표시에는 smooth 코너 법선을 함께 지정할 수 없습니다.");
    if (!normals || normals.length !== asset.indices.length * 3) throw new Error("화면용 분리 법선의 코너 수가 잘못됐습니다.");
    for (let index = 0; index < normals.length; index += 3) {
      const length = Math.hypot(normals[index] ?? NaN, normals[index + 1] ?? NaN, normals[index + 2] ?? NaN);
      if (!Number.isFinite(length) || Math.abs(length - 1) > 1e-4) throw new Error("화면용 분리 법선은 유한한 단위 벡터여야 합니다.");
    }
  }
  const indexed = new THREE.BufferGeometry();
  indexed.setAttribute("position", new THREE.BufferAttribute(asset.positions, 3));
  indexed.setIndex(new THREE.BufferAttribute(asset.indices, 1));
  if (asset.normalMode === "smooth" && !asset.cornerNormals) indexed.computeVertexNormals();
  const geometry = asset.normalMode !== "smooth" || asset.cornerUvs || asset.cornerNormals ? indexed.toNonIndexed() : indexed;
  if (geometry !== indexed) indexed.dispose();
  if (asset.cornerUvs) geometry.setAttribute("uv", new THREE.BufferAttribute(asset.cornerUvs, 2));
  if (asset.normalMode === "flat") geometry.computeVertexNormals();
  if (asset.cornerNormals) geometry.setAttribute("normal", new THREE.BufferAttribute(asset.cornerNormals, 3));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (materialGroups) for (const group of materialGroups.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  let edgeDetail: StudioHybridDccGeometryResource["edgeDetail"] = "silhouette";
  let edges: THREE.EdgesGeometry;
  if (asset.indices.length / 3 <= maxDetailedEdgeTriangles) {
    edges = new THREE.EdgesGeometry(geometry, 24);
  } else {
    edgeDetail = "bounds";
    const bounds = geometry.boundingBox;
    const size = bounds?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1);
    const center = bounds?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3();
    const box = new THREE.BoxGeometry(Math.max(size.x, 1e-5), Math.max(size.y, 1e-5), Math.max(size.z, 1e-5));
    box.translate(center.x, center.y, center.z);
    edges = new THREE.EdgesGeometry(box);
    box.dispose();
  }
  return { geometry, edges, edgeDetail, ...(materialGroups ? { materialSlots: materialGroups.materialSlots } : {}), dispose: () => { edges.dispose(); geometry.dispose(); } };
}
