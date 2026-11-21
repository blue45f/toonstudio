/**
 * Wave V2-W3B: 온디스크 5아키타입 웹툰 키트 v2(`toonstudio-kit-v2/kit.json`) 런타임 로드·정규화·플랜 생성 검증.
 */
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  KIT_V2_ARCHETYPE_IDS,
  KIT_V2_WEBTOON_ID,
  readKitPlanV2Custom,
} from "../../contracts";

import { loadKitManifestFlow } from "./kit-load-flow";
import { buildKitPlanDetailed } from "./kit-plan";
import { isKitPlanV2 } from "./kit-plan-v2-types";

import type { KitFetchPort } from "./kit-load-flow";

const KIT_V2_MANIFEST_PATH = new URL(
  "../../../public/assets/characters/toonstudio-kit-v2/kit.json",
  import.meta.url,
);

function loadOnDiskKitV2Json(): unknown {
  return JSON.parse(readFileSync(KIT_V2_MANIFEST_PATH, "utf8")) as unknown;
}

describe("Kit v2 5-Archetype 온디스크 매니페스트 런타임 통합", () => {
  it("온디스크 toonstudio-kit-v2/kit.json을 loadKitManifestFlow로 정규화하고 5아키타입·12헤어·34의상·vrm-spring-bone-1.0을 보존한다", async () => {
    const rawJson = loadOnDiskKitV2Json();
    const manifestUrl = `/assets/characters/${KIT_V2_WEBTOON_ID}/kit.json`;
    const port: KitFetchPort = {
      fetchJson: async (url) => (url === manifestUrl ? { ok: true, json: rawJson } : { ok: false, status: 404, message: "404" }),
      fetchBytes: async () => ({ ok: false, status: 404, message: "404" }),
    };

    const loaded = await loadKitManifestFlow(
      port,
      { kitId: KIT_V2_WEBTOON_ID, kitVersion: 2 },
      { sha256: async () => "0".repeat(64), now: 1_000 },
    );
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.version).toBe(2);
    if (loaded.version !== 2) return;

    expect(loaded.rootUrl).toBe(`/assets/characters/${KIT_V2_WEBTOON_ID}`);
    expect(loaded.manifest.webtoonV2?.physicsMode).toBe("vrm-spring-bone-1.0");
    expect(Object.keys(loaded.manifest.webtoonV2?.archetypeBases ?? {})).toEqual([...KIT_V2_ARCHETYPE_IDS]);
    expect(loaded.manifest.parts.filter((part) => part.slot === "hair")).toHaveLength(12);
    expect(Object.keys(loaded.manifest.webtoonV2?.garmentByRawId ?? {})).toHaveLength(34);

    // 5개 아키타입 각각에 대해 실제 베이스 GLB URL과 다중 의상 층을 가진 KitPlanV2를 생성한다
    for (const archetypeId of KIT_V2_ARCHETYPE_IDS) {
      const baseId = archetypeId.startsWith("male") ? "male" : "female";
      const built = buildKitPlanDetailed(
        loaded.manifest,
        { kitId: KIT_V2_WEBTOON_ID, kitVersion: 2, baseId, archetypeId },
        { hair: "hair/soft-bob", top: "garments/dress-shirt", bottom: "garments/cargo-shorts", shoes: "garments/combat-boots" },
        {
          rootUrl: loaded.rootUrl,
          now: 1_000,
          wardrobe: {
            inner: null,
            outer: "garments/imperial-uniform-coat",
            legwear: "garments/knee-socks",
            accessories: [],
          },
        },
      );
      expect(built.ok, archetypeId).toBe(true);
      if (!built.ok) continue;
      expect(isKitPlanV2(built.plan)).toBe(true);
      if (!isKitPlanV2(built.plan)) continue;

      expect(built.plan.parts[0]?.id).toBe(`base/${archetypeId}`);
      expect(built.plan.parts[0]?.url).toContain(`${archetypeId}.glb`);
      expect(built.plan.custom.archetypeId).toBe(archetypeId);
      expect(built.plan.custom.physicsMode).toBe("vrm-spring-bone-1.0");
      expect(built.plan.custom.files.some((file) => file.id === "outer:garments/imperial-uniform-coat")).toBe(true);
      expect(built.plan.custom.files.some((file) => file.id === "legwear:garments/knee-socks")).toBe(true);

      const customView = readKitPlanV2Custom(built.plan);
      expect(customView?.materials["ts_outer_trim_imperial-uniform-coat"]?.channel).toBe("outer-trim");
      expect(customView?.materials["ts_hair_tip_soft-bob"]?.channel).toBe("hair-tip");
    }
  });
});
