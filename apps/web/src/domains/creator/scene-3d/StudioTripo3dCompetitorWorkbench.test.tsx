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

    // H3.1 모델 선택 및 6대 MCP 생태계 확장 패널 제어
    fireEvent.click(screen.getByTestId("tripo3d-model-H3.1-20260901"));
    fireEvent.click(screen.getByTestId("tripo3d-toggle-quad"));
    expect(screen.getByTestId("tripo3d-selected-model-readout").textContent).toContain(
      "H3.1-20260901",
    );

    expect(screen.getByTestId("tripo-ws-guard-readout").textContent).toContain("/ko/workspace/smart-uv");
    fireEvent.click(screen.getByTestId("tripo-ws-segmentation"));
    expect(screen.getByTestId("tripo-ws-guard-readout").textContent).toContain(
      "/ko/workspace/segmentation",
    );

    expect(screen.getByTestId("glbforge-audit-readout").textContent).toContain("/100");
    fireEvent.click(screen.getByTestId("glbforge-extrude-acrylic"));
    expect(screen.getByTestId("glbforge-extrude-readout").textContent).toContain(
      "투명 아크릴 스탠드",
    );

    fireEvent.click(screen.getByTestId("meshy-product-figure"));
    expect(screen.getByTestId("meshy-blendai-summary-readout").textContent).toContain(
      "피규어 (베이스 포함)",
    );
    expect(screen.getByTestId("meshy-blendai-summary-readout").textContent).toContain(
      "Key:Fill:Rim = 3:1:1.5",
    );

    // Tripo3D MCP + GLBForge MCP + VRM Toolkit MCP 실생성 에셋 라이브러리 검증 (22종 GLB)
    expect(screen.getByTestId("tripo3d-mcp-generated-models-section")).toBeTruthy();
    expect(screen.getByTestId("tripo3d-mcp-selected-model-readout").textContent).toContain(
      "tripo_p2_quad_street_cafe_kit.glb",
    );
    fireEvent.click(screen.getByTestId("tripo3d-mcp-model-tripo3d-mcp-bg-korean-alley-stairway"));
    expect(screen.getByTestId("tripo3d-mcp-selected-model-readout").textContent).toContain(
      "webtoon_korean_alley_stairway_module.glb",
    );
    fireEvent.click(screen.getByTestId("tripo3d-mcp-domain-mannequin"));
    expect(screen.getByTestId("tripo3d-mcp-selected-model-readout").textContent).toContain(
      "tripo_p2_quad_articulated_mannequin.glb",
    );
    fireEvent.click(screen.getByTestId("tripo3d-mcp-domain-character-lab"));
    expect(screen.getByTestId("tripo3d-mcp-selected-model-readout").textContent).toContain(
      "tripo_seg_fantasy_knight_outfit_set.glb",
    );
    expect(screen.getByTestId("vrm-toolkit-mcp-avatar-summary").textContent).toContain(
      "Avatar_Orion.vrm",
    );

    // Section 5: 파츠별 ON/OFF · 툰셰이더 · 등신 비례 · 커스텀 GLB 실시간 커스터마이저 검증
    expect(screen.getByTestId("tripo3d-customizer-workbench")).toBeTruthy();
    expect(screen.getByTestId("tripo3d-free-trial-ledger-readout").textContent).toContain(
      "잔여 무료 체험 0건",
    );
    fireEvent.click(screen.getByTestId("tripo3d-part-toggle-crown-helm"));
    expect(screen.getByTestId("tripo3d-customizer-shader-summary").textContent).toContain(
      "활성 파츠 5/6",
    );
    fireEvent.click(screen.getByTestId("tripo3d-palette-romance-gold-palace"));
    expect(screen.getByTestId("tripo3d-customizer-shader-summary").textContent).toContain(
      "로판 황실 화이트·골드",
    );
    fireEvent.click(screen.getByTestId("tripo3d-hand-pose-sword-grip"));
    expect(onApplySliders).toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("tripo3d-custom-glb-url-input"), {
      target: { value: "/models/tripo3d-mcp/custom_user_knight.glb" },
    });
    expect(screen.getByTestId("tripo3d-customizer-recipe-readout").textContent).toContain(
      "/models/tripo3d-mcp/custom_user_knight.glb",
    );
  });
});
