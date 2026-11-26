import { describe, expect, it } from "vitest";

import {
  analyzeScreentoneMoireRisk,
  applyEpisodeDeltaPatch,
  buildEpisodeChunkManifest,
  CDC_DEFAULT_MAX_CHUNK_BYTES,
  CDC_DEFAULT_MIN_CHUNK_BYTES,
  CLASSIC_SAFE_HALFTONE_ANGLES_DEG,
  compute2dRadix2PowerSpectrum,
  computeFnv1a64Hex,
  computeSha256Hex,
  createEpisodeDeltaPatch,
  estimateTouchFlickVelocity,
  evaluateBalloonClusterSdf,
  evaluateCutFrameSdf,
  polynomialSmoothMin,
  recommendMoireSafeScreentone,
  sculptBalloonClusterContours,
  sculptDiagonalCutFrameContours,
  sdEllipseExact,
  sdQuadraticBezierTail,
  sdRoundedRectExact,
  solveTemporalNarrativeTimeline,
  SpringScrollCinemaRig,
  synthesizeHalftoneTile,
  TARGET_MOBILE_VIEWPORT_WIDTHS_PX,
  type BalloonClusterSculptInput,
  type CutFrameDefinition,
} from "./index";

function createDeterministicEpisodeBundle(totalBytes: number, seed = 0x12345678): Uint8Array {
  const buf = new Uint8Array(totalBytes);
  let x = seed >>> 0;
  for (let i = 0; i < totalBytes; i += 1) {
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    buf[i] = x & 0xff;
  }
  return buf;
}

function expectBitExactBytes(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.byteLength).toBe(expected.byteLength);
  let firstDiffIndex = -1;
  for (let i = 0; i < actual.byteLength; i += 1) {
    if (actual[i] !== expected[i]) {
      firstDiffIndex = i;
      break;
    }
  }
  expect(firstDiffIndex).toBe(-1);
}

describe("wasm64-wave6-moonshot: 1. 해석적 2D SDF 말풍선·사선 컷 조각기", () => {
  it("타원·둥근사각형·베지어 꼬리의 정확한 부호 거리와 smin 연속성을 계산한다", () => {
    // 타원(장반경 80, 단반경 40): 경계 위는 0, 중심 및 축 위 거리가 정확해야 한다.
    expect(sdEllipseExact(80, 0, 80, 40)).toBeCloseTo(0, 6);
    expect(sdEllipseExact(0, 40, 80, 40)).toBeCloseTo(0, 6);
    expect(sdEllipseExact(0, 0, 80, 40)).toBeCloseTo(-40, 6);
    expect(sdEllipseExact(100, 0, 80, 40)).toBeCloseTo(20, 6);
    // 초점 안쪽 x축 위 점(px = 20): 가장 가까운 타원 경계점은 위아래 곡면에 놓인다.
    expect(sdEllipseExact(20, 0, 80, 40)).toBeLessThan(-35);

    // 둥근 사각형: 모서리 반경 10 적용 시 꼭짓점 대각선 외측 거리 검증
    expect(sdRoundedRectExact(0, 0, 50, 30, 10)).toBeCloseTo(-30, 6);
    expect(sdRoundedRectExact(50, 0, 50, 30, 10)).toBeCloseTo(0, 6);
    const cornerDiag = sdRoundedRectExact(50, 30, 50, 30, 10);
    expect(cornerDiag).toBeCloseTo(Math.hypot(10, 10) - 10, 5);

    // 베지어 꼬리: 시작점 반폭 12 -> 끝점 반폭 1로 수렴
    const dBase = sdQuadraticBezierTail(
      100,
      100,
      { x: 100, y: 100 },
      { x: 120, y: 140 },
      { x: 150, y: 170 },
      12,
      1,
    );
    const dTip = sdQuadraticBezierTail(
      150,
      170,
      { x: 100, y: 100 },
      { x: 120, y: 140 },
      { x: 150, y: 170 },
      12,
      1,
    );
    expect(dBase).toBeCloseTo(-12, 4);
    expect(dTip).toBeCloseTo(-1, 4);

    // 다항식 smin은 단순 min보다 항상 작거나 같으며 경계 밖에서는 정확히 min과 일치한다.
    expect(polynomialSmoothMin(2, 2, 10)).toBeCloseTo(2 - 0.25 * 10, 6);
    expect(polynomialSmoothMin(2, 30, 10)).toBe(2);
  });

  it("겹친 복수 말풍선과 꼬리를 내부 잔상(seam) 없이 단일 등치선으로 2ms 안에 추출한다", () => {
    const clusterInput: BalloonClusterSculptInput = {
      smoothBlendRadiusPx: 16,
      strokeWidthPx: 4,
      cellSizePx: 5,
      primitives: [
        {
          kind: "ellipse",
          id: "b-upper",
          centerX: 160,
          centerY: 120,
          radiusX: 74,
          radiusY: 48,
        },
        {
          kind: "rounded-rect",
          id: "b-lower",
          centerX: 225,
          centerY: 165,
          halfWidth: 68,
          halfHeight: 42,
          cornerRadius: 18,
        },
        {
          kind: "bezier-tail",
          id: "b-tail",
          basePoint: { x: 205, y: 195 },
          controlPoint: { x: 195, y: 235 },
          tipPoint: { x: 168, y: 262 },
          baseHalfWidth: 14,
          tipHalfWidth: 1.5,
        },
      ],
    };

    // V8 JIT 컴파일 워밍업 후 정상 상태(steady-state) 처리 시간을 측정한다.
    for (let w = 0; w < 6; w += 1) {
      sculptBalloonClusterContours(clusterInput);
    }
    let result = sculptBalloonClusterContours(clusterInput);
    for (let trial = 0; trial < 4; trial += 1) {
      const candidate = sculptBalloonClusterContours(clusterInput);
      if (candidate.computeTimeMs < result.computeTimeMs) {
        result = candidate;
      }
    }

    expect(result.seamArtifactCount).toBe(0);
    expect(result.innerFillLoops.length).toBe(1);
    expect(result.outerStrokeLoops.length).toBe(1);
    expect(result.outerStrokeLoops[0]!.signedArea).toBeGreaterThan(
      result.innerFillLoops[0]!.signedArea,
    );
    expect(result.innerFillSvgPath.startsWith("M ")).toBe(true);
    expect(result.outerStrokeSvgPath.endsWith("Z")).toBe(true);
    expect(result.computeTimeMs).toBeLessThan(2.0);
  });

  it("사선 여백(diagonal gutter)으로 나뉜 상·하단 컷 프레임이 여백 폭만큼 정확히 분리된다", () => {
    const sharedBounds = { minX: 0, minY: 0, maxX: 360, maxY: 480 };
    const topFrame: CutFrameDefinition = {
      id: "cut-top",
      bounds: sharedBounds,
      baseCornerRadiusPx: 6,
      diagonalGutters: [
        {
          id: "diag-1",
          pointOnLine: { x: 180, y: 240 },
          angleDeg: -14,
          gutterWidthPx: 18,
          keepSide: "negative",
          cornerFilletPx: 4,
        },
      ],
    };
    const bottomFrame: CutFrameDefinition = {
      id: "cut-bottom",
      bounds: sharedBounds,
      baseCornerRadiusPx: 6,
      diagonalGutters: [
        {
          id: "diag-1",
          pointOnLine: { x: 180, y: 240 },
          angleDeg: -14,
          gutterWidthPx: 18,
          keepSide: "positive",
          cornerFilletPx: 4,
        },
      ],
    };

    // 사선 여백 정중앙(180, 240)은 두 컷 모두 외부(SDF > 0)여야 한다.
    expect(evaluateCutFrameSdf(topFrame, 180, 240)).toBeGreaterThan(8.5);
    expect(evaluateCutFrameSdf(bottomFrame, 180, 240)).toBeGreaterThan(8.5);

    const sculptedTop = sculptDiagonalCutFrameContours(topFrame, { cellSizePx: 8 });
    const sculptedBottom = sculptDiagonalCutFrameContours(bottomFrame, { cellSizePx: 8 });
    expect(sculptedTop.innerLoops.length).toBe(1);
    expect(sculptedBottom.innerLoops.length).toBe(1);
    expect(sculptedTop.innerSvgPath.length).toBeGreaterThan(20);
  });
});

describe("wasm64-wave6-moonshot: 2. 임계 감쇠 스프링 스크롤 시네마 카메라 리그", () => {
  it("60Hz와 120Hz 주사율 프레임 적분이 결정론적으로 일치하며 오버슈트가 정확히 0px이다", () => {
    const rig60 = new SpringScrollCinemaRig({
      maxScrollYPx: 5000,
      initialScrollYPx: 200,
      naturalFrequencyRadPerSec: 12,
    });
    const rig120 = new SpringScrollCinemaRig({
      maxScrollYPx: 5000,
      initialScrollYPx: 200,
      naturalFrequencyRadPerSec: 12,
    });

    rig60.scrollToTarget(1400);
    rig120.scrollToTarget(1400);

    const frames60 = rig60.stepFrames(30, 60); // 0.5초 전진
    const frames120 = rig120.stepFrames(60, 120); // 0.5초 전진

    const end60 = frames60[frames60.length - 1]!;
    const end120 = frames120[frames120.length - 1]!;

    expect(end60.scrollYPx).toBeCloseTo(end120.scrollYPx, 8);
    expect(end60.velocityPxPerSec).toBeCloseTo(end120.velocityPxPerSec, 7);

    // 완전히 정착할 때까지 진행해도 목표(1400px)를 단 1나노미터도 넘지 않는다.
    const restFrames = rig120.stepFrames(180, 120);
    for (const f of [...frames120, ...restFrames]) {
      expect(f.scrollYPx).toBeLessThanOrEqual(1400);
      expect(f.overshootPx).toBe(0);
    }
    expect(restFrames[restFrames.length - 1]!.isSettled).toBe(true);
    expect(restFrames[restFrames.length - 1]!.scrollYPx).toBe(1400);
  });

  it("빠른 터치 플릭과 손가락 정지 대기를 구분하고 다중 평면 시차 및 모션 감소를 처리한다", () => {
    const fastSwipe = [
      { yPx: 620, timestampMs: 0 },
      { yPx: 540, timestampMs: 16 },
      { yPx: 430, timestampMs: 32 },
      { yPx: 300, timestampMs: 48 },
    ];
    const flickVel = estimateTouchFlickVelocity(fastSwipe, 2400);
    expect(flickVel).toBeGreaterThan(1500);
    expect(flickVel).toBeLessThanOrEqual(2400);

    // 마지막 표본 전에 90ms 정지했다면 의도적 멈춤으로 간주해 속도 0 반환
    const heldTouch = [...fastSwipe, { yPx: 300, timestampMs: 145 }];
    expect(estimateTouchFlickVelocity(heldTouch, 2400)).toBe(0);

    const rig = new SpringScrollCinemaRig({
      maxScrollYPx: 4000,
      initialScrollYPx: 100,
      cutSnapAnchorsYPx: [600, 1200],
      snapCaptureRadiusPx: 80,
    });
    rig.releaseTouchFlick(fastSwipe);
    const midFrame = rig.stepFrames(15, 60)[14]!;

    expect(midFrame.overshootPx).toBe(0);
    expect(midFrame.vestibularComfortScore).toBeGreaterThan(0.8);

    const sky = midFrame.layerTransforms.find((l) => l.id === "far-sky")!;
    const arch = midFrame.layerTransforms.find((l) => l.id === "mid-architecture")!;
    const charPlane = midFrame.layerTransforms.find((l) => l.id === "character-plane")!;
    const fg = midFrame.layerTransforms.find((l) => l.id === "foreground-particles")!;

    expect(Math.abs(sky.offsetYPx)).toBeLessThan(Math.abs(arch.offsetYPx));
    expect(Math.abs(arch.offsetYPx)).toBeLessThan(Math.abs(charPlane.offsetYPx));
    expect(Math.abs(charPlane.offsetYPx)).toBeLessThan(Math.abs(fg.offsetYPx));

    // prefers-reduced-motion 활성화 시 모든 레이어의 깊이 계수가 1.0으로 고정되고 즉시 정착한다.
    const reducedFrame = rig.setPrefersReducedMotion(true);
    expect(reducedFrame.isSettled).toBe(true);
    expect(reducedFrame.vestibularComfortScore).toBe(1);
    for (const layer of reducedFrame.layerTransforms) {
      expect(layer.effectiveDepthFactor).toBe(1.0);
      expect(layer.particleDriftPx).toBe(0);
    }
  });
});

describe("wasm64-wave6-moonshot: 3. 온디바이스 2D Radix-2 FFT 스크린톤 모아레 감지기", () => {
  it("2D Radix-2 FFT가 단일 정현파 격자의 공간 주파수 빈을 정확히 분리한다", () => {
    const size = 64;
    const patch = new Float32Array(size * size);
    const targetBinX = 6;
    const targetBinY = 4;
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        patch[y * size + x] =
          0.5 + 0.4 * Math.cos((2 * Math.PI * (targetBinX * x + targetBinY * y)) / size);
      }
    }

    const spec = compute2dRadix2PowerSpectrum(patch, size);
    const targetPower = spec.power[targetBinY * size + targetBinX]!;
    expect(targetPower / spec.totalAcPower).toBeGreaterThan(0.18);
    // DC 빈(0, 0)은 평균 차감으로 0에 수렴해야 한다.
    expect(spec.power[0]!).toBeLessThan(1e-18);
  });

  it("모바일 축소(375/390/768px) 시 나이퀴스트 접힘이 일어나는 고위험 망점을 잡아내고 안전 각도를 추천한다", () => {
    // 1600px 원고(600 DPI)에서 138 LPI · 0° 망점은 375px 뷰포트에서 약 0.98 cycles/px가 되어
    // 나이퀴스트 접힘으로 굵은 저주파 줄무늬 모아레를 일으킨다.
    const riskyTile = synthesizeHalftoneTile({
      sizePx: 128,
      lpi: 138,
      sourceDpi: 600,
      angleDeg: 0,
    });
    const riskyReport = analyzeScreentoneMoireRisk({
      tile: riskyTile,
      canvasWidthPx: 1600,
    });

    expect(riskyReport.viewportDiagnostics.map((d) => d.viewportWidthPx)).toEqual([
      ...TARGET_MOBILE_VIEWPORT_WIDTHS_PX,
    ]);
    expect(riskyReport.overallSeverity).toBe("critical");
    expect(riskyReport.worstRiskScore).toBeGreaterThanOrEqual(0.55);

    // 반대로 솔버가 추천한 안전 LPI 및 전통 회전각(15°/45°/75°) 타일은 모든 뷰포트에서 안전 판정을 받는다.
    const rec = recommendMoireSafeScreentone({
      canvasWidthPx: 1600,
      sourceDpi: 600,
      preferredLpi: 45,
    });
    expect(CLASSIC_SAFE_HALFTONE_ANGLES_DEG).toContain(rec.recommendedAngleDeg);
    expect(rec.recommendedAngleDeg).not.toBe(rec.secondaryLayerAngleDeg);
    expect(rec.worstViewportRiskScore).toBeLessThan(0.26);

    const safeTile = synthesizeHalftoneTile({
      sizePx: 128,
      lpi: rec.recommendedLpi,
      sourceDpi: 600,
      angleDeg: rec.recommendedAngleDeg,
    });
    const safeReport = analyzeScreentoneMoireRisk({
      tile: safeTile,
      canvasWidthPx: 1600,
    });
    expect(safeReport.overallSeverity).toBe("safe");
  });
});

describe("wasm64-wave6-moonshot: 4. 회차 횡단 타임라인·장면 시계 및 연속성 솔버", () => {
  it("모순 없는 다회차 Allen/차분 제약을 풀어 최조·최만 허용 시각 범위를 도출한다", () => {
    const report = solveTemporalNarrativeTimeline({
      scenes: [
        {
          id: "ep1-s1",
          episodeNumber: 1,
          cutOrder: 1,
          titleKo: "서울역 출발",
          minDurationMinutes: 15,
          maxDurationMinutes: 20,
          storyDayIndex: 0,
          timeOfDay: "morning",
          locationId: "seoul",
          characterStates: [
            { characterId: "hana", category: "prop", itemKey: "seal-key", state: "acquired" },
          ],
        },
        {
          id: "ep2-s1",
          episodeNumber: 2,
          cutOrder: 1,
          titleKo: "부산역 도착",
          minDurationMinutes: 30,
          storyDayIndex: 0,
          timeOfDay: "afternoon",
          locationId: "busan",
          characterStates: [
            { characterId: "hana", category: "prop", itemKey: "seal-key", state: "equipped" },
          ],
        },
      ],
      constraints: [
        {
          id: "c1",
          kind: "allen-before",
          fromSceneId: "ep1-s1",
          toSceneId: "ep2-s1",
          minMinutes: 160,
          maxMinutes: 240,
        },
      ],
      travelRules: [{ fromLocationId: "seoul", toLocationId: "busan", minTravelMinutes: 150 }],
      uniquePropKeys: ["seal-key"],
    });

    expect(report.feasible).toBe(true);
    expect(report.publicationReady).toBe(true);
    expect(report.temporalContradictions).toHaveLength(0);
    expect(report.stateViolations).toHaveLength(0);
    expect(report.schedules[1]!.earliestStartMinute).toBeGreaterThanOrEqual(840);
  });

  it("불가능한 지역 이동 시간과 같은 날 시간대 역행을 Bellman-Ford 음수 사이클로 잡아낸다", () => {
    const impossibleTravel = solveTemporalNarrativeTimeline({
      scenes: [
        {
          id: "s-seoul",
          episodeNumber: 3,
          cutOrder: 1,
          titleKo: "서울 옥상 결투",
          minDurationMinutes: 10,
          locationId: "seoul",
          participatingCharacterIds: ["jin"],
        },
        {
          id: "s-jeju",
          episodeNumber: 3,
          cutOrder: 2,
          titleKo: "제주 해안 접선",
          minDurationMinutes: 10,
          locationId: "jeju",
          participatingCharacterIds: ["jin"],
        },
      ],
      constraints: [
        {
          id: "too-fast",
          kind: "allen-before",
          fromSceneId: "s-seoul",
          toSceneId: "s-jeju",
          minMinutes: 5,
          maxMinutes: 20,
        },
      ],
      travelRules: [{ fromLocationId: "seoul", toLocationId: "jeju", minTravelMinutes: 95 }],
    });

    expect(impossibleTravel.feasible).toBe(false);
    expect(impossibleTravel.temporalContradictions[0]?.category).toBe("impossible-travel-time");
    expect(impossibleTravel.temporalContradictions[0]?.totalCycleSlackMinutes).toBeLessThan(0);

    const clockRegression = solveTemporalNarrativeTimeline({
      scenes: [
        {
          id: "s-sunset",
          episodeNumber: 4,
          cutOrder: 1,
          titleKo: "노을빛 부두",
          storyDayIndex: 1,
          timeOfDay: "sunset",
        },
        {
          id: "s-morning",
          episodeNumber: 4,
          cutOrder: 2,
          titleKo: "같은 날 아침 교실",
          storyDayIndex: 1,
          timeOfDay: "morning",
        },
      ],
      constraints: [
        {
          id: "after-sunset",
          kind: "allen-before",
          fromSceneId: "s-sunset",
          toSceneId: "s-morning",
          minMinutes: 10,
        },
      ],
    });

    expect(clockRegression.feasible).toBe(false);
    expect(clockRegression.temporalContradictions[0]?.category).toBe("time-of-day-regression");
  });

  it("부상 즉시 치유·파괴 소품 부활·찢어진 복장 자동 복구·유일 소품 중복 소유를 차단한다", () => {
    const report = solveTemporalNarrativeTimeline({
      uniquePropKeys: ["crown-blade"],
      scenes: [
        {
          id: "ep5-s1",
          episodeNumber: 5,
          cutOrder: 1,
          titleKo: "성채 전투",
          minDurationMinutes: 20,
          characterStates: [
            { characterId: "aria", category: "injury", itemKey: "arm-slash", state: "fresh-wound" },
            { characterId: "aria", category: "prop", itemKey: "crown-blade", state: "destroyed" },
            { characterId: "aria", category: "costume", itemKey: "cloak", state: "torn" },
          ],
        },
        {
          id: "ep5-s2",
          episodeNumber: 5,
          cutOrder: 2,
          titleKo: "직후 복도 추격",
          minDurationMinutes: 15,
          characterStates: [
            { characterId: "aria", category: "injury", itemKey: "arm-slash", state: "healthy" },
            { characterId: "aria", category: "prop", itemKey: "crown-blade", state: "equipped" },
            { characterId: "aria", category: "costume", itemKey: "cloak", state: "intact" },
            { characterId: "kyle", category: "prop", itemKey: "crown-blade", state: "equipped" },
          ],
        },
        {
          id: "ep5-flashback",
          episodeNumber: 5,
          cutOrder: 3,
          titleKo: "과거 회상",
          isFlashback: true,
          characterStates: [
            { characterId: "aria", category: "injury", itemKey: "arm-slash", state: "healthy" },
          ],
        },
      ],
      constraints: [
        {
          id: "seq",
          kind: "allen-meets",
          fromSceneId: "ep5-s1",
          toSceneId: "ep5-s2",
        },
      ],
    });

    expect(report.feasible).toBe(true);
    expect(report.publicationReady).toBe(false);
    // 부상 역행 + 파괴 소품 재장착 + 찢어진 망토 자동 복구 + 유일 소품 동시 장착 = 4건
    expect(report.stateViolations).toHaveLength(4);
  });
});

describe("wasm64-wave6-moonshot: 5. 서버리스 CDC(Gear/Rabin-Karp) 회차 델타 패키저", () => {
  it("표준 FIPS 180-4 SHA-256 및 64비트 FNV-1a 공식 테스트 벡터와 정확히 일치한다", () => {
    const empty = new Uint8Array(0);
    const abc = new TextEncoder().encode("abc");
    const singleA = new TextEncoder().encode("a");
    const multiBlock = new TextEncoder().encode(
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
    );

    expect(computeSha256Hex(empty)).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeSha256Hex(abc)).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(computeSha256Hex(multiBlock)).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );

    expect(computeFnv1a64Hex(empty)).toBe("cbf29ce484222325");
    expect(computeFnv1a64Hex(singleA)).toBe("af63dc4c8601ec8c");
  });

  it("512KiB 회차 중 일부 컷 삽입·수정 시 90% 이상 대역폭을 절감하고 비트 완전 복원한다", () => {
    const baseBundle = createDeterministicEpisodeBundle(512 * 1024, 0x77aa3311);

    // 앞부분(오프셋 96KiB 지점)에 신규 대사/컷 데이터 389바이트를 삽입해 뒤쪽 오프셋을 전부 밀어낸다.
    const editOffset = 96 * 1024;
    const insertedCutBytes = createDeterministicEpisodeBundle(389, 0x9911ffee);
    const targetBundle = new Uint8Array(baseBundle.byteLength + insertedCutBytes.byteLength);
    targetBundle.set(baseBundle.subarray(0, editOffset), 0);
    targetBundle.set(insertedCutBytes, editOffset);
    targetBundle.set(baseBundle.subarray(editOffset), editOffset + insertedCutBytes.byteLength);

    for (const algorithm of ["gear", "rabin-karp"] as const) {
      const manifest = buildEpisodeChunkManifest(baseBundle, { algorithm });
      expect(manifest.chunks.length).toBeGreaterThan(8);
      for (let i = 0; i < manifest.chunks.length - 1; i += 1) {
        const ch = manifest.chunks[i]!;
        expect(ch.byteLength).toBeGreaterThanOrEqual(CDC_DEFAULT_MIN_CHUNK_BYTES);
        expect(ch.byteLength).toBeLessThanOrEqual(CDC_DEFAULT_MAX_CHUNK_BYTES);
      }

      const delta = createEpisodeDeltaPatch(baseBundle, targetBundle, { algorithm });
      expect(delta.serverCostKrw).toBe(0);
      expect(delta.bandwidthSavingsRatio).toBeGreaterThan(0.9);

      const restored = applyEpisodeDeltaPatch(baseBundle, delta.patchBytes);
      expect(restored.verified).toBe(true);
      expect(restored.serverCostKrw).toBe(0);
      expect(restored.wholeFileSha256Hex).toBe(delta.targetManifest.wholeFileSha256Hex);
      expectBitExactBytes(restored.targetBytes, targetBundle);
    }
  });

  it("신규 회차 내부 중복 에셋을 자체 중복 제거하고 변조된 패치·원본 불일치를 즉시 거부한다", () => {
    const baseBundle = createDeterministicEpisodeBundle(64 * 1024, 0x11112222);
    const repeatedBlock = createDeterministicEpisodeBundle(96 * 1024, 0xdeadbeef);
    const targetBundle = new Uint8Array(baseBundle.byteLength + repeatedBlock.byteLength * 2);
    targetBundle.set(baseBundle, 0);
    targetBundle.set(repeatedBlock, baseBundle.byteLength);
    targetBundle.set(repeatedBlock, baseBundle.byteLength + repeatedBlock.byteLength);

    const delta = createEpisodeDeltaPatch(baseBundle, targetBundle);
    expect(delta.deduplicatedTargetBytes).toBeGreaterThan(0);
    const restored = applyEpisodeDeltaPatch(baseBundle, delta.patchBytes);
    expectBitExactBytes(restored.targetBytes, targetBundle);

    // 원본 1바이트 오염 시 SHA-256 불일치로 즉시 차단
    const wrongBase = baseBundle.slice();
    wrongBase[10] ^= 0xff;
    expect(() => applyEpisodeDeltaPatch(wrongBase, delta.patchBytes)).toThrow(/SHA-256/);

    // 패치 페이로드 마지막 바이트 변조 시 무결성 오류로 즉시 차단
    const tamperedPatch = delta.patchBytes.slice();
    tamperedPatch[tamperedPatch.length - 1] ^= 0x01;
    expect(() => applyEpisodeDeltaPatch(baseBundle, tamperedPatch)).toThrow();
  });

  it("빈 번들 및 최소 크기 미만 소형 번들도 무손실 왕복 복원한다", () => {
    const empty = new Uint8Array(0);
    const tiny = new TextEncoder().encode("toonstudio-wave6-tiny-cut-payload");
    const emptyDelta = createEpisodeDeltaPatch(empty, tiny);
    const restoredTiny = applyEpisodeDeltaPatch(empty, emptyDelta.patchBytes);
    expectBitExactBytes(restoredTiny.targetBytes, tiny);

    const shrinkDelta = createEpisodeDeltaPatch(tiny, empty);
    const restoredEmpty = applyEpisodeDeltaPatch(tiny, shrinkDelta.patchBytes);
    expect(restoredEmpty.targetBytes.byteLength).toBe(0);
  });
});

describe("wasm64-wave6-moonshot: 6. 경계 조건 및 교차 검증", () => {
  it("컷 프레임 클리핑 모드, 메타데이터 없는 비트맵 톤 FFT 추정, 명시적 환복·치유 예외를 처리한다", () => {
    const frame: CutFrameDefinition = {
      id: "clip-cut",
      bounds: { minX: 100, minY: 100, maxX: 300, maxY: 300 },
      diagonalGutters: [],
    };
    const clipped: BalloonClusterSculptInput = {
      clipFrame: frame,
      clipMode: "intersect-frame",
      primitives: [
        { kind: "ellipse", id: "overflow", centerX: 100, centerY: 200, radiusX: 60, radiusY: 40 },
      ],
    };
    // 컷 경계 바깥(x = 70)은 클리핑에 의해 외부(SDF > 0)로 잘리고, 안쪽(x = 130)은 내부(SDF < 0)다.
    expect(evaluateBalloonClusterSdf(clipped, 70, 200)).toBeGreaterThan(0);
    expect(evaluateBalloonClusterSdf(clipped, 130, 200)).toBeLessThan(0);

    // LPI 메타데이터가 없는 원시 래스터 타일도 자체 FFT 기본파 추정으로 모아레를 진단한다.
    const synth = synthesizeHalftoneTile({ sizePx: 64, lpi: 40, sourceDpi: 600, angleDeg: 45 });
    const rawBitmapReport = analyzeScreentoneMoireRisk({
      tile: { width: synth.width, height: synth.height, luminance: synth.luminance },
      canvasWidthPx: 1600,
    });
    expect(rawBitmapReport.viewportDiagnostics).toHaveLength(3);

    // Allen overlaps/simultaneous 제약 및 explicitRecoveryOrChange 명시 시 정상 통과 검증
    const solved = solveTemporalNarrativeTimeline({
      scenes: [
        {
          id: "a",
          episodeNumber: 1,
          cutOrder: 1,
          titleKo: "우천 격투",
          minDurationMinutes: 20,
          characterStates: [{ characterId: "reo", category: "costume", itemKey: "coat", state: "torn" }],
        },
        {
          id: "b",
          episodeNumber: 1,
          cutOrder: 2,
          titleKo: "동시 상황실",
          minDurationMinutes: 20,
        },
        {
          id: "c",
          episodeNumber: 1,
          cutOrder: 3,
          titleKo: "숙소 환복 후 재출발",
          minDurationMinutes: 10,
          characterStates: [
            {
              characterId: "reo",
              category: "costume",
              itemKey: "coat",
              state: "intact",
              explicitRecoveryOrChange: true,
            },
          ],
        },
      ],
      constraints: [
        { id: "sim", kind: "allen-simultaneous", fromSceneId: "a", toSceneId: "b" },
        { id: "next", kind: "allen-before", fromSceneId: "b", toSceneId: "c", minMinutes: 15 },
      ],
    });
    expect(solved.publicationReady).toBe(true);
    expect(solved.schedules[0]!.earliestStartMinute).toBe(solved.schedules[1]!.earliestStartMinute);
  });
});
