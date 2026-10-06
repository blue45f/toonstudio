// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudioVirtualSpacePlacedFixturePanel } from "./StudioVirtualSpacePlacedFixturePanel";
import type { StudioBuildPlacementRequest } from "./studio-virtual-space-build-mode";
import { studioBuildPlacedFixture } from "./studio-virtual-space-build-mode-vitality";
import { studioVirtualDecorationPreset, type StudioVirtualDecorationState } from "./studio-virtual-space-customization";
import { STUDIO_PLACED_FIXTURE_LIMIT } from "./studio-virtual-space-placed-fixtures";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";

const world = { ...studioVirtualPlaceWorldManifest("skyport", true), colliders: [], props: [], portals: [], npcs: [], interactions: [], interactionSlots: [] };
const emptyDecorations: StudioVirtualDecorationState = { ...studioVirtualDecorationPreset("minimal"), placements: [] };
const SELF = { x: 480, y: 320 };

function renderPanel(requests: readonly StudioBuildPlacementRequest[] = [], onRequestsChange = vi.fn()) {
  render(<StudioVirtualSpacePlacedFixturePanel world={world} decorations={emptyDecorations} selfPoint={SELF}
    requests={requests} onRequestsChange={onRequestsChange} />);
  return onRequestsChange;
}

describe("StudioVirtualSpacePlacedFixturePanel", () => {
  it("고정물 층에 닿는 가구만 배치 항목으로 보이고, 커피 머신은 보이지 않는다", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "플로어 램프 배치" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "화이트보드 배치" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "대형 스크린 배치" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "네온 사인 배치" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /커피 머신/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /소파/ })).toBeNull();
    // 고스트 미리보기 대표 상태가 배지로 붙는다.
    expect(screen.getByRole("button", { name: "플로어 램프 배치" }).textContent).toContain("● 켜짐");
  });

  it("항목을 고르면 내 주변 격자 지점에 배치 요청이 생기고, 그 요청은 고정물 디스크립터를 만든다", () => {
    const onRequestsChange = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "플로어 램프 배치" }));
    expect(onRequestsChange).toHaveBeenCalledTimes(1);
    const next = onRequestsChange.mock.calls[0]?.[0] as StudioBuildPlacementRequest[];
    expect(next).toHaveLength(1);
    const request = next[0] as StudioBuildPlacementRequest;
    expect(request).toMatchObject({ entryId: "furniture:floor-lamp", category: "furniture", refId: "floor-lamp", rotation: 0 });
    expect(request.point).not.toEqual(SELF);
    expect(request.point.x % 16).toBe(0);
    expect(request.point.y % 16).toBe(0);
    // 생산자가 만든 요청이 실제로 fx 동기화 입력(디스크립터)으로 이어진다.
    expect(studioBuildPlacedFixture(request)?.objectId).toBe(`build:floor-lamp@${request.point.x},${request.point.y}`);
  });

  it("배치된 가구는 목록에서 치울 수 있다", () => {
    const existing: StudioBuildPlacementRequest = {
      entryId: "furniture:floor-lamp", category: "furniture", refId: "floor-lamp", point: { x: 496, y: 320 }, rotation: 0,
    };
    const onRequestsChange = renderPanel([existing]);
    expect(screen.getByText(/1 \/ 24개 배치됨/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "플로어 램프 치우기" }));
    expect(onRequestsChange).toHaveBeenCalledWith([]);
  });

  it("상한에 닿으면 배치 버튼이 비활성화된다", () => {
    const full: StudioBuildPlacementRequest[] = Array.from({ length: STUDIO_PLACED_FIXTURE_LIMIT }, (_, index) => ({
      entryId: "furniture:floor-lamp", category: "furniture", refId: "floor-lamp",
      point: { x: 64 + index * 32, y: 96 }, rotation: 0,
    }));
    renderPanel(full);
    expect((screen.getByRole("button", { name: "플로어 램프 배치" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
