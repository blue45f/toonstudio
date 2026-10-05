// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CountUpAmount } from "./CountUpAmount";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CountUpAmount", () => {
  it("reduced motion이면 애니메이션 없이 최종 금액을 바로 보여준다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<CountUpAmount amount={1234567} />);
    expect(screen.getByText("1,234,567원")).toBeTruthy();
  });

  it("금액이 0이면 0원을 보여준다", () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    render(<CountUpAmount amount={0} />);
    expect(screen.getByText("0원")).toBeTruthy();
  });
});
