import { describe, expect, it } from "vitest";

import {
  GITHUB_MODELS_INFERENCE_BASE_URL,
  loadEffectiveStudioAiSettings,
  resolveStudioDefaultEnvAiSettings,
} from "./studio-ai-settings";
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

  it("resolves default environment AI token when BYOK session storage is empty", () => {
    const resolved = resolveStudioDefaultEnvAiSettings({
      GITHUB_MODELS_API_KEY: "ghp_unit_test_token_value",
    });
    expect(resolved.baseUrl).toBe(GITHUB_MODELS_INFERENCE_BASE_URL);
    expect(resolved.apiKey).toBe("ghp_unit_test_token_value");

    const effectiveWithEnv = loadEffectiveStudioAiSettings(null, null, {
      GITHUB_MODELS_API_KEY: "ghp_unit_test_token_value",
    });
    expect(effectiveWithEnv.source).toBe("env-default");
    expect(effectiveWithEnv.settings.apiKey).toBe("ghp_unit_test_token_value");

    const effectiveFallback = loadEffectiveStudioAiSettings(null, null, {});
    expect(effectiveFallback.source).toBe("unconfigured");
  });
});






