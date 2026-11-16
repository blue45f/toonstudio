import { describe, expect, it } from "vitest";

import {
  hashStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
} from "../studio-editable-half-edge-mesh";

import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import {
  computeStudioHybridDccMeshQualitySummary,
  createStudioHybridDccStarterPrimitiveMesh,
  STUDIO_HYBRID_DCC_BLENDER_V13_KIT,
  STUDIO_HYBRID_DCC_STARTER_PRIMITIVES,
  workspaceAddStarterPrimitive,
} from "./studio-hybrid-dcc-primitives";
import { createStudioHybridDccWorkspace, workspaceUndo } from "./studio-hybrid-dcc-workspace";

describe("studio-hybrid-dcc-primitives", () => {
  it.each(STUDIO_HYBRID_DCC_STARTER_PRIMITIVES.map(({ kind }) => kind))(
    "기본 도형 %s 메시가 직렬화 권위·표면 계획·GLB 2.0 내보내기를 모두 통과한다",
    (kind) => {
      const mesh = createStudioHybridDccStarterPrimitiveMesh(kind);
      const authority = validateStudioEditableMeshSerializableAuthority(mesh);
      expect(authority.ok).toBe(true);

      const summary = computeStudioHybridDccMeshQualitySummary(mesh);
      expect(summary.vertexCount).toBeGreaterThanOrEqual(8);
      expect(summary.faceCount).toBeGreaterThanOrEqual(6);
      expect(summary.triangleEstimate).toBeGreaterThanOrEqual(12);
      expect(summary.dimensions.width).toBeGreaterThan(0);
      expect(summary.dimensions.depth).toBeGreaterThan(0);

      if (kind === "grid") {
        expect(summary.isWatertight).toBe(false);
        expect(summary.boundaryHalfEdgeCount).toBe(16);
      } else {
        expect(summary.isWatertight).toBe(true);
        expect(summary.boundaryHalfEdgeCount).toBe(0);
        expect(summary.dimensions.height).toBeGreaterThan(0);
      }

      const exported = exportStudioHybridDccMeshGlb({
        assetId: `test-${kind}`,
        mesh,
        sourceRevision: 1,
        sourceHash: hashStudioEditableMesh(mesh),
      });
      expect(exported.ok).toBe(true);
    },
  );

  it("작업대에 여러 기본 도형을 연속 추가하고 단일 되돌리기로 복원한다", () => {
    let ws = createStudioHybridDccWorkspace("primitives-doc");
    ws = workspaceAddStarterPrimitive(ws, "sculpt-sphere");
    expect(ws.activeAssetId).toBe("asset-sculpt-sphere");
    ws = workspaceAddStarterPrimitive(ws, "arch");
    expect(ws.activeAssetId).toBe("asset-arch");
    expect(Object.keys(ws.session.state.geometry.records)).toEqual([
      "asset-sculpt-sphere",
      "asset-arch",
    ]);
    expect(ws.session.state.objectTransforms["asset-arch"]?.position[0]).toBeGreaterThan(0);

    const undone = workspaceUndo(ws);
    expect(Object.keys(undone.session.state.geometry.records)).toEqual(["asset-sculpt-sphere"]);
  });

  it("Blender 5.2 CC0 V13 스타터 키트 4종 메타데이터가 정규 경로를 가리킨다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V13_KIT).toHaveLength(4);
    for (const item of STUDIO_HYBRID_DCC_BLENDER_V13_KIT) {
      expect(item.glbUrl).toMatch(/^\/studio-assets\/blender-modeler-kit-v13\/.+\.glb$/u);
      expect(item.previewUrl).toMatch(/^\/studio-assets\/blender-modeler-kit-v13\/thumbnails\/.+\.png$/u);
      expect(item.triangles).toBeGreaterThan(0);
    }
  });
});
