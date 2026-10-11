import type { StudioCrdtSyncResponse } from "./studio-crdt-protocol";
import {
  isStudioLiveInkWireCandidate,
  type StudioLiveInkWireMessage,
} from "./studio-live-ink-protocol";
import { isStudioPeerCapability, type StudioPeerCapability } from "./studio-peer-fabric-protocol";

/**
 * p2p 오버레이 트랜스포트의 순수 와이어 헬퍼 — 능력(caps) 메시지 파서, 잉크 바이너리 프레임 코덱,
 * CRDT sync 응답 경합. 소켓·RTC 상태에 의존하지 않아 트랜스포트 본체에서 분리했다.
 */

/** JSON control message announcing this peer's negotiated binary lanes (e.g. "ink-v2"). */
export const STUDIO_LIVE_P2P_CAPS_WIRE = "studio-live-p2p-caps";
const STUDIO_LIVE_P2P_MAX_ADVERTISED_LANES = 8;
const STUDIO_LIVE_P2P_MAX_ADVERTISED_PEER_CAPABILITIES = 32;
const STUDIO_LIVE_P2P_MAX_LANE_NAME_LENGTH = 64;

export function firstNonNullCrdtSyncResponse(
  primary: Promise<StudioCrdtSyncResponse | null>,
  mesh: Promise<StudioCrdtSyncResponse | null>,
): Promise<StudioCrdtSyncResponse | null> {
  return new Promise((resolve) => {
    let remaining = 2;
    const settle = (response: StudioCrdtSyncResponse | null): void => {
      if (response) resolve(response);
      if (--remaining === 0) resolve(null);
    };
    // An absent same-profile BroadcastChannel must not delay an available remote peer.
    void primary.then(settle, () => settle(null));
    void mesh.then(settle, () => settle(null));
  });
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface StudioLiveP2pCapsMessage {
  readonly binaryLanes: readonly string[];
  readonly peerCapabilities: readonly StudioPeerCapability[];
}

export function parseStudioLiveP2pCapsMessage(value: unknown): StudioLiveP2pCapsMessage | null {
  if (!isPlainRecord(value) || value.wire !== STUDIO_LIVE_P2P_CAPS_WIRE) return null;
  const lanes = value.binaryLanes;
  const capabilities = value.peerCapabilities ?? [];
  if (
    !Array.isArray(lanes)
    || lanes.length > STUDIO_LIVE_P2P_MAX_ADVERTISED_LANES
    || !Array.isArray(capabilities)
    || capabilities.length > STUDIO_LIVE_P2P_MAX_ADVERTISED_PEER_CAPABILITIES
  ) return null;
  const parsedLanes: string[] = [];
  for (const lane of lanes) {
    if (
      typeof lane !== "string"
      || lane.length === 0
      || lane.length > STUDIO_LIVE_P2P_MAX_LANE_NAME_LENGTH
    ) return null;
    parsedLanes.push(lane);
  }
  if (!capabilities.every(isStudioPeerCapability)) return null;
  return {
    binaryLanes: Object.freeze(parsedLanes),
    peerCapabilities: Object.freeze([...new Set(capabilities)]),
  };
}

/**
 * Binary mesh frame for one ink wire message: u32(LE) header byte length, the UTF-8 JSON header
 * ({header JSON} = the wire frame minus its ArrayBuffer), then the raw sample payload bytes.
 * Control frames (begin/end/cancel) carry zero payload bytes.
 */
export function encodeStudioLiveP2pInkFrame(wire: StudioLiveInkWireMessage): ArrayBuffer | null {
  try {
    const message = wire.message;
    const payload =
      message.kind === "ink:chunk" || message.kind === "ink:prediction"
        ? message.payload
        : null;
    const headerBytes = new TextEncoder().encode(
      JSON.stringify({
        ...wire,
        message: payload ? { ...message, payload: undefined } : message,
      }),
    );
    const frame = new Uint8Array(4 + headerBytes.byteLength + (payload?.byteLength ?? 0));
    new DataView(frame.buffer).setUint32(0, headerBytes.byteLength, true);
    frame.set(headerBytes, 4);
    if (payload) frame.set(new Uint8Array(payload), 4 + headerBytes.byteLength);
    return frame.buffer;
  } catch {
    return null;
  }
}

/** Reconstructs one raw ink-lane candidate; the strict wire parser still runs downstream. */
export function decodeStudioLiveP2pInkFrame(data: ArrayBuffer): Record<string, unknown> | null {
  if (data.byteLength < 4) return null;
  const headerLength = new DataView(data).getUint32(0, true);
  if (headerLength === 0 || 4 + headerLength > data.byteLength) return null;
  let header: unknown;
  try {
    header = JSON.parse(
      new TextDecoder().decode(new Uint8Array(data, 4, headerLength)),
    ) as unknown;
  } catch {
    return null;
  }
  if (!isPlainRecord(header) || !isStudioLiveInkWireCandidate(header)) return null;
  const message = header.message;
  if (!isPlainRecord(message)) return null;
  if (message.kind === "ink:chunk" || message.kind === "ink:prediction") {
    message.payload = data.slice(4 + headerLength);
  } else if (data.byteLength !== 4 + headerLength) {
    return null;
  }
  return header;
}
