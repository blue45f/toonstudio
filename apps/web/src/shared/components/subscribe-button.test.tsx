// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SubscribeButton } from "./subscribe-button";
import { useApp } from "@/shared/lib/store";

vi.mock("@/shared/lib/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/lib/store")>();
  return { ...actual, useHydrated: () => true };
});
vi.mock("@/shared/hooks/use-celebrate", () => ({ useCelebrate: () => vi.fn() }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("복원된 계정의 구독 준비 상태", () => {
  it.each([false, true])("세션 확인 전 토글을 막고 같은 계정 확인 후 전송한다 (기존 구독: %s)", (subscribed) => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    useApp.setState({ userId: null, sessionToken: null, libraryOwnerId: "saved-owner", subscriptions: { title: subscribed } });
    render(<SubscribeButton titleId="title" />);
    const button = screen.getByRole("button");
    expect(button.hasAttribute("disabled")).toBe(true);
    fireEvent.click(button);
    expect(useApp.getState().subscriptions.title).toBe(subscribed);
    expect(fetchMock).not.toHaveBeenCalled();
    act(() => useApp.getState().toggleSubscription("title"));
    expect(useApp.getState().subscriptions.title).toBe(subscribed);
    act(() => useApp.getState().setSessionIdentity("saved-owner", "confirmed-session"));
    expect(button.hasAttribute("disabled")).toBe(false);
    fireEvent.click(button);
    expect(useApp.getState().subscriptions.title).toBe(!subscribed);
    expect(fetchMock).toHaveBeenCalledWith("/api/me/subscription", expect.any(Object));
  });

  it.each(["other-owner", null])("확인된 세션이 %s이면 이전 구독을 지운다", (owner) => {
    useApp.setState({ userId: null, sessionToken: null, libraryOwnerId: "saved-owner", subscriptions: { title: true } });
    useApp.getState().setSessionIdentity(owner, owner ? "new-session" : null);
    expect(useApp.getState().subscriptions).toEqual({});
    expect(useApp.getState().libraryOwnerId).toBeNull();
  });
});
