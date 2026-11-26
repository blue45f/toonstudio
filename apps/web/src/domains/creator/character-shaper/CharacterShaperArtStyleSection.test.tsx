// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CharacterShaperArtStyleSection } from "./CharacterShaperArtStyleSection";
import { CharacterShaperSessionSettingsProvider } from "./CharacterShaperSessionSettingsProvider";
import { useCharacterShaperMaterialSettings } from "./character-shaper-session-settings";

import type { CharacterShaperBinding } from "./character-shaper-ui-contract";

afterEach(cleanup);

function makeBinding(overrides?: Partial<CharacterShaperBinding["recipe"]["colors"]>): CharacterShaperBinding {
  return {
    recipe: {
      version: 1,
      slots: {
        "face-shape": null,
        eyes: null,
        irises: null,
        nose: null,
        mouth: null,
        ears: null,
        hair: null,
        body: null,
        top: null,
        bottom: null,
        shoes: null,
        accessory: [],
        expression: null,
        pose: null,
        "hand-pose": null,
      },
      colors: {
        skin: "#f3d3bd",
        hairBase: "#2b1d16",
        hairTip: null,
        iris: "#3a5a8c",
        top: "#4e6b8a",
        bottom: "#2a303c",
        shoes: "#1e1e22",
        ...overrides,
      },
      handSide: "both",
    },
    commitColor: vi.fn(),
  } as unknown as CharacterShaperBinding;
}

function MaterialObserver() {
  const { shaperMaterial } = useCharacterShaperMaterialSettings();
  return (
    <output data-testid="observed-material">
      {JSON.stringify({
        shaderMode: shaperMaterial.shaderMode,
        shadeColorHex: shaperMaterial.shadeColorHex,
        rimColorHex: shaperMaterial.rimColorHex,
        outlineColorHex: shaperMaterial.outlineColorHex,
        outlineScale: shaperMaterial.outlineScale,
      })}
    </output>
  );
}

describe("CharacterShaperArtStyleSection", () => {
  it("applies art-style MToon look without overwriting character colors unless opt-in is checked", () => {
    const binding = makeBinding();
    render(
      <CharacterShaperSessionSettingsProvider>
        <CharacterShaperArtStyleSection binding={binding} locked={false} defaultOpen />
        <MaterialObserver />
      </CharacterShaperSessionSettingsProvider>,
    );

    fireEvent.click(screen.getByTestId("shaper-art-style-pack-kr-webtoon-action"));
    expect(screen.getByTestId("shaper-art-style-active-badge").textContent).toBe("웹툰 액션");
    expect(binding.commitColor).not.toHaveBeenCalled();

    const observed = JSON.parse(screen.getByTestId("observed-material").textContent ?? "{}") as Record<string, unknown>;
    expect(observed.shaderMode).toBe("toon");
    expect(observed.rimColorHex).toBe("#8cb3ff");
    expect(typeof observed.shadeColorHex).toBe("string");

    // Opt in to applying recommended skin & hair palette with style
    fireEvent.click(screen.getByTestId("shaper-art-style-apply-palette"));
    fireEvent.click(screen.getByTestId("shaper-art-style-pack-jp-shounen-ink"));
    expect(binding.commitColor).toHaveBeenCalledWith("skin", "#f6d8c0");
    expect(binding.commitColor).toHaveBeenCalledWith("hairBase", "#151417");
  });

  it("keeps recommendation colors compact inside 44px skin and hair buttons that apply the color", () => {
    const binding = makeBinding();
    render(
      <CharacterShaperSessionSettingsProvider>
        <CharacterShaperArtStyleSection binding={binding} locked={false} defaultOpen />
      </CharacterShaperSessionSettingsProvider>,
    );

    fireEvent.click(screen.getByTestId("shaper-art-style-pack-jp-shounen-ink"));
    const skin = screen.getByRole("button", { name: /피부색 #f6d8c0$/u });
    const hair = screen.getByRole("button", { name: /헤어색 #151417$/u });
    for (const swatch of [skin, hair]) {
      expect(swatch.classList.contains("size-[44px]")).toBe(true);
      expect(swatch.firstElementChild?.classList.contains("size-7")).toBe(true);
      fireEvent.click(swatch);
    }

    expect(binding.commitColor).toHaveBeenCalledTimes(2);
    expect(binding.commitColor).toHaveBeenCalledWith("skin", "#f6d8c0");
    expect(binding.commitColor).toHaveBeenCalledWith("hairBase", "#151417");
  });

  it("commits OKLab-derived hair-tip color on 1-click button and renders derived 27-channel swatches", () => {
    const binding = makeBinding();
    render(
      <CharacterShaperSessionSettingsProvider>
        <CharacterShaperArtStyleSection binding={binding} locked={false} defaultOpen />
      </CharacterShaperSessionSettingsProvider>,
    );

    expect(screen.getByTestId("shaper-oklab-swatch-lip")).toBeTruthy();
    expect(screen.getByTestId("shaper-oklab-swatch-blush")).toBeTruthy();
    expect(screen.getByTestId("shaper-oklab-swatch-hair-tip")).toBeTruthy();
    expect(screen.getByTestId("shaper-oklab-swatch-legwear")).toBeTruthy();

    fireEvent.click(screen.getByTestId("shaper-oklab-apply-hair-tip"));
    expect(binding.commitColor).toHaveBeenCalledTimes(1);
    const [target, hex] = (binding.commitColor as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(target).toBe("hairTip");
    expect(hex).toMatch(/^#[0-9a-f]{6}$/u);
    expect(hex).not.toBe("#2b1d16");
  });
});
