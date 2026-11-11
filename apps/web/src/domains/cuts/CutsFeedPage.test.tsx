// @vitest-environment jsdom
/**
 * 컷츠 피드 준비 상태 테스트 —
 * 저장소 하이드레이션·시드 확인 전에는 빈 상태를 그리지 않고 로딩을 보여주고,
 * 준비가 끝나면 시드 클립 피드가 열리는지 검증한다.
 */
import "fake-indexeddb/auto";

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CutsFeedPage } from "./CutsFeedPage";
import { useCutsStore } from "./cuts-store";

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(async () => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  localStorage.clear();
  await useCutsStore.persist.rehydrate();
  useCutsStore.setState({ clips: [] });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** 저장소 I/O 완료 시점과 별개로 마운트 전/후 하이드레이션 통지를 결정적으로 제어한다. */
function controlHydration() {
  let hydrated = false;
  const listeners = new Set<(state: ReturnType<typeof useCutsStore.getState>) => void>();
  vi.spyOn(useCutsStore.persist, "hasHydrated").mockImplementation(() => hydrated);
  vi.spyOn(useCutsStore.persist, "onFinishHydration").mockImplementation((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  });
  return {
    finish() {
      hydrated = true;
      for (const listener of [...listeners]) listener(useCutsStore.getState());
    },
  };
}

describe("CutsFeedPage 준비 상태", () => {
  it("하이드레이션 전에는 빈 상태 대신 로딩을 보여주고, 준비 후 시드 피드가 열린다", async () => {
    const hydration = controlHydration();
    render(
      <MemoryRouter initialEntries={["/cuts"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );

    // 첫 렌더에서 "클립이 없어요" 빈 상태가 깜빡이면 안 된다.
    expect(screen.queryByText("아직 공개된 클립이 없어요.")).toBeNull();
    expect(screen.getByText("클립을 불러오는 중…")).toBeTruthy();
    expect(useCutsStore.getState().clips).toEqual([]);

    // import·렌더 속도에 기대지 않고 완료 통지 전/후의 화면을 검증한다.
    act(() => hydration.finish());

    // 하이드레이션 + 시드가 끝나면 클립 아이템이 렌더된다.
    await waitFor(() => {
      expect(document.querySelectorAll(".cuts-feed__item").length).toBeGreaterThan(0);
    });
    expect(screen.queryByText("클립을 불러오는 중…")).toBeNull();
    expect(screen.queryByText("아직 공개된 클립이 없어요.")).toBeNull();

    // 피드 필터 칩과 단축키 안내가 상단에 44px 터치 타깃으로 노출된다.
    const filterGroup = screen.getByRole("group", { name: "피드 필터" });
    expect(filterGroup).toBeTruthy();
    expect(screen.getByRole("button", { name: "리워드 대상" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "리믹스 가능" }).className).toContain("min-h-11");
    expect(screen.getByRole("button", { name: "인기순" }).className).toContain("min-h-11");
    expect(screen.getByTestId("cuts-rea-interactive-motion-dub-bar")).toBeTruthy();
    expect(screen.getByTestId("cuts-rea-motion-rive-statemachine").className).toContain("min-h-11");
    expect(screen.getByTestId("cuts-rea-dub-rask-heygen-130lang").className).toContain("min-h-11");
    expect(screen.getByTestId("cuts-rea-active-engine-summary").textContent).toContain(
      "[구성 미리보기] Rive 스크롤/탭 상태머신",
    );
  });

  it("하이드레이션 전에 언마운트하면 늦은 완료 통지가 시드를 만들지 않는다", () => {
    const hydration = controlHydration();
    const { unmount } = render(
      <MemoryRouter initialEntries={["/cuts"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );
    unmount();
    act(() => hydration.finish());
    expect(useCutsStore.getState().clips).toEqual([]);
  });

  it("마운트 전에 하이드레이션이 끝났으면 로딩이나 빈 상태 없이 시드 피드를 연다", () => {
    expect(useCutsStore.persist.hasHydrated()).toBe(true);
    render(
      <MemoryRouter initialEntries={["/cuts"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );

    expect(document.querySelectorAll(".cuts-feed__item").length).toBeGreaterThan(0);
    expect(screen.queryByText("클립을 불러오는 중…")).toBeNull();
    expect(screen.queryByText("아직 공개된 클립이 없어요.")).toBeNull();
  });

  it.each(["ArrowDown", "ArrowUp"])("활성 클립이 없으면 %s로 첫 클립부터 탐색한다", async (key) => {
    render(
      <MemoryRouter initialEntries={["/cuts"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );
    await waitFor(() => {
      expect(document.querySelectorAll(".cuts-feed__item").length).toBeGreaterThan(1);
    });
    const [first, second] = document.querySelectorAll<HTMLElement>(".cuts-feed__item");
    if (!first || !second) throw new Error("키보드 탐색을 검증할 시드 클립이 없습니다.");
    const firstScroll = vi.fn(), secondScroll = vi.fn();
    first.scrollIntoView = firstScroll;
    second.scrollIntoView = secondScroll;

    fireEvent.keyDown(document.body, { key });

    expect(firstScroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(secondScroll).not.toHaveBeenCalled();
  });
});
