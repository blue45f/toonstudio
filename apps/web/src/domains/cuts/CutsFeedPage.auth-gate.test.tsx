// @vitest-environment jsdom
/**
 * 컷츠 피드 게스트 인증 게이트 통합 재현 (F-B11-1) —
 * 게스트가 좋아요를 누르면 토글 없이 인증 모달이 열려야 한다.
 * 피드(실제 스토어·실제 auth-modal-intent 발신)와 인증 모달 구독자
 * (AuthMenuShell)를 함께 렌더해 발신→구독→모달 전 구간을 검증한다.
 */
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthMenuShell } from "@/domains/auth/components/auth-menu-shell";

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
});

async function renderFeed(withShell: boolean) {
  render(
    <MemoryRouter initialEntries={["/cuts"]}>
      {withShell ? <AuthMenuShell /> : null}
      <CutsFeedPage />
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(document.querySelectorAll(".cuts-feed__item").length).toBeGreaterThan(0);
  });
  const likeButton = screen.getAllByRole("button", { name: "좋아요" })[0];
  expect(likeButton).toBeTruthy();
  return likeButton!;
}

describe("컷츠 피드 게스트 좋아요 인증 게이트 (F-B11-1)", () => {
  it("구독자가 있으면 게스트 좋아요 클릭에 인증 모달이 열린다", async () => {
    const likeButton = await renderFeed(true);

    fireEvent.click(likeButton);

    const dialog = await screen.findByRole("dialog", undefined, { timeout: 20000 });
    expect(dialog).toBeTruthy();
    // 게스트 좋아요는 낙관적으로 토글되지 않는다.
    expect(likeButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("구독자가 없으면 게스트 좋아요 클릭이 조용히 사라진다 (결함 메커니즘)", async () => {
    const likeButton = await renderFeed(false);

    fireEvent.click(likeButton);

    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(likeButton.getAttribute("aria-pressed")).toBe("false");
  });
});
