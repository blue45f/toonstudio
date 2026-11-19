import type { StudioLiveP2pRtcIceCandidate, StudioLiveP2pRtcPeerConnection } from "./studio-live-p2p-rtc-types";

type DescriptionType = "offer" | "answer";
const OFFER_RETRY_MS = 3000;
const MAX_OFFER_RETRIES = 8;

/** 첫 참가 알림과 SDP의 도착 순서가 달라도 같은 데이터 채널 연결을 마무리한다. */
export class StudioLiveP2pMeshHandshake {
  private outgoing: { type: DescriptionType; sdp: string } | null = null;
  private accepted: { type: DescriptionType; sdp: string } | null = null;
  private applying = false;
  private lastOfferAt = 0;
  private offerExpiresAt = 0;
  private retriesLeft = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly incomingIce: RTCIceCandidateInit[] = [];
  private readonly localIce: StudioLiveP2pRtcIceCandidate[] = [];

  constructor(
    private readonly connection: StudioLiveP2pRtcPeerConnection,
    private readonly isCurrent: () => boolean,
    private readonly now: () => number,
    private readonly sendDescription: (type: DescriptionType, sdp: string) => void,
    private readonly sendIce: (candidate: StudioLiveP2pRtcIceCandidate) => void,
  ) {}

  async offer(): Promise<void> {
    const offer = await this.connection.createOffer();
    if (!this.isCurrent()) return;
    await this.connection.setLocalDescription(offer);
    if (!this.isCurrent() || !offer.sdp) return;
    this.outgoing = { type: "offer", sdp: offer.sdp };
    this.lastOfferAt = this.now();
    this.cancelOfferRetries();
    this.retriesLeft = MAX_OFFER_RETRIES;
    this.offerExpiresAt = this.lastOfferAt + OFFER_RETRY_MS * (MAX_OFFER_RETRIES + 1);
    // 상대가 JOIN을 마치기 전에 첫 SDP를 받으면 폐기한다. 권한 확인 후에도 접속 알림이 새로 오지는 않는다.
    this.retryTimer = setTimeout(() => this.retryOffer(), OFFER_RETRY_MS);
    this.sendDescription("offer", offer.sdp);
  }

  onPresence(): void {
    if (this.retryTimer !== null && this.now() - this.lastOfferAt >= OFFER_RETRY_MS) this.retryOffer();
  }

  private retryOffer(): void {
    this.cancelOfferRetries();
    const now = this.now();
    if (!this.isCurrent() || this.accepted || now > this.offerExpiresAt) return;
    this.lastOfferAt = now;
    if (--this.retriesLeft > 0) this.retryTimer = setTimeout(() => this.retryOffer(), OFFER_RETRY_MS);
    if (!this.applying) this.replay();
  }

  cancelOfferRetries(): void {
    if (this.retryTimer !== null) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  onLocalIce(candidate: StudioLiveP2pRtcIceCandidate): void {
    if (!this.isCurrent() || !candidate.candidate) return;
    if (this.localIce.length < 32) this.localIce.push(candidate);
    this.sendIce(candidate);
  }

  async onRemoteIce(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.isCurrent()) return;
    if (this.accepted) await this.connection.addIceCandidate(candidate);
    else if (this.incomingIce.length < 32) this.incomingIce.push(candidate);
  }

  async receive(type: DescriptionType, sdp: string): Promise<void> {
    if (!this.isCurrent() || this.applying) return;
    if (this.accepted?.type === type && this.accepted.sdp === sdp) {
      if (type === "offer") this.replay();
      return;
    }
    this.applying = true;
    try {
      await this.connection.setRemoteDescription({ type, sdp });
      if (!this.isCurrent()) return;
      if (type === "offer") {
        const answer = await this.connection.createAnswer();
        if (!this.isCurrent()) return;
        await this.connection.setLocalDescription(answer);
        if (!this.isCurrent() || !answer.sdp) return;
        this.outgoing = { type: "answer", sdp: answer.sdp };
        this.sendDescription("answer", answer.sdp);
      }
      this.accepted = { type, sdp };
      this.cancelOfferRetries();
      for (const candidate of this.incomingIce.splice(0)) {
        if (!this.isCurrent()) return;
        try {
          await this.connection.addIceCandidate(candidate);
        } catch {
          // 이전 ICE 세대의 후보 하나가 현재 연결의 나머지 후보를 막지 않게 한다.
        }
      }
    } finally {
      this.applying = false;
    }
  }

  private replay(): void {
    if (!this.outgoing) return;
    this.sendDescription(this.outgoing.type, this.outgoing.sdp);
    for (const candidate of this.localIce) this.sendIce(candidate);
  }
}
