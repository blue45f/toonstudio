// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioRadialQuickWheel } from "./StudioRadialQuickWheel";

afterEach(cleanup);

describe("StudioRadialQuickWheel", () => {
  it("닫혀 있을 때는 렌더링하지 않고, 열리면 6개 섹터 메뉴를 184×184px로 렌더링한다", () => {
    const { rerender } = render(
      <StudioRadialQuickWheel open={false} onSelectAction={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("menu")).toBeNull();

    rerender(
      <StudioRadialQuickWheel open anchor={{ x: 500, y: 400 }} onSelectAction={vi.fn()} onClose={vi.fn()} />,
    );
    const menu = screen.getByRole("menu", { name: "빠른 도구 방사형 휠" });
    expect(menu.style.width).toBe("184px");
    expect(menu.style.height).toBe("184px");
    expect(screen.getAllByRole("menuitem")).toHaveLength(6);
  });

  it("숫자키 1~6과 Esc 단축키로 즉시 실행하거나 닫는다", () => {
    const onSelectAction = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioRadialQuickWheel open anchor={{ x: 500, y: 400 }} onSelectAction={onSelectAction} onClose={onClose} />,
    );

    fireEvent.keyDown(window, { key: "2" });
    expect(onSelectAction).toHaveBeenCalledWith(
      "flip-canvas-h",
      expect.objectContaining({ index: 1, actionId: "flip-canvas-h" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("24px 데드존 밖으로 드래그 후 놓으면 해당 방향 섹터 동작을 실행한다", () => {
    const onSelectAction = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioRadialQuickWheel open anchor={{ x: 400, y: 400 }} onSelectAction={onSelectAction} onClose={onClose} />,
    );

    const menu = screen.getByRole("menu", { name: "빠른 도구 방사형 휠" });
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({
      left: 308,
      top: 308,
      width: 184,
      height: 184,
      right: 492,
      bottom: 492,
      x: 308,
      y: 308,
      toJSON: () => ({}),
    });

    // 중심(400, 400)에서 12시 방향(dx=0, dy=-52) 드래그 → 0번 슬롯(undo)
    fireEvent.pointerDown(menu, { clientX: 400, clientY: 400 });
    fireEvent.pointerMove(menu, { clientX: 400, clientY: 348 });
    expect(menu.getAttribute("data-active-slot")).toBe("undo");

    fireEvent.pointerUp(menu, { clientX: 400, clientY: 348 });
    expect(onSelectAction).toHaveBeenCalledWith(
      "undo",
      expect.objectContaining({ index: 0, actionId: "undo" }),
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("T2: 6슬롯 커스텀 편집 모드에서 assignQuickMenuSlot으로 액션을 교체하고 로컬 저장소에 보존한다", () => {
    window.localStorage.clear();
    const onSlotsChange = vi.fn();

    render(
      <StudioRadialQuickWheel
        open
        anchor={{ x: 500, y: 400 }}
        onSelectAction={vi.fn()}
        onSlotsChange={onSlotsChange}
        onClose={vi.fn()}
      />,
    );

    // 슬롯 편집 모드 열기
    fireEvent.click(screen.getByRole("button", { name: "슬롯 편집" }));
    expect(screen.getByRole("region", { name: "빠른 메뉴 6슬롯 편집" })).toBeTruthy();

    // 2번 슬롯(index=1, 기본 좌우 반전) 선택 후 스포이드로 교체
    fireEvent.click(screen.getByRole("menuitem", { name: /2\. 좌우 반전/ }));
    fireEvent.click(screen.getByRole("button", { name: "스포이드" }));

    expect(onSlotsChange).toHaveBeenCalled();
    const updatedSlots = onSlotsChange.mock.calls.at(-1)?.[0];
    expect(updatedSlots[1]).toEqual(
      expect.objectContaining({ index: 1, actionId: "eyedropper", labelKo: "스포이드" }),
    );
    expect(window.localStorage.getItem("toonstudio.quick-menu-slots.v1")).toContain("eyedropper");

    // 기본값 복원
    fireEvent.click(screen.getByRole("button", { name: "기본값" }));
    const resetSlots = onSlotsChange.mock.calls.at(-1)?.[0];
    expect(resetSlots[1]).toEqual(expect.objectContaining({ index: 1, actionId: "flip-canvas-h" }));
  });
});
