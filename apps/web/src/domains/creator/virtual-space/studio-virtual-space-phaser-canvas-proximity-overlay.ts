/**
 * 대화 거리 근접 오버레이 그리기 (캔버스에서 분리).
 *
 * 그릴지 여부(집중 분위기·집중/자리 비움 상태)와 매 프레임 clear는 캔버스가 정하고,
 * 여기서는 정해진 그래픽스에 발밑 버블·연결선·넓은 링만 그린다.
 * Phaser는 캔버스가 늦게 불러오므로 여기서는 타입만 가져온다.
 */
import type * as Phaser from "phaser";

import type { StudioVirtualSpacePoint } from "./studio-virtual-space-model";
import type { PeerVisual } from "./studio-virtual-space-phaser-canvas-model";
import { studioProjectTownPoint } from "./studio-virtual-space-semantic-world";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/**
 * 대화 거리(게더타운식 근접 버블): 기본은 120px 안 동료가 있을 때만 발밑 버블과 연결선을 보이고,
 * '모든 표식 보기'(showAll)면 190px 안까지 넓은 링도 함께 그린다. 배열을 만들지 않고 한 번 순회한다.
 */
export function drawStudioProximityOverlay(
  proximityOverlay: Phaser.GameObjects.Graphics,
  manifest: StudioVirtualSpaceWorldManifest,
  currentPoint: StudioVirtualSpacePoint,
  peers: ReadonlyMap<string, PeerVisual>,
  showAll: boolean,
): void {
  const reach = showAll ? 190 : 120;
  const origin = studioProjectTownPoint(manifest, currentPoint);
  let inRange = 0;
  for (const peer of peers.values()) {
    const distance = Math.hypot(peer.targetX - currentPoint.x, peer.targetY - currentPoint.y);
    if (distance > reach) continue;
    inRange += 1;
    const strength = Math.max(.08, .36 * (1 - distance / reach));
    proximityOverlay.lineStyle(distance < 80 ? 2 : 1, peer.activity === "focused" ? 0xf9b95d : 0x82e6ff, strength)
      .lineBetween(origin.x, origin.y - 6, peer.sprite.x, peer.sprite.y - 6);
  }
  if (inRange > 0) {
    proximityOverlay.fillStyle(0x8fdcff, .07).fillEllipse(origin.x, origin.y, 150, 70);
    proximityOverlay.lineStyle(2, 0xc5f4ff, .26).strokeEllipse(origin.x, origin.y, 150, 70);
    if (showAll) proximityOverlay.lineStyle(1.5, 0x8fdcff, .13).strokeCircle(origin.x, origin.y, 140);
  }
}
