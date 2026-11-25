// @vitest-environment jsdom
import fs from "node:fs";
import path from "node:path";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoQaCollabHubPanel } from "./AutoQaCollabHubPanel";
import { BrushWasm3dFrontierHubPanel } from "./BrushWasm3dFrontierHubPanel";
import { CreatorLabHardwareHubPanel } from "./CreatorLabHardwareHubPanel";
import { Csp3dUpgradeHubPanel } from "./Csp3dUpgradeHubPanel";
import { OpenEcosystemWorkflowHubPanel } from "./OpenEcosystemWorkflowHubPanel";
import { StudioHubCalmTabNavigator, type StudioHubCalmTabItem } from "./StudioHubCalmTabNavigator";

const i18nState = vi.hoisted(() => ({ lang: "ko" }));
vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { readonly lang: string }) => unknown) => selector(i18nState),
}));

vi.mock("../auto-qa-pixel-engine/AutoQaPixelScannerPanel", () => ({
  AutoQaPixelScannerPanel: () => <div data-testid="mock-default-qa-panel">QA</div>,
}));
vi.mock("../brush-physics-pro/StudioBrushPhysicsProPanel", () => ({
  StudioBrushPhysicsProPanel: () => <div data-testid="mock-default-brush-panel">Brush</div>,
}));
vi.mock("../creator-experience-calibrator/StudioCreatorCalibratorPanel", () => ({
  StudioCreatorCalibratorPanel: () => <div data-testid="mock-default-calibrator-panel">Calibrator</div>,
}));
vi.mock("../csp-puppet-warp/PuppetWarpStudioPanel", () => ({
  PuppetWarpStudioPanel: () => <div data-testid="mock-default-puppet-panel">Puppet</div>,
}));
vi.mock("../dynamic-workflow-ecosystem/StudioDynamicWorkflowPanel", () => ({
  StudioDynamicWorkflowPanel: () => <div data-testid="mock-default-workflow-panel">Workflow</div>,
}));

afterEach(() => {
  cleanup();
  i18nState.lang = "ko";
});

type SampleTabId = `mod-${number}`;

const SAMPLE_TABS: readonly StudioHubCalmTabItem<SampleTabId>[] = Array.from({ length: 20 }, (_, index) => {
  const num = index + 1;
  const labelPairs: readonly [string, string][] = [
    ["물리 브러시 엔진", "Physical Brush Engine"],
    ["커스텀 브러시 랩", "Custom Brush Lab"],
    ["3D 선화 투영", "3D Ink Projection"],
    ["컬러 스크립트 조화", "Color Script Harmony"],
    ["아틀리에 솔리드 CAD", "Atelier Solid CAD"],
    ["협업 드로잉 동기화", "Collaborative Drawing Sync"],
    ["2D 조명·그림자 시뮬레이터", "2D Lighting Simulator"],
    ["스펙트럼 컴퓨트 스케줄러", "SpectrumCompute Scheduler"],
    ["대형 캔버스 타일 예산", "Large Canvas Tile Budget"],
    ["말풍선 자동 조판", "Speech Balloon Auto Layout"],
  ];
  const pair = labelPairs[index];
  return {
    id: `mod-${num}` as SampleTabId,
    labelKo: pair ? pair[0] : `전문 모듈 ${num}`,
    labelEn: pair ? pair[1] : `Specialist Module ${num}`,
  };
});

const SAMPLE_PINNED: readonly SampleTabId[] = [
  "mod-1",
  "mod-2",
  "mod-3",
  "mod-4",
  "mod-5",
  "mod-6",
];

function NavigatorHarness(props: {
  readonly initialActive?: SampleTabId;
  readonly isEn?: boolean;
  readonly tabs?: readonly StudioHubCalmTabItem<SampleTabId>[];
  readonly pinnedIds?: readonly SampleTabId[];
  readonly onSelectSpy?: (id: SampleTabId) => void;
}) {
  const [activeId, setActiveId] = useState<SampleTabId>(props.initialActive ?? "mod-1");
  return (
    <div>
      <StudioHubCalmTabNavigator
        baseId="sample-hub"
        ariaLabel={props.isEn ? "Sample pro hub modules" : "샘플 프로 허브 모듈"}
        tabs={props.tabs ?? SAMPLE_TABS}
        pinnedIds={props.pinnedIds ?? SAMPLE_PINNED}
        activeId={activeId}
        onSelect={(id) => {
          setActiveId(id);
          props.onSelectSpy?.(id);
        }}
        renderIcon={(id) => <span data-icon-id={id} aria-hidden="true" />}
        isEn={props.isEn ?? false}
      />
      <div
        id={`sample-hub-panel-${activeId}`}
        role="tabpanel"
        aria-labelledby={`sample-hub-tab-${activeId}`}
        data-testid="sample-active-panel"
      >
        {activeId}
      </div>
    </div>
  );
}

describe("StudioHubCalmTabNavigator 공용 Calm 6-핀·검색·서랍 내비게이터", () => {
  it("초기 상태에서 상단 tablist에는 핵심 6핀만 노출하고 나머지 14개는 닫힌 서랍에 숨긴다", () => {
    render(<NavigatorHarness />);
    const tablist = screen.getByRole("tablist", { name: "샘플 프로 허브 모듈" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(6);
    expect(tabs[0]?.getAttribute("aria-selected")).toBe("true");
    expect(tabs[0]?.getAttribute("aria-controls")).toBe("sample-hub-panel-mod-1");

    const drawer = screen.getByTestId("studio-hub-calm-drawer") as HTMLDetailsElement;
    expect(drawer.open).toBe(false);
    expect(drawer.textContent).toContain("전체 전문 모듈 20종 탐색");
    expect(screen.getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+14종 숨김");
  });

  it("핵심 6핀 중 다른 탭을 클릭하면 onSelect와 aria-selected가 즉시 갱신된다", () => {
    const spy = vi.fn();
    render(<NavigatorHarness onSelectSpy={spy} />);
    const target = screen.getByRole("tab", { name: "아틀리에 솔리드 CAD" });
    fireEvent.click(target);
    expect(spy).toHaveBeenCalledWith("mod-5");
    expect(target.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("sample-active-panel").textContent).toBe("mod-5");
  });

  it("서랍 속 보조 모듈을 선택하면 상단 tablist에 7번째 자동 핀으로 승격된다", () => {
    render(<NavigatorHarness />);
    const drawer = screen.getByTestId("studio-hub-calm-drawer") as HTMLDetailsElement;
    drawer.open = true;
    const drawerGrid = screen.getByTestId("studio-hub-calm-drawer-grid");
    const extraBtn = within(drawerGrid).getByRole("button", { name: "스펙트럼 컴퓨트 스케줄러" });
    fireEvent.click(extraBtn);

    const tablist = screen.getByRole("tablist");
    const visibleTabs = within(tablist).getAllByRole("tab");
    expect(visibleTabs).toHaveLength(7);
    const autoPinned = within(tablist).getByRole("tab", { name: "스펙트럼 컴퓨트 스케줄러" });
    expect(autoPinned.getAttribute("aria-selected")).toBe("true");
    expect(autoPinned.getAttribute("data-pinned")).toBe("auto");
    expect(screen.getByTestId("sample-active-panel").getAttribute("aria-labelledby")).toBe(autoPinned.id);
  });

  it("자동 핀 상태에서 핵심 6핀 탭으로 돌아오면 상단 tablist가 즉시 6개로 복귀한다", () => {
    render(<NavigatorHarness initialActive="mod-8" />);
    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(7);

    fireEvent.click(within(tablist).getByRole("tab", { name: "물리 브러시 엔진" }));
    expect(within(tablist).getAllByRole("tab")).toHaveLength(6);
  });

  it("실시간 0-용어 검색이 한글·영문·다중 토큰을 즉시 필터링하고 클릭 시 활성화 후 검색어를 비운다", () => {
    render(<NavigatorHarness />);
    const input = screen.getByTestId("studio-hub-calm-search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "스펙트럼 스케줄러" } });

    const results = screen.getByTestId("studio-hub-calm-search-results");
    expect(results.textContent).toContain("1종");
    const matchBtn = within(results).getByRole("button", { name: "스펙트럼 컴퓨트 스케줄러" });
    matchBtn.focus();
    fireEvent.click(matchBtn);

    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByTestId("studio-hub-calm-search-results")).toBeNull();
    expect(screen.getByRole("tab", { name: "스펙트럼 컴퓨트 스케줄러" }).getAttribute("aria-selected")).toBe("true");
  });

  it("검색 결과가 0건이면 빈 상태 안내와 검색 초기화 버튼을 표시한다", () => {
    render(<NavigatorHarness />);
    const input = screen.getByTestId("studio-hub-calm-search-input") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "존재하지않는모듈XYZ" } });

    const results = screen.getByTestId("studio-hub-calm-search-results");
    expect(results.textContent).toContain("0종");
    expect(results.textContent).toContain("일치하는 모듈이 없습니다");

    fireEvent.click(within(results).getByRole("button", { name: "검색 초기화" }));
    expect(input.value).toBe("");
    expect(document.activeElement).toBe(input);
    expect(screen.queryByTestId("studio-hub-calm-search-results")).toBeNull();
  });

  it("검색창에서 Escape 키와 지우기 버튼으로 검색어를 즉시 비운다", () => {
    render(<NavigatorHarness />);
    const input = screen.getByTestId("studio-hub-calm-search-input") as HTMLInputElement;

    fireEvent.change(input, { target: { value: "조명" } });
    expect(screen.getByTestId("studio-hub-calm-search-results")).toBeTruthy();
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.value).toBe("");
    expect(screen.queryByTestId("studio-hub-calm-search-results")).toBeNull();

    fireEvent.change(input, { target: { value: "브러시" } });
    fireEvent.click(screen.getByTestId("studio-hub-calm-search-clear"));
    expect(input.value).toBe("");
  });

  it("키보드 ArrowRight·ArrowLeft·End·Home으로 상단 tablist를 순환 탐색한다", () => {
    render(<NavigatorHarness />);
    const tab1 = screen.getByRole("tab", { name: "물리 브러시 엔진" });
    fireEvent.keyDown(tab1, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "커스텀 브러시 랩" }).getAttribute("aria-selected")).toBe("true");

    const tab2 = screen.getByRole("tab", { name: "커스텀 브러시 랩" });
    fireEvent.keyDown(tab2, { key: "End" });
    expect(screen.getByRole("tab", { name: "협업 드로잉 동기화" }).getAttribute("aria-selected")).toBe("true");

    const tab6 = screen.getByRole("tab", { name: "협업 드로잉 동기화" });
    fireEvent.keyDown(tab6, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "물리 브러시 엔진" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tab1, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: "협업 드로잉 동기화" }).getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(tab6, { key: "Home" });
    expect(screen.getByRole("tab", { name: "물리 브러시 엔진" }).getAttribute("aria-selected")).toBe("true");
  });

  it("영문 모드에서 영문 탭 라벨·서랍 요약·숨김 배지·검색 결과를 렌더링한다", () => {
    render(<NavigatorHarness isEn />);
    const tablist = screen.getByRole("tablist", { name: "Sample pro hub modules" });
    expect(within(tablist).getByRole("tab", { name: "Atelier Solid CAD" })).toBeTruthy();
    expect(screen.getByTestId("studio-hub-calm-drawer").textContent).toContain("Browse all 20 pro modules");
    expect(screen.getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+14 more");

    const input = screen.getByTestId("studio-hub-calm-search-input");
    fireEvent.change(input, { target: { value: "SpectrumCompute" } });
    const results = screen.getByTestId("studio-hub-calm-search-results");
    expect(results.textContent).toContain("1 found");
    expect(within(results).getByRole("button", { name: "SpectrumCompute Scheduler" })).toBeTruthy();
  });

  it("모든 탭이 고정되어 숨길 모듈이 없으면 빈 서랍을 렌더링하지 않는다", () => {
    render(<NavigatorHarness tabs={SAMPLE_TABS.slice(0, 6)} pinnedIds={SAMPLE_PINNED} />);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab")).toHaveLength(6);
    expect(screen.queryByTestId("studio-hub-calm-drawer")).toBeNull();
  });

  it("pinnedIds가 비어 있거나 중복 ID를 포함해도 상위 6개를 중복 없이 안전하게 구성한다", () => {
    render(<NavigatorHarness pinnedIds={[]} />);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab")).toHaveLength(6);
    cleanup();

    render(<NavigatorHarness pinnedIds={["mod-1", "mod-1", "mod-2", "mod-999" as SampleTabId]} />);
    expect(within(screen.getByRole("tablist")).getAllByRole("tab")).toHaveLength(2);
  });

  it("접근성·모션 감소·터치 타깃(min-h-11)·overscroll-contain 계약을 준수한다", () => {
    render(<NavigatorHarness />);
    const nav = screen.getByTestId("studio-hub-calm-tab-navigator");
    for (const tab of within(nav).getAllByRole("tab")) {
      expect(tab.className).toContain("min-h-11");
      expect(tab.className).toContain("motion-reduce:transition-none");
      expect(tab.className).not.toContain("transition-all");
    }
    const searchInput = screen.getByTestId("studio-hub-calm-search-input");
    expect(searchInput.className).toContain("min-h-11");
    const drawerGrid = screen.getByTestId("studio-hub-calm-drawer-grid");
    expect(drawerGrid.className).toContain("overscroll-contain");
  });
});

describe("5대 프로 허브 실물 리디자인 & ToonStudio 고유 브랜드 라벨 정화", () => {
  it("BrushWasm3dFrontierHubPanel: 27개 모듈을 핵심 6핀과 검색 서랍으로 제공한다", async () => {
    await act(async () => {
      render(<BrushWasm3dFrontierHubPanel />);
    });
    const hub = screen.getByTestId("brush-wasm-3d-frontier-hub");
    expect(within(hub).getAllByRole("tab")).toHaveLength(6);
    expect(within(hub).getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+21종 숨김");

    fireEvent.click(within(hub).getByRole("tab", { name: /실시간 엔진 오라클/ }));
    expect(within(hub).getByRole("button", { name: "실시간 오라클 실행" })).toBeTruthy();
  });

  it("CreatorLabHardwareHubPanel: 32모듈을 핵심 6핀과 검색 서랍으로 제공한다", async () => {
    await act(async () => {
      render(<CreatorLabHardwareHubPanel />);
    });
    const hub = screen.getByTestId("creator-lab-hardware-hub");
    expect(within(hub).getAllByRole("tab")).toHaveLength(6);
    expect(within(hub).getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+26종 숨김");

    fireEvent.change(within(hub).getByTestId("studio-hub-calm-search-input"), { target: { value: "음향" } });
    const results = within(hub).getByTestId("studio-hub-calm-search-results");
    expect(within(results).getByRole("button", { name: "작업실 음향·웹 오디오" })).toBeTruthy();
  });

  it("OpenEcosystemWorkflowHubPanel: 25개 모듈의 검색과 개방형 도구 브리지를 유지한다", async () => {
    await act(async () => {
      render(<OpenEcosystemWorkflowHubPanel />);
    });
    const hub = screen.getByTestId("open-ecosystem-workflow-hub");
    expect(within(hub).getAllByRole("tab")).toHaveLength(6);
    expect(within(hub).getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+19종 숨김");
    expect(within(hub).getByRole("tab", { name: /개방형 도구 브리지/ })).toBeTruthy();

    fireEvent.change(within(hub).getByTestId("studio-hub-calm-search-input"), { target: { value: "스펙트럼 컴퓨트" } });
    const results = within(hub).getByTestId("studio-hub-calm-search-results");
    expect(within(results).getByRole("button", { name: "멀티코어·스펙트럼 컴퓨트 GPU 스케줄 예제" })).toBeTruthy();
    expect(hub.textContent ?? "").not.toMatch(/Vello|\bCSP\b/iu);
  });

  it("Csp3dUpgradeHubPanel: 24개 모듈과 아틀리에 솔리드 CAD 진입점을 유지한다", async () => {
    await act(async () => {
      render(<Csp3dUpgradeHubPanel />);
    });
    const hub = screen.getByTestId("csp-3d-upgrade-hub-panel");
    expect(hub.getAttribute("aria-label")).toContain("프로 작화·3D");
    expect(hub.getAttribute("aria-label")).not.toMatch(/클립스튜디오|CSP/iu);
    expect(within(hub).getAllByRole("tab")).toHaveLength(6);
    expect(within(hub).getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+18종 숨김");
    expect(within(hub).getByRole("tab", { name: "아틀리에 솔리드 CAD · 파라메트릭 도면" })).toBeTruthy();
    expect(hub.textContent ?? "").not.toMatch(/Shapr3D|클립스튜디오|\bCSP\b/iu);
  });

  it("AutoQaCollabHubPanel: 22모듈을 핵심 6핀 + 16서랍으로 압축하고 협업 드로잉 라벨을 반영한다", async () => {
    await act(async () => {
      render(<AutoQaCollabHubPanel />);
    });
    const hub = screen.getByTestId("auto-qa-collab-hub-panel");
    expect(within(hub).getAllByRole("tab")).toHaveLength(6);
    expect(within(hub).getByTestId("studio-hub-calm-hidden-badge").textContent).toBe("+16종 숨김");
    expect(within(hub).getByRole("tab", { name: "협업 드로잉 타일 동기화·병합 예제" })).toBeTruthy();
  });

  it("5대 프로 허브의 130개 모듈 중 초기 30개(허브당 6핀)를 노출한다", async () => {
    await act(async () => {
      render(
        <>
          <BrushWasm3dFrontierHubPanel />
          <CreatorLabHardwareHubPanel />
          <OpenEcosystemWorkflowHubPanel />
          <Csp3dUpgradeHubPanel />
          <AutoQaCollabHubPanel />
        </>,
      );
    });
    const visibleTabs = screen.getAllByRole("tab");
    expect(visibleTabs).toHaveLength(30);

    const navigators = screen.getAllByTestId("studio-hub-calm-tab-navigator");
    const totalModules = navigators.reduce(
      (sum, el) => sum + Number(el.getAttribute("data-total-tabs") ?? "0"),
      0,
    );
    expect(totalModules).toBe(130);
    expect(visibleTabs.length / totalModules).toBeLessThan(0.25);
  });

  it("영문 모드에서도 5대 프로 허브 사용자 노출 영역에 외부 경쟁사·라이브러리 브랜드명이 0건이다", async () => {
    i18nState.lang = "en";
    await act(async () => {
      render(
        <>
          <BrushWasm3dFrontierHubPanel />
          <CreatorLabHardwareHubPanel />
          <OpenEcosystemWorkflowHubPanel />
          <Csp3dUpgradeHubPanel />
          <AutoQaCollabHubPanel />
        </>,
      );
    });
    const forbiddenBrandRe = /\b(?:Vello|Hokusai|Shapr3D|CSP|Procreate|Photoshop|Magma|Rebelle|Blender)\b/iu;
    for (const hubTestId of [
      "brush-wasm-3d-frontier-hub",
      "creator-lab-hardware-hub",
      "open-ecosystem-workflow-hub",
      "csp-3d-upgrade-hub-panel",
      "auto-qa-collab-hub-panel",
    ]) {
      const section = screen.getByTestId(hubTestId);
      expect(section.getAttribute("aria-label") ?? "").not.toMatch(forbiddenBrandRe);
      expect(section.textContent ?? "").not.toMatch(forbiddenBrandRe);
    }
  });

  it("정적 계약: 공용 내비게이터 260줄 이하 · 6개 컴포넌트 파일에 Sparkles/transition-all/기본빈객체/원시hex 0건", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname);
    const navSource = fs.readFileSync(path.join(dir, "StudioHubCalmTabNavigator.tsx"), "utf8");
    expect(navSource.split("\n").length).toBeLessThanOrEqual(260);

    const componentFiles = [
      "StudioHubCalmTabNavigator.tsx",
      "BrushWasm3dFrontierHubPanel.tsx",
      "CreatorLabHardwareHubPanel.tsx",
      "OpenEcosystemWorkflowHubPanel.tsx",
      "Csp3dUpgradeHubPanel.tsx",
      "AutoQaCollabHubPanel.tsx",
    ];
    for (const fileName of componentFiles) {
      const source = fs.readFileSync(path.join(dir, fileName), "utf8");
      expect(source, `${fileName}: Sparkles 금지`).not.toMatch(/\bSparkles\b/u);
      expect(source, `${fileName}: transition-all 금지`).not.toContain("transition-all");
      expect(source, `${fileName}: = {} 기본 props 금지`).not.toMatch(/\)\s*=\s*\{\}/u);
      expect(source, `${fileName}: 원시 hex 색상 금지`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    }
  });
});
