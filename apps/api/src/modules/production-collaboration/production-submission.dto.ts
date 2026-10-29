import { z } from "zod";
import { StudioScopedWriteContextSchema } from "@toonstudio/contracts/studio-scoped-write";

import { PRODUCTION_STUDIO_DOCUMENT_ROLES } from "../../../../../packages/core/src/production";
import { studioReviewCaptureSubjectSchema } from "../studio-project-graph/studio-review-capture-subject";
import {
  HumanTextSchema,
  IdentitySchema,
  IsoDateTimeSchema,
  NullableIsoDateTimeSchema,
  ProductionRevisionRefSchema,
  ProductionScopeRefSchema,
} from "./production-collaboration-schema-primitives";

const Sha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);
const AuthoringIdentitySchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u);
const OrdinalSchema = z.number().int().min(0).max(99_999);
const SourceServerRevisionSchema = z.number().int().min(1).max(2_147_483_647);
const CaptureSequenceSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

export const ProductionTaskOutputSubjectSchema = studioReviewCaptureSubjectSchema;

const CaptureInputSchema = z.object({ subject: ProductionTaskOutputSubjectSchema }).strict();
const PageSelectionSchema = z.object({ pageId: AuthoringIdentitySchema, ordinal: OrdinalSchema }).strict();
const FrameSelectionSchema = PageSelectionSchema.extend({
  frameIds: z.array(AuthoringIdentitySchema).min(1).max(100_000),
}).strict();
const SelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("document") }).strict(),
  z.object({ mode: z.literal("pages"), pages: z.array(PageSelectionSchema).min(1).max(100_000) }).strict(),
  z.object({ mode: z.literal("frames"), pages: z.array(FrameSelectionSchema).min(1).max(100_000) }).strict(),
]);

export const ProductionTaskOutputEvidenceSchema = z.object({
  version: z.literal(1),
  kind: z.literal("studio-review-capture"),
  taskId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  documentRole: z.enum(PRODUCTION_STUDIO_DOCUMENT_ROLES),
  subject: ProductionTaskOutputSubjectSchema,
  sourceServerRevision: SourceServerRevisionSchema,
  captureSequence: CaptureSequenceSchema,
  selectionMode: z.enum(["document", "pages", "frames"]),
  pages: z.array(z.object({
    pageId: AuthoringIdentitySchema,
    ordinal: OrdinalSchema,
    sha256: Sha256Schema,
    frameIds: z.array(AuthoringIdentitySchema).max(100_000),
  }).strict()).min(1).max(100_000),
}).strict();

export const DeliverableSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  scope: ProductionScopeRefSchema,
  type: z.string().trim().min(1).max(120),
  expectedFormat: z.string().trim().min(1).max(240),
  completionCriteria: z.array(HumanTextSchema).min(1).max(1_000),
  currentSubmissionId: IdentitySchema.nullable(),
  approvedSubmissionId: IdentitySchema.nullable(),
}).strict();

export const SubmissionSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  deliverableId: IdentitySchema,
  revisionRef: ProductionRevisionRefSchema,
  submittedByAssignmentId: IdentitySchema,
  submittedAt: IsoDateTimeSchema,
  status: z.enum(["submitted", "in-review", "changes-requested", "approved", "superseded"]),
  inputRevisionRefs: z.array(ProductionRevisionRefSchema).min(1).max(100_000),
  evidenceRefs: z.array(IdentitySchema).max(100_000),
  sourceEvidence: ProductionTaskOutputEvidenceSchema.optional(),
}).strict();

export const ProductionStudioRevisionLinkSchema = z.object({
  id: IdentitySchema,
  projectId: IdentitySchema,
  workId: IdentitySchema,
  episodeId: IdentitySchema.nullable(),
  studioDocumentRef: z.string().trim().min(1).max(500),
  documentRole: z.enum(PRODUCTION_STUDIO_DOCUMENT_ROLES),
  studioRevisionRef: ProductionRevisionRefSchema,
  deliverableId: IdentitySchema,
  submissionId: IdentitySchema,
  linkedByAssignmentId: IdentitySchema,
  status: z.enum(["submitted", "approved", "superseded"]),
  linkedAt: IsoDateTimeSchema,
  approvedAt: NullableIsoDateTimeSchema,
}).strict();

export const UpsertDeliverableCommandSchema = z.object({
  type: z.literal("upsert-deliverable"), deliverable: DeliverableSchema,
}).strict();
export const UpsertSubmissionCommandSchema = z.object({
  type: z.literal("upsert-submission"), submission: SubmissionSchema,
}).strict();
export const UpsertStudioRevisionLinkCommandSchema = z.object({
  type: z.literal("upsert-studio-revision-link"), link: ProductionStudioRevisionLinkSchema,
}).strict();

export const SubmitProductionTaskOutputCommandSchema = z.object({
  type: z.literal("submit-task-output"),
  taskId: IdentitySchema,
  submissionId: IdentitySchema,
  submittedByAssignmentId: IdentitySchema,
  documentRole: z.enum(PRODUCTION_STUDIO_DOCUMENT_ROLES),
  writeContext: StudioScopedWriteContextSchema.optional(),
  source: CaptureInputSchema,
  selection: SelectionSchema,
  inputs: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("current") }).strict(),
    z.object({ mode: z.literal("approved-dependencies") }).strict(),
    z.object({ mode: z.literal("initial-capture"), source: CaptureInputSchema }).strict(),
  ]),
  target: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("existing"), deliverableId: IdentitySchema }).strict(),
    z.object({
      kind: z.literal("create"), deliverableId: IdentitySchema,
      type: z.string().trim().min(1).max(120),
      expectedFormat: z.string().trim().min(1).max(240),
      completionCriteria: z.array(HumanTextSchema).min(1).max(1_000),
    }).strict(),
  ]),
}).strict();
