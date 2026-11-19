// @vitest-environment jsdom
import { deviceKey, records, writeDevice } from "./__tests__/planning-device-database";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioProjectMoodboard } from "./StudioProjectMoodboard";
import { STUDIO_MOODBOARD_UPDATED_EVENT, addMoodboardCard, deserializeMoodboard, serializeMoodboard, studioMoodboardStorageKey } from "./studio-moodboard";


beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function addNote(text: string) {
  const form = within(screen.getAllByRole("form", { name: "카드 더하기" })[0]!);
  fireEvent.change(form.getByLabelText("카드 종류"), { target: { value: "note" } });
  fireEvent.change(form.getByLabelText("내용"), { target: { value: text } });
  fireEvent.click(form.getByRole("button", { name: "카드 더하기" }));
}

function current(id: string) {
  const value = deserializeMoodboard(records.get(deviceKey("studio-project-moodboards", studioMoodboardStorageKey(id))) ?? "");
  if (!value?.ok) throw Error("저장한 보드가 없습니다.");
  return value.board;
}

describe("프로젝트 참고자료 보드", () => {
  it("카드를 같은 id로 수정하고 Undo·Redo를 저장한 뒤 작품별로 다시 연다", async () => {
    const { rerender, unmount } = render(<StudioProjectMoodboard projectId="A" />);
    await screen.findByText("이 기기에 저장됨");
    addNote("새벽 복도");
    await screen.findByText("이 기기에 저장됨");
    const id = Object.keys(current("A").cards)[0]!;
    fireEvent.click(screen.getByRole("button", { name: "카드 수정" }));
    fireEvent.change(screen.getByLabelText("카드 내용"), { target: { value: "새벽 복도 · 2판" } });
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").cards[id]?.text).toBe("새벽 복도 · 2판");
    fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").cards[id]?.text).toBe("새벽 복도");
    fireEvent.click(screen.getByRole("button", { name: "다시 실행" }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").cards[id]?.text).toBe("새벽 복도 · 2판");
    rerender(<StudioProjectMoodboard projectId="B" />);
    await screen.findByText("이 기기에 저장됨");
    expect(Object.keys(current("B").cards)).toEqual([]);
    expect(screen.getByRole("button", { name: "실행 취소" })).toHaveProperty("disabled", true);
    unmount();
    render(<StudioProjectMoodboard projectId="A" />);
    expect(await screen.findByText("새벽 복도 · 2판")).toBeTruthy();
  });

  it("키보드로 그린 두 획을 따로 수정하고 카드 연결·삭제·복원에 같은 id를 사용한다", async () => {
    const { unmount } = render(<StudioProjectMoodboard projectId="A" />);
    await screen.findByText("이 기기에 저장됨");
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
    await screen.findByText("이 기기에 저장됨");
    const sketchId = Object.values(current("A").cards).find(card => card.kind === "sketch")!.id;
    fireEvent.click(within(sketch).getByRole("button", { name: "카드 수정" }));
    draw(screen.getByRole("application", { name: "카드 스케치 수정" }));
    fireEvent.click(screen.getByRole("button", { name: "수정 저장" }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").cards[sketchId]?.strokes).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "카드 연결하기" }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").connections?.[0]?.to).toBe(sketchId);
    const undo = within(screen.getByRole("group", { name: "보드 변경 기록" })).getByRole("button", { name: "실행 취소" });
    fireEvent.click(within(sketch).getByText("이동·삭제"));
    fireEvent.click(within(sketch).getByRole("button", { name: "삭제" }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").connections).toEqual([]);
    fireEvent.click(undo);
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").connections?.[0]?.to).toBe(sketchId);
    unmount();
    render(<StudioProjectMoodboard projectId="A" />);
    expect(await screen.findByRole("img", { name: "구도 · 2획" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /연결 해제/ }));
    await screen.findByText("이 기기에 저장됨");
    expect(current("A").connections).toEqual([]);
  });

  it("저장 실패 뒤 수정본을 탭에 남기고 같은 내용으로 다시 저장한다", async () => {
    render(<StudioProjectMoodboard projectId="A" />);
    await screen.findByText("이 기기에 저장됨");
    writeDevice.mockRejectedValueOnce(new Error("quota"));
    addNote("이번 주 스케치");
    expect((await screen.findByRole("alert")).textContent).toContain("수정한 카드는 이 탭에 남아");
    expect(screen.getByText("이번 주 스케치")).toBeTruthy();
    expect(Object.keys(current("A").cards)).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "다시 저장" }));
    await waitFor(() => expect(Object.values(current("A").cards)[0]?.text).toBe("이번 주 스케치"));
    expect(screen.getByText("이 기기에 저장됨")).toBeTruthy();
  });

  it("다른 탭이 쓴 보드 위로 저장하지 않고 사용자가 저장본을 선택하도록 한다", async () => {
    render(<StudioProjectMoodboard projectId="A" />);
    await screen.findByText("이 기기에 저장됨");
    const original = current("A");
    const external = addMoodboardCard(original, original.columns[0]!.id, { id: "other", kind: "note", text: "다른 탭의 메모" });
    records.set(deviceKey("studio-project-moodboards", studioMoodboardStorageKey("A")), serializeMoodboard(external));
    await screen.findByText("이 기기에 저장됨");
    addNote("로컬 메모");
    expect((await screen.findByRole("alert")).textContent).toContain("다른 탭");
    expect(Object.keys(current("A").cards)).toEqual(["other"]);
    act(() => window.dispatchEvent(new CustomEvent(STUDIO_MOODBOARD_UPDATED_EVENT, { detail: { projectId: "A" } })));
    expect(screen.getByText("로컬 메모")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "내 변경을 버리고 저장본 열기" }));
    expect(await screen.findByText("다른 탭의 메모")).toBeTruthy();
  });
  it("구 저장본이 깨졌을 때 복구 버튼으로 원본을 보존한 후에만 새 보드를 연다", async () => {
    const oldKey = studioMoodboardStorageKey("복도");
    const key = deviceKey("studio-project-moodboards", oldKey);
    localStorage.setItem(oldKey, "{손상된 원본");
    render(<StudioProjectMoodboard projectId="복도" />);
    const replace = await screen.findByRole("button", { name: "새 무드보드로 시작하기" });
    writeDevice.mockRejectedValueOnce(new Error("quota"));
    fireEvent.click(replace);
    await screen.findByText(/원래 보드를 보존하지 못했어요/);
    expect(records.get(key)).toBe("{손상된 원본");
    fireEvent.click(replace);
    await screen.findByText("이 기기에 저장됨");
    expect(current("복도").projectId).toBe("복도");
    expect([...records].filter(([id]) => id.startsWith(key + ":damaged:")).map(([, value]) => value)).toEqual(["{손상된 원본"]);
    expect(localStorage.getItem(oldKey)).toBe("{손상된 원본");
  });

});
