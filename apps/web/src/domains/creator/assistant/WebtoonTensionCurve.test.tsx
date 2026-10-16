// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { WebtoonTensionCurve } from "./WebtoonTensionCurve";
import { TENSION_MAP_SAMPLE_SCRIPT, buildTensionMapView } from "./webtoon-tension-map-source";
import { describeTensionPoint } from "./webtoon-tension-text";

import type { TensionMapResult } from "./webtoon-tension-map";

function sampleResult(): TensionMapResult {
  const view = buildTensionMapView({ kind: "script", script: TENSION_MAP_SAMPLE_SCRIPT, panels: [] });
  if (view.status !== "ready") throw new Error("sample script must produce a curve");
  return view.result;
}

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCurve(overrides: { selectedIndex?: number; onSelect?: (index: number) => void } = {}) {
  const result = sampleResult();
  const onSelect = overrides.onSelect ?? vi.fn();
  const utils = render(
    <WebtoonTensionCurve
      cuts={result.cuts}
      segments={result.segments}
      selectedIndex={overrides.selectedIndex ?? 4}
      onSelect={onSelect}
      describedBy="summary"
    />,
  );
  return { ...utils, result, onSelect };
}

function points(): HTMLButtonElement[] {
  return within(screen.getByTestId("tension-curve"))
    .getAllByRole("button")
    .filter((button): button is HTMLButtonElement => button instanceof HTMLButtonElement);
}

describe("WebtoonTensionCurve — structure and names", () => {
  it("draws the curve as decorative SVG and gives every cut one real button", () => {
    const { result, container } = renderCurve();
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    expect(svg?.getAttribute("focusable")).toBe("false");
    expect(svg?.querySelector("polyline")).not.toBeNull();
    expect(points()).toHaveLength(result.cuts.length);
  });

  it("is a labelled group wired to the text summary", () => {
    renderCurve();
    const group = screen.getByRole("group", { name: "컷별 긴장도 곡선" });
    expect(group.getAttribute("aria-describedby")).toBe("summary");
  });

  it("names each point with its cut number, tension and candidate kinds", () => {
    const { result } = renderCurve();
    const names = points().map((point) => point.getAttribute("aria-label"));
    expect(names[0]).toBe("컷 1, 긴장도 0.39, 늘어짐 후보");
    // 5번째 컷은 절정 후보이면서 급상승(급함 후보)의 끝이다
    expect(names[4]).toBe("컷 5, 긴장도 0.87, 절정 후보, 급함 후보");
    expect(names[5]).toBe("컷 6, 긴장도 0.34");
    expect(describeTensionPoint(result.cuts[4])).toBe(names[4]);
  });

  it("explains the dashed lines and glyphs in a legend that does not rely on colour alone", () => {
    renderCurve();
    const group = screen.getByTestId("tension-curve");
    expect(within(group).getByText("절정 후보")).toBeTruthy();
    expect(within(group).getByText("급함 후보")).toBeTruthy();
    expect(within(group).getByText("늘어짐 후보")).toBeTruthy();
    expect(within(group).getByText(/점선: 절정선 0\.7 · 늘어짐선 0\.4/)).toBeTruthy();
    expect(group.textContent).toContain("▲");
  });

  it("shows English names when the language is English", () => {
    useI18n.getState().setLang("en");
    renderCurve();
    expect(points()[4].getAttribute("aria-label")).toBe(
      "Cut 5, tension 0.87, Climax candidate, Rush candidate",
    );
    expect(screen.getByRole("group", { name: "Per-cut tension curve" })).toBeTruthy();
  });

  it("renders nothing for an empty curve and survives a single cut", () => {
    const { rerender, container } = render(
      <WebtoonTensionCurve cuts={[]} segments={[]} selectedIndex={0} onSelect={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
    const [first] = sampleResult().cuts;
    rerender(<WebtoonTensionCurve cuts={[first]} segments={[]} selectedIndex={7} onSelect={() => {}} />);
    expect(points()).toHaveLength(1);
    expect(points()[0].getAttribute("aria-pressed")).toBe("true");
  });
});

describe("WebtoonTensionCurve — selection", () => {
  it("marks exactly the selected cut as pressed and selects on click", () => {
    const { onSelect } = renderCurve({ selectedIndex: 4 });
    const pressed = points().filter((point) => point.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].getAttribute("data-tension-point")).toBe("4");
    fireEvent.click(points()[7]);
    expect(onSelect).toHaveBeenCalledWith(7);
  });

  it("clamps an out-of-range selection into the curve", () => {
    renderCurve({ selectedIndex: 99 });
    const pressed = points().filter((point) => point.getAttribute("aria-pressed") === "true");
    expect(pressed.map((point) => point.getAttribute("data-tension-point"))).toEqual(["9"]);
  });
});

describe("WebtoonTensionCurve — keyboard", () => {
  it("keeps one tab stop (roving tabindex) that starts on the selected point", () => {
    renderCurve({ selectedIndex: 4 });
    const stops = points().filter((point) => point.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute("data-tension-point")).toBe("4");
  });

  it("moves focus with the arrow keys without changing the selection", () => {
    const { onSelect } = renderCurve({ selectedIndex: 4 });
    const all = points();
    all[4].focus();
    fireEvent.keyDown(all[4], { key: "ArrowRight" });
    expect(document.activeElement).toBe(all[5]);
    expect(all[5].tabIndex).toBe(0);
    expect(all[4].tabIndex).toBe(-1);
    fireEvent.keyDown(all[5], { key: "ArrowLeft" });
    fireEvent.keyDown(all[4], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(all[3]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("jumps with Home and End and stops at both ends", () => {
    renderCurve({ selectedIndex: 4 });
    const all = points();
    all[4].focus();
    fireEvent.keyDown(all[4], { key: "End" });
    expect(document.activeElement).toBe(all[all.length - 1]);
    fireEvent.keyDown(all[all.length - 1], { key: "ArrowRight" });
    expect(document.activeElement).toBe(all[all.length - 1]);
    fireEvent.keyDown(all[all.length - 1], { key: "Home" });
    expect(document.activeElement).toBe(all[0]);
    fireEvent.keyDown(all[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(all[0]);
  });

  it("swallows handled keys so the studio's global arrow nudge cannot also fire", () => {
    // 스튜디오의 전역 단축키는 문서 수준 리스너다 — 같은 자리에 리스너를 달아 새는지 본다
    const globalHandler = vi.fn();
    document.addEventListener("keydown", globalHandler);
    try {
      renderCurve({ selectedIndex: 0 });
      const first = points()[0];
      first.focus();
      fireEvent.keyDown(first, { key: "ArrowRight" });
      fireEvent.keyDown(first, { key: "End" });
      expect(globalHandler).not.toHaveBeenCalled();
      // 처리하지 않는 키는 그대로 흘려보낸다
      fireEvent.keyDown(first, { key: "a" });
      expect(globalHandler).toHaveBeenCalledTimes(1);
    } finally {
      document.removeEventListener("keydown", globalHandler);
    }
  });

  it("follows the focused point even when focus arrives by pointer or Tab", () => {
    renderCurve({ selectedIndex: 0 });
    const all = points();
    act(() => {
      all[6].focus();
    });
    expect(all[6].tabIndex).toBe(0);
    expect(all.filter((point) => point.tabIndex === 0)).toHaveLength(1);
  });
});

describe("WebtoonTensionCurve — column width", () => {
  // jsdom 에는 레이아웃이 없어 점과 곡선이 실제로 같은 x 에 놓이는지는 여기서 볼 수 없다(실제 브라우저에서
  // 터치 390px·글자 크기 확대로 쟀다). 대신 어긋남의 원인이던 "폭을 정하는 곳이 둘" 이라는 구조를 고정한다.
  function curveWrapper(container: HTMLElement): HTMLElement {
    const wrapper = container.querySelector("svg")?.parentElement;
    if (!wrapper) throw new Error("곡선 래퍼를 찾을 수 없어요");
    return wrapper;
  }

  it("takes the wrapper's min width from the same variable the columns share, never from px", () => {
    const { container, result } = renderCurve();
    const wrapper = curveWrapper(container);
    const classes = wrapper.className.split(/\s+/);
    expect(classes).toContain("[--tension-col:2.25rem]");
    // 터치에서는 점이 44px 이상이 되게 같은 변수를 키운다 — 버튼이 아니라 변수를 키우므로 래퍼도 함께 넓어진다
    expect(classes).toContain("pointer-coarse:[--tension-col:2.75rem]");
    expect(wrapper.getAttribute("style")).toContain(
      `min-width: calc(var(--tension-col) * ${result.cuts.length})`,
    );
    expect(wrapper.getAttribute("style")).not.toMatch(/\bpx\b|\d\s*px/);
  });

  it("lets every point column share the wrapper width equally without a min width of its own", () => {
    renderCurve();
    for (const point of points()) {
      const classes = point.className.split(/\s+/);
      expect(classes).toContain("flex-1");
      // 버튼마다 자기 최소 폭(px·rem·터치 변형)을 두면 열이 래퍼보다 넓어져 곡선과 어긋난다
      expect(classes.filter((token) => /(?:^|:)min-w-/.test(token))).toEqual(["min-w-0"]);
    }
  });

  it("scales the wrapper with the cut count so a long curve scrolls instead of squeezing the points", () => {
    const { container, result, rerender } = renderCurve();
    const fewer = result.cuts.slice(0, 4);
    rerender(
      <WebtoonTensionCurve cuts={fewer} segments={[]} selectedIndex={0} onSelect={() => {}} />,
    );
    expect(curveWrapper(container).getAttribute("style")).toContain(
      "min-width: calc(var(--tension-col) * 4)",
    );
  });
});

describe("WebtoonTensionCurve — theme tokens", () => {
  it("uses only themed colour tokens, no raw palette, hex colours or OS-bound dark: variants", () => {
    const { container } = renderCurve();
    const markup = container.innerHTML;
    expect(markup).not.toMatch(
      /\b(?:bg|text|border|ring|outline|fill|stroke)-(?:emerald|amber|rose|slate|zinc|gray|neutral|stone|sky|indigo|red|green|yellow|blue|violet)-\d/,
    );
    expect(markup).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(markup).not.toContain("dark:");
  });
});
