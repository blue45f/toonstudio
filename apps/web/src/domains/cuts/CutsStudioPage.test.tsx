// @vitest-environment jsdom
/**
 * 컷츠 스튜디오 페이지 테스트 —
 * 무빙툰 프리셋 바와 대화형 REA 렌더 엔진·프레임레이트 컨트롤러를 검증한다.
 */
import "fake-indexeddb/auto";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CutsStudioPage } from "./CutsStudioPage";
import { useI18n } from "@/shared/lib/i18n-core";

beforeEach(() => {
  vi.stubGlobal("indexedDB", new IDBFactory());
  localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CutsStudioPage REA 렌더 엔진 및 프레임레이트 컨트롤러", () => {
  it("프리셋 바와 렌더 엔진·FPS 컨트롤러를 렌더링하고 버튼 전환 시 상태를 갱신한다", () => {
    render(
      <MemoryRouter initialEntries={["/cuts/studio"]}>
        <CutsStudioPage />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("cuts-rea-movingtoon-preset-bar")).toBeTruthy();
    expect(screen.getByTestId("cuts-studio-rea-engine-controller")).toBeTruthy();

    const defaultEngineBtn = screen.getByTestId("cuts-studio-rea-engine-gsap-parallax-25d");
    const riveEngineBtn = screen.getByTestId("cuts-studio-rea-engine-rive-spine-state-rig");
    const defaultFpsBtn = screen.getByTestId("cuts-studio-rea-fps-60fps-webgpu");
    const promotionFpsBtn = screen.getByTestId("cuts-studio-rea-fps-120fps-promotion");

    expect(defaultEngineBtn.getAttribute("aria-pressed")).toBe("true");
    expect(riveEngineBtn.getAttribute("aria-pressed")).toBe("false");
    expect(defaultFpsBtn.getAttribute("aria-pressed")).toBe("true");
    expect(promotionFpsBtn.getAttribute("aria-pressed")).toBe("false");

    const status = screen.getByTestId("cuts-studio-rea-engine-status");
    expect(status.textContent).toContain("gsap-parallax-25d");
    expect(status.textContent).toContain("60fps-webgpu");
    expect(status.textContent).toContain("Rive");
    expect(status.textContent).toContain("Onoma AI Insertoon");
    expect(status.textContent).toContain("ElevenLabs");

    fireEvent.click(riveEngineBtn);
    fireEvent.click(promotionFpsBtn);

    expect(defaultEngineBtn.getAttribute("aria-pressed")).toBe("false");
    expect(riveEngineBtn.getAttribute("aria-pressed")).toBe("true");
    expect(defaultFpsBtn.getAttribute("aria-pressed")).toBe("false");
    expect(promotionFpsBtn.getAttribute("aria-pressed")).toBe("true");
    expect(status.textContent).toContain("rive-spine-state-rig");
    expect(status.textContent).toContain("120fps-promotion");
  });

  it("영문 모드(en)에서 렌더 엔진 컨트롤러가 한글 없이 표시된다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter initialEntries={["/cuts/studio"]}>
        <CutsStudioPage />
      </MemoryRouter>,
    );

    const controller = screen.getByTestId("cuts-studio-rea-engine-controller");
    expect(controller.textContent).not.toMatch(/[가-힣]/);
  });
});
