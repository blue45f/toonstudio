// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { PromotionPost } from "../../../../../packages/core/src/promotion";
import { PromotionCard } from "./PromotionCard";

const post: PromotionPost = {
  id: "11111111-1111-4111-8111-111111111111",
  kind: "series",
  stage: "amateur",
  genre: "판타지",
  title: "별의 여행 연재를 시작합니다",
  seriesTitle: "별의 여행",
  description: "첫 번째 웹툰의 이야기를 소개합니다. 새로운 세계의 모험을 함께해 주세요.",
  readingUrl: "",
  videoUrl: "",
  cover: "",
  tags: [],
  contentWarning: "",
  rightsConfirmed: true,
  author: { id: "artist-1", name: "김작가" },
  createdAt: "2026-10-05T00:00:00.000Z",
  updatedAt: "2026-10-05T00:00:00.000Z",
  version: 1,
  hidden: false,
  archived: false,
  saved: false,
};

function view(node: React.ReactNode) {
  return render(<MemoryRouter>{node}</MemoryRouter>);
}

afterEach(cleanup);

describe("PromotionCard", () => {
  it("표지가 없으면 장르 라벨을 단 타이포그래피 커버로 대체한다", () => {
    view(<PromotionCard post={post} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("판타지")).toBeTruthy();
    expect(screen.getByText("아마추어")).toBeTruthy();
    expect(screen.getByText("작품·신작 소개")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "별의 여행 연재를 시작합니다" })).toBeTruthy();
    expect(screen.getByText(post.description)).toBeTruthy();
  });

  it("표지가 있으면 커버 이미지를 쓰고 영상 주소가 있으면 영상 배지를 단다", () => {
    const cover = "data:image/jpeg;base64,/9j/AA==";
    view(<PromotionCard post={{ ...post, cover, videoUrl: "https://www.youtube.com/watch?v=ABCDEFGHIJK" }} />);
    const image = screen.getByRole("img", { name: "별의 여행 표지" }) as HTMLImageElement;
    expect(image.src).toBe(cover);
    expect(screen.getByText("영상")).toBeTruthy();
  });

  it("기본값에서는 상세·작가 링크를 건다", () => {
    view(<PromotionCard post={post} />);
    const detailLinks = screen.getAllByRole("link").filter((link) => link.getAttribute("href") === `/community/promote/${post.id}`);
    expect(detailLinks.length).toBe(2);
    expect(screen.getByRole("link", { name: "김작가" }).getAttribute("href")).toBe("/u/artist-1");
    expect(document.querySelector("time")?.getAttribute("dateTime")).toBe(post.createdAt);
  });

  it("미리보기(interactive=false)에서는 링크 없이 같은 내용을 표시한다", () => {
    view(<PromotionCard post={post} interactive={false} />);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("heading", { name: "별의 여행 연재를 시작합니다" })).toBeTruthy();
    expect(screen.getByText("김작가")).toBeTruthy();
    expect(screen.getByText(post.description)).toBeTruthy();
  });
});
