/**
 * 모바일 컴패니언 모드 QR 페어링 세션 · 원격 단축키/컬러휠/서브뷰/제스처 패드 동기화 프로토콜.
 *
 * CSP 컴패니언 모드(`PWTcpRemoteCommander` 8탭)를 초월해
 * - 1회용 짧은 TTL QR 페어링 토큰 + 챌린지 검증 + 재전송(Replay) 차단
 * - 단축키(QuickAccess)·컬러휠·서브뷰·혼색 패드·제스처 패드·실시간 웹툰 스마트폰 미리보기 동기화
 * - 하트비트 RTT 측정 및 세션 폐기/만료 관리
 * 를 브라우저/WebRTC/WebSocket 전송 계층과 독립된 순수 상태 머신으로 제공한다.
 */

export type CompanionTabId =
  | "quick-access"
  | "touch-gesture"
  | "color-wheel"
  | "sub-view"
  | "color-mixing"
  | "webtoon-preview"
  | "mode-modifier"
  | "settings";

export const COMPANION_TAB_IDS: readonly CompanionTabId[] = Object.freeze([
  "quick-access",
  "touch-gesture",
  "color-wheel",
  "sub-view",
  "color-mixing",
  "webtoon-preview",
  "mode-modifier",
  "settings",
]);

export type CompanionSessionStatus =
  | "awaiting-scan"
  | "paired"
  | "disconnected"
  | "expired"
  | "revoked";

export type CompanionModifierKey = "shift" | "ctrl" | "alt" | "meta" | "space";

export interface CompanionPairingTicket {
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly pairingCode: string;
  readonly hostDeviceName: string;
  readonly issuedAtMs: number;
  readonly expiresAtMs: number;
  readonly qrUri: string;
}

export interface CompanionPeerInfo {
  readonly peerId: string;
  readonly deviceLabel: string;
  readonly platform: "ios" | "android" | "tablet" | "web";
  readonly pairedAtMs: number;
  readonly lastSeenAtMs: number;
  readonly rttMs: number | null;
}

export interface CompanionColorSyncPayload {
  readonly hex: string;
  readonly h: number;
  readonly s: number;
  readonly v: number;
  readonly target: "primary" | "secondary";
}

export interface CompanionSubViewSyncPayload {
  readonly assetId: string | null;
  readonly zoom: number;
  readonly panX: number;
  readonly panY: number;
  readonly flipHorizontal: boolean;
  readonly sampledHex?: string;
}

export interface CompanionGesturePadPayload {
  readonly kind: "pan-zoom-rotate" | "two-finger-undo" | "three-finger-redo" | "modifier-hold";
  readonly deltaX?: number;
  readonly deltaY?: number;
  readonly scaleFactor?: number;
  readonly rotationDeltaDeg?: number;
  readonly modifier?: CompanionModifierKey;
  readonly pressed?: boolean;
}

export interface CompanionWebtoonPreviewPayload {
  readonly pageIndex: number;
  readonly scrollProgress: number;
  readonly viewportWidthPx: number;
}

export type CompanionMessagePayload =
  | { readonly type: "tab.select"; readonly tab: CompanionTabId }
  | { readonly type: "command.trigger"; readonly commandId: string; readonly slotIndex?: number }
  | { readonly type: "color.select"; readonly color: CompanionColorSyncPayload }
  | { readonly type: "subview.sync"; readonly subView: CompanionSubViewSyncPayload }
  | { readonly type: "gesture.pad"; readonly gesture: CompanionGesturePadPayload }
  | { readonly type: "webtoon-preview.sync"; readonly preview: CompanionWebtoonPreviewPayload }
  | { readonly type: "heartbeat.ping"; readonly clientSentAtMs: number }
  | { readonly type: "heartbeat.pong"; readonly clientSentAtMs: number; readonly hostReceivedAtMs: number };

export interface CompanionEnvelope {
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly seq: number;
  readonly sentAtMs: number;
  readonly integrityTag: string;
  readonly payload: CompanionMessagePayload;
}

export interface CompanionSyncedState {
  readonly activeTab: CompanionTabId;
  readonly primaryColorHex: string;
  readonly secondaryColorHex: string;
  readonly activeModifiers: readonly CompanionModifierKey[];
  readonly subView: CompanionSubViewSyncPayload;
  readonly webtoonPreview: CompanionWebtoonPreviewPayload;
  readonly lastTriggeredCommandId: string | null;
  readonly commandCount: number;
  readonly cumulativePanX: number;
  readonly cumulativePanY: number;
  readonly cumulativeZoom: number;
  readonly cumulativeRotationDeg: number;
}

export interface CompanionApplyResult {
  readonly accepted: boolean;
  readonly reason?:
    | "not-paired"
    | "session-mismatch"
    | "session-expired"
    | "invalid-integrity"
    | "replayed-seq";
  readonly replyEnvelope?: CompanionEnvelope;
  readonly state: CompanionSyncedState;
}

const DEFAULT_PAIRING_TTL_MS = 180_000;
const QR_SCHEME_PREFIX = "toonstudio://companion/pair";

function fnv1a64Hex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i += 1) {
    const c = input.charCodeAt(i) & 0xff;
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c + i) & 0xff), 0x85ebca6b) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

function derivePairingCode(sessionId: string, secretSalt: string): string {
  const hex = fnv1a64Hex(`${sessionId}:${secretSalt}`);
  const numeric = Number.parseInt(hex.slice(0, 8), 16) % 1_000_000;
  return String(numeric).padStart(6, "0");
}

/** 세션 공유 비밀(`pairingCode`)과 페이로드를 결합한 결정적 무결성 태그를 생성한다. */
export function computeCompanionIntegrityTag(
  sessionId: string,
  pairingCode: string,
  seq: number,
  payload: CompanionMessagePayload,
): string {
  return fnv1a64Hex(`${sessionId}|${pairingCode}|${seq}|${JSON.stringify(payload)}`);
}

/** 모바일 스캔용 QR URI 문자열을 생성한다. */
export function buildCompanionPairingQrUri(ticket: Omit<CompanionPairingTicket, "qrUri">): string {
  const params = new URLSearchParams({
    v: String(ticket.protocolVersion),
    sid: ticket.sessionId,
    code: ticket.pairingCode,
    host: ticket.hostDeviceName,
    iat: String(ticket.issuedAtMs),
    exp: String(ticket.expiresAtMs),
  });
  return `${QR_SCHEME_PREFIX}?${params.toString()}`;
}

/** QR URI를 파싱하고 필수 필드·버전·숫자 형식을 검증한다. */
export function parseCompanionPairingQrUri(uri: string): CompanionPairingTicket | null {
  if (!uri.startsWith(`${QR_SCHEME_PREFIX}?`)) return null;
  const params = new URLSearchParams(uri.slice(QR_SCHEME_PREFIX.length + 1));
  const version = Number(params.get("v"));
  const sessionId = params.get("sid")?.trim() ?? "";
  const pairingCode = params.get("code")?.trim() ?? "";
  const hostDeviceName = params.get("host")?.trim() ?? "";
  const issuedAtMs = Number(params.get("iat"));
  const expiresAtMs = Number(params.get("exp"));

  if (
    version !== 1
    || sessionId.length < 4
    || !/^\d{6}$/u.test(pairingCode)
    || hostDeviceName.length === 0
    || !Number.isFinite(issuedAtMs)
    || !Number.isFinite(expiresAtMs)
    || expiresAtMs <= issuedAtMs
  ) {
    return null;
  }
  return {
    protocolVersion: 1,
    sessionId,
    pairingCode,
    hostDeviceName,
    issuedAtMs,
    expiresAtMs,
    qrUri: uri,
  };
}

/** 서명된 컴패니언 동기화 봉투(Envelope)를 생성한다. */
export function createSignedCompanionEnvelope(input: {
  readonly sessionId: string;
  readonly pairingCode: string;
  readonly seq: number;
  readonly sentAtMs: number;
  readonly payload: CompanionMessagePayload;
}): CompanionEnvelope {
  return {
    protocolVersion: 1,
    sessionId: input.sessionId,
    seq: input.seq,
    sentAtMs: input.sentAtMs,
    integrityTag: computeCompanionIntegrityTag(
      input.sessionId,
      input.pairingCode,
      input.seq,
      input.payload,
    ),
    payload: input.payload,
  };
}

function initialSyncedState(): CompanionSyncedState {
  return {
    activeTab: "quick-access",
    primaryColorHex: "#111111",
    secondaryColorHex: "#ffffff",
    activeModifiers: [],
    subView: { assetId: null, zoom: 1, panX: 0, panY: 0, flipHorizontal: false },
    webtoonPreview: { pageIndex: 0, scrollProgress: 0, viewportWidthPx: 390 },
    lastTriggeredCommandId: null,
    commandCount: 0,
    cumulativePanX: 0,
    cumulativePanY: 0,
    cumulativeZoom: 1,
    cumulativeRotationDeg: 0,
  };
}

/**
 * 데스크톱 호스트 측 컴패니언 페어링 & 동기화 상태 머신.
 */
export class StudioCompanionPairingHost {
  private readonly ticket: CompanionPairingTicket;
  private status: CompanionSessionStatus = "awaiting-scan";
  private peer: CompanionPeerInfo | null = null;
  private lastInboundSeq = 0;
  private outboundSeq = 0;
  private state: CompanionSyncedState = initialSyncedState();

  constructor(options: {
    readonly sessionId: string;
    readonly secretSalt: string;
    readonly hostDeviceName: string;
    readonly nowMs: number;
    readonly ttlMs?: number;
  }) {
    const ttl = Math.max(10_000, Math.min(900_000, options.ttlMs ?? DEFAULT_PAIRING_TTL_MS));
    const base = {
      protocolVersion: 1 as const,
      sessionId: options.sessionId,
      pairingCode: derivePairingCode(options.sessionId, options.secretSalt),
      hostDeviceName: options.hostDeviceName.trim() || "ToonStudio Desktop",
      issuedAtMs: options.nowMs,
      expiresAtMs: options.nowMs + ttl,
    };
    this.ticket = Object.freeze({ ...base, qrUri: buildCompanionPairingQrUri(base) });
  }

  getTicket(): CompanionPairingTicket {
    return this.ticket;
  }

  getStatus(nowMs?: number): CompanionSessionStatus {
    if (
      this.status === "awaiting-scan"
      && nowMs !== undefined
      && nowMs > this.ticket.expiresAtMs
    ) {
      this.status = "expired";
    }
    return this.status;
  }

  getPeer(): CompanionPeerInfo | null {
    return this.peer;
  }

  getState(): CompanionSyncedState {
    return this.state;
  }

  /** 모바일 피어가 QR 코드와 6자리 페어링 코드를 제출해 세션을 수락한다(1회용). */
  acceptPairing(request: {
    readonly sessionId: string;
    readonly pairingCode: string;
    readonly peerId: string;
    readonly deviceLabel: string;
    readonly platform: CompanionPeerInfo["platform"];
    readonly nowMs: number;
  }): { readonly ok: boolean; readonly reason?: string } {
    if (this.status === "revoked") return { ok: false, reason: "폐기된 페어링 세션입니다." };
    if (this.status === "paired") return { ok: false, reason: "이미 다른 기기가 연결되어 있습니다." };
    if (request.nowMs > this.ticket.expiresAtMs) {
      this.status = "expired";
      return { ok: false, reason: "QR 페어링 유효 시간이 만료되었습니다." };
    }
    if (request.sessionId !== this.ticket.sessionId || request.pairingCode !== this.ticket.pairingCode) {
      return { ok: false, reason: "페어링 코드가 일치하지 않습니다." };
    }
    this.status = "paired";
    this.peer = {
      peerId: request.peerId,
      deviceLabel: request.deviceLabel.trim() || "Companion Mobile",
      platform: request.platform,
      pairedAtMs: request.nowMs,
      lastSeenAtMs: request.nowMs,
      rttMs: null,
    };
    return { ok: true };
  }

  revoke(): void {
    this.status = "revoked";
    this.peer = null;
  }

  disconnect(): void {
    if (this.status === "paired") {
      this.status = "disconnected";
    }
  }

  /** 피어로부터 수신한 동기화 봉투를 검증·적용하고 필요 시 응답 봉투를 생성한다. */
  receiveEnvelope(envelope: CompanionEnvelope, nowMs: number): CompanionApplyResult {
    if (this.status !== "paired" || !this.peer) {
      return { accepted: false, reason: "not-paired", state: this.state };
    }
    if (envelope.sessionId !== this.ticket.sessionId) {
      return { accepted: false, reason: "session-mismatch", state: this.state };
    }
    if (envelope.seq <= this.lastInboundSeq) {
      return { accepted: false, reason: "replayed-seq", state: this.state };
    }
    const expectedTag = computeCompanionIntegrityTag(
      this.ticket.sessionId,
      this.ticket.pairingCode,
      envelope.seq,
      envelope.payload,
    );
    if (envelope.integrityTag !== expectedTag) {
      return { accepted: false, reason: "invalid-integrity", state: this.state };
    }

    this.lastInboundSeq = envelope.seq;
    this.peer = { ...this.peer, lastSeenAtMs: nowMs };

    const { payload } = envelope;
    let replyEnvelope: CompanionEnvelope | undefined;

    switch (payload.type) {
      case "tab.select":
        this.state = { ...this.state, activeTab: payload.tab };
        break;
      case "command.trigger":
        this.state = {
          ...this.state,
          lastTriggeredCommandId: payload.commandId,
          commandCount: this.state.commandCount + 1,
        };
        break;
      case "color.select":
        this.state =
          payload.color.target === "secondary"
            ? { ...this.state, secondaryColorHex: payload.color.hex }
            : { ...this.state, primaryColorHex: payload.color.hex };
        break;
      case "subview.sync":
        this.state = {
          ...this.state,
          subView: { ...payload.subView },
          ...(payload.subView.sampledHex ? { primaryColorHex: payload.subView.sampledHex } : {}),
        };
        break;
      case "gesture.pad":
        this.applyGesture(payload.gesture);
        break;
      case "webtoon-preview.sync":
        this.state = {
          ...this.state,
          webtoonPreview: {
            pageIndex: Math.max(0, Math.floor(payload.preview.pageIndex)),
            scrollProgress: Math.max(0, Math.min(1, payload.preview.scrollProgress)),
            viewportWidthPx: Math.max(240, Math.min(1024, Math.round(payload.preview.viewportWidthPx))),
          },
        };
        break;
      case "heartbeat.ping":
        this.outboundSeq += 1;
        replyEnvelope = createSignedCompanionEnvelope({
          sessionId: this.ticket.sessionId,
          pairingCode: this.ticket.pairingCode,
          seq: this.outboundSeq,
          sentAtMs: nowMs,
          payload: {
            type: "heartbeat.pong",
            clientSentAtMs: payload.clientSentAtMs,
            hostReceivedAtMs: nowMs,
          },
        });
        break;
      case "heartbeat.pong": {
        const rtt = Math.max(0, nowMs - payload.clientSentAtMs);
        this.peer = { ...this.peer, rttMs: rtt };
        break;
      }
    }

    return { accepted: true, replyEnvelope, state: this.state };
  }

  private applyGesture(gesture: CompanionGesturePadPayload): void {
    if (gesture.kind === "two-finger-undo") {
      this.state = {
        ...this.state,
        lastTriggeredCommandId: "edit.undo",
        commandCount: this.state.commandCount + 1,
      };
      return;
    }
    if (gesture.kind === "three-finger-redo") {
      this.state = {
        ...this.state,
        lastTriggeredCommandId: "edit.redo",
        commandCount: this.state.commandCount + 1,
      };
      return;
    }
    if (gesture.kind === "modifier-hold" && gesture.modifier) {
      const next = new Set(this.state.activeModifiers);
      if (gesture.pressed) next.add(gesture.modifier);
      else next.delete(gesture.modifier);
      this.state = { ...this.state, activeModifiers: [...next] };
      return;
    }
    if (gesture.kind === "pan-zoom-rotate") {
      const scaleFactor = gesture.scaleFactor && gesture.scaleFactor > 0 ? gesture.scaleFactor : 1;
      this.state = {
        ...this.state,
        cumulativePanX: this.state.cumulativePanX + (gesture.deltaX ?? 0),
        cumulativePanY: this.state.cumulativePanY + (gesture.deltaY ?? 0),
        cumulativeZoom: Math.max(0.1, Math.min(32, this.state.cumulativeZoom * scaleFactor)),
        cumulativeRotationDeg: this.state.cumulativeRotationDeg + (gesture.rotationDeltaDeg ?? 0),
      };
    }
  }
}
