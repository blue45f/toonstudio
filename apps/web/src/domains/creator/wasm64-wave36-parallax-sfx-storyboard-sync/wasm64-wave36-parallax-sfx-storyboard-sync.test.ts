import { describe, expect, it } from "vitest";

import {
  DEFAULT_PARALLAX_CAMERA_OPTICS,
  PARALLAX_PLANE_PAINTER_ORDER,
  SFX_EMOTION_PROFILES,
  classifyCutLayerDepthPlane,
  computeThinLensCocRadiusPx,
  decomposeCutIntoParallaxPlanes,
  estimateKoreanBalloonBox,
  evaluateCubicBezierPoint,
  evaluateCubicBezierTangent,
  evaluateParallaxPlaneTransform,
  generateProceduralActionLines,
  isPointInsideSafeEllipse,
  syncStoryboardWithManuscript,
  warpSfxGlyphFramesAlongSpine,
  type BaseSyncedDialogueAnchor,
  type CubicBezierSpine2D,
  type CutLayerInput,
  type ManuscriptBalloonNode,
  type SafeZoneEllipse,
  type SfxEmotionProfileId,
  type SfxGlyphFrameInput,
  type StoryboardDialogueAnchor,
} from "./index";

const SAMPLE_CUT_LAYERS: readonly CutLayerInput[] = [
  { bounds: { x: 0, y: 0, width: 800, height: 1280 }, id: "layer-sky", name: "노을 하늘 원경", semanticRole: "sky-backdrop", zIndex: 0 },
  { bounds: { x: 40, y: 180, width: 720, height: 960 }, id: "layer-arch", name: "한옥 회랑 기둥", semanticRole: "architecture", zIndex: 10 },
  { bounds: { x: 210, y: 260, width: 380, height: 920 }, id: "layer-hero", name: "주인공 클로즈업", semanticRole: "character-main", zIndex: 20 },
  { bounds: { x: 460, y: 180, width: 240, height: 160 }, id: "layer-balloon", lockedToCutFrame: true, name: "대사 말풍선", semanticRole: "speech-balloon", zIndex: 25 },
  { bounds: { x: 0, y: 740, width: 800, height: 540 }, id: "layer-petals", name: "전경 흩날리는 벚꽃잎", semanticRole: "fx-foreground", zIndex: 30 },
];

const SAMPLE_SPINE: CubicBezierSpine2D = {
  p0: { x: 80, y: 420 },
  p1: { x: 260, y: 240 },
  p2: { x: 520, y: 260 },
  p3: { x: 720, y: 180 },
};

const SAMPLE_SFX_GLYPHS: readonly SfxGlyphFrameInput[] = [
  { char: "쿠", glyphId: "g-1", widthPx: 72, heightPx: 76 },
  { char: "구", glyphId: "g-2", widthPx: 72, heightPx: 76 },
  { char: "궁", glyphId: "g-3", widthPx: 76, heightPx: 80 },
  { char: "!", glyphId: "g-4", widthPx: 36, heightPx: 82 },
];

function makeBaseAnchor(anchorId: string, dialogueText: string, overrides: Partial<BaseSyncedDialogueAnchor> = {}): BaseSyncedDialogueAnchor {
  return {
    anchorId, balloonShape: "ellipse", cutId: "cut-1", cutOrderIndex: 0, dialogueText,
    position: { x: 180, y: 160 }, readingOrderIndex: 0, size: { widthPx: 220, heightPx: 110 }, speakerId: "hero",
    ...overrides,
  };
}

function makeStoryAnchor(anchorId: string, dialogueText: string, overrides: Partial<StoryboardDialogueAnchor> = {}): StoryboardDialogueAnchor {
  return {
    anchorId, balloonShape: "ellipse", cutId: "cut-1", cutOrderIndex: 0, dialogueText, readingOrderIndex: 0, speakerId: "hero",
    ...overrides,
  };
}

function makeManuBalloon(anchorId: string, dialogueText: string, overrides: Partial<ManuscriptBalloonNode> = {}): ManuscriptBalloonNode {
  return {
    anchorId, balloonShape: "ellipse", cutId: "cut-1", cutOrderIndex: 0, dialogueText,
    position: { x: 180, y: 160 }, readingOrderIndex: 0, size: { widthPx: 220, heightPx: 110 }, speakerId: "hero",
    ...overrides,
  };
}

describe("wasm64-wave36-parallax-sfx-storyboard-sync", () => {
  describe("parallax-25d-cut-depth-decomposer", () => {
    it("의미론적 역할·깊이 힌트·한글 레이어명에 따라 4단계 깊이 평면을 화가 순서로 분해한다", () => {
      const result = decomposeCutIntoParallaxPlanes(SAMPLE_CUT_LAYERS, { cutHeightPx: 1280, cutWidthPx: 800 });
      expect(result.planes.map((p) => p.planeId)).toEqual(PARALLAX_PLANE_PAINTER_ORDER);
      expect(result.layerPlaneAssignments["layer-sky"]).toBe("backdrop");
      expect(result.layerPlaneAssignments["layer-arch"]).toBe("midground");
      expect(result.layerPlaneAssignments["layer-hero"]).toBe("character");
      expect(result.layerPlaneAssignments["layer-balloon"]).toBe("character");
      expect(result.layerPlaneAssignments["layer-petals"]).toBe("foreground");
    });

    it("수동 오버라이드 및 깊이 힌트 구간(0..1)과 한글 이름 휴리스틱이 일관되게 작동한다", () => {
      const box = { x: 0, y: 0, width: 50, height: 50 };
      expect(classifyCutLayerDepthPlane({ bounds: box, depthHint: 0.95, id: "o1", name: "배경", planeOverride: "foreground", zIndex: 0 }, 0)).toBe("foreground");
      expect(classifyCutLayerDepthPlane({ bounds: box, depthHint: 0.1, id: "d1", name: "a", zIndex: 1 }, 0.5)).toBe("foreground");
      expect(classifyCutLayerDepthPlane({ bounds: box, depthHint: 0.4, id: "d2", name: "b", zIndex: 1 }, 0.5)).toBe("character");
      expect(classifyCutLayerDepthPlane({ bounds: box, depthHint: 0.7, id: "d3", name: "c", zIndex: 1 }, 0.5)).toBe("midground");
      expect(classifyCutLayerDepthPlane({ bounds: box, depthHint: 0.9, id: "d4", name: "d", zIndex: 1 }, 0.5)).toBe("backdrop");
      expect(classifyCutLayerDepthPlane({ bounds: box, id: "n1", name: "앞쪽 안개 입자", zIndex: 1 }, 0.1)).toBe("foreground");
      expect(classifyCutLayerDepthPlane({ bounds: box, id: "n2", name: "원경 산맥", zIndex: 1 }, 0.9)).toBe("backdrop");
    });

    it("전경 차폐 레이어와 배경 평면 사이의 최대 상대 변위를 덮는 인페인팅 스커트 여백을 계산한다", () => {
      const result = decomposeCutIntoParallaxPlanes(SAMPLE_CUT_LAYERS, {
        cutHeightPx: 1280, cutWidthPx: 800, maxScrollAmplitudePx: 120, maxTiltAmplitudePx: 32,
      });
      const { backdrop, character, foreground, midground } = result.planesById;
      expect(backdrop.requiredSkirtMarginPx).toBeGreaterThan(midground.requiredSkirtMarginPx);
      expect(midground.requiredSkirtMarginPx).toBeGreaterThan(character.requiredSkirtMarginPx);
      expect(foreground.requiredSkirtMarginPx).toBeGreaterThanOrEqual(Math.ceil(Math.abs(foreground.signedParallaxGain) * 120));

      for (const plane of result.planes) {
        for (const scrollProgress of [-1, -0.5, 0, 0.5, 1]) {
          const tr = evaluateParallaxPlaneTransform(plane, {
            dampingCurve: "linear", horizontalTiltNormalized: 1, prefersReducedMotion: false, scrollProgress,
          });
          expect(tr.disocclusionSafe).toBe(true);
          expect(Math.abs(tr.translateYPx)).toBeLessThanOrEqual(plane.requiredSkirtMargins.topPx);
          expect(Math.abs(tr.translateXPx)).toBeLessThanOrEqual(plane.requiredSkirtMargins.leftPx);
        }
      }
    });

    it("prefersReducedMotion 활성화 시 모든 깊이 평면의 패럴랙스 변위를 엄격히 0으로 클램핑한다", () => {
      const result = decomposeCutIntoParallaxPlanes(SAMPLE_CUT_LAYERS, {
        cutHeightPx: 1280, cutWidthPx: 800, maxScrollAmplitudePx: 140, maxTiltAmplitudePx: 40,
      });
      for (const plane of result.planes) {
        const tr = evaluateParallaxPlaneTransform(plane, {
          horizontalTiltNormalized: -0.9, prefersReducedMotion: true, scrollProgress: 0.95,
        });
        expect(tr.translateXPx).toBe(0);
        expect(tr.translateYPx).toBe(0);
        expect(Object.is(tr.translateXPx, -0)).toBe(false);
        expect(Object.is(tr.translateYPx, -0)).toBe(false);
        expect(tr.skirtUtilizationRatio).toBe(0);
        expect(tr.motionClampedByAccessibility).toBe(true);
      }
    });

    it("초점 평면(character = 2.5m)의 착란원 반경(cocRadiusPx)은 정확히 0이고 비초점 평면과 조리개 값에 반응한다", () => {
      const result = decomposeCutIntoParallaxPlanes(SAMPLE_CUT_LAYERS, {
        cameraOptics: { apertureFStop: 2.0, focusDistanceMeters: 2.5 }, cutHeightPx: 1280, cutWidthPx: 800,
      });
      expect(result.planesById.character.cocRadiusPx).toBe(0);
      expect(result.planesById.foreground.cocRadiusPx).toBeGreaterThan(0);
      expect(result.planesById.backdrop.cocRadiusPx).toBeGreaterThan(result.planesById.midground.cocRadiusPx);

      const wideCoc = computeThinLensCocRadiusPx(14, 1280, { ...DEFAULT_PARALLAX_CAMERA_OPTICS, apertureFStop: 2.0 });
      const narrowCoc = computeThinLensCocRadiusPx(14, 1280, { ...DEFAULT_PARALLAX_CAMERA_OPTICS, apertureFStop: 8.0 });
      expect(narrowCoc).toBeCloseTo(wideCoc / 4, 5);

      const rackBackdrop = evaluateParallaxPlaneTransform(result.planesById.backdrop, { focusDistanceMeters: 14.0, prefersReducedMotion: false, scrollProgress: 0.3 });
      const rackChar = evaluateParallaxPlaneTransform(result.planesById.character, { focusDistanceMeters: 14.0, prefersReducedMotion: false, scrollProgress: 0.3 });
      expect(rackBackdrop.cocRadiusPx).toBe(0);
      expect(rackChar.cocRadiusPx).toBeGreaterThan(0);
    });

    it("프레임 고정 레이어만 포함된 평면과 빈 레이어 평면은 스크롤 시에도 이동하지 않는다", () => {
      const fixedOnly = decomposeCutIntoParallaxPlanes(
        [{ bounds: { x: 100, y: 100, width: 200, height: 120 }, id: "fixed-ui", lockedToCutFrame: true, name: "전경 고정 자막", planeOverride: "foreground", zIndex: 50 }],
        { cutHeightPx: 1000, cutWidthPx: 800, maxScrollAmplitudePx: 100 },
      );
      expect(evaluateParallaxPlaneTransform(fixedOnly.planesById.foreground, { prefersReducedMotion: false, scrollProgress: 1 }).translateYPx).toBe(0);
      expect(evaluateParallaxPlaneTransform(fixedOnly.planesById.backdrop, { prefersReducedMotion: false, scrollProgress: 1 }).translateYPx).toBe(0);
    });
  });

  describe("affective-sfx-vector-ribbon-generator", () => {
    it("4종 감정 프로파일 모두 양의 면적을 가진 유효 사각형 글리프 쿼드를 스플라인 호 길이 순으로 생성한다", () => {
      const profiles: readonly SfxEmotionProfileId[] = ["impact-burst", "whisper-tremor", "speed-whoosh", "heavy-thud"];
      for (const emotionProfile of profiles) {
        const res = warpSfxGlyphFramesAlongSpine({ emotionProfile, glyphs: SAMPLE_SFX_GLYPHS, seed: 777, spine: SAMPLE_SPINE });
        expect(res.warpedGlyphs).toHaveLength(SAMPLE_SFX_GLYPHS.length);
        expect(res.totalSpineArcLengthPx).toBeGreaterThan(600);
        expect(res.ribbonBounds.width).toBeGreaterThan(0);
        let prevArc = -1;
        for (const glyph of res.warpedGlyphs) {
          expect(glyph.arcDistancePx).toBeGreaterThan(prevArc);
          expect(glyph.quadAreaPx2).toBeGreaterThan(100);
          prevArc = glyph.arcDistancePx;
        }
      }
    });

    it("감정 프로파일별 고유 기하 특성(폭발 증폭·질주 테이퍼 전단·중력 침강·미세 떨림)이 정량적으로 구분된다", () => {
      const burst = warpSfxGlyphFramesAlongSpine({ emotionProfile: "impact-burst", glyphs: SAMPLE_SFX_GLYPHS, spine: SAMPLE_SPINE });
      const whoosh = warpSfxGlyphFramesAlongSpine({ emotionProfile: "speed-whoosh", glyphs: SAMPLE_SFX_GLYPHS, spine: SAMPLE_SPINE });
      const thud = warpSfxGlyphFramesAlongSpine({ emotionProfile: "heavy-thud", glyphs: SAMPLE_SFX_GLYPHS, spine: SAMPLE_SPINE });
      const tremorA = warpSfxGlyphFramesAlongSpine({ emotionProfile: "whisper-tremor", glyphs: SAMPLE_SFX_GLYPHS, seed: 1234, spine: SAMPLE_SPINE });
      const tremorB = warpSfxGlyphFramesAlongSpine({ emotionProfile: "whisper-tremor", glyphs: SAMPLE_SFX_GLYPHS, seed: 1234, spine: SAMPLE_SPINE });

      expect(burst.warpedGlyphs[3]?.scaleY ?? 0).toBeGreaterThan((burst.warpedGlyphs[0]?.scaleY ?? 1) * 1.4);
      expect(whoosh.warpedGlyphs[0]?.scaleX ?? 0).toBeGreaterThan((whoosh.warpedGlyphs[3]?.scaleX ?? 1) * 1.5);
      expect(whoosh.warpedGlyphs[0]?.shearTan ?? 0).toBeGreaterThan(0.4);

      const lastThud = thud.warpedGlyphs[3];
      expect(lastThud).toBeDefined();
      if (lastThud) {
        const spinePt = evaluateCubicBezierPoint(SAMPLE_SPINE, lastThud.spineParamT);
        expect(lastThud.scaleX).toBeGreaterThan(lastThud.scaleY * 1.3);
        expect(lastThud.anchor.y).toBeGreaterThan(spinePt.y + 8);
      }
      expect(SFX_EMOTION_PROFILES["heavy-thud"].strokeWeightMultiplier).toBeGreaterThan(1.4);
      expect(tremorA.warpedGlyphs).toEqual(tremorB.warpedGlyphs);
    });

    it("빈 글리프 배열과 축퇴 스플라인 접선에서도 유한한 안전 결과를 반환한다", () => {
      const emptyRes = warpSfxGlyphFramesAlongSpine({ emotionProfile: "impact-burst", glyphs: [], spine: SAMPLE_SPINE });
      expect(emptyRes.warpedGlyphs).toHaveLength(0);
      expect(emptyRes.ribbonBounds.width).toBe(0);

      const degenerateTangent = evaluateCubicBezierTangent(
        { p0: { x: 10, y: 10 }, p1: { x: 10, y: 10 }, p2: { x: 10, y: 10 }, p3: { x: 50, y: 10 } },
        0,
      );
      expect(degenerateTangent).toEqual({ x: 1, y: 0 });
    });

    it("방사형 집중선(radial-focus)이 회전된 인물 얼굴 및 말풍선 안전 타원 내부를 단 1점도 침범하지 않는다", () => {
      const safeEllipses: readonly SafeZoneEllipse[] = [
        { center: { x: 400, y: 460 }, featherPaddingPx: 8, id: "hero-face", radiusX: 110, radiusY: 145, rotationDeg: -12 },
        { center: { x: 590, y: 270 }, featherPaddingPx: 6, id: "balloon-1", radiusX: 125, radiusY: 85, rotationDeg: 18 },
      ];
      const result = generateProceduralActionLines({
        focusCenter: { x: 400, y: 460 }, innerClearRadiusPx: 70, kind: "radial-focus",
        lineCount: 72, panelBounds: { x: 0, y: 0, width: 800, height: 1000 }, safeEllipses, seed: 99,
      });

      expect(result.segments.length).toBeGreaterThan(60);
      expect(result.clippedLineCount).toBe(72);
      expect(result.safeZoneViolationCount).toBe(0);

      for (const seg of result.segments) {
        expect(seg.startWidthPx).toBeGreaterThan(seg.endWidthPx);
        for (let step = 0; step <= 20; step += 1) {
          const u = step / 20;
          const pt = { x: seg.start.x + (seg.end.x - seg.start.x) * u, y: seg.start.y + (seg.end.y - seg.start.y) * u };
          for (const ellipse of safeEllipses) {
            expect(isPointInsideSafeEllipse(pt, ellipse, 1e-5)).toBe(false);
          }
        }
      }
    });

    it("사선 평행 속도선(parallel-speed)이 안전 타원을 관통할 때 앞·뒤 외곽 구간으로 정확히 분할 클리핑된다", () => {
      const centerBalloon: SafeZoneEllipse = {
        center: { x: 400, y: 300 }, featherPaddingPx: 4, id: "center-balloon", radiusX: 140, radiusY: 110, rotationDeg: 25,
      };
      const speedResult = generateProceduralActionLines({
        directionAngleDeg: -22, kind: "parallel-speed", lineCount: 48,
        panelBounds: { x: 0, y: 0, width: 800, height: 600 }, safeEllipses: [centerBalloon], seed: 2026,
      });

      expect(speedResult.clippedLineCount).toBeGreaterThan(10);
      expect(speedResult.safeZoneViolationCount).toBe(0);
      expect(speedResult.segments.filter((s) => s.subSegmentIndex === 1).length).toBeGreaterThan(5);

      for (const seg of speedResult.segments) {
        for (const u of [0, 0.25, 0.5, 0.75, 1]) {
          const pt = { x: seg.start.x + (seg.end.x - seg.start.x) * u, y: seg.start.y + (seg.end.y - seg.start.y) * u };
          expect(isPointInsideSafeEllipse(pt, centerBalloon, 1e-5)).toBe(false);
        }
      }
    });
  });

  describe("live-storyboard-manuscript-bidirectional-sync", () => {
    it("한국어 keep-all 말풍선 추정이 어절 중간 음절 절단을 방지하고 명시적 줄바꿈을 보존한다", () => {
      const estimate = estimateKoreanBalloonBox({
        balloonShape: "ellipse", fontSizePx: 24, maxCharsPerLine: 9,
        text: "기다렸잖아! 오늘 밤에는 절대로 물러서지 않겠어.\n지금 바로 시작하자!",
      });
      expect(estimate.hadEmergencyTokenSplit).toBe(false);
      expect(estimate.eojeolCount).toBe(9);
      expect(estimate.lineCount).toBeGreaterThanOrEqual(4);
      const rejoined = estimate.lines.join(" ");
      for (const word of ["기다렸잖아!", "밤에는", "절대로", "물러서지", "않겠어.", "시작하자!"]) {
        expect(rejoined.includes(word)).toBe(true);
      }
      expect(estimate.recommendedWidthPx).toBeGreaterThan(estimate.contentWidthPx);
    });

    it("한 줄 최대 폭을 초과하는 초장문 단일 토큰은 비상 음절 분할(hadEmergencyTokenSplit)로 안전하게 감싼다", () => {
      const shoutBox = estimateKoreanBalloonBox({ balloonShape: "shout-burst", fontSizePx: 26, maxCharsPerLine: 7, text: "으아아아아아아아아아아아아악!" });
      const rectBox = estimateKoreanBalloonBox({ balloonShape: "rounded-rect", fontSizePx: 26, maxCharsPerLine: 7, text: "으아아아아아아아아아아아아악!" });
      expect(shoutBox.hadEmergencyTokenSplit).toBe(true);
      expect(shoutBox.lineCount).toBeGreaterThanOrEqual(2);
      expect(shoutBox.recommendedWidthPx).toBeGreaterThan(rectBox.recommendedWidthPx);
    });

    it("대본 대사 수정 및 컷 순서 재배열 시 작가의 원고 내 수동 말풍선 위치와 스타일 오버라이드를 보존한다", () => {
      const syncResult = syncStoryboardWithManuscript({
        baseAnchors: [
          makeBaseAnchor("a-1", "잠깐만 기다려.", { cutId: "cut-1", cutOrderIndex: 0 }),
          makeBaseAnchor("a-2", "벌써 늦었어.", { cutId: "cut-2", cutOrderIndex: 1, speakerId: "rival" }),
        ],
        manuscriptBalloons: [
          makeManuBalloon("a-1", "잠깐만 기다려.", {
            cutId: "cut-1", cutOrderIndex: 0, position: { x: 480, y: 92 },
            styleOverrides: { fontSizePx: 26, strokeWidthPx: 3.2, tailTipOffset: { x: -45, y: 90 } },
          }),
          makeManuBalloon("a-2", "벌써 늦었어.", { cutId: "cut-2", cutOrderIndex: 1, position: { x: 315, y: 210 }, speakerId: "rival" }),
        ],
        storyboardAnchors: [
          makeStoryAnchor("a-1", "잠깐만 기다려! 아직 확인해야 할 단서가 남아 있어.", { cutId: "cut-1", cutOrderIndex: 1 }),
          makeStoryAnchor("a-2", "벌써 늦었어.", { cutId: "cut-2", cutOrderIndex: 0, speakerId: "rival" }),
        ],
      });

      expect(syncResult.conflicts).toHaveLength(0);
      expect(syncResult.syncedAnchors.map((a) => a.anchorId)).toEqual(["a-2", "a-1"]);
      const syncedA1 = syncResult.syncedAnchors[1];
      expect(syncedA1?.dialogueText).toBe("잠깐만 기다려! 아직 확인해야 할 단서가 남아 있어.");
      expect(syncedA1?.position).toEqual({ x: 480, y: 92 });
      expect(syncedA1?.artistPositionPreserved).toBe(true);
      expect(syncedA1?.styleOverrides?.strokeWidthPx).toBe(3.2);
      expect(syncedA1?.size.heightPx).toBeGreaterThan(110);
      expect(syncedA1?.syncStatus).toBe("updated-from-storyboard");
    });

    it("원고 측 단독 대사 다듬기와 신규 말풍선 추가를 무충돌 역전파하고 대본 신규 앵커를 생성한다", () => {
      const syncResult = syncStoryboardWithManuscript({
        baseAnchors: [makeBaseAnchor("a-polish", "정말 그럴까?")],
        manuscriptBalloons: [
          makeManuBalloon("a-polish", "과연 정말 그럴까…?"),
          makeManuBalloon("a-manu-new", "(수상한 기척이다)", { balloonShape: "cloud-thought", readingOrderIndex: 1 }),
        ],
        storyboardAnchors: [
          makeStoryAnchor("a-polish", "정말 그럴까?"),
          makeStoryAnchor("a-story-new", "모두 엎드려!", { balloonShape: "shout-burst", readingOrderIndex: 2, suggestedPosition: { x: 360, y: 520 } }),
        ],
      });

      expect(syncResult.conflicts).toHaveLength(0);
      expect(syncResult.summary.propagatedFromManuscriptCount).toBe(1);
      expect(syncResult.summary.createdFromManuscriptCount).toBe(1);
      expect(syncResult.summary.createdFromStoryboardCount).toBe(1);
      expect(syncResult.syncedAnchors.find((a) => a.anchorId === "a-polish")?.dialogueText).toBe("과연 정말 그럴까…?");
    });

    it("대본과 원고가 동일 앵커의 대사·모양·컷 배정을 서로 다르게 수정하면 구조화된 충돌 레코드를 발행한다", () => {
      const base = [makeBaseAnchor("a-conflict", "내일 새벽에 출발한다.")];
      const manu = [makeManuBalloon("a-conflict", "오늘 자정에 즉시 출발한다.", { balloonShape: "rounded-rect", cutId: "cut-2", cutOrderIndex: 1, position: { x: 250, y: 190 } })];
      const story = [makeStoryAnchor("a-conflict", "모레 정오까지 대기하라!", { balloonShape: "shout-burst", cutId: "cut-3", cutOrderIndex: 2 })];

      const manuFirst = syncStoryboardWithManuscript({ baseAnchors: base, conflictPolicy: "prefer-manuscript-flag-conflict", manuscriptBalloons: manu, storyboardAnchors: story });
      expect(manuFirst.conflicts.map((c) => c.kind)).toEqual(["concurrent-dialogue-edit", "concurrent-shape-edit", "concurrent-cut-assignment"]);
      expect(manuFirst.syncedAnchors[0]?.dialogueText).toBe("오늘 자정에 즉시 출발한다.");

      const storyFirst = syncStoryboardWithManuscript({ baseAnchors: base, conflictPolicy: "prefer-storyboard-flag-conflict", manuscriptBalloons: manu, storyboardAnchors: story });
      expect(storyFirst.conflicts).toHaveLength(3);
      expect(storyFirst.syncedAnchors[0]?.dialogueText).toBe("모레 정오까지 대기하라!");
      expect(storyFirst.syncedAnchors[0]?.position).toEqual({ x: 250, y: 190 });
    });

    it("대본과 원고가 동일한 문장으로 수렴 편집한 경우에는 충돌 없이 병합한다", () => {
      const res = syncStoryboardWithManuscript({
        baseAnchors: [makeBaseAnchor("a-same", "고마워.")],
        manuscriptBalloons: [makeManuBalloon("a-same", "진심으로 고마워.", { position: { x: 112, y: 108 } })],
        storyboardAnchors: [makeStoryAnchor("a-same", "진심으로 고마워.")],
      });
      expect(res.conflicts).toHaveLength(0);
      expect(res.syncedAnchors[0]?.dialogueText).toBe("진심으로 고마워.");
      expect(res.syncedAnchors[0]?.position).toEqual({ x: 112, y: 108 });
    });

    it("스토리보드 삭제 시 작가 위치 이동이 있는 말풍선은 delete-modify-conflict로 보존하고 미수정분은 제거한다", () => {
      const res = syncStoryboardWithManuscript({
        baseAnchors: [makeBaseAnchor("a-clean-del", "지워질 독백"), makeBaseAnchor("a-artist-moved", "중요한 대사", { readingOrderIndex: 1 })],
        manuscriptBalloons: [
          makeManuBalloon("a-clean-del", "지워질 독백"),
          makeManuBalloon("a-artist-moved", "중요한 대사", { position: { x: 420, y: 280 }, readingOrderIndex: 1 }),
        ],
        storyboardAnchors: [],
      });
      expect(res.deletedAnchorIds).toEqual(["a-clean-del"]);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]?.kind).toBe("delete-modify-conflict");
      expect(res.syncedAnchors[0]?.anchorId).toBe("a-artist-moved");
    });

    it("원고 측 말풍선 삭제 시 대본 대사가 수정된 앵커는 delete-modify-conflict로 보존한다", () => {
      const res = syncStoryboardWithManuscript({
        baseAnchors: [makeBaseAnchor("a-manu-del-clean", "그냥 지나가는 말"), makeBaseAnchor("a-manu-del-edited", "초기 대사", { readingOrderIndex: 1 })],
        manuscriptBalloons: [],
        storyboardAnchors: [
          makeStoryAnchor("a-manu-del-clean", "그냥 지나가는 말"),
          makeStoryAnchor("a-manu-del-edited", "결정적 복선 대사로 전면 개고!", { readingOrderIndex: 1 }),
        ],
      });
      expect(res.deletedAnchorIds).toEqual(["a-manu-del-clean"]);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0]?.kind).toBe("delete-modify-conflict");
      expect(res.syncedAnchors[0]?.dialogueText).toBe("결정적 복선 대사로 전면 개고!");
    });

    it("빈 텍스트 말풍선 추정과 대사 폭증 시 overflowWarning 플래그가 정확히 동작한다", () => {
      const emptyBox = estimateKoreanBalloonBox({ text: "   \n  " });
      expect(emptyBox.lineCount).toBe(0);
      expect(emptyBox.eojeolCount).toBe(0);

      const syncRes = syncStoryboardWithManuscript({
        baseAnchors: [makeBaseAnchor("a-overflow", "응.", { size: { widthPx: 110, heightPx: 80 } })],
        cutSafeWidthPx: 280,
        manuscriptBalloons: [makeManuBalloon("a-overflow", "응.", { size: { widthPx: 110, heightPx: 80 } })],
        storyboardAnchors: [makeStoryAnchor("a-overflow", "이 대사는 좁은 컷 안전 폭을 훌쩍 넘길 만큼 갑자기 엄청나게 길어졌습니다!")],
      });
      expect(syncRes.syncedAnchors[0]?.overflowWarning).toBe(true);
    });
  });
});
