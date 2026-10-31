/** 필압 외곽선 자원과 키트 피부의 native 깊이 정책을 같은 리그 수명으로 관리한다. */
import { KitOutlineDepthController } from "./kit-outline-depth";
import { PressureOutlineController } from "./pressure-outline";

import type { CharacterRig } from "./character-rig";
import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

export class CharacterOutlineController {
  private readonly pressure: PressureOutlineController;
  private readonly nativeDepth: KitOutlineDepthController;

  constructor(private readonly scene: Scene, white: BaseTexture) {
    this.pressure = new PressureOutlineController(scene, white);
    this.nativeDepth = new KitOutlineDepthController(scene);
  }

  sync(rig: CharacterRig, pressure: boolean, width: number, nativeHull: boolean): void {
    this.pressure.sync(rig, pressure, width);
    this.nativeDepth.sync(rig, nativeHull);
  }

  release(rig: CharacterRig): void {
    this.nativeDepth.sync(rig, false);
    this.pressure.release(rig);
  }

  meshesFor(rig: CharacterRig): Mesh[] {
    return this.pressure.meshesFor(rig);
  }

  /** 준비 실패·draw 예외에도 원래 의상 stencil을 다음 프레임 전에 복원한다. */
  renderScene(): void {
    try { this.scene.render(); } finally { this.pressure.restorePending(); }
  }

  dispose(): void {
    this.pressure.dispose();
    this.nativeDepth.dispose();
  }
}
