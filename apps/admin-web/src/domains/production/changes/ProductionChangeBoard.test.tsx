// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRecord, emptyData, updateRecord } from "@toonstudio/contracts/admin-production-change";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../platform/http/admin-api";

import * as changeUi from "./production-change-ui";
import { ProductionChangeBoard } from "./ProductionChangeBoard";

import type { ProductionChangeCreate, ProductionChangeSave, RequestRecord } from "@toonstudio/contracts/admin-production-change";

const requests = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), save: vi.fn(), transition: vi.fn(), upload: vi.fn() }));
vi.mock("./production-change-api", () => ({ loadProductionChanges: requests.load, createProductionChange: requests.create, saveProductionChange: requests.save, transitionProductionChange: requests.transition, uploadProductionCapture: requests.upload }));
const actor = { userId: "synthetic-admin", displayName: "합성 관리자" };
const denied = vi.fn();
let stored: RequestRecord[];
function fixture(title = "배경 조명 변경") { return createRecord({ ...emptyData(), title, description: "합성 테스트 요청", project: "테스트 프로젝트", nextAction: "영향 확인" }, actor, "2026-11-20T00:00:00.000Z"); }
function show(role: "admin" | "operator" = "admin") { return render(<ProductionChangeBoard actor={{ id: "synthetic-admin", role }} verified onUnauthorized={denied} />); }
async function openExisting() { await screen.findByRole("button", { name: /배경 조명 변경/u }); fireEvent.click(screen.getByRole("button", { name: /배경 조명 변경/u })); return screen.getByRole("dialog"); }
function change(label: string, value: string) { fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } }); }

beforeEach(() => {
  vi.clearAllMocks();
  stored = [fixture()];
  requests.load.mockImplementation(() => Promise.resolve(structuredClone(stored)));
  requests.create.mockImplementation((input: ProductionChangeCreate) => { const created = createRecord(input.data, actor); stored.push(created); return Promise.resolve(structuredClone(created)); });
  requests.save.mockImplementation((id: string, input: ProductionChangeSave) => { const record = stored.find(entry => entry.id === id); if (!record) throw new Error("합성 요청 없음"); const next = updateRecord(record, input.data, actor, "2026-11-20T00:01:00.000Z"); stored = stored.map(entry => entry.id === id ? next : entry); return Promise.resolve(structuredClone(next)); });
  requests.upload.mockResolvedValue("/api/admin/production-changes/captures/00000000-0000-4000-8000-000000000001");
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("네이티브 제작 변경 보드", () => {
  it("초안을 만들고 서버 기록을 다시 열며 미확인 상태를 추정하지 않는다", async () => {
    stored = [];
    const first = show();
    await screen.findByText("첫 변경 요청을 기록해 보세요");
    fireEvent.click(screen.getAllByRole("button", { name: "새 변경 요청" })[0]);
    change("요청 제목 *", "새 합성 제작 요청"); change("변경 목적과 요청 내용", "제작 변경 검토"); change("다음 조치", "범위 확인");
    fireEvent.click(screen.getByRole("button", { name: "초안 저장" }));
    await waitFor(() => expect(stored).toHaveLength(1));
    expect(stored[0].status).toBe("draft"); expect(stored[0].data.impact).toBe("unknown"); expect(stored[0].data.verification.result).toBe("unknown");
    await screen.findByRole("button", { name: "기록 저장" });
    first.unmount(); show();
    await screen.findByRole("button", { name: /새 합성 제작 요청/u });
    expect(requests.load).toHaveBeenCalledTimes(2);
  });
  it("조회503은 실제0건이나 브라우저 저장소 성공으로 표시하지 않는다", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem"), write = vi.spyOn(Storage.prototype, "setItem");
    requests.load.mockRejectedValue(new AdminApiError(503, "저장소 준비 전"));
    show(); await screen.findByRole("alert");
    expect(screen.getByText("요청 수 미확인")).toBeTruthy();
    expect(screen.queryByText("첫 변경 요청을 기록해 보세요")).toBeNull();
    expect((screen.getByRole("button", { name: "새 변경 요청" }) as HTMLButtonElement).disabled).toBe(true);
    expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
  });
  it("운영자는 요청과 충돌·검증 증빙을 읽되 수정·전이를 실행할 수 없다", async () => {
    show("operator"); const dialog = await openExisting();
    expect((within(dialog).getByLabelText("요청 제목 *") as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "기록 저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "요청 제출" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Conflict Center" }));
    expect(within(dialog).getByRole("heading", { name: "로컬 변경" })).toBeTruthy();
    expect(within(dialog).getByRole("heading", { name: "원격 변경" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "적용·검증" }));
    expect((within(dialog).getByLabelText("검증 결과") as HTMLSelectElement).disabled).toBe(true);
    expect(requests.save).not.toHaveBeenCalled(); expect(requests.transition).not.toHaveBeenCalled();
  });
  it("409는 초안을 보존하고 명시적 확인 뒤에만 최신 요청으로 바꾼다", async () => {
    requests.save.mockRejectedValue(new AdminApiError(409, "버전 충돌"));
    show(); await openExisting(); change("작업 메모", "보존할 편집 메모");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await screen.findByRole("button", { name: "미저장 초안 내보내기" });
    expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).value).toBe("보존할 편집 메모");
    expect((screen.getByRole("button", { name: "기록 저장" }) as HTMLButtonElement).disabled).toBe(true);
    const confirmation = vi.mocked(window.confirm); confirmation.mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole("button", { name: "최신 요청 다시 읽기" }));
    expect(requests.load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "최신 요청 다시 읽기" }));
    await waitFor(() => expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).value).toBe(""));
    expect(requests.load).toHaveBeenCalledTimes(2);
  });
  it("통신 실패 후 같은 내용의 재시도는 같은 mutationId를 보낸다", async () => {
    requests.save.mockRejectedValueOnce(new AdminApiError(503, "일시 저장 실패"));
    show(); await openExisting(); change("작업 메모", "중복 저장을 피할 메모");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await within(screen.getByRole("dialog")).findByText("일시 저장 실패");
    const first = requests.save.mock.calls[0]?.[1] as ProductionChangeSave;
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(stored[0].version).toBe(2));
    expect((requests.save.mock.calls[1]?.[1] as ProductionChangeSave).mutationId).toBe(first.mutationId);
    expect(stored[0].history).toHaveLength(2);
  });
  it("서버503 중에도 확인된 계정의 미저장 초안을 직접 내보낼 수 있다", async () => {
    const download = vi.spyOn(changeUi, "saveDownload").mockImplementation(() => undefined);
    requests.save.mockRejectedValue(new AdminApiError(503, "서버 연결 중단"));
    show(); await openExisting(); change("작업 메모", "오프라인 보관할 초안");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await within(screen.getByRole("dialog")).findByText("서버 연결 중단");
    fireEvent.click(screen.getByRole("button", { name: "초안 내보내기" }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    const payload = JSON.parse(download.mock.calls[0]?.[1] ?? "{}");
    expect(payload).toMatchObject({ kind: "unsaved-production-change-draft", data: { notes: "오프라인 보관할 초안" } });
    expect(requests.load).toHaveBeenCalledTimes(1);
  });
  it("저장403은 상위 게이트가 갱신되기 전에도 이전 기록과 모달을 즉시 제거한다", async () => {
    requests.save.mockRejectedValue(new AdminApiError(403, "권한 철회"));
    show(); await openExisting(); change("작업 메모", "철회 뒤 숨길 편집");
    fireEvent.click(screen.getByRole("button", { name: "기록 저장" }));
    await waitFor(() => expect(denied).toHaveBeenCalledOnce());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("button", { name: /배경 조명 변경/u })).toBeNull();
  });
  it("권한 재확인 중 네이티브 모달을 닫고 같은 계정 확인 후 초안을 복원한다", async () => {
    const rendered = show(); await openExisting(); change("작업 메모", "재확인 중 보존할 메모");
    rendered.rerender(<ProductionChangeBoard actor={{ id: "synthetic-admin", role: "admin" }} verified={false} onUnauthorized={denied} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    rendered.rerender(<ProductionChangeBoard actor={{ id: "synthetic-admin", role: "admin" }} verified onUnauthorized={denied} />);
    await waitFor(() => expect(screen.getByRole("dialog")).toBeTruthy());
    expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).value).toBe("재확인 중 보존할 메모");
  });
  it("인증 중단 뒤 늦은 조회 응답은 반영하지 않는다", async () => {
    let resolve: ((records: RequestRecord[]) => void) | undefined;
    requests.load.mockReturnValueOnce(new Promise<RequestRecord[]>(done => { resolve = done; }));
    const rendered = show();
    rendered.rerender(<ProductionChangeBoard actor={{ id: "synthetic-admin", role: "admin" }} verified={false} onUnauthorized={denied} />);
    await act(async () => { resolve?.([fixture("늦게 도착한 이전 자료")]); });
    expect(screen.queryByRole("button", { name: /늦게 도착한 이전 자료/u })).toBeNull();
  });
});
