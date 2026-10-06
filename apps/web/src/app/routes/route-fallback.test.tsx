// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { RouteFallback } from "./route-fallback";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("route loading fallback", () => {
  it("explains a delayed route without replacing the structural skeleton", async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <RouteFallback accessibleTitle="정밀 CAD" />
      </MemoryRouter>,
    );
    expect(document.querySelector("[data-route-loading-fallback]")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 1, name: "정밀 CAD" })).toBeTruthy();
    expect(screen.getByText("장소·인물·소품을 고르고 구도와 작화 스타일을 정해 현재 컷에 적용합니다.")).toBeTruthy();
    expect(screen.queryByText("이 작업에 필요한 상태를 준비하고 있어요.")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4_600); });
    expect(screen.getByText("이 작업에 필요한 상태를 준비하고 있어요.")).toBeTruthy();
    expect(screen.getByText("작성 중인 초안과 복구 상태를 확인하고 있습니다.")).toBeTruthy();
    expect(screen.getByRole("status", { name: /불러오는 중/u })).toBeTruthy();
  });

  it.each([
    ["/studio/space", "virtual-space"],
    ["/studio/p/demo/space", "virtual-space"],
    ["/home", "studio-home"],
    ["/learn/process", "learn"],
    ["/learn", "learn"],
  ])("%s에서는 일반 카드 그리드 대신 %s 실루엣 스켈레톤을 보여 준다", (pathname, family) => {
    render(
      <MemoryRouter initialEntries={[pathname]}>
        <RouteFallback />
      </MemoryRouter>,
    );
    expect(document.querySelector(`[data-route-silhouette="${family}"]`)).not.toBeNull();
    expect(document.querySelector("[data-skeleton-card]")).toBeNull();
    expect(screen.getByRole("status", { name: /불러오는 중/u })).toBeTruthy();
  });

  it("실루엣 대상이 아닌 경로는 일반 카드 스켈레톤을 유지한다", () => {
    render(
      <MemoryRouter initialEntries={["/market"]}>
        <RouteFallback />
      </MemoryRouter>,
    );
    expect(document.querySelector("[data-route-silhouette]")).toBeNull();
    expect(document.querySelector("[data-skeleton-card]")).not.toBeNull();
  });

  it("suggests popular routes with working links when loading stalls", async () => {
    vi.useFakeTimers();
    render(
      <MemoryRouter initialEntries={["/studio/bg3d"]}>
        <RouteFallback accessibleTitle="정밀 CAD" />
      </MemoryRouter>,
    );
    expect(screen.queryByText("기다리는 동안 다른 경로를 둘러보세요.")).toBeNull();
    await act(async () => { await vi.advanceTimersByTimeAsync(4_600); });
    expect(screen.getByText("기다리는 동안 다른 경로를 둘러보세요.")).toBeTruthy();
    const hrefs = ["/", "/discover", "/studio", "/search", "/help"];
    for (const href of hrefs) {
      const link = document.querySelector(`a[href="${href}"]`);
      expect(link, href).not.toBeNull();
    }
  });
});
