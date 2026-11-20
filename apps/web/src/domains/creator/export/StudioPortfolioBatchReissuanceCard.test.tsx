// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioPortfolioBatchReissuanceCard } from "./StudioPortfolioBatchReissuanceCard";

describe("StudioPortfolioBatchReissuanceCard", () => {
  it("scans portfolio revocation impact and executes one-click batch reissuance", () => {
    render(
      <StudioPortfolioBatchReissuanceCard
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("portfolio-batch-status-badge").textContent).toContain(
      "철회 감지 2/3화",
    );
    fireEvent.click(screen.getByTestId("portfolio-batch-reissue-btn"));
    expect(screen.getByTestId("portfolio-batch-status-badge").textContent).toContain(
      "일괄 복구 완료 (2/3화 재발급)",
    );
  });
});
