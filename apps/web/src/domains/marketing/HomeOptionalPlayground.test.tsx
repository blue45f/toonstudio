// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { HomeOptionalPlayground } from "./HomeOptionalPlayground";

const showcase = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock("./flagship-showcase/HomeFlagshipInteractiveShowcase", () => ({
  HomeFlagshipInteractiveShowcase: () => {
    showcase.render();
    return <button type="button">체험 브러시</button>;
  },
}));

const initialLocale = useI18n.getState().lang;
beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  showcase.render.mockClear();
});
afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLocale });
});

describe("홈 그리기 체험의 선택 로드", () => {
  it("처음에는 접힌 안내만 표시하고 체험을 펼친 뒤에만 실행한다", async () => {
    const { container } = render(<HomeOptionalPlayground />);
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");
    if (!details || !summary) throw new Error("체험 열기 안내가 필요합니다.");
    expect(details.open).toBe(false);
    expect(showcase.render).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "체험 브러시" })).toBeNull();

    fireEvent.click(summary);
    const brush = await screen.findByRole("button", { name: "체험 브러시" });
    brush.focus();
    expect(details.open).toBe(true);
    fireEvent.keyDown(brush, { key: "Escape" });
    await waitFor(() => expect(details.open).toBe(false));
    expect(screen.queryByRole("button", { name: "체험 브러시" })).toBeNull();
    expect(document.activeElement).toBe(summary);
  });

  it("영어에서도 체험 열기의 목적을 안내한다", () => {
    useI18n.setState({ lang: "en" });
    render(<HomeOptionalPlayground />);
    expect(screen.getByText("Try the drawing tools")).toBeTruthy();
    expect(screen.getByText("Play with brushes and color")).toBeTruthy();
    expect(showcase.render).not.toHaveBeenCalled();
  });
});
