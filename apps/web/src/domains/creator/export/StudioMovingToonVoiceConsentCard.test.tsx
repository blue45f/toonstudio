// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioMovingToonVoiceConsentCard } from "./StudioMovingToonVoiceConsentCard";

vi.mock("../studio-workbench-clipboard", () => ({
  copyStudioText: vi.fn().mockResolvedValue(true),
}));

describe("StudioMovingToonVoiceConsentCard", () => {
  it("passes 10/10 provenance chain with 550,000 KRW royalty and blocks unauthorized model training reuse", () => {
    render(
      <StudioMovingToonVoiceConsentCard
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("voice-consent-status-badge").textContent).toContain(
      "10/10 완결 통과 · 로열티 550,000원",
    );

    fireEvent.click(screen.getByLabelText("외부 파운데이션 모델 학습 재사용 요청"));
    expect(screen.getByTestId("voice-consent-status-badge").textContent).toContain(
      "voice-synthesis-consent",
    );
  });
});
