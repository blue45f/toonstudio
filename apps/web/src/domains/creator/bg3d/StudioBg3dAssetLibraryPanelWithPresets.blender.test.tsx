// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { StudioBg3dAssetLibraryPanelWithPresets } from "./StudioBg3dAssetLibraryPanelWithPresets";
import { runStudioBlenderJob } from "./studio-bg3d-blender-bridge";
import type { StudioBg3dModelImportActions } from "./studio-bg3d-editor-model-import-actions";
import { StudioDocumentLayoutContext, type StudioDocumentLayoutRuntime } from "../studio-router/studio-document-layout-context";
import { StudioLocalToolImportAuthorityContext } from "../toolchain/studio-local-tool-import-authority";
import { StudioToonBridgeClient } from "../toolchain/studio-toonbridge-client";
import type { StudioToonBridgeConnectionState } from "../toolchain/useStudioToonBridgeConnection";
import type { StudioEditorMutationTicket } from "../studio-editor-scope";

const { useConnection, authListeners } = vi.hoisted(() => ({ useConnection: vi.fn(), authListeners: new Set<() => void>() }));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthUserId: () => "actor-a", getAuthSessionRevision: () => 0, listeners: authListeners,
}));
vi.mock("../toolchain/useStudioToonBridgeConnection", () => ({ useStudioToonBridgeConnection: useConnection }));
vi.mock("../toolchain/StudioToonBridgeConnectionCard", () => ({ StudioToonBridgeConnectionCard: () => null }));
vi.mock("./studio-bg3d-blender-bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./studio-bg3d-blender-bridge")>()), runStudioBlenderJob: vi.fn(),
}));
vi.mock("./useStudioBg3dAssetRights", () => ({ useStudioBg3dAssetRights: () => ({ views: new Map(), state: "ready" }) }));
vi.mock("./StudioBg3dAuthoredEnvironmentCyclesPanel", () => ({ StudioBg3dAuthoredEnvironmentCyclesPanel: () => null }));
vi.mock("./StudioBg3dBundleThemePackPanel", () => ({ StudioBg3dBundleThemePackPanel: () => null }));
vi.mock("./StudioBg3dEssentialPosePropPanel", () => ({ StudioBg3dEssentialPosePropPanel: () => null }));
vi.mock("./StudioReferenceRebuildPresets", () => ({ StudioReferenceRebuildPresets: () => null }));

const settings = { baseUrl: "http://127.0.0.1:49631", token: "x".repeat(40) };
function connection(): StudioToonBridgeConnectionState {
  return { settings, client: new StudioToonBridgeClient(settings), connected: true, loading: false, error: null,
    status: { protocol: "toonstudio.production-toolchain", version: 2, serviceVersion: "0.2.0", activeJobs: 0, retainedJobs: 0 },
    probes: [{ toolId: "blender", state: "available", version: "Blender 5.2.0", executable: true, reason: "available" }],
    connect: vi.fn(async () => undefined), refresh: vi.fn(async () => undefined), disconnect: vi.fn(), setBaseUrl: vi.fn(), setToken: vi.fn() };
}
function fixture(onImportFiles: StudioBg3dModelImportActions["importModelFiles"]): ComponentProps<typeof StudioBg3dAssetLibraryPanelWithPresets> {
  return { entries: [], libraryStatus: "ready", deletingModelId: null, isUploading: false, importProgress: null,
    isRestoringScene: false, deviceProfileLabel: "데스크톱", onFileChange: vi.fn(), onCancelImport: vi.fn(),
    onAdd: vi.fn(), onDelete: vi.fn(), onImportFiles, localBlendScopeKey: "page-a/background-a" };
}
function ActualForm({ props, projectId = "project-a" }: { readonly props: ReturnType<typeof fixture>; readonly projectId?: string }) {
  const layout: StudioDocumentLayoutRuntime = { documentKey: `${projectId}/doc`, projectId, documentId: "doc", draftId: null,
    documentWorkspace: null, draftSessionEpoch: 0, instantWorkId: "instant", liveRoomParam: null, liveInviteRoleParam: null,
    remixId: null, workId: `work-${projectId}` };
  const mutation: StudioEditorMutationTicket = { authScopeKey: "actor-a", workId: layout.workId, accessGeneration: 0, documentGeneration: 0 };
  const authority = { locked: false, capture: () => ({ ...mutation }),
    isCurrent: (ticket: StudioEditorMutationTicket) => JSON.stringify(ticket) === JSON.stringify(mutation) };
  return <StudioDocumentLayoutContext.Provider value={layout}>
    <StudioLocalToolImportAuthorityContext.Provider value={authority}>
      <StudioBg3dAssetLibraryPanelWithPresets {...props} />
    </StudioLocalToolImportAuthorityContext.Provider>
  </StudioDocumentLayoutContext.Provider>;
}
function chooseAiAnswers() {
  fireEvent.click(screen.getByText("이용 권리 기록"));
  fireEvent.click(screen.getByRole("radio", { name: "AI로 만듦" }));
  fireEvent.click(screen.getByRole("radio", { name: "금지" }));
}
function startConversion() {
  fireEvent.click(screen.getByRole("button", { name: "Blender 열기" }));
  fireEvent.change(screen.getByLabelText("Blender 장면 파일 (.blend)"), { target: { files: [new File(["BLENDER"], "fixture.blend")] } });
  fireEvent.click(screen.getByRole("button", { name: "GLB로 변환해 가져오기" }));
}
function expectAiUnknown() {
  const generated = screen.getByRole("group", { name: "AI로 생성한 소재인가요?" });
  const training = screen.getByRole("group", { name: "라이선스가 AI 학습 이용을 허용하나요?" });
  expect((within(generated).getByRole("radio", { name: "모름" }) as HTMLInputElement).checked).toBe(true);
  expect((within(training).getByRole("radio", { name: "모름" }) as HTMLInputElement).checked).toBe(true);
}
function deferredImport() {
  let resolve: (value: boolean) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<boolean>((success, failure) => { resolve = success; reject = failure; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  useConnection.mockReturnValue(connection());
  vi.mocked(runStudioBlenderJob).mockReset().mockResolvedValue(new File(["glTF"], "local.glb", { type: "model/gltf-binary" }));
});
afterEach(cleanup);

describe("실제 로컬 Blender 패널과 기존 권리·AI 폼의 접점", () => {
  it("같은 권리·AI 답과 신호를 직접 전달하고 정상 완료 뒤 폼 초기화가 자기 신호를 취소하지 않는다", async () => {
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(async () => true);
    const props = fixture(onImport);
    render(<ActualForm props={props} />);
    chooseAiAnswers();
    fireEvent.click(screen.getByRole("radio", { name: /직접 제작/u }));
    startConversion();
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    expect(onImport).toHaveBeenCalledWith([expect.objectContaining({ name: "local.glb", type: "model/gltf-binary" })],
      expect.objectContaining({ status: "owned", aiGenerated: "yes", aiTraining: "prohibited" }), expect.any(AbortSignal));
    expect(props.onFileChange).not.toHaveBeenCalled();
    await waitFor(expectAiUnknown);
    expect(onImport.mock.calls[0]?.[2]?.aborted).toBe(false);
    expect(screen.getByText(/최종 결과는 3D 모델 목록/u)).toBeTruthy();
    expect(screen.queryByText(/작업 대상이나 연결이 바뀌어/u)).toBeNull();
  });

  it("구매 권리 입력이 불완전하면 실제 변환 버튼을 막고 라이선스 입력 뒤 허용한다", () => {
    render(<ActualForm props={fixture(async () => true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Blender 열기" }));
    fireEvent.change(screen.getByLabelText("Blender 장면 파일 (.blend)"), { target: { files: [new File(["BLENDER"], "fixture.blend")] } });
    fireEvent.click(screen.getByText("이용 권리 기록"));
    fireEvent.click(screen.getByRole("radio", { name: /구매·허가/u }));
    const button = screen.getByRole("button", { name: "GLB로 변환해 가져오기" });
    expect(button.closest("fieldset")?.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/라이선스·구매처 이름/u), { target: { value: "직접 구매한 라이선스" } });
    expect(button.closest("fieldset")?.disabled).toBe(false);
    expect(runStudioBlenderJob).not.toHaveBeenCalled();
  });

  it("정규 가져오기가 거부해도 이미 전달한 파일의 AI 답을 소비한다", async () => {
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(async () => false);
    render(<ActualForm props={fixture(onImport)} />);
    chooseAiAnswers();
    startConversion();
    await waitFor(expectAiUnknown);
    expect(onImport).toHaveBeenCalledOnce();
    expect(screen.getByRole("alert").textContent).toContain("모델 검증 또는 이용 권리");
    expect(onImport.mock.calls[0]?.[2]?.aborted).toBe(false);
  });

  it("정규 가져오기 전 변환 실패는 아직 사용하지 않은 AI 답을 유지한다", async () => {
    vi.mocked(runStudioBlenderJob).mockRejectedValue(new Error("BLENDER_FAILED_BEFORE_HANDOFF"));
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(async () => true);
    render(<ActualForm props={fixture(onImport)} />);
    chooseAiAnswers();
    startConversion();
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "BLENDER_FAILED_BEFORE_HANDOFF");
    expect(onImport).not.toHaveBeenCalled();
    expect((screen.getByRole("radio", { name: "AI로 만듦" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "금지" }) as HTMLInputElement).checked).toBe(true);
  });

  it.each(["accepted", "rejected", "error"] as const)("같은 owner에서 취소 후 %s로 끝나도 이 파일의 AI 답을 비운다", async (outcome) => {
    const pending = deferredImport();
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(() => pending.promise);
    render(<ActualForm props={fixture(onImport)} />);
    chooseAiAnswers();
    startConversion();
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Blender 작업 취소" }));
    expect(onImport.mock.calls[0]?.[2]?.aborted).toBe(true);
    await act(async () => {
      if (outcome === "error") pending.reject(new DOMException("cancelled", "AbortError"));
      else pending.resolve(outcome === "accepted");
    });
    expectAiUnknown();
    expect(runStudioBlenderJob).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: "Blender 작업 취소" })).toBeNull();
  });

  it.each(["accepted", "rejected", "error"] as const)("project를 바꾼 뒤 늦은 %s 결과가 새로 고른 AI 답을 비우지 않는다", async (outcome) => {
    const pending = deferredImport();
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(() => pending.promise);
    const props = fixture(onImport);
    const view = render(<ActualForm props={props} />);
    chooseAiAnswers();
    startConversion();
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    view.rerender(<ActualForm props={props} projectId="project-b" />);
    fireEvent.click(screen.getByRole("radio", { name: "AI 아님" }));
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    await act(async () => {
      if (outcome === "error") pending.reject(new DOMException("cancelled", "AbortError"));
      else pending.resolve(outcome === "accepted");
    });
    expect((screen.getByRole("radio", { name: "AI 아님" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "허용" }) as HTMLInputElement).checked).toBe(true);
    expect(runStudioBlenderJob).toHaveBeenCalledOnce();
    expect(onImport.mock.calls[0]?.[2]?.aborted).toBe(true);
  });

  it("같은 project라도 새로 고른 권리·AI 답은 이전 가져오기의 늦은 완료가 소비하지 않는다", async () => {
    const pending = deferredImport();
    const onImport = vi.fn<StudioBg3dModelImportActions["importModelFiles"]>(() => pending.promise);
    render(<ActualForm props={fixture(onImport)} />);
    chooseAiAnswers();
    startConversion();
    await waitFor(() => expect(onImport).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("radio", { name: "AI 아님" }));
    fireEvent.click(screen.getByRole("radio", { name: "허용" }));
    await act(async () => pending.resolve(true));
    expect((screen.getByRole("radio", { name: "AI 아님" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "허용" }) as HTMLInputElement).checked).toBe(true);
    expect(onImport.mock.calls[0]?.[2]?.aborted).toBe(true);
  });
});
