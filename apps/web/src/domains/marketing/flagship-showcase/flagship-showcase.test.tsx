// @vitest-environment jsdom
import { existsSync, readFileSync, statSync } from "node:fs";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreatorHomeNavigation } from "../CreatorHomeNavigation";
import { FeaturesOverviewPage } from "../FeaturesOverviewPage";
import { HomeFlagshipInteractiveShowcase } from "./HomeFlagshipInteractiveShowcase";
import { HomeLiveTechProofStrip } from "./HomeLiveTechProofStrip";
import { StudioFeatureAtlasMenu } from "./StudioFeatureAtlasMenu";
import {
  ALL_ATLAS_FEATURES,
  BYOT_TOOLS,
  COMPARISON_MODES,
  CREATOR_ROLE_PRESETS,
  FEATURE_ATLAS_DOMAINS,
  FLAGSHIP_BRUSHES,
  FLAGSHIP_ENGINES,
  recommendByotStack,
  TIMEMACHINE_STAGES,
} from "./flagship-showcase-data";
import {
  LIVE_TECH_PROOFS,
  PROOF_GALLERY_SHEETS,
  runKubelkaMunk16BandBenchmark,
} from "./live-tech-proof-data";

const initialLang = useI18n.getState().lang;

function createMock2dContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
  } satisfies Partial<CanvasRenderingContext2D>;
}

function renderShowcase(lang: "ko" | "en" = "ko") {
  useI18n.setState({ lang });
  return render(
    <MemoryRouter>
      <HomeFlagshipInteractiveShowcase />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLang });
  vi.unstubAllGlobals();
});

describe("Wave 20 플래그십 쇼케이스 — 3초 물리 브러시 체험", () => {
  it("5종 물리 브러시 전환·포인터 드로잉·쿠벨카-문크 광학 혼색·지우기·캔버스 이동이 정상 동작한다", () => {
    const mockCtx = createMock2dContext();
    const canvas2d: {
      getContext(
        contextId: "2d",
        options?: CanvasRenderingContext2DSettings,
      ): Pick<CanvasRenderingContext2D, keyof typeof mockCtx> | null;
    } = HTMLCanvasElement.prototype;
    vi.spyOn(canvas2d, "getContext").mockImplementation((id) => (id === "2d" ? mockCtx : null));

    renderShowcase("ko");
    const canvas = screen.getByTestId("flagship-brush-canvas");
    expect(screen.getByTestId("flagship-stroke-count").textContent).toBe("획 0회");

    // 5종 브러시 모두 전환 및 포인터 드로잉 테스트
    for (const brush of FLAGSHIP_BRUSHES) {
      const btn = screen.getByTestId(`flagship-brush-${brush.id}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      fireEvent.pointerDown(canvas, { clientX: 60, clientY: 80, pointerId: 1, pressure: 0.7 });
      fireEvent.pointerMove(canvas, { clientX: 180, clientY: 130, pointerId: 1, pressure: 0.75 });
      fireEvent.pointerUp(canvas, { clientX: 180, clientY: 130, pointerId: 1 });
    }

    expect(screen.getByTestId("flagship-stroke-count").textContent).toBe("획 5회");
    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();

    // 수채화 모드에서 파랑 + 노랑 겹쳐 칠하기 -> 쿠벨카-문크 초록 혼색
    fireEvent.click(screen.getByTestId("flagship-brush-watercolor"));
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 2, pressure: 0.8 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 120, pointerId: 2 });
    fireEvent.click(screen.getByRole("button", { name: "사프란 노랑" }));
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 120, pointerId: 3, pressure: 0.8 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 120, pointerId: 3 });

    const status = screen.getByRole("status");
    expect(status.getAttribute("data-mixed")).toBe("true");
    expect(status.textContent).toContain("쿠벨카-문크");
    expect(mockCtx.arc).toHaveBeenCalled();

    // 지우기 및 1클릭 광학 시연
    fireEvent.click(screen.getByTestId("flagship-clear-btn"));
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 560, 280);
    expect(screen.getByTestId("flagship-stroke-count").textContent).toBe("획 0회");
    expect(status.getAttribute("data-mixed")).toBe("false");

    fireEvent.click(screen.getByTestId("flagship-km-demo-btn"));
    expect(status.getAttribute("data-mixed")).toBe("true");
    expect(screen.getByTestId("flagship-continue-canvas").getAttribute("href")).toBe("/studio/canvas");
  });
});

describe("Wave 20 플래그십 쇼케이스 — Before/After · 6대 엔진 · 직군 · 타임머신 · BYOT", () => {
  it("Before / After 비교 슬라이더 3모드 전환 및 분할 비율 조절이 동기화된다", () => {
    renderShowcase("ko");
    const stage = screen.getByTestId("flagship-compare-stage");
    const slider = screen.getByTestId("flagship-compare-slider") as HTMLInputElement;

    expect(stage.getAttribute("data-compare-mode")).toBe("brush");
    expect(screen.getByTestId("flagship-compare-value").textContent).toBe("52%");

    fireEvent.change(slider, { target: { value: "74" } });
    expect(screen.getByTestId("flagship-compare-value").textContent).toBe("74%");
    expect(stage.style.getPropertyValue("--fsh-split")).toBe("74%");

    for (const mode of COMPARISON_MODES) {
      const btn = screen.getByTestId(`flagship-compare-mode-${mode.id}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(stage.getAttribute("data-compare-mode")).toBe(mode.id);
    }
  });

  it("ToonStudio 6대 플래그십 엔진 카드가 지정된 정본 경로로 연결된다", () => {
    renderShowcase("ko");
    const grid = screen.getByTestId("flagship-engines-grid");
    const links = within(grid).getAllByRole("link");
    expect(links).toHaveLength(FLAGSHIP_ENGINES.length);
    expect(links.map((el) => el.getAttribute("href"))).toEqual([
      "/studio/canvas",
      "/tech",
      "/create",
      "/studio/canvas",
      "/compare/studio",
      "/features",
    ]);
  });

  it("직군별 4종 프리셋 전환 시 맞춤 핵심 기능 4개와 시작 경로가 즉시 바뀐다", () => {
    renderShowcase("ko");
    const launcher = screen.getByTestId("flagship-role-launcher");
    for (const role of CREATOR_ROLE_PRESETS) {
      const btn = within(launcher).getByTestId(`flagship-role-${role.id}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(within(launcher).getByTestId("flagship-role-primary-cta").getAttribute("href")).toBe(role.primaryHref);
      const featureItems = within(launcher).getAllByRole("listitem");
      expect(featureItems).toHaveLength(4);
    }
  });

  it("7단계 제작 타임머신 스크러버와 단계 버튼이 양방향 동기화된다", () => {
    renderShowcase("ko");
    const scrubber = screen.getByTestId("flagship-timemachine-scrubber") as HTMLInputElement;
    const indicator = screen.getByTestId("flagship-stage-indicator");
    const detail = screen.getByTestId("flagship-stage-detail");

    expect(TIMEMACHINE_STAGES).toHaveLength(7);
    expect(indicator.textContent).toBe("01 / 07");

    fireEvent.change(scrubber, { target: { value: "5" } });
    expect(indicator.textContent).toBe("05 / 07");
    expect(detail.textContent).toContain("3D 배경");

    fireEvent.click(screen.getByTestId("flagship-stage-7"));
    expect(scrubber.value).toBe("7");
    expect(indicator.textContent).toBe("07 / 07");
    expect(detail.textContent).toContain("7대 플랫폼 출고");
    expect(within(detail).getByRole("link").getAttribute("href")).toBe("/studio/publish");
  });

  it("BYOT 1분 조합 진단 위젯이 외부 툴 체크 상태에 따라 최적 하이브리드 조합을 추천한다", () => {
    renderShowcase("ko");
    const matcher = screen.getByTestId("flagship-byot-matcher");
    expect(BYOT_TOOLS).toHaveLength(6);
    expect(within(matcher).getByTestId("flagship-byot-count").textContent).toBe("2개 선택");

    // Blender 추가 체크
    fireEvent.click(within(matcher).getByTestId("flagship-byot-blender"));
    expect(within(matcher).getByTestId("flagship-byot-count").textContent).toBe("3개 선택");
    expect(within(matcher).getByTestId("flagship-byot-recommendation").textContent).toContain("Blender GLB");

    // 모두 해제 -> 순수 올인원 추천
    fireEvent.click(within(matcher).getByTestId("flagship-byot-csp"));
    fireEvent.click(within(matcher).getByTestId("flagship-byot-slack"));
    fireEvent.click(within(matcher).getByTestId("flagship-byot-blender"));
    expect(within(matcher).getByTestId("flagship-byot-count").textContent).toBe("0개 선택");
    expect(within(matcher).getByTestId("flagship-byot-recommendation").textContent).toContain("올인원");
    expect(recommendByotStack(["jira", "sheets"]).ctaHref).toBe("/production");
  });
});

describe("StudioFeatureAtlasMenu — 6대 영역 × 24개 핵심 기능 아틀라스", () => {
  it("1클릭 열기·검색·영역 필터·Escape 닫기 및 트리거 포커스 복원을 보장한다", () => {
    render(
      <MemoryRouter>
        <StudioFeatureAtlasMenu variant="page" />
      </MemoryRouter>,
    );

    expect(FEATURE_ATLAS_DOMAINS).toHaveLength(6);
    expect(ALL_ATLAS_FEATURES).toHaveLength(24);

    const trigger = screen.getByTestId("feature-atlas-trigger");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("dialog")).toBeNull();

    // 1클릭 열기 -> 검색창 자동 포커스
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const searchInput = within(dialog).getByTestId("feature-atlas-search");
    expect(document.activeElement).toBe(searchInput);

    // 24개 기능 링크와 필수 딥링크 6종 확인
    const links = within(dialog).getAllByRole("link");
    expect(links).toHaveLength(24);
    const hrefSet = new Set(links.map((el) => el.getAttribute("href")));
    for (const requiredHref of ["/studio/canvas", "/create", "/tech", "/compare/studio", "/features", "/learn/classroom"]) {
      expect(hrefSet.has(requiredHref), requiredHref).toBe(true);
    }

    // 실시간 검색 필터
    fireEvent.change(searchInput, { target: { value: "쿠벨카" } });
    expect(within(dialog).getAllByRole("link")).toHaveLength(1);
    expect(within(dialog).getByText("쿠벨카-문크 광학 수채")).toBeTruthy();

    // 결과 없음 상태 및 초기화
    fireEvent.change(searchInput, { target: { value: "zzzz-no-match" } });
    expect(within(dialog).getByTestId("feature-atlas-empty")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "검색 초기화" }));
    expect(within(dialog).getAllByRole("link")).toHaveLength(24);

    // Escape 닫기 + 트리거 포커스 복원
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("CreatorHomeNavigation과 FeaturesOverviewPage에서 기존 계약을 보존하며 1클릭 아틀라스를 제공한다", () => {
    const { unmount } = render(
      <MemoryRouter>
        <CreatorHomeNavigation locale="ko" />
      </MemoryRouter>,
    );
    expect(document.querySelectorAll(".ch-jump-links a")).toHaveLength(4);
    fireEvent.click(screen.getByTestId("feature-atlas-trigger"));
    expect(screen.getByRole("dialog")).toBeTruthy();
    unmount();

    render(
      <MemoryRouter>
        <FeaturesOverviewPage />
      </MemoryRouter>,
    );
    const trigger = screen.getByTestId("feature-atlas-trigger");
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("Wave 30B HomeLiveTechProofStrip — 5대 실측 엔진 · 2장 실물 갤러리 · 인브라우저 벤치마크", () => {
  it("HomeFlagshipInteractiveShowcase 최상단에 마운트되어 5대 실측 증명 칩과 상세 근거를 전환한다", () => {
    renderShowcase("ko");
    const strip = screen.getByTestId("home-live-tech-proof-strip");
    const brushCanvas = screen.getByTestId("flagship-brush-canvas");
    expect(strip.compareDocumentPosition(brushCanvas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    expect(LIVE_TECH_PROOFS).toHaveLength(5);
    const expectations: ReadonlyArray<readonly [string, readonly string[], string]> = [
      ["wasm64", ["2.80ms", ">4GiB", "30×"], "/tech"],
      ["webgpu", ["2.59ms", "복사 0회", "12종 혼합"], "/tech"],
      ["km-foley", ["16파장", "0.0000", "64.0 MiB"], "/studio/canvas"],
      ["bvh-npr", ["1,000소품", "10 드로우콜", "99%", "ΔE 54.35 → 0.60"], "/create"],
      ["byot-c2pa", ["CSP/Photoshop/Jira/Slack", "C2PA 2.1", "7대 플랫폼"], "/compare/studio"],
    ];

    for (const [id, tokens, expectedHref] of expectations) {
      const chip = within(strip).getByTestId(`live-proof-chip-${id}`);
      fireEvent.click(chip);
      expect(chip.getAttribute("aria-pressed")).toBe("true");
      const detail = within(strip).getByTestId("live-proof-detail");
      expect(detail.getAttribute("data-proof-id")).toBe(id);
      for (const token of tokens) {
        expect(detail.textContent).toContain(token);
      }
      expect(within(detail).getByTestId("live-proof-detail-cta").getAttribute("href")).toBe(expectedHref);
    }
  });

  it("실물 렌더링 브러시 증명 시트 2장이 경량 WebP로 존재하며 lazy 로드 · 중립 프레임 · Escape 확대 모달을 제공한다", () => {
    const assetBudgets: ReadonlyArray<readonly [string, number]> = [
      ["apps/web/public/showcase/brush-12media-proof.webp", 260 * 1024],
      ["apps/web/public/showcase/brush-8tips-km-proof.webp", 220 * 1024],
    ];
    for (const [assetPath, maxBytes] of assetBudgets) {
      expect(existsSync(assetPath), assetPath).toBe(true);
      expect(statSync(assetPath).size, assetPath).toBeLessThanOrEqual(maxBytes);
    }

    render(
      <MemoryRouter>
        <HomeLiveTechProofStrip lang="ko" />
      </MemoryRouter>,
    );

    const gallery = screen.getByTestId("live-proof-gallery");
    const images = within(gallery).getAllByRole("img");
    expect(images).toHaveLength(PROOF_GALLERY_SHEETS.length);
    expect(images.map((img) => img.getAttribute("src"))).toEqual([
      "/showcase/brush-12media-proof.webp",
      "/showcase/brush-8tips-km-proof.webp",
    ]);
    for (const img of images) {
      expect(img.getAttribute("loading")).toBe("lazy");
    }

    const trigger = screen.getByTestId("proof-sheet-zoom-media-12");
    expect(trigger.className).toContain("outline-1");
    expect(trigger.className).toContain("-outline-offset-1");

    fireEvent.click(trigger);
    const modal = screen.getByTestId("proof-sheet-modal");
    expect(modal.getAttribute("role")).toBe("dialog");
    expect(within(modal).getByRole("img").getAttribute("src")).toBe("/showcase/brush-12media-proof.webp");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("proof-sheet-modal")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("내 브라우저에서 직접 측정해 보기 버튼이 4대 실제 런타임 체크(Wasm64·WebGPU·P3·16파장 KM)를 실행해 결과 배지를 표시한다", async () => {
    const kmDirect = runKubelkaMunk16BandBenchmark(400);
    expect(kmDirect.greenDominant).toBe(true);
    expect(kmDirect.mixedOklch.startsWith("oklch(")).toBe(true);
    expect(kmDirect.peakWavelengthNm).toBeGreaterThanOrEqual(500);
    expect(kmDirect.peakWavelengthNm).toBeLessThanOrEqual(560);
    expect(kmDirect.elapsedMs).toBeGreaterThan(0);

    const requestAdapter = vi.fn(async () => ({ name: "mock-gpu-adapter" }));
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: { requestAdapter },
    });
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: query === "(color-gamut: p3)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));

    render(
      <MemoryRouter>
        <HomeLiveTechProofStrip lang="ko" />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("live-tech-benchmark-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("benchmark-badge-km")).toBeTruthy();
    });

    expect(requestAdapter).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("benchmark-badge-wasm64").getAttribute("data-state")).toMatch(/ready|fallback/u);
    expect(screen.getByTestId("benchmark-badge-webgpu").getAttribute("data-state")).toBe("ready");
    expect(screen.getByTestId("benchmark-badge-webgpu").textContent).toContain("WebGPU");
    expect(screen.getByTestId("benchmark-badge-p3").getAttribute("data-state")).toBe("ready");
    expect(screen.getByTestId("benchmark-badge-p3").textContent).toContain("Display-P3");
    const kmBadge = screen.getByTestId("benchmark-badge-km");
    expect(kmBadge.getAttribute("data-state")).toBe("ready");
    expect(kmBadge.textContent).toMatch(/\d+\.\d{2}ms/u);
    expect(kmBadge.textContent).toContain("초록 실측");

    // navigator.gpu 테스트 정리
    Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, "gpu");
  });
});

describe("Wave 20 다국어(KO/EN) 및 디자인·경계 위생 전수 검증", () => {
  it("영어 모드에서는 쇼케이스·실물 증명 스트립·확대 모달·기능 아틀라스 전체에 한글이 0건이다", async () => {
    renderShowcase("en");
    const root = screen.getByTestId("flagship-interactive-showcase");
    expect(root.textContent).not.toMatch(/[가-힣]/u);
    for (const el of root.querySelectorAll("[aria-label], [placeholder], [alt]")) {
      const attrs = `${el.getAttribute("aria-label") ?? ""}${el.getAttribute("placeholder") ?? ""}${el.getAttribute("alt") ?? ""}`;
      expect(attrs).not.toMatch(/[가-힣]/u);
    }

    fireEvent.click(screen.getByTestId("live-tech-benchmark-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("benchmark-badge-km")).toBeTruthy();
    });
    expect(root.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(screen.getByTestId("proof-sheet-zoom-tips-8-km"));
    const proofModal = screen.getByTestId("proof-sheet-modal");
    expect(proofModal.textContent).not.toMatch(/[가-힣]/u);
    for (const el of proofModal.querySelectorAll("[aria-label], [alt]")) {
      expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("alt") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
    fireEvent.keyDown(window, { key: "Escape" });

    fireEvent.click(screen.getByTestId("feature-atlas-trigger"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).not.toMatch(/[가-힣]/u);
    for (const el of dialog.querySelectorAll("[aria-label], [placeholder]")) {
      expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("placeholder") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
  });

  it("원시 hex/rgb/hsl 0건 · 줄 수 상한 · 비공개 creator import 0건 · '신규' 배지 0건 계약을 지킨다", () => {
    const files = [
      "apps/web/src/domains/marketing/flagship-showcase/HomeFlagshipInteractiveShowcase.tsx",
      "apps/web/src/domains/marketing/flagship-showcase/HomeLiveTechProofStrip.tsx",
      "apps/web/src/domains/marketing/flagship-showcase/live-tech-proof-data.ts",
      "apps/web/src/domains/marketing/flagship-showcase/live-tech-proof-strip.css",
      "apps/web/src/domains/marketing/flagship-showcase/StudioFeatureAtlasMenu.tsx",
      "apps/web/src/domains/marketing/flagship-showcase/FlagshipWorkflowLauncherPanel.tsx",
      "apps/web/src/domains/marketing/flagship-showcase/flagship-showcase-data.ts",
      "apps/web/src/domains/marketing/flagship-showcase/flagship-brush-engine.ts",
      "apps/web/src/domains/marketing/flagship-showcase/flagship-comparison-visual.tsx",
      "apps/web/src/domains/marketing/flagship-showcase/flagship-comparison.css",
      "apps/web/src/domains/marketing/flagship-showcase/flagship-showcase.css",
      "apps/web/src/domains/marketing/flagship-showcase/feature-atlas-menu.css",
    ] as const;

    const showcaseSrc = readFileSync(files[0], "utf8");
    const proofStripSrc = readFileSync(files[1], "utf8");
    const proofCssSrc = readFileSync(files[3], "utf8");
    const atlasSrc = readFileSync(files[4], "utf8");
    const cssSrc = readFileSync(files[10], "utf8");
    const atlasCssSrc = readFileSync(files[11], "utf8");

    expect(showcaseSrc.split("\n").length).toBeLessThanOrEqual(580);
    expect(proofStripSrc.split("\n").length).toBeLessThanOrEqual(380);
    expect(atlasSrc.split("\n").length).toBeLessThanOrEqual(380);

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      expect(content, `${file} raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(content, `${file} raw rgb/hsl`).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
      expect(content, `${file} eslint-disable`).not.toContain("eslint-disable");
      expect(content, `${file} private creator import`).not.toMatch(/domains\/creator\/(?!public)/u);
    }

    for (const styleText of [cssSrc, atlasCssSrc, proofCssSrc]) {
      expect(styleText).not.toContain("transition: all");
      expect(styleText).not.toContain("transition-all");
      expect(styleText).toContain("oklch(");
      expect(styleText).toContain("word-break: keep-all");
      expect(styleText).toContain("tabular-nums");
      expect(styleText).toContain("@media (prefers-reduced-motion: reduce)");
      expect(styleText).toContain(':root[data-design-theme="contrast"]');
      expect(styleText).toContain("@media (forced-colors: active)");
    }

    // 오픈 전 '신규' 배지 slop 부재 검증
    expect(showcaseSrc).not.toMatch(/>\s*신규\s*</u);
    expect(proofStripSrc).not.toMatch(/>\s*신규\s*</u);
    expect(atlasSrc).not.toMatch(/>\s*신규\s*</u);
  });
});
