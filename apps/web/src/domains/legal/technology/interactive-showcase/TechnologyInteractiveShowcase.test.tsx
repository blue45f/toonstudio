// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { repoPathExists } from "../engineering-repo-paths-test-kit";
import { TechnologyVisualGalleryStrip } from "../TechnologyVisualGalleryStrip";
import rawVisualGallerySource from "../TechnologyVisualGalleryStrip.tsx?raw";
import {
  ARCHITECTURE_BLUEPRINT_LAYERS,
  FIVE_STAGE_TOUR_ITEMS,
  InteractiveArchitectureBlueprint,
  InteractiveFiveStageTourPreview,
  InteractiveMathSandboxCard,
  M2_MAX_WASM_SIMD_KERNELS,
  QUALITY_SECURITY_ATTESTATIONS,
  QualitySecurityAttestationStrip,
  TCO_BENCHMARK_DIMENSIONS,
  TcoAndBenchmarkMatrix,
  TechnologyInteractiveShowcaseSection,
  computeKalmanScanoutMetrics,
  computePigmentMixComparison,
  computeWasmSimdBenchmarkBars,
} from "./index";

afterEach(() => {
  cleanup();
});

describe("인터랙티브 쇼케이스 순수 수식 · 벤치마크 모델 검증", () => {
  it("7밴드 Kubelka-Munk 감산 혼색이 50:50 배합에서 RGB 선형 평균보다 3.5배 이상 높은 채도를 유지하고 oklch만 반환한다", () => {
    const fiftyFifty = computePigmentMixComparison(50);
    expect(fiftyFifty.yellowRatioPercent).toBe(50);
    expect(fiftyFifty.blueRatioPercent).toBe(50);
    expect(fiftyFifty.rgbLinearOklch).toMatch(/^oklch\(/u);
    expect(fiftyFifty.kubelkaMunkOklch).toMatch(/^oklch\(/u);
    expect(fiftyFifty.chromaGainRatio).toBeGreaterThanOrEqual(3.5);
    expect(fiftyFifty.bands).toHaveLength(7);

    const clampedLow = computePigmentMixComparison(-25);
    const clampedHigh = computePigmentMixComparison(140);
    expect(clampedLow.blueRatioPercent).toBe(0);
    expect(clampedHigh.blueRatioPercent).toBe(100);
  });

  it("칼만 선행 예측 모델이 주사율(60/120/240Hz)과 예측 시간(0..8ms) 증가에 따라 체감 지연을 단조 감소시킨다", () => {
    const base60 = computeKalmanScanoutMetrics(60, 0);
    const pred60 = computeKalmanScanoutMetrics(60, 6);
    const pred240 = computeKalmanScanoutMetrics(240, 6);

    expect(pred60.perceivedLagMs).toBeLessThan(base60.perceivedLagMs);
    expect(pred240.rawPipelineLagMs).toBeLessThan(base60.rawPipelineLagMs);
    expect(pred240.perceivedLagMs).toBeGreaterThanOrEqual(1.1);
    expect(pred60.kalmanTrailEnd.x).toBeGreaterThan(pred60.rawTrailEnd.x);
  });

  it("Apple M2 Max 실측 가속 상수(19.82× / 6.96× / 4.07×)를 해상도별로 일관되게 계산한다", () => {
    const bench4k = computeWasmSimdBenchmarkBars("4k");
    const bench8k = computeWasmSimdBenchmarkBars("8k");

    expect(bench4k.rows.map((r) => r.speedupOverJs)).toEqual([19.82, 6.96, 4.07]);
    expect(bench8k.totalWasmSimdMs).toBeGreaterThan(bench4k.totalWasmSimdMs);
    for (const row of bench4k.rows) {
      expect(row.wasmSimdMs).toBeLessThan(row.jsMs);
      expect(row.nativeArm64Ms).toBeLessThan(row.wasmSimdMs);
    }
  });
});

describe("저장소 실재 경로 · 무-헥스(0 raw hex) · 언슬롭 문체 감사", () => {
  it("5계층 청사진·5단계 투어·6대 보증·SIMD 커널이 인용한 모든 저장소 파일 경로가 실제로 존재한다", () => {
    const citedPaths = [
      ...M2_MAX_WASM_SIMD_KERNELS.map((k) => k.kernelSource),
      ...ARCHITECTURE_BLUEPRINT_LAYERS.flatMap((layer) => layer.ownedModules),
      ...FIVE_STAGE_TOUR_ITEMS.map((stage) => stage.evidencePath),
      ...QUALITY_SECURITY_ATTESTATIONS.map((item) => item.evidencePath),
    ];

    expect(citedPaths.length).toBeGreaterThanOrEqual(20);
    for (const path of citedPaths) {
      expect(repoPathExists(path), `실재하지 않는 저장소 경로: ${path}`).toBe(true);
    }
  });

  it("interactive-showcase 내부 모든 소스 파일에 하드코딩 색(#hex/rgb/hsl), Sparkles, transition-all, AI 번역투가 없다", () => {
    const rawModules = import.meta.glob<string>(
      ["./*.ts", "./*.tsx", "./*.css", "!./*.test.tsx"],
      { query: "?raw", import: "default", eager: true },
    );
    const entries = Object.entries(rawModules);
    expect(entries.length).toBeGreaterThanOrEqual(8);

    for (const [file, content] of entries) {
      expect(content, `${file}: raw hex 금지`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(content, `${file}: rgb() 금지`).not.toMatch(/\brgba?\s*\(/u);
      expect(content, `${file}: hsl() 금지`).not.toMatch(/\bhsla?\s*\(/u);
      expect(content, `${file}: Sparkles 아이콘 금지`).not.toMatch(/\bSparkles\b/u);
      expect(content, `${file}: transition-all 금지`).not.toMatch(/\btransition-all\b/u);
      expect(content, `${file}: AI 번역투 금지`).not.toMatch(
        /하는 것을 가능하게 합니다|직관적인 경험을 제공합니다|원활한 워크플로우/u,
      );
    }
  });
});

describe("5개 쇼케이스 위젯 렌더링 · 상호작용 · 접근성 역할 검증", () => {
  it("InteractiveMathSandboxCard: 3개 탭 전환(클릭·키보드), 물감 슬라이더, 칼만 주사율, WASM 해상도 선택이 동작한다", () => {
    render(<InteractiveMathSandboxCard />);

    const tablist = screen.getByRole("tablist", { name: /수학·커널 실험 탭/u });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);

    // 탭 1: 안료 비율 슬라이더 조작
    const pigmentSlider = screen.getByLabelText(/안료 배합 비율/u);
    fireEvent.change(pigmentSlider, { target: { value: "75" } });
    expect(screen.getByText(/노랑 25% · 파랑 75%/u)).toBeTruthy();

    // 키보드 ArrowRight로 탭 2(칼만 펜 궤적 선행 예측) 이동
    fireEvent.keyDown(tabs[0]!, { key: "ArrowRight" });
    expect(tabs[1]?.getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "240Hz" }));
    const kalmanSlider = screen.getByLabelText(/칼만 선행 예측 시간/u);
    fireEvent.change(kalmanSlider, { target: { value: "6.5" } });
    expect(screen.getByText("+6.5 ms")).toBeTruthy();

    // 탭 3: Rust WASM64 SIMD 가속 배율 클릭 및 8K 해상도 전환
    fireEvent.click(tabs[2]!);
    expect(screen.getByText(/19\.82× 가속/u)).toBeTruthy();
    expect(screen.getByText(/6\.96× 가속/u)).toBeTruthy();
    expect(screen.getByText(/4\.07× 가속/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /8K 단행본 인쇄/u }));
    expect(screen.getByText(/33\.18 MP/u)).toBeTruthy();
  });

  it("InteractiveArchitectureBlueprint: 5개 계층 노드 클릭·키보드 탐색 시 소유 모듈·오프라인 권위·0B eager가 갱신된다", () => {
    const { container } = render(<InteractiveArchitectureBlueprint />);

    const blueprintTabs = screen.getAllByRole("tab");
    expect(blueprintTabs).toHaveLength(5);

    // 기본 선택은 3계층(rust-wasm64-simd)
    const detailPanel = container.querySelector("[data-active-blueprint-layer]");
    expect(detailPanel?.getAttribute("data-active-blueprint-layer")).toBe("rust-wasm64-simd");
    expect(screen.getByText("0B eager")).toBeTruthy();

    // 4계층(SQLite WASM · OPFS · Yjs CRDT) 클릭
    fireEvent.click(screen.getByRole("tab", { name: /4\. SQLite WASM · OPFS · Yjs CRDT/u }));
    expect(detailPanel?.getAttribute("data-active-blueprint-layer")).toBe("sqlite-opfs-crdt");
    expect(
      screen.getByText("apps/web/src/domains/creator/studio-local-database-runtime.ts"),
    ).toBeTruthy();

    // 키보드 ArrowDown으로 5계층(Cloudflare Edge · 서울 onpod API) 이동
    const fourthNode = screen.getByRole("tab", { name: /4\. SQLite WASM/u });
    fireEvent.keyDown(fourthNode, { key: "ArrowDown" });
    expect(detailPanel?.getAttribute("data-active-blueprint-layer")).toBe("edge-onpod-api");
    expect(screen.getByText("deploy/DEPLOY_MANIFEST.json")).toBeTruthy();
  });

  it("TcoAndBenchmarkMatrix: 6개 차원의 비교표를 렌더링하고 실측/구현 구조 필터를 전환한다", () => {
    render(<TcoAndBenchmarkMatrix />);

    expect(TCO_BENCHMARK_DIMENSIONS).toHaveLength(6);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(7); // 헤더 1 + 데이터 6

    // 커널 실측 1행과 헤더
    fireEvent.click(screen.getByRole("button", { name: /실측 \(Measured\)/u }));
    expect(within(table).getAllByRole("row")).toHaveLength(2);

    // 구조 비교 5행과 헤더
    fireEvent.click(screen.getByRole("button", { name: /구현 구조/u }));
    expect(within(table).getAllByRole("row")).toHaveLength(6);
  });

  it("InteractiveFiveStageTourPreview: 5단계 공정 전환과 Before/After 스크럽 슬라이더(0..100%)가 정상 동작한다", () => {
    const { container } = render(<InteractiveFiveStageTourPreview />);

    const stageTabs = screen.getAllByRole("tab");
    expect(stageTabs).toHaveLength(5);

    // 5단계(CMYK·오디오툰 출고 검수) 선택
    fireEvent.click(screen.getByRole("tab", { name: /5\. CMYK·오디오툰 출고 검수/u }));
    const activePanel = container.querySelector("[data-active-tour-stage]");
    expect(activePanel?.getAttribute("data-active-tour-stage")).toBe("cmyk-audiotoon-qa");

    // 스크럽 슬라이더를 85%로 이동 후 100% 프리셋 버튼 클릭
    const scrubSlider = screen.getByLabelText(/전후 비교 분할선 조절/u);
    fireEvent.change(scrubSlider, { target: { value: "85" } });
    expect(screen.getByText(/전후 비교: 85%/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(screen.getByText(/전후 비교: 100%/u)).toBeTruthy();
  });

  it("QualitySecurityAttestationStrip & TechnologyInteractiveShowcaseSection: 6대 보증 지표와 통합 5종 마운트를 검증한다", () => {
    const standalone = render(<QualitySecurityAttestationStrip />);
    expect(standalone.container.querySelectorAll("[data-attestation-card]")).toHaveLength(6);
    standalone.unmount();

    const { container } = render(<TechnologyInteractiveShowcaseSection />);

    expect(container.querySelector("[data-technology-interactive-showcase]")).not.toBeNull();
    expect(container.querySelector('[data-showcase-widget="math-sandbox"]')).not.toBeNull();
    expect(container.querySelector('[data-showcase-widget="architecture-blueprint"]')).not.toBeNull();
    expect(container.querySelector('[data-showcase-widget="five-stage-tour"]')).not.toBeNull();
    expect(container.querySelector('[data-showcase-widget="tco-benchmark-matrix"]')).not.toBeNull();
    expect(container.querySelector('[data-showcase-widget="quality-security-attestation"]')).not.toBeNull();

    expect(screen.getAllByText("관리 문서 무결성").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("샤드 타입체크").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("WCAG 2.2 AA 접근성 게이트").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("양자내성 WOTS+ · 영지식 소유권 증명").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("한국형 PII 선형 시간 마스킹").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("초기 번들 유입 0B").length).toBeGreaterThanOrEqual(1);

    const details = container.querySelector<HTMLDetailsElement>("details[data-attestation-disclosure]");
    expect(details).not.toBeNull();
    expect(details?.open).toBe(false);
    const summary = details?.querySelector("summary");
    expect(summary).not.toBeNull();
    fireEvent.click(summary!);
    expect(screen.getByText("pnpm run check:studio-eager-graph")).toBeTruthy();
  });

  it("TechnologyVisualGalleryStrip: 14개 쇼케이스 에셋(4 메달리온·6 배지·4 장르 플레이트), aria-pressed 전환, 8행 매트릭스 및 무-헥스 규칙을 검증한다", () => {
    expect(rawVisualGallerySource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(rawVisualGallerySource).not.toMatch(/\brgba?\s*\(/u);
    expect(rawVisualGallerySource).not.toMatch(/\bhsla?\s*\(/u);
    expect(rawVisualGallerySource).not.toMatch(/\btransition-all\b/u);

    const { container } = render(<TechnologyVisualGalleryStrip />);
    expect(container.querySelector("[data-technology-visual-gallery]")).not.toBeNull();

    const images = Array.from(container.querySelectorAll("img"));
    expect(images).toHaveLength(14);
    const hasPublicShowcaseAssets = repoPathExists("apps/web/public/assets/technology-showcase/manifest.json");
    for (const img of images) {
      const src = img.getAttribute("src") ?? "";
      expect(src).toMatch(/^\/assets\/technology-showcase\/[a-z0-9-]+\.(webp|svg)$/u);
      if (hasPublicShowcaseAssets) {
        expect(repoPathExists(`apps/web/public${src}`)).toBe(true);
      }
    }

    const murimButton = screen.getByRole("button", { name: "무협 운해 정자" });
    expect(murimButton.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(murimButton);
    expect(murimButton.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector('[data-genre-plate="murim"]')?.getAttribute("data-selected")).toBe("true");

    const matrixTable = screen.getByRole("table", { name: /운영 스택과 Waves 1~24 확장 엔진 대조표/u });
    expect(within(matrixTable).getAllByRole("row")).toHaveLength(9); // 헤더 1 + 운영 기반 8행
  });
});
