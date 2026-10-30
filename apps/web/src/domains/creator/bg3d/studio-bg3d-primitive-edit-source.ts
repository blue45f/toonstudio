import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { collectStudioBg3dEffectivelyVisibleEntityIds, readStudioBg3dHiddenTagSet } from "./studio-bg3d-hierarchy";
import {
  DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES,
  normalizeStudioBg3dGlbAttachment,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import type { StudioBg3dModelAttachment, StudioBg3dPrimitiveNode, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document-types";
import { tryAdaptStudioBg3dRuntimeToDocument } from "./studio-bg3d-scene-runtime";

export interface StudioBg3dPrimitiveEditRuntime {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

export interface StudioBg3dPrimitiveEditSourceHost {
  readonly open: boolean;
  readonly selectedIds?: ReadonlySet<string>;
  readonly selectedIdsRef?: { readonly current: ReadonlySet<string> };
  readonly physicsRuntimeSourceRef: { readonly current: StudioBg3dPrimitiveEditRuntime };
  readonly modalAssetSessionRef: { readonly current: object | null };
  readonly attachmentByStorageModelIdRef: { readonly current: ReadonlyMap<string, StudioBg3dModelAttachment> };
  isPrimitiveEditInteractionLocked(): boolean;
}

export type StudioBg3dPrimitiveEditSourceFailureCode =
  | "selection-unavailable" | "invalid-selection" | "unsupported-source" | "unsupported-material"
  | "invalid-source" | "document-rejected" | "session-changed" | "source-changed";

export interface StudioBg3dPrimitiveEditSourceFailure {
  readonly ok: false;
  readonly code: StudioBg3dPrimitiveEditSourceFailureCode;
  readonly messageKo: string;
}

export interface StudioBg3dPrimitiveEditSourceSnapshot {
  readonly modalSession: object;
  readonly sourceNodeId: string;
  /** 선택한 노드의 정본 JSON이다. 무관한 노드·카메라 변경은 원본 변경으로 취급하지 않는다. */
  readonly canonicalFingerprint: string;
  readonly primitive: BgPrimitive;
  readonly canonicalNode: StudioBg3dPrimitiveNode;
}

export interface StudioBg3dPrimitiveEditSourceSummary {
  readonly nodeId: string | null;
  readonly name: string;
  readonly blockedReason: string | null;
}

export type StudioBg3dPrimitiveEditSourceResult = StudioBg3dPrimitiveEditSourceFailure | {
  readonly ok: true;
  readonly snapshot: StudioBg3dPrimitiveEditSourceSnapshot;
};

export type StudioBg3dPrimitiveEditSourceValidation = StudioBg3dPrimitiveEditSourceFailure | {
  readonly ok: true;
  readonly primitive: BgPrimitive;
  readonly runtime: StudioBg3dPrimitiveEditRuntime;
  readonly document: StudioBg3dSceneDocument;
  readonly node: StudioBg3dPrimitiveNode;
};

const snapshots = new WeakSet<StudioBg3dPrimitiveEditSourceSnapshot>();
const DEFAULT_KEYS = Object.keys(DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE);

function failure(code: StudioBg3dPrimitiveEditSourceFailureCode, messageKo: string): StudioBg3dPrimitiveEditSourceFailure {
  return { ok: false, code, messageKo };
}

function neutralMaterial(primitive: BgPrimitive): boolean {
  if (primitive.materialOverride === undefined) return true;
  const values: Readonly<Record<string, unknown>> = { ...primitive.materialOverride };
  return Object.keys(values).every((key) => DEFAULT_KEYS.includes(key))
    && Object.entries(DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE).every(([key, value]) => values[key] === value);
}

function validTransform(primitive: BgPrimitive): boolean {
  const tuple = (values: readonly number[], min: number, max: number) => Array.isArray(values)
    && values.length === 3 && [0, 1, 2].every((index) => Object.hasOwn(values, index)
      && typeof values[index] === "number" && Number.isFinite(values[index]) && values[index] >= min && values[index] <= max);
  return tuple(primitive.position, -10_000, 10_000) && tuple(primitive.rotation, -Math.PI, Math.PI)
    && tuple(primitive.scale, 0.001, 1_000) && /^#[a-f0-9]{6}$/iu.test(primitive.color);
}

function resolveSelection(host: StudioBg3dPrimitiveEditSourceHost): StudioBg3dPrimitiveEditSourceFailure | {
  readonly ok: true; readonly primitive: BgPrimitive; readonly runtime: StudioBg3dPrimitiveEditRuntime;
} {
  if (host.open !== true || !host.modalAssetSessionRef.current || host.isPrimitiveEditInteractionLocked()) {
    return failure("selection-unavailable", "현재 장면의 편집이 잠겨 있습니다. 진행 중인 작업이 끝난 뒤 다시 시도하세요.");
  }
  const runtime = host.physicsRuntimeSourceRef.current;
  const ids = host.selectedIdsRef?.current ?? host.selectedIds;
  if (!ids || ids.size !== 1) return failure("invalid-selection", "직접 편집할 기본 상자 하나만 선택하세요.");
  const selectedId = ids.values().next().value;
  const entities = [...runtime.primitives, ...runtime.customModels];
  if (entities.length > STUDIO_BG3D_SCENE_DOCUMENT_MAX_NODES || new Set(entities.map(({ id }) => id)).size !== entities.length) {
    return failure("invalid-source", "장면의 오브젝트 개수 또는 ID가 올바르지 않아 편집을 시작할 수 없습니다.");
  }
  const primitive = runtime.primitives.find(({ id }) => id === selectedId);
  if (!primitive || primitive.kind !== "box") return failure("unsupported-source", "현재는 기본 상자만 원본을 직접 편집할 수 있습니다.");
  if (primitive.parentId != null || entities.some(({ parentId }) => parentId === primitive.id)
    || primitive.componentRef !== undefined || primitive.linkedSourceId !== undefined
    || entities.some(({ linkedSourceId }) => linkedSourceId === primitive.id)) {
    return failure("unsupported-source", "부모·자식·컴포넌트·연결 복제 관계가 없는 독립 상자만 지원합니다.");
  }
  const visible = collectStudioBg3dEffectivelyVisibleEntityIds(entities, readStudioBg3dHiddenTagSet(runtime.document));
  if (!visible.has(primitive.id) || primitive.locked === true) {
    return failure("selection-unavailable", "숨기거나 잠긴 상자는 편집할 수 없습니다. 숨긴 태그도 확인하세요.");
  }
  if (primitive.texturePaint !== undefined || primitive.surface !== undefined || !neutralMaterial(primitive)) {
    return failure("unsupported-material", "표면 페인트·절차 재질·재질 조정이 없는 기본 단색 상자만 지원합니다.");
  }
  if (!validTransform(primitive)) return failure("invalid-source", "상자의 위치·회전·크기·색상이 정본 범위를 벗어났습니다.");
  return { ok: true, primitive, runtime };
}

function canonicalSelection(host: StudioBg3dPrimitiveEditSourceHost): StudioBg3dPrimitiveEditSourceValidation {
  const selected = resolveSelection(host);
  if (!selected.ok) return selected;
  if (!serializeStudioBg3dSceneDocument(selected.runtime.document)) {
    return failure("document-rejected", "현재 장면을 손실 없이 저장할 수 없어 편집을 시작하지 않았습니다.");
  }
  if (selected.runtime.document.nodes.some((node) => node.castsShadow === false || node.receivesShadow === false)) {
    return failure("document-rejected", "장면에 그림자 투사 또는 수신이 꺼진 노드가 있어 직접 편집을 진행할 수 없습니다. 이 설정을 유지한 원본 교체는 아직 지원하지 않습니다.");
  }
  const adapted = tryAdaptStudioBg3dRuntimeToDocument({
    ...selected.runtime, baseDocument: selected.runtime.document,
    attachmentByStorageModelId: host.attachmentByStorageModelIdRef.current,
  });
  if (!adapted.ok || adapted.value.counts.droppedPrimitives !== 0 || adapted.value.counts.droppedCustomModels !== 0
    || adapted.value.counts.emittedPrimitives !== selected.runtime.primitives.length
    || adapted.value.counts.emittedCustomModels !== selected.runtime.customModels.length
    || adapted.value.diagnostics.length > 0) {
    return failure("document-rejected", "현재 장면의 노드·모델 원본을 손실 없이 확인할 수 없습니다.");
  }
  const attachments = new Map(adapted.value.document.attachments.map((attachment) => [attachment.id, JSON.stringify(attachment)]));
  if (selected.runtime.document.attachments.some((attachment) =>
    attachments.get(attachment.id) !== JSON.stringify(normalizeStudioBg3dGlbAttachment(attachment)))) {
    return failure("document-rejected", "기존 모델 원본 연결이 현재 장면 변환에서 누락되거나 달라져 직접 편집을 진행할 수 없습니다. 기존 원본 정보를 보존하기 위해 교체하지 않았습니다.");
  }
  const node = adapted.value.document.nodes.find(({ id }) => id === selected.primitive.id);
  if (!node || node.kind !== "primitive" || node.primitiveKind !== "box") return failure("invalid-source", "선택한 상자의 정본을 찾지 못했습니다.");
  if ((selected.primitive.name !== undefined && selected.primitive.name !== node.name)
    || JSON.stringify([...(selected.primitive.tags ?? [])].sort()) !== JSON.stringify([...(node.tags ?? [])].sort())) {
    return failure("invalid-source", "상자의 이름·태그를 정본으로 손실 없이 보존할 수 없습니다.");
  }
  return { ...selected, document: adapted.value.document, node };
}

/** UI 안내는 선택·가시성·지원 범위만 검사한다. 정본 전체 사본은 실제 편집 시작 시 만든다. */
export function inspectStudioBg3dPrimitiveEditSource(host: StudioBg3dPrimitiveEditSourceHost): StudioBg3dPrimitiveEditSourceSummary {
  try {
    const selected = resolveSelection(host);
    return selected.ok ? { nodeId: selected.primitive.id, name: selected.primitive.name || "상자", blockedReason: null }
      : { nodeId: null, name: "", blockedReason: selected.messageKo };
  } catch {
    return { nodeId: null, name: "", blockedReason: "현재 상자 정보를 읽지 못했습니다. 다시 시도하세요." };
  }
}

/** 비동기 모델링 동안 원본 객체를 공유하지 않고, session identity와 정본 노드 지문을 보존한다. */
export function captureStudioBg3dPrimitiveEditSource(host: StudioBg3dPrimitiveEditSourceHost): StudioBg3dPrimitiveEditSourceResult {
  try {
    const selected = canonicalSelection(host);
    if (!selected.ok) return selected;
    const modalSession = host.modalAssetSessionRef.current;
    if (!modalSession) return failure("session-changed", "편집기 세션이 바뀌었습니다. 상자를 다시 선택하세요.");
    const primitive: BgPrimitive = { ...selected.primitive, position: [...selected.primitive.position],
      rotation: [...selected.primitive.rotation], scale: [...selected.primitive.scale],
      ...(selected.primitive.tags ? { tags: Object.freeze([...selected.primitive.tags]) } : {}),
      ...(selected.primitive.materialOverride ? { materialOverride: Object.freeze({ ...selected.primitive.materialOverride }) } : {}) };
    Object.freeze(primitive.position); Object.freeze(primitive.rotation); Object.freeze(primitive.scale); Object.freeze(primitive);
    const snapshot = Object.freeze({ modalSession, sourceNodeId: primitive.id, canonicalFingerprint: JSON.stringify(selected.node),
      primitive, canonicalNode: selected.node });
    snapshots.add(snapshot);
    return { ok: true, snapshot };
  } catch {
    return failure("document-rejected", "현재 장면의 안전한 원본 사본을 만들지 못했습니다.");
  }
}

/** 저장·admission을 기다린 뒤에도 원본이 같은 선택·세션·정본인지 재확인한다. */
export function revalidateStudioBg3dPrimitiveEditSource(
  host: StudioBg3dPrimitiveEditSourceHost,
  snapshot: StudioBg3dPrimitiveEditSourceSnapshot,
): StudioBg3dPrimitiveEditSourceValidation {
  try {
    if (!snapshots.has(snapshot)) return failure("source-changed", "확인되지 않은 원본 사본입니다. 편집을 다시 시작하세요.");
    if (host.modalAssetSessionRef.current !== snapshot.modalSession) return failure("session-changed", "편집기 세션이 바뀌어 원본을 교체하지 않았습니다.");
    const current = canonicalSelection(host);
    if (!current.ok) return current;
    if (current.primitive.id !== snapshot.sourceNodeId || JSON.stringify(current.node) !== snapshot.canonicalFingerprint) {
      return failure("source-changed", "원본 상자가 편집 중에 바뀌었습니다. 최신 원본에서 다시 시작하세요.");
    }
    return current;
  } catch {
    return failure("source-changed", "현재 원본을 확인하지 못해 교체하지 않았습니다.");
  }
}
