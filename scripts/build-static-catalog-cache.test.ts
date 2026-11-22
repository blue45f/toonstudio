import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { runStaticCatalogBuild } from "./build-static-catalog";

import type { Title } from "../apps/web/src/shared/lib/types";

function makeSampleTitle(overrides: Partial<Title> = {}): Title {
  return {
    id: "title-1",
    slug: "sample-webtoon",
    title: "샘플 웹툰",
    altTitles: ["Sample Webtoon"],
    type: "webtoon",
    status: "ongoing",
    ageRating: "all",
    genres: ["판타지"],
    tags: ["액션"],
    authors: [{ name: "홍길동", role: "both" }],
    synopsis: "테스트용 작품 시놉시스입니다.",
    cover: "https://example.invalid/cover.webp",
    releaseYear: 2026,
    updateDays: ["월"],
    featured: true,
    availability: [
      {
        platformId: "naver-webtoon",
        url: "https://example.invalid/title-1",
        pricing: "free",
        freeEpisodes: 5,
      },
    ],
    stats: {
      views: 120_000,
      likes: 4_500,
      rating: 9.7,
      ratingCount: 320,
      ratingDist: [5, 10, 20, 85, 200],
      bookmarks: 2_100,
      episodes: 42,
    },
    ...overrides,
  } as Title;
}

function writeCatalogGz(filePath: string, titles: Title[]): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, gzipSync(JSON.stringify({ titles })));
}

describe("build-static-catalog 입력 해시 스킵 캐시", () => {
  it("동일 입력·유효 출력에서는 즉시 건너뛰고, 입력·날짜·출력 손상·--force에서 안전하게 재생성한다", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "toonstudio-catalog-cache-"));
    try {
      const srcGz = path.join(dir, "catalog.json.gz");
      const relatedFile = path.join(dir, "related-info.json");
      const publicDir = path.join(dir, "public");
      const outDir = path.join(publicDir, "data");
      const cacheFile = path.join(dir, "cache/static-catalog.json");

      writeCatalogGz(srcGz, [
        makeSampleTitle({ id: "t-1", slug: "alpha", title: "알파" }),
        makeSampleTitle({ id: "t-2", slug: "beta", title: "베타", type: "webnovel", featured: false }),
      ]);
      writeFileSync(relatedFile, JSON.stringify({}));

      let newsCalls = 0;
      const writeNewsImpl = async ({ outFile }: { outFile: string }) => {
        newsCalls += 1;
        mkdirSync(path.dirname(outFile), { recursive: true });
        const payload = { items: [], generatedAt: "2026-11-22T00:00:00.000Z" };
        writeFileSync(outFile, JSON.stringify(payload));
        return payload;
      };

      const run = (overrides: Partial<Parameters<typeof runStaticCatalogBuild>[0]> = {}) =>
        runStaticCatalogBuild({
          srcGz,
          relatedFile,
          publicDir,
          outDir,
          cacheFile,
          kstDate: "2026-11-22",
          log: () => {},
          writeNewsImpl,
          ...overrides,
        });

      // 1) 최초 실행: 전체 생성
      const first = await run();
      expect(first.skipped).toBe(false);
      expect(first.titleCount).toBe(2);
      expect(newsCalls).toBe(1);
      expect(existsSync(path.join(outDir, "catalog/manifest.json"))).toBe(true);
      expect(existsSync(path.join(publicDir, "sitemap.xml"))).toBe(true);

      // 2) 동일 입력·동일 날짜 재실행: 캐시 적중으로 즉시 스킵
      const second = await run();
      expect(second.skipped).toBe(true);
      expect(second.reason).toBe("cache-hit");
      expect(second.inputsHash).toBe(first.inputsHash);
      expect(newsCalls).toBe(1);

      // 3) --force 옵션: 캐시 무시하고 강제 재생성
      const forced = await run({ force: true });
      expect(forced.skipped).toBe(false);
      expect(forced.reason).toBe("forced");
      expect(newsCalls).toBe(2);

      // 4) 출력 샤드 파일 1개 삭제 시 캐시 미스 → 자동 복구
      const manifest = JSON.parse(readFileSync(path.join(outDir, "catalog/manifest.json"), "utf8")) as {
        shards: Array<{ file: string }>;
      };
      const firstShardPath = path.join(outDir, manifest.shards[0].file);
      rmSync(firstShardPath);
      const afterShardMissing = await run();
      expect(afterShardMissing.skipped).toBe(false);
      expect(existsSync(firstShardPath)).toBe(true);
      expect(newsCalls).toBe(3);

      // 5) manifest 변조 시 캐시 미스 → 자동 복구
      writeFileSync(path.join(outDir, "catalog/manifest.json"), '{"version":1,"count":0,"shards":[]}');
      const afterManifestTamper = await run();
      expect(afterManifestTamper.skipped).toBe(false);
      expect(newsCalls).toBe(4);

      // 6) KST 날짜 변경 시 캐시 무효화
      const nextDay = await run({ kstDate: "2026-11-23" });
      expect(nextDay.skipped).toBe(false);
      expect(nextDay.inputsHash).not.toBe(first.inputsHash);
      expect(newsCalls).toBe(5);

      // 7) 입력 카탈로그 gz 내용 변경 시 캐시 무효화
      writeCatalogGz(srcGz, [
        makeSampleTitle({ id: "t-1", slug: "alpha", title: "알파 개정판" }),
        makeSampleTitle({ id: "t-2", slug: "beta", title: "베타", type: "webnovel", featured: false }),
        makeSampleTitle({ id: "t-3", slug: "gamma", title: "감마" }),
      ]);
      const afterInputChange = await run({ kstDate: "2026-11-23" });
      expect(afterInputChange.skipped).toBe(false);
      expect(afterInputChange.titleCount).toBe(3);
      expect(newsCalls).toBe(6);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
