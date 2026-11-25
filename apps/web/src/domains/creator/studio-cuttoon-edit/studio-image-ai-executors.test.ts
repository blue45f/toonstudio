import { describe, expect, it, vi } from "vitest";

import { STUDIO_AI_DEFAULT_SETTINGS } from "../ai/studio-ai-settings";
import { colorizeLineArt, generateBackgroundImage, generateConsistentCharacterImage, suggestColorPalette } from "../ai/studio-ai-client-lazy";
import { createColorizeCandidateSession, selectColorizeCandidate, type StudioAiColorizeCandidateSession } from "../ai/studio-ai-colorize-candidates";
import type { StudioAiGeneratedAssetProvenance } from "../ai/studio-ai-generated-asset-model";
import { isStudioEditorMutationContinuationAllowed, type StudioEditorMutationTicket } from "../studio-editor-scope";
import type { El } from "../studio-element-model";
import { createEmptyDocumentMaster, withMasterElements } from "../studio-master-page";
import type { PageState } from "../studio-page-state";
import { applyStudioImageAiCandidate, createStudioImageAiExecutors, type StudioColorizeTarget } from "./studio-image-ai-executors";
import { cancelStudioAiRequest, runStudioExecuteSuggestColorPalette } from "./studio-host-wave2-ai-assist-helpers";

vi.mock("../ai/studio-ai-client-lazy", async (importOriginal) => ({
  ...await importOriginal<typeof import("../ai/studio-ai-client-lazy")>(),
  colorizeLineArt: vi.fn(),
  generateBackgroundImage: vi.fn(),
  generateConsistentCharacterImage: vi.fn(),
  suggestColorPalette: vi.fn(),
}));

const generatedImage = "data:image/png;base64,Z2VuZXJhdGVk";
const ticket: StudioEditorMutationTicket = { accessGeneration: 0, documentGeneration: 0, authScopeKey: null, workId: null };

function frame(id: string, background: string): Extract<El, { type: "frame" }> {
  return { id, type: "frame", x: 0, y: 0, width: 200, height: 150, bg: background };
}

function page(id: string, elements: El[], groups?: PageState["groups"]): PageState {
  return { id, elements, groups, bg: "#fff", bgGrad: null, canvasH: 1080 };
}

function createRequestContext(initialPages: PageState[], selected: El | null) {
  let currentPages = initialPages;
  const currentPageIdRef = { current: "cut-a" };
  const commitPages = vi.fn<(next: PageState[]) => boolean>(() => true);
  const setFailure = vi.fn();
  const patchEl = vi.fn(() => true);
  const setMenu = vi.fn();
  const context = {
    currentPageIdRef,
    readCurrentPages: () => currentPages,
    requestSurface: { kind: "page", pageId: "cut-a" } as const,
    masterEditModeRef: { current: false },
    readCurrentMasterElements: () => [],
    patchMasterImageEl: vi.fn(() => true),
    selected,
    elements: initialPages.flatMap((item) => item.id === "cut-a" ? item.elements : []),
    canvasH: 1080,
    aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
    t: (key: string) => key,
    canApplyStudioMutation: () => true,
    beginTrackedStudioAiOperation: () => "background-operation",
    settleTrackedStudioAiOperation: vi.fn(),
    addRenderedImage: vi.fn(() => true),
    patchImageElOnPage: vi.fn(() => true),
    commit: vi.fn(() => true),
    setSelectedId: vi.fn(),
    setTool: vi.fn(),
    patchEl,
    commitPages,
    setFailure,
    setMenu,
  };
  return {
    context,
    moveToNextPage(latest: PageState[]) {
      currentPageIdRef.current = "cut-b";
      currentPages = latest;
    },
  };
}

function startBackgroundRequest(initialPages: PageState[], selected: El | null) {
  const { context, moveToNextPage } = createRequestContext(initialPages, selected);
  const controller = new AbortController();
  const response = Promise.withResolvers<Awaited<ReturnType<typeof generateBackgroundImage>>>();
  vi.mocked(generateBackgroundImage).mockReturnValueOnce(response.promise);
  const pending = createStudioImageAiExecutors(context).executeAiBackgroundGenerate(
    "비 내리는 거리",
    "1024x1024",
    ticket,
    controller,
  );

  return {
    ...context,
    controller,
    async finishAfterMovingToNextPage(latest: PageState[]) {
      moveToNextPage(latest);
      response.resolve({
        ok: true,
        data: { dataUrl: generatedImage, width: 1024, height: 1024, model: "fixture-model" },
      });
      await pending;
    },
  };
}

describe("페이지 이동 후 AI 배경 반영", () => {
  it.each([
    { label: "프레임이", frameLocked: true, groupLocked: false },
    { label: "소속 그룹이", frameLocked: false, groupLocked: true },
  ])("응답 전에 $label 잠기면 프레임과 다른 페이지를 그대로 둔다", async ({ frameLocked, groupLocked }) => {
    const selected = { ...frame("frame-a", "original-a"), groupId: "group-a" };
    const nextPage = page("cut-b", [frame("frame-b", "original-b")]);
    const request = startBackgroundRequest([page("cut-a", [selected]), nextPage], selected);

    await request.finishAfterMovingToNextPage([
      page("cut-a", [{ ...selected, locked: frameLocked }], [{ id: "group-a", name: "그룹 A", locked: groupLocked }]),
      nextPage,
    ]);

    expect(request.commitPages).not.toHaveBeenCalled();
    expect(request.patchEl).not.toHaveBeenCalled();
    expect(request.setFailure).toHaveBeenCalledWith("studio.hostStatus.bgApplyFailed");
    expect(request.setMenu).not.toHaveBeenCalled();
  });

  it("잠금이 없는 요청 프레임에만 배경을 넣고 그동안 이루어진 다른 편집을 보존한다", async () => {
    const selected = frame("frame-a", "original-a");
    const sibling = frame("frame-a2", "original-a2");
    const nextPage = page("cut-b", [frame("frame-b", "original-b")]);
    const request = startBackgroundRequest([page("cut-a", [selected, sibling]), nextPage], selected);

    const changedSibling = { ...sibling, bg: "edited-a2" };
    const editedNextPage = { ...nextPage, elements: [frame("frame-b", "edited-b")] };
    const latestOriginalPage = page("cut-a", [{ ...selected, width: 240 }, changedSibling]);
    await request.finishAfterMovingToNextPage([latestOriginalPage, editedNextPage]);

    expect(request.commitPages).toHaveBeenCalledExactlyOnceWith([
      {
        ...latestOriginalPage,
        elements: [
          {
            ...latestOriginalPage.elements[0],
            bg: generatedImage,
            aiProvenance: expect.objectContaining({ action: "generated" }),
            bundleSourceCredit: undefined,
          },
          changedSibling,
        ],
      },
      editedNextPage,
    ]);
    expect(request.patchEl).not.toHaveBeenCalled();
    expect(request.setFailure).not.toHaveBeenCalled();
    expect(request.setMenu).toHaveBeenCalledWith(null);
  });

  it("요청한 프레임이 사라지면 다른 프레임으로 바꿔 적용하지 않는다", async () => {
    const selected = frame("frame-a", "original-a");
    const sibling = frame("frame-a2", "original-a2");
    const nextPage = page("cut-b", [frame("frame-b", "original-b")]);
    const request = startBackgroundRequest([page("cut-a", [selected, sibling]), nextPage], selected);

    await request.finishAfterMovingToNextPage([page("cut-a", [sibling]), nextPage]);

    expect(request.commitPages).not.toHaveBeenCalled();
    expect(request.setFailure).toHaveBeenCalledWith("studio.hostStatus.bgApplyFailed");
  });

  it("프레임 전체에 넣는 배경도 대상 중 하나가 잠겼으면 한 번도 커밋하지 않는다", async () => {
    const first = frame("frame-a", "original-a");
    const second = { ...frame("frame-a2", "original-a2"), locked: true };
    const initialPages = [page("cut-a", [first, second]), page("cut-b", [])];
    const request = startBackgroundRequest(initialPages, null);

    await request.finishAfterMovingToNextPage(initialPages);

    expect(request.commitPages).not.toHaveBeenCalled();
    expect(request.setFailure).toHaveBeenCalledWith("studio.hostStatus.bgApplyFailed");
  });
});

function startMasterColorize(collectCandidate = false) {
  const image = {
    id: "master-image", type: "image", src: "master-original",
    x: 0, y: 0, width: 200, height: 150, rotation: 0,
  } satisfies El;
  const sibling = { ...image, id: "master-sibling", src: "master-sibling-original" };
  let master = withMasterElements(createEmptyDocumentMaster<El>(), [image, sibling]);
  const masterMode = { current: true };
  const initial = createRequestContext([page("cut-a", [])], image);
  const editorScope = { ...ticket, mounted: true, aborted: false, locked: false };
  const patchMaster = vi.fn((id: string, patch: { src: string }) => {
    master = withMasterElements(master, master.elements.map((el) => el.id === id ? { ...el, ...patch } : el));
    editorScope.documentGeneration += 1;
    return true;
  });
  const context = {
    ...initial.context, requestSurface: { kind: "master", pageId: "cut-a" } as const,
    masterEditModeRef: masterMode, readCurrentMasterElements: () => master.elements, patchMasterImageEl: patchMaster,
    canApplyStudioMutation: (request: typeof ticket) => isStudioEditorMutationContinuationAllowed(request, editorScope),
  };
  const target: StudioColorizeTarget = { surface: context.requestSurface, elementId: image.id, src: image.src, ticket };
  let candidateTarget = target;
  const candidates = {
    session: createColorizeCandidateSession(),
    provenanceById: new Map<string, StudioAiGeneratedAssetProvenance>(),
    setSession: vi.fn<(session: StudioAiColorizeCandidateSession) => void>(),
    setTarget: vi.fn(),
  };
  const response = Promise.withResolvers<Awaited<ReturnType<typeof colorizeLineArt>>>();
  vi.mocked(colorizeLineArt).mockReturnValueOnce(response.promise);
  const executors = createStudioImageAiExecutors(context);
  const pending = executors.executeAiColorize(target, "야간 채색", new AbortController(), collectCandidate ? candidates : undefined);
  return {
    context, candidates, image, masterMode, moveToNextPage: initial.moveToNextPage, patchMaster, target,
    replaceProject: () => { editorScope.documentGeneration += 1; },
    readMaster: () => master,
    replaceMaster: (elements: El[]) => { master = withMasterElements(master, elements); },
    sibling,
    async finish() {
      response.resolve({ ok: true, data: { dataUrl: generatedImage } });
      await pending;
    },
    async collectAnotherCandidate(dataUrl: string) {
      const candidateSession = candidates.setSession.mock.lastCall?.[0];
      if (!candidateSession) throw new Error("테스트에서 첫 채색 후보를 만들지 못했습니다.");
      vi.mocked(colorizeLineArt).mockResolvedValueOnce({ ok: true, data: { dataUrl } });
      await executors.executeAiColorize(target, "두 번째 채색", new AbortController(), { ...candidates, session: candidateSession });
    },
    applyCandidate(index = 0) {
      const candidateSession = candidates.setSession.mock.lastCall?.[0];
      const chosen = candidateSession?.candidates[index];
      if (!candidateSession || !chosen) throw new Error("테스트에서 적용할 채색 후보를 만들지 못했습니다.");
      const selection = selectColorizeCandidate(candidateSession, chosen.id);
      if (!selection.ok) throw new Error("테스트에서 채색 후보를 선택하지 못했습니다.");
      const appliedTarget = applyStudioImageAiCandidate(candidateTarget, context, {
        candidateSession: selection.session, candidateProvenanceRef: { current: candidates.provenanceById },
        canApplyMutation: context.canApplyStudioMutation, setError: context.setFailure,
        captureMutationTicket: () => ({ ...ticket, documentGeneration: editorScope.documentGeneration }),
      });
      if (appliedTarget) candidateTarget = appliedTarget;
      return appliedTarget;
    },
  };
}

describe("마스터 이미지 AI 채색 권위", () => {
  it("요청한 마스터에서만 채색하고 최신 요소 편집을 보존한다", async () => {
    const request = startMasterColorize();
    const latestImage = { ...request.image, width: 250 };
    const editedSibling = { ...request.sibling, src: "master-sibling-edited" };
    request.replaceMaster([latestImage, editedSibling]);
    await request.finish();

    expect(request.patchMaster).toHaveBeenCalledExactlyOnceWith(request.image.id, {
      src: generatedImage, aiProvenance: expect.objectContaining({ action: "edited" }),
    });
    expect(request.readMaster().elements).toEqual([
      { ...latestImage, src: generatedImage, aiProvenance: expect.objectContaining({ action: "edited" }) },
      editedSibling,
    ]);
    expect(request.context.patchImageElOnPage).not.toHaveBeenCalled();
    expect(request.context.setFailure).not.toHaveBeenCalled();
  });

  it("마스터 이미지에서도 원본과 연결된 후보를 모으고 확정 전에는 바꾸지 않는다", async () => {
    const request = startMasterColorize(true);
    await request.finish();
    expect(request.candidates.setSession).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      candidates: [expect.objectContaining({ dataUrl: generatedImage })],
    }));
    expect(request.patchMaster).not.toHaveBeenCalled();
    expect(request.context.patchImageElOnPage).not.toHaveBeenCalled();
    expect(request.candidates.setTarget).toHaveBeenCalledExactlyOnceWith(request.target);
    request.applyCandidate();
    expect(request.patchMaster).toHaveBeenCalledExactlyOnceWith(request.image.id, {
      src: generatedImage, aiProvenance: expect.objectContaining({ action: "edited" }),
    });
    expect(request.context.patchImageElOnPage).not.toHaveBeenCalled();
  });

  it("같은 세션에서 첫 적용으로 원고 세대가 바뀐 뒤에도 다른 후보를 연달아 적용한다", async () => {
    const request = startMasterColorize(true);
    const secondImage = "data:image/png;base64,c2Vjb25k";
    await request.finish();
    await request.collectAnotherCandidate(secondImage);
    const first = request.applyCandidate();
    request.applyCandidate(1);

    expect(request.patchMaster.mock.calls.map(([, patch]) => patch.src)).toEqual([generatedImage, secondImage]);
    expect(request.readMaster().elements[0]).toMatchObject({ id: request.image.id, src: secondImage });
    expect(first).toMatchObject({
      src: request.image.src, lastAppliedSrc: generatedImage,
      ticket: { documentGeneration: ticket.documentGeneration + 1 },
    });
    expect(request.context.setFailure).not.toHaveBeenCalled();
  });

  it("첫 적용 뒤 같은 ID의 원본이 외부에서 교체되면 둘째 후보로 덮지 않는다", async () => {
    const request = startMasterColorize(true);
    await request.finish();
    await request.collectAnotherCandidate("data:image/png;base64,c2Vjb25k");
    request.applyCandidate();
    request.replaceMaster([{ ...request.image, src: "replacement-outside-session" }]);
    expect(request.applyCandidate(1)).toBeUndefined();

    expect(request.patchMaster).toHaveBeenCalledTimes(1);
    expect(request.readMaster().elements[0]).toMatchObject({ src: "replacement-outside-session" });
    expect(request.context.setFailure).toHaveBeenCalledWith("채색 후보를 적용할 원본 이미지 레이어를 찾지 못했어요.");
  });

  it("커밋 실패 후에는 원래 소스를 기준으로 다시 적용할 수 있다", async () => {
    const request = startMasterColorize(true);
    await request.finish();
    request.patchMaster.mockReturnValueOnce(false);
    expect(request.applyCandidate()).toBeUndefined();
    expect(request.readMaster().elements[0]).toMatchObject({ src: request.image.src });
    request.applyCandidate();
    expect(request.readMaster().elements[0]).toMatchObject({ src: generatedImage });
  });

  it.each(["원본 교체", "마스터 종료", "레이어 잠금", "원고 교체"])("%s 뒤 늦은 채색은 같은 ID를 덮지 않는다", async (change) => {
    const request = startMasterColorize();
    if (change === "원본 교체") request.replaceMaster([{ ...request.image, src: "replacement-source" }]);
    if (change === "마스터 종료") {
      request.masterMode.current = false;
      request.moveToNextPage([page("cut-a", [request.image]), page("cut-b", [request.image])]);
    }
    if (change === "레이어 잠금") request.replaceMaster([{ ...request.image, locked: true }]);
    if (change === "원고 교체") request.replaceProject();
    await request.finish();
    expect(request.patchMaster).not.toHaveBeenCalled();
    expect(request.context.patchImageElOnPage).not.toHaveBeenCalled();
  });

  it.each(["원본 교체", "마스터 종료", "레이어 잠금"])("%s 뒤에는 이미 모은 후보도 다른 원본을 덮지 않는다", async (change) => {
    const request = startMasterColorize(true);
    await request.finish();
    if (change === "원본 교체") request.replaceMaster([{ ...request.image, src: "replacement-source" }]);
    if (change === "마스터 종료") {
      request.masterMode.current = false;
      request.moveToNextPage([page("cut-a", [request.image]), page("cut-b", [request.image])]);
    }
    if (change === "레이어 잠금") request.replaceMaster([{ ...request.image, locked: true }]);
    request.applyCandidate();
    expect(request.patchMaster).not.toHaveBeenCalled();
    expect(request.context.patchImageElOnPage).not.toHaveBeenCalled();
    expect(request.context.setFailure).toHaveBeenCalled();
  });

  it("동일 ID와 원본을 가진 새 원고에도 이전 원고에서 모은 후보를 적용하지 않는다", async () => {
    const request = startMasterColorize(true);
    await request.finish();
    request.replaceProject();
    request.applyCandidate();
    expect(request.patchMaster).not.toHaveBeenCalled();
    expect(request.context.patchImageElOnPage).not.toHaveBeenCalled();
  });
});

describe("마스터와 일반 페이지 사이의 AI 이미지 생성", () => {
  it.each(["master", "page"] as const)("생성 중 %s 화면을 벗어나면 배경과 캐릭터를 다른 권위에 쓰지 않는다", async (kind) => {
    const selected = frame("same-frame", "original-background");
    const pages = [page("cut-a", [selected]), page("cut-b", [selected])];
    const fixture = createRequestContext(pages, selected);
    const masterEditModeRef = { current: kind === "master" };
    const context = { ...fixture.context, requestSurface: { kind, pageId: "cut-a" }, masterEditModeRef };
    const executors = createStudioImageAiExecutors(context);
    const background = Promise.withResolvers<Awaited<ReturnType<typeof generateBackgroundImage>>>();
    const character = Promise.withResolvers<Awaited<ReturnType<typeof generateConsistentCharacterImage>>>();
    vi.mocked(generateBackgroundImage).mockReturnValueOnce(background.promise);
    vi.mocked(generateConsistentCharacterImage).mockReturnValueOnce(character.promise);
    const pendingBackground = executors.executeAiBackgroundGenerate("배경", "1024x1024", ticket, new AbortController());
    const reference = { elementId: "same-image", src: "character-original", width: 200, height: 100 };
    const pendingCharacter = executors.executeAiCharacterConsistency(reference, "캐릭터", ticket, new AbortController());

    masterEditModeRef.current = !masterEditModeRef.current;
    fixture.moveToNextPage(pages);
    const response = { ok: true, data: { dataUrl: generatedImage, width: 1024, height: 1024, model: "fixture-model" } } as const;
    background.resolve(response);
    character.resolve(response);
    await Promise.all([pendingBackground, pendingCharacter]);

    expect(context.patchEl).not.toHaveBeenCalled();
    expect(context.commit).not.toHaveBeenCalled();
    expect(context.commitPages).not.toHaveBeenCalled();
    expect(context.addRenderedImage).not.toHaveBeenCalled();
    expect(context.setMenu).not.toHaveBeenCalled();
    expect(context.setSelectedId).not.toHaveBeenCalled();
  });
});

describe("취소한 AI 요청의 늦은 응답", () => {
  it("배경 응답 정산 직후 취소해도 원고에 반영하지 않는다", async () => {
    const firstFrame = frame("frame-a", "original-a");
    const pages = [page("cut-a", [firstFrame]), page("cut-b", [])];
    const request = startBackgroundRequest(pages, firstFrame);
    request.settleTrackedStudioAiOperation.mockImplementationOnce(() => request.controller.abort());

    await request.finishAfterMovingToNextPage(pages);

    expect(request.controller.signal.aborted).toBe(true);
    expect(request.commitPages).not.toHaveBeenCalled();
    expect(request.patchEl).not.toHaveBeenCalled();
    expect(request.setMenu).not.toHaveBeenCalled();
  });

  it("채색 후보 요청을 취소하면 새 요청의 후보와 출처만 남긴다", async () => {
    const image: El = {
      id: "image-a", type: "image", src: "original-image",
      x: 0, y: 0, width: 200, height: 150, rotation: 0,
    };
    const { context } = createRequestContext([page("cut-a", [image])], image);
    const first = Promise.withResolvers<Awaited<ReturnType<typeof colorizeLineArt>>>();
    const second = Promise.withResolvers<Awaited<ReturnType<typeof colorizeLineArt>>>();
    vi.mocked(colorizeLineArt).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const firstController = new AbortController();
    const abortRef: { current: AbortController | null } = { current: firstController };
    const candidates = {
      session: createColorizeCandidateSession(),
      provenanceById: new Map<string, StudioAiGeneratedAssetProvenance>(),
      setSession: vi.fn(),
      setTarget: vi.fn(),
    };
    const execute = (controller: AbortController) => createStudioImageAiExecutors({
      ...context,
      canApplyStudioMutation: () => abortRef.current === controller,
    }).executeAiColorize({
      surface: context.requestSurface, elementId: image.id, src: image.src, ticket,
    }, "차분한 채색", controller, candidates);

    const pendingFirst = execute(firstController);
    expect(vi.mocked(colorizeLineArt).mock.lastCall?.[3]?.signal).toBe(firstController.signal);
    cancelStudioAiRequest(abortRef, vi.fn());
    const secondController = new AbortController();
    abortRef.current = secondController;
    const pendingSecond = execute(secondController);
    first.resolve({ ok: true, data: { dataUrl: "data:image/png;base64,YQ==" } });
    await pendingFirst;

    expect(firstController.signal.aborted).toBe(true);
    expect(secondController.signal.aborted).toBe(false);
    expect(candidates.setSession).not.toHaveBeenCalled();
    expect(candidates.provenanceById.size).toBe(0);
    expect(context.settleTrackedStudioAiOperation).toHaveBeenCalledExactlyOnceWith(
      "background-operation", { ok: false }, { aborted: true },
    );

    second.resolve({ ok: true, data: { dataUrl: generatedImage } });
    await pendingSecond;
    expect(candidates.setSession).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      candidates: [expect.objectContaining({ dataUrl: generatedImage })],
    }));
    expect(candidates.setTarget).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ elementId: "image-a" }));
    expect(candidates.provenanceById.size).toBe(1);
    expect(context.patchImageElOnPage).not.toHaveBeenCalled();
  });

  it("취소한 팔레트 응답은 새 팔레트 요청의 진행 상태나 결과를 덮지 않는다", async () => {
    const first = Promise.withResolvers<Awaited<ReturnType<typeof suggestColorPalette>>>();
    const second = Promise.withResolvers<Awaited<ReturnType<typeof suggestColorPalette>>>();
    vi.mocked(suggestColorPalette).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const abortRef: { current: AbortController | null } = { current: null };
    const setBusy = vi.fn();
    const setSuggestion = vi.fn();
    const settleTextOperation = vi.fn();
    const context = {
      collaborationLocked: false,
      busy: false,
      activePageId: "cut-a",
      aiSettings: STUDIO_AI_DEFAULT_SETTINGS,
      textAiTransport: { mode: "server" } as const,
      abortRef,
      isRequestScopeCurrent: () => true,
      pendingProvider: () => ({ provider: "fixture", model: "fixture-model", transport: "server" as const }),
      settleTextOperation,
      setBusy,
      setError: vi.fn(),
      setSuggestion,
      clearSavedMessage: vi.fn(),
    };

    const pendingFirst = runStudioExecuteSuggestColorPalette({
      ...context, moodText: "가을 저녁", beginTrackedOperation: () => "palette-first",
    });
    const firstSignal = vi.mocked(suggestColorPalette).mock.lastCall?.[2]?.signal;
    cancelStudioAiRequest(abortRef, setBusy);
    const pendingSecond = runStudioExecuteSuggestColorPalette({
      ...context, moodText: "겨울 아침", beginTrackedOperation: () => "palette-second",
    });
    const secondSignal = vi.mocked(suggestColorPalette).mock.lastCall?.[2]?.signal;
    setBusy.mockClear();
    setSuggestion.mockClear();
    const textProvenance = {
      provider: "fixture", model: "fixture-model", transport: "server", promptVersion: 1,
      createdAt: "2026-11-26T00:00:00.000Z",
    } as const;
    first.resolve({ ok: true, data: { name: "가을", colors: [{ hex: "#aa5500", role: "배경" }], textProvenance } });
    await pendingFirst;

    expect(firstSignal?.aborted).toBe(true);
    expect(secondSignal?.aborted).toBe(false);
    expect(setBusy).not.toHaveBeenCalled();
    expect(setSuggestion).not.toHaveBeenCalled();
    expect(settleTextOperation).toHaveBeenCalledExactlyOnceWith("palette-first", { ok: false }, undefined, true);

    const winter = { name: "겨울", colors: [{ hex: "#225577", role: "배경" }], textProvenance };
    second.resolve({ ok: true, data: winter });
    await pendingSecond;
    expect(setSuggestion).toHaveBeenCalledExactlyOnceWith(winter);
    expect(setBusy).toHaveBeenCalledExactlyOnceWith(false);
    expect(abortRef.current).toBeNull();
  });
});
