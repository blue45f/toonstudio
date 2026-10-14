import { z } from "zod";
import { api, apiPath } from "@/platform/api";
import {
  parseVoiceCommentaryTrack,
  type VoiceCommentaryTrack,
} from "./review-voice-commentary-model";

/**
 * 회차 검수 음성 해설의 서버 저장 클라이언트.
 *
 * 검수 음성 노트(studio-review-voice-note-client)와 같은 호출 규약
 * (POST + FormData 업로드 + 응답 zod 검증)을 쓰되, 대상은 제작 프로젝트의
 * 회차다. 서버가 돌려준 트랙은 모델의 자체 파서로 검증해 정규화된
 * VoiceCommentaryTrack으로만 돌려준다 — 형식이 어긋나면 조용히 쓰지 않고
 * 던져서 호출부가 세션 보관 폴백을 유지하게 한다.
 */

const MAX_BYTES = 5 * 1024 * 1024;

const base = (projectId: string, episodeId: string) =>
  `/production/projects/${encodeURIComponent(projectId)}/episodes/${encodeURIComponent(episodeId)}/voice-commentaries`;

const signedReadSchema = z.object({
  url: z.url({ protocol: /^https$/u }),
  expiresAtEpochMs: z.number().int().positive(),
}).strict();

const rawViewSchema = z.object({
  track: z.record(z.string(), z.unknown()),
  canDelete: z.boolean(),
}).strict();

const createdSchema = z.object({ view: rawViewSchema, replayed: z.boolean() }).strict();
const listSchema = z.object({ items: z.array(rawViewSchema) }).strict();
const readSchema = rawViewSchema.extend({ signedRead: signedReadSchema }).strict();
const deletedSchema = z.object({ view: rawViewSchema, replayed: z.boolean() }).strict();

export interface ProductionVoiceCommentaryView {
  readonly track: VoiceCommentaryTrack;
  readonly canDelete: boolean;
}

export interface ProductionVoiceCommentaryRead extends ProductionVoiceCommentaryView {
  readonly signedRead: { readonly url: string; readonly expiresAtEpochMs: number };
}

function toView(raw: z.infer<typeof rawViewSchema>): ProductionVoiceCommentaryView {
  const track = parseVoiceCommentaryTrack(JSON.stringify(raw.track));
  if (!track) throw new Error("production_voice_commentary_response_invalid");
  return { track, canDelete: raw.canDelete };
}

export async function uploadProductionVoiceCommentary(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly operationId: string;
  readonly track: VoiceCommentaryTrack;
  readonly file: Blob;
  readonly retentionDays?: number;
}, signal?: AbortSignal): Promise<{ view: ProductionVoiceCommentaryView; replayed: boolean }> {
  const { file, track } = input;
  if (!(file instanceof Blob) || file.size <= 0 || file.size > MAX_BYTES) {
    throw new Error("production_voice_commentary_file_invalid");
  }
  if (track.episodeId !== input.episodeId) throw new Error("production_voice_commentary_episode_mismatch");
  // 오디오 참조는 보내지 않는다 — 실체(타입·크기·해시)는 서버가 파일에서 도출한다.
  const { audio: _audio, ...trackMeta } = track;
  const metadata = {
    operationId: input.operationId,
    track: trackMeta,
    ...(input.retentionDays ? { retentionDays: input.retentionDays } : {}),
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  form.set("file", file, `voice-commentary-${track.id}.${file.type.includes("ogg") ? "ogg" : file.type.includes("mpeg") ? "mp3" : file.type.includes("mp4") ? "m4a" : file.type.includes("wav") ? "wav" : "webm"}`);
  const raw = await api.raw.post(apiPath(base(input.projectId, input.episodeId)), { body: form, signal, timeout: 60_000, retry: 0 }).json<unknown>();
  const created = createdSchema.parse(raw);
  return { view: toView(created.view), replayed: created.replayed };
}

export async function listProductionVoiceCommentaries(
  projectId: string,
  episodeId: string,
  signal?: AbortSignal,
): Promise<{ items: ProductionVoiceCommentaryView[] }> {
  const raw = await api.post<unknown>(`${base(projectId, episodeId)}/query`, {}, { signal, retry: 0, cache: "no-store" });
  const list = listSchema.parse(raw);
  return { items: list.items.map(toView) };
}

export async function readProductionVoiceCommentary(
  projectId: string,
  episodeId: string,
  trackId: string,
  signal?: AbortSignal,
): Promise<ProductionVoiceCommentaryRead> {
  const raw = await api.post<unknown>(
    `${base(projectId, episodeId)}/${encodeURIComponent(trackId)}/read`,
    {},
    { signal, retry: 0, cache: "no-store" },
  );
  const read = readSchema.parse(raw);
  return { ...toView(read), signedRead: read.signedRead };
}

export async function deleteProductionVoiceCommentary(input: {
  readonly projectId: string;
  readonly episodeId: string;
  readonly trackId: string;
  readonly operationId: string;
  readonly expectedSha256: string;
}, signal?: AbortSignal): Promise<{ view: ProductionVoiceCommentaryView; replayed: boolean }> {
  const raw = await api.post<unknown>(
    `${base(input.projectId, input.episodeId)}/${encodeURIComponent(input.trackId)}/delete`,
    { operationId: input.operationId, expectedSha256: input.expectedSha256 },
    { signal, retry: 0, cache: "no-store" },
  );
  const deleted = deletedSchema.parse(raw);
  return { view: toView(deleted.view), replayed: deleted.replayed };
}
