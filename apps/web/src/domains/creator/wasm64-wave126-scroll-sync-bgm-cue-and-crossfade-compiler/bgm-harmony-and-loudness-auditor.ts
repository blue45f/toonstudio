/**
 * Wave 126 — 카멜롯 휠(Camelot Wheel) 화성 조화 거리 산출기,
 * 에피소드 BGM 큐시트 라우드니스(LUFS)·3중 겹침 혼탁·화성 충돌 감사기 및
 * 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 매니페스트 해시 생성기.
 */

import {
  DEFAULT_CLASH_DISTANCE_THRESHOLD,
  DEFAULT_MAX_ADJACENT_LUFS_JUMP_DB,
  DEFAULT_MAX_ALLOWED_LUFS,
  DEFAULT_MIN_ANTICLICK_FADE_MS,
  DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC,
  type AuditBgmCueSheetOptions,
  type BgmCueAuditFinding,
  type BgmTrackCueSpec,
  type CamelotCompatibilityLevel,
  type CamelotHarmonicDistanceResult,
  type CamelotKey,
  type CamelotRelationKind,
  type EpisodeBgmAuditStatus,
  type EpisodeBgmCueAuditReport,
  type HarmonicTransitionAuditEntry,
  type MuddyOverlapSpan,
} from "./scroll-sync-bgm-types";
import {
  parseCamelotKey,
  sortBgmCuesDeterministically,
  validateBgmCueSheet,
} from "./scroll-sync-bgm-cue-compiler";

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        cp = 0x10000 + ((cp - 0xd800) << 10) + (next - 0xdc00);
        i += 1;
      }
    }
    if (cp <= 0x7f) {
      bytes.push(cp);
    } else if (cp <= 0x7ff) {
      bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    } else if (cp <= 0xffff) {
      bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

function uint32ToHex(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** 외부 의존성 없는 순수 동기 ES2017 FIPS 180-4 SHA-256 해시. */
export function sha256BgmCueHex(input: string | Uint8Array): string {
  const raw = typeof input === "string" ? encodeUtf8Bytes(input) : input;
  const byteLength = raw.length;
  const paddedLength = Math.ceil((byteLength + 9) / 64) * 64;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(raw, 0);
  buffer[byteLength] = 0x80;

  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(byteLength / 0x20000000), false);
  view.setUint32(paddedLength - 4, (byteLength << 3) >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = (rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)) >>> 0;
      const ch = ((e & f) ^ ((~e >>> 0) & g)) >>> 0;
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = (rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return (
    uint32ToHex(h0) +
    uint32ToHex(h1) +
    uint32ToHex(h2) +
    uint32ToHex(h3) +
    uint32ToHex(h4) +
    uint32ToHex(h5) +
    uint32ToHex(h6) +
    uint32ToHex(h7)
  );
}

/** 객체 키를 사전순으로 정규화해 키 순서에 무관한 결정론적 JSON 문자열을 만든다. */
export function canonicalizeBgmCueJson(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    const num = value as number;
    if (!Number.isFinite(num)) return "null";
    return Object.is(num, -0) ? "0" : JSON.stringify(num);
  }
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      items.push(value[i] === undefined ? "null" : canonicalizeBgmCueJson(value[i]));
    }
    return `[${items.join(",")}]`;
  }
  if (t === "object") {
    const rec = value as Record<string, unknown>;
    const keys = Object.keys(rec).sort();
    const parts: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (rec[k] !== undefined) {
        parts.push(`${JSON.stringify(k)}:${canonicalizeBgmCueJson(rec[k])}`);
      }
    }
    return `{${parts.join(",")}}`;
  }
  return "null";
}

function round3(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * 원형 12시간 카멜롯 휠(Camelot Wheel) 위 두 조의 화성 거리를 계산한다.
 *
 * - 거리 `0`: 동일 키 (`harmonic-compatible`)
 * - 거리 `1`: ±1 인접 5도권(12↔1 원형 래핑 포함) 또는 동일 번호 상대 장단조 A↔B (`harmonic-compatible`)
 * - 거리 `2`: 에너지 2단계 이동 또는 대각 모드 전환 (`energy-shift-caution`)
 * - 거리 `>= 3`: 불협화음 충돌 경고 (`harmonic-clash-warning`, 극적 무음 브리지 삽입 권고)
 */
export function computeCamelotHarmonicDistance(
  keyA: CamelotKey,
  keyB: CamelotKey,
  clashDistanceThreshold = DEFAULT_CLASH_DISTANCE_THRESHOLD,
): CamelotHarmonicDistanceResult {
  const parsedA = parseCamelotKey(keyA);
  const parsedB = parseCamelotKey(keyB);
  if (!parsedA || !parsedB) {
    throw new RangeError(
      `유효하지 않은 카멜롯 키 입력입니다: "${String(keyA)}" -> "${String(keyB)}" (허용 범위: 1A~12A, 1B~12B)`,
    );
  }

  const rawDiff = Math.abs(parsedA.hour - parsedB.hour);
  const hourDistance = Math.min(rawDiff, 12 - rawDiff);
  const modeChanged = parsedA.mode !== parsedB.mode;
  const distance = hourDistance + (modeChanged ? 1 : 0);
  const safeThreshold = Math.max(2, Math.round(clashDistanceThreshold));

  let compatibility: CamelotCompatibilityLevel;
  let relationKind: CamelotRelationKind;
  let recommendSilenceBridge = false;
  let recommendationKo: string;

  if (distance === 0) {
    compatibility = "harmonic-compatible";
    relationKind = "identical";
    recommendationKo = "동일 조이므로 바로 정전력 크로스페이드할 수 있습니다.";
  } else if (distance === 1) {
    compatibility = "harmonic-compatible";
    relationKind = modeChanged ? "relative-major-minor" : "adjacent-fifth";
    recommendationKo = modeChanged
      ? "상대 장단조(A↔B) 관계로 자연스럽게 분위기를 전환할 수 있습니다."
      : "카멜롯 인접 5도권(±1) 관계로 자연스럽게 크로스페이드할 수 있습니다.";
  } else if (distance < safeThreshold) {
    compatibility = "energy-shift-caution";
    relationKind = modeChanged ? "diagonal-mode-shift" : "energy-boost-two-steps";
    recommendationKo =
      "화성 변화가 다소 크므로 크로스페이드 폭을 줄이거나 대사 컷에 맞춰 전환하세요.";
  } else {
    compatibility = "harmonic-clash-warning";
    relationKind = "dissonant-clash";
    recommendSilenceBridge = true;
    recommendationKo = `카멜롯 거리 ${distance}의 불협화음 구간입니다. 사이에 극적 무음 컷(브리지)을 넣거나 인접 조 트랙으로 교체하세요.`;
  }

  return {
    keyA,
    keyB,
    hourDistance,
    modeChanged,
    distance,
    compatibility,
    relationKind,
    recommendSilenceBridge,
    recommendationKo,
  };
}

interface SweepEndpoint {
  readonly yPx: number;
  readonly delta: 1 | -1;
  readonly cueId: string;
}

function detectConcurrentTrackOverlaps(normalCues: readonly BgmTrackCueSpec[]): {
  readonly maxConcurrentBgmTracks: number;
  readonly muddyOverlaps: readonly MuddyOverlapSpan[];
} {
  if (normalCues.length === 0) {
    return { maxConcurrentBgmTracks: 0, muddyOverlaps: [] };
  }

  const events: SweepEndpoint[] = [];
  for (let i = 0; i < normalCues.length; i += 1) {
    const cue = normalCues[i];
    events.push({ yPx: cue.startYPx, delta: 1, cueId: cue.cueId });
    events.push({ yPx: cue.endYPx, delta: -1, cueId: cue.cueId });
  }

  // 같은 좌표에서는 종료(-1)를 시작(+1)보다 먼저 처리해 맞닿은 경계를 겹침으로 오판하지 않는다.
  events.sort((a, b) => {
    if (a.yPx !== b.yPx) return a.yPx - b.yPx;
    if (a.delta !== b.delta) return a.delta - b.delta;
    return a.cueId < b.cueId ? -1 : a.cueId > b.cueId ? 1 : 0;
  });

  const activeSet: Record<string, boolean> = {};
  let activeCount = 0;
  let maxConcurrent = 0;
  const muddyOverlaps: MuddyOverlapSpan[] = [];

  let idx = 0;
  while (idx < events.length) {
    const currY = events[idx].yPx;
    while (idx < events.length && events[idx].yPx === currY) {
      const ev = events[idx];
      if (ev.delta === 1) {
        if (!activeSet[ev.cueId]) {
          activeSet[ev.cueId] = true;
          activeCount += 1;
        }
      } else if (activeSet[ev.cueId]) {
        delete activeSet[ev.cueId];
        activeCount -= 1;
      }
      idx += 1;
    }

    if (idx < events.length) {
      const nextY = events[idx].yPx;
      if (nextY > currY) {
        if (activeCount > maxConcurrent) maxConcurrent = activeCount;
        if (activeCount >= 3) {
          const ids = Object.keys(activeSet).sort();
          muddyOverlaps.push({
            startYPx: currY,
            endYPx: nextY,
            spanPx: round3(nextY - currY),
            overlapCount: ids.length,
            overlappingCueIds: ids,
          });
        }
      }
    }
  }

  return { maxConcurrentBgmTracks: maxConcurrent, muddyOverlaps };
}

function findSeparatingSilenceCut(
  silenceCues: readonly BgmTrackCueSpec[],
  cueA: BgmTrackCueSpec,
  cueB: BgmTrackCueSpec,
): BgmTrackCueSpec | null {
  const overlapStart = Math.max(cueA.startYPx, cueB.startYPx);
  const overlapEnd = Math.min(cueA.endYPx, cueB.endYPx);
  const zoneStart = overlapEnd > overlapStart ? overlapStart : Math.min(cueA.endYPx, cueB.startYPx);
  const zoneEnd = overlapEnd > overlapStart ? overlapEnd : Math.max(cueA.endYPx, cueB.startYPx);

  for (let i = 0; i < silenceCues.length; i += 1) {
    const sc = silenceCues[i];
    if (overlapEnd > overlapStart) {
      // 겹침 구간 전체를 덮어 실제 두 트랙의 동시 화성 충돌을 막아주는 경우만 격리로 인정
      if (sc.startYPx <= overlapStart && sc.endYPx >= overlapEnd) {
        return sc;
      }
    } else if (sc.endYPx > zoneStart && sc.startYPx < zoneEnd) {
      return sc;
    } else if (sc.startYPx <= zoneEnd && sc.endYPx >= zoneStart && sc.endYPx > sc.startYPx) {
      return sc;
    }
  }
  return null;
}

function buildCanonicalManifestHash(
  cues: readonly BgmTrackCueSpec[],
  options: {
    readonly maxAllowedLufs: number;
    readonly maxAdjacentLufsJumpDb: number;
    readonly clashDistanceThreshold: number;
  },
): string {
  const normalized = cues.slice().map((cue) => ({
    bpm: cue.bpm,
    cueId: cue.cueId,
    duckingForDialogueDb: cue.duckingForDialogueDb ?? 0,
    endYPx: cue.endYPx,
    fadeInPx: cue.fadeInPx,
    fadeOutPx: cue.fadeOutPx,
    isDramaticSilenceCut: Boolean(cue.isDramaticSilenceCut),
    musicalKeyCamelot: cue.musicalKeyCamelot,
    startYPx: cue.startYPx,
    targetLufs: cue.targetLufs,
    titleKo: cue.titleKo,
    trackId: cue.trackId,
  }));

  normalized.sort((a, b) => {
    const sa = Number.isFinite(a.startYPx) ? a.startYPx : Number.POSITIVE_INFINITY;
    const sb = Number.isFinite(b.startYPx) ? b.startYPx : Number.POSITIVE_INFINITY;
    if (sa !== sb) return sa - sb;
    const ea = Number.isFinite(a.endYPx) ? a.endYPx : Number.POSITIVE_INFINITY;
    const eb = Number.isFinite(b.endYPx) ? b.endYPx : Number.POSITIVE_INFINITY;
    if (ea !== eb) return ea - eb;
    return a.cueId < b.cueId ? -1 : a.cueId > b.cueId ? 1 : 0;
  });

  const payload = {
    schema: "toonstudio.wave126.scroll-sync-bgm-cue-manifest.v1",
    auditThresholds: {
      clashDistanceThreshold: options.clashDistanceThreshold,
      maxAdjacentLufsJumpDb: options.maxAdjacentLufsJumpDb,
      maxAllowedLufs: options.maxAllowedLufs,
    },
    cues: normalized,
  };
  return sha256BgmCueHex(canonicalizeBgmCueJson(payload));
}

/**
 * 웹툰 에피소드 전체 BGM 큐시트의 라우드니스 상한(`-14.0 LUFS`),
 * 인접 트랙 간 라우드니스 급변(`|ΔLUFS| > 3.0 dB`), 3중 이상 동시 겹침 혼탁,
 * 카멜롯 화성 충돌을 일괄 감사하고 결정론적 SHA-256 해시를 발급한다.
 */
export function auditEpisodeBgmCueSheet(
  cues: readonly BgmTrackCueSpec[],
  options: AuditBgmCueSheetOptions = {},
): EpisodeBgmCueAuditReport {
  const maxAllowedLufs = Number.isFinite(options.maxAllowedLufs ?? NaN)
    ? (options.maxAllowedLufs as number)
    : DEFAULT_MAX_ALLOWED_LUFS;
  const maxAdjacentLufsJumpDb = Number.isFinite(options.maxAdjacentLufsJumpDb ?? NaN)
    ? Math.max(0.1, options.maxAdjacentLufsJumpDb as number)
    : DEFAULT_MAX_ADJACENT_LUFS_JUMP_DB;
  const minAntiClickFadeMs = Number.isFinite(options.minAntiClickFadeMs ?? NaN)
    ? Math.max(DEFAULT_MIN_ANTICLICK_FADE_MS, options.minAntiClickFadeMs as number)
    : DEFAULT_MIN_ANTICLICK_FADE_MS;
  const referenceVelocity = Number.isFinite(options.referenceReadingVelocityPxPerSec ?? NaN)
    ? Math.max(1, options.referenceReadingVelocityPxPerSec as number)
    : DEFAULT_REFERENCE_SCROLL_VELOCITY_PX_PER_SEC;
  const clashDistanceThreshold = Number.isFinite(options.clashDistanceThreshold ?? NaN)
    ? Math.max(2, Math.round(options.clashDistanceThreshold as number))
    : DEFAULT_CLASH_DISTANCE_THRESHOLD;

  const safeCues = Array.isArray(cues) ? cues : [];
  const cueSheetSha256Hex = buildCanonicalManifestHash(safeCues, {
    maxAllowedLufs,
    maxAdjacentLufsJumpDb,
    clashDistanceThreshold,
  });

  const validationIssues = validateBgmCueSheet(safeCues);
  if (validationIssues.length > 0) {
    return {
      inputValid: false,
      releaseReady: false,
      status: "invalid-input",
      cueCount: safeCues.length,
      normalBgmCueCount: 0,
      dramaticSilenceCutCount: 0,
      episodeLengthYPx: 0,
      maxConcurrentBgmTracks: 0,
      maxAllowedLufs,
      maxAdjacentLufsJumpDb,
      maxTargetLufs: null,
      minTargetLufs: null,
      meanTargetLufs: null,
      errorCount: validationIssues.length,
      warningCount: 0,
      transitions: [],
      muddyOverlaps: [],
      findings: [],
      validationIssues,
      cueSheetSha256Hex,
    };
  }

  const sorted = sortBgmCuesDeterministically(safeCues);
  const normalCues: BgmTrackCueSpec[] = [];
  const silenceCues: BgmTrackCueSpec[] = [];
  let episodeLengthYPx = 0;

  for (let i = 0; i < sorted.length; i += 1) {
    const cue = sorted[i];
    if (cue.endYPx > episodeLengthYPx) episodeLengthYPx = cue.endYPx;
    if (cue.isDramaticSilenceCut) silenceCues.push(cue);
    else normalCues.push(cue);
  }

  const findings: BgmCueAuditFinding[] = [];
  const transitions: HarmonicTransitionAuditEntry[] = [];

  // 1. 개별 BGM 과음량(-14.0 LUFS 초과) 검사 및 라우드니스 통계
  let maxTargetLufs: number | null = null;
  let minTargetLufs: number | null = null;
  let lufsSum = 0;

  for (let i = 0; i < normalCues.length; i += 1) {
    const cue = normalCues[i];
    lufsSum += cue.targetLufs;
    if (maxTargetLufs === null || cue.targetLufs > maxTargetLufs) maxTargetLufs = cue.targetLufs;
    if (minTargetLufs === null || cue.targetLufs < minTargetLufs) minTargetLufs = cue.targetLufs;

    if (cue.targetLufs > maxAllowedLufs + 1e-9) {
      const excessDb = round3(cue.targetLufs - maxAllowedLufs);
      findings.push({
        code: "excessive-loudness",
        severity: "error",
        cueIds: [cue.cueId],
        startYPx: cue.startYPx,
        endYPx: cue.endYPx,
        metricValue: round3(cue.targetLufs),
        thresholdValue: round3(maxAllowedLufs),
        messageKo: `큐 "${cue.cueId}"(${cue.titleKo})의 목표 음량이 ${cue.targetLufs.toFixed(1)} LUFS로 웹툰 권장 상한(${maxAllowedLufs.toFixed(1)} LUFS)을 ${excessDb.toFixed(1)} dB 초과합니다.`,
        remediationKo: `트랙 게인을 ${excessDb.toFixed(1)} dB 이상 낮춰 ${maxAllowedLufs.toFixed(1)} LUFS 이하로 맞추세요.`,
      });
    }
  }

  // 2. 극적 무음 컷 공간 페이드 길이 점검 (정독 기준 < 40ms면 엔진 자동 보정 안내 경고)
  for (let i = 0; i < silenceCues.length; i += 1) {
    const sc = silenceCues[i];
    const minRampPx = Math.min(sc.fadeInPx, sc.fadeOutPx);
    const spatialFadeMs = round3((minRampPx / referenceVelocity) * 1000);
    if (spatialFadeMs < minAntiClickFadeMs - 1e-9) {
      findings.push({
        code: "short-silence-anticlick-ramp",
        severity: "warning",
        cueIds: [sc.cueId],
        startYPx: sc.startYPx,
        endYPx: sc.endYPx,
        metricValue: spatialFadeMs,
        thresholdValue: minAntiClickFadeMs,
        messageKo: `극적 무음 컷 "${sc.cueId}"의 공간 페이드 환산 시간이 ${spatialFadeMs.toFixed(1)}ms로 짧습니다(실시간 재생 시 ${minAntiClickFadeMs}ms 안티클릭 페이드로 자동 보정됨).`,
        remediationKo: `정독 속도(${referenceVelocity} px/s) 기준 최소 ${Math.ceil((minAntiClickFadeMs / 1000) * referenceVelocity)}px 이상 fadeInPx/fadeOutPx를 설정하면 시각·청각 타이밍이 더 잘 맞습니다.`,
      });
    }
  }

  // 3. 3트랙 이상 동시 겹침 혼탁 검출
  const overlapSummary = detectConcurrentTrackOverlaps(normalCues);
  for (let i = 0; i < overlapSummary.muddyOverlaps.length; i += 1) {
    const muddy = overlapSummary.muddyOverlaps[i];
    findings.push({
      code: "muddy-triple-overlap",
      severity: "error",
      cueIds: muddy.overlappingCueIds,
      startYPx: muddy.startYPx,
      endYPx: muddy.endYPx,
      metricValue: muddy.overlapCount,
      thresholdValue: 2,
      messageKo: `${muddy.startYPx}~${muddy.endYPx}px 구간에서 BGM ${muddy.overlapCount}개(${muddy.overlappingCueIds.join(", ")})가 동시에 겹쳐 음향이 혼탁해집니다.`,
      remediationKo: "크로스페이드는 인접 2개 트랙만 겹치도록 앞선 트랙의 종료 지점을 당기거나 다음 트랙 시작을 늦추세요.",
    });
  }

  // 4. 인접 트랙 간 카멜롯 화성 조화 및 라우드니스 급변 검사
  for (let i = 0; i < normalCues.length - 1; i += 1) {
    const cueA = normalCues[i];
    const cueB = normalCues[i + 1];
    const overlapStart = Math.max(cueA.startYPx, cueB.startYPx);
    const overlapEnd = Math.min(cueA.endYPx, cueB.endYPx);
    const hasOverlap = overlapEnd > overlapStart;
    const transitionYPx = hasOverlap ? (overlapStart + overlapEnd) / 2 : cueB.startYPx;
    const silenceBridge = findSeparatingSilenceCut(silenceCues, cueA, cueB);
    const separatedBySilenceCut = silenceBridge !== null;
    const camelot = computeCamelotHarmonicDistance(
      cueA.musicalKeyCamelot,
      cueB.musicalKeyCamelot,
      clashDistanceThreshold,
    );
    const lufsDeltaDb = round3(Math.abs(cueB.targetLufs - cueA.targetLufs));
    const isClash = camelot.compatibility === "harmonic-clash-warning";
    const mitigatedBySilenceBridge = isClash && separatedBySilenceCut;

    transitions.push({
      fromCueId: cueA.cueId,
      toCueId: cueB.cueId,
      fromKey: cueA.musicalKeyCamelot,
      toKey: cueB.musicalKeyCamelot,
      transitionYPx: round3(transitionYPx),
      hasOverlap,
      overlapStartYPx: hasOverlap ? overlapStart : null,
      overlapEndYPx: hasOverlap ? overlapEnd : null,
      separatedBySilenceCut,
      silenceCutId: silenceBridge ? silenceBridge.cueId : null,
      mitigatedBySilenceBridge,
      camelot,
      lufsDeltaDb,
    });

    if (lufsDeltaDb > maxAdjacentLufsJumpDb + 1e-9) {
      findings.push({
        code: "abrupt-loudness-jump",
        severity: lufsDeltaDb > maxAdjacentLufsJumpDb * 2 ? "error" : "warning",
        cueIds: [cueA.cueId, cueB.cueId],
        startYPx: hasOverlap ? overlapStart : cueA.endYPx,
        endYPx: hasOverlap ? overlapEnd : cueB.startYPx,
        metricValue: lufsDeltaDb,
        thresholdValue: round3(maxAdjacentLufsJumpDb),
        messageKo: `"${cueA.cueId}"(${cueA.targetLufs.toFixed(1)} LUFS) → "${cueB.cueId}"(${cueB.targetLufs.toFixed(1)} LUFS) 전환에서 라우드니스가 ${lufsDeltaDb.toFixed(1)} dB 급변합니다(기준 ${maxAdjacentLufsJumpDb.toFixed(1)} dB 이내).`,
        remediationKo: "두 트랙의 마스터링 라우드니스 차이를 3.0 dB 이내로 정렬하세요.",
      });
    }

    if (isClash && !mitigatedBySilenceBridge) {
      findings.push({
        code: "harmonic-clash-warning",
        severity: hasOverlap ? "error" : "warning",
        cueIds: [cueA.cueId, cueB.cueId],
        startYPx: hasOverlap ? overlapStart : cueA.endYPx,
        endYPx: hasOverlap ? overlapEnd : cueB.startYPx,
        metricValue: camelot.distance,
        thresholdValue: clashDistanceThreshold - 1,
        messageKo: `"${cueA.cueId}"(${cueA.musicalKeyCamelot}) → "${cueB.cueId}"(${cueB.musicalKeyCamelot}) 전환의 카멜롯 거리가 ${camelot.distance}로 화성 충돌 위험이 큽니다.`,
        remediationKo: camelot.recommendationKo,
      });
    }
  }

  let errorCount = 0;
  let warningCount = 0;
  for (let i = 0; i < findings.length; i += 1) {
    if (findings[i].severity === "error") errorCount += 1;
    else warningCount += 1;
  }

  const releaseReady = errorCount === 0;
  const status: EpisodeBgmAuditStatus =
    errorCount > 0 ? "fail" : warningCount > 0 ? "pass-with-warnings" : "pass";

  return {
    inputValid: true,
    releaseReady,
    status,
    cueCount: sorted.length,
    normalBgmCueCount: normalCues.length,
    dramaticSilenceCutCount: silenceCues.length,
    episodeLengthYPx,
    maxConcurrentBgmTracks: overlapSummary.maxConcurrentBgmTracks,
    maxAllowedLufs,
    maxAdjacentLufsJumpDb,
    maxTargetLufs: maxTargetLufs === null ? null : round3(maxTargetLufs),
    minTargetLufs: minTargetLufs === null ? null : round3(minTargetLufs),
    meanTargetLufs:
      normalCues.length > 0 ? round3(lufsSum / normalCues.length) : null,
    errorCount,
    warningCount,
    transitions,
    muddyOverlaps: overlapSummary.muddyOverlaps,
    findings,
    validationIssues: [],
    cueSheetSha256Hex,
  };
}
