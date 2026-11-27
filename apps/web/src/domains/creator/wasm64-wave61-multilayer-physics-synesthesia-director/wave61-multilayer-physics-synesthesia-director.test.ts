import { describe, expect, it } from "vitest";
import {
  buildSynestheticScrollTimeline,
  createBallisticPhysicsNodes,
  createPhysicsChainNodes,
  evaluateScrollAudioHapticFrame,
  generateComicMotionSmearStrokes,
  planCulturalBackgroundAdaptation,
  slicePanelForMobileReading,
  stepMultiLayerSecondaryPhysics,
  type CulturalBackgroundPropInput,
  type CulturalLocale,
  type CulturalSeason,
  type PanelRect2D,
  type ProtectedPanelRegion,
  type SynestheticScrollCutInput,
} from "./index";

function rectContains(outer: PanelRect2D, inner: PanelRect2D): boolean {
  const eps = 1e-4;
  return (
    outer.x <= inner.x + eps &&
    outer.y <= inner.y + eps &&
    outer.x + outer.width >= inner.x + inner.width - eps &&
    outer.y + outer.height >= inner.y + inner.height - eps
  );
}

describe("Wave 61: 다층 레이어 2차 물리 연동 시뮬레이터 & 모션 스미어", () => {
  it("XPBD 스프링 체인이 강한 바람과 중력 아래에서도 세그먼트 길이를 정밀 보존하고 고정 앵커를 유지한다", () => {
    const chain = createPhysicsChainNodes({
      chainId: "hero-hair", compliance: 0, drag: 3.5, kind: "hair",
      segmentLengthPx: 26, segments: 6, startX: 200, startY: 120, startZ: 14,
    });
    const wind = { turbulenceAmplitude: 35, turbulenceFrequencyHz: 1.5, vx: 720, vy: -40, vz: 10 };
    let res = stepMultiLayerSecondaryPhysics({
      constraintIterations: 12, constraints: chain.constraints, dtSec: 1 / 60,
      nodes: chain.nodes, substeps: 6, timeSec: 0, wind,
    });
    for (let frame = 1; frame < 20; frame += 1) {
      res = stepMultiLayerSecondaryPhysics({
        constraintIterations: 12, constraints: chain.constraints, dtSec: 1 / 60,
        nodes: res.nodes, substeps: 6, timeSec: res.nextTimeSec, wind,
      });
    }

    expect(res.nodes[0].x).toBe(200);
    expect(res.nodes[0].y).toBe(120);
    expect(res.nodes[6].x).toBeGreaterThan(220);
    expect(res.diagnostics.maxConstraintErrorRatio).toBeLessThan(0.002);
    expect(res.diagnostics.meanConstraintErrorRatio).toBeLessThan(0.001);
  });

  it("바람 방향과 세기에 비례하여 망토 체인이 단조롭게 변위한다", () => {
    const cloak = createPhysicsChainNodes({
      chainId: "hero-cloak", compliance: 0, drag: 3.8, kind: "cloak",
      segmentLengthPx: 30, segments: 5, startX: 300, startY: 200,
    });
    const stepWithWind = (vx: number) => {
      const wind = { turbulenceAmplitude: 0, turbulenceFrequencyHz: 1, vx, vy: 0, vz: 0 };
      let res = stepMultiLayerSecondaryPhysics({
        constraints: cloak.constraints, dtSec: 1 / 60, nodes: cloak.nodes, substeps: 4, wind,
      });
      for (let f = 1; f < 12; f += 1) {
        res = stepMultiLayerSecondaryPhysics({
          constraints: cloak.constraints, dtSec: 1 / 60, nodes: res.nodes,
          substeps: 4, timeSec: res.nextTimeSec, wind,
        });
      }
      return res;
    };

    const tipGentleDx = stepWithWind(180).layerDisplacements.lineart[5].dx;
    const tipStrongDx = stepWithWind(900).layerDisplacements.lineart[5].dx;
    const tipOppositeDx = stepWithWind(-900).layerDisplacements.lineart[5].dx;
    expect(tipGentleDx).toBeGreaterThan(0);
    expect(tipStrongDx).toBeGreaterThan(tipGentleDx * 1.8);
    expect(tipOppositeDx).toBeLessThan(-tipGentleDx);
  });

  it("충격파 임펄스가 파편을 방사형으로 가속하고 각속도 회전 및 선화·채색·그림자 다층 동기 변위를 산출한다", () => {
    const debris = createBallisticPhysicsNodes({
      baseZ: 18, centerX: 400, centerY: 400, count: 8,
      groupId: "impact-rock", kind: "debris", spreadRadiusPx: 70,
    });
    const result = stepMultiLayerSecondaryPhysics({
      constraints: [], dtSec: 1 / 30, gravityPxPerSec2: { x: 0, y: 0, z: 0 }, nodes: debris,
      shockwaves: [{
        elapsedSec: 0.05, frontWidthPx: 85, originX: 400, originY: 400, originZ: 0,
        peakImpulsePxPerSec: 1400, radialLiftZ: 0.4, radiusPx: 320,
        spinImpulseRadPerSec: 10, waveSpeedPxPerSec: 900,
      }],
      substeps: 4, wind: { turbulenceAmplitude: 0, turbulenceFrequencyHz: 1, vx: 0, vy: 0, vz: 0 },
    });

    expect(result.layerDisplacements.lineart).toHaveLength(8);
    expect(result.layerDisplacements.color).toHaveLength(8);
    expect(result.layerDisplacements.shadow).toHaveLength(8);

    for (let i = 0; i < debris.length; i += 1) {
      const origDist = Math.hypot(debris[i].x - 400, debris[i].y - 400);
      const nextDist = Math.hypot(result.nodes[i].x - 400, result.nodes[i].y - 400);
      const lineart = result.layerDisplacements.lineart[i];
      const color = result.layerDisplacements.color[i];
      const shadow = result.layerDisplacements.shadow[i];

      expect(nextDist).toBeGreaterThan(origDist + 4);
      expect(Math.abs(result.nodes[i].angularVelocityRadPerSec)).toBeGreaterThan(0.5);
      expect(Math.hypot(color.dx - lineart.dx, color.dy - lineart.dy)).toBeLessThan(
        lineart.displacementMagnitudePx * 0.25 + 3,
      );
      expect(shadow.blurRadiusPx).toBeGreaterThan(1.5);
      expect(shadow.dz).toBe(0);
    }
  });

  it("빗줄기 입자가 중력과 측풍의 합성 속도 방향으로 자동 정렬된다", () => {
    const rain = createBallisticPhysicsNodes({
      centerX: 240, centerY: 100, count: 6, drag: 5.5,
      groupId: "storm-rain", kind: "rain", spreadRadiusPx: 50,
    });
    const wind = { turbulenceAmplitude: 0, turbulenceFrequencyHz: 1, vx: 650, vy: 200, vz: 0 };
    let res = stepMultiLayerSecondaryPhysics({ constraints: [], dtSec: 1 / 60, nodes: rain, substeps: 4, wind });
    for (let i = 0; i < 10; i += 1) {
      res = stepMultiLayerSecondaryPhysics({
        constraints: [], dtSec: 1 / 60, nodes: res.nodes, substeps: 4, timeSec: res.nextTimeSec, wind,
      });
    }
    for (const drop of res.nodes) {
      expect(drop.angleRad).toBeGreaterThan(0.15);
      expect(drop.angleRad).toBeLessThan(Math.PI * 0.48);
    }
  });

  it("머리 원형 충돌체가 머리카락 체인의 내부 침투를 차단한다", () => {
    const hair = createPhysicsChainNodes({
      chainId: "side-lock", compliance: 0, kind: "hair", radiusPx: 4,
      segmentLengthPx: 20, segments: 5, startX: 160, startY: 100,
    });
    const headCollider = { centerX: 205, centerY: 160, id: "head", radiusPx: 42 };
    const wind = { turbulenceAmplitude: 0, turbulenceFrequencyHz: 1, vx: 900, vy: 0, vz: 0 };
    let res = stepMultiLayerSecondaryPhysics({
      colliders: [headCollider], constraintIterations: 10, constraints: hair.constraints,
      dtSec: 1 / 60, nodes: hair.nodes, substeps: 4, wind,
    });
    for (let i = 0; i < 15; i += 1) {
      res = stepMultiLayerSecondaryPhysics({
        colliders: [headCollider], constraintIterations: 10, constraints: hair.constraints,
        dtSec: 1 / 60, nodes: res.nodes, substeps: 4, timeSec: res.nextTimeSec, wind,
      });
    }
    for (const node of res.nodes) {
      if (node.pinned) continue;
      expect(Math.hypot(node.x - headCollider.centerX, node.y - headCollider.centerY)).toBeGreaterThanOrEqual(
        headCollider.radiusPx + node.radiusPx - 1e-3,
      );
    }
  });

  it("모션 스미어 생성기가 속도 임계치 이상 노드에서만 단조 테이퍼드 폴리라인을 다층 출력한다", () => {
    const debris = createBallisticPhysicsNodes({
      centerX: 300, centerY: 300, count: 4, groupId: "fast-shards", kind: "debris", spreadRadiusPx: 40,
    });
    const stepped = stepMultiLayerSecondaryPhysics({
      constraints: [], dtSec: 1 / 60, nodes: debris,
      shockwaves: [{
        elapsedSec: 0, frontWidthPx: 60, originX: 300, originY: 300, originZ: 0,
        peakImpulsePxPerSec: 1200, radiusPx: 260, waveSpeedPxPerSec: 0,
      }],
      substeps: 4, wind: { turbulenceAmplitude: 0, turbulenceFrequencyHz: 1, vx: 0, vy: 0, vz: 0 },
    });
    const strokes = generateComicMotionSmearStrokes(stepped, {
      maxSmearLengthPx: 72, speedThresholdPxPerSec: 150, stylePreset: "shonen-sharp", taperSamples: 6,
    });

    expect(strokes).toHaveLength(12);
    expect(new Set(strokes.map((s) => s.layer))).toEqual(new Set(["lineart", "color", "shadow"]));
    for (const stroke of strokes) {
      expect(stroke.points).toHaveLength(6);
      expect(stroke.arcLengthPx).toBeGreaterThan(2);
      expect(stroke.arcLengthPx).toBeLessThanOrEqual(82);
      for (let i = 1; i < stroke.points.length; i += 1) {
        expect(stroke.points[i].widthPx).toBeLessThanOrEqual(stroke.points[i - 1].widthPx + 1e-6);
        expect(stroke.points[i].opacity).toBeLessThanOrEqual(stroke.points[i - 1].opacity + 1e-6);
      }
    }
    expect(generateComicMotionSmearStrokes(stepped, { speedThresholdPxPerSec: 50000 })).toHaveLength(0);
  });

  it("prefersReducedMotion 활성화 시 물리 변위와 모션 스미어를 안전하게 0으로 억제한다", () => {
    const chain = createPhysicsChainNodes({
      chainId: "calm-hair", kind: "hair", segmentLengthPx: 24, segments: 4, startX: 100, startY: 100,
    });
    const res = stepMultiLayerSecondaryPhysics({
      constraints: chain.constraints, dtSec: 1 / 60, nodes: chain.nodes, prefersReducedMotion: true,
      wind: { turbulenceAmplitude: 100, turbulenceFrequencyHz: 2, vx: 1200, vy: 0, vz: 0 },
    });
    expect(res.diagnostics.reducedMotionApplied).toBe(true);
    expect(res.diagnostics.maxDisplacementPx).toBe(0);
    expect(res.diagnostics.maxSpeedPxPerSec).toBe(0);
    expect(generateComicMotionSmearStrokes(res)).toHaveLength(0);
  });

  it("동일한 난류 바람·충격파 입력에 대해 비트 단위로 동일한 시뮬레이션 결과를 반환한다", () => {
    const chain = createPhysicsChainNodes({
      chainId: "det-cloak", kind: "cloak", segmentLengthPx: 22, segments: 5, startX: 150, startY: 150,
    });
    const input = {
      constraints: chain.constraints, dtSec: 1 / 60, nodes: chain.nodes, substeps: 4, timeSec: 1.25,
      wind: { gustStrength: 0.4, seed: 42, turbulenceAmplitude: 95, turbulenceFrequencyHz: 2.3, vx: 480, vy: -30, vz: 15 },
    };
    expect(stepMultiLayerSecondaryPhysics(input)).toEqual(stepMultiLayerSecondaryPhysics(input));
  });
});

describe("Wave 61: 공감각 스크롤 사운드·햅틱 디렉터", () => {
  const sampleEpisodeCuts: readonly SynestheticScrollCutInput[] = [
    {
      cutId: "cut-01-rain-intro", dialogues: [], dominantEmotion: "calm",
      sceneTags: ["rain-heavy"],
      sfxCues: [{ emphasis: 0.9, id: "sfx-rain", token: "쏴아아", yCenterPx: 400 }],
      yEndPx: 900, yStartPx: 0,
    },
    {
      cutId: "cut-02-tension-dialogue",
      dialogues: [{ emotion: "tense", id: "dlg-1", intensity: 0.9, text: "이 문 뒤에는 절대 들어가면 안 돼. 숨소리마저 들린다고.", yCenterPx: 1320 }],
      dominantEmotion: "tense", sceneTags: ["fire-crackle", "tension-drone"],
      sfxCues: [{ emphasis: 1.1, id: "sfx-heart", token: "두근두근", yCenterPx: 1450 }],
      yEndPx: 1800, yStartPx: 900,
    },
    {
      cutId: "cut-03-boss-impact",
      dialogues: [{ emotion: "shock", id: "dlg-2", intensity: 1.0, text: "피해!!", yCenterPx: 2150 }],
      dominantEmotion: "shock", sceneTags: ["battle-field"],
      sfxCues: [
        { emphasis: 1.4, id: "sfx-boom", token: "콰광!", yCenterPx: 2300 },
        { emphasis: 1.0, id: "sfx-rumble", token: "ゴゴゴ", yCenterPx: 2550 },
      ],
      yEndPx: 2800, yStartPx: 1800,
    },
  ];

  it("컷 메타데이터에서 정렬된 앰비언스·폴리·덕킹·햅틱 타임라인을 결정론적으로 구축한다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    expect(timeline.cutCount).toBe(3);
    expect(timeline.totalHeightPx).toBe(2800);
    expect(timeline.ambienceSegments).toHaveLength(4);
    expect(timeline.dialogueDuckingZones).toHaveLength(2);
    expect(timeline.foleyTriggers).toHaveLength(4);
    expect(timeline.hapticEvents.length).toBeGreaterThanOrEqual(4);

    for (let i = 1; i < timeline.foleyTriggers.length; i += 1) {
      expect(timeline.foleyTriggers[i].triggerYPx).toBeGreaterThanOrEqual(timeline.foleyTriggers[i - 1].triggerYPx);
    }
    for (let i = 1; i < timeline.hapticEvents.length; i += 1) {
      expect(timeline.hapticEvents[i].triggerYPx).toBeGreaterThanOrEqual(timeline.hapticEvents[i - 1].triggerYPx);
    }
  });

  it("인접 컷 경계(Y=900)에서 이전 빗소리 스템과 다음 장작·긴장 스템이 부드럽게 크로스페이드된다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts, { crossfadeBandPx: 200 });
    const beforeBoundary = evaluateScrollAudioHapticFrame({ scrollYPx: 450, timeline });
    const atBoundary = evaluateScrollAudioHapticFrame({ scrollYPx: 900, timeline });
    const afterBoundary = evaluateScrollAudioHapticFrame({ scrollYPx: 1300, timeline });

    expect(beforeBoundary.ambienceStems.map((s) => s.tag)).toEqual(["rain-heavy"]);
    expect(atBoundary.ambienceStems.map((s) => s.tag).sort()).toEqual(["fire-crackle", "rain-heavy", "tension-drone"]);
    const rainBefore = beforeBoundary.ambienceStems.find((s) => s.tag === "rain-heavy");
    const rainAtEdge = atBoundary.ambienceStems.find((s) => s.tag === "rain-heavy");
    expect(rainBefore).toBeDefined();
    expect(rainAtEdge).toBeDefined();
    expect(rainAtEdge!.rawGain).toBeLessThan(rainBefore!.rawGain);
    expect(rainAtEdge!.rawGain).toBeGreaterThan(rainBefore!.rawGain * 0.55);
    expect(afterBoundary.ambienceStems.map((s) => s.tag).sort()).toEqual(["fire-crackle", "tension-drone"]);
  });

  it("대사가 있는 컷 구간 진입 시 볼륨 덕킹과 로우패스 컷오프 하향이 자동 적용된다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    const silentCutFrame = evaluateScrollAudioHapticFrame({ scrollYPx: 350, timeline });
    const dialogueCutFrame = evaluateScrollAudioHapticFrame({ scrollYPx: 1350, timeline });

    expect(silentCutFrame.isDialogueDuckingActive).toBe(false);
    expect(silentCutFrame.dialogueDuckingGain).toBe(1);
    expect(silentCutFrame.duckingAttenuationDb).toBe(0);
    expect(dialogueCutFrame.isDialogueDuckingActive).toBe(true);
    expect(dialogueCutFrame.dialogueDuckingGain).toBeLessThan(0.75);
    expect(dialogueCutFrame.duckingAttenuationDb).toBeLessThan(-2.5);
    expect(dialogueCutFrame.masterLowpassCutoffHz).toBeLessThan(silentCutFrame.masterLowpassCutoffHz);
  });

  it("한국어·일본어·영어 의성어 토큰에 따라 서로 다른 폴리 카테고리 및 햅틱 펄스 패턴이 발화한다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    const heartFrame = evaluateScrollAudioHapticFrame({ scrollYPx: 1450, timeline });
    const boomFrame = evaluateScrollAudioHapticFrame({ scrollYPx: 2300, timeline });
    const rumbleFrame = evaluateScrollAudioHapticFrame({ scrollYPx: 2550, timeline });

    expect(heartFrame.foleyTriggers[0]?.foleyCategory).toBe("heartbeat");
    expect(heartFrame.activeHaptics.some((h) => h.patternKind === "heartbeat-double")).toBe(true);
    expect(boomFrame.foleyTriggers[0]?.foleyCategory).toBe("explosion");
    expect(boomFrame.activeHaptics.some((h) => h.patternKind === "impact-heavy")).toBe(true);
    expect(boomFrame.vibratePatternMs.length).toBeGreaterThanOrEqual(3);
    expect(rumbleFrame.foleyTriggers[0]?.foleyCategory).toBe("rumble");
    expect(rumbleFrame.activeHaptics.some((h) => h.patternKind === "rumble-sustained")).toBe(true);
  });

  it("muted=true 시 마스터·앰비언스·폴리 모든 오디오 게인을 엄격히 0으로 차단한다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    const mutedFrame = evaluateScrollAudioHapticFrame({
      preferences: { muted: true }, scrollVelocityPxPerSec: 1200, scrollYPx: 2300, timeline,
    });
    expect(mutedFrame.audioActive).toBe(false);
    expect(mutedFrame.masterGain).toBe(0);
    for (const stem of mutedFrame.ambienceStems) {
      expect(stem.gain).toBe(0);
      expect(stem.rawGain).toBe(0);
    }
    for (const foley of mutedFrame.foleyTriggers) expect(foley.gain).toBe(0);
  });

  it("prefersReducedMotion=true 시 모바일 햅틱과 고속 스크롤 필터 변조를 안전하게 비활성화한다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    const normalFrame = evaluateScrollAudioHapticFrame({ scrollVelocityPxPerSec: 1800, scrollYPx: 2300, timeline });
    const reducedFrame = evaluateScrollAudioHapticFrame({
      preferences: { prefersReducedMotion: true }, scrollVelocityPxPerSec: 1800, scrollYPx: 2300, timeline,
    });

    expect(normalFrame.activeHaptics.length).toBeGreaterThan(0);
    expect(normalFrame.velocityModulationFactor).toBeGreaterThan(0.5);
    expect(reducedFrame.activeHaptics).toHaveLength(0);
    expect(reducedFrame.vibratePatternMs).toEqual([]);
    expect(reducedFrame.hapticsSuppressedReason).toBe("prefers-reduced-motion");
    expect(reducedFrame.velocityModulationFactor).toBe(0);
    expect(reducedFrame.audioActive).toBe(true);
    expect(reducedFrame.foleyTriggers[0].gain).toBeLessThan(normalFrame.foleyTriggers[0].gain);
  });

  it("hapticsEnabled=false 시 햅틱만 끄고 오디오 재생과 덕킹은 정상 유지한다", () => {
    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    const frame = evaluateScrollAudioHapticFrame({
      preferences: { hapticsEnabled: false }, scrollYPx: 2300, timeline,
    });
    expect(frame.hapticsSuppressedReason).toBe("user-disabled");
    expect(frame.activeHaptics).toHaveLength(0);
    expect(frame.vibratePatternMs).toEqual([]);
    expect(frame.audioActive).toBe(true);
    expect(frame.foleyTriggers[0].gain).toBeGreaterThan(0);
  });

  it("음수·초과 스크롤 좌표와 빈 컷 타임라인에서도 NaN 없이 안전하게 평가한다", () => {
    const emptyFrame = evaluateScrollAudioHapticFrame({
      scrollYPx: -250, timeline: buildSynestheticScrollTimeline([]),
    });
    expect(emptyFrame.audioActive).toBe(false);
    expect(emptyFrame.ambienceStems).toEqual([]);
    expect(Number.isFinite(emptyFrame.focusYPx)).toBe(true);

    const timeline = buildSynestheticScrollTimeline(sampleEpisodeCuts);
    const overflowFrame = evaluateScrollAudioHapticFrame({
      scrollYPx: 999999, timeline, viewportHeightPx: 844,
    });
    expect(overflowFrame.focusYPx).toBe(timeline.totalHeightPx);
    expect(Number.isFinite(overflowFrame.masterLowpassCutoffHz)).toBe(true);
  });
});

describe("Wave 61: 모바일 자동 컷 분할 & 글로벌 문화권 비파괴 치환 엔진", () => {
  const wideCompositeRegions: readonly ProtectedPanelRegion[] = [
    { bounds: { height: 190, width: 170, x: 140, y: 240 }, id: "face-left", kind: "face" },
    { bounds: { height: 140, width: 260, x: 90, y: 60 }, fontSizePx: 26, id: "balloon-left", kind: "speech-balloon", linkedSpeakerId: "face-left" },
    { bounds: { height: 190, width: 170, x: 1180, y: 250 }, id: "face-right", kind: "face" },
    { bounds: { height: 140, width: 280, x: 1120, y: 70 }, fontSizePx: 26, id: "balloon-right", kind: "speech-balloon", linkedSpeakerId: "face-right" },
  ];

  it("가로 복합 컷(1600x900)을 모바일 세로 뷰포트(390px)로 분할할 때 얼굴과 말풍선을 단 하나도 절단하지 않는다", () => {
    const plan = slicePanelForMobileReading({
      heightPx: 900, panelId: "panel-spread-01", protectedRegions: wideCompositeRegions,
      readingDirection: "ltr", viewportWidthPx: 390, widthPx: 1600,
    });
    expect(plan.viewportWidthPx).toBe(390);
    expect(plan.slices).toHaveLength(2);
    expect(plan.integrityReport.allProtectedPreserved).toBe(true);
    expect(plan.integrityReport.slicedFaceIds).toEqual([]);
    expect(plan.integrityReport.slicedBalloonIds).toEqual([]);
    expect(plan.integrityReport.protectedFaceCount).toBe(2);
    expect(plan.integrityReport.protectedBalloonCount).toBe(2);
    expect(plan.slices[0].containedRegionIds).toEqual(expect.arrayContaining(["face-left", "balloon-left"]));
    expect(plan.slices[1].containedRegionIds).toEqual(expect.arrayContaining(["face-right", "balloon-right"]));
    for (const reg of wideCompositeRegions) {
      expect(plan.slices.some((s) => rectContains(s.sourceCropRect, reg.bounds))).toBe(true);
    }
  });

  it("뷰포트 너비를 모바일 가독성 구간(360~430px)으로 안전 클램핑하고 RTL 읽기 순서를 정확히 반전한다", () => {
    const ltrPlan = slicePanelForMobileReading({
      heightPx: 900, panelId: "panel-dir", protectedRegions: wideCompositeRegions,
      readingDirection: "ltr", viewportWidthPx: 280, widthPx: 1600,
    });
    const rtlPlan = slicePanelForMobileReading({
      heightPx: 900, panelId: "panel-dir", protectedRegions: wideCompositeRegions,
      readingDirection: "rtl", viewportWidthPx: 520, widthPx: 1600,
    });
    expect(ltrPlan.viewportWidthPx).toBe(360);
    expect(rtlPlan.viewportWidthPx).toBe(430);
    expect(ltrPlan.slices[0].containedRegionIds).toContain("face-left");
    expect(rtlPlan.slices[0].containedRegionIds).toContain("face-right");
    expect(rtlPlan.slices[1].containedRegionIds).toContain("face-left");
  });

  it("명목 크롭 폭을 초과하는 초대형 말풍선도 절단 대신 자동 줌아웃으로 100% 보존한다", () => {
    const giantBalloon: ProtectedPanelRegion = {
      bounds: { height: 200, width: 980, x: 240, y: 120 }, fontSizePx: 28,
      id: "balloon-giant", kind: "speech-balloon",
    };
    const plan = slicePanelForMobileReading({
      heightPx: 800, panelId: "panel-giant-balloon", protectedRegions: [giantBalloon],
      viewportWidthPx: 390, widthPx: 1600,
    });
    expect(plan.integrityReport.allProtectedPreserved).toBe(true);
    expect(plan.integrityReport.slicedBalloonIds).toEqual([]);
    expect(plan.slices[0].zoomOutAppliedForContainment).toBe(true);
    expect(rectContains(plan.slices[0].sourceCropRect, giantBalloon.bounds)).toBe(true);
    expect(plan.integrityReport.warnings.length).toBeGreaterThan(0);
  });

  it("인접 클러스터의 얼굴을 크롭 경계선이 절반 자르지 않도록 가장자리를 안전하게 후퇴시킨다", () => {
    const tightRegions: readonly ProtectedPanelRegion[] = [
      { bounds: { height: 180, width: 160, x: 80, y: 200 }, id: "face-a", kind: "face" },
      { bounds: { height: 180, width: 160, x: 560, y: 200 }, id: "face-b", kind: "face" },
    ];
    const plan = slicePanelForMobileReading({
      heightPx: 700, panelId: "panel-tight-edge", protectedRegions: tightRegions,
      viewportWidthPx: 390, widthPx: 1200,
    });
    expect(plan.integrityReport.allProtectedPreserved).toBe(true);
    for (const slice of plan.slices) {
      for (const face of tightRegions) {
        const s = slice.sourceCropRect;
        const b = face.bounds;
        const overlaps = s.x < b.x + b.width && s.x + s.width > b.x && s.y < b.y + b.height && s.y + s.height > b.y;
        if (overlaps) expect(rectContains(s, b)).toBe(true);
      }
    }
  });

  const baseBackgroundProps: readonly CulturalBackgroundPropInput[] = [
    { assetKey: "sign/kr/coffee-alley", bounds: { height: 120, width: 260, x: 100, y: 60 }, category: "signage", id: "prop-sign-01", textLabel: "밤하늘 커피" },
    { assetKey: "currency/krw/menu-price", bounds: { height: 48, width: 110, x: 420, y: 220 }, category: "currency", currencyAmount: 5400, id: "prop-price-01" },
    { assetKey: "traffic/kr/crosswalk-sign", bounds: { height: 180, width: 140, x: 760, y: 310 }, category: "traffic-hand", id: "prop-traffic-01", textLabel: "정지" },
    { assetKey: "prop/kr/winter-bungeoppang-stall", bounds: { height: 220, width: 260, x: 960, y: 380 }, category: "seasonal-prop", id: "prop-season-01", overlapsCharacterMask: true },
  ];

  it("5개 문화권(ko-KR, en-US, ja-JP, zh-TW, fr-FR) 치환 계획이 결정론적이며 모두 비파괴 계약을 준수한다", () => {
    const locales: readonly CulturalLocale[] = ["ko-KR", "en-US", "ja-JP", "zh-TW", "fr-FR"];
    const fingerprints = new Set<string>();
    for (const targetLocale of locales) {
      const planA = planCulturalBackgroundAdaptation({
        panelId: "ep04-cut12", props: baseBackgroundProps, season: "winter",
        sourceLocale: "ko-KR", targetLocale,
      });
      const planB = planCulturalBackgroundAdaptation({
        panelId: "ep04-cut12", props: baseBackgroundProps, season: "winter",
        sourceLocale: "ko-KR", targetLocale,
      });
      expect(planA).toEqual(planB);
      fingerprints.add(planA.planFingerprint);
      expect(planA.summary.totalProps).toBe(4);
      for (const item of planA.items) {
        expect(item.mode).toBe("non-destructive-override");
        expect(item.preserveOriginalLayer).toBe(true);
        expect(item.overlayLayerId).toContain(targetLocale);
        expect(item.transformPatch.preserveTextOrientation).toBe(true);
      }
      expect(planA.items.find((i) => i.propId === "prop-season-01")?.requiresArtistReview).toBe(true);
    }
    expect(fingerprints.size).toBe(5);
  });

  it("화폐 치환이 5개 문화권별 통화 기호·코드·소수 표기 규칙에 맞게 정확히 변환한다", () => {
    const cases: readonly [CulturalLocale, string, string][] = [
      ["ko-KR", "KRW", "₩5,400"], ["en-US", "USD", "$4.00"],
      ["ja-JP", "JPY", "¥600"], ["zh-TW", "TWD", "NT$130"], ["fr-FR", "EUR", "€"],
    ];
    for (const [targetLocale, expectedCode, expectedPart] of cases) {
      const plan = planCulturalBackgroundAdaptation({
        panelId: "ep04-price", props: [baseBackgroundProps[1]], season: "spring",
        sourceLocale: "ko-KR", targetLocale,
      });
      expect(plan.items[0].textPatch.currencyCode).toBe(expectedCode);
      expect(plan.items[0].textPatch.formattedValue).toContain(expectedPart);
      if (targetLocale === "fr-FR") {
        expect(plan.items[0].textPatch.formattedValue).toMatch(/^\d+,\d{2} €$/u);
      }
    }
  });

  it("좌우통행 전환(ko-KR RHT → ja-JP LHT) 시 좌우 반전하되 텍스트 정방향 보존을 강제하고, RHT→en-US는 반전 없이 mph로 현지화한다", () => {
    const toJapan = planCulturalBackgroundAdaptation({
      panelId: "ep05-road", props: [baseBackgroundProps[2]], season: "autumn",
      sourceLocale: "ko-KR", targetLocale: "ja-JP",
    });
    const toUs = planCulturalBackgroundAdaptation({
      panelId: "ep05-road", props: [baseBackgroundProps[2]], season: "autumn",
      sourceLocale: "ko-KR", targetLocale: "en-US",
    });
    expect(toJapan.trafficHandChanged).toBe(true);
    expect(toJapan.targetTrafficHand).toBe("LHT");
    expect(toJapan.summary.trafficFlippedCount).toBe(1);
    expect(toJapan.items[0].transformPatch.horizontalFlip).toBe(true);
    expect(toJapan.items[0].transformPatch.preserveTextOrientation).toBe(true);
    expect(toJapan.items[0].textPatch.localizedLabel).toBe("止まれ");

    expect(toUs.trafficHandChanged).toBe(false);
    expect(toUs.targetTrafficHand).toBe("RHT");
    expect(toUs.summary.trafficFlippedCount).toBe(0);
    expect(toUs.items[0].transformPatch.horizontalFlip).toBe(false);
    expect(toUs.items[0].transformPatch.speedUnit).toBe("mph");
    expect(toUs.items[0].textPatch.localizedLabel).toBe("STOP");
  });

  it("4계절 × 5개 문화권 매트릭스 전체에서 고유한 계절 소품 치환 자산 키와 라벨을 생성한다", () => {
    const locales: readonly CulturalLocale[] = ["ko-KR", "en-US", "ja-JP", "zh-TW", "fr-FR"];
    const seasons: readonly CulturalSeason[] = ["spring", "summer", "autumn", "winter"];
    const uniqueAssets = new Set<string>();
    for (const targetLocale of locales) {
      for (const season of seasons) {
        const plan = planCulturalBackgroundAdaptation({
          panelId: `season-${targetLocale}-${season}`, props: [baseBackgroundProps[3]],
          season, sourceLocale: "ko-KR", targetLocale,
        });
        expect(plan.items[0].replacementAssetKey.length).toBeGreaterThan(8);
        expect(plan.items[0].textPatch.localizedLabel.length).toBeGreaterThan(2);
        uniqueAssets.add(plan.items[0].replacementAssetKey);
      }
    }
    expect(uniqueAssets.size).toBe(20);
  });

  it("세로쓰기 문화권(ja-JP, zh-TW) 간판 치환 시 writingMode=vertical-rl 및 검토 플래그를 부여한다", () => {
    const jpPlan = planCulturalBackgroundAdaptation({
      panelId: "ep06-alley", props: [baseBackgroundProps[0]], season: "summer",
      sourceLocale: "ko-KR", targetLocale: "ja-JP",
    });
    const twPlan = planCulturalBackgroundAdaptation({
      panelId: "ep06-alley", props: [baseBackgroundProps[0]], season: "summer",
      sourceLocale: "ko-KR", targetLocale: "zh-TW",
    });
    const frPlan = planCulturalBackgroundAdaptation({
      panelId: "ep06-alley", props: [baseBackgroundProps[0]], season: "summer",
      sourceLocale: "ko-KR", targetLocale: "fr-FR",
    });
    expect(jpPlan.items[0].transformPatch.writingMode).toBe("vertical-rl");
    expect(jpPlan.items[0].requiresArtistReview).toBe(true);
    expect(twPlan.items[0].transformPatch.writingMode).toBe("vertical-rl");
    expect(twPlan.items[0].requiresArtistReview).toBe(true);
    expect(frPlan.items[0].transformPatch.writingMode).toBe("horizontal-tb");
    expect(frPlan.items[0].requiresArtistReview).toBe(false);
  });
});
