// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createEmptyBusinessPlanState } from "@toonstudio/contracts/business-plan";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../platform/http/admin-api";

import { loadBusinessPlan, saveBusinessPlan } from "./business-plan-api";
import { BusinessPlanBoard } from "./BusinessPlanBoard";

import type { BusinessPlanRecord, BusinessPlanState } from "@toonstudio/contracts/business-plan";

vi.mock("./business-plan-api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./business-plan-api")>();
  return { ...original, loadBusinessPlan: vi.fn(), saveBusinessPlan: vi.fn() };
});

const load = vi.mocked(loadBusinessPlan); const save = vi.mocked(saveBusinessPlan);
const record = (board: BusinessPlanState | null, revision = board ? 1 : 0): BusinessPlanRecord => ({ board, revision, updatedAt: board ? new Date().toISOString() : null });

async function show(board: BusinessPlanState | null = null) {
  load.mockResolvedValue(record(board));
  const rendered = render(<BusinessPlanBoard userIdentity="admin-ui-test" />);
  await screen.findByRole("button", { name: "작업 추가" });
  return rendered;
}

function change(label: string | RegExp, value: string) {
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } });
}

function editFirstTask(note: string) {
  fireEvent.click(screen.getByRole("button", { name: "문제 인식 작업 편집" }));
  change("작업 메모", note);
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "보드에 반영" }));
}

function currentBoard(): BusinessPlanState {
  fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
  const board = JSON.parse((screen.getByLabelText("사업계획서 보드 JSON") as HTMLTextAreaElement).value) as BusinessPlanState;
  fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
  return board;
}

beforeEach(() => {
  load.mockReset(); save.mockReset();
  save.mockImplementation(async (request) => record(request.board, request.expectedRevision + 1));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const NativeUrl = URL;
  vi.stubGlobal("URL", class extends NativeUrl { static createObjectURL = vi.fn(() => "blob:business-plan-test"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("사업계획서 관리자 화면·서버 저장", () => {
  it("인증 식별자 없이는 서버에 접근하거나 빈 보드를 만들지 않는다", () => {
    render(<BusinessPlanBoard userIdentity="" />);
    expect(screen.getByRole("alert").textContent).toMatch(/관리자 인증/u);
    expect(load).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });

  it("서버가 비어 있을 때만 일반 11개 작업과 6개 상태를 만들고 미저장으로 표시한다", async () => {
    await show();
    expect(screen.getByText("서버 미저장 변경 있음")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "문제 인식 진행 상태" }).children).toHaveLength(6);
    expect(currentBoard().tasks).toHaveLength(11);
    expect(currentBoard().claims.every((claim) => claim.factStatus === "미확인" && claim.value === "")).toBe(true);
    expect(currentBoard().documents.every((document) => document.workingText === "")).toBe(true);
    expect(currentBoard().mentor).toEqual([]); expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "칸반" }));
    expect(screen.getAllByRole("region", { name: /^(초안|검토 필요|근거 확인 중|보완 완료|승인 대기|최종 확인) 작업$/u })).toHaveLength(6);
  });

  it("담당·근거·다음 조치·메모 편집은 먼저 초안에 반영하고 명시적으로 서버 저장한다", async () => {
    await show();
    fireEvent.click(screen.getByRole("button", { name: "문제 인식 작업 편집" }));
    change("작업 상태", "근거 확인 중"); change("담당자", "검토 담당"); change("담당 작업", "인터뷰 근거 대조"); change("다음 조치", "원문 확인"); change("근거 링크", "https://example.com/evidence"); change("원문 출처 제목", "공개 연구 원문"); change("원문 출처 링크", "https://example.com/report"); change("작업 메모", "후속 조사 필요");
    fireEvent.click(screen.getByRole("button", { name: "보드에 반영" }));
    expect(save).not.toHaveBeenCalled(); expect(screen.getByText(/검토 담당 · 원문 확인/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    await screen.findByText("사업계획서 기록을 서버에 저장했습니다.");
    expect(save.mock.calls[0][0].board.tasks[0]).toMatchObject({ status: "근거 확인 중", owner: "검토 담당", assignment: "인터뷰 근거 대조", nextAction: "원문 확인", sourceUrl: "https://example.com/report", notes: "후속 조사 필요" });
    expect(screen.getByText("서버 저장본과 동일")).toBeTruthy();
  });

  it("GET 실패 시 기존 자료를 추측하지 않고 재시도로만 서버 기준 버전을 얻는다", async () => {
    load.mockRejectedValueOnce(new Error("연결 오류"));
    render(<BusinessPlanBoard userIdentity="admin-ui-test" />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "작업 추가" })).toBeNull();
    expect(screen.getAllByText(/서버 버전 미확인/u).length).toBeGreaterThan(0);
    expect((screen.getByRole("button", { name: "서버에 저장" }) as HTMLButtonElement).disabled).toBe(true);
    load.mockResolvedValueOnce(record(createEmptyBusinessPlanState(), 4));
    fireEvent.click(screen.getByRole("button", { name: "서버 기록 다시 읽기" }));
    await screen.findByRole("button", { name: "작업 추가" });
    expect(screen.getByText(/서버 버전 4/u)).toBeTruthy(); expect(save).not.toHaveBeenCalled();
  });

  it("저장 실패를 명시하고 동일 mutationId·본문으로 재시도한 뒤 추가 편집을 별도 저장한다", async () => {
    await show(); editFirstTask("첫 저장 대상"); save.mockRejectedValueOnce(new Error("서버 연결 끊김"));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/서버에 저장하지 못했습니다/u);
    expect(currentBoard().tasks[0].notes).toBe("첫 저장 대상");
    editFirstTask("재시도 전 추가 편집");
    fireEvent.click(screen.getByRole("button", { name: "실패한 저장 다시 시도" }));
    await screen.findByText(/이후 추가한 편집 내용은 다시 저장하세요/u);
    expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
    expect(currentBoard().tasks[0].notes).toBe("재시도 전 추가 편집");
    expect(screen.getByText("서버 미저장 변경 있음")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    await screen.findByText("사업계획서 기록을 서버에 저장했습니다.");
    expect(save.mock.calls[2][0].expectedRevision).toBe(1);
    expect(save.mock.calls[2][0].mutationId).not.toBe(save.mock.calls[0][0].mutationId);
    expect(save.mock.calls[2][0].board.tasks[0].notes).toBe("재시도 전 추가 편집");
  });

  it("409 충돌에서는 덮어쓰기를 잠그고 초안을 보존하며 확인 후 최신본을 읽는다", async () => {
    await show(createEmptyBusinessPlanState()); editFirstTask("현재 창의 미저장 메모"); save.mockRejectedValueOnce(new AdminApiError(409, "충돌"));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" })); await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/덮어쓰기를 중단/u);
    expect((screen.getByRole("button", { name: "서버에 저장" }) as HTMLButtonElement).disabled).toBe(true);
    expect(currentBoard().tasks[0].notes).toBe("현재 창의 미저장 메모");
    const newest = createEmptyBusinessPlanState(); newest.tasks[0].notes = "다른 창의 저장 메모";
    load.mockResolvedValueOnce(record(newest, 2));
    fireEvent.click(screen.getByRole("button", { name: "서버 기록 다시 읽기" }));
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "미저장 변경을 버리고 최신본 읽기" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(currentBoard().tasks[0].notes).toBe("다른 창의 저장 메모");
  });

  it("최신본 GET 중에는 기존 초안을 유지하면서 새 편집·JSON 가져오기를 막고 완료 후 재개한다", async () => {
    const initial = createEmptyBusinessPlanState(); initial.tasks[0].nextAction = "기존 후속 조치";
    await show(initial); editFirstTask("GET 응답 전까지 보존할 초안");
    const editorButton = screen.getByRole("button", { name: "문제 인식 작업 편집" });
    const jsonButton = screen.getByRole("button", { name: "JSON 관리" });
    let finish: ((value: BusinessPlanRecord) => void) | undefined;
    load.mockImplementationOnce(() => new Promise<BusinessPlanRecord>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "서버 기록 다시 읽기" }));
    fireEvent.click(screen.getByRole("button", { name: "미저장 변경을 버리고 최신본 읽기" }));
    expect(screen.getByText(/현재 기록은 유지됩니다/u)).toBeTruthy();
    expect(screen.getByText(/기존 후속 조치/u)).toBeTruthy();
    fireEvent.click(editorButton);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(jsonButton);
    expect(screen.queryByRole("dialog")).toBeNull();
    const latest = createEmptyBusinessPlanState(); latest.tasks[0].notes = "재확인한 최신 기록";
    await act(async () => { finish?.(record(latest, 2)); });
    expect(screen.queryByText(/서버 최신 기록을 불러오는 동안/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "문제 인식 작업 편집" }));
    expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).value).toBe("재확인한 최신 기록");
    change("작업 메모", "최신본 위에 반영할 변경");
    fireEvent.click(screen.getByRole("button", { name: "보드에 반영" }));
    expect(currentBoard().tasks[0].notes).toBe("최신본 위에 반영할 변경");
    expect(save).not.toHaveBeenCalled();
  });

  it("POST 저장을 기다리는 동안 추가 편집을 허용하고 그 변경을 미저장으로 보존한다", async () => {
    await show(createEmptyBusinessPlanState()); editFirstTask("먼저 보낸 저장 내용");
    let finish: ((value: BusinessPlanRecord) => void) | undefined;
    save.mockImplementationOnce(() => new Promise<BusinessPlanRecord>((resolve) => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    expect(screen.getByRole("button", { name: "서버 저장 중…" })).toBeTruthy();
    editFirstTask("POST 진행 중 추가한 내용");
    const sent = save.mock.calls[0][0];
    expect(sent.board.tasks[0].notes).toBe("먼저 보낸 저장 내용");
    await act(async () => { finish?.(record(sent.board, sent.expectedRevision + 1)); });
    expect(screen.getByText(/이후 추가한 편집 내용은 다시 저장하세요/u)).toBeTruthy();
    expect(screen.getByText("서버 미저장 변경 있음")).toBeTruthy();
    expect(currentBoard().tasks[0].notes).toBe("POST 진행 중 추가한 내용");
  });

  it.each([401, 403])("저장 %i 응답 후 실제 기록과 대화상자를 즉시 숨기고 전용 권한 이벤트를 보낸다", async (status) => {
    const denied = vi.fn(); window.addEventListener("toonstudio:business-plan-access-denied", denied);
    await show(); editFirstTask("비공개 작업 기록"); save.mockRejectedValueOnce(new AdminApiError(status, "권한 거부"));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    await waitFor(() => expect(denied).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "작업 추가" })).toBeNull();
    expect(screen.queryByRole("button", { name: "JSON 관리" })).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/기록을 숨겼습니다/u);
    window.removeEventListener("toonstudio:business-plan-access-denied", denied);
  });

  it("GET 권한 거부와 오래된 계정의 늦은 응답을 화면에 반영하지 않는다", async () => {
    let finish: ((value: BusinessPlanRecord) => void) | undefined;
    load.mockImplementationOnce(() => new Promise<BusinessPlanRecord>((resolve) => { finish = resolve; })).mockRejectedValueOnce(new AdminApiError(403, "권한 없음"));
    const rendered = render(<BusinessPlanBoard userIdentity="first-test-admin" />);
    rendered.rerender(<BusinessPlanBoard userIdentity="next-test-admin" />);
    await screen.findByRole("alert");
    const previous = createEmptyBusinessPlanState(); previous.tasks[0].title = "이전 계정 전용 기록";
    await act(async () => { finish?.(record(previous)); });
    expect(screen.queryByText("이전 계정 전용 기록")).toBeNull();
    expect(screen.queryByRole("button", { name: "작업 추가" })).toBeNull();
  });

  it("모달 포커스를 가두고 미반영 입력의 닫기를 확인하며 원래 버튼으로 돌아온다", async () => {
    await show(); const opener = screen.getByRole("button", { name: "문제 인식 작업 편집" }); opener.focus(); fireEvent.click(opener);
    const close = screen.getByRole("button", { name: "대화상자 닫기" }); expect(document.activeElement).toBe(close);
    const submit = screen.getByRole("button", { name: "보드에 반영" }); submit.focus(); fireEvent.keyDown(document, { key: "Tab" }); expect(document.activeElement).toBe(close);
    change("작업 메모", "입력 중인 메모"); fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy(); fireEvent.click(screen.getByRole("button", { name: "계속 작성" }));
    expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).value).toBe("입력 중인 메모");
    fireEvent.keyDown(document, { key: "Escape" }); fireEvent.click(screen.getByRole("button", { name: "입력을 버리고 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(opener);
  });
});
