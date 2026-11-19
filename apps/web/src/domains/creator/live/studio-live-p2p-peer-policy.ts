import { STUDIO_PEER_VIEWER_SAFE_CAPABILITIES } from "./studio-peer-fabric-protocol";

import type { StudioLiveParticipant } from "./studio-live-collaboration-protocol";
import type { StudioLiveTransportContext } from "./studio-live-collaboration-transport";
import type { StudioLiveP2pMeshHandshake } from "./studio-live-p2p-mesh-handshake";
import type {
  StudioLiveP2pRtcDataChannel,
  StudioLiveP2pRtcPeerConnection,
} from "./studio-live-p2p-rtc-types";
import type { StudioPeerCapability } from "./studio-peer-fabric-protocol";

interface StudioLiveP2pInkInboundWindow { startedAt: number; packetCount: number; byteCount: number; }

export interface StudioLiveP2pPeerLink {
  readonly sessionId: string;
  participant: StudioLiveParticipant;
  connection: StudioLiveP2pRtcPeerConnection;
  channel: StudioLiveP2pRtcDataChannel | null;
  readonly handshake: StudioLiveP2pMeshHandshake;
  /** Binary lanes this peer announced over its channel; empty until a caps message arrives. */
  peerBinaryLanes: readonly string[];
  /** Capability-scoped feature lanes advertised by this authenticated peer. */
  peerCapabilities: readonly StudioPeerCapability[];
  readerCapabilities?: readonly string[];
  /** True once our own capability announcement reached this peer's channel. */
  announcedBinaryLanes: boolean;
  inkInboundWindow: StudioLiveP2pInkInboundWindow | null;
  directInboundWindow?: { startedAt: number; count: number; bytes: number };
  closed: boolean;
}

export function channelCanCarry(
  peer: StudioLiveP2pPeerLink,
  messageBytes: number,
  maxBufferedBytes: number,
): boolean {
  const channel = peer.channel;
  if (peer.closed || channel?.readyState !== "open") return false;
  if (
    !Number.isFinite(channel.bufferedAmount)
    || channel.bufferedAmount < 0
    || channel.bufferedAmount + messageBytes > maxBufferedBytes
  ) return false;
  const maxMessageSize = peer.connection.sctp?.maxMessageSize;
  return maxMessageSize === undefined
    || maxMessageSize === 0
    || maxMessageSize === Number.POSITIVE_INFINITY
    || (Number.isFinite(maxMessageSize)
      && maxMessageSize > 0
      && messageBytes <= maxMessageSize);
}

export function isReliableMeshLink(peer: StudioLiveP2pPeerLink): boolean {
  const channel = peer.channel;
  return !peer.closed && channel?.readyState === "open" && channel.ordered === true
    && channel.maxRetransmits === null && channel.maxPacketLifeTime === null;
}

export function capabilityRoleAllowed(
  context: Pick<StudioLiveTransportContext, "participant">,
  peer: StudioLiveP2pPeerLink,
  capability: StudioPeerCapability,
): boolean {
  return (
    context.participant.role !== "viewer"
    && peer.participant.role !== "viewer"
  ) || STUDIO_PEER_VIEWER_SAFE_CAPABILITIES.has(capability);
}

