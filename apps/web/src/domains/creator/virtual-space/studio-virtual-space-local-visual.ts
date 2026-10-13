/**
 * 내 캐릭터 비주얼 생성 팩토리 (캔버스 장면 구축).
 *
 * 그림자·스프라이트·이름표를 스폰 지점에 세운다. 이동·포즈·연출은 캔버스가 소유하고,
 * 이 팩토리는 "처음 등장할 때의 모습"만 책임진다 (동료·NPC 팩토리와 같은 경계).
 */
import type * as Phaser from "phaser";

import {
  studioCharacterStaticAsset,
  type StudioCharacterTextureAsset,
} from "./studio-virtual-space-character-assets";
import type { StudioCharacterSkin } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { createStudioNameplateRenderer } from "./studio-virtual-space-nameplate-renderer";
import {
  STUDIO_ACTOR_SHADOW,
  STUDIO_CHARACTER_FOOT_ORIGIN,
  studioActorShadowSize,
} from "./studio-virtual-space-presentation";

type NameplateStyle = ReturnType<typeof createStudioNameplateRenderer>["nameplateStyle"];

export function createStudioLocalVisual(input: {
  readonly scene: Pick<Phaser.Scene, "add">;
  readonly point: StudioVirtualSpacePoint;
  readonly skin: StudioCharacterSkin;
  readonly facing: StudioVirtualSpaceFacing;
  readonly hasStaticAsset: (asset: StudioCharacterTextureAsset) => boolean;
  readonly fallbackAsset: StudioCharacterTextureAsset;
  readonly actorVisualScale: number;
  readonly gaitDistancePerCycle: number | undefined;
  readonly nameplateStyle: NameplateStyle;
  readonly displayName: string;
  readonly updateDisplaySize: (sprite: Phaser.GameObjects.Sprite) => void;
}): {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly label: Phaser.GameObjects.Text;
  readonly shadow: Phaser.GameObjects.Ellipse;
} {
  const { point } = input;
  const scale = input.actorVisualScale;
  const shadowSize = studioActorShadowSize(scale);
  const shadow = input.scene.add.ellipse(
    point.x, point.y + STUDIO_ACTOR_SHADOW.yOffset,
    shadowSize.width, shadowSize.height, STUDIO_ACTOR_SHADOW.color, STUDIO_ACTOR_SHADOW.alpha,
  ).setDepth(Math.round(point.y) + 990);
  const requestedAsset = studioCharacterStaticAsset(input.skin, input.facing);
  const initialAsset = input.hasStaticAsset(requestedAsset) ? requestedAsset : input.fallbackAsset;
  const sprite = input.scene.add.sprite(point.x, point.y, initialAsset.key, initialAsset.frame)
    .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
    .setData({
      visualWidth: 98 * scale, visualHeight: 131 * scale, assetOwner: "self",
      framePresentation: initialAsset.presentation,
      gaitDistancePerCycle: input.gaitDistancePerCycle,
    })
    .setDisplaySize(98 * scale, 131 * scale)
    .setDepth(Math.round(point.y) + 1_001);
  input.updateDisplaySize(sprite);
  const label = input.scene.add.text(point.x, point.y + 20, input.displayName, input.nameplateStyle("self"))
    .setOrigin(0.5, 0).setDepth(Math.round(point.y) + 1_002);
  return { sprite, label, shadow };
}
