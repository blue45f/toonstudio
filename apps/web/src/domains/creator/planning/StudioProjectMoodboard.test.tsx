// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioProjectMoodboard } from "./StudioProjectMoodboard";
import { addMoodboardCard, readStudioProjectMoodboard, saveStudioProjectMoodboard, studioMoodboardStorageKey } from "./studio-moodboard";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function addNote(text: string) {
  const form = within(screen.getAllByRole("form", { name: "카드 더하기" })[0]!);
  fireEvent.change(form.getByLabelText("카드 종류"), { target: { value: "note" } });
  fireEvent.change(form.getByLabelText("내용"), { target: { value: text } });
  fireEvent.click(form.getByRole("button", { name: "카드 더하기" }));
}

function current(id: string) {
  const value = readStudioProjectMoodboard(localStorage, id);
  if (!value?.ok) throw Error("저장한 보드가 없습니다.");
  return value.board;
}

describe("프로젝트 참고자료 보드", () => {
  it("카드를 같은 id로 수정하고 Undo·Redo를 저장한 뒤 작품별로 다시 연다", () => {
    const { rerender, unmount } = render(<StudioProjectMoodboard projectId="A" />);
    addNote("새벽 복도");
    const id = Object.keys(current("A").cards)[0]!;
    fireEvent.click(screen.getByRole("button", { name: "카드 수정" }));
    fireEvent.change(screen.getByLabelText("카드 내용"), { target: { value: "새벽 복도 · 2판" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(current("A").cards[id]?.text).toBe("새벽 복도 · 2판");
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    expect(current("A").cards[id]?.text).toBe("새벽 복도");
    fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
    expect(current("A").cards[id]?.text).toBe("새벽 복도 · 2판");
    rerender(<StudioProjectMoodboard projectId="B" />);
    expect(Object.keys(current("B").cards)).toEqual([]);
    expect(screen.getByRole("button", { name: "실행 취소" })).toHaveProperty("disabled", true);
    unmount();
    render(<StudioProjectMoodboard projectId="A" />);
    expect(screen.getByText("새벽 복도 · 2판")).toBeTruthy();
  });

  it("키보드로 그린 두 획을 따로 수정하고 카드 연결·삭제·복원에 같은 id를 사용한다", () => {
    const { unmount } = render(<StudioProjectMoodboard projectId="A" />);
    addNote("복도");
    const form = within(screen.getAllByRole("form", { name: "카드 더하기" })[0]!);
    fireEvent.change(form.getByLabelText("카드 종류"), { target: { value: "sketch" } });
    fireEvent.change(form.getByLabelText("내용"), { target: { value: "구도" } });
    const draw = (surface: HTMLElement) => {
      for (const key of [" ", "ArrowRight", "ArrowDown", "Enter"]) fireEvent.keyDown(surface, { key });
    };
    draw(form.getByRole("application", { name: "새 카드 스케치" }));
    fireEvent.click(form.getByRole("button", { name: "카드 더하기" }));
    const sketch = screen.getByRole("img", { name: "구도 · 1획" }).closest("li")!;
    const sketchId = Object.values(current("A").cards).find(card => card.kind === "sketch")!.id;
    fireEvent.click(within(sketch).getByRole("button", { name: "카드 수정" }));
    draw(screen.getByRole("application", { name: "카드 스케치 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    expect(current("A").cards[sketchId]?.strokes).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "카드 연결하기" }));
    expect(current("A").connections?.[0]?.to).toBe(sketchId);
    const undo = within(screen.getByRole("group", { name: "보드 변경 기록" })).getByRole("button", { name: "실행 취소" });
    fireEvent.click(within(sketch).getByText("이동·삭제"));
    fireEvent.click(within(sketch).getByRole("button", { name: "삭제" }));
    expect(current("A").connections).toEqual([]);
    fireEvent.click(undo);
    expect(current("A").connections?.[0]?.to).toBe(sketchId);
    unmount();
    render(<StudioProjectMoodboard projectId="A" />);
    expect(screen.getByRole("img", { name: "구도 · 2획" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /연결 해제/ }));
    expect(current("A").connections).toEqual([]);
  });

  it("저장 실패 뒤 수정본을 탭에 남기고 같은 내용으로 다시 저장한다", () => {
    render(<StudioProjectMoodboard projectId="A" />);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });
    addNote("이번 주 스케치");
    expect(screen.getByRole("alert").textContent).toContain("수정한 카드는 이 탭에 남아");
    expect(screen.getByText("이번 주 스케치")).toBeTruthy();
    expect(Object.keys(current("A").cards)).toHaveLength(0);
    write.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    expect(Object.values(current("A").cards)[0]?.text).toBe("이번 주 스케치");
    expect(screen.getByText("이 기기에 저장됨")).toBeTruthy();
  });

  it("다른 탭이 쓴 보드 위로 저장하지 않고 사용자가 저장본을 선택하도록 한다", () => {
    render(<StudioProjectMoodboard projectId="A" />);
    const original = current("A");
    const external = addMoodboardCard(original, original.columns[0]!.id, { id: "other", kind: "note", text: "다른 탭의 메모" });
    saveStudioProjectMoodboard(localStorage, external);
    addNote("로컬 메모");
    expect(screen.getByRole("alert").textContent).toContain("다른 탭");
    expect(Object.keys(current("A").cards)).toEqual(["other"]);
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: studioMoodboardStorageKey("A") })));
    expect(screen.getByText("로컬 메모")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "내 변경을 버리고 저장본 열기" }));
    expect(screen.getByText("다른 탭의 메모")).toBeTruthy();
  });

  it("사용자가 복구를 선택한 뒤에만 손상 원문을 같은 프로젝트의 별도 키에 보존한다", () => {
    const key = studioMoodboardStorageKey("A");
    const otherKey = studioMoodboardStorageKey("B");
    const damaged = "{damaged-board-A";
    localStorage.setItem(key, damaged);
    localStorage.setItem(otherKey, "other-project-original");
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(<StudioProjectMoodboard projectId="A" />);
    expect(write).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "새 무드보드로 시작하기" }));
    const backups = Object.keys(localStorage).filter((storedKey) => storedKey.startsWith(`${key}:damaged:`));
    expect(backups).toHaveLength(1);
    expect(backups.map((storedKey) => localStorage.getItem(storedKey))).toEqual([damaged]);
    expect(Object.keys(current("A").cards)).toEqual([]);
    expect(localStorage.getItem(otherKey)).toBe("other-project-original");
    expect(write.mock.calls.map(([storedKey]) => storedKey)).toEqual([backups[0], key]);
  });

  it("손상 원문 백업이 실패하면 기존 보드를 삭제하거나 새 보드로 덮어쓰지 않는다", () => {
    const key = studioMoodboardStorageKey("A");
    localStorage.setItem(key, "damaged-original");
    render(<StudioProjectMoodboard projectId="A" />);
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementationOnce(() => { throw new Error("quota"); });

    fireEvent.click(screen.getByRole("button", { name: "새 무드보드로 시작하기" }));
    expect(screen.getByRole("alert").textContent).toContain("원래 보드를 보존하지 못했어요");
    expect(localStorage.getItem(key)).toBe("damaged-original");
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.keys(localStorage)).toEqual([key]);
    expect(screen.queryByRole("group", { name: "보드 변경 기록" })).toBeNull();
  });

  it("복구 전에 다른 탭이 원문을 바꾸면 그 값을 보존하고 다시 읽는다", () => {
    const key = studioMoodboardStorageKey("A");
    localStorage.setItem(key, "first-damaged-original");
    render(<StudioProjectMoodboard projectId="A" />);
    localStorage.setItem(key, "changed-original");
    const write = vi.spyOn(Storage.prototype, "setItem");

    fireEvent.click(screen.getByRole("button", { name: "새 무드보드로 시작하기" }));
    expect(write).not.toHaveBeenCalled();
    expect(localStorage.getItem(key)).toBe("changed-original");
    expect(Object.keys(localStorage)).toEqual([key]);
  });
});
