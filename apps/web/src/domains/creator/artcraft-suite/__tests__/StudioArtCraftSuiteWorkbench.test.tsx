// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { ARTCRAFT_SUITE_CATALOG } from "../artcraft-launcher-security-catalog";
import { StudioArtCraftSuiteWorkbench } from "../StudioArtCraftSuiteWorkbench";

describe("StudioArtCraftSuiteWorkbench", () => {
  it("renders all 15 ArtCraft Crafting Apps (Launcher, PhotoCraft..GridCraft, and AniCraft) and switches inspectors", () => {
    render(
      <MemoryRouter>
        <StudioArtCraftSuiteWorkbench projectId="proj-artcraft-01" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("studio-artcraft-suite-workbench")).toBeTruthy();
    expect(screen.getByTestId("studio-artcraft-multimodal-desktop-panel")).toBeTruthy();

    for (const app of ARTCRAFT_SUITE_CATALOG) {
      const card = screen.getByTestId(`artcraft-app-card-${app.id}`);
      expect(card).toBeTruthy();
      fireEvent.click(card);
      expect(screen.getByTestId(`artcraft-inspector-${app.id}`)).toBeTruthy();
    }

    // Switch through all 5 ArtCraft v0.41.0 & Desktop Deep Engine tabs and verify accessible keyboard navigation
    const splatTab = screen.getByTestId("artcraft-multimodal-tab-splat-world");
    expect(splatTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("panel-splat-world")).toBeTruthy();

    fireEvent.keyDown(splatTab, { key: "ArrowRight" });
    expect(screen.getByTestId("panel-hunyuan-3d")).toBeTruthy();

    fireEvent.click(screen.getByTestId("artcraft-multimodal-tab-camera-angles"));
    expect(screen.getByTestId("panel-camera-angles")).toBeTruthy();

    fireEvent.click(screen.getByTestId("artcraft-multimodal-tab-promo-video-router"));
    expect(screen.getByTestId("panel-promo-video-router")).toBeTruthy();

    fireEvent.click(screen.getByTestId("artcraft-multimodal-tab-desktop-deep"));
    expect(screen.getByTestId("panel-desktop-deep")).toBeTruthy();
  });
});
