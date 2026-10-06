// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { CommunityActivityPreview } from "./community-activity-preview";

import type { FanCafePost } from "@/shared/lib/types";

const getMock = vi.fn();
vi.mock("@/platform/api", () => ({
  api: { get: (...args: unknown[]) => getMock(...args) },
  getApiErrorMessage: async () => "커뮤니티 글을 불러오지 못했어요.",
}));

function makePost(id: string, kind: FanCafePost["kind"], title: string): FanCafePost {
  return {
    id,
    scope: "title",
    targetId: "work-1",
    targetLabel: "달빛 기사단",
    kind,
    title,
    text: "본문",
    tags: [],
    images: [],
    author: { name: "작가", avatar: "🎨" },
    createdAt: "2026-10-05T00:00:00.000Z",
    replyCount: 3,
  };
}

const popular = [
  makePost("p1", "talk", "인기 잡담 글"),
  makePost("p2", "fanart", "인기 팬아트 글"),
  makePost("p3", "theory", "인기 해석 글"),
  makePost("p4", "cheer", "인기 응원 글"),
  makePost("p5", "talk", "다섯 번째 인기 글"),
];
const recent = [makePost("r1", "talk", "방금 올라온 새 글")];
const fanart = [makePost("f1", "fanart", "최신 팬아트 작품")];
const events = [makePost("e1", "event", "주말 팬미팅 소식")];

function mockPools(overrides: Partial<Record<"popular" | "recent" | "fanart" | "events", FanCafePost[]>> = {}) {
  const data = { popular, recent, fanart, events, ...overrides };
  getMock.mockImplementation(async (url: string) => {
    if (url.includes("kind=fanart")) return { items: data.fanart };
    if (url.includes("kind=event")) return { items: data.events };
    if (url.includes("sort=popular")) return { items: data.popular };
    return { items: data.recent };
  });
}

function renderPreview() {
  return render(
    <MemoryRouter>
      <CommunityActivityPreview />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  getMock.mockReset();
});

afterEach(cleanup);

describe("CommunityActivityPreview", () => {
  it("활동 스트립과 추천 탭 카드를 피드 쿼리로 렌더링한다", async () => {
    mockPools();
    renderPreview();

    // 활동 스트립: 인기 글 3 + 최신 팬아트
    expect(await screen.findByText("지금 뜨는 글")).toBeTruthy();
    expect(await screen.findByText("최신 팬아트")).toBeTruthy();
    expect(screen.getAllByText("인기 잡담 글").length).toBeGreaterThan(0);
    expect(screen.getAllByText("최신 팬아트 작품").length).toBeGreaterThan(0);

    // 추천 탭(기본): 종류가 겹치지 않게 고른 상위 4개 — 5번째 글은 추천에 없다
    expect(screen.getByRole("tab", { name: "추천" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByText("다섯 번째 인기 글")).toBeNull();

    // 카드 링크는 게시글 상세로 이동한다
    const link = screen.getAllByRole("link", { name: /인기 팬아트 글/ })[0];
    expect(link?.getAttribute("href")).toBe("/community/post/p2");
  });

  it("탭을 바꾸면 해당 풀의 글을 보여준다", async () => {
    mockPools();
    renderPreview();
    await screen.findByText("지금 뜨는 글");

    fireEvent.click(screen.getByRole("tab", { name: "신작" }));
    expect(await screen.findByText("방금 올라온 새 글")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(await screen.findByText("주말 팬미팅 소식")).toBeTruthy();

    // 인기 탭은 상위 4개까지만 — 5번째 글은 인기 탭에도 없다
    fireEvent.click(screen.getByRole("tab", { name: "인기" }));
    expect(screen.queryByText("다섯 번째 인기 글")).toBeNull();
    expect(screen.getAllByText("인기 잡담 글").length).toBeGreaterThan(0);
  });

  it("탭 풀이 비어 있으면 실패가 아닌 성공 빈 상태를 보여준다", async () => {
    mockPools({ events: [] });
    renderPreview();
    await screen.findByText("지금 뜨는 글");

    fireEvent.click(screen.getByRole("tab", { name: "이벤트" }));
    expect(await screen.findByText("아직 올라온 이벤트 글이 없어요")).toBeTruthy();
  });

  it("활동이 전혀 없으면 섹션 자체를 숨긴다", async () => {
    mockPools({ popular: [], recent: [], fanart: [], events: [] });
    const { container } = renderPreview();
    await waitFor(() => expect(container.textContent).toBe(""));
  });

  it("전부 실패하면 빈 상태로 위장하지 않고 재시도 가능한 오류를 보여준다", async () => {
    getMock.mockRejectedValue(new Error("network down"));
    renderPreview();

    const retry = await screen.findByRole("button", { name: /다시 시도/ });
    expect(screen.getByText("커뮤니티 활동을 불러오지 못했어요")).toBeTruthy();

    const callsBefore = getMock.mock.calls.length;
    fireEvent.click(retry);
    await waitFor(() => expect(getMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });
});
