/**
 * OPFS SQLite 크래시 포렌식 마지막 1획 복원 타임머신 & 아카데미·멘토링 붉은펜 첨삭 리플레이 카드 엔진.
 * 순수 메모리 결정론적 연산(외부 네트워크·브라우저 스토리지·원시 색상 코드 금지, XSS 방어 강제).
 */

export type WalChecksumAlgorithm = "sha256" | "fnv1a";
export type WalOperationKind = "stroke-commit" | "stroke-erase" | "layer-opacity" | "checkpoint-marker";
export type WalQuarantineReasonCode =
  | "checksum-mismatch"
  | "truncated-tail"
  | "sequence-gap"
  | "chain-break"
  | "invalid-payload"
  | "post-corruption-tail";

export interface StrokeVectorPoint {
  readonly x: number; readonly y: number; readonly pressure: number; readonly timestampOffsetMs: number;
}

export interface CanvasStrokeRecord {
  readonly strokeId: string; readonly layerId: string;
  readonly tool: "pen" | "brush" | "eraser" | "tone" | "redpen";
  readonly strokeWidthPx: number; readonly opacity: number;
  readonly points: readonly StrokeVectorPoint[]; readonly committedAtIso: string;
}

export interface OpfsCheckpointSnapshot {
  readonly checkpointId: string; readonly documentId: string; readonly episodeLabel: string;
  readonly schemaVersion: number; readonly capturedAtIso: string; readonly baseSequence: number;
  readonly strokes: readonly CanvasStrokeRecord[];
  readonly layerOpacities?: Readonly<Record<string, number>>;
  readonly checksumAlgorithm: WalChecksumAlgorithm; readonly snapshotChecksum: string;
}

export interface WalDeltaEntryPayload {
  readonly seq: number; readonly prevChecksum: string; readonly timestampIso: string;
  readonly op: WalOperationKind; readonly stroke?: CanvasStrokeRecord;
  readonly targetStrokeId?: string; readonly layerId?: string; readonly layerOpacity?: number;
  readonly payloadBytes: number; readonly truncatedTail?: boolean;
  readonly checksumAlgorithm: WalChecksumAlgorithm;
}

export interface WalDeltaEntry extends WalDeltaEntryPayload { readonly checksum: string; }

export interface QuarantinedWalEntry {
  readonly seq: number; readonly reasonCode: WalQuarantineReasonCode;
  readonly reasonKo: string; readonly reasonEn: string;
  readonly rawChecksum: string; readonly expectedChecksum: string | null; readonly payloadBytes: number;
}

export interface WalRecoveryTimelineStep {
  readonly seq: number; readonly op: WalOperationKind; readonly strokeId: string | null;
  readonly status: "applied" | "quarantined"; readonly strokeCountAfter: number;
  readonly reasonCode?: WalQuarantineReasonCode;
}

export interface CrashRecoveryReceipt {
  readonly receiptId: string; readonly documentId: string; readonly episodeLabel: string;
  readonly recoveredAtIso: string;
  readonly status: "clean" | "recovered-with-tail-quarantine" | "checkpoint-fallback" | "checkpoint-corrupt";
  readonly checksumAlgorithm: WalChecksumAlgorithm; readonly checkpointVerified: boolean;
  readonly baseSequence: number; readonly lastHealthySequence: number; readonly lastRecoveredStrokeId: string | null;
  readonly appliedEntryCount: number; readonly quarantinedEntryCount: number; readonly recoveredStrokeCount: number;
  readonly healthyStrokeRecoveryRatePct: number; readonly zeroLossForHealthyTail: boolean;
  readonly finalStateChecksum: string; readonly receiptHash: string;
  readonly summaryKo: string; readonly summaryEn: string;
}

export interface WalCrashRecoveryInput {
  readonly checkpoint: OpfsCheckpointSnapshot; readonly walEntries: readonly WalDeltaEntry[];
  readonly recoveredAtIso?: string;
}

export interface WalCrashRecoveryResult {
  readonly recoveredStrokes: readonly CanvasStrokeRecord[];
  readonly layerOpacities: Readonly<Record<string, number>>;
  readonly appliedEntries: readonly WalDeltaEntry[];
  readonly quarantinedEntries: readonly QuarantinedWalEntry[];
  readonly timelineSteps: readonly WalRecoveryTimelineStep[];
  readonly receipt: CrashRecoveryReceipt; readonly receiptJson: string;
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotr32(value: number, bits: number): number { return (value >>> bits) | (value << (32 - bits)); }
function toUtf8Bytes(input: string): Uint8Array { return new TextEncoder().encode(input); }

/** 표준 FIPS 180-4 SHA-256 다이제스트(소문자 64자리 16진수)를 동기 계산한다. */
export function computeSha256Hex(input: string): string {
  const bytes = toUtf8Bytes(input);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667; let h1 = 0xbb67ae85; let h2 = 0x3c6ef372; let h3 = 0xa54ff53a;
  let h4 = 0x510e527f; let h5 = 0x9b05688c; let h6 = 0x1f83d9ab; let h7 = 0x5be0cd19;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4, false);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let a = h0; let b = h1; let c = h2; let d = h3; let e = h4; let f = h5; let g = h6; let h = h7;
    for (let i = 0; i < 64; i += 1) {
      const s1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0; d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
  }
  return [h0, h1, h2, h3, h4, h5, h6, h7].map((n) => n.toString(16).padStart(8, "0")).join("");
}

/** 32-bit FNV-1a 체크섬(소문자 8자리 16진수)을 계산한다. */
export function computeFnv1a32Hex(input: string): string {
  let hash = 0x811c9dc5;
  for (const byte of toUtf8Bytes(input)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** 지정 알고리즘(SHA-256 또는 FNV-1a)으로 접두사 포함 체크섬 문자열을 발급한다. */
export function computeWalChecksum(canonicalPayload: string, algorithm: WalChecksumAlgorithm): string {
  return algorithm === "fnv1a" ? `fnv1a:${computeFnv1a32Hex(canonicalPayload)}` : `sha256:${computeSha256Hex(canonicalPayload)}`;
}

function serializeCheckpointForChecksum(s: Omit<OpfsCheckpointSnapshot, "snapshotChecksum">): string {
  return JSON.stringify({
    checkpointId: s.checkpointId, documentId: s.documentId, episodeLabel: s.episodeLabel,
    schemaVersion: s.schemaVersion, baseSequence: s.baseSequence, strokes: s.strokes,
    layerOpacities: s.layerOpacities ?? {},
  });
}

function serializeWalEntryForChecksum(e: WalDeltaEntryPayload): string {
  return JSON.stringify({
    seq: e.seq, prevChecksum: e.prevChecksum, timestampIso: e.timestampIso, op: e.op,
    stroke: e.stroke ?? null, targetStrokeId: e.targetStrokeId ?? null,
    layerId: e.layerId ?? null, layerOpacity: e.layerOpacity ?? null, payloadBytes: e.payloadBytes,
  });
}

/** 베이스 체크포인트 스냅샷에 정규 체크섬을 서명한다. */
export function signCheckpointSnapshot(snapshot: Omit<OpfsCheckpointSnapshot, "snapshotChecksum">): OpfsCheckpointSnapshot {
  return { ...snapshot, snapshotChecksum: computeWalChecksum(serializeCheckpointForChecksum(snapshot), snapshot.checksumAlgorithm) };
}

/** WAL 델타 저널 엔트리에 정규 체크섬을 서명한다. */
export function signWalDeltaEntry(entry: WalDeltaEntryPayload): WalDeltaEntry {
  return { ...entry, checksum: computeWalChecksum(serializeWalEntryForChecksum(entry), entry.checksumAlgorithm) };
}

function validateWalPayload(entry: WalDeltaEntry): boolean {
  if (entry.op === "stroke-commit") {
    return Boolean(entry.stroke && entry.stroke.strokeId.trim() && entry.stroke.layerId.trim() && entry.stroke.points.length > 0);
  }
  if (entry.op === "stroke-erase") return Boolean(entry.targetStrokeId?.trim());
  if (entry.op === "layer-opacity") {
    return Boolean(entry.layerId?.trim() && typeof entry.layerOpacity === "number" && Number.isFinite(entry.layerOpacity) && entry.layerOpacity >= 0 && entry.layerOpacity <= 1);
  }
  return entry.op === "checkpoint-marker";
}

const QUARANTINE_REASONS: Readonly<Record<WalQuarantineReasonCode, { readonly ko: string; readonly en: string }>> = {
  "truncated-tail": { ko: "전원 차단·크래시로 쓰기가 끊긴 미완성 꼬리(Torn Write)를 격리했습니다.", en: "Quarantined torn-write tail record truncated during sudden crash." },
  "checksum-mismatch": { ko: "WAL 체크섬 불일치가 감지되어 손상된 바이트 반영을 차단했습니다.", en: "WAL record checksum mismatch detected; blocked corrupted payload replay." },
  "sequence-gap": { ko: "저널 시퀀스 번호 누락(Gap)이 감지되어 이후 구간을 격리했습니다.", en: "Journal sequence gap detected; isolated non-contiguous tail." },
  "chain-break": { ko: "이전 체크섬 해시 체인(prevChecksum) 불일치 레코드를 격리했습니다.", en: "Hash chain mismatch against previous healthy WAL checksum." },
  "invalid-payload": { ko: "필수 획 좌표 또는 대상 ID가 비어 있는 불량 페이로드를 격리했습니다.", en: "Invalid or incomplete stroke/layer payload quarantined." },
  "post-corruption-tail": { ko: "손상 꼬리 이후의 후속 미확정 레코드를 연쇄 격리해 캔버스 오염을 막았습니다.", en: "Cascade-quarantined trailing record written after corrupted boundary." },
};

/** OPFS SQLite 체크포인트 + WAL 델타 저널을 체크섬 체인으로 검증해 손상 꼬리만 격리하고 마지막 정상 1획까지 손실 0%로 복원한다. */
export function reconcileWalCrashRecovery(input: WalCrashRecoveryInput): WalCrashRecoveryResult {
  const { checkpoint, walEntries } = input;
  const recoveredAtIso = input.recoveredAtIso ?? "2026-11-23T11:30:00.000Z";
  const checkpointVerified = checkpoint.snapshotChecksum === computeWalChecksum(serializeCheckpointForChecksum(checkpoint), checkpoint.checksumAlgorithm);

  const strokesMap = new Map<string, CanvasStrokeRecord>();
  const strokeOrder: string[] = [];
  for (const s of checkpoint.strokes) { strokesMap.set(s.strokeId, s); strokeOrder.push(s.strokeId); }
  const layerOpacities: Record<string, number> = { ...(checkpoint.layerOpacities ?? {}) };

  const appliedEntries: WalDeltaEntry[] = [];
  const quarantinedEntries: QuarantinedWalEntry[] = [];
  const timelineSteps: WalRecoveryTimelineStep[] = [];
  let lastHealthySequence = checkpoint.baseSequence;
  let lastRecoveredStrokeId: string | null = checkpoint.strokes.length > 0 ? checkpoint.strokes[checkpoint.strokes.length - 1].strokeId : null;
  let expectedSeq = checkpoint.baseSequence + 1;
  let expectedPrevChecksum = checkpoint.snapshotChecksum;
  let tailCorrupted = !checkpointVerified;

  for (const entry of walEntries) {
    const quarantine = (code: WalQuarantineReasonCode, expectedChecksum: string | null): void => {
      const desc = QUARANTINE_REASONS[code];
      quarantinedEntries.push({
        seq: entry.seq, reasonCode: code, reasonKo: desc.ko, reasonEn: desc.en,
        rawChecksum: entry.checksum, expectedChecksum, payloadBytes: entry.payloadBytes,
      });
      timelineSteps.push({
        seq: entry.seq, op: entry.op, strokeId: entry.stroke?.strokeId ?? entry.targetStrokeId ?? null,
        status: "quarantined", strokeCountAfter: strokesMap.size, reasonCode: code,
      });
      tailCorrupted = true;
    };

    if (tailCorrupted) { quarantine("post-corruption-tail", null); continue; }
    if (entry.truncatedTail) { quarantine("truncated-tail", null); continue; }
    if (entry.seq !== expectedSeq) { quarantine("sequence-gap", null); continue; }
    if (entry.prevChecksum !== expectedPrevChecksum) { quarantine("chain-break", expectedPrevChecksum); continue; }
    if (!validateWalPayload(entry)) { quarantine("invalid-payload", null); continue; }

    const recomputed = computeWalChecksum(serializeWalEntryForChecksum(entry), entry.checksumAlgorithm);
    if (entry.checksum !== recomputed) { quarantine("checksum-mismatch", recomputed); continue; }

    if (entry.op === "stroke-commit" && entry.stroke) {
      if (!strokesMap.has(entry.stroke.strokeId)) strokeOrder.push(entry.stroke.strokeId);
      strokesMap.set(entry.stroke.strokeId, entry.stroke);
      lastRecoveredStrokeId = entry.stroke.strokeId;
    } else if (entry.op === "stroke-erase" && entry.targetStrokeId) {
      strokesMap.delete(entry.targetStrokeId);
    } else if (entry.op === "layer-opacity" && entry.layerId && entry.layerOpacity !== undefined) {
      layerOpacities[entry.layerId] = Math.round(entry.layerOpacity * 1000) / 1000;
    }

    appliedEntries.push(entry);
    lastHealthySequence = entry.seq;
    expectedSeq = entry.seq + 1;
    expectedPrevChecksum = entry.checksum;
    timelineSteps.push({
      seq: entry.seq, op: entry.op, strokeId: entry.stroke?.strokeId ?? entry.targetStrokeId ?? null,
      status: "applied", strokeCountAfter: strokesMap.size,
    });
  }

  const recoveredStrokes = strokeOrder.map((id) => strokesMap.get(id)).filter((s): s is CanvasStrokeRecord => Boolean(s));
  const status: CrashRecoveryReceipt["status"] = !checkpointVerified
    ? "checkpoint-corrupt"
    : quarantinedEntries.length === 0 ? "clean" : appliedEntries.length > 0 ? "recovered-with-tail-quarantine" : "checkpoint-fallback";
  const finalStateChecksum = computeWalChecksum(JSON.stringify({ strokes: recoveredStrokes, layerOpacities }), checkpoint.checksumAlgorithm);
  const receiptBody = {
    receiptId: `rcpt-${checkpoint.documentId}-seq${lastHealthySequence}`,
    documentId: checkpoint.documentId, episodeLabel: checkpoint.episodeLabel, recoveredAtIso, status,
    checksumAlgorithm: checkpoint.checksumAlgorithm, checkpointVerified, baseSequence: checkpoint.baseSequence,
    lastHealthySequence, lastRecoveredStrokeId, appliedEntryCount: appliedEntries.length,
    quarantinedEntryCount: quarantinedEntries.length, recoveredStrokeCount: recoveredStrokes.length,
    healthyStrokeRecoveryRatePct: checkpointVerified ? 100 : 0, zeroLossForHealthyTail: checkpointVerified, finalStateChecksum,
  };
  const receipt: CrashRecoveryReceipt = {
    ...receiptBody,
    receiptHash: computeWalChecksum(JSON.stringify(receiptBody), checkpoint.checksumAlgorithm),
    summaryKo: !checkpointVerified
      ? `체크포인트 무결성 실패 · 격리 ${quarantinedEntries.length}건`
      : quarantinedEntries.length > 0
        ? `손상 꼬리 ${quarantinedEntries.length}건 격리 완료 · 정상 WAL ${appliedEntries.length}건(마지막 획 ${lastRecoveredStrokeId ?? "-"}) 손실 0% 복원`
        : `정상 무결성 확인 · 총 ${recoveredStrokes.length}획(WAL ${appliedEntries.length}건) 무손실 반영`,
    summaryEn: !checkpointVerified
      ? `Checkpoint integrity failed · Quarantined ${quarantinedEntries.length}`
      : quarantinedEntries.length > 0
        ? `Quarantined ${quarantinedEntries.length} corrupted tail entries · Restored ${appliedEntries.length} healthy WAL entries to ${lastRecoveredStrokeId ?? "-"} (0% loss)`
        : `Clean WAL replay verified · ${recoveredStrokes.length} total strokes (${appliedEntries.length} WAL entries)`,
  };

  return {
    recoveredStrokes, layerOpacities, appliedEntries, quarantinedEntries, timelineSteps, receipt,
    receiptJson: JSON.stringify({ schemaVersion: "toonstudio.opfs-crash-receipt.v1", receipt, quarantinedEntries }, null, 2),
  };
}

/** 데모·검증용 OPFS 베이스 체크포인트 + WAL 정상 6건 + 손상 꼬리 2건 시나리오를 생성한다. */
export function buildDefaultCrashRecoveryScenario(algorithm: WalChecksumAlgorithm = "sha256", includeCorruptedTail = true): WalCrashRecoveryInput {
  const checkpoint = signCheckpointSnapshot({
    checkpointId: "chk-opfs-ep03-100", documentId: "doc-starlight-ep03", episodeLabel: "EP.03 / CUT-18",
    schemaVersion: 2, capturedAtIso: "2026-11-23T11:21:00.000Z", baseSequence: 100,
    strokes: [
      { strokeId: "stk-base-01", layerId: "ink-character", tool: "pen", strokeWidthPx: 4.5, opacity: 1, points: [{ x: 180, y: 220, pressure: 0.65, timestampOffsetMs: 0 }, { x: 260, y: 290, pressure: 0.82, timestampOffsetMs: 42 }], committedAtIso: "2026-11-23T11:20:01.000Z" },
      { strokeId: "stk-base-02", layerId: "ink-character", tool: "pen", strokeWidthPx: 3.2, opacity: 1, points: [{ x: 290, y: 210, pressure: 0.58, timestampOffsetMs: 0 }, { x: 350, y: 310, pressure: 0.74, timestampOffsetMs: 36 }], committedAtIso: "2026-11-23T11:20:09.000Z" },
    ],
    layerOpacities: { "ink-character": 1, "tone-shadow": 0.45 }, checksumAlgorithm: algorithm,
  });

  const walEntries: WalDeltaEntry[] = [];
  let prevChecksum = checkpoint.snapshotChecksum;
  let seq = 101;
  const healthySeeds: readonly { readonly id: string; readonly layer: string; readonly tool: CanvasStrokeRecord["tool"]; readonly x0: number; readonly y0: number }[] = [
    { id: "stk-wal-101", layer: "ink-character", tool: "pen", x0: 360, y0: 250 },
    { id: "stk-wal-102", layer: "ink-character", tool: "brush", x0: 410, y0: 310 },
    { id: "stk-wal-103", layer: "tone-shadow", tool: "tone", x0: 220, y0: 420 },
    { id: "stk-wal-104", layer: "ink-character", tool: "pen", x0: 480, y0: 340 },
    { id: "stk-wal-105", layer: "fx-rain", tool: "brush", x0: 520, y0: 180 },
  ];
  for (const item of healthySeeds) {
    const ts = `2026-11-23T11:22:${String(seq - 100).padStart(2, "0")}.000Z`;
    const signed = signWalDeltaEntry({
      seq, prevChecksum, timestampIso: ts, op: "stroke-commit", payloadBytes: 420, checksumAlgorithm: algorithm,
      stroke: {
        strokeId: item.id, layerId: item.layer, tool: item.tool, strokeWidthPx: 4, opacity: 0.95, committedAtIso: ts,
        points: [{ x: item.x0, y: item.y0, pressure: 0.7, timestampOffsetMs: 0 }, { x: item.x0 + 64, y: item.y0 + 48, pressure: 0.85, timestampOffsetMs: 38 }],
      },
    });
    walEntries.push(signed);
    prevChecksum = signed.checksum;
    seq += 1;
  }

  const opacityEntry = signWalDeltaEntry({
    seq, prevChecksum, timestampIso: "2026-11-23T11:22:45.000Z", op: "layer-opacity",
    layerId: "tone-shadow", layerOpacity: 0.62, payloadBytes: 96, checksumAlgorithm: algorithm,
  });
  walEntries.push(opacityEntry);
  prevChecksum = opacityEntry.checksum;
  seq += 1;

  if (includeCorruptedTail) {
    walEntries.push({
      seq, prevChecksum, timestampIso: "2026-11-23T11:22:58.000Z", op: "stroke-commit",
      stroke: { strokeId: "stk-wal-torn-107", layerId: "ink-character", tool: "pen", strokeWidthPx: 4, opacity: 1, points: [{ x: 610, y: 200, pressure: 0.5, timestampOffsetMs: 0 }], committedAtIso: "2026-11-23T11:22:58.000Z" },
      payloadBytes: 183, truncatedTail: true, checksumAlgorithm: algorithm, checksum: `${algorithm}:corrupted-torn-tail`,
    });
    walEntries.push({
      seq: seq + 1, prevChecksum: `${algorithm}:corrupted-torn-tail`, timestampIso: "2026-11-23T11:22:59.000Z", op: "stroke-commit",
      stroke: { strokeId: "stk-wal-orphan-108", layerId: "ink-character", tool: "pen", strokeWidthPx: 4, opacity: 1, points: [{ x: 630, y: 215, pressure: 0.4, timestampOffsetMs: 0 }], committedAtIso: "2026-11-23T11:22:59.000Z" },
      payloadBytes: 112, checksumAlgorithm: algorithm, checksum: `${algorithm}:orphan-after-crash`,
    });
  }
  return { checkpoint, walEntries };
}

// ============================================================================
// 아카데미·멘토링 붉은펜 첨삭 녹화 & Before/After 인터랙티브 카드 엔진
// ============================================================================

export type RedpenCorrectionCategory = "anatomy" | "perspective" | "composition" | "line-weight" | "balloon-flow";
export interface RedpenStrokePoint { readonly x: number; readonly y: number; }

export interface RedpenStrokeEvent {
  readonly strokeId: string; readonly startMs: number; readonly endMs: number;
  readonly category: RedpenCorrectionCategory; readonly labelKo: string; readonly labelEn: string;
  readonly strokeWidthPx: number; readonly points: readonly RedpenStrokePoint[];
}

export interface VoiceSubtitleCue {
  readonly cueId: string; readonly startMs: number; readonly endMs: number;
  readonly speaker: string; readonly text: string; readonly linkedStrokeId?: string;
}

export interface CritiqueComparisonMetrics {
  readonly beforeSummary: string; readonly afterSummary: string;
  readonly silhouetteClarityBefore: number; readonly silhouetteClarityAfter: number;
  readonly eyeFlowScoreBefore: number; readonly eyeFlowScoreAfter: number;
  readonly beforeImageRef?: string; readonly afterImageRef?: string;
}

export interface RedpenCritiqueReplayInput {
  readonly sessionId: string; readonly mentorName: string; readonly studentName: string;
  readonly courseTitle: string; readonly episodeCutRef: string; readonly recordedAtIso: string;
  readonly canvasWidthPx: number; readonly canvasHeightPx: number;
  readonly strokes: readonly RedpenStrokeEvent[]; readonly subtitles: readonly VoiceSubtitleCue[];
  readonly comparison: CritiqueComparisonMetrics; readonly takeaways: readonly string[];
}

export interface RedpenReplayFrameSnapshot {
  readonly timeMs: number; readonly progressPct: number;
  readonly visibleStrokes: readonly { readonly stroke: RedpenStrokeEvent; readonly strokeProgress: number; readonly isActive: boolean }[];
  readonly activeSubtitle: VoiceSubtitleCue | null;
}

export interface RedpenCritiqueReplayCard {
  readonly schemaVersion: "toonstudio.redpen-replay-card.v1"; readonly sessionId: string;
  readonly durationMs: number; readonly strokeCount: number; readonly subtitleCount: number;
  readonly categoryBreakdown: Readonly<Record<RedpenCorrectionCategory, number>>;
  readonly improvementDelta: { readonly silhouetteClarity: number; readonly eyeFlowScore: number };
  readonly strokes: readonly RedpenStrokeEvent[]; readonly subtitles: readonly VoiceSubtitleCue[];
  readonly sanitizedRefs: { readonly beforeImageRef: string | null; readonly afterImageRef: string | null };
  readonly cardJson: string; readonly cardByteSize: number; readonly htmlSnippet: string; readonly integrityDigest: string;
}

/** HTML 특수문자를 모두 이스케이프해 XSS 인젝션을 원천 차단한다. */
export function escapeRedpenHtml(raw: string): string {
  return raw.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;").replace(/'/gu, "&#39;").replace(/`/gu, "&#96;");
}

function hasControlChars(text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** 외부/상대 에셋 경로를 검증해 javascript:/data:/경로 이탈(../) 등을 차단한다. */
export function sanitizeAssetRef(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || hasControlChars(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:")) return null;
  if (lower.startsWith("https://") || lower.startsWith("http://")) {
    try {
      const parsed = new URL(trimmed);
      return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
    } catch { return null; }
  }
  if (trimmed.includes("..") || trimmed.startsWith("//") || trimmed.includes(":")) return null;
  return /^[a-zA-Z0-9._/-]+$/u.test(trimmed) ? trimmed : null;
}

function clampScore(value: number): number { return Number.isFinite(value) ? Math.round(Math.min(100, Math.max(0, value)) * 10) / 10 : 0; }

function formatMsLabel(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const sec = Math.floor(safe / 1000);
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}.${Math.floor((safe % 1000) / 100)}`;
}

function buildPolylinePath(points: readonly RedpenStrokePoint[]): string {
  return points.map((pt, idx) => `${idx === 0 ? "M" : "L"}${Math.round(Math.min(1000, Math.max(0, pt.x)))} ${Math.round(Math.min(1000, Math.max(0, pt.y)))}`).join(" ");
}

/** 교정 획 타임스탬프·음성 자막·Before/After 비교 메타를 경량 JSON 및 XSS-safe 독립 HTML 스니펫으로 패키징한다. */
export function buildRedpenCritiqueReplayCard(input: RedpenCritiqueReplayInput): RedpenCritiqueReplayCard {
  const sortedStrokes = [...input.strokes]
    .map((s) => {
      const startMs = Math.max(0, Math.round(s.startMs));
      return { ...s, startMs, endMs: Math.max(startMs + 50, Math.round(s.endMs)), strokeWidthPx: Math.min(24, Math.max(1, s.strokeWidthPx)) };
    })
    .sort((a, b) => a.startMs - b.startMs);

  const sortedSubtitles = [...input.subtitles]
    .map((c) => {
      const startMs = Math.max(0, Math.round(c.startMs));
      return { ...c, startMs, endMs: Math.max(startMs + 100, Math.round(c.endMs)) };
    })
    .sort((a, b) => a.startMs - b.startMs);

  const durationMs = Math.max(1000, ...sortedStrokes.map((s) => s.endMs), ...sortedSubtitles.map((c) => c.endMs));
  const categoryBreakdown: Record<RedpenCorrectionCategory, number> = { anatomy: 0, perspective: 0, composition: 0, "line-weight": 0, "balloon-flow": 0 };
  for (const stroke of sortedStrokes) categoryBreakdown[stroke.category] += 1;

  const silhouetteBefore = clampScore(input.comparison.silhouetteClarityBefore);
  const silhouetteAfter = clampScore(input.comparison.silhouetteClarityAfter);
  const eyeFlowBefore = clampScore(input.comparison.eyeFlowScoreBefore);
  const eyeFlowAfter = clampScore(input.comparison.eyeFlowScoreAfter);
  const improvementDelta = {
    silhouetteClarity: Math.round((silhouetteAfter - silhouetteBefore) * 10) / 10,
    eyeFlowScore: Math.round((eyeFlowAfter - eyeFlowBefore) * 10) / 10,
  };
  const sanitizedRefs = {
    beforeImageRef: sanitizeAssetRef(input.comparison.beforeImageRef),
    afterImageRef: sanitizeAssetRef(input.comparison.afterImageRef),
  };

  const payload = {
    schemaVersion: "toonstudio.redpen-replay-card.v1" as const, sessionId: input.sessionId,
    mentorName: input.mentorName, studentName: input.studentName, courseTitle: input.courseTitle,
    episodeCutRef: input.episodeCutRef, recordedAtIso: input.recordedAtIso,
    canvas: { widthPx: Math.max(100, Math.round(input.canvasWidthPx)), heightPx: Math.max(100, Math.round(input.canvasHeightPx)) },
    durationMs, categoryBreakdown,
    comparison: {
      beforeSummary: input.comparison.beforeSummary, afterSummary: input.comparison.afterSummary,
      silhouetteClarityBefore: silhouetteBefore, silhouetteClarityAfter: silhouetteAfter,
      eyeFlowScoreBefore: eyeFlowBefore, eyeFlowScoreAfter: eyeFlowAfter, ...sanitizedRefs,
    },
    improvementDelta, strokes: sortedStrokes, subtitles: sortedSubtitles, takeaways: input.takeaways,
  };
  const cardJson = JSON.stringify(payload, null, 2);
  const svgPaths = sortedStrokes
    .map((s) => `<path data-stroke-id="${escapeRedpenHtml(s.strokeId)}" data-start-ms="${s.startMs}" data-end-ms="${s.endMs}" d="${buildPolylinePath(s.points)}" fill="none" stroke="var(--rp-red, oklch(0.66 0.2 26))" stroke-width="${s.strokeWidthPx * 2}" stroke-linecap="round" stroke-linejoin="round" />`)
    .join("");
  const subtitleItems = sortedSubtitles
    .map((c) => `<li><strong>${escapeRedpenHtml(formatMsLabel(c.startMs))}–${escapeRedpenHtml(formatMsLabel(c.endMs))}</strong> <span>[${escapeRedpenHtml(c.speaker)}]</span> ${escapeRedpenHtml(c.text)}</li>`)
    .join("");
  const takeawayItems = input.takeaways.map((item) => `<li>${escapeRedpenHtml(item)}</li>`).join("");
  const beforeImgTag = sanitizedRefs.beforeImageRef ? `<div data-ref="before" data-asset="${escapeRedpenHtml(sanitizedRefs.beforeImageRef)}"></div>` : "";
  const afterImgTag = sanitizedRefs.afterImageRef ? `<div data-ref="after" data-asset="${escapeRedpenHtml(sanitizedRefs.afterImageRef)}"></div>` : "";

  const htmlSnippet = [
    `<article class="ts-redpen-card" data-session-id="${escapeRedpenHtml(input.sessionId)}" data-schema="toonstudio.redpen-replay-card.v1" style="--rp-bg:oklch(0.185 0.009 68);--rp-card:oklch(0.215 0.01 66);--rp-line:oklch(0.32 0.012 64);--rp-fg:oklch(0.95 0.01 85);--rp-muted:oklch(0.75 0.012 78);--rp-red:oklch(0.68 0.19 26);--rp-good:oklch(0.78 0.15 150);background:var(--rp-bg);color:var(--rp-fg);border:1px solid var(--rp-line);border-radius:16px;padding:16px;font-family:system-ui,sans-serif;max-width:640px;">`,
    `  <header style="display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid var(--rp-line);padding-bottom:10px;"><div><small style="color:var(--rp-muted);">${escapeRedpenHtml(input.courseTitle)} · ${escapeRedpenHtml(input.episodeCutRef)}</small><h3 style="margin:4px 0 0;font-size:16px;">${escapeRedpenHtml(input.mentorName)} → ${escapeRedpenHtml(input.studentName)}</h3></div><span style="font-variant-numeric:tabular-nums;color:var(--rp-good);font-weight:700;">${escapeRedpenHtml(formatMsLabel(durationMs))} · ${sortedStrokes.length} strokes</span></header>`,
    `  <figure style="margin:12px 0;background:var(--rp-card);border:1px solid var(--rp-line);border-radius:12px;padding:8px;"><svg viewBox="0 0 1000 620" width="100%" role="img" aria-label="${escapeRedpenHtml(input.episodeCutRef)} redpen overlay">${svgPaths}</svg></figure>`,
    `  <section style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;"><div style="background:var(--rp-card);border:1px solid var(--rp-line);border-radius:10px;padding:10px;"><strong>Before</strong>${beforeImgTag}<p style="color:var(--rp-muted);margin:6px 0 0;">${escapeRedpenHtml(input.comparison.beforeSummary)}</p><small style="font-variant-numeric:tabular-nums;">Silhouette ${silhouetteBefore} · Eye-Flow ${eyeFlowBefore}</small></div><div style="background:var(--rp-card);border:1px solid var(--rp-line);border-radius:10px;padding:10px;"><strong>After (+${improvementDelta.silhouetteClarity} / +${improvementDelta.eyeFlowScore})</strong>${afterImgTag}<p style="color:var(--rp-muted);margin:6px 0 0;">${escapeRedpenHtml(input.comparison.afterSummary)}</p><small style="font-variant-numeric:tabular-nums;color:var(--rp-good);">Silhouette ${silhouetteAfter} · Eye-Flow ${eyeFlowAfter}</small></div></section>`,
    `  <details open style="margin-top:12px;font-size:13px;"><summary style="cursor:pointer;font-weight:700;">Voice Subtitles (${sortedSubtitles.length})</summary><ol style="margin:8px 0 0;padding-left:18px;color:var(--rp-muted);">${subtitleItems}</ol></details>`,
    takeawayItems ? `  <ul style="margin:10px 0 0;padding-left:18px;font-size:12px;color:var(--rp-muted);">${takeawayItems}</ul>` : "",
    `</article>`,
  ].filter(Boolean).join("\n");

  return {
    schemaVersion: "toonstudio.redpen-replay-card.v1", sessionId: input.sessionId, durationMs,
    strokeCount: sortedStrokes.length, subtitleCount: sortedSubtitles.length, categoryBreakdown,
    improvementDelta, strokes: sortedStrokes, subtitles: sortedSubtitles, sanitizedRefs, cardJson,
    cardByteSize: toUtf8Bytes(cardJson).length, htmlSnippet, integrityDigest: computeWalChecksum(cardJson, "sha256"),
  };
}

/** 붉은펜 첨삭 카드의 특정 재생 시각(timeMs) 기준 노출 획 진행률과 동기화 음성 자막을 계산한다. */
export function evaluateRedpenReplayAtTime(card: RedpenCritiqueReplayCard, timeMs: number): RedpenReplayFrameSnapshot {
  const clamped = Math.min(card.durationMs, Math.max(0, Math.round(timeMs)));
  const visibleStrokes = card.strokes
    .filter((stroke) => clamped >= stroke.startMs)
    .map((stroke) => ({
      stroke,
      strokeProgress: Math.round(Math.min(1, Math.max(0, (clamped - stroke.startMs) / Math.max(1, stroke.endMs - stroke.startMs))) * 1000) / 1000,
      isActive: clamped >= stroke.startMs && clamped <= stroke.endMs,
    }));
  const activeSubtitle = card.subtitles.find((cue) => clamped >= cue.startMs && clamped <= cue.endMs) ?? null;
  return { timeMs: clamped, progressPct: Math.round((clamped / Math.max(1, card.durationMs)) * 1000) / 10, visibleStrokes, activeSubtitle };
}

export const DEFAULT_REDPEN_CRITIQUE_INPUT: RedpenCritiqueReplayInput = {
  sessionId: "mentor-2026-ep02-cut14", mentorName: "최서연 멘토", studentName: "김도윤 수강생",
  courseTitle: "웹툰 연출 실전 아카데미 8기", episodeCutRef: "EP.02 / CUT-14", recordedAtIso: "2026-11-23T10:15:00.000Z",
  canvasWidthPx: 1600, canvasHeightPx: 1000,
  strokes: [
    { strokeId: "rp-01", startMs: 800, endMs: 4200, category: "perspective", labelKo: "소실점 아이레벨 재정렬", labelEn: "Realign Eye-Level Horizon", strokeWidthPx: 4, points: [{ x: 90, y: 340 }, { x: 520, y: 290 }, { x: 910, y: 250 }] },
    { strokeId: "rp-02", startMs: 4600, endMs: 8800, category: "anatomy", labelKo: "어깨선 기울기·무게중심 보정", labelEn: "Shoulder Tilt & Center of Mass", strokeWidthPx: 5, points: [{ x: 310, y: 210 }, { x: 430, y: 245 }, { x: 520, y: 390 }] },
    { strokeId: "rp-03", startMs: 9200, endMs: 13400, category: "line-weight", labelKo: "전경 실루엣 외곽선 강약 보강", labelEn: "Foreground Silhouette Line Weight", strokeWidthPx: 6, points: [{ x: 420, y: 180 }, { x: 495, y: 310 }, { x: 460, y: 510 }] },
    { strokeId: "rp-04", startMs: 13800, endMs: 18000, category: "balloon-flow", labelKo: "Z자 말풍선 시선 동선 정리", labelEn: "Z-Path Balloon Reading Flow", strokeWidthPx: 4, points: [{ x: 180, y: 110 }, { x: 760, y: 140 }, { x: 260, y: 460 }, { x: 810, y: 510 }] },
  ],
  subtitles: [
    { cueId: "sub-01", startMs: 600, endMs: 4400, speaker: "최서연 멘토", text: "배경 복도 소실점을 캐릭터 눈높이 쪽으로 12도만 내려 주면 위압감이 살아납니다.", linkedStrokeId: "rp-01" },
    { cueId: "sub-02", startMs: 4500, endMs: 9000, speaker: "최서연 멘토", text: "앞쪽 어깨가 수평이라 정적으로 보입니다. 오른어깨를 낮춰 달리는 무게중심을 잡아 주세요.", linkedStrokeId: "rp-02" },
    { cueId: "sub-03", startMs: 9100, endMs: 13600, speaker: "최서연 멘토", text: "전경 망토 외곽선만 1.5배 굵게 눌러 주면 배경과 인물이 한눈에 분리됩니다.", linkedStrokeId: "rp-03" },
    { cueId: "sub-04", startMs: 13700, endMs: 18200, speaker: "최서연 멘토", text: "말풍선은 좌상단에서 우하단 Z자로 떨어뜨려야 다음 컷 반전 시선이 끊기지 않습니다.", linkedStrokeId: "rp-04" },
  ],
  comparison: {
    beforeSummary: "인물과 배경 소실점이 분리되어 있고 말풍선이 얼굴 실루엣을 가려 시선이 분산됨.",
    afterSummary: "아이레벨 통합·어깨 기울기 보정·Z자 말풍선 정리로 핵심 표정 집중도 확보.",
    silhouetteClarityBefore: 58, silhouetteClarityAfter: 89, eyeFlowScoreBefore: 54, eyeFlowScoreAfter: 91,
    beforeImageRef: "assets/academy/ep02-cut14-before.webp", afterImageRef: "assets/academy/ep02-cut14-after.webp",
  },
  takeaways: [
    "전경 외곽선은 배경선 대비 1.4~1.6배 강약 대비를 유지한다.",
    "액션 추격 컷의 말풍선은 인물 시선 방향을 막지 않도록 Z 동선 여백에 배치한다.",
  ],
};
