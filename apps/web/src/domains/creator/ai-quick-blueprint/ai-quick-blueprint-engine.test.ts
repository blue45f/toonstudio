// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MyStoryTextCompleter } from "../my-story/my-story-ai";
import { readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioProjectFeatureSuite } from "../studio-project-feature-suite-store";
import { storyDevelopmentStorageKey } from "../studio-story-adaptation";
import type { AiBlueprintHandoffStorage } from "./ai-quick-blueprint-handoff";

import {
  AI_IDEA_SPARK_PRESETS,
  appendBlueprintCut,
  buildAiQuickBlueprint,
  buildContextualInterviewAnswer,
  buildStoryLabWorksheetFromIdea,
  cycleBlueprintTitle,
  openAiQuickBlueprintInStudio,
  polishBlueprintWithCloudAi,
  remixBlueprintCut,
} from "./ai-quick-blueprint-engine";

describe("ai-quick-blueprint-engine", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("한 줄 아이디어로 4컷·6컷 콘티와 8항목 스토리 워크시트를 즉시 생성한다", () => {
    const fourCut = buildAiQuickBlueprint({
      idea: "비 오는 날 헌책방에서 미래 일기장을 주웠다",
      formatId: "instatoon-4",
      toneId: "romance",
      locale: "ko",
    });
    expect(fourCut.cuts).toHaveLength(4);
    expect(fourCut.characters).toHaveLength(2);
    expect(fourCut.storyWorksheet.title.length).toBeGreaterThan(2);
    expect(fourCut.storyWorksheet.turn.length).toBeGreaterThan(10);

    const sixCut = buildAiQuickBlueprint({
      idea: "은퇴한 헌터가 던전 입구에 에스프레소 바를 열었다",
      formatId: "webtoon-6",
      toneId: "action",
      locale: "ko",
    });
    expect(sixCut.cuts).toHaveLength(6);
    expect(sixCut.cuts[5]?.beatLabel).toContain("6컷");
  });

  it("영어 로케일에서 생성된 제목·캐릭터·컷·워크시트에 한글이 한 글자도 섞이지 않는다", () => {
    for (const preset of AI_IDEA_SPARK_PRESETS) {
      const enBlueprint = buildAiQuickBlueprint({
        idea: preset.ideaEn,
        formatId: preset.recommendedFormat,
        toneId: preset.recommendedTone,
        locale: "en",
      });
      const serialized = JSON.stringify({
        title: enBlueprint.title,
        altTitles: enBlueprint.altTitles,
        logline: enBlueprint.logline,
        characters: enBlueprint.characters.map((c) => [c.roleEn, c.name, c.traitSummary, c.poseHint]),
        cuts: enBlueprint.cuts,
        storyWorksheet: enBlueprint.storyWorksheet,
      });
      expect(serialized).not.toMatch(/[가-힣]/u);
    }
  });

  it("제목 순환·컷별 톤 리믹스·보너스 컷 추가가 결정적으로 동작한다", () => {
    const base = buildAiQuickBlueprint({
      idea: "야근 책상 위 고양이 신입사원",
      formatId: "instatoon-4",
      toneId: "comedy",
      locale: "ko",
    });
    const cycled = cycleBlueprintTitle(base);
    expect(cycled.title).not.toBe(base.title);
    expect(cycled.storyWorksheet.title).toBe(cycled.title);

    const remixed = remixBlueprintCut(cycled, "cut-2", "dramatic");
    expect(remixed.cuts[1]?.dialogue).not.toBe(base.cuts[1]?.dialogue);
    expect(remixed.cuts[1]?.remixRevision).toBe(1);

    const expanded = appendBlueprintCut(remixed);
    expect(expanded.cuts).toHaveLength(5);
    expect(expanded.cuts[4]?.index).toBe(5);
  });

  it("클라우드 AI 윤문 성공 시 문장을 반영하고, 비로그인 실패 시에도 초안을 안전하게 유지한다", async () => {
    const base = buildAiQuickBlueprint({
      idea: "학교 옥상 3회 타임루프",
      formatId: "instatoon-4",
      toneId: "mystery",
      locale: "ko",
    });

    const polished = await polishBlueprintWithCloudAi(
      base,
      undefined,
      vi.fn().mockResolvedValue({
        ok: true,
        data: {
          content: JSON.stringify({
            title: "졸업식 세 번째 옥상",
            logline: "세 번만 열리는 옥상 문 너머에서 진짜 졸업식이 시작된다.",
            cuts: [
              { scene: "옥상 문고리를 잡는 손 클로즈업", dialogue: "이번이 마지막 세 번째야.", narration: "시계가 다시 아침 8시를 가리켰다." },
            ],
          }),
        },
      }),
    );
    expect(polished.upgraded).toBe(true);
    expect(polished.blueprint.source).toBe("cloud-ai");
    expect(polished.blueprint.title).toBe("졸업식 세 번째 옥상");
    expect(polished.blueprint.cuts[0]?.dialogue).toBe("이번이 마지막 세 번째야.");

    const fallback = await polishBlueprintWithCloudAi(
      base,
      undefined,
      vi.fn().mockResolvedValue({
        ok: false,
        code: "login_required",
        error: "로그인이 필요합니다",
      }),
    );
    expect(fallback.upgraded).toBe(false);
    expect(fallback.blueprint.title).toBe(base.title);
    expect(fallback.statusMessage).toContain("스마트 콘티");
  });

  describe("클라우드 윤문 응답 검증", () => {
    const draft = buildAiQuickBlueprint({
      idea: "옥상에서 찾은 실종 고양이", formatId: "instatoon-4", toneId: "mystery", locale: "ko",
    });

    it.each([
      ["깨진 JSON", '{"title":'],
      ["모르는 필드", '{"confidence":1}'],
      ["잘못된 최상위 형식", '[{"title":"잘못된 제목"}]'],
      ["따옴표뿐인 대사", JSON.stringify({ cuts: [{ dialogue: "“”" }] })],
      ["바뀐 내용 없음", JSON.stringify({ title: draft.title, cuts: draft.cuts })],
      ["없는 컷의 수정", '{"cuts":[{"id":"cut-90","dialogue":"오답"}]}'],
    ])("%s 응답은 성공 표시 없이 원본 그대로 돌려준다", async (_label, content) => {
      const complete = vi.fn().mockResolvedValue({ ok: true, data: { content } });
      const outcome = await polishBlueprintWithCloudAi(draft, undefined, complete);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(outcome.upgraded).toBe(false);
      expect(outcome.blueprint).toBe(draft);
      expect(outcome.statusMessage).toContain("수정 내용을 찾지 못했어요");
    });

    it("컷 순서가 바뀐 부분 응답도 원래 ID에 대응시키고 나머지 컷을 보존한다", async () => {
      const content = JSON.stringify({ cuts: [
        { id: "cut-4", narration: "고양이는 창틀로 돌아갔다." },
        { dialogue: "ID가 없는 수정" },
        { id: "cut-2", dialogue: "“발자국을 봐!”" },
      ] });
      const complete = vi.fn<MyStoryTextCompleter>().mockResolvedValue({ ok: true, data: { content: `메타 {}\n${content}` } });
      const outcome = await polishBlueprintWithCloudAi(draft, undefined, complete);
      const request = complete.mock.calls[0]?.[0];
      expect(JSON.parse(request?.user ?? "null")).toMatchObject({
        logline: draft.logline,
        cuts: draft.cuts.map((cut) => ({ id: cut.id })),
      });
      expect(outcome.upgraded).toBe(true);
      expect(outcome.blueprint.cuts.map((cut) => cut.id)).toEqual(draft.cuts.map((cut) => cut.id));
      expect(outcome.blueprint.cuts[0]).toBe(draft.cuts[0]);
      expect(outcome.blueprint.cuts[1]?.dialogue).toBe("발자국을 봐!");
      expect(outcome.blueprint.cuts[2]).toBe(draft.cuts[2]);
      expect(outcome.blueprint.cuts[3]?.narration).toBe("고양이는 창틀로 돌아갔다.");
    });

    it("동시에 윤문을 실행한 두 콘티에 서로 다른 요청 식별자를 준다", async () => {
      const complete = vi.fn<MyStoryTextCompleter>().mockResolvedValue({ ok: true, data: { content: "{}" } });
      const clock = vi.spyOn(Date, "now").mockReturnValue(1000);
      try {
        await Promise.all([
          polishBlueprintWithCloudAi(draft, undefined, complete),
          polishBlueprintWithCloudAi({ ...draft, title: "다른 작품" }, undefined, complete),
        ]);
        const ids = complete.mock.calls.map(([request]) => request.operationId);
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
      } finally {
        clock.mockRestore();
      }
    });

    it("무료 한도 소진 안내와 네트워크 오류 안내를 구분한다", async () => {
      const outcome = await polishBlueprintWithCloudAi(draft, undefined, async () => ({
        ok: false, code: "free_exhausted", error: "quota",
      }));
      expect(outcome.blueprint).toBe(draft);
      expect(outcome.statusMessage).toContain("무료 AI 한도");
    });
  });

  it("스튜디오 바로 열기는 프로젝트·스토리 문서·스토리 비트를 원자적으로 저장하고 경로를 반환한다", () => {
    const blueprint = buildAiQuickBlueprint({
      idea: "궁중 수라간 막내의 비밀 야식",
      formatId: "webtoon-6",
      toneId: "romance",
      locale: "ko",
    });
    const result = openAiQuickBlueprintInStudio(window.localStorage, blueprint, {
      now: "2026-11-17T00:00:00.000Z",
    });
    expect(result.href).toMatch(/^\/studio\/p\/[^/]+\/story\?view=script&uiMode=simple$/u);
    expect(result.beatCount).toBe(6);

    const library = readStudioProjectLibrary(window.localStorage);
    expect(library.projects.some((project) => project.id === result.projectId)).toBe(true);

    const rawDoc = window.localStorage.getItem(storyDevelopmentStorageKey(result.projectId));
    expect(rawDoc).not.toBeNull();
    expect(JSON.parse(rawDoc ?? "null")).toMatchObject({
      version: 1, sourceKind: "original", title: blueprint.title, logline: blueprint.logline,
      chapters: [{ id: "chapter-1", status: "draft", body: expect.any(String) }],
      updatedAt: "2026-11-17T00:00:00.000Z",
    });

    const suite = readStudioProjectFeatureSuite(window.localStorage, result.projectId);
    expect(suite?.storyBeats).toHaveLength(6);
  });

  it("서로 다른 작품에 새 초안을 쓰고 이전 작품의 대본·비트를 그대로 다시 읽는다", () => {
    const first = buildAiQuickBlueprint({ idea: "첫 작품의 비밀 야식", formatId: "webtoon-6", toneId: "romance", locale: "ko" });
    const firstResult = openAiQuickBlueprintInStudio(window.localStorage, first);
    const firstKey = storyDevelopmentStorageKey(firstResult.projectId);
    const firstDocument = window.localStorage.getItem(firstKey);
    const firstBeats = readStudioProjectFeatureSuite(window.localStorage, firstResult.projectId)?.storyBeats;
    const second = buildAiQuickBlueprint({ idea: "다른 작품의 달나라 탐험", formatId: "instatoon-4", toneId: "action", locale: "ko" });
    const secondResult = openAiQuickBlueprintInStudio(window.localStorage, second);
    expect(secondResult.projectId).not.toBe(firstResult.projectId);
    expect(window.localStorage.getItem(firstKey)).toBe(firstDocument);
    expect(readStudioProjectFeatureSuite(window.localStorage, firstResult.projectId)?.storyBeats).toEqual(firstBeats);
    expect(JSON.parse(window.localStorage.getItem(storyDevelopmentStorageKey(secondResult.projectId)) ?? "null"))
      .toMatchObject({ version: 1, title: second.title, logline: second.logline });
    expect(readStudioProjectFeatureSuite(window.localStorage, secondResult.projectId)?.storyBeats).toHaveLength(4);
  });

  it("대본 쓰기가 실패하면 새 프로젝트를 되돌리고 기존 작품의 문서를 보존한다", () => {
    const blueprint = buildAiQuickBlueprint({ idea: "보존할 기존 작품", formatId: "webtoon-6", toneId: "romance", locale: "ko" });
    const existing = openAiQuickBlueprintInStudio(window.localStorage, blueprint);
    const existingKey = storyDevelopmentStorageKey(existing.projectId);
    const existingDocument = window.localStorage.getItem(existingKey);
    const existingBeats = readStudioProjectFeatureSuite(window.localStorage, existing.projectId)?.storyBeats;
    let attemptedStoryKey: string | null = null;
    const failure = new Error("QuotaExceededError");
    const storage: AiBlueprintHandoffStorage = {
      getItem: key => window.localStorage.getItem(key),
      setItem: (key, value) => {
        if (key.startsWith("toonstudio:story-development:v1:")) { attemptedStoryKey = key; throw failure; }
        window.localStorage.setItem(key, value);
      },
      removeItem: key => window.localStorage.removeItem(key),
    };
    let caught: unknown;
    try { openAiQuickBlueprintInStudio(storage, blueprint); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(Error);
    if (!(caught instanceof Error)) throw new Error("실패한 저장이 오류를 반환하지 않았습니다.");
    expect(caught.message).toContain("콘티 초안을 작품에 저장하지 못했어요");
    expect(caught.cause).toBe(failure);
    expect(attemptedStoryKey).not.toBeNull();
    if (attemptedStoryKey === null) throw new Error("대본 쓰기 실패 경로를 실행하지 않았습니다.");
    expect(attemptedStoryKey).not.toBe(existingKey);
    expect(window.localStorage.getItem(attemptedStoryKey)).toBeNull();
    expect(readStudioProjectLibrary(window.localStorage).projects.map(project => project.id)).toEqual([existing.projectId]);
    expect(window.localStorage.getItem(existingKey)).toBe(existingDocument);
    expect(readStudioProjectFeatureSuite(window.localStorage, existing.projectId)?.storyBeats).toEqual(existingBeats);
  });

  it("인터뷰 맥락 추천과 워크시트 생성이 빈 입력에도 안전하게 동작한다", () => {
    const worksheet = buildStoryLabWorksheetFromIdea("", "romance", "en");
    expect(worksheet.title.length).toBeGreaterThan(3);
    expect(JSON.stringify(worksheet)).not.toMatch(/[가-힣]/u);

    const suggestion = buildContextualInterviewAnswer({
      slot: "turn",
      seedIdea: "달에서 길 잃은 로봇",
      fallbackExampleKo: "기본 예시",
      fallbackExampleEn: "Fallback example",
      locale: "ko",
    });
    expect(suggestion).toContain("달에서 길 잃은 로봇");
  });
});
