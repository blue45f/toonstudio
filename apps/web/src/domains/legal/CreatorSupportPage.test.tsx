// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CreatorSupportPage } from "./CreatorSupportPage";

const api = vi.hoisted(() => ({
  listCreatorSupportProjects: vi.fn(),
  getMyCreatorSupportApplication: vi.fn(),
  listMyCreatorSupportOffers: vi.fn(),
  submitCreatorSupportApplication: vi.fn(),
  submitCreatorSupportOffer: vi.fn(),
}));

vi.mock("./creator-support-api", async (original) => {
  const actual = await original<typeof import("./creator-support-api")>();
  return { ...actual, ...api };
});

vi.mock("@/platform/api", async (original) => {
  const actual = await original<typeof import("@/platform/api")>();
  return {
    ...actual,
    getApiErrorMessage: (_error: unknown, fallback: string) =>
      Promise.resolve(fallback),
  };
});

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => ({ status: "authenticated" }),
}));

vi.mock("@/shared/lib/i18n", async (original) => {
  const actual = await original<typeof import("@/shared/lib/i18n")>();
  return { ...actual, useT: () => (key: string) => key };
});

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

afterEach(cleanup);

beforeEach(() => {
  vi.clearAllMocks();
  api.listCreatorSupportProjects.mockResolvedValue({ items: [] });
});

describe("CreatorSupportPage 내 지원 정보", () => {
  it("조회 실패를 '신청 없음'으로 위장하지 않고 오류와 재시도를 보여준다", async () => {
    api.getMyCreatorSupportApplication.mockRejectedValue(new Error("down"));
    api.listMyCreatorSupportOffers.mockRejectedValue(new Error("down"));
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("creatorSupport.mine.loadError");
    // 실패를 빈 결과로 위장하는 문구는 없어야 한다.
    expect(screen.queryByText("creatorSupport.mine.noApplication")).toBeNull();
    expect(screen.queryByText("creatorSupport.mine.noOffers")).toBeNull();

    // 재시도가 성공하면 실제 빈 상태가 표시된다.
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    fireEvent.click(screen.getByRole("button", { name: "common.retry" }));
    await waitFor(() =>
      expect(screen.getByText("creatorSupport.mine.noApplication")).toBeTruthy(),
    );
    expect(screen.getByText("creatorSupport.mine.noOffers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("첫 화면에서 지원받기와 지원하기 두 갈래를 앵커로 나눈다", () => {
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    // useT 목은 키를 그대로 돌려주므로, 두 갈래 제목과 앵커 목적지가 조립되는지 확인한다.
    expect(screen.getByRole("heading", { name: "creatorSupport.paths.receiveTitle" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "creatorSupport.paths.giveTitle" })).toBeTruthy();
    const applyLinks = screen.getAllByRole("link", { name: "creatorSupport.hero.apply" });
    expect(applyLinks.length).toBeGreaterThanOrEqual(2);
    expect(applyLinks.every((link) => link.getAttribute("href") === "#creator-support-apply")).toBe(true);
    const browseLinks = screen.getAllByRole("link", { name: "creatorSupport.hero.browse" });
    expect(browseLinks.length).toBeGreaterThanOrEqual(2);
    expect(browseLinks.every((link) => link.getAttribute("href") === "#creator-support-projects")).toBe(true);
  });

  it("조회가 비어 있으면 실패 없이 빈 상태만 보여준다", async () => {
    api.getMyCreatorSupportApplication.mockResolvedValue({ item: null });
    api.listMyCreatorSupportOffers.mockResolvedValue({ items: [] });
    render(
      <MemoryRouter>
        <CreatorSupportPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText("creatorSupport.mine.noApplication")).toBeTruthy(),
    );
    expect(screen.getByText("creatorSupport.mine.noOffers")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
