// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useStudioHandNavigation } from "./useStudioHandNavigation";

type MenuOptions = Pick<Parameters<typeof useStudioHandNavigation>[0], "rightButtonAction" | "openViewportMenu">;

function Viewport(options: MenuOptions) {
  const ref = useRef<HTMLDivElement>(null);
  useStudioHandNavigation({
    viewportRef: ref, handToolActive: false, temporaryHandActive: false,
    middleButtonAction: "pan", touchOneFingerMode: "draw", ...options,
  });
  return <div ref={ref} role="group" aria-label="원고"><button type="button">도구</button></div>;
}

afterEach(cleanup);

it("뷰포트 여백의 우클릭만 처리하고 내부 도구와 문서의 이벤트는 넘긴다", () => {
  const open = vi.fn();
  render(<Viewport rightButtonAction="context" openViewportMenu={open} />);
  const viewport = screen.getByRole("group");
  const tool = screen.getByRole("button");
  expect(fireEvent.contextMenu(tool)).toBe(true);
  expect(fireEvent.keyDown(tool, { key: "F10", shiftKey: true })).toBe(true);
  expect(open).not.toHaveBeenCalled();
  expect(fireEvent.contextMenu(viewport, { clientX: 1430, clientY: 950 })).toBe(false);
  expect(open).toHaveBeenCalledExactlyOnceWith(1430, 950, "pointer");
});

it("포커스된 뷰포트의 메뉴 키는 마우스 버튼 설정과 독립적이며 편집 차단을 존중한다", () => {
  const open = vi.fn();
  const view = render(<Viewport rightButtonAction="pan" openViewportMenu={open} />);
  const viewport = screen.getByRole("group");
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue(new DOMRect(30, 100, 800, 600));
  expect(fireEvent.contextMenu(viewport)).toBe(true);
  expect(fireEvent.keyDown(viewport, { key: "F10", shiftKey: true })).toBe(false);
  expect(fireEvent.keyDown(viewport, { key: "ContextMenu" })).toBe(false);
  expect(open.mock.calls).toEqual([[430, 400, "keyboard"], [430, 400, "keyboard"]]);
  view.rerender(<Viewport rightButtonAction="context" />);
  expect(fireEvent.contextMenu(viewport)).toBe(true);
  expect(fireEvent.keyDown(viewport, { key: "F10", shiftKey: true })).toBe(true);
  expect(open).toHaveBeenCalledTimes(2);
});
