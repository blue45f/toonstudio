// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBodyRatioMatrixPad } from "./StudioBodyRatioMatrixPad";
import {
  BACK_HAIR_PART_OPTIONS,
  FRONT_HAIR_PART_OPTIONS,
  HAIR_COLOR_TOKEN_PRESETS,
  SIDE_HAIR_PART_OPTIONS,
  WEBTOON_21_BODY_SLIDER_SPECS,
  createDefaultBodyAndHairState,
  resolveBodyMatrixTo21Sliders,
  resolveThreePartHairColors,
  switchThreePartHairStyle,
  toStudioVrmProportions,
} from "./studio-webtoon-21-body-and-3part-hair";

afterEach(() => {
  cleanup();
});

describe("studio-webtoon-21-body-and-3part-hair & StudioBodyRatioMatrixPad", () => {
  it("defines exactly 21 body sliders and maps 2D matrix coordinates into StudioVrmProportions", () => {
    expect(WEBTOON_21_BODY_SLIDER_SPECS).toHaveLength(21);

    const athletic = resolveBodyMatrixTo21Sliders({ muscularityX: 0.8, fullnessY: -0.2 });
    const slender = resolveBodyMatrixTo21Sliders({ muscularityX: -0.8, fullnessY: -0.2 });
    expect(athletic.shoulderWidth).toBeGreaterThan(slender.shoulderWidth);
    expect(athletic.upperArmThickness).toBeGreaterThan(slender.upperArmThickness);

    const props = toStudioVrmProportions(athletic);
    expect(props.shoulderWidth).toBeGreaterThan(1);
    expect(props.overallHeight).toBeGreaterThan(1);
  });

  it("keeps main hair color locked across front/side/back swaps when lockMainColor is enabled", () => {
    let state = createDefaultBodyAndHairState();
    state = {
      ...state,
      hair: {
        ...state.hair,
        mainColorId: HAIR_COLOR_TOKEN_PRESETS[2].id, // champagne-blonde
        lockMainColor: true,
        frontColorIdOverride: HAIR_COLOR_TOKEN_PRESETS[4].id,
      },
    };

    const afterSwap = switchThreePartHairStyle(state.hair, "front", FRONT_HAIR_PART_OPTIONS[4].id);
    const afterSide = switchThreePartHairStyle(afterSwap, "side", SIDE_HAIR_PART_OPTIONS[0].id);
    const afterBack = switchThreePartHairStyle(afterSide, "back", BACK_HAIR_PART_OPTIONS[5].id);

    const colors = resolveThreePartHairColors(afterBack);
    expect(colors.frontColorId).toBe(HAIR_COLOR_TOKEN_PRESETS[2].id);
    expect(colors.sideColorId).toBe(HAIR_COLOR_TOKEN_PRESETS[2].id);
    expect(colors.backColorId).toBe(HAIR_COLOR_TOKEN_PRESETS[2].id);
    expect(afterBack.frontId).toBe(FRONT_HAIR_PART_OPTIONS[4].id);
    expect(afterBack.sideId).toBe(SIDE_HAIR_PART_OPTIONS[0].id);
    expect(afterBack.backId).toBe(BACK_HAIR_PART_OPTIONS[5].id);
  });

  it("renders StudioBodyRatioMatrixPad and switches between 2D body matrix and 3-part hair tabs", () => {
    const onChange = vi.fn();
    render(
      <StudioBodyRatioMatrixPad
        state={createDefaultBodyAndHairState()}
        onChange={onChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "액션 남주" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        matrix: { muscularityX: 0.7, fullnessY: -0.15 },
      }),
    );

    fireEvent.click(screen.getByRole("tab", { name: /헤어 3분할/u }));
    expect(screen.getByRole("switch", { name: /메인 헤어 색 고정/u })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "히메컷" }));
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        hair: expect.objectContaining({
          sideId: "side-hime",
          mainColorId: HAIR_COLOR_TOKEN_PRESETS[0].id,
        }),
      }),
    );
  });
});
