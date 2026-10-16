// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioCharmPopover } from "./useStudioCharmPopover";

/**
 * 팝오버 위치 갱신이 불필요한 다시 그리기를 일으키지 않는지 확인한다.
 * 선택기 안의 목록을 스크롤할 때마다 위치 계획을 새 객체로 바꾸면 바와 선택기 전체가 매번 다시 그려진다.
 */

let triggerRect = { left: 20, top: 300, right: 64, bottom: 344 };

function Harness({ onCommit }: { readonly onCommit: () => void }) {
  const popover = useStudioCharmPopover(300);
  return (
    <Profiler id="popover" onRender={onCommit}>
      <div ref={popover.triggerRef}>
        <button type="button" aria-expanded={popover.plan !== null} onClick={popover.toggle}>열기</button>
      </div>
      {popover.plan ? (
        <div data-studio-charm-popover="">
          <ul data-testid="inner-list"><li>항목</li></ul>
        </div>
      ) : null}
    </Profiler>
  );
}

function mount() {
  const onCommit = vi.fn();
  render(<Harness onCommit={onCommit} />);
  const trigger = screen.getByRole("button", { name: "열기" });
  const host = trigger.parentElement;
  if (!host) throw new Error("트리거 래퍼가 없습니다");
  host.getBoundingClientRect = () => ({ ...triggerRect, x: triggerRect.left, y: triggerRect.top, width: triggerRect.right - triggerRect.left, height: triggerRect.bottom - triggerRect.top, toJSON: () => ({}) });
  return { onCommit, trigger };
}

afterEach(() => {
  cleanup();
  triggerRect = { left: 20, top: 300, right: 64, bottom: 344 };
});

describe("참 바 팝오버 위치 갱신", () => {
  it("팝오버 안 목록의 스크롤은 위치를 다시 재지 않아 다시 그리지 않는다", () => {
    const { onCommit, trigger } = mount();
    fireEvent.click(trigger);
    const committed = onCommit.mock.calls.length;
    const list = screen.getByTestId("inner-list");
    act(() => { list.dispatchEvent(new Event("scroll")); });
    act(() => { list.dispatchEvent(new Event("scroll")); });
    expect(onCommit.mock.calls.length).toBe(committed);
  });

  it("트리거 위치가 그대로면 바깥 스크롤·창 크기 변경에도 다시 그리지 않는다", () => {
    const { onCommit, trigger } = mount();
    fireEvent.click(trigger);
    const committed = onCommit.mock.calls.length;
    act(() => { document.dispatchEvent(new Event("scroll")); });
    act(() => { window.dispatchEvent(new Event("resize")); });
    expect(onCommit.mock.calls.length).toBe(committed);
  });

  it("트리거가 실제로 움직였다면 바깥 스크롤에서 위치를 다시 계산한다", () => {
    const { onCommit, trigger } = mount();
    fireEvent.click(trigger);
    const committed = onCommit.mock.calls.length;
    triggerRect = { left: 20, top: 120, right: 64, bottom: 164 };
    act(() => { document.dispatchEvent(new Event("scroll")); });
    expect(onCommit.mock.calls.length).toBeGreaterThan(committed);
  });
});
