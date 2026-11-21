/**
 * studio-bg3d-blender-sketchup-pro-ops.ts
 *
 * Blender + SketchUp 고급 3D 모델링 연산기 8종 통합 진입점 및 실시간 매니폴드 검증기.
 * - SketchUp 계열 (`./studio-bg3d-sketchup-mesh-ops`):
 *   `extrudeFaceAlongNormal`, `sweepProfileAlongPath`, `sliceGeometryWithSectionPlane`,
 *   `buildComponentArrayTransforms`, `instantiateComponentArrayMesh`
 * - Blender 계열 (`./studio-bg3d-blender-mesh-ops`):
 *   `applyMicroBevelChamfer`, `applySymmetricMirrorGeometry`,
 *   `subdivideGeometrySmooth`, `applyBooleanMeshOperation`
 * - 실시간 매니폴드/트라이앵글 수 검증기: `inspectGeometryTopologyAndManifold`
 */

import type * as THREE from "three";

import { validateBufferGeometryManifold } from "./studio-bg3d-geometry-manifold-utils";
import {
  applyBooleanMeshOperation,
  applyMicroBevelChamfer,
  applySymmetricMirrorGeometry,
  subdivideGeometrySmooth,
} from "./studio-bg3d-blender-mesh-ops";
import {
  buildComponentArrayTransforms,
  extrudeFaceAlongNormal,
  instantiateComponentArrayMesh,
  sliceGeometryWithSectionPlane,
  sweepProfileAlongPath,
  type BooleanOperationKind,
  type ComponentArrayResult,
  type ComponentArrayTransformItem,
  type GeometryTopologyInspection,
  type ModelingAxis,
  type ModelingOperationResult,
  type SectionPlaneSliceResult,
  type SubdivisionScheme,
  type Vec2Tuple,
  type Vec3Tuple,
} from "./studio-bg3d-sketchup-mesh-ops";

export {
  applyBooleanMeshOperation,
  applyMicroBevelChamfer,
  applySymmetricMirrorGeometry,
  buildComponentArrayTransforms,
  extrudeFaceAlongNormal,
  instantiateComponentArrayMesh,
  sliceGeometryWithSectionPlane,
  subdivideGeometrySmooth,
  sweepProfileAlongPath,
  type BooleanOperationKind,
  type ComponentArrayResult,
  type ComponentArrayTransformItem,
  type GeometryTopologyInspection,
  type ModelingAxis,
  type ModelingOperationResult,
  type SectionPlaneSliceResult,
  type SubdivisionScheme,
  type Vec2Tuple,
  type Vec3Tuple,
};

/**
 * 현재 작업 지오메트리의 매니폴드 무결성·트라이앵글 수·접지 상태를 즉시 진단한다.
 */
export function inspectGeometryTopologyAndManifold(
  geometry: THREE.BufferGeometry,
): GeometryTopologyInspection {
  const manifold = validateBufferGeometryManifold(geometry);
  const issues: string[] = [];
  if (manifold.nonManifoldEdgeCount > 0) {
    issues.push(`비다양체 엣지 ${manifold.nonManifoldEdgeCount}개 감지 — 불리언 치유나 베벨 폭 조정이 필요해요.`);
  }
  if (manifold.boundaryEdgeCount > 0) {
    issues.push(`열린 경계 엣지 ${manifold.boundaryEdgeCount}개 — 단면 캡 생성으로 닫힌 솔리드로 복구해 보세요.`);
  }
  if (manifold.degenerateTriangleCount > 0) {
    issues.push(`퇴화 삼각형 ${manifold.degenerateTriangleCount}개 — 정점 용접 정밀도를 확인해 주세요.`);
  }
  if (!manifold.isGroundedAtY0) {
    issues.push(`바닥 높이 Y=${manifold.boundsMin[1]}m — 바닥 접지(Y=0)를 적용해 밀착시켜 주세요.`);
  }

  const statusKo =
    issues.length === 0
      ? `매니폴드 정상 · ${manifold.triangleCount} 트라이앵글 · 바닥 Y=0.000m`
      : `점검 항목 ${issues.length}건 · ${manifold.triangleCount} 트라이앵글`;

  return Object.freeze({
    manifold,
    statusKo,
    issuesKo: Object.freeze(issues),
  });
}
