// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ShowcasePage } from "./ShowcasePage";
import { pickSpotlightWork } from "./publishing/showcase-spotlight-model";

import { useApp } from "@/shared/lib/store";

import type { WorkSummary } from "@/platform/creator-client";

const creatorClient = vi.hoisted(() => ({
  listWorks: vi.fn(),
  listSeries: vi.fn(),
  listFollowingFeed: vi.fn(),
  listChallenges: vi.fn(),
  createSeries: vi.fn(),
}));

vi.mock("@/platform/creator-client", () => ({
  ...creatorClient,
  challengeDday: () => null,
  updateSeries: vi.fn(),
}));

// 공간 캠퍼스·공용 여정 링크는 이 화면의 동작과 무관하므로 가볍게 대체한다.
vi.mock("@/shared/components/spatial-campus/CampusObjectSource", () => ({ CampusObjectSource: () => null }));
vi.mock("@/shared/components/public-creative", () => ({ CreativeJourneyLinks: () => null }));

function work(id: string, title: string, cover = ""): WorkSummary {
  return {
    id,
    title,
    description: "주인공 작품 설명입니다.",
    cover,
    tags: ["로맨스"],
    format: "upload",
    titleId: null,
    status: "published",
    author: { id: "author-1", name: "빛나 작가", avatar: "#7c5cfc" },
    likes: 42,
    comments: 7,
    views: 1024,
    liked: false,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function renderShowcase() {
  return render(
    <MemoryRouter initialEntries={["/showcase"]}>
      <ShowcasePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  creatorClient.listWorks.mockResolvedValue([
    work("w1", "표지 없는 작품"),
    work("w2", "주인공 작품", "/covers/w2.webp"),
  ]);
  creatorClient.listSeries.mockResolvedValue([]);
  creatorClient.listFollowingFeed.mockResolvedValue([]);
  creatorClient.listChallenges.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useApp.setState({ userId: null });
});

describe("pickSpotlightWork", () => {
  it("빈 목록에서는 주인공이 없다", () => {
    expect(pickSpotlightWork([])).toBeNull();
  });

  it("표지가 있는 작품을 목록 순서보다 우선한다", () => {
    const picked = pickSpotlightWork([work("w1", "표지 없는 작품"), work("w2", "표지 있는 작품", "/c.webp")]);
    expect(picked?.id).toBe("w2");
  });

  it("표지가 전혀 없으면 첫 작품을 쓴다", () => {
    const picked = pickSpotlightWork([work("w1", "첫 작품"), work("w2", "둘째 작품")]);
    expect(picked?.id).toBe("w1");
  });
});

describe("ShowcasePage", () => {
  it("머리말은 쇼케이스 전용 카피와 선정 기준을 밝힌다", () => {
    renderShowcase();
    expect(screen.getByRole("heading", { level: 1, name: "쇼케이스" })).toBeTruthy();
    expect(screen.getByText(/좋아요를 가장 많이 받은 작품이 오늘의 주인공/u)).toBeTruthy();
    const shortcuts = screen.getByRole("navigation", { name: "쇼케이스 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "창작 챌린지" }).getAttribute("href")).toBe("/showcase/challenges");
    expect(within(shortcuts).getByRole("link", { name: "승인본 전시" }).getAttribute("href")).toBe("/showcase/reviews");
  });

  it("주인공 작품을 대형으로 조명하고 작품·작가로 이어진다", async () => {
    renderShowcase();
    const heroTitle = await screen.findByRole("heading", { level: 2, name: "주인공 작품" });
    const article = heroTitle.closest("article");
    expect(article).not.toBeNull();
    const scope = within(article as HTMLElement);
    // 표지 이미지 링크와 CTA 모두 작품 상세(정식 경로)로 이어진다.
    const workLinks = scope.getAllByRole("link").filter((link) => link.getAttribute("href") === "/create/w2");
    expect(workLinks.length).toBeGreaterThanOrEqual(2);
    expect(scope.getByRole("link", { name: /작가 프로필/u }).getAttribute("href")).toBe("/u/author-1");
    expect(scope.getByText("빛나 작가")).toBeTruthy();
    expect(scope.getByText("주인공 작품 설명입니다.")).toBeTruthy();
    // 좋아요순으로 주인공을 골랐는지 요청으로 확인한다.
    expect(creatorClient.listWorks).toHaveBeenCalledWith({ sort: "likes" }, expect.anything());
  });

  it("스포트라이트 아래에 전체 작품 갤러리 구간이 이어진다", async () => {
    renderShowcase();
    expect(screen.getByRole("heading", { level: 2, name: "전체 작품 둘러보기" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "작품 보기" })).toBeTruthy();
    expect(await screen.findByText("작품 2개")).toBeTruthy();
  });

  it("공개 작품이 없으면 주인공을 지어내지 않고 빈 상태를 보여 준다", async () => {
    creatorClient.listWorks.mockResolvedValue([]);
    renderShowcase();
    expect(await screen.findByText("아직 조명할 작품이 없어요")).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 2, name: "주인공 작품" })).toBeNull();
  });

  it("주인공을 불러오지 못하면 재시도를 보여 주고, 재시도로 복구된다", async () => {
    creatorClient.listWorks.mockRejectedValue(new Error("offline"));
    renderShowcase();
    const title = await screen.findByText("주목 작품을 잠시 불러올 수 없어요");
    const panel = title.closest("[data-slot='showcase-unavailable']");
    expect(panel).not.toBeNull();

    creatorClient.listWorks.mockResolvedValue([work("w2", "주인공 작품", "/covers/w2.webp")]);
    fireEvent.click(within(panel as HTMLElement).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByRole("heading", { level: 2, name: "주인공 작품" })).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("주목 작품을 잠시 불러올 수 없어요")).toBeNull());
  });

  // F-B02-1 회귀 고정: API 장애 시 데이터 영역이 스켈레톤에 머물지 않고 오류 상태로 전이돼야 한다.
  it("목록을 불러오지 못하면 갤러리도 스켈레톤을 끝내고 오류와 재시도를 보여 준다", async () => {
    creatorClient.listWorks.mockRejectedValue(new Error("offline"));
    creatorClient.listChallenges.mockRejectedValue(new Error("offline"));
    const { container } = renderShowcase();

    const galleryTitle = await screen.findByText("작품 목록을 잠시 불러올 수 없어요");
    const galleryPanel = galleryTitle.closest("[data-slot='showcase-unavailable']");
    expect(galleryPanel).not.toBeNull();
    expect(within(galleryPanel as HTMLElement).getByRole("button", { name: "다시 시도" })).toBeTruthy();
    // 주인공 영역도 같은 실패에서 오류 상태로 전이한다.
    expect(await screen.findByText("주목 작품을 잠시 불러올 수 없어요")).toBeTruthy();
    // 실패가 정산된 뒤에는 어느 데이터 영역에도 스켈레톤이 남지 않는다.
    await waitFor(() => expect(container.querySelectorAll(".skeleton")).toHaveLength(0));
  });

  it("갤러리 재시도를 누르면 작품 목록이 복구된다", async () => {
    creatorClient.listWorks.mockRejectedValue(new Error("offline"));
    renderShowcase();
    const galleryTitle = await screen.findByText("작품 목록을 잠시 불러올 수 없어요");
    const galleryPanel = galleryTitle.closest("[data-slot='showcase-unavailable']");
    expect(galleryPanel).not.toBeNull();
    // 실패 상태에서는 빈 상태 문구가 섞이지 않는다.
    expect(screen.queryByText("첫 번째 작품을 기다리고 있어요.")).toBeNull();

    creatorClient.listWorks.mockResolvedValue([
      work("w1", "표지 없는 작품"),
      work("w2", "주인공 작품", "/covers/w2.webp"),
    ]);
    fireEvent.click(within(galleryPanel as HTMLElement).getByRole("button", { name: "다시 시도" }));
    expect(await screen.findByText("작품 2개")).toBeTruthy();
    await waitFor(() => expect(screen.queryByText("작품 목록을 잠시 불러올 수 없어요")).toBeNull());
  });

  it("빈 결과는 실패로 보이지 않고 갤러리 빈 상태를 보여 준다", async () => {
    creatorClient.listWorks.mockResolvedValue([]);
    renderShowcase();
    expect(await screen.findByText("아직 조명할 작품이 없어요")).toBeTruthy();
    expect(await screen.findByText("첫 번째 작품을 기다리고 있어요.")).toBeTruthy();
    expect(screen.queryByText("작품 목록을 잠시 불러올 수 없어요")).toBeNull();
    expect(screen.queryByText("주목 작품을 잠시 불러올 수 없어요")).toBeNull();
  });
});
