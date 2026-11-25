// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { HomeInteractiveWowShowcase } from "./HomeInteractiveWowShowcase";
import {
  buildPigmentMoodStyle,
  clampCurtainPercent,
  CURTAIN_KEYBOARD_LARGE_STEP,
  CURTAIN_KEYBOARD_STEP,
  DEFAULT_CURTAIN_PERCENT,
  HOME_PIGMENT_MOODS,
  PIPELINE_CURTAIN_STAGES,
  resolveCurtainStage,
  resolveHomePigmentMood,
  resolveStudioTailorMode,
  stepCurtainPercent,
  STUDIO_TAILOR_MODES,
} from "./home-live-staging-engine";

const initialLanguage = useI18n.getState().lang;

function createMockCanvas2dContext() {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    ellipse: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fillText: vi.fn(),
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
  } satisfies Partial<CanvasRenderingContext2D>;
}

function renderShowcase(lang: "ko" | "en" = "ko") {
  useI18n.setState({ lang });
  return render(
    <MemoryRouter>
      <HomeInteractiveWowShowcase />
    </MemoryRouter>,
  );
}

function extractOklchHues(source: string): number[] {
  const hues: number[] = [];
  for (const match of source.matchAll(/oklch\(\s*[0-9.]+\s+[0-9.]+\s+([0-9.]+)/gu)) {
    const hue = Number.parseFloat(match[1] ?? "");
    if (Number.isFinite(hue)) hues.push(hue);
  }
  return hues;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
  vi.unstubAllGlobals();
});

describe("home-live-staging-engine 순수 상태·데이터 엔진", () => {
  it("clampCurtainPercent는 0~100 경계 클램핑·반올림·비유한값 폴백을 결정론적으로 처리한다", () => {
    expect(clampCurtainPercent(-18)).toBe(0);
    expect(clampCurtainPercent(0)).toBe(0);
    expect(clampCurtainPercent(49.6)).toBe(50);
    expect(clampCurtainPercent(145)).toBe(100);
    expect(clampCurtainPercent(Number.NaN)).toBe(DEFAULT_CURTAIN_PERCENT);
    expect(clampCurtainPercent(Number.POSITIVE_INFINITY)).toBe(DEFAULT_CURTAIN_PERCENT);
  });

  it("resolveCurtainStage는 4단계 경계(0~25/25~50/50~75/75~100%)와 추천 라우트를 정확히 판정한다", () => {
    expect(PIPELINE_CURTAIN_STAGES).toHaveLength(4);
    const boundaries = [
      [0, "rough", "/story-lab"],
      [24, "rough", "/story-lab"],
      [25, "ink", "/studio/canvas"],
      [49, "ink", "/studio/canvas"],
      [50, "color", "/studio/new?lane=blank"],
      [74, "color", "/studio/new?lane=blank"],
      [75, "finish", "/studio/comic"],
      [100, "finish", "/studio/comic"],
    ] as const;

    for (const [percent, expectedId, expectedHref] of boundaries) {
      const resolved = resolveCurtainStage(percent);
      expect(resolved.stage.id).toBe(expectedId);
      expect(resolved.stage.routeHref).toBe(expectedHref);
      expect(resolved.percent).toBe(percent);
    }
  });

  it("resolveCurtainStage의 레이어 불투명도는 0%→100% 구간에서 단조 증가하며 [0, 1]에 머문다", () => {
    const start = resolveCurtainStage(0);
    const midInk = resolveCurtainStage(38);
    const midColor = resolveCurtainStage(62);
    const end = resolveCurtainStage(100);

    expect(start.inkLayerOpacity).toBe(0);
    expect(start.colorLayerOpacity).toBe(0);
    expect(start.finishLayerOpacity).toBe(0);

    expect(midInk.inkLayerOpacity).toBe(1);
    expect(midInk.colorLayerOpacity).toBeGreaterThan(0);
    expect(midInk.finishLayerOpacity).toBe(0);

    expect(midColor.colorLayerOpacity).toBe(1);
    expect(end.inkLayerOpacity).toBe(1);
    expect(end.colorLayerOpacity).toBe(1);
    expect(end.finishLayerOpacity).toBe(1);
  });

  it("stepCurtainPercent는 Arrow·Shift·Page·Home·End 키 입력을 정확히 계산하고 무관한 키는 무시한다", () => {
    expect(stepCurtainPercent(50, "ArrowRight")).toBe(50 + CURTAIN_KEYBOARD_STEP);
    expect(stepCurtainPercent(50, "ArrowLeft")).toBe(50 - CURTAIN_KEYBOARD_STEP);
    expect(stepCurtainPercent(50, "ArrowRight", true)).toBe(50 + CURTAIN_KEYBOARD_LARGE_STEP);
    expect(stepCurtainPercent(50, "ArrowLeft", true)).toBe(50 - CURTAIN_KEYBOARD_LARGE_STEP);
    expect(stepCurtainPercent(40, "PageUp")).toBe(65);
    expect(stepCurtainPercent(40, "PageDown")).toBe(15);
    expect(stepCurtainPercent(62, "Home")).toBe(0);
    expect(stepCurtainPercent(62, "End")).toBe(100);
    expect(stepCurtainPercent(62, "Enter")).toBeNull();
  });

  it("HOME_PIGMENT_MOODS는 탈-바이올렛 5대 안료(28°·245°·72°·158°·198°)와 --hwow-active-pigment 변수를 제공한다", () => {
    expect(HOME_PIGMENT_MOODS.map((m) => [m.id, m.hueDeg])).toEqual([
      ["draw", 28],
      ["3d", 245],
      ["character", 72],
      ["market", 158],
      ["collab", 198],
    ]);

    for (const mood of HOME_PIGMENT_MOODS) {
      expect(mood.hueDeg < 270 || mood.hueDeg > 320).toBe(true);
      expect(resolveHomePigmentMood(mood.id)).toEqual(mood);
      const style = buildPigmentMoodStyle(mood.id);
      expect(style["--hwow-active-pigment"]).toContain(`--spectrum-pigment-${mood.id}`);
      expect(style["--hwow-active-pigment"]).not.toMatch(/#[0-9a-fA-F]{3,8}|\brgba?\(|\bhsla?\(/u);
    }
  });

  it("STUDIO_TAILOR_MODES는 3개 작업 방식마다 중복 없는 추천 도구 3종을 제공한다", () => {
    expect(STUDIO_TAILOR_MODES.map((m) => m.id)).toEqual(["solo", "team", "scene3d"]);
    for (const mode of STUDIO_TAILOR_MODES) {
      expect(resolveStudioTailorMode(mode.id)).toEqual(mode);
      expect(mode.tools).toHaveLength(3);
      const uniqueHrefs = new Set(mode.tools.map((tool) => tool.href));
      expect(uniqueHrefs.size).toBe(3);
    }
  });
});

describe("HomeInteractiveWowShowcase", () => {
  it("getContext가 null인 jsdom 환경에서도 포인터 드로잉과 버튼 체험이 예외 없이 동작한다", () => {
    renderShowcase("ko");
    const canvas = screen.getByTestId("hwow-live-canvas");
    expect(screen.getByTestId("hwow-stroke-count").textContent).toBe("획 0회");

    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 60, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 160, clientY: 110, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 160, clientY: 110, pointerId: 1 });

    expect(screen.getByTestId("hwow-stroke-count").textContent).toBe("획 1회");
    expect(screen.getByRole("status").textContent).toContain("코발트 블루");

    fireEvent.click(screen.getByRole("button", { name: "사프란 옐로우" }));
    expect(screen.getByRole("button", { name: "사프란 옐로우" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.pointerDown(canvas, { clientX: 120, clientY: 90, pointerId: 2 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 90, pointerId: 2 });
    expect(screen.getByTestId("hwow-stroke-count").textContent).toBe("획 2회");
    expect(screen.getByRole("status").textContent).toContain("사프란 옐로우");
  });

  it("2D 컨텍스트가 있을 때 실시간 드로잉·분광 혼색 시연·4컷 스탬프·지우기가 실제 캔버스에 그려진다", () => {
    const mockCtx = createMockCanvas2dContext();
    // WebGPU 선언 병합과 무관하게 실제 2D 오버로드로 spy 타입을 고정한다.
    const canvas2d: {
      getContext(contextId: "2d", options?: CanvasRenderingContext2DSettings): Pick<CanvasRenderingContext2D, keyof typeof mockCtx> | null;
    } = HTMLCanvasElement.prototype;
    vi.spyOn(canvas2d, "getContext").mockImplementation((contextId) => contextId === "2d" ? mockCtx : null);

    expect(document.createElement("canvas").getContext("webgl")).toBeNull();

    renderShowcase("ko");
    const canvas = screen.getByTestId("hwow-live-canvas");

    fireEvent.pointerDown(canvas, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 90, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 120, clientY: 90, pointerId: 1 });
    expect(mockCtx.moveTo).toHaveBeenCalled();
    expect(mockCtx.lineTo).toHaveBeenCalled();
    expect(mockCtx.stroke).toHaveBeenCalled();
    expect(mockCtx.strokeStyle).toMatch(/^oklch\(/u);

    fireEvent.click(screen.getByTestId("hwow-spectral-mix-btn"));
    expect(mockCtx.bezierCurveTo).toHaveBeenCalled();
    expect(screen.getByRole("status").getAttribute("data-spectral-active")).toBe("true");
    expect(screen.getByRole("status").textContent).toContain("에메랄드");

    fireEvent.click(screen.getByTestId("hwow-stamp-btn"));
    expect(mockCtx.strokeRect).toHaveBeenCalledTimes(4);
    expect(mockCtx.ellipse).toHaveBeenCalledTimes(2);
    expect(mockCtx.fillText).toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("4컷");

    fireEvent.click(screen.getByTestId("hwow-clear-btn"));
    expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 560, 320);
    expect(screen.getByTestId("hwow-stroke-count").textContent).toBe("획 0회");
    expect(screen.getByRole("status").getAttribute("data-spectral-active")).toBe("false");
  });

  it("4종 조명 프리셋 전환 시 프리뷰 프레임 톤과 배지가 동기화된다", () => {
    renderShowcase("ko");
    const frame = screen.getByTestId("hwow-preview-frame");
    const badge = screen.getByTestId("hwow-lighting-badge");
    const lightingGroup = screen.getByRole("group", { name: "조명 프리셋 선택" });

    expect(frame.getAttribute("data-lighting")).toBe("sunlit");
    expect(badge.textContent).toContain("햇살 아틀리에");

    const cases = [
      { label: "노을 골든아워", id: "golden" },
      { label: "블루아워 시네마", id: "bluehour" },
      { label: "흑백 원고 잉크", id: "ink" },
      { label: "햇살 아틀리에", id: "sunlit" },
    ] as const;

    for (const item of cases) {
      const btn = within(lightingGroup).getByRole("button", { name: item.label });
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(frame.getAttribute("data-lighting")).toBe(item.id);
      expect(badge.textContent).toContain(item.label);
    }
  });

  it("Web Audio 펜촉 사운드는 기본 꺼짐이며 켰을 때만 AudioContext를 생성하고 언마운트 시 정리한다", () => {
    const startMock = vi.fn();
    const stopMock = vi.fn();
    const closeMock = vi.fn().mockResolvedValue(undefined);
    const audioCtorSpy = vi.fn();

    class MockAudioContext {
      state = "running";
      currentTime = 0;
      destination = {};
      constructor() {
        audioCtorSpy();
      }
      createOscillator() {
        return {
          type: "triangle",
          frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
          start: startMock,
          stop: stopMock,
          onended: null as (() => void) | null,
        };
      }
      createBiquadFilter() {
        return {
          type: "bandpass",
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      createGain() {
        return {
          gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
          connect: vi.fn(),
          disconnect: vi.fn(),
        };
      }
      resume = vi.fn().mockResolvedValue(undefined);
      close = closeMock;
    }

    vi.stubGlobal("AudioContext", MockAudioContext);
    const { unmount } = renderShowcase("ko");

    const toggle = screen.getByTestId("hwow-sound-toggle");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(screen.getByTestId("hwow-spectral-mix-btn"));
    expect(audioCtorSpy).not.toHaveBeenCalled();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("hwow-stamp-btn"));
    expect(audioCtorSpy).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(stopMock).toHaveBeenCalledTimes(1);

    unmount();
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it("히어로 스프라이트 로드 실패 시 emblem-studio.webp로 안전 폴백하고 핵심 CTA 3종을 연결한다", () => {
    renderShowcase("ko");
    const heroImg = screen.getByRole("img", { name: "툰스튜디오 라이브 아틀리에 스테이지 아트워크" });
    expect(heroImg.getAttribute("src")).toBe("/assets/studio/vibrant-sprites/wow-hero-atelier-stage.webp");

    fireEvent.error(heroImg);
    expect(heroImg.getAttribute("src")).toBe("/assets/studio/vibrant-sprites/emblem-studio.webp");

    const allSprites = [...document.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(allSprites).toContain("/assets/studio/vibrant-sprites/tech-webgpu.webp");
    expect(allSprites).toContain("/assets/studio/vibrant-sprites/tool-gpen.webp");
    expect(allSprites).toContain("/assets/studio/vibrant-sprites/tool-watercolor.webp");

    expect(screen.getByRole("link", { name: "이 감각 그대로 무료 캔버스 열기" }).getAttribute("href")).toBe("/studio/new?lane=blank");
    expect(screen.getByRole("link", { name: "글로벌 도구 6종 비교" }).getAttribute("href")).toBe("/compare/studio");
    expect(screen.getByRole("link", { name: "차세대 기술·9-LLM MCP" }).getAttribute("href")).toBe("/tech");
  });

  it("라인→완성 드래그 커튼은 초기 62%(베이스·수채 채색)로 마운트되고 4단계 스텝 버튼으로 즉시 전환된다", () => {
    renderShowcase("ko");
    const root = screen.getByTestId("home-wow-showcase");
    const slider = screen.getByTestId("hwow-curtain-slider");
    const wipe = screen.getByTestId("hwow-curtain-wipe");
    const badge = screen.getByTestId("hwow-curtain-stage-badge");
    const routeLink = screen.getByTestId("hwow-curtain-route-link");
    const stepGroup = screen.getByRole("group", { name: "라인에서 완성까지 4단계 선택" });

    expect(root.getAttribute("data-curtain-stage")).toBe("color");
    expect(slider.getAttribute("aria-valuenow")).toBe(String(DEFAULT_CURTAIN_PERCENT));
    expect(wipe.style.clipPath).toBe(`inset(0 ${100 - DEFAULT_CURTAIN_PERCENT}% 0 0)`);
    expect(badge.textContent).toContain("베이스·수채 채색");
    expect(routeLink.getAttribute("href")).toBe("/studio/new?lane=blank");

    const stepButtons = within(stepGroup).getAllByRole("button");
    expect(stepButtons).toHaveLength(4);
    for (const btn of stepButtons) expect(btn.className).toContain("min-h-11");

    fireEvent.click(stepButtons[0] as HTMLElement);
    expect(root.getAttribute("data-curtain-stage")).toBe("rough");
    expect(badge.textContent).toContain("러프 콘티");
    expect(routeLink.getAttribute("href")).toBe("/story-lab");
    expect(stepButtons[0]?.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(stepButtons[1] as HTMLElement);
    expect(root.getAttribute("data-curtain-stage")).toBe("ink");
    expect(badge.textContent).toContain("G펜 선화");
    expect(routeLink.getAttribute("href")).toBe("/studio/canvas");

    fireEvent.click(stepButtons[3] as HTMLElement);
    expect(root.getAttribute("data-curtain-stage")).toBe("finish");
    expect(badge.textContent).toContain("조명·말풍선 완성");
    expect(routeLink.getAttribute("href")).toBe("/studio/comic");
  });

  it("라인→완성 커튼 슬라이더는 ArrowLeft·ArrowRight·Shift·Home·End 키보드 조작을 지원한다", () => {
    renderShowcase("ko");
    const root = screen.getByTestId("home-wow-showcase");
    const slider = screen.getByTestId("hwow-curtain-slider");

    expect(slider.getAttribute("role")).toBe("slider");
    expect(slider.className).toContain("min-h-11");

    fireEvent.keyDown(slider, { key: "Home" });
    expect(slider.getAttribute("aria-valuenow")).toBe("0");
    expect(root.getAttribute("data-curtain-stage")).toBe("rough");

    fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
    expect(slider.getAttribute("aria-valuenow")).toBe("25");
    expect(root.getAttribute("data-curtain-stage")).toBe("ink");

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(slider.getAttribute("aria-valuenow")).toBe("30");

    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(slider.getAttribute("aria-valuenow")).toBe("25");

    fireEvent.keyDown(slider, { key: "End" });
    expect(slider.getAttribute("aria-valuenow")).toBe("100");
    expect(root.getAttribute("data-curtain-stage")).toBe("finish");
    expect(slider.getAttribute("aria-valuetext")).toContain("100%");
  });

  it("라인→완성 커튼 스테이지는 포인터 드래그 위치에 따라 클립과 단계를 실시간 갱신한다", () => {
    renderShowcase("ko");
    const stage = screen.getByTestId("hwow-curtain-stage");
    const slider = screen.getByTestId("hwow-curtain-slider");
    const wipe = screen.getByTestId("hwow-curtain-wipe");

    vi.spyOn(stage, "getBoundingClientRect").mockReturnValue({
      left: 100,
      top: 0,
      right: 500,
      bottom: 200,
      width: 400,
      height: 200,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(stage, { clientX: 160, pointerId: 3 }); // (160 - 100) / 400 = 15%
    expect(slider.getAttribute("aria-valuenow")).toBe("15");
    expect(wipe.style.clipPath).toBe("inset(0 85% 0 0)");

    fireEvent.pointerDown(stage, { clientX: 200, pointerId: 41 });
    fireEvent.pointerMove(stage, { clientX: 480, pointerId: 41 });
    fireEvent.pointerUp(stage, { clientX: 480, pointerId: 41 });
    expect(slider.getAttribute("aria-valuenow")).toBe("15");

    fireEvent.pointerMove(stage, { clientX: 440, pointerId: 3 }); // (440 - 100) / 400 = 85%
    expect(slider.getAttribute("aria-valuenow")).toBe("85");
    expect(wipe.style.clipPath).toBe("inset(0 15% 0 0)");

    fireEvent.pointerUp(stage, { clientX: 440, pointerId: 3 });
    fireEvent.pointerMove(stage, { clientX: 120, pointerId: 3 }); // 드래그 종료 후 고정
    expect(slider.getAttribute("aria-valuenow")).toBe("85");
  });

  it("5대 도메인 안료 라이브 스위처는 5개 min-h-11 버튼으로 --hwow-active-pigment와 추천 CTA를 즉시 전환한다", () => {
    renderShowcase("ko");
    const root = screen.getByTestId("home-wow-showcase");
    const moodGroup = screen.getByRole("group", { name: "5대 도메인 안료 선택" });
    const moodCta = screen.getByTestId("hwow-mood-cta");
    const buttons = within(moodGroup).getAllByRole("button");

    expect(buttons).toHaveLength(5);
    for (const btn of buttons) expect(btn.className).toContain("min-h-11");
    expect(root.getAttribute("data-active-mood")).toBe("draw");
    expect(root.style.getPropertyValue("--hwow-active-pigment")).toContain("--spectrum-pigment-draw");
    expect(moodCta.getAttribute("href")).toBe("/studio/new?lane=blank");

    const expectedCases = [
      { index: 1, id: "3d", token: "--spectrum-pigment-3d", href: "/studio/bg3d", note: "코발트" },
      { index: 2, id: "character", token: "--spectrum-pigment-character", href: "/studio/assets/characters/new", note: "앰버 골드" },
      { index: 3, id: "market", token: "--spectrum-pigment-market", href: "/market", note: "비리디언 에메랄드" },
      { index: 4, id: "collab", token: "--spectrum-pigment-collab", href: "/production", note: "틸 시안" },
      { index: 0, id: "draw", token: "--spectrum-pigment-draw", href: "/studio/new?lane=blank", note: "버밀리온 주홍" },
    ] as const;

    for (const item of expectedCases) {
      const target = buttons[item.index] as HTMLElement;
      fireEvent.click(target);
      expect(target.getAttribute("aria-pressed")).toBe("true");
      expect(root.getAttribute("data-active-mood")).toBe(item.id);
      expect(root.style.getPropertyValue("--hwow-active-pigment")).toContain(item.token);
      expect(moodCta.getAttribute("href")).toBe(item.href);
      expect(screen.getByTestId("hwow-mood-note").textContent).toContain(item.note);
    }
  });

  it("3버튼 맞춤 작업실 필터는 혼자 연재·팀 분업·3D 배경 중심별로 추천 도구 3종만 간결하게 전환한다", () => {
    renderShowcase("ko");
    const root = screen.getByTestId("home-wow-showcase");
    const modeGroup = screen.getByRole("group", { name: "작업 방식 맞춤 필터" });
    const grid = screen.getByTestId("hwow-tailor-grid");

    const soloBtn = within(modeGroup).getByRole("button", { name: "혼자 연재" });
    const teamBtn = within(modeGroup).getByRole("button", { name: "팀 분업" });
    const scene3dBtn = within(modeGroup).getByRole("button", { name: "3D 배경 중심" });

    for (const btn of [soloBtn, teamBtn, scene3dBtn]) {
      expect(btn.className).toContain("min-h-11");
    }

    expect(root.getAttribute("data-tailor-mode")).toBe("solo");
    expect(soloBtn.getAttribute("aria-pressed")).toBe("true");
    expect(within(grid).getAllByRole("link").map((el) => el.getAttribute("href"))).toEqual([
      "/studio/new?lane=blank",
      "/story-lab",
      "/studio/comic",
    ]);

    fireEvent.click(teamBtn);
    expect(root.getAttribute("data-tailor-mode")).toBe("team");
    expect(teamBtn.getAttribute("aria-pressed")).toBe("true");
    expect(soloBtn.getAttribute("aria-pressed")).toBe("false");
    expect(within(grid).getAllByRole("link").map((el) => el.getAttribute("href"))).toEqual([
      "/production",
      "/studio/space",
      "/production/projects/sample-project/overview",
    ]);

    fireEvent.click(scene3dBtn);
    expect(root.getAttribute("data-tailor-mode")).toBe("scene3d");
    expect(scene3dBtn.getAttribute("aria-pressed")).toBe("true");
    const sceneLinks = within(grid).getAllByRole("link");
    expect(sceneLinks.map((el) => el.getAttribute("href"))).toEqual([
      "/studio/bg3d",
      "/studio/assets/characters/new",
      "/studio/poser",
    ]);
    for (const link of sceneLinks) expect(link.className).toContain("min-h-11");
  });

  it("맞춤 작업실 필터와 5대 안료 스위처를 조작해도 라이브 캔버스 획 수와 단일 상태 영역을 보존한다", () => {
    renderShowcase("ko");
    const canvas = screen.getByTestId("hwow-live-canvas");
    fireEvent.pointerDown(canvas, { clientX: 60, clientY: 70, pointerId: 5 });
    fireEvent.pointerUp(canvas, { clientX: 60, clientY: 70, pointerId: 5 });
    expect(screen.getByTestId("hwow-stroke-count").textContent).toBe("획 1회");

    const moodGroup = screen.getByRole("group", { name: "5대 도메인 안료 선택" });
    fireEvent.click(within(moodGroup).getAllByRole("button")[2] as HTMLElement);
    fireEvent.click(screen.getByRole("button", { name: "팀 분업" }));

    expect(screen.getByTestId("hwow-stroke-count").textContent).toBe("획 1회");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });

  it("영어 모드에서는 모든 가시 텍스트·상태 메시지·접근성 이름에 한글이 0건이다", () => {
    renderShowcase("en");
    const root = screen.getByTestId("home-wow-showcase");

    const assertZeroHangul = () => {
      expect(root.textContent).not.toMatch(/[가-힣]/u);
      for (const el of root.querySelectorAll("[aria-label], [aria-valuetext], [alt]")) {
        const attrText = `${el.getAttribute("aria-label") ?? ""}${el.getAttribute("aria-valuetext") ?? ""}${el.getAttribute("alt") ?? ""}`;
        expect(attrText).not.toMatch(/[가-힣]/u);
      }
    };

    assertZeroHangul();
    fireEvent.pointerDown(screen.getByTestId("hwow-live-canvas"), { clientX: 90, clientY: 80, pointerId: 1 });
    fireEvent.pointerUp(screen.getByTestId("hwow-live-canvas"), { clientX: 90, clientY: 80, pointerId: 1 });
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("hwow-spectral-mix-btn"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("hwow-stamp-btn"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("hwow-clear-btn"));
    assertZeroHangul();

    fireEvent.click(screen.getByTestId("hwow-sound-toggle"));
    assertZeroHangul();
  });

  it("영어 모드에서 5대 안료 스위처·4단계 커튼·3버튼 맞춤 필터를 모두 전환해도 한글이 0건이다", () => {
    renderShowcase("en");
    const root = screen.getByTestId("home-wow-showcase");
    const assertClean = () => {
      expect(root.textContent).not.toMatch(/[가-힣]/u);
      for (const el of root.querySelectorAll("[aria-label], [aria-valuetext], [alt]")) {
        expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("aria-valuetext") ?? ""}${el.getAttribute("alt") ?? ""}`).not.toMatch(/[가-힣]/u);
      }
    };

    const moodButtons = within(screen.getByRole("group", { name: "Choose 5 domain pigments" })).getAllByRole("button");
    for (const btn of moodButtons) {
      fireEvent.click(btn);
      assertClean();
    }

    const stageButtons = within(screen.getByRole("group", { name: "Select 4 line-to-finish stages" })).getAllByRole("button");
    for (const btn of stageButtons) {
      fireEvent.click(btn);
      assertClean();
    }

    const tailorButtons = within(screen.getByRole("group", { name: "Filter studio by workflow" })).getAllByRole("button");
    for (const btn of tailorButtons) {
      fireEvent.click(btn);
      assertClean();
    }
  });

  it("커튼 4단계 스텝과 5대 안료 CTA 링크는 레거시 별칭 없이 정본 경로만 가리킨다", () => {
    const legacyPattern = /^\/(?:shaper|brush-lab|studio\/brush-lab|marketplace|new)(?:[?#]|$)/u;
    const allRoutes = [
      ...PIPELINE_CURTAIN_STAGES.map((stage) => stage.routeHref),
      ...HOME_PIGMENT_MOODS.map((mood) => mood.ctaHref),
      ...STUDIO_TAILOR_MODES.flatMap((mode) => mode.tools.map((tool) => tool.href)),
    ];

    expect(allRoutes.length).toBeGreaterThanOrEqual(18);
    for (const href of allRoutes) {
      expect(href.startsWith("/"), href).toBe(true);
      expect(href, href).not.toMatch(legacyPattern);
    }
  });

  it("엔진·컴포넌트·스타일시트가 줄 수·원시 색 금지·탈-바이올렛·backdrop-filter 병기·감속·고대비 계약을 지킨다", () => {
    const engine = readFileSync("apps/web/src/domains/marketing/wow-showcase/home-live-staging-engine.ts", "utf8");
    const tsx = readFileSync("apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.tsx", "utf8");
    const css = readFileSync("apps/web/src/domains/marketing/wow-showcase/home-wow-showcase.css", "utf8");

    expect(engine.split("\n").length).toBeLessThanOrEqual(400);
    expect(tsx.split("\n").length).toBeLessThanOrEqual(800);
    expect(css.split("\n").length).toBeLessThanOrEqual(800);

    for (const [label, src] of [["engine", engine], ["tsx", tsx], ["css", css]] as const) {
      expect(src, `${label} no raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(src, `${label} no rgb/hsl`).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
      expect(src, `${label} no transition-all`).not.toMatch(/transition\s*:\s*all\b|transition-all/u);
      expect(src, `${label} no Sparkles`).not.toMatch(/\bSparkles\b/u);
      expect(src, `${label} no eslint-disable`).not.toContain("eslint-disable");
      const violetHues = extractOklchHues(src).filter((hue) => hue >= 270 && hue <= 320);
      expect(violetHues, `${label} zero violet hues (270~320)`).toEqual([]);
    }

    expect(tsx).not.toMatch(/\bmin-h-(?:6|7|8|9|10)\b/u);
    expect(css).toContain("oklch(");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(':root[data-design-theme="contrast"]');
    expect(css).toContain("@media (forced-colors: active)");

    const backdropCount = (css.match(/(?<![-\w])backdrop-filter:/gu) ?? []).length;
    const webkitBackdropCount = (css.match(/-webkit-backdrop-filter:/gu) ?? []).length;
    expect(backdropCount).toBeGreaterThan(0);
    expect(webkitBackdropCount).toBe(backdropCount);
  });
});
