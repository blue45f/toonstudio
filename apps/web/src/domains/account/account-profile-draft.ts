import {
  getAuthSession,
  listeners as authSessionListeners,
  type Session,
} from "@/domains/auth/public/session/auth-session-state";
import type { CreatorRoleProfile } from "@/shared/lib/creator-role-contract";

export interface ProfileDraftFields {
  name: string;
  bio: string;
  image: string | null;
  creatorRoleProfile: CreatorRoleProfile;
}
export type ProfileDraftPatch = Partial<ProfileDraftFields>;
export interface ProfileDraftScope {
  readonly userId: string;
  readonly generation: number;
}
export interface ProfileDraftSnapshot {
  readonly revision: number;
  readonly patch: ProfileDraftPatch;
}

// 초안은 이 문서의 메모리에만 둔다. 브라우저 저장소·서버·다른 탭에 전송하지 않는다.
let ownerId = getAuthSession()?.user.id ?? null;
let generation = 0;
let nextRevision = 0;
let draft: ProfileDraftSnapshot | null = null;
let unloadGuardAttached = false;
const identityListeners = new Set<() => void>();

function protectDraft(event: BeforeUnloadEvent): void {
  event.preventDefault();
  // 일부 브라우저의 이전 beforeunload 동작도 유지한다. 실제 안내 문구는 브라우저가 정한다.
  event.returnValue = " ";
}

function updateUnloadGuard(): void {
  if (typeof window === "undefined") return;
  if (draft && !unloadGuardAttached) {
    window.addEventListener("beforeunload", protectDraft);
    unloadGuardAttached = true;
  } else if (!draft && unloadGuardAttached) {
    window.removeEventListener("beforeunload", protectDraft);
    unloadGuardAttached = false;
  }
}

function reconcileOwner(nextId: string | null): void {
  if (ownerId === nextId) return;
  ownerId = nextId;
  generation += 1;
  draft = null;
  updateUnloadGuard();
  identityListeners.forEach((listener) => listener());
}

function handleSessionChange(session: Session): void {
  reconcileOwner(session?.user.id ?? null);
}

authSessionListeners.add(handleSessionChange);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    authSessionListeners.delete(handleSessionChange);
    identityListeners.clear();
    draft = null;
    updateUnloadGuard();
  });
}

export function captureProfileDraftScope(userId: string): ProfileDraftScope {
  reconcileOwner(getAuthSession()?.user.id ?? null);
  return { userId, generation };
}

/** 프로필 갱신은 유지하고 로그아웃·계정 교체만 편집 폼의 세대를 바꾼다. */
export function getProfileDraftIdentityGeneration(): number {
  return generation;
}

export function subscribeProfileDraftIdentity(listener: () => void): () => void {
  identityListeners.add(listener);
  return () => { identityListeners.delete(listener); };
}

export function isProfileDraftScopeCurrent(scope: ProfileDraftScope): boolean {
  reconcileOwner(getAuthSession()?.user.id ?? null);
  return ownerId === scope.userId && generation === scope.generation;
}

function clonePatch(patch: ProfileDraftPatch): ProfileDraftPatch {
  return {
    ...patch,
    ...(patch.creatorRoleProfile ? {
      creatorRoleProfile: {
        ...patch.creatorRoleProfile,
        secondaryRoles: [...patch.creatorRoleProfile.secondaryRoles],
        specialties: [...patch.creatorRoleProfile.specialties],
      },
    } : {}),
  };
}

export function readProfileDraft(scope: ProfileDraftScope): ProfileDraftSnapshot | null {
  if (!isProfileDraftScopeCurrent(scope) || !draft) return null;
  return { revision: draft.revision, patch: clonePatch(draft.patch) };
}

export function writeProfileDraft(scope: ProfileDraftScope, patch: ProfileDraftPatch): number | null {
  if (!isProfileDraftScopeCurrent(scope) || Object.keys(patch).length === 0) return null;
  const revision = ++nextRevision;
  draft = { revision, patch: clonePatch(patch) };
  updateUnloadGuard();
  return revision;
}

/** 이전 화면에서 늦게 끝난 저장이 새 화면의 초안을 지우지 못하게 한다. */
export function clearProfileDraft(scope: ProfileDraftScope, expectedRevision: number | null): boolean {
  if (!isProfileDraftScopeCurrent(scope) || !draft || draft.revision !== expectedRevision) return false;
  draft = null;
  updateUnloadGuard();
  return true;
}

export function changedProfileFields(
  current: ProfileDraftFields,
  baseline: ProfileDraftFields,
  roleTouched: boolean,
): ProfileDraftPatch {
  return {
    ...(current.name.trim() !== baseline.name ? { name: current.name } : {}),
    ...(current.bio.trim() !== baseline.bio ? { bio: current.bio } : {}),
    ...(current.image !== baseline.image ? { image: current.image } : {}),
    ...(roleTouched ? { creatorRoleProfile: current.creatorRoleProfile } : {}),
  };
}
