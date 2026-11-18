// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createEmptyBusinessPlanState, type BusinessPlanAccess, type BusinessPlanRecord } from "@toonstudio/contracts/business-plan";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../platform/http/admin-api";

import { changeBusinessPlanAccess, claimBusinessPlan, exportBusinessPlan, loadBusinessPlan, loadBusinessPlanAccess, saveBusinessPlan } from "./business-plan-api";
import { BusinessPlanBoard } from "./BusinessPlanBoard";

vi.mock("./business-plan-api", async (original) => ({
  ...await original<typeof import("./business-plan-api")>(),
  loadBusinessPlan: vi.fn(), saveBusinessPlan: vi.fn(), exportBusinessPlan: vi.fn(), claimBusinessPlan: vi.fn(),
  loadBusinessPlanAccess: vi.fn(), changeBusinessPlanAccess: vi.fn(),
}));

const owner: BusinessPlanAccess = { canRead: true, canWrite: true, canExport: true, canManageAccess: true, canClaimOwnership: false };
const reader: BusinessPlanAccess = { canRead: true, canWrite: false, canExport: false, canManageAccess: false, canClaimOwnership: false };
const claimable: BusinessPlanAccess = { ...reader, canRead: false, canClaimOwnership: true };
const record = (access = owner): BusinessPlanRecord => ({ board: createEmptyBusinessPlanState(), revision: 1, updatedAt: new Date().toISOString(), access });

async function open(access = owner) {
  vi.mocked(loadBusinessPlan).mockResolvedValue(record(access));
  const rendered = render(<BusinessPlanBoard userIdentity="owner" />);
  await screen.findByRole("button", { name: "작업 추가" });
  return rendered;
}

function edit(note: string) {
  fireEvent.click(screen.getByRole("button", { name: "문제 인식 작업 편집" }));
  fireEvent.change(screen.getByLabelText("작업 메모"), { target: { value: note } });
  fireEvent.click(screen.getByRole("button", { name: "보드에 반영" }));
}

beforeEach(() => {
  vi.mocked(loadBusinessPlan).mockReset(); vi.mocked(saveBusinessPlan).mockReset();
  vi.mocked(exportBusinessPlan).mockReset(); vi.mocked(claimBusinessPlan).mockReset();
  vi.mocked(loadBusinessPlanAccess).mockReset(); vi.mocked(changeBusinessPlanAccess).mockReset();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  const NativeUrl = URL;
  vi.stubGlobal("URL", class extends NativeUrl { static createObjectURL = vi.fn(() => "blob:private-test"); static revokeObjectURL = vi.fn(); });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("사업계획서 소유자·명시적 권한 화면 경계", () => {
  it("관리자가 빈 보드를 읽어도 자동 소유권이나 초안을 만들지 않고 명시적 시작을 기다린다", async () => {
    vi.mocked(loadBusinessPlan).mockResolvedValue({ board: null, revision: 0, updatedAt: null, access: claimable });
    vi.mocked(claimBusinessPlan).mockResolvedValue({ board: null, revision: 0, updatedAt: null, access: owner });
    render(<BusinessPlanBoard userIdentity="owner" />);
    const button = await screen.findByRole("button", { name: "이 빈 보드의 소유자로 시작" });
    expect(screen.queryByRole("button", { name: "작업 추가" })).toBeNull();
    expect(claimBusinessPlan).not.toHaveBeenCalled(); expect(saveBusinessPlan).not.toHaveBeenCalled();
    fireEvent.click(button);
    await screen.findByRole("button", { name: "작업 추가" });
    expect(claimBusinessPlan).toHaveBeenCalledOnce();
    expect(vi.mocked(claimBusinessPlan).mock.calls[0][0]).toMatch(/^[a-f0-9-]{36}$/u);
    expect(saveBusinessPlan).not.toHaveBeenCalled();
  });

  it("읽기만 받은 계정은 문서·이력을 검토하지만 수정과 JSON·제출용 내보내기를 할 수 없다", async () => {
    const readOnly = record(reader);
    readOnly.board!.documents[0]!.workingText = "비공개 검토 원문";
    readOnly.board!.documents[0]!.submission = { label: "검토 후보", text: "비공개 제출 후보", createdAt: new Date().toISOString(), sourceUpdatedAt: new Date().toISOString() };
    vi.mocked(loadBusinessPlan).mockResolvedValue(readOnly);
    render(<BusinessPlanBoard userIdentity="reviewer" />);
    await screen.findAllByText("비공개 검토 원문");
    for (const name of ["작업 추가", "서버에 저장", "JSON 관리", "JSON 백업", "제출용 텍스트 내려받기"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect((screen.getByRole("combobox", { name: "문제 인식 진행 상태" }) as HTMLSelectElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "문제 인식 작업 편집" }));
    expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "보드에 반영" }) as HTMLButtonElement).disabled).toBe(true);
    expect(exportBusinessPlan).not.toHaveBeenCalled(); expect(saveBusinessPlan).not.toHaveBeenCalled();
  });

  it("내보내기 직전 서버가 권한을 거부하면 파일·자동 백업 없이 초안과 대화상자를 제거한다", async () => {
    await open(); edit("권한 철회 시 지울 비공개 초안");
    vi.mocked(exportBusinessPlan).mockRejectedValue(new AdminApiError(403, "철회됨"));
    fireEvent.click(screen.getByRole("button", { name: "JSON 백업" }));
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "작업 추가" })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("권한 철회 시 지울 비공개 초안");
  });

  it("같은 계정의 읽기 권한이 철회되면 창 복귀 시 서버 재검증으로 원문과 대기 저장을 제거한다", async () => {
    await open(); edit("철회 전 입력");
    vi.mocked(saveBusinessPlan).mockRejectedValue(new Error("응답 손실"));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    await screen.findByRole("button", { name: "실패한 저장 다시 시도" });
    vi.mocked(loadBusinessPlan).mockRejectedValueOnce(new AdminApiError(403, "철회됨"));
    fireEvent.focus(window);
    await waitFor(() => expect(screen.queryByRole("button", { name: "작업 추가" })).toBeNull());
    await screen.findByText(/기록을 숨겼습니다/u);
    expect(screen.queryByRole("button", { name: "실패한 저장 다시 시도" })).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("수정 권한만 철회되면 미저장 편집·대기 요청을 버리고 허용된 서버 읽기 자료로 전환한다", async () => {
    await open(); edit("철회 전 미저장 내용");
    vi.mocked(saveBusinessPlan).mockRejectedValue(new Error("응답 손실"));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" }));
    await screen.findByRole("button", { name: "실패한 저장 다시 시도" });
    vi.mocked(loadBusinessPlan).mockResolvedValueOnce(record(reader));
    fireEvent.focus(window);
    await screen.findByText(/읽기 전용으로 열었습니다/u);
    expect(screen.queryByRole("button", { name: "실패한 저장 다시 시도" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "문제 인식 작업 편집" }));
    expect((screen.getByLabelText("작업 메모") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByRole("button", { name: "보드에 반영" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("다른 계정으로 전환한 뒤 도착한 내보내기 응답으로 이전 계정 파일을 만들지 않는다", async () => {
    const rendered = await open();
    const delayed = Promise.withResolvers<BusinessPlanRecord>();
    vi.mocked(exportBusinessPlan).mockReturnValueOnce(delayed.promise);
    fireEvent.click(screen.getByRole("button", { name: "JSON 백업" }));
    vi.mocked(loadBusinessPlan).mockRejectedValueOnce(new AdminApiError(403, "새 계정 권한 없음"));
    rendered.rerender(<BusinessPlanBoard userIdentity="different-account" />);
    await screen.findByRole("alert");
    await act(async () => { delayed.resolve(record()); });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("소유자가 계정을 직접 지정하며 기본은 읽기만 부여하고 동일 변경 요청을 안전하게 재시도한다", async () => {
    await open();
    vi.mocked(loadBusinessPlanAccess).mockResolvedValue({ ownerUserId: "owner", grants: [] });
    vi.mocked(changeBusinessPlanAccess).mockRejectedValueOnce(new Error("응답 손실")).mockResolvedValueOnce({ updatedAt: new Date().toISOString(), replayed: true });
    fireEvent.click(screen.getByRole("button", { name: "사업 자료 접근 권한" }));
    const input = await screen.findByLabelText("권한을 받을 기존 계정 ID");
    fireEvent.change(input, { target: { value: "reviewer-account" } });
    fireEvent.submit(within(screen.getByRole("dialog")).getByRole("button", { name: "지정 계정에 권한 부여" }).closest("form")!);
    await screen.findByRole("button", { name: "같은 권한 변경 다시 확인" });
    const sent = vi.mocked(changeBusinessPlanAccess).mock.calls[0][0];
    expect(sent).toMatchObject({ userId: "reviewer-account", canRead: true, canWrite: false, canExport: false });
    fireEvent.submit(within(screen.getByRole("dialog")).getByRole("button", { name: "같은 권한 변경 다시 확인" }).closest("form")!);
    await screen.findByText("지정한 계정의 접근 권한을 저장했습니다.");
    expect(vi.mocked(changeBusinessPlanAccess).mock.calls[1][0]).toEqual(sent);
    expect(saveBusinessPlan).not.toHaveBeenCalled();
  });
});
