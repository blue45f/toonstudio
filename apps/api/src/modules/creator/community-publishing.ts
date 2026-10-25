import { createHash } from "node:crypto";

import { and, desc, eq, inArray, max, ne, sql } from "drizzle-orm";

import {
  createDefaultCreatorPublicationDirective,
  isCreatorPublicationDirectlyReadable,
  markCreatorPublicationPublished,
  normalizeCreatorPublicationDirective,
  normalizeCreatorPublicationSlug,
  readCreatorPublicationDirective,
  writeCreatorPublicationDirective,
  type CreatorPublicationVisibility,
} from "@toonstudio/contracts/creator-publication-contract";
import {
  readCreatorCommunityMetadata,
  type CreatorCommunityApprovalState,
  type CreatorCommunityExternalPlatform,
  type CreatorCommunityExternalStatus,
  type CreatorCommunityReleaseManifest,
  type CreatorCommunityReleaseState,
} from "@toonstudio/contracts/creator-community-publication-contract";
import { toPublicCreatorDoc } from "../../server/creator-doc-visibility";
import {
  creatorPortfolioEntries,
  creatorWorkCollaborators,
  creatorWorkPublications,
  creatorWorkReleaseApprovals,
  creatorWorkReleases,
  creatorWorks,
  db,
  users,
} from "../../platform/database";

import { parseFormat } from "./works-contract";
import {
  parsePages,
  parseTagValue,
  safeDate,
  type CreatorCommunityTransaction,
} from "./shared";

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
export type CreatorExternalPublicationPlatform = CreatorCommunityExternalPlatform;
export type CreatorExternalPublicationStatus = CreatorCommunityExternalStatus;

interface ReleaseSource {
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

export interface CreateCreatorWorkReleaseInput {
  approverUserIds?: readonly string[];
}

export interface PublishCreatorWorkReleaseInput {
  visibility: Exclude<CreatorPublicationVisibility, "private">;
  scheduledAt?: string | null;
  canonicalSlug?: string;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
    .join(",")}}`;
}

export function creatorReleaseFingerprint(
  manifest: CreatorCommunityReleaseManifest,
): string {
  return createHash("sha256").update(stableJson(manifest)).digest("hex");
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

function releaseManifest(
  source: ReleaseSource,
  capturedAt: Date,
): CreatorCommunityReleaseManifest {
  return {
    version: 1,
    workId: source.id,
    workRevision: source.revision,
    title: source.title,
    description: source.description ?? "",
    cover: source.cover ?? "",
    tags: parseTagValue(source.tags),
    format: parseFormat(source.format),
    pages: parsePages(source.pages),
    doc: toPublicCreatorDoc(source.doc),
    seriesId: source.seriesId,
    episodeNo: source.episodeNo,
    challengeId: source.challengeId,
    remixFromId: source.remixFromId,
    author: {
      id: source.userId,
      name: source.authorName ?? "익명",
      avatar: source.authorAvatar ?? "#7c5cfc",
    },
    community: readCreatorCommunityMetadata(source.doc, {
      format: source.format,
    }),
    capturedAt: capturedAt.toISOString(),
  };
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
async function approvalsForReleaseIds(releaseIds: readonly string[]) {
  if (releaseIds.length === 0) return new Map<string, ReturnType<typeof approvalResponse>[]>();
  const rows = await db
    .select({
      releaseId: creatorWorkReleaseApprovals.releaseId,
      userId: creatorWorkReleaseApprovals.userId,
      state: creatorWorkReleaseApprovals.state,
      note: creatorWorkReleaseApprovals.note,
      decidedAt: creatorWorkReleaseApprovals.decidedAt,
      name: users.name,
      avatar: users.avatar,
    })
    .from(creatorWorkReleaseApprovals)
    .innerJoin(users, eq(creatorWorkReleaseApprovals.userId, users.id))
    .where(inArray(creatorWorkReleaseApprovals.releaseId, [...releaseIds]));
  const grouped = new Map<string, ReturnType<typeof approvalResponse>[]>();
  for (const row of rows) {
    const items = grouped.get(row.releaseId) ?? [];
    items.push(approvalResponse(row));
    grouped.set(row.releaseId, items);
  }
  return grouped;
}

function approvalResponse(row: {
  userId: string;
  state: string;
  note: string;
  decidedAt: Date | null;
  name: string | null;
  avatar: string | null;
}) {
  return {
    userId: row.userId,
    name: row.name ?? "알 수 없는 사용자",
    avatar: row.avatar ?? "#7c5cfc",
    state: row.state as CreatorCommunityApprovalState,
    note: row.note,
    decidedAt: row.decidedAt ? safeDate(row.decidedAt) : null,
  };
}

function releaseResponse(
  row: typeof creatorWorkReleases.$inferSelect,
  approvals: ReturnType<typeof approvalResponse>[] = [],
) {
  const manifest = parseManifest(row.manifest);
  return {
    id: row.id,
    workId: row.workId,
    releaseNo: row.releaseNo,
    workRevision: row.workRevision,
    fingerprint: row.fingerprint,
    state: row.state as CreatorCommunityReleaseState,
    title: manifest?.title ?? "",
    kind: manifest?.community.kind ?? "illustration",
    provenance: manifest?.community.provenance ?? "human",
    approvals,
    publishedAt: row.publishedAt ? safeDate(row.publishedAt) : null,
    createdAt: safeDate(row.createdAt),
  };
}

async function releaseResponseById(releaseId: string) {
  const [row] = await db
    .select()
    .from(creatorWorkReleases)
    .where(eq(creatorWorkReleases.id, releaseId))
    .limit(1);
  if (!row) throw new Error("릴리스를 찾을 수 없습니다.");
  const approvals = await approvalsForReleaseIds([releaseId]);
  return releaseResponse(row, approvals.get(releaseId) ?? []);
}

export async function insertCreatorWorkRelease(
  transaction: CreatorCommunityTransaction,
  workId: string,
  options: {
    state?: CreatorCommunityReleaseState;
    publishedAt?: Date | null;
    legacyAuto?: boolean;
  } = {},
) {
  if (options.legacyAuto) {
    const [publication] = await transaction
      .select({ releaseId: creatorWorkPublications.releaseId })
      .from(creatorWorkPublications)
      .where(eq(creatorWorkPublications.workId, workId))
      .limit(1);
    if (publication) return publication.releaseId;
  }
  const source = await selectReleaseSource(transaction, workId);
  if (!source) throw new Error("릴리스를 만들 작품을 찾을 수 없습니다.");
  const [existing] = await transaction
    .select({ id: creatorWorkReleases.id })
    .from(creatorWorkReleases)
    .where(
      and(
        eq(creatorWorkReleases.workId, workId),
        eq(creatorWorkReleases.workRevision, source.revision),
      ),
    )
    .limit(1);
  if (existing) return existing.id;

  const capturedAt = new Date();
  const manifest = releaseManifest(source, capturedAt);
  const fingerprint = creatorReleaseFingerprint(manifest);
  const [identical] = await transaction
    .select({ id: creatorWorkReleases.id })
    .from(creatorWorkReleases)
    .where(
      and(
        eq(creatorWorkReleases.workId, workId),
        eq(creatorWorkReleases.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  if (identical) return identical.id;
  const [latest] = await transaction
    .select({ releaseNo: max(creatorWorkReleases.releaseNo) })
    .from(creatorWorkReleases)
    .where(eq(creatorWorkReleases.workId, workId));
  const [created] = await transaction
    .insert(creatorWorkReleases)
    .values({
      id: crypto.randomUUID(),
      workId,
      ownerUserId: source.userId,
      releaseNo: Number(latest?.releaseNo ?? 0) + 1,
      workRevision: source.revision,
      fingerprint,
      manifest: { ...manifest } as Record<string, unknown>,
      state: options.state ?? (options.publishedAt ? "published" : "approved"),
      publishedAt: options.publishedAt ?? null,
      createdAt: capturedAt,
      updatedAt: capturedAt,
    })
    .returning({ id: creatorWorkReleases.id });
  if (!created) throw new Error("작품 릴리스를 만들 수 없습니다.");
  return created.id;
}

function uniqueUserIds(values: readonly string[] | undefined): string[] {
  return [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))];
}

async function assertApprovers(
  transaction: CreatorCommunityTransaction,
  workId: string,
  ownerUserId: string,
  approverUserIds: readonly string[],
): Promise<string[]> {
  const ids = uniqueUserIds(approverUserIds).filter((id) => id !== ownerUserId);
  if (ids.length === 0) return [];
  if (ids.length > 20) throw new Error("승인자는 최대 20명까지 선택할 수 있습니다.");
  const rows = await transaction
    .select({ userId: creatorWorkCollaborators.userId })
    .from(creatorWorkCollaborators)
    .where(
      and(
        eq(creatorWorkCollaborators.workId, workId),
        eq(creatorWorkCollaborators.status, "active"),
        inArray(creatorWorkCollaborators.userId, ids),
      ),
    );
  const activeIds = new Set(rows.map((row) => row.userId));
  if (ids.some((id) => !activeIds.has(id))) {
    throw new Error("활성 공동 작업자만 릴리스 승인자로 지정할 수 있습니다.");
  }
  return ids;
}

export async function createCreatorWorkRelease(
  userId: string,
  workId: string,
  input: CreateCreatorWorkReleaseInput = {},
) {
  const releaseId = await db.transaction(async (transaction) => {
    const [lockedWork] = await transaction
      .select({ ownerUserId: creatorWorks.userId })
      .from(creatorWorks)
      .where(eq(creatorWorks.id, workId))
      .limit(1)
      .for("update");
    if (!lockedWork || lockedWork.ownerUserId !== userId) {
      throw new Error("작품 소유자만 릴리스를 만들 수 있습니다.");
    }
    const source = await selectReleaseSource(transaction, workId);
    if (!source) throw new Error("릴리스를 만들 작품을 찾을 수 없습니다.");
    const approverUserIds = await assertApprovers(
      transaction,
      workId,
      userId,
      input.approverUserIds ?? [],
    );
    const createdId = await insertCreatorWorkRelease(transaction, workId, {
      state: approverUserIds.length > 0 ? "review" : "approved",
      publishedAt: null,
    });
    if (approverUserIds.length > 0) {
      await transaction
        .insert(creatorWorkReleaseApprovals)
        .values(
          approverUserIds.map((approverUserId) => ({
            releaseId: createdId,
            userId: approverUserId,
            state: "pending",
            note: "",
            decidedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        )
        .onConflictDoNothing();
      await transaction
        .update(creatorWorkReleases)
        .set({ state: "review", updatedAt: new Date() })
        .where(
          and(
            eq(creatorWorkReleases.id, createdId),
            inArray(creatorWorkReleases.state, ["review", "approved"]),
          ),
        );
    }
    return createdId;
  });
  return releaseResponseById(releaseId);
}

export async function resolvePublishedCreatorWorkIdBySlug(
  value: unknown,
): Promise<string | null> {
  const canonicalSlug = normalizeCreatorPublicationSlug(value);
  if (!canonicalSlug) return null;
  const [publication] = await db
    .select({ workId: creatorWorkPublications.workId })
    .from(creatorWorkPublications)
    .where(and(
      eq(creatorWorkPublications.canonicalSlug, canonicalSlug),
      eq(creatorWorkPublications.state, "published"),
      eq(creatorWorkPublications.visibility, "public"),
    ))
    .limit(1);
  if (publication?.workId) return publication.workId;

  // Earlier publisher revisions stored the directive only in creator_work.doc.
  // Keep those stable public links alive while the immutable publication row is backfilled.
  const [legacy] = await db
    .select({ workId: creatorWorks.id })
    .from(creatorWorks)
    .where(and(
      eq(creatorWorks.status, "published"),
      eq(creatorWorks.hidden, false),
      sql`coalesce(${creatorWorks.doc}->'publication'->>'canonicalSlug', '') = ${canonicalSlug}`,
      sql`coalesce(${creatorWorks.doc}->'publication'->>'visibility', 'public') = 'public'`,
    ))
    .limit(1);
  return legacy?.workId ?? null;
}

export async function listCreatorWorkReleases(
  workId: string,
  viewerId?: string,
) {
  const source = await selectReleaseSource(db, workId);
  if (!source || source.userId !== viewerId) {
    throw new Error("작품을 찾을 수 없습니다.");
  }
  const rows = await db
    .select()
    .from(creatorWorkReleases)
    .where(eq(creatorWorkReleases.workId, workId))
    .orderBy(desc(creatorWorkReleases.releaseNo));
  const approvals = await approvalsForReleaseIds(rows.map((row) => row.id));
  return rows.map((row) => releaseResponse(row, approvals.get(row.id) ?? []));
}

export async function decideCreatorWorkRelease(
  userId: string,
  workId: string,
  releaseId: string,
  input: { action: "approve" | "reject"; note?: string },
) {
  await db.transaction(async (transaction) => {
    const [release] = await transaction
      .select({ id: creatorWorkReleases.id, state: creatorWorkReleases.state })
      .from(creatorWorkReleases)
      .where(
        and(
          eq(creatorWorkReleases.id, releaseId),
          eq(creatorWorkReleases.workId, workId),
        ),
      )
      .limit(1);
    if (!release || release.state === "published" || release.state === "withdrawn") {
      throw new Error("결정할 수 있는 릴리스를 찾을 수 없습니다.");
    }
    const now = new Date();
    const [approval] = await transaction
      .update(creatorWorkReleaseApprovals)
      .set({
        state: input.action === "approve" ? "approved" : "rejected",
        note: (input.note ?? "").trim().slice(0, 500),
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(creatorWorkReleaseApprovals.releaseId, releaseId),
          eq(creatorWorkReleaseApprovals.userId, userId),
        ),
      )
      .returning({ userId: creatorWorkReleaseApprovals.userId });
    if (!approval) throw new Error("이 릴리스의 승인 권한이 없습니다.");
    const decisions = await transaction
      .select({ state: creatorWorkReleaseApprovals.state })
      .from(creatorWorkReleaseApprovals)
      .where(eq(creatorWorkReleaseApprovals.releaseId, releaseId));
    const nextState: CreatorCommunityReleaseState = decisions.some(
      (decision) => decision.state !== "approved",
    )
      ? "review"
      : "approved";
    await transaction
      .update(creatorWorkReleases)
      .set({ state: nextState, updatedAt: now })
      .where(eq(creatorWorkReleases.id, releaseId));
  });
  return releaseResponseById(releaseId);
}

function publicationResponse(row: typeof creatorWorkPublications.$inferSelect) {
  return {
    id: row.id,
    workId: row.workId,
    releaseId: row.releaseId,
    state: row.state,
    visibility: row.visibility,
    canonicalSlug: row.canonicalSlug,
    scheduledAt: row.scheduledAt ? safeDate(row.scheduledAt) : null,
    publishedAt: row.publishedAt ? safeDate(row.publishedAt) : null,
    unpublishedAt: row.unpublishedAt ? safeDate(row.unpublishedAt) : null,
  };
}

async function assertReleasePublishable(
  transaction: CreatorCommunityTransaction,
  userId: string,
  workId: string,
  releaseId: string,
) {
  const [release] = await transaction
    .select()
    .from(creatorWorkReleases)
    .where(
      and(
        eq(creatorWorkReleases.id, releaseId),
        eq(creatorWorkReleases.workId, workId),
        eq(creatorWorkReleases.ownerUserId, userId),
      ),
    )
    .limit(1);
  if (!release) throw new Error("게시할 릴리스를 찾을 수 없습니다.");
  const decisions = await transaction
    .select({ state: creatorWorkReleaseApprovals.state })
    .from(creatorWorkReleaseApprovals)
    .where(eq(creatorWorkReleaseApprovals.releaseId, releaseId));
  if (decisions.some((decision) => decision.state !== "approved")) {
    throw new Error("모든 공동 작업자의 승인이 완료되어야 게시할 수 있습니다.");
  }
  if (!parseManifest(release.manifest)) {
    throw new Error("릴리스 스냅샷이 올바르지 않습니다.");
  }
  return release;
}

export async function publishCreatorWorkRelease(
  userId: string,
  workId: string,
  releaseId: string,
  input: PublishCreatorWorkReleaseInput,
) {
  const publicationId = await db.transaction(async (transaction) => {
    const release = await assertReleasePublishable(
      transaction,
      userId,
      workId,
      releaseId,
    );
    const source = await selectReleaseSource(transaction, workId);
    if (!source || source.userId !== userId) {
      throw new Error("작품 소유자만 게시할 수 있습니다.");
    }
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledAt && !Number.isFinite(scheduledAt.getTime())) {
      throw new Error("예약 게시 시간이 올바르지 않습니다.");
    }
    if (scheduledAt && scheduledAt.getTime() <= Date.now() + 60_000) {
      throw new Error("예약 시간은 현재보다 최소 1분 뒤여야 합니다.");
    }
    const immediate = !scheduledAt;
    const now = new Date();
    const manifest = parseManifest(release.manifest)!;
    const storedDirective = readCreatorPublicationDirective(manifest.doc);
    let directive = normalizeCreatorPublicationDirective(
      storedDirective ?? createDefaultCreatorPublicationDirective("UTC"),
    );
    directive = normalizeCreatorPublicationDirective({
      ...directive,
      visibility: input.visibility,
      canonicalSlug: input.canonicalSlug ?? directive.canonicalSlug,
      mode: immediate ? "immediate" : "scheduled",
      scheduledAt: scheduledAt?.toISOString() ?? null,
      publishedAt: null,
    });
    if (immediate) directive = markCreatorPublicationPublished(directive, now);
    const state = immediate ? "published" : "scheduled";
    const [saved] = await transaction
      .insert(creatorWorkPublications)
      .values({
        id: crypto.randomUUID(),
        workId,
        releaseId,
        state,
        visibility: input.visibility,
        canonicalSlug: directive.canonicalSlug,
        scheduledAt,
        publishedAt: immediate ? now : null,
        unpublishedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: creatorWorkPublications.workId,
        set: {
          releaseId,
          state,
          visibility: input.visibility,
          canonicalSlug: directive.canonicalSlug,
          scheduledAt,
          publishedAt: immediate ? now : null,
          unpublishedAt: null,
          updatedAt: now,
        },
      })
      .returning({ id: creatorWorkPublications.id });
    if (!saved) throw new Error("게시 상태를 저장할 수 없습니다.");
    await transaction
      .update(creatorWorks)
      .set({
        status: immediate ? "published" : "draft",
        doc: writeCreatorPublicationDirective(source.doc, directive),
        updatedAt: now,
      })
      .where(eq(creatorWorks.id, workId));
    if (immediate) {
      await transaction
        .update(creatorWorkReleases)
        .set({ state: "superseded", updatedAt: now })
        .where(
          and(
            eq(creatorWorkReleases.workId, workId),
            eq(creatorWorkReleases.state, "published"),
            ne(creatorWorkReleases.id, releaseId),
          ),
        );
      await transaction
        .update(creatorWorkReleases)
        .set({ state: "published", publishedAt: now, updatedAt: now })
        .where(eq(creatorWorkReleases.id, releaseId));
      if (manifest.community.portfolio && input.visibility === "public") {
        await transaction
          .insert(creatorPortfolioEntries)
          .values({
            userId,
            workId,
            releaseId,
            position: 0,
            featured: false,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [creatorPortfolioEntries.userId, creatorPortfolioEntries.workId],
            set: { releaseId, updatedAt: now },
          });
      } else {
        await transaction
          .delete(creatorPortfolioEntries)
          .where(
            and(
              eq(creatorPortfolioEntries.userId, userId),
              eq(creatorPortfolioEntries.workId, workId),
            ),
          );
      }
    }
    return saved.id;
  });
  const [publication] = await db
    .select()
    .from(creatorWorkPublications)
    .where(eq(creatorWorkPublications.id, publicationId))
    .limit(1);
  if (!publication) throw new Error("게시 상태를 찾을 수 없습니다.");
  return publicationResponse(publication);
}

export async function unpublishCreatorWork(
  userId: string,
  workId: string,
) {
  return db.transaction(async (transaction) => {
    const source = await selectReleaseSource(transaction, workId);
    if (!source || source.userId !== userId) {
      throw new Error("작품 소유자만 공개를 취소할 수 있습니다.");
    }
    const now = new Date();
    const [publication] = await transaction
      .update(creatorWorkPublications)
      .set({
        state: "unpublished",
        scheduledAt: null,
        unpublishedAt: now,
        updatedAt: now,
      })
      .where(eq(creatorWorkPublications.workId, workId))
      .returning();
    if (!publication) throw new Error("공개된 릴리스를 찾을 수 없습니다.");
    const directive = normalizeCreatorPublicationDirective({
      ...(readCreatorPublicationDirective(source.doc) ??
        createDefaultCreatorPublicationDirective("UTC")),
      visibility: "private",
      mode: "immediate",
      scheduledAt: null,
      publishedAt: null,
    });
    await transaction
      .update(creatorWorks)
      .set({
        status: "draft",
        doc: writeCreatorPublicationDirective(source.doc, directive),
        updatedAt: now,
      })
      .where(eq(creatorWorks.id, workId));
    await transaction
      .delete(creatorPortfolioEntries)
      .where(
        and(
          eq(creatorPortfolioEntries.userId, userId),
          eq(creatorPortfolioEntries.workId, workId),
        ),
      );
    return publicationResponse(publication);
  });
}

export {
  listCreatorExternalPublications,
  listCreatorPortfolio,
  projectCreatorWorkDetailWithRelease,
  projectCreatorWorkListWithReleases,
  projectCreatorWorkWithRelease,
  promoteDueCreatorCommunityPublications,
  removeCreatorExternalPublication,
  removeCreatorPortfolioEntry,
  reportCreatorWork,
  saveCreatorExternalPublication,
  toggleCreatorWorkBookmark,
  upsertCreatorPortfolioEntry,
} from "./community-publishing-surface";
