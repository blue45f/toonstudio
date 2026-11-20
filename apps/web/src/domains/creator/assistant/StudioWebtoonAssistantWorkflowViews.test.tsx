// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWorkflowPacksPanel } from "./StudioWebtoonAssistantWorkflowViews";
import { BUILTIN_STUDIO_WORKFLOW_PACKS, type StudioWorkflowPack } from "./studio-workflow-pack";

describe("StudioWorkflowPacksPanel Wave 7–24 full 10-stage commercial, global & MovingToon stack", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders BG3D/brush labels, settlement simulator, 8/9/10-stage cards, and remediates NC packs", () => {
    const onApplyPack = vi.fn();
    render(
      <StudioWorkflowPacksPanel
        appliedWorkflowPackId={null}
        currentSnapshot={{
          platformId: "naver-webtoon",
          skinToneId: "warm-fair",
          perspectivePreset: "high-angle",
          focusStage: "background-3d",
          focusPreset: "deep-flow-50",
          readerSpeed: "immersive",
        }}
        onApplyPack={onApplyPack}
      />,
    );

    expect(screen.getByText("3D:궁전 골든아워 라이팅")).toBeTruthy();
    expect(screen.getByText("브러시:크리스프 G펜 (선화)")).toBeTruthy();
    expect(screen.getByTestId("studio-commercial-settlement-widget")).toBeTruthy();
    expect(screen.getByTestId("studio-ip-provenance-audit-card")).toBeTruthy();
    expect(screen.getByTestId("studio-global-localization-card")).toBeTruthy();
    expect(screen.getByTestId("studio-movingtoon-voice-consent-card")).toBeTruthy();
    expect(screen.getByTestId("studio-reader-trust-seal-preview-card")).toBeTruthy();

    const ncPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      id: "custom-nc-remediation-test",
      name: "비상업 조명 포함 테스트 팩",
      rightsBom: [{ assetLabel: "무료 비상업 조명 프리셋", license: "CC-BY-NC" }],
    };

    fireEvent.change(screen.getByLabelText("가져올 워크플로우 팩 JSON"), {
      target: { value: JSON.stringify(ncPack) },
    });
    fireEvent.click(screen.getByRole("button", { name: "JSON 검증 후 적용" }));

    const remediateBtn = screen.getByTestId("remediate-pack-custom-nc-remediation-test");
    fireEvent.click(remediateBtn);

    const banner = screen.getByTestId("workflow-pack-remediation-banner");
    expect(banner.textContent).toContain("1클릭 복구 완료");
    expect(screen.queryByTestId("remediate-pack-custom-nc-remediation-test")).toBeNull();
  });
});
