// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRevealOnChange } from "./use-reveal-on-change";

function Probe({ revealKey, withTarget = true }: { readonly revealKey: unknown; readonly withTarget?: boolean }) {
  const ref = useRevealOnChange<HTMLDivElement>(revealKey);
  return withTarget ? <div ref={ref} data-testid="target" /> : null;
}

describe("useRevealOnChange", () => {
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    scrollIntoView.mockReset();
    Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, writable: true, value: scrollIntoView });
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  });

  it("처음에는(표식이 0이면) 움직이지 않고, 표식이 바뀔 때마다 영역 시작으로 한 번 움직인다", () => {
    const { rerender } = render(<Probe revealKey={0} />);
    expect(scrollIntoView).not.toHaveBeenCalled();

    rerender(<Probe revealKey={1} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ block: "start", behavior: "smooth" });

    rerender(<Probe revealKey={1} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(<Probe revealKey={2} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("움직임을 줄이는 설정이면 부드러운 스크롤 없이 바로 옮긴다", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("prefers-reduced-motion"), media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    const { rerender } = render(<Probe revealKey={0} />);

    rerender(<Probe revealKey={1} />);

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start", behavior: "auto" });
  });

  it("대상 요소가 없거나 scrollIntoView를 지원하지 않는 환경에서도 오류 없이 지나간다", () => {
    const { rerender } = render(<Probe revealKey={0} withTarget={false} />);
    expect(() => act(() => rerender(<Probe revealKey={1} withTarget={false} />))).not.toThrow();

    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    const view = render(<Probe revealKey={0} />);
    expect(() => act(() => view.rerender(<Probe revealKey={1} />))).not.toThrow();
  });
});
