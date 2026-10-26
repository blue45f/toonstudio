// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ARTCRAFT_SUITE_CATALOG } from "../artcraft-launcher-security-catalog";
import { StudioArtCraftSuiteWorkbench } from "../StudioArtCraftSuiteWorkbench";

describe("StudioArtCraftSuiteWorkbench", () => {
  it("renders all 15 ArtCraft Crafting Apps (Launcher, PhotoCraft..GridCraft, and AniCraft) and switches inspectors", () => {
    render(<StudioArtCraftSuiteWorkbench projectId="proj-artcraft-01" />);

    expect(screen.getByTestId("studio-artcraft-suite-workbench")).toBeTruthy();

    for (const app of ARTCRAFT_SUITE_CATALOG) {
      const card = screen.getByTestId(`artcraft-app-card-${app.id}`);
      expect(card).toBeTruthy();
      fireEvent.click(card);
      expect(screen.getByTestId(`artcraft-inspector-${app.id}`)).toBeTruthy();
    }
  });
});
