import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { assertTrackedDocumentInputs, fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));

test("접근성 체크아웃은 화면·글꼴·브랜드 영상과 검증 소스를 보존한다", async () => {
  const workflow = parse(await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  const job = workflow.jobs.a11y;
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
  assert.equal(job["timeout-minutes"], 35);
  assert.equal(job["runs-on"], "ubuntu-24.04");
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

test("기반 회귀는 실제 씬 카탈로그의 히어로·기존 VRM 원본을 최초 체크아웃한다", async () => {
  const workflow = await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const block = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
  const patterns = sparsePatterns(block, { shard: "studio-foundation" });
  const scene = await fs.readFile(path.join(root, "apps/web/src/domains/creator/virtual-space/three/studio-virtual-space-three-scene.ts"), "utf8");
  const legacyCatalog = scene.match(/const LEGACY_STUDIO_THREE_VRM_URLS = \[([^\]]+)\] as const/u)?.[1];
  assert(legacyCatalog, "실제 씬의 기존 VRM 카탈로그가 필요합니다.");
  assert.match(scene, /\[\.\.\.STUDIO_THREE_HERO_VRM_URLS, \.\.\.LEGACY_STUDIO_THREE_VRM_URLS\]/u);
  const legacy = [...legacyCatalog.matchAll(/"(\/vrm\/[^"\n]+\.vrm)"/gu)].map((match) => match[1]);
  assert.equal(legacy.length, 9);
  const heroCatalog = await fs.readFile(path.join(root, "apps/web/src/domains/creator/vrm/studio-vrm-hero-v1-catalog-entries.ts"), "utf8");
  assert.match(scene, /STUDIO_VRM_HERO_V1_SAMPLES\.map\(\(sample\) => sample\.url\)/u);
  assert.match(heroCatalog, /url: `\/vrm\/toonstudio-hero-v1\/\$\{spec\.archetypeId\}\.vrm`/u);
  const hero = [...heroCatalog.matchAll(/archetypeId: "([a-z-]+)",/gu)].map((match) => `/vrm/toonstudio-hero-v1/${match[1]}.vrm`);
  assert.equal(hero.length, 8);
  const models = [...hero, ...legacy].map((url) => `apps/web/public${url}`);
  assert.equal(new Set(models).size, 17);
  assertTrackedDocumentInputs(models.map((file) => `/${file}`), { cwd: root });
  const omitted = ["apps/web/public/vrm/unrelated.vrm", "apps/web/public/vrm/toonstudio-hero-v1/unrelated.vrm"];
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "foundation-vrm-checkout-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: fixtureGitEnvironment(directory),
  }).trim();
  try {
    git("init", "--quiet");
    for (const file of [...models, "apps/web/public/vrm/LICENSES.md", ...omitted]) {
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
    for (const file of omitted) await assert.rejects(fs.access(path.join(directory, file)), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("편집 하네스는 전체 타입 검사에서 import하는 MCP 환경 JSON을 보존한다", async () => {
  const workflow = await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const block = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
  const patterns = sparsePatterns(block, { shard: "studio-editing" });
  const imported = "apps/web/public/assets/3d/environments/mcp-free-v1/manifest.json";
  const omitted = "apps/web/public/assets/3d/environments/mcp-free-v1/models/fixture.glb";
  const source = await fs.readFile(path.join(root,
    "apps/web/src/domains/creator/bg3d/studio-bg3d-environment-mcp-free-v1.test.ts"), "utf8");
  assert(source.includes('import mcpManifest from "../../../../public/assets/3d/environments/mcp-free-v1/manifest.json";'));
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "editing-harness-checkout-"));
  const git = (...args) => execFileSync("git", args, {
    cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    env: fixtureGitEnvironment(directory),
  }).trim();
  try {
    git("init", "--quiet");
    for (const file of [imported, omitted]) {
      await fs.mkdir(path.dirname(path.join(directory, file)), { recursive: true });
      await fs.writeFile(path.join(directory, file), "fixture\n");
    }
    git("add", "--all");
    const tree = git("write-tree");
    git("config", "core.sparseCheckout", "true");
    git("config", "core.sparseCheckoutCone", "false");
    await fs.writeFile(path.join(directory, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`);
    git("read-tree", "-mu", tree);
    assert((await fs.stat(path.join(directory, imported))).isFile(), imported);
    await assert.rejects(fs.access(path.join(directory, omitted)), { code: "ENOENT" });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("세션 목표 PR은 번들 VRM 정본과 related 검사가 읽는 배경 원본을 최초 체크아웃한다", async () => {
  const workflow = await fs.readFile(path.join(root, ".github/workflows/toonstudio-session-goals.yml"), "utf8");
  const job = parse(workflow).jobs["focused-validation"];
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with["persist-credentials"], false);
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
  assert(!workflow.includes("git sparse-checkout add"), "인증이 끝난 뒤 자산을 추가로 받으면 안 됩니다.");
  assert(job.steps.some((step) => step.run?.includes("pnpm exec vitest related")));

  // 별도 경로 목록을 복제하지 않고 digest 검사가 순회하는 실제 등록 모델을 사용한다.
  const catalog = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    const { SAMPLE_VRMS, selectableSampleVrmUrl } = require("./apps/web/src/domains/creator/vrm/vrm-library.ts");
    const { STUDIO_VRM_HERO_V1_SAMPLES } = require("./apps/web/src/domains/creator/vrm/studio-vrm-hero-v1-catalog-entries.ts");
    process.stdout.write(JSON.stringify({
      models: SAMPLE_VRMS.map(({ id }) => selectableSampleVrmUrl(id)).filter(Boolean),
      hero: STUDIO_VRM_HERO_V1_SAMPLES.map(({ url }) => url),
      thumbnails: STUDIO_VRM_HERO_V1_SAMPLES.map(({ thumbnailUrl }) => thumbnailUrl),
    }));
  `], { cwd: root, encoding: "utf8", env: fixtureGitEnvironment(root) }));
  assert.equal(catalog.models.length, 116);
  assert.equal(new Set(catalog.models).size, 116);
  assert.equal(catalog.hero.length, 8);
  assert.equal(catalog.thumbnails.length, 8);

  // 식물·해안 검사는 PNG 다음 GLB도 읽고, 한강 쉼터 검사는 세 판의 GLB를 비교한다.
  const environments = await fs.readFile(path.join(root,
    "apps/web/src/domains/creator/bg3d/studio-bg3d-environment-catalog.ts"), "utf8");
  const backgrounds = [...environments.matchAll(/"(\/assets\/3d\/environments\/(?:glasshouse-v1|coast-v1|specimen-v1|boatyard-v1)\/[^"\n]+\.(?:glb|png))"/gu)]
    .map((match) => match[1]);
  assert.equal(backgrounds.length, 8);
  const pavilion = environments.match(/"(\/assets\/3d\/environments\/riverside-v2\/[^"\n]+\.glb)"/u)?.[1];
  assert(pavilion, "새 한강 쉼터의 실제 GLB 경로가 필요합니다.");
  backgrounds.push(pavilion);
  const retained = [...catalog.models, ...catalog.thumbnails, ...backgrounds].map((url) => `apps/web/public${url}`);
  assertTrackedDocumentInputs(retained.map((file) => `/${file}`), { cwd: root });
  const omitted = [
    "apps/web/public/vrm/unrelated.vrm",
    "apps/web/public/vrm/toonstudio-hero-v1/unrelated.vrm",
    "apps/web/public/assets/3d/environments/glasshouse-v1/unrelated.glb",
    "apps/web/public/assets/3d/environments/glasshouse-v1/unrelated.png",
    "apps/web/public/assets/unrelated/large.glb",
    "artifacts/large.bin",
  ];
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "session-goals-checkout-"));
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
    for (const eventName of ["pull_request", "workflow_dispatch"]) {
      const patterns = sparsePatterns(workflow, { eventName });
      await fs.writeFile(path.join(directory, ".git/info/sparse-checkout"), `${patterns.join("\n")}\n`);
      git("read-tree", "-mu", tree);
      if (eventName === "pull_request") {
        const missing = [];
        for (const file of retained) {
          try { await fs.access(path.join(directory, file)); } catch { missing.push(file); }
        }
        assert.deepEqual(missing, [], "PR related 검사가 읽는 정본을 최초 checkout에 포함해야 합니다.");
      } else {
        for (const url of [...catalog.hero, ...backgrounds]) {
          await assert.rejects(fs.access(path.join(directory, `apps/web/public${url}`)), { code: "ENOENT" });
        }
      }
      for (const file of omitted) await assert.rejects(fs.access(path.join(directory, file)), { code: "ENOENT" });
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
