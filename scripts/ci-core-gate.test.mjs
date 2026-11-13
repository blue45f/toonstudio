import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertCoreResults, REQUIRED_CORE_GATES } from "./ci-core-gate.mjs";
import { REQUIRED_VITEST_TARGETS, SHARD_NAMES, executionTargetsByShard, expandGlobTargets } from "./ci-core-regression-shards.mjs";
import { resolveRequiredTargets } from "./run-core-vitest.mjs";
import { SERIAL_TEST_FILES } from "../vitest.serial-test-files.mjs";
import { assertTrackedDocumentInputs, fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const success = () => Object.fromEntries(
  REQUIRED_CORE_GATES.map((name) => [name, { result: "success" }]),
);

test("accepts actual success from every declared gate", () => {
  assert.doesNotThrow(() => assertCoreResults(success()));
});

test("rejects every non-success or missing gate without registering hundreds of cases", () => {
  const statuses = ["failure", "cancelled", "skipped", "pending", "neutral", undefined];
  for (const name of REQUIRED_CORE_GATES) {
    for (const status of statuses) {
      assert.throws(
        () => assertCoreResults({ ...success(), [name]: { result: status } }),
        /actual success/,
        `${name}:${String(status)}`,
      );
    }

    const results = success();
    delete results[name];
    assert.throws(() => assertCoreResults(results), /actual success/, `missing:${name}`);
  }
});

test("rejects empty, malformed, inherited and unknown dependencies", () => {
  for (const results of [null, undefined, [], {}, "success", false, Object.create(success())]) {
    assert.throws(() => assertCoreResults(results));
  }
  assert.throws(
    () => assertCoreResults({ ...success(), ignored: { result: "failure" } }),
    /unrecognized/,
  );
});

test("CLI exits nonzero for malformed JSON and failed gates, then succeeds once", () => {
  const script = fileURLToPath(new URL("./ci-core-gate.mjs", import.meta.url));
  const invalidInputs = [
    "not-json",
    "",
    "null",
    "{}",
    JSON.stringify({ ...success(), serial: { result: "skipped" } }),
  ];

  for (const raw of invalidInputs) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, CORE_RESULTS: raw },
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
  }

  const result = spawnSync(process.execPath, [script], {
    env: { ...process.env, CORE_RESULTS: JSON.stringify(success()) },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /all required checks succeeded/);
});

test("Core 타입·coverage는 표준 runner에서 실패를 숨기지 않고 65분 한도로 실행한다", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const start = ci.indexOf("\n  typecheck:"), end = ci.indexOf("\n  static:", start);
  assert(start >= 0 && end > start, "실제 typecheck job 범위를 읽어야 합니다.");
  const typecheck = ci.slice(start, end);
  const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.match(typecheck, /^ {4}runs-on: ubuntu-24\.04$/mu);
  assert.match(typecheck, /run: \|\n {10}set -euo pipefail\n {10}pnpm run typecheck\n {10}pnpm run typecheck:cloudflare-realtime\n/u);
  assert.match(typecheck, /- name: Enforce type-coverage ratchet \(typed identifier floor\)\n {8}run: pnpm run check:type-coverage\n/u);
  assert(typecheck.indexOf("pnpm run check:type-coverage") > typecheck.indexOf("pnpm run typecheck:cloudflare-realtime"));
  assert.equal(packageJson.scripts["check:type-coverage"], "type-coverage --at-least 95");
  assert.equal(packageJson.scripts["typecheck:web"], "node scripts/typecheck-shards.mjs --heap-mb 8192 --max-source-bytes 12582912");
  assert.doesNotMatch(typecheck, /continue-on-error|\|\|\s*true|set\s+\+e|--passWithNoTests/u);
  assert.match(typecheck, /^ {4}timeout-minutes: 65$/mu);
});


test("브러시 디스크·화면 ROI·실제 갈필 경계 회귀를 필수 Core 소유자에서 한 번 실행한다", () => {
  const execution = executionTargetsByShard();
  const files = Object.fromEntries(SHARD_NAMES.map((name) => [name, resolveRequiredTargets(expandGlobTargets(execution[name]))]));
  for (const [target, owner] of [
    ["scripts/toonstudio-integration-disk-policy.test.mjs", "studio-foundation"],
    ["scripts/lib/studio-smart-shape-visible-grid.test.ts", "studio-foundation"],
    ["scripts/lib/studio-filter-dialog-surface.test.ts", "studio-foundation"],
    ["apps/web/src/app/spatial-campus/campus-route-coverage.test.ts", "studio-foundation"],
    ["apps/web/src/shared/language/error-copy.guard.test.ts", "studio-foundation"],
    ["apps/web/src/shared/language/tone-copy.guard.test.ts", "studio-foundation"],
    ["apps/web/src/shared/components/LanguagePicker.test.tsx", "studio-foundation"],
    ["apps/web/src/shared/components/route-purpose-scene.contract.test.ts", "studio-foundation"],
    ["apps/web/src/domains/collaboration/hiring/HiringDiscovery.test.tsx", "studio-foundation"],
    ["apps/web/src/domains/creator/mesh-surface/studio-mesh-surface-plan.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/ai/StudioAiSuperSuiteModal.test.tsx", "studio-foundation"],
    ["scripts/secretlint-files.test.mjs", "studio-foundation"],
    ["scripts/studio-review-local-storage-certificates.test.mjs", "studio-foundation"],
    ["scripts/seed/persona-accounts-seed.test.mjs", "studio-foundation"],
    ["apps/web/tools/browser-harnesses/plasticine-materials/browser-png-csp.test.mjs", "studio-foundation"],
    ["tests/integration/api-web/api/modules/creator/studio-crdt-root-schema-boundary.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/studio-companion-browser-harness-boundary.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/live/studio-crdt-archive-bridge.test.ts", "studio-foundation"],
    ["apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-float32-atlas.test.ts", "studio-editing"],
    ["tests/integration/web-api/domains/creator/virtual-space/studio-virtual-space-design-closure.test.ts", "product"],
    ["apps/api/src/modules/creator/studio-crdt-bg3d-shape.test.ts", "product"],
    ["apps/web/src/domains/creator/brush/studio-wet-wash-live-pipeline.test.ts", "studio-editing"],
    ["apps/web/src/domains/creator/brush/wet-paper/studio-wet-paper-host.test.ts", "studio-editing"],
    ["apps/web/src/domains/creator/brush/wet-paper/StudioDrawNode.dry-brush-live.test.tsx", "studio-editing"],
  ]) {
    assert.equal(REQUIRED_VITEST_TARGETS.filter((item) => item === target).length, 1, `필수 회귀 선택자 누락·중복: ${target}`);
    assert.deepEqual(SHARD_NAMES.filter((name) => files[name].includes(target)), [owner], target);
    assert.equal(SERIAL_TEST_FILES.includes(target), false, `일반 shard에서 제외된 성능 시험: ${target}`);
  }
  const performance = "apps/web/src/domains/creator/brush/studio-long-stroke-per-move-cost.test.ts";
  assert.equal(SERIAL_TEST_FILES.filter((target) => target === performance).length, 1);
  assert.deepEqual(SHARD_NAMES.filter((name) => files[name].includes(performance)), []);
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const start = ci.indexOf("\n  static:"), end = ci.indexOf("\n  serial:", start);
  assert(start >= 0 && end > start);
  const checkout = ci.slice(start, end);
  assert(sparsePatterns(checkout, { shard: "product" }).includes("/docs/"), "closure의 필수 문서는 소유 product shard에 있어야 합니다.");
  assert(!sparsePatterns(checkout, { shard: "studio-foundation" }).includes("/docs/"));
});

test("foundation의 라이선스·기술 해설 검증에 필요한 원문만 sparse checkout에 복원한다", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const start = ci.indexOf("\n  static:"), end = ci.indexOf("\n  serial:", start);
  const patterns = sparsePatterns(ci.slice(start, end), { shard: "studio-foundation" });
  const guideRoot = "../apps/web/src/domains/legal/technology/";
  const guideIndex = readFileSync(new URL(`${guideRoot}engineering-library-guide-areas-a.ts`, import.meta.url), "utf8");
  const guideFiles = [...guideIndex.matchAll(/from "\.\/(engineering-library-guide-areas-a-[^"]+)"/gu)]
    .map((match) => `${match[1]}.ts`);
  const guide = [...guideFiles, "engineering-library-guide-overview.ts"]
    .map((file) => readFileSync(new URL(`${guideRoot}${file}`, import.meta.url), "utf8")).join("\n");
  const numbers = new Set();
  for (const match of guide.matchAll(/ADR-(\d{4})((?:·\d{4})*)/gu)) {
    numbers.add(match[1]);
    for (const number of match[2].split("·").filter(Boolean)) numbers.add(number);
  }
  assert(numbers.size > 8);
  const adrFiles = execFileSync("git", ["ls-files", "-z", "--", ":(glob)docs/adr/*.md"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)), encoding: "utf8",
  }).split("\0").filter(Boolean);
  const coversDocument = (document) => patterns.includes(`/${document}`);
  for (const number of numbers) {
    const documents = adrFiles.filter((file) => file.startsWith(`docs/adr/${number}-`) && file.endsWith(".md"));
    assert(documents.length > 0, `ADR-${number} 저장소 원문 누락`);
    for (const document of documents) assert(coversDocument(document), `ADR-${number} 원문 누락`);
  }
  const guideTest = readFileSync(new URL(`${guideRoot}engineering-library-guide-areas-a.test.ts`, import.meta.url), "utf8");
  for (const [, document] of guideTest.matchAll(/read\("(docs\/[^"\n]+)"\)/gu)) {
    assertTrackedDocumentInputs([`/${document}`]);
    assert(coversDocument(document), `${document} 원문 누락`);
  }
  const licenseDocument = "docs/third-party/opencascade-lgpl.md";
  assert(readFileSync(new URL("./generate-third-party-notices.mjs", import.meta.url), "utf8").includes(licenseDocument));
  assert(patterns.includes(`/${licenseDocument}`), "OpenCascade 라이선스 경계 원문 누락");
  for (const pattern of patterns.filter((entry) => entry.startsWith("/docs/"))) {
    assert(pattern.endsWith(".md") && !pattern.includes("*"), `문서는 정확한 개별 파일만 복원해야 합니다: ${pattern}`);
  }
});

test("기반 회귀는 실제 페이지 시각 프로필의 이미지와 공통 영상을 체크아웃한다", () => {
  const ci = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  const checkout = ci.slice(ci.indexOf("\n  static:"), ci.indexOf("\n  serial:"));
  const visual = readFileSync(new URL("../apps/web/src/shared/lib/site-route-visual.ts", import.meta.url), "utf8");
  const images = [...visual.matchAll(/image:\s*"(\/assets\/[^"\n]+)"/gu)].map((match) => `apps/web/public${match[1]}`);
  const videos = [...visual.matchAll(/(?:src|portraitSrc): "(\/brand\/[^"\n]+)"/gu)].map((match) => `apps/web/public${match[1]}`);
  assert(images.length > 0 && new Set(images).size === images.length, "실제 이미지 프로필이 중복 없이 필요합니다.");
  assert(videos.length > 0 && /video: FILM\(/u.test(visual), "실제 선택되는 브랜드 영상이 필요합니다.");
  const unrelated = "apps/web/public/assets/studio/generated-backgrounds/gpt25-v1/unused/background.png";
  const directory = mkdtempSync(join(tmpdir(), "foundation-route-visual-checkout-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: fixtureGitEnvironment(directory),
  }).trim();
  try {
    git("init", "--quiet");
    for (const file of [...images, ...videos, unrelated]) {
      mkdirSync(dirname(join(directory, file)), { recursive: true });
      writeFileSync(join(directory, file), "fixture\n");
    }
    git("add", "--all");
    const tree = git("write-tree");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    for (const shard of SHARD_NAMES) {
      const patterns = sparsePatterns(checkout, { shard });
      const selectedImages = patterns.filter((pattern) => pattern.startsWith("/apps/web/public/assets/studio/generated-backgrounds/"));
      assert.deepEqual(selectedImages.sort(), shard === "studio-foundation" ? images.map((file) => `/${file}`).sort() : [], `${shard}: 이미지 입력은 소유 shard의 정확한 파일만 선택해야 합니다.`);
      writeFileSync(join(directory, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`);
      git("read-tree", "-mu", tree);
      for (const file of images) assert.equal(existsSync(join(directory, file)), shard === "studio-foundation", `${shard}: ${file}`);
      for (const file of videos) assert(existsSync(join(directory, file)), `${shard}: 공통 영상 ${file}`);
      assert(!existsSync(join(directory, unrelated)), `${shard}: 관련 없는 이미지까지 포함하면 안 됩니다.`);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
