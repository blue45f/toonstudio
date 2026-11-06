// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BrowserCompatModal } from "./browser-compat-modal";

vi.mock("../platform/browser/browser-check", () => ({
  getBrowserInfo: () => ({ name: "Test Browser", version: "1", os: "Test OS" }),
  checkBrowserCompatibility: () => ({ missingFeatures: [] }),
}));

const classTokens = (element: HTMLElement) => element.className.split(/\s+/);

describe("BrowserCompatModal touch targets", () => {
  afterEach(() => cleanup());

  it("keeps every visible modal action at least 44px tall", async () => {
    render(<BrowserCompatModal isOpen onClose={vi.fn()} />);

    const closeButton = await screen.findByRole("button", { name: "닫기" });
    expect(classTokens(closeButton)).toContain("h-11");
    expect(classTokens(closeButton)).toContain("w-11");

    for (const name of ["접속 주소 복사", "새로고침", "호환 모드로 계속하기"]) {
      const button = screen.getByRole("button", { name });
      expect(classTokens(button)).toContain("min-h-11");
      expect(classTokens(button)).not.toContain("h-10");
    }
  });

  it("makes the dialog vertically scrollable on compact viewports and closes on Escape when non-blocking", async () => {
    const onClose = vi.fn();
    render(<BrowserCompatModal isOpen onClose={onClose} />);

    const dialog = await screen.findByRole("dialog");
    expect(classTokens(dialog)).toContain("overflow-y-auto");
    expect(classTokens(dialog)).toContain("overscroll-contain");
    expect(classTokens(dialog)).toContain("max-h-[calc(100dvh-2rem)]");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
