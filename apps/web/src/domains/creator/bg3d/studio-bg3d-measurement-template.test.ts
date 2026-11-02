import { describe, expect, it } from "vitest";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import { instantiateBg3dTemplateDocument } from "./bg3d-template-library";
import {
  createStudioBg3dMeasurementDocument,
  serializeStudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementGuide,
  type StudioBg3dMeasurementUnit,
} from "./studio-bg3d-measurement";
import {
  allocateStudioBg3dMeasurementTemplateNodeIds,
  assertStudioBg3dTemplateHydration,
  hasStudioBg3dTemplateContent,
  mergeStudioBg3dTemplateMeasurements,
  prepareStudioBg3dMeasurementTemplateInsertion,
  prepareStudioBg3dTemplateSave,
} from "./studio-bg3d-measurement-template";
import {
  createDefaultStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  STUDIO_BG3D_GLB_MIME,
  type StudioBg3dPrimitiveNode,
  type StudioBg3dSceneDocument,
  type StudioBg3dTexturePaint,
  type StudioBg3dModelAttachment,
} from "./studio-bg3d-scene-document";
import { hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";

function guide(id: string, long = false): StudioBg3dMeasurementGuide {
  return {
    id, kind: "distance", visible: false, lockedLengthMeters: null,
    startWorld: long ? [1234.123456789123, -2345.234567891234, 3456.345678912345] : [1, 2, 3],
    endWorld: long ? [4567.456789123456, -5678.567891234567, 6789.678912345678] : [1, 4, 3],
  };
}

function scene(guides: readonly StudioBg3dMeasurementGuide[], unit: StudioBg3dMeasurementUnit = "cm"): StudioBg3dSceneDocument {
  return { ...createDefaultStudioBg3dSceneDocument(), measurements: {
    ...createStudioBg3dMeasurementDocument(unit), guides,
  } };
}

function box(id: string): BgPrimitive {
  return { id, kind: "box", color: "#abcdef", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

function paint(color: string): StudioBg3dTexturePaint {
  return { version: 1, strokes: [{ color, size: 0.04, opacity: 1, points: [[0.25, 0.5], [0.75, 0.5]] }] };
}

function paintedScene(id: string, color: string): StudioBg3dSceneDocument {
  const node: StudioBg3dPrimitiveNode = {
    id, name: "그림자와 획 보존", kind: "primitive", primitiveKind: "box", color: "#abcdef",
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parentId: null, visible: true, locked: false, castsShadow: false, receivesShadow: false,
    texturePaint: paint(color),
  };
  return { ...scene([guide("paint-guide")]), meta: { name: "보존할 장면", memo: "원래 메타데이터" }, nodes: [node] };
}

function insertion(current: StudioBg3dSceneDocument, template: StudioBg3dSceneDocument, insertedPrimitives: readonly BgPrimitive[] = []) {
  return prepareStudioBg3dMeasurementTemplateInsertion({
    current: { primitives: [], customModels: [], document: current }, template,
    insertedPrimitives, insertedModels: [], attachmentByStorageModelId: new Map(),
  });
}

describe("측정 안내선 템플릿의 정본 준비", () => {
  it("도형이 없는 가이드 장면을 저장하고 재개방·노드 할당·복원한다", () => {
    const document = scene([guide("floor-pick")], "mm");
    const snapshot = { primitives: [], customModels: [], document };
    expect(hasStudioBg3dTemplateContent(snapshot)).toBe(true);
    const saved = prepareStudioBg3dTemplateSave({ snapshot, camera: document.camera, attachmentByStorageModelId: new Map() });
    const reopened = parseStudioBg3dSceneDocument(saved.serialized);
    if (!reopened) throw new Error("측정 템플릿을 다시 열지 못했습니다.");
    expect(reopened.nodes).toEqual([]);
    expect(reopened.measurements).toEqual(document.measurements);
    expect(allocateStudioBg3dMeasurementTemplateNodeIds({
      document: reopened, sourceId: "floor", occupiedNodeIds: new Set(),
      createSeed: () => { throw new Error("노드 없는 템플릿에서 호출하면 안 됩니다."); },
    })).toEqual([]);
    const instantiated = instantiateBg3dTemplateDocument(reopened, new Set(), () => "unused");
    if (!instantiated) throw new Error("가이드 전용 템플릿 인스턴스가 필요합니다.");
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: instantiated.document, storageModelIdByAttachmentId: new Map() });
    expect(() => assertStudioBg3dTemplateHydration(instantiated.document, hydrated)).not.toThrow();
    expect(insertion(createDefaultStudioBg3dSceneDocument(), instantiated.document).document.measurements)
      .toEqual(document.measurements);
  });

  it("가이드도 없는 빈 장면은 저장 콘텐츠로 승격하지 않는다", () => {
    const document = scene([], "mm");
    expect(hasStudioBg3dTemplateContent({ primitives: [], customModels: [], document })).toBe(false);
    expect(allocateStudioBg3dMeasurementTemplateNodeIds({ document, sourceId: "empty", occupiedNodeIds: new Set(), createSeed: () => "seed" })).toBeNull();
  });

  it("저장에서는 정본 그림자 설정과 최신 런타임 TRS·페인트를 함께 보존한다", () => {
    const document = paintedScene("existing", "#ff0000");
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map() });
    const latest: BgPrimitive = { ...hydrated.primitives[0], ...box("existing"),
      name: "그림자와 획 보존", position: [7, 8, 9], rotation: [0.1, 0.2, 0.3], scale: [2, 3, 4], texturePaint: paint("#0000ff") };
    const saved = prepareStudioBg3dTemplateSave({ snapshot: { primitives: [latest], customModels: [], document },
      camera: document.camera, attachmentByStorageModelId: new Map() });
    expect(saved.document.nodes[0]).toMatchObject({ castsShadow: false, receivesShadow: false,
      transform: { position: latest.position, scale: latest.scale }, texturePaint: latest.texturePaint });
    for (let index = 0; index < 3; index += 1) {
      expect(saved.document.nodes[0]?.transform.rotation[index]).toBeCloseTo(latest.rotation[index], 12);
    }
    expect(saved.document.meta).toEqual(document.meta);
    expect(parseStudioBg3dSceneDocument(saved.serialized)?.nodes).toEqual(saved.document.nodes);
    expect(document.nodes[0]).toMatchObject({ texturePaint: paint("#ff0000"), transform: { position: [0, 0.5, 0] } });
  });

  it("가이드 전용 적용은 기존 노드 메타데이터를 바꾸지 않는다", () => {
    const document = paintedScene("existing", "#ff0000");
    const current = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map() });
    const prepared = prepareStudioBg3dMeasurementTemplateInsertion({ current: { ...current, document },
      template: scene([guide("new-guide")]), insertedPrimitives: [], insertedModels: [], attachmentByStorageModelId: new Map() });
    expect(prepared.document.nodes).toEqual(document.nodes);
    expect(prepared.document.meta).toEqual(document.meta);
    expect(prepared.document.nodes[0]).toMatchObject({ castsShadow: false, receivesShadow: false, texturePaint: paint("#ff0000") });
  });

  it("형상과 가이드를 합칠 때 기존·신규 노드의 그림자 설정과 획을 유지한다", () => {
    const document = paintedScene("existing", "#ff0000");
    const current = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map() });
    const instantiated = instantiateBg3dTemplateDocument(paintedScene("template", "#0000ff"), new Set(["existing"]), () => "inserted");
    if (!instantiated) throw new Error("그림자와 획을 가진 템플릿이 필요합니다.");
    const inserted = hydrateStudioBg3dDocumentToRuntime({ document: instantiated.document, storageModelIdByAttachmentId: new Map() });
    const prepared = prepareStudioBg3dMeasurementTemplateInsertion({ current: { ...current, document }, template: instantiated.document,
      insertedPrimitives: inserted.primitives, insertedModels: [], attachmentByStorageModelId: new Map() });
    expect(prepared.document.nodes.find((node) => node.id === "existing"))
      .toMatchObject({ castsShadow: false, receivesShadow: false, texturePaint: paint("#ff0000") });
    expect(prepared.document.nodes.find((node) => node.id === "inserted"))
      .toMatchObject({ castsShadow: false, receivesShadow: false, texturePaint: paint("#0000ff") });
    expect(prepared.document.meta).toEqual(document.meta);
  });

  it("런타임에서 삭제한 획은 되살리지 않고 조용히 정규화될 획·TRS는 거부한다", () => {
    const document = paintedScene("existing", "#ff0000");
    const prepare = (primitive: BgPrimitive) => prepareStudioBg3dTemplateSave({
      snapshot: { primitives: [primitive], customModels: [], document }, camera: document.camera, attachmentByStorageModelId: new Map(),
    });
    expect(prepare(box("existing")).document.nodes[0]).not.toHaveProperty("texturePaint");
    expect(() => prepare({ ...box("existing"), texturePaint: { version: 1,
      strokes: [{ color: "#ff0000", size: 0.04, opacity: 1, points: [[0.123456, 0.5]] }] } })).toThrow();
    expect(() => prepare({ ...box("existing"), position: [2_000_000, 0, 0] })).toThrow();
  });

  it("모델의 false 그림자 플래그와 사용하지 않는 정본 첨부 메타도 보존한다", () => {
    const used: StudioBg3dModelAttachment = {
      id: "used-attachment", name: "보존 모델.glb", mime: STUDIO_BG3D_GLB_MIME, byteSize: 1024,
      hash: `sha256:${"a".repeat(64)}`, source: "upload",
      rights: { status: "owned", commercialUse: true, attributionRequired: false },
    };
    const unused: StudioBg3dModelAttachment = { ...used, id: "unused-attachment", hash: `sha256:${"b".repeat(64)}` };
    const document: StudioBg3dSceneDocument = { ...scene([guide("model-guide")]), attachments: [used, unused], nodes: [{
      id: "model-node", name: "보존 모델", kind: "model", attachmentId: used.id,
      transform: { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] }, parentId: null,
      visible: true, locked: false, castsShadow: false, receivesShadow: false,
    }] };
    const runtime = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map([[used.id, "local-model"]]) });
    const first = runtime.customModels[0];
    if (!first) throw new Error("정본 그림자 플래그를 가진 모델이 필요합니다.");
    const latest: BgCustomModelInstance = { ...first, position: [9, 8, 7] };
    const saved = prepareStudioBg3dTemplateSave({ snapshot: { primitives: [], customModels: [latest], document },
      camera: document.camera, attachmentByStorageModelId: new Map([["local-model", used]]) });
    expect(saved.document.nodes[0]).toMatchObject({ castsShadow: false, receivesShadow: false, transform: { position: [9, 8, 7] } });
    expect(saved.document.attachments).toEqual([used, unused]);
  });

  it("기존 ID와 world 미터 좌표·잠금·숨김을 보존하고 충돌한 유입 ID만 재할당한다", () => {
    const current = scene([{ ...guide("measure-guide-0001"), lockedLengthMeters: 2 }], "mm");
    const incoming = scene([guide("measure-guide-0001"), guide("measure-guide-0002"), guide("source-other")], "m");
    const before = serializeStudioBg3dSceneDocument(current);
    const merged = mergeStudioBg3dTemplateMeasurements(current, incoming);
    expect(merged.measurements?.unit).toBe("mm");
    expect(merged.measurements?.guides[0]).toEqual(current.measurements?.guides[0]);
    expect(merged.measurements?.guides.map((item) => item.id)).toEqual([
      "measure-guide-0001", "measure-guide-0003", "measure-guide-0002", "source-other",
    ]);
    expect(merged.measurements?.guides[1]).toEqual({ ...incoming.measurements?.guides[0], id: "measure-guide-0003" });
    expect(serializeStudioBg3dSceneDocument(current)).toBe(before);
    expect(incoming.measurements?.guides[0]?.id).toBe("measure-guide-0001");
  });

  it.each([createDefaultStudioBg3dSceneDocument(), scene([], "cm")])(
    "기존 가이드가 없으면 템플릿 단위를 사용한다", (current) => {
      expect(mergeStudioBg3dTemplateMeasurements(current, scene([guide("new")], "m")).measurements?.unit).toBe("m");
    },
  );

  it("측정 필드가 없는 구템플릿은 기존 측정값과 루트 설정을 바꾸지 않는다", () => {
    const current = scene([guide("existing")], "mm");
    const result = insertion(current, createDefaultStudioBg3dSceneDocument(), [box("new-box")]);
    expect(result.includesMeasurements).toBe(false);
    expect(result.document.measurements).toEqual(current.measurements);
    expect(result.document.camera).toEqual(current.camera);
    expect(result.document.nodes.map((node) => node.id)).toEqual(["new-box"]);
  });

  it("중복 원본 ID나 잘못된 중첩 문서를 재할당으로 숨기지 않는다", () => {
    const duplicate = scene([guide("duplicate"), guide("duplicate")]);
    expect(() => insertion(scene([guide("kept")]), duplicate)).toThrow();
  });

  it("합산 257개를 일부만 남기지 않고 거부한다", () => {
    const current = scene(Array.from({ length: 256 }, (_, index) => guide(`kept-${index}`)));
    expect(serializeStudioBg3dSceneDocument(current)).not.toBeNull();
    const before = serializeStudioBg3dSceneDocument(current);
    expect(() => insertion(current, scene([guide("incoming")]))).toThrow();
    expect(serializeStudioBg3dSceneDocument(current)).toBe(before);
  });

  it("각 입력은 유효해도 합산 측정 64 KiB를 초과하면 모두 거부한다", () => {
    const current = scene(Array.from({ length: 128 }, (_, index) => guide(`kept-${index}`.padEnd(80, "x"), true)));
    const incoming = scene(Array.from({ length: 128 }, (_, index) => guide(`new-${index}`.padEnd(80, "x"), true)));
    expect(serializeStudioBg3dSceneDocument(current)).not.toBeNull();
    expect(serializeStudioBg3dSceneDocument(incoming)).not.toBeNull();
    const combined: StudioBg3dMeasurementDocument = {
      ...createStudioBg3dMeasurementDocument("cm"),
      guides: [...(current.measurements?.guides ?? []), ...(incoming.measurements?.guides ?? [])],
    };
    expect(new TextEncoder().encode(JSON.stringify(combined)).byteLength).toBeGreaterThan(64 * 1024);
    expect(serializeStudioBg3dMeasurementDocument(combined)).toBeNull();
    expect(() => insertion(current, incoming)).toThrow();
  });

  it("측정값과 형상을 합친 실제 장면이 320 KiB를 넘으면 사전 검증에서 거부한다", () => {
    const base = createDefaultStudioBg3dSceneDocument();
    const nodes: StudioBg3dPrimitiveNode[] = Array.from({ length: 512 }, (_, index) => ({
      id: `budget-node-${index}`, name: "가".repeat(80), kind: "primitive", primitiveKind: "box", color: "#abcdef",
      transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      parentId: null, visible: true, locked: false, castsShadow: true, receivesShadow: true,
    }));
    const large: StudioBg3dSceneDocument = { ...base,
      budgets: { ...base.budgets, complexity: { ...base.budgets.complexity, maxNodes: 512 } }, nodes,
      shots: Array.from({ length: 3 }, (_, index) => ({ id: `budget-shot-${index}`, name: "예산 컷",
        nodeVisibility: nodes.map((node) => ({ nodeId: node.id, visible: true })) })),
    };
    const serialized = serializeStudioBg3dSceneDocument(large);
    if (!serialized) throw new Error("경계 안의 큰 장면이 필요합니다.");
    expect(new TextEncoder().encode(serialized).byteLength).toBeLessThanOrEqual(STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES);
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: large, storageModelIdByAttachmentId: new Map() });
    const incoming = scene(Array.from({ length: 256 }, (_, index) => guide(`new-${index}`)));
    expect(() => prepareStudioBg3dMeasurementTemplateInsertion({ current: { ...hydrated, document: large }, template: incoming,
      insertedPrimitives: [], insertedModels: [], attachmentByStorageModelId: new Map() })).toThrow();
    expect(serializeStudioBg3dSceneDocument(large)).toBe(serialized);
  });

  it("복원 진단과 입출력 개수의 불일치를 거부한다", () => {
    const document = scene([guide("guide")]);
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document, storageModelIdByAttachmentId: new Map() });
    expect(() => assertStudioBg3dTemplateHydration(document, { ...hydrated,
      counts: { ...hydrated.counts, inputPrimitives: 1 } })).toThrow();
    expect(() => assertStudioBg3dTemplateHydration(document, { ...hydrated, omittedDiagnosticCount: 1 })).toThrow();
  });
});
