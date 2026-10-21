/**
 * check-product-tour-remotion-chunks.mjs 단위 테스트 (Node 내장 test runner).
 * 실행: node --test scripts/check-product-tour-remotion-chunks.test.mjs
 * 픽스처는 #2373 수정 전후의 pnpm 인스턴스 경로 모양을 그대로 재현한다.
 */
import assert from "node:assert/strict";

// 루트 Vitest 스위트와 node --test 양쪽에서 도는 이중 모드 (기존 scripts 테스트 관행).
const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  collectRemotionInstances,
  evaluateRemotionManifest,
  evaluateViteDedupeSource,
  extractPackageInstanceId,
} from "./check-product-tour-remotion-chunks.mjs";

describe("extractPackageInstanceId", () => {
  it("pnpm 인스턴스 경로에서 피어 접미사까지 포함한 식별자를 뽑는다", () => {
    assert.equal(
      extractPackageInstanceId(
        "../../node_modules/.pnpm/remotion@4.0.536_react@19.3.1/node_modules/remotion/dist/esm/index.mjs",
        "remotion",
      ),
      "remotion@4.0.536_react@19.3.1",
    );
    assert.equal(
      extractPackageInstanceId(
        "../../node_modules/.pnpm/@remotion+player@4.0.536_react@19.3.1/node_modules/@remotion/player/dist/esm/index.mjs",
        "@remotion/player",
      ),
      "@remotion+player@4.0.536_react@19.3.1",
    );
  });

  it("remotion과 @remotion/player를 서로의 접두사로 오인하지 않는다", () => {
    assert.equal(
      extractPackageInstanceId(
        "node_modules/.pnpm/@remotion+player@4.0.536/node_modules/@remotion/player/dist/index.mjs",
        "remotion",
      ),
      null,
    );
  });

  it("일반 node_modules 경로는 plain 인스턴스 하나로 접는다", () => {
    assert.equal(extractPackageInstanceId("node_modules/remotion/dist/index.mjs", "remotion"), "remotion@plain");
    assert.equal(extractPackageInstanceId("src/domains/marketing/ProductTourPlayer.tsx", "remotion"), null);
  });
});

const singleInstanceManifest = {
  "src/domains/marketing/ProductTourPlayer.tsx": {
    file: "assets/ProductTourPlayer-aaa.js",
    src: "src/domains/marketing/ProductTourPlayer.tsx",
  },
  "../../node_modules/.pnpm/remotion@4.0.536_react@19.3.1/node_modules/remotion/dist/esm/index.mjs": {
    file: "assets/remotion-bbb.js",
  },
  "../../node_modules/.pnpm/@remotion+player@4.0.536_react@19.3.1/node_modules/@remotion/player/dist/esm/index.mjs": {
    file: "assets/remotion-bbb.js",
  },
};

describe("evaluateRemotionManifest", () => {
  it("단일 인스턴스 매니페스트는 통과하고 청크 분할 자체는 실패로 보지 않는다", () => {
    const splitManifest = {
      ...singleInstanceManifest,
      "../../node_modules/.pnpm/remotion@4.0.536_react@19.3.1/node_modules/remotion/dist/esm/timeline.mjs": {
        file: "assets/remotion-ccc.js",
      },
    };
    const result = evaluateRemotionManifest(splitManifest);
    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
    const collected = collectRemotionInstances(splitManifest);
    assert.equal(collected.get("remotion").size, 1);
    assert.equal(collected.get("remotion").get("remotion@4.0.536_react@19.3.1").size, 2);
  });

  it("#2373 수정 전 모양(react 19.2.7/19.3.1로 갈린 복사본)은 실패한다", () => {
    const duplicated = {
      ...singleInstanceManifest,
      "../../node_modules/.pnpm/remotion@4.0.536_react@19.2.7/node_modules/remotion/dist/esm/index.mjs": {
        file: "assets/remotion-ddd.js",
      },
    };
    const result = evaluateRemotionManifest(duplicated);
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /remotion: 인스턴스가 2개/);
  });

  it("투어 모듈이 매니페스트에 없으면 통과로 위장하지 않고 실패한다", () => {
    const result = evaluateRemotionManifest({ "src/main.tsx": { file: "assets/main.js" } });
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 2);
  });
});

describe("evaluateViteDedupeSource", () => {
  it("현행 dedupe 선언은 통과한다", () => {
    const result = evaluateViteDedupeSource(
      'resolve: { dedupe: ["react", "react-dom", "remotion", "@remotion/player"] }',
    );
    assert.equal(result.ok, true);
  });

  it("remotion이 dedupe에서 빠지면 실패한다", () => {
    const result = evaluateViteDedupeSource('dedupe: ["react", "@remotion/player"]');
    assert.equal(result.ok, false);
    assert.match(result.failures[0], /"remotion"/);
  });
});
