// @vitest-environment jsdom
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { StudioBg3dProfessionalWorkspace } from "../bg3d/StudioBg3dProfessionalWorkspace";
import { useStudioBg3dCanonicalDocumentState } from "../bg3d/useStudioBg3dCanonicalDocumentState";
import { useStudioBg3dModelMaterialLease } from "../bg3d/useStudioBg3dModelMaterialLease";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  normalizeStudioBg3dSceneDocument,
  type StudioBg3dSceneDocument,
} from "../bg3d/studio-bg3d-scene-document";
import { tryAdaptStudioBg3dRuntimeToDocument } from "../bg3d/studio-bg3d-scene-runtime";
import { createStudioBg3dHistorySnapshot } from "../bg3d/studio-bg3d-editor-derivations";
import {
  commitStudioBg3dHistoryTransition,
  type StudioBg3dHistoryCommandRefs,
} from "../bg3d/studio-bg3d-history-command-adapter";
import * as repositoryModule from "../studio-web-runtime/studio-web-authoring-project-v3-repository";
import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import type { StudioScene3dCutBg3dEditorHost } from "./studio-scene3d-cut-bg3d-host";
import { createStudioScene3dCutBg3dHost } from "./studio-scene3d-cut-bg3d-host";
import { StudioScene3dCutSession } from "./studio-scene3d-cut-session";

const memory = () => {
  const data = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => {
      data.set(key, value);
    },
    delete: async (key) => {
      data.delete(key);
    },
  };
  const repository = new repositoryModule.StudioWebAuthoringProjectV3Repository(
    {
      storeFactory: async () => store,
      lockProvider: {
        request: async (_name, _options, operation) => operation(),
      },
    }
  );
  return { repository, data };
};
function initialDocument(): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    output: {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.output,
      exportAspectRatio: 1,
    },
  });
}
let currentHost: StudioScene3dCutBg3dEditorHost | null = null;
const appliedViews = vi.fn(() => true);
let history: StudioBg3dHistoryCommandRefs;
function Viewport({ h }: { readonly h: StudioScene3dCutBg3dEditorHost }) {
  return (
    <div data-testid="real-host-document">
      {JSON.stringify(h.sceneBaseDocument.camera.position)}
    </div>
  );
}
function Workspace({ rendererReady = true, rendererGeneration = 0, materialBackend = "webgpu" }: {
  readonly rendererReady?: boolean;
  readonly rendererGeneration?: number;
  readonly materialBackend?: "webgl" | "webgpu";
}) {
  const canonical = useStudioBg3dCanonicalDocumentState({
    initialDocument: initialDocument(),
  });
  const historyRef = useRef<StudioBg3dHistoryCommandRefs>({
    historyRef: { current: [] },
    historyIndexRef: { current: -1 },
    historyCommandTimelineRef: { current: null },
  });
  const hostRef = useRef<StudioScene3dCutBg3dEditorHost | null>(null);
  const pendingCamera = useRef<StudioBg3dSceneDocument["camera"] | null>(null);
  const viewportApi = useRef({ applyView: appliedViews });
  const renderer = useMemo(() => {
    const domElement = document.createElement("canvas");
    domElement.dataset.rendererGeneration = String(rendererGeneration);
    return {
      domElement,
      isWebGPURenderer: true as const,
      hasFeature: () => false,
    };
  }, [rendererGeneration]);
  const modelRenderer = rendererReady ? renderer : null;
  const rendererRef = useRef(modelRenderer);
  rendererRef.current = modelRenderer;
  const isMaterialBackendCurrent = useStudioBg3dModelMaterialLease({
    renderer: modelRenderer, rendererRef, materialBackend,
  });
  const storageIds = useRef(new Map<string, string>());
  const values: StudioScene3dCutBg3dEditorHost = {
    open: true,
    modelRenderer,
    materialBackend,
    isMaterialBackendCurrent,
    sharedStageSessionScopeKey: "project-a:page-1:bg-layer",
    ...canonical,
    storageModelIdByAttachmentIdRef: storageIds,
    pendingInitialCameraRef: pendingCamera,
    viewportApiRef: viewportApi,
    physicsRuntimeSourceRef: canonical.liveSceneRef,
    readCurrentCanonicalSceneForShot() {
      const live = canonical.liveSceneRef.current;
      const adapted = tryAdaptStudioBg3dRuntimeToDocument({
        primitives: live.primitives,
        customModels: live.customModels,
        attachmentByStorageModelId: new Map(),
        baseDocument: live.document,
      });
      return adapted.ok ? adapted.value.document : null;
    },
    commitImmediateHistoryTransition(
      primitives,
      customModels,
      document,
      before,
      options
    ) {
      commitStudioBg3dHistoryTransition(historyRef.current, {
        before,
        after: createStudioBg3dHistorySnapshot({
          primitives,
          customModels,
          document,
        }),
        ...options,
      });
    },
    setLineArtPreview: () => undefined,
  };
  if (!hostRef.current) hostRef.current = values;
  else Object.assign(hostRef.current, values);
  useLayoutEffect(() => {
    currentHost = hostRef.current;
    history = historyRef.current;
  });
  return (
    <MemoryRouter initialEntries={["/studio/bg3d"]}>
      <StudioBg3dProfessionalWorkspace
        outliner={<span>계층</span>}
        inspector={<span>속성</span>}
        viewport={<Viewport h={hostRef.current} />}
      />
    </MemoryRouter>
  );
}
function host() {
  if (!currentHost) throw new Error("host missing");
  return currentHost;
}
function setCamera(x: number) {
  act(() => {
    const h = host();
    h.replaceCanonicalDocumentState({
      document: {
        ...h.sceneBaseDocument,
        camera: { ...h.sceneBaseDocument.camera, position: [x, 2, 5] },
      },
    });
  });
}
function click(name: string) {
  fireEvent.click(screen.getByRole("button", { name }));
}
async function createCut(name: string, camera: number) {
  setCamera(camera);
  fireEvent.change(screen.getByLabelText("컷 이름"), {
    target: { value: name },
  });
  click("현재 장면으로 컷 만들기");
  await screen.findByRole("button", { name: `${name} · 초안` });
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  currentHost = null;
  appliedViews.mockClear();
});

describe("제품 전문가 작업공간의 컷 버전 통합", () => {
  it("렌더러가 없는 냉시작은 이전 엔진을 캐시하지 않고 준비 뒤 빈 컷 프로젝트를 연다", async () => {
    const { repository, data } = memory();
    vi.spyOn(repositoryModule, "getStudioWebAuthoringProjectV3Repository").mockReturnValue(repository);
    const load = vi.spyOn(repository, "load");
    const rendered = render(<Workspace rendererReady={false} />);
    expect(screen.getByText("장면과 렌더러가 준비되면 컷 패널을 엽니다.")).toBeDefined();
    expect(load).not.toHaveBeenCalled();

    rendered.rerender(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("list", { name: "고정한 컷 목록" }).children).toHaveLength(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(data.size).toBe(0);
    expect(history.historyCommandTimelineRef.current).toBeNull();
  });

  it("보존할 작업이 없는 빈 세션은 새 엔진에 결속하고 이전 세션을 정상 폐기한다", async () => {
    const { repository, data } = memory();
    vi.spyOn(repositoryModule, "getStudioWebAuthoringProjectV3Repository").mockReturnValue(repository);
    const load = vi.spyOn(repository, "load");
    const dispose = vi.spyOn(StudioScene3dCutSession.prototype, "dispose");
    const rendered = render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    const adapter = createStudioScene3dCutBg3dHost(host());
    const source = adapter.readSource();

    rendered.rerender(<Workspace rendererGeneration={1} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    expect(load).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("표시 엔진이 바뀌어 이전 컷 준비를 중단했습니다.")).toBeNull();
    await expect(adapter.applySource(source, null, new AbortController().signal))
      .rejects.toThrow(/^표시 엔진이 바뀌어 이전 컷 준비를 중단했습니다\.$/u);
    expect(data.size).toBe(0);
    expect(history.historyCommandTimelineRef.current).toBeNull();
  });

  it("nonnull 렌더러도 실제 backend lease가 유효해진 뒤에만 같은 렌더러로 컷 세션을 만든다", async () => {
    const { repository, data } = memory();
    vi.spyOn(repositoryModule, "getStudioWebAuthoringProjectV3Repository").mockReturnValue(repository);
    const load = vi.spyOn(repository, "load");
    const rendered = render(<Workspace materialBackend="webgl" />);
    const renderer = host().modelRenderer;
    expect(renderer).not.toBeNull();
    expect(host().isMaterialBackendCurrent?.()).toBe(false);
    expect(screen.getByText("장면과 렌더러가 준비되면 컷 패널을 엽니다.")).toBeDefined();
    expect(load).not.toHaveBeenCalled();

    rendered.rerender(<Workspace materialBackend="webgpu" />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    expect(host().modelRenderer).toBe(renderer);
    expect(host().isMaterialBackendCurrent?.()).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(data.size).toBe(0);
  });

  it("같은 문서의 엔진만 바뀌면 미제출 컷 이름과 JSON 초안을 보존한 패널에 새 세션을 연결한다", async () => {
    const { repository, data } = memory();
    vi.spyOn(repositoryModule, "getStudioWebAuthoringProjectV3Repository").mockReturnValue(repository);
    const load = vi.spyOn(repository, "load");
    const rendered = render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    const name = screen.getByLabelText<HTMLInputElement>("컷 이름");
    const json = screen.getByLabelText<HTMLTextAreaElement>("프로젝트 JSON");
    const details = screen.getByText("JSON 백업·가져오기").closest("details");
    if (!(details instanceof HTMLDetailsElement)) throw new Error("JSON details가 없습니다.");
    fireEvent.click(screen.getByText("JSON 백업·가져오기"));
    expect(details.open).toBe(true);
    fireEvent.change(name, { target: { value: "아직 고정하지 않은 컷" } });
    fireEvent.change(json, { target: { value: '{"미제출":"백업 초안"}' } });

    rendered.rerender(<Workspace rendererGeneration={1} />);
    expect(screen.getByLabelText("컷 이름")).toBe(name);
    expect(name.value).toBe("아직 고정하지 않은 컷");
    for (const action of ["로컬 다시 불러오기", "로컬 저장", "JSON 가져오기"]) {
      expect(screen.getByRole<HTMLButtonElement>("button", { name: action }).disabled).toBe(true);
    }
    expect(screen.queryByRole("button", { name: "작업 취소" })).toBeNull();
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    expect(screen.getByLabelText<HTMLInputElement>("컷 이름").value).toBe("아직 고정하지 않은 컷");
    expect(screen.getByLabelText<HTMLTextAreaElement>("프로젝트 JSON").value).toBe('{"미제출":"백업 초안"}');
    expect(screen.getByText("JSON 백업·가져오기").closest("details")?.hasAttribute("open")).toBe(true);
    click("현재 장면으로 컷 만들기");
    expect(await screen.findByRole("button", { name: "아직 고정하지 않은 컷 · 초안" })).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(data.size).toBe(0);
  });

  it("컷이 있는 엔진 변경은 세션을 버리지 않고 이전 컷 적용을 같은 오류로 거부한다", async () => {
    const { repository } = memory();
    vi.spyOn(repositoryModule, "getStudioWebAuthoringProjectV3Repository").mockReturnValue(repository);
    const load = vi.spyOn(repository, "load");
    const rendered = render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    await createCut("보존할 컷", 3);
    const original = host().sceneBaseDocument;

    rendered.rerender(<Workspace rendererGeneration={1} />);
    expect(screen.getByRole("button", { name: "보존할 컷 · 초안" })).toBeDefined();
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>("button", { name: "이 컷으로 복귀" }).disabled).toBe(false));
    click("이 컷으로 복귀");
    expect((await screen.findByRole("alert")).textContent)
      .toContain("표시 엔진이 바뀌어 이전 컷 준비를 중단했습니다.");
    expect(load).toHaveBeenCalledTimes(1);
    expect(host().sceneBaseDocument).toBe(original);
    expect(screen.getByRole("button", { name: "보존할 컷 · 초안" })).toBeDefined();
    expect(history.historyCommandTimelineRef.current).toBeNull();
  });

  it("복원 중 엔진 변경은 진행 중 세션을 다시 만들거나 늦은 원본을 적용하지 않는다", async () => {
    const { repository, data } = memory();
    vi.spyOn(repositoryModule, "getStudioWebAuthoringProjectV3Repository").mockReturnValue(repository);
    const pending = Promise.withResolvers<null>();
    const load = vi.spyOn(repository, "load").mockImplementationOnce(() => pending.promise);
    const rendered = render(<Workspace />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    const original = host().sceneBaseDocument;

    rendered.rerender(<Workspace rendererReady={false} />);
    expect(screen.getByRole("button", { name: "작업 취소" })).toBeDefined();
    expect(load).toHaveBeenCalledTimes(1);
    rendered.rerender(<Workspace rendererGeneration={1} />);
    await act(async () => { pending.resolve(null); });
    expect((await screen.findByRole("alert")).textContent)
      .toContain("표시 엔진이 바뀌어 이전 컷 준비를 중단했습니다.");
    expect(load).toHaveBeenCalledTimes(1);
    expect(host().sceneBaseDocument).toBe(original);
    expect(history.historyCommandTimelineRef.current).toBeNull();
    expect(data.size).toBe(0);
  });

  it("3컷 생성→원본 변경→승인 컷 보존→선택 업데이트→repository 저장→재진입을 실제 패널과 canonical host로 실행한다", async () => {
    const { repository, data } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    const rendered = render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    await createCut("첫 컷", 1);
    click("이 버전 승인");
    await createCut("둘째 컷", 2);
    await createCut("셋째 컷", 3);
    click("로컬 저장");
    await screen.findByText("로컬 컷 프로젝트를 저장했습니다.");
    const before = [...data.values()][0];
    const beforeProject = JSON.parse(before);
    const original = beforeProject.shotVersions.cuts[0];
    setCamera(9);
    click("첫 컷 · 승인");
    click("현재 원본과 비교");
    expect(screen.getByText(/장면 원본 변경됨/u)).toBeDefined();
    click("둘째 컷 · 초안");
    click("현재 원본과 비교");
    click("선택한 원본만 업데이트");
    expect(
      screen.getByRole("button", { name: "둘째 컷 · 재검토 필요" })
    ).toBeDefined();
    click("첫 컷 · 승인");
    click("이 컷으로 복귀");
    await screen.findByText(/고정한 컷으로 돌아왔습니다/u);
    expect(host().sceneBaseDocument.camera.position).toEqual([1, 2, 5]);
    expect(host().sceneBaseDocument.pinnedVersionedCut?.status).toBe(
      "approved"
    );
    expect(appliedViews).toHaveBeenLastCalledWith(
      expect.objectContaining({ position: [1, 2, 5] })
    );
    expect(
      history.historyCommandTimelineRef.current?.readSnapshot().history.at(-1)
        ?.commandId
    ).toBe("scene3d.cut.restore");
    click("로컬 저장");
    await screen.findByText("로컬 컷 프로젝트를 저장했습니다.");
    const saved = JSON.parse([...data.values()][0]);
    expect(saved.shotVersions.cuts).toHaveLength(3);
    expect(saved.shotVersions.cuts[0]).toEqual(original);
    rendered.unmount();
    render(<Workspace />);
    await screen.findByText("저장한 컷과 원본을 복원했습니다.");
    expect(screen.getByRole("button", { name: "첫 컷 · 승인" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "둘째 컷 · 재검토 필요" })
    ).toBeDefined();
    expect(
      screen.getByRole("button", { name: "셋째 컷 · 초안" })
    ).toBeDefined();
    expect(host().sceneBaseDocument.camera.position).toEqual([1, 2, 5]);
  });
  it("이름·복제·삭제·컷 history와 JSON 가져오기를 실제 패널에서 실행한다", async () => {
    const { repository, data } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    await createCut("원본", 1);
    click("컷 복제");
    fireEvent.change(screen.getByLabelText("컷 이름"), {
      target: { value: "수정본" },
    });
    click("이름 변경");
    click("컷 삭제");
    expect(screen.queryByRole("button", { name: "수정본 · 초안" })).toBeNull();
    click("컷 실행 취소");
    expect(screen.getByRole("button", { name: "수정본 · 초안" })).toBeDefined();
    click("로컬 저장");
    await screen.findByText("로컬 컷 프로젝트를 저장했습니다.");
    const raw = [...data.values()][0];
    click("컷 삭제");
    fireEvent.change(screen.getByLabelText("프로젝트 JSON"), {
      target: { value: raw },
    });
    click("JSON 가져오기");
    await screen.findByText(/JSON 백업을 가져왔습니다/u);
    expect(screen.getByRole("button", { name: "원본 · 초안" })).toBeDefined();
    expect(screen.getByRole("button", { name: "수정본 · 초안" })).toBeDefined();
  });
  it("복귀는 입력 잠금과 잘못된 프로젝트를 거부하며 history를 건드리지 않는다", async () => {
    const { repository } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    const h = host();
    const adapter = createStudioScene3dCutBg3dHost(h);
    const source = adapter.readSource();
    Object.assign(h, { isCapturing: true });
    await expect(
      adapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/장면 복원/u);
    Object.assign(h, { isCapturing: false });
    for (const [key, value] of Object.entries({
      captureInFlightRef: { current: true },
      modelImportAbortRef: { current: new AbortController() },
      sceneRestoreAbortRef: { current: new AbortController() },
      destructiveMutationGuardRef: { current: { blocksClose: true } },
      placementSessionRef: { current: { phase: "preview" } },
      physicsPhaseRef: { current: "running" },
      physicsInteractionLocked: true,
      deletingModelId: "deleting-model",
    })) {
      Object.assign(h, { [key]: value });
      await expect(
        adapter.applySource(source, null, new AbortController().signal)
      ).rejects.toThrow(/장면 복원/u);
      Object.assign(h, { [key]: undefined });
    }
    const renderer = h.modelRenderer;
    Object.assign(h, { modelRenderer: undefined });
    await expect(
      adapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/^표시 엔진이 바뀌어 이전 컷 준비를 중단했습니다\.$/u);
    const unreadyAdapter = createStudioScene3dCutBg3dHost(h);
    await expect(
      unreadyAdapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/렌더러 준비/u);
    Object.assign(h, { modelRenderer: renderer });
    await expect(
      adapter.applySource(
        { ...source, scene: { ...source.scene, documentId: "other" } },
        null,
        new AbortController().signal
      )
    ).rejects.toThrow(/다른 장면/u);
    expect(history.historyCommandTimelineRef.current).toBeNull();
  });
  it("다른 modal 세션의 완료를 차단하고 보류 카메라와 실제 적용 상태를 구분한다", async () => {
    const { repository } = memory();
    vi.spyOn(
      repositoryModule,
      "getStudioWebAuthoringProjectV3Repository"
    ).mockReturnValue(repository);
    render(<Workspace />);
    await screen.findByText("새 컷 프로젝트가 준비되었습니다.");
    const h = host();
    const sessionRef = { current: { id: "first" } };
    Object.assign(h, { modalAssetSessionRef: sessionRef });
    const staleAdapter = createStudioScene3dCutBg3dHost(h);
    const source = staleAdapter.readSource();
    sessionRef.current = { id: "second" };
    await expect(
      staleAdapter.applySource(source, null, new AbortController().signal)
    ).rejects.toThrow(/세션이 바뀌어/u);
    expect(history.historyCommandTimelineRef.current).toBeNull();
    const adapter = createStudioScene3dCutBg3dHost(h);
    appliedViews.mockReturnValueOnce(false);
    await act(async () => {
      expect(
        await adapter.applySource(source, null, new AbortController().signal)
      ).toBe("deferred");
    });
    expect(h.pendingInitialCameraRef.current).toEqual(
      host().sceneBaseDocument.camera
    );
    const pending = host().pendingInitialCameraRef;
    pending.current = {
      ...host().sceneBaseDocument.camera,
      position: [99, 99, 99],
    };
    await act(async () => {
      expect(
        await adapter.applySource(source, null, new AbortController().signal)
      ).toBe("applied");
    });
    expect(pending.current).toBeNull();
  });
});
