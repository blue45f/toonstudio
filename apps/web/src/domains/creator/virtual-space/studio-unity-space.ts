import { z } from "zod";

import { api, apiFetch, apiPath, httpStatus, toApiError } from "@/platform/api";

/**
 * Unity 가상스튜디오 공간 정의 포맷 v1의 셸 측 계약 (4단계 — 월드 저작).
 *
 * 정의의 정본 흐름: 정적 기본값(spaces.json, 무대 내장 정의와 동일 생성) →
 * 작품별 저장본(Core API)이 있으면 그것이 우선 → 편집 저장 시 API로 되돌리고
 * 실시간 채널에는 revision 알림만 흐른다. Unity 무대는 이 정의의 소비자다.
 */

export const UnitySpaceZoneKindSchema = z.enum([
  "meeting",
  "presentation",
  "focus",
  "lounge",
  "open",
]);
export type UnitySpaceZoneKind = z.infer<typeof UnitySpaceZoneKindSchema>;

export const UnitySpacePropKindSchema = z.enum([
  "desk",
  "bench",
  "plant",
  "board",
  "storefront",
  "stage",
  "tree",
  "lamp",
  "table",
  "crosswalk",
  "sign",
  "rug",
  // Creator Bundle 확장 소품 (studio-unity-bundle-catalog.ts의
  // UNITY_BUNDLE_PROP_KIND_EXTENSIONS와 동기 — 번들 인제스션 후 무대
  // 프리팹이 연결되며, 그 전까지 무대는 폴백 표현으로 배치만 허용한다).
  "barrel",
  "bed",
  "boat",
  "bridge-prop",
  "bush",
  "cabinet",
  "candle",
  "car",
  "chair",
  "counter",
  "crate",
  "crystal",
  "explosive",
  "fence",
  "flower",
  "food",
  "gate",
  "kitchenware",
  "machine",
  "mushroom",
  "planet",
  "pumpkin",
  "rock",
  "shelf",
  "shield",
  "sofa",
  "statue",
  "stump",
  "tent",
  "tombstone",
  "truck",
  "weapon",
]);
export type UnitySpacePropKind = z.infer<typeof UnitySpacePropKindSchema>;

const rectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const UnitySpaceDefinitionSchema = z.object({
  v: z.literal(1),
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  size: z.tuple([z.number(), z.number()]),
  door: z.tuple([z.number(), z.number()]).optional(),
  floor: z.string().max(32).optional(),
  background: z
    .object({
      glb: z.string().max(96),
      hideNodes: z.array(z.string().max(64)).max(16).optional(),
      camHeight: z.number().optional(),
      camDist: z.number().optional(),
      camFov: z.number().optional(),
      camTargetLead: z.number().optional(),
      yaw: z.number().optional(),
    })
    .nullable()
    .optional(),
  zones: z
    .array(
      z.object({
        id: z.string().max(48),
        kind: UnitySpaceZoneKindSchema,
        name: z.string().max(80),
        rect: rectSchema,
      }),
    )
    .max(24),
  props: z
    .array(
      z.object({
        kind: UnitySpacePropKindSchema,
        name: z.string().max(80).optional(),
        rect: rectSchema,
      }),
    )
    .max(64),
  // NPC 로컬 연출 정의 (표면 회귀 복구). API 검증 계약과 같은 상한.
  npcs: z
    .array(
      z.object({
        name: z.string().min(1).max(20),
        role: z.string().max(20).optional(),
        skin: z.string().max(64).optional(),
        color: z.string().max(32).optional(),
        points: z
          .array(z.tuple([z.number(), z.number()]))
          .min(2)
          .max(16),
        lines: z.array(z.string().max(60)).max(12).optional(),
      }),
    )
    .max(6)
    .optional(),
});
export type UnitySpaceDefinition = z.infer<typeof UnitySpaceDefinitionSchema>;

export interface UnitySpaceLayout {
  readonly definition: UnitySpaceDefinition;
  readonly revision: number;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
}

const UnitySpaceLayoutResponseSchema = z.object({
  workId: z.string(),
  spaceId: z.string(),
  definition: UnitySpaceDefinitionSchema,
  revision: z.number().int().nonnegative(),
  updatedByUserId: z.string(),
  updatedAt: z.string(),
});

const UnitySpaceCatalogSchema = z.object({
  v: z.literal(1),
  spaces: z.array(UnitySpaceDefinitionSchema).min(1),
});

/** 정적 기본 정의 카탈로그 (/unity-space/spaces.json — 빌드와 함께 배포된다). */
export async function fetchUnitySpaceCatalog(
  signal?: AbortSignal,
): Promise<readonly UnitySpaceDefinition[]> {
  const response = await fetch("/unity-space/spaces.json", { signal });
  if (!response.ok) {
    throw new Error(`공간 카탈로그를 불러오지 못했습니다 (${response.status}).`);
  }
  const parsed = UnitySpaceCatalogSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("공간 카탈로그 형식이 올바르지 않습니다.");
  }
  return parsed.data.spaces;
}

/**
 * 작품별 저장 정의를 조회한다. 저장본이 없으면(404) null — 오류가 아니라
 * "아직 기본 정의를 쓰는 중"이라는 정상 상태다.
 */
export async function fetchUnitySpaceLayout(
  workId: string,
  spaceId: string,
  signal?: AbortSignal,
): Promise<UnitySpaceLayout | null> {
  try {
    const raw = await api.get<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/godot-space-layouts/${encodeURIComponent(spaceId)}`,
      { signal, timeout: 10_000 },
    );
    const parsed = UnitySpaceLayoutResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("서버가 올바른 공간 정의를 반환하지 않았습니다.");
    }
    return {
      definition: parsed.data.definition,
      revision: parsed.data.revision,
      updatedByUserId: parsed.data.updatedByUserId,
      updatedAt: parsed.data.updatedAt,
    };
  } catch (error) {
    if (httpStatus(error) === 404) return null;
    throw await toApiError(error, "저장된 공간 정의를 불러오지 못했습니다.");
  }
}

/** 저장 실패가 revision 충돌(409)인지 — 셸이 재조회 동선을 제시하는 데 쓴다. */
export function isUnitySpaceLayoutConflict(error: unknown): boolean {
  return httpStatus(error) === 409;
}

// ── 배경 GLB 업로드 (DESIGN §14) ────────────────────────────────────
//
// 저장 정의의 background.glb는 `uploads/<assetId>.glb` 참조만 싣는다.
// 무대(Unity)는 인증 헤더를 실을 수 없고 같은 오리진의 정적 자산만
// 상대 경로로 읽으므로, 셸이 무대 주입 시점에만 참조를 API content
// 절대 URL로 바꾼 사본을 만든다. 저장 정본은 항상 참조 형태이며,
// 무대가 편집 결과를 되돌려 보낼 때는 역변환으로 정본을 복원한다.

export interface UnitySpaceBackgroundAsset {
  readonly assetId: string;
  readonly glbRef: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly uploadedByUserId: string;
  readonly createdAt: string;
}

const UnitySpaceBackgroundAssetSchema = z.object({
  assetId: z.string(),
  glbRef: z.string(),
  fileName: z.string(),
  byteSize: z.number(),
  sha256: z.string(),
  uploadedByUserId: z.string(),
  createdAt: z.string(),
});

const UPLOADED_BACKGROUND_REF_PATTERN =
  /^uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.glb$/;

export function unitySpaceBackgroundContentUrl(
  workId: string,
  assetId: string,
): string {
  const path = apiPath(
    `/creator/works/${encodeURIComponent(workId)}/godot-space-backgrounds/${encodeURIComponent(assetId)}/content`,
  );
  if (/^https?:\/\//iu.test(path)) return path;
  const origin =
    typeof window !== "undefined" && globalThis.location?.origin
      ? globalThis.location.origin
      : "http://localhost";
  return new URL(path, origin).href;
}

/** 무대 임베드 base 경로. 무대는 상대 참조를 origin 루트에 붙여 해석하므로
 *  (2026-10-13 운영 실측: `spaces/studio-room.glb`를 `/spaces/...`로 요청해
 *  SPA fallback HTML을 받아 glTF 파싱이 깨졌다), 정적 기본 배경은 아래에서
 *  이 base를 앞에 붙인 절대 경로로 넘긴다. */
export const UNITY_STAGE_BASE_PATH = "/unity-space/";

/** 무대 주입용 사본: uploads/ 참조를 content 절대 URL로, 정적 기본 배경의
 *  상대 참조를 스테이지 base 절대 경로로 바꾼다. */
export function resolveUnityBackgroundForStage(
  definition: UnitySpaceDefinition,
  workId: string,
): UnitySpaceDefinition {
  const background = definition.background;
  if (!background) return definition;
  const match = UPLOADED_BACKGROUND_REF_PATTERN.exec(background.glb);
  if (!match) {
    if (
      background.glb
      && !background.glb.startsWith("/")
      && !/^[a-z][a-z0-9+.-]*:/iu.test(background.glb)
    ) {
      return {
        ...definition,
        background: {
          ...background,
          glb: `${UNITY_STAGE_BASE_PATH}${background.glb}`,
        },
      };
    }
    return definition;
  }
  return {
    ...definition,
    background: {
      ...background,
      glb: unitySpaceBackgroundContentUrl(workId, match[1]),
    },
  };
}

/** 무대 회신 복원: content 절대 URL을 uploads/ 정본 참조로 되돌린다. */
export function restoreUnityBackgroundReference(
  definition: UnitySpaceDefinition,
  workId: string,
): UnitySpaceDefinition {
  const background = definition.background;
  if (!background) return definition;
  const glb = background.glb;
  if (glb.startsWith(UNITY_STAGE_BASE_PATH)) {
    const rest = glb.slice(UNITY_STAGE_BASE_PATH.length);
    if (rest && !rest.startsWith("/") && !/^[a-z][a-z0-9+.-]*:/iu.test(rest)) {
      return { ...definition, background: { ...background, glb: rest } };
    }
    return definition;
  }
  if (!glb.startsWith("http")) return definition;
  const marker = `/creator/works/${encodeURIComponent(workId)}/godot-space-backgrounds/`;
  const markerIndex = glb.indexOf(marker);
  if (markerIndex < 0) return definition;
  const tail = glb.slice(markerIndex + marker.length);
  const assetMatch =
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/content(?:[?#].*)?$/u.exec(
      tail,
    );
  if (!assetMatch) return definition;
  return {
    ...definition,
    background: { ...background, glb: `uploads/${assetMatch[1]}.glb` },
  };
}

export async function fetchUnitySpaceBackgrounds(
  workId: string,
  signal?: AbortSignal,
): Promise<readonly UnitySpaceBackgroundAsset[]> {
  try {
    const raw = await api.get<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/godot-space-backgrounds`,
      { signal, timeout: 10_000 },
    );
    const parsed = z.array(UnitySpaceBackgroundAssetSchema).safeParse(raw);
    if (!parsed.success) {
      throw new Error("서버가 올바른 배경 목록을 반환하지 않았습니다.");
    }
    return parsed.data;
  } catch (error) {
    throw await toApiError(error, "업로드한 배경 목록을 불러오지 못했습니다.");
  }
}

export async function uploadUnitySpaceBackground(
  workId: string,
  file: File,
): Promise<UnitySpaceBackgroundAsset> {
  const form = new FormData();
  form.append("file", file);
  const response = await apiFetch(
    `/creator/works/${encodeURIComponent(workId)}/godot-space-backgrounds`,
    { method: "POST", body: form },
  );
  if (!response.ok) {
    // 서버 검증 사유(형식·압축 확장·용량)는 그대로 사용자에게 보여야
    // 다시보내기 방향을 알 수 있다 — Nest 오류 본문의 message를 우선한다.
    let message = `배경을 올리지 못했습니다 (${response.status}).`;
    try {
      const body = (await response.json()) as { message?: unknown };
      if (typeof body.message === "string" && body.message.length > 0) {
        message = body.message;
      }
    } catch {
      // 본문이 JSON이 아니면 기본 문구를 쓴다.
    }
    throw new Error(message);
  }
  const parsed = UnitySpaceBackgroundAssetSchema.safeParse(
    await response.json(),
  );
  if (!parsed.success) {
    throw new Error("서버가 올바른 업로드 결과를 반환하지 않았습니다.");
  }
  return parsed.data;
}

export async function deleteUnitySpaceBackground(
  workId: string,
  assetId: string,
): Promise<void> {
  try {
    await api.delete(
      `/creator/works/${encodeURIComponent(workId)}/godot-space-backgrounds/${encodeURIComponent(assetId)}`,
      { timeout: 10_000 },
    );
  } catch (error) {
    throw await toApiError(error, "배경을 지우지 못했습니다.");
  }
}

export async function saveUnitySpaceLayout(
  workId: string,
  spaceId: string,
  definition: UnitySpaceDefinition,
  expectedRevision: number,
): Promise<UnitySpaceLayout> {
  try {
    const raw = await api.put<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/godot-space-layouts/${encodeURIComponent(spaceId)}`,
      { definition, expectedRevision },
      { timeout: 10_000 },
    );
    const parsed = UnitySpaceLayoutResponseSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error("서버가 올바른 저장 결과를 반환하지 않았습니다.");
    }
    return {
      definition: parsed.data.definition,
      revision: parsed.data.revision,
      updatedByUserId: parsed.data.updatedByUserId,
      updatedAt: parsed.data.updatedAt,
    };
  } catch (error) {
    throw await toApiError(error, "공간 정의를 저장하지 못했습니다.");
  }
}
