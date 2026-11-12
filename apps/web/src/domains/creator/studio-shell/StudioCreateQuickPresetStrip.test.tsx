// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreateStartPage } from "../CreateStartPage";
import { readStudioProjectDocuments } from "../studio-project-document-reader";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import {
  clearStudioAssistantSessionState,
  readStudioAssistantSessionState,
  writeStudioAssistantSessionState,
} from "./guided-flow/studio-assistant-session-store";
import { StudioBeginnerQuickTipsBar } from "./guided-flow/StudioBeginnerQuickTipsBar";
import {
  analyzeMobileSafeZone,
  buildGuidedGenreStarterHref,
  STUDIO_GUIDED_GENRE_STARTERS,
} from "./guided-flow/studio-guided-flow-catalog";
import { StudioExportPanel } from "./StudioExportPanel";
import { StudioNewIntegratedPage as StudioProjectCreatePage } from "./StudioProjectCreatePage";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

function goCreateStep(step: 1 | 2 | 3) {
  const button = document.querySelector<HTMLButtonElement>(`[data-studio-create-step-link="${step}"]`);
  if (!button) throw new Error("생성 단계 이동이 없습니다.");
  if (button.getAttribute("aria-current") !== "step") fireEvent.click(button);
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
  it("시작 화면(/create)에 4가지 비주얼 장르 스타터 카드를 렌더링하고 올바른 생성 주소·로케일로 연결한다", () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={["/create"]}>
        <CreateStartPage />
      </MemoryRouter>,
    );

    const section = screen.getByTestId("create-start-genre-starters");
    expect(section).toBeTruthy();

    const romanceHref = screen.getByTestId("genre-starter-romance").getAttribute("href") ?? "";
    expect(romanceHref).toContain("preset=romance-scroll");
    expect(romanceHref).toContain("format=vertical-webtoon");
    expect(romanceHref).toContain("template=webtoon-canvas");
    expect(screen.getByTestId("genre-starter-action").getAttribute("href")).toContain(
      "lane=storyboard",
    );
    expect(screen.getByTestId("genre-starter-daily").getAttribute("href")).toContain(
      "format=cuttoon",
    );
    expect(screen.getByTestId("genre-starter-mystery").getAttribute("href")).toContain(
      "format=page-comic",
    );

    useI18n.setState({ lang: "en" });
    rerender(
      <MemoryRouter initialEntries={["/create"]}>
        <CreateStartPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("genre-starter-romance").getAttribute("href")).toContain(
      "First+Encounter+Ep.1",
    );
  });

  it("장르 스타터 링크로 /studio/new에 진입하면 프리셋 동기화·수동 변경 해제·원클릭 시작이 모두 동작한다", async () => {
    const romanceSpec = STUDIO_GUIDED_GENRE_STARTERS[0]!;
    const romanceHref = buildGuidedGenreStarterHref(romanceSpec, "ko");
    const { container } = render(
      <MemoryRouter initialEntries={[romanceHref]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    const romancePreset = screen.getByTestId("studio-quick-preset-romance-scroll");
    expect(romancePreset.getAttribute("aria-pressed")).toBe("true");
    // 프리셋 샘플 가제는 '가져온 아이디어' 배너로 오표시되지 않는다.
    expect(container.querySelector('[data-studio-imported-idea="true"]')).toBeNull();

    goCreateStep(2);
    const titleInput = screen.getByRole("textbox", {
      name: /프로젝트 이름|Project name/u,
    }) as HTMLInputElement;
    expect(titleInput.value).toBe("설레는 첫 만남 1화");

    // 제목을 직접 수정하면 프리셋 선택 표시가 해제되고, 다시 프리셋을 고르면 복원된다.
    fireEvent.change(titleInput, { target: { value: "직접 수정한 제목" } });
    expect(romancePreset.getAttribute("aria-pressed")).toBe("false");
    goCreateStep(1);
    fireEvent.click(romancePreset);
    expect(romancePreset.getAttribute("aria-pressed")).toBe("true");

    // 장르 예시는 먼저 확인 단계로 연결하고, 최종 제출에서만 프로젝트를 만든다.
    fireEvent.click(screen.getByTestId("studio-quick-preset-start-now"));
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /세로 연재 웹툰 시작|Start Vertical serial webtoon/u }));

    await waitFor(() => {
      expect(screen.getByTestId("location").textContent).toContain("/story");
    });

    const created = readStudioProjectLibrary(window.localStorage).projects[0];
    expect(created?.title).toBe("설레는 첫 만남 1화");
    expect(created?.templateId).toBe("webtoon-canvas");
    const createdDoc = readStudioProjectDocuments(window.localStorage, created!.id).documents[0];
    expect(createdDoc?.width).toBe(800);
    expect(createdDoc?.height).toBe(8000);
  });

  it("프로젝트 생성 화면(/studio/new)에서 모바일 안전영역 시뮬레이터와 1초 프리셋을 함께 검증한다", async () => {
    const { container } = render(
      <MemoryRouter initialEntries={["/studio/new"]}>
        <StudioProjectCreatePage />
        <LocationProbe />
      </MemoryRouter>,
    );

    goCreateStep(2);
    const simulator = screen.getByTestId("studio-canvas-safe-zone-simulator");
    const previewToggle = simulator.closest("details")?.querySelector("summary");
    if (!previewToggle) throw new Error("크기 미리보기 열기가 없습니다.");
    fireEvent.click(previewToggle);
    expect(simulator.getAttribute("data-preview-mode")).toBe("vertical-scroll");
    expect(simulator.textContent).toContain("2컷 호흡");
    fireEvent.click(screen.getByTestId("safe-zone-rhythm-snappy"));
    expect(simulator.textContent).toContain("3컷 호흡");

    const dailyPreset = screen.getByTestId("studio-quick-preset-daily-cuttoon");
    goCreateStep(1);
    fireEvent.click(dailyPreset);

    expect(dailyPreset.getAttribute("aria-pressed")).toBe("true");
    expect(
      container.querySelector('[data-studio-create-format="cuttoon"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(simulator.getAttribute("data-preview-mode")).toBe("card-news");
    expect(simulator.textContent).toContain("SNS 카드 4장 구성");
    expect(simulator.textContent).toContain("4장 세트");

    goCreateStep(2);
    const titleInput = screen.getByRole("textbox", {
      name: /프로젝트 이름|Project name/u,
    }) as HTMLInputElement;
    expect(titleInput.value).toBe("오늘 하루 네 컷 일기");

    goCreateStep(3);
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

  it("안전영역 순수 계산기가 세로 웹툰·SNS 카드·페이지 만화·가로 와이드·비정상 수치를 정확히 판정한다", () => {
    const narrow = analyzeMobileSafeZone(540, 1280, "balanced");
    expect(narrow.previewMode).toBe("vertical-scroll");
    expect(narrow.readabilityTone).toBe("warning");
    expect(narrow.cutsPerScreen).toBe(2);

    const standard = analyzeMobileSafeZone(800, 2640, "cinematic");
    expect(standard.readabilityTone).toBe("optimal");
    expect(standard.phoneScreensPerPage).toBe(2);
    expect(standard.cutsPerScreen).toBe(1);

    const cuttoon = analyzeMobileSafeZone(1080, 1080, "balanced", "cuttoon", 4);
    expect(cuttoon.previewMode).toBe("card-news");
    expect(cuttoon.phoneScreensPerPage).toBe(4);
    expect(cuttoon.readabilityTone).toBe("optimal");

    const pageComic = analyzeMobileSafeZone(1600, 2400, "balanced", "page-comic", 8);
    expect(pageComic.previewMode).toBe("page-spread");
    expect(pageComic.phoneScreensPerPage).toBe(8);

    const landscape = analyzeMobileSafeZone(1920, 1080, "balanced", "motion-toon", 1);
    expect(landscape.previewMode).toBe("landscape");
    expect(landscape.readabilityTone).toBe("optimal");
    expect(landscape.aspectRatioLabel).toBe("16:9");

    const malformed = analyzeMobileSafeZone(Number.NaN, Number.POSITIVE_INFINITY, "balanced");
    expect(malformed.previewMode).toBe("vertical-scroll");
    expect(malformed.aspectRatioLabel).toBe("5:8");
  });

  it("초보자 10초 단축키·제스처 바에서 터치 제스처 전환과 기능 찾기 열기가 모두 동작한다", () => {
    const listener = vi.fn();
    window.addEventListener("toonspectrum:command-palette:open", listener);

    render(<StudioBeginnerQuickTipsBar />);
    expect(screen.getByTestId("studio-beginner-quick-tips")).toBeTruthy();

    fireEvent.click(screen.getByTestId("quick-tips-mode-touch"));
    expect(screen.getByText("두 손가락 탭")).toBeTruthy();
    expect(screen.getByText("색상 스포이드")).toBeTruthy();

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

  it("AI 보조 세션 저장소가 프로젝트별 초안·구버전 호환을 복원하고 손상된 mode/result 및 빈 초안은 안전하게 정리한다", () => {
    writeStudioAssistantSessionState(
      "proj-alpha",
      {
        openAiMode: "dialogue-polish",
        prompt: "비 오는 날 우산을 건네는 첫 대사",
        lastResult: null,
      },
      window.sessionStorage,
    );

    const restored = readStudioAssistantSessionState("proj-alpha", window.sessionStorage);
    expect(restored?.openAiMode).toBe("dialogue-polish");
    expect(restored?.prompt).toBe("비 오는 날 우산을 건네는 첫 대사");

    // 공백만 있는 빈 초안 기록 시 불필요한 세션 키를 남기지 않고 제거한다.
    writeStudioAssistantSessionState(
      "proj-alpha",
      {
        openAiMode: "dialogue-polish",
        prompt: "   ",
        lastResult: null,
      },
      window.sessionStorage,
    );
    expect(readStudioAssistantSessionState("proj-alpha", window.sessionStorage)).toBeNull();
    expect(window.sessionStorage.getItem("toonstudio:assistant-draft:v1:proj-alpha")).toBeNull();

    // 손상된 mode 거부
    window.sessionStorage.setItem(
      "toonstudio:assistant-draft:v1:proj-corrupt-mode",
      JSON.stringify({
        openAiMode: "invalid-mode",
        prompt: "손상된 모드",
        lastResult: null,
      }),
    );
    expect(
      readStudioAssistantSessionState("proj-corrupt-mode", window.sessionStorage),
    ).toBeNull();

    // 손상된 lastResult(필수 필드·data 배열 누락)는 null로 정화하고 정상 prompt는 보존한다.
    window.sessionStorage.setItem(
      "toonstudio:assistant-draft:v1:proj-corrupt-result",
      JSON.stringify({
        openAiMode: "idea-remix",
        prompt: "정상 프롬프트",
        lastResult: {
          provider: "openai",
          model: "gpt-4o-mini",
          privacy: { storeData: false, piiRedactedCount: 0 },
          quota: { remainingDaily: 50, dailyLimit: 60 },
          result: { mode: "idea-remix", data: { summary: "요약만 있고 angles 배열 누락" } },
        },
      }),
    );
    const sanitized = readStudioAssistantSessionState(
      "proj-corrupt-result",
      window.sessionStorage,
    );
    expect(sanitized?.prompt).toBe("정상 프롬프트");
    expect(sanitized?.lastResult).toBeNull();

    // 구버전 inputText/mode 키 호환 복원
    window.sessionStorage.setItem(
      "toonstudio:assistant-draft:v1:proj-legacy",
      JSON.stringify({
        mode: "script-to-cuts",
        inputText: "구버전 세션 초안",
      }),
    );
    const legacy = readStudioAssistantSessionState("proj-legacy", window.sessionStorage);
    expect(legacy?.openAiMode).toBe("script-to-cuts");
    expect(legacy?.prompt).toBe("구버전 세션 초안");

    clearStudioAssistantSessionState("proj-legacy", window.sessionStorage);
    expect(readStudioAssistantSessionState("proj-legacy", window.sessionStorage)).toBeNull();
  });
});
