// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceP2pBoard } from "./StudioVirtualSpaceP2pBoard";
import type { StudioP2pBoardSnapshot } from "./studio-virtual-space-p2p-board";

const editable: StudioP2pBoardSnapshot = {
  entities: [],
  readyPeerIds: ["bob"],
  available: true,
  canEdit: true,
};

beforeEach(() => {
  Object.defineProperty(SVGElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: vi.fn(() => false),
  });
  Object.defineProperty(SVGElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: vi.fn(() => ({
      x: 0, y: 0, left: 0, top: 0, right: 1000, bottom: 600,
      width: 1000, height: 600, toJSON: () => ({}),
    })),
  });
});
afterEach(() => cleanup());

function mount(snapshot: StudioP2pBoardSnapshot = editable) {
  const onStroke = vi.fn(() => "stroke-1");
  const onNote = vi.fn(() => "note-1");
  const onRemove = vi.fn(() => true);
  const onClearOwn = vi.fn();
  render(<StrictMode><StudioVirtualSpaceP2pBoard
    snapshot={snapshot}
    selfSessionId="alice"
    onStroke={onStroke}
    onNote={onNote}
    onRemove={onRemove}
    onClearOwn={onClearOwn}
  /></StrictMode>);
  return { onStroke, onNote, onRemove, onClearOwn };
}

describe("StudioVirtualSpaceP2pBoard", () => {
  it("creates a normalized stroke and a bounded shared note", () => {
    const { onStroke, onNote } = mount();
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 100, clientY: 120 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 300, clientY: 360 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 300, clientY: 360 });
    expect(onStroke).toHaveBeenCalledWith([
      { x: .1, y: .2 },
      { x: .3, y: .6 },
    ], "#ffd166", 5);
    fireEvent.change(screen.getByPlaceholderText("공유 메모"), {
      target: { value: "검수 결정" },
    });
    fireEvent.click(screen.getByRole("button", { name: "메모 놓기" }));
    expect(onNote).toHaveBeenCalledWith(.12, .14, "검수 결정", "#ffd166");
  });

  it("긴 획의 모서리와 손을 뗀 끝점을 한 번만 전송한다", () => {
    const { onStroke } = mount();
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    const mouse = { pointerId: 3, button: 0 };
    fireEvent.pointerDown(board, { ...mouse, clientX: 10, clientY: 60 });
    for (let x = 11; x <= 600; x++) fireEvent.pointerMove(board, { ...mouse, clientX: x, clientY: 60 });
    for (let y = 61; y <= 480; y++) fireEvent.pointerMove(board, { ...mouse, clientX: 600, clientY: y });
    fireEvent.pointerUp(board, { ...mouse, clientX: 920, clientY: 480 });
    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(onStroke).toHaveBeenCalledWith(expect.arrayContaining([
      { x: .01, y: .1 }, { x: .6, y: .1 }, { x: .6, y: .8 }, { x: .92, y: .8 },
    ]), "#ffd166", 5);
  });

  it("그리던 손의 취소와 두 번째 손가락 입력이 획을 남기지 않는다", () => {
    const { onStroke } = mount();
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    for (const cancel of [fireEvent.pointerCancel, fireEvent.lostPointerCapture]) {
      fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 10, clientY: 60 });
      fireEvent.pointerMove(board, { pointerId: 1, clientX: 350, clientY: 360 });
      fireEvent.pointerDown(board, { button: 0, pointerId: 2, clientX: 800, clientY: 450 });
      fireEvent.pointerUp(board, { pointerId: 2, clientX: 850, clientY: 500 });
      cancel(board, { pointerId: 1 });
      fireEvent.pointerUp(board, { pointerId: 1, clientX: 360, clientY: 400 });
    }
    expect(onStroke).not.toHaveBeenCalled();
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 30, clientY: 60 });
    fireEvent.pointerMove(board, { pointerId: 2, clientX: 990, clientY: 550 });
    fireEvent.pointerUp(board, { pointerId: 2, clientX: 995, clientY: 550 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 250, clientY: 420 });
    expect(onStroke).toHaveBeenCalledTimes(1);
    expect(onStroke).toHaveBeenCalledWith([{ x: .03, y: .1 }, { x: .25, y: .7 }], "#ffd166", 5);
  });

  it("keeps view-only participants unable to draw or place notes", () => {
    const { onStroke, onNote } = mount({ ...editable, canEdit: false });
    const board = screen.getByRole("img", { name: "직접 그리는 공유 보드" });
    fireEvent.pointerDown(board, { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(board, { pointerId: 1, clientX: 200, clientY: 200 });
    fireEvent.pointerUp(board, { pointerId: 1, clientX: 200, clientY: 200 });
    expect(onStroke).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText("공유 메모"), {
      target: { value: "blocked" },
    });
    expect((screen.getByRole("button", { name: "메모 놓기" }) as HTMLButtonElement).disabled).toBe(true);
    expect(onNote).not.toHaveBeenCalled();
  });
});
