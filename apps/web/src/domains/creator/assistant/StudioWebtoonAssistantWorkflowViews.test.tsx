// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StudioWorkflowPacksPanel } from "./StudioWebtoonAssistantWorkflowViews";
import { BUILTIN_STUDIO_WORKFLOW_PACKS, type StudioWorkflowPack } from "./studio-workflow-pack";

describe("StudioWorkflowPacksPanel Wave 7 & 16 remediation, cross-domain labels & settlement simulator", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders human-readable BG3D/brush preset names, embedded settlement simulator, and remediates a CC-BY-NC pack in one click", () => {
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

    // Builtin packs show resolved Korean BG3D lighting & 2D brush labels
    expect(screen.getByText("3D:궁전 골든아워 라이팅")).toBeTruthy();
    expect(screen.getByText("브러시:크리스프 G펜 (선화)")).toBeTruthy();

    // Embedded commercial settlement & MG underwriting widget is mounted
    expect(screen.getByTestId("studio-commercial-settlement-widget")).toBeTruthy();

    // Import a custom pack containing a CC-BY-NC asset
    const ncPack: StudioWorkflowPack = {
      ...BUILTIN_STUDIO_WORKFLOW_PACKS[0],
      id: "custom-nc-remediation-test",
      name: "비상업 조명 포함 테스트 팩",
      rightsBom: [
        { assetLabel: "무료 비상업 조명 프리셋", license: "CC-BY-NC" },
      ],
    };

    fireEvent.change(screen.getByLabelText("가져올 워크플로우 팩 JSON"), {
      target: { value: JSON.stringify(ncPack) },
    });
    fireEvent.click(screen.getByRole("button", { name: "JSON 검증 후 적용" }));

    // 1-click remediation button appears for the non-commercial pack
    const remediateBtn = screen.getByTestId("remediate-pack-custom-nc-remediation-test");
    expect(remediateBtn).toBeTruthy();

    fireEvent.click(remediateBtn);

    // Banner confirms remediation and re-signing
    const banner = screen.getByTestId("workflow-pack-remediation-banner");
    expect(banner.textContent).toContain("1클릭 복구 완료");
    expect(banner.textContent).toContain("재서명: fnv1a-");

    // Remediation button disappears once the pack is commercial-cleared
    expect(screen.queryByTestId("remediate-pack-custom-nc-remediation-test")).toBeNull();
  });
});
