// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreateStartPage } from "../CreateStartPage";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import {
  clearStudioAssistantSessionState,
  readStudioAssistantSessionState,
  writeStudioAssistantSessionState,
} from "./guided-flow/studio-assistant-session-store";
import { StudioBeginnerQuickTipsBar } from "./guided-flow/StudioBeginnerQuickTipsBar";
import { analyzeMobileSafeZone } from "./guided-flow/studio-guided-flow-catalog";
import { StudioExportPanel } from "./StudioExportPanel";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
});

describe("초보자 1초 장르 스타터 · 모바일 안전영역 시뮬레이터 · 단축키 가이드 · 출고 복원 흐름", () => {
  it("시작 화면(/create)에 4가지 비주얼 장르 스타터 카드를 렌더링하고 올바른 생성 주소로 연결한다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <CreateStartPage />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("create-start-genre-starters");
    expect(section).toBeTruthy();

    expect(screen.getByTestId("genre-starter-romance").getAttribute("href")).toContain(
      "format=vertical-webtoon",
    );
    expect(screen.getByTestId("genre-starter-action").getAttribute("href")).toContain(
      "lane=storyboard",
    );
    expect(screen.getByTestId("genre-starter-daily").getAttribute("href")).toContain(
      "format=cuttoon",
    );
    expect(screen.getByTestId("genre-starter-mystery").getAttribute("href")).toContain(
      "format=page-comic",
    );
  });

  it("프로젝트 생성 화면(/studio/new)에서 모바일 안전영역 시뮬레이터와 1초 프리셋을 함께 검증한다", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const simulator = screen.getByTestId("studio-canvas-safe-zone-simulator");
    expect(simulator.textContent).toContain("2컷 호흡");
    fireEvent.click(screen.getByTestId("safe-zone-rhythm-snappy"));
    expect(simulator.textContent).toContain("3컷 호흡");

    const dailyPreset = screen.getByTestId("studio-quick-preset-daily-cuttoon");
    fireEvent.click(dailyPreset);

    expect(dailyPreset.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[data-studio-create-format="cuttoon"]')?.getAttribute("aria-pressed"),
    ).toBe("true");

    const titleInput = screen.getByRole("textbox", {
      name: /프로젝트 이름|Project name/u,
    }) as HTMLInputElement;
    expect(titleInput.value).toBe("오늘 하루 네 컷 일기");

    fireEvent.click(
      screen.getByRole("button", {
        name: /컷툰·SNS 만화 시작|Start Card comic & social series/u,
      }),
    );

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("format=cuttoon");
    });

    const created = readStudioProjectLibrary(window.localStorage).projects[0];
    expect(created?.title).toBe("오늘 하루 네 컷 일기");
    expect(created?.templateId).toBe("cuttoon-square-4");
  });

  it("모바일 안전영역 순수 계산기가 저해상도 폭 경고와 적정 세로 스크롤 분량을 정확히 판정한다", () => {
    const narrow = analyzeMobileSafeZone(540, 1280, "balanced");
    expect(narrow.readabilityTone).toBe("warning");
    expect(narrow.cutsPerScreen).toBe(2);

    const standard = analyzeMobileSafeZone(800, 2640, "cinematic");
    expect(standard.readabilityTone).toBe("optimal");
    expect(standard.phoneScreensPerPage).toBe(2);
    expect(standard.cutsPerScreen).toBe(1);
  });

  it("초보자 10초 단축키 가이드 바에서 기능 찾기 열기를 누르면 커맨드 팔레트 이벤트를 발행한다", () => {
    const listener = vi.fn();
    window.addEventListener("toonspectrum:command-palette:open", listener);

    render(<StudioBeginnerQuickTipsBar />);
    expect(screen.getByTestId("studio-beginner-quick-tips")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /기능 찾기 열기|Open feature finder/u }));
    expect(listener).toHaveBeenCalledTimes(1);

    window.removeEventListener("toonspectrum:command-palette:open", listener);
  });

  it("출고 점검 패널에서 해상도를 바꾼 뒤 권장값으로 원클릭 복원하고 항목별 점검 링크를 제공한다", () => {
    render(
      <MemoryRouter initialEntries={["/studio/p/proj-demo/export"]}>
        <StudioExportPanel projectId="proj-demo" locale="ko" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("studio-export-jump-rights").getAttribute("href")).toContain(
      "/studio/p/proj-demo/assets?view=rights",
    );
    expect(screen.getByTestId("studio-export-jump-review").getAttribute("href")).toContain(
      "/studio/p/proj-demo/review",
    );

    const widthInput = screen.getByLabelText(/가로 폭|Width/u) as HTMLInputElement;
    const initialWidth = widthInput.value;
    fireEvent.change(widthInput, { target: { value: "960" } });
    expect(widthInput.value).toBe("960");

    const resetButton = screen.getByTestId("studio-export-reset-recommended");
    fireEvent.click(resetButton);
    expect(widthInput.value).toBe(initialWidth);
  });

  it("AI 보조 세션 저장소가 프로젝트별 초안을 복원하고 초기화 시 깨끗이 비운다", () => {
    writeStudioAssistantSessionState(
      "proj-alpha",
      {
        mode: "dialogue-polish",
        inputText: "비 오는 날 우산을 건네는 첫 대사",
        lastResult: null,
      },
      window.sessionStorage,
    );

    const restored = readStudioAssistantSessionState("proj-alpha", window.sessionStorage);
    expect(restored?.mode).toBe("dialogue-polish");
    expect(restored?.inputText).toBe("비 오는 날 우산을 건네는 첫 대사");

    clearStudioAssistantSessionState("proj-alpha", window.sessionStorage);
    expect(readStudioAssistantSessionState("proj-alpha", window.sessionStorage)).toBeNull();
  });
});
