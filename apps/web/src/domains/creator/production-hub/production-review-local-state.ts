import { getAuthUserId } from "@/domains/auth/public/session/auth-session-state";

export type ProductionReviewLocalOwner = { readonly kind: "account"; readonly userId: string }
  | { readonly kind: "guest"; readonly mode: "anonymous" | "sample" };
export interface ProductionReviewLocalScope {
  readonly owner: ProductionReviewLocalOwner;
  readonly projectId: string;
  readonly workId: string;
  readonly episodeId: string;
}
export type ProductionReviewLocalKind = "compare-session" | "compare-comments";
export interface ProductionReviewLocalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const PREFIX = "toonstudio.production-review-local.v1:";

export function productionReviewLocalOwner(userId: string | null, isDemo = false): ProductionReviewLocalOwner {
  return userId ? { kind: "account", userId }
    : { kind: "guest", mode: isDemo ? "sample" : "anonymous" };
}
export function productionReviewLocalScope(
  userId: string | null, projectId: string, workId: string, episodeId: string, isDemo = false,
): ProductionReviewLocalScope {
  return { owner: productionReviewLocalOwner(userId, isDemo), projectId, workId, episodeId };
}
export function productionReviewLocalScopeKey(scope: ProductionReviewLocalScope): string {
  return JSON.stringify([scope.owner.kind, scope.owner.kind === "account" ? scope.owner.userId : scope.owner.mode,
    scope.projectId, scope.workId, scope.episodeId]);
}
export function productionReviewLocalStorageKey(scope: ProductionReviewLocalScope, kind: ProductionReviewLocalKind): string {
  return PREFIX + kind + ":" + encodeURIComponent(productionReviewLocalScopeKey(scope));
}
export function isProductionReviewLocalOwnerCurrent(owner: ProductionReviewLocalOwner): boolean {
  return owner.kind === "account" ? getAuthUserId() === owner.userId
    : getAuthUserId() === null;
}
function browserStorage(): ProductionReviewLocalStorage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function payload(raw: string, scope: ProductionReviewLocalScope, kind: ProductionReviewLocalKind): string | null {
  const envelope: unknown = JSON.parse(raw);
  if (envelope === null || typeof envelope !== "object" || Array.isArray(envelope)) return null;
  const value = envelope as Record<string, unknown>;
  return value.version === 1 && value.kind === kind && value.scope === productionReviewLocalScopeKey(scope)
    && typeof value.payload === "string" ? value.payload : null;
}

/** 소유자 없는 기존 키를 읽거나 이관하지 않는다. 원래 파일·댓글 직렬화는 봉투 안에 그대로 둔다. */
export function readProductionReviewLocalState(scope: ProductionReviewLocalScope, kind: ProductionReviewLocalKind,
  storage: ProductionReviewLocalStorage | null = browserStorage()): string | null {
  if (!storage || !isProductionReviewLocalOwnerCurrent(scope.owner)) return null;
  try {
    const raw = storage.getItem(productionReviewLocalStorageKey(scope, kind));
    return raw === null ? null : payload(raw, scope, kind);
  } catch { return null; }
}

/** 계정 변경 뒤 남은 effect와 잘못 묶인 기존 봉투는 원문을 덮어쓰지 않는다. */
export function writeProductionReviewLocalState(scope: ProductionReviewLocalScope, kind: ProductionReviewLocalKind,
  serialized: string, storage: ProductionReviewLocalStorage | null = browserStorage()): boolean {
  if (!storage || !isProductionReviewLocalOwnerCurrent(scope.owner)) return false;
  try {
    const key = productionReviewLocalStorageKey(scope, kind), existing = storage.getItem(key);
    if (existing !== null && payload(existing, scope, kind) === null) return false;
    storage.setItem(key, JSON.stringify({ version: 1, kind, scope: productionReviewLocalScopeKey(scope), payload: serialized }));
    return true;
  } catch { return false; }
}
