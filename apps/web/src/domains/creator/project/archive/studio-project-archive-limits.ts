import { STUDIO_PROJECT_ARCHIVE_LIMITS, fail } from "../../studio-project-archive";
import type { StudioProjectArchiveLimits } from "../../studio-project-archive";

/** 새 bundle 문서에만 적용한다. 기존 파일의 한도와 픽셀은 변경하지 않는다. */
export const STUDIO_PROJECT_ARCHIVE_BUNDLE_MAX_BYTES = 544 * 1024 * 1024;
export const STUDIO_PROJECT_ARCHIVE_BUNDLE_ATTACHMENT_MAX_BYTES = 512 * 1024 * 1024;

type StudioProjectArchiveLimitLabelCode =
  | "archive"
  | "attachment"
  | "attachmentTotal"
  | "projectJson"
  | "manifestJson"
  | "attachmentCount"
  | "referenceCount"
  | "path"
  | "jsonDepth"
  | "jsonNodeCount";

function resolvePositiveLimit(
  value: number | undefined,
  hardMaximum: number,
  labelCode: StudioProjectArchiveLimitLabelCode
): number {
  if (value === undefined) return hardMaximum;
  if (!Number.isSafeInteger(value) || value <= 0 || value > hardMaximum) {
    fail("ARCHIVE_INVALID", "limitInvalid", {}, { labelCode });
  }
  return value;
}

export function resolveStudioProjectArchiveLimits(value: Partial<StudioProjectArchiveLimits> | undefined, bundleV5 = false): StudioProjectArchiveLimits {
  const hard = bundleV5 ? { ...STUDIO_PROJECT_ARCHIVE_LIMITS, maxArchiveBytes: STUDIO_PROJECT_ARCHIVE_BUNDLE_MAX_BYTES, maxTotalAttachmentBytes: STUDIO_PROJECT_ARCHIVE_BUNDLE_ATTACHMENT_MAX_BYTES } : STUDIO_PROJECT_ARCHIVE_LIMITS;
  return {
    maxArchiveBytes: resolvePositiveLimit(
      value?.maxArchiveBytes,
      hard.maxArchiveBytes,
      "archive"
    ),
    maxAttachmentBytes: resolvePositiveLimit(
      value?.maxAttachmentBytes,
      hard.maxAttachmentBytes,
      "attachment"
    ),
    maxTotalAttachmentBytes: resolvePositiveLimit(
      value?.maxTotalAttachmentBytes,
      hard.maxTotalAttachmentBytes,
      "attachmentTotal"
    ),
    maxProjectBytes: resolvePositiveLimit(
      value?.maxProjectBytes,
      hard.maxProjectBytes,
      "projectJson"
    ),
    maxManifestBytes: resolvePositiveLimit(
      value?.maxManifestBytes,
      hard.maxManifestBytes,
      "manifestJson"
    ),
    maxAttachments: resolvePositiveLimit(
      value?.maxAttachments,
      hard.maxAttachments,
      "attachmentCount"
    ),
    maxReferences: resolvePositiveLimit(
      value?.maxReferences,
      hard.maxReferences,
      "referenceCount"
    ),
    maxPathBytes: resolvePositiveLimit(
      value?.maxPathBytes,
      hard.maxPathBytes,
      "path"
    ),
    maxDepth: resolvePositiveLimit(
      value?.maxDepth,
      hard.maxDepth,
      "jsonDepth"
    ),
    maxJsonNodes: resolvePositiveLimit(
      value?.maxJsonNodes,
      hard.maxJsonNodes,
      "jsonNodeCount"
    ),
  };
}

