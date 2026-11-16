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
import { completeMyStoryText } from "../my-story/my-story-ai-client";
import type { MyStoryTextCompleter } from "../my-story/my-story-ai";
import { studioProjectSectionHref } from "../studio-project-views";
import {
  storyDevelopmentStorageKey,
  type StudioStoryDevelopmentDocument,
} from "../studio-story-adaptation";
import type { StudioStoryBeat } from "../studio-storyboard-planner";

import {
  AI_BLUEPRINT_FORMATS,
  type AiBlueprintLocale,
  type AiQuickBlueprint,
} from "./ai-quick-blueprint-engine";

export type AiBlueprintHandoffStorage = StudioProjectCreationStorage
  & StudioSaveProfileStorage
  & StudioProjectFeatureSuiteStorage;

export interface AiBlueprintHandoffResult {
  readonly projectId: string;
  readonly href: string;
  readonly beatCount: number;
}

export interface PolishBlueprintOutcome {
  readonly blueprint: AiQuickBlueprint;
  readonly upgraded: boolean;
  readonly statusMessage: string;
}

function pickText(locale: AiBlueprintLocale, ko: string, en: string): string {
  return locale === "ko" ? ko : en;
}

export async function polishBlueprintWithCloudAi(
  blueprint: AiQuickBlueprint,
  signal?: AbortSignal,
  completer: MyStoryTextCompleter = completeMyStoryText,
): Promise<PolishBlueprintOutcome> {
  const ko = blueprint.locale === "ko";
  const system = ko
    ? "당신은 웹툰 콘티·대사 전문 에디터입니다. JSON만 출력하세요: {\"title\":string,\"logline\":string,\"cuts\":[{\"scene\":string,\"dialogue\":string,\"narration\":string}]}. 마크다운 코드블록 없이 순수 JSON 객체만 반환하세요."
    : "You are a professional webtoon storyboard and dialogue editor. Output ONLY raw JSON: {\"title\":string,\"logline\":string,\"cuts\":[{\"scene\":string,\"dialogue\":string,\"narration\":string}]} without markdown fences.";

  const user = JSON.stringify({
    idea: blueprint.idea,
    tone: blueprint.toneId,
    cutCount: blueprint.cuts.length,
    currentTitle: blueprint.title,
    cuts: blueprint.cuts.map((cut) => ({
      beat: cut.beatLabel,
      scene: cut.scene,
      dialogue: cut.dialogue,
      narration: cut.narration,
    })),
  });

  try {
    const response = await completer(
      {
        system,
        user,
        operationId: `ai-quick-blueprint-${blueprint.formatId}-${Date.now()}`,
      },
      signal,
    );
    if (!response.ok) {
      const authHint =
        response.code === "login_required"
          ? pickText(
              blueprint.locale,
              "로그인하면 클라우드 AI 문장 윤문도 무료로 함께 쓸 수 있어요. 지금 설계된 스마트 콘티로도 바로 스튜디오를 열 수 있습니다!",
              "Sign in anytime for free Cloud AI line polishing. Your smart blueprint is already ready to open in Studio!",
            )
          : pickText(
              blueprint.locale,
              "네트워크 연결 없이도 바로 쓸 수 있도록 스마트 콘티를 준비해 두었어요. 아래 컷을 수정하거나 바로 스튜디오에서 열어보세요.",
              "Your smart blueprint is ready offline—edit any panel below or open it straight in Studio.",
            );
      return {
        blueprint,
        upgraded: false,
        statusMessage: authHint,
      };
    }

    const raw = response.data.content;
    const jsonMatch = raw.match(/\{[\s\S]*\}/u);
    if (!jsonMatch) {
      return {
        blueprint,
        upgraded: false,
        statusMessage: pickText(
          blueprint.locale,
          "클라우드 응답 형식이 고르지 않아 즉시 설계된 스마트 콘티를 그대로 유지했어요.",
          "Kept your smart instant blueprint intact because the cloud response format varied.",
        ),
      };
    }
    const parsed = JSON.parse(jsonMatch[0]) as {
      title?: unknown;
      logline?: unknown;
      cuts?: readonly { scene?: unknown; dialogue?: unknown; narration?: unknown }[];
    };
    const nextTitle =
      typeof parsed.title === "string" && parsed.title.trim().length > 0
        ? parsed.title.trim().slice(0, 80)
        : blueprint.title;
    const nextLogline =
      typeof parsed.logline === "string" && parsed.logline.trim().length > 0
        ? parsed.logline.trim().slice(0, 240)
        : blueprint.logline;
    const aiCuts = Array.isArray(parsed.cuts) ? parsed.cuts : [];

    const mergedCuts = blueprint.cuts.map((cut, index) => {
      const candidate = aiCuts[index];
      if (!candidate || typeof candidate !== "object") return cut;
      return {
        ...cut,
        scene:
          typeof candidate.scene === "string" && candidate.scene.trim().length > 0
            ? candidate.scene.trim().slice(0, 240)
            : cut.scene,
        dialogue:
          typeof candidate.dialogue === "string" && candidate.dialogue.trim().length > 0
            ? candidate.dialogue.trim().replace(/^[“"']+|[”"']+$/gu, "").slice(0, 160)
            : cut.dialogue,
        narration:
          typeof candidate.narration === "string" && candidate.narration.trim().length > 0
            ? candidate.narration.trim().slice(0, 160)
            : cut.narration,
      };
    });

    return {
      blueprint: {
        ...blueprint,
        source: "cloud-ai",
        title: nextTitle,
        logline: nextLogline,
        cuts: mergedCuts,
        storyWorksheet: {
          ...blueprint.storyWorksheet,
          title: nextTitle,
        },
      },
      upgraded: true,
      statusMessage: pickText(
        blueprint.locale,
        "클라우드 AI가 컷별 대사와 연출 문장을 한층 자연스럽게 다듬었어요!",
        "Cloud AI polished your panel scenes and dialogue!",
      ),
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    return {
      blueprint,
      upgraded: false,
      statusMessage: pickText(
        blueprint.locale,
        "네트워크 연결 없이도 바로 쓸 수 있도록 스마트 콘티를 준비해 두었어요. 아래 컷을 수정하거나 바로 스튜디오에서 열어보세요.",
        "Your smart blueprint is ready offline—edit any panel below or open it straight in Studio.",
      ),
    };
  }
}

export function composeBlueprintScript(blueprint: AiQuickBlueprint): string {
  const ko = blueprint.locale === "ko";
  const headerLines = [
    `# ${blueprint.title}`,
    `${ko ? "한 줄 로그라인" : "Logline"}: ${blueprint.logline}`,
    "",
    `## ${ko ? "등장인물 가이드" : "Character Guide"}`,
    ...blueprint.characters.map(
      (ch) => `- ${ch.name}: ${ch.traitSummary} (${ch.poseHint})`,
    ),
    "",
  ];

  const cutSections = blueprint.cuts.map((cut) =>
    [
      `### ${cut.beatLabel}`,
      `- ${ko ? "카메라·구도" : "Camera & Shot"}: ${cut.shotAngle}`,
      `- ${ko ? "장면 연출" : "Scene"}: ${cut.scene}`,
      `- ${ko ? "말풍선 대사" : "Dialogue"}: “${cut.dialogue}”`,
      `- ${ko ? "나레이션" : "Narration"}: [${cut.narration}]`,
      `- ${ko ? "효과음·3D 힌트" : "SFX & 3D Stage"}: (${cut.sfx}) / ${cut.stage3dHint}`,
    ].join("\n"),
  );

  return [...headerLines, ...cutSections].join("\n\n");
}

export function buildBlueprintBeats(blueprint: AiQuickBlueprint): StudioStoryBeat[] {
  const sceneSize = Math.max(1, Math.round(blueprint.cuts.length / 3));
  return blueprint.cuts.map((cut, offset) => ({
    id: `ai-blueprint:beat:${cut.index}`,
    sceneId: `ai-blueprint:scene:${Math.floor(offset / sceneSize) + 1}`,
    order: offset,
    kind: cut.beatKind,
    summary: `${cut.scene} (${cut.shotAngle})`,
    dialogue: cut.dialogue,
    characterIds:
      cut.beatKind === "dialogue" || cut.beatKind === "reaction"
        ? ["character:lead", "character:partner"]
        : ["character:lead"],
    locationId: null,
  }));
}

function rollbackBlueprintProject(
  storage: AiBlueprintHandoffStorage,
  projectId: string,
  target?: { dispatchEvent(event: Event): boolean },
): void {
  try {
    storage.removeItem?.(storyDevelopmentStorageKey(projectId));
  } catch {
    // best-effort 정리
  }
  try {
    trashStudioProject(storage, projectId, { target });
    permanentlyDeleteStudioProject(storage, projectId, { target });
  } catch {
    // 부분 실패 은닉 방지
  }
}

export function openAiQuickBlueprintInStudio(
  storage: AiBlueprintHandoffStorage,
  blueprint: AiQuickBlueprint,
  options?: {
    readonly now?: string;
    readonly target?: { dispatchEvent(event: Event): boolean };
  },
): AiBlueprintHandoffResult {
  const now = options?.now ?? new Date().toISOString();
  const formatSpec =
    AI_BLUEPRINT_FORMATS.find((item) => item.id === blueprint.formatId) ?? AI_BLUEPRINT_FORMATS[0];
  const profile = studioProjectFormatProfile(formatSpec.studioFormat);
  const templateOption = formatSpec.studioTemplateId
    ? studioProjectFormatTemplate(profile, formatSpec.studioTemplateId)
    : (profile.templates[0] ?? studioProjectFormatTemplate(profile, ""));
  const plan = resolveStudioModeCreationPlan(profile.projectKind, templateOption.id);

  let projectId: string;
  try {
    const created = createStudioProjectWithInitialDocument(
      storage,
      {
        title: blueprint.title,
        kind: profile.projectKind,
        templateId: templateOption.id,
        primaryLocale: blueprint.locale,
        createdAt: now,
        definition: studioProjectDefinitionFromSelection(profile, "portfolio", "script", "solo"),
        document: {
          title: studioProjectFormatDocumentTitle(profile.id, blueprint.title, blueprint.locale),
          kind: plan.document.kind,
          defaultWorkspace: plan.document.workspace,
          width: plan.document.width,
          height: plan.document.height,
          pageCount: templateOption.pageCount,
        },
      },
      options?.target,
    );
    projectId = created.project.id;
  } catch (cause) {
    throw new Error(
      pickText(
        blueprint.locale,
        "새 작품을 만들지 못했어요. 브라우저 저장 공간을 확인해 주세요.",
        "Could not create the new work. Please check your browser storage space.",
      ),
      { cause },
    );
  }

  try {
    ensureStudioSaveProfile(storage, projectId, {
      provider: "browser",
      autoSave: true,
      createVersions: true,
      now,
      target: options?.target,
    });

    const development: StudioStoryDevelopmentDocument = {
      version: 1,
      sourceKind: "original",
      title: blueprint.title,
      logline: blueprint.logline,
      synopsis: `${blueprint.storyWorksheet.desire} ${blueprint.storyWorksheet.obstacle} ${blueprint.storyWorksheet.turn}`,
      chapters: [
        {
          id: "chapter-1",
          title: pickText(blueprint.locale, "1화 콘티 초안", "Episode 1 Storyboard Draft"),
          body: composeBlueprintScript(blueprint),
          status: "draft",
        },
      ],
      updatedAt: now,
    };
    storage.setItem(storyDevelopmentStorageKey(projectId), JSON.stringify(development));

    const beats = buildBlueprintBeats(blueprint);
    updateStudioProjectFeatureSuite(
      storage,
      projectId,
      (current) => ({ ...current, storyBeats: beats }),
      options?.target,
    );

    return Object.freeze({
      projectId,
      href: `${studioProjectSectionHref(projectId, "story", "script")}&uiMode=simple`,
      beatCount: beats.length,
    });
  } catch (cause) {
    rollbackBlueprintProject(storage, projectId, options?.target);
    throw new Error(
      pickText(
        blueprint.locale,
        "콘티 초안을 작품에 저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.",
        "Could not save the storyboard draft to the project. Check browser storage and try again.",
      ),
      { cause },
    );
  }
}
