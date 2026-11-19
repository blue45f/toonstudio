import { eq } from "drizzle-orm";

import { isCreatorPublicationDirectlyReadable } from "@toonstudio/contracts/creator-publication-contract";
import type { CreatorCommunityReleaseManifest } from "@toonstudio/contracts/creator-community-publication-contract";
import { creatorWorks, db, users } from "../../platform/database";

import type { CreatorCommunityTransaction } from "./shared";

export const CREATOR_WORK_REPORT_REASONS = [
  "copyright",
  "unsafe",
  "spam",
  "misleading",
  "ai_disclosure",
  "other",
] as const;
export type CreatorWorkReportReason =
  (typeof CREATOR_WORK_REPORT_REASONS)[number];

export interface ReleaseSource {
  id: string;
  userId: string;
  authorName: string | null;
  authorAvatar: string | null;
  title: string;
  description: string | null;
  tags: unknown;
  format: string;
  cover: string | null;
  pages: unknown;
  doc: unknown;
  status: string;
  hidden: boolean;
  revision: number;
  seriesId: string | null;
  episodeNo: number | null;
  challengeId: string | null;
  remixFromId: string | null;
}

export function workIsDirectlyReadable(
  source: Pick<ReleaseSource, "status" | "hidden" | "doc">,
): boolean {
  return (
    source.status === "published" &&
    !source.hidden &&
    isCreatorPublicationDirectlyReadable(source.doc)
  );
}

export async function selectReleaseSource(
  executor: typeof db | CreatorCommunityTransaction,
  workId: string,
): Promise<ReleaseSource | null> {
  const [row] = await executor
    .select({
      id: creatorWorks.id,
      userId: creatorWorks.userId,
      authorName: users.name,
      authorAvatar: users.avatar,
      title: creatorWorks.title,
      description: creatorWorks.description,
      tags: creatorWorks.tags,
      format: creatorWorks.format,
      cover: creatorWorks.cover,
      pages: creatorWorks.pages,
      doc: creatorWorks.doc,
      status: creatorWorks.status,
      hidden: creatorWorks.hidden,
      revision: creatorWorks.revision,
      seriesId: creatorWorks.seriesId,
      episodeNo: creatorWorks.episodeNo,
      challengeId: creatorWorks.challengeId,
      remixFromId: creatorWorks.remixFromId,
    })
    .from(creatorWorks)
    .innerJoin(users, eq(creatorWorks.userId, users.id))
    .where(eq(creatorWorks.id, workId))
    .limit(1);
  return row ?? null;
}

export function parseManifest(value: unknown): CreatorCommunityReleaseManifest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const manifest = value as Partial<CreatorCommunityReleaseManifest>;
  if (manifest.version !== 1 || typeof manifest.workId !== "string") return null;
  if (!Array.isArray(manifest.pages) || !manifest.community || !manifest.author) {
    return null;
  }
  return manifest as CreatorCommunityReleaseManifest;
}
