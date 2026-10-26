// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioTripo3dCompetitorWorkbench } from "./StudioTripo3dCompetitorWorkbench";

afterEach(() => {
  cleanup();
});

describe("StudioTripo3dCompetitorWorkbench", () => {
  it("Tripo V3 3원 모델 라우터, 12단계 체인, 5비율 포즈 마네킹 반영 및 경쟁사 REA 통합 워크벤치를 렌더링하고 제어한다", () => {
    const onApplySliders = vi.fn();
    render(
      <StudioTripo3dCompetitorWorkbench
        accordionGroupName="scene3d-test-group"
        onApplyMannequinBodySliders={onApplySliders}
      />,
    );

    expect(screen.getByTestId("tripo3d-selected-model-readout").textContent).toContain(
      "P1-20260311",
    );

    fireEvent.click(screen.getByTestId("tripo3d-toggle-quad"));
    expect(screen.getByTestId("tripo3d-selected-model-readout").textContent).toContain(
      "P2-20260801",
    );

    fireEvent.click(screen.getByTestId("tripo3d-rigtype-quadruped"));
    expect(screen.getByTestId("tripo3d-chain-validation-readout").textContent).toContain(
      "preset:quadruped:idle",
    );

    fireEvent.click(screen.getByTestId("tripo3d-apply-pose-to-mannequin"));
    expect(onApplySliders).toHaveBeenCalledTimes(1);

    // Hyper3D Rodin Gen-2.5 Dual-Card & Deemos Bang
    expect(screen.getByTestId("rodin-version-badge").textContent).toContain("Gen-2.5");
    fireEvent.click(screen.getByTestId("rodin-card-3D Editing"));
    expect(screen.getByTestId("rodin-plan-readout").textContent).toContain(
      "Deemos Bang 파트 분할 활성",
    );

    // Meshy LOD + Sloyd/CSM Background Cluster
    expect(screen.getByTestId("meshy-lod-LOD0").textContent).toContain("8,000");
    fireEvent.click(screen.getByTestId("bgcluster-preset-fantasy-palace-courtyard"));
    expect(screen.getByTestId("bgcluster-summary-readout").textContent).toContain(
      "로맨스판타지 황궁 회랑",
    );
  });
});
