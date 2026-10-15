import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { attachStudioBg3dInferencePointer } from "./studio-bg3d-inference-pointer-binding";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type {
  StudioBg3dInferencePointerService,
  StudioBg3dInferencePointerTargetLike,
} from "./studio-bg3d-inference-pointer-binding";

const RECT = { left: 0, top: 0, width: 800, height: 800 } as const;

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 2, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function entityGroup(id: string, position: [number, number, number]): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.userData = { studioBg3dEntityId: id, studioBg3dEntityKind: "primitive" };
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

/** 월드 점의 화면 좌표(px). */
function screenOf(camera: THREE.Camera, point: [number, number, number]): { x: number; y: number } {
  const ndc = new THREE.Vector3(...point).project(camera);
  return { x: ((ndc.x + 1) / 2) * RECT.width, y: ((1 - ndc.y) / 2) * RECT.height };
}

function fakeTarget() {
  const listeners = new Map<string, EventListener[]>();
  const target: StudioBg3dInferencePointerTargetLike = {
    addEventListener(type, listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener(type, listener) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== listener));
    },
  };
  return {
    target,
    count: () => [...listeners.values()].reduce((sum, list) => sum + list.length, 0),
    fire(type: string, event: Record<string, unknown> = {}) {
      for (const listener of listeners.get(type) ?? []) {
        listener({ pointerType: "mouse", isPrimary: true, ...event } as unknown as Event);
      }
    },
  };
}

function setup(options: { readonly begin?: boolean; readonly slowResolveMs?: number } = {}) {
  const clock = { t: 1_000 };
  const queue: Array<{ at: number; run: () => void; canceled: boolean }> = [];
  const schedule = (run: () => void, delay: number) => {
    const entry = { at: clock.t + delay, run, canceled: false };
    queue.push(entry);
    return () => {
      entry.canceled = true;
    };
  };
  const service = createStudioBg3dInferenceService({ now: () => clock.t, scheduler: schedule });
  service.syncScene({
    entities: [{ id: "A", kind: "box", label: "상자 A", position: [0, 2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  });
  if (options.begin !== false) service.begin("measure", { referencePoint: [4, 2, 0] });
  const camera = makeCamera();
  const roots = new Map<string, THREE.Object3D>([["A", entityGroup("A", [0, 2, 0])]]);
  const dom = fakeTarget();
  let controlTarget = false;
  // 큰 모델이 있는 장면처럼 해석 한 번(표면 레이캐스트 포함)이 오래 걸리는 상황을 가짜 시계로 흉내 낸다.
  const slowResolveMs = options.slowResolveMs ?? 0;
  const pointerService: StudioBg3dInferencePointerService = {
    isActive: () => service.isActive(),
    resolve: (input) => {
      clock.t += slowResolveMs;
      return service.resolve(input);
    },
    publishResult: (result) => service.publishResult(result),
    addHoverReference: (point) => service.addHoverReference(point),
    getIndex: () => service.getIndex(),
    getResult: () => service.getResult(),
  };
  const binding = attachStudioBg3dInferencePointer({
    target: dom.target,
    service: pointerService,
    getCamera: () => camera,
    getRect: () => RECT,
    getRoots: () => roots,
    groundY: 0,
    isControlTarget: () => controlTarget,
    now: () => clock.t,
    schedule,
  });
  return {
    service,
    camera,
    roots,
    dom,
    binding,
    clock,
    setControlTarget(value: boolean) {
      controlTarget = value;
    },
    pending: () => queue.filter((entry) => !entry.canceled).length,
    advance(ms: number) {
      clock.t += ms;
      for (const entry of queue.filter((item) => !item.canceled && item.at <= clock.t)) {
        entry.canceled = true;
        entry.run();
      }
    },
  };
}

describe("포인터 → 추론 서비스 연결", () => {
  it("모서리 3px 옆의 pointermove는 끝점 추론이 된다", () => {
    const { dom, camera, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x + 3, clientY: corner.y });
    expect(service.getResult()?.kind).toBe("endpoint");
    expect(service.getResult()?.detail).toContain("상자 A");
  });

  it("터치는 마우스보다 넓은 반경으로 붙는다", () => {
    const mouse = setup();
    const farCorner = screenOf(mouse.camera, [0.5, 2.5, 0.5]);
    const point = { clientX: farCorner.x + 16, clientY: farCorner.y };
    mouse.dom.fire("pointermove", { ...point, pointerType: "mouse" });
    expect(mouse.service.getResult()?.kind).not.toBe("endpoint");
    const touch = setup();
    touch.dom.fire("pointerdown", { ...point, pointerType: "touch" });
    expect(touch.service.getResult()?.kind).toBe("endpoint");
  });

  it("같은 프레임에 몰린 pointermove는 한 번만 해석하고 마지막 샘플은 다음 프레임에 처리한다", () => {
    const { dom, camera, binding, advance, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    for (let i = 0; i < 100; i += 1) {
      dom.fire("pointermove", { clientX: corner.x + 60 - i * 0.6, clientY: corner.y });
    }
    expect(binding.stats().queries).toBe(1);
    expect(binding.stats().dropped).toBeGreaterThanOrEqual(98);
    // 첫 샘플(+60px)은 끝점 반경 밖이라 추론이 없다. 마지막 샘플(+0.6px)이 다음 프레임에 처리된다.
    expect(service.getResult()).toBeNull();
    advance(20);
    expect(binding.stats().queries).toBe(2);
    expect(service.getResult()?.kind).toBe("endpoint");
  });

  it("pointerdown은 게이트를 건너뛰고 즉시 해석한다 (곧이어 오는 클릭이 쓰도록)", () => {
    const { dom, camera, roots, binding, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x - 40, clientY: corner.y + 40 });
    // 윗면 모서리 안쪽 3px을 누른다 — R3F가 클릭 점으로 알려 줄 첫 표면 교점이 존재한다.
    const down = { clientX: corner.x - 3, clientY: corner.y + 3 };
    dom.fire("pointerdown", down);
    expect(binding.stats().queries).toBe(2);
    expect(service.getResult()?.kind).toBe("endpoint");
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(
      new THREE.Vector2((down.clientX / RECT.width) * 2 - 1, -(down.clientY / RECT.height) * 2 + 1),
      camera,
    );
    const hit = raycaster.intersectObjects([...roots.values()], true)[0];
    expect(hit).toBeDefined();
    const hitPoint: [number, number, number] = hit ? [hit.point.x, hit.point.y, hit.point.z] : [0, 0, 0];
    const fresh = service.resolveFreshPoint(hitPoint);
    expect(fresh.snapped).toBe(true);
    expect(fresh.point[0]).toBeCloseTo(0.5, 6);
    expect(fresh.point[1]).toBeCloseTo(2.5, 6);
    expect(fresh.point[2]).toBeCloseTo(0.5, 6);
  });

  it("해석이 느린 장면에서는 간격이 늘어 쿼리 수가 줄고, 멈춘 자리의 마지막 샘플은 끝내 처리한다", () => {
    const fast = setup();
    const slow = setup({ slowResolveMs: 20 });
    const corner = screenOf(slow.camera, [0.5, 2.5, 0.5]);
    for (let i = 0; i < 600; i += 1) {
      // 커서가 끝점에서 멀어지는 쪽으로 계속 움직이다가 마지막 샘플만 끝점 가까이에서 멈춘다.
      const x = i === 599 ? corner.x + 2 : corner.x + 80 + i * 0.1;
      for (const scene of [fast, slow]) {
        scene.clock.t += 1;
        scene.dom.fire("pointermove", { clientX: x, clientY: corner.y });
      }
    }
    // 빠른 장면은 프레임(16ms)당 한 번, 느린 장면은 비용(20ms)의 3배 간격으로만 해석한다.
    expect(fast.binding.stats().intervalMs).toBe(16);
    expect(slow.binding.stats().intervalMs).toBe(60);
    expect(slow.binding.stats().queries).toBeLessThan(fast.binding.stats().queries / 2);
    expect(slow.binding.stats().queries).toBeLessThan(40);
    // 보류 중이던 마지막 샘플은 간격이 지나면 반드시 처리된다.
    slow.advance(200);
    expect(slow.service.getResult()?.kind).toBe("endpoint");
  });

  it("보조 포인터(멀티터치 둘째 손가락)와 뷰포트 컨트롤 위의 이벤트는 무시한다", () => {
    const { dom, binding, setControlTarget, camera } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x, clientY: corner.y, isPrimary: false });
    expect(binding.stats().queries).toBe(0);
    setControlTarget(true);
    dom.fire("pointerdown", { clientX: corner.x, clientY: corner.y });
    expect(binding.stats().queries).toBe(0);
  });

  it("세션이 없으면 아무것도 해석하지 않는다", () => {
    const { dom, binding, camera } = setup({ begin: false });
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x, clientY: corner.y });
    dom.fire("pointerdown", { clientX: corner.x, clientY: corner.y });
    expect(binding.stats().queries).toBe(0);
  });

  it("뷰포트를 벗어나면 결과를 비워 마커가 남지 않는다", () => {
    const { dom, camera, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x, clientY: corner.y });
    expect(service.getResult()).not.toBeNull();
    dom.fire("pointerleave");
    expect(service.getResult()).toBeNull();
  });

  it("영역 밖 좌표는 해석을 건너뛴다 (실패해도 던지지 않는다)", () => {
    const { dom, binding } = setup();
    expect(() => dom.fire("pointermove", { clientX: -50, clientY: 20 })).not.toThrow();
    expect(binding.stats().queries).toBe(0);
  });

  it("끝점 위에 머무르면 기준점에서 연장용 호버 기준점이 한 번 등록된다", () => {
    const { dom, camera, advance, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x + 2, clientY: corner.y });
    advance(300);
    expect(service.getSnapshot().session.hoverReferences).toHaveLength(0);
    advance(500);
    expect(service.getSnapshot().session.hoverReferences).toHaveLength(1);
    expect(service.getSnapshot().session.hoverReferences[0]?.[0]).toBeCloseTo(0.5, 6);
    // 같은 자리에서 더 머물러도 늘지 않는다.
    advance(2_000);
    expect(service.getSnapshot().session.hoverReferences).toHaveLength(1);
  });

  it("머무르는 도중 다른 곳으로 움직이면 등록하지 않는다", () => {
    const { dom, camera, advance, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x + 2, clientY: corner.y });
    advance(400);
    dom.fire("pointermove", { clientX: corner.x + 300, clientY: corner.y + 300 });
    advance(2_000);
    expect(service.getSnapshot().session.hoverReferences).toHaveLength(0);
  });

  it("detach는 리스너와 예약된 작업을 모두 정리한다", () => {
    const { dom, binding, pending, camera, service } = setup();
    const corner = screenOf(camera, [0.5, 2.5, 0.5]);
    dom.fire("pointermove", { clientX: corner.x + 2, clientY: corner.y });
    dom.fire("pointermove", { clientX: corner.x + 3, clientY: corner.y });
    expect(pending()).toBeGreaterThan(0);
    binding.detach();
    expect(dom.count()).toBe(0);
    expect(pending()).toBe(0);
    const before = binding.stats().queries;
    dom.fire("pointermove", { clientX: corner.x, clientY: corner.y });
    expect(binding.stats().queries).toBe(before);
    expect(service.isActive()).toBe(true);
  });
});
