import { describe, expect, it, vi } from "vitest";

import {
  StudioGodotMeetingSession,
  type GodotMeetingRoute,
} from "./studio-godot-meeting-session";

class FakeTrack {
  kind = "audio";
  enabled = true;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  tracks = [new FakeTrack(), new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
}

class FakePeerConnection {
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  iceConnectionState = "new";
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  ontrack: ((event: { streams: unknown[] }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  addedCandidates: unknown[] = [];
  closed = false;
  addedTracks: unknown[] = [];

  addTrack(track: unknown) {
    this.addedTracks.push(track);
  }
  async createOffer() {
    return { type: "offer", sdp: "sdp-offer" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "sdp-answer" };
  }
  async setLocalDescription(description: unknown) {
    this.localDescription = description;
  }
  async setRemoteDescription(description: unknown) {
    this.remoteDescription = description;
  }
  async addIceCandidate(candidate: unknown) {
    this.addedCandidates.push(candidate);
  }
  close() {
    this.closed = true;
  }
}

function makeSession(
  overrides: {
    selfClientId?: string;
    peerClientId?: string;
    getLocalStream?: () => Promise<MediaStream>;
  } = {},
) {
  const sent: Record<string, unknown>[] = [];
  const routes: GodotMeetingRoute[] = [];
  const pcs: FakePeerConnection[] = [];
  const localStream = new FakeStream();
  localStream.tracks[1].kind = "video";
  const session = new StudioGodotMeetingSession({
    sendSignal: (payload) => sent.push(payload),
    createPeerConnection: () => {
      const pc = new FakePeerConnection();
      pcs.push(pc);
      return pc as unknown as RTCPeerConnection;
    },
    getLocalStream:
      overrides.getLocalStream ??
      (async () => localStream as unknown as MediaStream),
    onRoute: (route) => routes.push(route),
    onRemoteStream: () => undefined,
    onLocalStream: () => undefined,
    randomId: () => "test1234",
  });
  const context = {
    selfInMeeting: true,
    peerInMeeting: true,
    selfClientId: overrides.selfClientId ?? "client-b",
    peerClientId: overrides.peerClientId ?? "client-a",
  };
  return { session, sent, routes, pcs, localStream, context };
}

describe("StudioGodotMeetingSession", () => {
  it("becomes ready only when both sides are in the meeting zone", () => {
    const { session, routes, context } = makeSession();
    session.setContext({ ...context, peerInMeeting: false });
    expect(routes).not.toContain("ready");
    session.setContext(context);
    expect(routes).toContain("ready");
  });

  it("the larger clientId offers, the smaller answers, and ICE flows both ways", async () => {
    const offerer = makeSession({ selfClientId: "client-b", peerClientId: "client-a" });
    offerer.session.setContext(offerer.context);
    await offerer.session.start();
    const offer = offerer.sent.find((payload) => payload.kind === "signal.offer");
    expect(offer).toMatchObject({
      sessionId: "p2p-mesh-v1",
      peerConnectionId: "godot-meeting-test1234",
      targetClientId: "client-a",
      sdp: "sdp-offer",
    });
    expect(offerer.routes).toContain("connecting");

    const answerer = makeSession({ selfClientId: "client-a", peerClientId: "client-b" });
    answerer.session.setContext(answerer.context);
    await answerer.session.handleSignal("client-b", offer as Record<string, unknown>);
    const answer = answerer.sent.find((payload) => payload.kind === "signal.answer");
    expect(answer).toMatchObject({
      peerConnectionId: "godot-meeting-test1234",
      targetClientId: "client-b",
      sdp: "sdp-answer",
    });

    await offerer.session.handleSignal("client-a", answer as Record<string, unknown>);
    expect(offerer.pcs[0]?.remoteDescription).toMatchObject({ type: "answer" });

    await offerer.session.handleSignal("client-a", {
      kind: "signal.ice",
      sessionId: "p2p-mesh-v1",
      peerConnectionId: "godot-meeting-test1234",
      candidate: { candidate: "candidate:1", sdpMid: "0", sdpMLineIndex: 0, usernameFragment: null },
    });
    expect(offerer.pcs[0]?.addedCandidates).toHaveLength(1);

    offerer.pcs[0]!.iceConnectionState = "connected";
    offerer.pcs[0]!.oniceconnectionstatechange?.();
    expect(offerer.routes).toContain("p2p");
  });

  it("marks relay-fallback honestly when ICE fails", async () => {
    const { session, routes, pcs, context } = makeSession();
    session.setContext(context);
    await session.start();
    pcs[0]!.iceConnectionState = "failed";
    pcs[0]!.oniceconnectionstatechange?.();
    expect(routes).toContain("relay-fallback");
    expect(pcs[0]?.closed).toBe(true);
  });

  it("marks media-denied when getUserMedia is refused", async () => {
    const denied = new DOMException("denied", "NotAllowedError");
    const { session, routes, context } = makeSession({
      getLocalStream: async () => {
        throw denied;
      },
    });
    session.setContext(context);
    await session.start();
    expect(routes).toContain("media-denied");
  });

  it("tears down when either side leaves the zone", async () => {
    const { session, sent, pcs, localStream, context } = makeSession();
    session.setContext(context);
    await session.start();
    session.setContext({ ...context, peerInMeeting: false });
    expect(pcs[0]?.closed).toBe(true);
    expect(localStream.tracks.every((track) => track.stopped)).toBe(true);
    expect(sent.some((payload) => payload.kind === "signal.stop")).toBe(true);
  });

  it("ignores signals for other sessions", async () => {
    const { session, pcs, context } = makeSession();
    session.setContext(context);
    await session.handleSignal("client-a", {
      kind: "signal.offer",
      sessionId: "someone-elses-share",
      peerConnectionId: "x",
      sdp: "sdp",
    });
    expect(pcs).toHaveLength(0);
  });
});
