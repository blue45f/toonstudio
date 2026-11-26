import { describe, expect, it } from "vitest";

import {
  applyCameraAdjustmentToPanel,
  applyVestibularHighPassFilter,
  buildDynamicSymmetryArmature,
  CAMERA_SHAKE_PLANES,
  computeAssetFnv1a32Hex,
  computeAssetSha256Hex,
  computeBandRmsAmplitude,
  CrossEpisodeAssetDeduplicator,
  evaluatePanelComposition,
  MAX_HIT_STOP_FRAMES,
  MAX_VESTIBULAR_ROLL_DEG,
  MIN_HEALTHY_NEGATIVE_SPACE_RATIO,
  MIN_HIT_STOP_FRAMES,
  NAUSEA_BAND_MAX_HZ,
  NAUSEA_BAND_MIN_HZ,
  SERIES_ASSET_KINDS,
  synthesizeSafeCameraShake,
  type EpisodeAssetInput,
  type PanelCompositionInput,
} from "./index";

function makeDeterministicAssetBytes(seedTag: string, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  let state = 0x811c9dc5;
  for (let i = 0; i < seedTag.length; i += 1) {
    state ^= seedTag.charCodeAt(i);
    state = Math.imul(state, 0x01000193) >>> 0;
  }
  for (let i = 0; i < byteLength; i += 1) {
    state ^= i & 0xff;
    state = Math.imul(state, 0x27d4eb2d) >>> 0;
    out[i] = (state >>> 16) & 0xff;
  }
  return out;
}

describe("panel-dynamic-symmetry-coach (Jay Hambidge 동적 대칭·여백 비율·말풍선 안전 팬 코치)", () => {
  it("800×1280, 800×2000, 1536×1024 웹툰 컷에서 바로크·시니스터 역수선 직교성(|dot| < 1e-6)을 만족한다", () => {
    const dimensions = [
      { widthPx: 800, heightPx: 1280 },
      { widthPx: 800, heightPx: 2000 },
      { widthPx: 1536, heightPx: 1024 },
    ] as const;

    for (const { widthPx, heightPx } of dimensions) {
      const armature = buildDynamicSymmetryArmature(widthPx, heightPx);
      expect(armature.reciprocalSegments).toHaveLength(4);
      expect(armature.reciprocalNodes).toHaveLength(4);
      expect(armature.ruleOfThirdsNodes).toHaveLength(4);

      for (const seg of armature.reciprocalSegments) {
        expect(Math.abs(seg.orthogonalityDotProduct)).toBeLessThan(1e-6);

        // 반환된 좌표로부터 독립적으로 단위벡터 내적을 재검산한다
        const diag =
          seg.targetDiagonal === "baroque" ? armature.baroqueDiagonal : armature.sinisterDiagonal;
        const ddx = diag.end.xPx - diag.start.xPx;
        const ddy = diag.end.yPx - diag.start.yPx;
        const dLen = Math.hypot(ddx, ddy);

        const rdx = seg.intersection.xPx - seg.start.xPx;
        const rdy = seg.intersection.yPx - seg.start.yPx;
        const rLen = Math.hypot(rdx, rdy);

        expect(dLen).toBeGreaterThan(0);
        expect(rLen).toBeGreaterThan(0);
        const manualDot = (ddx * rdx + ddy * rdy) / (dLen * rLen);
        expect(Math.abs(manualDot)).toBeLessThan(1e-6);

        // 교점이 컷 내부에 정확히 위치하는지 확인
        expect(seg.intersection.xPx).toBeGreaterThan(0);
        expect(seg.intersection.xPx).toBeLessThan(widthPx);
        expect(seg.intersection.yPx).toBeGreaterThan(0);
        expect(seg.intersection.yPx).toBeLessThan(heightPx);
      }
    }
  });

  it("여백 고갈(negativeSpaceRatio < 0.28) 컷을 감지해 경고하고 배율·팬 보정으로 숨통과 점수를 회복한다", () => {
    const cols = 20;
    const rows = 32;
    // 전체 640칸 중 520칸 점유 -> 전경 81.25%, 여백 18.75% (< 0.28)
    const denseCells = new Float32Array(cols * rows);
    for (let i = 0; i < 520; i += 1) {
      denseCells[i] = 1;
    }

    const crowdedPanel: PanelCompositionInput = {
      widthPx: 800,
      heightPx: 1280,
      safeMarginPx: 28,
      focalPoints: [
        { id: "hero-eyes", kind: "eyes", xPx: 410, yPx: 650, preferredDiagonal: "baroque" },
        { id: "fist-hit", kind: "action-impact", xPx: 440, yPx: 740 },
      ],
      foregroundMask: { cols, rows, cells: denseCells },
      speechBalloons: [
        { id: "b-1", xPx: 90, yPx: 90, widthPx: 220, heightPx: 120 },
      ],
    };

    const beforeReport = evaluatePanelComposition(crowdedPanel);
    expect(beforeReport.negativeSpace.negativeSpaceRatio).toBeLessThan(
      MIN_HEALTHY_NEGATIVE_SPACE_RATIO,
    );
    expect(beforeReport.negativeSpace.isClaustrophobic).toBe(true);
    expect(beforeReport.warningsKo.some((msg) => msg.includes("여백 부족 경고"))).toBe(true);

    const adjustedPanel = applyCameraAdjustmentToPanel(
      crowdedPanel,
      beforeReport.recommendedAdjustment,
    );
    const afterReport = evaluatePanelComposition(adjustedPanel);

    expect(beforeReport.recommendedAdjustment.scale).toBeLessThan(1);
    expect(afterReport.negativeSpace.negativeSpaceRatio).toBeGreaterThanOrEqual(
      MIN_HEALTHY_NEGATIVE_SPACE_RATIO,
    );
    expect(afterReport.balloonViolationCount).toBe(0);
    expect(afterReport.scoreBreakdown.overallScore).toBeGreaterThan(
      beforeReport.scoreBreakdown.overallScore,
    );
  });

  it("어긋난 시선 중심을 말풍선 안전 여백 침범 없이 동적 대칭 교점으로 이동시켜 구도 점수를 높인다", () => {
    const cols = 16;
    const rows = 25;
    const balancedCells = new Float32Array(cols * rows);
    for (let r = 6; r < 18; r += 1) {
      for (let c = 4; c < 12; c += 1) {
        balancedCells[r * cols + c] = 0.85;
      }
    }

    const offCenterInput: PanelCompositionInput = {
      widthPx: 800,
      heightPx: 2000,
      safeMarginPx: 32,
      focalPoints: [
        {
          id: "protagonist-eyes",
          kind: "eyes",
          xPx: 590,
          yPx: 430,
          weight: 1.2,
          preferredDiagonal: "baroque",
        },
        {
          id: "lead-balloon-anchor",
          kind: "balloon-anchor",
          xPx: 470,
          yPx: 290,
        },
      ],
      foregroundMask: { cols, rows, cells: balancedCells },
      speechBalloons: [
        { id: "top-dialogue", xPx: 380, yPx: 210, widthPx: 220, heightPx: 140 },
        { id: "bottom-dialogue", xPx: 140, yPx: 1560, widthPx: 260, heightPx: 150 },
      ],
    };

    const before = evaluatePanelComposition(offCenterInput);
    expect(before.recommendedAdjustment.allBalloonsInsideSafeMargin).toBe(true);

    const panned = applyCameraAdjustmentToPanel(offCenterInput, before.recommendedAdjustment);
    const after = evaluatePanelComposition(panned);

    expect(after.balloonViolationCount).toBe(0);
    expect(after.scoreBreakdown.armatureAlignmentScore).toBeGreaterThan(
      before.scoreBreakdown.armatureAlignmentScore,
    );
    expect(after.scoreBreakdown.overallScore).toBeGreaterThan(before.scoreBreakdown.overallScore);

    for (const balloon of panned.speechBalloons ?? []) {
      expect(balloon.xPx).toBeGreaterThanOrEqual(32 - 1e-6);
      expect(balloon.yPx).toBeGreaterThanOrEqual(32 - 1e-6);
      expect(balloon.xPx + balloon.widthPx).toBeLessThanOrEqual(800 - 32 + 1e-6);
      expect(balloon.yPx + balloon.heightPx).toBeLessThanOrEqual(2000 - 32 + 1e-6);
    }
  });

  it("안전 여백 바깥에 걸친 말풍선을 감지하고 보정 후 안전 여백 안쪽으로 수렴시킨다", () => {
    const maskCells = new Uint8Array(16 * 16);
    maskCells.fill(100); // 100 / 255 ≈ 39.2% 전경, 여백 약 60.8%

    const unsafeBalloonInput: PanelCompositionInput = {
      widthPx: 1536,
      heightPx: 1024,
      safeMarginPx: 40,
      focalPoints: [{ id: "slash-impact", kind: "action-impact", xPx: 920, yPx: 420 }],
      foregroundMask: { cols: 16, rows: 16, cells: maskCells },
      speechBalloons: [
        { id: "edge-clipped", xPx: 8, yPx: 12, widthPx: 300, heightPx: 130 },
      ],
    };

    const before = evaluatePanelComposition(unsafeBalloonInput);
    expect(before.balloonViolationCount).toBe(1);
    expect(before.warningsKo.some((w) => w.includes("말풍선 안전 여백 이탈"))).toBe(true);

    const fixed = applyCameraAdjustmentToPanel(unsafeBalloonInput, before.recommendedAdjustment);
    const after = evaluatePanelComposition(fixed);
    expect(after.balloonViolationCount).toBe(0);
    expect(after.scoreBreakdown.overallScore).toBeGreaterThan(before.scoreBreakdown.overallScore);
  });
});

describe("motion-sickness-safe-camera-shake (역경직 2..5프레임·멀미 대역 억제·무변위 접근성)", () => {
  it("타격 정점에서 2..5프레임 이산 역경직 프리즈와 다중 평면 시차(전경>중경>배경)를 합성한다", () => {
    const timeline = synthesizeSafeCameraShake({
      totalFrames: 90,
      fps: 60,
      seed: 777,
      impacts: [
        { frameIndex: 10, traumaDelta: 0.42 },
        { frameIndex: 45, traumaDelta: 0.95, directionalBias: { x: 0.8, y: -0.5 } },
      ],
    });

    expect(timeline.hitStopWindows).toHaveLength(2);
    for (const win of timeline.hitStopWindows) {
      expect(win.durationFrames).toBeGreaterThanOrEqual(MIN_HIT_STOP_FRAMES);
      expect(win.durationFrames).toBeLessThanOrEqual(MAX_HIT_STOP_FRAMES);

      const firstFrozen = timeline.frames[win.startFrame];
      expect(firstFrozen?.isHitStopFrozen).toBe(true);
      for (let f = win.startFrame; f <= win.endFrameInclusive; f += 1) {
        const frame = timeline.frames[f];
        expect(frame?.isHitStopFrozen).toBe(true);
        expect(frame?.angularVelocityDegPerSec).toBe(0);
        expect(frame?.dx).toBe(firstFrozen?.dx);
        expect(frame?.dy).toBe(firstFrozen?.dy);
        expect(frame?.rollDeg).toBe(firstFrozen?.rollDeg);
      }
    }

    // 역경직 해제 직후 활성 프레임들에서 전경 > 중경 > 배경 변위 시차 계층을 확인한다
    let verifiedParallaxOrdering = false;
    for (let f = 51; f < 65; f += 1) {
      const frame = timeline.frames[f];
      if (frame === undefined || frame.isHitStopFrozen) continue;
      const fgMag = Math.hypot(frame.planes.foreground.dx, frame.planes.foreground.dy);
      const mgMag = Math.hypot(frame.planes.midground.dx, frame.planes.midground.dy);
      const bgMag = Math.hypot(frame.planes.background.dx, frame.planes.background.dy);
      if (mgMag > 1.5) {
        expect(fgMag).toBeGreaterThan(mgMag);
        expect(mgMag).toBeGreaterThan(bgMag);
        verifiedParallaxOrdering = true;
      }
    }
    expect(verifiedParallaxOrdering).toBe(true);
  });

  it("과도한 충격량과 설정치에도 모든 평면의 롤 각도(|rollDeg| <= 2.5°)와 각속도 상한을 엄격히 지킨다", () => {
    const maxAngVel = 36;
    const timeline = synthesizeSafeCameraShake({
      totalFrames: 150,
      fps: 60,
      maxRollDeg: 99, // 의도적으로 2.5°를 초과하는 요청을 주입해도 내부 상한이 방어해야 함
      maxAngularVelocityDegPerSec: maxAngVel,
      impacts: [
        { frameIndex: 5, traumaDelta: 3.5, hitStopFrames: 9 },
        { frameIndex: 25, traumaDelta: 4.0, hitStopFrames: 1 },
        { frameIndex: 60, traumaDelta: 2.0 },
      ],
    });

    expect(timeline.maxObservedAbsRollDeg).toBeLessThanOrEqual(MAX_VESTIBULAR_ROLL_DEG);
    expect(timeline.maxObservedAngularVelocityDegPerSec).toBeLessThanOrEqual(maxAngVel + 1e-6);

    for (const win of timeline.hitStopWindows) {
      expect(win.durationFrames).toBeGreaterThanOrEqual(MIN_HIT_STOP_FRAMES);
      expect(win.durationFrames).toBeLessThanOrEqual(MAX_HIT_STOP_FRAMES);
    }

    for (const frame of timeline.frames) {
      expect(Math.abs(frame.rollDeg)).toBeLessThanOrEqual(MAX_VESTIBULAR_ROLL_DEG);
      for (const plane of CAMERA_SHAKE_PLANES) {
        expect(Math.abs(frame.planes[plane].rollDeg)).toBeLessThanOrEqual(MAX_VESTIBULAR_ROLL_DEG);
        expect(frame.planes[plane].angularVelocityDegPerSec).toBeLessThanOrEqual(maxAngVel + 1e-6);
      }
    }
  });

  it("멀미 유발 저주파 대역(0.1–0.45 Hz) 표류를 85% 이상 감쇠하고 고주파 타격 진동은 보존한다", () => {
    const fps = 60;
    const sampleCount = 600; // 10초 시계열 (주파수 해상도 0.1 Hz)
    const compositeSignal = new Float64Array(sampleCount);

    for (let i = 0; i < sampleCount; i += 1) {
      const t = i / fps;
      const nauseaDrift = 18 * Math.sin(2 * Math.PI * 0.25 * t);
      const crispImpactWave = 6 * Math.sin(2 * Math.PI * 10.0 * t);
      compositeSignal[i] = nauseaDrift + crispImpactWave;
    }

    const filtered = applyVestibularHighPassFilter(compositeSignal, fps, 1.25);

    const beforeNauseaRms = computeBandRmsAmplitude(
      compositeSignal,
      fps,
      NAUSEA_BAND_MIN_HZ,
      NAUSEA_BAND_MAX_HZ,
    );
    const afterNauseaRms = computeBandRmsAmplitude(
      filtered,
      fps,
      NAUSEA_BAND_MIN_HZ,
      NAUSEA_BAND_MAX_HZ,
    );
    expect(afterNauseaRms / beforeNauseaRms).toBeLessThan(0.12);

    const beforeActionRms = computeBandRmsAmplitude(compositeSignal, fps, 9.5, 10.5);
    const afterActionRms = computeBandRmsAmplitude(filtered, fps, 9.5, 10.5);
    expect(afterActionRms / beforeActionRms).toBeGreaterThan(0.95);

    const timelineWithDrift = synthesizeSafeCameraShake({
      totalFrames: 600,
      fps: 60,
      impacts: [{ frameIndex: 30, traumaDelta: 0.7 }],
      ambientDrift: { frequencyHz: 0.25, amplitudePx: 20, rollAmplitudeDeg: 2.0 },
    });
    expect(timelineWithDrift.nauseaBandAttenuationRatio).toBeGreaterThan(0.85);
  });

  it("prefersReducedMotion === true일 때 전 프레임·전 평면에서 정확히 dx === 0 && dy === 0 && rollDeg === 0을 보장한다", () => {
    const timeline = synthesizeSafeCameraShake({
      totalFrames: 80,
      fps: 60,
      prefersReducedMotion: true,
      impacts: [
        { frameIndex: 0, traumaDelta: 1.0, hitStopFrames: 5 },
        { frameIndex: 20, traumaDelta: 1.0, directionalBias: { x: -1, y: 1 } },
      ],
      ambientDrift: { frequencyHz: 0.2, amplitudePx: 30, rollAmplitudeDeg: 4 },
    });

    expect(timeline.prefersReducedMotion).toBe(true);
    expect(timeline.maxObservedAbsRollDeg).toBe(0);
    expect(timeline.maxObservedTranslationPx).toBe(0);
    expect(timeline.hitStopWindows).toHaveLength(0);

    for (const frame of timeline.frames) {
      expect(Object.is(frame.dx, 0)).toBe(true);
      expect(Object.is(frame.dy, 0)).toBe(true);
      expect(Object.is(frame.rollDeg, 0)).toBe(true);
      for (const plane of CAMERA_SHAKE_PLANES) {
        const pose = frame.planes[plane];
        expect(pose.dx === 0 && pose.dy === 0 && pose.rollDeg === 0).toBe(true);
        expect(Object.is(pose.dx, 0)).toBe(true);
        expect(Object.is(pose.dy, 0)).toBe(true);
        expect(Object.is(pose.rollDeg, 0)).toBe(true);
      }
    }
  });
});

describe("cross-episode-asset-deduplicator (50화 연재 CAS 중복 제거 및 Mark-and-Sweep GC 검증)", () => {
  it("FIPS 180-4 SHA-256 표준 벡터와 일치하고 1단계 FNV-1a 불일치 시 2단계 해시를 생략한다", () => {
    const enc = new TextEncoder();
    expect(computeAssetFnv1a32Hex(new Uint8Array(0))).toBe("811c9dc5");
    expect(computeAssetSha256Hex(new Uint8Array(0))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(computeAssetSha256Hex(enc.encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      computeAssetSha256Hex(
        enc.encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      ),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");

    const dedup = new CrossEpisodeAssetDeduplicator();
    const knownLut = makeDeterministicAssetBytes("studio-sunset-lut.cube", 2048);
    dedup.ingestEpisode({
      episodeId: "ep-001",
      episodeNumber: 1,
      titleKo: "1화 시작",
      assets: [{ slotId: "lut-main", labelKo: "노을 색보정 LUT", kind: "color-lut-cube", payload: knownLut }],
    });

    const missProbe = dedup.probeAssetDeduplication(
      makeDeterministicAssetBytes("unseen-brush-tip", 1024),
    );
    expect(missProbe.stage1BucketMatched).toBe(false);
    expect(missProbe.stage2Sha256Computed).toBe(false);
    expect(missProbe.matchedContentHash).toBeNull();

    const hitProbe = dedup.probeAssetDeduplication(knownLut);
    expect(hitProbe.stage1BucketMatched).toBe(true);
    expect(hitProbe.stage2Sha256Computed).toBe(true);
    expect(hitProbe.matchedContentHash).toBe(computeAssetSha256Hex(knownLut));
  });

  it("50화 연재에서 반복 에셋(3D 소품·VRM 의상·브러시·.cube LUT·스크린톤)을 70% 초과 절감한다", () => {
    const dedup = new CrossEpisodeAssetDeduplicator();

    // 시즌 내내 반복 등장하는 주연/배경 공용 에셋 풀
    const heroUniformVrm = makeDeterministicAssetBytes("hero-school-uniform-vrm", 24_576);
    const rivalCoatVrm = makeDeterministicAssetBytes("rival-winter-coat-vrm", 20_480);
    const classroomDeskProp = makeDeterministicAssetBytes("classroom-desk-3d-prop", 16_384);
    const signatureGpenBrush = makeDeterministicAssetBytes("studio-dry-gpen-brush", 8_192);
    const masterCinemaLut = makeDeterministicAssetBytes("master-cinema-grade.cube", 12_288);
    const halftone60Lpi = makeDeterministicAssetBytes("screentone-60lpi-grad", 10_240);

    // 5개 아크별로 10화씩 공유되는 장소 소품 + 일부 회차 전용 소품
    const arcProps = Array.from({ length: 5 }, (_, arcIdx) =>
      makeDeterministicAssetBytes(`arc-${arcIdx + 1}-stage-prop`, 14_336),
    );

    for (let ep = 1; ep <= 50; ep += 1) {
      const arcIndex = Math.floor((ep - 1) / 10);
      const assets: EpisodeAssetInput[] = [
        { slotId: "outfit-hero", labelKo: "주인공 교복 VRM", kind: "vrm-outfit", payload: heroUniformVrm },
        { slotId: "prop-desk", labelKo: "교실 책상 3D", kind: "prop-3d", payload: classroomDeskProp },
        {
          slotId: "prop-arc",
          labelKo: `시즌 아크 ${arcIndex + 1} 배경 소품`,
          kind: "prop-3d",
          payload: arcProps[arcIndex] ?? classroomDeskProp,
        },
        { slotId: "brush-ink", labelKo: "주력 펜선 브러시", kind: "custom-brush", payload: signatureGpenBrush },
        { slotId: "lut-grade", labelKo: "시리즈 표준 LUT", kind: "color-lut-cube", payload: masterCinemaLut },
        { slotId: "tone-shadow", labelKo: "기본 망점 스크린톤", kind: "screentone", payload: halftone60Lpi },
      ];

      if (ep % 2 === 0) {
        assets.push({
          slotId: "outfit-rival",
          labelKo: "라이벌 코트 VRM",
          kind: "vrm-outfit",
          payload: rivalCoatVrm,
        });
      }
      if (ep % 5 === 0) {
        assets.push({
          slotId: `ep-${ep}-special-prop`,
          labelKo: `${ep}화 단독 이벤트 소품`,
          kind: "prop-3d",
          payload: makeDeterministicAssetBytes(`unique-ep-${ep}-relic`, 6_144),
        });
      }

      dedup.ingestEpisode({
        episodeId: `ep-${String(ep).padStart(3, "0")}`,
        episodeNumber: ep,
        titleKo: `제${ep}화`,
        assets,
      });
    }

    const manifest = dedup.buildSeriesPackManifest("series-academy-action-s1");
    expect(manifest.liveEpisodeCount).toBe(50);
    expect(manifest.danglingRefCount).toBe(0);
    expect(manifest.savingsRatio).toBeGreaterThan(0.7);
    expect(manifest.physicalBytes).toBeLessThan(manifest.logicalBytes * 0.3);
    expect(manifest.fingerprintStats.stage2Sha256VerifiedDedupCount).toBeGreaterThan(250);

    for (const kind of SERIES_ASSET_KINDS) {
      expect(manifest.kindSummaries[kind].slotReferenceCount).toBeGreaterThan(0);
      expect(manifest.kindSummaries[kind].savingsRatio).toBeGreaterThan(0.5);
    }
  });

  it("초안 교체·회차 폐기 후 Mark-and-Sweep GC가 고아 블롭만 회수하고 현역 50화 참조(danglingRefCount === 0)를 지킨다", () => {
    const dedup = new CrossEpisodeAssetDeduplicator();
    const sharedOutfit = makeDeterministicAssetBytes("shared-main-outfit", 12_000);
    const sharedBrush = makeDeterministicAssetBytes("shared-pen-brush", 4_096);
    const sharedTone = makeDeterministicAssetBytes("shared-halftone", 6_144);

    for (let ep = 1; ep <= 50; ep += 1) {
      dedup.ingestEpisode({
        episodeId: `ep-${String(ep).padStart(3, "0")}`,
        episodeNumber: ep,
        titleKo: `${ep}화 본편`,
        assets: [
          { slotId: "outfit", labelKo: "공용 의상", kind: "vrm-outfit", payload: sharedOutfit },
          { slotId: "brush", labelKo: "공용 브러시", kind: "custom-brush", payload: sharedBrush },
          { slotId: "tone", labelKo: "공용 톤", kind: "screentone", payload: sharedTone },
        ],
      });
    }

    // 12화에 임시 초안 전용 에셋 2개를 넣었다가 최종본으로 재등록해 고아 블롭을 발생시킨다
    const draftOnlyProp = makeDeterministicAssetBytes("ep12-temp-broken-sword-v0", 9_000);
    const draftOnlyLut = makeDeterministicAssetBytes("ep12-rejected-neon.cube", 5_000);
    dedup.ingestEpisode({
      episodeId: "ep-012",
      episodeNumber: 12,
      titleKo: "12화 임시 초안",
      assets: [
        { slotId: "outfit", labelKo: "공용 의상", kind: "vrm-outfit", payload: sharedOutfit },
        { slotId: "draft-prop", labelKo: "폐기 예정 검", kind: "prop-3d", payload: draftOnlyProp },
        { slotId: "draft-lut", labelKo: "폐기 예정 LUT", kind: "color-lut-cube", payload: draftOnlyLut },
      ],
    });

    const finalEp12Prop = makeDeterministicAssetBytes("ep12-royal-blade-final", 8_500);
    dedup.ingestEpisode({
      episodeId: "ep-012",
      episodeNumber: 12,
      titleKo: "12화 최종고",
      assets: [
        { slotId: "outfit", labelKo: "공용 의상", kind: "vrm-outfit", payload: sharedOutfit },
        { slotId: "brush", labelKo: "공용 브러시", kind: "custom-brush", payload: sharedBrush },
        { slotId: "final-prop", labelKo: "최종 검 소품", kind: "prop-3d", payload: finalEp12Prop },
      ],
    });

    // 번외 시험 컷 회차를 등록한 뒤 폐기(draft-scrapped) 처리
    const scrappedPilotAsset = makeDeterministicAssetBytes("scrapped-pilot-monster-3d", 15_000);
    dedup.ingestEpisode({
      episodeId: "ep-pilot-999",
      episodeNumber: 999,
      titleKo: "폐기된 파일럿 컷",
      assets: [
        { slotId: "outfit", labelKo: "공용 의상", kind: "vrm-outfit", payload: sharedOutfit },
        { slotId: "monster", labelKo: "파일럿 괴수", kind: "prop-3d", payload: scrappedPilotAsset },
      ],
    });
    expect(dedup.markEpisodeScrapped("ep-pilot-999")).toBe(true);

    const gcPlan = dedup.planMarkAndSweepGc();
    expect(gcPlan.refCountLedgerConsistent).toBe(true);
    expect(gcPlan.projectedDanglingRefCount).toBe(0);
    expect(gcPlan.orphanBlobs).toHaveLength(3);
    expect(gcPlan.reclaimableBytes).toBe(9_000 + 5_000 + 15_000);

    const gcReport = dedup.executeMarkAndSweepGc();
    expect(gcReport.reclaimedBlobCount).toBe(3);
    expect(gcReport.reclaimedBytes).toBe(29_000);
    expect(gcReport.purgedScrappedEpisodeCount).toBe(1);
    expect(gcReport.verifiedLiveEpisodeCount).toBe(50);
    expect(gcReport.danglingRefCount).toBe(0);
    expect(gcReport.refCountMismatchCount).toBe(0);

    const postManifest = dedup.buildSeriesPackManifest("series-post-gc");
    expect(postManifest.residentOrphanBytes).toBe(0);
    expect(postManifest.danglingRefCount).toBe(0);
    expect(postManifest.liveEpisodeCount).toBe(50);
  });

  it("pinnedContentHashes에 지정된 에셋은 현역 회차 참조가 없어도 GC에서 보존된다", () => {
    const dedup = new CrossEpisodeAssetDeduplicator();
    const studioMasterBrush = makeDeterministicAssetBytes("pinned-studio-master-brush", 7_168);
    const ephemeralTone = makeDeterministicAssetBytes("ephemeral-unused-tone", 3_072);
    const pinnedHash = computeAssetSha256Hex(studioMasterBrush);

    dedup.ingestEpisode({
      episodeId: "ep-draft-only",
      episodeNumber: 1,
      titleKo: "초안 회차",
      state: "draft-scrapped",
      assets: [
        { slotId: "master-brush", labelKo: "마스터 브러시", kind: "custom-brush", payload: studioMasterBrush },
        { slotId: "temp-tone", labelKo: "임시 톤", kind: "screentone", payload: ephemeralTone },
      ],
    });

    const report = dedup.executeMarkAndSweepGc({ pinnedContentHashes: [pinnedHash] });
    expect(report.reclaimedBlobCount).toBe(1);
    expect(report.reclaimedBytes).toBe(3_072);
    expect(report.remainingPhysicalBlobCount).toBe(1);
    expect(report.remainingPhysicalBytes).toBe(7_168);
    expect(report.danglingRefCount).toBe(0);
  });
});
