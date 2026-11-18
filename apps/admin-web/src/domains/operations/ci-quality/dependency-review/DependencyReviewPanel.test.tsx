// @vitest-environment jsdom
import { webcrypto } from "node:crypto";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getQualityStorageKey } from "../ci-quality-storage";
import { CiQualityBoard } from "../CiQualityBoard";

import { exportDependencyReviewBoard, updateDependencyRecord } from "./dependency-review-model";
import { createDependencyReviewBoard } from "./dependency-review-seed";
import { getDependencyReviewStorageKey, loadDependencyReviewBoard, saveDependencyReviewBoard } from "./dependency-review-storage";
import { DependencyReviewPanel } from "./DependencyReviewPanel";

import type { DependencyReviewBoard, ReviewRecord } from "./dependency-review-types";

const user = "dependency-review-ui";
const now = Date.parse("2026-11-18T06:00:00Z");

function record(board: DependencyReviewBoard, id: string): ReviewRecord {
  const found = board.records.find(item => item.id === id);
  if (!found) throw new Error(`기록을 찾지 못했습니다: ${id}`);
  return found;
}

function stored(): DependencyReviewBoard {
  const result = loadDependencyReviewBoard(user);
  if (!result.board) throw new Error(result.error || "저장본을 읽지 못했습니다.");
  return result.board;
}

function show(board?: DependencyReviewBoard) {
  if (board) localStorage.setItem(getDependencyReviewStorageKey(user), exportDependencyReviewBoard(board));
  return render(<DependencyReviewPanel userIdentity={user} />);
}

function openRecord(id = "build") {
  const title = record(createDependencyReviewBoard(), id).title;
  fireEvent.click(screen.getByRole("button", { name: `${title} 기록 열기` }));
}

function change(label: string, value: string) {
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } });
}

function incoming(notes = "가져온 검토 메모") {
  const board = createDependencyReviewBoard();
  Object.assign(record(board, "build"), {
    status: "검증 완료", result: "통과", notes,
    evidence: `${board.snapshot.sha}에 대한 원본 완료 주장`, verifiedAt: "2026-11-18T04:30:00Z",
    verificationSha: board.snapshot.sha, recordedResult: "통과",
  });
  return exportDependencyReviewBoard(board);
}

async function prepareImport(json: string) {
  fireEvent.click(screen.getByRole("button", { name: "의존성 JSON 관리" }));
  change("가져올 의존성 JSON", json);
  fireEvent.click(screen.getByRole("button", { name: "변환 검토" }));
  await screen.findByRole("heading", { name: "변환 검토 결과" });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubGlobal("crypto", webcrypto);
  localStorage.clear();
});

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("관리자 의존성·회귀 검토 UI", () => {
  it("인증 전 저장소를 열지 않고 원인 두 개·검사 다섯 개·승인 네 개를 분리한다", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const denied = render(<DependencyReviewPanel userIdentity="" />);
    expect(screen.getByRole("alert").textContent).toMatch(/관리자 인증/u);
    expect(read).not.toHaveBeenCalled();
    denied.unmount();

    show();
    expect(screen.getAllByRole("article", { name: /원인 묶음$/u })).toHaveLength(2);
    const checks = screen.getByRole("region", { name: /관련 검사 대조/u });
    expect(within(checks).getAllByRole("row")).toHaveLength(6);
    expect(within(checks).getAllByText("미확인").length).toBeGreaterThanOrEqual(5);
    const approvals = screen.getByRole("region", { name: /실행 승인 대기/u });
    expect(within(approvals).getAllByRole("button", { name: /기록 열기$/u })).toHaveLength(4);
    expect(screen.getByText("완료 보관함 · Studio exhaustive #2789")).toBeTruthy();
    expect(localStorage.getItem(getDependencyReviewStorageKey(user))).toBeNull();
  });

  it("원인·검색·6상태 필터와 칸반을 제공하며 완료 보관함을 현재 작업에 넣지 않는다", () => {
    show();
    fireEvent.change(screen.getByLabelText("원인별 보기"), { target: { value: "deepmerge" } });
    expect(screen.getAllByRole("article", { name: /원인 묶음$/u })).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: /관련 검사 대조/u })).getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("의존성 작업 검색"), { target: { value: "일치하지 않는 작업" } });
    expect(screen.getByText("일치하는 작업이 없습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "작업 필터 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "6단계 보드" }));
    expect(screen.getAllByRole("region", { name: / 작업$/u })).toHaveLength(6);
    const kanban = screen.getByLabelText("6단계 의존성 작업 보드");
    expect(within(kanban).getAllByRole("button", { name: /기록 열기$/u })).toHaveLength(7);
    expect(within(kanban).queryByText(/#2789/u)).toBeNull();
    fireEvent.change(screen.getByLabelText("작업 상태 필터"), { target: { value: "미확인" } });
    expect(within(kanban).getAllByRole("button", { name: /기록 열기$/u })).toHaveLength(5);
  });

  it("상세 필드와 수동 결과를 저장하되 원본 결과는 보존하고 패치는 복사만 한다", async () => {
    show();
    const previous = record(createDependencyReviewBoard(), "build");
    openRecord();
    change("메모", "현재 SHA의 실행 링크를 기다리는 검토 메모");
    change("수동 검사 결과 · 미확인/통과/실패/취소/미실행", "실패");
    fireEvent.click(screen.getByRole("button", { name: "검토 기록 저장" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(record(stored(), "build")).toMatchObject({ notes: "현재 SHA의 실행 링크를 기다리는 검토 메모", recordedResult: "실패", result: previous.result, snapshotSha: previous.snapshotSha, verificationSha: previous.verificationSha, status: "미확인" });

    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    openRecord("remotion");
    fireEvent.click(screen.getByRole("button", { name: "패치·검증 초안" }));
    fireEvent.click(screen.getByRole("button", { name: "패치 초안 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(record(createDependencyReviewBoard(), "remotion").patchDraft));
    expect(screen.getByText("내용을 복사했습니다. 명령은 실행하지 않았습니다.")).toBeTruthy();
  });

  it("새 증빙 없는 완료 전환을 거부하고 닫기 전에 미저장 입력 폐기를 확인한다", () => {
    show();
    openRecord();
    change("작업 관리 상태", "검증 완료");
    change("메모", "아직 확인되지 않은 완료 입력");
    fireEvent.click(screen.getByRole("button", { name: "검토 기록 저장" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/완료|근거|검증일/u);
    expect(localStorage.getItem(getDependencyReviewStorageKey(user))).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("저장하지 않은 입력이 있습니다. 닫으면 이번 입력을 버립니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "계속 편집" }));
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("아직 확인되지 않은 완료 입력");
    fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "입력을 버리고 닫기" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("가져오기를 검토한 뒤 적용하고 입력 변경으로 이전 미리보기를 무효화한다", async () => {
    show();
    const json = incoming();
    await prepareImport(json);
    expect(screen.getByText(/원본 완료 주장과 현재 검토 상태/u)).toBeTruthy();
    expect(localStorage.getItem(getDependencyReviewStorageKey(user))).toBeNull();
    change("가져올 의존성 JSON", "{바뀐 원문");
    expect(screen.queryByRole("heading", { name: "변환 검토 결과" })).toBeNull();
    expect(screen.queryByRole("button", { name: "검토한 변경 가져오기" })).toBeNull();
    change("가져올 의존성 JSON", json);
    fireEvent.click(screen.getByRole("button", { name: "변환 검토" }));
    await screen.findByRole("heading", { name: "변환 검토 결과" });
    fireEvent.click(screen.getByRole("button", { name: "검토한 변경 가져오기" }));
    expect(record(stored(), "build")).toMatchObject({ status: "검토 필요", result: "미확인", sourceStatus: "검증 완료", sourceResult: "수동 기록: 통과 / 원본: 통과", recordedResult: "미확인" });
    expect(stored().snapshot).toEqual(createDependencyReviewBoard().snapshot);
    expect(stored().dependencies).toEqual(createDependencyReviewBoard().dependencies);
    expect(JSON.parse(stored().imports[0].sourceJson)).toEqual(JSON.parse(json));
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
  });

  it("가져오기 충돌은 로컬 기록을 보존하고 명시한 체크박스의 항목만 덮어쓴다", async () => {
    const base = createDependencyReviewBoard();
    const edited = updateDependencyRecord(base, { ...record(base, "build"), notes: "로컬에서 작성한 메모" });
    show(edited);
    await prepareImport(incoming("Sites 첫 번째 메모"));
    const overwrite = screen.getByRole("checkbox", { name: "프로덕션 빌드 로컬 기록 덮어쓰기" }) as HTMLInputElement;
    expect(overwrite.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "검토한 변경 가져오기" }));
    expect(record(stored(), "build").notes).toBe("로컬에서 작성한 메모");

    await prepareImport(incoming("Sites 두 번째 메모"));
    fireEvent.click(screen.getByRole("checkbox", { name: "프로덕션 빌드 로컬 기록 덮어쓰기" }));
    fireEvent.click(screen.getByRole("button", { name: "검토한 변경 가져오기" }));
    expect(record(stored(), "build")).toMatchObject({ notes: "Sites 두 번째 메모", status: "검토 필요" });
    expect(stored().imports).toHaveLength(2);
  });

  it("저장 실패에도 메모리를 보존해 백업할 수 있고 성공으로 표시하지 않는다", () => {
    show();
    const save = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("저장 용량 초과"); });
    openRecord();
    change("메모", "저장되지 않은 메모리 초안");
    fireEvent.click(screen.getByRole("button", { name: "검토 기록 저장" }));
    expect(screen.getByRole("alert").textContent).toMatch(/저장 용량 초과/u);
    expect(screen.getByText("저장되지 않은 의존성 기록 있음 · JSON 백업 필요")).toBeTruthy();
    expect(screen.queryByText(/^이 관리자의 브라우저에 검토 기록을 저장했습니다/u)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "의존성 JSON 관리" }));
    fireEvent.click(screen.getByRole("button", { name: "백업 JSON 펼치기" }));
    const backup = JSON.parse((screen.getByLabelText("현재 의존성 백업 JSON") as HTMLTextAreaElement).value) as DependencyReviewBoard;
    expect(record(backup, "build").notes).toBe("저장되지 않은 메모리 초안");
    save.mockRestore();
  });

  it("타 탭 저장 충돌을 알리고 초안과 원격 저장본을 보존한 채 폐기 확인 후 다시 읽는다", () => {
    const base = createDependencyReviewBoard();
    show();
    openRecord();
    change("메모", "현재 탭의 초안");
    const remote = updateDependencyRecord(base, { ...record(base, "build"), notes: "다른 탭의 기록" });
    const saved = saveDependencyReviewBoard(user, remote, null);
    expect(saved.ok).toBe(true);
    fireEvent(window, new StorageEvent("storage", { key: getDependencyReviewStorageKey(user), newValue: localStorage.getItem(getDependencyReviewStorageKey(user)) }));
    fireEvent.click(screen.getByRole("button", { name: "검토 기록 저장" }));
    expect(record(stored(), "build").notes).toBe("다른 탭의 기록");
    expect((screen.getByRole("button", { name: "의존성 저장 다시 시도" }) as HTMLButtonElement).disabled).toBe(true);
    openRecord();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("현재 탭의 초안");
    fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "의존성 저장본 다시 읽기" }));
    expect(screen.getByText(/현재 화면의 기록과 저장되지 않은 변경을 버리고/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 읽기 취소" }));
    openRecord();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("현재 탭의 초안");
    fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "의존성 저장본 다시 읽기" }));
    fireEvent.click(screen.getByRole("button", { name: "현재 기록을 버리고 최신 의존성 저장본 읽기" }));
    openRecord();
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("다른 탭의 기록");
  });

  it("손상된 의존성 저장본을 초기화하지 않고 기존 CI·QA 손상과도 격리한다", async () => {
    localStorage.setItem(getDependencyReviewStorageKey(user), "{손상된 의존성 원문");
    const panel = show();
    expect(screen.getByRole("alert").textContent).toMatch(/원본은 보존/u);
    expect(localStorage.getItem(getDependencyReviewStorageKey(user))).toBe("{손상된 의존성 원문");
    panel.unmount();
    localStorage.removeItem(getDependencyReviewStorageKey(user));
    localStorage.setItem(getQualityStorageKey(user), "{손상된 기존 검사 원문");
    render(<CiQualityBoard userIdentity={user} />);
    fireEvent.click(screen.getByRole("button", { name: "의존성·회귀" }));
    await screen.findByRole("heading", { name: "의존성·회귀 검토" });
    expect(screen.getByRole("region", { name: /관련 검사 대조/u })).toBeTruthy();
    expect(localStorage.getItem(getQualityStorageKey(user))).toBe("{손상된 기존 검사 원문");
  });

  it("기존 5개 화면을 보존하고 새 탭을 떠났다가 돌아와도 작성 중인 입력을 유지한다", async () => {
    render(<CiQualityBoard userIdentity={user} />);
    expect(screen.getAllByRole("row")).toHaveLength(13);
    fireEvent.click(screen.getByRole("button", { name: "의존성·회귀" }));
    await screen.findByRole("heading", { name: "의존성·회귀 검토" });
    openRecord();
    change("메모", "탭을 바꾸어도 남는 초안");
    fireEvent.click(screen.getByRole("button", { name: "검증 보드" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(document.body.style.overflow).not.toBe("hidden");
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    document.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(false);
    const leaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "의존성·회귀" }));
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("탭을 바꾸어도 남는 초안");
  });
});
