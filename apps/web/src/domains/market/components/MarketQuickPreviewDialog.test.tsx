// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketQuickPreviewDialog } from "./MarketQuickPreviewDialog";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

beforeEach(() => {
  localStorage.clear();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("MarketQuickPreviewDialog", () => {
  it("closedby='any' 표준 모달을 열고 Safari 좌표 경계 밖 backdrop 클릭 시 닫는다", () => {
    const onClose = vi.fn();
    const sample = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;

    render(
      <MemoryRouter>
        <MarketQuickPreviewDialog record={sample} onClose={onClose} />
      </MemoryRouter>,
    );

    const dialog = screen.getByTestId("market-quick-preview-dialog") as HTMLDialogElement;
    expect(dialog.getAttribute("closedby")).toBe("any");
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(screen.getByRole("heading", { name: sample.name })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: sample.publisher.name }).getAttribute("href"),
    ).toBe(`/market/creator/${encodeURIComponent(sample.publisher.id)}`);
    expect(
      screen.getByRole("link", { name: /Studio에서 열기/ }).getAttribute("href"),
    ).toContain(`installMarketResource=${encodeURIComponent(sample.id)}`);

    vi.spyOn(dialog, "getBoundingClientRect").mockReturnValue({
      top: 100,
      left: 100,
      width: 400,
      height: 300,
      right: 500,
      bottom: 400,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    // 모달 내부 좌표 클릭 시 닫히지 않음
    fireEvent.click(dialog, { clientX: 220, clientY: 200 });
    expect(onClose).not.toHaveBeenCalled();

    // 모달 경계 밖 backdrop 클릭 시 닫힘 (Safari light-dismiss 폴백)
    fireEvent.click(dialog, { clientX: 20, clientY: 20 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("오픈 시 닫기 버튼으로 초점이 진입하고 Tab/Shift+Tab 순환 트랩 및 Escape·닫기 후 트리거로 초점을 복귀한다 (GAP-R4-05)", () => {
    const onClose = vi.fn();
    const sample = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;

    const { rerender } = render(
      <MemoryRouter>
        <div>
          <button type="button" data-testid="preview-trigger">
            빠른 미리보기 열기
          </button>
          <MarketQuickPreviewDialog record={null} onClose={onClose} />
        </div>
      </MemoryRouter>,
    );

    const trigger = screen.getByTestId("preview-trigger");
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    rerender(
      <MemoryRouter>
        <div>
          <button type="button" data-testid="preview-trigger">
            빠른 미리보기 열기
          </button>
          <MarketQuickPreviewDialog record={sample} onClose={onClose} />
        </div>
      </MemoryRouter>,
    );

    const dialog = screen.getByTestId("market-quick-preview-dialog");
    const closeButton = screen.getByRole("button", { name: /빠른 미리보기 닫기/ });
    const detailLink = screen.getByRole("link", { name: /상세 페이지 보기/ });

    // 1) 초기 초점 진입 확인
    expect(document.activeElement).toBe(closeButton);

    // 2) 첫 포커스 요소에서 Shift+Tab 입력 시 마지막 요소로 순환
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(detailLink);

    // 3) 마지막 포커스 요소에서 Tab 입력 시 첫 요소로 순환
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: false });
    expect(document.activeElement).toBe(closeButton);

    // 4) Escape 입력 시 모달을 닫고 트리거 버튼으로 초점 복귀
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
  });

  it("미리보기 모달 내부 모든 버튼·태그·액션 링크에 44px(min-h-11/size-11) 터치 타깃과 모바일 안전 간격을 적용한다 (GAP-R4-05)", () => {
    const sample = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
    render(
      <MemoryRouter>
        <MarketQuickPreviewDialog record={sample} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    const closeButton = screen.getByRole("button", { name: /빠른 미리보기 닫기/ });
    expect(closeButton.className).toContain("size-11");
    expect(closeButton.className).toContain("min-h-11");
    expect(closeButton.className).toContain("min-w-11");

    const wishlistButton = screen.getByRole("button", { name: /찜하기|찜함/ });
    expect(wishlistButton.className).toContain("min-h-11");
    expect(wishlistButton.className).toContain("min-w-11");
    expect(wishlistButton.parentElement?.className).toContain("[&_button]:min-h-11");

    const publisherLink = screen.getByRole("link", { name: sample.publisher.name });
    expect(publisherLink.className).toContain("min-h-11");

    for (const tag of sample.tags) {
      const tagLink = screen.getByRole("link", { name: `#${tag}` });
      expect(tagLink.className).toContain("min-h-11");
      expect(tagLink.className).toContain("min-w-11");
    }

    for (const name of [/원고 위 시험/, /Studio에서 열기/, /상세 페이지 보기/]) {
      const cta = screen.getByRole("link", { name });
      expect(cta.className).toContain("min-h-11");
      expect(cta.className).toContain("min-w-11");
    }
  });
});
