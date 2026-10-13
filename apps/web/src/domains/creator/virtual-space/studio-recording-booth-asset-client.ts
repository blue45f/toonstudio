import {
  STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES,
  studioRecordingBoothAssetCreateSchema,
  studioRecordingBoothAssetDeleteSchema,
  studioRecordingBoothAssetListSchema,
  studioRecordingBoothAssetSignedReadSchema,
  studioRecordingBoothAssetViewSchema,
  type StudioRecordingBoothAssetCreate,
  type StudioRecordingBoothAssetDelete,
  type StudioRecordingBoothAssetView,
} from "@toonstudio/studio-project-model/recording-booth-asset";
import { z } from "zod";
import { api, apiPath } from "@/platform/api";

const base = (workId: string) => `/studio-project-graph/works/${encodeURIComponent(workId)}/recording-booth-assets`;
const createdSchema = z.object({ view: studioRecordingBoothAssetViewSchema, replayed: z.boolean() }).strict();
const readSchema = studioRecordingBoothAssetViewSchema.extend({ signedRead: studioRecordingBoothAssetSignedReadSchema }).strict();
const deletedSchema = studioRecordingBoothAssetViewSchema.extend({ replayed: z.boolean() }).strict();

export async function listStudioRecordingBoothAssets(workId: string, signal?: AbortSignal) {
  const raw = await api.post<unknown>(`${base(workId)}/query`, {}, { signal, retry: 0, cache: "no-store" });
  return studioRecordingBoothAssetListSchema.parse(raw);
}

export async function uploadStudioRecordingBoothAsset(workId: string, inputValue: StudioRecordingBoothAssetCreate, file: Blob, signal?: AbortSignal) {
  const input = studioRecordingBoothAssetCreateSchema.parse(inputValue);
  if (!(file instanceof Blob) || file.size <= 0 || file.size > STUDIO_RECORDING_BOOTH_ASSET_MAX_BYTES) throw new Error("studio_recording_booth_asset_file_invalid");
  const form = new FormData();
  form.set("metadata", JSON.stringify(input));
  form.set("file", file, `booth-take-${input.assetId}.webm`);
  const raw = await api.raw.post(apiPath(base(workId)), { body: form, signal, timeout: 60_000, retry: 0 }).json<unknown>();
  return createdSchema.parse(raw);
}

export async function readStudioRecordingBoothAsset(workId: string, assetId: string, signal?: AbortSignal) {
  const raw = await api.post<unknown>(`${base(workId)}/${encodeURIComponent(assetId)}/read`, {}, { signal, retry: 0, cache: "no-store" });
  return readSchema.parse(raw);
}

export async function deleteStudioRecordingBoothAsset(workId: string, assetId: string, inputValue: StudioRecordingBoothAssetDelete, signal?: AbortSignal) {
  const input = studioRecordingBoothAssetDeleteSchema.parse(inputValue);
  const raw = await api.post<unknown>(`${base(workId)}/${encodeURIComponent(assetId)}/delete`, input, { signal, retry: 0, cache: "no-store" });
  return deletedSchema.parse(raw);
}

export type { StudioRecordingBoothAssetCreate, StudioRecordingBoothAssetDelete, StudioRecordingBoothAssetView };
