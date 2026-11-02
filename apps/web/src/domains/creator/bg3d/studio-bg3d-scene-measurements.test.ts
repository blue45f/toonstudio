import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createStudioSpatialMeasurementDocument,
  DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS,
  serializeStudioSpatialMeasurementDocument,
} from "@toonstudio/studio-project-model/spatial-measurement";

import { instantiateBg3dTemplateDocument } from "./bg3d-template-library";
import {
  createStudioBg3dMeasurementDocument,
  serializeStudioBg3dMeasurementDocument,
  STUDIO_BG3D_MEASUREMENT_MAX_BYTES,
  STUDIO_BG3D_MEASUREMENT_MAX_GUIDES,
  type StudioBg3dMeasurementDocument,
  type StudioBg3dMeasurementGuide,
} from "./studio-bg3d-measurement";
import {
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  createDefaultStudioBg3dSceneDocument,
  migrateStudioBg3dSceneDocument,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES,
  StudioBg3dSceneDocumentBudgetError,
  type StudioBg3dPrimitiveNode,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS,
  readStudioBg3dSceneMeasurements,
  StudioBg3dSceneMeasurementsValidationError,
} from "./studio-bg3d-scene-measurements";
import {
  adaptStudioBg3dRuntimeToDocument,
  hydrateStudioBg3dDocumentToRuntime,
} from "./studio-bg3d-scene-runtime";

const encoder = new TextEncoder();
const DEFAULT_DOCUMENT_SHA256 = "df55d009ebe7c37bec88083e5a48df63ad81a1d851e569cf0e422db727d0a8fb";

function measurements(count = 1, longCoordinates = false): StudioBg3dMeasurementDocument {
  return {
    ...createStudioBg3dMeasurementDocument("cm"),
    guides: Array.from({ length: count }, (_, index): StudioBg3dMeasurementGuide => ({
      id: longCoordinates ? `guide-${index}`.padEnd(80, "x") : `guide-${index}`,
      kind: "distance",
      startWorld: longCoordinates
        ? [1234.123456789123, -2345.234567891234, 3456.345678912345]
        : [0, 0, 0],
      endWorld: longCoordinates
        ? [4567.456789123456, -5678.567891234567, 6789.678912345678]
        : [1, 0, 0],
      lockedLengthMeters: null,
      visible: index % 2 === 0,
    })),
  };
}

function serializedDocument(document: unknown): string {
  const serialized = serializeStudioBg3dSceneDocument(document);
  if (serialized === null) throw new Error("장면 테스트 문서가 엄격 저장 경계를 통과하지 못했습니다.");
  return serialized;
}

function canonicalDocument(document: unknown): StudioBg3dSceneDocument {
  const parsed = parseStudioBg3dSceneDocument(serializedDocument(document));
  if (!parsed) throw new Error("장면 테스트 문서를 다시 열지 못했습니다.");
  return parsed;
}

function primitive(id: string, name = "측정 대상"): StudioBg3dPrimitiveNode {
  return {
    id,
    name,
    kind: "primitive",
    primitiveKind: "box",
    color: "#abcdef",
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parentId: null,
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
  };
}

function oldSchemaDocument(version: 1 | 2): Record<string, unknown> {
  const current = createDefaultStudioBg3dSceneDocument();
  const { nearClip: _nearClip, up: _up, orthographicHeight: _height, ...camera } = current.camera;
  const {
    maxAnimations: _animations, maxAnimationChannels: _channels,
    maxAnimationKeyframes: _keyframes, maxAnimationValues: _values,
    maxSkins: _skins, maxJoints: _joints, maxMorphTargets: _morphs,
    maxAccessorElements: _elements, maxDecodedGeometryBytes: _geometry,
    ...oldComplexity
  } = current.budgets.complexity;
  return {
    ...current,
    version,
    camera,
    budgets: version === 1
      ? { ...current.budgets, complexity: oldComplexity }
      : current.budgets,
  };
}

function expectRejectedMeasurementField(value: unknown): void {
  const raw = { ...createDefaultStudioBg3dSceneDocument(), measurements: value };
  expect(serializeStudioBg3dSceneDocument(raw)).toBeNull();
  expect(parseStudioBg3dSceneDocument(JSON.stringify(raw))).toBeNull();
  expect(migrateStudioBg3dSceneDocument(raw)).toBeNull();
  expect(() => normalizeStudioBg3dSceneDocument(raw)).toThrow(StudioBg3dSceneMeasurementsValidationError);
}

describe("장면 측정 가이드 선택 필드", () => {
  it("도구와 장면이 Studio 문서 IR의 같은 코덱·기본값을 재사용한다", () => {
    expect(createStudioBg3dMeasurementDocument).toBe(createStudioSpatialMeasurementDocument);
    expect(serializeStudioBg3dMeasurementDocument).toBe(serializeStudioSpatialMeasurementDocument);
    expect(DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS).toBe(DEFAULT_STUDIO_SPATIAL_SCENE_MEASUREMENTS);
  });

  it("측정 필드가 없는 기존 기본 문서의 해시와 왕복 바이트를 유지한다", () => {
    const original = serializedDocument(createDefaultStudioBg3dSceneDocument());
    expect(createHash("sha256").update(original).digest("hex")).toBe(DEFAULT_DOCUMENT_SHA256);
    const reopened = canonicalDocument(JSON.parse(original));
    expect(Object.prototype.hasOwnProperty.call(reopened, "measurements")).toBe(false);
    expect(serializedDocument(reopened)).toBe(original);
    expect(serializedDocument(normalizeStudioBg3dSceneDocument(original))).toBe(original);
    expect(serializedDocument(migrateStudioBg3dSceneDocument(original))).toBe(original);
  });

  it("부재에만 동일한 frozen cm 기본값을 제공하고 저장 키를 만들지 않는다", () => {
    const document = createDefaultStudioBg3dSceneDocument();
    const first = readStudioBg3dSceneMeasurements(document);
    expect(first).toBe(DEFAULT_STUDIO_BG3D_SCENE_MEASUREMENTS);
    expect(readStudioBg3dSceneMeasurements(document)).toBe(first);
    expect(first.unit).toBe("cm");
    expect(first.guides).toEqual([]);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.guides)).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(document, "measurements")).toBe(false);
    expect(() => readStudioBg3dSceneMeasurements({ measurements: undefined })).toThrow(StudioBg3dSceneMeasurementsValidationError);
  });

  it("현재 v3의 단위·숨긴 가이드·길이 잠금을 정규화와 저장 왕복에서 보존한다", () => {
    const field: StudioBg3dMeasurementDocument = {
      ...measurements(2),
      guides: [
        { id: "locked-guide", kind: "distance", startWorld: [1, 2, 3], endWorld: [1, 4, 3], lockedLengthMeters: 2, visible: true },
        { id: "hidden-guide", kind: "distance", startWorld: [0, 0, 0], endWorld: [0, 0, 0.25], lockedLengthMeters: null, visible: false },
      ],
    };
    const source = { ...createDefaultStudioBg3dSceneDocument(), measurements: field };
    const serialized = serializedDocument(source);
    const reopened = canonicalDocument(source);
    expect(reopened.version).toBe(3);
    expect(reopened.measurements).toEqual(field);
    expect(readStudioBg3dSceneMeasurements(reopened)).toBe(reopened.measurements);
    expect(Object.isFrozen(reopened.measurements?.guides[0]?.startWorld)).toBe(true);
    expect(serializedDocument(normalizeStudioBg3dSceneDocument(source))).toBe(serialized);
    expect(serializedDocument(migrateStudioBg3dSceneDocument(serialized))).toBe(serialized);
  });

  it("명시된 빈 측정 문서는 기본값과 같아도 생략하지 않는다", () => {
    const document = canonicalDocument({ ...createDefaultStudioBg3dSceneDocument(), measurements: createStudioBg3dMeasurementDocument("cm") });
    expect(Object.prototype.hasOwnProperty.call(document, "measurements")).toBe(true);
    expect(document.measurements?.guides).toEqual([]);
    expect(serializedDocument(document)).toContain('"measurements"');
  });

  it.each([
    ["null", null],
    ["배열", []],
    ["잘못된 문서 종류", { ...measurements(), kind: "runtime-measurements" }],
    ["미지원 버전", { ...measurements(), version: 2 }],
    ["미지원 단위", { ...measurements(), unit: "inch" }],
    ["누락 가이드", { ...measurements(), guides: [null] }],
    ["중복 ID", { ...measurements(), guides: [measurements().guides[0], measurements().guides[0]] }],
    ["유실될 런타임 정보", { ...measurements(), objectUrl: "blob:measure-runtime" }],
    ["유한하지 않은 좌표", { ...measurements(), guides: [{ ...measurements().guides[0], endWorld: [Number.NaN, 0, 0] }] }],
    ["범위 밖 좌표", { ...measurements(), guides: [{ ...measurements().guides[0], endWorld: [10001, 0, 0] }] }],
    ["길이 잠금 불일치", { ...measurements(), guides: [{ ...measurements().guides[0], lockedLengthMeters: 2 }] }],
  ])("%s인 필드는 조용히 삭제하거나 복구하지 않는다", (_label, field) => {
    expectRejectedMeasurementField(field);
  });

  it("JSON 변환에서 사라지는 undefined·함수·접근자도 오류로 거부한다", () => {
    for (const field of [undefined, () => measurements()]) {
      const source = { ...createDefaultStudioBg3dSceneDocument(), measurements: field };
      expect(serializeStudioBg3dSceneDocument(source)).toBeNull();
      expect(migrateStudioBg3dSceneDocument(source)).toBeNull();
      expect(() => normalizeStudioBg3dSceneDocument(source)).toThrow(StudioBg3dSceneMeasurementsValidationError);
    }
    let reads = 0;
    const accessor = Object.defineProperty({ ...createDefaultStudioBg3dSceneDocument() }, "measurements", {
      enumerable: true,
      get: () => { reads += 1; return measurements(); },
    });
    expect(serializeStudioBg3dSceneDocument(accessor)).toBeNull();
    expect(() => normalizeStudioBg3dSceneDocument(accessor)).toThrow(StudioBg3dSceneMeasurementsValidationError);
    expect(reads).toBe(0);
  });

  it("열거되지 않는 측정값과 측정 필드를 숨기는 toJSON을 실행 없이 거부한다", () => {
    const hidden = Object.defineProperty({ ...createDefaultStudioBg3dSceneDocument() }, "measurements", {
      enumerable: false, value: measurements(),
    });
    let calls = 0;
    const customJson = {
      ...createDefaultStudioBg3dSceneDocument(), measurements: measurements(),
      toJSON: () => { calls += 1; return createDefaultStudioBg3dSceneDocument(); },
    };
    const inheritedJson = Object.assign(Object.create({ toJSON: customJson.toJSON }), {
      ...createDefaultStudioBg3dSceneDocument(), measurements: measurements(),
    });
    for (const source of [hidden, customJson, inheritedJson]) {
      expect(serializeStudioBg3dSceneDocument(source)).toBeNull();
      expect(migrateStudioBg3dSceneDocument(source)).toBeNull();
      expect(() => normalizeStudioBg3dSceneDocument(source)).toThrow(StudioBg3dSceneMeasurementsValidationError);
    }
    expect(calls).toBe(0);
  });

  it.each(["guides", "startWorld", "endWorld"] as const)("%s 배열의 own·inherited toJSON과 접근자를 실행하지 않는다", (targetKey) => {
    let calls = 0;
    let reads = 0;
    for (const hookKind of ["own", "inherited", "accessor"] as const) {
      const field = measurements();
      const firstGuide = field.guides[0];
      if (!firstGuide) throw new Error("측정 가이드 테스트 원소가 없습니다.");
      const target = targetKey === "guides" ? field.guides : firstGuide[targetKey];
      const toJSON = () => { calls += 1; return []; };
      if (hookKind === "inherited") {
        Object.setPrototypeOf(target, Object.create(Array.prototype, { toJSON: { value: toJSON } }));
      } else if (hookKind === "accessor") {
        Object.defineProperty(target, "toJSON", { get: () => { reads += 1; return toJSON; } });
      } else {
        Object.defineProperty(target, "toJSON", { value: toJSON });
      }
      const source = { ...createDefaultStudioBg3dSceneDocument(), measurements: field };
      expect(serializeStudioBg3dSceneDocument(source)).toBeNull();
      expect(migrateStudioBg3dSceneDocument(source)).toBeNull();
      expect(() => normalizeStudioBg3dSceneDocument(source)).toThrow(StudioBg3dSceneMeasurementsValidationError);
    }
    expect(calls).toBe(0);
    expect(reads).toBe(0);
  });

  it("구멍이 있는 가이드·좌표 배열을 JSON의 null 원소로 바꾸기 전에 거부한다", () => {
    for (const field of [
      { ...measurements(), guides: new Array(1) },
      { ...measurements(), guides: [{ ...measurements().guides[0], startWorld: new Array(3) }] },
      { ...measurements(), guides: [{ ...measurements().guides[0], endWorld: new Array(3) }] },
    ]) {
      expectRejectedMeasurementField(field);
    }
  });

  it.each([1, 2] as const)("과거 v%s 문서는 필드 부재로만 이전하며 새 필드를 주장하면 거부한다", (version) => {
    const old = oldSchemaDocument(version);
    expect(migrateStudioBg3dSceneDocument(old)?.measurements).toBeUndefined();
    expect(migrateStudioBg3dSceneDocument({ ...old, measurements: measurements() })).toBeNull();
  });

  it("무버전 런타임과 과거 파노라마 경로가 새 측정 필드를 주장하면 거부한다", () => {
    const legacy = { tool: "bg3d", primitives: [], customModels: [] };
    expect(migrateStudioBg3dSceneDocument(legacy)).not.toBeNull();
    expect(migrateStudioBg3dSceneDocument({ ...legacy, measurements: measurements() })).toBeNull();
    for (const scene of [oldSchemaDocument(1), oldSchemaDocument(2), createDefaultStudioBg3dSceneDocument()]) {
      const background = { ...createDefaultStudioBg3dSceneDocument().background, panoramaUrl: "https://example.com/old-panorama.jpg" };
      expect(migrateStudioBg3dSceneDocument({ ...scene, background })).not.toBeNull();
      expect(migrateStudioBg3dSceneDocument({ ...scene, background, measurements: measurements() })).toBeNull();
    }
  });
});

describe("장면 측정 가이드 저장 한도", () => {
  it("256개를 빠짐없이 저장하고 257개를 일부만 남기지 않는다", () => {
    const maximum = measurements(STUDIO_BG3D_MEASUREMENT_MAX_GUIDES);
    const document = canonicalDocument({ ...createDefaultStudioBg3dSceneDocument(), measurements: maximum });
    expect(document.measurements?.guides).toHaveLength(STUDIO_BG3D_MEASUREMENT_MAX_GUIDES);
    expectRejectedMeasurementField(measurements(STUDIO_BG3D_MEASUREMENT_MAX_GUIDES + 1));
  });

  it("각 가이드가 유효해도 중첩 측정 문서의 64KiB 초과를 거부한다", () => {
    const field = measurements(STUDIO_BG3D_MEASUREMENT_MAX_GUIDES, true);
    expect(serializeStudioBg3dMeasurementDocument(measurements(1, true))).not.toBeNull();
    expect(encoder.encode(JSON.stringify(field)).byteLength).toBeGreaterThan(STUDIO_BG3D_MEASUREMENT_MAX_BYTES);
    expect(serializeStudioBg3dMeasurementDocument(field)).toBeNull();
    expectRejectedMeasurementField(field);
  });

  it("측정값이 없는 장면은 320KiB 전체를 쓰고 합산 초과에서는 장면을 자르지 않는다", () => {
    const base = createDefaultStudioBg3dSceneDocument();
    const nodes = Array.from({ length: 512 }, (_, index) => primitive(`budget-node-${index}`, "가".repeat(80)));
    const large = {
      ...base,
      budgets: { ...base.budgets, complexity: { ...base.budgets.complexity, maxNodes: 512 } },
      nodes,
      shots: Array.from({ length: 3 }, (_, index) => ({
        id: `budget-shot-${index}`,
        name: "예산 컷",
        nodeVisibility: nodes.map((node) => ({ nodeId: node.id, visible: true })),
      })),
    };
    expect(STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES).toBe(320 * 1024);
    const serialized = serializedDocument(large);
    expect(encoder.encode(serialized).byteLength).toBeGreaterThan(256 * 1024);
    expect(encoder.encode(serialized).byteLength).toBeLessThanOrEqual(STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES);
    expect(canonicalDocument(large).nodes).toHaveLength(512);
    const combined = { ...large, measurements: measurements(STUDIO_BG3D_MEASUREMENT_MAX_GUIDES) };
    expect(encoder.encode(JSON.stringify(combined)).byteLength).toBeGreaterThan(STUDIO_BG3D_SCENE_DOCUMENT_MAX_BYTES);
    expect(serializeStudioBg3dSceneDocument(combined)).toBeNull();
    expect(parseStudioBg3dSceneDocument(JSON.stringify(combined))).toBeNull();
    expect(migrateStudioBg3dSceneDocument(combined)).toBeNull();
    expect(() => normalizeStudioBg3dSceneDocument(combined)).toThrow(StudioBg3dSceneDocumentBudgetError);
    expect(serializedDocument(large)).toBe(serialized);
  });
});

describe("측정 가이드의 런타임·컷·템플릿 경계", () => {
  it("노드를 수화하고 다시 캡처하는 동안 문서 측정값과 다른 선택 필드를 보존한다", () => {
    const source = canonicalDocument({
      ...createDefaultStudioBg3dSceneDocument(),
      nodes: [primitive("runtime-node")],
      meta: { name: "측정 검증 장면", memo: "단위 보존" },
      measurements: measurements(2),
    });
    const withShot = captureStudioBg3dShot(source, { id: "measure-shot", name: "측정 컷" });
    if (!withShot) throw new Error("측정 장면의 컷을 만들지 못했습니다.");
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: withShot, storageModelIdByAttachmentId: new Map() });
    expect(hydrated.ok).toBe(true);
    const refreshed = adaptStudioBg3dRuntimeToDocument({
      primitives: hydrated.primitives.map((node) => ({ ...node, position: [2, 0.5, 0] as [number, number, number] })),
      customModels: hydrated.customModels,
      attachmentByStorageModelId: new Map(),
      baseDocument: withShot,
    });
    expect(refreshed.diagnostics).toEqual([]);
    expect(refreshed.document.measurements).toEqual(source.measurements);
    expect(refreshed.document.meta).toEqual(source.meta);
    expect(refreshed.document.shots).toEqual(withShot.shots);
    expect(refreshed.document.activeShotId).toBe("measure-shot");
    expect(refreshed.document.nodes[0]?.transform.position).toEqual([2, 0.5, 0]);
    const applied = applyStudioBg3dShot(refreshed.document, "measure-shot");
    expect(applied?.measurements).toEqual(source.measurements);
    const template = instantiateBg3dTemplateDocument(refreshed.document, new Set(), () => "template-fresh-node");
    expect(template?.document.measurements).toEqual(source.measurements);
    expect(template?.document.nodes[0]?.id).toBe("template-fresh-node");
    expect(template?.document.shots).toBeUndefined();
    expect(serializedDocument(canonicalDocument(refreshed.document))).toBe(refreshed.serialized);
  });

  it("측정값이 없는 문서는 런타임 왕복과 컷·템플릿에서도 부재를 유지한다", () => {
    const source = canonicalDocument({ ...createDefaultStudioBg3dSceneDocument(), nodes: [primitive("no-measure-node")] });
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: source, storageModelIdByAttachmentId: new Map() });
    const adapted = adaptStudioBg3dRuntimeToDocument({
      primitives: hydrated.primitives, customModels: hydrated.customModels,
      attachmentByStorageModelId: new Map(), baseDocument: source,
    });
    expect(serializedDocument(source)).toBe(adapted.serialized);
    expect(Object.prototype.hasOwnProperty.call(adapted.document, "measurements")).toBe(false);
    const captured = captureStudioBg3dShot(adapted.document, { id: "no-measure-shot", name: "이전 컷" });
    expect(captured).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(captured, "measurements")).toBe(false);
    const template = instantiateBg3dTemplateDocument(source, new Set(), () => "empty-measure-template-node");
    expect(template).not.toBeNull();
    expect(Object.prototype.hasOwnProperty.call(template?.document, "measurements")).toBe(false);
  });

  it("잘못된 측정값이 있으면 수화가 정상 런타임을 내보내지 않는다", () => {
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: Object.defineProperty({ ...createDefaultStudioBg3dSceneDocument() }, "measurements", { value: null, enumerable: true }),
      storageModelIdByAttachmentId: new Map(),
    });
    expect(hydrated.ok).toBe(false);
    expect(hydrated.primitives).toEqual([]);
    expect(hydrated.customModels).toEqual([]);
    expect(hydrated.diagnostics.map((item) => item.code)).toContain("invalid-scene-document");
  });
});
