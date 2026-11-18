/** 손·머리·무대 소품 슬롯의 활성 선택과 리그 핸들을 관리한다. 엔진의 직렬 실행·자원 갱신 경계는 host에 위임한다. */
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

interface ScenePropHost {
  readonly assertAlive: () => void;
  readonly runExclusive: (operation: () => Promise<void>) => Promise<void>;
  readonly readRig: () => CharacterRig | null;
  readonly loadDeps: () => ScenePropLoadDeps;
  readonly disposePassMaterials: (partId: number) => void;
  readonly releasePart: (rig: CharacterRig, part: RigPart) => void;
  readonly refresh: (rig: CharacterRig) => Promise<void>;
}

export interface ScenePropController {
  hasActive(): boolean;
  syncActive(rig: CharacterRig): Promise<void>;
  detach(rig: CharacterRig | null): void;
  setHandProp(attachment: HandPropAttachment | null): Promise<void>;
  setHeadProp(attachment: HeadPropAttachment | null): Promise<void>;
  setStageProp(attachment: StagePropAttachment | null): Promise<void>;
}

export function createScenePropController(host: ScenePropHost): ScenePropController {
  let activeHandProp: HandPropAttachment | null = null;
  let handPropHandle: HandPropHandle | null = null;
  let activeHeadProp: HeadPropAttachment | null = null;
  let headPropHandle: HeadPropHandle | null = null;
  let activeStageProp: StagePropAttachment | null = null;
  let stagePropHandle: StagePropHandle | null = null;

  const detachHandPropFromRig = (rig: CharacterRig | null): void => {
    const handle = handPropHandle;
    if (!handle) return;
    handPropHandle = null;
    host.disposePassMaterials(HAND_PROP_PART_ID);
    if (rig) host.releasePart(rig, handle.part);
    handle.dispose();
  };

  const detachHeadPropFromRig = (rig: CharacterRig | null): void => {
    const handle = headPropHandle;
    if (!handle) return;
    headPropHandle = null;
    host.disposePassMaterials(HEAD_PROP_PART_ID);
    if (rig) host.releasePart(rig, handle.part);
    handle.dispose();
  };

  const detachStagePropFromRig = (rig: CharacterRig | null): void => {
    const handle = stagePropHandle;
    if (!handle) return;
    stagePropHandle = null;
    host.disposePassMaterials(STAGE_PROP_PART_ID);
    if (rig) host.releasePart(rig, handle.part);
    handle.dispose();
  };

  const syncActiveHandPropToRig = async (rig: CharacterRig): Promise<void> => {
    detachHandPropFromRig(rig);
    if (!activeHandProp) return;
    handPropHandle = await attachHandPropToRig(rig, activeHandProp, host.loadDeps());
  };

  const syncActiveHeadPropToRig = async (rig: CharacterRig): Promise<void> => {
    detachHeadPropFromRig(rig);
    if (!activeHeadProp) return;
    headPropHandle = await attachHeadPropToRig(rig, activeHeadProp, host.loadDeps());
  };

  const syncActiveStagePropToRig = async (rig: CharacterRig): Promise<void> => {
    detachStagePropFromRig(rig);
    if (!activeStageProp) return;
    stagePropHandle = await attachStagePropToRig(rig, activeStageProp, host.loadDeps());
  };

  return {
    hasActive: () => Boolean(activeHandProp || activeHeadProp || activeStageProp),
    async syncActive(rig) {
      if (activeHandProp) await syncActiveHandPropToRig(rig);
      if (activeHeadProp) await syncActiveHeadPropToRig(rig);
      if (activeStageProp) await syncActiveStagePropToRig(rig);
    },
    detach(rig) {
      detachHandPropFromRig(rig);
      detachHeadPropFromRig(rig);
      detachStagePropFromRig(rig);
    },
    setHandProp(attachment) {
      host.assertAlive();
      return host.runExclusive(async () => {
        host.assertAlive();
        activeHandProp = attachment;
        const rig = host.readRig();
        if (!rig) return;
        await syncActiveHandPropToRig(rig);
        await host.refresh(rig);
      });
    },
    setHeadProp(attachment) {
      host.assertAlive();
      return host.runExclusive(async () => {
        host.assertAlive();
        activeHeadProp = attachment;
        const rig = host.readRig();
        if (!rig) return;
        await syncActiveHeadPropToRig(rig);
        await host.refresh(rig);
      });
    },
    setStageProp(attachment) {
      host.assertAlive();
      return host.runExclusive(async () => {
        host.assertAlive();
        activeStageProp = attachment;
        const rig = host.readRig();
        if (!rig) return;
        await syncActiveStagePropToRig(rig);
        await host.refresh(rig);
      });
    },
  };
}
