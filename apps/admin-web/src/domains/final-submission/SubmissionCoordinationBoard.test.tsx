// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createWorkspaceRecord } from "@toonstudio/contracts/admin-workspace";
import { createCoordinationItem, createEmptyFinalSubmissionBoard, type BoardState, type CoordinationItem } from "@toonstudio/contracts/final-submission";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SubmissionCoordinationBoard } from "./SubmissionCoordinationBoard";
import { useCoordinationOperations } from "./use-coordination-operations";
import { useFinalSubmission } from "./use-final-submission";

vi.mock("./use-final-submission", () => ({ useFinalSubmission: vi.fn() }));
vi.mock("./use-coordination-operations", () => ({ useCoordinationOperations: vi.fn() }));

function row(id: string, title: string, extra: Partial<CoordinationItem> = {}): CoordinationItem {
  return { ...createCoordinationItem(id, title), project: "제출 조정", ...extra };
}
function activate(items: CoordinationItem[]) {
  const board: BoardState = { ...createEmptyFinalSubmissionBoard(), coordination: items, revision: 1 };
  const state = { board, revision: 1, updatedAt: "2025-06-01", history: [], loading: false, saving: false, dirty: false,
    denied: false, conflict: false, error: "", notice: "", accessVerified: true, hasPendingSave: false,
    commit: vi.fn((_board: BoardState, _message: string): string | null => null),
    importBoard: vi.fn(() => null), persist: vi.fn(async () => undefined), reload: vi.fn(async () => undefined),
    exportBoard: vi.fn(async () => structuredClone(board)) } satisfies ReturnType<typeof useFinalSubmission>;
  vi.mocked(useFinalSubmission).mockReturnValue(state);
  return state;
}

const readyOps: ReturnType<typeof useCoordinationOperations> = { phase: "ready", records: [], error: "", loading: false, reload: vi.fn(async () => undefined) };
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const board = () => <SubmissionCoordinationBoard userIdentity="test-admin" />;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useCoordinationOperations).mockReturnValue(readyOps);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("관리자 증빙 조정 화면", () => {
  it("두 원장의 경로와 검증 순서를 제공하고 차단 요인·결정·파일 검색으로 대상을 좁힌다", () => {
    activate([row("capture", "검증 캡처", { priority: 3, project: "ToonStudio", file: "preview.png" }),
      row("bundle", "최종 파일 선택", { priority: 1, blocking: true, action: "파일 교체" })]);
    render(board());
    expect(useFinalSubmission).toHaveBeenCalledWith("test-admin");
    expect(screen.getByRole("heading", { name: "제출 전 증빙 조정" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "관리자 운영 보드" }).getAttribute("href")).toBe("/admin/workspace/");
    expect(screen.getByRole("link", { name: "1R 제출 점검" }).getAttribute("href")).toBe("/admin/growth/business-plan/?view=final-submission");
    expect(screen.getByRole("link", { name: /저비용 선별 검증/u }).getAttribute("href")).toBe("#coord-steps");
    expect(screen.getAllByRole("listitem").map(node => node.querySelector("strong")?.textContent)).toEqual(["원본 항목 확인", "파일 후보 대조", "인용한 변경만 검증", "담당자 최종 확인"]);
    expect(screen.getAllByRole("article").map(card => within(card).getByRole("heading").textContent)).toEqual(["최종 파일 선택", "검증 캡처"]);
    click(/^차단 요인/u);
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "검증 캡처" })).toBeNull();
    click(/^담당자 결정/u);
    expect(screen.getByText("파일 교체 승인 대기")).toBeTruthy();
    click("전체 보기");
    fireEvent.change(screen.getByRole("searchbox", { name: "항목 검색" }), { target: { value: "PREVIEW.png" } });
    expect(screen.getByRole("article").textContent).toContain("검증 캡처");
    expect(screen.queryByRole("button", { name: "최종 파일 선택" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("운영 권한을 재확인하거나 잃으면 해당 원본 표시와 증빙 판정을 즉시 갱신한다", () => {
    const verifiedAt = new Date(Date.now() - 3600000).toISOString();
    const original = { ...createWorkspaceRecord("op-a", "coordination", "operation"), title: "권한이 필요한 원본 제목",
      factStatus: "확인" as const, sourceTitle: "검증 결과", sourceUrl: "https://example.com/ops", verifiedAt, sourceDate: verifiedAt,
      reviewer: "운영 검토 담당", verificationNote: "첨부한 증거의 화면 버전을 직접 대조함" };
    const state = activate([row("check", "운영 검증 인용", { operationId: "op-a", status: "검증 완료", latestVerified: true,
      evidenceAt: new Date().toISOString(), refs: [{ label: "대조 근거", url: "https://example.com/check" }] })]);
    vi.mocked(useCoordinationOperations).mockReturnValue({ ...readyOps, records: [original] });
    const view = render(board());
    click("운영 검증 인용");
    expect(screen.getByText(original.title)).toBeTruthy();
    expect(screen.getByText("검증 완료", { selector: ".fs-badge" })).toBeTruthy();
    vi.mocked(useCoordinationOperations).mockReturnValue({ ...readyOps, phase: "loading", loading: true });
    view.rerender(board());
    expect(screen.queryByText(original.title)).toBeNull();
    expect(screen.getByText("미확인", { selector: ".fs-badge" })).toBeTruthy();
    vi.mocked(useCoordinationOperations).mockReturnValue({ ...readyOps, phase: "unavailable", error: "열람 권한 미확인" });
    view.rerender(board());
    expect(screen.queryByText(original.title)).toBeNull();
    expect(screen.getByText("미확인", { selector: ".fs-badge" })).toBeTruthy();
    vi.mocked(useFinalSubmission).mockReturnValue({ ...state, loading: true, accessVerified: false });
    view.rerender(board());
    expect(screen.queryByRole("button", { name: "운영 검증 인용" })).toBeNull();
    expect(useCoordinationOperations).toHaveBeenLastCalledWith("test-admin", false);
    vi.mocked(useFinalSubmission).mockReturnValue({ ...state, denied: true, accessVerified: false, error: "권한 없음" });
    view.rerender(board());
    expect(screen.getByRole("alert").textContent).toContain("권한 없음");
    expect(screen.queryByRole("article")).toBeNull();
    expect(state.commit).not.toHaveBeenCalled();
  });

  it("가져오기에서 기존 항목을 보존하고 찾지 못한 원본 ID는 메모로 남긴 뒤 개인 보드에만 저장한다", async () => {
    const existing = row("existing", "보존할 기존 항목", { owner: "원래 담당자" });
    const state = activate([existing]);
    const view = render(board());
    click("어드민용 JSON 가져오기");
    const incoming = row("new", "추가할 항목", { operationId: "outdated-op", sourceTaskId: "outdated-task",
      sourceNote: "출처 대조", status: "최종 확인", latestVerified: true, evidenceAt: "2025-06-01", checkedAt: "2025-06-01" });
    const payload = JSON.stringify({ format: "toonstudio-coordination", version: 1, items: [{ ...existing, title: "덮어쓰기 시도" }, incoming] });
    const file = new File([payload], "조정.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => payload });
    fireEvent.change(screen.getByLabelText("어드민용 조정 JSON"), { target: { files: [file] } });
    expect(await screen.findByRole("heading", { name: "가져오기 미리보기" })).toBeTruthy();
    expect(screen.getByText(/추가 1건 · 기존 ID 유지 1건/u)).toBeTruthy();
    expect(state.commit).not.toHaveBeenCalled();
    click("새 항목 반영");
    expect(state.commit).toHaveBeenCalledOnce();
    const committed = state.commit.mock.calls[0]![0];
    expect(committed).toEqual({ ...state.board, coordination: [existing, { ...incoming, operationId: "", sourceTaskId: "",
      sourceNote: "출처 대조\n현재 원장 연결 미확인 · 제출 원본 outdated-task, 운영 원본 outdated-op", status: "미확인", latestVerified: false, evidenceAt: "", checkedAt: "" }] });
    expect(state.importBoard).not.toHaveBeenCalled();
    expect(state.persist).not.toHaveBeenCalled();
    vi.mocked(useFinalSubmission).mockReturnValue({ ...state, board: committed, dirty: true });
    view.rerender(board());
    click("서버에 저장");
    expect(state.persist).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});
