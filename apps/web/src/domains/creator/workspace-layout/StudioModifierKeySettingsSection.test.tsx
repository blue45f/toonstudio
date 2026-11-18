// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHelpHubDialog } from "../StudioHelpHubDialog";
import {
  STUDIO_RADIAL_MENU_PRESETS,
  normalizeStudioQuickActionsPreferences,
  quickActionOctantFromVector,
  resolveNestedRadialActionFromVector,
} from "../studio-quick-actions";

import { ShortcutCustomizer } from "./ShortcutCustomizer";
import { StudioModifierKeySettingsSection } from "./StudioModifierKeySettingsSection";

afterEach(cleanup);

describe("StudioModifierKeySettingsSection & ShortcutCustomizer 통합", () => {
  it("길게 누름 기준 시간, 일시 전환 도구, 실시간 보조키 동작 미리보기, 기본값 복원을 제어한다", () => {
    const onConfigChange = vi.fn();
    render(<StudioModifierKeySettingsSection defaultOpen onConfigChange={onConfigChange} />);

    expect(screen.getByText("보조키 일시 전환 설정")).toBeTruthy();
    expect(screen.getByRole("region", { name: "지금 누른 보조키 동작 미리보기" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "브러시 세트 순환 시험" }));
    expect(screen.getByText(/현재 도구: 펜/)).toBeTruthy();

    const slider = screen.getByLabelText("길게 누름 기준 시간 슬라이더");
    fireEvent.change(slider, { target: { value: "320" } });
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ holdThresholdMs: 320 }),
    );

    const spaceSelect = screen.getByLabelText("스페이스 길게 누를 때 도구");
    fireEvent.change(spaceSelect, { target: { value: "zoom" } });
    const updatedRules = onConfigChange.mock.calls.at(-1)![0].rules;
    expect(updatedRules.find((r: { key: string }) => r.key === "Space").holdToolId).toBe("zoom");

    fireEvent.click(screen.getByRole("button", { name: "보조키 기본값 복원" }));
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ holdThresholdMs: 200 }),
    );
  });

  it("ShortcutCustomizer 및 StudioHelpHubDialog 단축키 탭에서 도달 가능하다", async () => {
    const onModifierConfigChange = vi.fn();
    const { unmount } = render(<ShortcutCustomizer onModifierConfigChange={onModifierConfigChange} />);

    expect(screen.getByText("단축키 설정")).toBeTruthy();
    expect(screen.getByText("보조키 일시 전환 설정")).toBeTruthy();
    unmount();

    render(
      <StudioHelpHubDialog
        open
        initialTab="shortcuts"
        initialQuery=""
        toolCommandId="tool.pen"
        actions={{}}
        onOpenLegacySection={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("단축키 · 보조키 직접 바꾸기")).toBeTruthy();
    expect(await screen.findByText("보조키 일시 전환 설정")).toBeTruthy();
  });

  it("8방향(Octant) 및 2단 중첩 서브링(Nested Radial Menu) 프리셋을 해석하고 정규화한다", () => {
    expect(quickActionOctantFromVector(100, 0)).toBe("east");
    expect(quickActionOctantFromVector(-100, 0)).toBe("west");
    expect(quickActionOctantFromVector(0, -100)).toBe("north");

    const octantPreset = STUDIO_RADIAL_MENU_PRESETS.find((p) => p.id === "pro-8-octant")!;
    expect(
      resolveNestedRadialActionFromVector(100, 0, octantPreset.preferences),
    ).toEqual({ ring: "inner", action: "advanced-fill" });

    const nestedPreset = STUDIO_RADIAL_MENU_PRESETS.find((p) => p.id === "nested-subring")!;
    const roundTrip = normalizeStudioQuickActionsPreferences(
      JSON.stringify(nestedPreset.preferences),
    );
    expect(roundTrip.subRings?.south).toEqual(["wet-mix", "dodge-burn", "advanced-fill"]);
    expect(resolveNestedRadialActionFromVector(0, 90, roundTrip)).toEqual({
      ring: "inner",
      action: "pen",
    });
    expect(resolveNestedRadialActionFromVector(0, 180, roundTrip)).toEqual({
      ring: "outer",
      action: "dodge-burn",
    });
  });
});
