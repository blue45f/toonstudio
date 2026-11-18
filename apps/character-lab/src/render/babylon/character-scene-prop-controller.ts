/** 세 소품 슬롯의 상태·핸들 수명을 관리하고 엔진의 기존 직렬 큐와 재질 갱신 순서를 사용한다. */
import { rigWithParts } from "./engine-io";
import {
  HAND_PROP_PART_ID,
  HEAD_PROP_PART_ID,
  STAGE_PROP_PART_ID,
  attachHandPropToRig,
  attachHeadPropToRig,
  attachStagePropToRig,
} from "./hand-prop-attachment";
import { adaptLoadedMaterial } from "./materials/material-factory";

import type { CharacterRig } from "./character-rig";
import type { HandPropHandle, HeadPropHandle, ScenePropLoadDeps, StagePropHandle } from "./hand-prop-attachment";
import type { MaterialFactoryOptions } from "./materials/material-factory";
import type { HandPropAttachment, HeadPropAttachment, StagePropAttachment } from "../../contracts";
import type { Scene } from "@babylonjs/core/scene.js";

export function createScenePropLoadDeps(
  materialOptions: MaterialFactoryOptions,
  scene: Scene,
  fetchBytes: (url: string) => Promise<Uint8Array>,
  verifyIntegrity: boolean,
  now: number,
): ScenePropLoadDeps {
  return {
    scene,
    fetchBytes,
    adaptMaterial: (role, mesh) => adaptLoadedMaterial(materialOptions, mesh.material, role, `mat:${mesh.name}`).material,
    verifyIntegrity,
    now,
  };
}

interface ScenePropHost {
  readonly assertAlive: () => void;
  readonly runExclusive: (task: () => Promise<void>) => Promise<void>;
  readonly rig: () => CharacterRig | null;
  readonly loadDeps: () => ScenePropLoadDeps;
  readonly disposePassMaterials: (partId: number) => void;
  readonly releaseRig: (rig: CharacterRig) => void;
  readonly finalizeRigPropRefresh: (rig: CharacterRig) => Promise<void>;
}

export class CharacterScenePropController {
  activeHandProp: HandPropAttachment | null = null;
  private handPropHandle: HandPropHandle | null = null;
  activeHeadProp: HeadPropAttachment | null = null;
  private headPropHandle: HeadPropHandle | null = null;
  activeStageProp: StagePropAttachment | null = null;
  private stagePropHandle: StagePropHandle | null = null;

  constructor(private readonly host: ScenePropHost) {}

  detachHandPropFromRig(rig: CharacterRig | null): void {
    const handle = this.handPropHandle;
    if (!handle) return;
    this.handPropHandle = null;
    this.host.disposePassMaterials(HAND_PROP_PART_ID);
    if (rig) this.host.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  detachHeadPropFromRig(rig: CharacterRig | null): void {
    const handle = this.headPropHandle;
    if (!handle) return;
    this.headPropHandle = null;
    this.host.disposePassMaterials(HEAD_PROP_PART_ID);
    if (rig) this.host.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  detachStagePropFromRig(rig: CharacterRig | null): void {
    const handle = this.stagePropHandle;
    if (!handle) return;
    this.stagePropHandle = null;
    this.host.disposePassMaterials(STAGE_PROP_PART_ID);
    if (rig) this.host.releaseRig(rigWithParts(rig, [handle.part]));
    handle.dispose();
  }

  async syncActiveHandPropToRig(rig: CharacterRig): Promise<void> {
    this.detachHandPropFromRig(rig);
    if (!this.activeHandProp) return;
    this.handPropHandle = await attachHandPropToRig(rig, this.activeHandProp, this.host.loadDeps());
  }

  async syncActiveHeadPropToRig(rig: CharacterRig): Promise<void> {
    this.detachHeadPropFromRig(rig);
    if (!this.activeHeadProp) return;
    this.headPropHandle = await attachHeadPropToRig(rig, this.activeHeadProp, this.host.loadDeps());
  }

  async syncActiveStagePropToRig(rig: CharacterRig): Promise<void> {
    this.detachStagePropFromRig(rig);
    if (!this.activeStageProp) return;
    this.stagePropHandle = await attachStagePropToRig(rig, this.activeStageProp, this.host.loadDeps());
  }

  async setHandProp(attachment: HandPropAttachment | null): Promise<void> {
    this.host.assertAlive();
    return this.host.runExclusive(async () => {
      this.host.assertAlive();
      this.activeHandProp = attachment;
      const rig = this.host.rig();
      if (!rig) return;
      await this.syncActiveHandPropToRig(rig);
      await this.host.finalizeRigPropRefresh(rig);
    });
  }

  async setHeadProp(attachment: HeadPropAttachment | null): Promise<void> {
    this.host.assertAlive();
    return this.host.runExclusive(async () => {
      this.host.assertAlive();
      this.activeHeadProp = attachment;
      const rig = this.host.rig();
      if (!rig) return;
      await this.syncActiveHeadPropToRig(rig);
      await this.host.finalizeRigPropRefresh(rig);
    });
  }

  async setStageProp(attachment: StagePropAttachment | null): Promise<void> {
    this.host.assertAlive();
    return this.host.runExclusive(async () => {
      this.host.assertAlive();
      this.activeStageProp = attachment;
      const rig = this.host.rig();
      if (!rig) return;
      await this.syncActiveStagePropToRig(rig);
      await this.host.finalizeRigPropRefresh(rig);
    });
  }
}
