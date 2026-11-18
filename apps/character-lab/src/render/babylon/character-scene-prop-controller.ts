/** 손·머리·무대 소품의 선택과 리그별 핸들을 소유한다. 호출 직렬화는 엔진이 담당한다. */
import { rigWithParts } from "./engine-io";
import {
  HAND_PROP_PART_ID, HEAD_PROP_PART_ID, STAGE_PROP_PART_ID,
  attachHandPropToRig, attachHeadPropToRig, attachStagePropToRig,
} from "./hand-prop-attachment";
import { adaptLoadedMaterial } from "./materials/material-factory";

import type { BetaController } from "./beta-controller";
import type { CharacterRig, RigPart } from "./character-rig";
import type { ScenePropLoadDeps } from "./hand-prop-attachment";
import type { MaterialFactoryOptions } from "./materials/material-factory";
import type { HandPropAttachment, HeadPropAttachment, StagePropAttachment } from "../../contracts";
import type { Scene } from "@babylonjs/core/scene.js";

export interface ScenePropAttachments {
  readonly hand: HandPropAttachment;
  readonly head: HeadPropAttachment;
  readonly stage: StagePropAttachment;
}

interface CharacterScenePropDeps {
  readonly scene: Scene;
  readonly beta: Pick<BetaController, "releaseRig">;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly materialOptions: () => MaterialFactoryOptions;
  readonly disposePassMaterials: (partId: number) => void;
  readonly refreshRig: (rig: CharacterRig) => Promise<void>;
  readonly verifyIntegrity: boolean;
  readonly now: () => number;
}

interface ScenePropHandle {
  readonly part: RigPart;
  dispose(): void;
}

class ScenePropSlot<TAttachment> {
  private attachment: TAttachment | null = null;
  private handle: ScenePropHandle | null = null;

  constructor(
    private readonly partId: number,
    private readonly attach: (rig: CharacterRig, attachment: TAttachment, deps: ScenePropLoadDeps) => Promise<ScenePropHandle>,
    private readonly deps: CharacterScenePropDeps,
  ) {}

  get hasAttachment(): boolean {
    return this.attachment !== null;
  }

  async set(attachment: TAttachment | null, rig: CharacterRig | null): Promise<void> {
    this.attachment = attachment;
    if (rig) await this.sync(rig);
  }

  /** 리그 해제 시에도 선택은 남겨 두어 다음 소스에 다시 부착한다. */
  detach(rig: CharacterRig | null): void {
    const handle = this.handle;
    if (!handle) return;
    this.handle = null;
    this.deps.disposePassMaterials(this.partId);
    if (rig) this.deps.beta.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  async sync(rig: CharacterRig): Promise<void> {
    this.detach(rig);
    if (!this.attachment) return;
    const materialOptions = this.deps.materialOptions();
    this.handle = await this.attach(rig, this.attachment, {
      scene: this.deps.scene,
      fetchBytes: this.deps.fetchBytes,
      adaptMaterial: (role, mesh) => adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
      verifyIntegrity: this.deps.verifyIntegrity,
      now: this.deps.now(),
    });
  }
}

export class CharacterScenePropController {
  private readonly slots: { readonly [K in keyof ScenePropAttachments]: ScenePropSlot<ScenePropAttachments[K]> };

  constructor(private readonly deps: CharacterScenePropDeps) {
    this.slots = {
      hand: new ScenePropSlot(HAND_PROP_PART_ID, attachHandPropToRig, deps),
      head: new ScenePropSlot(HEAD_PROP_PART_ID, attachHeadPropToRig, deps),
      stage: new ScenePropSlot(STAGE_PROP_PART_ID, attachStagePropToRig, deps),
    };
  }

  get hasAttachment(): boolean {
    return Object.values(this.slots).some((slot) => slot.hasAttachment);
  }

  async set<K extends keyof ScenePropAttachments>(kind: K, attachment: ScenePropAttachments[K] | null, rig: CharacterRig | null): Promise<void> {
    await this.slots[kind].set(attachment, rig);
    if (rig) await this.deps.refreshRig(rig);
  }

  detach(rig: CharacterRig | null): void {
    for (const slot of Object.values(this.slots)) slot.detach(rig);
  }

  /** 새 리그에는 손·머리·무대 순으로 복원하고, 실패는 엔진의 기존 오류 처리로 전달한다. */
  async sync(rig: CharacterRig): Promise<void> {
    for (const slot of Object.values(this.slots)) {
      if (slot.hasAttachment) await slot.sync(rig);
    }
  }
}
