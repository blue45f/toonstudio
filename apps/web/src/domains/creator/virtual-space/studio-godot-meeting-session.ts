/**
 * Godot 무대 회의 구역 화상 세션 (가상스튜디오 재개발 3단계 — DESIGN §2.2).
 *
 * 소유권: 화상 연결은 웹 셸이 소유한다. Godot는 구역 진입 판정과 신호 중계만 맡고,
 * 이 모듈이 RTCPeerConnection·미디어·연결 경로 상태를 관리한다.
 * 신호는 Worker의 screen-signaling 채널을 Godot 브리지 경유로 주고받으며,
 * 메시 세션(p2p-mesh-v1)은 핸드셰이크 없이 offer/answer/ice를 바로 중계한다.
 * ICE는 서버 정책(STUN-only, TURN 없음)이 주입한 팩토리로만 만든다.
 * P2P가 성립하지 않으면 상태를 "relay-fallback"으로 정직하게 표기한다 —
 * 프레즌스 WebSocket(보장 경로)은 그대로 유지되고, 화상은 재시도로만 복구한다.
 */

export const GODOT_MEETING_MESH_SESSION_ID = "p2p-mesh-v1";

export type GodotMeetingRoute =
  | "idle" // 구역 밖이거나 혼자라 시작할 수 없음
  | "ready" // 둘 다 회의 구역 안 — 시작 대기
  | "connecting" // 협상 중
  | "p2p" // P2P 직접 연결 성립
  | "relay-fallback" // P2P 불가 — 폴백 상태 표기 (미디어 릴레이 없음, 정직 표기)
  | "media-denied" // 카메라·마이크 권한 거부
  | "failed"; // 그 밖의 실패

export interface GodotMeetingContext {
  readonly selfInMeeting: boolean;
  readonly peerInMeeting: boolean;
  readonly peerClientId: string | null;
  readonly selfClientId: string | null;
}

export interface GodotMeetingSessionDeps {
  /** Godot 브리지로 신호를 보낸다 (셸 → 무대 → Worker screen-signaling). */
  readonly sendSignal: (payload: Record<string, unknown>) => void;
  /** ICE 정책 리스가 만든 연결 팩토리 (STUN-only). */
  readonly createPeerConnection: () => RTCPeerConnection;
  /** 카메라·마이크 획득. 기본값은 navigator.mediaDevices.getUserMedia. */
  readonly getLocalStream: () => Promise<MediaStream>;
  readonly onRoute: (route: GodotMeetingRoute) => void;
  readonly onRemoteStream: (stream: MediaStream | null) => void;
  readonly onLocalStream: (stream: MediaStream | null) => void;
  readonly setTimer?: (callback: () => void, delayMs: number) => unknown;
  readonly clearTimer?: (timer: unknown) => void;
  readonly randomId?: () => string;
}

const ICE_DISCONNECT_GRACE_MS = 5_000;

interface IceCandidateInitLike {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  usernameFragment: string | null;
}

export class StudioGodotMeetingSession {
  private readonly deps: GodotMeetingSessionDeps;
  private readonly setTimer: (callback: () => void, delayMs: number) => unknown;
  private readonly clearTimer: (timer: unknown) => void;
  private context: GodotMeetingContext = {
    selfInMeeting: false,
    peerInMeeting: false,
    peerClientId: null,
    selfClientId: null,
  };
  private route: GodotMeetingRoute = "idle";
  private peerConnection: RTCPeerConnection | null = null;
  private peerConnectionId: string | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private pendingCandidates: IceCandidateInitLike[] = [];
  private disconnectTimer: unknown = null;
  private started = false;
  private closed = false;

  constructor(deps: GodotMeetingSessionDeps) {
    this.deps = deps;
    this.setTimer =
      deps.setTimer ??
      ((callback, delayMs) => globalThis.setTimeout(callback, delayMs));
    this.clearTimer =
      deps.clearTimer ??
      ((timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  get currentRoute(): GodotMeetingRoute {
    return this.route;
  }

  get hasLocalStream(): boolean {
    return this.localStream !== null;
  }

  /** 구역 판정 변화 (Godot onZoneChanged에서 도출)를 반영한다. */
  setContext(context: GodotMeetingContext): void {
    const peerChanged =
      context.peerClientId !== this.context.peerClientId ||
      context.selfClientId !== this.context.selfClientId;
    this.context = context;
    if (!context.selfInMeeting || !context.peerInMeeting) {
      // 구역 이탈은 즉시 종료한다 — 상대 화면에 끊긴 화상이 남지 않게.
      this.teardown(true);
      this.setRoute(context.selfInMeeting ? "idle" : "idle");
      return;
    }
    if (peerChanged && this.peerConnection) {
      this.teardown(true);
    }
    if (this.started && !this.peerConnection && !this.closed) {
      void this.negotiate();
    } else if (!this.started) {
      this.setRoute("ready");
    }
  }

  /** 사용자가 패널에서 회의 시작을 눌렀을 때. 미디어 획득부터 협상까지 진행한다. */
  async start(): Promise<void> {
    if (this.closed || this.started) return;
    if (!this.context.selfInMeeting || !this.context.peerInMeeting) return;
    this.started = true;
    await this.negotiate();
  }

  /** 사용자가 회의 종료를 눌렀을 때. 구역 안에 있어도 다시 시작할 수 있다. */
  stop(): void {
    this.started = false;
    this.teardown(true);
    if (this.context.selfInMeeting && this.context.peerInMeeting) {
      this.setRoute("ready");
    } else {
      this.setRoute("idle");
    }
  }

  /** 무대(상대)에서 온 신호를 처리한다. */
  async handleSignal(
    fromClientId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (this.closed) return;
    const kind = typeof payload.kind === "string" ? payload.kind : "";
    if (kind === "signal.stop") {
      this.teardown(false);
      if (this.context.selfInMeeting && this.context.peerInMeeting) {
        this.setRoute(this.started ? "ready" : "ready");
        this.started = false;
      }
      return;
    }
    if (payload.sessionId !== GODOT_MEETING_MESH_SESSION_ID) return;
    if (kind === "signal.offer" && typeof payload.sdp === "string") {
      // 상대가 먼저 시작했으면 이쪽도 시작한 것으로 간주한다 (구역 동선의 대칭성).
      this.started = true;
      await this.answerOffer(fromClientId, payload);
    } else if (kind === "signal.answer" && typeof payload.sdp === "string") {
      if (this.peerConnection && this.peerConnectionId === payload.peerConnectionId) {
        await this.peerConnection.setRemoteDescription({
          type: "answer",
          sdp: payload.sdp,
        });
        await this.flushPendingCandidates();
      }
    } else if (kind === "signal.ice") {
      const candidate = payload.candidate as
        | Record<string, unknown>
        | undefined;
      if (!candidate || typeof candidate.candidate !== "string") return;
      const init: IceCandidateInitLike = {
        candidate: candidate.candidate,
        sdpMid:
          typeof candidate.sdpMid === "string" ? candidate.sdpMid : null,
        sdpMLineIndex:
          typeof candidate.sdpMLineIndex === "number"
            ? candidate.sdpMLineIndex
            : null,
        usernameFragment:
          typeof candidate.usernameFragment === "string"
            ? candidate.usernameFragment
            : null,
      };
      if (
        this.peerConnection &&
        this.peerConnection.remoteDescription &&
        this.peerConnectionId === payload.peerConnectionId
      ) {
        await this.peerConnection.addIceCandidate(init);
      } else {
        this.pendingCandidates.push(init);
      }
    }
  }

  setMicEnabled(enabled: boolean): void {
    for (const track of this.localStream?.getAudioTracks() ?? []) {
      track.enabled = enabled;
    }
  }

  setCamEnabled(enabled: boolean): void {
    for (const track of this.localStream?.getVideoTracks() ?? []) {
      track.enabled = enabled;
    }
  }

  close(): void {
    this.closed = true;
    this.teardown(false);
  }

  private setRoute(route: GodotMeetingRoute): void {
    if (this.route === route) return;
    this.route = route;
    this.deps.onRoute(route);
  }

  private async negotiate(): Promise<void> {
    const { peerClientId, selfClientId } = this.context;
    if (!peerClientId || !selfClientId) {
      this.setRoute("failed");
      return;
    }
    this.setRoute("connecting");
    let stream: MediaStream;
    try {
      stream = await this.ensureLocalStream();
    } catch {
      return; // ensureLocalStream이 route를 이미 표기했다.
    }
    if (this.closed || !this.started) return;
    // 발신 규칙: clientId가 더 큰 쪽이 offer 한다 (양쪽이 같은 규칙으로 계산).
    if (selfClientId > peerClientId) {
      const pc = this.openPeerConnection(peerClientId);
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.deps.sendSignal({
        kind: "signal.offer",
        sessionId: GODOT_MEETING_MESH_SESSION_ID,
        peerConnectionId: this.peerConnectionId,
        targetClientId: peerClientId,
        sdp: offer.sdp ?? "",
      });
    }
    // 발신이 아닌 쪽은 상대 offer를 기다린다 (handleSignal의 answerOffer).
  }

  private async answerOffer(
    fromClientId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.setRoute("connecting");
    let stream: MediaStream;
    try {
      stream = await this.ensureLocalStream();
    } catch {
      return;
    }
    if (this.closed) return;
    const pc = this.openPeerConnection(fromClientId);
    this.peerConnectionId =
      typeof payload.peerConnectionId === "string"
        ? payload.peerConnectionId
        : this.peerConnectionId;
    for (const track of stream.getTracks()) {
      pc.addTrack(track, stream);
    }
    await pc.setRemoteDescription({
      type: "offer",
      sdp: String(payload.sdp),
    });
    await this.flushPendingCandidates();
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    this.deps.sendSignal({
      kind: "signal.answer",
      sessionId: GODOT_MEETING_MESH_SESSION_ID,
      peerConnectionId: this.peerConnectionId,
      targetClientId: fromClientId,
      sdp: answer.sdp ?? "",
    });
  }

  private async ensureLocalStream(): Promise<MediaStream> {
    if (this.localStream) return this.localStream;
    try {
      const stream = await this.deps.getLocalStream();
      this.localStream = stream;
      this.deps.onLocalStream(stream);
      return stream;
    } catch (error) {
      const name =
        error instanceof DOMException ? error.name : "";
      this.setRoute(name === "NotAllowedError" ? "media-denied" : "failed");
      this.started = false;
      throw error;
    }
  }

  private openPeerConnection(peerClientId: string): RTCPeerConnection {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    const pc = this.deps.createPeerConnection();
    this.peerConnection = pc;
    this.peerConnectionId =
      this.peerConnectionId ??
      `godot-meeting-${this.deps.randomId?.() ?? Math.random().toString(36).slice(2, 10)}`;
    pc.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (!candidate || this.peerConnection !== pc) return;
      this.deps.sendSignal({
        kind: "signal.ice",
        sessionId: GODOT_MEETING_MESH_SESSION_ID,
        peerConnectionId: this.peerConnectionId,
        targetClientId: peerClientId,
        candidate: {
          candidate: candidate.candidate,
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          usernameFragment: candidate.usernameFragment ?? null,
        },
      });
    };
    pc.ontrack = (event) => {
      if (this.peerConnection !== pc) return;
      const stream = event.streams[0] ?? null;
      this.remoteStream = stream;
      this.deps.onRemoteStream(stream);
    };
    pc.oniceconnectionstatechange = () => {
      if (this.peerConnection !== pc) return;
      const state = pc.iceConnectionState;
      if (state === "connected" || state === "completed") {
        this.clearDisconnectTimer();
        this.setRoute("p2p");
      } else if (state === "failed") {
        this.enterRelayFallback();
      } else if (state === "disconnected") {
        this.clearDisconnectTimer();
        this.disconnectTimer = this.setTimer(() => {
          if (
            this.peerConnection === pc &&
            pc.iceConnectionState === "disconnected"
          ) {
            this.enterRelayFallback();
          }
        }, ICE_DISCONNECT_GRACE_MS);
      }
    };
    return pc;
  }

  private enterRelayFallback(): void {
    // P2P가 막힌 환경: 미디어 릴레이는 현 스택에 없으므로 상태를 정직하게
    // 표기하고 연결 시도를 멈춘다. 프레즌스(보장 경로)는 영향받지 않는다.
    this.clearDisconnectTimer();
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.setRoute("relay-fallback");
  }

  private async flushPendingCandidates(): Promise<void> {
    if (!this.peerConnection) return;
    const queued = this.pendingCandidates;
    this.pendingCandidates = [];
    for (const candidate of queued) {
      await this.peerConnection.addIceCandidate(candidate);
    }
  }

  private clearDisconnectTimer(): void {
    if (this.disconnectTimer !== null) {
      this.clearTimer(this.disconnectTimer);
      this.disconnectTimer = null;
    }
  }

  private teardown(notifyPeer: boolean): void {
    this.clearDisconnectTimer();
    if (notifyPeer && this.peerConnection && this.context.peerClientId) {
      this.deps.sendSignal({
        kind: "signal.stop",
        shareId: GODOT_MEETING_MESH_SESSION_ID,
      });
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.peerConnectionId = null;
    this.pendingCandidates = [];
    if (this.remoteStream) {
      this.remoteStream = null;
      this.deps.onRemoteStream(null);
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
      this.deps.onLocalStream(null);
    }
  }
}
