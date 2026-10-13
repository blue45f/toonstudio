// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePlacedFixturePanel } from "./StudioVirtualSpacePlacedFixturePanel";
import type { StudioBuildPlacementPanelBinding } from "./studio-virtual-space-build-placement";
import {
  studioVirtualDecorationPreset,
  type StudioVirtualDecorationState,
} from "./studio-virtual-space-customization";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

const world = { ...studioVirtualPlaceWorldManifest("skyport", true), colliders: [], props: [], portals: [], npcs: [], interactions: [], interactionSlots: [] };
const emptyDecorations: StudioVirtualDecorationState = { ...studioVirtualDecorationPreset("minimal"), placements: [] };
const selfPoint = { x: 480, y: 320 };

function binding(patch: Partial<StudioBuildPlacementPanelBinding> = {}): StudioBuildPlacementPanelBinding {
  return {
    sessionEntryId: null,
    statusText: null,
    noticeText: null,
    onStart: vi.fn(),
    onCancel: vi.fn(),
    ...patch,
  };
}

function renderPanel(directPlacement?: StudioBuildPlacementPanelBinding) {
  return render(<StudioVirtualSpacePlacedFixturePanel
    world={world}
    decorations={emptyDecorations}
    selfPoint={selfPoint}
    requests={[]}
    onRequestsChange={vi.fn()}
    directPlacement={directPlacement}
  />);
}

describe("StudioVirtualSpacePlacedFixturePanel 지도 직접 배치", () => {
  it("바인딩이 없으면 직접 배치 버튼을 그리지 않는다(기존 동작 유지)", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "플로어 램프 지도에서 배치" })).toBeNull();
    expect(screen.getByRole("button", { name: "플로어 램프 배치" })).toBeTruthy();
  });

  it("지도에서 배치 버튼을 누르면 세션 시작 콜백에 항목 id가 간다", () => {
    const direct = binding();
    renderPanel(direct);
    fireEvent.click(screen.getByRole("button", { name: "플로어 램프 지도에서 배치" }));
    expect(direct.onStart).toHaveBeenCalledWith("furniture:floor-lamp");
  });

  it("세션 중에는 해당 항목이 눌린 상태가 되고 판정 안내와 취소 버튼이 보인다", () => {
    const direct = binding({
      sessionEntryId: "furniture:floor-lamp",
      statusText: { ko: "놓을 수 있는 지점이에요.", en: "You can place it here." },
      noticeText: { ko: "다른 가구와 너무 가까워요.", en: "Too close." },
    });
    renderPanel(direct);
    const toggle = screen.getByRole("button", { name: "플로어 램프 지도에서 배치" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/방향키로 고스트를 옮기고/)).toBeTruthy();
    expect(screen.getByText("놓을 수 있는 지점이에요.")).toBeTruthy();
    expect(screen.getByText("다른 가구와 너무 가까워요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "배치 취소" }));
    expect(direct.onCancel).toHaveBeenCalledTimes(1);
  });

  it("세션 중인 항목 버튼을 다시 누르면 취소로 이어진다", () => {
    const direct = binding({ sessionEntryId: "furniture:floor-lamp" });
    renderPanel(direct);
    fireEvent.click(screen.getByRole("button", { name: "플로어 램프 지도에서 배치" }));
    expect(direct.onCancel).toHaveBeenCalledTimes(1);
    expect(direct.onStart).not.toHaveBeenCalled();
  });
});
