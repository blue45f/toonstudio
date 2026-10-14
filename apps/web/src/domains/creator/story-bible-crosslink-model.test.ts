import { describe, expect, it } from "vitest";

import {
  buildStoryCrosslinkIndex,
  createStoryEntityDraft,
  splitDocumentByMentions,
  type StoryBibleDocument,
  type StoryBibleEntity,
} from "./story-bible-crosslink-model";

const ENTITIES: readonly StoryBibleEntity[] = [
  { id: "char-haneul", kind: "character", name: "김하늘", aliases: ["하늘"] },
  { id: "char-haneulgi", kind: "character", name: "김하늘기", aliases: [] },
  { id: "loc-tower", kind: "location", name: "시계탑", aliases: ["탑"] },
  { id: "prop-key", kind: "prop", name: "황동 열쇠", aliases: [] },
];

const DOCUMENTS: readonly StoryBibleDocument[] = [
  {
    id: "doc-plan-12",
    title: "12화 기획",
    kindLabel: "회차 기획",
    body: "김하늘은 시계탑에서 황동 열쇠를 발견한다. 하늘은 탑의 문을 연다.",
    ownerEntityId: null,
  },
  {
    id: "doc-loc-tower",
    title: "시계탑",
    kindLabel: "바이블 항목",
    body: "시계탑은 마을 중심에 있다. 김하늘기가 어린 시절 놀던 곳.",
    ownerEntityId: "loc-tower",
  },
];

describe("story-bible-crosslink-model", () => {
  it("긴 이름이 짧은 이름·별칭보다 먼저 매칭된다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, DOCUMENTS);
    const inTowerDoc = index.mentions.filter((m) => m.documentId === "doc-loc-tower");
    const haneulgi = inTowerDoc.find((m) => m.matchedText === "김하늘기");
    expect(haneulgi?.entityId).toBe("char-haneulgi");
    // "김하늘기" 안의 "김하늘"이 따로 잡히지 않는다
    expect(inTowerDoc.some((m) => m.entityId === "char-haneul")).toBe(false);
  });

  it("자기 문서에서 자기 이름은 언급으로 세지 않는다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, DOCUMENTS);
    const towerLinks = index.entityLinks.find((l) => l.entityId === "loc-tower");
    // doc-loc-tower는 시계탑 본인이므로 제외, doc-plan-12의 1곳만 남는다
    expect(towerLinks?.mentionCount).toBe(1);
    expect(towerLinks?.backlinks.map((b) => b.documentId)).toEqual(["doc-plan-12"]);
  });

  it("별칭으로도 찾고 viaName이 구분된다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, DOCUMENTS);
    const haneulMentions = index.mentions.filter((m) => m.entityId === "char-haneul");
    expect(haneulMentions.map((m) => m.matchedText)).toContain("김하늘");
    const aliasHit = haneulMentions.find((m) => m.matchedText === "하늘");
    expect(aliasHit?.viaName).toBe(false);
  });

  it("백링크가 문서별 언급 수를 합산한다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, DOCUMENTS);
    const key = index.entityLinks.find((l) => l.entityId === "prop-key");
    expect(key?.mentionCount).toBe(1);
    const haneul = index.entityLinks.find((l) => l.entityId === "char-haneul");
    expect(haneul?.backlinks).toEqual([
      { documentId: "doc-plan-12", documentTitle: "12화 기획", count: 2 },
    ]);
  });

  it("자주 나오지만 등록되지 않은 이름을 후보로 올린다", () => {
    const docs: readonly StoryBibleDocument[] = [
      { id: "d1", title: "1", kindLabel: "기획", body: "루미아는 문을 연다. 루미아가 웃는다." },
      { id: "d2", title: "2", kindLabel: "기획", body: "루미아는 다시 돌아온다." },
    ];
    const index = buildStoryCrosslinkIndex(ENTITIES, docs);
    const candidate = index.candidates.find((c) => c.term === "루미아");
    expect(candidate?.count).toBe(3);
    expect(candidate?.documentIds).toEqual(["d1", "d2"]);
    // 등록된 이름은 후보가 되지 않는다
    expect(index.candidates.some((c) => c.term === "김하늘")).toBe(false);
  });

  it("후보에서 항목 초안을 만든다", () => {
    const draft = createStoryEntityDraft(
      { term: "루미아", count: 3, documentIds: ["d1"], sampleDocumentId: "d1", sampleStart: 0 },
      "new-1",
      "character",
    );
    expect(draft).toEqual({ id: "new-1", kind: "character", name: "루미아", aliases: [] });
  });

  it("본문을 언급 구간으로 나눠 하이라이트할 수 있다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, DOCUMENTS);
    const doc = DOCUMENTS[0]!;
    const mentions = index.documentLinks.find((l) => l.documentId === doc.id)?.mentions ?? [];
    const segments = splitDocumentByMentions(doc.body, mentions);
    expect(segments.map((s) => s.text).join("")).toBe(doc.body);
    expect(segments.some((s) => s.entityId === "loc-tower" && s.text === "시계탑")).toBe(true);
  });

  it("자기 문서 안에서는 자기 이름에 겹친 남의 이름도 언급으로 세지 않는다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, [
      {
        id: "doc-haneulgi",
        title: "김하늘기",
        kindLabel: "바이블 항목",
        body: "김하늘기는 하늘을 올려다본다.",
        ownerEntityId: "char-haneulgi",
      },
    ]);
    // "김하늘기" 구간은 소유자 이름이라 건너뛰고, 뒤의 "하늘"(별칭)만 잡힌다
    const hits = index.mentions.filter((m) => m.documentId === "doc-haneulgi");
    expect(hits.map((m) => m.matchedText)).toEqual(["하늘"]);
    expect(hits[0]?.entityId).toBe("char-haneul");
  });

  it("빈 입력에서도 안전하다", () => {
    const index = buildStoryCrosslinkIndex([], []);
    expect(index.mentions).toEqual([]);
    expect(index.candidates).toEqual([]);
    expect(splitDocumentByMentions("", [])).toEqual([]);
  });

  it("1글자 별칭은 오탐 방지를 위해 매칭하지 않는다", () => {
    const index = buildStoryCrosslinkIndex(ENTITIES, [
      { id: "dx", title: "x", kindLabel: "기획", body: "그는 탑에 올랐다." },
    ]);
    // 별칭 "탑"(1글자)은 패턴에서 제외되므로 잡히지 않는다
    expect(index.mentions.some((m) => m.matchedText === "탑")).toBe(false);
  });
});
