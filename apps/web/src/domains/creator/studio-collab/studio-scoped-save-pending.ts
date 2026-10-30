import { z } from "zod";
import { canonicalJson } from "@toonstudio/studio-project-model";
import { StudioScopedWriteContextSchema } from "@toonstudio/contracts/studio-scoped-write";
import { assertStudioApiJsonPayloadSize, STUDIO_API_MAX_JSON_BYTES } from "../studio-api-payload-safety";
import { studioSaveIntentScopeKey, type StudioDurableSaveIntent, type StudioSaveIntentScope } from "../studio-durable-save-intent";
import { studioScopedSaveMutationId } from "./studio-scoped-save-document";
import type { StudioScopedSharedDocumentInput } from "../studio-shared-document-client";
import type { StudioProjectSnapshot } from "../studio-project-snapshot";
import type { createStudioScopedSavePendingRepository } from "./studio-scoped-save-pending-sqlite";

export const STUDIO_SCOPED_SAVE_PENDING_NAMESPACE = "studio-scoped-save-pending-v1";
export interface StudioScopedSavePendingScope { readonly actorUserId: string; readonly workId: string }
export interface StudioScopedSavePending extends StudioScopedSavePendingScope {
  readonly version: 1;
  readonly body: StudioScopedSharedDocumentInput;
  readonly snapshotDigest: string;
  readonly hasExcludedDraft: boolean;
  readonly intentScope: StudioSaveIntentScope;
  readonly intent: StudioDurableSaveIntent | null;
}
const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
const intentScope = z.object({ ownerId: z.string().min(1).max(512).nullable(), documentKey: z.string().min(1).max(2048) }).strict();
const pendingSchema = z.object({
  version: z.literal(1), actorUserId: identity, workId: identity,
  body: z.object({ baseRevision: z.number().int().min(1).max(2_147_483_647),
    crdtServerSequence: z.string().regex(/^(?:0|[1-9]\d{0,18})$/u).refine((value) => BigInt(value) <= BigInt("9223372036854775807")),
    doc: z.record(z.string(), z.unknown()), mutationId: z.uuid(), writeContext: StudioScopedWriteContextSchema,
  }).strict(),
  snapshotDigest: z.string().regex(/^[a-f0-9]{64}$/u), hasExcludedDraft: z.boolean(), intentScope,
  intent: z.object({ version: z.literal(1), id: z.string().regex(/^[a-zA-Z0-9-]{1,128}$/u), scope: intentScope,
    queuedAt: z.number().int().positive(), serverRevision: z.number().int().positive().nullable() }).strict().nullable(),
}).strict();

export function studioScopedSavePendingKey(scope: StudioScopedSavePendingScope): string {
  if (!identity.safeParse(scope.actorUserId).success || !identity.safeParse(scope.workId).success) throw new Error("저장 확인의 계정·작품을 확인할 수 없습니다.");
  return JSON.stringify([scope.actorUserId, scope.workId]);
}
/** 원문을 다른 계정·작품·배정으로 고쳐 읽지 않는다. 손상된 행도 자동 삭제하지 않는다. */
export async function decodeStudioScopedSavePending(raw: string, scope: StudioScopedSavePendingScope): Promise<StudioScopedSavePending> {
  try {
    if (raw.length > STUDIO_API_MAX_JSON_BYTES + 16_384) throw new Error("size");
    const value = pendingSchema.parse(JSON.parse(raw));
    if (studioScopedSavePendingKey(value) !== studioScopedSavePendingKey(scope)
      || value.intentScope.ownerId !== scope.actorUserId
      || (value.intent && studioSaveIntentScopeKey(value.intent.scope) !== studioSaveIntentScopeKey(value.intentScope))
      || value.body.writeContext.creations.length || value.body.writeContext.restorations.length) throw new Error("scope");
    assertStudioApiJsonPayloadSize(value.body);
    const { mutationId, ...body } = value.body;
    if (await studioScopedSaveMutationId(scope.actorUserId, scope.workId, body) !== mutationId) throw new Error("digest");
    return value;
  } catch { throw new Error("이 계정·작품의 이전 저장 원문을 확인하지 못했습니다. 기기 초안을 보존하고 저장 상태를 확인하세요."); }
}

/** 저장 시각·보기 선택은 제외하고 실제 원고·master·페이지·작품 정보는 모두 비교한다. */
export async function studioScopedSaveSnapshotDigest(snapshot: StudioProjectSnapshot): Promise<string> {
  const { savedAt: _savedAt, currentPageId: _currentPageId, ...authored } = snapshot;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(authored)));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

const listeners = new Set<(key: string, pending: boolean) => void>();
export function subscribeStudioScopedSavePending(listener: (key: string, pending: boolean) => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
/** SQLite readback 검증이 끝난 저장·삭제만 UI에 알린다. 자동 전송 신호가 아니다. */
export function emitStudioScopedSavePending(key: string, pending: boolean): void {
  for (const listener of listeners) { try { listener(key, pending); } catch { /* 관찰자가 영속 기록을 무효화하지 않는다. */ } }
}
type Repository = ReturnType<typeof createStudioScopedSavePendingRepository>;
let persistence: Promise<Repository> | null = null;
function repository(): Promise<Repository> {
  persistence ??= import("./studio-scoped-save-pending-sqlite").then((module) => module.createStudioScopedSavePendingRepository())
    .catch((error: unknown) => { persistence = null; throw error; });
  return persistence;
}
export const studioScopedSavePendingRepository: Repository = {
  load: (scope) => repository().then((store) => store.load(scope)),
  remember: (scope, value) => repository().then((store) => store.remember(scope, value)),
  clear: (scope, mutationId) => repository().then((store) => store.clear(scope, mutationId)),
};
