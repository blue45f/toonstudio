import { and, eq, lt, ne, or, sql } from "drizzle-orm";

import { creatorMarketplaceResources } from "../../platform/database/creator-marketplace-resource.schema";

import type {
  CreatorMarketplaceLifecycleStoredRow,
  CreatorMarketplaceOwnedHeadListInput,
  CreatorMarketplaceResourceListInput,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";
import type { SQL } from "drizzle-orm";

const CREATOR_MARKETPLACE_RELEASE_LOCK_NAMESPACE =
  "toonspectrum:creator-marketplace-release:v1:";

export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/gu, (character) => `\\${character}`);
}

export function newestCursorBoundary(createdAt: Date, id: string): SQL {
  return or(
    lt(creatorMarketplaceResources.createdAt, createdAt),
    and(
      eq(creatorMarketplaceResources.createdAt, createdAt),
      lt(creatorMarketplaceResources.id, id),
    ),
  )!;
}

export function appendMarketplaceFacetFilters(
  filters: SQL[],
  input: Pick<
    CreatorMarketplaceResourceListInput | CreatorMarketplaceOwnedHeadListInput,
    "kind" | "license" | "tag" | "containsAi" | "engine" | "commercial" | "origin"
  >,
): void {
  if (input.kind) {
    filters.push(eq(creatorMarketplaceResources.kind, input.kind));
  }
  if (input.license) {
    filters.push(eq(creatorMarketplaceResources.license, input.license));
  }
  if (input.containsAi !== undefined) {
    filters.push(
      sql`${creatorMarketplaceResources.manifest} @> ${JSON.stringify({ containsAi: input.containsAi })}::jsonb`,
    );
  }
  if (input.engine) {
    filters.push(
      sql`${creatorMarketplaceResources.manifest}->'compatibility'->'engines' @> ${JSON.stringify([input.engine])}::jsonb`,
    );
  }
  if (input.commercial !== undefined) {
    filters.push(
      input.commercial
        ? ne(creatorMarketplaceResources.license, "cc-by-nc-4.0")
        : eq(creatorMarketplaceResources.license, "cc-by-nc-4.0"),
    );
  }
  if (input.origin) {
    filters.push(eq(creatorMarketplaceResources.provenanceOrigin, input.origin));
  }
  if (input.tag) {
    filters.push(
      sql`${creatorMarketplaceResources.tags} @> ${JSON.stringify([input.tag])}::jsonb`,
    );
  }
}

export function mapStoredRow(row: {
  id: string;
  publisherId: string;
  publisherName: string | null;
  publisherAvatar: string | null;
  manifest: CreatorMarketplaceResourceStoredRow["manifest"];
  manifestHash: string;
  manifestByteSize: number;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore?: number;
}): CreatorMarketplaceResourceStoredRow {
  return row;
}

export function mapLifecycleStoredRow(row: {
  id: string;
  publisherId: string;
  publisherName: string | null;
  publisherAvatar: string | null;
  manifest: CreatorMarketplaceResourceStoredRow["manifest"];
  manifestHash: string;
  manifestByteSize: number;
  releaseOrdinal: number;
  delistedAt: Date | null;
  packageState: string;
  packageRevision: number;
  packageHiddenAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  relevanceScore?: number;
}): CreatorMarketplaceLifecycleStoredRow {
  if (row.packageState !== "active" && row.packageState !== "hidden") {
    throw new Error("creator_marketplace_package_moderation_state_invalid");
  }
  return {
    ...row,
    packageState: row.packageState,
    hidden: row.packageState === "hidden",
  };
}

export function creatorMarketplaceReleaseLockKey(
  publisherId: string,
  packageId: string,
): string {
  return `${CREATOR_MARKETPLACE_RELEASE_LOCK_NAMESPACE}`
    + `${publisherId.length}:${publisherId}`
    + `${packageId.length}:${packageId}`;
}
