// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { creatorStoryDraftStorageKey } from "@/shared/lib/creator-workspace-persistence";
import { useI18n } from "@/shared/lib/i18n";

import type { MyStoryTextCompletion } from "../my-story/my-story-ai";
import * as myStoryAiClient from "../my-story/my-story-ai-client";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { storyDevelopmentStorageKey } from "../studio-story-adaptation";

import { AiQuickBlueprintComposer } from "./AiQuickBlueprintComposer";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="probe-url">{`${location.pathname}${location.search}`}</output>;
}

describe("AiQuickBlueprintComposer", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    useI18n.setState({ lang: "ko" });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    useI18n.setState({ lang: "ko" });
  });

  it("원탭 아이디어 스파크로 콘티를 생성하고 대사 리믹스 후 스튜디오 프로젝트로 연다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId("ai-blueprint-result-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "던전 입구 심야 카페" }));

    const resultPanel = screen.getByTestId("ai-blueprint-result-panel");
    expect(resultPanel).toBeTruthy();
    const panels = within(resultPanel).getByRole("list", { name: "생성된 컷 콘티 목록" });
    expect(within(panels).getAllByRole("listitem")).toHaveLength(6);

    fireEvent.click(within(resultPanel).getAllByRole("button", { name: "극적으로" })[0] as HTMLElement);
    fireEvent.click(screen.getByTestId("ai-blueprint-open-studio-btn"));

    expect(screen.getByTestId("probe-url").textContent).toMatch(/^\/studio\/p\/[^/]+\/story\?view=script&uiMode=simple$/u);
    expect(readStudioProjectLibrary(window.localStorage).projects).toHaveLength(1);
  });

  it("스토리 연구실 채우기 버튼이 8항목 초안을 세션 저장소에 기록하고 이동한다", () => {
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer initialIdea="비 오는 날 헌책방에서 내일의 일기장을 주웠다" />
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByTestId("ai-blueprint-open-storylab-btn"));
    expect(screen.getByTestId("probe-url").textContent).toContain("/story-lab?idea=");
    const saved = window.sessionStorage.getItem(creatorStoryDraftStorageKey("guest"));
    expect(saved).not.toBeNull();
    expect(saved).toContain("헌책방");
  });

  it("클라우드 응답에 수정이 없으면 원고를 유지하고 사용자가 다시 실행한 수정을 저장한다", async () => {
    const complete = vi.spyOn(myStoryAiClient, "completeMyStoryText")
      .mockResolvedValueOnce({ ok: true, data: { content: "{}" } })
      .mockResolvedValueOnce({
        ok: true, data: { content: JSON.stringify({ cuts: [{ id: "cut-2", dialogue: "내일 이 문을 다시 열자." }] }) },
      });
    render(<MemoryRouter><AiQuickBlueprintComposer initialIdea="졸업식 옥상의 편지" /></MemoryRouter>);
    const polish = screen.getByRole("button", { name: "클라우드 AI 문장 윤문" });
    expect(complete).not.toHaveBeenCalled();
    fireEvent.click(polish);
    expect(await screen.findByText(/클라우드 응답에서 반영할 수정 내용을 찾지 못했어요/u)).toBeTruthy();
    expect(screen.queryByText("클라우드 AI 윤문 적용됨")).toBeNull();
    expect(complete).toHaveBeenCalledTimes(1);

    fireEvent.click(polish);
    expect(await screen.findByText("클라우드 AI 윤문 적용됨")).toBeTruthy();
    expect(screen.getAllByRole("textbox", { name: "말풍선 대사" })[1]).toHaveProperty("value", "내일 이 문을 다시 열자.");
    fireEvent.click(screen.getByTestId("ai-blueprint-open-studio-btn"));
    const project = readStudioProjectLibrary(window.localStorage).projects[0];
    expect(window.localStorage.getItem(storyDevelopmentStorageKey(project.id))).toContain("내일 이 문을 다시 열자.");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("화면 언어가 달라도 입력한 소재를 쓰고, 언어 변경 후에도 편집한 원고를 스튜디오에 넘긴다", async () => {
    const complete = vi.spyOn(myStoryAiClient, "completeMyStoryText").mockResolvedValue({
      ok: false, code: "free_exhausted", error: "quota",
    });
    useI18n.setState({ lang: "en" });
    const idea = "바닷속 우체국에서 편지가 돌아왔다";
    const title = "심해에서 온 답장";
    const dialogue = "우표가 아직 젖어 있어.";
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer initialIdea={idea} />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("ai-blueprint-result-panel").textContent).toContain(idea);
    fireEvent.change(screen.getByRole("textbox", { name: /Suggested Work Title/u }), { target: { value: title } });
    fireEvent.change(screen.getAllByRole("textbox", { name: "Speech balloon" })[0], { target: { value: dialogue } });
    act(() => { useI18n.setState({ lang: "ko" }); });
    expect(screen.getByRole("textbox", { name: /자동 제안 작품 제목/u })).toHaveProperty("value", title);
    expect(screen.getAllByRole("textbox", { name: "말풍선 대사" })[0]).toHaveProperty("value", dialogue);
    fireEvent.click(screen.getByRole("button", { name: "클라우드 AI 문장 윤문" }));
    expect(await screen.findByText(/무료 AI 한도를 모두 사용했어요/u)).toBeTruthy();
    expect(complete.mock.calls[0]?.[0].system).toContain("Polish this webtoon storyboard in English");
    fireEvent.click(screen.getByTestId("ai-blueprint-open-studio-btn"));
    const project = readStudioProjectLibrary(window.localStorage).projects[0];
    expect(project?.title).toBe(title);
    expect(project?.primaryLocale).toBe("en");
    expect(window.localStorage.getItem(storyDevelopmentStorageKey(project.id))).toContain(dialogue);
  });

  it("언어 변경 때 취소된 이전 요청을 기다리지 않고 다시 실행하고 늦은 응답을 무시한다", async () => {
    let resolveOldRequest: ((result: MyStoryTextCompletion) => void) | undefined;
    const pending = new Promise<MyStoryTextCompletion>((resolve) => { resolveOldRequest = resolve; });
    const complete = vi.spyOn(myStoryAiClient, "completeMyStoryText")
      .mockReturnValueOnce(pending)
      .mockResolvedValueOnce({ ok: true, data: { content: '{"title":"새 요청의 제목"}' } });
    render(<MemoryRouter><AiQuickBlueprintComposer initialIdea="바다 너머의 편지" /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "클라우드 AI 문장 윤문" }));
    await waitFor(() => expect(complete).toHaveBeenCalledTimes(1));
    act(() => { useI18n.setState({ lang: "en" }); });
    expect(complete.mock.calls[0]?.[1]?.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Polish with Cloud AI" }));
    expect(await screen.findByText("Cloud AI Polished")).toBeTruthy();
    await act(async () => {
      resolveOldRequest?.({ ok: true, data: { content: '{"title":"지연된 제목"}' } });
      await pending;
    });
    expect(screen.getByRole("textbox", { name: /Suggested Work Title/u })).toHaveProperty("value", "새 요청의 제목");
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("영어 로케일에서 열림·생성 상태 모두 한글이 한 글자도 노출되지 않는다", () => {
    useI18n.setState({ lang: "en" });
    render(
      <MemoryRouter initialEntries={["/create"]}>
        <AiQuickBlueprintComposer />
      </MemoryRouter>,
    );

    const composer = screen.getByTestId("ai-quick-blueprint-composer");
    expect(composer.textContent).not.toMatch(/[가-힣]/u);

    fireEvent.click(within(composer).getByRole("button", { name: "Midnight cafe at a dungeon gate" }));
    expect(composer.textContent).not.toMatch(/[가-힣]/u);
    for (const el of composer.querySelectorAll("[aria-label], [placeholder]")) {
      expect(`${el.getAttribute("aria-label") ?? ""}${el.getAttribute("placeholder") ?? ""}`).not.toMatch(/[가-힣]/u);
    }
  });
});
