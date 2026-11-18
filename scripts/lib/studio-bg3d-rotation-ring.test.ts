// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { Group, PerspectiveCamera, Scene } from "three";
import { TransformControls } from "three-stdlib";
import { describe, expect, it } from "vitest";

import { resolveStudioBg3dRotationRing, type StudioBg3dRingMask } from "./studio-bg3d-rotation-ring";

const require = createRequire(import.meta.url);
// 기존 실패 실행의 원본 PNG에서 색 조건으로 읽은 전체 445개 픽셀이다. 그림을 재생성하지 않는다.
const observed: StudioBg3dRingMask & { sourcePngSha256: string } = JSON.parse(readFileSync(
  require.resolve("../fixtures/studio-bg3d-y-ring-698x743.json"), "utf8",
));

function pickAndDrag(steps: number, legacy = false) {
  const canvas = document.createElement("canvas");
  const camera = new PerspectiveCamera(50, observed.width / observed.height, 0.1, 100);
  camera.position.set(4, 3, 6);
  camera.lookAt(0, 0.6, 0);
  camera.updateMatrixWorld();
  const scene = new Scene(), object = new Group();
  object.position.set(0, 0.5, 0);
  scene.add(object);
  const controls = new TransformControls(camera, canvas);
  controls.attach(object);
  controls.setMode("rotate");
  controls.setSpace("local");
  scene.add(controls);
  scene.updateMatrixWorld(true);
  const pointer = controls as unknown as {
    axis: string | null;
    pointerHover: (point: { x: number; y: number; button: number }) => void;
    pointerDown: (point: { x: number; y: number; button: number }) => void;
    pointerMove: (point: { x: number; y: number; button: number }) => void;
  };
  const ring = resolveStudioBg3dRotationRing(observed);
  const ndc = ({ x, y }: { x: number; y: number }) => ({
    x: (x + 0.5) / observed.width * 2 - 1,
    y: 1 - (y + 0.5) / observed.height * 2,
  });
  const start = legacy ? { x: 0.618 * 2 - 1, y: 1 - 0.507 * 2 } : ndc(ring.start);
  const end = legacy ? { x: 0.499 * 2 - 1, y: 1 - 0.555 * 2 } : ndc(ring.end);
  try {
    pointer.pointerHover({ ...start, button: 0 });
    const axis = pointer.axis;
    pointer.pointerDown({ ...start, button: 0 });
    for (let step = 1; step <= steps; step += 1) {
      pointer.pointerMove({
        x: start.x + (end.x - start.x) * step / steps,
        y: start.y + (end.y - start.y) * step / steps,
        button: -1,
      });
    }
    return { axis, quaternion: object.quaternion.toArray(), yDegrees: object.rotation.y * 180 / Math.PI };
  } finally { controls.dispose(); }
}

describe("렌더된 BG3D Y 회전 링의 실제 입력 좌표", () => {
  it("원본 실패 PNG의 녹색 앞쪽 호에서 시작/끝을 고른다", () => {
    expect(observed.sourcePngSha256).toBe("2c980833fdb1a3454fe9ba06caef99f08bfbb36a486735cbafe41b83a5920c57");
    expect(resolveStudioBg3dRotationRing(observed)).toMatchObject({
      axis: "Y", pixelCount: 445, start: { x: 420, y: 409 }, end: { x: 349, y: 418 },
    });
  });

  it("배포된 Three picker에서 구형 좌표는 Z, 관측 좌표는 Y를 실제 hit한다", () => {
    expect(pickAndDrag(1, true).axis).toBe("Z");
    const result = pickAndDrag(1);
    expect(result.axis).toBe("Y");
    expect(Math.abs(result.yDegrees)).toBeGreaterThan(10);
  });

  it("동일 시작/끝의 24단계와 1단계는 같은 Y 최종 자세를 만든다", () => {
    const continuous = pickAndDrag(24), direct = pickAndDrag(1);
    expect(continuous.axis).toBe("Y");
    expect(continuous.quaternion).toEqual(direct.quaternion);
    expect(continuous.yDegrees).toBe(direct.yDegrees);
    expect(Math.abs(continuous.yDegrees)).toBeGreaterThan(10);
  });

  it("빈 화면이나 작은 녹색 점을 회전 링으로 인정하지 않는다", () => {
    expect(() => resolveStudioBg3dRotationRing({ ...observed, pixels: [] })).toThrow(/픽셀/);
    expect(() => resolveStudioBg3dRotationRing({ ...observed, pixels: observed.pixels.slice(0, 20) })).toThrow(/픽셀/);
  });

  it("프레임 밖 좌표와 비정상 표면 크기를 거부한다", () => {
    expect(() => resolveStudioBg3dRotationRing({ ...observed, width: 0 })).toThrow(/픽셀/);
    expect(() => resolveStudioBg3dRotationRing({ ...observed, pixels: [...observed.pixels, { x: -1, y: 400 }] })).toThrow(/픽셀/);
  });

  it("관측된 입력 열이 빠지면 추측 좌표나 고정 비율로 대체하지 않는다", () => {
    expect(() => resolveStudioBg3dRotationRing({
      ...observed, pixels: observed.pixels.filter(({ x }) => x !== 420),
    })).toThrow(/실제 픽셀/);
  });

  it("위아래로 긴 다른 녹색 물체는 Y 링 기하로 인정하지 않는다", () => {
    expect(() => resolveStudioBg3dRotationRing({
      ...observed, pixels: observed.pixels.map(({ x, y }) => ({ x, y: 300 + (y - 381) * 5 })),
    })).toThrow(/기하/);
  });
});
