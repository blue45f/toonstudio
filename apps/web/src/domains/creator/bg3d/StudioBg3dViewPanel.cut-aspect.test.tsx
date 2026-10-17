// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createDefaultStudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import {
  STUDIO_BG3D_SHOT_BATCH_PASSES,
  STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
} from "./studio-bg3d-shot-batch-pass-catalog";
import { StudioBg3dViewPanel } from "./StudioBg3dViewPanel";

import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";
import type { StudioBg3dViewPanelProps } from "./StudioBg3dViewPanelContent";

// 실제 런타임 브리지(셸)와 시네마틱 디렉터는 그대로 쓰고, 나머지 보기 도구 화면만 뺀다.
vi.mock("./StudioBg3dViewPanelContent", async () => {
  const { StudioBg3dCinematicDirectorPanel } = await import("./StudioBg3dCinematicDirectorPanel");
  return {
    StudioBg3dViewPanel: StudioBg3dCinematicDirectorPanel,
    StudioBg3dAiReferenceAction: () => null,
    StudioBg3dBabylonDiagnostic: () => null,
  };
});
vi.mock("./StudioBg3dSpatialStoryboardLauncher", () => ({
  StudioBg3dSpatialStoryboardLauncher: () => null,
}));

// 디렉터와 생산 워크플로 패널이 함께 그려지므로 느린 병렬 실행에서도 넉넉히 기다린다.
vi.setConfig({ testTimeout: 30000 });

afterEach(cleanup);

function documentWithRatio(exportAspectRatio: number | null): StudioBg3dSceneDocument {
  const base = createDefaultStudioBg3dSceneDocument();
  const { exportAspectRatio: _removed, ...output } = base.output;
  return {
    ...base,
    output: exportAspectRatio === null ? output : { ...output, exportAspectRatio },
  };
}

function shellProps(
  document: StudioBg3dSceneDocument,
  onSetCaptureAspectRatio?: (ratio: number | null) => void,
): StudioBg3dViewPanelProps {
  const context = {
    sceneBaseDocument: document,
    selectedIds: new Set<string>(),
    lineArtPreview: false,
    transparentInsert: false,
    selectedShotBatchPasses: [],
    STUDIO_BG3D_SHOT_BATCH_PASSES,
    STUDIO_BG3D_SHOT_BATCH_PASS_LABELS,
    LT_EXPORT_HEIGHTS: [640, 1080, 1440, 2160, 4096],
    shotBatchBlockedReason: null,
    shotBatchSelectedIds: [],
    savedShots: [],
    viewEditorSection: "prosuite",
    recoveryScope: null,
    isCapturing: false,
    isBatchRenderingShots: false,
    isRestoringScene: false,
    physicsInteractionLocked: false,
    updateCameraLens: vi.fn(),
    previewCameraLens: vi.fn(),
    finishCameraLensGesture: vi.fn(),
    captureCurrentShot: vi.fn(),
    applySavedShot: vi.fn(),
    moveSavedShot: vi.fn(),
    removeSavedShot: vi.fn(),
  } satisfies Partial<StudioBg3dViewPanelProps["context"]>;
  return {
    context,
    ...(onSetCaptureAspectRatio ? { onSetCaptureAspectRatio } : {}),
  } as unknown as StudioBg3dViewPanelProps;
}

function cutRatioSelect(): HTMLSelectElement {
  return screen.getByRole("combobox", { name: /컷 비율/ }) as HTMLSelectElement;
}

describe("director cut ratio through the real view-panel runtime bridge", () => {
  it("shows the document's capture ratio and writes a change back through the editor command", () => {
    const setRatio = vi.fn();
    render(<StudioBg3dViewPanel {...shellProps(documentWithRatio(16 / 9), setRatio)} />);
    expect(cutRatioSelect().value).toBe("16:9");
    expect(screen.queryByText(/컷 비율 \(메모\)/)).toBeNull();

    fireEvent.change(cutRatioSelect(), { target: { value: "4:5" } });
    expect(setRatio).toHaveBeenCalledWith(0.8);
    fireEvent.change(cutRatioSelect(), { target: { value: "free" } });
    expect(setRatio).toHaveBeenLastCalledWith(null);
  });

  it("starts in automatic when the document has no fixed ratio", () => {
    render(<StudioBg3dViewPanel {...shellProps(documentWithRatio(null), vi.fn())} />);
    expect(cutRatioSelect().value).toBe("free");
  });

  it("stays a memo when the editor does not provide the ratio command", () => {
    render(<StudioBg3dViewPanel {...shellProps(documentWithRatio(16 / 9))} />);
    expect(screen.getByText(/컷 비율 \(메모\)/)).toBeTruthy();
  });
});
