import { describe, expect, it } from "vitest";

import {
  describeStudioP2pQuality,
  gradeStudioP2pQuality,
  studioP2pAudioConstraints,
  studioP2pAudioEncodingParameters,
  summarizeStudioP2pStats,
  tuneStudioP2pOpusSdp,
  validateStudioExternalMeetingLink,
  type StudioP2pPeerQualitySample,
} from "./studio-p2p-call-quality";

const OFFER_SDP = [
  "v=0",
  "o=- 1 2 IN IP4 127.0.0.1",
  "s=-",
  "m=audio 9 UDP/TLS/RTP/SAVPF 111 126",
  "a=rtpmap:111 opus/48000/2",
  "a=fmtp:111 minptime=10;useinbandfec=1",
  "a=rtpmap:126 telephone-event/8000",
  "m=video 9 UDP/TLS/RTP/SAVPF 96",
  "a=rtpmap:96 VP8/90000",
].join("\r\n");

describe("P2P 오디오 캡처 제약", () => {
  it("에코·노이즈·게인을 켜고 모노·48kHz로 잡는다", () => {
    const constraints = studioP2pAudioConstraints();
    expect(constraints.video).toBe(false);
    expect(constraints.audio).toMatchObject({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48_000,
    });
  });

  it("voiceProcessingOff면 음성 처리를 전부 끈다", () => {
    const audio = studioP2pAudioConstraints({ voiceProcessingOff: true }).audio;
    expect(audio).toMatchObject({
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    });
  });
});

describe("Opus SDP 조정", () => {
  it("기존 fmtp를 보존하면서 DTX·비트레이트·모노를 병합한다", () => {
    const tuned = tuneStudioP2pOpusSdp(OFFER_SDP);
    const fmtp = tuned.split("\r\n").find((line) => line.startsWith("a=fmtp:111"));
    expect(fmtp).toContain("minptime=10");
    expect(fmtp).toContain("useinbandfec=1");
    expect(fmtp).toContain("usedtx=1");
    expect(fmtp).toContain("stereo=0");
    expect(fmtp).toContain("maxaveragebitrate=32000");
    // 영상·telephone-event 페이로드는 건드리지 않는다.
    expect(tuned).toContain("a=rtpmap:96 VP8/90000");
    expect(tuned).toContain("a=rtpmap:126 telephone-event/8000");
  });

  it("상대가 이미 선언한 값은 덮어쓰지 않는다", () => {
    const sdp = OFFER_SDP.replace(
      "a=fmtp:111 minptime=10;useinbandfec=1",
      "a=fmtp:111 minptime=10;usedtx=0;maxaveragebitrate=64000",
    );
    const tuned = tuneStudioP2pOpusSdp(sdp);
    expect(tuned).toContain("usedtx=0");
    expect(tuned).toContain("maxaveragebitrate=64000");
    expect(tuned).not.toContain("usedtx=1");
  });

  it("fmtp가 없는 Opus 페이로드에는 rtpmap 뒤에 삽입하고, Opus가 없으면 원본을 돌려준다", () => {
    const noFmtp = OFFER_SDP.replace("a=fmtp:111 minptime=10;useinbandfec=1\r\n", "");
    const tuned = tuneStudioP2pOpusSdp(noFmtp);
    const lines = tuned.split("\r\n");
    const rtpmapAt = lines.findIndex((line) => line.startsWith("a=rtpmap:111"));
    expect(lines[rtpmapAt + 1]).toContain("a=fmtp:111");
    expect(tuneStudioP2pOpusSdp("v=0\r\nm=video 9 RTP 96")).toBe("v=0\r\nm=video 9 RTP 96");
    expect(tuneStudioP2pOpusSdp("")).toBe("");
  });

  it("송신 인코딩 상한은 오디오 비트레이트와 일치한다", () => {
    expect(studioP2pAudioEncodingParameters().maxBitrate).toBe(32_000);
  });
});

describe("연결 품질 해석", () => {
  const stats = (entries: Record<string, unknown>[]): Map<string, Record<string, unknown>> =>
    new Map(entries.map((entry, index) => [String(index), entry]));

  it("candidate-pair·inbound-rtp에서 RTT·지터·손실을 뽑는다", () => {
    const sample = summarizeStudioP2pStats(
      stats([
        { type: "candidate-pair", state: "succeeded", nominated: true, currentRoundTripTime: 0.09, localCandidateId: "lc1" },
        { type: "local-candidate", id: "lc1", candidateType: "srflx" },
        { type: "inbound-rtp", kind: "audio", jitter: 0.012, packetsLost: 2, packetsReceived: 198, audioLevel: 0.4 },
      ]).values(),
    );
    expect(sample.roundTripTimeMs).toBeCloseTo(90);
    expect(sample.jitterMs).toBeCloseTo(12);
    expect(sample.packetLossRatio).toBeCloseTo(0.01);
    expect(sample.audioLevel).toBe(0.4);
    expect(sample.localCandidateType).toBe("srflx");
    expect(gradeStudioP2pQuality(sample)).toBe("good");
  });

  it("등급 임계값: 지연·손실이 커지면 degraded → poor", () => {
    const base: StudioP2pPeerQualitySample = {
      roundTripTimeMs: 100,
      jitterMs: 10,
      packetLossRatio: 0,
      audioLevel: null,
      candidatePairState: "succeeded",
      localCandidateType: "host",
    };
    expect(gradeStudioP2pQuality(base)).toBe("good");
    expect(gradeStudioP2pQuality({ ...base, roundTripTimeMs: 250 })).toBe("degraded");
    expect(gradeStudioP2pQuality({ ...base, packetLossRatio: 0.05 })).toBe("degraded");
    expect(gradeStudioP2pQuality({ ...base, roundTripTimeMs: 500 })).toBe("poor");
    expect(gradeStudioP2pQuality({ ...base, jitterMs: 120 })).toBe("poor");
    expect(
      gradeStudioP2pQuality({
        ...base,
        roundTripTimeMs: null,
        jitterMs: null,
        packetLossRatio: null,
      }),
    ).toBe("unknown");
  });

  it("표시 문구에 등급과 RTT가 함께 들어간다", () => {
    const quality = describeStudioP2pQuality(
      stats([{ type: "candidate-pair", state: "succeeded", currentRoundTripTime: 0.12 }]).values(),
    );
    expect(quality.grade).toBe("good");
    expect(quality.labelKo).toContain("120ms");
  });
});

describe("외부 회의 링크 대안 검증", () => {
  it("알려진 회의 호스트의 https 링크를 허용한다", () => {
    expect(validateStudioExternalMeetingLink("https://meet.google.com/abc-defg-hij").ok).toBe(true);
    expect(validateStudioExternalMeetingLink(" https://us02web.zoom.us/j/123456 ").ok).toBe(true);
    expect(validateStudioExternalMeetingLink("https://teams.microsoft.com/l/meetup-join/x").ok).toBe(true);
  });

  it("http·자격증명·비표준 포트·미등록 호스트를 거부한다", () => {
    expect(validateStudioExternalMeetingLink("http://meet.google.com/abc")).toMatchObject({ ok: false, reason: "not-https" });
    expect(validateStudioExternalMeetingLink("https://user:pw@meet.google.com/abc")).toMatchObject({ ok: false, reason: "credentials-in-url" });
    expect(validateStudioExternalMeetingLink("https://meet.google.com:8443/abc")).toMatchObject({ ok: false, reason: "nonstandard-port" });
    expect(validateStudioExternalMeetingLink("https://evil-meet.example.com/abc")).toMatchObject({ ok: false, reason: "unlisted-host" });
    expect(validateStudioExternalMeetingLink("https://meet.google.com.evil.com/abc")).toMatchObject({ ok: false, reason: "unlisted-host" });
    expect(validateStudioExternalMeetingLink("")).toMatchObject({ ok: false, reason: "empty" });
    expect(validateStudioExternalMeetingLink("그냥 텍스트")).toMatchObject({ ok: false, reason: "not-a-url" });
  });
});
