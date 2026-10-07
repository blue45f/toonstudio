// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CreatorEarlyAccessPage } from "./CreatorEarlyAccessPage";

const sessionMock = vi.hoisted(() => ({
  current: {
    data: null as { user: { id: string } } | null,
    ready: false,
    status: "loading",
  },
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: () => sessionMock.current,
}));

vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen: vi.fn(),
}));

vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
  getLang: () => "ko",
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
}));

const policiesMock = vi.hoisted(() => ({
  current: [] as readonly {
    id: string;
    creatorId: string;
    titleId: string;
    titleName: string;
    enabled: boolean;
    earlyAccessDays: number;
    createdAt: string;
    updatedAt: string;
  }[],
}));

vi.mock("../models/paywall-store", () => ({
  listEarlyAccessPolicies: () => policiesMock.current,
  getEarlyAccessPolicy: (_creatorId: string, titleId: string) =>
    policiesMock.current.find((policy) => policy.titleId === titleId) ?? null,
  subscribePaywallStore: () => () => {},
  upsertEarlyAccessPolicy: vi.fn(),
  deleteEarlyAccessPolicy: vi.fn(),
}));

describe("CreatorEarlyAccessPage", () => {
  it("세션을 확인하는 동안은 텍스트가 아니라 공용 로딩 상태를 보여준다", () => {
    sessionMock.current = { data: null, ready: false, status: "loading" };

    render(<CreatorEarlyAccessPage />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.getAttribute("aria-label")).toBe("paywall.creatorPage.loading");
  });

  it("로그인하지 않았으면 로그인 안내와 버튼을 보여준다", () => {
    sessionMock.current = { data: null, ready: true, status: "unauthenticated" };

    render(<CreatorEarlyAccessPage />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("paywall.creatorPage.title");
    expect(screen.getByRole("button", { name: "paywall.creatorPage.login" })).toBeTruthy();
  });

  it("로그인했고 정책이 없으면 폼과 빈 상태를 함께 보여준다", () => {
    sessionMock.current = {
      data: { user: { id: "creator-1" } },
      ready: true,
      status: "authenticated",
    };
    policiesMock.current = [];

    render(<CreatorEarlyAccessPage />);

    expect(screen.getByLabelText("paywall.creatorPage.titleNameLabel")).toBeTruthy();
    expect(screen.getByText("paywall.creatorPage.emptyTitle")).toBeTruthy();
    expect(screen.queryByText(/paywall\.creatorPage\.statusSummary/)).toBeNull();
  });

  it("정책이 있으면 첫 화면 상태 줄에 정책 수·활성 수·기간 범위를 보여 준다", () => {
    sessionMock.current = {
      data: { user: { id: "creator-1" } },
      ready: true,
      status: "authenticated",
    };
    policiesMock.current = [
      { id: "p1", creatorId: "creator-1", titleId: "work-a", titleName: "작품 A", enabled: true, earlyAccessDays: 7, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "p2", creatorId: "creator-1", titleId: "work-b", titleName: "작품 B", enabled: false, earlyAccessDays: 14, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
    ];

    render(<CreatorEarlyAccessPage />);

    // useT 목은 키를 그대로 돌려주므로, 상태 줄이 올바른 키 조합으로 조립되는지 확인한다.
    expect(screen.getByText(/paywall\.creatorPage\.statusSummary/)).toBeTruthy();
    expect(screen.getByText(/paywall\.creatorPage\.statusDaysRange/)).toBeTruthy();
    expect(screen.queryByText(/paywall\.creatorPage\.statusDaysSingle/)).toBeNull();
  });
});
