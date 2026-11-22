// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { readStudioBg3dCameraDutchRollDegrees } from "../bg3d/studio-bg3d-camera-orientation";
import {
  StudioBg3dProSuiteRuntimeContext,
  type StudioBg3dProSuiteRuntimeValue,
} from "../bg3d/studio-bg3d-pro-suite-runtime-context";
import type { StudioBg3dCameraSettings } from "../bg3d/studio-bg3d-scene-document";
import { StudioBg3dCompositionLensPanel } from "../bg3d/StudioBg3dCompositionLensPanel";
import { StudioCameraAngleBookmarkPanel } from "./StudioCameraAngleBookmarkPanel";
import {
  WEBTOON_SIGNATURE_CAMERA_ANGLES,
  createCameraAngleBookmark,
  extractCameraAnglePose,
  getSignatureCameraAnglePreset,
  loadCameraAngleBookmarks,
  removeCameraAngleBookmark,
  resolveCameraSettingsFromAnglePose,
  saveCameraAngleBookmarks,
  upsertCameraAngleBookmark,
} from "./webtoon-camera-angles";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

const DEFAULT_CAMERA: StudioBg3dCameraSettings = {
  position: [0, 1.6, 5],
  target: [0, 1.2, 0],
  fovDegrees: 50,
  projection: "perspective",
  up: [0, 1, 0],
};

describe("3D 배경 시그니처 웹툰 카메라 앵글 12종 & 북마크 엔진", () => {
  it("정확히 12종의 고유한 웹툰 시그니처 카메라 앵글 프리셋을 제공한다", () => {
    expect(WEBTOON_SIGNATURE_CAMERA_ANGLES).toHaveLength(12);
    const ids = new Set(WEBTOON_SIGNATURE_CAMERA_ANGLES.map((item) => item.id));
    expect(ids.size).toBe(12);

    const names = WEBTOON_SIGNATURE_CAMERA_ANGLES.map((item) => item.nameKo);
    expect(names).toEqual([
      "대각선 액션",
      "오버더숄더 대화",
      "로우앵글 위압",
      "하이앵글 고립",
      "버드아이 도입 컷",
      "웜즈아이",
      "1인칭 POV",
      "투샷 아이레벨",
      "클로즈업 눈높이",
      "와이드 에스태블리싱",
      "더치 틸트 긴장",
      "실루엣 역광",
    ]);
  });

  it("로우앵글/하이앵글/버드아이/더치 틸트 프리셋을 3D 카메라 좌표와 업벡터로 정확히 변환한다", () => {
    const lowAngle = getSignatureCameraAnglePreset("low-angle-dominance")!;
    const lowCam = resolveCameraSettingsFromAnglePose(lowAngle, DEFAULT_CAMERA);
    expect(lowCam.position[1]).toBeLessThan(lowCam.target[1]);
    expect(lowCam.fovDegrees).toBe(lowAngle.fovDeg);

    const birdsEye = getSignatureCameraAnglePreset("birds-eye-intro")!;
    const birdCam = resolveCameraSettingsFromAnglePose(birdsEye, DEFAULT_CAMERA);
    expect(birdCam.position[1]).toBeGreaterThan(birdCam.target[1] + 9);

    const dutch = getSignatureCameraAnglePreset("dutch-tilt-tension")!;
    const dutchCam = resolveCameraSettingsFromAnglePose(dutch, DEFAULT_CAMERA);
    expect(readStudioBg3dCameraDutchRollDegrees(dutchCam)).toBeCloseTo(dutch.rollDeg, 1);
  });

  it("임의 3D 카메라 상태를 역추출(extractCameraAnglePose)했다가 다시 적용해도 동일 시점을 복원한다", () => {
    const preset = getSignatureCameraAnglePreset("diagonal-action")!;
    const resolved = resolveCameraSettingsFromAnglePose(preset, DEFAULT_CAMERA, [0, 0, 0]);
    const extracted = extractCameraAnglePose(resolved, [0, 0, 0]);

    expect(extracted.fovDeg).toBeCloseTo(preset.fovDeg, 1);
    expect(extracted.pitchDeg).toBeCloseTo(preset.pitchDeg, 1);
    expect(extracted.yawDeg).toBeCloseTo(preset.yawDeg, 1);
    expect(extracted.rollDeg).toBeCloseTo(preset.rollDeg, 1);
    expect(extracted.distance).toBeCloseTo(preset.distance, 2);
  });

  it("사용자 북마크 생성·수정·삭제 및 로컬 스토리지 영속화를 지원한다", () => {
    const pose = extractCameraAnglePose(DEFAULT_CAMERA, [0, 0, 0]);
    const bm = createCameraAngleBookmark({ name: "교실 창가 컷", cutLabel: "컷 12", pose });
    const list = upsertCameraAngleBookmark([], bm);
    expect(saveCameraAngleBookmarks(list)).toBe(true);

    const loaded = loadCameraAngleBookmarks();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe("교실 창가 컷");
    expect(loaded[0]!.cutLabel).toBe("컷 12");

    const afterDelete = removeCameraAngleBookmark(loaded, bm.id);
    expect(afterDelete).toHaveLength(0);
  });
});

describe("StudioCameraAngleBookmarkPanel & StudioBg3dCompositionLensPanel 통합", () => {
  it("12종 앵글 적용 및 현재 뷰 북마크 저장·전환이 onApplyCamera 콜백으로 연결된다", () => {
    const onApplyCamera = vi.fn<(camera: StudioBg3dCameraSettings) => void>();
    render(
      <StudioCameraAngleBookmarkPanel
        baseCamera={DEFAULT_CAMERA}
        onApplyCamera={onApplyCamera}
      />,
    );

    const grid = screen.getByTestId("signature-angle-grid");
    expect(grid.querySelectorAll("button")).toHaveLength(12);

    fireEvent.click(screen.getByRole("button", { name: /더치 틸트 긴장/ }));
    expect(onApplyCamera).toHaveBeenCalledTimes(1);
    const appliedDutch = onApplyCamera.mock.calls[0]![0];
    expect(appliedDutch.fovDegrees).toBe(44);
    expect(readStudioBg3dCameraDutchRollDegrees(appliedDutch)).toBeCloseTo(21, 1);

    fireEvent.change(screen.getByLabelText("새 북마크 이름"), {
      target: { value: "옥상 추격전" },
    });
    fireEvent.click(screen.getByRole("button", { name: "현재 앵글 저장" }));

    expect(screen.getByTestId("camera-angle-bookmark-list").textContent).toContain("옥상 추격전");
    fireEvent.click(screen.getByRole("button", { name: /옥상 추격전.*컷 1/ }));
    expect(onApplyCamera).toHaveBeenCalledTimes(2);
  });

  it("StudioBg3dCompositionLensPanel 안에서 런타임 onApplyCameraView와 직접 연결된다", () => {
    const onApplyCameraView = vi.fn<(camera: StudioBg3dCameraSettings) => void>();
    const onCaptureCurrentShot = vi.fn();
    const runtime = {
      disabled: false,
      proSuiteActive: true,
      baseCamera: DEFAULT_CAMERA,
      productionShots: [],
      onApplyCameraView,
      onCaptureCurrentShot,
      onApplyProductionShot: vi.fn(),
      onMoveProductionShot: vi.fn(),
      onRemoveProductionShot: vi.fn(),
    } as unknown as StudioBg3dProSuiteRuntimeValue;

    render(
      <StudioBg3dProSuiteRuntimeContext.Provider value={runtime}>
        <StudioBg3dCompositionLensPanel />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );

    expect(screen.getByTestId("studio-camera-angle-bookmark-panel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /로우앵글 위압/ }));
    expect(onApplyCameraView).toHaveBeenCalledTimes(1);
    expect(onApplyCameraView.mock.calls[0]![0].fovDegrees).toBe(58);
  });
});
