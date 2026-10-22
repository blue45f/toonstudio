import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS,
  STUDIO_BG3D_NODE_MAX_TAGS,
  STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS,
  normalizeStudioBg3dComponentRef,
} from "./studio-bg3d-hierarchy";
import {
  STUDIO_BG3D_ORGANIZATION_MAX_BYTES,
  STUDIO_BG3D_SCENE_MAX_TAGS,
  createStudioBg3dComponentId,
  estimateStudioBg3dOrganizationBytes,
  planStudioBg3dOrganizationMutation,
  type StudioBg3dOrganizationAction,
  type StudioBg3dOrganizationDependencies,
} from "./studio-bg3d-organization-mutation";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

import type { BgCustomModelInstance } from "../studio-background-3d-model";
import type { BgPrimitive } from "../studio-background-3d-primitives";
import type {
  StudioBg3dOutlinerMutationPlan,
  StudioBg3dOutlinerSceneSnapshot,
} from "./studio-bg3d-outliner-mutation";

function primitive(id: string, extra: Partial<BgPrimitive> = {}): BgPrimitive {
  return {
    id,
    kind: "box",
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#c9a876",
    ...extra,
  };
}

function model(id: string, extra: Partial<BgCustomModelInstance> = {}): BgCustomModelInstance {
  return {
    id,
    modelId: "stored-1",
    position: [1, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...extra,
  };
}

function snapshot(
  primitives: readonly BgPrimitive[],
  customModels: readonly BgCustomModelInstance[] = [],
  document: StudioBg3dSceneDocument = DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
): StudioBg3dOutlinerSceneSnapshot {
  return { primitives, customModels, document };
}

function documentWithMeta(meta: Record<string, unknown>): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({ ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, meta });
}

const dependencies: StudioBg3dOrganizationDependencies = {
  createComponentId: (taken) => {
    let index = 1;
    while (taken.has(`comp-${index}`)) index += 1;
    return `comp-${index}`;
  },
};

function plan(
  scene: StudioBg3dOutlinerSceneSnapshot,
  action: StudioBg3dOrganizationAction,
  deps: StudioBg3dOrganizationDependencies = dependencies,
): StudioBg3dOutlinerMutationPlan {
  return planStudioBg3dOrganizationMutation({ snapshot: scene, action, dependencies: deps });
}

function okPlan(result: StudioBg3dOutlinerMutationPlan) {
  if (!result.ok) throw new Error(`계획이 거절됐습니다: ${result.reason}`);
  return result;
}

describe("태그 붙이기·떼기", () => {
  it("여러 오브젝트에 태그를 한 번에 붙이고 원본 장면은 바꾸지 않는다", () => {
    const wall = primitive("wall");
    const chair = model("chair");
    const source = snapshot([wall], [chair]);
    const result = okPlan(plan(source, { type: "add-tag", ids: ["wall", "chair"], tag: "  교실 " }));
    expect(result.command).toMatchObject({ id: "bg3d.outliner.add-tag", source: "menu" });
    expect(result.selection).toEqual({ type: "preserve" });
    expect(result.snapshot.primitives[0]?.tags).toEqual(["교실"]);
    expect(result.snapshot.customModels[0]?.tags).toEqual(["교실"]);
    expect(wall.tags).toBeUndefined();
    expect(chair.tags).toBeUndefined();
    expect(result.snapshot.document).toBe(source.document);
  });

  it("태그는 정렬·중복 제거되고 이미 붙은 태그는 unchanged 이다", () => {
    const source = snapshot([primitive("a", { tags: ["벽"] })]);
    const added = okPlan(plan(source, { type: "add-tag", ids: ["a"], tag: "가구" }));
    expect(added.snapshot.primitives[0]?.tags).toEqual(["가구", "벽"]);
    expect(plan(source, { type: "add-tag", ids: ["a"], tag: "벽" })).toEqual({ ok: false, reason: "unchanged" });
  });

  it("없는 오브젝트나 빈 선택은 entity-not-found 로 거절한다", () => {
    const source = snapshot([primitive("a")]);
    expect(plan(source, { type: "add-tag", ids: ["missing"], tag: "벽" })).toEqual({ ok: false, reason: "entity-not-found" });
    expect(plan(source, { type: "add-tag", ids: [], tag: "벽" })).toEqual({ ok: false, reason: "entity-not-found" });
    expect(plan(source, { type: "add-tag", ids: ["a", "missing"], tag: "벽" })).toEqual({
      ok: false,
      reason: "entity-not-found",
    });
  });

  it("주소·비밀 모양이거나 제어 문자·빈 값인 태그는 invalid-input 으로 거절한다", () => {
    const source = snapshot([primitive("a")]);
    for (const tag of ["https://example.com", "api_key", "", "   ", "a\nb", "__proto__", "x".repeat(33)]) {
      expect(plan(source, { type: "add-tag", ids: ["a"], tag })).toEqual({ ok: false, reason: "invalid-input" });
    }
  });

  it("한 오브젝트의 태그 한도를 넘기면 어느 오브젝트도 바꾸지 않고 limit-exceeded 로 거절한다", () => {
    const full = Array.from({ length: STUDIO_BG3D_NODE_MAX_TAGS }, (_, index) => `태그${index}`);
    const source = snapshot([primitive("full", { tags: full }), primitive("empty")]);
    expect(plan(source, { type: "add-tag", ids: ["empty", "full"], tag: "새태그" })).toEqual({
      ok: false,
      reason: "limit-exceeded",
    });
  });

  it("장면 전체 태그 종류 한도를 넘기면 limit-exceeded 로 거절한다", () => {
    const entities = Array.from({ length: STUDIO_BG3D_SCENE_MAX_TAGS }, (_, index) =>
      primitive(`p${index}`, { tags: [`태그${String(index).padStart(3, "0")}`] }),
    );
    const source = snapshot([...entities, primitive("extra")]);
    expect(plan(source, { type: "add-tag", ids: ["extra"], tag: "넘치는태그" })).toEqual({
      ok: false,
      reason: "limit-exceeded",
    });
    // 이미 있는 태그를 다른 오브젝트에 붙이는 것은 종류가 늘지 않으니 통과한다.
    expect(okPlan(plan(source, { type: "add-tag", ids: ["extra"], tag: "태그000" })).snapshot.primitives.at(-1)?.tags).toEqual([
      "태그000",
    ]);
  });

  it("태그·컴포넌트 참조 바이트 어림값이 한도를 넘으면 limit-exceeded 로 거절한다", () => {
    const heavyTags = Array.from({ length: STUDIO_BG3D_NODE_MAX_TAGS }, (_, index) => `${"가".repeat(31)}${index}`);
    const count = Math.ceil(STUDIO_BG3D_ORGANIZATION_MAX_BYTES / 280) + 10;
    const entities = Array.from({ length: count }, (_, index) => primitive(`p${index}`, { tags: heavyTags.slice(0, 7) }));
    expect(estimateStudioBg3dOrganizationBytes(entities)).toBeGreaterThan(STUDIO_BG3D_ORGANIZATION_MAX_BYTES - 1);
    const source = snapshot([...entities, primitive("extra", { tags: heavyTags.slice(0, 7) })]);
    expect(plan(source, { type: "add-tag", ids: ["extra"], tag: heavyTags[7] ?? "x" })).toEqual({
      ok: false,
      reason: "limit-exceeded",
    });
  });

  it("태그를 떼면 비어 있는 키를 남기지 않고 마지막 구성원이 잃으면 숨긴 태그에서도 치운다", () => {
    const document = documentWithMeta({ hiddenTags: ["벽", "교실"] });
    const source = snapshot([primitive("a", { tags: ["벽", "교실"] }), primitive("b", { tags: ["교실"] })], [], document);
    const first = okPlan(plan(source, { type: "remove-tag", ids: ["a"], tag: "벽" }));
    expect(first.snapshot.primitives[0]?.tags).toEqual(["교실"]);
    // 벽 태그의 마지막 구성원이 잃었으니 숨긴 태그 목록에서 빠지고, 교실은 남는다.
    expect(first.snapshot.document.meta?.hiddenTags).toEqual(["교실"]);
    const second = okPlan(plan({ ...source, primitives: first.snapshot.primitives, document: first.snapshot.document }, {
      type: "remove-tag",
      ids: ["a", "b"],
      tag: "교실",
    }));
    expect(second.snapshot.primitives.map((entry) => entry.tags)).toEqual([undefined, undefined]);
    expect(second.snapshot.document.meta).toBeUndefined();
    expect(plan(source, { type: "remove-tag", ids: ["b"], tag: "벽" })).toEqual({ ok: false, reason: "unchanged" });
  });

  it("다른 구성원이 남아 있으면 숨긴 태그를 건드리지 않는다", () => {
    const document = documentWithMeta({ hiddenTags: ["벽"] });
    const source = snapshot([primitive("a", { tags: ["벽"] }), primitive("b", { tags: ["벽"] })], [], document);
    const result = okPlan(plan(source, { type: "remove-tag", ids: ["a"], tag: "벽" }));
    expect(result.snapshot.document).toBe(source.document);
  });

  it("처음 쓰는 태그는 예전에 숨겨 둔 같은 이름의 흔적이 있어도 보이는 채로 시작한다", () => {
    const document = documentWithMeta({ hiddenTags: ["유령"] });
    const source = snapshot([primitive("a")], [], document);
    const result = okPlan(plan(source, { type: "add-tag", ids: ["a"], tag: "유령" }));
    expect(result.snapshot.document.meta).toBeUndefined();
    // 이미 쓰이는 태그를 더 붙일 때는 숨김 상태를 그대로 둔다.
    const used = snapshot([primitive("a", { tags: ["유령"] }), primitive("b")], [], document);
    const more = okPlan(plan(used, { type: "add-tag", ids: ["b"], tag: "유령" }));
    expect(more.snapshot.document.meta?.hiddenTags).toEqual(["유령"]);
  });
});

describe("태그 보이기·숨기기", () => {
  it("태그를 숨기면 meta.hiddenTags 만 바뀌고 오브젝트 visible 은 그대로다", () => {
    const wall = primitive("wall", { tags: ["벽"], visible: true });
    const source = snapshot([wall]);
    const hidden = okPlan(plan(source, { type: "toggle-tag-visibility", tag: "벽" }));
    expect(hidden.snapshot.document.meta?.hiddenTags).toEqual(["벽"]);
    expect(hidden.snapshot.primitives[0]).toBe(wall);
    expect(hidden.command.id).toBe("bg3d.outliner.toggle-tag-visibility");
    const shown = okPlan(plan({ ...source, document: hidden.snapshot.document }, { type: "toggle-tag-visibility", tag: "벽" }));
    expect(shown.snapshot.document.meta).toBeUndefined();
    expect(source.document.meta).toBeUndefined();
  });

  it("장면 이름·메모는 태그 숨김과 함께 보존된다", () => {
    const document = documentWithMeta({ name: "교실", memo: "아침", hiddenTags: [] });
    const source = snapshot([primitive("a", { tags: ["벽"] })], [], document);
    const hidden = okPlan(plan(source, { type: "toggle-tag-visibility", tag: "벽" }));
    expect(hidden.snapshot.document.meta).toEqual({ name: "교실", memo: "아침", hiddenTags: ["벽"] });
    const shown = okPlan(plan({ ...source, document: hidden.snapshot.document }, { type: "toggle-tag-visibility", tag: "벽" }));
    expect(shown.snapshot.document.meta).toEqual({ name: "교실", memo: "아침" });
  });

  it("어떤 오브젝트에도 없는 태그나 잘못된 태그는 거절한다", () => {
    const source = snapshot([primitive("a", { tags: ["벽"] })]);
    expect(plan(source, { type: "toggle-tag-visibility", tag: "없는태그" })).toEqual({ ok: false, reason: "entity-not-found" });
    expect(plan(source, { type: "toggle-tag-visibility", tag: "https://example.com" })).toEqual({
      ok: false,
      reason: "invalid-input",
    });
  });

  it("숨긴 태그 목록 한도를 넘기려 하면 limit-exceeded 로 거절한다", () => {
    const names = Array.from({ length: STUDIO_BG3D_SCENE_MAX_HIDDEN_TAGS }, (_, index) => `태그${String(index).padStart(3, "0")}`);
    const document = documentWithMeta({ hiddenTags: names });
    // 장면 태그 종류 한도(64)와 같은 값이라 한도를 넘는 상황은 숨긴 목록에 낡은 항목이 섞인 경우뿐이다.
    const source = snapshot([primitive("a", { tags: ["새태그"] })], [], document);
    expect(plan(source, { type: "toggle-tag-visibility", tag: "새태그" })).toEqual({ ok: false, reason: "limit-exceeded" });
  });
});

describe("createStudioBg3dComponentId", () => {
  it("시각·임의 값·순번으로 컴포넌트 id 규칙에 맞는 값을 만든다", () => {
    const id = createStudioBg3dComponentId(new Set(), 1_700_000_000_000, () => 0.5);
    expect(id).toMatch(/^comp-[0-9a-z]+-[0-9a-z]{4}-1$/u);
    expect(normalizeStudioBg3dComponentRef({ id, name: "묶음" })).toEqual({ id, name: "묶음" });
  });

  it("이미 쓰는 id 는 건너뛴다", () => {
    const first = createStudioBg3dComponentId(new Set(), 0, () => 0);
    const second = createStudioBg3dComponentId(new Set([first]), 0, () => 0);
    expect(second).not.toBe(first);
    const crowded = new Set([first, "comp-0-0000-2", "comp-0-0000-3"]);
    expect(crowded.has(createStudioBg3dComponentId(crowded, 0, () => 0))).toBe(false);
  });

  it("같은 순간에 다른 임의 값이면 다른 id 가 된다", () => {
    expect(createStudioBg3dComponentId(new Set(), 5, () => 0.1)).not.toBe(createStudioBg3dComponentId(new Set(), 5, () => 0.9));
  });
});

describe("컴포넌트 묶기·풀기·이름 바꾸기", () => {
  it("선택한 오브젝트를 새 컴포넌트로 묶는다", () => {
    const source = snapshot([primitive("a"), primitive("b")], [model("m")]);
    const result = okPlan(plan(source, { type: "group-component", ids: ["a", "m"], name: " 교실   책상 세트 " }));
    expect(result.snapshot.primitives[0]?.componentRef).toEqual({ id: "comp-1", name: "교실 책상 세트" });
    expect(result.snapshot.customModels[0]?.componentRef).toEqual({ id: "comp-1", name: "교실 책상 세트" });
    expect(result.snapshot.primitives[1]?.componentRef).toBeUndefined();
    expect(source.primitives[0]?.componentRef).toBeUndefined();
  });

  it("이미 쓰는 컴포넌트 id 를 건너뛰고 새 id 를 받는다", () => {
    const source = snapshot([primitive("a", { componentRef: { id: "comp-1", name: "기존" } }), primitive("b")]);
    const result = okPlan(plan(source, { type: "group-component", ids: ["b"], name: "새 묶음" }));
    expect(result.snapshot.primitives[1]?.componentRef).toEqual({ id: "comp-2", name: "새 묶음" });
    expect(result.snapshot.primitives[0]?.componentRef).toEqual({ id: "comp-1", name: "기존" });
  });

  it("id 생성기가 겹치거나 규칙에 어긋나는 값을 주면 invalid-input 으로 거절한다", () => {
    const source = snapshot([primitive("a", { componentRef: { id: "comp-1", name: "기존" } }), primitive("b")]);
    expect(plan(source, { type: "group-component", ids: ["b"], name: "새" }, { createComponentId: () => "comp-1" })).toEqual({
      ok: false,
      reason: "invalid-input",
    });
    expect(plan(source, { type: "group-component", ids: ["b"], name: "새" }, { createComponentId: () => "bad id" })).toEqual({
      ok: false,
      reason: "invalid-input",
    });
  });

  it("잘못된 컴포넌트 이름은 거절한다", () => {
    const source = snapshot([primitive("a")]);
    for (const name of ["", "  ", "https://example.com", "x".repeat(STUDIO_BG3D_COMPONENT_NAME_MAX_CODE_POINTS + 1), "a\tb"]) {
      expect(plan(source, { type: "group-component", ids: ["a"], name })).toEqual({ ok: false, reason: "invalid-input" });
    }
    expect(plan(source, { type: "group-component", ids: ["missing"], name: "묶음" })).toEqual({
      ok: false,
      reason: "entity-not-found",
    });
  });

  it("컴포넌트 이름을 바꾸면 모든 인스턴스에 적용되고 id 는 그대로다", () => {
    const source = snapshot(
      [primitive("a", { componentRef: { id: "comp-1", name: "의자" } }), primitive("b", { componentRef: { id: "comp-2", name: "책상" } })],
      [model("m", { componentRef: { id: "comp-1", name: "의자" } })],
    );
    const result = okPlan(plan(source, { type: "rename-component", componentId: "comp-1", name: "교실 의자" }));
    expect(result.snapshot.primitives[0]?.componentRef).toEqual({ id: "comp-1", name: "교실 의자" });
    expect(result.snapshot.customModels[0]?.componentRef).toEqual({ id: "comp-1", name: "교실 의자" });
    expect(result.snapshot.primitives[1]?.componentRef).toEqual({ id: "comp-2", name: "책상" });
    expect(plan(source, { type: "rename-component", componentId: "comp-1", name: "의자" })).toEqual({
      ok: false,
      reason: "unchanged",
    });
    expect(plan(source, { type: "rename-component", componentId: "comp-9", name: "새" })).toEqual({
      ok: false,
      reason: "entity-not-found",
    });
    expect(plan(source, { type: "rename-component", componentId: "comp-1", name: "https://example.com" })).toEqual({
      ok: false,
      reason: "invalid-input",
    });
  });

  it("컴포넌트를 풀면 선택한 오브젝트의 참조만 사라진다", () => {
    const ref = { id: "comp-1", name: "의자" };
    const source = snapshot([primitive("a", { componentRef: ref }), primitive("b", { componentRef: ref }), primitive("c")]);
    const result = okPlan(plan(source, { type: "ungroup-component", ids: ["a"] }));
    expect(result.snapshot.primitives[0]?.componentRef).toBeUndefined();
    expect(result.snapshot.primitives[1]?.componentRef).toEqual(ref);
    expect(plan(source, { type: "ungroup-component", ids: ["c"] })).toEqual({ ok: false, reason: "unchanged" });
  });
});

describe("장면 이름·메모", () => {
  it("이름과 메모를 정규화해 meta 에 담는다", () => {
    const source = snapshot([primitive("a")]);
    const result = okPlan(plan(source, { type: "set-scene-meta", name: "  교실   낮 ", memo: "첫 줄\n\n\n둘째 줄  " }));
    expect(result.snapshot.document.meta).toEqual({ name: "교실 낮", memo: "첫 줄\n\n둘째 줄" });
    expect(result.command.id).toBe("bg3d.outliner.set-scene-meta");
    expect(source.document.meta).toBeUndefined();
  });

  it("빈 값은 해당 필드를 지우고 모두 비면 meta 를 문서에서 뺀다", () => {
    const document = documentWithMeta({ name: "교실", memo: "아침", hiddenTags: ["벽"] });
    const source = snapshot([primitive("a", { tags: ["벽"] })], [], document);
    const nameCleared = okPlan(plan(source, { type: "set-scene-meta", name: "  " }));
    expect(nameCleared.snapshot.document.meta).toEqual({ memo: "아침", hiddenTags: ["벽"] });
    const onlyMeta = documentWithMeta({ name: "교실" });
    const cleared = okPlan(plan(snapshot([], [], onlyMeta), { type: "set-scene-meta", name: "" }));
    expect(cleared.snapshot.document.meta).toBeUndefined();
    expect("meta" in cleared.snapshot.document).toBe(false);
  });

  it("바뀐 것이 없으면 unchanged 이고 주소·비밀 모양 글은 invalid-input 이다", () => {
    const document = documentWithMeta({ name: "교실", memo: "아침" });
    const source = snapshot([], [], document);
    expect(plan(source, { type: "set-scene-meta", name: "교실", memo: "아침" })).toEqual({ ok: false, reason: "unchanged" });
    expect(plan(source, { type: "set-scene-meta", name: "https://example.com" })).toEqual({ ok: false, reason: "invalid-input" });
    expect(plan(source, { type: "set-scene-meta", memo: "첫 줄\napi_key" })).toEqual({ ok: false, reason: "invalid-input" });
    expect(plan(source, { type: "set-scene-meta", name: "x".repeat(81) })).toEqual({ ok: false, reason: "invalid-input" });
  });

  it("이름만 바꿀 때 메모와 숨긴 태그는 그대로다", () => {
    const document = documentWithMeta({ name: "교실", memo: "아침", hiddenTags: ["벽"] });
    const source = snapshot([primitive("a", { tags: ["벽"] })], [], document);
    const result = okPlan(plan(source, { type: "set-scene-meta", name: "복도" }));
    expect(result.snapshot.document.meta).toEqual({ name: "복도", memo: "아침", hiddenTags: ["벽"] });
  });
});
