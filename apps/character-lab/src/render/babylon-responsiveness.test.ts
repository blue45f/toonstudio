/**
 * 반응성·카메라 렌더 배선(NullEngine): P-01(morph 일괄 추가·셰이더 define 고정·캡처 타깃 풀), F-01·H-03(궤도 한계·휠·팬·키보드·더블클릭 초기화).
 * GPU 셰이더 컴파일 횟수·실제 long task·PBO readback 바이트는 Node에서 볼 수 없다 — fix-LAB1 실브라우저 측정(Chrome 156·M2 Max Metal)으로 보완한다.
 */
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_FRAMING } from "../contracts";
import { applyPlanFixture } from "../testing/recipe-fixtures";

import { resolveFraming } from "./camera-framing";
import {
  POOLED_CAPTURE_MAX_EDGE,
  acquireCaptureTarget,
  applyRigPlan,
  attachViewportControls,
  bindFixtureRig,
  createBareNullScene,
  createCharacterScene,
  createNullEngineHarness,
  panCameraByPixels,
  pinMorphInfluencerCount,
  pooledCaptureTargetCount,
  zoomCameraByWheel,
} from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";
import { WHEEL_ZOOM_PER_NOTCH, resolveOrbitLimits } from "./viewport-orbit";

import type { HumanoidModelData } from "../contracts";
import type { WorldBounds } from "./camera-framing";
import type { BareNullScene, FixtureRig, NullEngineHarness } from "./testing/null-engine-harness";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  while (cleanups.length > 0) cleanups.pop()?.();
});

/** 머리 파츠에 morph 타깃 `count`개를 단 모델 */
function modelWithHeadMorphs(count: number): HumanoidModelData {
  const base = createProceduralFixture();
  const names = Array.from({ length: count }, (_, i) => `facs:synthetic${i}`);
  const parts = base.parts.map((part) => {
    if (part.id !== "head") return part;
    const vertexCount = part.positions.length / 3;
    return { ...part, morphs: names.map((name) => ({ name, deltaPositions: new Float32Array(vertexCount * 3).fill(0.001) })) };
  });
  return { ...base, parts, morphNames: names };
}

function fixture(model: HumanoidModelData, overrides: Parameters<typeof bindFixtureRig>[1] = {}): FixtureRig {
  const rig = bindFixtureRig(model, overrides);
  cleanups.push(() => rig.dispose());
  return rig;
}

function bare(overrides: Parameters<typeof createBareNullScene>[0] = {}): BareNullScene {
  const scene = createBareNullScene(overrides);
  cleanups.push(() => scene.dispose());
  return scene;
}

function headManager(rig: FixtureRig): MorphTargetManager {
  const manager = rig.rig.parts.find((part) => part.role === "head")?.meshes[0]?.morphTargetManager;
  if (!manager) throw new Error("head morph 매니저가 없습니다.");
  return manager;
}

describe("P-01 morph 바인딩", () => {
  it("타깃을 일괄로 더해 매니저당 한 번만 동기화한다(타깃마다 morph 텍스처를 다시 만들지 않는다)", () => {
    const synchronize = vi.spyOn(MorphTargetManager.prototype, "synchronize");
    const rig = fixture(modelWithHeadMorphs(30), { morphTextures: true });
    const managers = rig.rig.parts.flatMap((part) => part.meshes.map((mesh) => mesh.morphTargetManager)).filter((manager) => manager !== null);
    expect(headManager(rig).numTargets).toBe(30);
    // 이전(타깃마다 addTarget → synchronize)이면 30회 이상이었다
    expect(synchronize.mock.calls.length).toBeLessThanOrEqual(managers.length);
  });

  it("텍스처 모드면 morph 셰이더 define을 전체 타깃 수로 고정한다(활성 수가 바뀌어도 셰이더를 다시 만들지 않는다)", () => {
    const rig = fixture(modelWithHeadMorphs(30), { morphTextures: true });
    const manager = headManager(rig);
    expect(manager.isUsingTextureForTargets).toBe(true);
    expect(manager.numMaxInfluencers).toBe(30);
    // 플랜이 활성 morph 수를 바꿔도 고정값은 그대로다
    applyRigPlan(rig.rig, applyPlanFixture({ morphWeights: { "facs:synthetic1": 1, "facs:synthetic2": 0.5 } }), { outlinesVisible: false });
    expect(manager.numInfluencers).toBe(2);
    expect(manager.numMaxInfluencers).toBe(30);
  });

  it("정점 속성 모드(층 한계 초과·텍스처 미지원)에서는 고정하지 않는다(속성 수 초과로 컴파일 실패 방지)", () => {
    const overLimit = fixture(modelWithHeadMorphs(30), { morphTextures: true, texture2DArrayMaxLayerCount: 16 });
    expect(headManager(overLimit).numMaxInfluencers).toBe(0);
    const noTexture = fixture(modelWithHeadMorphs(30));
    expect(headManager(noTexture).isUsingTextureForTargets).toBe(false);
    expect(headManager(noTexture).numMaxInfluencers).toBe(0);
  });

  it("다른 경로(glTF 로더)가 만든 매니저도 첫 플랜에서 고정하고 이후 호출은 다시 동기화하지 않는다", () => {
    const { scene, engine } = bare({ morphTextures: true });
    const manager = new MorphTargetManager(scene);
    const synchronize = vi.spyOn(MorphTargetManager.prototype, "synchronize");
    pinMorphInfluencerCount(manager, engine, 12);
    pinMorphInfluencerCount(manager, engine, 12);
    expect(manager.numMaxInfluencers).toBe(12);
    expect(synchronize.mock.calls.length).toBeLessThanOrEqual(1);
    pinMorphInfluencerCount(null, engine);
    pinMorphInfluencerCount(new MorphTargetManager(scene), engine);
  });
});

describe("P-01 캡처 타깃 풀", () => {
  it("작은 타깃(썸네일)은 같은 장면·크기·샘플 수면 재사용하고 장면 텍스처 목록에 남기지 않는다", () => {
    const { scene } = bare();
    const before = scene.textures.length;
    const first = acquireCaptureTarget(scene, "lit", 128, 128, 4);
    first.release();
    const second = acquireCaptureTarget(scene, "flat", 128, 128, 4);
    expect(second.rtt).toBe(first.rtt);
    expect(second.pooled).toBe(true);
    // 이름은 패스를 나타낸다(진단·모의 readback)
    expect(second.rtt.name).toBe("capture-flat");
    expect(scene.textures.length).toBe(before);
    expect(pooledCaptureTargetCount(scene)).toBe(1);
    // 반납하면 렌더 목록을 비워 임시 리그 메시 참조를 남기지 않는다
    second.rtt.renderList = [new Mesh("probe", scene)];
    second.release();
    expect(second.rtt.renderList).toHaveLength(0);
  });

  it("빌린 타깃이 아직 쓰이는 중이면 풀 밖의 임시 타깃을 만들고, 큰 타깃은 풀에 두지 않는다", () => {
    const { scene } = bare();
    const busy = acquireCaptureTarget(scene, "lit", 64, 64, 1);
    const overlap = acquireCaptureTarget(scene, "lit", 64, 64, 1);
    expect(overlap.pooled).toBe(false);
    expect(overlap.rtt).not.toBe(busy.rtt);
    overlap.release();
    expect(overlap.rtt.getInternalTexture()).toBeNull();
    busy.release();
    const large = acquireCaptureTarget(scene, "lit", POOLED_CAPTURE_MAX_EDGE + 1, 64, 1);
    expect(large.pooled).toBe(false);
    large.release();
    expect(pooledCaptureTargetCount(scene)).toBe(1);
  });

  it("장면을 해제하면 풀 타깃도 해제한다", () => {
    const owned = createBareNullScene();
    const lease = acquireCaptureTarget(owned.scene, "lit", 32, 32, 1);
    lease.release();
    owned.dispose();
    expect(lease.rtt.getInternalTexture()).toBeNull();
    expect(pooledCaptureTargetCount(owned.scene)).toBe(0);
  });

  it("엔진 썸네일을 여러 번 그려도 캡처 타깃은 하나를 재사용한다(renderPassId 누적 없음)", async () => {
    const harness: NullEngineHarness = await createNullEngineHarness({ now: () => 1_000 });
    cleanups.push(() => harness.dispose());
    await harness.engine.loadSource({ kind: "procedural", model: createProceduralFixture() });
    const scene = harness.nullEngine.scenes[0];
    if (!scene) throw new Error("장면이 없습니다.");
    const textures = scene.textures.length;
    for (let i = 0; i < 4; i += 1) {
      await harness.engine.renderThumbnail({ presetId: "eyes/round", plan: applyPlanFixture({}), size: 96, framing: DEFAULT_FRAMING });
    }
    expect(pooledCaptureTargetCount(scene)).toBe(1);
    expect(scene.textures.length).toBe(textures);
  });
});

/** 키 1.65 m 인체 bbox */
const BODY: WorldBounds = { min: [-0.3, 0, -0.15], max: [0.3, 1.65, 0.15] };

function characterScene(): ReturnType<typeof createCharacterScene> {
  const { engine } = bare();
  const character = createCharacterScene(engine);
  return character;
}

/** Node에서 쓰는 가짜 캔버스(EventTarget + 크기·포인터 캡처) */
function fakeCanvas(height = 800): HTMLCanvasElement {
  const target = new EventTarget();
  return Object.assign(target, {
    clientHeight: height,
    clientWidth: height,
    setPointerCapture: () => undefined,
    hasPointerCapture: () => false,
    releasePointerCapture: () => undefined,
  }) as unknown as HTMLCanvasElement;
}

function fire(canvas: HTMLCanvasElement, type: string, fields: Record<string, unknown>): Event {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  canvas.dispatchEvent(event);
  return event;
}

describe("F-01 프레이밍별 궤도 한계", () => {
  it("applyFraming은 대상 크기 기반 최소·최대 거리를 걸고 프레이밍 반경·타깃은 그 안이다", () => {
    const character = characterScene();
    for (const mode of ["full-body", "bust", "face"] as const) {
      const framing = { ...DEFAULT_FRAMING, mode };
      character.applyFraming(character.camera, framing, BODY, 1);
      const limits = resolveOrbitLimits(framing, BODY, character.camera.fov, 1);
      expect(character.camera.lowerRadiusLimit).toBeCloseTo(limits.lowerRadius, 9);
      expect(character.camera.upperRadiusLimit).toBeCloseTo(limits.upperRadius, 9);
      const target = resolveFraming(framing, BODY, character.camera.fov, 1).target;
      expect([character.camera.target.x, character.camera.target.y, character.camera.target.z]).toEqual(target);
      expect(character.camera.radius).toBeGreaterThanOrEqual(limits.lowerRadius);
      expect(character.camera.radius).toBeLessThanOrEqual(limits.upperRadius);
    }
    // 얼굴 하한은 이전 고정값(0.15 m, 머리 안)보다 멀다
    character.applyFraming(character.camera, { ...DEFAULT_FRAMING, mode: "face" }, BODY, 1);
    expect(character.camera.lowerRadiusLimit ?? 0).toBeGreaterThan(0.15);
  });
});

describe("F-01·H-03 뷰포트 입력", () => {
  function attached(): { readonly camera: ArcRotateCamera; readonly canvas: HTMLCanvasElement; readonly resets: () => number } {
    const character = characterScene();
    character.applyFraming(character.camera, { ...DEFAULT_FRAMING, mode: "face" }, BODY, 1);
    const canvas = fakeCanvas();
    let resets = 0;
    character.attachControls(canvas, () => {
      resets += 1;
    });
    return { camera: character.camera, canvas, resets: () => resets };
  }

  it("휠 한 칸은 반경 ±12 %이고 하한에서 멈추며 페이지 스크롤을 막는다(Babylon 휠·키보드 입력은 떼고 팬 관성은 끈다)", () => {
    const { camera, canvas } = attached();
    expect(camera.inputs.attached.mousewheel).toBeUndefined();
    expect(camera.inputs.attached.keyboard).toBeUndefined();
    expect(camera.panningSensibility).toBe(0);
    const start = camera.radius;
    const event = fire(canvas, "wheel", { deltaY: 100, deltaMode: 0 });
    expect(event.defaultPrevented).toBe(true);
    expect(camera.radius).toBeCloseTo(start * (1 + WHEEL_ZOOM_PER_NOTCH), 9);
    for (let i = 0; i < 60; i += 1) fire(canvas, "wheel", { deltaY: -100, deltaMode: 0 });
    expect(camera.radius).toBeCloseTo(camera.lowerRadiusLimit ?? Number.NaN, 9);
    for (let i = 0; i < 80; i += 1) zoomCameraByWheel(camera, 100, 0);
    expect(camera.radius).toBeCloseTo(camera.upperRadiusLimit ?? Number.NaN, 9);
  });

  it("우클릭 드래그 팬은 화면 고정이고(300 px = 화면 높이의 3/8) 타깃이 캐릭터 경계 상자 밖으로 나가지 않는다", () => {
    const { camera, canvas } = attached();
    const origin = camera.target.clone();
    const visibleHeight = 2 * camera.radius * Math.tan(camera.fov / 2);
    fire(canvas, "pointerdown", { pointerId: 1, pointerType: "mouse", button: 2, clientX: 400, clientY: 400, ctrlKey: false });
    fire(canvas, "pointermove", { pointerId: 1, clientX: 400, clientY: 700 });
    fire(canvas, "pointerup", { pointerId: 1 });
    // 정면(+Z)에서 보는 카메라: 아래로 끌면 장면이 따라 내려오므로 타깃은 위로 화면 높이의 300/800만큼 움직인다
    expect(camera.target.y - origin.y).toBeCloseTo(visibleHeight * (300 / 800), 6);
    expect(Math.abs(camera.target.x - origin.x)).toBeLessThan(1e-9);
    // 멀리 끌어도 경계 상자(+키 × 5 %)에서 멈춘다 — 화면 중심이 캐릭터 위라 캐릭터가 화면 밖으로 나가지 않는다
    const bounds = resolveOrbitLimits({ ...DEFAULT_FRAMING, mode: "face" }, BODY, camera.fov, 1).panBounds;
    for (let i = 0; i < 50; i += 1) panCameraByPixels(camera, 0, 800, 800);
    expect(camera.target.y).toBeCloseTo(bounds.max[1], 9);
    for (let i = 0; i < 50; i += 1) panCameraByPixels(camera, 800, -800, 800);
    expect(camera.target.y).toBeCloseTo(bounds.min[1], 9);
    expect(camera.target.x).toBeCloseTo(bounds.min[0], 9);
    // 좌클릭(Ctrl 없음)은 팬하지 않는다(회전은 Babylon 포인터 입력)
    const before = camera.target.clone();
    fire(canvas, "pointerdown", { pointerId: 2, pointerType: "mouse", button: 0, clientX: 0, clientY: 0, ctrlKey: false });
    fire(canvas, "pointermove", { pointerId: 2, clientX: 300, clientY: 0 });
    expect(camera.target.equals(before)).toBe(true);
  });

  it("두 손가락 터치는 무게중심 이동만큼 팬한다", () => {
    const { camera, canvas } = attached();
    const origin = camera.target.clone();
    const visibleHeight = 2 * camera.radius * Math.tan(camera.fov / 2);
    fire(canvas, "pointerdown", { pointerId: 11, pointerType: "touch", button: 0, clientX: 300, clientY: 400 });
    fire(canvas, "pointerdown", { pointerId: 12, pointerType: "touch", button: 0, clientX: 500, clientY: 400 });
    fire(canvas, "pointermove", { pointerId: 11, clientX: 300, clientY: 480 });
    fire(canvas, "pointermove", { pointerId: 12, clientX: 500, clientY: 480 });
    expect(camera.target.y - origin.y).toBeCloseTo(visibleHeight * (80 / 800), 6);
  });

  it("캔버스 포커스 키보드: 방향키 회전·+/- 줌·0 초기화, 더블클릭 초기화", () => {
    const { camera, canvas, resets } = attached();
    const alpha = camera.alpha;
    const beta = camera.beta;
    const radius = camera.radius;
    const left = fire(canvas, "keydown", { key: "ArrowLeft", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    expect(left.defaultPrevented).toBe(true);
    expect(camera.alpha).toBeCloseTo(alpha - (5 * Math.PI) / 180, 9);
    fire(canvas, "keydown", { key: "ArrowUp", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    expect(camera.beta).toBeCloseTo(beta - (5 * Math.PI) / 180, 9);
    fire(canvas, "keydown", { key: "-", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    expect(camera.radius).toBeCloseTo(radius * (1 + WHEEL_ZOOM_PER_NOTCH), 9);
    const browserShortcut = fire(canvas, "keydown", { key: "+", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false });
    expect(browserShortcut.defaultPrevented).toBe(false);
    fire(canvas, "keydown", { key: "0", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false });
    fire(canvas, "dblclick", {});
    expect(resets()).toBe(2);
  });

  it("장면을 해제하면 입력을 떼고(더 이상 반응하지 않는다) 반환 함수도 멱등이다", () => {
    const owned = createBareNullScene();
    const character = createCharacterScene(owned.engine);
    const canvas = fakeCanvas();
    let resets = 0;
    const detach = attachViewportControls(character.camera, canvas, () => {
      resets += 1;
    });
    character.dispose();
    fire(canvas, "dblclick", {});
    expect(resets).toBe(0);
    detach();
    owned.engine.dispose();
  });
});
