// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioScene3dCutPanel } from "./StudioScene3dCutPanel";
import { StudioScene3dCutSession, type StudioScene3dCutHost } from "./studio-scene3d-cut-session";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { parseStudioScene3dCutSource } from "./studio-scene3d-shot-versions";
import { StudioWebAuthoringProjectV3Repository } from "../studio-web-runtime/studio-web-authoring-project-v3-repository";

const resetOwnership = vi.hoisted(() => vi.fn<() => Promise<boolean>>());
vi.mock("../studio-local-database-runtime", () => ({ resetFailedStudioLocalDatabaseOwnership: resetOwnership }));
beforeEach(() => { resetOwnership.mockReset().mockResolvedValue(false); });
const sessions: StudioScene3dCutSession[] = [];
afterEach(() => { cleanup(); sessions.splice(0).forEach((session) => session.dispose()); vi.restoreAllMocks(); });
async function fixture() {
  const rows = new Map<string, string>(), projectId = "project:mobile-cut-presentation";
  const source = parseStudioScene3dCutSource({ scene: createStudioScene3dDocument(projectId, "2026-10-29T00:00:00.000Z"), characters: {} });
  const applySource = vi.fn<StudioScene3dCutHost["applySource"]>(() => undefined);
  const host: StudioScene3dCutHost = { projectId, readSource: () => source, blockedReason: () => null, applySource };
  const store = { get: async (key: string) => rows.get(key) ?? null, set: async (key: string, raw: string) => { rows.set(key, raw); }, delete: async (key: string) => { rows.delete(key); } };
  const repository = new StudioWebAuthoringProjectV3Repository({ storeFactory: async () => store,
    lockProvider: { request: async (_name, _options, operation) => operation() } });
  const session = new StudioScene3dCutSession(host, repository); sessions.push(session); await session.restore();
  return { session, source, applySource, rows, repository, host };
}
function details(): HTMLDetailsElement { const element = screen.getByTestId("scene3d-cut-panel"); if (!(element instanceof HTMLDetailsElement)) throw Error("native details 필요"); return element; }
function summary(): HTMLElement { const element = details().querySelector("summary"); if (!(element instanceof HTMLElement)) throw Error("summary 필요"); return element; }
function toggleEvent(): void { fireEvent(details(), new Event("toggle")); }
async function activate(detail: number): Promise<void> {
  const before = details().open;
  fireEvent.click(summary(), { detail });
  await waitFor(() => expect(details().open).toBe(!before));
  // native toggle 이벤트의 비동기 전달 뒤 local 선택이 고정됐는지도 확인한다.
  toggleEvent();
}

describe("컷 패널의 responsive preference와 native 사용자 선택", () => {
  const ownershipError = "studio local sqlite unavailable: DedicatedWorker ownership lock failed: Studio OPFS SQLite is already owned by another page";
  function expectRecoverableOwnershipError(): HTMLDetailsElement {
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("이 기기의 저장소를 사용할 수 없어요");
    expect(alert.textContent).not.toContain("DedicatedWorker");
    expect(screen.queryByText("로컬 컷 프로젝트를 저장했습니다.")).toBeNull();
    const diagnostic = screen.getByTestId("scene3d-cut-error-details");
    if (!(diagnostic instanceof HTMLDetailsElement)) throw Error("접힌 오류 상세 필요");
    expect(diagnostic.open).toBe(false);
    expect(diagnostic.textContent).toContain(ownershipError);
    return diagnostic;
  }
  it("저장 잠금 실패는 입력과 미저장 컷을 보존하고 실제 재시도 성공 뒤에만 저장됨을 알린다", async () => {
    const f = await fixture(); render(<StudioScene3dCutPanel session={f.session} />);
    const name = screen.getByLabelText("컷 이름");
    if (!(name instanceof HTMLInputElement)) throw Error("컷 이름 입력 필요");
    fireEvent.change(name, { target: { value: "작성 중인 이름" } });
    act(() => f.session.capture("보존할 컷"));
    vi.spyOn(f.repository, "save").mockRejectedValueOnce(new Error(ownershipError));
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장" }));
    await waitFor(() => expect(f.session.read().phase).toBe("error"));
    const diagnostic = expectRecoverableOwnershipError();
    expect(f.session.read().dirty).toBe(true); expect(f.rows.size).toBe(0);
    expect(name.value).toBe("작성 중인 이름");
    expect(screen.getByTestId("scene3d-cut-summary-state").textContent).toContain("저장하지 않은 변경");
    fireEvent.click(screen.getByText("문제 해결 정보")); expect(diagnostic.open).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장" }));
    await waitFor(() => expect(screen.getByText("로컬 컷 프로젝트를 저장했습니다.")).toBeDefined());
    expect(f.session.read().dirty).toBe(false); expect(f.rows.size).toBeGreaterThan(0);
    expect(name.value).toBe("작성 중인 이름");
    expect(screen.queryByTestId("scene3d-cut-error-details")).toBeNull();
    expect(resetOwnership).toHaveBeenCalledOnce();
  });
  it("재진입 불러오기 잠금 실패는 저장 성공을 가장하지 않고 기존 다시 불러오기로 복원한다", async () => {
    const f = await fixture(); f.session.capture("저장한 컷"); await f.session.save(); f.session.dispose();
    const savedRows = [...f.rows.entries()];
    const reopened = new StudioScene3dCutSession(f.host, f.repository); sessions.push(reopened);
    vi.spyOn(f.repository, "load").mockRejectedValueOnce(new Error(ownershipError));
    render(<StudioScene3dCutPanel session={reopened} />);
    await waitFor(() => expect(reopened.read().phase).toBe("error"));
    expectRecoverableOwnershipError(); expect(reopened.read().project).toBeNull();
    const save = screen.getByRole("button", { name: "로컬 저장" });
    if (!(save instanceof HTMLButtonElement)) throw Error("로컬 저장 버튼 필요");
    expect(save.disabled).toBe(true); expect([...f.rows.entries()]).toEqual(savedRows);
    fireEvent.click(screen.getByRole("button", { name: "로컬 다시 불러오기" }));
    await waitFor(() => expect(screen.getByText("저장한 컷과 원본을 복원했습니다.")).toBeDefined());
    expect(screen.getByTestId("scene3d-cut-summary-state").textContent).toContain("고정한 컷 1");
    expect(screen.queryByTestId("scene3d-cut-error-details")).toBeNull();
    expect([...f.rows.entries()]).toEqual(savedRows);
    expect(resetOwnership).toHaveBeenCalledOnce();
  });
  it("명시 복원 재시도의 빠른 두 번 클릭은 한 번만 연결을 재확인하고 불러온다", async () => {
    const f = await fixture(); f.session.capture("저장한 컷"); await f.session.save(); f.session.dispose();
    const reopened = new StudioScene3dCutSession(f.host, f.repository); sessions.push(reopened);
    const load = vi.spyOn(f.repository, "load").mockRejectedValueOnce(new Error(ownershipError));
    render(<StudioScene3dCutPanel session={reopened} />);
    await waitFor(() => expect(reopened.read().phase).toBe("error"));
    let finishReset: (value: boolean) => void = () => { throw Error("재시도 대기 필요"); };
    resetOwnership.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishReset = resolve; }));
    const retry = screen.getByRole("button", { name: "로컬 다시 불러오기" });
    fireEvent.click(retry); fireEvent.click(retry);
    await waitFor(() => expect(resetOwnership).toHaveBeenCalledOnce());
    expect(load).toHaveBeenCalledOnce();
    expect(retry).toHaveProperty("disabled", true);
    await act(async () => { finishReset(true); });
    await waitFor(() => expect(reopened.read().phase).toBe("ready"));
    expect(load).toHaveBeenCalledTimes(2);
    expect(reopened.read().project?.shotVersions?.cuts).toHaveLength(1);
    expect(resetOwnership).toHaveBeenCalledOnce();
  });
  it("소유권 오류의 미저장 컷은 불러오기로 덮지 않고 저장 재시도 중 입력까지 보존한다", async () => {
    const f = await fixture(); render(<StudioScene3dCutPanel session={f.session} />);
    const name = screen.getByLabelText("컷 이름"), json = screen.getByLabelText("프로젝트 JSON");
    fireEvent.change(name, { target: { value: "다음 컷 입력" } });
    fireEvent.change(json, { target: { value: "입력 중인 JSON" } });
    act(() => f.session.capture("미저장 원본 컷"));
    const unsaved = f.session.read().project;
    const save = vi.spyOn(f.repository, "save").mockRejectedValueOnce(new Error(ownershipError));
    const load = vi.spyOn(f.repository, "load");
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장" }));
    await waitFor(() => expect(f.session.read().phase).toBe("error"));
    const reload = screen.getByRole("button", { name: "로컬 다시 불러오기" });
    expect(reload).toHaveProperty("disabled", true); fireEvent.click(reload);
    expect(load).not.toHaveBeenCalled(); expect(resetOwnership).not.toHaveBeenCalled();
    expect(screen.getByText(/저장하지 않은 컷을 유지하고 있어요/)).toBeDefined();
    resetOwnership.mockRejectedValueOnce(new Error(ownershipError));
    fireEvent.click(screen.getByRole("button", { name: "로컬 저장" }));
    await waitFor(() => expect(resetOwnership).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole("button", { name: "로컬 저장" })).toHaveProperty("disabled", false));
    expectRecoverableOwnershipError(); expect(f.session.read().project).toBe(unsaved);
    expect(f.session.read().dirty).toBe(true); expect(save).toHaveBeenCalledOnce();
    expect(name).toHaveProperty("value", "다음 컷 입력"); expect(json).toHaveProperty("value", "입력 중인 JSON");
    let finishReset: (value: boolean) => void = () => { throw Error("재시도 대기 필요"); };
    resetOwnership.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishReset = resolve; }));
    const saveButton = screen.getByRole("button", { name: "로컬 저장" });
    fireEvent.click(saveButton); fireEvent.click(saveButton);
    await waitFor(() => expect(resetOwnership).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenCalledOnce();
    await act(async () => { finishReset(true); });
    await waitFor(() => expect(f.session.read().dirty).toBe(false));
    expect(save).toHaveBeenCalledTimes(2); expect(load).not.toHaveBeenCalled();
    expect(f.session.read().project?.shotVersions?.cuts).toEqual(unsaved?.shotVersions?.cuts);
    expect(name).toHaveProperty("value", "다음 컷 입력"); expect(json).toHaveProperty("value", "입력 중인 JSON");
    expect(screen.getByText("로컬 컷 프로젝트를 저장했습니다.")).toBeDefined();
  });
  it("실제 소유권이 해소되지 않으면 명시 재시도 뒤에도 오류이며 저장본을 비우지 않는다", async () => {
    const f = await fixture(); f.session.capture("저장한 컷"); await f.session.save(); f.session.dispose();
    const savedRows = [...f.rows.entries()];
    const reopened = new StudioScene3dCutSession(f.host, f.repository); sessions.push(reopened);
    const load = vi.spyOn(f.repository, "load").mockRejectedValue(new Error(ownershipError));
    render(<StudioScene3dCutPanel session={reopened} />);
    await waitFor(() => expect(reopened.read().phase).toBe("error"));
    fireEvent.click(screen.getByRole("button", { name: "로컬 다시 불러오기" }));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(reopened.read().phase).toBe("error"));
    expectRecoverableOwnershipError(); expect(resetOwnership).toHaveBeenCalledOnce();
    expect([...f.rows.entries()]).toEqual(savedRows);
    expect(screen.getByRole("button", { name: "로컬 저장" })).toHaveProperty("disabled", true);
  });
  it("다른 오류의 기존 복원 경로에는 소유권 재시도를 끼워 넣지 않는다", async () => {
    const f = await fixture(); render(<StudioScene3dCutPanel session={f.session} />);
    act(() => { f.session.capture("기존 계약 컷"); f.session.run(() => { throw Error("revision-conflict"); }); });
    const load = vi.spyOn(f.repository, "load");
    const reload = screen.getByRole("button", { name: "로컬 다시 불러오기" });
    expect(reload).toHaveProperty("disabled", false); fireEvent.click(reload);
    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(resetOwnership).not.toHaveBeenCalled();
  });
  it("새 prop이 없는 다른 소비자는 기존 open/native toggle을 유지한다", async () => {
    const f = await fixture(), rendered = render(<StudioScene3dCutPanel session={f.session} />);
    const name = screen.getByLabelText("컷 이름"); if (!(name instanceof HTMLInputElement)) throw Error("컷 이름 입력 필요");
    fireEvent.change(name, { target: { value: "작성 중인 이름" } });
    expect(details().open).toBe(true); await activate(1); expect(details().open).toBe(false);
    act(() => f.session.capture("공통 소비자 컷")); rendered.rerender(<StudioScene3dCutPanel session={f.session} />);
    expect(name.value).toBe("작성 중인 이름");
    expect(details().open).toBe(false); expect(f.applySource).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
  });
  it("사용자 activation 없이 preference로 난 toggle은 선택을 고정하지 않는다", async () => {
    const f = await fixture(), rendered = render(<StudioScene3dCutPanel session={f.session} preferredExpanded />);
    expect(details().open).toBe(true); toggleEvent();
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />);
    expect(details().open).toBe(false); toggleEvent();
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded />);
    expect(details().open).toBe(true); toggleEvent();
    expect(f.applySource).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
  });
  it("모바일에서 pointer로 연 선택을 rerender·resize 뒤에도 유지한다", async () => {
    const f = await fixture(), rendered = render(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />);
    expect(details().open).toBe(false); fireEvent.pointerDown(summary()); fireEvent.pointerUp(summary()); await activate(1);
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded />); toggleEvent();
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />); toggleEvent();
    expect(details().open).toBe(true);
    act(() => f.session.capture("모바일 컷")); expect(details().open).toBe(true);
    expect(f.applySource).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
  });
  it("사용자 클릭 직후 toggle 전달 전에 화면 크기가 두 번 바뀌어도 선택을 보존한다", async () => {
    const f = await fixture(), rendered = render(<StudioScene3dCutPanel session={f.session} preferredExpanded />);
    fireEvent.click(summary());
    expect(details().open).toBe(false);
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />);
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded />);
    toggleEvent();
    expect(details().open).toBe(false);
    expect(f.applySource).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
  });
  it("빠른 두 번 클릭이 같은 toggle task로 합쳐져도 마지막 사용자 선택을 보존한다", async () => {
    const f = await fixture(), rendered = render(<StudioScene3dCutPanel session={f.session} preferredExpanded />);
    fireEvent.click(summary()); fireEvent.click(summary()); toggleEvent();
    expect(details().open).toBe(true);
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />); toggleEvent();
    expect(details().open).toBe(true);
    expect(f.applySource).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
  });
  it.each(["Enter", " "])("%s의 native activation click 뒤 닫은 선택은 desktop preference가 덮지 않는다", async (key) => {
    const f = await fixture(), rendered = render(<StudioScene3dCutPanel session={f.session} preferredExpanded />);
    summary().focus(); fireEvent.keyDown(summary(), { key }); fireEvent.keyUp(summary(), { key });
    // jsdom은 Enter/Space의 UA activation을 실행하지 않아 그때 생성되는 detail0 click만 전달한다.
    // 실제 브라우저 Enter/Space·focus·scroll 가시성은 별도 확인해야 한다.
    await activate(0); expect(details().open).toBe(false);
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />); toggleEvent();
    rendered.rerender(<StudioScene3dCutPanel session={f.session} preferredExpanded />); toggleEvent();
    expect(details().open).toBe(false); expect(document.activeElement).toBe(summary());
  });
  it("접힌 summary에 실제 컷 수·dirty·오류를 보존하고 접기만으로 장면/저장소를 바꾸지 않는다", async () => {
    const f = await fixture(); render(<StudioScene3dCutPanel session={f.session} preferredExpanded={false} />);
    const initialSource = JSON.stringify(f.source);
    act(() => f.session.capture("보존할 컷"));
    expect(screen.getByTestId("scene3d-cut-summary-state").textContent).toContain("고정한 컷 1");
    expect(screen.getByTestId("scene3d-cut-summary-state").textContent).toContain("저장하지 않은 변경");
    expect(screen.getByTestId("scene3d-cut-summary-state").getAttribute("aria-live")).toBe("polite");
    act(() => f.session.run(() => { throw Error("시험 오류"); }));
    expect(screen.getByTestId("scene3d-cut-summary-state").textContent).toContain("확인 필요");
    expect(details().open).toBe(false); expect(JSON.stringify(f.source)).toBe(initialSource);
    expect(f.applySource).not.toHaveBeenCalled(); expect(f.rows.size).toBe(0);
  });
});
