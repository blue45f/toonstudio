import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { filterStudio2dScenes, getStudio2dAssetMetadata, isRecommendedStudio2dScene } from "../studio-2d-asset-quality";
import { BG_SCENES } from "../studio-bg-scenes";
import { STUDIO_BUNDLE_BACKGROUND_METADATA, STUDIO_BUNDLE_BG_SCENES } from "./studio-bundle-backgrounds";

describe("구매 번들 완성 배경의 실제 카탈로그", () => {
  it("두 배경의 공개 바이트·해시·CC0 출처가 등록된 실제 선택기와 일치한다", () => {
    expect(STUDIO_BUNDLE_BG_SCENES.map((scene) => scene.id)).toEqual(["cbv1-scene-park-garden", "cbv1-scene-dungeon-study"]);
    const root = new URL("../../../../public/assets/studio/bundle-scenes-v1/", import.meta.url);
    expect(readdirSync(root).sort()).toEqual(["manifest.json", ...STUDIO_BUNDLE_BG_SCENES.flatMap((scene) => [`${scene.id}.webp`, `${scene.id}-preview.webp`])].sort());
    for (const scene of STUDIO_BUNDLE_BG_SCENES) {
      expect(BG_SCENES.find((entry) => entry.id === scene.id)).toEqual(scene);
      const metadata = getStudio2dAssetMetadata(scene);
      expect(metadata).toBeDefined();
      const body = readFileSync(new URL(`${scene.id}.webp`, root));
      expect(body.length).toBe(metadata?.bytes);
      expect(createHash("sha256").update(body).digest("hex")).toBe(metadata?.sha256);
      expect(body.subarray(0, 4).toString()).toBe("RIFF");
      expect(body.subarray(8, 12).toString()).toBe("WEBP");
      expect(metadata?.provenance).toMatchObject({ kind: "creator-bundle-cc0", licenseStatus: "cc0-verified", licenseId: "CC0-1.0" });
      expect(metadata?.style).toBe("stylized-low-poly");
      expect(scene.bundleSourceCredit).toMatchObject({ contentHash: `sha256:${metadata?.sha256}`, status: "public-domain", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/" });
      expect(isRecommendedStudio2dScene(scene)).toBe(true);
      expect(getStudio2dAssetMetadata({ ...scene, imgSrc: "/unreviewed-replacement.webp" })).toBeUndefined();
    }
  });
  it("큰 원본·실내외·장르 검색에서 실제 완성 장면으로 선택할 수 있다", () => {
    const groups = [{ genre: "all", scenes: STUDIO_BUNDLE_BG_SCENES }];
    expect(filterStudio2dScenes(groups, { query: "정원", quality: "large", environment: "실외", emptySceneOnly: true }).map((scene) => scene.id)).toEqual(["cbv1-scene-park-garden"]);
    expect(filterStudio2dScenes(groups, { query: "서재", environment: "실내", textFreeOnly: true }).map((scene) => scene.id)).toEqual(["cbv1-scene-dungeon-study"]);
    expect(STUDIO_BUNDLE_BACKGROUND_METADATA.every((asset) => asset.width === 2048 && asset.height === 1152 && !asset.containsPeople && !asset.containsText)).toBe(true);
  });
});
