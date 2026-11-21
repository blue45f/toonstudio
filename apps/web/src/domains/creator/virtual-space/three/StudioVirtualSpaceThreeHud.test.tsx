// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioVirtualSpaceThreeHud } from "./StudioVirtualSpaceThreeHud";

afterEach(cleanup);

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "studio-virtual-space-three-hud.css"), "utf8");
const tsx = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "StudioVirtualSpaceThreeHud.tsx"), "utf8");

function renderHud(overrides: Partial<Parameters<typeof StudioVirtualSpaceThreeHud>[0]> = {}) {
  const onLightingPresetChange = vi.fn();
  const onResetCamera = vi.fn();
  const onCameraModeChange = vi.fn();
  const onCapturePhotoToCut = vi.fn();
  render(
    <StudioVirtualSpaceThreeHud
      overlays={[]}
      assetFailureCount={0}
      lightingPreset="studio"
      onLightingPresetChange={onLightingPresetChange}
      onResetCamera={onResetCamera}
      onTriggerTarget={vi.fn()}
      onCameraModeChange={onCameraModeChange}
      onCapturePhotoToCut={onCapturePhotoToCut}
      {...overrides}
    />,
  );
  return { onLightingPresetChange, onResetCamera, onCameraModeChange, onCapturePhotoToCut };
}

describe("StudioVirtualSpaceThreeHud 조명·시점·컷어웨이·포토부스 HUD", () => {
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

  it("카메라 모드 3종·컷어웨이 상태·포토부스 2D 컷 전송 버튼을 노출하고 동작시킨다", () => {
    const { onCameraModeChange, onCapturePhotoToCut } = renderHud({
      cameraMode: "third-person",
      cutawayHiddenCount: 2,
    });
    expect(screen.getByTestId("three-camera-mode-quarter").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("three-camera-mode-third-person").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("three-camera-mode-first-person").getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("three-camera-mode-first-person"));
    expect(onCameraModeChange).toHaveBeenCalledExactlyOnceWith("first-person");

    const cutaway = screen.getByTestId("three-hud-cutaway-state");
    expect(cutaway.getAttribute("data-cutaway-hidden-count")).toBe("2");

    fireEvent.click(screen.getByTestId("three-photo-capture-cut-btn"));
    expect(onCapturePhotoToCut).toHaveBeenCalledOnce();
  });

  it("위치는 인라인 고정 좌표가 아니라 HUD 도크 여백을 따르는 Starlight OKLCH Unslop CSS가 정한다", () => {
    renderHud();
    const group = screen.getByRole("group", { name: "조명과 시점" });
    expect(group.getAttribute("style")).toBeNull();
    expect(css).toMatch(/bottom:\s*calc\(var\(--immersive-dock-clearance, 88px\)/u);
    // 패널이 열리면 패널 왼쪽으로, 휴대폰에서는 조이스틱을 피해 왼쪽 아래로 옮긴다.
    expect(css).toMatch(/\.space-hud\[data-panel-open\]\[data-hud-layout="desktop"\] \.studio-vspace-three-lighting-hud/u);
    expect(css).toMatch(/@media \(max-width: 1023\.98px\)[\s\S]*left:\s*calc\(var\(--space-gutter, 12px\)/u);
    expect(css).not.toMatch(/right:\s*76px/u);
    // Unslop 계약: 원시 hex / rgb / glow box-shadow 0건, Starlight OKLCH 변수 + 44px 터치 타깃.
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/rgb\s*\(/iu);
    expect(css).not.toMatch(/box-shadow\s*:/iu);
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(tsx).not.toMatch(/boxShadow/u);
    expect(css).toContain("var(--surface-hud)");
    expect(css).toContain("var(--ink-primary)");
    expect(css).toContain("var(--accent-primary)");
    expect(css).toContain("var(--border-subtle)");
    expect(css).toMatch(/min-height:\s*44px/u);
  });
});
