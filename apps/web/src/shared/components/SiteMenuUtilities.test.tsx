// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { StrictMode, useCallback, useRef, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MobileHeaderNavigation } from "./site-header-mobile-nav";
import { useSiteMenuAudioHandoff } from "./use-site-menu-audio-handoff";

import { SITE_OST_PANEL_OPEN_EVENT } from "@/shared/lib/site-background-music";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => unknown) => selector({ lang: "ko" }),
  useT: () => (key: string) => key,
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function MenuOwner({ activeHref }: { readonly activeHref?: string }) {
  const [open, setOpen] = useState(true);
  const panel = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button type="button" data-testid="page-action">검색</button>
    <MobileHeaderNavigation menuOpen={open} menuId="utility-menu" panelRef={panel}
      closeMenu={close} closeForUtility={close} isActive={(href) => href === activeHref} isPurposeActive={() => false} />
  </>;
}

describe("전체 메뉴의 설정과 음악", () => {
  it("메뉴에 설정을 한 번만 두고 음악 버튼에 보이는 목적 이름을 제공한다", () => {
    render(<MemoryRouter><MenuOwner /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /화면·언어 설정/u }).getAttribute("href")).toBe("/settings");
    expect(document.querySelectorAll('a[href="/settings"]')).toHaveLength(1);
    expect(screen.getByRole("button", { name: /배경 음악/u })).toBeTruthy();
  });

  it("설정 화면에서는 새 설정 진입점에도 현재 위치를 유지한다", () => {
    render(<MemoryRouter initialEntries={["/settings"]}><MenuOwner activeHref="/settings" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /화면·언어 설정/u }).getAttribute("aria-current")).toBe("page");
  });

  it("배경 차단과 메뉴를 먼저 해제한 뒤 음악 패널 열기 요청을 한 번 보낸다", async () => {
    let received = 0;
    const listener = () => {
      received += 1;
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByTestId("page-action").closest("[inert]")).toBeNull();
      expect(document.body.style.overflow).toBe("");
    };
    window.addEventListener(SITE_OST_PANEL_OPEN_EVENT, listener);
    try {
      render(<StrictMode><MemoryRouter><MenuOwner /></MemoryRouter></StrictMode>);
      expect(screen.getByTestId("page-action").closest("[inert]")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /배경 음악/u }));
      await waitFor(() => expect(received).toBe(1));
    } finally { window.removeEventListener(SITE_OST_PANEL_OPEN_EVENT, listener); }
  });

  it("음악 요청 전에 경로가 바뀌면 이전 메뉴의 요청을 새 화면에서 실행하지 않는다", () => {
    const listener = vi.fn();
    window.addEventListener(SITE_OST_PANEL_OPEN_EVENT, listener);
    try {
      const close = vi.fn();
      const { result, rerender } = renderHook(({ open, locationKey }) => useSiteMenuAudioHandoff(open, locationKey, close), {
        initialProps: { open: true, locationKey: "first" },
      });
      act(() => result.current());
      expect(close).toHaveBeenCalledOnce();
      rerender({ open: false, locationKey: "second" });
      expect(listener).not.toHaveBeenCalled();
      rerender({ open: true, locationKey: "second" });
      rerender({ open: false, locationKey: "second" });
      expect(listener).not.toHaveBeenCalled();
    } finally { window.removeEventListener(SITE_OST_PANEL_OPEN_EVENT, listener); }
  });
});
