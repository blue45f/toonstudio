import { z } from "zod";

/**
 * Godot 가상스튜디오 공간 정의 포맷 v1의 서버 검증 계약.
 *
 * 클라이언트(VsSpaces.normalize)와 같은 상한을 쓰되, 서버는 조용히
 * 잘라내지 않고 잘못된 입력을 400으로 거절한다 — 저장되는 정의가
 * 조용히 달라지면 편집자마다 다른 방을 보게 되기 때문이다.
 *
 * background.glb는 같은 오리진의 spaces/ 아래 정적 자산만 허용한다.
 * 임의 URL을 허용하면 공간 정의가 외부 리소스 로딩 벡터가 된다.
 */

const idPattern = /^[a-z0-9-]+$/;

const rectSchema = z.tuple([
  z.number().finite().min(0).max(4000),
  z.number().finite().min(0).max(4000),
  z.number().finite().min(24).max(4000),
  z.number().finite().min(24).max(4000),
]);

export const GodotSpaceZoneKindSchema = z.enum([
  "meeting",
  "presentation",
  "focus",
  "lounge",
  "open",
]);

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

export const GodotSpaceDefinitionSchema = z.object({
  v: z.literal(1),
  id: z.string().regex(idPattern).min(1).max(64),
  name: z.string().trim().min(1).max(80),
  size: z.tuple([
    z.number().finite().min(400).max(4000),
    z.number().finite().min(400).max(4000),
  ]),
  door: z
    .tuple([z.number().finite().min(0).max(4000), z.number().finite().min(0).max(4000)])
    .optional(),
  floor: z.string().trim().max(32).optional(),
  background: z
    .object({
      glb: z.string().regex(/^spaces\/[a-z0-9-]+\.glb$/).max(96),
      hideNodes: z.array(z.string().trim().min(1).max(64)).max(16).optional(),
      camHeight: z.number().finite().min(2).max(40).optional(),
      camDist: z.number().finite().min(2).max(60).optional(),
      camFov: z.number().finite().min(20).max(90).optional(),
      camTargetLead: z.number().finite().min(-6).max(6).optional(),
      yaw: z.number().finite().min(-360).max(360).optional(),
    })
    .nullable()
    .optional(),
  zones: z
    .array(
      z.object({
        id: z.string().regex(idPattern).min(1).max(48),
        kind: GodotSpaceZoneKindSchema,
        name: z.string().trim().min(1).max(80),
        rect: rectSchema,
      }),
    )
    .max(24),
  props: z
    .array(
      z.object({
        kind: GodotSpacePropKindSchema,
        name: z.string().trim().max(80).optional(),
        rect: rectSchema,
      }),
    )
    .max(64),
  // NPC는 무대 로컬 연출 정의다 (프레즌스 아님 — 표면 회귀 복구). 선택
  // 필드라 기존 저장본·구 클라이언트와 호환된다.
  npcs: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(20),
        role: z.string().trim().max(20).optional(),
        skin: z.string().trim().max(64).optional(),
        color: z.string().trim().max(32).optional(),
        points: z
          .array(
            z.tuple([
              z.number().finite().min(0).max(4000),
              z.number().finite().min(0).max(4000),
            ]),
          )
          .min(2)
          .max(16),
        lines: z.array(z.string().trim().max(60)).max(12).optional(),
      }),
    )
    .max(6)
    .optional(),
});

export type GodotSpaceDefinition = z.infer<typeof GodotSpaceDefinitionSchema>;

export const GodotSpaceLayoutParamsSchema = z.object({
  workId: z.string().trim().min(1).max(128),
  spaceId: z.string().regex(idPattern).min(1).max(64),
});

export type GodotSpaceLayoutParams = z.infer<typeof GodotSpaceLayoutParamsSchema>;

export const SaveGodotSpaceLayoutBodySchema = z.object({
  definition: GodotSpaceDefinitionSchema,
  expectedRevision: z.number().int().min(0).max(1_000_000),
});

export type SaveGodotSpaceLayoutBody = z.infer<typeof SaveGodotSpaceLayoutBodySchema>;

export interface GodotSpaceLayoutDto {
  workId: string;
  spaceId: string;
  definition: GodotSpaceDefinition;
  revision: number;
  updatedByUserId: string;
  updatedAt: string;
}
