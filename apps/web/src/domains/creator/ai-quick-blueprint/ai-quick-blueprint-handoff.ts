import type { AiRecoveryCode } from "@/shared/ai/ai-recovery-code";
import { extractJsonCandidates } from "@/shared/ai/assist/assist-json";
import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

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
} from "./ai-quick-blueprint-formats";
import type { AiQuickBlueprint } from "./ai-quick-blueprint-engine";

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

const polishRecoveryMessages: Record<AiRecoveryCode, readonly [string, string]> = {
  login_required: ["클라우드 윤문을 사용하려면 로그인해 주세요.", "Sign in to use cloud polishing."],
  free_exhausted: ["현재 이용 가능한 무료 AI 한도를 모두 사용했어요.", "The available free AI quota has been used."],
  not_configured: ["AI 설정에서 텍스트 AI 연결을 확인해 주세요.", "Check your text AI connection in AI settings."],
  invalid_input: ["콘티 입력을 확인한 뒤 다시 시도해 주세요.", "Check your storyboard input and try again."],
  network_error: ["네트워크 연결을 확인한 뒤 다시 시도해 주세요.", "Check your network connection and try again."],
  http_error: ["클라우드 윤문 요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.", "Cloud polishing could not finish. Try again later."],
  parse_error: ["클라우드 응답에서 반영할 수정 내용을 찾지 못했어요.", "The cloud response contained no usable edits."],
};

function keepBlueprint(blueprint: AiQuickBlueprint, code: AiRecoveryCode, locale: AiBlueprintLocale): PolishBlueprintOutcome {
  const [ko, en] = polishRecoveryMessages[code];
  return {
    blueprint,
    upgraded: false,
    statusMessage: pickText(locale, `${ko} 현재 스마트 콘티를 유지했어요.`, `${en} Your current blueprint was kept.`),
  };
}

function isPolishObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function polishedText(value: unknown, original: string, limit: number, dialogue = false): string {
  if (typeof value !== "string") return original;
  const trimmed = value.trim();
  const clean = dialogue ? trimmed.replace(/^[“"']+|[”"']+$/gu, "").trim() : trimmed;
  return Array.from(clean).slice(0, limit).join("") || original;
}

function applyPolish(blueprint: AiQuickBlueprint, value: unknown): AiQuickBlueprint | null {
  if (!isPolishObject(value)) return null;
  const title = polishedText(value.title, blueprint.title, 80);
  const logline = polishedText(value.logline, blueprint.logline, 240);
  const candidates: unknown[] = Array.isArray(value.cuts) ? value.cuts : [];
  // 이전 형식의 응답은 위치로 대응한다. ID가 하나라도 있으면 다른 컷의 수정이 섞이지 않게 ID만 사용한다.
  const hasIds = candidates.some((entry) => isPolishObject(entry) && "id" in entry);
  const cuts = blueprint.cuts.map((cut, index) => {
    const candidate = hasIds
      ? candidates.find((entry) => isPolishObject(entry) && entry.id === cut.id)
      : candidates[index];
    if (!isPolishObject(candidate)) return cut;
    const scene = polishedText(candidate.scene, cut.scene, 240);
    const dialogue = polishedText(candidate.dialogue, cut.dialogue, 160, true);
    const narration = polishedText(candidate.narration, cut.narration, 160);
    if (scene === cut.scene && dialogue === cut.dialogue && narration === cut.narration) return cut;
    return { ...cut, scene, dialogue, narration };
  });
  if (title === blueprint.title && logline === blueprint.logline && cuts.every((cut, i) => cut === blueprint.cuts[i])) {
    return null;
  }
  return {
    ...blueprint,
    source: "cloud-ai",
    title,
    logline,
    cuts,
    storyWorksheet: { ...blueprint.storyWorksheet, title },
  };
}

export async function polishBlueprintWithCloudAi(
  blueprint: AiQuickBlueprint,
  signal?: AbortSignal,
  completer?: MyStoryTextCompleter,
  interfaceLocale: AiBlueprintLocale = blueprint.locale,
): Promise<PolishBlueprintOutcome> {
  const system = [
    pickText(
      blueprint.locale,
      "웹툰 콘티 편집자로서 한국어로 윤문하세요. 원안의 사건·인물·컷 순서와 말투를 유지하세요. 장면에는 눈에 보이는 행동을 쓰고, 대사는 말풍선 하나에 들어갈 만큼 짧게 쓰며, 나레이션은 대사를 반복하지 마세요.",
      "Polish this webtoon storyboard in English. Preserve the events, characters, panel order and voices. Describe visible action in each scene, keep dialogue short enough for one balloon, and avoid repeating dialogue in narration.",
    ),
    pickText(
      blueprint.locale,
      "입력의 컷 ID를 그대로 반환하세요. 제목 80자, 로그라인과 장면 240자, 대사와 나레이션 160자 이내로 JSON 객체 하나만 출력하세요.",
      "Copy each input panel ID into the response. Return only one JSON object. Limit the title to 80 characters, logline and scenes to 240, and dialogue and narration to 160.",
    ),
    '{"title":"…","logline":"…","cuts":[{"id":"cut-1","scene":"…","dialogue":"…","narration":"…"}]}',
  ].join("\n");

  const user = JSON.stringify({
    idea: blueprint.idea,
    tone: blueprint.toneId,
    cutCount: blueprint.cuts.length,
    currentTitle: blueprint.title,
    logline: blueprint.logline,
    cuts: blueprint.cuts.map((cut) => ({
      id: cut.id,
      beat: cut.beatLabel,
      scene: cut.scene,
      dialogue: cut.dialogue,
      narration: cut.narration,
    })),
  });

  try {
    const complete = completer ?? (await import("../my-story/my-story-ai-client")).completeMyStoryText;
    signal?.throwIfAborted();
    const response = await complete(
      {
        system,
        user,
        operationId: `ai-quick-blueprint-${createSecureRandomUuid()}`,
      },
      signal,
    );
    if (!response.ok) return keepBlueprint(blueprint, response.code, interfaceLocale);
    for (const candidate of extractJsonCandidates(response.data.content).candidates) {
      if (!candidate.topLevel) continue;
      const polished = applyPolish(blueprint, candidate.value);
      if (polished) {
        return {
          blueprint: polished,
          upgraded: true,
          statusMessage: pickText(interfaceLocale, "클라우드 AI가 제안한 수정을 콘티에 반영했어요.", "Applied the cloud AI edits to your storyboard."),
        };
      }
    }
    return keepBlueprint(blueprint, "parse_error", interfaceLocale);
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    return keepBlueprint(blueprint, "network_error", interfaceLocale);
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
