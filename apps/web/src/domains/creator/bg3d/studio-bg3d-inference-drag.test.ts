import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  collectStudioBg3dInferenceDragBases,
  createStudioBg3dInferenceDragSession,
  resolveStudioBg3dInferenceDragConstraint,
  resolveStudioBg3dInferenceWorldPerPixel,
} from "./studio-bg3d-inference-drag";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(1.5, 5, 10);
  camera.lookAt(1.5, 0.5, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function boxObject(position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

function entity(id: string, position: [number, number, number]): StudioBg3dInferenceSceneEntity {
  return { id, kind: "box", label: `상자 ${id}`, position, rotation: [0, 0, 0], scale: [1, 1, 1] };
}

interface SetupOptions {
  readonly alt?: boolean;
  readonly space?: "world" | "local";
  readonly withCamera?: boolean;
}

function setup(options: SetupOptions = {}) {
  const service = createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
  const camera = makeCamera();
  const scene = new THREE.Group();
  const object = boxObject([0, 0.5, 0]);
  scene.add(object);
  scene.updateMatrixWorld(true);
  let synced = 0;
  const session = createStudioBg3dInferenceDragSession({
    service,
    getCamera: () => (options.withCamera === false ? null : camera),
    getViewportHeightPx: () => 800,
    syncScene: () => {
      synced += 1;
      service.syncScene({ entities: [entity("D", [0, 0.5, 0]), entity("N", [3, 0.5, 0])] });
    },
    getExcludedIds: () => new Set(["D"]),
    getSpace: () => options.space ?? "world",
    isAltDown: () => options.alt === true,
  });
  return { service, camera, scene, object, session, synced: () => synced };
}

describe("기즈모 드래그 보조 함수", () => {
  it("기즈모 축 이름을 계획기 제약으로 바꾼다", () => {
    expect(resolveStudioBg3dInferenceDragConstraint("X")).toEqual({ kind: "axis", axis: "x" });
    expect(resolveStudioBg3dInferenceDragConstraint("Y")).toEqual({ kind: "axis", axis: "y" });
    expect(resolveStudioBg3dInferenceDragConstraint("Z")).toEqual({ kind: "axis", axis: "z" });
    expect(resolveStudioBg3dInferenceDragConstraint("XY")).toEqual({ kind: "plane", excludedAxis: "z" });
    expect(resolveStudioBg3dInferenceDragConstraint("YZ")).toEqual({ kind: "plane", excludedAxis: "x" });
    expect(resolveStudioBg3dInferenceDragConstraint("XZ")).toEqual({ kind: "plane", excludedAxis: "y" });
    expect(resolveStudioBg3dInferenceDragConstraint("XYZ")).toEqual({ kind: "free" });
    expect(resolveStudioBg3dInferenceDragConstraint(null)).toEqual({ kind: "free" });
    expect(resolveStudioBg3dInferenceDragConstraint("E")).toEqual({ kind: "free" });
  });

  it("경계 상자에서 기준점 9개(바닥 중심 → 바닥 모서리 → 윗면 모서리)를 만든다", () => {
    const box = new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(1, 2, 2));
    const bases = collectStudioBg3dInferenceDragBases(box, [9, 9, 9]);
    expect(bases).toHaveLength(9);
    expect(bases[0]).toEqual([0, 0, 0]);
    expect(bases.slice(1, 5).every((base) => base[1] === 0)).toBe(true);
    expect(bases.slice(5).every((base) => base[1] === 2)).toBe(true);
    expect(collectStudioBg3dInferenceDragBases(new THREE.Box3(), [9, 9, 9])).toEqual([[9, 9, 9]]);
  });

  it("깊이에서 화면 1px의 월드 길이를 원근·직교 모두 구한다", () => {
    const camera = makeCamera();
    const near = resolveStudioBg3dInferenceWorldPerPixel(camera, 800, new THREE.Vector3(1.5, 0.5, 5));
    const far = resolveStudioBg3dInferenceWorldPerPixel(camera, 800, new THREE.Vector3(1.5, 0.5, -20));
    expect(near).not.toBeNull();
    expect(far).toBeGreaterThan(near ?? 0);
    const ortho = new THREE.OrthographicCamera(-4, 4, 4, -4, 0.1, 100);
    expect(resolveStudioBg3dInferenceWorldPerPixel(ortho, 400, new THREE.Vector3())).toBeCloseTo(8 / 400, 12);
    expect(resolveStudioBg3dInferenceWorldPerPixel(camera, 0, new THREE.Vector3())).toBeNull();
  });
});

describe("이동 드래그 스냅 세션", () => {
  it("시작할 때 장면을 맞추고 이동 세션을 연다 (HUD·키보드 라우팅 없음)", () => {
    const { session, object, service, synced } = setup();
    session.begin(object);
    expect(synced()).toBe(1);
    expect(session.isActive()).toBe(true);
    const snapshot = service.getSnapshot();
    expect(snapshot.session.tool).toBe("move");
    expect(snapshot.options).toEqual({ keyboard: false, hud: false });
    expect(snapshot.session.referencePoint).toEqual([0, 0.5, 0]);
  });

  it("옆 상자 모서리 근처로 X축 이동하면 면이 맞닿는 위치로 보정하고 끝점 추론을 게시한다", () => {
    const { session, object, service } = setup();
    session.begin(object);
    // TransformControls가 객체를 직접 옮긴 상태를 흉내 낸다: 오른쪽 면이 2.48 (이웃 면 2.5에서 2cm 전).
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    const update = session.update("X");
    expect(update.snapped).toBe(true);
    expect(object.position.x).toBeCloseTo(2, 9);
    expect(object.position.y).toBeCloseTo(0.5, 9);
    expect(object.position.z).toBeCloseTo(0, 9);
    const result = service.getResult();
    expect(result?.kind).toBe("endpoint");
    expect(result?.detail).toContain("상자 N");
    expect(service.getSnapshot().live.text).toContain("끝점");
  });

  it("자유 이동(XYZ)은 세 축 모두 모서리에 정확히 붙인다", () => {
    const { session, object } = setup();
    session.begin(object);
    object.position.set(1.98, 0.5, 0.03);
    object.updateMatrixWorld(true);
    expect(session.update("XYZ").snapped).toBe(true);
    expect(object.position.x).toBeCloseTo(2, 9);
    expect(object.position.z).toBeCloseTo(0, 9);
  });

  it("Alt를 누르고 있으면 스냅을 끈다", () => {
    const { session, object, service } = setup({ alt: true });
    session.begin(object);
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    expect(session.update("X").snapped).toBe(false);
    expect(object.position.x).toBeCloseTo(1.98, 12);
    expect(service.getResult()).toBeNull();
  });

  it("후보가 멀면 위치를 건드리지 않고 이전 표시를 지운다", () => {
    const { session, object, service } = setup();
    session.begin(object);
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    session.update("X");
    expect(service.getResult()).not.toBeNull();
    object.position.set(-6, 0.5, 0);
    object.updateMatrixWorld(true);
    expect(session.update("X").snapped).toBe(false);
    expect(object.position.x).toBe(-6);
    expect(service.getResult()).toBeNull();
  });

  it("부모가 이동된 객체도 월드 기준으로 보정해 로컬 좌표에 쓴다", () => {
    const { session, scene, service } = setup();
    const parent = new THREE.Group();
    parent.position.set(10, 0, 0);
    scene.add(parent);
    const child = boxObject([-10, 0.5, 0]);
    parent.add(child);
    scene.updateMatrixWorld(true);
    // 자식의 월드 위치는 (0,0.5,0)로 시작한다.
    session.begin(child);
    child.position.set(-8.02, 0.5, 0);
    child.updateMatrixWorld(true);
    expect(session.update("X").snapped).toBe(true);
    expect(child.position.x).toBeCloseTo(-8, 9);
    const world = child.getWorldPosition(new THREE.Vector3());
    expect(world.x).toBeCloseTo(2, 9);
    void service;
  });

  it("끝나면 세션을 닫고 마지막 샘플이 스냅이었는지 알려 준다", () => {
    const { session, object, service } = setup();
    session.begin(object);
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    session.update("X");
    expect(session.end()).toEqual({ lastSnapped: true });
    expect(session.isActive()).toBe(false);
    expect(service.isActive()).toBe(false);
    expect(session.end()).toEqual({ lastSnapped: false });
  });

  it("카메라가 없거나 시작 전이면 아무 일도 하지 않는다", () => {
    const noCamera = setup({ withCamera: false });
    noCamera.session.begin(noCamera.object);
    expect(noCamera.session.update("X")).toEqual({ snapped: false });
    const idle = setup();
    expect(idle.session.update("X")).toEqual({ snapped: false });
  });

  it("이미 진행 중이면 begin을 다시 불러도 시작 위치를 덮어쓰지 않는다", () => {
    const { session, object, service, synced } = setup();
    session.begin(object);
    object.position.set(1, 0.5, 0);
    session.begin(object);
    expect(synced()).toBe(1);
    expect(service.getSnapshot().session.referencePoint).toEqual([0, 0.5, 0]);
  });

  it("로컬 축 모드에서는 회전한 객체의 축을 기준으로 제약한다", () => {
    const { session, object } = setup({ space: "local" });
    session.begin(object);
    object.position.set(1.98, 0.5, 0);
    object.updateMatrixWorld(true);
    expect(session.update("X").snapped).toBe(true);
    expect(object.position.x).toBeCloseTo(2, 9);
  });
});
