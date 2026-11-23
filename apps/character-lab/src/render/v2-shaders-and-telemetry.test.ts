/**
 * Wave V2-W3B Character Lab 실 셰이더·외곽선·안구 하이라이트·실측 텔레메트리 100.0/100 통합 검증.
 */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode.js";
import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_SHADING, KIT_V2_ALLOWED_EXTENSIONS } from "../contracts";

import { faceSdfUniforms } from "./face-sdf";
import {
  DEFAULT_OUTLINE_REFERENCE_DISTANCE,
  KIT_HEAD_CONTOUR_WIDTH_SCALE,
  computeColoredLineartRgb,
  computeScreenSpaceOutlineScale,
  contourOutlineAllowed,
  contourOutlineWidthScale,
  kitHeadContourAllowed,
} from "./outline-policy";
import {
  PRESSURE_OUTLINE_FRAGMENT_GLSL,
  PRESSURE_OUTLINE_FRAGMENT_WGSL,
  PRESSURE_OUTLINE_VERTEX_GLSL,
  PRESSURE_OUTLINE_VERTEX_WGSL,
} from "./pressure-outline-shaders";
import { isPressureOutline } from "./pressure-outline-tag";
import { hasEyeballHighlight, hasRenderTelemetry, readRenderTelemetry } from "./render-telemetry";
import { CHARACTER_SHADER_SOURCES, TOON_UNIFORMS } from "./shader-sources";
import { evaluateCharacterLabVerifyAiGate } from "./style/character-verify-ai-fresh-ideas";
import { buildKitFixture } from "./testing/kit-glb-fixture";
import {
  PRESSURE_FACIAL_STENCIL_BIT,
  PRESSURE_HAIR_INLINE_STENCIL_BIT,
  allowedExtensionsForPlan,
  createBareNullScene,
  createNullEngineHarness,
  inspectV2MeshUv1,
  parentRigidMeshToAnchor,
  resolveKitRigPartIdentity,
} from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";
import { evaluateDirectionalBacklightRimGate, evaluateKajiyaKayHairAngelRing, evaluateToon } from "./toon-reference";

import type { KitPlan, ShadingProfile } from "../contracts";
import type { RigBone } from "./testing/null-engine-harness";
import type { Bone } from "@babylonjs/core/Bones/bone.js";
import type { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

function toonPressureProfile(overrides: Partial<ShadingProfile["toon"]> = {}): ShadingProfile {
  return {
    ...DEFAULT_SHADING,
    mode: "toon",
    toon: {
      ...DEFAULT_SHADING.toon,
      rampSteps: 3,
      faceSdfShadow: true,
      outline: "hull",
      rim: true,
      outlinePressure: true,
      ...overrides,
    },
  };
}

describe("Wave V2-W3B: 셰이더·외곽선·실측 텔레메트리 100.0/100", () => {
  it("GLSL·WGSL 툰·필압 외곽선 셰이더가 SDF smoothstep, Cubic MatCap, 역광 림, Kajiya-Kay 엔젤링, 화면거리 보정, 유채색 선화, 정점 테이퍼를 양쪽 언어로 대칭 보유한다", () => {
    expect(TOON_UNIFORMS).toContain("matcapParams");
    expect(TOON_UNIFORMS).toContain("hairSpecParams");

    for (const src of [CHARACTER_SHADER_SOURCES.toon.glsl, CHARACTER_SHADER_SOURCES.toon.wgsl]) {
      expect(src).toContain("fwidth(sdf)");
      expect(src).toContain("smoothstep(");
      expect(src).toContain("computeCubicMatCapRamp(");
      expect(src).toContain("backlightAlign");
      expect(src).toContain("hairSpecParams");
      expect(src).toContain("sinTH");
    }

    for (const src of [PRESSURE_OUTLINE_VERTEX_GLSL, PRESSURE_OUTLINE_VERTEX_WGSL]) {
      expect(src).toContain("screenSpaceCompensation");
      expect(src).toContain("#ifdef TS_OUTLINE_VERTEX_TAPER");
      expect(src).toContain("vertexTaper");
    }

    for (const src of [PRESSURE_OUTLINE_FRAGMENT_GLSL, PRESSURE_OUTLINE_FRAGMENT_WGSL]) {
      expect(src).toContain("outlineColorTint");
      expect(src).toContain("tintedInk");
    }
  });

  it("얼굴 SDF 광원 고도각(pitch) 감쇠가 y=0에서는 기존 XZ 결과를 보존하고 상방 광원에서는 임계값을 부드럽게 감쇠한다", () => {
    const horiz = faceSdfUniforms([0, 0, 1], [1, 0, 0], [1, 0, 0]);
    expect(horiz.pitchAttenuation).toBeCloseTo(1, 6);
    expect(horiz.threshold).toBeCloseTo(0.5, 6);

    const overheadSide = faceSdfUniforms([0, 0, 1], [1, 0, 0], [1, 1.2, 0]);
    expect(overheadSide.pitchAttenuation).toBeLessThan(0.75);
    expect(overheadSide.threshold).toBeLessThan(horiz.threshold);

    const frontHigh = faceSdfUniforms([0, 0, 1], [1, 0, 0], [0, 0.5, 1]);
    expect(frontHigh.fdotl).toBeCloseTo(1, 6);
    expect(frontHigh.threshold).toBeCloseTo(0, 6);
  });

  it("외곽선 정책: 키트 머리 윤곽선, 화면거리 보정, 알베도 유채색 선화 RGB 계산이 결정적으로 동작한다", () => {
    expect(kitHeadContourAllowed("kit", "head")).toBe(true);
    expect(contourOutlineAllowed("package", "head", false)).toBe(false);
    expect(contourOutlineAllowed("package", "head", true)).toBe(true);
    expect(contourOutlineWidthScale("package", "head")).toBe(KIT_HEAD_CONTOUR_WIDTH_SCALE);
    expect(kitHeadContourAllowed("kit", "eyeball")).toBe(false);
    expect(contourOutlineAllowed("kit", "head", true)).toBe(true);
    expect(contourOutlineAllowed("kit", "head", false)).toBe(false);
    expect(contourOutlineWidthScale("kit", "head")).toBe(KIT_HEAD_CONTOUR_WIDTH_SCALE);

    expect(computeScreenSpaceOutlineScale(DEFAULT_OUTLINE_REFERENCE_DISTANCE, DEFAULT_OUTLINE_REFERENCE_DISTANCE, 1)).toBeCloseTo(1, 6);
    expect(computeScreenSpaceOutlineScale(5.2, DEFAULT_OUTLINE_REFERENCE_DISTANCE, 1)).toBeGreaterThan(1.5);
    expect(computeScreenSpaceOutlineScale(5.2, DEFAULT_OUTLINE_REFERENCE_DISTANCE, 0)).toBe(1);

    const base: readonly [number, number, number] = [0.05, 0.04, 0.06];
    expect(computeColoredLineartRgb(base, "#f3d3bd", 0)).toEqual(base);
    const skinInk = computeColoredLineartRgb(base, "#f3d3bd", 1);
    expect(skinInk[0]).toBeGreaterThan(skinInk[2]);
    expect(skinInk[0]).toBeLessThan(0.45);
  });

  it("CPU 툰 참조가 방향성 역광 림 게이트와 Kajiya-Kay 2밴드 헤어 엔젤링 하이라이트를 정확히 계산한다", () => {
    const rimBack = evaluateDirectionalBacklightRimGate([0, 0, 1], [0, 0, 1], [0, 0, -1], 1);
    const rimFront = evaluateDirectionalBacklightRimGate([0, 0, 1], [0, 0, 1], [0, 0, 1], 1);
    expect(rimBack).toBeGreaterThan(0.5);
    expect(rimFront).toBeGreaterThan(0.5);

    const ringPeak = evaluateKajiyaKayHairAngelRing({
      normalW: [0, 0.2, 0.98],
      viewDir: [0, 0, 1],
      lightDir: [0, 0.2, 0.98],
      hairFlowUv: [0.5, 0.58],
      intensity: 0.5,
    });
    const ringOffBand = evaluateKajiyaKayHairAngelRing({
      normalW: [0, 0.2, 0.98],
      viewDir: [0, 0, 1],
      lightDir: [0, 0.2, 0.98],
      hairFlowUv: [0.5, 0.05],
      intensity: 0.5,
    });
    expect(ringPeak).toBeGreaterThan(0.1);
    expect(ringOffBand).toBeCloseTo(0, 6);

    const baseParams = {
      baseColor: [0.5, 0.4, 0.35] as const,
      shadeTint: [0.7, 0.65, 0.72] as const,
      lightColor: [0.8, 0.8, 0.8] as const,
      ambientColor: [0.2, 0.2, 0.2] as const,
      toLight: [0, 0.2, 0.98] as const,
      rimColor: [0.35, 0.35, 0.4] as const,
      rampSteps: 3 as const,
      rim: true,
      faceSdf: false,
      hasPaint: false,
      faceThreshold: 0.5,
      flipU: 0 as const,
      sdfOffset: 0,
      hasAlbedo: false,
    };
    const frag = {
      normalW: [0, 0.2, 0.98] as const,
      positionW: [0, 0, 0] as const,
      cameraPosition: [0, 0, 2] as const,
      uv: [0.5, 0.58] as const,
      albedoTex: [1, 1, 1, 1] as const,
      paint: [0, 0, 0, 0] as const,
      sampleSdf: () => 0.5,
      derivativeWidth: 0.01,
    };
    const withoutRing = evaluateToon(baseParams, frag);
    const withRing = evaluateToon({ ...baseParams, hairAngelRingIntensity: 0.5 }, frag);
    expect(withRing[0]).toBeGreaterThan(withoutRing[0]);
  });

  it("BabylonCharacterEngine이 키트 머리 Stencil-Safe 윤곽선·헤어 인라인 억제·4모드 안구 하이라이트·실측 텔레메트리 100.0/100을 구동한다", async () => {
    const h = await createNullEngineHarness();
    cleanups.push(() => h.dispose());

    // 1) 절차 소스: 모든 실 셰이더 패스가 활성화되면 Verify AI가 조작 없이 100.0/100 달성
    await h.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    const optimal = toonPressureProfile();
    h.engine.setShading(optimal);

    expect(hasRenderTelemetry(h.engine)).toBe(true);
    expect(hasEyeballHighlight(h.engine)).toBe(true);
    const procTelemetry = readRenderTelemetry(h.engine);
    expect(procTelemetry).toMatchObject({
      headContourPassActive: true,
      faceSdfAntiAliased: true,
      kitFaceShadowUvPresent: true,
      cubicMatCapActive: true,
      directionalBacklightRimActive: true,
      hairAngelRingActive: true,
      screenSpaceOutlineCompensation: true,
      coloredLineartActive: true,
      vertexTaperMaskActive: true,
      hairInlineStencilActive: true,
    });

    const procReport = evaluateCharacterLabVerifyAiGate({
      shading: optimal,
      lookId: "shaper-cel",
      delight: true,
      disableHairInline: true,
      renderTelemetry: procTelemetry ?? undefined,
    });
    expect(procReport.overallScore100).toBe(100);
    expect(procReport.turnaroundConsistencyScore100).toBe(100);
    expect(procReport.facialSdfCleanScore100).toBe(100);
    expect(procReport.silhouetteReadabilityScore100).toBe(100);
    expect(procReport.outlineAnisotropyScore100).toBe(100);
    expect(procReport.rightsProvenanceScore100).toBe(100);

    // 2) 4모드 안구 하이라이트 + F10 잠금 검증
    const hlLight = h.engine.setEyeballHighlight({ mode: "light", offsetPos: [12, -6], fixEyeballCam: true });
    expect(hlLight.mode).toBe("light");
    expect(hlLight.fixEyeballCam).toBe(true);
    expect(hlLight.offsetPos).toEqual([12, -6]);
    const hlWorld = h.engine.setEyeballHighlight({ mode: "world", offsetPos: [0, 0], fixEyeballCam: false });
    expect(hlWorld.highlightEulerDeg).toEqual([0, 180, 0]);

    // 3) 키트 소스: 머리 Stencil-Safe 윤곽선(:contour, 0x10) 및 헤어 인라인 억제(0x20) 실측 확인
    const fixture = await buildKitFixture({ partIds: ["hair/soft-bob", "top/tee"] });
    const kitH = await createNullEngineHarness({
      fetchBytes: async (url) => {
        const bytes = fixture.files.get(url);
        if (!bytes) throw new Error(`missing ${url}`);
        return bytes;
      },
    });
    cleanups.push(() => kitH.dispose());
    await kitH.engine.loadSource({ kind: "kit", plan: fixture.plan });
    kitH.engine.setShading(optimal);

    const kitScene = kitH.nullEngine.scenes[0]!;
    const outlines = kitScene.meshes.filter(isPressureOutline) as Mesh[];
    const headContour = outlines.find((mesh) => mesh.name === "pressure-outline:TS_Head:contour");
    expect(headContour).toBeDefined();
    const headMat = headContour?.material as ShaderMaterial;
    expect(headMat.disableDepthWrite).toBe(true);
    expect(headMat.stencil.funcMask).toBe(PRESSURE_FACIAL_STENCIL_BIT);
    expect(headMat.stencil.func).toBe(Constants.EQUAL);

    const hairMeshName = kitH.engine.inspectRig()?.parts.find((part) => part.role === "hair")?.meshNames[0];
    expect(hairMeshName).toBeDefined();
    const hairOutline = outlines.find((mesh) => mesh.name === `pressure-outline:${hairMeshName}`);
    expect(hairOutline).toBeDefined();
    const hairMat = hairOutline?.material as ShaderMaterial;
    expect(hairMat.disableDepthWrite).toBe(true);
    expect(hairMat.stencil.funcMask).toBe(PRESSURE_HAIR_INLINE_STENCIL_BIT);
  });

  it("kit-loader-v2 헬퍼가 강체 앵커 본 페어런팅·다중 레이어/채널 ID 비중복·uv1(hair-flow/pattern)·KHR_mesh_quantization 허용을 수행한다", () => {
    const bare = createBareNullScene();
    cleanups.push(() => bare.dispose());
    const root = new TransformNode("root", bare.scene);
    const headNode = new TransformNode("mixamorig:Head", bare.scene);
    const rigidMesh = new Mesh("TS_Accessory_Ribbon", bare.scene);
    const bones = new Map<string, RigBone>([
      [
        "mixamorig:Head",
        {
          name: "mixamorig:Head",
          humanoid: "head",
          bone: {} as Bone,
          node: headNode,
          parentName: null,
          restLocal: [0, 0, 0, 1],
          restWorld: [0, 0, 0, 1],
          restTranslation: [0, 1.5, 0],
          auxiliary: false,
        },
      ],
    ]);

    const attached = parentRigidMeshToAnchor(
      rigidMesh,
      "head-top",
      {
        manifestVersion: 2,
        base: {
          heightM: 1.65,
          headHeightM: 0.21,
          headsTall: 7.8,
          anchors: { "head-top": { joint: "mixamorig:Head", offsetM: [0, 0.14, 0.02] } },
        },
        files: [],
        materials: {},
      },
      bones,
      root,
    );
    expect(attached).toBe(true);
    expect(rigidMesh.parent).toBe(headNode);
    expect(rigidMesh.position.y).toBeCloseTo(0.14, 5);
    expect(rigidMesh.position.z).toBeCloseTo(0.02, 5);

    const v2PlanStub = { custom: { manifestVersion: 2, base: { heightM: 1.65, headHeightM: 0.21, headsTall: 7.8, anchors: {} }, files: [], materials: {} } } as unknown as KitPlan;
    expect(allowedExtensionsForPlan(v2PlanStub)).toContain(KIT_V2_ALLOWED_EXTENSIONS[0]);

    const existing = new Set<number>([10]);
    const v2FileStub = { id: "outer:coat", kind: "layer" as const, slot: "top" as const, scope: "outer" as const, layer: "outer" as const, instanceId: null, url: "", sha256: "", bytes: 1, meshes: [], hides: [], rigidMeshes: [], defaultAnchor: null, patternUv: true, hairFlowUv: false };
    const idA = resolveKitRigPartIdentity({
      role: "outer",
      materialName: "ts_outer_coat",
      channelKey: "outer",
      partPlan: { id: "outer:coat", kind: "part", slot: "top", url: "", sha256: "", bytes: 1, meshes: [], hides: [], v2File: v2FileStub },
      existingPartIds: existing,
    });
    existing.add(idA.partId);
    const idB = resolveKitRigPartIdentity({
      role: "outer",
      materialName: "ts_outer_trim_coat",
      channelKey: "outer-trim",
      partPlan: { id: "outer:coat", kind: "part", slot: "top", url: "", sha256: "", bytes: 1, meshes: [], hides: [], v2File: v2FileStub },
      existingPartIds: existing,
    });
    expect(idA.partId).not.toBe(idB.partId);
    expect(idA.scope).toBe("outer");

    const hairMesh = new Mesh("TS_Hair_Test", bare.scene);
    hairMesh.setVerticesData("uv2", [0, 0, 1, 0, 0.5, 1]);
    expect(
      inspectV2MeshUv1([hairMesh], {
        node: "TS_Hair_Test",
        role: "hair",
        material: "ts_hair",
        triangles: 1,
        vertices: 3,
        morphs: [],
        uv1: { purpose: "hair-flow" },
      }),
    ).toEqual({ hairFlowUv: true, patternUv: false });
  });
});
