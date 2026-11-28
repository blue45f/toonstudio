import { describe, expect, it } from "vitest";

import {
  CompanionPenJitterBuffer, DEFAULT_TILE_SIZE_PX, MAX_COMPANION_VISIBLE_CONTROLS, MAX_PREDICTION_LEAD_MS,
  MIN_COMPANION_VISIBLE_CONTROLS, MIN_TABLET_HIT_TARGET_PX, PEN_SAMPLE_PACKET_BYTES, PairingReplayNonceGuard,
  TACTILE_DIAL_PACKET_BYTES, applyCompanionTileDeltaFrame, buildCompanionPairingResponse, createCompanionAtelierSession,
  createCompanionPairingChallenge, decodePenBatchPacket, decodePenSamplePacket, decodeTactileDialEvent,
  encodePenBatchPacket, encodePenSamplePacket, encodeTactileDialEvent, formatTileKey, hmacSha256Hex,
  planCompanionTileDeltaFrame, sha256Hex, validatePrivateLanHost, verifyCompanionHostAck, verifyCompanionPairingResponse,
  type CompanionControlSpec, type HostDirtyTileInput, type PenSample, type TabletTileBufferEntry, type TactileDialEvent,
} from "./index";

function makePenSample(seq: number, overrides: Partial<PenSample> = {}): PenSample {
  return {
    sequence: seq,
    timestampUs: 1_000_000 + seq * 4167,
    xNorm: Math.min(1, 0.1 + seq * 0.02),
    yNorm: Math.min(1, 0.2 + seq * 0.015),
    pressure: 0.65,
    altitudeRad: 0.92,
    azimuthRad: 2.35,
    barrelRoll: -0.48,
    hoverHeight: 0,
    flags: { penDown: true, hover: false, eraser: false, barrelBtn: false, palmReject: true },
    ...overrides,
  };
}

function createSolidTile(tileSize: number, r: number, g: number, b: number, a: number): Uint8Array {
  const buf = new Uint8Array(tileSize * tileSize * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a;
  }
  return buf;
}

function paintBrushDab(
  tile: Uint8Array,
  tileSize: number,
  cx: number,
  cy: number,
  radius: number,
  rgba: readonly [number, number, number, number],
): Uint8Array {
  const next = tile.slice();
  for (let y = 0; y < tileSize; y += 1) {
    for (let x = 0; x < tileSize; x += 1) {
      if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= radius * radius) {
        const off = (y * tileSize + x) * 4;
        next[off] = rgba[0]; next[off + 1] = rgba[1]; next[off + 2] = rgba[2]; next[off + 3] = rgba[3];
      }
    }
  }
  return next;
}

describe("Wave 78 — 사설 LAN 호스트 검증 및 상호 암호화 페어링", () => {
  it("사설 LAN·루프백·mDNS·USB 링크로컬 호스트를 모두 허용한다", () => {
    const cases = [
      ["192.168.1.42", "rfc1918-192", "lan-direct"],
      ["10.0.0.8", "rfc1918-10", "lan-direct"],
      ["172.16.4.9", "rfc1918-172", "lan-direct"],
      ["172.31.255.10", "rfc1918-172", "lan-direct"],
      ["127.0.0.1", "loopback", "usb-tether-loopback"],
      ["localhost", "loopback", "usb-tether-loopback"],
      ["mac-studio.local", "mdns-local", "lan-direct"],
      ["169.254.12.5", "usb-link-local", "usb-tether-loopback"],
    ] as const;
    for (const [host, scope, hint] of cases) {
      const res = validatePrivateLanHost(host);
      expect(res.allowed, host).toBe(true);
      expect(res.scope).toBe(scope);
      expect(res.transportHint).toBe(hint);
    }
  });

  it("공인 WAN IP, 외부 URL, 비허용 대역·위장 호스트는 fail-closed로 거부한다", () => {
    const blocked = [
      "8.8.8.8", "1.1.1.1", "https://evil.example", "http://192.168.1.42",
      "evil.example", "172.15.4.9", "172.32.0.1", "192.169.1.42",
      "0.0.0.0", "127.0.0.1@evil.example", "012.0.0.1", "1234.local", "",
    ];
    for (const host of blocked) {
      const res = validatePrivateLanHost(host);
      expect(res.allowed, host).toBe(false);
      expect(res.scope).toBeNull();
    }
  });

  it("FIPS 180-4 SHA-256과 RFC 4231 HMAC-SHA256 표준 벡터가 정확히 일치한다", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("공인 호스트·잘못된 포트·비규격 PIN은 챌린지 발급 단계에서 즉시 차단한다", () => {
    const pubIp = createCompanionPairingChallenge({ host: "8.8.8.8", port: 9443, hostDeviceId: "mac", issuedAtMs: 1000 });
    expect(pubIp.ok).toBe(false);
    if (!pubIp.ok) expect(pubIp.errorCode).toBe("PUBLIC_HOST_REJECTED");

    const pubUrl = createCompanionPairingChallenge({ host: "https://evil.example", port: 9443, hostDeviceId: "mac", issuedAtMs: 1000 });
    expect(pubUrl.ok).toBe(false);
    if (!pubUrl.ok) expect(pubUrl.errorCode).toBe("PUBLIC_HOST_REJECTED");

    const badPort = createCompanionPairingChallenge({ host: "192.168.1.42", port: 70000, hostDeviceId: "mac", issuedAtMs: 1000 });
    expect(badPort.ok).toBe(false);
    if (!badPort.ok) expect(badPort.errorCode).toBe("INVALID_PORT");

    const badPin = createCompanionPairingChallenge({ host: "192.168.1.42", port: 9443, hostDeviceId: "mac", issuedAtMs: 1000, pin: "1234" });
    expect(badPin.ok).toBe(false);
    if (!badPin.ok) expect(badPin.errorCode).toBe("INVALID_PIN_FORMAT");
  });

  it("유효한 6자리 PIN·논스로 상호 HMAC-SHA256 페어링과 호스트 ACK 검증에 성공한다", () => {
    const issued = createCompanionPairingChallenge({
      host: "192.168.1.42", port: 9443, hostDeviceId: "mac-studio-m4", issuedAtMs: 10_000, ttlMs: 60_000, entropySeed: "seed-78",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(issued.challenge.pin).toMatch(/^[0-9]{6}$/);
    expect(issued.challenge.qrUri.startsWith("toonstudio-lan://pair?")).toBe(true);
    expect(issued.challenge.qrUri).not.toContain(issued.challenge.pin);

    const replayGuard = new PairingReplayNonceGuard();
    const tabletNonceHex = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
    const response = buildCompanionPairingResponse({
      challengeId: issued.challenge.challengeId, host: issued.challenge.host, port: issued.challenge.port,
      hostNonceHex: issued.challenge.hostNonceHex, pin: issued.challenge.pin, tabletDeviceId: "ipad-pro-m4",
      tabletNonceHex, respondedAtMs: 12_000,
    });
    const verified = verifyCompanionPairingResponse({ challenge: issued.challenge, response, nowMs: 12_100, replayGuard });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.session.sessionKeyHex).toHaveLength(64);
    expect(verifyCompanionHostAck({
      challengeId: issued.challenge.challengeId, host: issued.challenge.host, port: issued.challenge.port,
      hostNonceHex: issued.challenge.hostNonceHex, pin: issued.challenge.pin, tabletDeviceId: "ipad-pro-m4",
      tabletNonceHex, hostAckHex: verified.session.hostAckHex,
    })).toBe(true);
  });

  it("잘못된 PIN·변조된 호스트 ACK를 거부한다", () => {
    const issued = createCompanionPairingChallenge({
      host: "mac-studio.local", port: 9443, hostDeviceId: "mac-studio", issuedAtMs: 50_000, pin: "482913", entropySeed: "seed-pin",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const wrongPinResp = buildCompanionPairingResponse({
      challengeId: issued.challenge.challengeId, host: issued.challenge.host, port: issued.challenge.port,
      hostNonceHex: issued.challenge.hostNonceHex, pin: "482914", tabletDeviceId: "galaxy-tab",
      tabletNonceHex: "0123456789abcdef0123456789abcdef", respondedAtMs: 55_000,
    });
    const res = verifyCompanionPairingResponse({ challenge: issued.challenge, response: wrongPinResp, nowMs: 55_100 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.errorCode).toBe("INVALID_PIN_OR_PROOF");

    expect(verifyCompanionHostAck({
      challengeId: issued.challenge.challengeId, host: issued.challenge.host, port: issued.challenge.port,
      hostNonceHex: issued.challenge.hostNonceHex, pin: "482913", tabletDeviceId: "galaxy-tab",
      tabletNonceHex: "0123456789abcdef0123456789abcdef", hostAckHex: "0".repeat(64),
    })).toBe(false);
  });

  it("논스 재전송과 만료된 챌린지·비규격 논스를 차단하고 시간 윈도우 경과 후 논스를 정리한다", () => {
    const issued = createCompanionPairingChallenge({
      host: "10.0.0.8", port: 9443, hostDeviceId: "mac", issuedAtMs: 50_000, ttlMs: 30_000, pin: "112233", entropySeed: "seed-replay",
    });
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    const replayGuard = new PairingReplayNonceGuard(15_000);
    const valid = buildCompanionPairingResponse({
      challengeId: issued.challenge.challengeId, host: issued.challenge.host, port: issued.challenge.port,
      hostNonceHex: issued.challenge.hostNonceHex, pin: "112233", tabletDeviceId: "ipad",
      tabletNonceHex: "fedcba9876543210fedcba9876543210", respondedAtMs: 52_000,
    });
    expect(verifyCompanionPairingResponse({ challenge: issued.challenge, response: valid, nowMs: 52_100, replayGuard }).ok).toBe(true);

    const replay = verifyCompanionPairingResponse({ challenge: issued.challenge, response: valid, nowMs: 52_200, replayGuard });
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.errorCode).toBe("NONCE_REPLAYED");

    const shortNonce = verifyCompanionPairingResponse({
      challenge: issued.challenge, response: { ...valid, tabletNonceHex: "abcd" }, nowMs: 52_300, replayGuard,
    });
    expect(shortNonce.ok).toBe(false);
    if (!shortNonce.ok) expect(shortNonce.errorCode).toBe("INVALID_NONCE_FORMAT");

    const expired = verifyCompanionPairingResponse({
      challenge: issued.challenge, response: { ...valid, tabletNonceHex: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }, nowMs: 85_000, replayGuard,
    });
    expect(expired.ok).toBe(false);
    if (!expired.ok) expect(expired.errorCode).toBe("CHALLENGE_EXPIRED");

    replayGuard.prune(80_000);
    expect(replayGuard.size).toBe(0);
  });
});

describe("Wave 78 — 32바이트 바이너리 펜·배치 및 촉각 다이얼 코덱", () => {
  it("단일 펜 샘플을 32바이트로 왕복 인코딩하고 양자화 오차를 1e-3 미만으로 유지한다", () => {
    const sample: PenSample = {
      sequence: 42_198, timestampUs: 98_765_432, xNorm: 0.73421, yNorm: 0.28914, pressure: 0.81234,
      altitudeRad: 1.1425, azimuthRad: 5.4321, barrelRoll: -2.1734, hoverHeight: 0.1425,
      flags: { penDown: true, hover: true, eraser: false, barrelBtn: true, palmReject: true, predicted: false },
    };
    const bytes = encodePenSamplePacket(sample);
    expect(bytes.byteLength).toBe(PEN_SAMPLE_PACKET_BYTES);
    const decoded = decodePenSamplePacket(bytes);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.sequence).toBe(sample.sequence);
    expect(decoded.value.timestampUs).toBe(sample.timestampUs);
    expect(Math.abs(decoded.value.xNorm - sample.xNorm)).toBeLessThan(1e-3);
    expect(Math.abs(decoded.value.yNorm - sample.yNorm)).toBeLessThan(1e-3);
    expect(Math.abs(decoded.value.pressure - sample.pressure)).toBeLessThan(1e-3);
    expect(Math.abs(decoded.value.altitudeRad - sample.altitudeRad)).toBeLessThan(1e-3);
    expect(Math.abs(decoded.value.azimuthRad - sample.azimuthRad)).toBeLessThan(1e-3);
    expect(Math.abs(decoded.value.barrelRoll - sample.barrelRoll)).toBeLessThan(1e-3);
    expect(Math.abs(decoded.value.hoverHeight - sample.hoverHeight)).toBeLessThan(1e-3);
    expect(decoded.value.flags).toEqual(sample.flags);
  });

  it("32바이트 펜 패킷의 어느 위치든 1바이트 비트 반전이 생기면 CRC-32로 즉시 거부한다", () => {
    const encoded = encodePenSamplePacket(makePenSample(7));
    for (let pos = 0; pos < encoded.byteLength; pos += 1) {
      const corrupted = encoded.slice();
      corrupted[pos] = (corrupted[pos] ?? 0) ^ 0x01;
      const decoded = decodePenSamplePacket(corrupted);
      expect(decoded.ok, `offset ${pos}`).toBe(false);
      if (!decoded.ok) expect(decoded.errorCode).toBe("CRC_MISMATCH");
    }
  });

  it("잘못된 패킷 길이와 패킷 종류 교차 디코딩을 fail-closed로 차단한다", () => {
    expect(decodePenSamplePacket(new Uint8Array(16)).ok).toBe(false);
    const dialBytes = encodeTactileDialEvent({
      sequence: 1, timestampUs: 1000, kind: "opacity", stepDelta: 1, normalizedValue: 0.5,
      isCommit: false, hapticDetent: false, finePrecision: false,
    });
    const wrongKind = decodePenSamplePacket(dialBytes);
    expect(wrongKind.ok).toBe(false);
    if (!wrongKind.ok) expect(wrongKind.errorCode).toBe("UNEXPECTED_PACKET_KIND");
  });

  it("480Hz 다중 펜 배치 패킷을 정확히 왕복 디코딩하고 손상 배치는 차단한다", () => {
    const packet = encodePenBatchPacket({ sampleRateHz: 480, samples: [makePenSample(10), makePenSample(11), makePenSample(12), makePenSample(13)] });
    expect(packet.byteLength).toBe(8 + 4 * 24 + 4);
    const decoded = decodePenBatchPacket(packet);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.value.sampleRateHz).toBe(480);
    expect(decoded.value.samples.map((s) => s.sequence)).toEqual([10, 11, 12, 13]);

    const damaged = packet.slice();
    damaged[15] = (damaged[15] ?? 0) ^ 0x80;
    const failed = decodePenBatchPacket(damaged);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.errorCode).toBe("CRC_MISMATCH");
  });

  it("촉각 다이얼 5종과 혼색 팔레트 스와치 이벤트를 32바이트로 왕복 디코딩한다", () => {
    const events: readonly TactileDialEvent[] = [
      { sequence: 1, timestampUs: 100_000, kind: "brush-size", stepDelta: 3, normalizedValue: 28.5, isCommit: false, hapticDetent: true, finePrecision: false },
      { sequence: 2, timestampUs: 108_000, kind: "opacity", stepDelta: -2, normalizedValue: 0.72, isCommit: true, hapticDetent: true, finePrecision: true },
      { sequence: 3, timestampUs: 116_000, kind: "canvas-rotation", stepDelta: 15, normalizedValue: -45, isCommit: true, hapticDetent: false, finePrecision: false },
      { sequence: 4, timestampUs: 124_000, kind: "undo-scrub", stepDelta: -4, normalizedValue: 4, isCommit: true, hapticDetent: true, finePrecision: false },
      { sequence: 5, timestampUs: 132_000, kind: "wet-paint-mixer-swatch", stepDelta: 0, normalizedValue: 0.6, isCommit: true, hapticDetent: false, finePrecision: true, swatchRgba: { r: 214, g: 132, b: 84, a: 255 }, wetness: 0.68, swatchSlotIndex: 5 },
    ];
    for (const ev of events) {
      const encoded = encodeTactileDialEvent(ev);
      expect(encoded.byteLength).toBe(TACTILE_DIAL_PACKET_BYTES);
      const decoded = decodeTactileDialEvent(encoded);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      expect(decoded.value.kind).toBe(ev.kind);
      expect(decoded.value.stepDelta).toBe(ev.stepDelta);
      expect(Math.abs(decoded.value.normalizedValue - ev.normalizedValue)).toBeLessThan(1e-4);
      if (ev.swatchRgba) expect(decoded.value.swatchRgba).toEqual(ev.swatchRgba);
      if (ev.wetness !== undefined) expect(Math.abs((decoded.value.wetness ?? 0) - ev.wetness)).toBeLessThan(1e-3);
      if (ev.swatchSlotIndex !== undefined) expect(decoded.value.swatchSlotIndex).toBe(ev.swatchSlotIndex);
    }
    const badDial = encodeTactileDialEvent(events[4] as TactileDialEvent);
    badDial[21] = (badDial[21] ?? 0) ^ 0x04;
    expect(decodeTactileDialEvent(badDial).ok).toBe(false);
  });
});

describe("Wave 78 — 8ms 미만 적응형 펜 지터 버퍼 및 운동학 예측기", () => {
  it("순서가 뒤바뀐 패킷(seq 1, 3, 2, 4)을 정확한 오름차순으로 복원하고 중복을 제거한다", () => {
    const buffer = new CompanionPenJitterBuffer({ reorderGapReleaseAheadCount: 3 });
    const ordered: number[] = [];
    ordered.push(...buffer.pushSample(makePenSample(1), 10).emitted.map((s) => s.sequence));
    const r3 = buffer.pushSample(makePenSample(3), 14);
    expect(r3.status).toBe("buffered-out-of-order");
    expect(buffer.pushSample(makePenSample(3), 15).status).toBe("duplicate");
    ordered.push(...buffer.pushSample(makePenSample(2), 16).emitted.map((s) => s.sequence));
    ordered.push(...buffer.pushSample(makePenSample(4), 20).emitted.map((s) => s.sequence));
    expect(ordered).toEqual([1, 2, 3, 4]);
    expect(buffer.getTelemetry().reorderedPackets).toBe(1);
    expect(buffer.getTelemetry().duplicatePackets).toBe(1);
  });

  it("유실된 중간 패킷(seq 3)을 스파이크 없이 Catmull-Rom 큐빅 에르미트 보간으로 채운다", () => {
    const buffer = new CompanionPenJitterBuffer({ reorderGapReleaseAheadCount: 2 });
    const curve = (seq: number): PenSample =>
      makePenSample(seq, { timestampUs: seq * 4000, xNorm: 0.1 + seq * 0.1, yNorm: 0.2 + 0.05 * Math.sin(seq * 0.4), pressure: 0.4 + seq * 0.08 });
    const emitted: PenSample[] = [];
    const origins: string[] = [];
    for (const seq of [1, 2, 4, 5]) {
      for (const s of buffer.pushSample(curve(seq), seq * 4).emitted) {
        emitted.push(s);
        origins.push(s.origin);
      }
    }
    expect(emitted.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
    expect(origins[2]).toBe("interpolated");
    const p2 = emitted[1]; const interp = emitted[2]; const p4 = emitted[3];
    expect(interp && p2 && p4 ? interp.xNorm > p2.xNorm && interp.xNorm < p4.xNorm : false).toBe(true);
    expect(Math.abs((interp?.xNorm ?? 0) - 0.4)).toBeLessThan(0.015);
    expect(Math.abs((interp?.pressure ?? 0) - 0.64)).toBeLessThan(0.02);
  });

  it("연속 2패킷 결손 시 강제 플러시로 단조 보간을 완성한다", () => {
    const buffer = new CompanionPenJitterBuffer({ reorderGapReleaseAheadCount: 5 });
    buffer.pushSample(makePenSample(1, { timestampUs: 0, xNorm: 0.1, yNorm: 0.2 }));
    buffer.pushSample(makePenSample(2, { timestampUs: 4000, xNorm: 0.2, yNorm: 0.25 }));
    buffer.pushSample(makePenSample(5, { timestampUs: 16000, xNorm: 0.5, yNorm: 0.4 }));
    const flushed = buffer.flushPendingWithGapInterpolation();
    expect(flushed.interpolatedCount).toBe(2);
    expect(flushed.emitted.map((s) => s.sequence)).toEqual([3, 4, 5]);
    expect((flushed.emitted[0]?.xNorm ?? 0) < (flushed.emitted[1]?.xNorm ?? 0)).toBe(true);
  });

  it("직선 궤적의 전방 예측을 8ms 상한으로 제한한다", () => {
    const buffer = new CompanionPenJitterBuffer();
    buffer.pushSample(makePenSample(1, { timestampUs: 0, xNorm: 0.2, yNorm: 0.5 }));
    buffer.pushSample(makePenSample(2, { timestampUs: 4000, xNorm: 0.24, yNorm: 0.5 }));
    buffer.pushSample(makePenSample(3, { timestampUs: 8000, xNorm: 0.28, yNorm: 0.5 }));
    const pred = buffer.predictNextSample(24);
    expect(pred.suppressionReason).toBe("none");
    expect(pred.appliedLeadMs).toBe(MAX_PREDICTION_LEAD_MS);
    expect(pred.sample?.xNorm).toBeCloseTo(0.36, 3);
    expect(pred.sample?.flags.predicted).toBe(true);
  });

  it("급격한 코너(90도 회전)에서는 예측을 0ms로 억제한다", () => {
    const buffer = new CompanionPenJitterBuffer({ cornerCurvatureThresholdRad: 0.45 });
    buffer.pushSample(makePenSample(1, { timestampUs: 0, xNorm: 0.2, yNorm: 0.2 }));
    buffer.pushSample(makePenSample(2, { timestampUs: 4000, xNorm: 0.3, yNorm: 0.2 }));
    buffer.pushSample(makePenSample(3, { timestampUs: 8000, xNorm: 0.3, yNorm: 0.3 }));
    const pred = buffer.predictNextSample(6);
    expect(pred.suppressionReason).toBe("sharp-corner");
    expect(pred.appliedLeadMs).toBe(0);
    expect(pred.cornerAngleRad).toBeGreaterThan(1.4);
    expect(pred.sample?.xNorm).toBeCloseTo(0.3, 5);
  });

  it("prefersReducedMotion 및 펜 리프트 상태에서는 예측을 0ms로 억제한다", () => {
    const reduced = new CompanionPenJitterBuffer({ prefersReducedMotion: true });
    reduced.pushSample(makePenSample(1, { timestampUs: 0, xNorm: 0.2, yNorm: 0.5 }));
    reduced.pushSample(makePenSample(2, { timestampUs: 4000, xNorm: 0.25, yNorm: 0.5 }));
    expect(reduced.predictNextSample(6).appliedLeadMs).toBe(0);
    expect(reduced.predictNextSample(6).suppressionReason).toBe("reduced-motion");

    const lifted = new CompanionPenJitterBuffer();
    lifted.pushSample(makePenSample(1, { flags: { penDown: false, hover: true, eraser: false, barrelBtn: false, palmReject: true } }));
    const liftPred = lifted.predictNextSample(6);
    expect(liftPred.appliedLeadMs).toBe(0);
    expect(liftPred.suppressionReason).toBe("pen-lifted");
  });

  it("RTT·지터·전송 힌트에 따라 transportMode와 8ms 예산 준수 여부를 정확히 보고한다", () => {
    const usb = new CompanionPenJitterBuffer({ transportHint: "usb-tether-loopback" });
    usb.recordRttSample(1.8);
    usb.pushSample(makePenSample(1), 10);
    expect(usb.getTelemetry().withinSub8msBudget).toBe(true);
    expect(usb.getTelemetry().activeTransportMode).toBe("usb-tether-loopback");

    const lan = new CompanionPenJitterBuffer({ transportHint: "lan-direct" });
    lan.recordRttSample(4.2);
    lan.pushSample(makePenSample(1), 10);
    expect(lan.getTelemetry().activeTransportMode).toBe("lan-direct");
    for (let i = 0; i < 12; i += 1) lan.recordRttSample(26);
    expect(lan.getTelemetry().withinSub8msBudget).toBe(false);
    expect(lan.getTelemetry().activeTransportMode).toBe("degraded-fallback");
  });
});

describe("Wave 78 — 호스트→태블릿 시선 중심(Foveated) 더티 타일 델타 스트리머", () => {
  it("뷰포트 밖 타일을 제외하고 펜 커서에 가장 가까운 타일부터 우선 전송한다", () => {
    const tileSize = 64;
    const base = createSolidTile(tileSize, 245, 242, 234, 255);
    const dab = paintBrushDab(base, tileSize, 32, 32, 8, [31, 68, 53, 255]);
    const dirtyTiles: HostDirtyTileInput[] = [
      { tileX: 0, tileY: 0, revision: 2, baseRevision: 1, currentRgba: dab, previousRgba: base },
      { tileX: 3, tileY: 2, revision: 2, baseRevision: 1, currentRgba: dab, previousRgba: base },
      { tileX: 1, tileY: 1, revision: 2, baseRevision: 1, currentRgba: dab, previousRgba: base },
      { tileX: 80, tileY: 80, revision: 2, baseRevision: 1, currentRgba: dab, previousRgba: base },
    ];
    const frame = planCompanionTileDeltaFrame({
      frameId: 101, canvasWidth: 8192, canvasHeight: 8192, tileSize,
      viewport: { viewportX: 0, viewportY: 0, viewportWidth: 512, viewportHeight: 512, zoom: 1, cursorCanvasX: 224, cursorCanvasY: 160 },
      dirtyTiles, maxBytesPerFrame: 120_000,
    });
    expect(frame.culledOutsideFrustumCount).toBe(1);
    expect(frame.streamedTiles.map((t) => t.tileKey)).toEqual(["3:2", "1:1", "0:0"]);
    expect(frame.withinSub8msBudget).toBe(true);
    expect(frame.compressionRatio).toBeGreaterThan(10);
  });

  it("2배 확대 뷰포트 절두체 컬링과 기본 256×256 타일 무손실 복원을 정확히 수행한다", () => {
    const bg = createSolidTile(DEFAULT_TILE_SIZE_PX, 250, 248, 243, 255);
    const painted = paintBrushDab(bg, DEFAULT_TILE_SIZE_PX, 128, 128, 14, [31, 68, 53, 255]);
    const frame = planCompanionTileDeltaFrame({
      frameId: 7, canvasWidth: 8192, canvasHeight: 8192,
      viewport: { viewportX: 0, viewportY: 0, viewportWidth: 512, viewportHeight: 512, zoom: 2, cursorCanvasX: 128, cursorCanvasY: 128 },
      dirtyTiles: [
        { tileX: 0, tileY: 0, revision: 1, baseRevision: null, currentRgba: painted },
        // zoom=2 이므로 가시 범위는 0..256이며 tileX=1(256..512)은 절두체 밖이다.
        { tileX: 1, tileY: 0, revision: 1, baseRevision: null, currentRgba: painted },
      ],
      maxBytesPerFrame: 300_000,
    });
    expect(frame.culledOutsideFrustumCount).toBe(1);
    expect(frame.streamedTiles.map((t) => t.tileKey)).toEqual(["0:0"]);
    const store = new Map<string, TabletTileBufferEntry>();
    expect(applyCompanionTileDeltaFrame(store, frame).ok).toBe(true);
    const restored = store.get("0:0")?.rgba;
    expect(restored?.byteLength).toBe(painted.byteLength);
    let diffBytes = 0;
    for (let i = 0; i < painted.length; i += 1) {
      if ((restored?.[i] ?? -1) !== painted[i]) diffBytes += 1;
    }
    expect(diffBytes).toBe(0);
  });

  it("프레임 바이트 예산을 엄격히 준수하고 초과 타일은 deferredTileKeys로 이월한다", () => {
    const tileSize = 64;
    const tiles: HostDirtyTileInput[] = Array.from({ length: 4 }, (_v, tx) => {
      const noisy = new Uint8Array(tileSize * tileSize * 4);
      for (let i = 0; i < noisy.length; i += 1) noisy[i] = (i * 37 + tx * 53) & 0xff;
      return { tileX: tx, tileY: 0, revision: 1, baseRevision: null, currentRgba: noisy };
    });
    const frame = planCompanionTileDeltaFrame({
      frameId: 102, canvasWidth: 4096, canvasHeight: 4096, tileSize,
      viewport: { viewportX: 0, viewportY: 0, viewportWidth: 512, viewportHeight: 512, zoom: 1, cursorCanvasX: 32, cursorCanvasY: 32 },
      dirtyTiles: tiles, maxBytesPerFrame: 20_000,
    });
    expect(frame.totalEncodedBytes).toBeLessThanOrEqual(20_000);
    expect(frame.streamedTiles.length).toBeGreaterThan(0);
    expect(frame.deferredTileKeys.length).toBeGreaterThan(0);
    expect(frame.streamedTiles[0]?.tileKey).toBe("0:0");
  });

  it("태블릿 측에서 초기 타일과 XOR 델타 타일을 픽셀 오차 0으로 정확히 재구성한다", () => {
    const tileSize = 64;
    const bg = createSolidTile(tileSize, 250, 248, 243, 255);
    const stroke1 = paintBrushDab(bg, tileSize, 20, 24, 10, [31, 68, 53, 255]);
    const stroke2 = paintBrushDab(stroke1, tileSize, 42, 36, 9, [196, 82, 54, 255]);
    const store = new Map<string, TabletTileBufferEntry>();
    const viewport = { viewportX: 0, viewportY: 0, viewportWidth: 512, viewportHeight: 512, zoom: 1, cursorCanvasX: 20, cursorCanvasY: 24 };

    const f1 = planCompanionTileDeltaFrame({
      frameId: 1, canvasWidth: 8192, canvasHeight: 8192, tileSize, viewport,
      dirtyTiles: [{ tileX: 0, tileY: 0, revision: 1, baseRevision: null, currentRgba: stroke1 }], maxBytesPerFrame: 200_000,
    });
    expect(applyCompanionTileDeltaFrame(store, f1).ok).toBe(true);

    const f2 = planCompanionTileDeltaFrame({
      frameId: 2, canvasWidth: 8192, canvasHeight: 8192, tileSize, viewport,
      dirtyTiles: [{ tileX: 0, tileY: 0, revision: 2, baseRevision: 1, currentRgba: stroke2, previousRgba: stroke1 }], maxBytesPerFrame: 200_000,
    });
    expect(f2.streamedTiles[0]?.encodingMode).toBe("rle-xor-delta");
    expect(applyCompanionTileDeltaFrame(store, f2).ok).toBe(true);

    const reconstructed = store.get(formatTileKey(0, 0));
    expect(reconstructed?.revision).toBe(2);
    let diffBytes = 0;
    for (let i = 0; i < stroke2.length; i += 1) {
      if ((reconstructed?.rgba[i] ?? -1) !== stroke2[i]) diffBytes += 1;
    }
    expect(diffBytes).toBe(0);
  });

  it("손상된 타일 CRC-32나 기준 리비전 불일치 델타는 fail-closed로 거부한다", () => {
    const tileSize = 32;
    const base = createSolidTile(tileSize, 240, 240, 240, 255);
    const next = paintBrushDab(base, tileSize, 16, 16, 4, [20, 20, 20, 255]);
    const frame = planCompanionTileDeltaFrame({
      frameId: 9, canvasWidth: 1024, canvasHeight: 1024, tileSize,
      viewport: { viewportX: 0, viewportY: 0, viewportWidth: 256, viewportHeight: 256, zoom: 1, cursorCanvasX: 16, cursorCanvasY: 16 },
      dirtyTiles: [{ tileX: 0, tileY: 0, revision: 2, baseRevision: 1, currentRgba: next, previousRgba: base }], maxBytesPerFrame: 100_000,
    });
    const missingBase = applyCompanionTileDeltaFrame(new Map<string, TabletTileBufferEntry>(), frame);
    expect(missingBase.ok).toBe(false);
    expect(missingBase.rejectedTileKeys).toEqual(["0:0"]);

    const tile0 = frame.streamedTiles[0];
    if (!tile0) return;
    const badPayload = tile0.encodedPayload.slice();
    badPayload[0] = (badPayload[0] ?? 0) ^ 0x01;
    const crcFail = applyCompanionTileDeltaFrame(
      new Map<string, TabletTileBufferEntry>([["0:0", { revision: 1, rgba: base }]]),
      { ...frame, streamedTiles: [{ ...tile0, encodedPayload: badPayload }] },
    );
    expect(crcFail.ok).toBe(false);
    expect(crcFail.rejectedTileKeys).toEqual(["0:0"]);
  });
});

describe("Wave 78 — 동반 아틀리에 세션 컨트롤러(인체공학·손바닥 차단·단절 복구)", () => {
  it("5~9개 컨트롤 예산과 44px 최소 터치 타깃을 초과·부족 양쪽 모두 자동 보정한다", () => {
    const session = createCompanionAtelierSession({ sessionId: "s-1", hostDeviceId: "mac", tabletDeviceId: "ipad", initialConnected: true });
    const init = session.getUiAudit();
    expect(init.visiblePrimaryCount).toBeGreaterThanOrEqual(MIN_COMPANION_VISIBLE_CONTROLS);
    expect(init.visiblePrimaryCount).toBeLessThanOrEqual(MAX_COMPANION_VISIBLE_CONTROLS);
    expect(init.minHitTargetPx).toBeGreaterThanOrEqual(MIN_TABLET_HIT_TARGET_PX);

    const overcrowded: CompanionControlSpec[] = Array.from({ length: 11 }, (_v, idx) => ({
      id: `ctrl-${idx + 1}`, labelKo: `도구 ${idx + 1}`, hitWidthPx: 32, hitHeightPx: 36, placement: "primary", active: idx >= 9,
    }));
    const overAudit = session.configureControls(overcrowded);
    expect(overAudit.visiblePrimaryCount).toBe(MAX_COMPANION_VISIBLE_CONTROLS);
    expect(overAudit.demotedControlIds).toEqual(["ctrl-10", "ctrl-11"]);
    expect(overAudit.disclosureActiveCount).toBe(2);
    expect(overAudit.minHitTargetPx).toBe(MIN_TABLET_HIT_TARGET_PX);

    const sparseAudit = session.configureControls([
      { id: "only-one", labelKo: "단일 도구", hitWidthPx: 48, hitHeightPx: 48, placement: "primary" },
    ]);
    expect(sparseAudit.visiblePrimaryCount).toBe(MIN_COMPANION_VISIBLE_CONTROLS);
    expect(sparseAudit.compliesWithCalmBudget).toBe(true);
  });

  it("데스크톱·태블릿 간 도구 상태와 모든 촉각 다이얼 이벤트를 리비전 기반으로 동기화한다", () => {
    const session = createCompanionAtelierSession({ sessionId: "s-2", hostDeviceId: "mac", tabletDeviceId: "ipad", initialConnected: true, nowMs: 1000 });
    session.applyLocalToolUpdate({ activeTool: "watercolor", symmetryMode: "vertical", canvasFlipX: true }, 1100);
    session.applyTactileDialEvent({ sequence: 1, timestampUs: 100, kind: "brush-size", stepDelta: 2, normalizedValue: 36, isCommit: true, hapticDetent: true, finePrecision: false }, 1150);
    session.applyTactileDialEvent({ sequence: 2, timestampUs: 200, kind: "opacity", stepDelta: -1, normalizedValue: 0.65, isCommit: true, hapticDetent: true, finePrecision: true }, 1200);
    session.applyTactileDialEvent({ sequence: 3, timestampUs: 300, kind: "canvas-rotation", stepDelta: 15, normalizedValue: 30, isCommit: true, hapticDetent: false, finePrecision: false }, 1250);
    session.applyTactileDialEvent({ sequence: 4, timestampUs: 400, kind: "undo-scrub", stepDelta: -3, normalizedValue: 3, isCommit: true, hapticDetent: true, finePrecision: false }, 1300);
    const synced = session.applyTactileDialEvent({
      sequence: 5, timestampUs: 500, kind: "wet-paint-mixer-swatch", stepDelta: 0, normalizedValue: 0.5, isCommit: true,
      hapticDetent: false, finePrecision: true, swatchRgba: { r: 44, g: 98, b: 142, a: 255 }, wetness: 0.75, swatchSlotIndex: 2,
    }, 1350);

    expect(synced.brushSizePx).toBe(36);
    expect(synced.opacity).toBe(0.65);
    expect(synced.canvasRotationDeg).toBe(30);
    expect(synced.undoStepOffset).toBe(-3);
    expect(synced.color).toEqual({ r: 44, g: 98, b: 142, a: 255 });
    expect(session.syncStateFromHost({ ...synced, stateRevision: 1, opacity: 0.1 }, 1400).applied).toBe(false);
    expect(session.syncStateFromHost({ ...synced, stateRevision: synced.stateRevision + 2, opacity: 0.9 }, 1450).state.opacity).toBe(0.9);
  });

  it("손바닥 차단 잠금 시 캔버스 터치와 광역 접촉을 막고 스타일러스와 컨트롤 레일을 허용한다", () => {
    const session = createCompanionAtelierSession({ sessionId: "s-3", hostDeviceId: "mac", tabletDeviceId: "ipad", initialConnected: true, palmRejectionLocked: true });
    expect(session.evaluateTouchInput({ pointerType: "touch", surfaceRegion: "canvas", contactAreaMm2: 180, isStylusHoveringOrDown: true }).accepted).toBe(false);
    expect(session.evaluateTouchInput({ pointerType: "touch", surfaceRegion: "control-rail", contactAreaMm2: 600, isStylusHoveringOrDown: false }).accepted).toBe(false);
    expect(session.evaluateTouchInput({ pointerType: "pen", surfaceRegion: "canvas", contactAreaMm2: 4, isStylusHoveringOrDown: true }).accepted).toBe(true);
    expect(session.evaluateTouchInput({ pointerType: "touch", surfaceRegion: "control-rail", contactAreaMm2: 95, isStylusHoveringOrDown: false }).accepted).toBe(true);
  });

  it("일시적 Wi-Fi 단절 동안 로컬 스트로크를 안전하게 버퍼링하고 재연결 시 손실 없이 순서대로 복구한다", () => {
    const session = createCompanionAtelierSession({ sessionId: "s-4", hostDeviceId: "mac", tabletDeviceId: "ipad", initialConnected: true, nowMs: 5000 });
    expect(session.queueStrokeSample(makePenSample(1)).disposition).toBe("sent-live");
    const dropped = session.handleDisconnect("wifi-roaming-handoff", 5200);
    expect(dropped.connectionStatus).toBe("reconnecting");
    expect(dropped.disconnectCount).toBe(1);

    expect(session.queueStrokeSample(makePenSample(4)).disposition).toBe("buffered-offline");
    expect(session.queueStrokeSample(makePenSample(2)).disposition).toBe("buffered-offline");
    expect(session.queueStrokeSample(makePenSample(3)).disposition).toBe("buffered-offline");
    expect(session.exportRecoverySnapshot(5400).pendingStrokes).toHaveLength(3);

    const recovered = session.handleReconnect(5600);
    expect(recovered.restoredFromStatus).toBe("reconnecting");
    expect(recovered.flushedSamples.map((s) => s.sequence)).toEqual([2, 3, 4]);
    expect(recovered.remainingQueueLength).toBe(0);
    expect(session.getState().connectionStatus).toBe("connected");
    expect(session.queueStrokeSample(makePenSample(5)).disposition).toBe("sent-live");
  });
});
