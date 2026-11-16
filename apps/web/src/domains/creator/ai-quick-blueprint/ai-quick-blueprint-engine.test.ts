// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import { readStudioProjectLibrary } from "../studio-project-library-store";
import { readStudioProjectFeatureSuite } from "../studio-project-feature-suite-store";
import { storyDevelopmentStorageKey } from "../studio-story-adaptation";

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
        code: "sign_in_required",
        error: "로그인이 필요합니다",
      }),
    );
    expect(fallback.upgraded).toBe(false);
    expect(fallback.blueprint.title).toBe(base.title);
    expect(fallback.statusMessage).toContain("스마트 콘티");
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
    expect(rawDoc).toContain(blueprint.title);

    const suite = readStudioProjectFeatureSuite(window.localStorage, result.projectId);
    expect(suite.storyBeats).toHaveLength(6);
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
