/**
 * Studio 3D 데생 인형 & VRM 스튜디오 — 물리 기반 재질(이진 Metalness·Clearcoat·Sheen),
 * SubD 매끄러운 원주 분할 및 관절구 인터페네트레이션, VRM 헤미스피어 반사광·PBR 무대 정밀도 테스트.
 */
import { isValidElement, type ReactElement, type ReactNode } from "react";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import { VrmLighting } from "../vrm/StudioVrmLighting";
import { resolveStudioMannequinHandPadPose } from "./studio-mannequin-ecorche-anatomy";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_MATERIAL_STYLES,
  buildStudioMannequinSpec,
  type StudioMannequinPrimitiveMaterialRole,
} from "./studio-mannequin-model";
import { createStudioMannequinRestPose } from "./studio-mannequin-poses";
import {
  createStudioMannequinSceneFigure,
  resolveStudioMannequinPickedJoint,
  type StudioMannequinBodyMeshUserData,
  type StudioMannequinFigureMaterials,
} from "./studio-mannequin-scene-figure";
import {
  createStudioMannequinMaterialPalette,
  createStudioMannequinToonGradientTexture,
  disposeStudioMannequinMaterialPalette,
  type StudioMannequinMaterialPalette,
} from "./studio-mannequin-scene-materials";

const PALETTE_ROLES = [
  "body",
  "joint",
  "landmark",
  "eye",
] as const satisfies readonly StudioMannequinPrimitiveMaterialRole[];

function collectReactElements(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const child of node) collectReactElements(child, out);
    return out;
  }
  if (!isValidElement(node)) return out;
  out.push(node);
  const props = node.props as { children?: ReactNode };
  if (props.children !== undefined) {
    collectReactElements(props.children, out);
  }
  return out;
}

function createFigureMaterialsHarness(palette: StudioMannequinMaterialPalette): {
  materials: StudioMannequinFigureMaterials;
  dispose: () => void;
} {
  const selected = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.4, metalness: 0 });
  const handle = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
  const handleGeometry = new THREE.SphereGeometry(1, 20, 14);
  const outline = new THREE.MeshBasicMaterial({ color: 0x0f172a, side: THREE.BackSide });
  return {
    materials: {
      palette: () => palette,
      selected,
      handle,
      handleGeometry,
      outline,
      outlineVisible: (role) => role === "body" || role === "joint",
    },
    dispose() {
      selected.dispose();
      handle.dispose();
      handleGeometry.dispose();
      outline.dispose();
    },
  };
}

describe("studio-mannequin-scene-materials PBR 정밀도 (이진 Metalness · Clearcoat · Sheen)", () => {
  it("모든 마네킹 재질 스타일에서 PBR 금속도가 엄격히 이진값(유전체 0, 청동 1)을 지킨다", () => {
    const gradientMap = createStudioMannequinToonGradientTexture();
    try {
      for (const { id: style } of STUDIO_MANNEQUIN_MATERIAL_STYLES) {
        const palette = createStudioMannequinMaterialPalette(style, gradientMap);
        try {
          for (const role of PALETTE_ROLES) {
            const mat = palette[role];
            if (mat instanceof THREE.MeshStandardMaterial) {
              const expectedMetalness = style === "bronze" ? 1 : 0;
              expect(mat.metalness, `${style}.${role} binary metalness`).toBe(expectedMetalness);
              expect([0, 1]).toContain(mat.metalness);
            }
          }
        } finally {
          disposeStudioMannequinMaterialPalette(palette);
        }
      }
    } finally {
      gradientMap.dispose();
    }
  });

  it("기본 wood 팔레트는 새틴 바니시 너도밤나무 물리 파라미터(metalness 0, clearcoat 0.36, ior 1.52)를 적용한다", () => {
    const gradientMap = createStudioMannequinToonGradientTexture();
    const palette = createStudioMannequinMaterialPalette("wood", gradientMap);
    try {
      for (const role of ["body", "joint", "landmark"] as const) {
        expect(palette[role]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        const mat = palette[role] as THREE.MeshPhysicalMaterial;
        expect(mat.metalness).toBe(0);
        expect(mat.roughness).toBeCloseTo(0.46, 5);
        expect(mat.clearcoat).toBeCloseTo(0.36, 5);
        expect(mat.clearcoatRoughness).toBeCloseTo(0.24, 5);
        expect(mat.ior).toBeCloseTo(1.52, 5);
      }
      expect((palette.eye as THREE.MeshStandardMaterial).metalness).toBe(0);
    } finally {
      disposeStudioMannequinMaterialPalette(palette);
      gradientMap.dispose();
    }
  });

  it("clay 팔레트는 금속 오염 없는 조소용 점토 물리 파라미터(metalness 0, sheen 0.18, clearcoat 0.06)를 적용한다", () => {
    const gradientMap = createStudioMannequinToonGradientTexture();
    const palette = createStudioMannequinMaterialPalette("clay", gradientMap);
    try {
      for (const role of ["body", "joint", "landmark"] as const) {
        expect(palette[role]).toBeInstanceOf(THREE.MeshPhysicalMaterial);
        const mat = palette[role] as THREE.MeshPhysicalMaterial;
        expect(mat.metalness).toBe(0);
        expect(mat.roughness).toBeCloseTo(0.74, 5);
        expect(mat.clearcoat).toBeCloseTo(0.06, 5);
        expect(mat.clearcoatRoughness).toBeCloseTo(0.52, 5);
        expect(mat.sheen).toBeCloseTo(0.18, 5);
        expect(mat.sheenRoughness).toBeCloseTo(0.68, 5);
        expect(mat.sheenColor.getHex()).toBe(0xfaf5ef);
      }
      expect((palette.eye as THREE.MeshStandardMaterial).metalness).toBe(0);
    } finally {
      disposeStudioMannequinMaterialPalette(palette);
      gradientMap.dispose();
    }
  });

  it("bronze·porcelain·skin 팔레트가 각 물리 계층(청동 금속도 1, 백자 유약, 피부 벨벳 신)을 정확히 구성한다", () => {
    const gradientMap = createStudioMannequinToonGradientTexture();
    const bronzePalette = createStudioMannequinMaterialPalette("bronze", gradientMap);
    const porcelainPalette = createStudioMannequinMaterialPalette("porcelain", gradientMap);
    const skinPalette = createStudioMannequinMaterialPalette("skin", gradientMap);
    try {
      const bronzeBody = bronzePalette.body as THREE.MeshPhysicalMaterial;
      const bronzeJoint = bronzePalette.joint as THREE.MeshPhysicalMaterial;
      const bronzeLandmark = bronzePalette.landmark as THREE.MeshPhysicalMaterial;
      expect(bronzeBody).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(bronzeBody.metalness).toBe(1);
      expect(bronzeJoint.metalness).toBe(1);
      expect(bronzeLandmark.metalness).toBe(1);
      expect(bronzeBody.roughness).toBeCloseTo(0.26, 5);
      expect(bronzeJoint.roughness).toBeCloseTo(0.22, 5);
      expect(bronzeLandmark.roughness).toBeCloseTo(0.2, 5);
      expect(bronzeBody.clearcoat).toBeCloseTo(0.16, 5);
      expect(bronzeBody.clearcoatRoughness).toBeCloseTo(0.22, 5);

      const porcelainBody = porcelainPalette.body as THREE.MeshPhysicalMaterial;
      expect(porcelainBody).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(porcelainBody.metalness).toBe(0);
      expect(porcelainBody.clearcoat).toBeCloseTo(0.62, 5);
      expect(porcelainBody.clearcoatRoughness).toBeCloseTo(0.18, 5);

      const skinBody = skinPalette.body as THREE.MeshPhysicalMaterial;
      expect(skinBody).toBeInstanceOf(THREE.MeshPhysicalMaterial);
      expect(skinBody.metalness).toBe(0);
      expect(skinBody.clearcoat).toBeCloseTo(0.08, 5);
      expect(skinBody.sheen).toBeCloseTo(0.24, 5);
      expect(skinBody.sheenRoughness).toBeCloseTo(0.72, 5);
      expect(skinBody.sheenColor.getHex()).toBe(0xffd6c2);
    } finally {
      disposeStudioMannequinMaterialPalette(bronzePalette);
      disposeStudioMannequinMaterialPalette(porcelainPalette);
      disposeStudioMannequinMaterialPalette(skinPalette);
      gradientMap.dispose();
    }
  });

  it("disposeStudioMannequinMaterialPalette는 고유 재질 인스턴스만 정확히 1회씩 해제한다", () => {
    const gradientMap = createStudioMannequinToonGradientTexture();
    const palette = createStudioMannequinMaterialPalette("wood", gradientMap);
    const spies = PALETTE_ROLES.map((role) => vi.spyOn(palette[role], "dispose"));
    disposeStudioMannequinMaterialPalette(palette);
    for (const spy of spies) {
      expect(spy).toHaveBeenCalledTimes(1);
    }

    const shared = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.5 });
    const sharedSpy = vi.spyOn(shared, "dispose");
    disposeStudioMannequinMaterialPalette({
      body: shared,
      joint: shared,
      landmark: shared,
      eye: shared,
    });
    expect(sharedSpy).toHaveBeenCalledTimes(1);
    gradientMap.dispose();
  });
});

describe("createStudioMannequinSceneFigure SubD 원주 분할 및 관절구 밀봉", () => {
  it("포즈와 위치가 바뀐 뒤에도 몸통에서 잡은 골반·허리·가슴을 각각 고른다", () => {
    const gradient = createStudioMannequinToonGradientTexture();
    const palette = createStudioMannequinMaterialPalette("wood", gradient);
    const harness = createFigureMaterialsHarness(palette);
    const spec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const pose = createStudioMannequinRestPose();
    const figure = createStudioMannequinSceneFigure({ id: "lead", spec, pose, materials: harness.materials });
    try {
      const torso = figure.bodyMeshes().find((mesh) => mesh instanceof THREE.SkinnedMesh);
      if (!(torso instanceof THREE.SkinnedMesh)) throw new Error("몸통 스키닝 메시가 없습니다.");
      figure.root.updateMatrixWorld(true);
      torso.computeBoundingSphere();
      torso.computeBoundingBox();
      figure.applyPose({ ...pose, pelvisOffset: [0.36, 0, 0] });
      figure.root.updateMatrixWorld(true);
      const joints = new Set<string | null>();
      for (let y = 0; y <= spec.heightM; y += 0.01) {
        const ray = new THREE.Raycaster(new THREE.Vector3(0.36, y, 2), new THREE.Vector3(0, 0, -1));
        const hit = ray.intersectObject(torso)[0];
        if (hit) joints.add(resolveStudioMannequinPickedJoint(hit));
      }
      expect(joints).toEqual(new Set(["pelvis", "spine", "chest"]));
    } finally {
      figure.dispose();
      harness.dispose();
      disposeStudioMannequinMaterialPalette(palette);
      gradient.dispose();
    }
  });

  it("사지·손가락·관절구 프리미티브가 매끄러운 원주 분할(사지 >= 26~32, 소형 마디/구 >= 16)과 소켓 인터페네트레이션을 보장한다", () => {
    const gradientMap = createStudioMannequinToonGradientTexture();
    const palette = createStudioMannequinMaterialPalette("wood", gradientMap);
    const harness = createFigureMaterialsHarness(palette);
    const baseSpec = buildStudioMannequinSpec(STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS);
    const customSpec = {
      ...baseSpec,
      primitives: [
        ...baseSpec.primitives,
        {
          kind: "capsule" as const,
          jointId: "rightHand" as const,
          from: [0, 0, 0] as const,
          to: [0, -0.03, 0] as const,
          radius: 0.008,
          materialRole: "body" as const,
        },
        {
          kind: "capsule" as const,
          jointId: "leftUpperLeg" as const,
          from: [0, 0, 0] as const,
          to: [0, -0.32, 0] as const,
          radius: 0.035,
          materialRole: "body" as const,
        },
      ],
    };
    const restPose = createStudioMannequinRestPose();
    const splayPad = resolveStudioMannequinHandPadPose({
      spread: 0.75,
      clench: 0.25,
      thumbOpposition: 0.3,
      fistStyle: "standard",
    });

    const figure = createStudioMannequinSceneFigure({
      id: "lead",
      spec: customSpec,
      pose: restPose,
      materials: harness.materials,
      initialEcorcheState: {
        surfaceMode: "standard",
        leftSplayDeg: splayPad.splayDeg,
      },
    });

    try {
      const palms = figure.bodyMeshes().filter((mesh) =>
        mesh.geometry.type === "BufferGeometry" && /studio-mannequin-part:(left|right)Hand:body/u.test(mesh.name));
      expect(palms.map((mesh) => mesh.userData.studioMannequinJointId).sort()).toEqual(["leftHand", "rightHand"]);
      const untouched = figure.bodyMeshes().filter((mesh) => mesh.userData.studioMannequinJointId !== "leftHand");
      const leftSegments = figure.bodyMeshes().filter((mesh) => mesh.userData.studioMannequinJointId === "leftHand"
        && mesh.geometry.type === "CylinderGeometry");
      const replaced = vi.spyOn(leftSegments[0].geometry, "dispose");
      figure.setFingerSpec(buildStudioMannequinSpec(baseSpec.params, { left: { index: [80, 76, 64] } }));
      expect(replaced).toHaveBeenCalledOnce();
      expect(untouched.every((mesh) => figure.bodyMeshes().includes(mesh))).toBe(true);
      expect(palms.every((mesh) => figure.bodyMeshes().includes(mesh))).toBe(true);
      let sphereCount = 0;
      let cylinderCount = 0;
      let capsuleCount = 0;
      const majorLimbJoints = new Set([
        "leftUpperArm",
        "rightUpperArm",
        "leftUpperLeg",
        "rightUpperLeg",
        "leftLowerLeg",
        "rightLowerLeg",
      ]);

      for (const mesh of figure.bodyMeshes()) {
        const ud = mesh.userData as StudioMannequinBodyMeshUserData;
        const posCount = mesh.geometry.getAttribute("position")?.count ?? 0;
        expect(posCount).toBeGreaterThan(0);

        if (mesh.geometry instanceof THREE.SphereGeometry) {
          sphereCount += 1;
          expect(mesh.geometry.parameters.widthSegments).toBeGreaterThanOrEqual(20);
          expect(mesh.geometry.parameters.heightSegments).toBeGreaterThanOrEqual(16);
        } else if (mesh.geometry instanceof THREE.CylinderGeometry) {
          cylinderCount += 1;
          expect(mesh.geometry.parameters.radialSegments).toBeGreaterThanOrEqual(18);
          expect(mesh.geometry.parameters.heightSegments).toBeGreaterThanOrEqual(6);
          if (ud.studioMannequinMaterialRole === "body" && majorLimbJoints.has(ud.studioMannequinJointId)) {
            expect(mesh.geometry.parameters.radialSegments).toBeGreaterThanOrEqual(28);
            expect(posCount).toBeGreaterThan(200);
          } else if (
            ud.studioMannequinMaterialRole === "body"
            && (ud.studioMannequinJointId === "leftLowerArm" || ud.studioMannequinJointId === "rightLowerArm")
          ) {
            expect(mesh.geometry.parameters.radialSegments).toBeGreaterThanOrEqual(24);
          }
        } else if (mesh.geometry instanceof THREE.CapsuleGeometry) {
          capsuleCount += 1;
          expect(mesh.geometry.parameters.radialSegments).toBeGreaterThanOrEqual(18);
          if (ud.studioMannequinJointId === "leftUpperLeg") {
            expect(mesh.geometry.parameters.radialSegments).toBeGreaterThanOrEqual(28);
          }
        }
      }

      expect(sphereCount).toBeGreaterThan(20);
      expect(cylinderCount).toBeGreaterThan(30);
      expect(capsuleCount).toBe(2);

      // 상완 테이퍼 실린더가 양단 관절구 속으로 인터페네트레이션되어 분절 간극이 열리지 않는다.
      const upperArmPrim = baseSpec.primitives.find(
        (p) => p.kind === "capsule" && p.jointId === "leftUpperArm" && p.materialRole === "body",
      );
      const upperArmMesh = figure.bodyMeshes().find(
        (m) =>
          m.geometry instanceof THREE.CylinderGeometry
          && (m.userData as StudioMannequinBodyMeshUserData).studioMannequinJointId === "leftUpperArm"
          && (m.userData as StudioMannequinBodyMeshUserData).studioMannequinMaterialRole === "body",
      );
      expect(upperArmPrim?.kind).toBe("capsule");
      expect(upperArmMesh).toBeDefined();
      if (upperArmPrim?.kind === "capsule" && upperArmMesh?.geometry instanceof THREE.CylinderGeometry) {
        const rawLen = Math.hypot(
          upperArmPrim.to[0] - upperArmPrim.from[0],
          upperArmPrim.to[1] - upperArmPrim.from[1],
          upperArmPrim.to[2] - upperArmPrim.from[2],
        );
        expect(upperArmMesh.geometry.parameters.height).toBeGreaterThan(rawLen);
        expect(upperArmMesh.geometry.parameters.height - rawLen).toBeLessThanOrEqual(0.02 + 1e-6);
      }

      // 에코르셰 모드 전환 시에도 모든 생성 지오메트리가 유효한 법선·정점을 유지한다.
      figure.setEcorcheState({ surfaceMode: "ecorche" }, restPose);
      expect(figure.bodyMeshes().length).toBeGreaterThan(50);
      for (const mesh of figure.bodyMeshes()) {
        expect(mesh.geometry.getAttribute("position").count).toBeGreaterThan(24);
      }
    } finally {
      figure.dispose();
      harness.dispose();
      disposeStudioMannequinMaterialPalette(palette);
      gradientMap.dispose();
    }
  });
});

describe("StudioVrmLighting 전 톤 헤미스피어 바운스 & PBR 접지 무대", () => {
  it("모든 조명 톤에서 자연스러운 하늘-지면 헤미스피어 반사광을 마운트하고 야간 지면 톤을 분리한다", () => {
    for (const tone of ["morning", "sunset", "night", "studio"] as const) {
      const regularElements = collectReactElements(VrmLighting({ tone, formStudy: false }));
      const hemiRegular = regularElements.find((el) => el.type === "hemisphereLight");
      expect(hemiRegular, `${tone} regular hemisphereLight`).toBeDefined();
      const regularProps = hemiRegular!.props as {
        intensity: number;
        color: string;
        groundColor: string;
      };
      expect(regularProps.intensity).toBeCloseTo(0.16, 5);
      expect(regularProps.color).toBe("#fff8ef");
      expect(regularProps.groundColor).toBe(tone === "night" ? "#1e2436" : "#566070");

      const studyElements = collectReactElements(VrmLighting({ tone, formStudy: true }));
      const hemiStudy = studyElements.find((el) => el.type === "hemisphereLight");
      expect((hemiStudy!.props as { intensity: number }).intensity).toBeCloseTo(0.26, 5);
    }
  });

  it("색온도 중앙에서 주광은 캐릭터 위에 있고 석양과 야간의 발색을 유지한다", () => {
    const key = (tone: "studio" | "sunset" | "night", colorTemp: number) => {
      const elements = collectReactElements(VrmLighting({
        tone, lighting: { colorTemp, intensity: 1, directionDeg: 45 },
      }));
      const light = elements.find((element) => element.type === "directionalLight");
      if (!light) throw new Error("주광이 없습니다.");
      return light.props as { position: readonly number[]; color: { r: number; g: number; b: number } };
    };
    const studio = key("studio", 0.5);
    expect(studio.position[1]).toBeGreaterThan(1.8);
    expect(studio.color.r).toBeCloseTo(studio.color.b);
    const sunset = key("sunset", 0.5).color;
    const night = key("night", 0.5).color;
    expect(sunset.r).toBeGreaterThan(sunset.b);
    expect(night.b).toBeGreaterThan(night.r);
    expect(key("studio", 0).color.r).toBeLessThan(key("studio", 1).color.r);
    expect(key("studio", 1).color.b).toBeLessThan(key("studio", 0).color.b);
  });

  it("무대 바닥·벽면(room/outdoor)에 레거시 Lambert 대신 receiveShadow PBR Standard 재질을 적용한다", () => {
    const roomElements = collectReactElements(VrmLighting({ tone: "studio", env: "room" }));
    expect(roomElements.filter((el) => el.type === "meshLambertMaterial")).toHaveLength(0);

    const stageMeshes = roomElements.filter((el) => el.type === "mesh");
    const standardMaterials = roomElements.filter((el) => el.type === "meshStandardMaterial");
    expect(stageMeshes).toHaveLength(5); // 바닥 1 + 4면 벽
    expect(standardMaterials).toHaveLength(5);

    for (const meshEl of stageMeshes) {
      expect((meshEl.props as { receiveShadow?: boolean }).receiveShadow).toBe(true);
    }
    for (const matEl of standardMaterials) {
      const props = matEl.props as { roughness: number; metalness: number; color: string };
      expect(props.roughness).toBeCloseTo(0.86, 5);
      expect(props.metalness).toBe(0);
    }

    const outdoorElements = collectReactElements(VrmLighting({ tone: "morning", env: "outdoor" }));
    const outdoorFloorMat = outdoorElements.find((el) => el.type === "meshStandardMaterial");
    expect((outdoorFloorMat!.props as { color: string }).color).toBe("#3a5f3a");
  });
});
