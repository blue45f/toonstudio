/** 선택 면의 표시 삼각형을 실제 공통 surface 표에서 고른다. 원본 코너 수로 fan 크기를 추측하지 않는다. */
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";

import type { StudioHybridDccViewportAssetSnapshot } from "./studio-hybrid-dcc-viewport-snapshot";

type FaceOverlaySource = Pick<StudioHybridDccViewportAssetSnapshot, "mesh" | "positions" | "indices">;

/** 하나라도 대응을 찾지 못하면 부분 overlay 대신 null을 반환한다. 입력과 원본 표시는 변경하지 않는다. */
export function selectStudioHybridDccComponentFaceOverlayIndices(
  asset: FaceOverlaySource,
  faceIds: readonly number[],
): Uint32Array | null {
  const selected = new Set(faceIds);
  if (selected.size === 0 || [...selected].some((id) => !Number.isSafeInteger(id) || id < 0)
    || asset.positions.length === 0 || asset.positions.length % 3 !== 0) return null;
  const inspected = inspectStudioMeshSurfaceForInteractiveProjection(asset.mesh);
  if (!inspected.ok || inspected.value.plan.triangles.length * 3 !== asset.indices.length) return null;
  const matched = new Set<number>(), indices: number[] = [];
  const vertexCount = asset.positions.length / 3;
  for (const [triangleIndex, triangle] of inspected.value.plan.triangles.entries()) {
    if (!selected.has(triangle.faceId)) continue;
    for (let corner = 0; corner < 3; corner++) {
      const index = asset.indices[triangleIndex * 3 + corner];
      if (index === undefined || !Number.isSafeInteger(index) || index < 0 || index >= vertexCount) return null;
      const position = index * 3;
      if (!Number.isFinite(asset.positions[position]) || !Number.isFinite(asset.positions[position + 1])
        || !Number.isFinite(asset.positions[position + 2])) return null;
      indices.push(index);
    }
    matched.add(triangle.faceId);
  }
  return matched.size === selected.size && indices.length > 0 ? Uint32Array.from(indices) : null;
}
