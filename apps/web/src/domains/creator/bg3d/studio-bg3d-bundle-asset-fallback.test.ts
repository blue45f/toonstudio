import { describe, expect, it } from "vitest";

import { resolveStudioBg3dBundleAssetFallback } from "./studio-bg3d-bundle-asset-fallback";

const HASH = `sha256:${"a".repeat(64)}`;

describe("studio-bg3d-bundle-asset-fallback", () => {
  it("배포 완료면 내용 주소 서빙 URL을 돌려준다", () => {
    const resolved = resolveStudioBg3dBundleAssetFallback({
      deployAvailable: true,
      assetRoot: "/assets/studio/bundle-v2/",
      sha256: HASH,
    });
    expect(resolved.status).toBe("available");
    expect(resolved.url).toBe(`/assets/studio/bundle-v2/${"a".repeat(64)}.glb`);
    expect(resolved.fallback).toBe("none");
  });

  it("배포 미완료면 URL 없이 로컬 카탈로그 폴백을 지시한다", () => {
    const resolved = resolveStudioBg3dBundleAssetFallback({
      deployAvailable: false,
      assetRoot: "/assets/studio/bundle-v2/",
      sha256: HASH,
    });
    expect(resolved.status).toBe("unavailable");
    expect(resolved.url).toBeNull();
    expect(resolved.fallback).toBe("local-catalog");
  });

  it("sha256 형식이 아니면 배포 완료 판정이어도 미완료다", () => {
    const resolved = resolveStudioBg3dBundleAssetFallback({
      deployAvailable: true,
      assetRoot: "/assets/studio/bundle-v2/",
      sha256: "sha256:not-a-hash",
    });
    expect(resolved.status).toBe("unavailable");
    expect(resolved.url).toBeNull();
  });

  it("assetRoot의 끝 슬래시 유무와 무관하게 URL이 만들어진다", () => {
    const resolved = resolveStudioBg3dBundleAssetFallback({
      deployAvailable: true,
      assetRoot: "/assets/studio/bundle-v2",
      sha256: HASH,
    });
    expect(resolved.url).toBe(`/assets/studio/bundle-v2/${"a".repeat(64)}.glb`);
  });
});
