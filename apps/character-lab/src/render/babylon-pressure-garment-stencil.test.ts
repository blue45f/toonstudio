import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera.js";
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { afterEach, expect, it } from "vitest";

import {
  PRESSURE_GARMENT_STENCIL_BIT,
  PressureGarmentStencilController,
  bindFixtureRig,
  registerPressureOcclusionRenderPass,
  restorePendingPressureGarmentStencil,
} from "./testing/null-engine-harness";
import { createProceduralFixture } from "./testing/procedural-fixture";

import type { PartRole } from "../contracts";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";

const cleanups: Array<() => void> = [];
afterEach(() => { while (cleanups.length) cleanups.pop()?.(); });

/** 실제 SDK observable·재질·패스 ID를 쓴다. GPU draw나 stencil 픽셀 검증은 아니다. */
function boot(beforeController?: (mesh: Mesh) => void) {
  const fixture = bindFixtureRig(createProceduralFixture());
  cleanups.push(() => fixture.dispose());
  const { scene } = fixture;
  const camera = new FreeCamera("stencil-main", new Vector3(0, 0, -4), scene);
  scene.activeCamera = camera;
  scene.getEngine().currentRenderPassId = camera.renderPassId;
  const rig = { ...fixture.rig, kind: "kit" as const };
  const top = rig.parts.find((part) => part.role === "top");
  const body = rig.parts.find((part) => part.role === "skin");
  const hair = rig.parts.find((part) => part.role === "hair");
  const mesh = top?.meshes[0], bodyMesh = body?.meshes[0], hairMesh = hair?.meshes[0];
  if (!top || !body || !hair || !mesh || !bodyMesh || !hairMesh) throw new Error("의상 stencil fixture가 없습니다.");
  beforeController?.(mesh);
  const controller = new PressureGarmentStencilController(scene);
  cleanups.push(() => controller.dispose());
  controller.sync(rig, true);
  return { ...fixture, rig, camera, controller, top, body, hair, mesh, bodyMesh, hairMesh };
}

function stencil(material: Material) {
  const state = material.stencil;
  return {
    enabled: state.enabled, mask: state.mask,
    func: state.func, backFunc: state.backFunc, funcRef: state.funcRef, funcMask: state.funcMask,
    opStencilFail: state.opStencilFail, opDepthFail: state.opDepthFail, opStencilDepthPass: state.opStencilDepthPass,
    backOpStencilFail: state.backOpStencilFail, backOpDepthFail: state.backOpDepthFail, backOpStencilDepthPass: state.backOpStencilDepthPass,
  };
}

function before(mesh: Mesh): void { mesh.onBeforeRenderObservable.notifyObservers(mesh); }
function draw(mesh: Mesh): void { mesh.onBeforeDrawObservable.notifyObservers(mesh); }
function after(mesh: Mesh): void { mesh.onAfterRenderObservable.notifyObservers(mesh); }

it("의상의 실제 depth 통과에만 전용 비트를 쓰고 기존 0x04 설정·색·깊이·알파·원본 자원을 복원한다", () => {
  const env = boot();
  const material = env.top.pbr;
  Object.assign(material.stencil, { enabled: false, mask: 0x04, funcMask: 0x04, funcRef: 0x04, func: Constants.NOTEQUAL, backFunc: Constants.EQUAL });
  const original = stencil(material);
  const identity = material.stencil;
  const geometry = env.mesh.geometry, skeleton = env.mesh.skeleton;
  const engine = env.scene.getEngine();
  const state = () => ({
    color: engine.getColorWrite(), depth: engine.getDepthWrite(), alpha: engine.getAlphaMode(),
    materialAlpha: material.alpha, alphaMode: material.alphaMode, materialDepth: material.disableDepthWrite,
  });
  const originalState = state();
  before(env.mesh);
  expect(stencil(material)).toEqual(original);
  draw(env.mesh);
  expect(stencil(material)).toEqual({
    enabled: true, mask: PRESSURE_GARMENT_STENCIL_BIT,
    func: Constants.ALWAYS, backFunc: Constants.ALWAYS,
    funcRef: PRESSURE_GARMENT_STENCIL_BIT, funcMask: PRESSURE_GARMENT_STENCIL_BIT,
    opStencilFail: Constants.KEEP, opDepthFail: Constants.KEEP, opStencilDepthPass: Constants.REPLACE,
    backOpStencilFail: Constants.KEEP, backOpDepthFail: Constants.KEEP, backOpStencilDepthPass: Constants.REPLACE,
  });
  after(env.mesh);
  expect(stencil(material)).toEqual(original);
  expect(material.stencil).toBe(identity);
  expect(state()).toEqual(originalState);
  expect([env.mesh.geometry, env.mesh.skeleton]).toEqual([geometry, skeleton]);
  expect(env.mesh.material).toBe(material);
});

it("main·등록 lit만 현재 pass 재질에 적용하고 shadow·비 lit override에는 남기지 않는다", () => {
  const env = boot();
  const engine = env.scene.getEngine();
  const rtt = new RenderTargetTexture("stencil-lit", 8, env.scene);
  const other = new RenderTargetTexture("stencil-shadow", 8, env.scene);
  cleanups.push(() => { rtt.dispose(); other.dispose(); });
  const unregister = registerPressureOcclusionRenderPass(env.scene, rtt.renderPassId);
  cleanups.push(unregister);
  const override = new PBRMaterial("stencil-lit-override", env.scene);
  cleanups.push(() => override.dispose());
  const sourceState = stencil(env.top.pbr), overrideState = stencil(override);
  env.mesh.setMaterialForRenderPass(rtt.renderPassId, override);
  engine.currentRenderPassId = rtt.renderPassId;
  before(env.mesh);
  draw(env.mesh);
  expect(override.stencil.enabled).toBe(true);
  expect(stencil(env.top.pbr)).toEqual(sourceState);
  after(env.mesh);
  expect(stencil(override)).toEqual(overrideState);
  engine.currentRenderPassId = other.renderPassId;
  before(env.mesh);
  draw(env.mesh);
  expect(stencil(env.top.pbr)).toEqual(sourceState);
  after(env.mesh);
  unregister();
  engine.currentRenderPassId = rtt.renderPassId;
  before(env.mesh);
  draw(env.mesh);
  expect(stencil(override)).toEqual(overrideState);
  after(env.mesh);
});

it("readiness 조기 종료에는 pending을 만들지 않아 공유 재질의 외부 변경도 회수하지 않는다", () => {
  const env = boot();
  env.bodyMesh.material = env.top.pbr;
  const original = stencil(env.top.pbr);
  before(env.mesh);
  expect(stencil(env.top.pbr)).toEqual(original);
  // readiness=false에는 beforeDraw와 afterRender가 없다. 미적용 상태라 외부 변경도 회수하지 않는다.
  env.top.pbr.stencil.func = Constants.EQUAL;
  const changed = stencil(env.top.pbr);
  restorePendingPressureGarmentStencil(env.scene);
  expect(stencil(env.top.pbr)).toEqual(changed);
  before(env.bodyMesh);
  expect(stencil(env.top.pbr)).toEqual(changed);
  draw(env.bodyMesh);
  expect(stencil(env.top.pbr)).toEqual(changed);
  after(env.bodyMesh);
});

it("중첩된 미등록 draw 뒤 outer 의상은 실제 draw 직전에 marker를 다시 얻는다", () => {
  const env = boot();
  env.bodyMesh.material = env.top.pbr;
  const original = stencil(env.top.pbr);
  before(env.mesh);
  before(env.bodyMesh);
  draw(env.bodyMesh);
  after(env.bodyMesh);
  expect(stencil(env.top.pbr)).toEqual(original);
  draw(env.mesh);
  expect(env.top.pbr.stencil.mask).toBe(PRESSURE_GARMENT_STENCIL_BIT);
  after(env.mesh);
  expect(stencil(env.top.pbr)).toEqual(original);
});

it("부분 알파·BLEND·숨김·native hull·기존 활성 stencil은 덮지 않는다", () => {
  const env = boot();
  const material = env.top.pbr;
  const original = stencil(material);
  const cases: Array<() => () => void> = [
    () => { material.alpha = 0.5; return () => { material.alpha = 1; }; },
    () => { material.transparencyMode = PBRMaterial.MATERIAL_ALPHABLEND; return () => { material.transparencyMode = null; }; },
    () => { env.mesh.visibility = 0.5; return () => { env.mesh.visibility = 1; }; },
    () => { env.mesh.hasVertexAlpha = true; return () => { env.mesh.hasVertexAlpha = false; }; },
    () => { env.top.visible = false; return () => { env.top.visible = true; }; },
    () => { env.mesh.renderOutline = true; return () => { env.mesh.renderOutline = false; }; },
  ];
  for (const setup of cases) {
    const restore = setup();
    try { before(env.mesh); draw(env.mesh); expect(stencil(material)).toEqual(original); after(env.mesh); }
    finally { restore(); }
  }
  Object.assign(material.stencil, { enabled: true, mask: 0x04, funcMask: 0x04, funcRef: 0x04, func: Constants.EQUAL });
  const native = stencil(material);
  before(env.mesh); draw(env.mesh); after(env.mesh);
  expect(stencil(material)).toEqual(native);
});

it.each(["beforeRender", "beforeBind", "bind"] as const)("기존 %s callback의 활성 custom predicate는 실제 draw와 after·finally에서도 보존한다", (phase) => {
  const env = boot();
  const material = env.top.pbr;
  const original = stencil(material);
  const custom = { ...original, enabled: true, mask: 0x04, funcMask: 0x04, funcRef: 0x04, func: Constants.EQUAL, backFunc: Constants.EQUAL };
  const seen: Array<ReturnType<typeof stencil>> = [];
  const configure = (): void => { seen.push(stencil(material)); Object.assign(material.stencil, custom); };
  if (phase === "beforeRender") env.mesh.onBeforeRenderObservable.add(configure);
  else if (phase === "beforeBind") env.mesh.onBeforeBindObservable.add(configure);
  else material.onBindObservable.add(configure);

  before(env.mesh);
  env.mesh.onBeforeBindObservable.notifyObservers(env.mesh);
  material.onBindObservable.notifyObservers(env.mesh);
  expect(seen).toEqual([original]);
  expect(stencil(material)).toEqual(custom);
  draw(env.mesh);
  expect(stencil(material)).toEqual(custom);
  after(env.mesh);
  restorePendingPressureGarmentStencil(env.scene);
  expect(stencil(material)).toEqual(custom);
});

it.each(["beforeRender", "beforeBind", "bind"] as const)("기존 %s callback의 부분 필드 설정을 늦은 marker의 snapshot에 포함해 정확히 복원한다", (phase) => {
  const env = boot();
  const material = env.top.pbr;
  const original = stencil(material);
  const partial = { ...original, func: Constants.EQUAL, mask: 0x04 };
  const configure = (): void => { material.stencil.func = Constants.EQUAL; material.stencil.mask = 0x04; };
  if (phase === "beforeRender") env.mesh.onBeforeRenderObservable.add(configure);
  else if (phase === "beforeBind") env.mesh.onBeforeBindObservable.add(configure);
  else material.onBindObservable.add(configure);

  before(env.mesh);
  env.mesh.onBeforeBindObservable.notifyObservers(env.mesh);
  material.onBindObservable.notifyObservers(env.mesh);
  expect(stencil(material)).toEqual(partial);
  draw(env.mesh);
  expect(material.stencil.mask).toBe(PRESSURE_GARMENT_STENCIL_BIT);
  after(env.mesh);
  restorePendingPressureGarmentStencil(env.scene);
  expect(stencil(material)).toEqual(partial);
  before(env.mesh); draw(env.mesh);
  expect(material.stencil.mask).toBe(PRESSURE_GARMENT_STENCIL_BIT);
  after(env.mesh);
  expect(stencil(material)).toEqual(partial);
});

it.each(["existing", "later"] as const)("%s onBeforeDraw callback이 있는 의상은 marker를 생략하고 사용자 stencil을 남긴다", (timing) => {
  const addCustom = (mesh: Mesh): void => {
    mesh.onBeforeDrawObservable.add(() => {
      const material = mesh.material;
      if (!material) throw new Error("fixture 재질이 없습니다.");
      Object.assign(material.stencil, { enabled: true, mask: 0x04, funcMask: 0x04, funcRef: 0x04, func: Constants.EQUAL });
    });
  };
  const env = boot(timing === "existing" ? addCustom : undefined);
  const material = env.top.pbr;
  const original = stencil(material);
  if (timing === "later") addCustom(env.mesh);
  const custom = { ...original, enabled: true, mask: 0x04, funcMask: 0x04, funcRef: 0x04, func: Constants.EQUAL };
  before(env.mesh);
  expect(stencil(material)).toEqual(original);
  draw(env.mesh);
  expect(stencil(material)).toEqual(custom);
  after(env.mesh);
  restorePendingPressureGarmentStencil(env.scene);
  expect(stencil(material)).toEqual(custom);
});

it("global stencil과 global-only가 활성화되면 marker를 건너뛰고 앞뒤면의 전역 설정을 모두 보존한다", () => {
  const env = boot();
  const engine = env.scene.getEngine();
  const materialState = stencil(env.top.pbr);
  engine.setStencilMask(0x04);
  engine.setStencilFunction(Constants.NOTEQUAL);
  engine.setStencilBackFunction(Constants.EQUAL);
  engine.setStencilFunctionReference(0x04);
  engine.setStencilFunctionMask(0x0c);
  engine.setStencilOperationFail(Constants.REPLACE);
  engine.setStencilOperationDepthFail(Constants.KEEP);
  engine.setStencilOperationPass(Constants.REPLACE);
  engine.setStencilBackOperationFail(Constants.KEEP);
  engine.setStencilBackOperationDepthFail(Constants.REPLACE);
  engine.setStencilBackOperationPass(Constants.KEEP);
  const globalState = () => ({
    enabled: engine.getStencilBuffer(), mask: engine.getStencilMask(),
    func: engine.getStencilFunction(), backFunc: engine.getStencilBackFunction(),
    reference: engine.getStencilFunctionReference(), funcMask: engine.getStencilFunctionMask(),
    fail: engine.getStencilOperationFail(), depthFail: engine.getStencilOperationDepthFail(), pass: engine.getStencilOperationPass(),
    backFail: engine.getStencilBackOperationFail(), backDepthFail: engine.getStencilBackOperationDepthFail(), backPass: engine.getStencilBackOperationPass(),
    globalOnly: engine.stencilStateComposer.useStencilGlobalOnly,
  });
  for (const condition of [
    { enabled: true, globalOnly: false },
    { enabled: false, globalOnly: true },
    { enabled: true, globalOnly: true },
  ]) {
    engine.setStencilBuffer(condition.enabled);
    engine.stencilStateComposer.useStencilGlobalOnly = condition.globalOnly;
    const original = globalState();
    before(env.mesh); draw(env.mesh);
    expect(stencil(env.top.pbr)).toEqual(materialState);
    expect(globalState()).toEqual(original);
    after(env.mesh);
    env.controller.restorePending();
    expect(stencil(env.top.pbr)).toEqual(materialState);
    expect(globalState()).toEqual(original);
  }
});

it("beforeRender 뒤 global stencil이 켜져도 실제 draw에는 marker를 적용하지 않는다", () => {
  const env = boot();
  const engine = env.scene.getEngine();
  const original = stencil(env.top.pbr);
  for (const phase of ["draw", "bind"] as const) {
    engine.setStencilBuffer(false);
    before(env.mesh);
    expect(stencil(env.top.pbr)).toEqual(original);
    engine.setStencilBuffer(true);
    if (phase === "draw") draw(env.mesh);
    else { env.top.pbr.onBindObservable.notifyObservers(env.mesh); draw(env.mesh); }
    expect(stencil(env.top.pbr)).toEqual(original);
    expect(engine.getStencilBuffer()).toBe(true);
    after(env.mesh);
  }
});

it("색을 쓰지 않는 prepass와 피부·헤어에는 marker를 쓰지 않는다", () => {
  const env = boot();
  const original = stencil(env.top.pbr);
  env.scene.getEngine().setColorWrite(false);
  before(env.mesh); draw(env.mesh); after(env.mesh);
  expect(stencil(env.top.pbr)).toEqual(original);
  env.scene.getEngine().setColorWrite(true);
  for (const mesh of [env.bodyMesh, env.hairMesh]) {
    const material = mesh.material;
    if (!material) throw new Error("fixture 재질이 없습니다.");
    const saved = stencil(material);
    before(mesh); draw(mesh); after(mesh);
    expect(stencil(material)).toEqual(saved);
  }
});

it("기존 의상·키트 v2 층 역할만 가림을 기록하고 액세서리는 제외한다", () => {
  const env = boot();
  const original = stencil(env.top.pbr);
  env.controller.release(env.rig);
  const roles: readonly PartRole[] = ["underwear", "top", "bottom", "shoes", "inner", "outer", "legwear", "accessory", "hair-accessory"];
  for (const role of roles) {
    const candidate = { ...env.rig, parts: [{ ...env.top, role }] };
    env.controller.sync(candidate, true);
    before(env.mesh); draw(env.mesh);
    expect(env.top.pbr.stencil.enabled, role).toBe(role !== "accessory" && role !== "hair-accessory");
    after(env.mesh);
    expect(stencil(env.top.pbr)).toEqual(original);
    env.controller.release(candidate);
  }
});

it("등록 이후 추가한 공유 재질 메시에도 미복원 상태를 회수하는 guard를 붙인다", async () => {
  const env = boot();
  const additional = env.bodyMesh.clone("stencil-shared-new");
  if (!additional) throw new Error("공유 재질 fixture 복제가 실패했습니다.");
  additional.material = env.top.pbr;
  await new Promise<void>((resolve) => {
    const observer = env.scene.onNewMeshAddedObservable.add((mesh) => {
      if (mesh !== additional) return;
      env.scene.onNewMeshAddedObservable.remove(observer);
      resolve();
    });
  });
  env.scene.onBeforeRenderObservable.notifyObservers(env.scene);
  const original = stencil(env.top.pbr);
  before(env.mesh);
  draw(env.mesh);
  before(additional);
  expect(stencil(env.top.pbr)).toEqual(original);
  after(additional);
  additional.dispose(false, false);
});

it("그룹 중 새 메시의 지연 알림에서 복원하고 다음 프레임의 공유 재질 draw도 보호한다", async () => {
  const env = boot();
  const original = stencil(env.top.pbr);
  before(env.mesh);
  draw(env.mesh);
  const additional = env.bodyMesh.clone("stencil-shared-mid-group");
  if (!additional) throw new Error("공유 재질 fixture 복제가 실패했습니다.");
  additional.material = env.top.pbr;
  await new Promise<void>((resolve) => {
    const observer = env.scene.onNewMeshAddedObservable.add((mesh) => {
      if (mesh !== additional) return;
      env.scene.onNewMeshAddedObservable.remove(observer);
      resolve();
    });
  });
  expect(stencil(env.top.pbr)).toEqual(original);
  env.scene.onBeforeRenderObservable.notifyObservers(env.scene);
  before(env.mesh);
  draw(env.mesh);
  expect(env.top.pbr.stencil.enabled).toBe(true);
  before(additional);
  draw(additional);
  expect(stencil(env.top.pbr)).toEqual(original);
  after(env.mesh);
  additional.dispose(false, false);
});

it("그리기 예외의 상위 finally helper와 release·모드 전환·dispose가 미복원 상태를 회수한다", () => {
  const env = boot();
  const material = env.top.pbr;
  const original = stencil(material);
  expect(() => {
    try { before(env.mesh); draw(env.mesh); throw new Error("draw 실패"); }
    finally { restorePendingPressureGarmentStencil(env.scene); }
  }).toThrow("draw 실패");
  expect(stencil(material)).toEqual(original);
  before(env.mesh);
  draw(env.mesh);
  env.controller.release(env.rig);
  expect(stencil(material)).toEqual(original);
  before(env.mesh); draw(env.mesh); after(env.mesh);
  expect(stencil(material)).toEqual(original);
  env.controller.sync(env.rig, true);
  before(env.mesh);
  draw(env.mesh);
  env.controller.sync(env.rig, false);
  expect(stencil(material)).toEqual(original);
  env.controller.sync({ ...env.rig, kind: "procedural" }, true);
  before(env.mesh); draw(env.mesh); after(env.mesh);
  expect(stencil(material)).toEqual(original);
  env.controller.sync(env.rig, true);
  before(env.mesh);
  draw(env.mesh);
  env.controller.dispose();
  env.controller.dispose();
  expect(stencil(material)).toEqual(original);
  expect(env.mesh.isDisposed()).toBe(false);
});

it("입력 파츠 교체와 frozen 재질의 반복 draw에도 이전 등록·stencil을 남기지 않는다", () => {
  const env = boot();
  const original = stencil(env.top.pbr);
  env.top.pbr.freeze();
  for (let i = 0; i < 2; i += 1) {
    before(env.mesh); draw(env.mesh);
    expect(env.top.pbr.stencil.enabled).toBe(true);
    after(env.mesh);
    expect(stencil(env.top.pbr)).toEqual(original);
  }
  env.top.pbr.unfreeze();
  const replacement = { ...env.rig, parts: env.rig.parts.filter((part) => part !== env.top) };
  env.controller.release(env.rig);
  env.controller.sync(replacement, true);
  before(env.mesh); draw(env.mesh); after(env.mesh);
  expect(stencil(env.top.pbr)).toEqual(original);
});

it("메시가 그리기 중 해제돼도 재질 snapshot을 복원하고 원래 재질은 해제하지 않는다", () => {
  const env = boot();
  const material = env.top.pbr;
  const original = stencil(material);
  before(env.mesh);
  draw(env.mesh);
  expect(material.stencil.enabled).toBe(true);
  env.mesh.dispose(false, false);
  expect(stencil(material)).toEqual(original);
  expect(env.scene.materials).toContain(material);
  expect(() => env.controller.sync(env.rig, true)).not.toThrow();
  restorePendingPressureGarmentStencil(env.scene);
  expect(stencil(material)).toEqual(original);
});
