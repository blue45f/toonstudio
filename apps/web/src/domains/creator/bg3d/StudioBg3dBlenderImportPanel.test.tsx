// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { StudioDocumentLayoutContext, type StudioDocumentLayoutRuntime } from "../studio-router/studio-document-layout-context";
import { StudioLocalToolImportAuthorityContext } from "../toolchain/studio-local-tool-import-authority";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioToonBridgeClient } from "../toolchain/studio-toonbridge-client";
import type { StudioToonBridgeConnectionState } from "../toolchain/useStudioToonBridgeConnection";
import { StudioBg3dBlenderImportPanel as RealPanel } from "./StudioBg3dBlenderImportPanel";
import { runStudioBlenderJob } from "./studio-bg3d-blender-bridge";

const { useConnection, auth } = vi.hoisted(() => ({
  useConnection: vi.fn(),
  auth: { actor: "actor-a", revision: 0, listeners: new Set<() => void>() },
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthSessionRevision: () => auth.revision,
  getAuthUserId: () => auth.actor,
  listeners: auth.listeners,
}));

vi.mock("../toolchain/useStudioToonBridgeConnection", () => ({
  useStudioToonBridgeConnection: useConnection,
}));
vi.mock("../toolchain/StudioToonBridgeConnectionCard", () => ({
  StudioToonBridgeConnectionCard: () => <div>실행기 연결 설정</div>,
}));
vi.mock("./studio-bg3d-blender-bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studio-bg3d-blender-bridge")>()), runStudioBlenderJob: vi.fn(),
}));
vi.mock("@/shared/lib/i18n-bilingual-copy", () => ({
  useBilingual: () => (ko: string) => ko,
}));

const layout: StudioDocumentLayoutRuntime = {
  documentKey: "project-a/doc-a", projectId: "project-a", documentId: "doc-a", draftId: null,
  documentWorkspace: null, draftSessionEpoch: 0, instantWorkId: "instant-a", liveRoomParam: null,
  liveInviteRoleParam: null, remixId: null, workId: "work-a",
};
let mutation: StudioEditorMutationTicket = { authScopeKey: "actor-a", workId: "work-a", accessGeneration: 0, documentGeneration: 0 };
const authority = {
  locked: false,
  capture: () => ({ ...mutation }),
  isCurrent: (ticket: StudioEditorMutationTicket) => !authority.locked && JSON.stringify(ticket) === JSON.stringify(mutation),
};
type PanelProps = Partial<ComponentProps<typeof RealPanel>> & { readonly projectId?: string; readonly documentId?: string };
function StudioBg3dBlenderImportPanel({ projectId = "project-a", documentId = "doc-a", ...props }: PanelProps) {
  return <StudioDocumentLayoutContext.Provider value={{ ...layout, projectId, documentId, documentKey: `${projectId}/${documentId}` }}>
    <StudioLocalToolImportAuthorityContext.Provider value={authority}>
      <RealPanel scopeKey="page-a" rightsKey="owned" onFile={async () => true} {...props} />
    </StudioLocalToolImportAuthorityContext.Provider>
  </StudioDocumentLayoutContext.Provider>;
}

function connection(available = true): StudioToonBridgeConnectionState {
  const settings = { baseUrl: "http://127.0.0.1:49631", token: "x".repeat(40) };
  return {
    settings,
    client: new StudioToonBridgeClient(settings),
    status: available ? {
      protocol: "toonstudio.production-toolchain",
      version: 2,
      serviceVersion: "2.0.0",
      activeJobs: 0,
      retainedJobs: 0,
    } : null,
    probes: available ? [{
      toolId: "blender",
      state: "available",
      version: "Blender 5.2.0",
      executable: true,
      reason: "available",
    }] : [],
    connected: available,
    loading: false,
    error: null,
    connect: vi.fn(async () => undefined),
    refresh: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    setBaseUrl: vi.fn(),
    setToken: vi.fn(),
  };
}

function deferredFile() {
  let resolve: (file: File) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<File>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function openAndSelect(name = "교실.blend") {
  fireEvent.click(screen.getByRole("button", { name: "Blender 열기" }));
  const file = new File(["BLENDER"], name);
  fireEvent.change(screen.getByLabelText("Blender 장면 파일 (.blend)"), { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.actor = "actor-a"; auth.revision = 0;
  mutation = { authScopeKey: "actor-a", workId: "work-a", accessGeneration: 0, documentGeneration: 0 };
  authority.locked = false;
  useConnection.mockReturnValue(connection());
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Blender 실제 장면 작업 패널", () => {
  it("기본 화면에서 실행하지 않고 연결·packed resources 안내를 펼친다", () => {
    useConnection.mockReturnValue(connection(false));
    render(<StudioBg3dBlenderImportPanel onFile={vi.fn(async () => true)} />);

    expect(screen.queryByText("실행기 연결 설정")).toBeNull();
    openAndSelect();
    expect(screen.getByText("실행기 연결 설정")).toBeTruthy();
    expect(screen.getByText(/Pack Resources/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }).hasAttribute("disabled")).toBe(true);
    expect(runStudioBlenderJob).not.toHaveBeenCalled();
  });

  it("사용자 요청으로 한 번 실행하고 검증한 GLB를 기존 가져오기로 전달한다", async () => {
    const pending = deferredFile();
    vi.mocked(runStudioBlenderJob).mockReturnValue(pending.promise);
    const onFile = vi.fn(async () => true);
    const onBusyChange = vi.fn();
    render(<StudioBg3dBlenderImportPanel onFile={onFile} onBusyChange={onBusyChange} />);
    const file = openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));

    expect(runStudioBlenderJob).toHaveBeenCalledTimes(1);
    expect(runStudioBlenderJob).toHaveBeenCalledWith(expect.objectContaining({ file, operation: "export-glb", projectId: "project-a" }));
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    const result = new File(["glTF"], "교실.glb", { type: "model/gltf-binary" });
    await act(async () => pending.resolve(result));

    expect(onFile).toHaveBeenCalledExactlyOnceWith(result, expect.any(AbortSignal));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText(/최종 결과는 3D 모델 목록/u)).toBeTruthy();
  });

  it("실패 사유를 보여주고 자동 재시도나 가져오기를 하지 않는다", async () => {
    vi.mocked(runStudioBlenderJob).mockRejectedValue(new Error("BLENDER_TEXTURE_MISSING"));
    const onFile = vi.fn(async () => true);
    const onBusyChange = vi.fn();
    render(<StudioBg3dBlenderImportPanel onFile={onFile} onBusyChange={onBusyChange} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "BLENDER_TEXTURE_MISSING");
    expect(onFile).not.toHaveBeenCalled();
    expect(runStudioBlenderJob).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
  });

  it("취소 응답을 기다리는 동안 새 실행을 막고 확인 뒤 가져오기를 하지 않는다", async () => {
    const pending = deferredFile();
    vi.mocked(runStudioBlenderJob).mockReturnValue(pending.promise);
    const onFile = vi.fn(async () => true);
    const onBusyChange = vi.fn();
    render(<StudioBg3dBlenderImportPanel onFile={onFile} onBusyChange={onBusyChange} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    const call = vi.mocked(runStudioBlenderJob).mock.calls[0]?.[0];
    fireEvent.click(screen.getByRole("button", { name: "Blender 작업 취소" }));
    expect(call?.signal.aborted).toBe(true);
    expect(onBusyChange.mock.calls).toEqual([[true]]);
    expect(screen.getByText(/작업 취소를 요청하고/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    expect(runStudioBlenderJob).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject(new DOMException("cancelled", "AbortError")));

    expect(onFile).not.toHaveBeenCalled();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
    expect(screen.getByText(/Blender 작업을 취소했습니다/u)).toBeTruthy();
  });

  it("원격 취소 여부를 확인하지 못하면 취소 완료로 표시하지 않는다", async () => {
    const pending = deferredFile();
    vi.mocked(runStudioBlenderJob).mockReturnValue(pending.promise);
    const onFile = vi.fn(async () => true);
    render(<StudioBg3dBlenderImportPanel onFile={onFile} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    fireEvent.click(screen.getByRole("button", { name: "Blender 작업 취소" }));
    await act(async () => pending.reject(new Error("중단 여부 확인 불가: 작업 큐를 확인하세요.")));
    expect(screen.getByRole("alert").textContent).toContain("중단 여부 확인 불가");
    expect(screen.queryByText(/Blender 작업을 취소했습니다/u)).toBeNull();
    expect(onFile).not.toHaveBeenCalled();
  });

  it("패널을 닫을 때 원격 작업을 중단하고 늦은 결과를 전달하지 않는다", async () => {
    const pending = deferredFile();
    vi.mocked(runStudioBlenderJob).mockReturnValue(pending.promise);
    const onFile = vi.fn(async () => true);
    const onBusyChange = vi.fn();
    const view = render(<StudioBg3dBlenderImportPanel onFile={onFile} onBusyChange={onBusyChange} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    const call = vi.mocked(runStudioBlenderJob).mock.calls[0]?.[0];
    view.unmount();
    expect(call?.signal.aborted).toBe(true);
    await act(async () => pending.resolve(new File(["glTF"], "late.glb")));
    expect(onFile).not.toHaveBeenCalled();
    expect(onBusyChange.mock.calls).toEqual([[true], [false]]);
  });

  it("권리 입력이나 기존 작업이 가져오기를 거부하면 성공으로 표시하지 않는다", async () => {
    vi.mocked(runStudioBlenderJob).mockResolvedValue(new File(["glTF"], "room.glb"));
    render(<StudioBg3dBlenderImportPanel onFile={() => { throw new Error("이용 권리 입력을 확인해 주세요."); }} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "이용 권리 입력을 확인해 주세요.");
    expect(screen.queryByText(/최종 결과는 3D 모델 목록/u)).toBeNull();
  });

  it.each([
    ["현재 프레임 PNG 저장", "render-scene"],
    ["Freestyle 선화 PNG 저장", "line-art"],
  ])("%s은 검증한 PNG만 저장하고 모델 가져오기를 호출하지 않는다", async (label, operation) => {
    const result = new File(["png"], "교실.png", { type: "image/png" });
    vi.mocked(runStudioBlenderJob).mockResolvedValue(result);
    const createUrl = vi.fn(() => "blob:blender-result");
    const revokeUrl = vi.fn();
    vi.stubGlobal("URL", class extends URL {
      static createObjectURL = createUrl;
      static revokeObjectURL = revokeUrl;
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const onFile = vi.fn(async () => true);
    render(<StudioBg3dBlenderImportPanel onFile={onFile} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: label }));

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    expect(runStudioBlenderJob).toHaveBeenCalledWith(expect.objectContaining({ operation }));
    expect(createUrl).toHaveBeenCalledWith(result);
    expect(onFile).not.toHaveBeenCalled();
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith("blob:blender-result"));
    vi.unstubAllGlobals();
  });

  it("disabled와 잘못된 파일 형식에서 실행을 막는다", () => {
    const view = render(<StudioBg3dBlenderImportPanel disabled onFile={vi.fn(async () => true)} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    expect(runStudioBlenderJob).not.toHaveBeenCalled();
    view.rerender(<StudioBg3dBlenderImportPanel onFile={vi.fn(async () => true)} />);
    fireEvent.change(screen.getByLabelText("Blender 장면 파일 (.blend)"), { target: { files: [new File(["x"], "room.exe")] } });
    expect(screen.getByRole("alert")).toHaveProperty("textContent", ".blend 파일을 선택하세요.");
    expect(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }).hasAttribute("disabled")).toBe(true);
  });
  it.each(["actor", "document", "project", "target", "permission", "disabled", "rights", "connection", "disconnect"] as const)(
    "%s 교체 뒤 늦은 GLB와 진행 알림을 적용하지 않는다", async (change) => {
      const pending = deferredFile();
      vi.mocked(runStudioBlenderJob).mockReturnValue(pending.promise);
      const onFile = vi.fn(async () => true);
      const props: PanelProps = { onFile };
      const view = render(<StudioBg3dBlenderImportPanel {...props} />);
      openAndSelect();
      fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
      const call = vi.mocked(runStudioBlenderJob).mock.calls[0]?.[0];
      if (change === "actor") {
        act(() => { auth.actor = "actor-b"; auth.revision += 1; for (const listener of auth.listeners) listener(); });
      } else {
        if (change === "permission") { authority.locked = true; mutation = { ...mutation, accessGeneration: 1 }; }
        if (change === "connection") useConnection.mockReturnValue(connection());
        if (change === "disconnect") useConnection.mockReturnValue(connection(false));
        view.rerender(<StudioBg3dBlenderImportPanel {...props}
          documentId={change === "document" ? "doc-b" : "doc-a"}
          projectId={change === "project" ? "project-b" : "project-a"}
          scopeKey={change === "target" ? "page-b" : "page-a"}
          rightsKey={change === "rights" ? "licensed" : "owned"}
          disabled={change === "disabled"} />);
      }
      expect(call?.signal.aborted).toBe(true);
      expect(call?.isCurrent?.()).toBe(false);
      await act(async () => pending.resolve(new File(["glTF"], "late.glb")));
      expect(onFile).not.toHaveBeenCalled();
      expect(runStudioBlenderJob).toHaveBeenCalledTimes(1);
    },
  );

  it("문서·권한이 A→B→A로 돌아와도 이전 실행이 부활하지 않는다", async () => {
    const pending = deferredFile();
    vi.mocked(runStudioBlenderJob).mockReturnValue(pending.promise);
    const onFile = vi.fn(async () => true);
    const view = render(<StudioBg3dBlenderImportPanel onFile={onFile} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    const call = vi.mocked(runStudioBlenderJob).mock.calls[0]?.[0];
    view.rerender(<StudioBg3dBlenderImportPanel onFile={onFile} documentId="doc-b" />);
    view.rerender(<StudioBg3dBlenderImportPanel onFile={onFile} />);
    expect(call?.isCurrent?.()).toBe(false);
    await act(async () => pending.resolve(new File(["glTF"], "old.glb")));
    expect(onFile).not.toHaveBeenCalled();
  });

  it("canonical 모델 검증 완료를 기다리며 자신의 가져오기 busy는 취소하지 않는다", async () => {
    vi.mocked(runStudioBlenderJob).mockResolvedValue(new File(["glTF"], "room.glb"));
    let complete: (value: boolean) => void = () => undefined;
    const importPending = new Promise<boolean>((resolve) => { complete = resolve; });
    const onFile = vi.fn((_file: File, _signal: AbortSignal) => importPending);
    const onImported = vi.fn();
    const view = render(<StudioBg3dBlenderImportPanel onFile={onFile} onImported={onImported} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    await waitFor(() => expect(onFile).toHaveBeenCalledOnce());
    const signal = onFile.mock.calls[0]?.[1];
    view.rerender(<StudioBg3dBlenderImportPanel onFile={onFile} onImported={onImported} importing />);
    expect(signal?.aborted).toBe(false);
    expect(onImported).not.toHaveBeenCalled();
    await act(async () => complete(true));
    expect(onImported).toHaveBeenCalledOnce();
    expect(screen.getByText(/최종 결과는 3D 모델 목록/u)).toBeTruthy();
  });

  it("모델 검증 거부는 성공으로 표시하지 않고 AI 답도 소비하지 않는다", async () => {
    vi.mocked(runStudioBlenderJob).mockResolvedValue(new File(["glTF"], "room.glb"));
    const onImported = vi.fn();
    render(<StudioBg3dBlenderImportPanel onFile={async () => false} onImported={onImported} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "모델 검증 또는 이용 권리 확인을 완료하지 못했습니다.");
    expect(onImported).not.toHaveBeenCalled();
  });

  it("로컬 연결과 원고 편집 권위가 없으면 실행하지 않는다", () => {
    const remote = connection();
    useConnection.mockReturnValue({ ...remote, client: new StudioToonBridgeClient({ baseUrl: "https://runner.example", token: "x".repeat(40) }) });
    const view = render(<StudioBg3dBlenderImportPanel />);
    openAndSelect();
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    expect(runStudioBlenderJob).not.toHaveBeenCalled();
    view.unmount();
    useConnection.mockReturnValue(connection());
    render(<RealPanel scopeKey="unowned" rightsKey="unknown" onFile={async () => true} />);
    openAndSelect();
    fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
    expect(runStudioBlenderJob).not.toHaveBeenCalled();
  });

});
