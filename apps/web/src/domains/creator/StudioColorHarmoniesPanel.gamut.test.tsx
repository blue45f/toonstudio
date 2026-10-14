// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioColorHarmoniesPanel } from "./StudioColorHarmoniesPanel";
import { hexToHsv } from "./studio-color-harmony-engine";
import { getGamutMaskPreset, isHexInGamut } from "./studio-gamut-mask";

function ControlledHarmony({
  initial = "#ff0000",
  onSave = vi.fn(),
}: {
  initial?: string;
  onSave?: (name: string, colors: string[]) => void;
}) {
  const [color, setColor] = useState(initial);
  return (
    <>
      <output aria-label="현재 그리기 색">{color}</output>
      <StudioColorHarmoniesPanel value={color} onSelectColor={setColor} onSaveAsPalette={onSave} />
    </>
  );
}

function swatches() {
  return within(screen.getByRole("radiogroup", { name: "조화 배색 목록" })).getAllByRole("radio");
}

function currentColor() {
  return screen.getByLabelText("현재 그리기 색").textContent!;
}

describe("StudioColorHarmoniesPanel — gamut mask · luminosity lock · mixer", () => {
  afterEach(() => {
    cleanup();
  });

  it("clamps a harmony pick into the active gamut preset", () => {
    const warm = getGamutMaskPreset("warm-sunlight")!;
    render(<ControlledHarmony />);
    fireEvent.click(screen.getByRole("button", { name: "따뜻한 햇빛" }));
    fireEvent.click(swatches()[1]!); // complementary #00ffff, outside the warm gamut
    expect(currentColor()).not.toBe("#00ffff");
    expect(isHexInGamut(currentColor(), warm)).toBe(true);
  });

  it("offers a one-click fix when the current color sits outside the gamut", () => {
    const warm = getGamutMaskPreset("warm-sunlight")!;
    render(<ControlledHarmony initial="#00ffff" />);
    fireEvent.click(screen.getByRole("button", { name: "따뜻한 햇빛" }));
    expect(screen.getByText("현재 색이 색역 밖에 있어요.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "현재 색을 색역 안으로 맞추기" }));
    expect(isHexInGamut(currentColor(), warm)).toBe(true);
    expect(screen.queryByText("현재 색이 색역 밖에 있어요.")).toBeNull();
  });

  it("keeps the current value while picking a darker shade under luminosity lock", () => {
    render(<ControlledHarmony initial="#804040" />);
    fireEvent.click(screen.getByRole("button", { name: "명도 잠금" }));
    fireEvent.click(screen.getByRole("tab", { name: "단색 명도변형 (Mono)" }));
    const darkest = swatches()[swatches().length - 1]!;
    const darkestHex = darkest.getAttribute("aria-label")!.replace("조화 색상 ", "").replace(" 선택", "");
    fireEvent.click(darkest);
    expect(currentColor()).not.toBe(darkestHex);
    expect(Math.abs(hexToHsv(currentColor()).v - hexToHsv("#804040").v)).toBeLessThanOrEqual(1);
    expect(hexToHsv(currentColor()).s).toBeGreaterThan(hexToHsv("#804040").s);
  });

  it("renders mixer steps, applies one on click, and saves them as a palette", () => {
    const onSave = vi.fn();
    render(<ControlledHarmony onSave={onSave} />);
    const stepButtons = within(screen.getByRole("group", { name: "믹서 단계색 목록" })).getAllByRole("button");
    expect(stepButtons).toHaveLength(5);
    const firstLabel = stepButtons[0]!.getAttribute("aria-label")!;
    const firstHex = firstLabel.replace("믹서 단계색 ", "").replace(" 선택", "");
    fireEvent.click(stepButtons[0]!);
    expect(currentColor()).toBe(firstHex);
    fireEvent.click(screen.getByRole("button", { name: "믹서 단계색을 내 팔레트로 저장" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const [name, colors] = onSave.mock.calls[0]! as [string, string[]];
    expect(name).toContain("단계 믹서");
    expect(colors).toHaveLength(5);
    expect(colors.every((hex) => /^#[0-9a-f]{6}$/.test(hex))).toBe(true);
    expect(screen.getByRole("status", { name: "믹서 팔레트 저장 상태" }).textContent).toBe(
      "믹서 단계색을 내 팔레트에 저장했습니다.",
    );
  });

  it("mixer steps stay inside the active gamut and can be saved that way", () => {
    const night = getGamutMaskPreset("cool-night")!;
    const onSave = vi.fn();
    render(<ControlledHarmony onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "차가운 밤" }));
    fireEvent.click(screen.getByRole("button", { name: "믹서 단계색을 내 팔레트로 저장" }));
    const [, colors] = onSave.mock.calls[0]! as [string, string[]];
    expect(colors).toHaveLength(5);
    expect(colors.every((hex) => isHexInGamut(hex, night))).toBe(true);
  });
});
