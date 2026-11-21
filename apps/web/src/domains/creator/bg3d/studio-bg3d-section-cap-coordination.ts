/**
 * 단면 절단 평면(Section Plane)과 가림 벽 자동 투명화(Wall Cutaway)의 통합 조율 브리지.
 * `studio-bg3d-section-plane-caps.ts`의 `clipMeshBySectionPlane`과
 * `coordinateSectionPlanesWithCutaway`를 실시간 3D 뷰포트 및 UI 배지에 연결한다.
 */

import {
  computeStudioBg3dSectionPlane,
  type StudioBg3dSectionPlaneState,
} from "./studio-bg3d-section-plane";
import {
  clipMeshBySectionPlane,
  coordinateSectionPlanesWithCutaway,
  type Bg3dSectionPlane,
  type CombinedCutawayAndSectionState,
  type SectionableSolidMesh,
} from "./studio-bg3d-section-plane-caps";
import {
  evaluateCameraWallCutaway,
  type Bg3dCutawayCameraInput,
  type Bg3dWallCutawayConfig,
  type Bg3dWallCutawayEvaluation,
} from "./studio-bg3d-wall-cutaway-runtime";

export interface StudioBg3dSectionCapSummary {
  readonly enabled: boolean;
  readonly cutawayEnabled: boolean;
  readonly activeSectionPlaneCount: number;
  readonly cutawayHiddenWallCount: number;
  readonly effectiveRenderStrategy: CombinedCutawayAndSectionState["effectiveRenderStrategy"];
  readonly capLoopCount: number;
  readonly capTriangleCount: number;
  readonly capAreaM2: number;
}

const REFERENCE_CAP_HALF_EXTENT = 1.5;

function createUnitReferenceBoxTriangles(halfExtent: number): SectionableSolidMesh {
  const s = halfExtent;
  const positions = new Float32Array([
    -s, 0, -s, s, 0, -s, s, 2 * s, -s, -s, 2 * s, -s,
    -s, 0, s, s, 0, s, s, 2 * s, s, -s, 2 * s, s,
  ]);
  const indices = new Uint32Array([
    0, 2, 1, 0, 3, 2,
    4, 5, 6, 4, 6, 7,
    0, 4, 7, 0, 7, 3,
    1, 2, 6, 1, 6, 5,
    3, 7, 6, 3, 6, 2,
    0, 1, 5, 0, 5, 4,
  ]);
  return { positions, indices };
}

/**
 * 활성 단면 평면(Section Plane)과 가림 벽 자동 투명화(Wall Cutaway)를
 * 충돌 없이 공존하도록 조율하고 닫힌 단면 캡(Solid Cap) 기하 통계를 산출한다.
 */
export function evaluateStudioBg3dSectionCapCoordination(
  sectionPlane: StudioBg3dSectionPlaneState,
  cutawayConfig: Bg3dWallCutawayConfig,
  options: {
    readonly cutawayEvaluation?: Bg3dWallCutawayEvaluation | null;
    readonly camera?: Bg3dCutawayCameraInput | null;
    readonly referenceHalfExtent?: number;
  } = {},
): {
  readonly summary: StudioBg3dSectionCapSummary;
  readonly capPositions: Float32Array | null;
  readonly capNormals: Float32Array | null;
  readonly capIndices: Uint32Array | null;
} {
  const equation = computeStudioBg3dSectionPlane(sectionPlane);
  const halfExtent = options.referenceHalfExtent ?? REFERENCE_CAP_HALF_EXTENT;

  const effectiveCutawayEvaluation: Bg3dWallCutawayEvaluation | null =
    options.cutawayEvaluation !== undefined
      ? options.cutawayEvaluation
      : cutawayConfig.enabled
        ? evaluateCameraWallCutaway({
            camera: options.camera ?? { position: [0, 1.6, 5.2], target: [0, 1.2, 0] },
            room: { center: [0, halfExtent, 0], size: [halfExtent * 2, halfExtent * 2, halfExtent * 2] },
            config: cutawayConfig,
          })
        : null;

  const sectionSpecs: Bg3dSectionPlane[] = equation
    ? [
        {
          id: `section-${sectionPlane.axis}`,
          labelKo: `${sectionPlane.axis.toUpperCase()}축 단면`,
          enabled: true,
          originWorldM: [
            sectionPlane.axis === "x" ? sectionPlane.offset : 0,
            sectionPlane.axis === "y" ? sectionPlane.offset : 0,
            sectionPlane.axis === "z" ? sectionPlane.offset : 0,
          ],
          keepNormalWorld: [equation.normal[0], equation.normal[1], equation.normal[2]],
          capStyle: "architectural-hatch",
          capColorToken: "var(--color-warn)",
          hatchSpacingM: 0.25,
          hatchAngleDeg: 45,
        },
      ]
    : [];

  const coordinated = coordinateSectionPlanesWithCutaway(sectionSpecs, effectiveCutawayEvaluation);

  if (!equation || coordinated.activeSectionPlanes.length === 0) {
    return {
      summary: {
        enabled: false,
        cutawayEnabled: cutawayConfig.enabled,
        activeSectionPlaneCount: 0,
        cutawayHiddenWallCount: coordinated.shadowPreservingWallRoles.length,
        effectiveRenderStrategy: coordinated.effectiveRenderStrategy,
        capLoopCount: 0,
        capTriangleCount: 0,
        capAreaM2: 0,
      },
      capPositions: null,
      capNormals: null,
      capIndices: null,
    };
  }

  const primaryPlane = coordinated.activeSectionPlanes[0]!;
  const clipped = clipMeshBySectionPlane(
    createUnitReferenceBoxTriangles(halfExtent),
    primaryPlane,
  );

  return {
    summary: {
      enabled: true,
      cutawayEnabled: cutawayConfig.enabled,
      activeSectionPlaneCount: coordinated.activeSectionPlanes.length,
      cutawayHiddenWallCount: coordinated.shadowPreservingWallRoles.length,
      effectiveRenderStrategy: coordinated.effectiveRenderStrategy,
      capLoopCount: clipped.capContourLoops.length,
      capTriangleCount: clipped.capTriangleCount,
      capAreaM2: clipped.capAreaM2,
    },
    capPositions: clipped.capPositions.length > 0 ? clipped.capPositions : null,
    capNormals: clipped.capNormals.length > 0 ? clipped.capNormals : null,
    capIndices: clipped.capIndices.length > 0 ? clipped.capIndices : null,
  };
}
