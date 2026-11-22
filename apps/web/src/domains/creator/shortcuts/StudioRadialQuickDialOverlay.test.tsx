// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioRadialQuickDialOverlay } from "./StudioRadialQuickDialOverlay";

afterEach(cleanup);

describe("StudioRadialQuickDialOverlay", () => {
  it("닫혀 있을 때는 렌더링하지 않고, 열리면 8개 섹터(44px 타깃·reduced-motion)와 5개 상황 탭을 렌더링한다", () => {
    const { rerender } = render(
      <StudioRadialQuickDialOverlay
        open={false}
        contextId="drawing"
        onSelectAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole("menu")).toBeNull();

    rerender(
      <StudioRadialQuickDialOverlay
        open
        contextId="drawing"
        anchor={{ x: 500, y: 400 }}
        onSelectAction={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const menu = screen.getByRole("menu", { name: "상황별 8방향 퀵 다이얼 · 드로잉" });
    expect(menu.getAttribute("data-radial-dial-deadzone")).toBe("18");
    expect(menu.className).toContain("motion-reduce:transition-none");

    const items = screen.getAllByRole("menuitem");
    expect(items).toHaveLength(8);
    for (const item of items) {
      expect(item.className).toContain("size-11");
      expect(item.className).toContain("motion-reduce:transition-none");
    }

    expect(screen.getByRole("button", { name: "드로잉" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "선화" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "3D 배경" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "식자" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "검수" })).toBeTruthy();
  });

  it("18px 데드존 및 히스테리시스를 적용한 포인터 드래그로 8방향 섹터를 선택·실행한다", () => {
    const onSelectAction = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioRadialQuickDialOverlay
        open
        contextId="drawing"
        anchor={{ x: 400, y: 400 }}
        onSelectAction={onSelectAction}
        onClose={onClose}
      />,
    );

    const menu = screen.getByRole("menu");
    vi.spyOn(menu, "getBoundingClientRect").mockReturnValue({
      left: 276,
      top: 276,
      width: 248,
      height: 248,
      right: 524,
      bottom: 524,
      x: 276,
      y: 276,
      toJSON: () => ({}),
    });

    // 중심(400, 400)에서 12px만 이동 → 18px 데드존 안쪽이므로 미선택
    fireEvent.pointerDown(menu, { clientX: 400, clientY: 400 });
    fireEvent.pointerMove(menu, { clientX: 412, clientY: 400 });
    expect(menu.getAttribute("data-radial-dial-active-action")).toBe("");

    // 동쪽(3시 방향, dx=+60, dy=0)으로 이동 → 2번 섹터(E · tool-fill) 선택
    fireEvent.pointerMove(menu, { clientX: 460, clientY: 400 });
    expect(menu.getAttribute("data-radial-dial-active-direction")).toBe("E");
    expect(menu.getAttribute("data-radial-dial-active-action")).toBe("tool-fill");

    // 놓으면 즉시 실행 후 닫힘
    fireEvent.pointerUp(menu, { clientX: 460, clientY: 400 });
    expect(onSelectAction).toHaveBeenCalledWith(
      "tool-fill",
      expect.objectContaining({ index: 2, direction: "E" }),
      "drawing",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("숫자키 1~8·화살표·Enter·Esc 키보드 접근성과 상황별 프리셋 전환을 지원한다", () => {
    const onSelectAction = vi.fn();
    const onClose = vi.fn();

    render(
      <StudioRadialQuickDialOverlay
        open
        contextId="drawing"
        anchor={{ x: 500, y: 400 }}
        onSelectAction={onSelectAction}
        onClose={onClose}
      />,
    );

    // 상황 전환: 식자(lettering) 프리셋으로 전환
    fireEvent.click(screen.getByRole("button", { name: "식자" }));
    expect(screen.getByRole("menu", { name: "상황별 8방향 퀵 다이얼 · 식자" })).toBeTruthy();

    // 숫자 6 → lettering 6번 슬롯(말풍선 넘침 점검) 즉시 실행
    fireEvent.keyDown(window, { key: "6" });
    expect(onSelectAction).toHaveBeenLastCalledWith(
      "lettering-overflow-check",
      expect.objectContaining({ index: 5, direction: "SW" }),
      "lettering",
    );
    expect(onClose).toHaveBeenCalledTimes(1);

    // 화살표 이동 + Enter 확정
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onSelectAction).toHaveBeenLastCalledWith(
      "lettering-batch-edit",
      expect.objectContaining({ index: 1, direction: "NE" }),
      "lettering",
    );

    // Esc 닫기
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("인라인 슬롯 편집 모드에서 8방향 슬롯 액션을 교체하고 기본값으로 복원한다", () => {
    const onContextSlotsChange = vi.fn();

    render(
      <StudioRadialQuickDialOverlay
        open
        contextId="inking"
        anchor={{ x: 500, y: 400 }}
        onSelectAction={vi.fn()}
        onContextSlotsChange={onContextSlotsChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "8방향 슬롯 편집" }));
    expect(screen.getByRole("region", { name: "선화 8방향 슬롯 편집" })).toBeTruthy();

    // 3번 슬롯(E · 현재 스트로크 교정) 선택 후 "지우개"로 교체
    fireEvent.click(screen.getByRole("menuitem", { name: /3\. 현재 스트로크 교정/ }));
    fireEvent.click(screen.getByRole("button", { name: "지우개" }));

    const updated = onContextSlotsChange.mock.calls.at(-1)?.[0];
    expect(updated.inking[2]).toBe("tool-eraser");

    // 기본값 복원
    fireEvent.click(screen.getByRole("button", { name: "기본값" }));
    const reset = onContextSlotsChange.mock.calls.at(-1)?.[0];
    expect(reset.inking[2]).toBe("correct-current-stroke");
  });
});
