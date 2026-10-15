// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  StudioSeedAutosave,
  StudioSeedDurableOutcome,
} from "../save-first/studio-seed-autosave-durable";
import {
  EXAMPLE_DOCUMENT_ID,
  EXAMPLE_PROJECT_ID,
  readExampleJourney,
} from "../studio-example-project-content";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioExampleProjectBanner } from "./StudioExampleProjectBanner";

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

function renderBanner() {
  return render(
    <MemoryRouter>
      <StudioExampleProjectBanner />
    </MemoryRouter>,
  );
}

describe("StudioExampleProjectBanner", () => {
  it("seeds the example on first render and pins the journey above the library", async () => {
    renderBanner();

    expect(await screen.findByRole("heading", { name: /예제 프로젝트로 한 컷을 완주|Finish one panel/u })).toBeTruthy();
    expect(readStudioProjectLibrary(window.localStorage).projects.map((project) => project.id))
      .toEqual([EXAMPLE_PROJECT_ID]);

    const openLink = screen.getByRole("link", { name: /예제 열기|Open the example/u });
    expect(openLink.getAttribute("href")).toBe(
      `/studio/p/${EXAMPLE_PROJECT_ID}/d/example-ep01?workspace=comic`,
    );
    expect(screen.getByRole("checkbox", { name: /말풍선 대사 바꿔|Rewrite the speech balloon/u })).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("plants the example draft in durable storage once the owner session is ready", async () => {
    renderBanner();
    await screen.findByRole("heading", { name: /예제 프로젝트로 한 컷을 완주|Finish one panel/u });

    await waitFor(() => {
      expect(persistence.persist).toHaveBeenCalledTimes(1);
    });
    const seed = persistence.persist.mock.calls[0]?.[0];
    expect(seed?.workId).toBe(EXAMPLE_DOCUMENT_ID);
    expect(seed?.build().pagesList.length).toBeGreaterThan(0);
  });

  it("does not plant any draft before the owner session is ready", async () => {
    persistence.ownerReady = false;
    renderBanner();
    await screen.findByRole("heading", { name: /예제 프로젝트로 한 컷을 완주|Finish one panel/u });

    expect(persistence.persist).not.toHaveBeenCalled();
  });

  it("records journey progress in its own storage key when a step is checked", async () => {
    renderBanner();
    const checkbox = await screen.findByRole("checkbox", { name: /예제 프로젝트 열기|Open the example project/u });
    fireEvent.click(checkbox);
    await waitFor(() => {
      expect(readExampleJourney(window.localStorage).doneIds).toEqual(["open-example"]);
    });
  });

  it("collapses to a compact bar and can be reopened", async () => {
    renderBanner();
    fireEvent.click(await screen.findByRole("button", { name: /접어 두기|Collapse/u }));
    const reopen = await screen.findByRole("button", { name: /여정 다시 보기|Show the journey again/u });
    fireEvent.click(reopen);
    expect(await screen.findByRole("heading", { name: /예제 프로젝트로 한 컷을 완주|Finish one panel/u })).toBeTruthy();
  });

  it("shows an in-banner error instead of breaking the library when storage writes fail", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    renderBanner();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /다시 시도|Try again/u })).toBeTruthy();
  });
});
