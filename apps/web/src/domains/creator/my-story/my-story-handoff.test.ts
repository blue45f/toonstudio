import { describe, expect, it } from "vitest";

import {
  readStudioProjectLibrary,
} from "../studio-project-library-store";
import { readStudioProjectFeatureSuite } from "../studio-project-feature-suite-store";
import { storyDevelopmentStorageKey, type StudioStoryDevelopmentDocument } from "../studio-story-adaptation";
import { planStudioStoryboard } from "../studio-storyboard-planner";

import {
  MY_STORY_PROJECT_TEMPLATE_BY_CUT_COUNT,
  MyStoryHandoffError,
  openMyStoryInStudio,
  type MyStoryHandoffStorage,
} from "./my-story-handoff";
import { createMemoryStorage, FIXTURE_ANSWERS, FIXTURE_AT, fullSession } from "./my-story-test-fixture";
import { myStoryInterviewReducer, createMyStorySession } from "./my-story-interview";

function storage(): MyStoryHandoffStorage & { readonly entries: Map<string, string> } {
  return createMemoryStorage();
}

/** 대본 패널(StudioStoryDevelopmentPanel)이 읽는 저장 형식과 같은 모양인지 확인하고 돌려준다. */
function storyDocument(store: MyStoryHandoffStorage, projectId: string): StudioStoryDevelopmentDocument | null {
  const raw = store.getItem(storyDevelopmentStorageKey(projectId));
  if (!raw) return null;
  const parsed: unknown = JSON.parse(raw);
  if (
    typeof parsed !== "object" || parsed === null
    || !("version" in parsed) || parsed.version !== 1
    || !("chapters" in parsed) || !Array.isArray(parsed.chapters)
  ) {
    return null;
  }
  return parsed as StudioStoryDevelopmentDocument;
}

describe("openMyStoryInStudio — 기존 대본·콘티 시작 경로로 전달", () => {
  it("8컷 초안은 컷툰 4:5 세로 8장 프로젝트가 되고 대본 보기(story?view=script)로 향한다", () => {
    const store = storage();
    const result = openMyStoryInStudio(store, fullSession("retrospective"), { locale: "ko", now: FIXTURE_AT });
    expect(result.href).toBe(`/studio/p/${encodeURIComponent(result.projectId)}/story?view=script`);
    expect(result.beatCount).toBe(8);

    const library = readStudioProjectLibrary(store);
    const project = library.projects.find((entry) => entry.id === result.projectId);
    expect(project?.title).toBe("내 인생의 한 장면");
    expect(project?.kind).toBe("webtoon");
    expect(project?.templateId).toBe(MY_STORY_PROJECT_TEMPLATE_BY_CUT_COUNT[8]);
    expect(project?.templateId).toBe("cuttoon-portrait-8");
  });

  it("4컷 초안은 정사각 4장 템플릿을 쓴다", () => {
    const store = storage();
    const result = openMyStoryInStudio(store, fullSession("safety"), { locale: "ko", now: FIXTURE_AT });
    const project = readStudioProjectLibrary(store).projects.find((entry) => entry.id === result.projectId);
    expect(project?.templateId).toBe("cuttoon-square-4");
    expect(result.beatCount).toBe(4);
  });

  it("대본 패널이 읽는 스토리 개발 문서에 원고·한 줄·줄거리를 쓴다", () => {
    const store = storage();
    const { projectId } = openMyStoryInStudio(store, fullSession("retrospective", { cutCount: 4 }), { locale: "ko", now: FIXTURE_AT });
    const doc = storyDocument(store, projectId);
    expect(doc).not.toBeNull();
    expect(doc?.version).toBe(1);
    expect(doc?.sourceKind).toBe("original");
    expect(doc?.logline).toBe(FIXTURE_ANSWERS.message);
    expect(doc?.synopsis).toContain(FIXTURE_ANSWERS.event);
    expect(doc?.chapters).toHaveLength(1);
    const chapter = doc?.chapters[0];
    expect(chapter?.id).toBe("chapter-1");
    expect(chapter?.status).toBe("draft");
    expect(chapter?.body).toContain("컷 1 · 도입");
    expect(chapter?.body).toContain(FIXTURE_ANSWERS.where);
  });

  it("프로젝트 기능 묶음의 스토리 비트를 컷 수만큼 채워 콘티 플래너가 바로 계획한다", () => {
    const store = storage();
    const { projectId } = openMyStoryInStudio(store, fullSession("family"), { locale: "ko", now: FIXTURE_AT });
    const suite = readStudioProjectFeatureSuite(store, projectId);
    expect(suite?.storyBeats).toHaveLength(8);
    expect(suite?.storyBeats.every((beat) => beat.id.startsWith("my-story:beat:"))).toBe(true);
    expect(planStudioStoryboard(suite?.storyBeats ?? []).shots).toHaveLength(8);
  });

  it("영어 로케일에서는 틀 문구와 기본 제목이 영어다", () => {
    const store = storage();
    const { projectId } = openMyStoryInStudio(store, fullSession("neighborhood"), { locale: "en", now: FIXTURE_AT });
    const project = readStudioProjectLibrary(store).projects.find((entry) => entry.id === projectId);
    expect(project?.title).toBe("A story from my neighborhood");
    expect(storyDocument(store, projectId)?.chapters[0]?.title).toBe("Chapter 1");
    expect(storyDocument(store, projectId)?.chapters[0]?.body).toContain("My story draft");
  });

  it("주제를 고르지 않은 세션은 MyStoryHandoffError이고 프로젝트를 만들지 않는다", () => {
    const store = storage();
    const empty = myStoryInterviewReducer(createMyStorySession(FIXTURE_AT), { type: "reset", at: FIXTURE_AT });
    expect(() => openMyStoryInStudio(store, empty, { locale: "ko" })).toThrow(MyStoryHandoffError);
    expect(readStudioProjectLibrary(store).projects).toEqual([]);
  });

  it("대본 저장에서 실패하면 만들다 만 프로젝트를 되돌린다", () => {
    const store = storage();
    const failing: MyStoryHandoffStorage = {
      getItem: (key) => store.getItem(key),
      setItem: (key, value) => {
        if (key.includes("story-development")) throw new Error("QuotaExceededError");
        store.setItem(key, value);
      },
      removeItem: (key) => store.removeItem?.(key),
    };
    let caught: unknown;
    try {
      openMyStoryInStudio(failing, fullSession("retrospective"), { locale: "ko", now: FIXTURE_AT });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MyStoryHandoffError);
    if (caught instanceof MyStoryHandoffError) expect(caught.message).toContain("저장하지 못했어요");
    expect(readStudioProjectLibrary(store).projects.filter((entry) => entry.status !== "trashed")).toEqual([]);
  });

  it("프로젝트 생성 자체가 막히면 생성 실패 오류를 알린다", () => {
    const blocked: MyStoryHandoffStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    };
    expect(() => openMyStoryInStudio(blocked, fullSession("retrospective"), { locale: "ko" }))
      .toThrow(/새 작품을 만들지 못했어요/u);
  });
});
