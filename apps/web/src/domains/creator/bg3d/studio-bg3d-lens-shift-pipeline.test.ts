/**
 * 렌즈 시프트(문서 camera.lensShift)가 저장 → 컷 저장·복원 → 뷰포트(Three) → 캡처 프레임 크롭 →
 * Babylon 투영 → 소실점 가이드까지 "같은 값, 같은 부호"로 쓰이는지 한곳에서 고정한다.
 *
 * 한 축 값 s 는 프레임 한 변 길이의 비율이고, 화면(NDC)에서 장면 전체를 (−2·sx, +2·sy) 만큼 옮긴다.
 * 즉 가로 +는 장면이 왼쪽으로, 세로 +는 위쪽으로 간다(슬라이더 안내 문구가 말하는 방향).
 * 이 법칙을 독립된 세 구현이 따라야 한다: Three view offset, Babylon 투영 행렬, 소실점 유도식.
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Vector3 as BabylonVector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { createStudioBg3dBabylonCaptureCamera } from "./studio-bg3d-babylon-camera-projection";
import { applyStudioBg3dViewToThreeCamera } from "./studio-bg3d-camera-application";
import { resolveStudioBg3dCaptureFrame } from "./studio-bg3d-capture-frame-geometry";
import { applyStudioBg3dCaptureFrameViewOffset } from "./studio-bg3d-capture-frame-view-offset";
import { STUDIO_BG3D_LENS_SHIFT_LIMIT } from "./studio-bg3d-lens";
import { deriveStudioBg3dVanishingPoints } from "./studio-bg3d-perspective-bridge";
import {
  DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
  applyStudioBg3dShot,
  captureStudioBg3dShot,
  normalizeStudioBg3dSceneDocument,
  parseStudioBg3dSceneDocument,
  serializeStudioBg3dSceneDocument,
} from "./studio-bg3d-scene-document";

import type { StudioBg3dCameraSettings, StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

type Shift = readonly [number, number];

/** 가로만, 세로만, 둘 다, 큰 값, 한도 끝 값. */
const SHIFTS: readonly Shift[] = [
  [0.25, 0],
  [0, -0.35],
  [0.31, -0.18],
  [-1.2, 0.9],
  [STUDIO_BG3D_LENS_SHIFT_LIMIT, -STUDIO_BG3D_LENS_SHIFT_LIMIT],
];

const WORLD_POINTS: readonly (readonly [number, number, number])[] = [
  [0, 0.6, 0],
  [1.5, 0.2, -1],
  [-2, 1.8, 0.5],
  [3, 0, -4],
];

const VIEWPORT = Object.freeze({ width: 1_200, height: 800 });

function cameraWithShift(lensShift: Shift | undefined): StudioBg3dCameraSettings {
  return {
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.camera,
    position: [4, 3, 6],
    target: [0, 0.6, 0],
    fovDegrees: 50,
    projection: "perspective",
    zoom: 1,
    ...(lensShift ? { lensShift } : {}),
  };
}

function documentWithShift(lensShift: Shift): StudioBg3dSceneDocument {
  return normalizeStudioBg3dSceneDocument({
    ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    camera: cameraWithShift(lensShift),
  });
}

function threeCamera(
  view: StudioBg3dCameraSettings,
  aspect = VIEWPORT.width / VIEWPORT.height,
): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(view.fovDegrees, aspect);
  expect(applyStudioBg3dViewToThreeCamera(camera, null, view)).toBe(true);
  return camera;
}

function ndc(camera: THREE.Camera, point: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(...point).project(camera);
}

describe("lens shift pipeline — saved document", () => {
  it.each(SHIFTS)("round-trips %s through the strict persisted document unchanged", (...shift) => {
    const document = documentWithShift(shift);
    expect(document.camera.lensShift).toEqual(shift);
    const serialized = serializeStudioBg3dSceneDocument(document);
    expect(serialized).not.toBeNull();
    // 엄격 파서는 값이 한 번이라도 눌리면 거부하므로, 성공 자체가 "그대로 저장됐다"는 증거다.
    expect(parseStudioBg3dSceneDocument(serialized!)?.camera.lensShift).toEqual(shift);
  });

  it("clamps both axes to the same limit the slider and two-point correction use", () => {
    const clamped = documentWithShift([9, -9]);
    expect(clamped.camera.lensShift).toEqual([
      STUDIO_BG3D_LENS_SHIFT_LIMIT,
      -STUDIO_BG3D_LENS_SHIFT_LIMIT,
    ]);
  });

  it("stores the shift in a saved shot and restores both axes when the shot is applied", () => {
    const withShift = documentWithShift([0.25, -0.35]);
    const captured = captureStudioBg3dShot(withShift, { id: "cut-lens", name: "시프트 컷" });
    expect(captured).not.toBeNull();
    expect(captured!.shots?.[0]?.camera?.lensShift).toEqual([0.25, -0.35]);

    // 편집 중에 시프트가 지워져도 컷을 적용하면 컷에 기록된 두 값이 그대로 돌아온다.
    const edited = normalizeStudioBg3dSceneDocument({
      ...captured!,
      camera: { ...captured!.camera, lensShift: [0, 0] },
    });
    expect(edited.camera.lensShift).toEqual([0, 0]);
    const restored = applyStudioBg3dShot(edited, "cut-lens");
    expect(restored?.camera.lensShift).toEqual([0.25, -0.35]);
  });
});

describe("lens shift pipeline — Three viewport", () => {
  it.each(SHIFTS)("moves every projected point by (−2·sx, +2·sy) NDC for %s", (...shift) => {
    const neutral = threeCamera(cameraWithShift(undefined));
    const shifted = threeCamera(cameraWithShift(shift));
    for (const point of WORLD_POINTS) {
      const before = ndc(neutral, point);
      const after = ndc(shifted, point);
      expect(after.x - before.x).toBeCloseTo(-2 * shift[0], 9);
      expect(after.y - before.y).toBeCloseTo(2 * shift[1], 9);
    }
  });

  it("reads the same shift back from the live camera view the way the viewport controller does", () => {
    for (const shift of SHIFTS) {
      const camera = threeCamera(cameraWithShift(shift));
      const view = camera.view;
      expect(view?.enabled).toBe(true);
      // BgViewportController.readView 의 식과 같다: offset / full.
      expect(view!.offsetX / view!.fullWidth).toBeCloseTo(shift[0], 12);
      expect(view!.offsetY / view!.fullHeight).toBeCloseTo(shift[1], 12);
    }
  });

  it("describes the sign in the same words as the slider help text", () => {
    const neutral = threeCamera(cameraWithShift(undefined));
    const right = ndc(threeCamera(cameraWithShift([0.2, 0])), [0, 0.6, 0]);
    const up = ndc(threeCamera(cameraWithShift([0, 0.2])), [0, 0.6, 0]);
    const origin = ndc(neutral, [0, 0.6, 0]);
    expect(origin.x).toBeCloseTo(0, 9); // 타깃은 화면 중앙
    expect(right.x).toBeLessThan(origin.x); // 가로 + → 장면이 왼쪽으로
    expect(up.y).toBeGreaterThan(origin.y); // 세로 + → 장면이 위쪽으로
  });
});

describe("lens shift pipeline — capture frame crop (insert, capture, shot batch)", () => {
  it.each([
    ["pillarbox 1:1", 1],
    ["letterbox 21:9", 21 / 9],
    ["portrait 4:5", 4 / 5],
  ] as const)("keeps the shift under a %s crop and restores it exactly afterwards", (_label, ratio) => {
    const frame = resolveStudioBg3dCaptureFrame({
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      aspectRatio: ratio,
    })!;
    expect(frame.fit).not.toBe("exact");
    // 프레임의 뷰포트 NDC 사각형: 중심과 반폭.
    const centerX = ((frame.x + frame.width / 2) / VIEWPORT.width) * 2 - 1;
    const centerY = 1 - ((frame.y + frame.height / 2) / VIEWPORT.height) * 2;
    const halfWidth = frame.width / VIEWPORT.width;
    const halfHeight = frame.height / VIEWPORT.height;

    for (const shift of SHIFTS) {
      const camera = threeCamera(cameraWithShift(shift));
      const shiftedBefore = WORLD_POINTS.map((point) => ndc(camera, point));
      const release = applyStudioBg3dCaptureFrameViewOffset(camera, frame, VIEWPORT);
      expect(release).toBeTypeOf("function");
      WORLD_POINTS.forEach((point, index) => {
        const cropped = ndc(camera, point);
        // 크롭은 "시프트된 화면"을 다시 자른다: 같은 시프트가 먼저 적용된 채로 합성된다.
        expect(cropped.x).toBeCloseTo((shiftedBefore[index]!.x - centerX) / halfWidth, 8);
        expect(cropped.y).toBeCloseTo((shiftedBefore[index]!.y - centerY) / halfHeight, 8);
      });
      release!();
      WORLD_POINTS.forEach((point, index) => {
        const restored = ndc(camera, point);
        expect(restored.x).toBeCloseTo(shiftedBefore[index]!.x, 9);
        expect(restored.y).toBeCloseTo(shiftedBefore[index]!.y, 9);
      });
    }
  });
});

function withBabylonScene(run: (scene: Scene) => void): void {
  const engine = new NullEngine({
    renderWidth: 64,
    renderHeight: 64,
    textureSize: 64,
    deterministicLockstep: false,
    lockstepMaxSteps: 4,
  });
  Object.defineProperty(engine, "isNDCHalfZRange", { value: false });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  try {
    run(scene);
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

describe("lens shift pipeline — Babylon capture projection", () => {
  it.each(SHIFTS)("moves every projected point by (−2·sx, +2·sy) NDC for %s", (...shift) => {
    withBabylonScene((scene) => {
      const project = (view: StudioBg3dCameraSettings) => {
        const camera = createStudioBg3dBabylonCaptureCamera(view, VIEWPORT.width, VIEWPORT.height, scene);
        const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
        return WORLD_POINTS.map((point) =>
          BabylonVector3.TransformCoordinates(new BabylonVector3(...point), viewProjection),
        );
      };
      const neutral = project(cameraWithShift(undefined));
      const shifted = project(cameraWithShift(shift));
      WORLD_POINTS.forEach((_point, index) => {
        expect(shifted[index]!.x - neutral[index]!.x).toBeCloseTo(-2 * shift[0], 4);
        expect(shifted[index]!.y - neutral[index]!.y).toBeCloseTo(2 * shift[1], 4);
      });
    });
  });

  it("agrees with the Three viewport for the same document camera", () => {
    withBabylonScene((scene) => {
      for (const shift of SHIFTS) {
        const view = cameraWithShift(shift);
        const camera = createStudioBg3dBabylonCaptureCamera(view, VIEWPORT.width, VIEWPORT.height, scene);
        const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
        const three = threeCamera(view);
        for (const point of WORLD_POINTS) {
          const expected = ndc(three, point);
          const actual = BabylonVector3.TransformCoordinates(new BabylonVector3(...point), viewProjection);
          expect(actual.x).toBeCloseTo(expected.x, 4);
          expect(actual.y).toBeCloseTo(expected.y, 4);
        }
      }
    });
  });
});

// 알려진 한계(docs/features/studio-bg3d-webtoon-backgrounds.md 8절): Babylon 캡처 투영은 뷰포트 안전 프레임 크롭을
// 모른다. 출력 크기에 맞춰 세로 fov 로 투영 행렬을 만들고 시프트를 "출력 프레임 한 변의 비율"로 읽으므로,
// 뷰포트 비율과 출력 비율이 같을 때(캡처 프레임이 뷰포트 전체)만 Three 삽입 결과와 일치한다. 4:5·21:9 프리셋이 이 차이를
// 더 자주 드러낸다. 아래 시험은 일치하는 경우를 고정하고, 어긋나는 경우의 크기를 적어 두어 나중에 고치면 문서를 함께 고치게 한다.
describe("lens shift pipeline — Babylon vs a cropped Three capture frame (known limit)", () => {
  function babylonMinusThree(ratio: number, shift: Shift) {
    const frame = resolveStudioBg3dCaptureFrame({
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      aspectRatio: ratio,
    })!;
    const view = cameraWithShift(shift);
    const three = threeCamera(view);
    expect(applyStudioBg3dCaptureFrameViewOffset(three, frame, VIEWPORT)).toBeTypeOf("function");
    const differences: Array<readonly [number, number]> = [];
    withBabylonScene((scene) => {
      const camera = createStudioBg3dBabylonCaptureCamera(view, Math.round(frame.width), Math.round(frame.height), scene);
      const viewProjection = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
      for (const point of WORLD_POINTS) {
        const expected = ndc(three, point);
        const actual = BabylonVector3.TransformCoordinates(new BabylonVector3(...point), viewProjection);
        differences.push([actual.x - expected.x, actual.y - expected.y]);
      }
    });
    return { frame, differences };
  }

  it("agrees when the capture frame is the whole viewport (same ratio), with or without a shift", () => {
    for (const shift of [[0, 0], [0.31, -0.18]] as const) {
      const { frame, differences } = babylonMinusThree(VIEWPORT.width / VIEWPORT.height, shift);
      expect(frame.fit).toBe("exact");
      for (const [dx, dy] of differences) {
        expect(dx).toBeCloseTo(0, 4);
        expect(dy).toBeCloseTo(0, 4);
      }
    }
  });

  it("limit: a 4:5 pillarbox crop keeps the vertical axis but the horizontal shift is read against the narrower output", () => {
    const shift: Shift = [0.2, 0.2];
    const { frame, differences } = babylonMinusThree(4 / 5, shift);
    expect(frame.fit).not.toBe("exact");
    const halfWidth = frame.width / VIEWPORT.width;
    // Three 는 뷰포트 기준 시프트를 크롭으로 다시 자르므로 출력 NDC 이동이 1/halfWidth 배가 된다. Babylon 은 그대로다.
    const expectedGap = 2 * shift[0] * (1 / halfWidth - 1);
    expect(expectedGap).toBeGreaterThan(0.3);
    for (const [dx, dy] of differences) {
      expect(dx).toBeCloseTo(expectedGap, 2);
      expect(dy).toBeCloseTo(0, 4);
    }
    // 시프트가 0 이면 이 비율에서는 어긋나지 않는다.
    for (const [dx, dy] of babylonMinusThree(4 / 5, [0, 0]).differences) {
      expect(dx).toBeCloseTo(0, 4);
      expect(dy).toBeCloseTo(0, 4);
    }
  });

  it("limit: a 21:9 letterbox crop differs even with no shift (Babylon fixes the vertical fov on the shorter output)", () => {
    const { frame, differences } = babylonMinusThree(21 / 9, [0, 0]);
    expect(frame.fit).not.toBe("exact");
    expect(Math.max(...differences.map(([dx, dy]) => Math.hypot(dx, dy)))).toBeGreaterThan(0.1);
  });
});

describe("lens shift pipeline — vanishing point guides", () => {
  const LOOKING_DOWN = {
    ...cameraWithShift(undefined),
    position: [5, 6, 7] as const,
    target: [0, 0.5, 0] as const,
  };

  it.each(SHIFTS)("places guides where the rendered far points converge for %s", (...shift) => {
    const view: StudioBg3dCameraSettings = { ...LOOKING_DOWN, lensShift: shift };
    const guides = deriveStudioBg3dVanishingPoints(view, VIEWPORT.width, VIEWPORT.height);
    expect(guides.map((guide) => guide.axis)).toEqual(["world-x", "world-y", "world-z"]);
    const camera = threeCamera(view);
    const forward = new THREE.Vector3(...view.target).sub(new THREE.Vector3(...view.position)).normalize();
    for (const guide of guides) {
      const axis = guide.axis === "world-x"
        ? new THREE.Vector3(1, 0, 0)
        : guide.axis === "world-y"
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
      // 소실점은 카메라 앞쪽으로 향하는 방향의 무한원점이다.
      if (axis.dot(forward) < 0) axis.negate();
      const far = new THREE.Vector3(...view.position).addScaledVector(axis, 1e8);
      const projected = far.project(camera);
      expect(guide.x).toBeCloseTo((projected.x * 0.5 + 0.5) * VIEWPORT.width, 2);
      expect(guide.y).toBeCloseTo((-projected.y * 0.5 + 0.5) * VIEWPORT.height, 2);
    }
  });

  it("moves the guides by the same pixels the shift moves the picture", () => {
    const neutral = deriveStudioBg3dVanishingPoints(LOOKING_DOWN, VIEWPORT.width, VIEWPORT.height);
    const shift: Shift = [0.2, -0.1];
    const shifted = deriveStudioBg3dVanishingPoints(
      { ...LOOKING_DOWN, lensShift: shift },
      VIEWPORT.width,
      VIEWPORT.height,
    );
    expect(shifted.map((guide) => guide.axis)).toEqual(neutral.map((guide) => guide.axis));
    shifted.forEach((guide, index) => {
      // NDC 의 (−2sx, +2sy) 는 픽셀로 (−sx·W, −sy·H) 이다(세로는 화면 아래가 +).
      expect(guide.x - neutral[index]!.x).toBeCloseTo(-shift[0] * VIEWPORT.width, 6);
      expect(guide.y - neutral[index]!.y).toBeCloseTo(-shift[1] * VIEWPORT.height, 6);
    });
  });
});
