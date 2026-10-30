// 내 정보(/api/me) 조회·프로필 갱신 전용 ky 헬퍼.
// 공유 클라이언트가 HttpOnly 세션 쿠키와 CSRF 헤더를 처리한다.
import {
  getAuthSession,
  listeners as authSessionListeners,
  type Session,
  mergeCurrentSessionProfile,
} from "@/domains/auth/public/session/auth-session-state";
import {
  normalizeCreatorRoleProfile,
  type CreatorRoleProfile,
} from "@/shared/lib/creator-role-contract";
import { parseRegionSettings, type RegionSettings } from "@/shared/lib/region-settings";
import { api, toApiError } from "@/platform/api";

export interface MeProfile {
  id: string;
  name: string | null;
  image: string | null;
  avatar: string | null;
  email: string | null;
  bio: string | null;
  creatorRoleProfile: CreatorRoleProfile;
  regionSettings: RegionSettings | null;
}

export interface UpdateProfilePayload {
  name?: string;
  bio?: string;
  image?: string | null; // dataURL(webp/png/jpeg) 또는 null(제거). 미포함 시 변경 없음.
  creatorRoleProfile?: CreatorRoleProfile;
  regionSettings?: RegionSettings;
}

type MeProfileResponse = Omit<MeProfile, "creatorRoleProfile" | "regionSettings"> & {
  creatorRoleProfile?: unknown;
  regionSettings?: unknown;
};
type ProfileListener = (profile: MeProfile | null) => void;

const PROFILE_CHANNEL_NAME = "toonspectrum:me-profile:v1";
let cachedProfile: MeProfile | null = null;
let inFlightProfile: Promise<MeProfile> | null = null;
let profileChannel: BroadcastChannel | null = null;
let channelInitialized = false;
const profileListeners = new Set<ProfileListener>();
let profileOwnerId = currentSessionUserId();
let profileGeneration = 0;
let readSequence = 0;
let committedReadSequence = 0;

function resetProfileCache(): void {
  profileGeneration += 1;
  cachedProfile = null;
  inFlightProfile = null;
  notifyProfileListeners(null);
}

function handleProfileSessionChange(session: Session): void {
  const nextId = session?.user.id ?? null;
  if (profileOwnerId === nextId) return;
  profileOwnerId = nextId;
  resetProfileCache();
}

authSessionListeners.add(handleProfileSessionChange);
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    authSessionListeners.delete(handleProfileSessionChange);
    profileChannel?.close();
  });
}

function assertCurrentProfileRequest(ownerId: string | null, generation: number, responseId: string): void {
  if (!ownerId || currentSessionUserId() !== ownerId || generation !== profileGeneration || responseId !== ownerId) {
    throw new Error("프로필 상태가 바뀌었어요. 현재 계정에서 다시 불러와 주세요.");
  }
}

/** 잘못된 서버·탭 응답을 입력 폼과 세션 캐시에 넘기지 않는다. */
function isMeProfileResponse(value: unknown): value is MeProfileResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.id === "string" && profile.id.trim().length > 0
    && ["name", "image", "avatar", "email", "bio"].every((key) =>
      profile[key] === null || typeof profile[key] === "string");
}

function normalizeMeProfile(profile: MeProfileResponse): MeProfile {
  return {
    ...profile,
    creatorRoleProfile: normalizeCreatorRoleProfile(profile.creatorRoleProfile),
    regionSettings: parseRegionSettings(profile.regionSettings),
  };
}

function currentSessionUserId(): string | null {
  return getAuthSession()?.user.id ?? null;
}

function notifyProfileListeners(profile: MeProfile | null): void {
  for (const listener of profileListeners) listener(profile);
}

function ensureProfileChannel(): void {
  if (channelInitialized || typeof BroadcastChannel === "undefined") return;
  channelInitialized = true;
  try {
    profileChannel = new BroadcastChannel(PROFILE_CHANNEL_NAME);
  } catch {
    // 탭 간 캐시는 선택 기능이다. 브라우저에서 막혀도 서버 조회·저장은 계속한다.
    return;
  }
  profileChannel.addEventListener("message", (event: MessageEvent<unknown>) => {
    const value = event.data;
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const record = value as Record<string, unknown>;
    if (record.type === "invalidate") {
      resetProfileCache();
      return;
    }
    if (record.type !== "profile") return;
    const candidate = record.profile;
    if (!isMeProfileResponse(candidate)) return;
    const sessionUserId = currentSessionUserId();
    if (!sessionUserId || candidate.id !== sessionUserId) return;
    const normalized = normalizeMeProfile(candidate);
    profileGeneration += 1;
    inFlightProfile = null;
    commitProfile(normalized, false);
  });
}

function commitProfile(profile: MeProfile, broadcast: boolean): MeProfile {
  cachedProfile = profile;
  mergeCurrentSessionProfile(profile);
  notifyProfileListeners(profile);
  if (broadcast) {
    ensureProfileChannel();
    try {
      profileChannel?.postMessage({ type: "profile", profile });
    } catch {
      // Profile cache synchronization is an optimization; the server remains authoritative.
    }
  }
  return profile;
}

export function subscribeMyProfile(listener: ProfileListener): () => void {
  ensureProfileChannel();
  profileListeners.add(listener);
  return () => profileListeners.delete(listener);
}

export function getCachedMyProfile(): MeProfile | null {
  const sessionUserId = currentSessionUserId();
  if (cachedProfile && (!sessionUserId || cachedProfile.id !== sessionUserId)) {
    cachedProfile = null;
  }
  return cachedProfile;
}

export function invalidateMyProfileCache(options?: {
  readonly broadcast?: boolean;
}): void {
  resetProfileCache();
  if (options?.broadcast !== false) {
    ensureProfileChannel();
    try {
      profileChannel?.postMessage({ type: "invalidate" });
    } catch {
      // Other tabs will refresh naturally on their next profile request.
    }
  }
}

export async function getMyProfile(
  signal?: AbortSignal,
  force = false,
): Promise<MeProfile> {
  ensureProfileChannel();
  const ownerId = currentSessionUserId();
  if (!ownerId) throw new Error("로그인 후 프로필을 불러와 주세요.");
  signal?.throwIfAborted();
  const cached = getCachedMyProfile();
  if (!force && cached) return cached;
  if (!force && !signal && inFlightProfile) return inFlightProfile;

  const generation = profileGeneration;
  const sequence = ++readSequence;
  const request = (async () => {
    let data: { profile?: unknown } | undefined;
    try {
      data = await api.get<{ profile?: unknown }>("/me", { signal });
    } catch (err) {
      throw await toApiError(err, "프로필을 불러오지 못했어요.");
    }
    signal?.throwIfAborted();
    if (!isMeProfileResponse(data?.profile)) throw new Error("프로필을 불러오지 못했어요.");
    assertCurrentProfileRequest(ownerId, generation, data.profile.id);
    // 더 최근 조회가 먼저 끝났다면 늦게 온 예전 값으로 세션·폼을 되돌리지 않는다.
    if (sequence < committedReadSequence && cachedProfile) return cachedProfile;
    committedReadSequence = sequence;
    return commitProfile(normalizeMeProfile(data.profile), false);
  })();

  if (!signal) inFlightProfile = request;
  try {
    return await request;
  } finally {
    if (!signal && inFlightProfile === request) inFlightProfile = null;
  }
}

// 프로필(name·bio·image·직무) 갱신. 성공 시 갱신된 프로필을 반환.
export async function updateMyProfile(payload: UpdateProfilePayload): Promise<MeProfile> {
  const ownerId = currentSessionUserId();
  if (!ownerId) throw new Error("로그인 후 프로필을 저장해 주세요.");
  // 쓰기 시작·완료 경계 양쪽에서 이전 조회가 저장 결과를 되돌리지 못하게 한다.
  const generation = ++profileGeneration;
  inFlightProfile = null;
  let data: { profile?: unknown } | undefined;
  try {
    data = await api.patch<{ profile?: unknown }>("/me/profile", payload);
  } catch (err) {
    throw await toApiError(err, "프로필을 저장하지 못했어요.");
  }
  if (!isMeProfileResponse(data?.profile)) throw new Error("프로필을 저장하지 못했어요.");
  assertCurrentProfileRequest(ownerId, generation, data.profile.id);
  profileGeneration += 1;
  inFlightProfile = null;
  return commitProfile(normalizeMeProfile(data.profile), true);
}

export async function deleteMyAccount(): Promise<{ ok: true; deletedAt: string }> {
  let data: { ok?: boolean; deletedAt?: string } | undefined;
  try {
    data = await api.delete<{ ok?: boolean; deletedAt?: string }>("/me/account");
  } catch (err) {
    throw await toApiError(err, "계정을 탈퇴 처리하지 못했어요.");
  }
  if (!data?.ok || !data.deletedAt) throw new Error("계정을 탈퇴 처리하지 못했어요.");
  invalidateMyProfileCache();
  return { ok: true, deletedAt: data.deletedAt };
}
