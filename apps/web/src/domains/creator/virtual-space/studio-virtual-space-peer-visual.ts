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
import type { StudioVirtualSpacePeerImpact } from "./studio-virtual-space-presence-protocol";
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
    impactVx: 0,
    impactVy: 0,
    impactAt: 0,
    impactReceivedAt: 0,
  };
}

/**
 * 전파된 충돌 반발을 비주얼에 적용한다 (VS 120 웨이브 3).
 * 같은 패킷(수신 시각 동일)은 다시 적용하지 않는다 — 반발 재생이 스냅샷
 * 새로고침마다 처음부터 다시 시작되면 안 되기 때문이다. impactAt은 렌더
 * 루프의 시계(frameTime)로 찍어 경과 계산이 한 시계 안에서 닫히게 한다.
 */
export function applyStudioPeerImpact(
  visual: PeerVisual,
  impact: StudioVirtualSpacePeerImpact | undefined,
  frameTime: number,
): void {
  if (!impact || impact.receivedAt === visual.impactReceivedAt) return;
  visual.impactReceivedAt = impact.receivedAt;
  visual.impactVx = impact.vx;
  visual.impactVy = impact.vy;
  visual.impactAt = frameTime;
}

/**
 * 동료 비주얼의 완전한 파괴 (캔버스에서 응집 단위로 추출).
 * 스프라이트·이름표·상태 점·이모트·말풍선·장식·에셋 거주를 한곳에서 해제한다.
 * collaborators는 호출 시점에 실행되는 콜백으로 받아 캔버스의 최신 상태를 본다.
 */
export function destroyStudioPeerVisual(
  deps: {
    readonly releaseCrossfade: (sprite: PeerVisual["sprite"]) => void;
    readonly destroyStatusDot: (id: string) => void;
    readonly removeEmote: (key: string) => void;
    readonly removeSpeech: (key: string) => void;
    readonly removeDecoration: (id: string) => void;
    readonly releaseAsset: (owner: string) => void;
  },
  peers: Map<string, PeerVisual>,
  id: string,
  visual: PeerVisual,
): void {
  deps.releaseCrossfade(visual.sprite);
  visual.sprite.destroy();
  visual.label.destroy();
  deps.destroyStatusDot(id);
  deps.removeEmote(`peer:${id}`);
  deps.removeSpeech(`peer:${id}`);
  deps.removeDecoration(id);
  peers.delete(id);
  deps.releaseAsset(`peer:${id}`);
}
