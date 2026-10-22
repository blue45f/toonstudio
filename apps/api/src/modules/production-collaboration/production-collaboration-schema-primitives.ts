/**
 * Production 협업 DTO — 공용 스키마 원시값(식별자·텍스트·시각·다이제스트).
 *
 * `production-collaboration.dto.ts`와 분리 파일들이 함께 쓰는 최소 단위 스키마.
 */

import { z } from "zod";

import { PRODUCTION_SCOPE_KINDS } from "../../../../../packages/core/src/production";

export const IdentitySchema = z.string().trim().min(1).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/u);
export const HumanTextSchema = z.string().trim().min(1).max(4_000);
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const NullableIsoDateTimeSchema = IsoDateTimeSchema.nullable();
export const DigestSchema = z.string().regex(/^(?:fnv1a64:[0-9a-f]{16}|sha256:[0-9a-f]{64})$/u);
export const MutationIdSchema = z.string().uuid();
export const RevisionNumberSchema = z.number().int().min(0).max(2_147_483_647);

const ScopeAncestorSchema = z.object({
  kind: z.enum(PRODUCTION_SCOPE_KINDS).exclude(["deliverable"]),
  id: IdentitySchema,
}).strict();

export const ProductionScopeRefSchema = z.object({
  kind: z.enum(PRODUCTION_SCOPE_KINDS),
  id: IdentitySchema,
  ancestors: z.array(ScopeAncestorSchema).max(8),
}).strict();

export const ProductionRevisionRefSchema = z.object({
  id: IdentitySchema,
  lineage: z.enum(["narrative", "visual", "integrated"]),
  revision: z.number().int().min(1).max(2_147_483_647),
  digest: DigestSchema,
  createdAt: IsoDateTimeSchema,
}).strict();

