// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPerspectiveRigToRulerHandlers,
  buildPerspectiveProjectionMatrix,
  buildViewMatrixFromLookAt,
  createStudio3dCameraPerspectiveBridge,
  multiplyMat4,
  perspectiveAssistFrom3dCameraProjection,
  perspectiveGuideStateFrom3dCameraProjection,
  perspectiveRigFrom3dCameraProjection,
  project3dCameraToPerspective,
} from "./studio-3d-camera-perspective-bridge";
import { createDefaultStudioAdvancedRulerDocument } from "../studio-advanced-ruler-document";
import { StudioInspectorRulersSection } from "../StudioInspectorRulersSection";

import type { StudioBg3dCameraSettings } from "../bg3d/studio-bg3d-scene-document-types";
import type { DrawEl } from "../studio-element-model";

afterEach(cleanup);

const VIEWPORT = { width: 800, height: 1200 } as const;

function projectWorldPointToCanvasPx(
  camera: THREE.PerspectiveCamera,
  point: THREE.Vector3,
  viewport: { readonly width: number; readonly height: number },
): { x: number; y: number } {
  const projected = point.clone().project(camera);
  return {
    x: (projected.x * 0.5 + 0.5) * viewport.width,
    y: (0.5 - projected.y * 0.5) * viewport.height,
  };
}

function intersect2dLines(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
): { x: number; y: number } {
  const dax = a2.x - a1.x;
  const day = a2.y - a1.y;
  const dbx = b2.x - b1.x;
  const dby = b2.y - b1.y;
  const denom = dax * dby - day * dbx;
  const t = ((b1.x - a1.x) * dby - (b1.y - a1.y) * dbx) / denom;
  return { x: a1.x + dax * t, y: a1.y + day * t };
}

function createConfiguredThreeCamera(params: {
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  fov?: number;
  aspect?: number;
  zoom?: number;
  lensShift?: [number, number];
}): THREE.PerspectiveCamera {
  const aspect = params.aspect ?? VIEWPORT.width / VIEWPORT.height;
  const camera = new THREE.PerspectiveCamera(params.fov ?? 54, aspect, 0.1, 2000);
  camera.zoom = params.zoom ?? 1;
  if (params.lensShift) {
    const fullH = 1000;
    const fullW = fullH * aspect;
    camera.setViewOffset(
      fullW,
      fullH,
      params.lensShift[0] * fullW,
      params.lensShift[1] * fullH,
      fullW,
      fullH,
    );
  }
  camera.updateProjectionMatrix();
  if (params.up) camera.up.set(...params.up);
  camera.position.set(...params.position);
  camera.lookAt(...params.target);
  camera.updateMatrixWorld(true);
  return camera;
}

describe("studio-3d-camera-perspective-bridge 투영 수학 검증", () => {
  it("정면 수평 1점 투시 카메라에서 Z축 소실점이 캔버스 중앙에, X/Y축은 평행 무한원점으로 투영된다", () => {
    const camera = createConfiguredThreeCamera({
      position: [0, 1.6, 6],
      target: [0, 1.6, 0],
      fov: 50,
    });

    const proj = project3dCameraToPerspective(camera, VIEWPORT);
    expect(proj.projectionKind).toBe("perspective");
    expect(proj.mode).toBe("1p");
    expect(proj.vp1.finite).toBe(false);
    expect(proj.vp3.finite).toBe(false);
    expect(proj.vp2.finite).toBe(true);
    expect(proj.vp2.x).toBeCloseTo(400, 1);
    expect(proj.vp2.y).toBeCloseTo(600, 1);
    expect(proj.eyeLevelY).toBeCloseTo(600, 1);
    expect(proj.horizon.angleRad).toBeCloseTo(0, 5);
    expect(proj.lockHorizon).toBe(true);
    expect(proj.vanishingPoints).toHaveLength(1);
  });

  it("수평 2점 투시 카메라에서 X/Z 소실점이 수평선 위에 놓이고 직교 초점거리 법칙을 만족한다", () => {
    const yawRad = (32 * Math.PI) / 180;
    const fov = 54;
    const camera = createConfiguredThreeCamera({
      position: [0, 2, 0],
      target: [Math.sin(yawRad) * 10, 2, -Math.cos(yawRad) * 10],
      fov,
    });

    const proj = project3dCameraToPerspective(camera, VIEWPORT);
    expect(proj.mode).toBe("2p");
    expect(proj.vp1.finite).toBe(true);
    expect(proj.vp2.finite).toBe(true);
    expect(proj.vp3.finite).toBe(false);
    expect(proj.lockHorizon).toBe(true);
    expect(proj.eyeLevelY).toBeCloseTo(600, 1);
    expect(proj.vp1.y).toBeCloseTo(600, 1);
    expect(proj.vp2.y).toBeCloseTo(600, 1);

    // 직교하는 두 수평 소실점은 sqrt(-(vp1.x - cx) * (vp2.x - cx)) = f 를 정확히 만족해야 한다.
    const focalPx = (VIEWPORT.height * 0.5) / Math.tan((fov * Math.PI) / 360);
    const product = (proj.vp1.x - 400) * (proj.vp2.x - 400);
    expect(product).toBeLessThan(0);
    expect(Math.sqrt(-product)).toBeCloseTo(focalPx, 1);
  });

  it("3점 로우앵글(올려보기)과 하이앵글(내려보기)에서 수평선 이동과 천정/천저 VP3 방향이 정확하다", () => {
    const lowAngle = createConfiguredThreeCamera({
      position: [4, 1, 6],
      target: [0, 4.5, 0],
      fov: 60,
    });
    const lowProj = project3dCameraToPerspective(lowAngle, VIEWPORT);
    expect(lowProj.mode).toBe("3p");
    expect(lowProj.lockHorizon).toBe(false);
    expect(lowProj.vanishingPoints).toHaveLength(3);
    // 위를 올려다보면 수평선은 아래로(y > 600), 수직 천정 소실점은 위로(y < 600) 이동한다.
    expect(lowProj.eyeLevelY).toBeGreaterThan(600);
    expect(lowProj.vp3.finite).toBe(true);
    expect(lowProj.vp3.y).toBeLessThan(600);

    const highAngle = createConfiguredThreeCamera({
      position: [4, 8, 6],
      target: [0, 1, 0],
      fov: 60,
    });
    const highProj = project3dCameraToPerspective(highAngle, VIEWPORT);
    expect(highProj.mode).toBe("3p");
    expect(highProj.lockHorizon).toBe(false);
    // 아래를 내려다보면 수평선은 위로(y < 600), 수직 천저 소실점은 아래로(y > 600) 이동한다.
    expect(highProj.eyeLevelY).toBeLessThan(600);
    expect(highProj.vp3.y).toBeGreaterThan(600);
  });

  it("더치 롤·줌·렌즈 시프트가 결합된 임의 3점 카메라에서 3D 평행선 2D 교점과 VP1/VP2/VP3·수평선이 일치한다", () => {
    const camera = createConfiguredThreeCamera({
      position: [5.5, 3.2, 7.8],
      target: [-1.2, 5.4, -2.5],
      up: [0.22, 0.97, 0.08],
      fov: 58,
      zoom: 1.25,
      lensShift: [0.1, -0.07],
    });

    const proj = project3dCameraToPerspective(camera, VIEWPORT);
    expect(proj.mode).toBe("3p");
    expect(proj.vp1.finite).toBe(true);
    expect(proj.vp2.finite).toBe(true);
    expect(proj.vp3.finite).toBe(true);
    expect(Math.abs(proj.horizon.angleDeg)).toBeGreaterThan(5);

    const checkAxisConvergence = (
      axisDir: THREE.Vector3,
      vp: { readonly x: number; readonly y: number },
    ) => {
      const originA = new THREE.Vector3(0.5, 1.0, -1.0);
      const originB = new THREE.Vector3(-2.0, 2.5, 1.5);
      const a1 = projectWorldPointToCanvasPx(camera, originA, VIEWPORT);
      const a2 = projectWorldPointToCanvasPx(camera, originA.clone().addScaledVector(axisDir, 4), VIEWPORT);
      const b1 = projectWorldPointToCanvasPx(camera, originB, VIEWPORT);
      const b2 = projectWorldPointToCanvasPx(camera, originB.clone().addScaledVector(axisDir, 4), VIEWPORT);
      const hit = intersect2dLines(a1, a2, b1, b2);
      expect(hit.x).toBeCloseTo(vp.x, 1);
      expect(hit.y).toBeCloseTo(vp.y, 1);
    };

    checkAxisConvergence(new THREE.Vector3(1, 0, 0), proj.vp1);
    checkAxisConvergence(new THREE.Vector3(0, 0, 1), proj.vp2);
    checkAxisConvergence(new THREE.Vector3(0, 1, 0), proj.vp3);

    // 두 수평 소실점(VP1, VP2)은 모두 사영 수평선 방정식 a*x + b*y + c = 0 위에 놓여야 한다.
    const { a, b, c } = proj.horizon.line;
    expect(Math.abs(a * proj.vp1.x + b * proj.vp1.y + c)).toBeLessThan(0.05);
    expect(Math.abs(a * proj.vp2.x + b * proj.vp2.y + c)).toBeLessThan(0.05);
  });

  it("순수 수학 look-at / bg3d-settings / raw 4×4 행렬 입력이 Three.js PerspectiveCamera와 0.05px 이내로 일치한다", () => {
    const settings: StudioBg3dCameraSettings = {
      position: [4.2, 2.8, 6.4],
      target: [0.2, 4.1, -1.5],
      fovDegrees: 52,
      projection: "perspective",
      zoom: 1.15,
      lensShift: [-0.08, 0.05],
      nearClip: 0.1,
      up: [0.1, 0.99, 0.05],
    };
    const threeCam = createConfiguredThreeCamera({
      position: [...settings.position],
      target: [...settings.target],
      up: [...settings.up!],
      fov: settings.fovDegrees,
      zoom: settings.zoom,
      lensShift: [...settings.lensShift!],
    });

    const fromThree = project3dCameraToPerspective(threeCam, VIEWPORT);
    const fromLookAt = project3dCameraToPerspective(
      {
        kind: "look-at",
        position: settings.position,
        target: settings.target,
        up: settings.up,
        fovDeg: settings.fovDegrees,
        zoom: settings.zoom,
        lensShift: settings.lensShift,
      },
      VIEWPORT,
    );
    const fromSettings = project3dCameraToPerspective(
      { kind: "bg3d-settings", settings },
      VIEWPORT,
    );
    const rawVp = multiplyMat4(
      buildPerspectiveProjectionMatrix({
        fovDeg: settings.fovDegrees,
        aspect: VIEWPORT.width / VIEWPORT.height,
        zoom: settings.zoom,
        lensShift: settings.lensShift,
      }),
      buildViewMatrixFromLookAt(settings.position, settings.target, settings.up),
    );
    const fromRawVp = project3dCameraToPerspective(
      { kind: "view-projection", viewProjectionMatrix: rawVp },
      VIEWPORT,
    );

    for (const candidate of [fromLookAt, fromSettings, fromRawVp]) {
      expect(candidate.vp1.x).toBeCloseTo(fromThree.vp1.x, 1);
      expect(candidate.vp1.y).toBeCloseTo(fromThree.vp1.y, 1);
      expect(candidate.vp2.x).toBeCloseTo(fromThree.vp2.x, 1);
      expect(candidate.vp2.y).toBeCloseTo(fromThree.vp2.y, 1);
      expect(candidate.vp3.x).toBeCloseTo(fromThree.vp3.x, 1);
      expect(candidate.vp3.y).toBeCloseTo(fromThree.vp3.y, 1);
      expect(candidate.eyeLevelY).toBeCloseTo(fromThree.eyeLevelY, 1);
      expect(candidate.horizon.angleRad).toBeCloseTo(fromThree.horizon.angleRad, 4);
    }
  });

  it("직교 카메라(OrthographicCamera)는 NaN 없이 안전하게 직교 상태를 반환한다", () => {
    const ortho = new THREE.OrthographicCamera(-5, 5, 7.5, -7.5, 0.1, 100);
    ortho.position.set(5, 5, 5);
    ortho.lookAt(0, 0, 0);
    ortho.updateProjectionMatrix();
    ortho.updateMatrixWorld(true);

    const proj = project3dCameraToPerspective(ortho, VIEWPORT);
    expect(proj.projectionKind).toBe("orthographic");
    expect(proj.vanishingPoints).toHaveLength(0);
    expect(proj.horizon.visible).toBe(false);
    expect(Number.isFinite(proj.eyeLevelY)).toBe(true);
  });

  it("라이브 동기화 브리지가 StudioPerspectiveGuide 상태와 assist 문서를 발행하고 동일 행렬을 중복 제거한다", () => {
    const onSync = vi.fn();
    const bridge = createStudio3dCameraPerspectiveBridge({
      viewport: VIEWPORT,
      onSync,
    });
    const extraSubscriber = vi.fn();
    const unsubscribe = bridge.subscribe(extraSubscriber);

    const camA = createConfiguredThreeCamera({
      position: [4, 2, 6],
      target: [0, 3.5, 0],
      fov: 55,
    });

    const snap1 = bridge.sync(camA);
    expect(snap1).not.toBeNull();
    expect(snap1!.guideState.enabled).toBe(true);
    expect(snap1!.guideState.guide.kind).toBe("three-point");
    expect(snap1!.guideState.segments.length).toBeGreaterThan(0);
    expect(snap1!.assist.points).toHaveLength(3);
    expect(onSync).toHaveBeenCalledTimes(1);
    expect(extraSubscriber).toHaveBeenCalledTimes(1);

    // 카메라가 움직이지 않았으면 중복 발행을 억제한다.
    bridge.sync(camA);
    expect(onSync).toHaveBeenCalledTimes(1);

    // 카메라 회전 시 기존 소실점 ID를 보존하며 즉시 갱신한다.
    const camB = createConfiguredThreeCamera({
      position: [6, 2, 4],
      target: [0, 3.5, 0],
      fov: 55,
    });
    const snap2 = bridge.sync(camB);
    expect(onSync).toHaveBeenCalledTimes(2);
    expect(snap2!.assist.points.map((p) => p.id)).toEqual(snap1!.assist.points.map((p) => p.id));

    const assist = perspectiveAssistFrom3dCameraProjection(snap2!.projection);
    expect(assist.active).toBe(true);
    const guideState = perspectiveGuideStateFrom3dCameraProjection(snap2!.projection);
    expect(guideState.guide.vertical).toBeDefined();
    const rig = perspectiveRigFrom3dCameraProjection(snap2!.projection);
    expect(rig.mode).toBe("3p");

    unsubscribe();
    bridge.setEnabled(false);
    expect(bridge.sync(camA)).toBeNull();
    bridge.dispose();
  });

  it("applyPerspectiveRigToRulerHandlers가 소실점 수 일치·증가·감소를 모두 안전하게 조정한다", () => {
    const handlers = {
      setActive: vi.fn(),
      setLockHorizon: vi.fn(),
      setEyeLevelY: vi.fn(),
      addPoint: vi.fn(),
      removePoint: vi.fn(),
      movePoint: vi.fn(),
    };
    const rig2p = {
      mode: "2p" as const,
      eyeLevelY: 540,
      lockHorizon: true,
      points: [
        { axis: "x-right" as const, x: -120, y: 540 },
        { axis: "z-forward" as const, x: 960, y: 540 },
      ],
    };

    const pendingImmediate = applyPerspectiveRigToRulerHandlers(
      rig2p,
      {
        active: false,
        points: [
          { id: "vp-a", x: 100, y: 500 },
          { id: "vp-b", x: 700, y: 500 },
        ],
      },
      handlers,
    );
    expect(pendingImmediate).toBeNull();
    expect(handlers.setActive).toHaveBeenCalledWith(true);
    expect(handlers.movePoint).toHaveBeenCalledWith("vp-a", -120, 540);
    expect(handlers.movePoint).toHaveBeenCalledWith("vp-b", 960, 540);

    const pendingAdd = applyPerspectiveRigToRulerHandlers(
      rig2p,
      { active: true, points: [{ id: "vp-a", x: 100, y: 500 }] },
      handlers,
    );
    expect(pendingAdd).toEqual(rig2p);
    expect(handlers.addPoint).toHaveBeenCalledTimes(1);

    const pendingRemove = applyPerspectiveRigToRulerHandlers(
      { ...rig2p, mode: "1p", points: [{ axis: "z-forward", x: 400, y: 540 }] },
      {
        active: true,
        points: [
          { id: "vp-a", x: 100, y: 500 },
          { id: "vp-b", x: 700, y: 500 },
        ],
      },
      handlers,
    );
    expect(pendingRemove?.points).toHaveLength(1);
    expect(handlers.removePoint).toHaveBeenCalledWith("vp-b");
  });
});

describe("StudioInspectorRulersSection 통합 배선 (단일 원근 자 · 3D 카메라 동기화 · 벡터선 수정)", () => {
  it("중복 StudioRulersPanel 없이 단일 원근 자 UI를 렌더하고 onSyncFrom3dCamera 및 vectorStrokes를 라이브 연결한다", async () => {
    const onPerspectiveGuideChange = vi.fn();
    const onSyncFrom3dCamera = vi.fn();
    const onVectorStrokesChange = vi.fn();
    const sampleStrokes: DrawEl[] = [
      {
        id: "live-stroke-1",
        type: "draw",
        kind: "freehand",
        mode: "pen",
        brush: "gpen",
        points: [10, 20, 60, 40, 120, 20],
        pressures: [0.5, 0.5, 0.5],
        stroke: "#111111",
        strokeWidth: 4,
      },
    ];

    render(
      createElement(StudioInspectorRulersSection, {
        perspectiveRulerActive: true,
        vanishingPoints: [
          { id: "vp-1", x: 100, y: 600 },
          { id: "vp-2", x: 700, y: 600 },
        ],
        perspectiveEyeLevelY: 600,
        perspectiveLockHorizon: true,
        canvasH: 1200,
        drawingAssistControlsDisabled: false,
        isometricGridActive: false,
        isometricAngleDeg: 30,
        isometricCellSize: 32,
        isometricOriginX: 400,
        isometricOriginY: 600,
        advancedRulers: createDefaultStudioAdvancedRulerDocument(),
        groups: [],
        vectorStrokes: sampleStrokes,
        onVectorStrokesChange,
        onPerspectiveGuideChange,
        onSyncFrom3dCamera,
        setPerspectiveRulerActive: vi.fn(),
        addVanishingPointHandler: vi.fn(),
        removeVanishingPointHandler: vi.fn(),
        previewVanishingPointById: vi.fn(),
        moveVanishingPointById: vi.fn(),
        setPerspectiveLockHorizon: vi.fn(),
        setPerspectiveEyeLevelY: vi.fn(),
        previewPerspectiveEyeLevelY: vi.fn(),
        alignPerspectiveToEyeLevel: vi.fn(),
        toggleIsometricGridActive: vi.fn(),
        previewIsometricAngleDegClamped: vi.fn(),
        setIsometricAngleDegClamped: vi.fn(),
        previewIsometricCellSizeClamped: vi.fn(),
        setIsometricCellSizeClamped: vi.fn(),
        previewIsometricOrigin: vi.fn(),
        commitIsometricOrigin: vi.fn(),
        resetIsometricOrigin: vi.fn(),
        insertIsometricPrimitive: vi.fn(async () => undefined),
        insertIsometricSolid: vi.fn(),
        addAdvancedRuler: vi.fn(),
        patchAdvancedRuler: vi.fn(),
        removeAdvancedRuler: vi.fn(),
        selectAdvancedRuler: vi.fn(),
        setActiveAdvancedRuler: vi.fn(),
      }),
    );

    // 섹션이 접혀 있으면 열어 내부 lazy 패널들을 마운트한다.
    const toggleBtn = screen.getByRole("button", { name: /자|가이드|Rulers/i });
    if (toggleBtn.getAttribute("aria-expanded") === "false") {
      fireEvent.click(toggleBtn);
    }

    // 단일 StudioPerspectivePanel만 존재하고 중복 StudioRulersPanel("원근 가이드" 별도 토글)은 없어야 한다.
    const syncPresetBtn = await screen.findByRole("button", { name: "3점 로우앵글" });
    expect(screen.queryByRole("button", { name: /1점 투시/ })).toBeNull();

    fireEvent.click(syncPresetBtn);
    expect(onSyncFrom3dCamera).toHaveBeenCalledTimes(1);
    expect(onSyncFrom3dCamera.mock.calls[0]?.[0]?.mode).toBe("3p");
    expect(onPerspectiveGuideChange).toHaveBeenCalledTimes(1);
    expect(onPerspectiveGuideChange.mock.calls[0]?.[0]?.guide.kind).toBe("three-point");

    // StudioAdvancedRulerPanel 내부 벡터선 다듬기 섹션이 실제 vectorStrokes(획 1개)와 onVectorStrokesChange로 연결된다.
    const vectorSummary = await screen.findByText("곡선 펜 · 벡터선 다듬기 도구");
    fireEvent.click(vectorSummary);

    await waitFor(() => {
      expect(screen.getByText(/획 1개/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "벡터선 집기" }));
    expect(onVectorStrokesChange).toHaveBeenCalledTimes(1);
    expect(onVectorStrokesChange.mock.calls[0]?.[0]?.[0]?.id).toBe("live-stroke-1");
  });
});
