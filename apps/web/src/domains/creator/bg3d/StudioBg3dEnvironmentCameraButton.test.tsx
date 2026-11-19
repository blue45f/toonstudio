// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Group, Vector3 } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioBg3dEnvironmentCameraButton } from "./StudioBg3dEnvironmentCameraButton";
import { getStudioBg3dEnvironmentAsset, STUDIO_BG3D_ENVIRONMENT_ASSETS, STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1, STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS } from "./studio-bg3d-environment-catalog";
import { frameStudioBg3dEnvironmentCamera } from "./studio-bg3d-environment-camera";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document";

afterEach(cleanup);
const coast = getStudioBg3dEnvironmentAsset("ts-bg3d-coastal_signal_station-v1")!;
const camera: StudioBg3dCameraSettings = {
  position: [11, 6, 9], target: [0, 1, 0], up: [0, 1, 0], projection: "perspective",
  fovDegrees: 53, nearClip: .05, zoom: 1.3, lensShift: [.1, 0],
};
const button = () => screen.getByRole("button", { name: "선택한 공간의 추천 구도 적용" });
function controls() {
  const model = new Group(), source = new Group();
  return {
    assetHash: coast.sha256, readView: () => camera, readInstance: () => model, readSource: () => source,
    isCaptureActive: () => false, onCommit: vi.fn(() => true), onError: vi.fn(),
  };
}

describe("환경 에셋에 저장된 카메라 구도", () => {
  it("선택만으로는 카메라를 건드리지 않고 클릭 한 번을 기존 카메라 히스토리에 맡긴다", () => {
    const props = controls();
    const { rerender } = render(<StudioBg3dEnvironmentCameraButton {...props} assetHash="sha256:missing" />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<StudioBg3dEnvironmentCameraButton {...props} />);
    expect(props.onCommit).not.toHaveBeenCalled();
    fireEvent.click(button());
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(camera, expect.objectContaining({
      position: coast.camera.position, target: coast.camera.target, fovDegrees: 39, zoom: 1, lensShift: [0, 0],
    }));
    expect(camera.fovDegrees).toBe(53);
  });

  it.each([
    ["botanical_glasshouse", "모종 작업대", [-0.7, 2.17, 2.34], [-2.19, 1.47, 0.54], 37],
    ["coastal_signal_station", "부두 난간", [3.28, 2.52, 4.28], [1.11, 1.15, 1.36], 40],
    ["botanical_illustration_room", "표본 작업대", [0.23, 1.8, 0.83], [-0.61, 1.054, -0.2], 30],
    ["harbor_boat_repair_shed", "선체 이음부", [2.57, 1.93, 2.91], [0.62, 0.9, 0.18], 38],
  ] as const)("%s 세부 구도를 명시적으로 골라야 Blender의 촬영 지점으로 이동한다", (id, subject, position, target, fovDegrees) => {
    const asset = getStudioBg3dEnvironmentAsset(`ts-bg3d-${id}-v1`)!;
    const props = { ...controls(), assetHash: asset.sha256 };
    render(<StudioBg3dEnvironmentCameraButton {...props} />);
    expect(props.onCommit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: `세부 구도 적용 · ${subject}` }));
    expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(camera, expect.objectContaining({ position, target, fovDegrees }));
  });

  it("별도 세부 구도가 없는 기존 장소는 원래 추천 구도만 제공한다", () => {
    const existing = STUDIO_BG3D_ENVIRONMENT_ASSETS.filter(asset => !asset.detailCamera);
    expect(existing).toHaveLength(31);
    render(<StudioBg3dEnvironmentCameraButton {...controls()} assetHash={existing[0]!.sha256} />);
    expect(screen.getAllByRole("button")).toEqual([button()]);
  });

  it.each([...STUDIO_BG3D_LEGACY_ENVIRONMENT_ASSETS, ...STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1])(
    "이전 원고나 대체 장소 $id는 실제로 첨부된 GLB의 추천 카메라를 연다", (asset) => {
      const props = controls();
      render(<StudioBg3dEnvironmentCameraButton {...props} assetHash={asset.sha256} />);
      expect(screen.getAllByRole("button")).toEqual([button()]);
      fireEvent.click(button());
      expect(props.onCommit).toHaveBeenCalledExactlyOnceWith(camera, expect.objectContaining({
        position: asset.camera.position, target: asset.camera.target, fovDegrees: asset.camera.fovDegrees,
      }));
    },
  );

  it("상위 계층 회전·위치, 비균일 모델 크기와 로더의 GLB 정규화를 실제 렌더 좌표와 일치시킨다", () => {
    const parent = new Group(), placed = new Group(), source = new Group();
    parent.position.set(1, 3, -7); parent.rotation.z = .2;
    placed.position.set(4, 2, -3); placed.rotation.y = Math.PI / 3; placed.scale.set(2, .5, 3);
    source.scale.setScalar(.25); source.position.set(0, -.3, 0);
    parent.add(placed);
    const actual = frameStudioBg3dEnvironmentCamera(coast.camera, camera, placed, source)!;
    const renderRoot = source.clone(); placed.add(renderRoot);
    const world = (point: readonly [number, number, number]) => renderRoot.localToWorld(new Vector3(...point)).toArray();
    const target = world(coast.camera.target), position = world(coast.camera.position);
    expect(actual.position).toEqual(position); expect(actual.target).toEqual(target);
    const direction = new Vector3(...target).sub(new Vector3(...position)).normalize();
    expect(new Vector3(...actual.up!).dot(direction)).toBeCloseTo(0, 10);
    const ortho = frameStudioBg3dEnvironmentCamera(coast.camera, { ...camera, projection: "orthographic" }, placed, source)!;
    expect(ortho.projection).toBe("orthographic");
    expect(ortho.orthographicHeight).toBeCloseTo(2 * new Vector3(...position).distanceTo(new Vector3(...target)) * Math.tan(39 * Math.PI / 360));
  });

  it("복원·캡처 중이거나 표시할 모델 좌표가 없으면 원고와 히스토리를 유지한다", () => {
    const props = controls();
    const { rerender } = render(<StudioBg3dEnvironmentCameraButton {...props} blockedReason="복원 중" />);
    fireEvent.click(button());
    fireEvent.click(screen.getByRole("button", { name: "세부 구도 적용 · 부두 난간" }));
    rerender(<StudioBg3dEnvironmentCameraButton {...props} isCaptureActive={() => true} />);
    fireEvent.click(button());
    rerender(<StudioBg3dEnvironmentCameraButton {...props} readSource={() => undefined} />);
    fireEvent.click(button());
    expect(props.onError).toHaveBeenCalledOnce();
    expect(props.onCommit).not.toHaveBeenCalled();
    const singular = new Group(); singular.scale.y = 0;
    expect(frameStudioBg3dEnvironmentCamera(coast.camera, camera, singular, new Group())).toBeNull();
  });
});
