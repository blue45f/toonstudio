// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { StudioCameraPanStore } from "../studio-virtual-space-camera-pan";
import { SpaceCameraChip } from "./SpaceCameraChip";

afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

describe("시점 안내 칩", () => {
  it("시점을 옮기지 않았거나 둘러볼 수 없는 장소에서는 그리지 않는다", () => {
    const store = new StudioCameraPanStore();
    const { container } = render(<SpaceCameraChip store={store} />);
    expect(container.innerHTML).toBe("");
    act(() => { store.setPanned(true); store.setAvailable(false); });
    expect(container.innerHTML).toBe("");
  });

  it("시점을 옮기면 나타나고, 눌러서 내 위치로 돌아오게 하면 사라질 수 있다", () => {
    const store = new StudioCameraPanStore();
    render(<SpaceCameraChip store={store} />);
    act(() => { store.setPanned(true); });
    const chip = screen.getByRole("button", { name: /시점을 옮겼어요/u });
    expect(chip.getAttribute("aria-keyshortcuts")).toBe("L");
    fireEvent.click(chip);
    expect(store.consumeRecenter()).toBe(true);
    act(() => { store.setPanned(false); });
    expect(screen.queryByRole("button", { name: /시점을 옮겼어요/u })).toBeNull();
  });

  it("마우스·터치로 누르면 키보드 초점을 월드로 돌리고, 키보드(Enter·Space)로 활성화하면 초점을 그대로 둔다", () => {
    const store = new StudioCameraPanStore();
    const onPointerUse = vi.fn();
    render(<SpaceCameraChip store={store} onPointerUse={onPointerUse} />);
    act(() => { store.setPanned(true); });
    const chip = screen.getByRole("button", { name: /시점을 옮겼어요/u });
    fireEvent.click(chip, { detail: 0 });
    expect(onPointerUse).not.toHaveBeenCalled();
    fireEvent.click(chip, { detail: 1 });
    expect(onPointerUse).toHaveBeenCalledOnce();
  });

  it("영어에서는 영어 문구와 도움말 이름을 쓴다", () => {
    useI18n.getState().setLang("en");
    const store = new StudioCameraPanStore();
    render(<SpaceCameraChip store={store} />);
    act(() => { store.setPanned(true); });
    const chip = screen.getByRole("button", { name: "Looking around · back to me (L)" });
    expect(chip.getAttribute("title")).toBe("Back to my avatar (L)");
  });
});
