// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link as RouterLink, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketCheckoutPage } from "./MarketCheckoutPage";

const api = vi.hoisted(() => ({
  session: vi.fn(),
  getQuote: vi.fn(),
  createOrder: vi.fn(),
  confirmPayment: vi.fn(),
  acquire: vi.fn(),
  detail: vi.fn(),
  reloadDetail: vi.fn(),
  resolveTarget: vi.fn(),
  getResource: vi.fn(),
  getApiErrorMessage: vi.fn(),
  loadToss: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: api.session,
}));
vi.mock("../commerce-api", () => ({
  getMarketplaceCommerceQuote: api.getQuote,
  createMarketplaceCommerceOrder: api.createOrder,
  confirmMarketplaceCommercePayment: api.confirmPayment,
}));
vi.mock("../hooks/use-market-library", () => ({
  useMarketLibrary: () => ({ acquireResource: api.acquire }),
}));
vi.mock("../hooks/use-market-resource-detail", () => ({
  useMarketResourceDetail: api.detail,
}));
vi.mock("@/platform/creator-marketplace-client", () => ({
  getCreatorMarketplaceResource: api.getResource,
  resolveCreatorMarketplaceCloudLibraryAcquisitionTarget: api.resolveTarget,
}));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: api.getApiErrorMessage }));
vi.mock("@/platform/toss-payments-sdk", () => ({
  loadTossPaymentsSdk: api.loadToss,
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));
vi.mock("../components/MarketNavHeader", () => ({
  MarketNavHeader: () => <nav aria-label="마켓 내비게이션" />,
}));

const RESOURCE_ID = "resource-123";

function record() {
  return {
    id: RESOURCE_ID,
    name: "테스트 브러시",
    kind: "brush",
    license: "toonstudio-standard",
    resourceVersion: "1.0.0",
    publisher: { name: "테스트 작가" },
  };
}

function quote(amount = 4900, overrides: Record<string, unknown> = {}) {
  return {
    resourceId: RESOURCE_ID,
    productId: "product-1",
    productType: "market-resource",
    productName: "테스트 브러시",
    operationMode: "paid",
    checkoutRequired: true,
    alreadyEntitled: false,
    amount,
    currency: "KRW",
    provider: "toss",
    providerMode: "test",
    checkoutEnabled: true,
    disabledReason: null,
    paymentMethods: ["card"],
    policyNotice: "정책 안내",
    ...overrides,
  };
}

function order(amount = 4900, provider: "toss" | "mock" = "toss") {
  return {
    orderId: "order-1",
    productType: "market-resource",
    productId: "product-1",
    productName: "테스트 브러시",
    amount,
    balanceAmount: amount,
    currency: "KRW",
    provider,
    providerMode: "test",
    status: "READY",
    method: "card",
    receiptUrl: "",
    approvedAt: null,
    canceledAt: null,
    clientKey: provider === "toss" ? "test_ck_123" : null,
    mockPaymentKey: provider === "mock" ? "mock-key-1" : null,
    paymentMethods: ["card"],
    policyNotice: "정책 안내",
  };
}

function tossFactory() {
  const widgets = {
    setAmount: vi.fn().mockResolvedValue(undefined),
    renderPaymentMethods: vi.fn().mockResolvedValue(undefined),
    renderAgreement: vi.fn().mockResolvedValue(undefined),
    requestPayment: vi.fn().mockResolvedValue(undefined),
  };
  const widgetsFactory = vi.fn().mockReturnValue(widgets);
  const factory = Object.assign(
    vi.fn().mockReturnValue({ widgets: widgetsFactory }),
    { ANONYMOUS: "anonymous-customer" },
  );
  return { factory, widgets, widgetsFactory };
}

function view(search = "") {
  return (
    <MemoryRouter initialEntries={[`/market/checkout/${RESOURCE_ID}${search}`]}>
      <Routes>
        <Route path="/market/checkout/:id" element={<MarketCheckoutPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function acceptTermsAndPrepare() {
  const checkbox = await screen.findByRole("checkbox");
  fireEvent.click(checkbox);
  const prepareButton = await screen.findByRole("button", { name: /결제 준비/ });
  fireEvent.click(prepareButton);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.session.mockReturnValue({
    data: { user: { id: "user-1" } },
    ready: true,
    status: "authenticated",
  });
  api.detail.mockReturnValue({ record: record(), loading: false, notFound: false, error: null, reload: api.reloadDetail });
  api.getQuote.mockResolvedValue(quote());
  api.getApiErrorMessage.mockImplementation(
    async (caught: unknown, fallback: string) =>
      caught instanceof Error ? caught.message : fallback,
  );
  api.resolveTarget.mockResolvedValue({
    state: "available",
    currentHead: { id: RESOURCE_ID },
    logicalPackId: "community:abc",
  });
  api.acquire.mockResolvedValue(true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

describe("MarketCheckoutPage 조회 실패 복구", () => {
  it("통신 실패와 상품 삭제를 구분하고 받은 견적을 유지한 채 같은 상품을 다시 조회한다", async () => {
    api.detail.mockReturnValue({ record: null, loading: false, notFound: false, error: "HTTP 503", reload: api.reloadDetail });
    const { rerender } = render(view());

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("지금은 리소스 정보를 불러올 수 없어요");
    expect(alert.textContent).not.toContain("링크가 만료");
    expect(screen.getByRole("link", { name: "리소스 상세로 돌아가기" }).getAttribute("href"))
      .toBe(`/market/resource/${RESOURCE_ID}`);
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(api.reloadDetail).toHaveBeenCalledTimes(1);
    expect(api.getQuote).toHaveBeenCalledTimes(1);

    api.detail.mockReturnValue({ record: record(), loading: false, notFound: false, error: null, reload: api.reloadDetail });
    rerender(view());
    expect(await screen.findByRole("checkbox")).toBeTruthy();
    expect(screen.getByText("테스트 브러시")).toBeTruthy();
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(api.confirmPayment).not.toHaveBeenCalled();
    expect(api.acquire).not.toHaveBeenCalled();
    expect(api.loadToss).not.toHaveBeenCalled();
  });

  it("상품과 견적이 모두 실패했으면 두 조회를 재시도하되 결제는 시작하지 않는다", async () => {
    api.detail.mockReturnValue({ record: null, loading: false, notFound: false, error: "오프라인", reload: api.reloadDetail });
    api.getQuote.mockRejectedValueOnce(new Error("오프라인")).mockResolvedValue(quote());
    render(view());
    await screen.findByRole("alert");

    api.detail.mockReturnValue({ record: record(), loading: false, notFound: false, error: null, reload: api.reloadDetail });
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("checkbox")).toBeTruthy();
    expect(api.reloadDetail).toHaveBeenCalledTimes(1);
    expect(api.getQuote).toHaveBeenCalledTimes(2);
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(api.confirmPayment).not.toHaveBeenCalled();
    expect(api.acquire).not.toHaveBeenCalled();
  });

  it("실제 404는 상품 없음과 탐색·위시리스트 복귀로 안내한다", async () => {
    api.detail.mockReturnValue({ record: null, loading: false, notFound: true, error: null, reload: api.reloadDetail });
    render(view());

    expect(await screen.findByText("결제할 리소스 정보를 찾을 수 없습니다.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "리소스 다시 찾기" }).getAttribute("href")).toBe("/market/browse");
    expect(screen.getByRole("link", { name: "위시리스트에서 확인" }).getAttribute("href")).toBe("/market/wishlist");
    expect(screen.queryByRole("button", { name: "다시 시도" })).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("견적만 실패하면 상품 조회를 반복하지 않고 견적만 다시 불러온다", async () => {
    api.getQuote.mockRejectedValueOnce(new Error("견적 조회 실패")).mockResolvedValue(quote());
    render(view());
    expect((await screen.findByRole("alert")).textContent).toContain("견적 조회 실패");
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByRole("checkbox")).toBeTruthy();
    expect(api.getQuote).toHaveBeenCalledTimes(2);
    expect(api.reloadDetail).not.toHaveBeenCalled();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("취소된 이전 견적 응답이 현재 견적을 덮어쓰지 않는다", async () => {
    let resolvePreviousQuote: ((value: ReturnType<typeof quote>) => void) | undefined;
    const previousQuote = new Promise<ReturnType<typeof quote>>((resolve) => { resolvePreviousQuote = resolve; });
    api.getQuote.mockReturnValueOnce(previousQuote).mockResolvedValue(quote(9900));
    const { rerender } = render(view());
    api.session.mockReturnValue({ data: { user: {} }, ready: true, status: "unauthenticated" });
    rerender(view());
    expect(await screen.findByText("₩9,900")).toBeTruthy();

    await act(async () => { resolvePreviousQuote?.(quote(4900)); });

    expect(screen.getByText("₩9,900")).toBeTruthy();
    expect(screen.queryByText("₩4,900")).toBeNull();
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("기존 결제 승인 확인 중에는 상품 조회 재시도가 추가 요청을 시작하지 않는다", async () => {
    api.detail.mockReturnValue({ record: null, loading: false, notFound: false, error: "HTTP 503", reload: api.reloadDetail });
    api.confirmPayment.mockReturnValue(new Promise(() => undefined));
    render(view("?payment=success&paymentKey=payment-1&orderId=order-1&amount=4900"));
    const retry = await screen.findByRole("button", { name: "다시 시도" });
    expect(retry.hasAttribute("disabled")).toBe(true);
    fireEvent.click(retry);

    expect(api.confirmPayment).toHaveBeenCalledTimes(1);
    expect(api.reloadDetail).not.toHaveBeenCalled();
    expect(api.getQuote).toHaveBeenCalledTimes(1);
    expect(api.createOrder).not.toHaveBeenCalled();
  });

  it("상품을 바꾼 뒤 조회에 실패해도 이전 견적·동의·준비 주문을 재사용하지 않는다", async () => {
    const nextId = "resource-456";
    let nextResourceAvailable = false;
    api.detail.mockImplementation((id: string) => ({
      record: id === RESOURCE_ID ? record() : nextResourceAvailable ? { ...record(), id: nextId, name: "다음 브러시" } : null,
      loading: false, notFound: false,
      error: id === nextId && !nextResourceAvailable ? "HTTP 503" : null,
      reload: api.reloadDetail,
    }));
    api.getQuote.mockResolvedValueOnce(quote())
      .mockRejectedValueOnce(new Error("다음 상품 견적 조회 실패"))
      .mockResolvedValueOnce(quote(9900, { resourceId: nextId, productName: "다음 브러시" }));
    api.createOrder.mockResolvedValue(order(4900, "mock"));
    render(
      <MemoryRouter initialEntries={[`/market/checkout/${RESOURCE_ID}`]}>
        <RouterLink to={`/market/checkout/${nextId}`}>다음 상품</RouterLink>
        <Routes><Route path="/market/checkout/:id" element={<MarketCheckoutPage />} /></Routes>
      </MemoryRouter>,
    );
    await acceptTermsAndPrepare();
    expect(await screen.findByRole("button", { name: "개발용 모의 결제 승인" })).toBeTruthy();

    fireEvent.click(screen.getByRole("link", { name: "다음 상품" }));
    expect((await screen.findByRole("alert")).textContent).toContain("지금은 리소스 정보를 불러올 수 없어요");
    nextResourceAvailable = true;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).toHaveProperty("checked", false);
    expect(screen.getByText("다음 브러시")).toBeTruthy();
    expect(screen.getByText("₩9,900")).toBeTruthy();
    expect(screen.queryByText("₩4,900")).toBeNull();
    expect(screen.getByRole("button", { name: /결제 준비/ }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: "개발용 모의 결제 승인" })).toBeNull();
    expect(api.getQuote.mock.calls.map(([id]) => id)).toEqual([RESOURCE_ID, nextId, nextId]);
    expect(api.reloadDetail).toHaveBeenCalledTimes(1);
    expect(api.createOrder).toHaveBeenCalledTimes(1);
    expect(api.confirmPayment).not.toHaveBeenCalled();
    expect(api.acquire).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketCheckoutPage payment guards", () => {
  it("blocks payment when the server order amount differs from the quoted amount", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue(order(9900, "toss"));

    render(view());
    await acceptTermsAndPrepare();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("다릅니다");
    expect(alert.textContent).toContain("9,900");
    expect(alert.textContent).toContain("4,900");
    // The mismatched order is discarded: no Toss SDK load, no payment window.
    expect(api.loadToss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /결제하기/ })).toBeNull();
    // The page falls back to the prepare step so the user can retry.
    expect(screen.getByRole("button", { name: /결제 준비/ })).toBeTruthy();
  });

  it("prepares Toss widgets with the server-confirmed order amount", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue(order(4900, "toss"));
    const { factory, widgets, widgetsFactory } = tossFactory();
    api.loadToss.mockResolvedValue(factory);

    render(view());
    await acceptTermsAndPrepare();

    const payButton = await screen.findByRole("button", { name: /결제하기/ });
    expect(payButton.textContent).toContain("4,900");
    expect(api.loadToss).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith("test_ck_123");
    expect(widgetsFactory).toHaveBeenCalledWith({
      customerKey: "anonymous-customer",
    });
    expect(widgets.setAmount).toHaveBeenCalledWith({
      currency: "KRW",
      value: 4900,
    });
    expect(widgets.renderPaymentMethods).toHaveBeenCalled();
    expect(widgets.renderAgreement).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not start Toss when the order has no client key", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue({ ...order(4900, "toss"), clientKey: null });

    render(view());
    await acceptTermsAndPrepare();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("클라이언트 키");
    expect(api.loadToss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /결제하기/ })).toBeNull();
  });

  it("approves a mock payment with the server order amount", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue(order(4900, "mock"));
    api.confirmPayment.mockResolvedValue({ receiptUrl: "https://receipt.example/r/1" });

    render(view());
    await acceptTermsAndPrepare();

    const approveButton = await screen.findByRole("button", {
      name: "개발용 모의 결제 승인",
    });
    fireEvent.click(approveButton);

    await waitFor(() =>
      expect(api.confirmPayment).toHaveBeenCalledWith({
        paymentKey: "mock-key-1",
        orderId: "order-1",
        amount: 4900,
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "구매 및 내 에셋 추가가 완료됐습니다",
      }),
    ).toBeTruthy();
    expect(api.acquire).toHaveBeenCalledTimes(1);
  });

  it("adds a free resource to the library without any payment step", async () => {
    api.getQuote.mockResolvedValue(
      quote(0, { checkoutRequired: false, operationMode: "free" }),
    );

    render(view());
    const freeButton = await screen.findByRole("button", {
      name: "무료로 내 에셋에 추가",
    });
    fireEvent.click(freeButton);

    expect(
      await screen.findByRole("heading", {
        name: "구매 및 내 에셋 추가가 완료됐습니다",
      }),
    ).toBeTruthy();
    expect(api.acquire).toHaveBeenCalledTimes(1);
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(api.loadToss).not.toHaveBeenCalled();
  });
});
