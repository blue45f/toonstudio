// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioWave100MasterCockpitCard } from "./StudioWave100MasterCockpitCard";

describe("StudioWave100MasterCockpitCard", () => {
  it("renders Wave 100 Grand Mastery PASS status and EU AI Act disclosure", () => {
    render(
      <StudioWave100MasterCockpitCard
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("studio-wave100-master-cockpit-card")).toBeTruthy();
    expect(screen.getByTestId("wave100-master-status-badge").textContent).toContain(
      "Wave 100 Grand Mastery PASS",
    );
  });
});
