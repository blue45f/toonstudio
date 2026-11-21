// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef, type PropsWithChildren, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
  STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
  STUDIO_BG3D_THREE_WEBGL_CAPTURE_IMPLEMENTATION_V1,
  type StudioBg3dCaptureAdapter,
} from "./studio-bg3d-capture-adapter";
import {
  STUDIO_BG3D_BAKED_CUT_HANDOFF_EVENT,
  buildBakedManuscriptCutLayer,
  buildReshootRestorePayload,
  clearBakedManuscriptCutLayers,
  getBakedManuscriptCutLayerForCut,
  listBakedManuscriptCutLayers,
  saveBakedManuscriptCutLayer,
  type BakedManuscriptCutLayer,
} from "./studio-bg3d-live-ink-bake-bridge";
import {
  buildContactAoPassRgba,
  buildDepthPassRgba,
  buildLiveInkLineRgbaFromEdgeMask,
  captureStudioBg3dLiveInkSnapshot,
} from "./studio-bg3d-live-ink-viewport-capture";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { StudioBg3dEditorModal, type StudioBg3dEditorModalHost } from "./StudioBg3dEditorModal";
import type { StudioBg3dSceneOutlinerController } from "./studio-bg3d-scene-outliner-controller";

vi.mock("./studio-bg3d-editor-runtime-bindings", () => ({}));
vi.mock("./StudioBg3dEditorViewport", () => ({
  StudioBg3dEditorViewport: () => <canvas data-testid="shared-viewport-canvas" />,
}));
vi.mock("./StudioBg3dEditorSidebar", () => ({ StudioBg3dEditorSidebar: () => null }));
vi.mock("../scene3d/StudioScene3dBg3dCutPanel", () => ({
  StudioScene3dBg3dCutPanel: () => <div data-testid="mock-cut-panel" />,
}));
vi.mock("./StudioBg3dSceneAssistantWorkspace", () => ({
  StudioBg3dSceneAssistantWorkspace: ({ viewport }: { viewport: ReactNode }) => (
    <div data-testid="mock-scene-assistant">{viewport}</div>
  ),
}));

const STUB_PNG_PREFIX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";

function stubCanvas2d(options: { readonly failOnToDataUrl?: boolean } = {}) {
  const createdCanvases: HTMLCanvasElement[] = [];
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tagName: string) => {
    const element = originalCreateElement(tagName);
    if (tagName.toLowerCase() === "canvas") {
      const canvas = element as HTMLCanvasElement;
      createdCanvases.push(canvas);
      vi.spyOn(canvas, "getContext").mockReturnValue({
        createImageData: (w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
          width: w,
          height: h,
        }),
        putImageData: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
      } as unknown as CanvasRenderingContext2D);
      vi.spyOn(canvas, "toDataURL").mockImplementation(() => {
        if (options.failOnToDataUrl) throw new Error("simulated-canvas-encode-failure");
        return `${STUB_PNG_PREFIX}${createdCanvases.length}`;
      });
    }
    return element;
  }) as typeof document.createElement);
  return createdCanvases;
}

function createSyntheticAdapter(): StudioBg3dCaptureAdapter {
  return {
    backend: "three-webgl",
    engineId: "three",
    engineVersion: "0.186.0",
    implementationRevision: STUDIO_BG3D_THREE_WEBGL_CAPTURE_IMPLEMENTATION_V1,
    graphicsApi: "webgl2",
    profileId: STUDIO_BG3D_CAPTURE_PROFILE_RGBA8_DEPTH_V1,
    normalProfile: STUDIO_BG3D_CAPTURE_NORMAL_PROFILE_V1,
    getSourceSize: () => ({ width: 960, height: 540 }),
    dispose: vi.fn(),
    capture: vi.fn(async (request) => {
      const { width, height } = request;
      const rgba = new Uint8ClampedArray(width * height * 4);
      const depth = new Float32Array(width * height);
      const normalRgba = new Uint8Array(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const idx = y * width + x;
          const insideSubject = x >= width * 0.25 && x <= width * 0.75 && y >= height * 0.2 && y <= height * 0.8;
          rgba[idx * 4] = insideSubject ? 220 : 24;
          rgba[idx * 4 + 1] = insideSubject ? 185 : 30;
          rgba[idx * 4 + 2] = insideSubject ? 160 : 44;
          rgba[idx * 4 + 3] = 255;
          depth[idx] = insideSubject ? 0.35 + (x / width) * 0.15 : 0.9999;
          normalRgba[idx * 4] = insideSubject ? 128 : 0;
          normalRgba[idx * 4 + 1] = insideSubject ? 200 : 0;
          normalRgba[idx * 4 + 2] = 255;
          normalRgba[idx * 4 + 3] = 255;
        }
      }
      return {
        width,
        height,
        rgba,
        depth,
        normalRgba,
      };
    }),
  };
}

function emptyOutlinerController(): StudioBg3dSceneOutlinerController {
  return {
    query: "",
    items: [],
    filteredItems: [],
    hierarchy: {
      roots: [],
      childrenByParent: new Map(),
      parentById: new Map(),
      repairedOrphans: 0,
      repairedSelfParents: 0,
      repairedCycles: 0,
    },
    selectedIds: new Set(),
    setQuery: vi.fn(),
    select: vi.fn(),
    rename: vi.fn(),
    toggleVisibility: vi.fn(),
    toggleLock: vi.fn(),
    duplicate: vi.fn(),
    remove: vi.fn(),
  };
}

function RouterWrapper({ children }: PropsWithChildren) {
  return <MemoryRouter initialEntries={["/studio/bg3d"]}>{children}</MemoryRouter>;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  clearBakedManuscriptCutLayers("doc-live-ink-e2e");
  clearBakedManuscriptCutLayers("doc-handoff-01");
});

describe("AC-004 Live Ink multipass capture, 2D cut persistence & 3D re-shoot restore", () => {
  it("captures shaded, scale-aware ink, depth, AO, and normal passes and releases temp canvases in try/finally", async () => {
    const canvases = stubCanvas2d();
    const adapter = createSyntheticAdapter();

    const snapshot = await captureStudioBg3dLiveInkSnapshot({
      adapter,
      document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      sceneId: "scene-classroom-01",
      cameraId: "shot-wide",
      stage: "live-ink",
      widthPx: 64,
      heightPx: 64,
      liveCamera: { position: [2.5, 1.7, 4.8], target: [0, 1.1, 0], fovDegrees: 38 },
      atmospherePresetId: "sunset",
      assetIds: ["asset-classroom", "asset-desk", "asset-classroom"],
      includeSceneDocumentJson: true,
    });

    expect(snapshot.widthPx).toBe(64);
    expect(snapshot.heightPx).toBe(64);
    expect(snapshot.shadedPassRef).toMatch(/^data:image\/png;base64,/);
    expect(snapshot.inkPassRef).toMatch(/^data:image\/png;base64,/);
    expect(snapshot.depthPassRef).toMatch(/^data:image\/png;base64,/);
    expect(snapshot.aoPassRef).toMatch(/^data:image\/png;base64,/);
    expect(snapshot.normalPassRef).toMatch(/^data:image\/png;base64,/);
    expect(snapshot.assetIds).toEqual(["asset-classroom", "asset-desk"]);
    expect(snapshot.camera).toEqual({
      position: [2.5, 1.7, 4.8],
      target: [0, 1.1, 0],
      fovDegrees: 38,
    });
    expect(snapshot.atmospherePresetId).toBe("sunset");
    expect(snapshot.inkAudit?.strategy).toBe("direct-native-extract");
    expect(snapshot.sceneDocumentJson).toContain('"camera"');

    // 모든 임시 2D 캔버스가 try/finally에서 1×1로 해제되어야 한다.
    expect(canvases.length).toBeGreaterThanOrEqual(4);
    for (const canvas of canvases) {
      expect(canvas.width).toBe(1);
      expect(canvas.height).toBe(1);
    }
  });

  it("releases temporary canvas backing store even if PNG encoding throws", async () => {
    const canvases = stubCanvas2d({ failOnToDataUrl: true });
    const adapter = createSyntheticAdapter();

    await expect(
      captureStudioBg3dLiveInkSnapshot({
        adapter,
        document: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
        sceneId: "scene-fail",
        stage: "live-ink",
        widthPx: 64,
        heightPx: 64,
      }),
    ).rejects.toThrow("simulated-canvas-encode-failure");

    expect(canvases).toHaveLength(1);
    expect(canvases[0]?.width).toBe(1);
    expect(canvases[0]?.height).toBe(1);
  });

  it("builds pure RGBA buffers for ink edge mask, depth, and contact AO passes", () => {
    const mask = new Uint8Array([0, 255, 0, 255]);
    const ink = buildLiveInkLineRgbaFromEdgeMask(mask, 2, 2);
    expect(ink[3]).toBe(0);
    expect(ink[7]).toBe(255);

    const depth = new Float32Array([0.2, 0.5, 0.8, 0.9999]);
    const depthRgba = buildDepthPassRgba(depth, 2, 2);
    expect(depthRgba[0]).toBe(255);
    expect(depthRgba[12]).toBe(0);

    const aoRgba = buildContactAoPassRgba(depth, 2, 2);
    expect(aoRgba[3]).toBe(255);
    expect(aoRgba[12]).toBe(255);
  });

  it("persists baked manuscript cut layer to handoff store, dispatches 2D bridge event, and restores 3D re-shoot payload", () => {
    const receivedEvents: BakedManuscriptCutLayer[] = [];
    const listener = (event: Event) => {
      receivedEvents.push((event as CustomEvent<BakedManuscriptCutLayer>).detail);
    };
    window.addEventListener(STUDIO_BG3D_BAKED_CUT_HANDOFF_EVENT, listener);

    const result = buildBakedManuscriptCutLayer({
      capture: {
        sceneId: "scene-rooftop",
        cameraId: "cam-hero",
        stage: "live-ink",
        widthPx: 960,
        heightPx: 540,
        inkPassRef: `${STUB_PNG_PREFIX}ink`,
        shadedPassRef: `${STUB_PNG_PREFIX}shaded`,
        depthPassRef: `${STUB_PNG_PREFIX}depth`,
        aoPassRef: `${STUB_PNG_PREFIX}ao`,
        inkLineWeightPx: 2.3,
        assetIds: ["hero-rooftop", "vrm-protagonist"],
        capturedAt: "2026-11-21T04:00:00.000Z",
        camera: { position: [1, 2, 6], target: [0, 1, 0], fovDegrees: 42 },
        atmospherePresetId: "night",
        sceneDocumentJson: '{"version":1}',
      },
      targetDocumentId: "doc-handoff-01",
      targetCutIndex: 3,
      previewMode: "split-wipe",
      splitWipeRatio: 0.45,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const persisted = saveBakedManuscriptCutLayer(result.layer);
    expect(persisted.persistedToStorage).toBe(true);
    expect(persisted.totalLayers).toBe(1);
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]?.layerId).toBe(result.layer.layerId);

    const fetched = getBakedManuscriptCutLayerForCut("doc-handoff-01", 3);
    expect(fetched?.sourceSceneId).toBe("scene-rooftop");
    expect(fetched?.rightsBomAssetIds).toEqual(["hero-rooftop", "vrm-protagonist"]);
    expect(listBakedManuscriptCutLayers("doc-handoff-01")).toHaveLength(1);

    const reshoot = buildReshootRestorePayload(fetched!);
    expect(reshoot.camera).toEqual({ position: [1, 2, 6], target: [0, 1, 0], fovDegrees: 42 });
    expect(reshoot.atmospherePresetId).toBe("night");
    expect(reshoot.inkLineWeightPx).toBe(2.3);
    expect(reshoot.sceneDocumentJson).toBe('{"version":1}');

    window.removeEventListener(STUDIO_BG3D_BAKED_CUT_HANDOFF_EVENT, listener);
  });

  it("wires StudioBg3dEditorModal live capture -> Split-Wipe real images -> bake to 2D cut -> 3D re-shoot restore", async () => {
    stubCanvas2d();
    const adapter = createSyntheticAdapter();
    const applyView = vi.fn(() => true);
    const commitCameraViewCommand = vi.fn();
    const applyWebtoonAtmospherePreset = vi.fn();
    const onInsert = vi.fn();

    const modalHost: StudioBg3dEditorModalHost = {
      open: true,
      webXrRendererLifetimeRetained: false,
      modalDialogRef: createRef<HTMLDivElement>(),
      isBatchRenderingShots: false,
      shotBatchProgress: null,
      shotBatchAbortRef: createRef<AbortController>(),
      isCapturing: false,
      deletingModelId: null,
      webXrSessionState: { status: "idle" },
      requestUserClose: vi.fn(),
      outlinerController: emptyOutlinerController(),
      sharedStageSessionScopeKey: "doc-live-ink-e2e",
      sceneBaseDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      activeWebtoonAtmosphereId: "backlight",
      applyWebtoonAtmospherePreset,
      captureRef: { current: { adapter } },
      viewportApiRef: {
        current: {
          readView: () => ({
            ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
            position: [3, 2, 5] as [number, number, number],
            target: [0, 1, 0] as [number, number, number],
            fovDegrees: 35,
          }),
          applyView,
        },
      },
      commitCameraViewCommand,
      customModels: [{ id: "m1", modelId: "hero-school-v1" }],
      primitives: [{ id: "prim-floor" }],
      sharedCharacters: [{ elementId: "char-hana" }],
      onInsert,
    };

    render(<StudioBg3dEditorModal h={modalHost} />, { wrapper: RouterWrapper });

    // 정밀 3D 작업공간으로 전환
    fireEvent.click(screen.getByRole("button", { name: /정밀/ }));

    // 4단계 Live Ink 버튼 클릭 -> 실제 WebGL 어댑터 캡처 자동 실행 + Split-Wipe 진입
    fireEvent.click(screen.getByTestId("studio-bg3d-stage-step-live-ink"));

    await waitFor(() => {
      expect(adapter.capture).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("studio-bg3d-live-ink-pass-image").getAttribute("src")).toMatch(
        /^data:image\/png;base64,/,
      );
      expect(screen.getByTestId("studio-bg3d-shaded-pass-image").getAttribute("src")).toMatch(
        /^data:image\/png;base64,/,
      );
    });

    // 깊이 / AO 패스 전환 및 44px 터치 타깃·무스피너 규칙 확인
    const depthBtn = screen.getByTestId("studio-bg3d-live-ink-pass-btn-depth");
    const refreshBtn = screen.getByTestId("studio-bg3d-live-ink-refresh-btn");
    expect(depthBtn.className).toContain("min-h-11");
    expect(refreshBtn.className).toContain("min-h-11");
    expect(refreshBtn.innerHTML).not.toContain("animate-spin");
    expect(refreshBtn.getAttribute("title")).toBeTruthy();

    fireEvent.click(depthBtn);
    expect(screen.getByTestId("studio-bg3d-live-ink-wipe-pane").getAttribute("data-live-ink-pass")).toBe("depth");
    fireEvent.click(screen.getByTestId("studio-bg3d-live-ink-pass-btn-ao"));
    expect(screen.getByTestId("studio-bg3d-live-ink-wipe-pane").getAttribute("data-live-ink-pass")).toBe("ao");

    // 원고 컷에 바로 굽기 -> 영속 저장 + 2D 호스트 삽입 + 성공 배지 + 3D 재촬영 복원
    fireEvent.click(screen.getByTestId("studio-bg3d-bake-to-cut"));
    await waitFor(() => {
      expect(onInsert).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("studio-bg3d-bake-success-badge")).toBeDefined();
    });

    const persisted = getBakedManuscriptCutLayerForCut("doc-live-ink-e2e", 0);
    expect(persisted?.rightsBomAssetIds).toEqual(["hero-school-v1", "char-hana", "prim-floor"]);
    expect(persisted?.camera).toEqual({ position: [3, 2, 5], target: [0, 1, 0], fovDegrees: 35 });
    expect(persisted?.atmospherePresetId).toBe("backlight");

    // 3D 재촬영 복원 버튼 클릭 -> 카메라 및 분위기 프리셋 복원 검증
    fireEvent.click(screen.getByTestId("studio-bg3d-restore-reshoot-btn"));
    expect(applyView).toHaveBeenCalledWith(
      expect.objectContaining({
        position: [3, 2, 5],
        target: [0, 1, 0],
        fovDegrees: 35,
      }),
    );
    expect(commitCameraViewCommand).toHaveBeenCalledTimes(1);
    expect(applyWebtoonAtmospherePreset).toHaveBeenCalledWith("backlight");
  });
});
