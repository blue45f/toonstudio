// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQualityBoard, exportQualityBoardJson } from "./ci-quality-model";
import { getQualityStorageKey, loadQualityBoard } from "./ci-quality-storage";
import { CiQualityBoard } from "./CiQualityBoard";
import { CiQualityJsonDialog } from "./CiQualityDialogs";
import { qualityLocalTime } from "./quality-ui";

import type { QualityBoard } from "./ci-quality-model";

const user = "ci-quality-ui-test";

function show(board?: QualityBoard) {
  if (board) localStorage.setItem(getQualityStorageKey(user), exportQualityBoardJson(board));
  return render(<CiQualityBoard userIdentity={user} />);
}

function change(label: string | RegExp, value: string) {
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } });
}

function openCheck(name = "Vitest") {
  fireEvent.click(screen.getByRole("button", { name: `${name} 결과 기록` }));
}

function fillEvidence() {
  change("근거 커밋 SHA (40자리)", createQualityBoard().commit.sha);
  change(/^실행 시각/u, qualityLocalTime(new Date().toISOString()));
  change("근거 범위", "product shard");
  change("로그 URL", "https://github.com/blue45f/toonstudio/actions/runs/1");
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("CI·QA 관리자 보드", () => {
  it("실제 결과 없이 12개 검사와 core·verify를 미확인으로 시작한다", () => {
    show();
    expect(screen.getByRole("heading", { name: "CI·QA 검증" })).toBeTruthy();
    expect(screen.getAllByRole("row")).toHaveLength(13);
    expect(screen.getByText(/core · 미확인 \/ verify · 미확인/u)).toBeTruthy();
    expect(screen.getByText("유효한 완료 근거 0개")).toBeTruthy();
    expect(screen.getByText(/자동 CI 연결 없음/u)).toBeTruthy();
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
  });

  it("인증 식별자 없이 기록을 읽거나 편집하지 않는다", () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    render(<CiQualityBoard userIdentity="" />);
    expect(screen.getByRole("alert").textContent).toMatch(/관리자 인증/u);
    expect(screen.queryByRole("button", { name: "결과 기록" })).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });

  it("검색·분류·상태 필터와 칸반의 5상태 보기를 제공한다", () => {
    show();
    fireEvent.change(screen.getByLabelText("검사 검색"), { target: { value: "Vitest" } });
    expect(screen.getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("상태 필터"), { target: { value: "failed" } });
    expect(screen.getByText("일치하는 검사가 없습니다")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "전용 게이트" }));
    expect(screen.getAllByRole("row")).toHaveLength(6);
    fireEvent.click(screen.getByRole("button", { name: "보드" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("region", { name: /검사$/u })).toHaveLength(5);
  });

  it("실행 근거·통계·CI JSON과 실패 분석을 함께 저장하고 다시 연다", () => {
    const rendered = show();
    openCheck();
    change("진행 상태", "failed");
    fillEvidence();
    for (const [label, value] of [["통과", "9"], ["실패", "1"], ["건너뜀", "0"], ["전체", "10"]]) change(label, value);
    fireEvent.click(screen.getByRole("button", { name: "실패 분석" }));
    change("실패 분류", "regression");
    change("관련 변경", "예산 기준 변경");
    change("이전 정상 상태 · SHA · 실행 시각", "이전 정상 실행 2026-11-11");
    change("이전 정상 상태와의 차이", "기대값 불일치");
    change("원인 · 근거 (추정인 경우 표시)", "추정: 오래된 fixture");
    change("권장 조치", "수정안 검토 후 승인 요청");
    fireEvent.click(screen.getByRole("button", { name: "CI 요약 JSON" }));
    change("CI 결과 요약 JSON", '{"workflow":"CI","conclusion":"failure"}');
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    const saved = loadQualityBoard(user).board;
    expect(saved?.checks[0].stats.total).toBe(10);
    expect(saved?.checks[0].failure.classification).toBe("regression");
    expect(saved?.checks[0].ciJson?.conclusion).toBe("failure");
    fireEvent.click(screen.getByRole("button", { name: "실패 분석 1" }));
    expect(screen.getByText("예산 기준 변경")).toBeTruthy();
    expect(screen.getByText("이전 정상 실행 2026-11-11")).toBeTruthy();
    expect(screen.getByRole("link", { name: "실행 로그 열기 ↗" }).getAttribute("href")).toMatch(/^https:/u);
    rendered.unmount();
    show();
    openCheck();
    expect((screen.getByLabelText("근거 범위") as HTMLInputElement).value).toBe("product shard");
  });

  it("통계 불일치와 잘못된 JSON을 저장하지 않고 초안을 보존한다", () => {
    show();
    openCheck();
    change("통과", "2"); change("실패", "1"); change("건너뜀", "0"); change("전체", "2");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/합계/u);
    expect((screen.getByLabelText("통과") as HTMLInputElement).value).toBe("2");
    change("전체", "3");
    fireEvent.click(screen.getByRole("button", { name: "CI 요약 JSON" }));
    change("CI 결과 요약 JSON", "{bad");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
  });

  it("숨겨진 구역의 잘못된 로그 URL도 저장 오류로 알린다", () => {
    show(); openCheck();
    change("로그 URL", "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: "CI 요약 JSON" }));
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/http\(s\) URL/u);
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
  });

  it("완료라도 stale인 근거를 유효 완료에서 제외하고 설정을 갱신한다", () => {
    const board = createQualityBoard();
    Object.assign(board.checks[0], { status: "done", sha: "a".repeat(40), executedAt: new Date().toISOString(), scope: "product shard", logUrl: "https://example.com/log" });
    show(board);
    expect(screen.getByText("stale · SHA 불일치")).toBeTruthy();
    expect(screen.getByText("유효한 완료 근거 0개")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "기준 커밋·최신성" }));
    change("TTL (시간)", "48");
    fireEvent.click(screen.getByRole("button", { name: "기준 저장" }));
    expect(screen.getByText(/TTL 48h/u)).toBeTruthy();
    expect(loadQualityBoard(user).board?.commit.observedAt).toBe(board.commit.observedAt);
  });

  it("최신성 시계가 갱신되어도 미저장 입력을 초기화하지 않는다", () => {
    vi.useFakeTimers();
    show(); openCheck();
    change("검증 요약", "저장하지 않은 입력");
    act(() => vi.advanceTimersByTime(120_000));
    expect((screen.getByLabelText("검증 요약") as HTMLInputElement).value).toBe("저장하지 않은 입력");
  });

  it("JSON 가져오기를 검토한 뒤에만 전체 기록을 대체한다", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
    const replacement = createQualityBoard(); replacement.checks[0].status = "progress";
    change("보드 JSON", JSON.stringify(replacement));
    fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    expect(screen.getByText("가져오기 검토 완료")).toBeTruthy();
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "전체 대체 확인" }));
    expect(loadQualityBoard(user).board?.checks[0].status).toBe("progress");
    expect(loadQualityBoard(user).board?.history[0].text).toMatch(/전체 기록 대체/u);
  });

  it("Testifly 활성화와 작업 실행 상태를 담은 가져오기를 차단한다", () => {
    show(); fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
    const data = JSON.parse(JSON.stringify(createQualityBoard())) as { qa: { integration: string }; approvals: { status: string }[] };
    data.qa.integration = "active";
    change("보드 JSON", JSON.stringify(data)); fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/reference-only/u);
    data.qa.integration = "reference-only"; data.approvals[0].status = "done";
    change("보드 JSON", JSON.stringify(data)); fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/승인 대기/u);
    expect(screen.queryByRole("button", { name: "전체 대체 확인" })).toBeNull();
  });

  it("외부 QA 결과를 편집해도 Testifly 후보와 정본 통계 분리를 유지한다", () => {
    show(); fireEvent.click(screen.getByRole("button", { name: "외부 QA 카탈로그" }));
    fireEvent.click(screen.getByRole("button", { name: "참고 결과 기록" }));
    change("참고 결과 제목", "외부 브라우저 결과"); change("참고 결과 상태", "done");
    change(/^참고 결과 실행 시각/u, qualityLocalTime(new Date().toISOString()));
    change("참고 결과 요약", "수동 참고 자료"); fireEvent.click(screen.getByRole("button", { name: "참고 결과 저장" }));
    expect(screen.getByText("reference-only · 연결 전 후보")).toBeTruthy();
    expect(screen.getByText("수동 참고 자료")).toBeTruthy();
    const saved = loadQualityBoard(user).board;
    expect(saved?.checks.every((check) => check.status === "unknown")).toBe(true);
    expect(saved?.qa.results[0].status).toBe("done");
    fireEvent.click(screen.getByRole("button", { name: "외부 브라우저 결과 참고 결과 편집" }));
    change("참고 결과 요약", "추가 근거 기록"); fireEvent.click(screen.getByRole("button", { name: "참고 결과 저장" }));
    expect(loadQualityBoard(user).board?.qa.results).toHaveLength(1);
    expect(screen.getByText("추가 근거 기록")).toBeTruthy();
  });

  it("전용 게이트를 추가하고 승인 대기 메모만 저장한다", () => {
    show(); fireEvent.click(screen.getByRole("button", { name: "전용 게이트 추가" }));
    change("게이트 이름", "배포 전 스모크"); change("참조 명령", "참조용 명령");
    fireEvent.click(screen.getByRole("button", { name: "게이트 추가" }));
    expect(screen.getByRole("button", { name: "배포 전 스모크 결과 기록" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "승인 대기 3" }));
    fireEvent.change(screen.getByLabelText("코드 수정 검토 메모"), { target: { value: "실패 원인에 대한 수정안 검토" } });
    fireEvent.click(screen.getByRole("button", { name: "코드 수정 메모 저장" }));
    expect(loadQualityBoard(user).board?.approvals[0].note).toBe("실패 원인에 대한 수정안 검토");
    expect(loadQualityBoard(user).board?.approvals.every((approval) => approval.status === "approval")).toBe(true);
    expect(screen.getAllByText("실행 기능 없음", { exact: false })).toHaveLength(3);
  });

  it("관리자별 기록을 분리하고 잘못된 저장 데이터를 자동 초기화하지 않는다", () => {
    const board = createQualityBoard(); board.checks[0].summary = "첫 관리자 기록";
    const instance = show(board);
    instance.rerender(<CiQualityBoard userIdentity="another-admin" />);
    openCheck(); expect((screen.getByLabelText("검증 요약") as HTMLInputElement).value).toBe("");
    instance.unmount();
    localStorage.setItem(getQualityStorageKey(user), "{broken");
    show();
    expect(screen.getByRole("alert").textContent).toMatch(/자동으로 덮어쓰지/u);
    expect(screen.queryByRole("button", { name: "Vitest 결과 기록" })).toBeNull();
    expect(localStorage.getItem(getQualityStorageKey(user))).toBe("{broken");
    fireEvent.click(screen.getByRole("button", { name: "복구 JSON 관리" }));
    change("보드 JSON", exportQualityBoardJson(createQualityBoard()));
    fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 대체 확인" }));
    expect(screen.getByRole("button", { name: "Vitest 결과 기록" })).toBeTruthy();
  });

  it("저장 용량 오류를 명시하고 입력한 기록을 메모리에 유지한다", () => {
    show();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    openCheck(); change("진행 상태", "progress"); change("검증 요약", "용량 초과 시 보존할 입력");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(screen.getByRole("alert").textContent).toMatch(/저장하지 못했습니다/u);
    expect(screen.getByText("저장되지 않은 기록 있음 · JSON 백업 필요")).toBeTruthy();
    openCheck(); expect((screen.getByLabelText("검증 요약") as HTMLInputElement).value).toBe("용량 초과 시 보존할 입력");
  });

  it("큰 기존 자료도 JSON 관리 화면을 중단하지 않고 용량 오류를 알린다", () => {
    const board = createQualityBoard();
    for (const check of board.checks.slice(0, 11)) check.ciJson = { payload: "x".repeat(190_000) };
    render(<CiQualityJsonDialog board={board} onImport={() => null} onClose={() => undefined} />);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/2MB/u);
    fireEvent.click(screen.getByRole("button", { name: "현재 기록 다시 불러오기" }));
    expect(screen.getByRole("alert").textContent).toMatch(/2MB/u);
  });

  it("전체 내보내기 한도를 넘는 결과를 반영하지 않고 이전 기록을 보존한다", () => {
    const board = createQualityBoard();
    for (const check of board.checks.slice(0, 10)) check.ciJson = { payload: "x".repeat(190_000) };
    show(board);
    openCheck("CI · core");
    fireEvent.click(screen.getByRole("button", { name: "CI 요약 JSON" }));
    change("CI 결과 요약 JSON", JSON.stringify({ payload: "x".repeat(190_000) }));
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/2MB/u);
    expect(loadQualityBoard(user).board?.checks[10].ciJson).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).toBeNull();
  });

  it("가져오기 원문이 한도 내여도 최종 내보내기가 초과하면 전체 대체를 거부한다", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "JSON 관리" }));
    const candidate = createQualityBoard();
    candidate.checks[0].status = "progress";
    for (const check of candidate.checks.slice(0, 11)) check.ciJson = { payload: "" };
    const baseLength = new TextEncoder().encode(JSON.stringify(candidate)).byteLength;
    const payloadSize = Math.floor((2_000_000 - 128 - baseLength) / 11);
    for (const check of candidate.checks.slice(0, 11)) check.ciJson = { payload: "x".repeat(payloadSize) };
    const raw = JSON.stringify(candidate);
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThan(2_000_000);
    change("보드 JSON", raw);
    fireEvent.click(screen.getByRole("button", { name: "가져오기 검토" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 대체 확인" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert").textContent).toMatch(/2MB/u);
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "대화상자 닫기" }));
    openCheck();
    expect((screen.getByLabelText("진행 상태") as HTMLSelectElement).value).toBe("unknown");
  });

  it("승인 메모 저장 실패를 성공으로 표시하지 않고 메모리를 보존한다", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "승인 대기 3" }));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("quota", "QuotaExceededError"); });
    fireEvent.change(screen.getByLabelText("코드 수정 검토 메모"), { target: { value: "저장 실패한 승인 메모" } });
    fireEvent.click(screen.getByRole("button", { name: "코드 수정 메모 저장" }));
    expect(screen.getByRole("alert").textContent).toMatch(/저장하지 못했습니다/u);
    expect(screen.getByRole("status").textContent).toMatch(/현재 화면에 남아/u);
    expect(screen.getByRole("status").textContent).not.toMatch(/저장했습니다/u);
    expect(screen.queryByText("메모와 저장본 동일")).toBeNull();
    expect((screen.getByLabelText("코드 수정 검토 메모") as HTMLTextAreaElement).value).toBe("저장 실패한 승인 메모");
    expect(screen.getByText("저장되지 않은 기록 있음 · JSON 백업 필요")).toBeTruthy();
    expect(localStorage.getItem(getQualityStorageKey(user))).toBeNull();
  });

  it("다른 필드만 편집하면 검증과 외부 QA 실행 시각의 초·밀리초를 보존한다", () => {
    const board = createQualityBoard();
    const date = new Date(Date.now() - 3_600_000);
    date.setUTCSeconds(37, 123);
    const executedAt = date.toISOString();
    board.checks[0].executedAt = executedAt;
    board.qa.results = [{ id: "qa-precise-time", title: "정밀 실행 시각", status: "unknown", sha: "", executedAt, url: "", summary: "" }];
    show(board); openCheck();
    change("검증 요약", "요약만 변경");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    expect(loadQualityBoard(user).board?.checks[0].executedAt).toBe(executedAt);
    fireEvent.click(screen.getByRole("button", { name: "외부 QA 카탈로그" }));
    fireEvent.click(screen.getByRole("button", { name: "정밀 실행 시각 참고 결과 편집" }));
    change("참고 결과 요약", "참고 요약만 변경");
    fireEvent.click(screen.getByRole("button", { name: "참고 결과 저장" }));
    expect(loadQualityBoard(user).board?.qa.results[0].executedAt).toBe(executedAt);
  });

  it("대화상자의 포커스를 가두고 Escape 후 원래 버튼으로 복귀한다", () => {
    show(); const opener = screen.getByRole("button", { name: "Vitest 결과 기록" });
    opener.focus(); fireEvent.click(opener);
    const close = screen.getByRole("button", { name: "대화상자 닫기" });
    expect(document.activeElement).toBe(close);
    const save = screen.getByRole("button", { name: "기록 저장" }); save.focus();
    fireEvent.keyDown(document, { key: "Tab" }); expect(document.activeElement).toBe(close);
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
