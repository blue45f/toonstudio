/** 측정값을 포함한 사용자 템플릿의 저장·재적용 사전 검증. 쓰기 포트는 호출하지 않는다. */
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { createStudioBg3dHistorySnapshot } from "./studio-bg3d-editor-derivations";
import { canonicalizeStudioBg3dCommandState } from "./studio-bg3d-command-core";
import {
  allocateStudioBg3dMeasurementGuideId,
  parseStudioBg3dMeasurementDocument,
  serializeStudioBg3dMeasurementDocument,
  STUDIO_BG3D_MEASUREMENT_MAX_GUIDES,
  type StudioBg3dMeasurementGuide,
} from "./studio-bg3d-measurement";
import { readStudioBg3dSceneMeasurements } from "./studio-bg3d-scene-measurements";
import {
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dCameraSettings,
  type StudioBg3dModelAttachment,
  type StudioBg3dSceneDocument,
  type StudioBg3dSceneNode,
} from "./studio-bg3d-scene-document";
import {
  tryAdaptStudioBg3dRuntimeToDocument,
  type StudioBg3dDocumentToRuntimeResult,
  type StudioBg3dRuntimeToDocumentInput,
  type StudioBg3dRuntimeToDocumentResult,
} from "./studio-bg3d-scene-runtime";
import { allocateStudioBg3dTemplateInstanceNodeIds } from "./studio-bg3d-template-instance";

interface TemplateSnapshot {
  readonly primitives: readonly BgPrimitive[];
  readonly customModels: readonly BgCustomModelInstance[];
  readonly document: StudioBg3dSceneDocument;
}

function rejectTemplate(): never {
  throw new Error("측정 안내선과 오브젝트를 손실 없이 저장할 수 없어 템플릿을 반영하지 않았습니다.");
}

export function hasStudioBg3dTemplateMeasurements(document: StudioBg3dSceneDocument): boolean {
  return Object.prototype.hasOwnProperty.call(document, "measurements");
}

/** 가이드만 있는 장면도 저장할 콘텐츠다. 잘못된 필드는 빈 장면으로 복구하지 않는다. */
export function hasStudioBg3dTemplateContent(snapshot: TemplateSnapshot): boolean {
  return snapshot.primitives.length > 0 || snapshot.customModels.length > 0
    || readStudioBg3dSceneMeasurements(snapshot.document).guides.length > 0;
}

/** 어댑터가 소유하지 않는 그림자 플래그는 정본에서, TRS와 페인트는 최신 런타임에서 가져온다. */
function preserveTemplateNodeMetadata(
  node: StudioBg3dSceneNode,
  source: StudioBg3dSceneNode | undefined,
  primitive: BgPrimitive | undefined,
  model: BgCustomModelInstance | undefined,
): StudioBg3dSceneNode {
  const runtime = node.kind === "primitive" ? primitive : model;
  if (!runtime) rejectTemplate();
  const transform = {
    position: [runtime.position[0], runtime.position[1], runtime.position[2]] as const,
    // 회전의 동치 각도는 기존 어댑터의 [-π, π] 정본을 사용한다. 위치·배율 절삭은 허용하지 않는다.
    rotation: node.transform.rotation,
    scale: [runtime.scale[0], runtime.scale[1], runtime.scale[2]] as const,
  };
  const shadow = {
    castsShadow: source?.castsShadow ?? node.castsShadow,
    receivesShadow: source?.receivesShadow ?? node.receivesShadow,
  };
  if (node.kind === "model") return { ...node, ...shadow, transform };
  if (!primitive) rejectTemplate();
  const { texturePaint: _adaptedPaint, ...withoutPaint } = node;
  // 빈/삭제된 런타임 페인트를 옛 문서의 획으로 되살리지 않는다. 유입 획은 아래 전체 코덱이
  // 검증하므로 어댑터의 관대한 정규화가 획·UV·색을 바꿨어도 조용히 저장하지 않는다.
  return { ...withoutPaint, ...shadow, transform,
    ...(primitive.texturePaint === undefined ? {} : { texturePaint: primitive.texturePaint }) };
}

function losslessTemplateDocument(
  input: StudioBg3dRuntimeToDocumentInput,
  metadataNodes: readonly StudioBg3dSceneNode[] = input.baseDocument?.nodes ?? [],
): StudioBg3dRuntimeToDocumentResult {
  const base = input.baseDocument;
  if (!base || !serializeStudioBg3dSceneDocument(base)) rejectTemplate();
  const attempt = tryAdaptStudioBg3dRuntimeToDocument(input);
  if (!attempt.ok) rejectTemplate();
  const result = attempt.value;
  if (result.diagnostics.length !== 0 || result.omittedDiagnosticCount !== 0
    || result.counts.inputPrimitives !== input.primitives.length
    || result.counts.inputCustomModels !== input.customModels.length
    || result.counts.emittedPrimitives !== input.primitives.length
    || result.counts.emittedCustomModels !== input.customModels.length
    || result.counts.droppedPrimitives !== 0 || result.counts.droppedCustomModels !== 0
    || serializeStudioBg3dSceneDocument(result.document) !== result.serialized
    || serializeStudioBg3dMeasurementDocument(readStudioBg3dSceneMeasurements(result.document))
      !== serializeStudioBg3dMeasurementDocument(readStudioBg3dSceneMeasurements(input.baseDocument ?? result.document))) {
    rejectTemplate();
  }
  const sources = new Map(metadataNodes.map((node) => [node.id, node]));
  const primitives = new Map(input.primitives.map((primitive) => [primitive.id, primitive]));
  const models = new Map(input.customModels.map((model) => [model.id, model]));
  const nodes = result.document.nodes.map((node) => preserveTemplateNodeMetadata(
    node, sources.get(node.id), primitives.get(node.id), models.get(node.id),
  ));
  const attachments = new Map(base.attachments.map((attachment) => [attachment.id, attachment]));
  for (const attachment of result.document.attachments) {
    const previous = attachments.get(attachment.id);
    if (previous && canonicalizeStudioBg3dCommandState(previous) !== canonicalizeStudioBg3dCommandState(attachment)) rejectTemplate();
    attachments.set(attachment.id, attachment);
  }
  // 정본 루트와 기존 첨부 메타는 유지한다. 새 노드는 최신 런타임 id·형상·TRS에 정본 플래그를 합친다.
  const serialized = serializeStudioBg3dSceneDocument({ ...base, nodes, attachments: [...attachments.values()] });
  const document = serialized === null ? null : parseStudioBg3dSceneDocument(serialized);
  if (!document || serialized === null) rejectTemplate();
  return { ...result, document, serialized };
}

/** 저장은 최신 런타임 배열과 시점을 하나의 엄격한 장면 코덱에 합친다. */
export function prepareStudioBg3dTemplateSave(input: {
  readonly snapshot: TemplateSnapshot;
  readonly camera: StudioBg3dCameraSettings;
  readonly attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>;
}): StudioBg3dRuntimeToDocumentResult {
  if (!hasStudioBg3dTemplateContent(input.snapshot)) rejectTemplate();
  return losslessTemplateDocument({
    primitives: input.snapshot.primitives,
    customModels: input.snapshot.customModels,
    baseDocument: { ...input.snapshot.document, camera: input.camera },
    attachmentByStorageModelId: input.attachmentByStorageModelId,
  });
}

/** 기존 가이드의 ID·좌표·단위를 보존하며, 유입 가이드의 충돌 ID만 새로 할당한다. */
export function mergeStudioBg3dTemplateMeasurements(
  destination: StudioBg3dSceneDocument,
  template: StudioBg3dSceneDocument,
): StudioBg3dSceneDocument {
  if (!hasStudioBg3dTemplateMeasurements(template)) return destination;
  if (!serializeStudioBg3dSceneDocument(destination) || !serializeStudioBg3dSceneDocument(template)) rejectTemplate();
  const current = readStudioBg3dSceneMeasurements(destination);
  const incoming = readStudioBg3dSceneMeasurements(template);
  if (current.guides.length + incoming.guides.length > STUDIO_BG3D_MEASUREMENT_MAX_GUIDES) rejectTemplate();
  const guides: StudioBg3dMeasurementGuide[] = [...current.guides];
  const occupied = new Set(current.guides.map((guide) => guide.id));
  // 뒤에 오는 충돌 없는 원본 ID를 앞선 재할당이 먼저 차지하지 않도록 모두 예약한다.
  const reserved = [...new Set([...occupied, ...incoming.guides.map((guide) => guide.id)])]
    .map((id) => ({ id }));
  for (const guide of incoming.guides) {
    let id = guide.id;
    if (occupied.has(id)) {
      const allocated = allocateStudioBg3dMeasurementGuideId(reserved);
      if (!allocated) rejectTemplate();
      id = allocated;
      reserved.push({ id });
    }
    occupied.add(id);
    guides.push(id === guide.id ? guide : { ...guide, id });
  }
  const serialized = serializeStudioBg3dMeasurementDocument({
    ...current,
    unit: current.guides.length > 0 ? current.unit : incoming.unit,
    guides,
  });
  const measurements = serialized === null ? null : parseStudioBg3dMeasurementDocument(serialized);
  if (!measurements) rejectTemplate();
  const document = { ...destination, measurements };
  if (!serializeStudioBg3dSceneDocument(document)) rejectTemplate();
  return document;
}

/** 가이드 전용 템플릿에는 노드 인스턴스가 없으므로 노드 ID 할당을 하지 않는다. */
export function allocateStudioBg3dMeasurementTemplateNodeIds(input: {
  readonly document: StudioBg3dSceneDocument;
  readonly sourceId: string;
  readonly occupiedNodeIds: ReadonlySet<string>;
  readonly createSeed: () => string;
}): readonly string[] | null {
  if (input.document.nodes.length === 0) {
    return readStudioBg3dSceneMeasurements(input.document).guides.length > 0 ? [] : null;
  }
  return allocateStudioBg3dTemplateInstanceNodeIds({
    sourceKind: "user",
    sourceId: input.sourceId,
    insertionOffset: 0,
    nodeCount: input.document.nodes.length,
    occupiedNodeIds: input.occupiedNodeIds,
    createSeed: input.createSeed,
  })?.nodeIds ?? null;
}

/** 복원기의 실패·진단·입출력 개수를 쓰기 전에 모두 확인한다. */
export function assertStudioBg3dTemplateHydration(
  document: StudioBg3dSceneDocument,
  hydrated: StudioBg3dDocumentToRuntimeResult,
): void {
  const primitives = document.nodes.filter((node) => node.kind === "primitive").length;
  const models = document.nodes.length - primitives;
  if (!hydrated.ok || hydrated.diagnostics.length !== 0 || hydrated.omittedDiagnosticCount !== 0
    || hydrated.counts.inputPrimitives !== primitives || hydrated.counts.inputCustomModels !== models
    || hydrated.counts.emittedPrimitives !== primitives || hydrated.counts.emittedCustomModels !== models
    || hydrated.counts.droppedPrimitives !== 0 || hydrated.counts.droppedCustomModels !== 0
    || hydrated.primitives.length !== primitives || hydrated.customModels.length !== models) rejectTemplate();
}

/** 비동기 준비 중 추가된 기존 첨부는 유지하고, 실제 삽입 모델의 첨부만 합친다. */
export function mergeStudioBg3dTemplateAttachmentMaps(input: {
  readonly currentAttachments: ReadonlyMap<string, StudioBg3dModelAttachment>;
  readonly currentStorageIds: ReadonlyMap<string, string>;
  readonly templateAttachments: ReadonlyMap<string, StudioBg3dModelAttachment>;
  readonly insertedModels: readonly BgCustomModelInstance[];
}) {
  const attachments = new Map(input.currentAttachments);
  const storageIds = new Map(input.currentStorageIds);
  const candidates: StudioBg3dModelAttachment[] = [];
  for (const model of input.insertedModels) {
    const attachment = input.templateAttachments.get(model.modelId);
    if (!attachment) rejectTemplate();
    const current = attachments.get(model.modelId);
    if (current && canonicalizeStudioBg3dCommandState(current) !== canonicalizeStudioBg3dCommandState(attachment)) rejectTemplate();
    const storageId = storageIds.get(attachment.id);
    if (storageId !== undefined && storageId !== model.modelId) rejectTemplate();
    attachments.set(model.modelId, attachment);
    storageIds.set(attachment.id, model.modelId);
    candidates.push(attachment);
  }
  return { attachments, storageIds, candidates };
}

/** 전체 320 KiB와 중첩 64 KiB를 포함한 검증이 끝난 사본만 history/scene 쓰기에 넘긴다. */
export function prepareStudioBg3dMeasurementTemplateInsertion(input: {
  readonly current: TemplateSnapshot;
  readonly template: StudioBg3dSceneDocument;
  readonly insertedPrimitives: readonly BgPrimitive[];
  readonly insertedModels: readonly BgCustomModelInstance[];
  readonly attachmentByStorageModelId: ReadonlyMap<string, StudioBg3dModelAttachment>;
}) {
  const primitives = [...input.current.primitives, ...input.insertedPrimitives];
  const customModels = [...input.current.customModels, ...input.insertedModels];
  const document = mergeStudioBg3dTemplateMeasurements(input.current.document, input.template);
  const adapted = losslessTemplateDocument({
    primitives, customModels, baseDocument: document,
    attachmentByStorageModelId: input.attachmentByStorageModelId,
  }, [...input.current.document.nodes, ...input.template.nodes]);
  return {
    primitives, customModels, document: adapted.document,
    before: createStudioBg3dHistorySnapshot(input.current),
    includesMeasurements: hasStudioBg3dTemplateMeasurements(input.template),
  };
}
