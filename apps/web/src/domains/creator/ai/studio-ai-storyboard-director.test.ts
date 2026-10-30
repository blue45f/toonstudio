import { describe, expect, it, vi } from "vitest";

import { loadEffectiveStudioAiSettings } from "./studio-ai-settings";
import {
  analyzeRoughSketchIntent,
  bindLoraJobAsArtistStyle,
  StudioAiStoryboardDirector,
} from "./studio-ai-storyboard-director";
import {
  auditStoryboardStyleConsistency,
  blendArtistStyleModels,
  buildArtistStyleDnaProfile,
  BUILTIN_ARTIST_STYLE_PRESETS,
  synthesizeLocalStyleModelPreviewDataUrl,
} from "./studio-artist-style-dna";
import { createStudioLoraJobRecord } from "./studio-lora-training";
import {
  analyzeFreehandRoughSketchStrokes,
  renderRoughSketchStrokesSvgPaths,
  ROUGH_SKETCH_STROKE_TEMPLATES,
} from "./studio-rough-sketch-analyzer";

describe("StudioAiStoryboardDirector", () => {
  const director = new StudioAiStoryboardDirector();

  it("handles empty script gracefully", () => {
    const res = director.direct("");
    expect(res.totalCuts).toBe(0);
    expect(res.pacingScore).toBe(100);
  });

  it("parses lines into structured cuts with shot scales and emotions", () => {
    const script = `
주인공이 분노하며 "이건 절대 용서 못 해!"라고 외치며 검을 뽑는다.
적의 흔들리는 눈빛과 경악하는 표정.
뒤에서 몰래 다가오며 칼을 겨누는 마지막 결전.
    `;

    const res = director.direct(script);

    expect(res.totalCuts).toBe(3);
    expect(res.cuts[0].dialogue).toBe("이건 절대 용서 못 해!");
    expect(res.cuts[0].emotion).toBe("rage");
    expect(res.cuts[0].shotScale).toBe("full-shot");

    expect(res.cuts[1].emotion).toBe("shock");
    expect(res.cuts[1].shotScale).toBe("extreme-close-up");

    // The action branch sets exactly 1.5, so a strict > could never pass; the
    // intent is that an action cut is taller than the 1.0 baseline.
    expect(res.cuts[2].panelHeightRatio).toBeGreaterThanOrEqual(1.5);
    expect(res.estimatedEpisodeReadingSec).toBeGreaterThan(10);
  });

  it("does not mistake the adjective 검은 for a sword action", () => {
    const res = director.direct(
      "검은 고양이가 창가에 조용히 앉아 있다.\n주인공이 문을 닫는다."
    );

    expect(res.cuts[0]?.emotion).toBe("calm");
    expect(res.cuts[0]?.shotScale).toBe("medium-shot");
  });

  it("extracts speaker dialogue without leaking lettering into image prompts", () => {
    const res = director.direct('민서: "오늘은 여기까지 하자."');
    const cut = res.cuts[0];

    expect(cut?.dialogue).toBe("오늘은 여기까지 하자.");
    expect(cut?.backgroundPrompt).not.toContain("오늘은 여기까지 하자");
    expect(cut?.backgroundPrompt).toContain("no speech bubbles");
    expect(cut?.backgroundPrompt).toContain("no readable text");
  });

  it("interprets explicit stage direction tags and narration markers accurately", () => {
    const script = [
      "[버즈아이] [하이앵글] 무너진 성벽 위에서 내려다본 전장 전체 풍경. (나레이션: 모든 것이 끝난 밤이었다.) 장면 전환.",
      '[익스트림 클로즈업] [더치] 주인공의 떨리는 동공. "설마... 살아있었나?"',
    ].join("\n");

    const res = director.direct(script);
    expect(res.totalCuts).toBe(2);
    expect(res.cuts[0]?.shotScale).toBe("birds-eye");
    expect(res.cuts[0]?.cameraAngle).toBe("high-angle");
    expect(res.cuts[0]?.narration).toBe("모든 것이 끝난 밤이었다.");
    expect(res.cuts[0]?.beatKind).toBe("transition");
    expect(res.cuts[1]?.shotScale).toBe("extreme-close-up");
    expect(res.cuts[1]?.cameraAngle).toBe("dutch-tilt");
    expect(res.cuts[1]?.dialogue).toBe("설마... 살아있었나?");
  });

  it("keeps appended [ ] stage directions out of dialogue and narration, and reads shot words only as whole words", () => {
    // 줄 끝에 붙인 연출 지문의 영문(s-curve·focus)이 클로즈업으로, 동작 묘사의 '얼굴'이 명시한 샷을 덮지 않는다.
    const appended = director.direct(
      [
        "유적 입구에 두 사람이 선다. [스크롤 호흡 160px · s-curve-optimal]",
        "카엘: 뒤를 봐. [풀 샷 로우 앵글, 카엘이 얼굴을 들어 바라보고 말풍선은 오른쪽 위]",
        "횃불이 꺼진다. [바스트 샷, 인물 focus, \"뒤를 봐\" 말풍선 위치 확인 (나레이션 박스는 좌상단)]",
        "[CU] 떨리는 손",
      ].join("\n"),
    );
    const [entrance, kael, torch, hand] = appended.cuts;
    expect(entrance?.shotScale).toBe("medium-shot");
    expect(kael?.speaker).toBe("카엘");
    expect(kael?.dialogue).toBe("뒤를 봐.");
    expect(kael?.shotScale).toBe("full-shot");
    expect(kael?.cameraAngle).toBe("low-angle");
    expect(torch?.dialogue).toBeUndefined();
    expect(torch?.narration).toBeUndefined();
    expect(torch?.shotScale).toBe("medium-shot");
    expect(hand?.shotScale).toBe("close-up");

    // 감정·비트는 지시를 포함한 줄 전체로 판정하던 기존 규칙을 지킨다([잠시 후]만 쓴 줄은 장면 전환 컷).
    const transition = director.direct(["카엘: 뒤를 봐.", "[잠시 후]", "횃불이 꺼진다."].join("\n"));
    expect(transition.cuts[1]?.beatKind).toBe("transition");
    expect(transition.cuts[1]?.dialogue).toBeUndefined();
  });

  it("keeps [ ] inside quoted dialogue, the speaker of a directive-only line, and standard compound shot abbreviations", () => {
    // 따옴표 안의 [ ](시스템창·스킬 이름)는 대사이고, 따옴표 밖의 [ ]만 연출 지시다.
    const quoted = director.direct(
      [
        `시스템: "[퀘스트를 완료했습니다]"`,
        `카엘: "[블링크]!" [CU]`,
        `카엘: "그건 [금지된 마법]이야"`,
      ].join("\n"),
    );
    expect(quoted.cuts[0]?.dialogue).toBe("[퀘스트를 완료했습니다]");
    expect(quoted.cuts[1]?.dialogue).toBe("[블링크]!");
    expect(quoted.cuts[1]?.shotScale).toBe("close-up");
    expect(quoted.cuts[2]?.dialogue).toBe("그건 [금지된 마법]이야");

    // '이름: [지시]'는 대사가 없지만 화자는 그 인물이다.
    const silent = director.direct(["카엘: [침묵]", `리아: "왜?"`, "횃불이 꺼진다."].join("\n"));
    expect(silent.cuts[0]?.speaker).toBe("카엘");
    expect(silent.cuts[0]?.dialogue).toBeUndefined();

    // MCU·XCU·ELS·MLS 같은 표준 복합 약어도 명시 지시로 읽는다.
    const compound = director.direct(
      ["도입 컷", "[MCU] 카엘의 얼굴", "[XCU] 눈동자", "[ELS] 폐허가 된 도시", "[MLS] 두 사람", "[BCU] 입술", "마지막 컷"].join("\n"),
    );
    expect(compound.cuts.slice(1, 6).map((cut) => cut.shotScale)).toEqual([
      "close-up",
      "extreme-close-up",
      "long-shot",
      "long-shot",
      "close-up",
    ]);
  });

  it("analyzes rough sketch presets and custom stroke boxes to infer shot scale, camera angle, and speech bubble reserve", () => {
    const presetIntent = analyzeRoughSketchIntent({
      presetId: "diagonal-action",
      sketchNote: "우상단에서 좌하단으로 베어 내리는 대각선 검기",
    });
    expect(presetIntent.shotScale).toBe("full-shot");
    expect(presetIntent.cameraAngle).toBe("dutch-tilt");
    expect(presetIntent.compositionGuide).toContain("우상단에서 좌하단으로 베어 내리는 대각선 검기");

    const customIntent = analyzeRoughSketchIntent({
      focalPoint: { x: 0.5, y: 0.2 },
      boxes: [
        { x: 0.1, y: 0.1, width: 0.8, height: 0.8, role: "subject" },
        { x: 0.05, y: 0.05, width: 0.6, height: 0.25, role: "speech-zone" },
      ],
    });
    expect(customIntent.shotScale).toBe("extreme-close-up");
    expect(customIntent.cameraAngle).toBe("low-angle");
    expect(customIntent.reserveSpeechRatioBoost).toBeGreaterThan(0);
  });

  it("binds artist style LoRA models and injects style traits into storyboard cuts and global K-webtoon readiness", () => {
    const completedStyleJob = {
      ...createStudioLoraJobRecord({
        id: "lora-style-1",
        characterLabel: "수묵 느와르 작가체",
        triggerWord: "inknoir",
        kind: "style",
        providerRequestId: "req-style-1",
        statusUrl: null,
        responseUrl: null,
        trainingImageCount: 10,
        artistOwnershipConfirmed: true,
        styleTraits: {
          lineWeight: "brush",
          shadingMode: "hatching",
          paletteMood: "noir",
        },
      }),
      status: "completed" as const,
      loraFileUrl: "https://cdn.example/inknoir.safetensors",
    };

    const styleBinding = bindLoraJobAsArtistStyle(completedStyleJob);
    const res = director.direct(
      '비 내리는 옥상 끝에서 주인공이 검을 고쳐 쥔다. "여기서 끝낸다."',
      {
        artistStyle: styleBinding,
        defaultSketch: {
          presetId: "low-horizon-hero",
          sketchNote: "달빛을 등진 역광 로우앵글",
        },
        targetLocale: "en",
      }
    );

    expect(res.appliedArtistStyle?.artistLabel).toBe("수묵 느와르 작가체");
    expect(res.cuts[0]?.artistStylePrompt).toContain("inknoir");
    expect(res.cuts[0]?.artistStylePrompt).toContain("expressive calligraphy brush strokes");
    expect(res.cuts[0]?.artistLoraFileUrl).toBe("https://cdn.example/inknoir.safetensors");
    expect(res.cuts[0]?.sketchIntentApplied).toBe(true);
    expect(res.cuts[0]?.cameraAngle).toBe("low-angle");
    expect(res.globalKWebtoonReadiness?.verticalScrollRhythmScore).toBeGreaterThanOrEqual(70);
    expect(res.globalKWebtoonReadiness?.localizationSafeBubbleRatio).toBeGreaterThan(0);
  });

  it("supports rough-sketch-only storyboard generation without script text", () => {
    const res = director.directFromSketchOnly({
      presetId: "split-reaction",
      sketchNote: "두 인물의 엇갈리는 시선 분할 컷",
    });

    expect(res.totalCuts).toBe(1);
    expect(res.cuts[0]?.sketchIntentApplied).toBe(true);
    expect(res.cuts[0]?.shotScale).toBe("extreme-close-up");
    expect(res.cuts[0]?.compositionGuide).toContain("tight macro crop");
  });

  it("converts directed storyboard cuts into StudioStoryBeat[] and StudioStoryboardPlan", () => {
    const directed = director.direct(
      [
        "거대한 성문이 열리며 병사들이 쏟아져 나온다.",
        '주인공: "모두 대형을 유지해!"',
        "마지막 순간 하늘에서 번개가 내려꽂힌다!",
      ].join("\n")
    );

    const beats = director.toStudioStoryBeats(directed);
    expect(beats).toHaveLength(3);
    expect(beats[0]?.id).toBe("directed-beat-1");

    const plan = director.toStudioStoryboardPlan(directed);
    expect(plan.shots.length).toBeGreaterThanOrEqual(3);
    expect(plan.shots[0]?.beatId).toBe("directed-beat-1");
  });

  it("builds artist style DNA profiles, blends multi-artist styles, Audits consistency, and synthesizes local style preview SVG", () => {
    const primary = BUILTIN_ARTIST_STYLE_PRESETS[0]!;
    const secondary = BUILTIN_ARTIST_STYLE_PRESETS[2]!;

    const dna = buildArtistStyleDnaProfile(primary);
    expect(dna.recommendedLoraScale).toBeGreaterThan(0.5);
    expect(dna.positiveStylePrompt.length).toBeGreaterThan(10);

    const blended = blendArtistStyleModels(primary, secondary, {
      primaryWeight: 0.7,
      secondaryWeight: 0.3,
    });
    expect(blended.triggerWord).toContain(primary.triggerWord);
    expect(blended.triggerWord).toContain(secondary.triggerWord);
    expect(blended.artistLabel).toContain("70:30");

    const directed = director.direct(
      '주인공이 분노하며 검을 뽑는다. "물러서라!"\n적장이 차갑게 미소 짓는다.',
      { artistStyle: blended }
    );
    const audit = auditStoryboardStyleConsistency(directed, { genre: "액션" });
    expect(audit.consistencyScore).toBeGreaterThanOrEqual(80);
    expect(audit.triggerCoverageRatio).toBe(1);

    const svgResult = synthesizeLocalStyleModelPreviewDataUrl({
      artistLabel: primary.artistLabel,
      triggerWord: primary.triggerWord,
      prompt: "달빛 아래 검을 든 주인공",
      lineWeight: primary.lineWeight,
      shadingMode: primary.shadingMode,
      paletteMood: primary.paletteMood,
    });
    expect(svgResult.dataUrl.startsWith("data:image/svg+xml;base64,")).toBe(true);
  });

  it("analyzes freehand 2D rough sketch strokes to infer camera angles, motion vectors, and SVG paths", () => {
    const slashTemplate = ROUGH_SKETCH_STROKE_TEMPLATES[0]!;
    const analysis = analyzeFreehandRoughSketchStrokes(
      slashTemplate.strokes,
      "강렬한 대각선 참격"
    );

    expect(analysis.motionAngleDeg).not.toBeNull();
    expect(analysis.roughSketchInput.motionVector).toBe("diagonal-slash");
    expect(analysis.detectedPresetId).toBe("diagonal-action");
    expect(analysis.confidenceScore).toBeGreaterThanOrEqual(70);

    const svgPaths = renderRoughSketchStrokesSvgPaths(slashTemplate.strokes, {
      width: 300,
      height: 400,
    });
    expect(svgPaths.length).toBe(slashTemplate.strokes.length);
    expect(svgPaths[0]?.d).toContain("M ");
  });

  it("never reads operator AI keys from browser-bundled environment variables", () => {
    // 키 없는 사용자는 서버의 ToonStudio AI 경로를 쓴다. VITE_* 값은 번들에 실려 모든 방문자에게 보이므로 읽지 않는다.
    vi.stubEnv("VITE_STUDIO_DEFAULT_ANTHROPIC_KEY", "test_vite_anthropic_default_token");
    vi.stubEnv("VITE_STUDIO_DEFAULT_GITHUB_MODELS_KEY", "ghp_unit_test_token_value");
    try {
      const effective = loadEffectiveStudioAiSettings(null, null);
      expect(effective.source).toBe("unconfigured");
      expect(effective.settings.apiKey).toBe("");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

