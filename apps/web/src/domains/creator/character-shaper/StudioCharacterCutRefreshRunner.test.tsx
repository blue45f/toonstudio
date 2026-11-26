// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";
import StudioCharacterCutRefreshRunner from "./StudioCharacterCutRefreshRunner";
import type { StudioCharacterShaperProps } from "./StudioCharacterShaper";
import type { PageState } from "../studio-page-state";
import type { StudioCuttoonEditorViewSession } from "../studio-cuttoon-editor/StudioCuttoonEditorViewSession";

const harness = vi.hoisted(() => ({
  revision: 4, capture: vi.fn<(props: StudioCharacterShaperProps) => void>(),
}));
vi.mock("./StudioCharacterShaper", () => ({
  StudioCharacterShaper: (props: StudioCharacterShaperProps) => { harness.capture(props); return null; },
}));
vi.mock("../character-platform/document/character-document-v3-repository", () => ({
  getCharacterDocumentV3Repository: () => ({ load: async (documentId: string) => ({ documentId, revision: harness.revision }) }),
}));

const red = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAA1BMVEX/AAAZ4gk3AAAADklEQVR4AWMYBaOAAgAAAkAAAZJBeAIAAAAASUVORK5CYII=";
const green = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABAAQMAAACQp+OdAAAAA1BMVEUA/wA0XsCoAAAADklEQVR4AWMYBaOAAgAAAkAAAZJBeAIAAAAASUVORK5CYII=";
const baseScene = createStudioVrmSceneDocument({ source: "bundled", id: "base-model", name: "모델" });
const documentId = "character:library/hero-42";
function mount(count: number) {
  const elements = Array.from({ length: count }, (_, index) => ({
    id: "cut-" + index, type: "image" as const, src: red, x: index * 10, y: 10, width: 60, height: 60, rotation: 0,
    vrmScene: { ...baseScene, characterDocumentId: documentId, pose: { ...baseScene.pose, yOffset: index / 10 },
      camera: { ...baseScene.camera, fovDegrees: 35 + index }, render: { ...baseScene.render, width: 64, height: 64 } },
  }));
  const page: PageState = { id: "page-a", bg: "#ffffff", bgGrad: null, canvasH: 720, elements };
  const ticket = { accessGeneration: 1, documentGeneration: 2, authScopeKey: null, workId: null };
  const session = {
    masterEditMode: false, pageEditLocked: false, collaborationDocumentLocked: false,
    currentPageIdRef: { current: page.id }, pagesHiRef: { current: 0 }, pagesHistoryRef: { current: [[page]] },
    canApplyStudioMutation: vi.fn(() => true), commit: vi.fn<StudioCuttoonEditorViewSession["commit"]>(() => true),
  };
  const onClose = vi.fn();
  render(<StudioCharacterCutRefreshRunner request={{ documentId, page, ticket }} session={session} onClose={onClose} />);
  return { session, elements, onClose };
}
async function currentJob(index: number, total: number) {
  await screen.findByText(new RegExp(index + " / " + total));
  return waitFor(() => {
    const props = harness.capture.mock.lastCall?.[0];
    // Progress is visible before the lazy WebGL surface finishes mounting.
    if (!props?.initialScene || !props.linkedCutCapture || props.initialScene.camera.fovDegrees !== 34 + index) {
      throw Error("해당 컷의 캡처를 마운트하지 못했습니다.");
    }
    return { props, scene: props.initialScene, guard: props.linkedCutCapture };
  });
}
async function complete(job: Awaited<ReturnType<typeof currentJob>>) {
  await act(async () => {
    const accepted = await job.props.onInsert({ pngDataUrl: green, width: 64, height: 64, scene: job.scene });
    expect(accepted).toBe(true);
    job.props.onClose();
  });
}

beforeEach(() => { harness.revision = 4; harness.capture.mockClear(); });
afterEach(cleanup);

it("각 컷의 포즈·카메라·PNG를 순서대로 전달하고 성공한 컷만 실행 취소 한 번으로 반영한다", async () => {
  const { session, elements } = mount(3);
  const first = await currentJob(1, 3);
  expect(first.props.initialDataUrl).toBe(red);
  expect(first.scene).toEqual(elements[0]!.vrmScene);
  await complete(first);
  const second = await currentJob(2, 3);
  expect(second.scene).toEqual(elements[1]!.vrmScene);
  await act(async () => second.guard.onFailure("missing mesh"));
  const third = await currentJob(3, 3);
  expect(third.scene).toEqual(elements[2]!.vrmScene);
  expect(session.commit).not.toHaveBeenCalled();
  await complete(third);
  await screen.findByText(/cut-1 · missing mesh/);
  expect(session.commit).toHaveBeenCalledOnce();
  const [next, , pageId] = session.commit.mock.calls[0]!;
  expect(pageId).toBe("page-a");
  expect(next.map(layer => layer.type === "image" && layer.src)).toEqual([green, red, green]);
  expect(next[1]).toBe(elements[1]);
});

it("렌더 중 캐릭터 revision이 바뀌면 이전 PNG를 커밋하지 않는다", async () => {
  const { session } = mount(1);
  const job = await currentJob(1, 1);
  harness.revision++;
  await complete(job);
  await screen.findByText(/캐릭터가 변경|The character changed/);
  expect(session.commit).not.toHaveBeenCalled();
});

it("취소 뒤에 도착하는 렌더 결과를 폐기한다", async () => {
  const { session, onClose } = mount(1);
  const job = await currentJob(1, 1);
  fireEvent.click(screen.getByRole("button", { name: /갱신 취소|Cancel refresh/ }));
  expect(onClose).toHaveBeenCalledOnce();
  expect(await job.props.onInsert({ pngDataUrl: green, width: 64, height: 64, scene: job.scene })).toBe(false);
  expect(session.commit).not.toHaveBeenCalled();
});
