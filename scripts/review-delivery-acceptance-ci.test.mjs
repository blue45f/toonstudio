import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import nodeTest from "node:test";
import { test as vitestTest } from "vitest";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";

const test = process.env.VITEST ? vitestTest : nodeTest;

const root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const wrapper = await fs.readFile(
  path.join(root, "scripts/verify-review-delivery-workflow-ci.mjs"),
  "utf8",
);
const workflow = await fs.readFile(
  path.join(root, ".github/workflows/studio-manuscript-delivery-acceptance.yml"),
  "utf8",
);

test("the public acceptance command owns its Vite bootstrap", () => {
  assert.equal(
    packageJson.scripts["verify:studio-manuscript-delivery-acceptance"],
    "node scripts/verify-review-delivery-workflow-ci.mjs",
  );
  assert.match(wrapper, /--strictPort/u);
  assert.match(wrapper, /assertListenersBelongToWorktree/u);
  assert.match(wrapper, /stopDetachedProcessTree/u);
  assert.match(wrapper, /verify-review-delivery-workflow\.mjs/u);
  assert.match(wrapper, /verify-production-manuscript-workspace\.mjs/u);
});
test("the workflow runs the complete delivery evidence gate", () => {
  assert.match(workflow, /^name: Studio manuscript delivery acceptance$/mu);
  assert.match(workflow, /STUDIO_DELIVERY_SOAK_MS: '60000'/u);
  assert.match(workflow, /pnpm run verify:studio-manuscript-delivery-acceptance/u);
  assert.match(workflow, /review-delivery-zip\.test\.ts/u);
  assert.match(workflow, /StudioReviewDelivery\.test\.tsx/u);
  assert.match(workflow, /StudioPinnedReviewPanel\.test\.tsx/u);
  assert.match(workflow, /verify-production-manuscript-workspace\.mjs/u);
  assert.match(workflow, /production-manuscript-workspace/u);
  assert.match(workflow, /^[ \t]+uses: actions\/upload-artifact@v7$/mu);
});

test("the workflow is retriggered by every authority boundary it validates", () => {
  for (const expectedPath of [
    "apps/api/src/modules/studio-project-graph/review-delivery/**",
    "apps/web/src/domains/creator/production-hub/*Manuscript*",
    "apps/web/src/domains/creator/review-export/**",
    "apps/web/src/domains/creator/review-share/StudioPinnedReviewShareManager*",
    "apps/web/src/domains/creator/virtual-space/StudioPinnedReviewPanel*",
    "apps/web/tools/browser-harnesses/virtual-studio-review-export*",
    "apps/web/tools/browser-harnesses/production-manuscript-workspace*",
    "scripts/verify-review-delivery-workflow*.mjs",
    "scripts/verify-production-manuscript-workspace.mjs",
  ]) {
    assert.match(workflow, new RegExp(expectedPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
});

test("납품 체크아웃은 소스·검증 입력을 보존하고 공개 대형 미디어만 제외한다", async () => {
  const checkout = parse(workflow).jobs.acceptance.steps.find(
    (step) => step.uses?.startsWith("actions/checkout@"),
  );
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
  const retained = [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml",
    ".github/workflows/studio-manuscript-delivery-acceptance.yml",
    "scripts/verify-review-delivery-workflow-ci.mjs",
    "apps/api/package.json", "packages/contracts/package.json",
    "tests/integration/example/package.json", "patches/minimatch/dist/index.js",
    "apps/web/src/production.tsx", "apps/web/src/engine.wasm",
    "apps/web/src/clip.mp4", "apps/web/tests/production.test.tsx",
    "apps/web/tools/browser-harnesses/production.html",
    "apps/web/public/assets/texture.png", "apps/web/public/fonts/text.woff2",
    "apps/web/public/assets/studio/manifest.json",
    "apps/web/public/assets/studio/decoder.js", "apps/web/public/assets/3d/decoder.wasm",
  ];
  const omitted = [
    "apps/web/public/model.vrm", "apps/web/public/assets/scene.glb",
    "apps/web/public/brand/clips/intro.mp4",
    "apps/web/public/assets/3d/textures/wall.jpg",
    "apps/web/public/assets/studio/library/texture.png",
    "apps/web/public/assets/virtual-studio/world/texture.webp",
    "apps/web/public/assets/3d/environment.hdr",
  ];
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "delivery-checkout-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8",
    env: { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  try {
    git("init", "--quiet");
    for (const file of [...retained, ...omitted]) {
      await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await fs.writeFile(path.join(directory, file), "fixture\n");
    }
    git("add", "--all");
    const tree = git("write-tree");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    await fs.writeFile(path.join(directory, ".git/info/sparse-checkout"), checkout.with["sparse-checkout"]);
    git("read-tree", "-mu", tree);
    for (const file of retained) assert((await fs.stat(path.join(directory, file))).isFile(), file);
    for (const file of omitted) await assert.rejects(fs.access(path.join(directory, file)), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
