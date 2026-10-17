/**
 * 면 모델링 작업공간 명령: 선택한 면에 밀기/당기기·안쪽 테두리·오프셋·면 그리기를 적용한다.
 *
 * 커널(순수 메시 함수)과 작업공간 문서 사이의 얇은 이음매다. 같은 요청으로 두 가지를 한다.
 * - 미리보기: 문서와 되돌리기 기록을 건드리지 않고, 결과 메시를 얹은 "미리보기 작업공간"과 선택을 만든다.
 *   뷰포트가 이 작업공간을 그대로 그리면 끌기 중 결과가 실시간으로 보인다.
 * - 확정: 한 번의 문서 명령으로 커밋한다. 확정은 되돌리기 한 번에 정확히 한 단위로 기록된다.
 *   영역 밀기(extrude 방식)는 기존 영수증 경로를 그대로 쓰고, 나머지는 일반 지오메트리 커밋을 쓴다.
 */

import { mutateStudioSharedObjectGeometry } from "../live/studio-live-2d3d-bridge";
import { hashStudioEditableMesh, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  validateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { hybridDccCommitGeometry } from "./studio-hybrid-dcc-document";
import {
  describeStudioEditableMeshFaceForDrawing,
  drawStudioEditableMeshFacePolygon,
  type StudioFaceDrawingGuide,
} from "./studio-hybrid-dcc-face-modeling-draw";
import {
  insetStudioEditableMeshFacesByDistance,
  offsetStudioEditableMeshFace,
  studioEditableMeshInsetRange,
  studioEditableMeshOffsetRange,
  type StudioOffsetDirection,
} from "./studio-hybrid-dcc-face-modeling-kernel";
import {
  failStudioFaceModeling,
  okStudioFaceModeling,
  STUDIO_FACE_MODELING_LIMITS,
  type StudioFaceModelingFailure,
  type StudioFaceModelingOutcome,
  type StudioFaceModelingResult,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  pushPullStudioEditableMeshFaces,
  studioEditableMeshPushPullRange,
  type StudioFacePushPullMethod,
} from "./studio-hybrid-dcc-face-pushpull";
import {
  workspaceComponentSelectionSource,
  workspaceExtrudeRegionActive,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

import type { StudioPlanarPoint } from "./studio-hybrid-dcc-face-modeling-geometry";

export type StudioFaceModelingTool = "push-pull" | "inset" | "offset" | "draw";

export type StudioFaceModelingRequest =
  | { readonly tool: "push-pull"; readonly distance: number }
  | { readonly tool: "inset"; readonly distance: number }
  | { readonly tool: "offset"; readonly distance: number; readonly direction: StudioOffsetDirection }
  | { readonly tool: "draw"; readonly points: readonly StudioPlanarPoint[] };

/** 패널이 문서에 올리는 편집 함수. 최신 작업공간과 선택을 받아 결과 작업공간과 새 선택을 돌려준다. */
export interface StudioHybridDccWorkspaceEditResult {
  readonly workspace: StudioHybridDccWorkspace;
  readonly selection?: StudioHybridDccComponentSelection;
}
export type StudioHybridDccWorkspaceEdit = (
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
) => StudioHybridDccWorkspaceEditResult;

export interface StudioFaceModelingPlan {
  readonly request: StudioFaceModelingRequest;
  readonly assetId: string;
  readonly sourceMeshHash: string;
  readonly outcome: StudioFaceModelingOutcome;
  /** 밀기/당기기가 쓰는 방식. 다른 도구는 undefined. */
  readonly method?: StudioFacePushPullMethod;
  readonly faceCountBefore: number;
  readonly faceCountAfter: number;
}

export interface StudioFaceModelingPreview {
  readonly plan: StudioFaceModelingPlan;
  /** 결과 메시를 얹은 작업공간. 뷰포트에만 넘기고 문서로 저장하지 않는다. */
  readonly workspace: StudioHybridDccWorkspace;
  /** 미리보기 메시 기준으로 새로 선택될 면. */
  readonly selection: StudioHybridDccComponentSelection;
}

interface ResolvedTarget {
  readonly assetId: string;
  readonly mesh: StudioEditableMesh;
  readonly faceIds: readonly number[];
}

function resolveTarget(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
): StudioFaceModelingResult<ResolvedTarget> {
  const assetId = workspace.activeAssetId;
  const record = assetId ? workspace.session.state.geometry.records[assetId] : undefined;
  if (!assetId || !record) {
    return failStudioFaceModeling("no-active-asset", "no active editable asset");
  }
  if (record.mesh.faces.length > STUDIO_FACE_MODELING_LIMITS.maxMeshFaces) {
    return failStudioFaceModeling("mesh-too-large", "the mesh has too many faces for face modeling");
  }
  if (selection.mode !== "face" || selection.elementIds.length === 0) {
    return failStudioFaceModeling("selection-required", "a face selection is required");
  }
  const source = workspaceComponentSelectionSource(workspace, assetId);
  if (!source || !validateStudioHybridDccComponentSelection(selection, source).ok) {
    return failStudioFaceModeling("selection-stale", "the face selection does not match the current mesh");
  }
  return okStudioFaceModeling({ assetId, mesh: record.mesh, faceIds: selection.elementIds });
}

function firstFace(target: ResolvedTarget): StudioFaceModelingResult<number> {
  return target.faceIds.length === 1
    ? okStudioFaceModeling(target.faceIds[0]!)
    : failStudioFaceModeling("single-face-required", "this tool works on exactly one face", {
      elementIds: target.faceIds,
    });
}

function runKernel(
  target: ResolvedTarget,
  request: StudioFaceModelingRequest,
): StudioFaceModelingResult<{ readonly outcome: StudioFaceModelingOutcome; readonly method?: StudioFacePushPullMethod }> {
  switch (request.tool) {
    case "push-pull": {
      const result = pushPullStudioEditableMeshFaces(target.mesh, target.faceIds, request.distance);
      return result.ok ? okStudioFaceModeling({ outcome: result.value, method: result.value.method }) : result;
    }
    case "inset": {
      const result = insetStudioEditableMeshFacesByDistance(target.mesh, target.faceIds, request.distance);
      return result.ok ? okStudioFaceModeling({ outcome: result.value }) : result;
    }
    case "offset": {
      const face = firstFace(target);
      if (!face.ok) return face;
      const result = offsetStudioEditableMeshFace(target.mesh, face.value, request.distance, request.direction);
      return result.ok ? okStudioFaceModeling({ outcome: result.value }) : result;
    }
    case "draw": {
      const face = firstFace(target);
      if (!face.ok) return face;
      const result = drawStudioEditableMeshFacePolygon(target.mesh, face.value, request.points);
      return result.ok ? okStudioFaceModeling({ outcome: result.value }) : result;
    }
  }
}

/** 요청을 계산만 한다(문서·기록 불변). 실패하면 이유 코드와 허용 최대 거리를 돌려준다. */
export function planStudioHybridDccFaceModeling(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
  request: StudioFaceModelingRequest,
): StudioFaceModelingResult<StudioFaceModelingPlan> {
  const target = resolveTarget(workspace, selection);
  if (!target.ok) return target;
  const result = runKernel(target.value, request);
  if (!result.ok) return result;
  return okStudioFaceModeling({
    request,
    assetId: target.value.assetId,
    sourceMeshHash: workspace.session.state.geometry.records[target.value.assetId]!.meshHash,
    outcome: result.value.outcome,
    ...(result.value.method ? { method: result.value.method } : {}),
    faceCountBefore: target.value.mesh.faces.length,
    faceCountAfter: result.value.outcome.mesh.faces.length,
  });
}

function withPreviewMesh(
  workspace: StudioHybridDccWorkspace,
  assetId: string,
  mesh: StudioEditableMesh,
  meshHash: string,
): StudioHybridDccWorkspace {
  const geometry = workspace.session.state.geometry;
  const record = geometry.records[assetId]!;
  return {
    ...workspace,
    session: {
      ...workspace.session,
      state: {
        ...workspace.session.state,
        geometry: {
          ...geometry,
          records: { ...geometry.records, [assetId]: { ...record, mesh, meshHash, renderCache: null } },
        },
      },
    },
  };
}

function faceSelectionFor(
  assetId: string,
  mesh: StudioEditableMesh,
  meshRevision: number,
  meshHash: string,
  faceIds: readonly number[],
): StudioHybridDccComponentSelection {
  const selection = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids: faceIds,
    activeId: faceIds.at(-1),
    source: { assetId, mesh, meshRevision, sourceHash: meshHash },
  });
  if (selection.ok) return selection.value;
  // 선택을 만들 수 없는 드문 경우에도 면 편집 모드는 유지한다.
  const empty = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids: [],
    source: { assetId, mesh, meshRevision, sourceHash: meshHash },
  });
  return empty.ok ? empty.value : createStudioHybridDccComponentSelection();
}

/** 끌기·입력 중 실시간 미리보기. 문서·되돌리기 기록·저장 상태는 전혀 바뀌지 않는다. */
export function previewStudioHybridDccFaceModeling(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
  request: StudioFaceModelingRequest,
): StudioFaceModelingResult<StudioFaceModelingPreview> {
  const plan = planStudioHybridDccFaceModeling(workspace, selection, request);
  if (!plan.ok) return plan;
  const record = workspace.session.state.geometry.records[plan.value.assetId]!;
  const meshHash = hashStudioEditableMesh(plan.value.outcome.mesh);
  return okStudioFaceModeling({
    plan: plan.value,
    workspace: withPreviewMesh(workspace, plan.value.assetId, plan.value.outcome.mesh, meshHash),
    selection: faceSelectionFor(
      plan.value.assetId,
      plan.value.outcome.mesh,
      record.revision,
      meshHash,
      plan.value.outcome.selectionFaceIds,
    ),
  });
}

function commitMesh(
  workspace: StudioHybridDccWorkspace,
  assetId: string,
  mesh: StudioEditableMesh,
): StudioHybridDccWorkspace {
  const session = hybridDccCommitGeometry(workspace.session, assetId, mesh);
  const bridge = mutateStudioSharedObjectGeometry(workspace.bridge, assetId, hashStudioEditableMesh(mesh));
  return { ...workspace, session, bridge, activeAssetId: assetId };
}

/** 확정이 계획 단계에서 거부됐을 때 던지는 오류. 화면이 이유 코드로 사용자 문장을 만들 수 있게 실패 정보를 싣는다. */
export class StudioFaceModelingCommitError extends Error {
  readonly failure: StudioFaceModelingFailure;

  constructor(failure: StudioFaceModelingFailure) {
    super(failure.detail);
    this.name = "StudioFaceModelingCommitError";
    this.failure = failure;
  }
}

/**
 * 요청을 문서에 확정한다. 한 번의 문서 명령이라 되돌리기 한 번으로 정확히 원래대로 돌아간다.
 * 실패하면 오류를 던진다(패널의 실행 큐가 로그로 보여 준다). 계획 단계 거부는 이유 코드를 실은
 * `StudioFaceModelingCommitError`, 문서 한도 초과 같은 저장 단계 실패는 그대로의 오류다. 화면은 미리보기에서 미리 걸러 낸다.
 */
export function commitStudioHybridDccFaceModeling(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
  request: StudioFaceModelingRequest,
): StudioHybridDccWorkspaceEditResult {
  const plan = planStudioHybridDccFaceModeling(workspace, selection, request);
  if (!plan.ok) throw new StudioFaceModelingCommitError(plan);
  if (plan.value.method === "extrude" && request.tool === "push-pull") {
    // 영수증이 달린 영역 밀기 경로: 선택 재매핑까지 기존 검증을 그대로 따른다.
    const extruded = workspaceExtrudeRegionActive(workspace, selection, request.distance);
    return { workspace: extruded.workspace, selection: extruded.selection };
  }
  const next = commitMesh(workspace, plan.value.assetId, plan.value.outcome.mesh);
  const record = next.session.state.geometry.records[plan.value.assetId]!;
  return {
    workspace: next,
    selection: faceSelectionFor(
      plan.value.assetId,
      record.mesh,
      record.revision,
      record.meshHash,
      plan.value.outcome.selectionFaceIds,
    ),
  };
}

export interface StudioFaceModelingRange {
  /** 허용 거리 구간(밀기/당기기는 음수 포함, 나머지는 0 이상). */
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly method?: StudioFacePushPullMethod;
}

/** 도구별로 지금 선택에서 허용되는 거리 범위. 핸들 범위와 안내 문구에 쓴다. */
export function studioHybridDccFaceModelingRange(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
  tool: Exclude<StudioFaceModelingTool, "draw">,
  direction: StudioOffsetDirection = "inward",
): StudioFaceModelingResult<StudioFaceModelingRange> {
  const target = resolveTarget(workspace, selection);
  if (!target.ok) return target;
  const cap = STUDIO_FACE_MODELING_LIMITS.maxDistance;
  if (tool === "push-pull") {
    const range = studioEditableMeshPushPullRange(target.value.mesh, target.value.faceIds);
    return range.ok
      ? okStudioFaceModeling({
        minDistance: range.value.minDistance,
        maxDistance: range.value.maxDistance,
        method: range.value.method,
      })
      : range;
  }
  if (tool === "inset") {
    const range = studioEditableMeshInsetRange(target.value.mesh, target.value.faceIds);
    return range.ok ? okStudioFaceModeling({ minDistance: 0, maxDistance: Math.min(cap, range.value.maxDistance) }) : range;
  }
  const face = firstFace(target.value);
  if (!face.ok) return face;
  const range = studioEditableMeshOffsetRange(target.value.mesh, face.value, direction);
  return range.ok ? okStudioFaceModeling({ minDistance: 0, maxDistance: Math.min(cap, range.value.maxDistance) }) : range;
}

/** 면 그리기 패드가 쓸 면 윤곽과 좌표계. 한 면이 선택되어 있어야 한다. */
export function studioHybridDccFaceDrawingGuide(
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
): StudioFaceModelingResult<StudioFaceDrawingGuide & { readonly faceId: number }> {
  const target = resolveTarget(workspace, selection);
  if (!target.ok) return target;
  const face = firstFace(target.value);
  if (!face.ok) return face;
  const guide = describeStudioEditableMeshFaceForDrawing(target.value.mesh, face.value);
  return guide.ok ? okStudioFaceModeling({ ...guide.value, faceId: face.value }) : guide;
}
