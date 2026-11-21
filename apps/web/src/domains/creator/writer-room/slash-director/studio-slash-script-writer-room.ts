/**
 * Slash AST와 `StudioWriterRoomDocument` 정본 스키마 간 양방향 무손실 변환기.
 */

import {
  STUDIO_WRITER_ROOM_VERSION,
  type StudioWriterRoomBeat,
  type StudioWriterRoomDialogue,
  type StudioWriterRoomDocument,
  type StudioWriterRoomPanel,
  type StudioWriterRoomScene,
  type StudioWriterRoomSfx,
} from "@toonstudio/contracts/studio-writer-room";

import type { SlashScriptAst, StoryBibleMentionCatalog } from "./studio-slash-script-types";

function dedupeStrings(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((v) => v.length > 0)));
}

/** 파싱된 Slash AST를 기존 `StudioWriterRoomDocument` 정본 스키마로 투영한다. */
export function buildWriterRoomDocumentFromSlashAst(
  ast: SlashScriptAst,
  base?: Partial<Pick<StudioWriterRoomDocument["stages"], "premise" | "synopsis">>,
): StudioWriterRoomDocument {
  const allCharacterIds = dedupeStrings(ast.cuts.flatMap((cut) => cut.characterIds));
  const beats: StudioWriterRoomBeat[] = ast.scenes.map((scene, idx) => ({
    id: `beat-${idx + 1}`,
    order: idx,
    title: scene.heading || `비트 ${idx + 1}`,
    summary: ast.cuts
      .filter((cut) => cut.sceneId === scene.id)
      .map((cut) => cut.title)
      .join(" → ")
      .slice(0, 500),
    characterIds: [...scene.characterIds],
  }));

  const scenes: StudioWriterRoomScene[] = ast.scenes.map((scene, idx) => ({
    id: scene.id,
    order: idx,
    beatIds: [`beat-${idx + 1}`],
    heading: scene.heading.slice(0, 500),
    summary: ast.cuts
      .filter((cut) => cut.sceneId === scene.id)
      .flatMap((cut) => cut.actions)
      .join(" ")
      .slice(0, 12_000),
    location: scene.location.slice(0, 500),
    time: scene.time.slice(0, 500),
    characterIds: [...scene.characterIds],
  }));

  const panels: StudioWriterRoomPanel[] = ast.cuts.map((cut, idx) => ({
    id: cut.id,
    order: idx,
    sceneId: cut.sceneId,
    shot: cut.shot.slice(0, 500),
    action: (cut.actions.join(" / ") || cut.title).slice(0, 12_000),
    characterIds: [...cut.characterIds],
  }));

  const dialogue: StudioWriterRoomDialogue[] = [];
  const sfx: StudioWriterRoomSfx[] = [];
  for (const cut of ast.cuts) {
    for (const line of cut.dialogues) {
      dialogue.push({
        id: line.id,
        order: dialogue.length,
        panelId: cut.id,
        characterId: line.speakerId,
        text: line.text.slice(0, 4_000),
      });
    }
    for (const item of cut.sfxList) {
      sfx.push({
        id: item.id,
        order: sfx.length,
        panelId: cut.id,
        presetId: item.presetId,
        customText: item.text.slice(0, 160),
        style: { emphasis: item.emphasis, scale: item.scale },
      });
    }
  }

  return {
    version: STUDIO_WRITER_ROOM_VERSION,
    stages: {
      premise: base?.premise ?? { text: "", characterIds: [...allCharacterIds] },
      synopsis: base?.synopsis ?? { text: "", characterIds: [...allCharacterIds] },
      "episode-outline": {
        title: ast.episodeTitle.slice(0, 500),
        summary: scenes.map((s) => s.heading).join(" / ").slice(0, 12_000),
        characterIds: [...allCharacterIds],
      },
      beats: { items: beats },
      scenes: { items: scenes },
      "panel-plan": { items: panels },
      "dialogue-sfx": { dialogue, sfx },
    },
    completion: {
      premise: Boolean(base?.premise?.text.trim()),
      synopsis: Boolean(base?.synopsis?.text.trim()),
      "episode-outline": ast.episodeTitle.trim().length > 0,
      beats: beats.length > 0,
      scenes: scenes.length > 0,
      "panel-plan": panels.length > 0,
      "dialogue-sfx": dialogue.length > 0 || sfx.length > 0,
    },
    suggestions: [],
  };
}

/** 기존 `StudioWriterRoomDocument`를 슬래시 대본 텍스트로 역직렬화한다(왕복 동기화). */
export function serializeWriterRoomToSlashScript(
  doc: StudioWriterRoomDocument,
  catalog: StoryBibleMentionCatalog = { entities: [] },
): string {
  const charNameById = new Map(
    catalog.entities.filter((e) => e.kind === "character").map((e) => [e.id, e.name]),
  );
  const locNameByName = new Map(
    catalog.entities.filter((e) => e.kind === "location").map((e) => [e.name, e.name]),
  );
  const lines: string[] = [];
  const title = doc.stages["episode-outline"].title.trim();
  if (title) lines.push(`# ${title}`);

  const sortedScenes = [...doc.stages.scenes.items].sort((a, b) => a.order - b.order);
  const sortedPanels = [...doc.stages["panel-plan"].items].sort((a, b) => a.order - b.order);
  const sortedDialogues = [...doc.stages["dialogue-sfx"].dialogue].sort((a, b) => a.order - b.order);
  const sortedSfx = [...doc.stages["dialogue-sfx"].sfx].sort((a, b) => a.order - b.order);

  for (const scene of sortedScenes) {
    const locToken = locNameByName.has(scene.location) ? `@${scene.location}` : scene.location;
    const sceneLine = [locToken, scene.time].filter(Boolean).join(" · ");
    lines.push("", `/배경세트 ${sceneLine || scene.heading}`);

    const scenePanels = sortedPanels.filter((panel) => panel.sceneId === scene.id);
    for (const panel of scenePanels) {
      lines.push(`/컷 ${panel.action || "장면"}`);
      if (panel.shot.trim()) {
        lines.push(`/샷 ${panel.shot.trim()}`);
      }
      for (const dlg of sortedDialogues.filter((item) => item.panelId === panel.id)) {
        const speakerName = dlg.characterId ? (charNameById.get(dlg.characterId) ?? dlg.characterId) : null;
        const prefix = speakerName ? `@${speakerName} ` : "";
        lines.push(`/말풍선 ${prefix}[일반] ${dlg.text}`);
      }
      for (const item of sortedSfx.filter((entry) => entry.panelId === panel.id)) {
        const empKo = item.style.emphasis === "strong" ? "강함" : item.style.emphasis === "quiet" ? "약함" : "보통";
        const scaleKo = item.style.scale === "large" ? "큼" : item.style.scale === "small" ? "작음" : "보통";
        lines.push(`/효과음 ${item.customText || item.presetId || "효과음"} [${empKo}/${scaleKo}]`);
      }
    }
  }

  return lines.join("\n").trim();
}
