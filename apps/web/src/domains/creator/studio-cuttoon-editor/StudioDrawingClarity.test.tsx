// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { createStudioWorkspaceDefaultState, switchStudioWorkspace, updateStudioWorkspaceLiveLayout } from "../studio-workspaces";
import { studioDocumentHref } from "../studio-document-workspace";
import { applyStudioTaskWorkspace } from "../studio-task-workspace";
import { projectStudioTaskAppSettings } from "../studio-task-tools";
import { StudioDrawingClarityProvider, type StudioDrawingClaritySession } from "./StudioDrawingClarity";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function session(): StudioDrawingClaritySession {
  const state = createStudioWorkspaceDefaultState(null);
  return {
    currentWorkspaceOwnerScope: "guest", isMobile: false, canvasOnlyMode: false, mobileImmersive: false,
    workspaceState: state, workMode: "all", uiDensityMode: "simple", appSettings: defaultStudioAppSettings(),
    location: { pathname: "/studio/canvas", search: "", hash: "", key: "entry", state: null },
    studioDrawingClarityBaseline: { ownerScope: "guest", source: "default", state },
    studioMenubarContentHandlers: { setStudioUiDensity: vi.fn() },
  };
}

function Probe() {
  const state = useStudioDrawingClarity();
  if (!state) throw new Error("화면 선택 context가 필요합니다.");
  return <>
    <output aria-label="화면">{state.active ? "간단" : "기존"}</output>
    <output aria-label="간단 화면 사용 가능">{state.available ? "가능" : "기존 유지"}</output>
    <button onClick={state.chooseSimple}>간단한 그리기</button><button onClick={state.showSavedLayout}>내 배치</button>
    <button onClick={(event) => state.open("layers", event.currentTarget)}>레이어</button>
    <button onClick={(event) => state.reveal("layers", event.currentTarget)}>속성 바로 열기</button>
    <section id="studio-drawing-clarity-panel-layers" hidden={state.panel !== "layers"}>
      <h2 tabIndex={-1} data-clarity-pane-heading>레이어·속성</h2><button onClick={state.close}>닫기</button>
    </section>
  </>;
}
function tree(value: StudioDrawingClaritySession) { return <StudioDrawingClarityProvider session={value}><Probe /></StudioDrawingClarityProvider>; }

describe("기본 그리기 화면의 세션 선택과 도구함", () => {
  it.each(["android", "ios"])("Capacitor %s의 정본 네이티브 신호에서는 기존 화면을 유지한다", (platform) => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => platform });
    render(tree({ ...session(), isMobile: true, mobileImmersive: true }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    expect(screen.getByLabelText("간단 화면 사용 가능").textContent).toBe("기존 유지");
  });

  it.each(["android", "ios"])("구형 브리지의 getPlatform %s 신호도 네이티브로 보존한다", (platform) => {
    vi.stubGlobal("Capacitor", { getPlatform: () => platform });
    render(tree({ ...session(), isMobile: true, mobileImmersive: true }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    expect(screen.getByLabelText("간단 화면 사용 가능").textContent).toBe("기존 유지");
  });

  it.each([
    undefined,
    { isNativePlatform: () => false },
    { getPlatform: () => "web" },
  ])("브리지 없음 또는 명시적 웹 신호는 모바일 기본 화면을 유지한다", (bridge) => {
    vi.stubGlobal("Capacitor", bridge);
    render(tree({ ...session(), isMobile: true, mobileImmersive: true }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(screen.getByLabelText("간단 화면 사용 가능").textContent).toBe("가능");
  });

  it("초기 복원이 불명인 동안 기존 배치를 유지하고 확인된 기본 배치에서만 간소화한다", () => {
    const value = session(), view = render(tree({ ...value, studioDrawingClarityBaseline: null }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    view.rerender(tree(value));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
  });

  it("패널 변경 뒤 동일한 초기 snapshot을 쓰는 재렌더가 화면 선택을 바꾸지 않는다", () => {
    const value = session(), snapshot = value.studioDrawingClarityBaseline, view = render(tree(value));
    fireEvent.click(screen.getByRole("button", { name: "레이어" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "레이어·속성" }));
    const changed = updateStudioWorkspaceLiveLayout(value.workspaceState, {
      ...value.workspaceState.liveLayout, desktop: { ...value.workspaceState.liveLayout.desktop, rightPanelOpen: false },
    });
    view.rerender(tree({ ...value, workspaceState: changed }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();
    expect(value.studioDrawingClarityBaseline).toBe(snapshot);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "레이어·속성" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "레이어" }));
  });

  it("저장된 배치는 기본 보존하며 사용자가 명시 선택한 화면만 바꾼다", () => {
    const value = session();
    if (!value.studioDrawingClarityBaseline) throw new Error("기본 snapshot 누락");
    const saved = { ...value, studioDrawingClarityBaseline: { ...value.studioDrawingClarityBaseline, source: "current" as const } };
    render(tree(saved));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(saved.studioMenubarContentHandlers.setStudioUiDensity).toHaveBeenCalledWith("simple");
    expect(saved.workspaceState).toBe(value.workspaceState);
    expect(saved.appSettings).toBe(value.appSettings);
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
  });

  it("저장한 도구 구성과 full·focus·다른 작업 단계를 자동 변경하지 않는다", () => {
    const value = session(), view = render(tree(value));
    const personal = { ...value.appSettings, toolbar: { ...value.appSettings.toolbar, visibleIds: value.appSettings.toolbar.visibleIds.slice(1) } };
    for (const change of [{ uiDensityMode: "full" as const }, { uiDensityMode: "focus" as const }, { workMode: "storyboard" as const }, { appSettings: personal }]) {
      view.rerender(tree({ ...value, ...change }));
      expect(screen.getByLabelText("화면").textContent).toBe("기존");
    }
  });

  it("선택 항목인 도구 프로필이 없어도 열리고 실제 개인 프로필은 보존한다", () => {
    const value = session(), toolbar = { ...value.appSettings.toolbar };
    delete toolbar.profiles;
    delete toolbar.activeProfileId;
    const settings = { ...value.appSettings, toolbar }, view = render(tree({ ...value, appSettings: settings }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    const profiles = [{ id: "personal", name: "내 도구", view: "single" as const, visibleIds: [...toolbar.visibleIds] }];
    view.rerender(tree({ ...value, appSettings: { ...settings, toolbar: { ...toolbar, profiles } } }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    expect(settings.toolbar).toBe(toolbar);
    expect(toolbar.profiles).toBeUndefined();
  });

  it("계정 변경 때 이전 세션의 수동 화면·패널 선택을 넘기지 않는다", () => {
    const value = session(), view = render(tree(value));
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: "레이어" }));
    view.rerender(tree({ ...value, currentWorkspaceOwnerScope: "owner-other", studioDrawingClarityBaseline: null }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    expect(screen.queryByRole("heading", { name: "레이어·속성" })).toBeNull();
  });

  it("정본 comic/basic의 추천 도구를 개인 설정으로 오판하지 않고 프로젝트·원고 URL을 유지한다", () => {
    const value = session(), state = applyStudioTaskWorkspace(value.workspaceState, "pro-comic");
    const href = new URL(studioDocumentHref({ projectId: "project-one", documentId: "document-one", workspace: "comic", search: "uiMode=basic&startTool=draw" }), "https://example.test");
    const location = { ...value.location, pathname: href.pathname, search: href.search };
    const canonical = { ...value, location, workspaceState: state, appSettings: projectStudioTaskAppSettings(value.appSettings, "comic", "simple"),
      studioDrawingClarityBaseline: { ownerScope: "guest", source: "default" as const, state } };
    render(tree(canonical));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(canonical.location).toBe(location);
    expect(location.search).toContain("uiMode=basic");
    expect(location.search).toContain("startTool=draw");
  });

  it("탭에 기억된 드로잉 app 화면에는 추가 기본 헤더를 겹쳐 넣지 않는다", () => {
    render(<StudioDrawingClarityProvider session={session()} presentation="app"><Probe /></StudioDrawingClarityProvider>);
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
  });

  it("이후 명시적으로 고른 다른 작업 배치를 이전 간단 화면 선택으로 덮지 않는다", () => {
    const value = session(), view = render(tree(value));
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    view.rerender(tree({ ...value, workspaceState: switchStudioWorkspace(value.workspaceState, "coloring") }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
  });

  it("검색의 명시적인 패널 열기는 이미 열린 패널을 다시 접지 않는다", () => {
    render(tree(session()));
    const trigger = screen.getByRole("button", { name: "속성 바로 열기" });
    fireEvent.click(trigger); fireEvent.click(trigger);
    expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(trigger);
  });

  it("검색 뒤 열린 비모달 출력창의 Escape를 하위 작업 패널이 먼저 소비하지 않는다", () => {
    render(tree(session()));
    fireEvent.click(screen.getByRole("button", { name: "레이어" }));
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "false");
    const rect = new DOMRect(0, 0, 200, 200), rects = Object.assign([rect], { item: (index: number) => index === 0 ? rect : null });
    const geometry = vi.spyOn(dialog, "getClientRects").mockReturnValue(rects);
    document.body.append(dialog);
    try {
      fireEvent.keyDown(dialog, { key: "Escape" });
      expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();
      dialog.remove(); fireEvent.keyDown(document, { key: "Escape" });
      expect(screen.queryByRole("heading", { name: "레이어·속성" })).toBeNull();
    } finally { geometry.mockRestore(); dialog.remove(); }
  });

  it("웹 모바일의 기본 몰입 선호에서도 simple 진입은 간결한 상단을 사용한다", () => {
    const value = { ...session(), isMobile: true, mobileImmersive: true };
    render(tree(value));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(value.mobileImmersive).toBe(true);
  });

  it("저장된 모바일 배치는 보존하면서 명시 전환과 기존 배치 복귀를 허용한다", () => {
    const value = session();
    if (!value.studioDrawingClarityBaseline) throw new Error("초기 배치 누락");
    const saved = { ...value, isMobile: true, mobileImmersive: true, studioDrawingClarityBaseline: { ...value.studioDrawingClarityBaseline, source: "current" as const } };
    render(tree(saved));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");
    expect(saved.workspaceState).toBe(value.workspaceState);
    expect(saved.appSettings).toBe(value.appSettings);
  });
});
