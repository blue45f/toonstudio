// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import type { StudioSeedDurableOutcome } from "../save-first/studio-seed-autosave-durable";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { StudioDialogueSampleStart } from "./StudioDialogueSampleStart";

const persistence = vi.hoisted(() => ({ ownerReady: true, persist: vi.fn<() => Promise<StudioSeedDurableOutcome>>() }));
vi.mock("./useStudioSeedAutosavePersistence", () => ({ useStudioSeedAutosavePersistence: () => persistence }));

function CurrentPath() {
  return <output>{useLocation().pathname}</output>;
}

function renderStart() {
  return render(<MemoryRouter initialEntries={["/studio"]}><StudioDialogueSampleStart /><CurrentPath /></MemoryRouter>);
}

afterEach(() => { cleanup(); window.localStorage.clear(); persistence.persist.mockReset(); });

it("다른 탭이 사본을 쓰고 있으면 원고를 열지 않고 다시 시도할 수 있다", async () => {
  persistence.persist.mockResolvedValueOnce("busy").mockResolvedValueOnce("written");
  renderStart();
  const start = screen.getByRole("button", { name: "샘플 3컷 대사 고치기" });
  fireEvent.click(start);
  expect((await screen.findByRole("alert")).textContent).toContain("다른 탭");
  expect(screen.getByText("/studio")).toBeTruthy();
  fireEvent.click(start);
  expect(await screen.findByText("/studio/p/sample-practice-1/d/sample-practice-1-ep01")).toBeTruthy();
  expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(2);
});

it("사본 저장이 끝날 때까지 중복 입력을 막고 저장 실패를 알린다", async () => {
  const { promise, resolve } = Promise.withResolvers<StudioSeedDurableOutcome>();
  persistence.persist.mockReturnValue(promise);
  renderStart();
  const start = screen.getByRole<HTMLButtonElement>("button");
  fireEvent.click(start);
  fireEvent.click(start);
  expect(start.disabled).toBe(true);
  expect(persistence.persist).toHaveBeenCalledOnce();
  await act(async () => { resolve("unavailable"); });
  expect((await screen.findByRole("alert")).textContent).toContain("저장하지 못했습니다");
  expect(screen.getByText("/studio")).toBeTruthy();
  expect(start.disabled).toBe(false);
});
