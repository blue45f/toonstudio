import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { stringify } from "yaml";

import { afterEach, describe, expect, it } from "vitest";

import {
  readFreeInfrastructurePolicy,
  validateFreeInfrastructurePolicy,
  validateFreeInfrastructureRepository,
} from "./free-infrastructure-policy.mjs";

const policy = JSON.parse(
  readFileSync(new URL("../config/free-infrastructure-policy.json", import.meta.url), "utf8"),
);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

const fixtures = [];
function fixture(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "release-policy-"));
  fixtures.push(root);
  for (const [file, source] of Object.entries({
    "config/free-infrastructure-policy.json": JSON.stringify(policy),
    "deploy/cloudflare-static/wrangler.jsonc": "{}",
    "deploy/cloudflare-static/src/index.ts": "",
    "apps/web/public/_headers": "",
    "docs/FREE_INFRASTRUCTURE.md": "",
    "package.json": JSON.stringify({ scripts: {
      "cloudflare:static:deploy": "node scripts/deploy-cloudflare-static.mjs --production",
      "cloudflare:static:dry-run": "node scripts/deploy-cloudflare-static.mjs --dry-run",
      "release": "pnpm run cloudflare:static:deploy",
      "release:vercel": "pnpm exec vercel deploy --prebuilt --prod",
      "release:render": "curl -X POST https://api.render.com/v1/services/srv-fixture/deploys",
      "audit": "pnpm run build && pnpm exec wrangler deploy --dry-run",
      "build": "vite build",
      "wrangler": "wrangler deploy",
      "cycle": "pnpm run cycle",
    } }),
    ...files,
  })) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, source);
  }
  return root;
}

function workflowIssues(run, trigger = "push", step = {}, workflow = {}) {
  return validateFreeInfrastructureRepository(fixture({
    ".github/workflows/release.yml": stringify({
      name: "Release policy fixture",
      on: trigger,
      jobs: { release: { "runs-on": "ubuntu-latest", steps: [{ run, ...step }] } },
      ...workflow,
    }),
  }));
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("free infrastructure policy", () => {
  it("keeps the committed profile valid and credential-free", () => {
    expect(validateFreeInfrastructurePolicy(policy)).toEqual([]);
    expect(readFreeInfrastructurePolicy(join(fixture(), "config/free-infrastructure-policy.json"))).toEqual(policy);
    expect(JSON.stringify(policy)).not.toMatch(/sk-|BEGIN PRIVATE KEY|password\s*[:=]/iu);
  });

  it("rejects automatic deployment and paid failover", () => {
    const changed = clone(policy);
    changed.automaticDeployments = true;
    changed.automaticPaidFailover = true;
    expect(validateFreeInfrastructurePolicy(changed)).toEqual(
      expect.arrayContaining([
        "automaticDeployments must remain false",
        "automaticPaidFailover must remain false",
      ]),
    );
  });

  it("rejects provider caps above the central-write stop boundary", () => {
    const changed = clone(policy);
    changed.providers["cloudflare-r2"].applicationHardCapRatio = 0.9;
    expect(validateFreeInfrastructurePolicy(changed)).toContain(
      "providers.cloudflare-r2.applicationHardCapRatio must not exceed stopCentralPersonalWrites",
    );
  });

  it("requires local/BYOS default storage and explicit Oracle exclusion", () => {
    const changed = clone(policy);
    changed.defaultProjectStorage = "central-cloud";
    changed.forbiddenProviders = [];
    const issues = validateFreeInfrastructurePolicy(changed);
    expect(issues).toEqual(expect.arrayContaining([
      "defaultProjectStorage must remain local-or-byos",
      "forbiddenProviders must include oracle",
      "forbiddenProviders must include oci",
    ]));
  });

  it("commits an aggressive provider federation with explicit workload authorities", () => {
    expect(Object.keys(policy.providers).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(policy.workloads).length).toBeGreaterThanOrEqual(20);
    expect(policy.authorities).toMatchObject({
      staticWeb: "cloudflare-static-assets",
      transactionalDatabase: "cockroachdb-basic",
      identityDatabase: "tidb-identity",
      projectDatabase: "tidb-projects",
      commerceDatabase: "tidb-commerce",
      collaborationDatabase: "tidb-collaboration",
      notificationDatabase: "firestore-free",
      presenceDatabase: "firebase-rtdb-free",
      analyticsDatabase: "bigquery-sandbox",
      analyticsIngestDatabase: "cloudflare-d1",
      derivedReadModels: "turso-libsql",
      socialDatabase: "tidb-community",
      playgroundDatabase: "supabase-playground",
      batchCompute: "local-m2-runner",
    });
    expect(policy.workloads["private-project-write"]).toMatchObject({
      authority: "local-opfs",
      candidates: ["local-opfs", "user-owned-storage"],
    });
  });

  it("rejects unknown candidates, role mismatches, and authoritative write failover", () => {
    const changed = clone(policy);
    changed.workloads["critical-ledger-write"].candidates = [
      "neon-postgres",
      "cloudflare-d1",
      "missing-provider",
    ];
    const issues = validateFreeInfrastructurePolicy(changed);
    expect(issues).toEqual(expect.arrayContaining([
      "workloads.critical-ledger-write authoritative writes must have exactly one authority candidate",
      "workloads.critical-ledger-write provider cloudflare-d1 lacks role transactional-write",
      "workloads.critical-ledger-write references unknown provider missing-provider",
    ]));
  });
});

describe("퇴역 Oracle 인프라와 checkout 정적 이미지 경로의 구분", () => {
  const image = "/apps/web/public/assets/virtual-studio/studio-art-v14/rooms/tarot-story-oracle-pavilion.webp";
  const conditional = (path) => `\${{ matrix.shard == 'studio-foundation' && '${path}' || '' }}`;
  const checkoutIssues = (sparse, step = {}) => validateFreeInfrastructureRepository(fixture({
    ".github/workflows/assets.yml": stringify({
      on: "push", jobs: { audit: { steps: [{ uses: "actions/checkout@v6", with: { "sparse-checkout": sparse }, ...step }] } },
    }),
  }));

  it.each([image, conditional(image)])("checkout의 정확한 이미지 경로에서 파일명만 인프라로 오인하지 않는다: %s", (sparse) => {
    expect(checkoutIssues(sparse)).toEqual([]);
  });

  it("같은 scalar 안의 다른 OCI 설정과 표현식 조건은 계속 탐지한다", () => {
    for (const sparse of [`${image}\n/deploy/oci/config`, conditional(image).replace("studio-foundation", "oracle")]) {
      expect(checkoutIssues(sparse)).toEqual([expect.stringContaining("retired Oracle infrastructure")]);
    }
  });

  it.each([
    "/apps/web/public/assets/../oracle.webp",
    "/apps/web/public/assets/rooms/./oracle.webp",
    "/apps/web/public/assets/rooms/oracle.webp.sh",
    "/apps/web/public/assets/rooms/oracle.webp?v=1",
    "/apps/web/public/assets/rooms/oracle.webp#preview",
    "/apps/web/public/assets/rooms/*oracle.webp",
    "/apps/web/public/assets/rooms\\oracle.webp",
    `${image} # 예외를 가장한 주석`,
    `${image}; echo hidden`,
    `\${{ inputs.asset || '${image}' }}`,
  ])("불완전한 경로·확장자·추가 명령과 임의 표현식에는 예외를 주지 않는다: %s", (sparse) => {
    expect(checkoutIssues(sparse)).toEqual([expect.stringContaining("retired Oracle infrastructure")]);
  });

  it.each([
    { uses: "vendor/checkout@v1" },
    { with: { path: image } },
    { run: "oci compute instance list" },
    { env: { CLOUD_PROVIDER: "oracle" } },
  ])("다른 action·입력·명령·환경변수의 Oracle 참조를 제외하지 않는다: %j", (step) => {
    expect(checkoutIssues(image, step)).toEqual([expect.stringContaining("retired Oracle infrastructure")]);
  });

  it.each([
    ["deploy/runtime.sh", "oci compute instance list"],
    ["docs/operations/origin.md", "Oracle Cloud Infrastructure 설정"],
    ["DEPLOY.md", "deploy/oci/bootstrap.sh"],
    [".github/workflows/image-command.yml", stringify({ on: "push", jobs: { audit: { steps: [{ run: `cat ${image}` }] } } })],
  ])("checkout 필드 밖의 실제 인프라 참조는 차단한다: %s", (path, source) => {
    expect(validateFreeInfrastructureRepository(fixture({ [path]: source }))).toEqual([
      expect.stringContaining("retired Oracle infrastructure"),
    ]);
  });
});

describe("CI production publisher policy", () => {
  const blocked = [
    ["Cloudflare", "pnpm run cloudflare:static:deploy"],
    ["Cloudflare", "pnpm cloudflare:static:deploy"],
    ["Cloudflare", "pnpm --filter web run release"],
    ["Cloudflare", "node ./scripts/deploy-cloudflare-static.mjs --production"],
    ["Cloudflare", "node ./scripts/deploy-cloudflare-static.mjs --production --help"],
    ["Cloudflare", "pnpm -w run release"],
    ["Cloudflare", "pnpm exec wrangler deploy --config deploy/cloudflare-static/wrangler.jsonc"],
    ["Cloudflare", "pnpm dlx wrangler@4 pages deploy dist"],
    ["Cloudflare", "npx --yes wrangler publish"],
    ["Cloudflare", "wrangler versions upload"],
    ["Cloudflare", "wrangler versions deploy"],
    ["Cloudflare", "wrangler deploy --dry-run=false"],
    ["Cloudflare", "wrangler deploy --dry-run false"],
    ["Cloudflare", "wrangler deploy --dry-run --no-dry-run"],
    ["Cloudflare", "pnpm run wrangler -- --dry-run=false"],
    ["Cloudflare", "wrangler deploy --dry-run && wrangler deploy"],
    ["Cloudflare", 'echo "--dry-run"; wrangler deploy'],
    ["Cloudflare", 'bash -ec "pnpm run release"'],
    ["Cloudflare", "if test x = x; then pnpm run release; fi"],
    ["Cloudflare", "env CI=true pnpm run release"],
    ["Vercel", "pnpm run release:vercel"],
    ["Vercel", "npx vercel --prod"],
    ["Vercel", "vercel deploy --prebuilt --prod"],
    ["Vercel", "vercel dist --prod"],
    ["Vercel", "vercel promote https://fixture.vercel.app"],
    ["Render", "pnpm run release:render"],
    ["Render", "curl https://api.render.com/deploy/srv-fixture?key=fixture"],
    ["Render", 'curl -fsS -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"'],
    ["Render", 'curl "$RENDER_DEPLOY_HOOK_URL"'],
    ["Render", "curl --request=POST https://api.render.com/v1/services/srv-fixture/deploys"],
    ["Render", "curl -XPOST https://api.render.com/v1/services/srv-fixture/deploys"],
    ["Render", 'curl -X POST "https://api.render.com/v1/services/${{ secrets.RENDER_SERVICE_ID }}/deploys"'],
    ["Render", "curl --json '{}' https://api.render.com/v1/services/srv-fixture/deploys"],
    ["Render", "wget --post-data='{}' https://api.render.com/v1/services/srv-fixture/deploys"],
    ["Render", "render deploys create srv-fixture --confirm"],
    ["Cloudflare", "node ./scripts/deploy-cloudflare-analytics.mjs --production"],
    ["Cloudflare", "node ./scripts/plan-creator-bundle-deploy.mjs --production"],
    ["Cloudflare", "node ./scripts/provision-cloudflare-free-data-plane.mjs --apply"],
    ["Onpod", "onpod app deploy --name toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:fixture"],
    ["Onpod", "onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:fixture"],
    ["Onpod", "onpod app rollback toonstudio-api"],
    ["Onpod", "onpod app env set toonstudio-api KEY=value"],
    ["Onpod", "onpod db rotate-password toonstudio-db"],
    ["Onpod", "onpod exec toonstudio-api -- sh -c 'id'"],
  ];

  for (const [label, trigger] of [
    ["push", { push: { branches: ["main"] } }],
    ["schedule", { schedule: [{ cron: "0 0 * * *" }] }],
    ["workflow_run", { workflow_run: { workflows: ["CI"], types: ["completed"] } }],
    ["manual without gates", { workflow_dispatch: {} }],
  ]) {
    it.each(blocked)(`${label} blocks %s publisher: %s`, (provider, command) => {
      expect(workflowIssues(command, trigger)).toEqual([
        expect.stringContaining(`CI production publisher is forbidden (${provider})`),
      ]);
    });
  }

  it.each([
    "pnpm run build", "pnpm run audit", "pnpm run cycle",
    "pnpm run cloudflare:static:dry-run", "node scripts/deploy-cloudflare-static.mjs",
    "node scripts/deploy-cloudflare-static.mjs --dry-run",
    "pnpm exec wrangler deploy --dry-run", "wrangler versions upload --dry-run=true",
    "wrangler pages deploy dist --dry-run", "pnpm run wrangler -- --dry-run",
    "wrangler deploy --help", "wrangler deployments list --name deploy",
    "git diff -- scripts/deploy-cloudflare-static.mjs --production",
    "vercel build --prod", "vercel inspect https://fixture.vercel.app",
    "vercel --scope fixture build --prod", "vercel inspect deploy",
    "render deploys logs srv-fixture",
    "onpod whoami",
    "onpod app ls",
    "onpod db ls",
    "node scripts/deploy-cloudflare-analytics.mjs --dry-run",
    "curl -H 'X-Audit: POST RENDER_DEPLOY_HOOK' https://api.render.com/v1/services/srv-fixture/deploys",
    "render deploys list srv-fixture", "curl -I https://core.example.test/api/health/live",
    "curl https://api.render.com/v1/services/srv-fixture/deploys",
    'echo "pnpm run cloudflare:static:deploy && wrangler deploy"',
    "printf '%s\\n' 'curl -X POST https://api.render.com/deploy/srv-fixture'",
    "# pnpm run cloudflare:static:deploy\npnpm run build # wrangler deploy",
    "cat <<'EXAMPLE'\nwrangler deploy\npnpm run release\nEXAMPLE\npnpm run build",
    "pnpm run build -- --example='wrangler deploy'",
  ])("allows build/audit/dry-run/prose: %s", (command) => {
    expect(workflowIssues(command)).toEqual([]);
  });

  it("does not grant manual publishers an exception even with approval and SHA metadata", () => {
    expect(workflowIssues("pnpm run release", "workflow_dispatch", {
      env: {
        TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL: "cloudflare-static-production",
        TOONSPECTRUM_APPROVED_MAIN_SHA: "a".repeat(40),
      },
    })).toEqual([expect.stringContaining("publisher is forbidden")]);
  });

  it("reads folded YAML, anchors and multiline shell continuations as executable commands", () => {
    const root = fixture({ ".github/workflows/release.yaml": `
on: [push, workflow_dispatch]
jobs:
  release:
    steps:
      - &publish
        run: >-
          pnpm run
          cloudflare:static:deploy
      - *publish
      - run: |
          pnpm exec wrangler \\
            deploy
` });
    expect(validateFreeInfrastructureRepository(root)).toHaveLength(3);
  });

  it("resolves step, job and workflow environment hook aliases without reading credentials", () => {
    expect(workflowIssues('curl "$HOOK"', "push", {}, {
      env: { HOOK: "https://api.render.com/deploy/srv-fixture?key=fixture" },
    })).toHaveLength(1);
    expect(workflowIssues('HOOK=https://api.render.com/deploy/srv-fixture\ncurl "$HOOK"')).toHaveLength(1);
    expect(workflowIssues('curl "${{ env.HOOK }}"', "push", {
      env: { HOOK: "${{ secrets.RENDER_DEPLOY_HOOK }}" },
    })).toHaveLength(1);
  });

  it("resolves package aliases in an explicit working directory", () => {
    const root = fixture({
      "tools/package.json": JSON.stringify({ scripts: { release: "wrangler deploy" } }),
      ".github/workflows/release.yml": stringify({ on: "push", jobs: { release: { steps: [
        { run: "pnpm run release", "working-directory": "tools" },
        { run: "pnpm -C tools run release" },
        { run: "pnpm --dir=tools run release" },
      ] } } }),
    });
    expect(validateFreeInfrastructureRepository(root)).toHaveLength(3);
  });

  it.each([
    ["cloudflare/wrangler-action@v3", {}, true],
    ["cloudflare/wrangler-action@v3", { command: "deploy --dry-run" }, false],
    ["cloudflare/wrangler-action@v3", { command: "deploy --dry-run\ndeploy" }, true],
    ["cloudflare/pages-action@v1", {}, true],
    ["amondnet/vercel-action@v25", {}, true],
    ["johnbeynon/render-deploy-action@v0.0.8", {}, true],
    ["actions/upload-artifact@v4", { name: "wrangler deploy", path: "dist" }, false],
  ])("classifies provider action %s %j", (uses, options, blocked) => {
    const issues = workflowIssues(undefined, "workflow_dispatch", { uses, with: options });
    expect(issues).toHaveLength(blocked ? 1 : 0);
  });

  it("ignores workflow descriptions and preserves current audit/artifact-only jobs", () => {
    const files = { "package.json": readFileSync(new URL("../package.json", import.meta.url), "utf8") };
    for (const file of ["production-readiness.yml", "api-runtime-release.yml"]) {
      files[`.github/workflows/${file}`] = readFileSync(new URL(`../.github/workflows/${file}`, import.meta.url), "utf8");
    }
    files[".github/workflows/prose.yml"] = stringify({
      name: "Never run wrangler deploy or vercel --prod",
      on: { workflow_dispatch: { inputs: { example: { description: "pnpm run release" } } } },
      jobs: { audit: { steps: [{ name: "Render deploy hook audit", run: "pnpm run audit" }] } },
    });
    expect(validateFreeInfrastructureRepository(fixture(files))).toEqual([]);
  });

  it("fails closed for invalid workflow YAML", () => {
    expect(validateFreeInfrastructureRepository(fixture({
      ".github/workflows/release.yml": "jobs: [unclosed",
    }))).toEqual([expect.stringContaining("cannot inspect release policy")]);
  });

  it("preserves retired infrastructure and policy gates", () => {
    const changed = clone(policy);
    changed.automaticDeployments = true;
    const issues = validateFreeInfrastructureRepository(fixture({
      "vercel.json": "{}",
      "config/free-infrastructure-policy.json": JSON.stringify(changed),
    }));
    expect(issues).toEqual(expect.arrayContaining([
      "retired infrastructure returned: vercel.json",
      expect.stringContaining("automaticDeployments must remain false"),
    ]));
  });
});
