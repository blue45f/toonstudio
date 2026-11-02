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
});
