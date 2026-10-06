// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
