import { z } from "zod";
import { COLLABORATION_MODELS } from "@toonstudio/core/production";
import { canonicalJson } from "@toonstudio/studio-project-model";

const identity = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
export const ProductionCreateInputSchema = z.object({
  projectId: identity, workId: identity, title: z.string().trim().min(1).max(240),
  collaborationModel: z.enum(COLLABORATION_MODELS), ownerPartyId: identity,
  ownerDisplayName: z.string().trim().min(1).max(120),
}).strict();
const pendingSchema = z.object({
  version: z.literal(1), actorUserId: identity, workId: identity,
  input: ProductionCreateInputSchema, clientMutationId: z.uuid(),
  queuedAt: z.number().int().positive(), digest: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
export type ProductionCreateInput = z.infer<typeof ProductionCreateInputSchema>;
export type ProductionCreatePending = z.infer<typeof pendingSchema>;
export interface ProductionCreateScope { readonly actorUserId: string; readonly workId: string }
export const PRODUCTION_CREATE_PENDING_NAMESPACE = "production-project-create-pending-v1";

export function productionCreatePendingKey(scope: ProductionCreateScope): string {
  identity.parse(scope.actorUserId); identity.parse(scope.workId);
  return JSON.stringify([scope.actorUserId, scope.workId]);
}
async function digest(value: Omit<ProductionCreatePending, "digest">): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson(value)));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** 미확인 생성은 기한·재로그인으로 지우거나 다른 작품으로 바꾸지 않는다. */
export async function decodeProductionCreatePending(raw: string, scope: ProductionCreateScope): Promise<ProductionCreatePending> {
  try {
    if (raw.length > 8192) throw new Error("size");
    const parsed = pendingSchema.parse(JSON.parse(raw)), { digest: checksum, ...body } = parsed;
    if (productionCreatePendingKey(parsed) !== productionCreatePendingKey(scope)
      || parsed.input.workId !== scope.workId || await digest(body) !== checksum) throw new Error("scope");
    return parsed;
  } catch {
    throw new Error("이 계정·작품의 이전 생성 원문을 확인하지 못했습니다. 보관한 요청을 유지하고 서버 전송을 중지했습니다.");
  }
}
export async function prepareProductionCreatePending(scope: ProductionCreateScope,
  input: Omit<ProductionCreateInput, "projectId" | "ownerPartyId">): Promise<ProductionCreatePending> {
  productionCreatePendingKey(scope);
  if (input.workId !== scope.workId) throw new Error("생성할 작품과 현재 선택이 다릅니다.");
  const body = { version: 1 as const, ...scope, input: ProductionCreateInputSchema.parse({ ...input,
    projectId: crypto.randomUUID(), ownerPartyId: crypto.randomUUID() }),
    clientMutationId: crypto.randomUUID(), queuedAt: Date.now() };
  return { ...body, digest: await digest(body) };
}
