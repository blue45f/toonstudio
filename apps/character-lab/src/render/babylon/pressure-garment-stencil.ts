/** 실제 의상 draw가 통과한 sample에만 몸통 필압 윤곽선의 가림 비트를 남긴다. */
import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";

import { isPressureOcclusionRenderPass } from "./pressure-occlusion-pass";

import type { CharacterRig, RigPart } from "./character-rig";
import type { PartRole } from "../../contracts";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { MaterialStencilState } from "@babylonjs/core/Materials/materialStencilState.js";
import type { Observer } from "@babylonjs/core/Misc/observable.js";
import type { Scene } from "@babylonjs/core/scene.js";

/** native OutlineRenderer의 0x04와 겹치지 않는 전용 비트다. */
export const PRESSURE_GARMENT_STENCIL_BIT = 0x08;

const GARMENT_ROLES: ReadonlySet<PartRole> = new Set(["underwear", "top", "bottom", "shoes", "inner", "outer", "legwear"]);
const controllers = new WeakMap<Scene, Set<PressureGarmentStencilController>>();

type StencilSnapshot = Pick<MaterialStencilState,
  "enabled" | "mask" | "func" | "backFunc" | "funcRef" | "funcMask" |
  "opStencilFail" | "opDepthFail" | "opStencilDepthPass" |
  "backOpStencilFail" | "backOpDepthFail" | "backOpStencilDepthPass">;

interface GarmentEntry {
  readonly rig: CharacterRig;
  readonly part: RigPart;
}

function snapshot(stencil: MaterialStencilState): StencilSnapshot {
  return {
    enabled: stencil.enabled, mask: stencil.mask,
    func: stencil.func, backFunc: stencil.backFunc, funcRef: stencil.funcRef, funcMask: stencil.funcMask,
    opStencilFail: stencil.opStencilFail, opDepthFail: stencil.opDepthFail, opStencilDepthPass: stencil.opStencilDepthPass,
    backOpStencilFail: stencil.backOpStencilFail, backOpDepthFail: stencil.backOpDepthFail, backOpStencilDepthPass: stencil.backOpStencilDepthPass,
  };
}

/** draw 예외 뒤 호출자가 finally에서 남은 변경을 돌려놓는다. */
export function restorePendingPressureGarmentStencil(scene: Scene): void {
  for (const controller of controllers.get(scene) ?? []) controller.restorePending();
}

/** 메시·재질은 원래 소유자가 유지한다. 이 클래스는 공개 observer와 stencil 스냅샷만 소유한다. */
export class PressureGarmentStencilController {
  private readonly garments = new Map<Mesh, GarmentEntry>();
  private readonly pending = new Map<Material, StencilSnapshot>();
  private readonly meshObservers = new Map<Mesh, () => void>();
  private readonly newMeshes = new Set<Mesh>();
  private readonly removeSceneObservers: () => void;
  private disposed = false;

  constructor(private readonly scene: Scene) {
    if (scene.isDisposed) throw new Error("해제된 장면에는 의상 stencil을 연결할 수 없습니다.");
    let owned = controllers.get(scene);
    if (!owned) {
      owned = new Set();
      controllers.set(scene, owned);
    }
    owned.add(this);

    // draw 예외 뒤 다음 미등록 메시도 공유 재질을 읽기 전에 복원한다.
    for (const mesh of scene.meshes) if (mesh instanceof Mesh) this.watch(mesh);
    // addMesh 알림은 Mesh의 super 생성자 안이다. 아직 준비되지 않은 mesh observable을 읽지 않는다.
    const added = scene.onNewMeshAddedObservable.add((mesh) => {
      if (this.disposed) return;
      this.restorePending();
      if (mesh instanceof Mesh) this.newMeshes.add(mesh);
    });
    const prepare = (): void => { this.restorePending(); this.watchNewMeshes(); };
    const beforeFrame = scene.onBeforeRenderObservable.add(prepare, -1, true);
    const beforeGroup = scene.onBeforeRenderingGroupObservable.add(prepare, -1, true);
    const afterGroup = scene.onAfterRenderingGroupObservable.add(() => this.restorePending(), -1, true);
    const disposed = scene.onDisposeObservable.addOnce(() => this.dispose());
    this.removeSceneObservers = () => {
      scene.onNewMeshAddedObservable.remove(added);
      scene.onBeforeRenderObservable.remove(beforeFrame);
      scene.onBeforeRenderingGroupObservable.remove(beforeGroup);
      scene.onAfterRenderingGroupObservable.remove(afterGroup);
      scene.onDisposeObservable.remove(disposed);
    };
  }

  sync(rig: CharacterRig, enabled: boolean): void {
    if (this.disposed) return;
    this.release(rig);
    this.watchNewMeshes();
    if (!enabled || rig.kind !== "kit") return;
    for (const part of rig.parts) {
      if (!GARMENT_ROLES.has(part.role) || part.forceHidden) continue;
      // 가시성은 플랜으로 달라지므로 등록과 별개로 실제 draw 직전에도 검사한다.
      for (const mesh of part.meshes) {
        if (mesh.isDisposed() || mesh.getScene() !== this.scene) continue;
        this.watch(mesh);
        this.garments.set(mesh, { rig, part });
      }
    }
  }

  release(rig: CharacterRig): void {
    this.restorePending();
    for (const [mesh, entry] of this.garments) if (entry.rig === rig) this.garments.delete(mesh);
  }

  restorePending(): void {
    for (const [material, original] of this.pending) Object.assign(material.stencil, original);
    this.pending.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.restorePending();
    this.garments.clear();
    for (const remove of this.meshObservers.values()) remove();
    this.meshObservers.clear();
    this.newMeshes.clear();
    this.removeSceneObservers();
    const owned = controllers.get(this.scene);
    owned?.delete(this);
    if (owned?.size === 0) controllers.delete(this.scene);
  }

  private watchNewMeshes(): void {
    for (const mesh of this.newMeshes) this.watch(mesh);
    this.newMeshes.clear();
  }

  private watch(mesh: Mesh): void {
    if (this.disposed || this.meshObservers.has(mesh) || mesh.isDisposed()) return;
    // readiness 실패·기존 callback에는 marker를 보이지 않고 잔여 변경만 회수한다.
    const before = mesh.onBeforeRenderObservable.add(() => this.restorePending(), -1, true);
    const draw: Observer<Mesh> = mesh.onBeforeDrawObservable.add(() => {
      this.restorePending();
      // 같은 draw에서 외부 callback과 marker를 임의 합성하지 않는다. 이후에 추가된 observer도 포함한다.
      if (mesh.onBeforeDrawObservable.observers.some((observer) => observer !== draw)) return;
      // 두 엔진은 이 알림 뒤 applyStates에서 같은 material.stencil 참조를 읽는다.
      this.beforeDraw(mesh);
    }, -1, true);
    const after = mesh.onAfterRenderObservable.add(() => this.restorePending(), -1, true);
    const disposed = mesh.onDisposeObservable.addOnce(() => {
      this.restorePending();
      this.garments.delete(mesh);
      this.meshObservers.get(mesh)?.();
      this.meshObservers.delete(mesh);
    });
    this.meshObservers.set(mesh, () => {
      mesh.onBeforeRenderObservable.remove(before);
      mesh.onBeforeDrawObservable.remove(draw);
      mesh.onAfterRenderObservable.remove(after);
      mesh.onDisposeObservable.remove(disposed);
    });
  }

  private eligible(mesh: Mesh, material: Material): boolean {
    const engine = this.scene.getEngine();
    if (this.disposed || !isPressureOcclusionRenderPass(this.scene) || !engine.getColorWrite()) return false;
    // material marker의 ALWAYS가 기존 global predicate를 가리거나 global-only 경로에 섞이지 않게 한다.
    if (engine.getStencilBuffer() || engine.stencilStateComposer.useStencilGlobalOnly) return false;
    const entry = this.garments.get(mesh);
    if (!entry || !entry.part.visible || entry.part.forceHidden || !mesh.isVisible || !mesh.isEnabled()) return false;
    if (mesh.visibility !== 1 || mesh.hasVertexAlpha || mesh.renderOutline || mesh.renderOverlay) return false;
    const current = mesh.getMaterialForRenderPass(this.scene.getEngine().currentRenderPassId) ?? mesh.material;
    return current === material && material.getClassName() !== "MultiMaterial" && material.alpha === 1 && entry.part.pbr.alpha === 1
      && !material.needAlphaBlendingForMesh(mesh) && !entry.part.pbr.needAlphaBlendingForMesh(mesh);
  }

  private beforeDraw(mesh: Mesh): void {
    this.restorePending();
    const material = mesh.getMaterialForRenderPass(this.scene.getEngine().currentRenderPassId) ?? mesh.material;
    if (!material || !this.eligible(mesh, material)) return;
    // 기존 활성 predicate와 새 marker를 임의로 합치지 않는다. native·사용자 stencil은 그대로 둔다.
    if (material.stencil.enabled) return;
    this.pending.set(material, snapshot(material.stencil));
    Object.assign(material.stencil, {
      enabled: true, mask: PRESSURE_GARMENT_STENCIL_BIT,
      func: Constants.ALWAYS, backFunc: Constants.ALWAYS,
      funcRef: PRESSURE_GARMENT_STENCIL_BIT, funcMask: PRESSURE_GARMENT_STENCIL_BIT,
      opStencilFail: Constants.KEEP, opDepthFail: Constants.KEEP, opStencilDepthPass: Constants.REPLACE,
      backOpStencilFail: Constants.KEEP, backOpDepthFail: Constants.KEEP, backOpStencilDepthPass: Constants.REPLACE,
    } satisfies StencilSnapshot);
  }
}
