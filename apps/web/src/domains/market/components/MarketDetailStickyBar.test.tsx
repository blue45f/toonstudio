// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketDetailStickyBar } from "./MarketDetailStickyBar";

import type { MarketStudioHandoff } from "../models/market-studio-handoff";
import { MARKET_GUEST_LOGIN_NOTICE_STICKY_ID } from "../models/market-guest-login-notice";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  SessionContext,
  type SessionContextValue,
} from "@/domains/auth/public/session/auth-session-store";

vi.mock("../hooks/use-market-library", () => ({
  useMarketLibrary: () => ({ isAcquired: () => false }),
}));

vi.mock("../hooks/use-market-wishlist", () => ({
  useMarketWishlist: () => ({ isWishlisted: () => false, toggleWishlist: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
});

const GUEST: SessionContextValue = {
  data: null,
  ready: true,
  status: "unauthenticated",
  update: async () => null,
};

const SIGNED_IN: SessionContextValue = {
  data: { user: { id: "user-1", name: "작가" }, token: null },
  ready: true,
  status: "authenticated",
  update: async () => null,
};

const PUBLISHER_ID = ["323e4567", "e89b", "42d3", "a456", "426614174000"].join("-");

const record = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  name: "스타터 잉크 브러시",
  kind: "brush",
  resourceVersion: "1.0.0",
  publisher: { id: PUBLISHER_ID, name: "마켓 작가", avatar: null },
} as unknown as CreatorMarketplaceResourceRecord;

const studioHandoff: MarketStudioHandoff = {
  href: "/studio?installMarketResource=123e4567-e89b-42d3-a456-426614174000",
  mode: "install-tool-pack",
  actionLabel: "스튜디오에 브러시 팩 설치",
  destinationLabel: "브러시 도구 라이브러리",
  summary: "요약",
  completionEvidence: "증거",
};

async function renderBar(session: SessionContextValue, onOpenAcquisition = vi.fn()) {
  Object.defineProperty(window, "scrollY", { value: 300, configurable: true });
  const utils = render(
    <MemoryRouter>
      <SessionContext.Provider value={session}>
        <MarketDetailStickyBar
          record={record}
          studioHandoff={studioHandoff}
          onOpenAcquisition={onOpenAcquisition}
        />
      </SessionContext.Provider>
    </MemoryRouter>,
  );
  fireEvent.scroll(window);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /내 에셋에 추가/ })).toBeTruthy();
  });
  return { ...utils, onOpenAcquisition };
}

describe("MarketDetailStickyBar 게스트 사전 고지", () => {
  it("게스트에게는 획득 버튼 옆에 로그인 필요가 먼저 보이고 버튼이 고지를 참조한다", async () => {
    const { onOpenAcquisition } = await renderBar(GUEST);

    expect(screen.getByText("로그인 필요")).toBeTruthy();
    const acquireButton = screen.getByRole("button", { name: /내 에셋에 추가/ });
    expect(acquireButton.getAttribute("aria-describedby"))
      .toBe(MARKET_GUEST_LOGIN_NOTICE_STICKY_ID);
    expect(document.getElementById(MARKET_GUEST_LOGIN_NOTICE_STICKY_ID)?.textContent)
      .toContain("로그인 필요");

    // 클릭 위임 자체는 그대로 부모 핸들러로 간다(부모가 같은 판정으로 로그인 연결).
    fireEvent.click(acquireButton);
    expect(onOpenAcquisition).toHaveBeenCalledTimes(1);
  });

  it("로그인한 사용자에게는 고지가 없고 버튼도 고지를 참조하지 않는다", async () => {
    await renderBar(SIGNED_IN);

    expect(screen.queryByText("로그인 필요")).toBeNull();
    const acquireButton = screen.getByRole("button", { name: /내 에셋에 추가/ });
    expect(acquireButton.getAttribute("aria-describedby")).toBeNull();
  });
});
