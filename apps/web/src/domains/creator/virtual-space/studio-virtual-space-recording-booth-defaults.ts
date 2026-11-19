/**
 * 녹음부스 기본 설정 (트랙 B 고도화).
 *
 * 빌트인 월드에 두는 기본 부스 하나. 구역은 팀 회의실(950·590·290×260)
 * 안쪽에 겹치는 의미 구역(overlay)이라, 조용한 구역처럼 물리 벽 없이
 * 좌표만으로 게이트·자동 음소가 동작한다. 출품 월드 등 지오메트리가 다른
 * 공간에서는 호출자가 월드에 맞는 설정을 주입한다.
 */

import type { StudioRecordingBoothConfig } from "./studio-virtual-space-recording-booth";
import type { StudioVirtualSpace as StudioBookableSpace } from "./studio-virtual-space-space-booking";
import type { StudioVirtualSpaceWorldManifest } from "./studio-virtual-space-world-manifest";

/** 기본 녹음부스: 회의실 안쪽 180×130, 예약 독점, 최대 5분. */
export function studioDefaultRecordingBoothConfig(): StudioRecordingBoothConfig {
  return Object.freeze({
    boothId: "booth-main",
    roomId: "recording-booth",
    zone: Object.freeze({ x: 1030, y: 620, width: 180, height: 130 }),
    reverb: "room",
    maxDurationSec: 300,
    exclusive: true,
  });
}

/** 예약 패널에 녹음부스를 먼저 두고 나머지 월드 방을 이어 붙인다. */
export function studioRecordingBoothBookingSpaces(
  boothConfig: StudioRecordingBoothConfig,
  worldManifest: StudioVirtualSpaceWorldManifest,
): readonly StudioBookableSpace[] {
  return [
    { id: boothConfig.roomId, name: "녹음부스", capacity: 2, equipmentTags: ["마이크", "방음"] },
    ...worldManifest.rooms
      .filter((room) => room.id !== boothConfig.roomId)
      .map((room) => ({ id: room.id, name: room.labelKo, capacity: 8, equipmentTags: [] as readonly string[] })),
  ];
}
