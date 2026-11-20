// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  BUILTIN_STUDIO_WORKFLOW_PACKS,
  type StudioWorkflowPack,
} from "../assistant/studio-workflow-pack";

import { StudioIpProvenanceAuditCard } from "./StudioIpProvenanceAuditCard";

vi.mock("../studio-workbench-clipboard", () => ({
  copyStudioText: vi.fn().mockResolvedValue(true),
}));

describe("StudioIpProvenanceAuditCard", () => {
  it("renders 8/8 verified provenance stages for a clean workflow pack and flags broken stages for NC packs", () => {
    const { rerender } = render(
      <StudioIpProvenanceAuditCard
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("provenance-chain-status-badge").textContent).toContain(
      "8/8 체인 검증 통과",
    );

    const ncPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      rightsBom: [{ assetLabel: "비상업 소품", license: "CC-BY-NC" }],
    };
    rerender(<StudioIpProvenanceAuditCard seriesTitle="황녀의 검" pack={ncPack} />);

    expect(screen.getByTestId("provenance-chain-status-badge").textContent).toContain("끊긴 구간");
  });
});
