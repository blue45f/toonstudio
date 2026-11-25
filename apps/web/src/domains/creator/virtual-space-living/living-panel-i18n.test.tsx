// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";
import { StudioVirtualSpaceLivingPanel } from "./StudioVirtualSpaceLivingPanel";

beforeEach(() => { useI18n.getState().setLang("ko"); });
afterEach(() => { cleanup(); useI18n.getState().setLang("ko"); });

function expectEnglishPanel(container: HTMLElement): void {
  expect(container.textContent).not.toMatch(/[가-힣]/);
  for (const element of container.querySelectorAll("[aria-label], [alt], [title]")) {
    for (const attribute of ["aria-label", "alt", "title"]) {
      expect(element.getAttribute(attribute) ?? "").not.toMatch(/[가-힣]/);
    }
  }
  expect(container.innerHTML).not.toContain("legacyUi.");
}

describe("리빙 패널의 기존 i18n 연결", () => {
  it.each([
    ["sprite-physics", "2.5D spring character", "8-direction movement pad"],
    ["atmosphere-wheel", "Time, weather and emote wheel", "Multilayer weather and mood particles"],
    ["avatar-room-pomodoro", "Avatar, 6 rooms and Pomodoro", "6-slot layered avatar customizer"],
  ] as const)("영어 %s 탭의 본문과 접근성 이름을 모두 번역한다", (initialTab, tab, heading) => {
    useI18n.getState().setLang("en");
    const { container } = render(<StudioVirtualSpaceLivingPanel initialTab={initialTab} />);
    expect(screen.getByRole("tab", { name: tab, selected: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("tablist", { name: "Virtual studio living engine features" })).toBeTruthy();
    expect(screen.getByText(/CPU example/)).toBeTruthy();
    expectEnglishPanel(container);
  });

  it.each([
    ["sprite-physics", "2.5D 스프링 캐릭터"],
    ["atmosphere-wheel", "시간·날씨·이모트 휠"],
    ["avatar-room-pomodoro", "아바타·6테마 방·뽀모도로"],
  ] as const)("한국어 %s 탭의 기본 문구를 보존한다", (initialTab, tab) => {
    const { container } = render(<StudioVirtualSpaceLivingPanel initialTab={initialTab} />);
    expect(screen.getByRole("tab", { name: tab, selected: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "가상 스튜디오 2.5D 리빙 엔진", exact: true })).toBeTruthy();
    expect(container.innerHTML).not.toContain("legacyUi.");
  });

  it("이동 후 상태와 시선 안내도 번역하고 현재 상태를 언어 변경에 맞춰 다시 표시한다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<StudioVirtualSpaceLivingPanel />);
    fireEvent.click(screen.getByTestId("dir-e"));
    expect(screen.getByTestId("living-status-banner").textContent).toBe("Simulated 15 frames of inertial movement and spring motion toward East.");
    expectEnglishPanel(container);
    act(() => { useI18n.getState().setLang("ko"); });
    expect(screen.getByTestId("living-status-banner").textContent).toBe("동 방향으로 15프레임 관성 이동 및 2차 스프링 시뮬레이션을 실행했습니다.");
    act(() => { useI18n.getState().setLang("en"); });
    expectEnglishPanel(container);
    fireEvent.click(screen.getByRole("button", { name: "Left canvas" }));
    expect(screen.getByTestId("living-status-banner").textContent).toBe("Gaze target changed to 'Left canvas'.");
    expectEnglishPanel(container);
  });

  it("날씨·광원·파티클·이모트와 쿨다운의 동적 안내를 영어로 표시한다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<StudioVirtualSpaceLivingPanel initialTab="atmosphere-wheel" />);
    for (const id of ["weather-rainy-window", "tod-night", "burst-window-rain", "emote-sector-0", "emote-sector-0"]) {
      fireEvent.click(screen.getByTestId(id));
      expectEnglishPanel(container);
    }
    expect(screen.getByTestId("living-status-banner").textContent).toMatch(/Cheering applause cooldown/);
  });

  it("방·합성 주인공·가구 충돌·뽀모도로 단계 변경의 안내를 영어로 표시한다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<StudioVirtualSpaceLivingPanel initialTab="avatar-room-pomodoro" />);
    for (const id of ["room-card-rooftop-terrace", "import-protagonist-work-starlight-ink", "grid-cell-1-1", "pomodoro-toggle-btn", "pomodoro-step-btn", "pomodoro-skip-btn"]) {
      fireEvent.click(screen.getByTestId(id));
      expectEnglishPanel(container);
    }
    expect(screen.getByTestId("pomodoro-phase-badge").textContent).toBe("Short break · stretch");
    expect(screen.getByTestId("living-status-banner").textContent).toMatch(/Sprint 1 complete/);
    act(() => { useI18n.getState().setLang("ko"); });
    expect(screen.getByTestId("living-status-banner").textContent).toContain("1회차 스프린트 완료");
  });

  it("탭을 이동해도 영어 설정을 유지한다", () => {
    useI18n.getState().setLang("en");
    const { container } = render(<StudioVirtualSpaceLivingPanel />);
    for (const id of ["living-tab-atmosphere", "living-tab-room", "living-tab-sprite"]) {
      fireEvent.click(screen.getByTestId(id));
      expectEnglishPanel(container);
    }
  });
});
