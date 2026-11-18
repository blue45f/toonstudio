// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { StudioBg3dAtmosphericBokehDofCard } from "./StudioBg3dAtmosphericBokehDofCard";
import { evaluateAtmosphericBokehAndQuarterlyRoi, type AtmosphericMoteStyleId } from "./studio-bg3d-atmospheric-bokeh-dof";

it("보케 종류를 바꾸면 실제 합성 명세의 첫 레이어 이름도 바뀐다", () => {
  const props = { onSelectMoteStyleId: vi.fn(), onChangeClimaxSequencesPerEpisode: vi.fn() };
  const card = (moteStyleId: AtmosphericMoteStyleId) => <StudioBg3dAtmosphericBokehDofCard
    {...props} evaluation={evaluateAtmosphericBokehAndQuarterlyRoi({
      openRatioPct: 65, climaxSequencesPerEpisode: 3, baseCombinedWeeklyHoursSaved: 0, moteStyleId,
    })} />;
  const preview = render(card("amber-dust-motes"));
  fireEvent.click(screen.getByTestId("bg3d-blender-v23-manifest-toggle"));
  const topLayer = () => JSON.parse(screen.getByTestId("bg3d-blender-v23-manifest-json").textContent!).layers[0].layerTag;
  expect(topLayer()).toBe("FX_FG_Bokeh_Dust_Screen");
  preview.rerender(card("abyss-mana-embers"));
  expect(topLayer()).toBe("FX_FG_Bokeh_ManaEmbers_Glow");
});
