// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HonestyBadge } from "./honesty-badge";

afterEach(cleanup);

describe("HonestyBadge", () => {
  it.each([
    ["confirmed", "확인된 일치", "good"],
    ["estimated", "추정 일치", "warn"],
    ["unverified", "확인 못 함", "neutral"],
  ] as const)("%s 단계는 색이 아니라 글자로 상태를 말한다", (level, label, tone) => {
    render(<HonestyBadge level={level} />);
    const text = screen.getByText(label);
    expect(text.getAttribute("data-honesty-level")).toBe(level);
    expect(text.closest("[data-slot='badge']")?.getAttribute("data-tone")).toBe(tone);
  });

  it("아이콘은 장식이라 화면 읽기에서 숨긴다", () => {
    const { container } = render(<HonestyBadge level="confirmed" />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("문구만 바꿀 수 있고 상태 의미(level)는 그대로다", () => {
    render(<HonestyBadge level="estimated" label="약한 후보" className="ml-2" />);
    const text = screen.getByText("약한 후보");
    expect(text.getAttribute("data-honesty-level")).toBe("estimated");
    expect(text.closest("[data-slot='badge']")?.className).toContain("ml-2");
  });
});
