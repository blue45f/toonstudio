import { describe, expect, it, vi } from "vitest";

import { STUDIO_AI_DEFAULT_SETTINGS } from "../ai/studio-ai-settings";
import { generateBackgroundImage } from "../ai/studio-ai-client-lazy";
import type { El } from "../studio-element-model";
import type { PageState } from "../studio-page-state";
import { createStudioImageAiExecutors } from "./studio-image-ai-executors";

vi.mock("../ai/studio-ai-client-lazy", async (importOriginal) => ({
  ...await importOriginal<typeof import("../ai/studio-ai-client-lazy")>(),
  generateBackgroundImage: vi.fn(),
}));

const generatedImage = "data:image/png;base64,Z2VuZXJhdGVk";

function frame(id: string, background: string): Extract<El, { type: "frame" }> {
  return { id, type: "frame", x: 0, y: 0, width: 200, height: 150, bg: background };
}

function page(id: string, elements: El[], groups?: PageState["groups"]): PageState {
  return { id, elements, groups, bg: "#fff", bgGrad: null, canvasH: 1080 };
}

function startBackgroundRequest(initialPages: PageState[], selected: El | null) {
  let currentPages = initialPages;
  const currentPageIdRef = { current: "cut-a" };
  const elementById = new Map(initialPages.flatMap((item) => item.elements).map((item) => [item.id, item]));
  const response = Promise.withResolvers<Awaited<ReturnType<typeof generateBackgroundImage>>>();
  vi.mocked(generateBackgroundImage).mockReturnValueOnce(response.promise);

  const commitPages = vi.fn<(next: PageState[]) => boolean>(() => true);
  const setFailure = vi.fn();
  const patchEl = vi.fn(() => true);
  const setMenu = vi.fn();
  const context = {
    editorMountedRef: { current: true },
    currentPageIdRef,
    aiColorizeAbortRef: { current: null },
    pages: initialPages,
    readCurrentPages: () => currentPages,
    activePage: { id: "cut-a" },
    elementById,
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
    setBusy: vi.fn(),
    setFailure,
    setMenu,
  };
  const pending = createStudioImageAiExecutors(context).executeAiBackgroundGenerate(
    "비 내리는 거리",
    "1024x1024",
    { accessGeneration: 0, documentGeneration: 0, authScopeKey: null, workId: null },
  );

  return {
    commitPages,
    patchEl,
    setFailure,
    setMenu,
    async finishAfterMovingToNextPage(latest: PageState[]) {
      currentPageIdRef.current = "cut-b";
      currentPages = latest;
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
