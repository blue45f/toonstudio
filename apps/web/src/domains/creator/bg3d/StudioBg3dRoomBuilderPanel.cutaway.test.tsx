// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dRoomBuilderPanel, type StudioBg3dRoomBuilderPanelProps } from "./StudioBg3dRoomBuilderPanel";
import { getStudioBg3dRoomPreset } from "./studio-bg3d-room-builder";

afterEach(cleanup);

const cafeSpec = getStudioBg3dRoomPreset("cafe")!.spec;

function renderPanel(overrides: Partial<StudioBg3dRoomBuilderPanelProps> = {}) {
  const handlers = {
    onSpecChange: vi.fn(),
    onApplyPreset: vi.fn(),
    onInsert: vi.fn(),
  };
  const view = render(<StudioBg3dRoomBuilderPanel spec={cafeSpec} {...handlers} {...overrides} />);
  return { ...handlers, ...view };
}

function cutawaySwitch(): HTMLElement | null {
  return screen.queryByRole("switch", { name: "자동 단면 (카메라 쪽 벽 숨김)" });
}

describe("StudioBg3dRoomBuilderPanel 자동 단면 토글", () => {
  it("변경 핸들러를 주지 않으면 토글을 그리지 않는다(단면을 쓰지 않는 화면)", () => {
    renderPanel();
    expect(cutawaySwitch()).toBeNull();
  });

  it("현재 켜짐·꺼짐 상태를 스위치로 보여 주고, 누르면 반대 값을 알린다", () => {
    const onAutoCutawayChange = vi.fn();
    const { rerender, ...rest } = renderPanel({ autoCutaway: false, onAutoCutawayChange });
    const off = cutawaySwitch()!;
    expect(off.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(off);
    expect(onAutoCutawayChange).toHaveBeenLastCalledWith(true);

    rerender(
      <StudioBg3dRoomBuilderPanel
        spec={cafeSpec}
        onSpecChange={rest.onSpecChange}
        onApplyPreset={rest.onApplyPreset}
        onInsert={rest.onInsert}
        autoCutaway
        onAutoCutawayChange={onAutoCutawayChange}
      />,
    );
    const on = cutawaySwitch()!;
    expect(on.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(on);
    expect(onAutoCutawayChange).toHaveBeenLastCalledWith(false);
    expect(onAutoCutawayChange).toHaveBeenCalledTimes(2);
  });

  it("토글을 눌러도 방은 추가되지 않고, 방 추가 버튼은 그대로 한 번만 부른다", () => {
    const onAutoCutawayChange = vi.fn();
    const { onInsert } = renderPanel({ autoCutaway: true, onAutoCutawayChange });
    fireEvent.click(cutawaySwitch()!);
    expect(onInsert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /방 추가/u }));
    expect(onInsert).toHaveBeenCalledTimes(1);
    // 삽입 콜백은 단면 값을 인자로 받지 않는다 — 값은 부모가 이미 알고 있다.
    expect(onInsert).toHaveBeenCalledWith();
  });

  it("비활성 상태에서는 토글도 잠긴다", () => {
    const onAutoCutawayChange = vi.fn();
    renderPanel({ disabled: true, autoCutaway: true, onAutoCutawayChange });
    const toggle = cutawaySwitch() as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    fireEvent.click(toggle);
    expect(onAutoCutawayChange).not.toHaveBeenCalled();
  });

  it("벽을 지우지 않고 숨긴다는 것과 한 번만 판단한다는 것을 설명한다", () => {
    renderPanel({ autoCutaway: true, onAutoCutawayChange: vi.fn() });
    expect(screen.getByText(/레이어 목록의 눈 아이콘으로 다시 켤 수 있어요/u)).toBeTruthy();
    expect(screen.getByText(/한 번만 판단하며/u)).toBeTruthy();
  });
});
