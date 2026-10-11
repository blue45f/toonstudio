// @vitest-environment jsdom
/**
 * 컷츠 피드 Godot 대체 진입 테스트 —
 * ?engine=godot 로 들어오면 피드 목록 대신 Godot 플레이어 임베드가 열리고,
 * 파라미터가 없으면 기존 피드가 그대로 열리는지 검증한다.
 */
import "fake-indexeddb/auto";

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CUTS_GODOT_EMBED_PATH } from "./CutsGodotEmbed";
import { CutsFeedPage } from "./CutsFeedPage";

class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete window.__tsMotionEvent;
});

describe("CutsFeedPage Godot 진입", () => {
  it("?engine=godot 이면 피드 목록 대신 Godot 임베드를 연다", async () => {
    render(
      <MemoryRouter initialEntries={["/cuts?engine=godot"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      const frame = document.querySelector("iframe");
      expect(frame?.getAttribute("src")).toBe(CUTS_GODOT_EMBED_PATH);
    });
    // 피드 아이템은 그려지지 않는다.
    expect(document.querySelectorAll(".cuts-feed__item").length).toBe(0);
    expect(screen.getByText(/플레이어 엔진을 불러오는 중이에요/)).toBeTruthy();
  });

  it("엔진 파라미터가 없으면 기존 피드가 열린다", async () => {
    render(
      <MemoryRouter initialEntries={["/cuts"]}>
        <CutsFeedPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(document.querySelectorAll(".cuts-feed__item").length).toBeGreaterThan(0);
    });
    expect(document.querySelector("iframe")).toBeNull();
  });
});
