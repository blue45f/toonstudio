// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chunk = { ready: Promise.resolve(), attempts: 0 };

let resolveChunk: () => void;
let rejectChunk: (error: Error) => void;
beforeEach(() => {
  vi.resetModules();
  chunk.attempts = 0;
  chunk.ready = new Promise<void>((resolve, reject) => { resolveChunk = resolve; rejectChunk = reject; });
  vi.doMock("./WorkspaceMenuNavigation", async () => {
    chunk.attempts += 1;
    await chunk.ready;
    return {
      WorkspaceMenuNavigation: ({ activeId }: { readonly activeId?: string }) => (
        <nav data-testid="loaded-workspace-menu" data-active-id={activeId}>새 메뉴</nav>
      ),
    };
  });
});
afterEach(() => { cleanup(); vi.doUnmock("./WorkspaceMenuNavigation"); });

async function sidebar() {
  const { WorkspaceSidebar } = await import("./WorkspaceChrome");
  render(<MemoryRouter><WorkspaceSidebar activeId="studio"><button type="button">원고 열기</button></WorkspaceSidebar></MemoryRouter>);
}

function originalLinks() {
  const navigation = screen.getByRole("navigation", { name: "주 메뉴" });
  expect(within(navigation).getAllByRole("link").map(link => link.getAttribute("href")))
    .toEqual(["/home", "/studio", "/discover", "/community", "/sitemap"]);
  expect(navigation.hasAttribute("data-site-mobile-utilities")).toBe(false);
}

describe("Workspace 메뉴 구현 지연 경계", () => {
  it("받는 동안 기존 목적지와 본문을 유지하고 준비되면 같은 활성 문맥을 전달한다", async () => {
    await sidebar();
    originalLinks();
    expect(screen.getByRole("button", { name: "원고 열기" })).toBeTruthy();
    await waitFor(() => expect(chunk.attempts).toBe(1));
    await act(async () => resolveChunk());
    const loaded = await screen.findByTestId("loaded-workspace-menu");
    expect(loaded.getAttribute("data-active-id")).toBe("studio");
    expect(chunk.attempts).toBe(1);
  });

  it("선택 메뉴 청크 실패에도 기존 사이트맵과 음악 진입 표시를 보존한다", async () => {
    await sidebar();
    originalLinks();
    await waitFor(() => expect(chunk.attempts).toBe(1));
    await act(async () => rejectChunk(new Error("명시적 선택 메뉴 청크 실패")));
    await waitFor(() => expect(chunk.attempts).toBe(1));
    originalLinks();
    expect(screen.queryByTestId("loaded-workspace-menu")).toBeNull();
    expect(document.querySelector('[data-site-mobile-utilities="available"]')).toBeNull();
  });
});
