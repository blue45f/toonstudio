import { z } from "zod";

/**
 * 녹음부스 테이크 프로젝트 에셋 계약.
 *
 * 검수 음성 메모(review-voice-note)와 달리 검수 주제에 묶이지 않고 만료도 없는
 * 영속 에셋이다. 부스 드라이버는 최대 300초를 128kbps WebM으로 캡처하므로
 * 바이트 상한은 음성 메모와 같은 5MB로 충분하다.
 */
export const STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const STUDIO_RECORDING_BOOTH_ASSET_MAX_DURATION_MS = 300_000;

const id = z.string().trim().min(1).max(160);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const at = z.iso.datetime({ offset: true });

// 부스 드라이버는 WebM만 캡처한다 — 지원하지 않는 브라우저는 녹음 자체가 실패한다.
export const studioRecordingBoothAssetContentTypeSchema = z.enum([
  "audio/webm",
]);

export const studioRecordingBoothAssetCreateSchema = z.object({
  operationId: id,
  assetId: id,
  name: z.string().trim().min(1).max(160),
  boothId: id,
  durationMs: z.number().int().positive().max(STUDIO_RECORDING_BOOTH_ASSET_MAX_DURATION_MS),
}).strict();

export const studioRecordingBoothAssetSchema = z.object({
  contract: z.literal("studio-recording-booth-asset-v1"),
  id,
  workId: id,
  authorUserId: id,
  name: z.string().max(160),
  boothId: id,
  durationMs: z.number().int().positive().max(STUDIO_RECORDING_BOOTH_ASSET_MAX_DURATION_MS),
  contentType: studioRecordingBoothAssetContentTypeSchema,
  byteLength: z.number().int().positive().max(STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES),
  sha256: digest,
  createdAt: at,
  deletedAt: at.nullable(),
}).strict();

export const studioRecordingBoothAssetViewSchema = z.object({
  asset: studioRecordingBoothAssetSchema,
  canDelete: z.boolean(),
}).strict();

export const studioRecordingBoothAssetListSchema = z.object({
  items: z.array(studioRecordingBoothAssetViewSchema).max(100),
}).strict();

export const studioRecordingBoothAssetDeleteSchema = z.object({
  operationId: id,
  expectedSha256: digest,
}).strict();

export const studioRecordingBoothAssetSignedReadSchema = z.object({
  url: z.url({ protocol: /^https$/u }),
  expiresAtEpochMs: z.number().int().positive(),
}).strict();

export type StudioRecordingBoothAssetContentType = z.infer<typeof studioRecordingBoothAssetContentTypeSchema>;
export type StudioRecordingBoothAssetCreate = z.infer<typeof studioRecordingBoothAssetCreateSchema>;
export type StudioRecordingBoothAsset = z.infer<typeof studioRecordingBoothAssetSchema>;
export type StudioRecordingBoothAssetView = z.infer<typeof studioRecordingBoothAssetViewSchema>;
export type StudioRecordingBoothAssetList = z.infer<typeof studioRecordingBoothAssetListSchema>;
export type StudioRecordingBoothAssetDelete = z.infer<typeof studioRecordingBoothAssetDeleteSchema>;
export type StudioRecordingBoothAssetSignedRead = z.infer<typeof studioRecordingBoothAssetSignedReadSchema>;
