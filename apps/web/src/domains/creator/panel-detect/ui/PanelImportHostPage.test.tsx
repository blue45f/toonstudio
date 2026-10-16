// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioImportIntegratedPage } from "../../studio-shell/StudioImportIntegratedPage";

/** 기존 가져오기 화면의 모션 효과(framer-motion 뷰포트 감지)가 jsdom 에 없는 IntersectionObserver 를 요구한다. */
class IdleIntersectionObserver {
  observe(): void { /* 보이는지 알릴 필요가 없다 */ }
  unobserve(): void { /* noop */ }
  disconnect(): void { /* noop */ }
  takeRecords(): IntersectionObserverEntry[] { return []; }
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IdleIntersectionObserver);
  useI18n.getState().setLang("ko");
});
afterEach(() => {
  vi.unstubAllGlobals();
  useI18n.getState().setLang("ko");
});

describe("Studio 가져오기 화면에 원고 이미지 도우미가 들어 있다", () => {
  it("기존 가져오기 구역 바로 아래에 진입 구역이 있고, 언어를 바꾸면 함께 바뀐다", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/studio/import"]}>
        <StudioImportIntegratedPage />
      </MemoryRouter>,
    );
    const surface = container.querySelector('[data-studio-illustrated-surface="import"]');
    const entry = surface?.querySelector('[data-panel-import-entry="true"]');
    expect(entry).toBeTruthy();
    // 같은 화면의 기존 가져오기 입력 바로 뒤에 이어진다.
    expect(entry?.previousElementSibling).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "스캔한 원고에서 컷을 찾거나, 긴 원고를 카드로 나누기" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "컷 찾기 시작" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "카드 나누기 시작" })).toBeTruthy();

    act(() => { useI18n.getState().setLang("en"); });
    expect(await screen.findByRole("heading", { level: 2, name: "Find panels in a scan, or slice a long manuscript into cards" })).toBeTruthy();
  });
});
