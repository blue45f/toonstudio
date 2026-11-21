/**
 * Notion·Heptabase형 인라인 슬래시(`/`) 연출 커맨드 + `@` 스토리바이블 엔티티 바인딩
 * 대본 파서 및 컷 시드 생성기 공개 진입점.
 *
 * - 한글 초성·영문 퍼지 검색과 IME 조합 안전 트리거 탐지는 `-search` 모듈에 분리한다.
 * - `StudioWriterRoomDocument` 양방향 무손실 변환은 `-writer-room` 모듈에 분리한다.
 * - 이 파일은 대본 AST 파서(`parseSlashScriptDocument`)와 기존 공개 API 재노출을 맡는다.
 */

import { SFX_LIBRARY } from "../../studio-sfx-presets";
import { createEmptyCutReadinessSlots } from "../../planning/studio-story-living-spec-store";

import {
  extractMentionBindings,
  findExactMentionEntity,
  resolveSlashCommandToken,
} from "./studio-slash-script-search";
import type {
  BalloonEmotionPreset,
  SlashCutSeed,
  SlashDialogueSeed,
  SlashMentionBinding,
  SlashSceneSeed,
  SlashScriptAst,
  SlashScriptDiagnostic,
  SlashSfxSeed,
  SlashUnresolvedMention,
  SlashVoiceCueSeed,
  StoryBibleMentionCatalog,
} from "./studio-slash-script-types";

export {
  SLASH_COMMAND_IDS,
  SLASH_DIRECTING_COMMANDS,
  type BalloonEmotionPreset,
  type InlineTriggerDetection,
  type MentionEntityKind,
  type SlashCutSeed,
  type SlashDialogueSeed,
  type SlashDirectingCommandId,
  type SlashDirectingCommandSpec,
  type SlashMentionBinding,
  type SlashSceneSeed,
  type SlashScriptAst,
  type SlashScriptDiagnostic,
  type SlashSfxSeed,
  type SlashUnresolvedMention,
  type SlashVoiceCueSeed,
  type StoryBibleMentionCatalog,
  type StoryBibleMentionEntity,
} from "./studio-slash-script-types";

export {
  detectInlineSlashTrigger,
  extractKoreanChoseong,
  extractMentionBindings,
  searchMentionEntities,
  searchSlashDirectingCommands,
} from "./studio-slash-script-search";

export {
  buildWriterRoomDocumentFromSlashAst,
  serializeWriterRoomToSlashScript,
} from "./studio-slash-script-writer-room";

function inferLensPreset(shotText: string): "telephoto" | "standard" | "wide" | "ultra-wide" {
  const lower = shotText.toLowerCase();
  if (/(?:초광각|ultra|16mm|18mm|20mm)/u.test(lower)) return "ultra-wide";
  if (/(?:광각|와이드|wide|24mm|28mm|부감|풀샷)/u.test(lower)) return "wide";
  if (/(?:망원|tele|85mm|105mm|135mm|익스트림)/u.test(lower)) return "telephoto";
  return "standard";
}

function parseBalloonEmotion(tagRaw: string | undefined): BalloonEmotionPreset {
  const tag = (tagRaw ?? "").trim().toLowerCase();
  if (/(?:외침|고함|shout|scream)/u.test(tag)) return "shout";
  if (/(?:생각|속마음|thought)/u.test(tag)) return "thought";
  if (/(?:속삭임|혼잣말|whisper|quiet)/u.test(tag)) return "whisper";
  if (/(?:나레이션|해설|narration)/u.test(tag)) return "narration";
  if (/(?:분노|격앙|fury|anger)/u.test(tag)) return "fury";
  return "general";
}

function parseSfxDirective(
  rest: string,
  id: string,
  lineNumber: number,
): SlashSfxSeed {
  const styleBracket = /\[([^\]]+)\]\s*$/u.exec(rest);
  const text = (styleBracket ? rest.slice(0, styleBracket.index) : rest).trim();
  const styleText = (styleBracket?.[1] ?? "").toLowerCase();
  const emphasis: SlashSfxSeed["emphasis"] = /(?:강함|강하게|strong)/u.test(styleText)
    ? "strong"
    : /(?:약함|조용|quiet)/u.test(styleText)
      ? "quiet"
      : "normal";
  const scale: SlashSfxSeed["scale"] = /(?:큼|크게|large|대)/u.test(styleText)
    ? "large"
    : /(?:작음|작게|small|소)/u.test(styleText)
      ? "small"
      : "medium";
  const normalizedWord = text.replace(/[!?.…~\s]+/gu, "").toLowerCase();
  const matchedPreset = SFX_LIBRARY.find(
    (preset) =>
      preset.label.toLowerCase() === normalizedWord ||
      preset.text.replace(/[!?.…~\s]+/gu, "").toLowerCase() === normalizedWord ||
      (preset.keywords ?? []).some((kw) => kw.toLowerCase() === normalizedWord),
  );
  return {
    id,
    text: text || "효과음",
    presetId: matchedPreset?.id ?? null,
    category: matchedPreset?.category ?? null,
    emphasis,
    scale,
    lineNumber,
  };
}

interface MutableCutDraft {
  id: string;
  cutNumber: number;
  sceneId: string;
  title: string;
  shot: string;
  location: string;
  time: string;
  bg3dSetId: string | null;
  actions: string[];
  dialogues: SlashDialogueSeed[];
  sfxList: SlashSfxSeed[];
  voiceCues: SlashVoiceCueSeed[];
  aiContiPrompts: string[];
  mentions: SlashMentionBinding[];
  startLine: number;
}

function stripAtMarkers(text: string): string {
  return text.replace(/@([가-힣A-Za-z0-9_-]+)/gu, "$1").trim();
}

function dedupeStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((v) => v.length > 0)));
}

function finalizeCutDraft(draft: MutableCutDraft): SlashCutSeed {
  const characterIds = dedupeStrings([
    ...draft.mentions.filter((m) => m.kind === "character").map((m) => m.entityId),
    ...draft.dialogues.map((d) => d.speakerId ?? ""),
    ...draft.voiceCues.map((v) => v.speakerId ?? ""),
  ]);
  const characterNames = dedupeStrings([
    ...draft.mentions.filter((m) => m.kind === "character").map((m) => m.name),
    ...draft.dialogues.map((d) => d.speakerName ?? ""),
  ]);
  const characterLockIds = dedupeStrings(
    draft.mentions.map((m) => m.characterLockId ?? ""),
  );
  const locationIds = dedupeStrings(
    draft.mentions.filter((m) => m.kind === "location").map((m) => m.entityId),
  );
  const propIds = dedupeStrings(
    draft.mentions.filter((m) => m.kind === "prop").map((m) => m.entityId),
  );
  const ruleIds = dedupeStrings(
    draft.mentions.filter((m) => m.kind === "rule").map((m) => m.entityId),
  );
  const propNames = dedupeStrings(
    draft.mentions.filter((m) => m.kind === "prop").map((m) => m.name),
  );
  const ruleNames = dedupeStrings(
    draft.mentions.filter((m) => m.kind === "rule").map((m) => m.name),
  );

  const readinessSlots = createEmptyCutReadinessSlots({
    location: draft.location || undefined,
    timeLighting: draft.time || undefined,
    actors: characterNames.length > 0 ? characterNames : undefined,
    emotionalBeat: draft.voiceCues[0]?.emotion || undefined,
    cameraAngleLens: draft.shot || undefined,
    keyAction: draft.actions[0] || undefined,
    keyDialogue: draft.dialogues[0]?.text || undefined,
    propsAndContinuity: propNames.length > 0 ? propNames.join(", ") : undefined,
    foreshadowOrRuleRef: ruleNames.length > 0 ? ruleNames.join(", ") : undefined,
  });

  return {
    id: draft.id,
    cutNumber: draft.cutNumber,
    sceneId: draft.sceneId,
    title: draft.title || `${draft.cutNumber}컷`,
    shot: draft.shot,
    lensPreset: inferLensPreset(draft.shot),
    location: draft.location,
    time: draft.time,
    bg3dSetId: draft.bg3dSetId,
    actions: draft.actions,
    dialogues: draft.dialogues,
    sfxList: draft.sfxList,
    voiceCues: draft.voiceCues,
    aiContiPrompts: draft.aiContiPrompts,
    characterIds,
    characterLockIds,
    locationIds,
    propIds,
    ruleIds,
    mentions: draft.mentions,
    readinessSlots,
    startLine: draft.startLine,
  };
}

/** 인라인 `/` 연출 커맨드와 `@` 멘션이 포함된 대본 전체를 AST와 컷 시드로 파싱한다. */
export function parseSlashScriptDocument(
  scriptText: string,
  catalog: StoryBibleMentionCatalog = { entities: [] },
  options?: { readonly episodeTitle?: string },
): SlashScriptAst {
  const lines = scriptText.split(/\r?\n/u);
  const scenes: Array<{
    id: string;
    order: number;
    heading: string;
    location: string;
    time: string;
    bg3dSetId: string | null;
    cutIds: string[];
    characterIds: string[];
  }> = [];
  const cutDrafts: MutableCutDraft[] = [];
  const unresolvedMentions: SlashUnresolvedMention[] = [];
  const diagnostics: SlashScriptDiagnostic[] = [];

  let episodeTitle = options?.episodeTitle?.trim() || "제목 없는 회차";
  let currentSceneIndex = -1;
  let dialogueCounter = 0;
  let sfxCounter = 0;

  const getCurrentCut = (): MutableCutDraft | null => cutDrafts[cutDrafts.length - 1] ?? null;

  const ensureScene = (heading = "장면 1", location = "", time = "", bg3dSetId: string | null = null) => {
    if (currentSceneIndex >= 0) return scenes[currentSceneIndex]!;
    const scene = {
      id: `scene-${scenes.length + 1}`,
      order: scenes.length,
      heading,
      location,
      time,
      bg3dSetId,
      cutIds: [] as string[],
      characterIds: [] as string[],
    };
    scenes.push(scene);
    currentSceneIndex = scenes.length - 1;
    return scene;
  };

  const startNewCut = (title: string, lineNumber: number): MutableCutDraft => {
    const scene = ensureScene();
    const cutNumber = cutDrafts.length + 1;
    const draft: MutableCutDraft = {
      id: `panel-${cutNumber}`,
      cutNumber,
      sceneId: scene.id,
      title: title.trim() || `${cutNumber}컷`,
      shot: "",
      location: scene.location,
      time: scene.time,
      bg3dSetId: scene.bg3dSetId,
      actions: [],
      dialogues: [],
      sfxList: [],
      voiceCues: [],
      aiContiPrompts: [],
      mentions: [],
      startLine: lineNumber,
    };
    cutDrafts.push(draft);
    scene.cutIds.push(draft.id);
    return draft;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const lineNumber = i + 1;
    const rawLine = (lines[i] ?? "").trim();
    if (!rawLine) continue;

    if (rawLine.startsWith("# ") && cutDrafts.length === 0 && scenes.length === 0) {
      episodeTitle = rawLine.slice(2).trim() || episodeTitle;
      continue;
    }

    if (rawLine.startsWith("## ")) {
      const heading = rawLine.slice(3).trim();
      const { resolved, unresolved } = extractMentionBindings(heading, catalog, lineNumber);
      unresolvedMentions.push(...unresolved);
      const locEntity = resolved.find((m) => m.kind === "location");
      const [locPart, timePart] = stripAtMarkers(heading).split(/[·|]/u).map((s) => s.trim());
      const scene = {
        id: `scene-${scenes.length + 1}`,
        order: scenes.length,
        heading: stripAtMarkers(heading),
        location: locEntity?.name ?? locPart ?? "",
        time: timePart ?? "",
        bg3dSetId: locEntity?.bg3dSetId ?? null,
        cutIds: [] as string[],
        characterIds: [] as string[],
      };
      scenes.push(scene);
      currentSceneIndex = scenes.length - 1;
      continue;
    }

    const { resolved: lineMentions, unresolved: lineUnresolved } = extractMentionBindings(
      rawLine,
      catalog,
      lineNumber,
    );
    unresolvedMentions.push(...lineUnresolved);
    for (const item of lineUnresolved) {
      diagnostics.push({
        severity: "warning",
        code: "UNRESOLVED_MENTION",
        lineNumber,
        message: `스토리 바이블에서 ${item.rawToken} 항목을 찾지 못했습니다.`,
      });
    }

    if (rawLine.startsWith("/")) {
      const spaceIdx = rawLine.search(/\s/u);
      const cmdToken = spaceIdx < 0 ? rawLine : rawLine.slice(0, spaceIdx);
      const rest = spaceIdx < 0 ? "" : rawLine.slice(spaceIdx).trim();
      const cmd = resolveSlashCommandToken(cmdToken);
      if (!cmd) {
        diagnostics.push({
          severity: "warning",
          code: "UNKNOWN_SLASH_COMMAND",
          lineNumber,
          message: `알 수 없는 슬래시 커맨드(${cmdToken})입니다.`,
        });
        continue;
      }

      if (cmd.id === "bg_set") {
        const locEntity = lineMentions.find((m) => m.kind === "location");
        const [locRaw, timeRaw] = stripAtMarkers(rest).split(/[·|]/u).map((s) => s.trim());
        const location = locEntity?.name ?? locRaw ?? "";
        const time = timeRaw ?? "";
        const bg3dSetId = locEntity?.bg3dSetId ?? null;
        const activeCut = getCurrentCut();
        if (!activeCut) {
          const scene = {
            id: `scene-${scenes.length + 1}`,
            order: scenes.length,
            heading: location ? `${location}${time ? ` · ${time}` : ""}` : `장면 ${scenes.length + 1}`,
            location,
            time,
            bg3dSetId,
            cutIds: [] as string[],
            characterIds: [] as string[],
          };
          scenes.push(scene);
          currentSceneIndex = scenes.length - 1;
        } else {
          activeCut.location = location || activeCut.location;
          activeCut.time = time || activeCut.time;
          activeCut.bg3dSetId = bg3dSetId ?? activeCut.bg3dSetId;
          activeCut.mentions.push(...lineMentions);
        }
        continue;
      }

      if (cmd.id === "cut") {
        const draft = startNewCut(stripAtMarkers(rest), lineNumber);
        draft.mentions.push(...lineMentions);
        if (rest) draft.actions.push(stripAtMarkers(rest));
        continue;
      }

      const cut = getCurrentCut() ?? startNewCut("1컷", lineNumber);
      cut.mentions.push(...lineMentions);

      if (cmd.id === "shot") {
        cut.shot = stripAtMarkers(rest);
      } else if (cmd.id === "balloon") {
        dialogueCounter += 1;
        const emotionMatch = /\[([^\]]+)\]/u.exec(rest);
        const emotion = parseBalloonEmotion(emotionMatch?.[1]);
        const speakerMention = lineMentions.find((m) => m.kind === "character");
        let textBody = rest.replace(/\[[^\]]+\]/u, "").trim();
        let speakerName = speakerMention?.name ?? null;
        if (speakerMention) {
          textBody = textBody.replace(speakerMention.rawToken, "").replace(/^[:：\s-]+/u, "").trim();
        } else {
          const colonMatch = /^([가-힣A-Za-z0-9_]{1,16})\s*[:：]\s*(.+)$/u.exec(textBody);
          if (colonMatch) {
            speakerName = colonMatch[1] ?? null;
            textBody = colonMatch[2]?.trim() ?? textBody;
          }
        }
        cut.dialogues.push({
          id: `dlg-${dialogueCounter}`,
          speakerId: speakerMention?.entityId ?? null,
          speakerName,
          emotion,
          text: stripAtMarkers(textBody),
          lineNumber,
        });
      } else if (cmd.id === "sfx") {
        sfxCounter += 1;
        cut.sfxList.push(parseSfxDirective(stripAtMarkers(rest), `sfx-${sfxCounter}`, lineNumber));
      } else if (cmd.id === "voice_emotion") {
        const speakerMention = lineMentions.find((m) => m.kind === "character");
        const withoutSpeaker = speakerMention
          ? rest.replace(speakerMention.rawToken, "").trim()
          : rest;
        const [emotionPart, notePart] = withoutSpeaker.split(/[·|-]/u).map((s) => s.trim());
        cut.voiceCues.push({
          speakerId: speakerMention?.entityId ?? null,
          speakerName: speakerMention?.name ?? null,
          voicePresetId: speakerMention?.voicePresetId ?? null,
          emotion: emotionPart || "일반",
          deliveryNote: notePart ?? "",
          lineNumber,
        });
      } else if (cmd.id === "ai_conti") {
        if (rest) cut.aiContiPrompts.push(stripAtMarkers(rest));
      }
      continue;
    }

    // 일반 문장 또는 `@화자: 대사` 축약 문법 처리
    const cut = getCurrentCut() ?? startNewCut("1컷", lineNumber);
    cut.mentions.push(...lineMentions);
    const shorthandDialogue = /^(?:@([가-힣A-Za-z0-9_-]+)|([가-힣A-Za-z0-9_]{1,14}))\s*[:：]\s*(.+)$/u.exec(
      rawLine,
    );
    if (shorthandDialogue) {
      dialogueCounter += 1;
      const mentionedToken = shorthandDialogue[1];
      const plainSpeaker = shorthandDialogue[2];
      const matched = mentionedToken
        ? findExactMentionEntity(catalog, mentionedToken)
        : plainSpeaker
          ? findExactMentionEntity(catalog, plainSpeaker)
          : undefined;
      cut.dialogues.push({
        id: `dlg-${dialogueCounter}`,
        speakerId: matched?.kind === "character" ? matched.id : null,
        speakerName: matched?.name ?? mentionedToken ?? plainSpeaker ?? null,
        emotion: "general",
        text: stripAtMarkers(shorthandDialogue[3] ?? ""),
        lineNumber,
      });
    } else {
      cut.actions.push(stripAtMarkers(rawLine));
    }
  }

  const cuts = cutDrafts.map(finalizeCutDraft);
  for (const cut of cuts) {
    if (cut.actions.length === 0 && cut.dialogues.length === 0 && cut.sfxList.length === 0) {
      diagnostics.push({
        severity: "warning",
        code: "EMPTY_CUT",
        lineNumber: cut.startLine,
        message: `${cut.cutNumber}컷에 동작·대사·효과음이 아직 비어 있습니다.`,
      });
    }
  }

  const finalizedScenes: SlashSceneSeed[] = scenes.map((scene) => {
    const sceneCuts = cuts.filter((cut) => cut.sceneId === scene.id);
    const charIds = dedupeStrings(sceneCuts.flatMap((cut) => cut.characterIds));
    return { ...scene, characterIds: charIds };
  });

  return {
    episodeTitle,
    scenes: finalizedScenes,
    cuts,
    unresolvedMentions,
    diagnostics,
  };
}
