// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { TitleReaderFocusRhythmBar } from "./TitleReaderFocusRhythmBar";
import {
  buildReaderCutsStudioHref,
  loadReaderFocusCalm,
  READER_FOCUS_STORAGE_KEY,
  resolveCutsRhythmPresetFromQuery,
  saveReaderFocusCalm,
} from "./title-reader-rhythm";

beforeEach(() => {
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  useI18n.setState({ lang: "ko" });
});

describe("title-reader-rhythm pure model", () => {
  it("독자 감정 무드를 실제 컷츠 리듬 프리셋 쿼리로 변환한다", () => {
    expect(buildReaderCutsStudioHref({ slug: "fog-signal", episode: 4, mood: "heart" })).toBe(
      "/cuts/studio?fromTitle=fog-signal&ep=4&mood=flutter",
    );
    expect(buildReaderCutsStudioHref({ slug: "fog-signal", episode: 4, mood: "tension" })).toBe(
      "/cuts/studio?fromTitle=fog-signal&ep=4&mood=chase",
    );
    expect(buildReaderCutsStudioHref({ slug: "fog-signal", episode: 4, mood: "afterglow" })).toBe(
      "/cuts/studio?fromTitle=fog-signal&ep=4&mood=linger",
    );
    expect(buildReaderCutsStudioHref({ slug: "fog-signal", episode: 4, mood: "twist" })).toBe(
      "/cuts/studio?fromTitle=fog-signal&ep=4&mood=impact",
    );
    expect(resolveCutsRhythmPresetFromQuery("chase")).toBe("chase");
    expect(resolveCutsRhythmPresetFromQuery("twist")).toBe("impact");
    expect(resolveCutsRhythmPresetFromQuery("unknown")).toBeNull();
  });

  it("집중 읽기 설정은 명시적 저장 시에만 기록하고 기본값은 false로 복원한다", () => {
    const writeSpy = vi.spyOn(Storage.prototype, "setItem");
    try {
      expect(loadReaderFocusCalm()).toBe(false);
      expect(writeSpy).not.toHaveBeenCalled();

      saveReaderFocusCalm(true);
      expect(window.localStorage.getItem(READER_FOCUS_STORAGE_KEY)).toBe("1");
      expect(loadReaderFocusCalm()).toBe(true);
    } finally {
      writeSpy.mockRestore();
    }
  });
});

describe("TitleReaderFocusRhythmBar", () => {
  it("컷츠 리믹스 패널은 기본 접힘 상태를 유지하고 분위기 선택 시 실제 컷츠 URL을 갱신한다", () => {
    const onToggleFocusCalm = vi.fn();
    render(
      <MemoryRouter>
        <TitleReaderFocusRhythmBar
          slug="fog-signal"
          episode={7}
          focusCalm={false}
          onToggleFocusCalm={onToggleFocusCalm}
        />
      </MemoryRouter>,
    );

    const disclosure = screen.getByTestId("reader-cuts-remix-disclosure") as HTMLDetailsElement;
    expect(disclosure.open).toBe(false);

    const focusBtn = screen.getByRole("button", { name: "집중 읽기 켜기" });
    expect(focusBtn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(focusBtn);
    expect(onToggleFocusCalm).toHaveBeenCalledOnce();

    const moodGroup = within(disclosure).getByRole("group", { name: "컷츠 분위기 선택" });
    fireEvent.click(within(moodGroup).getByRole("button", { name: "긴박" }));

    const openLink = within(disclosure).getByRole("link", { name: /긴박 분위기로 컷츠 열기/u });
    expect(openLink.getAttribute("href")).toBe("/cuts/studio?fromTitle=fog-signal&ep=7&mood=chase");
  });

  it("영문 로캘에서 한글 누출 없이 렌더링한다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter>
        <TitleReaderFocusRhythmBar
          slug="fog-signal"
          episode={2}
          focusCalm={true}
          onToggleFocusCalm={vi.fn()}
        />
      </MemoryRouter>,
    );

    const bar = screen.getByTestId("reader-focus-rhythm-bar");
    expect(bar.textContent).not.toMatch(/[가-힣]/u);
    expect(within(bar).getByRole("button", { name: "Calm focus on" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("독자 뷰어 파일군에 원시 HEX·rgb()·bg-white·text-white·animate-pulse가 남아 있지 않다", () => {
    const files = [
      "TitleReaderPage.tsx",
      "TitleReaderReaBridgeCard.tsx",
      "TitleReaderFocusRhythmBar.tsx",
      "title-reader-atelier.css",
      "reader-reference-layout.css",
    ];
    for (const file of files) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      expect(source, `${file} raw hex`).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
      expect(source, `${file} rgb()`).not.toMatch(/\brgba?\s*\(/u);
      expect(source, `${file} bg-white/text-white/border-white/bg-black`).not.toMatch(
        /\b(?:bg-white|text-white|border-white|outline-white|bg-black)\b/u,
      );
      expect(source, `${file} animate-pulse/transition-all`).not.toMatch(
        /\b(?:animate-pulse|animate-spin|transition-all)\b/u,
      );
    }
  });
});
