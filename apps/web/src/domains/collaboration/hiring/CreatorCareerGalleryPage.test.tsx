// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { CreatorCareerGalleryPage } from "./CreatorCareerGalleryPage";

import type { CreatorCareerPublic } from "../../../../../../packages/contracts/src/creator-hiring";

const getMock = vi.fn();
vi.mock("@/platform/api", () => ({
  api: { get: (...args: unknown[]) => getMock(...args) },
  getApiErrorMessage: async () => "전시를 불러오지 못했어요.",
}));

const summariesMock = vi.fn(() => ({}));
vi.mock("./use-career-public-confirmations", () => ({
  useCareerPublicConfirmations: () => summariesMock(),
}));

function makeItem(id: string, role: CreatorCareerPublic["role"], title: string): CreatorCareerPublic {
  return {
    id,
    displayName: "달필",
    title,
    role,
    startMonth: "2025-01",
    endMonth: null,
    episodeFrom: 1,
    episodeTo: 12,
    scope: "본편 선화 전담",
    contribution: "전 회차 선화를 맡았어요.",
    portfolioUrl: "https://example.com/portfolio",
    coverImageUrl: null,
    proof: "self-declared",
  };
}

const items = [makeItem("c1", "lineart", "달빛 기사단"), makeItem("c2", "story", "별하늘 연대기")];

function renderGallery() {
  return render(
    <MemoryRouter>
      <CreatorCareerGalleryPage />
    </MemoryRouter>,
  );
}

function heroOf(container: HTMLElement): HTMLElement {
  const hero = container.querySelector<HTMLElement>("[data-gallery-hero]");
  if (!hero) throw new Error("히어로가 렌더링되지 않았어요.");
  return hero;
}

beforeEach(() => {
  getMock.mockReset();
  summariesMock.mockReset();
  summariesMock.mockReturnValue({});
});

afterEach(cleanup);

describe("CreatorCareerGalleryPage", () => {
  it("전시 카드에 타이포그래픽 아트·역할 칩·외부 링크(새 탭)를 보여준다", async () => {
    getMock.mockResolvedValue(items);
    renderGallery();

    expect(await screen.findByText("달빛 기사단")).toBeTruthy();
    expect(screen.getByText("별하늘 연대기")).toBeTruthy();

    const links = screen.getAllByRole("link", { name: /외부 포트폴리오 보기/ });
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(links[0]?.getAttribute("rel")).toContain("noopener");
    // 스크린 리더에도 새 탭임을 명시한다
    expect(screen.getAllByText("(새 탭에서 열림)")).toHaveLength(2);
  });

  it("커버를 등록한 항목은 실제 이미지를 쓰고, 없는 항목은 타이포그래픽 커버로 폴백한다", async () => {
    const covered = { ...makeItem("c3", "color", "파도 소나타"), coverImageUrl: "https://images.example.com/wave.png" };
    getMock.mockResolvedValue([covered, makeItem("c4", "story", "무제 노트")]);
    renderGallery();

    const img = await screen.findByRole("img", { name: "파도 소나타 대표 커버" });
    expect(img.getAttribute("src")).toBe("https://images.example.com/wave.png");
    // 커버 이미지는 등록한 항목에만 있고, 커버 없는 항목은 장식용 타이포 커버(aria-hidden)를 유지한다
    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByText("무제 노트")).toBeTruthy();
  });

  it("역할 필터로 카드를 거르고, 필터 빈 결과는 성공 빈 상태로 보여준다", async () => {
    getMock.mockResolvedValue(items);
    renderGallery();
    await screen.findByText("달빛 기사단");

    fireEvent.click(screen.getByRole("button", { name: /선화 1/ }));
    expect(screen.getByText("달빛 기사단")).toBeTruthy();
    expect(screen.queryByText("별하늘 연대기")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /전체 2/ }));
    expect(screen.getByText("별하늘 연대기")).toBeTruthy();
  });

  it("상대방 확인이 있는 항목에는 협업 기록 배지를 붙인다", async () => {
    getMock.mockResolvedValue(items);
    summariesMock.mockReturnValue({
      c1: {
        careerId: "c1",
        confirmedAt: "2026-09-01T00:00:00.000Z",
        checkedAt: "2026-10-06T00:00:00.000Z",
        expiresAt: "2027-01-01T00:00:00.000Z",
      },
    });
    renderGallery();

    expect(await screen.findByText("달빛 기사단")).toBeTruthy();
    // 배지(정확히 "상대방 확인")는 확인된 항목에만 1개
    expect(screen.getAllByText("상대방 확인", { exact: true })).toHaveLength(1);
  });

  it("제목은 '창작자 커리어 갤러리'이고, 불러오는 중에도 히어로 골격과 함께 먼저 보인다", async () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const { container } = renderGallery();

    expect(screen.getByRole("heading", { level: 1, name: "창작자 커리어 갤러리" })).toBeTruthy();
    expect(screen.queryByText("창작자 포트폴리오 링크 전시")).toBeNull();
    expect(heroOf(container)).toBeTruthy();
  });

  it("커버 보유 항목이 있으면 히어로가 그 커버를 '이번 주 표지'로 전시한다", async () => {
    const covered = { ...makeItem("c3", "color", "파도 소나타"), coverImageUrl: "https://images.example.com/wave.png" };
    getMock.mockResolvedValue([covered, makeItem("c4", "story", "무제 노트")]);
    const { container } = renderGallery();

    const hero = heroOf(container);
    expect(await within(hero).findByText("이번 주 표지")).toBeTruthy();
    // 표지 크레딧은 해당 카드로 이어지는 링크다
    const credit = within(hero).getByRole("link", { name: "파도 소나타" });
    expect(credit.getAttribute("href")).toBe("#career-card-c3");
    const heroImg = hero.querySelector("img");
    expect(heroImg?.getAttribute("src")).toBe("https://images.example.com/wave.png");
  });

  it("커버가 하나도 없으면 홍보가 아니라 아카이브 아트 히어로를 보여준다", async () => {
    getMock.mockResolvedValue(items);
    const { container } = renderGallery();
    await screen.findByText("달빛 기사단");

    const hero = heroOf(container);
    expect(within(hero).queryByText("이번 주 표지")).toBeNull();
    expect(hero.querySelector("img")?.getAttribute("src")).toBe("/images/hero-main.webp");
    expect(within(hero).getByText(/아카이브 아트를 보여 드려요/)).toBeTruthy();
  });

  it("표지 커버가 여러 장이면 시간이 지나며 다음 표지로 순환한다", async () => {
    vi.useFakeTimers();
    try {
      const first = { ...makeItem("c10", "color", "첫 표지"), coverImageUrl: "https://images.example.com/one.png" };
      const second = { ...makeItem("c11", "story", "둘째 표지"), coverImageUrl: "https://images.example.com/two.png" };
      getMock.mockResolvedValue([first, second]);
      renderGallery();
      await act(async () => {});

      const firstDot = screen.getByRole("button", { name: /1번 표지 보기/ });
      const secondDot = screen.getByRole("button", { name: /2번 표지 보기/ });
      expect(firstDot.getAttribute("aria-current")).toBe("true");
      expect(secondDot.getAttribute("aria-current")).toBeNull();

      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(secondDot.getAttribute("aria-current")).toBe("true");
      expect(firstDot.getAttribute("aria-current")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("깨진 커버 주소는 히어로와 카드 모두 깨진 이미지 대신 폴백으로 대체한다", async () => {
    const broken = { ...makeItem("c9", "color", "깨진 표지"), coverImageUrl: "https://images.example.com/broken.png" };
    getMock.mockResolvedValue([broken]);
    const { container } = renderGallery();

    // 히어로: 표지 이미지가 실패하면 아카이브 아트로 물러난다
    const hero = heroOf(container);
    await within(hero).findByText("이번 주 표지");
    const heroImg = hero.querySelector("img");
    expect(heroImg?.getAttribute("src")).toBe("https://images.example.com/broken.png");
    fireEvent.error(heroImg as HTMLImageElement);
    expect(hero.querySelector("img")?.getAttribute("src")).toBe("/images/hero-main.webp");
    expect(within(hero).queryByText("이번 주 표지")).toBeNull();

    // 카드: 깨진 이미지가 사라지고 타이포그래픽 커버가 자리를 지킨다
    const cardImg = screen.getByRole("img", { name: "깨진 표지 대표 커버" });
    fireEvent.error(cardImg);
    expect(screen.queryByRole("img", { name: "깨진 표지 대표 커버" })).toBeNull();
    expect(screen.getByText("깨진 표지")).toBeTruthy();
  });

  it("데이터가 실패해도 히어로 골격은 유지되고 홍보가 첫 화면을 대신하지 않는다", async () => {
    getMock.mockRejectedValue(new Error("network down"));
    const { container } = renderGallery();

    expect(await screen.findByText("전시를 불러오지 못했어요.")).toBeTruthy();
    // 제목·히어로는 그대로 있고, 아트 자리는 스켈레톤이 아니라 아카이브 아트다
    expect(screen.getByRole("heading", { level: 1, name: "창작자 커리어 갤러리" })).toBeTruthy();
    expect(heroOf(container).querySelector("img")?.getAttribute("src")).toBe("/images/hero-main.webp");
  });

  it("공개 항목이 없으면 성공 빈 상태를, 실패하면 재시도 가능한 오류를 보여준다", async () => {
    getMock.mockResolvedValue([]);
    const first = renderGallery();
    expect(await screen.findByText("공개된 포트폴리오가 아직 없어요.")).toBeTruthy();
    first.unmount();

    getMock.mockRejectedValue(new Error("network down"));
    renderGallery();
    expect(await screen.findByText("전시를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 불러오기/ })).toBeTruthy();
    // 실패를 빈 상태로 위장하지 않는다
    expect(screen.queryByText("공개된 포트폴리오가 아직 없어요.")).toBeNull();
  });
});
