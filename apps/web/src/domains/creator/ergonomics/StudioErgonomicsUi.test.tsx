// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioAppSettingsPanel } from "../StudioAppSettingsPanel";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { searchStudioAppSettings } from "../studio-app-settings-management";

import {
  STUDIO_ERGONOMICS_STORAGE_KEY,
  requestStudioRestNudgePreview,
  resetStudioErgonomicsStoreForTests,
  setStudioHandednessPreference,
  updateStudioErgonomicsPreferences,
} from "./studio-ergonomics-preferences";
import { StudioErgonomicsRuntimeHost } from "./StudioErgonomicsRuntimeHost";
import { StudioErgonomicsSettingsSection } from "./StudioErgonomicsSettingsSection";

import { useI18n } from "@/shared/lib/i18n";

describe("Studio ergonomics UI & runtime integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStudioErgonomicsStoreForTests();
    useI18n.getState().setLang("ko");
  });

  afterEach(() => {
    cleanup();
    resetStudioErgonomicsStoreForTests();
    window.localStorage.clear();
  });

  it("설정 섹션에서 왼손잡이 미러·야간 색온도 가드·휴식 알림 1줄 미리보기를 원터치 조작할 수 있다", () => {
    render(<StudioErgonomicsSettingsSection />);

    // 1) 왼손잡이 미러 원터치 전환 + localStorage 영속화
    const leftyButton = screen.getByRole("button", { name: "왼손잡이 미러" });
    expect(leftyButton.className).toContain("min-h-11");
    expect(leftyButton.className).toContain("min-w-11");
    fireEvent.click(leftyButton);
    expect(leftyButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("도구 막대 오른쪽 · 속성 패널 왼쪽 · 캔버스 82%+ 유지")).toBeTruthy();
    expect(window.localStorage.getItem(STUDIO_ERGONOMICS_STORAGE_KEY)).toContain("left-handed");

    // 2) 야간 색온도 프리셋 선택 및 채색 시 자동 중립 복귀 가드 확인
    const gentleButton = screen.getByRole("button", { name: "은은한 난색" });
    fireEvent.click(gentleButton);
    expect(gentleButton.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(/채색 진입 시 6500K 자동 복귀/u)).toBeTruthy();

    // 3) 60분 휴식 알림 1줄 미리보기 → 1분 쉬기 → 바로 돌아가기
    fireEvent.click(screen.getByRole("button", { name: "휴식 알림 1줄 미리보기" }));
    const nudgeBar = screen.getByRole("status", { name: "손목·눈 휴식 안내" });
    expect(nudgeBar.getAttribute("data-studio-rest-nudge-bar")).toBe("nudge");
    const breakButton = screen.getByRole("button", { name: "1분 쉬기" });
    const snoozeButton = screen.getByRole("button", { name: "15분 뒤 다시" });
    expect(breakButton.className).toContain("min-h-11");
    expect(snoozeButton.className).toContain("min-h-11");

    fireEvent.click(breakButton);
    expect(nudgeBar.getAttribute("data-studio-rest-nudge-bar")).toBe("resting");
    expect(screen.getByRole("progressbar", { name: "휴식 진행률" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "바로 돌아가기" }));
    expect(screen.queryByRole("status", { name: "손목·눈 휴식 안내" })).toBeNull();
  });

  it("런타임 호스트가 data-studio-handedness와 채색·스포이드 시 야간 색온도 자동 중립 복귀를 실시간 반영한다", () => {
    const shell = document.createElement("div");
    shell.id = "studio-app-shell";
    shell.setAttribute("data-studio-editor", "true");
    document.body.append(shell);
    const ref = createRef<HTMLDivElement>();
    ref.current = shell;

    setStudioHandednessPreference("left-handed");
    updateStudioErgonomicsPreferences({
      nightComfortPreset: "amber",
      autoPauseNightComfortForColorCritical: true,
    });

    const { rerender } = render(
      <StudioErgonomicsRuntimeHost
        studioRootRef={ref}
        workMode="draw"
        tool="draw"
        drawMode="pen"
        eyedropperActive={false}
      />,
    );

    expect(shell.getAttribute("data-studio-handedness")).toBe("left-handed");
    expect(shell.getAttribute("data-studio-night-comfort")).toBe("active");
    expect(shell.style.getPropertyValue("--studio-ergonomics-warmth")).toBe("0.34");

    // 스포이드 진입 시 색 왜곡 방지를 위해 즉시 중립(6500K) 복귀
    rerender(
      <StudioErgonomicsRuntimeHost
        studioRootRef={ref}
        workMode="draw"
        tool="draw"
        drawMode="pen"
        eyedropperActive
      />,
    );
    expect(shell.getAttribute("data-studio-night-comfort")).toBe("paused-color-critical");
    expect(shell.getAttribute("data-studio-night-comfort-reason")).toBe("eyedropper");
    expect(shell.style.getPropertyValue("--studio-ergonomics-warmth")).toBe("");

    // 일반 선화 모드로 돌아오면 다시 야간 색온도 보호가 재개된다.
    rerender(
      <StudioErgonomicsRuntimeHost
        studioRootRef={ref}
        workMode="draw"
        tool="draw"
        drawMode="pen"
        eyedropperActive={false}
      />,
    );
    expect(shell.getAttribute("data-studio-night-comfort")).toBe("active");

    // 실시간 휴식 알림 미리보기 신호 수신 시 비침습 플로팅 1줄 바가 열린다.
    act(() => {
      requestStudioRestNudgePreview();
    });
    const floatingNudge = screen.getByRole("status", { name: "손목·눈 휴식 안내" });
    expect(floatingNudge.getAttribute("data-studio-rest-nudge-placement")).toBe("floating");
    expect(floatingNudge.getAttribute("data-studio-rest-nudge-bar")).toBe("nudge");

    shell.remove();
  });

  it("실제 StudioAppSettingsPanel 설정 홈과 일반 설정 검색에 깔끔히 연결되어 있다", () => {
    render(
      <StudioAppSettingsPanel
        open
        settings={defaultStudioAppSettings()}
        initialTab="general"
        onClose={() => undefined}
        onChange={() => undefined}
        onResetAll={() => undefined}
      />,
    );

    expect(screen.getByText("왼손잡이·태블릿 미러 UI")).toBeTruthy();
    expect(screen.getByText("야간 색온도 가드")).toBeTruthy();
    expect(screen.getByText("연속 작업 손목·눈 휴식 넛지")).toBeTruthy();

    expect(searchStudioAppSettings("왼손")[0]).toMatchObject({ tab: "general", id: "handedness" });
    expect(searchStudioAppSettings("색온도")[0]).toMatchObject({
      tab: "general",
      id: "night-comfort",
    });
    expect(searchStudioAppSettings("손목")[0]).toMatchObject({ tab: "general", id: "rest-nudge" });
  });
});
