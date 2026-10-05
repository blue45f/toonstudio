// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  addResearchNotebookEntry,
  researchNotebookStorageKey,
} from "./research-notebook";

import { useResearchNotebook } from "./useResearchNotebook";
// 이 테스트는 비로그인 상태라 노트가 게스트 파티션 키에 저장된다(소유자 스코프).
const GUEST_NOTEBOOK_KEY = researchNotebookStorageKey("guest");

function NotebookHarness() {
  const { notebook, update, error } = useResearchNotebook();
  return <div>
    <output data-testid="count">{notebook.entries.length}</output>
    <button type="button" onClick={() => update((current) => addResearchNotebookEntry(current, {
      id: `note-${current.entries.length}`,
      kind: "observation",
      text: `관찰 ${current.entries.length}`,
      now: new Date("2026-09-09T03:00:00.000Z"),
    }))}>노트 추가</button>
    <output>{error}</output>
  </div>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("useResearchNotebook", () => {
  it("loads versioned notes and preserves the in-memory notebook when a later browser write fails", async () => {
    localStorage.setItem(GUEST_NOTEBOOK_KEY, JSON.stringify({
      version: 1,
      entries: [{
        id: "existing",
        kind: "observation",
        text: "기존 관찰",
        sourceIds: [],
        createdAt: "2026-09-09T00:00:00.000Z",
        updatedAt: "2026-09-09T00:00:00.000Z",
      }],
    }));
    render(<NotebookHarness />);
    const count = screen.getByTestId("count");
    await waitFor(() => expect(count.textContent).toBe("1"));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    fireEvent.click(screen.getByRole("button", { name: "노트 추가" }));

    expect(count.textContent).toBe("2");
    expect(screen.getByText("quota exceeded")).toBeTruthy();
  });
});
