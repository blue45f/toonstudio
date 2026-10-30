// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dBlenderFantasyWebtoonPanel } from "./StudioBg3dBlenderFantasyWebtoonPanel";

describe("StudioBg3dBlenderFantasyWebtoonPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("실제 웹 모델링 작업대 경로를 안내하고 비활성 상태에서는 이동을 막는다", () => {
    const { rerender } = render(<StudioBg3dBlenderFantasyWebtoonPanel />);
    const link = screen.getByRole("link", { name: "3D 모델링 작업대로 이동" });
    expect(link.getAttribute("href")).toBe("/studio/3d/dcc/model");
    expect(link.hasAttribute("aria-disabled")).toBe(false);
    expect(screen.getByLabelText("웹 모델링 작업대").textContent).toContain("설정 검토와 배경 프리셋");

    rerender(<StudioBg3dBlenderFantasyWebtoonPanel disabled />);
    expect(link.getAttribute("aria-disabled")).toBe("true");
    expect(fireEvent.click(link)).toBe(false);
  });

  it("renders all 5 Blender 5.2 fantasy webtoon sections and invokes callbacks on interaction", () => {
    const onApplyLightingRig = vi.fn();
    const onApplyNprShader = vi.fn();
    const onApplyFreestyleInk = vi.fn();
    const onApplyWeaponRig = vi.fn();
    const onApplyMonsterIk = vi.fn();
    const onSimulateCrowd = vi.fn();

    render(
      <StudioBg3dBlenderFantasyWebtoonPanel
        onApplyLightingRig={onApplyLightingRig}
        onApplyNprShader={onApplyNprShader}
        onApplyFreestyleInk={onApplyFreestyleInk}
        onApplyWeaponRig={onApplyWeaponRig}
        onApplyMonsterIk={onApplyMonsterIk}
        onSimulateCrowd={onSimulateCrowd}
      />,
    );

    expect(screen.getByTestId("bg3d-blender-fantasy-webtoon-panel")).toBeTruthy();
    expect(screen.getByTestId("bg3d-blender-summary-badge").textContent).toContain(
      "어검 12자루",
    );

    // 1. EEVEE 광원 리그 및 Kelvin 슬라이더 조작
    fireEvent.click(
      screen.getByTestId("bg3d-blender-light-rig-holy-sword-awakening-halo"),
    );
    expect(onApplyLightingRig).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId("bg3d-blender-kelvin-slider"), {
      target: { value: "2400" },
    });
    expect(
      screen.getByTestId("bg3d-blender-eevee-lighting-section").textContent,
    ).toContain("2400K");

    // 2. NPR ShaderNodeTree & Freestyle 선화 프리셋 선택
    fireEvent.click(
      screen.getByTestId("bg3d-blender-npr-shader-arcane-mana-crystal-gem"),
    );
    expect(onApplyNprShader).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByTestId("bg3d-blender-freestyle-arcane-blueprint-xray-lineart"),
    );
    expect(onApplyFreestyleInk).toHaveBeenCalledTimes(1);
    expect(
      screen.getByTestId("bg3d-blender-freestyle-readout").textContent,
    ).toContain("추출 3선분");

    // 3. 판타지 무기 포지 & 소켓/각성 슬라이더
    fireEvent.click(
      screen.getByTestId("bg3d-blender-weapon-imperial-holy-greatsword"),
    );
    expect(onApplyWeaponRig).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByTestId("bg3d-blender-weapon-socket-back-sheath"),
    );
    fireEvent.change(
      screen.getByTestId("bg3d-blender-weapon-awakening-slider"),
      { target: { value: "1" } },
    );
    expect(
      screen.getByTestId("bg3d-blender-weapon-forge-section").textContent,
    ).toContain("100%");

    // 4. 몬스터 다관절 iTaSC IK 및 포즈 전환
    fireEvent.click(
      screen.getByTestId("bg3d-blender-monster-abyssal-arachnid-queen"),
    );
    expect(onApplyMonsterIk).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByTestId("bg3d-blender-monster-pose-wing-buffet-breath"),
    );
    expect(onApplyMonsterIk).toHaveBeenCalledTimes(2);

    // 5. GeometryNodes & BoidBrain 대규모 군단
    fireEvent.click(
      screen.getByTestId("bg3d-blender-crowd-royal-paladin-phalanx-march"),
    );
    expect(onSimulateCrowd).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByTestId("bg3d-blender-crowd-count-slider"), {
      target: { value: "240" },
    });
    expect(
      screen.getByTestId("bg3d-blender-crowd-readout").textContent,
    ).toContain("240기");
  });
});
