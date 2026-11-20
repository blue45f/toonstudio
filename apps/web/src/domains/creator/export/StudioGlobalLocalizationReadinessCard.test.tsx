// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "../assistant/studio-workflow-pack";

import { StudioGlobalLocalizationReadinessCard } from "./StudioGlobalLocalizationReadinessCard";

vi.mock("../studio-workbench-clipboard", () => ({
  copyStudioText: vi.fn().mockResolvedValue(true),
}));

describe("StudioGlobalLocalizationReadinessCard", () => {
  it("passes 9/9 global provenance chain by default and blocks when human post-edit is unchecked", () => {
    render(
      <StudioGlobalLocalizationReadinessCard
        seriesTitle="황녀의 검"
        pack={BUILTIN_STUDIO_WORKFLOW_PACKS[0]}
      />,
    );

    expect(screen.getByTestId("global-localization-badge").textContent).toContain(
      "9/9 글로벌 체인 통과",
    );

    fireEvent.click(screen.getByLabelText("AI 번역 인간 감수 완료"));
    expect(screen.getByTestId("global-localization-badge").textContent).toContain(
      "localization-rights",
    );
  });
});
