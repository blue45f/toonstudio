import { MToonMaterial, type VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { isStudioVrmMtoonMaterial } from "./studio-vrm-mtoon-brand";
import {
  VROID_BODY_PROPORTION_PRESETS,
  VROID_EYE_HIGHLIGHT_STYLES,
  VROID_FACE_PARAMETER_SPECS,
  VROID_HAIR_GROUP_SPECS,
  VROID_HAIR_PALETTE_PRESETS,
  VROID_LOOKAT_PRESETS,
  VROID_OUTFIT_PALETTE_PRESETS,
  VROID_OUTFIT_PATTERN_SPECS,
  VROID_VRM1_EXPRESSION_PRESETS,
  applyVroidFaceMorphTargets,
  buildVroidBodyProportionPlan,
  buildVroidHairGroupMeshBundle,
  buildVroidHairStrandGroupGeometry,
  buildVroidToBg3dHandoffPayload,
  computeVroidDuoHeightDifference,
  formatOklchCss,
  oklchToHexColorString,
  oklchToSrgb,
  resolveVroidExpressionAndLookAtState,
  synthesizeVroidOutfitTextureSpec,
} from "./studio-vroid-atelier-engine";

function createMockVrm(): { readonly vrm: VRM; readonly originalHairMesh: THREE.Mesh; readonly faceMesh: THREE.Mesh } {
  const scene = new THREE.Group();
  scene.name = "MockVrmScene";

  const bodyMat = new MToonMaterial({
    color: new THREE.Color(0.95, 0.85, 0.8),
    shadeColorFactor: new THREE.Color(0.75, 0.65, 0.68),
    shadingToonyFactor: 0.91,
    shadingShiftFactor: -0.12,
    outlineWidthMode: "worldCoordinates",
    outlineWidthFactor: 0.0021,
  });
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.25), bodyMat);
  bodyMesh.name = "Body_Main";

  const faceMat = new MToonMaterial({
    color: new THREE.Color(0.96, 0.88, 0.82),
    shadingToonyFactor: 0.91,
    shadingShiftFactor: -0.12,
  });
  faceMat.name = "Face_Skin_MToon";
  const faceMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 12), faceMat);
  faceMesh.name = "Face_Mesh";
  faceMesh.morphTargetDictionary = {
    Fcl_EYE_Size_Big: 0,
    Fcl_EAR_Elf_Pointy: 1,
    Fcl_BRW_Arch_High: 2,
  };
  faceMesh.morphTargetInfluences = [0, 0, 0];

  const originalHairMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new MToonMaterial({ color: new THREE.Color(0.2, 0.2, 0.25) }),
  );
  originalHairMesh.name = "Hair_Original_Mesh";

  scene.add(bodyMesh, faceMesh, originalHairMesh);
  return {
    vrm: { scene } as unknown as VRM,
    originalHairMesh,
    faceMesh,
  };
}

describe("studio-vroid-atelier-engine", () => {
  it("OKLCH 변환기가 유효한 sRGB·HEX·CSS 문자열을 결정론적으로 생성한다", () => {
    const srgb = oklchToSrgb({ l: 0.78, c: 0.1, h: 350 });
    expect(srgb.r).toBeGreaterThan(0.5);
    expect(srgb.g).toBeGreaterThanOrEqual(0);
    expect(srgb.b).toBeLessThanOrEqual(1);
    expect(oklchToHexColorString({ l: 0.78, c: 0.1, h: 350 })).toMatch(/^#[0-9a-f]{6}$/);
    expect(formatOklchCss({ l: 0.78, c: 0.1, h: 350 })).toBe("oklch(78.0% 0.100 350.0)");
  });

  it("6개 프로시저럴 헤어 그룹 모두 용접 법선·엔젤링 UV·SpringBone 물리를 포함한 유효한 리본 메시를 생성한다", () => {
    expect(VROID_HAIR_GROUP_SPECS).toHaveLength(6);

    for (const spec of VROID_HAIR_GROUP_SPECS) {
      const built = buildVroidHairStrandGroupGeometry({
        group: spec.kind,
        palette: VROID_HAIR_PALETTE_PRESETS[1],
      });

      expect(built.strandCount).toBe(spec.defaultStrandCount);
      expect(built.vertexCount).toBeGreaterThan(40);
      expect(built.triangleCount).toBeGreaterThan(40);
      expect(built.geometry.getAttribute("uv")).toBeTruthy();
      expect(built.geometry.getAttribute("uv1")).toBeTruthy();
      expect(built.geometry.getAttribute("color")).toBeTruthy();
      expect(built.outlineGeometry.getAttribute("normal")).toBeTruthy();

      const normals = built.geometry.getAttribute("normal");
      expect(normals).toBeTruthy();
      for (let i = 0; i < normals.count; i += 1) {
        const len = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
        expect(Number.isFinite(len)).toBe(true);
        expect(len).toBeGreaterThan(0.95);
        expect(len).toBeLessThan(1.05);
      }

      expect(built.springBone.hitRadius).toBeGreaterThanOrEqual(0.015);
      expect(built.springBone.stiffness).toBeGreaterThan(0.1);
      expect(built.springBone.dragForce).toBeGreaterThan(0.05);
      built.dispose();
    }
  });

  it("커스텀 헤어 번들은 VRM 본체 MToon 프로파일을 동기화하고 이중 헤어를 차단하며 dispose 시 모든 GPU 자원을 해제·원복한다", () => {
    const { vrm, originalHairMesh } = createMockVrm();
    expect(originalHairMesh.visible).toBe(true);

    const bundle = buildVroidHairGroupMeshBundle(
      { group: "twintail", palette: VROID_HAIR_PALETTE_PRESETS[2], replaceOriginalHair: true },
      vrm,
    );

    expect(bundle.hiddenOriginalHairCount).toBe(1);
    expect(originalHairMesh.visible).toBe(false);
    expect(isStudioVrmMtoonMaterial(bundle.mainMesh.material as { isMToonMaterial?: boolean })).toBe(true);
    expect(isStudioVrmMtoonMaterial(bundle.outlineMesh.material as { isMToonMaterial?: boolean })).toBe(true);
    expect(bundle.mtoonProfile.shadingToonyFactor).toBeCloseTo(0.91, 2);

    const mainGeoDispose = vi.spyOn(bundle.mainMesh.geometry, "dispose");
    const outlineGeoDispose = vi.spyOn(bundle.outlineMesh.geometry, "dispose");
    const mainMatDispose = vi.spyOn(bundle.mainMesh.material as THREE.Material, "dispose");
    const outlineMatDispose = vi.spyOn(bundle.outlineMesh.material as THREE.Material, "dispose");

    bundle.dispose();

    expect(mainGeoDispose).toHaveBeenCalledTimes(1);
    expect(outlineGeoDispose).toHaveBeenCalledTimes(1);
    expect(mainMatDispose).toHaveBeenCalledTimes(1);
    expect(outlineMatDispose).toHaveBeenCalledTimes(1);
    expect(originalHairMesh.visible).toBe(true);
  });

  it("얼굴 정밀 파라미터 36종과 동공 하이라이트 5종을 BlendShape·머티리얼 텍스처 파라미터로 변환해 VRM에 적용한다", () => {
    expect(VROID_FACE_PARAMETER_SPECS).toHaveLength(36);
    expect(VROID_EYE_HIGHLIGHT_STYLES).toHaveLength(5);

    const { vrm, faceMesh } = createMockVrm();
    const result = applyVroidFaceMorphTargets(
      {
        eyeSize: 0.65,
        elfEarPoint: 0.85,
        browArch: 0.5,
        pupilHighlightStyle: 2,
        blushIntensity: 0.72,
        eyelinerThickness: 0.68,
        eyelinerWingAngle: 0.4,
      },
      vrm,
    );

    expect(Object.keys(result.values)).toHaveLength(36);
    expect(result.blendShapeWeights.Fcl_EYE_Size_Big).toBeCloseTo(0.65, 3);
    expect(result.blendShapeWeights.Fcl_EAR_Elf_Pointy).toBeCloseTo(0.85, 3);
    expect(result.semanticMorphs.eyeSize).toBeCloseTo(0.65, 3);
    expect(result.materialTextureParams.highlightStyle.id).toBe("starlight-ring");
    expect(result.materialTextureParams.blushIntensity).toBeCloseTo(0.72, 3);
    expect(result.materialTextureParams.eyelinerThickness).toBeCloseTo(0.68, 3);

    expect(result.appliedMorphCount).toBe(3);
    expect(faceMesh.morphTargetInfluences?.[0]).toBeCloseTo(0.65, 3);
    expect(faceMesh.morphTargetInfluences?.[1]).toBeCloseTo(0.85, 3);
    expect(result.updatedMaterialCount).toBeGreaterThanOrEqual(1);
    expect((faceMesh.material as THREE.Material).userData.vroidFaceTextureParams).toEqual(result.materialTextureParams);
  });

  it("4종 바디 등신대 프리셋(SD 3.5 · 학원 6.5 · 로판 7.5 · 액션 8.5)은 전단 오류 0건이며 2인 신장차를 정확히 계산한다", () => {
    expect(VROID_BODY_PROPORTION_PRESETS.map((p) => p.id)).toEqual([
      "sd-3.5",
      "academy-6.5",
      "rofan-7.5",
      "action-8.5",
    ]);

    const plans = VROID_BODY_PROPORTION_PRESETS.map((p) => buildVroidBodyProportionPlan(p.id));
    for (const plan of plans) {
      expect(plan.validationIssues).toHaveLength(0);
      expect(plan.metrics.headUnits).toBeCloseTo(plan.preset.targetHeadUnits, 1);
      expect(Object.keys(plan.boneScaleMap).length).toBeGreaterThan(10);
    }

    const sdPlan = plans[0]!;
    const actionPlan = plans[3]!;
    expect(actionPlan.heightCm).toBeGreaterThan(sdPlan.heightCm);

    const diff = computeVroidDuoHeightDifference({
      actorAHeightCm: 186,
      actorBHeightCm: 162,
      spacingMeters: 0.7,
    });
    expect(diff.heightDiffCm).toBe(24);
    expect(diff.tallerActor).toBe("A");
    expect(diff.actorAGazePitchDeg).toBeLessThan(0);
    expect(diff.actorBGazePitchDeg).toBeGreaterThan(0);
    expect(diff.summaryKo).toContain("24cm");
  });

  it("레이어드 의상 텍스처 믹서가 5종 패턴·3색 OKLCH를 안전하게 합성하고 MToon 하모나이즈·해제를 완결한다", () => {
    expect(VROID_OUTFIT_PATTERN_SPECS).toHaveLength(5);
    const palette = VROID_OUTFIT_PALETTE_PRESETS[0]!.palette;

    const solidSynth = synthesizeVroidOutfitTextureSpec({
      resolution: 64,
      layers: [{ layer: "top", visible: true, pattern: "solid", palette }],
    });
    const checkSynth = synthesizeVroidOutfitTextureSpec({
      resolution: 64,
      layers: [
        { layer: "top", visible: true, pattern: "check", palette },
        { layer: "bottom", visible: true, pattern: "stripe", palette: VROID_OUTFIT_PALETTE_PRESETS[1]!.palette },
        { layer: "outer", visible: true, pattern: "lace", palette: VROID_OUTFIT_PALETTE_PRESETS[2]!.palette },
      ],
    });

    expect(checkSynth.rgba.byteLength).toBe(64 * 64 * 4);
    expect(checkSynth.dataTexture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(checkSynth.activeLayers).toEqual(["top", "bottom", "outer"]);
    // 패턴 합성 결과가 단색(solid)과 실제로 다른 픽셀을 생성해야 한다.
    let diffPixels = 0;
    for (let i = 0; i < checkSynth.rgba.length; i += 4) {
      if (checkSynth.rgba[i] !== solidSynth.rgba[i] || checkSynth.rgba[i + 1] !== solidSynth.rgba[i + 1]) {
        diffPixels += 1;
      }
    }
    expect(diffPixels).toBeGreaterThan(100);

    // PBR 의상 메시에 적용 시 MToon으로 비파괴 통합되고 cleanup 시 원본 복구
    const { vrm } = createMockVrm();
    const garmentMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.5, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x334466, roughness: 0.7 }),
    );
    const originalMat = garmentMesh.material;
    const undo = checkSynth.applyToMesh(garmentMesh, vrm);
    expect(isStudioVrmMtoonMaterial(garmentMesh.material as { isMToonMaterial?: boolean })).toBe(true);
    undo();
    expect(garmentMesh.material).toBe(originalMat);

    const texDispose = vi.spyOn(checkSynth.dataTexture, "dispose");
    checkSynth.dispose();
    solidSynth.dispose();
    expect(texDispose).toHaveBeenCalledTimes(1);
    garmentMesh.geometry.dispose();
    (originalMat as THREE.Material).dispose();
  });

  it("VRM 1.0 표정 18종 · ARKit 립싱크 · LookAt 프리셋과 BG3D 스테이지 전송 페이로드를 표준 규격으로 생성한다", () => {
    expect(VROID_VRM1_EXPRESSION_PRESETS).toHaveLength(18);
    expect(VROID_LOOKAT_PRESETS.length).toBeGreaterThanOrEqual(6);

    const expr = resolveVroidExpressionAndLookAtState({
      emotionWeights: { happy: 0.9 },
      activeViseme: "aa",
      visemeIntensity: 0.8,
      lookAtPresetId: "partner-right",
    });

    expect(Object.keys(expr.vrm1Weights)).toHaveLength(18);
    expect(expr.vrm1Weights.happy).toBeCloseTo(0.9, 3);
    expect(expr.vrm1Weights.aa).toBeCloseTo(0.8, 3);
    expect(expr.vrm1Weights.lookRight).toBeGreaterThan(0.5);
    expect(expr.arkitLipSyncWeights.jawOpen).toBeGreaterThan(0.5);

    const { vrm } = createMockVrm();
    const hair = buildVroidHairGroupMeshBundle({ group: "ponytail" }, vrm);
    const body = buildVroidBodyProportionPlan("rofan-7.5");
    const face = applyVroidFaceMorphTargets({ eyeSize: 0.3, pupilHighlightStyle: 1 }, vrm);

    const payload = buildVroidToBg3dHandoffPayload({
      characterId: "char-rofan-01",
      characterName: "로판 영애 세레나",
      bodyPlan: body,
      hairSpringBones: [hair.springBone],
      faceResult: face,
      expressionState: expr,
      outfitLayers: ["top", "bottom", "outer"],
      mtoonProfile: hair.mtoonProfile,
    });

    expect(payload.schemaVersion).toBe("vroid-bg3d-handoff/1.0");
    expect(payload.targetDomain).toBe("bg3d");
    expect(payload.vrm1Manifest.specVersion).toBe("1.0");
    expect(payload.vrm1Manifest.expressions.presetCount).toBe(18);
    expect(payload.vrm1Manifest.springBone.totalJointChains).toBeGreaterThan(0);
    expect(payload.bg3dStagePlacement.floorGroundedY).toBe(0);
    expect(payload.bg3dStagePlacement.eyeHighlightStyleId).toBe("romance-double-sparkle");
    hair.dispose();
  });
});
