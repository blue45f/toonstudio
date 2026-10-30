import { z } from "zod";

const STUDIO_CHARACTER_BIBLE_MAX_ID_LENGTH = 120;


/** Web 작성과 고정 원고 API가 함께 쓰는 Writer Room 정본 구조다. AI 호출·정규화·자동 승인은 포함하지 않는다. */
export const STUDIO_WRITER_ROOM_VERSION = 1 as const;

export const STUDIO_WRITER_ROOM_STAGES = [
  "premise",
  "synopsis",
  "episode-outline",
  "beats",
  "scenes",
  "panel-plan",
  "dialogue-sfx",
] as const;

export type StudioWriterRoomStage = (typeof STUDIO_WRITER_ROOM_STAGES)[number];

export const STUDIO_WRITER_ROOM_LIMITS = {
  maxSerializedBytes: 2_000_000,
  maxIdLength: 120,
  /** @deprecated 항목 수는 정본 UTF-8 바이트 예산으로 관리한다. */
  maxCharacterRefs: Number.POSITIVE_INFINITY,
  /** @deprecated 항목 수는 정본 UTF-8 바이트 예산으로 관리한다. */
  maxReferenceIds: Number.POSITIVE_INFINITY,
  maxShortTextLength: 500,
  maxTextLength: 12_000,
  maxDialogueLength: 4_000,
  maxSfxTextLength: 160,
  maxRationaleLength: 4_000,
  maxProvenanceRefLength: 240,
  /** @deprecated 항목 수는 정본 UTF-8 바이트 예산으로 관리한다. */
  maxStageItems: Number.POSITIVE_INFINITY,
  /** @deprecated 항목 수는 정본 UTF-8 바이트 예산으로 관리한다. */
  maxDialogues: Number.POSITIVE_INFINITY,
  /** @deprecated 항목 수는 정본 UTF-8 바이트 예산으로 관리한다. */
  maxSfx: Number.POSITIVE_INFINITY,
  /** @deprecated 항목 수는 정본 UTF-8 바이트 예산으로 관리한다. */
  maxSuggestions: Number.POSITIVE_INFINITY,
  /** 한번 명시한 결정 요청은 문서 정본과 별도 한도를 적용한다. */
  maxDecisionBatch: 100,
  maxOrder: 1_000_000,
} as const;

const SAFE_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

export const StudioWriterRoomSafeIdSchema = z
  .string()
  .min(1)
  .max(STUDIO_WRITER_ROOM_LIMITS.maxIdLength)
  .regex(SAFE_SEGMENT_PATTERN);
const CharacterIdSchema = z.string().min(1).max(STUDIO_CHARACTER_BIBLE_MAX_ID_LENGTH);
const CharacterIdsSchema = z.array(CharacterIdSchema);
const ReferenceIdsSchema = z.array(StudioWriterRoomSafeIdSchema);
const ShortTextSchema = z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxShortTextLength);
const LongTextSchema = z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxTextLength);
const OrderSchema = z
  .number()
  .int()
  .min(0)
  .max(STUDIO_WRITER_ROOM_LIMITS.maxOrder);

export const StudioWriterRoomPremiseSchema = z
  .object({ text: LongTextSchema, characterIds: CharacterIdsSchema })
  .strict();
export const StudioWriterRoomSynopsisSchema = z
  .object({ text: LongTextSchema, characterIds: CharacterIdsSchema })
  .strict();
export const StudioWriterRoomEpisodeOutlineSchema = z
  .object({ title: ShortTextSchema, summary: LongTextSchema, characterIds: CharacterIdsSchema })
  .strict();

export const StudioWriterRoomBeatSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    order: OrderSchema,
    title: ShortTextSchema,
    summary: LongTextSchema,
    characterIds: CharacterIdsSchema,
  })
  .strict();

export const StudioWriterRoomSceneSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    order: OrderSchema,
    beatIds: ReferenceIdsSchema,
    heading: ShortTextSchema,
    summary: LongTextSchema,
    location: ShortTextSchema,
    time: ShortTextSchema,
    characterIds: CharacterIdsSchema,
  })
  .strict();

export const StudioWriterRoomPanelSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    order: OrderSchema,
    sceneId: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxIdLength),
    shot: ShortTextSchema,
    action: LongTextSchema,
    characterIds: CharacterIdsSchema,
  })
  .strict();

export const StudioWriterRoomDialogueSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    order: OrderSchema,
    panelId: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxIdLength),
    characterId: CharacterIdSchema.nullable(),
    text: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxDialogueLength),
  })
  .strict();

export const STUDIO_WRITER_ROOM_SFX_EMPHASIS = ["quiet", "normal", "strong"] as const;
export const STUDIO_WRITER_ROOM_SFX_SCALES = ["small", "medium", "large"] as const;

export const StudioWriterRoomSfxStyleSchema = z
  .object({
    emphasis: z.enum(STUDIO_WRITER_ROOM_SFX_EMPHASIS),
    scale: z.enum(STUDIO_WRITER_ROOM_SFX_SCALES),
  })
  .strict();

export const StudioWriterRoomSfxSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    order: OrderSchema,
    panelId: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxIdLength),
    presetId: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxIdLength).nullable(),
    customText: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxSfxTextLength),
    style: StudioWriterRoomSfxStyleSchema,
  })
  .strict();

export const StudioWriterRoomStagesSchema = z
  .object({
    premise: StudioWriterRoomPremiseSchema,
    synopsis: StudioWriterRoomSynopsisSchema,
    "episode-outline": StudioWriterRoomEpisodeOutlineSchema,
    beats: z
      .object({
        items: z.array(StudioWriterRoomBeatSchema),
      })
      .strict(),
    scenes: z
      .object({
        items: z.array(StudioWriterRoomSceneSchema),
      })
      .strict(),
    "panel-plan": z
      .object({
        items: z.array(StudioWriterRoomPanelSchema),
      })
      .strict(),
    "dialogue-sfx": z
      .object({
        dialogue: z.array(StudioWriterRoomDialogueSchema),
        sfx: z.array(StudioWriterRoomSfxSchema),
      })
      .strict(),
  })
  .strict();

export const StudioWriterRoomCompletionSchema = z
  .object({
    premise: z.boolean(),
    synopsis: z.boolean(),
    "episode-outline": z.boolean(),
    beats: z.boolean(),
    scenes: z.boolean(),
    "panel-plan": z.boolean(),
    "dialogue-sfx": z.boolean(),
  })
  .strict();

export const STUDIO_WRITER_ROOM_SUGGESTION_STATUSES = [
  "pending",
  "accepted",
  "rejected",
] as const;
export type StudioWriterRoomSuggestionStatus =
  (typeof STUDIO_WRITER_ROOM_SUGGESTION_STATUSES)[number];

export const StudioWriterRoomSuggestionValueSchema = z.union([
  z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxTextLength),
  OrderSchema,
  z.boolean(),
  z.null(),
  z.array(CharacterIdSchema),
]);

export const StudioWriterRoomSuggestionSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    targetPath: z.string().min(1).max(500),
    currentValue: StudioWriterRoomSuggestionValueSchema,
    proposedValue: StudioWriterRoomSuggestionValueSchema,
    rationale: z.string().max(STUDIO_WRITER_ROOM_LIMITS.maxRationaleLength),
    status: z.enum(STUDIO_WRITER_ROOM_SUGGESTION_STATUSES),
    provenanceRef: z
      .string()
      .max(STUDIO_WRITER_ROOM_LIMITS.maxProvenanceRefLength)
      .optional(),
    createdAt: z.iso.datetime(),
    resolvedAt: z.iso.datetime().optional(),
  })
  .strict();

const StudioWriterRoomPreviousSuggestionStateSchema = z
  .object({
    id: StudioWriterRoomSafeIdSchema,
    status: z.enum(STUDIO_WRITER_ROOM_SUGGESTION_STATUSES),
    resolvedAt: z.iso.datetime().optional(),
  })
  .strict();

const StudioWriterRoomPreviousTargetValueSchema = z
  .object({
    targetPath: z.string().min(1).max(500),
    value: StudioWriterRoomSuggestionValueSchema,
  })
  .strict();

export const StudioWriterRoomDecisionSchema = z
  .object({
    kind: z.enum(["accept", "reject"]),
    suggestionStates: z
      .array(StudioWriterRoomPreviousSuggestionStateSchema)
      .max(STUDIO_WRITER_ROOM_LIMITS.maxDecisionBatch),
    targetValues: z
      .array(StudioWriterRoomPreviousTargetValueSchema)
      .max(STUDIO_WRITER_ROOM_LIMITS.maxDecisionBatch),
    decidedAt: z.iso.datetime(),
  })
  .strict();

export const StudioWriterRoomDocumentSchema = z
  .object({
    version: z.literal(STUDIO_WRITER_ROOM_VERSION),
    stages: StudioWriterRoomStagesSchema,
    completion: StudioWriterRoomCompletionSchema,
    suggestions: z.array(StudioWriterRoomSuggestionSchema),
    lastDecision: StudioWriterRoomDecisionSchema.optional(),
  })
  .strict();

export type StudioWriterRoomPremise = z.infer<typeof StudioWriterRoomPremiseSchema>;
export type StudioWriterRoomSynopsis = z.infer<typeof StudioWriterRoomSynopsisSchema>;
export type StudioWriterRoomEpisodeOutline = z.infer<
  typeof StudioWriterRoomEpisodeOutlineSchema
>;
export type StudioWriterRoomBeat = z.infer<typeof StudioWriterRoomBeatSchema>;
export type StudioWriterRoomScene = z.infer<typeof StudioWriterRoomSceneSchema>;
export type StudioWriterRoomPanel = z.infer<typeof StudioWriterRoomPanelSchema>;
export type StudioWriterRoomDialogue = z.infer<typeof StudioWriterRoomDialogueSchema>;
export type StudioWriterRoomSfx = z.infer<typeof StudioWriterRoomSfxSchema>;
export type StudioWriterRoomStages = z.infer<typeof StudioWriterRoomStagesSchema>;
export type StudioWriterRoomCompletion = z.infer<typeof StudioWriterRoomCompletionSchema>;
export type StudioWriterRoomSuggestionValue = z.infer<
  typeof StudioWriterRoomSuggestionValueSchema
>;
export type StudioWriterRoomSuggestion = z.infer<typeof StudioWriterRoomSuggestionSchema>;
export type StudioWriterRoomDecision = z.infer<typeof StudioWriterRoomDecisionSchema>;
export type StudioWriterRoomDocument = z.infer<typeof StudioWriterRoomDocumentSchema>;

const captureIdentity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
export const StudioWriterRoomCaptureSubjectSchema = z.object({ schemaVersion: z.literal(1), workId: captureIdentity,
  projectId: captureIdentity, artifactId: captureIdentity, reviewId: captureIdentity, revisionId: captureIdentity,
  rootGraphHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
export const StudioWriterRoomCaptureRequestSchema = z.object({ productionProjectId: captureIdentity,
  submissionId: captureIdentity, subject: StudioWriterRoomCaptureSubjectSchema }).strict();
const captureResult = { contract: z.literal("studio-writer-room-capture-v1"), productionProjectId: captureIdentity,
  submissionId: captureIdentity, subject: StudioWriterRoomCaptureSubjectSchema,
  sourceServerRevision: z.number().int().positive().max(2_147_483_647), captureSequence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  reviewStatus: z.enum(["open", "changes-requested", "approved", "rejected", "cancelled"]) };
/** 원고 누락·손상은 상태로 반환하며 일부 문단이나 현재 원고로 대체하지 않는다. */
export const StudioWriterRoomCaptureResponseSchema = z.discriminatedUnion("status", [
  z.object({ ...captureResult, status: z.literal("available"), writerRoom: StudioWriterRoomDocumentSchema }).strict(),
  z.object({ ...captureResult, status: z.literal("missing") }).strict(),
  z.object({ ...captureResult, status: z.literal("invalid"), reason: z.enum(["invalid-document", "byte-budget-exceeded"]) }).strict(),
  z.object({ ...captureResult, status: z.literal("unbound") }).strict(),
]);
export type StudioWriterRoomCaptureRequest = z.infer<typeof StudioWriterRoomCaptureRequestSchema>;
export type StudioWriterRoomCaptureResponse = z.infer<typeof StudioWriterRoomCaptureResponseSchema>;
