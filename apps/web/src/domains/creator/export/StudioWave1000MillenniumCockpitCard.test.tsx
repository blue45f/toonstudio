// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioWave1000MillenniumCockpitCard } from "./StudioWave1000MillenniumCockpitCard";

describe("StudioWave1000MillenniumCockpitCard", () => {
  it("renders Wave 1000/1000 Millennium PASS and acyclic 10-century DAG proof", () => {
    render(
      <StudioWave1000MillenniumCockpitCard
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("studio-wave1000-millennium-cockpit-card")).toBeTruthy();
    expect(screen.getByTestId("wave1000-millennium-status-badge").textContent).toContain(
      "Wave 1000/1000 Millennium PASS",
    );
  });
});
