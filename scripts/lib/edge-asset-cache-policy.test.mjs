import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  classifyEdgeAssetPath,
  hasContentHashFingerprint,
  IMMUTABLE_EDGE_CACHE_CONTROL,
  ONE_YEAR_MAX_AGE_SECONDS,
  parseCacheControl,
  parseCloudflareHeaders,
  REVALIDATED_ENTRYPOINT_CACHE_CONTROL,
  resolveCloudflareHeadersForPath,
  validateAssetCacheHeader,
  validateCloudflareHeadersPolicy,
  validateEdgeAssetCacheManifest,
} from "./edge-asset-cache-policy.mjs";

const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));

describe("edge-asset-cache-policy: 해시 지문 및 경로 분류", () => {
  it("3D·텍스처·JS·CSS 해시 지문 에셋을 immutable-hashed-asset으로 분류한다", () => {
    const hashedAssets = [
      "/assets/models/hero-a1b2c3d4.glb",
      "/assets/textures/albedo-9f8e7d6c.ktx2",
      "/assets/images/cut-01-12ab34cd.webp",
      "/assets/index-B9x2K7mQ.js",
      "/assets/chunk-AbCdEfGh.js",
      "/assets/studio-8f7a6b5c.css",
      "/assets/studio/bundle-v2/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef.glb",
      "/cdn/props/chair.deadbeef.glb",
      "/cdn/tex/brick.1234abcd.ktx2",
    ];

    for (const pathname of hashedAssets) {
      assert.equal(hasContentHashFingerprint(pathname), true, `${pathname} 해시 인식 실패`);
      assert.equal(
        classifyEdgeAssetPath(pathname),
        "immutable-hashed-asset",
        `${pathname} 분류 불일치`,
      );
    }
  });

  it("비-해시 HTML·매니페스트·서비스워커를 revalidated-entrypoint로 분류한다", () => {
    const entrypoints = [
      "/",
      "/index.html",
      "/offline-draw/portable.html",
      "/manifest.json",
      "/site.webmanifest",
      "/assets/studio/cc0-20260906/manifest.json",
      "/assets/3d/environments/bundle-v1/theme-packs.json",
      "/sw.js",
      "/offline-draw/sw.js",
    ];

    for (const pathname of entrypoints) {
      assert.equal(
        classifyEdgeAssetPath(pathname),
        "revalidated-entrypoint",
        `${pathname} 재검증 진입점 분류 실패`,
      );
    }
  });

  it("해시가 없는 일반 영문 하이픈 파일명은 해시 에셋으로 오분류하지 않는다", () => {
    assert.equal(hasContentHashFingerprint("/assets/studio-core.js"), false);
    assert.equal(hasContentHashFingerprint("/assets/3d/theme-packs.json"), false);
    assert.equal(classifyEdgeAssetPath("/assets/studio-core.js"), "unhashed-static-asset");
  });
});

describe("edge-asset-cache-policy: Cache-Control 검증 규칙", () => {
  it("불변 해시 3D·텍스처·JS·CSS 에셋에 public, max-age=31536000, immutable을 통과시킨다", () => {
    const paths = [
      "/assets/models/scene-a1b2c3d4.glb",
      "/assets/textures/wall-12345678.ktx2",
      "/assets/thumbs/cut-99aabbcc.webp",
      "/assets/main-K2p9L0xQ.js",
      "/assets/main-K2p9L0xQ.css",
    ];
    for (const pathname of paths) {
      const result = validateAssetCacheHeader(pathname, IMMUTABLE_EDGE_CACHE_CONTROL);
      assert.equal(result.ok, true, `${pathname}: ${JSON.stringify(result.issues)}`);
      assert.equal(result.parsed.maxAge, ONE_YEAR_MAX_AGE_SECONDS);
      assert.equal(result.parsed.hasImmutable, true);
      assert.equal(result.parsed.hasPublic, true);
    }
  });

  it("불변 해시 에셋에 짧은 max-age, immutable 누락, public 누락, no-cache 혼입을 차단한다", () => {
    const shortMaxAge = validateAssetCacheHeader(
      "/assets/models/scene-a1b2c3d4.glb",
      "public, max-age=86400, immutable",
    );
    assert.equal(shortMaxAge.ok, false);
    assert.ok(shortMaxAge.issues.some((issue) => issue.code === "IMMUTABLE_ASSET_SHORT_MAX_AGE"));

    const missingImmutable = validateAssetCacheHeader(
      "/assets/textures/wall-12345678.ktx2",
      "public, max-age=31536000",
    );
    assert.equal(missingImmutable.ok, false);
    assert.ok(
      missingImmutable.issues.some((issue) => issue.code === "IMMUTABLE_ASSET_MISSING_IMMUTABLE"),
    );

    const missingPublic = validateAssetCacheHeader(
      "/assets/thumbs/cut-99aabbcc.webp",
      "max-age=31536000, immutable",
    );
    assert.equal(missingPublic.ok, false);
    assert.ok(missingPublic.issues.some((issue) => issue.code === "IMMUTABLE_ASSET_MISSING_PUBLIC"));

    const forbiddenDirective = validateAssetCacheHeader(
      "/assets/main-K2p9L0xQ.js",
      "public, max-age=31536000, immutable, must-revalidate",
    );
    assert.equal(forbiddenDirective.ok, false);
    assert.ok(
      forbiddenDirective.issues.some(
        (issue) => issue.code === "IMMUTABLE_ASSET_FORBIDDEN_DIRECTIVE",
      ),
    );

    const edgeBypass = validateAssetCacheHeader(
      "/assets/models/scene-a1b2c3d4.glb",
      "public, max-age=31536000, immutable, s-maxage=0",
      { forbidEdgeBypassSMaxAge: true },
    );
    assert.equal(edgeBypass.ok, false);
    assert.ok(edgeBypass.issues.some((issue) => issue.code === "IMMUTABLE_ASSET_EDGE_BYPASS"));
  });

  it("비-해시 index.html과 manifest.json은 no-cache 또는 must-revalidate만 허용하고 immutable/장기 캐시를 차단한다", () => {
    assert.equal(validateAssetCacheHeader("/index.html", "no-cache").ok, true);
    assert.equal(
      validateAssetCacheHeader("/manifest.json", REVALIDATED_ENTRYPOINT_CACHE_CONTROL).ok,
      true,
    );
    assert.equal(validateAssetCacheHeader("/sw.js", "no-cache").ok, true);

    const badHtmlImmutable = validateAssetCacheHeader(
      "/index.html",
      "public, max-age=31536000, immutable",
    );
    assert.equal(badHtmlImmutable.ok, false);
    const codes = new Set(badHtmlImmutable.issues.map((issue) => issue.code));
    assert.ok(codes.has("REVALIDATED_ASSET_FORBIDS_IMMUTABLE"));
    assert.ok(codes.has("REVALIDATED_ASSET_NONZERO_MAX_AGE"));
    assert.ok(codes.has("REVALIDATED_ASSET_MISSING_REVALIDATION"));

    const missingHeader = validateAssetCacheHeader("/manifest.json", "");
    assert.equal(missingHeader.ok, false);
    assert.ok(
      missingHeader.issues.some((issue) => issue.code === "REVALIDATED_ASSET_MISSING_HEADER"),
    );
  });

  it("비-해시 일반 경로에 immutable을 오용하면 경고를 반환하고, 명시적 허용 접두사는 통과시킨다", () => {
    const unsafe = validateAssetCacheHeader(
      "/media/latest-avatar.webp",
      IMMUTABLE_EDGE_CACHE_CONTROL,
    );
    assert.equal(unsafe.ok, false);
    assert.ok(unsafe.issues.some((issue) => issue.code === "UNHASHED_ASSET_FORBIDS_IMMUTABLE"));

    const allowedVersioned = validateAssetCacheHeader(
      "/assets/studio/cc0-20260906/assets/chair/model.glb",
      IMMUTABLE_EDGE_CACHE_CONTROL,
      { allowUnhashedImmutablePrefixes: ["/assets/studio/cc0-20260906/"] },
    );
    assert.equal(allowedVersioned.ok, true);
  });

  it("잘못된 Cache-Control 숫자 지시문을 CACHE_CONTROL_MALFORMED로 탐지한다", () => {
    const parsed = parseCacheControl("public, max-age=abc, immutable");
    assert.ok(parsed.invalidTokens.includes("max-age=abc"));
    const result = validateAssetCacheHeader(
      "/assets/index-1234abcd.js",
      "public, max-age=abc, immutable",
    );
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((issue) => issue.code === "CACHE_CONTROL_MALFORMED"));
  });
});

describe("edge-asset-cache-policy: Cloudflare _headers 해석 및 실저장소 검증", () => {
  it("! Cache-Control 제거 지시문으로 좁은 매니페스트 규칙이 상위 /assets/* 규칙을 안전히 덮어쓰는지 해석한다", () => {
    const sampleHeaders = [
      "/assets/*",
      "  Cache-Control: public, max-age=31536000, immutable",
      "",
      "/assets/studio/cc0-20260906/manifest.json",
      "  ! Cache-Control",
      "  Cache-Control: public, max-age=0, must-revalidate",
      "",
      "/index.html",
      "  Cache-Control: no-cache",
    ].join("\n");

    const rules = parseCloudflareHeaders(sampleHeaders);
    assert.equal(
      resolveCloudflareHeadersForPath(rules, "/assets/models/hero-a1b2c3d4.glb")["cache-control"],
      "public, max-age=31536000, immutable",
    );
    assert.equal(
      resolveCloudflareHeadersForPath(rules, "/assets/studio/cc0-20260906/manifest.json")[
        "cache-control"
      ],
      "public, max-age=0, must-revalidate",
    );

    const report = validateCloudflareHeadersPolicy(sampleHeaders, [
      "/assets/models/hero-a1b2c3d4.glb",
      "/assets/textures/albedo-9f8e7d6c.ktx2",
      "/assets/img/cut-deadbeef.webp",
      "/assets/index-A1b2C3d4.js",
      "/assets/studio/cc0-20260906/manifest.json",
      "/index.html",
    ]);
    assert.equal(report.ok, true);
    assert.equal(report.counts.immutableHashed, 4);
    assert.equal(report.counts.revalidatedEntrypoint, 2);
  });

  it("실제 apps/web/public/_headers의 /assets/* 해시 에셋과 매니페스트·sw.js 캐시 규칙이 정책을 준수한다", () => {
    const repoHeaders = readFileSync(resolve(REPO_ROOT, "apps/web/public/_headers"), "utf8");
    const report = validateCloudflareHeadersPolicy(repoHeaders, [
      "/assets/index-A1b2C3d4.js",
      "/assets/style-8f9e0a1b.css",
      "/assets/models/room-a1b2c3d4.glb",
      "/assets/textures/wall-9f8e7d6c.ktx2",
      "/assets/thumbs/preview-deadbeef.webp",
      "/assets/studio/cc0-20260906/manifest.json",
      "/assets/studio/bundle-renders-v1/manifest.json",
      "/assets/3d/environments/bundle-v1/theme-packs.json",
      "/sw.js",
      "/offline-draw/sw.js",
    ]);
    assert.equal(report.ok, true, JSON.stringify(report.violations, null, 2));
    assert.equal(report.checkedCount, 10);
  });

  it("R2 업로드 매니페스트 배치 검증에서 위반 항목과 집계 카운트를 정확히 보고한다", () => {
    const report = validateEdgeAssetCacheManifest([
      { path: "/assets/3d/hero-1a2b3c4d.glb", cacheControl: IMMUTABLE_EDGE_CACHE_CONTROL },
      { path: "/assets/tex/skin-5e6f7a8b.ktx2", cacheControl: "public, max-age=600" },
      { path: "/manifest.json", cacheControl: "public, max-age=3600" },
    ]);
    assert.equal(report.ok, false);
    assert.equal(report.checkedCount, 3);
    assert.equal(report.counts.immutableHashed, 2);
    assert.equal(report.counts.revalidatedEntrypoint, 1);
    assert.ok(
      report.violations.some(
        (v) => v.pathname === "/assets/tex/skin-5e6f7a8b.ktx2" && v.code === "IMMUTABLE_ASSET_SHORT_MAX_AGE",
      ),
    );
    assert.ok(
      report.violations.some(
        (v) => v.pathname === "/manifest.json" && v.code === "REVALIDATED_ASSET_NONZERO_MAX_AGE",
      ),
    );
  });
});
