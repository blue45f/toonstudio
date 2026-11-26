import { describe, expect, it } from "vitest";
import {
  applyAdversarialProtectionShield,
  applyHomographyToPoint,
  buildTimelapseScheduleFromUndoLog,
  bytesToHex,
  decodeUndoXorRleDelta,
  encodeUndoXorRleDelta,
  EphemeralP2pRedlineReviewSession,
  generateWotsPlusKeyPair,
  GlobalSmartSymbolRegistry,
  HardwareCompanionAndColdBootSuite,
  HybridR2P2pAssetCacheRouter,
  parseZeroInstallReviewLink,
  predictDeadlineEtaFromHistory,
  sealHybridPostQuantumProvenance,
  sha256Bytes,
  sha256Hex,
  signWotsPlus,
  SubCanvasDelegationManager,
  verifyHybridPostQuantumProvenance,
  verifyWotsPlus,
  WOTS_PLUS_LEN,
  WOTS_PLUS_N,
  type BaseArtLayerSnapshot,
  type CutStageHistoryEntry,
  type MasterCanvasDocument,
  type P2pAssetPeerAdapter,
  type PerspectiveQuad2D,
  type UndoTimelapseEvent,
} from "./index";

const UTF8 = new TextEncoder();

function createSyntheticWebtoonRgba(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      let r = 228 + Math.round(10 * Math.sin((x / width) * Math.PI));
      let g = 220 + Math.round(8 * Math.cos((y / height) * Math.PI));
      let b = 212;
      const dist = Math.hypot(x - width * 0.55, y - height * 0.55);
      if (dist < width * 0.25) {
        r = 96;
        g = 128;
        b = 178;
      }
      if (Math.abs(dist - width * 0.25) < 1.5) {
        r = 28;
        g = 30;
        b = 36;
      }
      if (x >= 8 && x < 40 && y >= 8 && y < 28) {
        const isGlyph = x >= 12 && x <= 34 && (y === 14 || y === 20) && x % 3 !== 0;
        r = isGlyph ? 16 : 252;
        g = isGlyph ? 16 : 252;
        b = isGlyph ? 18 : 252;
      }
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 255;
    }
  }
  return rgba;
}

function makeMockPsdBytes(tag: string): Uint8Array {
  const body = UTF8.encode(tag);
  const out = new Uint8Array(16 + body.byteLength);
  out[0] = 0x38;
  out[1] = 0x42;
  out[2] = 0x50;
  out[3] = 0x53;
  out[5] = 1;
  out.set(body, 16);
  return out;
}

function makeMockGlbBytes(tag: string): Uint8Array {
  const body = UTF8.encode(tag);
  const out = new Uint8Array(12 + body.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, out.byteLength, true);
  out.set(body, 12);
  return out;
}

describe("Pillar D (#14~#17): 양자내성 서명 · 적대적 방어막 · 서브캔버스 위임 · R2+P2P 캐시", () => {
  it("#14 SHA-256 WOTS+(w=16, len=67) 서명/위변조 탐지 및 ECDSA P-256 하이브리드 봉인을 검증한다", async () => {
    const sample = UTF8.encode("toonstudio-ep01-cut04-master-raw");
    const subtleDigest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", sample));
    expect(bytesToHex(sha256Bytes(sample))).toBe(bytesToHex(subtleDigest));

    const wotsKp = generateWotsPlusKeyPair({
      secretSeed: new Uint8Array(32).fill(0x2a),
      publicSeed: new Uint8Array(32).fill(0x5c),
      otsAddress: 7,
    });
    expect(wotsKp.publicKey.len).toBe(WOTS_PLUS_LEN);
    expect(wotsKp.publicKey.w).toBe(16);

    const sig = signWotsPlus(sample, wotsKp);
    expect(sig.signatureByteLength).toBe(WOTS_PLUS_LEN * WOTS_PLUS_N);
    expect(wotsKp.privateKey.consumed).toBe(true);

    const ok = verifyWotsPlus(sample, sig, wotsKp.publicKey);
    expect(ok.valid).toBe(true);
    expect(ok.matchedChains).toBe(67);

    const tamperedMsg = new Uint8Array(sample);
    tamperedMsg[0] ^= 0x01;
    expect(verifyWotsPlus(tamperedMsg, sig, wotsKp.publicKey).valid).toBe(false);
    expect(() => signWotsPlus(sample, wotsKp)).toThrow(/재사용/);

    const seal = await sealHybridPostQuantumProvenance(sample, {
      workId: "work-starlight",
      episodeId: "ep-12",
      creatorId: "creator-minji",
      rightsStatement: "All rights reserved - ₩0 local provenance proof",
      sealedAtIso: "2026-11-26T10:30:00.000Z",
    });
    const verified = await verifyHybridPostQuantumProvenance(seal, sample);
    expect(verified.valid).toBe(true);
    expect(verified.contentDigestValid).toBe(true);
    expect(verified.classicalEcdsaValid).toBe(true);
    expect(verified.postQuantumWotsValid).toBe(true);

    const badContent = await verifyHybridPostQuantumProvenance(seal, tamperedMsg);
    expect(badContent.valid).toBe(false);
    expect(badContent.contentDigestValid).toBe(false);

    const badEcdsa = await verifyHybridPostQuantumProvenance(
      { ...seal, ecdsaSignatureBase64Url: `${seal.ecdsaSignatureBase64Url.slice(0, -2)}AA` },
      sample,
    );
    expect(badEcdsa.valid).toBe(false);
    expect(badEcdsa.classicalEcdsaValid).toBe(false);
    expect(badEcdsa.postQuantumWotsValid).toBe(true);

    const badWots = await verifyHybridPostQuantumProvenance(
      {
        ...seal,
        wotsSignature: {
          ...seal.wotsSignature,
          signatureBytesBase64Url: `${seal.wotsSignature.signatureBytesBase64Url.slice(0, -4)}AAAA`,
        },
      },
      sample,
    );
    expect(badWots.valid).toBe(false);
    expect(badWots.postQuantumWotsValid).toBe(false);
  });

  it("#15 선택적 고주파 적대적 방어막은 텍스트 변형 0 및 PSNR >= 40 dB를 유지하며 스펙트럼 교란 점수를 높인다", () => {
    const width = 96;
    const height = 96;
    const rgba = createSyntheticWebtoonRgba(width, height);
    const textRegions = [{ x: 8, y: 8, width: 32, height: 20 }];

    const result = applyAdversarialProtectionShield({
      rgba,
      width,
      height,
      protectedTextRegions: textRegions,
      options: { strength: 1.15, seed: 0x13572468, targetMinPsnrDb: 40 },
    });
    expect(result.metrics.psnrDb).toBeGreaterThanOrEqual(40);
    expect(result.metrics.protectedTextPixelDrift).toBe(0);
    expect(result.metrics.protectedTextPixelCount).toBe(640);
    expect(result.metrics.perturbedPixelCount).toBeGreaterThan(width * height * 0.7);
    expect(result.metrics.shieldedHighFreqEnergy).toBeGreaterThan(
      result.metrics.baselineHighFreqEnergy,
    );
    expect(result.metrics.spectralDisruptionScore).toBeGreaterThanOrEqual(45);

    const extreme = applyAdversarialProtectionShield({
      rgba,
      width,
      height,
      protectedTextRegions: textRegions,
      options: { strength: 2.0, maxChannelDelta: 6, targetMinPsnrDb: 40 },
    });
    expect(extreme.metrics.psnrDb).toBeGreaterThanOrEqual(40);
    expect(extreme.metrics.protectedTextPixelDrift).toBe(0);
  });

  it("#16 제로-트러스트 서브캔버스 위임은 미허용 컷/레이어 변조를 거부하고 정상 병합 시 정산 BOM을 계산한다", async () => {
    const masterDoc: MasterCanvasDocument = {
      workId: "work-blade",
      episodeId: "ep-07",
      cuts: [
        {
          cutId: "cut-01",
          layers: [
            { layerId: "l-lineart", name: "선화", role: "lineart", contentBytes: UTF8.encode("LINEART_V1") },
            { layerId: "l-flat", name: "밑색", role: "flatting", contentBytes: UTF8.encode("FLAT_EMPTY") },
            { layerId: "l-bg", name: "배경", role: "bg", contentBytes: UTF8.encode("BG_DRAFT") },
          ],
        },
        {
          cutId: "cut-secret-finale",
          layers: [
            { layerId: "l-plot", name: "스포일러 대사", role: "lettering", contentBytes: UTF8.encode("TOP_SECRET") },
          ],
        },
      ],
    };

    const manager = new SubCanvasDelegationManager();
    const now = 1_795_000_000_000;
    const issued = await manager.createDelegationPackage(masterDoc, {
      assistantId: "assist-jihoon",
      assistantDisplayName: "김지훈 어시스턴트",
      allowedCutIds: ["cut-01"],
      allowedLayerIdsByCut: { "cut-01": ["l-flat", "l-bg"] },
      readOnlyReferenceLayerIdsByCut: { "cut-01": ["l-lineart"] },
      expiresAtMs: now + 3_600_000,
      rates: { hourlyRateKrw: 24_000, perLayerBonusKrw: 5_000 },
      nowMs: now,
    });

    const workspace = await manager.openDelegationPackage(
      issued.encryptedPackage,
      issued.sessionKey32,
      now + 10_000,
    );
    expect(workspace.cuts.map((c) => c.cutId)).toEqual(["cut-01"]);
    expect(workspace.cuts[0].layers.find((l) => l.layerId === "l-lineart")?.access).toBe("readonly");

    const maliciousSub = await manager.createAssistantSubmission(
      issued.encryptedPackage,
      issued.sessionKey32,
      [
        {
          cutId: "cut-01",
          layerId: "l-lineart",
          stage: "lineart",
          updatedBytes: UTF8.encode("HACKED"),
          strokeCount: 12,
          activeMinutes: 5,
          startedAtIso: "2026-11-26T10:00:00.000Z",
          endedAtIso: "2026-11-26T10:05:00.000Z",
        },
        {
          cutId: "cut-secret-finale",
          layerId: "l-plot",
          stage: "lettering",
          updatedBytes: UTF8.encode("SPOILED"),
          strokeCount: 1,
          activeMinutes: 1,
          startedAtIso: "2026-11-26T10:05:00.000Z",
          endedAtIso: "2026-11-26T10:06:00.000Z",
        },
      ],
      now + 20_000,
    );
    const rejected = await manager.verifyAndMergeSubmission(
      masterDoc,
      issued.encryptedPackage.delegationId,
      maliciousSub,
      issued.sessionKey32,
      now + 30_000,
    );
    expect(rejected.merged).toBe(false);
    expect(rejected.violations.map((v) => v.code)).toEqual([
      "READONLY_LAYER_MODIFIED",
      "OUT_OF_SCOPE_CUT",
    ]);
    expect(rejected.mergedDocument).toBe(masterDoc);

    const validSub = await manager.createAssistantSubmission(
      issued.encryptedPackage,
      issued.sessionKey32,
      [
        {
          cutId: "cut-01",
          layerId: "l-flat",
          stage: "flatting",
          updatedBytes: UTF8.encode("FLAT_DONE"),
          strokeCount: 184,
          activeMinutes: 45,
          startedAtIso: "2026-11-26T10:10:00.000Z",
          endedAtIso: "2026-11-26T10:55:00.000Z",
        },
        {
          cutId: "cut-01",
          layerId: "l-bg",
          stage: "bg",
          updatedBytes: UTF8.encode("BG_CLEANED"),
          strokeCount: 96,
          activeMinutes: 30,
          startedAtIso: "2026-11-26T11:00:00.000Z",
          endedAtIso: "2026-11-26T11:30:00.000Z",
        },
      ],
      now + 100_000,
    );
    const merged = await manager.verifyAndMergeSubmission(
      masterDoc,
      issued.encryptedPackage.delegationId,
      validSub,
      issued.sessionKey32,
      now + 120_000,
    );
    expect(merged.merged).toBe(true);
    expect(merged.settlementBom?.totalActiveMinutes).toBe(75);
    expect(merged.settlementBom?.totalSettlementKrw).toBe(40_000);
    expect(merged.settlementBom?.bomDigestSha256Hex).toMatch(/^[0-9a-f]{64}$/u);
    expect(sha256Hex(merged.mergedDocument.cuts[0].layers[0].contentBytes)).toBe(
      sha256Hex(UTF8.encode("LINEART_V1")),
    );
  });

  it("#17 R2+P2P 하이브리드 캐시 라우터는 변조 피어를 격리하고 웜 메시에서 R2 오프로드율 >= 85%를 달성한다", async () => {
    const store = new Map<string, { bytes: Uint8Array; sha256: string }>();
    for (let i = 0; i < 10; i += 1) {
      const payload = new Uint8Array(4096).fill(i + 17);
      store.set(`asset-${i}`, { bytes: payload, sha256: sha256Hex(payload) });
    }

    let r2CallCount = 0;
    const corruptPeer: P2pAssetPeerAdapter = {
      peerId: "peer-corrupt",
      rttMs: 8,
      fetchAsset: async () => new Uint8Array(4096).fill(0xff),
    };
    const warmPeer: P2pAssetPeerAdapter = {
      peerId: "peer-warm-seoul",
      rttMs: 18,
      fetchAsset: async (assetId) =>
        Number(assetId.split("-")[1]) < 8 ? (store.get(assetId)?.bytes ?? null) : null,
    };

    const router = new HybridR2P2pAssetCacheRouter({
      maxLocalCacheBytes: 1024 * 1024,
      peers: [corruptPeer, warmPeer],
      r2Origin: {
        fetchFromR2Edge: async (assetId) => {
          r2CallCount += 1;
          return store.get(assetId)?.bytes ?? null;
        },
      },
    });

    const first = await router.fetchAsset({
      assetId: "asset-0",
      expectedSha256Hex: store.get("asset-0")!.sha256,
      category: "cc0-brush",
    });
    expect(first.source).toBe("p2p-peer");
    expect(first.rejectedCorruptedPeers).toEqual(["peer-corrupt"]);

    for (let pass = 0; pass < 2; pass += 1) {
      for (let i = 0; i < 10; i += 1) {
        if (pass === 0 && i === 0) continue;
        const id = `asset-${i}`;
        const res = await router.fetchAsset({
          assetId: id,
          expectedSha256Hex: store.get(id)!.sha256,
          category: i % 2 === 0 ? "3d-prop" : "tone-texture",
        });
        expect(res.verifiedSha256Hex).toBe(store.get(id)!.sha256);
      }
    }

    const metrics = router.getMetrics();
    expect(metrics.totalRequests).toBe(20);
    expect(metrics.r2OriginFetches).toBe(2);
    expect(r2CallCount).toBe(2);
    expect(metrics.quarantinedPeerIds).toEqual(["peer-corrupt"]);
    expect(metrics.r2OffloadRate).toBeGreaterThanOrEqual(0.85);
    expect(metrics.r2ByteOffloadRate).toBeGreaterThanOrEqual(0.85);
  });
});

describe("Pillars G & H (#25~#32): 마감 ETA · 글로벌 심볼 · 레드라인 · 타임랩스 · 하드웨어/오프라인", () => {
  it("#25 스트로크 이력 마감 ETA 예측기는 MAD 이상치 억제와 병목·조기 경보·단축 전략을 산출한다", () => {
    const t0 = 1_795_000_000_000;
    const logs: CutStageHistoryEntry[] = [
      { cutId: "c1", stage: "lineart", durationMinutes: 24, strokeCount: 420, complexityWeight: 1, completedAtMs: t0 + 1 },
      { cutId: "c2", stage: "lineart", durationMinutes: 26, strokeCount: 440, complexityWeight: 1, completedAtMs: t0 + 2 },
      { cutId: "c3", stage: "lineart", durationMinutes: 25, strokeCount: 430, complexityWeight: 1, completedAtMs: t0 + 3 },
      { cutId: "c4", stage: "lineart", durationMinutes: 240, strokeCount: 410, complexityWeight: 1, completedAtMs: t0 + 4 },
      { cutId: "c1", stage: "flatting", durationMinutes: 15, strokeCount: 180, complexityWeight: 1, completedAtMs: t0 + 5 },
      { cutId: "c2", stage: "flatting", durationMinutes: 16, strokeCount: 190, complexityWeight: 1, completedAtMs: t0 + 6 },
      { cutId: "c1", stage: "bg", durationMinutes: 42, strokeCount: 220, complexityWeight: 1, completedAtMs: t0 + 7 },
      { cutId: "c2", stage: "bg", durationMinutes: 45, strokeCount: 240, complexityWeight: 1, completedAtMs: t0 + 8 },
      { cutId: "c3", stage: "bg", durationMinutes: 48, strokeCount: 260, complexityWeight: 1, completedAtMs: t0 + 9 },
      { cutId: "c1", stage: "lettering", durationMinutes: 6, strokeCount: 25, complexityWeight: 1, completedAtMs: t0 + 10 },
    ];
    const remainingCuts = Array.from({ length: 12 }, (_, idx) => ({
      cutId: `rem-${idx + 1}`,
      remainingStages: ["lineart", "flatting", "bg", "lettering"] as const,
      complexityWeight: 1.1,
      has3dBackground: idx % 2 === 0,
      dialogueBalloonCount: 3,
    }));

    const report = predictDeadlineEtaFromHistory({
      episodeId: "ep-19",
      nowMs: t0 + 100_000,
      deadlineMs: t0 + 100_000 + 86_400_000 * 1.5,
      dailyWorkingHours: 8,
      historicalCutLogs: logs,
      remainingCuts,
    });
    expect(report.stageBreakdown.lineart.minutesPerUnitComplexityP50).toBeLessThan(35);
    expect(report.bottleneckStage).toBe("bg");
    expect(report.overrunWarningTriggered).toBe(true);
    expect(report.riskLevel).toBe("critical-overrun");
    expect(report.recommendations[0].targetStage).toBe("bg");
    expect(report.projectedHoursAfterShortcutsP50).toBeLessThan(report.estimatedTotalHoursP50);

    const relaxed = predictDeadlineEtaFromHistory({
      episodeId: "ep-19",
      nowMs: t0 + 100_000,
      deadlineMs: t0 + 100_000 + 86_400_000 * 5,
      dailyWorkingHours: 8,
      historicalCutLogs: logs,
      remainingCuts: remainingCuts.slice(0, 3),
    });
    expect(relaxed.riskLevel).toBe("on-track");
    expect(relaxed.overrunWarningTriggered).toBe(false);
  });

  it("#26 다중 에피소드 글로벌 스마트 심볼은 2D 호모그래피 원근 변환과 로컬 오버라이드를 보존하며 전파한다", () => {
    const registry = new GlobalSmartSymbolRegistry();
    registry.registerMasterSymbol({
      symbolId: "sym-academy-crest",
      name: "아카데미 문양",
      bounds: { width: 100, height: 100 },
      textureDigestSha256: sha256Hex(UTF8.encode("crest-v1")),
      vectorPaths: [
        {
          pathId: "shield",
          closed: true,
          strokeWidth: 2,
          semanticRole: "outline",
          points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }],
        },
      ],
    });

    const ep1Quad: PerspectiveQuad2D = [
      { x: 120, y: 80 }, { x: 240, y: 95 }, { x: 225, y: 230 }, { x: 105, y: 205 },
    ];
    const ep2Quad: PerspectiveQuad2D = [
      { x: 400, y: 150 }, { x: 480, y: 120 }, { x: 510, y: 260 }, { x: 385, y: 270 },
    ];

    const inst1 = registry.linkInstance({
      instanceId: "inst-ep01-cut03",
      symbolId: "sym-academy-crest",
      episodeId: "ep-01",
      cutId: "cut-03",
      perspectiveQuad: ep1Quad,
      opacity: 0.92,
      zIndex: 14,
      tintSlotOverride: "evening-warm",
    });
    const inst2 = registry.linkInstance({
      instanceId: "inst-ep02-cut09",
      symbolId: "sym-academy-crest",
      episodeId: "ep-02",
      cutId: "cut-09",
      perspectiveQuad: ep2Quad,
      opacity: 0.85,
      zIndex: 7,
    });

    const corner = applyHomographyToPoint(inst1.homography, { x: 100, y: 0 });
    expect(corner.x).toBeCloseTo(240, 2);
    expect(corner.y).toBeCloseTo(95, 2);

    const nextTexHash = sha256Hex(UTF8.encode("crest-v2"));
    const prop = registry.updateMasterSymbol("sym-academy-crest", {
      textureDigestSha256: nextTexHash,
      vectorPaths: [
        {
          pathId: "shield-v2",
          closed: true,
          strokeWidth: 2.5,
          semanticRole: "outline",
          points: [
            { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 },
          ],
        },
      ],
    });
    expect(prop.nextVersion).toBe(2);
    expect(prop.updatedInstanceCount).toBe(2);
    expect(prop.affectedEpisodeIds).toEqual(["ep-01", "ep-02"]);

    const u1 = registry.getInstance("inst-ep01-cut03")!;
    const u2 = registry.getInstance("inst-ep02-cut09")!;
    expect(u1.homographyHashHex).toBe(inst1.homographyHashHex);
    expect(u2.homographyHashHex).toBe(inst2.homographyHashHex);
    expect(u1.tintSlotOverride).toBe("evening-warm");
    expect(u1.warpedPaths[0].points).toHaveLength(5);
    expect(u2.warpedPaths[0].points[1].x).toBeCloseTo(480, 2);
  });

  it("#27 무설치 암호화 P2P 레드라인 링크는 TTL·토글 오버레이를 지원하며 원본 아트워크를 무변조로 유지한다", async () => {
    const baseLayers: BaseArtLayerSnapshot[] = [
      { layerId: "base-ink", name: "원본 선화", bytes: UTF8.encode("INK_IMMUTABLE") },
      { layerId: "base-color", name: "원본 채색", bytes: UTF8.encode("COLOR_IMMUTABLE") },
    ];
    const now = 1_795_100_000_000;
    const session = new EphemeralP2pRedlineReviewSession({
      workId: "work-starlight",
      episodeId: "ep-14",
      cutId: "cut-08",
      baseArtLayers: baseLayers,
      ttlMs: 3_600_000,
      nowMs: now,
    });
    const link = session.getReviewLink();
    expect(parseZeroInstallReviewLink(link.shareableUrl).sessionId).toBe(session.sessionId);

    const packet = await EphemeralP2pRedlineReviewSession.createEncryptedRedlinePacket({
      shareableUrl: link.shareableUrl,
      cutId: "cut-08",
      reviewerId: "pd-sora",
      reviewerName: "박소라 PD",
      packetTtlMs: 600_000,
      nowMs: now + 10_000,
      annotations: [
        { kind: "pin", annotationId: "p1", x: 310, y: 420, label: "손가락 각도 보정", severity: "revision", tone: "bad" },
        { kind: "stroke", annotationId: "s1", strokeWidthPx: 4, tone: "warn", points: [{ x: 300, y: 410, pressure: 0.8 }] },
        { kind: "dialogue-comment", annotationId: "d1", balloonId: "b2", originalText: "가야 해.", suggestedText: "출발해야 해!", reviewerNote: "긴박감" },
      ],
    });
    expect((await session.receiveEncryptedPacket(packet, now + 20_000)).accepted).toBe(true);

    const shown = session.buildOverlaySnapshot(baseLayers, { nowMs: now + 30_000 });
    expect(shown.baseArtLayersUntouched).toBe(true);
    expect(shown.totalAnnotationCount).toBe(3);

    session.setOverlayVisible(false);
    expect(session.buildOverlaySnapshot(baseLayers, { nowMs: now + 35_000 }).totalAnnotationCount).toBe(0);

    session.setOverlayVisible(true);
    expect(session.buildOverlaySnapshot(baseLayers, { nowMs: now + 900_000 }).totalAnnotationCount).toBe(0);
    expect((await session.receiveEncryptedPacket(packet, now + 900_000)).accepted).toBe(false);
  });

  it("#28 제로-오버헤드 XOR+RLE Undo-Log 타임랩스 릴스 생성기는 무손실 압축과 15s/30s 60fps 스케줄을 산출한다", () => {
    const prev = new Uint8Array(65_536).fill(240);
    const next = new Uint8Array(prev);
    for (let i = 10_000; i < 10_960; i += 4) {
      next[i] = 28;
      next[i + 1] = 32;
      next[i + 2] = 44;
    }
    const encoded = encodeUndoXorRleDelta(prev, next);
    expect(encoded.compressionRatio).toBeLessThan(0.15);
    expect(sha256Hex(decodeUndoXorRleDelta(prev, encoded.encodedBytes))).toBe(sha256Hex(next));

    const stages = ["rough", "lineart", "flatting", "shading", "effects", "lettering"] as const;
    const undoEvents: UndoTimelapseEvent[] = Array.from({ length: 120 }, (_, i) => ({
      eventId: `undo-${i + 1}`,
      timestampMs: 1_795_000_000_000 + i * 25_000,
      stage: stages[Math.floor((i / 120) * stages.length)],
      rawFrameByteLength: 65_536,
      xorRleDeltaByteLength: encoded.compressedByteLength,
      changedPixelRatio: i % 15 === 0 ? 0.14 : 0.02,
      isMilestone: i === 39 || i === 99 || i === 119,
    }));

    const reel15 = buildTimelapseScheduleFromUndoLog({
      workId: "work-starlight",
      cutId: "cut-01",
      undoEvents,
      targetDurationSec: 15,
      fps: 60,
      speedCurve: "smooth-ramp",
    });
    expect(reel15.totalFrames).toBe(900);
    expect(reel15.holdFrames).toBe(90);
    expect(reel15.screenRecordingOverheadPct).toBe(0);
    expect(reel15.storageSavingsPct).toBeGreaterThan(85);
    expect(reel15.maxSpeedMultiplier).toBeGreaterThan(reel15.minSpeedMultiplier);
    for (let i = 1; i < reel15.frames.length; i += 1) {
      expect(reel15.frames[i].sourceEventIndex).toBeGreaterThanOrEqual(
        reel15.frames[i - 1].sourceEventIndex,
      );
    }

    const reel30 = buildTimelapseScheduleFromUndoLog({
      workId: "work-starlight",
      cutId: "cut-01",
      undoEvents,
      targetDurationSec: 30,
      fps: 60,
      speedCurve: "dramatic-finish",
    });
    expect(reel30.totalFrames).toBe(1800);
    expect(reel30.holdFrames).toBe(150);
  });

  it("#29 컴패니언 폰 자이로/다이얼 컨트롤러는 데드존 필터링·EMA 스무딩·다이얼 모드 전환을 처리한다", () => {
    const suite = new HardwareCompanionAndColdBootSuite({
      companionConfig: { deadzoneDeg: 3, smoothingAlpha: 0.5, brushSizePxPerDetent: 2 },
    });
    const first = suite.processCompanionGyroDial({
      alphaDeg: 0,
      betaDeg: 10,
      gammaDeg: 0,
      dialDetentDelta: 3,
      timestampMs: 1000,
    });
    expect(first.activeMode).toBe("brush-size");
    expect(first.brushSizeDeltaPx).toBe(6);
    expect(first.canvasRotateDeltaDeg).toBe(0);

    const microJitter = suite.processCompanionGyroDial({
      alphaDeg: 0,
      betaDeg: 10,
      gammaDeg: 2, // EMA=1도 < 데드존 3도 -> 회전 무시
      dialDetentDelta: 0,
      timestampMs: 1016,
    });
    expect(microJitter.canvasRotateDeltaDeg).toBe(0);

    const switched = suite.processCompanionGyroDial({
      alphaDeg: 0,
      betaDeg: 10,
      gammaDeg: 14,
      dialDetentDelta: 2,
      dialPressed: true,
      timestampMs: 1032,
    });
    expect(switched.modeSwitched).toBe(true);
    expect(switched.activeMode).toBe("canvas-rotate");
    expect(switched.canvasRotateDeltaDeg).toBeGreaterThan(10);
  });

  it("#30 WebHID/WebMIDI 하드웨어 매퍼는 시프트 레이어와 CC/Note 패킷을 스튜디오 명령으로 디코딩한다", () => {
    const suite = new HardwareCompanionAndColdBootSuite();
    const hidBase = suite.mapWebHidReport(new Uint8Array([0x01, 0x01, 0x03, 0x00]));
    expect(hidBase.map((c) => c.command)).toEqual(["brush.size", "history.undo"]);

    const hidFn = suite.mapWebHidReport(new Uint8Array([0x01, 0x80, 0xfe, 0x00]));
    expect(hidFn).toHaveLength(1);
    expect(hidFn[0].command).toBe("canvas.rotate");
    expect(hidFn[0].value).toBe(-10);

    const midiOpacity = suite.mapWebMidiMessage(new Uint8Array([0xb0, 7, 127]));
    expect(midiOpacity?.command).toBe("brush.opacity");
    expect(midiOpacity?.value).toBe(1);
    expect(suite.mapWebMidiMessage(new Uint8Array([0x90, 36, 100]))?.command).toBe("history.undo");
  });

  it("#31 외부 DCC(.psd/.glb) 핫싱크 매니페스트는 매직 헤더 검증과 스튜디오 메타데이터 보존을 보장한다", () => {
    const suite = new HardwareCompanionAndColdBootSuite();
    const psdV1 = makeMockPsdBytes("layer-sheet-v1");
    const glbV1 = makeMockGlbBytes("classroom-v1");

    suite.registerExternalDccAsset({
      linkId: "dcc-psd-01",
      format: "psd",
      externalPath: "/assets/ep12-cut01.psd",
      targetCutId: "cut-01",
      targetNodeOrLayerId: "layer-bg-sheet",
      initialBytes: psdV1,
      preservedStudioMetadata: { blendMode: "multiply", opacity: 0.9, rightsBomId: "bom-01" },
    });
    suite.registerExternalDccAsset({
      linkId: "dcc-glb-01",
      format: "glb",
      externalPath: "/assets/classroom.glb",
      targetCutId: "cut-01",
      targetNodeOrLayerId: "node-room-root",
      initialBytes: glbV1,
      preservedStudioMetadata: { cameraPreset: "low-angle-35mm", scaleMetric: 1 },
    });

    expect(suite.syncExternalDccAsset("dcc-psd-01", psdV1).status).toBe("NO_CHANGE");
    expect(suite.syncExternalDccAsset("dcc-glb-01", UTF8.encode("BAD_FILE")).status).toBe(
      "INVALID_MAGIC_HEADER",
    );

    const psdSync = suite.syncExternalDccAsset("dcc-psd-01", makeMockPsdBytes("layer-sheet-v2"));
    expect(psdSync.status).toBe("SYNC_READY");
    expect(psdSync.nextRevision).toBe(2);
    expect(psdSync.preservedStudioMetadata?.blendMode).toBe("multiply");

    const glbSync = suite.syncExternalDccAsset("dcc-glb-01", makeMockGlbBytes("classroom-v2"));
    expect(glbSync.status).toBe("SYNC_READY");
    expect(glbSync.preservedStudioMetadata?.cameraPreset).toBe("low-angle-35mm");
    expect(suite.dccHotSync.exportManifestSnapshot().entries).toHaveLength(2);
  });

  it("#32 제로-네트워크 콜드부트 준비 감사기는 완전 오프라인 준비 상태와 결함 원인을 정확히 판정한다", () => {
    const suite = new HardwareCompanionAndColdBootSuite();
    const shellHash = sha256Hex(UTF8.encode("app-shell-v1"));
    const wasmHash = sha256Hex(UTF8.encode("wasm64-core-v1"));
    const fontHash = sha256Hex(UTF8.encode("lettering-kr-v1"));

    const ready = suite.auditColdBootReadiness({
      serviceWorkerActive: true,
      opfsWritable: true,
      sqliteJournalHealthy: true,
      webCryptoSubtleAvailable: true,
      externalBootUrls: [],
      estimatedAvailableStorageBytes: 1024 * 1024 * 1024,
      cachedAssets: [
        { assetPath: "/index.html", kind: "app-shell", cached: true, expectedSha256Hex: shellHash, actualSha256Hex: shellHash, byteLength: 8192 },
        { assetPath: "/wasm/studio-core.wasm", kind: "wasm", cached: true, expectedSha256Hex: wasmHash, actualSha256Hex: wasmHash, byteLength: 2_400_000 },
        { assetPath: "/fonts/lettering-kr.woff2", kind: "font", cached: true, expectedSha256Hex: fontHash, actualSha256Hex: fontHash, byteLength: 320_000 },
      ],
    });
    expect(ready.readyForAirplaneMode).toBe(true);
    expect(ready.readinessScore).toBe(100);
    expect(ready.blockingFailures).toHaveLength(0);

    const broken = suite.auditColdBootReadiness({
      serviceWorkerActive: true,
      opfsWritable: true,
      sqliteJournalHealthy: true,
      webCryptoSubtleAvailable: true,
      externalBootUrls: ["https://cdn.example.com/fonts.css"],
      estimatedAvailableStorageBytes: 64 * 1024 * 1024,
      cachedAssets: [
        { assetPath: "/index.html", kind: "app-shell", cached: true, expectedSha256Hex: shellHash, actualSha256Hex: shellHash, byteLength: 8192 },
        { assetPath: "/wasm/studio-core.wasm", kind: "wasm", cached: true, expectedSha256Hex: wasmHash, actualSha256Hex: "deadbeef", byteLength: 2_400_000 },
      ],
    });
    expect(broken.readyForAirplaneMode).toBe(false);
    expect(broken.readinessScore).toBeLessThan(70);
    expect(broken.blockingFailures.map((f) => f.checkId)).toContain("wasm-binary-integrity");
    expect(broken.blockingFailures.map((f) => f.checkId)).toContain("zero-external-cdn-deps");
    expect(broken.remediationStepsKo.length).toBeGreaterThanOrEqual(2);
  });
});
