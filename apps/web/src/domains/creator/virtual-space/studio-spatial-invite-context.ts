export type StudioSpatialInviteContext =
  | { readonly kind: "team-lobby" }
  | { readonly kind: "project-space"; readonly projectId: string }
  | { readonly kind: "interview-waiting" };

export interface ParsedStudioSpatialInvite {
  readonly token: string | null;
  readonly context: StudioSpatialInviteContext;
  /** 온보딩 패키지(T-3)용 초대 프리셋 힌트. 권한·입장 판정에 쓰지 않는 표시 전용 값이며,
   *  모르는 값이면 null — 수락 화면은 패키지를 숨기고 기존 흐름만 보여 준다. */
  readonly packagePresetId: string | null;
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/u;

/** 저장된 게스트 세션의 자격이 초대 토큰인지 입장코드인지 가르는 형식 판정. */
export function isStudioSpatialInviteToken(value: string): boolean {
  return TOKEN.test(value);
}
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u;
const ENTRY = new Set(["team-lobby", "project-space", "interview-waiting"]);

export function normalizeStudioSpatialInviteContext(
  value: StudioSpatialInviteContext,
): StudioSpatialInviteContext {
  if (value.kind === "project-space" && OPAQUE_ID.test(value.projectId)) {
    return Object.freeze({ kind: "project-space", projectId: value.projectId });
  }
  if (value.kind === "interview-waiting") {
    return Object.freeze({ kind: "interview-waiting" });
  }
  return Object.freeze({ kind: "team-lobby" });
}

const PACKAGE_PRESET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/u;

export function createStudioSpatialInviteFragment(
  token: string,
  context: StudioSpatialInviteContext,
  options?: { readonly packagePresetId?: string | null },
): string {
  if (!TOKEN.test(token)) throw new Error("Invalid invitation token");
  const safe = normalizeStudioSpatialInviteContext(context);
  const fragment = new URLSearchParams({ invite: token, entry: safe.kind });
  if (safe.kind === "project-space") fragment.set("project", safe.projectId);
  // 패키지 힌트는 형식이 맞는 값만 싣는다. 없거나 깨졌으면 기존 프래그먼트와 바이트 단위로 같다.
  if (options?.packagePresetId && PACKAGE_PRESET_ID.test(options.packagePresetId)) {
    fragment.set("pkg", options.packagePresetId);
  }
  return `#${fragment.toString()}`;
}

export function parseStudioSpatialInviteFragment(hash: string): ParsedStudioSpatialInvite {
  const fragment = new URLSearchParams(hash.replace(/^#/u, ""));
  const rawToken = fragment.get("invite");
  const token = rawToken && TOKEN.test(rawToken) ? rawToken : null;
  const entry = fragment.get("entry");
  const projectId = fragment.get("project");
  let context: StudioSpatialInviteContext = { kind: "team-lobby" };
  if (token && entry && ENTRY.has(entry)) {
    if (entry === "project-space" && projectId && OPAQUE_ID.test(projectId)) {
      context = { kind: "project-space", projectId };
    } else if (entry === "interview-waiting") {
      context = { kind: "interview-waiting" };
    }
  }
  const rawPackagePresetId = fragment.get("pkg");
  const packagePresetId = token && rawPackagePresetId && PACKAGE_PRESET_ID.test(rawPackagePresetId)
    ? rawPackagePresetId
    : null;
  return Object.freeze({
    token,
    context: normalizeStudioSpatialInviteContext(context),
    packagePresetId,
  });
}

export function studioSpatialInviteDestination(
  context: StudioSpatialInviteContext,
  workspaceId: string,
): string {
  const safeWorkspace = OPAQUE_ID.test(workspaceId) ? workspaceId : "";
  const normalized = normalizeStudioSpatialInviteContext(context);
  if (normalized.kind === "project-space") {
    return `/studio/p/${encodeURIComponent(normalized.projectId)}/space?lobby=1`;
  }
  if (normalized.kind === "interview-waiting") {
    const query = new URLSearchParams({ panel: "rooms", waiting: "1" });
    if (safeWorkspace) query.set("workspace", safeWorkspace);
    return `/team/recruiting?${query.toString()}`;
  }
  const query = safeWorkspace ? `?workspace=${encodeURIComponent(safeWorkspace)}&lobby=1` : "?lobby=1";
  return `/team${query}`;
}
