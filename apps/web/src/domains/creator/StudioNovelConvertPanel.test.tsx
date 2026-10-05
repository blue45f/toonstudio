// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getUserAiSnapshot, setUserAiConfiguration } from "@/shared/ai/user-ai-store";
import type { UserAiConfiguration } from "@/shared/ai/user-ai-types";

import { StudioNovelConvertPanel } from "./StudioNovelConvertPanel";
import {
  admitStudioWriterRoomDocument,
  createEmptyStudioWriterRoomDocument,
  type StudioWriterRoomDocument,
} from "./studio-writer-room";

const CHARACTERS = [
  { id: "char-minjun", name: "민준" },
  { id: "char-jiyeon", name: "지연" },
] as const;

/** 첫 대사는 추정(민준), 둘째 대사는 패턴이 없어 미상이 되는 짧은 샘플. */
const PANEL_SAMPLE = [
  '민준이 말했다. "오늘은 여기까지 하자."',
  '지연은 고개를 끄덕였다. "그래, 내일 보자."',
].join("\n\n");

const initialConfiguration = getUserAiSnapshot().configuration;

function renderPanel(baseDocument: StudioWriterRoomDocument, onApply = vi.fn()) {
  return {
    onApply,
    ...render(
      <MemoryRouter>
        <StudioNovelConvertPanel
          baseDocument={baseDocument}
          characters={CHARACTERS}
          onApply={onApply}
          onCancel={vi.fn()}
        />
      </MemoryRouter>
    ),
  };
}

function convertSample() {
  fireEvent.change(screen.getByLabelText("소설 원고"), { target: { value: PANEL_SAMPLE } });
  fireEvent.click(screen.getByRole("button", { name: "글콘티 초안으로 변환" }));
}

beforeEach(() => {
  setUserAiConfiguration(initialConfiguration);
});

afterEach(() => {
  cleanup();
  setUserAiConfiguration(initialConfiguration);
});

describe("StudioNovelConvertPanel", () => {
  it("키가 없으면 AI 보강이 비활성임을 정직하게 안내한다", () => {
    renderPanel(createEmptyStudioWriterRoomDocument());
    expect(screen.getByText("키 없음 — 규칙 기반만 동작")).not.toBeNull();
    expect(screen.getByText("API 키 설정 열기")).not.toBeNull();
    expect(screen.queryByText("텍스트 AI 키 등록됨")).toBeNull();
  });

  it("텍스트 AI 키가 등록·배정돼 있으면 등록 상태를 표시하되 호출을 가장하지 않는다", () => {
    const configuration: UserAiConfiguration = {
      version: 1,
      connections: [
        {
          id: "conn-1",
          label: "내 텍스트 키",
          baseUrl: "https://api.example.com",
          apiKey: "sk-test-12345678",
          textModel: "example-text-model",
          imageModel: "",
          imageGenerationPath: "/v1/images/generations",
          imageEditPath: "/v1/images/edits",
          chatCompletionsPath: "/v1/chat/completions",
          costPolicy: "user-funded-byok",
        },
      ],
      assignments: { text: "conn-1", image: null, inference: null, "three-d": null },
    };
    setUserAiConfiguration(configuration);
    renderPanel(createEmptyStudioWriterRoomDocument());
    expect(screen.getByText("텍스트 AI 키 등록됨")).not.toBeNull();
    expect(screen.getByText(/지금 변환은 규칙 기반으로만 동작해요/)).not.toBeNull();
  });

  it("빈 원고에서는 변환 버튼이 비활성이다", () => {
    renderPanel(createEmptyStudioWriterRoomDocument());
    const button = screen.getByRole("button", { name: "글콘티 초안으로 변환" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("변환하면 초안이 뜨고 추정·미상 배지가 구분된다", () => {
    renderPanel(createEmptyStudioWriterRoomDocument());
    convertSample();
    expect(screen.getByText(/장면 1개 · 컷 4개 · 대사 2개/)).not.toBeNull();
    expect(screen.getByText("추정")).not.toBeNull();
    expect(screen.getByText("화자 미상 대사 1개")).not.toBeNull();
    expect(screen.getByDisplayValue("오늘은 여기까지 하자.")).not.toBeNull();
    expect(screen.getByDisplayValue("그래, 내일 보자.")).not.toBeNull();
  });

  it("너무 긴 원고는 오류로 구분해 보여준다", () => {
    renderPanel(createEmptyStudioWriterRoomDocument());
    fireEvent.change(screen.getByLabelText("소설 원고"), {
      target: { value: "가".repeat(200_001) },
    });
    fireEvent.click(screen.getByRole("button", { name: "글콘티 초안으로 변환" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("회차 단위로 나눠서");
  });

  it("화자를 지정하고 반영하면 작가실 문서에 캐릭터가 연결된다", () => {
    const base = createEmptyStudioWriterRoomDocument();
    const { onApply } = renderPanel(base);
    convertSample();

    // 미상 대사(컷 4)의 화자를 지연으로 지정한다.
    fireEvent.change(screen.getByLabelText("컷 4 화자"), { target: { value: "지연" } });
    fireEvent.click(screen.getByRole("button", { name: "작가실에 반영하기" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]?.[0] as StudioWriterRoomDocument;
    expect(admitStudioWriterRoomDocument(applied, base).kind).toBe("accepted");
    const lines = applied.stages["dialogue-sfx"].dialogue;
    expect(lines.find((line) => line.text === "오늘은 여기까지 하자.")?.characterId).toBe(
      "char-minjun"
    );
    expect(lines.find((line) => line.text === "그래, 내일 보자.")?.characterId).toBe("char-jiyeon");
  });

  it("기존 장면이 있으면 교체를 확인하기 전에는 반영할 수 없다", () => {
    const base = createEmptyStudioWriterRoomDocument();
    base.stages.scenes = {
      items: [
        {
          id: "scene-old",
          order: 0,
          beatIds: [],
          heading: "기존 장면",
          summary: "",
          location: "",
          time: "",
          characterIds: [],
        },
      ],
    };
    const { onApply } = renderPanel(base);
    convertSample();

    const applyButton = screen.getByRole("button", { name: "작가실에 반영하기" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect((applyButton as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(applyButton);
    expect(onApply).toHaveBeenCalledTimes(1);
    const applied = onApply.mock.calls[0]?.[0] as StudioWriterRoomDocument;
    expect(applied.stages.scenes.items.some((scene) => scene.id === "scene-old")).toBe(false);
  });
});
