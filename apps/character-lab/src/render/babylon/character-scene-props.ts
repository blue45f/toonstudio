/** 활성 손·머리·무대 소품의 핸들과 재장착·해제를 엔진 직렬 실행 경계 안에서 관리한다. */
import { rigWithParts } from "./engine-io";
import {
  HAND_PROP_PART_ID, HEAD_PROP_PART_ID, STAGE_PROP_PART_ID,
  attachHandPropToRig, attachHeadPropToRig, attachStagePropToRig,
} from "./hand-prop-attachment";

import type { CharacterRig } from "./character-rig";
import type { HandPropHandle, HeadPropHandle, ScenePropLoadDeps, StagePropHandle } from "./hand-prop-attachment";
import type { HandPropAttachment, HeadPropAttachment, StagePropAttachment } from "../../contracts";

interface ScenePropControllerDeps {
  readonly rig: () => CharacterRig | null;
  readonly loadDeps: () => ScenePropLoadDeps;
  readonly assertAlive: () => void;
  readonly runExclusive: (task: () => Promise<void>) => Promise<void>;
  readonly disposePassMaterials: (partId: number) => void;
  readonly releaseRig: (rig: CharacterRig) => void;
  readonly finalize: (rig: CharacterRig) => Promise<void>;
}

export class CharacterScenePropController {
  private activeHandProp: HandPropAttachment | null = null;
  private handPropHandle: HandPropHandle | null = null;
  private activeHeadProp: HeadPropAttachment | null = null;
  private headPropHandle: HeadPropHandle | null = null;
  private activeStageProp: StagePropAttachment | null = null;
  private stagePropHandle: StagePropHandle | null = null;
  private readonly deps: ScenePropControllerDeps;

  constructor(deps: ScenePropControllerDeps) {
    this.deps = deps;
  }

  hasActive(): boolean {
    return Boolean(this.activeHandProp || this.activeHeadProp || this.activeStageProp);
  }

  async reattach(rig: CharacterRig): Promise<void> {
    if (this.activeHandProp) await this.syncActiveHandPropToRig(rig);
    if (this.activeHeadProp) await this.syncActiveHeadPropToRig(rig);
    if (this.activeStageProp) await this.syncActiveStagePropToRig(rig);
  }

  detach(rig: CharacterRig): void {
    this.detachHandPropFromRig(rig);
    this.detachHeadPropFromRig(rig);
    this.detachStagePropFromRig(rig);
  }

  private detachHandPropFromRig(rig: CharacterRig | null): void {
    const handle = this.handPropHandle;
    if (!handle) return;
    this.handPropHandle = null;
    this.deps.disposePassMaterials(HAND_PROP_PART_ID);
    if (rig) this.deps.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  private detachHeadPropFromRig(rig: CharacterRig | null): void {
    const handle = this.headPropHandle;
    if (!handle) return;
    this.headPropHandle = null;
    this.deps.disposePassMaterials(HEAD_PROP_PART_ID);
    if (rig) this.deps.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  private detachStagePropFromRig(rig: CharacterRig | null): void {
    const handle = this.stagePropHandle;
    if (!handle) return;
    this.stagePropHandle = null;
    this.deps.disposePassMaterials(STAGE_PROP_PART_ID);
    if (rig) this.deps.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  private async syncActiveHandPropToRig(rig: CharacterRig): Promise<void> {
    this.detachHandPropFromRig(rig);
    if (!this.activeHandProp) return;
    this.handPropHandle = await attachHandPropToRig(rig, this.activeHandProp, this.deps.loadDeps());
  }

  private async syncActiveHeadPropToRig(rig: CharacterRig): Promise<void> {
    this.detachHeadPropFromRig(rig);
    if (!this.activeHeadProp) return;
    this.headPropHandle = await attachHeadPropToRig(rig, this.activeHeadProp, this.deps.loadDeps());
  }

  private async syncActiveStagePropToRig(rig: CharacterRig): Promise<void> {
    this.detachStagePropFromRig(rig);
    if (!this.activeStageProp) return;
    this.stagePropHandle = await attachStagePropToRig(rig, this.activeStageProp, this.deps.loadDeps());
  }

  async setHandProp(attachment: HandPropAttachment | null): Promise<void> {
    this.deps.assertAlive();
    return this.deps.runExclusive(async () => {
      this.deps.assertAlive();
      this.activeHandProp = attachment;
      const rig = this.deps.rig();
      if (!rig) return;
      await this.syncActiveHandPropToRig(rig);
      await this.deps.finalize(rig);
    });
  }

  async setHeadProp(attachment: HeadPropAttachment | null): Promise<void> {
    this.deps.assertAlive();
    return this.deps.runExclusive(async () => {
      this.deps.assertAlive();
      this.activeHeadProp = attachment;
      const rig = this.deps.rig();
      if (!rig) return;
      await this.syncActiveHeadPropToRig(rig);
      await this.deps.finalize(rig);
    });
  }

  async setStageProp(attachment: StagePropAttachment | null): Promise<void> {
    this.deps.assertAlive();
    return this.deps.runExclusive(async () => {
      this.deps.assertAlive();
      this.activeStageProp = attachment;
      const rig = this.deps.rig();
      if (!rig) return;
      await this.syncActiveStagePropToRig(rig);
      await this.deps.finalize(rig);
    });
  }
}
