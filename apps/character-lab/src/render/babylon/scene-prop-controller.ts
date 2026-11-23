/** 손·머리·무대 소품 · 3D 듀오 상대역 · 3D 효과음 스탬프 5개 슬롯의 활성 선택과 리그 핸들을 관리한다. 엔진의 직렬 실행·자원 갱신 경계는 host에 위임한다. */
import {
  HAND_PROP_PART_ID,
  HEAD_PROP_PART_ID,
  SFX_STAMP_PART_ID,
  STAGE_PROP_PART_ID,
  attachDuoPartnerToRig,
  attachHandPropToRig,
  attachHeadPropToRig,
  attachSfxStampToRig,
  attachStagePropToRig,
} from "./hand-prop-attachment";

import type {
  DuoPartnerAttachment,
  HandPropAttachment,
  HeadPropAttachment,
  SfxStampAttachment,
  StagePropAttachment,
} from "../../contracts";
import type { CharacterRig, RigPart } from "./character-rig";
import type {
  DuoPartnerHandle,
  HandPropHandle,
  HeadPropHandle,
  ScenePropLoadDeps,
  SfxStampHandle,
  StagePropHandle,
} from "./hand-prop-attachment";

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
  setDuoPartner(attachment: DuoPartnerAttachment | null): Promise<void>;
  setSfxStamp(attachment: SfxStampAttachment | null): Promise<void>;
}

export function createScenePropController(host: ScenePropHost): ScenePropController {
  let activeHandProp: HandPropAttachment | null = null;
  let handPropHandle: HandPropHandle | null = null;
  let activeHeadProp: HeadPropAttachment | null = null;
  let headPropHandle: HeadPropHandle | null = null;
  let activeStageProp: StagePropAttachment | null = null;
  let stagePropHandle: StagePropHandle | null = null;
  let activeDuoPartner: DuoPartnerAttachment | null = null;
  let duoPartnerHandle: DuoPartnerHandle | null = null;
  let activeSfxStamp: SfxStampAttachment | null = null;
  let sfxStampHandle: SfxStampHandle | null = null;

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

  const detachDuoPartnerFromRig = (rig: CharacterRig | null): void => {
    const handle = duoPartnerHandle;
    if (!handle) return;
    duoPartnerHandle = null;
    for (const part of handle.parts) {
      host.disposePassMaterials(part.partId);
      if (rig) host.releasePart(rig, part);
    }
    handle.dispose();
  };

  const detachSfxStampFromRig = (rig: CharacterRig | null): void => {
    const handle = sfxStampHandle;
    if (!handle) return;
    sfxStampHandle = null;
    host.disposePassMaterials(SFX_STAMP_PART_ID);
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

  const syncActiveDuoPartnerToRig = async (rig: CharacterRig): Promise<void> => {
    detachDuoPartnerFromRig(rig);
    if (!activeDuoPartner) return;
    duoPartnerHandle = await attachDuoPartnerToRig(rig, activeDuoPartner, host.loadDeps());
  };

  const syncActiveSfxStampToRig = async (rig: CharacterRig): Promise<void> => {
    detachSfxStampFromRig(rig);
    if (!activeSfxStamp) return;
    sfxStampHandle = await attachSfxStampToRig(rig, activeSfxStamp, host.loadDeps());
  };

  return {
    hasActive: () => Boolean(activeHandProp || activeHeadProp || activeStageProp || activeDuoPartner || activeSfxStamp),
    async syncActive(rig) {
      if (activeHandProp) await syncActiveHandPropToRig(rig);
      if (activeHeadProp) await syncActiveHeadPropToRig(rig);
      if (activeStageProp) await syncActiveStagePropToRig(rig);
      if (activeDuoPartner) await syncActiveDuoPartnerToRig(rig);
      if (activeSfxStamp) await syncActiveSfxStampToRig(rig);
    },
    detach(rig) {
      detachHandPropFromRig(rig);
      detachHeadPropFromRig(rig);
      detachStagePropFromRig(rig);
      detachDuoPartnerFromRig(rig);
      detachSfxStampFromRig(rig);
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
    setDuoPartner(attachment) {
      host.assertAlive();
      return host.runExclusive(async () => {
        host.assertAlive();
        activeDuoPartner = attachment;
        const rig = host.readRig();
        if (!rig) return;
        await syncActiveDuoPartnerToRig(rig);
        await host.refresh(rig);
      });
    },
    setSfxStamp(attachment) {
      host.assertAlive();
      return host.runExclusive(async () => {
        host.assertAlive();
        activeSfxStamp = attachment;
        const rig = host.readRig();
        if (!rig) return;
        await syncActiveSfxStampToRig(rig);
        await host.refresh(rig);
      });
    },
  };
}
