/**
 * 내 이야기 초안 → 스튜디오 "대본·콘티" 시작 경로로 전달.
 *
 * 새 저장 형식을 만들지 않고 이미 있는 경로만 쓴다.
 * 1) 새 작품 양식(/studio/new)과 같은 생성 함수로 컷툰 프로젝트를 만든다. 컷 수에 맞는 기존
 *    포맷 템플릿(4컷=cuttoon-square-4, 8컷=cuttoon-portrait-8)을 쓰고, 시작점은 "대본이 있어요(script)"다.
 * 2) 대본 패널(StudioStoryDevelopmentPanel)이 읽는 스토리 개발 문서에 원고를 쓴다.
 * 3) 프로젝트 기능 묶음(feature suite)의 스토리 비트를 컷 수만큼 채워, 콘티 플래너가 4컷/8컷
 *    골격을 그대로 계획하게 한다.
 * 도착 주소는 기존 대본·콘티 시작 경로 `/studio/p/:id/story?view=script`다.
 *
 * 중간에 실패하면 만들다 만 프로젝트를 되돌린다(빈 작품이 보관함에 남지 않게).
 * 저장소·시각·이벤트 대상은 모두 주입받아 테스트에서 결정적으로 검증할 수 있다.
 */

import { ensureStudioSaveProfile, type StudioSaveProfileStorage } from "../save-first/studio-save-profile";
import { resolveStudioModeCreationPlan } from "../studio-mode-creation-plan";
import {
  createStudioProjectWithInitialDocument,
  type StudioProjectCreationStorage,
} from "../studio-project-creation";
import {
  studioProjectDefinitionFromSelection,
  studioProjectFormatDocumentTitle,
  studioProjectFormatProfile,
  studioProjectFormatTemplate,
} from "../studio-project-format-catalog";
import {
  permanentlyDeleteStudioProject,
  trashStudioProject,
} from "../studio-project-library-store";
import {
  updateStudioProjectFeatureSuite,
  type StudioProjectFeatureSuiteStorage,
} from "../studio-project-feature-suite-store";
import { studioProjectSectionHref } from "../studio-project-views";
import {
  storyDevelopmentStorageKey,
  type StudioStoryDevelopmentDocument,
} from "../studio-story-adaptation";

import type { MyStorySession } from "./my-story-interview";
import {
  buildMyStoryBeats,
  buildMyStoryDraft,
  composeMyStoryScript,
  composeMyStorySynopsis,
} from "./my-story-draft";
import { pickMyStoryText, type MyStoryCutCount, type MyStoryLocale } from "./my-story-model";

/** 컷 수 → 기존 컷툰 포맷 템플릿. 정사각 4장 / 4:5 세로 8장. */
export const MY_STORY_PROJECT_TEMPLATE_BY_CUT_COUNT: Readonly<Record<MyStoryCutCount, string>> = Object.freeze({
  4: "cuttoon-square-4",
  8: "cuttoon-portrait-8",
});

export type MyStoryHandoffStorage = StudioProjectCreationStorage
  & StudioSaveProfileStorage
  & StudioProjectFeatureSuiteStorage;

export interface MyStoryHandoffOptions {
  readonly locale: MyStoryLocale;
  /** 프로젝트·문서에 찍을 시각(ISO). 기본은 지금. */
  readonly now?: string;
  /** 보관함/저장 프로필 변경 이벤트를 받을 대상(보통 window). */
  readonly target?: { dispatchEvent(event: Event): boolean };
}

export interface MyStoryHandoffResult {
  readonly projectId: string;
  /** 기존 대본·콘티 시작 경로. */
  readonly href: string;
  readonly beatCount: number;
}

export class MyStoryHandoffError extends Error {
  constructor(message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "MyStoryHandoffError";
  }
}

function rollbackProject(
  storage: MyStoryHandoffStorage,
  projectId: string,
  target: MyStoryHandoffOptions["target"],
): void {
  for (const key of [storyDevelopmentStorageKey(projectId)]) {
    try {
      storage.removeItem?.(key);
    } catch {
      // 정리는 best-effort다. 원래 오류를 덮지 않는다.
    }
  }
  try {
    trashStudioProject(storage, projectId, { target });
    permanentlyDeleteStudioProject(storage, projectId, { target });
  } catch {
    // 복구 가능한 항목이 남는 편이 부분 실패를 숨기는 것보다 안전하다.
  }
}

/**
 * 세션(답변 포함)으로 초안을 만들고 스튜디오 프로젝트로 전달한다.
 * 주제를 아직 고르지 않았거나 저장에 실패하면 MyStoryHandoffError.
 */
export function openMyStoryInStudio(
  storage: MyStoryHandoffStorage,
  session: MyStorySession,
  options: MyStoryHandoffOptions,
): MyStoryHandoffResult {
  const { locale } = options;
  const draft = buildMyStoryDraft(session, locale);
  if (!draft) {
    throw new MyStoryHandoffError(pickMyStoryText(locale, "이야기 주제를 먼저 골라 주세요.", "Pick a story topic first."));
  }
  const now = options.now ?? new Date().toISOString();
  const format = studioProjectFormatProfile("cuttoon");
  const template = studioProjectFormatTemplate(format, MY_STORY_PROJECT_TEMPLATE_BY_CUT_COUNT[draft.cutCount]);
  const plan = resolveStudioModeCreationPlan(format.projectKind, template.id);

  let projectId: string;
  try {
    const created = createStudioProjectWithInitialDocument(storage, {
      title: draft.title,
      kind: format.projectKind,
      templateId: template.id,
      primaryLocale: locale,
      createdAt: now,
      definition: studioProjectDefinitionFromSelection(format, "portfolio", "script", "solo"),
      document: {
        title: studioProjectFormatDocumentTitle(format.id, draft.title, locale),
        kind: plan.document.kind,
        defaultWorkspace: plan.document.workspace,
        width: plan.document.width,
        height: plan.document.height,
        pageCount: template.pageCount,
      },
    }, options.target);
    projectId = created.project.id;
  } catch (cause) {
    throw new MyStoryHandoffError(
      pickMyStoryText(locale, "새 작품을 만들지 못했어요. 이 기기의 저장 공간을 확인해 주세요.", "The new work could not be created. Check this device's storage."),
      { cause },
    );
  }

  try {
    ensureStudioSaveProfile(storage, projectId, {
      provider: "browser",
      autoSave: true,
      createVersions: true,
      now,
      target: options.target,
    });

    const development: StudioStoryDevelopmentDocument = {
      version: 1,
      sourceKind: "original",
      title: draft.title,
      logline: draft.logline,
      synopsis: composeMyStorySynopsis(session),
      chapters: [{
        id: "chapter-1",
        title: pickMyStoryText(locale, "1화", "Chapter 1"),
        body: composeMyStoryScript(draft, locale),
        status: "draft",
      }],
      updatedAt: now,
    };
    storage.setItem(storyDevelopmentStorageKey(projectId), JSON.stringify(development));

    const beats = buildMyStoryBeats(draft, locale);
    updateStudioProjectFeatureSuite(
      storage,
      projectId,
      (current) => ({ ...current, storyBeats: beats }),
      options.target,
    );

    return Object.freeze({
      projectId,
      href: studioProjectSectionHref(projectId, "story", "script"),
      beatCount: beats.length,
    });
  } catch (cause) {
    rollbackProject(storage, projectId, options.target);
    throw new MyStoryHandoffError(
      pickMyStoryText(locale, "초안을 작품에 저장하지 못했어요. 이 기기의 저장 공간을 확인한 뒤 다시 시도해 주세요.", "The draft could not be saved to the work. Check this device's storage and try again."),
      { cause },
    );
  }
}
