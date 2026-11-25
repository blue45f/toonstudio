// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ComponentType } from "react";

import { AutoQaCollabHubPanel } from "./AutoQaCollabHubPanel";
import { BrushWasm3dFrontierHubPanel } from "./BrushWasm3dFrontierHubPanel";
import { CreatorLabHardwareHubPanel } from "./CreatorLabHardwareHubPanel";
import { Csp3dUpgradeHubPanel } from "./Csp3dUpgradeHubPanel";
import { OpenEcosystemWorkflowHubPanel } from "./OpenEcosystemWorkflowHubPanel";

const language = vi.hoisted(() => ({ lang: "ko" }));
vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (select: (state: { readonly lang: string }) => unknown) => select(language),
}));

// 기본 탭은 대체하고, 검사 대상 모듈은 실제로 지연 로드한다.
vi.mock("../auto-qa-pixel-engine/AutoQaPixelScannerPanel", () => ({ AutoQaPixelScannerPanel: () => null }));
vi.mock("../brush-physics-pro/StudioBrushPhysicsProPanel", () => ({ StudioBrushPhysicsProPanel: () => null }));
vi.mock("../creator-experience-calibrator/StudioCreatorCalibratorPanel", () => ({ StudioCreatorCalibratorPanel: () => null }));
vi.mock("../csp-puppet-warp/PuppetWarpStudioPanel", () => ({ PuppetWarpStudioPanel: () => null }));
vi.mock("../dynamic-workflow-ecosystem/StudioDynamicWorkflowPanel", () => ({ StudioDynamicWorkflowPanel: () => null }));

interface ExampleCase {
  readonly ko: string;
  readonly en: string;
  readonly panel: string;
  readonly Hub: ComponentType;
  readonly load: () => Promise<unknown>;
}

const cases: readonly ExampleCase[] = [
  { ko: "모바일 크기·독서 가독성 예제", en: "Mobile Size · Reading Legibility Examples", panel: "studio-mobile-reader-preview-panel", Hub: AutoQaCollabHubPanel, load: () => import("../mobile-reader-preview-sim") },
  { ko: "컷 호흡·썸네일 수치 예제", en: "Panel Rhythm · Thumbnail Metric Examples", panel: "studio-episode-pacing-thumbnail-panel", Hub: AutoQaCollabHubPanel, load: () => import("../episode-pacing-thumbnail-lab") },
  { ko: "캐릭터 설정·표정 조판 예제", en: "Character Sheet · Expression Layout Examples", panel: "studio-character-sheet-bible-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../character-sheet-bible-studio") },
  { ko: "레이어 검수·인수인계 예제", en: "Layer Review · Handoff Examples", panel: "studio-assistant-handoff-kit-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../assistant-handoff-qa-kit") },
  { ko: "도구 탐색·작업 준비", en: "Tool Finder · Work Preparation", panel: "atelier-craft-launcher-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../atelier-craft-launcher") },
  { ko: "컷 높이·여백·읽기 호흡 예제", en: "Panel Size · Gutter · Rhythm Examples", panel: "studio-webtoon-panel-rhythm-panel", Hub: AutoQaCollabHubPanel, load: () => import("../webtoon-panel-rhythm-studio") },
  { ko: "작업실 음향·웹 오디오", en: "Atelier Sound · Web Audio", panel: "atelier-foley-mixer-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../atelier-foley-mixer") },
  { ko: "저랭크 학습·캐시 계산 예제", en: "Low-Rank Learning · Cache Examples", panel: "federated-lora-stream-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../federated-style-lora") },
  { ko: "한글 조판·SVG 글자 배치 예제", en: "Korean Typesetting · SVG Text Examples", panel: "korean-lettering-sfx-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../korean-lettering-sfx-engine") },
  { ko: "카메라 투영·시선 동선 예제", en: "Camera Projection · Eye-Flow Examples", panel: "cinematography-director-panel", Hub: AutoQaCollabHubPanel, load: () => import("../webtoon-cinematography-director") },
  { ko: "색상 대비·색각 변환 예제", en: "Color Contrast · Vision Simulation Examples", panel: "color-script-a11y-panel", Hub: AutoQaCollabHubPanel, load: () => import("../color-script-accessibility-lab") },
  { ko: "성능 수치·설정 제안 예제", en: "Performance Metrics · Setting Examples", panel: "studio-perf-doctor-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../studio-perf-doctor") },
  { ko: "단축키·배치 제안 예제", en: "Shortcut · Layout Examples", panel: "ergonomics-shortcut-master-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../ergonomics-shortcut-master") },
  { ko: "하늘·조명·그림자 수치 예제", en: "Sky · Lighting · Shadow Examples", panel: "studio-3d-lighting-rig-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../studio-3d-lighting-rig") },
  { ko: "액션·로맨스 SVG 효과 예제", en: "Action · Romance SVG Examples", panel: "studio-action-fx-lab-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../action-fx-procedural-lab") },
  { ko: "유료전환·굿즈·정산 가정 계산", en: "Funnel · Goods · Settlement Estimates", panel: "creator-monetization-planner-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../creator-monetization-planner") },
  { ko: "오프라인 병합·복구·잠금 예제", en: "Offline Merge · Recovery · Lease Examples", panel: "offline-resilience-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../offline-crdt-resilience") },
  { ko: "핀·검수 메모 예제", en: "Pin · Review Note Examples", panel: "studio-visual-pin-review-panel", Hub: AutoQaCollabHubPanel, load: () => import("../visual-pin-review-studio") },
  { ko: "대사·배경음·효과음 큐 예제", en: "Dialogue · Music · Sound Cue Examples", panel: "studio-webtoon-audio-cue-panel", Hub: AutoQaCollabHubPanel, load: () => import("../webtoon-audio-cue-director") },
  { ko: "무드보드·팔레트 예제", en: "Moodboard · Palette Examples", panel: "studio-editorial-moodboard-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../editorial-moodboard-palette") },
  { ko: "표정·포즈 제안 예제", en: "Expression · Pose Suggestion Examples", panel: "studio-char-expression-pose-advisor-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../char-expression-pose-advisor") },
  { ko: "IP 피칭·수익 가정 예제", en: "IP Pitch · Revenue Assumption Examples", panel: "studio-global-ip-pitch-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../global-ip-pitch-studio") },
  { ko: "펜 입력·보정 계산 예제", en: "Pen Input · Calibration Examples", panel: "pro-digitizer-calibrator-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../pro-digitizer-hid-engine") },
  { ko: "기기 배치·시간 예측 예제", en: "Device Layout · Timing Estimate Examples", panel: "studio-spatial-wearable-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../spatial-wearable-studio") },
  { ko: "말풍선·효과음 배치 예제", en: "Balloon · Sound Effect Placement Examples", panel: "studio-balloon-sfx-proposer-panel", Hub: AutoQaCollabHubPanel, load: () => import("../balloon-sfx-placement-proposer") },
  { ko: "컷별 설정집 대조 예제", en: "Cut-by-Cut Model Sheet Examples", panel: "modelsheet-drift-coach-panel", Hub: AutoQaCollabHubPanel, load: () => import("../crosscut-modelsheet-drift-coach") },
  { ko: "컷 조명·색온도 제안 예제", en: "Scene Lighting · Color Temperature Examples", panel: "studio-scene-lighting-advisor-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../scene-lighting-atmosphere-advisor") },
  { ko: "카메라 구도·시선 축 예제", en: "Camera Framing · Sightline Examples", panel: "studio-camera-framing-coach-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../camera-framing-continuity-coach") },
  { ko: "손·소품 그립 제안 예제", en: "Hand · Prop Grip Examples", panel: "studio-hand-prop-autogrip-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../hand-prop-autogrip-assistant") },
  { ko: "브러시 질감 예제", en: "Brush Texture Examples", panel: "tactile-brush-texture-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../tactile-brush-texture-studio") },
  { ko: "한 줄 연출 예제", en: "One-Line Direction Examples", panel: "studio-oneline-orchestrator-panel", Hub: AutoQaCollabHubPanel, load: () => import("../oneline-multi-advisor-chain") },
  { ko: "스크롤 컷 호흡 예제", en: "Scroll Pacing Examples", panel: "studio-scroll-pacing-composer-panel", Hub: AutoQaCollabHubPanel, load: () => import("../scroll-pacing-tension-composer") },
  { ko: "화풍·재질 비교 예제", en: "Art Style · Material Examples", panel: "studio-style-spectrum-guardian-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../style-spectrum-guardian") },
  { ko: "집중·화면 이동·햅틱 예제", en: "Focus · View Movement · Haptic Examples", panel: "studio-focus-pan-haptic-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../focus-pan-haptic-studio") },
  { ko: "작업 도구 배치·기기 예산 예제", en: "Tool Layout · Device Budget Examples", panel: "studio-adaptive-calm-guard-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../adaptive-calm-stack-guard") },
  { ko: "WASM 전환 예산 예제", en: "WASM Migration Budget Examples", panel: "studio-native-wasm-migration-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../native-wasm-migration-studio") },
  { ko: "크레용·연필 질감과 소리", en: "Crayon and Pencil Texture · Sound", panel: "drymedia-crayon-audio-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../drymedia-crayon-audio-engine") },
  { ko: "브러시 물리 모형 비교", en: "Brush Physics Model Comparison", panel: "studio-six-physics-brush-lab", Hub: Csp3dUpgradeHubPanel, load: () => import("../six-physics-brush-lab") },
  { ko: "페이퍼크래프트 전개도와 접힘 미리보기", en: "Papercraft Dieline and Fold Preview", panel: "papercraft-unfold-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../papercraft-3d-unfold-goods") },
  { ko: "기기별 NPU·GPU 배치 계획", en: "Device NPU and GPU Planning", panel: "studio-heterogeneous-silicon-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../heterogeneous-npu-runtime") },
  { ko: "Rust WASM 전환 계획", en: "Rust WASM Expansion Planning", panel: "studio-rust-expansion-architect-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../rust-full-expansion-planner") },
  { ko: "멀티코어·스펙트럼 컴퓨트 GPU 스케줄 예제", en: "Multicore and SpectrumCompute GPU Scheduling Examples", panel: "studio-multicore-vello-scheduler-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../multicore-gpu-vello-scheduler") },
  { ko: "Rust WASM 이식·검증 예제", en: "Rust WASM Porting and Parity Exercise", panel: "studio-rust-hotspot-porter-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../rust-hotspot-parity-porter") },
  { ko: "협업 드로잉 타일 동기화·병합 예제", en: "Collaborative Drawing Tile Sync & Merge Examples", panel: "studio-distributed-crdt-sync-panel", Hub: AutoQaCollabHubPanel, load: () => import("../distributed-crdt-tile-sync") },
  { ko: "대형 캔버스 타일·저장 예제", en: "Large Canvas Tile and Storage Examples", panel: "studio-giga-canvas-swap-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../giga-canvas-virtual-swap") },
  { ko: "확대와 좌표 정밀도 예제", en: "Zoom and Coordinate Precision Examples", panel: "studio-infinite-zoom-spatial-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../infinite-zoom-spatial-gpu") },
  { ko: "의존성 전환 계획", en: "Dependency Cutover Planning", panel: "dependency-wasm64-audit-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../dependency-wasm64-auditor") },
  { ko: "2D 조명·그림자 예제", en: "2D Lighting and Shadow Examples", panel: "studio-webgpu-radiance-panel", Hub: BrushWasm3dFrontierHubPanel, load: () => import("../webgpu-radiance-cascades") },
  { ko: "필압 곡선과 획 보정 예제", en: "Pressure Curve and Stroke Compensation Examples", panel: "studio-stylus-neural-compensation-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../stylus-neural-compensation") },
  { ko: "절차적 에셋 미리보기", en: "Procedural Asset Preview", panel: "procedural-asset-synth-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../procedural-asset-synthesizer") },
  { ko: "NPU 그래프와 열 제어 예제", en: "NPU Graph and Thermal Control Examples", panel: "webnn-npu-thermal-panel", Hub: OpenEcosystemWorkflowHubPanel, load: () => import("../webnn-npu-thermal-compiler") },
  { ko: "아틀리에 솔리드 CAD · 파라메트릭 도면", en: "Atelier Solid CAD · Parametric Drawing", panel: "shapr3d-cad-panel", Hub: Csp3dUpgradeHubPanel, load: () => import("../shapr3d-parametric-cad") },
  { ko: "도구 배치와 색상 대비 예제", en: "Tool Layout and Palette Contrast Examples", panel: "calm-intent-ux-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../calm-intent-ux-orchestrator") },
  { ko: "작화 출처 원장 예제", en: "Stroke Provenance Ledger Examples", panel: "human-ink-ledger-panel", Hub: AutoQaCollabHubPanel, load: () => import("../human-ink-provenance-ledger") },
  { ko: "셰이더 준비·영상 인코딩 계획", en: "Shader Preparation and Video Encoding Plans", panel: "studio-shader-prewarm-webcodecs-panel", Hub: AutoQaCollabHubPanel, load: () => import("../shader-prewarm-webcodecs") },
  { ko: "컷 구도와 대사 배치 예제", en: "Panel Framing and Dialogue Layout Examples", panel: "oneshot-cut-director-panel", Hub: CreatorLabHardwareHubPanel, load: () => import("../oneshot-cut-director") },
];

afterEach(cleanup);

describe("새 예제의 단일 진입점과 화면 언어", () => {
  it.each(["ko", "en"] as const)("%s의 다섯 허브에 각 진입점이 하나씩 있다", async (locale) => {
    language.lang = locale;
    await act(async () => {
      render(<><AutoQaCollabHubPanel /><BrushWasm3dFrontierHubPanel /><CreatorLabHardwareHubPanel /><Csp3dUpgradeHubPanel /><OpenEcosystemWorkflowHubPanel /></>);
    });
    for (const drawer of document.querySelectorAll('details[data-testid="studio-hub-calm-drawer"]')) {
      (drawer as HTMLDetailsElement).open = true;
    }
    for (const entry of cases) {
      const pinnedTabs = screen.queryAllByRole("tab", { name: entry[locale] });
      const drawerButtons = screen.queryAllByRole("button", { name: entry[locale] });
      expect(pinnedTabs.length + drawerButtons.length).toBe(1);
    }
  });

  for (const entry of cases) {
    it.each(["ko", "en"] as const)(`${entry.ko} %s: 선택 후 실제 패널을 같은 언어로 연다`, async (locale) => {
      language.lang = locale;
      // 자식 코드 준비와 UI 선택 검증을 분리해 콜드 컴파일 시간을 화면 대기 시간으로 오인하지 않는다.
      await entry.load();
      const Hub = entry.Hub;
      await act(async () => { render(<Hub />); });
      expect(screen.queryByTestId(entry.panel)).toBeNull();
      for (const drawer of document.querySelectorAll('details[data-testid="studio-hub-calm-drawer"]')) {
        (drawer as HTMLDetailsElement).open = true;
      }
      const pinnedTabs = screen.queryAllByRole("tab", { name: entry[locale] });
      const drawerButtons = screen.queryAllByRole("button", { name: entry[locale] });
      expect(pinnedTabs.length + drawerButtons.length).toBe(1);
      const trigger = pinnedTabs[0] ?? drawerButtons[0];
      if (!trigger) throw new Error("예제 진입 탭이 없습니다.");
      await act(async () => { fireEvent.click(trigger); });
      const panel = await screen.findByTestId(entry.panel, undefined, { timeout: 5_000 });
      const activeTab = screen.getByRole("tab", { name: entry[locale] });
      expect(activeTab.getAttribute("aria-selected")).toBe("true");
      if (entry.panel === "studio-editorial-moodboard-panel") {
        const guide = within(panel).getByTestId("spectrum-domain-pigment-guide");
        expect(within(guide).getAllByRole("listitem", { hidden: true })).toHaveLength(5);
      }
      const title = within(panel).getAllByRole("heading")[0]?.textContent ?? "";
      expect(title.length).toBeGreaterThan(0);
      expect(/[가-힣]/u.test(title)).toBe(locale === "ko");
      expect(panel.closest('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(activeTab.id);
    });
  }
});
