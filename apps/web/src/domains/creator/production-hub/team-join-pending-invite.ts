import {
  normalizeStudioSpatialInviteContext,
  type StudioSpatialInviteContext,
} from "../virtual-space/studio-spatial-invite-context";

/**
 * 합류 시트 이탈·복귀 시 초대 코드 임시 보관 — 보안 트레이드오프를 명시한 설계.
 *
 * 문제: 초대 코드는 비밀이라 링크에서 읽는 즉시 주소창에서 지우고(scrub) React 상태에만
 * 둔다. 그래서 이메일 인증 확인 등으로 이 화면을 전체 이동(full navigation)해 떠나면
 * 43자 코드가 소실돼, 사용자는 원래 링크를 다시 찾거나 코드를 다시 입력해야 했다.
 *
 * 선택: sessionStorage(이 탭 세션 한정)에만 임시 보관한다.
 * - 같은 탭에서 떠나고 돌아오는 왕복(인증 메일 확인, 실수로 다른 페이지 이동, 새로고침)
 *   에서는 코드가 복원돼 수락까지 한 흐름으로 이어진다.
 * - 탭(창)을 닫으면 브라우저가 세션 저장소를 함께 비우므로 기기에 남지 않는다.
 * - localStorage 같은 영속 저장소에는 절대 쓰지 않고, URL에도 다시 싣지 않는다 —
 *   기존 scrub 정책(기록·공유·로그로 새지 않기)은 그대로 유지된다.
 *
 * 감수하는 위험: sessionStorage는 같은 오리진 스크립트라면 읽을 수 있어, 메모리 상태만
 * 둘 때보다 XSS 노출 창이 "이 탭이 열려 있는 동안"으로 넓어진다. 이를 줄이기 위해
 * ① 보관 수명은 30분으로 짧게 잡고(인증 왕복에 충분한 시간), ② 완성된 형식의 코드만
 * 보관하며, ③ 수락 성공·사용자의 명시적 삭제·입력 비우기 시 즉시 지우고, ④ 불러올 때
 * 형식·수명을 다시 검증해 어긋나면 폐기한다. 새 탭에서 인증 링크를 열면 세션이 달라
 * 복원되지 않는데, 이는 의도된 한계다 — 그 경우에도 원래 탭은 살아 있어 돌아가면 된다.
 */

export const PENDING_TEAM_INVITE_STORAGE_KEY = "toonspectrum:pending-team-invite:v1";
/** 인증 왕복에 충분하면서 노출 창을 짧게 유지하는 보관 수명. */
export const PENDING_TEAM_INVITE_TTL_MS = 30 * 60 * 1000;

const INVITE_TOKEN = /^[A-Za-z0-9_-]{43}$/u;

export interface PendingTeamInvite {
  readonly token: string;
  readonly context: StudioSpatialInviteContext;
}

interface PendingTeamInviteRecord extends PendingTeamInvite {
  readonly v: 1;
  readonly savedAt: number;
}

/** sessionStorage의 최소 표면. 테스트에서 가짜 저장소를 주입할 수 있게 좁게 잡는다. */
export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function defaultStorage(): SessionStorageLike | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function parseContext(value: unknown): StudioSpatialInviteContext {
  if (typeof value === "object" && value !== null) {
    const record = value as { readonly kind?: unknown; readonly projectId?: unknown };
    if (record.kind === "project-space") {
      return normalizeStudioSpatialInviteContext({
        kind: "project-space",
        projectId: typeof record.projectId === "string" ? record.projectId : "",
      });
    }
    if (record.kind === "interview-waiting") {
      return normalizeStudioSpatialInviteContext({ kind: "interview-waiting" });
    }
  }
  return normalizeStudioSpatialInviteContext({ kind: "team-lobby" });
}

/** 완성된 코드만 보관한다. 형식이 어긋난 값은 쓰지 않는다(기존 보관분도 건드리지 않음). */
export function savePendingTeamInvite(
  token: string,
  context: StudioSpatialInviteContext,
  storage: SessionStorageLike | null = defaultStorage(),
  now: number = Date.now(),
): void {
  if (!storage || !INVITE_TOKEN.test(token)) return;
  const record: PendingTeamInviteRecord = {
    v: 1,
    token,
    context: normalizeStudioSpatialInviteContext(context),
    savedAt: now,
  };
  try {
    storage.setItem(PENDING_TEAM_INVITE_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 복귀 편의만 잃을 뿐 합류 자체를 막지 않는다.
  }
}

/**
 * 보관된 코드를 읽는다. 없거나, 형식이 깨졌거나, 수명이 지났으면 null을 돌려주고
 * 잘못된 보관분은 그 자리에서 폐기한다.
 */
export function loadPendingTeamInvite(
  storage: SessionStorageLike | null = defaultStorage(),
  now: number = Date.now(),
): PendingTeamInvite | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(PENDING_TEAM_INVITE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PendingTeamInviteRecord>;
    if (
      parsed.v !== 1
      || typeof parsed.token !== "string"
      || !INVITE_TOKEN.test(parsed.token)
      || typeof parsed.savedAt !== "number"
      || now - parsed.savedAt < 0
      || now - parsed.savedAt > PENDING_TEAM_INVITE_TTL_MS
    ) {
      clearPendingTeamInvite(storage);
      return null;
    }
    return { token: parsed.token, context: parseContext(parsed.context) };
  } catch {
    clearPendingTeamInvite(storage);
    return null;
  }
}

export function clearPendingTeamInvite(
  storage: SessionStorageLike | null = defaultStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(PENDING_TEAM_INVITE_STORAGE_KEY);
  } catch {
    // 지우기 실패는 무시한다 — 다음 불러오기 때 형식·수명 검증이 다시 거른다.
  }
}
