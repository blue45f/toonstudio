/**
 * Wave 159: 웹툰·만화 2D 캐릭터 자동 본(Bone)·케이지(Cage) 워프 리깅 &
 * 비파괴 포즈 미세 조정(As-Rigid-As-Possible / ARAP 2D Mesh Deformation) 커널 진입점.
 */

import type {
  ArapAuditStatus,
  ArapPinHandle,
  ArapPoseTweakPipelineResult,
  ArapPoseTweakScenario,
  BoneChainPoseSolution,
  CagePolygon2d,
  SafeArapOptions,
  Vec2,
} from "./arap-deform-types";
import { solveSafeArapDeformation } from "./arap-2d-solver";
import {
  createSampleCharacterRigMesh,
  deformPointsWithMvcCage,
  solveBoneChainHandleTargets,
} from "./cage-bone-rig-and-preset";
import { buildArapMeshWarpWgsl, validateArapMeshWarpWgsl } from "./arap-mesh-warp-wgsl";
import {
  computeArapPoseFingerprint,
  renderArapPoseAuditSvg,
  summarizeArapPoseAuditKo,
} from "./arap-deform-report";

export type {
  ArapAdjacencyGraph,
  ArapAuditStatus,
  ArapBodyRegion,
  ArapBoneChain2d,
  ArapBoneJoint2d,
  ArapDistortionAudit,
  ArapEdgeNeighbor,
  ArapIterationRecord,
  ArapMesh2d,
  ArapMeshVertex2d,
  ArapPinHandle,
  ArapPoseTweakPipelineResult,
  ArapPoseTweakScenario,
  ArapSolveResult,
  ArapSolverOptions,
  ArapTriangle,
  ArapWgslBindingDescriptor,
  ArapWgslBundle,
  ArapWgslUniforms,
  ArapWgslValidationResult,
  BoneAngleRequest,
  BoneChainPoseSolution,
  BoneClampAuditItem,
  CagePolygon2d,
  CharacterRigLandmarkIndices,
  CharacterRigPreset,
  Mat2,
  MvcBoundaryKind,
  MvcCoordinateRow,
  SafeArapOptions,
  SafeArapSolveResult,
  Vec2,
} from "./arap-deform-types";

export {
  auditArapMeshDistortion,
  computeArapEdgeWeights,
  extractClosestRotation2d,
  solveArapDeformation,
  solveArapGlobalStepPcg,
  solveArapLocalStep,
  solveSafeArapDeformation,
  triangleSignedArea2d,
  type ArapGlobalStepResult,
} from "./arap-2d-solver";

export {
  computeMeanValueCoordinates2d,
  createSampleCharacterRigMesh,
  deformPointsWithMvcCage,
  solveBoneChainHandleTargets,
} from "./cage-bone-rig-and-preset";

export {
  ARAP_WGSL_FRAGMENT_ENTRY,
  ARAP_WGSL_UNIFORM_BYTE_LENGTH,
  ARAP_WGSL_VERTEX_ENTRY,
  DEFAULT_ARAP_WGSL_UNIFORMS,
  buildArapMeshWarpWgsl,
  validateArapMeshWarpWgsl,
} from "./arap-mesh-warp-wgsl";

export {
  computeArapPoseFingerprint,
  renderArapPoseAuditSvg,
  sha256ArapHex,
  summarizeArapPoseAuditKo,
  type RenderArapPoseAuditSvgParams,
  type SummarizeArapPoseAuditParams,
} from "./arap-deform-report";

export type SampleArapPoseVariant = "gentlePose" | "extremeTwist" | "cageStretch";

function mergeHandlesByVertexIndex(
  primaryHandles: readonly ArapPinHandle[],
  overrideHandles: readonly ArapPinHandle[],
): readonly ArapPinHandle[] {
  const byVertex = new Map<number, ArapPinHandle>();
  for (let i = 0; i < primaryHandles.length; i += 1) {
    byVertex.set(primaryHandles[i].vertexIndex, primaryHandles[i]);
  }
  for (let i = 0; i < overrideHandles.length; i += 1) {
    byVertex.set(overrideHandles[i].vertexIndex, overrideHandles[i]);
  }
  return Array.from(byVertex.values()).sort((a, b) => a.vertexIndex - b.vertexIndex);
}

/**
 * `/studio` 런타임 허브 자체 점검 및 테스트용 대표 2D 캐릭터 포즈 보정 시나리오를 생성한다.
 */
export function createSampleArapPoseScenario(
  variant: SampleArapPoseVariant = "gentlePose",
): ArapPoseTweakScenario {
  const preset = createSampleCharacterRigMesh();

  if (variant === "extremeTwist") {
    const rightWristRest = preset.mesh.vertices[preset.landmarks.rightWrist];
    const rightElbowRest = preset.mesh.vertices[preset.landmarks.rightElbow];
    const extremeHandles: readonly ArapPinHandle[] = [
      ...preset.torsoAnchorHandles,
      {
        id: "extreme-right-elbow",
        labelKo: "오른쪽 팔꿈치 과도 비틀기",
        vertexIndex: preset.landmarks.rightElbow,
        target: { x: rightElbowRest.x - 145, y: rightElbowRest.y + 85 },
        weight: 3000,
      },
      {
        id: "extreme-right-wrist",
        labelKo: "오른쪽 손목 교차 당김",
        vertexIndex: preset.landmarks.rightWrist,
        target: { x: rightWristRest.x - 290, y: rightWristRest.y - 60 },
        weight: 3200,
      },
    ];
    return {
      scenarioId: "wave159-sample-extreme-twist",
      titleKo: "오른팔 극단 비틀기 안전 감쇠 시나리오",
      mesh: preset.mesh,
      extraHandles: extremeHandles,
      solverOptions: {
        maxIterations: 28,
        maxDampingSteps: 14,
      },
    };
  }

  if (variant === "cageStretch") {
    const deformedCage: CagePolygon2d = {
      id: `${preset.restCage.id}-adjusted`,
      labelKo: "미세 상체 기울임 워프 케이지",
      vertices: preset.restCage.vertices.map((pt) => {
        if (pt.y < 140) {
          return { x: pt.x + 12, y: pt.y - 6 };
        }
        return { x: pt.x, y: pt.y };
      }),
    };
    return {
      scenarioId: "wave159-sample-cage-stretch",
      titleKo: "MVC 케이지 상체 기울임 보정 시나리오",
      mesh: preset.mesh,
      extraHandles: [
        ...preset.torsoAnchorHandles,
        {
          id: "cage-head-tilt",
          labelKo: "머리 기울임 핀",
          vertexIndex: preset.landmarks.headCrown,
          target: {
            x: preset.mesh.vertices[preset.landmarks.headCrown].x + 14,
            y: preset.mesh.vertices[preset.landmarks.headCrown].y - 4,
          },
          weight: 2200,
        },
      ],
      cageRest: preset.restCage,
      cageDeformed: deformedCage,
      solverOptions: {
        maxIterations: 24,
      },
    };
  }

  // 기본 시나리오(gentlePose): 오른팔을 자연스럽게 인사하듯 들어 올리는 웹툰 포즈 미세 조정
  return {
    scenarioId: "wave159-sample-gentle-wave-pose",
    titleKo: "웹툰 캐릭터 오른팔 인사 포즈 ARAP 보정",
    mesh: preset.mesh,
    boneChain: preset.rightArmChain,
    boneRequests: [
      { jointId: "rightShoulder", deltaAngleDeg: -22 },
      { jointId: "rightElbow", deltaAngleDeg: -24 },
      { jointId: "rightWrist", deltaAngleDeg: 8 },
    ],
    extraHandles: preset.torsoAnchorHandles,
    cageRest: preset.restCage,
    solverOptions: {
      maxIterations: 28,
      energyTolerance: 1e-6,
      maxDampingSteps: 12,
    },
  };
}

/**
 * Wave 159 전체 파이프라인 오케스트레이터:
 * 본 체인 해부학 각도 제한 FK → (선택적) MVC 케이지 선행 워프 → 안전 ARAP 로컬-글로벌 솔버 →
 * WebGPU WGSL 계약 검증 → FIPS 180-4 SHA-256 포즈 지문 → 순수 OKLCH 감사 SVG → 한국어 QA 요약.
 */
export function runArap2dPoseTweakPipeline(
  scenario: ArapPoseTweakScenario,
): ArapPoseTweakPipelineResult {
  const boneSolution: BoneChainPoseSolution | null = scenario.boneChain
    ? solveBoneChainHandleTargets(scenario.boneChain, scenario.boneRequests ?? [])
    : null;

  let cagePreDeformedPositions: readonly Vec2[] | null = null;
  if (scenario.cageRest && scenario.cageDeformed) {
    const restPoints = scenario.mesh.vertices.map((v) => ({ x: v.x, y: v.y }));
    cagePreDeformedPositions = deformPointsWithMvcCage(
      restPoints,
      scenario.cageRest,
      scenario.cageDeformed,
    );
  }

  const boneHandles = boneSolution ? boneSolution.handles : [];
  const extraHandles = scenario.extraHandles ?? [];
  const mergedHandles = mergeHandlesByVertexIndex(boneHandles, extraHandles);

  const effectiveSolverOptions: SafeArapOptions = {
    ...scenario.solverOptions,
    initialPositions:
      scenario.solverOptions?.initialPositions ?? cagePreDeformedPositions ?? undefined,
  };

  const arapResult = solveSafeArapDeformation(
    scenario.mesh,
    mergedHandles,
    effectiveSolverOptions,
  );

  const wgslBundle = buildArapMeshWarpWgsl({
    activeHandleCount: arapResult.effectiveHandles.length,
    ...scenario.wgslUniforms,
  });
  const wgslValidation = validateArapMeshWarpWgsl(wgslBundle);

  const fingerprintSha256 = computeArapPoseFingerprint(
    scenario.mesh,
    arapResult.deformedPositions,
    arapResult.effectiveHandles,
    arapResult.audit,
  );

  const auditSvg = renderArapPoseAuditSvg({
    titleKo: scenario.titleKo,
    mesh: scenario.mesh,
    deformedPositions: arapResult.deformedPositions,
    handles: arapResult.effectiveHandles,
    audit: arapResult.audit,
    cageRest: scenario.cageRest,
    cageDeformed: scenario.cageDeformed,
  });

  const summaryKo = summarizeArapPoseAuditKo({
    arapResult,
    boneSolution,
    wgslValid: wgslValidation.valid,
  });

  const status: ArapAuditStatus = !wgslValidation.valid ? "FAIL" : arapResult.audit.status;

  return {
    scenarioId: scenario.scenarioId,
    titleKo: scenario.titleKo,
    mesh: scenario.mesh,
    boneSolution,
    cagePreDeformedPositions,
    arapResult,
    wgslBundle,
    wgslValidation,
    fingerprintSha256,
    auditSvg,
    summaryKo,
    status,
  };
}
