/**
 * Wasm64 Wave 164 결정론적 보고·무결성 및 시각화 엔진:
 * - 순수 ES2017 동기 FIPS 180-4 SHA-256 해시 (`sha256StudioOpsHex`)
 * - 정규 직렬화 기반 회차 매니페스트 지문 (`computeBurndownManifestFingerprint`)
 * - 순수 OKLCH 팔레트 번다운·컷 락 매트릭스 SVG (`renderCutLockBurndownSvg`)
 * - 자연스러운 한국어 스튜디오 PD 마감 QA 브리프 (`summarizeCutLockBurndownKo`)
 */

import {
  STUDIO_STAGE_LABELS_KO,
  type AssistantRebalancePlan,
  type BurndownManifestFingerprintInput,
  type CutLockLeaseState,
  type CutStageLeaseRecord,
  type CutStagePatchMergeResult,
  type DeadlineRiskTier,
  type EpisodeBurndownReport,
  type StudioBurndownQaSummary,
  type StudioQaVerdict,
} from "./cut-lock-burndown-types";

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

const SHA256_H0: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

const OKLCH_PALETTE = {
  canvas: "oklch(0.982 0.008 90)",
  surface: "oklch(0.956 0.011 86)",
  card: "oklch(0.996 0.003 90)",
  border: "oklch(0.862 0.015 92)",
  grid: "oklch(0.905 0.012 90)",
  ink: "oklch(0.238 0.028 160)",
  inkMuted: "oklch(0.462 0.022 155)",
  forest: "oklch(0.352 0.068 158)",
  forestSoft: "oklch(0.915 0.025 156)",
  idealBlue: "oklch(0.525 0.115 245)",
  good: "oklch(0.520 0.125 152)",
  goodBg: "oklch(0.938 0.032 152)",
  tight: "oklch(0.615 0.135 80)",
  tightBg: "oklch(0.948 0.036 84)",
  warn: "oklch(0.595 0.165 55)",
  warnBg: "oklch(0.942 0.044 58)",
  bad: "oklch(0.535 0.185 26)",
  badBg: "oklch(0.940 0.042 26)",
  deadline: "oklch(0.548 0.175 28)",
} as const;

const RISK_LABEL_KO: Readonly<Record<DeadlineRiskTier, string>> = {
  "on-track": "정상 진행",
  "tight-buffer": "여유 촉박",
  "at-risk": "마감 위험",
  "deadline-breach": "마감 초과",
};

function encodeUtf8Bytes(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i += 1;
      }
    }
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(
        0xe0 | (code >>> 12),
        0x80 | ((code >>> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      bytes.push(
        0xf0 | (code >>> 18),
        0x80 | ((code >>> 12) & 0x3f),
        0x80 | ((code >>> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return new Uint8Array(bytes);
}

function rotr32(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function toHexWord32(word: number): string {
  const hex = (word >>> 0).toString(16);
  return hex.length < 8 ? "0".repeat(8 - hex.length) + hex : hex;
}

/**
 * 외부 암호 API 없이 동작하는 순수 ES2017 동기 FIPS 180-4 SHA-256 구현.
 */
export function sha256StudioOpsHex(input: string): string {
  const raw = encodeUtf8Bytes(input);
  const byteLen = raw.length;
  const totalLen = Math.ceil((byteLen + 9) / 64) * 64;
  const padded = new Uint8Array(totalLen);
  padded.set(raw);
  padded[byteLen] = 0x80;

  const bitLenHi = Math.floor(byteLen / 0x20000000);
  const bitLenLo = (byteLen << 3) >>> 0;
  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLenHi >>> 0, false);
  view.setUint32(totalLen - 4, bitLenLo, false);

  let h0 = SHA256_H0[0];
  let h1 = SHA256_H0[1];
  let h2 = SHA256_H0[2];
  let h3 = SHA256_H0[3];
  let h4 = SHA256_H0[4];
  let h5 = SHA256_H0[5];
  let h6 = SHA256_H0[6];
  let h7 = SHA256_H0[7];

  const w = new Uint32Array(64);
  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let t = 0; t < 16; t += 1) {
      w[t] = view.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t += 1) {
      const s0 = rotr32(w[t - 15], 7) ^ rotr32(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr32(w[t - 2], 17) ^ rotr32(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let t = 0; t < 64; t += 1) {
      const sum1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + ch + SHA256_K[t] + w[t]) >>> 0;
      const sum0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + maj) >>> 0;

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
    toHexWord32(h0) +
    toHexWord32(h1) +
    toHexWord32(h2) +
    toHexWord32(h3) +
    toHexWord32(h4) +
    toHexWord32(h5) +
    toHexWord32(h6) +
    toHexWord32(h7)
  );
}

/**
 * 키 순서를 사전순으로 정규화한 결정론적 JSON 문자열을 생성한다.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "null";
    }
    const normalized = Object.is(value, -0) ? 0 : value;
    return JSON.stringify(normalized);
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) {
      const item = value[i];
      parts.push(item === undefined ? "null" : canonicalJsonStringify(item));
    }
    return `[${parts.join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries: string[] = [];
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const fieldValue = record[key];
      if (fieldValue !== undefined) {
        entries.push(`${JSON.stringify(key)}:${canonicalJsonStringify(fieldValue)}`);
      }
    }
    return `{${entries.join(",")}}`;
  }
  return "null";
}

/**
 * 리스 상태·병합 해시·번다운 지표·재배정 계획을 묶어 회차 매니페스트 SHA-256 지문을 산출한다.
 */
export function computeBurndownManifestFingerprint(
  input: BurndownManifestFingerprintInput,
): string {
  const sortedLeaseKeys = Object.keys(input.leaseState.activeLeases).sort();
  const normalizedLeases = sortedLeaseKeys.map((slotKey) => {
    const lease = input.leaseState.activeLeases[slotKey];
    return {
      slotKey,
      leaseId: lease.leaseId,
      holderId: lease.holderId,
      fencingToken: lease.fencingToken,
      expiresAtMs: lease.expiresAtMs,
    };
  });

  const payload = {
    schema: "toonstudio.wave164.cut-lock-burndown.v1",
    episodeId: input.burndownReport.episodeId,
    nextFencingToken: input.leaseState.nextFencingToken,
    activeLeases: normalizedLeases,
    mergeStateSha256Hex: input.mergeResult.mergeStateSha256Hex,
    mergedCleanCount: input.mergeResult.mergedCleanCount,
    rejectedCount: input.mergeResult.rejectedCount,
    totals: {
      totalEffortHours: input.burndownReport.totalEffortHours,
      completedEffortHours: input.burndownReport.completedEffortHours,
      remainingEffortHours: input.burndownReport.remainingEffortHours,
      projectedFinishHours: input.burndownReport.projectedFinishHours,
      deadlineMarginHours: input.burndownReport.deadlineMarginHours,
      riskTier: input.burndownReport.riskTier,
    },
    stageRemaining: input.burndownReport.stageBacklogs.map((stage) => ({
      stage: stage.stage,
      remainingHours: stage.remainingHours,
      blockedByUpstreamCount: stage.blockedByUpstreamCount,
    })),
    rebalanceHoursSaved: input.rebalancePlan ? input.rebalancePlan.hoursSaved : 0,
  };

  return sha256StudioOpsHex(canonicalJsonStringify(payload));
}

function escapeXml(raw: string): string {
  return raw
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;")
    .split("'")
    .join("&apos;");
}

function safeCoord(value: number, fallback = 0): string {
  const safe = Number.isFinite(value) ? value : fallback;
  return safe.toFixed(1);
}

function safeHoursLabel(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}h`;
}

function riskColors(tier: DeadlineRiskTier): { readonly fg: string; readonly bg: string } {
  if (tier === "on-track") {
    return { fg: OKLCH_PALETTE.good, bg: OKLCH_PALETTE.goodBg };
  }
  if (tier === "tight-buffer") {
    return { fg: OKLCH_PALETTE.tight, bg: OKLCH_PALETTE.tightBg };
  }
  if (tier === "at-risk") {
    return { fg: OKLCH_PALETTE.warn, bg: OKLCH_PALETTE.warnBg };
  }
  return { fg: OKLCH_PALETTE.bad, bg: OKLCH_PALETTE.badBg };
}

export interface RenderCutLockBurndownSvgOptions {
  readonly burndownReport: EpisodeBurndownReport;
  readonly leaseState: CutLockLeaseState;
  readonly rebalancePlan?: AssistantRebalancePlan;
  readonly mergeResult?: CutStagePatchMergeResult;
  readonly nowMs?: number;
}

/**
 * 순수 `oklch(...)` 색 토큰만 사용해 번다운 곡선·마감 기준선·공정별 잔여 막대·
 * 활성 컷-락 리스 현황 매트릭스를 단일 SVG로 렌더링한다.
 */
export function renderCutLockBurndownSvg(options: RenderCutLockBurndownSvgOptions): string {
  const { burndownReport, leaseState, rebalancePlan, mergeResult } = options;
  const nowMs = options.nowMs ?? 0;
  const width = 960;
  const height = 560;
  const badgeColor = riskColors(burndownReport.riskTier);
  const pct = Number.isFinite(burndownReport.completionRatio)
    ? Math.round(burndownReport.completionRatio * 100)
    : 0;
  const marginSign = burndownReport.deadlineMarginHours >= 0 ? "+" : "";

  // Left burndown chart bounds
  const chartX = 64;
  const chartY = 108;
  const chartW = 470;
  const chartH = 224;
  const timeline = burndownReport.timeline;
  const maxX = Math.max(
    1,
    burndownReport.totalWindowHours,
    burndownReport.elapsedHours + burndownReport.deadlineRemainingHours,
    ...timeline.map((pt) => (Number.isFinite(pt.elapsedHours) ? pt.elapsedHours : 0)),
  );
  const maxY = Math.max(
    1,
    burndownReport.totalEffortHours,
    ...timeline.map((pt) =>
      Math.max(
        Number.isFinite(pt.idealRemainingHours) ? pt.idealRemainingHours : 0,
        Number.isFinite(pt.actualRemainingHours) ? pt.actualRemainingHours : 0,
      ),
    ),
  );

  const mapX = (hours: number): number => {
    const clamped = Number.isFinite(hours) ? Math.max(0, Math.min(maxX, hours)) : 0;
    return chartX + (clamped / maxX) * chartW;
  };
  const mapY = (remaining: number): number => {
    const clamped = Number.isFinite(remaining) ? Math.max(0, Math.min(maxY, remaining)) : 0;
    return chartY + chartH - (clamped / maxY) * chartH;
  };

  const gridLines: string[] = [];
  for (let step = 0; step <= 4; step += 1) {
    const ratio = step / 4;
    const y = chartY + chartH - ratio * chartH;
    const labelVal = maxY * ratio;
    gridLines.push(
      `<line x1="${safeCoord(chartX)}" y1="${safeCoord(y)}" x2="${safeCoord(chartX + chartW)}" y2="${safeCoord(y)}" stroke="${OKLCH_PALETTE.grid}" stroke-width="1" />`,
      `<text x="${safeCoord(chartX - 8)}" y="${safeCoord(y + 4)}" text-anchor="end" font-size="10" fill="${OKLCH_PALETTE.inkMuted}">${escapeXml(safeHoursLabel(labelVal))}</text>`,
    );
  }

  const deadlineX = mapX(burndownReport.elapsedHours + burndownReport.deadlineRemainingHours);
  const idealPts = timeline
    .map((pt) => `${safeCoord(mapX(pt.elapsedHours))},${safeCoord(mapY(pt.idealRemainingHours))}`)
    .join(" ");
  const actualObserved = timeline.filter((pt) => !pt.isProjected);
  const actualPts = actualObserved
    .map((pt) => `${safeCoord(mapX(pt.elapsedHours))},${safeCoord(mapY(pt.actualRemainingHours))}`)
    .join(" ");

  const projectedSegmentPts =
    actualObserved.length > 0 && timeline.length > actualObserved.length
      ? [actualObserved[actualObserved.length - 1], ...timeline.filter((pt) => pt.isProjected)]
          .map((pt) => `${safeCoord(mapX(pt.elapsedHours))},${safeCoord(mapY(pt.actualRemainingHours))}`)
          .join(" ")
      : "";

  const dotElements = timeline.map((pt) => {
    const cx = mapX(pt.elapsedHours);
    const cy = mapY(pt.actualRemainingHours);
    const fill = pt.isProjected ? badgeColor.fg : OKLCH_PALETTE.forest;
    return `<circle cx="${safeCoord(cx)}" cy="${safeCoord(cy)}" r="${pt.isProjected ? "3.5" : "4"}" fill="${fill}" stroke="${OKLCH_PALETTE.card}" stroke-width="1.5" />`;
  });

  // Right panel: Stage backlog bars
  const stagePanelX = 562;
  const stagePanelY = 82;
  const stagePanelW = 370;
  const stageBarMaxW = 198;
  const maxStageEffort = Math.max(
    1,
    ...burndownReport.stageBacklogs.map((s) =>
      Number.isFinite(s.estimatedHours) ? s.estimatedHours : 0,
    ),
  );

  const stageRows = burndownReport.stageBacklogs.map((stage, idx) => {
    const rowY = stagePanelY + 38 + idx * 41;
    const totalBarW = (Math.max(0, stage.estimatedHours) / maxStageEffort) * stageBarMaxW;
    const remainBarW = (Math.max(0, stage.remainingHours) / maxStageEffort) * stageBarMaxW;
    const barColor = stage.isBottleneck ? badgeColor.fg : OKLCH_PALETTE.forest;
    const blockerSuffix =
      stage.blockedByUpstreamCount > 0 ? ` · 대기 ${stage.blockedByUpstreamCount}` : "";
    return [
      `<text x="${safeCoord(stagePanelX + 14)}" y="${safeCoord(rowY + 11)}" font-size="11.5" font-weight="600" fill="${OKLCH_PALETTE.ink}">${escapeXml(stage.labelKo)}</text>`,
      `<rect x="${safeCoord(stagePanelX + 102)}" y="${safeCoord(rowY)}" width="${safeCoord(Math.max(2, totalBarW))}" height="14" rx="4" fill="${OKLCH_PALETTE.surface}" stroke="${OKLCH_PALETTE.border}" stroke-width="0.8" />`,
      `<rect x="${safeCoord(stagePanelX + 102)}" y="${safeCoord(rowY)}" width="${safeCoord(remainBarW)}" height="14" rx="4" fill="${barColor}" />`,
      `<text x="${safeCoord(stagePanelX + 356)}" y="${safeCoord(rowY + 11)}" text-anchor="end" font-size="10.5" fill="${OKLCH_PALETTE.inkMuted}">${escapeXml(`${safeHoursLabel(stage.remainingHours)}/${safeHoursLabel(stage.estimatedHours)}${blockerSuffix}`)}</text>`,
    ].join("");
  });

  // Bottom panel: Active Cut-Lock Lease Matrix
  const matrixX = 28;
  const matrixY = 368;
  const matrixW = 904;
  const matrixH = 166;
  const sortedLeaseList: CutStageLeaseRecord[] = Object.keys(leaseState.activeLeases)
    .sort()
    .map((key) => leaseState.activeLeases[key]);
  const visibleLeases = sortedLeaseList.slice(0, 6);

  const leaseChips =
    visibleLeases.length === 0
      ? `<text x="${safeCoord(matrixX + 18)}" y="${safeCoord(matrixY + 66)}" font-size="12" fill="${OKLCH_PALETTE.inkMuted}">현재 활성화된 컷-락 리스가 없습니다.</text>`
      : visibleLeases
          .map((lease, idx) => {
            const col = idx % 3;
            const row = Math.floor(idx / 3);
            const chipX = matrixX + 16 + col * 294;
            const chipY = matrixY + 42 + row * 54;
            const holderName =
              leaseState.assistants[lease.holderId]?.nameKo ?? lease.holderId;
            const ttlMinutes =
              nowMs > 0
                ? Math.max(0, Math.round((lease.expiresAtMs - nowMs) / 60000))
                : Math.max(0, Math.round(lease.leaseDurationMs / 60000));
            const stageKo = STUDIO_STAGE_LABELS_KO[lease.stage];
            return [
              `<rect x="${safeCoord(chipX)}" y="${safeCoord(chipY)}" width="282" height="44" rx="8" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
              `<text x="${safeCoord(chipX + 12)}" y="${safeCoord(chipY + 18)}" font-size="11.5" font-weight="600" fill="${OKLCH_PALETTE.ink}">${escapeXml(`${lease.cutId} · ${stageKo}`)}</text>`,
              `<text x="${safeCoord(chipX + 270)}" y="${safeCoord(chipY + 18)}" text-anchor="end" font-size="10.5" font-weight="600" fill="${OKLCH_PALETTE.forest}">${escapeXml(`T${lease.fencingToken}`)}</text>`,
              `<text x="${safeCoord(chipX + 12)}" y="${safeCoord(chipY + 34)}" font-size="10.5" fill="${OKLCH_PALETTE.inkMuted}">${escapeXml(`담당 ${holderName} · 잔여 TTL ${ttlMinutes}분`)}</text>`,
            ].join("");
          })
          .join("");

  const rebalanceBanner =
    rebalancePlan && rebalancePlan.hoursSaved > 0
      ? `재배정 제안 ${rebalancePlan.suggestions.length}건 · 예상 ${safeHoursLabel(rebalancePlan.hoursSaved)} 단축`
      : "현재 담당 배분 균형 유지";
  const mergeSummary = mergeResult
    ? `충돌 제로 병합 ${mergeResult.mergedCleanCount}건 · 구토큰 차단 ${mergeResult.staleTokenRejectionCount}건`
    : `발급 펜싱 토큰 #${Math.max(0, leaseState.nextFencingToken - 1)}`;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${escapeXml(`${burndownReport.episodeTitleKo} 컷-락 리스 및 마감 번다운 현황`)}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="${OKLCH_PALETTE.canvas}" />`,
    // Header
    `<rect x="28" y="20" width="904" height="50" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `<text x="46" y="42" font-size="15" font-weight="700" fill="${OKLCH_PALETTE.ink}">${escapeXml(`${burndownReport.episodeTitleKo} · 마감 번다운 & 컷-락 매트릭스`)}</text>`,
    `<text x="46" y="59" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">${escapeXml(`진행률 ${pct}% (${safeHoursLabel(burndownReport.completedEffortHours)} / ${safeHoursLabel(burndownReport.totalEffortHours)}) · 완료 예상 ${safeHoursLabel(burndownReport.projectedFinishHours)} · 마감 여유 ${marginSign}${safeHoursLabel(burndownReport.deadlineMarginHours)}`)}</text>`,
    `<rect x="814" y="31" width="102" height="28" rx="14" fill="${badgeColor.bg}" stroke="${badgeColor.fg}" stroke-width="1" />`,
    `<text x="865" y="49" text-anchor="middle" font-size="11.5" font-weight="700" fill="${badgeColor.fg}">${escapeXml(RISK_LABEL_KO[burndownReport.riskTier])}</text>`,
    // Burndown card
    `<rect x="28" y="82" width="520" height="274" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `<text x="46" y="101" font-size="12.5" font-weight="700" fill="${OKLCH_PALETTE.ink}">회차 마감 번다운 추이 (이상선 vs 실제·예상선)</text>`,
    ...gridLines,
    `<line x1="${safeCoord(deadlineX)}" y1="${safeCoord(chartY)}" x2="${safeCoord(deadlineX)}" y2="${safeCoord(chartY + chartH)}" stroke="${OKLCH_PALETTE.deadline}" stroke-width="1.5" stroke-dasharray="5 4" />`,
    `<text x="${safeCoord(Math.min(chartX + chartW - 4, deadlineX + 4))}" y="${safeCoord(chartY + 12)}" font-size="10" font-weight="600" fill="${OKLCH_PALETTE.deadline}">마감선</text>`,
    idealPts.length > 0
      ? `<polyline points="${idealPts}" fill="none" stroke="${OKLCH_PALETTE.idealBlue}" stroke-width="2" stroke-dasharray="6 4" />`
      : "",
    actualPts.length > 0
      ? `<polyline points="${actualPts}" fill="none" stroke="${OKLCH_PALETTE.forest}" stroke-width="2.5" />`
      : "",
    projectedSegmentPts.length > 0
      ? `<polyline points="${projectedSegmentPts}" fill="none" stroke="${badgeColor.fg}" stroke-width="2" stroke-dasharray="3 3" />`
      : "",
    ...dotElements,
    `<text x="${safeCoord(chartX)}" y="${safeCoord(chartY + chartH + 18)}" font-size="10" fill="${OKLCH_PALETTE.inkMuted}">0h</text>`,
    `<text x="${safeCoord(chartX + chartW)}" y="${safeCoord(chartY + chartH + 18)}" text-anchor="end" font-size="10" fill="${OKLCH_PALETTE.inkMuted}">${escapeXml(`총 ${safeHoursLabel(maxX)}`)}</text>`,
    // Stage backlog card
    `<rect x="${safeCoord(stagePanelX)}" y="${safeCoord(stagePanelY)}" width="${safeCoord(stagePanelW)}" height="274" rx="12" fill="${OKLCH_PALETTE.card}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `<text x="${safeCoord(stagePanelX + 14)}" y="${safeCoord(stagePanelY + 22)}" font-size="12.5" font-weight="700" fill="${OKLCH_PALETTE.ink}">공정별 잔여 물량 &amp; 선행 대기</text>`,
    ...stageRows,
    // Bottom lease matrix
    `<rect x="${safeCoord(matrixX)}" y="${safeCoord(matrixY)}" width="${safeCoord(matrixW)}" height="${safeCoord(matrixH)}" rx="12" fill="${OKLCH_PALETTE.surface}" stroke="${OKLCH_PALETTE.border}" stroke-width="1" />`,
    `<text x="${safeCoord(matrixX + 16)}" y="${safeCoord(matrixY + 24)}" font-size="12.5" font-weight="700" fill="${OKLCH_PALETTE.ink}">${escapeXml(`활성 컷-락 리스 (${sortedLeaseList.length}건)`)}</text>`,
    `<text x="${safeCoord(matrixX + matrixW - 16)}" y="${safeCoord(matrixY + 24)}" text-anchor="end" font-size="11" fill="${OKLCH_PALETTE.inkMuted}">${escapeXml(`${mergeSummary} · ${rebalanceBanner}`)}</text>`,
    leaseChips,
    `</svg>`,
  ].join("");
}

export interface SummarizeCutLockBurndownOptions {
  readonly burndownReport: EpisodeBurndownReport;
  readonly leaseState: CutLockLeaseState;
  readonly mergeResult: CutStagePatchMergeResult;
  readonly rebalancePlan?: AssistantRebalancePlan;
}

/**
 * 스튜디오 담당 PD가 바로 의사결정할 수 있도록 자연스러운 한국어로 마감 QA 요약을 작성한다.
 */
export function summarizeCutLockBurndownKo(
  options: SummarizeCutLockBurndownOptions,
): StudioBurndownQaSummary {
  const { burndownReport, leaseState, mergeResult, rebalancePlan } = options;

  let verdict: StudioQaVerdict = "PASS";
  if (burndownReport.riskTier === "deadline-breach") {
    verdict = "FAIL";
  } else if (
    burndownReport.riskTier === "tight-buffer" ||
    burndownReport.riskTier === "at-risk"
  ) {
    verdict = "WARN";
  }

  const completionPct = Math.round(burndownReport.completionRatio * 100);
  const marginAbs = Math.abs(burndownReport.deadlineMarginHours).toFixed(1);
  const activeLeaseCount = Object.keys(leaseState.activeLeases).length;

  let headlineKo: string;
  if (verdict === "PASS") {
    headlineKo = `[PASS] ${burndownReport.episodeTitleKo} 마감 여유 ${marginAbs}시간 — 현재 속도로 기한 내 마감 가능`;
  } else if (verdict === "WARN") {
    headlineKo = `[WARN] ${burndownReport.episodeTitleKo} 마감 여유 ${marginAbs}시간(${RISK_LABEL_KO[burndownReport.riskTier]}) — 병목 공정 조정 필요`;
  } else {
    headlineKo = `[FAIL] ${burndownReport.episodeTitleKo} 마감 ${marginAbs}시간 초과 예상 — 즉시 인력 재배정 필요`;
  }

  const metricsLinesKo: string[] = [
    `진행률: ${completionPct}% (완료 ${burndownReport.completedEffortHours.toFixed(1)}h / 전체 ${burndownReport.totalEffortHours.toFixed(1)}h, 잔여 ${burndownReport.remainingEffortHours.toFixed(1)}h)`,
    `완료 예상: ${burndownReport.projectedFinishHours.toFixed(1)}h (마감 잔여 ${burndownReport.deadlineRemainingHours.toFixed(1)}h, 크리티컬 패스 ${burndownReport.criticalPathHours.toFixed(1)}h)`,
    `컷-락 리스: 활성 ${activeLeaseCount}건 · 충돌 제로 병합 ${mergeResult.mergedCleanCount}건 · 거부 ${mergeResult.rejectedCount}건(구토큰 차단 ${mergeResult.staleTokenRejectionCount}건)`,
  ];

  const riskNotesKo: string[] = [];
  if (burndownReport.unstaffedStages.length > 0) {
    const names = burndownReport.unstaffedStages
      .map((stage) => STUDIO_STAGE_LABELS_KO[stage])
      .join(", ");
    riskNotesKo.push(`배정 가능한 숙련 어시스턴트가 없는 미배치 공정: ${names}`);
  }
  if (burndownReport.bottleneckStages.length > 0) {
    const names = burndownReport.bottleneckStages
      .map((stage) => STUDIO_STAGE_LABELS_KO[stage])
      .join(", ");
    riskNotesKo.push(`현재 마감 병목 공정: ${names}`);
  }
  if (mergeResult.staleTokenRejectionCount > 0) {
    riskNotesKo.push(
      `만료 뒤 지연 제출된 구버전 펜싱 토큰 패치 ${mergeResult.staleTokenRejectionCount}건을 안전하게 차단함`,
    );
  }
  if (mergeResult.expiredRejectionCount > 0) {
    riskNotesKo.push(`리스 만료 상태 패치 ${mergeResult.expiredRejectionCount}건 재획득 필요`);
  }
  if (riskNotesKo.length === 0) {
    riskNotesKo.push("주요 공정 병목이나 락 충돌 징후 없음");
  }

  const actionItemsKo: string[] = [];
  if (rebalancePlan && rebalancePlan.suggestions.length > 0 && rebalancePlan.hoursSaved > 0) {
    actionItemsKo.push(
      `재배정 ${rebalancePlan.suggestions.length}건 적용 시 완료 예상 ${rebalancePlan.hoursSaved.toFixed(1)}시간 단축 (${rebalancePlan.baselineProjectedFinishHours.toFixed(1)}h -> ${rebalancePlan.rebalancedProjectedFinishHours.toFixed(1)}h)`,
    );
    const topMove = rebalancePlan.suggestions[0];
    actionItemsKo.push(topMove.rationaleKo);
  } else if (verdict === "PASS") {
    actionItemsKo.push("현재 어시스턴트 배분과 컷-락 주기를 유지한 채 최종 검수로 진행");
  } else {
    actionItemsKo.push("병목 공정 지원 인력 추가 투입 또는 마감 일정 재협의 권장");
  }

  const fullReportKo = [
    headlineKo,
    ...metricsLinesKo.map((line) => `- ${line}`),
    ...riskNotesKo.map((note) => `- 점검: ${note}`),
    ...actionItemsKo.map((action) => `- 조치: ${action}`),
  ].join("\n");

  return {
    verdict,
    headlineKo,
    metricsLinesKo,
    riskNotesKo,
    actionItemsKo,
    fullReportKo,
  };
}
