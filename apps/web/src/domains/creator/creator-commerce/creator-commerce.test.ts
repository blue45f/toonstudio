import { describe, expect, it } from "vitest";

import {
  CompanionHostBridgeController,
  FOUR_MAJOR_PLATFORM_SPECS,
  acceptCompanionPairing,
  advanceBridgeReconnect,
  allocateIntegerPool,
  calculateRoyaltySettlement,
  computeHexDeltaE,
  convertCurrencyMinor,
  createCompanionBridgeSession,
  createCreatorCommerceDeliverySnapshot,
  createLocalLoopbackTransportPair,
  createWebRtcDataChannelTransport,
  dispatchCompanionCommand,
  encodeCompanionPairingUri,
  evaluateBridgeLiveness,
  exportSettlementStatementCsv,
  exportSettlementStatementJson,
  formatCurrencyMinor,
  fromMinorUnits,
  parseCompanionPairingUri,
  recordBridgeHeartbeat,
  refreshBridgeQrPairing,
  runEpisodePreflightGate,
  toMinorUnits,
  type CompanionWireFrame,
  type EpisodePreflightGateInput,
  type RtcDataChannelLike,
  type SettlementCurrency,
} from "./index";

function createCleanPreflightInput(
  overrides?: Partial<EpisodePreflightGateInput>,
): EpisodePreflightGateInput {
  return {
    episodeId: "ep-042",
    seriesTitle: "밤의 우편국",
    episodeNumber: 42,
    platformId: "naver",
    cuts: [
      {
        cutId: "cut-001",
        order: 1,
        widthPx: 800,
        heightPx: 1400,
        fileBytes: 420_000,
        format: "jpg",
        colorProfile: "sRGB",
        balloons: [
          {
            balloonId: "b-1",
            text: "자정이 지나면 편지가 열립니다.",
            x: 80,
            y: 120,
            width: 340,
            height: 150,
            fontSizePx: 28,
          },
        ],
      },
      {
        cutId: "cut-002",
        order: 2,
        widthPx: 800,
        heightPx: 1600,
        fileBytes: 510_000,
        format: "png",
        colorProfile: "sRGB",
        balloons: [
          {
            balloonId: "b-2",
            text: "기억의 봉인을 확인해 주세요.",
            x: 320,
            y: 260,
            width: 360,
            height: 160,
            fontSizePx: 26,
          },
        ],
      },
    ],
    characterSheets: [
      {
        characterId: "char-hana",
        characterName: "하나",
        swatches: [
          { slot: "hair", labelKo: "머리색", hex: "#2A3B6E" },
          { slot: "skin", labelKo: "피부톤", hex: "#F5D7C4" },
        ],
      },
    ],
    colorSamples: [
      { cutId: "cut-001", characterId: "char-hana", slot: "hair", sampledHex: "#2C3D70" },
      { cutId: "cut-002", characterId: "char-hana", slot: "skin", sampledHex: "#F4D6C3" },
    ],
    rightsBomItems: [
      {
        assetId: "asset-3d-postoffice",
        assetName: "야간 우체국 3D 배경",
        assetKind: "3d-scene",
        commercialLicenseStatus: "verified",
        attributionRequired: true,
        attributionIncluded: true,
        licenseRef: "LIC-2026-0091",
      },
    ],
    aiShield: {
      enabled: true,
      watermarkAppliedCutIds: ["cut-001", "cut-002"],
      manifestHash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      strengthPreset: "balanced",
      policyMode: "required",
    },
    generatedAtIso: "2026-11-22T09:00:00.000Z",
    ...overrides,
  };
}

describe("royalty-settlement-calculator", () => {
  it("keeps 0 rounding error across prime pools and arbitrary weights via Hamilton allocation", () => {
    const pools = [0, 1, 7, 13, 100_003, 999_997, 3_333_331];
    const weightSets = [
      [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
        { id: "c", weight: 1 },
      ],
      [
        { id: "story", weight: 3333 },
        { id: "lineart", weight: 3333 },
        { id: "coloring", weight: 3334 },
      ],
      [
        { id: "m1", weight: 17 },
        { id: "m2", weight: 29 },
        { id: "m3", weight: 41 },
        { id: "m4", weight: 53 },
        { id: "m5", weight: 67 },
      ],
    ];

    for (const total of pools) {
      for (const weights of weightSets) {
        const result = allocateIntegerPool(total, weights);
        const sum = [...result.amounts.values()].reduce((acc, value) => acc + value, 0);
        expect(sum).toBe(total);
        for (const amount of result.amounts.values()) {
          expect(Number.isSafeInteger(amount)).toBe(true);
          expect(amount).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("settles multi-currency serial, subscription, Rights BOM, and direct marketplace streams with 0 KRW drift", () => {
    const ledger = calculateRoyaltySettlement({
      settlementId: "STL-2026-11-EP42", seriesId: "series-postoffice", episodeId: "ep-042",
      periodLabel: "2026-11", settlementCurrency: "KRW", totalEpisodeCuts: 60, allocationMode: "hybrid",
      streams: [
        { streamId: "kr-naver", kind: "serial-episode", label: "네이버 국내 연재 수익", currency: "KRW", grossAmountMinor: 1_250_003, platformFeeRateBps: 1500 },
        { streamId: "us-global", kind: "serial-episode", label: "글로벌 웹툰 패스트패스", currency: "USD", grossAmountMinor: toMinorUnits(412.75, "USD"), platformFeeRateBps: 2000 },
        { streamId: "jp-sub", kind: "subscription-pool", label: "일본 구독 수익 배분", currency: "JPY", grossAmountMinor: 48_500, platformFeeRateBps: 1200 },
        { streamId: "eu-brush-sale", kind: "marketplace-sales", label: "유럽 브러시 팩 판매", currency: "EUR", grossAmountMinor: toMinorUnits(89.5, "EUR"), platformFeeRateBps: 1000, directRecipientId: "seller-brush-kim", directRecipientName: "김브러시", directRecipientTaxProfile: "kr-freelancer-3.3" },
      ],
      rightsBomRoyalties: [
        { assetId: "asset-bg-station", assetName: "경성역 3D 배경", assetKind: "3d-scene", sellerId: "seller-3d-park", sellerName: "박배경", royaltyModel: "cut-proportional", royaltyRateBps: 500, usedCutCount: 24, taxProfile: "kr-corporate-0" },
        { assetId: "asset-font-serif", assetName: "손글씨 폰트 라이선스", assetKind: "font", sellerId: "seller-font-lee", sellerName: "이폰트", royaltyModel: "flat-minor", flatAmountMinor: toMinorUnits(25, "USD"), flatCurrency: "USD", taxProfile: "kr-freelancer-3.3" },
      ],
      teamContributors: [
        { memberId: "team-story", memberName: "최스토리", role: "story", shareBps: 3000, completedCuts: 60, taxProfile: "kr-freelancer-3.3" },
        { memberId: "team-line", memberName: "정선화", role: "lineart", shareBps: 4000, completedCuts: 60, taxProfile: "kr-freelancer-3.3" },
        { memberId: "team-color", memberName: "윤채색", role: "coloring", shareBps: 3000, completedCuts: 45, taxProfile: "kr-freelancer-3.3" },
      ],
    });

    const proof = ledger.reconciliation;
    expect(proof.balanced).toBe(true);
    expect(proof.roundingErrorMinor).toBe(0);
    expect(proof.platformFeeBalanceErrorMinor).toBe(0);
    expect(proof.taxPayoutBalanceErrorMinor).toBe(0);
    expect(proof.totalGrossMinor).toBe(proof.totalPlatformFeeMinor + proof.totalDistributableMinor);
    expect(proof.totalAllocatedGrossMinor).toBe(proof.totalDistributableMinor);
    expect(proof.totalWithholdingTaxMinor + proof.totalNetPayoutMinor).toBe(proof.totalDistributableMinor);

    const lineArtist = ledger.recipients.find((r) => r.recipientId === "team-line");
    const corpSeller = ledger.recipients.find((r) => r.recipientId === "seller-3d-park");
    expect(lineArtist?.withholdingRateBps).toBe(330);
    expect((lineArtist?.incomeTaxMinor ?? 0) + (lineArtist?.localIncomeTaxMinor ?? 0)).toBe(lineArtist?.withholdingTaxMinor);
    expect(corpSeller?.withholdingTaxMinor).toBe(0);
    expect(corpSeller?.netPayoutMinor).toBe(corpSeller?.grossAllocationMinor);

    const jsonText = exportSettlementStatementJson(ledger);
    const csvText = exportSettlementStatementCsv(ledger);
    expect(JSON.parse(jsonText).ledgerFingerprint).toBe(ledger.ledgerFingerprint);
    expect(csvText.split("\n").length).toBe(ledger.recipients.length + 2);
    expect(csvText).toContain("TOTAL,합계 검증 행");
  });

  it("supports USD/JPY/EUR target currencies, Rights BOM cap scaling, and CSV formula neutralization", () => {
    const currencies: readonly SettlementCurrency[] = ["KRW", "USD", "JPY", "EUR"];
    for (const targetCurrency of currencies) {
      const ledger = calculateRoyaltySettlement({
        settlementId: `STL-${targetCurrency}`, seriesId: "s-global", episodeId: "ep-10",
        periodLabel: "2026-11", settlementCurrency: targetCurrency, totalEpisodeCuts: 40, maxRightsBomCapBps: 2500,
        streams: [{ streamId: "st-1", kind: "serial-episode", label: "글로벌 회차", currency: "USD", grossAmountMinor: 100_007, platformFeeRateBps: 1500 }],
        rightsBomRoyalties: [
          { assetId: "a1", assetName: "에셋 A", assetKind: "3d-scene", sellerId: "sel-a", sellerName: "=SUM(A1:A2)", royaltyModel: "rate-bps", royaltyRateBps: 2000 },
          { assetId: "a2", assetName: "에셋 B", assetKind: "brush-preset", sellerId: "sel-b", sellerName: "정상 판매자", royaltyModel: "rate-bps", royaltyRateBps: 2000 },
        ],
        teamContributors: [
          { memberId: "u1", memberName: "작가 1", role: "story", completedCuts: 20 },
          { memberId: "u2", memberName: "작가 2", role: "lineart", completedCuts: 20 },
        ],
        allocationMode: "cut-weighted",
      });
      expect(ledger.reconciliation.balanced).toBe(true);
      expect(ledger.reconciliation.roundingErrorMinor).toBe(0);
      expect(ledger.reconciliation.totalRightsBomMinor).toBeLessThanOrEqual(
        Math.round((ledger.reconciliation.totalDistributableMinor * 2500) / 10_000) + 1,
      );
      expect(exportSettlementStatementCsv(ledger)).toContain("'=SUM(A1:A2)");
    }
    expect(fromMinorUnits(toMinorUnits(12.34, "USD"), "USD")).toBe(12.34);
    expect(formatCurrencyMinor(12345, "USD")).toBe("$123.45");
    expect(formatCurrencyMinor(12345, "KRW")).toBe("₩12,345");
    expect(convertCurrencyMinor(100, "USD", "KRW").convertedMinor).toBe(1380);
  });
});

describe("companion-device-bridge", () => {
  it("encodes and parses QR pairing URI cleanly and rejects tampered URIs", () => {
    const session = createCompanionBridgeSession({
      hostDeviceId: "mac-studio-01",
      hostLabel: "메인 작업실 Mac",
      nowMs: 1_700_000_000_000,
      allowedCapabilities: ["shortcuts", "palette", "camera-3d"],
      deterministicNonce: "n-1",
    });

    const uri = encodeCompanionPairingUri(session.pairing);
    const parsed = parseCompanionPairingUri(uri);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.payload).toEqual(session.pairing);
    }

    expect(parseCompanionPairingUri("https://example.com/pair")).toEqual({
      ok: false,
      reasonCode: "INVALID_URI",
    });
    expect(parseCompanionPairingUri("toonstudio://pair?v=9&sid=x")).toEqual({
      ok: false,
      reasonCode: "UNSUPPORTED_VERSION",
    });
    expect(
      parseCompanionPairingUri(
        `${uri.replace("shortcuts", "root-admin")}`,
      ),
    ).toEqual({
      ok: false,
      reasonCode: "INVALID_CAPABILITY",
    });
  });

  it("enforces QR expiry, reconnection backoff exhaustion, and pairing refresh", () => {
    const t0 = 1_700_000_000_000;
    const initial = createCompanionBridgeSession({
      hostDeviceId: "host-1",
      hostLabel: "데스크톱",
      nowMs: t0,
      policy: {
        qrTtlMs: 30_000,
        heartbeatTimeoutMs: 5_000,
        maxReconnectAttempts: 2,
        baseReconnectBackoffMs: 1_000,
      },
      deterministicNonce: "exp-test",
    });

    // 만료 이후 페어링 거부
    const expiredAttempt = acceptCompanionPairing(
      initial,
      {
        sessionId: initial.pairing.sessionId,
        peerDeviceId: "ipad-pro",
        peerLabel: "iPad Pro",
        formFactor: "tablet",
        sessionToken: initial.pairing.sessionToken,
        requestedCapabilities: ["shortcuts"],
      },
      t0 + 35_000,
    );
    expect(expiredAttempt.ok).toBe(false);
    expect(expiredAttempt.state.status).toBe("expired");
    if (!expiredAttempt.ok) expect(expiredAttempt.reasonCode).toBe("PAIRING_EXPIRED");

    // QR 재발급 후 정상 페어링 → 하트비트 타임아웃 → 재연결 → 복구 & 소진 검증
    const refreshed = refreshBridgeQrPairing(expiredAttempt.state, t0 + 40_000, "r-2");
    expect(refreshed.status).toBe("awaiting-scan");
    expect(refreshed.pairing.sessionId).not.toBe(initial.pairing.sessionId);

    const paired = acceptCompanionPairing(
      refreshed,
      {
        sessionId: refreshed.pairing.sessionId,
        peerDeviceId: "phone-1",
        peerLabel: "Galaxy Tab",
        formFactor: "tablet",
        pairingCode: refreshed.pairing.pairingCode,
        requestedCapabilities: ["shortcuts", "camera-3d"],
      },
      t0 + 42_000,
    );
    expect(paired.ok).toBe(true);
    expect(paired.state.status).toBe("connected");

    const reconnecting = evaluateBridgeLiveness(paired.state, t0 + 50_000);
    expect(reconnecting.status).toBe("reconnecting");
    expect(reconnecting.reconnectAttempts).toBe(1);
    expect(reconnecting.nextReconnectAtMs).toBe(t0 + 51_000);

    const hbRecovered = recordBridgeHeartbeat(reconnecting, "phone-1", t0 + 51_000);
    expect(hbRecovered.ok).toBe(true);
    expect(hbRecovered.state.status).toBe("connected");

    const droppedAgain = evaluateBridgeLiveness(hbRecovered.state, t0 + 60_000);
    const retry2 = advanceBridgeReconnect(droppedAgain, false, t0 + 61_000);
    expect(retry2.ok).toBe(true);
    expect(retry2.state.reconnectAttempts).toBe(2);

    const exhausted = advanceBridgeReconnect(retry2.state, false, t0 + 63_000);
    expect(exhausted.ok).toBe(false);
    expect(exhausted.state.status).toBe("expired");
    if (!exhausted.ok) expect(exhausted.reasonCode).toBe("RECONNECT_EXHAUSTED");
  });

  it("authorizes commands strictly by peer, token, capability, monotonic sequence, freshness, and payload", () => {
    const t0 = 1_700_000_000_000;
    const base = createCompanionBridgeSession({
      hostDeviceId: "host-a",
      hostLabel: "작업실 PC",
      nowMs: t0,
      allowedCapabilities: ["shortcuts", "palette", "camera-3d"],
    });
    const paired = acceptCompanionPairing(
      base,
      {
        sessionId: base.pairing.sessionId,
        peerDeviceId: "phone-a",
        peerLabel: "iPhone",
        formFactor: "phone",
        sessionToken: base.pairing.sessionToken,
        requestedCapabilities: ["shortcuts", "palette"],
      },
      t0 + 1_000,
    );
    expect(paired.ok).toBe(true);

    // 1) 정상 명령 허용
    const ok1 = dispatchCompanionCommand(
      paired.state,
      {
        sessionId: base.pairing.sessionId,
        sessionToken: base.pairing.sessionToken,
        senderDeviceId: "phone-a",
        sequence: 1,
        sentAtMs: t0 + 1_500,
        command: { kind: "palette.select-color", hex: "#2A3B6E", slot: "primary" },
      },
      t0 + 1_600,
    );
    expect(ok1.ok).toBe(true);
    expect(ok1.state.acceptedCommandCount).toBe(1);

    // 2) 시퀀스 재전송 차단
    const replay = dispatchCompanionCommand(
      ok1.state,
      {
        sessionId: base.pairing.sessionId,
        sessionToken: base.pairing.sessionToken,
        senderDeviceId: "phone-a",
        sequence: 1,
        sentAtMs: t0 + 1_700,
        command: { kind: "shortcut.trigger", action: "undo" },
      },
      t0 + 1_750,
    );
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.reasonCode).toBe("REPLAY_SEQUENCE");

    // 3) 미인가 capability(camera-3d) 차단
    const capDenied = dispatchCompanionCommand(
      ok1.state,
      {
        sessionId: base.pairing.sessionId,
        sessionToken: base.pairing.sessionToken,
        senderDeviceId: "phone-a",
        sequence: 2,
        sentAtMs: t0 + 1_800,
        command: { kind: "camera3d.orbit", deltaYawDeg: 15, deltaPitchDeg: -5, deltaZoom: 0 },
      },
      t0 + 1_850,
    );
    expect(capDenied.ok).toBe(false);
    if (!capDenied.ok) expect(capDenied.reasonCode).toBe("CAPABILITY_DENIED");

    // 4) 잘못된 기기 / 만료 타임스탬프 / 잘못된 hex 차단
    const wrongPeer = dispatchCompanionCommand(
      ok1.state,
      {
        sessionId: base.pairing.sessionId,
        sessionToken: base.pairing.sessionToken,
        senderDeviceId: "intruder-phone",
        sequence: 2,
        sentAtMs: t0 + 1_800,
        command: { kind: "shortcut.trigger", action: "undo" },
      },
      t0 + 1_850,
    );
    expect(wrongPeer.ok).toBe(false);
    if (!wrongPeer.ok) expect(wrongPeer.reasonCode).toBe("UNAUTHORIZED_PEER");

    const badHex = dispatchCompanionCommand(
      ok1.state,
      {
        sessionId: base.pairing.sessionId,
        sessionToken: base.pairing.sessionToken,
        senderDeviceId: "phone-a",
        sequence: 2,
        sentAtMs: t0 + 1_800,
        command: { kind: "palette.select-color", hex: "not-a-hex" },
      },
      t0 + 1_850,
    );
    expect(badHex.ok).toBe(false);
    if (!badHex.ok) expect(badHex.reasonCode).toBe("INVALID_PAYLOAD");
  });

  it("bridges host and companion over zero-cost loopback and WebRTC data channel adapters", () => {
    let now = 1_700_000_000_000;
    const [hostTransport, peerTransport] = createLocalLoopbackTransportPair();
    expect(hostTransport.zeroCostLocalP2p).toBe(true);

    const receivedCommands: string[] = [];
    const peerAcks: CompanionWireFrame[] = [];
    peerTransport.subscribe((frame) => {
      peerAcks.push(frame);
    });

    const initial = createCompanionBridgeSession({
      hostDeviceId: "desk-1",
      hostLabel: "작업실",
      nowMs: now,
    });
    const host = new CompanionHostBridgeController({
      initialState: initial,
      transport: hostTransport,
      onCommand: (cmd) => {
        receivedCommands.push(cmd.kind);
      },
      nowProvider: () => now,
    });

    now += 500;
    peerTransport.send({
      type: "pair-request",
      sentAtMs: now,
      request: {
        sessionId: initial.pairing.sessionId,
        peerDeviceId: "tablet-1",
        peerLabel: "iPad",
        formFactor: "tablet",
        sessionToken: initial.pairing.sessionToken,
        requestedCapabilities: ["shortcuts", "camera-3d"],
      },
    });
    expect(host.getState().status).toBe("connected");

    now += 200;
    peerTransport.send({
      type: "command",
      envelope: {
        sessionId: initial.pairing.sessionId,
        sessionToken: initial.pairing.sessionToken,
        senderDeviceId: "tablet-1",
        sequence: 1,
        sentAtMs: now,
        command: { kind: "camera3d.preset", presetId: "low-angle" },
      },
    });
    expect(receivedCommands).toEqual(["camera3d.preset"]);
    expect(peerAcks.some((frame) => frame.type === "command-ack" && frame.ok)).toBe(true);
    host.dispose();

    // WebRTC DataChannel 래퍼 검증 (정상 프레임 전달 + 깨진 JSON 안전 무시)
    const handlers = new Set<(event: { readonly data: unknown }) => void>();
    const sentPayloads: string[] = [];
    const mockChannel: RtcDataChannelLike = {
      readyState: "open",
      send(data) {
        sentPayloads.push(data);
      },
      close() {},
      addEventListener(_type, listener) {
        handlers.add(listener);
      },
      removeEventListener(_type, listener) {
        handlers.delete(listener);
      },
    };
    const rtc = createWebRtcDataChannelTransport(mockChannel);
    const seen: CompanionWireFrame[] = [];
    rtc.subscribe((frame) => seen.push(frame));
    rtc.send({ type: "disconnect", sessionId: "s1", reason: "done", sentAtMs: now });
    expect(sentPayloads).toHaveLength(1);
    for (const h of handlers) {
      h({ data: "{corrupted-json" });
      h({ data: JSON.stringify({ type: "heartbeat", sessionId: "s1", senderDeviceId: "p1", sentAtMs: now }) });
    }
    expect(seen).toHaveLength(1);
    rtc.close();
  });
});

describe("episode-preflight-gate", () => {
  it("returns PASS for a compliant episode across all 5 flight-check gates", () => {
    expect(Object.keys(FOUR_MAJOR_PLATFORM_SPECS)).toEqual(["naver", "kakao", "lezhin", "global"]);
    const report = runEpisodePreflightGate(createCleanPreflightInput());

    expect(report.verdict).toBe("PASS");
    expect(report.canDeliver).toBe(true);
    expect(report.readinessScore).toBe(100);
    expect(report.blockCount).toBe(0);
    expect(report.warnCount).toBe(0);
    expect(report.categorySummaries.every((cat) => cat.verdict === "PASS")).toBe(true);
  });

  it("returns WARN (deliverable with guidance) for non-blocking warnings", () => {
    const clean = createCleanPreflightInput();
    const [firstCut, secondCut] = clean.cuts;
    if (!firstCut || !secondCut) throw new Error("test fixture requires 2 cuts");
    const report = runEpisodePreflightGate({
      ...clean,
      cuts: [
        {
          ...firstCut,
          heightPx: 2400, // Naver max slice 2000px 초과 -> WARN
          colorProfile: "Display-P3", // Naver에서는 WARN
          balloons: [
            {
              balloonId: "b-margin",
              text: "짧은 대사",
              x: 10, // 390px 축소 시 ~4.9px (< 12px) -> WARN
              y: 120,
              width: 300,
              height: 150,
              fontSizePx: 23, // 390px에서 11.2px (10.5~12) -> WARN
            },
          ],
        },
        secondCut,
      ],
      colorSamples: [
        // ΔE 약 11~15 수준 편차 -> WARN
        { cutId: "cut-001", characterId: "char-hana", slot: "hair", sampledHex: "#3F548F" },
      ],
      rightsBomItems: [
        {
          assetId: "asset-expiring",
          assetName: "임시 상업 폰트",
          assetKind: "font",
          commercialLicenseStatus: "expiring-soon",
          attributionRequired: true,
          attributionIncluded: false,
        },
      ],
      aiShield: {
        enabled: true,
        watermarkAppliedCutIds: ["cut-001", "cut-002"],
        manifestHash: "", // 해시 미첨부 -> WARN
        policyMode: "required",
      },
    });

    expect(report.verdict).toBe("WARN");
    expect(report.canDeliver).toBe(true);
    expect(report.blockCount).toBe(0);
    expect(report.warnCount).toBeGreaterThanOrEqual(5);
    expect(report.findings.every((f) => f.fixGuideKo.length > 0)).toBe(true);
  });

  it("returns BLOCK across all 5 gates: 4-platform spec, 390px balloon overflow, color drift, Rights BOM, AI shield", () => {
    // CIE76 ΔE sanity check
    expect(computeHexDeltaE("#2A3B6E", "#2A3B6E")).toBe(0);
    expect(computeHexDeltaE("#2A3B6E", "#D94336")).toBeGreaterThan(40);

    const clean = createCleanPreflightInput({ platformId: "lezhin" });
    const report = runEpisodePreflightGate({
      ...clean,
      cuts: [
        {
          cutId: "cut-001",
          order: 1,
          widthPx: 800, // 레진 허용 폭 720px 위반 -> BLOCK
          heightPx: 1400,
          fileBytes: 3_500_000, // 레진 3MB 초과 -> BLOCK
          format: "webp", // 미지원 형식 -> BLOCK
          colorProfile: "Display-P3", // 레진 sRGB 엄격 위반 -> BLOCK
          balloons: [
            {
              balloonId: "b-overflow",
              text: "아주 긴 대사가 좁고 낮은 말풍선 안에 가득 들어가서 390px 스마트폰 화면으로 줄였을 때 세로 높이를 완전히 초과하고 잘려 버리는 심각한 상황입니다.",
              x: 60,
              y: 100,
              width: 240,
              height: 90,
              fontSizePx: 20, // 390px에서 9.75px (< 10.5px) -> BLOCK + 텍스트 오버플로 BLOCK
            },
          ],
        },
      ],
      colorSamples: [
        // 파란 머리를 빨간색으로 칠한 심각 이탈 -> BLOCK
        { cutId: "cut-001", characterId: "char-hana", slot: "hair", sampledHex: "#D94336" },
      ],
      rightsBomItems: [
        {
          assetId: "asset-unverified",
          assetName: "미검증 3D 카페",
          assetKind: "3d-scene",
          commercialLicenseStatus: "unverified",
          attributionRequired: false,
          attributionIncluded: true,
        },
        {
          assetId: "asset-nc",
          assetName: "비상업 무료 폰트",
          assetKind: "font",
          commercialLicenseStatus: "non-commercial",
          attributionRequired: false,
          attributionIncluded: true,
        },
      ],
      aiShield: {
        enabled: true,
        watermarkAppliedCutIds: [], // 컷 누락 -> BLOCK
        policyMode: "required",
      },
    });

    expect(report.verdict).toBe("BLOCK");
    expect(report.canDeliver).toBe(false);
    expect(report.categorySummaries.every((cat) => cat.verdict === "BLOCK")).toBe(true);
    expect(report.findings.some((f) => f.code === "PLATFORM_WIDTH_MISMATCH")).toBe(true);
    expect(report.findings.some((f) => f.code === "MOBILE_390_BALLOON_TEXT_OVERFLOW")).toBe(true);
    expect(report.findings.some((f) => f.code === "CHARACTER_COLOR_DRIFT_BLOCK")).toBe(true);
    expect(report.findings.some((f) => f.code === "RIGHTS_BOM_LICENSE_UNVERIFIED")).toBe(true);
    expect(report.findings.some((f) => f.code === "AI_SHIELD_CUTS_MISSING")).toBe(true);

    const optOut = runEpisodePreflightGate(
      createCleanPreflightInput({
        aiShield: { enabled: false, watermarkAppliedCutIds: [], policyMode: "opt-out" },
      }),
    );
    expect(optOut.verdict).toBe("PASS");

    // 카카오(720px 고정) · 글로벌(800×1280 슬라이스) 규격 차이 검증
    const kakaoReport = runEpisodePreflightGate(createCleanPreflightInput({ platformId: "kakao" }));
    expect(kakaoReport.verdict).toBe("BLOCK");
    expect(kakaoReport.findings.some((f) => f.code === "PLATFORM_WIDTH_MISMATCH")).toBe(true);
    const globalReport = runEpisodePreflightGate(createCleanPreflightInput({ platformId: "global" }));
    expect(globalReport.verdict).toBe("WARN");
    expect(globalReport.findings.some((f) => f.code === "PLATFORM_SLICE_HEIGHT_WARN")).toBe(true);
  });

  it("produces an integrated creator-commerce delivery readiness snapshot", () => {
    const snapshot = createCreatorCommerceDeliverySnapshot({
      preflight: createCleanPreflightInput(),
      settlement: {
        settlementId: "STL-SNAP-1",
        seriesId: "s-1",
        episodeId: "ep-042",
        periodLabel: "2026-11",
        settlementCurrency: "KRW",
        totalEpisodeCuts: 2,
        streams: [
          {
            streamId: "st-1",
            kind: "serial-episode",
            label: "연재 정산",
            currency: "KRW",
            grossAmountMinor: 500_000,
          },
        ],
        teamContributors: [
          { memberId: "author-1", memberName: "대표 작가", role: "lineart", shareBps: 10_000, completedCuts: 2 },
        ],
      },
    });
    expect(snapshot.preflightReport.verdict).toBe("PASS");
    expect(snapshot.settlementLedger.reconciliation.balanced).toBe(true);
  });
});
