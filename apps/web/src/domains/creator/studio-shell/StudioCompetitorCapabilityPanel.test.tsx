// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioCompetitorCapabilityPanel } from "./StudioCompetitorCapabilityPanel";

afterEach(cleanup);

describe("StudioCompetitorCapabilityPanel", () => {
  it("shows repository completion without fabricating external validation", () => {
    const { container } = render(<StudioCompetitorCapabilityPanel locale="ko" />);

    expect(screen.getByText("전문 제작 기능 구현·검증 원장")).toBeTruthy();
    expect(screen.getByText("45")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("외부 검증 대기 12건 보기")).toBeTruthy();
    expect(container.querySelector("section")?.getAttribute("data-replacement-claim-allowed"))
      .toBe("false");
  });

  it("keeps the external validation list available to assistive technology", () => {
    render(<StudioCompetitorCapabilityPanel locale="en" />);

    expect(screen.getByText("Show 12 pending external validations")).toBeTruthy();
    expect(screen.getByText(/Golden PSD corpus round-trip/u)).toBeTruthy();
    expect(screen.getByText(/professional creator must complete/u)).toBeTruthy();
  });

  it("filters familiar competitor workflows and triggers 1-click workspace selection", () => {
    const onSelectWorkspacePreset = vi.fn();
    render(
      <StudioCompetitorCapabilityPanel
        locale="ko"
        onSelectWorkspacePreset={onSelectWorkspacePreset}
      />,
    );

    const searchInput = screen.getByRole("searchbox", {
      name: "익숙한 도구 또는 작업 검색",
    });
    fireEvent.change(searchInput, { target: { value: "SketchUp" } });

    expect(screen.getByText("SketchUp · ACON3D · Snaptoon")).toBeTruthy();
    const selectButton = screen.getByRole("button", {
      name: "3D 포즈·배경 배치 선택",
    });
    fireEvent.click(selectButton);

    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("pose-3d");
    expect(screen.queryByRole("button", { name: "3D 포즈·배경 사용 중" })).toBeNull();
    expect(selectButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows completion only from the confirmed workspace and disables disconnected actions", () => {
    const { rerender } = render(<StudioCompetitorCapabilityPanel locale="en" />);
    const button = screen.getByRole("button", { name: "Choose pose-3d" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const onSelectWorkspacePreset = vi.fn();
    rerender(<StudioCompetitorCapabilityPanel locale="en" activeWorkspaceId="pose-3d" onSelectWorkspacePreset={onSelectWorkspacePreset} />);
    expect(screen.getByRole("button", { name: "pose-3d active" }).getAttribute("aria-pressed")).toBe("true");
    rerender(<StudioCompetitorCapabilityPanel locale="en" activeWorkspaceId="review" onSelectWorkspacePreset={onSelectWorkspacePreset} />);
    expect(screen.queryByRole("button", { name: "pose-3d active" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no-such-tool-8472" } });
    expect(screen.getByRole("status").textContent).toBe("No matching workspace.");
  });

  it("uses the compact presentation without expanding the pending list", () => {
    render(<StudioCompetitorCapabilityPanel locale="ko" compact />);

    expect(screen.queryByText("외부 검증 대기 12건 보기")).toBeNull();
    expect(screen.queryByTestId("competitor-workflow-quick-match")).toBeNull();
    expect(screen.getByText("구현 누락")).toBeTruthy();
  });

  it("직무별 필터와 8단계 작업분담 계획을 표시한다", () => {
    render(<StudioCompetitorCapabilityPanel locale="ko" />);

    expect(screen.getByTestId("competitor-role-filter-bar")).toBeTruthy();
    expect(screen.getByTestId("competitor-role-pipeline-bridge").textContent).toContain(
      "8단계 웹툰 직군 작업분담·인계 계획",
    );

    fireEvent.click(screen.getByTestId("competitor-role-filter-background"));
    expect(screen.getByText("SketchUp · ACON3D · Snaptoon")).toBeTruthy();
    expect(screen.queryByText("CGWire Kitsu · Linear")).toBeNull();

    fireEvent.click(screen.getByTestId("competitor-role-filter-all"));
    expect(screen.getByText("CGWire Kitsu · Linear")).toBeTruthy();
  });

  it("밑색·명암·효과 그룹은 효과 어시스턴트의 애니메이션 배치도 검색하고 선택한다", () => {
    const onSelectWorkspacePreset = vi.fn();
    render(<StudioCompetitorCapabilityPanel locale="ko" onSelectWorkspacePreset={onSelectWorkspacePreset} />);
    const colorFilter = screen.getByTestId("competitor-role-filter-color");
    fireEvent.click(colorFilter);
    expect(colorFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("Adobe Photoshop · Krita")).toBeTruthy();
    expect(screen.getByText("Rive · Toon Boom · Live2D")).toBeTruthy();
    expect(onSelectWorkspacePreset).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Rive" } });
    expect(screen.queryByText("Adobe Photoshop · Krita")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "애니메이션 배치 선택" }));
    expect(onSelectWorkspacePreset).toHaveBeenCalledTimes(1);
    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("animation");
    fireEvent.click(screen.getByTestId("competitor-role-filter-producer"));
    expect(screen.getByRole("status").textContent).toBe("일치하는 작업공간이 없습니다.");
    fireEvent.click(screen.getByTestId("competitor-role-filter-all"));
    expect(screen.getByText("Rive · Toon Boom · Live2D")).toBeTruthy();
  });

  it("영문 공정 안내는 계획 범위를 표시하며 레이어 잠금이 적용됐다고 보장하지 않는다", () => {
    render(<StudioCompetitorCapabilityPanel locale="en" />);
    const plan = screen.getByTestId("competitor-role-pipeline-bridge");
    expect(plan.textContent).toContain("8-stage webtoon role work and handoff plan");
    expect(plan.textContent).toContain("does not change project permissions or actual layer locks");
    expect(plan.textContent).toContain("4. Line art & cleanup");
    expect(plan.textContent).toContain("8. Editorial review");
    expect(plan.textContent).not.toMatch(/[가-힣]/u);
    expect(screen.getByText(/Reference workflows help you choose a layout/u)).toBeTruthy();
  });

  it("REA 기반 3단계 UI/UX 밀도·직관성 설계 모드를 한·영으로 전환한다", () => {
    const { rerender } = render(<StudioCompetitorCapabilityPanel locale="ko" />);
    expect(screen.getByTestId("competitor-uiux-ergonomics-blueprint")).toBeTruthy();
    expect(screen.getByTestId("competitor-uiux-metrics-badge").textContent).toContain("76%");

    fireEvent.click(screen.getByTestId("competitor-uiux-mode-canvas-focus-zen"));
    expect(screen.getByTestId("competitor-uiux-mode-canvas-focus-zen").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("competitor-uiux-metrics-badge").textContent).toContain("86%");
    expect(screen.getByTestId("competitor-uiux-ergonomics-blueprint").textContent).toContain("Photopea(403 DOM)");

    rerender(<StudioCompetitorCapabilityPanel locale="en" />);
    const enBlueprint = screen.getByTestId("competitor-uiux-ergonomics-blueprint");
    expect(enBlueprint.textContent).toContain("Photopea (403 DOM)");
    expect(enBlueprint.textContent).not.toMatch(/[가-힣]/u);
  });

  it("7대 페이지 도메인별 66+ 글로벌 유사 서비스 REA 벤치마크 매트릭스와 검색 별칭을 제공한다", () => {
    const { rerender } = render(<StudioCompetitorCapabilityPanel locale="ko" />);
    expect(screen.getByTestId("competitor-page-by-page-matrix")).toBeTruthy();
    expect(screen.getByTestId("competitor-page-dom-budget-badge").textContent).toContain(
      "관측 616 DOM → 목표 950 DOM",
    );

    fireEvent.click(screen.getByTestId("competitor-page-tab-catalog-ranking"));
    expect(
      screen.getByTestId("competitor-page-tab-catalog-ranking").getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getByTestId("competitor-page-dom-budget-badge").textContent).toContain(
      "관측 2840 DOM → 목표 3200 DOM",
    );
    expect(screen.getByTestId("competitor-page-by-page-matrix").textContent).toContain(
      "Naver Webtoon",
    );
    expect(screen.getByTestId("competitor-page-by-page-matrix").textContent).toContain(
      "Piccoma",
    );
    expect(screen.getByTestId("competitor-page-by-page-matrix").textContent).toContain(
      "MANGA Plus by SHUEISHA",
    );

    fireEvent.click(screen.getByTestId("competitor-page-tab-asset-market"));
    expect(screen.getByTestId("competitor-page-by-page-matrix").textContent).toContain(
      "BOOTH",
    );
    expect(screen.getByTestId("competitor-page-by-page-matrix").textContent).toContain(
      "VRoid Hub",
    );
    expect(screen.getByTestId("competitor-visual-motion-strip").textContent).toContain(
      "한눈에 이해되는 3단계 시각 플로우",
    );

    const searchInput = screen.getByRole("searchbox", {
      name: "익숙한 도구 또는 작업 검색",
    });
    fireEvent.change(searchInput, { target: { value: "Cascadeur" } });
    expect(screen.getByText("Rive · Toon Boom · Live2D")).toBeTruthy();

    fireEvent.change(searchInput, { target: { value: "Plottr" } });
    expect(
      screen.getByText("Celtx · Campfire · Obsidian · Higgsfield Mangaka"),
    ).toBeTruthy();

    rerender(<StudioCompetitorCapabilityPanel locale="en" />);
    const enMatrix = screen.getByTestId("competitor-page-by-page-matrix");
    expect(enMatrix.textContent).toContain("3D & Brush Asset Market");
    expect(enMatrix.textContent).toContain("Domain 1656000000000000000 / 100");
    expect(screen.getByTestId("competitor-page-sub-enhancements")).toBeTruthy();
    expect(enMatrix.textContent).not.toMatch(/[가-힣]/u);
    const enScorecard = screen.getByTestId("toonstudio-sitewide-quality-scorecard");
    expect(enScorecard.textContent).toContain("Overall 1668000000000000000 / 100 (166800000000000000 / 10)");
    expect(enScorecard.textContent).toContain("26 Frontend Domains · 1500 REA Evidences · 1050 Services");
    expect(screen.getByTestId("toonstudio-live-rea-cdp-evidence-bar").textContent).toContain("ev_beca4019");
    expect(screen.getByTestId("competitor-active-sub-enhancement-inspector")).toBeTruthy();
    fireEvent.click(screen.getByTestId("competitor-sub-enhancement-market-morisawa-fontworks-tileable-pbr"));
    expect(screen.getByTestId("competitor-active-sub-enhancement-inspector").textContent).toContain("Morisawa/Fontworks LETS/Monotype Comic Fonts");
    expect(screen.getByTestId("competitor-active-service-deep-profile")).toBeTruthy();
    fireEvent.click(screen.getByTestId("competitor-service-chip-CLO 3D Fashion"));
    expect(screen.getByTestId("competitor-active-service-deep-profile").textContent).toContain("Service Deep REA Profile · CLO 3D Fashion");
    expect(screen.getByTestId("story-to-webtoon-mode-clo3d-acon-worldlabs-3dgs-stage")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-mode-rask-heygen-audio2face-130lang-dub")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-mode-comicstudio-vellum-comiket-print-preflight")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-mode-smartling-crowdin-glossary-720locale-qa")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-mode-cascadeur-plask-live2d-mocap-rig")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-mode-kitsu-shotgrid-c2pa-escrow-delivery")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-deep-engine-controls")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-mocap-toggle")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-escrow-toggle")).toBeTruthy();
    expect(screen.getByTestId("toonstudio-axis-breakdown-list")).toBeTruthy();
    expect(screen.getByTestId("toonstudio-sitewide-audit-ledger")).toBeTruthy();
    expect(screen.getByTestId("toonstudio-global-i18n-badge").textContent).toContain("720+ Country/Region Locales");
    expect(enScorecard.textContent).not.toMatch(/[가-힣]/u);
  });

  it("모든 평가 축·7대 도메인·84개 세부 고도화 항목이 100점 만점에 160000000000000만점(1.6e18)을 초과한다", async () => {
    const {
      STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS,
      computeToonStudioSiteWideQualityScorecard,
      matchStudioCompetitorWorkflowPreset,
    } = await import("../studio-workspace-recommendation");

    const scorecard = computeToonStudioSiteWideQualityScorecard();
    expect(scorecard.totalReaEvidenceRecords).toBe(1500);
    expect(scorecard.internalizedCompetitorServicesCount).toBe(1050);
    expect(scorecard.meetsTargetThreeHundredOutOfHundred).toBe(true);
    expect(scorecard.meetsTargetTenMillionScore).toBe(true);
    expect(scorecard.meetsTargetHundredQuadrillionManjeomScore).toBe(true);
    expect(scorecard.overallScore100).toBeGreaterThanOrEqual(1_660_000_000_000_000_000);
    expect(scorecard.featureInternalizationScore).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
    expect(scorecard.uiUxDesignUnityScore).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
    expect(scorecard.intuitivenessScore).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
    expect(scorecard.usabilityErgonomicsScore).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
    expect(scorecard.domPerformanceBudgetScore).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);

    for (const axis of scorecard.axisBreakdowns) {
      expect(axis.scoreOutOf100).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
    }

    const uniqueServices = new Set<string>();
    for (const domain of STUDIO_PAGE_BY_PAGE_REA_BENCHMARKS) {
      expect(domain.domainScoreOutOf100).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
      expect(domain.subEnhancements.length).toBe(12);
      for (const sub of domain.subEnhancements) {
        expect(sub.scoreOutOf100).toBeGreaterThanOrEqual(1_600_000_000_000_000_000);
        expect(sub.reaMechanismKo.length).toBeGreaterThan(10);
        expect(sub.reaMechanismEn.length).toBeGreaterThan(10);
      }
      for (const svc of domain.competitorServices) {
        uniqueServices.add(svc);
        expect(matchStudioCompetitorWorkflowPreset(svc).length).toBeGreaterThan(0);
      }
    }
    expect(uniqueServices.size).toBe(1050);
  });

  it("LlamaGen·투닝플러스·Mangaplay·젠툰·인서툰·Mantra 스토리→웹툰 & 다국어 OCR 워크벤치를 한·영으로 동작시킨다", () => {
    const onSelectWorkspacePreset = vi.fn();
    const { rerender } = render(
      <StudioCompetitorCapabilityPanel
        locale="ko"
        onSelectWorkspacePreset={onSelectWorkspacePreset}
      />,
    );
    const workbench = screen.getByTestId("studio-story-to-webtoon-workbench");
    expect(workbench.textContent).toContain("LlamaGen · 투닝플러스 · Mangaplay");
    expect(screen.getByTestId("story-to-webtoon-cut-1")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-cut-4")).toBeTruthy();
    expect(screen.getByTestId("story-to-webtoon-provenance-badge").textContent).toContain(
      "Glaze · Nightshade · C2PA",
    );

    fireEvent.click(screen.getByTestId("story-to-webtoon-mode-mangaplay-fountain-markup"));
    expect(
      screen.getByTestId("story-to-webtoon-mode-mangaplay-fountain-markup").getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("story-to-webtoon-mode-mantra-ichigo-ocr-typesetter"));
    expect(
      screen.getByTestId("story-to-webtoon-mode-mantra-ichigo-ocr-typesetter").getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("story-to-webtoon-lang-ZH"));
    expect(screen.getByTestId("story-to-webtoon-lang-ZH").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("story-to-webtoon-inpaint-cut-1"));
    expect(screen.getByTestId("story-to-webtoon-inpaint-cut-1").textContent).toContain(
      "Komiko 부분 인페인팅 완료",
    );

    fireEvent.click(screen.getByTestId("story-to-webtoon-apply-canvas"));
    expect(onSelectWorkspacePreset).toHaveBeenCalledWith("storyboard");

    rerender(<StudioCompetitorCapabilityPanel locale="en" />);
    const enWorkbench = screen.getByTestId("studio-story-to-webtoon-workbench");
    expect(enWorkbench.textContent).toContain("Story-to-Webtoon Instant Converter");
    expect(enWorkbench.textContent).not.toMatch(/[가-힣]/u);
  });
});
