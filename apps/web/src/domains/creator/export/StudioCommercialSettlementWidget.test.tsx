// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioCommercialSettlementWidget } from "./StudioCommercialSettlementWidget";

afterEach(cleanup);

vi.mock("../studio-workbench-clipboard", () => ({
  copyStudioText: vi.fn().mockResolvedValue(true),
}));

describe("StudioCommercialSettlementWidget", () => {
  it("renders approved MG advance limit for clean pack and blocks AI Opt-In tier when tdm-reservation: 1", () => {
    render(
      <StudioCommercialSettlementWidget
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
        defaultEpisodeFeeKrw={2_000_000}
      />,
    );

    expect(screen.getByTestId("commercial-underwriting-badge").textContent).toContain("선정산 승인 가능");
    expect(screen.getByTestId("settlement-net-krw").textContent).toBe("1,900,000원");
    expect(screen.getByTestId("underwriting-limit-krw").textContent).toBe("6,000,000원");

    // Switching to AI Opt-In tier while tdm-reservation: 1 is active triggers hold guard
    fireEvent.change(screen.getByLabelText("라이선스 티어 선택"), {
      target: { value: "verified-ai-optin-royalty" },
    });
    expect(screen.getByTestId("settlement-hold-reason").textContent).toContain("tdm-reservation: 1");
    expect(screen.getByTestId("underwriting-limit-krw").textContent).toBe("0원");
  });
});
