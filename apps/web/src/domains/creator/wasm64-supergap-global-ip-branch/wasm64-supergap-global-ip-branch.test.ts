import { describe, expect, it } from "vitest";
import {
  auditAndFlipGlobalLocalization,
  canonicalJsonStringify,
  convertSrgbToCmykWithTacLimit,
  InteractiveBranchingWebtoonExporter,
  packageCreatorIpDerivatives,
  parseBranchCondition,
  sha256HexFromText,
  simulateBranchingPlaythrough,
  verifyCreatorIpBundleSeal,
  type BranchingEpisodeGraph,
  type CreatorIpDerivativeInput,
  type LocalizationCultureId,
  type LocalizationEpisodeInput,
  type RgbaBufferInput,
} from "./index";

function createRgbaWithBox(
  width: number,
  height: number,
  box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number },
  rgbaColor: readonly [number, number, number, number],
): RgbaBufferInput {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      if (x >= 0 && x < width && y >= 0 && y < height) {
        const idx = (y * width + x) * 4;
        rgba[idx] = rgbaColor[0];
        rgba[idx + 1] = rgbaColor[1];
        rgba[idx + 2] = rgbaColor[2];
        rgba[idx + 3] = rgbaColor[3];
      }
    }
  }
  return { width, height, rgba };
}

describe("FIPS 180-4 SHA-256 다이제스트 및 정규화 직렬화", () => {
  it("NIST 표준 벡터(빈 문자열·'abc'·56바이트 패딩 경계·UTF-8)와 키 순서 불변성을 검증한다", () => {
    expect(sha256HexFromText("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256HexFromText("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256HexFromText("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256HexFromText("툰스튜디오 🎨").length).toBe(64);
    expect(canonicalJsonStringify({ b: 2, a: { z: 1, k: 3 } })).toBe(
      canonicalJsonStringify({ a: { k: 3, z: 1 }, b: 2 }),
    );
  });
});

describe("#33 auditAndFlipGlobalLocalization — 4대 문화권 반전 및 로컬 QA", () => {
  const sampleKoEpisode: LocalizationEpisodeInput = {
    episodeId: "ep-global-001",
    sourceCulture: "ko-vertical-scroll",
    targetCulture: "jp-rtl-manga",
    panels: [
      {
        panelId: "panel-1",
        orderIndex: 1,
        bounds: { x: 40, y: 40, width: 720, height: 480 },
        canvasWidth: 800,
        canvasHeight: 1200,
        hasAsymmetricTextInArt: true,
        hasCulturalGestureOrSymbol: true,
        balloons: [
          {
            balloonId: "b-left",
            readingOrder: 1,
            speakerId: "hero",
            bounds: { x: 50, y: 40, width: 220, height: 110 },
            tailTip: { x: 180, y: 210 },
            text: "선배, 이 검이 13,500원밖에 안 해요?",
            fontSizePx: 16,
          },
          {
            balloonId: "b-right",
            readingOrder: 2,
            speakerId: "mentor",
            bounds: { x: 430, y: 48, width: 210, height: 120 },
            tailTip: { x: 500, y: 230 },
            text: "길이 180cm, 무게 10kg짜리라 5km만 들고 가도 팔이 빠질 걸.",
            fontSizePx: 16,
          },
        ],
        sfxItems: [
          { sfxId: "sfx-slash", bounds: { x: 100, y: 300, width: 120, height: 60 }, rotationDeg: 18, text: "서걱!", bakedIntoLineart: true },
        ],
      },
    ],
  };

  it("ko → jp(RTL) 반전 시 말풍선·꼬리·SFX 좌표를 정확히 대칭 반전하고, 역변환 시 완벽한 대합(involution)을 만족한다", () => {
    const koToJp = auditAndFlipGlobalLocalization(sampleKoEpisode);
    expect(koToJp.horizontalFlipped).toBe(true);
    expect(koToJp.writingModeChanged).toBe(true);
    expect(koToJp.summary.aiTokensUsed).toBe(0);
    expect(koToJp.summary.estimatedCloudCostKrw).toBe(0);
    expect(koToJp.summary.mirroredBalloons).toBe(2);

    const p1 = koToJp.panels[0];
    expect(p1.transformedBounds.x).toBe(40);
    expect(p1.balloons[0].balloonId).toBe("b-left");
    expect(p1.balloons[0].reindexedReadingOrder).toBe(1);
    expect(p1.balloons[0].transformedBounds.x).toBe(450);
    expect(p1.balloons[0].transformedTailTip.x).toBe(540);
    expect(p1.balloons[0].targetWritingMode).toBe("vertical-rl");
    expect(p1.balloons[0].localizedText).toContain("¥1,500");
    expect(p1.balloons[1].transformedBounds.x).toBe(80);
    expect(p1.balloons[1].transformedTailTip.x).toBe(220);
    expect(p1.sfxItems[0].transformedBounds.x).toBe(500);
    expect(p1.sfxItems[0].transformedRotationDeg).toBe(-18);

    const flagCodes = koToJp.reviewFlags.map((f) => f.code);
    expect(flagCodes).toContain("ASYMMETRIC_ART_FLIP_REVIEW");
    expect(flagCodes).toContain("CULTURAL_GESTURE_REVIEW");
    expect(flagCodes).toContain("BAKED_SFX_REDRAW_REQUIRED");
    expect(flagCodes).toContain("HONORIFIC_OR_CULTURAL_TERM_REVIEW");
    expect(flagCodes).toContain("WRITING_MODE_ASPECT_MISMATCH");

    const roundTrip = auditAndFlipGlobalLocalization({
      episodeId: koToJp.episodeId,
      sourceCulture: "jp-rtl-manga",
      targetCulture: "ko-vertical-scroll",
      panels: koToJp.panels.map((panel) => ({
        panelId: panel.panelId,
        orderIndex: panel.reindexedOrderIndex,
        bounds: panel.transformedBounds,
        canvasWidth: panel.canvasWidth,
        canvasHeight: panel.canvasHeight,
        balloons: panel.balloons.map((b) => ({
          balloonId: b.balloonId,
          readingOrder: b.reindexedReadingOrder,
          bounds: b.transformedBounds,
          tailTip: b.transformedTailTip,
          tailBase: b.transformedTailBase,
          text: b.originalText,
          fontSizePx: b.fontSizePx,
        })),
        sfxItems: panel.sfxItems.map((s) => ({
          sfxId: s.sfxId,
          bounds: s.transformedBounds,
          rotationDeg: s.transformedRotationDeg,
          text: s.text,
        })),
      })),
    });

    const rtPanel = roundTrip.panels[0];
    expect(rtPanel.balloons[0].transformedBounds.x).toBe(50);
    expect(rtPanel.balloons[0].transformedTailTip.x).toBe(180);
    expect(rtPanel.balloons[1].transformedBounds.x).toBe(430);
    expect(rtPanel.sfxItems[0].transformedBounds.x).toBe(100);
    expect(rtPanel.sfxItems[0].transformedRotationDeg).toBe(18);
  });

  it("ko → en(LTR) 변환 시 통화(KRW→USD)와 도량형(cm/km/kg/°C→in/mi/lb/°F) 변환 및 1.38x 텍스트 팽창 오버플로를 탐지한다", () => {
    const report = auditAndFlipGlobalLocalization({
      episodeId: "ep-ko-en",
      sourceCulture: "ko-vertical-scroll",
      targetCulture: "en-ltr-comic",
      panels: [
        {
          panelId: "p1",
          orderIndex: 1,
          bounds: { x: 0, y: 0, width: 800, height: 600 },
          canvasWidth: 800,
          canvasHeight: 600,
          balloons: [
            {
              balloonId: "b-tight",
              readingOrder: 1,
              bounds: { x: 40, y: 40, width: 120, height: 70 },
              tailTip: { x: 100, y: 150 },
              text: "입장료 27,000원, 신장 180cm, 거리 10km, 무게 70kg, 기온 25°C에서 훈련한다!",
              fontSizePx: 14,
            },
          ],
        },
      ],
    });

    expect(report.horizontalFlipped).toBe(false);
    const balloon = report.panels[0].balloons[0];
    expect(balloon.localizedText).toContain("$20.00");
    expect(balloon.localizedText).toContain("70.9in");
    expect(balloon.localizedText).toContain("6.21mi");
    expect(balloon.localizedText).toContain("154.3lb");
    expect(balloon.localizedText).toContain("77°F");
    expect(report.summary.currencyConversions).toBe(1);
    expect(report.summary.unitConversions).toBe(4);
    expect(balloon.estimatedOverflowRatio).toBeGreaterThan(1.0);
    expect(balloon.recommendedBounds.width).toBeGreaterThan(balloon.transformedBounds.width);
    expect(report.reviewFlags.map((f) => f.code)).toContain("TEXT_OVERFLOW_EXPANSION");
    expect(report.reviewFlags.map((f) => f.code)).toContain("FONT_TOO_SMALL_FOR_CULTURE");
  });

  it("en → zh 변환 시 야드파운드→미터법 역환산, 전치사 'in' 오탐 방지, 비반전 RTL 읽기 순서 재색인을 검증한다", () => {
    const enToZh = auditAndFlipGlobalLocalization({
      episodeId: "ep-en-zh",
      sourceCulture: "en-ltr-comic",
      targetCulture: "zh-vertical-scroll",
      panels: [
        {
          panelId: "p-en",
          orderIndex: 1,
          bounds: { x: 0, y: 0, width: 800, height: 500 },
          canvasWidth: 800,
          canvasHeight: 500,
          balloons: [
            {
              balloonId: "b1",
              readingOrder: 1,
              bounds: { x: 40, y: 40, width: 320, height: 140 },
              tailTip: { x: 180, y: 240 },
              text: "In 1999 in the city, it cost $10 for 72in rope, 5 miles run, 100 lbs load at 68°F.",
              fontSizePx: 16,
            },
          ],
        },
      ],
    });

    const text = enToZh.panels[0].balloons[0].localizedText;
    expect(text).toContain("1999 in the city");
    expect(text).toContain("¥72");
    expect(text).toContain("182.9cm");
    expect(text).toContain("8.05km");
    expect(text).toContain("45.4kg");
    expect(text).toContain("20°C");

    const nonMirroredRtl = auditAndFlipGlobalLocalization({
      episodeId: "ep-preserve-art",
      sourceCulture: "ko-vertical-scroll",
      targetCulture: "jp-rtl-manga",
      options: { mirrorLayoutOnDirectionFlip: false, autoConvertCurrency: false, autoConvertUnits: false },
      panels: [
        {
          panelId: "p1",
          orderIndex: 1,
          bounds: { x: 0, y: 0, width: 800, height: 500 },
          canvasWidth: 800,
          canvasHeight: 500,
          balloons: [
            { balloonId: "left-first-ko", readingOrder: 1, bounds: { x: 50, y: 60, width: 140, height: 180 }, tailTip: { x: 110, y: 300 }, text: "가격은 10,000원입니다.", fontSizePx: 15 },
            { balloonId: "right-first-jp", readingOrder: 2, bounds: { x: 560, y: 65, width: 140, height: 180 }, tailTip: { x: 630, y: 300 }, text: "두 번째 대사", fontSizePx: 15 },
          ],
        },
      ],
    });

    expect(nonMirroredRtl.horizontalFlipped).toBe(false);
    expect(nonMirroredRtl.panels[0].balloons[0].balloonId).toBe("right-first-jp");
    expect(nonMirroredRtl.panels[0].balloons[0].reindexedReadingOrder).toBe(1);
    expect(nonMirroredRtl.summary.reindexedBalloons).toBe(2);
    expect(nonMirroredRtl.reviewFlags.map((f) => f.code)).toContain("READING_ORDER_REINDEXED");
    expect(nonMirroredRtl.reviewFlags.map((f) => f.code)).toContain("CURRENCY_REVIEW_NEEDED");
  });

  it("패널 경계 이탈·꼬리 분리 오류와 중화권 위안화(¥→CNY) 식별을 정확히 검수한다", () => {
    const zhToEn = auditAndFlipGlobalLocalization({
      episodeId: "ep-zh-en-qa",
      sourceCulture: "zh-vertical-scroll",
      targetCulture: "en-ltr-comic",
      panels: [
        {
          panelId: "p-bad",
          orderIndex: 1,
          bounds: { x: 0, y: 0, width: 400, height: 300 },
          canvasWidth: 400,
          canvasHeight: 300,
          balloons: [
            {
              balloonId: "b-oob",
              readingOrder: 1,
              bounds: { x: 320, y: 20, width: 120, height: 80 },
              tailTip: { x: 450, y: 120 },
              text: "只要¥72!",
              fontSizePx: 16,
            },
          ],
        },
      ],
    });

    expect(zhToEn.panels[0].balloons[0].localizedText).toContain("$10.00");
    expect(zhToEn.convertedExpressions[0].sourceCode).toBe("CNY");
    const codes = zhToEn.reviewFlags.map((f) => f.code);
    expect(codes).toContain("BALLOON_OUT_OF_SAFE_BOUNDS");
    expect(codes).toContain("TAIL_DETACHED_OR_INVALID");
    expect(zhToEn.summary.errorCount).toBeGreaterThanOrEqual(2);
    expect(zhToEn.summary.readinessScore).toBeLessThan(60);
  });
});

describe("#34 InteractiveBranchingWebtoonExporter — 그래프 검증 및 무서버 번들", () => {
  function buildValidBranchingEpisode(): BranchingEpisodeGraph {
    return {
      episodeId: "ep-branch-01",
      title: "새벽의 선택 </script>",
      author: "윤서진",
      version: "1.0.0",
      locale: "ko",
      startNodeId: "cut-intro",
      initialFlags: { trust: 0, betrayed: false },
      nodes: [
        { id: "cut-intro", title: "1컷: 빗속의 만남", kind: "cut", imageAssetPath: "./cuts/01.webp", nextNodeId: "cut-choice-1" },
        {
          id: "cut-choice-1",
          title: "2컷: 우산을 건넬까?",
          kind: "choice",
          imageAssetPath: "./cuts/02.webp",
          choices: [
            { choiceId: "give-umbrella", label: "우산을 건네며 동행한다", targetNodeId: "cut-choice-2", effects: [{ flag: "trust", op: "add", value: 1 }] },
            { choiceId: "walk-away", label: "모른 척 지나친다", targetNodeId: "end-bad", effects: [{ flag: "betrayed", op: "set", value: true }] },
          ],
        },
        {
          id: "cut-choice-2",
          title: "3컷: 비밀 열쇠",
          kind: "choice",
          imageAssetPath: "./cuts/03.webp",
          choices: [
            { choiceId: "share-secret", label: "진실을 털어놓는다", targetNodeId: "cut-gate", effects: [{ flag: "trust", op: "add", value: 1 }] },
            { choiceId: "keep-quiet", label: "조용히 문을 닫는다", targetNodeId: "end-normal" },
          ],
        },
        {
          id: "cut-gate",
          title: "4컷: 신뢰의 분기",
          kind: "choice",
          imageAssetPath: "./cuts/04.webp",
          choices: [
            { choiceId: "enter-secret", label: "숨겨진 기록실로", targetNodeId: "cut-secret", condition: "trust >= 2 && !betrayed", hiddenUntilUnlocked: true },
            { choiceId: "take-hallway", label: "일반 복도로", targetNodeId: "end-normal" },
          ],
        },
        { id: "cut-secret", title: "시크릿 컷", kind: "secret", imageAssetPath: "./cuts/05.webp", unlockCondition: "trust >= 2", nextNodeId: "end-true" },
        { id: "end-true", title: "트루 엔딩", kind: "ending", endingCode: "TRUE_END", endingTier: "true", imageAssetPath: "./cuts/end-true.webp" },
        { id: "end-normal", title: "노멀 엔딩", kind: "ending", endingCode: "NORMAL_END", endingTier: "normal", imageAssetPath: "./cuts/end-normal.webp" },
        { id: "end-bad", title: "배드 엔딩", kind: "ending", endingCode: "BAD_END", endingTier: "bad", imageAssetPath: "./cuts/end-bad.webp" },
      ],
    };
  }

  it("정상 다중 분기·시크릿 컷·다중 엔딩 그래프를 검증하고 ₩0 정적 JSON + CSP/XSS 안전 HTML/JS 번들로 컴파일한다", () => {
    const exporter = new InteractiveBranchingWebtoonExporter();
    const result = exporter.exportStaticBundle(buildValidBranchingEpisode());

    expect(result.ok).toBe(true);
    expect(result.validation.deadEndNodeIds).toEqual([]);
    expect(result.validation.unreachableEndingIds).toEqual([]);
    expect(result.validation.infiniteLoopCycles).toEqual([]);
    expect(result.validation.reachableEndingIds).toEqual(["end-true", "end-normal", "end-bad"]);
    expect(result.validation.reachableSecretCutIds).toEqual(["cut-secret"]);

    expect(result.edgeRuntimeManifest.serverStateRequired).toBe(false);
    expect(result.edgeRuntimeManifest.estimatedServerCostKrw).toBe(0);
    expect(result.edgeRuntimeManifest.cspSafeNoEval).toBe(true);
    expect(result.edgeRuntimeManifest.bundleSha256.length).toBe(64);
    expect(result.standaloneHtml).toContain("<!doctype html>");
    expect(result.standaloneHtml).toContain("<\\/script>");
    expect(result.standaloneHtml).not.toContain("eval(");
    expect(result.standaloneHtml).not.toContain("new Function");

    const trueRun = simulateBranchingPlaythrough(result.manifest, ["give-umbrella", "share-secret", "enter-secret"]);
    expect(trueRun.ok).toBe(true);
    expect(trueRun.reachedEnding).toBe(true);
    expect(trueRun.endingCode).toBe("TRUE_END");
    expect(trueRun.finalFlags.trust).toBe(2);

    const badRun = simulateBranchingPlaythrough(result.manifest, ["walk-away"]);
    expect(badRun.ok).toBe(true);
    expect(badRun.endingCode).toBe("BAD_END");
    expect(badRun.finalFlags.betrayed).toBe(true);
  });

  it("막다른 길(dead-end), 도달 불가 엔딩, 무한 무가드 루프를 정확히 검출한다", () => {
    const exporter = new InteractiveBranchingWebtoonExporter();
    const brokenGraph: BranchingEpisodeGraph = {
      episodeId: "ep-broken",
      title: "오류 그래프",
      author: "테스트",
      version: "0.1.0",
      startNodeId: "start",
      initialFlags: { trust: 0 },
      nodes: [
        {
          id: "start",
          title: "시작",
          kind: "choice",
          imageAssetPath: "./01.webp",
          choices: [
            { choiceId: "to-dead", label: "막다른 길", targetNodeId: "dead-cut" },
            { choiceId: "to-loop", label: "루프", targetNodeId: "loop-a" },
            { choiceId: "to-imp", label: "불가능 엔딩", targetNodeId: "end-imp", condition: "trust >= 5" },
            { choiceId: "to-ok", label: "정상 엔딩", targetNodeId: "end-ok" },
          ],
        },
        { id: "dead-cut", title: "출구 없음", kind: "cut", imageAssetPath: "./dead.webp" },
        { id: "loop-a", title: "루프 A", kind: "cut", imageAssetPath: "./a.webp", nextNodeId: "loop-b" },
        { id: "loop-b", title: "루프 B", kind: "cut", imageAssetPath: "./b.webp", nextNodeId: "loop-a" },
        { id: "end-imp", title: "불가능 엔딩", kind: "ending", endingCode: "IMP", imageAssetPath: "./imp.webp" },
        { id: "end-ok", title: "정상 엔딩", kind: "ending", endingCode: "OK", imageAssetPath: "./ok.webp" },
      ],
    };

    const report = exporter.exportStaticBundle(brokenGraph);
    expect(report.ok).toBe(false);
    expect(report.standaloneHtml).toBe("");
    expect(report.validation.deadEndNodeIds).toContain("dead-cut");
    expect(report.validation.unreachableEndingIds).toContain("end-imp");
    expect(report.validation.infiniteLoopCycles.length).toBeGreaterThanOrEqual(1);
    const codes = report.validation.issues.map((i) => i.code);
    expect(codes).toContain("DEAD_END_NODE");
    expect(codes).toContain("UNREACHABLE_ENDING");
    expect(codes).toContain("INFINITE_UNGUARDED_LOOP");
  });

  it("조건부 소프트락(CONDITIONAL_DEAD_END)·도달 불가 시크릿 컷·깨진 참조를 차단하고 유한 가드 루프는 허용한다", () => {
    const exporter = new InteractiveBranchingWebtoonExporter();
    const softLockGraph: BranchingEpisodeGraph = {
      episodeId: "ep-softlock",
      title: "소프트락 테스트",
      author: "테스트",
      version: "0.1.0",
      startNodeId: "start",
      initialFlags: { key: false },
      nodes: [
        {
          id: "start",
          title: "잠긴 문",
          kind: "choice",
          imageAssetPath: "./door.webp",
          choices: [
            { choiceId: "open-locked", label: "열쇠로 열기", targetNodeId: "secret-vault", condition: "key == true" },
          ],
        },
        { id: "secret-vault", title: "비밀 금고", kind: "secret", imageAssetPath: "./v.webp", nextNodeId: "ghost-node" },
      ],
    };

    const softReport = exporter.validateGraph(softLockGraph);
    expect(softReport.valid).toBe(false);
    const softCodes = softReport.issues.map((i) => i.code);
    expect(softCodes).toContain("CONDITIONAL_DEAD_END");
    expect(softCodes).toContain("UNREACHABLE_SECRET_CUT");
    expect(softCodes).toContain("BROKEN_TARGET_REF");
    expect(softCodes).toContain("NO_ENDING_DEFINED");

    const guardedRetry: BranchingEpisodeGraph = {
      episodeId: "ep-guarded",
      title: "유한 재시도",
      author: "테스트",
      version: "1.0.0",
      startNodeId: "quiz",
      initialFlags: { tries: 0 },
      nodes: [
        {
          id: "quiz",
          title: "암호 입력",
          kind: "choice",
          imageAssetPath: "./quiz.webp",
          choices: [
            { choiceId: "retry", label: "다시 시도", targetNodeId: "quiz", condition: "tries < 2", effects: [{ flag: "tries", op: "add", value: 1 }] },
            { choiceId: "solve", label: "정답 입력", targetNodeId: "end-win" },
          ],
        },
        { id: "end-win", title: "성공", kind: "ending", endingCode: "WIN", imageAssetPath: "./win.webp" },
      ],
    };
    expect(exporter.validateGraph(guardedRetry).valid).toBe(true);
    expect(parseBranchCondition("trust >= && 2").ok).toBe(false);
  });
});

describe("#35 packageCreatorIpDerivatives — 4종 파생 번들 및 SHA-256 Rights BOM 봉인", () => {
  function buildSampleIpInput(): CreatorIpDerivativeInput {
    const merchArtwork = createRgbaWithBox(64, 64, { x: 8, y: 8, w: 48, h: 48 }, [4, 4, 4, 255]);
    const characterImage = createRgbaWithBox(128, 160, { x: 44, y: 30, w: 40, h: 90 }, [210, 140, 110, 255]);
    return {
      episodeId: "ep-ip-01",
      seriesId: "series-dawn-blade",
      episodeTitle: "새벽의 검 1화",
      creatorId: "creator-yoon",
      merchArtwork,
      merchOptions: { productKind: "acrylic-standee", trimWidthMm: 100, trimHeightMm: 150, bleedMm: 3, dpi: 300 },
      characterSprites: [
        { characterId: "char-seojin", characterName: "서진", poseLabel: "standing-idle", image: characterImage, paddingPx: 4, pivotMode: "bottom-center" },
      ],
      turntableOptions: { frameCount: 36, fps: 30, targetHeightM: 1.7, elevationDeg: 12, focalLengthMm: 50 },
      trailerHighlights: [
        { cutId: "cut-01", title: "운명의 검", voiceoverLine: "그날 밤, 봉인이 풀렸다.", speakerName: "서진", sfxLabel: "발도음", emphasisWeight: 1 },
        { cutId: "cut-02", title: "도시 추격전", voiceoverLine: "도망칠 곳은 없어!", speakerName: "라이벌", sfxLabel: "질주음", emphasisWeight: 1.5 },
        { cutId: "cut-03", title: "결전의 일격", voiceoverLine: "끝장을 내주지.", speakerName: "서진", sfxLabel: "충격파", emphasisWeight: 1.2 },
      ],
      trailerOptions: { durationMs: 15000, bgmBpm: 120, aspectRatio: "9:16" },
      rightsAssets: [
        { assetId: "asset-art", assetName: "서진 원화", category: "character-art", licenseSpdx: "PROPRIETARY-CREATOR", rightsHolder: "윤서진", commercialMerchAllowed: true, audioBroadcastAllowed: true, model3dDerivativeAllowed: true, attributionRequired: false },
        { assetId: "asset-bgm", assetName: "Dawn Overture", category: "bgm", licenseSpdx: "CC-BY-4.0", rightsHolder: "Studio Sound", commercialMerchAllowed: true, audioBroadcastAllowed: true, model3dDerivativeAllowed: true, attributionRequired: true, attributionText: "Music: Dawn Overture by Studio Sound (CC-BY-4.0)" },
      ],
      royaltySplits: [
        { partyId: "creator-yoon", displayName: "윤서진", role: "creator", sharePercent: 75 },
        { partyId: "composer-kim", displayName: "김작곡", role: "composer", sharePercent: 15 },
        { partyId: "platform-toonstudio", displayName: "ToonStudio", role: "platform", sharePercent: 10 },
      ],
      sealedAtIso: "2026-11-26T10:30:00.000Z",
    };
  }

  it("4종 파생 산출물(CMYK TAC<=300%·알파 크롭·360° 턴테이블·15초 큐시트)과 SHA-256 봉인을 로컬 ₩0로 완결한다", () => {
    const richBlack = convertSrgbToCmykWithTacLimit(4, 4, 4, 300);
    expect(richBlack.raw.tacPercent).toBeGreaterThan(300);
    expect(richBlack.wasClamped).toBe(true);
    expect(richBlack.clamped.tacPercent).toBeLessThanOrEqual(300);

    const bundle = packageCreatorIpDerivatives(buildSampleIpInput());
    expect(bundle.ok).toBe(true);
    expect(bundle.compliance.commercialReleaseCleared).toBe(true);
    expect(bundle.packagingTelemetry.estimatedCloudCostKrw).toBe(0);
    expect(bundle.packagingTelemetry.aiTokensUsed).toBe(0);

    const merch = bundle.deliverables.merchPrintSpec;
    expect(merch.rawMaxTacPercent).toBeGreaterThan(300);
    expect(merch.enforcedMaxTacPercent).toBeLessThanOrEqual(300);
    expect(merch.tacCompliant).toBe(true);
    expect(merch.clampedPixelCount).toBe(48 * 48);
    expect(merch.bleedCanvasWidthPx).toBe(Math.round((106 / 25.4) * 300));
    expect(merch.acrylicSpec?.whiteInkUnderbaseRequired).toBe(true);
    expect(merch.dieCutSvgPathMm.startsWith("M") && merch.dieCutSvgPathMm.endsWith("Z")).toBe(true);

    const sprite = bundle.deliverables.characterSprites[0];
    expect(sprite.tightBoundsPx).toEqual({ x: 44, y: 30, width: 40, height: 90 });
    expect(sprite.croppedWidthPx).toBe(48);
    expect(sprite.croppedHeightPx).toBe(98);
    expect(sprite.croppedRgba.length).toBe(48 * 98 * 4);
    expect(sprite.trimmedAreaSavingsRatio).toBeGreaterThan(0.7);
    expect(sprite.normalizedPivot.x).toBe(0.5);

    const turntable = bundle.deliverables.turntableCamera;
    expect(turntable.coordinateSystem).toBe("gltf-y-up-meters");
    expect(turntable.frameCount).toBe(36);
    expect(turntable.azimuthStepDeg).toBe(10);
    expect(turntable.keyframes[0].azimuthDeg).toBe(0);
    expect(turntable.keyframes[35].azimuthDeg).toBe(350);
    for (let i = 0; i < turntable.keyframes.length; i += 1) {
      const [qx, qy, qz, qw] = turntable.keyframes[i].quaternionXyzw;
      expect(Math.abs(Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) - 1)).toBeLessThan(1e-4);
    }

    const trailer = bundle.deliverables.audioToonTrailer;
    expect(trailer.durationMs).toBe(15000);
    expect(trailer.visualCuts[0].startMs).toBe(0);
    expect(trailer.visualCuts[trailer.visualCuts.length - 1].endMs).toBe(15000);
    for (let i = 1; i < trailer.visualCuts.length; i += 1) {
      expect(trailer.visualCuts[i].startMs).toBe(trailer.visualCuts[i - 1].endMs);
    }
    expect(trailer.bgmTrack.beatMarkersMs.length).toBe(31);
    expect(trailer.bgmTrack.duckingEnvelopes.length).toBe(3);
    expect(trailer.webvttCaptions).toContain("WEBVTT");

    expect(bundle.rightsBomSeal.royaltyTotalPercent).toBe(100);
    expect(verifyCreatorIpBundleSeal(bundle).valid).toBe(true);
  });

  it("NC/오디오/3D 라이선스 위반·로열티 합계 오류·빈 스프라이트를 탐지하고, 1바이트 변조 시 SHA-256 봉인이 즉시 실패한다", () => {
    const base = buildSampleIpInput();
    const emptyImage: RgbaBufferInput = { width: 32, height: 32, rgba: new Uint8Array(32 * 32 * 4) };
    const nonCompliant = packageCreatorIpDerivatives({
      ...base,
      characterSprites: [{ characterId: "empty", characterName: "빈레이어", poseLabel: "none", image: emptyImage }],
      turntableOptions: { frameCount: 12, direction: "cw" },
      rightsAssets: [
        { assetId: "nc-font", assetName: "비상업 폰트", category: "font", licenseSpdx: "CC-BY-NC-4.0", rightsHolder: "TP", commercialMerchAllowed: false, audioBroadcastAllowed: true, model3dDerivativeAllowed: true, attributionRequired: true },
        { assetId: "locked-bgm", assetName: "비배포 BGM", category: "bgm", licenseSpdx: "PROPRIETARY", rightsHolder: "TP", commercialMerchAllowed: true, audioBroadcastAllowed: false, model3dDerivativeAllowed: true, attributionRequired: false },
        { assetId: "locked-3d", assetName: "비파생 3D", category: "background-3d", licenseSpdx: "PROPRIETARY", rightsHolder: "TP", commercialMerchAllowed: true, audioBroadcastAllowed: true, model3dDerivativeAllowed: false, attributionRequired: false },
      ],
      royaltySplits: [
        { partyId: "creator-yoon", displayName: "윤서진", role: "creator", sharePercent: 80 },
        { partyId: "platform", displayName: "ToonStudio", role: "platform", sharePercent: 15 },
      ],
    });

    expect(nonCompliant.ok).toBe(false);
    expect(nonCompliant.deliverables.turntableCamera.keyframes[1].azimuthDeg).toBe(330);
    const issueCodes = nonCompliant.compliance.issues.map((i) => i.code);
    expect(issueCodes).toContain("EMPTY_SPRITE_ALPHA_MASK");
    expect(issueCodes).toContain("COMMERCIAL_MERCH_LICENSE_BLOCKER");
    expect(issueCodes).toContain("AUDIO_TRAILER_LICENSE_BLOCKER");
    expect(issueCodes).toContain("TURNTABLE_3D_LICENSE_BLOCKER");
    expect(issueCodes).toContain("ROYALTY_SPLIT_SUM_MISMATCH");

    const validBundle = packageCreatorIpDerivatives(base);
    const repeatBundle = packageCreatorIpDerivatives(base);
    expect(validBundle.rightsBomSeal.bundleSha256).toBe(repeatBundle.rightsBomSeal.bundleSha256);

    validBundle.deliverables.characterSprites[0].croppedRgba[0] ^= 0xff;
    const tamperedPixelVerify = verifyCreatorIpBundleSeal(validBundle);
    expect(tamperedPixelVerify.valid).toBe(false);
    expect(tamperedPixelVerify.actualBundleSha256).not.toBe(tamperedPixelVerify.expectedBundleSha256);

    const tamperedSplitBundle = {
      ...repeatBundle,
      rightsBomSeal: {
        ...repeatBundle.rightsBomSeal,
        royaltySplits: repeatBundle.rightsBomSeal.royaltySplits.map((s) =>
          s.partyId === "creator-yoon" ? { ...s, sharePercent: 76 } : s,
        ),
      },
    };
    const tamperedSplitVerify = verifyCreatorIpBundleSeal(tamperedSplitBundle);
    expect(tamperedSplitVerify.valid).toBe(false);
    expect(tamperedSplitVerify.mismatches).toContain("rightsBomSeal Rights BOM / 로열티 분배표 해시 불일치");
  });

  it("Super-Gap Pillar I 통합 파이프라인: 4대 문화권 일괄 변환 + 분기 정적 번들 + IP 파생 번들이 모두 ₩0 로컬로 완결된다", () => {
    const targets: readonly LocalizationCultureId[] = [
      "ko-vertical-scroll",
      "jp-rtl-manga",
      "en-ltr-comic",
      "zh-vertical-scroll",
    ];
    for (let i = 0; i < targets.length; i += 1) {
      const report = auditAndFlipGlobalLocalization({
        episodeId: "ep-pillar-i",
        sourceCulture: "ko-vertical-scroll",
        targetCulture: targets[i],
        panels: [
          {
            panelId: "p1",
            orderIndex: 1,
            bounds: { x: 0, y: 0, width: 800, height: 600 },
            canvasWidth: 800,
            canvasHeight: 600,
            balloons: [
              { balloonId: "b1", readingOrder: 1, bounds: { x: 60, y: 60, width: 220, height: 180 }, tailTip: { x: 180, y: 290 }, text: "13,500원 · 100cm", fontSizePx: 16 },
            ],
          },
        ],
      });
      expect(report.summary.aiTokensUsed).toBe(0);
      expect(report.summary.estimatedCloudCostKrw).toBe(0);
    }
    const bundle = packageCreatorIpDerivatives(buildSampleIpInput());
    expect(bundle.ok).toBe(true);
    expect(verifyCreatorIpBundleSeal(bundle).valid).toBe(true);
  });
});
