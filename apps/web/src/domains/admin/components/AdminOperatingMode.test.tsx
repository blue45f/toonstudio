// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialOperationPolicy, resolveOperationPolicy } from "@toonstudio/contracts/operation-policy";
import { AdminOperatingMode, AdminOperationsWorkspace, AdminPolicyEvidence } from "./AdminOperatingMode";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import "../admin-i18n-loader";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/platform/api", () => ({ api: mocks, getApiErrorMessage: async (error: unknown) => error instanceof Error ? error.message : "실패" }));
vi.mock("./AdminOps", () => ({ AdminOps: () => <p>실제 상태 업무</p> }));
vi.mock("./AdminIntegrations", () => ({ AdminIntegrations: () => <p>실제 연동 업무</p> }));
const policy = () => ({ revision: 0, draft: initialOperationPolicy(), updatedAt: "2026-09-22T00:00:00Z" });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.get.mockResolvedValue({ policy: policy(), effective: resolveOperationPolicy(policy(), null, new Date()), runtimeFingerprint: null, audit: [] });
  mocks.post.mockImplementation(async (path, body) => path.endsWith("/preview") ? { expectedRevision: 0, digest: "a".repeat(64),
    blockedReasons: body.draft.mode === "paid" ? ["검토 근거가 필요합니다."] : [], changes: ["기존 자료 보존"],
    effective: resolveOperationPolicy({ ...policy(), draft: body.draft }, null, new Date()) } : { acceptedRevision: 1 });
});
afterEach(cleanup);
describe("existing administrator console operating mode", () => {
  it("opens saved evidence without applying an unfinished policy draft", async () => {
    const review = vi.fn();
    render(<AdminOperatingMode uid="admin" onReviewEvidence={review} />);
    await screen.findByRole("radio", { name: "무료 운영" });
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "미저장 정책 검토" } });
    fireEvent.click(screen.getByRole("button", { name: "정책 검토 근거·변경 이력 보기" }));
    expect(review).toHaveBeenCalledOnce();
    expect(mocks.post).not.toHaveBeenCalled();
  });
  it("requires preview before applying a mode and blocks unreviewed paid transition", async () => {
    render(<AdminOperatingMode uid="admin" />);
    await screen.findByRole("radio", { name: "무료 운영" });
    fireEvent.click(screen.getByRole("radio", { name: "유료 운영" }));
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "운영 변경 미리보기" }));
    await screen.findByText("검토 근거가 필요합니다.");
    expect((screen.getByRole("button", { name: "확인한 운영 정책 적용" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("sends profile changes with revision, preview and mutation ID", async () => {
    render(<AdminOperatingMode uid="admin" />);
    await screen.findByRole("radio", { name: "무료 운영" });
    fireEvent.change(screen.getByLabelText("무료 운영 소유 팀 한도"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("변경 사유"), { target: { value: "운영 용량 변경 검증" } });
    fireEvent.click(screen.getByRole("button", { name: "운영 변경 미리보기" }));
    await screen.findByRole("button", { name: "확인한 운영 정책 적용" });
    fireEvent.click(screen.getByRole("button", { name: "확인한 운영 정책 적용" }));
    await waitFor(() => expect(mocks.post.mock.calls.some(([path]) => path.endsWith("/apply"))).toBe(true));
    const call = mocks.post.mock.calls.find(([path]) => path.endsWith("/apply"))!;
    expect(call[1]).toMatchObject({ expectedRevision: 0, previewDigest: "a".repeat(64), reason: "운영 용량 변경 검증" });
    expect(call[1].draft.profiles.free.limits.ownedWorkspaces).toBe(3);
    expect(call[1].mutationId).toMatch(/^[a-f0-9-]{36}$/u);
  });
  it("discards privileged state when the administrator identity changes", async () => {
    const view = render(<AdminOperatingMode uid="admin" />);
    await screen.findByRole("radio", { name: "무료 운영" });
    mocks.get.mockRejectedValue(new Error("관리자 권한 없음"));
    view.rerender(<AdminOperatingMode uid="operator" />);
    expect(screen.queryByRole("radio")).toBeNull();
    await screen.findByText("관리자 권한 없음");
  });
});


function LocationHistory() {
  const location = useLocation(); const navigate = useNavigate();
  return <><output aria-label="현재 주소">{location.pathname}{location.search}{location.hash}</output><button type="button" onClick={() => navigate(-1)}>이전 위치</button></>;
}
function openWorkspace(path = "/admin/platform/operations") {
  return render(<MemoryRouter initialEntries={[path]}><AdminOperationsWorkspace uid="admin-a" /><LocationHistory /></MemoryRouter>);
}
function evidenceFixture(revision = 4) {
  const base = policy();
  const savedPolicy = { ...base, revision, draft: { ...base.draft, releaseReview: { ...base.draft.releaseReview, evidenceRef: revision === 4 ? "라이선스 검토 문서" : "갱신한 라이선스 근거" } } };
  return { policy: savedPolicy, effective: resolveOperationPolicy(savedPolicy, null, new Date()), runtimeFingerprint: null, audit: [{ revision, reason: "승인된 근거 갱신", actorUserId: "admin-a", occurredAt: "2026-11-11T00:00:00Z" }] };
}
describe("purpose-based operations and saved evidence", () => {
  it("opens one task without mounting unrelated forms", async () => {
    openWorkspace();
    expect(await screen.findByText("실제 상태 업무")).toBeTruthy();
    expect(screen.queryByLabelText("변경 사유")).toBeNull();
    expect(screen.queryByText("실제 연동 업무")).toBeNull();
    expect(screen.getByRole("button", { name: "서비스 상태·설정" }).getAttribute("aria-current")).toBe("page");
  });
  it("keeps unsaved policy input across evidence, task changes, and browser Back", async () => {
    openWorkspace("/admin/platform/operations?source=shortcut&view=policy");
    fireEvent.change(await screen.findByLabelText("변경 사유"), { target: { value: "아직 저장하지 않은 변경" } });
    fireEvent.click(screen.getByRole("button", { name: "정책 검토 근거·변경 이력 보기" }));
    fireEvent.click(await screen.findByRole("button", { name: "운영 정책으로 돌아가기" }));
    expect((screen.getByLabelText("변경 사유") as HTMLTextAreaElement).value).toBe("아직 저장하지 않은 변경");
    fireEvent.click(screen.getByRole("button", { name: "외부 연동 상태" }));
    expect(await screen.findByText("실제 연동 업무")).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "변경 사유" })).toBeNull();
    expect(screen.getByLabelText("현재 주소").textContent).toBe("/admin/platform/operations?source=shortcut&view=integrations");
    fireEvent.click(screen.getByRole("button", { name: "이전 위치" }));
    expect((await screen.findByRole("textbox", { name: "변경 사유" }) as HTMLTextAreaElement).value).toBe("아직 저장하지 않은 변경");
    expect(screen.getByRole("button", { name: "운영 정책" }).getAttribute("aria-current")).toBe("page");
  });
  it("opens the existing integration anchor and clears it when selecting another task", async () => {
    openWorkspace("/admin/platform/operations?source=legacy#integrations");
    expect(await screen.findByText("실제 연동 업무")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "서비스 상태·설정" }));
    expect(await screen.findByText("실제 상태 업무")).toBeTruthy();
    expect(screen.getByLabelText("현재 주소").textContent).toBe("/admin/platform/operations?source=legacy");
  });
  it("reads saved evidence and returns to management without mutating policy", async () => {
    mocks.get.mockResolvedValueOnce(evidenceFixture());
    const manage = vi.fn(); render(<AdminPolicyEvidence onManage={manage} />);
    expect(await screen.findByText("라이선스 검토 문서")).toBeTruthy();
    expect(screen.getByText(/승인된 근거 갱신/)).toBeTruthy();
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith("/admin/production/operation-policy");
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "운영 정책으로 돌아가기" }));
    expect(manage).toHaveBeenCalledOnce();
  });
  it("shows a read failure and retries without showing stale private evidence", async () => {
    mocks.get.mockRejectedValueOnce(new Error("관리자 권한 확인 필요")).mockResolvedValueOnce(evidenceFixture());
    render(<AdminPolicyEvidence onManage={vi.fn()} />);
    expect((await screen.findByRole("alert")).textContent).toBe("관리자 권한 확인 필요");
    expect(screen.queryByText("라이선스 검토 문서")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "검토 근거 다시 읽기" }));
    expect(await screen.findByText("라이선스 검토 문서")).toBeTruthy();
    await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  });
  it("reloads saved evidence on return after a policy change without retaining the old revision", async () => {
    mocks.get.mockResolvedValueOnce(evidenceFixture());
    openWorkspace("/admin/platform/operations?view=evidence");
    expect((await screen.findByText(/조회한 정책 revision/)).textContent).toContain("4");
    fireEvent.click(screen.getByRole("button", { name: "서비스 상태·설정" }));
    expect(await screen.findByText("실제 상태 업무")).toBeTruthy();
    mocks.get.mockResolvedValueOnce(evidenceFixture(5));
    fireEvent.click(screen.getByRole("button", { name: "정책 검토 근거" }));
    expect(screen.queryByText("라이선스 검토 문서")).toBeNull();
    expect(await screen.findByText("갱신한 라이선스 근거")).toBeTruthy();
    expect(screen.getByText(/조회한 정책 revision/).textContent).toContain("5");
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });
});
