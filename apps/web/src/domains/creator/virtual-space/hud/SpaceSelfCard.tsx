import type { StudioVirtualStageKind } from "../office2d/studio-virtual-space-stage-mode";
import type { StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import { memo } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

import type { StudioVirtualSpacePresenceState } from "../studio-virtual-space-model";
import { SpaceAvatar } from "./SpaceAvatar";
import {
  spaceActiveDccOptionById,
  spaceCompanionOptionById,
  spaceStatusHatOptionById,
  spaceStatusOption,
  spaceStatusUrgencyOptionById,
  useSpaceStatusExtras,
  type SpaceActiveDccId,
  type SpaceCompanionId,
  type SpaceStatusHatId,
  type SpaceStatusUrgency,
} from "./space-dock-model";

/** 참가자 탭 맨 위의 내 카드: 얼굴·이름·상태·현재 위치·동행 펫(WorkAdventure)·긴급도(oVice)·상태 모자(Teemyco)·창작 툴(Tandem)과 캐릭터 바꾸기. */
export const SpaceSelfCard = memo(function SpaceSelfCard({
  identity, name, self, artStyle, stageKind, zoneLabelKo, zoneLabelEn, onEditCharacter, roleLabelKo, roleLabelEn, companionId, statusUrgency, statusHatId, activeDccId,
}: {
  readonly identity: string;
  readonly name: string;
  readonly stageKind?: StudioVirtualStageKind;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly self: Pick<StudioVirtualSpacePresenceState, "activity" | "avatarIndex" | "appearance" | "userStatus">;
  readonly zoneLabelKo: string;
  readonly zoneLabelEn: string;
  readonly onEditCharacter: () => void;
  /** 내 직군 표시명 (커스텀 라벨 우선). 직군이 없으면 배지를 그리지 않는다. */
  readonly roleLabelKo?: string | null;
  readonly roleLabelEn?: string | null;
  readonly companionId?: SpaceCompanionId;
  readonly statusUrgency?: SpaceStatusUrgency;
  readonly statusHatId?: SpaceStatusHatId;
  readonly activeDccId?: SpaceActiveDccId;
}) {
  const bt = useBilingual("SpaceSelfCard");
  const extras = useSpaceStatusExtras();
  const status = spaceStatusOption(self.activity, self.userStatus);
  const companion = spaceCompanionOptionById(companionId ?? extras.companionId);
  const urgency = spaceStatusUrgencyOptionById(statusUrgency ?? extras.statusUrgency);
  const hat = spaceStatusHatOptionById(statusHatId ?? extras.statusHatId);
  const dcc = spaceActiveDccOptionById(activeDccId ?? extras.activeDccId);
  return <section className="space-panel-section space-self-card" aria-label={bt("나", "Me")}>
    <SpaceAvatar stageKind={stageKind} artStyle={artStyle} identity={identity} activity={self.activity} avatarIndex={self.avatarIndex} appearance={self.appearance} self size="lg" />
    <div>
      <strong>{name} · {bt("나", "Me")}{roleLabelKo ? <span className="space-self-card__role">{bt(roleLabelKo, roleLabelEn ?? roleLabelKo)}</span> : null}</strong>
      <small><span className="space-status-dot" data-activity={self.activity} data-status={status.id} aria-hidden />{bt(status.labelKo, status.labelEn)}
        {urgency.id !== "normal" ? ` · ${urgency.badge} ${bt(urgency.labelKo, urgency.labelEn)}` : null}
        {hat.id !== "none" ? ` · ${hat.emoji} ${bt(hat.labelKo, hat.labelEn)}` : null}
        {dcc.id !== "none" ? ` · ${dcc.badge} ${bt(dcc.labelKo, dcc.labelEn)}` : null}
        {companion.id !== "none" ? ` · ${companion.emoji} ${bt(companion.labelKo, companion.labelEn)}` : null}
        {zoneLabelKo ? ` · ${bt(zoneLabelKo, zoneLabelEn)}` : null}</small>
    </div>
    <button type="button" className="space-pill-button" onClick={onEditCharacter}>{bt("캐릭터 바꾸기", "Change character")}</button>
  </section>;
});
