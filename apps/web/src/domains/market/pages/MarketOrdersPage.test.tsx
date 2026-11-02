// @vitest-environment jsdom

import type { CommerceOrderPublicEntry } from "@toonstudio/core/commerce";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function buyerSession(id: string) {
  return { ready: true, status: "authenticated", data: { user: { id } } };
}

function buyerOrder(orderId: string, productName: string): CommerceOrderPublicEntry {
  return {
    orderId,
    productType: "market-resource",
    productId: `resource-${orderId}`,
    productName,
    amount: 12000,
    balanceAmount: 12000,
    currency: "KRW",
    provider: "toss",
    providerMode: "test",
    status: "DONE",
    method: "card",
    receiptUrl: `https://receipt.example.com/${orderId}`,
    approvedAt: "2026-10-20T09:00:00.000Z",
    canceledAt: null,
  };
}

function pendingOrders() {
  let resolve!: (value: { items: CommerceOrderPublicEntry[] }) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<{ items: CommerceOrderPublicEntry[] }>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function ordersPage() {
  return <MemoryRouter><MarketOrdersPage /></MemoryRouter>;
}

describe("MarketOrdersPage", () => {
  it("계정 전환 뒤 새 주문 조회가 실패해도 이전 계정 주문과 영수증을 표시하지 않는다", async () => {
    mocks.useSession.mockReturnValue(buyerSession("buyer-a"));
    mocks.listMyCommerceOrders
      .mockResolvedValueOnce({ items: [buyerOrder("order-a", "A 계정 전용 주문")] })
      .mockRejectedValueOnce(new Error("B 계정 주문 조회 실패"));
    const view = render(ordersPage());
    await screen.findByText("A 계정 전용 주문");

    mocks.useSession.mockReturnValue(buyerSession("buyer-b"));
    view.rerender(ordersPage());
    expect(screen.queryByText("A 계정 전용 주문")).toBeNull();
    await screen.findByText("B 계정 주문 조회 실패");
    expect(screen.queryByText("A 계정 전용 주문")).toBeNull();
    expect(screen.queryByRole("link", { name: /영수증/ })).toBeNull();
  });

  it("새 계정 주문이 표시된 뒤 이전 계정의 늦은 성공 응답을 무시한다", async () => {
    const previous = pendingOrders();
    mocks.useSession.mockReturnValue(buyerSession("buyer-a"));
    mocks.listMyCommerceOrders
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce({ items: [buyerOrder("order-b", "B 계정 전용 주문")] });
    const view = render(ordersPage());
    mocks.useSession.mockReturnValue(buyerSession("buyer-b"));
    view.rerender(ordersPage());
    await screen.findByText("B 계정 전용 주문");

    await act(async () => {
      previous.resolve({ items: [buyerOrder("order-a", "A 계정 전용 주문")] });
      await previous.promise;
    });
    expect(screen.getByText("B 계정 전용 주문")).toBeTruthy();
    expect(screen.queryByText("A 계정 전용 주문")).toBeNull();
    expect(screen.getByRole("link", { name: /영수증/ }).getAttribute("href")).toBe(
      "https://receipt.example.com/order-b",
    );
  });

  it("이전 계정의 늦은 실패가 새 계정 주문 화면에 오류를 덮어쓰지 않는다", async () => {
    const previous = pendingOrders();
    mocks.useSession.mockReturnValue(buyerSession("buyer-a"));
    mocks.listMyCommerceOrders
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce({ items: [buyerOrder("order-b", "B 계정 전용 주문")] });
    const view = render(ordersPage());
    mocks.useSession.mockReturnValue(buyerSession("buyer-b"));
    view.rerender(ordersPage());
    await screen.findByText("B 계정 전용 주문");

    await act(async () => {
      previous.reject(new Error("A 계정 전용 오류"));
      await Promise.resolve();
    });
    expect(screen.getByText("B 계정 전용 주문")).toBeTruthy();
    expect(screen.queryByText("A 계정 전용 오류")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

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
