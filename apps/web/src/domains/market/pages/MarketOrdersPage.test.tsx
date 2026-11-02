// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketOrdersPage } from "./MarketOrdersPage";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  listMyCommerceOrders: vi.fn(),
  getCommerceConfig: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: mocks.useSession,
}));

vi.mock("../commerce-api", () => ({
  listMyCommerceOrders: mocks.listMyCommerceOrders,
  getCommerceConfig: mocks.getCommerceConfig,
}));

vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCommerceConfig.mockResolvedValue({
    operationMode: "paid",
    provider: "toss",
    providerMode: "test",
    checkoutEnabled: true,
    disabledReason: null,
    clientKey: null,
    currency: "KRW",
    paymentMethods: ["card"],
    defaultMarketPriceKrw: 4900,
    policyNotice: "유료 운영 모드 안내",
    termsVersion: "commerce-2026-09-18",
  });
});

afterEach(cleanup);

describe("MarketOrdersPage", () => {
  it("로그인 계정의 주문 원장·영수증·상태 필터를 표시한다", async () => {
    mocks.useSession.mockReturnValue({
      ready: true,
      status: "authenticated",
      data: { user: { id: "buyer-1" } },
    });
    mocks.listMyCommerceOrders.mockResolvedValue({
      items: [
        {
          orderId: "ord_1001",
          productType: "market-resource",
          productId: "res-1",
          productName: "로판 성당 3D 배경 세트",
          amount: 12000,
          balanceAmount: 12000,
          currency: "KRW",
          provider: "toss",
          providerMode: "test",
          status: "DONE",
          method: "card",
          receiptUrl: "https://receipt.example.com/ord_1001",
          approvedAt: "2026-10-20T09:00:00.000Z",
          canceledAt: null,
        },
        {
          orderId: "ord_1002",
          productType: "market-resource",
          productId: "res-2",
          productName: "액션 이펙트 브러시 팩",
          amount: 4900,
          balanceAmount: 0,
          currency: "KRW",
          provider: "toss",
          providerMode: "test",
          status: "CANCELED",
          method: "kakao_pay",
          receiptUrl: "",
          approvedAt: null,
          canceledAt: "2026-10-21T10:00:00.000Z",
        },
      ],
    });

    render(
      <MemoryRouter initialEntries={["/market/orders"]}>
        <MarketOrdersPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("로판 성당 3D 배경 세트")).toBeTruthy();
    });
    expect(screen.getByText("액션 이펙트 브러시 팩")).toBeTruthy();
    expect(screen.getByRole("link", { name: /영수증/ }).getAttribute("href")).toBe(
      "https://receipt.example.com/ord_1001",
    );

    fireEvent.click(screen.getByRole("button", { name: /취소·실패/ }));
    expect(screen.queryByText("로판 성당 3D 배경 세트")).toBeNull();
    expect(screen.getByText("액션 이펙트 브러시 팩")).toBeTruthy();
  });

  it("비로그인 사용자에게 로그인 안내를 보여주고 주문 API를 호출하지 않는다", () => {
    mocks.useSession.mockReturnValue({
      ready: true,
      status: "unauthenticated",
      data: null,
    });

    render(
      <MemoryRouter initialEntries={["/market/orders"]}>
        <MarketOrdersPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "로그인 후 주문·결제 내역을 확인할 수 있어요" }),
    ).toBeTruthy();
    expect(mocks.listMyCommerceOrders).not.toHaveBeenCalled();
  });
});
