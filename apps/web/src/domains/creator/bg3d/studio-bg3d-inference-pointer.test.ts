import { readFileSync } from "node:fs";

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { resolveStudioBg3dInference } from "./studio-bg3d-inference-engine";
import { createStudioBg3dInferenceIndex } from "./studio-bg3d-inference-index";
import {
  STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY,
  buildStudioBg3dInferenceRayCursor,
  createStudioBg3dInferenceRayScratch,
  readStudioBg3dInferenceNdc,
  resolveStudioBg3dInferenceProjection,
} from "./studio-bg3d-inference-pointer";
import { buildStudioBg3dInferenceSourceSet } from "./studio-bg3d-inference-sources";

const RECT = { left: 0, top: 0, width: 800, height: 800 } as const;

function makeCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(0, 2, 10);
  camera.lookAt(0, 2, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}

function entityGroup(id: string, position: [number, number, number], size = 1): THREE.Group {
  const group = new THREE.Group();
  group.position.set(...position);
  group.userData = { studioBg3dEntityId: id, studioBg3dEntityKind: "primitive" };
  group.add(new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial()));
  group.updateMatrixWorld(true);
  return group;
}

describe("studio-bg3d-inference-pointer 투영·좌표", () => {
  it("뷰포트 좌표를 NDC로 바꾸고 밖이거나 비정상이면 null이다", () => {
    const target = new THREE.Vector2();
    expect(readStudioBg3dInferenceNdc(RECT, 400, 400, target)?.toArray()).toEqual([0, 0]);
    expect(readStudioBg3dInferenceNdc(RECT, 0, 0, target)?.toArray()).toEqual([-1, 1]);
    expect(readStudioBg3dInferenceNdc(RECT, 800, 800, target)?.toArray()).toEqual([1, -1]);
    expect(readStudioBg3dInferenceNdc(RECT, -1, 400, target)).toBeNull();
    expect(readStudioBg3dInferenceNdc(RECT, 400, 801, target)).toBeNull();
    expect(readStudioBg3dInferenceNdc(RECT, Number.NaN, 400, target)).toBeNull();
    expect(readStudioBg3dInferenceNdc({ ...RECT, width: 0 }, 0, 0, target)).toBeNull();
  });

  it("원근 투영은 시야각·줌·뷰포트 높이에서 px당 크기를 구한다", () => {
    const camera = makeCamera();
    const base = resolveStudioBg3dInferenceProjection(camera, 800);
    expect(base?.type).toBe("perspective");
    if (base?.type === "perspective") {
      expect(base.radiansPerPixel).toBeCloseTo((2 * Math.tan((25 * Math.PI) / 180)) / 800, 12);
    }
    camera.zoom = 2;
    const zoomed = resolveStudioBg3dInferenceProjection(camera, 800);
    if (base?.type === "perspective" && zoomed?.type === "perspective") {
      expect(zoomed.radiansPerPixel).toBeCloseTo(base.radiansPerPixel / 2, 12);
    }
    expect(resolveStudioBg3dInferenceProjection(camera, 0)).toBeNull();
    expect(resolveStudioBg3dInferenceProjection(camera, Number.NaN)).toBeNull();
  });

  it("직교 투영은 깊이와 무관한 px당 월드 길이를 돌려준다", () => {
    const camera = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
    expect(resolveStudioBg3dInferenceProjection(camera, 400)).toEqual({ type: "orthographic", worldPerPixel: 10 / 400 });
    camera.zoom = 2;
    expect(resolveStudioBg3dInferenceProjection(camera, 400)).toEqual({ type: "orthographic", worldPerPixel: 5 / 400 });
    expect(resolveStudioBg3dInferenceProjection(new THREE.Object3D() as unknown as THREE.Camera, 400)).toBeNull();
  });
});

describe("studio-bg3d-inference-pointer 레이 커서", () => {
  it("화면 중앙 포인터는 카메라 앞 객체의 정면 표면 교점·법선·출처를 돌려준다", () => {
    const roots = new Map([["A", entityGroup("A", [0, 2, 0])]]);
    const built = buildStudioBg3dInferenceRayCursor({
      camera: makeCamera(),
      rect: RECT,
      clientX: 400,
      clientY: 400,
      roots,
      groundY: 0,
      sourceLabel: (id) => (id === "A" ? "상자 A" : null),
    });
    expect(built?.hitSourceId).toBe("A");
    const cursor = built?.cursor;
    expect(cursor?.kind).toBe("ray");
    if (cursor?.kind !== "ray") return;
    expect(cursor.origin[2]).toBeCloseTo(10, 9);
    expect(cursor.direction[2]).toBeCloseTo(-1, 9);
    expect(cursor.groundY).toBe(0);
    expect(cursor.surfaceHit?.point[2]).toBeCloseTo(0.5, 9);
    expect(cursor.surfaceHit?.normal?.[2]).toBeCloseTo(1, 9);
    expect(cursor.surfaceHit?.label).toBe("상자 A");
  });

  it("숨겨진 객체와 레이캐스트 무시 표식이 있는 객체는 건너뛰고 뒤의 객체를 맞춘다", () => {
    const hidden = entityGroup("hidden", [0, 2, 3]);
    hidden.visible = false;
    const ignored = entityGroup("ignored", [0, 2, 2]);
    ignored.userData = { ...ignored.userData, [STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY]: true };
    const target = entityGroup("target", [0, 2, 0]);
    const roots = new Map([["hidden", hidden], ["ignored", ignored], ["target", target]]);
    const built = buildStudioBg3dInferenceRayCursor({
      camera: makeCamera(),
      rect: RECT,
      clientX: 400,
      clientY: 400,
      roots,
      groundY: null,
    });
    expect(built?.hitSourceId).toBe("target");
    const cursor = built?.cursor;
    expect(cursor?.kind === "ray" && cursor.groundY === undefined).toBe(true);
  });

  it("빈 곳을 가리키면 표면 교점 없이 레이만 돌려준다", () => {
    const roots = new Map([["A", entityGroup("A", [0, 2, 0])]]);
    const built = buildStudioBg3dInferenceRayCursor({
      camera: makeCamera(),
      rect: RECT,
      clientX: 40,
      clientY: 40,
      roots,
      groundY: null,
    });
    expect(built?.hitSourceId).toBeNull();
    expect(built?.cursor.kind === "ray" && built.cursor.surfaceHit === undefined).toBe(true);
  });

  it("뷰포트 밖 좌표·비정상 카메라는 null이다", () => {
    const common = { rect: RECT, roots: null, groundY: null } as const;
    expect(buildStudioBg3dInferenceRayCursor({ ...common, camera: makeCamera(), clientX: -10, clientY: 10 })).toBeNull();
    const broken = makeCamera();
    broken.projectionMatrix.elements[0] = Number.NaN;
    expect(buildStudioBg3dInferenceRayCursor({ ...common, camera: broken, clientX: 10, clientY: 10 })).toBeNull();
  });

  it("스크래치를 재사용해도 호출 사이에 상태가 새지 않는다", () => {
    const scratch = createStudioBg3dInferenceRayScratch();
    const roots = new Map([["A", entityGroup("A", [0, 2, 0])]]);
    const first = buildStudioBg3dInferenceRayCursor({ camera: makeCamera(), rect: RECT, clientX: 400, clientY: 400, roots, groundY: null, scratch });
    const miss = buildStudioBg3dInferenceRayCursor({ camera: makeCamera(), rect: RECT, clientX: 40, clientY: 40, roots, groundY: null, scratch });
    expect(first?.hitSourceId).toBe("A");
    expect(miss?.hitSourceId).toBeNull();
    expect(scratch.roots).toHaveLength(0);
    expect(scratch.hits).toHaveLength(0);
  });

  it("만든 커서를 엔진에 그대로 넘기면 모서리 가까이에서 끝점을 잡는다 (통합)", () => {
    const entities = [{ id: "A", kind: "box" as const, position: [0, 2, 0] as const, rotation: [0, 0, 0] as const, scale: [1, 1, 1] as const }];
    const index = createStudioBg3dInferenceIndex(buildStudioBg3dInferenceSourceSet({ entities }));
    const camera = makeCamera();
    // 상자 앞 오른쪽 위 모서리 (0.5, 2.5, 0.5)의 화면 좌표를 구해 3px 옆을 가리킨다.
    const corner = new THREE.Vector3(0.5, 2.5, 0.5).project(camera);
    const clientX = ((corner.x + 1) / 2) * RECT.width + 3;
    const clientY = ((1 - corner.y) / 2) * RECT.height;
    const roots = new Map([["A", entityGroup("A", [0, 2, 0])]]);
    const built = buildStudioBg3dInferenceRayCursor({
      camera,
      rect: RECT,
      clientX,
      clientY,
      roots,
      groundY: null,
      sourceLabel: () => "상자 A",
    });
    expect(built).not.toBeNull();
    if (!built) return;
    const outcome = resolveStudioBg3dInference({ index, cursor: built.cursor });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.result.kind).toBe("endpoint");
    expect(outcome.result.point[0]).toBeCloseTo(0.5, 6);
    expect(outcome.result.point[1]).toBeCloseTo(2.5, 6);
    expect(outcome.result.point[2]).toBeCloseTo(0.5, 6);
    expect(outcome.result.distancePx).toBeLessThan(5);
  });

  it("무시 표식 키가 배치 포인터 컨트롤러의 상수와 같다 (표식 드리프트 방지)", () => {
    const source = readFileSync(new URL("./StudioBg3dPlacementPointerController.tsx", import.meta.url), "utf8");
    expect(source).toContain(`"${STUDIO_BG3D_INFERENCE_RAYCAST_IGNORE_KEY}"`);
  });
});
