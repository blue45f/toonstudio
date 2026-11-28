// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { StudioFreeAiAssistWorkbench } from "./StudioFreeAiAssistWorkbench";

interface PendingRequest {
  readonly mode: string;
  readonly inputText: string;
  readonly signal: AbortSignal;
  readonly finish: (response: Response) => void;
}

function setup() {
  const pending: PendingRequest[] = [];
  const fetchImpl = vi.fn<typeof fetch>((_url, init) => {
    if (init?.method !== "POST") return Promise.resolve(new Response(null, { status: 503 }));
    const { mode, inputText } = JSON.parse(String(init.body)) as { mode: string; inputText: string };
    const signal = init.signal;
    if (!signal) throw new Error("요청에 취소 신호가 없습니다.");
    // 이미 서버에 도착한 응답처럼, 취소 후에도 테스트에서 완료 순서를 지정할 수 있다.
    return new Promise((finish) => pending.push({ mode, inputText, signal, finish }));
  });
  const view = render(<StudioFreeAiAssistWorkbench initialMode="script-to-cuts" fetchImpl={fetchImpl} />);
  return { pending, fetchImpl, view };
}

const modes = () => screen.getByRole("combobox", { name: "작업 모드" });
const selectMode = (mode: string) => fireEvent.change(modes(), { target: { value: mode } });
const selectCuts = () => selectMode("script-to-cuts");
const selectDialogue = () => selectMode("dialogue-polish");
const edit = (draft: string) => fireEvent.change(screen.getByRole("textbox"), { target: { value: draft } });
const run = () => fireEvent.click(screen.getByTestId("free-ai-workbench-run-btn"));
const result = () => screen.getByTestId("studio-free-ai-workbench-result");
const finish = async (job: PendingRequest) => {
  await act(async () => job.finish(new Response(null, { status: 503 })));
};

afterEach(cleanup);

it("두 원고를 따로 실행하고 늦게 끝난 다른 모드의 결과가 현재 화면이나 복사 내용을 덮지 않는다", async () => {
  const { pending } = setup();
  const manuscript = "1컷: 푸른 우체통이 열린다.\n2컷: 달이 보인다.";
  const dialogue = "내일 노란 등대 앞에서 만나자.";
  edit(manuscript);
  selectDialogue();
  edit(dialogue);
  selectCuts();
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(manuscript);
  expect(pending).toHaveLength(0);
  expect(screen.queryByText(/다른 모드 \d+개 분석 중/u)).toBeNull();

  run();
  expect(within(modes()).getByRole("option", { name: /대본 → 컷 분할 · 분석 중/u })).toBeTruthy();
  expect(screen.queryByText(/다른 모드 \d+개 분석 중/u)).toBeNull();
  selectDialogue();
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(dialogue);
  expect(screen.getByText("다른 모드 1개 분석 중").getAttribute("aria-live")).toBe("polite");
  run();
  selectMode("character-bible-forge");
  expect(screen.getByText("다른 모드 2개 분석 중")).toBeTruthy();
  selectDialogue();
  expect(screen.getByText("다른 모드 1개 분석 중")).toBeTruthy();
  expect(pending.map(({ mode, inputText }) => [mode, inputText])).toEqual([
    ["script-to-cuts", manuscript], ["dialogue-polish", dialogue],
  ]);
  await finish(pending[1]);
  expect(result().textContent).toContain("노란 등대");
  expect(screen.getByText("다른 모드 1개 분석 중")).toBeTruthy();
  await finish(pending[0]);
  expect(screen.queryByText(/다른 모드 \d+개 분석 중/u)).toBeNull();
  expect(result().textContent).toContain("노란 등대");
  expect(result().textContent).not.toContain("푸른 우체통");

  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  try {
    selectCuts();
    expect(result().textContent).toContain("푸른 우체통");
    await act(async () => fireEvent.click(within(result()).getByRole("button", { name: "결과 복사" })));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("푸른 우체통"));
    selectDialogue();
    expect(within(result()).getByRole("button", { name: "결과 복사" })).toBeTruthy();
    await act(async () => fireEvent.click(within(result()).getByRole("button", { name: "결과 복사" })));
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("노란 등대"));
  } finally {
    if (originalClipboard) Object.defineProperty(navigator, "clipboard", originalClipboard);
    else Reflect.deleteProperty(navigator, "clipboard");
  }
});

it("같은 모드의 연속 실행을 막고 선택한 요청만 취소하며 이전 응답이 재실행을 끝내지 않는다", async () => {
  const { pending } = setup();
  edit("1컷: 첫 번째 봉투를 연다.");
  const button = screen.getByTestId("free-ai-workbench-run-btn");
  act(() => { button.click(); button.click(); });
  expect(pending).toHaveLength(1);
  selectDialogue();
  run();
  selectCuts();
  fireEvent.click(screen.getByRole("button", { name: "요청 취소" }));
  expect(pending[0].signal.aborted).toBe(true);
  expect(pending[1].signal.aborted).toBe(false);
  expect(screen.getByRole("status").textContent).toContain("취소했어요");
  selectDialogue();
  expect(screen.queryByText(/요청을 취소했어요/)).toBeNull();
  selectCuts();
  edit("1컷: 두 번째 봉투를 연다.");
  run();
  expect(pending).toHaveLength(3);
  await finish(pending[0]);
  expect(screen.getByRole("button", { name: "요청 취소" })).toBeTruthy();
  expect(screen.queryByTestId("studio-free-ai-workbench-result")).toBeNull();
  await finish(pending[2]);
  expect(result().textContent).toContain("두 번째 봉투");
  expect(result().textContent).not.toContain("첫 번째 봉투");
  selectDialogue();
  expect(screen.getByRole("button", { name: "요청 취소" })).toBeTruthy();
  await finish(pending[1]);
});

it("빈 원고도 유지하고 작업대를 닫으면 모든 요청을 취소해 늦은 응답이 후속 조회를 만들지 않는다", async () => {
  const { pending, fetchImpl, view } = setup();
  edit("");
  selectDialogue();
  run();
  selectCuts();
  expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "예시 채우기" }));
  run();
  expect(pending).toHaveLength(2);
  view.unmount();
  expect(pending.every((request) => request.signal.aborted)).toBe(true);
  const callsAtUnmount = fetchImpl.mock.calls.length;
  for (const request of pending) await finish(request);
  expect(fetchImpl).toHaveBeenCalledTimes(callsAtUnmount);
});


it("같은 모드의 늦은 로컬 결과는 입력이 바뀌면 숨기고 정확히 되돌렸을 때만 다시 사용할 수 있다", async () => {
  const { pending } = setup();
  const manuscript = "1컷: 푸른 우체통이 열린다.\n2컷: 달이 보인다.";
  const revised = "1컷: 밤기차가 떠난다.";
  expect(within(modes()).getAllByRole("option")).toHaveLength(14);
  expect(screen.getByText("할당량과 처리 방식").closest("details")?.open).toBe(false);

  edit(manuscript);
  run();
  expect(pending[0].inputText).toBe(manuscript);
  edit(revised);
  selectDialogue();
  edit("노란 등대 앞에서 만나자.");
  run();
  await finish(pending[0]);
  expect(screen.queryByText(/입력이 바뀌었어요/u)).toBeNull();
  await finish(pending[1]);
  expect(result().textContent).toContain("노란 등대");

  selectCuts();
  expect(screen.getByRole<HTMLTextAreaElement>("textbox").value).toBe(revised);
  expect(screen.getByRole("status").textContent).toContain("입력이 바뀌었어요.");
  expect(screen.queryByTestId("studio-free-ai-workbench-result")).toBeNull();
  expect(screen.queryByRole("button", { name: "결과 복사" })).toBeNull();

  edit(manuscript);
  expect(screen.queryByText(/입력이 바뀌었어요/u)).toBeNull();
  expect(result().textContent).toContain("푸른 우체통");
  expect(within(result()).getByRole("button", { name: "결과 복사" })).toBeTruthy();
});
