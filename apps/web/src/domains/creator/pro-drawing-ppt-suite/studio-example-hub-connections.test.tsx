// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutoQaCollabHubPanel } from "./AutoQaCollabHubPanel";
import { BrushWasm3dFrontierHubPanel } from "./BrushWasm3dFrontierHubPanel";
import { CreatorLabHardwareHubPanel } from "./CreatorLabHardwareHubPanel";
import { Csp3dUpgradeHubPanel } from "./Csp3dUpgradeHubPanel";
import { OpenEcosystemWorkflowHubPanel } from "./OpenEcosystemWorkflowHubPanel";

const language = vi.hoisted(() => ({ lang: "ko" }));
vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (select: (state: { readonly lang: string }) => unknown) => select(language),
}));

// 기존 기본 탭의 렌더러는 이 검증 범위가 아니다. 새 열 개의 모듈은 실제로 지연 로드한다.
vi.mock("../auto-qa-pixel-engine/AutoQaPixelScannerPanel", () => ({ AutoQaPixelScannerPanel: () => null }));
vi.mock("../brush-physics-pro/StudioBrushPhysicsProPanel", () => ({ StudioBrushPhysicsProPanel: () => null }));
vi.mock("../creator-experience-calibrator/StudioCreatorCalibratorPanel", () => ({ StudioCreatorCalibratorPanel: () => null }));
vi.mock("../csp-puppet-warp/PuppetWarpStudioPanel", () => ({ PuppetWarpStudioPanel: () => null }));
vi.mock("../dynamic-workflow-ecosystem/StudioDynamicWorkflowPanel", () => ({ StudioDynamicWorkflowPanel: () => null }));

const cases = [
  { ko: "저랭크 학습·캐시 계산 예제", en: "Low-Rank Learning · Cache Examples", panel: "federated-lora-stream-panel" },
  { ko: "한글 조판·SVG 글자 배치 예제", en: "Korean Typesetting · SVG Text Examples", panel: "korean-lettering-sfx-panel" },
  { ko: "카메라 투영·시선 동선 예제", en: "Camera Projection · Eye-Flow Examples", panel: "cinematography-director-panel" },
  { ko: "색상 대비·색각 변환 예제", en: "Color Contrast · Vision Simulation Examples", panel: "color-script-a11y-panel" },
  { ko: "성능 수치·설정 제안 예제", en: "Performance Metrics · Setting Examples", panel: "studio-perf-doctor-panel" },
  { ko: "단축키·배치 제안 예제", en: "Shortcut · Layout Examples", panel: "ergonomics-shortcut-master-panel" },
  { ko: "하늘·조명·그림자 수치 예제", en: "Sky · Lighting · Shadow Examples", panel: "studio-3d-lighting-rig-panel" },
  { ko: "액션·로맨스 SVG 효과 예제", en: "Action · Romance SVG Examples", panel: "studio-action-fx-lab-panel" },
  { ko: "유료전환·굿즈·정산 가정 계산", en: "Funnel · Goods · Settlement Estimates", panel: "creator-monetization-planner-panel" },
  { ko: "오프라인 병합·복구·잠금 예제", en: "Offline Merge · Recovery · Lease Examples", panel: "offline-resilience-panel" },
] as const;

afterEach(cleanup);

describe("새 예제의 단일 진입점과 화면 언어", () => {
  it.each(["ko", "en"] as const)("%s 허브에서 열 개의 실제 패널을 한 번씩 연다", async (locale) => {
    language.lang = locale;
    render(<><AutoQaCollabHubPanel /><BrushWasm3dFrontierHubPanel /><CreatorLabHardwareHubPanel /><Csp3dUpgradeHubPanel /><OpenEcosystemWorkflowHubPanel /></>);
    for (const entry of cases) {
      const tabs = screen.getAllByRole("tab", { name: entry[locale] });
      expect(tabs).toHaveLength(1);
      const tab = tabs[0];
      if (!tab) throw new Error("예제 진입 탭이 없습니다.");
      fireEvent.click(tab);
      // 컴파일이 겹치는 CI에서도 지연 모듈의 로딩 완료를 기다린다. 성능은 이 검증의 대상이 아니다.
      const panel = await screen.findByTestId(entry.panel, undefined, { timeout: 5_000 });
      expect(tab.getAttribute("aria-selected")).toBe("true");
      const title = within(panel).getAllByRole("heading")[0]?.textContent ?? "";
      expect(title.length).toBeGreaterThan(0);
      expect(/[가-힣]/u.test(title)).toBe(locale === "ko");
      expect(panel.closest('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(tab.id);
    }
  });
});
