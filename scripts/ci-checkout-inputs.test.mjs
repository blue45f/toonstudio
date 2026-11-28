import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { assertTrackedDocumentInputs, fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";
import { assertCompleteCoverage, parseArguments, partitionFiles } from "./typecheck-shards.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const root = fileURLToPath(new URL("../", import.meta.url));

test("자동 도메인 전체 타입 검사와 영수증 fallback도 작은 묶음을 실제 명령에 전달한다", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const args = pkg.scripts["typecheck:web"].split(/\s+/u).slice(2);
  const ordinary = parseArguments(args, {});
  for (const [file, jobId, command] of [
    ["studio-mesh-sync-repair", "application-typecheck", "pnpm run typecheck"],
    ["studio-scene3d-next", "scene3d-contracts", "pnpm run typecheck"],
    ["studio-finishing-quality", "quality-static", "node scripts/ci-shared-typecheck.mjs reuse-or-run"],
    ["feedback-community-validation", "feedback-community", "node scripts/ci-shared-typecheck.mjs reuse-or-run"],
  ]) {
    const workflow = parse(await fs.readFile(path.join(root, `.github/workflows/${file}.yml`), "utf8"));
    const job = workflow.jobs[jobId];
    const steps = job.steps.filter((step) => step.run?.includes(command));
    assert.equal(steps.length, 1, `${file}: 실제 전체 검사 또는 fallback은 한 번이어야 합니다.`);
    const types = steps[0];
    assert.equal(types.if, undefined, `${file}: 자동 경로에서 전체 검사를 생략하지 않습니다.`);
    const inherited = parseArguments(args, { ...workflow.env, ...job.env, ...types.env });
    assert.equal(inherited.maxBytes, 3145728, file);
    assert.equal(inherited.heapMb, ordinary.heapMb, file);
    assert.equal(inherited.project, ordinary.project, file);
  }
});

test("CC0 인계는 작은 타입 묶음을 실제 하위 명령에 전달하고 전체 검증을 실패 시 중단한다", async () => {
  const workflow = parse(await fs.readFile(path.join(root, ".github/workflows/market-cc0-handoff.yml"), "utf8"));
  const job = workflow.jobs.handoff;
  const verify = job.steps.find((step) => step.name === "Verify source identities, legacy behavior and real browser persistence");
  assert(verify, "실제 CC0 전체 검증 단계가 있어야 합니다.");
  assert.equal(job["timeout-minutes"], 110);
  assert.equal(job["continue-on-error"], undefined);
  assert.equal(verify["continue-on-error"], undefined);
  assert.equal(verify.env?.TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES, "3145728");
  assert.match(verify.run, /^set -euo pipefail\n/u);
  assert.match(verify.run, /node scripts\/verify-market-cc0\.mjs 2>&1 \| tee artifacts\/market-cc0\/verification\.log/u);
  assert.doesNotMatch(verify.run, /\|\|\s*true|set\s+\+e|--skip/u);
  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const args = pkg.scripts["typecheck:web"].split(/\s+/u).slice(2);
  const original = parseArguments(args, {}), inherited = parseArguments(args, verify.env);
  assert.equal(original.maxBytes, 12582912);
  assert.equal(inherited.maxBytes, 3145728);
  assert.equal(inherited.heapMb, original.heapMb);
  assert.equal(inherited.project, original.project);

  const source = (await fs.readFile(path.join(root, "scripts/verify-market-cc0.mjs"), "utf8"))
    .replace(/^import \{ spawnSync \} from "node:child_process";\r?\n/u, "");
  const run = (failAt = -1) => {
    const calls = [], stopped = new Error("하위 검증 실패");
    const execute = () => runInNewContext(source, {
      console: { log: () => undefined },
      process: { env: verify.env, exit: (code) => { assert.equal(code, 17); throw stopped; } },
      spawnSync: (command, childArgs, options) => {
        calls.push({ command, args: Array.from(childArgs), env: options.env });
        return { status: calls.length - 1 === failAt ? 17 : 0 };
      },
    });
    if (failAt === -1) execute(); else assert.throws(execute, (error) => error === stopped);
    return calls;
  };
  const calls = run();
  assert.equal(calls.length, 4);
  assert.deepEqual(calls[0].args.slice(0, 3), ["exec", "vitest", "run"]);
  assert.equal(calls[0].args.length - 3, 11, "기존 11개 동작 회귀를 모두 유지해야 합니다.");
  assert.deepEqual(calls.slice(1).map((call) => call.args), [
    ["run", "typecheck"],
    ["exec", "tsx", "scripts/verify-market-cc0-bytes.mts"],
    ["exec", "tsx", "scripts/verify-market-cc0-browser.mts"],
  ]);
  for (const call of calls) {
    assert.equal(call.command, "pnpm");
    assert.equal(call.env.TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES, "3145728");
  }
  for (let failed = 0; failed < 4; failed += 1) assert.equal(run(failed).length, failed + 1);
});

test("수동 후보 편집 하네스도 전체 타입 검사를 3MiB 묶음과 120분 예산으로 끝까지 수행한다", async () => {
  const workflow = parse(await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  const job = workflow.jobs.static;
  const manual = job.steps.find((step) => step.name === "수동 후보의 전체 하네스 검증");
  const required = workflow.jobs.typecheck.steps.find((step) => step.name === "Typecheck application, API and realtime worker");
  assert(manual && required, "실제 수동 하네스와 필수 타입 검사 단계가 모두 있어야 합니다.");
  assert.equal(manual.env?.TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES, "3145728");
  assert.equal(manual.env.TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES, required.env.TOONSTUDIO_TYPECHECK_MAX_SOURCE_BYTES);
  assert.equal(job["timeout-minutes"], "${{ github.event_name == 'workflow_dispatch' && github.ref != 'refs/heads/main' && matrix.shard == 'studio-editing' && 120 || 25 }}");
  assert.equal(manual.if, "github.event_name == 'workflow_dispatch' && matrix.shard == 'studio-editing'");
  assert.equal(job["continue-on-error"], undefined);
  assert.equal(manual["continue-on-error"], undefined);
  assert.match(manual.run, /^set -euo pipefail\n/u);
  assert.match(manual.run, /^git merge-base --is-ancestor "\$HARNESS_BASE" HEAD$/mu);
  assert.match(manual.run, /\npnpm harness:verify --base="\$HARNESS_BASE"\n$/u);
  assert.doesNotMatch(manual.run, /\|\|\s*true|set\s+\+e|--skip/u);
  assert(workflow.jobs.core.needs.includes("typecheck") && workflow.jobs.core.needs.includes("static"));
  assert.equal(workflow.jobs.verify.needs, "core");

  const pkg = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
  const args = pkg.scripts["typecheck:web"].split(/\s+/u).slice(2);
  const ordinary = parseArguments(args, {}), inherited = parseArguments(args, manual.env);
  assert.equal(ordinary.maxBytes, 12582912);
  assert.equal(inherited.maxBytes, 3145728, "step env가 기존 12MiB CLI 값보다 우선해야 합니다.");
  assert.equal(inherited.heapMb, ordinary.heapMb);
  assert.equal(inherited.project, ordinary.project);
  const identity = { options: { skipLibCheck: true }, files: [
    { path: "first.ts", bytes: 4 * 1024 * 1024 },
    { path: "second.ts", bytes: 4 * 1024 * 1024 },
    { path: "third.ts", bytes: 4 * 1024 * 1024 },
    { path: "ambient.d.ts", bytes: 4 * 1024 * 1024, declaration: true },
  ] };
  const expected = identity.files.map((file) => file.path);
  const ordinaryGroups = partitionFiles(identity, ordinary.maxBytes);
  const smallerGroups = partitionFiles(identity, inherited.maxBytes);
  assert(smallerGroups.length > ordinaryGroups.length);
  assert.deepEqual(smallerGroups.flat(), expected, "작은 묶음도 선언을 포함한 전체 SourceFile을 보존해야 합니다.");
  assert.doesNotThrow(() => assertCompleteCoverage(expected, smallerGroups));
});

test("접근성 체크아웃은 화면·글꼴·브랜드 영상과 검증 소스를 보존한다", async () => {
  const workflow = parse(await fs.readFile(path.join(root, ".github/workflows/ci.yml"), "utf8"));
  const job = workflow.jobs.a11y;
  const checkout = job.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
  assert.equal(checkout.with.filter, "blob:none");
  assert.equal(checkout.with["sparse-checkout-cone-mode"], false);
  assert.equal(job["timeout-minutes"], 35);
  assert.equal(job["runs-on"], "ubuntu-24.04");
  for (const command of ["pnpm run test:a11y", "pnpm exec playwright test --config config/playwright/playwright.production-workflows.config.ts"]) {
    assert(job.steps.some((step) => step.run === command), command);
  }
  const retained = [
    "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "patches/minimatch/index.js",
    "playwright.config.ts", "config/playwright/playwright.production-workflows.config.ts",
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

test("세션 목표 PR은 related 검사가 읽는 VRM·배경·가상 스튜디오 캐릭터 원본과 미리보기를 최초 체크아웃한다", async () => {
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
    const { STUDIO_BG3D_HERO_V1_ENTRIES } = require("./apps/web/src/domains/creator/bg3d/studio-bg3d-hero-v1-catalog-entries.ts");
    const { listStudioObjectInsertItems } = require("./apps/web/src/domains/creator/studio-object-insert-catalog.ts");
    process.stdout.write(JSON.stringify({
      models: SAMPLE_VRMS.map(({ id }) => selectableSampleVrmUrl(id)).filter(Boolean),
      hero: STUDIO_VRM_HERO_V1_SAMPLES.map(({ url }) => url),
      thumbnails: STUDIO_VRM_HERO_V1_SAMPLES.map(({ thumbnailUrl }) => thumbnailUrl),
      heroScenes: STUDIO_BG3D_HERO_V1_ENTRIES.flatMap(({ desktopAsset, mobileAsset }) => [
        desktopAsset.url, mobileAsset.url, desktopAsset.thumbnailUrl,
      ]),
      insertAssets: listStudioObjectInsertItems().flatMap(({ assetUrl, thumbnailUrl }) => [assetUrl, thumbnailUrl].filter(Boolean)),
    }));
  `], { cwd: root, encoding: "utf8", env: fixtureGitEnvironment(root) }));
  assert.equal(catalog.models.length, 117);
  assert.equal(new Set(catalog.models).size, 117);
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
  const insertPreviews = catalog.insertAssets.filter((url) =>
    url.startsWith("/assets/3d/environments/hero-v2/") || url.startsWith("/assets/studio/scene-template-previews/"));
  const prOnly = [...catalog.hero, ...backgrounds, ...catalog.heroScenes, ...insertPreviews];
  const officeBase = "apps/web/public/assets/virtual-studio";
  const officeFiles = execFileSync("git", ["ls-files", "--", `${officeBase}/office-cast-v2/`, `${officeBase}/toon-office-v1/characters/`],
    { cwd: root, encoding: "utf8", env: fixtureGitEnvironment(root) }).trim().split("\n");
  for (const file of ["office-cast-v2/artist-walk.png", "office-cast-v2/editor-work.webp",
    "toon-office-v1/characters/artist.webp", "toon-office-v1/characters/work/junseo.webp", "toon-office-v1/characters/preview/nia.webp"]) {
    assert(officeFiles.includes(`${officeBase}/${file}`), `캐릭터 자산 검증 입력 누락: ${file}`);
  }
  const retained = [
    ...[...new Set([...catalog.models, ...catalog.thumbnails, ...backgrounds, ...catalog.heroScenes, ...catalog.insertAssets])]
      .map((url) => `apps/web/public${url}`),
    ...officeFiles,
  ];
  assertTrackedDocumentInputs(retained.map((file) => `/${file}`), { cwd: root });
  const omitted = [
    "apps/web/public/vrm/unrelated.vrm",
    "apps/web/public/vrm/toonstudio-hero-v1/unrelated.vrm",
    "apps/web/public/assets/3d/environments/glasshouse-v1/unrelated.glb",
    "apps/web/public/assets/3d/environments/glasshouse-v1/unrelated.png",
    "apps/web/public/assets/3d/environments/hero-v1/lineart/kr_atelier_cafe_interior-lineart.svg",
    "apps/web/public/assets/3d/environments/hero-v2/kr_modern_office_suite/mobile.glb",
    "apps/web/public/assets/3d/environments/hero-v2/kr_modern_office_suite/contact_sheet.png",
    "apps/web/public/assets/unrelated/large.glb",
    `${officeBase}/toon-office-v1/objects/desk-artist.webp`,
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
        for (const file of officeFiles) await assert.rejects(fs.access(path.join(directory, file)), { code: "ENOENT" });
        for (const url of prOnly) {
          await assert.rejects(fs.access(path.join(directory, `apps/web/public${url}`)), { code: "ENOENT" });
        }
      }
      for (const file of omitted) await assert.rejects(fs.access(path.join(directory, file)), { code: "ENOENT" });
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
