// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@toonstudio/studio-project-model";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";
import { AppApiError } from "@/platform/api";
import { useI18n } from "@/shared/lib/i18n-core";
import type { StudioTeamSnapshot } from "../studio-team-client";
import type { ProductionClientCommand } from "./production-api";
import { ProductionCommandRevisionChangedError, type ProductionCommandExecutor } from "./production-command-execution";
import { ProductionCollaborationRoleEditor } from "./ProductionCollaborationRoleEditor";
import { productionReviewFlowFixture } from "./production-review-flow.test-fixture";
import { clearProductionCommandRecovery, loadProductionCommandRecovery, saveProductionCommandRecovery } from "./production-command-recovery";

const io = vi.hoisted(() => ({ team: vi.fn(), actor: "review-flow-owner" as string | null, revision: 1, listeners: new Set<() => void>() }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: io.team }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => io.actor, getAuthSession: () => io.actor ? { user: { id: io.actor } } : null,
  getAuthSessionRevision: () => io.revision, listeners: io.listeners,
}));
type Configure = Extract<ProductionClientCommand, { readonly type: "configure-collaboration" }>;
const OWNER = "review-flow-owner", COLOR = "roster-color-account", DEPARTED = "roster-departed-account";
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise 초기화 전입니다."); };
  let reject: (reason: unknown) => void = () => { throw new Error("Promise 초기화 전입니다."); };
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
/** 합성 계약 fixture다. 실제 4계정 UI 인증·브라우저·DB producer 증거가 아니다. */
function fixture() {
  const f = productionReviewFlowFixture();
  const first = f.aggregate.parties[0], role = f.aggregate.assignments.find((entry) => entry.id === f.artist.id);
  const artistParty = f.aggregate.parties.find((entry) => entry.id === f.artist.partyId);
  if (!first || !role || !artistParty?.accountUserId) throw new Error("기존 역할 fixture가 없습니다.");
  const unlinked = { ...first, id: "roster-unlinked-party", accountUserId: null, publicDisplayName: "외부 작가", internalDisplayName: "기존 외부 작가" };
  const departed = { ...first, id: "roster-departed-party", accountUserId: DEPARTED, publicDisplayName: "이전 작업자", internalDisplayName: "이전 작업자" };
  const unlinkedRole = { ...role, id: "roster-unlinked-role", partyId: unlinked.id };
  const departedRole = { ...role, id: "roster-departed-role", partyId: departed.id };
  const artist = { ...role, startsAt: "2026-10-29T00:00:00.789Z", capabilities: ["legacy-drawing-capability"], agreementRevisionRef: "agreement-preserved", publicCreditRole: "기존 선화 크레딧" };
  const aggregate: ProductionProjectAggregate = { ...f.aggregate,
    parties: [...f.aggregate.parties, unlinked, departed],
    assignments: [...f.aggregate.assignments.map((entry) => entry.id === artist.id ? artist : entry), unlinkedRole, departedRole] };
  const team: StudioTeamSnapshot = { workId: aggregate.workId,
    viewer: { userId: OWNER, role: "owner", status: "active", capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false } },
    members: [{ userId: OWNER, name: "제작 책임자", image: "", role: "owner", status: "active", isOwner: true },
      { userId: artistParty.accountUserId, name: "선화 담당", image: "", role: "viewer", status: "active", isOwner: false },
      { userId: COLOR, name: "채색 담당", image: "", role: "commenter", status: "active", isOwner: false },
      { userId: "roster-pending", name: "초대 대기 계정", image: "", role: "viewer", status: "pending", isOwner: false },
      { userId: "roster-declined", name: "거절한 계정", image: "", role: "viewer", status: "declined", isOwner: false }] };
  return { ...f, aggregate, team, unlinked, unlinkedRole, departedRole, artist };
}
function configure(command: ProductionClientCommand | undefined): Configure {
  if (command?.type !== "configure-collaboration") throw new Error("실제 configure-collaboration 명령이 없습니다.");
  return command;
}
function applied(aggregate: ProductionProjectAggregate, command: Configure): ProductionProjectAggregate {
  return { ...aggregate, revision: aggregate.revision + 1, parties: command.parties,
    assignments: command.assignments, authorityRules: command.authorityRules };
}
function executor() { return vi.fn<ProductionCommandExecutor>().mockResolvedValue(undefined); }
function selectValue(element: HTMLElement): string {
  if (!(element instanceof HTMLSelectElement)) throw new Error("역할 선택 필드가 select 요소가 아닙니다.");
  return element.value;
}
async function openNew(f: ReturnType<typeof fixture>) {
  const button = await screen.findByRole("button", { name: "공정 역할 추가", exact: true });
  await waitFor(() => expect(button.matches(":disabled")).toBe(false)); fireEvent.click(button);
  const account = screen.getByRole("combobox", { name: "연결할 작품 팀 계정" });
  expect(selectValue(account)).toBe("");
  fireEvent.change(account, { target: { value: COLOR } });
  fireEvent.change(screen.getByRole("combobox", { name: "실제 담당 범위" }), { target: { value: canonicalJson(f.scope) } });
  fireEvent.change(screen.getByRole("combobox", { name: "공정 역할", exact: true }), { target: { value: "colorist" } });
}
async function openExisting(name: string) {
  const button = await screen.findByRole("button", { name, exact: true });
  await waitFor(() => expect(button.matches(":disabled")).toBe(false)); fireEvent.click(button);
}
function save() { fireEvent.click(screen.getByRole("button", { name: "공정 역할 저장", exact: true })); }
function rejected(status: 403 | 409) {
  return new Error("서버가 변경을 거절했습니다.", { cause: new AppApiError("현재 권한 또는 버전을 확인하세요.", {
    kind: status === 403 ? "forbidden" : "conflict", status,
    ...(status === 409 ? { code: "production_revision_conflict" } : {}),
  }) });
}
beforeEach(() => {
  vi.clearAllMocks(); window.sessionStorage.clear(); io.actor = OWNER; io.revision = 1;
  useI18n.setState({ lang: "ko" }); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z"));
  io.team.mockReset(); io.team.mockResolvedValue(fixture().team);
});
afterEach(() => { cleanup(); window.sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("실제 작품 팀 계정을 쓰는 공정 역할 관리 UI", () => {
  it("관리 권한과 현재 계정이 없으면 조회·편집을 시작하지 않는다", () => {
    const f = fixture(), execute = executor();
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage={false} execute={execute} />);
    expect(screen.queryByRole("button", { name: "공정 역할 추가" })).toBeNull(); expect(io.team).not.toHaveBeenCalled();
    act(() => { io.actor = null; ++io.revision; });
    view.rerender(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    expect(io.team).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
  });
  it("활성 계정과 실제 범위를 명시하고 기존 배열·계약을 보존한 명령만 한 번 보낸다", async () => {
    const f = fixture(), before = structuredClone(f.aggregate), execute = executor();
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openNew(f);
    const account = screen.getByRole("combobox", { name: "연결할 작품 팀 계정" });
    expect(within(account).queryByRole("option", { name: /초대 대기 계정|거절한 계정/ })).toBeNull();
    expect(within(screen.getByRole("combobox", { name: "제작 참여자" })).queryByRole("option", { name: /선화 담당/ })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "이 담당 범위의 리드 역할" })); save();
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute.mock.calls[0]?.[2]).toEqual({ expectedRevision: f.aggregate.revision });
    expect(io.team).toHaveBeenCalledTimes(2);
    const command = configure(execute.mock.calls[0]?.[0]);
    expect(command.authorityRules).toEqual(before.authorityRules); expect(command).not.toHaveProperty("charter");
    expect(command.parties.slice(0, before.parties.length)).toEqual(before.parties);
    expect(command.assignments.slice(0, before.assignments.length)).toEqual(before.assignments);
    const added = command.assignments.at(-1), party = command.parties.at(-1);
    expect(added).toMatchObject({ projectId: f.aggregate.projectId, roleType: "colorist", scope: f.scope,
      status: "active", lead: true, capabilities: [], agreementRevisionRef: null, publicCreditRole: null });
    expect(party).toMatchObject({ accountUserId: COLOR, status: "active" });
    expect(added?.partyId).toBe(party?.id); expect(f.aggregate).toEqual(before);
    // Promise resolve만으로 완료하지 않고 실제 최신 aggregate의 선택한 입력을 기다린다.
    expect(screen.getByRole("dialog")).toBeTruthy();
    view.rerender(<ProductionCollaborationRoleEditor aggregate={applied(f.aggregate, command)} canManage execute={execute} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("미연결 참여자만 명시 연결하고 기존 이름·당사자 ID를 유지한다", async () => {
    const f = fixture(), execute = executor(); render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openNew(f);
    fireEvent.change(screen.getByRole("combobox", { name: "제작 참여자" }), { target: { value: f.unlinked.id } }); save();
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const command = configure(execute.mock.calls[0]?.[0]);
    expect(command.parties).toHaveLength(f.aggregate.parties.length);
    expect(command.parties.find((party) => party.id === f.unlinked.id)).toEqual({ ...f.unlinked, accountUserId: COLOR });
    expect(command.assignments.at(-1)?.partyId).toBe(f.unlinked.id);
  });
  it("기존 연결 계정은 바꾸지 못하고 역할 중지에서도 계약·크레딧·ISO 정밀도를 유지한다", async () => {
    const f = fixture(), execute = executor(); render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openExisting("선화 담당 선화 작가 역할 편집");
    const account = screen.getByRole("combobox", { name: "연결할 작품 팀 계정" });
    expect(account.matches(":disabled")).toBe(true);
    expect(within(account).queryByRole("option", { name: /채색 담당/ })).toBeNull();
    fireEvent.change(account, { target: { value: COLOR } });
    expect((await screen.findByRole("alert")).textContent).toContain("이미 연결된 계정");
    fireEvent.change(screen.getByRole("combobox", { name: "역할 상태" }), { target: { value: "paused" } }); save();
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const command = configure(execute.mock.calls[0]?.[0]);
    expect(command.assignments.find((entry) => entry.id === f.artist.id)).toEqual({ ...f.artist, status: "paused" });
    expect(command.parties).toEqual(f.aggregate.parties);
  });
  it("작품 팀을 떠난 연결 역할과 계정 없는 기존 역할을 삭제 없이 종료할 수 있다", async () => {
    const f = fixture(), execute = executor(); const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openExisting("이전 작업자 선화 작가 역할 편집");
    fireEvent.change(screen.getByRole("combobox", { name: "역할 상태" }), { target: { value: "ended" } });
    fireEvent.change(screen.getByRole("combobox", { name: "참여자 상태" }), { target: { value: "ended" } }); save();
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    const first = configure(execute.mock.calls[0]?.[0]), next = applied(f.aggregate, first);
    expect(first.assignments.find((entry) => entry.id === f.departedRole.id)?.status).toBe("ended");
    expect(first.parties.find((entry) => entry.id === f.departedRole.partyId)?.accountUserId).toBe(DEPARTED);
    view.rerender(<ProductionCollaborationRoleEditor aggregate={next} canManage execute={execute} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await openExisting("외부 작가 선화 작가 역할 편집");
    fireEvent.change(screen.getByRole("combobox", { name: "역할 상태" }), { target: { value: "ended" } }); save();
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    const second = configure(execute.mock.calls[1]?.[0]);
    expect(second.parties.find((entry) => entry.id === f.unlinked.id)?.accountUserId).toBeNull();
    expect(second.assignments.find((entry) => entry.id === f.unlinkedRole.id)?.status).toBe("ended");
    expect(second.assignments).toHaveLength(f.aggregate.assignments.length);
  });
  it("저장 전 작품 팀 조회 실패는 입력을 보존하고 실제 execute를 보내지 않는다", async () => {
    const f = fixture(), execute = executor();
    io.team.mockResolvedValueOnce(f.team).mockRejectedValueOnce(new Error("팀 조회 실패")).mockResolvedValue(f.team);
    render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />); await openNew(f); save();
    await waitFor(() => expect(screen.getByRole("button", { name: "공정 역할 저장" }).matches(":disabled")).toBe(false));
    expect(selectValue(screen.getByRole("combobox", { name: "공정 역할", exact: true }))).toBe("colorist");
    expect(execute).not.toHaveBeenCalled(); save(); await waitFor(() => expect(execute).toHaveBeenCalledOnce());
  });
  it("실제 403은 재전송을 막고 최신 권한 확인 뒤에만 같은 입력을 다시 검토한다", async () => {
    const f = fixture(), execute = executor().mockRejectedValue(rejected(403)), refresh = vi.fn(async () => undefined);
    render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} refresh={refresh} />); await openNew(f); save();
    await screen.findByText(/서버가 현재 관리 권한으로/);
    expect(screen.getByRole("button", { name: "공정 역할 저장" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "최신 상태 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "공정 역할 저장" }).matches(":disabled")).toBe(false));
    expect(refresh).toHaveBeenCalledOnce(); expect(execute).toHaveBeenCalledOnce();
    expect(selectValue(screen.getByRole("combobox", { name: "공정 역할", exact: true }))).toBe("colorist");
  });
  it("실제 revision 409는 입력을 보존하며 외부에서 바뀐 역할을 다시 덮지 않는다", async () => {
    const f = fixture(), execute = executor().mockRejectedValue(rejected(409));
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openExisting("선화 담당 선화 작가 역할 편집");
    fireEvent.change(screen.getByRole("combobox", { name: "역할 상태" }), { target: { value: "paused" } }); save();
    await screen.findByText(/서버가 입력 또는 현재 버전/);
    expect(screen.getByRole("button", { name: "공정 역할 저장" }).matches(":disabled")).toBe(false);
    const updated = { ...f.aggregate, revision: f.aggregate.revision + 1,
      assignments: f.aggregate.assignments.map((entry) => entry.id === f.artist.id ? { ...entry, lead: !entry.lead } : entry) };
    view.rerender(<ProductionCollaborationRoleEditor aggregate={updated} canManage execute={execute} />); save();
    await screen.findByText(/선택한 참여자·역할이 다른 변경으로/);
    expect(execute).toHaveBeenCalledOnce();
  });
  it("unknown ACK는 같은 원문을 고정하고 refresh만 하며 새 명령을 만들지 않는다", async () => {
    const f = fixture(), execute = executor().mockRejectedValue(new Error("응답 유실")), refresh = vi.fn(async () => undefined);
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} refresh={refresh} />);
    await openNew(f); save(); await screen.findByText(/저장 응답을 확인하지 못했습니다/);
    const command = configure(execute.mock.calls[0]?.[0]), frozen = canonicalJson(command);
    expect(screen.getByRole("combobox", { name: "연결할 작품 팀 계정" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "원래 저장 상태 확인" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce()); expect(execute).toHaveBeenCalledOnce();
    expect(canonicalJson(configure(execute.mock.calls[0]?.[0]))).toBe(frozen);
    view.rerender(<ProductionCollaborationRoleEditor aggregate={applied(f.aggregate, command)} canManage execute={execute} refresh={refresh} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(execute).toHaveBeenCalledOnce();
  });
  it("wire 이전의 typed 로컬 revision 충돌은 입력을 보존하고 명시 재저장만 허용한다", async () => {
    const f = fixture(), execute = executor().mockRejectedValueOnce(new ProductionCommandRevisionChangedError("현재 버전이 바뀌었습니다."));
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openNew(f); save(); await screen.findByText(/저장 요청을 보내기 전에 프로젝트 버전이 바뀌었습니다/);
    expect(execute).toHaveBeenCalledOnce(); expect(execute.mock.calls[0]?.[2]).toEqual({ expectedRevision: f.aggregate.revision });
    const first = configure(execute.mock.calls[0]?.[0]);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(selectValue(screen.getByRole("combobox", { name: "공정 역할", exact: true }))).toBe("colorist");
    expect(screen.getByRole("button", { name: "공정 역할 저장" }).matches(":disabled")).toBe(false);
    expect(loadProductionCommandRecovery(OWNER, f.aggregate.projectId)).toBeNull();
    const current = { ...f.aggregate, revision: f.aggregate.revision + 1 };
    view.rerender(<ProductionCollaborationRoleEditor aggregate={current} canManage execute={execute} />);
    expect(execute).toHaveBeenCalledOnce(); expect(screen.getByRole("dialog")).toBeTruthy();
    save(); await waitFor(() => expect(execute).toHaveBeenCalledTimes(2));
    expect(execute.mock.calls[1]?.[2]).toEqual({ expectedRevision: current.revision });
    const second = configure(execute.mock.calls[1]?.[0]);
    expect(second.assignments.at(-1)?.id).toBe(first.assignments.at(-1)?.id);
    expect(second.parties.at(-1)?.id).toBe(first.parties.at(-1)?.id);
    expect(screen.getByRole("dialog")).toBeTruthy();
    view.rerender(<ProductionCollaborationRoleEditor aggregate={applied(current, second)} canManage execute={execute} />);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("reload의 같은 actor/project pending이 있으면 원래 session queue의 refresh만 허용한다", async () => {
    const f = fixture(), execute = executor(), refresh = vi.fn(async () => undefined);
    const command: Configure = { type: "configure-collaboration", parties: f.aggregate.parties,
      assignments: f.aggregate.assignments, authorityRules: f.aggregate.authorityRules };
    expect(saveProductionCommandRecovery(OWNER, f.aggregate.projectId, { mutationId: "3f633b40-f8a5-4fac-b294-cd99231e4214",
      expectedRevision: f.aggregate.revision, command, confirmedRevision: null, queuedAt: Date.now() })).toBe(true);
    render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} refresh={refresh} />);
    await screen.findByText(/응답을 확인하지 못한 이전 저장/);
    expect(screen.getByRole("button", { name: "공정 역할 추가" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "원래 저장 상태 확인" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce()); expect(execute).not.toHaveBeenCalled();
    expect(loadProductionCommandRecovery(OWNER, f.aggregate.projectId)?.command).toEqual(command);
    clearProductionCommandRecovery(OWNER, f.aggregate.projectId);
    fireEvent.click(screen.getByRole("button", { name: "원래 저장 상태 확인" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "공정 역할 추가" }).matches(":disabled")).toBe(false));
    expect(execute).not.toHaveBeenCalled();
  });
  it("복구 파일이 없어도 부모 session의 미전송·미확인 원문이 있으면 refresh만 허용한다", async () => {
    const f = fixture(), execute = executor(), refresh = vi.fn(async () => undefined);
    render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} refresh={refresh} hasUnconfirmedCommand />);
    await screen.findByText(/응답을 확인하지 못한 이전 저장/);
    expect(loadProductionCommandRecovery(OWNER, f.aggregate.projectId)).toBeNull();
    expect(screen.getByRole("button", { name: "공정 역할 추가" }).matches(":disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "원래 저장 상태 확인" }));
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    await screen.findByText(/원래 요청의 저장 결과를 아직 확인하지 못했습니다/);
    expect(execute).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "공정 역할 추가" }).matches(":disabled")).toBe(true);
  });
  it("저장 전 계정 조회 중 다른 원문이 미확인이 되면 새 역할 execute를 시작하지 않는다", async () => {
    const f = fixture(), preflight = deferred<StudioTeamSnapshot>(), execute = executor();
    io.team.mockResolvedValueOnce(f.team).mockReturnValueOnce(preflight.promise);
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    await openNew(f); save(); await waitFor(() => expect(io.team).toHaveBeenCalledTimes(2));
    view.rerender(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} hasUnconfirmedCommand />);
    await act(async () => preflight.resolve(f.team));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(selectValue(screen.getByRole("combobox", { name: "공정 역할", exact: true }))).toBe("colorist");
    expect(screen.getByRole("button", { name: "공정 역할 저장" }).matches(":disabled")).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
  it("늦은 이전 팀 조회와 계정 전환 뒤 저장 응답을 새 계정 UI로 넘기지 않는다", async () => {
    const f = fixture(), first = deferred<StudioTeamSnapshot>(), pending = deferred<void>(), execute = executor().mockReturnValue(pending.promise);
    io.team.mockReturnValueOnce(first.promise).mockResolvedValue(f.team);
    const view = render(<ProductionCollaborationRoleEditor aggregate={f.aggregate} canManage execute={execute} />);
    const other = { ...f.aggregate, workId: "different-work" };
    io.team.mockResolvedValue({ ...f.team, workId: other.workId });
    view.rerender(<ProductionCollaborationRoleEditor aggregate={other} canManage execute={execute} />);
    await act(async () => first.resolve(f.team));
    await openNew({ ...f, aggregate: other }); save(); await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    act(() => { io.actor = "next-actor"; ++io.revision; for (const listener of io.listeners) listener(); });
    await act(async () => pending.resolve());
    expect(screen.queryByRole("dialog")).toBeNull();
    await screen.findByRole("alert"); expect(execute).toHaveBeenCalledOnce();
  });
});
