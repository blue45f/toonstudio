const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateReleaseWorkflows } from "./release-workflow-policy.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(ROOT, relativePath), "utf8");

test("package.json은 단순화된 정본 deploy:* 진입점을 제공하고 기존 CI·하네스 스크립트를 보존한다", () => {
  const pkg = JSON.parse(read("package.json"));
  const scripts = pkg.scripts ?? {};

  assert.equal(
    scripts["deploy:preflight"],
    'node scripts/deployment-preflight.mjs --profile onpod-current --sha "$(git rev-parse HEAD)"',
  );
  assert.equal(
    scripts["deploy:verify"],
    "pnpm run verify:free-infrastructure && pnpm run verify:cloudflare-static && pnpm run verify:cloudflare-apex-redirect && pnpm run verify:cloudflare-realtime && pnpm run verify:cloudflare-analytics",
  );
  assert.equal(
    scripts["deploy:web:dry-run"],
    "node scripts/deploy-cloudflare-static.mjs --dry-run --profile=onpod-current",
  );
  assert.equal(
    scripts["deploy:web"],
    "node scripts/deploy-cloudflare-static.mjs --production --profile=onpod-current",
  );
  assert.equal(
    scripts["deploy:status:origin"],
    "node scripts/verify-render-core-origin.mjs --origin=https://toonstudio-api.onpod.ai",
  );

  for (const preserved of [
    "harness:doctor",
    "harness:check",
    "harness:verify",
    "verify:pnpm-lockfile",
    "build",
    "build:bundle",
    "check:studio-bundle",
    "check:product-tour-remotion-chunks",
    "verify:product-tour-live",
    "verify:free-infrastructure",
    "verify:cloudflare-static",
    "verify:cloudflare-apex-redirect",
    "verify:cloudflare-realtime",
    "verify:cloudflare-analytics",
    "verify:render-core-origin",
    "cloudflare:static:dry-run",
    "cloudflare:static:deploy",
    "cloudflare:analytics:dry-run",
    "cloudflare:analytics:deploy",
    "generate:cloudflare-static-rules",
    "prepare:cloudflare-static-assets",
    "sync:cloudflare-r2-assets:dry-run",
    "sync:cloudflare-r2-assets",
    "gcp:free-data:plan",
    "gcp:free-data:check",
    "gcp:free-data:apply",
  ]) {
    assert.equal(typeof scripts[preserved], "string", `필수 스크립트 보존 누락: ${preserved}`);
  }

  for (const removed of [
    "turbo:build",
    "turbo:typecheck",
    "turbo:lint",
    "turbo:test",
    "sonar:ci",
    "db:cleanup-creator-garbage:dry-run",
    "verify:federated-data-plane-policy",
    "cloudflare:free-data:plan",
    "cloudflare:free-data:check",
    "cloudflare:free-data:apply",
  ]) {
    assert.equal(scripts[removed], undefined, `미참조 중복·비승인 스크립트가 남아 있습니다: ${removed}`);
  }
});

test("CI 퍼블리셔 정책은 새 deploy:web 진입점을 차단하고 검증·드라이런 진입점은 허용한다", () => {
  const root = mkdtempSync(join(tmpdir(), "deploy-canonical-policy-"));
  try {
    mkdirSync(join(root, ".github/workflows"), { recursive: true });
    writeFileSync(join(root, "package.json"), read("package.json"));

    writeFileSync(
      join(root, ".github/workflows/forbidden.yml"),
      [
        "name: Forbidden deploy",
        "on: workflow_dispatch",
        "jobs:",
        "  publish:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: pnpm run deploy:web",
      ].join("\n"),
    );
    const blocked = validateReleaseWorkflows(root);
    assert.equal(blocked.length, 1);
    assert.match(blocked[0], /CI production publisher is forbidden \(Cloudflare\)/u);

    writeFileSync(
      join(root, ".github/workflows/forbidden.yml"),
      [
        "name: Safe checks",
        "on: pull_request",
        "jobs:",
        "  verify:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - run: pnpm run deploy:verify",
        "      - run: pnpm run deploy:preflight",
        "      - run: pnpm run deploy:web:dry-run",
      ].join("\n"),
    );
    assert.deepEqual(validateReleaseWorkflows(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("정본 AI 배포 안내서가 문서 원장·주요 진입 문서·인프라 지도와 모순 없이 연결된다", () => {
  const guidePath = "docs/operations/ai-deployment-quickstart.md";
  assert.ok(existsSync(join(ROOT, guidePath)));

  const authority = JSON.parse(read("config/documentation-authority.json"));
  assert.ok(authority.currentDocuments.includes(guidePath));

  const guide = read(guidePath);
  const lines = guide.split(/\r?\n/u);
  assert.ok(lines.length <= 220, `정본 빠른 안내는 짧게 유지해야 합니다(현재 ${lines.length}줄)`);

  for (const stale of authority.forbiddenCurrentText) {
    assert.ok(!guide.includes(stale), `금지 표현 포함: ${stale}`);
  }
  assert.ok(!/(?:\boracle\b|\boci\b|deploy\/oci)/iu.test(guide));
  assert.ok(!/TOONSPECTRUM_APPROVED_MAIN_SHA=["']?[0-9a-f]{40}/u.test(guide));

  for (const [index, line] of lines.entries()) {
    if (/Neon/u.test(line)) {
      assert.match(line, /legacy|과거|퇴역|삭제/u, `Neon 퇴역 표기 누락 (${index + 1}줄)`);
    }
  }

  const infraMap = read("docs/operations/infrastructure-map.md");
  assert.ok(infraMap.includes("`toonstudio-api`"));
  assert.ok(infraMap.includes("`toonstudio-db`"));
  for (const marker of [
    "toonspectrum-web",
    "toonspectrum-public-assets",
    "realtime.toonstudio.cloud",
    "toonspectrum-analytics",
    "toonstudio-api",
    "toonstudio-db",
    "https://toonstudio-api.onpod.ai",
    "1. 검증 (Verify)",
    "2. 빌드 (Build)",
    "3. 배포 (Deploy)",
    "4. 상태 확인 (Status)",
    "5. 롤백 (Rollback)",
    "pnpm run deploy:verify",
    "pnpm run deploy:preflight",
    "pnpm run deploy:web:dry-run",
    "pnpm run deploy:web",
    "pnpm run deploy:status:origin",
    "dist/.vite/build-meta.json",
    ".git/toonstudio-deploy-ledger",
    "RELEASE_SHA",
    "--attach-db",
    "onpod app rollback",
    "70517470",
    "8d9e24ee",
    "edgeOriginAuth",
  ]) {
    assert.ok(guide.includes(marker), `정본 배포 안내 필수 항목 누락: ${marker}`);
  }

  assert.ok(read("DEPLOY.md").includes("docs/operations/ai-deployment-quickstart.md"));
  assert.ok(read("deploy/README.md").includes("../docs/operations/ai-deployment-quickstart.md"));
  assert.ok(read("AGENTS.md").includes("docs/operations/ai-deployment-quickstart.md"));
});
