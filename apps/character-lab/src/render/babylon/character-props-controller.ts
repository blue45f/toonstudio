/** 손·머리·스테이지 소품 선택과 리그 부착 핸들의 수명주기를 보관한다. 엔진이 직렬 실행과 렌더 상태 갱신을 맡는다. */
import {
  HAND_PROP_PART_ID,
  HEAD_PROP_PART_ID,
  STAGE_PROP_PART_ID,
  attachHandPropToRig,
  attachHeadPropToRig,
  attachStagePropToRig,
} from "./hand-prop-attachment";

import type { CharacterRig, RigPart } from "./character-rig";
import type { HandPropHandle, HeadPropHandle, ScenePropLoadDeps, StagePropHandle } from "./hand-prop-attachment";
import type { HandPropAttachment, HeadPropAttachment, StagePropAttachment } from "../../contracts";

interface CharacterPropsDeps {
  readonly load: () => ScenePropLoadDeps;
  readonly release: (rig: CharacterRig | null, part: RigPart, partId: number) => void;
}

export class CharacterPropsController {
  private activeHandProp: HandPropAttachment | null = null;
  private handPropHandle: HandPropHandle | null = null;
  private activeHeadProp: HeadPropAttachment | null = null;
  private headPropHandle: HeadPropHandle | null = null;
  private activeStageProp: StagePropAttachment | null = null;
  private stagePropHandle: StagePropHandle | null = null;

  constructor(private readonly deps: CharacterPropsDeps) {}

  hasActive(): boolean {
    return this.activeHandProp !== null || this.activeHeadProp !== null || this.activeStageProp !== null;
  }

  async reattach(rig: CharacterRig): Promise<void> {
    if (this.activeHandProp) await this.syncActiveHandPropToRig(rig);
    if (this.activeHeadProp) await this.syncActiveHeadPropToRig(rig);
    if (this.activeStageProp) await this.syncActiveStagePropToRig(rig);
  }

  detach(rig: CharacterRig | null): void {
    this.detachHandPropFromRig(rig);
    this.detachHeadPropFromRig(rig);
    this.detachStagePropFromRig(rig);
  }

  async setHandProp(attachment: HandPropAttachment | null, rig: CharacterRig | null): Promise<void> {
    this.activeHandProp = attachment;
    if (rig) await this.syncActiveHandPropToRig(rig);
  }

  async setHeadProp(attachment: HeadPropAttachment | null, rig: CharacterRig | null): Promise<void> {
    this.activeHeadProp = attachment;
    if (rig) await this.syncActiveHeadPropToRig(rig);
  }

  async setStageProp(attachment: StagePropAttachment | null, rig: CharacterRig | null): Promise<void> {
    this.activeStageProp = attachment;
    if (rig) await this.syncActiveStagePropToRig(rig);
  }

  private detachHandPropFromRig(rig: CharacterRig | null): void {
    const handle = this.handPropHandle;
    if (!handle) return;
    this.handPropHandle = null;
    this.deps.release(rig, handle.part, HAND_PROP_PART_ID);
    handle.dispose();
  }

  private detachHeadPropFromRig(rig: CharacterRig | null): void {
    const handle = this.headPropHandle;
    if (!handle) return;
    this.headPropHandle = null;
    this.deps.release(rig, handle.part, HEAD_PROP_PART_ID);
    handle.dispose();
  }

  private detachStagePropFromRig(rig: CharacterRig | null): void {
    const handle = this.stagePropHandle;
    if (!handle) return;
    this.stagePropHandle = null;
    this.deps.release(rig, handle.part, STAGE_PROP_PART_ID);
    handle.dispose();
  }

  private async syncActiveHandPropToRig(rig: CharacterRig): Promise<void> {
    this.detachHandPropFromRig(rig);
    if (!this.activeHandProp) return;
    this.handPropHandle = await attachHandPropToRig(rig, this.activeHandProp, this.deps.load());
  }

  private async syncActiveHeadPropToRig(rig: CharacterRig): Promise<void> {
    this.detachHeadPropFromRig(rig);
    if (!this.activeHeadProp) return;
    this.headPropHandle = await attachHeadPropToRig(rig, this.activeHeadProp, this.deps.load());
  }

  private async syncActiveStagePropToRig(rig: CharacterRig): Promise<void> {
    this.detachStagePropFromRig(rig);
    if (!this.activeStageProp) return;
    this.stagePropHandle = await attachStagePropToRig(rig, this.activeStageProp, this.deps.load());
  }
}
