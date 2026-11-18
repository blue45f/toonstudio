// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyNestFixture, nestBoardFixture } from "../../../../tests/nestjs-quality-fixtures";
import { AdminApiError } from "../../../platform/http/admin-api";

import { NestQualityBoard } from "./NestQualityBoard";

import type { NestBoardMutation, NestBoardView } from "@toonstudio/contracts/admin-nestjs-quality";

const requests = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./nestjs-quality-api", () => ({ loadNestBoard: requests.load, saveNestBoard: requests.save }));
let stored: NestBoardView;
const scenarioId = "nest-010";
const denied = vi.fn();

function show(role: "admin" | "operator" = "admin") {
  return render(<NestQualityBoard userIdentity="nest-admin-a" role={role} verified onUnauthorized={denied} />);
}
async function ready(): Promise<void> { await screen.findByText("서버 버전 0"); }
function openScenario(): void {
  fireEvent.click(screen.getByRole("button", { name: "검증 시나리오" }));
  const task = stored.document.tasks.find((item) => item.id === scenarioId);
  if (!task) throw new Error("합성 시나리오가 없습니다.");
  fireEvent.click(screen.getByRole("button", { name: new RegExp(task.title.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u") }));
}
function field(label: string, value: string): void {
  fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  stored = nestBoardFixture();
  vi.clearAllMocks();
  requests.load.mockImplementation(() => Promise.resolve(structuredClone(stored)));
  requests.save.mockImplementation((mutation: NestBoardMutation) => {
    stored = applyNestFixture(stored, mutation);
    return Promise.resolve(structuredClone(stored));
  });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("NestJS 서버 검증 보드", () => {
  it("서버 장애를 seed나 브라우저 저장 성공으로 대체하지 않는다", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    requests.load.mockRejectedValue(new AdminApiError(503, "검증 기록 저장소를 사용할 수 없습니다."));
    show();
    await screen.findByRole("alert");
    expect(screen.queryByRole("navigation", { name: "NestJS 보드 화면" })).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(requests.save).not.toHaveBeenCalled();
  });
  it("28항목·16시나리오·6상태와 정적 판정 및 오래된 관측 경고를 보존한다", async () => {
    show(); await ready();
    expect(screen.getByText(/자료 확인 후 24시간/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "WsAdapter 적용 판정 기록 열기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "검증 시나리오" }));
    expect(screen.getByText("16개 표시")).toBeTruthy();
    expect(screen.getAllByText("확인 결과: 미확인")).toHaveLength(stored.document.tasks.filter((task) => task.category === "검증 시나리오" && task.result === "미확인").length);
    expect(within(screen.getByLabelText("상태 필터")).getAllByRole("option")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "6상태 보드" }));
    expect(screen.getAllByRole("region", { name: / 작업$/u })).toHaveLength(6);
    expect(stored.document.tasks).toHaveLength(28);
  });
  it("상태와 실행 결과를 분리해 저장하고 서버에서 다시 읽는다", async () => {
    const first = show(); await ready(); openScenario();
    field("관리 상태", "진행 중"); field("메모 · 차단 요인", "실제 재연결 재현 준비");
    fireEvent.click(screen.getByRole("button", { name: "검증 기록 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const saved = stored.document.tasks.find((task) => task.id === scenarioId);
    expect(saved).toMatchObject({ status: "진행 중", result: "미확인", verificationDate: "", notes: "실제 재연결 재현 준비" });
    expect(stored.document.snapshot.packages).toEqual(nestBoardFixture().document.snapshot.packages);
    first.unmount(); show(); await screen.findByText("서버 버전 1"); openScenario();
    expect((screen.getByLabelText("메모 · 차단 요인") as HTMLTextAreaElement).value).toBe("실제 재연결 재현 준비");
  });
  it("근거 없는 완료를 거부하며 입력한 초안을 보존한다", async () => {
    show(); await ready(); openScenario(); field("관리 상태", "검증 완료");
    fireEvent.click(screen.getByRole("button", { name: "검증 기록 저장" }));
    await within(screen.getByRole("dialog")).findByRole("alert");
    expect(requests.save).not.toHaveBeenCalled();
    expect((screen.getByLabelText("관리 상태") as HTMLSelectElement).value).toBe("검증 완료");
  });
  it("409 충돌에서는 초안을 남기고 확인 후에만 최신 서버 기록을 읽는다", async () => {
    requests.save.mockRejectedValue(new AdminApiError(409, "다른 관리자의 저장이 있습니다."));
    show(); await ready(); openScenario(); field("메모 · 차단 요인", "보존할 초안");
    fireEvent.click(screen.getByRole("button", { name: "검증 기록 저장" }));
    await screen.findByText(/다른 기록이 먼저 저장/u);
    expect((screen.getByLabelText("메모 · 차단 요인") as HTMLTextAreaElement).value).toBe("보존할 초안");
    expect((screen.getByRole("button", { name: "검증 기록 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "최신 기록 읽기" }));
    expect(requests.load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "초안을 버리고 최신 기록 읽기" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(requests.load).toHaveBeenCalledTimes(2);
  });
  it("통신 재시도는 같은 mutationId를 사용하고 성공 전 초안을 지우지 않는다", async () => {
    requests.save.mockRejectedValueOnce(new AdminApiError(503, "저장 연결 오류"));
    show(); await ready(); openScenario(); field("메모 · 차단 요인", "한 번만 기록할 메모");
    fireEvent.click(screen.getByRole("button", { name: "검증 기록 저장" }));
    await screen.findByText("저장 연결 오류");
    const first = requests.save.mock.calls[0]?.[0] as NestBoardMutation;
    fireEvent.click(screen.getByRole("button", { name: "검증 기록 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((requests.save.mock.calls[1]?.[0] as NestBoardMutation).mutationId).toBe(first.mutationId);
    expect(stored.history).toHaveLength(1);
  });
  it("403 저장 거부 시 데이터와 초안을 숨기고 관리자 재인증을 요청한다", async () => {
    requests.save.mockRejectedValue(new AdminApiError(403, "권한 철회"));
    show(); await ready(); openScenario(); field("메모 · 차단 요인", "권한 철회 후 숨길 기록");
    fireEvent.click(screen.getByRole("button", { name: "검증 기록 저장" }));
    await waitFor(() => expect(denied).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "NestJS 보드 화면" })).toBeNull();
  });
  it("focus 권한 재확인 중 초안을 유지하며 같은 사용자 재확인 후 다시 읽지 않는다", async () => {
    const rendered = show(); await ready(); openScenario(); field("메모 · 차단 요인", "focus 전에 쓰던 내용");
    rendered.rerender(<NestQualityBoard userIdentity="nest-admin-a" role="admin" verified={false} onUnauthorized={denied} />);
    rendered.rerender(<NestQualityBoard userIdentity="nest-admin-a" role="admin" verified onUnauthorized={denied} />);
    expect((screen.getByLabelText("메모 · 차단 요인") as HTMLTextAreaElement).value).toBe("focus 전에 쓰던 내용");
    expect(requests.load).toHaveBeenCalledTimes(1);
  });
  it("계정 전환 후 늦게 도착한 이전 응답을 무시한다", async () => {
    let resolveOld: ((value: NestBoardView) => void) | undefined;
    requests.load.mockReturnValueOnce(new Promise<NestBoardView>((resolve) => { resolveOld = resolve; }));
    const rendered = show();
    const next = nestBoardFixture(false); next.document.snapshot.mainCiState = "다른 계정 관측";
    requests.load.mockResolvedValueOnce(next);
    rendered.rerender(<NestQualityBoard userIdentity="nest-operator-b" role="operator" verified onUnauthorized={denied} />);
    await screen.findByText("다른 계정 관측");
    await act(async () => { resolveOld?.(nestBoardFixture()); });
    expect(screen.getByText("다른 계정 관측")).toBeTruthy();
    expect((requests.load.mock.calls[0]?.[0] as AbortSignal).aborted).toBe(true);
  });
  it("operator는 canEdit 응답과 관계없이 읽기·내보내기만 가능하다", async () => {
    show("operator"); await ready(); openScenario();
    expect(screen.queryByRole("button", { name: "검증 기록 저장" })).toBeNull();
    expect(screen.getByLabelText("메모 · 차단 요인").matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "NestJS 대화상자 닫기" }));
    fireEvent.click(screen.getByRole("button", { name: "NestJS JSON 관리" }));
    expect(screen.queryByLabelText("가져올 JSON")).toBeNull();
    expect(screen.getByRole("button", { name: "전체 기록 JSON 내보내기" })).toBeTruthy();
    expect(requests.save).not.toHaveBeenCalled();
  });
  it("승인 항목은 검토 메모만 변경하고 작업 상태·영향 정보를 유지한다", async () => {
    show(); await ready();
    fireEvent.click(screen.getByRole("button", { name: "승인 대기" }));
    const original = structuredClone(stored.document.tasks.find((task) => task.id === "nest-024"));
    if (!original) throw new Error("승인 fixture 없음");
    fireEvent.click(screen.getByRole("button", { name: new RegExp(original.title, "u") }));
    expect(screen.getByLabelText("관리 상태").matches(":disabled")).toBe(true);
    field("승인 검토 메모", "코드 수정 범위 검토만 기록");
    fireEvent.click(screen.getByRole("button", { name: "승인 메모 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored.document.tasks.find((task) => task.id === "nest-024")).toEqual({ ...original, notes: "코드 수정 범위 검토만 기록" });
  });
  it("JSON은 미리보기와 확인 후만 교체하며 패키지·전후 증거를 보존한다", async () => {
    show(); await ready(); fireEvent.click(screen.getByRole("button", { name: "NestJS JSON 관리" }));
    const incoming = structuredClone(stored.document);
    incoming.snapshot.packages[0].targetNote = "새 peer 근거 검토 제안";
    incoming.tasks.find((task) => task.id === scenarioId)!.beforeEvidence = "합성 기준 로그 확인";
    field("가져올 JSON", JSON.stringify({ document: incoming, revision: 999, history: [] }));
    fireEvent.click(screen.getByRole("button", { name: "JSON 검증·미리보기" }));
    expect(screen.getByRole("region", { name: "가져오기 미리보기" })).toBeTruthy();
    const replace = screen.getByRole("button", { name: "검토한 JSON으로 서버 기록 교체" }) as HTMLButtonElement;
    expect(replace.disabled).toBe(true); expect(requests.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /비교 내용과 제거 항목을 검토/u })); fireEvent.click(replace);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored.document).toEqual(incoming); expect(stored.revision).toBe(1); expect(stored.history).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "근거 · 변경 이력" }));
    expect(screen.getByRole("link", { name: "버전 1 전후 문서 JSON ↗" }).getAttribute("href")).toBe("/api/admin/quality/nestjs/history/1");
  });
  it("새 실행 관련 항목은 명시적으로 승인 필요를 선택해 승인 대기로 기록한다", async () => {
    show(); await ready(); fireEvent.click(screen.getByRole("button", { name: "작업 보드" }));
    fireEvent.click(screen.getByRole("button", { name: "검증 항목 추가" }));
    field("항목 이름", "배포 계획 승인 검토");
    fireEvent.click(screen.getByRole("checkbox", { name: "코드 수정·PR 병합·배포 승인 필요" }));
    expect((screen.getByLabelText("관리 상태") as HTMLSelectElement).value).toBe("승인 대기");
    expect(screen.getByLabelText("관리 상태").matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "승인 항목 저장" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(stored.document.tasks.find((task) => task.title === "배포 계획 승인 검토")).toMatchObject({ approvalRequired: true, status: "승인 대기", category: "승인", result: "미확인" });
  });
  it("JSON 가져오기에서 기존 승인 항목의 삭제·해제를 미리 차단한다", async () => {
    show(); await ready(); fireEvent.click(screen.getByRole("button", { name: "NestJS JSON 관리" }));
    for (const mode of ["remove", "release"]) {
      const incoming = structuredClone(stored.document);
      if (mode === "remove") incoming.tasks = incoming.tasks.filter((task) => task.id !== "nest-024");
      else incoming.tasks = incoming.tasks.map((task) => task.id === "nest-024" ? { ...task, approvalRequired: false } : task);
      field("가져올 JSON", JSON.stringify(incoming));
      fireEvent.click(screen.getByRole("button", { name: "JSON 검증·미리보기" }));
      expect(screen.getByRole("alert").textContent).toMatch(/기존 승인 필요 항목/u);
      expect(screen.queryByRole("region", { name: "가져오기 미리보기" })).toBeNull();
    }
    expect(requests.save).not.toHaveBeenCalled();
  });
  it("새 파일을 읽지 못하면 이전 가져오기 미리보기와 교체 확인을 무효화한다", async () => {
    show(); await ready(); fireEvent.click(screen.getByRole("button", { name: "NestJS JSON 관리" }));
    field("가져올 JSON", JSON.stringify(stored.document));
    fireEvent.click(screen.getByRole("button", { name: "JSON 검증·미리보기" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /비교 내용과 제거 항목을 검토/u }));
    const file = new File(["x".repeat(2_000_001)], "too-large.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("JSON 파일 선택"), { target: { files: [file] } });
    expect(screen.getByRole("alert").textContent).toContain("2MB");
    expect(screen.queryByRole("region", { name: "가져오기 미리보기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "검토한 JSON으로 서버 기록 교체" })).toBeNull();
    expect(requests.save).not.toHaveBeenCalled();
  });
  it("잘못된 JSON과 미저장 대화상자 닫기에서 초안을 버리지 않는다", async () => {
    show(); await ready(); fireEvent.click(screen.getByRole("button", { name: "NestJS JSON 관리" }));
    field("가져올 JSON", "{invalid"); fireEvent.click(screen.getByRole("button", { name: "JSON 검증·미리보기" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText("가져오기 초안은 아직 저장되지 않았습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "계속 검토" }));
    expect((screen.getByLabelText("가져올 JSON") as HTMLTextAreaElement).value).toBe("{invalid");
    expect(requests.save).not.toHaveBeenCalled();
  });
});
