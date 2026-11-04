// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceThreeHud } from "./StudioVirtualSpaceThreeHud";

afterEach(cleanup);

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "studio-virtual-space-three-hud.css"), "utf8");

function renderHud(overrides: Partial<Parameters<typeof StudioVirtualSpaceThreeHud>[0]> = {}) {
  const onLightingPresetChange = vi.fn();
  const onResetCamera = vi.fn();
  render(
    <StudioVirtualSpaceThreeHud
      overlays={[]}
      assetFailureCount={0}
      lightingPreset="studio"
      onLightingPresetChange={onLightingPresetChange}
      onResetCamera={onResetCamera}
      onTriggerTarget={vi.fn()}
      {...overrides}
    />,
  );
  return { onLightingPresetChange, onResetCamera };
}

describe("StudioVirtualSpaceThreeHud 조명·시점 칩", () => {
  it("조명 세 가지와 시점 리셋을 이름 있는 묶음으로 제공하고 현재 조명을 aria-pressed로 알린다", () => {
    const { onLightingPresetChange, onResetCamera } = renderHud({ lightingPreset: "night" });
    const group = screen.getByRole("group", { name: "조명과 시점" });
    expect(within(group).getByRole("button", { name: "나이트" }).getAttribute("aria-pressed")).toBe("true");
    expect(within(group).getByRole("button", { name: "스튜디오" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(within(group).getByRole("button", { name: "자연광 HDRI" }));
    expect(onLightingPresetChange).toHaveBeenCalledExactlyOnceWith("day");
    fireEvent.click(within(group).getByRole("button", { name: "시점 리셋 [C]" }));
    expect(onResetCamera).toHaveBeenCalledOnce();
  });

  it("위치는 인라인 고정 좌표가 아니라 HUD 도크 여백을 따르는 CSS가 정한다", () => {
    renderHud();
    const group = screen.getByRole("group", { name: "조명과 시점" });
    expect(group.getAttribute("style")).toBeNull();
    expect(css).toMatch(/bottom:\s*calc\(var\(--immersive-dock-clearance, 88px\)/u);
    // 패널이 열리면 패널 왼쪽으로, 휴대폰에서는 조이스틱을 피해 왼쪽 아래로 옮긴다.
    expect(css).toMatch(/\.space-hud\[data-panel-open\]\[data-hud-layout="desktop"\] \.studio-vspace-three-lighting-hud/u);
    expect(css).toMatch(/@media \(max-width: 1023\.98px\)[\s\S]*left:\s*calc\(var\(--space-gutter, 12px\)/u);
    expect(css).not.toMatch(/right:\s*76px/u);
  });
});
