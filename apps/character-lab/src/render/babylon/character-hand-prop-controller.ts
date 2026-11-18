/** 선택한 손 소품과 리그별 핸들을 소유한다. 호출 순서의 직렬화는 엔진이 담당한다. */
import { rigWithParts } from "./engine-io";
import { HAND_PROP_PART_ID, attachHandPropToRig } from "./hand-prop-attachment";
import { adaptLoadedMaterial } from "./materials/material-factory";

import type { BetaController } from "./beta-controller";
import type { CharacterRig } from "./character-rig";
import type { HandPropHandle } from "./hand-prop-attachment";
import type { MaterialFactoryOptions } from "./materials/material-factory";
import type { HandPropAttachment } from "../../contracts";
import type { Scene } from "@babylonjs/core/scene.js";

interface CharacterHandPropDeps {
  readonly scene: Scene;
  readonly beta: Pick<BetaController, "releaseRig">;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly materialOptions: () => MaterialFactoryOptions;
  readonly disposePassMaterials: (partId: number) => void;
  readonly verifyIntegrity: boolean;
  readonly now: () => number;
}

export class CharacterHandPropController {
  private attachment: HandPropAttachment | null = null;
  private handle: HandPropHandle | null = null;

  constructor(private readonly deps: CharacterHandPropDeps) {}

  get hasAttachment(): boolean {
    return this.attachment !== null;
  }

  async set(attachment: HandPropAttachment | null, rig: CharacterRig | null): Promise<void> {
    this.attachment = attachment;
    if (rig) await this.sync(rig);
  }

  /** 리그 해제 시에도 선택은 남겨 두어 다음 소스에 다시 부착한다. */
  detach(rig: CharacterRig | null): void {
    const handle = this.handle;
    if (!handle) return;
    this.handle = null;
    this.deps.disposePassMaterials(HAND_PROP_PART_ID);
    if (rig) this.deps.beta.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  async sync(rig: CharacterRig): Promise<void> {
    this.detach(rig);
    if (!this.attachment) return;
    const materialOptions = this.deps.materialOptions();
    this.handle = await attachHandPropToRig(rig, this.attachment, {
      scene: this.deps.scene,
      fetchBytes: this.deps.fetchBytes,
      adaptMaterial: (role, mesh) => adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
      verifyIntegrity: this.deps.verifyIntegrity,
      now: this.deps.now(),
    });
  }
}
