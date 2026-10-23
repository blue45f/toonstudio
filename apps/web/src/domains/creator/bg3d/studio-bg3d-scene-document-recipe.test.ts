import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  normalizeStudioBg3dSceneRecipeEnvelope,
  normalizeStudioBg3dSurfaceRef,
  STUDIO_BG3D_SCENE_RECIPE_ENVELOPE_KIND,
  STUDIO_BG3D_SCENE_RECIPE_LIMITS,
  STUDIO_BG3D_SURFACE_TEXT_MAX_CODE_POINTS,
} from "./studio-bg3d-hierarchy";
import { syncLinkedCloneAppearance } from "./studio-bg3d-linked-clones";
import { planStudioBg3dRoomBuild, type StudioBg3dRoomSpec } from "./studio-bg3d-room-builder";
import { readStudioBg3dRuntimeNodeExtras, studioBg3dNodeRuntimeExtras } from "./studio-bg3d-runtime-organization";
import {
  captureStudioBg3dShot,
  createDefaultStudioBg3dSceneDocument,
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  migrateStudioBg3dSceneDocument,
  normalizeStudioBg3dGlbAttachment,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  STUDIO_BG3D_GLB_MIME,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import { adaptStudioBg3dRuntimeToDocument, hydrateStudioBg3dDocumentToRuntime } from "./studio-bg3d-scene-runtime";
import { getStudioBg3dWebtoonBackground, type StudioBg3dWebtoonRoomEntry } from "./studio-bg3d-webtoon-background-templates";

import type { StudioBg3dTexturePaint } from "./studio-bg3d-scene-document-types";
import type { StudioBg3dSceneRecipeEnvelope, StudioBg3dSurfaceRef } from "./studio-bg3d-scene-surface-types";
import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";

// 읽기 계약(Phase R): 문서 루트 `sceneRecipe` 봉투와 프리미티브 노드 `surface` 를 받아들여 그대로 보존한다. 두 키가 없는 기존
// 문서는 바이트가 같고, 옛 스키마(v1·v2·파노라마)가 새 키를 주장하면 거부하며, 런타임 왕복·연결 복제·저장 경로가 값을 잃지
// 않는다. 같은 자리에서 표면 그리기 획(texturePaint)의 저장 왕복 유실(2026-10-23 확인)이 고쳐졌음을 고정한다.

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** 2026-10-23 변경 전(HEAD 8ef318ad5) 직렬화 해시. 새 키가 없는 문서의 바이트가 같아야 한다. */
const DEFAULT_DOCUMENT_SHA256 = "df55d009ebe7c37bec88083e5a48df63ad81a1d851e569cf0e422db727d0a8fb";
const REPRESENTATIVE_DOCUMENT_SHA256 = "c286ab40d4c6b78ef26be344debd3535fa00fed6653869f76eb82efb941e983b";

function node(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `상자 ${id}`,
    kind: "primitive",
    primitiveKind: "box",
    color: "#c9a876",
    transform: { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parentId: null,
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
    ...extra,
  };
}

const ATTACHMENT = {
  id: "model-1",
  name: "의자.glb",
  mime: STUDIO_BG3D_GLB_MIME,
  byteSize: 1_000_000,
  hash: `sha256:${"1".padStart(64, "0")}`,
  rights: { status: "owned", commercialUse: true, attributionRequired: false },
  source: "local-library",
};

function modelNode(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `모델 ${id}`,
    kind: "model",
    attachmentId: "model-1",
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    parentId: null,
    visible: true,
    locked: false,
    castsShadow: true,
    receivesShadow: true,
    ...extra,
  };
}

const documentWith = (overrides: Record<string, unknown>): Record<string, unknown> =>
  ({ ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, ...overrides });

const SURFACE: StudioBg3dSurfaceRef = {
  id: "wood-plank",
  colors: ["#a07850", "#7c5a3a"],
  tileM: 0.2,
  angleDeg: 90,
  roughness: 0.6,
  variant: 3,
  wear: 0.2,
  lineWeight: 0.5,
  cutout: false,
  overlay: { kind: "wet", amount: 0.4, seed: 12345 },
  text: { value: "교무실", script: "ko", vertical: false },
};

function recipe(instanceKey: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "toonstudio.bg3d-scene-recipe",
    version: 1,
    instanceKey,
    name: "교실",
    startId: "classroom-kr",
    seed: 42,
    layerSeeds: { shell: 7 },
    locks: ["region"],
    shell: { kind: "room", room: { width: 9, depth: 7.5, openings: [{ wall: "west", style: "sliding-door", openRatio: 0 }] } },
    region: { styleId: "kr-modern", era: "2020s", signScript: "ko", signDensity: 0.5 },
    ...extra,
  };
}

const ENVELOPE: StudioBg3dSceneRecipeEnvelope = {
  kind: STUDIO_BG3D_SCENE_RECIPE_ENVELOPE_KIND,
  version: 1,
  recipes: [recipe("0a1b2c3d"), recipe("ffee0011", { name: "복도" })],
};

const strictSerialize = (overrides: Record<string, unknown>) => serializeStudioBg3dSceneDocument(documentWith(overrides));

describe("새 키가 없는 기존 문서는 바이트가 같다", () => {
  it("기본 문서와 대표 문서(태그·컴포넌트·메타·페인트·유리 재질·컷 포함)의 직렬화가 변경 전 해시와 같다", () => {
    expect(sha256(serializeStudioBg3dSceneDocument(createDefaultStudioBg3dSceneDocument())!)).toBe(DEFAULT_DOCUMENT_SHA256);
    // 변경 전 원클릭 교실 스펙(스타일·천장·몰딩 없음)의 앞 40 도형으로 같은 문서를 다시 만든다.
    const entry = getStudioBg3dWebtoonBackground("classroom") as StudioBg3dWebtoonRoomEntry;
    const { ceiling: _ceiling, trims: _trims, ...current } = entry.spec;
    const legacySpec: StudioBg3dRoomSpec = {
      ...current,
      openings: current.openings.map(({ style: _style, openRatio: _ratio, hinge: _hinge, divisions: _divisions, ...rest }) => rest),
    };
    let next = 0;
    const primitives = planStudioBg3dRoomBuild(legacySpec, 0, () => `g-${next++}`).primitives;
    const nodes = primitives.slice(0, 40).map((primitive, index) => ({
      id: primitive.id,
      name: primitive.name ?? primitive.kind,
      kind: "primitive",
      primitiveKind: primitive.kind,
      color: primitive.color,
      transform: { position: primitive.position, rotation: primitive.rotation, scale: primitive.scale },
      visible: primitive.visible !== false,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
      parentId: null,
      ...(index === 1 ? { tags: ["교실", "벽"], componentRef: { id: "comp-wall", name: "벽체" } } : {}),
      ...(index === 2 ? { texturePaint: { version: 1, strokes: [{ color: "#e11d48", size: 0.04, opacity: 1, points: [[0.25, 0.5], [0.5, 0.5]] }] } } : {}),
      ...(index === 3 ? {
        materialOverride: {
          colorMode: "original", color: "#ffffff", colorStrength: 1, opacityMultiplier: 0.35, roughness: 0.1, metalness: 0,
          emissiveColor: "#000000", emissiveIntensity: null, wireframe: false, doubleSided: false,
        },
      } : {}),
    }));
    const withNodes = normalizeStudioBg3dSceneDocument({
      ...createDefaultStudioBg3dSceneDocument(),
      nodes,
      meta: { name: "교실 장면", memo: "첫 줄\n둘째 줄", hiddenTags: ["벽"] },
    });
    const withShot = captureStudioBg3dShot(withNodes, { id: "shot-1", name: "컷 1" })!;
    const serialized = serializeStudioBg3dSceneDocument(withShot)!;
    expect(sha256(serialized)).toBe(REPRESENTATIVE_DOCUMENT_SHA256);
    expect(serialized).not.toContain('"surface"');
    expect(serialized).not.toContain('"sceneRecipe"');
    expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(serialized))).toBe(serialized);
  });
});

describe("표면 재질 참조(surface) 정규화", () => {
  it("올바른 값은 그대로 돌려준다(엄격 왕복이 무손실)", () => {
    expect(normalizeStudioBg3dSurfaceRef(SURFACE)).toEqual(SURFACE);
    expect(normalizeStudioBg3dSurfaceRef({ id: "concrete" })).toEqual({ id: "concrete" });
  });

  it("id 가 규칙에 맞지 않으면 통째로 버리고, 선택 값은 형식이 맞을 때만 범위 안으로 누른다", () => {
    for (const id of ["", "a", "Wood", "1wood", "wood_plank", "x".repeat(41), 7]) {
      expect(normalizeStudioBg3dSurfaceRef({ id })).toBeUndefined();
    }
    expect(normalizeStudioBg3dSurfaceRef({
      id: "brick",
      colors: ["#ABCDEF", "red", "#000000", "#111111", "#222222"],
      tileM: 99,
      angleDeg: -5,
      variant: 7.6,
      wear: "high",
      cutout: "yes",
      overlay: { kind: "lava", amount: 1, seed: 1 },
      text: { value: "https://example.com", script: "ko", vertical: false },
      extra: true,
    })).toEqual({ id: "brick", colors: ["#abcdef", "#000000"], tileM: 8, angleDeg: 0, variant: 8 });
  });

  it("크기는 필드 규칙만으로 묶인다: 모든 필드를 가장 길게 채워도 노드당 576 B 이하다(읽기는 바이트로 따로 거르지 않는다)", () => {
    const longest = normalizeStudioBg3dSurfaceRef({
      id: `a${"b".repeat(39)}`,
      colors: ["#aaaaaa", "#bbbbbb", "#cccccc"],
      tileM: 0.020000000000000004,
      angleDeg: 179.99999999999997,
      roughness: 0.30000000000000004,
      variant: 15,
      wear: 0.30000000000000004,
      lineWeight: 0.30000000000000004,
      cutout: true,
      overlay: { kind: "petals", amount: 0.30000000000000004, seed: 4_294_967_295 },
      text: { value: "😀".repeat(STUDIO_BG3D_SURFACE_TEXT_MAX_CODE_POINTS), script: "latin", vertical: false },
    });
    expect(longest).toBeDefined();
    // 4바이트 글자 32개 간판 + 17자리 소수 + 최장 id 를 모두 채운 최악값이 525 B 다.
    expect(Buffer.byteLength(JSON.stringify(longest))).toBeLessThanOrEqual(576);
    // 코드 포인트 한도를 넘는 글자는 글자 단위로 막힌다(텍스트만 버린다).
    expect(normalizeStudioBg3dSurfaceRef({ id: "signboard", text: { value: "가".repeat(33), script: "ko", vertical: true } }))
      .toEqual({ id: "signboard" });
  });

  it("문서: 프리미티브의 surface 는 엄격 왕복하고, 모델 노드의 surface 는 너그러운 정규화가 버리며 엄격 파싱은 거부한다", () => {
    const serialized = strictSerialize({ nodes: [node("floor", { surface: SURFACE })] });
    expect(serialized).not.toBeNull();
    const parsed = parseStudioBg3dSceneDocument(serialized!);
    expect(parsed?.nodes[0]?.surface).toEqual(SURFACE);
    expect(serializeStudioBg3dSceneDocument(parsed)).toBe(serialized);

    const withModel = { attachments: [ATTACHMENT], nodes: [modelNode("chair", { surface: SURFACE })] };
    // 통제군: surface 가 없는 같은 모델 문서는 엄격 경계를 통과한다(거부 이유가 surface 하나뿐임을 보인다).
    expect(strictSerialize({ attachments: [ATTACHMENT], nodes: [modelNode("chair")] })).not.toBeNull();
    expect(normalizeStudioBg3dSceneDocument(documentWith(withModel)).nodes[0]).not.toHaveProperty("surface");
    expect(strictSerialize(withModel)).toBeNull();
    // 규칙을 어긴 surface 도 같다: 너그러운 쪽은 키를 빼고, 엄격한 쪽은 문서를 거부한다.
    expect(normalizeStudioBg3dSceneDocument(documentWith({ nodes: [node("a", { surface: { id: "Bad" } })] })).nodes[0]).not.toHaveProperty("surface");
    expect(strictSerialize({ nodes: [node("a", { surface: { id: "Bad" } })] })).toBeNull();
    expect(strictSerialize({ nodes: [node("a", { surface: { ...SURFACE, tileM: 99 } })] })).toBeNull();
  });
});

describe("장면 레시피 봉투(sceneRecipe)", () => {
  it("경계 안의 봉투는 같은 구조로 보존되고 문서가 엄격 왕복한다", () => {
    expect(normalizeStudioBg3dSceneRecipeEnvelope(ENVELOPE)).toEqual(ENVELOPE);
    const serialized = strictSerialize({ nodes: [node("a")], sceneRecipe: ENVELOPE });
    expect(serialized).not.toBeNull();
    const parsed = parseStudioBg3dSceneDocument(serialized!);
    expect(parsed?.sceneRecipe).toEqual(ENVELOPE);
    expect(serializeStudioBg3dSceneDocument(parsed)).toBe(serialized);
    // 키 순서가 달라도(레시피는 고쳐 쓰지 않는다) 엄격 판정은 통과한다.
    const reordered = { recipes: ENVELOPE.recipes, version: 1, kind: STUDIO_BG3D_SCENE_RECIPE_ENVELOPE_KIND };
    expect(strictSerialize({ nodes: [node("a")], sceneRecipe: reordered })).not.toBeNull();
  });

  const invalid: ReadonlyArray<readonly [string, unknown]> = [
    ["kind 다름", { ...ENVELOPE, kind: "other" }],
    ["version 다름", { ...ENVELOPE, version: 2 }],
    ["레시피 0개", { ...ENVELOPE, recipes: [] }],
    ["레시피 5개", { ...ENVELOPE, recipes: ["01", "02", "03", "04", "05"].map((key) => recipe(`000000${key}`)) }],
    ["instanceKey 중복", { ...ENVELOPE, recipes: [recipe("0a1b2c3d"), recipe("0a1b2c3d")] }],
    ["instanceKey 형식", { ...ENVELOPE, recipes: [recipe("0A1B2C3D")] }],
    ["금지 키", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { constructor: 1 })] }],
    ["키 모양", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { "bad-key": 1 })] }],
    ["깊이 7", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { a: { b: { c: { d: { e: { f: {} } } } } } })] }],
    ["배열 129", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { pins: Array.from({ length: 129 }, () => "x") })] }],
    ["객체 키 49", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { many: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`k${i}`, i])) })] }],
    ["긴 문자열", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { name: "가".repeat(161) })] }],
    ["제어 문자", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { name: "교\u0007실" })] }],
    ["외부 주소", { ...ENVELOPE, recipes: [recipe("0a1b2c3d", { name: "https://example.com/a.png" })] }],
    ["24 KiB 초과", {
      ...ENVELOPE,
      // 레시피 하나하나는 한도 안이지만(배열 120·문자열 43자) 넷을 합친 직렬화가 24 KiB 를 넘는다.
      recipes: ["0a1b2c3d", "1a1b2c3d", "2a1b2c3d", "3a1b2c3d"].map((key) => recipe(key, {
        removedSlots: Array.from({ length: 120 }, (_, i) => `${"slot".repeat(10)}${i}`),
        explicitKeys: Array.from({ length: 120 }, (_, i) => `${"path".repeat(10)}${i}`),
      })),
    }],
  ];

  it.each(invalid)("%s: 너그러운 정규화는 봉투를 버리고 엄격 파싱은 문서를 거부한다", (_label, envelope) => {
    expect(normalizeStudioBg3dSceneRecipeEnvelope(envelope)).toBeUndefined();
    expect(normalizeStudioBg3dSceneDocument(documentWith({ sceneRecipe: envelope }))).not.toHaveProperty("sceneRecipe");
    expect(strictSerialize({ sceneRecipe: envelope })).toBeNull();
  });

  it("깊이 6·배열 128·키 48·문자열 160 까지는 받아들인다(한도 경계)", () => {
    const limits = STUDIO_BG3D_SCENE_RECIPE_LIMITS;
    const atLimit = recipe("0a1b2c3d", {
      a: { b: { c: { d: { e: { leaf: 1 } } } } },
      pins: Array.from({ length: limits.maxArrayLength }, () => "x"),
      name: "가".repeat(limits.maxStringCodePoints),
    });
    expect(Object.keys(atLimit).length).toBeLessThanOrEqual(limits.maxKeysPerObject);
    expect(normalizeStudioBg3dSceneRecipeEnvelope({ ...ENVELOPE, recipes: [atLimit] })).toBeDefined();
  });

  it("옛 스키마(v1·v2·파노라마)가 새 키를 주장하면 이행하지 않고 거부한다", () => {
    const camera = { ...(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera as unknown as Record<string, unknown>) };
    delete camera.nearClip;
    delete camera.up;
    const v2 = documentWith({ version: 2, camera, nodes: [node("a")] });
    const complexity = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity;
    const v1 = documentWith({
      version: 1,
      camera,
      nodes: [node("a")],
      budgets: {
        complexity: {
          maxNodes: complexity.maxNodes,
          maxTriangles: complexity.maxTriangles,
          maxDrawCalls: complexity.maxDrawCalls,
          maxMaterials: complexity.maxMaterials,
          maxLights: complexity.maxLights,
          maxModelBytes: complexity.maxModelBytes,
        },
        textures: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.textures },
      },
    });
    const panorama = (legacy: Record<string, unknown>) => ({
      ...legacy,
      background: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background, panoramaUrl: "https://legacy.invalid/sky.jpg" },
    });
    for (const [label, legacy] of [["v2", v2], ["v1", v1], ["v2 파노라마", panorama(v2)], ["v1 파노라마", panorama(v1)]] as const) {
      // 새 키가 없으면 그대로 이행된다(통제군).
      expect(migrateStudioBg3dSceneDocument(legacy), label).not.toBeNull();
      expect(migrateStudioBg3dSceneDocument({ ...legacy, sceneRecipe: ENVELOPE }), label).toBeNull();
      expect(migrateStudioBg3dSceneDocument({ ...legacy, nodes: [node("a", { surface: SURFACE })] }), label).toBeNull();
    }
    // 현재 버전 파노라마 문서는 새 키를 가질 수 있고 이행 뒤에도 보존한다.
    const currentPanorama = panorama(documentWith({ nodes: [node("a", { surface: SURFACE })], sceneRecipe: ENVELOPE }));
    const migrated = migrateStudioBg3dSceneDocument(currentPanorama);
    expect(migrated?.sceneRecipe).toEqual(ENVELOPE);
    expect(migrated?.nodes[0]?.surface).toEqual(SURFACE);
  });
});

describe("런타임 왕복·연결 복제·저장 경로가 값을 잃지 않는다", () => {
  const PAINT: StudioBg3dTexturePaint = {
    version: 1,
    strokes: [{ color: "#e11d48", size: 0.04, opacity: 1, points: [[0.25, 0.5], [0.5, 0.5]] }],
  };

  function primitive(id: string, extra: Partial<BgPrimitive> = {}): BgPrimitive {
    return { id, kind: "box", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#c9a876", parentId: null, ...extra };
  }

  const attachment = normalizeStudioBg3dGlbAttachment(ATTACHMENT);

  function adapt(primitives: readonly BgPrimitive[], customModels: readonly BgCustomModelInstance[] = [], baseDocument?: StudioBg3dSceneDocument) {
    if (!attachment) throw new Error("첨부 고정 데이터가 올바르지 않습니다.");
    return adaptStudioBg3dRuntimeToDocument({
      primitives,
      customModels,
      attachmentByStorageModelId: new Map([["stored-1", attachment]]),
      ...(baseDocument ? { baseDocument } : {}),
    });
  }

  it("표면 그리기 획: 런타임 → 문서(저장) → 문서 → 런타임(다시 열기)에서 획이 그대로 남는다", () => {
    // 예전에는 이 왕복의 두 방향이 모두 texturePaint 를 버렸다(scratchpad 의 변경 전 재현 기록 참고).
    const adapted = adapt([primitive("painted", { texturePaint: PAINT }), primitive("plain")]);
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.document.nodes[0]).toHaveProperty("texturePaint");
    expect(adapted.serialized).toContain("#e11d48");
    expect(adapted.document.nodes[1]).not.toHaveProperty("texturePaint");
    const reopened = parseStudioBg3dSceneDocument(adapted.serialized)!;
    const hydrated = hydrateStudioBg3dDocumentToRuntime({ document: reopened, storageModelIdByAttachmentId: new Map() });
    expect(hydrated.ok).toBe(true);
    expect(hydrated.primitives[0]?.texturePaint).toEqual(PAINT);
    expect(hydrated.primitives[1]).not.toHaveProperty("texturePaint");
    // 다시 저장해도 같은 바이트다(왕복 고정점).
    expect(adapt(hydrated.primitives).serialized).toBe(adapted.serialized);
  });

  it("런타임 사본은 문서와 배열을 공유하지 않는다(문서는 얼려 있다)", () => {
    const reopened = parseStudioBg3dSceneDocument(adapt([primitive("painted", { texturePaint: PAINT, surface: SURFACE })]).serialized)!;
    const runtime = hydrateStudioBg3dDocumentToRuntime({ document: reopened, storageModelIdByAttachmentId: new Map() }).primitives[0]!;
    const node = reopened.nodes[0];
    if (node?.kind !== "primitive") throw new Error("프리미티브 노드가 아닙니다.");
    expect(runtime.texturePaint).toEqual(node.texturePaint);
    expect(runtime.texturePaint).not.toBe(node.texturePaint);
    expect(runtime.surface).toEqual(node.surface);
    expect(runtime.surface).not.toBe(node.surface);
    expect(Object.isFrozen(runtime.surface)).toBe(false);
  });

  it("surface 는 프리미티브만 런타임↔문서를 오가고, 모델에 붙은 값은 옮기지 않는다", () => {
    const adapted = adapt(
      [primitive("floor", { surface: SURFACE })],
      [{ id: "chair", modelId: "stored-1", position: [0, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1], parentId: null, surface: SURFACE }],
    );
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.document.nodes.find((entry) => entry.id === "floor")?.surface).toEqual(SURFACE);
    expect(adapted.document.nodes.find((entry) => entry.id === "chair")).not.toHaveProperty("surface");
    expect(readStudioBg3dRuntimeNodeExtras({ id: "m", modelId: "stored-1", surface: SURFACE, texturePaint: PAINT })).toEqual({});
    expect(studioBg3dNodeRuntimeExtras({ kind: "model", surface: SURFACE, texturePaint: PAINT })).toEqual({ linkedSourceId: undefined });
    const hydrated = hydrateStudioBg3dDocumentToRuntime({
      document: parseStudioBg3dSceneDocument(adapted.serialized)!,
      storageModelIdByAttachmentId: new Map([["model-1", "stored-1"]]),
    });
    expect(hydrated.primitives[0]?.surface).toEqual(SURFACE);
    expect(hydrated.customModels[0]).not.toHaveProperty("surface");
  });

  it("런타임 → 문서 변환(저장·컷 기록 경로)이 기준 문서의 sceneRecipe 를 그대로 옮긴다", () => {
    const base = normalizeStudioBg3dSceneDocument(documentWith({ sceneRecipe: ENVELOPE }));
    expect(base.sceneRecipe).toEqual(ENVELOPE);
    const adapted = adapt([primitive("a")], [], base);
    expect(adapted.diagnostics).toEqual([]);
    expect(adapted.document.sceneRecipe).toEqual(ENVELOPE);
    expect(parseStudioBg3dSceneDocument(adapted.serialized)?.sceneRecipe).toEqual(ENVELOPE);
    // 봉투가 없으면 키도 없다.
    expect(adapt([primitive("a")]).serialized).not.toContain("sceneRecipe");
  });

  it("연결 복제는 원본의 surface 를 따라가고, 같은 값이면 배열을 바꾸지 않는다", () => {
    const root = primitive("root", { surface: SURFACE });
    const clone = primitive("clone", { linkedSourceId: "root" });
    const synced = syncLinkedCloneAppearance({ primitives: [root, clone], customModels: [] });
    expect(synced.changed).toBe(true);
    expect(synced.primitives[1]?.surface).toEqual(SURFACE);
    // 내용이 같은 사본(복원 경로가 새로 만든 객체)이면 다시 동기화하지 않는다.
    const settled = syncLinkedCloneAppearance({
      primitives: [root, { ...synced.primitives[1]!, surface: { ...SURFACE, colors: [...SURFACE.colors!] } }],
      customModels: [],
    });
    expect(settled.changed).toBe(false);
    const cleared = syncLinkedCloneAppearance({ primitives: [primitive("root"), synced.primitives[1]!], customModels: [] });
    expect(cleared.primitives[1]?.surface).toBeUndefined();
  });
});
