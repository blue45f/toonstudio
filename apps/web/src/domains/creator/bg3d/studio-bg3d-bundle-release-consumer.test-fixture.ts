import { createHash } from "node:crypto";
import { vi } from "vitest";

import * as releaseModule from "./studio-bg3d-bundle-release";

/** 실제 원문과 SHA를 사용하는 소비자 회귀용 발행 쌍이다. 제품 인입 성공을 대신하지 않는다. */
export function consumerReleaseFixture(catalog: Record<string, unknown>) {
  const body = JSON.stringify(catalog);
  const checksum = (text: string) => createHash("sha256").update(text).digest("hex");
  const catalogSha = checksum(body);
  const rows: unknown[] = Array.isArray(catalog.assets) ? catalog.assets : [];
  const assetBytes = rows.reduce<number>((sum, row) => {
    if (row === null || typeof row !== "object" || !("bytes" in row) || typeof row.bytes !== "number") {
      throw new TypeError("회귀 catalog의 에셋 바이트가 필요합니다.");
    }
    return sum + row.bytes;
  }, 0);
  const indexBody = JSON.stringify({ schema: "toonstudio.bundle-v2-deploy-index.v1", version: 1,
    keyScheme: "sha256", files: rows.length, bytes: assetBytes, catalogSha256: catalogSha });
  const indexSha = checksum(indexBody);
  const release = releaseModule.requireStudioBg3dBundleRelease({ schema: "toonstudio.bg3d-bundle-release.v1", version: 1,
    catalog: { url: `/assets/3d/environments/bundle-v1/theme-packs.${catalogSha}.json`, sha256: catalogSha,
      bytes: new TextEncoder().encode(body).byteLength },
    index: { url: `/assets/3d/environments/bundle-v1/deploy-index.${indexSha}.json`, sha256: indexSha,
      bytes: new TextEncoder().encode(indexBody).byteLength } });
  return { release, catalogResponse: () => new Response(body, { headers: { "content-type": "application/json" } }) };
}

/** 실제 기본 loader가 합성 발행 쌍을 사용한다. parser·원문 SHA 검사는 mock하지 않는다. */
export function bindConsumerReleaseFixture(readCatalog: () => Record<string, unknown>): void {
  vi.spyOn(releaseModule, "getBuildFixedStudioBg3dBundleRelease")
    .mockImplementation(() => consumerReleaseFixture(readCatalog()).release);
}

export function isConsumerCatalogUrl(url: string): boolean {
  return /^\/assets\/3d\/environments\/bundle-v1\/theme-packs(?:\.[a-f0-9]{64})?\.json$/u.test(url);
}
