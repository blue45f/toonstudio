import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  buildProceduralHumanoidCharacterGroup,
  captureCompositeStagePasses,
  createCharacterCompositeStage,
  DEFAULT_COMPOSITE_CHARACTER_CAST,
  loadVrmModelViaBridgeIntoSlot,
  MAX_COMPOSITE_STAGE_CHARACTERS,
  resolveWebtoonStageCameraPreset,
  snapCharacterToStageAnchor,
  syncCharacterLightingWithBg3dAtmosphere,
  WEBTOON_STAGE_CAMERA_PRESETS,
  type VrmModelLoaderBridge,
  type VrmSceneLike,
} from "./studio-bg3d-character-composite-engine";
import { STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS } from "./studio-bg3d-lighting-studio";
import {
  buildRichWebtoonScenePreset,
  RICH_SCENE_DENSITY_OPTIONS,
  RICH_WEBTOON_SCENE_PRESETS,
} from "./studio-bg3d-rich-scene-presets";

describe("studio-bg3d-rich-scene-presets (6종 고밀도 웹툰 배경 세트)", () => {
  it("builds all 6 rich webtoon scene presets with watertight manifold geometry, Y=0 grounding, multi-layer details, and safe GPU disposal", () => {
    expect(RICH_WEBTOON_SCENE_PRESETS).toHaveLength(6);

    for (const meta of RICH_WEBTOON_SCENE_PRESETS) {
      const built = buildRichWebtoonScenePreset(meta.id, "rich");
      try {
        expect(built.group.name).toContain(meta.id);
        expect(built.metrics.meshCount).toBeGreaterThanOrEqual(12);
        expect(built.metrics.totalTriangles).toBeGreaterThan(100);
        expect(built.metrics.nonManifoldEdgeCount).toBe(0);
        expect(built.metrics.degenerateTriangleCount).toBe(0);
        expect(built.metrics.isManifold).toBe(true);
        expect(built.metrics.isWatertight).toBe(true);
        expect(built.metrics.isGroundedAtY0).toBe(true);
        expect(Math.abs(built.metrics.boundsMin[1])).toBeLessThanOrEqual(0.002);

        // 다층 환경 디테일 검증(건축·창틀 몰딩·조명·액자/간판·식물·난간·지면 반사·입자)
        expect(built.layerSummary.architectureMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.moldingMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.lightingMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.signageFrameMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.foliageMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.railingMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.groundReflectionMeshes).toBeGreaterThan(0);
        expect(built.layerSummary.atmosphereParticles).toBe(72);

        // 서기·착석·기대기 가구 스냅 앵커 3종 완비
        const kinds = new Set(built.furnitureAnchors.map((a) => a.kind));
        expect(kinds.has("standing")).toBe(true);
        expect(kinds.has("seated")).toBe(true);
        expect(kinds.has("leaning")).toBe(true);
      } finally {
        const disposed = built.dispose();
        expect(disposed.disposedGeometries).toBeGreaterThan(0);
        expect(disposed.disposedMaterials).toBeGreaterThan(0);
        // 2회 호출 시 안전 멱등성
        expect(built.dispose().disposedGeometries).toBe(0);
      }
    }
  });

  it("scales mesh detail and atmosphere particle count strictly across basic -> rich -> ultra densities", () => {
    expect(RICH_SCENE_DENSITY_OPTIONS.map((d) => d.id)).toEqual(["basic", "rich", "ultra"]);
    const basic = buildRichWebtoonScenePreset("seoul-neon-alley", "basic");
    const rich = buildRichWebtoonScenePreset("seoul-neon-alley", "rich");
    const ultra = buildRichWebtoonScenePreset("seoul-neon-alley", "ultra");

    try {
      expect(basic.metrics.totalTriangles).toBeLessThan(rich.metrics.totalTriangles);
      expect(rich.metrics.totalTriangles).toBeLessThan(ultra.metrics.totalTriangles);
      expect(basic.layerSummary.atmosphereParticles).toBeLessThan(rich.layerSummary.atmosphereParticles);
      expect(rich.layerSummary.atmosphereParticles).toBeLessThan(ultra.layerSummary.atmosphereParticles);
      expect(ultra.metrics.isWatertight).toBe(true);
      expect(ultra.metrics.isGroundedAtY0).toBe(true);
    } finally {
      basic.dispose();
      rich.dispose();
      ultra.dispose();
    }
  });
});

describe("studio-bg3d-character-composite-engine (3D 배경↔캐릭터 실시간 합성 스테이지)", () => {
  it("builds procedural articulated humanoid avatars that are manifold, metric-scaled, and grounded at Y=0", () => {
    const profile = DEFAULT_COMPOSITE_CHARACTER_CAST[0]!;
    const group = buildProceduralHumanoidCharacterGroup(profile);
    try {
      expect(group.getObjectByName("bone:hips")).toBeTruthy();
      expect(group.getObjectByName("bone:spine")).toBeTruthy();
      expect(group.getObjectByName("bone:head")).toBeTruthy();
      expect(group.getObjectByName("bone:leftUpperLeg")).toBeTruthy();

      const box = new THREE.Box3().setFromObject(group);
      expect(Math.abs(box.min.y)).toBeLessThanOrEqual(0.002);
      const measuredHeight = box.max.y - box.min.y;
      expect(measuredHeight).toBeGreaterThan(1.45);
      expect(measuredHeight).toBeLessThan(1.85);
    } finally {
      group.traverse((n) => {
        if (n instanceof THREE.Mesh) {
          n.geometry.dispose();
          if (Array.isArray(n.material)) n.material.forEach((m) => m.dispose());
          else n.material.dispose();
        }
      });
    }
  });

  it("supports 1~3 characters, clamps excess count, and snaps cleanly to standing/seated/leaning furniture anchors", () => {
    const stage = createCharacterCompositeStage({
      presetId: "sunlit-atelier-cafe",
      density: "rich",
      characters: [
        ...DEFAULT_COMPOSITE_CHARACTER_CAST,
        { ...DEFAULT_COMPOSITE_CHARACTER_CAST[0]!, id: "char-overflow" },
      ],
    });

    try {
      expect(stage.slots).toHaveLength(MAX_COMPOSITE_STAGE_CHARACTERS);
      for (const slot of stage.slots) {
        expect(slot.manifold.isManifold).toBe(true);
        expect(slot.manifold.nonManifoldEdgeCount).toBe(0);
        expect(slot.manifold.isGroundedAtY0).toBe(true);
      }

      const seatAnchor = stage.backgroundBuild.furnitureAnchors.find((a) => a.kind === "seated")!;
      const leanAnchor = stage.backgroundBuild.furnitureAnchors.find((a) => a.kind === "leaning")!;
      const standAnchor = stage.backgroundBuild.furnitureAnchors.find((a) => a.kind === "standing")!;

      const seatedSlot = snapCharacterToStageAnchor(stage.slots[0]!, seatAnchor, "seated");
      expect(seatedSlot.profile.stance).toBe("seated");
      expect(Math.abs(seatedSlot.groundedMinY)).toBeLessThanOrEqual(0.002);
      expect(seatedSlot.root.getObjectByName("bone:leftUpperLeg")?.rotation.x).toBeLessThan(-1.0);

      const leaningSlot = snapCharacterToStageAnchor(seatedSlot, leanAnchor, "leaning");
      expect(leaningSlot.profile.stance).toBe("leaning");
      expect(Math.abs(leaningSlot.groundedMinY)).toBeLessThanOrEqual(0.002);
      expect(leaningSlot.root.getObjectByName("bone:spine")?.rotation.x).toBeGreaterThan(0.1);

      const standingSlot = snapCharacterToStageAnchor(leaningSlot, standAnchor, "standing");
      expect(standingSlot.profile.stance).toBe("standing");
      expect(Math.abs(standingSlot.groundedMinY)).toBeLessThanOrEqual(0.002);
      expect(standingSlot.root.getObjectByName("bone:leftUpperLeg")?.rotation.x).toBe(0);
    } finally {
      const disposed = stage.dispose();
      expect(disposed.disposedGeometries).toBeGreaterThan(20);
    }
  });

  it("synchronizes all 7 webtoon atmospheres with both VRM MToon materials and procedural character materials", async () => {
    // MToon 호환 속성을 가진 VRM 모의 머티리얼로 브리지 로더 검증
    const mtoonMat = new THREE.MeshStandardMaterial() as THREE.MeshStandardMaterial & {
      shadeColorFactor: THREE.Color;
      shadeShiftFactor: number;
      shadeToonyFactor: number;
      parametricRimColorFactor: THREE.Color;
      parametricRimFresnelPowerFactor: number;
      parametricRimLiftFactor: number;
      outlineWidthFactor: number;
    };
    mtoonMat.shadeColorFactor = new THREE.Color();
    mtoonMat.shadeShiftFactor = 0;
    mtoonMat.shadeToonyFactor = 0.5;
    mtoonMat.parametricRimColorFactor = new THREE.Color();
    mtoonMat.parametricRimFresnelPowerFactor = 2;
    mtoonMat.parametricRimLiftFactor = 0;
    mtoonMat.outlineWidthFactor = 0.001;

    const vrmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.66, 0.28), mtoonMat);
    vrmMesh.position.y = 1.2; // 의도적으로 공중에 띄워 자동 접지(Y=0) 검증
    const vrmGroup = new THREE.Group();
    vrmGroup.add(vrmMesh);
    const fakeVrm: VrmSceneLike = { scene: vrmGroup, materials: [mtoonMat] };
    const bridge: VrmModelLoaderBridge = {
      loadVrmModel: async () => fakeVrm,
    };

    const loaded = await loadVrmModelViaBridgeIntoSlot({
      bridge,
      profile: DEFAULT_COMPOSITE_CHARACTER_CAST[0]!,
      anchor: null,
      atmosphereId: "sunset",
    });

    try {
      expect(loaded.slot.profile.sourceKind).toBe("vrm-bridge");
      expect(Math.abs(loaded.slot.groundedMinY)).toBeLessThanOrEqual(0.002);
      expect(loaded.syncReceipt.isSynced).toBe(true);
      expect(loaded.syncReceipt.syncedMaterialCount).toBeGreaterThanOrEqual(1);

      const receipts = STUDIO_BG3D_WEBTOON_ATMOSPHERE_PRESETS.map((preset) =>
        syncCharacterLightingWithBg3dAtmosphere([loaded.slot.root], preset.id),
      );
      expect(receipts).toHaveLength(7);

      const backlightReceipt = receipts.find((r) => r.parameters.atmosphereId === "backlight")!;
      const snowReceipt = receipts.find((r) => r.parameters.atmosphereId === "snow")!;
      const nightReceipt = receipts.find((r) => r.parameters.atmosphereId === "night")!;
      const rainReceipt = receipts.find((r) => r.parameters.atmosphereId === "rain")!;

      expect(backlightReceipt.parameters.rimLiftFactor).toBeGreaterThan(snowReceipt.parameters.rimLiftFactor);
      expect(backlightReceipt.parameters.outlineWidthPx).toBeGreaterThan(snowReceipt.parameters.outlineWidthPx);
      expect(nightReceipt.parameters.colorTemperatureKelvin).toBeGreaterThan(backlightReceipt.parameters.colorTemperatureKelvin);
      expect(rainReceipt.parameters.fogDensity).toBeGreaterThan(0.6);

      // 마지막으로 적용된 backlight 값이 VRM MToon 머티리얼에 실제 기록됨
      expect(mtoonMat.outlineWidthFactor).toBeCloseTo(backlightReceipt.parameters.outlineWidthFactor, 5);
      expect(mtoonMat.parametricRimLiftFactor).toBeCloseTo(backlightReceipt.parameters.rimLiftFactor, 5);
      expect(mtoonMat.fog).toBe(true);
    } finally {
      const disposed = loaded.dispose();
      expect(disposed.disposedGeometries).toBe(1);
    }
  });

  it("resolves all 5 webtoon stage camera presets and captures synchronized 3-pass composite baked manuscript cut layer", () => {
    expect(WEBTOON_STAGE_CAMERA_PRESETS).toHaveLength(5);
    const stage = createCharacterCompositeStage({
      presetId: "rofan-imperial-banquet",
      density: "rich",
      characters: DEFAULT_COMPOSITE_CHARACTER_CAST.slice(0, 2),
      atmosphereId: "backlight",
      cameraPresetId: "dialogue-ots",
    });

    try {
      const resolvedAll = WEBTOON_STAGE_CAMERA_PRESETS.map((p) =>
        resolveWebtoonStageCameraPreset(p.id, stage.slots.map((s) => s.profile)),
      );
      const lowAngle = resolvedAll.find((c) => c.preset.id === "confrontation-low-angle")!;
      const highAngle = resolvedAll.find((c) => c.preset.id === "high-angle-full-body")!;
      const closeup = resolvedAll.find((c) => c.preset.id === "two-shot-closeup")!;

      expect(lowAngle.position[1]).toBeLessThan(0.8);
      expect(lowAngle.dutchRollDeg).not.toBe(0);
      expect(highAngle.position[1]).toBeGreaterThan(3.0);
      expect(closeup.focalLengthMm).toBe(85);

      const bundle = captureCompositeStagePasses({
        session: stage,
        targetDocumentId: "doc-webtoon-ep12",
        targetCutIndex: 4,
        previewMode: "split-wipe",
        splitWipeRatio: 0.55,
      });

      expect(bundle.characterCount).toBe(2);
      expect(bundle.snapshot.inkPassRef).toMatch(/^data:image\/svg\+xml;charset=utf-8,/u);
      expect(bundle.snapshot.shadedPassRef).toMatch(/^data:image\/svg\+xml;charset=utf-8,/u);
      expect(bundle.snapshot.depthPassRef).toMatch(/^data:image\/svg\+xml;charset=utf-8,/u);
      // 출력 SVG 패스 내 원시 HEX(#) 미사용 검증
      expect(decodeURIComponent(bundle.snapshot.shadedPassRef)).not.toMatch(/#[0-9a-f]{3,6}/iu);

      expect(bundle.bakedLayer.nonDestructive).toBe(true);
      expect(bundle.bakedLayer.targetDocumentId).toBe("doc-webtoon-ep12");
      expect(bundle.bakedLayer.targetCutIndex).toBe(4);
      expect(bundle.bakedLayer.atmospherePresetId).toBe("backlight");
      expect(bundle.bakedLayer.rightsBomAssetIds).toEqual(
        expect.arrayContaining([
          "bg3d:rich-scene:rofan-imperial-banquet:rich",
          "bg3d:avatar:char-seoyeon",
          "bg3d:avatar:char-doyun",
        ]),
      );
    } finally {
      stage.dispose();
    }
  });
});
