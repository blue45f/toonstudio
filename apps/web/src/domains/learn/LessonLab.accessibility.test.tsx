// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LessonDiagram, LessonLab } from "./LessonLab";
import { LAB_CONFIGS } from "./learning-lab-state";

const KINDS = ["pacing", "perspective", "strokes", "layers", "lettering", "values"] as const;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("learning diagram keyboard access", () => {
  it.each(KINDS)("keeps the named %s scroll viewport focusable without autoplay", (kind) => {
    render(<MemoryRouter initialEntries={["/learn/lessons/camera-perspective"]}><LessonLab kind={kind} /></MemoryRouter>);

    // JSDOM verifies the DOM/focus contract, not native scrolling or rendered pixels.
    const viewport = screen.getByRole("region", { name: /^개념 (비교|설명) 도식/u });
    expect(viewport.getAttribute("tabindex")).toBe("0");
    viewport.focus();
    expect(document.activeElement).toBe(viewport);
    expect(within(viewport).getByRole("img").getAttribute("aria-labelledby")).toBeTruthy();
    expect(screen.getByRole("button", { name: "설명 재생" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "일시정지" })).toBeNull();
  });

  it.each(KINDS)("%s 도식의 SSR 제목을 단일 텍스트로 렌더링한다", (kind) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const markup = renderToStaticMarkup(<LessonDiagram kind={kind} value={LAB_CONFIGS[kind].initial} frame={100} />);
      expect(markup).toContain(`${LAB_CONFIGS[kind].title} · 전체 보기</title>`);
      expect(error).not.toHaveBeenCalled();
    } finally { error.mockRestore(); }
  });

  it("예제를 숨기면 진행 중인 설명 재생과 예약된 프레임을 중지한다", () => {
    const cancel = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
    vi.stubGlobal("requestAnimationFrame", () => 73);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const result = render(<MemoryRouter><LessonLab kind="pacing" active /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "설명 재생" }));
    expect(screen.getByRole("button", { name: "일시정지" })).toBeTruthy();
    result.rerender(<MemoryRouter><LessonLab kind="pacing" active={false} /></MemoryRouter>);
    expect(screen.getByRole("button", { name: "설명 재생" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "일시정지" })).toBeNull();
    expect(cancel).toHaveBeenCalledWith(73);
  });
});
