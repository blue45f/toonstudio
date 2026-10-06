// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getUserAiSnapshot,
  setUserAiConfiguration,
} from "@/shared/ai/user-ai-store";
import {
  EMPTY_AI_CONFIGURATION,
  type UserAiConfiguration,
} from "@/shared/ai/user-ai-types";

import { MotionWebtoonCaptionPanel } from "./MotionWebtoonCaptionPanel";
import type { MotionEpisode } from "./motion-webtoon-model";

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
        direction: { cameraMove: "zoom-in", durationSeconds: 6, intensity: 0.5 },
        transitionIn: "fade",
        bgm: { sceneMood: "daily", crossfadeSeconds: 2 },
        dialogues: [
          { id: "dlg-1", text: "첫 대사", characterId: "char-1", startOffsetSeconds: 1 },
          // 컷 길이(6초)를 벗어나 자막에서 제외되는 대사.
          { id: "dlg-2", text: "범위 밖", characterId: "char-1", startOffsetSeconds: 9 },
        ],
      },
    ],
  };
}

const initialConfiguration = getUserAiSnapshot().configuration;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setUserAiConfiguration(initialConfiguration);
});

function groqConfiguration(): UserAiConfiguration {
  return {
    ...structuredClone(EMPTY_AI_CONFIGURATION),
    connections: [
      {
        id: "groq-1",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: "gsk_test_key_123",
        textModel: "llama-3.3-70b-versatile",
        imageModel: "",
        imageGenerationPath: "/images/generations",
        imageEditPath: "/images/edits",
        chatCompletionsPath: "/chat/completions",
        costPolicy: "provider-free-tier",
        enabled: true,
        priority: 100,
        apiKeys: [
          { id: "key-1", label: "기본 키", apiKey: "gsk_test_key_123", enabled: true, priority: 100 },
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

describe("MotionWebtoonCaptionPanel", () => {
  it("자막 큐와 시간 범위를 보여주고 제외된 대사를 안내한다", () => {
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />);
    expect(screen.getByDisplayValue("첫 대사")).toBeTruthy();
    expect(screen.getByText("0:01.0 – 0:06.0")).toBeTruthy();
    expect(screen.getByText(/빠진 대사가 1개/)).toBeTruthy();
  });

  it("대사가 없으면 빈 상태를 안내한다", () => {
    const episode = makeEpisode();
    const noDialogue: MotionEpisode = {
      ...episode,
      cuts: episode.cuts.map((cut) => ({ ...cut, dialogues: [] })),
    };
    render(<MotionWebtoonCaptionPanel episode={noDialogue} onEpisodeChange={() => {}} />);
    expect(screen.getByText("대사가 있는 컷이 없어 자막을 만들 수 없습니다.")).toBeTruthy();
  });

  it("자막 문구를 고치면 원본 대사가 바뀐 회차를 돌려준다", () => {
    const onEpisodeChange = vi.fn();
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={onEpisodeChange} />);
    fireEvent.change(screen.getByDisplayValue("첫 대사"), { target: { value: "고친 대사" } });
    expect(onEpisodeChange).toHaveBeenCalledTimes(1);
    const next = onEpisodeChange.mock.calls[0][0] as MotionEpisode;
    expect(next.cuts[0].dialogues[0].text).toBe("고친 대사");
    expect(next.cuts[0].dialogues[1].text).toBe("범위 밖");
  });

  it("위치 스타일을 바꾸면 미리보기 배치가 바뀐다", () => {
    const { container } = render(
      <MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />,
    );
    const stage = container.querySelector(".mw-caption-stage");
    expect(stage?.classList.contains("mw-caption-stage-bottom")).toBe(true);
    const select = screen.getByLabelText("자막 위치") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "top" } });
    expect(stage?.classList.contains("mw-caption-stage-top")).toBe(true);
  });

  it("Groq 키가 없으면 전사 대신 키 등록 안내와 설정 링크를 보여준다", () => {
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />);
    expect(screen.getByText("통합 AI 설정에 등록된 Groq 키가 없어 전사를 사용할 수 없어요.")).toBeTruthy();
    const link = screen.getByText("AI 설정에서 Groq 키 등록하기") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/settings/ai");
    expect(screen.queryByText("전사해 자막 만들기")).toBeNull();
  });

  it("Groq 키가 있으면 오디오를 전사해 컷 오프셋 대사로 넣는다", async () => {
    setUserAiConfiguration(groqConfiguration());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            text: "전사된 대사",
            language: "ko",
            duration: 6,
            segments: [{ start: 2, end: 3.5, text: "전사된 대사" }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const onEpisodeChange = vi.fn();
    const { container } = render(
      <MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={onEpisodeChange} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["fake"], "voice.mp3", { type: "audio/mpeg" })] },
    });
    fireEvent.click(screen.getByText("전사해 자막 만들기"));
    await waitFor(() => expect(onEpisodeChange).toHaveBeenCalledTimes(1));
    const next = onEpisodeChange.mock.calls[0][0] as MotionEpisode;
    const added = next.cuts[0].dialogues.find((dialogue) => dialogue.text === "전사된 대사");
    expect(added?.startOffsetSeconds).toBe(2);
    expect(added?.characterId).toBe("char-1");
    // 기존 대사는 그대로 남는다.
    expect(next.cuts[0].dialogues.some((dialogue) => dialogue.text === "첫 대사")).toBe(true);
    await waitFor(() =>
      expect(screen.getByText(/전사한 대사 1개를 자막에 넣었어요/)).toBeTruthy(),
    );
  });

  it("전사가 인증 오류면 오류를 안내하고 회차를 바꾸지 않는다", async () => {
    setUserAiConfiguration(groqConfiguration());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "Invalid API Key" } }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const onEpisodeChange = vi.fn();
    const { container } = render(
      <MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={onEpisodeChange} />,
    );
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(["fake"], "voice.mp3", { type: "audio/mpeg" })] },
    });
    fireEvent.click(screen.getByText("전사해 자막 만들기"));
    await waitFor(() =>
      expect(screen.getByText(/Groq 키 인증에 실패했어요/)).toBeTruthy(),
    );
    expect(onEpisodeChange).not.toHaveBeenCalled();
  });

  it("SRT 내려받기는 자막 파일 Blob을 만든다", async () => {
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      blobs.push(blob as Blob);
      return "blob:mock";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    render(<MotionWebtoonCaptionPanel episode={makeEpisode()} onEpisodeChange={() => {}} />);
    fireEvent.click(screen.getByText("SRT 내려받기"));
    expect(blobs).toHaveLength(1);
    const text = await blobs[0].text();
    expect(text).toContain("00:00:01,000 --> 00:00:06,000");
    expect(text).toContain("첫 대사");
  });
});
