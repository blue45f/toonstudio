/**
 * 3D 데생 인형 캡처 결과 계약 테스트 — resolveStudioMannequinCaptureResult 는 순수 함수라
 * WebGL 없이 검증한다. display 쌍은 "둘 다 유한 양수이면서 래스터 이하"일 때만 포함된다
 * (업스케일 삽입 금지 — VRM 3D 삽입 컨트롤러의 resolveVrmInsertDisplaySize 와 같은 규칙).
 */
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  createStudioMannequinLightingObject,
  mountStudioMannequinLightingGroup,
  readStudioMannequinLightingSnapshot,
  replaceStudioMannequinLightingGroup,
  resolveStudioMannequinCameraFrame,
  resolveStudioMannequinCaptureResult,
  resolveStudioMannequinEnvironmentIntensity,
  resolveStudioMannequinPointerRotation,
  snapshotStudioMannequinLightingPlan,
  STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT,
  STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_MAX,
  type StudioMannequinCameraPreset,
} from "./studio-mannequin-scene";
import {
  addStudioMannequinLight,
  applyStudioMannequinTimeOfDay,
  createStudioMannequinLightingRig,
  resolveStudioMannequinLightingPlan,
  setStudioMannequinShadows,
  STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN,
  type StudioMannequinTimeOfDay,
} from "./studio-mannequin-lighting";
import { getStudioMannequinJointLimit } from "./studio-mannequin-model";

const PNG = "data:image/png;base64,AAAA";

describe("resolveStudioMannequinCaptureResult", () => {
  it("래스터가 논리 뷰보다 크면(슈퍼샘플 캡처) display 쌍을 포함한다", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 1280,
      height: 960,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result).toEqual({
      pngDataUrl: PNG,
      width: 1280,
      height: 960,
      displayWidth: 640,
      displayHeight: 480,
    });
  });

  it("래스터와 논리 뷰가 같으면(1x·dpr1) display 쌍을 그대로 포함한다", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 640,
      height: 480,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result.displayWidth).toBe(640);
    expect(result.displayHeight).toBe(480);
  });

  it("픽셀 예산 등으로 래스터가 뷰보다 작아지면 display 쌍을 생략한다(업스케일 금지)", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 500,
      height: 400,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result).toEqual({ pngDataUrl: PNG, width: 500, height: 400 });
    expect("displayWidth" in result).toBe(false);
    expect("displayHeight" in result).toBe(false);
  });

  it("한 축만 래스터를 넘어도 쌍 전체를 생략한다(비율 왜곡 방지)", () => {
    const result = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 1280,
      height: 400,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect(result.displayWidth).toBeUndefined();
    expect(result.displayHeight).toBeUndefined();
  });

  it("적대적 display 값(NaN/음수/0/Infinity)은 생략으로 fail-closed 한다", () => {
    for (const [displayWidth, displayHeight] of [
      [Number.NaN, 480],
      [640, Number.NaN],
      [-1, 480],
      [0, 480],
      [Number.POSITIVE_INFINITY, 480],
    ] as const) {
      const result = resolveStudioMannequinCaptureResult({
        pngDataUrl: PNG,
        width: 1280,
        height: 960,
        displayWidth,
        displayHeight,
      });
      expect(result.displayWidth, `w=${displayWidth} h=${displayHeight}`).toBeUndefined();
      expect(result.displayHeight, `w=${displayWidth} h=${displayHeight}`).toBeUndefined();
    }
  });
});

describe("resolveStudioMannequinEnvironmentIntensity", () => {
  it("기본값은 IBL이 켜져 있되 과노출되지 않는 범위(0 초과 1 이하)다", () => {
    expect(STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT).toBeGreaterThan(0);
    expect(STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT).toBeLessThanOrEqual(1);
  });

  it("미지정·비유한 값은 기본값으로 fail-closed 한다", () => {
    expect(resolveStudioMannequinEnvironmentIntensity(undefined)).toBe(
      STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT,
    );
    for (const broken of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(resolveStudioMannequinEnvironmentIntensity(broken)).toBe(
        STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_DEFAULT,
      );
    }
  });

  it("범위 안의 값은 그대로 통과시키고 0(IBL 끔)을 허용한다", () => {
    expect(resolveStudioMannequinEnvironmentIntensity(0)).toBe(0);
    expect(resolveStudioMannequinEnvironmentIntensity(0.85)).toBe(0.85);
    expect(resolveStudioMannequinEnvironmentIntensity(STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_MAX)).toBe(
      STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_MAX,
    );
  });

  it("범위를 벗어난 값은 0~MAX로 클램프한다", () => {
    expect(resolveStudioMannequinEnvironmentIntensity(-0.5)).toBe(0);
    expect(resolveStudioMannequinEnvironmentIntensity(99)).toBe(
      STUDIO_MANNEQUIN_ENVIRONMENT_INTENSITY_MAX,
    );
  });
});

describe("resolveStudioMannequinCameraFrame", () => {
  it.each([1.2, 1.65, 2])("%sm 체형의 정수리와 발을 주요 카메라 프레임 안에 둔다", (heightM) => {
    for (const preset of ["home", "front", "side", "back", "high", "low"] as const satisfies readonly StudioMannequinCameraPreset[]) {
      const frame = resolveStudioMannequinCameraFrame(heightM, preset);
      const camera = new THREE.PerspectiveCamera(35, 4 / 3, 0.05, 60);
      camera.position.fromArray(frame.position);
      camera.lookAt(new THREE.Vector3().fromArray(frame.target));
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      const crown = new THREE.Vector3(0, heightM, 0).project(camera);
      const feet = new THREE.Vector3(0, 0, 0).project(camera);
      expect(Math.abs(crown.x), `${heightM}m ${preset} crown x`).toBeLessThanOrEqual(0.95);
      expect(Math.abs(crown.y), `${heightM}m ${preset} crown y`).toBeLessThanOrEqual(0.95);
      expect(Math.abs(feet.x), `${heightM}m ${preset} feet x`).toBeLessThanOrEqual(0.95);
      expect(Math.abs(feet.y), `${heightM}m ${preset} feet y`).toBeLessThanOrEqual(0.95);
    }
  });

  it("신장이 바뀌어도 중심과 카메라 거리를 같은 비율로 확장한다", () => {
    const short = resolveStudioMannequinCameraFrame(1.2, "front");
    const giant = resolveStudioMannequinCameraFrame(2, "front");
    expect(short.target[1]).toBeCloseTo(0.6, 8);
    expect(giant.target[1]).toBeCloseTo(1, 8);
    const shortDistance = Math.hypot(
      short.position[0] - short.target[0],
      short.position[1] - short.target[1],
      short.position[2] - short.target[2],
    );
    const giantDistance = Math.hypot(
      giant.position[0] - giant.target[0],
      giant.position[1] - giant.target[1],
      giant.position[2] - giant.target[2],
    );
    expect(giantDistance / shortDistance).toBeCloseTo(2 / 1.2, 8);
  });
});

describe("resolveStudioMannequinPointerRotation", () => {
  it("maps one pointer drag to two visible swing axes without mutating the start pose", () => {
    const start = [0.05, -0.02, 0.03] as const;
    const before = [...start];
    const result = resolveStudioMannequinPointerRotation({
      jointId: "head",
      startRotation: start,
      deltaX: 30,
      deltaY: -20,
      viewportWidth: 800,
      viewportHeight: 600,
    });

    expect(start).toEqual(before);
    expect(result[0]).toBeGreaterThan(start[0]);
    expect(result[1]).toBe(start[1]);
    expect(result[2]).toBeGreaterThan(start[2]);
  });

  it("uses Alt/twist mode for the local Y axis and Shift precision for smaller changes", () => {
    const regular = resolveStudioMannequinPointerRotation({
      jointId: "head",
      startRotation: [0, 0, 0],
      deltaX: 40,
      deltaY: 0,
      viewportWidth: 600,
      viewportHeight: 600,
      twistMode: true,
    });
    const fine = resolveStudioMannequinPointerRotation({
      jointId: "head",
      startRotation: [0, 0, 0],
      deltaX: 40,
      deltaY: 0,
      viewportWidth: 600,
      viewportHeight: 600,
      twistMode: true,
      fine: true,
    });

    expect(regular[0]).toBe(0);
    expect(regular[1]).toBeGreaterThan(0);
    expect(regular[2]).toBe(0);
    expect(Math.abs(fine[1])).toBeLessThan(Math.abs(regular[1]));
  });

  it("clamps extreme or non-finite pointer input to the authored joint limits", () => {
    const limit = getStudioMannequinJointLimit("leftLowerArm");
    const extreme = resolveStudioMannequinPointerRotation({
      jointId: "leftLowerArm",
      startRotation: [0, 0, 0],
      deltaX: 1_000_000,
      deltaY: -1_000_000,
      viewportWidth: 0,
      viewportHeight: Number.NaN,
    });
    expect(extreme[0]).toBeGreaterThanOrEqual(limit.x[0]);
    expect(extreme[0]).toBeLessThanOrEqual(limit.x[1]);
    expect(extreme[2]).toBeGreaterThanOrEqual(limit.z[0]);
    expect(extreme[2]).toBeLessThanOrEqual(limit.z[1]);

    const broken = resolveStudioMannequinPointerRotation({
      jointId: "head",
      startRotation: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
      deltaX: Number.NaN,
      deltaY: Number.POSITIVE_INFINITY,
      viewportWidth: Number.NaN,
      viewportHeight: Number.NEGATIVE_INFINITY,
    });
    expect(broken.every(Number.isFinite)).toBe(true);
  });
});

describe("mannequin lighting live wiring (rig -> mounted THREE lights)", () => {
  it("기본 계획은 기존 고정 3점 리그와 같은 조명을 마운트한다", () => {
    const group = mountStudioMannequinLightingGroup(STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN);
    const snapshot = readStudioMannequinLightingSnapshot(group);
    expect(snapshot).toEqual(snapshotStudioMannequinLightingPlan(STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN));
    expect(snapshot.isDefault).toBe(true);
    expect(snapshot.hemisphere).toEqual({ skyColor: "#fff4e6", groundColor: "#38322b", intensity: 0.95 });
    expect(snapshot.lights.map((light) => light.intensity)).toEqual([1.45, 0.42, 0.28]);
    expect(group.children).toHaveLength(4); // 헤미스피어 + 방향광 3개
  });

  it.each(["dawn", "noon", "dusk", "night"] as const satisfies readonly StudioMannequinTimeOfDay[])(
    "시간대 프리셋 %s의 rig가 마운트된 조명 객체에 그대로 전파된다",
    (preset) => {
      const rig = applyStudioMannequinTimeOfDay(preset);
      const plan = resolveStudioMannequinLightingPlan(rig);
      const group = mountStudioMannequinLightingGroup(plan);
      // 계획이 아니라 실제 THREE 객체에서 읽은 값이 계획과 일치해야 실연결이다.
      expect(readStudioMannequinLightingSnapshot(group)).toEqual(
        snapshotStudioMannequinLightingPlan(plan),
      );
      expect(readStudioMannequinLightingSnapshot(group).isDefault).toBe(false);
    },
  );

  it("황혼 프리셋은 spot의 각도·거리와 색까지 뷰포트 조명에 반영된다", () => {
    const group = mountStudioMannequinLightingGroup(
      resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("dusk")),
    );
    const snapshot = readStudioMannequinLightingSnapshot(group);
    expect(snapshot.lights[0]).toEqual({
      kind: "directional",
      intensity: 2.8,
      color: "#ff7a4d",
      position: [-4, 1, 2],
      castShadow: true,
    });
    expect(snapshot.lights[1]).toEqual({
      kind: "spot",
      intensity: 1.2,
      color: "#ffd9a0",
      position: [3, 2.5, 3],
      angle: 0.5,
      penumbra: 0.45,
      distance: 10,
      castShadow: false,
    });
    const spot = group.children.find((child) => child instanceof THREE.SpotLight);
    expect(spot).toBeInstanceOf(THREE.SpotLight);
  });

  it("그룹 교체(replace)가 이전 프리셋 조명을 남기지 않고 새 rig로 갈아끼운다", () => {
    const group = mountStudioMannequinLightingGroup(
      resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("noon")),
    );
    expect(readStudioMannequinLightingSnapshot(group).lights).toHaveLength(1);
    replaceStudioMannequinLightingGroup(
      group,
      resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("night")),
    );
    const snapshot = readStudioMannequinLightingSnapshot(group);
    expect(snapshot).toEqual(
      snapshotStudioMannequinLightingPlan(
        resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("night")),
      ),
    );
    expect(snapshot.shadowsEnabled).toBe(false);
    expect(snapshot.lights.every((light) => !light.castShadow)).toBe(true);
    // 정오의 강한 키 라이트(3.5)가 잔존하지 않는다.
    expect(snapshot.lights.some((light) => light.intensity === 3.5)).toBe(false);
    expect(group.children).toHaveLength(3); // 헤미스피어 + point + directional
  });

  it("사용자 정의 rig(추가 조명·그림자 off)도 같은 경로로 반영된다", () => {
    let rig = createStudioMannequinLightingRig();
    rig = addStudioMannequinLight(rig, {
      kind: "point",
      intensity: 7,
      color: "#123456",
      position: [1, 2, 3],
      distance: 4,
    });
    rig = setStudioMannequinShadows(rig, false);
    const plan = resolveStudioMannequinLightingPlan(rig);
    const group = mountStudioMannequinLightingGroup(plan);
    const snapshot = readStudioMannequinLightingSnapshot(group);
    expect(snapshot).toEqual(snapshotStudioMannequinLightingPlan(plan));
    expect(snapshot.lights[0]).toMatchObject({
      kind: "point",
      intensity: 7,
      color: "#123456",
      position: [1, 2, 3],
      distance: 4,
      castShadow: false,
    });
    expect(snapshot.shadowsEnabled).toBe(false);
  });

  it("그림자를 만드는 조명은 섀도맵(2048)과 카메라 범위를 갖춘 directional이다", () => {
    const plan = resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("noon"));
    const key = plan.lights[0];
    expect(key).toBeDefined();
    const object = createStudioMannequinLightingObject(key!);
    expect(object).toBeInstanceOf(THREE.DirectionalLight);
    const directional = object as THREE.DirectionalLight;
    expect(directional.castShadow).toBe(true);
    expect(directional.shadow.mapSize.x).toBe(2048);
    expect(directional.shadow.camera.left).toBe(-2.6);
    expect(directional.shadow.camera.top).toBe(3.2);
  });

  it("캡처 결과는 마운트된 조명 스냅샷을 포함하고, 생략 시 기존 모양을 유지한다", () => {
    const group = mountStudioMannequinLightingGroup(
      resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("dawn")),
    );
    const lighting = readStudioMannequinLightingSnapshot(group);
    const withLighting = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 1280,
      height: 960,
      displayWidth: 640,
      displayHeight: 480,
      lighting,
    });
    expect(withLighting.lighting).toEqual(lighting);
    expect(withLighting.lighting?.lights[0]?.color).toBe("#ffb37a");
    const withoutLighting = resolveStudioMannequinCaptureResult({
      pngDataUrl: PNG,
      width: 1280,
      height: 960,
      displayWidth: 640,
      displayHeight: 480,
    });
    expect("lighting" in withoutLighting).toBe(false);
  });
});
