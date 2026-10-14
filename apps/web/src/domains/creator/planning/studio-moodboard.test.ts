import { describe, expect, it } from "vitest";

import {
  addMoodboardCard,
  createDefaultStudioProjectMoodboard,
  createMoodboard,
  deserializeMoodboard,
  ensureStudioProjectMoodboard,
  moodboardSummary,
  moveMoodboardCard,
  readStudioProjectMoodboard,
  removeMoodboardCard,
  resolveMoodboardCardImage,
  saveStudioProjectMoodboard,
  serializeMoodboard,
  studioMoodboardStorageKey,
  toggleMoodboardTodo,
  type Moodboard,
} from "./studio-moodboard";

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    map,
  };
}

function sampleBoard(): Moodboard {
  let board = createMoodboard({ id: "b1", title: "1화 무드", projectId: "project-1" });
  board = addMoodboardCard(board, "b1-col-0", { id: "c1", kind: "image", ref: "project:asset-1" });
  board = addMoodboardCard(board, "b1-col-0", { id: "c2", kind: "note", text: "밤 골목, 젖은 간판" });
  board = addMoodboardCard(board, "b1-col-1", {
    id: "c3",
    kind: "link",
    ref: "https://example.com/ref",
    text: "참고 기사",
  });
  board = addMoodboardCard(board, "b1-col-2", { id: "c4", kind: "todo", text: "배경 톤 정하기" });
  return board;
}

describe("기획 무드보드 모델", () => {
  it("카드를 배치·이동·토글하고 요약이 맞는다", () => {
    let board = sampleBoard();
    board = moveMoodboardCard(board, "c1", "b1-col-1", 0);
    board = toggleMoodboardTodo(board, "c4");
    expect(board.columns[0]?.cardIds).toEqual(["c2"]);
    expect(board.columns[1]?.cardIds).toEqual(["c1", "c3"]);
    expect(moodboardSummary(board)).toEqual({
      total: 4,
      byKind: { image: 1, note: 1, link: 1, todo: 1 },
      todosOpen: 0,
    });
  });

  it("없는 열·없는 카드·중복 카드 추가는 보드를 바꾸지 않는다", () => {
    const board = sampleBoard();
    expect(addMoodboardCard(board, "nope", { id: "c9", kind: "note", text: "x" })).toBe(board);
    expect(addMoodboardCard(board, "b1-col-0", { id: "c1", kind: "note", text: "x" })).toBe(board);
    expect(moveMoodboardCard(board, "nope", "b1-col-1", 0)).toBe(board);
    expect(moveMoodboardCard(board, "c1", "nope", 0)).toBe(board);
  });

  it("카드 삭제는 열 배치와 카드 맵에서 함께 지운다", () => {
    const board = removeMoodboardCard(sampleBoard(), "c2");
    expect(board.cards.c2).toBeUndefined();
    expect(board.columns[0]?.cardIds).toEqual(["c1"]);
  });

  it("저장·재열기하면 배치가 그대로 복원된다", () => {
    const board = sampleBoard();
    const restored = deserializeMoodboard(serializeMoodboard(board));
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.board).toEqual(JSON.parse(serializeMoodboard(board)));
      expect(restored.board.columns.map((col) => col.cardIds)).toEqual([
        ["c1", "c2"],
        ["c3"],
        ["c4"],
      ]);
    }
  });

  it("깨진 카드 참조가 있는 데이터는 사유와 함께 거부한다", () => {
    const broken = deserializeMoodboard(
      '{"version":1,"id":"x","title":"t","columns":[{"id":"a","title":"t","cardIds":["nope"]}],"cards":{}}',
    );
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.reason).toContain("nope");
  });

  it("중복 배치·고아 카드·잘못된 링크도 사유와 함께 거부한다", () => {
    const duplicated = deserializeMoodboard(
      JSON.stringify({
        version: 1,
        id: "x",
        title: "t",
        columns: [
          { id: "a", title: "t", cardIds: ["c1"] },
          { id: "b", title: "t", cardIds: ["c1"] },
        ],
        cards: { c1: { id: "c1", kind: "note", text: "메모" } },
      }),
    );
    expect(duplicated.ok).toBe(false);

    const orphan = deserializeMoodboard(
      JSON.stringify({
        version: 1,
        id: "x",
        title: "t",
        columns: [{ id: "a", title: "t", cardIds: [] }],
        cards: { c1: { id: "c1", kind: "note", text: "메모" } },
      }),
    );
    expect(orphan.ok).toBe(false);
    if (!orphan.ok) expect(orphan.reason).toContain("c1");

    const badLink = deserializeMoodboard(
      JSON.stringify({
        version: 1,
        id: "x",
        title: "t",
        columns: [{ id: "a", title: "t", cardIds: ["c1"] }],
        cards: { c1: { id: "c1", kind: "link", ref: "javascript:alert(1)" } },
      }),
    );
    expect(badLink.ok).toBe(false);
  });
});

describe("이미지 참조 해석", () => {
  const catalog = [
    { refId: "asset-1", scope: "project" as const, label: "골목 배경", imageUrl: "https://cdn.example/a.png" },
    { refId: "asset-2", scope: "personal" as const, label: "내 스케치" },
    { refId: "asset-3", scope: "personal" as const, label: "개인 표정표", imageUrl: "https://cdn.example/c.png" },
  ];

  it("project:/personal: 접두와 무접두 id를 해석한다", () => {
    expect(resolveMoodboardCardImage({ id: "i1", kind: "image", ref: "project:asset-1" }, catalog)).toEqual({
      status: "resolved",
      imageUrl: "https://cdn.example/a.png",
      label: "골목 배경",
      scope: "project",
    });
    const bare = resolveMoodboardCardImage({ id: "i2", kind: "image", ref: "asset-3" }, catalog);
    expect(bare.status).toBe("resolved");
    if (bare.status === "resolved") expect(bare.scope).toBe("personal");
  });

  it("URL 참조는 외부 이미지로, 없는 에셋·주소 없는 에셋은 깨진 참조로 돌려준다", () => {
    const url = resolveMoodboardCardImage(
      { id: "i3", kind: "image", ref: "https://example.com/x.jpg" },
      catalog,
    );
    expect(url.status).toBe("resolved");
    const missing = resolveMoodboardCardImage({ id: "i4", kind: "image", ref: "project:nope" }, catalog);
    expect(missing.status).toBe("broken");
    const noUrl = resolveMoodboardCardImage({ id: "i5", kind: "image", ref: "personal:asset-2" }, catalog);
    expect(noUrl.status).toBe("broken");
    expect(
      resolveMoodboardCardImage({ id: "n1", kind: "note", text: "메모" }, catalog).status,
    ).toBe("not-image");
  });
});

describe("프로젝트 단위 저장소", () => {
  it("프로젝트별로 격리되고, 저장 후 다시 열면 같은 보드다", () => {
    const storage = memoryStorage();
    const board = sampleBoard();
    saveStudioProjectMoodboard(storage, board);
    expect(storage.map.has(studioMoodboardStorageKey("project-1"))).toBe(true);

    const reopened = readStudioProjectMoodboard(storage, "project-1");
    expect(reopened?.ok).toBe(true);
    if (reopened?.ok) expect(reopened.board).toEqual(JSON.parse(serializeMoodboard(board)));
    expect(readStudioProjectMoodboard(storage, "project-2")).toBeNull();
  });

  it("ensure는 기본 보드를 한 번 만들고 이후에는 저장본을 돌려준다", () => {
    const storage = memoryStorage();
    const first = ensureStudioProjectMoodboard(storage, "project-9");
    expect(first.projectId).toBe("project-9");
    expect(first.columns.map((col) => col.title)).toEqual(["레퍼런스", "메모", "할 일"]);
    const changed = addMoodboardCard(first, first.columns[0]!.id, {
      id: "x1",
      kind: "note",
      text: "기억할 것",
    });
    saveStudioProjectMoodboard(storage, changed);
    expect(ensureStudioProjectMoodboard(storage, "project-9").cards.x1?.text).toBe("기억할 것");
  });

  it("깨진 저장본은 사유와 함께 거부하고 ensure도 덮지 않는다", () => {
    const storage = memoryStorage();
    storage.setItem(
      studioMoodboardStorageKey("project-1"),
      '{"version":1,"id":"x","title":"t","columns":[{"id":"a","title":"t","cardIds":["ghost"]}],"cards":{}}',
    );
    const read = readStudioProjectMoodboard(storage, "project-1");
    expect(read?.ok).toBe(false);
    if (read && !read.ok) expect(read.reason).toContain("ghost");
    expect(() => ensureStudioProjectMoodboard(storage, "project-1")).toThrow(/ghost/);
  });

  it("기본 보드 생성은 프로젝트 id를 검증한다", () => {
    expect(() => createDefaultStudioProjectMoodboard("  ")).toThrow();
    expect(createDefaultStudioProjectMoodboard("p1").id).toBe("p1:moodboard");
  });
});
