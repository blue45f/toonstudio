import { z } from "zod";

import { api, HTTPError, isAppApiError, type ApiOptions } from "@/platform/api";

/**
 * CT-1: 원고 버전 스냅샷·공유 링크 서버 정본 API 클라이언트.
 *
 * 서버 계약은 apps/api의 manuscript-version-share 컨트롤러가 정본이다.
 * 스냅샷은 revision 참조만 들고 있고, 공유 링크 응답에는 원문 토큰이 없다
 * (서버는 해시만 저장한다 — 목록에서는 tokenSuffix 표시만 가능하다).
 */

const BASE = "/studio-project-graph";

const serverManuscriptSnapshotSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  name: z.string().min(1),
  memo: z.string(),
  revisionId: z.string().min(1),
  rootGraphHash: z.string().min(1),
  revisionKind: z.string().min(1),
  revisionMessage: z.string().nullable(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
});
export type ServerManuscriptSnapshot = z.infer<typeof serverManuscriptSnapshotSchema>;

const serverVersionShareLinkSchema = z.object({
  id: z.string().min(1),
  artifactId: z.string().min(1),
  snapshotId: z.string().min(1),
  snapshotName: z.string(),
  tokenSuffix: z.string(),
  permission: z.enum(["view", "comment", "edit"]),
  watermark: z.boolean(),
  hasPassword: z.boolean(),
  createdBy: z.string().min(1),
  createdAt: z.string().min(1),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ServerVersionShareLink = z.infer<typeof serverVersionShareLinkSchema>;

export interface CreateServerManuscriptSnapshotInput {
  readonly id?: string;
  readonly name?: string;
  readonly memo?: string;
  readonly revisionId: string;
  readonly createdAt?: string;
}

export interface CreateServerVersionShareInput {
  readonly id?: string;
  readonly snapshotId: string;
  readonly token: string;
  readonly permission: "view" | "comment" | "edit";
  readonly expiresInDays: number | null;
  readonly watermark: boolean;
  readonly password?: string;
}

function artifactPath(artifactId: string): string {
  return `${BASE}/artifacts/${encodeURIComponent(artifactId)}`;
}

export async function fetchServerManuscriptSnapshots(
  artifactId: string,
  signal?: AbortSignal,
): Promise<ServerManuscriptSnapshot[]> {
  const body = await api.get<unknown>(
    `${artifactPath(artifactId)}/manuscript-snapshots`,
    signal ? { signal } : undefined,
  );
  return z.array(serverManuscriptSnapshotSchema).parse(body);
}

export async function createServerManuscriptSnapshot(
  artifactId: string,
  input: CreateServerManuscriptSnapshotInput,
): Promise<ServerManuscriptSnapshot> {
  const body = await api.post<unknown>(
    `${artifactPath(artifactId)}/manuscript-snapshots`,
    input,
  );
  return serverManuscriptSnapshotSchema.parse(body);
}

export async function updateServerManuscriptSnapshotMemo(
  artifactId: string,
  snapshotId: string,
  memo: string,
): Promise<ServerManuscriptSnapshot> {
  const body = await api.patch<unknown>(
    `${artifactPath(artifactId)}/manuscript-snapshots/${encodeURIComponent(snapshotId)}`,
    { memo },
  );
  return serverManuscriptSnapshotSchema.parse(body);
}

export async function fetchServerVersionShares(
  artifactId: string,
  signal?: AbortSignal,
): Promise<ServerVersionShareLink[]> {
  const body = await api.get<unknown>(
    `${artifactPath(artifactId)}/version-shares`,
    signal ? { signal } : undefined,
  );
  return z.array(serverVersionShareLinkSchema).parse(body);
}

export async function createServerVersionShare(
  artifactId: string,
  input: CreateServerVersionShareInput,
): Promise<ServerVersionShareLink> {
  const body = await api.post<unknown>(
    `${artifactPath(artifactId)}/version-shares`,
    input,
  );
  return serverVersionShareLinkSchema.parse(body);
}

export async function revokeServerVersionShare(
  artifactId: string,
  linkId: string,
): Promise<ServerVersionShareLink> {
  const body = await api.post<unknown>(
    `${artifactPath(artifactId)}/version-shares/${encodeURIComponent(linkId)}/revoke`,
    {},
  );
  return serverVersionShareLinkSchema.parse(body);
}

const resolvedVersionShareSchema = z.object({
  kind: z.literal("ok"),
  permission: z.enum(["view", "comment", "edit"]),
  watermark: z.boolean(),
  workId: z.string().min(1),
  projectId: z.string().min(1),
  artifactId: z.string().min(1),
  artifactTitle: z.string(),
  workTitle: z.string(),
  snapshot: serverManuscriptSnapshotSchema,
  revision: z.object({
    id: z.string().min(1),
    artifactId: z.string().min(1),
    kind: z.string().min(1),
    parentIds: z.array(z.string()),
    rootGraphHash: z.string().min(1),
    operationFirst: z.number().nullable(),
    operationLast: z.number().nullable(),
    createdBy: z.string().nullable(),
    deviceId: z.string(),
    createdAt: z.string().min(1),
    message: z.string().nullable(),
  }),
});
export type ResolvedVersionShare = z.infer<typeof resolvedVersionShareSchema>;

export type VersionShareResolution =
  | { readonly status: "ok"; readonly share: ResolvedVersionShare }
  | { readonly status: "not_found" }
  | { readonly status: "revoked" }
  | { readonly status: "expired" }
  | { readonly status: "password_required" }
  | { readonly status: "password_invalid" }
  /** 비밀번호를 여러 번 틀려 서버가 잠근 상태(429). 풀릴 때까지 남은 초는 서버가 알려 준 값이다. */
  | { readonly status: "password_locked"; readonly retryAfterSeconds: number | null }
  /**
   * 같은 링크의 다른 비밀번호 확인이 처리 중이라 서버가 이번 요청을 검증하지 않고 돌려보낸 상태(429, 1초 안팎).
   * 비밀번호가 틀린 것도 잠긴 것도 아니다. 자동으로 한 번 다시 보낸 뒤에도 막혀 있을 때만 화면까지 온다.
   */
  | { readonly status: "password_busy" }
  | { readonly status: "login_required" };

/**
 * 서버 코드와 판정이 1:1 로 대응하고 추가 정보가 없는 것만 둔다. 잠금(password_locked)은 풀릴 때까지 남은 초를 함께
 * 실어야 해서 이 표 밖에서 따로 만든다. 값 형식을 VersionShareResolution["status"] 전체로 두면 추가 정보가 필요한
 * 판정까지 `{ status }` 만으로 만들 수 있는 것처럼 보여 타입 오류가 난다. Map 이라 "constructor" 같은 서버 코드가
 * 객체 프로토타입의 속성으로 해석되지도 않는다.
 */
type CodeMappedStatus =
  | "not_found"
  | "revoked"
  | "expired"
  | "password_required"
  | "password_invalid"
  | "password_busy";

const RESOLUTION_CODE_STATUS: ReadonlyMap<string, CodeMappedStatus> = new Map([
  ["version_share_not_found", "not_found"],
  ["version_share_revoked", "revoked"],
  ["version_share_expired", "expired"],
  ["version_share_password_required", "password_required"],
  ["version_share_password_invalid", "password_invalid"],
  ["version_share_password_busy", "password_busy"],
]);

const PASSWORD_BUSY_CODE = "version_share_password_busy";

function isPasswordBusyError(error: unknown): boolean {
  if (!(error instanceof HTTPError) || error.response.status !== 429) return false;
  const data: unknown = error.data;
  return typeof data === "object" && data !== null && (data as { code?: unknown }).code === PASSWORD_BUSY_CODE;
}

/**
 * 비밀번호를 실은 해석 요청의 자동 재시도 정책. 공용 읽기 정책(2회, 408·425·429·5xx·시간 초과·네트워크 오류, 총 30초)을
 * 그대로 쓰면 안 된다.
 * - 이 요청은 서버가 비밀번호 시도 횟수를 센다. 5xx·시간 초과·네트워크 오류는 서버가 검증을 마치고 오답을 이미 센 뒤에
 *   응답만 잃었을 수 있어, 자동으로 다시 보내면 사용자가 한 번 입력한 비밀번호가 두 번 틀린 것으로 세어진다.
 * - 잠금(version_share_password_locked)의 Retry-After 는 최대 900초다. 공용 정책은 maxRetryAfter(30초)만큼 기다렸다가
 *   총 시간 제한(30초)에 걸려 잠금 안내 대신 "연결 오류"를 보여 줬다(수정 전 81ms 에 끝나던 응답이 30초가 됐다).
 * 그래서 서버가 "이 요청은 검증하지 않았다"고 알린 일시 차단(version_share_password_busy, Retry-After 1초) 하나만
 * 한 번 다시 보내고, 대기는 2초로 묶는다. 그 밖의 오류는 곧바로 화면에 알린다.
 */
const PASSWORD_ATTEMPT_RETRY: NonNullable<ApiOptions["retry"]> = {
  limit: 1,
  methods: ["get"],
  statusCodes: [429],
  afterStatusCodes: [429],
  maxRetryAfter: 2_000,
  retryOnTimeout: false,
  // undefined 는 기본 판정(상태 코드 429 + Retry-After 존중)으로, false 는 재시도 없음으로 넘긴다.
  shouldRetry: ({ error }) => (isPasswordBusyError(error) ? undefined : false),
};

/**
 * 공유 링크 해석. 알려진 상태 코드는 throw하지 않고 판정값으로 돌려주고,
 * 네트워크 오류 같은 진짜 실패만 throw한다(페이지에서 재시도 안내).
 * 비밀번호는 쿼리가 아니라 헤더로 보낸다.
 */
export async function resolveVersionShare(
  token: string,
  password?: string,
  signal?: AbortSignal,
): Promise<VersionShareResolution> {
  try {
    const body = await api.get<unknown>(
      `${BASE}/version-shares/${encodeURIComponent(token)}`,
      {
        ...(signal ? { signal } : {}),
        ...(password
          ? { headers: { "x-version-share-password": password }, retry: PASSWORD_ATTEMPT_RETRY }
          : {}),
      },
    );
    return { status: "ok", share: resolvedVersionShareSchema.parse(body) };
  } catch (error) {
    if (isAppApiError(error)) {
      if (error.status === 403) return { status: "login_required" };
      // 429 전체가 아니라 이 코드만 잠금으로 본다: 일반 속도 제한은 재시도 가능한 오류 화면이 맞다.
      if (error.code === "version_share_password_locked") {
        return { status: "password_locked", retryAfterSeconds: error.retryAfterSeconds };
      }
      const mapped = error.code ? RESOLUTION_CODE_STATUS.get(error.code) : undefined;
      if (mapped) return { status: mapped };
    }
    throw error;
  }
}
