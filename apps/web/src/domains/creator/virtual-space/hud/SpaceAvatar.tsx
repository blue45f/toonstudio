import { Office2dAvatarPreview } from "../office2d/Office2dAvatarPreview";
import type { StudioVirtualStageKind } from "../office2d/studio-virtual-space-stage-mode";
import { memo } from "react";

import { cn } from "@/shared/lib/utils";

import { StudioVirtualCharacterPreview } from "../StudioVirtualCharacterPreview";
import { DEFAULT_STUDIO_VIRTUAL_ART_STYLE, type StudioVirtualArtStyleKey } from "../studio-virtual-space-art-style";
import type { StudioVirtualSpaceAppearanceClip } from "../studio-virtual-space-appearance";
import { resolveStudioCharacterAppearance, studioCharacterSkinForArtStyle, type StudioCharacterMotionState } from "../studio-virtual-space-character-skins";
import {
  STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  type StudioVirtualSpaceActivity,
  type StudioVirtualSpaceFacing,
  type StudioVirtualSpacePresenceState,
} from "../studio-virtual-space-model";

function motionForClip(clip: StudioVirtualSpaceAppearanceClip): StudioCharacterMotionState {
  return clip === "walk-down" || clip === "walk-up" || clip === "walk-left" || clip === "walk-right" ? "walk" : clip;
}

/** 도크·참가자 목록·근접 카드에 쓰는 원형 캐릭터 얼굴. 월드 스프라이트는 Canvas가 그린다. */
export const SpaceAvatar = memo(function SpaceAvatar({
  identity,
  stageKind,
  artStyle = DEFAULT_STUDIO_VIRTUAL_ART_STYLE,
  activity = "available",
  facing = "down",
  avatarIndex = STUDIO_VIRTUAL_SPACE_AUTO_AVATAR,
  appearance,
  self = false,
  size = "md",
}: {
  readonly identity: string;
  readonly stageKind?: StudioVirtualStageKind;
  readonly artStyle?: StudioVirtualArtStyleKey;
  readonly activity?: StudioVirtualSpaceActivity;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly avatarIndex?: number;
  readonly appearance?: StudioVirtualSpacePresenceState["appearance"];
  readonly self?: boolean;
  readonly size?: "sm" | "md" | "lg";
}) {
  const requestedMotion = activity === "reviewing" ? "review" : activity === "focused" ? "draw" : "idle";
  const { skin, clip } = resolveStudioCharacterAppearance({ avatarIndex, appearance }, identity, requestedMotion);
  const motion = motionForClip(clip);
  return <span className={cn("space-avatar", `space-avatar--${size}`, self && "space-avatar--self")} data-activity={activity} aria-hidden>
    {stageKind === "office2d" ? <Office2dAvatarPreview avatarIndex={avatarIndex} identity={identity} facing={facing} /> : <StudioVirtualCharacterPreview skin={studioCharacterSkinForArtStyle(skin, artStyle)} facing={facing} motion={motion} className="studio-vspace-reference-compact-player" />}
  </span>;
});
