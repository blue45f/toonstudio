import { describe, expect, it } from "vitest";

import {
  createStudioReferenceBoardDocument,
  createStudioReferenceBoardItem,
  STUDIO_REFERENCE_BOARD_MAX_ITEMS,
} from "../studio-reference-board";
import {
  buildEpisodeBoardCompareItems,
  copyEpisodeBoardItemsToDocument,
  copyReferenceDocumentToEpisodeBoard,
  createEpisodeReferenceBoard,
  episodeReferenceBoardId,
  episodeReferenceBoardSatisfiesReferences,
  evaluateEpisodeReferenceBoardLink,
  isEpisodeReferenceBoardFor,
} from "./episode-reference-board";

const SHA_A = `sha256:${"a".repeat(64)}` as const;
const SHA_B = `sha256:${"b".repeat(64)}` as const;

function item(id: string, name: string) {
  const created = createStudioReferenceBoardItem({
    id,
    asset: { sha256: id === "item-a" ? SHA_A : SHA_B, name },
    view: {
      centerX: 0.5, centerY: 0.5, zoom: 1, rotationDeg: 0,
      flipX: false, flipY: false, opacity: 1, grayscale: false,
    },
  });
  if (!created) throw new Error("fixture item");
  return created;
}

function boardWithTwo() {
  const board = createEpisodeReferenceBoard({
    projectId: "project-1",
    episodeId: "episode-12",
    document: createStudioReferenceBoardDocument([item("item-a", "포즈 사진"), item("item-b", "배경 자료")]),
  });
  if (!board) throw new Error("fixture board");
  return board;
}

describe("회차 팀 레퍼런스 보드 (4단계)", () => {
  it("보드 id는 projectId+episodeId에서 결정적이고 빈 id는 거부한다", () => {
    expect(episodeReferenceBoardId("project-1", "episode-12")).toBe("episode-reference:project-1::episode-12");
    expect(episodeReferenceBoardId(" project-1 ", " episode-12 ")).toBe("episode-reference:project-1::episode-12");
    expect(episodeReferenceBoardId("", "episode-12")).toBeNull();
    expect(episodeReferenceBoardId("project-1", "  ")).toBeNull();
    expect(createEpisodeReferenceBoard({ projectId: "", episodeId: "episode-12" })).toBeNull();
  });

  it("다른 회차 보드는 이 회차 보드로 인정하지 않는다", () => {
    const board = boardWithTwo();
    expect(isEpisodeReferenceBoardFor(board, { projectId: "project-1", episodeId: "episode-12" })).toBe(true);
    expect(isEpisodeReferenceBoardFor(board, { projectId: "project-1", episodeId: "episode-13" })).toBe(false);
  });

  it("연결 상태: 없음/빈 보드/채워진 보드를 구분하고 충족은 채워진 보드만", () => {
    expect(evaluateEpisodeReferenceBoardLink(null)).toMatchObject({ status: "unlinked", satisfiesReferences: false });
    const empty = createEpisodeReferenceBoard({ projectId: "project-1", episodeId: "episode-12" });
    expect(evaluateEpisodeReferenceBoardLink(empty)).toMatchObject({ status: "empty", itemCount: 0, satisfiesReferences: false });
    expect(evaluateEpisodeReferenceBoardLink(boardWithTwo())).toMatchObject({ status: "ready", itemCount: 2, satisfiesReferences: true });
    expect(episodeReferenceBoardSatisfiesReferences(null)).toBe(false);
    expect(episodeReferenceBoardSatisfiesReferences(boardWithTwo())).toBe(true);
  });

  it("개인 보드를 회차 보드로 복사하면 항목이 합쳐지고 원본은 불변이다", () => {
    const personal = createStudioReferenceBoardDocument([item("item-a", "포즈 사진")]);
    const copied = copyReferenceDocumentToEpisodeBoard({
      projectId: "project-1", episodeId: "episode-12", source: personal, updatedBy: "actor-1",
    });
    expect(copied?.document.items.map((entry) => entry.id)).toEqual(["item-a"]);
    expect(copied?.updatedBy).toBe("actor-1");
    // 같은 항목을 다시 복사해도 중복이 생기지 않는다(보드 연산의 id 중복 규칙).
    const recopied = copyReferenceDocumentToEpisodeBoard({
      projectId: "project-1", episodeId: "episode-12", source: personal, existing: copied,
    });
    expect(recopied?.document.items).toHaveLength(1);
    expect(personal.items).toHaveLength(1);
  });

  it("회차 보드 항목을 개인 문서로 가져올 때도 상한을 지킨다", () => {
    const full = createStudioReferenceBoardDocument(
      Array.from({ length: STUDIO_REFERENCE_BOARD_MAX_ITEMS }, (_, index) => item(`item-${index}`, `자료 ${index}`)),
    );
    const merged = copyEpisodeBoardItemsToDocument(boardWithTwo(), full);
    expect(merged.items).toHaveLength(STUDIO_REFERENCE_BOARD_MAX_ITEMS);
  });

  it("보드 이미지는 reference 비교 소스가 된다(이름 없으면 순서 라벨)", () => {
    const items = buildEpisodeBoardCompareItems(boardWithTwo(), {
      boardLabel: "12화 레퍼런스 보드",
      resolveImageUrl: (entry) => `blob:${entry.id}`,
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      source: { kind: "reference", boardId: "episode-reference:project-1::episode-12", itemId: "item-a" },
      sourceKind: "reference",
      processLabel: "12화 레퍼런스 보드",
      revisionLabel: "포즈 사진",
      imageUrl: "blob:item-a",
    });
    expect(items[1]?.revisionLabel).toBe("배경 자료");
  });
});
