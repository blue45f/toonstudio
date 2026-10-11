import { z } from "zod";

import { api, httpStatus, toApiError } from "@/platform/api";

/**
 * Godot 가상스튜디오 공간 정의 포맷 v1의 셸 측 계약 (4단계 — 월드 저작).
 *
 * 정의의 정본 흐름: 정적 기본값(spaces.json, Godot 내장 정의와 동일 생성) →
 * 작품별 저장본(Core API)이 있으면 그것이 우선 → 편집 저장 시 API로 되돌리고
 * 실시간 채널에는 revision 알림만 흐른다. Godot 무대는 이 정의의 소비자다.
 */

export const GodotSpaceZoneKindSchema = z.enum([
  "meeting",
  "presentation",
  "focus",
  "lounge",
  "open",
]);
export type GodotSpaceZoneKind = z.infer<typeof GodotSpaceZoneKindSchema>;

export const GodotSpacePropKindSchema = z.enum([
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
]);
export type GodotSpacePropKind = z.infer<typeof GodotSpacePropKindSchema>;

const rectSchema = z.tuple([z.number(), z.number(), z.number(), z.number()]);

export const GodotSpaceDefinitionSchema = z.object({
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
      yaw: z.number().optional(),
    })
    .nullable()
    .optional(),
  zones: z
    .array(
      z.object({
        id: z.string().max(48),
        kind: GodotSpaceZoneKindSchema,
        name: z.string().max(80),
        rect: rectSchema,
      }),
    )
    .max(24),
  props: z
    .array(
      z.object({
        kind: GodotSpacePropKindSchema,
        name: z.string().max(80).optional(),
        rect: rectSchema,
      }),
    )
    .max(64),
});
export type GodotSpaceDefinition = z.infer<typeof GodotSpaceDefinitionSchema>;

export interface GodotSpaceLayout {
  readonly definition: GodotSpaceDefinition;
  readonly revision: number;
  readonly updatedByUserId: string;
  readonly updatedAt: string;
}

const GodotSpaceLayoutResponseSchema = z.object({
  workId: z.string(),
  spaceId: z.string(),
  definition: GodotSpaceDefinitionSchema,
  revision: z.number().int().nonnegative(),
  updatedByUserId: z.string(),
  updatedAt: z.string(),
});

const GodotSpaceCatalogSchema = z.object({
  v: z.literal(1),
  spaces: z.array(GodotSpaceDefinitionSchema).min(1),
});

/** 정적 기본 정의 카탈로그 (/godot-space/spaces.json — 빌드와 함께 배포된다). */
export async function fetchGodotSpaceCatalog(
  signal?: AbortSignal,
): Promise<readonly GodotSpaceDefinition[]> {
  const response = await fetch("/godot-space/spaces.json", { signal });
  if (!response.ok) {
    throw new Error(`공간 카탈로그를 불러오지 못했습니다 (${response.status}).`);
  }
  const parsed = GodotSpaceCatalogSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("공간 카탈로그 형식이 올바르지 않습니다.");
  }
  return parsed.data.spaces;
}

/**
 * 작품별 저장 정의를 조회한다. 저장본이 없으면(404) null — 오류가 아니라
 * "아직 기본 정의를 쓰는 중"이라는 정상 상태다.
 */
export async function fetchGodotSpaceLayout(
  workId: string,
  spaceId: string,
  signal?: AbortSignal,
): Promise<GodotSpaceLayout | null> {
  try {
    const raw = await api.get<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/godot-space-layouts/${encodeURIComponent(spaceId)}`,
      { signal, timeout: 10_000 },
    );
    const parsed = GodotSpaceLayoutResponseSchema.safeParse(raw);
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
export function isGodotSpaceLayoutConflict(error: unknown): boolean {
  return httpStatus(error) === 409;
}

export async function saveGodotSpaceLayout(
  workId: string,
  spaceId: string,
  definition: GodotSpaceDefinition,
  expectedRevision: number,
): Promise<GodotSpaceLayout> {
  try {
    const raw = await api.put<unknown>(
      `/creator/works/${encodeURIComponent(workId)}/godot-space-layouts/${encodeURIComponent(spaceId)}`,
      { definition, expectedRevision },
      { timeout: 10_000 },
    );
    const parsed = GodotSpaceLayoutResponseSchema.safeParse(raw);
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
