// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorWheelOverlay } from "../StudioColorWheelOverlay";

afterEach(() => {
  cleanup();
});

describe("StudioColorWheelOverlay 좌측 레일 팝오버 & 롱프레스 원형 휠 회귀 검증", () => {
  it("center가 null일 때(좌측 레일 색상 버튼 클릭) null 반환으로 캔버스를 먹통으로 만들지 않고 색상 선택 다이얼로그를 표시한다", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <div>
        <button type="button" data-studio-rail-tool-id="color">
          <span className="studio-drawing-clarity-swatch" style={{ backgroundColor: "#7c3aed" }} />
        </button>
        <StudioColorWheelOverlay
          open
          center={null}
          colors={[]}
          onSelect={onSelect}
          onClose={onClose}
        />
      </div>,
    );

    const dialog = screen.getByRole("dialog", { name: "색상 선택" });
    expect(dialog).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "색상 #e11d48 선택" }));
    expect(onSelect).toHaveBeenCalledWith("#e11d48");

    const hexInput = dialog.querySelector<HTMLInputElement>('[data-studio-color-hex="true"]');
    expect(hexInput).not.toBeNull();
    fireEvent.change(hexInput!, { target: { value: "#2563eb" } });
    expect(onSelect).toHaveBeenCalledWith("#2563eb");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("바깥 영역 pointerdown 시 팝오버를 즉시 닫아 colorWheelOpen 고착을 방지한다", () => {
    const onClose = vi.fn();
    render(
      <div>
        <div data-testid="canvas-outside">캔버스</div>
        <StudioColorWheelOverlay
          open
          center={null}
          colors={["#111111"]}
          onSelect={vi.fn()}
          onClose={onClose}
        />
      </div>,
    );

    fireEvent.pointerDown(screen.getByTestId("canvas-outside"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("캔버스 롱프레스 모드(center != null)에서 recentColors가 비어 있어도 기본 8색 스와치 휠을 렌더링한다", () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    render(
      <StudioColorWheelOverlay
        open
        center={{ x: 320, y: 280 }}
        colors={[]}
        onSelect={onSelect}
        onClose={onClose}
      />,
    );

    const menu = screen.getByRole("menu", { name: "최근 사용 색 빠른 선택" });
    expect(menu).toBeTruthy();
    expect(screen.getAllByRole("menuitem").length).toBeGreaterThanOrEqual(8);
  });
});
