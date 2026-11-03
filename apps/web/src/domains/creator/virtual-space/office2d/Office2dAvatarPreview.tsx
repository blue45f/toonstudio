import { useId } from "react";
import { office2dCharacterForAvatarSkin } from "./office2d-avatar-role";
import { office2dGeneratedAtlas } from "./office2d-generated-atlases";
import { OFFICE2D_CHARACTER_CELL, OFFICE2D_CHARACTER_ROWS, office2dCharacterUrl } from "./office2d-sprite-catalog";
import type { StudioVirtualSpaceFacing } from "../studio-virtual-space-model";

/** 기본 2D 월드와 같은 직군 배정·원본 atlas에서 정지 프레임 하나만 표시한다. */
export function Office2dAvatarPreview({ avatarIndex, identity, facing = "down" }: {
  readonly avatarIndex: number;
  readonly identity: string;
  readonly facing?: StudioVirtualSpaceFacing;
}) {
  const clipId = useId();
  const character = office2dCharacterForAvatarSkin(avatarIndex, identity);
  const atlas = office2dGeneratedAtlas(character, "walk");
  const row = OFFICE2D_CHARACTER_ROWS[facing];
  const frame = atlas?.frames[row * atlas.columns]?.source ?? {
    x: 0, y: row * OFFICE2D_CHARACTER_CELL.height, ...OFFICE2D_CHARACTER_CELL,
  };
  return <svg className="studio-character-preview" viewBox={`${frame.x} ${frame.y} ${frame.width} ${frame.height}`}
    preserveAspectRatio="xMidYMax meet" overflow="hidden" aria-hidden focusable="false" data-office-character={character}>
    <defs><clipPath id={clipId}><rect {...frame} /></clipPath></defs>
    <image href={office2dCharacterUrl(character)} width={atlas?.width ?? OFFICE2D_CHARACTER_CELL.width * 9}
      height={atlas?.height ?? OFFICE2D_CHARACTER_CELL.height * 4} clipPath={`url(#${clipId})`} />
  </svg>;
}
