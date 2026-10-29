// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioScene3dCutPanel } from "./StudioScene3dCutPanel";
import { StudioScene3dCutSession, type StudioScene3dCutHost } from "./studio-scene3d-cut-session";
import { createStudioScene3dDocument } from "./studio-scene3d-document";
import { parseStudioScene3dCutSource } from "./studio-scene3d-shot-versions";
import { StudioWebAuthoringProjectV3Repository } from "../studio-web-runtime/studio-web-authoring-project-v3-repository";

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
  return { session, source, applySource, rows };
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
