// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StudioMoodboardScriptExcerpt } from "./StudioMoodboardScriptExcerpt";
import { addMoodboardCard, connectMoodboardCards, createDefaultStudioProjectMoodboard, saveStudioProjectMoodboard } from "./studio-moodboard";

beforeEach(() => localStorage.clear());
afterEach(cleanup);
const chapter = { id: "ch1", title: "1화", status: "draft" as const, body: "작가가 쓴 원문  " };
function savePair(projectId = "A") {
  let board = createDefaultStudioProjectMoodboard(projectId);
  for (const [id, text] of [["a", "첫 장면"], ["b", "둘째 장면"]] as const) {
    board = addMoodboardCard(board, board.columns[0]!.id, { id, text, kind: "note" });
  }
  return saveStudioProjectMoodboard(localStorage, connectMoodboardCards(board, "b", "a"));
}

it("열기만 할 때 수정하지 않고 원문 공백을 보존해 보드 순서로 추가한다", () => {
  savePair(); const append = vi.fn(() => true);
  const view = render(<StudioMoodboardScriptExcerpt projectId="A" from="b" to="a" chapter={chapter} onAppend={append} />);
  const button = screen.getByRole("button", { name: "이 회차 대본 끝에 추가" });
  expect(append).not.toHaveBeenCalled();
  fireEvent.click(button);
  const body = "작가가 쓴 원문  \n\n첫 장면\n둘째 장면";
  expect(append).toHaveBeenCalledExactlyOnceWith(body);
  view.rerender(<StudioMoodboardScriptExcerpt projectId="A" from="b" to="a" chapter={{ ...chapter, body }} onAppend={append} />);
  expect(button).toHaveProperty("disabled", true);
});
it("검토한 뒤 바뀐 출처는 다시 확인하고, 연결을 지우면 원문에 추가하지 않는다", () => {
  const board = savePair(); const append = vi.fn(() => true);
  render(<StudioMoodboardScriptExcerpt projectId="A" from="a" to="b" chapter={chapter} onAppend={append} />);
  const button = screen.getByRole("button", { name: "이 회차 대본 끝에 추가" });
  saveStudioProjectMoodboard(localStorage, { ...board, cards: { ...board.cards, a: { ...board.cards.a!, text: "고친 장면" } } });
  fireEvent.click(button);
  expect(append).not.toHaveBeenCalled();
  expect(screen.getByRole("status").textContent).toContain("새 내용을 확인");
  saveStudioProjectMoodboard(localStorage, { ...board, connections: [] });
  fireEvent.click(button);
  expect(append).not.toHaveBeenCalled();
  expect(button).toHaveProperty("disabled", true);
});
it("다른 프로젝트·확정 회차·글자 수 초과에서는 원문을 보존한다", () => {
  savePair();
  const props = { from: "a", to: "b", onAppend: vi.fn(() => true) };
  for (const [projectId, edit] of [["B", chapter], ["A", { ...chapter, status: "locked" as const }], ["A", { ...chapter, body: "가".repeat(120000) }]] as const) {
    const view = render(<StudioMoodboardScriptExcerpt {...props} projectId={projectId} chapter={edit} />);
    expect(screen.getByRole("button", { name: "이 회차 대본 끝에 추가" })).toHaveProperty("disabled", true);
    view.unmount();
  }
  expect(props.onAppend).not.toHaveBeenCalled();
});
