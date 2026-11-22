/**
 * 데스크톱 캔버스 ↔ 스마트폰/태블릿 컴패니언 QR 멀티 디바이스 브리지.
 *
 * - ₩0 로컬/P2P 우선 전송 추상화(WebRTC DataChannel · BroadcastChannel · 로컬 루프백).
 * - QR 페어링 페이로드 직렬화·역직렬화 및 만료 검증.
 * - 연결·하트비트·지수 백오프 재연결·만료·해제 결정적 상태머신.
 * - 권한 범위(capability), 세션 토큰, 단조 시퀀스(재전송 공격 방지), 경계값 검증을 거친 경량 명령 디스패치.
 */

export const COMPANION_PAIRING_SCHEMA_VERSION = "toonstudio.companion-pair.v1" as const;
export const COMPANION_BRIDGE_URI_SCHEME = "toonstudio://pair" as const;

export const COMPANION_CAPABILITIES = ["shortcuts", "palette", "camera-3d", "navigator"] as const;
export type CompanionCapability = (typeof COMPANION_CAPABILITIES)[number];

export type CompanionTransportKind = "webrtc-datachannel" | "broadcast-channel" | "local-loopback";

export type CompanionBridgeConnectionState =
  | "idle" | "awaiting-scan" | "pairing" | "connected" | "reconnecting" | "expired" | "disconnected";

export interface CompanionQrPairingPayload {
  readonly schemaVersion: typeof COMPANION_PAIRING_SCHEMA_VERSION;
  readonly sessionId: string;
  readonly pairingCode: string;
  readonly hostDeviceId: string;
  readonly hostLabel: string;
  readonly preferredTransport: CompanionTransportKind;
  readonly channelName: string;
  readonly sessionToken: string;
  readonly allowedCapabilities: readonly CompanionCapability[];
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly webrtcOfferFingerprint?: string;
}

export type CompanionPairingParseResult =
  | { readonly ok: true; readonly payload: CompanionQrPairingPayload }
  | { readonly ok: false; readonly reasonCode: "INVALID_URI" | "UNSUPPORTED_VERSION" | "MISSING_FIELD" | "INVALID_CAPABILITY" };

export type CompanionShortcutAction =
  | "undo" | "redo" | "flip-horizontal" | "zoom-fit" | "toggle-eraser" | "quick-save";

export type CompanionCamera3dPresetId = "front" | "three-quarter" | "low-angle" | "bird-eye" | "dutch-tilt";

export type CompanionBridgeCommand =
  | { readonly kind: "shortcut.trigger"; readonly action: CompanionShortcutAction; readonly repeat?: boolean }
  | { readonly kind: "brush.adjust"; readonly sizeDeltaPx?: number; readonly opacityDeltaPercent?: number; readonly brushSlotIndex?: number }
  | { readonly kind: "palette.select-color"; readonly hex: string; readonly slot?: "primary" | "secondary" }
  | { readonly kind: "palette.apply-swatch"; readonly swatchId: string }
  | { readonly kind: "camera3d.orbit"; readonly deltaYawDeg: number; readonly deltaPitchDeg: number; readonly deltaZoom: number }
  | { readonly kind: "camera3d.pan"; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: "camera3d.preset"; readonly presetId: CompanionCamera3dPresetId }
  | { readonly kind: "navigator.jump"; readonly normalizedY: number; readonly zoomPercent?: number };

export interface CompanionCommandEnvelope {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly senderDeviceId: string;
  readonly sequence: number;
  readonly sentAtMs: number;
  readonly command: CompanionBridgeCommand;
}

export type CompanionRejectionCode =
  | "NOT_CONNECTED" | "SESSION_MISMATCH" | "UNAUTHORIZED_PEER" | "INVALID_TOKEN" | "PAIRING_EXPIRED"
  | "CAPABILITY_DENIED" | "REPLAY_SEQUENCE" | "STALE_COMMAND" | "INVALID_PAYLOAD" | "RECONNECT_EXHAUSTED";

export interface CompanionPeerDescriptor {
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly formFactor: "phone" | "tablet" | "secondary-window";
  readonly grantedCapabilities: readonly CompanionCapability[];
  readonly pairedAtMs: number;
}

export interface CompanionBridgePolicy {
  readonly qrTtlMs: number;
  readonly heartbeatTimeoutMs: number;
  readonly maxCommandAgeMs: number;
  readonly maxReconnectAttempts: number;
  readonly baseReconnectBackoffMs: number;
  readonly maxReconnectBackoffMs: number;
}

export const DEFAULT_COMPANION_BRIDGE_POLICY: CompanionBridgePolicy = Object.freeze({
  qrTtlMs: 120_000,
  heartbeatTimeoutMs: 15_000,
  maxCommandAgeMs: 10_000,
  maxReconnectAttempts: 4,
  baseReconnectBackoffMs: 1_000,
  maxReconnectBackoffMs: 16_000,
});

export interface CompanionBridgeSessionState {
  readonly status: CompanionBridgeConnectionState;
  readonly pairing: CompanionQrPairingPayload;
  readonly peer: CompanionPeerDescriptor | null;
  readonly policy: CompanionBridgePolicy;
  readonly lastHeartbeatAtMs: number | null;
  readonly lastAcceptedSequence: number;
  readonly reconnectAttempts: number;
  readonly nextReconnectAtMs: number | null;
  readonly acceptedCommandCount: number;
  readonly rejectedCommandCount: number;
  readonly lastReasonCode: CompanionRejectionCode | null;
}

export interface CompanionPairRequest {
  readonly sessionId: string;
  readonly peerDeviceId: string;
  readonly peerLabel: string;
  readonly formFactor: "phone" | "tablet" | "secondary-window";
  readonly sessionToken?: string;
  readonly pairingCode?: string;
  readonly requestedCapabilities: readonly CompanionCapability[];
}

export type CompanionTransitionResult =
  | { readonly ok: true; readonly state: CompanionBridgeSessionState }
  | { readonly ok: false; readonly reasonCode: CompanionRejectionCode; readonly state: CompanionBridgeSessionState };

export type CompanionCommandDispatchResult =
  | {
      readonly ok: true;
      readonly state: CompanionBridgeSessionState;
      readonly capability: CompanionCapability;
      readonly command: CompanionBridgeCommand;
    }
  | {
      readonly ok: false;
      readonly reasonCode: CompanionRejectionCode;
      readonly state: CompanionBridgeSessionState;
    };

export type CompanionWireFrame =
  | { readonly type: "pair-request"; readonly request: CompanionPairRequest; readonly sentAtMs: number }
  | { readonly type: "pair-ack"; readonly ok: boolean; readonly sessionId: string; readonly reasonCode?: CompanionRejectionCode }
  | { readonly type: "command"; readonly envelope: CompanionCommandEnvelope }
  | { readonly type: "command-ack"; readonly sequence: number; readonly ok: boolean; readonly reasonCode?: CompanionRejectionCode }
  | { readonly type: "heartbeat"; readonly sessionId: string; readonly senderDeviceId: string; readonly sentAtMs: number }
  | { readonly type: "disconnect"; readonly sessionId: string; readonly reason: string; readonly sentAtMs: number };

export interface CompanionTransportAdapter {
  readonly kind: CompanionTransportKind;
  readonly zeroCostLocalP2p: true;
  send(frame: CompanionWireFrame): void;
  subscribe(listener: (frame: CompanionWireFrame) => void): () => void;
  close(): void;
}

export interface RtcDataChannelLike {
  readonly readyState: string;
  send(data: string): void;
  close(): void;
  addEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { readonly data: unknown }) => void): void;
}

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/u;
const CAPABILITY_SET = new Set<string>(COMPANION_CAPABILITIES);
const TRANSPORT_SET = new Set<string>(["webrtc-datachannel", "broadcast-channel", "local-loopback"]);

function hash32(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function deriveSessionArtifacts(seed: string): {
  readonly sessionId: string;
  readonly pairingCode: string;
  readonly sessionToken: string;
} {
  const a = hash32(`sid:${seed}`);
  const b = hash32(`pin:${seed}`);
  const c = hash32(`tok:${seed}:${a}`);
  const d = hash32(`tok2:${seed}:${b}`);
  const sixDigits = String(b % 1_000_000).padStart(6, "0");
  return {
    sessionId: `cmp-${a.toString(36).padStart(7, "0")}`,
    pairingCode: `${sixDigits.slice(0, 3)}-${sixDigits.slice(3)}`,
    sessionToken: `${c.toString(16).padStart(8, "0")}${d.toString(16).padStart(8, "0")}`,
  };
}

function sanitizeCapabilities(capabilities: readonly CompanionCapability[]): readonly CompanionCapability[] {
  const unique: CompanionCapability[] = [];
  for (const cap of capabilities) {
    if (CAPABILITY_SET.has(cap) && !unique.includes(cap)) {
      unique.push(cap);
    }
  }
  return Object.freeze(unique);
}

export function requiredCapabilityForCommand(command: CompanionBridgeCommand): CompanionCapability {
  switch (command.kind) {
    case "shortcut.trigger":
    case "brush.adjust":
      return "shortcuts";
    case "palette.select-color":
    case "palette.apply-swatch":
      return "palette";
    case "camera3d.orbit":
    case "camera3d.pan":
    case "camera3d.preset":
      return "camera-3d";
    case "navigator.jump":
      return "navigator";
  }
}

export function createCompanionPairingPayload(input: {
  readonly hostDeviceId: string;
  readonly hostLabel: string;
  readonly nowMs: number;
  readonly preferredTransport?: CompanionTransportKind;
  readonly allowedCapabilities?: readonly CompanionCapability[];
  readonly ttlMs?: number;
  readonly deterministicNonce?: string;
  readonly webrtcOfferFingerprint?: string;
}): CompanionQrPairingPayload {
  const hostDeviceId = input.hostDeviceId.trim();
  if (!hostDeviceId) throw new Error("hostDeviceId가 필요합니다.");
  const ttlMs = Math.max(5_000, Math.trunc(input.ttlMs ?? DEFAULT_COMPANION_BRIDGE_POLICY.qrTtlMs));
  const seed = `${hostDeviceId}|${input.nowMs}|${input.deterministicNonce ?? "default"}`;
  const derived = deriveSessionArtifacts(seed);
  const capabilities = sanitizeCapabilities(input.allowedCapabilities ?? COMPANION_CAPABILITIES);
  if (capabilities.length === 0) {
    throw new Error("최소 1개 이상의 컴패니언 권한(capability)이 필요합니다.");
  }
  const preferredTransport = input.preferredTransport ?? "webrtc-datachannel";

  return Object.freeze({
    schemaVersion: COMPANION_PAIRING_SCHEMA_VERSION,
    sessionId: derived.sessionId,
    pairingCode: derived.pairingCode,
    hostDeviceId,
    hostLabel: input.hostLabel.trim() || "ToonStudio 데스크톱",
    preferredTransport,
    channelName: `toonstudio:companion:${derived.sessionId}`,
    sessionToken: derived.sessionToken,
    allowedCapabilities: capabilities,
    issuedAtMs: input.nowMs,
    expiresAtMs: input.nowMs + ttlMs,
    webrtcOfferFingerprint: input.webrtcOfferFingerprint,
  });
}

export function isPairingPayloadExpired(payload: CompanionQrPairingPayload, nowMs: number): boolean {
  return nowMs > payload.expiresAtMs;
}

export function encodeCompanionPairingUri(payload: CompanionQrPairingPayload): string {
  const params = new URLSearchParams();
  params.set("v", "1");
  params.set("sid", payload.sessionId);
  params.set("code", payload.pairingCode);
  params.set("hid", payload.hostDeviceId);
  params.set("hl", payload.hostLabel);
  params.set("tr", payload.preferredTransport);
  params.set("ch", payload.channelName);
  params.set("tok", payload.sessionToken);
  params.set("cap", payload.allowedCapabilities.join(","));
  params.set("iat", String(payload.issuedAtMs));
  params.set("exp", String(payload.expiresAtMs));
  if (payload.webrtcOfferFingerprint) {
    params.set("fp", payload.webrtcOfferFingerprint);
  }
  return `${COMPANION_BRIDGE_URI_SCHEME}?${params.toString()}`;
}

export function parseCompanionPairingUri(uri: string): CompanionPairingParseResult {
  if (!uri.startsWith(`${COMPANION_BRIDGE_URI_SCHEME}?`)) {
    return { ok: false, reasonCode: "INVALID_URI" };
  }
  const query = uri.slice(COMPANION_BRIDGE_URI_SCHEME.length + 1);
  const params = new URLSearchParams(query);
  if (params.get("v") !== "1") {
    return { ok: false, reasonCode: "UNSUPPORTED_VERSION" };
  }

  const sessionId = params.get("sid")?.trim() ?? "";
  const pairingCode = params.get("code")?.trim() ?? "";
  const hostDeviceId = params.get("hid")?.trim() ?? "";
  const hostLabel = params.get("hl")?.trim() ?? "";
  const transport = params.get("tr")?.trim() ?? "";
  const channelName = params.get("ch")?.trim() ?? "";
  const sessionToken = params.get("tok")?.trim() ?? "";
  const rawCaps = params.get("cap")?.trim() ?? "";
  const issuedAtMs = Number(params.get("iat"));
  const expiresAtMs = Number(params.get("exp"));

  if (
    !sessionId ||
    !pairingCode ||
    !hostDeviceId ||
    !channelName ||
    !sessionToken ||
    !TRANSPORT_SET.has(transport) ||
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= issuedAtMs
  ) {
    return { ok: false, reasonCode: "MISSING_FIELD" };
  }

  const capList = rawCaps.split(",").filter(Boolean);
  if (capList.length === 0 || capList.some((cap) => !CAPABILITY_SET.has(cap))) {
    return { ok: false, reasonCode: "INVALID_CAPABILITY" };
  }

  const allowedCapabilities = Object.freeze(capList as CompanionCapability[]);
  const fp = params.get("fp")?.trim();

  return {
    ok: true,
    payload: Object.freeze({
      schemaVersion: COMPANION_PAIRING_SCHEMA_VERSION,
      sessionId,
      pairingCode,
      hostDeviceId,
      hostLabel: hostLabel || "ToonStudio 데스크톱",
      preferredTransport: transport as CompanionTransportKind,
      channelName,
      sessionToken,
      allowedCapabilities,
      issuedAtMs,
      expiresAtMs,
      webrtcOfferFingerprint: fp || undefined,
    }),
  };
}

export function createCompanionBridgeSession(input: {
  readonly hostDeviceId: string;
  readonly hostLabel: string;
  readonly nowMs: number;
  readonly preferredTransport?: CompanionTransportKind;
  readonly allowedCapabilities?: readonly CompanionCapability[];
  readonly policy?: Readonly<Partial<CompanionBridgePolicy>>;
  readonly deterministicNonce?: string;
}): CompanionBridgeSessionState {
  const policy: CompanionBridgePolicy = Object.freeze({
    ...DEFAULT_COMPANION_BRIDGE_POLICY,
    ...input.policy,
  });
  const pairing = createCompanionPairingPayload({
    hostDeviceId: input.hostDeviceId,
    hostLabel: input.hostLabel,
    nowMs: input.nowMs,
    preferredTransport: input.preferredTransport,
    allowedCapabilities: input.allowedCapabilities,
    ttlMs: policy.qrTtlMs,
    deterministicNonce: input.deterministicNonce,
  });

  return Object.freeze({
    status: "awaiting-scan",
    pairing,
    peer: null,
    policy,
    lastHeartbeatAtMs: null,
    lastAcceptedSequence: 0,
    reconnectAttempts: 0,
    nextReconnectAtMs: null,
    acceptedCommandCount: 0,
    rejectedCommandCount: 0,
    lastReasonCode: null,
  });
}

function computeReconnectBackoff(policy: CompanionBridgePolicy, attemptIndex: number): number {
  return Math.min(policy.maxReconnectBackoffMs, policy.baseReconnectBackoffMs * 2 ** Math.max(0, attemptIndex));
}

function failTransition(state: CompanionBridgeSessionState, reasonCode: CompanionRejectionCode, nextStatus?: CompanionBridgeConnectionState): CompanionTransitionResult {
  return {
    ok: false,
    reasonCode,
    state: Object.freeze({ ...state, status: nextStatus ?? state.status, nextReconnectAtMs: nextStatus === "expired" ? null : state.nextReconnectAtMs, lastReasonCode: reasonCode }),
  };
}

export function acceptCompanionPairing(
  state: CompanionBridgeSessionState,
  request: CompanionPairRequest,
  nowMs: number,
): CompanionTransitionResult {
  if (request.sessionId !== state.pairing.sessionId) return failTransition(state, "SESSION_MISMATCH");
  if (isPairingPayloadExpired(state.pairing, nowMs)) return failTransition(state, "PAIRING_EXPIRED", "expired");
  const tokenMatch = request.sessionToken !== undefined && request.sessionToken === state.pairing.sessionToken;
  const codeMatch = request.pairingCode !== undefined && request.pairingCode === state.pairing.pairingCode;
  if (!tokenMatch && !codeMatch) return failTransition(state, "INVALID_TOKEN");

  const allowedSet = new Set(state.pairing.allowedCapabilities);
  const granted = sanitizeCapabilities(request.requestedCapabilities.filter((cap) => allowedSet.has(cap)));
  if (granted.length === 0) return failTransition(state, "CAPABILITY_DENIED");

  const peer: CompanionPeerDescriptor = Object.freeze({
    deviceId: request.peerDeviceId.trim(),
    deviceLabel: request.peerLabel.trim() || "모바일 컴패니언",
    formFactor: request.formFactor,
    grantedCapabilities: granted,
    pairedAtMs: nowMs,
  });
  return {
    ok: true,
    state: Object.freeze({
      ...state, status: "connected", peer, lastHeartbeatAtMs: nowMs,
      reconnectAttempts: 0, nextReconnectAtMs: null, lastReasonCode: null,
    }),
  };
}

export function evaluateBridgeLiveness(state: CompanionBridgeSessionState, nowMs: number): CompanionBridgeSessionState {
  if (state.status === "awaiting-scan" && isPairingPayloadExpired(state.pairing, nowMs)) {
    return Object.freeze({ ...state, status: "expired", lastReasonCode: "PAIRING_EXPIRED" });
  }
  if (state.status === "connected" && state.lastHeartbeatAtMs !== null && nowMs - state.lastHeartbeatAtMs > state.policy.heartbeatTimeoutMs) {
    return Object.freeze({
      ...state,
      status: "reconnecting",
      reconnectAttempts: state.reconnectAttempts + 1,
      nextReconnectAtMs: nowMs + computeReconnectBackoff(state.policy, state.reconnectAttempts),
    });
  }
  return state;
}

export function recordBridgeHeartbeat(
  state: CompanionBridgeSessionState,
  senderDeviceId: string,
  nowMs: number,
): CompanionTransitionResult {
  if (!state.peer || state.peer.deviceId !== senderDeviceId) return failTransition(state, "UNAUTHORIZED_PEER");
  if (state.status !== "connected" && state.status !== "reconnecting") return failTransition(state, "NOT_CONNECTED");
  return {
    ok: true,
    state: Object.freeze({
      ...state, status: "connected", lastHeartbeatAtMs: nowMs,
      reconnectAttempts: 0, nextReconnectAtMs: null, lastReasonCode: null,
    }),
  };
}

export function advanceBridgeReconnect(
  state: CompanionBridgeSessionState,
  peerResponded: boolean,
  nowMs: number,
): CompanionTransitionResult {
  if (state.status !== "reconnecting") return { ok: false, reasonCode: "NOT_CONNECTED", state };
  if (peerResponded) {
    return {
      ok: true,
      state: Object.freeze({
        ...state, status: "connected", lastHeartbeatAtMs: nowMs,
        reconnectAttempts: 0, nextReconnectAtMs: null, lastReasonCode: null,
      }),
    };
  }
  if (state.reconnectAttempts >= state.policy.maxReconnectAttempts) {
    return failTransition(state, "RECONNECT_EXHAUSTED", "expired");
  }
  const nextAttempt = state.reconnectAttempts + 1;
  return {
    ok: true,
    state: Object.freeze({
      ...state,
      status: "reconnecting",
      reconnectAttempts: nextAttempt,
      nextReconnectAtMs: nowMs + computeReconnectBackoff(state.policy, nextAttempt - 1),
    }),
  };
}

export function refreshBridgeQrPairing(state: CompanionBridgeSessionState, nowMs: number, nonce = "refresh"): CompanionBridgeSessionState {
  const pairing = createCompanionPairingPayload({
    hostDeviceId: state.pairing.hostDeviceId,
    hostLabel: state.pairing.hostLabel,
    nowMs,
    preferredTransport: state.pairing.preferredTransport,
    allowedCapabilities: state.pairing.allowedCapabilities,
    ttlMs: state.policy.qrTtlMs,
    deterministicNonce: nonce,
  });
  return Object.freeze({
    ...state, status: "awaiting-scan", pairing, peer: null, lastHeartbeatAtMs: null,
    lastAcceptedSequence: 0, reconnectAttempts: 0, nextReconnectAtMs: null, lastReasonCode: null,
  });
}

export function disconnectCompanionBridge(state: CompanionBridgeSessionState): CompanionBridgeSessionState {
  return Object.freeze({ ...state, status: "disconnected", nextReconnectAtMs: null });
}

function isCommandPayloadValid(command: CompanionBridgeCommand): boolean {
  switch (command.kind) {
    case "shortcut.trigger":
      return true;
    case "brush.adjust": {
      const sizeOk = command.sizeDeltaPx === undefined || (Number.isFinite(command.sizeDeltaPx) && Math.abs(command.sizeDeltaPx) <= 500);
      const opacityOk =
        command.opacityDeltaPercent === undefined ||
        (Number.isFinite(command.opacityDeltaPercent) && Math.abs(command.opacityDeltaPercent) <= 100);
      const slotOk =
        command.brushSlotIndex === undefined ||
        (Number.isInteger(command.brushSlotIndex) && command.brushSlotIndex >= 0 && command.brushSlotIndex <= 32);
      return sizeOk && opacityOk && slotOk;
    }
    case "palette.select-color":
      return HEX_COLOR_PATTERN.test(command.hex);
    case "palette.apply-swatch":
      return command.swatchId.trim().length > 0;
    case "camera3d.orbit":
      return (
        Number.isFinite(command.deltaYawDeg) &&
        Number.isFinite(command.deltaPitchDeg) &&
        Number.isFinite(command.deltaZoom) &&
        Math.abs(command.deltaYawDeg) <= 180 &&
        Math.abs(command.deltaPitchDeg) <= 180 &&
        Math.abs(command.deltaZoom) <= 50
      );
    case "camera3d.pan":
      return Number.isFinite(command.deltaX) && Number.isFinite(command.deltaY) && Math.abs(command.deltaX) <= 1000 && Math.abs(command.deltaY) <= 1000;
    case "camera3d.preset":
      return true;
    case "navigator.jump":
      return (
        Number.isFinite(command.normalizedY) &&
        command.normalizedY >= 0 &&
        command.normalizedY <= 1 &&
        (command.zoomPercent === undefined || (Number.isFinite(command.zoomPercent) && command.zoomPercent >= 10 && command.zoomPercent <= 800))
      );
  }
}

export function dispatchCompanionCommand(
  state: CompanionBridgeSessionState,
  envelope: CompanionCommandEnvelope,
  nowMs: number,
): CompanionCommandDispatchResult {
  const reject = (reasonCode: CompanionRejectionCode): CompanionCommandDispatchResult => ({
    ok: false,
    reasonCode,
    state: Object.freeze({
      ...state,
      rejectedCommandCount: state.rejectedCommandCount + 1,
      lastReasonCode: reasonCode,
    }),
  });

  if (state.status !== "connected" || !state.peer) return reject("NOT_CONNECTED");
  if (envelope.sessionId !== state.pairing.sessionId) return reject("SESSION_MISMATCH");
  if (envelope.senderDeviceId !== state.peer.deviceId) return reject("UNAUTHORIZED_PEER");
  if (envelope.sessionToken !== state.pairing.sessionToken) return reject("INVALID_TOKEN");
  if (!Number.isInteger(envelope.sequence) || envelope.sequence <= state.lastAcceptedSequence) {
    return reject("REPLAY_SEQUENCE");
  }
  if (Math.abs(nowMs - envelope.sentAtMs) > state.policy.maxCommandAgeMs) {
    return reject("STALE_COMMAND");
  }

  const requiredCapability = requiredCapabilityForCommand(envelope.command);
  if (!state.peer.grantedCapabilities.includes(requiredCapability)) {
    return reject("CAPABILITY_DENIED");
  }
  if (!isCommandPayloadValid(envelope.command)) {
    return reject("INVALID_PAYLOAD");
  }

  return {
    ok: true,
    capability: requiredCapability,
    command: envelope.command,
    state: Object.freeze({
      ...state,
      lastAcceptedSequence: envelope.sequence,
      lastHeartbeatAtMs: nowMs,
      acceptedCommandCount: state.acceptedCommandCount + 1,
      lastReasonCode: null,
    }),
  };
}

function createSubscribedTransport(
  kind: CompanionTransportKind,
  listeners: Set<(frame: CompanionWireFrame) => void>,
  sendImpl: (frame: CompanionWireFrame) => void,
  closeImpl: () => void,
): CompanionTransportAdapter {
  return {
    kind,
    zeroCostLocalP2p: true,
    send: sendImpl,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    close() {
      listeners.clear();
      closeImpl();
    },
  };
}

export function createLocalLoopbackTransportPair(): readonly [CompanionTransportAdapter, CompanionTransportAdapter] {
  const listenersA = new Set<(frame: CompanionWireFrame) => void>();
  const listenersB = new Set<(frame: CompanionWireFrame) => void>();
  let closed = false;
  const closeBoth = (): void => { closed = true; listenersA.clear(); listenersB.clear(); };
  return [
    createSubscribedTransport("local-loopback", listenersA, (f) => { if (!closed) for (const l of listenersB) l(f); }, closeBoth),
    createSubscribedTransport("local-loopback", listenersB, (f) => { if (!closed) for (const l of listenersA) l(f); }, closeBoth),
  ] as const;
}

export function createBroadcastChannelTransport(channelName: string): CompanionTransportAdapter {
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(channelName) : null;
  const listeners = new Set<(frame: CompanionWireFrame) => void>();
  if (channel) {
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data && typeof event.data === "object" && "type" in event.data) {
        for (const listener of listeners) listener(event.data as CompanionWireFrame);
      }
    };
  }
  return createSubscribedTransport("broadcast-channel", listeners, (frame) => { channel?.postMessage(frame); }, () => { channel?.close(); });
}

export function createWebRtcDataChannelTransport(dataChannel: RtcDataChannelLike): CompanionTransportAdapter {
  const listeners = new Set<(frame: CompanionWireFrame) => void>();
  const onMessage = (event: { readonly data: unknown }): void => {
    if (typeof event.data !== "string") return;
    try {
      const parsed: unknown = JSON.parse(event.data);
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        for (const listener of listeners) listener(parsed as CompanionWireFrame);
      }
    } catch {
      // 손상된 비-JSON 데이터그램은 프로토콜 안전을 위해 무시한다.
    }
  };
  dataChannel.addEventListener("message", onMessage);
  return createSubscribedTransport(
    "webrtc-datachannel",
    listeners,
    (frame) => { if (dataChannel.readyState === "open") dataChannel.send(JSON.stringify(frame)); },
    () => { dataChannel.removeEventListener("message", onMessage); dataChannel.close(); },
  );
}

export class CompanionHostBridgeController {
  private state: CompanionBridgeSessionState;
  private readonly transport: CompanionTransportAdapter;
  private readonly onCommand: (command: CompanionBridgeCommand, capability: CompanionCapability) => void;
  private readonly nowProvider: () => number;
  private readonly unsubscribe: () => void;

  constructor(options: {
    readonly initialState: CompanionBridgeSessionState;
    readonly transport: CompanionTransportAdapter;
    readonly onCommand: (command: CompanionBridgeCommand, capability: CompanionCapability) => void;
    readonly nowProvider?: () => number;
  }) {
    this.state = options.initialState;
    this.transport = options.transport;
    this.onCommand = options.onCommand;
    this.nowProvider = options.nowProvider ?? (() => Date.now());
    this.unsubscribe = this.transport.subscribe((frame) => {
      this.handleFrame(frame);
    });
  }

  getState(): CompanionBridgeSessionState {
    return this.state;
  }

  tick(nowMs = this.nowProvider()): CompanionBridgeSessionState {
    this.state = evaluateBridgeLiveness(this.state, nowMs);
    return this.state;
  }

  dispose(): void {
    this.unsubscribe();
    this.state = disconnectCompanionBridge(this.state);
    this.transport.close();
  }

  private handleFrame(frame: CompanionWireFrame): void {
    const nowMs = this.nowProvider();
    if (frame.type === "pair-request") {
      const result = acceptCompanionPairing(this.state, frame.request, nowMs);
      this.state = result.state;
      this.transport.send({
        type: "pair-ack",
        ok: result.ok,
        sessionId: this.state.pairing.sessionId,
        reasonCode: result.ok ? undefined : result.reasonCode,
      });
      return;
    }
    if (frame.type === "command") {
      const result = dispatchCompanionCommand(this.state, frame.envelope, nowMs);
      this.state = result.state;
      if (result.ok) {
        this.onCommand(result.command, result.capability);
      }
      this.transport.send({
        type: "command-ack",
        sequence: frame.envelope.sequence,
        ok: result.ok,
        reasonCode: result.ok ? undefined : result.reasonCode,
      });
      return;
    }
    if (frame.type === "heartbeat") {
      const result = recordBridgeHeartbeat(this.state, frame.senderDeviceId, nowMs);
      this.state = result.state;
      return;
    }
    if (frame.type === "disconnect" && frame.sessionId === this.state.pairing.sessionId) {
      this.state = disconnectCompanionBridge(this.state);
    }
  }
}
