import { useId } from "react";
import { office2dCharacterForAvatarSkin } from "./office2d-avatar-role";
import { OFFICE2D_CHARACTER_ROWS, office2dPreviewUrl, type Office2dCharacterKey } from "./office2d-sprite-catalog";
import type { StudioVirtualSpaceFacing } from "../studio-virtual-space-model";

/** 기본 2D 월드와 같은 직군의 정지 프레임을 작은 4방향 시트로 표시한다. */
export function Office2dAvatarPreview({ avatarIndex, identity, facing = "down", className }: {
  readonly avatarIndex: number;
  readonly identity: string;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly className?: string;
}) {
  return <Office2dCharacterPreview character={office2dCharacterForAvatarSkin(avatarIndex, identity)} facing={facing} className={className} />;
}

/** 사용자·NPC가 월드에서 공유하는 직군 원본을 상태창과 대화창에서도 재사용한다. */
export function Office2dCharacterPreview({ character, facing = "down", crop = "frame", className, alt = "" }: {
  readonly character: Office2dCharacterKey;
  readonly facing?: StudioVirtualSpaceFacing;
  readonly crop?: "frame" | "bust";
  readonly className?: string;
  readonly alt?: string;
}) {
  const clipId = useId();
  const frame = { x: OFFICE2D_CHARACTER_ROWS[facing] * 96, y: 0, width: 96, height: 144 };
  const bust = crop === "bust";
  const height = bust ? frame.height * .54 : frame.height;
  const width = bust ? Math.min(frame.width, height * 1.3) : frame.width;
  const view = { x: frame.x + (frame.width - width) / 2, y: frame.y + (bust ? frame.height * .04 : 0), width, height };
  return <svg className={["studio-character-preview", className].filter(Boolean).join(" ")} viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
    preserveAspectRatio={bust ? "xMidYMid slice" : "xMidYMax meet"} overflow="hidden" aria-hidden={!alt || undefined}
    role={alt ? "img" : undefined} aria-label={alt || undefined} focusable="false" data-office-character={character} data-character-crop={crop}>
    <defs><clipPath id={clipId}><rect {...view} /></clipPath></defs>
    <image href={office2dPreviewUrl(character)} width={384} height={144} clipPath={`url(#${clipId})`} />
  </svg>;
}
