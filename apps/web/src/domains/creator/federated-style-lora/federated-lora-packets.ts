import { computeSha256Hex, computeSha256HexFromText } from "./semantic-resource-streamer";
import { computeEffectiveDeltaW, computeFloat32L2Norm } from "./lora-math";
import { assertAdapter, assertPrivacyConfig, requireFinite, requireInteger } from "./lora-input-contract";
import type { FedAvgAggregationResult, FederatedLoraDeltaPacket, FederatedLoraSession, LoraAdapterWeights, RejectedDeltaPacketRecord, ZeroRawEgressVerification, DeviceContributionWeight } from "./federated-lora-engine";

type PacketHeader = Pick<FederatedLoraDeltaPacket, "baseAdapterId" | "baseFingerprintSha256" | "deviceId" | "rank" | "inDim" | "outDim" | "alpha" | "sampleCount" | "stepsCompleted" | "epsilonSpent" | "delta" | "clipNormC" | "noiseMultiplier">;

function adapterFingerprint(adapter: LoraAdapterWeights): string {
  return computeSha256HexFromText(JSON.stringify([adapter.adapterId, adapter.inDim, adapter.outDim, adapter.rank, adapter.alpha, Array.from(adapter.matrixA), Array.from(adapter.matrixB)]));
}

function computeDeltaPacketChecksum(header: PacketHeader, deltaA: Float32Array, deltaB: Float32Array): string {
  const headerDigest = computeSha256HexFromText(JSON.stringify([header.baseAdapterId, header.baseFingerprintSha256, header.deviceId, header.rank, header.inDim, header.outDim, header.alpha, header.sampleCount, header.stepsCompleted, header.epsilonSpent, header.delta, header.clipNormC, header.noiseMultiplier, deltaA.length, deltaB.length]));
  const byteView = new Uint8Array((deltaA.length + deltaB.length) * 4 + 32);
  for (let i = 0; i < 32; i += 1) byteView[i] = Number.parseInt(headerDigest.slice(i * 2, i * 2 + 2), 16) & 0xff;
  const view = new DataView(byteView.buffer, 32);
  let offset = 0;
  for (let i = 0; i < deltaA.length; i += 1) { view.setFloat32(offset, deltaA[i] ?? 0, true); offset += 4; }
  for (let i = 0; i < deltaB.length; i += 1) { view.setFloat32(offset, deltaB[i] ?? 0, true); offset += 4; }
  return computeSha256Hex(byteView);
}

/** 예제 세션에서 수치 델타 패킷을 구성한다. 원본을 포함하거나 송신하지 않는다. */
export function exportFederatedLoraDelta(session: FederatedLoraSession, deviceLabel = "메인 작업실 데스크톱"): FederatedLoraDeltaPacket {
  const { baseAdapter, currentAdapter, privacyConfig } = session;
  assertAdapter(baseAdapter); assertAdapter(currentAdapter); assertPrivacyConfig(privacyConfig);
  if (baseAdapter.inDim !== currentAdapter.inDim || baseAdapter.outDim !== currentAdapter.outDim || baseAdapter.rank !== currentAdapter.rank || baseAdapter.alpha !== currentAdapter.alpha) throw new RangeError("기준과 현재 어댑터의 형상이 다릅니다.");
  requireInteger(session.totalSamplesProcessed, "처리 샘플 수", 0, Number.MAX_SAFE_INTEGER);
  const baseFingerprintSha256 = adapterFingerprint(baseAdapter);
  const deltaA = new Float32Array(currentAdapter.matrixA.length);
  const deltaB = new Float32Array(currentAdapter.matrixB.length);
  for (let i = 0; i < deltaA.length; i += 1) deltaA[i] = (currentAdapter.matrixA[i] ?? 0) - (baseAdapter.matrixA[i] ?? 0);
  for (let i = 0; i < deltaB.length; i += 1) deltaB[i] = (currentAdapter.matrixB[i] ?? 0) - (baseAdapter.matrixB[i] ?? 0);

  const sampleCount = session.totalSamplesProcessed;
  const header: PacketHeader = {
    baseAdapterId: baseAdapter.adapterId, baseFingerprintSha256, deviceId: session.deviceId,
    rank: currentAdapter.rank, inDim: currentAdapter.inDim, outDim: currentAdapter.outDim, alpha: currentAdapter.alpha,
    sampleCount, stepsCompleted: session.stepCount, epsilonSpent: session.epsilonSpent,
    delta: privacyConfig.delta, clipNormC: privacyConfig.clipNormC, noiseMultiplier: privacyConfig.noiseMultiplier,
  };
  const checksumSha256 = computeDeltaPacketChecksum(header, deltaA, deltaB);
  return {
    packetId: `pkt-${session.deviceId}-s${session.stepCount}-${checksumSha256.slice(0, 8)}`,
    deviceId: session.deviceId,
    deviceLabel,
    baseAdapterId: baseAdapter.adapterId,
    baseFingerprintSha256,
    inDim: currentAdapter.inDim,
    outDim: currentAdapter.outDim,
    rank: currentAdapter.rank,
    alpha: currentAdapter.alpha,
    sampleCount,
    stepsCompleted: session.stepCount,
    epsilonSpent: session.epsilonSpent,
    delta: privacyConfig.delta,
    clipNormC: privacyConfig.clipNormC,
    noiseMultiplier: privacyConfig.noiseMultiplier,
    deltaA,
    deltaB,
    deltaL2Norm: Number(Math.sqrt(computeFloat32L2Norm(deltaA) ** 2 + computeFloat32L2Norm(deltaB) ** 2).toFixed(6)),
    checksumSha256,
    egressAudit: {
      rawPixelBytesTransmitted: 0,
      deltaPayloadBytes: (deltaA.length + deltaB.length) * 4,
      containsRawPixels: false,
      privacyGuarantee: "unverified-deterministic-example",
      privacyVerified: false,
    },
  };
}

const FORBIDDEN_RAW_PIXEL_KEYS: readonly string[] = ["pixels", "pixelRgba", "imageData", "rawCanvas", "rawManuscript"];

/** 예제 패킷의 형태·메타데이터·체크섬만 검사한다. 네트워크 송신이나 프라이버시를 검증하지 않는다. */
export function verifyZeroRawEgress(packet: FederatedLoraDeltaPacket): ZeroRawEgressVerification {
  const reasons: string[] = [];
  if (!packet.packetId.trim() || !packet.deviceId.trim() || !packet.baseAdapterId.trim() || !/^[a-f0-9]{64}$/.test(packet.baseFingerprintSha256)) reasons.push("invalid-packet-identity");
  if (!Number.isSafeInteger(packet.sampleCount) || packet.sampleCount <= 0) reasons.push("invalid-sample-count");
  if (![4, 8, 16].includes(packet.rank) || !Number.isInteger(packet.inDim) || !Number.isInteger(packet.outDim) || packet.inDim < 1 || packet.inDim > 256 || packet.outDim < 1 || packet.outDim > 256) reasons.push("invalid-adapter-shape");
  if (![packet.alpha, packet.epsilonSpent, packet.delta, packet.clipNormC, packet.noiseMultiplier].every(Number.isFinite) || packet.alpha <= 0 || packet.epsilonSpent < 0 || packet.delta <= 0 || packet.delta > 0.1 || packet.clipNormC <= 0 || packet.noiseMultiplier <= 0) reasons.push("invalid-packet-metadata");
  if (packet.egressAudit.rawPixelBytesTransmitted !== 0) reasons.push("raw-pixel-bytes-nonzero");
  if (packet.egressAudit.containsRawPixels !== false) reasons.push("contains-raw-pixels-flag");

  for (const key of FORBIDDEN_RAW_PIXEL_KEYS) {
    if (Reflect.has(packet, key) && Reflect.get(packet, key) !== undefined) reasons.push(`forbidden-key:${key}`);
  }
  if (packet.deltaA.length !== packet.outDim * packet.rank || packet.deltaB.length !== packet.rank * packet.inDim) {
    reasons.push("dimension-length-mismatch");
  }
  if (packet.egressAudit.deltaPayloadBytes !== (packet.deltaA.length + packet.deltaB.length) * 4) {
    reasons.push("delta-payload-bytes-mismatch");
  }
  if (packet.deltaA.some((v) => !Number.isFinite(v))) reasons.push("non-finite-deltaA");
  if (packet.deltaB.some((v) => !Number.isFinite(v))) reasons.push("non-finite-deltaB");

  if (reasons.length === 0 && computeDeltaPacketChecksum(packet, packet.deltaA, packet.deltaB) !== packet.checksumSha256) reasons.push("checksum-sha256-mismatch");
  return { verificationKind: "packet-shape-and-checksum-only", privacyVerified: false, valid: reasons.length === 0, reasons };
}

/** 공통 기준 가중치의 예제 델타를 가중 평균한다. 체크섬·노름 검사는 원격 기기 인증이나 안전성 보증이 아니다. */
export function aggregateFederatedLoraDeltas(
  baseAdapter: LoraAdapterWeights,
  packets: readonly FederatedLoraDeltaPacket[],
  options?: { readonly maxAllowedDeltaNorm?: number },
): FedAvgAggregationResult {
  assertAdapter(baseAdapter);
  const maxNorm = options?.maxAllowedDeltaNorm ?? 25.0;
  requireFinite(maxNorm, "델타 노름 상한", Number.MIN_VALUE);
  const fingerprint = adapterFingerprint(baseAdapter);
  const seenPackets = new Set<string>();
  const seenDevices = new Set<string>();
  const accepted: FederatedLoraDeltaPacket[] = [];
  const rejectedPackets: RejectedDeltaPacketRecord[] = [];

  for (const packet of packets) {
    const reasons: string[] = [];
    if (packet.baseAdapterId !== baseAdapter.adapterId || packet.baseFingerprintSha256 !== fingerprint || packet.alpha !== baseAdapter.alpha) reasons.push("base-adapter-mismatch");
    if (seenPackets.has(packet.packetId)) reasons.push("duplicate-packet");
    if (seenDevices.has(packet.deviceId)) reasons.push("duplicate-device");
    if (packet.rank !== baseAdapter.rank || packet.inDim !== baseAdapter.inDim || packet.outDim !== baseAdapter.outDim) {
      reasons.push("adapter-shape-mismatch");
    }
    if (packet.sampleCount <= 0 || !Number.isFinite(packet.sampleCount)) reasons.push("invalid-sample-count");
    const egressCheck = verifyZeroRawEgress(packet);
    if (!egressCheck.valid) reasons.push(...egressCheck.reasons);
    const computedNorm = egressCheck.valid ? Math.sqrt(computeFloat32L2Norm(packet.deltaA) ** 2 + computeFloat32L2Norm(packet.deltaB) ** 2) : Infinity;
    if (!Number.isFinite(computedNorm) || computedNorm > maxNorm) reasons.push("delta-norm-exceeds-guard");

    if (reasons.length > 0) rejectedPackets.push({ packetId: packet.packetId, deviceId: packet.deviceId, reasons });
    else { accepted.push(packet); seenPackets.add(packet.packetId); seenDevices.add(packet.deviceId); }
  }

  if (accepted.length === 0) {
    return {
      ok: false,
      mergedAdapter: { ...baseAdapter, matrixA: new Float32Array(baseAdapter.matrixA), matrixB: new Float32Array(baseAdapter.matrixB) },
      effectiveDeltaWNorm: Number(computeEffectiveDeltaW(baseAdapter).frobeniusNorm.toFixed(6)),
      acceptedCount: 0,
      rejectedPackets,
      contributions: [],
      totalSamplesMerged: 0,
      rawPixelBytesTransmitted: 0,
      roundDigestSha256: computeSha256HexFromText(`fedavg-empty|${baseAdapter.adapterId}`),
    };
  }

  const totalSamplesMerged = accepted.reduce((sum, pkt) => sum + pkt.sampleCount, 0);
  requireInteger(totalSamplesMerged, "병합 샘플 수", 1, Number.MAX_SAFE_INTEGER);
  const aggDeltaA = new Float32Array(baseAdapter.matrixA.length);
  const aggDeltaB = new Float32Array(baseAdapter.matrixB.length);
  const contributions: DeviceContributionWeight[] = accepted.map((pkt) => {
    const weightRatio = pkt.sampleCount / totalSamplesMerged;
    for (let i = 0; i < aggDeltaA.length; i += 1) aggDeltaA[i] = (aggDeltaA[i] ?? 0) + weightRatio * (pkt.deltaA[i] ?? 0);
    for (let i = 0; i < aggDeltaB.length; i += 1) aggDeltaB[i] = (aggDeltaB[i] ?? 0) + weightRatio * (pkt.deltaB[i] ?? 0);
    return { deviceId: pkt.deviceId, deviceLabel: pkt.deviceLabel, sampleCount: pkt.sampleCount, weightRatio: Number(weightRatio.toFixed(4)), epsilonSpent: pkt.epsilonSpent };
  });

  const mergedA = new Float32Array(baseAdapter.matrixA.length);
  const mergedB = new Float32Array(baseAdapter.matrixB.length);
  for (let i = 0; i < mergedA.length; i += 1) mergedA[i] = (baseAdapter.matrixA[i] ?? 0) + (aggDeltaA[i] ?? 0);
  for (let i = 0; i < mergedB.length; i += 1) mergedB[i] = (baseAdapter.matrixB[i] ?? 0) + (aggDeltaB[i] ?? 0);

  const mergedAdapter: LoraAdapterWeights = { ...baseAdapter, matrixA: mergedA, matrixB: mergedB };
  return {
    ok: true,
    mergedAdapter,
    effectiveDeltaWNorm: Number(computeEffectiveDeltaW(mergedAdapter).frobeniusNorm.toFixed(6)),
    acceptedCount: accepted.length,
    rejectedPackets,
    contributions,
    totalSamplesMerged,
    rawPixelBytesTransmitted: 0,
    roundDigestSha256: computeSha256HexFromText(JSON.stringify([fingerprint, accepted.map((packet) => [packet.packetId, packet.deviceId, packet.checksumSha256]), Array.from(aggDeltaA), Array.from(aggDeltaB)])),
  };
}
