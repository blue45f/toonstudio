import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS,
  STUDIO_BG3D_NODE_MAX_TAGS,
  STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS,
  STUDIO_BG3D_SCENE_MEMO_MAX_CODE_POINTS,
  STUDIO_BG3D_TAG_MAX_CODE_POINTS,
  bakeStudioBg3dTagVisibilityIntoDocument,
  collectStudioBg3dEffectivelyVisibleEntityIds,
  isStudioBg3dTagHidden,
  normalizeStudioBg3dComponentRef,
  normalizeStudioBg3dDocumentText,
  normalizeStudioBg3dNodeOrganization,
  normalizeStudioBg3dSceneMemo,
  normalizeStudioBg3dSceneMeta,
  normalizeStudioBg3dTags,
  withStudioBg3dHiddenTags,
} from "./studio-bg3d-hierarchy";
import {
  STUDIO_BG3D_MAGIC_SELECTION_REASON_MESSAGES,
  resolveStudioBg3dMagicSelection,
} from "./studio-bg3d-magic-selection";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  STUDIO_BG3D_GLB_MIME,
  STUDIO_BG3D_SCENE_DOCUMENT_VERSION,
  StudioBg3dSceneDocumentBudgetError,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  duplicateStudioBg3dShot,
  migrateStudioBg3dSceneDocument,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

function attachment(index = 1): Record<string, unknown> {
  return {
    id: `model-${index}`,
    name: `배경 모델 ${index}.glb`,
    mime: STUDIO_BG3D_GLB_MIME,
    byteSize: 2_000_000,
    hash: `sha256:${index.toString(16).padStart(64, "0")}`,
    rights: { status: "owned", commercialUse: true, attributionRequired: false },
    source: "upload",
  };
}

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

function documentWith(overrides: Record<string, unknown>): Record<string, unknown> {
  return { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, ...overrides };
}

function canonical(overrides: Record<string, unknown>): StudioBg3dSceneDocument {
  const document = normalizeStudioBg3dSceneDocument(documentWith(overrides));
  const serialized = serializeStudioBg3dSceneDocument(document);
  const parsed = serialized ? parseStudioBg3dSceneDocument(serialized) : null;
  if (!parsed) throw new Error("정규 문서를 만들지 못했습니다.");
  return parsed;
}

describe("장면 구성 정보 텍스트·태그 정규화", () => {
  it("태그를 NFKC로 맞추고 중복을 없애며 코드 유닛 순서로 정렬한다", () => {
    expect(normalizeStudioBg3dTags(["벽", "  가구 ", "ＡＢＣ", "가구", "abc", "벽"])).toEqual([
      "ABC",
      "abc",
      "가구",
      "벽",
    ]);
    expect(normalizeStudioBg3dTags("벽")).toEqual([]);
    expect(normalizeStudioBg3dTags(undefined)).toEqual([]);
  });

  it("제어 문자·주소·자격 증명 모양·긴 텍스트·프로토타입 키는 버린다", () => {
    const tooLong = "가".repeat(STUDIO_BG3D_TAG_MAX_CODE_POINTS + 1);
    const exactlyLong = "나".repeat(STUDIO_BG3D_TAG_MAX_CODE_POINTS);
    expect(
      normalizeStudioBg3dTags([
        "벽\n",
        "https://example.com/a",
        "www.example.com",
        "data:text/plain",
        "api key 123",
        "__proto__",
        "Constructor",
        "prototype",
        tooLong,
        exactlyLong,
        "",
        "   ",
        7,
        null,
        { toString: () => "객체" },
      ]),
    ).toEqual([exactlyLong]);
  });

  it("노드당 8개를 넘기면 기본은 예산 오류, 편집 경계에서는 앞쪽만 남긴다", () => {
    const many = Array.from({ length: STUDIO_BG3D_NODE_MAX_TAGS + 2 }, (_, index) => `태그${index}`);
    expect(() => normalizeStudioBg3dTags(many)).toThrow(StudioBg3dSceneDocumentBudgetError);
    try {
      normalizeStudioBg3dTags(many);
    } catch (cause) {
      expect((cause as StudioBg3dSceneDocumentBudgetError).code).toBe("tag-count-budget-exceeded");
    }
    expect(normalizeStudioBg3dTags(many, "node", "truncate")).toHaveLength(STUDIO_BG3D_NODE_MAX_TAGS);
    const hidden = Array.from({ length: STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS + 1 }, (_, index) => `숨김${index}`);
    try {
      normalizeStudioBg3dTags(hidden, "scene");
      throw new Error("예산 오류가 나야 합니다.");
    } catch (cause) {
      expect((cause as StudioBg3dSceneDocumentBudgetError).code).toBe("hidden-tag-count-budget-exceeded");
    }
    expect(normalizeStudioBg3dTags(Array.from({ length: 5_000 }, () => "같은"), "node", "truncate")).toEqual([
      "같은",
    ]);
  });

  it("텍스트 규칙은 문서 노드 이름과 같은 판정을 한다", () => {
    for (const sample of ["평범한 이름", "  공백   접기  ", "ｆｕｌｌ", "한\u0000글", "http://a", "secret key"]) {
      const viaDocument = normalizeStudioBg3dSceneDocument(documentWith({ nodes: [node("n1", { name: sample })] }));
      const expected = normalizeStudioBg3dDocumentText(sample, 80, true) ?? "3D 요소";
      expect(viaDocument.nodes[0]?.name).toBe(expected);
    }
  });

  it("컴포넌트 참조는 id 규칙과 이름 길이를 지키고 아니면 통째로 버린다", () => {
    expect(normalizeStudioBg3dComponentRef({ id: "comp-1", name: "  의자  " })).toEqual({
      id: "comp-1",
      name: "의자",
    });
    expect(normalizeStudioBg3dComponentRef({ id: "comp 1", name: "의자" })).toBeUndefined();
    expect(normalizeStudioBg3dComponentRef({ id: "__proto__", name: "의자" })).toBeUndefined();
    expect(normalizeStudioBg3dComponentRef({ id: "comp-1", name: "" })).toBeUndefined();
    expect(normalizeStudioBg3dComponentRef({ id: "comp-1", name: "https://x" })).toBeUndefined();
    expect(
      normalizeStudioBg3dComponentRef({
        id: "comp-1",
        name: "가".repeat(STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS + 1),
      }),
    ).toBeUndefined();
    expect(normalizeStudioBg3dComponentRef("comp-1")).toBeUndefined();
    expect(normalizeStudioBg3dComponentRef(null)).toBeUndefined();
  });

  it("빈 구성 정보는 키를 만들지 않는다", () => {
    expect(normalizeStudioBg3dNodeOrganization({ tags: [], componentRef: null })).toEqual({});
    expect(normalizeStudioBg3dNodeOrganization(undefined)).toEqual({});
    const organized = normalizeStudioBg3dNodeOrganization({
      tags: ["벽"],
      componentRef: { id: "c", name: "벽체" },
    });
    expect(Object.keys(organized).sort()).toEqual(["componentRef", "tags"]);
  });
});

describe("장면 메타 정규화", () => {
  it("이름·메모·숨긴 태그를 정규화하고 비면 undefined", () => {
    expect(normalizeStudioBg3dSceneMeta({})).toBeUndefined();
    expect(normalizeStudioBg3dSceneMeta({ name: "  ", memo: "", hiddenTags: [] })).toBeUndefined();
    expect(normalizeStudioBg3dSceneMeta("메타")).toBeUndefined();
    expect(
      normalizeStudioBg3dSceneMeta({ name: " 교실  내부 ", memo: "첫 줄\r\n\r\n\r\n둘째 줄\n", hiddenTags: ["벽", "가구", "벽"] }),
    ).toEqual({ name: "교실 내부", memo: "첫 줄\n\n둘째 줄", hiddenTags: ["가구", "벽"] });
  });

  it("메모는 줄바꿈을 살리되 줄마다 안전 검사를 하고 하나라도 걸리면 통째로 버린다", () => {
    expect(normalizeStudioBg3dSceneMemo("가\n나\n\n\n다")).toBe("가\n나\n\n다");
    expect(normalizeStudioBg3dSceneMemo("참고 https://example.com")).toBeUndefined();
    expect(normalizeStudioBg3dSceneMemo("정상\n<script>는 텍스트로만 남는다")).toBe("정상\n<script>는 텍스트로만 남는다");
    expect(normalizeStudioBg3dSceneMemo("가".repeat(STUDIO_BG3D_SCENE_MEMO_MAX_CODE_POINTS + 1))).toBeUndefined();
    expect(normalizeStudioBg3dSceneMemo("탭\t분리")).toBeUndefined();
    expect(normalizeStudioBg3dSceneMemo(12)).toBeUndefined();
  });

  it("숨긴 태그만 바꾼 사본을 만들고 결과가 비면 undefined", () => {
    expect(withStudioBg3dHiddenTags(undefined, ["벽"])).toEqual({ hiddenTags: ["벽"] });
    expect(withStudioBg3dHiddenTags({ name: "장면", hiddenTags: ["벽"] }, [])).toEqual({ name: "장면" });
    expect(withStudioBg3dHiddenTags({ hiddenTags: ["벽"] }, [])).toBeUndefined();
  });
});

describe("태그를 반영한 실효 가시성", () => {
  const entities = [
    { id: "a", visible: true, tags: ["벽"] },
    { id: "b", visible: true, tags: ["가구"], parentId: "a" },
    { id: "c", visible: false, tags: [] as string[] },
    { id: "d", visible: true },
  ];

  it("숨긴 태그가 붙은 오브젝트와 그 자식을 숨긴다", () => {
    expect([...collectStudioBg3dEffectivelyVisibleEntityIds(entities)].sort()).toEqual(["a", "b", "d"]);
    expect([...collectStudioBg3dEffectivelyVisibleEntityIds(entities, new Set(["벽"]))].sort()).toEqual(["d"]);
    expect([...collectStudioBg3dEffectivelyVisibleEntityIds(entities, new Set(["가구"]))].sort()).toEqual(["a", "d"]);
    expect([...collectStudioBg3dEffectivelyVisibleEntityIds(entities, new Set())].sort()).toEqual(["a", "b", "d"]);
  });

  it("태그 숨김은 오브젝트 visible 을 바꾸지 않고 따로 판정한다", () => {
    expect(isStudioBg3dTagHidden({ tags: ["벽"] }, new Set(["벽"]))).toBe(true);
    expect(isStudioBg3dTagHidden({ tags: ["벽"] }, new Set(["바닥"]))).toBe(false);
    expect(isStudioBg3dTagHidden({}, new Set(["벽"]))).toBe(false);
    expect(isStudioBg3dTagHidden({ tags: ["벽"] }, undefined)).toBe(false);
    expect(entities[0]?.visible).toBe(true);
  });

  it("구운 사본으로 판정하는 마법 선택은 태그로 숨긴 오브젝트를 숨김으로 거절하고 저장 문서는 그대로 둔다", () => {
    const document = canonical({
      nodes: [node("wall", { tags: ["벽"] }), node("floor", { tags: ["바닥"] })],
      meta: { hiddenTags: ["벽"] },
    });
    const select = (id: string, target: StudioBg3dSceneDocument) =>
      resolveStudioBg3dMagicSelection({ operation: "insert", document: target, selectedIds: [id] });
    // 구운 사본이 아니면 숨긴 태그를 모르므로 통과한다 — 호출부가 구운 사본을 넘겨야 하는 이유다.
    expect(select("wall", document).ok).toBe(true);
    const baked = bakeStudioBg3dTagVisibilityIntoDocument(document);
    expect(select("wall", baked)).toEqual({
      ok: false,
      reason: "selected-node-hidden",
      message: STUDIO_BG3D_MAGIC_SELECTION_REASON_MESSAGES["selected-node-hidden"],
    });
    expect(select("floor", baked).ok).toBe(true);
    expect(document.nodes.map((entry) => entry.visible)).toEqual([true, true]);
    expect(bakeStudioBg3dTagVisibilityIntoDocument(canonical({ nodes: [node("wall")] }))).toEqual(
      canonical({ nodes: [node("wall")] }),
    );
  });
});

describe("장면 문서의 태그·컴포넌트·메타 왕복", () => {
  const nodes = [
    node("wall", { tags: ["벽", "교실"], componentRef: { id: "comp-wall", name: "벽체" } }),
    modelNode("chair", { tags: ["가구"], componentRef: { id: "comp-chair", name: "의자" } }),
    node("floor"),
  ];

  it("직렬화→파싱→재직렬화가 바이트 단위로 같다", () => {
    const document = normalizeStudioBg3dSceneDocument(
      documentWith({
        attachments: [attachment(1)],
        nodes,
        meta: { name: "교실", memo: "아침 교실\n역광", hiddenTags: ["교실"] },
      }),
    );
    const first = serializeStudioBg3dSceneDocument(document);
    expect(first).not.toBeNull();
    const parsed = parseStudioBg3dSceneDocument(first ?? "");
    expect(parsed).toEqual(document);
    expect(serializeStudioBg3dSceneDocument(parsed)).toBe(first);
    expect(parsed?.nodes[0]?.tags).toEqual(["교실", "벽"]);
    expect(parsed?.nodes[0]?.componentRef).toEqual({ id: "comp-wall", name: "벽체" });
    expect(parsed?.nodes[2]).not.toHaveProperty("tags");
    expect(parsed?.meta).toEqual({ name: "교실", memo: "아침 교실\n역광", hiddenTags: ["교실"] });
  });

  it("새 필드를 쓰지 않는 문서는 이 필드를 모르던 때와 바이트가 같다", () => {
    const plain = serializeStudioBg3dSceneDocument(
      normalizeStudioBg3dSceneDocument(documentWith({ nodes: [node("a"), node("b")] })),
    );
    expect(plain).not.toBeNull();
    expect(plain).not.toContain('"tags"');
    expect(plain).not.toContain('"componentRef"');
    expect(plain).not.toContain('"meta"');
    expect(plain).toContain(`"version":${STUDIO_BG3D_SCENE_DOCUMENT_VERSION}`);
    expect(serializeStudioBg3dSceneDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)).not.toContain('"meta"');
    // 기존 문서 → 정규화 → 직렬화가 손실·변형 없이 같은 문자열이다.
    expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(plain ?? ""))).toBe(plain);
  });

  it("스키마 버전은 3으로 둔다(선택 필드 확장이라 기존 문서가 그대로 열린다)", () => {
    expect(STUDIO_BG3D_SCENE_DOCUMENT_VERSION).toBe(3);
  });

  it("엄격 경계는 비정규 표기를 거절한다", () => {
    const base = documentWith({ attachments: [attachment(1)], nodes: [node("a", { tags: ["가", "나"] })] });
    expect(serializeStudioBg3dSceneDocument(base)).not.toBeNull();
    const reject = (nodeExtra: Record<string, unknown>, docExtra: Record<string, unknown> = {}) =>
      serializeStudioBg3dSceneDocument(documentWith({ nodes: [node("a", nodeExtra)], ...docExtra }));
    expect(reject({ tags: ["나", "가"] })).toBeNull();
    expect(reject({ tags: ["가", "가"] })).toBeNull();
    expect(reject({ tags: [] })).toBeNull();
    expect(reject({ tags: ["https://example.com"] })).toBeNull();
    expect(reject({ componentRef: { id: "c", name: "이름", extra: 1 } })).toBeNull();
    expect(reject({ componentRef: { id: "bad id", name: "이름" } })).toBeNull();
    expect(reject({}, { meta: {} })).toBeNull();
    expect(reject({}, { meta: { name: "장면", unknown: true } })).toBeNull();
    expect(reject({}, { meta: { hiddenTags: ["나", "가"] } })).toBeNull();
    expect(reject({}, { meta: { memo: "주소 https://example.com" } })).toBeNull();
  });

  it("엄격 경계는 넘치는 태그를 파싱 실패로, 편집 경계는 예산 오류로 막는다", () => {
    const tags = Array.from({ length: STUDIO_BG3D_NODE_MAX_TAGS + 1 }, (_, index) => `t${index}`);
    expect(serializeStudioBg3dSceneDocument(documentWith({ nodes: [node("a", { tags })] }))).toBeNull();
    expect(() => normalizeStudioBg3dSceneDocument(documentWith({ nodes: [node("a", { tags })] }))).toThrow(
      StudioBg3dSceneDocumentBudgetError,
    );
  });

  it("편집 경계는 올바르지 않은 구성 정보를 조용히 고친다", () => {
    const document = normalizeStudioBg3dSceneDocument(
      documentWith({
        nodes: [node("a", { tags: ["벽", "http://x", "벽", "가구"], componentRef: { id: "bad id", name: "x" } })],
        meta: { name: "", memo: "ok", hiddenTags: ["벽"], extra: 1 },
      }),
    );
    expect(document.nodes[0]?.tags).toEqual(["가구", "벽"]);
    expect(document.nodes[0]).not.toHaveProperty("componentRef");
    expect(document.meta).toEqual({ memo: "ok", hiddenTags: ["벽"] });
  });

  it("직렬화 문서가 320KiB 예산을 넘지 않는 한 최대치의 태그도 왕복한다", () => {
    const tags = Array.from({ length: STUDIO_BG3D_NODE_MAX_TAGS }, (_, index) => `${"가".repeat(30)}${index}`);
    const heavy = Array.from({ length: 64 }, (_, index) => node(`n${index}`, { tags }));
    const document = normalizeStudioBg3dSceneDocument(documentWith({ nodes: heavy }));
    const serialized = serializeStudioBg3dSceneDocument(document);
    expect(serialized).not.toBeNull();
    expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(serialized ?? ""))).toBe(serialized);
  });
});

describe("이전 버전 문서 이행", () => {
  const withoutCameraExtras = (): Record<string, unknown> => {
    const camera = { ...(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera as unknown as Record<string, unknown>) };
    delete camera.nearClip;
    delete camera.up;
    return camera;
  };

  it("v2 문서는 새 필드 없이 그대로 열리고 새 필드를 주장하면 거절한다", () => {
    const v2 = documentWith({ version: 2, camera: withoutCameraExtras(), nodes: [node("a")] });
    const migrated = migrateStudioBg3dSceneDocument(v2);
    expect(migrated).not.toBeNull();
    expect(migrated?.version).toBe(STUDIO_BG3D_SCENE_DOCUMENT_VERSION);
    expect(migrated?.nodes[0]).not.toHaveProperty("tags");
    expect(migrateStudioBg3dSceneDocument({ ...v2, meta: { name: "장면" } })).toBeNull();
    expect(
      migrateStudioBg3dSceneDocument({ ...v2, nodes: [node("a", { tags: ["벽"] })] }),
    ).toBeNull();
    expect(
      migrateStudioBg3dSceneDocument({ ...v2, nodes: [node("a", { componentRef: { id: "c", name: "이름" } })] }),
    ).toBeNull();
  });

  it("v1 문서도 같은 규칙으로 이행하거나 거절한다", () => {
    const v1Budgets = {
      complexity: {
        maxNodes: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxNodes,
        maxTriangles: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxTriangles,
        maxDrawCalls: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxDrawCalls,
        maxMaterials: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxMaterials,
        maxLights: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxLights,
        maxModelBytes: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.complexity.maxModelBytes,
      },
      textures: { ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.budgets.textures },
    };
    const v1 = documentWith({ version: 1, camera: withoutCameraExtras(), budgets: v1Budgets, nodes: [node("a")] });
    expect(migrateStudioBg3dSceneDocument(v1)).not.toBeNull();
    expect(migrateStudioBg3dSceneDocument({ ...v1, meta: { name: "장면" } })).toBeNull();
    expect(migrateStudioBg3dSceneDocument({ ...v1, nodes: [node("a", { tags: ["벽"] })] })).toBeNull();
  });

  it("현재 문서는 이행 경로에서도 새 필드를 보존한다", () => {
    const document = canonical({
      nodes: [node("a", { tags: ["벽"], componentRef: { id: "c", name: "벽체" } })],
      meta: { name: "장면", hiddenTags: ["벽"] },
    });
    expect(migrateStudioBg3dSceneDocument(document)).toEqual(document);
  });
});

describe("컷에 숨긴 태그 저장·복원", () => {
  const organized = (hiddenTags?: readonly string[]): StudioBg3dSceneDocument =>
    canonical({
      nodes: [node("wall", { tags: ["벽"] }), node("floor", { tags: ["바닥"] }), node("lamp")],
      ...(hiddenTags ? { meta: { hiddenTags } } : {}),
    });

  it("태그를 쓰는 장면의 컷은 숨긴 태그를 기억한다", () => {
    const withShot = captureStudioBg3dShot(organized(["벽"]), { id: "shot-a", name: "컷 A" });
    expect(withShot?.shots?.[0]?.hiddenTags).toEqual(["벽"]);
    const noneHidden = captureStudioBg3dShot(organized(), { id: "shot-b", name: "컷 B" });
    expect(noneHidden?.shots?.[0]?.hiddenTags).toEqual([]);
  });

  it("태그를 쓰지 않는 장면의 컷은 예전과 같은 모양이다", () => {
    const plain = canonical({ nodes: [node("a"), node("b")] });
    const withShot = captureStudioBg3dShot(plain, { id: "shot-a", name: "컷 A" });
    expect(withShot?.shots?.[0]).not.toHaveProperty("hiddenTags");
    const serialized = serializeStudioBg3dSceneDocument(withShot);
    expect(serialized).not.toContain("hiddenTags");
    expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(serialized ?? ""))).toBe(serialized);
  });

  it("컷을 적용하면 그때의 숨긴 태그로 되돌리고 오브젝트 visible 은 건드리지 않는다", () => {
    const captured = captureStudioBg3dShot(organized(["벽"]), { id: "shot-a", name: "벽 숨김" });
    expect(captured).not.toBeNull();
    // 이후 사용자가 태그 가시성을 바꿨다고 가정한다.
    const changed = canonical({
      ...(captured as unknown as Record<string, unknown>),
      meta: { hiddenTags: ["바닥"] },
    });
    const applied = applyStudioBg3dShot(changed, "shot-a");
    expect(applied?.meta?.hiddenTags).toEqual(["벽"]);
    expect(applied?.nodes.every((entry) => entry.visible)).toBe(true);
    expect(applied?.activeShotId).toBe("shot-a");
    const serialized = serializeStudioBg3dSceneDocument(applied);
    expect(serializeStudioBg3dSceneDocument(parseStudioBg3dSceneDocument(serialized ?? ""))).toBe(serialized);
  });

  it("아무 태그도 숨기지 않은 컷은 적용하면 숨긴 태그를 모두 푼다", () => {
    const captured = captureStudioBg3dShot(organized(), { id: "shot-a", name: "전체" });
    const changed = canonical({ ...(captured as unknown as Record<string, unknown>), meta: { name: "교실", hiddenTags: ["벽"] } });
    const applied = applyStudioBg3dShot(changed, "shot-a");
    expect(applied?.meta).toEqual({ name: "교실" });
  });

  it("숨긴 태그가 없던 옛 컷은 적용해도 태그 가시성을 바꾸지 않는다", () => {
    const withLegacyShot = canonical({
      nodes: [node("wall", { tags: ["벽"] })],
      meta: { hiddenTags: ["벽"] },
      shots: [{ id: "legacy", name: "옛 컷" }],
    });
    expect(withLegacyShot.shots?.[0]).not.toHaveProperty("hiddenTags");
    const applied = applyStudioBg3dShot(withLegacyShot, "legacy");
    expect(applied?.meta?.hiddenTags).toEqual(["벽"]);
  });

  it("컷 복제는 숨긴 태그를 그대로 가져가고 엄격 경계는 비정규 목록을 거절한다", () => {
    const captured = captureStudioBg3dShot(organized(["벽", "바닥"]), { id: "shot-a", name: "컷 A" });
    const duplicated = duplicateStudioBg3dShot(captured, "shot-a", { id: "shot-b", name: "컷 B" });
    expect(duplicated?.shots?.[1]?.hiddenTags).toEqual(["바닥", "벽"]);
    const broken = documentWith({
      nodes: [node("wall", { tags: ["벽"] })],
      shots: [{ id: "bad", name: "잘못", hiddenTags: ["벽", "가구"] }],
    });
    expect(serializeStudioBg3dSceneDocument(broken)).toBeNull();
    const tooMany = documentWith({
      nodes: [node("wall")],
      shots: [
        {
          id: "many",
          name: "너무 많음",
          hiddenTags: Array.from({ length: STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS + 1 }, (_, index) => `t${index}`),
        },
      ],
    });
    expect(serializeStudioBg3dSceneDocument(tooMany)).toBeNull();
  });
});
