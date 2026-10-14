// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  SAMPLE_EDITOR_HREF,
  SAMPLE_PROJECT_ID,
} from "../studio-sample-manuscript-content";
import { findSampleManuscriptPracticeCopy } from "../studio-sample-manuscript-seed";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioSampleManuscriptCard } from "./StudioSampleManuscriptCard";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

function renderCard() {
  return render(
    <MemoryRouter>
      <StudioSampleManuscriptCard />
    </MemoryRouter>,
  );
}

describe("StudioSampleManuscriptCard", () => {
  it("seeds the sample and shows the six-layer structure guide", async () => {
    renderCard();

    expect(await screen.findByRole("heading", { name: /완성 원고를 뜯어보고|Take a finished manuscript apart/u })).toBeTruthy();
    expect(readStudioProjectLibrary(window.localStorage).projects.map((project) => project.id))
      .toEqual([SAMPLE_PROJECT_ID]);

    const openLink = screen.getByRole("link", { name: /원본 열기|Open original/u });
    expect(openLink.getAttribute("href")).toBe(SAMPLE_EDITOR_HREF);
    // 구조 가이드 6개 층이 전부 보인다.
    expect(screen.getByText("컷 틀")).toBeTruthy();
    expect(screen.getByText("밑그림 (러프)")).toBeTruthy();
    expect(screen.getByText("톤")).toBeTruthy();
    expect(screen.getByText(/자체 제작/)).toBeTruthy();
  });

  it("creates a trace practice copy from the card and swaps the CTA to open it", async () => {
    renderCard();
    const createButton = await screen.findByRole("button", { name: /연습 사본 만들어 따라 그리기|Make a practice copy and trace/u });
    fireEvent.click(createButton);

    const openCopy = await screen.findByRole("link", { name: /연습 사본 이어서 따라 그리기|Keep tracing/u });
    expect(openCopy.getAttribute("href"))
      .toBe("/studio/p/sample-practice-1/d/sample-practice-1-ep01?workspace=comic");
    expect(findSampleManuscriptPracticeCopy(window.localStorage)?.mode).toBe("trace");
    // 원본 프로젝트는 여전히 하나, 사본이 하나 더해졌다.
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(2);
  });

  it("shows an in-card error instead of breaking the library when storage writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    renderCard();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 시도|Try again/u })).toBeTruthy();
  });
});
