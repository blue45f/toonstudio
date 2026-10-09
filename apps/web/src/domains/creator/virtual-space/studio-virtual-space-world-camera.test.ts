import { describe, expect, it, vi } from "vitest";

import { studioVirtualCampusManifest } from "./studio-virtual-space-campus-world";
import { studioVirtualPlaceWorldManifest } from "./studio-virtual-space-place-world";
import { applyStudioCameraFollow, applyStudioWorldCamera, studioCameraEdgeLerpFactor, studioCameraFollowLerp, studioWorldCameraPlacement, STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR, STUDIO_CAMERA_EDGE_SOFT_ZONE_PX } from "./studio-virtual-space-world-camera";
import { studioCameraLerp } from "./studio-virtual-space-presentation";
import { studioCampusCameraZoom } from "./studio-virtual-space-world-presentation";

describe("월드 카메라 배치", () => {
  it("캠퍼스는 데스크톱·모바일 모두 월드 전체를 경계로 하는 추종 카메라다", () => {
    const campus = studioVirtualCampusManifest(true);
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      const placement = studioWorldCameraPlacement(campus, width, height, 1);
      expect(placement.mode).toBe("follow");
      expect(placement.zoom).toBeCloseTo(studioCampusCameraZoom(width, height, 1, campus));
      expect(placement.bounds).toEqual({ x: 0, y: 0, width: campus.width, height: campus.height });
    }
  });

  it("내장 장소는 데스크톱에서 fit 프레임으로 가운데를 보고, 모바일에서는 추종한다", () => {
    const garden = studioVirtualPlaceWorldManifest("garden", true);
    const camera = { setZoom: vi.fn(), setBounds: vi.fn(), centerOn: vi.fn() };
    expect(applyStudioWorldCamera(camera, garden, 1440, 900, 1)).toBe("fit");
    expect(camera.centerOn).toHaveBeenCalledWith(garden.width / 2, garden.height / 2);
    camera.centerOn.mockClear();
    expect(applyStudioWorldCamera(camera, garden, 390, 844, 1)).toBe("follow");
    expect(camera.centerOn).not.toHaveBeenCalled();
    expect(camera.setBounds).toHaveBeenLastCalledWith(0, 0, garden.width, garden.height);
  });
});

describe("카메라 경계 소프트 클램프", () => {
  // 뷰 800px, 월드 3,072px → 중심 허용 범위는 400~2,672.
  const view = 800;
  const world = 3_072;
  const minCenter = view / 2;
  const maxCenter = world - view / 2;

  it("월드 중앙에서는 추종을 늦추지 않는다", () => {
    expect(studioCameraEdgeLerpFactor(world / 2, view, world)).toBe(1);
    expect(studioCameraEdgeLerpFactor(minCenter + STUDIO_CAMERA_EDGE_SOFT_ZONE_PX, view, world)).toBe(1);
    expect(studioCameraEdgeLerpFactor(maxCenter - STUDIO_CAMERA_EDGE_SOFT_ZONE_PX, view, world)).toBe(1);
  });

  it("경계에 붙을수록 최소 배율까지 부드럽게 감속한다", () => {
    expect(studioCameraEdgeLerpFactor(minCenter, view, world)).toBeCloseTo(STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR);
    expect(studioCameraEdgeLerpFactor(maxCenter, view, world)).toBeCloseTo(STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR);
    const halfway = studioCameraEdgeLerpFactor(minCenter + STUDIO_CAMERA_EDGE_SOFT_ZONE_PX / 2, view, world);
    expect(halfway).toBeGreaterThan(STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR);
    expect(halfway).toBeLessThan(1);
    // 경계에서 멀어질수록 단조 증가한다.
    let previous = -1;
    for (let d = 0; d <= STUDIO_CAMERA_EDGE_SOFT_ZONE_PX; d += 16) {
      const factor = studioCameraEdgeLerpFactor(minCenter + d, view, world);
      expect(factor).toBeGreaterThanOrEqual(previous);
      previous = factor;
    }
  });

  it("월드가 화면보다 작거나 잘못된 입력이면 감속하지 않는다", () => {
    expect(studioCameraEdgeLerpFactor(100, 800, 640)).toBe(1);
    expect(studioCameraEdgeLerpFactor(100, 800, 800)).toBe(1);
    expect(studioCameraEdgeLerpFactor(100, 0, 3_072)).toBe(1);
  });
});

describe("카메라 추종 비율(studioCameraFollowLerp)", () => {
  const input = {
    deltaSeconds: 1 / 60, followBase: 0.12, roomTransitioning: false, immediate: false, edgeSoftening: true,
    center: { x: 1500, y: 900 }, view: { width: 800, height: 500 }, world: { width: 3072, height: 1920 },
  } as const;

  it("월드 한가운데에서는 평소 추종 비율 그대로다", () => {
    const lerp = studioCameraFollowLerp(input);
    expect(lerp.x).toBeCloseTo(studioCameraLerp(1 / 60, 0.12), 12);
    expect(lerp.y).toBeCloseTo(lerp.x, 12);
  });

  it("방 전환 중에는 2.2배 빠른 기본 비율로 따라간다", () => {
    const lerp = studioCameraFollowLerp({ ...input, roomTransitioning: true });
    expect(lerp.x).toBeCloseTo(studioCameraLerp(1 / 60, 0.12 * 2.2), 12);
    expect(lerp.x).toBeGreaterThan(studioCameraFollowLerp(input).x);
  });

  it("순간 이동·모션 줄이기·시점을 끄는 중(immediate)에는 가장자리여도 1이다", () => {
    expect(studioCameraFollowLerp({ ...input, immediate: true })).toEqual({ x: 1, y: 1 });
    expect(studioCameraFollowLerp({ ...input, immediate: true, center: { x: 410, y: 260 } })).toEqual({ x: 1, y: 1 });
  });

  it("월드 가장자리 근처에서는 그 축의 추종만 미리 늦춘다", () => {
    const edge = studioCameraFollowLerp({ ...input, center: { x: 410, y: 900 } });
    const middle = studioCameraFollowLerp(input);
    expect(edge.x).toBeLessThan(middle.x);
    expect(edge.x).toBeGreaterThanOrEqual(middle.x * STUDIO_CAMERA_EDGE_MIN_LERP_FACTOR - 1e-12);
    expect(edge.y).toBeCloseTo(middle.y, 12);
  });

  it("카메라가 아바타를 따라가는 장소가 아니면(edgeSoftening 꺼짐) 가장자리 감속을 쓰지 않는다", () => {
    const lerp = studioCameraFollowLerp({ ...input, edgeSoftening: false, center: { x: 410, y: 260 } });
    expect(lerp.x).toBeCloseTo(studioCameraLerp(1 / 60, 0.12), 12);
    expect(lerp.y).toBeCloseTo(lerp.x, 12);
  });
});

describe("카메라 추종 적용(applyStudioCameraFollow)", () => {
  const input = {
    deltaSeconds: 1 / 60, followBase: 0.12, roomTransitioning: false, immediate: false, edgeSoftening: true,
    world: { width: 3072, height: 1920 }, centerOn: null,
  } as const;
  const fakeCamera = (mid = { x: 1500, y: 900 }) => ({
    midPoint: mid, worldView: { width: 800, height: 500 }, setLerp: vi.fn(), centerOn: vi.fn(),
  });

  it("카메라의 현재 중심·화면 크기로 추종 비율을 계산해 setLerp에 넣는다", () => {
    const camera = fakeCamera({ x: 410, y: 900 });
    applyStudioCameraFollow(camera, input);
    const expected = studioCameraFollowLerp({ ...input, center: camera.midPoint, view: camera.worldView });
    expect(camera.setLerp).toHaveBeenCalledWith(expected.x, expected.y);
    expect(expected.x, "왼쪽 가장자리에서는 그 축만 늦춰진다").toBeLessThan(expected.y);
  });

  it("centerOn이 없으면 카메라를 옮기지 않는다(평소 추종은 Phaser의 lerp·데드존에 맡긴다)", () => {
    const camera = fakeCamera();
    applyStudioCameraFollow(camera, input);
    expect(camera.centerOn).not.toHaveBeenCalled();
  });

  it("centerOn이 있으면 데드존을 건너뛰고 그 점에 바로 맞춘다", () => {
    const camera = fakeCamera();
    applyStudioCameraFollow(camera, { ...input, immediate: true, centerOn: { x: 1234, y: 567 } });
    expect(camera.setLerp).toHaveBeenCalledWith(1, 1);
    expect(camera.centerOn).toHaveBeenCalledTimes(1);
    expect(camera.centerOn).toHaveBeenCalledWith(1234, 567);
  });
});
