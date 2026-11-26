import { describe, expect, it } from "vitest";

import { chooseQuickKeyModel } from "@/shared/ai/ai-quick-key";
import {
  buildUserAiTextCompletionBody,
  DEFAULT_OPENAI_IMAGE_MODEL,
  isOpenAiGptImageModel,
  isOpenAiReasoningChatModel,
  isRetiredOpenAiImageModel,
  normalizeOpenAiImageSizeValue,
  normalizeOpenAiLegacyChatBody,
  normalizeOpenAiLegacyImageBody,
} from "@/shared/ai/openai-model-compat";
import { STUDIO_AI_DEFAULT_SETTINGS } from "./studio-ai-settings";
import { buildOpenAiTextCompletionBody } from "./studio-ai-model-compat";

import {
  buildWebtoonModelerOpenAiImageRequest,
  compileWebtoonModelerToImageGen,
  createDefaultWebtoonModelerScene,
  webtoonAspectRatioToStudioAiImageSize,
} from "../ai-assist/webtoon-modeler-imagegen";
import { createEmptyStudioWriterRoomDocument } from "../studio-writer-room";
import {
  buildStudioWriterRoomAiPrompt,
  parseStudioWriterRoomAiDraft,
} from "../studio-writer-room-ai";

import { parseBgmPlacement } from "./studio-ai-bgm-plan";
import { parseDialogueSuggestions } from "./studio-ai-dialogue-suggest";
import { parseDirectionPlan } from "./studio-ai-direction-plan";
import {
  parseN7ColoringResult,
  parseN7DialogueResult,
  parseN7SplitResult,
} from "./studio-ai-n7-orchestration";
import { buildStudioJsonPostTarget } from "./studio-ai-response-parsing";
import { parseReviewInterpretation } from "./studio-ai-review-llm";
import { parseStoryboardPlan } from "./studio-ai-storyboard-llm";

describe("OpenAI flagship compatibility helpers (shared/ai/openai-model-compat)", () => {
  it("classifies OpenAI reasoning models and gpt-image / chatgpt-image models accurately", () => {
    for (const model of ["gpt-5", "gpt-5-mini", "gpt-5.4-mini", "gpt-5.5", "gpt-6.2-astra", "o3", "o4-mini", "openai/gpt-5.5"]) {
      expect(isOpenAiReasoningChatModel(model)).toBe(true);
    }
    for (const model of ["gpt-4o-mini", "gpt-4.1", "openrouter/free", "openai/gpt-oss-120b", "claude-sonnet-5-5", "o365-custom"]) {
      expect(isOpenAiReasoningChatModel(model)).toBe(false);
    }
    for (const model of ["gpt-image-1.5", "gpt-image-2.6-flare", "gpt-image-2.6-sunburst", "chatgpt-image-latest", "openai/gpt-image-1.5"]) {
      expect(isOpenAiGptImageModel(model)).toBe(true);
      expect(normalizeOpenAiImageSizeValue(model, "1024x1792")).toBe("1024x1536");
      expect(normalizeOpenAiImageSizeValue(model, "1792x1024")).toBe("1536x1024");
      expect(normalizeOpenAiImageSizeValue(model, "1024x1024")).toBe("1024x1024");
    }
    expect(isRetiredOpenAiImageModel("dall-e-3")).toBe(true);
    expect(isRetiredOpenAiImageModel("gpt-image-1.5")).toBe(false);
    expect(DEFAULT_OPENAI_IMAGE_MODEL).toBe("gpt-image-2.6-flare");
    expect(STUDIO_AI_DEFAULT_SETTINGS.imageModel).toBe(DEFAULT_OPENAI_IMAGE_MODEL);
  });

  it("normalizes chat & image payloads bidirectionally across reasoning and legacy models", () => {
    const reasoningText = buildUserAiTextCompletionBody("gpt-6.2-astra", "sys", "usr", 1024);
    expect(reasoningText).toMatchObject({ model: "gpt-6.2-astra", max_completion_tokens: 4096 });
    expect(reasoningText).not.toHaveProperty("max_tokens");
    expect(reasoningText).not.toHaveProperty("temperature");

    const clientReasoningBody = buildOpenAiTextCompletionBody({
      model: "gpt-6.2-astra",
      system: "sys",
      user: "usr",
      temperature: 0.7,
      maxTokens: 1800,
      responseFormat: "json",
    });
    expect(clientReasoningBody).toMatchObject({
      model: "gpt-6.2-astra",
      reasoning_effort: "low",
      max_completion_tokens: 4200,
      response_format: { type: "json_object" },
    });
    expect(clientReasoningBody).not.toHaveProperty("temperature");
    expect(clientReasoningBody).not.toHaveProperty("max_tokens");
    expect(normalizeOpenAiLegacyChatBody("gpt-4.1-mini", clientReasoningBody)).toEqual({
      model: "gpt-4.1-mini",
      messages: clientReasoningBody.messages,
      max_tokens: 4200,
      response_format: { type: "json_object" },
    });

    const pingNormalized = normalizeOpenAiLegacyChatBody("gpt-5.5", {
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      max_tokens: 1,
      temperature: 0.7,
    });
    expect(pingNormalized).toEqual({
      model: "gpt-5.5",
      messages: [{ role: "user", content: "ping" }],
      max_completion_tokens: 16,
    });

    const downgraded = normalizeOpenAiLegacyChatBody("gpt-4o-mini", {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hello" }],
      max_completion_tokens: 2048,
    });
    expect(downgraded).toEqual({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello" }],
      max_tokens: 2048,
    });

    const imageNormalized = normalizeOpenAiLegacyImageBody("gpt-image-2.6-sunburst", {
      model: "dall-e-3",
      prompt: "rooftop",
      size: "1792x1024",
      response_format: "b64_json",
    });
    expect(imageNormalized).toEqual({
      model: "gpt-image-2.6-sunburst",
      prompt: "rooftop",
      size: "1536x1024",
    });
  });

  it("preserves max_completion_tokens when bridging to Anthropic in buildStudioJsonPostTarget", () => {
    const bridged = buildStudioJsonPostTarget("https://api.anthropic.com/v1/chat/completions", "sk-ant-test", {
      model: "claude-sonnet-5-5",
      messages: [{ role: "user", content: "hi" }],
      max_completion_tokens: 3000,
    });
    expect((bridged.body as Record<string, unknown>).max_tokens).toBe(5048);
  });

  it("selects available flagship OpenAI models via chooseQuickKeyModel", () => {
    expect(chooseQuickKeyModel("openai", ["gpt-5.4-mini", "gpt-4o-mini"])).toBe("gpt-5.4-mini");
    expect(chooseQuickKeyModel("openai", ["gpt-6.2-astra", "gpt-5.5"])).toBe("gpt-5.5");
    expect(chooseQuickKeyModel("openai", ["gpt-6.2-astra"])).toBe("gpt-6.2-astra");
  });
});

describe("Writer Room & LLM JSON parsers (live OpenAI resilience)", () => {
  it("documents exact SFX emphasis/scale enums and nullable ids in dialogue-sfx prompt", () => {
    const prompt = buildStudioWriterRoomAiPrompt({
      stage: "dialogue-sfx",
      document: createEmptyStudioWriterRoomDocument(),
    });
    expect(prompt.system).toContain('"quiet"|"normal"|"strong"');
    expect(prompt.system).toContain('"small"|"medium"|"large"');
    expect(prompt.system).toContain("null");
  });

  it("parses Writer Room and auxiliary LLM JSON even when wrapped in prose or CRLF markdown fences", () => {
    const writerRoomWrapped =
      '아래는 제안 초안입니다:\r\n```json\r\n{"stage":"dialogue-sfx","rationale":"호흡 정리","draft":{"dialogue":[{"id":"dlg-1","order":0,"panelId":"panel-1","characterId":null,"text":"조용히 해."}],"sfx":[{"id":"sfx-1","order":0,"panelId":"panel-1","presetId":null,"customText":"쏴아아","style":{"emphasis":"quiet","scale":"small"}}]}}\r\n```';
    const parsedWriter = parseStudioWriterRoomAiDraft(writerRoomWrapped, "dialogue-sfx");
    expect(parsedWriter.ok).toBe(true);

    const n7Split = parseN7SplitResult('결과:\n```json\n{"cuts":[{"id":"cut-1","summary":"옥상 대치"}]}\n```');
    expect(n7Split).toEqual([{ id: "cut-1", summary: "옥상 대치" }]);

    const n7Dialogue = parseN7DialogueResult('```json\r\n{"dialogues":[{"cutId":"cut-1","lines":["멈춰!"]}]}\r\n```');
    expect(n7Dialogue).toEqual([{ cutId: "cut-1", lines: ["멈춰!"] }]);

    const n7Color = parseN7ColoringResult('안내: {"coloring":[{"cutId":"cut-1","instructions":"푸른 야간 림라이트"}]}');
    expect(n7Color).toEqual([{ cutId: "cut-1", instructions: "푸른 야간 림라이트" }]);

    const bgm = parseBgmPlacement('추천 결과입니다:\r\n```json\r\n{"placements":[{"cutId":"cut-1","bgmMood":"tension","sfxCues":["rain"]}]}\r\n```');
    expect(bgm).toEqual([{ cutId: "cut-1", bgmMood: "tension", sfxCues: ["rain"] }]);

    const review = parseReviewInterpretation('검수:\n{"items":[{"targetCut":"cut-1","area":"배경","task":"구름 명암 보강"}]}');
    expect(review).toEqual([{ targetCut: "cut-1", area: "배경", task: "구름 명암 보강" }]);

    const storyboard = parseStoryboardPlan('```JSON\r\n{"cuts":[{"id":"cut-1","summary":"도입","camera":"와이드","dialogues":["시작"]}]}\r\n```');
    expect(storyboard).toEqual([{ id: "cut-1", summary: "도입", camera: "와이드", dialogues: ["시작"] }]);

    const direction = parseDirectionPlan('연출안: {"plans":[{"cutId":"cut-1","cameraMove":"zoom-in","transition":"fade","bgmMood":"daily","sfxCues":[]}]}');
    expect(direction).toEqual([{ cutId: "cut-1", cameraMove: "zoom-in", transition: "fade", bgmMood: "daily", sfxCues: [] }]);

    const dialogue = parseDialogueSuggestions('후보:\n```json\n{"lines":["괜찮아?","어디 가?","잠깐만!"]}\n```');
    expect(dialogue).toEqual(["괜찮아?", "어디 가?", "잠깐만!"]);
  });

  it("preserves literal triple-backtick snippets inside JSON string values across raw and fenced responses", () => {
    const rawDialogue = JSON.stringify({ lines: ["모니터에 ```print(1)``` 코드가 뜬다", "도망쳐!"] });
    expect(parseDialogueSuggestions(rawDialogue)).toEqual(["모니터에 ```print(1)``` 코드가 뜬다", "도망쳐!"]);

    const fencedWriter =
      '초안입니다:\n```json\n{"stage":"dialogue-sfx","rationale":"코드 블록 보존","draft":{"dialogue":[{"id":"dlg-1","order":0,"panelId":"panel-1","characterId":null,"text":"화면에 ```print(1)``` 출력"}],"sfx":[]}}\n```';
    const parsedWriter = parseStudioWriterRoomAiDraft(fencedWriter, "dialogue-sfx");
    expect(parsedWriter.ok).toBe(true);
    if (parsedWriter.ok) {
      expect(parsedWriter.data.draft.dialogue[0]?.text).toBe("화면에 ```print(1)``` 출력");
    }

    const proseRawReview =
      '검수 결과:\n{"items":[{"targetCut":"cut-2","area":"대사","task":"```print(1)``` 문구를 자연스럽게 다듬기"}]}';
    expect(parseReviewInterpretation(proseRawReview)).toEqual([
      { targetCut: "cut-2", area: "대사", task: "```print(1)``` 문구를 자연스럽게 다듬기" },
    ]);

    const fencedN7 =
      '분할안:\n```json\n{"cuts":[{"id":"cut-1","summary":"```print(1)``` 화면 클로즈업"}]}\n```';
    expect(parseN7SplitResult(fencedN7)).toEqual([{ id: "cut-1", summary: "```print(1)``` 화면 클로즈업" }]);

    const rawBgm = JSON.stringify({
      placements: [{ cutId: "cut-1", bgmMood: "tension", sfxCues: ["```beep```"] }],
    });
    expect(parseBgmPlacement(rawBgm)).toEqual([
      { cutId: "cut-1", bgmMood: "tension", sfxCues: ["```beep```"] },
    ]);

    const fencedStoryboard =
      '콘티:\n```json\n{"cuts":[{"id":"cut-1","summary":"코드 ```print(1)``` 확인","camera":"클로즈업","dialogues":["```ok```"]}]}\n```';
    expect(parseStoryboardPlan(fencedStoryboard)).toEqual([
      { id: "cut-1", summary: "코드 ```print(1)``` 확인", camera: "클로즈업", dialogues: ["```ok```"] },
    ]);

    const rawDirection = JSON.stringify({
      plans: [{ cutId: "cut-1", cameraMove: "pan-left", transition: "cut", bgmMood: "daily", sfxCues: ["```whoosh```"] }],
    });
    expect(parseDirectionPlan(rawDirection)).toEqual([
      { cutId: "cut-1", cameraMove: "pan-left", transition: "cut", bgmMood: "daily", sfxCues: ["```whoosh```"] },
    ]);
  });
});

describe("webtoon-modeler-imagegen OpenAI request adapter", () => {
  it("maps webtoon aspect ratios and negative prompts into OpenAI-compatible size and prompt", () => {
    expect(webtoonAspectRatioToStudioAiImageSize("9:16")).toBe("1024x1792");
    expect(webtoonAspectRatioToStudioAiImageSize("4:5")).toBe("1024x1792");
    expect(webtoonAspectRatioToStudioAiImageSize("1:1")).toBe("1024x1024");
    expect(webtoonAspectRatioToStudioAiImageSize("16:9")).toBe("1792x1024");

    const compiledPortrait = compileWebtoonModelerToImageGen(createDefaultWebtoonModelerScene());
    const portraitReq = buildWebtoonModelerOpenAiImageRequest(compiledPortrait);
    expect(portraitReq.size).toBe("1024x1792");
    expect(portraitReq.prompt).toContain("CHAR-JIHUN-V1");
    expect(portraitReq.prompt).toContain("Avoid: blurry");

    const compiledLandscape = compileWebtoonModelerToImageGen({
      ...createDefaultWebtoonModelerScene(),
      aspectRatio: "16:9",
      negativePrompt: "",
    });
    const landscapeReq = buildWebtoonModelerOpenAiImageRequest(compiledLandscape);
    expect(landscapeReq.size).toBe("1792x1024");
    expect(landscapeReq.prompt).not.toContain("Avoid:");
  });
});
