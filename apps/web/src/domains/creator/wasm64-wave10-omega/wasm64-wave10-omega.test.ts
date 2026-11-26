import { describe, expect, it } from "vitest";

import {
  analyzeStylusErgonomicSession,
  auditCurlWindDivergence2D,
  auditCurlWindDivergence3D,
  buildCauchySystematicMatrix,
  compilePortalSafeSlices,
  computeCrc32,
  computeStripRowEnergyProfile,
  computeThinLensCoC,
  createVisualSeedBackupKit,
  decodeCauchySystematicShards,
  encodeCauchySystematicShards,
  evaluateAperturePolygonRadius,
  generateBokehKernelSamples,
  gf256Add,
  gf256Div,
  gf256Inv,
  gf256Mul,
  gf256Pow,
  invertGf256Matrix,
  MIB_BYTES,
  parseVisualArmorShard,
  recoverVisualSeedBackupKit,
  renderThinLensBokehPass,
  rsComputeSyndromes,
  rsDecodeCodeword,
  rsEncodeSystematicCodeword,
  sampleCurlWind2D,
  sampleCurlWind3D,
  SEED_BACKUP_SCHEMA_VERSION,
  simulateAerodynamicStrand,
  THIN_LENS_CAMERA_PRESETS,
  WEBTOON_PORTAL_SLICE_SPECS,
  WGSL_THIN_LENS_BOKEH_GATHER,
  type CreatorVisualSeedBundle,
  type KeepOutZone,
  type Vec2Tuple,
  type Vec3Tuple,
  type VisualSeedShardPacket,
} from "./index";

describe("wasm64-wave10-omega: 얇은 렌즈 아나모픽 보케 & 무발산 컬 바람장", () => {
  it("35mm f/1.4 · 85mm f/1.2 · 2x 아나모픽의 물리 착란원(CoC) 공식을 정확히 계산한다", () => {
    const lens35 = THIN_LENS_CAMERA_PRESETS["prime-35mm-f1.4"];
    const lens85 = THIN_LENS_CAMERA_PRESETS["portrait-85mm-f1.2"];
    const lensAna = THIN_LENS_CAMERA_PRESETS["anamorphic-50mm-2x-t2"];

    // 초점면(S2 === S1)에서는 CoC가 정확히 0이어야 한다.
    const atFocus85 = computeThinLensCoC(lens85.focusDistanceM, lens85, 1920, 64);
    expect(atFocus85.cocMm).toBe(0);
    expect(atFocus85.cocRadiusPx).toBe(0);
    expect(atFocus85.depthZone).toBe("in-focus");

    // 동일 초점거리 S1=2.2m, 배경 S2=10m에서 수식 직접 대조:
    // CoC_mm = |S2 - S1| / S2 * (f^2 / (N * (S1 - f)))
    const s1Mm = 2200;
    const s2Mm = 10_000;
    const expected85Mm =
      (Math.abs(s2Mm - s1Mm) / s2Mm) * ((85 * 85) / (1.2 * (s1Mm - 85)));
    const bg85 = computeThinLensCoC(10.0, lens85, 1920, 200);
    expect(bg85.cocMm).toBeCloseTo(expected85Mm, 8);
    expect(bg85.signedCocMm).toBeGreaterThan(0);
    expect(bg85.depthZone).toBe("background");

    // 동일 피사체 거리로 맞춘 35mm f/1.4보다 85mm f/1.2의 배경 착란원이 훨씬 커야 한다.
    const bg35 = computeThinLensCoC(10.0, { ...lens35, focusDistanceM: 2.2 }, 1920, 200);
    expect(bg85.cocMm).toBeGreaterThan(bg35.cocMm * 4);

    // 전경(S2 < S1) 샘플은 음수 signedCocMm와 foreground 영역을 반환한다.
    const fg35 = computeThinLensCoC(0.7, lens35, 1920, 100);
    expect(fg35.signedCocMm).toBeLessThan(0);
    expect(fg35.depthZone).toBe("foreground");
    expect(fg35.dofNearM).toBeLessThan(lens35.focusDistanceM);
    expect(fg35.dofFarM).toBeGreaterThan(lens35.focusDistanceM);

    // 2x 아나모픽 렌즈는 가로 보케 반경이 세로 반경의 정확히 1/2 타원을 이룬다.
    const bgAna = computeThinLensCoC(9.0, lensAna, 1920, 100);
    expect(bgAna.cocRadiusXPx).toBeCloseTo(bgAna.cocRadiusYPx * 0.5, 8);
    expect(WGSL_THIN_LENS_BOKEH_GATHER).toContain("thin_lens_coc_mm");
  });

  it("다각형 조리개 날 반경과 2x 아나모픽 보케 커널 가중치 정규화를 보장한다", () => {
    // 곡률 0인 정6각형 조리개: 꼭짓점(0) 반경은 1, 변 중앙(π/6) 반경은 cos(π/6) = √3/2
    const corner = evaluateAperturePolygonRadius(0, 6, 0, 0);
    const edgeMid = evaluateAperturePolygonRadius(Math.PI / 6, 6, 0, 0);
    expect(corner).toBeCloseTo(1.0, 8);
    expect(edgeMid).toBeCloseTo(Math.cos(Math.PI / 6), 8);

    // 2x 아나모픽 커널: 가중치 합 = 1.0, 평균 세로 퍼짐이 가로 퍼짐의 약 2배
    const taps = generateBokehKernelSamples(
      THIN_LENS_CAMERA_PRESETS["anamorphic-50mm-2x-t2"],
      96,
    );
    expect(taps).toHaveLength(96);
    const weightSum = taps.reduce((acc, t) => acc + t.weight, 0);
    expect(weightSum).toBeCloseTo(1.0, 8);

    const meanAbsX = taps.reduce((acc, t) => acc + Math.abs(t.offsetX), 0) / taps.length;
    const meanAbsY = taps.reduce((acc, t) => acc + Math.abs(t.offsetY), 0) / taps.length;
    expect(meanAbsY / meanAbsX).toBeGreaterThan(1.85);
    expect(meanAbsY / meanAbsX).toBeLessThan(2.15);
  });

  it("전경 번짐 차단(Foreground Bleed Guard)으로 선명한 전경 외곽선이 배경에 고스트를 남기지 않는다", () => {
    const width = 20;
    const height = 12;
    const rgbaLinear = new Float32Array(width * height * 4);
    const depthMeters = new Float32Array(width * height);
    const camera = {
      ...THIN_LENS_CAMERA_PRESETS["portrait-85mm-f1.2"],
      focusDistanceM: 2.0,
    };

    // 왼쪽 절반(x < 10)은 초점면(2.0m)의 선명한 전경 피사체(R=1, G=0, B=0),
    // 오른쪽 절반(x >= 10)은 먼 배경(12.0m)의 차가운 하늘(R=0, G=0, B=1).
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const idx = y * width + x;
        const off = idx * 4;
        if (x < 10) {
          depthMeters[idx] = 2.0;
          rgbaLinear[off] = 1.0;
          rgbaLinear[off + 1] = 0.0;
          rgbaLinear[off + 2] = 0.0;
          rgbaLinear[off + 3] = 1.0;
        } else {
          depthMeters[idx] = 12.0;
          rgbaLinear[off] = 0.0;
          rgbaLinear[off + 1] = 0.0;
          rgbaLinear[off + 2] = 1.0;
          rgbaLinear[off + 3] = 1.0;
        }
      }
    }

    const result = renderThinLensBokehPass({
      width,
      height,
      rgbaLinear,
      depthMeters,
      camera,
      kernelSampleCount: 64,
      maxCocRadiusPx: 8,
    });

    expect(result.serverCostKrw).toBe(0);
    expect(result.foregroundBleedRejectedTaps).toBeGreaterThan(0);

    // 초점면 픽셀(x=8, y=6)은 선명한 원본(R=1, B=0)을 그대로 유지한다.
    const sharpIdx = (6 * width + 8) * 4;
    expect(result.outputRgbaLinear[sharpIdx]).toBeCloseTo(1.0, 5);
    expect(result.outputRgbaLinear[sharpIdx + 2]).toBeCloseTo(0.0, 5);

    // 경계 바로 옆 흐린 배경 픽셀(x=11, y=6)에 선명한 전경 R 채널이 섞여 들어가지 않아야 한다.
    const bgEdgeIdx = (6 * width + 11) * 4;
    expect(result.outputRgbaLinear[bgEdgeIdx]).toBeCloseTo(0.0, 5);
    expect(result.outputRgbaLinear[bgEdgeIdx + 2]).toBeCloseTo(1.0, 5);
  });

  it("2D/3D 컬 노이즈 + 아티스트 가이드 스트로크 합성 바람장이 전역 무발산(∇ · v = 0)을 만족한다", () => {
    const config = {
      seed: 20261127,
      baseFrequency: 0.22,
      octaves: 4,
      lacunarity: 2.05,
      gain: 0.5,
      amplitude: 2.8,
      timeScale: 0.75,
    };

    const guide2D = [
      {
        id: "cape-gust-2d",
        points: [
          [0, 0],
          [2.0, 1.0],
          [4.0, 2.5],
        ] as readonly Vec2Tuple[],
        strength: 6.0,
        falloffRadius: 1.4,
      },
    ];

    // 격자 정수 경계(1.0, 2.0)와 일반 좌표를 모두 포함해 C^3 연속성과 무발산을 검증한다.
    const samples2D: Vec2Tuple[] = [];
    for (let gx = -2; gx <= 5; gx += 1) {
      for (let gy = -2; gy <= 4; gy += 1) {
        samples2D.push([gx * 0.5, gy * 0.5]);
      }
    }
    const audit2D = auditCurlWindDivergence2D(samples2D, 1.35, config, guide2D, 1e-4, 1e-5);
    expect(audit2D.meanSpeed).toBeGreaterThan(0.1);
    expect(audit2D.maxAbsDivergence).toBeLessThan(1e-5);
    expect(audit2D.isDivergenceFree).toBe(true);

    const guide3D = [
      {
        id: "ribbon-spiral-3d",
        points: [
          [0, 0, 0],
          [1.5, 0.5, -0.5],
          [3.0, 1.2, 0.4],
        ] as readonly Vec3Tuple[],
        strength: 8.5,
        falloffRadius: 1.5,
      },
    ];

    const samples3D: Vec3Tuple[] = [];
    for (let ix = -1; ix <= 3; ix += 1) {
      for (let iy = -1; iy <= 2; iy += 1) {
        for (let iz = -1; iz <= 1; iz += 1) {
          samples3D.push([ix * 0.75, iy * 0.75, iz * 0.75]);
        }
      }
    }
    const audit3D = auditCurlWindDivergence3D(samples3D, 0.8, config, guide3D, 1e-4, 1e-5);
    expect(audit3D.meanSpeed).toBeGreaterThan(0.1);
    expect(audit3D.maxAbsDivergence).toBeLessThan(1e-5);
    expect(audit3D.isDivergenceFree).toBe(true);

    // 난류 진폭이 0일 때 가이드 스트로크 중심점에서는 스트로크 접선 방향으로 정확히 바람이 분다.
    const pureGuide2D = sampleCurlWind2D(
      1.0,
      0.0,
      0,
      { amplitude: 0 },
      [{ id: "rightward", points: [[0, 0], [2, 0]], strength: 5.0, falloffRadius: 2.0 }],
    );
    expect(pureGuide2D[0]).toBeCloseTo(5.0, 6);
    expect(pureGuide2D[1]).toBeCloseTo(0.0, 6);

    const pureGuide3D = sampleCurlWind3D(
      0,
      0,
      1.0,
      0,
      { amplitude: 0 },
      [{ id: "forward-z", points: [[0, 0, 0], [0, 0, 2]], strength: 7.5, falloffRadius: 2.0 }],
    );
    expect(pureGuide3D[0]).toBeCloseTo(0, 6);
    expect(pureGuide3D[1]).toBeCloseTo(0, 6);
    expect(pureGuide3D[2]).toBeCloseTo(7.5, 6);
  });

  it("무발산 바람장 속에서 망토·장발 가닥 루트 고정과 마디 길이 불변성을 유지하며 흔들린다", () => {
    const restPoints: Vec3Tuple[] = [
      [0, 2.0, 0],
      [0, 1.6, 0],
      [0, 1.2, 0],
      [0, 0.8, 0],
      [0, 0.4, 0],
      [0, 0.0, 0],
    ];

    const sim = simulateAerodynamicStrand({
      restPoints,
      windConfig: { seed: 99, baseFrequency: 0.25, amplitude: 1.2 },
      guideStrokes3D: [
        {
          id: "hero-cape-wind",
          points: [
            [-1, 1.0, 0],
            [2, 1.1, 0.3],
          ],
          strength: 9.0,
          falloffRadius: 2.5,
        },
      ],
      dtSeconds: 1 / 60,
      stepCount: 24,
      constraintIterations: 8,
    });

    expect(sim.serverCostKrw).toBe(0);
    expect(sim.positions[0]).toEqual([0, 2.0, 0]);
    expect(sim.maxLengthErrorRatio).toBeLessThan(0.01);
    expect(sim.tipDisplacement).toBeGreaterThan(0.15);
    // 오른쪽(+X) 가이드 바람에 의해 끝단이 +X 방향으로 휘어진다.
    expect(sim.positions[sim.positions.length - 1]![0]).toBeGreaterThan(0.1);
  });
});

describe("wasm64-wave10-omega: 멀티 포털 세이프 슬라이스 & 인체공학 펜 코치", () => {
  it("네이버·카카오·라인·픽코마 5대 규격에서 말풍선·눈/얼굴 분할 0건과 2 MiB 용량 한도를 달성한다", () => {
    const totalHeightPx = 7600;
    const keepOutZones: KeepOutZone[] = [
      { id: "b1", kind: "speech-balloon", topPx: 1120, bottomPx: 1360 },
      { id: "e1", kind: "character-eyes", topPx: 2350, bottomPx: 2510 },
      { id: "f1", kind: "character-face", topPx: 3580, bottomPx: 3890 },
      { id: "b2", kind: "speech-balloon", topPx: 4820, bottomPx: 5110 },
      { id: "e2", kind: "character-eyes", topPx: 6150, bottomPx: 6320 },
    ];

    // 고밀도 작화 구간 사이(980~1020, 2180~2220 등)에 깨끗한 여백(에너지 0)을 배치한다.
    const width = 32;
    const stripRgba = new Uint8Array(width * totalHeightPx * 4);
    for (let y = 0; y < totalHeightPx; y += 1) {
      const isCleanGutter =
        (y >= 960 && y <= 1020) ||
        (y >= 2160 && y <= 2220) ||
        (y >= 3380 && y <= 3440) ||
        (y >= 4620 && y <= 4680) ||
        (y >= 5940 && y <= 6000);
      for (let x = 0; x < width; x += 1) {
        const idx = (y * width + x) * 4;
        const val = isCleanGutter ? 255 : (x * 73 + y * 19) & 0xff;
        stripRgba[idx] = val;
        stripRgba[idx + 1] = val;
        stripRgba[idx + 2] = val;
        stripRgba[idx + 3] = 255;
      }
    }
    const rowVisualEnergy = computeStripRowEnergyProfile(stripRgba, width, totalHeightPx);
    expect(rowVisualEnergy[990]).toBe(0);
    expect(rowVisualEnergy[500]).toBeGreaterThan(0.2);

    const portals = Object.keys(WEBTOON_PORTAL_SLICE_SPECS) as Array<
      keyof typeof WEBTOON_PORTAL_SLICE_SPECS
    >;

    for (const portal of portals) {
      const report = compilePortalSafeSlices({
        totalHeightPx,
        portal,
        keepOutZones,
        rowVisualEnergy,
      });

      expect(report.balloonSplitCount).toBe(0);
      expect(report.eyeFaceSplitCount).toBe(0);
      expect(report.allSlicesWithinByteCap).toBe(true);
      expect(report.withinTotalEpisodeByteCap).toBe(true);
      expect(report.cutLinesPx[0]).toBe(0);
      expect(report.cutLinesPx[report.cutLinesPx.length - 1]).toBe(totalHeightPx);
      expect(report.serverCostKrw).toBe(0);

      for (const slice of report.slices) {
        expect(slice.heightPx).toBeLessThanOrEqual(report.portalSpec.maxSliceHeightPx);
        expect(slice.estimatedBytes).toBeLessThanOrEqual(2 * MIB_BYTES);
        expect(slice.intersectsCriticalKeepOut).toBe(false);
      }
    }
  });

  it("엄격한 바이트 상한 아래에서 이진 탐색으로 허용 가능한 최대 화질(q*)을 정확히 선택한다", () => {
    const strictCapBytes = 500_000;
    const report = compilePortalSafeSlices({
      totalHeightPx: 1000,
      portal: {
        ...WEBTOON_PORTAL_SLICE_SPECS["naver-webtoon"],
        maxSliceBytes: strictCapBytes,
      },
      minQuality: 40,
      maxQuality: 98,
      // q=82까지는 500,000 이하, q=83부터는 초과하는 단조 인코더 모의 함수
      measureEncodedBytes: ({ quality, chromaSubsampling }) => {
        const subFactor = chromaSubsampling === "4:4:4" ? 1 : 0.75;
        return Math.round((180_000 + quality * 3900) * subFactor);
      },
    });

    expect(report.slices).toHaveLength(1);
    const slice = report.slices[0]!;
    expect(slice.chromaSubsampling).toBe("4:4:4");
    expect(slice.selectedQuality).toBe(82);
    expect(slice.estimatedBytes).toBeLessThanOrEqual(strictCapBytes);
    expect(slice.binarySearchSteps).toBeLessThanOrEqual(10);
  });

  it("펜 이동 거리(mm/px), 고필압(> 0.85) 비율, 실행 취소 연타, 비의료 휴식 코칭을 정확히 산출한다", () => {
    // 254 PPI에서는 10px = 1mm
    const report = analyzeStylusErgonomicSession({
      screenPpi: 254,
      breakThresholdMinutes: 35,
      strokes: [
        {
          strokeId: "s-heavy",
          samples: [
            { xPx: 0, yPx: 0, timestampMs: 0, pressure: 0.92 },
            { xPx: 300, yPx: 400, timestampMs: 10_000, pressure: 0.95 }, // 500px = 50mm, 10s 고필압
            { xPx: 300, yPx: 900, timestampMs: 20_000, pressure: 0.45 }, // 500px = 50mm, 10s 일반 필압
          ],
        },
        {
          // 40분 연속 작업 경과 시점 스트로크 (중간 2분 간격으로 연속 세션 유지)
          strokeId: "s-later",
          samples: [
            { xPx: 0, yPx: 0, timestampMs: 20 * 60_000, pressure: 0.9 },
            { xPx: 0, yPx: 1000, timestampMs: 20 * 60_000 + 8_000, pressure: 0.91 },
          ],
        },
        {
          strokeId: "s-end",
          samples: [
            { xPx: 0, yPx: 0, timestampMs: 42 * 60_000, pressure: 0.5 },
            { xPx: 0, yPx: 1000, timestampMs: 42 * 60_000 + 2_000, pressure: 0.5 },
          ],
        },
      ],
      restResetGapMs: 25 * 60_000,
      undoEvents: [
        { timestampMs: 50_000 },
        { timestampMs: 52_000 },
        { timestampMs: 54_500 },
        { timestampMs: 57_000 },
        { timestampMs: 58_200 },
      ],
    });

    // 총 이동 픽셀 = 500 + 500 + 1000 + 1000 = 3000px => 254 PPI에서 정확히 300mm (0.3m)
    expect(report.cumulativeTravelPx).toBeCloseTo(3000, 6);
    expect(report.cumulativeTravelMm).toBeCloseTo(300, 6);
    expect(report.cumulativeTravelMeters).toBeCloseTo(0.3, 6);

    // 활성 드로잉 시간 30,000ms 중 고필압(>0.85) 구간 18,000ms => 비율 0.6
    expect(report.sustainedHeavyPressureRatio).toBeCloseTo(18_000 / 30_000, 6);
    expect(report.peakHeavyPressureStreakMs).toBe(10_000);
    expect(report.microUndoThrashingBursts).toHaveLength(1);
    expect(report.microUndoThrashingBursts[0]!.undoCount).toBe(5);
    expect(report.continuousSessionMinutes).toBeGreaterThan(40);
    expect(report.fatigueLoadLevel).toBe("rest-recommended");
    expect(report.serverCostKrw).toBe(0);

    const topics = report.recommendations.map((r) => r.topic);
    expect(topics).toContain("heavy-pressure-relief");
    expect(topics).toContain("micro-undo-rhythm");
    expect(topics).toContain("continuous-session-break");

    // 비의료 원칙 검증: 진단·질병·처방·환자·증후군 등 의료 용어가 절대 포함되지 않아야 한다.
    const mergedCopy = report.recommendations
      .map((r) => `${r.titleKo} ${r.guidanceKo} ${r.shortcutHintKo}`)
      .join(" ");
    for (const medicalWord of ["진단", "처방", "질병", "환자", "증후군", "치료"]) {
      expect(mergedCopy.includes(medicalWord)).toBe(false);
    }
  });
});

describe("wasm64-wave10-omega: GF(256) 리드-솔로몬 오프라인 비주얼 시드 백업 키트", () => {
  const sampleBundle: CreatorVisualSeedBundle = {
    schemaVersion: SEED_BACKUP_SCHEMA_VERSION,
    bundleId: "seed-heroine-ep01",
    createdAtIso: "2026-11-27T02:30:00.000Z",
    brushPresets: [
      {
        id: "brush-gpen-crisp",
        nameKo: "주인공 펜선 G펜",
        sizePx: 14.5,
        minSizeRatio: 0.12,
        streamline: 0.42,
        pressureGamma: 1.35,
        spacingRatio: 0.06,
        tipShape: "g-pen",
      },
      {
        id: "brush-wash-soft",
        nameKo: "수채 배경 번짐 브러시",
        sizePx: 68,
        minSizeRatio: 0.35,
        streamline: 0.18,
        pressureGamma: 0.9,
        spacingRatio: 0.11,
        tipShape: "watercolor",
      },
    ],
    characterPalettes: [
      {
        characterId: "char-sora",
        characterNameKo: "한소라",
        swatches: [
          { slotNameKo: "피부 기본톤", l: 0.89, c: 0.042, h: 58.5, alpha: 1 },
          { slotNameKo: "눈동자 포인트", l: 0.46, c: 0.148, h: 242.0, alpha: 1 },
          { slotNameKo: "망토 안감", l: 0.31, c: 0.095, h: 164.0, alpha: 0.96 },
        ],
      },
    ],
    ed25519KeyFingerprints: [
      {
        keyId: "ed25519-studio-master-01",
        ownerLabelKo: "작가 마스터 서명키",
        algorithm: "Ed25519",
        publicKeyBytes: Array.from({ length: 32 }, (_, idx) => (idx * 37 + 19) & 0xff),
        fingerprintHex: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
      },
    ],
  };

  it("GF(2^8) (`0x11d`) 체 공리와 코시 조직적 생성 행렬 역행렬 소거 복구를 검증한다", () => {
    // α = 2일 때 x^8 = x^4 + x^3 + x^2 + 1 = 16 + 8 + 4 + 1 = 29 (0x1d)
    expect(gf256Pow(2, 8)).toBe(0x1d);
    expect(gf256Pow(2, 255)).toBe(1);

    for (let a = 1; a < 256; a += 1) {
      expect(gf256Mul(a, gf256Inv(a))).toBe(1);
      expect(gf256Div(gf256Mul(a, 173), a)).toBe(173);
    }
    // 분배법칙: a * (b + c) = a*b + a*c
    expect(gf256Mul(73, gf256Add(149, 211))).toBe(
      gf256Add(gf256Mul(73, 149), gf256Mul(73, 211)),
    );

    // 코시 행렬 임의 정방 부분행렬 가역성 및 K=4, P=4 샤드 소거 복구
    const k = 4;
    const p = 4;
    const cauchy = buildCauchySystematicMatrix(k, p);
    const subRows = [1, 4, 5, 7];
    const sub = new Uint8Array(k * k);
    for (let r = 0; r < k; r += 1) {
      for (let c = 0; c < k; c += 1) {
        sub[r * k + c] = cauchy[subRows[r]! * k + c]!;
      }
    }
    const inv = invertGf256Matrix(sub, k);
    for (let r = 0; r < k; r += 1) {
      for (let c = 0; c < k; c += 1) {
        let dot = 0;
        for (let m = 0; m < k; m += 1) {
          dot ^= gf256Mul(sub[r * k + m]!, inv[m * k + c]!);
        }
        expect(dot).toBe(r === c ? 1 : 0);
      }
    }

    const rawShards = Array.from({ length: k }, (_, s) =>
      Uint8Array.from({ length: 32 }, (__, b) => (s * 53 + b * 17 + 9) & 0xff),
    );
    const encoded = encodeCauchySystematicShards(rawShards, p);
    // 원본 데이터 샤드 4개 중 3개(0, 2, 3)와 패리티 1개(6)가 유실되어도 100% 복원된다.
    const damaged: Array<Uint8Array | null> = [
      null,
      encoded[1]!,
      null,
      null,
      encoded[4]!,
      encoded[5]!,
      null,
      encoded[7]!,
    ];
    const recovered = decodeCauchySystematicShards(damaged, k, p);
    for (let s = 0; s < k; s += 1) {
      expect(Array.from(recovered[s]!)).toEqual(Array.from(rawShards[s]!));
    }
  });

  it("다항식 리드-솔로몬 부호어가 소거(e)와 미지 위치 오류(v) 복합 손상(2v + e <= 2t)을 정정한다", () => {
    const message = Uint8Array.from({ length: 16 }, (_, i) => (i * 29 + 11) & 0xff);
    const paritySymbols = 8; // 2t = 8 (t = 4)
    const codeword = rsEncodeSystematicCodeword(message, paritySymbols);
    expect(Array.from(rsComputeSyndromes(codeword, paritySymbols))).toEqual(
      new Array(paritySymbols).fill(0),
    );

    // e = 4개 소거 + v = 2개 미지 위치 오류 => 2v + e = 8 <= 8 정정 성공
    const corrupted = codeword.slice();
    const erasures = [0, 5, 11, 21];
    for (const pos of erasures) {
      corrupted[pos] = 0xaa;
    }
    corrupted[3] ^= 0x7f;
    corrupted[14] ^= 0xd3;

    const decoded = rsDecodeCodeword(corrupted, paritySymbols, erasures);
    expect(decoded.unknownErrorCount).toBe(2);
    expect(decoded.erasureCount).toBe(4);
    expect(Array.from(decoded.codeword)).toEqual(Array.from(codeword));
    expect(Array.from(decoded.message)).toEqual(Array.from(message));

    // 정정 용량 초과(소거 9개 > 8) 시 명시적 예외를 던진다.
    expect(() =>
      rsDecodeCodeword(corrupted, paritySymbols, [0, 1, 2, 3, 4, 5, 6, 7, 8]),
    ).toThrow();
  });

  it("최대 2t개의 샤드 유실·CRC 손상 및 무힌트 심벌 오염에서도 시드 번들을 100% 비트 단위로 복원한다", () => {
    // K = 6, t = 3 => 패리티 2t = 6개, 총 12개 샤드
    const kit = createVisualSeedBackupKit(sampleBundle, {
      dataShards: 6,
      errorToleranceT: 3,
    });
    expect(kit.totalShards).toBe(12);
    expect(kit.parityShards).toBe(6);
    expect(kit.serverCostKrw).toBe(0);

    // 시나리오 1: 3개 샤드 완전 분실(null) + 3개 샤드 심벌 변조(CRC 감지 소거 전환) => 총 6개(= 2t) 손실 복원!
    const disasterShards: Array<VisualSeedShardPacket | null> = kit.shards.map((shard, idx) => {
      if (idx === 0 || idx === 2 || idx === 9) {
        return null;
      }
      if (idx === 1 || idx === 4 || idx === 11) {
        const mutatedSymbols = shard.symbols.slice();
        for (let b = 0; b < mutatedSymbols.length; b += 3) {
          mutatedSymbols[b] ^= 0xff;
        }
        return { ...shard, symbols: mutatedSymbols };
      }
      return parseVisualArmorShard(shard.visualArmorCode);
    });

    const recoveredMaxErasures = recoverVisualSeedBackupKit(disasterShards);
    expect(recoveredMaxErasures.erasedShardIndices).toEqual([0, 1, 2, 4, 9, 11]);
    expect(recoveredMaxErasures.payloadCrc32).toBe(kit.payloadCrc32);
    expect(computeCrc32(recoveredMaxErasures.recoveredBytes)).toBe(kit.payloadCrc32);
    expect(Array.from(recoveredMaxErasures.recoveredBytes)).toEqual(
      Array.from(kit.originalBytes),
    );
    expect(recoveredMaxErasures.bundle).toEqual(sampleBundle);

    // 시나리오 2: 샤드 CRC 힌트를 끄고(treatCorruptedShardCrcAsErasure: false)
    // 미지 위치 샤드 t = 3개 전체 심벌이 오염된 상태에서도 벌레캠프-매시+포니만으로 100% 복원!
    const silentCorruptedShards = kit.shards.map((shard, idx) => {
      if (idx === 1 || idx === 5 || idx === 8) {
        const flipped = shard.symbols.slice();
        for (let i = 0; i < flipped.length; i += 1) {
          flipped[i] ^= ((i * 41 + idx * 13 + 7) & 0xfe) | 1;
        }
        return { ...shard, symbols: flipped };
      }
      return shard;
    });

    const recoveredBlind = recoverVisualSeedBackupKit(silentCorruptedShards, {
      treatCorruptedShardCrcAsErasure: false,
    });
    expect(recoveredBlind.erasedShardIndices).toHaveLength(0);
    expect(recoveredBlind.healedSymbolCount).toBe(kit.shards[0]!.symbols.length * 3);
    expect(Array.from(recoveredBlind.recoveredBytes)).toEqual(Array.from(kit.originalBytes));
    expect(recoveredBlind.bundle).toEqual(sampleBundle);
  });
});
