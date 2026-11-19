// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { deviceKey, records, writeDevice } from "./__tests__/planning-device-database";
import { StudioMoodboardScriptExcerpt } from "./StudioMoodboardScriptExcerpt";
import { addMoodboardCard, connectMoodboardCards, createDefaultStudioProjectMoodboard, serializeMoodboard, studioMoodboardStorageKey, saveStudioProjectMoodboard } from "./studio-moodboard";

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

it("열기만 할 때 수정하지 않고 원문 공백을 보존해 보드 순서로 추가한다", async () => {
  savePair(); const append = vi.fn(() => true);
  const view = render(<StudioMoodboardScriptExcerpt projectId="A" from="b" to="a" chapter={chapter} onAppend={append} />);
  const button = screen.getByRole("button", { name: "이 회차 대본 끝에 추가" });
  expect(append).not.toHaveBeenCalled();
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  fireEvent.click(button);
  const body = "작가가 쓴 원문  \n\n첫 장면\n둘째 장면";
  await waitFor(() => expect(append).toHaveBeenCalledExactlyOnceWith(body));
  view.rerender(<StudioMoodboardScriptExcerpt projectId="A" from="b" to="a" chapter={{ ...chapter, body }} onAppend={append} />);
  await waitFor(() => expect(button).toHaveProperty("disabled", true));
});
it("검토한 뒤 바뀐 출처는 다시 확인하고, 연결을 지우면 원문에 추가하지 않는다", async () => {
  const board = savePair(); const append = vi.fn(() => true);
  render(<StudioMoodboardScriptExcerpt projectId="A" from="a" to="b" chapter={chapter} onAppend={append} />);
  const button = screen.getByRole("button", { name: "이 회차 대본 끝에 추가" });
  await waitFor(() => expect(button).toHaveProperty("disabled", false));
  const key = deviceKey("studio-project-moodboards", studioMoodboardStorageKey("A"));
  records.set(key, serializeMoodboard({ ...board, cards: { ...board.cards, a: { ...board.cards.a!, text: "고친 장면" } } }));
  fireEvent.click(button);
  expect(append).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("새 내용을 확인"));
  records.set(key, serializeMoodboard({ ...board, connections: [] }));
  fireEvent.click(button);
  expect(append).not.toHaveBeenCalled();
  await waitFor(() => expect(button).toHaveProperty("disabled", true));
});
it("다른 프로젝트·확정 회차·글자 수 초과에서는 원문을 보존한다", async () => {
  savePair();
  const props = { from: "a", to: "b", onAppend: vi.fn(() => true) };
  for (const [projectId, edit] of [["B", chapter], ["A", { ...chapter, status: "locked" as const }], ["A", { ...chapter, body: "가".repeat(120000) }]] as const) {
    const view = render(<StudioMoodboardScriptExcerpt {...props} projectId={projectId} chapter={edit} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).not.toContain("확인하는 중"));
    expect(screen.getByRole("button", { name: "이 회차 대본 끝에 추가" })).toHaveProperty("disabled", true);
    view.unmount();
  }
  expect(props.onAppend).not.toHaveBeenCalled();
});


it("기기 저장소를 읽을 수 없으면 대본을 그대로 두고 카드 연결을 다시 확인한다", async () => {
  savePair();
  writeDevice.mockRejectedValueOnce(new Error("storage unavailable"));
  const onAppend = vi.fn(() => true);
  render(<StudioMoodboardScriptExcerpt projectId="A" from="a" to="b" chapter={chapter} onAppend={onAppend}/>);
  expect((await screen.findByRole("alert")).textContent).toContain("무드보드를 불러올 수 없어요");
  fireEvent.click(screen.getByRole("button", { name: "카드 다시 확인" }));
  await screen.findByText(/첫 장면.*둘째 장면/);
  expect(onAppend).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", { name: "이 회차 대본 끝에 추가" })).toHaveProperty("disabled", false));
});
