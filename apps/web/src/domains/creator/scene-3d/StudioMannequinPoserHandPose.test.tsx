// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN } from "./studio-mannequin-lighting";
import { snapshotStudioMannequinLightingPlan } from "./studio-mannequin-scene";

import type { StudioMannequinSpec } from "./studio-mannequin-model";
import type { StudioMannequinSceneHandle } from "./studio-mannequin-scene";

const sceneMocks = vi.hoisted(() => {
  const setBodySpec = vi.fn<(spec: StudioMannequinSpec) => void>();
  const setEcorcheState = vi.fn();
  return { setBodySpec, setEcorcheState };
});

const sceneHandle: StudioMannequinSceneHandle = {
  setBodySpec: sceneMocks.setBodySpec,
  setEcorcheState: sceneMocks.setEcorcheState,
  setPose: vi.fn(),
  getPose: vi.fn(() => ({ joints: {}, pelvisOffset: [0, 0, 0] as const })),
  setJointRotation: vi.fn(),
  getJointRotation: vi.fn(() => [0, 0, 0] as const),
  selectJoint: vi.fn(),
  setMaterialStyle: vi.fn(),
  getMaterialStyle: vi.fn(() => "wood" as const),
  setOutlineMode: vi.fn(),
  getOutlineMode: vi.fn(() => "auto" as const),
  setShowJointRangeArc: vi.fn(),
  getShowJointRangeArc: vi.fn(() => true),
  setLightingRig: vi.fn(),
  getLightingRig: vi.fn(() => null),
  getLightingPlan: vi.fn(() => STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN),
  getLightingSnapshot: vi.fn(() => snapshotStudioMannequinLightingPlan(STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN)),
  setCameraPreset: vi.fn(),
  setProjection: vi.fn(),
  getProjection: vi.fn(() => "perspective" as const),
  setQuadView: vi.fn(),
  setCameraFovDeg: vi.fn(),
  resetCamera: vi.fn(),
  resize: vi.fn(),
  invalidate: vi.fn(),
  captureDataUrl: vi.fn(async () => ({
    pngDataUrl: "data:image/png;base64,AAAA",
    width: 640,
    height: 480,
    displayWidth: 320,
    displayHeight: 240,
  })),
  dispose: vi.fn(),
};

vi.mock("./studio-mannequin-scene", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-mannequin-scene")>();
  return {
    ...actual,
    createStudioMannequinScene: () => sceneHandle,
  };
});

vi.mock("./studio-mannequin-bg3d-preset-sqlite-repository", () => ({
  getProductStudioMannequinStateSqliteRepository: () => ({
    authority: "sqlite",
    load: vi.fn(async () => null),
    save: vi.fn(async (state: unknown) => state),
  }),
}));

const { StudioMannequinPoseSection } = await import("./StudioMannequinPoserPoseSection");
const { StudioMannequinPoserPanel } = await import("./StudioMannequinPoserPanel");

beforeEach(() => {
  sceneMocks.setBodySpec.mockClear();
  sceneMocks.setEcorcheState.mockClear();
});

afterEach(cleanup);

describe("StudioMannequinPoseSection · StudioMannequinPoserPanel — 손 포즈 실시간 본 연동", () => {
  it("손 포즈 프리셋 <details>를 열면 StudioHandPosePanel이 표시되고 프리셋 선택 시 콜백을 호출한다", () => {
    const onHandPoseChange = vi.fn();

    const { container } = render(
      <StudioMannequinPoseSection
        selectedCategory="all"
        onCategorySelect={vi.fn()}
        onApplyPreset={vi.fn()}
        onApplyWebtoonPreset={vi.fn()}
        onMirror={vi.fn()}
        onResetJoints={vi.fn()}
        onHandPoseChange={onHandPoseChange}
      />,
    );

    const details = container.querySelector("details");
    expect(details).toBeTruthy();
    expect(screen.getByText("손 포즈 프리셋")).toBeTruthy();

    if (details) details.open = true;
    fireEvent.click(screen.getByRole("button", { name: "주먹 쥐기" }));
    expect(onHandPoseChange).toHaveBeenCalledTimes(1);
    expect(onHandPoseChange.mock.calls[0]![0].index.flex).toBeCloseTo(0.95, 2);
  });

  it("마네킹 패널에서 손 포즈 프리셋 및 손가락 슬라이더 조작 시 실시간 손가락 본(setBodySpec · setEcorcheState)을 갱신한다", async () => {
    render(
      <StudioMannequinPoserPanel
        open
        presentation="page"
        onClose={vi.fn()}
        onInsert={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(sceneMocks.setBodySpec).toHaveBeenCalled();
    });

    const summary = screen.getByText("손 포즈 프리셋");
    const details = summary.closest("details");
    expect(details).toBeTruthy();
    if (details) details.open = true;

    sceneMocks.setBodySpec.mockClear();
    sceneMocks.setEcorcheState.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "주먹 쥐기" }));

    await waitFor(() => {
      expect(sceneMocks.setBodySpec).toHaveBeenCalled();
      expect(sceneMocks.setEcorcheState).toHaveBeenCalled();
    });

    const latestEcorcheCall = sceneMocks.setEcorcheState.mock.calls.at(-1)?.[0] as {
      fingerPose: Record<"left" | "right", { index: readonly [number, number, number] }>;
      rightSplayDeg: { index?: number };
    };
    expect(latestEcorcheCall.fingerPose.right.index[0]).toBe(95);
    expect(latestEcorcheCall.fingerPose.left.index).toEqual([95, 95, 95]);

    fireEvent.click(screen.getByRole("button", { name: /검지/ }));
    const sliders = screen.getAllByRole("slider");
    const spreadSlider = sliders.find((el) => el.getAttribute("min") === "-100");
    expect(spreadSlider).toBeTruthy();
    if (spreadSlider) {
      fireEvent.change(spreadSlider, { target: { value: "50" } });
    }

    await waitFor(() => {
      const updated = sceneMocks.setEcorcheState.mock.calls.at(-1)?.[0] as {
        leftSplayDeg: { index?: number };
        rightSplayDeg: { index?: number };
      };
      expect(updated.rightSplayDeg.index).toBe(9);
      expect(updated.leftSplayDeg.index).toBe(9);
    });
  });
});
