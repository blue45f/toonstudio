/**
 * 동료 비주얼 생성 팩토리 (캔버스 장면 구축).
 *
 * 스프라이트·이름표·탭(따라가기) 핸들러·초기 프레즌스 상태를 한곳에서 만든다.
 * 렌더·동기화 로직은 캔버스가 그대로 소유하고, 이 팩토리는 "처음 등장하는 동료를
 * 어떤 모습으로 세우는가"만 책임진다.
 */
import type * as Phaser from "phaser";

import type { StudioCharacterTextureAsset } from "./studio-virtual-space-character-assets";
import type { StudioVirtualSpacePeer, StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { createStudioNameplateRenderer } from "./studio-virtual-space-nameplate-renderer";
import type { InputEventLike, PeerVisual } from "./studio-virtual-space-phaser-canvas-model";
import { STUDIO_CHARACTER_FOOT_ORIGIN, StudioPeerTimeline } from "./studio-virtual-space-presentation";

type PeerVisualScene = Pick<Phaser.Scene, "add">;
type NameplateStyle = ReturnType<typeof createStudioNameplateRenderer>["nameplateStyle"];

export function createStudioPeerVisual(input: {
  readonly scene: PeerVisualScene;
  readonly peer: StudioVirtualSpacePeer;
  readonly asset: StudioCharacterTextureAsset;
  readonly actorVisualScale: number;
  readonly gaitDistancePerCycle: number | undefined;
  readonly nameplateStyle: NameplateStyle;
  readonly nearby: boolean;
  readonly inputBlocked: () => boolean;
  readonly onTapPeer: (id: string, point: StudioVirtualSpacePoint) => void;
  readonly now: number;
}): PeerVisual {
  const { peer } = input;
  const id = peer.participant.sessionId;
  const scale = input.actorVisualScale;
  const sprite = input.scene.add.sprite(peer.state.x, peer.state.y, input.asset.key, input.asset.frame)
    .setOrigin(0.5, STUDIO_CHARACTER_FOOT_ORIGIN)
    .setData({
      visualWidth: 92 * scale, visualHeight: 123 * scale, assetOwner: `peer:${id}`,
      gaitDistancePerCycle: input.gaitDistancePerCycle,
    })
    .setDisplaySize(92 * scale, 123 * scale)
    .setDepth(Math.round(peer.state.y) + 1_001)
    .setInteractive({ useHandCursor: true });
  sprite.on(
    "pointerdown",
    (_pointer: Phaser.Input.Pointer, _localX: number, _localY: number, event: InputEventLike) => {
      event.stopPropagation();
      if (input.inputBlocked()) return;
      input.onTapPeer(id, { x: sprite.x, y: sprite.y });
    },
  );
  const label = input.scene.add.text(peer.state.x, peer.state.y + 18, peer.participant.displayName, input.nameplateStyle("peer"))
    .setOrigin(0.5, 0).setDepth(Math.round(peer.state.y) + 1_002);
  return {
    timeline: new StudioPeerTimeline(),
    sprite,
    label,
    emoteKey: "",
    displayName: peer.participant.displayName,
    targetX: peer.state.x,
    targetY: peer.state.y,
    avatarIndex: peer.state.avatarIndex,
    appearance: peer.state.appearance,
    facing: peer.state.facing,
    moving: peer.state.moving,
    activity: peer.state.activity,
    nearby: input.nearby,
    presenceEmote: null,
    typing: false,
    spawnedAt: input.now,
    leavingAt: null,
  };
}
