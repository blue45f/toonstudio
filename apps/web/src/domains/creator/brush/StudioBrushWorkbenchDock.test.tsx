// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBrushWorkbenchDock } from "./StudioBrushWorkbenchDock";

afterEach(cleanup);

describe("StudioBrushWorkbenchDock", () => {
  it("44px 터치 타깃을 만족하며 잠금 토글·수정 복원·편집/확장 콜백을 정상 호출한다", () => {
    const onCollapse = vi.fn();
    const onOpenBrushStudio = vi.fn();
    const onExpandCatalog = vi.fn();
    const onToggleSizeLock = vi.fn();
    const onToggleOpacityLock = vi.fn();
    const onRestoreDefaults = vi.fn();
    const onWidthChange = vi.fn();

    const { container } = render(
      <StudioBrushWorkbenchDock
        activeBrushId="pen"
        operation="paint"
        favoriteIds={[]}
        recentIds={["pen"]}
        onSelect={vi.fn()}
        onToggleFavorite={vi.fn()}
        width={256}
        onWidthChange={onWidthChange}
        sizeLocked={false}
        opacityLocked={true}
        onToggleSizeLock={onToggleSizeLock}
        onToggleOpacityLock={onToggleOpacityLock}
        modifiedCount={3}
        onRestoreDefaults={onRestoreDefaults}
        expanded={true}
        onCollapse={onCollapse}
        onOpenBrushStudio={onOpenBrushStudio}
        onExpandCatalog={onExpandCatalog}
      />,
    );

    const dock = container.querySelector<HTMLElement>('[data-studio-brush-workbench-dock="true"]');
    expect(dock).not.toBeNull();

    fireEvent.click(screen.getByLabelText("현재 크기 유지"));
    expect(onToggleSizeLock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText("현재 불투명도 유지"));
    expect(onToggleOpacityLock).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "프리셋 복원" }));
    expect(onRestoreDefaults).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "브러시 편집" }));
    expect(onOpenBrushStudio).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "도킹 보기" }));
    expect(onExpandCatalog).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "브러시 패널 접기" }));
    expect(onCollapse).toHaveBeenCalledOnce();

    const widthInput = screen.getByLabelText("브러시 패널 너비");
    fireEvent.change(widthInput, { target: { value: "288" } });
    fireEvent.blur(widthInput);
    expect(onWidthChange).toHaveBeenCalledWith(288);

    for (const button of container.querySelectorAll<HTMLButtonElement>("button")) {
      expect(button.className).toMatch(/min-h-11|size-11/u);
    }
  });
});
