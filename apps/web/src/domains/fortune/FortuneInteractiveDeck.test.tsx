// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FortuneInteractiveDeck } from "./FortuneInteractiveDeck";

afterEach(cleanup);

describe("FortuneInteractiveDeck", () => {
  it("exposes every card as a named radio so keyboard and screen reader users can pick (F-B10-4)", () => {
    const onChange = vi.fn();
    render(<FortuneInteractiveDeck value={null} onChange={onChange} three={false} size={22} />);

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(22);
    expect(screen.getByRole("radio", { name: "1번 카드" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "22번 카드" })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "3번 카드" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("announces the picked card through the status line", () => {
    render(<FortuneInteractiveDeck value={4} onChange={vi.fn()} three size={78} />);
    expect(screen.getByRole("status").textContent).toContain("5번 카드를 골랐어요");
    expect(screen.getByRole("radio", { name: "5번 카드" })).toHaveProperty("checked", true);
  });
});
