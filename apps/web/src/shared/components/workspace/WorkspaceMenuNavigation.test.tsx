// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkspaceMenuNavigation } from "./WorkspaceMenuNavigation";
import { WorkspaceNavigation } from "./WorkspaceNavigation";

import { SITE_OST_PANEL_OPEN_EVENT } from "@/shared/lib/site-background-music";
import { useI18n } from "@/shared/lib/i18n";

const loading = vi.hoisted(() => ({ fail: false }));
vi.mock("@/shared/lib/chunk-load-recovery", () => ({
  loadChunkWithReloadRecovery: (load: () => Promise<unknown>) => loading.fail
    ? Promise.reject(new Error("명시적 메뉴 청크 실패"))
    : load(),
}));

let media: MediaQueryList;
beforeEach(() => {
  loading.fail = false;
  useI18n.getState().setLang("ko");
  const events = new EventTarget();
  media = {
    matches: true, media: "(max-width: 767px)", onchange: null,
    addListener: vi.fn(), removeListener: vi.fn(),
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
  };
  vi.stubGlobal("matchMedia", () => media);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function view() {
  return render(<MemoryRouter initialEntries={["/studio"]}>
    <button type="button" data-testid="workspace-action">원고 열기</button>
    <WorkspaceMenuNavigation />
  </MemoryRouter>);
}

describe("Workspace의 공통 전체 메뉴", () => {
  it("기본 내비 소비자는 다섯 링크와 원래 전체 기능 목적지를 유지한다", () => {
    render(<MemoryRouter><WorkspaceNavigation /></MemoryRouter>);
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(within(nav).getByRole("link", { name: "전체 메뉴" }).getAttribute("href")).toBe("/sitemap");
    expect(nav.hasAttribute("data-site-mobile-utilities")).toBe(false);
  });

  it("실제 모바일 메뉴가 준비되면 한 drawer와 기존 Sitemap·음악 진입을 제공한다", async () => {
    view();
    const trigger = await screen.findByRole("button", { name: "전체 메뉴" });
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getAllByRole("link")).toHaveLength(4);
    expect(nav.getAttribute("data-site-mobile-utilities")).toBe("available");
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(dialog.closest(".workspace-sidebar")).toBeNull();
    expect(within(dialog).getByRole("link", { name: "전체 기능" }).getAttribute("href")).toBe("/sitemap/all");
    expect(within(dialog).getByRole("button", { name: /배경 음악/u })).toBeTruthy();
    expect(document.querySelector('nav[data-site-product]')).toBeNull();
  });

  it("열기 초점·배경 차단·Tab 순환·Escape 후 같은 Workspace 버튼 복귀를 유지한다", async () => {
    view();
    const trigger = await screen.findByRole("button", { name: "전체 메뉴" });
    trigger.focus(); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog");
    const close = within(dialog).getByRole("button", { name: /닫기/u });
    await waitFor(() => expect(document.activeElement).toBe(close));
    expect(screen.getByTestId("workspace-action").closest("[inert]")).not.toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    const last = document.activeElement;
    expect(last).not.toBe(close);
    expect(dialog.contains(last)).toBe(true);
    if (!last) throw new Error("순환 초점이 없습니다.");
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(close);
    fireEvent.keyDown(close, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.getByTestId("workspace-action").closest("[inert]")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("음악을 열 때 drawer 배경 차단을 먼저 해제하고 명시 열기를 한 번 보낸다", async () => {
    let received = 0;
    const open = () => {
      received += 1;
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(screen.getByTestId("workspace-action").closest("[inert]")).toBeNull();
      expect(document.body.style.overflow).toBe("");
    };
    window.addEventListener(SITE_OST_PANEL_OPEN_EVENT, open);
    try {
      view(); fireEvent.click(await screen.findByRole("button", { name: "전체 메뉴" }));
      fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: /배경 음악/u }));
      await waitFor(() => expect(received).toBe(1));
    } finally { window.removeEventListener(SITE_OST_PANEL_OPEN_EVENT, open); }
  });

  it("데스크톱으로 넓어지면 drawer를 닫고 원래 전체 메뉴 링크로 돌아온다", async () => {
    view(); fireEvent.click(await screen.findByRole("button", { name: "전체 메뉴" }));
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    act(() => { Object.defineProperty(media, "matches", { value: false, configurable: true }); media.dispatchEvent(new Event("change")); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    const link = within(nav).getByRole("link", { name: "전체 메뉴" });
    expect(within(nav).getAllByRole("link")).toHaveLength(5);
    expect(link.getAttribute("href")).toBe("/sitemap");
    expect(nav.hasAttribute("data-site-mobile-utilities")).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(link));
  });

  it("메뉴 청크가 준비되지 못해도 원래 링크와 음악 진입을 잃지 않는다", async () => {
    loading.fail = true;
    view();
    await waitFor(() => expect(screen.queryByRole("button", { name: "전체 메뉴" })).toBeNull());
    const nav = screen.getByRole("navigation", { name: "주 메뉴" });
    expect(within(nav).getByRole("link", { name: "전체 메뉴" }).getAttribute("href")).toBe("/sitemap");
    expect(document.querySelector('[data-site-mobile-utilities="available"]')).toBeNull();
  });
});
