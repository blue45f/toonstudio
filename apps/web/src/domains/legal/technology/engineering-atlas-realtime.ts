import { ENGINEERING_ATLAS_REALTIME_COLLAB } from "./engineering-atlas-realtime-collab";
import { ENGINEERING_ATLAS_REALTIME_INFINITE_P2P } from "./engineering-atlas-realtime-infinite-p2p";
import { ENGINEERING_ATLAS_REALTIME_MEDIA } from "./engineering-atlas-realtime-media";
import { ENGINEERING_ATLAS_REALTIME_NEGOTIATION } from "./engineering-atlas-realtime-negotiation";
import { ENGINEERING_ATLAS_REALTIME_P2P_GRID_COMPANION } from "./engineering-atlas-realtime-p2p-grid-companion";
import { ENGINEERING_ATLAS_REALTIME_TRANSPORT } from "./engineering-atlas-realtime-transport";
import { ENGINEERING_ATLAS_REALTIME_WEBRTC } from "./engineering-atlas-realtime-webrtc";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 발표에서 읽는 순서: 문서 협업(Yjs → Socket.IO → 락 → Durable Objects) → WebRTC(구조 → 협상 → 직통 레인
 * → ICE·TURN → 인원 한계 → 화면 공유 → 권한) → 한계를 넘는 전송(WebTransport → 무한 캔버스·P2P 무손실 델타
 * → P2P 그리드·R2 90% 오프로드 → ₩0 SAS 컴패니언·일회성 레드라인).
 * 목록에 없는 카드는 뒤에 붙는다.
 */
const PRESENTATION_ORDER: readonly string[] = [
  "yjs-crdt-document",
  "socket-io-room-tickets",
  "crdt-lock-revision",
  "durable-objects-realtime",
  "webrtc-three-plane-signaling",
  "webrtc-perfect-negotiation",
  "webrtc-datachannel-direct-lane",
  "webrtc-ice-turn-paths",
  "webrtc-mesh-limits",
  "screen-share-signaling",
  "media-permissions-policy",
  "webtransport-experiment",
  "infinite-canvas-webgpu-p2p-zerogc",
  "p2p-grid-tile-render-merkle-stream-r2-offload",
  "zero-lag-companion-pairing-ephemeral-redline-hw",
];

const rank = (id: string): number => {
  const index = PRESENTATION_ORDER.indexOf(id);
  return index === -1 ? PRESENTATION_ORDER.length : index;
};

/**
 * 기술 도감 · realtime 카테고리 카드. 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 * 카드는 주제별 보조 파일(engineering-atlas-realtime-*.ts)에 나눠 두고 여기서 합친다.
 */
export const ENGINEERING_ATLAS_REALTIME: readonly EngineeringAtlasEntry[] = [
  ...ENGINEERING_ATLAS_REALTIME_COLLAB,
  ...ENGINEERING_ATLAS_REALTIME_WEBRTC,
  ...ENGINEERING_ATLAS_REALTIME_NEGOTIATION,
  ...ENGINEERING_ATLAS_REALTIME_MEDIA,
  ...ENGINEERING_ATLAS_REALTIME_TRANSPORT,
  ...ENGINEERING_ATLAS_REALTIME_INFINITE_P2P,
  ...ENGINEERING_ATLAS_REALTIME_P2P_GRID_COMPANION,
].sort((left, right) => rank(left.id) - rank(right.id));
