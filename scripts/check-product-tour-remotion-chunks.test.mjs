/**
 * check-product-tour-remotion-chunks.mjs 단위 테스트 (Node 내장 test runner).
 * 실행: node --test scripts/check-product-tour-remotion-chunks.test.mjs
 *
 * 매니페스트 픽스처는 실제 Vite 매니페스트의 모양을 따른다(2026-10-22 규명).
 * - 정적 번들: 지연 로드 라우트가 리모션을 정적 import하면 모듈은 청크 안에 묶이고
 *   매니페스트에는 진입점·공유 청크만 적힌다. 현행 앱의 모양이다(앱 매니페스트
 *   2026-10-16·17 빌드와 Vite 8.3.4 합성 빌드에서 확인).
 * - 동적 진입점: 리모션을 `import("remotion")`처럼 직접 동적 import할 때만 pnpm
 *   인스턴스 경로가 매니페스트 키로 드러난다(Vite 8.3.4 합성 빌드에서 확인).
 * 초판 시험은 후자만 픽스처로 삼았고 "그 키가 없으면 실패"를 기대해, 실빌드에서
 * 항상 실패하는 게이트를 통과시켰다.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// 루트 Vitest 스위트와 node --test 양쪽에서 도는 이중 모드 (기존 scripts 테스트 관행).
const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  collectLockfileRemotionInstances,
  collectRemotionInstances,
  evaluateLockfileRemotionInstances,
  evaluateProductTourGate,
  evaluateRemotionManifest,
  evaluateViteDedupeSource,
  extractPackageInstanceId,
  findProductTourEntry,
} from "./check-product-tour-remotion-chunks.mjs";
import { REPO_ROOT } from "./lib/repo-paths.mjs";

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

const TOUR_KEY = "src/domains/marketing/ProductTourPage.tsx";

// 현행 앱의 모양 — ProductTourPage 가 ProductTourPlayer 를 거쳐 리모션을 정적 import 한다.
// 리모션은 ProductTourPage 청크 안에 묶여 매니페스트에는 모듈 경로가 없다.
const staticBundleManifest = {
  "index.html": {
    file: "assets/index-D6Egfy4T.js",
    name: "index",
    src: "index.html",
    isEntry: true,
    dynamicImports: [TOUR_KEY],
  },
  [TOUR_KEY]: {
    file: "assets/ProductTourPage-PXbbRu6v.js",
    name: "ProductTourPage",
    src: TOUR_KEY,
    isDynamicEntry: true,
    imports: ["index.html", "_product-tour-playback-Bj_8m9th.js"],
  },
  "_product-tour-playback-Bj_8m9th.js": {
    file: "assets/product-tour-playback-Bj_8m9th.js",
    name: "product-tour-playback",
  },
};

const REMOTION_KEY = "../../node_modules/.pnpm/remotion@4.0.536_react@19.3.1/node_modules/remotion/dist/esm/index.mjs";
const PLAYER_KEY = "../../node_modules/.pnpm/@remotion+player@4.0.536_react@19.3.1/node_modules/@remotion/player/dist/esm/index.mjs";

// 리모션을 동적 import 진입점으로 부를 때의 모양 — 이때만 인스턴스 경로가 키로 드러난다.
const dynamicEntryManifest = {
  ...staticBundleManifest,
  [PLAYER_KEY]: { file: "assets/esm-D20AhB3r.js", name: "esm", src: PLAYER_KEY, isDynamicEntry: true, imports: [REMOTION_KEY] },
  [REMOTION_KEY]: { file: "assets/esm-Dnrnv3sM.js", name: "esm", src: REMOTION_KEY, isDynamicEntry: true },
};

describe("findProductTourEntry", () => {
  it("키가 ProductTourPage.tsx 로 끝나는 진입점의 청크 파일을 돌려준다", () => {
    assert.deepEqual(findProductTourEntry(staticBundleManifest), {
      key: TOUR_KEY,
      file: "assets/ProductTourPage-PXbbRu6v.js",
    });
  });

  it("키가 달라도 src 가 맞으면 찾고, 파일이 없는 항목이나 다른 페이지는 무시한다", () => {
    const bySrc = { "alias-key": { file: "assets/tour.js", src: "apps/web/src/domains/marketing/ProductTourPage.tsx" } };
    assert.deepEqual(findProductTourEntry(bySrc), { key: "alias-key", file: "assets/tour.js" });
    assert.equal(findProductTourEntry({ [TOUR_KEY]: { name: "ProductTourPage" } }), null);
    assert.equal(findProductTourEntry({ "src/domains/marketing/ProductTourPlayer.tsx": { file: "assets/p.js" } }), null);
    assert.equal(findProductTourEntry(null), null);
  });
});

describe("evaluateRemotionManifest", () => {
  it("정적 번들 모양(현행 앱)은 모듈 경로가 매니페스트에 없어도 투어 진입점이 있으면 통과한다", () => {
    const result = evaluateRemotionManifest(staticBundleManifest);
    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
    assert.equal(result.tourEntry.file, "assets/ProductTourPage-PXbbRu6v.js");
    assert.deepEqual(result.summary.map((row) => row.instances), [[], []]);
  });

  it("초판 가정의 반례: 정적 번들 매니페스트에서는 인스턴스 경로가 하나도 잡히지 않는다", () => {
    const collected = collectRemotionInstances(staticBundleManifest);
    assert.equal(collected.get("remotion").size, 0);
    assert.equal(collected.get("@remotion/player").size, 0);
  });

  it("동적 진입점으로 드러난 단일 인스턴스는 통과하고 청크 분할 자체는 실패로 보지 않는다", () => {
    const splitManifest = {
      ...dynamicEntryManifest,
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

  it("#2373 수정 전 모양(react 19.2.7/19.3.1로 갈린 복사본)이 매니페스트에 드러나면 실패한다", () => {
    const duplicated = {
      ...dynamicEntryManifest,
      "../../node_modules/.pnpm/remotion@4.0.536_react@19.2.7/node_modules/remotion/dist/esm/index.mjs": {
        file: "assets/remotion-ddd.js",
      },
    };
    const result = evaluateRemotionManifest(duplicated);
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /remotion: 인스턴스가 2개/);
  });

  it("제품 투어 진입점이 없으면 통과로 위장하지 않고 실패한다", () => {
    const result = evaluateRemotionManifest({ "src/main.tsx": { file: "assets/main.js" } });
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /ProductTourPage\.tsx/);
    assert.equal(result.tourEntry, null);
  });
});

// pnpm-lock.yaml(v9) 발췌 — importers 의 version 줄, packages 섹션, snapshots 섹션을 함께 담는다.
function lockfileText({ snapshotKeys }) {
  const snapshots = snapshotKeys.map((key) => `  ${key}:\n    dependencies:\n      react: 19.3.1\n`).join("\n");
  return [
    "lockfileVersion: '9.0'",
    "",
    "importers:",
    "",
    "  .:",
    "    dependencies:",
    "      remotion:",
    "        specifier: 4.0.536",
    "        version: 4.0.536(react-dom@19.3.1(react@19.3.1))(react@19.3.1)",
    "",
    "packages:",
    "",
    "  remotion@4.0.536:",
    "    peerDependencies:",
    "      react: '>=16.8.0'",
    "",
    "  '@remotion/player@4.0.536':",
    "    peerDependencies:",
    "      react: '>=16.8.0'",
    "",
    "snapshots:",
    "",
    snapshots,
  ].join("\n");
}

const SINGLE_SNAPSHOTS = [
  "'@remotion/player@4.0.536(react-dom@19.3.1(react@19.3.1))(react@19.3.1)'",
  "remotion@4.0.536(react-dom@19.3.1(react@19.3.1))(react@19.3.1)",
];

describe("lockfile 인스턴스 판정", () => {
  it("snapshots 섹션의 키만 인스턴스로 센다 — importers 와 packages 섹션은 읽지 않는다", () => {
    const collected = collectLockfileRemotionInstances(lockfileText({ snapshotKeys: SINGLE_SNAPSHOTS }));
    assert.deepEqual([...collected.get("remotion")], ["remotion@4.0.536(react-dom@19.3.1(react@19.3.1))(react@19.3.1)"]);
    assert.deepEqual(
      [...collected.get("@remotion/player")],
      ["@remotion/player@4.0.536(react-dom@19.3.1(react@19.3.1))(react@19.3.1)"],
    );
  });

  it("패키지당 스냅샷이 하나면 통과한다", () => {
    const result = evaluateLockfileRemotionInstances(lockfileText({ snapshotKeys: SINGLE_SNAPSHOTS }));
    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  });

  it("#2373 수정 전 모양(피어 조합이 갈린 remotion 스냅샷 둘)은 실패한다", () => {
    const result = evaluateLockfileRemotionInstances(lockfileText({
      snapshotKeys: [
        ...SINGLE_SNAPSHOTS,
        "remotion@4.0.536(react-dom@19.2.7(react@19.2.7))(react@19.2.7)",
      ],
    }));
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /remotion: 인스턴스가 2개/);
    assert.match(result.failures[0], /react@19\.2\.7/);
    assert.match(result.failures[0], /react@19\.3\.1/);
  });

  it("버전이 다른 스냅샷이 함께 있어도 같은 패키지의 중복 인스턴스로 실패한다", () => {
    const result = evaluateLockfileRemotionInstances(lockfileText({
      snapshotKeys: [
        ...SINGLE_SNAPSHOTS,
        "'@remotion/player@4.0.535(react-dom@19.3.1(react@19.3.1))(react@19.3.1)'",
      ],
    }));
    assert.equal(result.ok, false);
    assert.match(result.failures[0], /@remotion\/player: 인스턴스가 2개/);
  });

  it("스냅샷이 없으면 통과로 위장하지 않고 실패한다", () => {
    const result = evaluateLockfileRemotionInstances(lockfileText({ snapshotKeys: [] }));
    assert.equal(result.ok, false);
    assert.equal(result.failures.length, 2);
    assert.match(result.failures[0], /remotion: pnpm-lock\.yaml의 snapshots에서 찾지 못했습니다/);
  });

  it("이름이 비슷한 다른 패키지는 같은 패키지로 세지 않는다", () => {
    const result = evaluateLockfileRemotionInstances(lockfileText({
      snapshotKeys: [
        ...SINGLE_SNAPSHOTS,
        "remotion-extras@1.0.0",
        "'@remotion/renderer@4.0.536(react-dom@19.3.1(react@19.3.1))(react@19.3.1)'",
      ],
    }));
    assert.equal(result.ok, true);
  });

  it("현재 저장소의 pnpm-lock.yaml 은 두 패키지 모두 단일 인스턴스다", () => {
    const result = evaluateLockfileRemotionInstances(readFileSync(join(REPO_ROOT, "pnpm-lock.yaml"), "utf8"));
    assert.deepEqual(result.failures, []);
    assert.deepEqual(result.summary.map((row) => row.instances.length), [1, 1]);
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

describe("evaluateProductTourGate", () => {
  const viteConfigText = 'resolve: { dedupe: ["react", "react-dom", "remotion", "@remotion/player"] }';
  const goodLockfile = lockfileText({ snapshotKeys: SINGLE_SNAPSHOTS });

  it("소스·lockfile·산출물 세 겹이 모두 맞으면 통과한다", () => {
    const result = evaluateProductTourGate({ viteConfigText, lockfileText: goodLockfile, manifest: staticBundleManifest });
    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  });

  it("매니페스트가 없으면(null) 산출물 검사만 건너뛰고 소스·lockfile 로 판정한다", () => {
    const result = evaluateProductTourGate({ viteConfigText, lockfileText: goodLockfile, manifest: null });
    assert.equal(result.ok, true);
    assert.equal(result.manifest, null);
    const diverged = evaluateProductTourGate({
      viteConfigText,
      lockfileText: lockfileText({ snapshotKeys: [...SINGLE_SNAPSHOTS, "remotion@4.0.536(react@19.2.7)"] }),
      manifest: null,
    });
    assert.equal(diverged.ok, false);
  });

  it("한 겹이라도 실패하면 전체가 실패하고 실패 사유가 모두 모인다", () => {
    const result = evaluateProductTourGate({
      viteConfigText: 'dedupe: ["react"]',
      lockfileText: lockfileText({ snapshotKeys: [...SINGLE_SNAPSHOTS, "remotion@4.0.536(react@19.2.7)"] }),
      manifest: { "src/main.tsx": { file: "assets/main.js" } },
    });
    assert.equal(result.ok, false);
    // dedupe 누락 2건(remotion·@remotion/player) + lockfile 중복 1건 + 투어 진입점 없음 1건.
    assert.equal(result.failures.length, 4);
  });
});
