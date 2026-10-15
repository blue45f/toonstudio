import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { PRIMITIVE_DEFS } from "../studio-background-3d-metadata";
import { makeGeometry } from "../studio-background-3d-primitives";

import {
  buildStudioBg3dInferenceSourceSet,
  collectStudioBg3dInferenceDescendantIds,
  getStudioBg3dInferenceShapeTemplate,
  listStudioBg3dInferencePointsNear,
} from "./studio-bg3d-inference-sources";

import type { BgPrimitiveKind } from "../studio-background-3d-metadata";
import type { StudioBg3dInferenceSceneEntity } from "./studio-bg3d-inference-sources";

const ALL_KINDS = Object.keys(PRIMITIVE_DEFS) as BgPrimitiveKind[];

function entity(
  id: string,
  kind: StudioBg3dInferenceSceneEntity["kind"],
  overrides: Partial<StudioBg3dInferenceSceneEntity> = {},
): StudioBg3dInferenceSceneEntity {
  return {
    id,
    kind,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    ...overrides,
  };
}

describe("studio-bg3d-inference-sources 도형 특징 표", () => {
  it("13개 도형 모두 표의 경계 상자가 makeGeometry의 실제 경계 상자와 같다", () => {
    expect(ALL_KINDS).toHaveLength(13);
    for (const kind of ALL_KINDS) {
      const geometry = makeGeometry(kind);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      const template = getStudioBg3dInferenceShapeTemplate(kind);
      expect(box, kind).not.toBeNull();
      if (!box) continue;
      for (let axis = 0; axis < 3; axis += 1) {
        expect(template.min[axis], `${kind}.min[${axis}]`).toBeCloseTo(box.min.getComponent(axis), 6);
        expect(template.max[axis], `${kind}.max[${axis}]`).toBeCloseTo(box.max.getComponent(axis), 6);
      }
      geometry.dispose();
    }
  });

  it("끝점 후보는 모두 실제 지오메트리 정점 위에 있다 (유령 스냅점 금지)", () => {
    for (const kind of ALL_KINDS) {
      const geometry = makeGeometry(kind);
      const positions = geometry.getAttribute("position");
      const vertices: THREE.Vector3[] = [];
      for (let index = 0; index < positions.count; index += 1) {
        vertices.push(new THREE.Vector3().fromBufferAttribute(positions, index));
      }
      const template = getStudioBg3dInferenceShapeTemplate(kind);
      for (const point of template.points.filter((candidate) => candidate.kind === "endpoint")) {
        const target = new THREE.Vector3(...point.local);
        const nearest = Math.min(...vertices.map((vertex) => vertex.distanceTo(target)));
        expect(nearest, `${kind} ${point.tag} ${point.local.join(",")}`).toBeLessThan(1e-4);
      }
      geometry.dispose();
    }
  });

  it("모서리 후보의 양 끝은 표의 끝점이거나 꼭짓점이며 경계 상자 밖으로 나가지 않는다", () => {
    for (const kind of ALL_KINDS) {
      const template = getStudioBg3dInferenceShapeTemplate(kind);
      const endpoints = template.points.filter((candidate) => candidate.kind === "endpoint");
      for (const edge of template.edges) {
        for (const end of [edge.a, edge.b]) {
          const matches = endpoints.some((point) =>
            Math.hypot(point.local[0] - end[0], point.local[1] - end[1], point.local[2] - end[2]) < 1e-9);
          expect(matches, `${kind} edge end ${end.join(",")}`).toBe(true);
          for (let axis = 0; axis < 3; axis += 1) {
            expect(end[axis]).toBeGreaterThanOrEqual((template.min[axis] ?? 0) - 1e-9);
            expect(end[axis]).toBeLessThanOrEqual((template.max[axis] ?? 0) + 1e-9);
          }
        }
      }
    }
  });
});

describe("studio-bg3d-inference-sources 장면 변환", () => {
  it("상자 하나에서 꼭짓점 8·모서리 12·중간점 12·중심 7을 만들고 월드 좌표로 옮긴다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [entity("box-1", "box", { position: [2, 1, -3], scale: [2, 2, 2] })],
    });
    const endpoints = set.points.filter((feature) => feature.kind === "endpoint");
    const midpoints = set.points.filter((feature) => feature.kind === "midpoint");
    const centers = set.points.filter((feature) => feature.kind === "center");
    expect(endpoints).toHaveLength(8);
    expect(midpoints).toHaveLength(12);
    expect(centers).toHaveLength(7);
    expect(set.edges).toHaveLength(12);
    expect(set.volumes).toHaveLength(1);
    const xs = endpoints.map((feature) => feature.point[0]);
    expect(Math.min(...xs)).toBeCloseTo(1, 9);
    expect(Math.max(...xs)).toBeCloseTo(3, 9);
    expect(set.stats.entities).toBe(1);
    expect(set.labels.get("box-1")).toBe("상자");
  });

  it("부모 변환을 곱해 자식의 월드 좌표를 구한다 (three 월드 행렬과 일치)", () => {
    const parent = entity("room", "box", { position: [10, 0, 0], rotation: [0, Math.PI / 2, 0], scale: [1, 1, 1] });
    const child = entity("chair", "box", { parentId: "room", position: [1, 0, 0], scale: [0.5, 0.5, 0.5] });
    const set = buildStudioBg3dInferenceSourceSet({ entities: [parent, child] });
    const group = new THREE.Group();
    group.position.set(10, 0, 0);
    group.rotation.set(0, Math.PI / 2, 0);
    const mesh = new THREE.Object3D();
    mesh.position.set(1, 0, 0);
    mesh.scale.set(0.5, 0.5, 0.5);
    group.add(mesh);
    group.updateMatrixWorld(true);
    const expectedCenter = new THREE.Vector3(0, 0, 0).applyMatrix4(mesh.matrixWorld);
    const center = set.points.find((feature) => feature.id === "chair:p8");
    expect(center?.tag).toBe("중심");
    expect(center?.point[0]).toBeCloseTo(expectedCenter.x, 9);
    expect(center?.point[1]).toBeCloseTo(expectedCenter.y, 9);
    expect(center?.point[2]).toBeCloseTo(expectedCenter.z, 9);
  });

  it("숨김·숨은 부모의 자식·비정상 변환은 건너뛰고 건너뛴 수를 집계한다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [
        entity("hidden", "box", { visible: false }),
        entity("under-hidden", "box", { parentId: "hidden" }),
        entity("nan", "box", { position: [Number.NaN, 0, 0] }),
        entity("far", "box", { position: [20_000, 0, 0] }),
        entity("ok", "box"),
      ],
    });
    expect(set.stats.entities).toBe(2);
    expect(set.stats.skippedHidden).toBe(2);
    expect(set.stats.skippedInvalid).toBeGreaterThanOrEqual(1);
    expect(set.labels.has("ok")).toBe(true);
    expect(set.labels.has("hidden")).toBe(false);
    // 한계 밖 좌표(20,000m)의 특징은 색인에 들어가지 않는다.
    expect(set.points.every((feature) => Math.abs(feature.point[0]) <= 10_000)).toBe(true);
  });

  it("부모 순환과 존재하지 않는 부모에서도 무한 루프 없이 처리한다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [
        entity("a", "box", { parentId: "b" }),
        entity("b", "box", { parentId: "a" }),
        entity("orphan", "box", { parentId: "missing", position: [1, 0, 0] }),
      ],
    });
    expect(set.stats.entities).toBe(3);
    expect(set.points.length).toBeGreaterThan(0);
  });

  it("제외 ID(이동 중인 선택)는 후보에서 빠진다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [entity("a", "box"), entity("b", "box", { position: [5, 0, 0] })],
      excludeIds: new Set(["a"]),
    });
    expect(set.labels.has("a")).toBe(false);
    expect(set.points.every((feature) => feature.sourceId === "b")).toBe(true);
  });

  it("revision은 같은 입력에서 같고 객체를 옮기면 달라진다", () => {
    const base = [entity("a", "box"), entity("b", "cylinder", { position: [3, 0, 0] })];
    const first = buildStudioBg3dInferenceSourceSet({ entities: base });
    const again = buildStudioBg3dInferenceSourceSet({ entities: base });
    const moved = buildStudioBg3dInferenceSourceSet({
      entities: [entity("a", "box", { position: [0.5, 0, 0] }), base[1] as StudioBg3dInferenceSceneEntity],
    });
    expect(again.revision).toBe(first.revision);
    expect(moved.revision).not.toBe(first.revision);
  });

  it("모델은 경계 상자에서만 후보를 만들고 근사(approximate)로 표시한다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [
        entity("model-1", "model", {
          position: [0, 1, 0],
          modelBounds: { min: [-1, -1, -0.5], max: [1, 1, 0.5] },
        }),
        entity("model-2", "model", { position: [5, 0, 0] }),
      ],
    });
    const boundsPoints = set.points.filter((feature) => feature.sourceId === "model-1");
    expect(boundsPoints.length).toBe(8 + 1 + 12);
    expect(boundsPoints.every((feature) => feature.approximate)).toBe(true);
    expect(set.volumes).toHaveLength(0);
    const fallback = set.points.filter((feature) => feature.sourceId === "model-2");
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.tag).toBe("모델 원점");
  });

  it("가이드선과 벽선은 끝점·중간점·모서리 후보가 된다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [],
      lines: [
        { id: "guide-1", a: [0, 0, 0], b: [4, 0, 0], label: "가이드 1", role: "guide" },
        { id: "wall-1", a: [0, 0, 0], b: [0, 0, 3], label: "벽선 1", role: "wall" },
      ],
      points: [{ id: "pin-1", point: [1, 1, 1], label: "핀", kind: "center" }],
    });
    expect(set.edges.map((edge) => edge.role).sort()).toEqual(["guide", "wall"]);
    expect(set.points.filter((feature) => feature.kind === "midpoint")).toHaveLength(2);
    expect(set.points.filter((feature) => feature.kind === "endpoint")).toHaveLength(4);
    expect(set.labels.get("wall-1")).toBe("벽선 1");
    expect(set.points.some((feature) => feature.sourceId === "pin-1")).toBe(true);
  });

  it("길이 0 선분은 모서리 후보로 만들지 않는다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [],
      lines: [{ id: "dot", a: [1, 1, 1], b: [1, 1, 1], label: "점", role: "guide" }],
    });
    expect(set.edges).toHaveLength(0);
  });

  it("객체 수 상한을 넘으면 초과분을 건너뛰고 truncated를 알린다", () => {
    const entities: StudioBg3dInferenceSceneEntity[] = [];
    for (let index = 0; index < 4_100; index += 1) {
      entities.push(entity(`e-${index}`, "sphere", { position: [index % 100, 0, Math.floor(index / 100)] }));
    }
    const set = buildStudioBg3dInferenceSourceSet({ entities });
    expect(set.stats.entities).toBe(4_096);
    expect(set.stats.skippedOverBudget).toBe(4);
    expect(set.stats.truncated).toBe(true);
  });

  it("하위 객체 ID 수집은 순환에도 안전하다", () => {
    const ids = collectStudioBg3dInferenceDescendantIds(["root"], [
      { id: "root", parentId: null },
      { id: "child", parentId: "root" },
      { id: "grand", parentId: "child" },
      { id: "loop-a", parentId: "loop-b" },
      { id: "loop-b", parentId: "loop-a" },
      { id: "other", parentId: null },
    ]);
    expect([...ids].sort()).toEqual(["child", "grand", "root"]);
    const loop = collectStudioBg3dInferenceDescendantIds(["loop-a"], [
      { id: "loop-a", parentId: "loop-b" },
      { id: "loop-b", parentId: "loop-a" },
    ]);
    expect([...loop].sort()).toEqual(["loop-a", "loop-b"]);
  });

  it("키보드 점 목록은 가까운 순으로 상한까지만 돌려준다", () => {
    const set = buildStudioBg3dInferenceSourceSet({
      entities: [entity("a", "box"), entity("b", "box", { position: [10, 0, 0] })],
    });
    const near = listStudioBg3dInferencePointsNear(set, [0, 0, 0], 5);
    expect(near).toHaveLength(5);
    expect(near.every((feature) => feature.sourceId === "a")).toBe(true);
    expect(listStudioBg3dInferencePointsNear(set, [0, 0, 0], 0)).toHaveLength(0);
    expect(listStudioBg3dInferencePointsNear(set, [0, 0, 0], 100_000).length).toBeLessThanOrEqual(512);
    const endpointsOnly = listStudioBg3dInferencePointsNear(set, [0, 0, 0], 100, (feature) => feature.kind === "endpoint");
    expect(endpointsOnly.every((feature) => feature.kind === "endpoint")).toBe(true);
  });
});
