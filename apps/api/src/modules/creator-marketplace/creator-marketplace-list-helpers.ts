import { createHash } from "node:crypto";

import {
  CreatorMarketplaceOwnedReleaseSchema,
  CreatorMarketplacePublicManifestSchema,
  CreatorMarketplaceResourceRecordSchema,
  CreatorMarketplaceStoredResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "@toonstudio/contracts/creator-marketplace-resource-contract";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@toonstudio/contracts/creator-marketplace-starter-catalog";

import type {
  CreatorMarketplaceLifecycleStoredRow,
  CreatorMarketplaceModerationStoredRow,
  CreatorMarketplaceResourceCursor,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";
import type {
  CreatorMarketplaceOwnedRelease,
  CreatorMarketplaceResourceEngine,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceResourceModerationQueuePage,
  CreatorMarketplaceResourceProvenanceOrigin,
  CreatorMarketplaceResourceRecord,
} from "@toonstudio/contracts/creator-marketplace-resource-contract";

export interface CreatorMarketplaceListCandidate {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly createdAtMs: number;
  readonly idKey: string;
  readonly relevanceScore: number;
}

export function creatorMarketplaceFailureReasonCode(error: unknown): string {
  try {
    if (error && typeof error === "object") {
      const code = Reflect.get(error, "code");
      if (
        typeof code === "string" &&
        (/^[0-9A-Z]{5}$/u.test(code) || /^E[A-Z0-9_]{1,63}$/u.test(code))
      ) {
        return code;
      }
    }
  } catch {
    return "uninspectable-error";
  }
  if (error instanceof Error) {
    return "Error";
  }
  return typeof error;
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * 공식 스타터 레코드의 검색 점수 — 레포지토리의 relevance SQL과 같은 가중을 쓴다.
 * 공개 목록 병합에서 DB 행과 스타터를 한 축으로 정렬하기 위한 것이다.
 */
export function starterRelevanceScore(
  record: CreatorMarketplaceResourceRecord,
  search: string,
): number {
  const needle = search.toLowerCase();
  const name = record.name.toLowerCase();
  const packageId = record.packageId.toLowerCase();
  let score = 0;
  if (name === needle) score += 1200;
  if (packageId === needle) score += 1000;
  if (record.tags.some((tag) => tag.toLowerCase() === needle)) score += 800;
  if (name.startsWith(needle)) score += 600;
  if (packageId.startsWith(needle)) score += 500;
  if (name.includes(needle)) score += 400;
  if (packageId.includes(needle)) score += 300;
  if (record.description.toLowerCase().includes(needle)) score += 160;
  if (JSON.stringify(record.tags).toLowerCase().includes(needle)) score += 80;
  return score;
}

/**
 * 공개 목록 필터와 같은 규칙으로 스타터 카탈로그를 후보로 만든다.
 * 필터 의미는 contracts의 filterStarterMarketplaceResources와 맞춘다.
 */
export function starterListCandidates(input: {
  publisherId?: string;
  search?: string;
  tag?: string;
  kind?: string;
  license?: string;
  containsAi?: boolean;
  engine?: CreatorMarketplaceResourceEngine;
  commercial?: boolean;
  origin?: CreatorMarketplaceResourceProvenanceOrigin;
  sort: "newest" | "relevance";
}): CreatorMarketplaceListCandidate[] {
  let records = CREATOR_MARKETPLACE_STARTER_RECORDS;
  if (input.kind) {
    records = records.filter((record) => record.kind === input.kind);
  }
  if (input.license) {
    records = records.filter((record) => record.license === input.license);
  }
  if (input.containsAi !== undefined) {
    records = records.filter((record) => record.containsAi === input.containsAi);
  }
  if (input.engine) {
    records = records.filter((record) =>
      record.compatibility.engines.includes(input.engine!),
    );
  }
  if (input.commercial !== undefined) {
    records = records.filter((record) =>
      input.commercial
        ? record.license !== "cc-by-nc-4.0"
        : record.license === "cc-by-nc-4.0",
    );
  }
  if (input.origin) {
    records = records.filter((record) => record.provenance.origin === input.origin);
  }
  if (input.tag) {
    const tag = input.tag.toLowerCase();
    records = records.filter((record) =>
      record.tags.some((value) => value.toLowerCase() === tag),
    );
  }
  if (input.publisherId) {
    records = records.filter((record) => record.publisher.id === input.publisherId);
  }
  if (input.search) {
    const needle = input.search.toLowerCase().trim();
    records = records.filter(
      (record) =>
        record.name.toLowerCase().includes(needle)
        || record.description.toLowerCase().includes(needle)
        || record.packageId.toLowerCase().includes(needle)
        || record.tags.some((value) => value.toLowerCase().includes(needle)),
    );
  }
  return records.map((record) => ({
    record,
    createdAtMs: Date.parse(record.createdAt),
    idKey: record.id.toLowerCase(),
    relevanceScore:
      input.sort === "relevance" && input.search
        ? starterRelevanceScore(record, input.search)
        : 0,
  }));
}

export function compareListCandidates(
  a: CreatorMarketplaceListCandidate,
  b: CreatorMarketplaceListCandidate,
  sort: "newest" | "relevance",
): number {
  if (sort === "relevance" && a.relevanceScore !== b.relevanceScore) {
    return b.relevanceScore - a.relevanceScore;
  }
  if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
  if (a.idKey === b.idKey) return 0;
  return a.idKey < b.idKey ? 1 : -1;
}

/** 키셋 커서 경계 — 레포지토리의 newest/relevance 경계와 같은 의미다. */
export function isAfterListCursor(
  candidate: CreatorMarketplaceListCandidate,
  cursor: CreatorMarketplaceResourceCursor | null,
): boolean {
  if (!cursor) return true;
  const cursorMs = cursor.createdAt.getTime();
  const afterNewestBoundary =
    candidate.createdAtMs < cursorMs
    || (candidate.createdAtMs === cursorMs
      && candidate.idKey < cursor.id.toLowerCase());
  if (cursor.sort === "relevance") {
    return (
      candidate.relevanceScore < cursor.relevanceScore
      || (candidate.relevanceScore === cursor.relevanceScore && afterNewestBoundary)
    );
  }
  return afterNewestBoundary;
}

export function findEntryHashMismatch(
  manifest: CreatorMarketplaceResourceManifest,
): number | null {
  for (const [index, entry] of manifest.entries.entries()) {
    const canonicalContent = canonicalizeCreatorMarketplaceJson(
      entry.delivery.mode === "builtin-ref"
        ? {
            mode: entry.delivery.mode,
            runtimeRef: entry.delivery.runtimeRef,
          }
        : entry.delivery.payload,
    );
    if (sha256(canonicalContent) !== entry.delivery.sha256) return index;
  }
  return null;
}

export function projectRecord(
  row: CreatorMarketplaceResourceStoredRow,
  viewerId?: string,
): CreatorMarketplaceResourceRecord {
  const storedManifest = CreatorMarketplaceStoredResourceManifestSchema.parse(row.manifest);
  const canonicalManifest = canonicalizeCreatorMarketplaceJson(storedManifest);
  if (
    findEntryHashMismatch(storedManifest) !== null
    || sha256(canonicalManifest) !== row.manifestHash
    || creatorMarketplaceJsonByteSize(storedManifest) !== row.manifestByteSize
  ) {
    throw new Error("creator_marketplace_stored_manifest_integrity_mismatch");
  }

  const publicManifestInput: Record<string, unknown> = { ...storedManifest };
  Reflect.deleteProperty(publicManifestInput, "rightsConfirmed");
  const manifest = CreatorMarketplacePublicManifestSchema.parse(publicManifestInput);
  return CreatorMarketplaceResourceRecordSchema.parse({
    ...manifest,
    id: row.id,
    manifestHash: row.manifestHash,
    manifestByteSize: row.manifestByteSize,
    publisher: {
      id: row.publisherId,
      name: row.publisherName?.trim() || "창작자",
      avatar: row.publisherAvatar,
    },
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isOwner: Boolean(viewerId && viewerId === row.publisherId),
    access: "free",
  });
}

export function projectOwnedRelease(
  row: CreatorMarketplaceLifecycleStoredRow,
): CreatorMarketplaceOwnedRelease {
  return CreatorMarketplaceOwnedReleaseSchema.parse({
    resource: projectRecord(row, row.publisherId),
    releaseOrdinal: row.releaseOrdinal,
    hidden: row.hidden,
    delistedAt: row.delistedAt?.toISOString() ?? null,
    packageModeration: {
      state: row.packageState,
      revision: row.packageRevision,
      hiddenAt: row.packageHiddenAt?.toISOString() ?? null,
    },
  });
}

export function projectModerationQueueItem(
  row: CreatorMarketplaceModerationStoredRow,
): CreatorMarketplaceResourceModerationQueuePage["items"][number] {
  return {
    reportId: row.reportId,
    reason: row.reason,
    details: row.details,
    status: row.status,
    resolutionNote: row.resolutionNote,
    reporter: {
      id: row.reporterId,
      name: row.reporterName?.trim() || "탈퇴한 신고 회원",
    },
    reviewedBy: row.reviewedBy,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    evidence: row.evidence,
    currentResource: row.currentResourceId
      ? {
          id: row.currentResourceId,
          hidden: row.currentResourceHidden === true,
          delistedAt: row.currentResourceDelistedAt?.toISOString() ?? null,
        }
      : null,
    currentPackage:
      row.currentPackagePublisherId
      && row.currentPackageId
      && row.currentPackageHeadId
      && row.currentPackageState
      && row.currentPackageRevision !== null
        ? {
            publisherId: row.currentPackagePublisherId,
            packageId: row.currentPackageId,
            moderationTargetId: row.currentPackageHeadId,
            moderation: {
              state: row.currentPackageState,
              revision: row.currentPackageRevision,
              hiddenAt: row.currentPackageHiddenAt?.toISOString() ?? null,
            },
            availability:
              row.currentPackageState === "hidden"
                ? { state: "unavailable", reason: "moderated" }
                : row.currentPackagePublisherStatus !== "active"
                  ? { state: "unavailable", reason: "publisher-unavailable" }
                  : row.currentPackageHeadDelistedAt !== null
                    ? { state: "unavailable", reason: "owner-delisted" }
                    : {
                        state: "available",
                        currentHead: { id: row.currentPackageHeadId },
                      },
          }
        : null,
  };
}
