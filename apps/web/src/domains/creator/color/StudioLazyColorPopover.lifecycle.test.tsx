// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorWorkspaceProvider } from "./StudioColorWorkspaceContext";
import { LazyStudioColorPopover } from "../StudioLazyColorPopover";

vi.mock("../studio-page-lazy-ui", async () => {
  const { StudioColorPopover } = await import("../StudioColorPopover");
  return { StudioColorPopoverContent: StudioColorPopover, preloadStudioColorPopover: vi.fn() };
});
vi.mock("../StudioPaletteLibraryPanel", () => ({
  StudioPaletteLibraryPanel: () => <div>내 팔레트 저장소</div>,
}));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function surface(ownerKey: string, onChange: (color: string) => void) {
  return (
    <StudioColorWorkspaceProvider value={{
      ownerKey, selectionKey: "none", primary: "#123456", secondary: "#ffffff", elements: [],
      pinned: false, isMobile: false, onPrimaryChange: onChange, onSecondaryChange: vi.fn(),
      onPinnedChange: vi.fn(), onRevealDock: vi.fn(), onBeforePopupOpen: vi.fn(),
    }}>
      <LazyStudioColorPopover
        value="#123456" onChange={onChange} recentColors={[]} label="주 색"
        purpose="brush-shape" targetKey="primary"
      />
    </StudioColorWorkspaceProvider>
  );
}

describe("지연 색상 창의 페이지 소유권", () => {
  it.each(["apply", "cancel", "escape"] as const)("%s로 닫은 창은 다른 페이지를 거쳐 돌아와도 다시 열리지 않는다", (mode) => {
    const onChange = vi.fn();
    const view = render(surface("page-two", onChange));
    fireEvent.click(screen.getByRole("button", { name: "주 색" }));
    const input = screen.getByRole("textbox", { name: "헥스 색상 코드" });
    fireEvent.change(input, { target: { value: "#abcdef" } });
    if (mode === "apply") fireEvent.click(screen.getByRole("button", { name: "색상 적용" }));
    else if (mode === "cancel") fireEvent.click(screen.getByRole("button", { name: "취소" }));
    else fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "주 색 선택" })).toBeNull();

    view.rerender(surface("page-one", onChange));
    expect(screen.queryByRole("dialog", { name: "주 색 선택" })).toBeNull();
    view.rerender(surface("page-two", onChange));
    expect(screen.queryByRole("dialog", { name: "주 색 선택" })).toBeNull();
    expect(onChange).toHaveBeenCalledTimes(mode === "apply" ? 1 : 0);
    if (mode === "apply") expect(onChange).toHaveBeenCalledWith("#abcdef");

    fireEvent.click(screen.getByRole("button", { name: "주 색" }));
    expect(screen.getByRole("dialog", { name: "주 색 선택" })).toBeTruthy();
  });
});
