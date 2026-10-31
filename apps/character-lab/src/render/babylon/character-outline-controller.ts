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

  constructor(scene: Scene, white: BaseTexture) {
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

  dispose(): void {
    this.pressure.dispose();
    this.nativeDepth.dispose();
  }
}
