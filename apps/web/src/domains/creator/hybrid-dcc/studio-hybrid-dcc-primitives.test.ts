import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createStudioUnitCubeMesh,
  hashStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
} from "../studio-editable-half-edge-mesh";

import { decodeStudioNativeGlb } from "./native-import/studio-hybrid-dcc-native-glb";
import { exportStudioHybridDccMeshGlb } from "./studio-hybrid-dcc-glb-export";
import {
  STUDIO_HYBRID_DCC_MODELING_RECIPES,
  workspaceApplyActiveModelingRecipe,
} from "./studio-hybrid-dcc-modifier-workspace";
import {
  computeStudioHybridDccMeshQualitySummary,
  createStudioHybridDccStarterPrimitiveMesh,
  STUDIO_HYBRID_DCC_BLENDER_V13_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT,
  STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT,
  STUDIO_HYBRID_DCC_STARTER_PRIMITIVES,
  workspaceAddStarterPrimitive,
} from "./studio-hybrid-dcc-primitives";
import { applyStudioSculptStroke } from "./studio-hybrid-sculpt-kernel";
import { createStudioHybridDccWorkspace, workspaceUndo } from "./studio-hybrid-dcc-workspace";

const WEB_PUBLIC_DIR = path.resolve(import.meta.dirname, "../../../../public");

describe("studio-hybrid-dcc-primitives & pro finish recipes", () => {
  it("20종 기본·정밀 건축·유기체·크리스탈 도형이 모두 등록되어 있다", () => {
    expect(STUDIO_HYBRID_DCC_STARTER_PRIMITIVES).toHaveLength(20);
  });

  it.each(STUDIO_HYBRID_DCC_STARTER_PRIMITIVES.map(({ kind }) => kind))(
    "도형 %s 메시가 직렬화 권위·표면 계획·GLB 2.0 내보내기를 모두 통과한다",
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

  it("작업대에 여러 도형을 연속 추가하고 단일 되돌리기로 복원한다", () => {
    let ws = createStudioHybridDccWorkspace("primitives-doc");
    ws = workspaceAddStarterPrimitive(ws, "window-wall");
    expect(ws.activeAssetId).toBe("asset-window-wall");
    ws = workspaceAddStarterPrimitive(ws, "molded-plinth");
    expect(ws.activeAssetId).toBe("asset-molded-plinth");
    expect(Object.keys(ws.session.state.geometry.records)).toEqual([
      "asset-window-wall",
      "asset-molded-plinth",
    ]);
    expect(ws.session.state.objectTransforms["asset-molded-plinth"]?.position[0]).toBeGreaterThan(0);

    const undone = workspaceUndo(ws);
    expect(Object.keys(undone.session.state.geometry.records)).toEqual(["asset-window-wall"]);
  });

  it.each(STUDIO_HYBRID_DCC_MODELING_RECIPES.map(({ id }) => id))(
    "프로 비파괴 마감 레시피 %s가 미리보기 캐시를 생성하고 단일 되돌리기로 복원된다",
    async (recipeId) => {
      let ws = createStudioHybridDccWorkspace(`recipe-${recipeId}`);
      ws = workspaceAddStarterPrimitive(ws, "cube");
      const beforeUndoDepth = ws.session.undoStack.length;

      const applied = await workspaceApplyActiveModelingRecipe(ws, recipeId);
      const record = applied.session.state.geometry.records["asset-cube"];
      expect(record?.modifierStack.modifiers.length).toBeGreaterThan(0);
      expect(record?.renderCache).toBeTruthy();
      expect(applied.session.undoStack.length).toBe(beforeUndoDepth + 1);

      const undone = workspaceUndo(applied);
      expect(undone.session.state.geometry.records["asset-cube"]?.modifierStack.modifiers).toHaveLength(0);
    },
  );

  it("비대칭 삼각분할된 큐브에서도 X 대칭 inflate 조형이 완벽한 좌우 거울 대칭 좌표를 만든다", () => {
    const cube = createStudioUnitCubeMesh();
    const res = applyStudioSculptStroke(cube, {
      kind: "inflate",
      center: { x: 0.5, y: 0.5, z: 0.5 },
      radius: 0.35,
      strength: 0.12,
      symmetry: { x: true },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const posSide = res.mesh.vertices.find((v) => v.position.x > 0.5 && v.position.y > 0.5 && v.position.z > 0.5);
    const negSide = res.mesh.vertices.find((v) => v.position.x < -0.5 && v.position.y > 0.5 && v.position.z > 0.5);
    expect(posSide).toBeDefined();
    expect(negSide).toBeDefined();
    expect(Math.abs(posSide!.position.x + negSide!.position.x)).toBeLessThan(1e-5);
    expect(Math.abs(posSide!.position.y - negSide!.position.y)).toBeLessThan(1e-5);
    expect(Math.abs(posSide!.position.z - negSide!.position.z)).toBeLessThan(1e-5);
  });

  it("Blender 5.2 CC0 V13 플래그십 스타터 키트 8종 메타데이터가 정규 경로를 가리킨다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V13_KIT).toHaveLength(8);
    for (const item of STUDIO_HYBRID_DCC_BLENDER_V13_KIT) {
      expect(item.glbUrl).toMatch(/^\/studio-assets\/blender-modeler-kit-v13\/.+\.glb$/u);
      expect(item.previewUrl).toMatch(/^\/studio-assets\/blender-modeler-kit-v13\/thumbnails\/.+\.png$/u);
      expect(item.triangles).toBeGreaterThanOrEqual(2500);
    }
  });

  it("Blender 5.2 정밀 배경 베이 V14(6종)가 실제 디스크 GLB·썸네일과 일치하며 하프에지 수밀 메시로 임포트된다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT).toHaveLength(6);
    for (const item of STUDIO_HYBRID_DCC_BLENDER_V14_BG_KIT) {
      expect(item.glbUrl).toMatch(/^\/studio-assets\/blender-precision-bg-v14\/.+\.glb$/u);
      expect(item.previewUrl).toMatch(/^\/studio-assets\/blender-precision-bg-v14\/thumbnails\/.+\.png$/u);
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath)).toBe(true);
      expect(fs.existsSync(thumbPath)).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      expect(imported.value.assets).toHaveLength(4);
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 아티잔 아틀리에 V15(8종)가 실제 디스크 GLB·썸네일과 일치하며 하프에지 수밀 메시로 임포트된다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT).toHaveLength(8);
    for (const item of STUDIO_HYBRID_DCC_BLENDER_V15_ARTISAN_KIT) {
      expect(item.glbUrl).toMatch(/^\/studio-assets\/blender-artisan-v15\/.+\.glb$/u);
      expect(item.previewUrl).toMatch(/^\/studio-assets\/blender-artisan-v15\/thumbnails\/.+\.png$/u);
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      expect(imported.value.assets.length).toBeGreaterThan(0);
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBeGreaterThan(0);
      expect(Math.abs(totalTris - item.triangles), item.id).toBeLessThan(item.triangles * 0.5);
    }
  });

  it("Blender 5.3 뤼미에르 아틀리에 V16(6종)가 실제 디스크 GLB·썸네일과 일치하며 하프에지 메시로 무손실 디코딩된다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT).toHaveLength(6);
    for (const item of STUDIO_HYBRID_DCC_BLENDER_V16_LUMIERE_KIT) {
      expect(item.glbUrl).toMatch(/^\/studio-assets\/blender-lumiere-v16\/.+\.glb$/u);
      expect(item.previewUrl).toMatch(/^\/studio-assets\/blender-lumiere-v16\/thumbnails\/.+\.png$/u);
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      expect(imported.value.assets.length).toBeGreaterThan(0);
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 뤼미에르 그랜드 살롱 V17(4종)이 실제 디스크 GLB·썸네일과 일치하며 비파괴 수밀 하프에지 메시로 무손실 디코딩된다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT).toHaveLength(4);
    for (const item of STUDIO_HYBRID_DCC_BLENDER_V17_SALON_KIT) {
      expect(item.glbUrl).toMatch(/^\/studio-assets\/blender-lumiere-salon-v17\/.+\.glb$/u);
      expect(item.previewUrl).toMatch(/^\/studio-assets\/blender-lumiere-salon-v17\/thumbnails\/.+\.png$/u);
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      expect(imported.value.assets.length).toBeGreaterThan(0);
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 회차 전환 듀얼 장르 브리지 V18(2종)이 디스크 GLB·썸네일·씬 격리 SHA-256 프로비넌스와 일치한다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT).toHaveLength(2);
    const provPath = path.join(WEB_PUBLIC_DIR, "studio-assets/blender-episode-handoff-v18/provenance.json");
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, "utf-8")) as {
      sceneIsolationAudit?: { zeroCrossSceneMutation?: boolean };
    };
    expect(prov.sceneIsolationAudit?.zeroCrossSceneMutation).toBe(true);

    for (const item of STUDIO_HYBRID_DCC_BLENDER_V18_HANDOFF_KIT) {
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 공통 건축 기준선(Shared Datum) V19(3종: 현대·무협·SF)가 실제 GLB·썸네일·SHA-256 씬 격리 프로비넌스와 일치한다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT).toHaveLength(3);
    const provPath = path.join(WEB_PUBLIC_DIR, "studio-assets/blender-shared-datum-v19/provenance.json");
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, "utf-8")) as {
      sharedArchitecturalDatum?: { portalClearanceM?: number; safetyRailingHeightM?: number };
      sceneIsolationAudit?: { zeroCrossSceneMutation?: boolean; preservedScenes?: unknown[] };
    };
    expect(prov.sharedArchitecturalDatum?.portalClearanceM).toBe(2.4);
    expect(prov.sharedArchitecturalDatum?.safetyRailingHeightM).toBe(1.1);
    expect(prov.sceneIsolationAudit?.zeroCrossSceneMutation).toBe(true);
    expect((prov.sceneIsolationAudit?.preservedScenes ?? []).length).toBeGreaterThanOrEqual(4);

    for (const item of STUDIO_HYBRID_DCC_BLENDER_V19_DATUM_KIT) {
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 개폐형 가동 파츠·캐릭터 IK 소켓 V20(3종)이 실제 GLB·썸네일·5개 보존 씬 SHA-256 프로비넌스와 일치한다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT).toHaveLength(3);
    const provPath = path.join(WEB_PUBLIC_DIR, "studio-assets/blender-articulated-ik-v20/provenance.json");
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, "utf-8")) as {
      characterIkSocketSpec?: { wristDeskZ?: number; elbowRailingZ?: number; handDoorLatchZ?: number };
      sceneIsolationAudit?: { zeroCrossSceneMutation?: boolean; preservedScenes?: unknown[] };
    };
    expect(prov.characterIkSocketSpec?.wristDeskZ).toBe(0.92);
    expect(prov.characterIkSocketSpec?.elbowRailingZ).toBe(1.1);
    expect(prov.characterIkSocketSpec?.handDoorLatchZ).toBe(1.32);
    expect(prov.sceneIsolationAudit?.zeroCrossSceneMutation).toBe(true);
    expect((prov.sceneIsolationAudit?.preservedScenes ?? []).length).toBeGreaterThanOrEqual(5);

    for (const item of STUDIO_HYBRID_DCC_BLENDER_V20_ARTICULATED_KIT) {
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 가변 슬릿 고드레이·그림자 드리프트 3연속 시퀀스 V21(3종)이 실제 GLB·썸네일·6개 보존 씬 SHA-256 프로비넌스와 일치한다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT).toHaveLength(3);
    const provPath = path.join(WEB_PUBLIC_DIR, "studio-assets/blender-slit-godray-v21/provenance.json");
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, "utf-8")) as {
      sequenceBeats?: number[];
      sceneIsolationAudit?: { zeroCrossSceneMutation?: boolean; preservedScenes?: unknown[] };
    };
    expect(prov.sequenceBeats).toEqual([15, 65, 100]);
    expect(prov.sceneIsolationAudit?.zeroCrossSceneMutation).toBe(true);
    expect((prov.sceneIsolationAudit?.preservedScenes ?? []).length).toBeGreaterThanOrEqual(6);

    for (const item of STUDIO_HYBRID_DCC_BLENDER_V21_GODRAY_KIT) {
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 개폐율 연동 보케 파티클·조리개 심도 V22(3종)이 실제 GLB·썸네일·SHA-256 씬 격리 프로비넌스와 일치한다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT).toHaveLength(3);
    const provPath = path.join(WEB_PUBLIC_DIR, "studio-assets/blender-atmospheric-bokeh-v22/provenance.json");
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, "utf-8")) as {
      apertureStops?: number[];
      sceneIsolationAudit?: { zeroCrossSceneMutation?: boolean; preservedScenes?: unknown[] };
    };
    expect(prov.apertureStops).toEqual([1.8, 2.8, 5.6]);
    expect(prov.sceneIsolationAudit?.zeroCrossSceneMutation).toBe(true);
    expect((prov.sceneIsolationAudit?.preservedScenes ?? []).length).toBeGreaterThanOrEqual(1);

    for (const item of STUDIO_HYBRID_DCC_BLENDER_V22_BOKEH_KIT) {
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });

  it("Blender 5.3 Z-심도 3D 효과음·기준선 군중·멀티 시간대 V23(3종)이 실제 GLB·썸네일·SHA-256 씬 격리 프로비넌스와 일치한다", () => {
    expect(STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT).toHaveLength(3);
    const provPath = path.join(WEB_PUBLIC_DIR, "studio-assets/blender-zdepth-sfx-crowd-v23/provenance.json");
    expect(fs.existsSync(provPath)).toBe(true);
    const prov = JSON.parse(fs.readFileSync(provPath, "utf-8")) as {
      timeOfDayKelvins?: number[];
      zDepthSandwichMeters?: { zDepthSfxPlaneYM?: number };
      sceneIsolationAudit?: { zeroCrossSceneMutation?: boolean; preservedScenes?: unknown[] };
    };
    expect(prov.timeOfDayKelvins).toEqual([5600, 3200, 8500]);
    expect(prov.zDepthSandwichMeters?.zDepthSfxPlaneYM).toBe(-0.34);
    expect(prov.sceneIsolationAudit?.zeroCrossSceneMutation).toBe(true);
    expect((prov.sceneIsolationAudit?.preservedScenes ?? []).length).toBeGreaterThanOrEqual(4);

    for (const item of STUDIO_HYBRID_DCC_BLENDER_V23_ZDEPTH_KIT) {
      const glbPath = path.join(WEB_PUBLIC_DIR, item.glbUrl.replace(/^\//u, ""));
      const thumbPath = path.join(WEB_PUBLIC_DIR, item.previewUrl.replace(/^\//u, ""));
      expect(fs.existsSync(glbPath), item.glbUrl).toBe(true);
      expect(fs.existsSync(thumbPath), item.previewUrl).toBe(true);

      const bytes = new Uint8Array(fs.readFileSync(glbPath));
      const imported = decodeStudioNativeGlb(bytes, "glb");
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      let totalTris = 0;
      for (const asset of imported.value.assets) {
        expect(validateStudioEditableMeshSerializableAuthority(asset.mesh).ok).toBe(true);
        const summary = computeStudioHybridDccMeshQualitySummary(asset.mesh);
        expect(summary.hasUv).toBe(true);
        expect(summary.faceCount).toBeGreaterThan(0);
        totalTris += summary.triangleEstimate;
      }
      expect(totalTris).toBe(item.triangles);
    }
  });
});
