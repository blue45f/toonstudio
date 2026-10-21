/**
 * P2P 통화 품질 (C7) — 무료 P2P 범위 안에서 코드로 가능한 개선만 모은 순수 모듈.
 *
 * 유료 SFU·외부 미디어 서버는 도입하지 않는다. 여기서 하는 일은 전부 브라우저
 * 내장 WebRTC 위의 설정·해석이다.
 *
 * 1. 오디오 캡처 제약: 에코 제거·노이즈 억제·자동 게인은 이미 켜져 있었고, 여기에
 *    채널 수(모노)·샘플레이트 힌트를 더해 대역폭과 처리 비용을 줄인다.
 * 2. Opus SDP 조정: offer/answer SDP에서 Opus 페이로드에 stereo=0·sprop-stereo=0·
 *    maxaveragebitrate·usedtx=1(무음 구간 전송 중단)·useinbandfec=1(대역 내 FEC)을
 *    선언한다. 음성 통화에 스테레오는 불필요하고, DTX와 FEC는 패킷 손실·지연을
 *    줄이는 무료 수단이다. SDP를 만들지 못하면 원본을 그대로 돌려준다(fail-open).
 * 3. 송신 파라미터: 오디오 sender에 maxBitrate 상한을 걸어 영상과 대역폭을 다투지
 *    않게 한다 (적용은 컨트롤러가 RTCRtpSender.setParameters로 수행).
 * 4. 연결 품질 해석: RTCPeerConnection.getStats() 스냅샷에서 RTT·지터·패킷 손실·
 *    오디오 레벨을 뽑아 good/degraded/poor 등급과 화면 표시 문구로 바꾼다.
 * 5. 외부 회의 링크 대안: P2P가 회사망 등에서 막힐 때를 위해, 세션에 붙이는
 *    외부 회의 URL을 검증한다. https + 알려진 회의 호스트만 허용하고, 자격증명·
 *    비표준 포트가 든 URL은 거부한다 (링크 붙이기이지 외부 서비스 연동이 아니다).
 */

/* ------------------------------------------------------------------ 캡처 제약 */

export interface StudioP2pAudioCaptureOptions {
  /** 노이즈 억제를 끌지 여부. 조용한 스튜디오 녹음에서는 억제가 음질을 해칠 수 있다. 기본 false(억제 유지). */
  readonly voiceProcessingOff?: boolean;
}

/** 마이크 캡처 제약 — 음성 통화 기본값. */
export function studioP2pAudioConstraints(
  options: StudioP2pAudioCaptureOptions = {},
): MediaStreamConstraints {
  const off = options.voiceProcessingOff === true;
  return {
    audio: {
      echoCancellation: !off,
      noiseSuppression: !off,
      autoGainControl: !off,
      channelCount: 1,
      sampleRate: 48_000,
    },
    video: false,
  };
}

/* ------------------------------------------------------------------ Opus SDP */

/** Opus 송신 목표 비트레이트 (bps). 음성 단독으로는 32kbps면 충분하고 지연에 유리하다. */
export const STUDIO_P2P_OPUS_MAX_AVERAGE_BITRATE = 32_000;

const OPUS_FMTP_KEYS = ["stereo", "sprop-stereo", "maxaveragebitrate", "usedtx", "useinbandfec"] as const;

function opusPayloadTypes(sdp: string): readonly string[] {
  const types = new Set<string>();
  for (const line of sdp.split(/\r\n|\n/u)) {
    const rtpmap = /^a=rtpmap:(\d+)\s+opus\//iu.exec(line);
    if (rtpmap?.[1]) types.add(rtpmap[1]);
  }
  return [...types];
}

/**
 * SDP의 Opus fmtp에 음성 최적화 파라미터를 병합한다.
 * 이미 선언된 값은 덮어쓰지 않고(상대 구현의 선택 존중), 없는 키만 채운다.
 * Opus가 없는 SDP·빈 SDP는 원본 그대로 반환한다.
 */
export function tuneStudioP2pOpusSdp(sdp: string): string {
  if (!sdp) return sdp;
  const types = opusPayloadTypes(sdp);
  if (types.length === 0) return sdp;
  const lines = sdp.split(/\r\n|\n/u);
  const seen = new Set<string>();
  const tuned = lines.map((line) => {
    const fmtp = /^a=fmtp:(\d+)\s+(.+)$/u.exec(line);
    if (!fmtp || !types.includes(fmtp[1] ?? "")) return line;
    const payload = fmtp[1] as string;
    seen.add(payload);
    const params = new Map<string, string>();
    for (const part of (fmtp[2] ?? "").split(";")) {
      const eq = part.indexOf("=");
      if (eq > 0) params.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
      else if (part.trim()) params.set(part.trim(), "");
    }
    const additions: Readonly<Record<string, string>> = {
      stereo: "0",
      "sprop-stereo": "0",
      maxaveragebitrate: String(STUDIO_P2P_OPUS_MAX_AVERAGE_BITRATE),
      usedtx: "1",
      useinbandfec: "1",
    };
    for (const key of OPUS_FMTP_KEYS) {
      if (!params.has(key)) params.set(key, additions[key] ?? "");
    }
    const body = [...params.entries()]
      .map(([key, value]) => (value === "" ? key : `${key}=${value}`))
      .join(";");
    return `a=fmtp:${payload} ${body}`;
  });
  // fmtp 줄 자체가 없는 Opus 페이로드는 rtpmap 뒤에 새로 삽입한다.
  for (const payload of types) {
    if (seen.has(payload)) continue;
    const at = tuned.findIndex((line) => line.startsWith(`a=rtpmap:${payload} `));
    if (at >= 0) {
      tuned.splice(
        at + 1,
        0,
        `a=fmtp:${payload} minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=${STUDIO_P2P_OPUS_MAX_AVERAGE_BITRATE}`,
      );
    }
  }
  return tuned.join("\r\n");
}

/* ------------------------------------------------------------------ 송신 파라미터 */

/** 오디오 sender에 적용할 인코딩 상한. 영상 sender에는 적용하지 않는다. */
export function studioP2pAudioEncodingParameters(): RTCRtpEncodingParameters {
  return { maxBitrate: STUDIO_P2P_OPUS_MAX_AVERAGE_BITRATE, priority: "high", networkPriority: "high" };
}

/* ------------------------------------------------------------------ 품질 해석 */

export type StudioP2pCallQualityGrade = "good" | "degraded" | "poor" | "unknown";

/** getStats()에서 뽑은 한 피어 연결의 품질 스냅샷. 측정 불가 항목은 null. */
export interface StudioP2pPeerQualitySample {
  readonly roundTripTimeMs: number | null;
  readonly jitterMs: number | null;
  /** 0..1. 수신 패킷 중 손실 비율. */
  readonly packetLossRatio: number | null;
  /** 0..1 원격 오디오 레벨 (발화 표시·무음 감지용). */
  readonly audioLevel: number | null;
  readonly candidatePairState: string | null;
  /** 로컬 후보가 relay(TURN)인지 srflx/p2p 직접인지. 이 제품은 기본 직접 연결이다. */
  readonly localCandidateType: string | null;
}

export interface StudioP2pPeerQuality {
  readonly grade: StudioP2pCallQualityGrade;
  readonly sample: StudioP2pPeerQualitySample;
  /** 화면에 그대로 보여줄 짧은 상태 문구. */
  readonly labelKo: string;
  readonly labelEn: string;
}

/** RTCStatsReport를 열거 가능한 레코드 목록으로 바꾸는 최소 구조 (테스트 주입용). */
export type StudioP2pStatsLike = Iterable<Readonly<Record<string, unknown>>>;

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function summarizeStudioP2pStats(report: StudioP2pStatsLike): StudioP2pPeerQualitySample {
  let rtt: number | null = null;
  let jitter: number | null = null;
  let audioLevel: number | null = null;
  let pairState: string | null = null;
  let localCandidateType: string | null = null;
  let packetsLost = 0;
  let packetsReceived = 0;
  let sawLossCounters = false;
  const candidates = new Map<string, Record<string, unknown>>();
  let nominatedPair: Record<string, unknown> | null = null;

  for (const stat of report) {
    if (stat.type === "candidate-pair") {
      if (stat.nominated === true || stat.state === "succeeded") nominatedPair = stat;
      if (typeof stat.state === "string") pairState = stat.state;
      const pairRtt = num(stat.currentRoundTripTime);
      if (pairRtt !== null) rtt = pairRtt * 1_000;
    } else if (stat.type === "remote-inbound-rtp" || stat.type === "inbound-rtp") {
      const statJitter = num(stat.jitter);
      if (statJitter !== null) jitter = statJitter * 1_000;
      const statRtt = num(stat.roundTripTime);
      if (statRtt !== null) rtt = statRtt * 1_000;
      const lost = num(stat.packetsLost);
      const received = num(stat.packetsReceived);
      if (lost !== null && received !== null) {
        packetsLost += lost;
        packetsReceived += received;
        sawLossCounters = true;
      }
      const level = num(stat.audioLevel);
      if (level !== null) audioLevel = level;
    } else if (
      (stat.type === "local-candidate" || stat.type === "remote-candidate")
      && typeof stat.id === "string"
    ) {
      candidates.set(stat.id, stat);
    }
  }
  if (nominatedPair && typeof nominatedPair.localCandidateId === "string") {
    const local = candidates.get(nominatedPair.localCandidateId);
    if (local && typeof local.candidateType === "string") {
      localCandidateType = local.candidateType;
    }
  }
  const totalPackets = packetsLost + packetsReceived;
  return Object.freeze({
    roundTripTimeMs: rtt,
    jitterMs: jitter,
    packetLossRatio: sawLossCounters && totalPackets > 0 ? packetsLost / totalPackets : null,
    audioLevel,
    candidatePairState: pairState,
    localCandidateType,
  });
}

/**
 * 품질 등급 판정. 하나라도 측정값이 없으면 unknown을 섞지 않고, 있는 값만으로
 * 판정하되 전부 없으면 unknown이다. 임계값은 음성 통화 체감 기준으로 잡았다.
 */
export function gradeStudioP2pQuality(
  sample: StudioP2pPeerQualitySample,
): StudioP2pCallQualityGrade {
  const { roundTripTimeMs: rtt, jitterMs: jitter, packetLossRatio: loss } = sample;
  if (rtt === null && jitter === null && loss === null) return "unknown";
  if ((rtt !== null && rtt > 400) || (loss !== null && loss > 0.08) || (jitter !== null && jitter > 80)) {
    return "poor";
  }
  if ((rtt !== null && rtt > 180) || (loss !== null && loss > 0.02) || (jitter !== null && jitter > 30)) {
    return "degraded";
  }
  return "good";
}

const QUALITY_LABELS: Readonly<Record<StudioP2pCallQualityGrade, { ko: string; en: string }>> = {
  good: { ko: "연결 좋음", en: "Good connection" },
  degraded: { ko: "연결 보통 · 지연 있음", en: "Fair connection · some delay" },
  poor: { ko: "연결 나쁨 · 음성이 끊길 수 있어요", en: "Poor connection · audio may break up" },
  unknown: { ko: "연결 품질 측정 중", en: "Measuring connection quality" },
};

export function describeStudioP2pQuality(report: StudioP2pStatsLike): StudioP2pPeerQuality {
  const sample = summarizeStudioP2pStats(report);
  const grade = gradeStudioP2pQuality(sample);
  const label = QUALITY_LABELS[grade];
  const detail =
    sample.roundTripTimeMs !== null ? ` · ${Math.round(sample.roundTripTimeMs)}ms` : "";
  return Object.freeze({
    grade,
    sample,
    labelKo: `${label.ko}${grade === "unknown" ? "" : detail}`,
    labelEn: `${label.en}${grade === "unknown" ? "" : detail}`,
  });
}

/* ------------------------------------------------------------------ 외부 회의 링크 대안 */

/** 붙이기 허용 호스트 — 회의 링크로 널리 쓰이는 도메인만. 서브도메인을 허용한다. */
export const STUDIO_EXTERNAL_MEETING_HOSTS: readonly string[] = Object.freeze([
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "teams.live.com",
  "webex.com",
  "meet.jit.si",
  "discord.com",
  "discord.gg",
]);

export type StudioExternalMeetingLinkVerdict =
  | { readonly ok: true; readonly url: string; readonly host: string }
  | {
      readonly ok: false;
      readonly reason:
        | "empty"
        | "not-a-url"
        | "not-https"
        | "credentials-in-url"
        | "nonstandard-port"
        | "unlisted-host";
    };

/**
 * 세션에 붙이는 외부 회의 링크를 검증한다.
 * P2P가 막힌 환경의 대안 동선이라, 아무 URL이나 열리게 두지 않고 회의 호스트
 * allowlist + https + 자격증명 없음까지 확인한 정규 URL만 돌려준다.
 */
export function validateStudioExternalMeetingLink(
  raw: string,
): StudioExternalMeetingLinkVerdict {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: "not-a-url" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "not-https" };
  if (url.username || url.password) return { ok: false, reason: "credentials-in-url" };
  if (url.port !== "") return { ok: false, reason: "nonstandard-port" };
  const host = url.hostname.toLowerCase();
  const allowed = STUDIO_EXTERNAL_MEETING_HOSTS.some(
    (candidate) => host === candidate || host.endsWith(`.${candidate}`),
  );
  if (!allowed) return { ok: false, reason: "unlisted-host" };
  return { ok: true, url: url.toString(), host };
}
