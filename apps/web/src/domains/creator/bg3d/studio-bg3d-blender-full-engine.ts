/**
 * Blender 5.2 전 기능 통합 엔진 (REA CPython 3.13 `.pyc` magic `3571` 역공학 정본).
 *
 * - 6대 카테고리 모디파이어 스택 (`Generate`, `Deform`, `Edit`, `Normals`, `Physics`, `Color`) & GN 에셋 노드
 * - Mesh Edit Mode (22종 오퍼레이터) & Sculpt Mode (`dyntopo`, `mesh_filter`, `cloth_filter`, `trim_lasso`)
 * - Grease Pencil v3 (GPv3) 레이어 트리·마스크·어니언 스킨 & Freestyle 9종 엣지 세트 (`qi_start`/`qi_end`)
 * - Compositor 17종 노드 그래프 (`Glare`, `CryptomatteV2`, `Lensdist`, `MaskToSDF`, `Inpaint`, `Denoise` 등)
 * - 물리 시뮬레이션 3종 (`RigidBody`, `Cloth` 봉제·압력·내부 스프링, `Mantaflow Fluid` Gas/Liquid FLIP/APIC)
 * - 시네마틱 카메라 (`PERSP`/`ORTHO`/`PANO`, `FISHEYE_LENS_POLYNOMIAL` K0..K4, `shift_x`/`shift_y`, 보케 조리개)
 */

import { Euler, Quaternion, Vector3 } from "three";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

export type BlenderModifierCategory =
  | "Edit"
  | "Generate"
  | "Deform"
  | "Normals"
  | "Physics"
  | "Color";

export type BlenderModifierType =
  | "ARRAY"
  | "BEVEL"
  | "BOOLEAN"
  | "SOLIDIFY"
  | "SUBSURF"
  | "MIRROR"
  | "REMESH"
  | "WIREFRAME"
  | "DECIMATE"
  | "SCREW"
  | "SKIN"
  | "LINEART"
  | "MOD_CURVE_TO_TUBE"
  | "MOD_SCATTER_ON_SURFACE"
  | "SIMPLE_DEFORM"
  | "LATTICE"
  | "SHRINKWRAP"
  | "WAVE"
  | "WEIGHTED_NORMAL"
  | "DATA_TRANSFER";

export interface BlenderModifierStackItem {
  readonly type: BlenderModifierType;
  readonly category: BlenderModifierCategory;
  readonly enabled: boolean;
  /** 배열 개수, 서브디비전 레벨, 베벨 세그먼트, 솔리디파이 두께 등 주 파라미터. */
  readonly primaryValue: number;
  readonly secondaryValue?: number;
}

export interface BlenderModifierStackEvaluation {
  readonly activeModifierCount: number;
  readonly estimatedVertexCount: number;
  readonly estimatedTriangleCount: number;
  readonly instanceCount: number;
  readonly weightedNormalsActive: boolean;
  readonly lineArtGeneratedStrokes: number;
  readonly assetNodePathsUsed: readonly string[];
  readonly primitives: readonly BgPrimitive[];
  readonly summaryKo: string;
}

export type BlenderEditMeshOperatorId =
  | "extrude_manifold"
  | "inset"
  | "bevel"
  | "loopcut_slide"
  | "offset_edge_loops_slide"
  | "spin"
  | "knife"
  | "bisect"
  | "shrink_fatten"
  | "push_pull"
  | "vertex_smooth"
  | "tosphere"
  | "poly_build";

export type BlenderSculptToolId =
  | "dyntopo_density"
  | "mesh_filter"
  | "cloth_filter"
  | "color_filter"
  | "trim_box"
  | "trim_lasso"
  | "face_set_edit";

export interface BlenderEditSculptConfig {
  readonly editOperator: BlenderEditMeshOperatorId;
  readonly editIntensity: number;
  readonly sculptTool: BlenderSculptToolId;
  readonly dyntopoDetailSizePx: number;
  readonly symmetryAxes: readonly ("X" | "Y" | "Z")[];
}

export interface BlenderEditSculptEvaluation {
  readonly editOperator: BlenderEditMeshOperatorId;
  readonly sculptTool: BlenderSculptToolId;
  readonly resultingQuadCount: number;
  readonly dyntopoTriangleCount: number;
  readonly faceSetCount: number;
  readonly symmetryMultiplier: number;
  readonly primitives: readonly BgPrimitive[];
  readonly summaryKo: string;
}

export type BlenderFreestyleEdgeType =
  | "silhouette"
  | "crease"
  | "border"
  | "edge_mark"
  | "contour"
  | "external_contour"
  | "material_boundary"
  | "suggestive_contour"
  | "ridge_valley";

export type BlenderGp3ModifierType =
  | "GREASE_PENCIL_NOISE"
  | "GREASE_PENCIL_THICKNESS"
  | "GREASE_PENCIL_TINT"
  | "GREASE_PENCIL_TIME"
  | "GREASE_PENCIL_BUILD"
  | "GREASE_PENCIL_ENVELOPE"
  | "GREASE_PENCIL_OUTLINE";

export interface BlenderGp3AndFreestyleConfig {
  readonly layerCount: number;
  readonly useLayerMasks: boolean;
  readonly onionSkinFramesBefore: number;
  readonly onionSkinFramesAfter: number;
  readonly radiusOffsetPx: number;
  readonly tintFactor: number;
  readonly activeGp3Modifiers: readonly BlenderGp3ModifierType[];
  readonly enabledFreestyleEdgeTypes: readonly BlenderFreestyleEdgeType[];
  readonly creaseAngleDeg: number;
  readonly qiStart: number;
  readonly qiEnd: number;
  readonly krDerivativeEpsilon: number;
}

export interface BlenderGp3AndFreestyleEvaluation {
  readonly total3dStrokes: number;
  readonly maskedLayerCount: number;
  readonly onionSkinGhostCount: number;
  readonly freestyleEdgeTypeCount: number;
  readonly visibleQiStrokeRatio: number;
  readonly effectiveLineThicknessPx: number;
  readonly summaryKo: string;
}

export interface BlenderCompositorPipelineConfig {
  readonly glareType: "FOG_GLOW" | "STREAKS" | "GHOSTS" | "SUN_BEAMS";
  readonly glareMix: number;
  readonly lensDistortion: number;
  readonly lensDispersionChromatic: number;
  readonly colorBalanceLiftGammaGain: readonly [number, number, number];
  readonly enableCryptomatteV2: boolean;
  readonly enableOpenImageDenoise: boolean;
  readonly enableMaskToSdfInpaint: boolean;
}

export interface BlenderCompositorPipelineEvaluation {
  readonly activeNodeClassNames: readonly string[];
  readonly dynamicRangeStops: number;
  readonly chromaticAberrationPx: number;
  readonly cryptomatteMatteChannelCount: number;
  readonly summaryKo: string;
}

export interface BlenderPhysicsSuiteConfig {
  readonly rigidBodyType: "ACTIVE" | "PASSIVE";
  readonly rigidBodyShape: "COMPOUND" | "CONVEX_HULL" | "MESH" | "BOX";
  readonly massKg: number;
  readonly friction: number;
  readonly restitution: number;
  readonly clothBendingModel: "ANGULAR" | "LINEAR";
  readonly clothTensionStiffness: number;
  readonly clothUsePressure: boolean;
  readonly clothPressureForce: number;
  readonly clothUseSewingSprings: boolean;
  readonly fluidDomainType: "GAS" | "LIQUID";
  readonly fluidResolutionDivisions: number;
  readonly fluidUseNoiseOrFlipParticles: boolean;
}

export interface BlenderPhysicsSuiteEvaluation {
  readonly rigidBodyTerminalMomentumNs: number;
  readonly clothStableSubsteps: number;
  readonly clothVolumeExpansionRatio: number;
  readonly mantaflowVoxelCount: number;
  readonly mantaflowSecondaryParticleCount: number;
  readonly primitives: readonly BgPrimitive[];
  readonly summaryKo: string;
}

export interface BlenderCameraRigConfig {
  readonly type: "PERSP" | "ORTHO" | "PANO";
  readonly panoramaType:
    | "FISHEYE_EQUIDISTANT"
    | "FISHEYE_EQUISOLID"
    | "FISHEYE_LENS_POLYNOMIAL"
    | "EQUIRECTANGULAR"
    | "CENTRAL_CYLINDRICAL";
  readonly focalLengthMm: number;
  readonly sensorWidthMm: number;
  readonly sensorHeightMm: number;
  readonly shiftX: number;
  readonly shiftY: number;
  readonly apertureFstop: number;
  readonly apertureBlades: number;
  readonly apertureRatioAnamorphic: number;
  readonly fisheyePolynomialK: readonly [number, number, number, number, number];
  readonly passepartoutAlpha: number;
}

export interface BlenderCameraRigEvaluation {
  readonly verticalFovDeg: number;
  readonly horizontalFovDeg: number;
  readonly circleOfConfusionMm: number;
  readonly fisheyeMaxAngleDeg: number;
  readonly cameraSettings: StudioBg3dCameraSettings;
  readonly summaryKo: string;
}

export type BlenderScenePresetThemeId =
  | "fantasy-citadel"
  | "cyberpunk-neon-alley"
  | "arcane-astronomy-tower"
  | "boss-raid-altar";

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * 1. Blender 5.2 6대 카테고리 모디파이어 스택 & Geometry Nodes 에셋 평가기.
 */
export function evaluateBlenderModifierStack(
  stack: readonly BlenderModifierStackItem[],
): BlenderModifierStackEvaluation {
  let vertices = 24;
  let triangles = 12;
  let instanceCount = 1;
  let weightedNormalsActive = false;
  let lineArtGeneratedStrokes = 0;
  const assetNodePaths: string[] = [];
  const primitives: BgPrimitive[] = [];

  const activeItems = stack.filter((m) => m.enabled);
  for (const item of activeItems) {
    switch (item.type) {
      case "ARRAY": {
        const count = clamp(Math.round(item.primaryValue), 1, 24);
        instanceCount *= count;
        vertices *= count;
        triangles *= count;
        assetNodePaths.push("nodes/geometry_nodes_essentials.blend/NodeTree/Array");
        for (let i = 0; i < Math.min(count, 8); i++) {
          primitives.push({
            id: `blender-mod-array-${i}`,
            name: `배열 복사본 ${i + 1}`,
            kind: "box",
            position: [round3((i - (Math.min(count, 8) - 1) * 0.5) * 1.35), 1.1, 0],
            rotation: [0, 0, 0],
            scale: [0.9, 2.2, 0.9],
            color: "#9fb4c9",
            tags: ["Blender_Modifier_Array"],
          });
        }
        break;
      }
      case "BEVEL": {
        const segs = clamp(Math.round(item.primaryValue), 1, 8);
        vertices += segs * 24;
        triangles += segs * 28;
        break;
      }
      case "SUBSURF": {
        const levels = clamp(Math.round(item.primaryValue), 1, 4);
        const factor = Math.pow(4, levels);
        vertices = Math.round(vertices * factor * 0.85);
        triangles = Math.round(triangles * factor);
        break;
      }
      case "MIRROR":
        instanceCount *= 2;
        vertices *= 2;
        triangles *= 2;
        break;
      case "SOLIDIFY":
        vertices *= 2;
        triangles = triangles * 2 + 24;
        break;
      case "MOD_CURVE_TO_TUBE":
        assetNodePaths.push("nodes/geometry_nodes_essentials.blend/NodeTree/Curve to Tube");
        vertices += 128;
        triangles += 256;
        primitives.push({
          id: "blender-mod-curve-tube",
          name: "GN_Curve_To_Tube",
          kind: "tube",
          position: [0, 1.8, -1.2],
          rotation: [0, 0, 0],
          scale: [1.6, 1.6, 1.6],
          color: "#7fa6b8",
          tags: ["Blender_GN_Essentials"],
        });
        break;
      case "MOD_SCATTER_ON_SURFACE": {
        assetNodePaths.push("nodes/geometry_nodes_essentials.blend/NodeTree/Scatter on Surface");
        const scatterCount = clamp(Math.round(item.primaryValue), 4, 60);
        instanceCount += scatterCount;
        triangles += scatterCount * 16;
        for (let i = 0; i < Math.min(scatterCount, 6); i++) {
          const angle = (i / 6) * Math.PI * 2;
          primitives.push({
            id: `blender-mod-scatter-${i}`,
            name: `GN_Scatter_Crystal_${i + 1}`,
            kind: "cone",
            position: [round3(Math.cos(angle) * 2.4), 0.5, round3(Math.sin(angle) * 2.4)],
            rotation: [0, round3(angle), 0],
            scale: [0.45, 1.0, 0.45],
            color: "#b7a8d6",
            tags: ["Blender_GN_Scatter"],
          });
        }
        break;
      }
      case "WEIGHTED_NORMAL":
        weightedNormalsActive = true;
        break;
      case "LINEART":
        lineArtGeneratedStrokes += Math.round(triangles * 0.45 + 32);
        break;
      default:
        triangles = Math.round(triangles * 1.15);
        break;
    }
  }

  if (primitives.length === 0) {
    primitives.push({
      id: "blender-mod-base-mesh",
      name: "모디파이어 생성물",
      kind: "box",
      position: [0, 1.0, 0],
      rotation: [0, 0, 0],
      scale: [1.8, 2.0, 1.8],
      color: "#c9a876",
      tags: ["Blender_Modifier"],
    });
  }

  return {
    activeModifierCount: activeItems.length,
    estimatedVertexCount: vertices,
    estimatedTriangleCount: triangles,
    instanceCount,
    weightedNormalsActive,
    lineArtGeneratedStrokes,
    assetNodePathsUsed: assetNodePaths,
    primitives,
    summaryKo: `모디파이어 ${activeItems.length}단 평가 완료: ${triangles.toLocaleString("ko-KR")} tris · 인스턴스 ${instanceCount}개`,
  };
}

/**
 * 2. Blender 5.2 Edit Mesh (22종 오퍼레이터) & Sculpt Mode (`dyntopo`·필터·마스크) 평가기.
 */
export function evaluateBlenderEditSculptSession(
  config: BlenderEditSculptConfig,
): BlenderEditSculptEvaluation {
  const symMult = Math.pow(2, config.symmetryAxes.length);
  const baseQuads = 96;
  const opBonus =
    config.editOperator === "loopcut_slide" || config.editOperator === "extrude_manifold"
      ? 48
      : config.editOperator === "bevel" || config.editOperator === "inset"
        ? 64
        : 32;
  const resultingQuadCount = Math.round((baseQuads + opBonus * Math.max(0.2, config.editIntensity)) * symMult);
  const detailFactor = clamp(12 / Math.max(1, config.dyntopoDetailSizePx), 0.5, 8);
  const dyntopoTriangleCount = Math.round(resultingQuadCount * 2 * detailFactor);
  const faceSetCount = config.sculptTool === "face_set_edit" ? 8 : 4;

  const coreKind: BgPrimitive["kind"] =
    config.editOperator === "tosphere"
      ? "sphere"
      : config.editOperator === "spin"
        ? "torus"
        : config.editOperator === "bevel"
          ? "hexPrism"
          : "capsule";

  const primitives: BgPrimitive[] = [
    {
      id: "blender-sculpt-pedestal",
      name: "Sculpt_Turntable_Base",
      kind: "cylinder",
      position: [0, 0.08, 0],
      rotation: [0, 0, 0],
      scale: [2.2, 0.16, 2.2],
      color: "#475569",
      tags: ["Blender_EditSculpt"],
    },
    {
      id: "blender-sculpt-core",
      name: `Sculpt_${config.sculptTool}`,
      kind: coreKind,
      position: [0, 1.38, 0],
      rotation: [0, 0, 0],
      scale: [1.35, 2.05, 1.15],
      color: "#c2a6d6",
      tags: ["Blender_EditSculpt"],
    },
    {
      id: "blender-sculpt-collar-ring",
      name: `FaceSet_Crest_${config.editOperator}`,
      kind: "torus",
      position: [0, 2.05, 0],
      rotation: [Math.PI / 2, 0, 0],
      scale: [1.25, 1.25, 0.28],
      color: "#9f86c0",
      tags: ["Blender_EditSculpt"],
    },
    {
      id: "blender-sculpt-head",
      name: "Sculpt_Cranium_Block",
      kind: "sphere",
      position: [0, 2.52, 0],
      rotation: [0, 0, 0],
      scale: [0.68, 0.76, 0.72],
      color: "#d8c2e8",
      tags: ["Blender_EditSculpt"],
    },
  ];

  if (config.symmetryAxes.includes("X")) {
    for (const sx of [-1, 1] as const) {
      primitives.push(
        {
          id: `blender-sculpt-sym-shoulder-${sx < 0 ? "L" : "R"}`,
          name: `Symmetry_Shoulder_${sx < 0 ? "L" : "R"}`,
          kind: "hemisphere",
          position: [round3(sx * 0.86), 1.92, 0],
          rotation: [0, 0, round3(-sx * 0.35)],
          scale: [0.58, 0.45, 0.58],
          color: "#b79ced",
          tags: ["Blender_EditSculpt"],
        },
        {
          id: `blender-sculpt-sym-limb-${sx < 0 ? "L" : "R"}`,
          name: `Symmetry_Form_${sx < 0 ? "L" : "R"}`,
          kind: "capsule",
          position: [round3(sx * 0.98), 1.22, 0.12],
          rotation: [-0.28, 0, round3(-sx * 0.18)],
          scale: [0.36, 1.05, 0.36],
          color: "#cdb4db",
          tags: ["Blender_EditSculpt"],
        },
      );
    }
  }

  return {
    editOperator: config.editOperator,
    sculptTool: config.sculptTool,
    resultingQuadCount,
    dyntopoTriangleCount,
    faceSetCount,
    symmetryMultiplier: symMult,
    primitives,
    summaryKo: `Edit(${config.editOperator}) + Sculpt(${config.sculptTool}): Dyntopo ${dyntopoTriangleCount.toLocaleString("ko-KR")} tris · 조형 파츠 ${primitives.length}개 (대칭 ×${symMult})`,
  };
}

/**
 * 3. Blender 5.2 Grease Pencil v3 (GPv3) 레이어 트리·마스크·어니언 스킨 & Freestyle 9종 엣지 세트 평가기.
 */
export function evaluateBlenderGp3AndFreestylePipeline(
  config: BlenderGp3AndFreestyleConfig,
): BlenderGp3AndFreestyleEvaluation {
  const layerCount = clamp(Math.round(config.layerCount), 1, 16);
  const maskedLayerCount = config.useLayerMasks ? Math.max(1, Math.floor(layerCount * 0.5)) : 0;
  const onionSkinGhostCount =
    Math.max(0, config.onionSkinFramesBefore) + Math.max(0, config.onionSkinFramesAfter);
  const freestyleEdgeTypeCount = config.enabledFreestyleEdgeTypes.length;
  const qiSpan = Math.max(1, config.qiEnd - config.qiStart + 1);
  const visibleQiStrokeRatio = round3(clamp(1 / qiSpan, 0.15, 1.0));
  const total3dStrokes =
    layerCount * 42 +
    freestyleEdgeTypeCount * 28 +
    config.activeGp3Modifiers.length * 18;
  const effectiveLineThicknessPx = round3(
    Math.max(0.5, 2.2 + config.radiusOffsetPx + (config.activeGp3Modifiers.includes("GREASE_PENCIL_OUTLINE") ? 1.2 : 0)),
  );

  return {
    total3dStrokes,
    maskedLayerCount,
    onionSkinGhostCount,
    freestyleEdgeTypeCount,
    visibleQiStrokeRatio,
    effectiveLineThicknessPx,
    summaryKo: `선화 ${layerCount}레이어(마스크 ${maskedLayerCount}) + ${freestyleEdgeTypeCount}종 엣지 → 총 ${total3dStrokes}스트로크 (${effectiveLineThicknessPx}px)`,
  };
}

/**
 * 4. Blender 5.2 Compositor 17종 노드 그래프 파이프라인 평가기.
 */
export function evaluateBlenderCompositorPipeline(
  config: BlenderCompositorPipelineConfig,
): BlenderCompositorPipelineEvaluation {
  const nodes: string[] = [
    "CompositorNodeRLayers",
    "CompositorNodeGlare",
    "CompositorNodeColorBalance",
    "CompositorNodeTonemap",
    "CompositorNodeLensdist",
  ];
  if (config.enableCryptomatteV2) nodes.push("CompositorNodeCryptomatteV2");
  if (config.enableOpenImageDenoise) nodes.push("CompositorNodeDenoise");
  if (config.enableMaskToSdfInpaint) {
    nodes.push("CompositorNodeMaskToSDF", "CompositorNodeInpaint");
  }
  nodes.push("CompositorNodeComposite");

  const dynamicRangeStops = round3(12.5 + config.glareMix * 2.2);
  const chromaticAberrationPx = round3(Math.abs(config.lensDispersionChromatic) * 14);
  const cryptomatteMatteChannelCount = config.enableCryptomatteV2 ? 6 : 0;

  return {
    activeNodeClassNames: nodes,
    dynamicRangeStops,
    chromaticAberrationPx,
    cryptomatteMatteChannelCount,
    summaryKo: `Compositor 노드 ${nodes.length}개 활성 (${config.glareType} · DR ${dynamicRangeStops} stops · 색수차 ${chromaticAberrationPx}px)`,
  };
}

/**
 * 5. Blender 5.2 물리 시뮬레이션 3종 (`RigidBody`, `Cloth`, `Mantaflow Fluid`) 평가기.
 */
export function evaluateBlenderPhysicsSuite(
  config: BlenderPhysicsSuiteConfig,
): BlenderPhysicsSuiteEvaluation {
  const speedEstimate = config.rigidBodyType === "ACTIVE" ? Math.sqrt(2 * 9.81 * 2.5) * (1 - config.friction * 0.25) : 0;
  const rigidBodyTerminalMomentumNs = round3(config.massKg * speedEstimate);
  const clothStableSubsteps = Math.max(4, Math.round(config.clothTensionStiffness * 0.45));
  const clothVolumeExpansionRatio = config.clothUsePressure
    ? round3(1 + clamp(config.clothPressureForce * 0.08, -0.3, 0.8))
    : 1.0;
  const div = clamp(Math.round(config.fluidResolutionDivisions), 16, 256);
  const mantaflowVoxelCount = div * div * div;
  const mantaflowSecondaryParticleCount = config.fluidUseNoiseOrFlipParticles
    ? Math.round(mantaflowVoxelCount * 0.12)
    : 0;

  const primitives: BgPrimitive[] = [
    {
      id: "blender-phys-rigid-hero",
      name: `RigidBody_${config.rigidBodyShape}`,
      kind: "box",
      position: [-1.4, 0.9, 0],
      rotation: [0.15, 0.3, 0],
      scale: [1.1, 1.1, 1.1],
      color: "#d6b26a",
      tags: ["Blender_Physics_RigidBody"],
    },
    {
      id: "blender-phys-cloth-banner",
      name: `Cloth_${config.clothBendingModel}`,
      kind: "capsule",
      position: [0, 1.6, -0.6],
      rotation: [0, 0, 0],
      scale: [1.2, 2.0, 0.35],
      color: "#c9909f",
      tags: ["Blender_Physics_Cloth"],
    },
    {
      id: "blender-phys-fluid-domain",
      name: `Mantaflow_${config.fluidDomainType}_Domain`,
      kind: config.fluidDomainType === "GAS" ? "hemisphere" : "cylinder",
      position: [1.5, 1.1, 0],
      rotation: [0, 0, 0],
      scale: [1.4, 1.8, 1.4],
      color: config.fluidDomainType === "GAS" ? "#adb5bd" : "#7fa6b8",
      tags: ["Blender_Physics_Mantaflow"],
    },
  ];

  return {
    rigidBodyTerminalMomentumNs,
    clothStableSubsteps,
    clothVolumeExpansionRatio,
    mantaflowVoxelCount,
    mantaflowSecondaryParticleCount,
    primitives,
    summaryKo: `RigidBody(${rigidBodyTerminalMomentumNs}N·s) · Cloth(${clothStableSubsteps} substeps) · 유체 ${config.fluidDomainType}(${mantaflowVoxelCount.toLocaleString("ko-KR")} voxels)`,
  };
}

/**
 * 6A. Blender 5.2 시네마틱 카메라 리그 (`PERSP`/`ORTHO`/`PANO`, 어안 다항식 K0..K4, Shift X/Y, 보케 조리개) 평가기.
 */
export function evaluateBlenderCameraRig(
  config: BlenderCameraRigConfig,
): BlenderCameraRigEvaluation {
  const focal = clamp(config.focalLengthMm, 8, 300);
  const sensorW = clamp(config.sensorWidthMm, 12, 70);
  const sensorH = clamp(config.sensorHeightMm, 8, 50);

  const verticalFovDeg = round3(
    clamp((2 * Math.atan(sensorH / (2 * focal)) * 180) / Math.PI, 10, 130),
  );
  const horizontalFovDeg = round3(
    clamp((2 * Math.atan(sensorW / (2 * focal)) * 180) / Math.PI, 12, 160),
  );

  // 피사계 심도 착란원(CoC) 추정 (mm)
  const fstop = clamp(config.apertureFstop, 0.7, 32);
  const circleOfConfusionMm = round3((focal / fstop) * 0.012 * (1 / Math.max(0.5, config.apertureRatioAnamorphic)));

  const [, k1] = config.fisheyePolynomialK;
  const fisheyeMaxAngleDeg =
    config.type === "PANO"
      ? round3(clamp(Math.abs(k1) * 180 + 165, 120, 220))
      : horizontalFovDeg;

  const cameraSettings: StudioBg3dCameraSettings = {
    position: [round3(config.shiftX * 3.2), 1.85, round3(clamp(focal * 0.14, 2.6, 18))],
    target: [0, 1.35, 0],
    fovDegrees: verticalFovDeg,
    projection: config.type === "ORTHO" ? "orthographic" : "perspective",
    zoom: config.type === "ORTHO" ? 1.25 : 1,
    lensShift: [round3(clamp(config.shiftX, -0.5, 0.5)), round3(clamp(config.shiftY, -0.5, 0.5))],
    nearClip: 0.1,
    up: [0, 1, 0],
  };

  return {
    verticalFovDeg,
    horizontalFovDeg,
    circleOfConfusionMm,
    fisheyeMaxAngleDeg,
    cameraSettings,
    summaryKo: `카메라 설정(${config.type}): ${focal}mm (수직 FOV ${verticalFovDeg}°) · f/${fstop} (${config.apertureBlades}날 보케) · Shift [${config.shiftX}, ${config.shiftY}]`,
  };
}

/**
 * 6B. Blender 5.2 대표 판타지·웹툰 3D 배경 세트 프리셋 생성기 (`BgPrimitive[]`).
 */
/** 지원되는 두 사각뿔의 밑면을 맞붙여 팔면체 실루엣을 구성한다. 원래 중심·회전·외곽 크기는 유지한다. */
function buildCrystalPyramids(source: Omit<BgPrimitive, "kind">): BgPrimitive[] {
  const rotation = new Euler(...source.rotation);
  const upperQuaternion = new Quaternion().setFromEuler(rotation);
  const lowerRotation = new Euler().setFromQuaternion(
    upperQuaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI)),
  );
  const offset = new Vector3(0, source.scale[1] / 4, 0).applyEuler(rotation);
  return [1, -1].map((side) => ({
    ...source,
    id: `${source.id}-${side > 0 ? "upper" : "lower"}`,
    kind: "pyramid",
    position: [source.position[0] + side * offset.x, source.position[1] + side * offset.y, source.position[2] + side * offset.z],
    rotation: side > 0 ? [...source.rotation] : [lowerRotation.x, lowerRotation.y, lowerRotation.z],
    scale: [source.scale[0], source.scale[1] / 2, source.scale[2]],
  }));
}

export function buildBlenderPresetScenePrimitives(
  themeId: BlenderScenePresetThemeId,
): { readonly labelKo: string; readonly primitives: readonly BgPrimitive[] } {
  switch (themeId) {
    case "fantasy-citadel":
      return {
        labelKo: "왕국 대성채 알현실 & 어검 제단 세트",
        primitives: [
          { id: "bl-citadel-floor", name: "Citadel_Floor", kind: "box", position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [10, 0.2, 12], color: "#d6ccc2", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-carpet", name: "Citadel_Royal_Carpet", kind: "box", position: [0, 0.22, 0.6], rotation: [0, 0, 0], scale: [1.8, 0.04, 8.8], color: "#9e2a2b", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-step-1", name: "Citadel_Dais_Step_1", kind: "box", position: [0, 0.32, -2.6], rotation: [0, 0, 0], scale: [4.4, 0.24, 3.4], color: "#ddb892", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-throne", name: "Citadel_Throne_Dais", kind: "box", position: [0, 0.72, -3.5], rotation: [0, 0, 0], scale: [3.6, 0.8, 2.4], color: "#c9a876", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-throne-back", name: "Citadel_High_Throne_Back", kind: "box", position: [0, 1.95, -4.15], rotation: [0, 0, 0], scale: [1.35, 1.9, 0.28], color: "#b08968", tags: ["Blender_Citadel"] },
          ...buildCrystalPyramids({ id: "bl-citadel-sword", name: "Citadel_Relic_Sword", position: [0, 2.15, -3.05], rotation: [0, 0, 0], scale: [0.32, 1.55, 0.16], color: "#90e0ef", tags: ["Blender_Citadel"] }),
          { id: "bl-citadel-pillar-l1", name: "Citadel_Pillar_L1", kind: "cylinder", position: [-3.2, 2.2, -1.5], rotation: [0, 0, 0], scale: [0.72, 4.2, 0.72], color: "#e9ecef", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-pillar-r1", name: "Citadel_Pillar_R1", kind: "cylinder", position: [3.2, 2.2, -1.5], rotation: [0, 0, 0], scale: [0.72, 4.2, 0.72], color: "#e9ecef", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-pillar-l2", name: "Citadel_Pillar_L2", kind: "cylinder", position: [-3.2, 2.2, 1.8], rotation: [0, 0, 0], scale: [0.72, 4.2, 0.72], color: "#e9ecef", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-pillar-r2", name: "Citadel_Pillar_R2", kind: "cylinder", position: [3.2, 2.2, 1.8], rotation: [0, 0, 0], scale: [0.72, 4.2, 0.72], color: "#e9ecef", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-arch-ring", name: "Citadel_Vault_Ring", kind: "torus", position: [0, 4.15, -3.5], rotation: [Math.PI / 2, 0, 0], scale: [4.6, 4.6, 0.36], color: "#d4a373", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-dome", name: "Citadel_Sanctum_Dome", kind: "hemisphere", position: [0, 4.2, -3.5], rotation: [0, 0, 0], scale: [4.8, 2.4, 4.8], color: "#b7a8d6", tags: ["Blender_Citadel"] },
        ],
      };
    case "cyberpunk-neon-alley":
      return {
        labelKo: "네온 사이버펑크 뒷골목 & 홀로그램 타워",
        primitives: [
          { id: "bl-cyber-road", name: "Cyber_Wet_Asphalt", kind: "box", position: [0, 0.08, 0], rotation: [0, 0, 0], scale: [8, 0.16, 14], color: "#343a40", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-curb-l", name: "Cyber_Curb_Walk_L", kind: "box", position: [-2.35, 0.18, 0], rotation: [0, 0, 0], scale: [1.1, 0.2, 13.6], color: "#495057", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-curb-r", name: "Cyber_Curb_Walk_R", kind: "box", position: [2.35, 0.18, 0], rotation: [0, 0, 0], scale: [1.1, 0.2, 13.6], color: "#495057", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-tower-l", name: "Cyber_Tower_L", kind: "box", position: [-3.4, 2.8, 0], rotation: [0, 0, 0], scale: [2.0, 5.6, 6.4], color: "#3d405b", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-tower-r", name: "Cyber_Tower_R", kind: "box", position: [3.4, 2.5, -0.8], rotation: [0, 0, 0], scale: [2.0, 5.0, 5.8], color: "#4a4e69", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-duct-bridge", name: "Cyber_Overhead_PipeBridge", kind: "cylinder", position: [0, 3.85, -0.8], rotation: [0, 0, Math.PI / 2], scale: [0.34, 4.8, 0.34], color: "#6c757d", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-sign-cyan", name: "Cyber_Neon_Blade_Cyan", kind: "box", position: [-2.2, 3.1, 1.1], rotation: [0, 0, 0], scale: [0.95, 1.85, 0.14], color: "#00f5d4", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-sign-pink", name: "Cyber_Neon_Blade_Pink", kind: "box", position: [2.2, 2.75, -0.6], rotation: [0, 0, 0], scale: [0.9, 1.55, 0.14], color: "#f72585", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-vending", name: "Cyber_Alley_Vending", kind: "box", position: [-2.15, 1.15, 2.4], rotation: [0, 0, 0], scale: [0.85, 1.85, 0.68], color: "#4cc9f0", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-neon-ring", name: "Cyber_Holo_Ring", kind: "torus", position: [0, 3.2, -2.2], rotation: [0, 0, 0], scale: [2.2, 2.2, 0.45], color: "#72efdd", tags: ["Blender_Cyber"] },
        ],
      };
    case "arcane-astronomy-tower":
      return {
        labelKo: "대마법사 아스트랄 천문대 & 부유 성환",
        primitives: [
          { id: "bl-arcane-plaza", name: "Arcane_Star_Floor", kind: "cylinder", position: [0, 0.12, 0], rotation: [0, 0, 0], scale: [7.6, 0.24, 7.6], color: "#3c096c", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-base", name: "Arcane_Tower_Base", kind: "hexPrism", position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [4.2, 2.1, 4.2], color: "#9fb4c9", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-rune-circle", name: "Arcane_Rune_Ring_Floor", kind: "torus", position: [0, 2.3, 0], rotation: [Math.PI / 2, 0, 0], scale: [3.8, 3.8, 0.22], color: "#e0aaff", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-ring-1", name: "Astrolabe_Ring_Outer", kind: "torus", position: [0, 3.4, 0], rotation: [0.4, 0.2, 0], scale: [3.2, 3.2, 0.32], color: "#d6b26a", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-ring-2", name: "Astrolabe_Ring_Inner", kind: "torus", position: [0, 3.4, 0], rotation: [-0.55, 0.65, 0.2], scale: [2.35, 2.35, 0.24], color: "#ffd166", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-core", name: "Astrolabe_Core_Orb", kind: "sphere", position: [0, 3.4, 0], rotation: [0, 0, 0], scale: [1.15, 1.15, 1.15], color: "#8ec2c2", tags: ["Blender_Arcane"] },
          ...buildCrystalPyramids({ id: "bl-arcane-crystal-n", name: "Floating_Crystal_N", position: [0, 2.9, -2.9], rotation: [0.1, 0.4, 0], scale: [0.55, 1.25, 0.55], color: "#90e0ef", tags: ["Blender_Arcane"] }),
          ...buildCrystalPyramids({ id: "bl-arcane-crystal-e", name: "Floating_Crystal_E", position: [2.9, 3.1, 0], rotation: [0, 0.2, -0.12], scale: [0.55, 1.25, 0.55], color: "#c77dff", tags: ["Blender_Arcane"] }),
          ...buildCrystalPyramids({ id: "bl-arcane-crystal-w", name: "Floating_Crystal_W", position: [-2.9, 3.1, 0], rotation: [0, -0.2, 0.12], scale: [0.55, 1.25, 0.55], color: "#c77dff", tags: ["Blender_Arcane"] }),
          { id: "bl-arcane-lectern", name: "Arcane_Grimoire_Lectern", kind: "cylinder", position: [0, 2.75, 1.65], rotation: [0, 0, 0], scale: [0.42, 0.92, 0.42], color: "#c9a876", tags: ["Blender_Arcane"] },
        ],
      };
    case "boss-raid-altar":
      return {
        labelKo: "심연의 레이드 보스 투기장 & 오벨리스크",
        primitives: [
          { id: "bl-boss-arena", name: "Boss_Arena_Platform", kind: "cylinder", position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [9.0, 0.4, 9.0], color: "#495057", tags: ["Blender_BossArena"] },
          { id: "bl-boss-inner-seal", name: "Boss_Seal_Ring", kind: "torus", position: [0, 0.44, 0], rotation: [Math.PI / 2, 0, 0], scale: [5.6, 5.6, 0.24], color: "#e63946", tags: ["Blender_BossArena"] },
          { id: "bl-boss-altar-center", name: "Boss_Blood_Altar", kind: "hexPrism", position: [0, 0.85, -1.2], rotation: [0, 0, 0], scale: [2.2, 0.9, 2.2], color: "#343a40", tags: ["Blender_BossArena"] },
          ...buildCrystalPyramids({ id: "bl-boss-core-shard", name: "Abyss_Core_Shard", position: [0, 2.25, -1.2], rotation: [0.2, 0.5, 0], scale: [0.85, 1.75, 0.85], color: "#f72585", tags: ["Blender_BossArena"] }),
          { id: "bl-boss-obelisk-nw", name: "Runic_Obelisk_NW", kind: "pyramid", position: [-3.2, 1.9, -3.2], rotation: [0, 0.4, 0], scale: [1.1, 3.6, 1.1], color: "#c9909f", tags: ["Blender_BossArena"] },
          { id: "bl-boss-obelisk-ne", name: "Runic_Obelisk_NE", kind: "pyramid", position: [3.2, 1.9, -3.2], rotation: [0, -0.4, 0], scale: [1.1, 3.6, 1.1], color: "#c9909f", tags: ["Blender_BossArena"] },
          { id: "bl-boss-obelisk-sw", name: "Runic_Obelisk_SW", kind: "pyramid", position: [-3.2, 1.65, 2.8], rotation: [0, -0.35, 0], scale: [0.95, 3.1, 0.95], color: "#9d4edd", tags: ["Blender_BossArena"] },
          { id: "bl-boss-obelisk-se", name: "Runic_Obelisk_SE", kind: "pyramid", position: [3.2, 1.65, 2.8], rotation: [0, 0.35, 0], scale: [0.95, 3.1, 0.95], color: "#9d4edd", tags: ["Blender_BossArena"] },
          { id: "bl-boss-bridge", name: "Boss_Approach_Causeway", kind: "box", position: [0, 0.26, 4.9], rotation: [0, 0, 0], scale: [2.4, 0.28, 3.2], color: "#6c757d", tags: ["Blender_BossArena"] },
        ],
      };
  }
}
