import { describe, expect, it } from "vitest";
import {
  ArtistStyleProfiler,
  composeSemanticSceneOffline,
  computeRgbaPsnrDb,
  ContextAwarePriorityCrdt,
  decodeWatermarkPayload64,
  decodeXorRle,
  encodeWatermarkPayload64,
  encodeXorRle,
  extractInvisibleWatermarkCpu,
  healMeshTopologyAndNormals,
  imprintInvisibleWatermarkCpu,
  inspectMeshTopologyDefects,
  MAX_DATACHANNEL_FRAME_BYTES,
  MIN_IMPERCEPTIBLE_PSNR_DB,
  simulateLossyPerturbation,
  srgbToOklch,
  validateWatermarkWgslSource,
  WebGpuWatermarkImprinter,
  WGSL_INVISIBLE_WATERMARK_IMPRINT,
  ZeroLagDevicePairingSession,
  type PriorityCrdtOp,
  type RawTriangleMesh,
} from "./index";

/** 결정론적 합성 웹툰 원고 RGBA 타일 생성(종이 톤 + 선화 + 컬러 셰이딩 + 그래디언트). */
function createSyntheticManuscriptTile(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      // 따뜻한 종이 배경 + 완만한 조명 그래디언트
      let r = 212 + Math.round(18 * Math.sin((x / width) * Math.PI));
      let g = 204 + Math.round(16 * Math.cos((y / height) * Math.PI));
      let b = 192 + Math.round(14 * Math.sin(((x + y) / (width + height)) * Math.PI));

      // 캐릭터 실루엣 채색 영역
      const dx = x - width * 0.5;
      const dy = y - height * 0.52;
      const dist = Math.hypot(dx, dy);
      if (dist < width * 0.28) {
        r = 78 + Math.round((dx + width * 0.3) * 0.5);
        g = 112 + Math.round((dy + height * 0.3) * 0.4);
        b = 168;
      }
      // 펜 윤곽선
      if (Math.abs(dist - width * 0.28) < 1.8 || (x % 32 === 5 && y > 12 && y < height - 12)) {
        r = 26;
        g = 28;
        b = 34;
      }

      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 255;
    }
  }
  return rgba;
}

/** 얇은 펜선 + 밝은 하이키 파스텔 화풍 타일 생성. */
function createDelicateHighKeyTile(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      // 밝은 살구/연하늘 파스텔
      let r = x < width / 2 ? 244 : 216;
      let g = x < width / 2 ? 228 : 234;
      let b = x < width / 2 ? 214 : 246;
      // 1px 극세선 윤곽선
      if (x === 24 || x === 72 || y === 32 || y === 88) {
        r = 34;
        g = 32;
        b = 36;
      }
      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 255;
    }
  }
  return rgba;
}

/** 굵은 G펜 먹선 + 깊은 먹그림자 + 45도 스크린톤 망점 화풍 타일 생성. */
function createBoldNoirScreentoneTile(width: number, height: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const off = (y * width + x) * 4;
      // 기본 밝은 원고지
      let r = 232;
      let g = 230;
      let b = 226;

      // 상단 좌측 대면적 느와르 먹그림자 (36x56 영역 -> 대면적 먹칠)
      if (x < 46 && y < 74) {
        r = 16;
        g = 18;
        b = 22;
      } else if (x >= 46) {
        // 우측 스크린톤 2px 체커보드 하프톤 망점
        const dot = ((x + y) & 1) === 0;
        const v = dot ? 42 : 215;
        r = v;
        g = v;
        b = v;
      }

      // 6px 굵은 먹선 스트로크
      if ((y >= 84 && y < 90) || (x >= 58 && x < 64 && y < 78)) {
        r = 14;
        g = 14;
        b = 18;
      }

      rgba[off] = r;
      rgba[off + 1] = g;
      rgba[off + 2] = b;
      rgba[off + 3] = 255;
    }
  }
  return rgba;
}

/** 결함 5종(중복 정점, 0면적 퇴화면, 와인딩 반전, 누락된 윗면 구멍, 반전 법선)이 주입된 오염 큐브. */
function createDirtyUnitCubeWithHole(): RawTriangleMesh {
  // 기본 단위 정육면체 [0, 1]^3의 8개 코너
  const baseCorners: readonly (readonly [number, number, number])[] = [
    [0, 0, 0], // 0
    [1, 0, 0], // 1
    [1, 1, 0], // 2
    [0, 1, 0], // 3
    [0, 0, 1], // 4
    [1, 0, 1], // 5
    [1, 1, 1], // 6
    [0, 1, 1], // 7
  ];

  // 윗면(y=1: 3-2-6-7)을 의도적으로 누락시켜 4변 경계 구멍 생성.
  // 또한 일부 면을 의도적으로 뒤집고 전체적으로 안쪽을 보게 섞음.
  const faceDefs: readonly (readonly [number, number, number])[] = [
    // 바닥면 (y=0) - 한 삼각형은 뒤집힘
    [0, 1, 5],
    [0, 4, 5], // 의도적 와인딩 불일치
    // 앞면 (z=1) - 안쪽 방향
    [4, 6, 5],
    [4, 7, 6],
    // 뒷면 (z=0) - 뒤섞임
    [0, 3, 2],
    [0, 1, 2], // 의도적 와인딩 불일치
    // 왼쪽면 (x=0)
    [0, 4, 7],
    [0, 7, 3],
    // 오른쪽면 (x=1)
    [1, 2, 6],
    [1, 6, 5],
  ];

  const pos: number[] = [];
  const idx: number[] = [];
  const norm: number[] = [];

  // 모든 삼각형 코너를 개별 정점으로 복제(+ 미세 지터 1e-5)해 중복 정점 다량 주입
  let jitterSign = 1;
  for (let f = 0; f < faceDefs.length; f += 1) {
    const [a, b, c] = faceDefs[f];
    const verts: readonly number[] = [a, b, c];
    for (let k = 0; k < 3; k += 1) {
      const corner = baseCorners[verts[k]];
      const eps = f === 0 ? 0 : jitterSign * 1.5e-5;
      jitterSign = -jitterSign;
      const vi = Math.floor(pos.length / 3);
      pos.push(corner[0] + eps, corner[1] - eps, corner[2] + eps);
      idx.push(vi);
      // 의도적으로 안쪽을 향하는 반전 법선 주입
      norm.push(0.5 - corner[0], 0.5 - corner[1], 0.5 - corner[2]);
    }
  }

  // 퇴화 삼각형 2개 추가: (1) 동일 정점 붕괴, (2) 일직선 0면적 슬리버
  const d0 = Math.floor(pos.length / 3);
  pos.push(0.2, 0.2, 0.2, 0.5, 0.2, 0.2, 0.8, 0.2, 0.2);
  norm.push(0, 0, 0, 0, 0, 0, 0, 0, 0);
  idx.push(0, 0, 1); // 동일 인덱스 퇴화
  idx.push(d0, d0 + 1, d0 + 2); // 공선(collinear) 0면적 퇴화
  // 중복 삼각형 1개 추가
  idx.push(idx[0], idx[1], idx[2]);

  return {
    positions: new Float32Array(pos),
    indices: new Uint32Array(idx),
    normals: new Float32Array(norm),
  };
}

describe("1. WebGPU 비가시성 암호화 시각 워터마크 각인·추출기", () => {
  it("64비트 페이로드(작가 ID + 원고 다이제스트 + 키드 CRC-16) 인코딩·디코딩 및 위변조 탐지", () => {
    const encoded = encodeWatermarkPayload64({
      creatorId: "creator-hana-kim-2026",
      manuscriptDigest: "ep014-cut032-sha256-9f8e7d6c5b4a",
      secretKey: "studio-master-hmac-key-2026",
    });

    expect(encoded.maskedBytes.length).toBe(8);
    expect(encoded.creatorTagHex).toHaveLength(6);
    expect(encoded.manuscriptDigestHex).toHaveLength(6);

    const decoded = decodeWatermarkPayload64(encoded.maskedBytes, "studio-master-hmac-key-2026");
    expect(decoded.crcValid).toBe(true);
    expect(decoded.creatorTagHex).toBe(encoded.creatorTagHex);
    expect(decoded.manuscriptDigestHex).toBe(encoded.manuscriptDigestHex);

    // 단일 비트 위변조 시 CRC-16 거부
    const tampered = new Uint8Array(encoded.maskedBytes);
    tampered[2] ^= 0x04;
    const tamperedDecoded = decodeWatermarkPayload64(tampered, "studio-master-hmac-key-2026");
    expect(tamperedDecoded.crcValid).toBe(false);

    // 오키(wrong key) 복호화 시 CRC-16 거부
    const wrongKeyDecoded = decodeWatermarkPayload64(encoded.maskedBytes, "forged-wrong-key");
    expect(wrongKeyDecoded.crcValid).toBe(false);
  });

  it("WGSL 컴퓨트 셰이더 구조 검증 및 WebGpuWatermarkImprinter 폴백 동작 확인", () => {
    const report = validateWatermarkWgslSource(WGSL_INVISIBLE_WATERMARK_IMPRINT);
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
    expect(report.workgroupSize).toEqual([8, 8, 1]);

    const badReport = validateWatermarkWgslSource("fn broken() {");
    expect(badReport.valid).toBe(false);
    expect(badReport.issues.length).toBeGreaterThan(0);

    let compiledLabel = "";
    const mockDevice = {
      label: "mock-webgpu-adapter",
      createShaderModule(desc: { code: string; label?: string }): unknown {
        compiledLabel = desc.label ?? "";
        return { compiled: desc.code.length > 100 };
      },
    };
    const imprinter = new WebGpuWatermarkImprinter(mockDevice);
    expect(imprinter.hasGpuDevice).toBe(true);
    expect(imprinter.ensureShaderModule()).toBe(true);
    expect(compiledLabel).toBe("toonstudio-invisible-watermark-qim-imprint");
  });

  it("PSNR >= 42 dB 비가시성 충족 + 손실 양자화·밝기 이동·가산 잡음 이후 100% 비트 복원 + 오키 거부", () => {
    const width = 128;
    const height = 128;
    const manuscript = createSyntheticManuscriptTile(width, height);
    const secretKey = "toonstudio-creator-defense-secret-2026";
    const creatorId = "artist-minseo-lee";
    const manuscriptDigest = "series-shadow-rain-ep07-panel19";

    const imprinted = imprintInvisibleWatermarkCpu(manuscript, width, height, {
      creatorId,
      manuscriptDigest,
      secretKey,
    });

    // 1. 비가시성(PSNR >= 42 dB) 검증
    const directQuality = computeRgbaPsnrDb(manuscript, imprinted.watermarkedRgba);
    expect(imprinted.psnrDb).toBeCloseTo(directQuality.psnrDb, 5);
    expect(imprinted.psnrDb).toBeGreaterThanOrEqual(MIN_IMPERCEPTIBLE_PSNR_DB);
    expect(imprinted.maxAbsChannelDelta).toBeLessThanOrEqual(6);
    expect(imprinted.embeddedBlocks).toBe(256);

    // 2. 무손실 타일 100% 비트-정확 복원
    const cleanExtracted = extractInvisibleWatermarkCpu(imprinted.watermarkedRgba, width, height, {
      secretKey,
      expectedCreatorId: creatorId,
      expectedManuscriptDigest: manuscriptDigest,
    });
    expect(cleanExtracted.verified).toBe(true);
    expect(cleanExtracted.crcValid).toBe(true);
    expect(cleanExtracted.creatorMatches).toBe(true);
    expect(cleanExtracted.digestMatches).toBe(true);
    expect(cleanExtracted.creatorTagHex).toBe(imprinted.payload.creatorTagHex);
    expect(cleanExtracted.manuscriptDigestHex).toBe(imprinted.payload.manuscriptDigestHex);
    expect(Array.from(cleanExtracted.payloadBytes)).toEqual(
      Array.from(imprinted.payload.plainBytes),
    );
    expect(cleanExtracted.confidence).toBeGreaterThan(0.75);

    // 3. 손실 양자화(step=4) + 균일 밝기 이동(+7) + 가산 잡음(±3) 복합 섭동 후 100% 비트 복원
    const attacked = simulateLossyPerturbation(imprinted.watermarkedRgba, width, height, {
      quantizationStep: 4,
      brightnessOffset: 7,
      noiseAmplitude: 3,
      seed: 0x12345678,
    });
    const survived = extractInvisibleWatermarkCpu(attacked, width, height, {
      secretKey,
      expectedCreatorId: creatorId,
      expectedManuscriptDigest: manuscriptDigest,
    });
    expect(survived.verified).toBe(true);
    expect(survived.crcValid).toBe(true);
    expect(Array.from(survived.payloadBytes)).toEqual(Array.from(imprinted.payload.plainBytes));

    // 4. 오키(wrong key) & 위조 기대 작가 검증 차단
    const wrongKey = extractInvisibleWatermarkCpu(imprinted.watermarkedRgba, width, height, {
      secretKey: "attacker-wrong-key",
    });
    expect(wrongKey.verified).toBe(false);
    expect(wrongKey.crcValid).toBe(false);

    const forgedCreatorCheck = extractInvisibleWatermarkCpu(
      imprinted.watermarkedRgba,
      width,
      height,
      {
        secretKey,
        expectedCreatorId: "impostor-creator-id",
      },
    );
    expect(forgedCreatorCheck.verified).toBe(false);
    expect(forgedCreatorCheck.creatorMatches).toBe(false);

    // 5. 워터마크 미각인 원본 타일은 거부
    const rawCheck = extractInvisibleWatermarkCpu(manuscript, width, height, { secretKey });
    expect(rawCheck.verified).toBe(false);
  });
});

describe("2. 제로-토큰 작가 화풍 프로파일러 & ₩0 저지연 PC↔태블릿 컴패니언 페어링", () => {
  it("ArtistStyleProfiler: AI 토큰 0개로 상반된 두 작가의 선 굵기·OKLCH 팔레트·명암·스크린톤·프리셋 구분", () => {
    const sampleOklch = srgbToOklch(31, 68, 53);
    expect(sampleOklch.l).toBeGreaterThan(0.2);
    expect(sampleOklch.l).toBeLessThan(0.5);
    expect(sampleOklch.c).toBeGreaterThan(0.03);

    const delicateProfiler = new ArtistStyleProfiler();
    delicateProfiler.addManuscriptTile(createDelicateHighKeyTile(96, 96), 96, 96);
    const delicatePreset = delicateProfiler.emitStylePreset("dialogue");

    const noirProfiler = new ArtistStyleProfiler();
    noirProfiler.addManuscriptTile(createBoldNoirScreentoneTile(96, 96), 96, 96);
    const noirPreset = noirProfiler.emitStylePreset("action");

    expect(delicatePreset.tokenCost).toBe(0);
    expect(noirPreset.tokenCost).toBe(0);

    // 선 굵기·화풍 분별
    expect(delicatePreset.profile.lineStyle).toBe("delicate-pen");
    expect(noirPreset.profile.lineStyle).toBe("bold-ink");
    expect(noirPreset.profile.estimatedStrokeWidthPx).toBeGreaterThan(
      delicatePreset.profile.estimatedStrokeWidthPx * 2.5,
    );
    expect(noirPreset.brushPreset.baseSizePx).toBeGreaterThan(
      delicatePreset.brushPreset.baseSizePx * 2.5,
    );

    // 명암 대비 커브 및 조명 프리셋 분별
    expect(delicatePreset.profile.contrastCurve.mood).toBe("high-key");
    expect(delicatePreset.lightingPreset.ambientFill).toBeGreaterThan(
      noirPreset.lightingPreset.ambientFill,
    );
    expect(noirPreset.profile.contrastCurve.shadowRatio).toBeGreaterThan(
      delicatePreset.profile.contrastCurve.shadowRatio,
    );

    // 스크린톤 밀도 분별
    expect(noirPreset.profile.screentoneDensity).toBeGreaterThan(0.25);
    expect(delicatePreset.profile.screentoneDensity).toBeLessThan(0.05);
    expect(noirPreset.profile.estimatedScreentoneLpi).toBeGreaterThan(0);

    // OKLCH 대표 팔레트 유효성 검증
    expect(delicatePreset.profile.dominantOklch.length).toBeGreaterThanOrEqual(2);
    expect(delicatePreset.profile.dominantOklch[0].oklchCss).toMatch(/^oklch\(/);
    const weightSum = delicatePreset.profile.dominantOklch.reduce((acc, s) => acc + s.weight, 0);
    expect(weightSum).toBeCloseTo(1, 3);
  });

  it("ZeroLagDevicePairingSession: 6자리 SAS 핸드셰이크, <=16KiB XOR+RLE 더티타일 미러링, 스타일러스 릴레이", () => {
    // 순수 XOR+RLE 코덱 무손실 왕복 검증
    const prevBuf = new Uint8Array(256).fill(40);
    const currBuf = new Uint8Array(256).fill(40);
    for (let i = 30; i < 62; i += 1) currBuf[i] = (i * 13) & 0xff;
    const packed = encodeXorRle(prevBuf, currBuf);
    expect(packed.length).toBeLessThan(currBuf.length / 2);
    expect(Array.from(decodeXorRle(prevBuf, packed, 256))).toEqual(Array.from(currBuf));

    // 1. 6자리 SAS 페어링 핸드셰이크
    const pcHost = new ZeroLagDevicePairingSession({
      role: "pc-host",
      deviceId: "macbook-studio-host",
      canvasWidth: 128,
      canvasHeight: 128,
      tileSize: 32,
    });
    const tablet = new ZeroLagDevicePairingSession({
      role: "tablet-companion",
      deviceId: "ipad-pro-companion",
      canvasWidth: 128,
      canvasHeight: 128,
      tileSize: 32,
    });

    const offer = pcHost.createPairingOffer(2026);
    const answer = tablet.acceptPairingOffer(offer, 9001);
    const hostSas = pcHost.completeHandshakeFromAnswer(answer);

    expect(hostSas).toMatch(/^\d{6}$/);
    expect(hostSas).toBe(answer.sasCode);

    // 오입력 SAS 거부 확인(별도 세션)
    const rogueTablet = new ZeroLagDevicePairingSession({
      role: "tablet-companion",
      deviceId: "rogue-device",
      canvasWidth: 128,
      canvasHeight: 128,
    });
    rogueTablet.acceptPairingOffer(offer, 77);
    expect(rogueTablet.confirmSasCode("000000" === rogueTablet.sasCode ? "999999" : "000000")).toBe(
      false,
    );
    expect(rogueTablet.pairingState).toBe("rejected");

    // 정상 SAS 확정
    expect(pcHost.confirmSasCode(hostSas)).toBe(true);
    expect(tablet.confirmSasCode(answer.sasCode)).toBe(true);
    expect(pcHost.pairingState).toBe("paired");
    expect(tablet.pairingState).toBe("paired");

    // 2. 초기 전체 프레임 미러링 (<= 16 KiB 보장 + 비트-정확 복원)
    const canvas = createSyntheticManuscriptTile(128, 128);
    const firstBatch = pcHost.encodeDirtyMirrorFrames(canvas);
    expect(firstBatch.dirtyTileCount).toBe(16);
    expect(firstBatch.maxFrameBytes).toBeLessThanOrEqual(MAX_DATACHANNEL_FRAME_BYTES);
    for (const frame of firstBatch.frames) {
      expect(frame.byteLength).toBeLessThanOrEqual(MAX_DATACHANNEL_FRAME_BYTES);
      const report = tablet.receiveMirrorFrame(frame);
      expect(report.completedTile).toBe(true);
    }
    expect(Array.from(tablet.getMirroredFramebuffer())).toEqual(Array.from(canvas));

    // 3. 국소 브러시 스트로크 갱신 -> 더티 타일 1장만 증분 전송 및 높은 압축률
    const updatedCanvas = new Uint8ClampedArray(canvas);
    for (let y = 8; y < 20; y += 1) {
      for (let x = 10; x < 22; x += 1) {
        const off = (y * 128 + x) * 4;
        updatedCanvas[off] = 24;
        updatedCanvas[off + 1] = 26;
        updatedCanvas[off + 2] = 30;
      }
    }
    const deltaBatch = pcHost.encodeDirtyMirrorFrames(updatedCanvas);
    expect(deltaBatch.dirtyTileCount).toBe(1);
    expect(deltaBatch.totalTileCount).toBe(16);
    expect(deltaBatch.maxFrameBytes).toBeLessThanOrEqual(MAX_DATACHANNEL_FRAME_BYTES);
    expect(deltaBatch.compressionRatio).toBeGreaterThan(2.0);
    for (const frame of deltaBatch.frames) {
      tablet.receiveMirrorFrame(frame);
    }
    expect(Array.from(tablet.getMirroredFramebuffer())).toEqual(Array.from(updatedCanvas));

    // 4. 고엔트로피 대형 단일 타일(128x128 = 64 KiB) 자동 멀티청크 분할(모든 청크 <= 16 KiB)
    const bigHost = new ZeroLagDevicePairingSession({
      role: "pc-host",
      deviceId: "big-host",
      canvasWidth: 128,
      canvasHeight: 128,
      tileSize: 128,
    });
    const bigTab = new ZeroLagDevicePairingSession({
      role: "tablet-companion",
      deviceId: "big-tab",
      canvasWidth: 128,
      canvasHeight: 128,
      tileSize: 128,
    });
    const bigOffer = bigHost.createPairingOffer(3);
    const bigAns = bigTab.acceptPairingOffer(bigOffer, 4);
    const bigSas = bigHost.completeHandshakeFromAnswer(bigAns);
    bigHost.confirmSasCode(bigSas);
    bigTab.confirmSasCode(bigSas);

    const noisyCanvas = new Uint8ClampedArray(128 * 128 * 4);
    for (let i = 0; i < noisyCanvas.length; i += 1) {
      noisyCanvas[i] = (Math.imul(i + 1, 2654435761) >>> 24) & 0xff;
    }
    const chunkedBatch = bigHost.encodeDirtyMirrorFrames(noisyCanvas);
    expect(chunkedBatch.frames.length).toBeGreaterThan(1);
    expect(chunkedBatch.maxFrameBytes).toBeLessThanOrEqual(MAX_DATACHANNEL_FRAME_BYTES);
    for (const frame of chunkedBatch.frames) {
      bigTab.receiveMirrorFrame(frame);
    }
    expect(Array.from(bigTab.getMirroredFramebuffer())).toEqual(Array.from(noisyCanvas));

    // 5. 태블릿 → PC 저지연 스타일러스 입력 릴레이 + 변조 패킷 거부
    const packet = tablet.encodeCompanionInput({
      type: "move",
      pointerId: 7,
      xNorm: 0.75,
      yNorm: 0.25,
      pressure: 0.82,
      tiltXDeg: -14.5,
      tiltYDeg: 22.25,
      twistDeg: 135.5,
      clientTimestampUs: 120000,
    });
    expect(packet.byteLength).toBe(28);

    const relayed = pcHost.receiveCompanionInput(packet, 121800);
    expect(relayed.type).toBe("move");
    expect(relayed.pointerId).toBe(7);
    expect(relayed.canvasX).toBeCloseTo(96, 1);
    expect(relayed.canvasY).toBeCloseTo(32, 1);
    expect(relayed.pressure).toBeCloseTo(0.82, 3);
    expect(relayed.tiltXDeg).toBeCloseTo(-14.5, 2);
    expect(relayed.tiltYDeg).toBeCloseTo(22.25, 2);
    expect(relayed.twistDeg).toBeCloseTo(135.5, 2);
    expect(relayed.relayLatencyMs).toBeCloseTo(1.8, 1);

    const corruptPacket = new Uint8Array(packet);
    corruptPacket[10] ^= 0xff;
    expect(() => pcHost.receiveCompanionInput(corruptPacket)).toThrow(/CRC-16/);
  });
});

describe("3. 자동 3D 메시 토폴로지·법선 치유기", () => {
  it("중복 정점·0면적 퇴화면·와인딩 반전·경계 구멍·반전 법선을 모두 0결함 수밀 솔리드로 치유", () => {
    const dirtyCube = createDirtyUnitCubeWithHole();
    const beforeAudit = inspectMeshTopologyDefects(dirtyCube);

    expect(beforeAudit.duplicateVertexCount).toBeGreaterThan(0);
    expect(beforeAudit.degenerateTriangleCount).toBeGreaterThanOrEqual(2);
    expect(beforeAudit.invertedNormalCount).toBeGreaterThan(0);
    expect(beforeAudit.isWatertightManifold).toBe(false);

    const healed = healMeshTopologyAndNormals(dirtyCube, {
      weldEpsilon: 1e-4,
      fillBoundaryHoles: true,
      shadingMode: "smooth",
    });

    expect(healed.summary.weldedVertexCount).toBeGreaterThan(15);
    expect(healed.summary.removedDegenerateFaces).toBeGreaterThanOrEqual(2);
    expect(healed.summary.removedDuplicateFaces).toBeGreaterThanOrEqual(1);
    expect(healed.summary.flippedWindingFaces).toBeGreaterThan(0);
    expect(healed.summary.filledHoleCount).toBe(1);
    expect(healed.summary.addedCapTriangles).toBe(4); // 사각 구멍 중심 팬 4삼각형

    // 치유 후 모든 토폴로지·법선 결함 0건 + 단위 큐브 외향 부피(+1.0)
    expect(healed.after.duplicateVertexCount).toBe(0);
    expect(healed.after.degenerateTriangleCount).toBe(0);
    expect(healed.after.inconsistentWindingEdgeCount).toBe(0);
    expect(healed.after.boundaryEdgeCount).toBe(0);
    expect(healed.after.nonManifoldEdgeCount).toBe(0);
    expect(healed.after.invertedNormalCount).toBe(0);
    expect(healed.after.signedVolume).toBeCloseTo(1.0, 3);
    expect(healed.after.isWatertightManifold).toBe(true);

    // 모든 재계산 법선이 단위 벡터인지 확인
    const vCount = healed.mesh.normals.length / 3;
    for (let v = 0; v < vCount; v += 1) {
      const len = Math.hypot(
        healed.mesh.normals[v * 3],
        healed.mesh.normals[v * 3 + 1],
        healed.mesh.normals[v * 3 + 2],
      );
      expect(len).toBeCloseTo(1.0, 5);
    }

    // 하드 셰이딩 모드에서도 퇴화면 0 · 반전 법선 0
    const hardHealed = healMeshTopologyAndNormals(dirtyCube, {
      weldEpsilon: 1e-4,
      fillBoundaryHoles: true,
      shadingMode: "hard",
    });
    expect(hardHealed.after.degenerateTriangleCount).toBe(0);
    expect(hardHealed.after.invertedNormalCount).toBe(0);
    expect(hardHealed.after.signedVolume).toBeCloseTo(1.0, 3);
  });
});

describe("4. 온디바이스 1줄 시맨틱 씬 컴포저 & 컨텍스트 인식 우선순위 CRDT", () => {
  it("한국어·영어 1줄 프롬프트를 AI 토큰 0개로 구조화된 3D 스테이지·조명·카메라·에셋으로 변환", () => {
    const noirScene = composeSemanticSceneOffline(
      "비 오는 네온 골목길에서 우산 쓴 주인공을 로우앵글로 비추는 느와르 컷",
    );
    expect(noirScene.tokenCost).toBe(0);
    expect(noirScene.localeDetected).toBe("ko");
    expect(noirScene.stageId).toBe("alley-cyberpunk");
    expect(noirScene.weather).toBe("rain");
    expect(noirScene.timeOfDay).toBe("night");
    expect(noirScene.camera.angle).toBe("low-angle");
    expect(noirScene.camera.position[1]).toBeLessThan(1.0);
    expect(noirScene.lights.some((l) => l.role === "neon-accent")).toBe(true);
    expect(noirScene.assets.some((a) => a.assetType === "umbrella-open")).toBe(true);
    expect(noirScene.assets.some((a) => a.assetType === "rain-streak-sheet")).toBe(true);
    // 모든 배치 에셋이 Y=0 바닥 접지 규약을 준수
    for (const asset of noirScene.assets) {
      expect(asset.position[1]).toBe(0);
    }

    const rooftopDuo = composeSemanticSceneOffline(
      "해질녘 학교 옥상에서 마주 선 두 인물, 따뜻한 역광 와이드 샷",
    );
    expect(rooftopDuo.stageId).toBe("rooftop-school");
    expect(rooftopDuo.timeOfDay).toBe("sunset");
    expect(rooftopDuo.camera.shotScale).toBe("wide-shot");
    expect(rooftopDuo.assets.filter((a) => a.category === "actor")).toHaveLength(2);

    const enScene = composeSemanticSceneOffline(
      "foggy forest shrine high-angle establishing shot",
    );
    expect(enScene.localeDetected).toBe("en");
    expect(enScene.stageId).toBe("forest-shrine");
    expect(enScene.weather).toBe("fog");
    expect(enScene.camera.angle).toBe("high-angle");
    expect(enScene.camera.shotScale).toBe("wide-shot");
  });

  it("ContextAwarePriorityCrdt: active-ink-stroke 최우선 스케줄링·충돌 선점 및 3피어 결정론적 수렴", () => {
    const peerA = new ContextAwarePriorityCrdt("peer-artist-a");
    const peerB = new ContextAwarePriorityCrdt("peer-assistant-b");
    const peerC = new ContextAwarePriorityCrdt("peer-director-c");

    // 1. 우선순위 대기열 스케줄링 순서 검증: active-ink-stroke > dialogue-balloon > camera-rail > background-prop
    const bgOp = peerB.createLocalOp({
      entityId: "prop-lamp-01",
      field: "opacity",
      lane: "background-prop",
      value: 0.8,
    });
    const camOp = peerC.createLocalOp({
      entityId: "cut-04-camera",
      field: "fovDeg",
      lane: "camera-rail",
      value: 38,
    });
    const balloonOp = peerB.createLocalOp({
      entityId: "balloon-02",
      field: "text",
      lane: "dialogue-balloon",
      value: "지금 바로 출발해야 해!",
    });
    const inkOp = peerA.createLocalOp({
      entityId: "layer-ink-01",
      field: "strokeHash",
      lane: "active-ink-stroke",
      priorityBoost: 25,
      value: "stroke-99a8b7",
    });

    // 낮은 우선순위부터 의도적으로 역순 적재
    peerA.enqueueOp(bgOp);
    peerA.enqueueOp(camOp);
    peerA.enqueueOp(balloonOp);
    peerA.enqueueOp(inkOp);

    const executedOrder = peerA.drainPriorityQueue();
    expect(executedOrder.map((o) => o.lane)).toEqual([
      "active-ink-stroke",
      "dialogue-balloon",
      "camera-rail",
      "background-prop",
    ]);

    // 2. 동일 엔티티 동시 편집 충돌 시, Lamport 시계가 더 늦은 background-prop보다 active-ink-stroke가 선점 승리
    const lateBgOverride = peerB.createLocalOp({
      entityId: "shared-cut-surface",
      field: "lockOwner",
      lane: "background-prop",
      value: "bg-worker-auto",
    });
    // peerB 시계를 더 전진시켜 높은 Lamport 값 생성
    peerB.createLocalOp({
      entityId: "prop-dummy",
      field: "flag",
      lane: "background-prop",
      value: true,
    });
    const evenLaterBg = peerB.createLocalOp({
      entityId: "shared-cut-surface",
      field: "lockOwner",
      lane: "background-prop",
      value: "bg-worker-late",
    });
    const activeStrokeClaim = peerA.createLocalOp({
      entityId: "shared-cut-surface",
      field: "lockOwner",
      lane: "active-ink-stroke",
      priorityBoost: 30,
      value: "artist-active-pen",
    });
    expect(evenLaterBg.lamport).toBeGreaterThan(activeStrokeClaim.lamport);

    // 3. 3개 피어가 완전히 다른 순열 + 중복 전달로 연산을 수신해도 동일 상태 다이제스트로 수렴
    const allOps: readonly PriorityCrdtOp[] = [
      bgOp,
      camOp,
      balloonOp,
      inkOp,
      lateBgOverride,
      evenLaterBg,
      activeStrokeClaim,
      peerC.createLocalOp({
        entityId: "shared-cut-surface",
        field: "lockOwner",
        lane: "camera-rail",
        value: "camera-pan-lock",
      }),
      peerB.createLocalOp({
        entityId: "balloon-02",
        field: "text",
        lane: "dialogue-balloon",
        value: "빗속에서도 멈추지 마!",
      }),
    ];

    const replica1 = new ContextAwarePriorityCrdt("replica-1");
    const replica2 = new ContextAwarePriorityCrdt("replica-2");
    const replica3 = new ContextAwarePriorityCrdt("replica-3");

    replica1.mergeRemoteOps(allOps);
    replica2.mergeRemoteOps([...allOps].reverse());
    // 순열 + 중복 배달
    const shuffledWithDupes = [
      allOps[4],
      allOps[0],
      allOps[6],
      allOps[6],
      allOps[2],
      allOps[8],
      allOps[1],
      allOps[7],
      allOps[3],
      allOps[5],
      allOps[0],
    ];
    replica3.mergeRemoteOps(shuffledWithDupes);

    const d1 = replica1.computeStateDigest();
    const d2 = replica2.computeStateDigest();
    const d3 = replica3.computeStateDigest();
    expect(d1).toBe(d2);
    expect(d2).toBe(d3);

    // 모든 레플리카에서 active-ink-stroke가 공유 엔티티 충돌의 승자
    expect(replica1.getRegister("shared-cut-surface", "lockOwner")?.value).toBe(
      "artist-active-pen",
    );
    expect(replica2.getRegister("shared-cut-surface", "lockOwner")?.value).toBe(
      "artist-active-pen",
    );
    expect(replica3.getRegister("shared-cut-surface", "lockOwner")?.value).toBe(
      "artist-active-pen",
    );

    const telemetry = replica3.getTelemetry();
    expect(telemetry.deduplicatedOps).toBe(2);
    expect(telemetry.conflictCount).toBeGreaterThanOrEqual(2);
    expect(telemetry.priorityPreemptions).toBeGreaterThanOrEqual(1);
    expect(telemetry.perLaneConflictWins["active-ink-stroke"]).toBeGreaterThanOrEqual(1);
  });
});
