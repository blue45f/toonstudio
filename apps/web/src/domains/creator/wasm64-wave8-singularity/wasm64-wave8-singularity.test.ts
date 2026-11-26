import { describe, expect, it } from "vitest";
import {
  applyFlashMitigationToFrames,
  ARKIT_52_BLENDSHAPE_NAMES,
  auditPhotosensitiveFlashSafety,
  calculateBasisPointPayouts,
  compareVectorClocks,
  computeMeshTotalArea,
  decodeMorton2D,
  decodeMorton3D,
  decomposeHangulSyllable,
  denoiseScanLineArt,
  encodeMorton2D,
  encodeMorton3D,
  estimateContourNormalAndRimLight,
  estimateDebiasedRandomizedFrequencies,
  generateRoyaltySigningKeyPair,
  injectRoyaltySplitManifest,
  LocalDpCreatorTelemetryAnalyzer,
  lookupSubsetGlyphIdBinary,
  morphArapPoseKeyframes,
  solveArapMeshDeformation,
  SpacetimeContinuumEngine,
  SparseMortonTileIndexer,
  subsetEpisodeDialogueGlyphs,
  TOTAL_ROYALTY_BASIS_POINTS,
  verifyEmbeddedRoyaltyManifest,
  VoiceToVrmExpressionAnimator,
  type FlashAuditFrameInput,
  type RoyaltyRecipientShare,
  type TriangleTuple,
  type Vec2Tuple,
} from "./index";

function createSolidFrame(width: number, height: number, r: number, g: number, b: number): FlashAuditFrameInput {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = 255;
  }
  return { width, height, rgba };
}

function createMinimalPngBytes(pixelSeed: number): Uint8Array {
  // PNG signature(8) + IHDR(25) + IDAT(16) + IEND(12) = 61 bytes
  const buf = new Uint8Array(61);
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(buf.buffer);
  // IHDR length 13
  view.setUint32(8, 13, false);
  buf.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 16, false);
  view.setUint32(20, 16, false);
  buf[24] = 8;
  buf[25] = 6;
  view.setUint32(29, 0x1f2d3a4b, false);
  // IDAT length 4
  view.setUint32(33, 4, false);
  buf.set([0x49, 0x44, 0x41, 0x54, pixelSeed & 0xff, 0xaa, 0x55, 0x11], 37);
  view.setUint32(45, 0x778899aa, false);
  // IEND length 0
  view.setUint32(49, 0, false);
  buf.set([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82], 53);
  return buf;
}

describe("Wave 8 Singularity — 1. ARAP 포즈 모핑 · 광과민성 점멸 감사 · 윤곽선 3D 노말/림라이트", () => {
  it("120도 사지 회전 모핑(t = 0.5)에서 선형 보간의 면적 붕괴 없이 강체 면적을 보존한다", () => {
    const sourceVertices: Vec2Tuple[] = [];
    const triangles: TriangleTuple[] = [];
    for (let seg = 0; seg <= 4; seg += 1) {
      sourceVertices.push([seg, 0], [seg, 1]);
      if (seg < 4) {
        const b = seg * 2;
        triangles.push([b, b + 2, b + 1], [b + 1, b + 2, b + 3]);
      }
    }

    const angle = (2 * Math.PI) / 3; // +120 deg
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const targetVertices: Vec2Tuple[] = sourceVertices.map(([x, y]) => [
      cosA * x - sinA * y,
      sinA * x + cosA * y,
    ]);

    const mid = morphArapPoseKeyframes({
      sourceVertices,
      targetVertices,
      triangles,
      t: 0.5,
      weightMode: "cotangent",
    });

    expect(mid.serverCostKrw).toBe(0);
    expect(mid.restTotalArea).toBeCloseTo(4.0, 5);
    // 120도 회전 시 단순 선형 보간은 길이가 cos(60°)=0.5로 줄어 면적이 25%로 붕괴한다.
    expect(mid.linearBlendAreaRatio).toBeLessThan(0.3);
    // ARAP 극분해 모핑은 면적을 100% 보존한다.
    expect(mid.areaRetentionRatio).toBeCloseTo(1.0, 3);

    const deformed = solveArapMeshDeformation({
      restVertices: sourceVertices,
      triangles,
      pins: [
        { vertexIndex: 0, target: [0, 0] },
        { vertexIndex: 8, target: [0, 4] },
      ],
      iterations: 24,
    });
    expect(deformed.vertices[0]![0]).toBeCloseTo(0, 5);
    expect(deformed.vertices[8]![0]).toBeCloseTo(0, 4);
    expect(deformed.vertices[8]![1]).toBeCloseTo(4, 4);
    expect(computeMeshTotalArea(deformed.vertices, triangles)).toBeGreaterThan(3.95);
  });

  it("ITU-R BT.1702 기준 > 3 Hz 휘도·적색 점멸 위험을 탐지하고 자동 감쇠 후 안전 통과시킨다", () => {
    const safeFrames: FlashAuditFrameInput[] = Array.from({ length: 30 }, (_, i) => {
      const v = Math.round(40 + 25 * Math.sin((2 * Math.PI * i) / 30));
      return createSolidFrame(16, 16, v, v, v);
    });
    const safeReport = auditPhotosensitiveFlashSafety(safeFrames, { fps: 30 });
    expect(safeReport.isSafe).toBe(true);
    expect(safeReport.hazardIntervals).toHaveLength(0);

    // 7.5 Hz 고대비 점멸 (어두운 10 nits <-> 밝은 185 nits)
    const strobeFrames: FlashAuditFrameInput[] = Array.from({ length: 32 }, (_, i) =>
      Math.floor(i / 2) % 2 === 0
        ? createSolidFrame(16, 16, 20, 20, 20)
        : createSolidFrame(16, 16, 246, 246, 246),
    );
    const hazardReport = auditPhotosensitiveFlashSafety(strobeFrames, { fps: 32 });
    expect(hazardReport.isSafe).toBe(false);
    expect(hazardReport.hazardIntervals.length).toBeGreaterThanOrEqual(1);
    expect(hazardReport.hazardIntervals[0]!.peakFlashHz).toBeGreaterThan(3);

    const mitigated = applyFlashMitigationToFrames(strobeFrames, hazardReport);
    const reAudit = auditPhotosensitiveFlashSafety(mitigated, { fps: 32 });
    expect(reAudit.isSafe).toBe(true);
    expect(reAudit.hazardIntervals).toHaveLength(0);

    // 등휘도 고채도 적색 점멸 탐지 및 완화 재검증
    const redFlashFrames: FlashAuditFrameInput[] = Array.from({ length: 32 }, (_, i) =>
      Math.floor(i / 2) % 2 === 0
        ? createSolidFrame(16, 16, 255, 0, 0)
        : createSolidFrame(16, 16, 0, 148, 0),
    );
    const redReport = auditPhotosensitiveFlashSafety(redFlashFrames, { fps: 32 });
    expect(redReport.isSafe).toBe(false);
    expect(redReport.hazardIntervals.some((iv) => iv.hasSaturatedRedHazard)).toBe(true);
    const mitigatedRed = applyFlashMitigationToFrames(redFlashFrames, redReport);
    expect(auditPhotosensitiveFlashSafety(mitigatedRed, { fps: 32 }).isSafe).toBe(true);
  });

  it("ARAP 키프레임 양 끝점(t = 0, t = 1) 일치성과 균일(uniform) 가중치 모드를 검증한다", () => {
    const src: Vec2Tuple[] = [
      [0, 0],
      [2, 0],
      [1, 1.8],
    ];
    const dst: Vec2Tuple[] = [
      [1, 1],
      [1, 3],
      [-0.8, 2],
    ];
    const tris: TriangleTuple[] = [[0, 1, 2]];
    const atZero = morphArapPoseKeyframes({ sourceVertices: src, targetVertices: dst, triangles: tris, t: 0 });
    const atOne = morphArapPoseKeyframes({
      sourceVertices: src,
      targetVertices: dst,
      triangles: tris,
      t: 1,
      weightMode: "uniform",
    });
    expect(atZero.vertices).toEqual(src);
    expect(atOne.vertices).toEqual(dst);
  });

  it("닫힌 펜선 윤곽에서 내부 법선과 푸아송/SOR 3D 노말맵·방향성 림라이트를 복원한다", () => {
    const w = 33;
    const h = 33;
    const inkCanvas = new Uint8Array(w * h).fill(255);
    const cx = 16;
    const cy = 16;
    const radius = 11;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const d = Math.hypot(x - cx, y - cy);
        if (Math.abs(d - radius) <= 1.2) inkCanvas[y * w + x] = 10;
      }
    }

    const res = estimateContourNormalAndRimLight({
      width: w,
      height: h,
      pixels: inkCanvas,
      inputMode: "closed-ink",
      sorIterations: 90,
      lightDirection: [-0.8, 0.6, -0.4],
    });

    expect(res.serverCostKrw).toBe(0);
    expect(res.interiorPixelCount).toBeGreaterThan(350);
    const centerIdx = cy * w + cx;
    expect(res.heightMap[centerIdx]!).toBeGreaterThan(1.0);
    expect(res.normalsXYZ[centerIdx * 3 + 2]!).toBeGreaterThan(0.92);

    // 좌상단 역광이므로 좌상단 실루엣 가장자리의 림라이트가 우하단보다 뚜렷하게 강해야 한다.
    const topLeftRim = res.rimLightIntensity[(cy - 8) * w + (cx - 8)]!;
    const bottomRightRim = res.rimLightIntensity[(cy + 8) * w + (cx + 8)]!;
    expect(topLeftRim).toBeGreaterThan(bottomRightRim * 2.5);
    expect(topLeftRim).toBeGreaterThan(res.rimLightIntensity[centerIdx]!);
  });
});

describe("Wave 8 Singularity — 2. 한글 글리프 서브셋터 · 로컬 ε-DP 텔레메트리 · 시공간 CRDT", () => {
  it("회차 대사에서 고유 한글·문장부호만 추출해 > 90% 폰트 바이트를 절감하고 이진 탐색으로 조회한다", () => {
    const dialogues = [
      "「잠깐만요…!」 지금 바로 마감 원고를 저장할게요!",
      "ㅋㅋㅋ 진짜 대박이다?! 제3화 오픈 준비 완료 — 100% 성공!",
      "한글 NFD 조합 문자열도 NFC로 정규화됩니다.",
    ];
    const subset = subsetEpisodeDialogueGlyphs(dialogues);

    expect(subset.serverCostKrw).toBe(0);
    expect(subset.byteReductionRatio).toBeGreaterThan(0.98);
    expect(subset.sortedCodePoints[0]).toBe(0);
    for (let i = 1; i < subset.sortedCodePoints.length; i += 1) {
      expect(subset.sortedCodePoints[i]!).toBeGreaterThan(subset.sortedCodePoints[i - 1]!);
    }

    const hanCp = "한".codePointAt(0)!;
    expect(decomposeHangulSyllable(hanCp)).toEqual({
      choseongIndex: 18,
      jungseongIndex: 0,
      jongseongIndex: 4,
    });
    const expectedGid = subset.unicodeToSubsetGlyphId.get(hanCp)!;
    expect(expectedGid).toBeGreaterThan(0);
    expect(lookupSubsetGlyphIdBinary(subset.subsetBinaryBundle, hanCp)).toBe(expectedGid);
    expect(lookupSubsetGlyphIdBinary(subset.subsetBinaryBundle, "믜".codePointAt(0)!)).toBe(0);
  });

  it("보정 라플라스 노이즈·무작위 응답 및 ε 예산 초과 차단을 수행한다", () => {
    let seed = 123456789;
    const detRng = (): number => {
      seed = (1664525 * seed + 1013904223) >>> 0;
      return (seed + 0.5) / 4294967296;
    };

    const analyzer = new LocalDpCreatorTelemetryAnalyzer({
      maxEpsilonBudget: 1.5,
      rng: detRng,
    });

    const hist = analyzer.analyzeHistogramWithLaplace({
      queryId: "brush-usage-ep1",
      buckets: ["g-pen", "maru-pen", "watercolor", "airbrush"],
      rawCounts: [120, 40, 30, 10],
      epsilon: 0.8,
      l1Sensitivity: 20,
    });

    expect(hist.laplaceScale).toBeCloseTo(25, 6);
    expect(hist.theoreticalVariancePerBucket).toBeCloseTo(1250, 5);
    const clippedL1 = hist.clippedCounts.reduce((acc, v) => acc + v, 0);
    expect(clippedL1).toBeCloseTo(20, 5);
    expect(analyzer.remainingEpsilon).toBeCloseTo(0.7, 6);

    const rr = analyzer.randomizeCategoricalHabit({
      queryId: "shortcut-profile",
      trueCategoryIndex: 1,
      categoryCount: 4,
      epsilon: 0.5,
    });
    expect(rr.privacyLikelihoodRatio).toBeCloseTo(Math.exp(0.5), 6);
    expect(() =>
      analyzer.analyzeHistogramWithLaplace({
        queryId: "over-budget",
        buckets: ["a", "b"],
        rawCounts: [1, 2],
        epsilon: 0.3,
      }),
    ).toThrow(/예산/);

    // 대량 무작위 응답 집단에서 참 최빈 카테고리(2번) 복원 검증
    const reports: number[] = [];
    const cohortAnalyzer = new LocalDpCreatorTelemetryAnalyzer({
      maxEpsilonBudget: 10_000,
      rng: detRng,
    });
    for (let i = 0; i < 600; i += 1) {
      const truth = i < 420 ? 2 : i % 3;
      reports.push(
        cohortAnalyzer.randomizeCategoricalHabit({
          queryId: `u-${i}`,
          trueCategoryIndex: truth,
          categoryCount: 3,
          epsilon: 1.4,
        }).reportedCategoryIndex,
      );
    }
    const debiased = estimateDebiasedRandomizedFrequencies(reports, 3, 1.4);
    expect(debiased[2]!).toBeGreaterThan(debiased[0]!);
    expect(debiased[2]!).toBeGreaterThan(debiased[1]!);
  });

  it("오프라인 다중 기기 스트로크의 동시 분기를 감지하고 과거 논리 컷을 결정론적으로 재현한다", () => {
    const ipad = new SpacetimeContinuumEngine("ipad-pro", 1000);
    const wacom = new SpacetimeContinuumEngine("wacom-desk", 1000);

    const opIpad1 = ipad.issueLocalOperation(
      {
        kind: "add-stroke",
        strokeId: "s-ipad-1",
        layerId: "ink",
        brushId: "g-pen",
        colorHex: "#111111",
        widthPx: 3,
        points: [{ x: 10, y: 20, pressure: 0.8 }],
      },
      1010,
    );
    const opWacom1 = wacom.issueLocalOperation(
      {
        kind: "add-stroke",
        strokeId: "s-wacom-1",
        layerId: "ink",
        brushId: "maru-pen",
        colorHex: "#222222",
        widthPx: 2,
        points: [{ x: 40, y: 50, pressure: 0.6 }],
      },
      1010,
    );

    expect(compareVectorClocks(opIpad1.vectorClock, opWacom1.vectorClock)).toBe("concurrent");

    ipad.applyRemoteOperation(opWacom1, 1020);
    const opIpadModify = ipad.issueLocalOperation(
      { kind: "modify-stroke", strokeId: "s-wacom-1", widthPx: 5, offsetX: 4 },
      1030,
    );
    const opIpadErase = ipad.issueLocalOperation(
      { kind: "erase-stroke", strokeId: "s-ipad-1" },
      1040,
    );

    // 역순으로 도착한 제3 복제본도 100% 동일한 최종 상태로 수렴해야 한다.
    const replica = new SpacetimeContinuumEngine("observer", 900);
    for (const op of [opIpadErase, opIpadModify, opWacom1, opIpad1]) {
      replica.applyRemoteOperation(op, 1050);
    }

    expect(replica.detectConcurrentBranches()).toHaveLength(1);
    const latest = replica.replayAtLogicalCut();
    const ipadLatest = ipad.replayAtLogicalCut();
    expect(latest.activeStrokes).toEqual(ipadLatest.activeStrokes);
    expect(latest.activeStrokes).toHaveLength(1);
    expect(latest.activeStrokes[0]!.strokeId).toBe("s-wacom-1");
    expect(latest.activeStrokes[0]!.widthPx).toBe(5);
    expect(latest.erasedStrokeIds).toEqual(["s-ipad-1"]);

    // 삭제 이전 시점의 논리 컷 재현 시 두 스트로크가 모두 살아 있어야 한다.
    const beforeEraseCut = replica.replayAtLogicalCut({ "ipad-pro": 2, "wacom-desk": 1 });
    expect(beforeEraseCut.activeStrokes).toHaveLength(2);
    expect(beforeEraseCut.erasedStrokeIds).toHaveLength(0);
  });
});

describe("Wave 8 Singularity — 3. 스캔 선화 노이즈 게이트 · 희소 옥트리 · 음성→VRM · 무가스 로열티", () => {
  it("스캔 종이 결·모스키토 노이즈·미세 먼지를 제거하면서 1px 필압 끝선은 온전히 보존한다", () => {
    const w = 48;
    const h = 48;
    const pixels = new Uint8Array(w * h);
    for (let i = 0; i < pixels.length; i += 1) {
      pixels[i] = 238 + ((i * 17) % 17); // 238..254 종이 결 잡음
    }

    // 주 스트로크(3px 두께, y = 22..24, x = 6..24) + 1px 필압 끝선(y = 23, x = 25..35)
    for (let x = 6; x <= 24; x += 1) {
      pixels[22 * w + x] = 20;
      pixels[23 * w + x] = 12;
      pixels[24 * w + x] = 20;
      pixels[20 * w + x] = 226; // 주변 JPEG 모스키토 링잉
    }
    for (let x = 25; x <= 35; x += 1) {
      pixels[23 * w + x] = 45 + (x - 25) * 10; // 45..145 가는 필압 끝선
    }

    // 고립 미세 먼지 3개 배치
    pixels[5 * w + 5] = 95;
    pixels[5 * w + 6] = 110;
    pixels[38 * w + 10] = 80;
    pixels[40 * w + 40] = 120;
    pixels[40 * w + 41] = 125;
    pixels[41 * w + 40] = 130;

    const cleaned = denoiseScanLineArt({ width: w, height: h, pixels });
    expect(cleaned.serverCostKrw).toBe(0);
    expect(cleaned.removedDustComponents).toBe(3);
    expect(cleaned.paperWhitePixelRatio).toBeGreaterThan(0.9);
    expect(cleaned.cleanedPixels[5 * w + 5]).toBe(255);
    expect(cleaned.cleanedPixels[38 * w + 10]).toBe(255);
    expect(cleaned.cleanedPixels[20 * w + 12]).toBe(255);

    // 1px 필압 끝선 생존 확인
    for (let x = 25; x <= 35; x += 1) {
      expect(cleaned.cleanedPixels[23 * w + x]!).toBeLessThan(190);
    }
  });

  it("64비트 Morton Z-order(`BigInt(...)`) 희소 옥트리에서 빈 영역 할당 없이 O(log N + K) 프러스텀 조회를 수행한다", () => {
    const c2d = encodeMorton2D(987_654, 543_210);
    expect(decodeMorton2D(c2d)).toEqual({ x: 987_654, y: 543_210 });

    const c3d = encodeMorton3D(1_048_575, 524_287, 2_097_151);
    expect(decodeMorton3D(c3d)).toEqual({ x: 1_048_575, y: 524_287, z: 2_097_151 });

    const indexer = new SparseMortonTileIndexer<string>({ worldExtent: 4096, dimension: 3 });
    const lod = 10; // 타일당 크기 = 4096 / 1024 = 4 월드 단위
    for (let i = 0; i < 800; i += 1) {
      const tx = (i * 73) % 1024;
      const ty = (i * 137) % 1024;
      const tz = (i * 251) % 1024;
      indexer.insertTile({ lod, x: tx, y: ty, z: tz, payload: `bg-${i}` });
    }
    indexer.insertTile({ lod, x: 2, y: 3, z: 1, payload: "hero-cut-tile" });

    // 월드 박스 [0..16, 0..16, 0..16] 내부만 비추는 6-평면 프러스텀
    const res = indexer.queryFrustumTiles(lod, [
      { nx: 1, ny: 0, nz: 0, d: 0 },
      { nx: -1, ny: 0, nz: 0, d: 16 },
      { nx: 0, ny: 1, nz: 0, d: 0 },
      { nx: 0, ny: -1, nz: 0, d: 16 },
      { nx: 0, ny: 0, nz: 1, d: 0 },
      { nx: 0, ny: 0, nz: -1, d: 16 },
    ]);

    expect(res.totalIndexedTilesAtLod).toBeGreaterThanOrEqual(800);
    expect(res.visibleTiles.some((t) => t.payload === "hero-cut-tile")).toBe(true);
    expect(res.visitedNodes).toBeLessThan(80);

    // 2D 쿼드트리 뷰포트 조회 검증
    const quadIndexer = new SparseMortonTileIndexer<string>({ worldExtent: 1_048_576, dimension: 2 });
    quadIndexer.insertTile({ lod: 12, x: 5, y: 7, payload: "cut-panel-a" });
    quadIndexer.insertTile({ lod: 12, x: 3800, y: 3900, payload: "cut-panel-far" });
    const vp = quadIndexer.queryViewport2D(12, { minX: 0, minY: 0, maxX: 4096, maxY: 4096 });
    expect(vp.visibleTiles.map((t) => t.payload)).toEqual(["cut-panel-a"]);
  });

  it("웹캠·서버 없이 로컬 PCM 포먼트·에너지·영교차율로 52개 VRM 표정 블렌드셰이프를 구동한다", () => {
    expect(ARKIT_52_BLENDSHAPE_NAMES).toHaveLength(52);
    const sampleRate = 16000;
    const animator = new VoiceToVrmExpressionAnimator({ sampleRateHz: sampleRate, smoothing: 0.1 });

    const silence = animator.stepPcmFrame(new Float32Array(512), 0.08);
    expect(silence.dominantViseme).toBe("sil");
    expect(silence.arkit52.jawOpen).toBe(0);
    expect(silence.vrmVisemes.blink).toBeGreaterThan(0.8);

    const makeTone = (freqs: readonly [number, number][]): Float32Array => {
      const buf = new Float32Array(512);
      for (let i = 0; i < 512; i += 1) {
        let s = 0;
        for (const [f, amp] of freqs) s += amp * Math.sin((2 * Math.PI * f * i) / sampleRate);
        buf[i] = s;
      }
      return buf;
    };

    // 개구 모음 /aa/ (920 Hz 대역 강세)
    const aaFrame = animator.stepPcmFrame(makeTone([[920, 0.35], [1150, 0.2]]), 0.5);
    expect(aaFrame.dominantViseme).toBe("aa");
    expect(aaFrame.arkit52.jawOpen).toBeGreaterThan(0.35);

    // 전설 고모음 /ih/ (2900 Hz 고주파 대역 강세)
    const ihFrame = animator.stepPcmFrame(makeTone([[320, 0.08], [2950, 0.32]]), 0.5);
    expect(ihFrame.vrmVisemes.ih).toBeGreaterThan(ihFrame.vrmVisemes.ou);
    expect(ihFrame.arkit52.mouthSmileLeft).toBeGreaterThan(0.15);

    // 원순 후설 모음 /ou/ (360 Hz 저주파 집중)
    const ouFrame = animator.stepPcmFrame(makeTone([[360, 0.36], [520, 0.14]]), 0.5);
    expect(ouFrame.vrmVisemes.ou).toBeGreaterThan(ouFrame.vrmVisemes.ih);
    expect(ouFrame.arkit52.mouthPucker).toBeGreaterThan(0.2);
  });

  it("10,000 bps 공동 창작 로열티 매니페스트를 ECDSA 서명 주입하고 1바이트 변조를 즉시 차단한다", async () => {
    const shares: RoyaltyRecipientShare[] = [
      { creatorId: "writer-kim", role: "story", shareBps: 3334 },
      { creatorId: "artist-park", role: "line-art", shareBps: 3333 },
      { creatorId: "color-lee", role: "coloring", shareBps: 3333 },
    ];
    expect(TOTAL_ROYALTY_BASIS_POINTS).toBe(10_000);
    const payouts = calculateBasisPointPayouts(100_001, shares);
    const sumKrw = [...payouts.values()].reduce((a, b) => a + b, 0);
    expect(sumKrw).toBe(100_001);

    const { privateKey, publicKey } = await generateRoyaltySigningKeyPair();
    const pngBytes = createMinimalPngBytes(0x42);

    const signedPng = await injectRoyaltySplitManifest(
      pngBytes,
      {
        workId: "series-nebula",
        episodeNumber: 8,
        recipients: shares,
        licenseTerms: {
          commercialUse: true,
          aiTrainingAllowed: false,
          derivativePolicy: "prohibited",
          territory: "GLOBAL",
          effectiveFromIso: "2026-11-27T00:00:00Z",
        },
      },
      privateKey,
      publicKey,
    );

    const verified = await verifyEmbeddedRoyaltyManifest(signedPng);
    expect(verified.valid).toBe(true);
    expect(verified.tampered).toBe(false);
    expect(verified.gasFeeKrw).toBe(0);
    expect(verified.manifest?.workId).toBe("series-nebula");

    // 1) 이미지 픽셀(IDAT) 1바이트 변조 시 아트워크 SHA-256 불일치로 즉시 실패
    const pixelTampered = new Uint8Array(signedPng);
    pixelTampered[41] = pixelTampered[41]! ^ 0x01;
    const pixelCheck = await verifyEmbeddedRoyaltyManifest(pixelTampered);
    expect(pixelCheck.valid).toBe(false);
    expect(pixelCheck.tampered).toBe(true);

    // 2) 비-PNG 바이너리 트레일러 주입 및 1바이트 매니페스트 변조 탐지
    const rawGlb = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00, 0x10, 0x20]);
    const signedGlb = await injectRoyaltySplitManifest(
      rawGlb,
      {
        workId: "bg3d-castle",
        episodeNumber: 1,
        recipients: [{ creatorId: "bg-artist", role: "3d-bg", shareBps: 10_000 }],
        licenseTerms: {
          commercialUse: true,
          aiTrainingAllowed: false,
          derivativePolicy: "attribution-only",
          territory: "KR",
          effectiveFromIso: "2026-11-27T00:00:00Z",
        },
      },
      privateKey,
      publicKey,
    );
    expect((await verifyEmbeddedRoyaltyManifest(signedGlb)).valid).toBe(true);

    const glbTampered = new Uint8Array(signedGlb);
    glbTampered[rawGlb.length + 12] = glbTampered[rawGlb.length + 12]! ^ 0x04;
    const glbCheck = await verifyEmbeddedRoyaltyManifest(glbTampered);
    expect(glbCheck.valid).toBe(false);
    expect(glbCheck.tampered).toBe(true);

    // 지분 합계가 10,000 bps가 아닐 때 즉시 거부 확인
    expect(() =>
      calculateBasisPointPayouts(50_000, [
        { creatorId: "a", role: "story", shareBps: 6000 },
        { creatorId: "b", role: "art", shareBps: 3000 },
      ]),
    ).toThrow(/10,000 bps/);
  });
});
