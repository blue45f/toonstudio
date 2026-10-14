// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketGuestLoginNotice } from "./MarketGuestLoginNotice";

import {
  MARKET_GUEST_LOGIN_NOTICE_ID,
  MARKET_GUEST_LOGIN_NOTICE_STICKY_ID,
  marketGuestLoginNoticeDescribedBy,
  resolveMarketGuestLoginNoticeState,
  shouldInterceptMarketAcquireAsLogin,
} from "../models/market-guest-login-notice";

import {
  SessionContext,
  type SessionContextValue,
} from "@/domains/auth/public/session/auth-session-store";
import { subscribeAuthModalRequests } from "@/domains/auth/public/session/auth-modal-intent";

afterEach(cleanup);

const CHECKING: SessionContextValue = {
  data: null,
  ready: false,
  status: "unauthenticated",
  update: async () => null,
};

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

function renderNotice(
  session: SessionContextValue,
  props: { variant?: "detail" | "compact"; id?: string } = {},
) {
  return render(
    <SessionContext.Provider value={session}>
      <MarketGuestLoginNotice {...props} />
    </SessionContext.Provider>,
  );
}

describe("resolveMarketGuestLoginNoticeState", () => {
  it("세션 확인 전에는 상태와 무관하게 checking이라 로그인 필요를 단정하지 않는다", () => {
    expect(resolveMarketGuestLoginNoticeState({ ready: false, status: "unauthenticated" })).toBe("checking");
    expect(resolveMarketGuestLoginNoticeState({ ready: false, status: "authenticated" })).toBe("checking");
  });

  it("확인 완료된 게스트는 guest, 로그인 사용자는 signed-in이다", () => {
    expect(resolveMarketGuestLoginNoticeState({ ready: true, status: "unauthenticated" })).toBe("guest");
    expect(resolveMarketGuestLoginNoticeState({ ready: true, status: "authenticated" })).toBe("signed-in");
  });

  it("획득 클릭 인터셉트와 describedby는 guest/checking에서만 성립한다", () => {
    expect(shouldInterceptMarketAcquireAsLogin("guest")).toBe(true);
    expect(shouldInterceptMarketAcquireAsLogin("checking")).toBe(false);
    expect(shouldInterceptMarketAcquireAsLogin("signed-in")).toBe(false);
    expect(marketGuestLoginNoticeDescribedBy("guest", MARKET_GUEST_LOGIN_NOTICE_ID)).toBe(MARKET_GUEST_LOGIN_NOTICE_ID);
    expect(marketGuestLoginNoticeDescribedBy("checking", MARKET_GUEST_LOGIN_NOTICE_STICKY_ID)).toBe(MARKET_GUEST_LOGIN_NOTICE_STICKY_ID);
    expect(marketGuestLoginNoticeDescribedBy("signed-in", MARKET_GUEST_LOGIN_NOTICE_ID)).toBeUndefined();
  });
});

describe("MarketGuestLoginNotice", () => {
  it("확인 중에는 중립 상태만 보이고 로그인 행동을 권하지 않는다", () => {
    renderNotice(CHECKING, { id: MARKET_GUEST_LOGIN_NOTICE_ID });

    expect(screen.getByRole("status").textContent).toContain("로그인 상태를 확인하고 있어요");
    expect(screen.queryByText("이 에셋을 받으려면 로그인이 필요해요")).toBeNull();
    expect(screen.queryByRole("button", { name: "로그인하고 계속" })).toBeNull();
  });

  it("게스트에게는 누르기 전에 로그인 필요와 이유가 보이고, 그 자리에서 로그인을 시작할 수 있다", () => {
    const receive = vi.fn();
    const stop = subscribeAuthModalRequests(receive);
    try {
      renderNotice(GUEST, { id: MARKET_GUEST_LOGIN_NOTICE_ID });

      const notice = document.querySelector('[data-market-guest-login-notice="guest"]');
      expect(notice?.id).toBe(MARKET_GUEST_LOGIN_NOTICE_ID);
      expect(screen.getByText("이 에셋을 받으려면 로그인이 필요해요")).toBeTruthy();
      expect(screen.getByText(/로그인한 계정에 보관돼요/)).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "로그인하고 계속" }));
      expect(receive).toHaveBeenLastCalledWith({
        reason: "protected-action",
        source: "market-resource-library",
        mode: "login",
      });
      fireEvent.click(screen.getByRole("button", { name: "회원가입" }));
      expect(receive).toHaveBeenLastCalledWith({
        reason: "protected-action",
        source: "market-resource-library",
        mode: "signup",
      });
    } finally {
      stop();
    }
  });

  it("로그인한 사용자에게는 아무것도 렌더하지 않는다", () => {
    const { container } = renderNotice(SIGNED_IN, { id: MARKET_GUEST_LOGIN_NOTICE_ID });
    expect(container.innerHTML).toBe("");
  });

  it("compact는 게스트에게 한 줄 힌트만, 확인 중·로그인 시에는 비어 있다", () => {
    const guest = renderNotice(GUEST, { variant: "compact", id: MARKET_GUEST_LOGIN_NOTICE_STICKY_ID });
    expect(screen.getByText("로그인 필요")).toBeTruthy();
    expect(document.querySelector('[data-market-guest-login-notice="guest"]')?.id)
      .toBe(MARKET_GUEST_LOGIN_NOTICE_STICKY_ID);
    expect(screen.queryByRole("button", { name: "로그인하고 계속" })).toBeNull();
    guest.unmount();

    const checking = renderNotice(CHECKING, { variant: "compact", id: MARKET_GUEST_LOGIN_NOTICE_STICKY_ID });
    expect(checking.container.innerHTML).toBe("");
    checking.unmount();

    const signedIn = renderNotice(SIGNED_IN, { variant: "compact", id: MARKET_GUEST_LOGIN_NOTICE_STICKY_ID });
    expect(signedIn.container.innerHTML).toBe("");
  });
});
