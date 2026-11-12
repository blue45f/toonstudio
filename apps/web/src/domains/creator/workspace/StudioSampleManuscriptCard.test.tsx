// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { readStudioProjectLibrary, STUDIO_PROJECT_LIBRARY_UPDATED_EVENT } from "../studio-project-library-store";
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

function renderCard(compact = false) {
  return render(
    <MemoryRouter>
      <StudioSampleManuscriptCard compact={compact} />
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

  it("접힌 구조 안내를 열고 사본을 만든 뒤 다시 열어도 같은 사본을 이어한다", async () => {
    const { container } = renderCard(true);
    const summary = await screen.findByText(/^(완성 원고로 따라 그리기|Learn from a finished manuscript)$/u);
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    await waitFor(() => expect(persistence.persist).toHaveBeenCalledOnce());
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(container.querySelectorAll("ol li")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: /연습 사본 만들어 따라 그리기|Make a practice copy and trace/u }));
    const copy = await screen.findByRole("link", { name: /연습 사본 이어서 따라 그리기|Keep tracing/u });
    const href = copy.getAttribute("href");
    fireEvent.click(summary);
    expect(details?.open).toBe(false);
    fireEvent.click(summary);
    expect(copy.getAttribute("href")).toBe(href);
    expect(href).toBe("/studio/p/sample-practice-1/d/sample-practice-1-ep01?workspace=comic");
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(2);
  });

  it("사본 저장 실패를 닫힌 안내 밖에 남기고 재시도 후 실제 사본 링크를 제공한다", async () => {
    persistence.persist.mockImplementation(async (seed) => seed.workId.startsWith("sample-practice") ? "unavailable" : "written");
    renderCard(true);
    const summary = await screen.findByText(/^(완성 원고로 따라 그리기|Learn from a finished manuscript)$/u);
    fireEvent.click(summary);
    const create = screen.getByRole("button", { name: /연습 사본 만들어 따라 그리기|Make a practice copy and trace/u });
    fireEvent.click(create);
    const alert = await screen.findByRole("alert");
    fireEvent.click(summary);
    expect(summary.closest("details")?.open).toBe(false);
    expect(alert.closest("details")).toBeNull();
    expect(screen.queryByRole("link", { name: /연습 사본 이어서 따라 그리기|Keep tracing/u })).toBeNull();
    persistence.persist.mockResolvedValue("written");
    fireEvent.click(summary);
    fireEvent.click(create);
    expect(await screen.findByRole("link", { name: /연습 사본 이어서 따라 그리기|Keep tracing/u })).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("컴팩트 표시에서도 준비 실패와 재시도를 접지 않는다", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    renderCard(true);
    expect((await screen.findByRole("alert")).closest("details")).toBeNull();
    expect(screen.getByRole("button", { name: /다시 시도|Try again/u }).closest("details")).toBeNull();
  });

  it.each(["written", "kept-existing", "busy", "unavailable"] as const)(
    "세션 확정이 늦어도 실제 쓰기 완료(%s)만 목록 미리보기를 갱신한다",
    async (outcome) => {
      persistence.ownerReady = false;
      let finish: (result: StudioSeedDurableOutcome) => void = () => { throw new Error("pending 저장 준비 전"); };
      const pending = new Promise<StudioSeedDurableOutcome>((resolve) => { finish = resolve; });
      persistence.persist.mockReturnValue(pending);
      const view = renderCard();
      await screen.findByRole("heading", { name: /완성 원고를 뜯어보고|Take a finished manuscript apart/u });
      const before = readStudioProjectLibrary(window.localStorage).projects.find((project) => project.id === SAMPLE_PROJECT_ID);
      expect(before?.lastOpenedDocumentId).toBeTruthy();
      expect(persistence.persist).not.toHaveBeenCalled();

      persistence.ownerReady = true;
      view.rerender(<MemoryRouter><StudioSampleManuscriptCard /></MemoryRouter>);
      await waitFor(() => expect(persistence.persist).toHaveBeenCalledOnce());
      const dispatch = vi.spyOn(window, "dispatchEvent");
      const updates = () => dispatch.mock.calls.filter(([event]) => event.type === STUDIO_PROJECT_LIBRARY_UPDATED_EVENT);
      expect(updates()).toHaveLength(0);
      await act(async () => { finish(outcome); await pending; });
      expect(updates()).toHaveLength(outcome === "written" ? 1 : 0);
      const after = readStudioProjectLibrary(window.localStorage).projects.find((project) => project.id === SAMPLE_PROJECT_ID);
      expect(after?.lastOpenedDocumentId).toBe(before?.lastOpenedDocumentId);
      expect(after?.title).toBe(before?.title);
      if (outcome !== "written") expect(after?.lastOpenedAt).toBe(before?.lastOpenedAt);
    },
  );

});
