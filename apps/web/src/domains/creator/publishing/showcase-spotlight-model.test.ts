// 쇼케이스 스포트라이트 순수 계산 단위 테스트 — 주인공 선정과 무대 표지 순서.
import { describe, expect, it } from "vitest";

import { pickSpotlightWork, pickStageWorks } from "./showcase-spotlight-model";

import type { WorkSummary } from "@/platform/creator-client";

function work(id: string, cover: string, likes: number): WorkSummary {
  return {
    id,
    title: `작품 ${id}`,
    description: "",
    cover,
    tags: [],
    format: "cuttoon",
    titleId: null,
    status: "published",
    author: { id: "author-1", name: "작가", avatar: "" },
    likes,
    comments: 0,
    views: 0,
    liked: false,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
}

describe("pickSpotlightWork", () => {
  it("빈 목록이면 null을 돌려준다", () => {
    expect(pickSpotlightWork([])).toBeNull();
  });

  it("표지가 있는 첫 작품을 주인공으로 우선한다", () => {
    const works = [work("a", "", 10), work("b", "/cover-b.webp", 5), work("c", "/cover-c.webp", 3)];
    expect(pickSpotlightWork(works)?.id).toBe("b");
  });

  it("표지가 전혀 없으면 목록의 첫 작품을 쓴다", () => {
    const works = [work("a", "", 10), work("b", "  ", 5)];
    expect(pickSpotlightWork(works)?.id).toBe("a");
  });
});

describe("pickStageWorks", () => {
  it("표지 있는 작품을 앞으로 모으고 묶음 안 순서는 유지한다", () => {
    const works = [
      work("a", "", 10),
      work("b", "/cover-b.webp", 5),
      work("c", "", 4),
      work("d", "/cover-d.webp", 3),
    ];
    expect(pickStageWorks(works).map((w) => w.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("상한을 지키고 음수 상한은 빈 목록으로 처리한다", () => {
    const works = [work("a", "/a.webp", 3), work("b", "/b.webp", 2), work("c", "/c.webp", 1)];
    expect(pickStageWorks(works, 2).map((w) => w.id)).toEqual(["a", "b"]);
    expect(pickStageWorks(works, -1)).toEqual([]);
  });

  it("빈 목록이면 빈 목록을 돌려준다", () => {
    expect(pickStageWorks([])).toEqual([]);
  });
});
