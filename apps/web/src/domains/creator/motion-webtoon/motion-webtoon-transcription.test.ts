import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getUserAiSnapshot,
  setUserAiConfiguration,
} from "@/shared/ai/user-ai-store";
import {
  EMPTY_AI_CONFIGURATION,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

import { buildCaptionTrack } from "./motion-webtoon-captions";
import type { MotionEpisode } from "./motion-webtoon-model";
import {
  applyTranscriptionSegments,
  GroqTranscriptionError,
  normalizeTranscriptionSegments,
  parseGroqTranscriptionPayload,
  resolveGroqTranscriptionRoute,
  transcribeAudioFileWithGroq,
  validateTranscriptionAudioFile,
  type GroqTranscriptionSegment,
} from "./motion-webtoon-transcription";

const TEST_KEY = "gsk_test_key_123";

function groqConfiguration(): UserAiConfiguration {
  return {
    ...structuredClone(EMPTY_AI_CONFIGURATION),
    connections: [
      {
        id: "groq-1",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: TEST_KEY,
        textModel: "llama-3.3-70b-versatile",
        imageModel: "",
        imageGenerationPath: "/images/generations",
        imageEditPath: "/images/edits",
        chatCompletionsPath: "/chat/completions",
        costPolicy: "provider-free-tier",
        enabled: true,
        priority: 100,
        apiKeys: [
          { id: "key-1", label: "기본 키", apiKey: TEST_KEY, enabled: true, priority: 100 },
        ],
        models: [
          {
            id: "text-1",
            label: "Llama",
            model: "llama-3.3-70b-versatile",
            capability: "text",
            enabled: true,
            priority: 100,
          },
        ],
      },
    ],
  };
}

function makeEpisode(): MotionEpisode {
  return {
    id: "ep-1",
    titleKo: "테스트 회차",
    titleEn: "Test episode",
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts: [
      {
        id: "cut-1",
        imageUrl: "https://example.com/1.png",
        altKo: "컷 1",
        altEn: "Cut 1",
        direction: { cameraMove: "static", durationSeconds: 6, intensity: 0.5 },
        transitionIn: "fade",
        bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
        dialogues: [
          { id: "dlg-0", text: "기존 대사", characterId: "char-1", startOffsetSeconds: 0.5 },
        ],
      },
      {
        id: "cut-2",
        imageUrl: "https://example.com/2.png",
        altKo: "컷 2",
        altEn: "Cut 2",
        direction: { cameraMove: "static", durationSeconds: 4, intensity: 0.5 },
        transitionIn: "cut",
        bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
        dialogues: [],
      },
    ],
  };
}

const initialConfiguration = getUserAiSnapshot().configuration;

beforeEach(() => {
  setUserAiConfiguration(structuredClone(EMPTY_AI_CONFIGURATION));
});

afterEach(() => {
  setUserAiConfiguration(initialConfiguration);
  vi.restoreAllMocks();
});

describe("resolveGroqTranscriptionRoute", () => {
  it("설정이 비어 있으면 null을 돌려준다", () => {
    expect(resolveGroqTranscriptionRoute(structuredClone(EMPTY_AI_CONFIGURATION))).toBeNull();
  });

  it("Groq 연결과 활성 키가 있으면 경로를 돌려준다", () => {
    const route = resolveGroqTranscriptionRoute(groqConfiguration());
    expect(route?.connectionId).toBe("groq-1");
    expect(route?.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(route?.apiKey).toBe(TEST_KEY);
  });

  it("Groq가 아닌 호스트와 비활성 연결은 건너뛴다", () => {
    const config = groqConfiguration();
    const other: UserAiConfiguration = {
      ...config,
      connections: config.connections.map((connection) => ({
        ...connection,
        id: "other-1",
        baseUrl: "https://openrouter.ai/api/v1",
      })),
    };
    expect(resolveGroqTranscriptionRoute(other)).toBeNull();

    const disabled: UserAiConfiguration = {
      ...config,
      connections: config.connections.map((connection) => ({ ...connection, enabled: false })),
    };
    expect(resolveGroqTranscriptionRoute(disabled)).toBeNull();
  });
});

describe("validateTranscriptionAudioFile", () => {
  it("빈 파일·초과 용량·미지원 형식을 코드로 구분한다", () => {
    expect(() => validateTranscriptionAudioFile({ name: "a.mp3", size: 0 })).toThrowError(
      expect.objectContaining({ code: "empty-file" }),
    );
    expect(
      () => validateTranscriptionAudioFile({ name: "a.mp3", size: 26 * 1024 * 1024 }),
    ).toThrowError(expect.objectContaining({ code: "too-large" }));
    expect(() => validateTranscriptionAudioFile({ name: "a.txt", size: 10 })).toThrowError(
      expect.objectContaining({ code: "unsupported-format" }),
    );
    expect(() =>
      validateTranscriptionAudioFile({ name: "voice.WEBM", size: 10 }),
    ).not.toThrow();
  });
});

describe("parseGroqTranscriptionPayload", () => {
  it("구간을 정렬·재인덱싱하고 잘못된 구간은 버린다", () => {
    const result = parseGroqTranscriptionPayload(
      {
        text: "안녕 세상",
        language: "KO",
        duration: 3.5,
        segments: [
          { start: 1.2, end: 2.4, text: " 세상 " },
          { start: 0, end: 1.2, text: "안녕" },
          { start: 5, end: 4, text: "뒤집힌 구간" },
          { start: 2.4, end: 3, text: "  " },
        ],
      },
      TEST_KEY,
    );
    expect(result.language).toBe("ko");
    expect(result.durationSeconds).toBe(3.5);
    expect(result.segments).toEqual([
      { index: 0, startSeconds: 0, endSeconds: 1.2, text: "안녕" },
      { index: 1, startSeconds: 1.2, endSeconds: 2.4, text: "세상" },
    ]);
  });

  it("본문은 있는데 구간이 없으면 빈 결과가 아니라 오류로 구분한다", () => {
    expect(() =>
      parseGroqTranscriptionPayload({ text: "구간 없는 전사", segments: [] }, TEST_KEY),
    ).toThrowError(expect.objectContaining({ code: "invalid-response" }));
  });

  it("본문과 구간이 모두 비면 빈 전사 결과로 돌려준다", () => {
    const result = parseGroqTranscriptionPayload({ text: "", segments: [] }, TEST_KEY);
    expect(result.segments).toEqual([]);
    expect(result.text).toBe("");
  });

  it("응답 본문에 섞인 API 키를 제거한다", () => {
    const result = parseGroqTranscriptionPayload(
      { text: `키 ${TEST_KEY} 노출`, segments: [{ start: 0, end: 1, text: "대사" }] },
      TEST_KEY,
    );
    expect(result.text).not.toContain(TEST_KEY);
  });
});

describe("normalizeTranscriptionSegments", () => {
  it("배열이 아니면 빈 배열이다", () => {
    expect(normalizeTranscriptionSegments(undefined)).toEqual([]);
    expect(normalizeTranscriptionSegments("x")).toEqual([]);
  });
});

describe("transcribeAudioFileWithGroq", () => {
  function audioFile(): File {
    return new File(["fake-audio"], "voice.mp3", { type: "audio/mpeg" });
  }

  function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  it("Groq 키가 없으면 호출하지 않고 not-configured로 구분한다", async () => {
    const fetchFn = vi.fn();
    await expect(
      transcribeAudioFileWithGroq(audioFile(), { fetchFn }),
    ).rejects.toMatchObject({ code: "not-configured" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("본인 Groq 키로 전사 엔드포인트를 호출하고 구간을 돌려준다", async () => {
    setUserAiConfiguration(groqConfiguration());
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
      expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${TEST_KEY}`);
      const form = init?.body as FormData;
      expect(form.get("model")).toBe("whisper-large-v3");
      expect(form.get("response_format")).toBe("verbose_json");
      expect(form.get("language")).toBe("ko");
      return jsonResponse({
        text: "첫 대사 둘째 대사",
        language: "ko",
        duration: 8,
        segments: [
          { start: 0.5, end: 2, text: "첫 대사" },
          { start: 6.5, end: 8, text: "둘째 대사" },
        ],
      });
    });
    const result = await transcribeAudioFileWithGroq(audioFile(), {
      language: "ko",
      fetchFn: fetchFn as typeof fetch,
    });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[1].startSeconds).toBe(6.5);
  });

  it("인증 실패와 한도 초과를 상태 코드로 구분한다", async () => {
    setUserAiConfiguration(groqConfiguration());
    const unauthorized = vi.fn(async () =>
      jsonResponse({ error: { message: "Invalid API Key" } }, 401));
    await expect(
      transcribeAudioFileWithGroq(audioFile(), { fetchFn: unauthorized as typeof fetch }),
    ).rejects.toMatchObject({ code: "authentication", status: 401 });

    const limited = vi.fn(async () => jsonResponse({ error: { message: "rate" } }, 429));
    await expect(
      transcribeAudioFileWithGroq(audioFile(), { fetchFn: limited as typeof fetch }),
    ).rejects.toMatchObject({ code: "quota-exhausted", status: 429 });
  });

  it("네트워크 실패를 network로 구분한다", async () => {
    setUserAiConfiguration(groqConfiguration());
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(
      transcribeAudioFileWithGroq(audioFile(), { fetchFn: offline as typeof fetch }),
    ).rejects.toMatchObject({ code: "network" });
  });

  it("미지원 형식은 네트워크 호출 전에 막는다", async () => {
    setUserAiConfiguration(groqConfiguration());
    const fetchFn = vi.fn();
    const bad = new File(["x"], "notes.txt", { type: "text/plain" });
    await expect(
      transcribeAudioFileWithGroq(bad, { fetchFn }),
    ).rejects.toMatchObject({ code: "unsupported-format" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("applyTranscriptionSegments", () => {
  const segments: GroqTranscriptionSegment[] = [
    { index: 0, startSeconds: 2, endSeconds: 3.5, text: "첫 컷 전사" },
    { index: 1, startSeconds: 6.5, endSeconds: 8, text: "둘째 컷 전사" },
    { index: 2, startSeconds: 12, endSeconds: 13, text: "범위 밖 전사" },
  ];

  it("구간 시작점이 속한 컷에 오프셋 대사로 넣고 범위 밖은 센다", () => {
    let seq = 0;
    const episode = makeEpisode();
    const result = applyTranscriptionSegments(episode, segments, "char-1", () => `dlg-t${++seq}`);
    expect(result.appliedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    // 기존 대사는 유지되고 오프셋 순으로 정렬된다.
    expect(result.episode.cuts[0].dialogues.map((d) => d.text)).toEqual([
      "기존 대사",
      "첫 컷 전사",
    ]);
    expect(result.episode.cuts[0].dialogues[1].startOffsetSeconds).toBe(2);
    expect(result.episode.cuts[0].dialogues[1].characterId).toBe("char-1");
    // 둘째 컷(6초 시작)에서는 0.5초 오프셋.
    expect(result.episode.cuts[1].dialogues).toHaveLength(1);
    expect(result.episode.cuts[1].dialogues[0].startOffsetSeconds).toBe(0.5);
    // 원본 회차는 바꾸지 않는다.
    expect(episode.cuts[0].dialogues).toHaveLength(1);
    expect(episode.cuts[1].dialogues).toHaveLength(0);
  });

  it("적용된 대사는 자막 트랙에 그대로 나타난다", () => {
    let seq = 0;
    const result = applyTranscriptionSegments(makeEpisode(), segments, "char-1", () => `dlg-t${++seq}`);
    const track = buildCaptionTrack(result.episode);
    const texts = track.cues.map((cue) => cue.text);
    expect(texts).toContain("첫 컷 전사");
    expect(texts).toContain("둘째 컷 전사");
    const second = track.cues.find((cue) => cue.text === "둘째 컷 전사");
    expect(second?.startSeconds).toBe(6.5);
  });

  it("넣을 구간이 없으면 같은 회차를 돌려준다", () => {
    const episode = makeEpisode();
    const result = applyTranscriptionSegments(episode, [], "char-1");
    expect(result.episode).toBe(episode);
    expect(result.appliedCount).toBe(0);
  });

  it("GroqTranscriptionError는 Error를 상속한다", () => {
    const error = new GroqTranscriptionError("network", "x");
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("network");
  });
});
