import { Euler, Matrix4, Quaternion, Vector3 } from "three";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { collectStudioBg3dEffectivelyVisibleEntityIds, readStudioBg3dHiddenTagSet } from "./studio-bg3d-hierarchy";
import { STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES, STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dModelAttachment, StudioBg3dSceneDocument, StudioBg3dVec3 } from "./studio-bg3d-scene-document-types";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";
import { generateSketchUpLinearArray, parseSketchUpArrayInput } from "./studio-bg3d-sketchup-direct-modeling";
import { calculateStudioBg3dThreeWorldMatrix, decomposeStudioBg3dThreeLocalMatrix } from "./studio-bg3d-three-hierarchy";
import {
  createStudioBg3dWorkbenchInsertionFromHost,
  isStudioBg3dWorkbenchInsertionAvailable,
  type StudioBg3dWorkbenchInsertionHost,
} from "./studio-bg3d-workbench-insertion";

export type StudioBg3dSelectionArrayRequest = { readonly token: string } & (
  | { readonly mode: "linear"; readonly delta: StudioBg3dVec3 }
  | { readonly mode: "radial"; readonly pivot: StudioBg3dVec3; readonly axis: "x" | "y" | "z"; readonly angleDegrees: number }
);

export type StudioBg3dSelectionArrayErrorCode =
  | "selection-unavailable" | "invalid-request" | "invalid-token" | "invalid-selection"
  | "unsupported-transform" | "node-budget-exceeded" | "document-budget-exceeded" | "duplicate-placement" | "admission-rejected";

interface StudioBg3dSelectionArrayFailure {
  readonly ok: false;
  readonly code: StudioBg3dSelectionArrayErrorCode;
  readonly messageKo: string;
}

export type StudioBg3dSelectionArrayResult = StudioBg3dSelectionArrayFailure | {
  readonly ok: true;
  readonly addedNodeCount: number;
  readonly copyCount: number;
  readonly selectedNodeCount: number;
  readonly normalizedToken: string;
};

export type StudioBg3dExecuteSelectionArray = (request: StudioBg3dSelectionArrayRequest) => StudioBg3dSelectionArrayResult;

export interface StudioBg3dSelectionArraySummary {
  readonly selectedPrimitiveCount: number;
  readonly availableNodeCount: number;
  readonly blockedReason: string | null;
}

interface StudioBg3dSelectionArraySource {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document?: StudioBg3dSceneDocument;
}

export interface StudioBg3dSelectionArrayHost extends StudioBg3dWorkbenchInsertionHost {
  readonly selectedIds?: ReadonlySet<string>;
  readonly physicsRuntimeSourceRef?: { readonly current: StudioBg3dSelectionArraySource };
  readonly attachmentByStorageModelIdRef?: { readonly current: ReadonlyMap<string, StudioBg3dModelAttachment> };
}

interface Selection {
  readonly ok: true;
  readonly selected: readonly BgPrimitive[];
  readonly entities: readonly (BgPrimitive | BgCustomModelInstance)[];
  readonly availableNodeCount: number;
  readonly source: StudioBg3dSelectionArraySource;
}

function failure(code: StudioBg3dSelectionArrayErrorCode, messageKo: string): StudioBg3dSelectionArrayFailure {
  return { ok: false, code, messageKo };
}

function finiteTuple(value: StudioBg3dVec3): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

/** 문서 정규화에서 잘리거나 좌우가 뒤집히는 변환은 복제 전에 거부한다. */
function supportedTransform(entity: { readonly position: StudioBg3dVec3; readonly rotation: StudioBg3dVec3; readonly scale: StudioBg3dVec3 }): boolean {
  return finiteTuple(entity.position) && finiteTuple(entity.rotation) && finiteTuple(entity.scale)
    && entity.position.every((value) => Math.abs(value) <= 10_000)
    && entity.scale.every((value) => value >= 0.001 && value <= 1_000);
}

/** 행렬 연산이 허용 경계를 몇 ULP 넘긴 값만 원래 경계로 돌린다. 실제 범위 초과는 그대로 남겨 거부한다. */
function stabilizeBoundary(value: number, min: number, max: number): number {
  const tolerance = Number.EPSILON * 64 * Math.max(1, Math.abs(value), Math.abs(min), Math.abs(max));
  if (value < min && min - value <= tolerance) return min;
  if (value > max && value - max <= tolerance) return max;
  return value;
}

function availableNodes(source: StudioBg3dSelectionArraySource): number {
  const budget = source.document?.budgets.complexity.maxNodes ?? STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES;
  if (!Number.isSafeInteger(budget) || budget < 0) return 0;
  return Math.max(0, Math.min(STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES, budget) - source.primitives.length - source.customModels.length);
}

function readSelection(host: StudioBg3dSelectionArrayHost): Selection | StudioBg3dSelectionArrayFailure {
  const source = host.physicsRuntimeSourceRef?.current;
  if (!isStudioBg3dWorkbenchInsertionAvailable(host) || !source) {
    return failure("selection-unavailable", "현재 장면의 편집이 잠겨 있어 반복 배치할 수 없습니다.");
  }
  const ids = host.selectedIds;
  if (!ids || ids.size === 0) return failure("invalid-selection", "반복 배치할 도형을 선택하세요.");
  const entities = [...source.primitives, ...source.customModels];
  const byId = new Map(entities.map((entity) => [entity.id, entity]));
  if (byId.size !== entities.length || entities.some(({ id }) => !id)) {
    return failure("invalid-selection", "장면의 오브젝트 ID가 중복되거나 비어 있어 반복 배치할 수 없습니다.");
  }
  const primitiveIds = new Set(source.primitives.map(({ id }) => id));
  if ([...ids].some((id) => !primitiveIds.has(id))) {
    return failure("invalid-selection", "선택에 외부 모델이나 사라진 오브젝트가 포함되어 있습니다. 기본 도형만 선택하세요.");
  }
  const selected = source.primitives.filter(({ id }) => ids.has(id));
  const visible = collectStudioBg3dEffectivelyVisibleEntityIds(entities, readStudioBg3dHiddenTagSet(source.document));
  for (const primitive of selected) {
    const seen = new Set<string>();
    let cursor: BgPrimitive | BgCustomModelInstance | undefined = primitive;
    while (cursor) {
      if (seen.has(cursor.id)) return failure("invalid-selection", "선택한 도형의 부모 계층에 순환이 있습니다.");
      seen.add(cursor.id);
      if (cursor.locked === true || !visible.has(cursor.id)) {
        return failure("selection-unavailable", "숨기거나 잠긴 도형은 반복 배치할 수 없습니다. 부모와 숨긴 태그도 확인하세요.");
      }
      if (!supportedTransform(cursor)) {
        return failure("unsupported-transform", "선택한 도형 또는 부모의 변환이 유효하지 않습니다. 위치와 양수 크기 범위를 확인하세요.");
      }
      if (!cursor.parentId) break;
      cursor = byId.get(cursor.parentId);
      if (!cursor) return failure("invalid-selection", "선택한 도형의 부모를 찾을 수 없습니다.");
    }
  }
  return { ok: true, selected, entities, availableNodeCount: availableNodes(source), source };
}

export function inspectStudioBg3dSelectionArrayHost(host: StudioBg3dSelectionArrayHost): StudioBg3dSelectionArraySummary {
  const source = host.physicsRuntimeSourceRef?.current;
  const selection = readSelection(host);
  return {
    selectedPrimitiveCount: source?.primitives.filter(({ id }) => host.selectedIds?.has(id)).length ?? 0,
    availableNodeCount: source ? availableNodes(source) : 0,
    blockedReason: selection.ok ? null : selection.messageKo,
  };
}

interface PlannedArray {
  readonly ok: true;
  readonly primitives: readonly BgPrimitive[];
  readonly copyCount: number;
  readonly selectedNodeCount: number;
  readonly normalizedToken: string;
}

/** 월드 축 회전은 qDelta * qSource 순서다. 기존 Euler 성분에 각도를 더하지 않는다. */
function radialDelta(axis: "x" | "y" | "z", degrees: number, pivot: StudioBg3dVec3): Matrix4 {
  const direction = axis === "x" ? new Vector3(1, 0, 0) : axis === "y" ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1);
  const quaternion = new Quaternion().setFromAxisAngle(direction, degrees * Math.PI / 180);
  const rotation = new Matrix4().makeRotationFromQuaternion(quaternion);
  return new Matrix4().makeTranslation(...pivot).multiply(rotation)
    .multiply(new Matrix4().makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
}

function buildPlan(selection: Selection, request: StudioBg3dSelectionArrayRequest): PlannedArray | StudioBg3dSelectionArrayFailure {
  const command = parseSketchUpArrayInput(request.token);
  if (!command.ok) return failure("invalid-token", command.messageKo);
  const addedNodeCount = selection.selected.length * command.count;
  if (addedNodeCount > selection.availableNodeCount) {
    return failure("node-budget-exceeded", `사본 ${addedNodeCount}개는 현재 추가 가능한 도형 ${selection.availableNodeCount}개를 초과합니다.`);
  }
  // 페인트 자체만으로도 문서 상한을 넘기면 전체 사본을 깊은 복제하거나 직렬화하기 전에 거부한다.
  const encoder = new TextEncoder();
  const paintBytes = (primitive: BgPrimitive) => primitive.texturePaint
    ? encoder.encode(JSON.stringify(primitive.texturePaint)).byteLength : 0;
  const currentPaintBytes = selection.source.primitives.reduce((sum, primitive) => sum + paintBytes(primitive), 0);
  const addedPaintBytes = selection.selected.reduce((sum, primitive) => sum + paintBytes(primitive), 0) * command.count;
  if (currentPaintBytes + addedPaintBytes > STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES) {
    return failure("document-budget-exceeded", "페인트를 포함한 사본이 장면 저장 용량을 초과합니다. 복제 수를 줄이거나 장면을 나누세요.");
  }
  const deltas: Matrix4[] = [];
  if (request.mode === "linear") {
    if (!finiteTuple(request.delta) || request.delta.every((value) => value === 0)) {
      return failure("invalid-request", "간격 또는 전체 거리는 0이 아닌 유효한 숫자로 입력하세요.");
    }
    const placements = generateSketchUpLinearArray({ basePosition: [0, 0, 0], deltaVector: request.delta, command });
    const positions = new Set<string>([JSON.stringify([0, 0, 0])]);
    for (const placement of placements) {
      if (placement.copyIndex === 0) continue;
      const key = JSON.stringify(placement.position);
      if (positions.has(key)) return failure("duplicate-placement", "간격이 너무 작아 사본이 원본이나 다른 사본과 겹칩니다.");
      positions.add(key);
      deltas.push(new Matrix4().makeTranslation(...placement.position));
    }
  } else {
    if (!finiteTuple(request.pivot) || !Number.isFinite(request.angleDegrees) || request.angleDegrees === 0
      || !["x", "y", "z"].includes(request.axis)) {
      return failure("invalid-request", "회전 중심과 축, 0이 아닌 각도를 확인하세요.");
    }
    const step = command.mode === "divide" ? request.angleDegrees / command.count : request.angleDegrees;
    const angles = [0];
    for (let index = 1; index <= command.count; index += 1) {
      const degrees = step * index;
      if (!Number.isFinite(degrees)) return failure("invalid-request", "회전 각도 계산 범위를 초과했습니다.");
      const normalized = ((degrees % 360) + 360) % 360;
      if (angles.some((angle) => Math.min(Math.abs(angle - normalized), 360 - Math.abs(angle - normalized)) < 1e-7)) {
        return failure("duplicate-placement", "360° 끝점이 원본 또는 다른 사본과 겹칩니다. 복제 수나 각도를 줄이세요.");
      }
      angles.push(normalized);
      deltas.push(radialDelta(request.axis, normalized, request.pivot));
    }
  }
  const selectedIds = new Set(selection.selected.map(({ id }) => id));
  const roots = selection.selected.filter(({ parentId }) => !parentId || !selectedIds.has(parentId));
  const rootWorld = new Map<string, Matrix4>();
  for (const root of roots) {
    const world = calculateStudioBg3dThreeWorldMatrix(selection.entities, root.id);
    if (!world || !decomposeStudioBg3dThreeLocalMatrix(world)) {
      return failure("unsupported-transform", "선택 밖 부모의 비균일 크기 때문에 기울어짐이 생깁니다. 부모도 함께 선택하거나 부모 변환을 정리하세요.");
    }
    rootWorld.set(root.id, world);
  }
  const primitives: BgPrimitive[] = [];
  const occupied = new Set(selection.entities.map(({ id }) => id));
  let temporaryOrdinal = 0;
  const nextTemporaryId = () => {
    let id: string;
    do {
      // 최종 UUID ID와 같은 41자로 계산해 문서 바이트 예산을 작게 추정하지 않는다.
      id = `bg3d-array-${String(temporaryOrdinal++).padStart(30, "0")}`;
    } while (occupied.has(id));
    occupied.add(id);
    return id;
  };
  for (const delta of deltas) {
    // 저장 가능성을 판정할 때는 불변 페인트 payload를 공유한다. 실제 추가 경계가 한 번만 깊은 복제한다.
    const copies = selection.selected.map((primitive): BgPrimitive => ({ ...primitive,
      position: [...primitive.position], rotation: [...primitive.rotation], scale: [...primitive.scale] }));
    const copyIds = new Map(copies.map(({ id }) => [id, nextTemporaryId()]));
    for (const primitive of copies) {
      const sourceId = primitive.id;
      const copyId = copyIds.get(sourceId);
      if (!copyId) return failure("invalid-selection", "선택한 도형의 복제 ID를 계산하지 못했습니다.");
      primitive.id = copyId;
      const parentCopyId = primitive.parentId ? copyIds.get(primitive.parentId) : undefined;
      primitive.parentId = parentCopyId ?? null;
      if (primitive.linkedSourceId) {
        const linkedCopyId = copyIds.get(primitive.linkedSourceId);
        if (linkedCopyId) primitive.linkedSourceId = linkedCopyId;
        else delete primitive.linkedSourceId;
      }
      // 복제한 부모 아래의 local 변환은 그대로 둬 부모·자식에 델타가 두 번 적용되지 않게 한다.
      if (!parentCopyId) {
        const world = rootWorld.get(sourceId);
        const transformed = world ? decomposeStudioBg3dThreeLocalMatrix(delta.clone().multiply(world)) : null;
        if (!transformed) {
          return failure("unsupported-transform", "복제 결과가 장면의 위치 또는 크기 범위를 초과하거나 변환을 보존할 수 없습니다.");
        }
        primitive.position = [stabilizeBoundary(transformed.position[0], -10_000, 10_000),
          stabilizeBoundary(transformed.position[1], -10_000, 10_000), stabilizeBoundary(transformed.position[2], -10_000, 10_000)];
        // 직렬화가 π를 -π로 바꾸어도 다음 저장에서 좌표가 다시 바뀌지 않는 정규형을 쓴다.
        const rotation = new Euler(...transformed.rotation, "XYZ");
        const wrap = (angle: number) => (((angle + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        primitive.rotation = [wrap(rotation.x), wrap(rotation.y), wrap(rotation.z)];
        primitive.scale = [stabilizeBoundary(transformed.scale[0], 0.001, 1_000),
          stabilizeBoundary(transformed.scale[1], 0.001, 1_000), stabilizeBoundary(transformed.scale[2], 0.001, 1_000)];
        if (!supportedTransform(primitive)) {
          return failure("unsupported-transform", "복제 결과가 장면의 위치 또는 크기 범위를 초과합니다.");
        }
      }
      primitives.push(primitive);
    }
  }
  return { ok: true, primitives, copyCount: command.count, selectedNodeCount: selection.selected.length, normalizedToken: command.normalizedToken };
}

/** 선택·잠금·현재 예산은 클릭 시 다시 읽고, 사본 전체를 한 번의 공식 추가 명령으로 보낸다. */
export function createStudioBg3dSelectionArrayFromHost(host: StudioBg3dSelectionArrayHost): StudioBg3dExecuteSelectionArray {
  const insert = createStudioBg3dWorkbenchInsertionFromHost(host, { selectAll: true, immediateHistory: true });
  return (request) => {
    const selection = readSelection(host);
    if (!selection.ok) return selection;
    const plan = buildPlan(selection, request);
    if (!plan.ok) return plan;
    const candidate = [...selection.source.primitives, ...plan.primitives];
    const adapted = tryAdaptStudioBg3dRuntimeToDocument({
      primitives: candidate, customModels: selection.source.customModels,
      attachmentByStorageModelId: host.attachmentByStorageModelIdRef?.current ?? new Map<string, StudioBg3dModelAttachment>(),
      ...(selection.source.document ? { baseDocument: selection.source.document } : {}),
    });
    if (!adapted.ok || adapted.value.counts.droppedPrimitives !== 0 || adapted.value.counts.droppedCustomModels !== 0
      || adapted.value.counts.emittedPrimitives !== candidate.length
      || adapted.value.counts.emittedCustomModels !== selection.source.customModels.length) {
      return failure("document-budget-exceeded", "사본과 기존 모델·페인트를 손실 없이 저장할 수 없습니다. 장면 용량과 모델 연결을 확인하세요.");
    }
    if (!insert(plan.primitives, "선택 도형 반복 배치")) {
      return failure("admission-rejected", "장면이 잠겼거나 추가할 수 없어 반복 배치를 반영하지 못했습니다.");
    }
    return { ok: true, addedNodeCount: plan.primitives.length, copyCount: plan.copyCount,
      selectedNodeCount: plan.selectedNodeCount, normalizedToken: plan.normalizedToken };
  };
}
