// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { createPortal } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStudioDrawingClarity } from "./StudioDrawingClarityContext";
import { defaultStudioAppSettings } from "../studio-app-settings";
import { createStudioWorkspaceDefaultState, switchStudioWorkspace, updateStudioWorkspaceLiveLayout } from "../studio-workspaces";
import { studioDocumentHref } from "../studio-document-workspace";
import { applyStudioTaskWorkspace } from "../studio-task-workspace";
import { projectStudioTaskAppSettings } from "../studio-task-tools";
import { StudioDrawingClarityProvider, type StudioDrawingClaritySession } from "./StudioDrawingClarity";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function session() {
  const state = createStudioWorkspaceDefaultState(null);
  return {
    currentWorkspaceOwnerScope: "guest", isMobile: false, canvasOnlyMode: false, mobileImmersive: false,
    workspaceState: state, workMode: "all" as const, uiDensityMode: "simple" as const, appSettings: defaultStudioAppSettings(),
    location: { pathname: "/studio/canvas", search: "", hash: "", key: "entry", state: null },
    studioDrawingClarityBaseline: { ownerScope: "guest", source: "default" as const, state },
    studioMenubarContentHandlers: { setStudioUiDensity: vi.fn() },
  };
}

function Probe() {
  const state = useStudioDrawingClarity();
  if (!state) throw new Error("화면 선택 context가 필요합니다.");
  return <>
    <output aria-label="편집기 셸">{state.presentation}</output>
    <output aria-label="화면">{state.active ? "간단" : "기존"}</output>
    <output aria-label="간단 화면 사용 가능">{state.available ? "가능" : "기존 유지"}</output>
    <button onClick={state.chooseSimple}>간단한 그리기</button><button onClick={state.showSavedLayout}>내 배치</button>
    <button onClick={(event) => state.open("layers", event.currentTarget)}>레이어</button>
    <button onClick={(event) => state.reveal("layers", event.currentTarget)}>속성 바로 열기</button>
    <div id="studio-canvas-workspace" tabIndex={-1} aria-label="원고 캔버스" />
    <section id="studio-drawing-clarity-panel-commands" hidden={state.panel !== "commands"}>
      <h2 tabIndex={-1} data-clarity-pane-heading>프로젝트·창 도구</h2>
    </section>
    <section id="studio-drawing-clarity-panel-layers" hidden={state.panel !== "layers"}>
      <h2 tabIndex={-1} data-clarity-pane-heading>레이어·속성</h2><button onClick={state.close}>닫기</button>
    </section>
  </>;
}
function tree<T extends StudioDrawingClaritySession>(value: T) { return <StudioDrawingClarityProvider session={value}><Probe /></StudioDrawingClarityProvider>; }

describe("기본 그리기 화면의 세션 선택과 도구함", () => {
  it.each([
    ["/studio/bg3d", "bg3dOpen"],
    ["/studio/canvas/poser", "poserVrmOpen"],
    ["/studio/character", "characterShaperOpen"],
    ["/studio/animation", "timelineOpen"],
  ] as const)("%s 패널을 닫은 프레임부터 원고 경로가 확정될 때까지 같은 도구를 쓴다", (pathname, panel) => {
    const base = session();
    const specialized = { ...base, isMobile: true, mobileImmersive: true, location: { ...base.location, pathname } };
    const display = (state: StudioDrawingClaritySession) => <StudioDrawingClarityProvider session={state} presentation="app"><Probe /></StudioDrawingClarityProvider>;
    const view = render(display({ ...specialized, [panel]: true }));
    expect(screen.getByLabelText("화면").textContent).toBe("기존");

    view.rerender(display({ ...specialized, [panel]: false }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(screen.getByLabelText("편집기 셸").textContent).toBe("integrated");

    view.rerender(display({ ...specialized, location: base.location, [panel]: false }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(screen.getByLabelText("편집기 셸").textContent).toBe("integrated");
  });

  it.each(["android", "ios"])("Capacitor %s의 웹뷰가 기본 원고를 모바일 웹과 같은 화면으로 연다", (platform) => {
    vi.stubGlobal("Capacitor", { isNativePlatform: () => true, getPlatform: () => platform });
    render(<StudioDrawingClarityProvider session={{ ...session(), isMobile: true, mobileImmersive: true }} presentation="app"><Probe /></StudioDrawingClarityProvider>);
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(screen.getByLabelText("간단 화면 사용 가능").textContent).toBe("가능");
    expect(screen.getByLabelText("편집기 셸").textContent).toBe("integrated");
  });

  it.each(["android", "ios"])("구형 %s 브리지에서도 같은 그리기 도구를 쓸 수 있다", (platform) => {
    vi.stubGlobal("Capacitor", { getPlatform: () => platform });
    render(tree({ ...session(), isMobile: true, mobileImmersive: true }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(screen.getByLabelText("간단 화면 사용 가능").textContent).toBe("가능");
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

  it("원고 첫 프레임부터 같은 편집기를 표시하고 배치 복원 후에도 유지한다", () => {
    const value = session(), view = render(tree({ ...value, studioDrawingClarityBaseline: null }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
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

  it("저장한 배치의 프로젝트·창 도구를 열고 작업을 마치면 원고로 포커스를 돌린다", async () => {
    const value = session();
    if (!value.studioDrawingClarityBaseline) throw new Error("기본 snapshot 누락");
    const saved = { ...value, studioDrawingClarityBaseline: { ...value.studioDrawingClarityBaseline, source: "current" as const } };
    render(tree(saved));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    expect(screen.getByRole("heading", { name: "프로젝트·창 도구" })).toBeTruthy();
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    expect(screen.queryByRole("heading", { name: "프로젝트·창 도구" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("원고 캔버스")));
    expect(saved.studioMenubarContentHandlers.setStudioUiDensity).not.toHaveBeenCalled();
    expect(saved.workspaceState).toBe(value.workspaceState);
    expect(saved.appSettings).toBe(value.appSettings);
  });

  it("저장한 도구 구성과 full·focus·다른 작업 단계를 자동 변경하지 않는다", () => {
    const value = session(), view = render(tree(value));
    const personal = { ...value.appSettings, toolbar: { ...value.appSettings.toolbar, visibleIds: value.appSettings.toolbar.visibleIds.slice(1) } };
    for (const change of [{ uiDensityMode: "full" as const }, { uiDensityMode: "focus" as const }, { workMode: "storyboard" as const }, { appSettings: personal }]) {
      view.rerender(tree({ ...value, ...change }));
      expect(screen.getByLabelText("화면").textContent).toBe("간단");
    }
  });

  it.each(["all", "storyboard", "draw", "color", "post", "lettering", "finish"] as const)("%s 단계에서도 같은 원고 레이어·명령 패널을 조작한다", workMode => {
    render(tree({ ...session(), workMode }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    fireEvent.click(screen.getByRole("button", { name: "레이어" }));
    expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    expect(screen.getByRole("heading", { name: "프로젝트·창 도구" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "레이어·속성" })).toBeNull();
  });

  it("캔버스 전용과 데스크톱 몰입은 도구를 숨기고 해제하면 같은 편집기로 돌아온다", () => {
    const base = session(), view = render(tree(base));
    for (const visibility of [{ canvasOnlyMode: true }, { mobileImmersive: true }]) {
      view.rerender(tree({ ...base, ...visibility }));
      expect(screen.getByLabelText("간단 화면 사용 가능").textContent).toBe("가능");
      expect(screen.getByLabelText("화면").textContent).toBe("기존");
      view.rerender(tree(base));
      expect(screen.getByLabelText("화면").textContent).toBe("간단");
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
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(settings.toolbar).toBe(toolbar);
    expect(toolbar.profiles).toBeUndefined();
  });

  it("프로젝트·창 도구를 열어도 원고 기본 HUD와 자동 안내가 다시 나타나지 않는다", () => {
    const css = readFileSync("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css", "utf8")
      .split("\n").filter((line) => line.includes("data-studio-brush-hud=true]") || line.includes("data-studio-document-window-hub-bar=true]{display:none}") || line.includes("data-studio-quickstart-collapsed=true]") || line.includes("data-studio-shell-floating-target=document-tools]")).join("\n");
    function Surface() {
      const clarity = useStudioDrawingClarity();
      return <div data-studio-editor="true" data-studio-drawing-clarity={clarity?.active ? "true" : undefined}>
        <div data-testid="문서 도구" data-studio-document-window-hub-bar="true">프로젝트·창</div>
        <div data-testid="자동 시작" data-studio-cinematic-canvas-welcome="collapsed">시작 방법 보기</div>
        <div data-testid="자동 사용법" data-studio-creative-starter="true" data-studio-quickstart-collapsed="true">사용법</div>
        <div data-testid="요청한 안내" data-studio-cinematic-canvas-welcome="true">펼친 안내</div>
        <button data-studio-status-error-dismiss="true">저장 오류 확인</button>
        <button data-studio-collaboration-following="true">따라가기 중단</button>
      </div>;
    }
    render(<><style>{css}</style><StudioDrawingClarityProvider session={session()}><Probe /><Surface /></StudioDrawingClarityProvider>
      {createPortal(<div data-testid="포털 HUD" data-studio-brush-hud="true" style={{ display: "grid" }}>브러시</div>, document.body)}
      {createPortal(<><div data-testid="닫힌 문서 도구" data-studio-shell-floating-target="document-tools"><button aria-expanded={false}>문서 도구 열기</button></div>
        <div data-testid="열린 문서 도구" data-studio-shell-floating-target="document-tools"><button aria-expanded={true}>문서 도구 닫기</button></div></>, document.body)}
      <button data-studio-shell-force-visible="true">진행 중 통화</button></>);
    for (const name of ["포털 HUD", "문서 도구", "자동 시작", "자동 사용법", "닫힌 문서 도구"]) expect(getComputedStyle(screen.getByTestId(name)).display).toBe("none");
    expect(getComputedStyle(screen.getByTestId("열린 문서 도구")).display).not.toBe("none");
    expect(getComputedStyle(screen.getByTestId("요청한 안내")).display).not.toBe("none");
    for (const name of ["저장 오류 확인", "따라가기 중단", "진행 중 통화"]) expect(getComputedStyle(screen.getByRole("button", { name })).display).not.toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    for (const name of ["포털 HUD", "문서 도구", "자동 시작", "자동 사용법", "닫힌 문서 도구"]) expect(getComputedStyle(screen.getByTestId(name)).display).toBe("none");
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    expect(getComputedStyle(screen.getByTestId("포털 HUD")).display).toBe("none");
    expect(getComputedStyle(screen.getByTestId("닫힌 문서 도구")).display).toBe("none");
    expect(getComputedStyle(screen.getByTestId("열린 문서 도구")).display).not.toBe("none");
  });

  it("계정 변경 때 이전 세션의 수동 화면·패널 선택을 넘기지 않는다", () => {
    const value = session(), view = render(tree(value));
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    fireEvent.click(screen.getByRole("button", { name: "레이어" }));
    view.rerender(tree({ ...value, currentWorkspaceOwnerScope: "owner-other", studioDrawingClarityBaseline: null }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
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

  it("설치형 앱을 거친 탭도 같은 원고에서 간단한 그리기를 연다", () => {
    render(<StudioDrawingClarityProvider session={session()} presentation="app"><Probe /></StudioDrawingClarityProvider>);
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
  });

  it("다른 브러시 작업공간으로 전환해도 원고는 같은 편집기를 유지한다", () => {
    const value = session(), view = render(tree(value));
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    view.rerender(tree({ ...value, workspaceState: switchStudioWorkspace(value.workspaceState, "coloring") }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
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

  it("저장한 모바일 작업 배치에서도 프로젝트 도구와 원고 포커스를 쓸 수 있다", () => {
    const value = session();
    if (!value.studioDrawingClarityBaseline) throw new Error("초기 배치 누락");
    const saved = { ...value, isMobile: true, mobileImmersive: true, studioDrawingClarityBaseline: { ...value.studioDrawingClarityBaseline, source: "current" as const } };
    render(tree(saved));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    expect(screen.getByLabelText("화면").textContent).toBe("간단");
    expect(saved.workspaceState).toBe(value.workspaceState);
    expect(saved.appSettings).toBe(value.appSettings);
  });

  it("기기 안의 오래된 고전 화면 선택과 저장 배치 표식은 새 원고·새로고침·다른 소유자의 화면을 바꾸지 않는다", () => {
    const choice = "toonstudio:studio-drawing-clarity-choice:v1";
    const known = "toonstudio:studio-drawing-clarity-known-owner:v1";
    const base = session();
    const savedChoice = JSON.stringify({ ["guest:" + base.workspaceState.activeWorkspaceId]: false });
    const savedOwner = JSON.stringify({ guest: "saved" });
    localStorage.setItem(choice, savedChoice); localStorage.setItem(known, savedOwner);
    try {
      for (const owner of ["guest", "actor:second", "guest"]) {
        const view = render(<StudioDrawingClarityProvider session={{ ...base, currentWorkspaceOwnerScope: owner, studioDrawingClarityBaseline: null }} choiceStorage={localStorage}><Probe /></StudioDrawingClarityProvider>);
        expect(screen.getByLabelText("화면").textContent).toBe("간단");
        fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
        expect(screen.getByRole("heading", { name: "프로젝트·창 도구" })).toBeTruthy();
        expect(screen.getByLabelText("편집기 셸").textContent).toBe("integrated");
        view.unmount();
      }
      expect(localStorage.getItem(choice)).toBe(savedChoice);
      expect(localStorage.getItem(known)).toBe(savedOwner);
    } finally { localStorage.removeItem(choice); localStorage.removeItem(known); }
  });

  it("제목 필수 저장(pendingSaveIntent) 전환 시 데스크톱 간단 화면에서 작품 정보·레이어 패널을 자동 열고 내부 입력 포커스와 한글 IME 조합 Escape를 보호한다", () => {
    const base = session();
    function SaveProbe({ pendingSaveIntent }: { pendingSaveIntent: "draft" | "published" | null }) {
      return (
        <StudioDrawingClarityProvider session={{ ...base, pendingSaveIntent }}>
          <button data-studio-clarity-save="true">저장</button>
          <Probe />
          <InputInsideLayers />
        </StudioDrawingClarityProvider>
      );
    }
    function InputInsideLayers() {
      const state = useStudioDrawingClarity();
      if (state?.panel !== "layers") return null;
      return createPortal(
        <input aria-label="작품 제목 (필수)" defaultValue="" />,
        document.getElementById("studio-drawing-clarity-panel-layers") ?? document.body,
      );
    }
    const view = render(<SaveProbe pendingSaveIntent={null} />);
    expect(screen.queryByRole("heading", { name: "레이어·속성" })).toBeNull();

    view.rerender(<SaveProbe pendingSaveIntent="draft" />);
    expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();

    const titleInput = screen.getByRole("textbox", { name: "작품 제목 (필수)" });
    titleInput.focus();
    expect(document.activeElement).toBe(titleInput);

    // 한글 조합 중 Escape는 패널을 닫지 않아야 한다.
    fireEvent.keyDown(titleInput, { key: "Escape", isComposing: true });
    expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();
    fireEvent.keyDown(titleInput, { key: "Escape", keyCode: 229 });
    expect(screen.getByRole("heading", { name: "레이어·속성" })).toBeTruthy();

    // 일반 Escape는 패널을 닫고 저장 버튼으로 포커스를 되돌린다.
    fireEvent.keyDown(titleInput, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "레이어·속성" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "저장" }));
  });

  it("전체 도구 링크에서 원고로 돌아와도 식별자·방·도구·앵커와 탐색 이력을 보존한다", () => {
    const base = session(), navigate = vi.fn();
    const location = { ...base.location, search: "?room=team-a&uiMode=full&startTool=select", hash: "#page", state: { from: "library" } };
    render(tree({ ...base, location, navigate, uiDensityMode: "full" as const }));
    fireEvent.click(screen.getByRole("button", { name: "내 배치" }));
    fireEvent.click(screen.getByRole("button", { name: "간단한 그리기" }));
    expect(navigate).not.toHaveBeenCalled();
    expect(location).toMatchObject({ search: "?room=team-a&uiMode=full&startTool=select", hash: "#page", state: { from: "library" } });
  });

  it.each(["?drawingShell=app","?drawingShell=integrated","?roleWorkspace=review","?roleWorkspace=lineart","?uiMode=full","?uiMode=focus","?uiMode=basic"])("역할·밀도·설치 별칭 %s로 들어와도 원고 패널을 연다", search => {
    const base = session();
    render(tree({ ...base, location: { ...base.location, search } }));
    expect(screen.getByLabelText("편집기 셸").textContent).toBe("integrated");
    fireEvent.click(screen.getByRole("button", { name: "레이어" }));
    expect(screen.getByRole("heading", { name:"레이어·속성" })).toBeTruthy();
  });

  it("간단 화면의 보조 패널과 페이지 스트립은 캔버스 폭·높이를 밀지 않는 절대 위치 오버레이로 배치한다", () => {
    const css = readFileSync("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css", "utf8");
    expect(css).toContain(".studio-drawing-clarity-pane{position:absolute;top:0;bottom:0;z-index:35;");
    expect(css).toContain("[data-studio-drawing-clarity=true][data-studio-drawing-clarity-panel=pages] [data-studio-page-sequence-strip=true]{position:absolute!important;");
  });

  it("T-UX-02 Unslop 계약: 단일 44px 헤더·48px 라벤더 레일을 유지하고 배경 아우라·블러·원시 색·호버 이동 슬롭이 없다", () => {
    const css = readFileSync("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css", "utf8");
    expect(css).not.toContain("scene-studio-canvas-aura.webp");
    expect(css).not.toContain("backdrop-filter");
    expect(css).not.toContain("radial-gradient");
    expect(css).not.toContain("linear-gradient");
    expect(css).not.toContain("translateY(");
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(css).not.toMatch(/\brgba?\s*\(/u);
    expect(css).toContain('[data-studio-editor="true"] button:active:not([data-studio-allow-press-feedback="true"]){transform:none!important}');
    expect(css).toContain("flex:0 0 48px");
    expect(css).toContain("border-inline-start:2px solid var(--color-accent)");
  });
});

describe("원고명 아래 실제 저장 결과와 중요한 안내의 가시성", () => {
  function showStatus(state: "saved" | "failed", notice: string | null, host = true, mobile = false) {
    const css = readFileSync("apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingClarity.css", "utf8");
    const rules = css.split("\n").filter(line => line.startsWith("button[data-studio-drawing-save-summary=true]") || line.startsWith(".studio-drawing-clarity-title") || line.startsWith("[data-studio-connection-notice-summary]"));
    return render(<><style>{rules.join("\n")}</style>
      <header className={`studio-drawing-clarity-header${mobile ? " studio-drawing-clarity-mobile-header" : ""}`}>
        <div className="studio-drawing-clarity-title" data-testid="저장 자리"><h1>나의 원고</h1>
          <div data-studio-save-status-bar="true" data-save-state={state}><span role="status" /></div>
          <button data-studio-drawing-save-summary="true" data-testid="상태 버튼">
            <span data-testid="상태 문구">{state === "saved" ? "이 기기에 저장됨 · 14:30" : "저장 확인 필요"}</span>
            {host ? <span data-studio-connection-notice-summary="true">{notice ? <span role="alert">{notice}</span> : null}</span> : null}
          </button>
        </div>
      </header>
    </>);
  }
  it.each([false, true])("안내의 추가·제거와 무관하게 제목 자리의 44px 높이를 예약한다 (mobile=%s)", mobile => {
    showStatus("saved", null, true, mobile);
    const title = screen.getByTestId("저장 자리");
    const host = screen.getByTestId("상태 버튼").querySelector("[data-studio-connection-notice-summary]");
    if (!(host instanceof HTMLElement)) throw new Error("중요한 안내의 요약 자리가 필요합니다.");
    // JSDOM은 실제 줄바꿈 높이를 재지 않는다. CSS 하한과 표시 계약만 검사한다.
    const expectReservedSpace = () => {
      const style = getComputedStyle(title);
      expect(style.minHeight).toBe("44px");
      expect(style.height).toBe("44px");
      expect(style.maxHeight).toBe("44px");
      expect(style.overflow).toBe("hidden");
    };
    expectReservedSpace();
    for (const notice of ["일부 오프라인 도구 준비 필요", "Some offline tools still need preparation"]) {
      const alert = document.createElement("span");
      alert.setAttribute("role", "alert");
      alert.textContent = notice;
      host.append(alert);
      expectReservedSpace();
      expect(screen.getByRole("alert").textContent).toBe(notice);
      expect(getComputedStyle(host).whiteSpace).toBe("normal");
      expect(screen.getByTestId("상태 문구").textContent).toBe("이 기기에 저장됨 · 14:30");
      alert.remove();
      expectReservedSpace();
    }
  });
  it("정상 저장도 결과와 저장 대상을 직접 읽을 수 있는 44px 진입점으로 유지한다", () => {
    showStatus("saved", null);
    expect(getComputedStyle(screen.getByTestId("상태 버튼")).minHeight).toBe("44px");
    expect(getComputedStyle(screen.getByTestId("상태 버튼")).minWidth).toBe("44px");
    expect(getComputedStyle(screen.getByTestId("상태 문구")).clipPath).not.toBe("inset(50%)");
    expect(screen.getByRole("button", { name: "이 기기에 저장됨 · 14:30" })).toBeTruthy();
  });
  it.each(["온라인 기능 제한", "오프라인 도구 준비 실패", "저장 공간 95% · 백업 필요"])("저장 완료여도 %s 안내를 잘라내거나 결과 아래에서 숨기지 않는다", notice => {
    for (const mobile of [false, true]) {
      const view = showStatus("saved", notice, true, mobile), alert = screen.getByRole("alert");
      expect(alert.textContent).toBe(notice);
      expect(getComputedStyle(alert.parentElement!).clipPath).not.toBe("inset(50%)");
      expect(getComputedStyle(screen.getByTestId("상태 버튼")).minHeight).toBe("44px");
      expect(screen.getByTestId("저장 자리").querySelector("h1")?.textContent).toBe("나의 원고");
      expect(screen.getByRole("button").textContent).toContain(notice); view.unmount();
    }
  });
  it("요약 host가 없어도 실패 또는 완료 문구와 저장 상세 진입을 가리지 않는다", () => {
    for (const state of ["saved", "failed"] as const) {
      const view = showStatus(state, null, false);
      expect(screen.getByRole("button").textContent).toContain(state === "failed" ? "저장 확인 필요" : "이 기기에 저장됨");
      expect(getComputedStyle(screen.getByTestId("상태 문구")).clipPath).not.toBe("inset(50%)"); view.unmount();
    }
  });

  it("데스크톱 간단 화면에서 제목 미입력으로 초안 저장 보류(pendingSaveIntent)가 시작되면 속성 패널을 자동 노출하고 제목 입력 포커스를 보존한다", () => {
    function SaveMetadataProbe({ intent }: { readonly intent: "draft" | "published" | null }) {
      const clarity = useStudioDrawingClarity();
      if (!clarity) throw new Error("화면 선택 context가 필요합니다.");
      return <>
        <button type="button" data-studio-clarity-save="true">저장</button>
        <section id="studio-drawing-clarity-panel-layers" hidden={clarity.panel !== "layers"}>
          <h2 tabIndex={-1} data-clarity-pane-heading>레이어·속성</h2>
          <input aria-label="작품 제목 (필수)" placeholder="작품 제목" data-save-intent={intent ?? undefined} />
        </section>
      </>;
    }
    const base = { ...session(), pendingSaveIntent: null };
    const view = render(
      <StudioDrawingClarityProvider session={base}>
        <SaveMetadataProbe intent={null} />
      </StudioDrawingClarityProvider>,
    );
    expect(document.getElementById("studio-drawing-clarity-panel-layers")?.hasAttribute("hidden")).toBe(true);

    view.rerender(
      <StudioDrawingClarityProvider session={{ ...base, pendingSaveIntent: "draft" }}>
        <SaveMetadataProbe intent="draft" />
      </StudioDrawingClarityProvider>,
    );
    const pane = document.getElementById("studio-drawing-clarity-panel-layers");
    expect(pane?.hasAttribute("hidden")).toBe(false);
    const titleInput = screen.getByLabelText("작품 제목 (필수)");
    titleInput.focus();
    expect(document.activeElement).toBe(titleInput);

    // 지연된 계정 작업공간 복원(owner 전환)이 뒤늦게 완료되어도 제목 입력 중이던 속성 패널이 닫히지 않아야 한다.
    const hydratedOwner = "user:owner-1";
    view.rerender(
      <StudioDrawingClarityProvider session={{
        ...base,
        currentWorkspaceOwnerScope: hydratedOwner,
        pendingSaveIntent: "draft",
      }}>
        <SaveMetadataProbe intent="draft" />
      </StudioDrawingClarityProvider>,
    );
    expect(pane?.hasAttribute("hidden")).toBe(false);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(pane?.hasAttribute("hidden")).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "저장" }));
  });

  it("패널 헤딩이 비동기로 마운트되기 전에 사용자가 다른 영역(건너뛰기 링크 등)으로 포커스를 옮기면 포커스를 빼앗지 않는다", async () => {
    function DeferredPaneProbe({ mountHeading }: { readonly mountHeading: boolean }) {
      const clarity = useStudioDrawingClarity();
      if (!clarity) throw new Error("화면 선택 context가 필요합니다.");
      return (
        <>
          <button type="button" data-testid="skip-target">문서 메뉴로 이동</button>
          <button
            type="button"
            data-testid="layer-opener"
            onClick={(event) => clarity.open("layers", event.currentTarget)}
          >
            레이어
          </button>
          <section id="studio-drawing-clarity-panel-layers" hidden={clarity.panel !== "layers"}>
            {mountHeading ? <h2 tabIndex={-1} data-clarity-pane-heading>레이어·속성</h2> : null}
          </section>
        </>
      );
    }
    const base = session();
    const view = render(
      <StudioDrawingClarityProvider session={base}>
        <DeferredPaneProbe mountHeading={false} />
      </StudioDrawingClarityProvider>,
    );
    const opener = screen.getByTestId("layer-opener");
    opener.focus();
    fireEvent.click(opener);
    const skipTarget = screen.getByTestId("skip-target");
    skipTarget.focus();
    expect(document.activeElement).toBe(skipTarget);

    view.rerender(
      <StudioDrawingClarityProvider session={base}>
        <DeferredPaneProbe mountHeading />
      </StudioDrawingClarityProvider>,
    );
    await Promise.resolve();
    expect(document.activeElement).toBe(skipTarget);
  });
});
