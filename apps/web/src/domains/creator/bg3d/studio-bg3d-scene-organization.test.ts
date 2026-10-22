import { describe, expect, it } from "vitest";

import {
  bakeStudioBg3dTagVisibilityIntoDocument,
  projectStudioBg3dTagVisibility,
  readStudioBg3dHiddenTagSet,
} from "./studio-bg3d-hierarchy";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";
import {
  buildStudioBg3dOrganizationView,
  type StudioBg3dOrganizationEntitySource,
} from "./studio-bg3d-scene-organization";

function entity(
  id: string,
  extra: Partial<StudioBg3dOrganizationEntitySource> = {},
): StudioBg3dOrganizationEntitySource {
  return { id, ...extra };
}

function documentWithHidden(hiddenTags: readonly string[]): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({ ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT, meta: { hiddenTags } });
}

function documentNode(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
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

describe("buildStudioBg3dOrganizationView", () => {
  it("구성 정보가 없는 장면은 빈 읽기 모델이다", () => {
    const view = buildStudioBg3dOrganizationView({
      entities: [entity("a"), entity("b")],
      document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(view.tags).toEqual([]);
    expect(view.componentGroups).toEqual([]);
    expect(view.tagHiddenIds.size).toBe(0);
    expect(view.hiddenTags.size).toBe(0);
    expect(view.meta).toEqual({ name: "", memo: "" });
  });

  it("태그를 코드 유닛 순서로 모으고 구성원 id 를 엔티티 순서대로 담는다", () => {
    const view = buildStudioBg3dOrganizationView({
      entities: [
        entity("a", { tags: ["벽", "교실"] }),
        entity("b", { tags: ["벽"] }),
        entity("c"),
        entity("d", { tags: ["가구"] }),
      ],
      document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(view.tags.map((entry) => entry.tag)).toEqual(["가구", "교실", "벽"]);
    expect(view.tags.find((entry) => entry.tag === "벽")).toMatchObject({ count: 2, memberIds: ["a", "b"], hidden: false });
    expect(view.tagsByEntityId.get("a")).toEqual(["벽", "교실"]);
    expect(view.tagsByEntityId.has("c")).toBe(false);
  });

  it("숨긴 태그가 붙은 오브젝트를 tagHiddenIds 로 알려 주되 자기 visible 은 보지 않는다", () => {
    const view = buildStudioBg3dOrganizationView({
      entities: [
        entity("a", { tags: ["벽"] }),
        entity("b", { tags: ["벽", "교실"], visible: false }),
        entity("c", { tags: ["교실"] }),
      ],
      document: documentWithHidden(["벽"]),
    });
    expect([...view.tagHiddenIds].sort()).toEqual(["a", "b"]);
    expect(view.tags.find((entry) => entry.tag === "벽")?.hidden).toBe(true);
    expect(view.tags.find((entry) => entry.tag === "교실")?.hidden).toBe(false);
    expect(view.hiddenTags.has("벽")).toBe(true);
  });

  it("컴포넌트 묶음은 처음 나온 순서로 모으고 이름은 첫 구성원의 것을 쓴다", () => {
    const view = buildStudioBg3dOrganizationView({
      entities: [
        entity("a", { componentRef: { id: "comp-2", name: "의자" } }),
        entity("b", { componentRef: { id: "comp-1", name: "책상" } }),
        entity("c", { componentRef: { id: "comp-2", name: "다른 이름" } }),
        entity("d"),
      ],
      document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(view.componentGroups).toEqual([
      { id: "comp-2", name: "의자", memberIds: ["a", "c"] },
      { id: "comp-1", name: "책상", memberIds: ["b"] },
    ]);
    expect(view.componentIdByEntityId.get("c")).toBe("comp-2");
    expect(view.componentIdByEntityId.has("d")).toBe(false);
  });

  it("장면 이름과 메모를 그대로 읽는다", () => {
    const document = normalizeStudioBg3dSceneDocument({
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      meta: { name: "교실 낮", memo: "창가 쪽 책상 정리" },
    });
    const view = buildStudioBg3dOrganizationView({ entities: [], document });
    expect(view.meta).toEqual({ name: "교실 낮", memo: "창가 쪽 책상 정리" });
  });
});

describe("projectStudioBg3dTagVisibility", () => {
  it("숨길 태그가 없으면 입력 배열을 그대로 돌려준다", () => {
    const entities = [entity("a", { tags: ["벽"] })];
    expect(projectStudioBg3dTagVisibility(entities, undefined)).toBe(entities);
    expect(projectStudioBg3dTagVisibility(entities, new Set())).toBe(entities);
    expect(projectStudioBg3dTagVisibility(entities, new Set(["다른"]))).toBe(entities);
  });

  it("숨긴 태그가 붙은 오브젝트만 visible:false 사본으로 바꾸고 원본은 건드리지 않는다", () => {
    const wall = entity("wall", { tags: ["벽"] });
    const floor = entity("floor", { tags: ["바닥"] });
    const plain = entity("plain");
    const entities = [wall, floor, plain];
    const projected = projectStudioBg3dTagVisibility(entities, new Set(["벽"]));
    expect(projected).not.toBe(entities);
    expect(projected[0]).toMatchObject({ id: "wall", visible: false });
    expect(projected[0]).not.toBe(wall);
    expect(projected[1]).toBe(floor);
    expect(projected[2]).toBe(plain);
    expect(wall.visible).toBeUndefined();
  });

  it("이미 숨겨진 오브젝트는 사본을 만들지 않는다", () => {
    const hidden = entity("a", { tags: ["벽"], visible: false });
    const entities = [hidden];
    expect(projectStudioBg3dTagVisibility(entities, new Set(["벽"]))).toBe(entities);
  });

  it("태그를 다시 보이게 해도 따로 숨긴 오브젝트는 숨겨진 채로 남는다", () => {
    const own = entity("own", { tags: ["벽"], visible: false });
    const other = entity("other", { tags: ["벽"] });
    const hiddenView = projectStudioBg3dTagVisibility([own, other], new Set(["벽"]));
    expect(hiddenView.map((entry) => entry.visible)).toEqual([false, false]);
    const shownView = projectStudioBg3dTagVisibility([own, other], new Set());
    expect(shownView.map((entry) => entry.visible)).toEqual([false, undefined]);
  });
});

describe("readStudioBg3dHiddenTagSet / bakeStudioBg3dTagVisibilityIntoDocument", () => {
  it("숨긴 태그가 없으면 undefined 를 돌려준다", () => {
    expect(readStudioBg3dHiddenTagSet(undefined)).toBeUndefined();
    expect(readStudioBg3dHiddenTagSet(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)).toBeUndefined();
    expect([...(readStudioBg3dHiddenTagSet(documentWithHidden(["벽", "교실"])) ?? [])].sort()).toEqual(["교실", "벽"]);
  });

  it("렌더 전용 문서에 숨긴 태그를 노드 visible 로 굽고 저장 문서는 건드리지 않는다", () => {
    const base = documentWithHidden(["벽"]);
    const withNodes = normalizeStudioBg3dSceneDocument({
      ...base,
      nodes: [documentNode("wall", { tags: ["벽"] }), documentNode("floor")],
    });
    const baked = bakeStudioBg3dTagVisibilityIntoDocument(withNodes);
    expect(baked).not.toBe(withNodes);
    expect(baked.nodes.map((node) => node.visible)).toEqual([false, true]);
    expect(withNodes.nodes.map((node) => node.visible)).toEqual([true, true]);
    // 숨길 노드가 없으면 같은 문서를 돌려준다.
    expect(bakeStudioBg3dTagVisibilityIntoDocument(base)).toBe(base);
    expect(bakeStudioBg3dTagVisibilityIntoDocument(DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT)).toBe(
      DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    );
  });
});
