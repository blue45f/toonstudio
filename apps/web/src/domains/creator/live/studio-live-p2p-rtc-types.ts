/** p2p 오버레이가 쓰는 최소 RTC 표면 타입 — 테스트가 가짜 피어 연결을 주입할 수 있게 구조적으로 정의한다. */
export interface StudioLiveP2pRtcIceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export interface StudioLiveP2pRtcDataChannel {
  readonly label: string;
  readonly readyState: string;
  readonly bufferedAmount: number;
  readonly ordered?: boolean;
  readonly maxRetransmits?: number | null;
  readonly maxPacketLifeTime?: number | null;
  /** Real RTCDataChannels are switched to "arraybuffer" so mesh ink frames avoid Blob hops. */
  binaryType?: string;
  send(data: string | ArrayBuffer): void;
  close(): void;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

export interface StudioLiveP2pRtcPeerConnection {
  readonly connectionState: string;
  readonly sctp?: { readonly maxMessageSize?: number } | null;
  onicecandidate: ((event: { candidate: StudioLiveP2pRtcIceCandidate | null }) => void) | null;
  ondatachannel: ((event: { channel: StudioLiveP2pRtcDataChannel }) => void) | null;
  onconnectionstatechange: (() => void) | null;
  createDataChannel(label: string): StudioLiveP2pRtcDataChannel;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  close(): void;
}

export type StudioLiveP2pPeerConnectionFactory = () => StudioLiveP2pRtcPeerConnection;
