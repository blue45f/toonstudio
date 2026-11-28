/**
 * Wave 160 동기 FIPS 180-4 SHA-256 지문 생성기, 순수 OKLCH 텔레메트리 대시보드 SVG 렌더러,
 * 자연스러운 한국어 스튜디오 운영 QA 브리프 포매터.
 */

import type {
  ColdStartOutlierReport,
  DualPoolMemoryGovernancePlan,
  FrameBudgetWarmupPlan,
  LatencyPercentileStats,
  SlaComplianceReport,
  StudioEngineTelemetryEntry,
  TelemetryGovernanceStatus,
  TelemetrySlaThresholds,
  TelemetryWaveRange,
  ZeroEagerBundleAuditResult,
} from "./telemetry-governor-types";

const MIB = 1024 * 1024;

const SHA256_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const SHA256_H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const OKLCH_PALETTE = {
  canvas: "oklch(0.98 0.008 85)",
  card: "oklch(1 0 0)",
  linen: "oklch(0.955 0.01 85)",
  track: "oklch(0.92 0.012 90)",
  border: "oklch(0.86 0.015 150)",
  inkPrimary: "oklch(0.24 0.02 155)",
  inkSecondary: "oklch(0.45 0.02 155)",
  inkMuted: "oklch(0.55 0.018 155)",
  passAccent: "oklch(0.36 0.065 155)",
  passBg: "oklch(0.93 0.035 155)",
  warnAccent: "oklch(0.58 0.14 70)",
  warnBg: "oklch(0.95 0.04 80)",
  failAccent: "oklch(0.52 0.18 28)",
  failBg: "oklch(0.94 0.045 25)",
  wasmBar: "oklch(0.47 0.11 235)",
  vramBar: "oklch(0.45 0.10 175)",
  watermark: "oklch(0.52 0.12 52)",
  p50Bar: "oklch(0.42 0.08 155)",
  p95Bar: "oklch(0.58 0.13 72)",
  p99Bar: "oklch(0.53 0.17 30)",
} as const;

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function encodeUtf8Bytes(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    let codePoint = input.charCodeAt(i);
    if (
      codePoint >= 0xd800 &&
      codePoint <= 0xdbff &&
      i + 1 < input.length
    ) {
      const low = input.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        codePoint =
          0x10000 + ((codePoint - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(
        0xe0 | (codePoint >> 12),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (codePoint >> 18),
        0x80 | ((codePoint >> 12) & 0x3f),
        0x80 | ((codePoint >> 6) & 0x3f),
        0x80 | (codePoint & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

/**
 * 순수 ES2017 동기 FIPS 180-4 SHA-256 16진수 해시 함수.
 * 외부 런타임(Node crypto / SubtleCrypto)이나 BigInt 리터럴에 의존하지 않는다.
 */
export function sha256TelemetryHex(input: string): string {
  const utf8 = encodeUtf8Bytes(input);
  const byteLength = utf8.length;
  const bitLength = byteLength * 8;
  const totalBlocks = Math.ceil((byteLength + 9) / 64);
  const padded = new Uint8Array(totalBlocks * 64);
  padded.set(utf8, 0);
  padded[byteLength] = 0x80;

  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  const lenOffset = padded.length - 8;
  padded[lenOffset] = (highBits >>> 24) & 0xff;
  padded[lenOffset + 1] = (highBits >>> 16) & 0xff;
  padded[lenOffset + 2] = (highBits >>> 8) & 0xff;
  padded[lenOffset + 3] = highBits & 0xff;
  padded[lenOffset + 4] = (lowBits >>> 24) & 0xff;
  padded[lenOffset + 5] = (lowBits >>> 16) & 0xff;
  padded[lenOffset + 6] = (lowBits >>> 8) & 0xff;
  padded[lenOffset + 7] = lowBits & 0xff;

  let h0 = SHA256_H0[0] ?? 0;
  let h1 = SHA256_H0[1] ?? 0;
  let h2 = SHA256_H0[2] ?? 0;
  let h3 = SHA256_H0[3] ?? 0;
  let h4 = SHA256_H0[4] ?? 0;
  let h5 = SHA256_H0[5] ?? 0;
  let h6 = SHA256_H0[6] ?? 0;
  let h7 = SHA256_H0[7] ?? 0;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const idx = offset + i * 4;
      w[i] =
        (((padded[idx] ?? 0) << 24) |
          ((padded[idx + 1] ?? 0) << 16) |
          ((padded[idx + 2] ?? 0) << 8) |
          (padded[idx + 3] ?? 0)) >>>
        0;
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const s0 = (rotr32(w15, 7) ^ rotr32(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr32(w2, 17) ^ rotr32(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
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
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + (SHA256_K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
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

  const words = [h0, h1, h2, h3, h4, h5, h6, h7];
  let hex = "";
  for (let i = 0; i < words.length; i += 1) {
    hex += (words[i] ?? 0).toString(16).padStart(8, "0");
  }
  return hex;
}

export interface TelemetryFingerprintPayload {
  readonly scenarioName: string;
  readonly status: TelemetryGovernanceStatus;
  readonly entries: readonly StudioEngineTelemetryEntry[];
  readonly coldStartPercentiles: LatencyPercentileStats;
  readonly warmInvokePercentiles: LatencyPercentileStats;
  readonly eagerBundleAudit: ZeroEagerBundleAuditResult;
  readonly coldStartOutliers: ColdStartOutlierReport;
  readonly warmupPlan: FrameBudgetWarmupPlan;
  readonly memoryGovernance: DualPoolMemoryGovernancePlan;
  readonly slaCompliance: SlaComplianceReport;
}

function canonicalSerializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "0";
    }
    const normalized = value === 0 ? 0 : value;
    return String(normalized);
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      items.push(canonicalSerializeValue(value[i]));
    }
    return `[${items.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((a, b) => a.localeCompare(b));
    const pairs: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (k === undefined) {
        continue;
      }
      pairs.push(`${JSON.stringify(k)}:${canonicalSerializeValue(record[k])}`);
    }
    return `{${pairs.join(",")}}`;
  }
  return "null";
}

/**
 * 텔레메트리 입력·지연 백분위·번들 무결성·워밍업·메모리 거버넌스 계획 전체를
 * 정규 직렬화해 결정적 SHA-256 지문을 산출한다.
 */
export function computeTelemetryGovernanceFingerprint(
  payload: TelemetryFingerprintPayload,
): string {
  const sortedEntries = payload.entries
    .slice()
    .sort((a, b) => a.engineId.localeCompare(b.engineId));

  const canonical = canonicalSerializeValue({
    scenarioName: payload.scenarioName,
    status: payload.status,
    entries: sortedEntries,
    coldStartPercentiles: payload.coldStartPercentiles,
    warmInvokePercentiles: payload.warmInvokePercentiles,
    eagerBundleAudit: payload.eagerBundleAudit,
    coldStartOutliers: payload.coldStartOutliers,
    warmupPlan: payload.warmupPlan,
    memoryGovernance: payload.memoryGovernance,
    slaCompliance: payload.slaCompliance,
  });
  return sha256TelemetryHex(canonical);
}

export function escapeSvgXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function safeFixed(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) {
    return (0).toFixed(decimals);
  }
  const normalized = value === 0 ? 0 : value;
  return normalized.toFixed(decimals);
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}

function resolveStatusColors(status: TelemetryGovernanceStatus): {
  readonly accent: string;
  readonly bg: string;
  readonly labelKo: string;
} {
  if (status === "PASS") {
    return {
      accent: OKLCH_PALETTE.passAccent,
      bg: OKLCH_PALETTE.passBg,
      labelKo: "PASS · 정상",
    };
  }
  if (status === "WARN") {
    return {
      accent: OKLCH_PALETTE.warnAccent,
      bg: OKLCH_PALETTE.warnBg,
      labelKo: "WARN · 주의",
    };
  }
  return {
    accent: OKLCH_PALETTE.failAccent,
    bg: OKLCH_PALETTE.failBg,
    labelKo: "FAIL · 차단",
  };
}

export interface TelemetryDashboardSvgInput {
  readonly scenarioName: string;
  readonly status: TelemetryGovernanceStatus;
  readonly engineCount: number;
  readonly waveRange: TelemetryWaveRange;
  readonly slaThresholds: TelemetrySlaThresholds;
  readonly coldStartPercentiles: LatencyPercentileStats;
  readonly warmInvokePercentiles: LatencyPercentileStats;
  readonly eagerBundleAudit: ZeroEagerBundleAuditResult;
  readonly coldStartOutliers: ColdStartOutlierReport;
  readonly warmupPlan: FrameBudgetWarmupPlan;
  readonly memoryGovernance: DualPoolMemoryGovernancePlan;
  readonly fingerprintSha256: string;
}

/**
 * 순수 `oklch(...)` 색상만 사용하는 100+ 엔진 텔레메트리·메모리 예산 대시보드 SVG를 생성한다.
 */
export function renderStudioTelemetryGovernorSvg(
  input: TelemetryDashboardSvgInput,
): string {
  const statusStyle = resolveStatusColors(input.status);
  const mem = input.memoryGovernance;
  const cold = input.coldStartPercentiles;
  const warm = input.warmInvokePercentiles;
  const eager = input.eagerBundleAudit;

  const meterWidth = 376;
  const watermarkX = 48 + meterWidth * clampUnit(mem.targetUtilizationRatio);

  const wasmAfterW = meterWidth * clampUnit(mem.after.wasmHeapUtilizationRatio);
  const vramAfterW = meterWidth * clampUnit(mem.after.vramUtilizationRatio);

  const latencyScaleMax = Math.max(
    input.slaThresholds.maxColdStartP99Ms,
    cold.p99,
    20,
  );
  const latencyBarMaxW = 290;
  const p50W = latencyBarMaxW * clampUnit(cold.p50 / latencyScaleMax);
  const p95W = latencyBarMaxW * clampUnit(cold.p95 / latencyScaleMax);
  const p99W = latencyBarMaxW * clampUnit(cold.p99 / latencyScaleMax);
  const p95SlaX =
    538 + latencyBarMaxW * clampUnit(input.slaThresholds.maxColdStartP95Ms / latencyScaleMax);

  let cacheCount = 0;
  let snapshotCount = 0;
  let unloadCount = 0;
  for (let i = 0; i < mem.actions.length; i += 1) {
    const act = mem.actions[i];
    if (!act) {
      continue;
    }
    if (act.action === "evict-vram-cache") {
      cacheCount += 1;
    } else if (act.action === "demote-wasm-snapshot") {
      snapshotCount += 1;
    } else {
      unloadCount += 1;
    }
  }

  const eagerAccent = eager.compliant
    ? OKLCH_PALETTE.passAccent
    : OKLCH_PALETTE.failAccent;
  const eagerBg = eager.compliant
    ? OKLCH_PALETTE.passBg
    : OKLCH_PALETTE.failBg;
  const eagerBadgeText = eager.compliant
    ? "0.0 KiB 준수"
    : `${safeFixed(eager.totalEagerLeakKib, 1)} KiB 누수 (${eager.leakingEngineCount}종)`;

  const escapedScenario = escapeSvgXml(input.scenarioName);
  const escapedTier = escapeSvgXml(mem.budget.labelKo);
  const shortFingerprint = escapeSvgXml(input.fingerprintSha256.slice(0, 12));
  const waveSpanLabel =
    input.engineCount > 0
      ? `Wave ${input.waveRange.minWave}–${input.waveRange.maxWave}`
      : "Wave 없음";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 460" width="920" height="460" role="img" aria-label="ToonStudio 100+ 엔진 텔레메트리 및 메모리 예산 대시보드">`,
    `  <rect x="0" y="0" width="920" height="460" rx="16" fill="${OKLCH_PALETTE.canvas}" />`,
    `  <rect x="20" y="18" width="880" height="64" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `  <text x="40" y="45" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">ToonStudio 100+ 라이브 엔진 텔레메트리 · 메모리 거버너</text>`,
    `  <text x="40" y="67" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${escapedScenario} · ${input.engineCount}종 (${waveSpanLabel}) · ${escapedTier}</text>`,
    `  <rect x="752" y="32" width="128" height="34" rx="17" fill="${statusStyle.bg}" stroke="${statusStyle.accent}" stroke-width="1.2" />`,
    `  <text x="816" y="54" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="${statusStyle.accent}">${statusStyle.labelKo}</text>`,

    `  <rect x="20" y="98" width="432" height="194" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `  <text x="40" y="126" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">듀얼 풀 메모리 점유율 (목표 ${safeFixed(mem.targetUtilizationRatio * 100, 0)}%)</text>`,
    `  <text x="40" y="154" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">WASM64 Heap</text>`,
    `  <text x="424" y="154" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${safeFixed(mem.after.wasmHeapBytes / MIB, 1)} / ${safeFixed(mem.after.wasmHeapBudgetBytes / MIB, 0)} MiB (${safeFixed(mem.after.wasmHeapUtilizationRatio * 100, 1)}%)</text>`,
    `  <rect x="48" y="164" width="${meterWidth}" height="16" rx="8" fill="${OKLCH_PALETTE.track}" />`,
    `  <rect x="48" y="164" width="${safeFixed(wasmAfterW, 1)}" height="16" rx="8" fill="${OKLCH_PALETTE.wasmBar}" />`,
    `  <line x1="${safeFixed(watermarkX, 1)}" y1="160" x2="${safeFixed(watermarkX, 1)}" y2="184" stroke="${OKLCH_PALETTE.watermark}" stroke-width="2" />`,

    `  <text x="40" y="212" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">WebGPU VRAM</text>`,
    `  <text x="424" y="212" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${safeFixed(mem.after.vramBytes / MIB, 1)} / ${safeFixed(mem.after.vramBudgetBytes / MIB, 0)} MiB (${safeFixed(mem.after.vramUtilizationRatio * 100, 1)}%)</text>`,
    `  <rect x="48" y="222" width="${meterWidth}" height="16" rx="8" fill="${OKLCH_PALETTE.track}" />`,
    `  <rect x="48" y="222" width="${safeFixed(vramAfterW, 1)}" height="16" rx="8" fill="${OKLCH_PALETTE.vramBar}" />`,
    `  <line x1="${safeFixed(watermarkX, 1)}" y1="218" x2="${safeFixed(watermarkX, 1)}" y2="242" stroke="${OKLCH_PALETTE.watermark}" stroke-width="2" />`,
    `  <text x="40" y="272" font-family="system-ui, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">고정·필수 보호 ${mem.protectedEngineIds.length}종 · 조정 전 WASM ${safeFixed(mem.before.wasmHeapUtilizationRatio * 100, 1)}% / VRAM ${safeFixed(mem.before.vramUtilizationRatio * 100, 1)}%</text>`,

    `  <rect x="468" y="98" width="432" height="194" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `  <text x="488" y="126" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">부트스트랩 지연 백분위 (Cold Start)</text>`,
    `  <text x="488" y="158" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">p50</text>`,
    `  <rect x="538" y="146" width="${latencyBarMaxW}" height="14" rx="7" fill="${OKLCH_PALETTE.track}" />`,
    `  <rect x="538" y="146" width="${safeFixed(p50W, 1)}" height="14" rx="7" fill="${OKLCH_PALETTE.p50Bar}" />`,
    `  <text x="880" y="158" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${safeFixed(cold.p50, 1)}ms</text>`,

    `  <text x="488" y="192" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">p95</text>`,
    `  <rect x="538" y="180" width="${latencyBarMaxW}" height="14" rx="7" fill="${OKLCH_PALETTE.track}" />`,
    `  <rect x="538" y="180" width="${safeFixed(p95W, 1)}" height="14" rx="7" fill="${OKLCH_PALETTE.p95Bar}" />`,
    `  <line x1="${safeFixed(p95SlaX, 1)}" y1="176" x2="${safeFixed(p95SlaX, 1)}" y2="198" stroke="${OKLCH_PALETTE.watermark}" stroke-width="2" />`,
    `  <text x="880" y="192" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${safeFixed(cold.p95, 1)}ms</text>`,

    `  <text x="488" y="226" font-family="system-ui, sans-serif" font-size="12" font-weight="600" fill="${OKLCH_PALETTE.inkPrimary}">p99</text>`,
    `  <rect x="538" y="214" width="${latencyBarMaxW}" height="14" rx="7" fill="${OKLCH_PALETTE.track}" />`,
    `  <rect x="538" y="214" width="${safeFixed(p99W, 1)}" height="14" rx="7" fill="${OKLCH_PALETTE.p99Bar}" />`,
    `  <text x="880" y="226" text-anchor="end" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkSecondary}">${safeFixed(cold.p99, 1)}ms</text>`,

    `  <text x="488" y="256" font-family="system-ui, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkSecondary}">Warm 호출 p50 ${safeFixed(warm.p50, 1)}ms · p95 ${safeFixed(warm.p95, 1)}ms · p99 ${safeFixed(warm.p99, 1)}ms</text>`,
    `  <text x="488" y="274" font-family="system-ui, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">MAD 이상치 ${input.coldStartOutliers.outliers.length}건 · 지터 CV ${safeFixed(cold.jitterCv, 3)}</text>`,

    `  <rect x="20" y="308" width="432" height="132" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `  <text x="40" y="336" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">초기 번들 제로 누수 감사</text>`,
    `  <rect x="40" y="352" width="184" height="36" rx="10" fill="${eagerBg}" stroke="${eagerAccent}" stroke-width="1" />`,
    `  <text x="132" y="375" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" font-weight="700" fill="${eagerAccent}">${eagerBadgeText}</text>`,
    `  <text x="40" y="416" font-family="system-ui, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkSecondary}">검사 엔진 ${eager.totalEngineCount}종 · 프레임 워밍업 ${input.warmupPlan.totalFrames}프레임 (${safeFixed(input.warmupPlan.frameBudgetMs, 2)}ms 예산)</text>`,

    `  <rect x="468" y="308" width="432" height="132" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `  <text x="488" y="336" font-family="system-ui, sans-serif" font-size="14" font-weight="700" fill="${OKLCH_PALETTE.inkPrimary}">자동 회수 계획 및 무결성 지문</text>`,
    `  <rect x="488" y="350" width="392" height="40" rx="8" fill="${OKLCH_PALETTE.linen}" />`,
    `  <text x="502" y="375" font-family="system-ui, sans-serif" font-size="12" fill="${OKLCH_PALETTE.inkPrimary}">캐시 ${cacheCount}건 · 스냅샷 ${snapshotCount}건 · 언로드 ${unloadCount}건 (총 ${safeFixed((mem.totalReclaimedWasmHeapBytes + mem.totalReclaimedVramBytes) / MIB, 1)} MiB 회수)</text>`,
    `  <text x="488" y="416" font-family="system-ui, sans-serif" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">SHA-256: ${shortFingerprint} · 순환 의존성 ${input.warmupPlan.hasCycle ? `${input.warmupPlan.cycleEngineIds.length}종 감지` : "없음"}</text>`,
    `</svg>`,
  ].join("\n");
}

export interface TelemetrySummaryKoInput {
  readonly scenarioName: string;
  readonly status: TelemetryGovernanceStatus;
  readonly engineCount: number;
  readonly waveRange: TelemetryWaveRange;
  readonly coldStartPercentiles: LatencyPercentileStats;
  readonly warmInvokePercentiles: LatencyPercentileStats;
  readonly eagerBundleAudit: ZeroEagerBundleAuditResult;
  readonly coldStartOutliers: ColdStartOutlierReport;
  readonly warmupPlan: FrameBudgetWarmupPlan;
  readonly memoryGovernance: DualPoolMemoryGovernancePlan;
  readonly slaCompliance: SlaComplianceReport;
  readonly fingerprintSha256: string;
}

/**
 * 스튜디오 런타임 운영 QA용 자연스러운 한국어 요약 브리프를 생성한다.
 */
export function summarizeTelemetryGovernorKo(
  input: TelemetrySummaryKoInput,
): string {
  const mem = input.memoryGovernance;
  const cold = input.coldStartPercentiles;
  const warm = input.warmInvokePercentiles;
  const eager = input.eagerBundleAudit;
  const statusTag =
    input.status === "PASS"
      ? "PASS (정상)"
      : input.status === "WARN"
        ? "WARN (주의)"
        : "FAIL (차단)";

  const lines: string[] = [
    `[${statusTag}] ${input.scenarioName} — 라이브 엔진 ${input.engineCount}종(Wave ${input.waveRange.minWave}–${input.waveRange.maxWave}) · ${mem.budget.labelKo}`,
    `- 지연 백분위: Cold Start p50 ${safeFixed(cold.p50, 2)}ms / p95 ${safeFixed(cold.p95, 2)}ms / p99 ${safeFixed(cold.p99, 2)}ms (지터 CV ${safeFixed(cold.jitterCv, 3)}), Warm 호출 p95 ${safeFixed(warm.p95, 2)}ms / p99 ${safeFixed(warm.p99, 2)}ms`,
    `- 이상치 및 초기 번들: MAD 스파이크 ${input.coldStartOutliers.outliers.length}건, 초기 번들 누수 ${safeFixed(eager.totalEagerLeakKib, 1)} KiB (${eager.compliant ? "0.0 KiB 불변식 충족" : `위반 ${eager.leakingEngineCount}종`})`,
    `- 프레임 워밍업: ${input.warmupPlan.totalScheduledEngines}/${input.warmupPlan.totalInputEngines}종을 ${input.warmupPlan.totalFrames}프레임(예산 ${safeFixed(input.warmupPlan.frameBudgetMs, 2)}ms, 최대 동시성 ${input.warmupPlan.maxConcurrency})에 배치, 순환 의존성 ${input.warmupPlan.hasCycle ? `${input.warmupPlan.cycleEngineIds.length}종 감지` : "없음"}`,
    `- 메모리 예산: WASM64 ${safeFixed(mem.before.wasmHeapBytes / MIB, 1)}→${safeFixed(mem.after.wasmHeapBytes / MIB, 1)} MiB (${safeFixed(mem.after.wasmHeapUtilizationRatio * 100, 1)}%), WebGPU VRAM ${safeFixed(mem.before.vramBytes / MIB, 1)}→${safeFixed(mem.after.vramBytes / MIB, 1)} MiB (${safeFixed(mem.after.vramUtilizationRatio * 100, 1)}%), 고정·필수 엔진 ${mem.protectedEngineIds.length}종 보호, 조치 ${mem.actions.length}건`,
  ];

  if (input.slaCompliance.violationsKo.length > 0) {
    lines.push(`- 차단 사유: ${input.slaCompliance.violationsKo.join(" / ")}`);
  }
  if (input.slaCompliance.warningsKo.length > 0) {
    lines.push(`- 주의 항목: ${input.slaCompliance.warningsKo.join(" / ")}`);
  }
  if (mem.recoveryRecommendationsKo.length > 0) {
    lines.push(`- 복구 안내: ${mem.recoveryRecommendationsKo.join(" / ")}`);
  }
  lines.push(`- 검증 지문: sha256:${input.fingerprintSha256.slice(0, 16)}`);

  return lines.join("\n");
}
