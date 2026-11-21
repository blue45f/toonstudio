import { describe, expect, it } from "vitest";

import {
  COMPANION_TAB_IDS,
  StudioCompanionPairingHost,
  createSignedCompanionEnvelope,
  parseCompanionPairingQrUri,
} from "./studio-remote-companion-pairing";

describe("studio-remote-companion-pairing", () => {
  it("QR 페어링 URI를 생성·파싱하고 1회용 페어링 수락과 TTL 만료를 정확히 처리한다", () => {
    expect(COMPANION_TAB_IDS).toHaveLength(8);
    const host = new StudioCompanionPairingHost({
      sessionId: "sess-alpha-01",
      secretSalt: "studio-salt-2026",
      hostDeviceName: "MacBook Pro 작업실",
      nowMs: 1_000_000,
      ttlMs: 60_000,
    });
    const ticket = host.getTicket();
    const parsed = parseCompanionPairingQrUri(ticket.qrUri);
    expect(parsed).not.toBeNull();
    expect(parsed?.sessionId).toBe("sess-alpha-01");
    expect(parsed?.pairingCode).toBe(ticket.pairingCode);

    // 잘못된 코드 거부
    const wrong = host.acceptPairing({
      sessionId: ticket.sessionId,
      pairingCode: "000000",
      peerId: "phone-1",
      deviceLabel: "iPhone 16",
      platform: "ios",
      nowMs: 1_005_000,
    });
    expect(wrong.ok).toBe(false);

    // 정상 수락 후 2번째 기기 차단
    const ok = host.acceptPairing({
      sessionId: ticket.sessionId,
      pairingCode: ticket.pairingCode,
      peerId: "phone-1",
      deviceLabel: "iPhone 16",
      platform: "ios",
      nowMs: 1_005_000,
    });
    expect(ok.ok).toBe(true);
    expect(host.getStatus()).toBe("paired");
    expect(
      host.acceptPairing({
        sessionId: ticket.sessionId,
        pairingCode: ticket.pairingCode,
        peerId: "phone-2",
        deviceLabel: "Galaxy",
        platform: "android",
        nowMs: 1_006_000,
      }).ok,
    ).toBe(false);

    // 만료 테스트
    const expiredHost = new StudioCompanionPairingHost({
      sessionId: "sess-expired-02",
      secretSalt: "salt",
      hostDeviceName: "Studio",
      nowMs: 1_000_000,
      ttlMs: 10_000,
    });
    expect(expiredHost.getStatus(1_020_000)).toBe("expired");
  });

  it("단축키·컬러휠·서브뷰·제스처·웹툰 미리보기 동기화와 재전송/변조 차단을 검증한다", () => {
    const host = new StudioCompanionPairingHost({
      sessionId: "sess-sync-99",
      secretSalt: "k99",
      hostDeviceName: "Desktop",
      nowMs: 10_000,
    });
    const { sessionId, pairingCode } = host.getTicket();
    host.acceptPairing({
      sessionId,
      pairingCode,
      peerId: "ipad-mini",
      deviceLabel: "iPad mini",
      platform: "tablet",
      nowMs: 11_000,
    });

    const colorMsg = createSignedCompanionEnvelope({
      sessionId,
      pairingCode,
      seq: 1,
      sentAtMs: 12_000,
      payload: {
        type: "color.select",
        color: { hex: "#7c5cfc", h: 252, s: 0.63, v: 0.99, target: "primary" },
      },
    });
    const res1 = host.receiveEnvelope(colorMsg, 12_010);
    expect(res1.accepted).toBe(true);
    expect(res1.state.primaryColorHex).toBe("#7c5cfc");

    // 동일 seq 재전송 차단
    expect(host.receiveEnvelope(colorMsg, 12_020).reason).toBe("replayed-seq");

    // 무결성 태그 변조 차단
    const tampered = { ...colorMsg, seq: 2, integrityTag: "deadbeef00000000" };
    expect(host.receiveEnvelope(tampered, 12_030).reason).toBe("invalid-integrity");

    // 제스처(2핑거 Undo + 모디파이어 + 핀치줌) & 하트비트 응답
    const gesture = createSignedCompanionEnvelope({
      sessionId,
      pairingCode,
      seq: 2,
      sentAtMs: 12_100,
      payload: { type: "gesture.pad", gesture: { kind: "pan-zoom-rotate", deltaX: 24, deltaY: -12, scaleFactor: 1.5, rotationDeltaDeg: 15 } },
    });
    const res2 = host.receiveEnvelope(gesture, 12_110);
    expect(res2.state.cumulativePanX).toBe(24);
    expect(res2.state.cumulativeZoom).toBeCloseTo(1.5, 4);
    expect(res2.state.cumulativeRotationDeg).toBe(15);

    const ping = createSignedCompanionEnvelope({
      sessionId,
      pairingCode,
      seq: 3,
      sentAtMs: 12_200,
      payload: { type: "heartbeat.ping", clientSentAtMs: 12_200 },
    });
    const res3 = host.receiveEnvelope(ping, 12_225);
    expect(res3.accepted).toBe(true);
    expect(res3.replyEnvelope?.payload.type).toBe("heartbeat.pong");
  });
});
