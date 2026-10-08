import { createHash } from "node:crypto";

import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import {
  CreatorMarketplaceStoredResourceManifestSchema,
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "@toonstudio/contracts/creator-marketplace-resource-contract";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@toonstudio/contracts/creator-marketplace-starter-catalog";

import { CreatorMarketplaceService } from "./creator-marketplace.service";

import type { CreatorMarketplaceResourceListQueryDto } from "./creator-marketplace.dto";
import type { CreatorMarketplacePublishGate } from "./creator-marketplace-publish-gate";
import type {
  CreatorMarketplaceResourceCursor,
  CreatorMarketplaceResourceListInput,
  CreatorMarketplaceResourceRepository,
  CreatorMarketplaceResourceStoredRow,
} from "./creator-marketplace.repository-contract";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** projectRecord의 무결성 검사를 통과하는 최소 stored row를 만든다. */
function makeStoredRow(input: {
  id: string;
  createdAt: string;
  name?: string;
  relevanceScore?: number;
}): CreatorMarketplaceResourceStoredRow {
  const runtimeRef = "studio-asset:sample-v1";
  const manifest = CreatorMarketplaceStoredResourceManifestSchema.parse({
    schemaVersion: 1,
    packageId: "tester/sample-asset",
    name: input.name ?? "테스트 에셋",
    description: "목록 병합 테스트용 리소스입니다.",
    kind: "asset",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["테스트"],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    rightsConfirmed: true,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [
      {
        id: "sample/main",
        kind: "asset",
        name: "샘플 항목",
        delivery: {
          mode: "builtin-ref",
          runtimeRef,
          byteSize: 0,
          sha256: sha256Hex(
            canonicalizeCreatorMarketplaceJson({ mode: "builtin-ref", runtimeRef })
          ),
        },
      },
    ],
  });
  return {
    id: input.id,
    publisherId: "11111111-1111-4111-8111-111111111111",
    publisherName: "테스터",
    publisherAvatar: null,
    manifest,
    manifestHash: sha256Hex(canonicalizeCreatorMarketplaceJson(manifest)),
    manifestByteSize: creatorMarketplaceJsonByteSize(manifest),
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.createdAt),
    relevanceScore: input.relevanceScore,
  };
}

/**
 * 실제 레포지토리의 키셋 계약(정렬·커서 경계·limit+1 조회)을 흉내 내는 가짜.
 * 서비스 병합 로직이 이 계약 위에서 동작하는지를 검증하기 위한 것이다.
 */
function makeRepository(rows: CreatorMarketplaceResourceStoredRow[]) {
  const list = vi.fn(async (input: CreatorMarketplaceResourceListInput) => {
    const cursor: CreatorMarketplaceResourceCursor | null = input.cursor;
    const afterCursor = (row: CreatorMarketplaceResourceStoredRow) => {
      if (!cursor) return true;
      const ms = row.createdAt.getTime();
      const cursorMs = cursor.createdAt.getTime();
      const afterNewest = ms < cursorMs
        || (ms === cursorMs && row.id.toLowerCase() < cursor.id.toLowerCase());
      if (cursor.sort === "relevance") {
        const score = row.relevanceScore ?? 0;
        return score < cursor.relevanceScore
          || (score === cursor.relevanceScore && afterNewest);
      }
      return afterNewest;
    };
    const sorted = rows.filter(afterCursor).sort((a, b) => {
      if (input.sort === "relevance") {
        const diff = (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
        if (diff !== 0) return diff;
      }
      const diff = b.createdAt.getTime() - a.createdAt.getTime();
      if (diff !== 0) return diff;
      return a.id < b.id ? 1 : -1;
    });
    return sorted.slice(0, input.limit + 1);
  });
  const findById = vi.fn(async (id: string) => rows.find((row) => row.id === id) ?? null);
  const findListedIds = vi.fn(async (ids: readonly string[]) =>
    rows.filter((row) => ids.includes(row.id)).map((row) => row.id)
  );
  return { list, findById, findListedIds };
}

function makeService(rows: CreatorMarketplaceResourceStoredRow[]) {
  const repository = makeRepository(rows);
  const service = new CreatorMarketplaceService(
    repository as unknown as CreatorMarketplaceResourceRepository,
    {} as unknown as CreatorMarketplacePublishGate
  );
  return { service, repository };
}

function query(
  overrides: Partial<CreatorMarketplaceResourceListQueryDto> = {}
): CreatorMarketplaceResourceListQueryDto {
  return { limit: 20, ...overrides } as CreatorMarketplaceResourceListQueryDto;
}

/** 커서를 끝까지 따라가며 전 항목을 모은다 (페이지 상한 20 안에서 순회). */
async function collectAll(
  service: CreatorMarketplaceService,
  overrides: Partial<CreatorMarketplaceResourceListQueryDto> = {}
) {
  const items: Array<{ id: string; kind: string; name: string; publisher: { id: string } }> = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 30; pageIndex += 1) {
    const page = await service.list(query({ ...overrides, cursor }));
    items.push(...(page.items as typeof items));
    if (!page.hasMore) return items;
    expect(page.nextCursor).toBeTruthy();
    cursor = page.nextCursor!;
  }
  throw new Error("pagination did not terminate");
}

const QA_STARTER_ID = "e0000001-0000-4000-8000-000000000001";
// 시크릿 스캔 회귀 방지: 게시자 id 리터럴을 두지 않고 공식 카탈로그에서 유도한다.
const OFFICIAL_PUBLISHER_ID = CREATOR_MARKETPLACE_STARTER_RECORDS.find(
  (record) => record.id === QA_STARTER_ID,
)?.publisher.id;

describe("CreatorMarketplaceService.list 공식 스타터 병합", () => {
  it("빈 DB에서도 스타터 카탈로그가 목록에 나온다 (목록-상세 비대칭 해소)", async () => {
    const { service } = makeService([]);
    const items = await collectAll(service);
    const ids = items.map((item) => item.id);
    expect(ids).toContain(QA_STARTER_ID);
    // 상세로 닿는 스타터는 목록으로도 닿아야 한다.
    const detail = await service.getById(QA_STARTER_ID);
    expect(ids).toContain(detail.id);
  });

  it("커서를 끝까지 따라가면 스타터 전수와 정확히 일치한다 (중복·누락 없음)", async () => {
    const { service } = makeService([]);
    const collected: string[] = [];
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < 30; pageIndex += 1) {
      const page = await service.list(query({ limit: 10, cursor }));
      expect(page.items.length).toBeLessThanOrEqual(10);
      collected.push(...page.items.map((item) => item.id));
      if (!page.hasMore) {
        expect(page.nextCursor).toBeNull();
        break;
      }
      expect(page.nextCursor).toBeTruthy();
      cursor = page.nextCursor!;
    }
    expect(new Set(collected).size).toBe(collected.length);
    expect([...collected].sort()).toEqual(
      CREATOR_MARKETPLACE_STARTER_RECORDS.map((record) => record.id).sort()
    );
  });

  it("DB 행과 스타터가 newest 순서로 병합된다", async () => {
    const fresh = makeStoredRow({
      id: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    const stale = makeStoredRow({
      id: "33333333-3333-4333-8333-333333333333",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    const { service } = makeService([stale, fresh]);
    const items = await collectAll(service);
    expect(items[0]?.id).toBe(fresh.id);
    expect(items[items.length - 1]?.id).toBe(stale.id);
    // 스타터(2026-09-01·2026-09-18)는 두 DB 행 사이에 자리한다.
    const starterIndex = items.findIndex((item) => item.id === QA_STARTER_ID);
    expect(starterIndex).toBeGreaterThan(0);
    expect(starterIndex).toBeLessThan(items.length - 1);
  });

  it("같은 id가 DB에 있으면 DB 행이 정본이고 중복되지 않는다", async () => {
    const dbVersion = makeStoredRow({
      id: QA_STARTER_ID,
      createdAt: "2026-09-18T00:00:00.000Z",
      name: "DB에 등록된 같은 id 리소스",
    });
    const { service } = makeService([dbVersion]);
    const items = await collectAll(service);
    const matches = items.filter((item) => item.id === QA_STARTER_ID);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.name).toBe("DB에 등록된 같은 id 리소스");
  });

  it("kind 필터는 스타터에도 적용된다", async () => {
    const { service } = makeService([]);
    const items = await collectAll(service, { kind: "brush" });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.kind === "brush")).toBe(true);
    const expected = CREATOR_MARKETPLACE_STARTER_RECORDS.filter(
      (record) => record.kind === "brush"
    ).map((record) => record.id);
    expect(items.map((item) => item.id).sort()).toEqual([...expected].sort());
  });

  it("publisher 필터가 다르면 스타터가 빠지고, 공식 게시자면 공식 스타터만 남는다", async () => {
    const { service } = makeService([]);
    const other = await collectAll(service, {
      publisher: "99999999-9999-4999-8999-999999999999",
    });
    expect(other).toHaveLength(0);
    const official = await collectAll(service, { publisher: OFFICIAL_PUBLISHER_ID });
    expect(official.length).toBeGreaterThan(0);
    expect(
      official.every((item) => item.publisher.id === OFFICIAL_PUBLISHER_ID)
    ).toBe(true);
    const expected = CREATOR_MARKETPLACE_STARTER_RECORDS.filter(
      (record) => record.publisher.id === OFFICIAL_PUBLISHER_ID
    ).map((record) => record.id);
    expect(official.map((item) => item.id).sort()).toEqual([...expected].sort());
  });

  it("검색 relevance 정렬에서도 스타터가 병합되고 커서가 이어진다", async () => {
    const { service } = makeService([]);
    const collected: string[] = [];
    let cursor: string | undefined;
    for (let pageIndex = 0; pageIndex < 10; pageIndex += 1) {
      const page = await service.list(
        query({ limit: 5, search: "브러시", cursor })
      );
      collected.push(...page.items.map((item) => item.id));
      if (!page.hasMore) break;
      cursor = page.nextCursor!;
    }
    expect(collected.length).toBeGreaterThan(0);
    expect(new Set(collected).size).toBe(collected.length);
    const expected = CREATOR_MARKETPLACE_STARTER_RECORDS.filter((record) =>
      record.name.toLowerCase().includes("브러시")
      || record.description.toLowerCase().includes("브러시")
      || record.packageId.toLowerCase().includes("브러시")
      || record.tags.some((tag) => tag.toLowerCase().includes("브러시"))
    ).map((record) => record.id);
    expect([...collected].sort()).toEqual([...expected].sort());
  });

  it("검색어 없는 relevance 정렬은 기존대로 거부한다", async () => {
    const { service } = makeService([]);
    await expect(service.list(query({ sort: "relevance" }))).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("저장소 오류는 기존대로 503으로 매핑한다", async () => {
    const { service, repository } = makeService([]);
    repository.list.mockRejectedValue(new Error("db down"));
    await expect(service.list(query())).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
