// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useStudioCommentEditorFocus } from "./use-studio-comment-editor-focus";

it("페이지를 바꾼 뒤 회전·반전된 실제 원고 위의 핀을 가운데 놓고 다른 원고에서는 취소한다", () => {
  const wrap = document.createElement("div");
  const host = document.createElement("div");
  const rect = (left: number, top: number, width: number, height: number) => DOMRect.fromRect({ x: left, y: top, width, height });
  wrap.getBoundingClientRect = () => rect(10, 30, 300, 600);
  host.getBoundingClientRect = () => rect(30, -90, 900, 1500);
  Object.defineProperties(wrap, { clientWidth: { value: 300 }, clientHeight: { value: 600 } });
  const scroll = vi.fn();
  wrap.scrollBy = scroll;
  const select = vi.fn(() => true);
  const input = { select, wrapRef: { current: wrap }, hostRef: { current: host },
    canvasHeight: 2000, canvasFlipH: true, canvasRotation: 180 as const };
  const { result, rerender } = renderHook((props) => useStudioCommentEditorFocus({ ...input, ...props }),
    { initialProps: { open: true, documentEpoch: 3, currentPageId: "cut-1" } });
  const pin = { pageId: "cut-2", point: { x: 0.2, y: 0.7 } };
  act(() => expect(result.current.selectCommentEditorTarget(pin)).toBe(true));
  expect(select).toHaveBeenCalledWith(pin, undefined);
  expect(scroll).not.toHaveBeenCalled();
  rerender({ open: false, documentEpoch: 3, currentPageId: "cut-2" });
  expect(scroll).toHaveBeenCalledWith({ left: 50, top: 30, behavior: "instant" });
  const marker = host.querySelector<HTMLElement>("[data-studio-review-focus-marker]");
  expect(marker?.getAttribute("aria-label")).toBe("검수 의견 위치");
  expect(marker?.className).toContain("pointer-events-none");
  rerender({ open: false, documentEpoch: 3, currentPageId: "cut-1" });
  expect(host.childElementCount).toBe(0);
  rerender({ open: false, documentEpoch: 3, currentPageId: "cut-2" });
  expect(host.childElementCount).toBe(0);
  rerender({ open: true, documentEpoch: 3, currentPageId: "cut-2" });
  act(() => { result.current.selectStudioCommentAnchor({ type: "point", pageId: pin.pageId, ...pin.point }); });
  rerender({ open: false, documentEpoch: 4, currentPageId: "cut-2" });
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(host.childElementCount).toBe(0);
});
