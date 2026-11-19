// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import StudioTeamVrmCutEditorGate from "./StudioTeamVrmCutEditorGate";
import { TeamVrmCutAccessError } from "./studio-team-vrm-cut-client";

const { read, recheck } = vi.hoisted(() => ({ read: vi.fn(), recheck: vi.fn() }));
vi.mock("./studio-team-vrm-cut-client", () => ({
  readTeamVrmCut: read,
  readTeamVrmCutReceipt: recheck,
  TeamVrmCutAccessError: class extends Error {},
}));
function Editor() { return <input aria-label="컷 이름" defaultValue="첫 컷" />; }
const open = (authorized = true) => <StudioTeamVrmCutEditorGate workId="work" pageId="page" anchorId="anchor"
  authorized={authorized} editor={<Editor />} />;

beforeEach(() => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  read.mockResolvedValue({ scene: {}, sceneSha256: "original", resources: { paints: new Map(), blobs: new Map() } });
  recheck.mockResolvedValue({ sceneSha256: "original" });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe("팀 VRM 컷을 다시 열 때의 권한", () => {
  it("팀 원본을 연 렌더러까지 실제 닫힘 상태와 정리 콜백이 전달된다", async () => {
    const cleanupGpu = vi.fn();
    function Renderer({ open = true, onWebXrCleanupPendingChange }: { open?: boolean; onWebXrCleanupPendingChange?: (pending: boolean) => void }) {
      useLayoutEffect(() => {
        if (!open) onWebXrCleanupPendingChange?.(false);
      }, [open, onWebXrCleanupPendingChange]);
      return open ? <div role="dialog" aria-label="작품 3D" /> : null;
    }
    const source = <Renderer open />;
    const gate = (visible: boolean) => <StudioTeamVrmCutEditorGate workId="work" pageId="page" anchorId="anchor" authorized
      open={visible} onWebXrCleanupPendingChange={cleanupGpu} editor={source} />;
    const ui = render(gate(true));
    await screen.findByRole("dialog", { name: "작품 3D" });
    ui.rerender(gate(false));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(cleanupGpu).toHaveBeenCalledWith(false);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it("원본 로딩을 기다리는 동안 원고로 돌아가면 GPU 정리를 즉시 마친다", () => {
    const released = vi.fn();
    read.mockImplementation(() => new Promise(() => {}));
    const gate = (visible: boolean) => <StudioTeamVrmCutEditorGate workId="work" pageId="page" anchorId="anchor" authorized
      open={visible} onWebXrCleanupPendingChange={released} editor={<Editor />} />;
    const ui = render(gate(true));
    ui.rerender(gate(false));
    expect(ui.container.childElementCount).toBe(0);
    expect(released).toHaveBeenCalledWith(false);
  });
  it("탭에 복귀하면 영수증을 재검사하고 편집 중인 컷 이름과 다운로드한 모델을 유지한다", async () => {
    // 초기 파일 로딩과 탭 복귀 리스너 설치를 완료한 뒤 사용자 이벤트를 보낸다.
    await act(async () => { render(open()); });
    const input = await screen.findByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "수정 중" } });
    fireEvent(document, new Event("visibilitychange"));
    await waitFor(() => expect(recheck).toHaveBeenCalledOnce());
    expect(screen.getByRole("textbox")).toBe(input);
    expect(input.value).toBe("수정 중");
    expect(read).toHaveBeenCalledOnce();
  });
  it("연결 장애 때 편집을 보존하고 권한 철회가 확인되면 원본을 닫는다", async () => {
    await act(async () => { render(open()); }); await screen.findByRole("textbox");
    recheck.mockRejectedValueOnce(new Error("네트워크 연결을 확인해 주세요."));
    fireEvent(window, new Event("online"));
    expect((await screen.findByRole("alert")).textContent).toContain("네트워크");
    expect(screen.getByRole("textbox")).toBeTruthy();
    recheck.mockRejectedValueOnce(new TeamVrmCutAccessError("접근 권한이 없습니다."));
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByRole("button", { name: "다시 받기" });
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("권한");
    fireEvent.click(screen.getByRole("button", { name: "다시 받기" }));
    await screen.findByRole("textbox"); expect(read).toHaveBeenCalledTimes(2);
  });
  it("권한이 없는 레이어는 빈 편집기로 대체하지 않는다", async () => {
    const ui = render(open(false));
    expect(screen.getByRole("alert").textContent).toContain("권한");
    expect(read).not.toHaveBeenCalled();
    await act(async () => { ui.rerender(open()); }); await screen.findByRole("textbox");
    ui.rerender(open(false));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

it("재개방한 6패스는 서버 배우·컬러 해시를 확인한 뒤 원고 버전의 출력 설정과 팀 재편집 동작을 사용한다", async () => {
  const { createDefaultStudioBg3dSceneDocument } = await import("../bg3d/studio-bg3d-scene-document");
  const { DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS } = await import("../contracts/studio-bg3d-six-pass-settings");
  const { createStudioVrmSceneDocument } = await import("../vrm/studio-vrm-scene-document");
  const { createStudioScene3dVersionedCut } = await import("./studio-scene3d-shot-versions");
  const { createStudioScene3dDocument } = await import("./studio-scene3d-document");
  const { useContext } = await import("react");
  const { TeamVrmCutPaintAction } = await import("./studio-team-vrm-cut-revision");
  const scene = createDefaultStudioBg3dSceneDocument();
  const cut = createStudioScene3dVersionedCut({id:"cut", name:"원본", characters:{}, scene:createStudioScene3dDocument("work","2026-11-19T00:00:00Z"),
    linkedVrm:{version:1, documentScope:`sha256:${"a".repeat(64)}`, characters:[{elementId:"hero", label:"배우", stageTransform:{position:[0,0,0], rotationY:0}, vrmScene:createStudioVrmSceneDocument()}]}});
  const original = {...scene, pinnedVersionedCut:cut}, saved = {...original, output:{...scene.output, sixPassLt:DEFAULT_STUDIO_BG3D_SIX_PASS_LT_SETTINGS}};
  const ref = {anchorId:"vrmcut-11111111-1111-8111-a111-111111111111", sceneSha256:"a".repeat(64), compositeSha256:"b".repeat(64)};
  read.mockResolvedValue({scene:original,sceneSha256:ref.sceneSha256, compositeSha256:ref.compositeSha256, resources:{paints:new Map(),blobs:new Map()}});
  function Inspection({initialScene}: Pick<import("../bg3d/StudioBackground3DTypes").StudioBackground3DProps,"initialScene">) {
    const paint = useContext(TeamVrmCutPaintAction);
    return <span>{initialScene?.output.sixPassLt && paint ? "6패스 채색 가능" : "원본 컬러"}</span>;
  }
  const editor = <Inspection initialScene={saved}/>;
  const view = render(<StudioTeamVrmCutEditorGate workId="work" pageId="page" anchorId={ref.anchorId} authorized sixPassSource={ref} editor={editor}/>);
  await screen.findByText("6패스 채색 가능");
  view.rerender(<StudioTeamVrmCutEditorGate workId="work" pageId="page" anchorId={ref.anchorId} authorized sixPassSource={{...ref,compositeSha256:"c".repeat(64)}} editor={editor}/>);
  expect((await screen.findByRole("alert")).textContent).toContain("원본이 다릅니다");
  expect(screen.queryByText("6패스 채색 가능")).toBeNull();
});
