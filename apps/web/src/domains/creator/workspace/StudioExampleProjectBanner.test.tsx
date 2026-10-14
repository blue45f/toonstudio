// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  EXAMPLE_PROJECT_ID,
  readExampleJourney,
} from "../studio-example-project-content";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioExampleProjectBanner } from "./StudioExampleProjectBanner";

beforeEach(() => {
  window.localStorage.clear();
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
