// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
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

function renderShowcase(initialEntry = "/showcase") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ShowcasePage />
      <RouteProbe />
    </MemoryRouter>,
  );
}

function RouteProbe() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="showcase-route">{location.pathname + location.search}</output><button onClick={() => navigate("/elsewhere")} type="button">테스트 다른 화면</button><button onClick={() => navigate("/showcase?q=%EB%B9%9B%EB%82%98&sort=likes")} type="button">테스트 외부 검색 주소</button><button onClick={() => navigate(-1)} type="button">테스트 뒤로</button></>;
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
  vi.unstubAllGlobals();
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
  it("모바일 메뉴는 현재 위치를 알리는 단일 접힘이며 공개 행동은 참여 안내에서 한 번 제공한다", () => {
    const { container } = renderShowcase();
    const menu = screen.getByRole("group", { name: "탐색·커뮤니티 메뉴" });
    expect((menu as HTMLDetailsElement).open).toBe(false);
    expect(within(menu).getByText("창작 갤러리", { selector: "span" })).toBeTruthy();
    expect(container.querySelectorAll("[data-contextual-subnav]")).toHaveLength(1);
    expect(menu.querySelector('[aria-current="page"]')?.textContent).toBe("창작 갤러리");
    expect(container.querySelectorAll('a[href="/studio/publish"]')).toHaveLength(1);
  });

  it("데스크톱에서는 같은 메뉴 DOM이 처음부터 열려 있다", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { container } = renderShowcase();
    expect((screen.getByRole("group", { name: "탐색·커뮤니티 메뉴" }) as HTMLDetailsElement).open).toBe(true);
    expect(container.querySelectorAll("[data-contextual-subnav]")).toHaveLength(1);
  });

  it("머리말은 작품 탐색을 먼저 안내하고 창작 바로가기는 접힌 참여 영역에서 찾는다", () => {
    renderShowcase();
    expect(screen.getByRole("heading", { level: 1, name: "마음에 드는 작품을 찾아보세요" })).toBeTruthy();
    const shortcuts = screen.getByRole("navigation", { name: "쇼케이스 바로가기" });
    expect(within(shortcuts).getByRole("link", { name: "창작 챌린지" }).getAttribute("href")).toBe("/showcase/challenges");
    expect(within(shortcuts).getByRole("link", { name: "승인본 전시" }).getAttribute("href")).toBe("/showcase/reviews");
  });

  it("검색과 보기 조건 뒤의 짧은 추천은 실제 작품·작가·태그로 이어진다", async () => {
    renderShowcase();
    const heroTitle = await screen.findByRole("heading", { level: 2, name: "주인공 작품" });
    const article = heroTitle.closest("article");
    expect(article).not.toBeNull();
    const scope = within(article as HTMLElement);
    // 표지 이미지 링크와 CTA 모두 작품 상세(정식 경로)로 이어진다.
    const workLinks = scope.getAllByRole("link").filter((link) => link.getAttribute("href") === "/showcase/work/w2");
    expect(workLinks.length).toBeGreaterThanOrEqual(2);
    const search = screen.getByRole("search", { name: "불러온 작품에서 찾기" });
    expect(search.compareDocumentPosition(article as Node) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const metadata = scope.getByRole("group", { name: "추천 작품 정보" });
    expect((metadata as HTMLDetailsElement).open).toBe(false);
    const trigger = within(metadata).getByText("작품 정보").closest("summary");
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger as HTMLElement);
    expect(scope.getByRole("link", { name: /작가 프로필/u }).getAttribute("href")).toBe("/u/author-1");
    // 추천의 부가 정보는 필요할 때 열고 원래 작가·태그 경로를 계속 이용한다.
    expect(scope.getByRole("link", { name: /^빛나 작가/u }).getAttribute("href")).toBe("/u/author-1");
    expect(scope.getByRole("link", { name: "#로맨스" }).getAttribute("href")).toBe("/showcase?tag=%EB%A1%9C%EB%A7%A8%EC%8A%A4");
    expect(scope.getByText("주인공 작품 설명입니다.")).toBeTruthy();
    fireEvent.keyDown(scope.getByRole("link", { name: /작가 프로필/u }), { key: "Escape" });
    expect((metadata as HTMLDetailsElement).open).toBe(false);
    expect(document.activeElement).toBe(trigger);
    // 좋아요순으로 주인공을 골랐는지 요청으로 확인한다.
    expect(creatorClient.listWorks).toHaveBeenCalledWith({ sort: "likes" }, expect.anything());
  });

  it("검색·조건·짧은 추천 아래에 전체 작품이 이어지고 추가 추천은 접혀 있다", async () => {
    renderShowcase();
    expect(screen.getByRole("heading", { level: 2, name: "전체 작품 둘러보기" })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "작품 보기" })).toBeTruthy();
    expect(await screen.findByText("작품 2개")).toBeTruthy();
    expect((screen.getByRole("group", { name: "추천 컬렉션·챌린지" }) as HTMLDetailsElement).open).toBe(false);
  });

  it("불러온 전체 배열에서 제목·작가를 찾고 입력 초점과 서버 요청 계약을 유지한다", async () => {
    const cafe = work("cafe", "Cafe Tomorrow");
    const moon = { ...work("moon", "달의 호수"), author: { id: "author-2", name: "홍길동", avatar: "" } };
    creatorClient.listWorks.mockResolvedValue([cafe, moon, work("other", "다른 이야기")]);
    renderShowcase();
    await screen.findByText("작품 3개");
    const input = screen.getByRole("searchbox", { name: "불러온 작품에서 제목·작가 찾기" });
    input.focus();
    fireEvent.change(input, { target: { value: "ＣＡＦＥ" } });
    // 모바일 실제 실패 회귀: 라우터 반영을 기다리지 않고 같은 동작에서 즉시 제출한다.
    fireEvent.submit(screen.getByRole("search", { name: "불러온 작품에서 찾기" }));
    expect(await screen.findByText("불러온 3개 중 1개")).toBeTruthy();
    expect(document.activeElement).toBe(input);
    const results = within(screen.getByRole("tabpanel"));
    expect(results.getAllByRole("link").some(link => link.getAttribute("href") === "/showcase/work/cafe")).toBe(true);
    expect(results.queryByText("달의 호수")).toBeNull();
    const requests = creatorClient.listWorks.mock.calls.length;
    fireEvent.change(input, { target: { value: "홍길동" } });
    fireEvent.submit(screen.getByRole("search", { name: "불러온 작품에서 찾기" }));
    await waitFor(() => expect(results.getAllByRole("link").some(link => link.getAttribute("href") === "/showcase/work/moon")).toBe(true));
    expect(results.queryByText("Cafe Tomorrow")).toBeNull();
    expect(creatorClient.listWorks.mock.calls.length).toBe(requests);
    expect(creatorClient.listWorks.mock.calls.every(([params]) => !("q" in params))).toBe(true);
  });

  it("한글 조합을 확정하는 Enter는 제출하지 않고 조합 완료 후 입력을 찾는다", async () => {
    renderShowcase();
    await screen.findByText("작품 2개");
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    const form = screen.getByRole("search", { name: "불러온 작품에서 찾기" });
    input.focus();
    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㅂ" } });
    expect(fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 })).toBe(false);
    fireEvent.submit(form);
    expect(screen.getByTestId("showcase-route").textContent).toBe("/showcase");
    expect(input.value).toBe("ㅂ");
    fireEvent.compositionEnd(input, { data: "빛나" });
    fireEvent.change(input, { target: { value: "빛나" } });
    fireEvent.submit(form);
    expect(await screen.findByText("불러온 2개 중 2개")).toBeTruthy();
    expect(input.value).toBe("빛나");
    expect(document.activeElement).toBe(input);
  });

  it("입력 초안은 주소를 매번 바꾸지 않고 외부 주소·뒤로 가기·지우기에 동기화된다", async () => {
    renderShowcase("/showcase?q=%ED%91%9C%EC%A7%80");
    await screen.findByText("불러온 2개 중 1개");
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "아직 제출하지 않은 초안" } });
    expect(screen.getByTestId("showcase-route").textContent).toBe("/showcase?q=%ED%91%9C%EC%A7%80");
    fireEvent.click(screen.getByRole("button", { name: "테스트 외부 검색 주소" }));
    expect(await screen.findByText("불러온 2개 중 2개")).toBeTruthy();
    expect(input.value).toBe("빛나");
    fireEvent.click(screen.getByRole("button", { name: "테스트 뒤로" }));
    expect(await screen.findByText("불러온 2개 중 1개")).toBeTruthy();
    expect(input.value).toBe("표지");
    fireEvent.click(screen.getByRole("button", { name: "검색 지우기" }));
    expect(await screen.findByText("작품 2개")).toBeTruthy();
    expect(input.value).toBe("");
  });

  it("처음 표시하는 12개 밖의 일치 작품도 찾고 전체 건수와 구분한다", async () => {
    creatorClient.listWorks.mockResolvedValue(Array.from({ length: 20 }, (_, index) => work("work-" + index, index === 19 ? "멀리 있는 일치 작품" : "일반 작품 " + index)));
    renderShowcase("/showcase?q=%EB%A9%80%EB%A6%AC");
    expect(await screen.findByText("불러온 20개 중 1개")).toBeTruthy();
    const results = within(screen.getByRole("tabpanel"));
    expect(results.getAllByRole("link").map(link => link.getAttribute("href"))).toContain("/showcase/work/work-19");
    expect(results.queryByRole("button", { name: /더 보기/u })).toBeNull();
  });

  it("일치가 없으면 실패로 꾸미지 않고 검색만 지워 기존 조건을 유지한다", async () => {
    renderShowcase("/showcase?tag=romance&sort=likes&q=missing");
    expect(await screen.findByText("불러온 2개 중 0개")).toBeTruthy();
    const results = within(screen.getByRole("tabpanel"));
    expect(results.getByText("불러온 작품에서 일치하는 제목·작가가 없습니다.")).toBeTruthy();
    expect(results.queryByText("작품 목록을 잠시 불러올 수 없어요")).toBeNull();
    fireEvent.click(results.getByRole("button", { name: "검색 지우기" }));
    expect(await screen.findByText("작품 2개")).toBeTruthy();
    expect(screen.getByTestId("showcase-route").textContent).toBe("/showcase?tag=romance&sort=likes");
  });

  it("지원하지 않는 탭은 범위를 알리고 검색어·조건을 탭 왕복과 뒤로 가기에서 복원한다", async () => {
    renderShowcase("/showcase?q=%EB%B9%9B%EB%82%98&sort=likes");
    await screen.findByText("불러온 2개 중 2개");
    fireEvent.click(screen.getByRole("tab", { name: "시리즈" }));
    expect(screen.getByRole("searchbox").getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText(/이 보기에서는 제목·작가 찾기를 제공하지 않습니다/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "전체 작품" }));
    expect(await screen.findByText("불러온 2개 중 2개")).toBeTruthy();
    expect(screen.getByRole("searchbox").getAttribute("disabled")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "테스트 다른 화면" }));
    fireEvent.click(screen.getByRole("button", { name: "테스트 뒤로" }));
    expect(await screen.findByText("불러온 2개 중 2개")).toBeTruthy();
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("빛나");
    expect(screen.getByTestId("showcase-route").textContent).toBe("/showcase?q=%EB%B9%9B%EB%82%98&sort=likes");
  });

  it("작품 목록 뒤의 접힌 참여 안내에서 협업·발행과 현재 갤러리로 연결한다", async () => {
    renderShowcase("/showcase?tag=romance");
    await screen.findByText("작품 2개");
    const gallery = screen.getByRole("region", { name: "전체 작품 둘러보기" });
    const participation = screen.getByRole("group", { name: "내 작품 소개·협업 참여" });
    expect(participation.tagName).toBe("DETAILS");
    expect((participation as HTMLDetailsElement).open).toBe(false);
    expect(gallery.contains(screen.getByRole("tablist", { name: "작품 보기" }))).toBe(true);
    expect(gallery.compareDocumentPosition(participation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const guide = within(participation);
    expect(guide.getByRole("navigation", { name: "창작 소셜 4탭 허브" })).toBeTruthy();
    const galleryLink = guide.getByRole("link", { name: /갤러리 탐색/u });
    expect(galleryLink.getAttribute("href")).toBe("/showcase?tag=romance#showcase-browse-title");
    expect(document.getElementById("showcase-browse-title")).toBeTruthy();
    expect(guide.getByRole("link", { name: /구인·의뢰 매칭/u }).getAttribute("href")).toBe("/collaborate");
    expect(guide.getByRole("link", { name: /공모·기회 보기/u }).getAttribute("href")).toBe("/opportunities");
    expect(guide.getByRole("link", { name: "발행하러 가기" }).getAttribute("href")).toBe("/studio/publish");
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
