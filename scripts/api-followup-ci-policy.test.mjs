import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { restoreDocumentationCheckout } from "./restore-documentation-checkout.mjs";
import { fixtureGitEnvironment, sparsePatterns } from "./ci-checkout-test-helpers.mjs";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");
const workflow = readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
const shardRunner = readFileSync(new URL("./ci-core-regression-shards-impl.mjs", import.meta.url), "utf8");
const required = JSON.parse(readFileSync(new URL("./api-followup-test-files.json", import.meta.url), "utf8"));
const requiredPortfolio = new Set(
  readFileSync(new URL("./ci-required-vitest-targets.txt", import.meta.url), "utf8")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean),
);

test("runtime follow-up tests and the long-running API artifact remain mandatory", () => {
  assert.match(
    workflow,
    /node scripts\/ci-core-regression-shards\.mjs "\$\{\{ matrix\.shard \}\}"/,
  );
  assert.ok(shardRunner.includes("API follow-up and repository contracts"));
  assert.ok(shardRunner.includes("scripts/api-followup-unit.test.mjs"));
  assert.ok(shardRunner.includes("scripts/api-followup-ci-policy.test.mjs"));
  assert.ok(shardRunner.includes("pnpm run validate:architecture"));
  assert.ok(shardRunner.includes("pnpm run verify:csp"));
  assert.ok(shardRunner.includes("pnpm run verify:toolchain-coverage"));
  assert.doesNotMatch(shardRunner, /continue-on-error|\|\| true/);
  for (const file of required) {
    assert.ok(requiredPortfolio.has(file), `Missing regression from required portfolio: ${file}`);
  }
  assert.ok(workflow.includes("pnpm --filter @webtoon-nest/api build"));
  assert.ok(workflow.includes("test -s apps/api/dist/apps/api/src/main.js"));
  assert.ok(workflow.includes("node --check apps/api/dist/apps/api/src/main.js"));
  assert.ok(!workflow.includes("verify:api-serverless-build"));
});

test("product 문서 계약 전에 추적 문서와 내부 링크 입력을 복원한다", () => {
  const restoration = workflow.indexOf("      - name: Restore documentation inputs for product contracts\n");
  const execution = workflow.indexOf("      - name: Run semantic regression shard\n");
  assert.ok(restoration >= 0 && execution > restoration);
  const step = workflow.slice(restoration, execution);
  assert.match(step, /if: matrix\.shard == 'product'/u);
  assert.match(step, /run: node scripts\/restore-documentation-checkout\.mjs/u);
  assert.match(step, /TOONSTUDIO_CHECKOUT_TOKEN: \$\{\{ github\.token \}\}/u);
  assert.match(step, /GIT_CONFIG_COUNT: ['"]2['"]/u);
  assert.match(step, /GIT_CONFIG_KEY_0: credential\.helper/u);
  assert.match(step, /GIT_CONFIG_VALUE_0: ['"]['"]/u);
  assert.match(step, /GIT_CONFIG_KEY_1: credential\.https:\/\/github\.com\.helper/u);
  assert.match(step, /GIT_TERMINAL_PROMPT: ['"]0['"]/u);
});

test("문서 복원의 실제 credential helper는 GitHub HTTPS get만 허용하고 사용자 설정과 저장을 건드리지 않는다", () => {
  const step = workflow.split(/(?=^ {6}- )/mu)
    .find((entry) => entry.startsWith("      - name: Restore documentation inputs for product contracts\n"));
  assert.ok(step);
  const helper = step.match(/^ {10}GIT_CONFIG_VALUE_1: >-\n((?: {12}[^\n]*\n)+)/mu)?.[1]
    .split("\n").filter(Boolean).map((line) => line.slice(12)).join(" ");
  assert.ok(helper, "workflow의 실제 folded helper를 실행해야 합니다.");
  assert.match(helper, /^!f\(\)/u);
  assert.match(helper, /test "\$1" = get/u);
  assert.match(helper, /test -n "\$\{TOONSTUDIO_CHECKOUT_TOKEN:-\}"/u);
  assert.equal(workflow.split("TOONSTUDIO_CHECKOUT_TOKEN: ${{ github.token }}").length - 1, 1, "토큰은 문서 복원 step에만 제공해야 합니다.");
  const root = mkdtempSync(join(tmpdir(), "documentation-credential-scope-"));
  const baseEnvironment = fixtureGitEnvironment(root);
  const globalConfig = baseEnvironment.GIT_CONFIG_GLOBAL;
  const spyCalls = join(root, "unexpected-helper-calls");
  const git = (args, environment = baseEnvironment, input) => spawnSync("git", args, {
    cwd: root, env: environment, input, encoding: "utf8",
  });
  const requireSuccess = (args) => {
    const result = git(args);
    assert.equal(result.status, 0, result.stderr);
  };
  try {
    requireSuccess(["init", "--quiet"]);
    const spy = '!f() { printf "%s\\n" "$1" >> "$SPY_CALLS"; }; f';
    requireSuccess(["config", "--file", globalConfig, "--add", "credential.helper", spy]);
    requireSuccess(["config", "--local", "--add", "credential.helper", spy]);
    const spyEnvironment = { ...baseEnvironment, SPY_CALLS: spyCalls };
    const spyInput = "protocol=https\nhost=github.com\nusername=fixture-user\npassword=fixture-value\n\n";
    git(["credential", "fill"], spyEnvironment, "protocol=https\nhost=github.com\n\n");
    git(["credential", "approve"], spyEnvironment, spyInput);
    git(["credential", "reject"], spyEnvironment, spyInput);
    const operations = new Set(readFileSync(spyCalls, "utf8").trim().split("\n"));
    assert.deepEqual(operations, new Set(["get", "store", "erase"]), "차단 여부를 측정할 기존 helper spy 자체가 동작해야 합니다.");
    rmSync(spyCalls);
    const globalBefore = readFileSync(globalConfig);
    const localPath = join(root, ".git/config");
    const localBefore = readFileSync(localPath);
    const environment = fixtureGitEnvironment(root, {
      SPY_CALLS: spyCalls,
      TOONSTUDIO_CHECKOUT_TOKEN: "fixture-token-for-test-only",
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "credential.helper",
      GIT_CONFIG_VALUE_0: "",
      GIT_CONFIG_KEY_1: "credential.https://github.com.helper",
      GIT_CONFIG_VALUE_1: helper,
    });
    const request = (protocol, host) => `protocol=${protocol}\nhost=${host}\n\n`;
    const allowed = git(["credential", "fill"], environment, request("https", "github.com"));
    assert.equal(allowed.status, 0, allowed.stderr);
    const credentials = Object.fromEntries(allowed.stdout.trim().split("\n").map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index), line.slice(index + 1)];
    }));
    assert.equal(credentials.username, "x-access-token");
    assert.equal(credentials.password, environment.TOONSTUDIO_CHECKOUT_TOKEN);
    for (const [protocol, host] of [["https", "example.invalid"], ["http", "github.com"], ["https", "github.com.example.invalid"]]) {
      const rejected = git(["credential", "fill"], environment, request(protocol, host));
      assert.notEqual(rejected.status, 0, `${protocol}://${host}에 자격증명을 제공하면 안 됩니다.`);
      assert.doesNotMatch(rejected.stdout, /username=|password=/u);
    }
    const empty = git(["credential", "fill"], { ...environment, TOONSTUDIO_CHECKOUT_TOKEN: "" }, request("https", "github.com"));
    assert.notEqual(empty.status, 0, "빈 토큰으로 인증 성공을 보고하면 안 됩니다.");
    assert.doesNotMatch(empty.stdout, /username=|password=/u);
    const input = `${request("https", "github.com").trim()}\nusername=x-access-token\npassword=fixture-token-for-test-only\n\n`;
    for (const action of ["approve", "reject"]) {
      const result = git(["credential", action], environment, input);
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout, "");
    }
    assert.equal(existsSync(spyCalls), false, "기존 helper의 get/store/erase는 모두 차단해야 합니다.");
    assert.deepEqual(readFileSync(globalConfig), globalBefore, "fixture global 설정이 바뀌면 안 됩니다.");
    assert.deepEqual(readFileSync(localPath), localBefore, ".git/config에 토큰이나 helper를 저장하면 안 됩니다.");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("실제 sparse checkout에서 문서 링크만 복원하고 무관한 대형 자산과 깨진 링크는 보존한다", () => {
  const root = mkdtempSync(join(tmpdir(), "documentation-checkout-"));
  const environment = fixtureGitEnvironment(root);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: root, env: environment, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  };
  const write = (file, contents) => {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), contents);
  };
  try {
    git("init", "--quiet");
    write("config/documentation-authority.json", JSON.stringify({
      version: 1, currentDocuments: ["docs/current.md"], generatedDocuments: [], pinnedEnglishDocuments: [],
      externalPrefixes: ["vendor/"], historicalPrefixes: [], forbiddenPaths: [], forbiddenCurrentText: [], forbiddenAllText: [],
    }));
    const assetRoot = "apps/web/public/assets/audit";
    write("docs/current.md", `# 현재 문서\n\n현재 저장소의 문서와 자산 경계를 확인하고 링크 대상 및 검사 입력을 유지하는 한국어 본문입니다.\n\n[상세](./detail.mdx)\n[이미지](<../${assetRoot}/document image.png> "그림")\n[보고서](../${assetRoot}/report.json?download=1#part)\n[디렉터리](../${assetRoot}/models/)\n`);
    write("docs/detail.mdx", "# 상세 문서\n");
    write(`${assetRoot}/README.md`, "# 자산 설명\n");
    write(`${assetRoot}/document image.png`, "linked image");
    write(`${assetRoot}/report.json`, "{}");
    write(`${assetRoot}/unrelated.glb`, Buffer.alloc(1_048_576));
    write(`${assetRoot}/models/large.glb`, Buffer.alloc(1_048_576));
    write("vendor/README.md", `[외부 패키지 자체 링크](../${assetRoot}/vendor-only.glb)\n`);
    write(`${assetRoot}/vendor-only.glb`, Buffer.alloc(1_048_576));
    git("add", ".");
    git("-c", "user.name=Documentation Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture");
    const staticJob = workflow.slice(workflow.indexOf("\n  static:\n"), workflow.indexOf("\n  serial:\n"));
    git("sparse-checkout", "set", "--no-cone", ...sparsePatterns(staticJob, { shard: "product" }));
    const preview = restoreDocumentationCheckout(root, { dryRun: true, environment });
    assert.deepEqual(preview.markdown, [`${assetRoot}/README.md`, "docs/current.md", "docs/detail.mdx", "vendor/README.md"]);
    assert.deepEqual(preview.linkedFiles, [`${assetRoot}/document image.png`, `${assetRoot}/report.json`]);
    assert.deepEqual(preview.linkedDirectories, [`${assetRoot}/models`]);
    assert.equal(existsSync(join(root, "docs/current.md")), true, "product 문서는 최초 checkout에 있어야 합니다.");
    assert.equal(existsSync(join(root, `${assetRoot}/document image.png`)), false, "dry-run은 링크 본문을 복원하지 않아야 합니다.");
    assert.equal(existsSync(join(root, `${assetRoot}/README.md`)), false, "dry-run은 자산 트리의 문서를 복원하지 않아야 합니다.");
    assert.deepEqual(restoreDocumentationCheckout(root, { environment }), preview);
    for (const file of [...preview.markdown, ...preview.linkedFiles, ...preview.linkedDirectories]) {
      assert.equal(existsSync(join(root, file)), true, file);
    }
    for (const file of [`${assetRoot}/unrelated.glb`, `${assetRoot}/models/large.glb`, `${assetRoot}/vendor-only.glb`]) {
      assert.equal(existsSync(join(root, file)), false, file);
    }
    const validator = fileURLToPath(new URL("./validate-documentation.mjs", import.meta.url));
    const validate = () => spawnSync(process.execPath, [validator], { cwd: root, env: environment, encoding: "utf8" });
    const valid = validate();
    assert.equal(valid.status, 0, valid.stderr);
    write("docs/broken.md", `[진짜 누락](../${assetRoot}/not-tracked.png)\n`);
    const invalid = validate();
    assert.equal(invalid.status, 1);
    assert.match(invalid.stderr, /깨진 내부 링크: docs\/broken\.md:1/u);
    assert.equal(existsSync(join(root, assetRoot, "not-tracked.png")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
