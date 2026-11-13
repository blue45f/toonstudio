// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAdminShellCopy } from "../router/admin-route-manifest";

import { AdminShell } from "./AdminShell";

import { useI18n } from "@/shared/lib/i18n";

vi.mock("../components/AdminHeaderStats", () => ({ AdminHeaderStats: () => <p>전역 운영 지표</p> }));
vi.mock("../components/AdminQuickPalette", () => ({ AdminQuickPalette: () => null }));

const key = "toonstudio.admin.sidebar.collapsed.v1";

function renderShell() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminShell actor={{ id: "admin-test", name: "Admin", email: null, role: "admin" }} userId="admin-test">
          <p>Admin content</p>
        </AdminShell>
      </MemoryRouter>
    </StrictMode>,
  );
}

beforeEach(() => {
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminShell sidebar preference", () => {
  it("opens and remains usable when localStorage access is denied", () => {
    vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access denied", "SecurityError");
    });
    renderShell();
    expect(screen.getByText("Admin content")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeTruthy();
  });

  it("keeps toggling when preference writes exceed the storage quota", () => {
    localStorage.setItem(key, "1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 펼치기" }));
    expect(screen.getByRole("button", { name: "사이드바 접기" })).toBeTruthy();
    expect(screen.getByText("Admin content")).toBeTruthy();
  });

  it("restores the last successful preference on a fresh mount", () => {
    const view = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "사이드바 접기" }));
    expect(localStorage.getItem(key)).toBe("1");
    view.unmount();
    renderShell();
    expect(screen.getByRole("button", { name: "사이드바 펼치기" })).toBeTruthy();
  });
});


describe("관리자 모바일 탐색의 키보드와 복구", () => {
  const copy = getAdminShellCopy("ko");

  it("이름 있는 모달로 열리고 Escape 후 원래 버튼에 포커스를 돌린다", async () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: copy.openNavigation });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: copy.navigation });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("모바일과 데스크톱 메뉴의 제목 ID가 중복되지 않고 닫기 버튼도 복구한다", async () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: copy.openNavigation });
    trigger.focus();
    fireEvent.click(trigger);
    const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
    expect(new Set(ids).size).toBe(ids.length);
    const dialog = screen.getByRole("dialog", { name: copy.navigation });
    fireEvent.click(within(dialog).getByRole("button", { name: copy.closeNavigation }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("배경으로 포커스가 빠지지 않고 이동 링크를 선택하면 메뉴가 닫힌다", async () => {
    renderShell();
    const trigger = screen.getByRole("button", { name: copy.openNavigation });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: copy.navigation });
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    trigger.focus();
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(within(dialog).getByRole("link", { name: copy.publicSite }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("넓은 화면으로 전환하면 숨은 모달과 본문 잠금을 남기지 않는다", async () => {
    let matches = false;
    const changes = new EventTarget();
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      get matches() { return matches; },
      media: "(min-width: 1024px)",
      addEventListener: changes.addEventListener.bind(changes),
      removeEventListener: changes.removeEventListener.bind(changes),
    })));
    renderShell();
    fireEvent.click(screen.getByRole("button", { name: copy.openNavigation }));
    expect(screen.getByRole("dialog", { name: copy.navigation })).toBeTruthy();
    matches = true;
    act(() => { changes.dispatchEvent(new Event("change")); });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.body.hasAttribute("data-scroll-locked")).toBe(false);
  });

  it("현재 업무 그룹부터 보여 주고 다른 그룹은 직접 펼쳐 이동한다", () => {
    renderShell();
    expect(screen.getByTestId("admin-edge-gate-badge").textContent).toContain("Edge Gate 보호");

    const groupToggle = screen.getByRole("button", { name: copy.groups.monetization });
    expect(groupToggle.getAttribute("aria-expanded")).toBe("false");
    const listId = groupToggle.getAttribute("aria-controls") ?? "";
    const groupList = document.getElementById(listId);
    expect(groupList?.hidden).toBe(true);

    fireEvent.click(groupToggle);
    expect(groupToggle.getAttribute("aria-expanded")).toBe("true");
    expect(groupList?.hidden).toBe(false);

    fireEvent.click(groupToggle);
    expect(groupToggle.getAttribute("aria-expanded")).toBe("false");
    expect(groupList?.hidden).toBe(true);
  });

  it("직무 본문 뒤의 전체 현황을 펼칠 때만 전역 지표를 읽는다", async () => {
    renderShell();
    expect(screen.getByText("Admin content")).toBeTruthy();
    expect(screen.queryByText("전역 운영 지표")).toBeNull();
    const disclosure = document.querySelector<HTMLDetailsElement>("[data-admin-global-overview]");
    if (!disclosure) throw new Error("전체 현황 입구가 없습니다.");
    fireEvent.click(screen.getByText("전체 운영 현황"));
    await waitFor(() => expect(screen.getByText("전역 운영 지표")).toBeTruthy());
    expect(screen.getByText("Admin content").compareDocumentPosition(disclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
