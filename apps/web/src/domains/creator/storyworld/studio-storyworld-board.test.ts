import { describe, expect, it } from "vitest";

import { STORYWORLD_DEMO_PROJECT, type StoryworldProject } from "./studio-storyworld-causality";
import { buildStoryworldBoard } from "./studio-storyworld-board";

const emptyProject: StoryworldProject = {
  ...STORYWORLD_DEMO_PROJECT,
  id: "empty-world",
  title: "빈 세계",
  characters: [],
  facts: [],
  scenes: [],
  setupContracts: [],
  motifs: [],
};

describe("buildStoryworldBoard", () => {
  it("projects real elements into character, scene, location, and fact cards", () => {
    const board = buildStoryworldBoard(STORYWORLD_DEMO_PROJECT);
    expect(board.hasElements).toBe(true);
    expect(board.elementCount).toBe(12);

    expect(board.characters.map((card) => card.id)).toEqual(["haeun", "dojin"]);
    const haeun = board.characters[0];
    expect(haeun?.name).toBe("하은");
    expect(haeun?.goal).toBe("사라진 동생의 기억 찾기");
    expect(haeun?.sceneCount).toBe(4);
    expect(haeun?.initialFactCount).toBe(1);
    expect(haeun?.secretFactCount).toBe(0);
    expect(board.characters[1]?.sceneCount).toBe(3);
    expect(board.characters[1]?.secretFactCount).toBe(1);

    expect(board.scenes.map((card) => card.id)).toEqual(["s10", "s20", "s30", "s40"]);
    expect(board.scenes[1]?.locationId).toBe("memory-market");
    expect(board.scenes[1]?.participantCount).toBe(2);
    expect(board.scenes[1]?.dependencyCount).toBe(1);
    expect(board.scenes[0]?.disabled).toBe(false);
  });

  it("derives location cards from scene locationId values without inventing names", () => {
    const board = buildStoryworldBoard(STORYWORLD_DEMO_PROJECT);
    expect(board.locations.map((card) => card.id)).toEqual(["memory-market", "vault"]);
    expect(board.locations[0]?.sceneCount).toBe(2);
    expect(board.locations[0]?.participantCount).toBe(2);
  });

  it("labels fact subjects with the character name when the subject is a character", () => {
    const board = buildStoryworldBoard(STORYWORLD_DEMO_PROJECT);
    const byId = new Map(board.facts.map((card) => [card.id, card]));
    expect(byId.get("key-owned")?.subjectLabel).toBe("하은");
    expect(byId.get("dojin-is-brother")?.subjectLabel).toBe("도진");
    // 세계 주체(city·vault)는 이름 레지스트리가 없어 식별자를 그대로 둔다.
    expect(byId.get("city-rains-at-night")?.subjectLabel).toBe("city");
    expect(byId.get("city-rains-at-night")?.canonical).toBe(true);
    expect(byId.get("vault-open")?.canonical).toBe(false);
  });

  it("builds participation, dependency, and location relations plus a laid-out mini graph", () => {
    const board = buildStoryworldBoard(STORYWORLD_DEMO_PROJECT);
    const byKind = (kind: string) => board.relations.filter((relation) => relation.kind === kind);
    expect(byKind("participates")).toHaveLength(7);
    expect(byKind("depends-on")).toHaveLength(3);
    expect(byKind("located-at")).toHaveLength(4);
    expect(board.relations).toHaveLength(14);

    expect(board.graphOmission).toBeNull();
    expect(board.graph?.nodes).toHaveLength(8);
    expect(board.graph?.edges).toHaveLength(14);
    const sceneNode = board.graph?.nodes.find((node) => node.nodeId === "scene:s20");
    const characterNode = board.graph?.nodes.find((node) => node.nodeId === "character:haeun");
    const locationNode = board.graph?.nodes.find((node) => node.nodeId === "location:vault");
    // 열 순서: 캐릭터(왼쪽) · 장면(가운데) · 장소(오른쪽)
    expect(characterNode?.x).toBeLessThan(sceneNode?.x ?? 0);
    expect(sceneNode?.x).toBeLessThan(locationNode?.x ?? 0);
    const dependencyEdge = board.graph?.edges.find((edge) => edge.kind === "depends-on");
    expect(dependencyEdge?.path).toContain("C");
    const straightEdge = board.graph?.edges.find((edge) => edge.kind === "participates");
    expect(straightEdge?.path).toContain("L");
  });

  it("reports an element-less project as empty with no graph", () => {
    const board = buildStoryworldBoard(emptyProject);
    expect(board.hasElements).toBe(false);
    expect(board.elementCount).toBe(0);
    expect(board.relations).toHaveLength(0);
    expect(board.graph).toBeNull();
    expect(board.graphOmission).toBe("no-relations");
  });

  it("omits the graph entirely when elements exist but no relation connects them", () => {
    const board = buildStoryworldBoard({
      ...emptyProject,
      characters: [{ id: "solo", name: "솔로" }],
      scenes: [{ id: "only", title: "홀로 있는 장면", order: 1 }],
    });
    expect(board.hasElements).toBe(true);
    expect(board.relations).toHaveLength(0);
    expect(board.graph).toBeNull();
    expect(board.graphOmission).toBe("no-relations");
  });

  it("skips dangling references instead of drawing edges to missing elements", () => {
    const board = buildStoryworldBoard({
      ...emptyProject,
      scenes: [{
        id: "s1",
        title: "끊긴 참조 장면",
        order: 1,
        participantIds: ["ghost"],
        dependsOnSceneIds: ["missing-scene"],
      }],
    });
    expect(board.relations).toHaveLength(0);
    expect(board.graph).toBeNull();
  });

  it("folds the graph away when the world is too large to stay readable", () => {
    const characters = Array.from({ length: 31 }, (_, index) => ({ id: `c${index}`, name: `인물 ${index}` }));
    const board = buildStoryworldBoard({
      ...emptyProject,
      characters,
      scenes: [{ id: "s1", title: "전원 등장", order: 1, participantIds: characters.map((c) => c.id) }],
    });
    expect(board.relations.length).toBeGreaterThan(0);
    expect(board.graph).toBeNull();
    expect(board.graphOmission).toBe("too-large");
  });
});
