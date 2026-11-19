// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PerspectiveCamera } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioMannequinCaptureCamera } from "./studio-mannequin-capture-camera";
import { STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN } from "./studio-mannequin-lighting";
import { resolveStudioMannequinCameraFrame, snapshotStudioMannequinLightingPlan, type StudioMannequinCameraPreset, type StudioMannequinSceneHandle, type StudioMannequinSceneOptions } from "./studio-mannequin-scene";
import {
  StudioMannequinWebglUnavailableError,
  probeStudioMannequinWebgl2Support,
} from "./studio-mannequin-webgl-probe";

const sceneHandle: StudioMannequinSceneHandle = {
  setBodySpec: vi.fn(),
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
    width: 320,
    height: 240,
    displayWidth: 320,
    displayHeight: 240,
  })),
  dispose: vi.fn(),
};

const mockCreateScene = vi.hoisted(() => vi.fn());
const mockLoadState = vi.hoisted(() => vi.fn<() => Promise<unknown>>(async () => null));
const mockSaveState = vi.hoisted(() => vi.fn(async (s: unknown) => s));

vi.mock("./studio-mannequin-scene", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-mannequin-scene")>();
  return {
    ...actual,
    createStudioMannequinScene: (...args: unknown[]) => mockCreateScene(...args),
  };
});

vi.mock("./studio-mannequin-bg3d-preset-sqlite-repository", () => ({
  getProductStudioMannequinStateSqliteRepository: () => ({
    load: () => mockLoadState(),
    save: (s: unknown) => mockSaveState(s),
  }),
}));

const { StudioMannequinPoserPanel } = await import("./StudioMannequinPoserPanel");

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockCreateScene.mockReset();
  mockCreateScene.mockImplementation(() => sceneHandle);
  mockLoadState.mockReset();
  mockLoadState.mockResolvedValue(null);
  mockSaveState.mockReset();
  vi.mocked(sceneHandle.setCameraFovDeg!).mockClear();
});

function renderObservedCamera(preset: StudioMannequinCameraPreset, fov: number) {
  const scene = mockCreateScene.mock.calls.at(-1)?.[0] as StudioMannequinSceneOptions;
  const frame = resolveStudioMannequinCameraFrame(1.7, preset);
  const camera = new PerspectiveCamera(fov, 1, 0.05, 60);
  camera.position.set(...frame.position);
  camera.lookAt(...frame.target);
  act(() => scene.onCaptureCameraChange?.(readStudioMannequinCaptureCamera(camera, true)));
}

describe("StudioMannequinEngineReadiness & Poser page/WebGL2 recovery", () => {
  it("포저의 체형·포즈·재질과 캡처 카메라가 실제 구도 브리프에 함께 표시된다", async () => {
    render(<StudioMannequinPoserPanel open onClose={vi.fn()} onInsert={vi.fn()} initialPosePresetId="run" />);
    fireEvent.click(screen.getByRole("button", { name: "카메라·캡처" }));
    expect(screen.getByTestId("composition-brief-empty")).toBeTruthy();
    renderObservedCamera("home", 47);
    const panel = screen.getByTestId("composition-brief-panel");
    await waitFor(() => expect(panel.textContent).toContain("pose:run"));
    expect(panel.textContent).toContain("신장 170cm");
    expect(panel.textContent).toContain("목조 인형");
    expect(panel.textContent).toContain("화각 47도");
  });

  it("프리셋과 리셋 명령 뒤 프레임이 관찰되면 현재 방향을 브리프에 반영한다", () => {
    render(<StudioMannequinPoserPanel open onClose={vi.fn()} onInsert={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "카메라·캡처" }));
    renderObservedCamera("home", 40);
    const brief = screen.getByTestId("composition-brief-text");
    const initial = brief.textContent;
    expect(initial).toContain("오른쪽 3/4 앞모습");
    fireEvent.click(screen.getByRole("button", { name: "측면" }));
    expect(sceneHandle.setCameraPreset).toHaveBeenCalledWith("side");
    expect(brief.textContent).toEqual(initial);
    renderObservedCamera("side", 40);
    expect(brief.textContent).toContain("오른쪽 옆모습");
    fireEvent.click(screen.getByRole("button", { name: "리셋" }));
    expect(sceneHandle.resetCamera).toHaveBeenCalled();
    expect(brief.textContent).toContain("오른쪽 옆모습");
    renderObservedCamera("home", 40);
    expect(brief.textContent).toEqual(initial);
  });

  it("probeStudioMannequinWebgl2Support가 WebGL2 컨텍스트를 확인하고 즉시 반환한다", () => {
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue("Chromium Headless QA");
    const loseContext = vi.fn();
    const getContext = vi
      .spyOn(HTMLCanvasElement.prototype, "getContext")
      .mockImplementation(((contextId: string) =>
        contextId === "webgl2" ? { getExtension: () => ({ loseContext }) } : null) as HTMLCanvasElement["getContext"]);

    expect(probeStudioMannequinWebgl2Support()).toBe(true);
    expect(getContext).toHaveBeenCalledWith("webgl2");
    expect(loseContext).toHaveBeenCalledTimes(1);

    getContext.mockImplementation((() => null) as HTMLCanvasElement["getContext"]);
    expect(probeStudioMannequinWebgl2Support()).toBe(false);
  });

  it("presentation='page'에서 포털 덮개 대신 인라인 영역으로 렌더링하고 외부 카메라 렌즈 요청을 3D FOV에 반영한다", async () => {
    const view = render(
      <div data-testid="poser-host">
        <StudioMannequinPoserPanel
          open
          presentation="page"
          onClose={vi.fn()}
          onInsert={vi.fn()}
          captureTarget="download"
          externalCameraRequest={{ fovDeg: 64, nonce: 0 }}
        />
      </div>,
    );

    const host = screen.getByTestId("poser-host");
    const region = host.querySelector('[data-studio-mannequin-dialog="true"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute("data-studio-mannequin-presentation")).toBe("page");
    expect(region?.getAttribute("role")).toBe("region");
    expect(screen.getByTestId("studio-poser-engine-status").getAttribute("data-engine-state")).toBe("ready");

    view.rerender(
      <div data-testid="poser-host">
        <StudioMannequinPoserPanel
          open
          presentation="page"
          onClose={vi.fn()}
          onInsert={vi.fn()}
          captureTarget="download"
          externalCameraRequest={{ fovDeg: 22, nonce: 1 }}
        />
      </div>,
    );

    await waitFor(() => {
      expect(sceneHandle.setCameraFovDeg).toHaveBeenCalledWith(22);
    });
  });

  it("WebGL2 미지원 시 원시 영문 예외 대신 한국어 호환 안내·오류 배지·캡처 비활성화·안전 복귀·재시도 복구를 제공한다", async () => {
    mockCreateScene.mockImplementationOnce(() => {
      throw new StudioMannequinWebglUnavailableError();
    });
    // SQLite 로딩 지연 중에도 WebGL2 미지원 시 기존 저장본을 덮지 않고 즉시 복귀 가능해야 함
    mockLoadState.mockReturnValueOnce(new Promise(() => undefined));
    const onClose = vi.fn();

    render(
      <StudioMannequinPoserPanel
        open
        presentation="page"
        onClose={onClose}
        onInsert={vi.fn()}
        captureTarget="download"
      />,
    );

    const badge = screen.getByTestId("studio-poser-engine-status");
    expect(badge.getAttribute("data-engine-state")).toBe("error");

    const errorCard = screen.getByTestId("studio-poser-webgl-error-card");
    expect(errorCard.textContent).toContain("이 브라우저에서는 3D 데생 인형 화면을 열 수 없습니다");
    expect(errorCard.textContent).not.toContain("Error creating WebGL context");

    fireEvent.click(screen.getByRole("button", { name: "카메라·캡처" }));
    const captureBtn = screen.getByRole("button", { name: /PNG로 저장/u }) as HTMLButtonElement;
    expect(captureBtn.disabled).toBe(true);

    // 2D 원고 스튜디오 복귀 버튼이 저장소를 덮지 않고 즉시 닫기를 호출
    fireEvent.click(screen.getByTestId("studio-poser-return-studio"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(mockSaveState).not.toHaveBeenCalled();

    // 다시 확인 클릭 시 WebGL2 복구 -> ready 전환
    mockCreateScene.mockImplementationOnce(() => sceneHandle);
    fireEvent.click(screen.getByTestId("studio-poser-retry-webgl"));

    await waitFor(() => {
      expect(screen.getByTestId("studio-poser-engine-status").getAttribute("data-engine-state")).toBe("ready");
    });
    expect(screen.queryByTestId("studio-poser-webgl-error-card")).toBeNull();
  });
});
