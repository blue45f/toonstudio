import { z } from "zod";

import {
  STUDIO_WRITER_ROOM_LIMITS,
  StudioWriterRoomBeatSchema,
  StudioWriterRoomDialogueSchema,
  StudioWriterRoomEpisodeOutlineSchema,
  StudioWriterRoomPanelSchema,
  StudioWriterRoomPremiseSchema,
  StudioWriterRoomSceneSchema,
  StudioWriterRoomSfxSchema,
  StudioWriterRoomSynopsisSchema,
  normalizeStudioWriterRoomDocument,
  type StudioWriterRoomDocument,
  type StudioWriterRoomStage,
  type StudioWriterRoomStages,
} from "./studio-writer-room";

const MAX_AI_SOURCE_LENGTH = 48_000;
const MAX_CONTEXT_LENGTH = 10_000;

const StageDraftSchemas = {
  premise: StudioWriterRoomPremiseSchema,
  synopsis: StudioWriterRoomSynopsisSchema,
  "episode-outline": StudioWriterRoomEpisodeOutlineSchema,
  beats: z.object({ items: z.array(StudioWriterRoomBeatSchema).max(80) }).strict(),
  scenes: z.object({ items: z.array(StudioWriterRoomSceneSchema).max(80) }).strict(),
  "panel-plan": z.object({ items: z.array(StudioWriterRoomPanelSchema).max(120) }).strict(),
  "dialogue-sfx": z
    .object({
      dialogue: z.array(StudioWriterRoomDialogueSchema).max(240),
      sfx: z.array(StudioWriterRoomSfxSchema).max(240),
    })
    .strict(),
} satisfies { [Stage in StudioWriterRoomStage]: z.ZodType<StudioWriterRoomStages[Stage]> };

const STAGE_GUIDANCE: Record<StudioWriterRoomStage, string> = {
  premise:
    "한 문장 핵심 전제와 중심 갈등을 명확히 하세요. draft는 {text, characterIds}입니다.",
  synopsis:
    "시작·전환·절정·결말 방향이 드러나는 압축 시놉시스를 쓰세요. draft는 {text, characterIds}입니다.",
  "episode-outline":
    "이번 화의 제목과 독자가 다음 화를 누르게 만드는 에피소드 요약을 만드세요. draft는 {title, summary, characterIds}입니다.",
  beats:
    "감정과 정보가 실제로 변하는 비트 목록을 순서대로 만드세요. draft는 {items:[{id,order,title,summary,characterIds}]}입니다.",
  scenes:
    "비트를 촬영 가능한 장소·시간 단위 장면으로 나누세요. draft는 {items:[{id,order,beatIds,heading,summary,location,time,characterIds}]}입니다.",
  "panel-plan":
    "세로 스크롤 리듬, 숏 크기, 시선 흐름을 고려해 패널 계획을 만드세요. draft는 {items:[{id,order,sceneId,shot,action,characterIds}]}입니다.",
  "dialogue-sfx":
    "설명 과잉을 줄이고 캐릭터 말투를 구분하며, 필요한 효과음만 배치하세요. draft는 {dialogue:[{id,order,panelId,characterId,text}],sfx:[{id,order,panelId,presetId,customText,style:{emphasis,scale}}]}입니다.",
};

const WriterRoomAiEnvelopeSchema = z
  .object({
    stage: z.enum([
      "premise",
      "synopsis",
      "episode-outline",
      "beats",
      "scenes",
      "panel-plan",
      "dialogue-sfx",
    ]),
    rationale: z.string().trim().min(1).max(STUDIO_WRITER_ROOM_LIMITS.maxRationaleLength),
    draft: z.unknown(),
  })
  .strict();

export interface StudioWriterRoomAiPrompt {
  system: string;
  user: string;
}

export type StudioWriterRoomAiDraft = {
  [Stage in StudioWriterRoomStage]: {
    stage: Stage;
    rationale: string;
    draft: StudioWriterRoomStages[Stage];
  };
}[StudioWriterRoomStage];

type StudioWriterRoomAiDraftFor<Stage extends StudioWriterRoomStage> = Extract<
  StudioWriterRoomAiDraft,
  { stage: Stage }
>;

export type StudioWriterRoomAiParseResult<
  Stage extends StudioWriterRoomStage = StudioWriterRoomStage,
> =
  | { ok: true; data: StudioWriterRoomAiDraftFor<Stage> }
  | { ok: false; error: string };

function safeJson(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return serialized.length <= MAX_CONTEXT_LENGTH
      ? serialized
      : `${serialized.slice(0, MAX_CONTEXT_LENGTH)}…`;
  } catch {
    return "{}";
  }
}

function stripMarkdownFence(value: string): string {
  const trimmed = value.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  return (fenced?.[1] ?? trimmed).trim();
}

function stageReferences(document: StudioWriterRoomDocument, stage: StudioWriterRoomStage): unknown {
  if (stage === "premise") return {};
  if (stage === "synopsis") return { premise: document.stages.premise };
  if (stage === "episode-outline") {
    return { premise: document.stages.premise, synopsis: document.stages.synopsis };
  }
  if (stage === "beats") return { episodeOutline: document.stages["episode-outline"] };
  if (stage === "scenes") return { beats: document.stages.beats };
  if (stage === "panel-plan") return { scenes: document.stages.scenes };
  return { panels: document.stages["panel-plan"] };
}

export function buildStudioWriterRoomAiPrompt(input: {
  stage: StudioWriterRoomStage;
  document: unknown;
  characterContext?: string;
  direction?: string;
}): StudioWriterRoomAiPrompt {
  const document = normalizeStudioWriterRoomDocument(input.document);
  const stage = input.stage;
  const characterContext = (input.characterContext ?? "").trim().slice(0, 4_000);
  const direction = (input.direction ?? "").trim().slice(0, 2_000);
  const system = [
    "당신은 한국 세로 스크롤 웹툰의 전문 스토리 에디터입니다.",
    "응답은 JSON 객체 하나만 반환하세요. 마크다운, 설명문, 코드 펜스를 쓰지 마세요.",
    `반드시 {"stage":"${stage}","rationale":"검토 근거","draft":...} 형식을 사용하세요.`,
    STAGE_GUIDANCE[stage],
    "현재 초안을 직접 수정하지 않습니다. 사용자가 비교 검토 후 명시적으로 승인할 후보 초안만 만드세요.",
    "기존 item id와 참조 id는 가능하면 보존하고, 새 id는 영문·숫자·하이픈만 사용하세요.",
    "characterIds에는 제공된 캐릭터 ID만, beatIds/sceneId/panelId에는 제공된 문서 ID만 사용하세요.",
    "사실처럼 단정할 외부 정보나 저작권 캐릭터를 새로 만들지 마세요.",
  ].join("\n");
  const user = [
    `대상 단계: ${stage}`,
    `현재 단계 JSON: ${safeJson(document.stages[stage])}`,
    `이전 단계 참조 JSON: ${safeJson(stageReferences(document, stage))}`,
    characterContext ? `캐릭터 바이블(사용자 제공):\n${characterContext}` : "캐릭터 바이블: 없음",
    direction ? `작가의 추가 지시:\n${direction}` : "작가의 추가 지시: 없음",
    "위 조건을 만족하는 개선 후보 초안 JSON을 반환하세요.",
  ].join("\n\n");
  return { system, user };
}

export function parseStudioWriterRoomAiDraft<Stage extends StudioWriterRoomStage>(
  source: string,
  expectedStage: Stage
): StudioWriterRoomAiParseResult<Stage> {
  if (typeof source !== "string" || source.length === 0 || source.length > MAX_AI_SOURCE_LENGTH) {
    return { ok: false, error: "AI 초안 응답의 크기가 올바르지 않아요." };
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(stripMarkdownFence(source));
  } catch {
    return { ok: false, error: "AI 초안을 JSON으로 해석하지 못했어요." };
  }
  const envelope = WriterRoomAiEnvelopeSchema.safeParse(decoded);
  if (!envelope.success) {
    return { ok: false, error: "AI 초안의 필수 필드가 올바르지 않아요." };
  }
  if (envelope.data.stage !== expectedStage) {
    return { ok: false, error: "AI가 요청한 단계와 다른 초안을 반환했어요." };
  }
  const schema = StageDraftSchemas[expectedStage] as unknown as z.ZodType<
    StudioWriterRoomAiDraftFor<Stage>["draft"]
  >;
  const draft = schema.safeParse(envelope.data.draft);
  if (!draft.success) {
    return { ok: false, error: "AI 초안의 단계 구조나 참조 형식이 올바르지 않아요." };
  }
  return {
    ok: true,
    data: {
      stage: expectedStage,
      rationale: envelope.data.rationale,
      draft: draft.data,
    } as StudioWriterRoomAiDraftFor<Stage>,
  };
}

/**
 * 외부 AI 호출이 불가하거나 로컬 즉시 초안이 필요할 때, 현재 Writer Room 문서와 작가 지시를 바탕으로
 * 7개 단계(premise, synopsis, episode-outline, beats, scenes, panel-plan, dialogue-sfx)의
 * 스키마 검증 완료 후보 초안을 결정적으로 생성한다.
 */
export function buildLocalStudioWriterRoomAiDraft<Stage extends StudioWriterRoomStage>(input: {
  stage: Stage;
  document: unknown;
  characterContext?: string;
  direction?: string;
}): StudioWriterRoomAiDraftFor<Stage> {
  const doc = normalizeStudioWriterRoomDocument(input.document);
  const directionNote = (input.direction ?? "").trim().slice(0, 120);
  const rationale = directionNote
    ? `작가 지시(${directionNote})와 세로 스크롤 웹툰 서사 호흡을 반영해 ${input.stage} 단계 초안을 보강했습니다.`
    : `한국 웹툰 기승전결 호흡과 클리프행어 긴장감을 기준으로 ${input.stage} 단계 후보 초안을 구성했습니다.`;

  const primaryCharacterIds = doc.stages.premise.characterIds.slice(0, 4);
  const firstBeatId = doc.stages.beats.items[0]?.id ?? "beat-1";
  const firstSceneId = doc.stages.scenes.items[0]?.id ?? "scene-1";
  const firstPanelId = doc.stages["panel-plan"].items[0]?.id ?? "panel-1";

  const draftsByStage: StudioWriterRoomStages = {
    premise: {
      text:
        doc.stages.premise.text.trim() ||
        (directionNote
          ? `${directionNote} — 평범한 일상이 깨진 순간, 주인공은 숨겨진 진실을 마주하고 돌이킬 수 없는 선택을 내린다.`
          : "평범한 일상이 깨진 순간, 주인공은 숨겨진 진실을 마주하고 돌이킬 수 없는 선택을 내린다."),
      characterIds: primaryCharacterIds,
    },
    synopsis: {
      text:
        doc.stages.synopsis.text.trim() ||
        "도입부에서 일상의 균열을 겪은 주인공이 사건의 핵심 단서를 추적하며 위기에 빠지고, 절정에서 각성해 반전의 실마리를 잡은 뒤 다음 화의 거대한 예고로 이어진다.",
      characterIds: primaryCharacterIds,
    },
    "episode-outline": {
      title: doc.stages["episode-outline"].title.trim() || "1화. 균열의 시작과 첫 번째 선택",
      summary:
        doc.stages["episode-outline"].summary.trim() ||
        "주인공이 낯선 이상 징후를 목격하고 위기 속에서 첫 결단을 내리며 엔딩 클리프행어로 독자의 다음 화 클릭을 유도한다.",
      characterIds: primaryCharacterIds,
    },
    beats: {
      items:
        doc.stages.beats.items.length > 0
          ? doc.stages.beats.items
          : [
              {
                id: "beat-1",
                order: 1,
                title: "일상의 균열 (기)",
                summary: "익숙한 공간에서 설명할 수 없는 첫 번째 사건 징후가 나타난다.",
                characterIds: primaryCharacterIds,
              },
              {
                id: "beat-2",
                order: 2,
                title: "갈등 고조와 압박 (승)",
                summary: "주인공이 문제를 해결하려 하지만 예상치 못한 장애물이 정면으로 막아선다.",
                characterIds: primaryCharacterIds,
              },
              {
                id: "beat-3",
                order: 3,
                title: "결정적 전환점 (전)",
                summary: "숨겨진 진실이 드러나며 주인공이 물러설 수 없는 결단을 내린다.",
                characterIds: primaryCharacterIds,
              },
              {
                id: "beat-4",
                order: 4,
                title: "클리프행어 여운 (결)",
                summary: "새로운 위협 또는 인물이 등장하며 강렬한 서스펜스로 화를 마감한다.",
                characterIds: primaryCharacterIds,
              },
            ],
    },
    scenes: {
      items:
        doc.stages.scenes.items.length > 0
          ? doc.stages.scenes.items
          : [
              {
                id: "scene-1",
                order: 1,
                beatIds: [firstBeatId],
                heading: "사건 현장의 정적",
                summary: "주인공이 이상 징후를 처음 마주하고 긴장감 속에 주변을 살핀다.",
                location: "도심 사건 현장",
                time: "밤",
                characterIds: primaryCharacterIds,
              },
            ],
    },
    "panel-plan": {
      items:
        doc.stages["panel-plan"].items.length > 0
          ? doc.stages["panel-plan"].items
          : [
              {
                id: "panel-1",
                order: 1,
                sceneId: firstSceneId,
                shot: "wide",
                action: "와이드 에스태블리싱 샷으로 공간의 압도적 분위기와 주인공의 실루엣을 제시한다.",
                characterIds: primaryCharacterIds,
              },
              {
                id: "panel-2",
                order: 2,
                sceneId: firstSceneId,
                shot: "close-up",
                action: "흔들림 없는 주인공의 눈빛 클로즈업과 세로 여백 호흡으로 긴장감을 극대화한다.",
                characterIds: primaryCharacterIds,
              },
            ],
    },
    "dialogue-sfx": {
      dialogue:
        doc.stages["dialogue-sfx"].dialogue.length > 0
          ? doc.stages["dialogue-sfx"].dialogue
          : [
              {
                id: "dialogue-1",
                order: 1,
                panelId: firstPanelId,
                characterId: primaryCharacterIds[0] ?? null,
                text: "여기서 멈출 수는 없어. 끝까지 확인해 보겠어.",
              },
            ],
      sfx:
        doc.stages["dialogue-sfx"].sfx.length > 0
          ? doc.stages["dialogue-sfx"].sfx
          : [
              {
                id: "sfx-1",
                order: 1,
                panelId: firstPanelId,
                presetId: null,
                customText: "쿠구구궁",
                style: { emphasis: "strong", scale: "large" },
              },
            ],
    },
  };

  return {
    stage: input.stage,
    rationale,
    draft: draftsByStage[input.stage],
  } as StudioWriterRoomAiDraftFor<Stage>;
}

