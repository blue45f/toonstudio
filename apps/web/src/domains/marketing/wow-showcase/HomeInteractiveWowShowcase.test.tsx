// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { HomeInteractiveWowShowcase } from "./HomeInteractiveWowShowcase";

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
  };
}

function renderShowcase(lang: "ko" | "en" = "ko") {
  useI18n.setState({ lang });
  return render(
    <MemoryRouter>
      <HomeInteractiveWowShowcase />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  useI18n.setState({ lang: initialLanguage });
  vi.unstubAllGlobals();
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
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => mockCtx) as unknown as typeof HTMLCanvasElement.prototype.getContext,
    );

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

  it("영어 모드에서는 모든 가시 텍스트·상태 메시지·접근성 이름에 한글이 0건이다", () => {
    renderShowcase("en");
    const root = screen.getByTestId("home-wow-showcase");

    const assertZeroHangul = () => {
      expect(root.textContent).not.toMatch(/[가-힣]/u);
      for (const el of root.querySelectorAll("[aria-label], [alt]")) {
        expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("alt") ?? ""}`).not.toMatch(/[가-힣]/u);
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

  it("스타일시트와 컴포넌트 소스가 원시 색 금지·GPU 전이·감속·고대비·450줄 이하 계약을 지킨다", () => {
    const css = readFileSync("apps/web/src/domains/marketing/wow-showcase/home-wow-showcase.css", "utf8");
    const tsx = readFileSync("apps/web/src/domains/marketing/wow-showcase/HomeInteractiveWowShowcase.tsx", "utf8");

    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
    expect(css).not.toContain("transition: all");
    expect(css).not.toContain("transition-all");
    expect(css).toContain("oklch(");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain(':root[data-design-theme="contrast"]');
    expect(css).toContain("@media (forced-colors: active)");

    expect(tsx.split("\n").length).toBeLessThanOrEqual(450);
    expect(tsx).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(tsx).not.toMatch(/\brgba?\s*\(|\bhsla?\s*\(/u);
    expect(tsx).not.toContain("eslint-disable");
  });
});
