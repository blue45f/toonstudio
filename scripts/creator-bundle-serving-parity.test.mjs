import { describe, expect, it } from "vitest";

import {
  cloudflareLargeAssetDescriptor,
  cloudflareLargeAssetKey,
} from "../deploy/cloudflare-static/src/large-static-assets.ts";
import {
  STUDIO_BG3D_BUNDLE_ASSET_ROOT,
  studioBg3dBundleAssetUrl,
} from "../apps/web/src/domains/creator/bg3d/studio-bg3d-bundle-theme-packs.ts";
import {
  BUNDLE_V2_INDEX_KEY,
  BUNDLE_V2_KEY_PREFIX,
  bundleV2ObjectKey,
  bundleV2PublicPath,
} from "./plan-creator-bundle-deploy.mjs";

/**
 * 번들 GLB의 서빙 규칙은 세 곳이 나눠 가진다: 로더(URL 생성), 배포 플래너(R2 키 생성), Worker(경로 → R2 키).
 * 한 곳만 바뀌면 업로드한 객체를 앱이 찾지 못하거나 가드가 빠지므로, 세 곳이 같은 값을 내는지 고정한다.
 */

const SHAS = [
  "d2227ed901e6a19b768ac404016ff10696a5be849e2b2cfc9600400c24bd13c5",
  "0".repeat(64),
  "f".repeat(64),
];

describe("bundle-v2 서빙 규칙 정합 (로더 · 플래너 · Worker)", () => {
  it.each(SHAS)("로더 URL = 플래너 공개 경로 = Worker가 읽는 R2 키 (%s)", (sha) => {
    const asset = { sha256: `sha256:${sha}` };
    const url = studioBg3dBundleAssetUrl(asset, { assetRoot: STUDIO_BG3D_BUNDLE_ASSET_ROOT });
    expect(url).toBe(bundleV2PublicPath(sha));
    expect(url).toBe(`/assets/studio/bundle-v2/${sha}.glb`);
    expect(cloudflareLargeAssetKey(url)).toBe(bundleV2ObjectKey(sha));
    const descriptor = cloudflareLargeAssetDescriptor(url);
    expect(descriptor?.contentType).toBe("model/gltf-binary");
    expect(descriptor?.sameOriginOnly).toBe(true);
  });

  it("로더 에셋 루트와 플래너 키 접두사, 배포 인덱스 경로가 같은 트리를 가리킨다", () => {
    expect(STUDIO_BG3D_BUNDLE_ASSET_ROOT).toBe(`/${BUNDLE_V2_KEY_PREFIX}`);
    const index = cloudflareLargeAssetDescriptor(`/${BUNDLE_V2_INDEX_KEY}`);
    expect(index?.sameOriginOnly).toBe(true);
    expect(cloudflareLargeAssetKey(`/${BUNDLE_V2_INDEX_KEY}`)).toBe(BUNDLE_V2_INDEX_KEY);
  });

  it("원본 폴더·파일명이 든 옛 경로형 URL은 플래너가 키로 만들지 않고 Worker도 R2 키로 복원하지 않는다", () => {
    // 옛 규칙의 키(원본 경로)로 올린 객체가 R2에 남아 있어도 Worker가 내주지 않는다 (sha256 키만 서빙한다).
    expect(() => bundleV2ObjectKey("cbv1-ingest-001-001-city/native/Basketball.glb")).toThrow(TypeError);
    for (const legacy of [
      "/assets/studio/bundle-v2/cbv1-ingest-001-001-city/native/Basketball.glb",
      "/assets/studio/bundle-v2/cbv1-ingest-001-001-city/native/Some%20Folder/Model%2BA%26B.glb",
      `/assets/studio/bundle-v2/${SHAS[0].toUpperCase()}.glb`,
      `/assets/studio/bundle-v2/${SHAS[0]}.glb.br`,
    ]) {
      expect(cloudflareLargeAssetDescriptor(legacy), legacy).toBeNull();
      expect(cloudflareLargeAssetKey(legacy), legacy).toBeNull();
    }
  });
});
