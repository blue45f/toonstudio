// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Title } from "@/shared/lib/types";

import { TitleReaderPage } from "./TitleReaderPage";

import { useI18n } from "@/shared/lib/i18n-core";

const resource = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  notFound: false,
  data: null as unknown,
}));
vi.mock("@/platform/use-api-resource", () => ({
  useApiResource: () => ({ ...resource, reload: vi.fn() }),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => null,
}));
const appConfig = vi.hoisted(() => ({ showAvailability: true }));
vi.mock("@/platform/environment/use-app-config", () => ({ useAppConfig: () => appConfig }));
vi.mock("@/shared/components/cover-image", () => ({
  CoverImage: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const initialLanguage = useI18n.getState().lang;

function makeTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    slug: "fog-signal",
    type: "webtoon",
    title: "안개 속의 신호",
    author: "김작가",
    genres: ["미스터리"],
    tags: [],
    synopsis: "줄거리",
    cover: ["oklch(0.45 0.14 260)", "oklch(0.28 0.1 290)"],
    status: "ongoing",
    ageRating: "15",
    releaseYear: 2025,
    updateDays: ["월", "목"],
    availability: [
      { platformId: "naver-webtoon", pricing: "free", url: "https://comic.naver.com/example" },
    ],
    stats: {
      views: 1200000,
      likes: 34000,
      bookmarks: 12000,
      ratingAvg: 9.8,
      ratingCount: 4210,
      ratingDist: [1, 2, 5, 20, 72],
      rankDelta: 0,
      trendingScore: 88,
      completionRate: 86,
      bingeIndex: 92,
    },
    ...overrides,
  };
}

function renderReader(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/title/:slug/read/:episode" element={<TitleReaderPage />} />
        <Route path="/title/:slug" element={<h1>작품 상세 도착</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  window.localStorage.clear();
  appConfig.showAvailability = true;
  Object.assign(resource, {
    loading: false,
    error: null,
    notFound: false,
    data: { title: makeTitle(), episodes: [{ number: 1 }, { number: 2 }, { number: 3 }] },
  });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
});

describe("TitleReaderPage — 뷰어 셸", () => {
  it("공식 감상 안내·간결한 회차 정보·상하단 회차 동선을 그린다", () => {
    renderReader("/title/fog-signal/read/2");
    expect(within(screen.getByRole("region", { name: "회차 정보" })).getByText("2화")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "공식 플랫폼에서 작품을 감상하세요" })).toBeTruthy();
    // 플랫폼 딥링크가 1차 동선이다
    const platform = screen.getByRole("link", { name: /에서 읽기/ });
    expect(platform.getAttribute("href")).toBe("/api/go/naver-webtoon?to=https%3A%2F%2Fcomic.naver.com%2Fexample");
    // 상단 닫기 → 작품 상세, 하단 목록 → 상세의 회차 앵커
    expect(screen.getByRole("link", { name: "작품 상세로 나가기" }).getAttribute("href")).toBe(
      "/title/fog-signal",
    );
    expect(screen.getByRole("link", { name: "회차 목록" }).getAttribute("href")).toBe(
      "/title/fog-signal#episodes",
    );
    // 이전/다음 회차 (하단 바 — 끝 카드의 "다음 화 N화"와 구분해 정확히 일치로 찾는다)
    expect(screen.getByRole("link", { name: "이전 화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/1",
    );
    expect(screen.getByRole("link", { name: "다음 화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/3",
    );
    // 원고가 없으므로 진도는 만들지 않고 후속 동선은 보존한다.
    expect(screen.queryByRole("progressbar", { name: "읽기 진도" })).toBeNull();
    expect(screen.getByTestId("reader-rea-finish-bridge")).toBeTruthy();
  });

  it("1화에서는 이전 화가 비활성이다", () => {
    renderReader("/title/fog-signal/read/1");
    expect(screen.queryByRole("link", { name: "이전 화" })).toBeNull();
    expect(screen.getByRole("link", { name: "다음 화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/2",
    );
  });

  it("Esc를 누르면 작품 상세로 나간다", () => {
    renderReader("/title/fog-signal/read/2");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "작품 상세 도착" })).toBeTruthy();
  });

  it("기존 기록이 있어도 원고 없는 안내에 이어보기 배너를 띄우지 않는다", () => {
    window.localStorage.setItem(
      "toonstudio.reader-progress.v1.guest",
      JSON.stringify({ "fog-signal": { episode: 2, ratio: 0.5, updatedAt: Date.now() } }),
    );
    renderReader("/title/fog-signal/read/2");
    expect(screen.queryByText("이전에 50%까지 읽었어요")).toBeNull();
    expect(screen.queryByRole("button", { name: "처음부터" })).toBeNull();
  });

  it("원고 없는 페이지를 떠나도 새 읽기 기록을 만들지 않는다", () => {
    const { unmount } = renderReader("/title/fog-signal/read/3");
    unmount();
    expect(window.localStorage.getItem("toonstudio.reader-progress.v1.guest")).toBeNull();
  });

  it("보기 설정 패널에서 배경 톤과 원고 폭을 바꾸고 로컬에 유지한다", () => {
    renderReader("/title/fog-signal/read/2");
    fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
    expect(screen.getByRole("region", { name: "뷰어 환경 설정" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "세피아" }));
    fireEvent.click(screen.getByRole("button", { name: "넓게 900px" }));
    const saved = JSON.parse(
      window.localStorage.getItem("toonstudio.reader-comfort.v1") ?? "{}",
    ) as { theme?: string; width?: string };
    expect(saved.theme).toBe("sepia");
    expect(saved.width).toBe("wide");
  });

  it("회차 빠른 이동 서랍을 열어 원하는 회차 링크를 바로 볼 수 있다", () => {
    renderReader("/title/fog-signal/read/2");
    fireEvent.click(screen.getByRole("button", { name: "회차 빠른 이동" }));
    const drawer = screen.getByRole("region", { name: "회차 빠른 이동 목록" });
    expect(within(drawer).getByRole("link", { name: "1화" }).getAttribute("href")).toBe(
      "/title/fog-signal/read/1",
    );
    expect(within(drawer).getByRole("link", { name: "2화" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});

describe("TitleReaderPage — 상태 구분", () => {
  it.each([undefined, 120])("총 회차=%s만으로 회차·다음 화·빠른 이동을 만들지 않는다", (totalEpisodes) => {
    resource.data = { title: makeTitle({ totalEpisodes }) };
    renderReader("/title/fog-signal/read/2");
    expect(screen.getByRole("link", { name: /에서 읽기.*새 탭/u }).getAttribute("href")).toBe("/api/go/naver-webtoon?to=https%3A%2F%2Fcomic.naver.com%2Fexample");
    expect(screen.queryByRole("button", { name: "회차 빠른 이동" })).toBeNull();
    expect(screen.queryByRole("link", { name: "이전 화" })).toBeNull();
    expect(screen.queryByRole("link", { name: "다음 화" })).toBeNull();
    expect(screen.queryByText(/마지막 회차예요/u)).toBeNull();
    fireEvent.keyDown(window, { key: "]" });
    expect(within(screen.getByRole("region", { name: "회차 정보" })).getByText("공식 감상 안내")).toBeTruthy();
  });

  it("공개가 확인된 번호만 이동하며 예약 회차와 비어 있는 번호를 건너뛴다", () => {
    resource.data = { title: makeTitle(), episodes: [{ number: 1 }, { number: 4 }, { number: 6, status: "scheduled" }, { number: 8 }] };
    renderReader("/title/fog-signal/read/4");
    expect(screen.getByRole("link", { name: "이전 화" }).getAttribute("href")).toBe("/title/fog-signal/read/1");
    expect(screen.getByRole("link", { name: "다음 화" }).getAttribute("href")).toBe("/title/fog-signal/read/8");
    fireEvent.click(screen.getByRole("button", { name: "회차 빠른 이동" }));
    const drawer = screen.getByRole("region", { name: "회차 빠른 이동 목록" });
    expect(within(drawer).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/title/fog-signal#episodes", "/title/fog-signal/read/1", "/title/fog-signal/read/4", "/title/fog-signal/read/8",
    ]);
  });

  it("미확인 안내 주소를 열고 나가도 수동으로 남긴 읽기 기록을 바꾸지 않는다", () => {
    const key = "toonstudio.reader-progress.v1.guest";
    const original = JSON.stringify({ "fog-signal": { episode: 7, ratio: 1, updatedAt: Date.now() } });
    window.localStorage.setItem(key, original);
    resource.data = { title: makeTitle() };
    const view = renderReader("/title/fog-signal/read/2");
    expect(within(screen.getByRole("region", { name: "회차 정보" })).getByText("공식 감상 안내")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "다음 화" })).toBeNull();
    fireEvent.scroll(window);
    fireEvent.keyDown(window, { key: "Escape" });
    view.unmount();
    expect(window.localStorage.getItem(key)).toBe(original);
  });

  it("플랫폼 노출 킬스위치와 URL 검증을 직접 방문한 안내에도 적용한다", () => {
    appConfig.showAvailability = false;
    renderReader("/title/fog-signal/read/2");
    expect(screen.queryByRole("link", { name: /에서 읽기/u })).toBeNull();
    expect(screen.getByRole("link", { name: "작품 상세로" }).getAttribute("href")).toBe("/title/fog-signal");
    cleanup();
    appConfig.showAvailability = true;
    resource.data = { title: makeTitle({ availability: [{ platformId: "naver-webtoon", pricing: "free", url: "javascript:alert(1)" }] }) };
    renderReader("/title/fog-signal/read/2");
    expect(screen.queryByRole("link", { name: /에서 읽기/u })).toBeNull();
  });

  it("로딩 중에는 리더 캔버스 위에 스켈레톤을 보여준다", () => {
    Object.assign(resource, { loading: true, data: null });
    renderReader("/title/fog-signal/read/1");
    expect(screen.getByRole("status", { name: "불러오는 중" })).toBeTruthy();
  });

  it("작품이 없으면 작품 없음 화면으로 구분한다", () => {
    Object.assign(resource, { notFound: true, data: null });
    renderReader("/title/missing/read/1");
    expect(screen.getByText("이 주소의 작품을 찾지 못했어요")).toBeTruthy();
  });

  it("조회 오류는 빈 상태와 구분해 재시도를 제공한다", () => {
    Object.assign(resource, { error: "네트워크 오류", data: null });
    renderReader("/title/fog-signal/read/1");
    expect(screen.getByText("작품을 불러오지 못했습니다")).toBeTruthy();
    // ErrorState의 재시도 버튼 (라벨은 셸 사전이 주입하므로 존재 자체로 확인)
    expect(within(screen.getByRole("alert")).getByRole("button")).toBeTruthy();
  });

  it("회차 번호가 숫자가 아니면 없는 회차로 안내한다", () => {
    renderReader("/title/fog-signal/read/abc");
    expect(screen.getByRole("heading", { name: "없는 회차예요" })).toBeTruthy();
  });

  it("총 회차 수를 알면 그보다 큰 회차는 없는 회차로 안내하고 마지막 화 동선을 준다", () => {
    Object.assign(resource, {
      data: {
        title: makeTitle(),
        episodes: [
          { number: 1, title: "하나" },
          { number: 2, title: "둘" },
        ],
      },
    });
    renderReader("/title/fog-signal/read/9");
    expect(screen.getByRole("heading", { name: "없는 회차예요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /마지막 화/ }).getAttribute("href")).toBe(
      "/title/fog-signal/read/2",
    );
  });

  it("공개 예정 회차는 공개 전으로 안내한다", () => {
    Object.assign(resource, {
      data: {
        title: makeTitle(),
        episodes: [{ number: 5, status: "scheduled" }],
      },
    });
    renderReader("/title/fog-signal/read/5");
    expect(screen.getByRole("heading", { name: "5화는 아직 공개 전이에요" })).toBeTruthy();
    expect(screen.queryByText(/이 주소에서 바로 읽을 수/u)).toBeNull();
  });
});


describe("TitleReaderPage — 원고 없는 화면의 정직한 상태", () => {
  it("진도율·저장 성공·자동 스크롤을 실제 읽기처럼 표시하지 않는다", () => {
    renderReader("/title/fog-signal/read/2");
    expect(screen.queryByRole("progressbar", { name: "읽기 진도" })).toBeNull();
    expect(screen.queryByText("읽던 위치 저장됨")).toBeNull();
    expect(screen.queryByRole("button", { name: "자동 스크롤" })).toBeNull();
  });

  it("기존 읽기 기록을 열람·스크롤·종료로 덮어쓰지 않는다", async () => {
    const key = "toonstudio.reader-progress.v1.guest";
    const original = JSON.stringify({ "fog-signal": { episode: 7, ratio: 0.5, updatedAt: 1234 } });
    window.localStorage.setItem(key, original);
    const view = renderReader("/title/fog-signal/read/2");
    fireEvent.scroll(window);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
    view.unmount();
    expect(window.localStorage.getItem(key)).toBe(original);
  });

  it("저장소 쓰기가 실패해도 저장 성공 안내를 만들지 않는다", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      renderReader("/title/fog-signal/read/2");
      fireEvent.scroll(window);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 650)); });
      expect(screen.queryByText("읽던 위치 저장됨")).toBeNull();
      expect(write).not.toHaveBeenCalled();
    } finally { cleanup(); write.mockRestore(); }
  });

  it("리뷰 동선을 실제 상세 리뷰 앵커에 연결하고 후속 링크를 기본 접는다", () => {
    renderReader("/title/fog-signal/read/2");
    const bridge = screen.getByTestId("reader-rea-finish-bridge");
    expect(bridge.tagName).toBe("DETAILS");
    expect(bridge.hasAttribute("open")).toBe(false);
    const review = bridge.querySelector('a[href$="#title-reviews"]');
    expect(review).not.toBeNull();
    expect(bridge.querySelectorAll("a")).toHaveLength(5);
  });
});

it("리뷰 링크는 상세의 title-reviews 앵커를 사용한다", () => {
  renderReader("/title/fog-signal/read/2");
  const bridge = screen.getByTestId("reader-rea-finish-bridge");
  expect(bridge.querySelector('a[href$="#title-reviews"]')).not.toBeNull();
  expect(bridge.querySelector('a[href$="#reviews"]')).toBeNull();
});

it("후속 동선을 반복해서 열어도 읽기 메뉴를 숨기거나 기록하지 않는다", () => {
  renderReader("/title/fog-signal/read/2");
  const details = screen.getByTestId("reader-rea-finish-bridge");
  const summary = details.querySelector("summary");
  if (!summary) throw new Error("후속 동선 summary 누락");
  for (let i = 0; i < 3; i += 1) {
    fireEvent.pointerDown(summary);
    fireEvent.click(summary);
    expect(screen.getByRole("banner").className).toContain("opacity-100");
  }
  expect(window.localStorage.getItem("toonstudio.reader-progress.v1.guest")).toBeNull();
  expect(details.querySelectorAll("a")).toHaveLength(5);
});

it("원고 없는 안내에서는 보기 설정을 열어 둔 메뉴가 시간 경과로 사라지지 않는다", () => {
  vi.useFakeTimers();
  try {
    renderReader("/title/fog-signal/read/2");
    fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(screen.getByRole("banner").className).toContain("opacity-100");
    expect(screen.getByRole("region", { name: "뷰어 환경 설정" })).toBeTruthy();
  } finally { cleanup(); vi.useRealTimers(); }
});

describe("TitleReaderPage — 페이지 소유 터치 크기 계약 (실측 아님)", () => {
  it("보기 설정·톤·폭 버튼에 44px 논리 최소크기를 명시한다", () => {
    renderReader("/title/fog-signal/read/2");
    const settings = screen.getByRole("button", { name: "보기 설정" });
    expect(settings.classList.contains("size-11")).toBe(true);
    fireEvent.click(settings);
    for (const button of within(screen.getByRole("region", { name: "뷰어 환경 설정" })).getAllByRole("button")) {
      expect(button.classList.contains("[min-block-size:2.75rem]!")).toBe(true);
      expect(button.classList.contains("[min-inline-size:2.75rem]!")).toBe(true);
    }
  });

  it("회차 선택·서랍·아이콘 전용 이전/다음에 44px 크기 의도를 둔다", () => {
    renderReader("/title/fog-signal/read/2");
    const toggle = screen.getByRole("button", { name: "회차 빠른 이동" });
    expect(toggle.classList.contains("[min-block-size:2.75rem]!")).toBe(true);
    for (const name of ["이전 화", "다음 화"]) {
      expect(screen.getByRole("link", { name }).classList.contains("min-w-11")).toBe(true);
    }
    fireEvent.click(toggle);
    for (const link of within(screen.getByRole("region", { name: "회차 빠른 이동 목록" })).getAllByRole("link")) {
      expect(link.classList.contains("min-h-11")).toBe(true);
      if (link.getAttribute("href")?.includes("/read/")) {
        expect(link.classList.contains("min-w-11")).toBe(true);
      }
    }
  });

  it("닫힌 후속 동선을 계속 접고 펼친 리뷰 액션에만 44px 최소높이를 둔다", () => {
    renderReader("/title/fog-signal/read/2");
    const bridge = screen.getByTestId("reader-rea-finish-bridge");
    expect(bridge.hasAttribute("open")).toBe(false);
    bridge.setAttribute("open", "");
    const review = within(bridge).getByRole("link", { name: "작품 리뷰 남기기 →" });
    expect(review.classList.contains("inline-flex")).toBe(true);
    expect(review.classList.contains("min-h-11")).toBe(true);
  });

  it("공유 ErrorState 재시도에는 이 페이지 호출부의 직계 버튼 크기만 적용한다", () => {
    Object.assign(resource, { error: "네트워크 오류", data: null });
    renderReader("/title/fog-signal/read/1");
    const alert = screen.getByRole("alert");
    expect(alert.classList.contains("[&>button]:[min-block-size:2.75rem]!")).toBe(true);
    expect(within(alert).getByRole("button").parentElement).toBe(alert);
  });
});

describe("TitleReaderPage — 숨긴 메뉴와 Escape 초점", () => {
  it.each(["보기 설정", "회차 빠른 이동"])("%s에 있던 초점을 M 숨김에서 root로 옮기고 복원한다", (name) => {
    const { container } = renderReader("/title/fog-signal/read/2");
    const toggle = screen.getByRole("button", { name });
    const root = container.querySelector("[data-reader-theme]");
    for (let i = 0; i < 3; i += 1) {
      toggle.focus();
      fireEvent.keyDown(toggle, { key: "m" });
      expect(document.activeElement).toBe(root);
      for (const chrome of container.querySelectorAll("header,footer")) {
        expect(chrome.hasAttribute("inert")).toBe(true);
        expect(chrome.getAttribute("aria-hidden")).toBe("true");
      }
      fireEvent.keyDown(document.activeElement ?? window, { key: "m" });
      expect(document.activeElement).toBe(toggle);
      for (const chrome of container.querySelectorAll("header,footer")) {
        expect(chrome.hasAttribute("inert")).toBe(false);
        expect(chrome.getAttribute("aria-hidden")).toBe("false");
      }
    }
  });

  it("설정을 열고 M을 반복해도 선택하던 칩 초점을 복원한다", () => {
    renderReader("/title/fog-signal/read/2");
    fireEvent.click(screen.getByRole("button", { name: "보기 설정" }));
    const chip = screen.getByRole("button", { name: "세피아" });
    chip.focus();
    fireEvent.keyDown(chip, { key: "M" });
    fireEvent.keyDown(document.activeElement ?? window, { key: "M" });
    expect(document.activeElement).toBe(chip);
    expect(screen.getByRole("region", { name: "뷰어 환경 설정" })).toBeTruthy();
  });

  it.each([
    ["보기 설정", "뷰어 환경 설정", "세피아"],
    ["회차 빠른 이동", "회차 빠른 이동 목록", null],
  ])("%s를 연 Escape는 패널만 닫고 토글로 복귀하며 다음 Escape만 상세로 간다", (toggleName, regionName, chipName) => {
    renderReader("/title/fog-signal/read/2");
    const toggle = screen.getByRole("button", { name: toggleName });
    fireEvent.click(toggle);
    const panel = screen.getByRole("region", { name: regionName });
    const child = chipName ? within(panel).getByRole("button", { name: chipName }) : within(panel).getByRole("link", { name: "2화" });
    child.focus();
    fireEvent.keyDown(child, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "작품 상세 도착" })).toBeNull();
    expect(screen.queryByRole("region", { name: regionName })).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.keyDown(toggle, { key: "Escape" });
    expect(screen.getByRole("heading", { name: "작품 상세 도착" })).toBeTruthy();
  });

  it("패널을 연 채 M으로 숨긴 뒤 Escape해도 메뉴를 복원하고 토글에 초점을 둔다", () => {
    renderReader("/title/fog-signal/read/2");
    const toggle = screen.getByRole("button", { name: "보기 설정" });
    fireEvent.click(toggle);
    const chip = screen.getByRole("button", { name: "세피아" });
    chip.focus();
    fireEvent.keyDown(chip, { key: "m" });
    fireEvent.keyDown(document.activeElement ?? window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "작품 상세 도착" })).toBeNull();
    expect(screen.queryByRole("region", { name: "뷰어 환경 설정" })).toBeNull();
    expect(document.activeElement).toBe(toggle);
    expect(screen.getByRole("banner").hasAttribute("inert")).toBe(false);
  });

  it("본문을 눌러 숨긴 경우도 메뉴 초점을 밖으로 옮기고 M으로 복원한다", () => {
    renderReader("/title/fog-signal/read/2");
    const toggle = screen.getByRole("button", { name: "보기 설정" });
    toggle.focus();
    fireEvent.pointerDown(screen.getByRole("heading", { name: "공식 플랫폼에서 작품을 감상하세요" }));
    expect(document.activeElement).not.toBe(toggle);
    fireEvent.keyDown(document.activeElement ?? window, { key: "m" });
    expect(document.activeElement).toBe(toggle);
  });

  it("본문 링크에 둔 초점은 메뉴 숨김과 복원으로 빼앗지 않는다", () => {
    renderReader("/title/fog-signal/read/2");
    const link = screen.getByRole("link", { name: /에서 읽기/ });
    link.focus();
    fireEvent.keyDown(link, { key: "m" });
    expect(document.activeElement).toBe(link);
    fireEvent.keyDown(link, { key: "m" });
    expect(document.activeElement).toBe(link);
  });
});

it("모바일 footer와 본문 여백은 기존 셸의 하단 안전 기준선을 사용하고 z-index를 올리지 않는다 (실측 아님)", () => {
  const { container } = renderReader("/title/fog-signal/read/2");
  const footer = screen.getByRole("contentinfo");
  expect(footer.classList.contains("max-md:bottom-[var(--site-float-base)]")).toBe(true);
  expect(footer.classList.contains("bottom-0")).toBe(true);
  expect(footer.classList.contains("z-40")).toBe(true);
  expect(container.querySelector('[class*="max-md:pb-[calc(9rem+var(--site-float-base))]"]')).not.toBeNull();
});


describe("리더 시안의 공식 감상 동선", () => {
  it("공식 감상 링크와 상세 링크를 중심에 모으고 원고 제공을 예고하지 않는다", () => {
    renderReader("/title/fog-signal/read/2");
    const content = screen.getByRole("region", { name: "회차 내용" });
    const links = within(content).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toBe("/api/go/naver-webtoon?to=https%3A%2F%2Fcomic.naver.com%2Fexample");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
    expect(links[1].getAttribute("href")).toBe("/title/fog-signal");
    expect(content.textContent).not.toContain("연결되면");
    expect(content.textContent).toContain("읽기 진도를 기록하지 않아요");
    expect(screen.getAllByRole("link", { name: /^다음 화$/ })).toHaveLength(1);
  });

  it("공식 URL이 없으면 링크를 지어내지 않고 작품 상세로 안내한다", () => {
    resource.data = { title: makeTitle({ availability: [{ platformId: "naver-webtoon", pricing: "free" }] }) };
    renderReader("/title/fog-signal/read/2");
    const content = screen.getByRole("region", { name: "회차 내용" });
    expect(within(content).getByRole("heading", { name: "공식 감상 경로를 확인해 주세요" })).toBeTruthy();
    expect(within(content).getAllByRole("link")).toHaveLength(1);
    expect(within(content).getByRole("link").getAttribute("href")).toBe("/title/fog-signal");
  });

  it("영문에서도 같은 공식 감상 경로와 진도 미기록 안내를 보존한다", () => {
    useI18n.setState({ lang: "en" });
    renderReader("/title/fog-signal/read/2");
    expect(screen.getByRole("heading", { name: "Read this title on its official platform" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Read on/ }).getAttribute("href")).toBe("/api/go/naver-webtoon?to=https%3A%2F%2Fcomic.naver.com%2Fexample");
    expect(screen.getByText("Reading progress is not recorded because panels are not provided.")).toBeTruthy();
  });

  it("읽기 동선을 유지하며 부가 활동 3개를 한·영 접이식 메뉴로 제공한다", () => {
    renderReader("/title/fog-signal/read/2");
    const bar = screen.getByTestId("reader-spatial-creation-bar");
    const summary = within(bar).getByText("창작·뷰어 체험", { selector: "summary" });
    expect(bar.tagName).toBe("DETAILS");
    expect(bar.hasAttribute("open")).toBe(false);
    // jsdom의 가시성 계산 대신 native 접힘 상태와 부가 링크의 소속을 검사한다.
    expect(within(bar).getAllByRole("link").every((link) => link.closest("details") === bar)).toBe(true);
    expect(screen.getByRole("link", { name: "다음 화" }).getAttribute("href")).toBe("/title/fog-signal/read/3");
    expect(screen.getByRole("link", { name: /에서 읽기/ }).closest("details")).toBeNull();

    fireEvent.click(summary);
    expect(bar.hasAttribute("open")).toBe(true);
    expect(within(bar).getAllByRole("link")).toHaveLength(3);
    expect(within(bar).getByRole("link", { name: "공간 뷰어 체험" }).getAttribute("href")).toBe("/read/spatial");
    expect(within(bar).getByRole("link", { name: "3컷 이야기 만들기" }).getAttribute("href")).toBe("/create");
    expect(within(bar).getByRole("link", { name: "사용법 둘러보기" }).getAttribute("href")).toBe("/product-tour");
    expect(within(bar).getAllByRole("link").every((link) => link.className.includes("min-h-11"))).toBe(true);

    fireEvent.click(summary);
    expect(bar.hasAttribute("open")).toBe(false);

    cleanup();
    useI18n.setState({ lang: "en" });
    renderReader("/title/fog-signal/read/2");
    const enBar = screen.getByTestId("reader-spatial-creation-bar");
    expect(enBar.textContent).not.toMatch(/[가-힣]/u);
    expect(enBar.hasAttribute("open")).toBe(false);
    fireEvent.click(within(enBar).getByText("Create or try the viewer", { selector: "summary" }));
    expect(within(enBar).getByRole("link", { name: "Try the spatial viewer" }).getAttribute("href")).toBe("/read/spatial");
    expect(within(enBar).getByRole("link", { name: "Create a 3-panel story" }).getAttribute("href")).toBe("/create");
    expect(within(enBar).getByRole("link", { name: "Take a product tour" }).getAttribute("href")).toBe("/product-tour");
  });
});
