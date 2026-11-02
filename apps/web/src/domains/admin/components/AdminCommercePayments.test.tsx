// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminCommercePayments } from "./AdminCommercePayments";
import "../admin-i18n-loader";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

const api = vi.hoisted(
  () =>
    vi.fn<
      (path: string, uid: string, options?: RequestInit) => Promise<unknown>
    >(),
);
const listMarketplace = vi.hoisted(() => vi.fn());
vi.mock("./admin-client", async (original) => ({
  ...(await original<typeof import("./admin-client")>()),
  adminFetch: api,
}));
vi.mock("@/platform/creator-marketplace-client", () => ({
  listCreatorMarketplaceResources: listMarketplace,
}));

const commerceSettings = {
  operationMode: "free",
  provider: "mock",
  defaultMarketPriceKrw: 0,
  paymentMethods: [],
  freePolicyNotice: "",
  paidPolicyNotice: "",
  termsVersion: "v1",
  providerMode: null,
  checkoutEnabled: false,
  disabledReason: null,
};

beforeEach(() => {
  api.mockReset();
  listMarketplace.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminCommercePayments 상태 표면 정합", () => {
  it("로드 실패를 빈 결제 내역으로 위장하지 않고 재시도를 제공한다", async () => {
    api.mockRejectedValue(new Error("결제 정보를 불러오지 못했습니다."));
    render(<AdminCommercePayments uid="admin" />);
    expect(
      await screen.findByText("결제 내역을 불러오지 못했습니다. 잠시 후 다시 시도하세요."),
    ).toBeTruthy();
    expect(screen.queryByText("마켓 결제 내역이 없습니다.")).toBeNull();
    // 실패 화면에서 로딩 스피너가 계속 돌면 안 된다.
    expect(screen.queryByRole("status", { name: "불러오는 중" })).toBeNull();
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1);
  });

  it("로드 성공 후 빈 주문일 때만 빈 내역을 표시하고 제목은 h2다", async () => {
    api.mockImplementation((path) =>
      path.endsWith("/orders")
        ? Promise.resolve({ items: [] })
        : Promise.resolve(commerceSettings),
    );
    render(<AdminCommercePayments uid="admin" />);
    expect(await screen.findByText("마켓 결제 내역이 없습니다.")).toBeTruthy();
    // 페이지 h1은 셸이 소유한다 — 임베드된 자손은 h1을 만들지 않는다.
    expect(
      screen.getByRole("heading", { level: 2, name: "사이트 무료/유료 운영" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });

  it("패키지 검색기로 공개 마켓 리소스를 찾아 UUID를 수동 복사 없이 채운다", async () => {
    const sample = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
    api.mockImplementation((path) =>
      path.endsWith("/orders")
        ? Promise.resolve({ items: [] })
        : Promise.resolve(commerceSettings),
    );
    listMarketplace.mockResolvedValue({
      items: [sample],
      nextCursor: null,
      hasMore: false,
      limit: 8,
    });

    render(<AdminCommercePayments uid="admin" />);
    await screen.findByText("마켓 결제 내역이 없습니다.");
    expect(listMarketplace).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole("searchbox", { name: "마켓 패키지 검색" }), {
      target: { value: sample.name },
    });
    fireEvent.click(screen.getByRole("button", { name: "패키지 검색" }));

    await waitFor(() =>
      expect(listMarketplace).toHaveBeenCalledWith({ search: sample.name, limit: 8 }),
    );
    const resultBtn = await screen.findByRole("button", { name: new RegExp(sample.packageId, "u") });
    fireEvent.click(resultBtn);

    expect(screen.getByDisplayValue(sample.id)).toBeTruthy();
    expect(screen.getByText(/선택된 패키지:/u)).toBeTruthy();
  });
});
