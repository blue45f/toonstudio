import { describe, expect, it } from "vitest";

import {
  addStudioCharacter,
  createEmptyStudioCharacterBible,
  type StudioCharacterBible,
} from "./studio-character-bible";
import {
  buildStudioCharacterRelationshipMap,
  countStudioCharacterRelationshipsByKind,
  draftAllStudioCharacterRelationships,
  formatStudioCharacterRelationship,
  parseStudioCharacterRelationship,
  parseStudioCharacterRelationships,
  removeStudioCharacterRelationship,
  upsertStudioCharacterRelationship,
} from "./studio-character-relationships";

function bibleFixture(): StudioCharacterBible {
  let bible = createEmptyStudioCharacterBible();
  bible = addStudioCharacter(bible, {
    id: "seoha",
    name: "윤서하",
    relationships: [
      "민재 — 불신하지만 의지하는 동료",
      "도윤 — 실종된 형",
      "해온: 라이벌이자 첫사랑",
      "수아 (동맹) — 같은 반 친구",
      "이름 모를 약사",
    ],
  });
  bible = addStudioCharacter(bible, { id: "minjae", name: "민재", relationships: ["윤서하 — 속을 알 수 없는 동료"] });
  bible = addStudioCharacter(bible, { id: "doyun", name: "도윤" });
  bible = addStudioCharacter(bible, { id: "haeon", name: "해온" });
  return bible;
}

describe("parseStudioCharacterRelationship — 무손실 구조화 초안", () => {
  it("separates target, infers conflict over ally, and keeps the memo verbatim", () => {
    const bible = bibleFixture();
    const owner = bible.characters[0];
    const parsed = parseStudioCharacterRelationship(owner.relationships[0], owner, bible.characters);
    expect(parsed.targetName).toBe("민재");
    expect(parsed.targetCharacterId).toBe("minjae");
    expect(parsed.kind).toBe("conflict");
    expect(parsed.kindExplicit).toBe(false);
    expect(parsed.memo).toBe("불신하지만 의지하는 동료");
  });

  it("infers family and lover kinds from the memo keywords", () => {
    const bible = bibleFixture();
    const owner = bible.characters[0];
    expect(parseStudioCharacterRelationship(owner.relationships[1], owner, bible.characters)).toMatchObject({
      targetName: "도윤",
      targetCharacterId: "doyun",
      kind: "family",
      memo: "실종된 형",
    });
    // 가족/연인 키워드가 함께 있으면 가족·연인 우선순위(연인)가 갈등(라이벌)보다 먼저 잡힌다.
    expect(parseStudioCharacterRelationship(owner.relationships[2], owner, bible.characters).kind).toBe("lover");
  });

  it("honours an explicit (종류) tag over keyword inference and strips it from the target", () => {
    const bible = bibleFixture();
    const owner = bible.characters[0];
    const parsed = parseStudioCharacterRelationship(owner.relationships[3], owner, bible.characters);
    expect(parsed).toMatchObject({ targetName: "수아", kind: "ally", kindExplicit: true, targetCharacterId: null });
    expect(parsed.memo).toBe("같은 반 친구");
  });

  it("keeps separator-less text whole as the target with an empty memo", () => {
    const bible = bibleFixture();
    const owner = bible.characters[0];
    const parsed = parseStudioCharacterRelationship(owner.relationships[4], owner, bible.characters);
    expect(parsed).toMatchObject({ targetName: "이름 모를 약사", memo: "", kind: "other", targetCharacterId: null });
  });

  it("never resolves the owner themself as the target", () => {
    const bible = bibleFixture();
    const owner = bible.characters[0];
    const parsed = parseStudioCharacterRelationship("윤서하 — 자기 자신과의 약속", owner, bible.characters);
    expect(parsed.targetCharacterId).toBeNull();
  });

  it("drafts every legacy string exactly once (lossless migration)", () => {
    const bible = bibleFixture();
    const drafts = draftAllStudioCharacterRelationships(bible);
    for (const character of bible.characters) {
      const list = drafts.get(character.id) ?? [];
      expect(list).toHaveLength(character.relationships.length);
      list.forEach((draft, index) => {
        expect(draft.raw).toBe(character.relationships[index]);
        expect(draft.index).toBe(index);
        // 대상+메모를 합치면 원문의 모든 내용이 남는다.
        const rejoined = `${draft.targetName} ${draft.memo}`;
        for (const token of (character.relationships[index] ?? "").replace(/[:—()-]/gu, " ").split(/\s+/u).filter(Boolean)) {
          if (["갈등", "동맹", "가족", "연인", "기타"].includes(token)) continue;
          expect(rejoined).toContain(token);
        }
      });
    }
  });
});

describe("format/parse round-trip", () => {
  it("is stable: format(parse(format(x))) === format(x)", () => {
    const bible = bibleFixture();
    const owner = bible.characters[0];
    for (const raw of owner.relationships) {
      const parsed = parseStudioCharacterRelationship(raw, owner, bible.characters);
      const once = formatStudioCharacterRelationship(parsed);
      const twice = formatStudioCharacterRelationship(
        parseStudioCharacterRelationship(once, owner, bible.characters),
      );
      expect(twice).toBe(once);
    }
  });

  it("writes an explicit 기타 tag so an explicit choice is not re-inferred", () => {
    const raw = formatStudioCharacterRelationship({
      targetName: "약사",
      kind: "other",
      kindExplicit: true,
      memo: "동료처럼 보이지만 아직 모른다",
    });
    expect(raw).toBe("약사 (기타) — 동료처럼 보이지만 아직 모른다");
  });
});

describe("upsert/remove — 맵 편집이 시트에 반영", () => {
  it("adds a structured relationship that lands in the owner's sheet list", () => {
    const bible = bibleFixture();
    const next = upsertStudioCharacterRelationship(bible, "doyun", {
      targetName: "",
      targetCharacterId: "seoha",
      kind: "family",
      memo: "실종됐다 돌아온 동생을 지킨다",
    });
    const doyun = next.characters.find((character) => character.id === "doyun");
    expect(doyun?.relationships).toEqual(["윤서하 (가족) — 실종됐다 돌아온 동생을 지킨다"]);
    expect(bible.characters.find((character) => character.id === "doyun")?.relationships).toEqual([]);
    const parsed = parseStudioCharacterRelationships(next, "doyun");
    expect(parsed[0]).toMatchObject({ targetCharacterId: "seoha", kind: "family", kindExplicit: true });
  });

  it("replaces by index and removes by index without mutating the source", () => {
    const bible = bibleFixture();
    const edited = upsertStudioCharacterRelationship(
      bible,
      "seoha",
      { targetName: "민재", kind: "ally", memo: "이제는 믿는 동료" },
      0,
    );
    expect(edited.characters[0]?.relationships[0]).toBe("민재 (동맹) — 이제는 믿는 동료");
    const removed = removeStudioCharacterRelationship(edited, "seoha", 0);
    expect(removed.characters[0]?.relationships).toHaveLength(4);
    expect(edited.characters[0]?.relationships).toHaveLength(5);
    expect(removeStudioCharacterRelationship(bible, "missing", 0)).toBe(bible);
    expect(removeStudioCharacterRelationship(bible, "seoha", 99)).toBe(bible);
  });

  it("rejects an empty target and a duplicate add instead of silently dropping", () => {
    const bible = bibleFixture();
    expect(() =>
      upsertStudioCharacterRelationship(bible, "doyun", { targetName: "  ", kind: "other", memo: "" }),
    ).toThrow(/대상/);
    const once = upsertStudioCharacterRelationship(bible, "doyun", {
      targetName: "해온",
      kind: "conflict",
      memo: "라이벌",
    });
    expect(() =>
      upsertStudioCharacterRelationship(once, "doyun", { targetName: "해온", kind: "conflict", memo: "라이벌" }),
    ).toThrow(/이미 같은 관계/);
  });
});

describe("buildStudioCharacterRelationshipMap", () => {
  it("builds character nodes, ghost nodes for sheet-less targets, and resolved edges", () => {
    const map = buildStudioCharacterRelationshipMap(bibleFixture());
    const characterNodes = map.nodes.filter((node) => node.characterId !== null);
    const ghostNodes = map.nodes.filter((node) => node.characterId === null);
    expect(characterNodes).toHaveLength(4);
    expect(ghostNodes.map((node) => node.name).sort()).toEqual(["수아", "이름 모를 약사"]);
    expect(map.edges).toHaveLength(6);
    for (const node of map.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.y).toBeGreaterThanOrEqual(0);
      expect(node.y).toBeLessThanOrEqual(1);
    }
  });

  it("marks the 서하↔민재 pair bidirectional and the rest one-way", () => {
    const map = buildStudioCharacterRelationshipMap(bibleFixture());
    const seohaToMinjae = map.edges.find(
      (edge) => edge.ownerCharacterId === "seoha" && edge.targetCharacterId === "minjae",
    );
    const minjaeToSeoha = map.edges.find(
      (edge) => edge.ownerCharacterId === "minjae" && edge.targetCharacterId === "seoha",
    );
    expect(seohaToMinjae?.bidirectional).toBe(true);
    expect(minjaeToSeoha?.bidirectional).toBe(true);
    expect(map.edges.find((edge) => edge.ownerCharacterId === "seoha" && edge.index === 1)?.bidirectional).toBe(false);
  });

  it("handles an empty bible", () => {
    expect(buildStudioCharacterRelationshipMap(createEmptyStudioCharacterBible())).toEqual({
      nodes: [],
      edges: [],
    });
  });
});

describe("countStudioCharacterRelationshipsByKind", () => {
  it("counts kinds across the whole bible", () => {
    const counts = countStudioCharacterRelationshipsByKind(bibleFixture());
    expect(counts.family).toBe(1);
    // 동맹: 수아(명시 태그) + 민재→서하(메모의 '동료' 추론)
    expect(counts.ally).toBe(2);
    expect(counts.conflict).toBe(1);
    expect(counts.lover).toBe(1);
    expect(counts.other).toBe(1);
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(6);
  });
});
