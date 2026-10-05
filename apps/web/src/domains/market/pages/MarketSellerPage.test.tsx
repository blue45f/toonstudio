/**
 * 포인트 판매·공동구매 페이지 테스트 — 빈 상태와 진짜 상태의 구분,
 * 등록→구매→정산 기록, 공동구매 참여까지 표면이 모델에 닿는지를 검증한다.
 * 세션은 hoisted 모의 상태로 제어하고 잔액은 활동 적립으로만 채운다.
 */

// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketSellerPage } from "./MarketSellerPage";
import { createGroupBuyCampaign } from "../models/market-group-buy";
import { getMarketSaleRecords } from "../models/market-sales-ledger";
import { createSellerListing } from "../models/market-seller-listings";

import {
  awardCutsClipPublished,
  awardDailyLoginBonus,
  useAssetPointsStore,
} from "@/domains/account/public/asset-points";

const auth = vi.hoisted(() => ({
  userId: null as string | null,
  listeners: new Set<(session: { user: { id: string } } | null) => void>(),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => auth.userId,
  getAuthSession: () =>
    auth.userId ? { user: { id: auth.userId, name: "테스터" } } : null,
  listeners: auth.listeners,
}));

const appState = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/shared/lib/store", () => {
  const useApp = (selector: (state: { userId: string | null }) => unknown) =>
    selector({ userId: appState.userId });
  useApp.getState = () => ({ userId: appState.userId });
  return { useApp };
});

const requestAuthModalOpen = vi.hoisted(() => vi.fn());
vi.mock("@/domains/auth/public/session/auth-modal-intent", () => ({
  requestAuthModalOpen,
}));

const SELLER = "seller-1";
const BUYER = "buyer-1";

function signIn(userId: string | null) {
  auth.userId = userId;
  appState.userId = userId;
  const session = userId ? { user: { id: userId } } : null;
  auth.listeners.forEach((listener) => listener(session));
}

/** 활동 적립으로 잔액을 채운다. 원장이 미래 시각 이벤트를 잔액에서 제외하므로, 오늘 정오처럼 실행 시각에 따라 미래가 될 수 있는 날짜는 피하고 어제부터 과거 날짜로만 쌓는다. */
function fund(points: number): void {
  const today = new Date();
  let dayOffset = 1;
  let remaining = points;
  let salt = 0;
  while (remaining > 0) {
    const now = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOffset, 12, 0, 0, 0);
    awardDailyLoginBonus(now);
    remaining -= 10;
    for (const clip of [`page-fund-${salt}-a`, `page-fund-${salt}-b`]) {
      if (remaining <= 0) break;
      awardCutsClipPublished(clip, now);
      remaining -= 30;
    }
    salt += 1;
    dayOffset += 1;
  }
}

function seedListing(pointPrice = 100) {
  const result = createSellerListing({
    sellerId: SELLER,
    sellerName: "판매자",
    title: "페이지 테스트 브러시",
    kind: "brush",
    description: "표면 테스트용 리스팅",
    pointPrice,
  });
  if (!result.ok) throw new Error(`리스팅 생성 실패: ${result.reason}`);
  return result.listing;
}

function mount() {
  return render(
    <MemoryRouter initialEntries={["/market/seller"]}>
      <MarketSellerPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.userId = null;
  appState.userId = null;
  auth.listeners.clear();
  requestAuthModalOpen.mockClear();
  useAssetPointsStore.getState().resetForTests();
});

afterEach(() => {
  cleanup();
});

describe("MarketSellerPage", () => {
  it("게스트에게는 빈 상태를 빈 상태로 보여주고 판매 관리는 로그인으로 유도한다", () => {
    mount();
    expect(screen.getByRole("heading", { name: "포인트 판매 · 공동구매" })).toBeTruthy();
    expect(screen.getByText("아직 등록된 판매 리스팅이 없어요")).toBeTruthy();
    expect(screen.getByText(/아직 공동구매가 없어요/)).toBeTruthy();
    expect(screen.getByText("로그인하면 판매자로 등록할 수 있어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하기" }));
    expect(requestAuthModalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: "market-seller", mode: "login" }),
    );
  });

  it("판매자가 폼으로 리스팅을 등록하면 목록과 내 리스팅에 바로 나타난다", () => {
    signIn(SELLER);
    mount();
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내 첫 브러시" } });
    fireEvent.change(screen.getByLabelText("포인트 가격"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "리스팅 등록" }));
    expect(screen.getByText(/리스팅을 등록했어요/)).toBeTruthy();
    expect(screen.getAllByText("내 첫 브러시").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("내가 등록한 리스팅이에요.")).toBeTruthy();
  });

  it("구매자가 포인트로 사면 소유 중으로 바뀌고 판매 원장에 기록된다", () => {
    seedListing(100);
    signIn(BUYER);
    fund(150);
    mount();
    expect(screen.getByText("페이지 테스트 브러시")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "포인트로 구매" }));
    expect(screen.getByText(/구매했어요/)).toBeTruthy();
    expect(screen.getByText("소유 중")).toBeTruthy();
    const sales = getMarketSaleRecords();
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({ sellerId: SELLER, buyerId: BUYER, settlementPoints: 90 });
  });

  it("공동구매 카드에서 참여하면 예약 차감되고 참여 중으로 표시된다", () => {
    const listing = seedListing(100);
    const opened = createGroupBuyCampaign({
      listingId: listing.id,
      sellerId: SELLER,
      targetCount: 2,
      deadlineAt: new Date(Date.now() + 3 * 3_600_000),
    });
    if (!opened.ok) throw new Error(`캠페인 개설 실패: ${opened.reason}`);
    signIn(BUYER);
    fund(150);
    mount();
    expect(screen.getAllByText("진행 중").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: "포인트 예약하고 참여" }));
    expect(screen.getByText(/참여했어요/)).toBeTruthy();
    expect(screen.getByText(/참여 중이에요/)).toBeTruthy();
    expect(getMarketSaleRecords()).toHaveLength(0);
  });
});
