// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { CreateStartGrandAtelierSection } from "../CreateStartGrandAtelierSection";
import { BeginnerInstantComicWizard } from "./BeginnerInstantComicWizard";

const WIZARD_DIR = resolve(__dirname);
const WIZARD_TSX_PATH = resolve(WIZARD_DIR, "BeginnerInstantComicWizard.tsx");
const WIZARD_CSS_PATH = resolve(WIZARD_DIR, "beginner-instant-wizard.css");
const PUBLIC_DIR = resolve(WIZARD_DIR, "../../../../../public");

function renderWizard() {
  return render(
    <MemoryRouter initialEntries={["/create"]}>
      <BeginnerInstantComicWizard />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
});

describe("BeginnerInstantComicWizard (초보자 30초 4컷 웹툰 시작 위저드)", () => {
  it("기본 진입 시 4종 분위기·3종 안심 보정 기본 ON·실시간 4컷 프리뷰와 즉시 캔버스 링크를 렌더링한다", () => {
    renderWizard();

    const wizard = screen.getByTestId("beginner-instant-comic-wizard");
    expect(wizard.getAttribute("data-mood")).toBe("daily");

    expect(screen.getByTestId("biw-mood-daily").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByTestId("biw-mood-romance").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("biw-mood-comedy").getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByTestId("biw-mood-fantasy").getAttribute("aria-pressed")).toBe("false");

    expect(screen.getByTestId("biw-switch-stabilize").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("biw-switch-pose3d").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("biw-switch-palette").getAttribute("aria-checked")).toBe("true");

    const board = screen.getByTestId("biw-preview-board");
    expect(within(board).getByText("도입")).toBeTruthy();
    expect(within(board).getByText("전개")).toBeTruthy();
    expect(within(board).getByText("반전")).toBeTruthy();
    expect(within(board).getByText("여운")).toBeTruthy();

    const cta = screen.getByRole("link", { name: "이 세팅 그대로 30초 만에 캔버스 열기" });
    const url = new URL(cta.getAttribute("href") ?? "", "http://localhost");
    expect(url.pathname).toBe("/studio/new");
    expect(url.searchParams.get("lane")).toBe("blank");
    expect(url.searchParams.get("preset")).toBe("instatoon-square");
    expect(url.searchParams.get("beginner")).toBe("1");
    expect(url.searchParams.get("mood")).toBe("daily");
    expect(url.searchParams.get("stabilize")).toBe("70");
    expect(url.searchParams.get("pose3d")).toBe("1");
    expect(url.searchParams.get("palette")).toBe("warm-butter");
  });

  it("Step 1 분위기 전환 시 4컷 예시 시나리오·팔레트·CTA 쿼리가 즉시 반영되고 스프라이트 오류 시 기존 에셋으로 안전 폴백한다", () => {
    renderWizard();

    const fallbackExpectations = [
      { id: "daily", primary: "/assets/studio/vibrant-sprites/beginner-1-story.webp", fallback: "/assets/studio/vibrant-sprites/tool-bubble-sfx.webp", palette: "warm-butter" },
      { id: "romance", primary: "/assets/studio/vibrant-sprites/beginner-2-pose.webp", fallback: "/assets/studio/vibrant-sprites/tool-vrm.webp", palette: "blossom-peach" },
      { id: "comedy", primary: "/assets/studio/vibrant-sprites/beginner-3-brush.webp", fallback: "/assets/studio/vibrant-sprites/tool-watercolor.webp", palette: "citrus-pop" },
      { id: "fantasy", primary: "/assets/studio/vibrant-sprites/beginner-4-publish.webp", fallback: "/assets/studio/vibrant-sprites/emblem-studio.webp", palette: "starlight-teal" },
    ] as const;

    for (const item of fallbackExpectations) {
      const btn = screen.getByTestId(`biw-mood-${item.id}`);
      const img = btn.querySelector("img");
      expect(img?.getAttribute("src")).toBe(item.primary);
      if (!img) throw new Error(`${item.id} 스프라이트 이미지가 없습니다.`);

      fireEvent.error(img);
      expect(img.getAttribute("src")).toBe(item.fallback);
      expect(existsSync(resolve(PUBLIC_DIR, item.fallback.replace(/^\//u, "")))).toBe(true);

      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      const ctaHref = screen.getByTestId("biw-launch-cta").getAttribute("href") ?? "";
      const url = new URL(ctaHref, "http://localhost");
      expect(url.searchParams.get("mood")).toBe(item.id);
      expect(url.searchParams.get("palette")).toBe(item.palette);
    }
  });

  it("Step 2 안심 보정 스위치 3종을 토글하면 4컷 프리뷰 상태와 캔버스 링크 쿼리가 갱신된다", () => {
    renderWizard();

    const stabilizeBtn = screen.getByTestId("biw-switch-stabilize");
    const poseBtn = screen.getByTestId("biw-switch-pose3d");
    const paletteBtn = screen.getByTestId("biw-switch-palette");

    fireEvent.click(stabilizeBtn);
    fireEvent.click(poseBtn);
    fireEvent.click(paletteBtn);

    expect(stabilizeBtn.getAttribute("aria-checked")).toBe("false");
    expect(poseBtn.getAttribute("aria-checked")).toBe("false");
    expect(paletteBtn.getAttribute("aria-checked")).toBe("false");

    const board = screen.getByTestId("biw-preview-board");
    expect(within(board).getAllByText("자유 스케치")).toHaveLength(4);

    const url = new URL(screen.getByTestId("biw-launch-cta").getAttribute("href") ?? "", "http://localhost");
    expect(url.searchParams.get("stabilize")).toBe("0");
    expect(url.searchParams.get("pose3d")).toBe("0");
    expect(url.searchParams.get("palette")).toBe("custom");
  });

  it("Step 3 원클릭 추천 대사 전환과 1줄 제목·컷 대사 직접 수정 및 되돌리기가 동작한다", () => {
    renderWizard();

    const titleInput = screen.getByLabelText("내 첫 4컷 제목 (1줄)") as HTMLInputElement;
    const initialTitle = titleInput.value;
    expect(initialTitle).toBe("월요일 카페 첫 모금");

    fireEvent.click(screen.getByTestId("biw-cycle-template"));
    expect(titleInput.value).not.toBe(initialTitle);
    const secondTitle = titleInput.value;

    fireEvent.change(titleInput, { target: { value: "우리 동네 강아지 일기" } });
    expect(titleInput.value).toBe("우리 동네 강아지 일기");

    const panel1Input = screen.getByLabelText("1컷 도입 대사") as HTMLInputElement;
    fireEvent.change(panel1Input, { target: { value: "아침 산책 나가자마자 비가 쏟아졌다!" } });
    expect(panel1Input.value).toBe("아침 산책 나가자마자 비가 쏟아졌다!");

    const url = new URL(screen.getByTestId("biw-launch-cta").getAttribute("href") ?? "", "http://localhost");
    expect(url.searchParams.get("title")).toBe("우리 동네 강아지 일기");

    fireEvent.click(screen.getByTestId("biw-reset-edits"));
    expect(titleInput.value).toBe(secondTitle);
    expect(screen.queryByTestId("biw-reset-edits")).toBeNull();
  });

  it("영어 로케일에서 모든 분위기·스위치·프리뷰·입력값에 한글 문자가 0건이다", () => {
    useI18n.setState({ lang: "en" });
    const { container } = renderWizard();

    for (const moodId of ["daily", "romance", "comedy", "fantasy"] as const) {
      fireEvent.click(screen.getByTestId(`biw-mood-${moodId}`));
      expect(container.textContent).not.toMatch(/[가-힣]/u);
      const inputs = Array.from(container.querySelectorAll("input"));
      expect(inputs.length).toBe(5);
      for (const input of inputs) {
        expect(input.value).not.toMatch(/[가-힣]/u);
      }
      const ctaHref = screen.getByTestId("biw-launch-cta").getAttribute("href") ?? "";
      expect(decodeURIComponent(ctaHref)).not.toMatch(/[가-힣]/u);
    }
  });

  it("CreateStartGrandAtelierSection 안에서 표준 프리셋 아래, 전문 도구 펼침 위에 마운트된다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <CreateStartGrandAtelierSection storyHref="/create?intent=my-story" />
      </MemoryRouter>,
    );

    const presets = screen.getByTestId("create-grand-atelier-presets");
    const wizard = screen.getByTestId("beginner-instant-comic-wizard");
    const proDisclosure = screen.getByTestId("create-pro-tools-disclosure");

    expect(presets.compareDocumentPosition(wizard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(wizard.compareDocumentPosition(proDisclosure) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("소스 품질 제약(450줄 이하 · 저장소 직접 접근 0건 · 원시색 0건 · GPU 전이 및 접근성 미디어 쿼리)을 만족한다", () => {
    const tsxSource = readFileSync(WIZARD_TSX_PATH, "utf8");
    const cssSource = readFileSync(WIZARD_CSS_PATH, "utf8");

    expect(tsxSource.split(/\r?\n/u).length).toBeLessThanOrEqual(450);
    expect(tsxSource).not.toMatch(/\b(localStorage|sessionStorage|indexedDB)\b/u);
    expect(tsxSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(tsxSource).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/u);

    expect(cssSource).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(cssSource).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/u);
    expect(cssSource).toContain("oklch(");
    expect(cssSource).toContain("prefers-reduced-motion: reduce");
    expect(cssSource).toContain('data-design-theme="contrast"');
    expect(cssSource).toContain("prefers-contrast: more");
    expect(cssSource).toContain("forced-colors: active");

    const transitionLines = cssSource.match(/transition\s*:[^;]+;/gu) ?? [];
    expect(transitionLines.length).toBeGreaterThan(0);
    for (const line of transitionLines) {
      expect(line).not.toMatch(/\b(all|background|color|border|width|height|box-shadow)\b/u);
    }
  });
});
