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
    expect(screen.getByRole("heading", { name: "판매자 센터" })).toBeTruthy();
    // 판매자 센터 링크는 마켓 내비와 센터 탭 양쪽에 있지만 도착지는 하나로 같다.
    const centerLinks = screen.getAllByRole("link", { name: "판매자 센터" });
    expect(centerLinks.length).toBeGreaterThanOrEqual(2);
    for (const link of centerLinks) expect(link.getAttribute("href")).toBe("/market/seller");
    expect(centerLinks.some((link) => link.getAttribute("aria-current") === "page")).toBeTruthy();
    expect(screen.getByRole("link", { name: "에셋 등록" }).getAttribute("href")).toBe("/market/publish");
    expect(screen.getByRole("link", { name: "패키지 관리" }).getAttribute("href")).toBe("/market/manage");
    expect(screen.getByText("아직 등록된 판매 리스팅이 없어요")).toBeTruthy();
    expect(screen.getByText(/아직 공동구매가 없어요/)).toBeTruthy();
    expect(screen.getByText("로그인하면 판매자로 등록할 수 있어요")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "로그인하기" }));
    expect(requestAuthModalOpen).toHaveBeenCalledWith(
      expect.objectContaining({ source: "market-seller", mode: "login" }),
    );
  });

  it("판매자가 단계형 마법사로 리스팅을 등록하면 목록과 내 리스팅에 바로 나타난다", () => {
    signIn(SELLER);
    mount();
    // 1단계(기본 정보) → 2단계(설명·가격) → 3단계(확인·등록)
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "내 첫 브러시" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("포인트 가격"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("확인·등록");
    fireEvent.click(screen.getByRole("button", { name: "리스팅 등록" }));
    expect(screen.getByText(/리스팅을 등록했어요/)).toBeTruthy();
    expect(screen.getAllByText("내 첫 브러시").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("내가 등록한 리스팅이에요.")).toBeTruthy();
  });

  it("제목 없이 다음을 누르면 첫 단계에 머물며 오류를 알리고 해당 칸으로 포커스를 옮긴다", () => {
    signIn(SELLER);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert").textContent).toBe("제목을 입력하세요.");
    const title = screen.getByLabelText("제목");
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(title.getAttribute("aria-describedby")).toBe(screen.getByRole("alert").id);
    expect(document.activeElement).toBe(title);
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("기본 정보");
  });

  it("가격이 최소보다 낮으면 설명·가격 단계에서 막히고, 이전으로 돌아가도 입력은 유지된다", () => {
    signIn(SELLER);
    mount();
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "유지될 제목" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    fireEvent.change(screen.getByLabelText("포인트 가격"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "다음" }));
    expect(screen.getByRole("alert").textContent).toBe("가격은 최소 10P부터예요.");
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("설명·가격");
    expect(document.activeElement).toBe(screen.getByLabelText("포인트 가격"));

    fireEvent.click(screen.getByRole("button", { name: "이전" }));
    // 단계를 옮기면 이전 오류 안내는 거두고, 먼저 입력한 값은 그대로 남는다.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByDisplayValue("유지될 제목")).toBe(screen.getByLabelText("제목"));
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("기본 정보");
  });

  it("확인 단계는 입력한 값을 요약해 보여 주고, 폼 제출(Enter)은 다음 단계와 같게 동작한다", () => {
    signIn(SELLER);
    mount();
    const form = screen.getByRole("form", { name: "새 리스팅 등록" });
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "요약될 브러시" } });
    fireEvent.submit(form);
    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("설명·가격");
    fireEvent.change(screen.getByLabelText("포인트 가격"), { target: { value: "150" } });
    fireEvent.submit(form);

    expect(document.querySelector('[aria-current="step"]')?.textContent).toContain("확인·등록");
    expect(screen.getByText("요약될 브러시")).toBeTruthy();
    expect(screen.getByText("브러시")).toBeTruthy();
    expect(screen.getByText("150P")).toBeTruthy();
    expect(screen.getByText("설명 없음")).toBeTruthy();
    // 마지막 단계의 제출만 리스팅을 만든다 — 그 전까지는 저장된 리스팅이 없다.
    expect(screen.getByRole("button", { name: "리스팅 등록" })).toBeTruthy();
    expect(screen.queryByText(/리스팅을 등록했어요/)).toBeNull();
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
