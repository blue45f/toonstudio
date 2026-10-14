import { createZodDto } from "nestjs-zod";
import { z } from "zod";

/**
 * 회차 검수 음성 해설(ProductionEpisodeReviewRoom의 ReviewVoiceCommentaryPanel)
 * 서버 저장 계약.
 *
 * 기존 검수 음성 노트(studio-project-graph의 review-voice-note)는 subject가
 * project-graph 고정 식별자 + pinnedShareCapture 검증 + 필수 전사 + 120초
 * 상한으로 묶여 있어 회차 룸 식별자(projectId·episodeId)를 수용할 수 없다.
 * 그래서 해설 트랙은 제작 모듈 안에 별도 계약으로 두되, 업로드 상한·보유
 * 기간·멱등·서명 읽기 같은 운영 정책은 음성 노트와 같은 값을 쓴다.
 */

const identity = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const isoDateTime = z.iso.datetime({ offset: true });

/** 오디오 업로드 상한 — 검수 음성 노트와 같은 저장 정책(5MB). */
export const PRODUCTION_VOICE_COMMENTARY_MAX_BYTES = 5 * 1024 * 1024;
/** 보유 기간 기본값·상한 — 검수 음성 노트 정책과 동일(기본 14일, 최대 30일). */
export const PRODUCTION_VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS = 14;
export const PRODUCTION_VOICE_COMMENTARY_MAX_RETENTION_DAYS = 30;
/**
 * 트랙 메타 상한(남용 방지용). 패널은 녹화 중 500ms 간격으로 화면을
 * 샘플링하고 변화가 있을 때만 키프레임을 찍으므로, 30분 녹화의 이론상
 * 최대치는 3,600개다. 그 이상은 계약 위반으로 본다.
 */
export const PRODUCTION_VOICE_COMMENTARY_MAX_KEYFRAMES = 3_600;
export const PRODUCTION_VOICE_COMMENTARY_METADATA_MAX_CHARS = 1_048_576;

export const productionVoiceCommentaryContentTypeSchema = z.enum([
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
]);

const voiceViewSnapshotSchema = z.object({
  surface: z.enum(["compare", "manuscript"]),
  poolItemId: z.string().max(500).nullable(),
  pageId: z.string().max(500).nullable(),
  mode: z.string().max(200).nullable(),
  scale: z.number().finite(),
  tx: z.number().finite(),
  ty: z.number().finite(),
}).strict();

const voiceKeyframeSchema = z.object({
  atMs: z.number().int().min(0).max(86_400_000),
  view: voiceViewSnapshotSchema,
  pinThreadIds: z.array(identity).max(200),
}).strict();

/**
 * 해설 트랙 메타 — 웹 모델(review-voice-commentary-model)의 VoiceCommentaryTrack에서
 * 오디오 참조를 제외한 부분. 오디오 실체(타입·크기·해시·객체 참조)는 서버가
 * 업로드 파일에서 도출하므로 클라이언트가 보낸 오디오 참조는 받지 않는다.
 */
export const productionVoiceCommentaryTrackMetaSchema = z.object({
  version: z.literal(1),
  id: identity,
  episodeId: identity,
  authorId: identity.nullable(),
  authorName: z.string().trim().min(1).max(160),
  createdAt: isoDateTime,
  durationMs: z.number().int().min(0).max(86_400_000),
  keyframes: z.array(voiceKeyframeSchema).max(PRODUCTION_VOICE_COMMENTARY_MAX_KEYFRAMES),
  pinThreadIds: z.array(identity).max(1_000),
}).strict();

export const productionVoiceCommentaryCreateSchema = z.object({
  operationId: identity,
  track: productionVoiceCommentaryTrackMetaSchema,
  retentionDays: z.number().int().min(1).max(PRODUCTION_VOICE_COMMENTARY_MAX_RETENTION_DAYS)
    .default(PRODUCTION_VOICE_COMMENTARY_DEFAULT_RETENTION_DAYS),
}).strict();

export const productionVoiceCommentaryDeleteSchema = z.object({
  operationId: identity,
  expectedSha256: digest,
}).strict();

export const productionVoiceCommentarySignedReadSchema = z.object({
  url: z.url({ protocol: /^https$/u }),
  expiresAtEpochMs: z.number().int().positive(),
}).strict();

export type ProductionVoiceCommentaryContentType = z.infer<typeof productionVoiceCommentaryContentTypeSchema>;
export type ProductionVoiceCommentaryTrackMeta = z.infer<typeof productionVoiceCommentaryTrackMetaSchema>;
export type ProductionVoiceCommentaryCreate = z.infer<typeof productionVoiceCommentaryCreateSchema>;
export type ProductionVoiceCommentaryDelete = z.infer<typeof productionVoiceCommentaryDeleteSchema>;
export type ProductionVoiceCommentarySignedRead = z.infer<typeof productionVoiceCommentarySignedReadSchema>;

/** 서버가 재구성하는 전체 트랙 — 웹 모델의 VoiceCommentaryTrack와 같은 모양. */
export interface ProductionVoiceCommentaryTrack extends ProductionVoiceCommentaryTrackMeta {
  readonly audio: {
    readonly kind: "server";
    readonly url: string;
    readonly mimeType: string | null;
    readonly byteSize: number | null;
  } | null;
}

export interface ProductionVoiceCommentaryView {
  readonly track: ProductionVoiceCommentaryTrack;
  readonly canDelete: boolean;
}

class ProjectEpisodeParams extends createZodDto(z.object({
  projectId: identity,
  episodeId: identity,
}).strict()) {}
class TrackParams extends createZodDto(z.object({
  projectId: identity,
  episodeId: identity,
  trackId: identity,
}).strict()) {}
class VoiceCommentaryQueryDto extends createZodDto(z.object({}).strict()) {}
class VoiceCommentaryDeleteDto extends createZodDto(productionVoiceCommentaryDeleteSchema) {}
class VoiceCommentaryUploadBodyDto extends createZodDto(z.object({
  metadata: z.string().max(PRODUCTION_VOICE_COMMENTARY_METADATA_MAX_CHARS).transform((text, context) => {
    try { return productionVoiceCommentaryCreateSchema.parse(JSON.parse(text)); }
    catch { context.addIssue({ code: "custom", message: "Invalid voice commentary metadata" }); return z.NEVER; }
  }),
}).strict()) {}

export {
  ProjectEpisodeParams as ProductionVoiceCommentaryProjectEpisodeParamsDto,
  TrackParams as ProductionVoiceCommentaryTrackParamsDto,
  VoiceCommentaryQueryDto as ProductionVoiceCommentaryQueryDto,
  VoiceCommentaryDeleteDto as ProductionVoiceCommentaryDeleteDto,
  VoiceCommentaryUploadBodyDto as ProductionVoiceCommentaryUploadBodyDto,
};
