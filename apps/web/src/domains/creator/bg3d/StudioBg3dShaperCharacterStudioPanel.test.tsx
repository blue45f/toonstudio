// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dShaperCharacterStudioPanel } from "./StudioBg3dShaperCharacterStudioPanel";

afterEach(cleanup);

describe("StudioBg3dShaperCharacterStudioPanel", () => {
  it("renders all 3 studio modes, 11 webtoon archetypes, customizer sliders, and 44px touch targets", () => {
    const markup = renderToStaticMarkup(
      <StudioBg3dShaperCharacterStudioPanel onExportPsd={vi.fn()} />,
    );

    expect(markup).toContain("셰이퍼 캐릭터");
    expect(markup).toContain("투닝 표정 &amp; SFX");
    expect(markup).toContain("세로 연출 &amp; PSD");

    // Default Shaper tab + expanded archetypes + Luminous Atelier badge
    expect(markup).toContain("/brand/luminous-atelier-20261114/icon-studio-3d-pose.webp");
    expect(markup).toContain("8등신 소년만화 히어로");
    expect(markup).toContain("4등신 SD 치비 캐릭터");
    expect(markup).toContain("8.5등신 로판 북부대공");
    expect(markup).toContain("7.5등신 로판 황실 영애");
    expect(markup).toContain("8등신 무협 화산 검존");
    expect(markup).toContain("7.8등신 K-POP 아이돌 센터");
    expect(markup).toContain("3D 표면 직접 잉킹 (3D Inking)");
    expect(markup).toContain("min-h-11");
    expect(markup).not.toContain("transition-all");
    expect(markup).toContain("shaper-kitbash-disclosure");
    expect(markup).toContain("shaper-character-inspector-disclosure");
  });

  it("filters archetypes by genre, updates sliders/hair/outfit/cel-shading, and places 3D primitives in scene", () => {
    const onInsertScenePrimitives = vi.fn();
    const onStatusChange = vi.fn();

    render(
      <StudioBg3dShaperCharacterStudioPanel
        onInsertScenePrimitives={onInsertScenePrimitives}
        onStatusChange={onStatusChange}
      />,
    );

    // Filter to 로판·황실
    fireEvent.click(screen.getByTestId("shaper-genre-chip-rofan-royal"));
    expect(screen.getByTestId("shaper-archetype-northern-duke-85head")).toBeTruthy();
    expect(screen.getByTestId("shaper-archetype-rofan-princess-75head")).toBeTruthy();
    expect(screen.queryByTestId("shaper-archetype-sd-chibi-4head")).toBeNull();

    // Select 로판 북부대공 + customize sliders/hair/outfit/cel
    fireEvent.click(screen.getByTestId("shaper-archetype-northern-duke-85head"));
    fireEvent.change(screen.getByTestId("shaper-slider-head-ratio"), { target: { value: "8.8" } });
    fireEvent.click(screen.getByTestId("shaper-hair-male-lead-wolf"));
    fireEvent.click(screen.getByTestId("shaper-outfit-northern-duke-cape"));
    fireEvent.click(screen.getByTestId("shaper-cel-backlight-rim"));

    // Place character into 3D scene
    fireEvent.click(screen.getByTestId("shaper-place-scene-btn"));
    expect(onInsertScenePrimitives).toHaveBeenCalledTimes(1);
    const [primitives, labelKo] = onInsertScenePrimitives.mock.calls[0]!;
    expect(primitives.length).toBeGreaterThanOrEqual(13);
    expect(labelKo).toContain("8.5등신 로판 북부대공");
    expect(labelKo).toContain("8.8등신");
    expect(onStatusChange).toHaveBeenCalledWith(expect.stringContaining("역광 림라이트"));
  });

  it("renders properly with disabled flag", () => {
    const markup = renderToStaticMarkup(
      <StudioBg3dShaperCharacterStudioPanel disabled />,
    );

    expect(markup).toContain("disabled");
  });
});
