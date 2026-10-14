// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dCutStripPanel } from "./StudioBg3dCutStripPanel";
import {
  createStoryboardCutFromSceneCapture,
  type SceneLinkedStoryboardCut,
  type StoryboardSceneDocumentView,
} from "./studio-bg3d-storyboard-cut-link";
import type { StoryboardCut } from "../scene-3d/studio-3d-storyboard-cut-strip";

vi.setConfig({ testTimeout: 30000 });

const documentView: StoryboardSceneDocumentView = {
  camera: { position: [3, 2, 6], target: [0, 1.2, 0], fovDegrees: 42 },
  lighting: {
    ambientColor: "#404040",
    ambientIntensity: 0.5,
    key: { color: "#ffffff", direction: [0.5, 1, 0.25], intensity: 1.2, castsShadow: true },
    fill: { color: "#88aaff", direction: [-0.5, 0.4, 0.6], intensity: 0.4, castsShadow: false },
  },
  render: { exposure: 1.1 },
  nodes: [
    {
      kind: "model",
      id: "char-1",
      name: "주인공",
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      visible: true,
      locked: false,
      castsShadow: true,
      receivesShadow: true,
      attachmentId: "att-1",
      pose: { enabled: true, weight: 1, joints: [] },
    },
  ],
  shots: [{ id: "shot-1", name: "오프닝 와이드" }],
  activeShotId: "shot-1",
};

const template: SceneLinkedStoryboardCut = createStoryboardCutFromSceneCapture({
  cutId: "template-cut",
  cutNumber: 1,
  sceneId: "scene-ep12-cafe",
  document: documentView,
  image: { ref: "capture-asset-1", width: 1600, height: 900 },
});

const plainCut: StoryboardCut = {
  id: "cut-plain",
  cutNumber: 2,
  title: "손으로 만든 컷",
  aspectRatio: "1:1-square-medium",
  cameraPosition: [0, 1.6, 6],
  cameraTarget: [0, 1.4, 0],
  cameraFovDeg: 45,
  cameraRollDeg: 0,
  characterIds: [],
};

function renderPanel(overrides: Partial<Parameters<typeof StudioBg3dCutStripPanel>[0]> = {}) {
  const handlers = {
    onAddCut: vi.fn(),
    onRemoveCut: vi.fn(),
    onMoveCut: vi.fn(),
    onUpdateCutAspect: vi.fn(),
    onReturnToScene: vi.fn(),
  };
  const view = render(
    <StudioBg3dCutStripPanel
      cuts={[template, plainCut]}
      sceneCutTemplate={template}
      {...handlers}
      {...overrides}
    />,
  );
  return { view, ...handlers };
}

describe("StudioBg3dCutStripPanel — 3D 씬 → 컷 직행", () => {
  afterEach(cleanup);

  it("places the current scene as a new cut with its meta through onAddCut", () => {
    const { onAddCut } = renderPanel();
    const button = screen.getByTestId("bg3d-place-scene-as-cut");
    expect(button.textContent).toContain("현재 3D 씬을 컷으로 배치");
    fireEvent.click(button);
    expect(onAddCut).toHaveBeenCalledOnce();
    const placed = onAddCut.mock.calls[0]?.[0] as SceneLinkedStoryboardCut;
    expect(placed.id).not.toBe("template-cut");
    expect(placed.cutNumber).toBe(3);
    expect(placed.sceneMeta.sceneId).toBe("scene-ep12-cafe");
    expect(placed.sceneMeta.camera.fovDegrees).toBe(42);
    expect(screen.getByRole("status").textContent).toContain("카메라·포즈·조명이 함께 저장돼");
  });

  it("shows the scene badge only on linked cuts and returns to the scene on demand", () => {
    const { onReturnToScene } = renderPanel();
    expect(screen.getAllByText("3D 씬 연결 · FOV 42° · 포즈 1개 · 조명 보존")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "오프닝 와이드 3D 씬으로 복귀" }));
    expect(onReturnToScene).toHaveBeenCalledOnce();
    const returned = onReturnToScene.mock.calls[0]?.[0] as SceneLinkedStoryboardCut;
    expect(returned.id).toBe("template-cut");
    expect(returned.sceneMeta.shotId).toBe("shot-1");
  });

  it("hides the return button without a handler but keeps the badge", () => {
    renderPanel({ onReturnToScene: undefined });
    expect(screen.queryByRole("button", { name: /3D 씬으로 복귀/ })).toBeNull();
    expect(screen.getAllByText("3D 씬 연결 · FOV 42° · 포즈 1개 · 조명 보존")).toHaveLength(1);
  });

  it("locks placement with guidance when no scene is captured yet", () => {
    renderPanel({ sceneCutTemplate: null });
    const button = screen.getByTestId("bg3d-place-scene-as-cut") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/구도를 잡으면 현재 화면을 바로 컷으로/)).toBeDefined();
  });

  it("renders no scene placement UI when the template prop is not provided", () => {
    render(
      <StudioBg3dCutStripPanel
        cuts={[plainCut]}
        onAddCut={vi.fn()}
        onRemoveCut={vi.fn()}
        onMoveCut={vi.fn()}
        onUpdateCutAspect={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("bg3d-place-scene-as-cut")).toBeNull();
    expect(screen.queryByText(/3D 씬 연결/)).toBeNull();
  });
});
