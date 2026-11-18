// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminApiError } from "../../../platform/http/admin-api";

import { aiFixture, aiFixtureView } from "./ai-operations-fixture.test-support";
import { newAiItem } from "./ai-operations-model";
import { AiOperationsBoard } from "./AiOperationsBoard";

const api = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));
vi.mock("./ai-operations-api", () => ({ loadAiOperations: api.load, saveAiOperations: api.save }));

beforeEach(() => { api.load.mockReset(); api.save.mockReset(); api.load.mockResolvedValue(aiFixtureView()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
async function show() { const mounted = render(<AiOperationsBoard userIdentity="synthetic-admin" />); await screen.findByText("합성 Cloudflare 모델"); return mounted; }
function openModel() { fireEvent.click(screen.getByRole("button", { name: "Cloudflare 모델" })); fireEvent.click(screen.getByRole("button", { name: "합성 Cloudflare 모델" })); }
function change(label: string, value: string) { fireEvent.change(within(screen.getByRole("dialog")).getByLabelText(label), { target: { value } }); }

describe("AI·무료 운영 관리자 보드", () => {
  it("운영자는 공유 기록을 열람하되 저장·가져오기·새 기록을 사용할 수 없다", async () => {
    api.load.mockResolvedValue(aiFixtureView(false)); await show();
    expect(screen.getByText("운영자 열람 전용")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "서버에 저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "JSON 가져오기" })).toBeNull();
    expect(screen.queryByRole("button", { name: "새 기록" })).toBeNull();
    openModel(); expect((screen.getByLabelText("제목") as HTMLInputElement).closest("fieldset")?.disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "변경 적용" })).toBeNull(); expect(api.save).not.toHaveBeenCalled();
  });

  it("필터와 여섯 상태의 작업 보드를 제공하고 관측 수치를 만들어 내지 않는다", async () => {
    await show(); fireEvent.click(screen.getByRole("button", { name: "작업 보드" }));
    expect(screen.getAllByRole("region", { name: /작업$/u })).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("상태 필터"), { target: { value: "승인 대기" } });
    expect(screen.getAllByRole("region", { name: /작업$/u })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "합성 Cloudflare 모델" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "필터 초기화" }));
    fireEvent.click(screen.getByRole("button", { name: "Onpod 알림" }));
    expect(screen.getByText("필터에 맞는 기록이 없습니다.")).toBeTruthy();
  });

  it("편집 적용은 화면에만 남고 명시적 저장이 성공해야 기준 리비전이 바뀐다", async () => {
    await show(); openModel(); change("제목", "수정한 합성 모델"); change("메모", "실제 증거 대기"); fireEvent.click(screen.getByRole("button", { name: "변경 적용" }));
    expect(api.save).not.toHaveBeenCalled(); expect(screen.getByText("아직 서버에 저장하지 않은 변경 있음")).toBeTruthy();
    api.save.mockImplementation(async (input) => ({ ...aiFixtureView(), snapshot: input.snapshot, revision: 4 }));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" })); await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    expect(api.save.mock.calls[0][0].expectedRevision).toBe(3);
    expect(api.save.mock.calls[0][0].snapshot.meta.snapshotAt).toBe(aiFixture().meta.snapshotAt);
    expect(api.save.mock.calls[0][0].snapshot.items[0].notes).toBe("실제 증거 대기");
    await screen.findByText("저장본과 일치");
  });

  it("409 충돌은 편집 내용을 보존하고 추가 저장을 막으며 폐기 확인 후 다시 읽는다", async () => {
    await show(); openModel(); change("제목", "충돌한 합성 초안"); fireEvent.click(screen.getByRole("button", { name: "변경 적용" }));
    api.save.mockRejectedValue(new AdminApiError(409, "서버 리비전 충돌"));
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" })); await screen.findByText("서버 리비전 충돌");
    expect(screen.getByRole("button", { name: "충돌한 합성 초안" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "서버에 저장" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "저장 기록 새로 읽기" }));
    expect(api.load).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "변경을 버리고 다시 읽기" }));
    await screen.findByRole("button", { name: "합성 Cloudflare 모델" }); expect(api.load).toHaveBeenCalledTimes(2);
  });

  it("저장 응답을 잃은 재시도는 같은 mutationId를 사용한다", async () => {
    await show(); openModel(); change("메모", "응답 유실 검증"); fireEvent.click(screen.getByRole("button", { name: "변경 적용" }));
    api.save.mockRejectedValue(new Error("연결 중단")); fireEvent.click(screen.getByRole("button", { name: "서버에 저장" })); await screen.findByText("연결 중단");
    const first = api.save.mock.calls[0][0].mutationId;
    fireEvent.click(screen.getByRole("button", { name: "서버에 저장" })); await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1][0].mutationId).toBe(first);
  });

  it("손상된 가져오기는 원본을 유지하고 승인 항목을 보존한 검토본만 명시적으로 적용한다", async () => {
    const initial = aiFixtureView(); const approval = { ...newAiItem("task"), id: "protected-approval", title: "보존할 승인 작업", sourceIds: ["synthetic-code"] };
    initial.snapshot!.items.push(approval); api.load.mockResolvedValue(initial); await show();
    fireEvent.click(screen.getByRole("button", { name: "JSON 가져오기" }));
    change("또는 JSON 붙여넣기", "{broken"); fireEvent.click(screen.getByRole("button", { name: "가져오기 내용 검토" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "검토한 기록을 화면에 적용" })).toBeNull();
    const imported = aiFixture(); imported.items[0].title = "가져온 합성 모델";
    change("또는 JSON 붙여넣기", JSON.stringify({ ...imported, activity: [], revision: 99, exportedAt: "2026-01-03T00:00:00Z" }));
    fireEvent.click(screen.getByRole("button", { name: "가져오기 내용 검토" }));
    expect(screen.getByText("기존 승인 대기 항목 1개와 해당 근거를 보존합니다.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "검토한 기록을 화면에 적용" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("기존 승인 항목을 보존하고 나머지 기록을 가져온 내용으로 바꿀 것을 확인했습니다."));
    fireEvent.click(screen.getByRole("button", { name: "검토한 기록을 화면에 적용" }));
    expect(screen.getByRole("button", { name: "보존할 승인 작업" })).toBeTruthy(); expect(screen.getByRole("button", { name: "가져온 합성 모델" })).toBeTruthy(); expect(api.save).not.toHaveBeenCalled();
  });

  it("근거 없는 검증 완료를 화면에도 적용하지 않는다", async () => {
    await show(); openModel(); change("진행 상태", "검증 완료"); fireEvent.click(screen.getByRole("button", { name: "변경 적용" }));
    expect(within(screen.getByRole("dialog")).getByRole("alert")).toBeTruthy(); expect(api.save).not.toHaveBeenCalled();
  });

  it("권한 재확인 동안 민감한 DOM을 제거하고 확인 후 편집 중 초안을 복원한다", async () => {
    const mounted = await show(); openModel(); change("메모", "확인 중 보존할 합성 초안");
    mounted.rerender(<AiOperationsBoard userIdentity="synthetic-admin" authorized={false} />);
    expect(screen.queryByText("합성 Cloudflare 모델")).toBeNull(); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByLabelText("메모")).toBeNull();
    mounted.rerender(<AiOperationsBoard userIdentity="synthetic-admin" authorized />);
    expect((screen.getByLabelText("메모") as HTMLTextAreaElement).value).toBe("확인 중 보존할 합성 초안");
  });

  it("저장 권한 거부에는 화면의 이전 기록을 제거한다", async () => {
    await show(); openModel(); change("메모", "쓰기 권한 확인"); fireEvent.click(screen.getByRole("button", { name: "변경 적용" }));
    api.save.mockRejectedValue(new AdminApiError(403, "권한 회수")); fireEvent.click(screen.getByRole("button", { name: "서버에 저장" })); await screen.findByText("권한 회수");
    expect(screen.queryByRole("button", { name: "합성 Cloudflare 모델" })).toBeNull(); expect(screen.queryByRole("button", { name: "JSON 가져오기" })).toBeNull();
  });

  it("503 읽기 실패를 저장된 빈 보드로 표시하지 않는다", async () => {
    api.load.mockRejectedValue(new AdminApiError(503, "저장 스키마 미준비")); render(<AiOperationsBoard userIdentity="synthetic-admin" />);
    await screen.findByText("저장 스키마 미준비"); expect(screen.queryByText("저장된 운영 보드가 없습니다")).toBeNull(); expect(screen.queryByRole("button", { name: "공개 기준으로 시작" })).toBeNull();
  });

  it("새 사용자로 전환한 뒤 이전 사용자의 늦은 응답을 표시하지 않는다", async () => {
    let finish: ((value: ReturnType<typeof aiFixtureView>) => void) | undefined;
    api.load.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValueOnce({ ...aiFixtureView(false), snapshot: null });
    const mounted = render(<AiOperationsBoard userIdentity="first-user" />); mounted.rerender(<AiOperationsBoard userIdentity="second-user" />);
    await screen.findByText("운영자 열람 전용"); await act(async () => { finish?.(aiFixtureView()); });
    expect(screen.queryByRole("button", { name: "합성 Cloudflare 모델" })).toBeNull();
  });
});
