import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));

test("접근성 체크아웃은 화면·글꼴·브랜드 영상과 검증 소스를 보존한다", async () => {
  const workflow = parse(await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  const job = workflow.jobs.a11y;
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
  assert.equal(job["timeout-minutes"], 20);
  for (const command of ["pnpm run test:a11y", "pnpm exec playwright test --config playwright.production-workflows.config.ts"]) {
    assert(job.steps.some((step) => step.run === command), command);
  }
  const retained = [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "patches/minimatch/index.js",
    "playwright.config.ts", "playwright.production-workflows.config.ts",
    "e2e/a11y-smoke.spec.ts", "e2e/production-workflows.spec.ts",
    "apps/web/src/editor.tsx", "apps/web/src/fixture.glb", "apps/api/package.json",
    "apps/web/public/fonts/text.woff2", "apps/web/public/brand/toonstudio-intro.mp4",
    "apps/web/public/brand/tool-clips/tool-production.mp4",
    "apps/web/public/brand/poster.webp", "apps/web/public/images/background.png",
    "apps/web/public/assets/texture.jpg", "apps/web/public/assets/studio/manifest.json",
    "apps/web/public/assets/3d/decoder.wasm", "apps/web/public/assets/studio/decoder.js",
    "apps/web/public/assets/3d/environments/refined-v6/thumbnails/classroom_art_studio.png",
    "apps/web/public/assets/studio/cc0-20260906/assets/polyhaven-background-wooden-lounge/background.webp",
    "apps/web/public/assets/studio/generated-backgrounds/gpt25-v1/daily/gpt25-bg-daily-bedroom-night-vertical-depth/background.png",
    "apps/web/public/assets/studio/generated-backgrounds/gpt25-v1/drama/gpt25-bg-drama-boardroom-vertical-depth/background.png",
    "apps/web/public/assets/studio/generated-backgrounds/gpt25-v1/sf/gpt25-bg-sf-research-lab-vertical-depth/background.png",
  ];
  const omitted = [
    "apps/web/public/model.vrm", "apps/web/public/assets/model.glb",
    "apps/web/public/assets/3d/textures/material.jpg",
    "apps/web/public/assets/studio/library/texture.png",
    "apps/web/public/assets/virtual-studio/world/texture.webp",
    "apps/web/public/assets/3d/environment.hdr",
  ];
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "a11y-checkout-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: fixtureGitEnvironment(directory),
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

test("기반 회귀는 실제 씬 카탈로그의 모든 CC0 VRM 원본을 최초 체크아웃한다", async () => {
  const workflow = await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const block = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
  const patterns = sparsePatterns(block, { shard: "studio-foundation" });
  const scene = await fs.readFile(path.join(root, "apps/web/src/domains/creator/virtual-space/three/studio-virtual-space-three-scene.ts"), "utf8");
  const catalog = scene.match(/export const STUDIO_THREE_VRM_URLS[^=]*= Object\.freeze\(\s*\[([^\]]+)\]/u)?.[1];
  assert(catalog, "실제 씬의 VRM 카탈로그가 필요합니다.");
  const models = [...catalog.matchAll(/"(\/vrm\/[^"\n]+\.vrm)"/gu)].map((match) => `apps/web/public${match[1]}`);
  assert.equal(models.length, 9);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-vrm-checkout-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: fixtureGitEnvironment(directory),
  }).trim();
  try {
    git("init", "--quiet");
    for (const file of [...models, "apps/web/public/vrm/LICENSES.md", "apps/web/public/vrm/unrelated.vrm"]) {
      await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await fs.writeFile(path.join(directory, file), "fixture\n");
    }
    git("add", "--all");
    const tree = git("write-tree");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    await fs.writeFile(path.join(directory, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`);
    git("read-tree", "-mu", tree);
    for (const file of [...models, "apps/web/public/vrm/LICENSES.md"]) assert((await fs.stat(path.join(directory, file))).isFile(), file);
    await assert.rejects(fs.access(path.join(directory, "apps/web/public/vrm/unrelated.vrm")), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
