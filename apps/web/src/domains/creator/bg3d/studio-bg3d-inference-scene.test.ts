import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";
import {
  buildStudioBg3dInferenceEntities,
  buildStudioBg3dInferenceGuideSources,
  readStudioBg3dInferenceLocalBounds,
} from "./studio-bg3d-inference-scene";
import {
  addStudioBg3dMeasurementGuide,
  createStudioBg3dMeasurementDocument,
  setStudioBg3dMeasurementGuideVisibility,
} from "./studio-bg3d-measurement";

import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { BgCustomModelInstance } from "../studio-background-3d-model";

function primitive(patch: Partial<BgPrimitive> & Pick<BgPrimitive, "id">): BgPrimitive {
  return {
    kind: "box",
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#c9a876",
    ...patch,
  };
}

function model(patch: Partial<BgCustomModelInstance> & Pick<BgCustomModelInstance, "id">): BgCustomModelInstance {
  return {
    modelId: "model-1",
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...patch,
  };
}

function meshAt(position: [number, number, number], size: [number, number, number]): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshBasicMaterial());
  mesh.position.set(...position);
  return mesh;
}

describe("로컬 경계 상자 읽기", () => {
  it("자식 메시 지오메트리의 캐시된 상자를 객체 로컬 좌표로 합친다", () => {
    const group = new THREE.Group();
    group.position.set(5, 0, 5);
    group.rotation.set(0, Math.PI / 3, 0);
    group.add(meshAt([0, 1, 0], [2, 2, 2]));
    group.add(meshAt([3, 0.5, 0], [1, 1, 1]));
    group.updateMatrixWorld(true);
    const bounds = readStudioBg3dInferenceLocalBounds(group);
    expect(bounds).not.toBeNull();
    // 객체 자신의 이동·회전은 로컬 상자에 영향을 주지 않는다.
    expect(bounds?.min[0]).toBeCloseTo(-1, 6);
    expect(bounds?.max[0]).toBeCloseTo(3.5, 6);
    expect(bounds?.min[1]).toBeCloseTo(0, 6);
    expect(bounds?.max[1]).toBeCloseTo(2, 6);
  });

  it("메시가 없으면 null이다", () => {
    expect(readStudioBg3dInferenceLocalBounds(new THREE.Group())).toBeNull();
  });
});

describe("에디터 상태 → 추론 입력", () => {
  it("도형은 이름·계층·숨김을 그대로 옮긴다", () => {
    const entities = buildStudioBg3dInferenceEntities({
      primitives: [
        primitive({ id: "A", name: "책상" }),
        primitive({ id: "B", parentId: "A", visible: false }),
      ],
      customModels: [],
      objects: null,
    });
    expect(entities).toEqual([
      { id: "A", kind: "box", label: "책상", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], parentId: null, visible: true },
      { id: "B", kind: "box", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1], parentId: "A", visible: false },
    ]);
  });

  it("모델은 등록된 객체의 로컬 경계 상자를, 없으면 대체 상자를, 그것도 없으면 null을 쓴다", () => {
    const group = new THREE.Group();
    group.add(meshAt([0, 1, 0], [2, 2, 2]));
    group.updateMatrixWorld(true);
    const entities = buildStudioBg3dInferenceEntities({
      primitives: [],
      customModels: [model({ id: "M1", name: "의자" }), model({ id: "M2" }), model({ id: "M3" })],
      objects: new Map([["M1", group]]),
      fallbackModelBounds: (instance) => (instance.id === "M2" ? { min: [-1, 0, -1], max: [1, 2, 1] } : null),
    });
    expect(entities.map((entity) => entity.kind)).toEqual(["model", "model", "model"]);
    expect(entities[0]?.label).toBe("의자");
    expect(entities[0]?.modelBounds?.max).toEqual([1, 2, 1]);
    expect(entities[1]?.label).toBe("3D 모델");
    expect(entities[1]?.modelBounds).toEqual({ min: [-1, 0, -1], max: [1, 2, 1] });
    expect(entities[2]?.modelBounds).toBeNull();
  });

  it("서비스에 넣으면 모델 경계 상자 후보가 '근사'로 표시되어 끝점이 된다", () => {
    const group = new THREE.Group();
    group.add(meshAt([0, 1, 0], [2, 2, 2]));
    group.updateMatrixWorld(true);
    const entities = buildStudioBg3dInferenceEntities({
      primitives: [],
      customModels: [model({ id: "M1", name: "의자", position: [4, 0, 0] })],
      objects: new Map([["M1", group]]),
    });
    const service = createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
    service.syncScene({ entities });
    expect(service.getSnapshot().scene.stats?.entities).toBe(1);
    service.begin("measure", { referencePoint: [0, 0, 0] });
    const outcome = service.resolve({ cursor: { kind: "point", point: [5.02, 2, 1], worldPerPixel: 1 / 64 } });
    expect(outcome?.ok).toBe(true);
    expect(service.getResult()?.kind).toBe("endpoint");
    expect(service.getResult()?.approximate).toBe(true);
    expect(service.getResult()?.detail).toContain("경계 상자");
  });

  it("정점 순회 없이 객체 수에 선형으로 빠르게 변환한다 (512개)", () => {
    const primitives = Array.from({ length: 512 }, (_, i) =>
      primitive({ id: `P${i}`, position: [(i % 32) * 2, 0.5, Math.floor(i / 32) * 2] }));
    const started = performance.now();
    const entities = buildStudioBg3dInferenceEntities({ primitives, customModels: [], objects: null });
    expect(entities).toHaveLength(512);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe("영구 측정 가이드", () => {
  it("보이는 가이드만 후보 선분과 기준 방향이 된다", () => {
    let document = createStudioBg3dMeasurementDocument("cm");
    const first = addStudioBg3dMeasurementGuide(document, { startWorld: [0, 0, 0], endWorld: [2, 0, 0] });
    if (!first.ok) throw new Error(first.code);
    document = first.document;
    const second = addStudioBg3dMeasurementGuide(document, { startWorld: [0, 0, 0], endWorld: [0, 0, 3] });
    if (!second.ok || !second.guide) throw new Error("가이드 추가 실패");
    document = second.document;
    const hidden = setStudioBg3dMeasurementGuideVisibility(document, second.guide.id, false);
    if (!hidden.ok) throw new Error(hidden.code);
    const sources = buildStudioBg3dInferenceGuideSources(hidden.document);
    expect(sources.lines).toHaveLength(1);
    expect(sources.lines[0]?.label).toContain("측정 가이드 1");
    expect(sources.lines[0]?.label).toContain("200");
    expect(sources.lines[0]?.role).toBe("guide");
    expect(sources.directions).toHaveLength(1);
    expect(sources.directions[0]?.direction).toEqual([1, 0, 0]);
    expect(sources.directions[0]?.segment).toEqual({ a: [0, 0, 0], b: [2, 0, 0] });
  });

  it("가이드 끝점이 추론 후보가 되고 가이드와 평행한 위치는 '평행' 추론이 된다", () => {
    let document = createStudioBg3dMeasurementDocument("m");
    const added = addStudioBg3dMeasurementGuide(document, { startWorld: [0, 0, 0], endWorld: [2, 0, 2] });
    if (!added.ok) throw new Error(added.code);
    document = added.document;
    const { lines, directions } = buildStudioBg3dInferenceGuideSources(document);
    const service = createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
    service.syncScene({ entities: [], lines });
    service.begin("measure", { referencePoint: [0, 0, 3] });
    service.setReferenceDirections(directions);
    // 가이드는 대각선(1,0,1) 방향 — 기준점에서 같은 방향으로 뻗은 (2,0,5) 근처는 '평행'이다.
    service.resolve({ cursor: { kind: "point", point: [2.02, 0, 5], worldPerPixel: 1 / 64 } });
    expect(service.getResult()?.kind).toBe("parallel");
    expect(service.getResult()?.relation?.label).toContain("측정 가이드 1");
    service.resolve({ cursor: { kind: "point", point: [2.02, 0, 2.01], worldPerPixel: 1 / 64 } });
    expect(service.getResult()?.kind).toBe("endpoint");
    expect(service.getResult()?.detail).toContain("측정 가이드 1");
  });
});
