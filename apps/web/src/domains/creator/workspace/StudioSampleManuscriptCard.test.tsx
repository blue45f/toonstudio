// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioSeedAutosave,
  StudioSeedDurableOutcome,
} from "../save-first/studio-seed-autosave-durable";
import {
  SAMPLE_EDITOR_HREF,
  SAMPLE_PROJECT_ID,
} from "../studio-sample-manuscript-content";
import { findSampleManuscriptPracticeCopy } from "../studio-sample-manuscript-seed";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioSampleManuscriptCard } from "./StudioSampleManuscriptCard";

// 내구 저장소(OPFS/SQLite)와 로그인 세션은 jsdom 에 없으므로 심는 훅을 가짜로 바꿔 배선만 확인한다.
// 훅과 내구 저장 모듈 자체는 studio-seed-autosave-durable.test.ts 가 검증한다.
const persistence = vi.hoisted(() => ({
  ownerReady: true,
  persist: vi.fn<(seed: StudioSeedAutosave) => Promise<StudioSeedDurableOutcome>>(),
}));

vi.mock("./useStudioSeedAutosavePersistence", () => ({
  useStudioSeedAutosavePersistence: () => ({
    ownerReady: persistence.ownerReady,
    persist: persistence.persist,
  }),
}));

beforeEach(() => {
  window.localStorage.clear();
  persistence.ownerReady = true;
  persistence.persist.mockReset();
  persistence.persist.mockResolvedValue("written");
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
    // 사본 링크를 보이기 전에 사본 초안도 내구 저장소에 심었다.
    const copySeed = persistence.persist.mock.calls
      .map(([seed]) => seed)
      .find((seed) => seed.workId === "sample-practice-1-ep01");
    expect(copySeed?.build().pagesList.length).toBeGreaterThan(0);
  });

  it("plants the original sample draft in durable storage once the owner session is ready", async () => {
    renderCard();
    await screen.findByRole("heading", { name: /완성 원고를 뜯어보고|Take a finished manuscript apart/u });

    await waitFor(() => {
      expect(persistence.persist).toHaveBeenCalled();
    });
    const seed = persistence.persist.mock.calls[0]?.[0];
    expect(SAMPLE_EDITOR_HREF).toContain(`/d/${seed?.workId}`);
    expect(seed?.build().pagesList.length).toBeGreaterThan(0);
  });

  it("does not plant any draft before the owner session is ready", async () => {
    persistence.ownerReady = false;
    renderCard();
    await screen.findByRole("heading", { name: /완성 원고를 뜯어보고|Take a finished manuscript apart/u });

    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it("shows an error instead of an editor link when the practice copy cannot be planted", async () => {
    persistence.persist.mockImplementation(async (seed) =>
      seed.workId.startsWith("sample-practice") ? "unavailable" : "written");
    renderCard();
    fireEvent.click(await screen.findByRole("button", { name: /연습 사본 만들어 따라 그리기|Make a practice copy and trace/u }));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /연습 사본 이어서 따라 그리기|Keep tracing/u })).toBeNull();
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
