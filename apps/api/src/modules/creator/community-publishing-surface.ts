import { and, desc, eq, inArray, lte, ne, sql } from "drizzle-orm";

import {
  createDefaultCreatorPublicationDirective,
  markCreatorPublicationPublished,
  readCreatorPublicationDirective,
  writeCreatorPublicationDirective,
} from "@toonstudio/contracts/creator-publication-contract";
import type {
  CreatorCommunityExternalPlatform,
  CreatorCommunityExternalStatus,
  CreatorCommunityReleaseManifest,
} from "@toonstudio/contracts/creator-community-publication-contract";
import {
  creatorExternalPublications,
  creatorPortfolioEntries,
  creatorWorkBookmarks,
  creatorWorkPublications,
  creatorWorkReleases,
  creatorWorkReports,
  creatorWorks,
  db,
} from "../../platform/database";

import type { CreatorWorkDetail, CreatorWorkSummary } from "./works-contract";
import { safeDate } from "./shared";
import {
  parseManifest,
  selectReleaseSource,
  workIsDirectlyReadable,
  type CreatorWorkReportReason,
} from "./community-publishing";

export async function promoteDueCreatorCommunityPublications(
  now = new Date(),
  limit = 50,
) {
  const rows = await db
    .select({
      id: creatorWorkPublications.id,
      workId: creatorWorkPublications.workId,
      releaseId: creatorWorkPublications.releaseId,
      visibility: creatorWorkPublications.visibility,
      manifest: creatorWorkReleases.manifest,
    })
    .from(creatorWorkPublications)
    .innerJoin(
      creatorWorkReleases,
      eq(creatorWorkReleases.id, creatorWorkPublications.releaseId),
    )
    .where(
      and(
        eq(creatorWorkPublications.state, "scheduled"),
        lte(creatorWorkPublications.scheduledAt, now),
      ),
    )
    .orderBy(creatorWorkPublications.scheduledAt)
    .limit(Math.max(1, Math.min(100, Math.floor(limit))));
  const promoted: string[] = [];
  for (const row of rows) {
    const changed = await db.transaction(async (transaction) => {
      const source = await selectReleaseSource(transaction, row.workId);
      if (!source) return false;
      const directive = markCreatorPublicationPublished(
        readCreatorPublicationDirective(source.doc) ??
          createDefaultCreatorPublicationDirective("UTC"),
        now,
      );
      const [publication] = await transaction
        .update(creatorWorkPublications)
        .set({ state: "published", publishedAt: now, updatedAt: now })
        .where(
          and(
            eq(creatorWorkPublications.id, row.id),
            eq(creatorWorkPublications.state, "scheduled"),
          ),
        )
        .returning({ id: creatorWorkPublications.id });
      if (!publication) return false;
      await transaction
        .update(creatorWorks)
        .set({
          status: "published",
          doc: writeCreatorPublicationDirective(source.doc, directive),
          updatedAt: now,
        })
        .where(eq(creatorWorks.id, row.workId));
      await transaction
        .update(creatorWorkReleases)
        .set({ state: "superseded", updatedAt: now })
        .where(
          and(
            eq(creatorWorkReleases.workId, row.workId),
            eq(creatorWorkReleases.state, "published"),
            ne(creatorWorkReleases.id, row.releaseId),
          ),
        );
      await transaction
        .update(creatorWorkReleases)
        .set({ state: "published", publishedAt: now, updatedAt: now })
        .where(eq(creatorWorkReleases.id, row.releaseId));
      const manifest = parseManifest(row.manifest);
      if (manifest?.community.portfolio && row.visibility === "public") {
        await transaction
          .insert(creatorPortfolioEntries)
          .values({
            userId: source.userId,
            workId: row.workId,
            releaseId: row.releaseId,
            position: 0,
            featured: false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [creatorPortfolioEntries.userId, creatorPortfolioEntries.workId],
            set: { releaseId: row.releaseId, updatedAt: now },
          });
      } else {
        await transaction
          .delete(creatorPortfolioEntries)
          .where(
            and(
              eq(creatorPortfolioEntries.userId, source.userId),
              eq(creatorPortfolioEntries.workId, row.workId),
            ),
          );
      }
      return true;
    });
    if (changed) promoted.push(row.workId);
  }
  return promoted;
}

async function releaseRowsForWorks(workIds: readonly string[]) {
  if (workIds.length === 0) {
    return new Map<string, CreatorCommunityReleaseManifest>();
  }
  const [publicationRows, releaseRows] = await Promise.all([
    db
      .select({
        workId: creatorWorkPublications.workId,
        releaseId: creatorWorkPublications.releaseId,
        state: creatorWorkPublications.state,
      })
      .from(creatorWorkPublications)
      .where(inArray(creatorWorkPublications.workId, [...workIds])),
    db
      .select({
        id: creatorWorkReleases.id,
        workId: creatorWorkReleases.workId,
        releaseNo: creatorWorkReleases.releaseNo,
        state: creatorWorkReleases.state,
        manifest: creatorWorkReleases.manifest,
      })
      .from(creatorWorkReleases)
      .where(inArray(creatorWorkReleases.workId, [...workIds]))
      .orderBy(desc(creatorWorkReleases.releaseNo)),
  ]);
  const releasesById = new Map(releaseRows.map((row) => [row.id, row]));
  const active = new Map<string, CreatorCommunityReleaseManifest>();
  const worksWithPublication = new Set(publicationRows.map((row) => row.workId));
  for (const publication of publicationRows) {
    if (publication.state !== "published") continue;
    const release = releasesById.get(publication.releaseId);
    const manifest = release ? parseManifest(release.manifest) : null;
    if (manifest) active.set(publication.workId, manifest);
  }
  for (const release of releaseRows) {
    if (active.has(release.workId) || worksWithPublication.has(release.workId)) continue;
    if (release.state !== "published") continue;
    const manifest = parseManifest(release.manifest);
    if (manifest) active.set(release.workId, manifest);
  }
  return active;
}

export function projectCreatorWorkWithRelease<
  Work extends CreatorWorkSummary | CreatorWorkDetail,
>(work: Work, manifest: CreatorCommunityReleaseManifest): Work {
  const base = {
    ...work,
    title: manifest.title,
    description: manifest.description,
    cover: manifest.cover,
    tags: manifest.tags,
    format: manifest.format,
    author: manifest.author,
    community: manifest.community,
    seriesId: manifest.seriesId,
    episodeNo: manifest.episodeNo,
    challengeId: manifest.challengeId,
    remixFromId: manifest.remixFromId,
  };
  if (!("pages" in work)) return base as Work;
  return {
    ...base,
    pages: manifest.pages,
    doc: manifest.doc,
  } as Work;
}

export async function projectCreatorWorkListWithReleases(
  works: CreatorWorkSummary[],
) {
  const manifests = await releaseRowsForWorks(works.map((work) => work.id));
  return works.map((work) => {
    const manifest = manifests.get(work.id);
    return manifest ? projectCreatorWorkWithRelease(work, manifest) : work;
  });
}

export async function projectCreatorWorkDetailWithRelease(
  work: CreatorWorkDetail,
) {
  if (work.isOwner) return work;
  const manifests = await releaseRowsForWorks([work.id]);
  const manifest = manifests.get(work.id);
  return manifest ? projectCreatorWorkWithRelease(work, manifest) : work;
}

export async function toggleCreatorWorkBookmark(
  userId: string,
  workId: string,
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || !workIsDirectlyReadable(source)) {
    throw new Error("공개된 작품을 찾을 수 없습니다.");
  }
  return db.transaction(async (transaction) => {
    const deleted = await transaction
      .delete(creatorWorkBookmarks)
      .where(
        and(
          eq(creatorWorkBookmarks.userId, userId),
          eq(creatorWorkBookmarks.workId, workId),
        ),
      )
      .returning({ workId: creatorWorkBookmarks.workId });
    const bookmarked = deleted.length === 0;
    if (bookmarked) {
      await transaction.insert(creatorWorkBookmarks).values({ userId, workId });
    }
    const [aggregate] = await transaction
      .select({ count: sql<number>`count(*)` })
      .from(creatorWorkBookmarks)
      .where(eq(creatorWorkBookmarks.workId, workId));
    return { bookmarked, bookmarks: Number(aggregate?.count ?? 0) };
  });
}

function externalPublicationResponse(
  row: typeof creatorExternalPublications.$inferSelect,
) {
  return {
    id: row.id,
    workId: row.workId,
    releaseId: row.releaseId,
    platform: row.platform as CreatorCommunityExternalPlatform,
    externalUrl: row.externalUrl,
    status: row.status as CreatorCommunityExternalStatus,
    publishedAt: row.publishedAt ? safeDate(row.publishedAt) : null,
    createdAt: safeDate(row.createdAt),
    updatedAt: safeDate(row.updatedAt),
  };
}

export async function listCreatorExternalPublications(
  workId: string,
  viewerId?: string,
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || (source.userId !== viewerId && !workIsDirectlyReadable(source))) {
    throw new Error("작품을 찾을 수 없습니다.");
  }
  const ownerView = source.userId === viewerId;
  const rows = await db
    .select()
    .from(creatorExternalPublications)
    .where(
      ownerView
        ? eq(creatorExternalPublications.workId, workId)
        : and(
            eq(creatorExternalPublications.workId, workId),
            inArray(creatorExternalPublications.status, ["published", "updated"]),
          ),
    )
    .orderBy(desc(creatorExternalPublications.updatedAt));
  return rows.map(externalPublicationResponse);
}

export async function saveCreatorExternalPublication(
  userId: string,
  workId: string,
  input: {
    releaseId?: string;
    platform: CreatorCommunityExternalPlatform;
    externalUrl: string;
    status: CreatorCommunityExternalStatus;
    publishedAt?: string | null;
  },
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || source.userId !== userId) {
    throw new Error("작품 소유자만 외부 게시 기록을 관리할 수 있습니다.");
  }
  let releaseId = input.releaseId;
  if (!releaseId) {
    const [latest] = await db
      .select({ id: creatorWorkReleases.id })
      .from(creatorWorkReleases)
      .where(eq(creatorWorkReleases.workId, workId))
      .orderBy(desc(creatorWorkReleases.releaseNo))
      .limit(1);
    releaseId = latest?.id;
  }
  if (!releaseId) throw new Error("먼저 공개 릴리스를 만들어 주세요.");
  const [ownedRelease] = await db
    .select({ id: creatorWorkReleases.id })
    .from(creatorWorkReleases)
    .where(
      and(
        eq(creatorWorkReleases.id, releaseId),
        eq(creatorWorkReleases.workId, workId),
      ),
    )
    .limit(1);
  if (!ownedRelease) throw new Error("이 작품에 속한 릴리스를 찾을 수 없습니다.");
  const now = new Date();
  const publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
  const [saved] = await db
    .insert(creatorExternalPublications)
    .values({
      id: crypto.randomUUID(),
      workId,
      releaseId,
      platform: input.platform,
      externalUrl: input.externalUrl,
      status: input.status,
      publishedAt,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        creatorExternalPublications.workId,
        creatorExternalPublications.platform,
        creatorExternalPublications.externalUrl,
      ],
      set: {
        releaseId,
        status: input.status,
        publishedAt,
        updatedAt: now,
      },
    })
    .returning();
  if (!saved) throw new Error("외부 게시 기록을 저장할 수 없습니다.");
  return externalPublicationResponse(saved);
}

export async function removeCreatorExternalPublication(
  userId: string,
  workId: string,
  publicationId: string,
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || source.userId !== userId) {
    throw new Error("작품 소유자만 외부 게시 기록을 관리할 수 있습니다.");
  }
  const [removed] = await db
    .update(creatorExternalPublications)
    .set({ status: "removed", updatedAt: new Date() })
    .where(
      and(
        eq(creatorExternalPublications.id, publicationId),
        eq(creatorExternalPublications.workId, workId),
      ),
    )
    .returning();
  if (!removed) throw new Error("외부 게시 기록을 찾을 수 없습니다.");
  return externalPublicationResponse(removed);
}

export async function upsertCreatorPortfolioEntry(
  userId: string,
  workId: string,
  input: { releaseId: string; position?: number; featured?: boolean },
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || source.userId !== userId) {
    throw new Error("본인 작품만 포트폴리오에 추가할 수 있습니다.");
  }
  const [release] = await db
    .select({ id: creatorWorkReleases.id, state: creatorWorkReleases.state })
    .from(creatorWorkReleases)
    .where(
      and(
        eq(creatorWorkReleases.id, input.releaseId),
        eq(creatorWorkReleases.workId, workId),
      ),
    )
    .limit(1);
  if (!release || !["published", "superseded"].includes(release.state)) {
    throw new Error("공개 이력이 있는 릴리스만 포트폴리오에 추가할 수 있습니다.");
  }
  const [publication] = await db
    .select({ id: creatorWorkPublications.id })
    .from(creatorWorkPublications)
    .where(
      and(
        eq(creatorWorkPublications.workId, workId),
        eq(creatorWorkPublications.releaseId, input.releaseId),
        eq(creatorWorkPublications.state, "published"),
        eq(creatorWorkPublications.visibility, "public"),
      ),
    )
    .limit(1);
  if (!publication) {
    throw new Error("현재 전체 공개 중인 릴리스만 포트폴리오에 추가할 수 있습니다.");
  }
  const now = new Date();
  const [saved] = await db
    .insert(creatorPortfolioEntries)
    .values({
      userId,
      workId,
      releaseId: input.releaseId,
      position: input.position ?? 0,
      featured: input.featured ?? false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [creatorPortfolioEntries.userId, creatorPortfolioEntries.workId],
      set: {
        releaseId: input.releaseId,
        position: input.position ?? 0,
        featured: input.featured ?? false,
        updatedAt: now,
      },
    })
    .returning();
  if (!saved) throw new Error("포트폴리오를 저장할 수 없습니다.");
  return {
    workId: saved.workId,
    releaseId: saved.releaseId,
    position: saved.position,
    featured: saved.featured,
    createdAt: safeDate(saved.createdAt),
  };
}

export async function removeCreatorPortfolioEntry(
  userId: string,
  workId: string,
) {
  await db
    .delete(creatorPortfolioEntries)
    .where(
      and(
        eq(creatorPortfolioEntries.userId, userId),
        eq(creatorPortfolioEntries.workId, workId),
      ),
    );
  return { ok: true };
}

export async function listCreatorPortfolio(userId: string) {
  const rows = await db
    .select({
      workId: creatorPortfolioEntries.workId,
      releaseId: creatorPortfolioEntries.releaseId,
      position: creatorPortfolioEntries.position,
      featured: creatorPortfolioEntries.featured,
      createdAt: creatorPortfolioEntries.createdAt,
      manifest: creatorWorkReleases.manifest,
    })
    .from(creatorPortfolioEntries)
    .innerJoin(
      creatorWorkReleases,
      eq(creatorPortfolioEntries.releaseId, creatorWorkReleases.id),
    )
    .innerJoin(
      creatorWorkPublications,
      and(
        eq(creatorWorkPublications.workId, creatorPortfolioEntries.workId),
        eq(creatorWorkPublications.releaseId, creatorPortfolioEntries.releaseId),
        eq(creatorWorkPublications.state, "published"),
        eq(creatorWorkPublications.visibility, "public"),
      ),
    )
    .where(eq(creatorPortfolioEntries.userId, userId))
    .orderBy(
      desc(creatorPortfolioEntries.featured),
      creatorPortfolioEntries.position,
      desc(creatorPortfolioEntries.updatedAt),
    );
  return rows.flatMap((row) => {
    const manifest = parseManifest(row.manifest);
    if (!manifest) return [];
    return [
      {
        workId: row.workId,
        releaseId: row.releaseId,
        position: row.position,
        featured: row.featured,
        createdAt: safeDate(row.createdAt),
        work: {
          title: manifest.title,
          description: manifest.description,
          cover: manifest.cover,
          tags: manifest.tags,
          kind: manifest.community.kind,
          provenance: manifest.community.provenance,
          author: manifest.author,
        },
      },
    ];
  });
}

export async function reportCreatorWork(
  reporterId: string,
  workId: string,
  input: { reason: CreatorWorkReportReason; details: string },
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || !workIsDirectlyReadable(source)) {
    throw new Error("공개된 작품을 찾을 수 없습니다.");
  }
  if (source.userId === reporterId) throw new Error("본인 작품은 신고할 수 없습니다.");
  const now = new Date();
  await db
    .insert(creatorWorkReports)
    .values({
      workId,
      reporterId,
      reason: input.reason,
      details: input.details,
      status: "open",
      createdAt: now,
      resolvedAt: null,
    })
    .onConflictDoUpdate({
      target: [creatorWorkReports.workId, creatorWorkReports.reporterId],
      set: {
        reason: input.reason,
        details: input.details,
        status: "open",
        createdAt: now,
        resolvedAt: null,
      },
    });
  return { ok: true };
}
