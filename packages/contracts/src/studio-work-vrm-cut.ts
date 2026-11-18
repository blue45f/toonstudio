import { z } from "zod";

import { isStudioVrmProjectArchiveUseContextReceipt, type StudioVrmProjectArchiveUseContextReceipt } from "./studio-vrm-archive-rights";
import { StudioWorkAssetDescriptorSchema, type StudioWorkAssetManifest } from "./studio-work-asset-contract";

export const WORK_VRM_CUT_SCENE_BYTES = 2 * 1024 * 1024;
export const WORK_VRM_CUT_BODY_BYTES = 32 * 1024 * 1024;
export const WORK_VRM_CUT_MAX_ATTACHMENTS = 12;
export const WorkVrmCutAnchorSchema = z.string().regex(/^vrmcut-[0-9a-f]{8}-[0-9a-f]{4}-[48][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
const digest = z.string().regex(/^[0-9a-f]{64}$/u);
export const WorkVrmCutMetadataSchema = z.object({
  version: z.literal(1),
  pageId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,159}$/u),
  descriptor: StudioWorkAssetDescriptorSchema,
  sceneSha256: digest,
  compositeSha256: digest,
  bundledModels: z.array(z.object({ id: z.string().min(1).max(128), sha256: digest }).strict()).max(12),
  rights: z.custom<StudioVrmProjectArchiveUseContextReceipt>(isStudioVrmProjectArchiveUseContextReceipt).optional(),
}).strict();
export type WorkVrmCutMetadata = z.infer<typeof WorkVrmCutMetadataSchema>;
export interface WorkVrmCutAttachment {
  readonly sha256: string;
  readonly byteSize: number;
  readonly elementType: "vrm" | "image";
  readonly assetId: string;
}
export interface WorkVrmCutReceipt {
  readonly version: 1;
  readonly workId: string;
  readonly pageId: string;
  readonly anchorId: string;
  readonly sceneSha256: string;
  readonly compositeSha256: string;
  readonly scene: Record<string, unknown>;
  readonly attachments: readonly WorkVrmCutAttachment[];
  readonly bundledModels: WorkVrmCutMetadata["bundledModels"];
  readonly manifest: StudioWorkAssetManifest;
}
export function isWorkVrmCutReservedAssetId(id: string): boolean {
  return id.startsWith("vrmcut-");
}
