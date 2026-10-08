import { createHash, randomUUID } from "node:crypto";

import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";

import {
  CreatorMarketplaceOrphanReportDismissReceiptSchema,
  CreatorMarketplaceOwnedHeadPageSchema,
  CreatorMarketplaceOwnedHistoryPageSchema,
  CreatorMarketplaceOwnedReleaseSchema,
  CreatorMarketplacePublicManifestSchema,
  CreatorMarketplaceResourceHistoryPageSchema,
  CreatorMarketplaceResourceIdentitySchema,
  CreatorMarketplaceResourceModerationQueuePageSchema,
  CreatorMarketplaceResourceModerationReceiptSchema,
  CreatorMarketplaceResourceListPageSchema,
  CreatorMarketplaceResourceManifestSchema,
  CreatorMarketplaceResourceRecordSchema,
  CreatorMarketplaceResourceRelistReceiptSchema,
  CreatorMarketplaceResourceReportReceiptSchema,
  CreatorMarketplaceStoredResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "@toonstudio/contracts/creator-marketplace-resource-contract";
import {
  CREATOR_MARKETPLACE_STARTER_RECORDS,
  findStarterMarketplaceResourceById,
} from "@toonstudio/contracts/creator-marketplace-starter-catalog";

import {
  CREATOR_MARKETPLACE_PUBLISH_GATE,
  creatorMarketplacePublisherGateKey,
} from "./creator-marketplace-publish-gate";
import { creatorMarketplaceReporterKey } from "./creator-marketplace-report-gate";
import {
  CREATOR_MARKETPLACE_RESOURCE_REPOSITORY,
  CreatorMarketplaceModerationRejectedError,
  CreatorMarketplaceOrphanReportDismissRejectedError,
  CreatorMarketplaceResourceDuplicateError,
  CreatorMarketplaceResourceReleaseRejectedError,
  CreatorMarketplaceResourceRelistRejectedError,
  CreatorMarketplaceResourceReportRejectedError,
} from "./creator-marketplace.repository-contract";

import type {
  CreatorMarketplacePublishGate,
  CreatorMarketplacePublishLease,
} from "./creator-marketplace-publish-gate";
import type {
  CreatorMarketplaceResourceListQueryDto,
  DismissCreatorMarketplaceOrphanReportDto,
  CreatorMarketplaceOwnedHistoryQueryDto,
  CreatorMarketplaceResourceHistoryQueryDto,
  CreatorMarketplaceModerationQueryDto,
  ModerateCreatorMarketplaceResourceDto,
  PublishCreatorMarketplaceResourceDto,
  ReportCreatorMarketplaceResourceDto,
} from "./creator-marketplace.dto";
import type {
  CreatorMarketplaceResourceCursor,
  CreatorMarketplaceLifecycleStoredRow,
  CreatorMarketplaceResourceRepository,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";
import type {
  CreatorMarketplaceResourceListPage,
  CreatorMarketplaceOrphanReportDismissReceipt,
  CreatorMarketplaceResourceManifest,
  CreatorMarketplaceOwnedHeadPage,
  CreatorMarketplaceOwnedHistoryPage,
  CreatorMarketplaceOwnedRelease,
  CreatorMarketplaceResourceHistoryPage,
  CreatorMarketplaceResourceIdentity,
  CreatorMarketplaceResourceModerationQueuePage,
  CreatorMarketplaceResourceModerationReceipt,
  CreatorMarketplaceResourceRecord,
  CreatorMarketplaceResourceRelistReceipt,
  CreatorMarketplaceResourceReportReceipt,
} from "@toonstudio/contracts/creator-marketplace-resource-contract";

interface CreatorMarketplaceCursorEnvelope {
  version: 3;
  sort: "newest" | "relevance";
  queryHash: string;
  createdAt: string;
  id: string;
  relevanceScore?: number;
}

interface CreatorMarketplaceCursorQuery {
  scope: "owned-heads" | "public-heads";
  sort: "newest" | "relevance";
  publisherId?: string;
  search?: string;
  tag?: string;
  kind?: string;
  license?: string;
}

type CreatorMarketplaceFailureOperation =
  | "delete"
  | "detail"
  | "history"
  | "identity"
  | "list"
  | "list-owned-heads"
  | "list-owned-history"
  | "orphan-dismiss"
  | "list-moderation"
  | "moderate"
  | "publish"
  | "publish-gate-acquire"
  | "publish-gate-release"
  | "relist"
  | "report";

function creatorMarketplaceFailureReasonCode(error: unknown): string {
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

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function cursorQueryHash(query: CreatorMarketplaceCursorQuery): string {
  return sha256(JSON.stringify({
    scope: query.scope,
    sort: query.sort,
    publisherId: query.publisherId ?? null,
    search: query.search ?? null,
    tag: query.tag ?? null,
    kind: query.kind ?? null,
    license: query.license ?? null,
  }));
}

function parseCursor(
  value: string | undefined,
  expectedSort: CreatorMarketplaceCursorEnvelope["sort"],
  expectedQueryHash: string
): CreatorMarketplaceResourceCursor | null {
  if (!value) return null;
  try {
    const decoded = Buffer.from(value, "base64url");
    if (decoded.byteLength < 1 || decoded.byteLength > 512) throw new Error("cursor_size");
    const envelope = JSON.parse(decoded.toString("utf8")) as Partial<CreatorMarketplaceCursorEnvelope>;
    if (
      envelope.version !== 3 ||
      envelope.sort !== expectedSort ||
      envelope.queryHash !== expectedQueryHash ||
      typeof envelope.queryHash !== "string" ||
      !/^[0-9a-f]{64}$/u.test(envelope.queryHash) ||
      typeof envelope.createdAt !== "string" ||
      typeof envelope.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
        envelope.id
      )
    ) {
      throw new Error("cursor_shape");
    }
    const createdAt = new Date(envelope.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || createdAt.toISOString() !== envelope.createdAt) {
      throw new Error("cursor_date");
    }
    if (expectedSort === "relevance") {
      if (
        !Number.isSafeInteger(envelope.relevanceScore)
        || (envelope.relevanceScore ?? -1) < 0
      ) {
        throw new Error("cursor_relevance_score");
      }
      return {
        sort: "relevance",
        relevanceScore: envelope.relevanceScore!,
        createdAt,
        id: envelope.id,
      };
    }
    if (envelope.relevanceScore !== undefined) throw new Error("cursor_newest_score");
    return { sort: "newest", createdAt, id: envelope.id };
  } catch {
    throw new BadRequestException({
      code: "creator_marketplace_cursor_invalid",
      message: "마켓 목록 커서가 올바르지 않습니다.",
    });
  }
}

function encodeCursor(
  row: CreatorMarketplaceResourceStoredRow,
  sort: CreatorMarketplaceCursorEnvelope["sort"],
  queryHash: string
): string {
  if (
    sort === "relevance"
    && (!Number.isSafeInteger(row.relevanceScore) || (row.relevanceScore ?? -1) < 0)
  ) {
    throw new Error("creator_marketplace_relevance_score_missing");
  }
  const envelope: CreatorMarketplaceCursorEnvelope = {
    version: 3,
    sort,
    queryHash,
    createdAt: row.createdAt.toISOString(),
    id: row.id,
    ...(sort === "relevance" ? { relevanceScore: row.relevanceScore } : {}),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

interface CreatorMarketplaceListCandidate {
  readonly record: CreatorMarketplaceResourceRecord;
  readonly createdAtMs: number;
  readonly idKey: string;
  readonly relevanceScore: number;
}

/**
 * 공식 스타터 레코드의 검색 점수 — 레포지토리의 relevance SQL과 같은 가중을 쓴다.
 * 공개 목록 병합에서 DB 행과 스타터를 한 축으로 정렬하기 위한 것이다.
 */
function starterRelevanceScore(
  record: CreatorMarketplaceResourceRecord,
  search: string
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
function starterListCandidates(input: {
  publisherId?: string;
  search?: string;
  tag?: string;
  kind?: string;
  license?: string;
  sort: "newest" | "relevance";
}): CreatorMarketplaceListCandidate[] {
  let records = CREATOR_MARKETPLACE_STARTER_RECORDS;
  if (input.kind) {
    records = records.filter((record) => record.kind === input.kind);
  }
  if (input.license) {
    records = records.filter((record) => record.license === input.license);
  }
  if (input.tag) {
    const tag = input.tag.toLowerCase();
    records = records.filter((record) =>
      record.tags.some((value) => value.toLowerCase() === tag)
    );
  }
  if (input.publisherId) {
    records = records.filter((record) => record.publisher.id === input.publisherId);
  }
  if (input.search) {
    const needle = input.search.toLowerCase().trim();
    records = records.filter((record) =>
      record.name.toLowerCase().includes(needle)
      || record.description.toLowerCase().includes(needle)
      || record.packageId.toLowerCase().includes(needle)
      || record.tags.some((value) => value.toLowerCase().includes(needle))
    );
  }
  return records.map((record) => ({
    record,
    createdAtMs: Date.parse(record.createdAt),
    idKey: record.id.toLowerCase(),
    relevanceScore: input.sort === "relevance" && input.search
      ? starterRelevanceScore(record, input.search)
      : 0,
  }));
}

function compareListCandidates(
  a: CreatorMarketplaceListCandidate,
  b: CreatorMarketplaceListCandidate,
  sort: "newest" | "relevance"
): number {
  if (sort === "relevance" && a.relevanceScore !== b.relevanceScore) {
    return b.relevanceScore - a.relevanceScore;
  }
  if (a.createdAtMs !== b.createdAtMs) return b.createdAtMs - a.createdAtMs;
  if (a.idKey === b.idKey) return 0;
  return a.idKey < b.idKey ? 1 : -1;
}

/** 키셋 커서 경계 — 레포지토리의 newest/relevance 경계와 같은 의미다. */
function isAfterListCursor(
  candidate: CreatorMarketplaceListCandidate,
  cursor: CreatorMarketplaceResourceCursor | null
): boolean {
  if (!cursor) return true;
  const cursorMs = cursor.createdAt.getTime();
  const afterNewestBoundary = candidate.createdAtMs < cursorMs
    || (candidate.createdAtMs === cursorMs
      && candidate.idKey < cursor.id.toLowerCase());
  if (cursor.sort === "relevance") {
    return candidate.relevanceScore < cursor.relevanceScore
      || (candidate.relevanceScore === cursor.relevanceScore && afterNewestBoundary);
  }
  return afterNewestBoundary;
}

function encodeListCursor(
  candidate: CreatorMarketplaceListCandidate,
  sort: "newest" | "relevance",
  queryHash: string
): string {
  if (
    sort === "relevance"
    && (!Number.isSafeInteger(candidate.relevanceScore) || candidate.relevanceScore < 0)
  ) {
    throw new Error("creator_marketplace_relevance_score_missing");
  }
  const envelope: CreatorMarketplaceCursorEnvelope = {
    version: 3,
    sort,
    queryHash,
    createdAt: new Date(candidate.createdAtMs).toISOString(),
    id: candidate.record.id,
    ...(sort === "relevance" ? { relevanceScore: candidate.relevanceScore } : {}),
  };
  return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

function findEntryHashMismatch(
  manifest: CreatorMarketplaceResourceManifest
): number | null {
  for (const [index, entry] of manifest.entries.entries()) {
    const canonicalContent = canonicalizeCreatorMarketplaceJson(
      entry.delivery.mode === "builtin-ref"
        ? {
            mode: entry.delivery.mode,
            runtimeRef: entry.delivery.runtimeRef,
          }
        : entry.delivery.payload
    );
    if (sha256(canonicalContent) !== entry.delivery.sha256) return index;
  }
  return null;
}

function projectRecord(
  row: CreatorMarketplaceResourceStoredRow,
  viewerId?: string
): CreatorMarketplaceResourceRecord {
  const storedManifest = CreatorMarketplaceStoredResourceManifestSchema.parse(row.manifest);
  const canonicalManifest = canonicalizeCreatorMarketplaceJson(storedManifest);
  if (
    findEntryHashMismatch(storedManifest) !== null ||
    sha256(canonicalManifest) !== row.manifestHash ||
    creatorMarketplaceJsonByteSize(storedManifest) !== row.manifestByteSize
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

function projectOwnedRelease(
  row: CreatorMarketplaceLifecycleStoredRow
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

@Injectable()
export class CreatorMarketplaceService {
  private readonly logger = new Logger(CreatorMarketplaceService.name);

  constructor(
    @Inject(CREATOR_MARKETPLACE_RESOURCE_REPOSITORY)
    private readonly repository: CreatorMarketplaceResourceRepository,
    @Inject(CREATOR_MARKETPLACE_PUBLISH_GATE)
    private readonly publishGate: CreatorMarketplacePublishGate
  ) {}

  private logFailure(
    operation: CreatorMarketplaceFailureOperation,
    error: unknown
  ): void {
    this.logger.error({
      event: "creator-marketplace.operation.failed",
      operation,
      reasonCode: creatorMarketplaceFailureReasonCode(error),
    });
  }

  async list(
    query: CreatorMarketplaceResourceListQueryDto,
    options: { publisherId?: string; viewerId?: string } = {}
  ): Promise<CreatorMarketplaceResourceListPage> {
    const publisherId = options.publisherId ?? query.publisher;
    const sort = query.sort ?? (query.search ? "relevance" : "newest");
    if (sort === "relevance" && !query.search) {
      throw new BadRequestException({
        code: "creator_marketplace_relevance_requires_search",
        message: "관련도순 정렬에는 검색어가 필요합니다.",
      });
    }
    const queryHash = cursorQueryHash({
      scope: "public-heads",
      publisherId,
      sort,
      search: query.search,
      tag: query.tag,
      kind: query.kind,
      license: query.license,
    });
    const cursor = parseCursor(query.cursor, sort, queryHash);
    // 공식 스타터 카탈로그는 DB가 아니라 contracts 정적 데이터가 정본이다.
    // 상세(getById)와 결제 정책은 이미 스타터를 실물 리소스로 취급하므로,
    // 공개 목록도 같은 필터·정렬·키셋 경계로 스타터를 병합한다.
    // (브라우저 QA R1 실측: 목록만 스타터가 빠져 상세와 비대칭이었다.)
    const starters = starterListCandidates({
      publisherId,
      search: query.search,
      tag: query.tag,
      kind: query.kind,
      license: query.license,
      sort,
    });
    try {
      const rows = await this.repository.list({
        publisherId,
        viewerId: options.viewerId,
        // 병합 정렬의 첫 페이지를 정확히 구성하려면 커서 이후 DB 행을
        // 스타터 후보 수만큼 더 읽어야 한다. 초과분은 hasMore 판정에 쓴다.
        limit: query.limit + starters.length,
        cursor,
        sort,
        search: query.search,
        tag: query.tag,
        kind: query.kind,
        license: query.license,
      });
      // 같은 id가 공개 목록에 실릴 수 있는 DB 행으로 있으면 DB 행이 정본이다
      // (getById와 같은 우선순위). 조회 창이 아니라 존재 기준으로 가려야
      // 페이지가 넘어간 뒤 스타터가 되살아나 중복되지 않는다.
      const listedDbIds = new Set(
        (await this.repository.findListedIds(
          starters.map((candidate) => candidate.record.id)
        )).map((id) => id.toLowerCase())
      );
      const candidates = [
        ...rows.map((row) => ({
          record: projectRecord(row, options.viewerId),
          createdAtMs: row.createdAt.getTime(),
          idKey: row.id.toLowerCase(),
          relevanceScore: row.relevanceScore ?? 0,
        })),
        ...starters.filter((candidate) => !listedDbIds.has(candidate.idKey)),
      ]
        .filter((candidate) => isAfterListCursor(candidate, cursor))
        .sort((a, b) => compareListCandidates(a, b, sort));
      const pageCandidates = candidates.slice(0, query.limit);
      const hasMore = candidates.length > query.limit
        || rows.length > query.limit + starters.length;
      return CreatorMarketplaceResourceListPageSchema.parse({
        items: pageCandidates.map((candidate) => candidate.record),
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && pageCandidates.length > 0
          ? encodeListCursor(pageCandidates[pageCandidates.length - 1]!, sort, queryHash)
          : null,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("list", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_unavailable",
        message: "공유 리소스 마켓을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async listOwnedHeads(
    publisherId: string,
    query: CreatorMarketplaceResourceListQueryDto
  ): Promise<CreatorMarketplaceOwnedHeadPage> {
    const sort = query.sort ?? (query.search ? "relevance" : "newest");
    if (sort === "relevance" && !query.search) {
      throw new BadRequestException({
        code: "creator_marketplace_relevance_requires_search",
        message: "관련도순 정렬에는 검색어가 필요합니다.",
      });
    }
    const queryHash = cursorQueryHash({
      scope: "owned-heads",
      publisherId,
      sort,
      search: query.search,
      tag: query.tag,
      kind: query.kind,
      license: query.license,
    });
    const cursor = parseCursor(query.cursor, sort, queryHash);
    try {
      const rows = await this.repository.listOwnedHeads({
        publisherId,
        limit: query.limit,
        cursor,
        sort,
        search: query.search,
        tag: query.tag,
        kind: query.kind,
        license: query.license,
      });
      const hasMore = rows.length > query.limit;
      const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
      return CreatorMarketplaceOwnedHeadPageSchema.parse({
        items: pageRows.map(projectOwnedRelease),
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && pageRows.length > 0
          ? encodeCursor(pageRows[pageRows.length - 1]!, sort, queryHash)
          : null,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("list-owned-heads", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_owned_heads_unavailable",
        message: "내 마켓 패키지 상태를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async history(
    id: string,
    query: CreatorMarketplaceResourceHistoryQueryDto
  ): Promise<CreatorMarketplaceResourceHistoryPage> {
    try {
      const anchor = await this.repository.findHistoryAnchor(id);
      if (!anchor) {
        throw new NotFoundException({
          code: "creator_marketplace_history_anchor_not_found",
          message: "릴리스 이력을 확인할 마켓 리소스를 찾지 못했습니다.",
        });
      }
      const anchorRecord = projectRecord(anchor);
      const rows = await this.repository.listPublicHistory({
        publisherId: anchor.publisherId,
        packageId: anchorRecord.packageId,
        limit: query.limit,
        cursor: query.cursor ?? null,
      });
      const hasMore = rows.length > query.limit;
      const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
      if (pageRows.some((row) => row.hidden || row.delistedAt !== null)) {
        throw new Error("creator_marketplace_public_history_visibility_mismatch");
      }
      return CreatorMarketplaceResourceHistoryPageSchema.parse({
        packageId: anchorRecord.packageId,
        anchor: {
          id: anchor.id,
          resourceVersion: anchorRecord.resourceVersion,
          listed: anchor.delistedAt === null,
        },
        items: pageRows.map((row) => {
          const record = projectRecord(row);
          return {
            id: record.id,
            releaseOrdinal: row.releaseOrdinal,
            name: record.name,
            resourceVersion: record.resourceVersion,
            minimumStudioVersion: record.minimumStudioVersion,
            ...(record.releaseNotes === undefined
              ? {}
              : { releaseNotes: record.releaseNotes }),
            manifestHash: record.manifestHash,
            createdAt: record.createdAt,
            selected: record.id === anchor.id,
          };
        }),
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && pageRows.length > 0
          ? pageRows[pageRows.length - 1]!.releaseOrdinal
          : null,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("history", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_history_unavailable",
        message: "마켓 릴리스 이력을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async getIdentity(id: string): Promise<CreatorMarketplaceResourceIdentity> {
    try {
      const row = await this.repository.findIdentityById(id);
      if (!row) {
        throw new NotFoundException({
          code: "creator_marketplace_identity_not_found",
          message: "확인할 마켓 릴리스 식별자를 찾지 못했습니다.",
        });
      }
      return CreatorMarketplaceResourceIdentitySchema.parse({
        id: row.id,
        publisherId: row.publisherId,
        packageId: row.packageId,
        kind: row.kind,
        availability: row.packageState === "hidden"
          ? "moderator-hidden"
          : row.publisherStatus !== "active"
            ? "publisher-unavailable"
            : row.releaseDelistedAt === null && row.currentHeadDelistedAt === null
              ? "listed"
              : "owner-delisted",
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("identity", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_identity_unavailable",
        message: "마켓 릴리스 식별자를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async listOwnedHistory(
    publisherId: string,
    query: CreatorMarketplaceOwnedHistoryQueryDto
  ): Promise<CreatorMarketplaceOwnedHistoryPage> {
    try {
      const head = await this.repository.findOwnedPackageHead(
        publisherId,
        query.packageId
      );
      if (!head) {
        throw new NotFoundException({
          code: "creator_marketplace_owned_history_not_found",
          message: "내 마켓 패키지 이력을 찾지 못했습니다.",
        });
      }
      const rows = await this.repository.listOwnedPackageHistory({
        publisherId,
        packageId: query.packageId,
        limit: query.limit,
        cursor: query.cursor ?? null,
      });
      const hasMore = rows.length > query.limit;
      const pageRows = hasMore ? rows.slice(0, query.limit) : rows;
      return CreatorMarketplaceOwnedHistoryPageSchema.parse({
        packageId: query.packageId,
        items: pageRows.map(projectOwnedRelease),
        limit: query.limit,
        hasMore,
        nextCursor: hasMore && pageRows.length > 0
          ? pageRows[pageRows.length - 1]!.releaseOrdinal
          : null,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("list-owned-history", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_owned_history_unavailable",
        message: "내 마켓 패키지 이력을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async getById(
    id: string,
    options: { viewerId?: string } = {}
  ): Promise<CreatorMarketplaceResourceRecord> {
    let row: CreatorMarketplaceResourceStoredRow | null = null;
    let repoFailed = false;
    try {
      row = await this.repository.findById(id);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("detail", error);
      repoFailed = true;
    }

    if (row) {
      try {
        return projectRecord(row, options.viewerId);
      } catch (error) {
        if (error instanceof HttpException) throw error;
        this.logFailure("detail", error);
        throw new ServiceUnavailableException({
          code: "creator_marketplace_unavailable",
          message: "공유 리소스를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
        });
      }
    }

    const starter = findStarterMarketplaceResourceById(id);
    if (starter) return starter;

    if (repoFailed) {
      throw new ServiceUnavailableException({
        code: "creator_marketplace_unavailable",
        message: "공유 리소스를 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
    throw new NotFoundException();
  }

  async publish(
    publisherId: string,
    body: PublishCreatorMarketplaceResourceDto
  ): Promise<CreatorMarketplaceResourceRecord> {
    const parsedManifest = CreatorMarketplaceResourceManifestSchema.safeParse(body);
    if (!parsedManifest.success) {
      throw new BadRequestException({
        code: "creator_marketplace_manifest_invalid",
        message: "공유 리소스 manifest가 올바르지 않습니다.",
      });
    }
    const manifest = parsedManifest.data;
    const entryHashMismatch = findEntryHashMismatch(manifest);
    if (entryHashMismatch !== null) {
      throw new BadRequestException({
        code: "creator_marketplace_entry_hash_mismatch",
        message: `${entryHashMismatch + 1}번째 리소스의 콘텐츠 해시가 일치하지 않습니다.`,
      });
    }
    const canonicalManifest = canonicalizeCreatorMarketplaceJson(manifest);
    const manifestByteSize = creatorMarketplaceJsonByteSize(manifest);
    const manifestHash = sha256(canonicalManifest);

    let publishLease: CreatorMarketplacePublishLease;
    try {
      const admission = await this.publishGate.acquire(
        creatorMarketplacePublisherGateKey(publisherId)
      );
      if (admission.status === "rate_limited") {
        throw new HttpException(
          {
            code: "creator_marketplace_publish_rate_limited",
            message:
              "공유 패키지를 너무 자주 게시하고 있습니다. 잠시 후 다시 시도해 주세요.",
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      publishLease = admission.lease;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("publish-gate-acquire", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_publish_gate_unavailable",
        message:
          "게시 요청을 안전하게 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }

    try {
      const row = await this.repository.publish({
        id: randomUUID(),
        publisherId,
        manifest,
        manifestHash,
        manifestByteSize,
      });
      return projectRecord(row, publisherId);
    } catch (error) {
      if (error instanceof CreatorMarketplaceResourceReleaseRejectedError) {
        if (error.reason === "moderated") {
          throw new ConflictException({
            code: "creator_marketplace_package_moderated",
            message: `관리자 숨김 상태인 최신 버전 ${error.latestVersion}을 먼저 검토해 주세요.`,
          });
        }
        throw new ConflictException({
          code: error.reason === "downgrade"
            ? "creator_marketplace_resource_version_downgrade"
            : "creator_marketplace_resource_version_equivocation",
          message: error.reason === "downgrade"
            ? `현재 최신 버전 ${error.latestVersion}보다 높은 SemVer로 게시해 주세요.`
            : `현재 최신 버전 ${error.latestVersion}과 SemVer 우선순위가 같은 릴리스는 다시 게시할 수 없습니다.`,
        });
      }
      if (error instanceof CreatorMarketplaceResourceDuplicateError) {
        throw new ConflictException({
          code: "creator_marketplace_resource_duplicate",
          message: "같은 패키지 버전 또는 동일한 manifest를 이미 공유했습니다.",
        });
      }
      if (error instanceof HttpException) throw error;
      this.logFailure("publish", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_publish_unavailable",
        message: "공유 패키지를 게시할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      try {
        await this.publishGate.release(publishLease);
      } catch (error) {
        this.logFailure("publish-gate-release", error);
        // The short database lease expires automatically. A release outage must not turn a
        // committed resource into an ambiguous client retry, and cannot increase admission.
      }
    }
  }

  async deleteOwned(publisherId: string, id: string): Promise<{ delisted: true }> {
    try {
      if (!(await this.repository.deleteOwned(publisherId, id))) {
        throw new NotFoundException("목록에서 내릴 공유 리소스를 찾을 수 없습니다.");
      }
      return { delisted: true };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("delete", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_delete_unavailable",
        message: "공유 리소스를 목록에서 내릴 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async relistOwned(
    publisherId: string,
    id: string
  ): Promise<CreatorMarketplaceResourceRelistReceipt> {
    try {
      const result = await this.repository.relistOwned(publisherId, id);
      if (!result) {
        throw new NotFoundException({
          code: "creator_marketplace_relist_target_not_found",
          message: "다시 등록할 내 마켓 리소스를 찾지 못했습니다.",
        });
      }
      return CreatorMarketplaceResourceRelistReceiptSchema.parse({
        relisted: true,
        changed: result.changed,
        id: result.id,
        delistedAt: null,
      });
    } catch (error) {
      if (error instanceof CreatorMarketplaceResourceRelistRejectedError) {
        throw new ConflictException({
          code: error.reason === "non-head"
            ? "creator_marketplace_relist_non_head"
            : "creator_marketplace_relist_moderated",
          message: error.reason === "non-head"
            ? "최신 패키지 릴리스만 다시 등록할 수 있습니다."
            : "관리자가 숨긴 릴리스는 소유자가 다시 등록할 수 없습니다.",
        });
      }
      if (error instanceof HttpException) throw error;
      this.logFailure("relist", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_relist_unavailable",
        message: "마켓 리소스를 다시 등록할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async report(
    reporterId: string,
    resourceId: string,
    body: ReportCreatorMarketplaceResourceDto
  ): Promise<CreatorMarketplaceResourceReportReceipt> {
    try {
      const result = await this.repository.report({
        id: randomUUID(),
        resourceId,
        reporterId,
        reporterKeyHash: creatorMarketplaceReporterKey(reporterId),
        reason: body.reason,
        details: body.details,
      });
      return CreatorMarketplaceResourceReportReceiptSchema.parse({
        reported: true,
        reportId: result.reportId,
        status: "open",
      });
    } catch (error) {
      if (error instanceof CreatorMarketplaceResourceReportRejectedError) {
        if (error.reason === "not-found") {
          throw new NotFoundException({
            code: "creator_marketplace_report_target_not_found",
            message: "신고할 수 있는 공개 마켓 리소스를 찾지 못했습니다.",
          });
        }
        if (error.reason === "self-report") {
          throw new BadRequestException({
            code: "creator_marketplace_self_report_forbidden",
            message: "자신이 배포한 마켓 리소스는 신고할 수 없습니다.",
          });
        }
        if (error.reason === "duplicate") {
          throw new ConflictException({
            code: "creator_marketplace_report_duplicate",
            message: "현재 패키지 릴리스 주기에서 이미 신고했습니다.",
          });
        }
        throw new HttpException(
          {
            code: "creator_marketplace_report_rate_limited",
            message: "오늘 제출할 수 있는 마켓 신고 수를 초과했습니다.",
          },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      if (error instanceof HttpException) throw error;
      this.logFailure("report", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_report_unavailable",
        message: "마켓 리소스를 신고할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async listModeration(
    query: CreatorMarketplaceModerationQueryDto
  ): Promise<CreatorMarketplaceResourceModerationQueuePage> {
    try {
      const rows = await this.repository.listModeration(query);
      const requestedNextOffset = query.offset + query.limit;
      const hasMore =
        rows.length > query.limit && requestedNextOffset <= 1_000_000;
      const pageRows = rows.slice(0, query.limit);
      return CreatorMarketplaceResourceModerationQueuePageSchema.parse({
        items: pageRows.map((row) => ({
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
                  availability: row.currentPackageState === "hidden"
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
        })),
        status: query.status,
        limit: query.limit,
        offset: query.offset,
        hasMore,
        nextOffset: hasMore ? requestedNextOffset : null,
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logFailure("list-moderation", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_moderation_unavailable",
        message: "마켓 신고 검수 목록을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async dismissOrphanReport(
    reviewerId: string,
    reportId: string,
    body: DismissCreatorMarketplaceOrphanReportDto
  ): Promise<CreatorMarketplaceOrphanReportDismissReceipt> {
    try {
      const result = await this.repository.dismissOrphanReport({
        reportId,
        reviewerId,
        note: body.note,
      });
      if (!result) {
        throw new NotFoundException({
          code: "creator_marketplace_orphan_report_not_found",
          message: "종결할 마켓 신고를 찾지 못했습니다.",
        });
      }
      return CreatorMarketplaceOrphanReportDismissReceiptSchema.parse({
        dismissed: true,
        reportId: result.reportId,
        dismissedReportCount: result.dismissedReportCount,
      });
    } catch (error) {
      if (error instanceof CreatorMarketplaceOrphanReportDismissRejectedError) {
        throw new ConflictException({
          code: error.reason === "attached"
            ? "creator_marketplace_orphan_report_still_attached"
            : "creator_marketplace_orphan_report_already_closed",
          message: error.reason === "attached"
            ? "리소스가 남아 있는 신고는 리소스 중재 경로에서 처리해야 합니다."
            : "이미 종결된 신고는 다시 변경할 수 없습니다.",
        });
      }
      if (error instanceof HttpException) throw error;
      this.logFailure("orphan-dismiss", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_orphan_report_unavailable",
        message: "고아 마켓 신고를 종결할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }

  async moderate(
    reviewerId: string,
    resourceId: string,
    body: ModerateCreatorMarketplaceResourceDto
  ): Promise<CreatorMarketplaceResourceModerationReceipt> {
    try {
      const result = await this.repository.moderate({
        resourceId,
        reviewerId,
        action: body.action,
        note: body.note,
        ...(body.sourceReportId ? { sourceReportId: body.sourceReportId } : {}),
      });
      if (!result) {
        throw new NotFoundException({
          code: "creator_marketplace_moderation_target_not_found",
          message: "검수할 마켓 리소스를 찾지 못했습니다.",
        });
      }
      return CreatorMarketplaceResourceModerationReceiptSchema.parse({
        moderated: true,
        scope: "package",
        action: body.action,
        changed: result.changed,
        hidden: result.hidden,
        delisted: result.delisted,
        reviewedReportCount: result.reviewedReportCount,
        decisionId: result.decisionId,
        package: {
          publisherId: result.publisherId,
          packageId: result.packageId,
          moderation: {
            state: result.packageState,
            revision: result.packageRevision,
            hiddenAt: result.packageHiddenAt?.toISOString() ?? null,
          },
        },
      });
    } catch (error) {
      if (error instanceof CreatorMarketplaceModerationRejectedError) {
        throw new ConflictException({
          code: "creator_marketplace_moderation_source_report_invalid",
          message: "검수 기준 신고가 이 패키지의 열린 신고와 일치하지 않습니다.",
        });
      }
      if (error instanceof HttpException) throw error;
      this.logFailure("moderate", error);
      throw new ServiceUnavailableException({
        code: "creator_marketplace_moderation_unavailable",
        message: "마켓 리소스를 검수할 수 없습니다. 잠시 후 다시 시도해 주세요.",
      });
    }
  }
}
