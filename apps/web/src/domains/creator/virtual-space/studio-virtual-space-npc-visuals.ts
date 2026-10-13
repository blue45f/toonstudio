/**
 * NPC 비주얼 일괄 생성 팩토리 (캔버스 장면 구축).
 *
 * 디렉터 뷰마다 그림자·스프라이트·이름표를 만들고 선택 핸들러를 붙인다.
 * NPC의 이동·대화 판정은 디렉터와 캔버스가 소유하고, 이 팩토리는 "처음 세울 때의
 * 모습"만 책임진다 (동료 비주얼 팩토리와 같은 경계).
 */
import type * as Phaser from "phaser";

import type { StudioVirtualArtStyleKey } from "./studio-virtual-space-art-style";
import {
  studioCharacterStaticAsset,
  type StudioCharacterTextureAsset,
} from "./studio-virtual-space-character-assets";
import type { StudioCharacterSkin, StudioCharacterMotionState  } from "./studio-virtual-space-character-skins";
import type { StudioVirtualSpaceFacing } from "./studio-virtual-space-model";
import type { createStudioNameplateRenderer } from "./studio-virtual-space-nameplate-renderer";
import { studioNpcCastSkinByKey } from "./studio-virtual-space-npc-cast";
import {
  studioNpcInteraction,
  studioNpcLabel,
  type StudioNpcView,
} from "./studio-virtual-space-npc-director";
import type { InputEventLike, NpcVisual } from "./studio-virtual-space-phaser-canvas-model";
import {
  STUDIO_ACTOR_SHADOW,
  STUDIO_CHARACTER_FOOT_ORIGIN,
  studioActorShadowSize,
} from "./studio-virtual-space-presentation";
import type {
  StudioVirtualSpaceWorldManifest,
  StudioWorldInteractionDefinition,
  StudioWorldNpcDefinition,
} from "./studio-virtual-space-world-manifest";

type NameplateStyle = ReturnType<typeof createStudioNameplateRenderer>["nameplateStyle"];

export function createStudioNpcVisuals(input: {
  readonly scene: Pick<Phaser.Scene, "add">;
  readonly manifest: StudioVirtualSpaceWorldManifest;
  readonly views: readonly StudioNpcView[];
  readonly artStyle: StudioVirtualArtStyleKey;
  readonly actorVisualScale: number;
  readonly hasStaticAsset: (asset: StudioCharacterTextureAsset) => boolean;
  readonly fallbackAsset: StudioCharacterTextureAsset;
  readonly npcFallbackAsset: StudioCharacterTextureAsset;
  readonly nameplateStyle: NameplateStyle;
  readonly translate: (ko: string, en: string) => string;
  readonly inputBlocked: () => boolean;
  readonly interact: (interaction: StudioWorldInteractionDefinition, definition: StudioWorldNpcDefinition) => void;
  readonly applySpriteVisual: (
    sprite: Phaser.GameObjects.Sprite,
    skin: StudioCharacterSkin,
    facing: StudioVirtualSpaceFacing,
    state: StudioCharacterMotionState,
  ) => void;
}): Map<string, NpcVisual> {
  const { manifest, scene } = input;
  const visuals = new Map<string, NpcVisual>();
  for (const view of input.views) {
    const npcDefinition = manifest.npcs.find((definition) => definition.id === view.id)!;
    const skin = studioNpcCastSkinByKey(npcDefinition.skinKey, input.artStyle);
    const visualScale = npcDefinition.scale ?? 0.72;
    const identity = studioNpcLabel(npcDefinition);
    const shadowSize = studioActorShadowSize(visualScale * input.actorVisualScale);
    const shadow = scene.add.ellipse(
      view.point.x, view.point.y + STUDIO_ACTOR_SHADOW.yOffset,
      shadowSize.width, shadowSize.height, STUDIO_ACTOR_SHADOW.color, STUDIO_ACTOR_SHADOW.alpha,
    ).setDepth(Math.round(view.point.y) + 990);
    const requestedNpcAsset = studioCharacterStaticAsset(skin, view.facing);
    const npcInitialAsset = input.hasStaticAsset(requestedNpcAsset) ? requestedNpcAsset
      : input.hasStaticAsset(input.npcFallbackAsset) ? input.npcFallbackAsset : input.fallbackAsset;
    const sprite = scene.add.sprite(view.point.x, view.point.y, npcInitialAsset.key, npcInitialAsset.frame)
      .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
      .setData({
        visualWidth: 92 * visualScale * input.actorVisualScale,
        visualHeight: 123 * visualScale * input.actorVisualScale,
        assetOwner: `npc:${view.id}`,
      })
      .setDisplaySize(92 * visualScale * input.actorVisualScale, 123 * visualScale * input.actorVisualScale)
      .setDepth(Math.round(view.point.y) + 1_000);
    const selectNpc = (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: InputEventLike) => {
      event.stopPropagation();
      if (input.inputBlocked()) return;
      const interaction = studioNpcInteraction(manifest, npcDefinition);
      if (!interaction) return;
      input.interact(interaction, npcDefinition);
    };
    const interaction = studioNpcInteraction(manifest, npcDefinition);
    if (interaction) sprite.setInteractive({ useHandCursor: true }).on("pointerdown", selectNpc);
    const label = scene.add.text(
      view.point.x, view.point.y + 9, input.translate(identity.ko, identity.en), input.nameplateStyle("npc"),
    ).setOrigin(0.5, 0).setDepth(Math.round(view.point.y) + 1_002);
    if (interaction) label.setInteractive({ useHandCursor: true }).on("pointerdown", selectNpc);
    input.applySpriteVisual(sprite, skin, view.facing, view.animation);
    visuals.set(view.id, {
      definition: npcDefinition, skin, sprite, label, shadow, phase: view.phase, groundPoint: view.point,
    });
  }
  return visuals;
}
