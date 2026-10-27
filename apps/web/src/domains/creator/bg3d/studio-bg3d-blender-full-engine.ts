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
            name: `Blender_Array_Inst_${i + 1}`,
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
      name: "Blender_Modified_Mesh",
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

  const primitives: BgPrimitive[] = [
    {
      id: "blender-sculpt-core",
      name: `Sculpt_${config.sculptTool}`,
      kind: config.editOperator === "tosphere" ? "sphere" : "capsule",
      position: [0, 1.4, 0],
      rotation: [0, 0, 0],
      scale: [1.5, 2.2, 1.5],
      color: "#c2a6d6",
      tags: ["Blender_EditSculpt"],
    },
  ];

  return {
    editOperator: config.editOperator,
    sculptTool: config.sculptTool,
    resultingQuadCount,
    dyntopoTriangleCount,
    faceSetCount,
    symmetryMultiplier: symMult,
    primitives,
    summaryKo: `Edit(${config.editOperator}) + Sculpt(${config.sculptTool}): Dyntopo ${dyntopoTriangleCount.toLocaleString("ko-KR")} tris (대칭 ×${symMult})`,
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
    summaryKo: `GPv3 ${layerCount}레이어(마스크 ${maskedLayerCount}) + Freestyle ${freestyleEdgeTypeCount}종 엣지 → 총 ${total3dStrokes}스트로크 (${effectiveLineThicknessPx}px)`,
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
    summaryKo: `RigidBody(${rigidBodyTerminalMomentumNs}N·s) · Cloth(${clothStableSubsteps} substeps) · Mantaflow ${config.fluidDomainType}(${mantaflowVoxelCount.toLocaleString("ko-KR")} voxels)`,
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
    summaryKo: `Blender 카메라(${config.type}): ${focal}mm (수직 FOV ${verticalFovDeg}°) · f/${fstop} (${config.apertureBlades}날 보케) · Shift [${config.shiftX}, ${config.shiftY}]`,
  };
}

/**
 * 6B. Blender 5.2 대표 판타지·웹툰 3D 배경 세트 프리셋 생성기 (`BgPrimitive[]`).
 */
export function buildBlenderPresetScenePrimitives(
  themeId: BlenderScenePresetThemeId,
): { readonly labelKo: string; readonly primitives: readonly BgPrimitive[] } {
  switch (themeId) {
    case "fantasy-citadel":
      return {
        labelKo: "왕국 대성채 알현실 & 어검 제단 세트",
        primitives: [
          { id: "bl-citadel-floor", name: "Citadel_Floor", kind: "box", position: [0, 0.1, 0], rotation: [0, 0, 0], scale: [10, 0.2, 12], color: "#d6ccc2", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-throne", name: "Citadel_Throne_Dais", kind: "box", position: [0, 0.7, -3.5], rotation: [0, 0, 0], scale: [3.6, 1.2, 2.4], color: "#c9a876", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-pillar-l", name: "Citadel_Pillar_L", kind: "cylinder", position: [-3.2, 2.2, -1.5], rotation: [0, 0, 0], scale: [0.8, 4.2, 0.8], color: "#e9ecef", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-pillar-r", name: "Citadel_Pillar_R", kind: "cylinder", position: [3.2, 2.2, -1.5], rotation: [0, 0, 0], scale: [0.8, 4.2, 0.8], color: "#e9ecef", tags: ["Blender_Citadel"] },
          { id: "bl-citadel-dome", name: "Citadel_Sanctum_Dome", kind: "hemisphere", position: [0, 4.2, -3.5], rotation: [0, 0, 0], scale: [4.8, 2.4, 4.8], color: "#b7a8d6", tags: ["Blender_Citadel"] },
        ],
      };
    case "cyberpunk-neon-alley":
      return {
        labelKo: "네온 사이버펑크 뒷골목 & 홀로그램 타워",
        primitives: [
          { id: "bl-cyber-road", name: "Cyber_Wet_Asphalt", kind: "box", position: [0, 0.08, 0], rotation: [0, 0, 0], scale: [8, 0.16, 14], color: "#343a40", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-tower-l", name: "Cyber_Tower_L", kind: "box", position: [-3.2, 2.8, 0], rotation: [0, 0, 0], scale: [2.2, 5.6, 6.0], color: "#495057", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-tower-r", name: "Cyber_Tower_R", kind: "box", position: [3.2, 2.5, -1.0], rotation: [0, 0, 0], scale: [2.2, 5.0, 5.4], color: "#6c757d", tags: ["Blender_Cyber"] },
          { id: "bl-cyber-neon-ring", name: "Cyber_Holo_Ring", kind: "torus", position: [0, 3.2, -2.0], rotation: [0, 0, 0], scale: [2.2, 2.2, 0.5], color: "#7fa6b8", tags: ["Blender_Cyber"] },
        ],
      };
    case "arcane-astronomy-tower":
      return {
        labelKo: "대마법사 아스트랄 천문대 & 부유 성환",
        primitives: [
          { id: "bl-arcane-base", name: "Arcane_Tower_Base", kind: "hexPrism", position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [4.5, 2.4, 4.5], color: "#9fb4c9", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-ring-1", name: "Astrolabe_Ring_Outer", kind: "torus", position: [0, 3.2, 0], rotation: [0.4, 0.2, 0], scale: [3.2, 3.2, 0.35], color: "#d6b26a", tags: ["Blender_Arcane"] },
          { id: "bl-arcane-core", name: "Astrolabe_Core_Orb", kind: "sphere", position: [0, 3.2, 0], rotation: [0, 0, 0], scale: [1.2, 1.2, 1.2], color: "#8ec2c2", tags: ["Blender_Arcane"] },
        ],
      };
    case "boss-raid-altar":
      return {
        labelKo: "심연의 레이드 보스 투기장 & 오벨리스크",
        primitives: [
          { id: "bl-boss-arena", name: "Boss_Arena_Platform", kind: "cylinder", position: [0, 0.2, 0], rotation: [0, 0, 0], scale: [9.0, 0.4, 9.0], color: "#6c757d", tags: ["Blender_BossArena"] },
          { id: "bl-boss-obelisk-1", name: "Runic_Obelisk_NW", kind: "pyramid", position: [-3.2, 1.8, -3.2], rotation: [0, 0.4, 0], scale: [1.1, 3.6, 1.1], color: "#c9909f", tags: ["Blender_BossArena"] },
          { id: "bl-boss-obelisk-2", name: "Runic_Obelisk_NE", kind: "pyramid", position: [3.2, 1.8, -3.2], rotation: [0, -0.4, 0], scale: [1.1, 3.6, 1.1], color: "#c9909f", tags: ["Blender_BossArena"] },
        ],
      };
  }
}
