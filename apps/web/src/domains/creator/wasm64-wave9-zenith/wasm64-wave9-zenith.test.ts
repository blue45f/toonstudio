import { describe, expect, it } from "vitest";

import {
  analyzeCinematographyComposition,
  buildCutMerkleTree,
  buildDeterministicGrainFilterWasmBinary,
  bytesToHex,
  computeOledPanelPowerMetrics,
  deriveP2pAesGcmSessionKey,
  detectMultiEpisodeAnthropometricDrift,
  DeterministicWasmPluginHost,
  evaluateLatentCodebookRoundtrip,
  extractAnthropometricRatiosFromLandmarks,
  generateP2pPeerIdentity,
  inspectAndValidateWasmPluginBinary,
  PAPER_FIBER_PRESETS,
  remasterLowDpiWebtoonCut,
  RunCoalescedSequenceCrdt,
  ServerlessP2pCutVerifierChannel,
  sha256Bytes,
  simulateAnisotropicPaperGranulation,
  toneMapOledBlackVelvet,
  verifyCutTileMerkleProof,
  WGSL_LATENT_VQ_BLOCK_DECODE,
  type EpisodeCharacterObservation,
  type MineralPigmentSpec,
  type WasmSandboxPolicy,
} from "./index";

describe("wasm64-wave9-zenith 통합 수리·시스템 검증", () => {
  describe("1. 역방향 시네마토그래피 구도 코치 · 이방성 한지/안료 · 격리 Wasm 호스트", () => {
    it("실루엣·시선 광선·말풍선 가림을 분석해 정확히 1도 단위 롤과 개선된 크롭을 산출한다", () => {
      const report = analyzeCinematographyComposition({
        frameWidthPx: 1200,
        frameHeightPx: 900,
        horizonAngleDeg: -3.2,
        targetPreset: "golden-spiral",
        targetMood: "heroic-reveal",
        subjects: [
          {
            subjectId: "hero-main",
            centroidX: 820,
            centroidY: 510,
            bounds: { x: 700, y: 210, width: 240, height: 560 },
            visualWeight: 1.0,
            eyePoint: { x: 830, y: 290 },
            gazeAzimuthDeg: 0, // 우측 응시인데 우측에 치우쳐 리드룸 부족
            isPrimary: true,
          },
        ],
        balloons: [
          { balloonId: "bal-overlap", x: 740, y: 240, width: 190, height: 140 },
          { balloonId: "bal-ray", x: 960, y: 250, width: 160, height: 110 },
        ],
      });

      expect(Number.isInteger(report.recommendedRollDeltaDeg)).toBe(true);
      expect(report.recommendedRollDeltaDeg).toBe(3);
      expect(Math.abs(report.resultingHorizonDeg)).toBeLessThan(0.5);
      expect(report.balloonOcclusions.some((o) => o.kind === "silhouette-overlap")).toBe(true);
      expect(report.balloonOcclusions.some((o) => o.kind === "gaze-ray-blocked")).toBe(true);
      expect(report.scoreAfter0To100).toBeGreaterThan(report.scoreBefore0To100);
      expect(report.aiTokensUsed).toBe(0);
      expect(report.serverCostKrw).toBe(0);

      const dutchReport = analyzeCinematographyComposition({
        frameWidthPx: 800,
        frameHeightPx: 1000,
        horizonAngleDeg: 0,
        targetMood: "tension-dutch",
        subjects: [
          {
            subjectId: "villain",
            centroidX: 400,
            centroidY: 460,
            bounds: { x: 290, y: 220, width: 220, height: 500 },
            visualWeight: 1,
            eyePoint: { x: 400, y: 300 },
            gazeAzimuthDeg: 35,
            isPrimary: true,
          },
        ],
      });
      expect(dutchReport.selectedSymmetry).toBe("sinister-diagonal");
      expect(dutchReport.recommendedRollDeltaDeg).toBe(8);
    });

    it("한지 장섬유 모세관 이방성과 황목 광물 안료 골짜기 침전(입상화)을 결정론으로 재현한다", () => {
      const heavyUltramarine: MineralPigmentSpec = {
        pigmentId: "pb29-ultramarine",
        labelKo: "천연 군청(고비중 광물)",
        specificGravity: 3.95,
        flocculationAffinity: 0.92,
        stainingPower: 0.35,
        massToneRgb: [28, 52, 168],
      };
      const lightDye: MineralPigmentSpec = {
        pigmentId: "pb15-phthalo",
        labelKo: "프탈로 블루(초미립 염료)",
        specificGravity: 1.12,
        flocculationAffinity: 0.08,
        stainingPower: 0.9,
        massToneRgb: [18, 84, 175],
      };

      const hanjiRunA = simulateAnisotropicPaperGranulation({
        width: 48,
        height: 48,
        paperKind: "hanji",
        fiberAngleOverrideDeg: 0,
        pigment: heavyUltramarine,
        seed: 777,
        steps: 22,
      });
      const hanjiRunB = simulateAnisotropicPaperGranulation({
        width: 48,
        height: 48,
        paperKind: "hanji",
        fiberAngleOverrideDeg: 0,
        pigment: heavyUltramarine,
        seed: 777,
        steps: 22,
      });
      const coldPressMineral = simulateAnisotropicPaperGranulation({
        width: 48,
        height: 48,
        paperKind: "cold-press",
        pigment: heavyUltramarine,
        seed: 777,
        steps: 22,
      });
      const hotPressDye = simulateAnisotropicPaperGranulation({
        width: 48,
        height: 48,
        paperKind: "hot-press",
        pigment: lightDye,
        seed: 777,
        steps: 22,
      });

      expect(PAPER_FIBER_PRESETS.hanji.anisotropyRatio).toBeGreaterThan(3);
      expect(hanjiRunA.fiberDiffusionTensor.dxx).toBeGreaterThan(hanjiRunA.fiberDiffusionTensor.dyy * 2.5);
      expect(hanjiRunA.measuredCapillaryAnisotropy).toBeGreaterThan(hotPressDye.measuredCapillaryAnisotropy);
      expect(coldPressMineral.granulationIndex).toBeGreaterThan(hotPressDye.granulationIndex * 2.2);
      expect(Array.from(hanjiRunA.rgbaPreview)).toEqual(Array.from(hanjiRunB.rgbaPreview));
    });

    it("권한 격리 Wasm 호스트가 결정론 픽셀 필터는 허용하고 비인가 임포트·비제한 메모리·연료 초과를 차단한다", async () => {
      const strictPolicy: WasmSandboxPolicy = {
        maxBinaryBytes: 4096,
        maxMemoryPages: 2,
        fuelBudget: 5000,
        allowedCapabilities: ["prng", "fuel-meter"],
      };
      const validWasm = buildDeterministicGrainFilterWasmBinary(1, 2);
      const inspection = inspectAndValidateWasmPluginBinary(validWasm, strictPolicy);
      expect(inspection.valid).toBe(true);
      expect(inspection.exports).toContain("apply_filter");

      const host = new DeterministicWasmPluginHost(strictPolicy);
      const srcRgba = new Uint8ClampedArray(16 * 16 * 4);
      for (let i = 0; i < srcRgba.length; i += 4) {
        srcRgba[i] = 120; srcRgba[i + 1] = 100; srcRgba[i + 2] = 90; srcRgba[i + 3] = 255;
      }

      const run1 = await host.runPixelFilter({ wasmBytes: validWasm, rgbaInput: srcRgba, width: 16, height: 16, seedU32: 42, param0: 15 });
      const run2 = await host.runPixelFilter({ wasmBytes: validWasm, rgbaInput: srcRgba, width: 16, height: 16, seedU32: 42, param0: 15 });
      const runDiffSeed = await host.runPixelFilter({ wasmBytes: validWasm, rgbaInput: srcRgba, width: 16, height: 16, seedU32: 9999, param0: 15 });

      expect(run1.ok).toBe(true);
      expect(run1.prngCalls).toBe(256);
      expect(Array.from(run1.rgbaOutput!)).toEqual(Array.from(run2.rgbaOutput!));
      expect(Array.from(run1.rgbaOutput!)).not.toEqual(Array.from(runDiffSeed.rgbaOutput!));

      // 비인가 네트워크 임포트 및 비제한 메모리(limitFlag=0x00), start 섹션(id=8) 차단 검증
      const enc = (s: string): number[] => [s.length, ...Array.from(s, (ch) => ch.charCodeAt(0))];
      const badImportPayload = [1, ...enc("wasi_snapshot_preview1"), ...enc("sock_send"), 0x00, 0x00];
      const maliciousWasm = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        0x01, 4, 1, 0x60, 0, 0,
        0x02, badImportPayload.length, ...badImportPayload,
        0x05, 3, 1, 0x00, 1, // 비제한 메모리(flag 0)
        0x08, 1, 0x00, // 금지된 start 섹션
      ]);
      const badCheck = inspectAndValidateWasmPluginBinary(maliciousWasm, strictPolicy);
      expect(badCheck.valid).toBe(false);
      expect(badCheck.issues.map((i) => i.code)).toEqual(
        expect.arrayContaining(["forbidden-import", "unbounded-memory", "forbidden-start-section"]),
      );

      // 연료 예산 초과 차단 검증
      const tightFuelHost = new DeterministicWasmPluginHost({ ...strictPolicy, fuelBudget: 400 });
      const starved = await tightFuelHost.runPixelFilter({ wasmBytes: validWasm, rgbaInput: srcRgba, width: 16, height: 16, seedU32: 42, param0: 5 });
      expect(starved.ok).toBe(false);
      expect(starved.rejectionReason).toContain("fuel-exhausted");
    });
  });

  describe("2. 다회차 인체비례 표류 감지기 · OLED 블랙벨벳 톤매퍼 · 인쇄급 리마스터", () => {
    it("중앙값/MAD Z-점수와 Theil-Sen 기울기로 단발 작화 붕괴와 장기 등신비 표류를 모두 검출한다", () => {
      const lmSample = extractAnthropometricRatiosFromLandmarks({
        crownY: 100, chinY: 200,
        headLeftX: 465, headRightX: 535,
        leftPupil: { x: 484, y: 148 }, rightPupil: { x: 516, y: 148 },
        leftShoulderX: 405, rightShoulderX: 595,
        pelvisY: 430, ankleY: 850,
        headYawDeg: 15, cameraPitchDeg: 8,
      });
      expect(lmSample.headToBodyRatio).toBeGreaterThan(7.3);
      expect(lmSample.headToBodyRatio).toBeLessThan(7.8);

      const observations: EpisodeCharacterObservation[] = [1, 2, 3, 4, 5, 6].map((ep) => ({
        characterId: "protagonist-jin",
        episodeNumber: ep,
        cutId: `ep${ep}-c01`,
        ratios: {
          headToBodyRatio: 7.5 - ep * 0.12, // 회차마다 등신비가 서서히 줄어드는 장기 표류
          shoulderToHeadWidthRatio: 2.6,
          interPupillaryToFaceWidthRatio: 0.44,
          eyeToChinRatio: 0.52,
          lowerBodyToHeightRatio: 0.55,
        },
      }));
      observations.push({
        characterId: "protagonist-jin",
        episodeNumber: 7,
        cutId: "ep7-offmodel-spike",
        ratios: {
          headToBodyRatio: 5.9, // 심각한 대두화 작화 붕괴
          shoulderToHeadWidthRatio: 2.05,
          interPupillaryToFaceWidthRatio: 0.44,
          eyeToChinRatio: 0.52,
          lowerBodyToHeightRatio: 0.54,
        },
      });

      const drift = detectMultiEpisodeAnthropometricDrift(observations, {
        characterId: "protagonist-jin",
        targetRatios: {
          headToBodyRatio: 7.5,
          shoulderToHeadWidthRatio: 2.6,
          interPupillaryToFaceWidthRatio: 0.44,
          eyeToChinRatio: 0.52,
          lowerBodyToHeightRatio: 0.55,
        },
      });

      expect(drift.offModelCutCount).toBeGreaterThanOrEqual(1);
      expect(drift.gradualCreepDetected).toBe(true);
      expect(drift.theilSenSlopePerEpisode.headToBodyRatio).toBeLessThan(-0.1);
      const spikeFinding = drift.cutFindings.find((f) => f.cutId === "ep7-offmodel-spike")!;
      expect(spikeFinding.status).toBe("off-model");
      expect(spikeFinding.driftedMetrics).toContain("headToBodyRatio");
      expect(drift.serverCostKrw).toBe(0);
    });

    it("OLED 서브픽셀 전류 모델에서 야간 컷 전력을 30% 이상 절감하면서 국소 윤곽 대비를 유지한다", () => {
      const w = 32; const h = 32;
      const nightCut = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const p = (y * w + x) * 4;
          const isRimLight = x >= 13 && x <= 18 && y >= 10 && y <= 22;
          const isInkLine = x === 12 || x === 19;
          if (isInkLine) {
            nightCut[p] = 8; nightCut[p + 1] = 10; nightCut[p + 2] = 14;
          } else if (isRimLight) {
            nightCut[p] = 228; nightCut[p + 1] = 232; nightCut[p + 2] = 245;
          } else {
            // 전형적인 웹툰 야간 배경의 들뜬 어두운 남회색(전력 누수 주범)
            nightCut[p] = 34; nightCut[p + 1] = 40; nightCut[p + 2] = 62;
          }
          nightCut[p + 3] = 255;
        }
      }

      const rawMetrics = computeOledPanelPowerMetrics(nightCut);
      expect(rawMetrics.blueChannelMw).toBeGreaterThan(rawMetrics.greenChannelMw);

      const mapped = toneMapOledBlackVelvet(nightCut, { width: w, height: h, targetPowerReductionRatio: 0.34 });
      expect(mapped.isNightCut).toBe(true);
      expect(mapped.powerReductionRatio).toBeGreaterThanOrEqual(0.30);
      expect(mapped.powerAfter.trueBlackPixelRatio).toBeGreaterThan(mapped.powerBefore.trueBlackPixelRatio);
      expect(mapped.localEdgeContrastRetentionRatio).toBeGreaterThanOrEqual(0.90);
      expect(mapped.serverCostKrw).toBe(0);
    });

    it("72 DPI 저해상도 원고를 350 DPI 인쇄급으로 접선 보간 리마스터링하며 선명도와 색역을 보존한다", () => {
      const sw = 24; const sh = 24;
      const lowDpi = new Uint8ClampedArray(sw * sh * 4);
      for (let y = 0; y < sh; y += 1) {
        for (let x = 0; x < sw; x += 1) {
          const p = (y * sw + x) * 4;
          const diagDist = Math.abs(x - y);
          if (diagDist === 0) {
            lowDpi[p] = 18; lowDpi[p + 1] = 18; lowDpi[p + 2] = 22;
          } else if (diagDist === 1) {
            // 72 DPI 스캔본의 흐릿한 중간 회색 안티에일리어싱 번짐
            lowDpi[p] = 128; lowDpi[p + 1] = 122; lowDpi[p + 2] = 135;
          } else if (x > y) {
            lowDpi[p] = 246; lowDpi[p + 1] = 214; lowDpi[p + 2] = 192;
          } else {
            lowDpi[p] = 62; lowDpi[p + 1] = 126; lowDpi[p + 2] = 238;
          }
          lowDpi[p + 3] = 255;
        }
      }

      const remastered = remasterLowDpiWebtoonCut({
        rgbaInput: lowDpi,
        width: sw,
        height: sh,
        sourceDpi: 72,
        targetDpi: 350,
      });

      expect(remastered.outputWidth).toBe(Math.round((24 * 350) / 72));
      expect(remastered.outputHeight).toBe(Math.round((24 * 350) / 72));
      expect(remastered.physicalWidthMm).toBeCloseTo((24 / 72) * 25.4, 1);
      expect(remastered.edgeSharpnessGainRatio).toBeGreaterThan(1.02);
      expect(remastered.serverCostKrw).toBe(0);
    });
  });

  describe("3. 잠재 코드북 4×4 텍스처 코덱 · 무묘비 런 병합 CRDT · 무서버 P2P E2EE 머클 검증", () => {
    it("4×4 VQ 코드북 + 2비트 잔차 코덱이 초저비트율(6bpp 블록)에서 PSNR 36dB 이상을 달성한다", () => {
      const w = 64; const h = 64;
      const tex = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const p = (y * w + x) * 4;
          if (x + y < 44) {
            // 부드러운 피부톤 그라데이션
            tex[p] = Math.round(230 + x * 0.35);
            tex[p + 1] = Math.round(192 + y * 0.35);
            tex[p + 2] = 175;
          } else if (Math.abs(x + y - 44) <= 1) {
            // 선명한 대각 잉크 외곽선
            tex[p] = 22; tex[p + 1] = 24; tex[p + 2] = 30;
          } else {
            // 하늘/의상 셀 음영 + 미세 톤 변화
            tex[p] = Math.round(65 + (x % 8) * 2);
            tex[p + 1] = Math.round(115 + y * 0.8);
            tex[p + 2] = Math.round(195 + (x * 0.4));
          }
          tex[p + 3] = 255;
        }
      }

      const metrics = evaluateLatentCodebookRoundtrip(tex, { width: w, height: h, codebookSize: 64, kmeansIterations: 3 });
      expect(metrics.packet.blockPayloadBitsPerPixel).toBe(6);
      expect(metrics.packet.compressionRatioVsRgba32).toBeGreaterThan(3.8);
      expect(metrics.psnrDb).toBeGreaterThan(36);
      expect(WGSL_LATENT_VQ_BLOCK_DECODE).toContain("@compute @workgroup_size(4, 4, 1)");
    });

    it("연속 입력을 단일 런으로 병합하고 동시 편집 수렴 후 확정 에포크에서 묘비를 0개로 압축한다", () => {
      const peerA = new RunCoalescedSequenceCrdt("artist-a");
      const peerB = new RunCoalescedSequenceCrdt("editor-b");

      const opsFromA = [];
      const scriptLine = "오늘 밤 옥상 결투 컷의 대사를 정리합니다!";
      for (const ch of scriptLine) {
        const op = peerA.insertLocal(peerA.toString().length, ch);
        if (op) opsFromA.push(op);
      }
      // 개별 글자 24회 연속 입력이 단일 런(1개 세그먼트)으로 즉시 병합되어야 한다
      expect(peerA.getRunCount()).toBe(1);
      for (const op of opsFromA) peerB.applyOperation(op);
      expect(peerB.toString()).toBe(scriptLine);
      expect(peerB.getRunCount()).toBe(1);

      // 동일 위치 동시 삽입 + 중간 삭제 후 역순 전달 시에도 강한 결과적 일관성 보장
      const concurrentA = peerA.insertLocal(5, "[긴박]");
      const concurrentB = peerB.insertLocal(5, "(천둥)");
      if (concurrentB) peerA.applyOperation(concurrentB);
      if (concurrentA) peerB.applyOperation(concurrentA);
      expect(peerA.toString()).toBe(peerB.toString());

      const delOps = peerA.deleteLocal(0, 3);
      for (const dOp of delOps) peerB.applyOperation(dOp);
      expect(peerA.getTombstoneRunCount()).toBeGreaterThan(0);

      // 에포크 확정 후 묘비 0개 소거 및 런 재병합 확인
      const statsA = peerA.compactConfirmedEpoch({ "artist-a": 999, "editor-b": 999 });
      const statsB = peerB.compactConfirmedEpoch({ "artist-a": 999, "editor-b": 999 });
      expect(peerA.getTombstoneRunCount()).toBe(0);
      expect(peerB.getTombstoneRunCount()).toBe(0);
      expect(statsA.purgedTombstoneRuns).toBeGreaterThan(0);
      expect(statsA.metadataReductionRatioVsPerChar).toBeGreaterThan(0.8);
      expect(statsB.activeCharacterLength).toBe(peerA.toString().length);
    });

    it("무서버 ECDH/HKDF/AES-256-GCM 봉투와 도메인 분리 SHA-256 머클 트리로 P2P 컷 무결성을 검증한다", async () => {
      // FIPS 180-4 "abc" 표준 벡터 검증
      const abcHex = bytesToHex(sha256Bytes(new TextEncoder().encode("abc")));
      expect(abcHex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

      const cutPayload = new Uint8Array(1024);
      for (let i = 0; i < cutPayload.length; i += 1) cutPayload[i] = (i * 37 + 13) & 0xff;
      const merkleBundle = buildCutMerkleTree("ep12-cut04", cutPayload, 256);
      expect(merkleBundle.tiles.length).toBe(4);
      expect(verifyCutTileMerkleProof(merkleBundle.tiles[2]!, merkleBundle.proofs[2]!, merkleBundle.merkleRootHex)).toBe(true);

      const alice = await generateP2pPeerIdentity("alice-author");
      const bob = await generateP2pPeerIdentity("bob-assistant");
      const roomId = "room-ep12-collab";
      const aliceKey = await deriveP2pAesGcmSessionKey(alice, bob.ecdhPublicRaw, roomId);
      const bobKey = await deriveP2pAesGcmSessionKey(bob, alice.ecdhPublicRaw, roomId);

      const aliceChan = new ServerlessP2pCutVerifierChannel(roomId, alice, aliceKey);
      const bobChan = new ServerlessP2pCutVerifierChannel(roomId, bob, bobKey);

      const attestation = await aliceChan.signCutAttestation(merkleBundle, cutPayload.byteLength);
      expect(await bobChan.verifyCutAttestation(attestation, alice.ecdsaPublicRaw)).toBe(true);

      const env0 = await aliceChan.sealCutTile(merkleBundle, 0);
      expect(env0.relayServerCostKrw).toBe(0);
      const opened0 = await bobChan.openAndVerifyCutTile(env0, attestation.merkleRootHex);
      expect(opened0.ok).toBe(true);
      expect(Array.from(opened0.tileBytes!)).toEqual(Array.from(merkleBundle.tiles[0]!));

      // 재전송(Replay) 공격 차단 검증
      const replayed = await bobChan.openAndVerifyCutTile(env0, attestation.merkleRootHex);
      expect(replayed.ok).toBe(false);
      expect(replayed.failureReason).toBe("replay-detected");

      // 암호문 1비트 변조 시 AES-GCM 인증 실패 검증
      const env1 = await aliceChan.sealCutTile(merkleBundle, 1);
      const tamperedCt = new Uint8Array(env1.ciphertextWithTag);
      tamperedCt[0] ^= 0x01;
      const tamperedRes = await bobChan.openAndVerifyCutTile({ ...env1, ciphertextWithTag: tamperedCt }, attestation.merkleRootHex);
      expect(tamperedRes.ok).toBe(false);
      expect(tamperedRes.failureReason).toBe("aead-auth-failed");
    });

    it("바로크 대각선·빈 피사체 폴백 및 memory.grow 명령어 정적 차단을 검증한다", () => {
      const actionReport = analyzeCinematographyComposition({
        frameWidthPx: 1000,
        frameHeightPx: 1400,
        horizonAngleDeg: 6.4,
        targetMood: "dynamic-action",
        subjects: [],
      });
      expect(actionReport.selectedSymmetry).toBe("baroque-diagonal");
      expect(Number.isInteger(actionReport.recommendedRollDeltaDeg)).toBe(true);

      const growWasm = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        0x01, 4, 1, 0x60, 0, 0,
        0x03, 2, 1, 0x00,
        0x05, 4, 1, 0x01, 1, 2,
        0x0a, 9, 1, 7, 0, 0x41, 1, 0x40, 0x00, 0x1a, 0x0b, // i32.const 1; memory.grow; drop; end
      ]);
      const check = inspectAndValidateWasmPluginBinary(growWasm, {
        maxBinaryBytes: 64,
        maxMemoryPages: 2,
        fuelBudget: 1000,
        allowedCapabilities: [],
      });
      expect(check.valid).toBe(false);
      expect(check.issues.map((i) => i.code)).toContain("forbidden-memory-grow-opcode");
    });

    it("기준표 없는 순수 표본 MAD 이상치 탐지와 600 DPI 최대 픽셀 타일 상한을 검증한다", () => {
      const unanchored = detectMultiEpisodeAnthropometricDrift([
        { characterId: "sub-char", episodeNumber: 1, cutId: "c1", ratios: { headToBodyRatio: 6.8, shoulderToHeadWidthRatio: 2.3, interPupillaryToFaceWidthRatio: 0.45, eyeToChinRatio: 0.5, lowerBodyToHeightRatio: 0.53 } },
        { characterId: "sub-char", episodeNumber: 2, cutId: "c2", ratios: { headToBodyRatio: 6.85, shoulderToHeadWidthRatio: 2.32, interPupillaryToFaceWidthRatio: 0.45, eyeToChinRatio: 0.5, lowerBodyToHeightRatio: 0.53 } },
        { characterId: "sub-char", episodeNumber: 3, cutId: "c3", ratios: { headToBodyRatio: 6.78, shoulderToHeadWidthRatio: 2.29, interPupillaryToFaceWidthRatio: 0.45, eyeToChinRatio: 0.5, lowerBodyToHeightRatio: 0.53 } },
        { characterId: "sub-char", episodeNumber: 4, cutId: "c4-bad", ratios: { headToBodyRatio: 8.1, shoulderToHeadWidthRatio: 2.3, interPupillaryToFaceWidthRatio: 0.45, eyeToChinRatio: 0.5, lowerBodyToHeightRatio: 0.53 } },
      ]);
      expect(unanchored.offModelCutCount).toBe(1);
      expect(unanchored.cutFindings[3]?.status).toBe("off-model");

      const tinySrc = new Uint8ClampedArray(20 * 16 * 4).fill(210);
      const capped600 = remasterLowDpiWebtoonCut({
        rgbaInput: tinySrc, width: 20, height: 16, sourceDpi: 72, targetDpi: 600, maxOutputDimensionPx: 80,
      });
      expect(capped600.outputWidth).toBe(80);
      expect(capped600.outputHeight).toBe(64);
    });

    it("비정수 4×4 경계(53×47) 코드북 코덱, 3자 역순·중복 CRDT 수렴, 홀수 타일 머클·타방 차단을 검증한다", async () => {
      const oddW = 53; const oddH = 47;
      const oddTex = new Uint8ClampedArray(oddW * oddH * 4);
      for (let y = 0; y < oddH; y += 1) {
        for (let x = 0; x < oddW; x += 1) {
          const p = (y * oddW + x) * 4;
          oddTex[p] = 180 + (x % 16); oddTex[p + 1] = 140 + (y % 16); oddTex[p + 2] = 160; oddTex[p + 3] = 255;
        }
      }
      const oddMetrics = evaluateLatentCodebookRoundtrip(oddTex, { width: oddW, height: oddH });
      expect(oddMetrics.decodedRgba.length).toBe(oddW * oddH * 4);
      expect(oddMetrics.psnrDb).toBeGreaterThan(38);

      // 3자 복제본 역순 + 중복 전송 멱등 수렴
      const r1 = new RunCoalescedSequenceCrdt("p1");
      const r2 = new RunCoalescedSequenceCrdt("p2");
      const r3 = new RunCoalescedSequenceCrdt("p3");
      const op1 = r1.insertLocal(0, "컷1-배경");
      const op2 = r2.insertLocal(0, "컷1-인물");
      const op3 = r3.insertLocal(0, "컷1-효과음");
      for (const op of [op3, op2, op1, op2]) if (op) { r1.applyOperation(op); r2.applyOperation(op); r3.applyOperation(op); }
      expect(r1.toString()).toBe(r2.toString());
      expect(r2.toString()).toBe(r3.toString());

      // 홀수(5개) 타일 머클 증명 및 다른 방(Room) 접근 차단
      const fiveTileData = new Uint8Array(300).fill(91);
      const fiveBundle = buildCutMerkleTree("odd-cut", fiveTileData, 64);
      expect(fiveBundle.tiles.length).toBe(5);
      expect(verifyCutTileMerkleProof(fiveBundle.tiles[4]!, fiveBundle.proofs[4]!, fiveBundle.merkleRootHex)).toBe(true);

      const pA = await generateP2pPeerIdentity("pA");
      const pB = await generateP2pPeerIdentity("pB");
      const kA = await deriveP2pAesGcmSessionKey(pA, pB.ecdhPublicRaw, "room-alpha");
      const kWrong = await deriveP2pAesGcmSessionKey(pB, pA.ecdhPublicRaw, "room-beta");
      const chanA = new ServerlessP2pCutVerifierChannel("room-alpha", pA, kA);
      const chanWrongRoom = new ServerlessP2pCutVerifierChannel("room-beta", pB, kWrong);
      const sealedLast = await chanA.sealCutTile(fiveBundle, 4);
      const wrongRoomRes = await chanWrongRoom.openAndVerifyCutTile(sealedLast, fiveBundle.merkleRootHex);
      expect(wrongRoomRes.ok).toBe(false);
      expect(wrongRoomRes.failureReason).toBe("room-mismatch");
    });
  });
});
